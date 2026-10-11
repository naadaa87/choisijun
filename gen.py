# -*- coding: utf-8 -*-
"""정적 페이지 생성기 (최시준 홈페이지)
- fragments/*.html 을 공통 헤더·푸터로 감싸 최종 HTML을 만든다.
- data/portfolio.json 을 읽어 포트폴리오 카드·지도·막대·숫자, 지역별 페이지를 정적 HTML로 만든다.
- 검색엔진용 메타태그·구조화 데이터(JSON-LD)·sitemap.xml·rss.xml 을 함께 만든다.
- search-verification.txt 에 적은 네이버·구글·빙 소유확인 코드를 모든 페이지에 넣는다.
출력물은 100% 정적 HTML이라 배포 환경에서는 이 스크립트 없이도 동작한다."""
import io, os, re, json, html
from collections import Counter
from datetime import datetime, timezone, timedelta

DOMAIN = "https://choisijun.com"
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
VERSION = NOW.strftime("%Y%m%d%H%M")   # CSS/JS 캐시버스팅
TODAY = NOW.strftime("%Y-%m-%d")
esc = lambda s: html.escape(str(s), quote=True)

# ------------------------------------------------------------------
# 검색엔진 소유확인 (search-verification.txt)
# ------------------------------------------------------------------
VERIFY_META = {"naver": "naver-site-verification", "google": "google-site-verification", "bing": "msvalidate.01"}


def read_verification(path="search-verification.txt"):
    out = {}
    if not os.path.exists(path):
        return out
    with io.open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip().lower()
            m = re.search(r'content\s*=\s*["\']([^"\']+)["\']', val)   # 태그를 통째로 붙여넣어도 값만 꺼낸다
            val = (m.group(1) if m else val).strip().strip('"\'')
            if key in VERIFY_META and re.fullmatch(r"[A-Za-z0-9_\-:.=+/]{6,200}", val):
                out[key] = val
    return out


VERIFY = read_verification()

# ------------------------------------------------------------------
# 포트폴리오 데이터
# ------------------------------------------------------------------
REGION_ORDER = ['서울', '경기', '인천', '충청권', '경상권', '전라권', '제주권']
REGION_SLUG = {'서울': 'seoul', '경기': 'gyeonggi', '인천': 'incheon', '충청권': 'chungcheong',
               '경상권': 'gyeongsang', '전라권': 'jeolla', '제주권': 'jeju'}
REGION_EN = {'서울': 'SEOUL', '경기': 'GYEONGGI', '인천': 'INCHEON', '충청권': 'CHUNGCHEONG',
             '경상권': 'GYEONGSANG', '전라권': 'JEOLLA', '제주권': 'JEJU'}
TYPE_ORDER = ['파티룸', '게임파티룸', '테마 파티룸', '모임·교육 공간', '행사홀', '공유주거', 'F&B·카페', '게임·커뮤니티']
FLOOR_LABEL = {'basement': '지하', 'ground': '1~2층', 'upper': '3층 이상'}
MIN_REGION_PAGE = 3   # 공간이 이보다 적은 권역은 별도 페이지를 만들지 않는다


def region_rank(r):
    """목록에 없는 권역을 새로 넣어도 빌드가 멈추지 않도록 맨 뒤로 보낸다"""
    return REGION_ORDER.index(r) if r in REGION_ORDER else len(REGION_ORDER)


def compute_stats(items, projects):
    """카드(items)·프로젝트(projects)만 보고 숫자를 다시 계산한다.
    data/portfolio.json 에서 공간 하나를 고치거나 더해도 지표·지도·막대·필터 숫자가 저절로 맞춰진다."""
    def counter(key):
        c = Counter()
        for i in items:
            c[i[key]] += i['spaces']
        return c
    known = [i for i in items if i.get('floorClass')]
    sizes = [i['size'] for i in items if i.get('size')]
    years = [i['year'] for i in items if i.get('year')]
    sido_all = {i['sido'] for i in items} | {p['sido'] for p in projects if p.get('sido')}
    areas_all = {i['area'] for i in items} | {p['area'] for p in projects if p.get('area')}
    return {
        'spaces': sum(i['spaces'] for i in items),
        'places': len(items),
        'projects': len(projects),
        'roomSpaces': sum(i['spaces'] for i in items if i.get('rooms')),
        'roomPlaces': sum(1 for i in items if i.get('rooms')),
        'sido': len({i['sido'] for i in items}),
        'sidoAll': len(sido_all),
        'areas': len({i['area'] for i in items}),
        'areasAll': len(areas_all),
        'brands': len({i['brand'] for i in items}),
        'groups': len({i['group'] for i in items}),
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
        'byArea': [list(x) for x in counter('area').most_common()],
        'bySido': [list(x) for x in counter('sido').most_common()],
        'projectsBySido': [list(x) for x in Counter(p['sido'] for p in projects if p.get('sido')).most_common()],
    }


PF = None
ITEMS, PROJECTS = [], []
if os.path.exists(os.path.join("data", "portfolio.json")):
    with io.open(os.path.join("data", "portfolio.json"), encoding="utf-8") as f:
        try:
            PF = json.load(f)
        except json.JSONDecodeError as e:
            raise SystemExit(f"[빌드 중단] data/portfolio.json {e.lineno}번째 줄 {e.colno}번째 글자 근처에 형식 오류가 있습니다. "
                             f"쉼표(,)나 따옴표(\")가 빠지거나 하나 더 들어가지 않았는지 확인하세요. 사이트는 직전 배포 상태로 유지됩니다. ({e.msg})")
    ITEMS, PROJECTS = PF.get('items', []), PF.get('projects', [])
    PF['stats'] = compute_stats(ITEMS, PROJECTS)
S = PF['stats'] if PF else compute_stats([], [])
REGION_PAGES = [r for r in REGION_ORDER
                if sum(i['spaces'] for i in ITEMS if i['region'] == r) >= MIN_REGION_PAGE]


def region_file(r):
    return f"portfolio-{REGION_SLUG.get(r, 'etc')}.html"


# ------------------------------------------------------------------
# 페이지 목록
#   key, file, nav, title, description, keywords, breadcrumb, schema type
# ------------------------------------------------------------------
BASE_KEYWORDS = "최시준, 최시준 대표, 공실개발, 공간수익화, 쏘플파티룸, 파티룸 창업, 공간대여 창업, 무인공간"
PAGES = [
    dict(key="home", file="index.html", nav=None, crumb=None, schema="WebPage",
         title="최시준 | 공실개발·공간수익화 전문가, 쏘플파티룸 대표",
         desc=f"비어 있는 공간을 수익공간으로 바꾸는 최시준. 10년+ 340개+ 공간을 직접 기획·오픈·운영했고, 전국 {S['sidoAll']}개 시·도의 파티룸·모임공간·게임파티룸 기록과 공실개발 상담, 강의, 전자책을 한곳에 모았습니다.",
         keywords=f"{BASE_KEYWORDS}, 공간브랜딩, 공실 상담, 파티룸 컨설팅, 소셜팩토리, 플레이션"),
    dict(key="about", file="about.html", nav="소개", crumb="소개", schema="AboutPage",
         title="최시준 소개 — 340개+ 공간을 만든 공간수익화 전문가",
         desc="현대엔지니어링 자산관리팀에서 출발해 소셜팩토리, 두둠칫, 쏘플파티룸, 공백까지. 최시준의 이력과 타임라인, 일하는 원칙, 강의·대외활동을 정리했습니다.",
         keywords=f"{BASE_KEYWORDS}, 최시준 프로필, 최시준 강의, TEDxCAU, 중앙대학교"),
    dict(key="brands", file="brands.html", nav="브랜드", crumb="브랜드", schema="CollectionPage",
         title="브랜드 — 쏘플파티룸·소셜팩토리·플레이션·공백 | 최시준",
         desc="무인 파티룸 쏘플파티룸, 모임공간 소셜팩토리, 게임파티룸 플레이션, 공실개발 공백, 무인 디저트카페 밍글, 레스텔까지. 최시준이 직접 만들고 운영한 공간 브랜드입니다.",
         keywords=f"{BASE_KEYWORDS}, 소셜팩토리, 플레이션, 공백, 밍글, 레스텔, 잭슨빌피자, SPMS"),
    dict(key="community", file="community.html", nav="커뮤니티", crumb="커뮤니티", schema="WebPage",
         title="커뮤니티 — 건물주·중개사·창업자 제휴 라운지 | 최시준",
         desc="건물주, 부동산 중개사, 브랜드, 예비 창업자가 제휴를 제안하고 질문을 나누는 게시판입니다. 공실·공간사업 이야기를 남겨주세요.",
         keywords=f"{BASE_KEYWORDS}, 공간사업 커뮤니티, 제휴 제안, 건물주 커뮤니티"),
    dict(key="books", file="books.html", nav="전자책", crumb="전자책", schema="CollectionPage",
         title="전자책 — 공실개발·공간대여 창업 실전 가이드 | 최시준",
         desc="『공실은 자산이다』, 『예약되는 공간』 — 340개+ 공간을 만들며 쌓은 판단기준을 담은 최시준의 전자책. 공실개발과 파티룸·공간대여 창업을 준비하는 분께.",
         keywords=f"{BASE_KEYWORDS}, 공실 전자책, 파티룸 창업 전자책, 공실은 자산이다, 예약되는 공간"),
    dict(key="cases", file="cases.html", nav="사례", crumb="사례", schema="CollectionPage",
         title="공실개발 사례 — 지하·고층·장기 공실을 수익공간으로 | 최시준",
         desc="고층 공실, 지하 공실, 관광지 비선호층, 운영 부진 카페, 장기 공실 상가, 통임대 건물까지. 유형별 공실개발 사례와 6단계 진행 과정, 판단 포인트를 정리했습니다.",
         keywords=f"{BASE_KEYWORDS}, 공실 활용, 상가 공실 해결, 지하 공실, 고층 공실, 통건물 임대, 건물주 공실"),
    dict(key="services", file="services.html", nav="서비스", crumb="서비스", schema="WebPage",
         title="공실개발 컨설팅·파티룸 창업 교육·강의 | 최시준",
         desc="공실개발 컨설팅, 공간수익화 진단, 파티룸·공간대여 창업 교육, 기업·대학 강의, 제휴·공동사업. 진행 방식과 협업 구조, 자주 묻는 질문을 안내합니다.",
         keywords=f"{BASE_KEYWORDS}, 공실개발 컨설팅, 공간 컨설팅, 파티룸 창업 교육, 창업 강의, 마스터리스"),
    dict(key="portfolio", file="portfolio.html", nav="포트폴리오", crumb="포트폴리오", schema="CollectionPage",
         title=f"공간 포트폴리오 — 전국 {S['spaces']}개 공간·공실개발 {S['projects']}건 | 최시준",
         desc=f"서울·경기·인천부터 충청·경상·전라까지 {S['sidoAll']}개 시·도. 최시준이 기획·오픈·운영한 파티룸, 게임파티룸, 모임공간, 공유주거, F&B, 행사홀 {S['spaces']}개와 공실개발 프로젝트 {S['projects']}건을 지역·유형·브랜드별로 정리했습니다.",
         keywords=f"{BASE_KEYWORDS}, 파티룸 포트폴리오, 공간 기획 사례, 모임공간, 게임파티룸, 지역별 파티룸"),
    dict(key="references", file="references.html", nav="레퍼런스", crumb="레퍼런스", schema="CollectionPage",
         title="레퍼런스 — 공간개발·브랜드·강의·언론 기록 | 최시준",
         desc="10년+ 340개+ 공간의 기록. 공간개발, 브랜드 런칭, 파트너십, 강의·교육, 언론 보도 레퍼런스를 연도별로 모았습니다.",
         keywords=f"{BASE_KEYWORDS}, 레퍼런스, 강의 이력, 언론 보도"),
    dict(key="media", file="media.html", nav="미디어", crumb="미디어", schema="CollectionPage",
         title="미디어 — 쇼릴·언론 보도·칼럼 | 최시준",
         desc="15초 쇼릴 2026, KBS·JTBC·CCTV 등 언론 보도, 공식 채널, 그리고 공간사업 10년의 판단기준을 담은 최시준의 칼럼.",
         keywords=f"{BASE_KEYWORDS}, 최시준 인터뷰, 최시준 방송, 쇼릴, 공간사업 칼럼"),
    dict(key="contact", file="contact.html", nav="문의하기", crumb="문의하기", schema="ContactPage",
         title="공실개발 상담·강의 문의 | 최시준",
         desc="공실개발 상담, 공간수익화 진단, 강의·인터뷰, 제휴 제안. 60초 자가진단으로 내 공간의 가능성을 확인하고 문의를 남겨주세요.",
         keywords=f"{BASE_KEYWORDS}, 공실 상담, 강의 섭외, 인터뷰 문의, 제휴 문의"),
    dict(key="socialfactory", file="socialfactory.html", nav=None, crumb="소셜팩토리", schema="WebPage",
         parent=("brands", "브랜드"),
         title="소셜팩토리 — 2015년 홍대에서 시작한 모임공간 | 최시준",
         desc="소셜팩토리는 최시준이 2015년 홍대에서 처음 만든 모임공간 브랜드입니다. 신촌·합정·인천을 거쳐 2026년 건대에서 모임룸 5개, 24시간 코워킹, 독립사무실로 이어집니다.",
         keywords="소셜팩토리, 소셜팩토리 건대, 소셜팩토리 홍대, 건대 모임공간, 건대 코워킹, 건대 세미나실, 홍대 모임공간, 최시준"),
    dict(key="404", file="404.html", nav=None, crumb=None, schema=None, noindex=True,
         title="페이지를 찾을 수 없습니다 — 최시준", desc="요청하신 페이지를 찾을 수 없습니다.", keywords=""),
]


def region_spaces(r):
    return [i for i in ITEMS if i['region'] == r]


def region_areas(r):
    c = Counter()
    for i in region_spaces(r):
        c[i['area']] += i['spaces']
    return c.most_common()


for _r in REGION_PAGES:
    _n = sum(i['spaces'] for i in region_spaces(_r))
    _areas = region_areas(_r)
    _top = '·'.join(a for a, _ in _areas[:4])
    _types = Counter()
    for _i in region_spaces(_r):
        _types[_i['type']] += _i['spaces']
    _tnames = ', '.join(t for t, _ in _types.most_common(3))
    _projs = [p for p in PROJECTS if p.get('region') == _r]
    PAGES.insert(-1, dict(
        key=f"region-{REGION_SLUG[_r]}", file=region_file(_r), nav=None, crumb=_r, schema="CollectionPage",
        parent=("portfolio", "포트폴리오"), region=_r,
        title=f"{_r} 파티룸·모임공간 포트폴리오 {_n}곳 — {_top} | 최시준",
        desc=f"최시준이 {_r}에서 기획·오픈·운영한 공간 {_n}개. {', '.join(f'{a} {n}' for a, n in _areas[:6])} 등 {len(_areas)}개 지역의 {_tnames} 기록" + (f"과 공실개발 프로젝트 {len(_projs)}건" if _projs else "") + "을 모았습니다.",
        keywords=f"{_r} 파티룸, {_r} 모임공간, {_r} 공실개발, " + ', '.join(f'{a} 파티룸' for a, _ in _areas[:6]) + ", 최시준, 쏘플파티룸"))

NAV_ITEMS = [p for p in PAGES if p['nav']]
PAGE_NAMES = {p['file'][:-5] for p in PAGES}
PAGE_BY_KEY = {p['key']: p for p in PAGES}


def clean_path(fname):
    """Cloudflare Pages는 /about.html 을 /about 으로 옮겨준다 → 검색엔진에도 깔끔한 주소를 알린다"""
    return "/" if fname == "index.html" else "/" + fname[:-5]


def page_url(fname):
    return DOMAIN + clean_path(fname)


# ------------------------------------------------------------------
# 구조화 데이터(JSON-LD)
# ------------------------------------------------------------------
PERSON_ID = f"{DOMAIN}/#person"
WEBSITE_ID = f"{DOMAIN}/#website"
BLANK_ID = f"{DOMAIN}/#blank"

PERSON = {
    "@type": "Person", "@id": PERSON_ID,
    "name": "최시준", "alternateName": ["Choi Si-jun", "Sijun Choi", "최시준 대표"],
    "jobTitle": "공간수익화 · 공실개발 전문가",
    "description": "10년+ 340개+ 공간을 직접 기획·오픈·운영한 공간수익화·공실개발 전문가. 쏘플파티룸 대표, ㈜블랭크 대표.",
    "url": f"{DOMAIN}/", "image": f"{DOMAIN}/assets/profile.jpg",
    "email": "runactivator@naver.com", "telephone": "010-2384-9580",
    "nationality": {"@type": "Country", "name": "대한민국"},
    "alumniOf": {"@type": "CollegeOrUniversity", "name": "중앙대학교"},
    "worksFor": {"@id": BLANK_ID},
    "knowsAbout": ["공실개발", "공간수익화", "무인공간 운영", "파티룸 창업", "공간대여 창업", "공간브랜딩", "상권 분석", "마스터리스"],
    "sameAs": ["https://www.threads.com/@sijun.choi", "https://www.instagram.com/sijun.choi"],
}
BLANK = {
    "@type": "Organization", "@id": BLANK_ID, "name": "㈜블랭크", "alternateName": "BLANK",
    "founder": {"@id": PERSON_ID},
    "brand": [{"@type": "Brand", "name": n} for n in ["쏘플파티룸", "공백", "플레이션", "소셜팩토리", "밍글", "레스텔"]],
    "sameAs": ["https://ssople.com", "https://vacancy.co.kr/", "https://www.instagram.com/ssople_partyroom/"],
}
WEBSITE = {
    "@type": "WebSite", "@id": WEBSITE_ID, "url": f"{DOMAIN}/",
    "name": "최시준", "alternateName": ["최시준 공식 홈페이지", "choisijun.com"],
    "inLanguage": "ko-KR", "publisher": {"@id": PERSON_ID}, "about": {"@id": PERSON_ID},
}
VIDEO = {
    "@type": "VideoObject", "name": "최시준 쇼릴 2026",
    "description": "340개+ 공간, 쏘플파티룸, AI 에이전트 13종, 마이웍스, 강의와 전자책까지 15초로 담은 최시준 쇼릴.",
    "thumbnailUrl": f"{DOMAIN}/assets/video/showreel-poster.jpg",
    "contentUrl": f"{DOMAIN}/assets/video/showreel-2026-1080.mp4",
    "uploadDate": "2026-10-10T09:00:00+09:00", "duration": "PT15S", "inLanguage": "ko",
    "author": {"@id": PERSON_ID},
}
BOOKS = [
    {"@type": "Book", "name": "공실은 자산이다 — 공실개발 실전 가이드", "author": {"@id": PERSON_ID},
     "bookFormat": "https://schema.org/EBook", "inLanguage": "ko", "url": f"{DOMAIN}/books"},
    {"@type": "Book", "name": "예약되는 공간 — 공간대여 창업의 판단기준", "author": {"@id": PERSON_ID},
     "bookFormat": "https://schema.org/EBook", "inLanguage": "ko", "url": f"{DOMAIN}/books"},
]


def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def faq_from(fragment_html, pattern):
    qa = []
    for q, a in re.findall(pattern, fragment_html, re.S):
        qa.append({"@type": "Question", "name": strip_tags(q),
                   "acceptedAnswer": {"@type": "Answer", "text": strip_tags(a)}})
    return qa


def breadcrumb(page):
    if page['key'] == 'home':
        return None
    trail = [("홈", "index.html")]
    if page.get('parent'):
        pk, plabel = page['parent']
        trail.append((plabel, PAGE_BY_KEY[pk]['file']))
    trail.append((page['crumb'] or page['title'], page['file']))
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": n, "name": name, "item": page_url(f)}
        for n, (name, f) in enumerate(trail, 1)]}


def jsonld(page, body):
    if page.get('noindex'):
        return ""
    url = page_url(page['file'])
    webpage = {"@type": page['schema'] or "WebPage", "@id": url + "#webpage", "url": url,
               "name": page['title'], "description": page['desc'], "inLanguage": "ko-KR",
               "isPartOf": {"@id": WEBSITE_ID}, "about": {"@id": PERSON_ID}}
    graph = [webpage, WEBSITE, PERSON, BLANK]
    bc = breadcrumb(page)
    if bc:
        webpage["breadcrumb"] = bc
    key = page['key']
    if key in ("home", "media"):
        graph.append(VIDEO)
    if key == "home":
        graph.append({"@type": "ProfessionalService", "name": "최시준 — 공실개발 · 공간수익화 컨설팅",
                      "url": f"{DOMAIN}/", "provider": {"@id": PERSON_ID}, "areaServed": "KR",
                      "serviceType": ["공실개발 컨설팅", "공간수익화 진단", "파티룸·공간대여 창업 교육", "강의·세미나", "제휴·공동사업"]})
    if key == "books":
        graph.extend(BOOKS)
    if key == "services":
        qa = faq_from(body, r'<details class="faq-item"><summary>(.*?)</summary>\s*<p>(.*?)</p>')
        if qa:
            graph.append({"@type": "FAQPage", "mainEntity": qa})
    if key == "socialfactory":
        graph.append({"@type": "Organization", "name": "소셜팩토리", "alternateName": "Social Factory",
                      "foundingDate": "2015-10", "founder": {"@id": PERSON_ID}, "url": url,
                      "description": "모임·스터디·세미나·코워킹 공간 브랜드. 2015년 홍대에서 시작해 2026년 건대로 이어진다."})
        qa = faq_from(body, r'<details class="faq-item"><summary>(.*?)</summary>\s*<p>(.*?)</p>')
        if qa:
            graph.append({"@type": "FAQPage", "mainEntity": qa})
    if key == "portfolio" or key.startswith("region-"):
        pool = ITEMS if key == "portfolio" else region_spaces(page['region'])
        names = [i['name'] for i in sorted(pool, key=richness)][:30]
        webpage["mainEntity"] = {"@type": "ItemList", "numberOfItems": len(pool),
                                 "itemListElement": [{"@type": "ListItem", "position": n, "name": nm}
                                                     for n, nm in enumerate(names, 1)]}
    data = {"@context": "https://schema.org", "@graph": graph}
    return '\n  <script type="application/ld+json">\n' + json.dumps(data, ensure_ascii=False, indent=1) + '\n  </script>'


# ------------------------------------------------------------------
# 머리말 · 헤더 · 푸터
# ------------------------------------------------------------------
def head(page, body):
    url = page_url(page['file'])
    title, desc = esc(page['title']), esc(page['desc'])
    og_img = f"{DOMAIN}/assets/video/showreel-poster.jpg" if page['key'] == "media" else f"{DOMAIN}/assets/og-image.jpg"
    robots = "noindex, follow" if page.get('noindex') else "index, follow, max-image-preview:large, max-snippet:-1"
    verify = "".join(f'\n  <meta name="{VERIFY_META[k]}" content="{esc(v)}" />' for k, v in VERIFY.items())
    canonical = "" if page.get('noindex') else f'\n  <link rel="canonical" href="{url}" />'
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta name="keywords" content="{esc(page['keywords'])}" />
  <meta name="author" content="최시준 (Choi Si-jun)" />
  <meta name="robots" content="{robots}" />{verify}{canonical}
  <meta property="og:type" content="{'profile' if page['key'] == 'about' else 'website'}" />
  <meta property="og:site_name" content="최시준" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{og_img}" />
  <meta property="og:image:alt" content="최시준 — 공실개발·공간수익화 전문가" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{og_img}" />
  <meta name="theme-color" content="#F8F7F4" />
  <link rel="alternate" type="application/rss+xml" title="최시준 — 새 소식" href="{DOMAIN}/rss.xml" />
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
  <link rel="stylesheet" href="styles.css" />{jsonld(page, body)}
</head>
<body data-page="{page['key'] if not page['key'].startswith('region-') else 'portfolio'}">
  <a class="skip-link" href="#main">본문 바로가기</a>
  <div class="progress" aria-hidden="true"><span id="progressBar"></span></div>
"""


def header_nav(page):
    active = page.get('parent', (page['key'],))[0] if page.get('parent') else page['key']
    links = []
    for p in NAV_ITEMS:
        on = p['key'] == active
        cls = ' class="nav-cta is-active"' if (p['key'] == "contact" and on) else (' class="nav-cta"' if p['key'] == "contact" else (' class="is-active"' if on else ""))
        cur = ' aria-current="page"' if p['key'] == page['key'] else ""
        links.append(f'        <a href="{p["file"]}"{cls}{cur}>{p["nav"]}</a>')
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


def footer():
    regions = " · ".join(f'<a href="{region_file(r)}">{r}</a>' for r in REGION_PAGES)
    return f"""  </main>

  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <p class="footer-logo">CHOI SIJUN<span class="accent">.</span></p>
          <p>공간을 수익공간으로 바꾸는 사람.<br />공실개발 · 공간수익화 · 무인공간 · 공간대여 창업</p>
        </div>
        <nav class="footer-nav" aria-label="푸터 메뉴">
          <div>
            <p class="mono">PROFILE</p>
            <a href="about.html">소개 · 스토리</a>
            <a href="brands.html">브랜드</a>
            <a href="socialfactory.html">소셜팩토리</a>
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
      <p class="footer-regions mono"><span>지역별 포트폴리오</span> {regions}</p>
      <div class="footer-bottom">
        <p class="mono">© <span id="year">{NOW.year}</span> CHOI SIJUN · ㈜블랭크. ALL RIGHTS RESERVED.</p>
        <p class="mono">공실개발 · 공간수익화 · 무인공간 · 공간대여</p>
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
def floor_text(fl):
    if not fl:
        return ''
    if fl == 'RF':
        return '옥탑'
    if fl.startswith('B'):
        return '지하 ' + fl[1:] + '층'
    return fl.replace('F', '층')


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
    top = [f'<span class="pf-brand">{esc(it["brand"])}</span>']
    if it.get('network'):
        top.append(f'<span class="pf-net mono">{esc(it["network"])}</span>')
    badge = (f'<span class="pf-floor is-{floor_cls or "mixed"}" title="{esc(floor_text(it["floor"]))}">{esc(it["floor"])}</span>'
             if it.get('floor') else '')
    out = [f'<article class="pf-card" data-group="{esc(it["group"])}" data-type="{esc(it["type"])}" '
           f'data-region="{esc(it["region"])}" data-sido="{esc(it["sido"])}" data-floor="{esc(floor_cls)}" data-size="{it.get("size") or 0}" '
           f'data-spaces="{it["spaces"]}" data-name="{esc(it["name"])}" data-ri="{region_rank(it["region"])}" data-area="{esc(it["area"])}" data-q="{esc(q)}">',
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
    mx = max([v for _, v in pairs] or [1]) or 1
    rows = []
    for label, v in pairs:
        share = round(v / total * 100) if total else 0
        rows.append(
            f'<li><button class="pf-bar" type="button" data-pf-filter="{kind}" data-pf-value="{esc(label)}" '
            f'aria-label="{esc(label)} {v}개 공간, 전체의 {share}% — 아래 목록에서 보기">'
            f'<span class="pf-bar-label">{esc(label)}</span>'
            f'<span class="pf-bar-track" aria-hidden="true"><span class="pf-bar-fill" style="width:{v / mx * 100:.1f}%"></span></span>'
            f'<span class="pf-bar-value">{v}<small>{share if (share or not v) else "&lt;1"}%</small></span></button></li>')
    return '<ul class="pf-bars">' + ''.join(rows) + '</ul>'


def richness(it):
    """추천순: 정보가 많은 카드부터, 같으면 권역·지역·이름순"""
    score = (2 if it.get('desc') else 0) + (2 if it.get('size') else 0) + (2 if it.get('rooms') else 0) \
        + (1 if it.get('capMax') else 0) + (1 if it.get('floor') else 0) + (1 if it.get('sizeDetail') else 0) \
        + (1 if it.get('tags') else 0) + (1 if it.get('year') else 0)
    return (-score, region_rank(it['region']), it['area'], it['name'])


# 전국 타일맵: 시·도 위치를 단순화한 배치 (열, 행)
TILES = [('인천', 1, 1), ('서울', 2, 1), ('강원', 3, 1),
         ('충남', 1, 2), ('경기', 2, 2), ('충북', 3, 2), ('경북', 4, 2),
         ('세종', 1, 3), ('대전', 2, 3), ('대구', 3, 3), ('울산', 4, 3),
         ('전북', 1, 4), ('경남', 2, 4), ('부산', 3, 4),
         ('광주', 1, 5), ('전남', 2, 5),
         ('제주', 1, 6)]
SIDO_REGION = {'서울': '서울', '경기': '경기', '인천': '인천', '대전': '충청권', '충남': '충청권', '충북': '충청권', '세종': '충청권',
               '부산': '경상권', '울산': '경상권', '대구': '경상권', '경북': '경상권', '경남': '경상권',
               '광주': '전라권', '전북': '전라권', '전남': '전라권', '제주': '제주권', '강원': '강원권'}


def tile_step(n):
    for step, lim in enumerate((3, 10, 30, 80), 1):
        if n <= lim:
            return step
    return 5


def tilemap():
    sp = dict(S['bySido'])
    pj = dict(S['projectsBySido'])
    tiles = []
    for name, col, row in TILES:
        n, m = sp.get(name, 0), pj.get(name, 0)
        region = SIDO_REGION.get(name)
        step = tile_step(n) if n else 0
        sub = f'<span class="pf-tile-sub mono">+기획 {m}</span>' if m else ''
        label = f"{name} — 공간 {n}개" + (f", 공실개발 프로젝트 {m}건" if m else "")
        inner = f'<span class="pf-tile-name">{esc(name)}</span><span class="pf-tile-num">{n if n else "—"}</span>{sub}'
        style = f'grid-column:{col};grid-row:{row}'
        if n and region in REGION_PAGES:
            tiles.append(f'<a class="pf-tile s{step}" style="{style}" href="{region_file(region)}" aria-label="{esc(label)} — {esc(region)} 포트폴리오 보기">{inner}</a>')
        elif n or m:
            tiles.append(f'<a class="pf-tile s{step}{" is-plan" if not n else ""}" style="{style}" href="portfolio.html#pf-projects" aria-label="{esc(label)}">{inner}</a>')
        else:
            tiles.append(f'<span class="pf-tile s0" style="{style}" aria-label="{esc(name)} — 기록 없음">{inner}</span>')
    return '<div class="pf-tilemap" role="list" aria-label="시·도별 공간 수">' + ''.join(
        t.replace('<a ', '<a role="listitem" ', 1).replace('<span class="pf-tile s0"', '<span role="listitem" class="pf-tile s0"', 1)
        for t in tiles) + '</div>'


def area_index(region=None, link_mode="region"):
    c = Counter()
    for i in (ITEMS if region is None else region_spaces(region)):
        c[(i['area'], i['region'])] += i['spaces']
    chips = []
    for (area, reg), n in sorted(c.items(), key=lambda x: (-x[1], x[0][0])):
        href = f"#area-{area}" if link_mode == "anchor" else (
            f"{region_file(reg)}#area-{area}" if reg in REGION_PAGES else f"portfolio.html?q={area}#pf-archive")
        chips.append(f'<a class="pf-area-chip" href="{esc(href)}">{esc(area)} <em>{n}</em></a>')
    return '<div class="pf-area-index">' + ''.join(chips) + '</div>'


def region_links(exclude=None):
    cards = []
    for r in REGION_PAGES:
        if r == exclude:
            continue
        n = sum(i['spaces'] for i in region_spaces(r))
        areas = region_areas(r)
        cards.append(f'<a class="pf-region-card" href="{region_file(r)}"><span class="mono">{REGION_EN[r]}</span>'
                     f'<strong>{esc(r)} <em>{n}</em></strong><span class="pf-region-areas">{esc(" · ".join(a for a, _ in areas[:5]))}</span>'
                     f'<span class="pf-region-go mono">{esc(r)} 포트폴리오 →</span></a>')
    return '<div class="pf-region-grid">' + ''.join(cards) + '</div>'


def project_list(projects):
    rows = []
    for p in projects:
        where = esc(p['area'] or '쇼핑몰')
        meta = ' · '.join(x for x in [p['kind'], p.get('detail') or ''] if x)
        rows.append(f'<li class="pf-proj"><span class="pf-proj-area mono">{where}</span>'
                    f'<strong>{esc(p["name"])}</strong><span class="pf-proj-meta">{esc(meta)}</span>'
                    f'<span class="pf-proj-by mono">{esc(p["partner"])}</span></li>')
    return '<ul class="pf-proj-list">' + ''.join(rows) + '</ul>'


def project_summary():
    c = Counter(p['region'] for p in PROJECTS if p.get('region'))
    return ' · '.join(f'{r} {n}' for r, n in sorted(c.items(), key=lambda x: region_rank(x[0])))


def group_spaces(gid):
    return next((i['spaces'] for i in ITEMS if i['id'] == gid), 0)


def pf_tokens():
    if not PF:
        return {}
    s, items = S, ITEMS
    total = s['spaces']
    by_region = dict(s['byRegion'])
    by_type = dict(s['byType'])
    floor_cnt = {k: sum(i['spaces'] for i in items if i.get('floorClass') == k) for k in FLOOR_LABEL}
    region_pairs = sorted(s['byRegion'], key=lambda x: -x[1])
    type_pairs = sorted(s['byType'], key=lambda x: -x[1])
    top4 = s['byArea'][:4]
    off_pct = round(s['offFloor'] / s['floorKnown'] * 100) if s['floorKnown'] else 0
    sf = [i for i in items if i['group'] == '소셜팩토리']
    sf.sort(key=lambda i: (i.get('year') or 9999, i['name']))
    return {
        'PF_SPACES': str(total), 'PF_PLACES': str(s['places']), 'PF_PROJECTS': str(s['projects']),
        'PF_TOTAL': str(total + s['projects']),
        'PF_SIDO': str(s['sido']), 'PF_SIDO_ALL': str(s['sidoAll']),
        'PF_AREAS': str(s['areas']), 'PF_AREAS_ALL': str(s['areasAll']),
        'PF_TYPES': str(s['types']), 'PF_GROUPS': str(s['groups']),
        'PF_FLOOR_KNOWN': str(s['floorKnown']), 'PF_OFF_FLOOR': str(s['offFloor']), 'PF_OFF_PCT': str(off_pct),
        'PF_BASEMENT': str(s['basement']), 'PF_UPPER': str(s['upper']),
        'PF_SIZE_MIN': str(s['sizeMin']), 'PF_SIZE_MAX': str(s['sizeMax']),
        'PF_YEAR_MIN': str(s['yearMin']), 'PF_YEAR_MAX': str(s['yearMax']),
        'PF_ROOM_SPACES': str(s['roomSpaces']), 'PF_ROOM_PLACES': str(s['roomPlaces']),
        'PF_TOP_AREA': esc(top4[0][0]) if top4 else '', 'PF_TOP_AREA_N': str(top4[0][1]) if top4 else '0',
        'PF_AREA_TOP4': ', '.join(f'{esc(a)} {n}개' for a, n in top4),
        'PF_GRP_CHEONAN': str(group_spaces('GRP-CHEONAN')), 'PF_GRP_HONGDAE_MULTI': str(group_spaces('GRP-HONGDAE-MULTI')),
        'PF_GRP_GANGNAM_MULTI': str(group_spaces('GRP-GANGNAM-MULTI')), 'PF_GRP_GANGHWA': str(group_spaces('GRP-GANGHWA')),
        'PF_REGION_BARS': bar_list(region_pairs, 'region', total),
        'PF_TYPE_BARS': bar_list(type_pairs, 'type', total),
        'PF_TILEMAP': tilemap(),
        'PF_AREA_INDEX': area_index(),
        'PF_REGION_LINKS': region_links(),
        'PF_PROJECT_LIST': project_list(PROJECTS),
        'PF_PROJECT_SUMMARY': esc(project_summary()),
        'PF_REGION_OPTIONS': ''.join(f'<option value="{esc(r)}">{esc(r)} ({by_region[r]})</option>'
                                     for r in sorted(by_region, key=region_rank)),
        'PF_BRAND_OPTIONS': ''.join(f'<option value="{esc(g)}">{esc(g)} ({n})</option>' for g, n in s['byGroup']),
        'PF_FLOOR_OPTIONS': ''.join(f'<option value="{k}">{FLOOR_LABEL[k]} ({floor_cnt[k]})</option>'
                                    for k in ['basement', 'ground', 'upper'])
                            + f'<option value="off">지하 + 3층 이상 ({floor_cnt["basement"] + floor_cnt["upper"]})</option>',
        'PF_TYPE_CHIPS': ''.join(f'<button class="f-chip" type="button" data-type="{esc(t)}">{esc(t)} <em>{by_type[t]}</em></button>'
                                 for t in sorted(by_type, key=lambda t: TYPE_ORDER.index(t) if t in TYPE_ORDER else len(TYPE_ORDER))),
        'PF_CARDS': '\n'.join(pf_card(i) for i in sorted(items, key=richness)),
        'PF_SF_N': str(sum(i['spaces'] for i in sf)),
        'PF_DD_N': str(sum(i['spaces'] for i in items if i['group'] == '두둠칫')),
        'PF_SF_CARDS': '\n'.join(pf_card(i) for i in sf),
    }


TOKENS = pf_tokens()
TOKEN_RE = re.compile(r'\{\{([A-Z][A-Z0-9_]+)\}\}')


# ------------------------------------------------------------------
# 레퍼런스: script.js 의 SEED_REFS 를 정적 HTML로도 넣는다(검색엔진은 스크립트 없이 읽는다)
# ------------------------------------------------------------------
def seed_refs():
    try:
        src = io.open("script.js", encoding="utf-8").read()
    except OSError:
        return []
    i = src.find("const SEED_REFS")
    if i < 0:
        return []
    block = src[i:src.find("];", i)]
    refs = []
    for line in block.splitlines():
        if "id:" not in line:
            continue
        r = {k: v[1:-1].replace("\\'", "'").replace('\\"', '"')
             for k, v in re.findall(r"(\w+):\s*('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")", line)}
        if r.get("title"):
            refs.append(r)
    refs.sort(key=lambda r: r.get("year", ""), reverse=True)
    return refs


def ref_cards():
    out = []
    for r in seed_refs():
        link = ""
        if r.get("link"):
            ext = re.match(r"^https?:", r["link"], re.I)
            link = (f'<a class="ref-link" href="{esc(r["link"])}"' + (' target="_blank" rel="noopener"' if ext else "")
                    + '>자세히 보기 ↗</a>')
        out.append(f'<article class="ref-card"><div class="ref-thumb"><span class="mono">REFERENCE</span></div><div class="ref-body">'
                   f'<div class="ref-meta"><span class="ref-cat">{esc(r.get("category", ""))}</span><span class="ref-year">{esc(r.get("year", ""))}</span></div>'
                   f'<h3>{esc(r["title"])}</h3><p class="ref-desc">{esc(r.get("desc", ""))}</p>{link}</div></article>')
    return "\n".join(out)


TOKENS['REF_CARDS'] = ref_cards()


def fill(text, fname):
    def rep(m):
        k = m.group(1)
        if k not in TOKENS:
            raise KeyError(f'{fname}: 알 수 없는 자리표시 {{{{{k}}}}} (data/portfolio.json 확인)')
        return TOKENS[k]
    return TOKEN_RE.sub(rep, text)


# ------------------------------------------------------------------
# 지역별 포트폴리오 페이지 (data/portfolio.json 에서 자동 생성)
# ------------------------------------------------------------------
def region_body(page):
    r = page['region']
    spaces = region_spaces(r)
    n = sum(i['spaces'] for i in spaces)
    areas = region_areas(r)
    types = Counter()
    for i in spaces:
        types[i['type']] += i['spaces']
    projects = [p for p in PROJECTS if p.get('region') == r]
    groups = Counter()
    for i in spaces:
        groups[i['group']] += i['spaces']
    type_txt = ', '.join(t for t, _ in types.most_common(4))
    area_txt = ' · '.join(f'{a} {c}' for a, c in areas[:6])
    blocks = []
    for area, cnt in areas:
        cards = sorted([i for i in spaces if i['area'] == area], key=richness)
        blocks.append(f'''        <div class="pf-area-block" id="area-{esc(area)}">
          <h2 class="pf-area-title">{esc(area)} <span class="mono">{cnt}개 공간</span></h2>
          <div class="pf-grid pf-grid-static">
{chr(10).join(pf_card(i) for i in cards)}
          </div>
        </div>''')
    proj_html = ""
    if projects:
        proj_html = f'''
    <section class="section section-tint" id="pf-projects">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">VACANCY PROJECTS</p>
          <h2>{esc(r)}의 <span class="accent">공실개발·건물 기획 {len(projects)}건</span></h2>
          <p class="lede">비어 있던 층과 건물을 어떤 공간으로 바꿀지 설계한 프로젝트입니다.</p>
        </header>
        {project_list(projects)}
      </div>
    </section>'''
    return f'''    <!-- ===================== PAGE HERO ===================== -->
    <section class="page-hero">
      <div class="container">
        <nav class="crumbs mono" aria-label="현재 위치"><a href="index.html">홈</a><span aria-hidden="true">/</span><a href="portfolio.html">포트폴리오</a><span aria-hidden="true">/</span><span aria-current="page">{esc(r)}</span></nav>
        <p class="eyebrow mono reveal">PORTFOLIO — {REGION_EN[r]}</p>
        <h1 class="reveal">{esc(r)}에서 <span class="accent">{n}개 공간</span>을<br />기획하고 열고 운영했습니다</h1>
        <p class="lede reveal">{esc(area_txt)}. {esc(r)} {len(areas)}개 지역에서 {esc(type_txt)} 공간을 만들었습니다. 지역 이름을 누르면 해당 공간으로 이동합니다.</p>
        <ul class="stats pf-kpis reveal" aria-label="{esc(r)} 포트폴리오 요약">
          <li class="stat"><span class="stat-num">{n}</span><span class="stat-label mono">공간</span></li>
          <li class="stat"><span class="stat-num">{len(areas)}</span><span class="stat-label mono">지역</span></li>
          <li class="stat"><span class="stat-num">{len(types)}</span><span class="stat-label mono">공간 유형</span></li>
          <li class="stat"><span class="stat-num">{len(projects) if projects else len(groups)}</span><span class="stat-label mono">{'공실개발 프로젝트' if projects else '브랜드'}</span></li>
        </ul>
      </div>
    </section>

    <section class="section" id="pf-archive">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">AREAS</p>
          <h2>{esc(r)} 지역별 공간</h2>
        </header>
        {area_index(r, "anchor")}
{chr(10).join(blocks)}
        <p class="case-note mono pf-note">※ 주소와 운영 세부 정보는 싣지 않았습니다. 면적에는 테라스가 포함된 곳이 있습니다.</p>
      </div>
    </section>
{proj_html}
    <section class="section">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">OTHER REGIONS</p>
          <h2>다른 지역 포트폴리오</h2>
        </header>
        {region_links(exclude=r)}
        <div class="hero-cta" style="margin-top:22px;"><a class="btn btn-line" href="portfolio.html">전국 포트폴리오 보기</a></div>
      </div>
    </section>

    <!-- ===================== CTA ===================== -->
    <section class="section section-dark">
      <div class="container" style="text-align:center;">
        <h2 class="reveal" style="font-size:clamp(1.5rem,3vw,2.1rem);font-weight:800;letter-spacing:-0.03em;margin-bottom:14px;">{esc(r)}에 <span class="accent">비어 있는 공간</span>이 있다면</h2>
        <p class="lede reveal" style="max-width:620px;margin:0 auto 28px;">층과 면적, 지금 상태만 알려주시면 어떤 공간이 맞을지 함께 살펴보겠습니다.</p>
        <div class="hero-cta reveal" style="justify-content:center;">
          <a class="btn btn-primary" href="contact.html?inquiry=vacancy">공실개발 상담하기</a>
          <a class="btn btn-ghost" href="cases.html">유형별 사례 보기</a>
        </div>
      </div>
    </section>
'''


# ------------------------------------------------------------------
# 링크 정리 · sitemap · rss
# ------------------------------------------------------------------
LINK_RE = re.compile(r'(href)="(?:\./)?([a-z0-9-]+)\.html((?:\?[^"#]*)?(?:#[^"]*)?)"')


def finalize_links(text):
    def rw(m):
        attr, name, rest = m.groups()
        if name not in PAGE_NAMES:
            return m.group(0)
        return f'{attr}="{"/" if name == "index" else "/" + name}{rest}"'
    text = LINK_RE.sub(rw, text)
    # 자산 경로를 루트 기준으로 (없는 주소의 404 화면에서도 깨지지 않도록)
    text = re.sub(r'((?:src|href|poster|data-src-lg|data-src-sm)=")assets/', r'\1/assets/', text)
    text = text.replace('href="styles.css"', f'href="/styles.css?v={VERSION}"')
    text = text.replace('src="script.js"', f'src="/script.js?v={VERSION}"')
    return text


def indexable():
    return [p for p in PAGES if not p.get('noindex')]


def build_sitemap():
    prio = {'home': '1.0', 'about': '0.9', 'portfolio': '0.9', 'cases': '0.9', 'services': '0.9', 'contact': '0.8',
            'brands': '0.8', 'socialfactory': '0.8'}
    urls = []
    for p in indexable():
        pr = prio.get(p['key'], '0.7' if p['key'].startswith('region-') else '0.6')
        urls.append(f"  <url><loc>{page_url(p['file'])}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + '\n'.join(urls) + '\n</urlset>\n')
    with io.open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(xml)
    print(f'built sitemap.xml ({len(urls)} urls)')


# RSS: 네이버·다음 수집 요청용 새 소식 목록 (날짜는 내용이 바뀐 날)
RSS_DATES = {'portfolio': '2026-10-11', 'socialfactory': '2026-10-11', 'home': '2026-10-11', 'media': '2026-10-10',
             'brands': '2026-10-11', 'about': '2026-10-10', 'references': '2026-10-11'}


def build_rss():
    def rfc822(d):
        dt = datetime.strptime(d, "%Y-%m-%d").replace(hour=9, tzinfo=KST)
        return dt.strftime("%a, %d %b %Y %H:%M:%S +0900")
    items = []
    for p in indexable():
        d = RSS_DATES.get(p['key'], '2026-10-11' if p['key'].startswith('region-') else '2026-09-07')
        items.append((d, p))
    items.sort(key=lambda x: x[0], reverse=True)
    rows = []
    for d, p in items:
        u = page_url(p['file'])
        rows.append(f"""    <item>
      <title>{esc(p['title'])}</title>
      <link>{u}</link>
      <guid isPermaLink="true">{u}</guid>
      <description>{esc(p['desc'])}</description>
      <pubDate>{rfc822(d)}</pubDate>
    </item>""")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>최시준 — 공실개발·공간수익화 전문가</title>
    <link>{DOMAIN}/</link>
    <atom:link href="{DOMAIN}/rss.xml" rel="self" type="application/rss+xml" />
    <description>최시준 공식 홈페이지의 새 소식 — 공간 포트폴리오, 공실개발 사례, 브랜드, 강의·미디어.</description>
    <language>ko</language>
    <lastBuildDate>{NOW.strftime("%a, %d %b %Y %H:%M:%S +0900")}</lastBuildDate>
{chr(10).join(rows)}
  </channel>
</rss>
"""
    with io.open('rss.xml', 'w', encoding='utf-8') as f:
        f.write(xml)
    print(f'built rss.xml ({len(rows)} items)')


def build():
    for page in PAGES:
        if page.get('region'):
            body = region_body(page)
        else:
            with io.open(os.path.join("fragments", page['file']), encoding="utf-8") as f:
                body = fill(f.read(), page['file'])
        out = head(page, body) + header_nav(page) + body + footer()
        out = finalize_links(out)
        with io.open(page['file'], "w", encoding="utf-8") as f:
            f.write(out)
        print(f"built {page['file']} ({len(out)} chars)")
    build_sitemap()
    build_rss()
    if VERIFY:
        print('검색엔진 소유확인 태그:', ', '.join(VERIFY))


if __name__ == "__main__":
    build()
