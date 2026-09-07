# -*- coding: utf-8 -*-
"""정적 페이지 생성기 — fragments/*.html 을 공통 헤더/푸터로 감싸 최종 HTML 생성.
   출력물은 100% 정적 HTML (배포 시 이 스크립트는 불필요)."""
import io, os

DOMAIN = "https://choisijun.com"

# 빌드마다 자동 갱신되는 캐시버스팅 버전 (CSS/JS 강제 새로고침)
from datetime import datetime
VERSION = datetime.now().strftime("%Y%m%d%H%M")

PAGES = [
    # key, file, nav label, <title>, meta description
    ("home", "index.html", None, "최시준 | 공간수익화 · 공실개발 전문가",
     "공간을 수익공간으로 바꾸는 사람, 최시준. 10년+ 340개+ 공간 기획·개발·운영, 국내 무인공간 사업 1위 쏘플파티룸 대표. 공실개발·공간수익화·무인공간 전문가."),
    ("about", "about.html", "소개", "소개 — 최시준 | 공간수익화 전문가",
     "현대엔지니어링 자산관리팀에서 전국 120여개 쏘플파티룸까지. 최시준의 스토리, 경력 전체, 운영철학."),
    ("brands", "brands.html", "브랜드", "브랜드 — 최시준 | 쏘플파티룸·공백·밍글·레스텔",
     "쏘플파티룸, 공백, 밍글, 레스텔 — 최시준이 직접 만들고 운영하는 공간 브랜드 포트폴리오와 실험의 기록."),
    ("community", "community.html", "커뮤니티", "커뮤니티 — 최시준 | 제휴·협업 라운지",
     "건물주·부동산·브랜드·예비창업자가 교류하는 공간. 제휴 제안, 질문, 정보공유 게시판."),
    ("books", "books.html", "전자책", "전자책 — 최시준 | 공간사업 실전 가이드",
     "공실개발과 공간대여 창업 — 340개+ 공간에서 검증한 판단기준을 담은 전자책. 외부 판매처에서 안전하게 결제됩니다."),
    ("cases", "cases.html", "사례", "공실개발 사례 — 최시준",
     "고층·지하·장기 공실을 수익공간으로. 유형별 공실개발 사례와 6단계 프로세스, 판단 포인트."),
    ("services", "services.html", "서비스", "서비스 — 최시준 | 공실개발 컨설팅 · 진단 · 교육 · 강의",
     "공실개발 컨설팅, 공간수익화 진단, 공간대여 창업 교육, 강의·세미나, 제휴·공동사업. 전문분야와 진행 프로세스."),
    ("references", "references.html", "레퍼런스", "레퍼런스 — 최시준 | 프로젝트 · 강의 · 언론 아카이브",
     "10년+ 340개+ 공간의 기록. 공간개발·브랜드 런칭·강의·언론보도 레퍼런스 아카이브."),
    ("media", "media.html", "미디어", "미디어 & 인사이트 — 최시준",
     "언론보도, 공식 채널, 그리고 공간사업 10년의 판단기준을 담은 칼럼."),
    ("contact", "contact.html", "문의하기", "문의하기 — 최시준",
     "공실개발 상담, 공간수익화 진단, 강의·인터뷰, 제휴 제안. 60초 자가진단 후 문의를 남겨주세요."),
    ("404", "404.html", None, "페이지를 찾을 수 없습니다 — 최시준",
     "요청하신 페이지를 찾을 수 없습니다."),
]

NAV_ITEMS = [p for p in PAGES if p[2]]

def head(key, title, desc, fname):
    url = f"{DOMAIN}/" if fname == "index.html" else f"{DOMAIN}/{fname}"
    jsonld = ""
    if key == "home":
        jsonld = f"""
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@graph": [
      {{
        "@type": "Person",
        "name": "최시준",
        "alternateName": "Choi Si-jun",
        "jobTitle": "공간수익화 · 공실개발 전문가",
        "description": "10년+ 340개+ 공간 기획·개발·운영. 국내 무인공간 사업 1위 쏘플파티룸(SSOPLE) 대표, 공실개발 전문가.",
        "email": "runactivator@naver.com",
        "telephone": "010-2384-9580",
        "url": "{DOMAIN}/",
        "sameAs": [
          "https://www.threads.com/@sijun.choi",
          "https://www.instagram.com/sijun.choi",
          "https://ssople.com",
          "https://www.instagram.com/ssople_partyroom/"
        ],
        "knowsAbout": ["공간수익화", "공실개발", "무인공간 운영", "공간대여 창업", "공간브랜딩"],
        "worksFor": {{ "@type": "Organization", "name": "㈜블랭크" }}
      }},
      {{
        "@type": "ProfessionalService",
        "name": "최시준 — 공간수익화 · 공실개발 컨설팅",
        "url": "{DOMAIN}/",
        "areaServed": "KR",
        "serviceType": ["공실개발 컨설팅", "공간수익화 진단", "공간대여 창업 교육", "강의·세미나", "제휴·공동사업"]
      }}
    ]
  }}
  </script>"""
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta name="keywords" content="최시준, 공간수익화 전문가, 공실개발, 공간대여 창업, 무인공간, 쏘플파티룸 대표, 공간브랜딩" />
  <meta name="author" content="최시준 (Choi Si-jun)" />
  <link rel="canonical" href="{url}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{DOMAIN}/assets/og-image.jpg" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{DOMAIN}/assets/og-image.jpg" />
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
  <link rel="stylesheet" href="styles.css" />{jsonld}
</head>
<body data-page="{key}">
  <a class="skip-link" href="#main">본문 바로가기</a>
  <div class="progress" aria-hidden="true"><span id="progressBar"></span></div>
"""

def header_nav(active_key):
    links = []
    for key, fname, label, _, _ in NAV_ITEMS:
        cls = ' class="is-active"' if key == active_key else ""
        if key == "contact":
            cls = ' class="nav-cta is-active"' if key == active_key else ' class="nav-cta"'
        links.append(f'        <a href="{fname}"{cls}>{label}</a>')
    return f"""  <header class="header" id="header">
    <div class="container header-inner">
      <a class="logo" href="index.html" aria-label="최시준 홈">
        <span class="logo-mark" aria-hidden="true"></span>
        <span class="logo-text">CHOI SIJUN</span>
      </a>
      <nav class="nav" id="nav" aria-label="주 메뉴">
{chr(10).join(links)}
      </nav>
      <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-label="메뉴 열기" aria-controls="nav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <main id="main">
"""

FOOTER = """  </main>

  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <p class="footer-logo">CHOI SIJUN<span class="accent">.</span></p>
          <p>공간을 수익공간으로 바꾸는 사람.<br />공간수익화 · 공실개발 · 무인공간 · 공간대여 창업</p>
        </div>
        <nav class="footer-nav" aria-label="푸터 메뉴">
          <div>
            <p class="mono">PROFILE</p>
            <a href="about.html">소개 · 스토리</a>
            <a href="brands.html">브랜드 포트폴리오</a>
            <a href="references.html">레퍼런스</a>
            <a href="media.html">미디어 & 인사이트</a>
          </div>
          <div>
            <p class="mono">WORK WITH ME</p>
            <a href="cases.html">공실개발 사례</a>
            <a href="services.html">서비스 안내</a>
            <a href="books.html">전자책 스토어</a>
            <a href="contact.html">자가진단 & 문의</a>
            <a href="community.html">커뮤니티</a>
          </div>
          <div>
            <p class="mono">PERSONAL</p>
            <a href="https://www.threads.com/@sijun.choi" target="_blank" rel="noopener">Threads @sijun.choi</a>
            <a href="https://www.instagram.com/sijun.choi" target="_blank" rel="noopener">Instagram @sijun.choi</a>
            <a href="https://open.kakao.com/me/choisijun" target="_blank" rel="noopener">카카오톡 오픈프로필</a>
            <a href="https://m.search.naver.com/search.naver?query=%EC%B5%9C%EC%8B%9C%EC%A4%80&sm=mtp_hty.top&where=m" target="_blank" rel="noopener">NAVER에서 '최시준' 검색</a>
          </div>
          <div>
            <p class="mono">OFFICIAL · BUSINESS</p>
            <a href="https://ssople.com" target="_blank" rel="noopener">쏘플파티룸</a>
            <a href="https://vacancy.co.kr/" target="_blank" rel="noopener">공백 — 공실개발</a>
            <a href="https://tgrzspace.pages.dev/" target="_blank" rel="noopener">TGRZ SPACE</a>
            <a href="https://orbisestate.pages.dev/" target="_blank" rel="noopener">오르비스중개법인</a>
            <a href="https://www.instagram.com/ssople_partyroom/" target="_blank" rel="noopener">Instagram</a>
          </div>
        </nav>
      </div>
      <div class="footer-bottom">
        <p class="mono">© <span id="year">2026</span> CHOI SIJUN · ㈜블랭크. ALL RIGHTS RESERVED.</p>
        <p class="mono">공간수익화 · 공실개발 · 무인공간 · 공간대여</p>
      </div>
    </div>
  </footer>

  <a class="float-cta" id="floatCta" href="contact.html">공실개발 상담하기</a>
  <button class="to-top" id="toTop" aria-label="맨 위로">↑</button>

  <script src="script.js"></script>
</body>
</html>
"""

def build():
    for key, fname, label, title, desc in PAGES:
        frag_path = os.path.join("fragments", fname)
        with io.open(frag_path, encoding="utf-8") as f:
            body = f.read()
        html = head(key, title, desc, fname) + header_nav(key) + body + FOOTER
        html = html.replace('href="styles.css"', f'href="styles.css?v={VERSION}"')
        html = html.replace('src="script.js"', f'src="script.js?v={VERSION}"')
        with io.open(fname, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"built {fname} ({len(html)} bytes)")

if __name__ == "__main__":
    build()
