// =====================================================================
// 최시준 홈페이지 — 회원·문의자에게 이메일을 보내는 Supabase Edge Function
// 이름: send-mail
// 사용법: Supabase → Edge Functions → Deploy a new function → Via Editor
//        → 함수 이름을 send-mail 로 정하고, 이 파일 내용 전체를 붙여넣고 Deploy
// 필요한 Secrets (Edge Functions → Secrets):
//   RESEND_API_KEY  = Resend 에서 만든 API 키 (re_로 시작)
//   MAIL_FROM       = 최시준 <no-reply@choisijun.com>      (선택, 기본값 동일)
//   MAIL_REPLY_TO   = runactivator@naver.com                (선택, 답장 받을 주소)
//   SITE_URL        = https://choisijun.com                 (선택, 기본값 동일)
// 관리자 계정으로 로그인한 사람만 호출할 수 있습니다. (홈페이지 /admin 에서 사용)
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHtml(opts: {
  name: string; title: string; text: string; link?: string; linkLabel?: string; isAd: boolean; siteUrl: string; replyTo: string;
}) {
  const paragraphs = esc(opts.text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.75;">${p.replace(/\n/g, "<br />")}</p>`).join("");
  const button = opts.link
    ? `<p style="margin:22px 0;"><a href="${esc(opts.link)}" style="display:inline-block;padding:12px 22px;background:#FF4712;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:700;">${esc(opts.linkLabel || "자세히 보기")}</a></p>`
    : "";
  const footer = opts.isAd
    ? `이 메일은 소식 받기에 동의하신 분께 보내는 광고성 정보입니다.<br />더 받지 않으려면 <a href="${esc(opts.siteUrl)}/account" style="color:#777;">마이페이지</a>에서 '소식 받기'를 끄시거나, 이 메일에 '수신거부'라고 회신해 주세요.`
    : `이 메일은 choisijun.com 회원 또는 문의하신 분께 보내는 안내 메일입니다.`;
  return `<!doctype html><html lang="ko"><body style="margin:0;background:#F8F7F4;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#121212;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;letter-spacing:0.04em;font-size:14px;margin-bottom:22px;">CHOI SIJUN<span style="color:#FF4712;">.</span></div>
    <div style="background:#ffffff;border:1px solid #E4E2DB;border-radius:10px;padding:28px 26px;">
      <h1 style="font-size:20px;line-height:1.45;margin:0 0 18px;">${esc(opts.title)}</h1>
      <p style="margin:0 0 14px;line-height:1.75;">${esc(opts.name)}님, 안녕하세요.</p>
      ${paragraphs}
      ${button}
      <p style="margin:22px 0 0;line-height:1.75;">최시준 드림</p>
    </div>
    <p style="font-size:12px;line-height:1.7;color:#777;margin:18px 4px 0;">${footer}<br />㈜블랭크 · 대표 최시준 · ${esc(opts.replyTo)} · <a href="${esc(opts.siteUrl)}" style="color:#777;">choisijun.com</a></p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const FROM = Deno.env.get("MAIL_FROM") || "최시준 <no-reply@choisijun.com>";
    const REPLY_TO = Deno.env.get("MAIL_REPLY_TO") || "runactivator@naver.com";
    const SITE_URL = (Deno.env.get("SITE_URL") || "https://choisijun.com").replace(/\/+$/, "");

    // 1) 호출한 사람이 관리자인지 확인 (호출자의 로그인 토큰으로 is_admin() 실행)
    const authorization = req.headers.get("authorization") ?? "";
    const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const check = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { apikey, Authorization: authorization, "Content-Type": "application/json" },
      body: "{}",
    });
    const isAdmin = check.ok && (await check.json()) === true;
    if (!isAdmin) return json({ error: "관리자 계정으로 로그인해야 사용할 수 있습니다." }, 403);

    const body = await req.json().catch(() => ({}));

    // 2) 연결 점검
    if (body.action === "ping") {
      return json({ ok: true, ready: Boolean(RESEND_API_KEY), from: FROM });
    }
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY 가 설정되지 않았습니다." }, 500);

    // 3) 입력 확인
    const isAd = body.kind === "ad";
    const title = String(body.subject ?? "").trim().slice(0, 120);
    const text = String(body.text ?? "").trim().slice(0, 8000);
    const link = typeof body.link === "string" && /^https?:\/\//.test(body.link) ? body.link.slice(0, 300) : "";
    const linkLabel = String(body.linkLabel ?? "").slice(0, 30);
    if (!title || !text) return json({ error: "제목과 본문을 입력해 주세요." }, 400);

    if (isAd) {
      // 정보통신망법: 야간(21시~다음날 8시) 광고성 정보는 별도 동의가 필요하므로 막는다 (한국 시간 기준)
      const hourKST = (new Date().getUTCHours() + 9) % 24;
      if (hourKST >= 21 || hourKST < 8) return json({ error: "광고성 메일은 오전 8시부터 오후 9시 사이에만 보낼 수 있습니다." }, 400);
    }

    const seen = new Set<string>();
    const recipients: { email: string; name: string }[] = [];
    for (const r of Array.isArray(body.recipients) ? body.recipients : []) {
      const email = String(r?.email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email) || seen.has(email)) continue;
      seen.add(email);
      recipients.push({ email, name: String(r?.name ?? "").trim().slice(0, 40) || "고객" });
    }
    if (!recipients.length) return json({ error: "보낼 수 있는 이메일 주소가 없습니다." }, 400);
    if (recipients.length > 500) return json({ error: "한 번에 500명까지 보낼 수 있습니다." }, 400);

    const subject = isAd && !title.startsWith("(광고)") ? `(광고) ${title}` : title;

    // 4) Resend 로 100통씩 나눠 보내기 (받는 사람마다 따로 보내 서로의 주소가 보이지 않음)
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < recipients.length; i += 100) {
      const chunk = recipients.slice(i, i + 100).map((r) => ({
        from: FROM,
        to: [r.email],
        reply_to: REPLY_TO,
        subject,
        html: renderHtml({ name: r.name, title, text, link, linkLabel, isAd, siteUrl: SITE_URL, replyTo: REPLY_TO }),
        text: `${r.name}님, 안녕하세요.\n\n${text}\n\n${link ? link + "\n\n" : ""}최시준 드림\n㈜블랭크 · ${REPLY_TO}`,
      }));
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        const t = await res.text().catch(() => "");
        errors.push(`${res.status} ${t.slice(0, 200)}`);
      }
    }
    return json({ ok: failed === 0, sent, failed, errors });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
