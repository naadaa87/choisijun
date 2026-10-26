/* POST /api/inquiry — 문의하기·상담 신청 접수 */
import { db, json, fail, notReady, readJson, clean, nowIso, guardPublicForm, visitorHash, notifyMail, INQUIRY_TYPES } from '../_lib/core.js';

export async function onRequestPost({ request, env, waitUntil }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  let body;
  try { body = await readJson(request, 20_000); } catch (_) { return fail('보낸 내용을 읽지 못했습니다.'); }

  const blocked = await guardPublicForm(DB, request, env, body, 'inq', 5);
  if (blocked) return fail(blocked, 429);

  const type = INQUIRY_TYPES.includes(body.type) ? body.type : '기타 문의';
  const name = clean(body.name, 60);
  const contact = clean(body.contact, 120);
  const message = clean(body.message, 4000);
  const page = clean(body.page, 120);
  if (!name || !contact || message.length < 2) return fail('성함, 연락처, 문의 내용을 모두 적어 주세요.');
  if (body.agree === false) return fail('개인정보 수집·이용에 동의해 주셔야 접수할 수 있습니다.');

  const created = nowIso();
  const res = await DB.prepare(
    'INSERT INTO inquiries (created_at, type, name, contact, message, page, status, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(created, type, name, contact, message, page, '접수', await visitorHash(request, env)).run();
  const id = res.meta && res.meta.last_row_id;

  const text = `새 문의가 접수되었습니다.\n\n유형: ${type}\n성함/소속: ${name}\n연락처: ${contact}\n\n${message}\n\n— 관리자 페이지: ${new URL('/admin', request.url).href}`;
  const job = notifyMail(env, `[홈페이지 문의] ${type} · ${name}`, text);
  if (waitUntil) waitUntil(job); else await job;

  return json({ ok: true, id });
}
