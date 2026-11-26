/* =========================================================
   관리자 — 공실 등록
   GET    /api/admin/vacancies             목록 · 단계별 수 · 지표 · 지역·층 분포
   GET    /api/admin/vacancies/:id         상세 + 기록
   PATCH  /api/admin/vacancies/:id         단계 · 우선순위 · 적합도 · 연결 사업 · 예상 구조 · 다음 할 일 · 메모
   POST   /api/admin/vacancies/:id/log     기록 남기기 (통화 · 현장 확인 · 메모)
   ========================================================= */
import { json, fail, readJson, clean, nowIso, VAC } from './core.js';

const PRIORITIES = ['높음', '보통', '낮음'];
const DAY = 86400000;
const kstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function vacanciesRoute(DB, request, method, parts) {
  const id = Number(parts[1] || 0);
  if (!id && method === 'GET') return list(DB);
  if (id && method === 'GET' && !parts[2]) return detail(DB, id);
  if (id && method === 'PATCH' && !parts[2]) return update(DB, request, id);
  if (id && method === 'POST' && parts[2] === 'log') return addLog(DB, request, id);
  return fail('지원하지 않는 요청입니다.', 404);
}

async function list(DB) {
  const [items, logs] = await DB.batch([
    DB.prepare(`SELECT id, created_at, updated_at, role, sido, sigungu, dong, floors, floor_note, area, area_unit, area_py, vacant_for, state,
                       deposit, rent, mgmt, features, wants, link, note, name, org, phone, email, contact_time, page,
                       stage, priority, fit, assign, structure, next_at, next_note, memo, replied_at, closed_at
                FROM vacancies ORDER BY created_at DESC LIMIT 1000`),
    DB.prepare('SELECT vacancy_id AS id, MAX(at) AS at FROM vacancy_log GROUP BY vacancy_id')
  ]);
  const rows = items.results || [];
  const lastLog = Object.fromEntries((logs.results || []).map((r) => [r.id, r.at]));
  const now = Date.now();
  const today = kstDay(now);
  const month = today.slice(0, 7);
  const byStage = Object.fromEntries(VAC.stages.map((s) => [s, 0]));
  const bySido = {};
  const byFloor = {};
  let thisMonth = 0, won = 0, wonMonth = 0, overdue = 0, areaSum = 0, areaN = 0;
  const replyDays = [];
  rows.forEach((r) => {
    byStage[r.stage] = (byStage[r.stage] || 0) + 1;
    const live = r.stage !== '스팸·무관';
    if (live) {
      bySido[r.sido] = (bySido[r.sido] || 0) + 1;
      String(r.floors || '').split(', ').filter(Boolean).forEach((f) => { byFloor[f] = (byFloor[f] || 0) + 1; });
      if (r.area_py) { areaSum += r.area_py; areaN += 1; }
      if (kstDay(Date.parse(r.created_at)).slice(0, 7) === month) thisMonth += 1;
    }
    if (r.stage === '진행 확정') { won += 1; if (r.closed_at && kstDay(Date.parse(r.closed_at)).slice(0, 7) === month) wonMonth += 1; }
    if (VAC.open.includes(r.stage) && r.next_at && r.next_at < today) overdue += 1;
    if (r.replied_at) replyDays.push((Date.parse(r.replied_at) - Date.parse(r.created_at)) / DAY);
    r.waiting_days = r.stage === '접수' ? Math.floor((now - Date.parse(r.created_at)) / DAY) : null;
    r.last_log = lastLog[r.id] || '';
  });
  const open = VAC.open.reduce((a, s) => a + (byStage[s] || 0), 0);
  const decided = won + (byStage['종료'] || 0);
  return json({
    ok: true, today, opts: { ...VAC, priorities: PRIORITIES },
    stats: {
      total: rows.length, fresh: byStage['접수'] || 0, open, thisMonth, won, wonMonth, overdue,
      avgReply: replyDays.length ? Math.round((replyDays.reduce((a, b) => a + b, 0) / replyDays.length) * 10) / 10 : null,
      winRate: decided ? won / decided : null,
      avgPy: areaN ? Math.round(areaSum / areaN) : null
    },
    byStage, bySido, byFloor, items: rows
  });
}

async function detail(DB, id) {
  const row = await DB.prepare('SELECT * FROM vacancies WHERE id = ?').bind(id).first();
  if (!row) return fail('등록 내용을 찾지 못했습니다.', 404);
  const log = (await DB.prepare('SELECT id, at, kind, text FROM vacancy_log WHERE vacancy_id = ? ORDER BY at DESC, id DESC LIMIT 100').bind(id).all()).results || [];
  delete row.ip_hash;
  return json({ ok: true, item: row, log });
}

async function update(DB, request, id) {
  const cur = await DB.prepare('SELECT * FROM vacancies WHERE id = ?').bind(id).first();
  if (!cur) return fail('등록 내용을 찾지 못했습니다.', 404);
  const b = await readJson(request, 20_000);
  const now = nowIso();
  const keep = (key, list) => (b[key] !== undefined && (list ? list.includes(b[key]) || b[key] === '' : true) ? b[key] : cur[key]);
  const next = {
    stage: b.stage !== undefined && VAC.stages.includes(b.stage) ? b.stage : cur.stage,
    priority: b.priority !== undefined && PRIORITIES.includes(b.priority) ? b.priority : cur.priority,
    fit: b.fit !== undefined && VAC.fits.includes(b.fit) ? b.fit : cur.fit,
    assign: keep('assign', VAC.assigns),
    structure: keep('structure', VAC.structures),
    next_at: b.next_at !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(b.next_at) ? b.next_at : '') : cur.next_at,
    next_note: b.next_note !== undefined ? clean(b.next_note, 200) : cur.next_note,
    memo: b.memo !== undefined ? clean(b.memo, 4000) : cur.memo
  };
  let repliedAt = cur.replied_at;
  let closedAt = cur.closed_at;
  const logs = [];
  if (next.stage !== cur.stage) {
    logs.push(`단계: ${cur.stage} → ${next.stage}`);
    if (!repliedAt && cur.stage === '접수' && next.stage !== '스팸·무관') repliedAt = now;
    if (['진행 확정', '종료'].includes(next.stage)) closedAt = now;
    else if (VAC.open.includes(next.stage)) closedAt = null;
  }
  if (b.replied === true && !repliedAt) { repliedAt = now; logs.push('회신함'); }
  if (next.fit !== cur.fit) logs.push(`적합도: ${next.fit}`);
  if (next.assign !== cur.assign && next.assign) logs.push(`연결 사업: ${next.assign}`);
  if (next.structure !== cur.structure && next.structure) logs.push(`예상 구조: ${next.structure}`);
  if ((next.next_at !== cur.next_at || next.next_note !== cur.next_note) && (next.next_at || next.next_note)) {
    logs.push(`다음 할 일: ${next.next_at || '날짜 없음'} ${next.next_note}`.trim());
  }
  const stmts = [DB.prepare(
    `UPDATE vacancies SET stage = ?, priority = ?, fit = ?, assign = ?, structure = ?, next_at = ?, next_note = ?, memo = ?, replied_at = ?, closed_at = ?, updated_at = ? WHERE id = ?`
  ).bind(next.stage, next.priority, next.fit, next.assign, next.structure, next.next_at, next.next_note, next.memo, repliedAt, closedAt, now, id)];
  logs.forEach((t) => stmts.push(DB.prepare("INSERT INTO vacancy_log (vacancy_id, at, kind, text) VALUES (?, ?, 'stage', ?)").bind(id, now, t)));
  await DB.batch(stmts);
  return detail(DB, id);
}

async function addLog(DB, request, id) {
  const b = await readJson(request, 10_000);
  const text = clean(b.text, 2000);
  if (!text) return fail('남길 내용을 적어 주세요.');
  const kind = ['memo', 'call', 'visit', 'mail'].includes(b.kind) ? b.kind : 'memo';
  const now = nowIso();
  await DB.batch([
    DB.prepare('INSERT INTO vacancy_log (vacancy_id, at, kind, text) VALUES (?, ?, ?, ?)').bind(id, now, kind, text),
    DB.prepare('UPDATE vacancies SET updated_at = ? WHERE id = ?').bind(now, id)
  ]);
  return detail(DB, id);
}
