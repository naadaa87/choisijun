/* =========================================================
   최시준 홈페이지 — 관리자 페이지 (/admin)
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

  const state = { setup: {}, overview: null, inquiries: [], inqFilter: { status: '', type: '', q: '' }, openInq: null, community: { posts: [], comments: [] }, comFilter: 'pending', refs: [], editRef: null, refImage: '', content: null };

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
      const kpis = [
        ['inquiries', c.inq_new, '새 문의', '답을 기다리는 문의'],
        ['inquiries', c.inq_progress, '진행 중', '상담·답변 진행'],
        ['inquiries', c.inq_month, '이번 달 문의', '전체 ' + c.inq_total + '건'],
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
        <div class="acc-item-head"><span class="adm-tag">${esc(r.type)}</span><span class="adm-tag ${r.status === '완료' ? 'is-ok' : r.status === '접수' ? 'is-ad' : r.status === '보관' ? 'is-off' : ''}">${esc(r.status)}</span><span class="acc-date mono">${KST(r.created_at)}</span></div>
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
      <div class="acc-item-head"><span class="adm-tag">${esc(r.type)}</span><span class="acc-date mono">${KST(r.created_at)} · #${r.id}</span></div>
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

  /* ---------------- 설정 · 바로가기 ---------------- */
  function renderSystem() {
    const s = state.setup || {};
    const cfg = window.SITE_CONFIG || {};
    const checks = [
      [s.db, '데이터 저장소 (Cloudflare D1)', s.db ? '문의·커뮤니티·레퍼런스가 저장됩니다.' : 'Pages 설정 → 바인딩에 D1 데이터베이스를 변수 이름 DB로 연결해 주세요.'],
      [s.password, '관리자 비밀번호', '비밀번호를 바꾸려면 Cloudflare → choisijun → 설정 → 변수 및 비밀에서 ADMIN_PASSWORD 값을 바꾸고 다시 배포합니다.'],
      [s.mail || Boolean(cfg.formAccessKey), '새 문의 메일 알림', s.mail ? 'Resend로 알림 메일을 보냅니다.' : cfg.formAccessKey ? 'Web3Forms로 알림 메일을 받습니다.' : '가장 쉬운 방법: web3forms.com에서 받는 메일 주소를 넣고 받은 키를 site-config.js의 formAccessKey에 붙여넣기.'],
      [s.turnstile && Boolean(cfg.turnstileSiteKey), '스팸 방지 (Cloudflare Turnstile, 선택)', s.turnstile ? '자동 등록을 막고 있습니다.' : 'Cloudflare → Turnstile에서 사이트를 추가하고, 사이트 키는 site-config.js의 turnstileSiteKey에, 비밀 키는 TURNSTILE_SECRET에 넣습니다.'],
      [s.github, '매일 글 관리 (GitHub 토큰, 선택)', s.github ? '이 페이지에서 글감 승인·순서 변경·발행 멈춤을 할 수 있습니다.' : 'GitHub → Settings → Developer settings → Fine-grained token (저장소 choisijun, Contents 읽기·쓰기)을 만들어 GITHUB_TOKEN에 넣습니다.']
    ];
    q('#sysChecks').innerHTML = checks.map(([ok, title, text]) => `<li class="${ok ? 'is-ok' : 'is-no'}"><span class="adm-dot"></span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div></li>`).join('');
    const links = [
      ['https://dash.cloudflare.com', 'Cloudflare 대시보드', '배포, 비밀번호·키 설정, D1 데이터, 방문 통계'],
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
    go(['inquiries', 'community', 'refs', 'content', 'system'].includes(start) ? start : 'dash');
  }

  boot();
})();
