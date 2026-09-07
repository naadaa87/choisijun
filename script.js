/* =========================================================
   최시준 개인 브랜딩 홈페이지 — 공통 스크립트 (멀티페이지)
   순수 Vanilla JS · 프레임워크/빌드 불필요
   ---------------------------------------------------------
   [설정 1] 게시판·레퍼런스 백엔드 (선택)
   - 아래 값이 비어 있으면: localStorage "데모 모드"
     (작성 글이 본인 브라우저에만 저장됨 — 다른 방문자와 공유 X)
   - Supabase 무료 프로젝트를 만들어 값을 채우면:
     모든 방문자가 함께 쓰는 실제 공유 게시판/아카이브로 동작
   - 테이블 생성 SQL과 설정 방법: README.md 참고
   ========================================================= */
const COMMUNITY_BACKEND = {
  supabaseUrl: '',        // 예: 'https://xxxx.supabase.co'
  supabaseAnonKey: '',    // Supabase anon public key
  table: 'community_posts',
  commentsTable: 'community_comments',
  referencesTable: 'site_references'
};

/* [설정 2] 문의 수신 이메일 — 실제 이메일로 교체하세요 */
const CONTACT_EMAIL = 'runactivator@naver.com';

/* [설정 2-1] 문의 폼 수신 (선택)
   - 비워두면: 방문자의 메일 앱이 열리는 방식(mailto)으로 동작
   - Web3Forms(무료) 액세스 키를 넣으면: 버튼 한 번으로 메일함에 바로 접수
     https://web3forms.com 에서 이메일만 입력하면 키가 발급됩니다 (가입 불필요) */
const FORM_ACCESS_KEY = '';

/* [설정 3] 레퍼런스 등록용 관리자 코드 — 반드시 변경하세요!
   (정적 사이트 특성상 소스에 노출되는 '가벼운 잠금'입니다.
    무단 등록 방지용이며, 완전한 보안이 필요하면 Supabase 정책을 사용하세요) */
const ADMIN_CODE = 'sijun-2026';

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
/* 삭제 비밀번호용 간단 해시 (보안용이 아닌 우발적 삭제 방지용) */
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

function sbHeaders(extra = {}) {
  return Object.assign({
    apikey: COMMUNITY_BACKEND.supabaseAnonKey,
    Authorization: `Bearer ${COMMUNITY_BACKEND.supabaseAnonKey}`,
    'Content-Type': 'application/json'
  }, extra);
}
function sbUrl(table) {
  return `${COMMUNITY_BACKEND.supabaseUrl}/rest/v1/${table}`;
}
async function sbSelect(table, query) {
  const res = await fetch(`${sbUrl(table)}?${query}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}
async function sbInsert(table, row) {
  const res = await fetch(sbUrl(table), {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error('insert failed');
  return res.json();
}

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
  book: '전자책 구매/단체구매 문의'
};

(function contactModule() {
  const form = $('#contactForm');
  if (!form) return;
  const typeSel = $('#cfType');

  const setType = (key) => {
    const value = INQUIRY_MAP[key];
    if (value && typeSel) typeSel.value = value;
  };
  const params = new URLSearchParams(window.location.search);
  if (params.get('inquiry')) setType(params.get('inquiry'));

  $$('[data-inquiry]').forEach((el) => {
    el.addEventListener('click', () => setType(el.dataset.inquiry));
  });

  /* 상태 메시지 영역 */
  let statusEl = $('#cfStatus');
  if (!statusEl) {
    statusEl = document.createElement('p');
    statusEl.id = 'cfStatus';
    statusEl.className = 'cf-status';
    statusEl.hidden = true;
    form.appendChild(statusEl);
  }
  const showStatus = (text, kind) => {
    statusEl.textContent = text;
    statusEl.className = 'cf-status is-' + kind;
    statusEl.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = typeSel ? typeSel.value : '문의';
    const name = ($('#cfName') || {}).value || '';
    const contact = ($('#cfContact') || {}).value || '';
    const msg = ($('#cfMessage') || {}).value || '';
    const subject = `[${type}] ${name}님 문의`;
    const bodyText = `문의 유형: ${type}\n성함/소속: ${name}\n연락처: ${contact}\n\n문의 내용:\n${msg}\n\n— 최시준 홈페이지에서 발송`;
    const btn = form.querySelector('button[type="submit"]');

    /* 폼 수신 키가 설정된 경우: 직접 전송 */
    if (FORM_ACCESS_KEY) {
      const original = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
      showStatus('문의를 전송하고 있습니다…', 'wait');
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: FORM_ACCESS_KEY,
            subject: subject,
            from_name: '최시준 홈페이지',
            문의유형: type, 성함소속: name, 연락처: contact, 문의내용: msg
          })
        });
        const data = await res.json();
        if (data && data.success) {
          form.reset();
          showStatus('문의가 정상적으로 접수되었습니다. 영업일 기준 1~2일 내 회신드리겠습니다. 감사합니다.', 'ok');
        } else {
          throw new Error('send failed');
        }
      } catch (_) {
        showStatus('전송에 실패했습니다. 메일 앱으로 대신 열어드립니다.', 'err');
        window.location.href =
          `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
      }
      return;
    }

    /* 기본: 메일 앱 열기 */
    window.location.href =
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    showStatus('메일 앱이 열립니다. 창이 열리지 않으면 ' + CONTACT_EMAIL + ' 로 보내주세요.', 'wait');
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

  function setMode(text) { if (modeEl) modeEl.textContent = text; }

  function render() {
    const shown = currentCat === '전체' ? posts : posts.filter((p) => p.category === currentCat);
    list.innerHTML = '';
    if (empty) empty.hidden = shown.length > 0;

    shown.forEach((post) => {
      const li = document.createElement('li');
      li.className = 'post' + (post.id === openId ? ' is-open' : '');

      const isOwnerPost = post.author === '최시준' || post.author === '운영자';
      const commentsCount = (post.comments || []).length;

      const commentsHtml = (post.comments || []).map((c) => {
        const isOwner = c.author === '최시준' || c.author === '운영자';
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
            <form class="comment-form" data-post="${escapeHtml(String(post.id))}">
              <input type="text" class="cm-author" maxlength="20" placeholder="닉네임" required />
              <textarea class="cm-content" maxlength="500" rows="1" placeholder="답글을 남겨주세요" required></textarea>
              <button type="submit" class="btn btn-sm btn-line">등록</button>
            </form>
          </div>
          ${post.pass ? '<button class="post-del" type="button">글 삭제</button>' : ''}
        </div>`;

      const head = $('.post-head', li);
      head.addEventListener('click', () => {
        openId = openId === post.id ? null : post.id;
        render();
      });

      const cform = $('.comment-form', li);
      if (cform) cform.addEventListener('submit', async (e) => {
        e.preventDefault();
        const author = $('.cm-author', cform).value.trim();
        const content = $('.cm-content', cform).value.trim();
        if (!author || !content) return;
        await addComment(post.id, author, content);
      });

      const delBtn = $('.post-del', li);
      if (delBtn) delBtn.addEventListener('click', () => deletePost(post));

      list.appendChild(li);
    });
  }

  async function addComment(postId, author, content) {
    const comment = { post_id: postId, author, content, created_at: new Date().toISOString() };
    if (IS_REMOTE) {
      try { await sbInsert(COMMUNITY_BACKEND.commentsTable, { post_id: postId, author, content }); }
      catch (_) { alert('답글 등록에 실패했습니다. 잠시 후 다시 시도해주세요.'); return; }
      try { posts = await fetchRemotePosts(); } catch (_) { /* keep */ }
    } else {
      const post = posts.find((p) => String(p.id) === String(postId));
      if (post) { post.comments = post.comments || []; post.comments.push(comment); saveLocalPosts(posts); }
    }
    openId = postId;
    render();
  }

  function deletePost(post) {
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
      const show = formEl.hidden;
      formEl.hidden = !show;
      writeBtn.setAttribute('aria-expanded', String(show));
      if (show) $('#bfAuthor').focus();
    });
  }
  if (cancelBtn && formEl) cancelBtn.addEventListener('click', () => { formEl.hidden = true; });

  if (formEl) formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = $('#bfAuthor').value.trim();
    const category = $('#bfCategory').value;
    const passRaw = $('#bfPass').value;
    const title = $('#bfTitle').value.trim();
    const content = $('#bfContent').value.trim();
    if (!author || !title || !content) return;

    if (IS_REMOTE) {
      try {
        await sbInsert(COMMUNITY_BACKEND.table, { author, category, title, content });
        posts = await fetchRemotePosts();
      } catch (_) { alert('등록에 실패했습니다. 잠시 후 다시 시도해주세요.'); return; }
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
      setMode('LIVE — 모든 방문자와 공유되는 게시판입니다.');
      try { posts = await fetchRemotePosts(); }
      catch (_) {
        setMode('연결 오류 — 임시로 데모 모드로 표시합니다.');
        posts = loadLocalPosts();
      }
    } else {
      setMode('DEMO — 현재 작성 글은 이 브라우저에만 저장됩니다. (실제 공유 게시판 전환: README 참고)');
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
        <a class="post-head" href="community.html" style="text-decoration:none;">
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
  { id: 'r-02', year: '2018', category: '브랜드',     title: '쏘플파티룸(SSOPLE) 홍대 1호점 런칭', desc: '프라이빗 공간대여 브랜드 쏘플 시작. 예약제 파티룸 모델의 원형을 만든 프로젝트.', link: 'https://ssople.com' },
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
  { id: 'r-16', year: '2025', category: '공간개발',   title: '비선호층 공실개발 프로젝트 다수 수행', desc: '고층·지하·장기 공실을 목적형 수익공간으로 전환 — 유형별 상세는 사례 페이지 참고.', link: 'cases.html' },
  { id: 'r-17', year: '2026', category: '강의·교육',  title: '공간대여 창업 아카데미 · 오너스클럽 운영', desc: '검증된 체크리스트 기반 창업 교육과 수료생 네트워크 운영.', link: '' },
  { id: 'r-18', year: '2026', category: '파트너십',   title: '중개법인 · 금융 파트너 협업 확대', desc: '공실 매물 개발 협업, NPL·개발 프로젝트 등 파트너십 확장 진행 중.', link: '' },
  { id: 'r-19', year: '2016~', category: '강의·교육',  title: '삼성전자 · 현대자동차 · 현대카드 등 기업·기관 강연', desc: '우리은행, 코웨이, 3M, 서울시청, 신용보증재단, 한국과학창의재단 등 기업·공공기관 대상 강연 다수. TEDxCAU 연사.', link: '' },
  { id: 'r-20', year: '2016~', category: '강의·교육',  title: '고려대 · 한양대 · 이화여대 등 30여 개 대학 강연', desc: '중앙대, 부산대, 동국대, 홍익대, 전남대, 인천대, 순천향대 등 전국 대학 창업 강의·특강.', link: '' },
  { id: 'r-21', year: '2016~', category: '강의·교육',  title: "퇴사학교(T-School) 학과장 · '부업가정신' 2년 완판", desc: '직장인 대상 실행형 창업 강의로 2년간 완판을 기록한 대표 강의.', link: '' },
  { id: 'r-22', year: '2015~', category: '언론·미디어', title: 'KBS 8시뉴스 · JTBC · 중국 CCTV · MBC 다큐 출연', desc: '청년 창업, 퇴사 트렌드, 공간 비즈니스를 주제로 한 방송 인터뷰·보도. EBS, 매경이코노미 등 지면 다수.', link: 'media.html' },
  { id: 'r-23', year: '2016~', category: '파트너십',   title: '한국스타트업협회 위원장 · 청년허브 심사위원', desc: '청년허브 공간지원 심사위원, 로컬크리에이터 평가위원, 사단법인 청년위함 연구소장 등 대외 활동.', link: '' },
  { id: 'r-24', year: '2026', category: '브랜드',     title: '공백 — 공실개발 플랫폼 vacancy.co.kr 오픈', desc: '공실 진단부터 수익공간 개발까지, 공실 솔루션 전용 사이트 구축·공개.', link: 'https://vacancy.co.kr/' },
  { id: 'r-25', year: '2026', category: '공간개발',   title: 'TGRZ SPACE — 통건물 마스터리스 사업 런칭', desc: '건물 전체를 임차·개발·운영하는 통건물 전담 브랜드와 사이트 공개.', link: 'https://tgrzspace.pages.dev/' },
  { id: 'r-26', year: '2026', category: '파트너십',   title: '오르비스중개법인 — 부동산 중개 파트너 운영', desc: '공실·수익형 매물의 발굴과 중개를 전담하는 직영 중개법인 사이트 공개.', link: 'https://orbisestate.pages.dev/' },
  { id: 'r-27', year: '2026', category: '브랜드',     title: '개인 브랜드 허브 choisijun.com 구축', desc: '11개 페이지의 공식 홈페이지 오픈 — 사례·레퍼런스·미디어·커뮤니티·전자책을 한곳에.', link: 'index.html' },
  { id: 'r-28', year: '2026', category: '강의·교육',  title: "전자책 시리즈 2종 기획 — '공실은 자산이다' 외", desc: "'예약되는 공간'까지 — 340개+ 공간의 판단기준을 담은 전자책 시리즈 준비.", link: 'books.html' },
  { id: 'r-29', year: '2026', category: '파트너십',   title: 'AI 업무 에이전트 8종 구축 — 운영 자동화 확장', desc: '문의 선별, CS 응대, 리뷰 모니터링, 공실 매물 스크리닝, 레퍼런스 아카이빙, 운영 이상감지, 콘텐츠 자산화, 강연 설계 — AI 기반 자동화 도구를 실무에 적용.', link: '' }
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
      const del = r.userAdded
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
      if (delBtn) delBtn.addEventListener('click', () => {
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
    const code = $('#rfCode').value;
    if (code !== ADMIN_CODE) { alert('관리자 코드가 일치하지 않습니다.'); return; }

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
        });
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
    return rows.map((r) => ({ ...r, userAdded: false }));
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
      if (modeEl) modeEl.textContent = 'LIVE — 등록한 레퍼런스가 모든 방문자에게 공개됩니다.';
      try { userRefs = await fetchRemoteRefs(); }
      catch (_) {
        if (modeEl) modeEl.textContent = '연결 오류 — 기본 아카이브만 표시합니다.';
        userRefs = loadUserRefs();
      }
    } else {
      if (modeEl) modeEl.textContent = 'DEMO — 새로 등록한 레퍼런스는 이 브라우저에만 저장됩니다. (공유 전환: README 참고)';
      userRefs = loadUserRefs();
    }
    render();
  })();
})();
