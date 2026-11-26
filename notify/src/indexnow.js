/* =========================================================
   IndexNow — 바뀐 주소를 검색엔진에 바로 알린다
   · 사이트맵의 <lastmod> 가 지난번에 알린 날짜와 다른 주소만 골라 보낸다 (처음에는 전부)
   · 보내는 곳: api.indexnow.org (Bing·Yandex·Seznam·Naver 등에 함께 전달) + 네이버 서치어드바이저
   · 키 파일은 각 사이트 루트에 <KEY>.txt 로 올려 둔다 (choisijun.com 은 저장소 루트)
   · 기록은 choisijun-db 의 admin_flags('indexnow:<host>') 에 남긴다
   ========================================================= */
export const INDEXNOW_SITES = [
  { host: 'choisijun.com', key: '4e802235f2e5fd1078c45fb381ede353', sitemap: 'https://choisijun.com/sitemap.xml' }
];
const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'];

function parseSitemap(xml) {
  const out = [];
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) out.push([m[1].trim(), (m[2] || '').trim()]);
  return out;
}

async function pingSite(DB, site, force) {
  const flagKey = 'indexnow:' + site.host;
  const row = await DB.prepare('SELECT v FROM admin_flags WHERE k = ?').bind(flagKey).first();
  const state = row ? JSON.parse(row.v) : { sent: {} };
  const res = await fetch(site.sitemap, { cf: { cacheTtl: 0 }, headers: { 'user-agent': 'choisijun-notify (IndexNow)' } });
  if (!res.ok) return { host: site.host, error: 'sitemap ' + res.status };
  const items = parseSitemap(await res.text()).filter(([u]) => new URL(u).host === site.host);
  const changed = items.filter(([u, lm]) => force || state.sent[u] !== lm);
  const report = { host: site.host, at: new Date().toISOString(), total: items.length, changed: changed.length, results: {} };
  if (changed.length) {
    const body = JSON.stringify({ host: site.host, key: site.key, keyLocation: `https://${site.host}/${site.key}.txt`, urlList: changed.map(([u]) => u).slice(0, 10000) });
    let okAny = false;
    for (const ep of ENDPOINTS) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body });
        report.results[new URL(ep).host] = r.status;
        if (r.status === 200 || r.status === 202) okAny = true;
      } catch (e) { report.results[new URL(ep).host] = 'error'; }
    }
    if (okAny) changed.forEach(([u, lm]) => { state.sent[u] = lm; });
  }
  // 사이트맵에서 빠진 주소는 기록에서도 지운다
  const live = new Set(items.map(([u]) => u));
  for (const u of Object.keys(state.sent)) if (!live.has(u)) delete state.sent[u];
  state.last = report;
  await DB.prepare('INSERT OR REPLACE INTO admin_flags (k, v, at) VALUES (?, ?, ?)').bind(flagKey, JSON.stringify(state), report.at).run();
  return report;
}

export async function runIndexNow(env, force = false) {
  const out = [];
  for (const site of INDEXNOW_SITES) {
    try { out.push(await pingSite(env.DB, site, force)); } catch (e) { out.push({ host: site.host, error: String(e && e.message || e) }); }
  }
  return out;
}

export async function indexNowStatus(env) {
  const out = [];
  for (const site of INDEXNOW_SITES) {
    const row = await env.DB.prepare('SELECT v FROM admin_flags WHERE k = ?').bind('indexnow:' + site.host).first();
    const st = row ? JSON.parse(row.v) : null;
    out.push({ host: site.host, tracked: st ? Object.keys(st.sent).length : 0, last: st ? st.last : null });
  }
  return out;
}
