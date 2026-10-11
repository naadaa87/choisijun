# GitHub 연동 배포 가이드 (choisijun.com)

**파일 수정 → GitHub에 저장 → 자동 배포**로 운영하기 위한 안내입니다.

- 저장소: https://github.com/naadaa87/choisijun
- 사이트: https://choisijun.com

이미 GitHub와 Cloudflare를 연결해 두셨다면 바로 아래 **이번 최종본 올리기**만 하시면 됩니다.
처음 연결하는 경우에는 그 아래 STEP 1부터 진행하세요.

---

## 이번 최종본 올리기 (이미 연결해 둔 경우, 약 5분)

1. `choisijun-homepage-FINAL.zip` 압축을 풉니다
2. https://github.com/naadaa87/choisijun 접속 → **Add file → Upload files**
3. 압축을 푼 폴더를 열고, **안에 있는 파일과 폴더 전부**를 선택해 업로드 화면에 끌어다 놓습니다
   - `assets`, `data`, `fragments` 폴더와 `_headers` 파일도 함께 넣어야 합니다 (폴더째 끌어다 놓으면 안의 구조가 그대로 올라갑니다)
   - 전체 61개 파일, 가장 큰 파일 3.7MB → GitHub 웹 업로드 한도(한 번에 100개, 파일당 25MB) 안에 들어옵니다
   - 이름이 같은 파일은 새 버전으로 자동 교체됩니다
4. 아래 **Commit changes** 클릭
5. Cloudflare 대시보드 → Workers & Pages → 프로젝트 → **Deployments**에서 `Success` 확인 (1~2분)
6. 시크릿 창에서 https://choisijun.com/portfolio 와 https://choisijun.com/sitemap.xml 이 열리면 완료
7. 이어서 **`검색등록-가이드.md`** 순서대로 네이버·구글·다음에 등록합니다

> 확인해 주세요: 프로젝트 → Settings → Builds & deployments의 **Build command가 `python3 gen.py`** 인지 봐주세요.
> 비어 있어도 사이트는 열리지만, 나중에 `fragments/`나 `data/portfolio.json`을 고쳤을 때 반영되지 않습니다.

> `.gitignore`처럼 점(.)으로 시작하는 파일은 맥에서 기본적으로 숨겨져 보이지 않습니다. 이 파일은 빠져도 사이트에는 영향이 없습니다.

---

## ⚠️ 먼저 알아두실 점

Cloudflare Pages는 **zip 업로드로 만든 프로젝트를 나중에 Git 연동으로 바꿀 수 없습니다.**
따라서 아래 순서로 진행합니다.

1. GitHub 저장소 만들기
2. **새 Pages 프로젝트**를 Git 연동으로 생성
3. 새 프로젝트가 잘 뜨는지 확인
4. `choisijun.com` 도메인을 기존 프로젝트에서 떼어 새 프로젝트에 연결
5. 기존(zip) 프로젝트 삭제

도메인을 옮기는 4번 단계에서 몇 분간 접속이 불안정할 수 있으니, 방문자가 적은 시간에 하시길 권합니다.

---

## STEP 1. GitHub 저장소 만들기

1. https://github.com 가입 후 로그인
2. 우측 상단 **＋ → New repository**
3. 설정
   - Repository name: `choisijun`
   - **Public** 또는 **Private** 아무거나 (Private도 Cloudflare 연동됩니다)
   - "Add a README file" 체크 **해제**
4. **Create repository**

### 파일 올리기 (개발 도구 없이, 웹에서)

1. 생성된 저장소 화면에서 **uploading an existing file** 링크 클릭
2. 이 zip의 압축을 푼 **폴더 안의 내용물 전체**를 드래그&드롭
   - ⚠️ 폴더째가 아니라 **안에 있는 파일들**을 넣어야 합니다
   - `index.html`이 저장소 최상단에 보여야 정상입니다
   - `assets`, `data`, `fragments` 폴더도 함께 올라갑니다
3. 하단 **Commit changes** 클릭

> 💡 밑줄(_)로 시작하는 `_headers`는 캐시 설정 파일이라 반드시 포함하세요.
> 점(.)으로 시작하는 `.gitignore`는 숨김 파일이라 안 보일 수 있는데, 빠져도 사이트에는 영향이 없습니다.

---

## STEP 2. Cloudflare Pages에 새 프로젝트 연결

1. Cloudflare 대시보드 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. **GitHub 인증** → 방금 만든 `choisijun` 저장소 선택 → **Begin setup**
3. 빌드 설정을 아래처럼 입력합니다

| 항목 | 값 |
|---|---|
| Project name | `choisijun-site` (기존 프로젝트와 다른 이름) |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `python3 gen.py` |
| Build output directory | `/` |

4. **Save and Deploy** → 1~2분 후 `choisijun-site.pages.dev`로 접속해 정상 표시 확인

> **빌드 명령어를 넣는 이유**: 저장할 때마다 페이지가 다시 생성되면서
> CSS/JS 주소에 새 버전번호가 붙습니다 → **캐시 때문에 옛 화면이 보이는 문제가 영구 차단**됩니다.
>
> 혹시 빌드가 실패한다면? Settings → Builds & deployments에서
> **Build command를 비워두고** 다시 배포하세요. HTML이 이미 완성본으로 저장소에 있어서
> 빌드 없이도 사이트는 똑같이 동작합니다.

---

## STEP 3. 도메인 옮기기

새 프로젝트가 정상 작동하는 걸 확인한 뒤에 진행하세요.

1. **기존 프로젝트**(zip으로 만든 것) → Custom domains → `choisijun.com`, `www.choisijun.com` **Remove**
2. **새 프로젝트** → Custom domains → **Set up a domain** → `choisijun.com` 입력 → 승인
3. `www.choisijun.com`도 같은 방식으로 추가
4. 5~10분 후 https://choisijun.com 접속 확인 (시크릿 창 권장)
5. 정상 확인되면 기존 프로젝트 → Settings → 맨 아래 **Delete project**

---

## 이후 운영 방법

### 글씨·내용만 고칠 때
1. GitHub 저장소에서 파일 클릭 (예: `fragments/about.html`)
2. 연필 아이콘(Edit) → 수정 → **Commit changes**
3. 1~2분 뒤 사이트에 자동 반영 ✅

> `fragments/` 폴더의 파일을 고치는 것을 권장합니다.
> 빌드가 이곳의 내용을 읽어 최종 페이지(`about.html` 등)를 다시 만들어 줍니다.
> (빌드 명령어를 비워두셨다면 최상단의 `about.html`을 직접 고치세요)

### 사진·영상을 바꿀 때
- 저장소의 `assets` 폴더 → **Add file → Upload files**
- 사진과 영상은 방문자 브라우저에 1년간 저장됩니다. 같은 이름으로 덮어쓰면 한동안 예전 것이 보일 수 있으니, **새 이름으로 올리고 `fragments/`의 주소를 바꾸는 방법**을 권합니다 (README 5번 참고)

### 포트폴리오 공간 정보를 고칠 때
- `data/portfolio.json` → 연필 아이콘 → 수정 → Commit. 숫자·그래프는 배포할 때 자동으로 다시 계산됩니다 (README 4번 참고)

### 배포 상태 확인
- Cloudflare → 프로젝트 → **Deployments** 탭에서 성공/실패와 로그를 볼 수 있습니다
- 실패해도 이전 배포가 그대로 살아있어 사이트는 멈추지 않습니다

### 되돌리기
- Deployments 목록에서 이전 배포의 **⋯ → Rollback**으로 즉시 복구 가능합니다

---

## 파일 구조 참고

```
choisijun/
├── index.html … 404.html   ← 완성된 페이지 19개 (자동 생성물, 지역별 페이지 포함)
├── fragments/              ← 페이지 본문 원본 (여기를 수정)
├── data/portfolio.json     ← 포트폴리오 공개 데이터
├── assets/                 ← 사진, 파비콘
│   └── video/              ← 쇼릴 영상과 첫 장면 이미지
├── styles.css, script.js   ← 디자인 / 기능
├── gen.py                  ← 페이지 생성기
├── search-verification.txt ← 검색엔진 소유확인 코드
├── _headers                ← 캐시·보안 설정
├── robots.txt              ← 검색엔진 안내 (다음 인증 줄은 맨 끝)
├── sitemap.xml, rss.xml    ← 검색엔진용 (자동 생성)
└── README.md               ← 전체 운영 안내
```
