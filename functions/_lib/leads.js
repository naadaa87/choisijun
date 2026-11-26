/* =========================================================
   관리자 '전체 문의' — 각 사이트 DB에 쌓인 고객 문의를 한 화면에서 보기
   /api/admin/leads
   - 문의를 이쪽으로 복사하지 않는다. 각 사이트의 D1을 이 홈페이지에 연결(바인딩)해 두고, 볼 때마다 그 자리에서 읽는다
   - 각 사이트 DB는 읽기만 한다. 확인·회신 여부와 메모는 이 홈페이지의 lead_marks 표에 따로 남긴다
   - 연결은 wrangler.toml 의 [[d1_databases]]·[[kv_namespaces]] 에서 관리한다 (변수 이름 = 아래 bind)
   - 문의 저장소가 없는 사이트는 /api/lead 로 이 홈페이지에 직접 보내고(xleads 표), 여기서 함께 보인다
   ========================================================= */
import { json, fail, clean, kst } from './core.js';
import { SELF_ID } from './sites-seed.js';

const J = (...parts) => `TRIM(${parts.join(" || ' ' || ")})`;
const N = (c) => `COALESCE(${c}, '')`;
const P = (prefix, c) => `COALESCE('${prefix}' || NULLIF(${c}, ''), '')`;      // 값이 있을 때만 '· 값'

/* site: 전체 사이트의 id / bind: D1 변수 이름 / q: ref·at·kind·name·contact·text·status(·extra) 로 맞춘 조회 / by: 최신순 기준 칸
   tz: 시간대 표시가 없는 날짜 글자를 어느 시간으로 볼지 (기본 UTC) */
export const LEAD_SOURCES = [
  { site: SELF_ID, bind: 'DB', label: '문의', by: 'created_at',
    q: `SELECT id AS ref, created_at AS at, type AS kind, name, contact, message AS text, status FROM inquiries` },
  { site: SELF_ID, bind: 'DB', label: '제휴·협업', by: 'created_at',
    q: `SELECT id AS ref, created_at AS at, kind, ${J(N('company'), N('name'), P('· ', 'role'))} AS name, ${J(N('phone'), N('email'))} AS contact, message AS text, stage AS status,
        json_object('함께하고 싶은 사업', brands, '규모·예산', budget, '희망 시기', timing, '참고 링크', link) AS extra FROM partnerships` },
  { site: 'ssople', bind: 'DB_SSOPLE', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, kind, ${J(N('name'), N('org'))} AS name, ${N('contact')} AS contact, ${N('body')} AS text, status FROM inquiries` },
  { site: 'restel', bind: 'DB_RESTEL', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, ${J('kind', 'topic')} AS kind, name, ${J('phone', 'email')} AS contact, message AS text, status FROM inquiries` },
  { site: 'megaspot', bind: 'DB_MEGASPOT', label: '대관 문의', by: 'id',
    q: `SELECT ref, created_at AS at, space_id AS kind, ${N('name')} AS name, ${J(N('phone'), N('email'))} AS contact,
        TRIM(${P('행사일 ', 'event_date')} || COALESCE(' · ' || headcount || '명', '')) AS text, status, data AS extra FROM inquiries` },
  { site: 'mezzanine', bind: 'DB_MEZZANINE', label: '대관 문의', by: 'id',
    q: `SELECT code AS ref, created_at AS at, ${J(N('kind'), N('event_type'))} AS kind, ${J(N('name'), N('company'))} AS name, ${J(N('phone'), N('email'))} AS contact,
        TRIM(${N('venue')} || ${P(' · ', 'date_start')} || COALESCE(' · ' || headcount || '명', '') || ${P(' · 예산 ', 'budget')} || COALESCE(char(10) || message, '')) AS text, status FROM inquiries` },
  { site: 'mezzanine', bind: 'DB_MEZZANINE', label: '소개서 요청', by: 'id',
    q: `SELECT code AS ref, created_at AS at, '소개서 요청' AS kind, ${J(N('name'), N('company'))} AS name, ${J(N('phone'), N('email'))} AS contact,
        TRIM(${N('event_type')} || ${P(' · ', 'event_month')} || COALESCE(' · ' || headcount || '명', '') || COALESCE(char(10) || message, '')) AS text, status FROM leads` },
  { site: 'mezzanine', bind: 'DB_MEZZANINE', label: '공간 제휴 신청', by: 'id',
    q: `SELECT code AS ref, created_at AS at, '공간 제휴 신청' AS kind, ${J(N('name'), N('company'))} AS name, ${J(N('phone'), N('email'))} AS contact,
        TRIM(${N('address')} || ${P(' · ', 'building_type')} || ${P(' · ', 'area')} || COALESCE(char(10) || message, '')) AS text, status FROM partner_apps` },
  { site: 'socialfactory', bind: 'DB_SOCIALFACTORY', label: '문의', by: 'id', tz: 'kst',
    q: `SELECT receipt AS ref, created_at AS at, purpose AS kind, ${J('name', N('company'))} AS name, ${J('phone', N('email'))} AS contact,
        TRIM(${N('space')} || ${P(' · ', 'when_text')} || ${P(' · ', 'people')} || char(10) || message) AS text, status FROM inquiries` },
  { site: 'vacancy', bind: 'DB_VACANCY', label: '공실개발 문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, type AS kind, ${J('name', N('role'))} AS name, ${J('phone', 'email')} AS contact,
        TRIM(address || ${P(' · ', 'floor_area')} || char(10) || message) AS text, CASE WHEN handled = 1 THEN 'done' ELSE 'new' END AS status FROM inquiries` },
  { site: 'seuseurolab', bind: 'DB_SEUSEURO', label: '상담 접수', by: 'id',
    q: `SELECT id AS ref, created_at AS at, ${J('service', N('kind'))} AS kind, name, ${J('phone', 'email')} AS contact,
        TRIM(${N('region')} || COALESCE(char(10) || message, '')) AS text, status FROM leads` },
  { site: 'orbis-estate', bind: 'DB_ORBIS', label: '상담 접수', by: 'created_at',
    q: `SELECT id AS ref, created_at AS at, ${N('type')} AS kind, ${N('name')} AS name, ${J(N('phone'), N('email'))} AS contact, ${N('summary')} AS text, status FROM leads` },
  { site: 'wonsangtaero', bind: 'DB_WONSANGTAERO', label: '상담 접수', by: 'created_ts',
    q: `SELECT id AS ref, created_at AS at, applicant_type || ' · ' || space_type AS kind, contact_name AS name, ${J('contact_phone', N('contact_email'))} AS contact,
        TRIM(region_sido || ' ' || region_sigungu || ' · ' || area_range || ${P(' · 퇴거 ', 'exit_date')} || COALESCE(char(10) || note, '')) AS text, '' AS status FROM consultations` },
  { site: 'coremood', bind: 'DB_COREMOOD', label: '문의', by: 'created_at',
    q: `SELECT id AS ref, created_at AS at, ${N('type')} AS kind, ${N('name')} AS name, ${J(N('phone'), N('email'))} AS contact,
        TRIM(${N('biz')} || ${P(' · ', 'region')} || ${P(' · ', 'area')} || ${P(' · 예산 ', 'budget')} || COALESCE(char(10) || note, '')) AS text, status FROM cm_inquiries` },
  { site: 'rulerule', bind: 'DB_RULERULE', label: '문의', by: 'id', tz: 'kst',
    q: `SELECT id AS ref, created_at AS at, kind, ${J('name', 'org')} AS name, ${J('phone', 'email')} AS contact, TRIM(title || char(10) || message) AS text, status FROM inquiries` },
  { site: 'myeonmyeon', bind: 'DB_MYEONMYEON', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, kind, ${J('name', 'org')} AS name, ${J('phone', 'email')} AS contact, TRIM(title || char(10) || message) AS text, status FROM inquiries` },
  { site: 'myeonmyeon', bind: 'DB_MYEONMYEON', label: '정보 제보·오류', by: 'id', soft: true,
    q: `SELECT id AS ref, created_at AS at, kind, '' AS name, ${N('contact')} AS contact, TRIM(${P('라면 ', 'slug')} || char(10) || message) AS text, status FROM reports` },
  { site: 'mychallenge', bind: 'DB_MYCHALLENGE', label: '참가 신청', by: 'id',
    q: `SELECT id AS ref, created_at AS at, '참가 신청' AS kind, name, ${J(N('phone'), 'email')} AS contact, '' AS text, status, form AS extra FROM applications` },
  { site: 'bareunbp', bind: 'DB_BAREUNBP', label: '제휴·문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, type AS kind, ${J(N('name'), N('org'))} AS name, contact, ${N('message')} AS text, status FROM leads` },
  { site: 'bagstop', bind: 'DB_BAGSTOP', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, ${J('who', 'topic')} AS kind, name, email AS contact, TRIM(booking_code || char(10) || body) AS text, status FROM inquiries` },
  { site: 'eightletters-web', bind: 'DB_YEODEOL', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, category AS kind, '' AS name, ${N('email')} AS contact, message AS text, status FROM inquiries` },
  { site: 'passionstore', bind: 'DB_PASSIONSTORE', label: '신청', by: 'created_at',
    q: `SELECT id AS ref, created_at AS at, type AS kind, ${N('name')} AS name, ${J(N('phone'), N('email'))} AS contact, '' AS text, status, data AS extra FROM applications` },
  { site: 'writerchoi', bind: 'DB_WRITERCHOI', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, category AS kind, name, ${J(N('phone'), 'email')} AS contact, message AS text, status FROM choihee_inquiries` },
  { site: 'honplace', bind: 'DB_HONPLACE', label: '공간 제보', by: 'created_at', soft: true,
    q: `SELECT id AS ref, created_at AS at, CASE WHEN fix_id IS NULL THEN '공간 제보' ELSE '수정 제안' END AS kind, '' AS name, '' AS contact,
        TRIM(name || ${P(' · ', 'area')} || char(10) || note) AS text, status FROM submissions` },
  { site: 'todaypartyroom', bind: 'DB_TODAYPARTYROOM', label: '문의·신고', by: 'id',
    q: `SELECT id AS ref, created_at AS at, kind, '' AS name, ${N('contact')} AS contact, content AS text, status FROM reports` },
  { site: 'myworks', bind: 'DB_MYWORKS', label: '사용자 의견', by: 'created_at', soft: true,
    q: `SELECT id AS ref, created_at AS at, COALESCE(kind, '의견') AS kind, ${J(N('name'), N('ws_name'))} AS name, ${N('contact')} AS contact, body AS text, status FROM fb` },
  { site: 'guspacedev', bind: 'DB_GUSPACE', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, ${J(N('who'), N('space'))} AS kind, ${N('name')} AS name, ${J(N('phone'), N('email'))} AS contact,
        TRIM(${N('location')} || ${P(' · ', 'size')} || COALESCE(char(10) || message, '')) AS text, status FROM inquiries` },
  { site: 'ssople', bind: 'DB_SSOPLE', label: '공간 입점 신청', by: 'id', where: 'submitted_at IS NOT NULL',
    q: `SELECT id AS ref, submitted_at AS at, CASE kind WHEN 'link' THEN '링크 입점' ELSE '신규 입점' END AS kind, ${N('name')} AS name, ${N('contact')} AS contact,
        TRIM(${N('region')} || ${P(' · ', 'area')}) AS text, status, data AS extra FROM space_apps` },
  { site: 'eightletters-web', bind: 'DB_YEODEOL', label: '출시 알림 신청', by: 'id', soft: true,
    q: `SELECT id AS ref, created_at AS at, product AS kind, '' AS name, email AS contact, '' AS text, CASE WHEN notified_at IS NULL THEN 'pending' ELSE 'done' END AS status FROM waitlist` },
  /* 문의 저장소가 없는 사이트가 /api/lead 로 보낸 것 — 줄마다 사이트가 다르다 */
  { site: '*', central: true, bind: 'DB', label: '문의', by: 'id',
    q: `SELECT id AS ref, created_at AS at, kind, name, contact, message AS text, status, data AS extra, site FROM xleads` }
];

/* KV 에 문의를 저장하는 사이트 (D1 이 아니라 키·값 저장소) */
export const KV_SOURCES = [
  { site: 'pvit', bind: 'KV_PVIT', label: '호스트 입점 신청', mode: 'index', prefix: 'apply' },
  { site: 'pvit', bind: 'KV_PVIT', label: '예약 요청', mode: 'index', prefix: 'booking' },
  { site: 'pvit', bind: 'KV_PVIT', label: '문의', mode: 'index', prefix: 'contact' },
  { site: 'hantang-web', bind: 'KV_HANTANG', label: '업소 등록 신청', mode: 'list', prefix: 'sub:' }
];

/** 날짜 값(숫자·ISO·'YYYY-MM-DD HH:MM:SS')을 밀리초로 */
export function toMs(v, tz) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' || /^\d{9,14}$/.test(String(v))) { const n = Number(v); return n < 1e11 ? n * 1000 : n; }
  const s = String(v).trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) { const t = Date.parse(s); return Number.isNaN(t) ? 0 : t; }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) { const t = Date.parse(s); return Number.isNaN(t) ? 0 : t; }
  const t = Date.parse(`${m[1]}T${m[2] || '00:00:00'}${tz === 'kst' ? '+09:00' : 'Z'}`);
  return Number.isNaN(t) ? 0 : t;
}

export const NEW = /^(new|open|pending|received|접수|문의 접수|신규|대기|미확인|unread|submitted)$/i;
export const STATUS_KO = { new: '새 문의', open: '새 문의', pending: '대기', received: '접수', submitted: '접수', done: '완료', closed: '완료', resolved: '완료', replied: '답변함', answered: '답변함',
  contacted: '연락함', in_progress: '진행 중', progress: '진행 중', working: '진행 중', approved: '승인', rejected: '반려', hold: '보류', spam: '스팸', archived: '보관', skip: '넘김', won: '계약', lost: '종료' };

/** JSON 으로 저장된 신청서에서 읽을 만한 내용만 뽑는다 (이름·연락처·동의·내부 값은 뺀다) */
export function extraText(raw) {
  if (!raw) return '';
  let o;
  try { o = JSON.parse(raw); } catch (_) { return ''; }
  if (!o || typeof o !== 'object') return '';
  const skip = /^(name|phone|tel|email|contact|consent|agree|privacy|marketing|token|ip|ua|user_agent|hp|t|turnstile|member_id|uid|password|pw)/i;
  const out = [];
  const walk = (obj, depth) => {
    for (const [k, v] of Object.entries(obj)) {
      if (skip.test(k) || v == null || v === '' || v === false) continue;
      if (typeof v === 'object') { if (depth < 1 && !Array.isArray(v)) walk(v, depth + 1); else if (Array.isArray(v) && v.length && v.every((x) => typeof x !== 'object')) out.push(`${k}: ${v.join(', ')}`); continue; }
      out.push(`${k}: ${String(v).slice(0, 300)}`);
      if (out.length >= 14) return;
    }
  };
  walk(o, 0);
  return out.join('\n').slice(0, 1200);
}

export async function readSource(env, src, limit, onlySite) {
  const DB = env[src.bind];
  if (!DB) return { src, ok: false, error: '연결 전', rows: [] };
  try {
    const conds = [];
    const args = [];
    if (src.where) conds.push(src.where);
    if (src.central && onlySite) { conds.push('site = ?'); args.push(onlySite); }
    const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
    const rows = (await DB.prepare(`${src.q}${where} ORDER BY ${src.by} DESC LIMIT ?`).bind(...args, limit).all()).results || [];
    return { src, ok: true, rows };
  } catch (e) {
    const msg = String((e && e.message) || e);
    return { src, ok: false, error: /no such table/i.test(msg) ? '아직 문의 표가 없음 (첫 문의 전)' : /no such column/i.test(msg) ? '표 구조가 달라 읽지 못함' : '읽지 못함', detail: msg.slice(0, 160), rows: [] };
  }
}

/* KV 에 쌓인 신청서를 문의 모양으로 바꾼다 */
const KV_NAME = ['name', 'contact_name', 'hostName', 'host_name', 'company', 'name_ko', 'nickname'];
const KV_PHONE = ['phone', 'contact_phone', 'tel', 'mobile'];
const KV_MAIL = ['email', 'contact_email'];
const KV_TEXT = ['message', 'memo', 'note', 'request', 'desc_ko', 'content', 'text'];
const KV_USED = new Set(['id', 'ref', 'receivedAt', 'created', 'at', 'status', 'type', 'kind', 'category', 'address', 'photos', ...KV_NAME, ...KV_PHONE, ...KV_MAIL, ...KV_TEXT]);
const kvPick = (o, keys) => { for (const k of keys) if (o && o[k] != null && String(o[k]).trim()) return String(o[k]).trim(); return ''; };

export async function readKv(env, src, limit) {
  const KV = env[src.bind];
  if (!KV) return { src, ok: false, error: '연결 전', rows: [] };
  try {
    let ids = [];
    if (src.mode === 'index') {
      const idx = JSON.parse((await KV.get(`${src.prefix}:_index`)) || '[]');
      ids = idx.slice(0, limit).map((x) => `${src.prefix}:${x.id}`);
    } else {
      const keys = [];
      let cursor;
      for (let n = 0; n < 5; n++) {
        const page = await KV.list({ prefix: src.prefix, cursor });
        keys.push(...page.keys);
        if (page.list_complete || !page.cursor) break;
        cursor = page.cursor;
      }
      keys.sort((a, b) => String((b.metadata || {}).created || '').localeCompare(String((a.metadata || {}).created || '')));
      ids = keys.slice(0, limit).map((k) => k.name);
    }
    const recs = await Promise.all(ids.map((k) => KV.get(k, 'json').catch(() => null)));
    const rows = recs.filter(Boolean).map((r) => {
      const phone = kvPick(r, KV_PHONE);
      const email = kvPick(r, KV_MAIL);
      return {
        ref: r.id || '', at: r.receivedAt || r.created || r.at || '',
        kind: clean(r.type || r.kind || r.category || '', 60),
        name: kvPick(r, KV_NAME), contact: [phone, email].filter(Boolean).join(' · '),
        text: [[r.name_ko, r.address].filter(Boolean).join(' · '), kvPick(r, KV_TEXT)].filter(Boolean).join('\n'),
        status: r.status || '', extra: JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !KV_USED.has(k))))
      };
    });
    return { src, ok: true, rows };
  } catch (e) {
    return { src, ok: false, error: '읽지 못함', detail: String((e && e.message) || e).slice(0, 160), rows: [] };
  }
}

export const leadKey = (site, label, ref) => `${site}|${label}|${ref}`;
const OPEN_MARK = { seen: true, hold: true };                 // 확인만 했거나 보류 = 아직 회신 전
export const MARK_STATES = { seen: '확인함', replied: '회신함', done: '처리 완료', hold: '보류', spam: '스팸·무관' };

export async function leads(DB, env, request) {
  const u = new URL(request.url).searchParams;
  const only = clean(u.get('site'), 48);
  const per = only ? 200 : 60;
  const names = Object.fromEntries(((await DB.prepare('SELECT id, name, url FROM sites').all()).results || []).map((r) => [r.id, r]));
  const list = LEAD_SOURCES.filter((s) => !only || s.central || s.site === only);
  const kvList = KV_SOURCES.filter((s) => !only || s.site === only);
  const got = await Promise.all([
    ...list.map((s) => readSource(env, s, per, only)),
    ...kvList.map((s) => readKv(env, s, per))
  ]);
  const marks = Object.fromEntries((((await DB.prepare('SELECT k, state, memo, replied_at, updated_at FROM lead_marks').all().catch(() => null)) || {}).results || []).map((m) => [m.k, m]));
  const monthAgo = Date.now() - 30 * 86400 * 1000;
  const items = [];
  const sources = [];
  got.forEach(({ src, ok, error, detail, rows }) => {
    const counts = {};                                           // 사이트별 (중앙 접수는 줄마다 사이트가 다르다)
    rows.forEach((r) => {
      const siteId = src.central ? String(r.site || '') : src.site;
      if (only && siteId !== only) return;
      const site = names[siteId] || { name: siteId, url: '' };
      const label = src.central ? '문의(최시준 접수)' : src.label;
      const ref = String(r.ref == null ? '' : r.ref);
      const at = toMs(r.at, src.tz);
      const status = String(r.status == null ? '' : r.status).trim();
      const key = leadKey(siteId, label, ref);
      const mark = marks[key] || null;
      const isNew = mark ? Boolean(OPEN_MARK[mark.state]) : (NEW.test(status) || (!status && at > monthAgo));
      const c = counts[siteId] || (counts[siteId] = { count: 0, fresh: 0, name: site.name, url: site.url });
      c.count++; if (isNew && !src.soft) c.fresh++;
      const text = [clean(r.text, 3000), extraText(r.extra)].filter(Boolean).join('\n');
      items.push({
        key, site: siteId, siteName: site.name, siteUrl: site.url, label, soft: Boolean(src.soft), central: Boolean(src.central), ref,
        at, kind: clean(r.kind, 80), name: clean(r.name, 120), contact: clean(r.contact, 160), text,
        status: STATUS_KO[status.toLowerCase()] || status, isNew,
        mark: mark ? { state: mark.state, label: MARK_STATES[mark.state] || mark.state, memo: mark.memo || '', repliedAt: mark.replied_at || 0, at: mark.updated_at } : null
      });
    });
    if (src.central) {
      Object.entries(counts).forEach(([id, c]) => sources.push({ site: id, siteName: c.name, url: c.url, label: '문의(최시준 접수)', central: true, ok: true, error: '', detail: '', count: c.count, fresh: c.fresh, full: false }));
      if (!ok) sources.push({ site: SELF_ID, siteName: (names[SELF_ID] || {}).name || SELF_ID, url: '', label: '문의(최시준 접수)', central: true, ok, error: error || '', detail: detail || '', count: 0, fresh: 0, full: false });
      return;
    }
    const site = names[src.site] || { name: src.site, url: '' };
    const c = counts[src.site] || { count: 0, fresh: 0 };
    sources.push({ site: src.site, siteName: site.name, url: site.url, label: src.label, ok, error: error || '', detail: detail || '', count: c.count, fresh: c.fresh, full: rows.length >= per, soft: Boolean(src.soft) });
  });
  items.sort((a, b) => b.at - a.at);
  let notify = null;
  try { const n = await DB.prepare("SELECT v FROM admin_flags WHERE k = 'notify_last'").first(); if (n) notify = JSON.parse(n.v); } catch (_) { notify = null; }
  return json({ ok: true, now: Date.now(), per, states: MARK_STATES, items: items.slice(0, only ? 400 : 800), sources, notify });
}

/** 전체 문의에서 확인·회신 표시와 메모 남기기: POST /api/admin/leads/mark { key, state, memo } — state 가 '' 면 표시를 지운다 */
export async function markLead(DB, body) {
  const key = clean(body && body.key, 300);
  const parts = key.split('|');
  if (parts.length < 3 || !parts[0]) return fail('어느 문의인지 알 수 없습니다.');
  const state = clean(body.state, 20);
  const memo = clean(body.memo, 2000);
  const now = Date.now();
  if (!state) {
    await DB.prepare('DELETE FROM lead_marks WHERE k = ?').bind(key).run();
    return json({ ok: true, key, mark: null });
  }
  if (!MARK_STATES[state]) return fail('알 수 없는 상태입니다.');
  const prev = await DB.prepare('SELECT replied_at FROM lead_marks WHERE k = ?').bind(key).first();
  const repliedAt = state === 'replied' ? (prev && prev.replied_at) || now : (prev && prev.replied_at) || null;
  await DB.prepare(`INSERT INTO lead_marks (k, site, state, memo, replied_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(k) DO UPDATE SET state = excluded.state, memo = excluded.memo, replied_at = excluded.replied_at, updated_at = excluded.updated_at`)
    .bind(key, parts[0], state, memo, repliedAt, now).run();
  return json({ ok: true, key, mark: { state, label: MARK_STATES[state], memo, repliedAt: repliedAt || 0, at: now } });
}

/** 전체 KPI용: 사이트별 · 달별 문의 수 (최근 것부터 최대 3,000건씩 날짜만 읽어 센다) */
/**
 * 연결된 모든 문의 저장소에서 접수 시각만 모은다 (사이트 · 밀리초).
 * sinceMs 보다 오래된 문의는 뺀다. seen: 읽기에 성공한 사이트
 */
export async function leadTimes(env, sinceMs, onlySite) {
  const items = [];
  const seen = {};
  const push = (site, ms) => { if (ms && ms >= sinceMs) items.push({ site, ms }); };
  const list = LEAD_SOURCES.filter((s) => !s.soft && env[s.bind] && (s.central || (s.site !== SELF_ID && (!onlySite || s.site === onlySite))));
  await Promise.all(list.map(async (src) => {
    try {
      const table = (src.q.match(/FROM (\w+)\s*$/) || [])[1];
      const col = (src.q.match(/(\w+) AS at\b/) || [])[1] || 'created_at';
      if (!table) return;
      const conds = [];
      const args = [];
      if (src.where) conds.push(src.where);
      if (src.central && onlySite) { conds.push('site = ?'); args.push(onlySite); }
      const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
      const rows = (await env[src.bind].prepare(`SELECT ${col} AS c${src.central ? ', site' : ''} FROM ${table}${where} ORDER BY ${src.by} DESC LIMIT 3000`).bind(...args).all()).results || [];
      if (!src.central) seen[src.site] = true;
      rows.forEach((r) => {
        const site = src.central ? r.site : src.site;
        if (src.central) seen[site] = true;
        push(site, toMs(r.c, src.tz));
      });
    } catch (_) { /* 표가 아직 없으면 건너뜀 */ }
  }));
  await Promise.all(KV_SOURCES.filter((s) => env[s.bind] && (!onlySite || s.site === onlySite)).map(async (src) => {
    try {
      const { ok, rows } = await readKv(env, src, 300);
      if (!ok) return;
      seen[src.site] = true;
      rows.forEach((r) => push(src.site, toMs(r.at)));
    } catch (_) { /* 건너뜀 */ }
  }));
  return { items, seen };
}

/** 사이트별 · 달별 문의 수 (전체 KPI 표) */
export async function leadCounts(env, months, onlySite) {
  const first = months[0];
  const out = {};        // out[site][month] = n
  const { items, seen } = await leadTimes(env, Date.parse(first + '-01T00:00:00+09:00') - 86400000, onlySite);
  items.forEach(({ site, ms }) => {
    const m = kst(ms).day.slice(0, 7);
    if (m < first) return;
    const bucket = out[site] || (out[site] = {});
    bucket[m] = (bucket[m] || 0) + 1;
  });
  return { counts: out, seen };
}
