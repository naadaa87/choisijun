/* =========================================================
   최시준 홈페이지 — 관리자 페이지 (/admin)
   대시보드 · KPI(방문 통계) · 문의 · 회원 · 커뮤니티 · 레퍼런스 · 매일 글 · 설정
   서버: Cloudflare Pages Functions (/api/admin/*) + D1
   ========================================================= */
(function adminApp() {
  'use strict';
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = q('#admApp');
  if (!app) return;

  const gate = q('#admGate');
  const loginForm = q('#admLogin');
  const setupBox = q('#admSetup');
  const msgEl = q('#admMsg');
  const whoEl = q('#admWho');

  const TYPES = ['공실개발 상담', '공간수익화 진단', '창업 교육 문의', '강의/세미나 문의', '인터뷰/미디어 문의', '제휴/공동사업 문의', '전자책 구매/단체구매 문의', '공간 이용·대관 문의', '기타 문의'];
  const STATUS = ['접수', '진행중', '완료', '보관'];
  const POST_STATE = { pending: '확인 대기', published: '게시됨', hidden: '숨김' };
  const LANE_NAMES = { MON: '월 · 공실·건물 실무', TUE: '화 · 지나온 일', WED: '수 · 시장과 산업', THU: '목 · 창업·운영 실무', FRI: '금 · 강연과 교육', SAT: '토 · 지금 하는 일·레퍼런스', SUN: '일 · 생각과 비전' };
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const REPO = 'https://github.com/naadaa87/choisijun';

  const state = {
    setup: {}, overview: null, inquiries: [], inqFilter: { status: '', type: '', q: '' }, openInq: null,
    community: { posts: [], comments: [] }, comFilter: 'pending', refs: [], editRef: null, refImage: '', content: null,
    kpiRange: '7', kpi: null, members: [], memTotal: 0, memMk: 0, memFilter: { type: '', q: '', mk: false }, openMem: null, tempPw: null
  };

  /* ---------------- 공통 ---------------- */
  function showMsg(text, kind = 'info') {
    msgEl.textContent = text;
    msgEl.className = 'auth-msg is-' + kind;
    msgEl.hidden = !text;
    if (text && kind !== 'err') setTimeout(() => { if (msgEl.textContent === text) msgEl.hidden = true; }, 4000);
  }

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch('/api/admin/' + path, init); }
    catch (_) { throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
    let data = {};
    try { data = await res.json(); } catch (_) { data = {}; }
    if (res.status === 401 && data.code === 'auth') { showLogin(); throw new Error('다시 로그인해 주세요.'); }
    if (!res.ok || data.ok === false) throw new Error(data.error || ('요청을 처리하지 못했습니다 (' + res.status + ')'));
    return data;
  }

  const KST = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
  };
  const kstDate = (d) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const todayKST = () => kstDate(new Date());
  const ago = (iso) => {
    const h = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (h < 1) return '방금';
    if (h < 24) return Math.floor(h) + '시간 전';
    return Math.floor(h / 24) + '일 전';
  };

  const fmtN = (n) => Number(n || 0).toLocaleString('ko-KR');
  const fmtDur = (ms) => {
    const t = Math.round((Number(ms) || 0) / 1000);
    if (t < 60) return t + '초';
    const m = Math.floor(t / 60);
    if (m < 60) return m + '분 ' + String(t % 60).padStart(2, '0') + '초';
    return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
  };
  const ratio = (a, b) => (b ? a / b : 0);
  const fmtPct = (x, digits = 1) => {
    let t = (Math.round(x * 100 * Math.pow(10, digits)) / Math.pow(10, digits)).toFixed(digits);
    if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
    return t + '%';
  };
  function downloadCsv(name, rows) {
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- 로그인 ---------------- */
  function showLogin(help) {
    app.hidden = true;
    gate.hidden = false;
    loginForm.hidden = false;
    if (help) q('#admLoginHelp').textContent = help;
    setTimeout(() => { const p = q('#admPassword'); if (p) p.focus(); }, 50);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = q('#admPassword').value;
    if (!pw) return;
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api('login', { method: 'POST', body: { password: pw } });
      q('#admPassword').value = '';
      showMsg('');
      await boot();
    } catch (err) {
      showMsg(err.message, 'err');
    } finally { btn.disabled = false; }
  });

  q('#admLogout').addEventListener('click', async () => {
    try { await api('logout', { method: 'POST' }); } catch (_) { /* ignore */ }
    showLogin('로그아웃했습니다. 다시 들어오려면 비밀번호를 입력해 주세요.');
  });

  /* ---------------- 탭 ---------------- */
  function go(tab) {
    qa('.adm-tab').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
    qa('.adm-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    try { history.replaceState(null, '', '#' + tab); } catch (_) { /* ignore */ }
    if (tab === 'kpi') loadKpi();
    if (tab === 'members') loadMembers();
    if (tab === 'inquiries') loadInquiries();
    if (tab === 'community') loadCommunity();
    if (tab === 'refs') loadRefs();
    if (tab === 'content') loadContent();
    if (tab === 'system') renderSystem();
    if (tab === 'dash') loadOverview();
    window.scrollTo({ top: 0 });
  }
  qa('.adm-tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t && app.contains(t)) { e.preventDefault(); go(t.dataset.go); }
  });
  q('#admRefresh').addEventListener('click', () => {
    const cur = (qa('.adm-tab').find((b) => b.classList.contains('is-active')) || {}).dataset;
    go(cur ? cur.tab : 'dash');
  });

  /* ---------------- 대시보드 ---------------- */
  async function loadOverview() {
    try {
      const d = await api('overview');
      state.overview = d;
      state.setup = d.setup || state.setup;
      const c = d.counts;
      q('#cntInq').textContent = c.inq_new ? String(c.inq_new) : '';
      q('#cntCom').textContent = (c.posts_pending + c.comments_pending) ? String(c.posts_pending + c.comments_pending) : '';
      q('#cntRef').textContent = c.refs ? String(c.refs) : '';
      const v = d.visits || {};
      q('#cntMem').textContent = c.members ? String(c.members) : '';
      const kpis = [
        ['inquiries', c.inq_new, '새 문의', '답을 기다리는 문의'],
        ['kpi', fmtN(v.today_v || 0), '오늘 방문자', `어제 ${fmtN(v.yday_v || 0)}명 · 지금 ${v.live || 0}명`],
        ['kpi', fmtN(v.today_pv || 0), '오늘 페이지뷰', `어제 ${fmtN(v.yday_pv || 0)}회`],
        ['inquiries', c.inq_progress, '진행 중', '상담·답변 진행'],
        ['inquiries', c.inq_month, '이번 달 문의', '전체 ' + c.inq_total + '건'],
        ['members', fmtN(c.members || 0), '회원', '이번 달 가입 ' + (c.members_month || 0) + '명'],
        ['community', c.posts_pending + c.comments_pending, '게시 확인 대기', '글 ' + c.posts_pending + ' · 답글 ' + c.comments_pending],
        ['refs', c.refs, '등록한 레퍼런스', '레퍼런스 페이지에 공개']
      ];
      q('#admKpis').innerHTML = kpis.map(([tab, n, label, foot]) =>
        `<li><button type="button" data-go="${tab}"><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${esc(label)}</span><span class="adm-kpi-foot">${esc(foot)}</span></button></li>`).join('');

      q('#admRecent').innerHTML = d.recent.length ? d.recent.map((r) => `
        <li class="acc-item adm-click" data-inq="${r.id}">
          <div class="acc-item-head"><span class="adm-tag">${esc(r.type)}</span><span class="adm-tag ${r.status === '완료' ? 'is-ok' : r.status === '접수' ? 'is-ad' : ''}">${esc(r.status)}</span><span class="acc-date mono">${KST(r.created_at)}</span></div>
          <p class="acc-who"><strong>${esc(r.name)}</strong> · ${ago(r.created_at)}</p>
        </li>`).join('') : '<li class="acc-empty">아직 들어온 문의가 없습니다.</li>';
      qa('#admRecent [data-inq]').forEach((li) => li.addEventListener('click', () => { state.openInq = Number(li.dataset.inq); go('inquiries'); }));

      const todo = [];
      if (c.inq_stale) todo.push(`<li class="is-late">2일 넘게 답하지 않은 문의가 <strong>${c.inq_stale}건</strong> 있습니다. <button class="link-btn" data-go="inquiries">문의 보기</button></li>`);
      if (c.inq_new) todo.push(`<li>새 문의 <strong>${c.inq_new}건</strong>에 답해 주세요.</li>`);
      if (c.posts_pending || c.comments_pending) todo.push(`<li>커뮤니티 글 ${c.posts_pending}건, 답글 ${c.comments_pending}건이 게시를 기다립니다. <button class="link-btn" data-go="community">확인하기</button></li>`);
      const s = state.setup;
      const mailCfg = Boolean((window.SITE_CONFIG || {}).formAccessKey);
      if (!s.mail && !mailCfg) todo.push('<li>문의가 들어와도 메일 알림이 오지 않습니다. 메일 알림을 켜 두면 놓치지 않습니다. <button class="link-btn" data-go="system">설정 보기</button></li>');
      if (!s.turnstile) todo.push('<li>(선택) 스팸이 늘면 Cloudflare Turnstile로 자동 등록을 막을 수 있습니다.</li>');
      q('#admTodo').innerHTML = todo.length ? todo.join('') : '<li class="acc-empty">지금 처리할 일이 없습니다.</li>';
      loadDailySummary();
    } catch (err) { showMsg(err.message, 'err'); }
  }

  async function loadDailySummary() {
    const box = q('#admDaily');
    try {
      const d = state.content || await api('content');
      state.content = d;
      const today = todayKST();
      const published = (d.recent || []).find((r) => r.date && kstDate(new Date(r.date)) === today);
      const drafts = draftsOf(d).filter((x) => x.date >= today).slice(0, 4);
      box.innerHTML = `
        <p class="adm-daily-state">${d.paused ? '<span class="adm-tag is-ad">발행 멈춤</span> 매일 글 발행이 멈춰 있습니다.' : '<span class="adm-tag is-ok">발행 중</span> 매일 아침 7시 전후로 한 편씩 올라갑니다.'}</p>
        <p class="acc-who">오늘 글: ${published ? `<a href="${esc(published.link)}" target="_blank" rel="noopener"><strong>${esc(cleanTitle(published.title))}</strong></a>` : '<span>아직 올라오지 않았습니다 (보통 7시 전후)</span>'}</p>
        ${drafts.length ? '<ul class="adm-sched">' + drafts.map((x) => `<li><span class="mono">${esc(fmtDay(x.date))}</span> ${esc(x.title)}</li>`).join('') + '</ul>' : ''}`;
    } catch (err) {
      box.innerHTML = `<p class="acc-empty">${esc(err.message)}</p>`;
    }
  }

  /* ---------------- 문의 ---------------- */
  const typeSel = q('#inqType');
  typeSel.innerHTML = '<option value="">모든 유형</option>' + TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
  qa('#inqStatus .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#inqStatus .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    state.inqFilter.status = b.dataset.status;
    loadInquiries();
  }));
  typeSel.addEventListener('change', () => { state.inqFilter.type = typeSel.value; loadInquiries(); });
  let searchTimer;
  q('#inqSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.inqFilter.q = e.target.value.trim(); loadInquiries(); }, 300);
  });

  async function loadInquiries() {
    const f = state.inqFilter;
    const qs = new URLSearchParams();
    if (f.status) qs.set('status', f.status);
    if (f.type) qs.set('type', f.type);
    if (f.q) qs.set('q', f.q);
    try {
      const d = await api('inquiries' + (qs.toString() ? '?' + qs : ''));
      state.inquiries = d.inquiries;
      renderInquiries();
    } catch (err) { showMsg(err.message, 'err'); }
  }

  function renderInquiries() {
    const list = q('#inqList');
    const rows = state.inquiries;
    list.innerHTML = rows.length ? rows.map((r) => `
      <li class="adm-row${r.id === state.openInq ? ' is-open' : ''}" tabindex="0" data-id="${r.id}">
        <div class="acc-item-head"><span class="adm-tag">${esc(r.type)}</span><span class="adm-tag ${r.status === '완료' ? 'is-ok' : r.status === '접수' ? 'is-ad' : r.status === '보관' ? 'is-off' : ''}">${esc(r.status)}</span>${r.member_id ? '<span class="adm-tag is-mail">회원</span>' : ''}<span class="acc-date mono">${KST(r.created_at)}</span></div>
        <p class="adm-row-title"><strong>${esc(r.name)}</strong><span>${esc(r.contact)}</span></p>
        <p class="adm-row-text">${esc(r.message.slice(0, 90))}${r.message.length > 90 ? '…' : ''}</p>
      </li>`).join('') : '<li class="acc-empty">조건에 맞는 문의가 없습니다.</li>';
    qa('.adm-row', list).forEach((li) => {
      const open = () => { state.openInq = Number(li.dataset.id); renderInquiries(); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
    renderInquiryDetail();
  }

  function contactLinks(contact, r) {
    const out = [];
    const email = (contact.match(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/) || [])[0];
    const phone = (contact.replace(/[^\d+]/g, '').match(/^\+?\d{9,13}$/) || [])[0];
    if (email) {
      const subject = `Re: [${r.type}] 문의 주셔서 감사합니다 — 최시준`;
      const body = `${r.name}님, 안녕하세요. 최시준입니다.\n\n남겨 주신 문의 잘 받았습니다.\n\n\n\n— 최시준 드림\nchoisijun.com\n\n----- 보내 주신 문의 (${KST(r.created_at)}) -----\n${r.message}`;
      out.push(`<a href="mailto:${esc(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">메일로 답장</a>`);
    }
    if (phone) {
      out.push(`<a href="tel:${esc(phone)}">전화</a>`);
      out.push(`<a href="sms:${esc(phone)}">문자</a>`);
    }
    out.push('<button type="button" class="link-btn" data-copy>연락처 복사</button>');
    return out.join('');
  }

  function renderInquiryDetail() {
    const box = q('#inqDetail');
    const r = state.inquiries.find((x) => x.id === state.openInq);
    if (!r) { box.innerHTML = '<p class="acc-empty">왼쪽에서 문의를 고르면 내용과 답장 도구가 여기에 열립니다.</p>'; return; }
    box.innerHTML = `
      <div class="acc-item-head"><span class="adm-tag">${esc(r.type)}</span>${r.member_id ? `<button type="button" class="adm-tag is-mail adm-tag-btn" data-member="${r.member_id}">회원 정보 보기</button>` : ''}<span class="acc-date mono">${KST(r.created_at)} · #${r.id}</span></div>
      <h2 class="adm-detail-name">${esc(r.name)}</h2>
      <p class="adm-contact"><span>${esc(r.contact)}</span>${contactLinks(r.contact, r)}</p>
      <div class="adm-message">${esc(r.message)}</div>
      <p class="acc-help">보낸 곳: ${esc(r.page || '-')}${r.updated_at ? ' · 마지막 처리 ' + KST(r.updated_at) : ''}</p>
      <div class="adm-reply">
        <p class="mono adm-label">상태</p>
        <div class="board-filters adm-status">${STATUS.map((s) => `<button type="button" class="f-chip${s === r.status ? ' is-active' : ''}" data-st="${s}">${s}</button>`).join('')}</div>
        <label class="adm-memo"><span class="mono adm-label">내부 메모 <small>(고객에게 보이지 않습니다)</small></span><textarea rows="4" maxlength="4000" id="inqMemo" placeholder="예: 10/27 전화 상담, 현장 방문 일정 조율 중">${esc(r.memo || '')}</textarea></label>
        <div class="adm-btns"><button type="button" class="btn btn-sm btn-primary" id="inqMemoSave">메모 저장</button><button type="button" class="btn btn-sm btn-line" id="inqDelete">삭제</button></div>
      </div>`;
    qa('[data-st]', box).forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('inquiries/' + r.id, { method: 'PATCH', body: { status: b.dataset.st } });
        r.status = b.dataset.st; r.updated_at = new Date().toISOString();
        showMsg(`#${r.id} 문의를 '${b.dataset.st}'(으)로 바꿨습니다.`, 'ok');
        renderInquiries();
        refreshCounts();
      } catch (err) { showMsg(err.message, 'err'); }
    }));
    q('#inqMemoSave', box).addEventListener('click', async () => {
      const memo = q('#inqMemo', box).value;
      try { await api('inquiries/' + r.id, { method: 'PATCH', body: { memo } }); r.memo = memo; showMsg('메모를 저장했습니다.', 'ok'); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    q('#inqDelete', box).addEventListener('click', async () => {
      if (!confirm(`#${r.id} ${r.name}님의 문의를 완전히 지울까요? 되돌릴 수 없습니다.\n(남겨 두려면 '보관'을 누르세요)`)) return;
      try { await api('inquiries/' + r.id, { method: 'DELETE' }); state.openInq = null; showMsg('삭제했습니다.', 'ok'); loadInquiries(); refreshCounts(); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    const memBtn = q('[data-member]', box);
    if (memBtn) memBtn.addEventListener('click', () => { state.openMem = Number(memBtn.dataset.member); go('members'); });
    const copyBtn = q('[data-copy]', box);
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(r.contact); showMsg('연락처를 복사했습니다.', 'ok'); } catch (_) { showMsg(r.contact, 'info'); }
    });
  }

  q('#inqCsv').addEventListener('click', () => {
    const rows = state.inquiries;
    if (!rows.length) { showMsg('내려받을 문의가 없습니다.', 'info'); return; }
    const head = ['번호', '접수일시', '유형', '성함/소속', '연락처', '문의 내용', '상태', '메모', '보낸 페이지'];
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '﻿' + [head.map(cell).join(',')].concat(rows.map((r) => [r.id, KST(r.created_at), r.type, r.name, r.contact, r.message, r.status, r.memo, r.page].map(cell).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `문의목록_${todayKST()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  async function refreshCounts() {
    try {
      const d = await api('overview');
      const c = d.counts;
      q('#cntInq').textContent = c.inq_new ? String(c.inq_new) : '';
      q('#cntCom').textContent = (c.posts_pending + c.comments_pending) ? String(c.posts_pending + c.comments_pending) : '';
      q('#cntRef').textContent = c.refs ? String(c.refs) : '';
    } catch (_) { /* ignore */ }
  }

  /* ---------------- 커뮤니티 ---------------- */
  qa('#comFilter .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#comFilter .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    state.comFilter = b.dataset.f;
    renderCommunity();
  }));
  const comWrite = q('#comWrite');
  q('#comWriteBtn').addEventListener('click', () => { comWrite.hidden = !comWrite.hidden; if (!comWrite.hidden) q('#cwTitle').focus(); });
  q('#cwCancel').addEventListener('click', () => { comWrite.hidden = true; });
  comWrite.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { category: q('#cwCategory').value, title: q('#cwTitle').value.trim(), content: q('#cwContent').value.trim() };
    if (!body.title || !body.content) { showMsg('제목과 내용을 적어 주세요.', 'err'); return; }
    try { await api('community/post', { method: 'POST', body }); comWrite.reset(); comWrite.hidden = true; showMsg('게시했습니다.', 'ok'); loadCommunity(); }
    catch (err) { showMsg(err.message, 'err'); }
  });

  async function loadCommunity() {
    try {
      const d = await api('community');
      state.community = { posts: d.posts, comments: d.comments };
      renderCommunity();
    } catch (err) { showMsg(err.message, 'err'); }
  }

  function renderCommunity() {
    const list = q('#comList');
    const f = state.comFilter;
    const { posts, comments } = state.community;
    const byPost = {};
    comments.forEach((c) => { (byPost[c.post_id] = byPost[c.post_id] || []).push(c); });
    const shown = posts.filter((p) => {
      if (!f) return true;
      if (f === 'pending') return p.status === 'pending' || (byPost[p.id] || []).some((c) => c.status === 'pending');
      return p.status === f;
    });
    const btns = (kind, item) => {
      const b = [];
      if (item.status !== 'published') b.push(`<button type="button" class="btn btn-sm btn-primary" data-act="published" data-kind="${kind}" data-id="${item.id}">게시</button>`);
      if (item.status !== 'hidden') b.push(`<button type="button" class="btn btn-sm btn-line" data-act="hidden" data-kind="${kind}" data-id="${item.id}">숨김</button>`);
      b.push(`<button type="button" class="btn btn-sm btn-line" data-act="delete" data-kind="${kind}" data-id="${item.id}">삭제</button>`);
      return b.join('');
    };
    const stTag = (s) => `<span class="adm-tag ${s === 'published' ? 'is-ok' : s === 'pending' ? 'is-ad' : 'is-off'}">${POST_STATE[s] || s}</span>`;
    list.innerHTML = shown.length ? shown.map((p) => {
      const cs = byPost[p.id] || [];
      return `
      <li class="adm-row is-static">
        <div class="acc-item-head"><span class="adm-tag">${esc(p.category)}</span>${stTag(p.status)}${p.is_staff ? '<span class="adm-tag is-mail">운영자</span>' : ''}<span class="acc-date mono">${KST(p.created_at)}</span></div>
        <p class="adm-row-title"><strong>${esc(p.title)}</strong><span>${esc(p.author)}</span></p>
        <p class="adm-row-text">${esc(p.content)}</p>
        <div class="adm-btns adm-row-btns">${btns('post', p)}</div>
        ${cs.length ? '<ul class="adm-comments">' + cs.map((c) => `
          <li><div class="acc-item-head">${stTag(c.status)}${c.is_staff ? '<span class="adm-tag is-mail">운영자</span>' : ''}<strong>${esc(c.author)}</strong><span class="acc-date mono">${KST(c.created_at)}</span></div>
          <p class="adm-row-text">${esc(c.content)}</p><div class="adm-btns adm-row-btns">${btns('comment', c)}</div></li>`).join('') + '</ul>' : ''}
        ${p.status === 'published' ? `<form class="adm-note-form" data-reply="${p.id}"><input type="text" maxlength="1500" placeholder="운영자 답글 (바로 게시됩니다)" required /><button class="btn btn-sm btn-line" type="submit">답글</button></form>` : ''}
      </li>`;
    }).join('') : `<li class="acc-empty">${f === 'pending' ? '확인을 기다리는 글이나 답글이 없습니다.' : '해당하는 글이 없습니다.'}</li>`;

    qa('[data-act]', list).forEach((b) => b.addEventListener('click', async () => {
      const { act, kind, id } = b.dataset;
      try {
        if (act === 'delete') {
          if (!confirm(kind === 'post' ? '이 글을 지울까요? 달린 답글도 함께 지워집니다.' : '이 답글을 지울까요?')) return;
          await api(`community/${kind}/${id}`, { method: 'DELETE' });
        } else {
          await api(`community/${kind}/${id}`, { method: 'PATCH', body: { status: act } });
        }
        showMsg(act === 'published' ? '게시했습니다.' : act === 'hidden' ? '숨겼습니다.' : '삭제했습니다.', 'ok');
        loadCommunity(); refreshCounts();
      } catch (err) { showMsg(err.message, 'err'); }
    }));
    qa('[data-reply]', list).forEach((form) => form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = q('input', form);
      const content = input.value.trim();
      if (!content) return;
      try { await api('community/comment', { method: 'POST', body: { post_id: Number(form.dataset.reply), content } }); showMsg('답글을 게시했습니다.', 'ok'); loadCommunity(); }
      catch (err) { showMsg(err.message, 'err'); }
    }));
  }

  /* ---------------- 레퍼런스 ---------------- */
  const refForm = q('#refForm');
  const rfImage = q('#rfImage');

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let qv = 0.82;
        let out = c.toDataURL('image/jpeg', qv);
        while (out.length > 700000 && qv > 0.4) { qv -= 0.12; out = c.toDataURL('image/jpeg', qv); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다.')); };
      img.src = url;
    });
  }

  function setPreview(src) {
    state.refImage = src || '';
    q('#rfPreview').hidden = !src;
    if (src) q('#rfPreviewImg').src = src;
  }
  rfImage.addEventListener('change', async () => {
    const f = rfImage.files && rfImage.files[0];
    if (!f) return;
    try { setPreview(await resizeImage(f)); } catch (err) { showMsg(err.message, 'err'); }
  });
  q('#rfImageClear').addEventListener('click', () => { rfImage.value = ''; setPreview(''); });

  function resetRefForm() {
    refForm.reset();
    q('#rfVisible').checked = true;
    setPreview('');
    state.editRef = null;
    q('#refFormTitle').textContent = '레퍼런스 등록';
    q('#rfSubmit').textContent = '등록';
    q('#rfReset').hidden = true;
  }
  q('#rfReset').addEventListener('click', resetRefForm);

  refForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      year: q('#rfYear').value.trim(), category: q('#rfCategory').value, title: q('#rfTitle').value.trim(),
      description: q('#rfDesc').value.trim(), link: q('#rfLink').value.trim(), image: state.refImage, visible: q('#rfVisible').checked
    };
    if (!body.year || !body.title) { showMsg('연도와 제목은 꼭 적어 주세요.', 'err'); return; }
    const btn = q('#rfSubmit');
    btn.disabled = true;
    try {
      if (state.editRef) await api('refs/' + state.editRef, { method: 'PATCH', body });
      else await api('refs', { method: 'POST', body });
      showMsg(state.editRef ? '수정했습니다.' : '등록했습니다. 레퍼런스 페이지에 바로 보입니다.', 'ok');
      resetRefForm();
      loadRefs(); refreshCounts();
    } catch (err) { showMsg(err.message, 'err'); }
    finally { btn.disabled = false; }
  });

  async function loadRefs() {
    try {
      const d = await api('refs');
      state.refs = d.refs;
      const list = q('#refList');
      list.innerHTML = d.refs.length ? d.refs.map((r) => `
        <li class="acc-item adm-ref-item">
          ${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy" />` : '<span class="adm-ref-noimg mono">REF</span>'}
          <div>
            <div class="acc-item-head"><span class="adm-tag">${esc(r.category)}</span><span class="mono">${esc(r.year)}</span>${r.visible ? '<span class="adm-tag is-ok">공개</span>' : '<span class="adm-tag is-off">숨김</span>'}</div>
            <p class="acc-item-title">${esc(r.title)}</p>
            <p class="acc-help">${esc(r.description)}</p>
            <div class="adm-btns"><button type="button" class="btn btn-sm btn-line" data-edit="${r.id}">수정</button><button type="button" class="btn btn-sm btn-line" data-vis="${r.id}">${r.visible ? '숨기기' : '공개하기'}</button><button type="button" class="btn btn-sm btn-line" data-del="${r.id}">삭제</button></div>
          </div>
        </li>`).join('') : '<li class="acc-empty">아직 여기서 등록한 레퍼런스가 없습니다. 기본 아카이브는 레퍼런스 페이지에 그대로 보입니다.</li>';
      qa('[data-edit]', list).forEach((b) => b.addEventListener('click', () => {
        const r = state.refs.find((x) => x.id === Number(b.dataset.edit));
        if (!r) return;
        state.editRef = r.id;
        q('#rfYear').value = r.year; q('#rfCategory').value = r.category; q('#rfTitle').value = r.title;
        q('#rfDesc').value = r.description; q('#rfLink').value = r.link; q('#rfVisible').checked = Boolean(r.visible);
        setPreview(r.image);
        q('#refFormTitle').textContent = '레퍼런스 수정';
        q('#rfSubmit').textContent = '저장';
        q('#rfReset').hidden = false;
        refForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      qa('[data-vis]', list).forEach((b) => b.addEventListener('click', async () => {
        const r = state.refs.find((x) => x.id === Number(b.dataset.vis));
        try { await api('refs/' + r.id, { method: 'PATCH', body: { only: 'visible', visible: !r.visible } }); loadRefs(); }
        catch (err) { showMsg(err.message, 'err'); }
      }));
      qa('[data-del]', list).forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('이 레퍼런스를 지울까요?')) return;
        try { await api('refs/' + b.dataset.del, { method: 'DELETE' }); showMsg('삭제했습니다.', 'ok'); loadRefs(); refreshCounts(); }
        catch (err) { showMsg(err.message, 'err'); }
      }));
    } catch (err) { showMsg(err.message, 'err'); }
  }

  /* ---------------- 매일 글 ---------------- */
  const cleanTitle = (t) => String(t || '').replace(/\s*\|\s*최시준\s*$/, '');
  const fmtDay = (iso) => `${iso.slice(5).replace('-', '.')} (${DAYS[new Date(iso + 'T12:00:00+09:00').getUTCDay()]})`;
  function draftsOf(d) {
    const out = [];
    Object.values(d.lanes || {}).forEach((lane) => lane.items.forEach((it) => { if (it.state === 'd' && it.date) out.push({ ...it, lane: lane.key }); }));
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  async function loadContent(force) {
    const box = q('#cntBox');
    try {
      const d = await api('content');
      state.content = d;
      const gh = d.github;
      const today = todayKST();
      const drafts = draftsOf(d).filter((x) => x.date >= today);
      const lanes = (d.order || []).filter((k) => k !== 'HOLD').map((k) => d.lanes[k]);
      const hold = d.lanes.HOLD ? d.lanes.HOLD.items.filter((x) => x.state === ' ') : [];
      const dis = gh ? '' : ' disabled title="GitHub 토큰을 설정하면 쓸 수 있습니다"';
      const laneOpts = Object.keys(LANE_NAMES).map((k) => `<option value="${k}">${esc(LANE_NAMES[k])}</option>`).join('');

      box.innerHTML = `
        ${gh ? '' : `<p class="auth-msg is-info">지금은 보기만 할 수 있습니다. Cloudflare에 <code>GITHUB_TOKEN</code>을 넣으면 여기서 글감 승인·순서 변경·발행 멈춤을 바로 할 수 있습니다 (<button class="link-btn" data-go="system">설정 보기</button>). 직접 고치려면 <a href="${REPO}/blob/main/content/plan/backlog.md" target="_blank" rel="noopener">글감 목록 파일</a>을 GitHub에서 열면 됩니다.</p>`}
        <div class="adm-two">
          <article class="acc-card">
            <div class="acc-head"><h2>발행 상태</h2>${d.paused
              ? `<button type="button" class="btn btn-sm btn-primary" data-pause="0"${dis}>다시 시작</button>`
              : `<button type="button" class="btn btn-sm btn-line" data-pause="1"${dis}>잠시 멈춤</button>`}</div>
            <p>${d.paused ? '<span class="adm-tag is-ad">멈춤</span> 다시 시작하기 전까지 새 글이 올라가지 않습니다.' : '<span class="adm-tag is-ok">발행 중</span> 매일 아침 7시 전후로 한 편씩 올라갑니다.'}</p>
            <h3 class="adm-sub">앞으로 올라갈 글 (미리 써 둔 원고)</h3>
            ${drafts.length ? '<ul class="adm-sched">' + drafts.map((x) => `<li><span class="mono">${esc(fmtDay(x.date))}</span> ${esc(x.title)}</li>`).join('') + '</ul>' : '<p class="acc-empty">미리 써 둔 원고가 없습니다. 글감 목록 순서대로 그날 아침에 씁니다.</p>'}
          </article>
          <article class="acc-card">
            <div class="acc-head"><h2>최근 발행</h2><a class="btn btn-sm btn-line" href="/insights" target="_blank" rel="noopener">인사이트 열기</a></div>
            <ul class="acc-list">${(d.recent || []).slice(0, 8).map((r) => `<li class="acc-item"><div class="acc-item-head"><span class="adm-tag">${esc(r.category)}</span><span class="acc-date mono">${r.date ? KST(new Date(r.date).toISOString()).slice(0, 10) : ''}</span></div><p class="acc-item-row"><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(cleanTitle(r.title))}</a></p></li>`).join('') || '<li class="acc-empty">아직 없습니다.</li>'}</ul>
          </article>
        </div>
        <article class="acc-card">
          <h2>요일별 글감 <small class="mono">남은 수 · 다음 차례</small></h2>
          <div class="adm-lanes">${lanes.map((l) => {
            const todo = l.items.filter((x) => x.state === ' ');
            return `<details class="adm-lane"${todo.length <= 3 ? ' open' : ''}>
              <summary><strong>${esc(LANE_NAMES[l.key] || l.key)}</strong><span class="adm-tag${todo.length <= 7 ? ' is-ad' : ''}">남은 글감 ${todo.length}</span><span class="adm-lane-next">${todo[0] ? '다음: ' + esc(todo[0].title) : '글감이 없습니다 — 그날 새로 정해서 씁니다'}</span></summary>
              <ol class="adm-lane-list">${todo.map((it, i) => `<li><span>${esc(it.title)}</span><span class="adm-btns">${i ? `<button type="button" class="btn btn-sm btn-line" data-next="${esc(it.slug)}" data-lane="${l.key}"${dis}>다음 차례로</button>` : '<em class="mono">다음 차례</em>'}<button type="button" class="btn btn-sm btn-line" data-hold="${esc(it.slug)}"${dis}>보류</button></span></li>`).join('')}</ol>
            </details>`;
          }).join('')}</div>
        </article>
        <article class="acc-card">
          <h2>보류한 글감 <small class="mono">승인하면 고른 요일의 다음 차례로 들어갑니다</small></h2>
          <ul class="acc-list">${hold.length ? hold.map((it) => `<li class="acc-item"><p class="acc-item-title">${esc(it.title.split(' — ')[0])}</p><p class="acc-help">${esc(it.title.split(' — ').slice(1).join(' — ').replace(/\s*\(자료:[^)]*\)\s*/g, ' ').trim())}</p>
            <div class="adm-btns"><select data-lane-for="${esc(it.slug)}"${dis}>${laneOpts}</select><button type="button" class="btn btn-sm btn-primary" data-approve="${esc(it.slug)}"${dis}>승인</button></div></li>`).join('') : '<li class="acc-empty">보류한 글감이 없습니다.</li>'}</ul>
        </article>`;

      const act = async (body, okText) => {
        try { await api('content', { method: 'POST', body }); showMsg(okText + ' GitHub에 저장했습니다. 1~2분 뒤 반영됩니다.', 'ok'); state.content = null; setTimeout(() => loadContent(true), 800); }
        catch (err) { showMsg(err.message, 'err'); }
      };
      qa('[data-pause]', box).forEach((b) => b.addEventListener('click', () => {
        const on = b.dataset.pause === '1';
        if (on && !confirm('매일 글 발행을 멈출까요? 다시 시작을 누르기 전까지 새 글이 올라가지 않습니다.')) return;
        act({ action: 'pause', value: on }, on ? '발행을 멈췄습니다.' : '발행을 다시 시작합니다.');
      }));
      qa('[data-next]', box).forEach((b) => b.addEventListener('click', () => act({ action: 'next', slug: b.dataset.next, lane: b.dataset.lane }, '순서를 바꿨습니다.')));
      qa('[data-hold]', box).forEach((b) => b.addEventListener('click', () => {
        if (!confirm('이 글감을 보류할까요? 보류한 글감은 승인하기 전까지 쓰지 않습니다.')) return;
        act({ action: 'hold', slug: b.dataset.hold }, '보류했습니다.');
      }));
      qa('[data-approve]', box).forEach((b) => b.addEventListener('click', () => {
        const sel = box.querySelector(`[data-lane-for="${b.dataset.approve}"]`);
        act({ action: 'approve', slug: b.dataset.approve, lane: sel.value }, '승인했습니다.');
      }));
    } catch (err) {
      box.innerHTML = `<p class="acc-empty">${esc(err.message)}</p>`;
    }
  }

  /* =========================================================
     KPI · 방문 통계
     ========================================================= */
  const C1 = '#FF4712';   // 방문자 (브랜드 주황)
  const C2 = '#2a78d6';   // 페이지뷰 (파랑) — 검증: 색약 구분 ΔE 26.5
  const DEV_COLOR = { PC: '#2a78d6', '모바일': '#FF4712', '태블릿': '#1baf7a' };
  const DEV_ORDER = ['PC', '모바일', '태블릿'];
  const KIND = { cta: '버튼', nav: '메뉴', link: '본문 링크', out: '외부 링크', tel: '전화', mail: '메일', kakao: '카카오톡', file: '파일', family: '패밀리 사이트', sns: 'SNS' };
  const REGION_KO = [
    [/seoul/i, '서울'], [/gyeonggi/i, '경기'], [/incheon/i, '인천'], [/busan/i, '부산'], [/daegu/i, '대구'], [/daejeon/i, '대전'],
    [/gwangju/i, '광주'], [/ulsan/i, '울산'], [/sejong/i, '세종'], [/gangwon/i, '강원'],
    [/north chungcheong|chungcheongbuk|chungbuk/i, '충북'], [/south chungcheong|chungcheongnam|chungnam/i, '충남'],
    [/north jeolla|jeollabuk|jeonbuk/i, '전북'], [/south jeolla|jeollanam|jeonnam/i, '전남'],
    [/north gyeongsang|gyeongsangbuk|gyeongbuk/i, '경북'], [/south gyeongsang|gyeongsangnam|gyeongnam/i, '경남'], [/jeju/i, '제주']
  ];
  const regionName = (r) => {
    if (r.country === '해외') return '해외 · ' + r.k;
    for (const [re, ko] of REGION_KO) if (re.test(r.k)) return ko;
    return r.k === '알 수 없음' ? '국내 (지역 모름)' : r.k;
  };
  const RANGE_NAME = { today: '오늘', yesterday: '어제', 7: '최근 7일', 30: '최근 30일', 90: '최근 90일', month: '이번 달' };
  const dot = (iso) => iso.slice(5).replace('-', '.');

  qa('#kpiRange .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#kpiRange .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    state.kpiRange = b.dataset.range;
    loadKpi();
  }));

  async function loadKpi() {
    const body = q('#kpiBody');
    body.classList.add('is-loading');
    try {
      const d = await api('kpi?range=' + encodeURIComponent(state.kpiRange));
      state.kpi = d;
      renderKpi(d);
    } catch (err) {
      if (!state.kpi) body.innerHTML = `<p class="acc-empty">${esc(err.message)}</p>`;
      showMsg(err.message, 'err');
    } finally { body.classList.remove('is-loading'); }
  }

  /* 직전 기간과 비교: 올라가면 좋은 숫자인지(good) 따라 색을 정한다. 색만으로 뜻을 전하지 않게 화살표·글자를 함께 */
  function deltaHtml(cur, prev, { good = 'up', point = false } = {}) {
    if (!prev && !cur) return '<span class="kpi-delta is-flat">지난 기간과 같음</span>';
    if (!prev) return '<span class="kpi-delta is-flat">지난 기간 기록 없음</span>';
    const diff = point ? (cur - prev) * 100 : (cur - prev) / prev * 100;
    if (Math.abs(diff) < 0.05) return '<span class="kpi-delta is-flat">지난 기간과 같음</span>';
    const up = diff > 0;
    const better = good === 'up' ? up : !up;
    const v = Math.abs(diff) >= 100 && !point ? Math.round(Math.abs(diff)) : Math.round(Math.abs(diff) * 10) / 10;
    return `<span class="kpi-delta ${better ? 'is-good' : 'is-bad'}" title="지난 같은 기간 대비">${up ? '▲' : '▼'} ${v}${point ? '%p' : '%'}</span>`;
  }

  function renderKpi(d) {
    const c = d.cur; const p = d.prev; const R = d.range;
    const curBounce = c.sessions ? 1 - c.engaged / c.sessions : 0;
    const prevBounce = p.sessions ? 1 - p.engaged / p.sessions : 0;
    const curConv = ratio(c.inq, c.v); const prevConv = ratio(p.inq, p.v);
    q('#kpiPeriod').innerHTML = `<strong>${esc(RANGE_NAME[R.key] || '')}</strong> ${R.from === R.to ? dot(R.from) : dot(R.from) + ' ~ ' + dot(R.to)} · 비교: 직전 ${R.days}일 (${dot(R.prevFrom)}${R.prevFrom === R.prevTo ? '' : ' ~ ' + dot(R.prevTo)})`;
    const live = q('#kpiLive');
    live.hidden = false;
    live.innerHTML = `<span class="kpi-live-dot" aria-hidden="true"></span>지금 보고 있는 방문 <strong>${d.live}</strong>`;

    const tiles = [
      ['방문자', fmtN(c.v), deltaHtml(c.v, p.v), `새 방문 ${fmtN(c.nv)} · 다시 온 방문 ${fmtN(Math.max(0, c.v - c.nv))}`],
      ['페이지뷰', fmtN(c.pv), deltaHtml(c.pv, p.pv), `방문 1회에 ${(Math.round(ratio(c.pv, c.sessions) * 10) / 10) || 0}페이지`],
      ['평균 체류시간', fmtDur(ratio(c.dsum, c.sessions)), deltaHtml(ratio(c.dsum, c.sessions), ratio(p.dsum, p.sessions)), `페이지 하나에 ${fmtDur(ratio(c.dsum, c.dn))}`],
      ['이탈률', c.sessions ? fmtPct(curBounce) : '-', deltaHtml(curBounce, prevBounce, { good: 'down', point: true }), '한 페이지만 보고 10초 안에 나간 방문'],
      ['클릭', fmtN(c.clicks), deltaHtml(c.clicks, p.clicks), `방문자 1명당 ${(Math.round(ratio(c.clicks, c.v) * 10) / 10) || 0}번`],
      ['문의', fmtN(c.inq), deltaHtml(c.inq, p.inq), `지금 답을 기다리는 문의 ${d.inquiries.waiting}건`],
      ['문의 전환율', c.v ? fmtPct(curConv, 2) : '-', deltaHtml(curConv, prevConv, { point: true }), '방문자 중 문의를 남긴 비율'],
      ['신규 회원', fmtN(c.signups), deltaHtml(c.signups, p.signups), `전체 회원 ${fmtN(d.members.total)}명`]
    ];
    const empty = !d.firstDay;
    const body = q('#kpiBody');
    body.innerHTML = `
      ${empty ? `<p class="auth-msg is-info">방문 통계는 이 기능을 올린 뒤부터 쌓입니다. 홈페이지에 방문이 생기면 몇 초 안에 여기에 보입니다. 문의·회원 숫자는 지금도 정확합니다.</p>` : ''}
      <ul class="kpi-tiles">${tiles.map(([label, val, delta, foot], i) => `
        <li class="kpi-tile${i === 0 ? ' is-lead' : ''}"><p class="kpi-tile-label">${esc(label)}</p><p class="kpi-tile-val">${esc(val)}</p>${delta}<p class="kpi-tile-foot">${esc(foot)}</p></li>`).join('')}</ul>

      <article class="acc-card kpi-card">
        <div class="acc-head"><h2>${d.trendUnit === 'hour' ? '시간대별 방문 추이' : '날짜별 방문 추이'}</h2>
          <ul class="kpi-legend" aria-label="범례"><li><span class="kpi-key" style="background:${C1}"></span>방문자</li><li><span class="kpi-key" style="background:${C2}"></span>페이지뷰</li></ul></div>
        <div class="kpi-chart" id="kpiTrend" role="img" aria-label="방문자와 페이지뷰 추이"></div>
        <p class="kpi-chart-note">선 위에 마우스를 올리면 그날 숫자가 보입니다.${R.to === todayKST() ? ' 오늘 숫자는 지금까지 집계된 값입니다.' : ''}</p>
        <details class="kpi-table"><summary>표로 보기</summary><div class="adm-table-wrap"><table class="adm-table kpi-num-table">
          <thead><tr><th>${d.trendUnit === 'hour' ? '시간' : '날짜'}</th><th>방문자</th><th>페이지뷰</th>${d.trendUnit === 'day' ? '<th>방문 수</th><th>문의</th><th>신규 회원</th>' : ''}</tr></thead>
          <tbody>${d.trend.slice().reverse().map((r) => `<tr><td>${d.trendUnit === 'hour' ? r.k + '시' : esc(dot(r.k))}</td><td>${fmtN(r.v)}</td><td>${fmtN(r.pv)}</td>${d.trendUnit === 'day' ? `<td>${fmtN(r.s)}</td><td>${fmtN(r.inq)}</td><td>${fmtN(r.sg)}</td>` : ''}</tr>`).join('')}</tbody></table></div></details>
      </article>

      <div class="adm-two">
        <article class="acc-card kpi-card">
          <h2>가장 많이 본 페이지 <small>페이지뷰 순</small></h2>
          ${barList(d.pages.slice(0, 10), (r) => ({
            name: pageName(r), href: r.path, value: fmtN(r.pv), n: r.pv,
            sub: `방문자 ${fmtN(r.v)} · 평균 ${fmtDur(r.ad)} · 첫 페이지로 ${fmtN(r.en)}번`
          }), '아직 기록이 없습니다.')}
        </article>
        <article class="acc-card kpi-card">
          <h2>인기 인사이트 글 <small>끝까지 읽은 비율 함께</small></h2>
          ${barList(d.insights, (r) => ({
            name: pageName(r), href: r.path, value: fmtN(r.pv), n: r.pv,
            sub: `평균 ${fmtDur(r.ad)} · 끝까지 읽음 ${fmtPct(ratio(r.done, r.pv), 0)} · 스크롤 ${r.sc || 0}%`
          }), '이 기간에 읽힌 인사이트 글이 없습니다.')}
        </article>
      </div>

      <div class="adm-two">
        <article class="acc-card kpi-card">
          <h2>어디서 들어왔나 <small>방문 시작 기준</small></h2>
          ${barList(d.sources, (r) => ({ name: r.k, value: fmtN(r.n), n: r.n, sub: shareOf(r.n, d.sources) }), '아직 기록이 없습니다.')}
          ${d.sourceDetail.length ? `<h3 class="adm-sub">자세히</h3><ul class="kpi-mini">${d.sourceDetail.map((r) => `<li><span class="adm-tag is-off">${esc(r.src)}</span><span>${esc(r.k)}</span><strong>${fmtN(r.n)}</strong></li>`).join('')}</ul>` : ''}
          ${d.utm.length ? `<h3 class="adm-sub">캠페인 링크 (utm)</h3><ul class="kpi-mini">${d.utm.map((r) => `<li><span>${esc(r.k.split('|').filter(Boolean).join(' · '))}</span><strong>${fmtN(r.n)}</strong></li>`).join('')}</ul>` : ''}
        </article>
        <article class="acc-card kpi-card">
          <h2>어떤 기기로 <small>방문 수 기준</small></h2>
          ${segBar(d.devices)}
          <div class="kpi-split2">
            <div><h3 class="adm-sub">브라우저·앱</h3>${barList(d.browsers.slice(0, 6), (r) => ({ name: r.k, value: fmtN(r.n), n: r.n }), '-')}</div>
            <div><h3 class="adm-sub">지역</h3>${barList(d.regions.slice(0, 6), (r) => ({ name: regionName(r), value: fmtN(r.n), n: r.n }), '-')}</div>
          </div>
        </article>
      </div>

      <div class="adm-two">
        <article class="acc-card kpi-card">
          <h2>언제 많이 오나 <small>시간대별 페이지뷰</small></h2>
          ${columns(d.hours.map((n, h) => ({ n, label: h + '시', tick: h % 6 === 0 ? h + '시' : '' })))}
        </article>
        <article class="acc-card kpi-card">
          <h2>요일별 <small>페이지뷰</small></h2>
          ${columns([1, 2, 3, 4, 5, 6, 0].map((w) => ({ n: d.weekdays[w], label: DAYS[w] + '요일', tick: DAYS[w] })))}
        </article>
      </div>

      <div class="adm-two">
        <article class="acc-card kpi-card">
          <h2>많이 누른 링크·버튼 <small>클릭 순</small></h2>
          ${d.clickTop.length ? `<ol class="kpi-clicks">${d.clickTop.map((r) => `
            <li><span class="adm-tag">${esc(KIND[r.kind] || r.kind)}</span><span class="kpi-click-name">${esc(r.label || '(이름 없음)')}<small>${esc(r.target || '')}</small></span><strong>${fmtN(r.n)}</strong></li>`).join('')}</ol>` : '<p class="acc-empty">아직 기록이 없습니다.</p>'}
        </article>
        <article class="acc-card kpi-card">
          <h2>클릭 종류</h2>
          ${barList(d.clickKinds, (r) => ({ name: KIND[r.k] || r.k, value: fmtN(r.n), n: r.n, sub: shareOf(r.n, d.clickKinds) }), '아직 기록이 없습니다.')}
          <h3 class="adm-sub">목표 달성 (전환)</h3>
          ${d.conversions.length ? `<ul class="kpi-mini">${d.conversions.map((r) => `<li><span>${esc(r.k)}</span><strong>${fmtN(r.n)}</strong></li>`).join('')}</ul>` : '<p class="acc-empty">이 기간에는 아직 없습니다. (문의 접수 · 회원가입 · 커뮤니티 글 등록)</p>'}
        </article>
      </div>

      <div class="adm-two">
        <article class="acc-card kpi-card">
          <div class="acc-head"><h2>문의 <small>이 기간 ${fmtN(c.inq)}건</small></h2><button type="button" class="btn btn-sm btn-line" data-go="inquiries">문의 관리</button></div>
          <h3 class="adm-sub">문의까지 오는 흐름</h3>
          ${barList([
            { k: '홈페이지 방문자', n: c.v },
            { k: '문의하기 페이지를 본 방문자', n: d.contactVisitors },
            { k: '문의를 남김', n: c.inq }
          ], (r, i) => ({ name: r.k, value: fmtN(r.n), n: r.n, sub: c.v && i ? '방문자의 ' + fmtPct(ratio(r.n, c.v), 2) : '' }), '-', c.v || 1)}
          <div class="kpi-split2">
            <div><h3 class="adm-sub">유형별</h3>${barList(d.inquiries.byType, (r) => ({ name: r.k, value: fmtN(r.n), n: r.n }), '이 기간 문의가 없습니다.')}</div>
            <div><h3 class="adm-sub">처리 상태</h3>${barList(d.inquiries.byStatus, (r) => ({ name: r.k, value: fmtN(r.n), n: r.n }), '-')}
              <p class="acc-help">회원이 남긴 문의 ${fmtN(d.inquiries.member)}건 · 비회원 ${fmtN(Math.max(0, c.inq - d.inquiries.member))}건</p></div>
          </div>
        </article>
        <article class="acc-card kpi-card">
          <div class="acc-head"><h2>회원 <small>전체 ${fmtN(d.members.total)}명</small></h2><button type="button" class="btn btn-sm btn-line" data-go="members">회원 목록</button></div>
          <ul class="kpi-facts">
            <li><span>이 기간 가입</span><strong>${fmtN(c.signups)}명</strong></li>
            <li><span>이 기간 로그인한 회원</span><strong>${fmtN(d.members.active)}명</strong></li>
            <li><span>소식 수신 동의</span><strong>${fmtN(d.members.marketing)}명 <small>(${d.members.total ? fmtPct(ratio(d.members.marketing, d.members.total), 0) : '-'})</small></strong></li>
            <li><span>회원으로 둘러본 방문자</span><strong>${fmtN(c.mv)}명</strong></li>
          </ul>
          <h3 class="adm-sub">회원 유형</h3>
          ${barList(d.members.byType, (r) => ({ name: r.k, value: fmtN(r.n) + '명', n: r.n }), '아직 회원이 없습니다.')}
          ${d.members.recent.length ? `<h3 class="adm-sub">최근 가입</h3><ul class="kpi-mini">${d.members.recent.map((m) => `<li><span class="mono">${esc(KST(m.created_at).slice(0, 10))}</span><span>${esc(m.name)} <small>${esc(m.type || '')}</small></span>${m.marketing ? '<span class="adm-tag is-ok">소식 동의</span>' : ''}</li>`).join('')}</ul>` : ''}
          <p class="acc-help">커뮤니티: 이 기간 방문자 글 ${fmtN(d.community.posts)}건 · 답글 ${fmtN(d.community.comments)}건</p>
        </article>
      </div>

      <article class="acc-card kpi-note">
        <h2>숫자 읽는 법</h2>
        <ul class="acc-help kpi-howto">
          <li><strong>방문자</strong>는 브라우저 기준입니다. 같은 분이 휴대폰과 PC로 들어오면 2명으로 셉니다. <strong>방문</strong>은 30분 넘게 쉬면 새로 셉니다.</li>
          <li><strong>체류시간</strong>은 화면을 실제로 보고 있던 시간만 셉니다 (다른 탭에 있거나 2분 넘게 움직임이 없으면 멈춤).</li>
          <li>검색 로봇과 관리자 브라우저는 세지 않습니다. 이름·연락처·IP 주소는 저장하지 않습니다.</li>
          <li>통계 수집 시작: ${d.firstDay ? esc(d.firstDay.replace(/-/g, '.')) : '방문이 생기면 바로 시작'} · 기록은 약 13개월 보관합니다.</li>
        </ul>
        <label class="acc-check kpi-optout"><input type="checkbox" id="kpiOptOut" ${noStats() ? 'checked' : ''} /> <span>이 브라우저의 방문은 통계에서 빼기 <small>(관리자가 쓰는 PC·휴대폰에서 켜 두세요)</small></span></label>
      </article>`;

    lineChart(q('#kpiTrend'), d);
    const opt = q('#kpiOptOut');
    if (opt) opt.addEventListener('change', () => {
      try { localStorage.setItem('csj_no_stats', opt.checked ? 'true' : 'false'); } catch (_) { /* ignore */ }
      showMsg(opt.checked ? '이 브라우저의 방문은 이제 통계에 들어가지 않습니다.' : '이 브라우저의 방문도 통계에 들어갑니다.', 'ok');
    });
  }

  const noStats = () => { try { return localStorage.getItem('csj_no_stats') === 'true'; } catch (_) { return false; } };
  const pageName = (r) => {
    if (r.path === '/') return '홈';
    const t = String(r.title || '').replace(/\s*[|·—-]\s*최시준.*$/, '').trim();
    return t || r.path;
  };
  const shareOf = (n, list) => {
    const total = list.reduce((a, b) => a + b.n, 0);
    return total ? fmtPct(n / total, 0) : '';
  };

  /* 가로 막대 목록 — 값은 막대 끝 글자로 직접 보여 준다 (막대 색은 한 가지) */
  function barList(rows, map, emptyText, maxOverride) {
    if (!rows || !rows.length) return `<p class="acc-empty">${esc(emptyText || '-')}</p>`;
    const items = rows.map((r, i) => map(r, i));
    const max = maxOverride || Math.max(1, ...items.map((x) => x.n));
    return `<ol class="kpi-bars">${items.map((x) => `
      <li title="${esc(x.name)} — ${esc(x.value)}">
        <div class="kpi-bar-head">${x.href ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : `<span>${esc(x.name)}</span>`}<strong>${esc(x.value)}</strong></div>
        <div class="kpi-bar"><span style="width:${Math.max(x.n ? 1.5 : 0, Math.round(x.n / max * 1000) / 10)}%"></span></div>
        ${x.sub ? `<p class="kpi-bar-sub">${esc(x.sub)}</p>` : ''}
      </li>`).join('')}</ol>`;
  }

  /* 기기 비율 — 한 줄 막대(전체=100%) + 범례 */
  function segBar(rows) {
    const total = rows.reduce((a, b) => a + b.n, 0);
    if (!total) return '<p class="acc-empty">아직 기록이 없습니다.</p>';
    const ordered = DEV_ORDER.map((k) => rows.find((r) => r.k === k)).filter(Boolean).concat(rows.filter((r) => !DEV_ORDER.includes(r.k)));
    const parts = ordered.filter((r) => r.n > 0);
    return `<div class="kpi-seg" role="img" aria-label="${esc(parts.map((r) => `${r.k} ${fmtPct(r.n / total, 0)}`).join(', '))}">${parts.map((r) => {
      const share = r.n / total;
      return `<span style="flex:${r.n} 1 0;background:${DEV_COLOR[r.k] || '#898781'}" title="${esc(r.k)} ${fmtN(r.n)} (${fmtPct(share, 0)})" tabindex="0">${share >= 0.12 ? fmtPct(share, 0) : ''}</span>`;
    }).join('')}</div>
      <ul class="kpi-legend kpi-legend-seg">${parts.map((r) => `<li><span class="kpi-key is-box" style="background:${DEV_COLOR[r.k] || '#898781'}"></span>${esc(r.k)} <strong>${fmtN(r.n)}</strong></li>`).join('')}</ul>`;
  }

  /* 세로 막대 (시간대·요일) — 가장 높은 막대에만 숫자 */
  function columns(items) {
    const max = Math.max(...items.map((x) => x.n));
    if (!max) return '<p class="acc-empty">아직 기록이 없습니다.</p>';
    const peak = items.findIndex((x) => x.n === max);
    return `<div class="kpi-cols" style="--n:${items.length}">${items.map((x, i) => `
      <div class="kpi-col" tabindex="0" aria-label="${esc(x.label)} ${fmtN(x.n)}">
        <span class="kpi-col-bar" style="height:${x.n ? Math.max(2, Math.round(x.n / max * 100)) : 0}%">${i === peak ? `<em>${fmtN(x.n)}</em>` : ''}</span>
        <span class="kpi-col-tip">${esc(x.label)} · ${fmtN(x.n)}</span>
      </div>`).join('')}</div>
      <div class="kpi-col-ticks" style="--n:${items.length}">${items.map((x) => `<span>${esc(x.tick)}</span>`).join('')}</div>`;
  }

  /* 추이 선 그래프 (SVG) — 한 개의 축, 선 2px, 끝점 표시, 마우스·키보드로 날짜별 값 보기 */
  function niceStep(max, count) {
    const raw = Math.max(1, max) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }
  function lineChart(box, d) {
    if (!box) return;
    const data = d.trend;
    const W = Math.max(280, box.clientWidth || 600);
    const H = W < 520 ? 210 : 250;
    const pad = { l: 40, r: 64, t: 14, b: 28 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const maxV = Math.max(1, ...data.map((r) => Math.max(r.v, r.pv)));
    const step = niceStep(maxV, 4);
    const top = Math.ceil(maxV / step) * step;
    const n = data.length;
    const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => pad.t + ih - (v / top) * ih;
    const fmtTick = (v) => (v >= 10000 ? Math.round(v / 1000) + 'K' : fmtN(v));
    const xLabel = (r) => {
      if (d.trendUnit === 'hour') return r.k + '시';
      const [mm, dd] = r.k.slice(5).split('-');
      return Number(mm) + '/' + Number(dd);
    };
    const tickEvery = Math.max(1, Math.ceil(n / (W < 520 ? 4 : 7)));
    let grid = '';
    for (let v = 0; v <= top + 0.001; v += step) {
      grid += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'kpi-axis' : 'kpi-grid'}"/>`;
      grid += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="kpi-tick">${fmtTick(v)}</text>`;
    }
    let xt = '';
    data.forEach((r, i) => {
      if (i % tickEvery === 0 || i === n - 1) {
        if (i !== n - 1 && n - 1 - i < tickEvery / 2) return;
        xt += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="kpi-tick">${esc(xLabel(r))}</text>`;
      }
    });
    const path = (key) => data.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
    const area = `${path('v')} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
    const last = data[n - 1] || { v: 0, pv: 0 };
    const ly1 = y(last.v); const ly2 = y(last.pv);
    /* 끝 값 표시는 두 선이 떨어져 있을 때만 (겹치면 범례와 마우스 안내로 충분) */
    const endLabels = Math.abs(ly1 - ly2) >= 16
      ? `<text x="${x(n - 1) + 9}" y="${ly2 + 4}" class="kpi-endlabel">${fmtN(last.pv)}</text><text x="${x(n - 1) + 9}" y="${ly1 + 4}" class="kpi-endlabel">${fmtN(last.v)}</text>`
      : '';
    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
        ${grid}${xt}
        <path d="${area}" fill="${C1}" opacity="0.08"/>
        <path d="${path('pv')}" fill="none" stroke="${C2}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${path('v')}" fill="none" stroke="${C1}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(n - 1)}" cy="${ly2}" r="4" fill="${C2}" stroke="#fff" stroke-width="2"/>
        <circle cx="${x(n - 1)}" cy="${ly1}" r="4" fill="${C1}" stroke="#fff" stroke-width="2"/>
        ${endLabels}
        <g class="kpi-hover" style="display:none">
          <line class="kpi-cross" y1="${pad.t}" y2="${pad.t + ih}"/>
          <circle class="kpi-hdot2" r="4.5" fill="${C2}" stroke="#fff" stroke-width="2"/>
          <circle class="kpi-hdot1" r="4.5" fill="${C1}" stroke="#fff" stroke-width="2"/>
        </g>
        <rect class="kpi-hit" x="${pad.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>
      </svg>
      <div class="kpi-tip" hidden></div>`;
    const svg = q('svg', box);
    const hover = q('.kpi-hover', box);
    const tip = q('.kpi-tip', box);
    const hit = q('.kpi-hit', box);
    box.tabIndex = 0;
    let cur = -1;
    function show(i) {
      if (i < 0 || i >= n) return;
      cur = i;
      const r = data[i];
      hover.style.display = '';
      q('.kpi-cross', box).setAttribute('x1', x(i)); q('.kpi-cross', box).setAttribute('x2', x(i));
      q('.kpi-hdot1', box).setAttribute('cx', x(i)); q('.kpi-hdot1', box).setAttribute('cy', y(r.v));
      q('.kpi-hdot2', box).setAttribute('cx', x(i)); q('.kpi-hdot2', box).setAttribute('cy', y(r.pv));
      tip.textContent = '';
      const head = document.createElement('p'); head.className = 'kpi-tip-head';
      head.textContent = d.trendUnit === 'hour' ? `${r.k}시` : `${dot(r.k)} (${DAYS[new Date(r.k + 'T12:00:00+09:00').getUTCDay()]})`;
      tip.appendChild(head);
      const rows = [[fmtN(r.v), '방문자', C1], [fmtN(r.pv), '페이지뷰', C2]];
      if (d.trendUnit === 'day') rows.push([fmtN(r.inq), '문의', ''], [fmtN(r.sg), '신규 회원', '']);
      rows.forEach(([val, name, color]) => {
        const p = document.createElement('p');
        const key = document.createElement('span'); key.className = 'kpi-tip-key'; if (color) key.style.background = color; else key.classList.add('is-none');
        const b = document.createElement('strong'); b.textContent = val;
        const t = document.createElement('span'); t.textContent = name;
        p.append(key, b, t); tip.appendChild(p);
      });
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const left = x(i) * scale;
      /* 십자선 옆에 띄워 선과 점을 가리지 않게 (오른쪽이 모자라면 왼쪽) */
      const right = left + 14;
      tip.style.left = (right + tip.offsetWidth <= rect.width ? right : Math.max(0, left - 14 - tip.offsetWidth)) + 'px';
      tip.style.top = '4px';
    }
    function hide() { hover.style.display = 'none'; tip.hidden = true; cur = -1; }
    hit.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      const i = n === 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
      show(Math.max(0, Math.min(n - 1, i)));
    });
    hit.addEventListener('pointerleave', hide);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(n - 1, cur < 0 ? n - 1 : cur + 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, cur < 0 ? n - 1 : cur - 1)); }
      if (e.key === 'Escape') hide();
    });
    box.addEventListener('blur', hide);
  }
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (state.kpi && !q('[data-panel="kpi"]').hidden) lineChart(q('#kpiTrend'), state.kpi); }, 200);
  });

  q('#kpiCsv').addEventListener('click', () => {
    const d = state.kpi;
    if (!d) { showMsg('먼저 통계를 불러와 주세요.', 'info'); return; }
    const c = d.cur;
    const rows = [
      ['기간', `${d.range.from} ~ ${d.range.to}`],
      ['방문자', c.v], ['페이지뷰', c.pv], ['방문 수', c.sessions], ['평균 체류시간(초)', Math.round(ratio(c.dsum, c.sessions) / 1000)],
      ['이탈률(%)', c.sessions ? Math.round((1 - c.engaged / c.sessions) * 1000) / 10 : ''], ['클릭', c.clicks], ['문의', c.inq], ['신규 회원', c.signups],
      [],
      [d.trendUnit === 'hour' ? '시간' : '날짜', '방문자', '페이지뷰', '방문 수', '문의', '신규 회원'],
      ...d.trend.map((r) => [d.trendUnit === 'hour' ? r.k + '시' : r.k, r.v, r.pv, r.s == null ? '' : r.s, r.inq == null ? '' : r.inq, r.sg == null ? '' : r.sg]),
      [],
      ['페이지', '주소', '페이지뷰', '방문자', '평균 머문 시간(초)', '첫 페이지로 들어온 수'],
      ...d.pages.map((r) => [pageName(r), r.path, r.pv, r.v, Math.round((r.ad || 0) / 1000), r.en]),
      [],
      ['유입 경로', '방문 수'], ...d.sources.map((r) => [r.k, r.n]),
      [],
      ['클릭한 링크·버튼', '종류', '이동한 곳', '클릭 수'], ...d.clickTop.map((r) => [r.label, KIND[r.kind] || r.kind, r.target, r.n])
    ];
    downloadCsv(`방문통계_${d.range.from}_${d.range.to}.csv`, rows);
  });

  /* =========================================================
     회원
     ========================================================= */
  const memType = q('#memType');
  memType.addEventListener('change', () => { state.memFilter.type = memType.value; loadMembers(); });
  q('#memMk').addEventListener('change', (e) => { state.memFilter.mk = e.target.checked; loadMembers(); });
  let memTimer;
  q('#memSearch').addEventListener('input', (e) => {
    clearTimeout(memTimer);
    memTimer = setTimeout(() => { state.memFilter.q = e.target.value.trim(); loadMembers(); }, 300);
  });

  async function loadMembers() {
    const f = state.memFilter;
    const qs = new URLSearchParams();
    if (f.type) qs.set('type', f.type);
    if (f.q) qs.set('q', f.q);
    if (f.mk) qs.set('mk', '1');
    try {
      const d = await api('members' + (qs.toString() ? '?' + qs : ''));
      state.members = d.members; state.memTotal = d.total; state.memMk = d.marketing;
      q('#cntMem').textContent = d.total ? String(d.total) : '';
      renderMembers();
    } catch (err) { showMsg(err.message, 'err'); }
  }

  function renderMembers() {
    const rows = state.members;
    const monthStart = todayKST().slice(0, 8) + '01';
    const month = rows.filter((m) => kstDate(new Date(m.created_at)) >= monthStart).length;
    const recent = rows.filter((m) => m.last_login && Date.now() - new Date(m.last_login).getTime() < 30 * 86400 * 1000).length;
    const filtered = Boolean(state.memFilter.type || state.memFilter.q || state.memFilter.mk);
    q('#memStats').innerHTML = [
      ['전체 회원', fmtN(state.memTotal), filtered ? `지금 목록 ${fmtN(rows.length)}명` : '가입한 모든 회원'],
      ['이번 달 가입', fmtN(month), filtered ? '지금 목록 기준' : todayKST().slice(5, 7).replace(/^0/, '') + '월 1일부터'],
      ['소식 수신 동의', fmtN(state.memMk), state.memTotal ? '전체의 ' + fmtPct(state.memMk / state.memTotal, 0) : '-'],
      ['최근 30일 로그인', fmtN(recent), filtered ? '지금 목록 기준' : '다시 찾아온 회원']
    ].map(([label, n, foot]) => `<li><button type="button" tabindex="-1"><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${esc(label)}</span><span class="adm-kpi-foot">${esc(foot)}</span></button></li>`).join('');
    const list = q('#memList');
    list.innerHTML = rows.length ? rows.map((m) => `
      <li class="adm-row${m.id === state.openMem ? ' is-open' : ''}" tabindex="0" data-id="${m.id}">
        <div class="acc-item-head">${m.type ? `<span class="adm-tag">${esc(m.type)}</span>` : ''}${m.marketing ? '<span class="adm-tag is-ok">소식 동의</span>' : ''}${m.inquiries ? `<span class="adm-tag is-ad">문의 ${m.inquiries}</span>` : ''}<span class="acc-date mono">${KST(m.created_at).slice(0, 10)} 가입</span></div>
        <p class="adm-row-title"><strong>${esc(m.name)}</strong><span>${esc(m.email)}</span></p>
      </li>`).join('') : `<li class="acc-empty">${filtered ? '조건에 맞는 회원이 없습니다.' : state.setup.members === false ? '회원 기능이 아직 켜지지 않았습니다.' : '아직 가입한 회원이 없습니다. 회원가입은 홈페이지의 로그인 · 회원가입 화면에서 받습니다.'}</li>`;
    qa('.adm-row', list).forEach((li) => {
      const open = () => { state.openMem = Number(li.dataset.id); state.tempPw = null; renderMembers(); };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
    renderMemberDetail();
  }

  function renderMemberDetail() {
    const box = q('#memDetail');
    const m = state.members.find((x) => x.id === state.openMem);
    if (!m) { box.innerHTML = '<p class="acc-empty">왼쪽에서 회원을 고르면 정보와 관리 도구가 여기에 열립니다.</p>'; return; }
    const phone = (m.phone || '').replace(/[^\d+]/g, '');
    const temp = state.tempPw && state.tempPw.id === m.id ? state.tempPw.temp : '';
    const mailBody = `${m.name}님, 안녕하세요. 최시준입니다.\n\n요청하신 임시 비밀번호를 보내드립니다.\n\n임시 비밀번호: ${temp}\n\nchoisijun.com/login 에서 이 비밀번호로 로그인하신 뒤, 마이페이지 → 비밀번호 변경에서 새 비밀번호로 바꿔 주세요.\n\n— 최시준 드림\nchoisijun.com`;
    box.innerHTML = `
      <div class="acc-item-head">${m.type ? `<span class="adm-tag">${esc(m.type)}</span>` : ''}${m.marketing ? '<span class="adm-tag is-ok">소식 수신 동의</span>' : '<span class="adm-tag is-off">소식 수신 안 함</span>'}<span class="acc-date mono">회원 #${m.id}</span></div>
      <h2 class="adm-detail-name">${esc(m.name)}</h2>
      <p class="adm-contact"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${phone ? `<a href="tel:${esc(phone)}">${esc(m.phone)}</a>` : ''}</p>
      <ul class="kpi-facts">
        <li><span>가입</span><strong>${KST(m.created_at)}</strong></li>
        <li><span>마지막 로그인</span><strong>${m.last_login ? KST(m.last_login) + ' (' + ago(m.last_login) + ')' : '-'}</strong></li>
        <li><span>로그인 횟수</span><strong>${fmtN(m.login_count)}번</strong></li>
        <li><span>보낸 문의</span><strong>${m.inquiries ? `<button type="button" class="link-btn" id="memInq">${m.inquiries}건 보기</button>` : '없음'}</strong></li>
      </ul>
      <div class="adm-reply">
        <label class="adm-memo"><span class="mono adm-label">내부 메모 <small>(회원에게 보이지 않습니다)</small></span><textarea rows="3" maxlength="2000" id="memMemo" placeholder="예: 11/20 강의 문의 후 가입, 성수 건물주">${esc(m.memo || '')}</textarea></label>
        <div class="adm-btns"><button type="button" class="btn btn-sm btn-primary" id="memMemoSave">메모 저장</button></div>
      </div>
      <div class="adm-reply">
        <p class="mono adm-label">비밀번호 찾기 요청을 받았을 때</p>
        ${temp ? `<div class="adm-temp"><p>임시 비밀번호 <code>${esc(temp)}</code> — 이 화면을 벗어나면 다시 볼 수 없습니다.</p>
          <div class="adm-btns"><a class="btn btn-sm btn-primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('[최시준] 임시 비밀번호 안내')}&body=${encodeURIComponent(mailBody)}">메일로 보내기</a><button type="button" class="btn btn-sm btn-line" id="memTempCopy">복사</button></div></div>`
        : '<p class="acc-help">임시 비밀번호를 만들면 기존 비밀번호는 바로 쓸 수 없게 됩니다. 만든 비밀번호를 회원 이메일로 보내 주세요.</p><div class="adm-btns"><button type="button" class="btn btn-sm btn-line" id="memTemp">임시 비밀번호 만들기</button></div>'}
      </div>
      <div class="adm-reply"><div class="adm-btns"><button type="button" class="btn btn-sm btn-line" id="memDelete">탈퇴 처리 (회원 정보 삭제)</button></div></div>`;
    const inqBtn = q('#memInq', box);
    if (inqBtn) inqBtn.addEventListener('click', () => {
      state.inqFilter = { status: '', type: '', q: m.email };
      q('#inqSearch').value = m.email;
      qa('#inqStatus .f-chip').forEach((x) => x.classList.toggle('is-active', x.dataset.status === ''));
      typeSel.value = '';
      go('inquiries');
    });
    q('#memMemoSave', box).addEventListener('click', async () => {
      const memo = q('#memMemo', box).value;
      try { await api('members/' + m.id, { method: 'PATCH', body: { memo } }); m.memo = memo; showMsg('메모를 저장했습니다.', 'ok'); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    const tempBtn = q('#memTemp', box);
    if (tempBtn) tempBtn.addEventListener('click', async () => {
      if (!confirm(`${m.name}님의 임시 비밀번호를 만들까요? 지금 쓰던 비밀번호는 더 이상 쓸 수 없게 됩니다.`)) return;
      try { const d = await api('members/' + m.id + '/reset', { method: 'POST' }); state.tempPw = { id: m.id, temp: d.temp }; renderMemberDetail(); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    const copyBtn = q('#memTempCopy', box);
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(temp); showMsg('임시 비밀번호를 복사했습니다.', 'ok'); } catch (_) { showMsg(temp, 'info'); }
    });
    q('#memDelete', box).addEventListener('click', async () => {
      if (!confirm(`${m.name}(${m.email}) 회원을 탈퇴 처리할까요? 회원 정보가 바로 지워지고 되돌릴 수 없습니다. 보낸 문의는 남습니다.`)) return;
      try { await api('members/' + m.id, { method: 'DELETE' }); state.openMem = null; showMsg('탈퇴 처리했습니다.', 'ok'); loadMembers(); }
      catch (err) { showMsg(err.message, 'err'); }
    });
  }

  q('#memCsv').addEventListener('click', () => {
    const rows = state.members;
    if (!rows.length) { showMsg('내려받을 회원이 없습니다.', 'info'); return; }
    downloadCsv(`회원목록_${todayKST()}.csv`, [
      ['번호', '가입일시', '이름', '이메일', '휴대폰', '회원 유형', '소식 수신', '마지막 로그인', '로그인 횟수', '문의 수', '메모'],
      ...rows.map((m) => [m.id, KST(m.created_at), m.name, m.email, m.phone, m.type, m.marketing ? '동의' : '-', m.last_login ? KST(m.last_login) : '', m.login_count, m.inquiries, m.memo])
    ]);
  });
  q('#memCopy').addEventListener('click', async () => {
    const emails = state.members.filter((m) => m.marketing).map((m) => m.email);
    if (!emails.length) { showMsg('지금 목록에 소식 수신에 동의한 회원이 없습니다.', 'info'); return; }
    const text = emails.join(', ');
    try { await navigator.clipboard.writeText(text); showMsg(`소식 수신 동의자 ${emails.length}명의 이메일을 복사했습니다. 메일의 숨은 참조(BCC)에 붙여 넣어 보내세요.`, 'ok'); }
    catch (_) { showMsg(text, 'info'); }
  });

  /* ---------------- 설정 · 바로가기 ---------------- */
  function renderSystem() {
    const s = state.setup || {};
    const cfg = window.SITE_CONFIG || {};
    const checks = [
      [s.db, '데이터 저장소 (Cloudflare D1)', s.db ? '문의·커뮤니티·레퍼런스가 저장됩니다.' : 'Pages 설정 → 바인딩에 D1 데이터베이스를 변수 이름 DB로 연결해 주세요.'],
      [s.password, '관리자 비밀번호', '비밀번호를 바꾸려면 Cloudflare → choisijun → 설정 → 변수 및 비밀에서 ADMIN_PASSWORD 값을 바꾸고 다시 배포합니다.'],
      [s.mail || Boolean(cfg.formAccessKey), '새 문의 메일 알림', s.mail ? 'Resend로 알림 메일을 보냅니다.' : cfg.formAccessKey ? 'Web3Forms로 알림 메일을 받습니다.' : '가장 쉬운 방법: web3forms.com에서 받는 메일 주소를 넣고 받은 키를 site-config.js의 formAccessKey에 붙여넣기.'],
      [s.turnstile && Boolean(cfg.turnstileSiteKey), '스팸 방지 (Cloudflare Turnstile, 선택)', s.turnstile ? '자동 등록을 막고 있습니다.' : 'Cloudflare → Turnstile에서 사이트를 추가하고, 사이트 키는 site-config.js의 turnstileSiteKey에, 비밀 키는 TURNSTILE_SECRET에 넣습니다.'],
      [s.db && s.members !== false, '방문 통계 · 회원 기능', s.db ? '방문 통계(KPI)와 회원가입·로그인이 Cloudflare D1에 저장됩니다. 따로 설정할 것은 없습니다.' : 'D1 데이터베이스를 연결하면 바로 켜집니다.'],
      [s.github, '매일 글 관리 (GitHub 토큰, 선택)', s.github ? '이 페이지에서 글감 승인·순서 변경·발행 멈춤을 할 수 있습니다.' : 'GitHub → Settings → Developer settings → Fine-grained token (저장소 choisijun, Contents 읽기·쓰기)을 만들어 GITHUB_TOKEN에 넣습니다.']
    ];
    q('#sysChecks').innerHTML = checks.map(([ok, title, text]) => `<li class="${ok ? 'is-ok' : 'is-no'}"><span class="adm-dot"></span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div></li>`).join('');
    const links = [
      ['https://dash.cloudflare.com', 'Cloudflare 대시보드', '배포, 비밀번호·키 설정, D1 데이터'],
      [REPO, 'GitHub 저장소', '홈페이지 원본과 변경 기록'],
      [`${REPO}/blob/main/content/plan/backlog.md`, '매일 글 — 글감 목록', '요일별 글감과 보류 목록'],
      [`${REPO}/tree/main/content/drafts`, '매일 글 — 미리 써 둔 원고', '날짜가 되면 자동으로 발행'],
      ['https://searchadvisor.naver.com', '네이버 서치어드바이저', '수집 요청, 사이트맵·RSS 제출'],
      ['https://search.google.com/search-console', '구글 서치 콘솔', '검색 노출과 색인 상태'],
      ['https://web3forms.com', 'Web3Forms', '문의 메일 알림 키 발급']
    ];
    q('#sysLinks').innerHTML = links.map(([href, t, d]) => `<li><a href="${href}" target="_blank" rel="noopener">${esc(t)} ↗</a><span>${esc(d)}</span></li>`).join('');
  }

  /* ---------------- 시작 ---------------- */
  async function boot() {
    let s;
    try {
      const res = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('no_api');
      s = await res.json();
    } catch (_) {
      gate.hidden = false;
      loginForm.hidden = true;
      setupBox.hidden = false;
      showMsg('관리자 서버 기능이 아직 켜지지 않았습니다. 아래 순서로 Cloudflare 설정을 마치면 이 페이지에서 로그인할 수 있습니다.', 'info');
      return;
    }
    state.setup = s.setup || {};
    if (!s.setup.password || !s.setup.db) {
      gate.hidden = false;
      setupBox.hidden = false;
      loginForm.hidden = !s.setup.password;
      if (!s.setup.password) showMsg('관리자 비밀번호(ADMIN_PASSWORD)가 아직 없습니다. 아래 순서로 설정해 주세요.', 'info');
      else if (!s.setup.db) showMsg('데이터 저장소(D1)가 아직 연결되지 않았습니다. 로그인은 되지만 문의·커뮤니티 기능은 연결 후에 쓸 수 있습니다.', 'info');
      if (!s.authed) return;
    }
    if (!s.authed) { showLogin(); return; }
    gate.hidden = true;
    app.hidden = false;
    if (whoEl) whoEl.textContent = '관리자로 로그인되어 있습니다. 12시간 동안 유지됩니다.';
    const start = (location.hash || '').replace('#', '');
    /* 관리자가 쓰는 브라우저는 방문 통계에서 뺀다 (KPI 화면에서 바꿀 수 있음) */
    try { if (localStorage.getItem('csj_no_stats') === null) localStorage.setItem('csj_no_stats', 'true'); } catch (_) { /* ignore */ }
    go(['kpi', 'inquiries', 'members', 'community', 'refs', 'content', 'system'].includes(start) ? start : 'dash');
  }

  boot();
})();
