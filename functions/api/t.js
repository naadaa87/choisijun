/* =========================================================
   POST /api/t — 방문 통계 수집 (홈페이지 스크립트가 보냄)
   - e: 'pv'(페이지 조회) · 'end'(머문 시간·스크롤) · 'ck'(클릭·전환)
   - IP 주소와 쿠키는 저장하지 않는다. 방문자 구분은 브라우저에 만든 임의 번호(vid)로만 한다
   - 관리자로 로그인한 브라우저, 검색 로봇, 자동화 브라우저는 세지 않는다
   ========================================================= */
import { db, isAdmin, kst, clean, hasMemberCookie } from '../_lib/core.js';

export const BOT = /\bbot\b|bot\/|bytespider|crawl|spider|slurp|bingpreview|facebookexternalhit|meta-externalagent|headless|phantom|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl\/|wget\/|python|axios|node-fetch|go-http|java\/|okhttp|yeti\/|daumoa|kakaotalk-scrap|whatsapp\/|telegrambot|discordbot|slackbot|preview|scrap/i;

const SEARCH = [
  [/(^|\.)search\.naver\.com$|^m\.search\.naver\.com$|^naver\.com$|^www\.naver\.com$|^m\.naver\.com$/, '네이버'],
  [/(^|\.)google\.[a-z.]+$/, '구글'],
  [/(^|\.)search\.daum\.net$|^m\.search\.daum\.net$|^daum\.net$|^www\.daum\.net$|^m\.daum\.net$/, '다음'],
  [/(^|\.)bing\.com$/, '빙'],
  [/(^|\.)zum\.com$/, '줌'],
  [/(^|\.)yahoo\.[a-z.]+$/, '야후'],
  [/(^|\.)duckduckgo\.com$/, '덕덕고']
];
const AI = [
  [/(^|\.)chatgpt\.com$|^chat\.openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/^gemini\.google\.com$/, 'Gemini'],
  [/^copilot\.microsoft\.com$/, 'Copilot'],
  [/(^|\.)wrtn\.ai$/, '뤼튼']
];
const SNS = [
  [/(^|\.)instagram\.com$/, '인스타그램'],
  [/(^|\.)threads\.(net|com)$/, '스레드'],
  [/(^|\.)facebook\.com$|^fb\.me$/, '페이스북'],
  [/(^|\.)kakao\.com$|(^|\.)kakao\.co\.kr$/, '카카오'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, '유튜브'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, '링크드인'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'],
  [/(^|\.)band\.us$/, '밴드']
];
const BLOG = [
  [/^(m\.)?blog\.naver\.com$/, '네이버 블로그'],
  [/^(m\.)?cafe\.naver\.com$/, '네이버 카페'],
  [/(^|\.)tistory\.com$/, '티스토리'],
  [/(^|\.)brunch\.co\.kr$/, '브런치'],
  [/(^|\.)rocketpunch\.com$/, '로켓펀치'],
  [/(^|\.)thevc\.kr$/, '더브이씨']
];
const FAMILY = [
  [/(^|\.)socialfactory\.co\.kr$/, '소셜팩토리'],
  [/(^|\.)ssople\.com$/, '쏘플파티룸'],
  [/(^|\.)playtion\.kr$/, '플레이션'],
  [/(^|\.)megaspot\.kr$/, '메가스팟'],
  [/(^|\.)hellomingle\.kr$/, '헬로밍글'],
  [/(^|\.)vacancy\.co\.kr$/, '공실개발'],
  [/(^|\.)orbis-estate\.com$/, '오르비스'],
  [/(^|\.)coremood\.kr$/, '코어무드']
];
/* 주소 없이 들어온 경우, 앱 안의 브라우저면 그 앱에서 온 것으로 본다 */
const INAPP = [
  [/KAKAOTALK/i, 'SNS', '카카오톡'],
  [/Instagram/i, 'SNS', '인스타그램'],
  [/Barcelona/i, 'SNS', '스레드'],
  [/FBAN|FBAV|FB_IAB/i, 'SNS', '페이스북'],
  [/NAVER\(inapp|NaverMatome|\bNAVER\b/i, '검색', '네이버 앱'],
  [/DaumApps/i, '검색', '다음 앱'],
  [/\bBAND\//i, 'SNS', '밴드'],
  [/\bLine\//i, 'SNS', '라인']
];

const match = (list, host) => { for (const [re, name] of list) if (re.test(host)) return name; return ''; };

export function source(refUrl, selfHost, ua, utm) {
  let host = '';
  try { host = refUrl ? new URL(refUrl).hostname.toLowerCase() : ''; } catch (_) { host = ''; }
  if (host && (host === selfHost || host === 'www.' + selfHost || 'www.' + host === selfHost)) return { src: '내부 이동', srcd: '', ref: '' };
  if (utm) {
    const s = utm.split('|')[0].toLowerCase();
    const byName = match(SNS, s + '.com') || (/insta/.test(s) ? '인스타그램' : /kakao/.test(s) ? '카카오' : /thread/.test(s) ? '스레드' : /naver|blog/.test(s) ? '네이버' : '');
    if (byName) return { src: /naver|blog/.test(s) ? '블로그·커뮤니티' : 'SNS', srcd: byName, ref: host };
  }
  if (host) {
    let n;
    if ((n = match(BLOG, host))) return { src: '블로그·커뮤니티', srcd: n, ref: host };
    if ((n = match(AI, host))) return { src: 'AI 검색', srcd: n, ref: host };
    if ((n = match(SEARCH, host))) return { src: '검색', srcd: n, ref: host };
    if ((n = match(SNS, host))) return { src: 'SNS', srcd: n, ref: host };
    if ((n = match(FAMILY, host))) return { src: '패밀리 사이트', srcd: n, ref: host };
    return { src: '다른 사이트', srcd: host.replace(/^www\./, ''), ref: host };
  }
  for (const [re, src, name] of INAPP) if (re.test(ua)) return { src, srcd: name, ref: '' };
  return { src: '직접 방문', srcd: '', ref: '' };
}

export function device(ua) {
  const dev = /iPad|Tablet|SM-T|Android(?!.*Mobile)/i.test(ua) ? '태블릿' : /Mobi|iPhone|iPod|Android/i.test(ua) ? '모바일' : 'PC';
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '기타';
  const br = /KAKAOTALK/i.test(ua) ? '카카오톡 앱'
    : /Instagram/i.test(ua) ? '인스타그램 앱'
    : /NAVER\(inapp|\bNAVER\b/i.test(ua) ? '네이버 앱'
    : /FBAN|FBAV/i.test(ua) ? '페이스북 앱'
    : /Whale/i.test(ua) ? '웨일'
    : /SamsungBrowser/i.test(ua) ? '삼성 인터넷'
    : /Edg\//i.test(ua) ? '엣지'
    : /Firefox|FxiOS/i.test(ua) ? '파이어폭스'
    : /CriOS|Chrome/i.test(ua) ? '크롬'
    : /Safari/i.test(ua) ? '사파리' : '기타';
  return { dev, os, br };
}

/** 주소 정리: /about.html → /about, 끝의 / 제거, 검색어(?…) 제거 */
export function normPath(p) {
  let s = clean(p, 200).split('?')[0].split('#')[0] || '/';
  if (!s.startsWith('/')) s = '/' + s;
  s = s.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}
export const ID = /^[a-z0-9]{8,40}$/i;

export async function onRequestPost({ request, env, waitUntil }) {
  const ok = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  try {
    const site = request.headers.get('Sec-Fetch-Site');
    if (site && site !== 'same-origin') return ok();
    const ua = request.headers.get('User-Agent') || '';
    if (!ua || BOT.test(ua)) return ok();
    const text = await request.text();
    if (text.length > 4000) return ok();
    let b;
    try { b = JSON.parse(text); } catch (_) { return ok(); }
    const DB = await db(env).catch(() => null);
    if (!DB) return ok();
    if (await isAdmin(request, env)) return ok();

    const now = Date.now();
    const { day, hour } = kst(now);
    const vid = ID.test(b.v || '') ? b.v : '';
    const sid = ID.test(b.s || '') ? b.s : '';
    const path = normPath(b.p || '/');
    if (path.startsWith('/admin') || path.startsWith('/api')) return ok();

    const jobs = [];
    if (b.e === 'pv') {
      const pid = ID.test(b.id || '') ? b.id : '';
      if (!pid || !vid || !sid) return ok();
      const selfHost = new URL(request.url).hostname.toLowerCase();
      const utm = clean(b.u, 120);
      const s = source(clean(b.r, 400), selfHost, ua, utm);
      const d = device(ua);
      const cf = request.cf || {};
      const title = clean(b.t, 140).replace(/\s*[|·—-]\s*최시준\s*$/, '');
      jobs.push(DB.prepare(
        `INSERT INTO pv (pid, ts, day, hour, path, title, ref, src, srcd, utm, dev, br, os, country, region, vid, sid, new_v, new_s, member)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(pid, now, day, hour, path, title, s.ref, s.src, s.srcd, utm, d.dev, d.br, d.os,
        clean(cf.country, 4), clean(cf.region || cf.city, 60), vid, sid, b.nv ? 1 : 0, b.ns ? 1 : 0, hasMemberCookie(request) ? 1 : 0).run());
      /* 오래된 기록 정리 (약 13개월 지난 것) */
      if (Math.random() < 0.01) {
        const cut = now - 400 * 86400 * 1000;
        jobs.push(DB.batch([DB.prepare('DELETE FROM pv WHERE ts < ?').bind(cut), DB.prepare('DELETE FROM ev WHERE ts < ?').bind(cut)]));
      }
    } else if (b.e === 'end') {
      const pid = ID.test(b.id || '') ? b.id : '';
      if (!pid) return ok();
      const dur = Math.max(0, Math.min(Number(b.d) || 0, 30 * 60 * 1000));
      const sc = Math.max(0, Math.min(Math.round(Number(b.sc) || 0), 100));
      jobs.push(DB.prepare('UPDATE pv SET dur = MAX(dur, ?), scroll = MAX(scroll, ?) WHERE pid = ? AND ts > ?')
        .bind(Math.round(dur), sc, pid, now - 6 * 3600 * 1000).run());
    } else if (b.e === 'ck') {
      const kind = ['cta', 'nav', 'link', 'out', 'tel', 'mail', 'kakao', 'file', 'family', 'sns', 'conv'].includes(b.k) ? b.k : '';
      if (!kind || !vid) return ok();
      jobs.push(DB.prepare('INSERT INTO ev (ts, day, path, kind, label, target, vid, sid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(now, day, path, kind, clean(b.l, 80), clean(b.h, 200), vid, sid).run());
    }
    const all = Promise.all(jobs).catch(() => null);
    if (waitUntil) waitUntil(all); else await all;
  } catch (_) { /* 통계는 실패해도 방문에 영향을 주지 않는다 */ }
  return ok();
}

export const onRequestGet = () => new Response(null, { status: 204 });
