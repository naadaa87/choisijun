/* =========================================================
   최시준 홈페이지 — 관리자 페이지 (/admin)
   script.js 의 Auth · sbSelect · sbUpdate 등을 그대로 사용합니다.
   모든 데이터는 Supabase 보안 규칙(RLS)으로 관리자만 읽고 쓸 수 있습니다.
   ========================================================= */
(function adminApp() {
  const app = $('#admApp');
  if (!app) return;

  const gate = $('#admGate');
  const gateText = $('#admGateText');
  const gateCta = $('#admGateCta');
  const msg = $('#admMsg');
  const T = COMMUNITY_BACKEND;
  const FN_URL = `${T.supabaseUrl}/functions/v1/send-mail`;
  const MEMBER_TYPES = ['건물주 · 임대인', '공인중개사 · 중개법인', '예비창업자', '공간 운영자', '기업 · 기관 담당자', '기타'];
  const DAY = 24 * 60 * 60 * 1000;

  const S = {
    profiles: [], inquiries: [], posts: [], comments: [], notices: [], reads: [],
    me: null, mailReady: false, mailState: '확인 중…',
    inqFilter: { status: '', type: '', q: '' }, openInq: null,
    memFilter: { type: '', mk: '', q: '' }, selected: new Set()
  };

  /* ---------- 공통 ---------- */
  function say(html, kind = 'info', sticky) {
    msg.innerHTML = html;
    msg.className = 'auth-msg is-' + kind;
    msg.hidden = false;
    if (!sticky) { clearTimeout(say.t); say.t = setTimeout(() => { msg.hidden = true; }, 6000); }
  }
  const ago = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms)) return '';
    const h = Math.floor(ms / 3600000);
    if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}분 전`;
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  };
  const isEmail = (v) => EMAIL_RULE.test(String(v || '').trim());
  const badge = (st) => `<span class="st-badge st-${INQUIRY_STATUS.indexOf(st || '접수')}">${escapeHtml(st || '접수')}</span>`;
  const profileById = (id) => S.profiles.find((p) => p.id === id);
  const tok = () => Auth.token();

  /* ---------- 탭 ---------- */
  function showTab(name) {
    $$('.adm-tab').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $$('.adm-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    try { history.replaceState(null, '', '#' + name); } catch (_) { /* ignore */ }
    if (name === 'send') paintSend();
  }
  $$('.adm-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go && app.contains(go)) { e.preventDefault(); showTab(go.dataset.go); window.scrollTo({ top: app.offsetTop - 90, behavior: 'smooth' }); }
  });

  /* ---------- 불러오기 ---------- */
  async function loadAll() {
    const t = await tok();
    const get = (table, q) => sbSelect(table, q, t).catch(() => []);
    const [profiles, inquiries, posts, comments, notices, reads] = await Promise.all([
      get(T.profilesTable, 'select=*&order=created_at.desc&limit=2000'),
      get(T.inquiriesTable, 'select=*&order=created_at.desc&limit=1000'),
      get(T.table, 'select=*&order=created_at.desc&limit=300'),
      get(T.commentsTable, 'select=*&order=created_at.desc&limit=1000'),
      get('notices', 'select=*&order=created_at.desc&limit=200'),
      get('notice_reads', 'select=notice_id,user_id&limit=20000')
    ]);
    Object.assign(S, { profiles, inquiries, posts, comments, notices, reads });
    paintAll();
  }

  async function checkMail() {
    try {
      const res = await fetch(FN_URL, { method: 'POST', headers: sbHeaders({}, await tok()), body: JSON.stringify({ action: 'ping' }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ready) { S.mailReady = true; S.mailState = `연결됨 · 보내는 주소 ${d.from || ''}`; }
      else if (res.ok) { S.mailReady = false; S.mailState = '함수는 있지만 RESEND_API_KEY 가 비어 있습니다'; }
      else { S.mailReady = false; S.mailState = res.status === 404 ? '메일 발송 함수(send-mail)가 아직 없습니다' : `확인 실패 (${res.status})`; }
    } catch (_) {
      S.mailReady = false; S.mailState = '메일 발송 함수(send-mail)가 아직 없습니다';
    }
    paintSend(); paintSystem(); paintTodo();
    if (S.openInq) openInquiry(S.openInq);
  }

  async function callMail(payload) {
    const res = await fetch(FN_URL, { method: 'POST', headers: sbHeaders({}, await tok()), body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
    return d;
  }

  function paintAll() {
    paintCounts(); paintKpis(); paintTodo(); paintRecent();
    paintInqFilters(); paintInquiries();
    paintMemFilters(); paintMembers();
    paintSend(); paintHistory(); paintCommunity(); paintSystem();
  }

  /* ---------- 대시보드 ---------- */
  function waitingPosts() {
    const staffReplied = new Set(S.comments.filter((c) => c.is_staff).map((c) => c.post_id));
    return S.posts.filter((p) => !p.is_staff && !staffReplied.has(p.id));
  }
  function paintCounts() {
    const fresh = S.inquiries.filter((i) => (i.status || '접수') === '접수').length;
    $('#cntInq').textContent = fresh ? String(fresh) : '';
    $('#cntMem').textContent = S.profiles.length ? String(S.profiles.length) : '';
    const w = waitingPosts().length;
    $('#cntCom').textContent = w ? String(w) : '';
  }
  function paintKpis() {
    const weekAgo = Date.now() - 7 * DAY;
    const k = [
      ['새 문의', S.inquiries.filter((i) => (i.status || '접수') === '접수').length, 'inquiries', '접수 상태'],
      ['진행 중', S.inquiries.filter((i) => i.status === '진행중').length, 'inquiries', '답변 진행'],
      ['전체 문의', S.inquiries.length, 'inquiries', '누적'],
      ['전체 회원', S.profiles.length, 'members', '가입 완료'],
      ['이번 주 가입', S.profiles.filter((p) => new Date(p.created_at).getTime() > weekAgo).length, 'members', '최근 7일'],
      ['소식 수신 동의', S.profiles.filter((p) => p.marketing).length, 'members', '광고성 발송 가능'],
      ['답글 대기 글', waitingPosts().length, 'community', '커뮤니티']
    ];
    $('#admKpis').innerHTML = k.map(([label, n, tab, foot]) =>
      `<li><button type="button" data-go="${tab}"><span class="adm-kpi-num">${n}</span><span class="adm-kpi-label">${label}</span><span class="adm-kpi-foot mono">${foot}</span></button></li>`).join('');
  }
  function paintTodo() {
    const items = [];
    const fresh = S.inquiries.filter((i) => (i.status || '접수') === '접수');
    if (fresh.length) {
      const oldest = fresh[fresh.length - 1];
      const late = Date.now() - new Date(oldest.created_at).getTime() > DAY;
      items.push(`<li class="${late ? 'is-late' : ''}"><strong>새 문의 ${fresh.length}건</strong> — 가장 오래된 문의가 ${ago(oldest.created_at)}에 들어왔습니다.${late ? ' 하루가 지났습니다.' : ''} <button type="button" class="link-btn" data-go="inquiries">확인하기</button></li>`);
    }
    const prog = S.inquiries.filter((i) => i.status === '진행중' && Date.now() - new Date(i.created_at).getTime() > 7 * DAY);
    if (prog.length) items.push(`<li><strong>일주일 넘게 '진행중'인 문의 ${prog.length}건</strong> — 마무리되었다면 '완료'로 바꿔 주세요. <button type="button" class="link-btn" data-go="inquiries">보기</button></li>`);
    const wp = waitingPosts();
    if (wp.length) items.push(`<li><strong>운영자 답글이 없는 글 ${wp.length}건</strong> — 커뮤니티 글에 답글을 남기면 다른 방문자도 참고합니다. <button type="button" class="link-btn" data-go="community">보기</button></li>`);
    const weekAgo = Date.now() - 7 * DAY;
    const newbies = S.profiles.filter((p) => new Date(p.created_at).getTime() > weekAgo && p.role !== 'admin');
    if (newbies.length) items.push(`<li><strong>이번 주 새 회원 ${newbies.length}명</strong> — 환영 인사를 보내 보세요. <button type="button" class="link-btn" id="todoWelcome">환영 알림 쓰기</button></li>`);
    if (!FORM_ACCESS_KEY) items.push('<li><strong>문의 메일 알림이 꺼져 있습니다</strong> — 문의가 들어와도 메일이 오지 않습니다. <button type="button" class="link-btn" data-go="system">설정 점검</button></li>');
    if (!S.mailReady && S.mailState !== '확인 중…') items.push('<li><strong>회원에게 메일을 보내는 기능이 아직 연결되지 않았습니다</strong> — 마이페이지 알림은 지금도 보낼 수 있습니다. <button type="button" class="link-btn" data-go="system">설정 점검</button></li>');
    $('#admTodo').innerHTML = items.length ? items.join('') : '<li class="acc-empty">지금 확인할 일이 없습니다. 👍</li>';
    const w = $('#todoWelcome');
    if (w) w.addEventListener('click', () => {
      S.selected = new Set(newbies.map((p) => p.id));
      paintMembers();
      $('input[name="sdTo"][value="selected"]').checked = true;
      $('input[name="sdKind"][value="info"]').checked = true;
      if (!$('#sdTitle').value) $('#sdTitle').value = '최시준 홈페이지에 오신 것을 환영합니다';
      if (!$('#sdBody').value) $('#sdBody').value = '회원가입해 주셔서 감사합니다.\n\n공실개발, 공간대여 창업, 무인 운영에 관해 궁금한 점이 있으면 언제든 문의하기로 남겨 주세요. 마이페이지에서 문의 진행 상황을 확인하실 수 있습니다.';
      if (!$('#sdLink').value) $('#sdLink').value = location.origin + '/insights';
      showTab('send');
    });
  }
  function paintRecent() {
    const top = S.inquiries.slice(0, 6);
    $('#admRecent').innerHTML = top.length ? top.map((i) => `
      <li class="acc-item adm-click" data-inq="${escapeHtml(i.id)}">
        <div class="acc-item-head">${badge(i.status)}<span class="mono">${escapeHtml(i.inquiry_type || '문의')}</span><span class="acc-date mono">${ago(i.created_at)}</span></div>
        <p class="acc-who"><strong>${escapeHtml(i.name || '')}</strong> · ${escapeHtml((i.message || '').slice(0, 60))}${(i.message || '').length > 60 ? '…' : ''}</p>
      </li>`).join('') : '<li class="acc-empty">아직 들어온 문의가 없습니다.</li>';
  }
  app.addEventListener('click', (e) => {
    const li = e.target.closest('[data-inq]');
    if (!li) return;
    showTab('inquiries');
    openInquiry(li.dataset.inq);
  });

  /* ---------- 문의 관리 ---------- */
  function paintInqFilters() {
    const types = Array.from(new Set(S.inquiries.map((i) => i.inquiry_type).filter(Boolean))).sort();
    const sel = $('#inqType');
    const cur = sel.value;
    sel.innerHTML = '<option value="">모든 유형</option>' + types.map((t) => `<option>${escapeHtml(t)}</option>`).join('');
    sel.value = types.includes(cur) ? cur : '';
  }
  function filteredInquiries() {
    const f = S.inqFilter;
    const q = f.q.trim().toLowerCase();
    return S.inquiries.filter((i) =>
      (!f.status || (i.status || '접수') === f.status) &&
      (!f.type || i.inquiry_type === f.type) &&
      (!q || [i.name, i.contact, i.message, i.reply].join(' ').toLowerCase().includes(q)));
  }
  function paintInquiries() {
    const rows = filteredInquiries();
    $('#inqList').innerHTML = rows.length ? rows.map((i) => `
      <li class="adm-row${S.openInq === i.id ? ' is-open' : ''}" data-id="${escapeHtml(i.id)}" tabindex="0">
        <div class="acc-item-head">${badge(i.status)}<span class="mono">${escapeHtml(i.inquiry_type || '문의')}</span>${i.user_id ? '<span class="adm-tag">회원</span>' : ''}${i.emailed_at ? '<span class="adm-tag is-mail">메일 답변</span>' : ''}<span class="acc-date mono">${formatDate(i.created_at)}</span></div>
        <p class="adm-row-title"><strong>${escapeHtml(i.name || '')}</strong> <span>${escapeHtml(i.contact || '')}</span></p>
        <p class="adm-row-text">${escapeHtml((i.message || '').slice(0, 90))}${(i.message || '').length > 90 ? '…' : ''}</p>
      </li>`).join('') : '<li class="acc-empty">조건에 맞는 문의가 없습니다.</li>';
    $$('.adm-row', $('#inqList')).forEach((li) => {
      const open = () => openInquiry(li.dataset.id);
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }
  $$('#inqStatus .f-chip').forEach((c) => c.addEventListener('click', () => {
    $$('#inqStatus .f-chip').forEach((x) => x.classList.remove('is-active'));
    c.classList.add('is-active');
    S.inqFilter.status = c.dataset.status || '';
    paintInquiries();
  }));
  $('#inqType').addEventListener('change', (e) => { S.inqFilter.type = e.target.value; paintInquiries(); });
  $('#inqSearch').addEventListener('input', (e) => { S.inqFilter.q = e.target.value; paintInquiries(); });

  function replyTarget(i) {
    const p = i.user_id ? profileById(i.user_id) : null;
    if (p && isEmail(p.email)) return { email: p.email, name: p.name || i.name, member: true };
    if (isEmail(i.contact)) return { email: i.contact.trim(), name: i.name, member: false };
    return null;
  }

  async function openInquiry(id) {
    const i = S.inquiries.find((x) => x.id === id);
    if (!i) return;
    S.openInq = id;
    $$('.adm-row', $('#inqList')).forEach((li) => li.classList.toggle('is-open', li.dataset.id === id));
    const p = i.user_id ? profileById(i.user_id) : null;
    const target = replyTarget(i);
    const tel = /^[0-9+\-\s()]{8,}$/.test(i.contact || '') ? `<a href="tel:${escapeHtml(i.contact.replace(/[^0-9+]/g, ''))}">전화</a>` : '';
    const mailtoHref = target
      ? `mailto:${encodeURIComponent(target.email)}?subject=${encodeURIComponent('[최시준] 문의하신 내용에 답변드립니다')}&body=${encodeURIComponent(`${target.name}님, 안녕하세요.\n\n\n\n— 보내주신 문의 —\n${(i.message || '').slice(0, 800)}`)}`
      : '';
    const box = $('#inqDetail');
    box.innerHTML = `
      <div class="acc-item-head">${badge(i.status)}<span class="mono">${escapeHtml(i.inquiry_type || '문의')}</span><span class="acc-date mono">${formatDate(i.created_at)}</span></div>
      <h2 class="adm-detail-name">${escapeHtml(i.name || '')}</h2>
      <p class="adm-contact">
        <span>${escapeHtml(i.contact || '')}</span>
        ${tel}${target ? `<a href="mailto:${escapeHtml(target.email)}">메일</a>` : ''}
        <button type="button" class="link-btn" id="idCopy">연락처 복사</button>
      </p>
      ${p ? `<p class="acc-who"><span class="adm-tag">회원</span> ${escapeHtml(p.name || '')} · ${escapeHtml(p.email || '')}${p.member_type ? ' · ' + escapeHtml(p.member_type) : ''}${p.phone ? ' · ' + escapeHtml(p.phone) : ''}</p>` : '<p class="acc-who">비회원 문의</p>'}
      ${i.page ? `<p class="acc-who mono">보낸 페이지 ${escapeHtml(i.page)}</p>` : ''}
      <div class="adm-message">${escapeHtml(i.message || '')}</div>

      <form class="auth-form adm-reply" id="idForm" novalidate>
        <div class="auth-row">
          <label>상태
            <select id="idStatus">${INQUIRY_STATUS.map((s) => `<option${s === (i.status || '접수') ? ' selected' : ''}>${s}</option>`).join('')}</select>
          </label>
          <div class="adm-reply-meta mono">${i.replied_at ? '답변 저장 ' + formatDate(i.replied_at) : '아직 답변 없음'}${i.emailed_at ? '<br />메일 발송 ' + formatDate(i.emailed_at) : ''}</div>
        </div>
        <label>답변 ${i.user_id ? '<small>(회원 마이페이지에 그대로 보입니다)</small>' : '<small>(비회원은 메일로만 전달됩니다)</small>'}
          <textarea id="idReply" rows="6" maxlength="2000" placeholder="문의하신 분께 전할 답변">${escapeHtml(i.reply || '')}</textarea>
        </label>
        <label class="acc-check"><input type="checkbox" id="idMail" ${target && S.mailReady ? '' : 'disabled'} /> <span>답변을 이메일로도 보내기 ${target ? `<small>(${escapeHtml(target.email)})</small>` : '<small>— 이메일 주소가 없는 문의입니다</small>'}${target && !S.mailReady ? ' <small>— 메일 발송 기능 연결 전</small>' : ''}</span></label>
        <div class="adm-btns">
          <button type="submit" class="btn btn-primary">저장</button>
          ${mailtoHref ? `<a class="btn btn-line" href="${mailtoHref}">메일 앱으로 답장</a>` : ''}
        </div>
      </form>

      <div class="adm-notes">
        <h3>내부 메모 <small>(관리자만 봅니다)</small></h3>
        <ul class="adm-note-list" id="idNotes"><li class="acc-empty">불러오는 중…</li></ul>
        <form class="adm-note-form" id="idNoteForm">
          <input type="text" id="idNote" maxlength="500" placeholder="예: 10/12 통화, 현장 방문 일정 조율 중" aria-label="메모" />
          <button type="submit" class="btn btn-sm btn-line">추가</button>
        </form>
      </div>`;

    $('#idCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(i.contact || ''); say('연락처를 복사했습니다.', 'ok'); } catch (_) { say('복사하지 못했습니다.', 'err'); }
    });

    $('#idForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const reply = $('#idReply').value.trim();
      const status = $('#idStatus').value;
      const wantMail = $('#idMail').checked;
      if (wantMail && !reply) { say('메일로 보낼 답변을 입력해 주세요.', 'err'); return; }
      setBusy(form, true, '저장 중…');
      try {
        const patch = { status, reply: reply || null };
        if (reply && reply !== (i.reply || '')) patch.replied_at = new Date().toISOString();
        await sbUpdate(T.inquiriesTable, `id=eq.${encodeURIComponent(i.id)}`, patch, await tok());
        Object.assign(i, patch);
        let note = '저장했습니다.';
        if (wantMail && target) {
          const r = await callMail({
            kind: 'info',
            subject: '[최시준] 문의하신 내용에 답변드립니다',
            text: `${reply}\n\n— 보내주신 문의 (${formatDate(i.created_at)}) —\n${(i.message || '').slice(0, 1200)}`,
            link: target.member ? location.origin + '/account#my-inquiries' : '',
            linkLabel: target.member ? '마이페이지에서 보기' : '',
            recipients: [{ email: target.email, name: target.name }]
          });
          if (r.sent) {
            const at = new Date().toISOString();
            await sbUpdate(T.inquiriesTable, `id=eq.${encodeURIComponent(i.id)}`, { emailed_at: at }, await tok());
            i.emailed_at = at;
            note = `저장하고 ${escapeHtml(target.email)}로 메일을 보냈습니다.`;
          } else {
            note = '저장했지만 메일은 보내지 못했습니다. 설정 점검 탭을 확인해 주세요.';
          }
        }
        say(note, 'ok');
        paintCounts(); paintKpis(); paintTodo(); paintRecent(); paintInquiries();
        openInquiry(i.id);
      } catch (err) {
        say('처리하지 못했습니다: ' + escapeHtml(err.message || ''), 'err', true);
      } finally { setBusy(form, false); }
    });

    loadNotes(i.id);
    $('#idNoteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#idNote');
      const body = input.value.trim();
      if (!body) return;
      try {
        await sbInsert('inquiry_notes', { inquiry_id: i.id, body, author: Auth.displayName() }, { token: await tok() });
        input.value = '';
        loadNotes(i.id);
      } catch (_) { say('메모를 저장하지 못했습니다.', 'err'); }
    });
    if (window.innerWidth < 900) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadNotes(id) {
    const box = $('#idNotes');
    if (!box) return;
    try {
      const rows = await sbSelect('inquiry_notes', `inquiry_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`, await tok());
      box.innerHTML = rows.length ? rows.map((n) => `<li><span class="mono">${formatDate(n.created_at)}${n.author ? ' · ' + escapeHtml(n.author) : ''}</span>${escapeHtml(n.body)}</li>`).join('')
        : '<li class="acc-empty">메모가 없습니다.</li>';
    } catch (_) { box.innerHTML = '<li class="acc-empty">메모를 불러오지 못했습니다.</li>'; }
  }

  /* ---------- 회원 관리 ---------- */
  function paintMemFilters() {
    const types = Array.from(new Set([...MEMBER_TYPES, ...S.profiles.map((p) => p.member_type).filter(Boolean)]));
    const opts = types.map((t) => `<option>${escapeHtml(t)}</option>`).join('');
    const a = $('#memType'); const cur = a.value;
    a.innerHTML = '<option value="">모든 유형</option>' + opts; a.value = cur;
    const b = $('#sdType'); const cur2 = b.value;
    b.innerHTML = opts; if (cur2) b.value = cur2;
  }
  function filteredMembers() {
    const f = S.memFilter;
    const q = f.q.trim().toLowerCase();
    return S.profiles.filter((p) =>
      (!f.type || p.member_type === f.type) &&
      (!f.mk || (f.mk === 'y' ? p.marketing : !p.marketing)) &&
      (!q || [p.name, p.email, p.phone].join(' ').toLowerCase().includes(q)));
  }
  function paintMembers() {
    const rows = filteredMembers();
    const meId = Auth.user && Auth.user.id;
    $('#memBody').innerHTML = rows.length ? rows.map((p) => `
      <tr data-id="${escapeHtml(p.id)}">
        <td><input type="checkbox" class="mem-pick" ${S.selected.has(p.id) ? 'checked' : ''} aria-label="${escapeHtml(p.name || '')} 선택" /></td>
        <td><strong>${escapeHtml(p.name || '')}</strong></td>
        <td>${escapeHtml(p.email || '')}</td>
        <td>${escapeHtml(p.member_type || '—')}</td>
        <td>${escapeHtml(p.phone || '—')}</td>
        <td>${p.marketing ? '<span class="adm-tag is-ok">동의</span>' : '<span class="adm-tag is-off">—</span>'}</td>
        <td><select class="mem-role" aria-label="권한" ${p.id === meId ? 'disabled' : ''}><option value="member"${p.role !== 'admin' ? ' selected' : ''}>회원</option><option value="admin"${p.role === 'admin' ? ' selected' : ''}>관리자</option></select></td>
        <td class="mono">${formatDate(p.created_at).slice(0, 10)}</td>
      </tr>`).join('') : '<tr><td colspan="8" class="acc-empty">조건에 맞는 회원이 없습니다.</td></tr>';
    $$('.mem-pick').forEach((c) => c.addEventListener('change', () => {
      const id = c.closest('tr').dataset.id;
      if (c.checked) S.selected.add(id); else S.selected.delete(id);
      paintSelCount();
    }));
    $$('.mem-role').forEach((sel) => sel.addEventListener('change', async () => {
      const id = sel.closest('tr').dataset.id;
      const p = profileById(id);
      const role = sel.value;
      if (!confirm(`${p.name || p.email}님을 ${role === 'admin' ? '관리자로 지정' : '일반 회원으로 변경'}할까요?`)) { sel.value = p.role; return; }
      try {
        const res = await fetch(`${T.supabaseUrl}/rest/v1/rpc/admin_set_role`, {
          method: 'POST', headers: sbHeaders({}, await tok()), body: JSON.stringify({ target: id, new_role: role })
        });
        if (!res.ok) throw new Error('fail');
        p.role = role;
        say('권한을 바꿨습니다.', 'ok');
      } catch (_) { sel.value = p.role; say('권한을 바꾸지 못했습니다.', 'err'); }
    }));
    paintSelCount();
  }
  function paintSelCount() {
    const n = S.selected.size;
    $('#memSel').textContent = `${n}명 선택`;
    $('#memMsg').disabled = !n;
    $('#sdSelCount').textContent = `${n}명`;
    const shown = filteredMembers();
    $('#memAll').checked = shown.length > 0 && shown.every((p) => S.selected.has(p.id));
    if (!$('[data-panel="send"]').hidden) paintRecipients();
  }
  $('#memAll').addEventListener('change', (e) => {
    filteredMembers().forEach((p) => { if (e.target.checked) S.selected.add(p.id); else S.selected.delete(p.id); });
    paintMembers();
  });
  $('#memType').addEventListener('change', (e) => { S.memFilter.type = e.target.value; paintMembers(); });
  $('#memMk').addEventListener('change', (e) => { S.memFilter.mk = e.target.value; paintMembers(); });
  $('#memSearch').addEventListener('input', (e) => { S.memFilter.q = e.target.value; paintMembers(); });
  $('#memMsg').addEventListener('click', () => {
    $('input[name="sdTo"][value="selected"]').checked = true;
    showTab('send');
  });
  function memberSource() {
    return S.selected.size ? S.profiles.filter((p) => S.selected.has(p.id)) : filteredMembers();
  }
  $('#memCopy').addEventListener('click', async () => {
    const list = memberSource().map((p) => p.email).filter(isEmail);
    if (!list.length) { say('복사할 이메일이 없습니다.', 'err'); return; }
    try { await navigator.clipboard.writeText(list.join(', ')); say(`이메일 ${list.length}개를 복사했습니다. 메일을 보낼 때는 받는 사람 대신 '숨은 참조(BCC)'에 붙여넣어 주세요.`, 'ok'); }
    catch (_) { prompt('아래 내용을 복사해 주세요.', list.join(', ')); }
  });
  $('#memCsv').addEventListener('click', () => {
    const rows = memberSource();
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = ['이름,이메일,회원 유형,휴대폰,소식 수신,권한,가입일']
      .concat(rows.map((p) => [p.name, p.email, p.member_type, p.phone, p.marketing ? '동의' : '', p.role === 'admin' ? '관리자' : '회원', formatDate(p.created_at)].map(cell).join(',')))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `choisijun-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say(`회원 ${rows.length}명을 CSV로 내려받았습니다.`, 'ok');
  });

  /* ---------- 알림 · 메일 보내기 ---------- */
  const sendForm = $('#sendForm');
  const val = (name) => { const r = $(`input[name="${name}"]:checked`); return r ? r.value : ''; };

  function resolveRecipients() {
    const kind = val('sdKind');
    const to = val('sdTo');
    let list = S.profiles;
    if (to === 'marketing') list = list.filter((p) => p.marketing);
    if (to === 'type') { const t = $('#sdType').value; list = list.filter((p) => p.member_type === t); }
    if (to === 'selected') list = list.filter((p) => S.selected.has(p.id));
    const before = list.length;
    if (kind === 'ad') list = list.filter((p) => p.marketing);
    return { kind, to, list, excluded: before - list.length };
  }
  function nightNow() { const h = new Date(Date.now() + 9 * 3600000).getUTCHours(); return h >= 21 || h < 8; }

  function paintRecipients() {
    const r = resolveRecipients();
    const emails = r.list.filter((p) => isEmail(p.email)).length;
    const parts = [`받는 사람 <strong>${r.list.length}명</strong>`];
    if ($('#sdEmail').checked) parts.push(`이메일 ${emails}통`);
    if (r.excluded) parts.push(`소식 받기에 동의하지 않은 ${r.excluded}명은 제외`);
    if (r.kind === 'ad' && $('#sdEmail').checked && nightNow()) parts.push('<span class="adm-warn">지금은 광고성 메일을 보낼 수 없는 시간입니다 (21시~8시)</span>');
    $('#sdRecip').innerHTML = parts.join(' · ');
  }
  function paintPreview() {
    const kind = val('sdKind');
    const title = $('#sdTitle').value.trim() || '제목';
    const body = $('#sdBody').value.trim() || '본문을 입력하면 여기에 미리 보입니다.';
    const link = $('#sdLink').value.trim();
    const label = $('#sdLinkLabel').value.trim() || '자세히 보기';
    const paras = escapeHtml(body).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`).join('');
    $('#sdPreview').innerHTML = `
      <p class="adm-mail-subject mono">${kind === 'ad' ? '(광고) ' : ''}${escapeHtml(title)}</p>
      <div class="adm-mail-card">
        <h3>${escapeHtml(title)}</h3>
        <p>홍길동님, 안녕하세요.</p>
        ${paras}
        ${link ? `<p><span class="adm-mail-btn">${escapeHtml(label)}</span></p>` : ''}
        <p>최시준 드림</p>
      </div>
      <p class="adm-mail-foot">${kind === 'ad' ? '소식 받기에 동의하신 분께 보내는 광고성 정보입니다. 마이페이지에서 수신을 끌 수 있습니다.<br />' : ''}㈜블랭크 · 대표 최시준 · ${escapeHtml(CONTACT_EMAIL)}</p>`;
  }
  function paintSend() {
    const emailBox = $('#sdEmail');
    emailBox.disabled = !S.mailReady;
    if (!S.mailReady) emailBox.checked = false;
    $('#sdEmailState').textContent = S.mailReady ? '' : `— ${S.mailState}`;
    paintRecipients();
    paintPreview();
  }
  ['change', 'input'].forEach((ev) => sendForm.addEventListener(ev, () => { paintRecipients(); paintPreview(); }));

  sendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = resolveRecipients();
    const site = $('#sdSite').checked;
    const mail = $('#sdEmail').checked && S.mailReady;
    const title = $('#sdTitle').value.trim();
    const body = $('#sdBody').value.trim();
    const link = $('#sdLink').value.trim();
    const linkLabel = $('#sdLinkLabel').value.trim();
    if (!site && !mail) { say('보낼 곳을 하나 이상 골라 주세요.', 'err'); return; }
    if (!title || !body) { say('제목과 본문을 입력해 주세요.', 'err'); return; }
    if (link && !/^https?:\/\//.test(link)) { say('링크는 https:// 로 시작하는 주소로 넣어 주세요.', 'err'); return; }
    if (!r.list.length) { say('받는 사람이 없습니다. 받는 사람 조건을 확인해 주세요.', 'err'); return; }
    if (mail && r.kind === 'ad' && nightNow()) { say('광고성 메일은 오전 8시부터 오후 9시 사이에만 보낼 수 있습니다. 마이페이지 알림만 보내거나 시간을 바꿔 주세요.', 'err', true); return; }
    const emailList = mail ? r.list.filter((p) => isEmail(p.email)).map((p) => ({ email: p.email, name: p.name || '회원' })) : [];
    if (mail && emailList.length > 500) { say('이메일은 한 번에 500명까지 보낼 수 있습니다. 받는 사람을 나눠 주세요.', 'err'); return; }
    const where = [site ? '마이페이지 알림' : '', mail ? `이메일 ${emailList.length}통` : ''].filter(Boolean).join(' + ');
    if (!confirm(`${r.list.length}명에게 보냅니다 (${where}).\n\n제목: ${r.kind === 'ad' ? '(광고) ' : ''}${title}\n\n보낼까요?`)) return;

    setBusy(sendForm, true, '보내는 중…');
    try {
      const row = {
        title, body, link: link || null, kind: r.kind,
        audience: r.to,
        member_type: r.to === 'type' ? $('#sdType').value : null,
        recipient_ids: r.to === 'selected' ? r.list.map((p) => p.id) : null,
        channels: [site ? 'site' : null, mail ? 'email' : null].filter(Boolean),
        recipient_count: r.list.length
      };
      const saved = await sbInsert('notices', row, { token: await tok() });
      const notice = saved && saved[0];
      const done = [];
      if (site) done.push(`마이페이지 알림 ${r.list.length}명`);
      if (mail) {
        const d = await callMail({ kind: r.kind, subject: title, text: body, link, linkLabel, recipients: emailList });
        if (notice) await sbUpdate('notices', `id=eq.${notice.id}`, { email_sent: d.sent || 0, email_failed: d.failed || 0 }, await tok()).catch(() => null);
        done.push(`이메일 ${d.sent || 0}통${d.failed ? ` (실패 ${d.failed}통)` : ''}`);
      }
      say(`발송을 마쳤습니다 — ${done.join(' · ')}`, 'ok', true);
      sendForm.reset();
      S.selected.clear();
      await loadAll();
      showTab('history');
    } catch (err) {
      say('보내지 못했습니다: ' + escapeHtml(err.message || ''), 'err', true);
    } finally { setBusy(sendForm, false); }
  });

  /* ---------- 발송 내역 ---------- */
  function audienceText(n) {
    if (n.audience === 'all') return '전체 회원';
    if (n.audience === 'marketing') return '소식 수신 동의 회원';
    if (n.audience === 'type') return `회원 유형: ${n.member_type || ''}`;
    return `선택한 회원 ${Array.isArray(n.recipient_ids) ? n.recipient_ids.length : 0}명`;
  }
  function paintHistory() {
    const readCount = {};
    S.reads.forEach((r) => { readCount[r.notice_id] = (readCount[r.notice_id] || 0) + 1; });
    $('#histList').innerHTML = S.notices.length ? S.notices.map((n) => {
      const ch = n.channels || [];
      return `
      <li class="adm-row is-static" data-id="${escapeHtml(n.id)}">
        <div class="acc-item-head">
          <span class="adm-tag ${n.kind === 'ad' ? 'is-ad' : ''}">${n.kind === 'ad' ? '광고성' : '정보성'}</span>
          <span class="mono">${escapeHtml(audienceText(n))} · ${n.recipient_count || 0}명</span>
          <span class="acc-date mono">${formatDate(n.created_at)}</span>
        </div>
        <p class="adm-row-title"><strong>${escapeHtml(n.title)}</strong></p>
        <p class="adm-row-text">${escapeHtml((n.body || '').slice(0, 140))}${(n.body || '').length > 140 ? '…' : ''}</p>
        <p class="adm-hist-meta mono">
          ${ch.includes('site') ? `마이페이지 알림 · 읽음 ${readCount[n.id] || 0}명` : ''}
          ${ch.includes('email') ? ` · 이메일 ${n.email_sent || 0}통${n.email_failed ? ` (실패 ${n.email_failed})` : ''}` : ''}
          ${ch.includes('site') ? '<button type="button" class="link-btn hist-del">알림함에서 내리기</button>' : ''}
        </p>
      </li>`;
    }).join('') : '<li class="acc-empty">아직 보낸 알림이 없습니다. \'알림 · 메일 보내기\'에서 첫 알림을 보내 보세요.</li>';
    $$('.hist-del').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('li').dataset.id;
      if (!confirm('이 알림을 회원 알림함에서 내릴까요? (이미 보낸 메일은 취소되지 않습니다)')) return;
      try { await sbDelete('notices', `id=eq.${encodeURIComponent(id)}`, await tok()); await loadAll(); say('알림을 내렸습니다.', 'ok'); }
      catch (_) { say('처리하지 못했습니다.', 'err'); }
    }));
  }

  /* ---------- 커뮤니티 ---------- */
  function paintCommunity() {
    const byPost = {};
    S.comments.forEach((c) => { (byPost[c.post_id] = byPost[c.post_id] || []).push(c); });
    const waiting = new Set(waitingPosts().map((p) => p.id));
    $('#comPosts').innerHTML = S.posts.length ? S.posts.map((p) => `
      <li class="acc-item" data-id="${escapeHtml(p.id)}">
        <div class="acc-item-head"><span class="post-cat mono">${escapeHtml(p.category || '기타')}</span>${waiting.has(p.id) ? '<span class="adm-tag is-ad">답글 대기</span>' : ''}${p.is_staff ? '<span class="adm-tag">운영자</span>' : ''}<span class="acc-date mono">${formatDate(p.created_at)}</span></div>
        <p class="adm-row-title"><strong>${escapeHtml(p.title || '')}</strong> <span>${escapeHtml(p.author || '')} · 답글 ${(byPost[p.id] || []).length}</span></p>
        <p class="adm-row-text">${escapeHtml((p.content || '').slice(0, 120))}</p>
        <p class="adm-hist-meta"><a class="link-btn" href="/community">커뮤니티에서 답글 쓰기</a> <button type="button" class="link-btn com-del" data-table="${T.table}">삭제</button></p>
      </li>`).join('') : '<li class="acc-empty">게시글이 없습니다.</li>';
    $('#comComments').innerHTML = S.comments.length ? S.comments.slice(0, 40).map((c) => {
      const post = S.posts.find((p) => p.id === c.post_id);
      return `
      <li class="acc-item" data-id="${escapeHtml(c.id)}">
        <div class="acc-item-head"><span class="mono">${escapeHtml(c.author || '')}</span>${c.is_staff ? '<span class="adm-tag">운영자</span>' : ''}<span class="acc-date mono">${formatDate(c.created_at)}</span></div>
        <p class="adm-row-text">${escapeHtml(c.content || '')}</p>
        <p class="adm-hist-meta mono">${post ? '글: ' + escapeHtml(post.title || '') : ''} <button type="button" class="link-btn com-del" data-table="${T.commentsTable}">삭제</button></p>
      </li>`;
    }).join('') : '<li class="acc-empty">답글이 없습니다.</li>';
    $$('.com-del').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('li').dataset.id;
      if (!confirm('삭제할까요? 되돌릴 수 없습니다.')) return;
      try { await sbDelete(b.dataset.table, `id=eq.${encodeURIComponent(id)}`, await tok()); await loadAll(); say('삭제했습니다.', 'ok'); }
      catch (_) { say('삭제하지 못했습니다.', 'err'); }
    }));
  }

  /* ---------- 설정 점검 ---------- */
  function paintSystem() {
    const ref = (T.supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
    const row = (ok, title, text) => `<li class="${ok === true ? 'is-ok' : ok === false ? 'is-no' : 'is-wait'}"><span class="adm-dot" aria-hidden="true"></span><div><strong>${title}</strong><p>${text}</p></div></li>`;
    $('#sysChecks').innerHTML = [
      row(true, '회원 · 게시판 (Supabase)', `연결됨 · 회원 ${S.profiles.length}명, 문의 ${S.inquiries.length}건, 알림 ${S.notices.length}건`),
      row(true, '관리자 계정', `${escapeHtml(Auth.displayName())} (${escapeHtml((Auth.user && Auth.user.email) || '')})`),
      row(Boolean(FORM_ACCESS_KEY), '문의 메일 알림 (Web3Forms)', FORM_ACCESS_KEY ? `문의가 들어오면 ${escapeHtml(CONTACT_EMAIL)} 로 메일이 옵니다.` : 'site-config.js 의 formAccessKey 가 비어 있습니다. 가이드 PART A를 진행해 주세요.'),
      row(S.mailState === '확인 중…' ? null : S.mailReady, '회원에게 메일 보내기 (send-mail 함수)', escapeHtml(S.mailState) + (S.mailReady ? '' : ' — 가이드 PART G를 진행하면 켜집니다. 그 전에도 마이페이지 알림은 보낼 수 있습니다.')),
      row(SOCIAL_LOGIN.length ? true : null, '간편 로그인', SOCIAL_LOGIN.length ? escapeHtml(SOCIAL_LOGIN.join(', ')) : '사용 안 함 (선택 기능)')
    ].join('');
    const links = [
      ref ? [`https://supabase.com/dashboard/project/${ref}`, 'Supabase 대시보드', '회원 삭제, 표 보기, SQL 실행'] : ['https://supabase.com/dashboard', 'Supabase 대시보드', ''],
      ref ? [`https://supabase.com/dashboard/project/${ref}/auth/users`, '회원 계정 (Authentication → Users)', '인증 여부, 마지막 로그인, 계정 삭제'] : null,
      ['https://resend.com/emails', 'Resend 발송 기록', '메일이 잘 나갔는지 확인'],
      ['https://github.com/naadaa87/choisijun', 'GitHub 저장소', 'site-config.js, 글 원고 고치기'],
      ['https://dash.cloudflare.com/', 'Cloudflare', '배포 상태, 캐시'],
      ['https://searchadvisor.naver.com/', '네이버 서치어드바이저', '검색 수집 요청'],
      ['https://search.google.com/search-console', '구글 서치콘솔', '검색 실적']
    ].filter(Boolean);
    $('#sysLinks').innerHTML = links.map(([href, label, sub]) =>
      `<li><a href="${href}" target="_blank" rel="noopener">${label} ↗</a>${sub ? `<span>${sub}</span>` : ''}</li>`).join('');
  }

  $('#admRefresh').addEventListener('click', async () => {
    const b = $('#admRefresh');
    b.disabled = true; b.textContent = '불러오는 중…';
    await loadAll();
    b.disabled = false; b.textContent = '새로고침';
    say('최신 상태로 불러왔습니다.', 'ok');
  });

  /* ---------- 시작 ---------- */
  function showGate(text, cta) {
    app.hidden = true;
    gate.hidden = false;
    gateText.innerHTML = text;
    gateCta.innerHTML = cta || '';
  }

  (async function init() {
    if (!Auth.enabled) {
      showGate('관리자 기능은 Supabase를 연결한 뒤에 사용할 수 있습니다. <br />순서는 <strong>기능활성화-가이드.md</strong>의 PART B · D를 따라 주세요.', '<a class="btn btn-line" href="/">홈으로</a>');
      return;
    }
    await Auth.ready;
    if (!Auth.user) {
      showGate('관리자 계정으로 로그인해 주세요.', '<a class="btn btn-primary" href="/login?next=%2Fadmin">로그인</a>');
      return;
    }
    const admin = await Auth.isAdmin();
    if (!admin) {
      showGate('이 페이지는 관리자만 볼 수 있습니다.', '<a class="btn btn-primary" href="/account">마이페이지로</a> <a class="btn btn-line" href="/">홈으로</a>');
      return;
    }
    gate.hidden = true;
    app.hidden = false;
    $('#admWho').textContent = `${Auth.displayName()}님, 오늘 확인할 내용을 정리했습니다.`;
    const start = (location.hash || '').slice(1);
    if ($(`.adm-tab[data-tab="${start}"]`)) showTab(start);
    await loadAll();
    checkMail();
  })();
})();
