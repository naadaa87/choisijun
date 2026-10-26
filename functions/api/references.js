/* GET /api/references — 관리자 페이지에서 등록한 레퍼런스 (공개된 것만) */
import { db, json, notReady } from '../_lib/core.js';

export async function onRequestGet({ env }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  const rows = (await DB.prepare(
    'SELECT id, created_at, year, category, title, description, link, image FROM refs WHERE visible = 1 ORDER BY year DESC, created_at DESC LIMIT 200'
  ).all()).results || [];
  return json({ ok: true, refs: rows }, 200, { 'Cache-Control': 'public, max-age=60' });
}
