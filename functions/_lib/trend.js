/* =========================================================
   KPI 추이 — /api/admin/trend?unit=day|week|month&n=30
   모든 사이트의 방문 · 검색 유입 · 문의 · 예약 이동 · 전화·카톡 클릭을
   일별 · 주별(월요일 시작) · 월별로 묶어 보낸다.
   - 마지막 기간(오늘 · 이번 주 · 이번 달)은 아직 진행 중이라,
     직전 기간의 '같은 시점까지' 값을 따로 계산해 공정하게 비교한다.
   - 기록을 시작하기 전 기간은 0 이 아니라 null (그래프에서 비워 둔다)
   - 운영 현황에서 '완료'로 바꾼 할 일을 날짜에 표시해, 한 일과 숫자 변화를 함께 본다
   ========================================================= */
import { json, kst } from './core.js';
import { ensureSeed } from './sites.js';
import { leadTimes } from './leads.js';
import { SELF_ID } from './sites-seed.js';

const DAY = 86400000;
const UNITS = {
  day: { opts: [14, 30, 90], def: 30 },
  week: { opts: [8, 12, 26], def: 12 },
  month: { opts: [6, 12], def: 12 }
};
const SEARCH = "('검색', 'AI 검색')";
const KEY_SQL = { day: 'day', week: "date(day, '-6 days', 'weekday 1')", month: 'substr(day, 1, 7)' };
const METRIC_KEYS = ['v', 'pv', 'se', 'inq', 'book', 'ct'];

const addDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const mondayOf = (day) => addDay(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));
const monthAdd = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
};
const keyOf = (unit, day) => (unit === 'day' ? day : unit === 'week' ? mondayOf(day) : day.slice(0, 7));
const startDay = (unit, key) => (unit === 'month' ? key + '-01' : key);
const endDay = (unit, key) => (unit === 'day' ? key : unit === 'week' ? addDay(key, 6) : addDay(monthAdd(key, 1) + '-01', -1));
const startMs = (day) => Date.parse(day + 'T00:00:00+09:00');

export async function trend(DB, env, request) {
  const u = new URL(request.url).searchParams;
  const unit = UNITS[u.get('unit')] ? u.get('unit') : 'day';
  const conf = UNITS[unit];
  const n = conf.opts.includes(Number(u.get('n'))) ? Number(u.get('n')) : conf.def;

  const now = Date.now();
  const today = kst(now).day;
  const keys = [];
  let k = keyOf(unit, today);
  for (let i = 0; i < n; i++) {
    keys.unshift(k);
    k = unit === 'day' ? addDay(k, -1) : unit === 'week' ? addDay(k, -7) : monthAdd(k, -1);
  }
  const idx = Object.fromEntries(keys.map((x, i) => [x, i]));
  const from = startDay(unit, keys[0]);

  /* 진행 중인 기간과 비교할 '직전 기간의 같은 시점' */
  const curStart = startMs(startDay(unit, keys[n - 1]));
  const prevStartDay = startDay(unit, keys[n - 2]);
  const prevCut = startMs(prevStartDay) + (now - curStart);
  const prevCutDay = kst(prevCut).day;
  const K = KEY_SQL[unit];

  await ensureSeed(DB);
  const stmts = [
    DB.prepare(`SELECT site, ${K} AS k, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v,
        COUNT(DISTINCT CASE WHEN new_s = 1 AND src IN ${SEARCH} THEN sid END) AS se
      FROM xpv WHERE day BETWEEN ? AND ? AND site != ? GROUP BY site, k`).bind(from, today, SELF_ID),                                  // 0
    DB.prepare(`SELECT site, ${K} AS k, COALESCE(SUM(CASE WHEN kind = 'book' THEN 1 ELSE 0 END), 0) AS book,
        COALESCE(SUM(CASE WHEN kind IN ('tel', 'kakao', 'mail') THEN 1 ELSE 0 END), 0) AS ct
      FROM xev WHERE day BETWEEN ? AND ? AND site != ? GROUP BY site, k`).bind(from, today, SELF_ID),                                  // 1
    DB.prepare(`SELECT ${K} AS k, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v,
        COUNT(DISTINCT CASE WHEN new_s = 1 AND src IN ${SEARCH} THEN sid END) AS se
      FROM pv WHERE day BETWEEN ? AND ? GROUP BY k`).bind(from, today),                                                               // 2
    DB.prepare(`SELECT ${K} AS k, COALESCE(SUM(CASE WHEN kind = 'book' THEN 1 ELSE 0 END), 0) AS book,
        COALESCE(SUM(CASE WHEN kind IN ('tel', 'kakao', 'mail') THEN 1 ELSE 0 END), 0) AS ct
      FROM ev WHERE day BETWEEN ? AND ? GROUP BY k`).bind(from, today),                                                               // 3
    DB.prepare("SELECT created_at FROM inquiries WHERE created_at >= ?1 UNION ALL SELECT created_at FROM partnerships WHERE created_at >= ?1 AND stage != '스팸·무관' UNION ALL SELECT created_at FROM vacancies WHERE created_at >= ?1 AND stage != '스팸·무관'")
      .bind(new Date(startMs(from)).toISOString()),                                                                                    // 4 문의 + 제휴 제안
    DB.prepare('SELECT site, MIN(day) AS d FROM xpv GROUP BY site'),                                                                    // 5
    DB.prepare('SELECT MIN(day) AS d FROM pv'),                                                                                         // 6
    DB.prepare(`SELECT site, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v,
        COUNT(DISTINCT CASE WHEN new_s = 1 AND src IN ${SEARCH} THEN sid END) AS se
      FROM xpv WHERE day BETWEEN ? AND ? AND ts <= ? AND site != ? GROUP BY site`).bind(prevStartDay, prevCutDay, prevCut, SELF_ID),   // 7
    DB.prepare(`SELECT site, COALESCE(SUM(CASE WHEN kind = 'book' THEN 1 ELSE 0 END), 0) AS book,
        COALESCE(SUM(CASE WHEN kind IN ('tel', 'kakao', 'mail') THEN 1 ELSE 0 END), 0) AS ct
      FROM xev WHERE day BETWEEN ? AND ? AND ts <= ? AND site != ? GROUP BY site`).bind(prevStartDay, prevCutDay, prevCut, SELF_ID),   // 8
    DB.prepare(`SELECT COUNT(*) AS pv, COUNT(DISTINCT vid) AS v,
        COUNT(DISTINCT CASE WHEN new_s = 1 AND src IN ${SEARCH} THEN sid END) AS se
      FROM pv WHERE day BETWEEN ? AND ? AND ts <= ?`).bind(prevStartDay, prevCutDay, prevCut),                                         // 9
    DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind = 'book' THEN 1 ELSE 0 END), 0) AS book,
        COALESCE(SUM(CASE WHEN kind IN ('tel', 'kakao', 'mail') THEN 1 ELSE 0 END), 0) AS ct
      FROM ev WHERE day BETWEEN ? AND ? AND ts <= ?`).bind(prevStartDay, prevCutDay, prevCut),                                         // 10
    DB.prepare('SELECT id, name, tier, cluster, stage, url FROM sites WHERE archived = 0 ORDER BY sort, name')                          // 11
  ];
  const res = await DB.batch(stmts);
  const rows = (i) => (res[i] && res[i].results) || [];

  /* 완료한 할 일 (표가 아직 없으면 건너뜀) */
  let tasks = [];
  try {
    tasks = (await DB.prepare("SELECT site, title, done_at FROM site_tasks WHERE status = '완료' AND done_at >= ? ORDER BY done_at")
      .bind(new Date(startMs(from)).toISOString()).all()).results || [];
  } catch (_) { tasks = []; }

  const leadsRes = await leadTimes(env, startMs(from)).catch(() => ({ items: [], seen: {} }));

  /* 사이트별 시리즈 */
  const sites = rows(11).map((s) => ({ ...s, first: '', hasInq: false, s: {}, prev: {} }));
  const byId = Object.fromEntries(sites.map((s) => [s.id, s]));
  sites.forEach((s) => METRIC_KEYS.forEach((m) => { s.s[m] = Array(n).fill(0); s.prev[m] = 0; }));
  const put = (site, key, vals) => {
    const s = byId[site];
    const i = idx[key];
    if (!s || i === undefined) return;
    Object.entries(vals).forEach(([m, v]) => { s.s[m][i] += Number(v) || 0; });
  };

  rows(0).forEach((r) => put(r.site, r.k, { v: r.v, pv: r.pv, se: r.se }));
  rows(1).forEach((r) => put(r.site, r.k, { book: r.book, ct: r.ct }));
  rows(2).forEach((r) => put(SELF_ID, r.k, { v: r.v, pv: r.pv, se: r.se }));
  rows(3).forEach((r) => put(SELF_ID, r.k, { book: r.book, ct: r.ct }));
  rows(5).forEach((r) => { if (byId[r.site] && r.site !== SELF_ID) byId[r.site].first = r.d || ''; });
  if (byId[SELF_ID]) byId[SELF_ID].first = (rows(6)[0] || {}).d || '';

  /* 직전 기간 같은 시점까지 */
  const putPrev = (site, vals) => {
    const s = byId[site];
    if (s) Object.entries(vals).forEach(([m, v]) => { s.prev[m] += Number(v) || 0; });
  };
  rows(7).forEach((r) => putPrev(r.site, { v: r.v, pv: r.pv, se: r.se }));
  rows(8).forEach((r) => putPrev(r.site, { book: r.book, ct: r.ct }));
  const sp = rows(9)[0] || {};
  const se = rows(10)[0] || {};
  putPrev(SELF_ID, { v: sp.v, pv: sp.pv, se: sp.se, book: se.book, ct: se.ct });

  /* 문의 — 각 사이트 저장소 + 대신 받은 문의 + 이 홈페이지 문의 */
  const addLead = (site, ms) => {
    const s = byId[site];
    if (!s || !ms) return;
    const day = kst(ms).day;
    const i = idx[keyOf(unit, day)];
    if (i !== undefined) s.s.inq[i] += 1;
    if (ms >= startMs(prevStartDay) && ms <= prevCut) s.prev.inq += 1;
  };
  Object.keys(leadsRes.seen).forEach((site) => { if (byId[site]) byId[site].hasInq = true; });
  leadsRes.items.forEach((x) => addLead(x.site, x.ms));
  if (byId[SELF_ID]) {
    byId[SELF_ID].hasInq = true;
    rows(4).forEach((r) => addLead(SELF_ID, Date.parse(r.created_at)));
  }

  /* 기록 전 기간은 null */
  const visitKeys = ['v', 'pv', 'se', 'book', 'ct'];
  sites.forEach((s) => {
    keys.forEach((key, i) => {
      if (!s.first || endDay(unit, key) < s.first) visitKeys.forEach((m) => { s.s[m][i] = null; });
      if (!s.hasInq) s.s.inq[i] = null;
    });
  });

  const marks = tasks.map((t) => {
    const day = kst(Date.parse(t.done_at)).day;
    return { site: t.site, day, k: keyOf(unit, day), title: t.title };
  }).filter((m) => idx[m.k] !== undefined && byId[m.site]);

  const firstDays = sites.map((s) => s.first).filter(Boolean).sort();
  return json({
    ok: true,
    unit, n, opts: conf.opts, keys, today, now,
    curStart: startDay(unit, keys[n - 1]),
    prevCutAt: prevCut,
    firstDay: firstDays[0] || '',
    self: SELF_ID,
    sites: sites.map(({ id, name, tier, cluster, stage, url, first, hasInq, s, prev }) => ({ id, name, tier, cluster, stage, url, first, hasInq, s, prev })),
    marks
  });
}
