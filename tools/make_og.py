"""페이지별 공유 이미지(1200x630) 생성: 빌드된 HTML의 h1/eyebrow를 읽어 assets/og/<key>.jpg 로 저장

사용법 (저장소 맨 위 폴더에서):
  python3 gen.py && python3 tools/make_og.py && python3 gen.py
  - 기본: 아직 이미지가 없는 인사이트 글만 만든다 (매일 발행용)
  - --all : 모든 페이지 이미지를 다시 만든다
이미지가 없으면 기본 공유 이미지(assets/og-image.jpg)가 쓰이므로, 이 단계가 실패해도 발행은 할 수 있다.
"""
import os, re, sys, html, glob
try:
    from PIL import Image, ImageDraw, ImageFont
    from fontTools.ttLib import TTCollection
except ImportError:
    print('[make_og] Pillow/fontTools 가 없어 건너뜁니다 (pip install pillow fonttools)')
    sys.exit(0)

ALL = '--all' in sys.argv
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs('assets/og', exist_ok=True)

def kr_index(path):
    for i, f in enumerate(TTCollection(path).fonts):
        if 'KR' in f['name'].getDebugName(1):
            return i
    return 1
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
MED = '/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc'
if not (os.path.exists(BOLD) and os.path.exists(MED)):
    print('[make_og] Noto CJK 글꼴이 없어 건너뜁니다 (fonts-noto-cjk)')
    sys.exit(0)
BI, MI = kr_index(BOLD), kr_index(MED)
def F(sz, bold=True):
    return ImageFont.truetype(BOLD if bold else MED, sz, index=BI if bold else MI)

PAPER, INK, GREY, SIGNAL, LINE = '#F8F7F4', '#151515', '#616160', '#FF4712', '#E4E2DB'
prof = Image.open('assets/profile-240.jpg').convert('RGB').resize((132, 132), Image.LANCZOS)
mask = Image.new('L', (132 * 4, 132 * 4), 0)
ImageDraw.Draw(mask).ellipse((0, 0, 132 * 4 - 1, 132 * 4 - 1), fill=255)
mask = mask.resize((132, 132), Image.LANCZOS)

def wrap(draw, text, font, maxw):
    words, lines, cur = text.split(' '), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
            while draw.textlength(cur, font=font) > maxw:   # 아주 긴 단어
                k = len(cur)
                while draw.textlength(cur[:k], font=font) > maxw:
                    k -= 1
                lines.append(cur[:k]); cur = cur[k:]
    if cur:
        lines.append(cur)
    return lines

def make(key, eyebrow, title, out):
    im = Image.new('RGB', (1200, 630), PAPER)
    d = ImageDraw.Draw(im)
    for x in range(0, 1200, 40):
        d.line([(x, 0), (x, 630)], fill='#F1F0EC')
    for y in range(0, 630, 40):
        d.line([(0, y), (1200, y)], fill='#F1F0EC')
    # 로고
    d.rectangle((72, 66, 96, 90), fill=INK); d.rectangle((90, 66, 96, 90), fill=SIGNAL)
    d.text((110, 62), 'CHOI SIJUN', font=F(26), fill=INK)
    d.text((72, 124), eyebrow, font=F(26, False), fill='#C2380C')
    # 제목
    maxw = 860
    for sz in (68, 62, 56, 50, 46):
        font = F(sz); lines = wrap(d, title, font, maxw)
        if len(lines) <= 3:
            break
    lines = lines[:3]
    y = 178
    for ln in lines:
        d.text((72, y), ln, font=font, fill=INK); y += int(sz * 1.32)
    # 프로필
    im.paste(prof, (996, 60), mask)
    # 하단
    d.line([(72, 520), (1128, 520)], fill=LINE, width=2)
    d.text((72, 540), '최시준 · 공실개발 · 공간수익화 · 10년+ 340개+ 공간', font=F(24, False), fill=GREY)
    w = d.textlength('choisijun.com', font=F(24))
    d.text((1128 - w, 540), 'choisijun.com', font=F(24), fill=INK)
    d.rectangle((0, 618, 1200, 630), fill=SIGNAL)
    im.save(out, quality=86, optimize=True, progressive=True)

def text_of(s):
    return html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<br\s*/?>', ' ', s))).strip()

files = [f for f in glob.glob('*.html') + glob.glob('insights/*.html') if f not in ('index.html', '404.html')]
if not ALL:
    files = [f for f in glob.glob('insights/*.html')
             if not os.path.exists('assets/og/insight-' + os.path.basename(f)[:-5] + '.jpg')]
for f in sorted(files):
    s = open(f, encoding='utf-8').read()
    m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    e = re.search(r'<p class="eyebrow[^"]*">(.*?)</p>', s, re.S)
    if not m:
        continue
    name = os.path.basename(f)[:-5]
    if f.startswith('insights/'):
        key = 'insight-' + name
    elif name.startswith('portfolio-'):
        key = 'region-' + name[len('portfolio-'):]
    else:
        key = name
    make(key, text_of(e.group(1)) if e else 'CHOI SIJUN', re.sub(r'\s+', ' ', text_of(m.group(1))), f'assets/og/{key}.jpg')
    print('og', key)
