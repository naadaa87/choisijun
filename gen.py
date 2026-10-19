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
                if val not in out.setdefault(key, []):   # 같은 검색엔진 줄을 여러 개 써도 모두 넣는다 (http·https 따로 등록 등)
                    out[key].append(val)
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
         title="미디어 — 쇼릴·언론 보도·방송 출연 | 최시준",
         desc="15초 쇼릴 2026, KBS·JTBC·CCTV 등 언론 보도와 방송 출연, 공식 채널, 그리고 공간사업 판단기준을 담은 최시준의 최근 글.",
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
    dict(key="insights", file="insights.html", nav="인사이트", crumb="인사이트", schema="CollectionPage",
         title="인사이트 — 공실개발·파티룸 창업·무인공간 운영의 판단기준 | 최시준",
         desc="340개+ 공간을 만들며 굳어진 판단기준을 글로 정리합니다. 상가 공실 해결, 지하·고층 공실 활용, 파티룸·공간대여 창업, 무인공간 운영, 건물 단위 기획.",
         keywords=f"{BASE_KEYWORDS}, 공실 활용 방법, 상가 공실 해결, 파티룸 창업 비용, 무인 파티룸 운영, 공간사업 칼럼"),
    dict(key="faq", file="faq.html", nav=None, crumb="자주 묻는 질문", schema="FAQPage",
         title="자주 묻는 질문 — 공실개발·파티룸 창업·상담·강의 | 최시준",
         desc="건물주와 중개사가 공실개발에 대해, 예비창업자가 파티룸·공간대여 창업에 대해, 담당자가 강의와 제휴에 대해 자주 묻는 질문 30가지에 최시준이 답합니다.",
         keywords=f"{BASE_KEYWORDS}, 공실 상담, 파티룸 창업 비용, 마스터리스 뜻, 무인 파티룸 관리, 강의 섭외"),
    dict(key="glossary", file="glossary.html", nav=None, crumb="용어 사전", schema="DefinedTermSet",
         title="공간사업 용어 사전 — 공실개발·마스터리스·무인공간·SPMS | 최시준",
         desc="공실개발, 공간수익화, 비선호층, 마스터리스, 수익쉐어, 위탁운영, 목적형 공간, 무인공간, 예약제, SPMS, 가동률, 고정비 등 공간사업에서 쓰는 말을 최시준의 기준으로 풀었습니다.",
         keywords="공실개발 뜻, 공간수익화 뜻, 마스터리스 뜻, 수익쉐어, 위탁운영, 무인공간, 비선호층, 가동률, 공간대여, 최시준"),
    dict(key="network", file="network.html", nav=None, crumb="패밀리 사이트", schema="CollectionPage",
         title="패밀리 사이트 — 쏘플파티룸·플레이션·소셜팩토리·메가스팟·밍글·공백·코어무드 | 최시준",
         desc="최시준이 만들고 운영하는 공간과 서비스를 한곳에 모았습니다. 파티룸·게임파티룸·모임공간·대형 행사장·무인 디저트카페부터 공실개발·공간 브랜딩·상업용 부동산 중개까지, 필요한 곳을 바로 찾아가세요.",
         keywords="최시준 브랜드, 쏘플파티룸, 플레이션, 소셜팩토리, 메가스팟, 밍글, 공백, 코어무드, 오르비스중개법인, 여덟글자, 건대 대관, 건대 모임공간, 파티룸 예약, 공실개발, 상업공간 인테리어"),
    dict(key="login", file="login.html", nav=None, crumb="로그인 · 회원가입", schema="WebPage", noindex=True,
         title="로그인 · 회원가입 | 최시준", desc="최시준 홈페이지 회원 로그인과 회원가입. 회원이 되면 문의 진행 상황을 확인하고 커뮤니티에 글을 남길 수 있습니다.", keywords=""),
    dict(key="account", file="account.html", nav=None, crumb="마이페이지", schema="WebPage", noindex=True,
         title="마이페이지 | 최시준", desc="내 정보, 문의 진행 상황, 커뮤니티에 쓴 글을 확인합니다.", keywords=""),
    dict(key="admin", file="admin.html", nav=None, crumb="관리자", schema="WebPage", noindex=True,
         title="관리자 페이지 | 최시준", desc="최시준 홈페이지 관리자 전용 페이지입니다.", keywords=""),
    dict(key="privacy", file="privacy.html", nav=None, crumb="개인정보처리방침", schema="WebPage",
         title="개인정보처리방침 | 최시준 · ㈜블랭크", desc="최시준 홈페이지(choisijun.com)를 운영하는 ㈜블랭크의 개인정보처리방침입니다. 수집 항목, 이용 목적, 보관 기간, 처리 위탁, 이용자 권리를 안내합니다.",
         keywords="최시준 개인정보처리방침, ㈜블랭크 개인정보처리방침"),
    dict(key="terms", file="terms.html", nav=None, crumb="이용약관", schema="WebPage",
         title="이용약관 | 최시준 · ㈜블랭크", desc="최시준 홈페이지(choisijun.com) 회원 서비스 이용약관입니다. 회원가입, 커뮤니티 이용, 게시물 관리, 탈퇴에 관한 내용을 안내합니다.",
         keywords="최시준 이용약관, ㈜블랭크 이용약관"),
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

# ------------------------------------------------------------------
# 인사이트(칼럼): content/insights/*.md → /insights/<slug>
#   머리말(title: / description: / date: …) 뒤 --- 다음부터 본문(마크다운)
# ------------------------------------------------------------------
INSIGHT_DIR = "insights"            # 완성된 글 페이지가 저장되는 곳 (/insights/<slug>)
INSIGHT_SRC = os.path.join("content", "insights")   # 글 원고(.md)를 두는 곳
CATEGORY_ORDER = ["공실개발", "건물 기획", "창업", "무인 운영", "생각"]


def md_inline(t):
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
    return t


def md_to_html(md):
    """작은 마크다운 변환기: 제목(##/###), 문단, 목록(-, 1.), 인용(>), 구분선(---), 굵게, 링크.
    '## 자주 묻는 질문' 아래 ### 질문 / 답 쌍은 펼침 목록 + FAQ 구조화 데이터로 만든다."""
    lines = md.replace("\r", "").split("\n")
    out, faq, i, in_faq = [], [], 0, False
    para = []

    def flush():
        if para:
            out.append("<p>" + md_inline(" ".join(x.strip() for x in para)) + "</p>")
            para.clear()

    while i < len(lines):
        ln = lines[i]
        st = ln.strip()
        if not st:
            flush(); i += 1; continue
        if st.startswith("## "):
            flush()
            title = st[3:].strip()
            in_faq = title.replace(" ", "") in ("자주묻는질문", "FAQ")
            out.append(f'<h2 id="{esc(re.sub(r"[^0-9A-Za-z가-힣]+", "-", title).strip("-"))}">{md_inline(title)}</h2>')
            i += 1; continue
        if st.startswith("### "):
            flush()
            title = st[4:].strip()
            if in_faq:
                ans, i = [], i + 1
                while i < len(lines) and not lines[i].strip().startswith("#"):
                    if lines[i].strip():
                        ans.append(lines[i].strip())
                    i += 1
                a_html = " ".join(ans)
                faq.append((title, a_html))
                out.append(f'<details class="faq-item"><summary>{md_inline(title)}</summary><p>{md_inline(a_html)}</p></details>')
                continue
            out.append(f"<h3>{md_inline(title)}</h3>")
            i += 1; continue
        if st in ("---", "***"):
            flush(); out.append("<hr />"); i += 1; continue
        if st.startswith("> "):
            flush()
            q = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                q.append(lines[i].strip()[1:].strip()); i += 1
            out.append('<blockquote class="art-quote">' + md_inline(" ".join(q)) + "</blockquote>")
            continue
        m = re.match(r"^(-|\d+\.)\s+", st)
        if m:
            flush()
            kind = "ol" if m.group(1) != "-" else "ul"
            items = []
            while i < len(lines):
                mm = re.match(r"^(-|\d+\.)\s+(.*)", lines[i].strip())
                if not mm:
                    break
                items.append(mm.group(2)); i += 1
            out.append(f"<{kind}>" + "".join(f"<li>{md_inline(x)}</li>" for x in items) + f"</{kind}>")
            continue
        para.append(st); i += 1
    flush()
    return "\n".join(out), faq


def load_insights():
    arts = []
    if not os.path.isdir(INSIGHT_SRC):
        return arts
    for fn in sorted(os.listdir(INSIGHT_SRC)):
        if not fn.endswith(".md"):
            continue
        raw = io.open(os.path.join(INSIGHT_SRC, fn), encoding="utf-8-sig").read()
        if "\n---" not in raw:
            raise SystemExit(f"[빌드 중단] insights/{fn}: 머리말과 본문을 나누는 --- 줄이 없습니다.")
        head_txt, body_md = raw.split("\n---", 1)
        meta = {}
        for ln in head_txt.splitlines():
            if ":" in ln and not ln.startswith("#"):
                k, v = ln.split(":", 1)
                meta[k.strip().lower()] = v.strip()
        for need in ("title", "description", "date"):
            if not meta.get(need):
                raise SystemExit(f"[빌드 중단] insights/{fn}: 머리말에 {need}: 가 없습니다.")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["date"]):
            raise SystemExit(f"[빌드 중단] insights/{fn}: date 는 2026-01-31 형식이어야 합니다.")
        slug = meta.get("slug") or fn[:-3]
        if not re.fullmatch(r"[a-z0-9-]+", slug):
            raise SystemExit(f"[빌드 중단] insights/{fn}: 파일 이름(주소)은 영문 소문자·숫자·하이픈만 쓸 수 있습니다.")
        html_body, faq = md_to_html(body_md.strip())
        text = strip_tags(html_body)
        arts.append(dict(
            slug=slug, title=meta["title"], desc=meta["description"], date=meta["date"],
            updated=meta.get("updated") or meta["date"], category=meta.get("category", "생각"),
            keywords=meta.get("keywords", ""), summary=meta.get("summary") or meta["description"],
            related=[x.strip() for x in meta.get("related", "").split(",") if x.strip()],
            html=html_body, faq=faq, chars=len(text), minutes=max(1, round(len(text) / 500)),
            file=f"insights/{slug}.html"))
    arts.sort(key=lambda a: (a["date"], a["slug"]), reverse=True)
    return arts


def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


INSIGHTS = load_insights()
INSIGHT_BY_SLUG = {a["slug"]: a for a in INSIGHTS}
for _a in INSIGHTS:
    PAGES.insert(-1, dict(
        key=f"insight-{_a['slug']}", file=_a["file"], nav=None, crumb=_a["title"], schema="WebPage",
        parent=("insights", "인사이트"), article=_a,
        title=f"{_a['title']} | 최시준", desc=_a["desc"],
        keywords=(_a["keywords"] + ", " if _a["keywords"] else "") + "최시준, 공실개발, 공간수익화"))

NAV_ITEMS = sorted([p for p in PAGES if p['nav']], key=lambda p: p['key'] == 'contact')
PAGE_NAMES = {p['file'][:-5] for p in PAGES}
PAGE_BY_KEY = {p['key']: p for p in PAGES}


def clean_path(fname):
    """Cloudflare Pages는 /about.html 을 /about 으로, insights/x.html 을 /insights/x 로 옮겨준다"""
    return "/" if fname == "index.html" else "/" + fname[:-5]


def rel_prefix(fname):
    """하위 폴더 페이지에서 루트 자산을 가리키는 접두어 (빌드 마지막에 절대경로로 바뀌므로 거의 쓰이지 않음)"""
    return "../" if "/" in fname else ""


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
    "brand": [{"@type": "Brand", "name": n, "url": u} for n, u in [
        ("쏘플파티룸", "https://ssople.com"), ("플레이션", "https://playtion.kr"), ("소셜팩토리", "https://socialfactory.co.kr"),
        ("메가스팟", "https://megaspot.kr"), ("밍글", "https://hellomingle.kr"), ("공백", "https://vacancy.co.kr"),
        ("코어무드", "https://coremood.kr"), ("오르비스중개법인", "https://orbis-estate.com"), ("여덟글자", "https://yeodeol.kr")]],
}
BLANK = {
    "@type": "Organization", "@id": BLANK_ID, "name": "㈜블랭크", "alternateName": "BLANK",
    "founder": {"@id": PERSON_ID},
    "brand": [{"@type": "Brand", "name": n, **({"url": u} if u else {})} for n, u in [
        ("쏘플파티룸", "https://ssople.com"), ("공백", "https://vacancy.co.kr"), ("플레이션", "https://playtion.kr"),
        ("소셜팩토리", "https://socialfactory.co.kr"), ("메가스팟", "https://megaspot.kr"), ("밍글", "https://hellomingle.kr"), ("레스텔", "")]],
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
    if key == "network":
        webpage["mainEntity"] = {"@type": "ItemList", "name": "최시준 패밀리 사이트", "numberOfItems": len(NETWORK),
                                 "itemListElement": [{"@type": "ListItem", "position": i, "item": {
                                     "@type": "Organization", "name": n['name'], "alternateName": n['en'], "url": n['url'],
                                     "description": n['line']}} for i, n in enumerate(NETWORK, 1)]}
    if key == "socialfactory":
        graph.append({"@type": "Organization", "name": "소셜팩토리", "alternateName": "Social Factory",
                      "foundingDate": "2015-10", "founder": {"@id": PERSON_ID}, "url": "https://socialfactory.co.kr", "sameAs": [url],
                      "description": "모임·스터디·세미나·코워킹 공간 브랜드. 2015년 홍대에서 시작해 2026년 건대로 이어진다."})
        qa = faq_from(body, r'<details class="faq-item"><summary>(.*?)</summary>\s*<p>(.*?)</p>')
        if qa:
            graph.append({"@type": "FAQPage", "mainEntity": qa})
    if key.startswith("insight-"):
        a = page['article']
        art = {"@type": "Article", "@id": url + "#article", "headline": a['title'], "description": a['desc'],
               "datePublished": a['date'] + "T09:00:00+09:00", "dateModified": a['updated'] + "T09:00:00+09:00",
               "author": {"@id": PERSON_ID}, "publisher": {"@id": BLANK_ID}, "inLanguage": "ko-KR",
               "mainEntityOfPage": {"@id": url + "#webpage"}, "image": og_image(page),
               "articleSection": a['category'], "keywords": a['keywords'], "wordCount": a['chars'],
               "isPartOf": {"@id": WEBSITE_ID}, "url": url}
        graph.append(art)
        if a['faq']:
            graph.append({"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": strip_tags(q), "acceptedAnswer": {"@type": "Answer", "text": strip_tags(md_inline(ans))}}
                for q, ans in a['faq']]})
    if key == "insights":
        webpage["mainEntity"] = {"@type": "ItemList", "numberOfItems": len(INSIGHTS),
                                 "itemListElement": [{"@type": "ListItem", "position": n, "name": a['title'], "url": page_url(a['file'])}
                                                     for n, a in enumerate(INSIGHTS, 1)]}
    if key == "faq":
        qa = faq_from(body, r'<details class="faq-item"><summary>(.*?)</summary>\s*<p>(.*?)</p>')
        webpage["mainEntity"] = qa
    if key == "glossary":
        terms = re.findall(r'<dt id="([^"]+)">(.*?)</dt>\s*<dd>(.*?)</dd>', body, re.S)
        webpage["hasDefinedTerm"] = [{"@type": "DefinedTerm", "@id": url + "#" + tid, "name": strip_tags(nm),
                                      "description": strip_tags(d), "inDefinedTermSet": url + "#webpage"} for tid, nm, d in terms]
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
def og_image(page):
    """assets/og/<key>.jpg 가 있으면 페이지 전용 공유 이미지, 없으면 기본 이미지"""
    cand = os.path.join("assets", "og", page['key'] + ".jpg")
    if os.path.exists(cand):
        return f"{DOMAIN}/assets/og/{page['key']}.jpg"
    if page['key'] == "media":
        return f"{DOMAIN}/assets/video/showreel-poster.jpg"
    return f"{DOMAIN}/assets/og-image.jpg"


def article_meta(page):
    a = page.get('article')
    if not a:
        return ""
    return (f'\n  <meta property="article:published_time" content="{a["date"]}T09:00:00+09:00" />'
            f'\n  <meta property="article:modified_time" content="{a["updated"]}T09:00:00+09:00" />'
            f'\n  <meta property="article:author" content="{DOMAIN}/about" />'
            f'\n  <meta property="article:section" content="{esc(a["category"])}" />')


def head(page, body):
    url = page_url(page['file'])
    title, desc = esc(page['title']), esc(page['desc'])
    og_img = og_image(page)
    robots = "noindex, follow" if page.get('noindex') else "index, follow, max-image-preview:large, max-snippet:-1"
    verify = "".join(f'\n  <meta name="{VERIFY_META[k]}" content="{esc(v)}" />' for k, vals in VERIFY.items() for v in vals)
    canonical = "" if page.get('noindex') else f'\n  <link rel="canonical" href="{url}" />'
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <meta name="keywords" content="{esc(', '.join(dict.fromkeys(k.strip() for k in page['keywords'].split(',') if k.strip())))}" />
  <meta name="author" content="최시준 (Choi Si-jun)" />
  <meta name="robots" content="{robots}" />{verify}{canonical}
  <meta property="og:type" content="{'profile' if page['key'] == 'about' else ('article' if page['key'].startswith('insight-') else 'website')}" />
  <meta property="og:site_name" content="최시준" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{og_img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="{esc(page['title'])}" />{article_meta(page)}
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{og_img}" />
  <meta name="theme-color" content="#F8F7F4" />
  <link rel="alternate" type="application/rss+xml" title="최시준 — 새 소식" href="{DOMAIN}/rss.xml" />
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" /></noscript>
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
        if p['key'] == "contact":
            acc_on = ' is-active' if page['key'] in ("login", "account") else ""
            links.append('        <a class="nav-account' + acc_on + '" href="login.html" data-account-link aria-label="로그인 · 회원가입">'
                         '<svg class="na-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>'
                         '<span class="na-text">로그인</span></a>')
        links.append(f'        <a href="{p["file"]}"{cls}{cur}>{p["nav"]}</a>')
    return f"""  <header class="header" id="header">
    <div class="container header-inner">
      <a class="logo" href="index.html" aria-label="CHOI SIJUN 최시준 — 홈">
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
            <p class="mono">READ</p>
            <a href="insights.html">인사이트</a>
            <a href="faq.html">자주 묻는 질문</a>
            <a href="glossary.html">공간사업 용어 사전</a>
            <a href="rss.xml">RSS 구독</a>
          </div>
          <div>
            <p class="mono">PERSONAL</p>
            <a href="https://www.threads.com/@sijun.choi" target="_blank" rel="noopener">Threads @sijun.choi</a>
            <a href="https://www.instagram.com/sijun.choi" target="_blank" rel="noopener">Instagram @sijun.choi</a>
            <a href="https://open.kakao.com/me/choisijun" target="_blank" rel="noopener">카카오톡 오픈프로필</a>
            <a href="https://m.search.naver.com/search.naver?query=%EC%B5%9C%EC%8B%9C%EC%A4%80&amp;sm=mtp_hty.top&amp;where=m" target="_blank" rel="noopener">NAVER에서 '최시준' 검색</a>
          </div>
        </nav>
      </div>
      {network_family_bar()}
      <p class="footer-regions mono"><span>지역별 포트폴리오</span> {regions}</p>
      <div class="footer-bottom">
        <p class="mono">© <span id="year">{NOW.year}</span> CHOI SIJUN · ㈜블랭크. ALL RIGHTS RESERVED.</p>
        <p class="mono footer-legal"><a href="privacy.html"><strong>개인정보처리방침</strong></a><a href="terms.html">이용약관</a><a href="login.html" data-account-link><span class="na-text">로그인</span></a></p>
      </div>
    </div>
  </footer>

  <a class="float-cta" id="floatCta" href="contact.html">공실개발 상담하기</a>
  <button class="to-top" id="toTop" aria-label="맨 위로">↑</button>

  <script src="site-config.js" defer></script>
  <script src="script.js" defer></script>
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
    return '<div class="pf-tilemap" role="group" aria-label="시·도별 공간 수">' + ''.join(
        t.replace('<span class="pf-tile s0"', '<span aria-hidden="true" class="pf-tile s0"', 1)
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


# ------------------------------------------------------------------
# 인사이트 렌더링
# ------------------------------------------------------------------
def kdate(d):
    y, m, dd = d.split('-')
    return f"{y}.{m}.{dd}"


def crumbs_html(trail):
    """trail = [(label, href|None)] — 마지막 항목은 현재 페이지"""
    parts = []
    for n, (label, href) in enumerate(trail):
        if href:
            parts.append(f'<a href="{href}">{esc(label)}</a>')
        else:
            parts.append(f'<span aria-current="page">{esc(label)}</span>')
        if n < len(trail) - 1:
            parts.append('<span aria-hidden="true">/</span>')
    return '<nav class="crumbs mono" aria-label="현재 위치">' + ''.join(parts) + '</nav>'


def insight_card(a, big=False):
    return (f'<a class="in-card{" is-big" if big else ""}" href="{a["file"]}" data-cat="{esc(a["category"])}">'
            f'<span class="in-cat mono">{esc(a["category"])}</span>'
            f'<h3>{esc(a["title"])}</h3><p>{esc(a["summary"])}</p>'
            f'<span class="in-meta mono">{kdate(a["date"])} · {a["minutes"]}분</span></a>')


def insight_list():
    return '<div class="in-grid" id="inGrid">' + '\n'.join(insight_card(a) for a in INSIGHTS) + '</div>'


def insight_latest(n=3):
    return '<div class="in-grid in-grid-3">' + '\n'.join(insight_card(a) for a in INSIGHTS[:n]) + '</div>'


def insight_cats():
    c = Counter(a['category'] for a in INSIGHTS)
    cats = sorted(c, key=lambda x: CATEGORY_ORDER.index(x) if x in CATEGORY_ORDER else 99)
    return (f'<button class="f-chip is-active" type="button" data-cat="">전체 <em>{len(INSIGHTS)}</em></button>'
            + ''.join(f'<button class="f-chip" type="button" data-cat="{esc(k)}">{esc(k)} <em>{c[k]}</em></button>' for k in cats))


def related_insights(a, n=3):
    picks = [INSIGHT_BY_SLUG[r] for r in a['related'] if r in INSIGHT_BY_SLUG and r != a['slug']]
    for b in INSIGHTS:
        if len(picks) >= n:
            break
        if b['slug'] != a['slug'] and b not in picks and b['category'] == a['category']:
            picks.append(b)
    for b in INSIGHTS:
        if len(picks) >= n:
            break
        if b['slug'] != a['slug'] and b not in picks:
            picks.append(b)
    return picks[:n]


ARTICLE_CTA = {
    '공실개발': ('내 공간, 수익화 가능할까?', '층과 면적, 지금 상태만 알려주시면 어떤 공간이 맞을지 함께 살펴보겠습니다.',
             'contact.html?inquiry=vacancy', '공실개발 상담하기', 'cases.html', '유형별 사례 보기'),
    '건물 기획': ('비어 있는 층이 있다면', '건물 한 채를 층마다 다른 수요로 채우는 기획을 함께 합니다.',
              'contact.html?inquiry=vacancy', '건물 단위 개발 문의', 'portfolio.html', '공간 포트폴리오 보기'),
    '창업': ('계약 전에 한 번 더', '이 공간, 해도 될까요? 입지·면적·고정비·수요를 기준으로 진단합니다.',
           'contact.html?inquiry=diagnosis', '공간수익화 진단 문의', 'books.html', '전자책으로 먼저 읽기'),
    '무인 운영': ('운영은 설계로 풉니다', '예약·출입·정산·청소를 프로세스로 옮기는 일을 함께 합니다.',
              'contact.html?inquiry=diagnosis', '운영 진단 문의', 'services.html', '서비스 안내 보기'),
}
ARTICLE_CTA_DEFAULT = ('함께 이야기해 보시죠', '공실, 창업, 강의 — 어떤 주제든 문의를 남겨주세요.',
                       'contact.html', '문의하기', 'about.html', '최시준 소개 보기')

AUTHOR_BOX = """          <aside class="author-box" aria-label="글쓴이">
            <picture>
              <source srcset="assets/profile-240.webp" type="image/webp" />
              <img src="assets/profile-240.jpg" width="120" height="120" alt="최시준" loading="lazy" />
            </picture>
            <div>
              <p class="mono">WRITTEN BY</p>
              <h3><a href="about.html">최시준</a></h3>
              <p>10년+ 340개+ 공간을 직접 기획·오픈·운영한 공실개발·공간수익화 전문가. ㈜블랭크 대표, 쏘플파티룸 대표. 건물주의 공실 문제를 구조로 풀고, 창업자에게는 실패확률을 줄이는 판단기준을 전합니다.</p>
              <p class="author-links"><a href="about.html">소개</a><a href="portfolio.html">공간 포트폴리오</a><a href="https://www.threads.com/@sijun.choi" target="_blank" rel="noopener">Threads</a></p>
            </div>
          </aside>"""


def article_body(page):
    a = page['article']
    rel = related_insights(a)
    rel_html = '<div class="in-grid in-grid-3">' + '\n'.join(insight_card(b) for b in rel) + '</div>' if rel else ''
    cta = ARTICLE_CTA.get(a['category'], ARTICLE_CTA_DEFAULT)
    updated = f'<span>수정 {kdate(a["updated"])}</span>' if a["updated"] != a["date"] else ''
    crumbs = crumbs_html([("홈", "index.html"), ("인사이트", "insights.html"), (a["title"], None)])
    return f"""    <!-- ===================== ARTICLE ===================== -->
    <article class="article">
      <header class="page-hero art-hero">
        <div class="container container-narrow">
          {crumbs}
          <p class="eyebrow mono reveal">INSIGHT — {esc(a["category"])}</p>
          <h1 class="reveal">{esc(a["title"])}</h1>
          <p class="lede reveal">{esc(a["desc"])}</p>
          <p class="art-meta mono reveal"><span>글 <a href="about.html">최시준</a></span><span>{kdate(a["date"])}</span>{updated}<span>읽는 시간 {a["minutes"]}분</span></p>
        </div>
      </header>
      <div class="section art-section">
        <div class="container container-narrow">
          <div class="art-body">
{a["html"]}
          </div>
{AUTHOR_BOX}
{network_pick(NETWORK_BY_CATEGORY.get(a['category'], []), '이 글의 기준으로 운영하는 곳', eyebrow='IN PRACTICE')}
        </div>
      </div>
      <section class="section section-tint">
        <div class="container">
          <header class="section-head reveal">
            <p class="eyebrow mono">READ NEXT</p>
            <h2>이어서 읽기</h2>
          </header>
          {rel_html}
          <div class="hero-cta" style="margin-top:22px;"><a class="btn btn-line" href="insights.html">인사이트 전체 보기</a><a class="btn btn-line" href="faq.html">자주 묻는 질문</a></div>
        </div>
      </section>
      <section class="section section-dark">
        <div class="container" style="text-align:center;">
          <h2 class="reveal" style="font-size:clamp(1.5rem,3vw,2.1rem);font-weight:800;letter-spacing:-0.03em;margin-bottom:14px;">{esc(cta[0])}</h2>
          <p class="lede reveal" style="max-width:620px;margin:0 auto 28px;">{esc(cta[1])}</p>
          <div class="hero-cta reveal" style="justify-content:center;">
            <a class="btn btn-primary" href="{cta[2]}">{esc(cta[3])}</a>
            <a class="btn btn-ghost" href="{cta[4]}">{esc(cta[5])}</a>
          </div>
        </div>
      </section>
    </article>
"""


TOKENS['INSIGHT_LIST'] = insight_list()
TOKENS['INSIGHT_LATEST'] = insight_latest()
TOKENS['INSIGHT_COUNT'] = str(len(INSIGHTS))
TOKENS['INSIGHT_CATS'] = insight_cats()

def insight_block(eyebrow, title, lede, cats, tint=False):
    picks = [a for a in INSIGHTS if a['category'] in cats][:3]
    if len(picks) < 3:
        picks += [a for a in INSIGHTS if a not in picks][:3 - len(picks)]
    cards = '\n'.join(insight_card(a) for a in picks)
    return f"""    <!-- ===================== RELATED INSIGHTS ===================== -->
    <section class="section{' section-tint' if tint else ''}">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">{eyebrow}</p>
          <h2>{title}</h2>
          <p class="lede">{lede}</p>
        </header>
        <div class="in-grid in-grid-3">{cards}</div>
        <div class="in-latest-foot"><a class="btn btn-line" href="insights.html">인사이트 전체 보기</a><a class="btn btn-line" href="faq.html">자주 묻는 질문</a><a class="btn btn-line" href="glossary.html">용어 사전</a></div>
      </div>
    </section>
"""


TOKENS['INSIGHT_BLOCK_OWNER'] = insight_block('READ — FOR OWNERS', '건물주와 중개사가 먼저 읽는 글',
    '공실을 어떻게 진단하고, 어떤 구조로 함께할 수 있는지 미리 정리했습니다. 상담 전에 읽어 두시면 이야기가 훨씬 빨라집니다.', ('공실개발', '건물 기획'))
TOKENS['INSIGHT_BLOCK_FOUNDER'] = insight_block('READ — FOR FOUNDERS', '창업 전에 읽어 둘 글',
    '매물을 고르는 기준과 무인 운영의 구조를 짧은 글로 먼저 만나보세요.', ('창업', '무인 운영', '생각'))
TOKENS['INSIGHT_BLOCK_ALL'] = insight_block('READ', '최시준의 글',
    '10년 동안 공간을 만들며 굳어진 판단기준을 글로 정리하고 있습니다.', ('생각', '공실개발', '창업'), tint=True)


# ------------------------------------------------------------------
# 패밀리 사이트 네트워크 — 최시준이 만들고 운영하는 공간·서비스
#   각 사이트의 공식 소개(2026.10 확인)를 기준으로 적었습니다.
#   새 사이트가 생기면 이 목록에 한 줄을 추가하면 /network, 메인, 푸터, 관련 페이지에 함께 반영됩니다.
# ------------------------------------------------------------------
NETWORK_GROUPS = [
    ("space", "공간 이용", "예약하고 바로 쓰는 공간", "생일·모임·스터디·행사·게임까지, 목적에 맞는 공간을 고르세요."),
    ("biz", "공간 사업", "공간을 찾고, 만들고, 거래하는 서비스", "공실 진단부터 매물 중개, 브랜딩·인테리어, 통건물 개발까지."),
    ("life", "라이프 · 업무", "일상과 일을 돕는 서비스", "하루를 기록하는 서비스와 혼자 경영하는 사람을 위한 업무 시스템."),
]
NETWORK = [
    dict(key="ssople", group="space", name="쏘플파티룸", en="SSOPLE PARTY ROOM", url="https://ssople.com", mark="SS", color="#FF4712",
         kind="무인 파티룸", line="생일·모임·워크숍을 위한 프라이빗 파티룸. 전국 120여 개 공간을 예약제로 운영합니다.",
         facts=["전국 120여 개 공간", "365일 예약제", "무인 운영"],
         uses=["party", "group"], internal=("portfolio.html?brand=쏘플파티룸#pf-archive", "공간 기록 보기"),
         anchor="전국 파티룸 예약 쏘플파티룸"),
    dict(key="playtion", group="space", name="플레이션", en="PLAYTION", url="https://playtion.kr", mark="PL", color="#6C4CF1",
         kind="게임파티룸 · 가챠뽑기샵", line="친구끼리 통째로 빌려 노는 게임파티룸과 캡슐토이 가챠뽑기샵. PASS 멤버십으로 두 곳이 이어집니다.",
         facts=["PC·PS5·스위치·노래방", "2~30인 단독 이용", "캡슐토이 600대 규모 가챠샵"],
         uses=["game", "party"], internal=("portfolio.html?brand=플레이션#pf-archive", "공간 기록 보기"),
         anchor="게임파티룸·가챠뽑기 플레이션"),
    dict(key="socialfactory", group="space", name="소셜팩토리", en="SOCIAL FACTORY", url="https://socialfactory.co.kr", mark="SF", color="#151515",
         kind="모임공간 · 코워킹", line="건대입구 세미나실·강의실·모임룸 대관과 24시간 코워킹, 1~3인 독립사무실. 2015년 홍대에서 시작한 모임공간 브랜드입니다.",
         facts=["모임룸 5개 (15~40명)", "24시간 코워킹 50석", "독립사무실 4실"],
         uses=["study", "seminar", "office"], internal=("socialfactory.html", "소셜팩토리 이야기"),
         anchor="건대 세미나실·모임공간 소셜팩토리"),
    dict(key="megaspot", group="space", name="메가스팟", en="MEGASPOT", url="https://megaspot.kr", mark="MS", color="#0E8A6A",
         kind="대형 행사장 대관", line="건대입구 190평 대형 행사 공간. 세미나·워크숍·네트워킹 파티·공연·팝업·촬영을 한 층 단독으로 진행합니다.",
         facts=["190평 한 층 단독", "최대 200명", "200인치 빔프로젝터·음향"],
         uses=["event", "seminar"], internal=None,
         anchor="건대 대형 행사장 대관 메가스팟"),
    dict(key="mingle", group="space", name="밍글", en="MINGLE", url="https://hellomingle.kr", mark="MG", color="#E2A10B",
         kind="24시간 무인 디저트카페 · 동네 커뮤니티", line="동네에서 같이할 사람을 찾는 24시간 무인 디저트카페. 모임·스터디·언어교환 커뮤니티가 함께 있습니다.",
         facts=["24시간 · 연중무휴", "30평 카페 공간", "모임·스터디·언어교환"],
         uses=["cafe", "study"], internal=None,
         anchor="건대 24시간 무인 디저트카페 밍글"),
    dict(key="gongbaek", group="biz", name="공백 공간백서", en="GONGBAEK", url="https://vacancy.co.kr", mark="GB", color="#FF4712",
         kind="공실개발 솔루션", line="상가·건물의 공실을 진단해 수익모델을 기획하고, 공간 개발부터 오픈·운영까지 연결하는 ㈜블랭크의 공실개발 솔루션입니다.",
         facts=["사전진단 · 현장진단 리포트", "모델별 수익성 비교", "마스터리스 · 공동개발"],
         uses=["vacancy", "owner"], internal=("cases.html", "공실개발 사례"),
         anchor="상가 공실개발 솔루션 공백"),
    dict(key="coremood", group="biz", name="코어무드", en="CORE MOOD", url="https://coremood.kr", mark="CM", color="#8A5A3C",
         kind="공간 브랜딩 · 인테리어", line="컨셉과 무드에서 출발해 브랜드, 공간 설계, 인테리어 시공, 콘텐츠·마케팅까지 한 팀이 잇는 상업공간 스튜디오입니다.",
         facts=["컨셉 · 브랜드 개발", "설계 · 시공 직접 관리", "촬영 · 오픈 마케팅 연계"],
         uses=["interior", "startup"], internal=None,
         anchor="상업공간 브랜딩·인테리어 코어무드"),
    dict(key="orbis", group="biz", name="오르비스중개법인", en="ORBIS REAL ESTATE", url="https://orbis-estate.com", mark="OR", color="#1F4FA8",
         kind="상업용 부동산 중개", line="빌딩·상가·오피스의 매매와 임대차 중개, 상권분석 기반 점포개발과 매각 전략을 자문하는 중개법인입니다.",
         facts=["빌딩 · 상가 · 오피스 중개", "상권분석 · 점포개발", "건물 1차 진단"],
         uses=["property", "owner", "startup"], internal=None,
         anchor="빌딩 매매·상가 임대 오르비스중개법인"),
    dict(key="tgrz", group="biz", name="TGRZ SPACE", en="TGRZ SPACE", url="https://tgrzspace.pages.dev/", mark="TG", color="#3B3B3B",
         kind="통건물 마스터리스", line="건물 전체를 임차해 개발·운영하는 통건물 전담 브랜드. 임대인은 공실 걱정 없이 임대수익을 받습니다.",
         facts=["통건물 마스터리스", "층별 개발 · 운영"],
         uses=["owner", "vacancy"], internal=None,
         anchor="통건물 마스터리스 TGRZ SPACE"),
    dict(key="yeodeol", group="life", name="여덟글자", en="YEODEOL", url="https://yeodeol.kr", mark="여덟", color="#B5487A",
         kind="오늘의 색 · 감정 기록 · 사주", line="매일 바뀌는 오늘의 색과 감정 기록으로 사주를 함께 읽는 서비스. 점수도 흉일도 없이, 오늘 해볼 일 하나로 끝맺습니다.",
         facts=["오늘의 색 카드", "감정 날씨 기록", "궁합 · 신년운세 리포트"],
         uses=["life"], internal=None,
         anchor="오늘의 색과 감정으로 읽는 사주 여덟글자"),
    dict(key="myworks", group="life", name="마이웍스", en="MY WORKS", url="https://myworkspro.pages.dev/", mark="MW", color="#2C7A3E",
         kind="업무 운영 시스템", line="혼자 경영하는 사람의 업무 운영 시스템. 업무·프로젝트·할 일을 한곳에서 관리하고 사람과 AI로 연결합니다.",
         facts=["업무 · 프로젝트 관리", "사람 · AI 연결"],
         uses=["work"], internal=None,
         anchor="1인 경영자 업무 운영 시스템 마이웍스"),
]
NETWORK_BY_KEY = {n['key']: n for n in NETWORK}

# '이럴 때 찾으세요' — 고객의 필요 → 사이트
NETWORK_USES = [
    ("party", "생일 · 파티 · 소모임", ["ssople", "playtion"]),
    ("game", "게임하며 놀기", ["playtion", "ssople"]),
    ("study", "스터디 · 회의 · 강의", ["socialfactory", "mingle"]),
    ("seminar", "세미나 · 워크숍", ["socialfactory", "megaspot"]),
    ("event", "100명 넘는 행사 · 팝업 · 촬영", ["megaspot"]),
    ("office", "코워킹 · 1인 사무실", ["socialfactory"]),
    ("cafe", "카페 · 동네 모임 · 언어교환", ["mingle"]),
    ("vacancy", "상가 · 건물 공실 해결", ["gongbaek", "tgrz", "orbis"]),
    ("property", "빌딩 · 상가 매매 · 임대", ["orbis"]),
    ("interior", "매장 브랜딩 · 인테리어", ["coremood"]),
    ("startup", "공간 창업 준비", ["coremood", "orbis", "gongbaek"]),
    ("life", "오늘의 운세 · 감정 기록", ["yeodeol"]),
    ("work", "1인 사업 업무 관리", ["myworks"]),
]

# 글 주제별로 함께 보여줄 사이트
NETWORK_BY_CATEGORY = {
    '공실개발': ["gongbaek", "orbis", "coremood"],
    '건물 기획': ["gongbaek", "tgrz", "megaspot"],
    '창업': ["coremood", "ssople", "orbis"],
    '무인 운영': ["ssople", "mingle", "playtion"],
    '생각': ["ssople", "socialfactory", "gongbaek"],
}


def ext_attrs():
    return ' target="_blank" rel="noopener"'


def net_mark(n, size=""):
    return f'<span class="net-mark{size}" style="--net:{n["color"]}" aria-hidden="true">{esc(n["mark"])}</span>'


def net_card(n, full=True):
    """패밀리 사이트 카드 — full: /network 용(사실·이용 예시 포함), 아니면 한 줄 카드"""
    host = re.sub(r'^https?://(www\.)?', '', n['url']).rstrip('/')
    uses = [label for k, label, keys in NETWORK_USES if n['key'] in keys]
    if not full:
        return (f'<a class="net-mini" href="{n["url"]}"{ext_attrs()} title="{esc(n["anchor"])}">'
                f'{net_mark(n)}<span class="net-mini-body"><strong>{esc(n["name"])}</strong><span>{esc(n["kind"])}</span></span>'
                f'<span class="net-go" aria-hidden="true">↗</span></a>')
    facts = ''.join(f'<li>{esc(f)}</li>' for f in n['facts'])
    use_txt = ' · '.join(uses)
    internal = (f'<a class="net-link-in" href="{n["internal"][0]}">{esc(n["internal"][1])} →</a>' if n.get('internal') else '')
    return f"""<article class="net-card" data-uses="{' '.join(k for k, _, keys in NETWORK_USES if n['key'] in keys)}" id="net-{n['key']}">
          <div class="net-card-head">{net_mark(n, ' is-lg')}<div><p class="net-en mono">{esc(n['en'])}</p><h3>{esc(n['name'])}</h3><p class="net-kind">{esc(n['kind'])}</p></div></div>
          <p class="net-line">{esc(n['line'])}</p>
          <ul class="net-facts">{facts}</ul>
          {f'<p class="net-uses"><span class="mono">이럴 때</span>{esc(use_txt)}</p>' if uses else ''}
          <div class="net-actions"><a class="btn btn-sm btn-primary" href="{n['url']}"{ext_attrs()} aria-label="{esc(n['anchor'])} 사이트 열기">{esc(host)} ↗</a>{internal}</div>
        </article>"""


def network_groups_html():
    out = []
    for gk, label, title, lede in NETWORK_GROUPS:
        items = [n for n in NETWORK if n['group'] == gk]
        out.append(f"""    <section class="section{' section-tint' if gk == 'biz' else ''}" id="group-{gk}">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">{esc(label)}</p>
          <h2>{esc(title)}</h2>
          <p class="lede">{esc(lede)}</p>
        </header>
        <div class="net-grid">
        {chr(10).join(net_card(n) for n in items)}
        </div>
      </div>
    </section>""")
    return '\n\n'.join(out)


def network_finder():
    chips = ''.join(f'<button type="button" class="f-chip" data-use="{k}">{esc(label)}</button>' for k, label, _ in NETWORK_USES)
    return (f'<div class="board-filters net-finder" id="netFinder" role="group" aria-label="필요한 것 고르기">'
            f'<button type="button" class="f-chip is-active" data-use="">전체</button>{chips}</div>')


def network_home():
    """메인 · 소개 등에 넣는 묶음 — 그룹별 한 줄 카드"""
    rows = []
    for gk, label, title, _ in NETWORK_GROUPS:
        items = [n for n in NETWORK if n['group'] == gk]
        rows.append(f'<div class="net-row"><p class="net-row-label mono">{esc(label)}</p><div class="net-mini-grid">'
                    + ''.join(net_card(n, full=False) for n in items) + '</div></div>')
    return '<div class="net-rows">' + ''.join(rows) + '</div>'


def network_pick(keys, title="함께 운영하는 곳", eyebrow="FAMILY SITES", lede=""):
    picks = [NETWORK_BY_KEY[k] for k in keys if k in NETWORK_BY_KEY]
    if not picks:
        return ''
    return f"""<aside class="net-pick" aria-label="{esc(title)}">
            <p class="eyebrow mono">{esc(eyebrow)}</p>
            <h3>{esc(title)}</h3>
            {f'<p class="net-pick-lede">{esc(lede)}</p>' if lede else ''}
            <div class="net-mini-grid">{''.join(net_card(n, full=False) for n in picks)}</div>
          </aside>"""


def network_use_guide():
    """문의하기 등: '공간 예약이라면 여기로' 안내 — 용도 → 사이트 표"""
    rows = []
    for k, label, keys in NETWORK_USES:
        if k in ('life', 'work'):
            continue
        links = ' · '.join(f'<a href="{NETWORK_BY_KEY[x]["url"]}"{ext_attrs()}>{esc(NETWORK_BY_KEY[x]["name"])}</a>' for x in keys)
        rows.append(f'<li><span>{esc(label)}</span><span>{links}</span></li>')
    return '<ul class="net-guide">' + ''.join(rows) + '</ul>'


def network_family_bar():
    """모든 페이지 푸터의 패밀리 사이트 줄"""
    parts = []
    for gk, label, _, _ in NETWORK_GROUPS:
        links = ''.join(f'<a href="{n["url"]}"{ext_attrs()} title="{esc(n["anchor"])}">{esc(n["name"])}</a>'
                        for n in NETWORK if n['group'] == gk)
        parts.append(f'<p><span class="mono">{esc(label)}</span>{links}</p>')
    return ('<div class="footer-family"><p class="footer-family-title mono"><a href="network.html">FAMILY SITES — 함께 운영하는 공간 · 서비스 →</a></p>'
            + ''.join(parts) + '</div>')


TOKENS['NETWORK_GROUPS'] = network_groups_html()
TOKENS['NETWORK_FINDER'] = network_finder()
TOKENS['NETWORK_HOME'] = network_home()
TOKENS['NETWORK_COUNT'] = str(len(NETWORK))
TOKENS['NETWORK_USE_GUIDE'] = network_use_guide()
TOKENS['NETWORK_PICK_PRO'] = network_pick(["gongbaek", "coremood", "orbis", "tgrz"], "공간 사업을 함께하는 패밀리 서비스",
                                          lede="진단·설계·중개·운영을 각 분야 사이트에서 더 자세히 볼 수 있습니다.")
TOKENS['NETWORK_PICK_KONDAE'] = network_pick(["socialfactory", "megaspot", "mingle", "playtion"], "건대입구 한 건물에서 이어지는 공간",
                                             eyebrow="KONDAE CLUSTER", lede="모임은 소셜팩토리, 큰 행사는 메가스팟, 쉬어 갈 땐 밍글, 2차는 플레이션.")
TOKENS['NETWORK_PICK_SPACE'] = network_pick(["ssople", "playtion", "socialfactory", "megaspot", "mingle"], "공간을 바로 예약하고 싶다면",
                                            eyebrow="BOOK A SPACE", lede="파티·게임·모임·행사·카페 — 각 브랜드 사이트에서 바로 예약하고 문의할 수 있습니다.")


def build_llms():
    """AI 검색·LLM 크롤러용 사이트 요약 (llms.txt 관례)"""
    lines = ["# 최시준 (Choi Si-jun) — choisijun.com", "",
             "> 공실개발·공간수익화 전문가. 10년+ 340개+ 공간을 직접 기획·오픈·운영. ㈜블랭크 대표, 쏘플파티룸(전국 120여 개 무인 파티룸) 대표. "
             "건물주·중개사의 공실 문제를 구조로 풀고, 창업자에게 실패확률을 줄이는 판단기준을 전한다. 기업·대학 강의, 전자책.", "",
             "## 핵심 페이지"]
    for k in ['home', 'about', 'services', 'cases', 'portfolio', 'insights', 'faq', 'glossary', 'brands', 'network', 'socialfactory', 'books', 'contact']:
        pg = PAGE_BY_KEY.get(k)
        if pg:
            lines.append(f"- [{pg['crumb'] or '홈'}]({page_url(pg['file'])}): {pg['desc']}")
    lines += ["", "## 지역별 포트폴리오"]
    for r in REGION_PAGES:
        pg = PAGE_BY_KEY['region-' + REGION_SLUG[r]]
        lines.append(f"- [{r}]({page_url(pg['file'])}): {pg['desc']}")
    lines += ["", "## 인사이트(글)"]
    for a in INSIGHTS:
        lines.append(f"- [{a['title']}]({page_url(a['file'])}): {a['desc']}")
    lines += ["", "## 패밀리 사이트 (최시준이 만들고 운영하는 공간·서비스)"]
    for n in NETWORK:
        lines.append(f"- [{n['name']}]({n['url']}): {n['kind']} — {n['line']}")
    lines += ["", "## 연락", f"- 문의: {DOMAIN}/contact", "- Threads: https://www.threads.com/@sijun.choi", "- 쏘플파티룸: https://ssople.com", ""]
    with io.open('llms.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('built llms.txt')


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
LINK_RE = re.compile(r'(href)="(?:\.\./|\./)?((?:insights/)?[a-z0-9-]+)\.html((?:\?[^"#]*)?(?:#[^"]*)?)"')


def finalize_links(text):
    def rw(m):
        attr, name, rest = m.groups()
        if name not in PAGE_NAMES:
            return m.group(0)
        return f'{attr}="{"/" if name == "index" else "/" + name}{rest}"'
    text = LINK_RE.sub(rw, text)
    text = re.sub(r'((?:src|srcset|href|poster|data-src-lg|data-src-sm)=")\.\./assets/', r'\1assets/', text)
    # 자산 경로를 루트 기준으로 (없는 주소의 404 화면에서도 깨지지 않도록)
    text = re.sub(r'((?:src|srcset|href|poster|data-src-lg|data-src-sm)=")assets/', r'\1/assets/', text)
    text = text.replace('href="styles.css"', f'href="/styles.css?v={VERSION}"')
    text = text.replace('src="script.js"', f'src="/script.js?v={VERSION}"')
    text = text.replace('src="site-config.js"', f'src="/site-config.js?v={VERSION}"')
    text = text.replace('src="admin.js"', f'src="/admin.js?v={VERSION}"')
    return text


def indexable():
    return [p for p in PAGES if not p.get('noindex')]


# 페이지 내용이 마지막으로 바뀐 날 (검색엔진은 매번 바뀌는 날짜보다 실제 수정일을 믿는다)
#   본문을 고쳤다면 그 페이지의 날짜를 오늘로 바꿔 주세요. 인사이트 글은 글 머리말의 date/updated 를 씁니다.
CONTENT_DATES = {
    'home': '2026-10-20', 'about': '2026-10-11', 'brands': '2026-10-20', 'community': '2026-10-11', 'books': '2026-10-11',
    'cases': '2026-10-11', 'services': '2026-10-20', 'portfolio': '2026-10-20', 'references': '2026-10-11',
    'media': '2026-10-11', 'contact': '2026-10-20', 'socialfactory': '2026-10-20', 'insights': '2026-10-11',
    'faq': '2026-10-11', 'glossary': '2026-10-11', 'privacy': '2026-10-11', 'terms': '2026-10-11', 'network': '2026-10-20',
}
DATA_DATE = (PF or {}).get('meta', {}).get('source', '')
DATA_DATE = re.search(r'(\d{4}-\d{2}-\d{2})', DATA_DATE).group(1) if re.search(r'\d{4}-\d{2}-\d{2}', DATA_DATE) else '2026-10-11'


def page_date(p):
    if p.get('article'):
        return p['article']['updated']
    if p['key'].startswith('region-'):
        return max(DATA_DATE, '2026-10-11')
    return CONTENT_DATES.get(p['key'], '2026-09-07')


def build_sitemap():
    prio = {'home': '1.0', 'about': '0.9', 'portfolio': '0.9', 'cases': '0.9', 'services': '0.9', 'contact': '0.8',
            'brands': '0.8', 'socialfactory': '0.8', 'insights': '0.9', 'faq': '0.8', 'glossary': '0.7'}
    urls = []
    for p in indexable():
        pr = prio.get(p['key'], '0.8' if p['key'].startswith('insight-') else ('0.7' if p['key'].startswith('region-') else '0.6'))
        extra = ''
        if p['key'] in ('home', 'media'):
            extra = (f"\n    <video:video><video:thumbnail_loc>{DOMAIN}/assets/video/showreel-poster.jpg</video:thumbnail_loc>"
                     f"<video:title>최시준 쇼릴 2026</video:title><video:description>{esc(VIDEO['description'])}</video:description>"
                     f"<video:content_loc>{DOMAIN}/assets/video/showreel-2026-1080.mp4</video:content_loc>"
                     f"<video:duration>15</video:duration><video:publication_date>2026-10-10T09:00:00+09:00</video:publication_date>"
                     f"<video:family_friendly>yes</video:family_friendly></video:video>")
        urls.append(f"  <url><loc>{page_url(p['file'])}</loc><lastmod>{page_date(p)}</lastmod><priority>{pr}</priority>{extra}</url>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
           'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n'
           + '\n'.join(urls) + '\n</urlset>\n')
    with io.open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(xml)
    print(f'built sitemap.xml ({len(urls)} urls)')


# RSS: 네이버·다음 수집 요청용 새 소식 목록 (날짜는 내용이 바뀐 날)
def build_rss():
    def rfc822(d):
        dt = datetime.strptime(d, "%Y-%m-%d").replace(hour=9, tzinfo=KST)
        return dt.strftime("%a, %d %b %Y %H:%M:%S +0900")
    items = [(page_date(p), 0 if p.get('article') else 1, p) for p in indexable()]
    items.sort(key=lambda x: (x[0], -x[1]), reverse=True)
    rows = []
    for d, _, p in items[:40]:
        u = page_url(p['file'])
        cat = f"\n      <category>{esc(p['article']['category'])}</category>" if p.get('article') else ""
        rows.append(f"""    <item>
      <title>{esc(p['title'])}</title>
      <link>{u}</link>
      <guid isPermaLink="true">{u}</guid>
      <description>{esc(p['desc'])}</description>{cat}
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


def add_crumbs(page, body):
    """하위 페이지 머리에 보이는 경로(홈 / 페이지)를 넣는다 — 구조화 데이터의 BreadcrumbList와 같은 내용"""
    if page['key'] in ('home', '404') or 'class="crumbs' in body or not page.get('crumb'):
        return body
    trail = [("홈", "index.html")]
    if page.get('parent'):
        pk, pl = page['parent']
        trail.append((pl, PAGE_BY_KEY[pk]['file']))
    trail.append((page['crumb'], None))
    m = re.search(r'(<section class="page-hero[^"]*">\s*<div class="container[^"]*">\n)', body)
    if not m:
        return body
    return body[:m.end()] + '        ' + crumbs_html(trail) + '\n' + body[m.end():]


def build():
    os.makedirs(INSIGHT_DIR, exist_ok=True)
    for page in PAGES:
        if page.get('region'):
            body = region_body(page)
        elif page.get('article'):
            body = article_body(page)
        else:
            with io.open(os.path.join("fragments", page['file']), encoding="utf-8") as f:
                body = fill(f.read(), page['file'])
            body = add_crumbs(page, body)
        out = head(page, body) + header_nav(page) + body + footer()
        if page['key'] == 'admin':
            out = out.replace('<script src="script.js" defer></script>', '<script src="script.js" defer></script>\n  <script src="admin.js" defer></script>')
        out = finalize_links(out)
        with io.open(page['file'], "w", encoding="utf-8") as f:
            f.write(out)
        print(f"built {page['file']} ({len(out)} chars)")
    build_sitemap()
    build_rss()
    build_llms()
    if VERIFY:
        print('검색엔진 소유확인 태그:', ', '.join(VERIFY))


if __name__ == "__main__":
    build()
