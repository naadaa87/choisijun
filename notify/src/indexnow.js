/* =========================================================
   IndexNow — 바뀐 주소를 검색엔진에 바로 알린다
   · 사이트맵의 <lastmod> 가 지난번에 알린 날짜와 다른 주소만 골라 보낸다 (처음에는 전부)
   · 보내는 곳: IndexNow(api.indexnow.org → 막히면 bing.com → yandex.com) + 네이버 서치어드바이저, 갈래별로 따로 기록
   · 키 파일은 각 사이트 루트에 <KEY>.txt 로 올려 둔다 (choisijun.com 은 저장소 루트)
   · 기록은 choisijun-db 의 admin_flags('indexnow:<host>') 에 남긴다
   ========================================================= */
export const INDEXNOW_SITES = [
  { host: 'choisijun.com', key: '4e802235f2e5fd1078c45fb381ede353', sitemap: 'https://choisijun.com/sitemap.xml' }
];
// 보내는 곳은 두 갈래로 따로 기록한다. 한쪽이 실패해도 다음 시간에 그쪽만 다시 보낸다.
// IndexNow 는 한 곳에 보내면 참여 검색엔진끼리 공유하므로, 앞 주소가 거절하면(429 등) 다음 주소로 넘어간다.
const CHANNELS = [
  { id: 'indexnow', urls: ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow', 'https://yandex.com/indexnow'] },
  { id: 'naver', urls: ['https://searchadvisor.naver.com/indexnow'] }
];

function parseSitemap(xml) {
  const out = [];
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) out.push([m[1].trim(), (m[2] || '').trim()]);
  return out;
}

function loadState(row) {
  const st = row ? JSON.parse(row.v) : {};
  let sent = st.sent || {};
  // 예전 형식(주소 → 날짜 한 묶음)은 네이버로 보낸 기록으로 옮긴다
  if (Object.keys(sent).some(k => k.startsWith('http'))) sent = { naver: sent };
  for (const ch of CHANNELS) sent[ch.id] = sent[ch.id] || {};
  return { sent, last: st.last || null, lastSent: st.lastSent || null };
}

async function pingSite(DB, site, force) {
  const flagKey = 'indexnow:' + site.host;
  const row = await DB.prepare('SELECT v FROM admin_flags WHERE k = ?').bind(flagKey).first();
  const state = loadState(row);
  const res = await fetch(site.sitemap, { cf: { cacheTtl: 0 }, headers: { 'user-agent': 'choisijun-notify (IndexNow)' } });
  if (!res.ok) return { host: site.host, error: 'sitemap ' + res.status };
  const items = parseSitemap(await res.text()).filter(([u]) => new URL(u).host === site.host);
  const report = { host: site.host, at: new Date().toISOString(), total: items.length, changed: {}, results: {} };
  for (const ch of CHANNELS) {
    const sent = state.sent[ch.id];
    const changed = items.filter(([u, lm]) => force || sent[u] !== lm);
    report.changed[ch.id] = changed.length;
    if (!changed.length) continue;
    const body = JSON.stringify({ host: site.host, key: site.key, keyLocation: `https://${site.host}/${site.key}.txt`, urlList: changed.map(([u]) => u).slice(0, 10000) });
    for (const ep of ch.urls) {
      let status;
      try {
        const r = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body });
        status = r.status;
      } catch (e) { status = 'error'; }
      report.results[new URL(ep).host] = status;
      if (status === 200 || status === 202) { changed.forEach(([u, lm]) => { sent[u] = lm; }); break; }
    }
  }
  // 사이트맵에서 빠진 주소는 기록에서도 지운다
  const live = new Set(items.map(([u]) => u));
  for (const ch of CHANNELS) for (const u of Object.keys(state.sent[ch.id])) if (!live.has(u)) delete state.sent[ch.id][u];
  state.last = report;
  if (Object.keys(report.results).length) state.lastSent = report;
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
    const st = loadState(row);
    const tracked = {};
    for (const ch of CHANNELS) tracked[ch.id] = Object.keys(st.sent[ch.id]).length;
    out.push({ host: site.host, tracked, last: st.last, lastSent: st.lastSent });
  }
  return out;
}
