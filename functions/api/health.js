/* GET /api/health — 홈페이지 스크립트가 서버 기능을 쓸 수 있는지 확인 (비밀 값은 내보내지 않음) */
import { db, json } from '../_lib/core.js';

export async function onRequestGet({ env }) {
  let dbOk = false;
  try { dbOk = Boolean(await db(env)); } catch (_) { dbOk = false; }
  return json({
    ok: dbOk,
    db: dbOk,
    admin: Boolean(env.ADMIN_PASSWORD),
    turnstile: Boolean(env.TURNSTILE_SECRET)
  });
}
