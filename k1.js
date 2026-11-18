/* =========================================================
   k1.js — 사이트별 KPI용 방문 수집 (최시준 관리자 '전체 KPI')
   각 사이트의 </body> 앞에 한 줄만 넣습니다 (관리자 → 전체 사이트 → 방문 자동 수집 넣는 법에서 복사):
     <script defer src="https://choisijun.com/k1.js" integrity="sha384-…" crossorigin="anonymous"></script>
   ※ k1.js 는 각 사이트가 내용 확인값(integrity)으로 고정해 불러옵니다. 이 파일을 고치면 이미 넣어 둔 사이트에서는
     실행되지 않으니, 고칠 때는 k2.js 처럼 새 이름으로 만들고 각 사이트의 한 줄을 바꿔야 합니다.
   - 보내는 것: 본 페이지 주소(번호·열쇠 값은 가림), 들어온 사이트의 도메인, 머문 시간, 예약·전화·카카오톡 링크를 누른 횟수, 신청서 제출 횟수
   - 이름·연락처·입력한 내용·IP 주소·쿠키는 보내지도 저장하지도 않습니다
   - 방문자 구분은 이 브라우저에 만든 임의 번호로만 합니다 (다른 사이트와 이어지지 않습니다)
   - 운영자 브라우저 빼기: 사이트 주소 뒤에 ?k_off=1 을 붙여 한 번 열면 그 브라우저는 세지 않습니다 (?k_off=0 으로 되돌림)
   - 버튼에 data-kpi="예약" 처럼 적어 두면 그 이름으로 클릭을 셉니다
   ========================================================= */
(function () {
  'use strict';
  try {
    var script = document.currentScript;
    if (!script || !/^https?:$/.test(location.protocol) || navigator.webdriver) return;
    if (window.__kpiLoaded) return;          // 같은 페이지에 두 번 들어가도 한 번만 센다
    window.__kpiLoaded = true;
    var API = new URL(script.src).origin + '/api/c';
    var ls = null;
    try { ls = window.localStorage; } catch (_) { ls = null; }
    var get = function (k) { try { return ls ? JSON.parse(ls.getItem(k) || 'null') : null; } catch (_) { return null; } };
    var put = function (k, v) { try { if (ls) ls.setItem(k, JSON.stringify(v)); } catch (_) { /* 저장 불가 */ } };

    var qs = new URLSearchParams(location.search);
    if (qs.get('k_off') === '1') put('k_off', true);
    if (qs.get('k_off') === '0') put('k_off', false);
    /* 관리자·호스트·내 정보처럼 로그인해서 쓰는 화면은 세지 않는다 */
    if (get('k_off') || /^\/(admin|host|hosts|hostcenter|manage|manager|console|dashboard|app|my|mypage|account|portal|staff|owner)(\/|\.|$)/i.test(location.pathname)) return;
    /* 주소에 들어 있는 예약번호·접수번호·열쇠 값은 보내지 않는다: 숫자가 섞인 긴 마디는 ':id' 로 바꾼다 */
    var mask = function (p) {
      return String(p || '/').split('/').map(function (seg) {
        return (seg.length >= 24 || (seg.length >= 8 && /\d/.test(seg))) && !/\.html?$/i.test(seg) ? ':id' : seg;
      }).join('/').slice(0, 160);
    };

    var rid = function () {
      try {
        var a = new Uint8Array(10);
        window.crypto.getRandomValues(a);
        return Array.from(a, function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, 16);
      } catch (_) { return (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 16).padEnd(12, '0'); }
    };
    var GAP = 30 * 60 * 1000;
    var refOrigin = '';
    var external = false;
    try {
      if (document.referrer) { var r = new URL(document.referrer); refOrigin = r.origin; external = r.host !== location.host; }
    } catch (_) { refOrigin = ''; }
    var utm = qs.get('utm_source') ? [qs.get('utm_source'), qs.get('utm_medium') || '', qs.get('utm_campaign') || ''].join('|').slice(0, 120) : '';

    var visitor = get('k_v');
    var newVisitor = !visitor || !visitor.id;
    if (newVisitor) { visitor = { id: rid() }; put('k_v', visitor); }
    var sess = get('k_s');
    var newSession = false;
    var now = Date.now();
    if (external || utm || !sess || !sess.id || now - (sess.last || 0) > GAP) { sess = { id: rid(), last: now }; newSession = true; } else sess.last = now;
    put('k_s', sess);

    var send = function (data) {
      var body = JSON.stringify(data);
      try { if (navigator.sendBeacon && navigator.sendBeacon(API, body)) return; } catch (_) { /* 아래로 */ }
      try { fetch(API, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); } catch (_) { /* ignore */ }
    };

    /* 페이지 조회와 머문 시간 (화면이 보이는 동안만) */
    var pid = '';
    var active = 0;
    var seg = 0;
    var sent = -1;
    var lastPath = '';
    var visible = function () { return document.visibilityState === 'visible'; };
    var pause = function () { if (seg) { active += performance.now() - seg; seg = 0; } };
    var resume = function () { if (!seg && visible()) seg = performance.now(); };
    var flush = function () {
      if (!pid) return;
      var d = Math.round(active + (seg ? performance.now() - seg : 0));
      if (Math.round(d / 1000) === sent) return;
      sent = Math.round(d / 1000);
      send({ e: 'end', id: pid, d: d });
      sess.last = Date.now(); put('k_s', sess);
    };
    var start = function () {
      var p = mask(location.pathname) + (/^#\/./.test(location.hash) ? '#/' + location.hash.slice(2).split(/[/?]/)[0] : '');
      if (p === lastPath) return;
      if (pid) { pause(); flush(); }
      lastPath = p;
      pid = rid(); active = 0; seg = 0; sent = -1;
      resume();
      send({ e: 'pv', id: pid, v: visitor.id, s: sess.id, nv: newVisitor, ns: newSession, p: p, r: refOrigin, u: utm });
      newVisitor = false; newSession = false; refOrigin = '';
    };
    document.addEventListener('visibilitychange', function () { if (visible()) resume(); else { pause(); flush(); } });
    window.addEventListener('pagehide', function () { pause(); flush(); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) { lastPath = ''; start(); } });
    /* 화면만 바뀌는 사이트(SPA)도 페이지마다 센다 */
    ['pushState', 'replaceState'].forEach(function (fn) {
      var orig = history[fn];
      if (typeof orig !== 'function') return;
      history[fn] = function () { var out = orig.apply(this, arguments); setTimeout(start, 0); return out; };
    });
    window.addEventListener('popstate', function () { setTimeout(start, 0); });
    window.addEventListener('hashchange', function () { setTimeout(start, 0); });

    /* 클릭: 예약 · 전화 · 카카오톡 · 메일 */
    var BOOK = /(^|\.)(booking\.naver\.com|naver\.me|spacecloud\.kr|hourplace\.co\.kr|airbnb\.(com|co\.kr)|yanolja\.com|goodchoice\.kr|catchtable\.co\.kr)$/i;
    var KAKAO = /(^|\.)(pf\.kakao\.com|open\.kakao\.com|kakao\.com)$/i;
    var labelOf = function (el) {
      return (el.getAttribute('data-kpi') || el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    };
    /* 버튼 이름은 예약·신청 버튼만 보낸다 (전화·카톡·메일 링크의 글자는 보내지 않는다) */
    var ck = function (kind, label, target) {
      send({ e: 'ck', k: kind, l: kind === 'book' || kind === 'conv' || kind === 'form' ? label : '', h: mask(target), v: visitor.id, p: mask(location.pathname) });
    };
    document.addEventListener('click', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('a[href], button, [data-kpi]') : null;
      if (!el) return;
      var label = labelOf(el);
      if (el.hasAttribute('data-kpi')) { ck(/예약|book|reserv/i.test(label) ? 'book' : 'conv', label, el.getAttribute('href') || ''); return; }
      if (el.tagName === 'A') {
        var raw = el.getAttribute('href') || '';
        var u;
        try { u = new URL(el.href, location.href); } catch (_) { return; }
        if (u.protocol === 'tel:' || u.protocol === 'sms:') { ck('tel', label, ''); return; }
        if (u.protocol === 'mailto:') { ck('mail', label, ''); return; }
        if (!/^https?:$/.test(u.protocol) || !raw || raw === '#') return;
        var target = u.host === location.host ? u.pathname : (u.host + u.pathname).replace(/\/$/, '');
        if (BOOK.test(u.host) || /booking|reserv/i.test(u.pathname) || /예약/.test(label)) { ck('book', label, target); return; }
        if (KAKAO.test(u.host)) { ck('kakao', label, target); return; }
        return;
      }
      if (/예약/.test(label)) ck('book', label, '');
    }, true);
    document.addEventListener('submit', function (ev) {
      var f = ev.target;
      if (!f || f.tagName !== 'FORM') return;
      if (f.getAttribute('role') === 'search' || /search|login|signin/i.test((f.id || '') + ' ' + (f.getAttribute('name') || '') + ' ' + (f.className || ''))) return;
      ck('form', (f.getAttribute('data-kpi') || f.getAttribute('aria-label') || f.id || f.getAttribute('name') || '신청서').slice(0, 60), '');
    }, true);

    start();
  } catch (_) { /* 통계는 실패해도 사이트에 영향을 주지 않는다 */ }
})();
