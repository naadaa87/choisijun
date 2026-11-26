# -*- coding: utf-8 -*-
"""정적 페이지 생성기 (최시준 홈페이지)
- fragments/*.html 을 공통 헤더·푸터로 감싸 최종 HTML을 만든다.
- data/portfolio.json 을 읽어 포트폴리오 카드·지도·막대·숫자, 지역별 페이지를 정적 HTML로 만든다.
- 검색엔진용 메타태그·구조화 데이터(JSON-LD)·sitemap.xml·rss.xml 을 함께 만든다.
- search-verification.txt 에 적은 네이버·구글·빙 소유확인 코드를 모든 페이지에 넣는다.
출력물은 100% 정적 HTML이라 배포 환경에서는 이 스크립트 없이도 동작한다."""
import io, os, re, json, html, hashlib
from collections import Counter
from datetime import datetime, timezone, timedelta

DOMAIN = "https://choisijun.com"
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)


def _asset_version():
    """CSS/JS 캐시버스팅 값 — 파일 내용이 바뀔 때만 달라진다(매일 글을 올려도 다른 페이지는 그대로)."""
    h = hashlib.sha1()
    for fn in ("styles.css", "script.js", "admin.js"):
        if os.path.exists(fn):
            h.update(io.open(fn, "rb").read())
    return h.hexdigest()[:10]


VERSION = _asset_version()   # CSS/JS 캐시버스팅
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
         desc="10년 넘게 340개가 넘는 공간을 만든 기록. 공간개발, 브랜드 런칭, 파트너십, 기업·대학 강의, 언론 보도까지 최시준의 레퍼런스를 연도별로 모았습니다.",
         keywords=f"{BASE_KEYWORDS}, 최시준 레퍼런스, 공간개발 사례, 브랜드 런칭, 강의 이력, 언론 보도"),
    dict(key="media", file="media.html", nav="미디어", crumb="미디어", schema="CollectionPage",
         title="미디어 — 쇼릴·언론 보도·방송 출연 | 최시준",
         desc="15초 쇼릴 2026, KBS·JTBC·CCTV 등 언론 보도와 방송 출연, 공식 채널, 그리고 공간사업 판단기준을 담은 최시준의 최근 글.",
         keywords=f"{BASE_KEYWORDS}, 최시준 인터뷰, 최시준 방송, 쇼릴, 공간사업 칼럼"),
    dict(key="vacancy", file="vacancy.html", nav=None, crumb="공실 등록", schema="ContactPage",
         title="공실 등록 — 비어 있는 상가·건물, 수익공간으로 바꿀 수 있을지 검토해 드립니다 | 최시준",
         desc="지하·고층·장기 공실, 건물 한 채까지. 위치와 층, 면적, 비어 있던 기간만 남겨 주시면 어떤 용도로 수익을 낼 수 있을지 검토해 연락드립니다. 건물주·중개사·자산 담당자 누구나 3분이면 등록할 수 있습니다.",
         keywords=f"{BASE_KEYWORDS}, 공실 등록, 공실 상담, 상가 공실, 지하 공실, 고층 공실, 장기 공실, 공실 활용, 건물주 공실, 마스터리스, 위탁운영, 공실개발"),
    dict(key="mediakit", file="mediakit.html", nav=None, crumb="미디어 키트", schema="ProfilePage",
         title="미디어 키트 — 최시준 공식 프로필·사진·강연 주제 | 최시준",
         desc="기사와 행사 안내, 강연 포스터에 바로 쓸 수 있는 최시준(㈜블랭크 대표, 공간수익화·공실개발 전문가)의 공식 프로필, 사진, 강연·인터뷰 주제, 강의·출연 이력을 모았습니다.",
         keywords=f"{BASE_KEYWORDS}, 최시준 프로필, 최시준 강연, 공실개발 강연, 공간 창업 강의, 무인공간 강의, 연사 섭외, 인터뷰 요청, 미디어 키트"),
    dict(key="partnership", file="partnership.html", nav="제휴·협업", crumb="제휴·협업", schema="ContactPage",
         title="제휴·협업 제안 — 공실 공동개발·공간 입점·서비스 제휴·강의 | 최시준",
         desc="공실 건물 공동개발, 공간 입점·대관 제휴, 서비스·기술 제휴, 강의·행사, 미디어 협업, 투자·공동사업까지. 최시준과 함께 공간과 사업을 키울 파트너의 제안을 받습니다.",
         keywords=f"{BASE_KEYWORDS}, 제휴 문의, 협업 제안, 공실 공동개발, 건물주 협업, 공간 입점, 대관 제휴, 무인공간 제휴, 강의 섭외, 공동사업"),
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
         keywords="공실개발 뜻, 공간수익화 뜻, 마스터리스 뜻, 용도변경, 원상복구 범위, 상가 공실률, 전대 동의, 공헌이익, 수익쉐어, 위탁운영, 무인공간, 비선호층, 가동률, 최시준"),
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
CATEGORY_ORDER = ["공실개발", "건물 기획", "창업", "무인 운영", "시장 · 산업", "사업 이야기", "강연 · 교육", "생각"]
# 요일별 연재 (매일 아침 한 편) — 인사이트 페이지 안내와 content/plan/GUIDE.md 의 순서가 같다
SERIES_DAYS = [
    ("월", "공실 · 건물 실무", "공실개발 · 건물 기획"),
    ("화", "지나온 일", "사업 이야기"),
    ("수", "시장과 산업", "시장 · 산업"),
    ("목", "창업 · 운영 실무", "창업 · 무인 운영"),
    ("금", "강연과 교육", "강연 · 교육"),
    ("토", "지금 하는 일", "사업 이야기"),
    ("일", "생각과 비전", "생각"),
]


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
                out.append(f'<details class="faq-item" id="faq-{len(faq)}"><summary>{md_inline(title)}</summary><p>{md_inline(a_html)}</p></details>')
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

# ------------------------------------------------------------------
# 주제 가이드 — 인사이트 글을 검색어 기준으로 묶은 허브 페이지 (/insights/topic-<slug>)
#   cat: 글 머리말 category 와 같아야 함 · pin: 맨 앞에 둘 글 · extra: 다른 주제지만 함께 읽을 글
#   intro 는 사이트에 이미 있는 사실만으로 씁니다
# ------------------------------------------------------------------
TOPICS = [
    dict(cat="공실개발", slug="vacancy", name="공실개발 가이드",
         title="공실개발 가이드 — 상가 공실 활용, 지하·고층·장기 공실 해결 | 최시준",
         h1='공실개발 가이드 — 비어 있는 상가를 <span class="accent">수익공간</span>으로',
         desc="상가 공실을 임대료 인하가 아니라 용도와 운영 구조로 푸는 방법. 지하·고층·장기 공실, 용도변경, 상담 준비까지 340개가 넘는 공간을 만든 경험으로 정리한 글 모음입니다.",
         keywords="공실개발, 상가 공실 활용, 공실 해결 방법, 장기 공실, 지하 상가 활용, 고층 상가 공실, 비선호층, 건물주 공실 대책, 용도변경",
         intro=["공실개발은 비어 있는 공간에 맞는 수요를 찾아 용도와 운영 구조를 다시 짜는 일입니다. 임대료를 내리고 아무 임차인이나 기다리는 것과는 출발점이 다릅니다. 이 공간을 일부러 찾아올 사람이 누구인지, 그 사람을 위해 무엇을 채울지부터 봅니다.",
                "제가 기획하고 운영한 공간 가운데 층이 기록된 97곳 중 81곳이 지하이거나 3층 이상이었습니다. 1층이 아니어도, 오래 비어 있어도 목적형 수요가 맞으면 수익공간이 됩니다. 반대로 진단 단계에서 멈추는 것이 맞는 자리도 있습니다.",
                "아래 글은 공실을 보는 순서대로 묶었습니다. 공실개발이 무엇인지부터 장기 공실에서 먼저 볼 것, 지하·고층 활용, 용도를 바꾸기 전 확인할 것, 상담 전에 준비할 것까지 이어서 읽을 수 있습니다."],
         pin=["vacancy-development-guide", "long-term-vacancy-five-checks", "basement-upper-floor-vacancy", "before-change-of-use", "landlord-four-structures"],
         extra=["vacancy-is-inventory", "master-lease-basics", "reading-commercial-vacancy-rate"],
         terms=["vacancy-development", "long-term-vacancy", "non-preferred-floor", "purpose-space", "change-of-use", "building-register", "value-up"],
         links=[("vacancy.html", "공실 등록하기"), ("cases.html", "유형별 공실개발 사례"), ("services.html", "공실개발 컨설팅 안내"), ("portfolio.html", "공간 포트폴리오")]),
    dict(cat="건물 기획", slug="building", name="건물 기획 가이드",
         title="건물 기획 가이드 — 통건물 공실, 마스터리스, 1층 기획 | 최시준",
         h1='건물 기획 가이드 — 건물 한 채를 <span class="accent">층마다 다른 수요</span>로',
         desc="통건물 공실을 층별 포트폴리오로 채우는 법, 마스터리스(통임차) 구조, 1층이 건물 전체에 미치는 영향까지. 건물주가 알아 두면 좋은 건물 기획의 기준을 정리했습니다.",
         keywords="건물 기획, 통건물 공실, 마스터리스, 통임차, 통임대 건물, 건물 밸류업, 1층 상가 업종, 층별 공간 기획",
         intro=["건물 기획은 층 하나가 아니라 건물 전체를 한 번에 보는 일입니다. 1층에 무엇이 들어오느냐에 따라 위층 손님이 지나가는 길이 달라지고, 층마다 다른 수요를 두면 한 업종의 경기에 건물 전체가 흔들리지 않습니다.",
                "건물주와 일할 때는 컨설팅, 위탁운영, 마스터리스, 수익쉐어 네 가지 구조 가운데 건물 상황에 맞는 방식을 고릅니다. 건물을 통째로 임차해 개발하고 운영하는 마스터리스는 TGRZ SPACE에서 하고 있습니다.",
                "아래 글에서 통건물 공실을 포트폴리오로 보는 법, 마스터리스 계약에서 확인할 것, 1층 기획의 기준을 차례로 정리했습니다."],
         pin=["whole-building-portfolio", "master-lease-basics", "first-floor-sets-the-building"],
         extra=["landlord-four-structures", "kondae-day-in-one-building", "ref-vacancy-projects-38"],
         terms=["whole-building", "master-lease", "whole-lease", "consignment", "revenue-share", "sublease-consent", "restoration"],
         links=[("vacancy.html", "건물 공실 등록하기"), ("portfolio.html", "공간 포트폴리오"), ("partnership.html", "건물 단위 협업 제안"), ("cases.html", "통임대 건물 사례")]),
    dict(cat="창업", slug="startup", name="파티룸 · 공간대여 창업 가이드",
         title="파티룸 · 공간대여 창업 가이드 — 계약 전 점검부터 첫 달까지 | 최시준",
         h1='파티룸 · 공간대여 <span class="accent">창업 가이드</span>',
         desc="파티룸·공간대여 창업은 인테리어보다 매물, 고정비, 수요, 운영 방식이 먼저입니다. 계약 전 점검표, 무인으로 하기 쉬운 업종, 오픈 첫 달에 챙길 일까지 정리했습니다.",
         keywords="파티룸 창업, 공간대여 창업, 파티룸 창업 비용, 무인 파티룸 창업, 무인 창업 업종, 공간 창업 준비, 파티룸 수익, 파티룸 매물",
         intro=["공간대여 창업에서 가장 많이 받는 질문은 비용입니다. 그런데 계약서에 도장을 찍기 전에 먼저 봐야 할 것은 그 자리에 수요가 있는지, 고정비를 버틸 수 있는 구조인지입니다. 인테리어는 그 다음입니다.",
                "2015년 모임공간 하나로 시작해 쏘플파티룸을 전국 120여 개 공간으로 키우면서, 잘되는 공간과 문을 닫는 공간의 차이는 대부분 계약 전에 정해진다는 것을 배웠습니다.",
                "아래 글은 창업 순서대로 읽을 수 있게 묶었습니다. 계약 전 점검표, 무인으로 운영하기 쉬운 업종과 어려운 업종, 오픈 첫 달에 할 일, 창업자가 알아야 할 숫자까지 이어집니다."],
         pin=["party-room-startup-criteria", "unmanned-business-types", "first-month-checklist"],
         extra=["rental-business-is-structure", "fixed-cost-first", "numbers-for-founders", "basement-upper-floor-vacancy"],
         terms=["space-rental", "party-room", "game-party-room", "room-type-party", "fixed-cost", "break-even", "contribution-margin"],
         links=[("contact.html?inquiry=diagnosis", "창업 전 공간 진단 문의"), ("books.html", "전자책 《예약되는 공간》"), ("services.html", "창업 교육 안내"), ("portfolio.html", "공간 포트폴리오")]),
    dict(cat="무인 운영", slug="unmanned", name="무인공간 운영 가이드",
         title="무인공간 운영 가이드 — 예약 · 출입 · 정산 · 청소 시스템 | 최시준",
         h1='무인공간 <span class="accent">운영 가이드</span>',
         desc="무인 파티룸과 무인 매장은 사람이 없는 사업이 아니라 프로세스가 있는 사업입니다. 예약·출입·정산·관리 네 가지 프로세스, 청소 기준, 리뷰 관리, 다점포 운영 시스템을 정리했습니다.",
         keywords="무인 운영, 무인공간 운영, 무인 파티룸 운영, 무인 매장 관리, 파티룸 청소, 공간대여 리뷰, 예약 관리 시스템, SPMS",
         intro=["무인공간은 사람이 없는 사업이 아니라 프로세스가 있는 사업입니다. 손님이 예약하고, 문을 열고, 결제하고, 다음 손님이 오기 전에 공간이 다시 준비되는 과정이 사람 대신 정해진 순서로 돌아가야 합니다.",
                "공간이 20~30개일 때까지는 사람으로 늘릴 수 있지만, 그 이상은 관리 시스템이 있어야 합니다. 코로나 2년 반을 버티며 만든 예약·운영 관리 시스템 SPMS도 그 고민에서 나왔습니다.",
                "아래 글에서 무인 운영의 네 가지 프로세스, 청소 품질을 지키는 기준, 리뷰가 다음 예약을 만드는 구조, 카페를 무인·예약제로 바꿀 때 볼 것을 정리했습니다."],
         pin=["unmanned-operations-four-processes", "cleaning-quality-unmanned", "reviews-make-bookings", "beyond-thirty-spaces"],
         extra=["unmanned-is-process", "unmanned-business-types", "built-while-holding-on"],
         terms=["unmanned-space", "reservation-based", "spms", "turnover-cleaning", "occupancy-rate", "cs"],
         links=[("contact.html?inquiry=diagnosis", "운영 진단 문의"), ("services.html", "서비스 안내"), ("network.html", "직접 운영하는 공간 브랜드")]),
    dict(cat="시장 · 산업", slug="market", name="공간 시장 읽기",
         title="공간대여 · 상가 시장 분석 — 공실률, 파티룸 시장, 무인 매장 흐름 | 최시준",
         h1='공간대여 · 상가 <span class="accent">시장 읽기</span>',
         desc="상가 공실률과 투자수익률, 파티룸 시장의 변화, 무인 매장이 늘어나는 이유, 시간 단위로 쓰는 공간의 흐름. 공공 통계와 현장 경험으로 공간 시장을 읽습니다.",
         keywords="상가 공실률, 상가 시장 전망, 공간대여 시장, 파티룸 시장, 파티룸 트렌드, 무인 매장 트렌드, 상업용부동산 임대동향",
         intro=["시장 글은 공공 통계를 먼저 보고, 그 숫자를 현장에서 본 것과 맞춰 봅니다. 한국부동산원 상업용부동산 임대동향이나 통계청 조사 같은 원자료를 인용하고, 그 숫자가 내 건물이나 내 매장에 어떤 뜻인지까지 이어서 씁니다.",
                "2017년부터 파티룸 시장을 지켜보면서 손님이 공간을 찾는 이유가 생일 파티에서 목적 있는 모임으로 넓어지는 것을 봤습니다. 부동산을 사고파는 것을 넘어, 안에 무엇을 채워 수익을 내느냐가 중요해진 것도 같은 흐름입니다."],
         pin=["reading-commercial-vacancy-rate", "beyond-buy-and-sell", "party-room-market-since-2017"],
         extra=["vacancy-hidden-costs", "long-term-vacancy-five-checks"],
         terms=["vacancy-rate", "income-return", "space-rental", "purpose-space"],
         links=[("contact.html?inquiry=diagnosis", "내 건물 조건으로 진단 문의"), ("cases.html", "유형별 사례")]),
    dict(cat="사업 이야기", slug="story", name="사업 이야기",
         title="최시준의 사업 이야기 — 모임공간 하나에서 340개 공간까지 | 최시준",
         h1='모임공간 하나에서 <span class="accent">340개 공간</span>까지',
         desc="대기업 자산관리팀에서 소셜팩토리, 쏘플파티룸, 공실개발까지. 최시준이 직접 겪은 사업과 프로젝트, 실패와 확장의 기록을 모았습니다.",
         keywords="최시준, 최시준 이력, 최시준 대표, 쏘플파티룸 대표, 소셜팩토리, 공간사업 10년, 공간 창업 이야기",
         intro=["현대엔지니어링·현대엠코 자산관리팀에서 기업 부동산과 시설을 관리하던 시절부터, 2015년 소셜팩토리를 열고 2018년 쏘플파티룸을 시작해 340개가 넘는 공간을 만들기까지의 기록입니다.",
                "잘된 일만 적지 않았습니다. 코로나 2년 반을 버티며 만든 시스템, 회계사 시험을 그만둔 날, 회사에 다니며 만든 강연 단체처럼 지금의 판단 기준이 만들어진 장면을 남겼습니다."],
         pin=["ten-years-340-spaces", "asset-management-years", "built-while-holding-on"],
         extra=["long-loved-brand"],
         terms=["space-rental", "party-room", "spms"],
         links=[("about.html", "걸어온 길 한눈에"), ("portfolio.html", "공간 포트폴리오"), ("mediakit.html", "미디어 키트")]),
    dict(cat="강연 · 교육", slug="lecture", name="강연 · 교육",
         title="최시준 강연 · 교육 — 공간 사업 강의, 대학 특강, 창업 교육 | 최시준",
         h1='강연과 <span class="accent">교육</span>',
         desc="공실개발·공간대여 창업·무인 운영을 주제로 한 기업·대학 강의 구성과, 2014년부터 이어 온 대학 순회강연·실행력 강의의 기록. 강연 섭외 전에 읽어 보세요.",
         keywords="최시준 강연, 공간 사업 강의, 공실개발 강의, 공간대여 창업 교육, 대학 창업 특강, 기업 특강, 실행력 강의",
         intro=["기업과 30여 개 대학, 여러 기관에서 공간 사업과 창업, 실행에 대해 강의했습니다. 강의는 듣는 사람에 맞춰 순서를 정합니다. 건물주에게는 공실을 보는 기준을, 예비창업자에게는 계약 전에 볼 숫자를, 대학생에게는 작게 시작해 실행하는 방법을 이야기합니다.",
                "아래에는 지금 하는 공간 사업 강의의 구성과, 2014년 대학 순회강연부터 이어진 기록을 모았습니다. 강연·인터뷰 주제와 공식 프로필은 미디어 키트에 정리해 두었습니다."],
         pin=["space-business-curriculum", "numbers-for-founders"],
         extra=[],
         terms=["fixed-cost", "break-even", "contribution-margin"],
         links=[("mediakit.html", "미디어 키트 · 강연 주제"), ("partnership.html?kind=강의 · 교육 · 행사 협업#ptForm", "강연 섭외하기"), ("media.html", "언론 보도")]),
    dict(cat="생각", slug="thinking", name="공간 사업의 원칙",
         title="공간 사업의 원칙 — 최시준의 생각과 판단 기준 | 최시준",
         h1='공간 사업의 <span class="accent">원칙과 생각</span>',
         desc="수익모델보다 비용구조, 지나간 일보다 지금 할 일, 오래 사랑받는 브랜드. 10년 동안 공간을 만들고 운영하며 정리한 판단 기준과 생각을 모았습니다.",
         keywords="공간 사업 원칙, 공간 철학, 비용구조, 고정비, 매몰비용, 공간 브랜딩, 최시준 생각",
         intro=["공간을 만들 때마다 같은 질문으로 돌아갑니다. 이 공간은 누구의 어떤 시간을 위해 있는가, 그 시간을 오래 지킬 수 있는 구조인가. 그래서 수익모델보다 비용구조를 먼저 보고, 이미 쓴 돈보다 지금 할 일을 봅니다.",
                "아래 글은 그 기준을 하나씩 풀어 쓴 것입니다. 공실을 자산으로 보는 관점, 무인공간을 프로세스로 보는 관점, 머리보다 발이 빨라야 한다는 원칙까지 이어집니다."],
         pin=["vacancy-is-inventory", "unmanned-is-process", "rental-business-is-structure", "fixed-cost-first"],
         extra=[],
         terms=["fixed-cost", "sunk-cost", "purpose-space"],
         links=[("about.html", "소개"), ("books.html", "전자책")]),
]
TOPIC_BY_CAT = {t['cat']: t for t in TOPICS}


def topic_file(t):
    return f"insights/topic-{t['slug']}.html"


def topic_articles(t):
    arts = [a for a in INSIGHTS if a['category'] == t['cat']]
    pinned = [INSIGHT_BY_SLUG[s] for s in t['pin'] if s in INSIGHT_BY_SLUG and INSIGHT_BY_SLUG[s]['category'] == t['cat']]
    return pinned + [a for a in arts if a not in pinned]


for _t in TOPICS:
    if not any(a['category'] == _t['cat'] for a in INSIGHTS):
        continue
    PAGES.insert(-1, dict(
        key=f"topic-{_t['slug']}", file=topic_file(_t), nav=None, crumb=_t['name'], schema="CollectionPage",
        parent=("insights", "인사이트"), topic=_t, title=_t['title'], desc=_t['desc'], keywords=_t['keywords']))

NAV_ITEMS = sorted([p for p in PAGES if p['nav']], key=lambda p: {'partnership': 1, 'contact': 2}.get(p['key'], 0))
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
    "knowsAbout": ["공실개발", "공간수익화", "상가 공실 활용", "건물 기획", "통건물 공실", "마스터리스", "위탁운영", "용도변경",
                   "무인공간 운영", "무인 매장 운영", "파티룸 창업", "공간대여 창업", "공간대여 시장", "공간브랜딩", "상권 분석", "창업 교육"],
    "hasOccupation": {"@type": "Occupation", "name": "공간수익화 · 공실개발 컨설턴트",
                      "occupationLocation": {"@type": "Country", "name": "대한민국"},
                      "skills": "공실 진단, 공간 기획, 무인 운영 설계, 건물 기획, 창업 교육"},
    "sameAs": ["https://www.threads.com/@sijun.choi", "https://www.instagram.com/sijun.choi"],
    "brand": [{"@type": "Brand", "name": n, "url": u} for n, u in [
        ("쏘플파티룸", "https://ssople.com"), ("플레이션", "https://playtion.kr"), ("소셜팩토리", "https://socialfactory.co.kr"),
        ("메가스팟", "https://megaspot.kr"), ("밍글", "https://hellomingle.kr"), ("공백", "https://vacancy.co.kr"),
        ("코어무드", "https://coremood.kr"), ("오르비스중개법인", "https://orbis-estate.com"), ("여덟글자", "https://yeodeol.kr")]],
}
BLANK = {
    "@type": "Organization", "@id": BLANK_ID, "name": "㈜블랭크", "alternateName": "BLANK",
    "founder": {"@id": PERSON_ID},
    "description": "비어 있는 공간을 수익공간으로 바꾸는 회사. 공실개발, 공간 운영, 상업용 부동산 중개, 공간 브랜딩·인테리어를 함께 한다.",
    "brand": [{"@type": "Brand", "name": n, **({"url": u} if u else {})} for n, u in [
        ("쏘플파티룸", "https://ssople.com"), ("공백", "https://vacancy.co.kr"), ("플레이션", "https://playtion.kr"),
        ("소셜팩토리", "https://socialfactory.co.kr"), ("메가스팟", "https://megaspot.kr"), ("밍글", "https://hellomingle.kr"),
        ("오르비스중개법인", "https://orbis-estate.com"), ("코어무드", "https://coremood.kr"), ("레스텔", "https://restel.kr")]],
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
    if page.get('article') and page['article']['category'] in TOPIC_BY_CAT:
        _t = TOPIC_BY_CAT[page['article']['category']]
        trail.append((_t['name'], topic_file(_t)))
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
    if key in ("about", "mediakit"):
        webpage["mainEntity"] = {"@id": PERSON_ID}
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
               "abstract": a['summary'], "timeRequired": f"PT{a['minutes']}M",
               "about": [{"@type": "Thing", "name": k.strip()} for k in a['keywords'].split(',')[:4] if k.strip()],
               "isPartOf": [{"@id": WEBSITE_ID}] + ([{"@id": page_url(topic_file(TOPIC_BY_CAT[a['category']])) + "#webpage"}] if a['category'] in TOPIC_BY_CAT else []),
               "url": url}
        graph.append(art)
        if a['faq']:
            graph.append({"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": strip_tags(q), "acceptedAnswer": {"@type": "Answer", "text": strip_tags(md_inline(ans))}}
                for q, ans in a['faq']]})
    if key.startswith("topic-"):
        t = page['topic']
        arts = topic_articles(t)
        webpage["about"] = {"@type": "Thing", "name": t['cat'], "description": t['desc']}
        webpage["author"] = {"@id": PERSON_ID}
        webpage["mainEntity"] = {"@type": "ItemList", "name": t['name'], "numberOfItems": len(arts),
                                 "itemListElement": [{"@type": "ListItem", "position": n, "name": a['title'], "url": page_url(a['file'])}
                                                     for n, a in enumerate(arts, 1)]}
    if key == "about":
        qa = faq_from(body, r'<details class="faq-item"><summary>(?:Q\. )?(.*?)</summary><p>(.*?)</p>')
        if qa:
            graph.append({"@type": "FAQPage", "@id": url + "#faq", "mainEntity": qa})
    if key.startswith("region-"):
        qa = faq_from(body, r'<details class="faq-item"><summary>(.*?)</summary>\s*<p>(.*?)</p>')
        if qa:
            graph.append({"@type": "FAQPage", "@id": url + "#faq", "mainEntity": qa})
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
        if p['key'] == "partnership":
            cls = ' class="nav-partner is-active"' if on else ' class="nav-partner"'
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
            <a href="mediakit.html">미디어 키트</a>
          </div>
          <div>
            <p class="mono">WORK WITH ME</p>
            <a href="cases.html">공실개발 사례</a>
            <a href="services.html">서비스 안내</a>
            <a href="books.html">전자책 스토어</a>
            <a href="contact.html">자가진단 & 문의</a>
            <a href="vacancy.html">공실 등록</a>
            <a href="partnership.html">제휴 · 협업 제안</a>
            <a href="community.html">커뮤니티</a>
          </div>
          <div>
            <p class="mono">READ</p>
            <a href="insights.html">인사이트</a>
            <a href="insights.html#topics">주제별 가이드</a>
            <a href="faq.html">자주 묻는 질문</a>
            <a href="glossary.html">공간사업 용어 사전</a>
            <a href="/rss.xml">RSS 구독</a>
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

  <a class="float-cta" id="floatCta" href="vacancy.html">공실개발 상담하기</a>
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
             'vacancy.html', '공실 등록하기', 'cases.html', '유형별 사례 보기'),
    '건물 기획': ('비어 있는 층이 있다면', '건물 한 채를 층마다 다른 수요로 채우는 기획을 함께 합니다.',
              'vacancy.html', '건물 공실 등록하기', 'portfolio.html', '공간 포트폴리오 보기'),
    '창업': ('계약 전에 한 번 더', '이 공간, 해도 될까요? 입지·면적·고정비·수요를 기준으로 진단합니다.',
           'contact.html?inquiry=diagnosis', '공간수익화 진단 문의', 'books.html', '전자책으로 먼저 읽기'),
    '무인 운영': ('운영은 설계로 풉니다', '예약·출입·정산·청소를 프로세스로 옮기는 일을 함께 합니다.',
              'contact.html?inquiry=diagnosis', '운영 진단 문의', 'services.html', '서비스 안내 보기'),
    '시장 · 산업': ('시장 흐름을 내 공간에 대입해 보면', '상권과 수요의 변화를 내 건물, 내 매장 조건에 맞춰 다시 읽어 드립니다.',
                'contact.html?inquiry=diagnosis', '공간수익화 진단 문의', 'cases.html', '유형별 사례 보기'),
    '사업 이야기': ('해 본 일만 말씀드립니다', '10년 동안 직접 만들고 운영하며 남은 기준으로 공간과 사업을 함께 봅니다.',
                'contact.html', '문의하기', 'about.html', '걸어온 길 보기'),
    '강연 · 교육': ('강의 · 특강을 찾고 계신다면', '공실개발, 공간 창업, 무인 운영, 실행 — 대상과 시간에 맞춰 강의를 구성합니다.',
                'partnership.html?kind=강의 · 교육 · 행사 협업#ptForm', '강의 섭외하기', 'mediakit.html', '미디어 키트 보기'),
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


def article_toc(a):
    """본문 소제목(h2)으로 '이 글의 순서'를 만든다 — 검색 결과의 바로가기 링크와 AI 답변이 단락을 찾기 쉽게"""
    heads = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', a['html'])
    heads = [(i, t) for i, t in heads if strip_tags(t).replace(' ', '') not in ('자주묻는질문', 'FAQ')]
    return heads


def article_keybox(a):
    heads = article_toc(a)
    toc = ''
    if len(heads) >= 3:
        toc = ('<p class="art-key-label mono">이 글의 순서</p><ol class="art-toc">'
               + ''.join(f'<li><a href="#{i}">{t}</a></li>' for i, t in heads) + '</ol>')
    qs = ''
    if a['faq']:
        qs = ('<p class="art-key-label mono">이 글이 답하는 질문</p><ul class="art-qs">'
              + ''.join(f'<li><a href="#faq-{n}">{md_inline(q)}</a></li>' for n, (q, _) in enumerate(a['faq'], 1)) + '</ul>')
    return f"""          <aside class="art-key reveal" aria-label="글 요약">
            <p class="art-key-label mono">핵심 요약</p>
            <p class="art-key-text">{esc(a['summary'])}</p>
            {toc}{qs}
          </aside>
"""


def article_body(page):
    a = page['article']
    rel = related_insights(a)
    rel_html = '<div class="in-grid in-grid-3">' + '\n'.join(insight_card(b) for b in rel) + '</div>' if rel else ''
    cta = ARTICLE_CTA.get(a['category'], ARTICLE_CTA_DEFAULT)
    updated = f'<span>수정 {kdate(a["updated"])}</span>' if a["updated"] != a["date"] else ''
    t = TOPIC_BY_CAT.get(a['category'])
    trail = [("홈", "index.html"), ("인사이트", "insights.html")]
    if t:
        trail.append((t['name'], topic_file(t)))
    crumbs = crumbs_html(trail + [(a["title"], None)])
    topic_link = (f'<p class="art-topic reveal"><a href="{topic_file(t)}">{esc(t["name"])}에서 같은 주제 글 {sum(1 for x in INSIGHTS if x["category"] == t["cat"])}편 모아 보기 →</a></p>'
                  if t else '')
    return f"""    <!-- ===================== ARTICLE ===================== -->
    <article class="article">
      <header class="page-hero art-hero">
        <div class="container container-narrow">
          {crumbs}
          <p class="eyebrow mono reveal">INSIGHT — {f'<a href="{topic_file(t)}">{esc(a["category"])}</a>' if t else esc(a["category"])}</p>
          <h1 class="reveal">{esc(a["title"])}</h1>
          <p class="lede reveal">{esc(a["desc"])}</p>
          <p class="art-meta mono reveal"><span>글 <a href="about.html">최시준</a></span><span>{kdate(a["date"])}</span>{updated}<span>읽는 시간 {a["minutes"]}분</span></p>
        </div>
      </header>
      <div class="section art-section">
        <div class="container container-narrow">
{article_keybox(a)}
          <div class="art-body">
{a["html"]}
          </div>
{topic_link}
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


def topic_body(page):
    t = page['topic']
    arts = topic_articles(t)
    extra = [INSIGHT_BY_SLUG[x] for x in t['extra'] if x in INSIGHT_BY_SLUG and INSIGHT_BY_SLUG[x] not in arts]
    crumbs = crumbs_html([("홈", "index.html"), ("인사이트", "insights.html"), (t['name'], None)])
    intro = ''.join(f'<p>{esc(p)}</p>' for p in t['intro'])
    qs = [(a, n, q, ans) for a in arts for n, (q, ans) in enumerate(a['faq'], 1)][:10]
    qs_html = ''
    if qs:
        qs_html = f"""
    <section class="section section-tint" id="questions">
      <div class="container container-narrow">
        <header class="section-head reveal">
          <p class="eyebrow mono">QUESTIONS</p>
          <h2>이 주제에서 <span class="accent">자주 묻는 질문</span></h2>
          <p class="lede">질문을 누르면 답이 있는 글로 이동합니다.</p>
        </header>
        <ul class="tp-qs reveal">{''.join(f'<li><a href="{a["file"]}#faq-{n}"><strong>{md_inline(q)}</strong><span>{esc(strip_tags(md_inline(ans))[:90])}{"…" if len(strip_tags(md_inline(ans))) > 90 else ""}</span><em>{esc(a["title"])}</em></a></li>' for a, n, q, ans in qs)}</ul>
      </div>
    </section>"""
    gl = GLOSSARY_TERMS
    terms = [(k, gl[k]) for k in t['terms'] if k in gl]
    terms_html = ''
    if terms:
        terms_html = ('<div class="tp-terms reveal"><p class="mono">이 주제의 용어</p><div>'
                      + ''.join(f'<a href="glossary.html#{k}" title="{esc(d)}">{esc(nm)}</a>' for k, (nm, d) in terms) + '</div></div>')
    links_html = ''.join(f'<a class="btn btn-line" href="{h}">{esc(l)}</a>' for h, l in t['links'])
    others = ''.join(f'<a href="{topic_file(o)}">{esc(o["name"])} <em>{sum(1 for x in INSIGHTS if x["category"] == o["cat"])}</em></a>'
                     for o in TOPICS if o is not t and any(x['category'] == o['cat'] for x in INSIGHTS))
    extra_html = ''
    if extra:
        extra_html = f"""
        <header class="section-head reveal" style="margin-top:56px;">
          <p class="eyebrow mono">ALSO READ</p>
          <h2>함께 읽으면 좋은 글</h2>
        </header>
        <div class="in-grid in-grid-3">{''.join(insight_card(b) for b in extra[:3])}</div>"""
    cta = ARTICLE_CTA.get(t['cat'], ARTICLE_CTA_DEFAULT)
    return f"""    <section class="page-hero tp-hero">
      <div class="container container-narrow">
        {crumbs}
        <p class="eyebrow mono reveal">GUIDE — {esc(t['cat'])} · 글 {len(arts)}편</p>
        <h1 class="reveal">{t['h1']}</h1>
        <div class="tp-intro reveal">{intro}</div>
        {terms_html}
      </div>
    </section>

    <section class="section" id="articles">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">ARTICLES</p>
          <h2>{esc(t['name'])} <span class="accent">글 {len(arts)}편</span></h2>
          <p class="lede">처음 읽는다면 앞의 글부터 순서대로 읽기를 권합니다.</p>
        </header>
        <ol class="tp-list">{''.join(f'<li class="reveal"><a href="{a["file"]}"><span class="tp-no mono">{i:02d}</span><span class="tp-body"><strong>{esc(a["title"])}</strong><span>{esc(a["summary"])}</span></span><span class="tp-date mono">{esc(a["date"].replace("-", "."))}</span></a></li>' for i, a in enumerate(arts, 1))}</ol>{extra_html}
      </div>
    </section>
{qs_html}
    <section class="section" id="next">
      <div class="container">
        <div class="tp-links reveal"><p class="mono">관련 페이지</p><div class="hero-cta">{links_html}</div></div>
        <div class="tp-others reveal"><p class="mono">다른 주제 가이드</p><div>{others}</div></div>
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
"""


def insight_topics():
    cards = []
    for t in TOPICS:
        n = sum(1 for a in INSIGHTS if a['category'] == t['cat'])
        if not n:
            continue
        cards.append(f'<a class="tp-card reveal" href="{topic_file(t)}"><span class="mono">{esc(t["cat"])} · {n}편</span>'
                     f'<strong>{esc(t["name"])}</strong><span>{esc(t["desc"][:68])}…</span></a>')
    return '<div class="tp-cards">' + ''.join(cards) + '</div>'


with io.open(os.path.join("fragments", "glossary.html"), encoding="utf-8") as _f:
    GLOSSARY_TERMS = {k: (strip_tags(nm), strip_tags(d)) for k, nm, d in re.findall(r'<dt id="([^"]+)">(.*?)</dt>\s*<dd>(.*?)</dd>', _f.read(), re.S)}
TOKENS['INSIGHT_LIST'] = insight_list()
TOKENS['INSIGHT_TOPICS'] = insight_topics()
TOKENS['INSIGHT_LATEST'] = insight_latest() + '<p class="in-guides"><span class="mono">주제별 가이드</span>' + ''.join(
    f'<a href="{topic_file(t)}">{esc(t["name"])} →</a>' for t in TOPICS[:4]) + '</p>'
TOKENS['INSIGHT_COUNT'] = str(len(INSIGHTS))
TOKENS['INSIGHT_CATS'] = insight_cats()
TOKENS['INSIGHT_TOPIC_COUNT'] = str(len(CATEGORY_ORDER))
TOKENS['INSIGHT_SERIES'] = '<ol class="in-series">' + ''.join(
    f'<li><span class="mono">{esc(d)}</span><strong>{esc(t)}</strong><em>{esc(c)}</em></li>' for d, t, c in SERIES_DAYS) + '</ol>'

def insight_block(eyebrow, title, lede, cats, tint=False):
    picks = [a for a in INSIGHTS if a['category'] in cats][:3]
    if len(picks) < 3:
        picks += [a for a in INSIGHTS if a not in picks][:3 - len(picks)]
    cards = '\n'.join(insight_card(a) for a in picks)
    guides = ''.join(f'<a href="{topic_file(TOPIC_BY_CAT[c])}">{esc(TOPIC_BY_CAT[c]["name"])} →</a>' for c in cats if c in TOPIC_BY_CAT
                     and any(x['category'] == c for x in INSIGHTS))
    guides = f'<p class="in-guides"><span class="mono">주제별 가이드</span>{guides}</p>' if guides else ''
    return f"""    <!-- ===================== RELATED INSIGHTS ===================== -->
    <section class="section{' section-tint' if tint else ''}">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">{eyebrow}</p>
          <h2>{title}</h2>
          <p class="lede">{lede}</p>
        </header>
        <div class="in-grid in-grid-3">{cards}</div>
        {guides}
        <div class="in-latest-foot"><a class="btn btn-line" href="insights.html">인사이트 전체 보기</a><a class="btn btn-line" href="faq.html">자주 묻는 질문</a><a class="btn btn-line" href="glossary.html">용어 사전</a></div>
      </div>
    </section>
"""


TOKENS['INSIGHT_BLOCK_OWNER'] = insight_block('READ — FOR OWNERS', '건물주와 중개사가 먼저 읽는 글',
    '공실을 어떻게 진단하고, 어떤 구조로 함께할 수 있는지 미리 정리했습니다. 상담 전에 읽어 두시면 이야기가 훨씬 빨라집니다.', ('공실개발', '건물 기획'))
TOKENS['INSIGHT_BLOCK_FOUNDER'] = insight_block('READ — FOR FOUNDERS', '창업 전에 읽어 둘 글',
    '매물을 고르는 기준과 무인 운영의 구조를 짧은 글로 먼저 만나보세요.', ('창업', '무인 운영', '생각'))
TOKENS['INSIGHT_BLOCK_ALL'] = insight_block('READ', '최시준의 글',
    '10년 동안 공간을 만들며 굳어진 판단기준과 지나온 일을 글로 정리하고 있습니다.', ('사업 이야기', '생각', '공실개발'), tint=True)


# ------------------------------------------------------------------
# 패밀리 사이트 네트워크 — 최시준이 만들고 운영하는 공간·서비스
#   각 사이트의 공식 소개(2026.10 확인)를 기준으로 적었습니다.
#   새 사이트가 생기면 이 목록에 한 줄을 추가하면 /network, 메인, 푸터, 관련 페이지에 함께 반영됩니다.
# ------------------------------------------------------------------
NETWORK_GROUPS = [
    ("space", "공간 이용", "예약하고 바로 쓰는 공간", "생일·모임·스터디·행사·게임까지, 목적에 맞는 공간을 고르세요."),
    ("biz", "공간 사업", "공간을 찾고, 만들고, 거래하는 서비스", "공실 진단부터 매물 중개, 브랜딩·인테리어까지."),
]
# 함께 키우는 서비스 — 문을 연 지 얼마 안 됐거나 콘텐츠를 쌓아 가는 중인 곳 (목록으로만 보여 줌)
NETWORK_MORE_GROUPS = [
    ("m-space", "공간 예약 · 플랫폼"),
    ("m-build", "공간 개발 · 부동산"),
    ("m-work", "사업자 성장 · 커뮤니티"),
    ("m-life", "생활 · 여행 · 콘텐츠"),
]
# 한눈에 보기 — 누구를 위한 곳인지로 네 갈래로 묶는다 (대표 사업 그룹 + 함께 키우는 서비스 그룹)
NETWORK_LANES = [
    ("lane-space", "공간을 쓰는 분", "예약하고 바로 쓰는 공간과 공간 찾기", ("space", "m-space")),
    ("lane-biz", "공간을 가진 · 만드는 분", "공실 진단부터 중개, 인테리어, 원상복구까지", ("biz", "m-build")),
    ("lane-work", "사업하는 분", "1인 사업과 사이드프로젝트를 돕는 도구와 모임", ("m-work",)),
    ("lane-life", "일상 · 여행", "생활 정보, 취미, 여행", ("m-life",)),
]
# tier="main": 방문·문의가 꾸준하고 운영이 자리 잡은 대표 사업 (카드로 크게)
# tier="more": 함께 키우는 서비스 (목록). 운영 현황·KPI 추이를 보고 자리가 잡히면 main 으로 올린다.
# 같은 등급 안에서는 적힌 순서대로 보여 준다 (2026.11 방문·문의 기록 기준).
NETWORK = [
    dict(tier="main", key="ssople", group="space", name="쏘플파티룸", en="SSOPLE PARTY ROOM", url="https://ssople.com", mark="SS", color="#FF4712",
         kind="무인 파티룸", line="생일·모임·워크숍을 위한 프라이빗 파티룸. 전국 120여 개 공간을 예약제로 운영합니다.",
         facts=["전국 120여 개 공간", "365일 예약제", "무인 운영"],
         uses=["party", "group"], internal=("portfolio.html?brand=쏘플파티룸#pf-archive", "공간 기록 보기"),
         anchor="전국 파티룸 예약 쏘플파티룸"),
    dict(tier="main", key="megaspot", group="space", name="메가스팟", en="MEGASPOT", url="https://megaspot.kr", mark="MS", color="#0E8A6A",
         kind="대형 행사장 대관", line="건대입구 190평 대형 행사 공간. 세미나·워크숍·네트워킹 파티·공연·팝업·촬영을 한 층 단독으로 진행합니다.",
         facts=["190평 한 층 단독", "최대 200명", "200인치 빔프로젝터·음향"],
         uses=["event", "seminar"], internal=None,
         anchor="건대 대형 행사장 대관 메가스팟"),
    dict(tier="main", key="socialfactory", group="space", name="소셜팩토리", en="SOCIAL FACTORY", url="https://socialfactory.co.kr", mark="SF", color="#151515",
         kind="모임공간 · 코워킹", line="건대입구 세미나실·강의실·모임룸 대관과 24시간 코워킹, 1~3인 독립사무실. 2015년 홍대에서 시작한 모임공간 브랜드입니다.",
         facts=["모임룸 5개 (15~40명)", "24시간 코워킹 50석", "독립사무실 4실"],
         uses=["study", "seminar", "office"], internal=("socialfactory.html", "소셜팩토리 이야기"),
         anchor="건대 세미나실·모임공간 소셜팩토리"),
    dict(tier="main", key="gongbaek", group="biz", name="공백 공간백서", en="GONGBAEK", url="https://vacancy.co.kr", mark="GB", color="#FF4712",
         kind="공실개발 솔루션", line="상가·건물의 공실을 진단해 수익모델을 기획하고, 공간 개발부터 오픈·운영까지 연결하는 ㈜블랭크의 공실개발 솔루션입니다.",
         facts=["사전진단 · 현장진단 리포트", "모델별 수익성 비교", "마스터리스 · 공동개발"],
         uses=["vacancy", "owner"], internal=("cases.html", "공실개발 사례"),
         anchor="상가 공실개발 솔루션 공백"),
    dict(tier="main", key="orbis", group="biz", name="오르비스중개법인", en="ORBIS REAL ESTATE", url="https://orbis-estate.com", mark="OR", color="#1F4FA8",
         kind="상업용 부동산 중개", line="빌딩·상가·오피스의 매매와 임대차 중개, 상권분석 기반 점포개발과 매각 전략을 자문하는 중개법인입니다.",
         facts=["빌딩 · 상가 · 오피스 중개", "상권분석 · 점포개발", "건물 1차 진단"],
         uses=["property", "owner", "startup"], internal=None,
         anchor="빌딩 매매·상가 임대 오르비스중개법인"),
    dict(tier="main", key="coremood", group="biz", name="코어무드", en="CORE MOOD", url="https://coremood.kr", mark="CM", color="#8A5A3C",
         kind="공간 브랜딩 · 인테리어", line="컨셉과 무드에서 출발해 브랜드, 공간 설계, 인테리어 시공, 콘텐츠·마케팅까지 한 팀이 잇는 상업공간 스튜디오입니다.",
         facts=["컨셉 · 브랜드 개발", "설계 · 시공 직접 관리", "촬영 · 오픈 마케팅 연계"],
         uses=["interior", "startup"], internal=None,
         anchor="상업공간 브랜딩·인테리어 코어무드"),
    dict(tier="main", key="playtion", group="space", name="플레이션", en="PLAYTION", url="https://playtion.kr", mark="PL", color="#6C4CF1",
         kind="게임파티룸 · 가챠뽑기샵", line="친구끼리 통째로 빌려 노는 게임파티룸과 캡슐토이 가챠뽑기샵. PASS 멤버십으로 두 곳이 이어집니다.",
         facts=["PC·PS5·스위치·노래방", "2~30인 단독 이용", "캡슐토이 600대 규모 가챠샵"],
         uses=["game", "party"], internal=("portfolio.html?brand=플레이션#pf-archive", "공간 기록 보기"),
         anchor="게임파티룸·가챠뽑기 플레이션"),
    dict(tier="main", key="mingle", group="space", name="밍글", en="MINGLE", url="https://hellomingle.kr", mark="MG", color="#E2A10B",
         kind="24시간 무인 디저트카페 · 동네 커뮤니티", line="동네에서 같이할 사람을 찾는 24시간 무인 디저트카페. 모임·스터디·언어교환 커뮤니티가 함께 있습니다.",
         facts=["24시간 · 연중무휴", "30평 카페 공간", "모임·스터디·언어교환"],
         uses=["cafe", "study"], internal=None,
         anchor="건대 24시간 무인 디저트카페 밍글"),
    dict(tier="more", key="restel", group="m-space", name="레스텔", en="RESTEL", url="https://restel.kr", mark="RT", color="#5B6B8C",
         kind="시간제 휴식 공간", line="60분 낮잠부터 시간 단위로 빌리는 한국식 휴식 공간입니다.",
         facts=[], uses=["rest"], internal=None, anchor="시간제 휴식 공간 레스텔"),
    dict(tier="more", key="pvit", group="m-space", name="프빗", en="PVIT", url="https://pvit.kr", mark="PV", color="#3F51B5",
         kind="프라이빗 공간 찾기", line="우리끼리만 쓰는 프라이빗 공간을 한곳에서 찾는 플랫폼입니다.",
         facts=[], uses=["party", "rest"], internal=None, anchor="프라이빗 공간 찾기 프빗"),
    dict(tier="more", key="mezzanine", group="m-space", name="메자닌 서울", en="MEZZANINE SEOUL", url="https://mezzanine.life", mark="MZ", color="#2E2E2E",
         kind="팝업 · 전시 대관", line="팝업스토어·전시·브랜드 행사를 위한 복합 대관 공간입니다.",
         facts=[], uses=["event"], internal=None, anchor="팝업·전시 대관 공간 메자닌 서울"),
    dict(tier="more", key="honplace", group="m-space", name="혼플", en="HONPLACE", url="https://honplace.com", mark="HP", color="#7A5C3E",
         kind="혼자 가기 좋은 곳", line="혼자 가기 좋은 곳을 골라 소개하는 큐레이션 미디어입니다.",
         facts=[], uses=["rest"], internal=None, anchor="혼자 가기 좋은 곳 혼플"),
    dict(tier="more", key="todaypartyroom", group="m-space", name="오늘의파티룸", en="TODAY PARTYROOM", url="https://todaypartyroom.pages.dev", mark="오늘", color="#FF6B3D", stage="베타",
         kind="당일 · 전날 할인 파티룸", line="오늘·내일 비어 있는 파티룸을 당일·전날 할인가로 모아 보는 곳. 원하는 지역에 빈 방이 나오면 알림을 받을 수 있습니다.",
         facts=[], uses=["party"], internal=None, anchor="당일 할인 파티룸 오늘의파티룸"),
    dict(tier="more", key="bagstop", group="m-space", name="백스톱", en="BAGSTOP", url="https://bagstop.pages.dev", mark="BS", color="#2B6CB0", stage="베타",
         kind="여행자 짐보관", line="카페·식당·숙소처럼 가까운 가게에 짐을 맡기는 짐보관 예약 서비스입니다. 시간과 자리를 미리 보고 1분이면 예약합니다.",
         facts=[], uses=["travel"], internal=None, anchor="여행 짐보관 예약 백스톱 BagStop"),
    dict(tier="more", key="seuseurolab", group="m-build", name="스스로연구소", en="SEUSEURO LAB", url="https://seuseurolab.com", mark="SL", color="#4A7C59",
         kind="상업공간 셀프시공", line="가게 공사를 직접 할 일과 맡길 일로 나눠 주는 셀프시공 연구소입니다.",
         facts=[], uses=["interior", "startup"], internal=None, anchor="상업공간 셀프시공 스스로연구소"),
    dict(tier="more", key="guspace", group="m-build", name="지유공간개발", en="GU SPACE", url="https://guspace.kr", mark="GU", color="#35506B",
         kind="건물 관리 · 공실 관리", line="건물은 시스템으로 관리하고, 공실은 끝까지 맡아 해결하는 건물 관리 회사입니다.",
         facts=[], uses=["owner", "vacancy"], internal=None, anchor="건물 관리·공실 관리 지유공간개발"),
    dict(tier="more", key="tgrz", group="m-build", name="TGRZ SPACE", en="TGRZ SPACE", url="https://tgrzspace.pages.dev/", mark="TG", color="#3B3B3B",
         kind="통건물 마스터리스", line="건물 전체를 임차해 개발·운영하는 통건물 전담 브랜드. 임대인은 공실 걱정 없이 임대수익을 받습니다.",
         facts=["통건물 마스터리스", "층별 개발 · 운영"],
         uses=["owner", "vacancy"], internal=None,
         anchor="통건물 마스터리스 TGRZ SPACE"),
    dict(tier="more", key="blankspaceindex", group="m-build", name="BLANK SPACE INDEX", en="BLANK SPACE INDEX", url="https://blankspaceindex.pages.dev", mark="BX", color="#111111",
         kind="공간 가치 진단 지수", line="주소 하나로 공간·상업용 부동산의 가치를 진단하고, 왜 그런지와 무엇을 해야 하는지까지 짚어 주는 평가 체계입니다.",
         facts=[], uses=["vacancy", "property"], internal=None, anchor="공간·상업용 부동산 가치 진단 BLANK SPACE INDEX"),
    dict(tier="more", key="wonsangtaero", group="m-build", name="원상태로", en="WONSANGTAERO", url="https://wonsangtaero.pages.dev", mark="원상", color="#5D6D7E",
         kind="퇴거 · 원상복구", line="상업공간을 비울 때 원상복구 범위부터 정리하고, 같은 조건의 견적과 시공 관리, 완료 확인까지 이어 줍니다.",
         facts=[], uses=["exit"], internal=None, anchor="상가 퇴거·원상복구 원상태로"),
    dict(tier="more", key="proppeer", group="m-build", name="프롭피어", en="PROPPEER", url="https://proppeer.pages.dev", mark="PP", color="#0F766E", stage="베타",
         kind="부동산 전문가 연결", line="공실·임대차·매입·용도변경 문제를 3분 진단으로 정리하고, 맞는 전문가와 해결 과정까지 연결합니다.",
         facts=[], uses=["property", "vacancy"], internal=None, anchor="부동산 문제 전문가 연결 프롭피어"),
    dict(tier="more", key="ksba", group="m-build", name="한국공간비즈니스협회", en="KSBA", url="https://ksba-web.pages.dev", mark="KS", color="#1E3A5F", stage="설립 준비",
         kind="공간산업 협회", line="공간대여·공실개발 산업의 표준과 품질인증, 교육, 회원사 거래 생태계를 만들기 위해 설립을 준비하는 단체입니다.",
         facts=[], uses=["startup"], internal=None, anchor="한국공간비즈니스협회 KSBA"),
    dict(tier="more", key="passionstore", group="m-work", name="열정상회", en="PASSION STORE", url="https://passionstore.kr", mark="열정", color="#D2541E",
         kind="사업자 커뮤니티", line="업에 진심인 사업자·자영업자·프리랜서의 모임입니다.",
         facts=[], uses=["work"], internal=None, anchor="사업자 커뮤니티 열정상회"),
    dict(tier="more", key="myworks", group="m-work", name="마이웍스", en="MY WORKS", url="https://myworks.ai.kr", mark="MW", color="#2C7A3E",
         kind="업무 운영 시스템", line="혼자 경영하는 사람의 업무 운영 시스템. 업무·프로젝트·할 일을 한곳에서 관리하고 사람과 AI로 연결합니다.",
         facts=["업무 · 프로젝트 관리", "사람 · AI 연결"],
         uses=["work"], internal=None,
         anchor="1인 경영자 업무 운영 시스템 마이웍스"),
    dict(tier="more", key="factanddo", group="m-work", name="팩트앤두", en="FACT&DO", url="https://factanddo.com", mark="FD", color="#1D6F8A", stage="사전등록",
         kind="부업 교육 검증", line="부업·수익화 교육을 먼저 검증하고, 4주 동안 함께 실행해 보는 곳입니다.",
         facts=[], uses=["work"], internal=None, anchor="부업 교육 검증 팩트앤두"),
    dict(tier="more", key="mychallenge", group="m-work", name="마이챌린지", en="MY CHALLENGE", url="https://mychallenge.kr", mark="MC", color="#C0392B",
         kind="사이드프로젝트 12주", line="사이드프로젝트를 12주 동안 함께 진행해 첫 매출까지 가 보는 모임입니다.",
         facts=[], uses=["work"], internal=None, anchor="사이드프로젝트 챌린지 마이챌린지"),
    dict(tier="more", key="bfc", group="m-work", name="BFC 종합경영자문", en="BF CONSULTING", url="https://bfconsulting.pages.dev", mark="BF", color="#1F3A60",
         kind="경영 자문", line="개인사업자·법인을 위한 대표 옆의 외부 경영기획실. 경영·재무·마케팅·조직을 한 계획으로 묶어 진단부터 실행까지 함께합니다.",
         facts=[], uses=["work"], internal=None, anchor="종합경영자문 BFC 비에프컨설팅"),
    dict(tier="more", key="yeongyeoljeom", group="m-work", name="연결점", en="YEONGYEOLJEOM", url="https://yeongyeoljeom.pages.dev", mark="연결", color="#7C3AED", stage="오픈 준비",
         kind="리퍼럴 마켓플레이스", line="아는 고객·사업자·점포를 필요한 기업에 소개하고, 소개 보상을 비교하고 관리하는 리퍼럴 마켓플레이스입니다.",
         facts=[], uses=["work"], internal=None, anchor="리퍼럴 마켓플레이스 연결점"),
    dict(tier="more", key="myeonmyeon", group="m-life", name="면면", en="MYEONMYEON", url="https://myeonmyeon.com", mark="면면", color="#C8102E",
         kind="라면 도감 · 랭킹", line="한국과 세계 라면 516가지를 모은 도감, 먹어 본 사람들의 기록으로 매기는 라면 랭킹입니다.",
         facts=[], uses=["life"], internal=None, anchor="라면 도감·랭킹 면면"),
    dict(tier="more", key="bareunbp", group="m-life", name="바른혈압", en="BAREUN BP", url="https://bareunbp.com", mark="BP", color="#1B7F79",
         kind="혈압 기록 · 건강 정보", line="혈압을 바르게 재고, 7일 기록을 진료실에 가져가도록 돕는 서비스입니다.",
         facts=[], uses=["life"], internal=None, anchor="혈압 기록 바른혈압"),
    dict(tier="more", key="rulerule", group="m-life", name="룰룰", en="RULERULE", url="https://rulerule.kr", mark="룰룰", color="#6D4C9F",
         kind="보드게임 · 전통놀이 룰", line="보드게임과 전통놀이 60가지의 규칙을 쉽게 풀어 둔 설명서입니다.",
         facts=[], uses=["game", "life"], internal=None, anchor="보드게임 룰 설명서 룰룰"),
    dict(tier="more", key="hantang", group="m-life", name="한탕", en="HANTANG", url="https://hantang.kr", mark="HT", color="#B23A48",
         kind="외국인용 찜질방 가이드", line="외국인 여행자를 위한 한국 찜질방·목욕탕 이용 가이드입니다.",
         facts=[], uses=["rest"], internal=None, anchor="Korean jjimjilbang guide HANTANG"),
    dict(tier="more", key="yeodeol", group="m-life", name="여덟글자", en="YEODEOL", url="https://yeodeol.kr", mark="여덟", color="#B5487A",
         kind="오늘의 색 · 감정 기록 · 사주", line="매일 바뀌는 오늘의 색과 감정 기록으로 사주를 함께 읽는 서비스. 점수도 흉일도 없이, 오늘 해볼 일 하나로 끝맺습니다.",
         facts=["오늘의 색 카드", "감정 날씨 기록", "궁합 · 신년운세 리포트"],
         uses=["life"], internal=None,
         anchor="오늘의 색과 감정으로 읽는 사주 여덟글자"),
    dict(tier="more", key="yunto", group="m-life", name="윤토", en="YUNTO", url="https://yuntoworld.pages.dev", mark="YT", color="#0E7490",
         kind="창작 언어", line="소리 15개, 규칙 13조, 예외 없이 30분이면 첫 문장을 만드는 창작 언어 윤토와 고유문자를 소개합니다.",
         facts=[], uses=["life"], internal=None, anchor="창작 언어 윤토 YUNTO"),
    dict(tier="more", key="fleating", group="m-life", name="플리팅", en="FLEATING", url="https://fleating-web.pages.dev", mark="FL", color="#DB2777", stage="베타",
         kind="플리마켓 일정 · 셀러 모집", line="전국 플리마켓 일정과 셀러 모집, 참여 셀러와 커뮤니티를 한곳에 모으는 플리마켓 플랫폼입니다.",
         facts=[], uses=["life"], internal=None, anchor="플리마켓 일정·셀러 모집 플리팅"),
    dict(tier="more", key="mongcrew", group="m-life", name="몽크루", en="MONGOLIA CREW", url="https://mongcrew.pages.dev", mark="몽크", color="#B45309", stage="오픈 준비",
         kind="몽골 여행 동행", line="일정과 성향이 맞는 동행을 찾고, 출발까지 안심하고 확정하는 몽골 여행 동행 플랫폼입니다.",
         facts=[], uses=["travel"], internal=None, anchor="몽골 여행 동행 몽크루"),
]
NETWORK_BY_KEY = {n['key']: n for n in NETWORK}

# '이럴 때 찾으세요' — 고객의 필요 → 사이트
NETWORK_USES = [
    ("party", "생일 · 파티 · 소모임", ["ssople", "playtion", "pvit", "todaypartyroom"]),
    ("game", "게임하며 놀기", ["playtion", "ssople", "rulerule"]),
    ("study", "스터디 · 회의 · 강의", ["socialfactory", "mingle"]),
    ("seminar", "세미나 · 워크숍", ["socialfactory", "megaspot"]),
    ("event", "100명 넘는 행사 · 팝업 · 촬영", ["megaspot", "mezzanine"]),
    ("office", "코워킹 · 1인 사무실", ["socialfactory"]),
    ("cafe", "카페 · 동네 모임 · 언어교환", ["mingle"]),
    ("rest", "혼자 쉬기 · 휴식", ["restel", "honplace", "hantang", "pvit"]),
    ("vacancy", "상가 · 건물 공실 해결", ["gongbaek", "guspace", "tgrz", "orbis", "blankspaceindex", "proppeer"]),
    ("property", "빌딩 · 상가 매매 · 임대", ["orbis", "proppeer", "blankspaceindex"]),
    ("interior", "매장 브랜딩 · 인테리어 · 셀프시공", ["coremood", "seuseurolab"]),
    ("exit", "매장 정리 · 퇴거 · 원상복구", ["wonsangtaero", "orbis"]),
    ("startup", "공간 창업 준비", ["coremood", "orbis", "gongbaek", "seuseurolab", "ksba"]),
    ("work", "1인 사업 · 경영 · 사이드프로젝트", ["myworks", "bfc", "passionstore", "mychallenge", "factanddo", "yeongyeoljeom"]),
    ("travel", "여행 · 짐 보관", ["bagstop", "hantang", "mongcrew"]),
    ("life", "생활 정보 · 취미", ["myeonmyeon", "bareunbp", "rulerule", "yeodeol", "yunto", "fleating"]),
]

# 글 주제별로 함께 보여줄 사이트
NETWORK_BY_CATEGORY = {
    '공실개발': ["gongbaek", "orbis", "coremood"],
    '건물 기획': ["gongbaek", "tgrz", "megaspot"],
    '창업': ["coremood", "ssople", "orbis"],
    '무인 운영': ["ssople", "mingle", "playtion"],
    '생각': ["ssople", "socialfactory", "gongbaek"],
    '시장 · 산업': ["gongbaek", "orbis", "megaspot"],
    '사업 이야기': ["ssople", "socialfactory", "playtion"],
    '강연 · 교육': ["socialfactory", "megaspot", "myworks"],
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
    """대표 사업 — 그룹별 카드"""
    out = []
    for gk, label, title, lede in NETWORK_GROUPS:
        items = [n for n in NETWORK if n['group'] == gk and n['tier'] == 'main']
        if not items:
            continue
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


def net_stage(n):
    """베타 · 사전등록 · 오픈 준비 · 설립 준비 — 아직 정식 운영 전인 곳에만 붙는 표시"""
    return f'<span class="net-stage">{esc(n["stage"])}</span>' if n.get('stage') else ''


def net_item(n):
    """함께 키우는 서비스 — 한 줄 목록"""
    host = re.sub(r'^https?://(www\.)?', '', n['url']).rstrip('/')
    uses = ' '.join(k for k, _, keys in NETWORK_USES if n['key'] in keys)
    return (f'<li class="net-item" data-uses="{uses}" id="net-{n["key"]}"><a href="{n["url"]}"{ext_attrs()} title="{esc(n["anchor"])}">'
            f'<span class="net-item-name"><strong>{esc(n["name"])}</strong>{net_stage(n)}<span class="net-item-kind">{esc(n["kind"])}</span></span>'
            f'<span class="net-item-line">{esc(n["line"])}</span><span class="net-item-host mono">{esc(host)} ↗</span></a></li>')


def network_more_html():
    """/network — 함께 키우는 서비스 (목록)"""
    cols = []
    for gk, label in NETWORK_MORE_GROUPS:
        items = [n for n in NETWORK if n['group'] == gk and n['tier'] == 'more']
        if items:
            cols.append(f'<div class="net-more-group"><p class="net-row-label mono">{esc(label)}</p><ul class="net-list">{"".join(net_item(n) for n in items)}</ul></div>')
    count = sum(1 for n in NETWORK if n['tier'] == 'more')
    return f"""    <section class="section" id="group-more">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">GROWING · {count}</p>
          <h2>함께 키우고 있는 <span class="accent">서비스</span></h2>
          <p class="lede">문을 연 지 얼마 되지 않았거나 콘텐츠를 쌓아 가는 중인 서비스입니다. 쓰임새가 맞는다면 먼저 둘러보셔도 좋습니다. 이름 옆에 '베타'나 '오픈 준비'가 붙은 곳은 아직 정식 운영 전입니다.</p>
        </header>
        <div class="net-more">{''.join(cols)}</div>
      </div>
    </section>"""


def network_map():
    """/network — 한눈에 보기: 누구를 위한 곳인지 네 갈래로, 이름을 누르면 아래 설명으로 이동"""
    lanes = []
    for lk, title, sub, groups in NETWORK_LANES:
        items = [n for n in NETWORK if n['group'] in groups]
        items.sort(key=lambda n: (n['tier'] != 'main', bool(n.get('stage'))))
        lis = ''.join(
            f'<li class="{"is-main" if n["tier"] == "main" else ""}"><a href="#net-{n["key"]}">{esc(n["name"])}</a>{net_stage(n)}</li>'
            for n in items)
        lanes.append(f'<div class="net-lane reveal" id="{lk}"><p class="net-lane-count mono">{len(items):02d}</p><h3>{esc(title)}</h3>'
                     f'<p class="net-lane-sub">{esc(sub)}</p><ul>{lis}</ul></div>')
    main_n = sum(1 for n in NETWORK if n['tier'] == 'main')
    return f"""    <section class="section section-tint" id="map">
      <div class="container">
        <header class="section-head reveal">
          <p class="eyebrow mono">AT A GLANCE · {len(NETWORK)}</p>
          <h2>한눈에 보는 <span class="accent">패밀리 사이트</span></h2>
          <p class="lede">누구를 위한 곳인지에 따라 네 갈래로 묶었습니다. 굵은 이름 {main_n}곳은 방문과 문의가 꾸준한 대표 사업입니다. 이름을 누르면 아래 설명으로 이동합니다.</p>
        </header>
        <div class="net-map">{''.join(lanes)}</div>
      </div>
    </section>"""


def network_finder():
    chips = ''.join(f'<button type="button" class="f-chip" data-use="{k}">{esc(label)}</button>' for k, label, _ in NETWORK_USES)
    return (f'<div class="board-filters net-finder" id="netFinder" role="group" aria-label="필요한 것 고르기">'
            f'<button type="button" class="f-chip is-active" data-use="">전체</button>{chips}</div>')


def network_home():
    """메인 · 브랜드 페이지에 넣는 묶음 — 대표 사업은 한 줄 카드, 나머지는 이름 목록"""
    rows = []
    for gk, label, title, _ in NETWORK_GROUPS:
        items = [n for n in NETWORK if n['group'] == gk and n['tier'] == 'main']
        if items:
            rows.append(f'<div class="net-row"><p class="net-row-label mono">{esc(label)}</p><div class="net-mini-grid">'
                        + ''.join(net_card(n, full=False) for n in items) + '</div></div>')
    groups = []
    for gk, label in NETWORK_MORE_GROUPS:
        items = [n for n in NETWORK if n['tier'] == 'more' and n['group'] == gk]
        if items:
            links = ''.join(f'<li><a href="{n["url"]}"{ext_attrs()} title="{esc(n["anchor"])}"><strong>{esc(n["name"])}</strong>'
                            f'<span>{esc(n["kind"])}</span>{net_stage(n)}</a></li>' for n in items)
            groups.append(f'<div class="net-chip-group"><p class="mono">{esc(label)}</p><ul class="net-chips">{links}</ul></div>')
    if groups:
        rows.append('<div class="net-row"><p class="net-row-label mono">함께 키우는 서비스</p><div class="net-chip-groups">' + ''.join(groups) + '</div></div>')
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
        if k in ('life', 'work', 'rest', 'travel'):
            continue
        links = ' · '.join(f'<a href="{NETWORK_BY_KEY[x]["url"]}"{ext_attrs()}>{esc(NETWORK_BY_KEY[x]["name"])}</a>' for x in keys)
        rows.append(f'<li><span>{esc(label)}</span><span>{links}</span></li>')
    return '<ul class="net-guide">' + ''.join(rows) + '</ul>'


def network_family_bar():
    """모든 페이지 푸터의 패밀리 사이트 줄 — 대표 사업만 링크하고, 나머지는 /network 로 모은다"""
    parts = []
    for gk, label, _, _ in NETWORK_GROUPS:
        links = ''.join(f'<a href="{n["url"]}"{ext_attrs()} title="{esc(n["anchor"])}">{esc(n["name"])}</a>'
                        for n in NETWORK if n['group'] == gk and n['tier'] == 'main')
        if links:
            parts.append(f'<p><span class="mono">{esc(label)}</span>{links}</p>')
    more = [n for n in NETWORK if n['tier'] == 'more']
    if more:
        names = ' · '.join(esc(n['name']) for n in more[:5])
        parts.append(f'<p><span class="mono">함께 키우는 서비스</span><a href="network.html#group-more">{names} 외 {len(more) - 5}곳 →</a></p>')
    return ('<div class="footer-family"><p class="footer-family-title mono"><a href="network.html">FAMILY SITES — 함께 운영하는 공간 · 서비스 →</a></p>'
            + ''.join(parts) + '</div>')


TOKENS['NETWORK_GROUPS'] = network_groups_html()
TOKENS['NETWORK_MORE'] = network_more_html()
PARTNER_KINDS = ['공실 공동개발 · 건물 협업', '공간 입점 · 대관 제휴', '서비스 · 기술 제휴', '강의 · 교육 · 행사 협업',
                 '미디어 · 콘텐츠 협업', '기관 · 지자체 협업', '투자 · 공동사업', '기타 제휴']   # functions/_lib/core.js 와 같게
# ---------- 공실 등록 (functions/_lib/core.js 의 VAC 와 같게) ----------
VAC = dict(
    roles=['건물주', '중개사', '자산운용 · 관리', '임차인 (양도 · 업종 전환)', '기타'],
    sido=['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'],
    floors=['지하', '1층', '2층', '3~4층', '5층 이상', '건물 전체'],
    vacantFor=['곧 비어요 (아직 운영 중)', '3개월 미만', '3~6개월', '6개월~1년', '1년 이상'],
    states=['빈 상태 (원상복구됨)', '이전 시설이 남아 있음', '운영 중 (업종 전환 검토)', '신축 · 리모델링 중'],
    features=['엘리베이터', '주차', '내부 화장실', '층고 높음', '창 · 채광', '24시간 출입', '방음 가능', '대로변'],
    wants=['활용 방안 진단', '임차인 찾기', '운영 맡기기 (위탁운영)', '통째로 임차 (마스터리스)', '수익 나누기 (공동사업)', '매각 · 중개 상담', '아직 모르겠어요'],
    times=['언제든', '평일 오전', '평일 오후', '평일 저녁', '주말'])


def _chips(name, values, kind='checkbox', checked=None):
    return ''.join('<label class="pt-chip"><input type="%s" name="%s" value="%s"%s /><span>%s</span></label>'
                   % (kind, name, esc(v), ' checked' if v == checked else '', esc(v)) for v in values)


_opts = lambda values: ''.join('<option value="%s">%s</option>' % (esc(v), esc(v)) for v in values)
TOKENS['VAC_ROLE_CHIPS'] = _chips('role', VAC['roles'], 'radio', '건물주')
TOKENS['VAC_SIDO_OPTIONS'] = _opts(VAC['sido'])
TOKENS['VAC_FLOOR_CHIPS'] = _chips('floors', VAC['floors'])
TOKENS['VAC_VACANT_OPTIONS'] = _opts(VAC['vacantFor'])
TOKENS['VAC_STATE_OPTIONS'] = _opts(VAC['states'])
TOKENS['VAC_FEATURE_CHIPS'] = _chips('features', VAC['features'])
TOKENS['VAC_WANT_CHIPS'] = _chips('wants', VAC['wants'])
TOKENS['VAC_TIME_OPTIONS'] = _opts(VAC['times'])

# ---------- 미디어 키트 (data/mediakit.json) ----------
with io.open(os.path.join("data", "mediakit.json"), encoding="utf-8") as _f:
    MK = json.load(_f)


def _mk_profiles():
    tabs, panels = [], []
    for i, p in enumerate(MK['profiles']):
        on = i == 0
        k = p['key']
        tabs.append('<button type="button" role="tab" class="mk-tab%s" id="mkt-%s" aria-controls="mkp-%s" aria-selected="%s">%s</button>'
                    % (' is-active' if on else '', k, k, 'true' if on else 'false', esc(p['label'])))
        body = ''.join('<p>%s</p>' % esc(x) for x in p['text'].split('\n\n'))
        n = len(p['text'].replace('\n\n', ' '))
        panels.append('<div class="mk-panel" role="tabpanel" id="mkp-%s" aria-labelledby="mkt-%s"%s>'
                      '<p class="mk-use mono">%s · <span>%d자</span></p><div class="mk-text" data-mk-text>%s</div>'
                      '<button type="button" class="btn btn-sm btn-line mk-copy" data-mk-copy>복사하기</button></div>'
                      % (k, k, '' if on else ' hidden', esc(p['use']), n, body))
    return ''.join(tabs), ''.join(panels)


def _mk_photo(p):
    f = esc(p['file'])
    return ('<figure class="mk-photo reveal"><a href="%s" target="_blank" rel="noopener"><img src="%s" alt="%s" loading="lazy" decoding="async" /></a>'
            '<figcaption><strong>%s</strong><span class="mono">%s px · JPG</span><a class="btn btn-sm btn-line" href="%s" download>내려받기</a></figcaption></figure>'
            % (f, f, esc(p['alt']), esc(p['label']), esc(p['size']), f))


def _mk_topic(i, t):
    return ('<article class="mk-topic reveal"><span class="mk-topic-no mono">%02d</span><h3>%s</h3><p class="mk-topic-sub">%s</p>'
            '<p>%s</p><p class="mk-topic-who"><span class="mono">대상</span>%s</p></article>'
            % (i, esc(t['title']), esc(t['sub']), esc(t['text']), esc(t['who'])))


def _mk_brand(n):
    host = n['url'].split('//')[1].rstrip('/')
    return ('<a class="mk-brand" href="%s" target="_blank" rel="noopener"><strong>%s</strong><span>%s</span><em class="mono">%s ↗</em></a>'
            % (esc(n['url']), esc(n['name']), esc(n.get('kind', '')), esc(host)))


TOKENS['MK_PROFILE_TABS'], TOKENS['MK_PROFILE_PANELS'] = _mk_profiles()
TOKENS['MK_UPDATED'] = esc(MK['updated'])
for _k in ('name', 'name_en', 'title', 'field', 'pdf'):
    TOKENS['MK_' + _k.upper()] = esc(MK[_k])
TOKENS['MK_EMAIL'], TOKENS['MK_PHONE'], TOKENS['MK_KAKAO'] = (esc(MK['contact'][k]) for k in ('email', 'phone', 'kakao'))
TOKENS['MK_NAMING'] = ''.join('<div><dt>%s</dt><dd>%s</dd></div>' % (esc(k), esc(v)) for k, v in MK['naming'])
TOKENS['MK_PHOTOS'] = ''.join(_mk_photo(p) for p in MK['photos'])
TOKENS['MK_TOPICS'] = ''.join(_mk_topic(i, t) for i, t in enumerate(MK['topics'], 1))
TOKENS['MK_FORMATS'] = ''.join('<span>%s</span>' % esc(x) for x in MK['formats'])
TOKENS['MK_STATS'] = ''.join('<li><strong>%s<em>%s</em></strong><span>%s</span></li>' % (esc(n[:-1]), esc(n[-1]), esc(l)) for n, l in MK['stats'])
TOKENS['MK_ORGS'] = esc(' · '.join(MK['orgs']))
TOKENS['MK_SCHOOLS'] = esc(' · '.join(MK['schools']))
TOKENS['MK_MEDIA'] = esc(' · '.join(MK['media']))
TOKENS['MK_CAREER_NOW'] = ''.join('<li>%s</li>' % esc(x) for x in MK['career_now'])
TOKENS['MK_CAREER_BEFORE'] = ''.join('<li>%s</li>' % esc(x) for x in MK['career_before'])
_by_name = {n['name']: n for n in NETWORK}
TOKENS['MK_BRANDS'] = ''.join(_mk_brand(_by_name[b]) for b in MK['brands'] if b in _by_name)

TOKENS['PARTNER_KIND_OPTIONS'] = ''.join(f'<option value="{esc(k)}">{esc(k)}</option>' for k in PARTNER_KINDS)
TOKENS['PARTNER_BRAND_CHIPS'] = ''.join(
    f'<label class="pt-chip"><input type="checkbox" name="brands" value="{esc(v)}" /><span>{esc(v)}</span></label>'
    for v in [n['name'] for n in NETWORK if n['tier'] == 'main'] + ['함께 키우는 서비스', '최시준 강의·자문', '아직 정하지 않음'])
TOKENS['NETWORK_MAP'] = network_map()
TOKENS['NETWORK_FINDER'] = network_finder()
TOKENS['NETWORK_HOME'] = network_home()
TOKENS['NETWORK_COUNT'] = str(len(NETWORK))
TOKENS['NETWORK_MAIN_COUNT'] = str(sum(1 for n in NETWORK if n['tier'] == 'main'))
TOKENS['NETWORK_USE_GUIDE'] = network_use_guide()
TOKENS['NETWORK_PICK_PRO'] = network_pick(["gongbaek", "coremood", "orbis", "guspace"], "공간 사업을 함께하는 패밀리 서비스",
                                          lede="진단·설계·중개·운영을 각 분야 사이트에서 더 자세히 볼 수 있습니다.")
TOKENS['NETWORK_PICK_KONDAE'] = network_pick(["socialfactory", "megaspot", "mingle", "playtion"], "건대입구 한 건물에서 이어지는 공간",
                                             eyebrow="KONDAE CLUSTER", lede="모임은 소셜팩토리, 큰 행사는 메가스팟, 쉬어 갈 땐 밍글, 2차는 플레이션.")
TOKENS['NETWORK_PICK_SPACE'] = network_pick(["ssople", "playtion", "socialfactory", "megaspot", "mingle"], "공간을 바로 예약하고 싶다면",
                                            eyebrow="BOOK A SPACE", lede="파티·게임·모임·행사·카페 — 각 브랜드 사이트에서 바로 예약하고 문의할 수 있습니다.")


# 방문 통계에 예전부터 쓰던 이름 — 지난 기록과 이어지도록 그대로 둔다
FAMILY_LABEL_KEEP = {'hellomingle.kr': '헬로밍글', 'vacancy.co.kr': '공실개발', 'orbis-estate.com': '오르비스'}


def build_family_sync():
    """패밀리 사이트 목록(NETWORK) 하나로 나머지를 맞춘다
    - functions/_lib/family.js : 방문 통계가 '패밀리 사이트에서 온 방문'을 알아보는 목록
    - script.js 의 FAMILY      : 패밀리 사이트로 나가는 클릭을 따로 세는 목록
    - setup/family-sites-snippet.html : 다른 브랜드 사이트 푸터에 붙이는 패밀리 사이트 블록"""
    hosts = []
    for n in NETWORK:
        h = re.sub(r'^https?://(www\.)?', '', n['url']).split('/')[0].lower()
        if h not in [x for x, _ in hosts]:
            hosts.append((h, FAMILY_LABEL_KEEP.get(h, n['name'])))
    js = ('/* gen.py 가 패밀리 사이트 목록(NETWORK)에서 만든 파일입니다. 직접 고치지 말고 gen.py 를 고친 뒤 다시 만드세요. */\n'
          'export const FAMILY_SITES = [\n' + ''.join(f"  ['{h}', '{l}'],\n" for h, l in hosts) + '];\n')
    with io.open(os.path.join('functions', '_lib', 'family.js'), 'w', encoding='utf-8') as f:
        f.write(js)
    rx = '|'.join(re.escape(h).replace('\\-', '-') for h, _ in hosts)
    with io.open('script.js', encoding='utf-8') as f:
        sj = f.read()
    sj2 = re.sub(r"  const FAMILY = /\(\^\|\\\.\)\([^\n]*\)\$/i;", lambda m: "  const FAMILY = /(^|\\.)(" + rx + ")$/i;", sj, count=1)
    if sj2 != sj:
        with io.open('script.js', 'w', encoding='utf-8') as f:
            f.write(sj2)
    # 다른 사이트용 패밀리 블록
    st = 'display:inline-block;min-width:96px;opacity:.6;font-size:12px;'
    a_st = 'color:inherit;text-decoration:none;margin-right:14px;white-space:nowrap;'
    def line(label, items):
        links = ''.join(f'<a href="{n["url"]}" target="_blank" rel="noopener" title="{esc(n["anchor"])}" style="{a_st}">{esc(n["name"])}</a>' for n in items)
        return f'    <p style="margin:6px 0;"><span style="{st}">{esc(label)}</span>{links}</p>\n'
    body = ''
    for gk, label, _, _ in NETWORK_GROUPS:
        body += line(label, [n for n in NETWORK if n['tier'] == 'main' and n['group'] == gk])
    for gk, label in NETWORK_MORE_GROUPS:
        body += line(label, [n for n in NETWORK if n['tier'] == 'more' and n['group'] == gk and not n.get('stage')])
    snippet = (f"<!--\n  패밀리 사이트 블록 — 다른 브랜드 사이트 푸터 위에 그대로 붙여넣는 코드\n"
               f"  (choisijun.com 의 gen.py NETWORK 목록에서 자동 생성 · {TODAY})\n"
               "  - 자기 사이트 링크는 지워도 되고 그대로 두어도 됩니다\n"
               "  - 베타 · 오픈 준비 중인 곳은 넣지 않았습니다\n"
               "  - 색은 사이트 디자인에 맞게 color / border 값만 바꾸세요\n-->\n"
               '<section class="family-sites" aria-label="패밀리 사이트" style="border-top:1px solid rgba(0,0,0,.12);padding:22px 0;font-size:14px;line-height:1.7;">\n'
               '  <div style="max-width:1120px;margin:0 auto;padding:0 20px;">\n'
               '    <p style="margin:0 0 8px;font-weight:700;">FAMILY SITES — <a href="https://choisijun.com/network" target="_blank" rel="noopener" style="color:#FF4712;text-decoration:none;">최시준이 만들고 운영하는 공간 · 서비스 전체 보기 →</a></p>\n'
               + body + '  </div>\n</section>\n')
    with io.open(os.path.join('setup', 'family-sites-snippet.html'), 'w', encoding='utf-8') as f:
        f.write(snippet)
    print('built family lists', len(hosts))


def build_llms():
    """AI 검색·LLM 크롤러용 사이트 요약 (llms.txt 관례)"""
    lines = ["# 최시준 (Choi Si-jun) — choisijun.com", "",
             "> 공실개발·공간수익화 전문가. 10년+ 340개+ 공간을 직접 기획·오픈·운영. ㈜블랭크 대표, 쏘플파티룸(전국 120여 개 무인 파티룸) 대표. "
             "건물주·중개사의 공실 문제를 구조로 풀고, 창업자에게 실패확률을 줄이는 판단기준을 전한다. 기업·대학 강의, 전자책.", "",
             "전체 본문(소개·서비스·자주 묻는 질문·용어 사전·인사이트 글 전문)은 llms-full.txt 에 있습니다: " + DOMAIN + "/llms-full.txt", "",
             "## 한눈에 보는 사실 (인용할 때 이 표기를 써 주세요)",
             "- 이름: 최시준 (Choi Sijun). 직함: ㈜블랭크 대표. 공간 브랜드 맥락에서는 쏘플파티룸 대표.",
             "- 분야: 공간수익화 · 공실개발. 비어 있는 상가·건물에 맞는 수요를 찾아 용도와 운영 구조를 다시 짜는 일.",
             "- 경험: 10년 넘게 340개가 넘는 공간을 직접 기획·운영 (자사 기준). 층이 기록된 97곳 중 81곳이 지하 또는 3층 이상.",
             "- 쏘플파티룸: 2018년 홍대에서 시작한 예약제 공간대여 브랜드, 전국 120여 개 공간 (자사 기준). '쏘플'로 줄이지 않고 '쏘플파티룸'으로 표기.",
             "- 건물주와 일하는 네 가지 구조: 컨설팅, 위탁운영, 마스터리스(통임차), 수익쉐어·공동사업.",
             "- 경력: 중앙대학교 경영학, 현대엔지니어링·현대엠코 자산관리팀, 2015년 복합문화공간 소셜팩토리 창업.",
             "- 강의: 기업·기관 50곳 이상, 대학 30곳 이상, TEDxCAU 연사 (자체 집계).",
             "- 이전 법인 ㈜소셜패밀리는 쏘플파티룸을 시작한 법인으로, 현재 직함에는 쓰지 않음.", "",
             "## 핵심 페이지"]
    for k in ['home', 'about', 'services', 'cases', 'portfolio', 'insights', 'faq', 'glossary', 'brands', 'network', 'socialfactory', 'books', 'vacancy', 'partnership', 'mediakit', 'contact']:
        pg = PAGE_BY_KEY.get(k)
        if pg:
            lines.append(f"- [{pg['crumb'] or '홈'}]({page_url(pg['file'])}): {pg['desc']}")
    lines += ["", "## 지역별 포트폴리오"]
    for r in REGION_PAGES:
        pg = PAGE_BY_KEY['region-' + REGION_SLUG[r]]
        lines.append(f"- [{r}]({page_url(pg['file'])}): {pg['desc']}")
    lines += ["", "## 주제별 가이드 (인사이트 글을 주제별로 묶은 허브)"]
    for t in TOPICS:
        pg = PAGE_BY_KEY.get('topic-' + t['slug'])
        if pg:
            lines.append(f"- [{t['name']}]({page_url(pg['file'])}): {t['desc']}")
    lines += ["", "## 인사이트(글)"]
    for a in INSIGHTS:
        lines.append(f"- [{a['title']}]({page_url(a['file'])}): {a['desc']}")
    lines += ["", "## 패밀리 사이트 — 대표 사업 (최시준이 만들고 운영하는 공간·서비스)"]
    for n in NETWORK:
        if n['tier'] == 'main':
            lines.append(f"- [{n['name']}]({n['url']}): {n['kind']} — {n['line']}")
    lines += ["", "## 패밀리 사이트 — 함께 키우는 서비스"]
    for n in NETWORK:
        if n['tier'] == 'more':
            lines.append(f"- [{n['name']}]({n['url']}): {n['kind']} — {n['line']}")
    lines += ["", "## 연락", f"- 문의: {DOMAIN}/contact", f"- 공실 등록: {DOMAIN}/vacancy", f"- 제휴·협업 제안: {DOMAIN}/partnership", f"- 미디어 키트(공식 프로필·사진): {DOMAIN}/mediakit", "- Threads: https://www.threads.com/@sijun.choi", "- 쏘플파티룸: https://ssople.com", ""]
    with io.open('llms.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('built llms.txt')
    build_llms_full(lines[:2])


def html_to_md(h):
    """간단한 HTML → 마크다운 (llms-full.txt 용)"""
    h = re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>', '', h, flags=re.S)
    h = re.sub(r'<h1[^>]*>(.*?)</h1>', lambda m: '\n# ' + strip_tags(m.group(1)) + '\n', h, flags=re.S)
    h = re.sub(r'<h2[^>]*>(.*?)</h2>', lambda m: '\n## ' + strip_tags(m.group(1)) + '\n', h, flags=re.S)
    h = re.sub(r'<h3[^>]*>(.*?)</h3>', lambda m: '\n### ' + strip_tags(m.group(1)) + '\n', h, flags=re.S)
    h = re.sub(r'<summary[^>]*>(.*?)</summary>', lambda m: '\n### ' + strip_tags(m.group(1)) + '\n', h, flags=re.S)
    h = re.sub(r'<dt[^>]*>(.*?)</dt>', lambda m: '\n- **' + strip_tags(m.group(1)) + '**: ', h, flags=re.S)
    h = re.sub(r'<li[^>]*>(.*?)</li>', lambda m: '\n- ' + strip_tags(m.group(1)), h, flags=re.S)
    h = re.sub(r'</p>|<br\s*/?>', '\n', h)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', h))
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n\s*\n\s*\n+', '\n\n', t)
    return '\n'.join(x.strip() for x in t.split('\n')).strip()


def build_llms_full(head):
    """llms-full.txt — AI 검색이 한 번에 읽을 수 있는 본문 전체 (소개·서비스·사례·FAQ·용어·미디어 키트·글 전문)"""
    out = head + ["", "> 최시준 홈페이지의 주요 페이지와 인사이트 글 전문입니다. 숫자는 별도 표기가 없으면 자사 기준입니다. 출처로 인용할 때는 각 글의 주소를 함께 적어 주세요.", ""]
    for k in ['about', 'services', 'cases', 'faq', 'glossary', 'mediakit', 'vacancy', 'partnership']:
        pg = PAGE_BY_KEY.get(k)
        if not pg:
            continue
        with io.open(os.path.join("fragments", pg['file']), encoding="utf-8") as f:
            body = fill(f.read(), pg['file'])
        out += ["", "---", "", f"# {pg['crumb'] or pg['title']}", f"주소: {page_url(pg['file'])}", "", html_to_md(body)]
    for a in INSIGHTS:
        out += ["", "---", "", f"# {a['title']}", f"주소: {page_url(a['file'])} · 글 최시준 · {a['date']}" + (f" (수정 {a['updated']})" if a['updated'] != a['date'] else '') + f" · 주제 {a['category']}",
                f"요약: {a['summary']}", "", html_to_md(a['html'])]
    with io.open('llms-full.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    print('built llms-full.txt')


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
def region_faq(r, spaces, areas, types, projects):
    """권역 페이지 — 포트폴리오 데이터로만 만드는 질문과 답 (검색 결과·AI 답변용)"""
    n = sum(i['spaces'] for i in spaces)
    years = sorted(i['year'] for i in spaces if i.get('year'))
    fl = Counter(i.get('floorClass') for i in spaces if i.get('floorClass'))
    known = sum(fl.values())
    qa = []
    area_txt = ', '.join(f'{a} {c}곳' for a, c in areas[:6]) + (f' 외 {len(areas) - 6}개 지역' if len(areas) > 6 else '')
    qa.append((f'{r}에서 운영한 공간은 몇 곳인가요?',
               f'{r}에서는 {len(areas)}개 지역에서 {n}개 공간을 기획하고 운영했습니다. 지역별로는 {area_txt}입니다.'))
    qa.append((f'{r}에서는 어떤 공간을 만들었나요?',
               f'{", ".join(f"{t} {c}곳" for t, c in types.most_common(5))}입니다. 대부분 시간 단위로 예약해 쓰는 목적형 공간입니다.'))
    if years and years[0] != years[-1]:
        qa.append((f'{r}에서는 언제부터 공간을 운영했나요?',
                   f'{years[0]}년에 첫 공간을 열었고, 가장 최근 기록은 {years[-1]}년입니다.'))
    if known >= 3:
        parts = [f'{FLOOR_LABEL[k]} {fl[k]}곳' for k in ('basement', 'ground', 'upper') if fl.get(k)]
        qa.append((f'{r}의 공간은 주로 몇 층에 있었나요?',
                   f'층이 기록된 {known}곳 가운데 {", ".join(parts)}입니다. 예약제 공간은 손님이 목적을 갖고 찾아오기 때문에 1층이 아니어도 운영할 수 있습니다.'))
    sido = r if r in ('서울', '경기', '인천') else ''
    qa.append((f'{r}에 비어 있는 상가가 있으면 어떻게 상담하나요?',
               f'공실 등록 페이지에 위치(동 단위), 층, 면적, 비어 있던 기간을 남겨 주시면 어떤 용도와 운영 구조가 맞을지 검토해 영업일 1~2일 안에 연락드립니다.'
               + (f' {r}에서 진행한 공실개발·건물 기획 프로젝트 {len(projects)}건도 이 페이지에서 볼 수 있습니다.' if projects else '')))
    items = ''.join(f'<details class="faq-item"><summary>{esc(q)}</summary>\n<p>{esc(a)}</p></details>' for q, a in qa)
    return f"""    <section class="section section-tint" id="pf-faq">
      <div class="container container-narrow">
        <header class="section-head reveal">
          <p class="eyebrow mono">FAQ</p>
          <h2>{esc(r)} 공간, <span class="accent">자주 묻는 질문</span></h2>
        </header>
        <div class="faq-list">{items}</div>
        <div class="hero-cta" style="margin-top:20px;"><a class="btn btn-line" href="vacancy.html{('?sido=' + sido) if sido else ''}">{esc(r)} 공실 등록하기</a><a class="btn btn-line" href="insights/topic-vacancy.html">공실개발 가이드</a></div>
      </div>
    </section>"""


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
{region_faq(r, spaces, areas, types, projects)}
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
          <a class="btn btn-primary" href="vacancy.html?sido={esc(r)}">공실 등록하기</a>
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
    'home': '2026-11-26', 'about': '2026-11-26', 'brands': '2026-10-20', 'community': '2026-10-11', 'books': '2026-10-11',
    'cases': '2026-10-11', 'services': '2026-10-20', 'portfolio': '2026-10-20', 'references': '2026-10-11',
    'media': '2026-10-11', 'contact': '2026-10-26', 'socialfactory': '2026-10-20', 'insights': '2026-10-11',
    'faq': '2026-10-11', 'glossary': '2026-11-26', 'privacy': '2026-11-18', 'terms': '2026-10-11', 'network': '2026-11-26',
    'partnership': '2026-11-26', 'vacancy': '2026-11-26', 'mediakit': '2026-11-26',
}
DATA_DATE = (PF or {}).get('meta', {}).get('source', '')
DATA_DATE = re.search(r'(\d{4}-\d{2}-\d{2})', DATA_DATE).group(1) if re.search(r'\d{4}-\d{2}-\d{2}', DATA_DATE) else '2026-10-11'


def page_date(p):
    if p.get('article'):
        return p['article']['updated']
    if p['key'].startswith('region-'):
        return max(DATA_DATE, '2026-11-26')
    if p.get('topic'):
        arts = [a for a in INSIGHTS if a['category'] == p['topic']['cat']]
        return max(['2026-11-26'] + [a['updated'] for a in arts] + [a['date'] for a in arts])
    base = CONTENT_DATES.get(p['key'], '2026-09-07')
    # 최신 글 목록을 보여주는 페이지는 새 글이 올라온 날 함께 바뀐다
    if p['key'] in ('insights', 'home', 'media') and INSIGHTS:
        return max(base, INSIGHTS[0]['updated'], INSIGHTS[0]['date'])
    return base


def build_sitemap():
    prio = {'home': '1.0', 'about': '0.9', 'portfolio': '0.9', 'cases': '0.9', 'services': '0.9', 'contact': '0.8', 'vacancy': '0.9',
            'partnership': '0.8', 'mediakit': '0.8',
            'brands': '0.8', 'socialfactory': '0.8', 'insights': '0.9', 'faq': '0.8', 'glossary': '0.7'}
    urls = []
    for p in indexable():
        pr = prio.get(p['key'], '0.8' if p['key'].startswith(('insight-', 'topic-')) else ('0.7' if p['key'].startswith('region-') else '0.6'))
        extra = ''
        if p['key'] in ('home', 'media'):
            extra = (f"\n    <video:video><video:thumbnail_loc>{DOMAIN}/assets/video/showreel-poster.jpg</video:thumbnail_loc>"
                     f"<video:title>최시준 쇼릴 2026</video:title><video:description>{esc(VIDEO['description'])}</video:description>"
                     f"<video:content_loc>{DOMAIN}/assets/video/showreel-2026-1080.mp4</video:content_loc>"
                     f"<video:duration>15</video:duration><video:publication_date>2026-10-10T09:00:00+09:00</video:publication_date>"
                     f"<video:family_friendly>yes</video:family_friendly></video:video>")
        img = og_image(p)
        if not img.endswith('/assets/og-image.jpg'):
            extra += f"\n    <image:image><image:loc>{img}</image:loc></image:image>"
        if p['key'] in ('about', 'mediakit'):
            extra += f"\n    <image:image><image:loc>{DOMAIN}/assets/profile.jpg</image:loc></image:image>"
        urls.append(f"  <url><loc>{page_url(p['file'])}</loc><lastmod>{page_date(p)}</lastmod><priority>{pr}</priority>{extra}</url>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
           'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
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
        elif page.get('topic'):
            body = topic_body(page)
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
    build_family_sync()
    if VERIFY:
        print('검색엔진 소유확인 태그:', ', '.join(VERIFY))


if __name__ == "__main__":
    build()
