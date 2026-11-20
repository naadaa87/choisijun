/* =========================================================
   메일 원문(MIME) 만들기 — 문의 알림 · 일일 리포트가 함께 쓴다
   - 글자는 모두 UTF-8 + base64 로 넣는다 (한글 제목·본문이 깨지지 않게)
   - html 이 있으면 text 와 html 을 함께 넣는다 (multipart/alternative)
   ========================================================= */

export const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
export const word = (s) => `=?UTF-8?B?${b64(s)}?=`;
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');

/**
 * @param {{ from: string, to: string, fromName?: string, subject: string, text: string, html?: string, replyTo?: string }} m
 */
export function buildMime(m) {
  const id = `${crypto.randomUUID()}@choisijun.com`;
  const head = [
    `From: ${m.fromName ? word(m.fromName) + ' ' : ''}<${m.from}>`,
    `To: <${m.to}>`,
    m.replyTo ? `Reply-To: <${m.replyTo}>` : '',
    `Subject: ${word(m.subject)}`,
    `Message-ID: <${id}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0'
  ].filter(Boolean);
  const part = (type, body) => [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap(b64(body))].join('\r\n');
  if (!m.html) return head.join('\r\n') + '\r\n' + part('text/plain', m.text);
  const boundary = `csj-${crypto.randomUUID()}`;
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    part('text/plain', m.text),
    `--${boundary}`,
    part('text/html', m.html),
    `--${boundary}--`,
    ''
  ].join('\r\n');
}
