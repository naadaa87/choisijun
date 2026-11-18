/* =========================================================
   관리자 '전체 문의' — 각 사이트 DB에 쌓인 고객 문의를 한 화면에서 보기
   /api/admin/leads
   - 문의를 이쪽으로 복사하지 않는다. 각 사이트의 D1을 이 홈페이지에 연결(바인딩)해 두고, 볼 때마다 그 자리에서 읽는다
   - 읽기만 한다. 상태 변경·답변은 각 사이트의 관리자 화면에서 한다
   - 연결은 wrangler.toml 의 [[d1_databases]] 에서 관리한다 (변수 이름 = 아래 bind)
   ========================================================= */
import { json, clean, kst } from './core.js';
import { SELF_ID } from './sites-seed.js';

const J = (...parts) => `TRIM(${parts.join(" || ' ' || ")})`;
const N = (c) => `COALESCE(${c}, '')`;
const P = (prefix, c) => `COALESCE('${prefix}' || NULLIF(${c}, ''), '')`;      // 값이 있을 때만 '· 값'

/* site: 전체 사이트의 id / bind: D1 변수 이름 / q: ref·at·kind·name·contact·text·status(·extra) 로 맞춘 조회 / by: 최신순 기준 칸
   tz: 시간대 표시가 없는 날짜 글자를 어느 시간으로 볼지 (기본 UTC) */
export const LEAD_SOURCES = [
  { site: SELF_ID, bind: 'DB', label: '문의', by: 'created_at',
    q: `SELECT id AS ref, created_at AS at, type AS kind, name, contact, message AS text, status FROM inquiries` },
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
    q: `SELECT id AS ref, created_at AS at, COALESCE(kind, '의견') AS kind, ${J(N('name'), N('ws_name'))} AS name, ${N('contact')} AS contact, body AS text, status FROM fb` }
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

const NEW = /^(new|open|pending|received|접수|문의 접수|신규|대기|미확인|unread|submitted)$/i;
const STATUS_KO = { new: '새 문의', open: '새 문의', pending: '대기', received: '접수', submitted: '접수', done: '완료', closed: '완료', resolved: '완료', replied: '답변함', answered: '답변함',
  contacted: '연락함', in_progress: '진행 중', progress: '진행 중', working: '진행 중', approved: '승인', rejected: '반려', hold: '보류', spam: '스팸', archived: '보관', skip: '넘김', won: '계약', lost: '종료' };

/** JSON 으로 저장된 신청서에서 읽을 만한 내용만 뽑는다 (이름·연락처·동의·내부 값은 뺀다) */
function extraText(raw) {
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

async function readSource(env, src, limit) {
  const DB = env[src.bind];
  if (!DB) return { src, ok: false, error: '연결 전', rows: [] };
  try {
    const rows = (await DB.prepare(`${src.q} ORDER BY ${src.by} DESC LIMIT ?`).bind(limit).all()).results || [];
    return { src, ok: true, rows };
  } catch (e) {
    const msg = String((e && e.message) || e);
    return { src, ok: false, error: /no such table/i.test(msg) ? '아직 문의 표가 없음 (첫 문의 전)' : /no such column/i.test(msg) ? '표 구조가 달라 읽지 못함' : '읽지 못함', detail: msg.slice(0, 160), rows: [] };
  }
}

export async function leads(DB, env, request) {
  const u = new URL(request.url).searchParams;
  const only = clean(u.get('site'), 48);
  const per = only ? 200 : 60;
  const names = Object.fromEntries(((await DB.prepare('SELECT id, name, url FROM sites').all()).results || []).map((r) => [r.id, r]));
  const list = LEAD_SOURCES.filter((s) => !only || s.site === only);
  const got = await Promise.all(list.map((s) => readSource(env, s, per)));
  const items = [];
  const sources = [];
  got.forEach(({ src, ok, error, detail, rows }) => {
    const site = names[src.site] || { name: src.site, url: '' };
    let fresh = 0;
    rows.forEach((r) => {
      const status = String(r.status == null ? '' : r.status).trim();
      const isNew = NEW.test(status);
      if (isNew) fresh++;
      const text = [clean(r.text, 3000), extraText(r.extra)].filter(Boolean).join('\n');
      items.push({
        site: src.site, siteName: site.name, label: src.label, soft: Boolean(src.soft), ref: String(r.ref == null ? '' : r.ref),
        at: toMs(r.at, src.tz), kind: clean(r.kind, 80), name: clean(r.name, 120), contact: clean(r.contact, 160), text,
        status: STATUS_KO[status.toLowerCase()] || status, isNew
      });
    });
    sources.push({ site: src.site, siteName: site.name, url: site.url, label: src.label, ok, error: error || '', detail: detail || '', count: rows.length, fresh, full: rows.length >= per });
  });
  items.sort((a, b) => b.at - a.at);
  return json({ ok: true, now: Date.now(), per, items: items.slice(0, only ? 400 : 600), sources });
}

/** 전체 KPI용: 사이트별 · 달별 문의 수 (최근 것부터 최대 3,000건씩 날짜만 읽어 센다) */
export async function leadCounts(env, months, onlySite) {
  const first = months[0];
  const list = LEAD_SOURCES.filter((s) => !s.soft && s.site !== SELF_ID && env[s.bind] && (!onlySite || s.site === onlySite));
  const out = {};        // out[site][month] = n
  const seen = {};       // 읽기에 성공한 사이트
  await Promise.all(list.map(async (src) => {
    try {
      const table = (src.q.match(/FROM (\w+)\s*$/) || [])[1];
      const col = (src.q.match(/(\w+) AS at\b/) || [])[1] || 'created_at';
      if (!table) return;
      const rows = (await env[src.bind].prepare(`SELECT ${col} AS c FROM ${table} ORDER BY ${src.by} DESC LIMIT 3000`).all()).results || [];
      seen[src.site] = true;
      const bucket = out[src.site] || (out[src.site] = {});
      rows.forEach((r) => {
        const ms = toMs(r.c, src.tz);
        if (!ms) return;
        const m = kst(ms).day.slice(0, 7);
        if (m >= first) bucket[m] = (bucket[m] || 0) + 1;
      });
    } catch (_) { /* 표가 아직 없으면 건너뜀 */ }
  }));
  return { counts: out, seen };
}
