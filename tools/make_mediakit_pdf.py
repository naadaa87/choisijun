"""미디어 키트 프로필 PDF 만들기 — data/mediakit.json 을 읽어 assets/media-kit/choisijun-profile.pdf 를 만든다.
실행: python3 tools/make_mediakit_pdf.py  (Playwright + Chromium 필요)
"""
import html, json, os, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = json.loads((ROOT / 'data' / 'mediakit.json').read_text(encoding='utf-8'))
e = lambda s: html.escape(str(s), quote=True)
prof = {p['key']: p for p in D['profiles']}
photo = (ROOT / 'assets' / 'profile-640.jpg').as_uri()

topics = ''.join(f'''<div class="tp"><b>{i:02d}</b><h4>{e(t['title'])}</h4><p class="sub">{e(t['sub'])}</p><p>{e(t['text'])}</p><p class="who">대상 · {e(t['who'])}</p></div>'''
                 for i, t in enumerate(D['topics'], 1))
stats = ''.join(f'<div><strong>{e(n)}</strong><span>{e(l)}</span></div>' for n, l in D['stats'])
naming = ''.join(f'<tr><th>{e(k)}</th><td>{e(v)}</td></tr>' for k, v in D['naming'])
li = lambda xs: ''.join(f'<li>{e(x)}</li>' for x in xs)
long_txt = ''.join(f'<p>{e(x)}</p>' for x in prof['long']['text'].split('\n\n'))
c = D['contact']

doc = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif; color: #121212; font-size: 9.6pt; line-height: 1.6; }}
.page {{ width: 210mm; height: 297mm; padding: 14mm 16mm 12mm; position: relative; page-break-after: always; background: #fff; }}
.page:last-child {{ page-break-after: auto; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; padding-bottom: 5mm; border-bottom: 2.5pt solid #FF4712; }}
.eyebrow {{ font-size: 7.6pt; letter-spacing: .14em; color: #FF4712; font-weight: 700; margin: 0 0 3mm; }}
h1 {{ font-size: 30pt; margin: 0; letter-spacing: -.02em; line-height: 1.1; }}
.en {{ font-size: 9pt; letter-spacing: .12em; color: #616160; margin: 1.5mm 0 3mm; }}
.title {{ font-size: 11pt; font-weight: 700; margin: 0; }}
.field {{ font-size: 10pt; color: #FF4712; font-weight: 700; margin: 1mm 0 0; }}
.top img {{ width: 36mm; height: 36mm; object-fit: cover; border-radius: 2mm; }}
h3 {{ font-size: 8pt; letter-spacing: .12em; color: #FF4712; margin: 5mm 0 2mm; font-weight: 700; }}
.lead {{ font-size: 10.2pt; line-height: 1.7; margin: 0; }}
.cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }}
ul {{ margin: 0; padding-left: 4.5mm; }} li {{ margin: .6mm 0; }}
.box {{ background: #F8F7F4; border-radius: 2mm; padding: 3mm 4.5mm; }}
.box p.k {{ font-size: 7.6pt; letter-spacing: .08em; color: #616160; font-weight: 700; margin: 0 0 1mm; }}
.stats {{ display: grid; grid-template-columns: repeat(4, 1fr); border: .6pt solid #E4E2DB; border-radius: 2mm; }}
.stats div {{ padding: 2.6mm 4mm; border-right: .6pt solid #E4E2DB; }} .stats div:last-child {{ border-right: 0; }}
.stats strong {{ display: block; font-size: 17pt; line-height: 1.1; }} .stats span {{ font-size: 8pt; color: #616160; }}
.rec {{ margin-top: 3mm; display: grid; grid-template-columns: 22mm 1fr; gap: 1.5mm 4mm; font-size: 9pt; }}
.rec b {{ color: #616160; font-size: 8pt; }}
.note {{ font-size: 7.4pt; color: #8a8a86; margin-top: 2mm; }}
.long p {{ margin: 0 0 2.5mm; line-height: 1.75; }}
.tps {{ display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }}
.tp {{ border: .6pt solid #E4E2DB; border-radius: 2mm; padding: 3.4mm 4mm; }}
.tp b {{ font-size: 7.4pt; color: #FF4712; letter-spacing: .1em; }}
.tp h4 {{ font-size: 10.4pt; margin: .5mm 0 0; line-height: 1.35; }}
.tp .sub {{ color: #FF4712; font-weight: 700; font-size: 8.4pt; margin: .5mm 0 1mm; }}
.tp p {{ margin: 0; font-size: 8.6pt; line-height: 1.55; }}
.tp .who {{ color: #616160; font-size: 7.8pt; margin-top: 1.5mm; }}
table {{ width: 100%; border-collapse: collapse; font-size: 8.6pt; }}
th {{ text-align: left; width: 22mm; font-size: 8.2pt; color: #FF4712; font-weight: 700; vertical-align: top; padding: 1.1mm 0; }}
td {{ padding: 1.1mm 0; border-bottom: .5pt solid #EFEDE7; }}
.foot {{ position: absolute; left: 16mm; right: 16mm; bottom: 10mm; display: flex; justify-content: space-between; align-items: center; background: #121212; color: #fff; border-radius: 2mm; padding: 3.2mm 5mm; font-size: 9pt; }}
.foot b {{ color: #FF4712; letter-spacing: .1em; font-size: 7.6pt; display: block; }}
.pg {{ position: absolute; right: 16mm; top: 8mm; font-size: 7pt; color: #A5A5A0; letter-spacing: .1em; }}
</style></head><body>
<section class="page"><span class="pg">CHOI SIJUN · MEDIA KIT · {e(D['updated'])}</span>
  <div class="top"><div><p class="eyebrow">PROFILE</p><h1>{e(D['name'])}</h1><p class="en">{e(D['name_en']).upper()}</p>
    <p class="title">{e(D['title'])}</p><p class="field">{e(D['field'])}</p></div><img src="{photo}" alt=""></div>
  <h3>소개</h3><p class="lead">{e(prof['base']['text'])}</p>
  <h3>경력</h3><div class="cols"><div class="box"><p class="k">현재</p><ul>{li(D['career_now'])}</ul></div><div class="box"><p class="k">이전</p><ul>{li(D['career_before'])}</ul></div></div>
  <h3>강의 · 출연</h3><div class="stats">{stats}</div>
  <div class="rec"><b>기업 · 기관</b><span>{e(' · '.join(D['orgs']))}</span><b>대학</b><span>{e(' · '.join(D['schools']))}</span>
    <b>방송 · 언론</b><span>{e(' · '.join(D['media']))}</span><b>무대</b><span>TEDxCAU 연사</span></div>
  <p class="note">* 숫자는 자사 집계 기준입니다.</p>
  <h3 style="margin-top:4mm">표기 안내</h3><table>{naming}</table>
  <div class="foot"><div><b>CONTACT</b>{e(c['email'])} · {e(c['phone'])}</div><div style="text-align:right"><b>WEB</b>choisijun.com/mediakit</div></div>
</section>
<section class="page"><span class="pg">CHOI SIJUN · MEDIA KIT · {e(D['updated'])}</span>
  <h3 style="margin-top:2mm">긴 소개 — 보도자료 · 연사 소개용</h3><div class="long">{long_txt}</div>
  <h3>강연 · 인터뷰 주제</h3><div class="tps">{topics}</div>
  <p class="note" style="margin-top:2.5mm">형식: {e(' · '.join(D['formats']))} — 대상과 일정에 맞춰 내용을 다시 구성합니다.</p>
  <div class="foot"><div><b>강연 · 인터뷰 요청</b>choisijun.com/partnership · {e(c['email'])}</div><div style="text-align:right"><b>사진 · 최신 자료</b>choisijun.com/mediakit</div></div>
</section></body></html>'''

out = ROOT / D['pdf']
out.parent.mkdir(parents=True, exist_ok=True)
tmp = ROOT / 'tools' / '_mediakit_print.html'
tmp.write_text(doc, encoding='utf-8')
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(tmp.as_uri())
        pg.wait_for_timeout(400)
        pg.pdf(path=str(out), format='A4', print_background=True, margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        b.close()
finally:
    tmp.unlink(missing_ok=True)
print('saved', out.relative_to(ROOT), out.stat().st_size // 1024, 'KB')
