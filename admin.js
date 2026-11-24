/* =========================================================
   최시준 홈페이지 — 관리자 페이지 (/admin)
   대시보드 · KPI 추이 · 전체 사이트 · 전체 KPI · 전체 문의 · 방문 통계 · 문의 · 회원 · 커뮤니티 · 레퍼런스 · 매일 글 · 설정
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
    if (tab === 'ops') loadOps();
    if (tab === 'trend') loadTrend();
    if (tab === 'sites') loadSites();
    if (tab === 'skpi') { if (SK.open) SK.scroll = true; loadSkpi(); }
    if (tab === 'leads') loadLeads();
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
      const st = d.sites || {};
      q('#cntSites').textContent = st.total ? String(st.total) : '';
      q('#cntMem').textContent = c.members ? String(c.members) : '';
      const kpis = [
        ['inquiries', c.inq_new, '새 문의', '답을 기다리는 문의'],
        ['kpi', fmtN(v.today_v || 0), '오늘 방문자', `어제 ${fmtN(v.yday_v || 0)}명 · 지금 ${v.live || 0}명`],
        ['sites', fmtN(st.total || 0), '운영 사이트', `주력 ${st.focus || 0}곳${st.down ? ' · 접속 문제 ' + st.down + '곳' : ''}`],
        ['kpi', fmtN(v.today_pv || 0), '오늘 페이지뷰', `어제 ${fmtN(v.yday_pv || 0)}회`],
        ['inquiries', c.inq_progress, '진행 중', '상담·답변 진행'],
        ['inquiries', c.inq_month, '이번 달 문의', '전체 ' + c.inq_total + '건'],
        ['members', fmtN(c.members || 0), '회원', '이번 달 가입 ' + (c.members_month || 0) + '명'],
        ['community', c.posts_pending + c.comments_pending, '게시 확인 대기', '글 ' + c.posts_pending + ' · 답글 ' + c.comments_pending],
        ['refs', c.refs, '등록한 레퍼런스', '레퍼런스 페이지에 공개']
      ];
      q('#admKpis').innerHTML = kpis.map(([tab, n, label, foot]) =>
        `<li><button type="button" data-go="${tab}"><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${esc(label)}</span><span class="adm-kpi-foot">${esc(foot)}</span></button></li>`).join('');
      loadDashTrend();

      q('#admRecent').innerHTML = d.recent.length ? d.recent.map((r) => `
        <li class="acc-item adm-click" data-inq="${r.id}">
          <div class="acc-item-head"><span class="adm-tag">${esc(r.type)}</span><span class="adm-tag ${r.status === '완료' ? 'is-ok' : r.status === '접수' ? 'is-ad' : ''}">${esc(r.status)}</span><span class="acc-date mono">${KST(r.created_at)}</span></div>
          <p class="acc-who"><strong>${esc(r.name)}</strong> · ${ago(r.created_at)}</p>
        </li>`).join('') : '<li class="acc-empty">아직 들어온 문의가 없습니다.</li>';
      qa('#admRecent [data-inq]').forEach((li) => li.addEventListener('click', () => { state.openInq = Number(li.dataset.inq); go('inquiries'); }));

      const todo = [];
      if (c.inq_stale) todo.push(`<li class="is-late">2일 넘게 답하지 않은 문의가 <strong>${c.inq_stale}건</strong> 있습니다. <button class="link-btn" data-go="inquiries">문의 보기</button></li>`);
      if (st.down) todo.push(`<li class="is-late">접속 점검에서 문제가 있던 사이트가 <strong>${st.down}곳</strong> 있습니다. <button class="link-btn" data-go="sites">전체 사이트 보기</button></li>`);
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

  /* =========================================================
     전체 사이트 — 운영하는 홈페이지 · 플랫폼 · 프로젝트를 한 화면에서
     ========================================================= */
  const ST = { sites: [], tracking: {}, meta: null, self: '', filter: { tier: '주력', cluster: '', stage: '', q: '' }, open: null, edit: null, extra: null, checking: false, loaded: false };
  const CF_DASH = 'https://dash.cloudflare.com/?to=/:account';
  const cfLink = (s) => (!s.cf_project ? '' : s.cf_kind === 'Workers'
    ? `${CF_DASH}/workers/services/view/${encodeURIComponent(s.cf_project)}/production`
    : `${CF_DASH}/pages/view/${encodeURIComponent(s.cf_project)}`);
  const hostText = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const chkState = (s) => (!s.url ? 'none' : !s.chk_at ? 'unknown' : (s.chk_code >= 200 && s.chk_code < 400) ? 'ok' : 'bad');
  const chkText = (s) => {
    const st = chkState(s);
    if (st === 'none') return '주소 없음';
    if (st === 'unknown') return '아직 점검하지 않음';
    if (st === 'ok') return `정상${s.chk_ms ? ' · ' + (s.chk_ms / 1000).toFixed(1) + '초' : ''} · ${KST(s.chk_at).slice(5)}`;
    return `문제 있음 — ${s.chk_note || (s.chk_code ? '응답 ' + s.chk_code : '연결하지 못함')} · ${KST(s.chk_at).slice(5)}`;
  };
  const stageClass = (st) => (st === '운영 중' ? 'is-ok' : st === '서비스 공개' ? '' : (st === '베타' || st === '준비 중') ? 'is-ad' : 'is-off');
  const siteById = (id) => ST.sites.find((s) => s.id === id);

  async function loadSites() {
    try {
      const d = await api('sites');
      ST.sites = d.sites; ST.tracking = d.tracking || {}; ST.meta = d.meta; ST.self = d.self; ST.loaded = true;
      fillSiteFilters();
      renderSites();
    } catch (err) {
      showMsg(err.message, 'err');
      if (!ST.loaded) q('#stList').innerHTML = `<p class="acc-empty">${esc(err.message)}</p>`;
    }
  }

  function fillSiteFilters() {
    const live = ST.sites.filter((s) => !s.archived);
    const clusters = [];
    live.forEach((s) => { if (s.cluster && !clusters.includes(s.cluster)) clusters.push(s.cluster); });
    const cSel = q('#stCluster');
    cSel.innerHTML = '<option value="">모든 사업군</option>' + clusters.map((c) => `<option${c === ST.filter.cluster ? ' selected' : ''}>${esc(c)}</option>`).join('');
    const sSel = q('#stStage');
    sSel.innerHTML = '<option value="">모든 단계</option>' + ST.meta.stages.map((c) => `<option${c === ST.filter.stage ? ' selected' : ''}>${esc(c)}</option>`).join('');
    q('#cntSites').textContent = live.length ? String(live.length) : '';
  }

  function shownSites() {
    const f = ST.filter;
    const k = f.q.toLowerCase();
    return ST.sites.filter((s) => {
      if (f.tier === '숨김') { if (!s.archived) return false; }
      else { if (s.archived) return false; if (f.tier && s.tier !== f.tier) return false; }
      if (f.cluster && s.cluster !== f.cluster) return false;
      if (f.stage && s.stage !== f.stage) return false;
      if (k && ![s.name, s.url, s.domain, s.alt, s.repo, s.cf_project, s.storage, s.entity, s.summary, s.memo, s.cluster].join(' ').toLowerCase().includes(k)) return false;
      return true;
    });
  }

  qa('#stTier .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#stTier .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    ST.filter.tier = b.dataset.tier;
    renderSites();
  }));
  q('#stCluster').addEventListener('change', (e) => { ST.filter.cluster = e.target.value; renderSites(); });
  q('#stStage').addEventListener('change', (e) => { ST.filter.stage = e.target.value; renderSites(); });
  let stTimer;
  q('#stSearch').addEventListener('input', (e) => { clearTimeout(stTimer); stTimer = setTimeout(() => { ST.filter.q = e.target.value.trim(); renderSites(); }, 200); });

  function renderSiteTiles() {
    const live = ST.sites.filter((s) => !s.archived);
    const focus = live.filter((s) => s.tier === '주력');
    const withDomain = focus.filter((s) => s.domain);
    const checked = live.filter((s) => s.url && s.chk_at);
    const bad = checked.filter((s) => chkState(s) === 'bad');
    const lastChk = checked.reduce((a, s) => (s.chk_at > a ? s.chk_at : a), '');
    const tracked = live.filter((s) => ST.tracking[s.id]);
    const tiles = [
      [fmtN(live.length), '전체 사이트 · 프로젝트', `주력 ${focus.length}곳 · 그 외 ${live.length - focus.length}곳`],
      [fmtN(withDomain.length), '자체 도메인 연결', `주력 ${focus.length}곳 중 · 미연결 ${focus.length - withDomain.length}곳`],
      [checked.length ? `${fmtN(checked.length - bad.length)}<small>/${fmtN(checked.length)}</small>` : '-', '정상 접속', checked.length ? (bad.length ? `문제 ${bad.length}곳 · ` : '') + `${KST(lastChk).slice(5)} 점검` : '접속 점검을 누르면 확인합니다'],
      [`${withDomain.filter((s) => s.naver).length}<small> · ${withDomain.filter((s) => s.google).length} · ${withDomain.filter((s) => s.bing).length}</small>`, '검색 등록', `네이버 · 구글 · Bing (도메인 ${withDomain.length}곳 중)`],
      [fmtN(tracked.length), '방문 자동 수집', `주력 ${focus.length}곳 중 ${focus.filter((s) => ST.tracking[s.id]).length}곳`],
      [fmtN(live.filter((s) => s.repo).length), 'GitHub 저장소', `Cloudflare 배포 ${live.filter((s) => s.cf_project).length}곳`]
    ];
    q('#stTiles').innerHTML = tiles.map(([n, label, foot]) => `<li><button type="button" tabindex="-1"><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${esc(label)}</span><span class="adm-kpi-foot">${esc(foot)}</span></button></li>`).join('');
  }

  function siteRowHtml(s) {
    const st = chkState(s);
    const open = ST.open === s.id;
    const none = (label) => `<span class="st-link is-none"><span class="mono">${label}</span>없음</span>`;
    const se = (on, ch, name) => `<span class="st-se${on ? ' is-on' : ''}" title="${name} ${on ? '등록됨' : '등록 전'}">${ch}</span>`;
    return `
      <li class="st-row${open ? ' is-open' : ''}" data-id="${esc(s.id)}">
        <div class="st-main">
          <button type="button" class="st-name" data-open="${esc(s.id)}" aria-expanded="${open}">
            <span class="st-dot is-${st}" title="${esc(chkText(s))}"></span><strong>${esc(s.name)}</strong>
          </button>
          <p class="st-tags"><span class="adm-tag ${stageClass(s.stage)}">${esc(s.stage)}</span>${s.url && !s.domain && s.tier === '주력' ? '<span class="adm-tag is-ad">도메인 연결 전</span>' : ''}${st === 'bad' ? '<span class="adm-tag is-bad">접속 문제</span>' : ''}${ST.tracking[s.id] ? '<span class="adm-tag is-mail">방문 수집 중</span>' : ''}</p>
          <p class="st-sum">${esc(s.summary)}</p>
        </div>
        <div class="st-links">
          ${s.url ? `<a class="st-link" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="mono">주소</span><span class="st-v">${esc(hostText(s.url))}</span></a>` : none('주소')}
          ${s.repo ? `<a class="st-link" href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener"><span class="mono">GitHub${s.priv ? ' · 비공개' : ''}</span><span class="st-v">${esc(s.repo)}</span></a>` : none('GitHub')}
          ${s.cf_project ? `<a class="st-link" href="${esc(cfLink(s))}" target="_blank" rel="noopener"><span class="mono">Cloudflare ${esc(s.cf_kind)}</span><span class="st-v">${esc(s.cf_project)}</span>${s.storage ? `<small>${esc(s.storage)}</small>` : ''}</a>` : none('Cloudflare')}
        </div>
        <div class="st-marks" aria-label="검색 등록">${s.domain ? se(s.naver, 'N', '네이버') + se(s.google, 'G', '구글') + se(s.bing, 'B', 'Bing') : ''}<button type="button" class="st-toggle" data-open="${esc(s.id)}" aria-label="${open ? '접기' : '자세히'}">${open ? '접기' : '자세히'}</button></div>
        ${open ? siteDetailHtml(s) : ''}
      </li>`;
  }

  function siteDetailHtml(s) {
    const tr = ST.tracking[s.id];
    const a = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
    const facts = [
      ['사업군', esc(s.cluster || '-')],
      ['구분 · 단계', esc(`${s.tier} · ${s.stage}`)],
      ['운영 법인', esc(s.entity || '-')],
      ['대표 주소', s.url ? a(s.url, hostText(s.url)) : '아직 없음'],
      ['도메인', s.domain ? esc(s.domain) : (s.url ? '연결 전 — 기본 주소로 운영' : '-')],
      ['기본 주소', s.alt ? a(s.alt, hostText(s.alt)) : '-'],
      ['GitHub 저장소', s.repo ? a('https://github.com/' + s.repo, s.repo) + (s.priv ? ' <small>비공개</small>' : '') : '-'],
      ['마지막 수정', s.gh_pushed ? `${KST(s.gh_pushed)} <small>${ago(s.gh_pushed)}</small>` : '<small>GitHub 새로 확인을 누르면 보입니다</small>'],
      ['Cloudflare', s.cf_project ? a(cfLink(s), `${s.cf_kind} · ${s.cf_project}`) : '-'],
      ['데이터 저장소', esc(s.storage || '없음')],
      ['검색 등록', s.domain ? `네이버 ${s.naver ? '등록' : '<em>전</em>'} · 구글 ${s.google ? '등록' : '<em>전</em>'} · Bing ${s.bing ? '등록' : '<em>전</em>'}` : '<small>도메인 연결 뒤 등록</small>'],
      ['사이트맵 페이지', s.pages ? fmtN(s.pages) + '쪽' : '-'],
      ['접속 점검', esc(chkText(s))],
      ['방문 자동 수집', tr ? `수집 중 <small>최근 ${esc(String(tr.last).slice(5).replace('-', '.'))} · 30일 ${fmtN(tr.pv)}회</small>` : '아직 안 함']
    ];
    const d = s.domain;
    const links = [];
    if (s.url) links.push([s.url, '사이트 열기']);
    if (s.repo) links.push(['https://github.com/' + s.repo, 'GitHub']);
    if (s.cf_project) links.push([cfLink(s), 'Cloudflare']);
    if (d) {
      links.push([`https://search.google.com/search-console?resource_id=${encodeURIComponent('sc-domain:' + d)}`, '구글 서치 콘솔']);
      links.push(['https://searchadvisor.naver.com/console/board', '네이버 서치어드바이저']);
      links.push([`https://www.bing.com/webmasters/home?siteUrl=${encodeURIComponent('https://' + d + '/')}`, 'Bing 웹마스터']);
    }
    const isSelf = s.id === ST.self;
    return `
      <div class="st-detail">
        <ul class="kpi-facts st-facts">${facts.map(([k, v]) => `<li><span>${k}</span><strong>${v}</strong></li>`).join('')}</ul>
        ${s.model ? `<p class="st-model"><span class="mono">수익 구조</span>${esc(s.model)}</p>` : ''}
        <div class="adm-btns st-go">${links.map(([href, t]) => `<a class="btn btn-sm btn-line" href="${esc(href)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('')}</div>
        ${!tr && !isSelf && s.url ? `<details class="st-snippet"><summary>방문 자동 수집 넣는 법</summary>
          <p class="acc-help">이 사이트 모든 페이지의 <code>&lt;/body&gt;</code> 바로 앞에 아래 한 줄을 넣으면, 방문자·페이지뷰·예약 이동·전화·카톡 클릭이 '전체 KPI'에 자동으로 쌓입니다. 이름·연락처·IP는 저장하지 않습니다.</p>
          <div class="st-code"><code>${esc(ST.meta.snippet)}</code><button type="button" class="btn btn-sm btn-line" data-copy-snippet>복사</button></div></details>` : ''}
        ${tr && !isSelf ? `<p class="acc-help">운영자 브라우저를 통계에서 빼려면 <a href="${esc(s.url)}?k_off=1" target="_blank" rel="noopener">이 주소</a>로 한 번 열어 두세요. (PC와 휴대폰 각각)</p>` : ''}
        <label class="adm-memo"><span class="mono adm-label">메모 <small>(남은 할 일, 비밀값 설정 여부, 도메인 만료일 등 · 나만 봅니다)</small></span><textarea rows="3" maxlength="4000" data-memo placeholder="예: 관리자 비밀번호 설정 필요 · 도메인 2027.03 만료">${esc(s.memo || '')}</textarea></label>
        <div class="adm-btns">
          <button type="button" class="btn btn-sm btn-primary" data-memo-save>메모 저장</button>
          <button type="button" class="btn btn-sm btn-line" data-edit-site>정보 수정</button>
          <button type="button" class="btn btn-sm btn-line" data-kpi-site>KPI 보기</button>
          ${isSelf ? '' : s.archived ? '<button type="button" class="btn btn-sm btn-line" data-restore-site>다시 보이기</button>' : `<button type="button" class="btn btn-sm btn-line" data-hide-site>${s.seeded ? '목록에서 숨기기' : '삭제'}</button>`}
        </div>
      </div>`;
  }

  function renderSites() {
    if (!ST.loaded) return;
    renderSiteTiles();
    const rows = shownSites();
    const total = ST.sites.filter((s) => !s.archived).length;
    q('#stInfo').innerHTML = `<strong>${fmtN(rows.length)}곳</strong> 보는 중 · 전체 ${fmtN(total)}곳 · 이름을 누르면 자세한 정보와 메모가 열립니다`;
    const groups = [];
    rows.forEach((s) => {
      const key = s.cluster || '분류 없음';
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, rows: [] }; groups.push(g); }
      g.rows.push(s);
    });
    const list = q('#stList');
    list.innerHTML = groups.length ? groups.map((g) => `
      <section class="st-group">
        <h2 class="st-group-title">${esc(g.key)} <small>${g.rows.length}곳</small></h2>
        <ul class="st-rows">${g.rows.map(siteRowHtml).join('')}</ul>
      </section>`).join('') : '<p class="acc-empty">조건에 맞는 사이트가 없습니다.</p>';

    qa('[data-open]', list).forEach((b) => b.addEventListener('click', () => {
      ST.open = ST.open === b.dataset.open ? null : b.dataset.open;
      renderSites();
    }));
    const box = q('.st-row.is-open', list);
    if (!box) return;
    const s = siteById(box.dataset.id);
    const on = (sel, fn) => { const el = q(sel, box); if (el) el.addEventListener('click', fn); };
    on('[data-memo-save]', async () => {
      const memo = q('[data-memo]', box).value;
      try { await api('sites/' + s.id, { method: 'PATCH', body: { memo } }); s.memo = memo; showMsg('메모를 저장했습니다.', 'ok'); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    on('[data-edit-site]', () => openSiteForm(s));
    on('[data-kpi-site]', () => { SK.open = s.id; if (s.tier !== '주력') setSkTier(''); go('skpi'); });
    on('[data-hide-site]', async () => {
      if (!confirm(s.seeded ? `'${s.name}'을(를) 목록에서 숨길까요? '숨긴 것'에서 다시 보이게 할 수 있습니다.` : `'${s.name}'을(를) 목록에서 지울까요? 넣어 둔 KPI 숫자도 함께 지워집니다.`)) return;
      try { await api('sites/' + s.id, { method: 'DELETE' }); ST.open = null; showMsg(s.seeded ? '숨겼습니다.' : '삭제했습니다.', 'ok'); loadSites(); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    on('[data-restore-site]', async () => {
      try { await api('sites/' + s.id, { method: 'PATCH', body: { archived: false } }); showMsg('다시 목록에 보입니다.', 'ok'); loadSites(); }
      catch (err) { showMsg(err.message, 'err'); }
    });
    on('[data-copy-snippet]', async () => {
      try { await navigator.clipboard.writeText(ST.meta.snippet); showMsg('한 줄 코드를 복사했습니다.', 'ok'); } catch (_) { showMsg(ST.meta.snippet, 'info'); }
    });
  }

  /* 추가 · 수정 양식 */
  const stForm = q('#stForm');
  function openSiteForm(s, preset) {
    const v = s || { tier: '그 외', stage: '미분류', cf_kind: 'Pages', ...(preset || {}) };
    ST.edit = s ? s.id : null;
    const clusters = [];
    ST.sites.forEach((x) => { if (x.cluster && !clusters.includes(x.cluster)) clusters.push(x.cluster); });
    const opt = (list, cur) => list.map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
    const val = (k) => esc(v[k] == null ? '' : v[k]);
    stForm.innerHTML = `
      <div class="acc-head"><h2>${s ? esc(s.name) + ' — 정보 수정' : '사이트 · 프로젝트 추가'}</h2><button type="button" class="btn btn-sm btn-line" data-cancel>닫기</button></div>
      <div class="st-form-grid">
        <label>이름<input type="text" name="name" maxlength="80" value="${val('name')}" required /></label>
        <label>구분<select name="tier">${opt(ST.meta.tiers, v.tier)}</select></label>
        <label>사업군<input type="text" name="cluster" maxlength="60" list="stClusterList" value="${val('cluster')}" placeholder="예: 02 공간 플랫폼" /></label>
        <label>운영 단계<select name="stage">${opt(ST.meta.stages, v.stage)}</select></label>
        <label>대표 주소<input type="text" name="url" maxlength="300" value="${val('url')}" placeholder="https://" /></label>
        <label><span>도메인 <small>(연결한 경우만)</small></span><input type="text" name="domain" maxlength="120" value="${val('domain')}" placeholder="example.kr" /></label>
        <label><span>기본 주소 <small>(pages.dev · workers.dev)</small></span><input type="text" name="alt" maxlength="300" value="${val('alt')}" /></label>
        <label><span>GitHub 저장소 <small>(계정/저장소)</small></span><input type="text" name="repo" maxlength="120" value="${val('repo')}" placeholder="naadaa87/…" /></label>
        <label>Cloudflare 종류<select name="cf_kind"><option value="">없음</option>${opt(['Pages', 'Workers'], v.cf_kind)}</select></label>
        <label>Cloudflare 프로젝트 이름<input type="text" name="cf_project" maxlength="80" value="${val('cf_project')}" /></label>
        <label><span>데이터 저장소 <small>(D1 · KV · R2)</small></span><input type="text" name="storage" maxlength="300" value="${val('storage')}" placeholder="D1 example-db" /></label>
        <label>운영 법인<input type="text" name="entity" maxlength="80" value="${val('entity')}" /></label>
        <label class="is-wide">한 줄 설명<input type="text" name="summary" maxlength="300" value="${val('summary')}" /></label>
        <label class="is-wide">수익 구조<input type="text" name="model" maxlength="400" value="${val('model')}" /></label>
        <label><span>정렬 순서 <small>(작을수록 위)</small></span><input type="number" name="sort" min="0" max="99999" value="${val('sort')}" /></label>
        <div class="st-form-checks">
          <label class="acc-check"><input type="checkbox" name="priv"${v.priv ? ' checked' : ''} /> 비공개 저장소</label>
          <label class="acc-check"><input type="checkbox" name="naver"${v.naver ? ' checked' : ''} /> 네이버 등록</label>
          <label class="acc-check"><input type="checkbox" name="google"${v.google ? ' checked' : ''} /> 구글 등록</label>
          <label class="acc-check"><input type="checkbox" name="bing"${v.bing ? ' checked' : ''} /> Bing 등록</label>
        </div>
      </div>
      <datalist id="stClusterList">${clusters.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      <div class="adm-btns"><button class="btn btn-primary" type="submit">${s ? '저장' : '추가'}</button><button class="btn btn-line" type="button" data-cancel>취소</button></div>`;
    stForm.hidden = false;
    qa('[data-cancel]', stForm).forEach((b) => b.addEventListener('click', () => { stForm.hidden = true; ST.edit = null; }));
    stForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = q('input[name="name"]', stForm);
    if (first && !s) first.focus();
  }
  q('#stAdd').addEventListener('click', () => { if (ST.loaded) openSiteForm(null); });
  stForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(stForm);
    const body = {};
    ['name', 'tier', 'cluster', 'stage', 'url', 'domain', 'alt', 'repo', 'cf_kind', 'cf_project', 'storage', 'entity', 'summary', 'model'].forEach((k) => { body[k] = String(fd.get(k) || '').trim(); });
    ['priv', 'naver', 'google', 'bing'].forEach((k) => { body[k] = fd.get(k) === 'on'; });
    if (String(fd.get('sort') || '').trim() !== '') body.sort = Number(fd.get('sort'));
    if (!body.name) { showMsg('이름을 적어 주세요.', 'err'); return; }
    const btn = q('button[type="submit"]', stForm);
    btn.disabled = true;
    try {
      if (ST.edit) { await api('sites/' + ST.edit, { method: 'PATCH', body }); ST.open = ST.edit; showMsg('저장했습니다.', 'ok'); }
      else { const d = await api('sites', { method: 'POST', body }); ST.open = d.id; if (ST.filter.tier && ST.filter.tier !== body.tier) setStTier(''); showMsg('추가했습니다.', 'ok'); }
      stForm.hidden = true; ST.edit = null;
      await loadSites();
      const row = q('.st-row.is-open');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) { showMsg(err.message, 'err'); }
    finally { btn.disabled = false; }
  });
  function setStTier(t) {
    ST.filter.tier = t;
    qa('#stTier .f-chip').forEach((x) => x.classList.toggle('is-active', x.dataset.tier === t));
  }

  /* 접속 점검 — 서버가 몇 곳씩 나눠 직접 열어 본다 */
  q('#stCheck').addEventListener('click', async () => {
    if (ST.checking || !ST.loaded) return;
    const targets = shownSites().filter((s) => s.url);
    if (!targets.length) { showMsg('점검할 사이트가 없습니다.', 'info'); return; }
    const btn = q('#stCheck');
    const size = ST.meta.checkBatch || 8;
    ST.checking = true;
    btn.disabled = true;
    let done = 0;
    let bad = 0;
    try {
      for (let i = 0; i < targets.length; i += size) {
        btn.textContent = `점검 중 ${done}/${targets.length}`;
        const d = await api('sites/check', { method: 'POST', body: { ids: targets.slice(i, i + size).map((s) => s.id) } });
        d.results.forEach((r) => {
          const s = siteById(r.id);
          if (!s) return;
          s.chk_at = d.at; s.chk_code = r.code; s.chk_ms = r.ms; s.chk_note = r.note;
          if (r.pages) s.pages = r.pages;
          if (chkState(s) === 'bad') bad++;
        });
        done += d.results.length;
        renderSites();
      }
      showMsg(bad ? `${done}곳을 점검했습니다. 문제가 있는 곳이 ${bad}곳 있습니다. 빨간 점이 붙은 사이트를 확인해 주세요.` : `${done}곳 모두 정상으로 열립니다.`, bad ? 'err' : 'ok');
    } catch (err) { showMsg(err.message, 'err'); }
    finally { ST.checking = false; btn.disabled = false; btn.textContent = '접속 점검'; }
  });

  /* GitHub — 마지막 수정일과 목록에 없는 새 저장소 */
  q('#stGithub').addEventListener('click', async () => {
    if (!ST.loaded) return;
    const btn = q('#stGithub');
    btn.disabled = true; btn.textContent = '확인 중…';
    try {
      const d = await api('sites/github', { method: 'POST' });
      ST.extra = d.extra || [];
      await loadSites();
      renderExtra();
      showMsg(`GitHub 저장소 ${d.count}개를 확인했습니다.${ST.extra.length ? ` 목록에 없는 저장소가 ${ST.extra.length}개 있습니다.` : ' 목록에 없는 새 저장소는 없습니다.'}`, 'ok');
    } catch (err) { showMsg(err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'GitHub 새로 확인'; }
  });
  function renderExtra() {
    const box = q('#stExtra');
    const rows = ST.extra || [];
    if (!rows.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <article class="acc-card st-extra">
        <div class="acc-head"><h2>목록에 없는 GitHub 저장소 <small>${rows.length}개</small></h2><button type="button" class="btn btn-sm btn-line" data-x-close>닫기</button></div>
        <ul class="kpi-mini">${rows.map((r, i) => `<li><span class="mono">${esc(KST(r.pushed).slice(0, 10))}</span><span><a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener">${esc(r.name)}</a> <small>${esc(r.description || '')}</small></span><button type="button" class="btn btn-sm btn-line" data-x-add="${i}">목록에 추가</button></li>`).join('')}</ul>
        <p class="acc-help">공개 저장소만 보입니다. 비공개 저장소는 '사이트 추가'로 직접 넣어 주세요.</p>
      </article>`;
    q('[data-x-close]', box).addEventListener('click', () => { ST.extra = null; box.innerHTML = ''; });
    qa('[data-x-add]', box).forEach((b) => b.addEventListener('click', () => {
      const r = rows[Number(b.dataset.xAdd)];
      openSiteForm(null, { name: r.name, repo: r.repo, url: r.homepage || '', summary: r.description || '', cf_project: r.name, tier: '그 외', stage: '미분류' });
    }));
  }

  q('#stCsv').addEventListener('click', () => {
    const rows = shownSites();
    if (!rows.length) { showMsg('내려받을 사이트가 없습니다.', 'info'); return; }
    downloadCsv(`전체사이트_${todayKST()}.csv`, [
      ['구분', '사업군', '이름', '운영 단계', '대표 주소', '도메인', '기본 주소', 'GitHub 저장소', '저장소 공개', 'Cloudflare 종류', 'Cloudflare 프로젝트', '데이터 저장소', '운영 법인', '네이버', '구글', 'Bing', '사이트맵 페이지', '접속 점검', '응답(초)', '점검 시각', 'GitHub 마지막 수정', '방문 수집', '한 줄 설명', '수익 구조', '메모'],
      ...rows.map((s) => [s.tier, s.cluster, s.name, s.stage, s.url, s.domain, s.alt, s.repo, s.repo ? (s.priv ? '비공개' : '공개') : '', s.cf_kind, s.cf_project, s.storage, s.entity,
        s.naver ? '등록' : '', s.google ? '등록' : '', s.bing ? '등록' : '', s.pages || '', { ok: '정상', bad: '문제', unknown: '', none: '' }[chkState(s)], s.chk_ms ? (s.chk_ms / 1000).toFixed(1) : '', s.chk_at ? KST(s.chk_at) : '',
        s.gh_pushed ? KST(s.gh_pushed) : '', ST.tracking[s.id] ? '수집 중' : '', s.summary, s.model, s.memo])
    ]);
  });

  /* =========================================================
     전체 KPI — 사이트별 월간 지표 (자동 집계 + 직접 입력 + 목표)
     ========================================================= */
  const SK = { month: '', tier: '주력', data: null, open: null };
  const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
  const monthShort = (m) => `${Number(m.slice(5))}월`;
  const skMetric = (k) => (SK.data.metrics.find((m) => m.k === k) || { k, label: k, unit: '' });
  const fmtKv = (v) => {
    if (v == null) return '–';
    const n = Number(v);
    return (Math.abs(n) >= 100 || Number.isInteger(n) ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('ko-KR');
  };
  const skCellOf = (id, k) => ((SK.data.data[id] || {})[k]) || null;
  const skVal = (id, k, back = 0) => { const c = skCellOf(id, k); return c ? c.v[SK.data.span - 1 - back] : null; };

  function setSkTier(t) {
    SK.tier = t;
    qa('#skTier .f-chip').forEach((x) => x.classList.toggle('is-active', x.dataset.tier === t));
  }
  qa('#skTier .f-chip').forEach((b) => b.addEventListener('click', () => { setSkTier(b.dataset.tier); renderSkpi(); }));
  const shiftMonth = (m, n) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  q('#skPrev').addEventListener('click', () => { if (SK.data) { SK.month = shiftMonth(SK.month, -1); loadSkpi(); } });
  q('#skNext').addEventListener('click', () => { if (SK.data && SK.month < SK.data.nowMonth) { SK.month = shiftMonth(SK.month, 1); loadSkpi(); } });

  async function loadSkpi() {
    const body = q('#skBody');
    body.classList.add('is-loading');
    try {
      const d = await api('skpi' + (SK.month ? '?month=' + encodeURIComponent(SK.month) : ''));
      SK.data = d; SK.month = d.month;
      renderSkpi();
    } catch (err) {
      if (!SK.data) body.innerHTML = `<p class="acc-empty">${esc(err.message)}</p>`;
      showMsg(err.message, 'err');
    } finally { body.classList.remove('is-loading'); }
  }

  /* 전달 대비 — 올라가면 좋은 숫자들이라 ▲ 초록, ▼ 빨강. 색과 화살표를 함께 쓴다 */
  function skDelta(cur, prev) {
    if (cur == null || prev == null) return '';
    if (!prev) return cur ? '<span class="kpi-delta is-good">새로 생김</span>' : '';
    const diff = (cur - prev) / prev * 100;
    if (Math.abs(diff) < 0.5) return '<span class="kpi-delta is-flat">전달과 같음</span>';
    const v = Math.abs(diff) >= 100 ? Math.round(Math.abs(diff)) : Math.round(Math.abs(diff) * 10) / 10;
    return `<span class="kpi-delta ${diff > 0 ? 'is-good' : 'is-bad'}" title="전달 ${fmtKv(prev)}">${diff > 0 ? '▲' : '▼'} ${v}%</span>`;
  }

  function skCellHtml(site, k) {
    const m = skMetric(k);
    if (!site.kpis.includes(k)) return `<div class="sk-cell is-na" aria-hidden="true"></div>`;
    const c = skCellOf(site.id, k);
    const i = SK.data.span - 1;
    const v = c ? c.v[i] : null;
    const prev = c ? c.v[i - 1] : null;
    const t = c ? c.t : null;
    const auto = c && c.src[i] === 'auto';
    const rate = t && v != null ? v / t : null;
    return `
      <div class="sk-cell${v == null ? ' is-empty' : ''}">
        <span class="sk-label">${esc(m.label)}</span>
        <strong class="sk-val">${fmtKv(v)}${v != null && m.unit === '만원' ? '<small>만</small>' : ''}${auto ? '<em class="sk-auto" title="자동으로 집계한 숫자">자동</em>' : ''}</strong>
        ${m.stock ? '' : skDelta(v, prev)}
        ${t ? `<span class="sk-goal" title="목표 ${fmtKv(t)}${esc(m.unit)}"><span class="sk-goal-bar"><i class="${rate != null && rate >= 1 ? 'is-done' : ''}" style="width:${rate == null ? 0 : Math.min(100, Math.round(rate * 100))}%"></i></span><em>${rate == null ? '목표 ' + fmtKv(t) : fmtPct(rate, 0) + (rate >= 1 ? ' 달성' : '')}</em></span>` : ''}
      </div>`;
  }

  function skDetailHtml(site) {
    const d = SK.data;
    const i = d.span - 1;
    const rowsHtml = site.kpis.map((k) => {
      const m = skMetric(k);
      const c = skCellOf(site.id, k) || { v: Array(d.span).fill(null), src: Array(d.span).fill(''), t: null, mv: null };
      const auto = c.src[i] === 'auto';
      const max = Math.max(1, ...c.v.map((x) => x || 0));
      const bars = c.v.map((x, j) => `<span class="sk-bar${j === i ? ' is-now' : ''}" title="${monthLabel(d.months[j])} ${x == null ? '기록 없음' : fmtKv(x) + m.unit}"><i style="height:${x ? Math.max(6, Math.round(x / max * 100)) : 0}%"></i></span>`).join('');
      return `
        <div class="sk-edit-row">
          <div class="sk-edit-name"><strong>${esc(m.label)}</strong><small>${esc(m.hint || '')}</small></div>
          <label class="sk-in"><span>${monthShort(d.month)}${m.stock ? ' 말' : ''}</span>
            ${auto ? `<output>${fmtKv(c.v[i])}<small>${esc(m.unit)} · 자동</small></output>`
              : `<span class="sk-in-box"><input type="text" inputmode="decimal" data-v="${k}" value="${c.mv == null ? '' : c.mv}" placeholder="${m.auto ? '수집 전 · 직접 입력' : '입력'}" aria-label="${esc(m.label)} ${monthLabel(d.month)} 값" /><em>${esc(m.unit)}</em></span>`}
          </label>
          <label class="sk-in"><span>목표</span><span class="sk-in-box"><input type="text" inputmode="decimal" data-t="${k}" value="${c.t == null ? '' : c.t}" placeholder="-" aria-label="${esc(m.label)} 목표" /><em>${esc(m.unit)}</em></span></label>
          <div class="sk-spark" aria-hidden="true">${bars}</div>
        </div>`;
    }).join('');
    return `
      <form class="sk-detail" data-site="${esc(site.id)}" novalidate>
        <div class="sk-detail-head"><p><strong>${esc(site.name)}</strong> · ${monthLabel(d.month)} 숫자와 목표</p><p class="sk-spark-cap">막대: ${monthShort(d.months[0])} ~ ${monthShort(d.month)}</p></div>
        ${site.kpis.length ? `<div class="sk-edit">${rowsHtml}</div>` : '<p class="acc-empty">아직 지표를 정하지 않았습니다. 아래에서 이 사이트에서 볼 지표를 골라 주세요.</p>'}
        <details class="sk-pick"${site.kpis.length ? '' : ' open'}><summary>이 사이트에서 볼 지표 고르기</summary>
          <div class="sk-pick-list">${d.metrics.map((m) => `<label class="acc-check" title="${esc(m.hint || '')}"><input type="checkbox" data-pick="${m.k}"${site.kpis.includes(m.k) ? ' checked' : ''} /> ${esc(m.label)}${m.auto ? ' <small>자동</small>' : ''}</label>`).join('')}</div>
        </details>
        ${site.tracked || site.id === d.self ? '' : '<p class="acc-help">방문자·페이지뷰·예약 이동은 이 사이트에 수집 코드 한 줄을 넣으면 자동으로 채워집니다 (전체 사이트 → 이 사이트 → 방문 자동 수집 넣는 법). 그 전에는 직접 입력한 숫자를 씁니다.</p>'}
        <div class="adm-btns"><button type="submit" class="btn btn-sm btn-primary">저장</button>${site.url ? `<a class="btn btn-sm btn-line" href="${esc(site.url)}" target="_blank" rel="noopener">사이트 열기 ↗</a>` : ''}<button type="button" class="btn btn-sm btn-line" data-site-info>사이트 정보</button><button type="button" class="btn btn-sm btn-line" data-close>닫기</button></div>
      </form>`;
  }

  function renderSkpi() {
    const d = SK.data;
    if (!d) return;
    const i = d.span - 1;
    const isNow = d.month === d.nowMonth;
    q('#skMonth').textContent = monthLabel(d.month);
    q('#skNext').disabled = isNow;
    const sites = d.sites.filter((s) => !SK.tier || s.tier === SK.tier);
    const withKpi = sites.filter((s) => s.kpis.length);
    const noKpi = sites.filter((s) => !s.kpis.length);
    q('#skInfo').innerHTML = `<strong>${monthLabel(d.month)}</strong>${isNow ? ' (오늘까지)' : ''} · 비교: ${monthShort(d.months[i - 1])} · ${SK.tier || '전체'} ${fmtN(sites.length)}곳 · 사이트 이름을 누르면 숫자와 목표를 넣을 수 있습니다`;

    /* 합계 */
    const sum = (k, back = 0) => {
      let total = 0; let n = 0;
      withKpi.forEach((s) => { if (!s.kpis.includes(k)) return; const v = skVal(s.id, k, back); if (v != null) { total += v; n++; } });
      return { total, n };
    };
    const tile = (k, label, unitText, extra) => {
      const a = sum(k); const b = sum(k, 1);
      return [label, a.n ? fmtKv(a.total) + (unitText || '') : '–', a.n && b.n ? skDelta(a.total, b.total) : '', a.n ? `${a.n}곳 합계${extra ? ' · ' + extra : ''}` : '아직 숫자가 없습니다'];
    };
    let goals = 0; let hit = 0; let filled = 0;
    withKpi.forEach((s) => {
      let any = false;
      s.kpis.forEach((k) => { const c = skCellOf(s.id, k); if (!c) return; const v = c.v[i]; if (v != null) any = true; if (c.t) { goals++; if (v != null && v >= c.t) hit++; } });
      if (any) filled++;
    });
    const tracked = sites.filter((s) => s.tracked).length;
    const bk = sum('book');
    const tiles = [
      tile('visitors', '방문자', ''),
      tile('inquiries', '문의·상담', '건'),
      tile('reservations', '예약', '건', bk.n ? `예약 이동 ${fmtKv(bk.total)}회` : ''),
      tile('signups', '신규 가입', '명'),
      tile('revenue', '매출', '만원'),
      ['목표 달성', goals ? `${hit}/${goals}` : '–', '', goals ? '목표를 정한 지표 가운데' : '목표를 정하면 달성 여부가 보입니다'],
      ['방문 자동 수집', `${tracked}/${sites.length}`, '', '수집 코드를 넣은 사이트'],
      ['이번 달 숫자가 있는 곳', `${filled}/${withKpi.length}`, '', '자동 집계 또는 직접 입력']
    ];

    /* 사업군별 표 */
    const groups = [];
    withKpi.forEach((s) => {
      const key = s.cluster || '분류 없음';
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, rows: [], cols: [] }; groups.push(g); }
      g.rows.push(s);
      s.kpis.forEach((k) => { if (!g.cols.includes(k)) g.cols.push(k); });
    });
    const order = d.metrics.map((m) => m.k);
    const vis = withKpi.map((s) => ({ s, v: skVal(s.id, 'visitors') })).filter((x) => x.v != null && x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);

    const body = q('#skBody');
    body.innerHTML = `
      ${tracked <= 1 ? `<p class="auth-msg is-info">지금은 choisijun.com만 방문이 자동으로 집계됩니다. 다른 사이트는 수집 코드 한 줄을 넣은 곳부터 방문자·페이지뷰·예약 이동이 채워지고, 그 전에는 사이트 이름을 눌러 숫자를 직접 넣을 수 있습니다. 문의·예약·가입·매출과 목표는 언제든 직접 넣습니다.</p>` : ''}
      <ul class="kpi-tiles">${tiles.map(([label, val, delta, foot], n) => `<li class="kpi-tile${n === 0 ? ' is-lead' : ''}"><p class="kpi-tile-label">${esc(label)}</p><p class="kpi-tile-val">${esc(val)}</p>${delta}<p class="kpi-tile-foot">${esc(foot)}</p></li>`).join('')}</ul>
      ${groups.map((g) => {
        g.cols.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        const cols = g.cols.slice(0, 7);
        return `
        <article class="acc-card sk-group">
          <div class="acc-head"><h2>${esc(g.key)} <small>${g.rows.length}곳</small></h2></div>
          <div class="sk-table" style="--n:${cols.length}">
            <div class="sk-row sk-headrow"><span>사이트</span>${cols.map((k) => { const m = skMetric(k); return `<span title="${esc(m.hint || '')}">${esc(m.label)} <small>${esc(m.unit)}</small></span>`; }).join('')}</div>
            ${g.rows.map((s) => `
              <div class="sk-item${SK.open === s.id ? ' is-open' : ''}" data-id="${esc(s.id)}">
                <div class="sk-row">
                  <button type="button" class="sk-site" data-open="${esc(s.id)}" aria-expanded="${SK.open === s.id}"><strong>${esc(s.name)}</strong><span class="adm-tag ${stageClass(s.stage)}">${esc(s.stage)}</span></button>
                  ${cols.map((k) => skCellHtml(s, k)).join('')}
                </div>
                ${SK.open === s.id ? skDetailHtml(s) : ''}
              </div>`).join('')}
          </div>
        </article>`;
      }).join('')}
      ${vis.length > 1 ? `<article class="acc-card kpi-card"><h2>방문자가 많은 사이트 <small>${monthLabel(d.month)}</small></h2>${barList(vis, (x) => ({ name: x.s.name, value: fmtKv(x.v) + '명', n: x.v, sub: x.s.cluster }), '-')}</article>` : ''}
      ${noKpi.length ? `<article class="acc-card sk-group"><div class="acc-head"><h2>지표를 정하지 않은 곳 <small>${noKpi.length}곳 · 내부 도구, 보관한 사이트 등</small></h2></div>
        <div class="sk-table sk-nokpi">${noKpi.map((s) => `
          <div class="sk-item${SK.open === s.id ? ' is-open' : ''}" data-id="${esc(s.id)}">
            <div class="sk-row"><button type="button" class="sk-site" data-open="${esc(s.id)}" aria-expanded="${SK.open === s.id}"><strong>${esc(s.name)}</strong><span class="adm-tag ${stageClass(s.stage)}">${esc(s.stage)}</span><small>${esc(s.cluster)}</small></button></div>
            ${SK.open === s.id ? skDetailHtml(s) : ''}
          </div>`).join('')}</div></article>` : ''}
      <article class="acc-card kpi-note">
        <h2>숫자 읽는 법</h2>
        <ul class="acc-help kpi-howto">
          <li><strong>자동</strong> 표시가 붙은 숫자는 방문 기록에서 바로 센 값입니다. 표시가 없는 숫자는 직접 넣은 값입니다.</li>
          <li><strong>방문자</strong>는 브라우저 기준으로 그 달에 들어온 사람 수, <strong>예약 이동</strong>은 예약 버튼·네이버 예약 링크를 누른 횟수입니다. 실제 예약 건수는 '예약'에 직접 넣습니다.</li>
          <li><strong>누적 회원 · 입점 · 유료 구독 · 콘텐츠 페이지</strong>는 그 달 말 기준 숫자입니다. 콘텐츠 페이지는 '전체 사이트 → 접속 점검' 때 사이트맵을 세어 채웁니다.</li>
          <li>이번 달 숫자는 오늘까지의 값이라, 전달 대비는 달이 끝나야 정확합니다.</li>
        </ul>
      </article>`;

    qa('[data-open]', body).forEach((b) => b.addEventListener('click', () => { SK.open = SK.open === b.dataset.open ? null : b.dataset.open; renderSkpi(); }));
    const form = q('.sk-detail', body);
    if (!form) return;
    const site = d.sites.find((s) => s.id === form.dataset.site);
    q('[data-close]', form).addEventListener('click', () => { SK.open = null; renderSkpi(); });
    q('[data-site-info]', form).addEventListener('click', () => { ST.open = site.id; setStTier(''); ST.filter.cluster = ''; ST.filter.stage = ''; ST.filter.q = ''; q('#stSearch').value = ''; go('sites'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      const read = (el) => { const t = String(el.value || '').replace(/[,\s]/g, ''); return t === '' ? null : Number(t); };
      let badInput = false;
      site.kpis.forEach((k) => {
        const vi = q(`[data-v="${k}"]`, form); const ti = q(`[data-t="${k}"]`, form);
        const c = skCellOf(site.id, k);
        const v = vi ? read(vi) : (c ? c.mv : null);
        const t = ti ? read(ti) : null;
        if ((v != null && !(v >= 0)) || (t != null && !(t >= 0))) badInput = true;
        values[k] = { v, t };
      });
      if (badInput) { showMsg('숫자만 넣어 주세요. 예: 1200', 'err'); return; }
      const picked = qa('[data-pick]', form).filter((x) => x.checked).map((x) => x.dataset.pick);
      const kpis = site.kpis.filter((k) => picked.includes(k)).concat(picked.filter((k) => !site.kpis.includes(k)));
      const btn = q('button[type="submit"]', form);
      btn.disabled = true;
      try {
        await api('skpi/' + site.id, { method: 'PUT', body: { month: d.month, values, kpis } });
        showMsg(`${site.name} — ${monthLabel(d.month)} 숫자를 저장했습니다.`, 'ok');
        await loadSkpi();
      } catch (err) { showMsg(err.message, 'err'); btn.disabled = false; }
    });
    if (SK.scroll) { SK.scroll = false; form.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  q('#skCsv').addEventListener('click', () => {
    const d = SK.data;
    if (!d) { showMsg('먼저 KPI를 불러와 주세요.', 'info'); return; }
    const sites = d.sites.filter((s) => (!SK.tier || s.tier === SK.tier) && s.kpis.length);
    const i = d.span - 1;
    const rows = [['사업군', '사이트', '지표', '단위', ...d.months, '목표', '달성률(%)', '집계']];
    sites.forEach((s) => s.kpis.forEach((k) => {
      const m = skMetric(k);
      const c = skCellOf(s.id, k) || { v: Array(d.span).fill(null), src: [], t: null };
      const v = c.v[i];
      rows.push([s.cluster, s.name, m.label, m.unit, ...c.v.map((x) => (x == null ? '' : x)), c.t == null ? '' : c.t, c.t && v != null ? Math.round(v / c.t * 1000) / 10 : '', c.src[i] === 'auto' ? '자동' : v != null ? '직접 입력' : '']);
    }));
    downloadCsv(`전체KPI_${d.month}.csv`, rows);
  });

  /* =========================================================
     운영 현황 — 홈페이지 관리목록 · 현황 · 단계 · 운영 상태 · 특이사항 · 할 일
     ========================================================= */
  const OP = { data: null, leads: null, seo: {}, filter: { f: '', tier: '주력', cluster: '', state: '', q: '' }, tf: { owner: '', status: 'open' }, open: null };
  const OP_STATE_CLS = { '정상 운영': 'is-on', '점검 필요': 'is-bad', '개발·준비 중': 'is-ad', '보류': 'is-off', '종료 검토': 'is-off' };
  const opDone = (t) => t.status === '완료';
  const opOk = (s) => s.chk_code >= 200 && s.chk_code < 400;
  const opHost = (u) => { try { return new URL(u).host; } catch (_) { return u || ''; } };
  const opCf = (s) => (s.cf_project ? (s.cf_kind === 'Workers'
    ? `https://dash.cloudflare.com/?to=/:account/workers/services/view/${encodeURIComponent(s.cf_project)}/production`
    : `https://dash.cloudflare.com/?to=/:account/pages/view/${encodeURIComponent(s.cf_project)}`) : '');

  async function loadOps() {
    try {
      const [d] = await Promise.all([
        api('ops'),
        (LD.data ? Promise.resolve(LD.data) : api('leads').then((x) => { LD.data = x; return x; })).then((x) => { OP.leads = x; }).catch(() => { OP.leads = null; }),
        api('seo').then((x) => { OP.seo = x.seo || {}; }).catch(() => { OP.seo = OP.seo || {}; })
      ]);
      OP.data = d;
      opFillFilters();
      renderOps();
    } catch (err) {
      showMsg(err.message, 'err');
      if (!OP.data) q('#opTable').innerHTML = `<tbody><tr><td class="acc-empty">${esc(err.message)}</td></tr></tbody>`;
    }
  }

  function opFillFilters() {
    const d = OP.data;
    const clusters = [];
    d.sites.forEach((s) => { if (s.cluster && !clusters.includes(s.cluster)) clusters.push(s.cluster); });
    q('#opCluster').innerHTML = '<option value="">모든 사업군</option>' + clusters.map((c) => `<option${c === OP.filter.cluster ? ' selected' : ''}>${esc(c)}</option>`).join('');
    q('#opState').innerHTML = '<option value="">모든 운영 현황</option>' + d.meta.opsStates.map((c) => `<option${c === OP.filter.state ? ' selected' : ''}>${esc(c)}</option>`).join('');
    const f = q('#opAdd');
    f.site.innerHTML = '<option value="">사이트 선택</option><option value="*">전체 공통</option>' + d.sites.filter((s) => s.tier === '주력').map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    f.kind.innerHTML = d.meta.kinds.map((k) => `<option>${esc(k)}</option>`).join('');
    f.owner.innerHTML = d.meta.owners.map((k) => `<option>${esc(k)}</option>`).join('');
  }

  /** 사이트 하나의 상태 묶음 */
  function opSite(s) {
    const d = OP.data;
    const tasks = d.tasks.filter((t) => t.site === s.id);
    const open = tasks.filter((t) => !opDone(t));
    const tr = d.tracking[s.id] || null;
    const inq = OP.leads ? OP.leads.items.filter((r) => r.site === s.id && !r.soft) : [];
    const fresh = inq.filter((r) => r.isNew).length;
    const internal = s.stage === '내부용';
    const issues = [];
    if (s.ops === '점검 필요') issues.push('운영 점검');
    if (s.chk_at && !opOk(s)) issues.push('접속 오류');
    const seo = (OP.seo || {})[s.id];
    if (seo && seo.flags && seo.flags.length) issues.push('검색 문제');
    if (!internal && s.id !== d.self && !(tr && tr.last)) issues.push('방문 기록 없음');
    return { tasks, open, tr, inq, fresh, issues, mine: open.filter((t) => t.owner === '대표님' || t.owner === '함께').length, claude: open.filter((t) => t.owner === 'Claude').length };
  }

  function opShownSites() {
    const d = OP.data;
    const f = OP.filter;
    const k = f.q.toLowerCase();
    return d.sites.filter((s) => {
      if (f.tier && s.tier !== f.tier) return false;
      if (f.cluster && s.cluster !== f.cluster) return false;
      if (f.state && s.ops !== f.state) return false;
      const x = opSite(s);
      if (f.f === 'check' && !x.issues.length) return false;
      if (f.f === 'todo' && !x.open.length) return false;
      if (f.f === 'lead' && !x.fresh) return false;
      if (k && ![s.name, s.id, s.url, s.cluster, s.stage, s.ops, s.note, s.memo, s.inquiry_via, s.summary, ...x.tasks.map((t) => t.title)].join(' ').toLowerCase().includes(k)) return false;
      return true;
    });
  }

  function renderOps() {
    const d = OP.data;
    if (!d) return;
    const focus = d.sites.filter((s) => s.tier === '주력');
    const xs = focus.map((s) => ({ s, x: opSite(s) }));
    const allOpen = d.tasks.filter((t) => !opDone(t));
    const byState = {};
    focus.forEach((s) => { byState[s.ops || '미정'] = (byState[s.ops || '미정'] || 0) + 1; });
    const pv7 = focus.reduce((a, s) => a + ((d.tracking[s.id] || {}).pv7 || 0), 0);
    const fresh = OP.leads ? OP.leads.items.filter((r) => r.isNew && !r.soft).length : null;
    const needCheck = xs.filter((o) => o.x.issues.length).length;
    q('#cntOps').textContent = needCheck ? String(needCheck) : '';
    const tiles = [
      [`${focus.length}<small>곳</small>`, '주력 사이트', `정상 운영 ${byState['정상 운영'] || 0} · 준비 ${byState['개발·준비 중'] || 0} · 보류·종료 ${(byState['보류'] || 0) + (byState['종료 검토'] || 0)}`, ''],
      [fmtN(needCheck), '점검이 필요한 곳', `운영 점검 ${byState['점검 필요'] || 0} · 접속 오류 ${focus.filter((s) => s.chk_at && !opOk(s)).length} · 방문 기록 없음 ${xs.filter((o) => o.x.issues.includes('방문 기록 없음')).length}`, 'check'],
      [fresh == null ? '–' : fmtN(fresh), '회신 전 문의', '전체 문의에서 확인·회신', 'lead'],
      [fmtN(allOpen.length), '남은 할 일', `대표님 ${allOpen.filter((t) => t.owner === '대표님').length} · Claude ${allOpen.filter((t) => t.owner === 'Claude').length} · 함께 ${allOpen.filter((t) => t.owner === '함께').length}`, 'todo'],
      [fmtN(pv7), '최근 7일 페이지뷰', `주력 ${focus.filter((s) => (d.tracking[s.id] || {}).last >= d.meta.d7).length}곳에서 기록`, '']
    ];
    q('#opTiles').innerHTML = tiles.map(([n, label, foot, f]) => `<li><button type="button"${f ? ` data-op-tile="${f}"` : ' tabindex="-1"'}><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${esc(label)}</span><span class="adm-kpi-foot">${esc(foot)}</span></button></li>`).join('');
    qa('[data-op-tile]').forEach((b) => b.addEventListener('click', () => {
      OP.filter.f = b.dataset.opTile;
      qa('#opFilter .f-chip').forEach((x) => x.classList.toggle('is-active', x.dataset.f === OP.filter.f));
      renderOps();
    }));

    const rows = opShownSites();
    q('#opInfo').innerHTML = `<strong>${fmtN(rows.length)}곳</strong> 보는 중 · 방문은 최근 7일, 클릭은 최근 30일 기준 · 사이트 이름을 누르면 상세·특이사항·할 일을 고칠 수 있습니다`;

    let html = '<thead><tr><th>사이트</th><th>단계 · 운영</th><th>접속 · 방문 7일</th><th>문의</th><th>검색</th><th>할 일</th><th>특이사항</th></tr></thead><tbody>';
    let group = null;
    rows.forEach((s) => {
      if (s.cluster !== group) { group = s.cluster; html += `<tr class="op-group"><td colspan="7">${esc(group || '사업군 없음')}</td></tr>`; }
      const x = opSite(s);
      const open = OP.open === s.id;
      const chk = !s.chk_at ? '<span class="op-dot is-none" title="아직 점검 전"></span>미점검'
        : opOk(s) ? `<span class="op-dot is-ok"></span>정상${s.chk_ms ? ` <small>${fmtN(s.chk_ms)}ms</small>` : ''}` : `<span class="op-dot is-bad"></span>${esc(s.chk_note || ('오류 ' + s.chk_code))}`;
      const tr = x.tr;
      const visit = s.stage === '내부용' ? '<small>내부용</small>' : tr && tr.last ? `${fmtN(tr.pv7)}${tr.last < d.meta.d7 ? ` <small>마지막 ${esc(tr.last.slice(5))}</small>` : ''}` : '<small class="op-warn">기록 없음</small>';
      const se = s.stage === '내부용' ? '<small>차단</small>' : ['naver', 'google', 'bing'].map((k) => `<span class="op-se ${s[k] ? 'is-on' : ''}">${k[0].toUpperCase()}</span>`).join('');
      html += `
        <tr class="op-row${open ? ' is-open' : ''}${x.issues.length ? ' has-issue' : ''}" data-op="${esc(s.id)}" tabindex="0">
          <td class="op-name"><strong>${esc(s.name)}</strong>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="op-url">${esc(opHost(s.url))} ↗</a>` : ''}</td>
          <td class="op-stage"><span class="adm-tag is-off">${esc(s.stage)}</span>${s.ops ? `<span class="adm-tag ${OP_STATE_CLS[s.ops] || ''}">${esc(s.ops)}</span>` : '<small>운영 미정</small>'}</td>
          <td class="op-chk"><span>${chk}</span><span class="op-visit">방문 ${visit}</span></td>
          <td class="op-inq"><span>${esc(s.inquiry_via || '—')}</span>${x.fresh ? `<span class="adm-tag is-ad">회신 전 ${x.fresh}</span>` : ''}</td>
          <td class="op-ses">${se}${opSeoTag(s)}</td>
          <td class="op-todo">${x.open.length ? `${x.mine ? `<span class="adm-tag is-ad" title="대표님·함께">대표님 ${x.mine}</span>` : ''}${x.claude ? `<span class="adm-tag" title="Claude">Claude ${x.claude}</span>` : ''}` : '<small>없음</small>'}</td>
          <td class="op-note">${esc(s.note || '')}</td>
        </tr>`;
    });
    html += '</tbody>';
    q('#opTable').innerHTML = rows.length ? html : '<tbody><tr><td class="acc-empty">조건에 맞는 사이트가 없습니다.</td></tr></tbody>';
    qa('.op-row', q('#opTable')).forEach((tr) => {
      const toggle = (e) => { if (e.target.closest('a, button, select, input, textarea')) return; OP.open = OP.open === tr.dataset.op ? null : tr.dataset.op; renderOps(); };
      tr.addEventListener('click', toggle);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) toggle(e); });
    });
    renderOpDrawer();
    renderOpTasks();
  }

  /** 사이트 상세: 표 옆에 붙는 서랍 (표가 넓어도 잘리지 않게) */
  function renderOpDrawer() {
    const box = q('#opDrawer');
    const s = OP.open ? OP.data.sites.find((x) => x.id === OP.open) : null;
    if (!s) { box.hidden = true; box.innerHTML = ''; document.body.classList.remove('op-drawer-on'); return; }
    const x = opSite(s);
    const keep = box.querySelector('.op-drawer-body');
    const top = keep && box.dataset.site === s.id ? keep.scrollTop : 0;
    box.dataset.site = s.id;
    box.innerHTML = `
      <div class="op-drawer-head">
        <div><small>${esc(s.cluster || '')}</small><h3>${esc(s.name)}</h3></div>
        <button type="button" class="op-drawer-x" data-op-close aria-label="닫기">×</button>
      </div>
      <div class="op-drawer-body">${opDetail(s, x)}</div>`;
    box.hidden = false;
    document.body.classList.add('op-drawer-on');
    box.querySelector('.op-drawer-body').scrollTop = top;
    q('[data-op-close]', box).addEventListener('click', () => { OP.open = null; renderOps(); });
    opBindDetail();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && OP.open && !q('#opDrawer').hidden) { OP.open = null; renderOps(); } });

  /* ---- 검색 점검: 사이트맵 주소를 서버가 직접 열어 색인을 막는 문제를 찾는다 ---- */
  function opSeoTag(s) {
    const x = (OP.seo || {})[s.id];
    if (!x) return '';
    return x.flags.length ? `<span class="adm-tag is-bad op-seo-tag" title="${esc(x.flags.join('\n'))}">검색 문제 ${x.flags.length}</span>` : '<span class="adm-tag is-on op-seo-tag">검색 점검 통과</span>';
  }
  function opSeoBox(s) {
    if (s.stage === '내부용' || !s.url) return '';
    const x = (OP.seo || {})[s.id];
    const ex = (list, f) => (list && list.length ? `<small>${list.slice(0, 4).map((i) => esc(f(i))).join(' · ')}${list.length > 4 ? ' …' : ''}</small>` : '');
    let body = '<p class="acc-help">아직 점검하지 않았습니다. 사이트맵에 적힌 주소를 직접 열어 404·리디렉션·색인 제외·대표 주소 불일치를 찾습니다.</p>';
    if (x) {
      const detail = {
        '열리지 않는': ex(x.bad, (i) => `${i.p} (${i.st || '응답 없음'})`),
        '넘어감': ex(x.redirect, (i) => `${i.p} → ${i.to}`),
        'noindex': ex(x.noindex, (i) => i),
        '대표 주소': ex(x.canon, (i) => `${i.p} → ${i.c}`)
      };
      const flags = x.flags.map((f) => `<li class="is-bad">${esc(f)}${Object.entries(detail).filter(([k]) => f.includes(k)).map(([, v]) => v).join('')}</li>`).join('');
      const minor = (x.minor || []).map((f) => `<li>${esc(f)}${f.startsWith('설명') ? ex(x.nodesc, (i) => i) : f.startsWith('큰제목') ? ex(x.noh1, (i) => i) : f.startsWith('본문') ? ex(x.thin, (i) => `${i.p} (${i.n}자)`) : f.startsWith('같은 제목') ? ex(x.dupTitle, (i) => `${i.t} ×${i.n}`) : ''}</li>`).join('');
      body = `<p class="acc-help">${esc(KST(x.at))} 점검 · 사이트맵 ${fmtN(x.total)}쪽 중 ${fmtN(x.checked)}쪽 확인${x.www ? ` · www ${x.www.st === 200 ? '따로 열림' : x.www.st >= 300 && x.www.st < 400 ? '대표 주소로 이동' : '없음'}` : ''}</p>
        <ul class="op-seo-list">${flags || '<li class="is-ok">색인을 막는 문제는 없습니다.</li>'}${minor}</ul>`;
    }
    return `<div class="op-seo"><h4>검색 점검 <button type="button" class="btn btn-sm btn-line" data-op-seo="${esc(s.id)}">${x ? '다시 점검' : '지금 점검'}</button></h4>${body}</div>`;
  }
  async function opSeoRun(id, onStep) {
    let offset = 0;
    for (let i = 0; i < 12 && offset != null; i++) {
      const r = await api('seo/check', { method: 'POST', body: { id, offset } });
      if (onStep) onStep(Math.min((r.offset || 0) + 10, r.sampled), r.sampled);
      if (r.summary) { OP.seo[id] = { at: r.at, ...r.summary }; return r.summary; }
      offset = r.next;
    }
    return null;
  }

  function opTaskRow(t, withSite, same) {
    const d = OP.data;
    const site = t.site === '*' ? '전체 공통' : ((d.sites.find((s) => s.id === t.site) || {}).name || t.site);
    const sel = (name, list, v) => `<select data-op-task-field="${name}" aria-label="${name === 'owner' ? '담당' : '상태'}">${list.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    return `<li class="op-task${opDone(t) ? ' is-done' : ''}" data-task="${t.id}">
      ${withSite ? `<button type="button" class="link-btn op-task-site${same ? ' is-same' : ''}" data-op-goto="${esc(t.site)}"${same ? ' tabindex="-1" aria-hidden="true"' : ''}>${esc(site)}</button>` : ''}
      <span class="adm-tag is-off">${esc(t.kind)}</span>
      <span class="op-task-title">${esc(t.title)}${t.due ? ` <small class="op-due${!opDone(t) && t.due < todayKST() ? ' is-late' : ''}">~${esc(t.due.slice(5))}</small>` : ''}${opDone(t) && t.done_at ? ` <small>${esc(KST(t.done_at).slice(5, 10))} 완료</small>` : ''}</span>
      ${sel('owner', d.meta.owners, t.owner)}${sel('status', d.meta.statuses, t.status)}
      <button type="button" class="link-btn op-task-del" data-op-task-del aria-label="지우기">지우기</button>
    </li>`;
  }

  function opDetail(s, x) {
    const d = OP.data;
    const tr = x.tr || {};
    const ck = d.clicks[s.id] || {};
    const links = [
      s.url && `<a href="${esc(s.url)}" target="_blank" rel="noopener">사이트 ↗</a>`,
      s.url && s.id !== d.self && `<a href="${esc(s.url)}/admin" target="_blank" rel="noopener">사이트 관리자 ↗</a>`,
      s.repo && `<a href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener">GitHub ↗</a>`,
      opCf(s) && `<a href="${esc(opCf(s))}" target="_blank" rel="noopener">Cloudflare ↗</a>`,
      s.alt && `<a href="${esc(s.alt)}" target="_blank" rel="noopener">예비 주소 ↗</a>`
    ].filter(Boolean).join('');
    const info = [
      ['도메인', s.domain || '연결 전'], ['Cloudflare', [s.cf_kind, s.cf_project].filter(Boolean).join(' · ')], ['데이터 저장소', s.storage],
      ['운영 법인', s.entity], ['페이지 수', s.pages ? fmtN(s.pages) : ''], ['GitHub 마지막 수정', s.gh_pushed ? KST(s.gh_pushed) : ''],
      ['접속 점검', s.chk_at ? `${KST(s.chk_at)} · ${opOk(s) ? '정상' : (s.chk_note || '오류')}${s.chk_code ? ' (' + s.chk_code + ')' : ''}` : '아직 점검 전'],
      ['방문 수집', s.stage === '내부용' ? '내부용(수집 안 함)' : tr.last ? `최근 7일 ${fmtN(tr.pv7)}뷰 · 방문자 ${fmtN(tr.v7)} · 30일 ${fmtN(tr.pv30)}뷰 · 마지막 ${tr.last}` : '최근 30일 기록 없음'],
      ['30일 클릭', ['book', 'tel', 'kakao', 'form'].some((k) => ck[k]) ? `예약 ${fmtN(ck.book)} · 전화 ${fmtN(ck.tel)} · 카톡 ${fmtN(ck.kakao)} · 신청서 ${fmtN(ck.form)}` : ''],
      ['문의', x.inq.length ? `최근 ${fmtN(x.inq.length)}건 · 회신 전 ${fmtN(x.fresh)}건` : (OP.leads ? '쌓인 문의 없음' : '')],
      ['사업 요약', s.summary], ['수익 구조', s.model]
    ].filter(([, v]) => v);
    const opt = (list, v) => list.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
    return `
      <div class="op-detail-grid">
        <div>
          <p class="op-links">${links}${x.inq.length ? `<button type="button" class="link-btn" data-op-leads="${esc(s.id)}">전체 문의에서 보기 →</button>` : ''}</p>
          <dl class="op-info">${info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        </div>
        <form class="op-edit" data-op-edit="${esc(s.id)}">
          <div class="op-edit-row">
            <label>운영 현황<select name="ops"><option value="">미정</option>${opt(d.meta.opsStates, s.ops)}</select></label>
            <label>단계<select name="stage">${opt(d.meta.stages, s.stage)}</select></label>
          </div>
          <label>문의 받는 방식<input name="inquiry_via" maxlength="200" value="${esc(s.inquiry_via)}" /></label>
          <label>특이사항<textarea name="note" rows="3" maxlength="2000">${esc(s.note)}</textarea></label>
          <label>메모 <small>(나만 보는 기록)</small><textarea name="memo" rows="2" maxlength="4000">${esc(s.memo)}</textarea></label>
          <button type="submit" class="btn btn-sm">저장</button>
        </form>
      </div>
      ${opSeoBox(s)}
      <div class="op-detail-tasks">
        <h4>할 일 <small>${x.open.length ? `남은 ${x.open.length}건` : '남은 일 없음'}${x.tasks.length - x.open.length ? ` · 완료 ${x.tasks.length - x.open.length}건` : ''}</small></h4>
        <ul class="op-tasks">${x.tasks.map((t) => opTaskRow(t, false)).join('') || '<li class="acc-empty">등록된 할 일이 없습니다.</li>'}</ul>
        <form class="op-add is-inline" data-op-add="${esc(s.id)}">
          <select name="kind" aria-label="구분">${opt(d.meta.kinds, '개선')}</select>
          <input name="title" maxlength="300" placeholder="이 사이트에 할 일 추가" aria-label="할 일" required />
          <select name="owner" aria-label="담당">${opt(d.meta.owners, '대표님')}</select>
          <button type="submit" class="btn btn-sm btn-line">추가</button>
        </form>
      </div>`;
  }

  async function opSaveTask(id, body) {
    try {
      const r = await api('ops/tasks/' + id, { method: 'PATCH', body });
      const i = OP.data.tasks.findIndex((t) => t.id === id);
      if (i >= 0) OP.data.tasks[i] = r.task;
      return true;
    } catch (err) { showMsg(err.message, 'err'); return false; }
  }

  function opBindTasks(root) {
    qa('[data-op-task-field]', root).forEach((sel) => sel.addEventListener('change', async () => {
      const id = Number(sel.closest('[data-task]').dataset.task);
      if (await opSaveTask(id, { [sel.dataset.opTaskField]: sel.value })) { showMsg('저장했습니다.', 'ok'); renderOps(); }
    }));
    qa('[data-op-task-del]', root).forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('[data-task]');
      const id = Number(li.dataset.task);
      const t = OP.data.tasks.find((x) => x.id === id);
      if (!t || !window.confirm(`이 할 일을 지울까요?\n\n${t.title}`)) return;
      try {
        await api('ops/tasks/' + id, { method: 'DELETE' });
        OP.data.tasks = OP.data.tasks.filter((x) => x.id !== id);
        showMsg('지웠습니다.', 'ok');
        renderOps();
      } catch (err) { showMsg(err.message, 'err'); }
    }));
    qa('[data-op-goto]', root).forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.opGoto;
      if (id === '*') return;
      OP.open = id; OP.filter.f = ''; OP.filter.q = ''; q('#opSearch').value = '';
      const s = OP.data.sites.find((x) => x.id === id);
      if (s && OP.filter.tier && s.tier !== OP.filter.tier) { OP.filter.tier = ''; q('#opTier').value = ''; }
      qa('#opFilter .f-chip').forEach((x) => x.classList.toggle('is-active', x.dataset.f === ''));
      renderOps();
      const row = q(`.op-row[data-op="${id}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function opBindDetail() {
    const box = q('#opDrawer');
    opBindTasks(box);
    const edit = q('[data-op-edit]', box);
    if (edit) edit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = edit.dataset.opEdit;
      const body = { ops: edit.ops.value, stage: edit.stage.value, inquiry_via: edit.inquiry_via.value.trim(), note: edit.note.value.trim(), memo: edit.memo.value.trim() };
      try {
        await api('sites/' + id, { method: 'PATCH', body });
        Object.assign(OP.data.sites.find((s) => s.id === id), body);
        if (ST.loaded) { const s = ST.sites.find((x) => x.id === id); if (s) Object.assign(s, body); }
        showMsg('저장했습니다.', 'ok');
        renderOps();
      } catch (err) { showMsg(err.message, 'err'); }
    });
    const add = q('[data-op-add]', box);
    if (add) add.addEventListener('submit', async (e) => {
      e.preventDefault();
      await opCreateTask({ site: add.dataset.opAdd, kind: add.kind.value, title: add.title.value.trim(), owner: add.owner.value });
    });
    const sb = q('[data-op-seo]', box);
    if (sb) sb.addEventListener('click', async () => {
      sb.disabled = true;
      try {
        const r = await opSeoRun(sb.dataset.opSeo, (n, t) => { sb.textContent = `점검 중 ${n}/${t}`; });
        showMsg(r && r.flags.length ? `검색 점검을 마쳤습니다. 확인할 문제가 ${r.flags.length}가지 있습니다.` : '검색 점검을 마쳤습니다. 색인을 막는 문제는 없습니다.', r && r.flags.length ? 'err' : 'ok');
      } catch (err) { showMsg(err.message, 'err'); }
      renderOps();
    });
    const lb = q('[data-op-leads]', box);
    if (lb) lb.addEventListener('click', () => {
      LD.filter.site = lb.dataset.opLeads;
      go('leads');
    });
  }

  async function opCreateTask(body) {
    if (!body.site) { showMsg('사이트를 골라 주세요.', 'info'); return false; }
    if (!body.title) { showMsg('할 일을 적어 주세요.', 'info'); return false; }
    try {
      const r = await api('ops/tasks', { method: 'POST', body });
      OP.data.tasks.unshift(r.task);
      showMsg('할 일을 추가했습니다.', 'ok');
      renderOps();
      return true;
    } catch (err) { showMsg(err.message, 'err'); return false; }
  }

  function renderOpTasks() {
    const d = OP.data;
    const f = OP.tf;
    const k = OP.filter.q.toLowerCase();
    const order = (t) => (t.site === '*' ? -1 : (d.sites.find((s) => s.id === t.site) || { sort: 99999 }).sort);
    const list = d.tasks.filter((t) => {
      if (f.owner && t.owner !== f.owner) return false;
      if (f.status === 'open' && opDone(t)) return false;
      if (f.status === 'done' && !opDone(t)) return false;
      if (k && ![t.title, t.note, (d.sites.find((s) => s.id === t.site) || {}).name].join(' ').toLowerCase().includes(k)) return false;
      return true;
    }).sort((a, b) => order(a) - order(b) || (a.sort - b.sort));
    const ul = q('#opTasks');
    ul.innerHTML = list.length ? list.map((t, i) => opTaskRow(t, true, i > 0 && list[i - 1].site === t.site)).join('') : '<li class="acc-empty">조건에 맞는 할 일이 없습니다.</li>';
    opBindTasks(ul);
  }

  qa('#opFilter .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#opFilter .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    OP.filter.f = b.dataset.f; renderOps();
  }));
  qa('#opOwner .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#opOwner .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    OP.tf.owner = b.dataset.o; if (OP.data) renderOpTasks();
  }));
  qa('#opStatus .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#opStatus .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    OP.tf.status = b.dataset.s; if (OP.data) renderOpTasks();
  }));
  q('#opTier').addEventListener('change', (e) => { OP.filter.tier = e.target.value; renderOps(); });
  q('#opCluster').addEventListener('change', (e) => { OP.filter.cluster = e.target.value; renderOps(); });
  q('#opState').addEventListener('change', (e) => { OP.filter.state = e.target.value; renderOps(); });
  let opTimer;
  q('#opSearch').addEventListener('input', (e) => { clearTimeout(opTimer); opTimer = setTimeout(() => { OP.filter.q = e.target.value.trim(); renderOps(); }, 200); });
  q('#opAddOpen').addEventListener('click', () => { const f = q('#opAdd'); f.hidden = !f.hidden; if (!f.hidden) f.title.focus(); });
  q('#opAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (await opCreateTask({ site: f.site.value, kind: f.kind.value, title: f.title.value.trim(), owner: f.owner.value, due: f.due.value })) { f.reset(); f.hidden = true; }
  });

  q('#opCheck').addEventListener('click', async () => {
    if (!OP.data) return;
    const btn = q('#opCheck');
    const targets = opShownSites().filter((s) => s.url);
    if (!targets.length) { showMsg('점검할 사이트가 없습니다.', 'info'); return; }
    btn.disabled = true;
    try {
      for (let i = 0; i < targets.length; i += 8) {
        btn.textContent = `점검 중 ${Math.min(i + 8, targets.length)}/${targets.length}`;
        const r = await api('sites/check', { method: 'POST', body: { ids: targets.slice(i, i + 8).map((s) => s.id) } });
        r.results.forEach((x) => { const s = OP.data.sites.find((y) => y.id === x.id); if (s) Object.assign(s, { chk_at: r.at, chk_code: x.code, chk_ms: x.ms, chk_note: x.note }, x.pages ? { pages: x.pages } : {}); });
        renderOps();
      }
      const bad = targets.filter((s) => !opOk(s)).length;
      showMsg(bad ? `접속 점검을 마쳤습니다. ${bad}곳에 문제가 있습니다.` : '접속 점검을 마쳤습니다. 모두 정상입니다.', bad ? 'err' : 'ok');
    } catch (err) { showMsg(err.message, 'err'); }
    btn.disabled = false; btn.textContent = '접속 점검';
  });

  q('#opSeo').addEventListener('click', async () => {
    if (!OP.data) return;
    const btn = q('#opSeo');
    const targets = opShownSites().filter((s) => s.url && s.stage !== '내부용');
    if (!targets.length) { showMsg('점검할 사이트가 없습니다.', 'info'); return; }
    btn.disabled = true;
    let bad = 0; let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      btn.textContent = `검색 점검 ${i + 1}/${targets.length}`;
      try { const r = await opSeoRun(targets[i].id); if (r && r.flags.length) bad++; } catch (_) { failed++; }
      renderOps();
    }
    btn.disabled = false; btn.textContent = '검색 점검';
    showMsg(`검색 점검을 마쳤습니다. 문제가 있는 곳 ${bad}곳${failed ? ` · 점검하지 못한 곳 ${failed}곳` : ''}.`, bad || failed ? 'err' : 'ok');
  });

  q('#opCsv').addEventListener('click', () => {
    if (!OP.data) { showMsg('먼저 운영 현황을 불러와 주세요.', 'info'); return; }
    const rows = opShownSites().map((s) => {
      const x = opSite(s);
      const tr = x.tr || {};
      return [s.cluster, s.name, s.url, s.stage, s.ops, s.chk_at ? (opOk(s) ? '정상' : (s.chk_note || '오류')) : '미점검', tr.pv7 || 0, s.inquiry_via, x.fresh,
        ['naver', 'google', 'bing'].map((k) => (s[k] ? '○' : '×')).join('/'), x.open.filter((t) => t.owner !== 'Claude').map((t) => t.title).join(' / '),
        x.open.filter((t) => t.owner === 'Claude').map((t) => t.title).join(' / '), s.note, s.repo ? 'https://github.com/' + s.repo : '', [s.cf_kind, s.cf_project].filter(Boolean).join(' · '), s.storage, s.entity];
    });
    downloadCsv(`운영현황_${todayKST()}.csv`, [['사업군', '사이트', '주소', '단계', '운영 현황', '접속', '방문 7일', '문의 받는 방식', '회신 전 문의', '검색 N/G/B', '대표님 할 일', 'Claude 할 일', '특이사항', 'GitHub', 'Cloudflare', '저장소', '운영 법인'], ...rows]);
  });

  /* =========================================================
     전체 문의 — 각 사이트에 들어온 고객 문의를 한 화면에서
     - 문의 내용은 각 사이트 DB에서 읽기만 한다
     - 확인·회신 표시와 메모는 이 관리자에 따로 남긴다 (각 사이트의 상태 값은 바뀌지 않음)
     ========================================================= */
  const LD = { data: null, filter: { f: '', site: '', q: '' }, open: null };
  const ldKey = (r) => r.key || `${r.site}|${r.label}|${r.ref}`;
  const ldDate = (ms) => (ms ? KST(new Date(ms).toISOString()) : '날짜 없음');
  const LD_STATES = [['seen', '확인함'], ['replied', '회신함'], ['done', '처리 완료'], ['hold', '보류'], ['spam', '스팸·무관']];
  const ldReplied = (r) => r.mark && (r.mark.state === 'replied' || r.mark.state === 'done');

  async function loadLeads() {
    const list = q('#ldList');
    try {
      const d = await api('leads');
      LD.data = d;
      const sel = q('#ldSite');
      const seen = [];
      d.sources.forEach((s) => { if (!seen.find((x) => x.site === s.site)) seen.push(s); });
      seen.sort((x, y) => String(x.siteName).localeCompare(String(y.siteName), 'ko'));
      sel.innerHTML = '<option value="">모든 사이트</option>' + seen.map((s) => `<option value="${esc(s.site)}"${s.site === LD.filter.site ? ' selected' : ''}>${esc(s.siteName)}</option>`).join('');
      renderLeads();
    } catch (err) {
      showMsg(err.message, 'err');
      if (!LD.data) list.innerHTML = `<li class="acc-empty">${esc(err.message)}</li>`;
    }
  }

  qa('#ldFilter .f-chip').forEach((b) => b.addEventListener('click', () => {
    qa('#ldFilter .f-chip').forEach((x) => x.classList.toggle('is-active', x === b));
    LD.filter.f = b.dataset.f;
    renderLeads();
  }));
  q('#ldSite').addEventListener('change', (e) => { LD.filter.site = e.target.value; renderLeads(); });
  let ldTimer;
  q('#ldSearch').addEventListener('input', (e) => { clearTimeout(ldTimer); ldTimer = setTimeout(() => { LD.filter.q = e.target.value.trim(); renderLeads(); }, 200); });

  function shownLeads() {
    const d = LD.data;
    const f = LD.filter;
    const k = f.q.toLowerCase();
    const weekAgo = d.now - 7 * 86400 * 1000;
    return d.items.filter((r) => {
      if (f.site && r.site !== f.site) return false;
      if (f.f === 'new' && (!r.isNew || r.soft)) return false;
      if (f.f === 'replied' && !ldReplied(r)) return false;
      if (f.f === 'memo' && !(r.mark && r.mark.memo)) return false;
      if (f.f === '7' && r.at < weekAgo) return false;
      if (k && ![r.siteName, r.kind, r.name, r.contact, r.text, r.ref, r.mark ? r.mark.memo : ''].join(' ').toLowerCase().includes(k)) return false;
      return true;
    });
  }

  function leadContactLinks(r) {
    const out = [];
    const email = (r.contact.match(/[^\s@,·]+@[^\s@,·]+\.[^\s@,·]{2,}/) || [])[0];
    const phone = ((r.contact.match(/\+?\d[\d\- ]{7,14}\d/) || [])[0] || '').replace(/[^\d+]/g, '');
    if (phone) { out.push(`<a href="tel:${esc(phone)}" data-ld-reply>전화</a>`); out.push(`<a href="sms:${esc(phone)}" data-ld-reply>문자</a>`); }
    if (email) {
      const subject = `Re: ${r.siteName} 문의 주셔서 감사합니다`;
      const body = `${r.name ? r.name + '님, ' : ''}안녕하세요. ${r.siteName}입니다.\n\n남겨 주신 문의 잘 받았습니다.\n\n\n\n----- 보내 주신 문의 (${ldDate(r.at)}) -----\n${r.text}`;
      out.push(`<a href="mailto:${esc(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}" data-ld-reply>메일로 답장</a>`);
    }
    if (r.contact) out.push('<button type="button" class="link-btn" data-ld-copy>연락처 복사</button>');
    if (!out.length) out.push('<span class="acc-help">남긴 연락처가 없습니다.</span>');
    return out.join('');
  }

  function ldMarkTag(r) {
    if (r.mark) {
      const cls = r.mark.state === 'replied' || r.mark.state === 'done' ? 'is-on' : r.mark.state === 'spam' ? 'is-off' : 'is-ad';
      return `<span class="adm-tag ${cls}">${esc(r.mark.label)}${r.mark.state === 'replied' && r.mark.repliedAt ? ' ' + esc(KST(new Date(r.mark.repliedAt).toISOString()).slice(5, 10)) : ''}</span>`;
    }
    return r.isNew && !r.soft ? '<span class="adm-tag is-ad">회신 전</span>' : '';
  }

  async function ldSaveMark(r, state, memo) {
    try {
      const res = await api('leads/mark', { method: 'POST', body: { key: ldKey(r), state, memo: memo == null ? (r.mark ? r.mark.memo : '') : memo } });
      r.mark = res.mark;
      r.isNew = r.mark ? r.mark.state === 'seen' || r.mark.state === 'hold' : r.isNew;
      return true;
    } catch (err) { showMsg(err.message, 'err'); return false; }
  }

  function renderLeads() {
    const d = LD.data;
    if (!d) return;
    const real = d.items.filter((r) => !r.soft);
    const day = 86400 * 1000;
    const todayStart = new Date(todayKST() + 'T00:00:00+09:00').getTime();
    const okSites = new Set(d.sources.filter((s) => s.ok).map((s) => s.site));
    const allSites = new Set(d.sources.map((s) => s.site));
    const fresh = real.filter((r) => r.isNew);
    const replied30 = real.filter((r) => r.mark && r.mark.repliedAt && r.mark.repliedAt >= d.now - 30 * day).length;
    q('#cntLeads').textContent = fresh.length ? String(fresh.length) : '';
    const tiles = [
      [fmtN(fresh.length), '회신 전', '아직 표시가 없거나 확인만 한 문의'],
      [fmtN(real.filter((r) => r.at >= todayStart).length), '오늘 들어온 문의', `어제 ${fmtN(real.filter((r) => r.at >= todayStart - day && r.at < todayStart).length)}건`],
      [fmtN(real.filter((r) => r.at >= d.now - 7 * day).length), '최근 7일', `최근 30일 ${fmtN(real.filter((r) => r.at >= d.now - 30 * day).length)}건`],
      [fmtN(replied30), '최근 30일 회신', `연결된 사이트 ${okSites.size}/${allSites.size}곳`]
    ];
    q('#ldTiles').innerHTML = tiles.map(([n, label, foot]) => `<li><button type="button" tabindex="-1"><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${esc(label)}</span><span class="adm-kpi-foot">${esc(foot)}</span></button></li>`).join('');

    const rows = shownLeads();
    const nt = d.notify;
    const notifyLine = nt ? ` · 메일 알림: 매시간 확인, 마지막 ${esc(KST(nt.at).slice(5))}${nt.baseline ? ' (첫 확인)' : ` · 새 문의 ${fmtN(nt.sent)}통 보냄`}${nt.failed && nt.failed.length ? ` · <span class="op-warn">보내지 못함 ${nt.failed.length}건</span>` : ''}` : ' · 메일 알림: 아직 확인 전';
    q('#ldInfo').innerHTML = `<strong>${fmtN(rows.length)}건</strong> 보는 중 · 사이트마다 최근 ${d.per}건까지 불러옵니다 · 문의를 열면 '확인함', 연락한 뒤 '회신함'을 누르면 회신 전 목록에서 빠집니다${notifyLine}`;

    /* 사이트별 현황 */
    const bySite = [];
    d.sources.forEach((s) => {
      let g = bySite.find((x) => x.site === s.site);
      if (!g) { g = { site: s.site, name: s.siteName, url: s.url, count: 0, fresh: 0, bad: [], full: false, central: false, labels: [] }; bySite.push(g); }
      g.count += s.count; g.fresh += s.fresh; g.full = g.full || s.full; g.central = g.central || Boolean(s.central);
      if (!g.labels.includes(s.label)) g.labels.push(s.label);
      if (!s.ok) g.bad.push(`${s.label}: ${s.error}`);
    });
    bySite.sort((x, y) => (y.fresh - x.fresh) || (y.count - x.count));
    const problem = bySite.filter((g) => g.bad.length);
    q('#ldSources').innerHTML = `
      <details class="ld-src"${LD.srcOpen ? ' open' : ''}><summary>사이트별 현황 <small>${bySite.length}곳 연결 · ${bySite.filter((g) => g.fresh).length}곳에 회신 전 문의${problem.length ? ` · 확인이 필요한 곳 ${problem.length}곳` : ''}</small></summary>
        <ul class="ld-src-list">${bySite.map((g) => `<li title="${esc(g.labels.join(' · '))}${g.bad.length ? '\n' + esc(g.bad.join('\n')) : ''}"><button type="button" class="link-btn" data-ld-site="${esc(g.site)}">${esc(g.name)}</button><span>${g.bad.length && !g.count ? esc(g.bad[0].split(': ').slice(1).join(': ')) : `최근 ${fmtN(g.count)}${g.full ? '+' : ''}건`}${g.central ? ' · 최시준 접수' : ''}</span>${g.fresh ? `<span class="adm-tag is-ad">회신 전 ${g.fresh}</span>` : ''}${g.url ? `<a href="${esc(g.url)}/admin" target="_blank" rel="noopener">관리자 ↗</a>` : ''}</li>`).join('')}</ul>
        <p class="acc-help">'연결 전'은 그 사이트의 저장소가 이 관리자에 아직 연결되지 않은 것이고, '아직 문의 표가 없음'은 그 사이트에 첫 문의가 들어오기 전이라는 뜻입니다. 문의 저장소가 없는 사이트(플레이션·프롭피어·BFC·몽크루·연결점)는 이 홈페이지가 대신 받아 '최시준 접수'로 표시합니다.</p>
      </details>`;
    const det = q('.ld-src');
    if (det) det.addEventListener('toggle', () => { LD.srcOpen = det.open; });
    qa('[data-ld-site]').forEach((b) => b.addEventListener('click', () => { LD.filter.site = b.dataset.ldSite; q('#ldSite').value = LD.filter.site; renderLeads(); }));

    const list = q('#ldList');
    list.innerHTML = rows.length ? rows.slice(0, 300).map((r) => {
      const open = LD.open === ldKey(r);
      const text = r.text || '';
      const memo = r.mark ? r.mark.memo : '';
      const where = r.central
        ? '이 홈페이지가 대신 받은 문의입니다 (그 사이트 관리자에는 없음)'
        : `<a href="${esc(r.siteUrl || '')}/admin" target="_blank" rel="noopener">${esc(r.siteName)} 관리자에서 보기 ↗</a>`;
      return `
      <li class="adm-row ld-row${open ? ' is-open' : ''}${ldReplied(r) ? ' is-done' : ''}" tabindex="0" data-key="${esc(ldKey(r))}">
        <div class="acc-item-head"><span class="adm-tag is-site">${esc(r.siteName)}</span>${r.kind ? `<span class="adm-tag">${esc(r.kind)}</span>` : ''}${ldMarkTag(r)}${r.status ? `<span class="adm-tag is-off" title="그 사이트에 저장된 상태">사이트: ${esc(r.status)}</span>` : ''}<span class="acc-date mono">${esc(ldDate(r.at))}${r.at ? ' · ' + ago(new Date(r.at).toISOString()) : ''}</span></div>
        <p class="adm-row-title"><strong>${esc(r.name || '(이름 없음)')}</strong><span>${esc(r.contact)}</span></p>
        ${open ? `<div class="adm-message ld-text">${esc(text) || '<em>내용 없음</em>'}</div>
          <p class="adm-contact">${leadContactLinks(r)}</p>
          <div class="ld-mark" role="group" aria-label="처리 표시">${LD_STATES.map(([v, label]) => `<button type="button" class="f-chip${r.mark && r.mark.state === v ? ' is-active' : ''}" data-ld-state="${v}">${label}</button>`).join('')}${r.mark ? '<button type="button" class="link-btn" data-ld-state="">표시 지우기</button>' : ''}</div>
          <div class="ld-memo"><textarea rows="2" maxlength="2000" placeholder="메모 (통화 내용, 견적 금액, 다음 연락일 등)" data-ld-memo>${esc(memo)}</textarea><button type="button" class="btn btn-sm btn-line" data-ld-memo-save>메모 저장</button></div>
          <p class="acc-help ld-foot">${esc(r.label)} · 접수번호 ${esc(r.ref)}${r.mark && r.mark.repliedAt ? ` · 회신 ${esc(ldDate(r.mark.repliedAt))}` : ''} · ${where}</p>`
          : `<p class="adm-row-text ld-clip">${esc(text.slice(0, 140))}${text.length > 140 ? '…' : ''}</p>${memo ? `<p class="ld-memo-line">메모 · ${esc(memo.slice(0, 120))}</p>` : ''}`}
      </li>`;
    }).join('') + (rows.length > 300 ? `<li class="acc-empty">${fmtN(rows.length - 300)}건이 더 있습니다. 사이트를 고르거나 검색해 좁혀 보세요.</li>` : '')
      : `<li class="acc-empty">${d.items.length ? '조건에 맞는 문의가 없습니다.' : '아직 불러온 문의가 없습니다. 사이트별 현황을 열어 연결 상태를 확인해 주세요.'}</li>`;
    qa('.ld-row', list).forEach((li) => {
      const toggle = (e) => {
        if (e.target.closest('a, button, textarea')) return;
        LD.open = LD.open === li.dataset.key ? null : li.dataset.key;
        const r = LD.open ? d.items.find((x) => ldKey(x) === LD.open) : null;
        renderLeads();
        if (r && !r.mark) ldSaveMark(r, 'seen', '').then((ok) => { if (ok) renderLeads(); });   // 열어 본 문의는 '확인함'
      };
      li.addEventListener('click', toggle);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === li) toggle(e); });
    });
    const cur = LD.open ? d.items.find((x) => ldKey(x) === LD.open) : null;
    if (!cur) return;
    const copy = q('[data-ld-copy]', list);
    if (copy) copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cur.contact); showMsg('연락처를 복사했습니다.', 'ok'); } catch (_) { showMsg(cur.contact, 'info'); }
    });
    qa('[data-ld-reply]', list).forEach((a) => a.addEventListener('click', () => {
      if (!ldReplied(cur)) showMsg("연락을 마치면 아래 '회신함'을 눌러 주세요. 회신 전 목록에서 빠집니다.", 'info');
    }));
    qa('[data-ld-state]', list).forEach((b) => b.addEventListener('click', async () => {
      const memoEl = q('[data-ld-memo]', list);
      if (await ldSaveMark(cur, b.dataset.ldState, memoEl ? memoEl.value.trim() : '')) {
        showMsg(b.dataset.ldState ? `'${b.textContent}'(으)로 표시했습니다.` : '표시를 지웠습니다.', 'ok');
        renderLeads();
      }
    }));
    const save = q('[data-ld-memo-save]', list);
    if (save) save.addEventListener('click', async () => {
      const memo = q('[data-ld-memo]', list).value.trim();
      if (await ldSaveMark(cur, (cur.mark && cur.mark.state) || 'seen', memo)) { showMsg('메모를 저장했습니다.', 'ok'); renderLeads(); }
    });
  }

  q('#ldCsv').addEventListener('click', () => {
    if (!LD.data) { showMsg('먼저 문의를 불러와 주세요.', 'info'); return; }
    const rows = shownLeads();
    if (!rows.length) { showMsg('내려받을 문의가 없습니다.', 'info'); return; }
    downloadCsv(`전체문의_${todayKST()}.csv`, [
      ['접수일시', '사이트', '구분', '유형', '이름·소속', '연락처', '내용', '사이트 상태', '처리 표시', '회신일', '메모', '접수번호'],
      ...rows.map((r) => [r.at ? ldDate(r.at) : '', r.siteName, r.label, r.kind, r.name, r.contact, r.text, r.status,
        r.mark ? r.mark.label : (r.isNew && !r.soft ? '회신 전' : ''), r.mark && r.mark.repliedAt ? ldDate(r.mark.repliedAt) : '', r.mark ? r.mark.memo : '', r.ref])
    ]);
  });

  /* =========================================================
     KPI 추이 — 일별 · 주별 · 월별 그래프와 전날(전주 · 전달) 대비 증감
     - 마지막 기간(오늘 · 이번 주 · 이번 달)은 진행 중이라, 완료된 기간끼리 비교하고
       진행 중인 기간은 직전 기간의 '같은 시점까지' 값과 따로 비교한다
     - 운영 현황에서 완료한 할 일을 날짜에 표시해 한 일과 숫자 변화를 함께 본다
     ========================================================= */
  const TR_M = [
    { k: 'v', label: '방문자', unit: '명', hint: '사이트마다 다녀간 사람 수를 더한 값입니다. 두 사이트를 본 사람은 두 번 셉니다.' },
    { k: 'pv', label: '페이지뷰', unit: '회', hint: '페이지를 연 횟수입니다.' },
    { k: 'se', label: '검색 유입', unit: '회', hint: '네이버·구글·다음·AI 검색에서 들어와 시작된 방문입니다.' },
    { k: 'inq', label: '문의', unit: '건', hint: '각 사이트 문의 저장소와 대신 받은 문의를 접수 시각 기준으로 셉니다.' },
    { k: 'book', label: '예약 이동', unit: '회', hint: '예약 버튼·예약 링크를 누른 횟수입니다.' },
    { k: 'ct', label: '전화·카톡', unit: '회', hint: '전화·카카오톡·메일 링크를 누른 횟수입니다.' }
  ];
  const TR_BY = Object.fromEntries(TR_M.map((m) => [m.k, m]));
  const TR_WORD = {
    day: { last: '어제', before: '그제', vs: '전날', curLong: '오늘 지금까지', cut: '어제 같은 시각', avgN: 7, avg: '최근 7일 평균', name: '일별', per: '일' },
    week: { last: '지난주', before: '그 전 주', vs: '전주', curLong: '이번 주 지금까지', cut: '지난주 같은 시점', avgN: 4, avg: '최근 4주 평균', name: '주별', per: '주' },
    month: { last: '지난달', before: '그 전 달', vs: '전달', curLong: '이번 달 지금까지', cut: '지난달 같은 시점', avgN: 3, avg: '최근 3개월 평균', name: '월별', per: '개월' }
  };
  const TR_UP = '#127A4A';
  const TR_DOWN = '#C2341A';
  const TR_AVG = '#898781';
  const TR = { unit: 'day', n: 30, scope: 'all', metric: 'v', sort: 'value', data: null };
  try {
    const saved = JSON.parse(localStorage.getItem('csj_trend') || '{}');
    if (TR_WORD[saved.unit]) TR.unit = saved.unit;
    if (Number(saved.n)) TR.n = Number(saved.n);
    if (typeof saved.scope === 'string') TR.scope = saved.scope;
    if (TR_BY[saved.metric]) TR.metric = saved.metric;
  } catch (_) { /* ignore */ }
  const trSave = () => { try { localStorage.setItem('csj_trend', JSON.stringify({ unit: TR.unit, n: TR.n, scope: TR.scope, metric: TR.metric })); } catch (_) { /* ignore */ } };

  const trHas = (s, m) => s.s[m].some((x) => x != null);
  const trAny = (s) => TR_M.some((m) => trHas(s, m.k));
  function trSum(list, m, n) {
    const out = Array(n).fill(null);
    list.forEach((s) => s.s[m].forEach((x, i) => { if (x != null) out[i] = (out[i] || 0) + x; }));
    return out;
  }
  const trPrevSum = (list, m) => list.reduce((a, s) => a + (trHas(s, m) ? (s.prev[m] || 0) : 0), 0);
  function trScopeSites(d, scope = TR.scope) {
    if (scope === 'all') return d.sites.filter(trAny);
    if (scope === 'focus') return d.sites.filter((s) => s.tier === '주력' && trAny(s));
    return d.sites.filter((s) => s.id === scope);
  }
  function trScopeName(d, scope = TR.scope) {
    if (scope === 'all') return '전체 사이트';
    if (scope === 'focus') return '주력 사이트';
    const s = d.sites.find((x) => x.id === scope);
    return s ? s.name : '사이트';
  }
  function trLabel(unit, key, long) {
    if (unit === 'month') { const [y, m] = key.split('-'); return long ? `${y}년 ${Number(m)}월` : `${Number(m)}월`; }
    const [, mm, dd] = key.split('-');
    const md = `${Number(mm)}/${Number(dd)}`;
    if (unit === 'week') {
      if (!long) return md;
      const e = new Date(Date.parse(key + 'T00:00:00Z') + 6 * 86400000);
      return `${md}(월) ~ ${e.getUTCMonth() + 1}/${e.getUTCDate()}(일)`;
    }
    return long ? `${md} (${DAYS[new Date(key + 'T12:00:00Z').getUTCDay()]})` : md;
  }
  /* 증감: { cls, text } — 화살표와 부호로 방향을 같이 보여 준다 (색만으로 구분하지 않음) */
  function trDelta(cur, prev, unit = '') {
    if (cur == null || prev == null) return { cls: 'is-none', text: '비교할 기록 없음', d: null };
    const d = cur - prev;
    if (!d) return { cls: 'is-flat', text: '변화 없음', d: 0 };
    const pct = prev ? ` (${d > 0 ? '+' : '−'}${fmtPct(Math.abs(d) / prev, Math.abs(d) / prev < 0.1 ? 1 : 0)})` : '';
    return { cls: d > 0 ? 'is-up' : 'is-down', text: `${d > 0 ? '▲' : '▼'} ${fmtN(Math.abs(d))}${unit}${pct}`, d };
  }
  function trAvg(vals, end, k) {
    const xs = vals.slice(Math.max(0, end - k + 1), end + 1).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }
  const trRound = (x) => (x == null ? null : x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);

  /* 작은 추이선 — 축 없이 모양만 (마지막 진행 중 기간은 속이 빈 점) */
  function trSpark(vals, w = 120, h = 30) {
    const xs = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (xs.length < 2) return `<svg class="tr-spark-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"></svg>`;
    const max = Math.max(1, ...xs.map(([, v]) => v));
    const n = vals.length;
    const X = (i) => 2 + (i / (n - 1)) * (w - 6);
    const Y = (v) => h - 3 - (v / max) * (h - 7);
    const done = xs.filter(([i]) => i < n - 1);
    const line = done.map(([i, v], j) => `${j ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const last = xs[xs.length - 1];
    const prevPt = done[done.length - 1];
    const tail = last[0] === n - 1 && prevPt ? `<path d="M${X(prevPt[0]).toFixed(1)},${Y(prevPt[1]).toFixed(1)} L${X(last[0]).toFixed(1)},${Y(last[1]).toFixed(1)}" stroke="${C1}" stroke-width="1.5" stroke-dasharray="2 3" fill="none"/>` : '';
    const dot = last[0] === n - 1
      ? `<circle cx="${X(last[0])}" cy="${Y(last[1])}" r="2.6" fill="#fff" stroke="${C1}" stroke-width="1.5"/>`
      : `<circle cx="${X(last[0])}" cy="${Y(last[1])}" r="2.6" fill="${C1}"/>`;
    return `<svg class="tr-spark-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${line}" fill="none" stroke="${C1}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>${tail}${dot}</svg>`;
  }

  /* 한 지표 카드 (KPI 추이 · 대시보드 공용) */
  function trTile(d, list, m, opts = {}) {
    const W = TR_WORD[d.unit];
    const n = d.keys.length;
    const vals = trSum(list, m.k, n);
    const L = vals[n - 2]; const B = vals[n - 3]; const C = vals[n - 1];
    const has = vals.some((x) => x != null);
    const dl = trDelta(L, B, m.unit);
    const cut = trPrevSum(list, m.k);
    const dc = trDelta(C, has ? cut : null, '');
    const avg = trRound(trAvg(vals, n - 2, W.avgN));
    const da = avg != null && L != null && avg ? (L - avg) / avg : null;
    const body = has ? `
        <span class="tr-tile-num">${L == null ? '–' : fmtN(L)}<small>${esc(m.unit)}</small></span>
        <span class="tr-tile-delta ${dl.cls}">${esc(W.vs)} 대비 ${esc(dl.text)}</span>
        ${opts.compact ? '' : `<span class="tr-tile-sub">${esc(W.curLong)} <strong>${fmtN(C || 0)}</strong> · ${esc(W.cut)} ${fmtN(cut)}${dc.d ? ` <em class="${dc.cls}">${dc.d > 0 ? '+' : '−'}${fmtN(Math.abs(dc.d))}</em>` : ''}</span>
        ${avg != null ? `<span class="tr-tile-sub">${esc(W.avg)} ${fmtN(avg)}${da != null && Math.abs(da) >= 0.005 ? ` 대비 <em class="${da > 0 ? 'is-up' : 'is-down'}">${da > 0 ? '+' : '−'}${fmtPct(Math.abs(da), 0)}</em>` : ''}</span>` : ''}`}
        <span class="tr-tile-spark">${trSpark(vals, opts.compact ? 96 : 132, 30)}</span>`
      : '<span class="tr-tile-num is-empty">–</span><span class="tr-tile-sub">아직 기록이 없습니다</span>';
    const tag = opts.button ? 'button' : 'div';
    return `<li><${tag} ${opts.button ? `type="button" data-tr-metric="${m.k}" aria-pressed="${TR.metric === m.k}"` : ''} class="tr-tile${TR.metric === m.k && opts.button ? ' is-on' : ''}" title="${esc(m.hint)}">
        <span class="tr-tile-label">${esc(m.label)} <small>${esc(W.last)}</small></span>${body}
      </${tag}></li>`;
  }

  async function loadTrend() {
    const box = q('#trTiles');
    if (!TR.data) box.innerHTML = '<li class="acc-empty">불러오는 중…</li>';
    try {
      const d = await api(`trend?unit=${TR.unit}&n=${TR.n}`);
      TR.data = d;
      TR.n = d.n;
      if (!['all', 'focus'].includes(TR.scope) && !d.sites.some((s) => s.id === TR.scope)) TR.scope = 'all';
      renderTrend();
    } catch (err) {
      box.innerHTML = `<li class="acc-empty">${esc(err.message)}</li>`;
    }
  }

  function renderTrend() {
    const d = TR.data;
    if (!d) return;
    const W = TR_WORD[d.unit];
    const n = d.keys.length;
    qa('#trUnit [data-unit]').forEach((b) => b.classList.toggle('is-active', b.dataset.unit === d.unit));
    q('#trN').innerHTML = d.opts.map((x) => `<button class="f-chip${x === d.n ? ' is-active' : ''}" type="button" data-n="${x}">${x}${esc(W.per)}</button>`).join('');

    /* 보기 범위 */
    const sel = q('#trScope');
    const groups = {};
    d.sites.filter(trAny).forEach((s) => { (groups[s.cluster || '기타'] = groups[s.cluster || '기타'] || []).push(s); });
    sel.innerHTML = '<option value="all">전체 사이트 합계</option><option value="focus">주력 사이트 합계</option>'
      + Object.keys(groups).sort().map((g) => `<optgroup label="${esc(g.replace(/^\d+\s*/, ''))}">${groups[g].map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
    sel.value = TR.scope;
    if (sel.value !== TR.scope) { TR.scope = 'all'; sel.value = 'all'; }

    const list = trScopeSites(d);
    const name = trScopeName(d);
    const lastEnd = d.unit === 'week' ? new Date(Date.parse(d.keys[n - 1] + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10) : d.keys[n - 1];
    const span = d.unit === 'month' ? `${trLabel('month', d.keys[0], true)} ~ ${trLabel('month', d.keys[n - 1], true)}` : `${trLabel('day', d.keys[0], true)} ~ ${trLabel('day', lastEnd, true)}`;
    q('#trInfo').innerHTML = `<strong>${esc(name)}</strong> · ${esc(span)}`
      + ` · 마지막 칸(${esc(W.curLong.replace(' 지금까지', ''))})은 진행 중${d.firstDay ? ` · 방문 기록 시작 ${esc(d.firstDay.replace(/-/g, '.'))}` : ''}`;

    q('#trTiles').innerHTML = TR_M.map((m) => trTile(d, list, m, { button: true })).join('');
    q('#trBrief').innerHTML = trBrief(d, list, name);
    trRenderChart();
    trRenderTable();
  }

  /* 한눈에 읽는 요약 문장 */
  function trBrief(d, list, name) {
    const W = TR_WORD[d.unit];
    const n = d.keys.length;
    const v = trSum(list, 'v', n); const inq = trSum(list, 'inq', n); const se = trSum(list, 'se', n);
    const parts = [];
    if (v[n - 2] != null && v[n - 3] == null) {
      parts.push(`${W.last} ${esc(name)} 방문자는 <strong>${fmtN(v[n - 2])}명</strong>입니다 (${W.before}는 방문 기록 전).`);
    } else if (v[n - 2] != null) {
      const dv = v[n - 2] - v[n - 3];
      const pct = v[n - 3] ? ` (${dv >= 0 ? '+' : '−'}${fmtPct(Math.abs(dv) / v[n - 3], 0)})` : '';
      parts.push(`${W.last} ${esc(name)} 방문자는 <strong>${fmtN(v[n - 2])}명</strong>으로, ${W.vs}보다 `
        + (dv ? `<strong class="${dv > 0 ? 'is-up' : 'is-down'}">${fmtN(Math.abs(dv))}명${pct} ${dv > 0 ? '늘었습니다' : '줄었습니다'}</strong>.` : '변화가 없었습니다.'));
    }
    if (inq[n - 2] != null) parts.push(`문의는 <strong>${fmtN(inq[n - 2])}건</strong>${inq[n - 3] != null ? `(${W.vs} ${fmtN(inq[n - 3])}건)` : ''}${se[n - 2] != null ? `, 검색으로 시작된 방문은 <strong>${fmtN(se[n - 2])}회</strong>` : ''}입니다.`);
    if (list.length > 1) {
      const mv = list.filter((s) => s.s.v[n - 2] != null && s.s.v[n - 3] != null).map((s) => ({ s, d: s.s.v[n - 2] - s.s.v[n - 3] }));
      const up = mv.filter((x) => x.d > 0).sort((a, b) => b.d - a.d)[0];
      const dn = mv.filter((x) => x.d < 0).sort((a, b) => a.d - b.d)[0];
      if (up || dn) parts.push(`방문이 가장 많이 ${up ? `늘어난 곳은 ${esc(up.s.name)}(+${fmtN(up.d)}명)` : ''}${up && dn ? ', 가장 많이 ' : ''}${dn ? `줄어든 곳은 ${esc(dn.s.name)}(−${fmtN(Math.abs(dn.d))}명)` : ''}입니다.`);
    }
    if (v[n - 1] != null) {
      const cut = trPrevSum(list, 'v');
      parts.push(`${W.curLong} ${fmtN(v[n - 1])}명이 다녀갔습니다 (${W.cut} ${fmtN(cut)}명).`);
    }
    return parts.length ? parts.join(' ') : '아직 이 범위에 쌓인 기록이 없습니다.';
  }

  /* 큰 그래프 — 일별은 선(+ 이동평균), 주별 · 월별은 막대 */
  function trRenderChart() {
    const d = TR.data;
    const box = q('#trChart');
    if (!d || !box) return;
    const m = TR_BY[TR.metric];
    const W = TR_WORD[d.unit];
    const list = trScopeSites(d);
    const ids = new Set(list.map((s) => s.id));
    const all = trSum(list, m.k, d.keys.length);
    const cut = trPrevSum(list, m.k);
    const allAvg = d.unit === 'day' ? all.map((_, i) => (i >= all.length - 1 ? null : trRound(trAvg(all, i, 7)))) : null;
    /* 기록이 시작되기 전 기간은 그래프에서 덜어낸다 (최소 6칸은 남김) */
    const firstIdx = all.findIndex((x) => x != null);
    const start = firstIdx < 0 ? 0 : Math.max(0, Math.min(firstIdx, all.length - 6));
    const keys = d.keys.slice(start);
    const n = keys.length;
    const vals = all.slice(start);
    const avg = allAvg ? allAvg.slice(start) : null;
    const marks = {};
    d.marks.filter((x) => ids.has(x.site)).forEach((x) => { (marks[x.k] = marks[x.k] || []).push(x); });
    const siteName = Object.fromEntries(d.sites.map((s) => [s.id, s.name]));

    q('#trTitle').innerHTML = `${esc(m.label)} <small>${esc(W.name)} · ${esc(trScopeName(d))}</small>`;
    q('#trLegend').innerHTML = d.unit === 'day'
      ? `<li><span class="kpi-key" style="background:${C1}"></span>${esc(m.label)}</li><li><span class="kpi-key is-dash" style="--c:${TR_AVG}"></span>7일 평균</li><li><span class="tr-mark-key" aria-hidden="true"></span>완료한 할 일</li>`
      : `<li><span class="kpi-key is-box" style="background:${C1}"></span>${esc(m.label)}</li><li><span class="kpi-key is-box is-partial" style="--c:${C1}"></span>진행 중</li><li><span class="tr-mark-key" aria-hidden="true"></span>완료한 할 일</li>`;

    if (!vals.some((x) => x != null)) { box.innerHTML = '<p class="acc-empty">이 범위에는 아직 기록이 없습니다.</p>'; return; }

    const Wd = Math.max(280, box.clientWidth || 600);
    const H = Wd < 520 ? 230 : 270;
    const pad = { l: 42, r: 16, t: 18, b: 46 };
    const iw = Wd - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const maxV = Math.max(1, ...vals.filter((x) => x != null), ...(avg || []).filter((x) => x != null));
    const step = niceStep(maxV, 4);
    const top = Math.ceil(maxV / step) * step;
    const bars = d.unit !== 'day';
    const slot = iw / n;
    const x = (i) => (bars ? pad.l + slot * (i + 0.5) : pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw));
    const y = (v) => pad.t + ih - (v / top) * ih;
    const fmtTick = (v) => (v >= 10000 ? Math.round(v / 1000) + 'K' : fmtN(v));
    let grid = '';
    for (let v = 0; v <= top + 0.001; v += step) {
      grid += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'kpi-axis' : 'kpi-grid'}"/>`;
      grid += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="kpi-tick">${fmtTick(v)}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / (Wd < 520 ? 5 : bars ? 12 : 8)));
    let xt = '';
    keys.forEach((k, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      if (i !== n - 1 && n - 1 - i < every / 2) return;
      xt += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="kpi-tick">${esc(i === n - 1 ? (d.unit === 'day' ? '오늘' : d.unit === 'week' ? '이번 주' : '이번 달') : trLabel(d.unit, k))}</text>`;
    });
    /* 완료한 할 일 표시 — 그래프 아래 줄 */
    const markY = pad.t + ih + 15;
    const mk = keys.map((k, i) => (marks[k] ? `<g class="tr-mark"><rect x="${x(i) - 4.5}" y="${markY - 4.5}" width="9" height="9" rx="2" transform="rotate(45 ${x(i)} ${markY})"/>${marks[k].length > 1 ? `<text x="${x(i) + 8}" y="${markY + 4}" class="tr-mark-n">${marks[k].length}</text>` : ''}</g>` : '')).join('');

    let plot = '';
    if (bars) {
      const bw = Math.max(4, Math.min(36, slot * 0.62));
      plot = vals.map((v, i) => {
        if (v == null) return '';
        const x0 = x(i) - bw / 2; const y0 = y(v); const base = y(0);
        const r = Math.min(4, bw / 2, base - y0);
        const p = v > 0 ? `M${x0},${base} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${base} Z` : '';
        const partial = i === n - 1;
        return p ? `<path d="${p}" fill="${C1}" ${partial ? 'fill-opacity="0.32" stroke="' + C1 + '" stroke-width="1.5" stroke-dasharray="3 3"' : ''}/>` : '';
      }).join('');
      const L = n - 2;
      if (vals[L] != null) plot += `<text x="${x(L)}" y="${y(vals[L]) - 7}" text-anchor="middle" class="kpi-endlabel">${fmtN(vals[L])}</text>`;
    } else {
      const seg = (arr, upto) => {
        let out = ''; let pen = false;
        arr.forEach((v, i) => {
          if (i > upto) return;
          if (v == null) { pen = false; return; }
          out += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
          pen = true;
        });
        return out;
      };
      const solid = seg(vals, n - 2);
      const a = avg ? seg(avg, n - 2) : '';
      const L = n - 2;
      const tail = vals[n - 1] != null && vals[L] != null ? `<path d="M${x(L)},${y(vals[L])} L${x(n - 1)},${y(vals[n - 1])}" fill="none" stroke="${C1}" stroke-width="2" stroke-dasharray="3 4"/>` : '';
      const area = solid ? `${solid}L${x(L).toFixed(1)},${y(0)} L${x(vals.findIndex((v) => v != null)).toFixed(1)},${y(0)} Z` : '';
      plot = `${area ? `<path d="${area}" fill="${C1}" opacity="0.07"/>` : ''}
        ${a ? `<path d="${a}" fill="none" stroke="${TR_AVG}" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>` : ''}
        <path d="${solid}" fill="none" stroke="${C1}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${tail}
        ${vals[L] != null ? `<circle cx="${x(L)}" cy="${y(vals[L])}" r="4" fill="${C1}" stroke="#fff" stroke-width="2"/><text x="${x(L)}" y="${y(vals[L]) - 10}" text-anchor="middle" class="kpi-endlabel">${fmtN(vals[L])}</text>` : ''}
        ${vals[n - 1] != null ? `<circle cx="${x(n - 1)}" cy="${y(vals[n - 1])}" r="4" fill="#fff" stroke="${C1}" stroke-width="2"/>` : ''}`;
    }

    box.innerHTML = `
      <svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" aria-hidden="true">
        ${grid}${xt}${plot}${mk}
        <g class="kpi-hover" style="display:none"><line class="kpi-cross" y1="${pad.t}" y2="${pad.t + ih}"/>${bars ? '' : `<circle class="kpi-hdot1" r="4.5" fill="${C1}" stroke="#fff" stroke-width="2"/>`}</g>
        <rect class="kpi-hit" x="${pad.l - 6}" y="0" width="${iw + 12}" height="${H}" fill="transparent"/>
      </svg>
      <div class="kpi-tip" hidden></div>`;
    const svg = q('svg', box);
    const hover = q('.kpi-hover', box);
    const tip = q('.kpi-tip', box);
    box.tabIndex = 0;
    box.setAttribute('aria-label', `${m.label} ${W.name} 추이. 좌우 화살표로 기간별 값을 볼 수 있습니다.`);
    let cur = -1;
    const line = (text, strong, color, cls) => {
      const p = document.createElement('p');
      if (color !== undefined) { const key = document.createElement('span'); key.className = 'kpi-tip-key' + (color ? '' : ' is-none'); if (color) key.style.background = color; p.appendChild(key); }
      if (strong != null) { const b = document.createElement('strong'); b.textContent = strong; if (cls) b.className = cls; p.appendChild(b); }
      p.appendChild(document.createTextNode(' ' + text));
      return p;
    };
    function show(i) {
      if (i < 0 || i >= n) return;
      cur = i;
      const v = vals[i];
      hover.style.display = '';
      const cross = q('.kpi-cross', box);
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      const dot = q('.kpi-hdot1', box);
      if (dot) { if (v == null) dot.setAttribute('cy', -20); else { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v)); } }
      tip.textContent = '';
      const head = document.createElement('p'); head.className = 'kpi-tip-head';
      head.textContent = trLabel(d.unit, keys[i], true) + (i === n - 1 ? ' · 진행 중' : '');
      tip.appendChild(head);
      tip.appendChild(line(m.label, v == null ? '기록 전' : fmtN(v) + m.unit, C1));
      if (i === n - 1 && v != null) {
        const dd = trDelta(v, cut);
        tip.appendChild(line(`${W.cut} ${fmtN(cut)}${m.unit} 대비`, dd.text, '', dd.cls));
      } else if (i > 0 && v != null && vals[i - 1] != null) {
        const dd = trDelta(v, vals[i - 1]);
        tip.appendChild(line(`${W.vs} 대비`, dd.text, '', dd.cls));
      }
      if (avg && avg[i] != null) tip.appendChild(line('7일 평균', fmtN(avg[i]), TR_AVG));
      (marks[keys[i]] || []).slice(0, 5).forEach((t) => tip.appendChild(line(`${siteName[t.site] || t.site} · ${t.title}`, '◆', undefined, 'tr-tip-mark')));
      const extra = (marks[keys[i]] || []).length - 5;
      if (extra > 0) tip.appendChild(line(`외 ${extra}건`, null));
      tip.hidden = false;
      const bw = box.clientWidth;
      const scale = svg.getBoundingClientRect().width / Wd || 1;
      const px = x(i) * scale;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(bw - tw, px + 14 > bw - tw ? px - tw - 14 : px + 14)) + 'px';
      tip.style.top = '6px';
    }
    const hide = () => { hover.style.display = 'none'; tip.hidden = true; cur = -1; };
    const pick = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = (clientX - r.left) * (Wd / r.width);
      return bars ? Math.floor((px - pad.l) / slot) : Math.round(((px - pad.l) / iw) * (n - 1));
    };
    const hit = q('.kpi-hit', box);
    hit.addEventListener('mousemove', (e) => show(Math.max(0, Math.min(n - 1, pick(e.clientX)))));
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', (e) => { if (e.touches[0]) show(Math.max(0, Math.min(n - 1, pick(e.touches[0].clientX)))); }, { passive: true });
    hit.addEventListener('touchmove', (e) => { if (e.touches[0]) show(Math.max(0, Math.min(n - 1, pick(e.touches[0].clientX)))); }, { passive: true });
    box.onkeydown = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(n - 1, cur < 0 ? n - 1 : cur + 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, cur < 0 ? n - 1 : cur - 1)); }
      if (e.key === 'Escape') hide();
    };
    box.onblur = hide;
  }

  /* 사이트별 비교 — 고른 지표 하나로 */
  function trRenderTable() {
    const d = TR.data;
    const m = TR_BY[TR.metric];
    const W = TR_WORD[d.unit];
    const n = d.keys.length;
    const single = !['all', 'focus'].includes(TR.scope);
    const pool = TR.scope === 'all' ? d.sites : d.sites.filter((s) => s.tier === '주력' || s.id === TR.scope);
    const rows = pool.filter((s) => trHas(s, m.k)).map((s) => {
      const v = s.s[m.k];
      return { s, L: v[n - 2], B: v[n - 3], C: v[n - 1], cut: s.prev[m.k] || 0, dl: trDelta(v[n - 2], v[n - 3], ''), tot: v.slice(0, n - 1).reduce((a, x) => a + (x || 0), 0) };
    });
    const key = (r) => (r.dl.d == null ? 0 : r.dl.d);
    if (TR.sort === 'up') rows.sort((a, b) => key(b) - key(a) || (b.L || 0) - (a.L || 0));
    else if (TR.sort === 'down') rows.sort((a, b) => key(a) - key(b) || (b.L || 0) - (a.L || 0));
    else rows.sort((a, b) => (b.L || 0) - (a.L || 0) || b.tot - a.tot);
    qa('#trSort [data-sort]').forEach((b) => b.classList.toggle('is-active', b.dataset.sort === TR.sort));
    q('#trTableTitle').innerHTML = `사이트별 ${esc(m.label)} <small>${esc(W.last)} 기준 · ${esc(W.vs)} 대비</small>`;

    /* 늘어난 곳 · 줄어든 곳 */
    const ups = rows.filter((r) => r.dl.d > 0).sort((a, b) => b.dl.d - a.dl.d).slice(0, 3);
    const downs = rows.filter((r) => r.dl.d < 0).sort((a, b) => a.dl.d - b.dl.d).slice(0, 3);
    const li = (r) => `<li><button type="button" class="link-btn" data-tr-site="${esc(r.s.id)}">${esc(r.s.name)}</button> <em class="${r.dl.cls}">${esc(r.dl.text)}</em></li>`;
    q('#trMoves').innerHTML = single ? '' : `
      <div><p class="tr-moves-h">${esc(W.vs)}보다 많이 늘어난 곳</p>${ups.length ? `<ul>${ups.map(li).join('')}</ul>` : '<p class="acc-empty">없음</p>'}</div>
      <div><p class="tr-moves-h">${esc(W.vs)}보다 많이 줄어든 곳</p>${downs.length ? `<ul>${downs.map(li).join('')}</ul>` : '<p class="acc-empty">없음</p>'}</div>`;

    const head = `<div class="tr-row tr-row-head" aria-hidden="true"><span>사이트</span><span>${esc(W.last)}</span><span>${esc(W.vs)} 대비</span><span>${esc(W.curLong)}</span><span>추이 (${n}${esc(W.per)})</span></div>`;
    q('#trTable').innerHTML = rows.length ? head + rows.map((r) => `
      <div class="tr-row${r.s.id === TR.scope ? ' is-on' : ''}">
        <button type="button" class="tr-site" data-tr-site="${esc(r.s.id)}" title="이 사이트만 보기"><strong>${esc(r.s.name)}</strong><small>${esc((r.s.cluster || '').replace(/^\d+\s*/, ''))}</small></button>
        <span class="tr-cell"><span class="tr-cap">${esc(W.last)}</span><strong>${r.L == null ? '–' : fmtN(r.L)}</strong></span>
        <span class="tr-cell"><span class="tr-cap">${esc(W.vs)} 대비</span><em class="${r.dl.cls}">${esc(r.dl.text)}</em></span>
        <span class="tr-cell"><span class="tr-cap">${esc(W.curLong)}</span><strong>${r.C == null ? '–' : fmtN(r.C)}</strong><small>${esc(W.cut)} ${fmtN(r.cut)}</small></span>
        <span class="tr-cell tr-cell-spark">${trSpark(r.s.s[m.k], 120, 28)}</span>
      </div>`).join('') : '<p class="acc-empty">이 지표에 쌓인 기록이 있는 사이트가 없습니다.</p>';
  }

  /* 이벤트 */
  q('#trUnit').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b || b.dataset.unit === TR.unit) return;
    TR.unit = b.dataset.unit; TR.n = 0; trSave(); loadTrend();
  });
  q('#trN').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    TR.n = Number(b.dataset.n); trSave(); loadTrend();
  });
  q('#trScope').addEventListener('change', (e) => { TR.scope = e.target.value; trSave(); renderTrend(); });
  q('#trTiles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tr-metric]');
    if (!b) return;
    TR.metric = b.dataset.trMetric; trSave();
    qa('#trTiles [data-tr-metric]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
    trRenderChart(); trRenderTable();
  });
  q('#trSort').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b) return;
    TR.sort = b.dataset.sort; trRenderTable();
  });
  q('[data-panel="trend"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tr-site]');
    if (!b) return;
    TR.scope = b.dataset.trSite === TR.scope ? 'all' : b.dataset.trSite;
    trSave(); renderTrend();
    q('#trBrief').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  q('#trCsv').addEventListener('click', () => {
    const d = TR.data;
    if (!d) { showMsg('먼저 추이를 불러와 주세요.', 'info'); return; }
    const W = TR_WORD[d.unit];
    const rows = [[`KPI 추이 (${W.name})`, `${d.keys[0]} ~ ${d.keys[d.keys.length - 1]}`, '마지막 기간은 진행 중'], [],
      ['사이트', '구분', '기간', ...TR_M.map((m) => `${m.label}(${m.unit})`)]];
    d.sites.filter(trAny).forEach((s) => d.keys.forEach((k, i) => rows.push([s.name, s.tier, k, ...TR_M.map((m) => (s.s[m.k][i] == null ? '' : s.s[m.k][i]))])));
    downloadCsv(`KPI추이_${W.name}_${d.keys[0]}_${d.keys[d.keys.length - 1]}.csv`, rows);
  });
  window.addEventListener('resize', () => {
    clearTimeout(TR.rt);
    TR.rt = setTimeout(() => { if (TR.data && !q('[data-panel="trend"]').hidden) trRenderChart(); }, 200);
  });

  /* 대시보드: 어제 성과 (전체 사이트) */
  async function loadDashTrend() {
    const box = q('#admTrend');
    if (!box) return;
    try {
      const d = await api('trend?unit=day&n=14');
      const list = trScopeSites(d, 'all');
      box.innerHTML = ['v', 'se', 'inq', 'book'].map((k) => trTile(d, list, TR_BY[k], { compact: true })).join('');
    } catch (err) {
      box.innerHTML = `<li class="acc-empty">${esc(err.message)}</li>`;
    }
  }

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
    go(['ops', 'trend', 'sites', 'skpi', 'leads', 'kpi', 'inquiries', 'members', 'community', 'refs', 'content', 'system'].includes(start) ? start : 'dash');
  }

  boot();
})();
