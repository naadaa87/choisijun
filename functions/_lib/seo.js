/* =========================================================
   관리자 '운영 현황' → 검색 점검
   각 사이트의 robots.txt · 사이트맵 · 대표 주소 · 색인 제외 표시를 서버에서 직접 열어 확인한다.
   구글 서치 콘솔의 '색인이 생성되지 않는 이유'(리디렉션 · 대체 페이지 · NOINDEX · 404)를 미리 잡는 용도.

   POST /api/admin/seo/check { id, offset }  한 번에 10쪽씩 확인. next 가 null 이 될 때까지 이어서 부른다
   GET  /api/admin/seo                       사이트별 마지막 점검 요약

   - 사이트맵에 적힌 주소를 고르게 최대 60쪽 뽑아 연다 (큰 사이트는 표본)
   - 확인하는 것: 열리는지(404·오류), 다른 주소로 넘어가는지, noindex 인지, 대표 주소(canonical)가 자기 주소와 같은지,
     제목 · 설명 · 큰제목(H1) · 구조화 데이터 · 공유 이미지, 본문 분량
   - www 주소와 http 주소가 대표 주소로 넘어가는지도 본다
   ========================================================= */
import { json, fail, readJson, nowIso } from './core.js';
import { ensureSeed } from './sites.js';

const UA = 'Mozilla/5.0 (compatible; ChoisijunSiteCheck/1.0; +https://choisijun.com)';
const PER_CALL = 10;
const MAX_SAMPLE = 60;
const HTML_CAP = 160_000;

async function grab(url, ms = 9000, follow = false) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { redirect: follow ? 'follow' : 'manual', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
  } finally { clearTimeout(timer); }
}

const locsOf = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function sitemap(origin) {
  const out = { status: 0, urls: [], files: 0 };
  try {
    const res = await grab(origin + '/sitemap.xml', 9000, true);
    out.status = res.status;
    if (!res.ok) return out;
    const text = (await res.text()).slice(0, 3_000_000);
    let locs = locsOf(text);
    out.files = 1;
    const subs = locs.filter((l) => /\.xml(\?.*)?$/i.test(l));
    if (subs.length && /<sitemapindex/i.test(text)) {
      locs = [];
      for (const s of subs.slice(0, 6)) {
        try {
          const r = await grab(s, 9000, true);
          if (r.ok) { locs.push(...locsOf((await r.text()).slice(0, 3_000_000))); out.files++; }
        } catch (_) { /* 건너뜀 */ }
      }
    }
    out.urls = locs;
  } catch (_) { out.status = -1; }
  return out;
}

async function probe(url) {
  try {
    const r = await grab(url, 7000);
    const to = r.headers.get('location') || '';
    try { if (r.body) await r.body.cancel(); } catch (_) { /* ignore */ }
    return { st: r.status, to };
  } catch (_) { return { st: 0, to: '' }; }
}

/** robots.txt 의 'User-agent: *' 묶음에 'Disallow: /' 가 있는지 */
function blocksAll(txt) {
  let star = false; let hit = false; let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(); const v = m[2].trim();
    if (k === 'user-agent') { star = lastWasAgent ? star || v === '*' : v === '*'; lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (star && k === 'disallow' && v === '/') hit = true;
    if (star && k === 'allow' && v === '/') return false;
  }
  return hit;
}

function textLen(html) {
  const i = html.search(/<body/i);
  const body = (i > 0 ? html.slice(i) : html)
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return body.trim().length;
}

async function page(origin, host, path) {
  const row = { p: path, st: 0 };
  let res;
  try { res = await grab(origin + path); } catch (_) { row.st = 0; row.err = 1; return row; }
  row.st = res.status;
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location') || '';
    try { const u = new URL(loc, origin + path); row.to = (u.host !== host ? u.host : '') + u.pathname; } catch (_) { row.to = loc.slice(0, 120); }
    try { if (res.body) await res.body.cancel(); } catch (_) { /* ignore */ }
    return row;
  }
  if (res.status !== 200) { try { if (res.body) await res.body.cancel(); } catch (_) { /* ignore */ } return row; }
  if (!/html/i.test(res.headers.get('content-type') || '')) { row.nohtml = 1; try { if (res.body) await res.body.cancel(); } catch (_) { /* ignore */ } return row; }
  const html = (await res.text()).slice(0, HTML_CAP);
  const hi = html.search(/<\/head>/i);
  const head = html.slice(0, hi > 0 ? hi : 12000);
  if (/noindex/i.test(res.headers.get('x-robots-tag') || '') || /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(head)) row.noindex = 1;
  const c = (head.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)/i) || [])[1];
  if (!c) row.canon = '(없음)';
  else {
    try {
      const u = new URL(c, origin + path);
      let cp = u.pathname; let pp = path.split('?')[0];
      try { cp = decodeURI(cp); pp = decodeURI(pp); } catch (_) { /* 그대로 */ }
      if (u.host !== host || cp !== pp) row.canon = (u.host !== host ? u.host : '') + cp;
    } catch (_) { row.canon = c.slice(0, 80); }
  }
  const title = ((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  row.t = title.slice(0, 70);
  if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']{20,}/i.test(head)) row.nodesc = 1;
  if (!/<h1[\s>]/i.test(html)) row.noh1 = 1;
  if (!/application\/ld\+json/i.test(html)) row.nold = 1;
  if (!/og:image/i.test(head)) row.noog = 1;
  row.len = textLen(html);
  return row;
}

function summarize(meta, rows, total, sampled) {
  const s = {
    total, sampled, checked: rows.length,
    sitemap: meta.sitemap, other: meta.other, robots: meta.robots, www: meta.www, http: meta.http,
    bad: rows.filter((r) => r.st !== 200 && !(r.st >= 300 && r.st < 400)).map((r) => ({ p: r.p, st: r.st })),
    redirect: rows.filter((r) => r.st >= 300 && r.st < 400).map((r) => ({ p: r.p, to: r.to || '' })),
    noindex: rows.filter((r) => r.noindex).map((r) => r.p),
    canon: rows.filter((r) => r.canon && !r.noindex).map((r) => ({ p: r.p, c: r.canon })),
    nodesc: rows.filter((r) => r.nodesc && !r.noindex).map((r) => r.p),
    noh1: rows.filter((r) => r.noh1 && !r.noindex).map((r) => r.p),
    thin: rows.filter((r) => r.st === 200 && !r.nohtml && !r.noindex && r.len < 500).map((r) => ({ p: r.p, n: r.len })),
    nold: rows.filter((r) => r.nold && !r.noindex).length,
    noog: rows.filter((r) => r.noog && !r.noindex).length
  };
  const titles = {};
  rows.forEach((r) => { if (r.t && !r.noindex) titles[r.t] = (titles[r.t] || 0) + 1; });
  s.dupTitle = Object.entries(titles).filter(([, n]) => n > 1).map(([t, n]) => ({ t, n }));
  /* 색인을 막는 문제만 센다 */
  const flags = [];
  if (meta.sitemap !== 200) flags.push('사이트맵 없음');
  if (meta.other) flags.push('사이트맵에 다른 도메인 주소');
  if (meta.robots && meta.robots.blockAll) flags.push('robots.txt 가 전체 차단');
  if (meta.robots && meta.robots.status === 200 && !meta.robots.sitemap) flags.push('robots.txt 에 사이트맵 줄 없음');
  if (meta.www && meta.www.st === 200) flags.push('www 주소가 따로 열림');
  if (meta.http && meta.http.st === 200) flags.push('http 주소가 https 로 넘어가지 않음');
  if (s.bad.length) flags.push(`사이트맵 주소 중 열리지 않는 곳 ${s.bad.length}`);
  if (s.redirect.length) flags.push(`사이트맵 주소가 다른 주소로 넘어감 ${s.redirect.length}`);
  if (s.noindex.length) flags.push(`사이트맵 주소가 색인 제외(noindex) ${s.noindex.length}`);
  if (s.canon.length) flags.push(`대표 주소가 자기 주소와 다름 ${s.canon.length}`);
  s.flags = flags;
  s.minor = [s.nodesc.length && `설명 없음 ${s.nodesc.length}`, s.noh1.length && `큰제목(H1) 없음 ${s.noh1.length}`, s.thin.length && `본문이 짧음 ${s.thin.length}`,
    s.dupTitle.length && `같은 제목 ${s.dupTitle.length}종`, s.nold && `구조화 데이터 없음 ${s.nold}`, s.noog && `공유 이미지 없음 ${s.noog}`].filter(Boolean);
  ['bad', 'redirect', 'noindex', 'canon', 'nodesc', 'noh1', 'thin', 'dupTitle'].forEach((k) => { s[k + 'N'] = s[k].length; s[k] = s[k].slice(0, 12); });
  return s;
}

async function ensureTable(DB) {
  await DB.prepare('CREATE TABLE IF NOT EXISTS site_seo (site TEXT PRIMARY KEY, at TEXT, meta TEXT, rows TEXT, summary TEXT, done INTEGER NOT NULL DEFAULT 0)').run();
}

export async function seoRoute(DB, env, request, parts, method) {
  await ensureTable(DB);
  if (parts.length === 1 && method === 'GET') {
    const rows = (await DB.prepare('SELECT site, at, summary FROM site_seo WHERE done = 1').all()).results || [];
    const out = {};
    rows.forEach((r) => { try { out[r.site] = { at: r.at, ...JSON.parse(r.summary) }; } catch (_) { /* 건너뜀 */ } });
    return json({ ok: true, seo: out });
  }
  if (parts[1] === 'check' && method === 'POST') return check(DB, request);
  return fail('없는 기능입니다.', 404);
}

async function check(DB, request) {
  await ensureSeed(DB);
  const body = await readJson(request, 2_000);
  const id = String(body.id || '');
  const offset = Math.max(0, Number(body.offset) || 0);
  const site = /^[a-z0-9][a-z0-9-]{0,48}$/.test(id) ? await DB.prepare('SELECT id, url FROM sites WHERE id = ?').bind(id).first() : null;
  if (!site || !site.url) return fail('사이트를 찾지 못했습니다.', 404);
  let origin; let host;
  try { const u = new URL(site.url); origin = u.origin; host = u.host.toLowerCase(); } catch (_) { return fail('사이트 주소가 올바르지 않습니다.'); }

  const sm = await sitemap(origin);
  const same = []; let other = 0;
  const seen = new Set();
  sm.urls.forEach((l) => {
    try { const u = new URL(l); if (u.host.toLowerCase() !== host) { other++; return; } const p = u.pathname + u.search; if (!seen.has(p)) { seen.add(p); same.push(p); } } catch (_) { other++; }
  });
  let paths = same.length ? same : ['/'];
  if (!paths.includes('/')) paths.unshift('/');
  const total = same.length;
  if (paths.length > MAX_SAMPLE) { const step = paths.length / MAX_SAMPLE; paths = Array.from({ length: MAX_SAMPLE }, (_, i) => paths[Math.floor(i * step)]); }

  let meta; let rows = [];
  if (offset === 0) {
    meta = { sitemap: sm.status, files: sm.files, other };
    try {
      const r = await grab(origin + '/robots.txt', 7000, true);
      const t = r.ok ? (await r.text()).slice(0, 20000) : '';
      meta.robots = { status: r.status, sitemap: /^sitemap:/im.test(t), cdncgi: /\/cdn-cgi\//.test(t), blockAll: blocksAll(t) };
    } catch (_) { meta.robots = { status: 0 }; }
    const custom = !/\.(pages|workers)\.dev$/.test(host) && !host.startsWith('www.');
    if (custom) meta.www = await probe(`https://www.${host}/`);
    // 이 관리자가 올라가 있는 도메인 자신은 Cloudflare 안쪽에서 열려 'HTTPS 항상 사용' 이동이 보이지 않는다 → 점검에서 뺀다
    meta.http = host === new URL(request.url).hostname ? { st: 0, to: '', self: true } : await probe(`http://${host}/`);
  } else {
    const prev = await DB.prepare('SELECT meta, rows FROM site_seo WHERE site = ?').bind(id).first();
    try { meta = JSON.parse(prev.meta); rows = JSON.parse(prev.rows); } catch (_) { return fail('처음부터 다시 점검해 주세요.'); }
  }
  const part = paths.slice(offset, offset + PER_CALL);
  const got = await Promise.all(part.map((p) => page(origin, host, p)));
  rows = rows.concat(got);
  const next = offset + PER_CALL < paths.length ? offset + PER_CALL : null;
  const now = nowIso();
  let summary = null;
  if (next == null) summary = summarize(meta, rows, total, paths.length);
  await DB.prepare(`INSERT INTO site_seo (site, at, meta, rows, summary, done) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(site) DO UPDATE SET at = excluded.at, meta = excluded.meta, rows = excluded.rows,
      summary = CASE WHEN excluded.done = 1 THEN excluded.summary ELSE site_seo.summary END,
      done = CASE WHEN excluded.done = 1 THEN 1 ELSE site_seo.done END`)
    .bind(id, now, JSON.stringify(meta), JSON.stringify(rows), summary ? JSON.stringify(summary) : null, next == null ? 1 : 0).run();
  return json({ ok: true, id, total, sampled: paths.length, offset, next, at: now, summary });
}
