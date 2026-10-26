/* /api/community
   GET  — 게시된 글과 답글 (누구나)
   POST — 새 글 (운영자 확인 후 게시) */
import { db, json, fail, notReady, readJson, clean, nowIso, guardPublicForm, visitorHash, notifyMail, POST_CATEGORIES } from '../../_lib/core.js';

export async function onRequestGet({ request, env }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 100));
  const posts = (await DB.prepare(
    "SELECT id, created_at, category, author, title, content, is_staff FROM posts WHERE status = 'published' ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all()).results || [];
  let comments = [];
  if (posts.length) {
    const ids = posts.map((p) => p.id);
    comments = (await DB.prepare(
      `SELECT id, post_id, created_at, author, content, is_staff FROM comments WHERE status = 'published' AND post_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at ASC`
    ).bind(...ids).all()).results || [];
  }
  const byPost = {};
  comments.forEach((c) => { (byPost[c.post_id] = byPost[c.post_id] || []).push(c); });
  return json({ ok: true, posts: posts.map((p) => ({ ...p, comments: byPost[p.id] || [] })) },
    200, { 'Cache-Control': 'public, max-age=30' });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  let body;
  try { body = await readJson(request, 20_000); } catch (_) { return fail('보낸 내용을 읽지 못했습니다.'); }
  const blocked = await guardPublicForm(DB, request, env, body, 'post', 4);
  if (blocked) return fail(blocked, 429);

  const author = clean(body.author, 20);
  const category = POST_CATEGORIES.includes(body.category) ? body.category : '질문';
  const title = clean(body.title, 80);
  const content = clean(body.content, 3000);
  if (!author || !title || content.length < 2) return fail('닉네임, 제목, 내용을 모두 적어 주세요.');
  if (/^(최시준|운영자|관리자)$/.test(author)) return fail('이 닉네임은 쓸 수 없습니다.');

  await DB.prepare(
    "INSERT INTO posts (created_at, category, author, title, content, status, is_staff, ip_hash) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)"
  ).bind(nowIso(), category, author, title, content, await visitorHash(request, env)).run();

  const job = notifyMail(env, `[커뮤니티] 새 글 확인 요청 · ${title}`, `${author} 님이 글을 남겼습니다.\n\n[${category}] ${title}\n\n${content}\n\n— 관리자 페이지에서 게시 여부를 정해 주세요.`);
  if (waitUntil) waitUntil(job); else await job;
  return json({ ok: true, pending: true });
}
