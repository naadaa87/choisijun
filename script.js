/* =========================================================
   최시준 개인 브랜딩 홈페이지 — 공통 스크립트 (멀티페이지)
   순수 Vanilla JS · 프레임워크/빌드 불필요
   ---------------------------------------------------------
   설정값(Supabase · Web3Forms · 문의 이메일)은 site-config.js 에 있습니다.
   - Supabase 값이 비어 있으면: "데모 모드"
     (게시판 글이 본인 브라우저에만 저장, 회원가입은 준비 중 안내)
   - 값을 채우면: 회원가입·로그인, 공유 게시판, 문의 기록이 실제로 작동
   - 설정 순서: 기능활성화-가이드.md
   ========================================================= */
const SITE_CFG = window.SITE_CONFIG || {};
const COMMUNITY_BACKEND = {
  supabaseUrl: String(SITE_CFG.supabaseUrl || '').trim().replace(/\/+$/, ''),
  supabaseAnonKey: String(SITE_CFG.supabaseKey || '').trim(),
  table: 'community_posts',
  commentsTable: 'community_comments',
  referencesTable: 'site_references',
  inquiriesTable: 'inquiries',
  profilesTable: 'profiles'
};
const CONTACT_EMAIL = SITE_CFG.contactEmail || 'runactivator@naver.com';
const FORM_ACCESS_KEY = String(SITE_CFG.formAccessKey || '').trim();
const ADMIN_CODE = SITE_CFG.demoAdminCode || '';
const SOCIAL_LOGIN = Array.isArray(SITE_CFG.socialLogin) ? SITE_CFG.socialLogin : [];

/* =========================================================
   공통 유틸
   ========================================================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_REMOTE = Boolean(COMMUNITY_BACKEND.supabaseUrl && COMMUNITY_BACKEND.supabaseAnonKey);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/* 삭제 비밀번호용 간단 해시 (보안용이 아닌 우발적 삭제 방지용 — 데모 모드 전용) */
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
/* 모바일 가로 스크롤 칩을 눌렀을 때 화면 중앙으로 */
function centerChip(el) {
  if (!el || !el.scrollIntoView) return;
  el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
}
/* 로그인 후 돌아갈 주소 — 같은 사이트 안의 경로만 허용 */
function safeNext(raw, fallback = '/account') {
  const v = String(raw || '');
  return (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) ? v : fallback;
}
function loginUrl(next) {
  const here = location.pathname.replace(/\.html$/, '');
  if (!next && (here === '/login' || here === '/account')) return '/login';
  return '/login?next=' + encodeURIComponent(next || (location.pathname + location.search));
}

/* ---------- Supabase REST ---------- */
function sbHeaders(extra = {}, token) {
  const key = COMMUNITY_BACKEND.supabaseAnonKey;
  const h = { apikey: key, 'Content-Type': 'application/json' };
  /* 로그인 토큰이 있으면 그것을, 없으면 예전 방식(anon JWT) 키일 때만 Bearer로 보낸다.
     새 방식 Publishable key(sb_publishable_…)는 apikey 헤더로만 보낸다. */
  const bearer = token || (key.startsWith('eyJ') ? key : '');
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  return Object.assign(h, extra);
}
function sbUrl(table) {
  return `${COMMUNITY_BACKEND.supabaseUrl}/rest/v1/${table}`;
}
async function sbSelect(table, query, token) {
  const res = await fetch(`${sbUrl(table)}?${query}`, { headers: sbHeaders({}, token) });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}
async function sbInsert(table, row, opts = {}) {
  const res = await fetch(sbUrl(table), {
    method: 'POST',
    headers: sbHeaders({ Prefer: opts.minimal ? 'return=minimal' : 'return=representation' }, opts.token),
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error('insert failed');
  return opts.minimal ? null : res.json();
}
async function sbUpdate(table, filter, patch, token) {
  const res = await fetch(`${sbUrl(table)}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=representation' }, token),
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error('update failed');
  return res.json();
}
async function sbDelete(table, filter, token) {
  const res = await fetch(`${sbUrl(table)}?${filter}`, { method: 'DELETE', headers: sbHeaders({}, token) });
  if (!res.ok) throw new Error('delete failed');
}
async function sbCount(table, filter, token) {
  const res = await fetch(`${sbUrl(table)}?select=id${filter ? '&' + filter : ''}`, {
    method: 'HEAD', headers: sbHeaders({ Prefer: 'count=exact' }, token)
  });
  if (!res.ok) throw new Error('count failed');
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

/* =========================================================
   회원 인증 (Supabase Auth) — 이메일 가입 · 로그인 · 비밀번호 찾기 · 간편 로그인
   - 세션은 이 브라우저의 localStorage 에 보관
   - 메일 인증·비밀번호 재설정 링크로 돌아오면 주소의 #access_token 을 읽어 로그인 처리
   ========================================================= */
const AUTH_STORE = 'csj_auth_v1';

const AUTH_ERRORS = [
  [/already registered|already been registered|user_already_exists/i, '이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.'],
  [/invalid login credentials|invalid_credentials/i, '이메일 또는 비밀번호가 맞지 않습니다.'],
  [/email not confirmed|email_not_confirmed/i, '메일 인증이 아직 끝나지 않았습니다. 가입할 때 받은 메일의 링크를 눌러 주세요.'],
  [/rate limit|over_email_send_rate_limit|too many/i, '요청이 많아 잠시 막혀 있습니다. 몇 분 뒤 다시 시도해 주세요.'],
  [/password should be|weak_password|at least/i, '비밀번호가 너무 짧거나 단순합니다. 영문과 숫자를 섞어 8자 이상으로 정해 주세요.'],
  [/same_password|should be different/i, '지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.'],
  [/signup.*disabled|signups not allowed/i, '지금은 새 회원가입을 받지 않고 있습니다.'],
  [/invalid.*email|email_address_invalid|unable to validate email/i, '이메일 주소를 다시 확인해 주세요.'],
  [/not authorized|email_address_not_authorized/i, '메일 발송 설정이 아직 끝나지 않았습니다. 운영자에게 문의해 주세요.'],
  [/otp_expired|expired/i, '링크의 유효 시간이 지났습니다. 다시 요청해 주세요.'],
  [/failed to fetch|network/i, '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.']
];
function authMessage(err) {
  const raw = String((err && (err.message || err.msg || err.error_description || err.error)) || err || '');
  for (const [re, msg] of AUTH_ERRORS) if (re.test(raw) || re.test(String(err && err.code || ''))) return msg;
  return '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

const Auth = (function authCore() {
  const listeners = [];
  let session = null;      // { access_token, refresh_token, expires_at, user }
  let profile = null;
  let lastEvent = '';      // signup | recovery | magiclink | email_change | oauth
  let hashError = '';

  function read() {
    try { const raw = localStorage.getItem(AUTH_STORE); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function write(s) {
    session = s; profile = null;
    try { if (s) localStorage.setItem(AUTH_STORE, JSON.stringify(s)); else localStorage.removeItem(AUTH_STORE); } catch (_) { /* 저장 불가 브라우저 */ }
    listeners.forEach((fn) => { try { fn(s); } catch (_) { /* ignore */ } });
  }
  function fromTokenResponse(d) {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Number(d.expires_at) || (now + (Number(d.expires_in) || 3600)),
      user: d.user || null
    };
  }
  async function api(path, { method = 'GET', body, token, query } = {}) {
    const url = `${COMMUNITY_BACKEND.supabaseUrl}/auth/v1/${path}${query ? '?' + query : ''}`;
    const headers = { apikey: COMMUNITY_BACKEND.supabaseAnonKey, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + res.status));
      e.code = data && (data.error_code || data.code);
      e.status = res.status;
      throw e;
    }
    return data;
  }
  async function refresh() {
    if (!session || !session.refresh_token) return null;
    try {
      const d = await api('token', { method: 'POST', query: 'grant_type=refresh_token', body: { refresh_token: session.refresh_token } });
      write(fromTokenResponse(d));
      return session;
    } catch (e) {
      if (e.status && e.status < 500) write(null);   // 만료·취소된 세션
      return null;
    }
  }
  async function token() {
    if (!session) return null;
    if ((session.expires_at * 1000) - Date.now() < 60 * 1000) await refresh();
    return session ? session.access_token : null;
  }
  /* 메일 링크·간편 로그인에서 돌아왔을 때 주소의 #access_token=… 처리 */
  async function consumeHash() {
    const h = location.hash ? location.hash.slice(1) : '';
    if (!h || !/(access_token|error_description|error_code)=/.test(h)) return;
    const p = new URLSearchParams(h);
    history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error') || p.get('error_code')) {
      hashError = authMessage({ message: p.get('error_description') || p.get('error'), code: p.get('error_code') });
      return;
    }
    const s = fromTokenResponse({
      access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
      expires_at: p.get('expires_at'), expires_in: p.get('expires_in')
    });
    lastEvent = p.get('type') || 'oauth';
    try { s.user = await api('user', { token: s.access_token }); } catch (_) { /* 사용자 정보는 나중에 */ }
    write(s);
  }

  async function init() {
    if (!IS_REMOTE) return;
    session = read();
    await consumeHash();
    if (session && (session.expires_at * 1000) - Date.now() < 60 * 1000) await refresh();
  }
  const ready = init().catch(() => { /* 연결 오류여도 사이트는 계속 */ });

  return {
    ready,
    get enabled() { return IS_REMOTE; },
    get user() { return session ? session.user : null; },
    get event() { return lastEvent; },
    get hashError() { return hashError; },
    token,
    onChange(fn) { listeners.push(fn); },
    displayName() {
      const u = session && session.user;
      if (!u) return '';
      const m = u.user_metadata || {};
      return (profile && profile.name) || m.name || m.full_name || m.nickname || (u.email || '').split('@')[0] || '회원';
    },
    async signUp(email, password, meta) {
      const d = await api('signup', {
        method: 'POST', query: 'redirect_to=' + encodeURIComponent(location.origin + '/account?welcome=1'),
        body: { email, password, data: meta }
      });
      if (d && d.access_token) { write(fromTokenResponse(d)); return { session: true }; }
      const user = d && (d.user || d);
      /* 이미 가입된 이메일이면 identities 가 비어서 온다(메일 인증을 켠 경우) */
      return { session: false, existing: Boolean(user && Array.isArray(user.identities) && user.identities.length === 0) };
    },
    async signIn(email, password) {
      const d = await api('token', { method: 'POST', query: 'grant_type=password', body: { email, password } });
      write(fromTokenResponse(d));
      return session;
    },
    async resend(email) {
      await api('resend', { method: 'POST', body: { type: 'signup', email } });
    },
    async recover(email) {
      await api('recover', {
        method: 'POST', query: 'redirect_to=' + encodeURIComponent(location.origin + '/account?reset=1'), body: { email }
      });
    },
    async updatePassword(password) {
      const t = await token();
      const u = await api('user', { method: 'PUT', token: t, body: { password } });
      if (session) { session.user = u; write(session); }
    },
    async signOut() {
      const t = session ? session.access_token : null;
      write(null);
      if (t) { try { await api('logout', { method: 'POST', token: t }); } catch (_) { /* 이미 만료 */ } }
    },
    oauthUrl(provider, next) {
      const back = location.origin + safeNext(next, '/account');
      return `${COMMUNITY_BACKEND.supabaseUrl}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(back)}`;
    },
    async getProfile(force) {
      if (!session || !session.user) return null;
      if (profile && !force) return profile;
      const t = await token();
      try {
        const rows = await sbSelect(COMMUNITY_BACKEND.profilesTable, `id=eq.${session.user.id}&select=*`, t);
        profile = rows && rows[0] ? rows[0] : null;
      } catch (_) { profile = null; }
      return profile;
    },
    async updateProfile(patch) {
      const t = await token();
      const rows = await sbUpdate(COMMUNITY_BACKEND.profilesTable, `id=eq.${session.user.id}`, patch, t);
      profile = rows && rows[0] ? rows[0] : profile;
      return profile;
    },
    async isAdmin() {
      const p = await this.getProfile();
      return Boolean(p && p.role === 'admin');
    },
    async deleteAccount() {
      const t = await token();
      const res = await fetch(`${COMMUNITY_BACKEND.supabaseUrl}/rest/v1/rpc/delete_my_account`, {
        method: 'POST', headers: sbHeaders({}, t), body: '{}'
      });
      if (!res.ok) throw new Error('delete failed');
      write(null);
    }
  };
})();

/* 헤더의 로그인 / 마이페이지 버튼 */
(function navAccountModule() {
  const links = $$('[data-account-link]');
  if (!links.length || !Auth.enabled) return;   // 회원 기능을 켜기 전에는 기본 주소(/login) 그대로
  function paint() {
    const on = Boolean(Auth.user);
    links.forEach((a) => {
      const label = on ? '마이페이지' : '로그인';
      a.setAttribute('href', on ? '/account' : loginUrl());
      a.setAttribute('aria-label', on ? `마이페이지 (${Auth.displayName()})` : '로그인 · 회원가입');
      a.classList.toggle('is-in', on);
      const t = $('.na-text', a);
      if (t) t.textContent = label;
    });
  }
  paint();
  Auth.ready.then(paint);
  Auth.onChange(paint);
})();

/* =========================================================
   헤더 · 내비게이션 · 스크롤 공통
   ========================================================= */
(function headerModule() {
  const header = $('#header');
  const progressBar = $('#progressBar');
  const floatCta = $('#floatCta');
  const toTop = $('#toTop');

  function onScroll() {
    const y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 10);
    if (progressBar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = max > 0 ? `${(y / max) * 100}%` : '0%';
    }
    const show = y > 600;
    if (floatCta) floatCta.classList.toggle('is-show', show);
    if (toTop) toTop.classList.toggle('is-show', show);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) toTop.addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' }));

  /* 모바일 내비 */
  const navToggle = $('#navToggle');
  const nav = $('#nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-locked', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => {
      nav.classList.remove('is-open');
      navToggle.classList.remove('is-open');
      document.body.classList.remove('nav-locked');
      navToggle.setAttribute('aria-expanded', 'false');
    }));
  }

  /* 페이지 내 앵커 부드러운 이동 */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();

/* =========================================================
   등장 애니메이션 · 카운터
   ========================================================= */
(function revealModule() {
  const items = $$('.reveal');
  if (!items.length) return;
  if (prefersReducedMotion) { items.forEach((el) => el.classList.add('is-in')); return; }
  document.body.classList.add('js-anim'); /* JS 확인 후에만 숨김 상태 활성화 */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
})();

(function counterModule() {
  const counters = $$('.count');
  if (!counters.length) return;
  const animate = (el) => {
    const target = parseInt(el.dataset.count || '0', 10);
    if (prefersReducedMotion) { el.textContent = String(target); return; }
    const dur = 1200; const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { animate(en.target); io.unobserve(en.target); } });
  }, { threshold: 0.6 });
  counters.forEach((el) => io.observe(el));
})();

/* =========================================================
   [index] 건물 다이어그램 — 공실 → 수익공간 전환 연출
   ========================================================= */
(function buildingModule() {
  const grid = $('#buildingGrid');
  if (!grid) return;
  const vacants = $$('.unit.is-vacant', grid);
  if (!vacants.length) return;
  const convert = (unit) => {
    const label = unit.dataset.to || '수익공간';
    unit.classList.remove('is-vacant');
    unit.classList.add('is-converted');
    const floor = unit.querySelector('i') ? unit.querySelector('i').outerHTML : '';
    unit.innerHTML = `${floor}${escapeHtml(label)}`;
  };
  if (prefersReducedMotion) { vacants.forEach(convert); return; }
  let idx = 0;
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    const timer = setInterval(() => {
      if (idx >= vacants.length) { clearInterval(timer); return; }
      convert(vacants[idx]); idx += 1;
    }, 650);
  }, { threshold: 0.4 });
  io.observe(grid);
})();

/* =========================================================
   [cases] 사례 탭
   ========================================================= */
(function caseTabsModule() {
  const tabs = $$('.case-tab');
  const panels = $$('.case-panel');
  if (!tabs.length || !panels.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      panels.forEach((p) => { p.classList.remove('is-active'); p.hidden = true; });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      centerChip(tab);
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) { panel.hidden = false; panel.classList.add('is-active'); }
    });
  });
})();

/* =========================================================
   [contact] 자가진단 퀴즈
   ========================================================= */
const QUIZ = [
  { q: 'Q1. 현재 공간 상황은 어떤가요?',
    opts: [
      { t: '보유 중인 공간(건물·호실)이 있다', s: 3 },
      { t: '임차를 검토 중인 공간이 있다', s: 2 },
      { t: '운영 중인데 성과가 부진하다', s: 2 },
      { t: '아직 없다 — 창업을 검토하는 단계', s: 1 }
    ] },
  { q: 'Q2. 접근성은 어느 정도인가요?',
    opts: [
      { t: '역·정류장에서 도보 10분 이내', s: 3 },
      { t: '도보 10~20분 수준', s: 2 },
      { t: '차량 위주로 접근하는 위치', s: 1 }
    ] },
  { q: 'Q3. 전용면적 규모는?',
    opts: [
      { t: '10평 미만', s: 1 },
      { t: '10~30평', s: 3 },
      { t: '30평 이상', s: 2 }
    ] },
  { q: 'Q4. 월 고정비(임대료+관리비) 부담 수준은?',
    opts: [
      { t: '여유 있게 감당 가능하다', s: 3 },
      { t: '빠듯하지만 감당 가능하다', s: 2 },
      { t: '부담이 큰 편이다', s: 1 }
    ] },
  { q: 'Q5. 주변 수요는 어떤가요?',
    opts: [
      { t: '주거·오피스·대학·관광 수요가 밀집', s: 3 },
      { t: '보통 수준의 유동·수요', s: 2 },
      { t: '유동이 적고 수요가 불확실', s: 1 }
    ] },
  { q: 'Q6. 운영 방식에 대한 생각은?',
    opts: [
      { t: '무인·자동화 운영을 적극 수용', s: 3 },
      { t: '일부 무인화는 가능', s: 2 },
      { t: '직접 상주 운영을 원한다', s: 1 }
    ] }
];

(function quizModule() {
  const body = $('#quizBody');
  const result = $('#quizResult');
  if (!body || !result) return;
  const stepEl = $('#quizStep');
  const qEl = $('#quizQuestion');
  const optsEl = $('#quizOptions');
  const scoreEl = $('#quizScoreText');
  const titleEl = $('#quizResultTitle');
  const descEl = $('#quizResultDesc');
  const retry = $('#quizRetry');
  let step = 0; let score = 0;

  function renderStep() {
    const item = QUIZ[step];
    stepEl.textContent = String(step + 1);
    qEl.textContent = item.q;
    optsEl.innerHTML = '';
    item.opts.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-opt';
      btn.textContent = opt.t;
      btn.addEventListener('click', () => {
        score += opt.s; step += 1;
        if (step < QUIZ.length) renderStep(); else renderResult();
      });
      optsEl.appendChild(btn);
    });
  }
  function renderResult() {
    body.hidden = true; result.hidden = false;
    scoreEl.textContent = `SCORE — ${score} / 18`;
    if (score >= 15) {
      titleEl.textContent = '수익화 잠재력이 높은 공간입니다';
      descEl.textContent = '조건이 좋은 편입니다. 어떤 모델(파티룸·스터디·스테이·무인매장 등)이 최적인지가 관건이며, 상세 진단으로 수익 시나리오를 비교해보시길 권합니다.';
    } else if (score >= 10) {
      titleEl.textContent = '설계에 따라 결과가 갈리는 공간입니다';
      descEl.textContent = '가능성은 있지만 콘셉트·비용구조 설계가 성패를 좌우합니다. 목적형 수요를 먼저 확인한 뒤 투자 규모를 정하는 순서를 권합니다.';
    } else {
      titleEl.textContent = '신중한 검토가 필요한 조건입니다';
      descEl.textContent = '현재 조건으로는 리스크가 있습니다. 다만 계약 조건 조정이나 모델 전환으로 달라질 수 있으니, 진행 전 진단을 먼저 받아보시길 권합니다.';
    }
    result.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  }
  if (retry) retry.addEventListener('click', () => {
    step = 0; score = 0; result.hidden = true; body.hidden = false; renderStep();
  });
  renderStep();
})();

/* =========================================================
   [contact] 문의 유형 프리셋 + mailto 전송
   - 다른 페이지에서 contact.html?inquiry=키 로 진입하면 유형 자동 선택
   ========================================================= */
const INQUIRY_MAP = {
  vacancy: '공실개발 상담',
  diagnosis: '공간수익화 진단',
  edu: '창업 교육 문의',
  lecture: '강의/세미나 문의',
  media: '인터뷰/미디어 문의',
  partner: '제휴/공동사업 문의',
  book: '전자책 구매/단체구매 문의',
  space: '공간 이용·대관 문의'
};

(function contactModule() {
  const form = $('#contactForm');
  if (!form) return;
  const typeSel = $('#cfType');
  const nameEl = $('#cfName');
  const contactEl = $('#cfContact');
  const memberEl = $('#cfMember');
  const noteEl = $('#cfNote');
  const btn = form.querySelector('button[type="submit"]');

  const setType = (key) => {
    const value = INQUIRY_MAP[key];
    if (value && typeSel) typeSel.value = value;
  };
  const params = new URLSearchParams(window.location.search);
  if (params.get('inquiry')) setType(params.get('inquiry'));

  $$('[data-inquiry]').forEach((el) => {
    el.addEventListener('click', () => setType(el.dataset.inquiry));
  });

  /* 연결 상태에 맞춘 안내 문구 */
  const DIRECT = IS_REMOTE || Boolean(FORM_ACCESS_KEY);
  if (noteEl) {
    noteEl.textContent = DIRECT
      ? '※ 보내주신 내용은 문의 답변에만 쓰고, 처리 후 개인정보처리방침에 따라 보관·파기합니다.'
      : '※ 지금은 버튼을 누르면 사용 중인 메일 앱이 열리고 내용이 자동으로 채워집니다.';
  }

  /* 회원 안내 + 로그인한 경우 이름·연락처 채우기 */
  async function paintMember() {
    if (!memberEl) return;
    if (!Auth.enabled) { memberEl.hidden = true; return; }
    if (Auth.user) {
      const p = await Auth.getProfile();
      const name = (p && p.name) || Auth.displayName();
      memberEl.innerHTML = `<strong>${escapeHtml(name)}</strong>님으로 로그인되어 있습니다. 보내신 문의와 진행 상황은 <a href="/account#my-inquiries">마이페이지</a>에서 볼 수 있습니다.`;
      if (nameEl && !nameEl.value) nameEl.value = name;
      if (contactEl && !contactEl.value) contactEl.value = (p && p.phone) || Auth.user.email || '';
    } else {
      memberEl.innerHTML = `회원으로 문의하면 마이페이지에서 진행 상황을 볼 수 있습니다. <a href="${loginUrl('/contact#contactForm')}">로그인 · 회원가입</a> (비회원도 그대로 보내실 수 있습니다)`;
    }
    memberEl.hidden = false;
  }
  Auth.ready.then(paintMember);
  Auth.onChange(paintMember);

  /* 상태 메시지 영역 */
  let statusEl = $('#cfStatus');
  if (!statusEl) {
    statusEl = document.createElement('p');
    statusEl.id = 'cfStatus';
    statusEl.className = 'cf-status';
    statusEl.hidden = true;
    statusEl.setAttribute('role', 'status');
    form.appendChild(statusEl);
  }
  const showStatus = (html, kind) => {
    statusEl.innerHTML = html;
    statusEl.className = 'cf-status is-' + kind;
    statusEl.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const agree = $('#cfAgree');
    if (agree && !agree.checked) { showStatus('개인정보 수집·이용에 동의해 주셔야 문의를 보낼 수 있습니다.', 'err'); agree.focus(); return; }
    const type = typeSel ? typeSel.value : '문의';
    const name = (nameEl || {}).value ? nameEl.value.trim() : '';
    const contact = (contactEl || {}).value ? contactEl.value.trim() : '';
    const msg = ($('#cfMessage') || {}).value || '';
    const memberLine = Auth.user ? `회원 (${Auth.user.email || ''})` : '비회원';
    const subject = `[${type}] ${name}님 문의`;
    const bodyText = `문의 유형: ${type}\n성함/소속: ${name}\n연락처: ${contact}\n회원 여부: ${memberLine}\n\n문의 내용:\n${msg}\n\n— 최시준 홈페이지에서 발송`;
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

    /* 직접 접수 설정이 없으면: 메일 앱 열기 */
    if (!DIRECT) {
      window.location.href = mailto;
      showStatus('메일 앱이 열립니다. 창이 열리지 않으면 ' + escapeHtml(CONTACT_EMAIL) + ' 로 보내주세요.', 'wait');
      return;
    }

    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
    showStatus('문의를 보내고 있습니다…', 'wait');
    let saved = false;
    let mailed = false;

    /* ① 문의 기록 저장 (Supabase) — 회원이면 마이페이지에서 볼 수 있다 */
    if (IS_REMOTE) {
      try {
        await Auth.ready;
        const t = await Auth.token();
        await sbInsert(COMMUNITY_BACKEND.inquiriesTable, {
          inquiry_type: type, name, contact, message: msg, page: location.pathname
        }, { minimal: true, token: t });
        saved = true;
      } catch (_) { saved = false; }
    }
    /* ② 메일 알림 (Web3Forms) */
    if (FORM_ACCESS_KEY) {
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: FORM_ACCESS_KEY,
            subject: subject,
            from_name: '최시준 홈페이지',
            문의유형: type, 성함소속: name, 연락처: contact, 회원여부: memberLine, 문의내용: msg
          })
        });
        const data = await res.json();
        mailed = Boolean(data && data.success);
      } catch (_) { mailed = false; }
    }

    if (btn) { btn.disabled = false; btn.textContent = original; }
    if (saved || mailed) {
      form.reset();
      if (Auth.user) paintMember();
      const extra = (saved && Auth.user) ? ' 진행 상황은 <a href="/account#my-inquiries">마이페이지</a>에서 볼 수 있습니다.' : '';
      showStatus('문의가 접수되었습니다. 영업일 기준 1~2일 안에 회신드리겠습니다. 감사합니다.' + extra, 'ok');
    } else {
      showStatus('전송하지 못했습니다. 메일 앱으로 대신 열어드립니다.', 'err');
      window.location.href = mailto;
    }
  });
})();

/* =========================================================
   게시판 데이터 계층 (community + index 최근글 공용)
   ========================================================= */
const LS_POSTS_KEY = 'csj_community_posts_v1';

const SEED_POSTS = [
  {
    id: 'seed-2', created_at: '2026-07-02T10:00:00+09:00',
    category: '정보공유', author: '최시준',
    title: '게시판 이용 안내 — 제휴 제안 이렇게 남겨주세요',
    content: '제휴·협업 카테고리에 ① 어떤 분야인지 ② 무엇을 함께하고 싶은지 ③ 간단한 소개를 남겨주시면, 검토 후 답글로 회신드립니다. 연락처·주소 등 개인정보는 게시판 대신 문의하기를 이용해주세요.',
    pass: null, comments: []
  },
  {
    id: 'seed-1', created_at: '2026-07-01T09:00:00+09:00',
    category: '후기·근황', author: '최시준',
    title: '커뮤니티 라운지를 엽니다',
    content: '건물주, 부동산, 예비창업자, 파트너 기업이 편하게 교류하는 공간이 되었으면 합니다. 공간에 대한 어떤 이야기든 환영하고, 모든 글에 성실히 답하겠습니다.',
    pass: null, comments: []
  }
];

function loadLocalPosts() {
  try {
    const raw = localStorage.getItem(LS_POSTS_KEY);
    if (!raw) return SEED_POSTS.map((p) => ({ ...p, comments: [...p.comments] }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('bad');
    return parsed.map((p) => ({ ...p, comments: Array.isArray(p.comments) ? p.comments : [] }));
  } catch (_) {
    return SEED_POSTS.map((p) => ({ ...p, comments: [...p.comments] }));
  }
}
function saveLocalPosts(posts) {
  try { localStorage.setItem(LS_POSTS_KEY, JSON.stringify(posts)); } catch (_) { /* 저장 공간 부족 등 */ }
}
async function fetchRemotePosts() {
  const posts = await sbSelect(COMMUNITY_BACKEND.table, 'select=*&order=created_at.desc&limit=100');
  let comments = [];
  try {
    comments = await sbSelect(COMMUNITY_BACKEND.commentsTable, 'select=*&order=created_at.asc&limit=500');
  } catch (_) { comments = []; }
  const byPost = {};
  comments.forEach((c) => { (byPost[c.post_id] = byPost[c.post_id] || []).push(c); });
  return posts.map((p) => ({ ...p, comments: byPost[p.id] || [] }));
}

/* =========================================================
   [community] 게시판 렌더 · 글쓰기 · 댓글 · 삭제
   ========================================================= */
(function boardModule() {
  const list = $('#boardList');
  if (!list) return;

  const empty = $('#boardEmpty');
  const modeEl = $('#boardMode');
  const writeBtn = $('#boardWriteBtn');
  const formEl = $('#boardForm');
  const cancelBtn = $('#bfCancel');
  const filters = $$('#boardFilters .f-chip');

  let posts = [];
  let currentCat = '전체';
  let openId = null;
  let me = null;          // 로그인한 회원 (Supabase 연결 시)
  let admin = false;

  const isStaff = (row) => Boolean(row.is_staff) || (!IS_REMOTE && (row.author === '최시준' || row.author === '운영자'));
  const canDelete = (post) => IS_REMOTE ? Boolean(me && (post.user_id === me.id || admin)) : Boolean(post.pass);

  function setMode(text) { if (modeEl) modeEl.textContent = text; }

  function render() {
    const shown = currentCat === '전체' ? posts : posts.filter((p) => p.category === currentCat);
    list.innerHTML = '';
    if (empty) empty.hidden = shown.length > 0;

    shown.forEach((post) => {
      const li = document.createElement('li');
      li.className = 'post' + (post.id === openId ? ' is-open' : '');

      const isOwnerPost = isStaff(post);
      const commentsCount = (post.comments || []).length;

      const commentsHtml = (post.comments || []).map((c) => {
        const isOwner = isStaff(c);
        return `
          <div class="comment${isOwner ? ' is-owner' : ''}">
            <div class="comment-head">
              <span class="comment-author">${escapeHtml(c.author || '익명')}</span>
              <span class="comment-date">${formatDate(c.created_at)}</span>
            </div>
            <p class="comment-text">${escapeHtml(c.content || '')}</p>
          </div>`;
      }).join('');

      li.innerHTML = `
        <button class="post-head" type="button" aria-expanded="${post.id === openId}">
          <span class="post-cat mono">${escapeHtml(post.category || '기타')}</span>
          <span class="post-title">${escapeHtml(post.title || '')}${isOwnerPost ? ' <span class="post-owner mono">운영자</span>' : ''}</span>
          <span class="post-meta mono">${escapeHtml(post.author || '익명')} · ${formatDate(post.created_at)} · 💬 ${commentsCount}</span>
        </button>
        <div class="post-body" ${post.id === openId ? '' : 'hidden'}>
          <p class="post-content">${escapeHtml(post.content || '')}</p>
          <div class="comments">
            <p class="comments-title">COMMENTS — ${commentsCount}</p>
            ${commentsHtml || '<p class="comment-text" style="color:var(--concrete-soft);">아직 답글이 없습니다.</p>'}
            ${commentFormHtml(post)}
          </div>
          ${canDelete(post) ? '<button class="post-del" type="button">글 삭제</button>' : ''}
        </div>`;

      const head = $('.post-head', li);
      head.addEventListener('click', () => {
        openId = openId === post.id ? null : post.id;
        render();
      });

      const cform = $('.comment-form', li);
      if (cform) cform.addEventListener('submit', async (e) => {
        e.preventDefault();
        const authorEl = $('.cm-author', cform);
        const author = authorEl ? authorEl.value.trim() : Auth.displayName();
        const content = $('.cm-content', cform).value.trim();
        if (!author || !content) return;
        await addComment(post.id, author, content);
      });

      const delBtn = $('.post-del', li);
      if (delBtn) delBtn.addEventListener('click', () => deletePost(post));

      list.appendChild(li);
    });
  }

  function commentFormHtml(post) {
    if (IS_REMOTE && !me) {
      return `<p class="comment-login">답글은 회원만 남길 수 있습니다. <a href="${loginUrl('/community')}">로그인 · 회원가입</a></p>`;
    }
    return `
            <form class="comment-form${IS_REMOTE ? ' is-member' : ''}" data-post="${escapeHtml(String(post.id))}">
              ${IS_REMOTE ? '' : '<input type="text" class="cm-author" maxlength="20" placeholder="닉네임" required />'}
              <textarea class="cm-content" maxlength="500" rows="1" placeholder="${IS_REMOTE ? escapeHtml(Auth.displayName()) + '님, 답글을 남겨주세요' : '답글을 남겨주세요'}" required></textarea>
              <button type="submit" class="btn btn-sm btn-line">등록</button>
            </form>`;
  }

  async function addComment(postId, author, content) {
    const comment = { post_id: postId, author, content, created_at: new Date().toISOString() };
    if (IS_REMOTE) {
      try { await sbInsert(COMMUNITY_BACKEND.commentsTable, { post_id: postId, author, content }, { token: await Auth.token() }); }
      catch (_) { alert('답글 등록에 실패했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.'); return; }
      try { posts = await fetchRemotePosts(); } catch (_) { /* keep */ }
    } else {
      const post = posts.find((p) => String(p.id) === String(postId));
      if (post) { post.comments = post.comments || []; post.comments.push(comment); saveLocalPosts(posts); }
    }
    openId = postId;
    render();
  }

  async function deletePost(post) {
    if (IS_REMOTE) {
      if (!confirm('이 글을 삭제할까요? 답글도 함께 지워집니다.')) return;
      try {
        await sbDelete(COMMUNITY_BACKEND.table, `id=eq.${encodeURIComponent(post.id)}`, await Auth.token());
        posts = await fetchRemotePosts();
      } catch (_) { alert('삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      if (openId === post.id) openId = null;
      render();
      return;
    }
    const input = prompt('삭제 비밀번호를 입력하세요.');
    if (input === null) return;
    if (simpleHash(input) !== post.pass) { alert('비밀번호가 일치하지 않습니다.'); return; }
    posts = posts.filter((p) => p.id !== post.id);
    saveLocalPosts(posts);
    if (openId === post.id) openId = null;
    render();
  }

  /* 글쓰기 폼 토글 */
  if (writeBtn && formEl) {
    writeBtn.addEventListener('click', () => {
      if (IS_REMOTE && !me) { location.href = loginUrl('/community'); return; }
      const show = formEl.hidden;
      formEl.hidden = !show;
      writeBtn.setAttribute('aria-expanded', String(show));
      if (show) (IS_REMOTE ? $('#bfTitle') : $('#bfAuthor')).focus();
    });
  }
  if (cancelBtn && formEl) cancelBtn.addEventListener('click', () => { formEl.hidden = true; });

  if (formEl) formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = IS_REMOTE ? Auth.displayName() : $('#bfAuthor').value.trim();
    const category = $('#bfCategory').value;
    const passRaw = $('#bfPass').value;
    const title = $('#bfTitle').value.trim();
    const content = $('#bfContent').value.trim();
    if (!author || !title || !content) return;

    if (IS_REMOTE) {
      try {
        await sbInsert(COMMUNITY_BACKEND.table, { author, category, title, content }, { token: await Auth.token() });
        posts = await fetchRemotePosts();
      } catch (_) { alert('등록에 실패했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.'); return; }
    } else {
      posts.unshift({
        id: 'p-' + Date.now(),
        created_at: new Date().toISOString(),
        author, category, title, content,
        pass: passRaw ? simpleHash(passRaw) : null,
        comments: []
      });
      saveLocalPosts(posts);
    }
    formEl.reset();
    formEl.hidden = true;
    if (writeBtn) writeBtn.setAttribute('aria-expanded', 'false');
    render();
  });

  filters.forEach((chip) => chip.addEventListener('click', () => {
    filters.forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    centerChip(chip);
    currentCat = chip.dataset.cat || '전체';
    render();
  }));

  /* 초기 로드 */
  (async function init() {
    if (IS_REMOTE) {
      /* 회원 게시판: 닉네임·삭제 비밀번호 대신 회원 정보 사용 */
      ['#bfAuthor', '#bfPass'].forEach((sel) => {
        const input = $(sel);
        if (input) { input.required = false; const lab = input.closest('label'); if (lab) lab.hidden = true; }
      });
      await Auth.ready;
      me = Auth.user;
      admin = me ? await Auth.isAdmin() : false;
      setMode(me
        ? `LIVE — ${Auth.displayName()}님으로 로그인되어 있습니다. 글과 답글은 회원 이름으로 올라갑니다.`
        : 'LIVE — 누구나 읽을 수 있고, 글쓰기와 답글은 회원만 가능합니다.');
      if (writeBtn && !me) writeBtn.textContent = '로그인하고 글쓰기';
      try { posts = await fetchRemotePosts(); }
      catch (_) {
        setMode('연결 오류 — 임시로 데모 모드로 표시합니다.');
        posts = loadLocalPosts();
      }
    } else {
      setMode('미리보기 — 지금은 작성한 글이 이 브라우저에만 저장되고 다른 방문자에게는 보이지 않습니다.');
      posts = loadLocalPosts();
    }
    render();
  })();
})();

/* =========================================================
   [index] 커뮤니티 최근 글 위젯
   ========================================================= */
(function recentPostsModule() {
  const list = $('#recentPosts');
  if (!list) return;
  const empty = $('#recentEmpty');

  function paint(posts) {
    const top = posts.slice(0, 3);
    if (!top.length) { if (empty) empty.hidden = false; return; }
    list.innerHTML = top.map((p) => `
      <li class="post">
        <a class="post-head" href="/community" style="text-decoration:none;">
          <span class="post-cat mono">${escapeHtml(p.category || '기타')}</span>
          <span class="post-title">${escapeHtml(p.title || '')}</span>
          <span class="post-meta mono">${escapeHtml(p.author || '익명')} · ${formatDate(p.created_at)}</span>
        </a>
      </li>`).join('');
  }

  (async function init() {
    if (IS_REMOTE) {
      try { paint(await sbSelect(COMMUNITY_BACKEND.table, 'select=*&order=created_at.desc&limit=3')); return; }
      catch (_) { /* fall through to local */ }
    }
    paint(loadLocalPosts());
  })();
})();

/* =========================================================
   [references] 레퍼런스 아카이브
   - 기본 아카이브(SEED_REFS)는 코드에 내장 (검증된 공개 기록 기반)
   - '레퍼런스 등록'은 관리자 코드 입력 시에만 가능
   ========================================================= */
const LS_REFS_KEY = 'csj_references_v1';

const SEED_REFS = [
  { id: 'r-01', year: '2015', category: '브랜드',     title: '소셜팩토리 오픈 — 공간사업의 시작', desc: '복합모임공간(스터디룸·세미나실) 창업. 공간이 수익을 만드는 구조를 처음으로 직접 설계·운영.', link: '' },
  { id: 'r-02', year: '2018', category: '브랜드',     title: '쏘플파티룸(SSOPLE) 홍대 1호점 런칭', desc: '프라이빗 공간대여 브랜드 쏘플파티룸 시작. 예약제 파티룸 모델의 원형을 만든 프로젝트.', link: 'https://ssople.com' },
  { id: 'r-03', year: '2018', category: '언론·미디어', title: '아레나 옴므 플러스 인터뷰', desc: '라이프스타일 매거진 ARENA HOMME+와 공간대여 사업을 주제로 진행한 인터뷰(지면).', link: '' },
  { id: 'r-04', year: '2019', category: '파트너십',   title: '㈜소셜패밀리 법인 설립', desc: '공간 운영·플랫폼 사업 법인화. 직영 확장의 기반 구축.', link: '' },
  { id: 'r-05', year: '2019', category: '파트너십',   title: '프라이머 배치 15기 선정', desc: '국내 대표 스타트업 액셀러레이터 프라이머 15기 선정 — 이후 반년 만에 5배 이상 성장.', link: 'https://www.rocketpunch.com/companies/socialfamily' },
  { id: 'r-06', year: '2020', category: '언론·미디어', title: '시사뉴스 — 직영점 50개 돌파 보도', desc: '"파티룸 창업 유행 선도" — 직영 중심 확장이 언론에 보도.', link: 'http://www.sisa-news.com/news/article.html?no=125421' },
  { id: 'r-07', year: '2020', category: '파트너십',   title: 'SPMS(공간관리시스템) 고도화', desc: '예약·출입·정산·CS를 통합 관리하는 자체 시스템 구축 — 전국 무인운영의 기반.', link: '' },
  { id: 'r-08', year: '2020', category: '강의·교육',  title: '파티룸 창업 설명회 — 신촌 · 강남', desc: '공간대여 창업을 주제로 한 오프라인 창업 설명회를 신촌·강남에서 개최, 성황리 종료.', link: '' },
  { id: 'r-09', year: '2022', category: '공간개발',   title: '쏘플파티룸 100호점 돌파 — 4년 만에 전국 확장', desc: '홍대 1호점 이후 서울·경기·부산·대구·광주 등 전국 단위 확장 달성.', link: 'https://thevc.kr/socialfamily' },
  { id: 'r-10', year: '2022', category: '브랜드',     title: '공백 — 공실솔루션 브랜드 런칭', desc: '장기 공실·비선호 공간을 진단하고 수익공간으로 개발하는 공실개발 서비스 시작.', link: '' },
  { id: 'r-11', year: '2023', category: '브랜드',     title: '밍글 — 무인 디저트 카페 런칭', desc: '국내 최초 콘셉트의 무인 디저트 카페. 인건비 없는 F&B 운영구조 실험.', link: '' },
  { id: 'r-12', year: '2023', category: '브랜드',     title: '레스텔 — 도심 웰니스 스테이 런칭', desc: 'REST+HOTEL. 동양적 무드의 휴식 특화 스테이 공간(신촌).', link: '' },
  { id: 'r-14', year: '2024', category: '강의·교육',  title: '기업 · 대학 · 퇴사학교 강연', desc: '공간수익화, 무인운영, 실행형 창업을 주제로 한 강의 활동.', link: '' },
  { id: 'r-15', year: '2025', category: '공간개발',   title: '전국 120여 개 공간 운영', desc: '연간 20만여 명이 방문하는 전국 단위 공간 네트워크 운영 — 모두 직접 설계·시공.', link: 'https://ssople.com' },
  { id: 'r-16', year: '2025', category: '공간개발',   title: '비선호층 공실개발 프로젝트 다수 수행', desc: '고층·지하·장기 공실을 목적형 수익공간으로 전환 — 유형별 상세는 사례 페이지 참고.', link: '/cases' },
  { id: 'r-17', year: '2026', category: '강의·교육',  title: '공간대여 창업 아카데미 · 오너스클럽 운영', desc: '검증된 체크리스트 기반 창업 교육과 수료생 네트워크 운영.', link: '' },
  { id: 'r-18', year: '2026', category: '파트너십',   title: '중개법인 · 금융 파트너 협업 확대', desc: '공실 매물 개발 협업, NPL·개발 프로젝트 등 파트너십 확장 진행 중.', link: '' },
  { id: 'r-19', year: '2016~', category: '강의·교육',  title: '삼성전자 · 현대자동차 · 현대카드 등 기업·기관 강연', desc: '우리은행, 코웨이, 3M, 서울시청, 신용보증재단, 한국과학창의재단 등 기업·공공기관 대상 강연 다수. TEDxCAU 연사.', link: '' },
  { id: 'r-20', year: '2016~', category: '강의·교육',  title: '고려대 · 한양대 · 이화여대 등 30여 개 대학 강연', desc: '중앙대, 부산대, 동국대, 홍익대, 전남대, 인천대, 순천향대 등 전국 대학 창업 강의·특강.', link: '' },
  { id: 'r-21', year: '2016~', category: '강의·교육',  title: "퇴사학교(T-School) 학과장 · '부업가정신' 2년 완판", desc: '직장인 대상 실행형 창업 강의로 2년간 완판을 기록한 대표 강의.', link: '' },
  { id: 'r-22', year: '2015~', category: '언론·미디어', title: 'KBS 8시뉴스 · JTBC · 중국 CCTV · MBC 다큐 출연', desc: '청년 창업, 퇴사 트렌드, 공간 비즈니스를 주제로 한 방송 인터뷰·보도. EBS, 매경이코노미 등 지면 다수.', link: '/media' },
  { id: 'r-23', year: '2016~', category: '파트너십',   title: '한국스타트업협회 위원장 · 청년허브 심사위원', desc: '청년허브 공간지원 심사위원, 로컬크리에이터 평가위원, 사단법인 청년위함 연구소장 등 대외 활동.', link: '' },
  { id: 'r-24', year: '2026', category: '브랜드',     title: '공백 — 공실개발 플랫폼 vacancy.co.kr 오픈', desc: '공실 진단부터 수익공간 개발까지, 공실 솔루션 전용 사이트 구축·공개.', link: 'https://vacancy.co.kr/' },
  { id: 'r-25', year: '2026', category: '공간개발',   title: 'TGRZ SPACE — 통건물 마스터리스 사업 런칭', desc: '건물 전체를 임차·개발·운영하는 통건물 전담 브랜드와 사이트 공개.', link: 'https://tgrzspace.pages.dev/' },
  { id: 'r-26', year: '2026', category: '파트너십',   title: '오르비스중개법인 — 부동산 중개 파트너 운영', desc: '공실·수익형 매물의 발굴과 중개를 전담하는 직영 중개법인 사이트 공개.', link: 'https://orbisestate.pages.dev/' },
  { id: 'r-27', year: '2026', category: '브랜드',     title: '개인 브랜드 허브 choisijun.com 구축', desc: '사례·포트폴리오·레퍼런스·미디어·커뮤니티·전자책을 한곳에 모은 공식 홈페이지.', link: '/' },
  { id: 'r-28', year: '2026', category: '강의·교육',  title: "전자책 시리즈 2종 기획 — '공실은 자산이다' 외", desc: "'예약되는 공간'까지 — 340개+ 공간의 판단기준을 담은 전자책 시리즈 준비.", link: '/books' },
  { id: 'r-29', year: '2026', category: '파트너십',   title: 'AI 에이전트 13종 구축 — 콘텐츠 제작부터 상권 분석까지', desc: '콘텐츠 자산화, 문의 선별·답변 초안, CS 응대, 리뷰 모니터링, 공실 매물·상권 스크리닝, 레퍼런스 아카이빙, 운영 이상감지, 강연 설계, 주간 브리핑, 가맹점 지원, 관계·기회 관리까지 실무에 적용.', link: '' },
  { id: 'r-30', year: '2026', category: '파트너십',   title: '마이웍스 — 혼자 경영하는 사람의 업무 운영 시스템', desc: '업무·프로젝트·할 일을 한곳에서 관리하고, 사람과 AI로 연결하는 업무 운영 시스템을 만들어 공개.', link: 'https://myworkspro.pages.dev/' },
  { id: 'r-31', year: '2026', category: '언론·미디어', title: '쇼릴 2026 공개', desc: '340개+ 공간부터 쏘플파티룸, AI 에이전트, 마이웍스, 강의와 전자책까지 15초로 담은 모션 쇼릴.', link: '/media#showreel' },
  { id: 'r-32', year: '2026', category: '공간개발',   title: '공간 레퍼런스 아카이브 최종본 · 전국 포트폴리오 공개', desc: '2015~2026년 직접 기획·오픈·운영한 공간과 공실개발 프로젝트를 전국 지역별 포트폴리오로 정리. 서울·경기·인천·충청·경상·전라 지역 페이지 공개.', link: '/portfolio' }
];

function loadUserRefs() {
  try {
    const raw = localStorage.getItem(LS_REFS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}
function saveUserRefs(refs) {
  try { localStorage.setItem(LS_REFS_KEY, JSON.stringify(refs)); return true; }
  catch (_) { return false; }
}
/* 이미지 파일 → 리사이즈된 dataURL (최대 900px, JPEG) */
function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read fail'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img fail'));
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

(function referencesModule() {
  const grid = $('#refGrid');
  if (!grid) return;

  const empty = $('#refEmpty');
  const modeEl = $('#refMode');
  const writeBtn = $('#refWriteBtn');
  const formEl = $('#refForm');
  const cancelBtn = $('#rfCancel');
  const filters = $$('#refFilters .f-chip');
  const fileInput = $('#rfImage');
  const preview = $('#rfPreview');
  const previewImg = $('#rfPreviewImg');

  let userRefs = [];
  let currentCat = '전체';
  let pendingImage = '';
  let admin = false;      // Supabase 연결 시: 관리자 계정으로 로그인한 경우만 등록·삭제

  function allRefs() {
    const merged = [...userRefs, ...SEED_REFS];
    return merged.sort((a, b) => {
      const y = (b.year || '').localeCompare(a.year || '');
      if (y !== 0) return y;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }

  function render() {
    const refs = allRefs().filter((r) => currentCat === '전체' || r.category === currentCat);
    grid.innerHTML = '';
    if (empty) empty.hidden = refs.length > 0;

    refs.forEach((r) => {
      const card = document.createElement('article');
      card.className = 'ref-card';
      const img = r.image
        ? `<img src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title)}" loading="lazy" />`
        : '<span class="mono">REFERENCE</span>';
      const isExternal = r.link && /^https?:/i.test(r.link);
      const link = r.link
        ? `<a class="ref-link" href="${escapeHtml(r.link)}"${isExternal ? ' target="_blank" rel="noopener"' : ''}>자세히 보기 ↗</a>`
        : '';
      const del = (r.userAdded || (r.remote && admin))
        ? '<button class="ref-del" type="button">삭제 (관리자)</button>'
        : '';
      card.innerHTML = `
        <div class="ref-thumb">${img}</div>
        <div class="ref-body">
          <div class="ref-meta"><span class="ref-cat">${escapeHtml(r.category)}</span><span class="ref-year">${escapeHtml(r.year || '')}</span></div>
          <h3>${escapeHtml(r.title)}</h3>
          <p class="ref-desc">${escapeHtml(r.desc || '')}</p>
          ${link}${del}
        </div>`;
      const delBtn = $('.ref-del', card);
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (r.remote) {
          if (!confirm('이 레퍼런스를 삭제할까요?')) return;
          try {
            await sbDelete(COMMUNITY_BACKEND.referencesTable, `id=eq.${encodeURIComponent(r.id)}`, await Auth.token());
            userRefs = await fetchRemoteRefs();
          } catch (_) { alert('삭제하지 못했습니다.'); return; }
          render();
          return;
        }
        const code = prompt('삭제하려면 관리자 코드를 입력하세요.');
        if (code === null) return;
        if (code !== ADMIN_CODE) { alert('관리자 코드가 일치하지 않습니다.'); return; }
        userRefs = userRefs.filter((u) => u.id !== r.id);
        saveUserRefs(userRefs);
        render();
      });
      grid.appendChild(card);
    });
  }

  if (writeBtn && formEl) {
    writeBtn.addEventListener('click', () => {
      const show = formEl.hidden;
      formEl.hidden = !show;
      writeBtn.setAttribute('aria-expanded', String(show));
    });
  }
  if (cancelBtn && formEl) cancelBtn.addEventListener('click', () => { formEl.hidden = true; });

  if (fileInput) fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) { pendingImage = ''; if (preview) preview.hidden = true; return; }
    try {
      pendingImage = await fileToResizedDataUrl(file);
      if (previewImg) previewImg.src = pendingImage;
      if (preview) preview.hidden = false;
    } catch (_) {
      pendingImage = '';
      alert('이미지를 불러오지 못했습니다. 다른 파일을 시도해주세요.');
    }
  });

  if (formEl) formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!IS_REMOTE) {
      const code = $('#rfCode').value;
      if (!ADMIN_CODE || code !== ADMIN_CODE) { alert('관리자 코드가 일치하지 않습니다.'); return; }
    }

    const item = {
      id: 'ur-' + Date.now(),
      created_at: new Date().toISOString(),
      category: $('#rfCategory').value,
      year: $('#rfYear').value.trim(),
      title: $('#rfTitle').value.trim(),
      desc: $('#rfDesc').value.trim(),
      image: pendingImage || ($('#rfImageUrl').value.trim() || ''),
      link: $('#rfLink').value.trim(),
      userAdded: true
    };
    if (!item.title || !item.year) return;

    if (IS_REMOTE) {
      try {
        await sbInsert(COMMUNITY_BACKEND.referencesTable, {
          category: item.category, year: item.year, title: item.title,
          desc: item.desc, image: item.image, link: item.link
        }, { token: await Auth.token() });
        userRefs = await fetchRemoteRefs();
      } catch (_) { alert('등록에 실패했습니다. 연결 상태를 확인해주세요.'); return; }
    } else {
      userRefs.unshift(item);
      if (!saveUserRefs(userRefs)) {
        alert('브라우저 저장 공간이 부족합니다. 이미지 없이 등록하거나 이미지 URL 방식을 사용해주세요.');
        userRefs.shift();
        return;
      }
    }
    formEl.reset();
    pendingImage = '';
    if (preview) preview.hidden = true;
    formEl.hidden = true;
    if (writeBtn) writeBtn.setAttribute('aria-expanded', 'false');
    render();
  });

  async function fetchRemoteRefs() {
    const rows = await sbSelect(COMMUNITY_BACKEND.referencesTable, 'select=*&order=created_at.desc&limit=100');
    return rows.map((r) => ({ ...r, userAdded: false, remote: true }));
  }

  filters.forEach((chip) => chip.addEventListener('click', () => {
    filters.forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    centerChip(chip);
    currentCat = chip.dataset.cat || '전체';
    render();
  }));

  (async function init() {
    if (IS_REMOTE) {
      /* 관리자 계정일 때만 등록 버튼을 보여준다 (서버 정책으로도 막혀 있음) */
      const codeInput = $('#rfCode');
      if (codeInput) { codeInput.required = false; const lab = codeInput.closest('label'); if (lab) lab.hidden = true; }
      const lockNote = $('#rfLockNote');
      if (lockNote) lockNote.textContent = '🔒 관리자 계정으로 로그인한 상태입니다. 등록한 레퍼런스는 바로 공개됩니다.';
      await Auth.ready;
      admin = Auth.user ? await Auth.isAdmin() : false;
      if (writeBtn) writeBtn.hidden = !admin;
      if (modeEl) modeEl.textContent = admin
        ? 'LIVE — 관리자로 로그인되어 있습니다. 등록한 레퍼런스가 모든 방문자에게 공개됩니다.'
        : '';
      try { userRefs = await fetchRemoteRefs(); }
      catch (_) {
        if (modeEl) modeEl.textContent = '연결 오류 — 기본 아카이브만 표시합니다.';
        userRefs = loadUserRefs();
      }
    } else {
      if (modeEl) modeEl.textContent = '';
      userRefs = loadUserRefs();
    }
    render();
  })();
})();


/* =========================================================
   [index · media] 쇼릴 — 화면에 보일 때만 무음 자동재생
   - 동작 줄이기(reduced motion) / 데이터 절약 모드에서는 자동재생 안 함
   - 사용자가 직접 멈추면 다시 자동재생하지 않음
   ========================================================= */
(function showreelModule() {
  const reels = $$('.reel');
  if (!reels.length) return;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  reels.forEach((reel) => {
    const v = $('video', reel);
    if (!v) return;
    const big = $('.reel-big', reel);
    const controls = $('.reel-controls', reel);
    const btnPlay = $('.reel-play', reel);
    const btnSound = $('.reel-sound', reel);
    const btnFull = $('.reel-full', reel);
    const chapters = $$('.reel-chapters [data-t]', reel);

    v.controls = false;                 // 자바스크립트가 동작할 때만 맞춤 컨트롤 사용
    if (big) big.hidden = false;
    if (controls) controls.hidden = false;

    const small = window.matchMedia('(max-width: 768px)').matches;
    const src = (small ? v.dataset.srcSm : v.dataset.srcLg) || v.currentSrc;
    let sourced = false;
    let userPaused = false;
    let pendingSeek = null;

    const ensureSrc = () => {
      if (sourced || !src) return;
      v.src = src;
      sourced = true;
    };
    const setSoundUI = () => {
      if (!btnSound) return;
      btnSound.setAttribute('aria-pressed', String(!v.muted));
      btnSound.textContent = v.muted ? '소리 켜기' : '소리 끄기';
    };
    const play = () => {
      ensureSrc();
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => reel.classList.remove('is-playing'));
    };

    v.addEventListener('play', () => { reel.classList.add('is-playing', 'is-started'); });
    v.addEventListener('pause', () => { reel.classList.remove('is-playing'); });
    v.addEventListener('loadedmetadata', () => {
      if (pendingSeek !== null) { v.currentTime = pendingSeek; pendingSeek = null; }
    });
    v.addEventListener('timeupdate', () => {
      let active = null;
      chapters.forEach((c) => { if (v.currentTime + 0.05 >= parseFloat(c.dataset.t)) active = c; });
      chapters.forEach((c) => c.classList.toggle('is-active', c === active));
    });

    if (big) big.addEventListener('click', () => {
      userPaused = false;
      v.muted = false; setSoundUI();
      play();
    });
    if (btnPlay) btnPlay.addEventListener('click', () => {
      if (v.paused) { userPaused = false; play(); }
      else { userPaused = true; v.pause(); }
    });
    if (btnSound) btnSound.addEventListener('click', () => {
      v.muted = !v.muted; setSoundUI();
      if (v.paused) { userPaused = false; play(); }
    });
    if (btnFull) btnFull.addEventListener('click', () => {
      const frame = $('.reel-frame', reel);
      if (frame && frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });
    chapters.forEach((c) => c.addEventListener('click', () => {
      const t = parseFloat(c.dataset.t) || 0;
      ensureSrc();
      if (v.readyState >= 1) v.currentTime = t; else pendingSeek = t;
      userPaused = false;
      play();
    }));

    const auto = reel.dataset.autoplay === 'true' && !prefersReducedMotion && !saveData;
    if (auto && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { if (!userPaused && v.paused) play(); }
          else if (!v.paused) v.pause();
        });
      }, { threshold: 0.45 });
      io.observe(v);
    }
    setSoundUI();
  });
})();

/* =========================================================
   [portfolio] 공간 아카이브 탐색 — 검색·필터·정렬·더 보기
   카드는 gen.py가 정적으로 만들어 두고, 여기서는 보이기/숨기기만 한다.
   ========================================================= */
(function portfolioModule() {
  const grid = $('#pfGrid');
  if (!grid) return;
  const cards = $$('.pf-card', grid);
  const order = new Map(cards.map((c, i) => [c, i]));
  const tools = $('#pfTools');
  const typeBox = $('#pfTypes');
  const search = $('#pfSearch');
  const selRegion = $('#pfRegion');
  const selBrand = $('#pfBrand');
  const selFloor = $('#pfFloor');
  const selSort = $('#pfSort');
  const chips = $$('#pfTypes .f-chip');
  const countEl = $('#pfCount');
  const emptyEl = $('#pfEmpty');
  const moreBtn = $('#pfMore');
  const resetBtn = $('#pfReset');
  const archive = $('#pf-archive');
  const PAGE = 24;
  let limit = PAGE;
  let type = '';

  if (tools) tools.hidden = false;
  if (typeBox) typeBox.hidden = false;

  const val = (el) => (el ? el.value : '');
  const setVal = (el, v) => {
    if (!el) return;
    const ok = !v || Array.from(el.options).some((o) => o.value === v);
    el.value = ok ? v : '';
  };
  const setType = (t) => {
    type = t || '';
    chips.forEach((c) => {
      const on = (c.dataset.type || '') === type;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  };

  function matches(c) {
    const d = c.dataset;
    if (type && d.type !== type) return false;
    const r = val(selRegion); if (r && d.region !== r) return false;
    const b = val(selBrand); if (b && d.group !== b) return false;
    const f = val(selFloor);
    if (f === 'off') { if (d.floor !== 'basement' && d.floor !== 'upper') return false; }
    else if (f && d.floor !== f) return false;
    const q = val(search).trim().toLowerCase();
    if (q) {
      const terms = q.split(/\s+/);
      if (!terms.every((t) => d.q.includes(t))) return false;
    }
    return true;
  }

  function writeURL() {
    const p = new URLSearchParams();
    if (val(search).trim()) p.set('q', val(search).trim());
    if (val(selRegion)) p.set('region', val(selRegion));
    if (val(selBrand)) p.set('brand', val(selBrand));
    if (val(selFloor)) p.set('floor', val(selFloor));
    if (type) p.set('type', type);
    if (val(selSort)) p.set('sort', val(selSort));
    const qs = p.toString();
    try {
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + (location.hash || ''));
    } catch (_) { /* file:// 등 */ }
  }

  function apply(resetLimit) {
    if (resetLimit) limit = PAGE;
    const list = cards.filter(matches);
    const sort = val(selSort);
    if (sort === 'size') list.sort((a, b) => (+b.dataset.size || 0) - (+a.dataset.size || 0) || order.get(a) - order.get(b));
    else if (sort === 'name') list.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name, 'ko'));
    else if (sort === 'region') list.sort((a, b) => (+a.dataset.ri - +b.dataset.ri) || a.dataset.area.localeCompare(b.dataset.area, 'ko') || a.dataset.name.localeCompare(b.dataset.name, 'ko'));
    else list.sort((a, b) => order.get(a) - order.get(b));

    const frag = document.createDocumentFragment();
    list.forEach((c) => frag.appendChild(c));
    cards.forEach((c) => { if (!list.includes(c)) frag.appendChild(c); });
    grid.appendChild(frag);

    cards.forEach((c) => { c.hidden = true; });
    list.slice(0, limit).forEach((c) => { c.hidden = false; });

    const spaces = list.reduce((s, c) => s + (+c.dataset.spaces || 1), 0);
    const shown = Math.min(limit, list.length);
    if (countEl) {
      countEl.innerHTML = '<strong>' + list.length + '곳</strong> · 공간 ' + spaces + '개' +
        (shown < list.length ? ' · ' + shown + '곳 표시 중' : '');
    }
    if (emptyEl) emptyEl.hidden = list.length > 0;
    if (moreBtn) {
      const rest = list.length - shown;
      moreBtn.hidden = rest <= 0;
      moreBtn.textContent = '더 보기 (' + rest + '곳 남음)';
    }
    const active = Boolean(type || val(selRegion) || val(selBrand) || val(selFloor) || val(search).trim());
    if (resetBtn) resetBtn.hidden = !active;
    writeURL();
  }

  function readURL(url) {
    const p = new URLSearchParams(url.search);
    if (search) search.value = p.get('q') || '';
    setVal(selRegion, p.get('region') || '');
    setVal(selBrand, p.get('brand') || '');
    setVal(selFloor, p.get('floor') || '');
    setVal(selSort, p.get('sort') || '');
    setType(p.get('type') || '');
  }

  const scrollToArchive = () => {
    if (archive) archive.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  let timer = null;
  if (search) search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => apply(true), 160); });
  [selRegion, selBrand, selFloor, selSort].forEach((el) => { if (el) el.addEventListener('change', () => apply(true)); });
  chips.forEach((c) => c.addEventListener('click', () => {
    setType(c.dataset.type || '');
    if (typeof centerChip === 'function') centerChip(c);
    apply(true);
  }));
  if (moreBtn) moreBtn.addEventListener('click', () => { limit += PAGE; apply(false); });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (search) search.value = '';
    [selRegion, selBrand, selFloor, selSort].forEach((el) => setVal(el, ''));
    setType('');
    apply(true);
  });

  // 분포 막대 → 아래 목록 필터
  $$('.pf-bar').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.pfFilter;
    const v = b.dataset.pfValue;
    if (kind === 'region') setVal(selRegion, v);
    if (kind === 'type') setType(v);
    apply(true);
    scrollToArchive();
  }));

  // 같은 페이지 안의 필터 링크는 새로고침 없이 처리
  $$('a[href^="/portfolio?"], a[href^="portfolio.html?"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const url = new URL(a.getAttribute('href'), location.href);
    readURL(url);
    apply(true);
    scrollToArchive();
  }));

  readURL(new URL(location.href));
  apply(true);
})();

/* ---------- 인사이트 주제 필터 ---------- */
(function () {
  const wrap = document.getElementById('inFilters');
  const grid = document.getElementById('inGrid');
  if (!wrap || !grid) return;
  const chips = Array.from(wrap.querySelectorAll('.f-chip'));
  const cards = Array.from(grid.querySelectorAll('.in-card'));
  const empty = document.getElementById('inEmpty');

  function apply(cat) {
    let shown = 0;
    cards.forEach((c) => {
      const on = !cat || c.dataset.cat === cat;
      c.hidden = !on;
      if (on) shown += 1;
    });
    chips.forEach((b) => {
      const on = (b.dataset.cat || '') === cat;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (empty) empty.hidden = shown > 0;
  }

  chips.forEach((b) => b.addEventListener('click', () => {
    const cat = b.dataset.cat || '';
    apply(cat);
    try {
      const url = new URL(location.href);
      if (cat) url.searchParams.set('topic', cat); else url.searchParams.delete('topic');
      history.replaceState(null, '', url);
    } catch (e) { /* 무시 */ }
  }));

  let initial = '';
  try { initial = new URL(location.href).searchParams.get('topic') || ''; } catch (e) { initial = ''; }
  if (initial && !chips.some((b) => b.dataset.cat === initial)) initial = '';
  apply(initial);
})();

/* =========================================================
   [login] 로그인 · 회원가입 · 비밀번호 찾기
   ========================================================= */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setBusy(form, busy, label) {
  const b = form && form.querySelector('button[type="submit"]');
  if (!b) return;
  if (busy) { b.dataset.label = b.textContent; b.textContent = label || '처리 중…'; b.disabled = true; }
  else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
}

(function loginModule() {
  const card = $('.auth-card');
  if (!card || !$('#loginForm')) return;
  const msg = $('#authMsg');
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get('next'), '/account');

  function say(html, kind = 'info') {
    msg.innerHTML = html;
    msg.className = 'auth-msg is-' + kind;
    msg.hidden = false;
  }
  function clearMsg() { msg.hidden = true; }

  /* 탭 전환 */
  function show(pane) {
    $$('.auth-tab').forEach((t) => {
      const on = t.dataset.pane === pane;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('.auth-pane').forEach((p) => { p.hidden = p.id !== 'pane-' + pane; });
    clearMsg();
  }
  $$('[data-pane]').forEach((el) => el.addEventListener('click', () => show(el.dataset.pane)));
  const startPane = (location.hash || '').replace('#', '');
  if (['signup', 'reset', 'login'].includes(startPane)) show(startPane);

  /* 회원 기능이 아직 연결되지 않은 경우 */
  if (!Auth.enabled) {
    say('회원 기능을 준비하고 있습니다. 문의는 <a href="/contact">문의하기</a>에서 바로 남기실 수 있습니다.', 'info');
    $$('.auth-form button[type="submit"]').forEach((b) => { b.disabled = true; });
    return;
  }

  Auth.ready.then(() => {
    if (Auth.hashError) say(escapeHtml(Auth.hashError), 'err');
    else if (Auth.user) say(`이미 <strong>${escapeHtml(Auth.displayName())}</strong>님으로 로그인되어 있습니다. <a href="/account">마이페이지로 가기</a>`, 'ok');
  });

  /* 간편 로그인 버튼 (site-config.js 의 socialLogin) */
  const SOCIAL_LABEL = { kakao: '카카오로 시작하기', google: 'Google로 시작하기', naver: '네이버로 시작하기' };
  const supported = SOCIAL_LOGIN.filter((p) => SOCIAL_LABEL[p] && p !== 'naver');
  if (supported.length) {
    $('#socialBox').hidden = false;
    $('#socialBtns').innerHTML = supported.map((p) =>
      `<a class="btn-social is-${p}" href="${escapeHtml(Auth.oauthUrl(p, next))}">${SOCIAL_LABEL[p]}</a>`).join('');
  }

  /* 로그인 */
  const loginForm = $('#loginForm');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#lgEmail').value.trim();
    const pass = $('#lgPass').value;
    if (!EMAIL_RULE.test(email) || !pass) { say('이메일과 비밀번호를 입력해 주세요.', 'err'); return; }
    setBusy(loginForm, true, '로그인 중…');
    try {
      await Auth.signIn(email, pass);
      location.href = next;
    } catch (err) {
      const text = authMessage(err);
      if (/메일 인증/.test(text)) {
        say(escapeHtml(text) + ' <button type="button" class="link-btn" id="resendBtn">인증 메일 다시 받기</button>', 'err');
        $('#resendBtn').addEventListener('click', async () => {
          try { await Auth.resend(email); say('인증 메일을 다시 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.', 'ok'); }
          catch (e2) { say(escapeHtml(authMessage(e2)), 'err'); }
        });
      } else {
        say(escapeHtml(text), 'err');
      }
    } finally { setBusy(loginForm, false); }
  });

  /* 전체 동의 */
  const all = $('#agAll');
  const items = $$('.ag-item');
  if (all) {
    all.addEventListener('change', () => items.forEach((i) => { i.checked = all.checked; }));
    items.forEach((i) => i.addEventListener('change', () => { all.checked = items.every((x) => x.checked); }));
  }

  /* 회원가입 */
  const signupForm = $('#signupForm');
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#suName').value.trim();
    const email = $('#suEmail').value.trim();
    const pass = $('#suPass').value;
    const pass2 = $('#suPass2').value;
    const type = $('#suType').value;
    const phone = $('#suPhone').value.trim();
    if (name.length < 2) { say('이름을 2자 이상 입력해 주세요.', 'err'); $('#suName').focus(); return; }
    if (!EMAIL_RULE.test(email)) { say('이메일 주소를 다시 확인해 주세요.', 'err'); $('#suEmail').focus(); return; }
    if (!PASSWORD_RULE.test(pass)) { say('비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.', 'err'); $('#suPass').focus(); return; }
    if (pass !== pass2) { say('비밀번호 확인이 일치하지 않습니다.', 'err'); $('#suPass2').focus(); return; }
    if (!type) { say('회원 유형을 선택해 주세요.', 'err'); $('#suType').focus(); return; }
    if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) { say('휴대폰 번호를 숫자와 하이픈(-)으로 입력해 주세요.', 'err'); $('#suPhone').focus(); return; }
    if (!$('#agAge').checked || !$('#agTerms').checked || !$('#agPrivacy').checked) { say('필수 항목에 모두 동의해 주세요.', 'err'); return; }

    setBusy(signupForm, true, '가입 중…');
    try {
      const r = await Auth.signUp(email, pass, {
        name, member_type: type, phone, marketing: $('#agMarketing').checked,
        agreed_terms: true, agreed_privacy: true, agreed_at: new Date().toISOString()
      });
      if (r.session) { location.href = '/account?welcome=1'; return; }
      signupForm.reset();
      say(r.existing
        ? '이미 가입된 이메일일 수 있습니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.'
        : `<strong>${escapeHtml(email)}</strong>로 인증 메일을 보냈습니다. 메일의 <strong>가입 확인</strong> 링크를 누르면 가입이 끝납니다. 메일이 보이지 않으면 스팸함도 확인해 주세요.`,
        r.existing ? 'err' : 'ok');
    } catch (err) {
      say(escapeHtml(authMessage(err)), 'err');
    } finally { setBusy(signupForm, false); }
  });

  /* 비밀번호 찾기 */
  const resetForm = $('#resetForm');
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#rsEmail').value.trim();
    if (!EMAIL_RULE.test(email)) { say('이메일 주소를 다시 확인해 주세요.', 'err'); return; }
    setBusy(resetForm, true, '보내는 중…');
    try {
      await Auth.recover(email);
      say('가입된 이메일이라면 비밀번호 재설정 링크가 도착합니다. 메일의 링크를 누르면 새 비밀번호를 정할 수 있습니다.', 'ok');
      resetForm.reset();
    } catch (err) {
      say(escapeHtml(authMessage(err)), 'err');
    } finally { setBusy(resetForm, false); }
  });
})();

/* =========================================================
   [account] 마이페이지 — 내 정보 · 비밀번호 · 내 문의 · 내 글 · 관리자 문의함 · 탈퇴
   ========================================================= */
const INQUIRY_STATUS = ['접수', '진행중', '완료'];

(function accountModule() {
  const main = $('#accMain');
  if (!main) return;
  const guest = $('#accGuest');
  const msg = $('#accMsg');
  const params = new URLSearchParams(location.search);

  function say(html, kind = 'info') {
    msg.innerHTML = html;
    msg.className = 'auth-msg is-' + kind;
    msg.hidden = false;
    msg.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  }
  const statusBadge = (st) => `<span class="st-badge st-${INQUIRY_STATUS.indexOf(st)}">${escapeHtml(st || '접수')}</span>`;

  if (!Auth.enabled) {
    guest.hidden = false;
    guest.querySelector('p').textContent = '회원 기능을 준비하고 있습니다. 문의는 문의하기에서 바로 남기실 수 있습니다.';
    return;
  }

  async function loadInquiries() {
    const box = $('#myInquiries');
    try {
      const rows = await sbSelect(COMMUNITY_BACKEND.inquiriesTable,
        `user_id=eq.${Auth.user.id}&select=id,created_at,inquiry_type,message,status,reply&order=created_at.desc&limit=50`, await Auth.token());
      box.innerHTML = rows.length ? rows.map((r) => `
        <li class="acc-item">
          <div class="acc-item-head">${statusBadge(r.status)}<span class="mono">${escapeHtml(r.inquiry_type || '문의')}</span><span class="acc-date mono">${formatDate(r.created_at)}</span></div>
          <p class="acc-item-text">${escapeHtml(r.message || '')}</p>
          ${r.reply ? `<div class="acc-reply"><span class="mono">답변</span><p>${escapeHtml(r.reply)}</p></div>` : ''}
        </li>`).join('')
        : '<li class="acc-empty">아직 보낸 문의가 없습니다. 로그인한 상태에서 문의하면 여기에서 진행 상황을 볼 수 있습니다.</li>';
    } catch (_) { box.innerHTML = '<li class="acc-empty">문의 내역을 불러오지 못했습니다.</li>'; }
  }

  async function loadPosts() {
    const box = $('#myPosts');
    try {
      const rows = await sbSelect(COMMUNITY_BACKEND.table,
        `user_id=eq.${Auth.user.id}&select=id,created_at,category,title&order=created_at.desc&limit=50`, await Auth.token());
      box.innerHTML = rows.length ? rows.map((r) => `
        <li class="acc-item acc-item-row">
          <span class="post-cat mono">${escapeHtml(r.category || '기타')}</span>
          <a href="/community">${escapeHtml(r.title || '')}</a>
          <span class="acc-date mono">${formatDate(r.created_at)}</span>
        </li>`).join('')
        : '<li class="acc-empty">아직 쓴 글이 없습니다.</li>';
    } catch (_) { box.innerHTML = '<li class="acc-empty">글 목록을 불러오지 못했습니다.</li>'; }
  }

  /* 관리자 문의함 */
  let adminFilter = '';
  async function loadAdmin() {
    const box = $('#adminInquiries');
    const stat = $('#adminStat');
    try {
      const t = await Auth.token();
      const q = `select=*&order=created_at.desc&limit=100${adminFilter ? '&status=eq.' + encodeURIComponent(adminFilter) : ''}`;
      const rows = await sbSelect(COMMUNITY_BACKEND.inquiriesTable, q, t);
      let members = null; let waiting = null;
      try { members = await sbCount(COMMUNITY_BACKEND.profilesTable, '', t); } catch (_) { /* skip */ }
      try { waiting = await sbCount(COMMUNITY_BACKEND.inquiriesTable, 'status=eq.' + encodeURIComponent('접수'), t); } catch (_) { /* skip */ }
      stat.textContent = [members != null ? `회원 ${members}명` : '', waiting != null ? `새 문의 ${waiting}건` : ''].filter(Boolean).join(' · ');
      box.innerHTML = rows.length ? rows.map((r) => `
        <li class="acc-item" data-id="${escapeHtml(r.id)}">
          <div class="acc-item-head">${statusBadge(r.status)}<span class="mono">${escapeHtml(r.inquiry_type || '문의')}</span><span class="acc-date mono">${formatDate(r.created_at)}</span></div>
          <p class="acc-who"><strong>${escapeHtml(r.name || '')}</strong> · ${escapeHtml(r.contact || '')}${r.user_id ? ' · <span class="mono">회원</span>' : ''}</p>
          <p class="acc-item-text">${escapeHtml(r.message || '')}</p>
          <div class="acc-admin-ctl">
            <select class="ad-status" aria-label="상태">${INQUIRY_STATUS.map((s) => `<option${s === (r.status || '접수') ? ' selected' : ''}>${s}</option>`).join('')}</select>
            <textarea class="ad-reply" rows="2" maxlength="2000" placeholder="회원에게 보일 답변 메모 (선택)">${escapeHtml(r.reply || '')}</textarea>
            <button class="btn btn-sm btn-primary ad-save" type="button">저장</button>
          </div>
        </li>`).join('') : '<li class="acc-empty">해당하는 문의가 없습니다.</li>';
      $$('.ad-save', box).forEach((b) => b.addEventListener('click', async () => {
        const li = b.closest('li');
        b.disabled = true;
        try {
          await sbUpdate(COMMUNITY_BACKEND.inquiriesTable, `id=eq.${encodeURIComponent(li.dataset.id)}`, {
            status: $('.ad-status', li).value, reply: $('.ad-reply', li).value.trim() || null
          }, await Auth.token());
          b.textContent = '저장됨';
          setTimeout(() => { b.textContent = '저장'; b.disabled = false; }, 1200);
        } catch (_) { alert('저장하지 못했습니다.'); b.disabled = false; }
      }));
    } catch (_) { box.innerHTML = '<li class="acc-empty">문의를 불러오지 못했습니다.</li>'; }
  }
  $$('#adminFilters .f-chip').forEach((c) => c.addEventListener('click', () => {
    $$('#adminFilters .f-chip').forEach((x) => x.classList.remove('is-active'));
    c.classList.add('is-active');
    adminFilter = c.dataset.status || '';
    loadAdmin();
  }));

  async function paint() {
    await Auth.ready;
    if (Auth.hashError) say(escapeHtml(Auth.hashError), 'err');
    if (!Auth.user) {
      main.hidden = true;
      guest.hidden = false;
      return;
    }
    guest.hidden = true;
    main.hidden = false;

    const p = await Auth.getProfile(true);
    const meta = Auth.user.user_metadata || {};
    const name = (p && p.name) || Auth.displayName();
    $('#accTitle').innerHTML = `${escapeHtml(name)}님의 <span class="accent">마이페이지</span>`;
    $('#pfName').value = name;
    $('#pfEmail').value = Auth.user.email || '';
    $('#pfType').value = (p && p.member_type) || meta.member_type || '';
    $('#pfPhone').value = (p && p.phone) || meta.phone || '';
    $('#pfMarketing').checked = Boolean(p ? p.marketing : meta.marketing);

    if (Auth.event === 'recovery' || params.get('reset')) {
      $('#accReset').hidden = false;
      $('#npPass').focus();
    } else if (Auth.event === 'signup' || params.get('welcome')) {
      say(`가입을 환영합니다, <strong>${escapeHtml(name)}</strong>님. 이제 문의 진행 상황을 이곳에서 확인하고 커뮤니티에 글을 남길 수 있습니다.`, 'ok');
    }
    if (params.get('welcome') || params.get('reset')) history.replaceState(null, '', location.pathname + location.hash);

    loadInquiries();
    loadPosts();
    if (p && p.role === 'admin') { $('#adminBox').hidden = false; loadAdmin(); }
  }

  /* 내 정보 저장 */
  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = $('#pfName').value.trim();
    const phone = $('#pfPhone').value.trim();
    if (name.length < 2) { say('이름을 2자 이상 입력해 주세요.', 'err'); return; }
    if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) { say('휴대폰 번호를 숫자와 하이픈(-)으로 입력해 주세요.', 'err'); return; }
    setBusy(form, true, '저장 중…');
    try {
      await Auth.updateProfile({ name, member_type: $('#pfType').value || null, phone: phone || null, marketing: $('#pfMarketing').checked });
      $('#accTitle').innerHTML = `${escapeHtml(name)}님의 <span class="accent">마이페이지</span>`;
      say('내 정보를 저장했습니다.', 'ok');
    } catch (_) { say('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'err'); }
    finally { setBusy(form, false); }
  });

  /* 비밀번호 변경 · 재설정 */
  async function changePassword(form, a, b) {
    const p1 = $(a).value; const p2 = $(b).value;
    if (!PASSWORD_RULE.test(p1)) { say('비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.', 'err'); return false; }
    if (p1 !== p2) { say('비밀번호 확인이 일치하지 않습니다.', 'err'); return false; }
    setBusy(form, true, '저장 중…');
    try { await Auth.updatePassword(p1); form.reset(); say('새 비밀번호를 저장했습니다. 다음 로그인부터 새 비밀번호를 사용해 주세요.', 'ok'); return true; }
    catch (err) { say(escapeHtml(authMessage(err)), 'err'); return false; }
    finally { setBusy(form, false); }
  }
  $('#passForm').addEventListener('submit', (e) => { e.preventDefault(); changePassword(e.currentTarget, '#cpPass', '#cpPass2'); });
  $('#resetPassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await changePassword(e.currentTarget, '#npPass', '#npPass2')) $('#accReset').hidden = true;
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await Auth.signOut();
    location.href = '/';
  });

  $('#deleteBtn').addEventListener('click', async () => {
    const typed = prompt('탈퇴하면 되돌릴 수 없습니다. 계속하려면 "탈퇴"라고 입력해 주세요.');
    if (typed === null) return;
    if (typed.trim() !== '탈퇴') { alert('"탈퇴"를 정확히 입력해 주세요.'); return; }
    try {
      await Auth.deleteAccount();
      alert('탈퇴 처리되었습니다. 그동안 함께해 주셔서 감사합니다.');
      location.href = '/';
    } catch (_) { say('탈퇴를 처리하지 못했습니다. 문의하기로 요청해 주시면 바로 처리해 드리겠습니다.', 'err'); }
  });

  paint();
})();
