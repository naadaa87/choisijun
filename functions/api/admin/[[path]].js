/* =========================================================
   /api/admin/* — 관리자 기능 (로그인한 관리자만)
   로그인 · 대시보드 · 문의 · 커뮤니티 · 레퍼런스 · 매일 글
   ========================================================= */
import {
  db, json, fail, notReady, readJson, clean, nowIso, sha256, safeEqual, rateLimit, visitorHash,
  makeSession, clearSession, isAdmin, sameOrigin,
  INQUIRY_STATUS, POST_CATEGORIES, REF_CATEGORIES
} from '../../_lib/core.js';

const REPO_DEFAULT = 'naadaa87/choisijun';
const BACKLOG_PATH = 'content/plan/backlog.md';
const PAUSE_PATH = 'content/plan/PAUSE';
const LANES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const CATS = ['시장 · 산업', '강연 · 교육', '건물 기획', '무인 운영', '사업 이야기', '공실개발', '창업', '생각'];

function setupFlags(env) {
  return {
    db: Boolean(env.DB),
    password: Boolean(env.ADMIN_PASSWORD),
    mail: Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL),
    turnstile: Boolean(env.TURNSTILE_SECRET),
    github: Boolean(env.GITHUB_TOKEN)
  };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const method = request.method.toUpperCase();
  const route = parts.join('/');

  if (method !== 'GET' && !sameOrigin(request)) return fail('허용되지 않은 요청입니다.', 403);

  /* ---------- 로그인 없이 쓰는 것 ---------- */
  if (route === 'session' && method === 'GET') {
    const authed = await isAdmin(request, env);
    return json({ ok: true, authed, setup: authed ? setupFlags(env) : { db: Boolean(env.DB), password: Boolean(env.ADMIN_PASSWORD) } });
  }
  if (route === 'login' && method === 'POST') return login(request, env);
  if (route === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearSession() });

  /* ---------- 여기부터 관리자만 ---------- */
  if (!(await isAdmin(request, env))) return fail('로그인이 필요합니다.', 401, { code: 'auth' });
  const DB = await db(env).catch(() => null);

  try {
    if (route === 'content') {
      if (method === 'GET') return contentGet(request, env);
      if (method === 'POST') return contentPost(request, env);
    }
    if (!DB) return notReady();
    if (route === 'overview' && method === 'GET') return overview(DB, env);

    if (parts[0] === 'inquiries') {
      if (method === 'GET' && parts.length === 1) return inquiriesList(DB, request);
      const id = Number(parts[1]);
      if (!id) return fail('잘못된 번호입니다.');
      if (method === 'PATCH') return inquiryUpdate(DB, request, id);
      if (method === 'DELETE') {
        await DB.prepare('DELETE FROM inquiries WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }

    if (parts[0] === 'community') {
      if (method === 'GET' && parts.length === 1) return communityAll(DB);
      const kind = parts[1];               // post | comment
      if (!['post', 'comment'].includes(kind)) return fail('잘못된 요청입니다.');
      if (method === 'POST' && parts.length === 2) return staffWrite(DB, request, kind);
      const id = Number(parts[2]);
      if (!id) return fail('잘못된 번호입니다.');
      const table = kind === 'post' ? 'posts' : 'comments';
      if (method === 'PATCH') {
        const body = await readJson(request, 10_000);
        const status = ['published', 'hidden', 'pending'].includes(body.status) ? body.status : null;
        if (!status) return fail('상태 값이 올바르지 않습니다.');
        await DB.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).bind(status, id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        if (kind === 'post') await DB.batch([
          DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id),
          DB.prepare('DELETE FROM posts WHERE id = ?').bind(id)
        ]);
        else await DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }

    if (parts[0] === 'refs') {
      if (method === 'GET' && parts.length === 1) {
        const rows = (await DB.prepare('SELECT * FROM refs ORDER BY year DESC, created_at DESC').all()).results || [];
        return json({ ok: true, refs: rows });
      }
      if (method === 'POST' && parts.length === 1) return refSave(DB, request, null);
      const id = Number(parts[1]);
      if (!id) return fail('잘못된 번호입니다.');
      if (method === 'PATCH') return refSave(DB, request, id);
      if (method === 'DELETE') {
        await DB.prepare('DELETE FROM refs WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }
  } catch (e) {
    if (e && e.message === 'too_large') return fail('내용이 너무 큽니다. 이미지를 줄여 다시 올려 주세요.', 413);
    if (e && e.message === 'bad_json') return fail('보낸 내용을 읽지 못했습니다.');
    return fail('처리 중 오류가 났습니다: ' + (e && e.message ? e.message : '알 수 없음'), 500);
  }
  return fail('없는 기능입니다.', 404);
}

/* ---------------- 로그인 ---------------- */
async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return fail('관리자 비밀번호(ADMIN_PASSWORD)가 아직 설정되지 않았습니다.', 503, { code: 'no_password' });
  const DB = await db(env).catch(() => null);
  if (DB) {
    const who = await visitorHash(request, env);
    if (!(await rateLimit(DB, `login:${who}`, 10, 900))) return fail('로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.', 429);
  }
  let body;
  try { body = await readJson(request, 2_000); } catch (_) { return fail('잘못된 요청입니다.'); }
  const given = await sha256(String(body.password || ''));
  const expect = await sha256(String(env.ADMIN_PASSWORD));
  if (!safeEqual(given, expect)) return fail('비밀번호가 맞지 않습니다.', 401);
  return json({ ok: true }, 200, { 'Set-Cookie': await makeSession(env) });
}

/* ---------------- 대시보드 ---------------- */
async function overview(DB, env) {
  const monthStart = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7) + '-01T00:00:00+09:00';
  const q = (sql, ...args) => DB.prepare(sql).bind(...args).first();
  const [n1, n2, n3, n4, p1, c1, r1] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM inquiries WHERE status = '접수'"),
    q("SELECT COUNT(*) AS n FROM inquiries WHERE status = '진행중'"),
    q('SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?', new Date(monthStart).toISOString()),
    q('SELECT COUNT(*) AS n FROM inquiries'),
    q("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'"),
    q("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'"),
    q('SELECT COUNT(*) AS n FROM refs')
  ]);
  const recent = (await DB.prepare('SELECT id, created_at, type, name, status FROM inquiries ORDER BY created_at DESC LIMIT 6').all()).results || [];
  const stale = (await DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status = '접수' AND created_at < ?")
    .bind(new Date(Date.now() - 2 * 86400 * 1000).toISOString()).first()) || { n: 0 };
  return json({
    ok: true,
    counts: {
      inq_new: n1.n, inq_progress: n2.n, inq_month: n3.n, inq_total: n4.n,
      posts_pending: p1.n, comments_pending: c1.n, refs: r1.n, inq_stale: stale.n
    },
    recent,
    setup: setupFlags(env)
  });
}

/* ---------------- 문의 ---------------- */
async function inquiriesList(DB, request) {
  const u = new URL(request.url).searchParams;
  const where = [];
  const args = [];
  const status = u.get('status');
  if (status && INQUIRY_STATUS.includes(status)) { where.push('status = ?'); args.push(status); }
  else if (!status) where.push("status != '보관'");
  const type = u.get('type');
  if (type) { where.push('type = ?'); args.push(type); }
  const q = (u.get('q') || '').trim();
  if (q) { where.push('(name LIKE ? OR contact LIKE ? OR message LIKE ? OR memo LIKE ?)'); const k = `%${q}%`; args.push(k, k, k, k); }
  const sql = `SELECT id, created_at, type, name, contact, message, page, status, memo, updated_at FROM inquiries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
  const rows = (await DB.prepare(sql).bind(...args).all()).results || [];
  return json({ ok: true, inquiries: rows });
}

async function inquiryUpdate(DB, request, id) {
  const body = await readJson(request, 20_000);
  const sets = [];
  const args = [];
  if (body.status !== undefined) {
    if (!INQUIRY_STATUS.includes(body.status)) return fail('상태 값이 올바르지 않습니다.');
    sets.push('status = ?'); args.push(body.status);
  }
  if (body.memo !== undefined) { sets.push('memo = ?'); args.push(clean(body.memo, 4000)); }
  if (!sets.length) return fail('바꿀 내용이 없습니다.');
  sets.push('updated_at = ?'); args.push(nowIso());
  await DB.prepare(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  return json({ ok: true });
}

/* ---------------- 커뮤니티 ---------------- */
async function communityAll(DB) {
  const posts = (await DB.prepare('SELECT id, created_at, category, author, title, content, status, is_staff FROM posts ORDER BY created_at DESC LIMIT 300').all()).results || [];
  const comments = (await DB.prepare('SELECT id, post_id, created_at, author, content, status, is_staff FROM comments ORDER BY created_at ASC LIMIT 1000').all()).results || [];
  return json({ ok: true, posts, comments });
}

async function staffWrite(DB, request, kind) {
  const body = await readJson(request, 20_000);
  if (kind === 'post') {
    const category = POST_CATEGORIES.includes(body.category) ? body.category : '정보공유';
    const title = clean(body.title, 80);
    const content = clean(body.content, 3000);
    if (!title || !content) return fail('제목과 내용을 적어 주세요.');
    await DB.prepare("INSERT INTO posts (created_at, category, author, title, content, status, is_staff) VALUES (?, ?, '최시준', ?, ?, 'published', 1)")
      .bind(nowIso(), category, title, content).run();
    return json({ ok: true });
  }
  const postId = Number(body.post_id);
  const content = clean(body.content, 1500);
  if (!postId || !content) return fail('답글 내용을 적어 주세요.');
  await DB.prepare("INSERT INTO comments (post_id, created_at, author, content, status, is_staff) VALUES (?, ?, '최시준', ?, 'published', 1)")
    .bind(postId, nowIso(), content).run();
  return json({ ok: true });
}

/* ---------------- 레퍼런스 ---------------- */
async function refSave(DB, request, id) {
  const body = await readJson(request, 1_200_000);
  const row = {
    year: clean(body.year, 12),
    category: REF_CATEGORIES.includes(body.category) ? body.category : '공간개발',
    title: clean(body.title, 120),
    description: clean(body.description, 600),
    link: clean(body.link, 400),
    image: String(body.image || '').slice(0, 1_000_000),
    visible: body.visible === false || body.visible === 0 ? 0 : 1
  };
  if (row.link && !/^(https?:\/\/|\/)/i.test(row.link)) return fail('링크는 https:// 또는 / 로 시작해야 합니다.');
  if (row.image && !/^(data:image\/(jpeg|png|webp);base64,|https:\/\/|\/)/i.test(row.image)) return fail('이미지 형식이 올바르지 않습니다.');
  if (id && body.only === 'visible') {
    await DB.prepare('UPDATE refs SET visible = ? WHERE id = ?').bind(row.visible, id).run();
    return json({ ok: true });
  }
  if (!row.title || !row.year) return fail('연도와 제목은 꼭 적어 주세요.');
  if (id) {
    await DB.prepare('UPDATE refs SET year = ?, category = ?, title = ?, description = ?, link = ?, image = ?, visible = ? WHERE id = ?')
      .bind(row.year, row.category, row.title, row.description, row.link, row.image, row.visible, id).run();
  } else {
    await DB.prepare('INSERT INTO refs (created_at, year, category, title, description, link, image, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(nowIso(), row.year, row.category, row.title, row.description, row.link, row.image, row.visible).run();
  }
  return json({ ok: true });
}

/* ---------------- 매일 글 (GitHub 저장소의 글감 목록) ---------------- */
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), (c) => c.charCodeAt(0)));
function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gh(env, path, init = {}) {
  const repo = env.GITHUB_REPO || REPO_DEFAULT;
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'choisijun-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    }
  });
}

async function readAsset(request, env, path) {
  const url = new URL(path, request.url);
  url.searchParams.set('v', String(Date.now()));
  const res = env.ASSETS ? await env.ASSETS.fetch(new Request(url.toString())) : await fetch(url.toString());
  return res;
}

function parseBacklog(md) {
  const lanes = {};
  const order = [];
  let cur = null;
  let item = null;
  md.split('\n').forEach((line) => {
    const h = line.match(/^## (MON|TUE|WED|THU|FRI|SAT|SUN|보류)(?=\s|$)\s*(?:—\s*)?(.*)$/);
    if (h) {
      cur = h[1] === '보류' ? 'HOLD' : h[1];
      lanes[cur] = { key: cur, title: (h[2] || '').trim(), items: [] };
      order.push(cur);
      item = null;
      return;
    }
    if (/^## /.test(line)) { cur = null; item = null; return; }
    if (!cur) return;
    const m = line.match(/^- \[( |x|d|~)\]\s*(.*)$/);
    if (m) {
      const rest = m[2];
      const slug = (rest.match(/`([a-z0-9-]+)`/) || [])[1] || '';
      const date = (rest.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
      let title = rest.replace(/^(초안\s+)?\d{4}-\d{2}-\d{2}\s*/, '').replace(/`[a-z0-9-]+`\s*/, '');
      let cat = '';
      for (const c of CATS) {
        const i = title.indexOf(' · ' + c);
        if (i > 0) { cat = c; title = title.slice(0, i); break; }
      }
      item = { state: m[1], slug, date, title: title.trim(), category: cat, detail: [] };
      lanes[cur].items.push(item);
      return;
    }
    if (item && /^\s{2,}\S/.test(line)) item.detail.push(line.trim());
  });
  return { lanes, order };
}

/** 글감 한 개(줄 + 들여쓴 설명 줄)를 잘라 낸다 */
function cutItem(lines, slug) {
  const i = lines.findIndex((l) => /^- \[[ xd~]\]/.test(l) && l.includes('`' + slug + '`'));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && /^\s{2,}\S/.test(lines[j])) j++;
  return { block: lines.splice(i, j - i), at: i };
}

function laneRange(lines, key) {
  const head = key === 'HOLD' ? /^## 보류/ : new RegExp(`^## ${key}\\b`);
  const s = lines.findIndex((l) => head.test(l));
  if (s < 0) return null;
  let e = s + 1;
  while (e < lines.length && !/^## /.test(lines[e])) e++;
  return { s, e };
}

function insertInLane(lines, key, block, position) {
  const r = laneRange(lines, key);
  if (!r) throw new Error('칸을 찾지 못했습니다');
  let at = -1;
  if (position === 'next') {
    for (let k = r.s + 1; k < r.e; k++) if (/^- \[ \]/.test(lines[k])) { at = k; break; }
  }
  if (at < 0) {           // 칸의 마지막 글감 뒤 (빈 줄 앞)
    at = r.e;
    while (at - 1 > r.s && lines[at - 1].trim() === '') at--;
  }
  lines.splice(at, 0, ...block);
}

async function contentGet(request, env) {
  const flags = setupFlags(env);
  let md = '';
  let paused = false;
  if (flags.github) {
    const res = await gh(env, BACKLOG_PATH);
    if (res.ok) md = b64decode((await res.json()).content);
    const p = await gh(env, PAUSE_PATH);
    paused = p.ok;
  }
  if (!md) {
    const res = await readAsset(request, env, '/' + BACKLOG_PATH);
    if (res.ok) md = await res.text();
    const p = await readAsset(request, env, '/' + PAUSE_PATH);
    paused = p.ok && !(await p.text()).trim().startsWith('<');
  }
  let recent = [];
  try {
    const rss = await (await readAsset(request, env, '/rss.xml')).text();
    recent = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const g = (tag) => ((m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || '').trim();
      return { title: g('title'), link: g('link'), date: g('pubDate'), category: g('category') };
    }).filter((x) => x.category).slice(0, 12);
  } catch (_) { recent = []; }
  const parsed = md ? parseBacklog(md) : { lanes: {}, order: [] };
  return json({ ok: true, github: flags.github, paused, lanes: parsed.lanes, order: parsed.order, recent });
}

async function contentPost(request, env) {
  if (!env.GITHUB_TOKEN) return fail('GitHub 토큰(GITHUB_TOKEN)을 설정하면 여기서 바로 바꿀 수 있습니다.', 503, { code: 'no_github' });
  const body = await readJson(request, 5_000);
  const action = String(body.action || '');
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  if (action === 'pause') {
    const cur = await gh(env, PAUSE_PATH);
    if (body.value) {
      if (cur.ok) return json({ ok: true, paused: true });
      const put = await gh(env, PAUSE_PATH, { method: 'PUT', body: JSON.stringify({
        message: '관리자: 매일 글 발행 잠시 멈춤',
        content: b64encode(`관리자 페이지에서 ${today}에 발행을 멈췄습니다. 이 파일을 지우면 다음 날 아침부터 다시 발행합니다.\n`)
      }) });
      if (!put.ok) return fail('GitHub에 저장하지 못했습니다 (' + put.status + ')', 502);
      return json({ ok: true, paused: true });
    }
    if (!cur.ok) return json({ ok: true, paused: false });
    const sha = (await cur.json()).sha;
    const del = await gh(env, PAUSE_PATH, { method: 'DELETE', body: JSON.stringify({ message: '관리자: 매일 글 발행 다시 시작', sha }) });
    if (!del.ok) return fail('GitHub에 저장하지 못했습니다 (' + del.status + ')', 502);
    return json({ ok: true, paused: false });
  }

  const slug = String(body.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug)) return fail('글감 이름이 올바르지 않습니다.');
  const res = await gh(env, BACKLOG_PATH);
  if (!res.ok) return fail('GitHub에서 글감 목록을 읽지 못했습니다 (' + res.status + ')', 502);
  const file = await res.json();
  const lines = b64decode(file.content).split('\n');
  const cut = cutItem(lines, slug);
  if (!cut) return fail('글감을 찾지 못했습니다.', 404);
  let message = '';

  if (action === 'approve') {
    const lane = String(body.lane || '');
    if (!LANES.includes(lane)) return fail('요일 칸을 골라 주세요.');
    const first = cut.block[0];
    const m = first.match(/^- \[ \]\s*`([a-z0-9-]+)`\s*(.*)$/);
    const text = m ? m[2] : first;
    const [title, ...descParts] = text.split(' — ');
    const desc = descParts.join(' — ').trim();
    cut.block = [
      `- [ ] \`${slug}\` ${title.trim()}`,
      `  근거: 대표 승인(${today}). ${desc ? '보류했던 이유(이 점을 조심해서 씀): ' + desc + '. ' : ''}관련 메모리·드라이브 자료에서 사실을 확인하고 GUIDE 4장 범위 안에서 씁니다.`
    ];
    insertInLane(lines, lane, cut.block, body.position === 'last' ? 'last' : 'next');
    message = `관리자: 보류 글감 승인 — ${slug} → ${lane}`;
  } else if (action === 'next') {
    const lane = String(body.lane || '');
    if (!LANES.includes(lane)) return fail('요일 칸이 올바르지 않습니다.');
    insertInLane(lines, lane, cut.block, 'next');
    message = `관리자: 다음 차례로 — ${slug}`;
  } else if (action === 'hold') {
    const first = cut.block[0].replace(/^- \[[ ~]\]/, '- [ ]');
    insertInLane(lines, 'HOLD', [first + ' — 관리자 페이지에서 보류함', ...cut.block.slice(1)], 'last');
    message = `관리자: 글감 보류 — ${slug}`;
  } else {
    return fail('없는 동작입니다.');
  }

  const put = await gh(env, BACKLOG_PATH, { method: 'PUT', body: JSON.stringify({
    message, content: b64encode(lines.join('\n')), sha: file.sha
  }) });
  if (!put.ok) return fail('GitHub에 저장하지 못했습니다 (' + put.status + '). 잠시 후 다시 시도해 주세요.', 502);
  return json({ ok: true });
}
