/* =========================================================
   /api/partnership — 제휴·협업 제안
   GET  : 지금 찾고 있는 파트너 (관리자에서 공개로 둔 것)
   POST : 제휴·협업 제안 접수 → 관리자 '제휴·협업' + 전체 문의 + 메일 알림
   ========================================================= */
import { db, json, fail, notReady, readJson, clean, nowIso, guardPublicForm, visitorHash, notifyMail, PARTNER_KINDS } from '../_lib/core.js';

export async function onRequestGet({ env }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = (await DB.prepare(
    "SELECT id, kind, title, who, summary, offer, closes_at FROM partner_calls WHERE visible = 1 AND (closes_at = '' OR closes_at >= ?) ORDER BY sort, id DESC LIMIT 20"
  ).bind(today).all()).results || [];
  return json({ ok: true, calls: rows }, 200, { 'Cache-Control': 'public, max-age=60' });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  let body;
  try { body = await readJson(request, 30_000); } catch (_) { return fail('보낸 내용을 읽지 못했습니다.'); }

  const blocked = await guardPublicForm(DB, request, env, body, 'ptn', 4);
  if (blocked) return fail(blocked, 429);

  const kind = PARTNER_KINDS.includes(body.kind) ? body.kind : '기타 제휴';
  const company = clean(body.company, 80);
  const name = clean(body.name, 40);
  const role = clean(body.role, 40);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 120);
  const brands = (Array.isArray(body.brands) ? body.brands : String(body.brands || '').split(','))
    .map((x) => clean(x, 40)).filter(Boolean).slice(0, 12).join(', ');
  const message = clean(body.message, 5000);
  const budget = clean(body.budget, 80);
  const timing = clean(body.timing, 80);
  let link = clean(body.link, 300);
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  const callId = Number(body.call_id) > 0 ? Number(body.call_id) : null;

  if (!name) return fail('담당자 성함을 적어 주세요.');
  if (!phone && !email) return fail('연락받으실 휴대전화나 이메일 가운데 하나는 꼭 적어 주세요.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('이메일 주소를 다시 확인해 주세요.');
  if (message.length < 10) return fail('제안 내용을 10자 이상 적어 주세요.');
  if (body.agree !== true) return fail('개인정보 수집·이용에 동의해 주셔야 접수할 수 있습니다.');

  const now = nowIso();
  const res = await DB.prepare(
    `INSERT INTO partnerships (created_at, updated_at, kind, company, name, role, phone, email, brands, message, budget, timing, link, call_id, page, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(now, now, kind, company, name, role, phone, email, brands, message, budget, timing, link, callId,
    clean(body.page, 120), await visitorHash(request, env)).run();
  const id = res.meta && res.meta.last_row_id;
  await DB.prepare("INSERT INTO partnership_log (partnership_id, at, kind, text) VALUES (?, ?, 'stage', '제안 접수')").bind(id, now).run().catch(() => {});

  const lines = [
    `새 제휴·협업 제안이 들어왔습니다.`, '',
    `유형: ${kind}`, `회사·기관: ${company || '-'}`, `담당자: ${name}${role ? ` (${role})` : ''}`,
    `연락처: ${[phone, email].filter(Boolean).join(' · ')}`,
    brands ? `함께하고 싶은 사업: ${brands}` : '', budget ? `규모·예산: ${budget}` : '', timing ? `희망 시기: ${timing}` : '', link ? `참고 링크: ${link}` : '',
    '', message, '', '관리자: https://choisijun.com/admin#partners'
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0));
  const job = notifyMail(env, `[제휴·협업 제안] ${kind} · ${company || name}`, lines.join('\n'));
  if (waitUntil) waitUntil(job); else await job;

  return json({ ok: true, id });
}
