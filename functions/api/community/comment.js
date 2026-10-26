/* POST /api/community/comment — 답글 (운영자 확인 후 게시) */
import { db, json, fail, notReady, readJson, clean, nowIso, guardPublicForm, visitorHash } from '../../_lib/core.js';

export async function onRequestPost({ request, env }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  let body;
  try { body = await readJson(request, 10_000); } catch (_) { return fail('보낸 내용을 읽지 못했습니다.'); }
  const blocked = await guardPublicForm(DB, request, env, body, 'cmt', 8, { skipTurnstile: true });   // 답글은 운영자 확인 후 게시
  if (blocked) return fail(blocked, 429);

  const postId = Number(body.post_id);
  const author = clean(body.author, 20);
  const content = clean(body.content, 800);
  if (!postId || !author || content.length < 1) return fail('닉네임과 답글 내용을 적어 주세요.');
  if (/^(최시준|운영자|관리자)$/.test(author)) return fail('이 닉네임은 쓸 수 없습니다.');
  const post = await DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(postId).first();
  if (!post) return fail('글을 찾을 수 없습니다.', 404);

  await DB.prepare(
    "INSERT INTO comments (post_id, created_at, author, content, status, is_staff, ip_hash) VALUES (?, ?, ?, ?, 'pending', 0, ?)"
  ).bind(postId, nowIso(), author, content, await visitorHash(request, env)).run();
  return json({ ok: true, pending: true });
}
