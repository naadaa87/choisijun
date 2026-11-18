/* =========================================================
   POST /api/c — 다른 사이트의 방문 기록 받기 (각 사이트에 넣은 /k.js 가 보냄)
   - 관리자 '전체 사이트'에 등록된 주소에서 온 것만 받는다 (보낸 곳의 주소로 사이트를 구분)
   - e: 'pv'(페이지 조회) · 'end'(머문 시간) · 'ck'(예약·전화·카톡 클릭, 신청서 제출)
   - IP 주소와 쿠키는 저장하지 않는다. 방문자 구분은 그 사이트 브라우저에 만든 임의 번호로만 한다
   ========================================================= */
import { db, kst, clean } from '../_lib/core.js';
import { ensureSeed } from '../_lib/sites.js';
import { SELF_ID } from '../_lib/sites-seed.js';
import { BOT, ID, source, device, normPath } from './t.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const KINDS = ['book', 'tel', 'kakao', 'mail', 'form', 'out', 'conv'];

let hostMap = null;
let hostAt = 0;

/** 등록된 주소 → 사이트 이름. 5분마다 새로 읽는다 */
async function siteOf(DB, host) {
  if (!hostMap || Date.now() - hostAt > 5 * 60 * 1000) {
    await ensureSeed(DB);
    const rows = (await DB.prepare("SELECT id, url, domain, alt FROM sites WHERE archived = 0").all()).results || [];
    const map = new Map();
    const put = (h, id) => { if (h && !map.has(h)) map.set(h, id); };
    rows.forEach((r) => {
      if (r.id === SELF_ID) return;                       // 이 홈페이지 자신은 /api/t 로 센다
      [r.url, r.alt].forEach((u) => { try { if (u) put(new URL(u).host.toLowerCase(), r.id); } catch (_) { /* ignore */ } });
      if (r.domain) { put(r.domain.toLowerCase(), r.id); put('www.' + r.domain.toLowerCase(), r.id); }
    });
    hostMap = map;
    hostAt = Date.now();
  }
  return hostMap.get(host) || '';
}

export async function onRequestPost({ request, env, waitUntil }) {
  const ok = () => new Response(null, { status: 204, headers: CORS });
  try {
    const ua = request.headers.get('User-Agent') || '';
    if (!ua || BOT.test(ua)) return ok();
    let host = '';
    try { host = new URL(request.headers.get('Origin') || request.headers.get('Referer') || '').host.toLowerCase(); } catch (_) { host = ''; }
    if (!host) return ok();
    const text = await request.text();
    if (text.length > 3000) return ok();
    let b;
    try { b = JSON.parse(text); } catch (_) { return ok(); }
    const DB = await db(env).catch(() => null);
    if (!DB) return ok();
    const site = await siteOf(DB, host);
    if (!site) return ok();

    const now = Date.now();
    const { day } = kst(now);
    const vid = ID.test(b.v || '') ? b.v : '';
    const path = normPath(b.p || '/');
    const jobs = [];
    if (b.e === 'pv') {
      const pid = ID.test(b.id || '') ? b.id : '';
      const sid = ID.test(b.s || '') ? b.s : '';
      if (!pid || !vid || !sid) return ok();
      const s = source(clean(b.r, 400), host, ua, clean(b.u, 120));
      jobs.push(DB.prepare(
        'INSERT INTO xpv (site, pid, ts, day, path, src, srcd, dev, vid, sid, new_v, new_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(site, pid, now, day, path, s.src, s.srcd, device(ua).dev, vid, sid, b.nv ? 1 : 0, b.ns ? 1 : 0).run());
      if (Math.random() < 0.01) {
        const cut = now - 400 * 86400 * 1000;
        jobs.push(DB.batch([DB.prepare('DELETE FROM xpv WHERE ts < ?').bind(cut), DB.prepare('DELETE FROM xev WHERE ts < ?').bind(cut)]));
      }
    } else if (b.e === 'end') {
      const pid = ID.test(b.id || '') ? b.id : '';
      if (!pid) return ok();
      const dur = Math.max(0, Math.min(Number(b.d) || 0, 30 * 60 * 1000));
      jobs.push(DB.prepare('UPDATE xpv SET dur = MAX(dur, ?) WHERE pid = ? AND site = ? AND ts > ?').bind(Math.round(dur), pid, site, now - 6 * 3600 * 1000).run());
    } else if (b.e === 'ck') {
      const kind = KINDS.includes(b.k) ? b.k : '';
      if (!kind || !vid) return ok();
      jobs.push(DB.prepare('INSERT INTO xev (site, ts, day, path, kind, label, target, vid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(site, now, day, path, kind, clean(b.l, 80), clean(b.h, 200), vid).run());
    }
    const all = Promise.all(jobs).catch(() => null);
    if (waitUntil) waitUntil(all); else await all;
  } catch (_) { /* 통계는 실패해도 방문에 영향을 주지 않는다 */ }
  return ok();
}

export const onRequestOptions = () => new Response(null, {
  status: 204,
  headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }
});
export const onRequestGet = () => new Response(null, { status: 204, headers: CORS });
