/* =========================================================
   /api/vacancy — 공실 등록
   POST : 건물주·중개사가 남긴 공실 정보 → 관리자 '공실 등록' + 전체 문의 + 메일 알림
   ========================================================= */
import { db, json, fail, notReady, readJson, clean, nowIso, guardPublicForm, visitorHash, notifyMail, VAC } from '../_lib/core.js';

const PY = 3.305785;   // 1평 = 3.305785㎡
const pick = (v, list) => (list.includes(v) ? v : '');
const many = (v, list) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter((x) => list.includes(x));

export async function onRequestPost({ request, env, waitUntil }) {
  const DB = await db(env).catch(() => null);
  if (!DB) return notReady();
  let b;
  try { b = await readJson(request, 30_000); } catch (_) { return fail('보낸 내용을 읽지 못했습니다.'); }

  const blocked = await guardPublicForm(DB, request, env, b, 'vac', 5);
  if (blocked) return fail(blocked, 429);

  const v = {
    role: pick(b.role, VAC.roles) || '기타',
    sido: pick(b.sido, VAC.sido),
    sigungu: clean(b.sigungu, 30),
    dong: clean(b.dong, 30),
    floors: many(b.floors, VAC.floors).join(', '),
    floor_note: clean(b.floor_note, 60),
    area_unit: b.area_unit === '㎡' ? '㎡' : '평',
    vacant_for: pick(b.vacant_for, VAC.vacantFor),
    state: pick(b.state, VAC.states),
    deposit: clean(b.deposit, 40),
    rent: clean(b.rent, 40),
    mgmt: clean(b.mgmt, 40),
    features: many(b.features, VAC.features).join(', '),
    wants: many(b.wants, VAC.wants).join(', '),
    link: clean(b.link, 300),
    note: clean(b.note, 3000),
    name: clean(b.name, 40),
    org: clean(b.org, 60),
    phone: clean(b.phone, 40),
    email: clean(b.email, 120),
    contact_time: pick(b.contact_time, VAC.times),
    page: clean(b.page, 160)
  };
  const area = Number(String(b.area || '').replace(/[^\d.]/g, ''));
  v.area = Number.isFinite(area) && area > 0 && area < 1_000_000 ? Math.round(area * 10) / 10 : null;
  v.area_py = v.area == null ? null : Math.round((v.area_unit === '㎡' ? v.area / PY : v.area) * 10) / 10;
  if (v.link && !/^https?:\/\//i.test(v.link)) v.link = 'https://' + v.link;

  if (!v.sido) return fail('공간이 있는 시·도를 골라 주세요.');
  if (!v.sigungu) return fail('시·군·구를 적어 주세요.');
  if (!v.floors) return fail('몇 층인지 하나 이상 골라 주세요.');
  if (!v.wants) return fail('원하시는 방향을 하나 이상 골라 주세요.');
  if (!v.name) return fail('성함을 적어 주세요.');
  if (!v.phone && !v.email) return fail('연락받으실 휴대전화나 이메일 가운데 하나는 꼭 적어 주세요.');
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail('이메일 주소를 다시 확인해 주세요.');
  if (b.agree !== true) return fail('개인정보 수집·이용에 동의해 주셔야 등록할 수 있습니다.');

  const now = nowIso();
  const cols = ['created_at', 'updated_at', ...Object.keys(v), 'ip_hash'];
  const vals = [now, now, ...Object.values(v), await visitorHash(request, env)];
  const res = await DB.prepare(`INSERT INTO vacancies (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...vals).run();
  const id = res.meta && res.meta.last_row_id;
  await DB.prepare("INSERT INTO vacancy_log (vacancy_id, at, kind, text) VALUES (?, ?, 'stage', '공실 등록 접수')").bind(id, now).run().catch(() => {});

  const where = [v.sido, v.sigungu, v.dong].filter(Boolean).join(' ');
  const size = v.area ? `${v.area}${v.area_unit}${v.area_unit === '㎡' ? ` (약 ${v.area_py}평)` : ''}` : '면적 미입력';
  const lines = [
    '새 공실 등록이 들어왔습니다.', '',
    `위치: ${where}`, `층: ${v.floors}${v.floor_note ? ` (${v.floor_note})` : ''}`, `면적: ${size}`,
    `비어 있던 기간: ${v.vacant_for || '-'}`, `지금 상태: ${v.state || '-'}`,
    `임대 조건: 보증금 ${v.deposit || '-'} / 월 ${v.rent || '-'} / 관리비 ${v.mgmt || '-'}`,
    `건물 조건: ${v.features || '-'}`, `원하는 방향: ${v.wants}`,
    v.link ? `자료: ${v.link}` : '', v.note ? `\n추가 설명:\n${v.note}` : '', '',
    `등록한 분: ${v.name}${v.org ? ` · ${v.org}` : ''} (${v.role})`,
    `연락처: ${[v.phone, v.email].filter(Boolean).join(' · ')}${v.contact_time ? ` · 편한 시간 ${v.contact_time}` : ''}`, '',
    '관리자에서 보기: https://choisijun.com/admin#vacancies'
  ].filter((x) => x !== '');
  const job = notifyMail(env, `[공실 등록] ${where} · ${v.floors} · ${size}`, lines.join('\n'));
  if (waitUntil) waitUntil(job); else await job;

  return json({ ok: true, id });
}
