var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-EE4wTQ/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// .wrangler/tmp/pages-uFTNjQ/functionsWorker-0.0769401362216835.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function stripCfConnectingIPHeader2(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
__name2(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader2.apply(null, argArray)
    ]);
  }
});
var INQUIRY_TYPES = [
  "\uACF5\uC2E4\uAC1C\uBC1C \uC0C1\uB2F4",
  "\uACF5\uAC04\uC218\uC775\uD654 \uC9C4\uB2E8",
  "\uCC3D\uC5C5 \uAD50\uC721 \uBB38\uC758",
  "\uAC15\uC758/\uC138\uBBF8\uB098 \uBB38\uC758",
  "\uC778\uD130\uBDF0/\uBBF8\uB514\uC5B4 \uBB38\uC758",
  "\uC81C\uD734/\uACF5\uB3D9\uC0AC\uC5C5 \uBB38\uC758",
  "\uC804\uC790\uCC45 \uAD6C\uB9E4/\uB2E8\uCCB4\uAD6C\uB9E4 \uBB38\uC758",
  "\uACF5\uAC04 \uC774\uC6A9\xB7\uB300\uAD00 \uBB38\uC758",
  "\uAE30\uD0C0 \uBB38\uC758"
];
var INQUIRY_STATUS = ["\uC811\uC218", "\uC9C4\uD589\uC911", "\uC644\uB8CC", "\uBCF4\uAD00"];
var POST_CATEGORIES = ["\uC81C\uD734\xB7\uD611\uC5C5", "\uC9C8\uBB38", "\uC815\uBCF4\uACF5\uC720", "\uD6C4\uAE30\xB7\uADFC\uD669"];
var REF_CATEGORIES = ["\uACF5\uAC04\uAC1C\uBC1C", "\uBE0C\uB79C\uB4DC", "\uAC15\uC758\xB7\uAD50\uC721", "\uD30C\uD2B8\uB108\uC2ED", "\uC5B8\uB860\xB7\uBBF8\uB514\uC5B4"];
var SCHEMA = [
  `CREATE TABLE IF NOT EXISTS inquiries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     type TEXT NOT NULL DEFAULT '\uAE30\uD0C0 \uBB38\uC758',
     name TEXT NOT NULL DEFAULT '',
     contact TEXT NOT NULL DEFAULT '',
     message TEXT NOT NULL DEFAULT '',
     page TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT '\uC811\uC218',
     memo TEXT NOT NULL DEFAULT '',
     updated_at TEXT,
     ip_hash TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at)`,
  `CREATE TABLE IF NOT EXISTS posts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT '\uC9C8\uBB38',
     author TEXT NOT NULL DEFAULT '',
     title TEXT NOT NULL DEFAULT '',
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     is_staff INTEGER NOT NULL DEFAULT 0,
     ip_hash TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS comments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     post_id INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     author TEXT NOT NULL DEFAULT '',
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     is_staff INTEGER NOT NULL DEFAULT 0,
     ip_hash TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
  `CREATE TABLE IF NOT EXISTS refs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     year TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT '\uACF5\uAC04\uAC1C\uBC1C',
     title TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     link TEXT NOT NULL DEFAULT '',
     image TEXT NOT NULL DEFAULT '',
     visible INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, t INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_hits ON hits(k, t)`
];
var SEED_POSTS = [
  [
    "2026-07-01T09:00:00+09:00",
    "\uD6C4\uAE30\xB7\uADFC\uD669",
    "\uCD5C\uC2DC\uC900",
    "\uCEE4\uBBA4\uB2C8\uD2F0 \uB77C\uC6B4\uC9C0\uB97C \uC5FD\uB2C8\uB2E4",
    "\uAC74\uBB3C\uC8FC, \uBD80\uB3D9\uC0B0, \uC608\uBE44\uCC3D\uC5C5\uC790, \uD30C\uD2B8\uB108 \uAE30\uC5C5\uC774 \uD3B8\uD558\uAC8C \uAD50\uB958\uD558\uB294 \uACF5\uAC04\uC774 \uB418\uC5C8\uC73C\uBA74 \uD569\uB2C8\uB2E4. \uACF5\uAC04\uC5D0 \uB300\uD55C \uC5B4\uB5A4 \uC774\uC57C\uAE30\uB4E0 \uD658\uC601\uD558\uACE0, \uBAA8\uB4E0 \uAE00\uC5D0 \uC131\uC2E4\uD788 \uB2F5\uD558\uACA0\uC2B5\uB2C8\uB2E4."
  ],
  [
    "2026-07-02T10:00:00+09:00",
    "\uC815\uBCF4\uACF5\uC720",
    "\uCD5C\uC2DC\uC900",
    "\uAC8C\uC2DC\uD310 \uC774\uC6A9 \uC548\uB0B4 \u2014 \uC81C\uD734 \uC81C\uC548 \uC774\uB807\uAC8C \uB0A8\uACA8\uC8FC\uC138\uC694",
    "\uC81C\uD734\xB7\uD611\uC5C5 \uCE74\uD14C\uACE0\uB9AC\uC5D0 \u2460 \uC5B4\uB5A4 \uBD84\uC57C\uC778\uC9C0 \u2461 \uBB34\uC5C7\uC744 \uD568\uAED8\uD558\uACE0 \uC2F6\uC740\uC9C0 \u2462 \uAC04\uB2E8\uD55C \uC18C\uAC1C\uB97C \uB0A8\uACA8\uC8FC\uC2DC\uBA74, \uAC80\uD1A0 \uD6C4 \uB2F5\uAE00\uB85C \uD68C\uC2E0\uB4DC\uB9BD\uB2C8\uB2E4. \uC5F0\uB77D\uCC98\xB7\uC8FC\uC18C \uB4F1 \uAC1C\uC778\uC815\uBCF4\uB294 \uAC8C\uC2DC\uD310 \uB300\uC2E0 \uBB38\uC758\uD558\uAE30\uB97C \uC774\uC6A9\uD574\uC8FC\uC138\uC694. \uC0C8 \uAE00\uACFC \uB2F5\uAE00\uC740 \uC6B4\uC601\uC790\uAC00 \uD655\uC778\uD55C \uB4A4 \uAC8C\uC2DC\uB429\uB2C8\uB2E4."
  ]
];
var schemaReady = null;
async function db(env) {
  if (!env || !env.DB)
    return null;
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first();
      if (row && row.n === 0) {
        await env.DB.batch(SEED_POSTS.map((p) => env.DB.prepare(
          "INSERT INTO posts (created_at, category, author, title, content, status, is_staff) VALUES (?, ?, ?, ?, ?, 'published', 1)"
        ).bind(...p)));
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
  return env.DB;
}
__name(db, "db");
__name2(db, "db");
var nowIso = /* @__PURE__ */ __name2(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}
__name(json, "json");
__name2(json, "json");
var fail = /* @__PURE__ */ __name2((message, status = 400, extra = {}) => json({ ok: false, error: message, ...extra }, status), "fail");
var notReady = /* @__PURE__ */ __name2(() => fail("\uC11C\uBC84 \uC800\uC7A5\uC18C(D1)\uAC00 \uC544\uC9C1 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", 503, { code: "no_db" }), "notReady");
async function readJson(request, maxBytes = 12e5) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > maxBytes)
    throw new Error("too_large");
  const text = await request.text();
  if (text.length > maxBytes)
    throw new Error("too_large");
  try {
    return JSON.parse(text || "{}");
  } catch (_) {
    throw new Error("bad_json");
  }
}
__name(readJson, "readJson");
__name2(readJson, "readJson");
function clean(v, max = 200) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
__name(clean, "clean");
__name2(clean, "clean");
var enc = new TextEncoder();
var hex = /* @__PURE__ */ __name2((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
__name(sha256, "sha256");
__name2(sha256, "sha256");
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(hmacKey, "hmacKey");
__name2(hmacKey, "hmacKey");
async function hmac(secret, text) {
  return hex(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(text)));
}
__name(hmac, "hmac");
__name2(hmac, "hmac");
function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
__name2(safeEqual, "safeEqual");
async function visitorHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "local";
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return (await sha256(`${ip}|${day}|${env.ADMIN_PASSWORD || "csj"}`)).slice(0, 24);
}
__name(visitorHash, "visitorHash");
__name2(visitorHash, "visitorHash");
async function rateLimit(DB, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1e3);
  const row = await DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE k = ? AND t > ?").bind(key, now - windowSec).first();
  if (row && row.n >= limit)
    return false;
  await DB.prepare("INSERT INTO hits (k, t) VALUES (?, ?)").bind(key, now).run();
  if (Math.random() < 0.05)
    await DB.prepare("DELETE FROM hits WHERE t < ?").bind(now - 86400 * 2).run();
  return true;
}
__name(rateLimit, "rateLimit");
__name2(rateLimit, "rateLimit");
async function turnstileOk(env, token, request) {
  if (!env.TURNSTILE_SECRET)
    return true;
  if (!token)
    return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", String(token));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip)
    form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await res.json();
    return Boolean(data && data.success);
  } catch (_) {
    return false;
  }
}
__name(turnstileOk, "turnstileOk");
__name2(turnstileOk, "turnstileOk");
async function guardPublicForm(DB, request, env, body, bucket, limit = 5, opts = {}) {
  if (body.hp)
    return "\uC798\uBABB\uB41C \uC694\uCCAD\uC785\uB2C8\uB2E4.";
  const t = Number(body.t || 0);
  if (t && Date.now() - t < 2500)
    return "\uC870\uAE08 \uCC9C\uCC9C\uD788 \uB2E4\uC2DC \uBCF4\uB0B4 \uC8FC\uC138\uC694.";
  if (!opts.skipTurnstile && !await turnstileOk(env, body.turnstile, request))
    return "\uC790\uB3D9 \uB4F1\uB85D \uBC29\uC9C0 \uD655\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
  const who = await visitorHash(request, env);
  if (!await rateLimit(DB, `${bucket}:${who}`, limit, 600))
    return "\uC9E7\uC740 \uC2DC\uAC04\uC5D0 \uB108\uBB34 \uB9CE\uC774 \uBCF4\uB0B4\uC168\uC2B5\uB2C8\uB2E4. 10\uBD84 \uB4A4\uC5D0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
  return "";
}
__name(guardPublicForm, "guardPublicForm");
__name2(guardPublicForm, "guardPublicForm");
var COOKIE = "csj_admin";
var SESSION_HOURS = 12;
async function sessionSecret(env) {
  return sha256(`${env.ADMIN_PASSWORD}|${env.SESSION_SECRET || "choisijun-admin"}`);
}
__name(sessionSecret, "sessionSecret");
__name2(sessionSecret, "sessionSecret");
async function makeSession(env) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1e3;
  const sig = await hmac(await sessionSecret(env), `admin.${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
__name(makeSession, "makeSession");
__name2(makeSession, "makeSession");
var clearSession = /* @__PURE__ */ __name2(() => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, "clearSession");
async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD)
    return false;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9]+)\\.([0-9a-f]{64})`));
  if (!m)
    return false;
  const exp = Number(m[1]);
  if (!exp || exp < Date.now())
    return false;
  const expect = await hmac(await sessionSecret(env), `admin.${exp}`);
  return safeEqual(expect, m[2]);
}
__name(isAdmin, "isAdmin");
__name2(isAdmin, "isAdmin");
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin)
    return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch (_) {
    return false;
  }
}
__name(sameOrigin, "sameOrigin");
__name2(sameOrigin, "sameOrigin");
async function notifyMail(env, subject, text) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL)
    return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM || "\uCD5C\uC2DC\uC900 \uD648\uD398\uC774\uC9C0 <onboarding@resend.dev>",
        to: String(env.NOTIFY_EMAIL).split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        text
      })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}
__name(notifyMail, "notifyMail");
__name2(notifyMail, "notifyMail");
async function hiddenFolder({ request, env }) {
  let body = "Not found";
  let type = "text/plain; charset=utf-8";
  try {
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url).toString()));
      if (res.ok || res.status === 404) {
        body = await res.text();
        type = "text/html; charset=utf-8";
      }
    }
  } catch (_) {
  }
  return new Response(body, { status: 404, headers: { "Content-Type": type, "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
__name(hiddenFolder, "hiddenFolder");
__name2(hiddenFolder, "hiddenFolder");
async function onRequestPost({ request, env }) {
  const DB = await db(env).catch(() => null);
  if (!DB)
    return notReady();
  let body;
  try {
    body = await readJson(request, 1e4);
  } catch (_) {
    return fail("\uBCF4\uB0B8 \uB0B4\uC6A9\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
  const blocked = await guardPublicForm(DB, request, env, body, "cmt", 8, { skipTurnstile: true });
  if (blocked)
    return fail(blocked, 429);
  const postId = Number(body.post_id);
  const author = clean(body.author, 20);
  const content = clean(body.content, 800);
  if (!postId || !author || content.length < 1)
    return fail("\uB2C9\uB124\uC784\uACFC \uB2F5\uAE00 \uB0B4\uC6A9\uC744 \uC801\uC5B4 \uC8FC\uC138\uC694.");
  if (/^(최시준|운영자|관리자)$/.test(author))
    return fail("\uC774 \uB2C9\uB124\uC784\uC740 \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const post = await DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(postId).first();
  if (!post)
    return fail("\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
  await DB.prepare(
    "INSERT INTO comments (post_id, created_at, author, content, status, is_staff, ip_hash) VALUES (?, ?, ?, ?, 'pending', 0, ?)"
  ).bind(postId, nowIso(), author, content, await visitorHash(request, env)).run();
  return json({ ok: true, pending: true });
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
var REPO_DEFAULT = "naadaa87/choisijun";
var BACKLOG_PATH = "content/plan/backlog.md";
var PAUSE_PATH = "content/plan/PAUSE";
var LANES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
var CATS = ["\uC2DC\uC7A5 \xB7 \uC0B0\uC5C5", "\uAC15\uC5F0 \xB7 \uAD50\uC721", "\uAC74\uBB3C \uAE30\uD68D", "\uBB34\uC778 \uC6B4\uC601", "\uC0AC\uC5C5 \uC774\uC57C\uAE30", "\uACF5\uC2E4\uAC1C\uBC1C", "\uCC3D\uC5C5", "\uC0DD\uAC01"];
function setupFlags(env) {
  return {
    db: Boolean(env.DB),
    password: Boolean(env.ADMIN_PASSWORD),
    mail: Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL),
    turnstile: Boolean(env.TURNSTILE_SECRET),
    github: Boolean(env.GITHUB_TOKEN)
  };
}
__name(setupFlags, "setupFlags");
__name2(setupFlags, "setupFlags");
async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const method = request.method.toUpperCase();
  const route = parts.join("/");
  if (method !== "GET" && !sameOrigin(request))
    return fail("\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uC694\uCCAD\uC785\uB2C8\uB2E4.", 403);
  if (route === "session" && method === "GET") {
    const authed = await isAdmin(request, env);
    return json({ ok: true, authed, setup: authed ? setupFlags(env) : { db: Boolean(env.DB), password: Boolean(env.ADMIN_PASSWORD) } });
  }
  if (route === "login" && method === "POST")
    return login(request, env);
  if (route === "logout" && method === "POST")
    return json({ ok: true }, 200, { "Set-Cookie": clearSession() });
  if (!await isAdmin(request, env))
    return fail("\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", 401, { code: "auth" });
  const DB = await db(env).catch(() => null);
  try {
    if (route === "content") {
      if (method === "GET")
        return contentGet(request, env);
      if (method === "POST")
        return contentPost(request, env);
    }
    if (!DB)
      return notReady();
    if (route === "overview" && method === "GET")
      return overview(DB, env);
    if (parts[0] === "inquiries") {
      if (method === "GET" && parts.length === 1)
        return inquiriesList(DB, request);
      const id = Number(parts[1]);
      if (!id)
        return fail("\uC798\uBABB\uB41C \uBC88\uD638\uC785\uB2C8\uB2E4.");
      if (method === "PATCH")
        return inquiryUpdate(DB, request, id);
      if (method === "DELETE") {
        await DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
    }
    if (parts[0] === "community") {
      if (method === "GET" && parts.length === 1)
        return communityAll(DB);
      const kind = parts[1];
      if (!["post", "comment"].includes(kind))
        return fail("\uC798\uBABB\uB41C \uC694\uCCAD\uC785\uB2C8\uB2E4.");
      if (method === "POST" && parts.length === 2)
        return staffWrite(DB, request, kind);
      const id = Number(parts[2]);
      if (!id)
        return fail("\uC798\uBABB\uB41C \uBC88\uD638\uC785\uB2C8\uB2E4.");
      const table = kind === "post" ? "posts" : "comments";
      if (method === "PATCH") {
        const body = await readJson(request, 1e4);
        const status = ["published", "hidden", "pending"].includes(body.status) ? body.status : null;
        if (!status)
          return fail("\uC0C1\uD0DC \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        await DB.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).bind(status, id).run();
        return json({ ok: true });
      }
      if (method === "DELETE") {
        if (kind === "post")
          await DB.batch([
            DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(id),
            DB.prepare("DELETE FROM posts WHERE id = ?").bind(id)
          ]);
        else
          await DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
    }
    if (parts[0] === "refs") {
      if (method === "GET" && parts.length === 1) {
        const rows = (await DB.prepare("SELECT * FROM refs ORDER BY year DESC, created_at DESC").all()).results || [];
        return json({ ok: true, refs: rows });
      }
      if (method === "POST" && parts.length === 1)
        return refSave(DB, request, null);
      const id = Number(parts[1]);
      if (!id)
        return fail("\uC798\uBABB\uB41C \uBC88\uD638\uC785\uB2C8\uB2E4.");
      if (method === "PATCH")
        return refSave(DB, request, id);
      if (method === "DELETE") {
        await DB.prepare("DELETE FROM refs WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
    }
  } catch (e) {
    if (e && e.message === "too_large")
      return fail("\uB0B4\uC6A9\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4. \uC774\uBBF8\uC9C0\uB97C \uC904\uC5EC \uB2E4\uC2DC \uC62C\uB824 \uC8FC\uC138\uC694.", 413);
    if (e && e.message === "bad_json")
      return fail("\uBCF4\uB0B8 \uB0B4\uC6A9\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    return fail("\uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uB0AC\uC2B5\uB2C8\uB2E4: " + (e && e.message ? e.message : "\uC54C \uC218 \uC5C6\uC74C"), 500);
  }
  return fail("\uC5C6\uB294 \uAE30\uB2A5\uC785\uB2C8\uB2E4.", 404);
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
async function login(request, env) {
  if (!env.ADMIN_PASSWORD)
    return fail("\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638(ADMIN_PASSWORD)\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", 503, { code: "no_password" });
  const DB = await db(env).catch(() => null);
  if (DB) {
    const who = await visitorHash(request, env);
    if (!await rateLimit(DB, `login:${who}`, 10, 900))
      return fail("\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. 15\uBD84 \uB4A4\uC5D0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 429);
  }
  let body;
  try {
    body = await readJson(request, 2e3);
  } catch (_) {
    return fail("\uC798\uBABB\uB41C \uC694\uCCAD\uC785\uB2C8\uB2E4.");
  }
  const given = await sha256(String(body.password || ""));
  const expect = await sha256(String(env.ADMIN_PASSWORD));
  if (!safeEqual(given, expect))
    return fail("\uBE44\uBC00\uBC88\uD638\uAC00 \uB9DE\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 401);
  return json({ ok: true }, 200, { "Set-Cookie": await makeSession(env) });
}
__name(login, "login");
__name2(login, "login");
async function overview(DB, env) {
  const monthStart = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 7) + "-01T00:00:00+09:00";
  const q = /* @__PURE__ */ __name2((sql, ...args) => DB.prepare(sql).bind(...args).first(), "q");
  const [n1, n2, n3, n4, p1, c1, r1] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM inquiries WHERE status = '\uC811\uC218'"),
    q("SELECT COUNT(*) AS n FROM inquiries WHERE status = '\uC9C4\uD589\uC911'"),
    q("SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?", new Date(monthStart).toISOString()),
    q("SELECT COUNT(*) AS n FROM inquiries"),
    q("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'"),
    q("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'"),
    q("SELECT COUNT(*) AS n FROM refs")
  ]);
  const recent = (await DB.prepare("SELECT id, created_at, type, name, status FROM inquiries ORDER BY created_at DESC LIMIT 6").all()).results || [];
  const stale = await DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status = '\uC811\uC218' AND created_at < ?").bind(new Date(Date.now() - 2 * 86400 * 1e3).toISOString()).first() || { n: 0 };
  return json({
    ok: true,
    counts: {
      inq_new: n1.n,
      inq_progress: n2.n,
      inq_month: n3.n,
      inq_total: n4.n,
      posts_pending: p1.n,
      comments_pending: c1.n,
      refs: r1.n,
      inq_stale: stale.n
    },
    recent,
    setup: setupFlags(env)
  });
}
__name(overview, "overview");
__name2(overview, "overview");
async function inquiriesList(DB, request) {
  const u = new URL(request.url).searchParams;
  const where = [];
  const args = [];
  const status = u.get("status");
  if (status && INQUIRY_STATUS.includes(status)) {
    where.push("status = ?");
    args.push(status);
  } else if (!status)
    where.push("status != '\uBCF4\uAD00'");
  const type = u.get("type");
  if (type) {
    where.push("type = ?");
    args.push(type);
  }
  const q = (u.get("q") || "").trim();
  if (q) {
    where.push("(name LIKE ? OR contact LIKE ? OR message LIKE ? OR memo LIKE ?)");
    const k = `%${q}%`;
    args.push(k, k, k, k);
  }
  const sql = `SELECT id, created_at, type, name, contact, message, page, status, memo, updated_at FROM inquiries ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 500`;
  const rows = (await DB.prepare(sql).bind(...args).all()).results || [];
  return json({ ok: true, inquiries: rows });
}
__name(inquiriesList, "inquiriesList");
__name2(inquiriesList, "inquiriesList");
async function inquiryUpdate(DB, request, id) {
  const body = await readJson(request, 2e4);
  const sets = [];
  const args = [];
  if (body.status !== void 0) {
    if (!INQUIRY_STATUS.includes(body.status))
      return fail("\uC0C1\uD0DC \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    sets.push("status = ?");
    args.push(body.status);
  }
  if (body.memo !== void 0) {
    sets.push("memo = ?");
    args.push(clean(body.memo, 4e3));
  }
  if (!sets.length)
    return fail("\uBC14\uAFC0 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  sets.push("updated_at = ?");
  args.push(nowIso());
  await DB.prepare(`UPDATE inquiries SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run();
  return json({ ok: true });
}
__name(inquiryUpdate, "inquiryUpdate");
__name2(inquiryUpdate, "inquiryUpdate");
async function communityAll(DB) {
  const posts = (await DB.prepare("SELECT id, created_at, category, author, title, content, status, is_staff FROM posts ORDER BY created_at DESC LIMIT 300").all()).results || [];
  const comments = (await DB.prepare("SELECT id, post_id, created_at, author, content, status, is_staff FROM comments ORDER BY created_at ASC LIMIT 1000").all()).results || [];
  return json({ ok: true, posts, comments });
}
__name(communityAll, "communityAll");
__name2(communityAll, "communityAll");
async function staffWrite(DB, request, kind) {
  const body = await readJson(request, 2e4);
  if (kind === "post") {
    const category = POST_CATEGORIES.includes(body.category) ? body.category : "\uC815\uBCF4\uACF5\uC720";
    const title = clean(body.title, 80);
    const content2 = clean(body.content, 3e3);
    if (!title || !content2)
      return fail("\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC744 \uC801\uC5B4 \uC8FC\uC138\uC694.");
    await DB.prepare("INSERT INTO posts (created_at, category, author, title, content, status, is_staff) VALUES (?, ?, '\uCD5C\uC2DC\uC900', ?, ?, 'published', 1)").bind(nowIso(), category, title, content2).run();
    return json({ ok: true });
  }
  const postId = Number(body.post_id);
  const content = clean(body.content, 1500);
  if (!postId || !content)
    return fail("\uB2F5\uAE00 \uB0B4\uC6A9\uC744 \uC801\uC5B4 \uC8FC\uC138\uC694.");
  await DB.prepare("INSERT INTO comments (post_id, created_at, author, content, status, is_staff) VALUES (?, ?, '\uCD5C\uC2DC\uC900', ?, 'published', 1)").bind(postId, nowIso(), content).run();
  return json({ ok: true });
}
__name(staffWrite, "staffWrite");
__name2(staffWrite, "staffWrite");
async function refSave(DB, request, id) {
  const body = await readJson(request, 12e5);
  const row = {
    year: clean(body.year, 12),
    category: REF_CATEGORIES.includes(body.category) ? body.category : "\uACF5\uAC04\uAC1C\uBC1C",
    title: clean(body.title, 120),
    description: clean(body.description, 600),
    link: clean(body.link, 400),
    image: String(body.image || "").slice(0, 1e6),
    visible: body.visible === false || body.visible === 0 ? 0 : 1
  };
  if (row.link && !/^(https?:\/\/|\/)/i.test(row.link))
    return fail("\uB9C1\uD06C\uB294 https:// \uB610\uB294 / \uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4.");
  if (row.image && !/^(data:image\/(jpeg|png|webp);base64,|https:\/\/|\/)/i.test(row.image))
    return fail("\uC774\uBBF8\uC9C0 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  if (id && body.only === "visible") {
    await DB.prepare("UPDATE refs SET visible = ? WHERE id = ?").bind(row.visible, id).run();
    return json({ ok: true });
  }
  if (!row.title || !row.year)
    return fail("\uC5F0\uB3C4\uC640 \uC81C\uBAA9\uC740 \uAF2D \uC801\uC5B4 \uC8FC\uC138\uC694.");
  if (id) {
    await DB.prepare("UPDATE refs SET year = ?, category = ?, title = ?, description = ?, link = ?, image = ?, visible = ? WHERE id = ?").bind(row.year, row.category, row.title, row.description, row.link, row.image, row.visible, id).run();
  } else {
    await DB.prepare("INSERT INTO refs (created_at, year, category, title, description, link, image, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(nowIso(), row.year, row.category, row.title, row.description, row.link, row.image, row.visible).run();
  }
  return json({ ok: true });
}
__name(refSave, "refSave");
__name2(refSave, "refSave");
var b64decode = /* @__PURE__ */ __name2((s) => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, "")), (c) => c.charCodeAt(0))), "b64decode");
function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768)
    bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}
__name(b64encode, "b64encode");
__name2(b64encode, "b64encode");
async function gh(env, path, init = {}) {
  const repo = env.GITHUB_REPO || REPO_DEFAULT;
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "choisijun-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers || {}
    }
  });
}
__name(gh, "gh");
__name2(gh, "gh");
async function readAsset(request, env, path) {
  const url = new URL(path, request.url);
  url.searchParams.set("v", String(Date.now()));
  const res = env.ASSETS ? await env.ASSETS.fetch(new Request(url.toString())) : await fetch(url.toString());
  return res;
}
__name(readAsset, "readAsset");
__name2(readAsset, "readAsset");
function parseBacklog(md) {
  const lanes = {};
  const order = [];
  let cur = null;
  let item = null;
  md.split("\n").forEach((line) => {
    const h = line.match(/^## (MON|TUE|WED|THU|FRI|SAT|SUN|보류)(?=\s|$)\s*(?:—\s*)?(.*)$/);
    if (h) {
      cur = h[1] === "\uBCF4\uB958" ? "HOLD" : h[1];
      lanes[cur] = { key: cur, title: (h[2] || "").trim(), items: [] };
      order.push(cur);
      item = null;
      return;
    }
    if (/^## /.test(line)) {
      cur = null;
      item = null;
      return;
    }
    if (!cur)
      return;
    const m = line.match(/^- \[( |x|d|~)\]\s*(.*)$/);
    if (m) {
      const rest = m[2];
      const slug = (rest.match(/`([a-z0-9-]+)`/) || [])[1] || "";
      const date = (rest.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
      let title = rest.replace(/^(초안\s+)?\d{4}-\d{2}-\d{2}\s*/, "").replace(/`[a-z0-9-]+`\s*/, "");
      let cat = "";
      for (const c of CATS) {
        const i = title.indexOf(" \xB7 " + c);
        if (i > 0) {
          cat = c;
          title = title.slice(0, i);
          break;
        }
      }
      item = { state: m[1], slug, date, title: title.trim(), category: cat, detail: [] };
      lanes[cur].items.push(item);
      return;
    }
    if (item && /^\s{2,}\S/.test(line))
      item.detail.push(line.trim());
  });
  return { lanes, order };
}
__name(parseBacklog, "parseBacklog");
__name2(parseBacklog, "parseBacklog");
function cutItem(lines, slug) {
  const i = lines.findIndex((l) => /^- \[[ xd~]\]/.test(l) && l.includes("`" + slug + "`"));
  if (i < 0)
    return null;
  let j = i + 1;
  while (j < lines.length && /^\s{2,}\S/.test(lines[j]))
    j++;
  return { block: lines.splice(i, j - i), at: i };
}
__name(cutItem, "cutItem");
__name2(cutItem, "cutItem");
function laneRange(lines, key) {
  const head = key === "HOLD" ? /^## 보류/ : new RegExp(`^## ${key}\\b`);
  const s = lines.findIndex((l) => head.test(l));
  if (s < 0)
    return null;
  let e = s + 1;
  while (e < lines.length && !/^## /.test(lines[e]))
    e++;
  return { s, e };
}
__name(laneRange, "laneRange");
__name2(laneRange, "laneRange");
function insertInLane(lines, key, block, position) {
  const r = laneRange(lines, key);
  if (!r)
    throw new Error("\uCE78\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4");
  let at = -1;
  if (position === "next") {
    for (let k = r.s + 1; k < r.e; k++)
      if (/^- \[ \]/.test(lines[k])) {
        at = k;
        break;
      }
  }
  if (at < 0) {
    at = r.e;
    while (at - 1 > r.s && lines[at - 1].trim() === "")
      at--;
  }
  lines.splice(at, 0, ...block);
}
__name(insertInLane, "insertInLane");
__name2(insertInLane, "insertInLane");
async function contentGet(request, env) {
  const flags2 = setupFlags(env);
  let md = "";
  let paused = false;
  if (flags2.github) {
    const res = await gh(env, BACKLOG_PATH);
    if (res.ok)
      md = b64decode((await res.json()).content);
    const p = await gh(env, PAUSE_PATH);
    paused = p.ok;
  }
  if (!md) {
    const res = await readAsset(request, env, "/" + BACKLOG_PATH);
    if (res.ok)
      md = await res.text();
    const p = await readAsset(request, env, "/" + PAUSE_PATH);
    paused = p.ok && !(await p.text()).trim().startsWith("<");
  }
  let recent = [];
  try {
    const rss = await (await readAsset(request, env, "/rss.xml")).text();
    recent = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const g = /* @__PURE__ */ __name2((tag) => ((m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "").trim(), "g");
      return { title: g("title"), link: g("link"), date: g("pubDate"), category: g("category") };
    }).filter((x) => x.category).slice(0, 12);
  } catch (_) {
    recent = [];
  }
  const parsed = md ? parseBacklog(md) : { lanes: {}, order: [] };
  return json({ ok: true, github: flags2.github, paused, lanes: parsed.lanes, order: parsed.order, recent });
}
__name(contentGet, "contentGet");
__name2(contentGet, "contentGet");
async function contentPost(request, env) {
  if (!env.GITHUB_TOKEN)
    return fail("GitHub \uD1A0\uD070(GITHUB_TOKEN)\uC744 \uC124\uC815\uD558\uBA74 \uC5EC\uAE30\uC11C \uBC14\uB85C \uBC14\uAFC0 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 503, { code: "no_github" });
  const body = await readJson(request, 5e3);
  const action = String(body.action || "");
  const today = new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10);
  if (action === "pause") {
    const cur = await gh(env, PAUSE_PATH);
    if (body.value) {
      if (cur.ok)
        return json({ ok: true, paused: true });
      const put2 = await gh(env, PAUSE_PATH, { method: "PUT", body: JSON.stringify({
        message: "\uAD00\uB9AC\uC790: \uB9E4\uC77C \uAE00 \uBC1C\uD589 \uC7A0\uC2DC \uBA48\uCDA4",
        content: b64encode(`\uAD00\uB9AC\uC790 \uD398\uC774\uC9C0\uC5D0\uC11C ${today}\uC5D0 \uBC1C\uD589\uC744 \uBA48\uCDC4\uC2B5\uB2C8\uB2E4. \uC774 \uD30C\uC77C\uC744 \uC9C0\uC6B0\uBA74 \uB2E4\uC74C \uB0A0 \uC544\uCE68\uBD80\uD130 \uB2E4\uC2DC \uBC1C\uD589\uD569\uB2C8\uB2E4.
`)
      }) });
      if (!put2.ok)
        return fail("GitHub\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4 (" + put2.status + ")", 502);
      return json({ ok: true, paused: true });
    }
    if (!cur.ok)
      return json({ ok: true, paused: false });
    const sha = (await cur.json()).sha;
    const del = await gh(env, PAUSE_PATH, { method: "DELETE", body: JSON.stringify({ message: "\uAD00\uB9AC\uC790: \uB9E4\uC77C \uAE00 \uBC1C\uD589 \uB2E4\uC2DC \uC2DC\uC791", sha }) });
    if (!del.ok)
      return fail("GitHub\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4 (" + del.status + ")", 502);
    return json({ ok: true, paused: false });
  }
  const slug = String(body.slug || "");
  if (!/^[a-z0-9-]+$/.test(slug))
    return fail("\uAE00\uAC10 \uC774\uB984\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const res = await gh(env, BACKLOG_PATH);
  if (!res.ok)
    return fail("GitHub\uC5D0\uC11C \uAE00\uAC10 \uBAA9\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4 (" + res.status + ")", 502);
  const file = await res.json();
  const lines = b64decode(file.content).split("\n");
  const cut = cutItem(lines, slug);
  if (!cut)
    return fail("\uAE00\uAC10\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", 404);
  let message = "";
  if (action === "approve") {
    const lane = String(body.lane || "");
    if (!LANES.includes(lane))
      return fail("\uC694\uC77C \uCE78\uC744 \uACE8\uB77C \uC8FC\uC138\uC694.");
    const first = cut.block[0];
    const m = first.match(/^- \[ \]\s*`([a-z0-9-]+)`\s*(.*)$/);
    const text = m ? m[2] : first;
    const [title, ...descParts] = text.split(" \u2014 ");
    const desc = descParts.join(" \u2014 ").trim();
    cut.block = [
      `- [ ] \`${slug}\` ${title.trim()}`,
      `  \uADFC\uAC70: \uB300\uD45C \uC2B9\uC778(${today}). ${desc ? "\uBCF4\uB958\uD588\uB358 \uC774\uC720(\uC774 \uC810\uC744 \uC870\uC2EC\uD574\uC11C \uC500): " + desc + ". " : ""}\uAD00\uB828 \uBA54\uBAA8\uB9AC\xB7\uB4DC\uB77C\uC774\uBE0C \uC790\uB8CC\uC5D0\uC11C \uC0AC\uC2E4\uC744 \uD655\uC778\uD558\uACE0 GUIDE 4\uC7A5 \uBC94\uC704 \uC548\uC5D0\uC11C \uC501\uB2C8\uB2E4.`
    ];
    insertInLane(lines, lane, cut.block, body.position === "last" ? "last" : "next");
    message = `\uAD00\uB9AC\uC790: \uBCF4\uB958 \uAE00\uAC10 \uC2B9\uC778 \u2014 ${slug} \u2192 ${lane}`;
  } else if (action === "next") {
    const lane = String(body.lane || "");
    if (!LANES.includes(lane))
      return fail("\uC694\uC77C \uCE78\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    insertInLane(lines, lane, cut.block, "next");
    message = `\uAD00\uB9AC\uC790: \uB2E4\uC74C \uCC28\uB840\uB85C \u2014 ${slug}`;
  } else if (action === "hold") {
    const first = cut.block[0].replace(/^- \[[ ~]\]/, "- [ ]");
    insertInLane(lines, "HOLD", [first + " \u2014 \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0\uC5D0\uC11C \uBCF4\uB958\uD568", ...cut.block.slice(1)], "last");
    message = `\uAD00\uB9AC\uC790: \uAE00\uAC10 \uBCF4\uB958 \u2014 ${slug}`;
  } else {
    return fail("\uC5C6\uB294 \uB3D9\uC791\uC785\uB2C8\uB2E4.");
  }
  const put = await gh(env, BACKLOG_PATH, { method: "PUT", body: JSON.stringify({
    message,
    content: b64encode(lines.join("\n")),
    sha: file.sha
  }) });
  if (!put.ok)
    return fail("GitHub\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4 (" + put.status + "). \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 502);
  return json({ ok: true });
}
__name(contentPost, "contentPost");
__name2(contentPost, "contentPost");
async function onRequestGet({ request, env }) {
  const DB = await db(env).catch(() => null);
  if (!DB)
    return notReady();
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 100));
  const posts = (await DB.prepare(
    "SELECT id, created_at, category, author, title, content, is_staff FROM posts WHERE status = 'published' ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all()).results || [];
  let comments = [];
  if (posts.length) {
    const ids = posts.map((p) => p.id);
    comments = (await DB.prepare(
      `SELECT id, post_id, created_at, author, content, is_staff FROM comments WHERE status = 'published' AND post_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at ASC`
    ).bind(...ids).all()).results || [];
  }
  const byPost = {};
  comments.forEach((c) => {
    (byPost[c.post_id] = byPost[c.post_id] || []).push(c);
  });
  return json(
    { ok: true, posts: posts.map((p) => ({ ...p, comments: byPost[p.id] || [] })) },
    200,
    { "Cache-Control": "public, max-age=30" }
  );
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
async function onRequestPost2({ request, env, waitUntil }) {
  const DB = await db(env).catch(() => null);
  if (!DB)
    return notReady();
  let body;
  try {
    body = await readJson(request, 2e4);
  } catch (_) {
    return fail("\uBCF4\uB0B8 \uB0B4\uC6A9\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
  const blocked = await guardPublicForm(DB, request, env, body, "post", 4);
  if (blocked)
    return fail(blocked, 429);
  const author = clean(body.author, 20);
  const category = POST_CATEGORIES.includes(body.category) ? body.category : "\uC9C8\uBB38";
  const title = clean(body.title, 80);
  const content = clean(body.content, 3e3);
  if (!author || !title || content.length < 2)
    return fail("\uB2C9\uB124\uC784, \uC81C\uBAA9, \uB0B4\uC6A9\uC744 \uBAA8\uB450 \uC801\uC5B4 \uC8FC\uC138\uC694.");
  if (/^(최시준|운영자|관리자)$/.test(author))
    return fail("\uC774 \uB2C9\uB124\uC784\uC740 \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  await DB.prepare(
    "INSERT INTO posts (created_at, category, author, title, content, status, is_staff, ip_hash) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)"
  ).bind(nowIso(), category, author, title, content, await visitorHash(request, env)).run();
  const job = notifyMail(env, `[\uCEE4\uBBA4\uB2C8\uD2F0] \uC0C8 \uAE00 \uD655\uC778 \uC694\uCCAD \xB7 ${title}`, `${author} \uB2D8\uC774 \uAE00\uC744 \uB0A8\uACBC\uC2B5\uB2C8\uB2E4.

[${category}] ${title}

${content}

\u2014 \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0\uC5D0\uC11C \uAC8C\uC2DC \uC5EC\uBD80\uB97C \uC815\uD574 \uC8FC\uC138\uC694.`);
  if (waitUntil)
    waitUntil(job);
  else
    await job;
  return json({ ok: true, pending: true });
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
async function onRequestGet2({ env }) {
  let dbOk = false;
  try {
    dbOk = Boolean(await db(env));
  } catch (_) {
    dbOk = false;
  }
  return json({
    ok: dbOk,
    db: dbOk,
    admin: Boolean(env.ADMIN_PASSWORD),
    turnstile: Boolean(env.TURNSTILE_SECRET)
  });
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequestPost3({ request, env, waitUntil }) {
  const DB = await db(env).catch(() => null);
  if (!DB)
    return notReady();
  let body;
  try {
    body = await readJson(request, 2e4);
  } catch (_) {
    return fail("\uBCF4\uB0B8 \uB0B4\uC6A9\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
  const blocked = await guardPublicForm(DB, request, env, body, "inq", 5);
  if (blocked)
    return fail(blocked, 429);
  const type = INQUIRY_TYPES.includes(body.type) ? body.type : "\uAE30\uD0C0 \uBB38\uC758";
  const name = clean(body.name, 60);
  const contact = clean(body.contact, 120);
  const message = clean(body.message, 4e3);
  const page = clean(body.page, 120);
  if (!name || !contact || message.length < 2)
    return fail("\uC131\uD568, \uC5F0\uB77D\uCC98, \uBB38\uC758 \uB0B4\uC6A9\uC744 \uBAA8\uB450 \uC801\uC5B4 \uC8FC\uC138\uC694.");
  if (body.agree === false)
    return fail("\uAC1C\uC778\uC815\uBCF4 \uC218\uC9D1\xB7\uC774\uC6A9\uC5D0 \uB3D9\uC758\uD574 \uC8FC\uC154\uC57C \uC811\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const created = nowIso();
  const res = await DB.prepare(
    "INSERT INTO inquiries (created_at, type, name, contact, message, page, status, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(created, type, name, contact, message, page, "\uC811\uC218", await visitorHash(request, env)).run();
  const id = res.meta && res.meta.last_row_id;
  const text = `\uC0C8 \uBB38\uC758\uAC00 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.

\uC720\uD615: ${type}
\uC131\uD568/\uC18C\uC18D: ${name}
\uC5F0\uB77D\uCC98: ${contact}

${message}

\u2014 \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0: ${new URL("/admin", request.url).href}`;
  const job = notifyMail(env, `[\uD648\uD398\uC774\uC9C0 \uBB38\uC758] ${type} \xB7 ${name}`, text);
  if (waitUntil)
    waitUntil(job);
  else
    await job;
  return json({ ok: true, id });
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
async function onRequestGet3({ env }) {
  const DB = await db(env).catch(() => null);
  if (!DB)
    return notReady();
  const rows = (await DB.prepare(
    "SELECT id, created_at, year, category, title, description, link, image FROM refs WHERE visible = 1 ORDER BY year DESC, created_at DESC LIMIT 200"
  ).all()).results || [];
  return json({ ok: true, refs: rows }, 200, { "Cache-Control": "public, max-age=60" });
}
__name(onRequestGet3, "onRequestGet3");
__name2(onRequestGet3, "onRequestGet");
var onRequest2 = hiddenFolder;
var onRequest3 = hiddenFolder;
var onRequest4 = hiddenFolder;
var onRequest5 = hiddenFolder;
var onRequest6 = hiddenFolder;
var onRequest7 = hiddenFolder;
var routes = [
  {
    routePath: "/api/community/comment",
    mountPath: "/api/community",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/admin/:path*",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/community",
    mountPath: "/api/community",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/community",
    mountPath: "/api/community",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/health",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/inquiry",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/references",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/content/:path*",
    mountPath: "/content",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/data/:path*",
    mountPath: "/data",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/fragments/:path*",
    mountPath: "/fragments",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/functions/:path*",
    mountPath: "/functions",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/setup/:path*",
    mountPath: "/setup",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/tools/:path*",
    mountPath: "/tools",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: () => {
            isFailOpen = true;
          }
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = /* @__PURE__ */ __name(class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
}, "__Facade_ScheduledController__");
__name2(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../tmp/claude-0/-home-claude/88d2df4a-e215-5636-9215-57d4082aba06/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../tmp/claude-0/-home-claude/88d2df4a-e215-5636-9215-57d4082aba06/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-EE4wTQ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../tmp/claude-0/-home-claude/88d2df4a-e215-5636-9215-57d4082aba06/scratchpad/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-EE4wTQ/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__2, "__Facade_ScheduledController__");
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.0769401362216835.js.map
