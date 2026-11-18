/* =========================================================
   관리자 '전체 사이트' · '전체 KPI'
   /api/admin/sites        목록 · 추가 · 수정 · 숨기기 · 접속 점검 · GitHub 확인
   /api/admin/skpi         사이트별 월간 KPI (자동 집계 + 직접 입력 + 목표)
   - 사이트 정보·메모·KPI는 모두 D1에 저장한다 (표: sites, site_kpi)
   - 다른 사이트의 방문 기록은 /api/c 가 xpv · xev 표에 쌓는다
   ========================================================= */
import { json, fail, readJson, clean, nowIso, kst } from './core.js';
import { SITE_SEED, METRICS, STAGES, SELF_ID } from './sites-seed.js';

const SEED_COLS = ['sort', 'tier', 'cluster', 'name', 'url', 'domain', 'alt', 'repo', 'priv', 'cf_kind', 'cf_project',
  'storage', 'entity', 'stage', 'summary', 'model', 'naver', 'google', 'bing', 'pages'];
const METRIC_KEYS = METRICS.map((m) => m.k);
const TIERS = ['주력', '그 외'];
const CHECK_BATCH = 8;          // 한 번에 점검하는 사이트 수 (Cloudflare 요청당 외부 호출 한도 안에서)
const UA = 'choisijun-admin/1.0 (+https://choisijun.com)';
/* k1.js 의 내용 확인값 — k1.js 를 고치지 않는 한 그대로 둔다 */
const K1_SRI = 'sha384-aQJRBDzpD9p2aCpJyVf/aws5uOsSUcfMVfUdZVYHk1lk4fcAY5JSfjLVTCzDSEhG';

let seedDone = false;

/** 기본 목록 중 아직 없는 사이트만 넣는다. 관리자 화면에서 고친 내용은 건드리지 않는다 */
export async function ensureSeed(DB) {
  if (seedDone) return;
  const have = new Set(((await DB.prepare('SELECT id FROM sites').all()).results || []).map((r) => r.id));
  const miss = SITE_SEED.filter((s) => !have.has(s.id));
  if (miss.length) {
    const now = nowIso();
    const sql = `INSERT OR IGNORE INTO sites (id, ${SEED_COLS.join(', ')}, kpis, seeded, created_at, updated_at)
      VALUES (?, ${SEED_COLS.map(() => '?').join(', ')}, ?, 1, ?, ?)`;
    for (let i = 0; i < miss.length; i += 20) {
      await DB.batch(miss.slice(i, i + 20).map((s) => DB.prepare(sql).bind(s.id, ...SEED_COLS.map((c) => s[c]), JSON.stringify(s.kpis || []), now, now)));
    }
  }
  seedDone = true;
}

const parseKpis = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter((k) => METRIC_KEYS.includes(k)) : []; } catch (_) { return []; } };
const shape = (r) => ({ ...r, kpis: parseKpis(r.kpis) });
const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch (_) { return ''; } };

async function allSites(DB) {
  return ((await DB.prepare('SELECT * FROM sites ORDER BY sort, name').all()).results || []).map(shape);
}

/* ---------------- 경로 나누기 ---------------- */
export async function sitesRoute(DB, env, request, parts, method) {
  await ensureSeed(DB);
  if (parts[0] === 'sites') {
    if (parts.length === 1 && method === 'GET') return list(DB, request);
    if (parts.length === 1 && method === 'POST') return create(DB, request);
    if (parts[1] === 'check' && method === 'POST') return check(DB, request);
    if (parts[1] === 'github' && method === 'POST') return github(DB, env);
    const id = String(parts[1] || '');
    if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(id)) return fail('잘못된 사이트 이름입니다.');
    if (method === 'PATCH') return update(DB, request, id);
    if (method === 'DELETE') return remove(DB, id);
  }
  if (parts[0] === 'skpi') {
    if (parts.length === 1 && method === 'GET') return board(DB, request);
    const id = String(parts[1] || '');
    if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(id)) return fail('잘못된 사이트 이름입니다.');
    if (method === 'PUT') return kpiSave(DB, request, id);
  }
  return fail('없는 기능입니다.', 404);
}

/* ---------------- 목록 ---------------- */
async function list(DB, request) {
  const sites = await allSites(DB);
  const since = kst(Date.now() - 30 * 86400 * 1000).day;
  const tr = (await DB.prepare('SELECT site, MAX(day) AS d, COUNT(*) AS n FROM xpv WHERE day >= ? GROUP BY site').bind(since).all()).results || [];
  const tracking = Object.fromEntries(tr.map((r) => [r.site, { last: r.d, pv: r.n }]));
  const selfPv = await DB.prepare('SELECT MAX(day) AS d, COUNT(*) AS n FROM pv WHERE day >= ?').bind(since).first();
  if (selfPv && selfPv.d) tracking[SELF_ID] = { last: selfPv.d, pv: selfPv.n };
  const here = new URL(request.url);
  const origin = /^(localhost|127\.0\.0\.1)$/.test(here.hostname) ? here.origin : 'https://choisijun.com';
  return json({
    ok: true, sites, tracking, self: SELF_ID,
    meta: { metrics: METRICS, stages: STAGES, tiers: TIERS, checkBatch: CHECK_BATCH, snippet: `<script defer src="${origin}/k1.js" integrity="${K1_SRI}" crossorigin="anonymous"></script>` }
  });
}

/* ---------------- 추가 · 수정 · 숨기기 ---------------- */
function readFields(body, isNew) {
  const out = {};
  const str = (k, max) => { if (body[k] !== undefined) out[k] = clean(body[k], max); };
  const bit = (k) => { if (body[k] !== undefined) out[k] = body[k] === true || body[k] === 1 || body[k] === '1' ? 1 : 0; };
  str('name', 80); str('cluster', 60); str('url', 300); str('domain', 120); str('alt', 300); str('repo', 120);
  str('cf_project', 80); str('storage', 300); str('entity', 80); str('summary', 300); str('model', 400); str('memo', 4000);
  bit('priv'); bit('naver'); bit('google'); bit('bing'); bit('archived');
  if (body.tier !== undefined) out.tier = TIERS.includes(body.tier) ? body.tier : '그 외';
  if (body.stage !== undefined) out.stage = STAGES.includes(body.stage) ? body.stage : '미분류';
  if (body.cf_kind !== undefined) out.cf_kind = ['Pages', 'Workers'].includes(body.cf_kind) ? body.cf_kind : '';
  if (body.sort !== undefined) { const n = Math.round(Number(body.sort)); if (Number.isFinite(n)) out.sort = Math.max(0, Math.min(n, 99999)); }
  if (body.pages !== undefined) { const n = Math.round(Number(body.pages)); if (Number.isFinite(n)) out.pages = Math.max(0, Math.min(n, 9999999)); }
  if (body.kpis !== undefined) out.kpis = JSON.stringify((Array.isArray(body.kpis) ? body.kpis : []).filter((k) => METRIC_KEYS.includes(k)).slice(0, 8));
  for (const k of ['url', 'alt']) {
    if (out[k] && !/^https?:\/\//i.test(out[k])) out[k] = 'https://' + out[k];
    if (out[k]) { try { const u = new URL(out[k]); out[k] = u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')); } catch (_) { return { error: '주소 형식이 올바르지 않습니다.' }; } }
  }
  if (out.domain) out.domain = out.domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (out.repo) out.repo = out.repo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
  if (out.repo && !/^[\w.-]+\/[\w.-]+$/.test(out.repo)) return { error: 'GitHub 저장소는 계정/저장소 형태로 적어 주세요. 예: naadaa87/choisijun' };
  if (isNew && !out.name) return { error: '이름을 적어 주세요.' };
  if (out.name === '') return { error: '이름을 적어 주세요.' };
  return { fields: out };
}

async function create(DB, request) {
  const body = await readJson(request, 20_000);
  const r = readFields(body, true);
  if (r.error) return fail(r.error);
  const f = r.fields;
  let id = clean(body.id, 48).toLowerCase() || (f.repo ? f.repo.split('/')[1] : '') || hostOf(f.url).split('.')[0] || '';
  id = id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (!id) id = 'site-' + Date.now().toString(36);
  if (await DB.prepare('SELECT id FROM sites WHERE id = ?').bind(id).first()) return fail(`이미 목록에 있는 이름입니다 (${id}).`, 409);
  if (f.sort === undefined) {
    const max = await DB.prepare('SELECT MAX(sort) AS m FROM sites WHERE tier = ?').bind(f.tier || '그 외').first();
    f.sort = ((max && max.m) || 0) + 10;
  }
  const cols = Object.keys(f);
  const now = nowIso();
  await DB.prepare(`INSERT INTO sites (id, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
    .bind(id, ...cols.map((c) => f[c]), now, now).run();
  return json({ ok: true, id });
}

async function update(DB, request, id) {
  const body = await readJson(request, 20_000);
  const r = readFields(body, false);
  if (r.error) return fail(r.error);
  const cols = Object.keys(r.fields);
  if (!cols.length) return fail('바꿀 내용이 없습니다.');
  const res = await DB.prepare(`UPDATE sites SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...cols.map((c) => r.fields[c]), nowIso(), id).run();
  if (!res.meta || !res.meta.changes) return fail('사이트를 찾지 못했습니다.', 404);
  return json({ ok: true });
}

/** 기본 목록에 있던 사이트는 숨기기만 하고(다시 생기지 않게), 직접 추가한 사이트는 지운다 */
async function remove(DB, id) {
  if (id === SELF_ID) return fail('이 홈페이지는 목록에서 뺄 수 없습니다.');
  const row = await DB.prepare('SELECT id, seeded FROM sites WHERE id = ?').bind(id).first();
  if (!row) return fail('사이트를 찾지 못했습니다.', 404);
  if (row.seeded) {
    await DB.prepare('UPDATE sites SET archived = 1, updated_at = ? WHERE id = ?').bind(nowIso(), id).run();
    return json({ ok: true, archived: true });
  }
  await DB.batch([
    DB.prepare('DELETE FROM site_kpi WHERE site = ?').bind(id),
    DB.prepare('DELETE FROM sites WHERE id = ?').bind(id)
  ]);
  return json({ ok: true, deleted: true });
}

/* ---------------- 접속 점검 ---------------- */
async function timedFetch(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, signal: ctl.signal }); }
  finally { clearTimeout(timer); }
}

/** 사이트맵의 페이지 수. 셀 수 없으면 null */
async function countPages(origin) {
  try {
    const res = await timedFetch(origin + '/sitemap.xml', 7000);
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 4_000_000);
    if (!/<(urlset|sitemapindex)\b/i.test(text)) return null;
    if (/<sitemapindex\b/i.test(text)) {
      const kids = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
      if (!kids.length || kids.length > 4) return null;       // 너무 많이 나뉘어 있으면 세지 않는다
      let sum = 0;
      for (const k of kids) {
        const r = await timedFetch(k, 7000);
        if (!r.ok) return null;
        sum += ((await r.text()).match(/<url>/gi) || []).length;
      }
      return sum;
    }
    return (text.match(/<url>/gi) || []).length;
  } catch (_) { return null; }
}

async function checkOne(site, selfHost) {
  const out = { id: site.id, code: 0, ms: 0, note: '', pages: null };
  if (!site.url) { out.note = '주소 없음'; return out; }
  const host = hostOf(site.url);
  if (host === selfHost || site.id === SELF_ID) { out.code = 200; out.note = '이 홈페이지'; return out; }
  const t0 = Date.now();
  try {
    const res = await timedFetch(site.url, 9000);
    out.code = res.status;
    out.ms = Date.now() - t0;
    try { if (res.body) await res.body.cancel(); } catch (_) { /* ignore */ }
    if (res.status >= 400) out.note = res.status === 404 ? '페이지 없음' : res.status >= 500 ? '서버 오류' : '접근 거부';
  } catch (e) {
    out.ms = Date.now() - t0;
    out.note = e && e.name === 'AbortError' ? '9초 안에 응답 없음' : '연결하지 못함';
  }
  if (out.code >= 200 && out.code < 400 && (site.tier === '주력' || site.domain)) {
    out.pages = await countPages(new URL(site.url).origin);
  }
  return out;
}

async function check(DB, request) {
  const body = await readJson(request, 5_000);
  const ids = (Array.isArray(body.ids) ? body.ids : []).map((x) => String(x)).filter((x) => /^[a-z0-9][a-z0-9-]{0,48}$/.test(x)).slice(0, CHECK_BATCH);
  if (!ids.length) return fail('점검할 사이트가 없습니다.');
  const rows = ((await DB.prepare(`SELECT id, url, tier, domain FROM sites WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all()).results || []);
  const selfHost = new URL(request.url).host.toLowerCase();
  const results = await Promise.all(rows.map((r) => checkOne(r, selfHost)));
  const now = nowIso();
  const month = kst().day.slice(0, 7);
  const stmts = [];
  results.forEach((r) => {
    stmts.push(DB.prepare('UPDATE sites SET chk_at = ?, chk_code = ?, chk_ms = ?, chk_note = ? WHERE id = ?').bind(now, r.code, r.ms, r.note, r.id));
    if (r.pages != null && r.pages > 0) {
      stmts.push(DB.prepare('UPDATE sites SET pages = ? WHERE id = ?').bind(r.pages, r.id));
      stmts.push(DB.prepare(`INSERT INTO site_kpi (site, month, k, v, updated_at) VALUES (?, ?, 'pages', ?, ?)
        ON CONFLICT(site, month, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(r.id, month, r.pages, now));
    }
  });
  if (stmts.length) await DB.batch(stmts);
  return json({ ok: true, at: now, results });
}

/* ---------------- GitHub: 마지막 수정일 · 목록에 없는 새 저장소 ---------------- */
async function github(DB, env) {
  const owner = String(env.GITHUB_REPO || 'naadaa87/choisijun').split('/')[0];
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'choisijun-admin', 'X-GitHub-Api-Version': '2022-11-28' };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const repos = [];
  for (let page = 1; page <= 3; page++) {
    let res;
    try { res = await fetch(`https://api.github.com/users/${owner}/repos?per_page=100&sort=pushed&page=${page}`, { headers }); }
    catch (_) { return fail('GitHub에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 502); }
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      return fail('GitHub 조회 한도를 넘었습니다. 한 시간쯤 뒤에 다시 시도하거나, GITHUB_TOKEN을 설정하면 한도가 넉넉해집니다.', 429);
    }
    if (!res.ok) return fail('GitHub에서 저장소 목록을 읽지 못했습니다 (' + res.status + ')', 502);
    const part = await res.json();
    repos.push(...part);
    if (part.length < 100) break;
  }
  const sites = await allSites(DB);
  const byRepo = new Map(sites.filter((s) => s.repo).map((s) => [s.repo.toLowerCase(), s]));
  const stmts = [];
  const extra = [];
  repos.forEach((r) => {
    const s = byRepo.get(String(r.full_name).toLowerCase());
    if (s) { if (r.pushed_at && r.pushed_at !== s.gh_pushed) stmts.push(DB.prepare('UPDATE sites SET gh_pushed = ? WHERE id = ?').bind(r.pushed_at, s.id)); }
    else if (!r.fork && !r.archived) extra.push({ repo: r.full_name, name: r.name, description: clean(r.description, 200), homepage: clean(r.homepage, 200), pushed: r.pushed_at, created: r.created_at });
  });
  for (let i = 0; i < stmts.length; i += 40) await DB.batch(stmts.slice(i, i + 40));
  return json({ ok: true, count: repos.length, updated: stmts.length, extra });
}

/* =========================================================
   전체 KPI
   ========================================================= */
const monthAdd = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const isoMonthStart = (m) => new Date(m + '-01T00:00:00+09:00').toISOString();

async function board(DB, request) {
  const u = new URL(request.url).searchParams;
  const nowMonth = kst().day.slice(0, 7);
  let month = u.get('month') || nowMonth;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > nowMonth) month = nowMonth;
  const span = u.get('span') === '12' ? 12 : 6;
  const only = clean(u.get('site'), 48);
  const months = [];
  for (let i = span - 1; i >= 0; i--) months.push(monthAdd(month, -i));
  const first = months[0];
  const dayA = first + '-01';
  const dayB = month + '-31';
  const isoA = isoMonthStart(first);
  const isoB = isoMonthStart(monthAdd(month, 1));
  const idx = Object.fromEntries(months.map((m, i) => [m, i]));
  const siteCond = only ? ' AND site = ?' : '';
  const bindSite = (stmt, ...args) => (only ? stmt.bind(...args, only) : stmt.bind(...args));

  const res = await DB.batch([
    bindSite(DB.prepare(`SELECT site, month, k, v, t FROM site_kpi WHERE month >= ? AND month <= ?${siteCond}`), first, month),                                    // 0
    bindSite(DB.prepare(`SELECT site, substr(day, 1, 7) AS m, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v FROM xpv WHERE day >= ? AND day <= ?${siteCond} GROUP BY site, m`), dayA, dayB), // 1
    bindSite(DB.prepare(`SELECT site, substr(day, 1, 7) AS m, kind, COUNT(*) AS n FROM xev WHERE day >= ? AND day <= ?${siteCond} GROUP BY site, m, kind`), dayA, dayB),             // 2
    DB.prepare('SELECT substr(day, 1, 7) AS m, COUNT(*) AS pv, COUNT(DISTINCT vid) AS v FROM pv WHERE day >= ? AND day <= ? GROUP BY m').bind(dayA, dayB),          // 3
    DB.prepare("SELECT substr(datetime(created_at, '+9 hours'), 1, 7) AS m, COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ? GROUP BY m").bind(isoA, isoB), // 4
    DB.prepare("SELECT substr(datetime(created_at, '+9 hours'), 1, 7) AS m, COUNT(*) AS n FROM members WHERE created_at >= ? AND created_at < ? GROUP BY m").bind(isoA, isoB),   // 5
    DB.prepare("SELECT substr(day, 1, 7) AS m, kind, COUNT(*) AS n FROM ev WHERE day >= ? AND day <= ? AND kind IN ('tel', 'kakao', 'mail') GROUP BY m, kind").bind(dayA, dayB), // 6
    DB.prepare('SELECT COUNT(*) AS n FROM members'),                                                                                                               // 7
    DB.prepare('SELECT MIN(day) AS d FROM pv')                                                                                                                     // 8
  ]);
  const rows = (i) => (res[i] && res[i].results) || [];

  /* data[site][key] = { v: [달마다 값 또는 null], src: [달마다 'auto' | 'manual' | ''], t: 고른 달의 목표, mv: 고른 달에 직접 넣은 값 } */
  const data = {};
  const cell = (site, k) => {
    const s = data[site] || (data[site] = {});
    return s[k] || (s[k] = { v: Array(span).fill(null), src: Array(span).fill(''), t: null, mv: null });
  };
  const setAuto = (site, k, m, n) => {
    if (idx[m] === undefined) return;
    const c = cell(site, k);
    c.v[idx[m]] = (c.src[idx[m]] === 'auto' ? c.v[idx[m]] : 0) + n;
    c.src[idx[m]] = 'auto';
  };

  rows(0).forEach((r) => {
    if (!METRIC_KEYS.includes(r.k) || idx[r.month] === undefined) return;
    const c = cell(r.site, r.k);
    if (r.v != null) { c.v[idx[r.month]] = r.v; c.src[idx[r.month]] = 'manual'; }
    if (r.month === month) { c.t = r.t; c.mv = r.v; }
  });
  const tracked = {};
  rows(1).forEach((r) => {
    if (r.site === SELF_ID) return;
    tracked[r.site] = true;
    setAuto(r.site, 'visitors', r.m, r.v); setAuto(r.site, 'pageviews', r.m, r.pv);
  });
  const KIND = { book: 'book', tel: 'contact', kakao: 'contact', mail: 'contact', form: 'form' };
  rows(2).forEach((r) => { if (r.site !== SELF_ID && KIND[r.kind]) setAuto(r.site, KIND[r.kind], r.m, r.n); });
  /* 방문을 수집하는 달에는 클릭이 0이어도 0으로 보여 준다 (비어 있는 것과 구분) */
  Object.keys(tracked).forEach((site) => {
    const vis = cell(site, 'visitors');
    ['book', 'contact', 'form'].forEach((k) => { const c = cell(site, k); vis.src.forEach((s, i) => { if (s === 'auto' && c.src[i] !== 'auto') { c.v[i] = 0; c.src[i] = 'auto'; } }); });
  });

  /* 이 홈페이지 자신 */
  if (!only || only === SELF_ID) {
    const firstDay = (rows(8)[0] || {}).d || '';
    if (firstDay) {
      tracked[SELF_ID] = true;
      const startM = firstDay.slice(0, 7);
      months.forEach((m) => { if (m >= startM) { setAuto(SELF_ID, 'visitors', m, 0); setAuto(SELF_ID, 'pageviews', m, 0); setAuto(SELF_ID, 'contact', m, 0); } });
      rows(3).forEach((r) => { setAuto(SELF_ID, 'visitors', r.m, r.v); setAuto(SELF_ID, 'pageviews', r.m, r.pv); });
      rows(6).forEach((r) => setAuto(SELF_ID, 'contact', r.m, r.n));
    }
    months.forEach((m) => { setAuto(SELF_ID, 'inquiries', m, 0); setAuto(SELF_ID, 'signups', m, 0); });
    rows(4).forEach((r) => setAuto(SELF_ID, 'inquiries', r.m, r.n));
    rows(5).forEach((r) => setAuto(SELF_ID, 'signups', r.m, r.n));
    setAuto(SELF_ID, 'members', nowMonth, (rows(7)[0] || {}).n || 0);
  }

  const sites = (await allSites(DB)).filter((s) => !s.archived && (!only || s.id === only))
    .map((s) => ({ id: s.id, name: s.name, tier: s.tier, cluster: s.cluster, stage: s.stage, url: s.url, kpis: s.kpis, tracked: Boolean(tracked[s.id]) }));
  return json({ ok: true, month, nowMonth, months, span, metrics: METRICS, self: SELF_ID, sites, data });
}

async function kpiSave(DB, request, id) {
  const body = await readJson(request, 20_000);
  const site = await DB.prepare('SELECT id FROM sites WHERE id = ?').bind(id).first();
  if (!site) return fail('사이트를 찾지 못했습니다.', 404);
  const now = nowIso();
  const stmts = [];
  if (body.kpis !== undefined) {
    const kpis = (Array.isArray(body.kpis) ? body.kpis : []).filter((k) => METRIC_KEYS.includes(k)).slice(0, 8);
    stmts.push(DB.prepare('UPDATE sites SET kpis = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(kpis), now, id));
  }
  if (body.values !== undefined) {
    const month = String(body.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('달(月) 형식이 올바르지 않습니다.');
    const num = (x) => {
      if (x === null || x === undefined || x === '') return null;
      const n = Number(String(x).replace(/,/g, ''));
      return Number.isFinite(n) && n >= 0 && n < 1e13 ? n : NaN;
    };
    for (const [k, val] of Object.entries(body.values || {})) {
      if (!METRIC_KEYS.includes(k)) continue;
      const v = num(val && val.v);
      const t = num(val && val.t);
      if (Number.isNaN(v) || Number.isNaN(t)) return fail('숫자만 넣어 주세요 (0 이상).');
      if (v === null && t === null) stmts.push(DB.prepare('DELETE FROM site_kpi WHERE site = ? AND month = ? AND k = ?').bind(id, month, k));
      else stmts.push(DB.prepare(`INSERT INTO site_kpi (site, month, k, v, t, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(site, month, k) DO UPDATE SET v = excluded.v, t = excluded.t, updated_at = excluded.updated_at`).bind(id, month, k, v, t, now));
    }
  }
  if (!stmts.length) return fail('바꿀 내용이 없습니다.');
  await DB.batch(stmts);
  return json({ ok: true });
}

/** 대시보드에 보여 줄 한 줄 요약 */
export async function sitesSummary(DB) {
  await ensureSeed(DB);
  const r = await DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN tier = '주력' THEN 1 ELSE 0 END), 0) AS focus,
      COALESCE(SUM(CASE WHEN chk_at IS NOT NULL AND url != '' AND (chk_code < 200 OR chk_code >= 400) THEN 1 ELSE 0 END), 0) AS down,
      MAX(chk_at) AS chk_at
    FROM sites WHERE archived = 0`).first();
  return r || { total: 0, focus: 0, down: 0, chk_at: null };
}
