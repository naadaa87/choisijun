# choisijun-notify — 새 문의 메일 알림 · 일일 리포트

주력 사이트에 새 문의가 들어오면 **naadaa87@gmail.com** 으로 한 건마다 메일 한 통을 보냅니다.

- 확인 주기: 매시 정각 (Cloudflare 크론). 한 번 설정하면 Cloudflare 가 알아서 돌립니다.
- 읽는 곳: 관리자 '전체 문의'와 같은 곳 (각 사이트 D1 · 프빗·한탕 KV · 최시준 대신 접수). `../functions/_lib/leads.js` 를 그대로 씁니다.
- 보내는 방법: Cloudflare Email Routing (`send_email` 바인딩). 보내는 주소 alert@choisijun.com, 받는 주소는 Email Routing 의 '확인된 주소'여야 합니다.
- 고객이 이메일을 남긴 문의는 메일에 바로 '답장'하면 고객에게 갑니다.
- 이미 보낸 문의는 choisijun-db `lead_notified` 표에 남겨 두 번 보내지 않습니다. 처음 실행할 때는 그동안 쌓인 문의를 메일 없이 '보낸 것'으로만 표시합니다.
- 한 번에 15통을 넘으면 나머지는 한 통으로 묶습니다. 7일보다 오래된 문의는 새로 알리지 않습니다.

## 일일 리포트 (매일 아침 8시)

같은 받는 주소로 전날을 정리한 메일을 한 통 보냅니다. 코드는 `src/digest.js`, 메일 원문 만들기는 `src/mime.js`.

| 들어가는 것 | 어디서 읽나 |
|---|---|
| 01 사이트별 KPI — 방문자·페이지뷰·클릭(예약·연락·신청)·문의, 전일·7일 평균, 주요 유입, 이번 달 누적과 지난달 같은 기간 | `xpv`·`xev`(k1.js 방문 수집), `pv`·`ev`(choisijun.com 자체), 각 사이트 문의 저장소 |
| 02 어제 들어온 문의 — 문의마다 사이트·이름·연락처·내용·상태, 회신 전 문의 수와 오래 기다린 순서 | 관리자 '전체 문의'와 같은 곳 + `lead_marks`(회신 표시) |
| 03 특이사항 — 첫 화면 접속 안 됨, 방문 0명·급증·급감, 3일 넘은 회신 전 문의, 문의 저장소 읽기 실패, 기한 지난 할 일, 인사이트 글 미발행, '점검 필요' 사이트 | `sites` 접속 점검 결과, 방문 통계, `site_tasks`, choisijun.com RSS |
| 04 진행·변동 — 어제 GitHub 커밋(저장소별), 새 저장소, 할 일 완료·추가·상태 변경, 운영 현황·단계 변화, 발행 글, 검색 점검 | GitHub 공개 API·커밋 피드, `site_tasks`, `sites`(전날과 비교), `site_seo` |

무료 요금제 한도(호출 한 번에 CPU 10ms·외부 요청 50개) 안에서 돌도록 일을 나눕니다.

- 06시 접속 점검: 주력 사이트 첫 화면을 열어 보고 '운영 현황'의 접속 상태(`sites.chk_*`)를 새로 고칩니다.
- 07시 준비: GitHub 변경 내역과 이번 달 문의 수를 모아 `admin_flags` 의 `digest_prep` 에 둡니다.
- 08시 보내기: 나머지를 읽어 메일을 만들고 보냅니다. 실패하면 9시·10시에 한 번씩 다시 보냅니다. 같은 날 두 번 가지 않습니다.

손으로 돌려 보기 (POST, 하루 횟수 제한 있음 — 정기 발송에는 영향 없음)

- `/digest/health` 접속 점검 · `/digest/prep` GitHub 등 준비 · `/digest/test` 지금 기준 '어제' 리포트를 한 통 보내기

```
curl -X POST https://choisijun-notify.naadaa87.workers.dev/digest/prep
curl -X POST https://choisijun-notify.naadaa87.workers.dev/digest/test
```

GitHub 는 로그인 없이 공개 저장소만 읽습니다. 조회 한도에 걸리면 공개 활동 피드로 대신 찾고, 그래도 안 되면 그날 메일에 '빠졌다'고 적습니다. 비공개 저장소까지 넣거나 한도를 넉넉하게 하려면 Cloudflare → Workers → choisijun-notify → Settings → Variables and secrets 에 `GITHUB_TOKEN`(Secret, 읽기 권한) 을 넣으면 됩니다.

## 바꾸고 싶을 때

| 바꿀 것 | 고칠 곳 |
|---|---|
| 받는 주소 | `wrangler.toml` 의 `NOTIFY_TO` 와 `[[send_email]] destination_address` (새 주소는 Cloudflare → Email Routing → Destination addresses 에서 먼저 확인) |
| 리포트 시각 | `wrangler.toml` 의 `DIGEST_HOUR` (한국 시각, 0~23). 접속 점검·준비는 그 2시간·1시간 전에 자동으로 맞춰집니다 |
| 확인 주기 | `wrangler.toml` 의 `crons`. 일일 리포트가 정시에 맞춰 돌기 때문에 `"0 * * * *"`(매시 정각)은 그대로 두는 것이 좋습니다 |
| 연결 사이트 | 홈페이지 `../wrangler.toml` 과 이 폴더 `wrangler.toml` 의 `[[d1_databases]]` 를 같이 고치고, `leads.js` 의 LEAD_SOURCES 에 추가 |

## 상태 보기

Worker 주소(`https://choisijun-notify.<계정>.workers.dev/`)를 열면 마지막 확인 결과(확인한 문의 수·보낸 메일 수)와 일일 리포트·준비·접속 점검의 마지막 실행 결과(숫자만)가 보입니다. 문의 내용은 나오지 않습니다.
관리자 '전체 문의' 위쪽 안내 줄에도 마지막 확인 시각과 보낸 메일 수가 나옵니다.
