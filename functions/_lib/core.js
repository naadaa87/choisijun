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
  `CREATE INDEX IF NOT EXISTS idx_hits ON hits(k, t)`
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
