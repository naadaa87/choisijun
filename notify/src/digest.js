/* =========================================================
   choisijun-notify — 일일 리포트 (매일 아침 8시, 받는 주소는 wrangler.toml 의 NOTIFY_TO)
   - 전날 사이트별 KPI · 전날 들어온 문의 · 확인할 것(특이사항) · 진행·변동 사항을 한 통에 정리한다
   - 무료 요금제 한도(호출 1번에 CPU 10ms · 외부 요청 50개)를 넘지 않도록 일을 세 번에 나눈다
       06시  접속 점검   — 주력 사이트 첫 화면을 열어 보고 '운영 현황'의 접속 상태를 새로 고친다
       07시  준비       — GitHub 변경 내역, 이번 달 문의 수를 미리 모아 둔다 (admin_flags 'digest_prep')
       08시  보내기     — 방문 통계·문의·할 일을 읽어 메일을 만들고 보낸다
   - 시각은 wrangler.toml 의 DIGEST_HOUR(한국 시각)로 바꾼다. 나머지 둘은 그 1·2시간 전에 돈다
   - 모든 숫자는 D1·KV 에서 그 자리에서 읽는다. 메일에 쓴 내용은 따로 남기지 않는다
   ========================================================= */
import { LEAD_SOURCES, KV_SOURCES, readKv, toMs, NEW, MARK_STATES } from '../../functions/_lib/leads.js';
import { SELF_ID } from '../../functions/_lib/sites-seed.js';

const DAY = 86400 * 1000;
const UA = 'choisijun-notify/1.0 (+https://choisijun.com)';
const NO_GAP_ALERT = new Set([SELF_ID, 'gusystem']);        // 방문 0명 경고에서 뺄 곳 (자체 집계 · 내부용)
const QUIET_OPS = new Set(['보류', '종료 검토']);
const OPEN_MARK = { seen: true, hold: true };                // 확인만 했거나 보류 = 아직 회신 전

/* ---------------- 날짜 ---------------- */
const p2 = (n) => String(n).padStart(2, '0');
const kstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(day + 'T00:00:00+09:00');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const md = (day) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
const wd = (day) => WD[new Date(day + 'T12:00:00Z').getUTCDay()];
const hm = (ms) => { const d = new Date(ms + 9 * 3600 * 1000); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const mdhm = (ms) => `${Number(kstDay(ms).slice(5, 7))}/${Number(kstDay(ms).slice(8, 10))} ${hm(ms)}`;
const kstHour = (ms) => new Date(ms + 9 * 3600 * 1000).getUTCHours();

/** 리포트가 다루는 기간: 어제(y) 하루, 그 앞 7일, 이번 달 1일~어제, 지난달 같은 기간 */
export function daysOf(now = Date.now()) {
  const today = kstDay(now);
  const y = addDay(today, -1);
  const [yy, mm, dd] = y.split('-').map(Number);
  const pm = new Date(Date.UTC(yy, mm - 2, 1)).toISOString().slice(0, 7);
  const pmLast = new Date(Date.UTC(yy, mm - 1, 0)).getUTCDate();
  return {
    now, today, y, y1: addDay(y, -1), w0: addDay(y, -7), w1: addDay(y, -1),
    m1: y.slice(0, 8) + '01', pm1: pm + '-01', pmEnd: `${pm}-${p2(Math.min(dd, pmLast))}`,
    ys: dayStart(y), ye: dayStart(today)
  };
}

/* ---------------- 작은 도구 ---------------- */
const msg = (e) => String((e && e.message) || e).slice(0, 160);
async function q(DB, sql, ...args) {
  try { return (await DB.prepare(sql).bind(...args).all()).results || []; } catch (_) { return []; }
}
async function flag(DB, k) {
  try { const r = await DB.prepare('SELECT v FROM admin_flags WHERE k = ?').bind(k).first(); return r ? JSON.parse(r.v) : null; } catch (_) { return null; }
}
async function setFlag(DB, k, v) {
  await DB.prepare('INSERT OR REPLACE INTO admin_flags (k, v, at) VALUES (?, ?, ?)').bind(k, JSON.stringify(v), new Date().toISOString()).run();
}
export const digestFlag = flag;

async function timed(url, ms, init = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(timer); }
}

/* =========================================================
   06시 — 접속 점검
   주력 사이트 첫 화면을 한 번씩 연다. 이동(3xx)도 정상으로 본다 (외부 요청 수를 사이트당 1개로 묶으려고)
   ========================================================= */
export async function runHealth(env) {
  const DB = env.DB;
  const list = (await q(DB, "SELECT id, url FROM sites WHERE archived = 0 AND tier = '주력' AND url != '' ORDER BY sort")).slice(0, 44);
  const out = [];
  let i = 0;
  const one = async () => {
    while (i < list.length) {
      const s = list[i++];
      const r = { id: s.id, code: 0, ms: 0, note: '' };
      const t0 = Date.now();
      try {
        const res = await timed(s.url, 9000, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' } });
        r.code = res.status;
        r.ms = Date.now() - t0;
        try { if (res.body) await res.body.cancel(); } catch (_) { /* ignore */ }
        if (res.status >= 400) r.note = res.status === 404 ? '페이지 없음' : res.status >= 500 ? '서버 오류' : '접근 거부';
      } catch (e) {
        r.ms = Date.now() - t0;
        r.note = e && e.name === 'AbortError' ? '9초 안에 응답 없음' : '연결하지 못함';
      }
      out.push(r);
    }
  };
  await Promise.all(Array.from({ length: 6 }, one));
  const at = new Date().toISOString();
  const stmts = out.map((r) => DB.prepare('UPDATE sites SET chk_at = ?, chk_code = ?, chk_ms = ?, chk_note = ? WHERE id = ?').bind(at, r.code, r.ms, r.note, r.id));
  for (let k = 0; k < stmts.length; k += 40) await DB.batch(stmts.slice(k, k + 40));
  const bad = out.filter((r) => !(r.code >= 200 && r.code < 400)).map((r) => ({ id: r.id, code: r.code, note: r.note }));
  const res = { at, n: out.length, bad };
  await setFlag(DB, 'health_last', res);
  return res;
}

/* =========================================================
   07시 — 준비: GitHub 변경 내역 · 이번 달 문의 수
   ========================================================= */
export async function runPrep(env, now = Date.now()) {
  const D = daysOf(now);
  const [gh, leads] = await Promise.all([
    github(env, D).catch((e) => ({ ok: false, error: msg(e) })),
    leadMonth(env, D).catch(() => null)
  ]);
  const prep = { day: D.y, at: new Date().toISOString(), gh, leads };
  await setFlag(env.DB, 'digest_prep', prep);
  return { day: D.y, at: prep.at, gh: { ok: gh.ok, via: gh.via, repos: (gh.repos || []).length, error: gh.error || '' }, leads: Boolean(leads) };
}

const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function atomEntries(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    out.push({
      title: decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]),
      at: Date.parse((b.match(/<updated>([^<]+)<\/updated>/) || [])[1] || '') || 0
    });
  }
  return out;
}

async function github(env, D) {
  const owner = env.GITHUB_OWNER || 'naadaa87';
  const api = { Accept: 'application/vnd.github+json', 'User-Agent': UA, 'X-GitHub-Api-Version': '2022-11-28' };
  if (env.GITHUB_TOKEN) api.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const web = { 'User-Agent': UA, Accept: 'application/atom+xml' };
  let repos = null;
  let via = 'api';
  let note = '';
  try {
    const res = await timed(`https://api.github.com/users/${owner}/repos?per_page=40&sort=pushed&type=owner`, 9000, { headers: api });
    if (res.ok) {
      repos = (await res.json()).map((r) => ({ name: r.name, branch: r.default_branch || 'main', pushed: Date.parse(r.pushed_at) || 0, created: Date.parse(r.created_at) || 0 }));
    } else { note = `저장소 목록 ${res.status}`; try { await res.body.cancel(); } catch (_) { /* ignore */ } }
  } catch (e) { note = '저장소 목록 연결 실패'; }
  if (!repos) {
    /* GitHub API 한도에 걸리면 공개 활동 피드로 대신 찾는다 */
    via = 'feed';
    const res = await timed(`https://github.com/${owner}.atom`, 9000, { headers: web });
    if (!res.ok) return { ok: false, via, error: `${note} · 활동 피드 ${res.status}` };
    const map = new Map();
    for (const e of atomEntries(await res.text())) {
      let m = e.title.match(/pushed to (\S+) in [\w.-]+\/([\w.-]+)/);
      if (m) { const c = map.get(m[2]) || { name: m[2], branch: m[1], pushed: 0, created: 0 }; c.pushed = Math.max(c.pushed, e.at); map.set(m[2], c); continue; }
      m = e.title.match(/created a repository [\w.-]+\/([\w.-]+)/);
      if (m) { const c = map.get(m[1]) || { name: m[1], branch: 'main', pushed: e.at, created: 0 }; c.created = e.at; map.set(m[1], c); }
    }
    repos = [...map.values()];
  }
  const touched = repos.filter((r) => r.pushed >= D.ys).sort((a, b) => b.pushed - a.pushed);
  const pick = touched.slice(0, 18);
  const list = [];
  const failed = [];
  await Promise.all(pick.map(async (r) => {
    let commits = null;
    try {
      const res = await timed(`https://github.com/${owner}/${r.name}/commits/${encodeURIComponent(r.branch)}.atom`, 9000, { headers: web });
      if (res.ok) commits = atomEntries(await res.text()).map((c) => ({ t: c.title, at: c.at }));
      else try { await res.body.cancel(); } catch (_) { /* ignore */ }
    } catch (_) { commits = null; }
    if (!commits) { failed.push(r.name); return; }
    const inDay = commits.filter((c) => c.at >= D.ys && c.at < D.ye).sort((a, b) => a.at - b.at);
    if (inDay.length) list.push({ name: r.name, total: inDay.length, commits: inDay.slice(-8).map((c) => ({ t: c.t.slice(0, 120), at: c.at })) });
  }));
  list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const created = repos.filter((r) => r.created >= D.ys && r.created < D.ye).map((r) => r.name);
  return { ok: true, via, repos: list, created, more: Math.max(0, touched.length - pick.length), failed, note };
}

/** 이번 달 1일~어제, 지난달 같은 기간의 사이트별 문의 수 (날짜 칸만 읽는다) */
async function leadMonth(env, D) {
  const lo = dayStart(D.pm1);
  const mLo = dayStart(D.m1);
  const pmHi = dayStart(addDay(D.pmEnd, 1));
  const by = {};
  const bump = (site, ms) => {
    if (!site || !ms || ms < lo || ms >= D.ye) return;
    const b = by[site] || (by[site] = { mtd: 0, pmtd: 0 });
    if (ms >= mLo) b.mtd++;
    else if (ms < pmHi) b.pmtd++;
  };
  await Promise.all(LEAD_SOURCES.filter((s) => !s.soft && env[s.bind]).map(async (src) => {
    const table = (src.q.match(/FROM (\w+)\s*$/) || [])[1];
    const col = (src.q.match(/(\w+) AS at\b/) || [])[1] || 'created_at';
    if (!table) return;
    const where = src.where ? ` WHERE ${src.where}` : '';
    const rows = await q(env[src.bind], `SELECT ${col} AS c${src.central ? ', site' : ''} FROM ${table}${where} ORDER BY ${src.by} DESC LIMIT 500`);
    rows.forEach((r) => bump(src.central ? String(r.site || '') : src.site, toMs(r.c, src.tz)));
  }));
  await Promise.all(KV_SOURCES.filter((s) => env[s.bind]).map(async (src) => {
    const { ok, rows } = await readKv(env, src, 60);
    if (ok) rows.forEach((r) => bump(src.site, toMs(r.at)));
  }));
  return by;
}

/* =========================================================
   08시 — 모아서 보내기
   ========================================================= */
export async function runDigest(env, { collect, collected, send, reason = 'cron', now = Date.now(), test = false }) {
  const DB = env.DB;
  const D = daysOf(now);
  if (!test) {
    const last = await flag(DB, 'digest_last');
    if (last && last.day === D.y && last.ok) return { skipped: true, day: D.y };
  }
  let result;
  try {
    const got = collected || await collect(env, 60);
    const data = await gather(env, D, got);
    const mail = compose(env, D, data);
    await send({ subject: mail.subject, text: mail.text, html: mail.html });
    result = { day: D.y, at: new Date().toISOString(), ok: true, reason, ...mail.stats };
    if (!test) await setFlag(DB, 'digest_snap', data.snapNext);
  } catch (e) {
    result = { day: D.y, at: new Date().toISOString(), ok: false, reason, error: msg(e) };
  }
  await setFlag(DB, test ? 'digest_test_last' : 'digest_last', result).catch(() => null);
  return result;
}

const LABEL_SRC = { '직접 방문': '직접', '블로그·커뮤니티': '블로그', '패밀리 사이트': '패밀리', '다른 사이트': '외부 링크', '내부 이동': '내부' };

export async function gather(env, D, got) {
  const DB = env.DB;
  const ysIso = new Date(D.ys).toISOString();
  const yeIso = new Date(D.ye).toISOString();
  const [sites, pvRows, evRows, srcRows, selfPv, selfEv, selfSrc, mtdRows, pmtdRows, selfMtd, selfPmtd, signups, posts, comments, tasks, marks, seoRows, rss, prep, snap, notifyLast] = await Promise.all([
    q(DB, 'SELECT id, sort, tier, cluster, name, url, repo, ops, stage, chk_at, chk_code, chk_note, created_at, archived FROM sites ORDER BY sort, name'),
    q(DB, `SELECT site, day, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v, COUNT(DISTINCT CASE WHEN new_v = 1 THEN vid END) AS nv,
        CAST(AVG(CASE WHEN dur > 0 THEN dur END) AS INTEGER) AS ad FROM xpv WHERE day BETWEEN ? AND ? GROUP BY site, day`, D.w0, D.y),
    q(DB, 'SELECT site, kind, COUNT(*) AS n FROM xev WHERE day = ? GROUP BY site, kind', D.y),
    q(DB, 'SELECT site, src, COUNT(*) AS n FROM xpv WHERE day = ? AND new_s = 1 GROUP BY site, src', D.y),
    q(DB, `SELECT day, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v, COUNT(DISTINCT CASE WHEN new_v = 1 THEN vid END) AS nv,
        CAST(AVG(CASE WHEN dur > 0 THEN dur END) AS INTEGER) AS ad FROM pv WHERE day BETWEEN ? AND ? GROUP BY day`, D.w0, D.y),
    q(DB, 'SELECT kind, COUNT(*) AS n FROM ev WHERE day = ? GROUP BY kind', D.y),
    q(DB, 'SELECT src, COUNT(*) AS n FROM pv WHERE day = ? AND new_s = 1 GROUP BY src', D.y),
    q(DB, 'SELECT site, COUNT(DISTINCT vid) AS v, COUNT(*) AS pv FROM xpv WHERE day BETWEEN ? AND ? GROUP BY site', D.m1, D.y),
    q(DB, 'SELECT site, COUNT(DISTINCT vid) AS v, COUNT(*) AS pv FROM xpv WHERE day BETWEEN ? AND ? GROUP BY site', D.pm1, D.pmEnd),
    q(DB, 'SELECT COUNT(DISTINCT vid) AS v, COUNT(*) AS pv FROM pv WHERE day BETWEEN ? AND ?', D.m1, D.y),
    q(DB, 'SELECT COUNT(DISTINCT vid) AS v, COUNT(*) AS pv FROM pv WHERE day BETWEEN ? AND ?', D.pm1, D.pmEnd),
    q(DB, 'SELECT COUNT(*) AS n FROM members WHERE created_at >= ? AND created_at < ?', ysIso, yeIso),
    q(DB, 'SELECT COUNT(*) AS n FROM posts WHERE is_staff = 0 AND created_at >= ? AND created_at < ?', ysIso, yeIso),
    q(DB, 'SELECT COUNT(*) AS n FROM comments WHERE is_staff = 0 AND created_at >= ? AND created_at < ?', ysIso, yeIso),
    q(DB, 'SELECT id, site, kind, title, owner, status, due, created_at, updated_at, done_at FROM site_tasks ORDER BY sort, id'),
    q(DB, 'SELECT k, state FROM lead_marks'),
    q(DB, 'SELECT site, at, summary FROM site_seo WHERE done = 1 AND at >= ? AND at < ?', ysIso, yeIso),
    insights(env, D),
    flag(DB, 'digest_prep'), flag(DB, 'digest_snap'), flag(DB, 'notify_last')
  ]);

  const live = sites.filter((s) => !s.archived);
  const nameOf = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const inY = (ms) => ms >= D.ys && ms < D.ye;

  /* ---- 방문 ---- */
  const daily = {};
  pvRows.forEach((r) => { if (r.site !== SELF_ID) (daily[r.site] || (daily[r.site] = {}))[r.day] = r; });
  selfPv.forEach((r) => { (daily[SELF_ID] || (daily[SELF_ID] = {}))[r.day] = r; });
  const clicks = {};
  const addClick = (site, kind, n) => {
    const c = clicks[site] || (clicks[site] = { book: 0, contact: 0, form: 0 });
    if (kind === 'book') c.book += n;
    else if (kind === 'tel' || kind === 'kakao' || kind === 'mail') c.contact += n;
    else if (kind === 'form') c.form += n;
  };
  evRows.forEach((r) => { if (r.site !== SELF_ID) addClick(r.site, r.kind, r.n); });
  selfEv.forEach((r) => addClick(SELF_ID, r.kind, r.n));
  const srcs = {};
  srcRows.forEach((r) => { if (r.site !== SELF_ID) (srcs[r.site] || (srcs[r.site] = [])).push(r); });
  srcs[SELF_ID] = selfSrc;

  /* ---- 문의 ---- */
  const markOf = Object.fromEntries(marks.map((mk) => [mk.k, mk.state]));
  const monthAgo = D.now - 30 * DAY;
  const leads = (got && got.items ? got.items : []).map((it) => {
    const state = markOf[it.key];
    const isNew = state ? Boolean(OPEN_MARK[state]) : (NEW.test(it.raw || '') || (!it.raw && it.at > monthAgo));
    return { ...it, state, isNew };
  });
  const yLeads = leads.filter((it) => inY(it.at)).sort((a, b) => a.at - b.at);
  const todayLeads = leads.filter((it) => it.at >= D.ye && !it.soft).length;
  const waiting = leads.filter((it) => it.isNew && !it.soft).sort((a, b) => (a.at || 0) - (b.at || 0));
  const inqBySite = {};
  yLeads.forEach((it) => { if (!it.soft) inqBySite[it.site] = (inqBySite[it.site] || 0) + 1; });

  /* ---- 사이트별 KPI 줄 ---- */
  const rows = [];
  const zero = [];
  const seen = new Set();
  live.filter((s) => s.tier === '주력' || daily[s.id] || inqBySite[s.id]).forEach((s) => {
    seen.add(s.id);
    const d = daily[s.id] || {};
    const y = d[D.y] || {};
    let sum7 = 0;
    for (let day = D.w0; day <= D.w1; day = addDay(day, 1)) sum7 += (d[day] || {}).v || 0;
    const c = clicks[s.id] || { book: 0, contact: 0, form: 0 };
    const st = (srcs[s.id] || []).filter((r) => r.src !== '내부 이동');
    const stTotal = st.reduce((a, r) => a + r.n, 0);
    const top = st.sort((a, b) => b.n - a.n).slice(0, 2).map((r) => ({ k: LABEL_SRC[r.src] || r.src || '직접', p: stTotal ? Math.round((r.n / stTotal) * 100) : 0 }));
    const row = {
      id: s.id, name: s.name, tier: s.tier, ops: s.ops || '', v: y.v || 0, pv: y.pv || 0, nv: y.nv || 0, ad: y.ad || 0,
      prev: (d[D.y1] || {}).v || 0, avg7: sum7 / 7, clicks: c.book + c.contact + c.form, c, inq: inqBySite[s.id] || 0, top
    };
    if (row.v || row.pv || row.inq || row.clicks) rows.push(row);
    else if (s.tier === '주력') zero.push(row);
  });
  /* 목록에 없는 사이트 이름으로 들어온 문의도 놓치지 않게 */
  Object.keys(inqBySite).forEach((id) => {
    if (!seen.has(id)) rows.push({ id, name: nameOf[id] || id, tier: '', ops: '', v: 0, pv: 0, nv: 0, ad: 0, prev: 0, avg7: 0, clicks: 0, c: { book: 0, contact: 0, form: 0 }, inq: inqBySite[id], top: [] });
  });
  rows.sort((a, b) => b.v - a.v || b.inq - a.inq || b.pv - a.pv);
  const tot = rows.reduce((a, r) => ({ v: a.v + r.v, pv: a.pv + r.pv, prev: a.prev + r.prev, clicks: a.clicks + r.clicks, inq: a.inq + r.inq }), { v: 0, pv: 0, prev: 0, clicks: 0, inq: 0 });
  zero.forEach((r) => { tot.prev += r.prev; });

  /* ---- 이번 달 누적 ---- */
  const notSelf = (list, k) => list.reduce((a, r) => a + (r.site === SELF_ID ? 0 : r[k] || 0), 0);
  const month = {
    label: `${Number(D.m1.slice(5, 7))}월 1일~${Number(D.y.slice(8, 10))}일`,
    v: notSelf(mtdRows, 'v') + ((selfMtd[0] || {}).v || 0),
    pv: notSelf(mtdRows, 'pv') + ((selfMtd[0] || {}).pv || 0),
    v0: notSelf(pmtdRows, 'v') + ((selfPmtd[0] || {}).v || 0),
    inq: null, inq0: null
  };
  if (prep && prep.day === D.y && prep.leads) {
    month.inq = Object.values(prep.leads).reduce((a, b) => a + b.mtd, 0);
    month.inq0 = Object.values(prep.leads).reduce((a, b) => a + b.pmtd, 0);
  }
  const self = { signups: (signups[0] || {}).n || 0, posts: (posts[0] || {}).n || 0, comments: (comments[0] || {}).n || 0 };

  /* ---- 확인할 것 ---- */
  const alerts = [];
  const add = (level, tag, text) => alerts.push({ level, tag, text });
  const focus = live.filter((s) => s.tier === '주력');
  const fresh = focus.filter((s) => s.chk_at && Date.parse(s.chk_at) > D.now - 8 * 3600 * 1000);
  if (!fresh.length) add('info', '접속', '오늘 아침 접속 점검 결과가 없습니다. 관리자 \'운영 현황\'에서 접속 점검을 한 번 눌러 주세요.');
  fresh.filter((s) => !(s.chk_code >= 200 && s.chk_code < 400)).forEach((s) => {
    add('high', '접속', `${s.name} 첫 화면이 열리지 않습니다 — ${s.chk_note || '응답 ' + s.chk_code} (${hm(Date.parse(s.chk_at))} 점검)`);
  });
  [...rows, ...zero].forEach((r) => {
    if (NO_GAP_ALERT.has(r.id) || QUIET_OPS.has(r.ops) || r.tier !== '주력') return;
    const avg = r.avg7;
    if (r.v === 0 && avg >= 3) add('mid', '방문', `${r.name} 어제 방문 기록이 없습니다 (7일 평균 ${dec(avg)}명). 방문 수집 코드나 사이트 상태를 확인해 주세요.`);
    else if (r.v >= 20 && avg > 0 && r.v >= avg * 2) add('info', '방문', `${r.name} 방문자가 평소보다 크게 늘었습니다 — ${num(r.v)}명 (7일 평균 ${dec(avg)}명)${r.top[0] ? `, 주로 ${r.top[0].k}` : ''}`);
    else if (avg >= 20 && r.v > 0 && r.v <= avg * 0.4) add('mid', '방문', `${r.name} 방문자가 평소보다 많이 줄었습니다 — ${num(r.v)}명 (7일 평균 ${dec(avg)}명)`);
  });
  const old3 = waiting.filter((it) => it.at && it.at < D.now - 3 * DAY).length;
  if (waiting.length) add(old3 ? 'mid' : 'info', '문의', `회신 전 문의가 ${num(waiting.length)}건 있습니다${old3 ? ` (그중 3일 넘게 기다린 문의 ${num(old3)}건)` : ''}.`);
  const errs = (got && got.errors) || [];
  if (errs.length) add('mid', '시스템', `문의 저장소를 읽지 못한 곳이 있습니다 — ${errs.map((e) => { const [site, label] = String(e).split(':'); return `${nameOf[site] || site} ${label || ''}`.trim(); }).slice(0, 6).join(', ')}`);
  if (notifyLast && notifyLast.failed && notifyLast.failed.length) add('mid', '시스템', `새 문의 알림 메일 ${notifyLast.failed.length}통이 마지막 확인 때 발송되지 않았습니다.`);
  const open = tasks.filter((t) => t.status !== '완료' && t.status !== '보류');
  const overdue = open.filter((t) => t.due && t.due < D.today);
  const dueToday = open.filter((t) => t.due === D.today);
  const taskName = (t) => `${t.title}${t.site && t.site !== '*' ? ` (${nameOf[t.site] || t.site})` : ''}`;
  if (overdue.length) add('mid', '할 일', `기한이 지난 할 일 ${overdue.length}건 — ${overdue.slice(0, 3).map(taskName).join(' / ')}${overdue.length > 3 ? ' 외' : ''}`);
  if (dueToday.length) add('info', '할 일', `오늘까지인 할 일 ${dueToday.length}건 — ${dueToday.slice(0, 3).map(taskName).join(' / ')}`);
  if (rss.ok) {
    if (!rss.y.length) add('info', '글', '어제는 choisijun.com 인사이트 글이 올라가지 않았습니다.');
    if (!rss.today.length && kstHour(D.now) >= 8) add('info', '글', '오늘 아침 인사이트 글이 아직 올라오지 않았습니다. 매일 글 발행 예약 작업을 확인해 주세요.');
  }
  const check = focus.filter((s) => s.ops === '점검 필요');
  if (check.length) add('info', '운영', `운영 현황에서 '점검 필요'로 둔 곳 ${check.length}곳 — ${check.map((s) => s.name).join(', ')}`);
  if (!prep || prep.day !== D.y) add('info', '시스템', 'GitHub 변경 내역을 미리 모아 두지 못해 이번 메일에서는 빠졌습니다.');
  else if (prep.gh && !prep.gh.ok) add('info', '시스템', `GitHub 변경 내역을 읽지 못했습니다 (${prep.gh.error || '연결 실패'}).`);
  const rank = { high: 0, mid: 1, info: 2 };
  alerts.sort((a, b) => rank[a.level] - rank[b.level]);

  /* ---- 진행 · 변동 ---- */
  const repoSite = {};
  live.forEach((s) => { if (s.repo && s.repo.includes('/')) repoSite[String(s.repo).split('/')[1].toLowerCase()] = s.name; });
  const gh = prep && prep.day === D.y && prep.gh && prep.gh.ok ? prep.gh : null;
  const commits = gh ? gh.repos.map((r) => ({ ...r, site: repoSite[r.name.toLowerCase()] || '' })) : null;
  const tIn = (iso) => Boolean(iso) && iso >= ysIso && iso < yeIso;
  const tDone = tasks.filter((t) => tIn(t.done_at));
  const tNew = tasks.filter((t) => tIn(t.created_at) && !tIn(t.done_at));
  const tMoved = tasks.filter((t) => tIn(t.updated_at) && !tIn(t.created_at) && !tIn(t.done_at));
  const owners = {};
  open.forEach((t) => { owners[t.owner] = (owners[t.owner] || 0) + 1; });
  const snapNext = { at: new Date(D.now).toISOString(), sites: Object.fromEntries(focus.map((s) => [s.id, [s.ops || '', s.stage || '']])) };
  const changes = [];
  if (snap && snap.sites) {
    Object.entries(snapNext.sites).forEach(([id, [ops, stage]]) => {
      const was = snap.sites[id];
      if (!was) { changes.push(`${nameOf[id] || id} — 주력 목록에 새로 들어옴`); return; }
      if (was[0] !== ops) changes.push(`${nameOf[id] || id} — 운영 현황 ${was[0] || '미정'} → ${ops || '미정'}`);
      if (was[1] !== stage) changes.push(`${nameOf[id] || id} — 단계 ${was[1] || '미정'} → ${stage || '미정'}`);
    });
    Object.keys(snap.sites).forEach((id) => { if (!snapNext.sites[id]) changes.push(`${nameOf[id] || id} — 주력 목록에서 빠짐`); });
  }
  const newSites = live.filter((s) => tIn(s.created_at) && !(snap && snap.sites && snap.sites[s.id])).map((s) => s.name);
  const seo = seoRows.map((r) => { let s = {}; try { s = JSON.parse(r.summary) || {}; } catch (_) { s = {}; } return { name: nameOf[r.site] || r.site, flags: (s.flags || []).length, minor: (s.minor || []).length, first: (s.flags || [])[0] || '' }; });

  return {
    rows, zero, tot, month, self, yLeads, todayLeads, waiting, alerts,
    progress: { commits, created: gh ? gh.created || [] : [], ghMore: gh ? gh.more || 0 : 0, ghFailed: gh ? gh.failed || [] : [], tDone, tNew, tMoved, open: open.length, owners, changes, newSites, seo, rss, nameOf },
    snapNext
  };
}

/** choisijun.com 인사이트 글 — 어제·오늘 올라온 것 */
async function insights(env, D) {
  try {
    const res = await timed(env.RSS_URL || 'https://choisijun.com/rss.xml', 8000, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { ok: false, y: [], today: [] };
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const b = m[1];
      return {
        t: decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).replace(/\s*\|\s*최시준\s*$/, ''),
        link: decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
        cat: decode((b.match(/<category>([\s\S]*?)<\/category>/) || [])[1]),
        at: Date.parse(decode((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1])) || 0
      };
    }).filter((it) => /\/insights\//.test(it.link) && it.at);
    return { ok: true, y: items.filter((it) => kstDay(it.at) === D.y), today: items.filter((it) => kstDay(it.at) === D.today) };
  } catch (_) { return { ok: false, y: [], today: [] }; }
}

/* =========================================================
   메일 만들기
   ========================================================= */
const num = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const dec = (x) => (x >= 10 ? num(x) : (Math.round(x * 10) / 10).toString());
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emailOf = (s) => (String(s || '').match(/[^\s@,·<>]+@[^\s@,·<>]+\.[^\s@,·<>]{2,}/) || [])[0] || '';
const phoneOf = (s) => ((String(s || '').match(/(?:\+?82[-\s]?)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}/) || [])[0] || '').replace(/[\s.]/g, '-');
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

const C = { point: '#FF4712', ink: '#1b1b1b', sub: '#5c5c5c', faint: '#9b9b9b', line: '#ececea', tint: '#FFF2EC', bg: '#f5f5f3', gray: '#f3f3f1' };
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard','Malgun Gothic','맑은 고딕',sans-serif";

function delta(cur, prev, unit = '') {
  if (!prev && !cur) return '';
  const d = cur - prev;
  if (!d) return '전일과 같음';
  return `전일보다 ${d > 0 ? '+' : '−'}${num(Math.abs(d))}${unit}`;
}

export function compose(env, D, x) {
  const adminBase = env.ADMIN_BASE || 'https://choisijun.com/admin';
  const date = `${md(D.y)} (${wd(D.y)})`;
  const alertsN = x.alerts.filter((a) => a.level !== 'info').length;
  const leadsMain = x.yLeads.filter((it) => !it.soft);
  const leadsSoft = x.yLeads.filter((it) => it.soft);

  /* 한 줄 요약 */
  const visit = x.tot.v ? `어제 사이트 전체에 ${num(x.tot.v)}명이 다녀갔고${x.tot.prev ? ` (전일 ${num(x.tot.prev)}명)` : ''}` : '어제는 방문 기록이 잡히지 않았고';
  const inq = leadsMain.length ? `문의는 ${leadsMain.length}건 들어왔습니다.` : '새 문의는 없었습니다.';
  const lead = `${visit}, ${inq} ${alertsN ? `먼저 확인할 일이 ${alertsN}건 있습니다.` : '급하게 확인할 일은 없습니다.'}`;
  const subject = `[일일 리포트] ${md(D.y)}(${wd(D.y)}) 방문 ${num(x.tot.v)}명 · 문의 ${leadsMain.length}건${alertsN ? ` · 확인할 것 ${alertsN}건` : ''}`;

  /* ---------- HTML ---------- */
  const h = [];
  const sec = (no, title, sub) => `<tr><td style="padding:36px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 0 10px;border-bottom:2px solid ${C.ink}">
    <span style="font-size:12px;font-weight:800;color:${C.point};letter-spacing:.04em">${no}</span>&nbsp;&nbsp;<span style="font-size:17px;font-weight:800;color:${C.ink}">${esc(title)}</span>${sub ? `&nbsp;&nbsp;<span style="font-size:12.5px;color:${C.faint}">${esc(sub)}</span>` : ''}
  </td></tr></table></td></tr>`;
  const p = (html, style = '') => `<p style="margin:12px 0 0;font-size:13.5px;line-height:1.65;color:${C.sub};${style}">${html}</p>`;
  const small = (html) => `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${C.faint}">${html}</p>`;
  const tile = (label, value, note, hot) => `<td width="25%" style="padding:0 4px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${hot ? C.tint : C.gray};border-radius:10px"><tr><td style="padding:14px 12px">
    <div style="font-size:12px;color:${C.sub}">${label}</div>
    <div style="font-size:22px;font-weight:800;color:${hot ? C.point : C.ink};margin-top:4px;line-height:1.2">${value}</div>
    <div style="font-size:11px;color:${C.faint};margin-top:4px;line-height:1.4">${note || '&nbsp;'}</div></td></tr></table></td>`;

  h.push(`<tr><td>
    <div style="font-size:12px;font-weight:800;color:${C.point};letter-spacing:.06em">DAILY REPORT</div>
    <div style="font-size:25px;font-weight:800;color:${C.ink};margin-top:6px;line-height:1.3">${esc(date)} 일일 리포트</div>
    <div style="font-size:14.5px;color:${C.sub};margin-top:10px;line-height:1.7">${esc(lead)}</div>
  </td></tr>
  <tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${tile('방문자', num(x.tot.v), esc(delta(x.tot.v, x.tot.prev, '명')))}
    ${tile('페이지뷰', num(x.tot.pv), '')}
    ${tile('문의', num(leadsMain.length), x.waiting.length ? `회신 전 ${num(x.waiting.length)}건` : '')}
    ${tile('확인할 것', num(alertsN), x.alerts.length > alertsN ? `참고 ${x.alerts.length - alertsN}건` : '', alertsN > 0)}
  </tr></table></td></tr>`);

  /* 01 사이트별 KPI */
  h.push(sec('01', '사이트별 KPI', `${md(D.y)} 하루`));
  const m = x.month;
  const mv = pct(m.v, m.v0);
  const mParts = [`방문자 ${num(m.v)}명${m.v0 ? ` (지난달 같은 기간 ${num(m.v0)}명${mv != null && mv !== 0 ? `, ${mv > 0 ? mv + '% 증가' : Math.abs(mv) + '% 감소'}` : ''})` : ''}`];
  if (m.inq != null) mParts.push(`문의 ${num(m.inq)}건${m.inq0 ? ` (지난달 같은 기간 ${num(m.inq0)}건)` : ''}`);
  h.push(`<tr><td>${p(`<b style="color:${C.ink}">${esc(m.label)} 누적</b> · ${mParts.map(esc).join(' · ')}`)}</td></tr>`);
  if (x.rows.length) {
    const th = (t, align = 'right') => `<td style="padding:10px 6px;font-size:11.5px;color:${C.faint};font-weight:600;text-align:${align};border-bottom:1px solid ${C.line};white-space:nowrap">${t}</td>`;
    const td = (v, strong) => `<td style="padding:11px 6px;font-size:14px;text-align:right;vertical-align:top;white-space:nowrap;color:${strong ? C.ink : C.sub};${strong ? 'font-weight:700;' : ''}border-bottom:1px solid ${C.line}">${v}</td>`;
    const body = x.rows.map((r) => {
      const subl = [];
      if (r.prev || r.v) subl.push(`전일 ${num(r.prev)}`);
      if (r.avg7) subl.push(`7일 평균 ${dec(r.avg7)}`);
      if (r.top.length) subl.push(r.top.map((tp) => `${tp.k} ${tp.p}%`).join(', '));
      const d = r.v - r.prev;
      const dv = d ? `<div style="font-size:11px;font-weight:600;color:${d > 0 ? C.point : C.faint};margin-top:2px">${d > 0 ? '+' + num(d) : '−' + num(-d)}</div>` : '';
      const ck = r.clicks ? `${num(r.clicks)}<div style="font-size:11px;color:${C.faint};margin-top:2px;white-space:normal">${[r.c.book && `예약 ${r.c.book}`, r.c.contact && `연락 ${r.c.contact}`, r.c.form && `신청 ${r.c.form}`].filter(Boolean).join('<br>')}</div>` : `<span style="color:${C.faint}">0</span>`;
      return `<tr><td style="padding:11px 6px 11px 0;vertical-align:top;border-bottom:1px solid ${C.line}">
          <div style="font-size:14px;font-weight:700;color:${C.ink}">${esc(r.name)}</div>
          ${subl.length ? `<div style="font-size:11.5px;color:${C.faint};margin-top:3px;line-height:1.45">${esc(subl.join(' · '))}</div>` : ''}</td>
        ${td(num(r.v) + dv, true)}${td(num(r.pv))}${td(ck)}${td(r.inq ? `<span style="color:${C.point};font-weight:800">${r.inq}</span>` : `<span style="color:${C.faint}">0</span>`)}</tr>`;
    }).join('');
    h.push(`<tr><td style="padding-top:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>${th('사이트', 'left')}${th('방문자')}${th('페이지뷰')}${th('클릭')}${th('문의')}</tr>${body}
      <tr><td style="padding:11px 6px 11px 0;font-size:13px;font-weight:800;color:${C.ink}">합계</td>${td(num(x.tot.v), true)}${td(num(x.tot.pv), true)}${td(num(x.tot.clicks), true)}${td(num(x.tot.inq), true)}</tr>
    </table></td></tr>`);
  } else {
    h.push(`<tr><td>${p('어제는 방문 기록이 잡힌 사이트가 없습니다. 방문 수집이 멈췄을 수 있으니 관리자 \'전체 KPI\'를 한 번 확인해 주세요.')}</td></tr>`);
  }
  if (x.zero.length) h.push(`<tr><td>${small(`어제 방문 기록이 없는 주력 사이트 ${x.zero.length}곳 · ${esc(x.zero.map((r) => r.name).join(', '))}`)}</td></tr>`);
  const selfBits = [x.self.signups && `신규 회원 ${x.self.signups}명`, x.self.posts && `커뮤니티 글 ${x.self.posts}건`, x.self.comments && `댓글 ${x.self.comments}건`].filter(Boolean);
  if (selfBits.length) h.push(`<tr><td>${small(`choisijun.com · ${esc(selfBits.join(' · '))}`)}</td></tr>`);
  h.push(`<tr><td>${small('방문자는 사이트마다 따로 센 사람 수를 더한 값입니다. 클릭은 예약·전화·카톡·메일·신청 버튼을 누른 횟수, 문의는 각 사이트 문의 저장소에 실제로 들어온 건수입니다.')}</td></tr>`);

  /* 02 어제 들어온 문의 */
  h.push(sec('02', '어제 들어온 문의', leadsMain.length ? `${leadsMain.length}건` : ''));
  if (!leadsMain.length) h.push(`<tr><td>${p('어제는 새로 들어온 문의가 없었습니다.')}</td></tr>`);
  const card = (it) => {
    const mail = emailOf(it.contact);
    const tel = phoneOf(it.contact);
    const acts = [mail && `<a href="mailto:${esc(mail)}" style="color:${C.point};text-decoration:none;font-weight:700">메일 답장</a>`, tel && `<a href="tel:${esc(tel)}" style="color:${C.point};text-decoration:none;font-weight:700">전화</a>`].filter(Boolean);
    const state = it.state ? (MARK_STATES[it.state] || it.state) : (it.status || '새 문의');
    const text = (it.text || '').slice(0, 500) + ((it.text || '').length > 500 ? ' …' : '');
    return `<tr><td style="padding-top:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px"><tr><td style="padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:${C.point}">${esc(it.siteName)} · ${esc(it.label.replace('(최시준 접수)', ''))}<span style="color:${C.faint};font-weight:400"> · ${hm(it.at)}</span></div>
      <div style="font-size:15px;font-weight:700;color:${C.ink};margin-top:5px">${esc(it.name || '이름 없음')}${it.kind ? `<span style="font-weight:400;color:${C.sub};font-size:13.5px"> · ${esc(it.kind)}</span>` : ''}</div>
      ${it.contact ? `<div style="font-size:13px;color:${C.sub};margin-top:3px">${esc(it.contact)}</div>` : ''}
      ${text ? `<div style="font-size:13.5px;color:${C.ink};margin-top:9px;line-height:1.65">${esc(text).replace(/\n/g, '<br>')}</div>` : ''}
      <div style="font-size:12px;color:${C.faint};margin-top:10px">상태 ${esc(state)}${acts.length ? ' · ' + acts.join(' · ') : ''}</div>
    </td></tr></table></td></tr>`;
  };
  leadsMain.slice(0, 25).forEach((it) => h.push(card(it)));
  if (leadsMain.length > 25) h.push(`<tr><td>${small(`나머지 ${leadsMain.length - 25}건은 관리자 '전체 문의'에서 볼 수 있습니다.`)}</td></tr>`);
  if (leadsSoft.length) {
    h.push(`<tr><td>${p(`<b style="color:${C.ink}">참고로 들어온 것 ${leadsSoft.length}건</b> (공간 제보·사용자 의견·출시 알림 신청)`)}
      <ul style="margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.7;color:${C.sub}">${leadsSoft.slice(0, 12).map((it) => `<li>${esc(it.siteName)} · ${esc(it.kind || it.label)} · ${hm(it.at)}${it.text ? ' — ' + esc(it.text.replace(/\s+/g, ' ').slice(0, 80)) : ''}</li>`).join('')}</ul></td></tr>`);
  }
  if (x.waiting.length) {
    const bySite = {};
    x.waiting.forEach((it) => { bySite[it.siteName] = (bySite[it.siteName] || 0) + 1; });
    const siteLine = Object.entries(bySite).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
    const oldest = x.waiting.filter((it) => it.at).slice(0, 5);
    h.push(`<tr><td style="padding-top:8px">${p(`<b style="color:${C.ink}">회신 전 문의 ${num(x.waiting.length)}건</b> · ${esc(siteLine)}`)}
      ${oldest.length ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.7;color:${C.sub}">${oldest.map((it) => `<li>${esc(it.siteName)} · ${esc(it.name || it.kind || it.label)} · ${mdhm(it.at)} 접수 <span style="color:${C.point}">${Math.max(1, Math.floor((D.now - it.at) / DAY))}일째</span></li>`).join('')}</ul>` : ''}
      ${small(`오래 기다린 순서로 5건만 적었습니다. 회신한 문의는 관리자 '전체 문의'에서 '회신함'을 눌러 두면 이 숫자에서 빠집니다.${x.todayLeads ? ` 오늘 0시 이후 들어온 ${x.todayLeads}건은 내일 리포트에 들어갑니다.` : ''}`)}</td></tr>`);
  }

  /* 03 확인할 것 */
  h.push(sec('03', '특이사항 · 확인할 것', ''));
  if (!x.alerts.length) h.push(`<tr><td>${p('특별히 확인할 일은 없습니다.')}</td></tr>`);
  else {
    h.push(`<tr><td style="padding-top:4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${x.alerts.map((a) => {
      const hot = a.level !== 'info';
      return `<tr><td width="62" style="padding:11px 0 0;vertical-align:top"><span style="display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap;${hot ? `color:${C.point};background:${C.tint}` : `color:${C.sub};background:${C.gray}`}">${esc(a.tag)}</span></td>
        <td style="padding:11px 0 0;font-size:13.5px;line-height:1.6;color:${hot ? C.ink : C.sub}">${esc(a.text)}</td></tr>`;
    }).join('')}</table></td></tr>`);
  }

  /* 04 진행 · 변동 */
  const P = x.progress;
  h.push(sec('04', '홈페이지 · 프로젝트 진행과 변동', ''));
  const sub4 = (tt) => `<div style="margin-top:18px;font-size:13px;font-weight:800;color:${C.ink}">${esc(tt)}</div>`;
  const ul = (items) => `<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.7;color:${C.sub}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const blocks = [];
  if (P.commits) {
    const total = P.commits.reduce((a, r) => a + r.total, 0);
    if (P.commits.length) {
      blocks.push(sub4(`GitHub 반영 · 저장소 ${P.commits.length}곳, ${total}건`) + P.commits.map((r) => `
        <div style="margin-top:10px;font-size:13px;color:${C.ink}"><b>${esc(r.site || r.name)}</b>${r.site ? `<span style="color:${C.faint}"> · ${esc(r.name)}</span>` : ''} <span style="color:${C.point};font-weight:700">${r.total}건</span></div>
        ${ul(r.commits.map((c) => `${esc(c.t)} <span style="color:${C.faint}">${hm(c.at)}</span>`).concat(r.total > r.commits.length ? [`<span style="color:${C.faint}">그 전 ${r.total - r.commits.length}건은 생략</span>`] : []))}`).join(''));
    } else if (!P.ghFailed.length) blocks.push(sub4('GitHub 반영') + p('어제는 공개 저장소에 올라간 변경이 없습니다.', 'margin-top:4px'));
    else blocks.push(sub4('GitHub 반영'));
    if (P.ghFailed.length) blocks.push(small(`변경이 있었던 저장소 중 ${P.ghFailed.length}곳은 커밋 내역을 읽지 못했습니다 · ${esc(P.ghFailed.join(', '))}`));
    if (P.created.length) blocks.push(small(`새로 만든 저장소 · ${esc(P.created.join(', '))}`));
    if (P.ghMore) blocks.push(small(`이 밖에 저장소 ${P.ghMore}곳에도 변경이 있었습니다.`));
  }
  const taskLi = (t, extra = '') => `${esc(t.title)}${t.site && t.site !== '*' ? ` <span style="color:${C.faint}">· ${esc(P.nameOf[t.site] || t.site)}</span>` : ''}${extra}`;
  const tItems = [
    ...P.tDone.map((t) => `<span style="color:${C.point};font-weight:700">완료</span> ${taskLi(t)}`),
    ...P.tNew.map((t) => `<b style="color:${C.ink}">추가</b> ${taskLi(t, ` <span style="color:${C.faint}">· ${esc(t.owner)}</span>`)}`),
    ...P.tMoved.map((t) => `<b style="color:${C.ink}">${esc(t.status)}</b> ${taskLi(t)}`)
  ];
  const ownerLine = Object.entries(P.owners).map(([k, v]) => `${k} ${v}`).join(' · ');
  blocks.push(sub4(`할 일${tItems.length ? ` · 어제 바뀐 것 ${tItems.length}건` : ''}`) + (tItems.length ? ul(tItems.slice(0, 15)) : p('어제는 할 일 목록에 바뀐 것이 없습니다.', 'margin-top:4px')) + small(`남은 할 일 ${num(P.open)}건${ownerLine ? ` (${esc(ownerLine)})` : ''}`));
  if (P.changes.length || P.newSites.length) {
    blocks.push(sub4('운영 현황 변동') + ul([...P.newSites.map((n) => `${esc(n)} — 관리 목록에 새로 추가`), ...P.changes.map(esc)]));
  }
  if (P.rss.ok && (P.rss.y.length || P.rss.today.length)) {
    const li = (it, when) => `<a href="${esc(it.link)}" style="color:${C.ink};text-decoration:none">${esc(it.t)}</a> <span style="color:${C.faint}">· ${when}${it.cat ? ' · ' + esc(it.cat) : ''}</span>`;
    blocks.push(sub4('choisijun.com 인사이트 글') + ul([...P.rss.y.map((it) => li(it, '어제')), ...P.rss.today.map((it) => li(it, '오늘 아침'))]));
  }
  if (P.seo.length) blocks.push(sub4('검색 점검') + ul(P.seo.map((s) => `${esc(s.name)} — ${s.flags ? `손볼 것 ${s.flags}가지${s.first ? ` (${esc(s.first)})` : ''}` : '큰 문제 없음'}${s.minor ? `, 보완 ${s.minor}가지` : ''}`)));
  h.push(`<tr><td>${blocks.join('')}</td></tr>`);

  /* 바닥 */
  const btn = (label, hash) => `<a href="${adminBase}#${hash}" style="display:inline-block;margin:4px 6px 0 0;padding:9px 14px;border:1px solid ${C.line};border-radius:8px;font-size:12.5px;font-weight:700;color:${C.ink};text-decoration:none">${label}</a>`;
  h.push(`<tr><td style="padding-top:36px"><div style="border-top:1px solid ${C.line};padding-top:18px">${btn('운영 현황', 'ops')}${btn('전체 KPI', 'skpi')}${btn('전체 문의', 'leads')}</div>
    ${small(`매일 아침 ${esc(String(env.DIGEST_HOUR || 8))}시에 choisijun-notify 가 보내는 메일입니다. 숫자는 각 사이트 방문 수집(k1.js)과 문의 저장소, 관리자 운영 현황에서 그 자리에서 읽은 값입니다. 받는 주소나 시각은 저장소 notify/wrangler.toml 에서 바꿀 수 있습니다.`)}
  </td></tr>`);

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;font-family:${FONT};color:${C.ink}">
<tr><td style="padding:30px 26px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${h.join('\n')}
</table></td></tr></table>
</td></tr></table></body></html>`;

  /* ---------- 텍스트 ---------- */
  const t = [];
  t.push(`${date} 일일 리포트`, '', lead, '');
  t.push(`방문자 ${num(x.tot.v)}명 (${delta(x.tot.v, x.tot.prev, '명') || '-'}) · 페이지뷰 ${num(x.tot.pv)} · 문의 ${leadsMain.length}건 · 확인할 것 ${alertsN}건`, '');
  t.push('■ 01 사이트별 KPI', `${m.label} 누적 · ${mParts.join(' · ')}`);
  x.rows.forEach((r) => t.push(`- ${r.name}: 방문 ${num(r.v)} (전일 ${num(r.prev)}) · 페이지뷰 ${num(r.pv)} · 클릭 ${num(r.clicks)} · 문의 ${r.inq}`));
  if (x.zero.length) t.push(`  방문 기록 없음: ${x.zero.map((r) => r.name).join(', ')}`);
  t.push('', `■ 02 어제 들어온 문의 ${leadsMain.length}건`);
  if (!leadsMain.length) t.push('어제는 새로 들어온 문의가 없었습니다.');
  leadsMain.forEach((it) => t.push(`- [${it.siteName}] ${it.label.replace('(최시준 접수)', '')}${it.kind ? ' · ' + it.kind : ''} · ${hm(it.at)} · ${it.name || '이름 없음'} · ${it.contact || '연락처 없음'}`, `  ${(it.text || '').replace(/\s+/g, ' ').slice(0, 200)}`));
  if (leadsSoft.length) t.push(`참고 ${leadsSoft.length}건: ${leadsSoft.map((it) => `${it.siteName} ${it.kind || it.label}`).join(', ')}`);
  if (x.waiting.length) t.push(`회신 전 문의 ${num(x.waiting.length)}건`);
  t.push('', '■ 03 특이사항 · 확인할 것');
  if (!x.alerts.length) t.push('특별히 확인할 일은 없습니다.');
  x.alerts.forEach((a) => t.push(`- [${a.tag}] ${a.text}`));
  t.push('', '■ 04 홈페이지 · 프로젝트 진행과 변동');
  if (P.commits) {
    if (!P.commits.length && !P.ghFailed.length) t.push('GitHub: 어제 변경 없음');
    if (P.ghFailed.length) t.push(`GitHub: 커밋 내역을 읽지 못한 저장소 ${P.ghFailed.join(', ')}`);
    P.commits.forEach((r) => { t.push(`- ${r.site || r.name} (${r.name}) ${r.total}건`); r.commits.forEach((c) => t.push(`  · ${c.t}`)); });
  }
  t.push(tItems.length
    ? `할 일 · 어제 바뀐 것 ${tItems.length}건: ${[...P.tDone.map((k) => '완료 ' + k.title), ...P.tNew.map((k) => '추가 ' + k.title), ...P.tMoved.map((k) => k.status + ' ' + k.title)].slice(0, 10).join(' / ')}`
    : '할 일: 어제 바뀐 것 없음');
  t.push(`남은 할 일 ${P.open}건`);
  [...P.newSites.map((n) => `${n} — 관리 목록에 새로 추가`), ...P.changes].forEach((c) => t.push(`- ${c}`));
  [...P.rss.y, ...P.rss.today].forEach((it) => t.push(`- 글: ${it.t} ${it.link}`));
  t.push('', `운영 현황 ${adminBase}#ops`, `전체 문의 ${adminBase}#leads`);

  return {
    subject, html, text: t.join('\n'),
    stats: { visitors: x.tot.v, pageviews: x.tot.pv, leads: leadsMain.length, waiting: x.waiting.length, alerts: alertsN, notes: x.alerts.length - alertsN, size: html.length }
  };
}
