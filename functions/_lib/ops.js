/* =========================================================
   관리자 '운영 현황' — 홈페이지 관리목록 · 현황 · 단계 · 운영 상태 · 특이사항 · 할 일을 한 화면에
   /api/admin/ops            GET   사이트 현황 + 할 일 전체
   /api/admin/ops/tasks      POST  할 일 추가
   /api/admin/ops/tasks/:id  PATCH 고치기 · DELETE 지우기
   - 사이트의 운영 현황·특이사항·문의 받는 방식은 '전체 사이트'와 같은 sites 표에 있고 PATCH /api/admin/sites/:id 로 고친다
   - 기본값(ops-seed.js)은 처음 한 번만 넣는다. 이후에는 이 화면에서 고친 내용이 기준
   ========================================================= */
import { json, fail, readJson, clean, nowIso, kst } from './core.js';
import { ensureSeed } from './sites.js';
import { SELF_ID, STAGES } from './sites-seed.js';
import { OPS_STATES, TASK_KINDS, TASK_OWNERS, TASK_STATUS, SEED_DONE_AT, SITE_OPS, TASK_SEED } from './ops-seed.js';

const FLAG = 'ops_seed_20261119';
let seeded = false;

/** 운영 현황 기본값을 한 번만 넣는다 (빈 칸만 채움) */
export async function ensureOps(DB) {
  if (seeded) return;
  await ensureSeed(DB);
  const done = await DB.prepare('SELECT v FROM admin_flags WHERE k = ?').bind(FLAG).first();
  if (!done) {
    const now = nowIso();
    const stmts = [];
    for (const [id, o] of Object.entries(SITE_OPS)) {
      stmts.push(DB.prepare(`UPDATE sites SET
          ops = CASE WHEN ops = '' THEN ? ELSE ops END,
          note = CASE WHEN note = '' THEN ? ELSE note END,
          inquiry_via = CASE WHEN inquiry_via = '' THEN ? ELSE inquiry_via END
        WHERE id = ?`).bind(o.ops, o.note, o.inquiry_via, id));
    }
    /* 11/19 메모에 임시로 적어 두었던 할 일 목록은 이제 '할 일'로 옮겨졌으므로 비운다 (그 형식 그대로일 때만) */
    stmts.push(DB.prepare("UPDATE sites SET memo = '' WHERE memo LIKE '[문의] %'"));
    const have = await DB.prepare('SELECT COUNT(*) AS n FROM site_tasks').first();
    if (!have || !have.n) {
      TASK_SEED.forEach(([site, kind, title, owner, status], i) => {
        stmts.push(DB.prepare('INSERT INTO site_tasks (site, kind, title, owner, status, sort, created_at, updated_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(site, kind, title, owner, status, (i + 1) * 10, SEED_DONE_AT, now, status === '완료' ? SEED_DONE_AT : null));
      });
    }
    stmts.push(DB.prepare('INSERT OR REPLACE INTO admin_flags (k, v, at) VALUES (?, ?, ?)').bind(FLAG, '1', now));
    for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
  }
  seeded = true;
}

export async function opsRoute(DB, env, request, parts, method) {
  await ensureOps(DB);
  if (parts.length === 1 && method === 'GET') return board(DB);
  if (parts[1] === 'tasks') {
    if (parts.length === 2 && method === 'POST') return createTask(DB, request);
    const id = Number(parts[2]);
    if (!Number.isInteger(id) || id <= 0) return fail('잘못된 번호입니다.');
    if (method === 'PATCH') return updateTask(DB, request, id);
    if (method === 'DELETE') {
      const r = await DB.prepare('DELETE FROM site_tasks WHERE id = ?').bind(id).run();
      if (!r.meta || !r.meta.changes) return fail('할 일을 찾지 못했습니다.', 404);
      return json({ ok: true });
    }
  }
  return fail('없는 기능입니다.', 404);
}

async function board(DB) {
  const sites = ((await DB.prepare(`SELECT id, sort, tier, cluster, name, url, domain, alt, repo, priv, cf_kind, cf_project, storage, entity, stage,
      summary, model, memo, ops, note, inquiry_via, naver, google, bing, pages, kpis, chk_at, chk_code, chk_ms, chk_note, gh_pushed, archived, updated_at
    FROM sites WHERE archived = 0 ORDER BY sort, name`).all()).results || []);
  const d7 = kst(Date.now() - 6 * 86400 * 1000).day;
  const d30 = kst(Date.now() - 29 * 86400 * 1000).day;
  const tr = (await DB.prepare(`SELECT site, MAX(day) AS last, SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS pv7, COUNT(*) AS pv30,
      COUNT(DISTINCT CASE WHEN day >= ? THEN vid END) AS v7 FROM xpv WHERE day >= ? GROUP BY site`).bind(d7, d7, d30).all()).results || [];
  const tracking = Object.fromEntries(tr.map((r) => [r.site, { last: r.last, pv7: r.pv7, pv30: r.pv30, v7: r.v7 }]));
  const self = await DB.prepare(`SELECT MAX(day) AS last, SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS pv7, COUNT(*) AS pv30,
      COUNT(DISTINCT CASE WHEN day >= ? THEN vid END) AS v7 FROM pv WHERE day >= ?`).bind(d7, d7, d30).first().catch(() => null);
  if (self && self.last) tracking[SELF_ID] = self;
  const ev = (await DB.prepare(`SELECT site, kind, COUNT(*) AS n FROM xev WHERE day >= ? GROUP BY site, kind`).bind(d30).all().catch(() => null)) || {};
  const clicks = {};
  (ev.results || []).forEach((r) => { (clicks[r.site] || (clicks[r.site] = {}))[r.kind] = r.n; });
  const tasks = (await DB.prepare('SELECT * FROM site_tasks ORDER BY CASE status WHEN \'완료\' THEN 1 ELSE 0 END, sort, id').all()).results || [];
  return json({
    ok: true, now: Date.now(), self: SELF_ID, sites, tracking, clicks, tasks,
    meta: { stages: STAGES, opsStates: OPS_STATES, kinds: TASK_KINDS, owners: TASK_OWNERS, statuses: TASK_STATUS, d7, d30 }
  });
}

function taskFields(body, isNew) {
  const out = {};
  if (body.site !== undefined) {
    const s = clean(body.site, 48);
    if (s !== '*' && !/^[a-z0-9][a-z0-9-]{0,47}$/.test(s)) return { error: '사이트를 골라 주세요.' };
    out.site = s;
  }
  if (body.title !== undefined) out.title = clean(body.title, 300);
  if (body.note !== undefined) out.note = clean(body.note, 2000);
  if (body.due !== undefined) { const d = clean(body.due, 10); out.due = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; }
  if (body.kind !== undefined) out.kind = TASK_KINDS.includes(body.kind) ? body.kind : TASK_KINDS[0];
  if (body.owner !== undefined) out.owner = TASK_OWNERS.includes(body.owner) ? body.owner : TASK_OWNERS[0];
  if (body.status !== undefined) out.status = TASK_STATUS.includes(body.status) ? body.status : TASK_STATUS[0];
  if (isNew && !out.site) return { error: '사이트를 골라 주세요.' };
  if ((isNew || out.title !== undefined) && !out.title) return { error: '할 일을 적어 주세요.' };
  return { fields: out };
}

async function createTask(DB, request) {
  const r = taskFields(await readJson(request, 10_000), true);
  if (r.error) return fail(r.error);
  const f = { kind: TASK_KINDS[0], owner: TASK_OWNERS[0], status: TASK_STATUS[0], due: '', note: '', ...r.fields };
  const max = await DB.prepare('SELECT MAX(sort) AS m FROM site_tasks').first();
  const now = nowIso();
  const res = await DB.prepare('INSERT INTO site_tasks (site, kind, title, owner, status, due, note, sort, created_at, updated_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(f.site, f.kind, f.title, f.owner, f.status, f.due, f.note, ((max && max.m) || 0) + 10, now, now, f.status === '완료' ? now : null).run();
  const id = res.meta && res.meta.last_row_id;
  return json({ ok: true, task: await DB.prepare('SELECT * FROM site_tasks WHERE id = ?').bind(id).first() });
}

async function updateTask(DB, request, id) {
  const r = taskFields(await readJson(request, 10_000), false);
  if (r.error) return fail(r.error);
  const f = r.fields;
  const cols = Object.keys(f);
  if (!cols.length) return fail('바꿀 내용이 없습니다.');
  const now = nowIso();
  let doneSql = '';
  if (f.status !== undefined) doneSql = f.status === '완료' ? ', done_at = COALESCE(done_at, ?)' : ', done_at = NULL';
  const args = [...cols.map((c) => f[c]), now];
  if (f.status === '완료') args.push(now);
  const res = await DB.prepare(`UPDATE site_tasks SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = ?${doneSql} WHERE id = ?`).bind(...args, id).run();
  if (!res.meta || !res.meta.changes) return fail('할 일을 찾지 못했습니다.', 404);
  return json({ ok: true, task: await DB.prepare('SELECT * FROM site_tasks WHERE id = ?').bind(id).first() });
}
