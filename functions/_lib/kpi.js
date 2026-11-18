/* =========================================================
   관리자 KPI — /api/admin/kpi?range=today|yesterday|7|30|90|month
   방문(pv) · 클릭(ev) · 문의 · 회원 · 커뮤니티를 한 번에 모아 보낸다
   - 같은 길이의 직전 기간과 비교
   - 무거운 집계는 D1 안에서 GROUP BY 로 처리 (Worker CPU 시간을 아끼려고)
   ========================================================= */
import { json, fail, kst } from './core.js';

const DAY = 86400 * 1000;
const addDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY) + 1;
const isoStart = (day) => new Date(day + 'T00:00:00+09:00').toISOString();

function rangeOf(key) {
  const today = kst().day;
  let from = today;
  let to = today;
  if (key === 'yesterday') { from = to = addDay(today, -1); }
  else if (key === 'month') { from = today.slice(0, 8) + '01'; }
  else if (['7', '30', '90'].includes(key)) { from = addDay(today, -(Number(key) - 1)); }
  else key = 'today';
  const days = daysBetween(from, to);
  const prevTo = addDay(from, -1);
  const prevFrom = addDay(prevTo, -(days - 1));
  return { key, from, to, days, prevFrom, prevTo };
}

/* 한 기간의 핵심 숫자 */
function summaryStmts(DB, from, to) {
  const a = isoStart(from);
  const b = isoStart(addDay(to, 1));
  return [
    DB.prepare(`SELECT COUNT(*) AS pv, COUNT(DISTINCT vid) AS v, COUNT(DISTINCT sid) AS s,
        COALESCE(SUM(dur), 0) AS dsum, COALESCE(SUM(CASE WHEN dur > 0 THEN 1 ELSE 0 END), 0) AS dn,
        COUNT(DISTINCT CASE WHEN new_v = 1 THEN vid END) AS nv,
        COUNT(DISTINCT CASE WHEN member = 1 THEN vid END) AS mv
      FROM pv WHERE day BETWEEN ? AND ?`).bind(from, to),
    DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN c >= 2 OR d >= 10000 THEN 1 ELSE 0 END), 0) AS e
      FROM (SELECT sid, COUNT(*) AS c, SUM(dur) AS d FROM pv WHERE day BETWEEN ? AND ? GROUP BY sid)`).bind(from, to),
    DB.prepare(`SELECT COALESCE(SUM(CASE WHEN kind != 'conv' THEN 1 ELSE 0 END), 0) AS clicks,
        COALESCE(SUM(CASE WHEN kind = 'conv' THEN 1 ELSE 0 END), 0) AS conv
      FROM ev WHERE day BETWEEN ? AND ?`).bind(from, to),
    DB.prepare('SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ?').bind(a, b),
    DB.prepare('SELECT COUNT(*) AS n FROM members WHERE created_at >= ? AND created_at < ?').bind(a, b)
  ];
}
function summaryOf(res) {
  const [s, e, c, i, m] = res.map((r) => (r.results && r.results[0]) || {});
  return {
    pv: s.pv || 0, v: s.v || 0, s: s.s || 0, dsum: s.dsum || 0, dn: s.dn || 0, nv: s.nv || 0, mv: s.mv || 0,
    sessions: e.n || 0, engaged: e.e || 0,
    clicks: c.clicks || 0, conv: c.conv || 0,
    inq: i.n || 0, signups: m.n || 0
  };
}

const top = (map, n) => Object.entries(map).map(([k, v]) => ({ k, n: v })).sort((x, y) => y.n - x.n).slice(0, n);
const add = (map, k, n) => { map[k] = (map[k] || 0) + n; };

export async function kpi(DB, request) {
  const R = rangeOf(new URL(request.url).searchParams.get('range') || '7');
  const { from, to } = R;
  const a = isoStart(from);
  const b = isoStart(addDay(to, 1));
  const now = Date.now();

  const stmts = [
    ...summaryStmts(DB, from, to),                                                       // 0-4
    ...summaryStmts(DB, R.prevFrom, R.prevTo),                                           // 5-9
    DB.prepare('SELECT day, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v, COUNT(DISTINCT sid) AS s FROM pv WHERE day BETWEEN ? AND ? GROUP BY day').bind(from, to), // 10
    DB.prepare('SELECT day, hour, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v FROM pv WHERE day BETWEEN ? AND ? GROUP BY day, hour').bind(from, to),             // 11
    DB.prepare(`SELECT path, MAX(title) AS title, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v,
        CAST(AVG(CASE WHEN dur > 0 THEN dur END) AS INTEGER) AS ad,
        CAST(AVG(CASE WHEN scroll > 0 THEN scroll END) AS INTEGER) AS sc,
        SUM(new_s) AS en, SUM(CASE WHEN scroll >= 90 THEN 1 ELSE 0 END) AS done
      FROM pv WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY pv DESC LIMIT 300`).bind(from, to),                                                       // 12
    DB.prepare('SELECT src, srcd, utm, COUNT(*) AS n FROM pv WHERE day BETWEEN ? AND ? AND new_s = 1 GROUP BY src, srcd, utm').bind(from, to),               // 13
    DB.prepare(`SELECT dev, br, os, country, region, COUNT(DISTINCT sid) AS n FROM pv WHERE day BETWEEN ? AND ?
      GROUP BY dev, br, os, country, region`).bind(from, to),                                                                                              // 14
    DB.prepare('SELECT kind, label, target, COUNT(*) AS n, COUNT(DISTINCT vid) AS v FROM ev WHERE day BETWEEN ? AND ? GROUP BY kind, label, target').bind(from, to), // 15
    DB.prepare("SELECT substr(datetime(created_at, '+9 hours'), 1, 10) AS d, COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ? GROUP BY d").bind(a, b), // 16
    DB.prepare("SELECT substr(datetime(created_at, '+9 hours'), 1, 10) AS d, COUNT(*) AS n FROM members WHERE created_at >= ? AND created_at < ? GROUP BY d").bind(a, b),   // 17
    DB.prepare(`SELECT type, status, page, CASE WHEN member_id IS NULL THEN 0 ELSE 1 END AS mem, COUNT(*) AS n
      FROM inquiries WHERE created_at >= ? AND created_at < ? GROUP BY type, status, page, mem`).bind(a, b),                                               // 18
    DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(marketing), 0) AS mk FROM members'),                                                                   // 19
    DB.prepare('SELECT type, COUNT(*) AS n FROM members GROUP BY type ORDER BY n DESC'),                                                                  // 20
    DB.prepare('SELECT COUNT(*) AS n FROM members WHERE last_login >= ? AND last_login < ?').bind(a, b),                                                  // 21
    DB.prepare('SELECT id, created_at, name, email, type, marketing FROM members ORDER BY created_at DESC LIMIT 6'),                                      // 22
    DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE is_staff = 0 AND created_at >= ? AND created_at < ?').bind(a, b),                                  // 23
    DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE is_staff = 0 AND created_at >= ? AND created_at < ?').bind(a, b),                               // 24
    DB.prepare('SELECT COUNT(DISTINCT sid) AS n FROM pv WHERE ts > ?').bind(now - 5 * 60 * 1000),                                                        // 25
    DB.prepare('SELECT MIN(day) AS d FROM pv'),                                                                                                           // 26
    DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status = '접수'")                                                                               // 27
  ];

  let res;
  try { res = await DB.batch(stmts); }
  catch (e) { return fail('통계를 불러오지 못했습니다: ' + (e && e.message ? e.message : ''), 500); }
  const rows = (i) => (res[i] && res[i].results) || [];
  const one = (i) => rows(i)[0] || {};

  const cur = summaryOf(res.slice(0, 5));
  const prev = summaryOf(res.slice(5, 10));

  /* 추이 — 하루짜리 기간은 시간대별, 그 외는 날짜별 */
  const byHour = {};
  const hours = Array(24).fill(0);
  const weekdays = Array(7).fill(0);
  rows(11).forEach((r) => {
    hours[r.hour] += r.pv;
    weekdays[new Date(r.day + 'T12:00:00Z').getUTCDay()] += r.pv;
    const h = byHour[r.hour] || (byHour[r.hour] = { pv: 0, v: 0 });
    h.pv += r.pv; h.v += r.v;
  });
  let trend;
  if (R.days === 1) {
    const lastHour = R.key === 'today' ? kst(now).hour : 23;
    trend = [];
    for (let h = 0; h <= lastHour; h++) trend.push({ k: String(h), pv: (byHour[h] || {}).pv || 0, v: (byHour[h] || {}).v || 0 });
  } else {
    const d = Object.fromEntries(rows(10).map((r) => [r.day, r]));
    const inq = Object.fromEntries(rows(16).map((r) => [r.d, r.n]));
    const sg = Object.fromEntries(rows(17).map((r) => [r.d, r.n]));
    trend = [];
    for (let day = from; day <= to; day = addDay(day, 1)) {
      const r = d[day] || {};
      trend.push({ k: day, pv: r.pv || 0, v: r.v || 0, s: r.s || 0, inq: inq[day] || 0, sg: sg[day] || 0 });
    }
  }

  /* 페이지 */
  const allPages = rows(12);
  const pages = allPages.slice(0, 20);
  const insights = allPages.filter((p) => p.path.startsWith('/insights/')).slice(0, 10);
  const contactRow = allPages.find((p) => p.path === '/contact') || {};

  /* 유입 */
  const src = {}; const srcd = {}; const utm = {};
  rows(13).forEach((r) => {
    add(src, r.src || '직접 방문', r.n);
    if (r.srcd) add(srcd, `${r.src}|${r.srcd}`, r.n);
    if (r.utm) add(utm, r.utm, r.n);
  });

  /* 기기 · 지역 */
  const dev = {}; const br = {}; const os = {}; const region = {};
  rows(14).forEach((r) => {
    add(dev, r.dev || '기타', r.n); add(br, r.br || '기타', r.n); add(os, r.os || '기타', r.n);
    add(region, r.country && r.country !== 'KR' ? `해외|${r.country}` : `KR|${r.region || '알 수 없음'}`, r.n);
  });

  /* 클릭 */
  const kinds = {};
  const clicks = [];
  const conv = {};
  rows(15).forEach((r) => {
    if (r.kind === 'conv') { add(conv, r.label || '기타', r.n); return; }
    add(kinds, r.kind, r.n);
    clicks.push(r);
  });
  clicks.sort((x, y) => y.n - x.n);

  /* 문의 */
  const iType = {}; const iStatus = {}; const iPage = {}; let iMem = 0;
  rows(18).forEach((r) => {
    add(iType, r.type, r.n); add(iStatus, r.status, r.n); add(iPage, r.page || '-', r.n);
    if (r.mem) iMem += r.n;
  });

  return json({
    ok: true,
    range: R,
    firstDay: one(26).d || '',
    live: one(25).n || 0,
    cur, prev, trend,
    trendUnit: R.days === 1 ? 'hour' : 'day',
    hours, weekdays,
    pages, insights,
    contactVisitors: contactRow.v || 0,
    sources: top(src, 10),
    sourceDetail: top(srcd, 14).map((x) => ({ src: x.k.split('|')[0], k: x.k.split('|')[1], n: x.n })),
    utm: top(utm, 8),
    devices: top(dev, 4), browsers: top(br, 8), os: top(os, 6),
    regions: top(region, 10).map((x) => ({ country: x.k.split('|')[0], k: x.k.split('|')[1], n: x.n })),
    clickKinds: top(kinds, 12),
    clickTop: clicks.slice(0, 15),
    conversions: top(conv, 10),
    inquiries: { byType: top(iType, 12), byStatus: top(iStatus, 6), byPage: top(iPage, 6), member: iMem, waiting: one(27).n || 0 },
    members: {
      total: one(19).n || 0, marketing: one(19).mk || 0,
      byType: rows(20).map((r) => ({ k: r.type || '선택 안 함', n: r.n })),
      active: one(21).n || 0,
      recent: rows(22)
    },
    community: { posts: one(23).n || 0, comments: one(24).n || 0 }
  });
}
