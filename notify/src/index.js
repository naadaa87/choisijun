/* =========================================================
   choisijun-notify — 새 문의 메일 알림 + 일일 리포트
   - 매시간(크론) 각 사이트의 문의 저장소를 읽어, 아직 알리지 않은 문의를 한 건마다 메일 한 통으로 보낸다
   - 읽는 곳과 방식은 관리자 '전체 문의'와 같다 (../../functions/_lib/leads.js)
   - 이미 알린 문의는 choisijun-db 의 lead_notified 표에 남겨 두 번 보내지 않는다
   - 처음 실행할 때는 그동안 쌓인 문의를 '알린 것'으로만 표시하고 메일은 보내지 않는다 (지난 문의 수백 통 방지)
   - 고객이 이메일을 남겼으면 메일의 '답장 받는 주소'를 고객 이메일로 둬서, Gmail 에서 바로 답장할 수 있다
   - 매일 아침 DIGEST_HOUR(한국 시각, 기본 8시)에는 전날을 정리한 일일 리포트를 한 통 보낸다 (./digest.js)
   ========================================================= */
import { EmailMessage } from 'cloudflare:email';
import { LEAD_SOURCES, KV_SOURCES, readSource, readKv, toMs, extraText, leadKey, STATUS_KO } from '../../functions/_lib/leads.js';
import { buildMime } from './mime.js';
import { runHealth, runPrep, runDigest, digestFlag } from './digest.js';
import { runIndexNow, indexNowStatus } from './indexnow.js';

const PER_SOURCE = 30;          // 출처마다 최근 몇 건까지 볼지 (일일 리포트 때는 60)
const MAX_MAILS = 15;           // 한 번에 낱개로 보낼 최대 통수 (넘으면 나머지는 한 통으로 묶음)
const FRESH_DAYS = 7;           // 이보다 오래된 문의는 새로 알리지 않음

const clean = (v, max = 4000) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

async function ensureTables(DB) {
  await DB.batch([
    DB.prepare('CREATE TABLE IF NOT EXISTS lead_notified (k TEXT PRIMARY KEY, site TEXT NOT NULL, at INTEGER, sent_at INTEGER NOT NULL, mailed INTEGER NOT NULL DEFAULT 0)'),
    DB.prepare("CREATE TABLE IF NOT EXISTS admin_flags (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '', at TEXT)")
  ]);
}

/** 모든 출처에서 최근 문의를 모은다 */
async function collect(env, per = PER_SOURCE) {
  const names = Object.fromEntries((((await env.DB.prepare('SELECT id, name FROM sites').all().catch(() => null)) || {}).results || []).map((r) => [r.id, r.name]));
  const got = await Promise.all([
    ...LEAD_SOURCES.map((s) => readSource(env, s, per)),
    ...KV_SOURCES.map((s) => readKv(env, s, per))
  ]);
  const items = [];
  const errors = [];
  got.forEach(({ src, ok, error, rows }) => {
    if (!ok && error !== '연결 전' && !/첫 문의 전/.test(error || '')) errors.push(`${src.site}:${src.label}:${error}`);
    rows.forEach((r, rank) => {
      const site = src.central ? String(r.site || '') : src.site;
      const label = src.central ? '문의(최시준 접수)' : src.label;
      const ref = String(r.ref == null ? '' : r.ref);
      const status = String(r.status == null ? '' : r.status).trim();
      items.push({
        key: leadKey(site, label, ref), site, siteName: names[site] || site, label, ref, soft: Boolean(src.soft),
        at: toMs(r.at, src.tz), kind: clean(r.kind, 80), name: clean(r.name, 120), contact: clean(r.contact, 200),
        text: [clean(r.text, 3000), extraText(r.extra)].filter(Boolean).join('\n'), status: STATUS_KO[status.toLowerCase()] || status, raw: status, rank
      });
    });
  });
  return { items, errors };
}

/* ---------------- 메일 보내기 ---------------- */
const kstText = (ms) => {
  if (!ms) return '시각 정보 없음';
  const d = new Date(ms + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const emailOf = (s) => (String(s || '').match(/[^\s@,·<>]+@[^\s@,·<>]+\.[^\s@,·<>]{2,}/) || [])[0] || '';

async function send(env, msg) {
  const raw = buildMime({ from: env.NOTIFY_FROM, to: env.NOTIFY_TO, fromName: msg.fromName || '최시준 문의 알림', subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo });
  await env.MAIL.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw));
}
const sendDigest = (env) => (m) => send(env, { ...m, fromName: '최시준 일일 리포트' });

function oneMail(env, it) {
  const label = it.label.replace('(최시준 접수)', '');
  const subject = `[${it.siteName}] 새 ${label}${it.kind ? ' · ' + it.kind : ''}${it.name ? ' · ' + it.name : ''}`;
  const replyTo = emailOf(it.contact);
  const text = [
    `${it.siteName}에 새 문의가 들어왔습니다.`,
    '',
    `구분      ${it.label}`,
    `접수 시각  ${kstText(it.at)}`,
    it.kind ? `유형      ${it.kind}` : '',
    `이름·소속  ${it.name || '-'}`,
    `연락처    ${it.contact || '-'}`,
    `접수번호  ${it.ref}`,
    '',
    '----- 문의 내용 -----',
    it.text || '(내용 없음)',
    '',
    replyTo ? '이 메일에 바로 답장하면 고객 이메일로 갑니다.' : '',
    `전체 문의에서 보기: ${env.ADMIN_URL}`,
    '',
    '— 최시준 홈페이지 문의 알림 (매시간 확인)'
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  return { subject, text, replyTo };
}

function digestMail(env, list) {
  const subject = `[문의 알림] 새 문의 ${list.length}건이 더 있습니다`;
  const text = [
    `한 번에 보내는 메일 수를 넘어, 나머지 ${list.length}건을 한 통으로 묶었습니다.`,
    '',
    ...list.map((it, i) => `${i + 1}. [${it.siteName}] ${it.label}${it.kind ? ' · ' + it.kind : ''} · ${it.name || '이름 없음'} · ${it.contact || '연락처 없음'} · ${kstText(it.at)}\n   ${(it.text || '').replace(/\s+/g, ' ').slice(0, 160)}`),
    '',
    `전체 문의에서 보기: ${env.ADMIN_URL}`
  ].join('\n');
  return { subject, text };
}

/* ---------------- 한 번 확인하기 ---------------- */
async function run(env, reason, per = PER_SOURCE) {
  const DB = env.DB;
  await ensureTables(DB);
  const now = Date.now();
  const got = await collect(env, per);
  const { items, errors } = got;
  const keys = items.map((i) => i.key);
  const known = new Set();
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const rows = (await DB.prepare(`SELECT k FROM lead_notified WHERE k IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results || [];
    rows.forEach((r) => known.add(r.k));
  }
  const baseline = await DB.prepare("SELECT v FROM admin_flags WHERE k = 'notify_baseline'").first();
  const fresh = items.filter((i) => !known.has(i.key));
  const mark = (list, mailed) => list.map((it) => DB.prepare('INSERT OR IGNORE INTO lead_notified (k, site, at, sent_at, mailed) VALUES (?, ?, ?, ?, ?)').bind(it.key, it.site, it.at || null, now, mailed ? 1 : 0));

  let sent = 0;
  let skipped = 0;
  const failed = [];
  if (!baseline) {
    /* 첫 실행: 지금까지 쌓인 문의는 메일 없이 '알린 것'으로만 표시 */
    const stmts = mark(fresh, false);
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
    await DB.prepare("INSERT OR REPLACE INTO admin_flags (k, v, at) VALUES ('notify_baseline', ?, ?)").bind(String(fresh.length), new Date(now).toISOString()).run();
    skipped = fresh.length;
  } else {
    /* 7일보다 오래됐거나, 리포트 때문에 평소(30건)보다 깊이 읽어서 처음 보이는 문의는 메일 없이 표시만 한다 */
    const old = fresh.filter((it) => (it.at && it.at < now - FRESH_DAYS * 86400 * 1000) || it.rank >= PER_SOURCE);
    const todo = fresh.filter((it) => !old.includes(it)).sort((a, b) => a.at - b.at);
    skipped = old.length;
    const done = [];
    for (const it of todo.slice(0, MAX_MAILS)) {
      try { await send(env, oneMail(env, it)); done.push(it); sent++; } catch (e) { failed.push(`${it.key}: ${String((e && e.message) || e).slice(0, 120)}`); }
    }
    const rest = todo.slice(MAX_MAILS);
    if (rest.length) {
      try { await send(env, digestMail(env, rest)); done.push(...rest); sent++; } catch (e) { failed.push(`묶음: ${String((e && e.message) || e).slice(0, 120)}`); }
    }
    const stmts = [...mark(done, true), ...mark(old, false)];
    for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
  }
  const report = { at: new Date(now).toISOString(), reason, checked: items.length, fresh: fresh.length, sent, skipped, failed, errors, baseline: !baseline };
  await DB.prepare("INSERT OR REPLACE INTO admin_flags (k, v, at) VALUES ('notify_last', ?, ?)").bind(JSON.stringify(report), report.at).run();
  return { report, got };
}

/* ---------------- 매시간 할 일 ----------------
   크론은 매시 정각 한 번. 한국 시각으로
   - 매시간: 새 문의 알림
   - DIGEST_HOUR-2시: 접속 점검 / DIGEST_HOUR-1시: 리포트 준비 / DIGEST_HOUR시: 일일 리포트 보내기
   - 리포트 발송이 실패했으면 다음 두 시간 동안 한 번씩 다시 보낸다 */
const kstHourOf = (ms) => new Date(ms + 9 * 3600 * 1000).getUTCHours();
const log = (what) => (e) => console.error(`[${what}]`, (e && e.stack) || e);

async function tick(env, at) {
  const h = kstHourOf(at);
  const dh = Number(env.DIGEST_HOUR || 8);
  const isDigest = h === dh;
  let got = null;
  try { got = (await run(env, 'cron', isDigest ? 60 : PER_SOURCE)).got; } catch (e) { log('notify')(e); }
  if (h === (dh + 22) % 24) await runHealth(env).catch(log('health'));
  if (h === (dh + 23) % 24) await runPrep(env).catch(log('prep'));
  if (isDigest || h === (dh + 1) % 24 || h === (dh + 2) % 24) {
    await runDigest(env, { collect, collected: got, send: sendDigest(env), reason: isDigest ? 'cron' : 'retry' }).catch(log('digest'));
  }
  /* 검색엔진에 바뀐 주소 알리기 — 리포트 시각을 피해 매시간 (바뀐 주소가 없으면 사이트맵만 읽고 끝) */
  if (!isDigest) await runIndexNow(env).catch(log('indexnow'));
}

/* 수동 실행 횟수 제한 (admin_flags 에 날짜·횟수를 남김) */
async function allow(DB, key, perDay) {
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const row = await DB.prepare('SELECT v FROM admin_flags WHERE k = ?').bind(key).first();
  const t = row ? JSON.parse(row.v) : { day, n: 0 };
  if (t.day === day && t.n >= perDay) return false;
  await DB.prepare('INSERT OR REPLACE INTO admin_flags (k, v, at) VALUES (?, ?, ?)').bind(key, JSON.stringify({ day, n: t.day === day ? t.n + 1 : 1 }), new Date().toISOString()).run();
  return true;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, event.scheduledTime || Date.now()));
  },

  /* 상태 보기: 마지막 확인 결과만 보여 준다 (문의 내용·연락처는 내보내지 않음) */
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    await ensureTables(env.DB);
    const last = await env.DB.prepare("SELECT v FROM admin_flags WHERE k = 'notify_last'").first();
    const report = last ? JSON.parse(last.v) : null;
    const post = request.method === 'POST';
    if (url.pathname === '/run' && post) {
      /* 바로 한 번 확인 (10분에 한 번까지). 새 문의가 없으면 메일은 가지 않는다 */
      if (report && Date.now() - Date.parse(report.at) < 10 * 60 * 1000) return json({ ok: false, error: '10분 안에 이미 확인했습니다.', last: report }, 429);
      return json({ ok: true, report: (await run(env, 'manual')).report });
    }
    if (url.pathname === '/indexnow' && !post) return json({ ok: true, indexnow: await indexNowStatus(env) });
    if (url.pathname === '/indexnow/run' && post) {
      if (!(await allow(env.DB, 'indexnow_manual', 3))) return json({ ok: false, error: '오늘은 더 돌릴 수 없습니다.' }, 429);
      return json({ ok: true, indexnow: await runIndexNow(env) });
    }
    if (url.pathname === '/test' && post) {
      /* 연결 확인 메일 한 통 (하루 3통까지) */
      if (!(await allow(env.DB, 'notify_test', 3))) return json({ ok: false, error: '오늘은 확인 메일을 더 보낼 수 없습니다.' }, 429);
      await send(env, { subject: '[문의 알림] 연결 확인 메일입니다', text: `최시준 홈페이지 문의 알림이 연결되었습니다.\n\n앞으로 주력 사이트에 새 문의가 들어오면 매시간 확인해서 한 건마다 이 주소로 메일을 보냅니다.\n\n전체 문의에서 보기: ${env.ADMIN_URL}` });
      return json({ ok: true, sent: 1 });
    }
    /* 일일 리포트 손으로 돌려 보기 — 준비(GitHub 등)와 보내기를 따로 부른다 (무료 요금제 CPU 한도 때문) */
    if (url.pathname === '/digest/health' && post) {
      if (!(await allow(env.DB, 'digest_health_manual', 4))) return json({ ok: false, error: '오늘은 더 돌릴 수 없습니다.' }, 429);
      const r = await runHealth(env);
      return json({ ok: true, at: r.at, checked: r.n, bad: r.bad.length });
    }
    if (url.pathname === '/digest/prep' && post) {
      if (!(await allow(env.DB, 'digest_prep_manual', 4))) return json({ ok: false, error: '오늘은 더 돌릴 수 없습니다.' }, 429);
      return json({ ok: true, prep: await runPrep(env) });
    }
    if (url.pathname === '/digest/test' && post) {
      /* 지금 시각 기준 '어제' 리포트를 한 통 보낸다 (하루 3통까지). 8시 정기 발송에는 영향 없음 */
      if (!(await allow(env.DB, 'digest_test_manual', 3))) return json({ ok: false, error: '오늘은 시험 메일을 더 보낼 수 없습니다.' }, 429);
      const r = await runDigest(env, { collect, send: sendDigest(env), reason: 'test', test: true });
      return json({ ok: r.ok, result: r }, r.ok ? 200 : 500);
    }
    const dl = await digestFlag(env.DB, 'digest_last');
    const prep = await digestFlag(env.DB, 'digest_prep');
    const health = await digestFlag(env.DB, 'health_last');
    const dh = Number(env.DIGEST_HOUR || 8);
    return json({
      ok: true, service: 'choisijun-notify', schedule: `새 문의 알림 매시 정각 · 일일 리포트 매일 ${dh}시 (접속 점검 ${(dh + 22) % 24}시, 준비 ${(dh + 23) % 24}시)`,
      to: env.NOTIFY_TO.replace(/^(.{3}).*(@.*)$/, '$1***$2'), last: report,
      digest: dl ? { day: dl.day, at: dl.at, ok: dl.ok, reason: dl.reason, visitors: dl.visitors, leads: dl.leads, alerts: dl.alerts, error: dl.error || '' } : null,
      prep: prep ? { day: prep.day, at: prep.at, github: prep.gh ? { ok: prep.gh.ok, via: prep.gh.via, repos: (prep.gh.repos || []).length, error: prep.gh.error || '' } : null } : null,
      health: health ? { at: health.at, checked: health.n, bad: (health.bad || []).length } : null
    });
  }
};
