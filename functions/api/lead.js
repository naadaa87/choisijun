/* =========================================================
   POST /api/lead — 문의 저장소가 없는 사이트의 문의를 대신 받아 두기
   - 관리자 '전체 사이트'에 등록된 주소에서 보낸 것만 받는다 (보낸 곳의 주소로 사이트를 구분)
   - 받은 문의는 xleads 표에 쌓이고, 관리자 '전체 문의'에 그 사이트 이름으로 나온다
   - 새 문의가 오면 RESEND_API_KEY · NOTIFY_EMAIL 이 설정돼 있을 때 메일로도 알린다
   - 보내는 쪽 예: fetch('https://choisijun.com/api/lead', { method:'POST', body: JSON.stringify({ kind, name, phone, email, message, page }) })
   ========================================================= */
import { db, json, clean, nowIso, guardPublicForm, visitorHash, notifyMail } from '../_lib/core.js';
import { siteOf } from './c.js';

const NAME_KEYS = ['name', 'contact_name', 'company', 'org', 'host_name', 'nickname'];
const PHONE_KEYS = ['phone', 'tel', 'mobile', 'contact_phone', 'hp_no'];
const MAIL_KEYS = ['email', 'mail', 'contact_email'];
const TEXT_KEYS = ['message', 'msg', 'text', 'body', 'content', 'memo', 'note', 'question', 'detail', 'desc'];
const SKIP = /^(hp|t|_hp|_t|turnstile|token|access_key|agree\w*|consent\w*|privacy|subject|_form|_page|_at|site|page)$/i;

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store'
  };
}

const pick = (o, keys) => { for (const k of keys) if (o[k] != null && String(o[k]).trim()) return String(o[k]).trim(); return ''; };

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const H = cors(request);
  const reply = (body, status = 200) => json(body, status, H);
  let host = '';
  try { host = new URL(request.headers.get('Origin') || request.headers.get('Referer') || '').host.toLowerCase(); } catch (_) { host = ''; }
  const DB = await db(env).catch(() => null);
  if (!DB) return reply({ ok: false, error: '잠시 후 다시 시도해 주세요.' }, 503);
  const site = host ? await siteOf(DB, host) : '';
  if (!site) return reply({ ok: false, error: '등록되지 않은 사이트입니다.' }, 403);

  const raw = await request.text();
  if (raw.length > 30_000) return reply({ ok: false, error: '내용이 너무 깁니다.' }, 413);
  let b = null;
  try { b = JSON.parse(raw); } catch (_) {
    try { b = Object.fromEntries(new URLSearchParams(raw)); } catch (__) { b = null; }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return reply({ ok: false, error: '보낸 내용을 읽지 못했습니다.' }, 400);
  if (b._hp || b.website) return reply({ ok: true });                      // 사람에게 보이지 않는 칸에 값이 있으면 조용히 버린다

  const blocked = await guardPublicForm(DB, request, env, { hp: '', t: 0 }, `lead:${site}`, 6, { skipTurnstile: true });
  if (blocked) return reply({ ok: false, error: blocked }, 429);

  const name = clean(pick(b, NAME_KEYS), 80);
  const phone = clean(pick(b, PHONE_KEYS), 40);
  const email = clean(pick(b, MAIL_KEYS), 120);
  const contact = clean(b.contact && !phone && !email ? b.contact : [phone, email].filter(Boolean).join(' · '), 160);
  const message = clean(pick(b, TEXT_KEYS), 4000);
  const kind = clean(b.kind || b._form || b.type || b.form || '문의', 40);
  const page = clean(b.page || b._page || '', 160);
  if (!contact && !message && !name) return reply({ ok: false, error: '연락처나 문의 내용을 적어 주세요.' }, 400);

  /* 나머지 항목(지역·면적·관심사 등)은 그대로 묶어 둔다 */
  const used = new Set([...NAME_KEYS, ...PHONE_KEYS, ...MAIL_KEYS, ...TEXT_KEYS, 'contact', 'kind', 'type', 'form']);
  const rest = {};
  for (const [k, v] of Object.entries(b)) {
    if (used.has(k) || SKIP.test(k) || k.length > 40 || v == null || v === '' || v === false) continue;
    if (typeof v === 'object') { if (Array.isArray(v) && v.every((x) => typeof x !== 'object')) rest[k] = v.slice(0, 20).map((x) => clean(x, 80)); continue; }
    rest[k] = clean(v, 400);
    if (Object.keys(rest).length >= 24) break;
  }

  const res = await DB.prepare('INSERT INTO xleads (created_at, site, kind, name, contact, message, page, data, ip_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(nowIso(), site, kind, name, contact, message, page, Object.keys(rest).length ? JSON.stringify(rest) : null, await visitorHash(request, env), 'new').run();
  const id = res.meta && res.meta.last_row_id;

  const siteRow = await DB.prepare('SELECT name FROM sites WHERE id = ?').bind(site).first().catch(() => null);
  const siteName = (siteRow && siteRow.name) || site;
  const lines = Object.entries(rest).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n');
  const text = `${siteName}에 새 문의가 들어왔습니다.\n\n구분: ${kind}\n이름: ${name || '-'}\n연락처: ${contact || '-'}\n${page ? `보낸 화면: ${page}\n` : ''}\n${message}${lines ? `\n\n${lines}` : ''}\n\n— 전체 문의: https://choisijun.com/admin#leads`;
  const job = notifyMail(env, `[${siteName} 문의] ${kind}${name ? ' · ' + name : ''}`, text);
  if (waitUntil) waitUntil(job); else await job;

  return reply({ ok: true, id });
}

export function onRequestGet({ request }) {
  return json({ ok: false, error: 'POST 로 보내 주세요.' }, 405, cors(request));
}
