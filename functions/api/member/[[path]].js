/* =========================================================
   /api/member/* — 회원가입 · 로그인 · 마이페이지 (Cloudflare D1)
   - 비밀번호는 PBKDF2(SHA-256, 10만 회)로 해시해 저장하고 원문은 어디에도 남기지 않는다
   - 로그인 유지: HttpOnly 쿠키 30일
   ========================================================= */
import {
  db, json, fail, notReady, readJson, clean, nowIso, guardPublicForm, rateLimit, visitorHash, sameOrigin,
  membersEnabled, hashPassword, checkPassword, memberCookies, clearMemberCookies, currentMember, publicMember, notifyMail
} from '../../_lib/core.js';

const TYPES = ['건물주 · 임대인', '공인중개사 · 중개법인', '예비창업자', '공간 운영자', '기업 · 기관 담당자', '기타'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const PHONE = /^[0-9+\-\s()]{8,20}$/;

function withCookies(res, cookies) {
  cookies.forEach((c) => res.headers.append('Set-Cookie', c));
  return res;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const route = parts.join('/');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && !sameOrigin(request)) return fail('허용되지 않은 요청입니다.', 403);

  const DB = await db(env).catch(() => null);
  if (route === 'me' && method === 'GET') {
    if (!DB || !membersEnabled(env)) return json({ ok: true, enabled: false, member: null });
    const me = await currentMember(request, env, DB);
    const res = json({ ok: true, enabled: true, member: publicMember(me) });
    return me ? res : withCookies(res, request.headers.get('Cookie') && /csj_mi=1/.test(request.headers.get('Cookie')) ? clearMemberCookies() : []);
  }
  if (!DB) return notReady();
  if (!membersEnabled(env)) return fail('회원 기능이 아직 켜지지 않았습니다.', 503, { code: 'no_members' });

  try {
    if (route === 'signup' && method === 'POST') return signup(DB, request, env);
    if (route === 'login' && method === 'POST') return login(DB, request, env);
    if (route === 'logout' && method === 'POST') return withCookies(json({ ok: true }), clearMemberCookies());
    if (route === 'reset-request' && method === 'POST') return resetRequest(DB, request, env, context.waitUntil);

    const me = await currentMember(request, env, DB);
    if (!me) return fail('로그인이 필요합니다.', 401, { code: 'auth' });

    if (route === 'me' && method === 'PATCH') {
      const b = await readJson(request, 5_000);
      const name = clean(b.name, 20);
      const phone = clean(b.phone, 20);
      if (name.length < 2) return fail('이름을 2자 이상 입력해 주세요.');
      if (phone && !PHONE.test(phone)) return fail('휴대폰 번호를 숫자와 하이픈(-)으로 입력해 주세요.');
      const type = TYPES.includes(b.type) ? b.type : '';
      await DB.prepare('UPDATE members SET name = ?, type = ?, phone = ?, marketing = ?, updated_at = ? WHERE id = ?')
        .bind(name, type, phone, b.marketing ? 1 : 0, nowIso(), me.id).run();
      return json({ ok: true, member: publicMember({ ...me, name, type, phone, marketing: b.marketing ? 1 : 0 }) });
    }
    if (route === 'password' && method === 'POST') {
      const b = await readJson(request, 2_000);
      if (!(await checkPassword(String(b.current || ''), me))) return fail('지금 쓰는 비밀번호가 맞지 않습니다.', 401);
      const pw = String(b.password || '');
      if (!PASSWORD.test(pw)) return fail('비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.');
      if (await checkPassword(pw, me)) return fail('지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.');
      const h = await hashPassword(pw);
      await DB.prepare('UPDATE members SET pw_hash = ?, pw_salt = ?, pw_iter = ?, updated_at = ? WHERE id = ?')
        .bind(h.hash, h.salt, h.iter, nowIso(), me.id).run();
      return withCookies(json({ ok: true }), await memberCookies(env, { ...me, pw_hash: h.hash }));
    }
    if (route === 'inquiries' && method === 'GET') {
      const rows = (await DB.prepare('SELECT id, created_at, type, message, status FROM inquiries WHERE member_id = ? ORDER BY created_at DESC LIMIT 50')
        .bind(me.id).all()).results || [];
      return json({ ok: true, inquiries: rows.map((r) => ({ ...r, status: r.status === '보관' ? '완료' : r.status })) });
    }
    if (route === 'me' && method === 'DELETE') {
      const b = await readJson(request, 2_000);
      if (!(await checkPassword(String(b.password || ''), me))) return fail('비밀번호가 맞지 않습니다.', 401);
      await DB.batch([
        DB.prepare('UPDATE inquiries SET member_id = NULL WHERE member_id = ?').bind(me.id),
        DB.prepare('DELETE FROM members WHERE id = ?').bind(me.id)
      ]);
      return withCookies(json({ ok: true }), clearMemberCookies());
    }
  } catch (e) {
    if (e && (e.message === 'too_large' || e.message === 'bad_json')) return fail('보낸 내용을 읽지 못했습니다.');
    return fail('처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
  return fail('없는 기능입니다.', 404);
}

async function signup(DB, request, env) {
  const b = await readJson(request, 5_000);
  const blocked = await guardPublicForm(DB, request, env, b, 'signup', 4);
  if (blocked) return fail(blocked, 429);
  const email = clean(b.email, 120).toLowerCase();
  const name = clean(b.name, 20);
  const pw = String(b.password || '');
  const phone = clean(b.phone, 20);
  if (name.length < 2) return fail('이름을 2자 이상 입력해 주세요.');
  if (!EMAIL.test(email)) return fail('이메일 주소를 다시 확인해 주세요.');
  if (!PASSWORD.test(pw)) return fail('비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.');
  if (phone && !PHONE.test(phone)) return fail('휴대폰 번호를 숫자와 하이픈(-)으로 입력해 주세요.');
  if (!b.agree) return fail('필수 항목에 모두 동의해 주세요.');
  const type = TYPES.includes(b.type) ? b.type : '기타';
  const exists = await DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
  if (exists) return fail('이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.', 409, { code: 'exists' });
  const h = await hashPassword(pw);
  const now = nowIso();
  const res = await DB.prepare(
    'INSERT INTO members (created_at, email, name, type, phone, marketing, pw_hash, pw_salt, pw_iter, last_login, login_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
  ).bind(now, email, name, type, phone, b.marketing ? 1 : 0, h.hash, h.salt, h.iter, now).run();
  const row = { id: res.meta && res.meta.last_row_id, email, name, type, phone, marketing: b.marketing ? 1 : 0, created_at: now, pw_hash: h.hash };
  return withCookies(json({ ok: true, member: publicMember(row) }), await memberCookies(env, row));
}

async function login(DB, request, env) {
  const b = await readJson(request, 2_000);
  const email = clean(b.email, 120).toLowerCase();
  const who = await visitorHash(request, env);
  if (!(await rateLimit(DB, `mlogin:${who}`, 12, 900)) || !(await rateLimit(DB, `mlogin-e:${email}`, 8, 900))) {
    return fail('로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.', 429);
  }
  const row = await DB.prepare("SELECT * FROM members WHERE email = ? AND status = 'active'").bind(email).first();
  if (!row || !(await checkPassword(String(b.password || ''), row))) return fail('이메일 또는 비밀번호가 맞지 않습니다.', 401);
  await DB.prepare('UPDATE members SET last_login = ?, login_count = login_count + 1 WHERE id = ?').bind(nowIso(), row.id).run();
  return withCookies(json({ ok: true, member: publicMember(row) }), await memberCookies(env, row));
}

/* 비밀번호 찾기 — 메일 발송 대신 관리자에게 요청을 남기고, 관리자가 임시 비밀번호를 안내한다 */
async function resetRequest(DB, request, env, waitUntil) {
  const b = await readJson(request, 2_000);
  const blocked = await guardPublicForm(DB, request, env, b, 'reset', 3);
  if (blocked) return fail(blocked, 429);
  const email = clean(b.email, 120).toLowerCase();
  if (!EMAIL.test(email)) return fail('이메일 주소를 다시 확인해 주세요.');
  const row = await DB.prepare('SELECT id, name, email FROM members WHERE email = ?').bind(email).first();
  if (row) {
    const recent = await DB.prepare("SELECT id FROM inquiries WHERE member_id = ? AND message LIKE '[비밀번호 재설정 요청]%' AND created_at > ?")
      .bind(row.id, new Date(Date.now() - 6 * 3600 * 1000).toISOString()).first();
    if (!recent) {
      await DB.prepare('INSERT INTO inquiries (created_at, type, name, contact, message, page, status, member_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(nowIso(), '기타 문의', row.name, row.email,
          '[비밀번호 재설정 요청] 로그인 화면에서 비밀번호 찾기를 눌렀습니다. 관리자 페이지 → 회원에서 임시 비밀번호를 만들어 이 이메일로 보내 주세요.',
          '/login', '접수', row.id).run();
      const job = notifyMail(env, `[홈페이지] 비밀번호 재설정 요청 · ${row.name}`, `${row.name}(${row.email}) 회원이 비밀번호 재설정을 요청했습니다.\n관리자 페이지 → 회원에서 임시 비밀번호를 만들어 보내 주세요.\n${new URL('/admin#members', request.url).href}`);
      if (waitUntil) waitUntil(job); else await job;
    }
  }
  return json({ ok: true });
}
