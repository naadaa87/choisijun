# -*- coding: utf-8 -*-
"""정적 페이지 생성기
- fragments/*.html 을 공통 헤더·푸터로 감싸 최종 HTML을 만든다.
- data/portfolio.json 을 읽어 포트폴리오 카드·막대·숫자를 정적 HTML로 채운다({{PF_...}} 자리표시).
- sitemap.xml 도 함께 만든다.
출력물은 100% 정적 HTML이라 배포 환경에서는 이 스크립트 없이도 동작한다."""
import io, os, re, json, html
from datetime import datetime

DOMAIN = "https://choisijun.com"
NOW = datetime.now()
VERSION = NOW.strftime("%Y%m%d%H%M")   # CSS/JS 캐시버스팅
TODAY = NOW.strftime("%Y-%m-%d")

# ------------------------------------------------------------------
# 포트폴리오 데이터
# ------------------------------------------------------------------
def compute_stats(items):
    """카드(items)만 보고 숫자를 다시 계산한다.
    data/portfolio.json 에서 공간 하나를 고치거나 더해도 지표·막대·필터 숫자가 저절로 맞춰진다."""
    from collections import Counter

    def counter(key):
        c = Counter()
        for i in items:
            c[i[key]] += i['spaces']
        return c

    known = [i for i in items if i.get('floorClass')]
    sizes = [i['size'] for i in items if i.get('size')]
    years = [i['year'] for i in items if i.get('year')]
    return {
        'spaces': sum(i['spaces'] for i in items),
        'places': len(items),
        'roomSpaces': sum(i['spaces'] for i in items if i.get('rooms')),
        'roomPlaces': sum(1 for i in items if i.get('rooms')),
        'sido': len({i['sido'] for i in items}),
        'areas': len({i['area'] for i in items}),
        'brands': len({i['brand'] for i in items}),
        'types': len({i['type'] for i in items}),
        'floorKnown': len(known),
        'offFloor': sum(1 for i in known if i['floorClass'] in ('basement', 'upper')),
        'basement': sum(1 for i in known if i['floorClass'] == 'basement'),
        'upper': sum(1 for i in known if i['floorClass'] == 'upper'),
        'sizeMin': min(sizes) if sizes else 0, 'sizeMax': max(sizes) if sizes else 0,
        'yearMin': min(years) if years else 0, 'yearMax': max(years) if years else 0,
        'byRegion': [list(x) for x in counter('region').most_common()],
        'byType': [list(x) for x in counter('type').most_common()],
        'byGroup': [list(x) for x in counter('group').most_common()],
        'byArea': [list(x) for x in counter('area').most_common(12)],
    }


PF = None
if os.path.exists(os.path.join("data", "portfolio.json")):
    with io.open(os.path.join("data", "portfolio.json"), encoding="utf-8") as f:
        try:
            PF = json.load(f)
        except json.JSONDecodeError as e:
            raise SystemExit(f"[빌드 중단] data/portfolio.json {e.lineno}번째 줄 {e.colno}번째 글자 근처에 형식 오류가 있습니다. "
                             f"쉼표(,)나 따옴표(\")가 빠지거나 하나 더 들어가지 않았는지 확인하세요. 사이트는 직전 배포 상태로 유지됩니다. ({e.msg})")
    PF['stats'] = compute_stats(PF['items'])

PF_SPACES = PF["stats"]["spaces"] if PF else 0

PAGES = [
    # key, file, nav label, <title>, meta description
    ("home", "index.html", None, "최시준 | 공간수익화 · 공실개발 전문가",
     "공간을 수익공간으로 바꾸는 사람, 최시준. 10년+ 340개+ 공간 기획·개발·운영, 국내 무인공간 사업 1위 쏘플파티룸 대표. 공실개발·공간수익화·무인공간 전문가."),
    ("about", "about.html", "소개", "소개 — 최시준 | 공간수익화 전문가",
     "현대엔지니어링 자산관리팀에서 전국 120여개 쏘플파티룸까지. 최시준의 스토리, 경력 전체, 운영철학."),
    ("brands", "brands.html", "브랜드", "브랜드 — 최시준 | 쏘플파티룸·플레이션·공백·밍글·레스텔",
     "쏘플파티룸, 플레이션, 공백, 밍글, 레스텔 — 최시준이 직접 만들고 운영하는 공간 브랜드 포트폴리오와 실험의 기록."),
    ("community", "community.html", "커뮤니티", "커뮤니티 — 최시준 | 제휴·협업 라운지",
     "건물주·부동산·브랜드·예비창업자가 교류하는 공간. 제휴 제안, 질문, 정보공유 게시판."),
    ("books", "books.html", "전자책", "전자책 — 최시준 | 공간사업 실전 가이드",
     "공실개발과 공간대여 창업 — 340개+ 공간에서 검증한 판단기준을 담은 전자책. 외부 판매처에서 안전하게 결제됩니다."),
    ("cases", "cases.html", "사례", "공실개발 사례 — 최시준",
     "고층·지하·장기 공실을 수익공간으로. 유형별 공실개발 사례와 6단계 프로세스, 판단 포인트."),
    ("services", "services.html", "서비스", "서비스 — 최시준 | 공실개발 컨설팅 · 진단 · 교육 · 강의",
     "공실개발 컨설팅, 공간수익화 진단, 공간대여 창업 교육, 강의·세미나, 제휴·공동사업. 전문분야와 진행 프로세스."),
    ("portfolio", "portfolio.html", "포트폴리오", "공간 포트폴리오 — 최시준 | 340개+ 공간의 기록",
     f"파티룸·게임파티룸·모임공간·공유주거·F&B·행사홀까지. 최시준 공간 아카이브 가운데 기록으로 확인한 {PF_SPACES}개 공간을 지역·유형·브랜드별로 정리했습니다."),
    ("references", "references.html", "레퍼런스", "레퍼런스 — 최시준 | 프로젝트 · 강의 · 언론 아카이브",
     "10년+ 340개+ 공간의 기록. 공간개발·브랜드 런칭·강의·언론보도 레퍼런스 아카이브."),
    ("media", "media.html", "미디어", "미디어 & 인사이트 — 최시준",
     "쇼릴 2026, 언론보도, 공식 채널, 그리고 공간사업 10년의 판단기준을 담은 칼럼."),
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
        "image": "{DOMAIN}/assets/profile.jpg",
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
      }},
      {{
        "@type": "VideoObject",
        "name": "최시준 쇼릴 2026",
        "description": "340개+ 공간, 쏘플파티룸, AI 에이전트 13종, 마이웍스, 강의와 전자책까지 15초로 담은 최시준 쇼릴.",
        "thumbnailUrl": "{DOMAIN}/assets/video/showreel-poster.jpg",
        "contentUrl": "{DOMAIN}/assets/video/showreel-2026-1080.mp4",
        "uploadDate": "2026-10-10",
        "duration": "PT15S"
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
  <meta name="keywords" content="최시준, 공간수익화 전문가, 공실개발, 공간대여 창업, 무인공간, 쏘플파티룸 대표, 공간브랜딩, 공간 포트폴리오" />
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
            <a href="brands.html">브랜드</a>
            <a href="portfolio.html">공간 포트폴리오</a>
            <a href="references.html">레퍼런스</a>
            <a href="media.html">미디어 & 쇼릴</a>
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
            <a href="https://m.search.naver.com/search.naver?query=%EC%B5%9C%EC%8B%9C%EC%A4%80&amp;sm=mtp_hty.top&amp;where=m" target="_blank" rel="noopener">NAVER에서 '최시준' 검색</a>
          </div>
          <div>
            <p class="mono">OFFICIAL · BUSINESS</p>
            <a href="https://ssople.com" target="_blank" rel="noopener">쏘플파티룸</a>
            <a href="https://vacancy.co.kr/" target="_blank" rel="noopener">공백 — 공실개발</a>
            <a href="https://tgrzspace.pages.dev/" target="_blank" rel="noopener">TGRZ SPACE</a>
            <a href="https://orbisestate.pages.dev/" target="_blank" rel="noopener">오르비스중개법인</a>
            <a href="https://myworkspro.pages.dev/" target="_blank" rel="noopener">마이웍스</a>
            <a href="https://www.instagram.com/ssople_partyroom/" target="_blank" rel="noopener">쏘플파티룸 Instagram</a>
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

# ------------------------------------------------------------------
# 포트폴리오 렌더링
# ------------------------------------------------------------------
esc = lambda s: html.escape(str(s), quote=True)
REGION_ORDER = ['서울', '경기', '인천', '충청권', '경상권', '전라권']
TYPE_ORDER = ['파티룸', '게임파티룸', '테마 파티룸', '모임·교육 공간', '행사홀', '공유주거', 'F&B·카페', '게임·커뮤니티']


def region_rank(r):
    """목록에 없는 권역(예: 강원권, 제주)을 새로 넣어도 빌드가 멈추지 않도록 맨 뒤로 보낸다"""
    return REGION_ORDER.index(r) if r in REGION_ORDER else len(REGION_ORDER)
FLOOR_LABEL = {'basement': '지하', 'ground': '1~2층', 'upper': '3층 이상'}


def floor_text(fl):
    if not fl:
        return ''
    if fl.startswith('B'):
        return '지하 ' + fl[1:] + '층'
    return fl.replace('F', '층').replace('·', '·')


def place_text(it):
    return it['area'] if it['area'] == it['sido'] else f"{it['sido']} {it['area']}"


def pf_card(it):
    specs = []
    if it.get('rooms'):
        specs.append(f"{it['spaces']}실")
    if it.get('size'):
        pre = (it.get('sizePrefix') or '')
        specs.append(f"{pre + ' ' if pre else ''}{it['size']}평")
    if it.get('capMax'):
        specs.append(f"{it['capMin']}~{it['capMax']}명" if it.get('capMin') else f"최대 {it['capMax']}명")
    if it.get('year'):
        specs.append(f"{it['year']}")
    detail = it.get('sizeDetail') or (it.get('roomNote') if it.get('rooms') else '')
    q = ' '.join(str(x) for x in [it['name'], it['brand'], it['group'], it.get('network') or '', it['type'],
                                   it.get('subtype') or '', it['region'], it['sido'], it['area'],
                                   ' '.join(it.get('tags') or []), it.get('desc') or '', detail,
                                   floor_text(it.get('floor'))]).lower()
    floor_cls = it.get('floorClass') or ''
    region_idx = region_rank(it['region'])
    top = [f'<span class="pf-brand">{esc(it["brand"])}</span>']
    if it.get('network'):
        top.append(f'<span class="pf-net mono">{esc(it["network"])}</span>')
    badge = f'<span class="pf-floor is-{floor_cls}" title="{esc(floor_text(it["floor"]))}">{esc(it["floor"])}</span>' if it.get('floor') else ''
    out = [f'<article class="pf-card" data-group="{esc(it["group"])}" data-type="{esc(it["type"])}" '
           f'data-region="{esc(it["region"])}" data-floor="{esc(floor_cls)}" data-size="{it.get("size") or 0}" '
           f'data-spaces="{it["spaces"]}" data-name="{esc(it["name"])}" data-ri="{region_idx}" data-area="{esc(it["area"])}" data-q="{esc(q)}">',
           f'  <div class="pf-card-top"><div class="pf-brands">{"".join(top)}</div>{badge}</div>',
           f'  <h3 class="pf-name">{esc(it["name"])}</h3>',
           f'  <p class="pf-meta">{esc(it.get("subtype") or it["type"])} · {esc(place_text(it))}</p>']
    if specs:
        out.append('  <ul class="pf-specs">' + ''.join(f'<li>{esc(s)}</li>' for s in specs) + '</ul>')
    if detail:
        out.append(f'  <p class="pf-detail">{esc(detail)}</p>')
    if it.get('desc'):
        out.append(f'  <p class="pf-desc">{esc(it["desc"])}</p>')
    if it.get('tags'):
        out.append('  <p class="pf-tags">' + ''.join(f'<span>#{esc(t)}</span>' for t in it['tags']) + '</p>')
    out.append('</article>')
    return '\n'.join(out)


def bar_list(pairs, kind, total):
    mx = max(v for _, v in pairs) or 1
    rows = []
    for label, v in pairs:
        share = round(v / total * 100)
        rows.append(
            f'<li><button class="pf-bar" type="button" data-pf-filter="{kind}" data-pf-value="{esc(label)}" '
            f'aria-label="{esc(label)} {v}개 공간, 전체의 {share}% — 아래 목록에서 보기">'
            f'<span class="pf-bar-label">{esc(label)}</span>'
            f'<span class="pf-bar-track" aria-hidden="true"><span class="pf-bar-fill" style="width:{v / mx * 100:.1f}%"></span></span>'
            f'<span class="pf-bar-value">{v}<small>{share}%</small></span></button></li>')
    return '<ul class="pf-bars">' + ''.join(rows) + '</ul>'


def richness(it):
    """추천순: 공개 정보가 많은 카드부터, 같으면 권역·지역·이름순"""
    score = (2 if it.get('desc') else 0) + (2 if it.get('size') else 0) + (2 if it.get('rooms') else 0) \
        + (1 if it.get('capMax') else 0) + (1 if it.get('floor') else 0) + (1 if it.get('sizeDetail') else 0) \
        + (1 if it.get('tags') else 0) + (1 if it.get('year') else 0)
    return (-score, region_rank(it['region']), it['area'], it['name'])


def pf_tokens():
    if not PF:
        return {}
    s, items = PF['stats'], PF['items']
    total = s['spaces']
    by_region = dict(s['byRegion'])
    by_type = dict(s['byType'])
    by_group = s['byGroup']
    floor_cnt = {k: sum(i['spaces'] for i in items if i.get('floorClass') == k) for k in FLOOR_LABEL}
    region_pairs = [(r, by_region[r]) for r in sorted(by_region, key=lambda r: -by_region[r])]
    type_pairs = [(t, by_type[t]) for t in sorted(by_type, key=lambda t: -by_type[t])]
    top4 = s['byArea'][:4]
    off_pct = round(s['offFloor'] / s['floorKnown'] * 100)
    return {
        'PF_SPACES': str(total),
        'PF_PLACES': str(s['places']),
        'PF_SIDO': str(s['sido']),
        'PF_AREAS': str(s['areas']),
        'PF_TYPES': str(s['types']),
        'PF_FLOOR_KNOWN': str(s['floorKnown']),
        'PF_OFF_FLOOR': str(s['offFloor']),
        'PF_OFF_PCT': str(off_pct),
        'PF_BASEMENT': str(s['basement']),
        'PF_UPPER': str(s['upper']),
        'PF_SIZE_MIN': str(s['sizeMin']),
        'PF_SIZE_MAX': str(s['sizeMax']),
        'PF_YEAR_MIN': str(s['yearMin']),
        'PF_YEAR_MAX': str(s['yearMax']),
        'PF_ROOM_SPACES': str(s['roomSpaces']),
        'PF_ROOM_PLACES': str(s['roomPlaces']),
        'PF_TOP_AREA': esc(top4[0][0]),
        'PF_TOP_AREA_N': str(top4[0][1]),
        'PF_AREA_TOP4': ', '.join(f'{esc(a)} {n}개' for a, n in top4),
        'PF_REGION_BARS': bar_list(region_pairs, 'region', total),
        'PF_TYPE_BARS': bar_list(type_pairs, 'type', total),
        'PF_REGION_OPTIONS': ''.join(f'<option value="{esc(r)}">{esc(r)} ({by_region[r]})</option>'
                                     for r in sorted(by_region, key=region_rank)),
        'PF_BRAND_OPTIONS': ''.join(f'<option value="{esc(g)}">{esc(g)} ({n})</option>' for g, n in by_group),
        'PF_FLOOR_OPTIONS': ''.join(f'<option value="{k}">{FLOOR_LABEL[k]} ({floor_cnt[k]})</option>'
                                    for k in ['basement', 'ground', 'upper'])
                            + f'<option value="off">지하 + 3층 이상 ({floor_cnt["basement"] + floor_cnt["upper"]})</option>',
        'PF_TYPE_CHIPS': ''.join(f'<button class="f-chip" type="button" data-type="{esc(t)}">{esc(t)} <em>{by_type[t]}</em></button>'
                                 for t in sorted(by_type, key=lambda t: TYPE_ORDER.index(t) if t in TYPE_ORDER else len(TYPE_ORDER))),
        'PF_CARDS': '\n'.join(pf_card(i) for i in sorted(items, key=richness)),
    }


TOKENS = pf_tokens()
TOKEN_RE = re.compile(r'\{\{(PF_[A-Z0-9_]+)\}\}')


def fill(text, fname):
    def rep(m):
        k = m.group(1)
        if k not in TOKENS:
            raise KeyError(f'{fname}: 알 수 없는 자리표시 {{{{{k}}}}} (data/portfolio.json 확인)')
        return TOKENS[k]
    return TOKEN_RE.sub(rep, text)


def build_sitemap():
    prio = {'index.html': '1.0', 'about.html': '0.9', 'cases.html': '0.9', 'services.html': '0.9',
            'portfolio.html': '0.9', 'contact.html': '0.9'}
    urls = []
    for key, fname, label, _, _ in PAGES:
        if key == '404':
            continue
        loc = f"{DOMAIN}/" if fname == 'index.html' else f"{DOMAIN}/{fname}"
        urls.append(f"  <url><loc>{loc}</loc><lastmod>{TODAY}</lastmod><priority>{prio.get(fname, '0.8')}</priority></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(urls) + '\n</urlset>\n'
    with io.open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(xml)
    print(f'built sitemap.xml ({len(urls)} urls)')


def build():
    for key, fname, label, title, desc in PAGES:
        with io.open(os.path.join("fragments", fname), encoding="utf-8") as f:
            body = fill(f.read(), fname)
        out = head(key, title, desc, fname) + header_nav(key) + body + FOOTER
        out = out.replace('href="styles.css"', f'href="styles.css?v={VERSION}"')
        out = out.replace('src="script.js"', f'src="script.js?v={VERSION}"')
        with io.open(fname, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"built {fname} ({len(out)} bytes)")
    build_sitemap()


if __name__ == "__main__":
    build()
