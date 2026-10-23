# -*- coding: utf-8 -*-
"""인사이트 원고 점검기 — 매일 발행 전에 반드시 돌린다.

사용법:  python3 tools/check_post.py content/insights/<slug>.md
         python3 tools/check_post.py content/drafts/<slug>.md    (예약 초안)
         python3 tools/check_post.py --all          (발행된 모든 원고)

FAIL  : 고치기 전에는 발행하지 않는다 (종료 코드 1)
WARN  : 문장을 다시 읽고 판단한다 (의도한 표현이면 그대로 둬도 된다)
규칙의 자세한 설명은 content/plan/GUIDE.md 에 있다.
"""
import io, os, re, sys, glob, html
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "content", "insights")
DRAFTS = os.path.join(ROOT, "content", "drafts")
KST = timezone(timedelta(hours=9))


def categories():
    src = io.open(os.path.join(ROOT, "gen.py"), encoding="utf-8").read()
    m = re.search(r"CATEGORY_ORDER\s*=\s*\[(.*?)\]", src, re.S)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def page_names():
    names = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(ROOT, "*.html"))}
    names.discard("index")
    return names


def parse(path):
    raw = io.open(path, encoding="utf-8-sig").read()
    if "\n---" not in raw:
        return None, raw
    head, body = raw.split("\n---", 1)
    meta = {}
    for ln in head.splitlines():
        if ":" in ln and not ln.startswith("#"):
            k, v = ln.split(":", 1)
            meta[k.strip().lower()] = v.strip()
    return meta, body.strip()


def plain(md):
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md)
    t = re.sub(r"^#{2,3}\s+", "", t, flags=re.M)
    t = re.sub(r"[*>`]", "", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


# --- 금지 · 주의 표현 -------------------------------------------------
FAIL_TERMS = [
    (r"소자본\s*창업\s*전문가", "쓰지 않기로 한 표현"),
    (r"자능사", "홈페이지에서 뺀 용어"),
    (r"워블\s*라운지|워크샵\s*라운지", "홈페이지에서 뺀 공간"),
    (r"소셜패밀리", "과거 법인명 — 매일 글에서는 쓰지 않는다"),
    (r"쏘플(?!파티룸)", "브랜드는 항상 '쏘플파티룸'으로 쓴다"),
    (r"확인이?\s*안\s*된|확인되지\s*않은|검토\s*필요|확인\s*필요|미확정", "유보 표현 금지 — 확실한 것만 쓴다"),
]
MONEY = [
    (r"\d[\d,.]*\s*(?:조|억|천만|백만|십만|만|천)\s*원", "금액"),
    (r"\d[\d,.]*\s*억", "억 단위 숫자"),
    (r"(?:매출|영업이익|순이익|당기순이익|손익|투자금|투자\s*유치|정산금|수수료|월세|임대료|보증금|권리금)[^.\n]{0,12}\d", "재무·계약 숫자"),
]
PRIVATE = [
    (r"0\d{1,2}-\d{3,4}-\d{4}|\b1[5-9]\d{2}-\d{4}\b", "전화번호"),
    (r"[\w.+-]+@[\w-]+\.[\w.]+", "이메일 주소"),
    (r"[가-힣]+(?:로|길)\d+", "도로명 주소"),
    (r"\d+(?:-\d+)?\s*번지", "지번 주소"),
    (r"\d+\s*동\s*\d+\s*호", "동·호수"),
]
WARN_TERMS = [
    (r"\d+\s*호(?![점선기차실])", "호수로 읽힐 수 있음"),
    (r"직영|가맹|위탁|프랜차이즈|폐업|휴업|문을\s*닫", "공간별 운영방식·운영상태를 적지 않았는지"),
    (r"[가-힣]{2,4}\s?(?:대표님|이사님|팀장|실장|매니저|점주님|원장님|교수님|선생님|씨\b)", "본인 외 사람 이름이 들어갔는지"),
    (r"최고의|업계\s*최초|국내\s*최초|압도적|혁신적|획기적|무조건|반드시\s*성공|대박|폭발적|놀라운|완벽한", "과장 표현"),
    (r"결론적으로|요약하자면|정리하자면|살펴보겠습니다|알아보겠습니다|이\s*글에서는|마무리하며|시사하는\s*바|중요한\s*역할|여러분|함께\s*알아|에\s*대해\s*이야기해", "상투적인 표현"),
    (r"다양한|효과적(?:인|으로)|극대화|최적화|시너지", "흔한 상투어 — 구체적인 말로 바꿀 수 있는지"),
    (r"!", "느낌표"),
    (r"추정|것으로\s*보입니다|것\s*같습니다", "흐린 표현"),
]
ALLOWED_EXT = ("choisijun.com", "ssople.com", "playtion.kr", "socialfactory.co.kr", "megaspot.kr", "hellomingle.kr",
               "vacancy.co.kr", "coremood.kr", "orbis-estate.com", "tgrzspace.pages.dev", "yeodeol.kr",
               "myworkspro.pages.dev", "go.kr", "or.kr", "reb.or.kr", "kostat.go.kr", "threads.com", "instagram.com")


def check(path, pages, cats, all_meta, drafts_meta=None):
    fails, warns = [], []
    fn = os.path.basename(path)
    slug = fn[:-3]
    meta, body = parse(path)
    if meta is None:
        return [f"머리말과 본문을 나누는 --- 줄이 없습니다"], []
    # 예약 초안은 자기보다 먼저 발행될 초안도 '있는 글'로 본다
    if os.path.abspath(os.path.dirname(path)) == os.path.abspath(DRAFTS) and drafts_meta:
        mine = meta.get("date", "")
        known = dict(all_meta)
        for k, m in drafts_meta.items():
            if m and k != slug and m.get("date", "") <= mine:
                known[k] = m
        all_meta = known
    elif slug in all_meta and os.path.exists(os.path.join(DRAFTS, fn)):
        fails.append("같은 이름의 초안이 content/drafts 에 남아 있습니다 — 발행했다면 초안을 지웁니다")
    for need in ("title", "description", "date", "category", "keywords", "summary", "related"):
        if not meta.get(need):
            fails.append(f"머리말에 {need}: 가 없습니다")
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        fails.append("파일 이름은 영문 소문자·숫자·하이픈만")
    d = meta.get("date", "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        fails.append("date 형식은 2026-10-24")
    elif d > datetime.now(KST).strftime("%Y-%m-%d"):
        warns.append(f"date({d})가 오늘(한국 시간)보다 뒤입니다")
    if meta.get("category") and meta["category"] not in cats:
        fails.append(f"category '{meta['category']}' 는 목록에 없습니다: {', '.join(cats)}")
    t = meta.get("title", "")
    if len(t) > 48:
        warns.append(f"제목이 깁니다({len(t)}자) — 40자 안팎 권장")
    dl = len(meta.get("description", ""))
    if dl and not 60 <= dl <= 170:
        warns.append(f"description 길이 {dl}자 — 60~170자 권장")
    for other, om in all_meta.items():
        if other != slug and om and om.get("title") == t:
            fails.append(f"같은 제목의 글이 이미 있습니다: {other}")
    for r in [x.strip() for x in meta.get("related", "").split(",") if x.strip()]:
        if r == slug or r not in all_meta:
            fails.append(f"related 의 '{r}' 글이 없습니다")

    text = plain(body)
    n = len(text)
    if n < 1500:
        fails.append(f"본문이 짧습니다({n}자) — 1,800자 이상")
    elif n < 1800:
        warns.append(f"본문 {n}자 — 1,800~3,000자 권장")
    elif n > 4200:
        warns.append(f"본문 {n}자 — 너무 길면 두 편으로 나눈다")
    h2 = len(re.findall(r"^## ", body, flags=re.M))
    if h2 < 3:
        warns.append(f"소제목(##)이 {h2}개 — 3개 이상 권장")

    links = re.findall(r"\[([^\]]+)\]\(([^)\s]+)\)", body)
    internal = [u for _, u in links if u.startswith("/")]
    if len(internal) < 2:
        warns.append(f"홈페이지 안쪽 링크가 {len(internal)}개 — 2개 이상 권장")
    for u in internal:
        p = u.split("#")[0].split("?")[0].rstrip("/")
        if p.startswith("/insights/"):
            if p[len("/insights/"):] not in all_meta:
                fails.append(f"없는 글로 가는 링크: {u}")
        elif p and p != "/insights" and p.lstrip("/") not in pages:
            fails.append(f"없는 페이지로 가는 링크: {u}")
    for _, u in links:
        if u.startswith("http"):
            host = re.sub(r"^https?://", "", u).split("/")[0].lower()
            if not any(host == a or host.endswith("." + a) or host.endswith(a) for a in ALLOWED_EXT):
                warns.append(f"바깥 링크 확인: {u} (공식 사이트·공공 통계인지)")
        elif not u.startswith("/"):
            fails.append(f"링크는 /about 처럼 / 로 시작하거나 https:// 로 시작해야 합니다: {u}")

    for rx, why in FAIL_TERMS + MONEY + PRIVATE:
        for m in re.finditer(rx, t + "\n" + meta.get("description", "") + "\n" + body):
            fails.append(f"{why}: '{m.group(0)}'")
    for rx, why in WARN_TERMS:
        hits = sorted({m.group(0) for m in re.finditer(rx, body)})
        if hits:
            warns.append(f"{why}: {', '.join(hits[:6])}")
    dash = body.count("—")
    if dash > 4:
        warns.append(f"본문에 줄표(—)가 {dash}개 — 쉼표나 문장 나누기로 바꿀 수 있는지")
    ends = re.findall(r"(수 있습니다|것입니다|중요합니다)", text)
    if len(ends) > 6:
        warns.append(f"'수 있습니다/것입니다/중요합니다'로 끝나는 문장이 {len(ends)}개 — 단정형으로 줄이기")
    return fails, warns


def main(argv):
    cats, pages = categories(), page_names()
    files = sorted(glob.glob(os.path.join(SRC, "*.md")))
    all_meta = {os.path.basename(f)[:-3]: parse(f)[0] for f in files}
    dfiles = sorted(glob.glob(os.path.join(DRAFTS, "*.md")))
    drafts_meta = {os.path.basename(f)[:-3]: parse(f)[0] for f in dfiles}
    for k in drafts_meta:
        if k in all_meta:
            print(f"[주의] {k} 는 이미 발행된 글과 이름이 같습니다 (content/drafts/{k}.md)")
    targets = files if "--all" in argv else [a for a in argv if a.endswith(".md")]
    if not targets:
        print(__doc__)
        return 2
    bad = 0
    for path in targets:
        if not os.path.exists(path):
            print(f"[없음] {path}")
            bad += 1
            continue
        fails, warns = check(path, pages, cats, all_meta, drafts_meta)
        print(f"\n== {os.path.relpath(path, ROOT)}")
        for f in fails:
            print("  FAIL ", f)
        for w in warns:
            print("  WARN ", w)
        if not fails and not warns:
            print("  OK")
        bad += 1 if fails else 0
    print(f"\n결과: FAIL 있는 원고 {bad}개")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
