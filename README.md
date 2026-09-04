# 최시준 개인 브랜딩 홈페이지 (멀티페이지 v2)

순수 HTML/CSS/JS 정적 사이트 — 프레임워크·빌드 과정 없이 **Cloudflare Pages에 zip 업로드만으로 배포**됩니다.

---

## 1. 페이지 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 메인 — 히어로(공실→수익 다이어그램), 핵심지표, 페이지 안내, 대표사례, 언론, 커뮤니티 최근글, 자가진단 배너 |
| `about.html` | 소개 — 스토리, 타임라인, 운영원칙 4, 자능사(自能士), 미니 인터뷰 Q&A, 강의활동 |
| `brands.html` | 브랜드 — 쏘플(플래그십 상세) + 공백·밍글·레스텔·워블·소셜팩토리 + SPMS + 실험의 기록 |
| `cases.html` | 사례 — 공실개발 7개 유형(탭) + 6단계 프로세스 + "이런 공간을 찾습니다" |
| `services.html` | 서비스 — 전문분야 6 + 서비스 5종 상세 + 협업구조 4 + FAQ 7 |
| `references.html` | **레퍼런스 아카이브** — 카테고리 필터 + 기본 18건 내장 + **관리자 등록 기능(이미지 업로드 포함)** |
| `media.html` | 미디어 — 언론보도 아카이브 + 공식 채널 + **칼럼 3편 전문** |
| `community.html` | **커뮤니티 게시판** — 제휴·협업 카테고리, 글쓰기 + **답글(댓글)** 기능 |
| `books.html` | **전자책 스토어** — 도서 3종 카드(표지·목차·구매버튼) + 외부결제 안내 + 단체구매 CTA |
| `contact.html` | 문의 — 60초 자가진단 + 유형별 문의 안내 + 문의폼(mailto) + 연락처·개인 SNS |
| `404.html` | 없는 주소 접속 시 자동 표시 (Cloudflare Pages 기본 지원) |

공통 파일: `styles.css`, `script.js`, `robots.txt`, `sitemap.xml`, `assets/favicon.svg`

> `gen.py`와 `fragments/` 폴더는 **페이지를 다시 생성할 때 쓰는 개발용 도구**입니다.
> 배포에는 필요 없지만, 나중에 헤더/푸터를 한 번에 수정하고 싶을 때
> `fragments/` 안의 본문이나 `gen.py`의 헤더/푸터를 고친 뒤 `python3 gen.py`를 실행하면
> 모든 페이지가 일괄 재생성됩니다. (직접 HTML을 수정하셔도 무방합니다)

---

## 2. 배포 방법

### 방법 A — GitHub 연동 (권장, 자동 배포)
수정 → GitHub 저장 → 자동 반영. 설정 방법은 **`GITHUB-배포가이드.md`** 참고.

### 방법 B — zip 직접 업로드 (기존 방식)

1. `choisijun-homepage-v2.zip` 압축 해제 → **파일들이 zip 최상위**에 있는지 확인 (`index.html`이 바로 보여야 함)
2. Cloudflare 대시보드 → **Workers & Pages → Create → Pages → Upload assets**
3. 폴더째 드래그&드롭 → Deploy
4. 수정 후 재배포했다면 **Ctrl+Shift+R(강력 새로고침)** 또는 시크릿 창으로 캐시를 우회해 확인

---

## 3. 배포 전 교체 체크리스트 ✅

| 항목 | 상태 / 위치 |
|---|---|
| 📧 이메일 · 📞 전화 | ✅ 소개서 기준 반영됨 (`runactivator@naver.com` / `010-2384-9580`) — 변경 시 `contact.html` + `script.js`의 `CONTACT_EMAIL` |
| 🔑 **레퍼런스 관리자 코드** | ⚠️ `script.js` 상단 `ADMIN_CODE` (현재 `sijun-2026`) — **배포 전 꼭 변경!** |
| 💬 카카오/SNS | ✅ 오픈프로필·Threads·Instagram·NAVER 검색 링크 반영됨 (푸터·문의·커뮤니티·메인) |
| 📚 **전자책 구매 링크** | ⚠️ `books.html`의 각 `data-store-link` 버튼 href를 크몽/스마트스토어 판매 URL로 교체 — 교체 전에는 '전자책 구매 문의'로 연결됨. 제목·목차·설명도 실제 도서에 맞게 수정 |
| 🌐 도메인 | ✅ `https://choisijun.com` 반영됨 (canonical · OG · sitemap · robots) |
| 🖼️ og-image | `assets/og-image.jpg`(카톡/SNS 공유 썸네일, 1200×630) 1장만 추가하면 됩니다 — 프로필·강의·방송·지도 사진은 소개서에서 추출해 이미 적용됨 |
| 🏷️ "1위" 표기 | 소개서·공식 사이트 기준이며 "자사 기준" 각주를 달아두었습니다. 표현 조정 원하시면 `index.html`, `brands.html` |

---

## 3.5 캐시 문제 예방 (자동 적용됨)

모든 페이지의 CSS/JS 주소에 **빌드 시각 버전**이 자동으로 붙습니다 (`styles.css?v=202607…`).
덕분에 재배포 후 옛 디자인이 캐시로 남는 문제가 원천 차단됩니다.
- 내용 수정 후에는 `python3 gen.py` 한 번 실행 → 버전이 갱신된 HTML로 재배포하세요.
- 그래도 즉시 반영이 필요하면: Cloudflare 대시보드 → choisijun.com 존 → **Caching → Purge Everything**

## 4. 게시판 & 레퍼런스 저장 방식 (중요)

두 기능 모두 **두 가지 모드**로 동작합니다.

### 데모 모드 (기본, 지금 상태)
- 별도 서버 없이 작동하지만, 글·답글·등록 레퍼런스가 **작성자 본인 브라우저(localStorage)에만 저장**됩니다.
- 다른 방문자에게는 보이지 않습니다. 화면에도 "DEMO" 안내가 표시됩니다.

### 공유 모드 (Supabase 무료 플랜, 5분 설정)
모든 방문자가 함께 보는 실제 게시판/아카이브가 됩니다.

1. https://supabase.com 가입 → New Project
2. SQL Editor에서 아래 실행:

```sql
-- ① 게시글
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  author text not null,
  category text default '질문',
  title text not null,
  content text not null
);
alter table community_posts enable row level security;
create policy "public read"  on community_posts for select using (true);
create policy "public write" on community_posts for insert with check (true);

-- ② 답글(댓글)
create table community_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author text not null,
  content text not null
);
alter table community_comments enable row level security;
create policy "public read"  on community_comments for select using (true);
create policy "public write" on community_comments for insert with check (true);

-- ③ 레퍼런스 (테이블명 주의: references 는 SQL 예약어라 site_references 사용)
create table site_references (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  category text,
  year text,
  title text,
  "desc" text,
  image text,
  link text
);
alter table site_references enable row level security;
create policy "public read"  on site_references for select using (true);
create policy "public write" on site_references for insert with check (true);
```

3. Settings → API에서 **Project URL**과 **anon public key** 복사
4. `script.js` 최상단에 붙여넣기:

```js
const COMMUNITY_BACKEND = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: '붙여넣기',
  table: 'community_posts',
  commentsTable: 'community_comments',
  referencesTable: 'site_references'
};
```

5. 재배포 → 화면 안내가 "LIVE"로 바뀌면 완료

**운영 팁**
- 광고글/부적절한 글 삭제: Supabase 대시보드 → Table Editor에서 행 삭제 (공유 모드)
- 데모 모드에서 글 삭제: 작성 시 입력한 비밀번호로 게시판에서 직접 삭제 가능
- 답글은 삭제 버튼이 없습니다(대시보드에서 관리) — 도배 방지가 필요해지면 말씀 주세요.

---

## 5. 레퍼런스 등록 기능 사용법 (관리자 전용)

1. 레퍼런스 페이지 → **＋ 레퍼런스 등록**
2. 관리자 코드 입력 (기본 `sijun-2026` — `script.js`의 `ADMIN_CODE`에서 변경)
3. 카테고리/연도/제목/설명 입력 + 이미지 **파일 첨부**(자동으로 900px 리사이즈) 또는 이미지 URL
4. 등록 → 즉시 카드로 표시

> ⚠️ 정적 사이트 특성상 관리자 코드는 소스에 노출되는 "가벼운 잠금"입니다.
> 무단 등록 방지용으로는 충분하지만, 강한 보안이 필요하면 Supabase 정책(RLS)으로 등록을 제한하는 방식을 권장합니다.
> 기본 내장된 18건의 아카이브는 `script.js`의 `SEED_REFS` 배열에서 직접 수정/추가할 수 있습니다.

---

## 6. 콘텐츠 수정 위치 빠른 안내

- 언론 기사 추가: `media.html`의 `press-card` 블록 복사 후 수정 (주석 표시해둠)
- 칼럼 추가: `media.html`의 `col-item` 블록 복사
- 사례 추가: `cases.html`의 탭 버튼 + `case-panel` 한 쌍 복사
- 자가진단 문항: `script.js`의 `QUIZ` 배열
- 전자책 추가: `books.html`의 `book-card` 블록 복사 (표지 색상은 `book-cover` / `bc-alt` / `bc-dark` 3종)
- 게시판 환영글(시드): `script.js`의 `SEED_POSTS`

---

## 7. v3 업데이트 요약 (소개서 반영)

- 디자인 톤 변경: 기존 홈페이지·소개서와 동일한 **화이트 + 블랙 + 오렌지레드** 팔레트, 소개서의 오렌지 더블바 모티프 적용
- 실적 지표 340개+ 반영, "국내 무인공간 사업 1위(자사 기준)" 문구 추가
- 소개(about): 現/前 **경력 전체 리스트**, 기업·기관·대학 **강의처 태그(50여 곳)**, TEDx 무대·강의 현장 실사진
- 브랜드: 잭슨빌피자 · 메이저리그 멘토링 추가(8개), 쏘플 **전국 지도 실사진**
- 미디어: **JTBC · KBS · 중국 CCTV 방송 스틸컷** 카드 + MBC 다큐/EBS/지면 매체 정리
- 레퍼런스: 기업 강연 / 대학 강연 / 퇴사학교 완판 / 방송 출연 / 협회·심사 5건 추가 (총 23건)
- 문의: 실제 연락처 반영, 브랜드 공식 채널 정리

즐거운 운영 되세요! 🏗️
