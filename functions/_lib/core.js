/* =========================================================
   최시준 홈페이지 — 서버 공통 도구 (Cloudflare Pages Functions)
   - 데이터는 Cloudflare D1 (바인딩 이름: DB)
   - 관리자 비밀번호는 환경 변수 ADMIN_PASSWORD (Secret)
   - 이 파일에는 비밀 값이 없습니다. 값은 Cloudflare 설정에만 넣습니다.
   ========================================================= */

export const INQUIRY_TYPES = [
  '공실개발 상담', '공간수익화 진단', '창업 교육 문의', '강의/세미나 문의',
  '인터뷰/미디어 문의', '제휴/공동사업 문의', '전자책 구매/단체구매 문의', '공간 이용·대관 문의', '기타 문의'
];
export const INQUIRY_STATUS = ['접수', '진행중', '완료', '보관'];
export const POST_CATEGORIES = ['제휴·협업', '질문', '정보공유', '후기·근황'];
export const REF_CATEGORIES = ['공간개발', '브랜드', '강의·교육', '파트너십', '언론·미디어'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS inquiries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     type TEXT NOT NULL DEFAULT '기타 문의',
     name TEXT NOT NULL DEFAULT '',
     contact TEXT NOT NULL DEFAULT '',
     message TEXT NOT NULL DEFAULT '',
     page TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT '접수',
     memo TEXT NOT NULL DEFAULT '',
     updated_at TEXT,
     ip_hash TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at)`,
  `CREATE TABLE IF NOT EXISTS posts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT '질문',
     author TEXT NOT NULL DEFAULT '',
     title TEXT NOT NULL DEFAULT '',
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     is_staff INTEGER NOT NULL DEFAULT 0,
     ip_hash TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS comments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     post_id INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     author TEXT NOT NULL DEFAULT '',
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     is_staff INTEGER NOT NULL DEFAULT 0,
     ip_hash TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
  `CREATE TABLE IF NOT EXISTS refs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     year TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT '공간개발',
     title TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     link TEXT NOT NULL DEFAULT '',
     image TEXT NOT NULL DEFAULT '',
     visible INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, t INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_hits ON hits(k, t)`,
  /* 방문 통계 — 페이지 조회 1건 = 1줄. IP·쿠키는 저장하지 않는다 */
  `CREATE TABLE IF NOT EXISTS pv (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     pid TEXT NOT NULL,
     ts INTEGER NOT NULL,
     day TEXT NOT NULL,
     hour INTEGER NOT NULL DEFAULT 0,
     path TEXT NOT NULL DEFAULT '/',
     title TEXT NOT NULL DEFAULT '',
     ref TEXT NOT NULL DEFAULT '',
     src TEXT NOT NULL DEFAULT '',
     srcd TEXT NOT NULL DEFAULT '',
     utm TEXT NOT NULL DEFAULT '',
     dev TEXT NOT NULL DEFAULT '',
     br TEXT NOT NULL DEFAULT '',
     os TEXT NOT NULL DEFAULT '',
     country TEXT NOT NULL DEFAULT '',
     region TEXT NOT NULL DEFAULT '',
     vid TEXT NOT NULL DEFAULT '',
     sid TEXT NOT NULL DEFAULT '',
     new_v INTEGER NOT NULL DEFAULT 0,
     new_s INTEGER NOT NULL DEFAULT 0,
     member INTEGER NOT NULL DEFAULT 0,
     dur INTEGER NOT NULL DEFAULT 0,
     scroll INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_pv_day ON pv(day)`,
  `CREATE INDEX IF NOT EXISTS idx_pv_pid ON pv(pid)`,
  `CREATE INDEX IF NOT EXISTS idx_pv_ts ON pv(ts)`,
  /* 클릭·전환 이벤트 */
  `CREATE TABLE IF NOT EXISTS ev (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,
     day TEXT NOT NULL,
     path TEXT NOT NULL DEFAULT '/',
     kind TEXT NOT NULL DEFAULT '',
     label TEXT NOT NULL DEFAULT '',
     target TEXT NOT NULL DEFAULT '',
     vid TEXT NOT NULL DEFAULT '',
     sid TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ev_day ON ev(day)`,
  /* 회원 — 비밀번호는 PBKDF2 해시로만 저장 */
  `CREATE TABLE IF NOT EXISTS members (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL DEFAULT '',
     type TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     marketing INTEGER NOT NULL DEFAULT 0,
     pw_hash TEXT NOT NULL,
     pw_salt TEXT NOT NULL,
     pw_iter INTEGER NOT NULL DEFAULT 100000,
     last_login TEXT,
     login_count INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'active',
     memo TEXT NOT NULL DEFAULT '',
     updated_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at)`,
  /* 전체 사이트 — 운영하는 홈페이지·플랫폼·프로젝트 목록 (관리자 '전체 사이트') */
  `CREATE TABLE IF NOT EXISTS sites (
     id TEXT PRIMARY KEY,
     sort INTEGER NOT NULL DEFAULT 5000,
     tier TEXT NOT NULL DEFAULT '그 외',
     cluster TEXT NOT NULL DEFAULT '',
     name TEXT NOT NULL DEFAULT '',
     url TEXT NOT NULL DEFAULT '',
     domain TEXT NOT NULL DEFAULT '',
     alt TEXT NOT NULL DEFAULT '',
     repo TEXT NOT NULL DEFAULT '',
     priv INTEGER NOT NULL DEFAULT 0,
     cf_kind TEXT NOT NULL DEFAULT '',
     cf_project TEXT NOT NULL DEFAULT '',
     storage TEXT NOT NULL DEFAULT '',
     entity TEXT NOT NULL DEFAULT '',
     stage TEXT NOT NULL DEFAULT '미분류',
     summary TEXT NOT NULL DEFAULT '',
     model TEXT NOT NULL DEFAULT '',
     memo TEXT NOT NULL DEFAULT '',
     naver INTEGER NOT NULL DEFAULT 0,
     google INTEGER NOT NULL DEFAULT 0,
     bing INTEGER NOT NULL DEFAULT 0,
     pages INTEGER NOT NULL DEFAULT 0,
     kpis TEXT NOT NULL DEFAULT '[]',
     chk_at TEXT,
     chk_code INTEGER,
     chk_ms INTEGER,
     chk_note TEXT,
     gh_pushed TEXT,
     archived INTEGER NOT NULL DEFAULT 0,
     seeded INTEGER NOT NULL DEFAULT 0,
     created_at TEXT,
     updated_at TEXT
   )`,
  /* 사이트별 월간 KPI — v: 직접 넣은 값, t: 목표 */
  `CREATE TABLE IF NOT EXISTS site_kpi (
     site TEXT NOT NULL,
     month TEXT NOT NULL,
     k TEXT NOT NULL,
     v REAL,
     t REAL,
     updated_at TEXT,
     PRIMARY KEY (site, month, k)
   )`,
  /* 다른 사이트의 방문 기록 (/api/c). IP·쿠키는 저장하지 않는다 */
  `CREATE TABLE IF NOT EXISTS xpv (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     site TEXT NOT NULL,
     pid TEXT NOT NULL,
     ts INTEGER NOT NULL,
     day TEXT NOT NULL,
     path TEXT NOT NULL DEFAULT '/',
     src TEXT NOT NULL DEFAULT '',
     srcd TEXT NOT NULL DEFAULT '',
     dev TEXT NOT NULL DEFAULT '',
     vid TEXT NOT NULL DEFAULT '',
     sid TEXT NOT NULL DEFAULT '',
     new_v INTEGER NOT NULL DEFAULT 0,
     new_s INTEGER NOT NULL DEFAULT 0,
     dur INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_xpv_site_day ON xpv(site, day)`,
  `CREATE INDEX IF NOT EXISTS idx_xpv_pid ON xpv(pid)`,
  `CREATE TABLE IF NOT EXISTS xev (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     site TEXT NOT NULL,
     ts INTEGER NOT NULL,
     day TEXT NOT NULL,
     path TEXT NOT NULL DEFAULT '/',
     kind TEXT NOT NULL DEFAULT '',
     label TEXT NOT NULL DEFAULT '',
     target TEXT NOT NULL DEFAULT '',
     vid TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS idx_xev_site_day ON xev(site, day)`,
  /* 문의 저장소가 없는 사이트의 문의를 대신 받아 두는 곳 (/api/lead) */
  `CREATE TABLE IF NOT EXISTS xleads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    site TEXT NOT NULL,
    kind TEXT,
    name TEXT,
    contact TEXT,
    message TEXT,
    page TEXT,
    data TEXT,
    ip_hash TEXT,
    status TEXT NOT NULL DEFAULT 'new'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_xleads_site ON xleads(site, id)`,
  /* 전체 문의 처리 기록: 어느 사이트 문의든 확인·회신 여부와 메모를 여기 남긴다 (k = 사이트|구분|접수번호) */
  `CREATE TABLE IF NOT EXISTS lead_marks (
    k TEXT PRIMARY KEY,
    site TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'seen',
    memo TEXT NOT NULL DEFAULT '',
    replied_at INTEGER,
    updated_at INTEGER NOT NULL
  )`,
  /* 운영 현황 — 사이트별 할 일 (site '*' = 전체 공통) */
  `CREATE TABLE IF NOT EXISTS site_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT '개선',
    title TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT '대표님',
    status TEXT NOT NULL DEFAULT '대기',
    due TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    done_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_site_tasks_site ON site_tasks(site, status)`,
  `CREATE TABLE IF NOT EXISTS admin_flags (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '', at TEXT)`
];

/** 예전에 만든 표에 새 칸 더하기 (이미 있으면 건너뜀) */
const MIGRATIONS = [
  ['inquiries', 'member_id', 'ALTER TABLE inquiries ADD COLUMN member_id INTEGER'],
  ['sites', 'ops', "ALTER TABLE sites ADD COLUMN ops TEXT NOT NULL DEFAULT ''"],
  ['sites', 'note', "ALTER TABLE sites ADD COLUMN note TEXT NOT NULL DEFAULT ''"],
  ['sites', 'inquiry_via', "ALTER TABLE sites ADD COLUMN inquiry_via TEXT NOT NULL DEFAULT ''"]
];

const SEED_POSTS = [
  ['2026-07-01T09:00:00+09:00', '후기·근황', '최시준', '커뮤니티 라운지를 엽니다',
   '건물주, 부동산, 예비창업자, 파트너 기업이 편하게 교류하는 공간이 되었으면 합니다. 공간에 대한 어떤 이야기든 환영하고, 모든 글에 성실히 답하겠습니다.'],
  ['2026-07-02T10:00:00+09:00', '정보공유', '최시준', '게시판 이용 안내 — 제휴 제안 이렇게 남겨주세요',
   '제휴·협업 카테고리에 ① 어떤 분야인지 ② 무엇을 함께하고 싶은지 ③ 간단한 소개를 남겨주시면, 검토 후 답글로 회신드립니다. 연락처·주소 등 개인정보는 게시판 대신 문의하기를 이용해주세요. 새 글과 답글은 운영자가 확인한 뒤 게시됩니다.']
];

let schemaReady = null;

/** D1 연결과 테이블 준비. 연결이 없으면 null */
export async function db(env) {
  if (!env || !env.DB) return null;
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
      for (const [table, col, sql] of MIGRATIONS) {
        try {
          const cols = (await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results || [];
          if (!cols.some((c) => c.name === col)) await env.DB.prepare(sql).run();
        } catch (_) { /* 다음 요청에서 다시 시도 */ }
      }
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM posts').first();
      if (row && row.n === 0) {
        await env.DB.batch(SEED_POSTS.map((p) => env.DB.prepare(
          "INSERT INTO posts (created_at, category, author, title, content, status, is_staff) VALUES (?, ?, ?, ?, ?, 'published', 1)"
        ).bind(...p)));
      }
    })().catch((e) => { schemaReady = null; throw e; });
  }
  await schemaReady;
  return env.DB;
}

export const nowIso = () => new Date().toISOString();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}
export const fail = (message, status = 400, extra = {}) => json({ ok: false, error: message, ...extra }, status);
export const notReady = () => fail('서버 저장소(D1)가 아직 연결되지 않았습니다.', 503, { code: 'no_db' });

export async function readJson(request, maxBytes = 1_200_000) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) throw new Error('too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('too_large');
  try { return JSON.parse(text || '{}'); } catch (_) { throw new Error('bad_json'); }
}

/** 문자열 정리: 앞뒤 공백 제거, 제어문자 제거, 길이 제한 */
export function clean(v, max = 200) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function hmac(secret, text) {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(text)));
}

/** 같은 길이로 비교 (시간 차이로 값을 추측하지 못하게) */
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** 방문자 IP는 저장하지 않고, 하루 단위로 바뀌는 해시만 남긴다 (스팸 방지용) */
export async function visitorHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const day = new Date().toISOString().slice(0, 10);
  return (await sha256(`${ip}|${day}|${env.ADMIN_PASSWORD || 'csj'}`)).slice(0, 24);
}

/** 간단한 요청 횟수 제한: windowSec 동안 key 로 limit 번까지 */
export async function rateLimit(DB, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await DB.prepare('SELECT COUNT(*) AS n FROM hits WHERE k = ? AND t > ?').bind(key, now - windowSec).first();
  if (row && row.n >= limit) return false;
  await DB.prepare('INSERT INTO hits (k, t) VALUES (?, ?)').bind(key, now).run();
  if (Math.random() < 0.05) await DB.prepare('DELETE FROM hits WHERE t < ?').bind(now - 86400 * 2).run();
  return true;
}

/** Cloudflare Turnstile (선택). TURNSTILE_SECRET 이 없으면 검사하지 않는다 */
export async function turnstileOk(env, token, request) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(token));
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await res.json();
    return Boolean(data && data.success);
  } catch (_) { return false; }
}

/** 공개 폼 공통 스팸 검사: 숨은 칸(hp), 작성 시간(t), 횟수 제한, Turnstile */
export async function guardPublicForm(DB, request, env, body, bucket, limit = 5, opts = {}) {
  if (body.hp) return '잘못된 요청입니다.';                       // 사람에게는 보이지 않는 칸
  const t = Number(body.t || 0);
  if (t && Date.now() - t < 2500) return '조금 천천히 다시 보내 주세요.';
  if (!opts.skipTurnstile && !(await turnstileOk(env, body.turnstile, request))) return '자동 등록 방지 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
  const who = await visitorHash(request, env);
  if (!(await rateLimit(DB, `${bucket}:${who}`, limit, 600))) return '짧은 시간에 너무 많이 보내셨습니다. 10분 뒤에 다시 시도해 주세요.';
  return '';
}

/* ---------------- 관리자 세션 ---------------- */
const COOKIE = 'csj_admin';
const SESSION_HOURS = 12;

async function sessionSecret(env) {
  return sha256(`${env.ADMIN_PASSWORD}|${env.SESSION_SECRET || 'choisijun-admin'}`);
}

export async function makeSession(env) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const sig = await hmac(await sessionSecret(env), `admin.${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
export const clearSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9]+)\\.([0-9a-f]{64})`));
  if (!m) return false;
  const exp = Number(m[1]);
  if (!exp || exp < Date.now()) return false;
  const expect = await hmac(await sessionSecret(env), `admin.${exp}`);
  return safeEqual(expect, m[2]);
}

/* ---------------- 회원 세션 ----------------
   csj_member = 회원번호.만료시각.서명 (HttpOnly) — 비밀번호를 바꾸면 기존 로그인은 모두 풀린다
   csj_mi = 1 (화면용 표시, 비밀 값 아님) — 로그인한 브라우저인지 스크립트가 알 수 있게 */
const M_COOKIE = 'csj_member';
const M_HINT = 'csj_mi';
const MEMBER_DAYS = 30;
/* 반복 횟수: Cloudflare 무료 요금제의 요청당 CPU 시간(10ms) 안에 끝나도록 정한 값.
   회원마다 무작위 salt를 쓰고, 로그인 시도는 15분당 횟수를 제한한다. 값은 회원별로 저장(pw_iter)하므로 나중에 올려도 기존 회원은 그대로 로그인된다 */
const PBKDF2_ITER = 40000;

export const membersEnabled = (env) => Boolean(env && env.DB && (env.ADMIN_PASSWORD || env.SESSION_SECRET));

async function memberSecret(env) {
  return sha256(`member|${env.SESSION_SECRET || ''}|${env.ADMIN_PASSWORD || ''}`);
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export function randomToken(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt = randomToken(16), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return { hash: b64(bits), salt, iter };
}

export async function checkPassword(password, row) {
  if (!row || !row.pw_hash) return false;
  const { hash } = await hashPassword(password, row.pw_salt, Number(row.pw_iter) || PBKDF2_ITER);
  return safeEqual(hash, row.pw_hash);
}

export async function memberCookies(env, row) {
  const exp = Date.now() + MEMBER_DAYS * 86400 * 1000;
  const sig = await hmac(await memberSecret(env), `m.${row.id}.${exp}.${String(row.pw_hash).slice(0, 16)}`);
  const age = MEMBER_DAYS * 86400;
  return [
    `${M_COOKIE}=${row.id}.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`,
    `${M_HINT}=1; Path=/; Secure; SameSite=Lax; Max-Age=${age}`
  ];
}
export const clearMemberCookies = () => [
  `${M_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  `${M_HINT}=; Path=/; Secure; SameSite=Lax; Max-Age=0`
];

/** 로그인한 회원 (없으면 null) */
export async function currentMember(request, env, DB) {
  if (!membersEnabled(env)) return null;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${M_COOKIE}=([0-9]+)\\.([0-9]+)\\.([0-9a-f]{64})`));
  if (!m) return null;
  const id = Number(m[1]);
  const exp = Number(m[2]);
  if (!id || !exp || exp < Date.now()) return null;
  const row = await DB.prepare("SELECT * FROM members WHERE id = ? AND status = 'active'").bind(id).first();
  if (!row) return null;
  const expect = await hmac(await memberSecret(env), `m.${row.id}.${exp}.${String(row.pw_hash).slice(0, 16)}`);
  return safeEqual(expect, m[3]) ? row : null;
}

export const hasMemberCookie = (request) => /(?:^|;\s*)csj_member=\d/.test(request.headers.get('Cookie') || '');

/** 회원 정보 중 화면에 보내도 되는 것만 */
export const publicMember = (r) => r && ({
  id: r.id, email: r.email, name: r.name, type: r.type, phone: r.phone,
  marketing: Boolean(r.marketing), created_at: r.created_at
});

/** 한국 시간 기준 날짜(YYYY-MM-DD)와 시(0~23) */
export function kst(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

/** 다른 사이트에서 보낸 요청 막기 (상태를 바꾸는 요청) */
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch (_) { return false; }
}

/* ---------------- 메일 알림 (선택: Resend) ---------------- */
export async function notifyMail(env, subject, text) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || '최시준 홈페이지 <onboarding@resend.dev>',
        to: String(env.NOTIFY_EMAIL).split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        text
      })
    });
    return res.ok;
  } catch (_) { return false; }
}

/* ---------------- 내부 파일 숨기기 ----------------
   원고·설정·서버 코드 폴더(/content, /tools, /functions, /setup, /fragments, /data)는
   홈페이지 주소로 열리지 않게 404 페이지를 보여 준다. (GitHub 저장소에는 그대로 있음) */
export async function hiddenFolder({ request, env }) {
  let body = 'Not found';
  let type = 'text/plain; charset=utf-8';
  try {
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url).toString()));
      if (res.ok || res.status === 404) { body = await res.text(); type = 'text/html; charset=utf-8'; }
    }
  } catch (_) { /* 기본 문구 */ }
  return new Response(body, { status: 404, headers: { 'Content-Type': type, 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } });
}
