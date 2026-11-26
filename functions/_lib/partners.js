/* =========================================================
   관리자 — 제휴·협업
   GET    /api/admin/partners                 목록 · 단계별 수 · 지표 · 공개 제안
   GET    /api/admin/partners/:id             상세 + 기록
   PATCH  /api/admin/partners/:id             단계 · 우선순위 · 다음 할 일 · 예상 규모 · 메모
   POST   /api/admin/partners/:id/log         기록 남기기 (통화 · 미팅 메모)
   POST   /api/admin/partner-calls            공개 제안 추가
   PATCH  /api/admin/partner-calls/:id        공개 제안 수정 · 공개/숨김
   DELETE /api/admin/partner-calls/:id        공개 제안 삭제
   ========================================================= */
import { json, fail, readJson, clean, nowIso, PARTNER_KINDS, PARTNER_STAGES, PARTNER_OPEN } from './core.js';

const PRIORITIES = ['높음', '보통', '낮음'];
const DAY = 86400000;
const kstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function partnersRoute(DB, request, method, parts) {
  const id = Number(parts[1] || 0);
  if (!id && method === 'GET') return list(DB);
  if (id && method === 'GET' && !parts[2]) return detail(DB, id);
  if (id && method === 'PATCH' && !parts[2]) return update(DB, request, id);
  if (id && method === 'POST' && parts[2] === 'log') return addLog(DB, request, id);
  return fail('지원하지 않는 요청입니다.', 404);
}

export async function callsRoute(DB, request, method, parts) {
  const id = Number(parts[1] || 0);
  if (!id && method === 'POST') return saveCall(DB, request, 0);
  if (id && method === 'PATCH') return saveCall(DB, request, id);
  if (id && method === 'DELETE') {
    await DB.prepare('DELETE FROM partner_calls WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return fail('지원하지 않는 요청입니다.', 404);
}

async function list(DB) {
  const [items, calls, logs] = await DB.batch([
    DB.prepare(`SELECT id, created_at, updated_at, kind, company, name, role, phone, email, brands, message, budget, timing, link,
                       call_id, stage, priority, next_at, next_note, value, memo, replied_at, closed_at
                FROM partnerships ORDER BY created_at DESC LIMIT 500`),
    DB.prepare('SELECT * FROM partner_calls ORDER BY sort, id DESC'),
    DB.prepare('SELECT partnership_id AS id, MAX(at) AS at FROM partnership_log GROUP BY partnership_id')
  ]);
  const rows = items.results || [];
  const lastLog = Object.fromEntries((logs.results || []).map((r) => [r.id, r.at]));
  const now = Date.now();
  const today = kstDay(now);
  const month = today.slice(0, 7);
  const byStage = Object.fromEntries(PARTNER_STAGES.map((s) => [s, 0]));
  let thisMonth = 0;
  let won = 0;
  let wonMonth = 0;
  let overdue = 0;
  const replyDays = [];
  rows.forEach((r) => {
    byStage[r.stage] = (byStage[r.stage] || 0) + 1;
    if (kstDay(Date.parse(r.created_at)).slice(0, 7) === month) thisMonth += 1;
    if (r.stage === '진행 확정') { won += 1; if (r.closed_at && kstDay(Date.parse(r.closed_at)).slice(0, 7) === month) wonMonth += 1; }
    if (PARTNER_OPEN.includes(r.stage) && r.next_at && r.next_at < today) overdue += 1;
    if (r.replied_at) replyDays.push((Date.parse(r.replied_at) - Date.parse(r.created_at)) / DAY);
    r.waiting_days = r.stage === '접수' ? Math.floor((now - Date.parse(r.created_at)) / DAY) : null;
    r.last_log = lastLog[r.id] || '';
  });
  const open = PARTNER_OPEN.reduce((a, s) => a + (byStage[s] || 0), 0);
  const avgReply = replyDays.length ? Math.round((replyDays.reduce((a, b) => a + b, 0) / replyDays.length) * 10) / 10 : null;
  const decided = won + (byStage['종료'] || 0);
  return json({
    ok: true, today, kinds: PARTNER_KINDS, stages: PARTNER_STAGES, openStages: PARTNER_OPEN, priorities: PRIORITIES,
    stats: { total: rows.length, fresh: byStage['접수'] || 0, open, thisMonth, won, wonMonth, overdue, avgReply, winRate: decided ? won / decided : null },
    byStage, items: rows, calls: calls.results || []
  });
}

async function detail(DB, id) {
  const row = await DB.prepare('SELECT * FROM partnerships WHERE id = ?').bind(id).first();
  if (!row) return fail('제안을 찾지 못했습니다.', 404);
  const log = (await DB.prepare('SELECT id, at, kind, text FROM partnership_log WHERE partnership_id = ? ORDER BY at DESC, id DESC LIMIT 100').bind(id).all()).results || [];
  delete row.ip_hash;
  return json({ ok: true, item: row, log });
}

async function update(DB, request, id) {
  const cur = await DB.prepare('SELECT * FROM partnerships WHERE id = ?').bind(id).first();
  if (!cur) return fail('제안을 찾지 못했습니다.', 404);
  const b = await readJson(request, 20_000);
  const now = nowIso();
  const next = {
    stage: b.stage !== undefined ? (PARTNER_STAGES.includes(b.stage) ? b.stage : cur.stage) : cur.stage,
    priority: b.priority !== undefined ? (PRIORITIES.includes(b.priority) ? b.priority : cur.priority) : cur.priority,
    next_at: b.next_at !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(b.next_at) ? b.next_at : '') : cur.next_at,
    next_note: b.next_note !== undefined ? clean(b.next_note, 200) : cur.next_note,
    value: b.value !== undefined ? clean(b.value, 80) : cur.value,
    memo: b.memo !== undefined ? clean(b.memo, 4000) : cur.memo,
    kind: b.kind !== undefined && PARTNER_KINDS.includes(b.kind) ? b.kind : cur.kind
  };
  let repliedAt = cur.replied_at;
  let closedAt = cur.closed_at;
  const logs = [];
  if (next.stage !== cur.stage) {
    logs.push(`단계: ${cur.stage} → ${next.stage}`);
    if (!repliedAt && cur.stage === '접수' && next.stage !== '스팸·무관') repliedAt = now;
    if (['진행 확정', '종료'].includes(next.stage)) closedAt = now;
    else if (PARTNER_OPEN.includes(next.stage)) closedAt = null;
  }
  if (b.replied === true && !repliedAt) { repliedAt = now; logs.push('회신함'); }
  if (next.next_at !== cur.next_at || next.next_note !== cur.next_note) {
    if (next.next_at || next.next_note) logs.push(`다음 할 일: ${next.next_at || '날짜 없음'} ${next.next_note}`.trim());
  }
  if (next.value !== cur.value && next.value) logs.push(`예상 규모: ${next.value}`);
  const stmts = [DB.prepare(
    `UPDATE partnerships SET stage = ?, priority = ?, next_at = ?, next_note = ?, value = ?, memo = ?, kind = ?, replied_at = ?, closed_at = ?, updated_at = ? WHERE id = ?`
  ).bind(next.stage, next.priority, next.next_at, next.next_note, next.value, next.memo, next.kind, repliedAt, closedAt, now, id)];
  logs.forEach((t) => stmts.push(DB.prepare("INSERT INTO partnership_log (partnership_id, at, kind, text) VALUES (?, ?, 'stage', ?)").bind(id, now, t)));
  await DB.batch(stmts);
  return detail(DB, id);
}

async function addLog(DB, request, id) {
  const b = await readJson(request, 10_000);
  const text = clean(b.text, 2000);
  if (!text) return fail('남길 내용을 적어 주세요.');
  const kind = ['memo', 'call', 'meeting', 'mail'].includes(b.kind) ? b.kind : 'memo';
  const now = nowIso();
  await DB.batch([
    DB.prepare('INSERT INTO partnership_log (partnership_id, at, kind, text) VALUES (?, ?, ?, ?)').bind(id, now, kind, text),
    DB.prepare('UPDATE partnerships SET updated_at = ? WHERE id = ?').bind(now, id)
  ]);
  return detail(DB, id);
}

async function saveCall(DB, request, id) {
  const b = await readJson(request, 20_000);
  const now = nowIso();
  const v = {
    kind: PARTNER_KINDS.includes(b.kind) ? b.kind : '기타 제휴',
    title: clean(b.title, 80),
    who: clean(b.who, 120),
    summary: clean(b.summary, 600),
    offer: clean(b.offer, 400),
    closes_at: /^\d{4}-\d{2}-\d{2}$/.test(b.closes_at || '') ? b.closes_at : '',
    visible: b.visible === false || b.visible === 0 ? 0 : 1,
    sort: Number.isFinite(Number(b.sort)) ? Math.round(Number(b.sort)) : 0
  };
  if (!v.title) return fail('제목을 적어 주세요.');
  if (id) {
    await DB.prepare('UPDATE partner_calls SET kind = ?, title = ?, who = ?, summary = ?, offer = ?, closes_at = ?, visible = ?, sort = ?, updated_at = ? WHERE id = ?')
      .bind(v.kind, v.title, v.who, v.summary, v.offer, v.closes_at, v.visible, v.sort, now, id).run();
  } else {
    await DB.prepare('INSERT INTO partner_calls (created_at, updated_at, kind, title, who, summary, offer, closes_at, visible, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(now, now, v.kind, v.title, v.who, v.summary, v.offer, v.closes_at, v.visible, v.sort).run();
  }
  return json({ ok: true });
}
