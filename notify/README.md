# choisijun-notify — 새 문의 메일 알림

주력 사이트에 새 문의가 들어오면 **naadaa87@gmail.com** 으로 한 건마다 메일 한 통을 보냅니다.

- 확인 주기: 매시간 7분 (Cloudflare 크론). 한 번 설정하면 Cloudflare 가 알아서 돌립니다.
- 읽는 곳: 관리자 '전체 문의'와 같은 곳 (각 사이트 D1 · 프빗·한탕 KV · 최시준 대신 접수). `../functions/_lib/leads.js` 를 그대로 씁니다.
- 보내는 방법: Cloudflare Email Routing (`send_email` 바인딩). 보내는 주소 alert@choisijun.com, 받는 주소는 Email Routing 의 '확인된 주소'여야 합니다.
- 고객이 이메일을 남긴 문의는 메일에 바로 '답장'하면 고객에게 갑니다.
- 이미 보낸 문의는 choisijun-db `lead_notified` 표에 남겨 두 번 보내지 않습니다. 처음 실행할 때는 그동안 쌓인 문의를 메일 없이 '보낸 것'으로만 표시합니다.
- 한 번에 15통을 넘으면 나머지는 한 통으로 묶습니다. 7일보다 오래된 문의는 새로 알리지 않습니다.

## 바꾸고 싶을 때

| 바꿀 것 | 고칠 곳 |
|---|---|
| 받는 주소 | `wrangler.toml` 의 `NOTIFY_TO` 와 `[[send_email]] destination_address` (새 주소는 Cloudflare → Email Routing → Destination addresses 에서 먼저 확인) |
| 확인 주기 | `wrangler.toml` 의 `crons` (예: 30분마다 `"*/30 * * * *"`) |
| 연결 사이트 | 홈페이지 `../wrangler.toml` 과 이 폴더 `wrangler.toml` 의 `[[d1_databases]]` 를 같이 고치고, `leads.js` 의 LEAD_SOURCES 에 추가 |

## 상태 보기

Worker 주소(`https://choisijun-notify.<계정>.workers.dev/`)를 열면 마지막 확인 결과(확인한 문의 수·보낸 메일 수)만 보입니다. 문의 내용은 나오지 않습니다.
관리자 '전체 문의' 위쪽 안내 줄에도 마지막 확인 시각과 보낸 메일 수가 나옵니다.
