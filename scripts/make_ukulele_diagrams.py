#!/usr/bin/env python3
"""Generate the ukulele course diagrams (SVG) into assets/ukulele/.

Everything is drawn from code so the figures can be regenerated when the text
changes. Palette follows the site's wood tones. Run:

    python scripts/make_ukulele_diagrams.py

Figures
  sizes.svg          four body sizes drawn to relative scale
  anatomy.svg        body / neck / head parts, labelled
  tuning.svg         headstock + G-C-E-A, High-G vs Low-G pitch lines
  chords_cafg.svg    C / Am / F / G7 chord grids from _chord_library.js
  strum_folk.svg     folk-rock 4/4 strumming grid
  fretboard.svg      notes 0-12 fret on G-C-E-A
"""
from __future__ import annotations

import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "assets" / "ukulele"
LIB = BASE / "scripts" / "_chord_library.js"

INK = "#3a3128"
LINE = "#c9bba6"
WOOD = "#C4956A"
WOOD_D = "#A67C52"
PAPER = "#fdfbf7"
MUTED = "#9C8F87"

FONT = 'font-family="system-ui, -apple-system, Segoe UI, sans-serif"'


def svg(w: int, h: int, body: str, title: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>'
            f'<rect width="{w}" height="{h}" fill="{PAPER}"/>' + body + "</svg>\n")


# ---------------------------------------------------------------- sizes
def sizes() -> str:
    specs = [("Soprano", "21 吋", 21, "清脆、琴格窄"),
             ("Concert", "23 吋", 23, "平衡、最推薦"),
             ("Tenor", "26 吋", 26, "音量大、低頻好"),
             ("Baritone", "30 吋", 30, "低沉 · D-G-B-E")]
    w, h = 760, 400
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>四種尺寸（同一比例，直立擺放）</text>']
    base = 310
    for i, (name, label, inch, note) in enumerate(specs):
        sc = inch / 21.0
        x = 110 + i * 170
        r1, r2 = 40 * sc, 30 * sc
        y_low = base - r1
        y_up = y_low - (r1 + r2) * 0.85
        p.append(f'<circle cx="{x}" cy="{y_low:.0f}" r="{r1:.0f}" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.4"/>')
        p.append(f'<circle cx="{x}" cy="{y_up:.0f}" r="{r2:.0f}" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.4"/>')
        neck_bottom = y_up - r2
        neck_h = 55 * sc
        p.append(f'<rect x="{x-5*sc:.0f}" y="{neck_bottom-neck_h:.0f}" width="{10*sc:.0f}" height="{neck_h:.0f}" '
                 f'fill="{WOOD_D}" opacity="0.9"/>')
        p.append(f'<rect x="{x-13*sc:.0f}" y="{neck_bottom-neck_h-28*sc:.0f}" width="{26*sc:.0f}" height="{30*sc:.0f}" '
                 f'rx="{6*sc:.0f}" fill="{WOOD_D}"/>')
        p.append(f'<circle cx="{x}" cy="{y_low - r1*0.1:.0f}" r="{5*sc:.0f}" fill="{PAPER}" stroke="{LINE}"/>')
        p.append(f'<text x="{x}" y="{base+22}" font-size="12.5" text-anchor="middle" fill="{INK}" {FONT}>{name}</text>')
        p.append(f'<text x="{x}" y="{base+38}" font-size="11" text-anchor="middle" fill="{MUTED}" {FONT}>{label}</text>')
        p.append(f'<text x="{x}" y="{base+52}" font-size="10" text-anchor="middle" fill="{MUTED}" {FONT}>{note}</text>')
    p.append(f'<text x="24" y="384" font-size="11" fill="{MUTED}" {FONT}>'
             f'前三种（21／23／26 吋）調音相同：G-C-E-A；30 吋 Baritone 是 D-G-B-E。</text>')
    return svg(w, h, "".join(p), "烏克麗麗四種尺寸比較")


# ---------------------------------------------------------------- anatomy
def anatomy() -> str:
    w, h = 760, 320
    p = []
    p.append(f'<text x="24" y="30" font-size="14" fill="{INK}" {FONT}>全琴構造</text>')
    # 琴身
    p.append(f'<path d="M 120 250 c -52 0 -52 -78 0 -94 c 30 -10 52 -28 52 -44 '
             f'c 0 -18 34 -18 34 0 c 0 16 22 34 52 44 c 52 16 52 94 0 94 z" '
             f'fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.5"/>')
    p.append(f'<circle cx="187" cy="205" r="17" fill="{PAPER}" stroke="{LINE}" stroke-width="1.2"/>')
    p.append(f'<text x="187" y="209" font-size="9" text-anchor="middle" fill="{MUTED}" {FONT}>音孔</text>')
    p.append(f'<rect x="196" y="196" width="10" height="30" fill="{WOOD_D}"/>')  # 琴橋
    p.append(f'<rect x="187" y="89" width="34" height="14" fill="{WOOD_D}" opacity="0.9"/>')  # 上弦枕
    p.append(f'<rect x="196" y="103" width="16" height="104" fill="{WOOD_D}" opacity="0.75"/>')  # 琴頸
    for i in range(9):  # 琴格
        y = 118 + i * 11
        p.append(f'<line x1="196" y1="{y}" x2="212" y2="{y}" stroke="{INK}" stroke-width="0.9" opacity="0.45"/>')
    p.append(f'<rect x="195" y="52" width="18" height="38" rx="6" fill="{WOOD_D}"/>')  # 琴頭
    for i in range(4):
        p.append(f'<circle cx="{191 if i % 2 == 0 else 217}" cy="{60 + i * 9}" r="3" fill="{PAPER}" stroke="{LINE}"/>')
    # 四條弦
    for i in range(4):
        x = 198 + i * 4
        p.append(f'<line x1="{x}" y1="60" x2="{x}" y2="226" stroke="{INK}" stroke-width="0.8" opacity="0.55"/>')
    labels = [
        (236, 84, "琴頭 Headstock：裝弦鈕，調音的地方"),
        (236, 108, "上弦枕 Nut：決定有效弦長的起點"),
        (236, 150, "琴頸 Neck／琴格 Fret：左手按弦的位置"),
        (236, 205, "琴橋 Saddle：弦振動的終點，影響延音"),
        (236, 244, "琴身 Body：面板決定音色與音量"),
    ]
    for x, y, text in labels:
        p.append(f'<line x1="{x-8}" y1="{y-4}" x2="{x+4}" y2="{y-4}" stroke="{LINE}"/>')
        p.append(f'<text x="{x+8}" y="{y}" font-size="12" fill="{INK}" {FONT}>{text}</text>')
    p.append(f'<text x="24" y="300" font-size="11" fill="{MUTED}" {FONT}>'
             f'買琴時看三處：上弦枕的高度（太高會難按）、琴格邊緣是否刮手、琴橋有沒有翹起。</text>')
    return svg(w, h, "".join(p), "烏克麗麗構造圖")


# ---------------------------------------------------------------- tuning
def tuning() -> str:
    w, h = 720, 330
    p = [f'<text x="24" y="30" font-size="14" fill="{INK}" {FONT}>標準調音 G-C-E-A</text>']
    # 頻率線：越高越上面
    base_y, span = 260, 170
    def y_of(hz):
        import math
        lo, hi = 380, 480
        return base_y - (math.log2(hz / lo) / math.log2(hi / lo)) * span
    notes = [("G4", 392.0, "第 4 弦"), ("C4", 261.6, "第 3 弦"), ("E4", 329.6, "第 2 弦"), ("A4", 440.0, "第 1 弦")]
    for i, (name, hz, which) in enumerate(notes):
        x = 110 + i * 130
        y = y_of(max(hz, 380))
        p.append(f'<line x1="60" y1="{y:.0f}" x2="640" y2="{y:.0f}" stroke="{LINE}" stroke-dasharray="3 4"/>')
        p.append(f'<circle cx="{x}" cy="{y:.0f}" r="9" fill="{WOOD}"/>')
        p.append(f'<text x="{x}" y="{y-16:.0f}" font-size="14" text-anchor="middle" fill="{INK}" {FONT}>{name}</text>')
        p.append(f'<text x="{x}" y="{base_y+24}" font-size="11.5" text-anchor="middle" fill="{MUTED}" {FONT}>{which}</text>')
        p.append(f'<text x="{x}" y="{base_y+40}" font-size="10.5" text-anchor="middle" fill="{MUTED}" {FONT}>{hz:.0f} Hz</text>')
    # Low-G 對照
    yg = y_of(196.0)
    p.append(f'<line x1="60" y1="{yg:.0f}" x2="640" y2="{yg:.0f}" stroke="{WOOD_D}" stroke-dasharray="5 5"/>')
    p.append(f'<circle cx="110" cy="{yg:.0f}" r="7" fill="none" stroke="{WOOD_D}" stroke-width="2"/>')
    p.append(f'<text x="122" y="{yg+4:.0f}" font-size="11" fill="{WOOD_D}" {FONT}>Low-G（第 4 弦換成低八度 G3，196 Hz）</text>')
    p.append(f'<text x="24" y="300" font-size="11.5" fill="{MUTED}" {FONT}>'
             f'High-G：第 4 弦（G4）比第 3 弦（C4）高，所以四條弦由低到高是 C→E→G→A，不是「愈左愈低」。</text>')
    return svg(w, h, "".join(p), "烏克麗麗調音音高圖")


# ---------------------------------------------------------------- chords
def _load_shapes() -> dict:
    text = LIB.read_text(encoding="utf-8")
    data = json.loads(text[text.find("{"): text.rfind("}") + 1])
    for inst in data.values():
        for tune_name, shapes in inst.items():
            if "GCEA" in tune_name or "高音" in tune_name:
                return shapes
    return {}


def chord_grid(x: int, y: int, frets: list[int], name: str, w: int = 92, h: int = 120) -> str:
    """4-string chord diagram: frets list from 4th string to 1st."""
    p = [f'<text x="{x + w/2}" y="{y - 8}" font-size="14" text-anchor="middle" fill="{INK}" {FONT}>{name}</text>']
    top, left = y + 18, x + 18
    gap = 18
    rows = 4
    for s in range(4):
        sx = left + s * gap
        p.append(f'<line x1="{sx}" y1="{top}" x2="{sx}" y2="{top + rows * 18}" stroke="{LINE}" stroke-width="1.2"/>')
    for r in range(rows + 1):
        ry = top + r * 18
        p.append(f'<line x1="{left}" y1="{ry}" x2="{left + 3 * gap}" y2="{ry}" '
                 f'stroke="{INK if r == 0 else LINE}" stroke-width="{2 if r == 0 else 1.2}"/>')
    for s, f in enumerate(reversed(frets)):
        sx = left + s * gap
        if f < 0:
            p.append(f'<text x="{sx}" y="{top - 5}" font-size="11" text-anchor="middle" fill="#c0392b">✕</text>')
        elif f == 0:
            p.append(f'<circle cx="{sx}" cy="{top - 8}" r="4" fill="none" stroke="{WOOD_D}" stroke-width="1.6"/>')
        else:
            ry = top + (min(f, rows) - 0.5) * 18
            p.append(f'<circle cx="{sx}" cy="{ry}" r="6.5" fill="{WOOD}"/>')
    return "".join(p)


def chords() -> str:
    shapes = _load_shapes()
    names = [("C", "0:maj"), ("Am", "9:m"), ("F", "5:maj"), ("G7", "7:7")]
    w, h = 520, 200
    p = [f'<text x="24" y="30" font-size="14" fill="{INK}" {FONT}>萬能四和弦（High-G GCEA）</text>']
    for i, (label, key) in enumerate(names):
        shape = shapes.get(key)
        if not shape:
            continue
        p.append(chord_grid(36 + i * 118, 70, shape["frets"], label))
    p.append(f'<text x="24" y="182" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'由左至右＝第 4 弦到第 1 弦；○ 空弦、✕ 不彈、實心點是手指位置。</text>')
    return svg(w, h, "".join(p), "烏克麗麗 C Am F G7 和弦圖")


# ---------------------------------------------------------------- strum grid
def strum_folk() -> str:
    w, h = 620, 210
    beats = ["1", "＋", "2", "＋", "3", "＋", "4", "＋"]
    strokes = ["↓", "", "↓", "↑", "↑", "", "↓", "↑"]
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>民謠搖滾（Folk Rock）4/4：↓　↓↑　↑↓↑</text>']
    x0, y0, cw = 40, 70, 68
    for i, (b, s) in enumerate(zip(beats, strokes)):
        x = x0 + i * cw
        strong = b.isdigit()
        p.append(f'<rect x="{x}" y="{y0}" width="{cw-6}" height="70" rx="6" '
                 f'fill="{"#f3ece2" if strong else PAPER}" stroke="{LINE}"/>')
        p.append(f'<text x="{x + (cw-6)/2}" y="{y0+20}" font-size="11" text-anchor="middle" '
                 f'fill="{MUTED}" {FONT}>{b}</text>')
        if s:
            p.append(f'<text x="{x + (cw-6)/2}" y="{y0+52}" font-size="22" text-anchor="middle" fill="{WOOD_D}" {FONT}>{s}</text>')
    p.append(f'<text x="24" y="{y0+96}" font-size="11.5" fill="{MUTED}" {FONT}>'
             f'「＋」是反拍（手往上的空檔）；空白的格子＝手繼續擺動但不碰弦（Air Strum）。</text>')
    p.append(f'<text x="24" y="{y0+116}" font-size="11.5" fill="{MUTED}" {FONT}>'
             f'每一小節固定 8 個動作，換和弦時手腕不要停。</text>')
    return svg(w, h, "".join(p), "民謠搖滾刷弦格子")


# ---------------------------------------------------------------- fretboard
def fretboard() -> str:
    w, h = 760, 250
    names = ["G", "C", "E", "A"]
    pcs = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    open_pc = [7, 0, 4, 9]
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>指板音名（0–12 格，High-G GCEA）</text>']
    x0, y0, col = 70, 70, 52
    labels = ["G", "C", "E", "A"]
    for s in range(4):
        y = y0 + s * 34
        p.append(f'<text x="{x0-26}" y="{y+4}" font-size="11" fill="{MUTED}" {FONT}>{labels[s]}</text>')
        p.append(f'<line x1="{x0-10}" y1="{y-14}" x2="{x0 + col * 13}" y2="{y-14}" stroke="{LINE}"/>')
        for f in range(13):
            x = x0 + f * col
            pc = (open_pc[s] + f) % 12
            name = [k for k, v in pcs.items() if v == pc][0]
            p.append(f'<text x="{x}" y="{y+4}" font-size="10.5" text-anchor="middle" fill="{INK}" {FONT}>{name}</text>')
    for f in range(14):
        x = x0 + f * col
        p.append(f'<line x1="{x}" y1="{y0-24}" x2="{x}" y2="{y0+3*34+16}" stroke="{LINE}" stroke-width="0.8"/>')
        p.append(f'<text x="{x}" y="{y0-30}" font-size="9" text-anchor="middle" fill="{MUTED}" {FONT}>{f}</text>')
    p.append(f'<text x="24" y="{h-18}" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'第 12 格是空弦的八度；第 5、7 格有記號點，可當把位參考。</text>')
    return svg(w, h, "".join(p), "烏克麗麗指板音名")



# ---------------------------------------------------------------- posture
def posture() -> str:
    w, h = 660, 320
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>持琴三點支撐（側面示意）</text>']
    # 軀幹（簡化）
    p.append(f'<rect x="96" y="70" width="118" height="196" rx="26" fill="#f6efe6" stroke="{LINE}"/>')
    p.append(f'<circle cx="155" cy="52" r="22" fill="#f6efe6" stroke="{LINE}"/>')
    # 琴（斜靠胸前）
    p.append(f'<g transform="translate(206,196) rotate(-22)">'
             f'<circle cx="0" cy="14" r="27" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.4"/>'
             f'<circle cx="0" cy="-12" r="20" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.4"/>'
             f'<rect x="-4" y="-82" width="8" height="52" fill="{WOOD_D}"/>'
             f'<rect x="-9" y="-100" width="18" height="20" rx="4" fill="{WOOD_D}"/></g>')
    # 三個支點：胸口、右前臂、左手虎口
    pts = [(150, 196, "① 胸口貼住琴背（只是靠著）"),
           (232, 246, "② 右前臂輕壓琴身右上緣"),
           (214, 118, "③ 左手虎口輕托琴頸，不要夾死")]
    for i, (x, y, text) in enumerate(pts):
        ly = 86 + i * 62
        p.append(f'<line x1="{x}" y1="{y}" x2="330" y2="{ly-4}" stroke="{LINE}" stroke-dasharray="3 3"/>')
        p.append(f'<circle cx="{x}" cy="{y}" r="10" fill="{WOOD_D}"/>')
        p.append(f'<text x="{x}" y="{y+4}" font-size="11" text-anchor="middle" fill="#fff" {FONT}>{["①","②","③"][i]}</text>')
        p.append(f'<text x="340" y="{ly}" font-size="12.5" fill="{INK}" {FONT}>{text}</text>')
    p.append(f'<text x="24" y="300" font-size="11" fill="{MUTED}" {FONT}>'
             f'三點都只是「靠著」，不要用力夾：右臂壓太緊面板會悶，虎口夾死換和弦會變慢。</text>')
    return svg(w, h, "".join(p), "持琴三點支撐")


# ---------------------------------------------------------------- waltz grids
def strum_waltz() -> str:
    w, h = 620, 300
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>3/4 與 6/8 的刷弦位置</text>']
    # 3/4
    p.append(f'<text x="24" y="62" font-size="12.5" fill="{INK}" {FONT}>3/4（華爾滋：強－弱－弱）</text>')
    for i, s_txt in enumerate(["↓", "↓ ↑", "↓ ↑"]):
        x = 40 + i * 120
        strong = i == 0
        p.append(f'<rect x="{x}" y="74" width="104" height="52" rx="6" fill="{"#f3ece2" if strong else PAPER}" stroke="{LINE}"/>')
        p.append(f'<text x="{x+52}" y="106" font-size="18" text-anchor="middle" fill="{WOOD_D}" {FONT}>{s_txt}</text>')
        p.append(f'<text x="{x+52}" y="120" font-size="10" text-anchor="middle" fill="{MUTED}" {FONT}>{i+1}</text>')
    # 6/8
    p.append(f'<text x="24" y="168" font-size="12.5" fill="{INK}" {FONT}>6/8（兩大拍，每大拍三下）</text>')
    for i in range(2):
        x = 40 + i * 250
        p.append(f'<rect x="{x}" y="180" width="234" height="52" rx="6" fill="{"#f3ece2" if i == 0 else PAPER}" stroke="{LINE}"/>')
        p.append(f'<text x="{x+117}" y="206" font-size="16" text-anchor="middle" fill="{WOOD_D}" {FONT}>↓　↓　↑</text>')
        p.append(f'<text x="{x+117}" y="222" font-size="10" text-anchor="middle" fill="{MUTED}" {FONT}>1 2 3{"　" if i == 0 else " 4 5 6"}</text>')
    p.append(f'<text x="24" y="268" font-size="11" fill="{MUTED}" {FONT}>'
             f'3/4 的第 1 拍要最飽滿；6/8 則是「兩大拍」的重音，不要把六下刷得一樣重。</text>')
    return svg(w, h, "".join(p), "三拍子刷弦位置")


# ---------------------------------------------------------------- chunk
def strum_chunk() -> str:
    w, h = 620, 220
    beats = ["1", "&", "2", "&", "3", "&", "4", "&"]
    strokes = ["↓", "↑", "X", "↑", "↓", "↑", "X", "↑"]
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>切音搖滾：下 切 上 上 切 上（X＝切音）</text>']
    x0, y0, cw = 40, 70, 68
    for i, (b, s_txt) in enumerate(zip(beats, strokes)):
        x = x0 + i * cw
        muted = s_txt == "X"
        strong = b.isdigit()
        p.append(f'<rect x="{x}" y="{y0}" width="{cw-6}" height="64" rx="6" '
                 f'fill="{"#f6e3d8" if muted else ("#f3ece2" if strong else PAPER)}" stroke="{LINE}"/>')
        p.append(f'<text x="{x+(cw-6)/2}" y="{y0+18}" font-size="10.5" text-anchor="middle" fill="{MUTED}" {FONT}>{b}</text>')
        p.append(f'<text x="{x+(cw-6)/2}" y="{y0+46}" font-size="20" text-anchor="middle" fill="{WOOD_D}" {FONT}>{s_txt}</text>')
    p.append(f'<text x="24" y="{y0+96}" font-size="11.5" fill="{MUTED}" {FONT}>'
             f'「X」用小指側肉墊輕觸弦、同時指甲撞下去，做出短促的「嚓」，不是拍面板。</text>')
    return svg(w, h, "".join(p), "切音搖滾節奏")


# ---------------------------------------------------------------- barre
def barre() -> str:
    shapes = _load_shapes()
    w, h = 400, 200
    p = [f'<text x="24" y="30" font-size="14" fill="{INK}" {FONT}>封閉和弦：F 與 Bb（食指橫壓）</text>']
    for i, (label, key) in enumerate([("F", "5:maj"), ("Bb", "10:maj")]):
        shape = shapes.get(key)
        if not shape:
            continue
        p.append(chord_grid(36 + i * 150, 70, shape["frets"], label))
    p.append(f'<text x="24" y="186" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'食指整根橫壓四條弦（第 1 格），其餘手指再按出和弦形狀；先練到每一條弦都響再加快。</text>')
    return svg(w, h, "".join(p), "封閉和弦按法")



# ---------------------------------------------------------------- harmonics
def harmonics() -> str:
    w, h = 700, 200
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>自然泛音位置（第 12／7／5 格）</text>']
    x0, y0, col = 70, 90, 44
    for f in range(13):
        x = x0 + f * col
        p.append(f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y0+70}" stroke="{LINE}"/>')
        p.append(f'<text x="{x}" y="{y0-10}" font-size="9" text-anchor="middle" fill="{MUTED}" {FONT}>{f}</text>')
    marks = [(12, "高八度"), (7, "高八度＋五度"), (5, "高兩個八度")]
    for f, text in marks:
        x = x0 + f * col
        p.append(f'<circle cx="{x}" cy="{y0+35}" r="9" fill="{WOOD}"/>')
        p.append(f'<text x="{x}" y="{y0+58}" font-size="10.5" text-anchor="middle" fill="{INK}" {FONT}>{text}</text>')
        p.append(f'<text x="{x}" y="{y0+72}" font-size="9" text-anchor="middle" fill="{MUTED}" {FONT}>第 {f} 格</text>')
    p.append(f'<text x="24" y="186" font-size="11" fill="{MUTED}" {FONT}>'
             f'手指輕觸格線正上方（不要壓到琴格），撥弦後立刻離手，就會發出鐘聲般的泛音。</text>')
    return svg(w, h, "".join(p), "自然泛音位置")


# ---------------------------------------------------------------- high vs low G
def lowg() -> str:
    w, h = 640, 240
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>High-G 與 Low-G 的弦序差異</text>']
    rows = [("High-G（標準）", ["A4", "E4", "C4", "G4"], "第 4 弦比第 3 弦高，聽起來「跳」"),
            ("Low-G（改裝）", ["A4", "E4", "C4", "G3"], "第 4 弦變成最低音，和弦更厚")]
    for i, (name, notes, note) in enumerate(rows):
        y = 70 + i * 76
        p.append(f'<text x="24" y="{y+4}" font-size="12" fill="{INK}" {FONT}>{name}</text>')
        for k, n in enumerate(notes):
            x = 190 + k * 72
            low = n.endswith("3")
            p.append(f'<rect x="{x}" y="{y-16}" width="60" height="28" rx="6" '
                     f'fill="{"#f6efe6" if low else PAPER}" stroke="{LINE}"/>')
            p.append(f'<text x="{x+30}" y="{y+2}" font-size="12" text-anchor="middle" fill="{INK}" {FONT}>{n}</text>')
        p.append(f'<text x="24" y="{y+26}" font-size="11" fill="{MUTED}" {FONT}>{note}</text>')
    p.append(f'<text x="24" y="222" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'由左至右＝第 1 弦到第 4 弦；Low-G 只換第 4 弦，其餘三條不變，指法完全通用。</text>')
    return svg(w, h, "".join(p), "High-G 與 Low-G 弦序比較")



# ---------------------------------------------------------------- chord diagram anatomy
def chord_read() -> str:
    w, h = 520, 300
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>怎麼讀和弦圖</text>']
    x, y = 90, 70
    p.append(chord_grid(x, y, [0, 0, 0, 3], "C"))
    labels = [(x+80, y+6, "○ 空弦（左手不按，右手要刷）"),
              (x+80, y+40, "數字 = 第幾格，不是手指編號"),
              (x+80, y+74, "直線由左至右 = 第 4 弦到第 1 弦"),
              (x+80, y+108, "頂端粗線 = 上弦枕；✕ = 不彈這條弦")]
    for lx, ly, text in labels:
        p.append(f'<text x="{lx}" y="{ly}" font-size="11.5" fill="{INK}" {FONT}>{text}</text>')
    p.append(f'<text x="24" y="286" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'和弦圖是「直立看琴」：最左邊是靠近你下巴的第 4 弦。</text>')
    return svg(w, h, "".join(p), "和弦圖閱讀說明")


# ---------------------------------------------------------------- picking pattern
def picking() -> str:
    w, h = 560, 220
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>抒情分解：T 1 2 1 3 1 2 1</text>']
    seq = ["T", "1", "2", "1", "3", "1", "2", "1"]
    x0, y0, cw = 60, 70, 58
    for i, t in enumerate(seq):
        x = x0 + i * cw
        strong = t == "T"
        p.append(f'<rect x="{x}" y="{y0}" width="{cw-6}" height="60" rx="6" '
                 f'fill="{"#f3ece2" if strong else PAPER}" stroke="{LINE}"/>')
        p.append(f'<text x="{x+(cw-6)/2}" y="{y0+38}" font-size="20" text-anchor="middle" '
                 f'fill="{WOOD_D}" {FONT}>{t}</text>')
        p.append(f'<text x="{x+(cw-6)/2}" y="{y0+54}" font-size="9" text-anchor="middle" fill="{MUTED}" {FONT}>{i+1}</text>')
    p.append(f'<text x="24" y="{y0+92}" font-size="11.5" fill="{MUTED}" {FONT}>'
             f'T＝拇指（第 4 弦）、1 食指（第 3 弦）、2 中指（第 2 弦）、3 無名指（第 1 弦）。'
             f'同一小節循環一次，換和弦時拇指先落。</text>')
    return svg(w, h, "".join(p), "T1213121 分解指法")


# ---------------------------------------------------------------- offbeat grid
def offbeat() -> str:
    w, h = 560, 200
    beats = ["1", "&", "2", "&", "3", "&", "4", "&"]
    marks = ["X", "", "↑", "", "X", "", "↑", ""]
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>雷鬼的「反拍」：正拍悶掉、反拍才刷</text>']
    x0, y0, cw = 40, 70, 62
    for i, (b, m) in enumerate(zip(beats, marks)):
        x = x0 + i * cw
        on = m != ""
        p.append(f'<rect x="{x}" y="{y0}" width="{cw-6}" height="56" rx="6" '
                 f'fill="{"#f6e3d8" if m=="X" else ("#f3ece2" if on else PAPER)}" stroke="{LINE}"/>')
        p.append(f'<text x="{x+(cw-6)/2}" y="{y0+16}" font-size="10" text-anchor="middle" fill="{MUTED}" {FONT}>{b}</text>')
        p.append(f'<text x="{x+(cw-6)/2}" y="{y0+42}" font-size="18" text-anchor="middle" fill="{WOOD_D}" {FONT}>{m}</text>')
    p.append(f'<text x="24" y="{y0+86}" font-size="11.5" fill="{MUTED}" {FONT}>'
             f'X＝左手放鬆悶住四條弦、右手輕碰；↑＝反拍上刷。正拍越安靜，反拍越有彈跳感。</text>')
    return svg(w, h, "".join(p), "雷鬼反拍節奏")


# ---------------------------------------------------------------- F diatonic row
def fchords() -> str:
    shapes = _load_shapes()
    row = [("F", "5:maj"), ("Gm", "7:m"), ("Am", "9:m"), ("Bb", "10:maj"),
           ("C", "0:maj"), ("Dm", "2:m"), ("Edim", "4:dim")]
    w, h = 820, 210
    p = [f'<text x="24" y="30" font-size="14" fill="{INK}" {FONT}>F 大調六大順階和弦（＋ vii°）</text>']
    for i, (name, key) in enumerate(row):
        sh = shapes.get(key)
        if not sh:
            continue
        p.append(chord_grid(30 + i * 112, 70, sh["frets"], name, 88, 120))
    p.append(f'<text x="24" y="196" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'級數：1　2m　3m　4　5　7°；把它們排成同一排，就能看出「三和弦家族」的規律。</text>')
    return svg(w, h, "".join(p), "F 大調順階和弦")


# ---------------------------------------------------------------- sevenths
def sevenths() -> str:
    shapes = _load_shapes()
    row = [("Cmaj7", "0:maj7"), ("Am7", "9:m7"), ("Dm7", "2:m7"), ("G7", "7:7")]
    w, h = 560, 210
    p = [f'<text x="24" y="30" font-size="14" fill="{INK}" {FONT}>City Pop 感：四個常用七和弦</text>']
    for i, (name, key) in enumerate(row):
        sh = shapes.get(key)
        if not sh:
            continue
        p.append(chord_grid(36 + i * 128, 70, sh["frets"], name, 96, 120))
    p.append(f'<text x="24" y="196" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'七和弦多一個「第 7 音」，聽起來較成熟；先確認多出來的那根手指按得乾淨。</text>')
    return svg(w, h, "".join(p), "常用七和弦")


# ---------------------------------------------------------------- restring
def restring() -> str:
    w, h = 640, 210
    p = [f'<text x="24" y="28" font-size="14" fill="{INK}" {FONT}>換弦三步</text>']
    steps = [("① 鬆", "先鬆弦鈕，讓弦完全沒有張力再加熱"), ("② 拆", "從琴橋拉出舊弦，清潔指板與琴格"),
             ("③ 綁", "新弦繞成八字結，邊調音邊拉緊")]
    for i, (title, text) in enumerate(steps):
        x = 30 + i * 205
        p.append(f'<rect x="{x}" y="60" width="185" height="96" rx="10" fill="#fbf7f0" stroke="{LINE}"/>')
        p.append(f'<text x="{x+92}" y="96" font-size="22" text-anchor="middle" fill="{WOOD_D}" {FONT}>{title}</text>')
        words = text.split("，")
        for k, wd in enumerate(words):
            p.append(f'<text x="{x+92}" y="{112+k*17}" font-size="10.5" text-anchor="middle" fill="{MUTED}" {FONT}>{wd}</text>')
    p.append(f'<text x="24" y="190" font-size="10.5" fill="{MUTED}" {FONT}>'
             f'一次只換一條弦，換完立刻調音；四條都換完再整體微調一次。</text>')
    return svg(w, h, "".join(p), "換弦三步")


# ---------------------------------------------------------------- 16 分音符格子
SOFT = "#f3ece2"


def _t(x, y, s, size=11, anchor="start", fill=INK, weight=None) -> str:
    s = str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    w = f' font-weight="{weight}"' if weight else ""
    return (f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
            f'fill="{fill}"{w} {FONT}>{s}</text>')


def _beat_strip(p, x0, y0, colw, slots=16):
    """16 格：每 4 格一個大拍，交替底色，讓拍點一眼看得出來。"""
    for i in range(slots):
        beat = i // 4
        if beat % 2 == 0:
            p.append(f'<rect x="{x0 + i * colw}" y="{y0 - 16}" width="{colw}" height="150" '
                     f'fill="{SOFT}" opacity="0.65"/>')
    for i in range(slots + 1):
        x = x0 + i * colw
        strong = i % 4 == 0
        p.append(f'<line x1="{x}" y1="{y0 - 16}" x2="{x}" y2="{y0 + 134}" '
                 f'stroke="{LINE if not strong else WOOD}" stroke-width="{1 if not strong else 1.4}"/>')


def slow_soul16() -> str:
    w, h = 680, 330
    x0, colw, y0 = 120, 33, 96
    sub = ["1", "e", "&", "a"] * 4
    real = {0, 4, 6, 7, 9, 10, 12, 13, 14, 15}
    hand = ["↓", "↑", "↓", "↑"] * 4
    p = [_t(24, 28, "16 Beat 慢靈魂刷法：一小節 16 個位置，實際只刷 10 下", 14, weight=700),
         _t(24, 48, "灰色的下上上下是「空揮」——手腕照樣擺動，只是不碰到弦；粗體才是真正發聲的位置", 11, fill=MUTED)]
    _beat_strip(p, x0, y0, colw)
    # 大拍
    for b in range(4):
        p.append(_t(x0 + (b * 4 + 2) * colw, y0 - 2, str(b + 1), 12, "middle", INK, 700))
    for i, s in enumerate(sub):
        p.append(_t(x0 + (i + 0.5) * colw, y0 + 24, s, 10.5, "middle", MUTED))
    for i, s in enumerate(hand):
        on = i in real
        p.append(_t(x0 + (i + 0.5) * colw, y0 + 62, s, 20 if on else 17, "middle",
                    WOOD_D if on else "#cfc4b8", 700 if on else None))
    p.append(_t(x0 - 14, y0 - 2, "大拍", 10.5, "end", MUTED))
    p.append(_t(x0 - 14, y0 + 24, "十六細分", 10.5, "end", MUTED))
    p.append(_t(x0 - 14, y0 + 62, "右手", 10.5, "end", MUTED))
    p.append(_t(24, h - 42, "前半小節「下 —— 下、下上」；後半小節「（空）上下 —— 下上下上」。", 11.5, fill=INK))
    p.append(_t(24, h - 18, "慢歌 BPM 只有 65～75，手腕要更小、更貼近琴弦，第 4 拍的四連音才來得及揮完。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "16 Beat 慢靈魂刷法")


def funk16() -> str:
    w, h = 680, 320
    x0, colw, y0 = 120, 33, 92
    sub = ["1", "e", "&", "a"] * 4
    hand = ["↓", "↑"] * 8
    fx = ["↓", "X", "X", "↑", "X", "X", "↓", "X", "X", "↑", "X", "X", "↓", "X", "↓", "↑"]
    speak = ["蹦", "嚓", "嚓", "恰", "嚓", "嚓", "蹦", "嚓", "嚓", "恰", "嚓", "嚓", "蹦", "嚓", "蹦", "恰"]
    p = [_t(24, 28, "16 Beat 放克刷法：右手永遠上下交替，左手開關決定響或悶", 14, weight=700),
         _t(24, 48, "↓／↑ 是左手按實、刷出音高；X 是左手虛按、只留「嚓」的悶音", 11, fill=MUTED)]
    _beat_strip(p, x0, y0, colw)
    for b in range(4):
        p.append(_t(x0 + (b * 4 + 2) * colw, y0 - 2, str(b + 1), 12, "middle", INK, 700))
    for i, s in enumerate(sub):
        p.append(_t(x0 + (i + 0.5) * colw, y0 + 24, s, 10.5, "middle", MUTED))
    for i, s in enumerate(hand):
        p.append(_t(x0 + (i + 0.5) * colw, y0 + 56, s, 13, "middle", "#cfc4b8"))
    for i, s in enumerate(fx):
        muted = s == "X"
        p.append(_t(x0 + (i + 0.5) * colw, y0 + 92, s, 18, "middle",
                    "#c9bdb2" if muted else WOOD_D, 700))
    for i, s in enumerate(speak):
        p.append(_t(x0 + (i + 0.5) * colw, y0 + 120, s, 11.5, "middle", MUTED))
    for label, y in (("右手動作", y0 + 56), ("實際音效", y0 + 92), ("口訣", y0 + 120)):
        p.append(_t(x0 - 14, y, label, 10.5, "end", MUTED))
    p.append(_t(x0 - 14, y0 - 2, "拍點", 10.5, "end", MUTED))
    p.append(_t(24, h - 40, "「嚓」的悶音不用左手按實：手指放鬆貼著弦，弦不會響，只剩打擊聲。", 11.5, fill=INK))
    p.append(_t(24, h - 16, "嘴巴唱「蹦嚓嚓恰」時，右手不要跟著變慢——右手是背景節拍器，嘴巴踩在重音上就好。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "16 Beat 放克刷法")


def legato_up() -> str:
    w, h = 680, 300
    cases = [("錘音 Hammer-on", "H", "0", "2", "右手撥 C 空弦，中指快速敲進第 2 格"),
             ("勾音 Pull-off", "P", "2", "0", "按 C 弦第 2 格撥響，中指向下勾離開變空弦"),
             ("滑音 Slide", "S", "2", "5", "壓住第 2 格撥響後不鬆手，滑到第 5 格停住")]
    p = [_t(24, 28, "錘音、勾音、滑音：第二個音不靠右手", 14, weight=700),
         _t(24, 48, "三個動作都在同一條弦上完成；左手在發聲的瞬間才動，而且要壓得住", 11, fill=MUTED)]
    for i, (name, mark, a, b, note) in enumerate(cases):
        x = 26 + i * 216
        wd = 200
        y = 160
        p.append(_t(x + wd / 2, 96, name, 12.5, "middle", INK, 700))
        p.append(_t(x, 122, "C 弦", 10, "start", MUTED))
        p.append(f'<line x1="{x + 44}" y1="{y}" x2="{x + wd}" y2="{y}" stroke="{INK}" stroke-width="1.2" opacity="0.45"/>')
        for j, fret in enumerate((a, b)):
            cx = x + 66 + j * (wd - 86)
            p.append(f'<rect x="{cx - 10}" y="{y - 10}" width="20" height="20" fill="{PAPER}"/>')
            p.append(_t(cx, y + 6, fret, 16, "middle", WOOD_D, 700))
        p.append(f'<path d="M{x + 78} {y - 16} Q{x + wd / 2} {y - 56} {x + wd - 20} {y - 16}" '
                 f'stroke="{WOOD_D}" stroke-width="1.6" fill="none"/>')
        p.append(f'<path d="M{x + wd - 20} {y - 16} l-7 -1 l2 -6 z" fill="{WOOD_D}"/>')
        p.append(_t(x + wd / 2, y - 46, mark, 13, "middle", WOOD_D, 700))
        p.append(_t(x, y + 42, note, 10.5, "start", INK))
    p.append(_t(24, h - 16, "烏克麗麗弦軟、張力小，錘音與勾音特別容易「悶掉」：指尖要立起來，動作要小但果斷。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "錘音勾音滑音")


def canon_progression() -> str:
    w, h = 700, 260
    chords = ["C", "G", "Am", "Em", "F", "C", "F", "G"]
    degrees = ["1", "5", "6m", "3m", "4", "1", "4", "5"]
    p = [_t(24, 28, "卡農進行：1 – 5 – 6m – 3m – 4 – 1 – 4 – 5", 14, weight=700),
         _t(24, 48, "以 C 大調為例。同一組八個和弦換到 G 大調就是 G–D–Em–Bm–C–G–C–D，級數完全不變", 11, fill=MUTED)]
    bw, x0, y = 74, 26, 86
    for i, (ch, deg) in enumerate(zip(chords, degrees)):
        x = x0 + i * (bw + 8)
        p.append(f'<rect x="{x}" y="{y}" width="{bw}" height="86" rx="9" fill="{SOFT}" stroke="{LINE}"/>')
        p.append(_t(x + bw / 2, y + 38, ch, 18, "middle", INK, 700))
        p.append(_t(x + bw / 2, y + 68, deg, 12, "middle", WOOD_D))
        if i < 7:
            p.append(f'<path d="M{x + bw + 1} {y + 43} l6 0" stroke="{MUTED}" stroke-width="1.2"/>')
    p.append(_t(x0 + 3 * (bw + 8), y + 108, "↑ 第 5 小節換成 4 級，情緒往外開；後面的 4–5 再把耳朵帶回家", 10.5, fill=MUTED))
    notes = [("1 – 5 – 6m – 3m", "起手四個和弦，6m 與 3m 都是小和弦，所以聽起來偏柔、偏抒情"),
             ("4 – 1 – 4 – 5", "中段先回到主和弦，再用 4–5 推回 1 級收尾"),
             ("為什麼好記", "八個和弦裡有一半重複，實際只要記住六顆")]
    for i, (k, v) in enumerate(notes):
        p.append(_t(24, 216 + i * 20, f"{k}：{v}", 10.5, fill=INK if i else INK))
    return svg(w, h, "".join(p), "卡農和弦進行")


def capo_up() -> str:
    w, h = 680, 320
    p = [_t(24, 28, "移調夾：把第 3 格當成新的上弦枕", 14, weight=700),
         _t(24, 48, "手指按的形狀完全不變，只是整把琴的音高往上移了三個半音", 11, fill=MUTED)]
    # 琴頸
    x0, y0, nf, fw = 70, 96, 6, 62
    p.append(f'<rect x="{x0}" y="{y0 - 20}" width="{nf * fw}" height="86" rx="6" fill="#faf4ea" stroke="{LINE}"/>')
    for i in range(nf + 1):
        x = x0 + i * fw
        p.append(f'<line x1="{x}" y1="{y0 - 20}" x2="{x}" y2="{y0 + 66}" stroke="{LINE}" stroke-width="{2.6 if i == 0 else 1}"/>')
    for s in range(4):
        y = y0 - 6 + s * 18
        p.append(f'<line x1="{x0}" y1="{y}" x2="{x0 + nf * fw}" y2="{y}" stroke="{INK}" stroke-width="0.9" opacity="0.5"/>')
    for i, name in enumerate(["G", "C", "E", "A"]):
        p.append(_t(x0 - 10, y0 - 2 + i * 18, name, 10, "end", MUTED))
    # 移調夾（夾在第 3 格＝第 3 條琴衍的左側，跟手指按弦的位置一樣）
    cx = x0 + 3 * fw - 8
    p.append(f'<rect x="{cx - 5}" y="{y0 - 26}" width="10" height="96" rx="4" fill="{WOOD_D}"/>')
    p.append(f'<path d="M{cx} {y0 + 70} L{cx} {y0 + 86}" stroke="{WOOD_D}" stroke-width="1"/>')
    p.append(_t(cx + 6, y0 + 98, "Capo 夾在第 3 格（緊貼第 3 條琴衍的左側，跟按弦的位置一樣）", 10.5, "start", WOOD_D))
    for i in range(nf):
        p.append(_t(x0 + i * fw + fw / 2, y0 + 74, str(i + 1), 9.5, "middle", MUTED))
    # 對照
    p.append(f'<rect x="{x0}" y="212" width="270" height="78" rx="9" fill="{SOFT}" stroke="{LINE}"/>')
    p.append(_t(x0 + 14, 238, "左手按 C 大調指法", 11.5, "start", INK, 700))
    p.append(_t(x0 + 14, 262, "C – Am – F – G", 12, "start", WOOD_D))
    p.append(f'<path d="M{x0 + 286} 251 l26 0" stroke="{MUTED}" stroke-width="1.2"/>')
    p.append(f'<path d="M{x0 + 312} 251 l-7 -4 v8 z" fill="{MUTED}"/>')
    p.append(f'<rect x="{x0 + 330}" y="212" width="248" height="78" rx="9" fill="{SOFT}" stroke="{LINE}"/>')
    p.append(_t(x0 + 344, 238, "耳朵聽到的實際音高", 11.5, "start", INK, 700))
    p.append(_t(x0 + 344, 262, "Eb 大調（原曲的調）", 12, "start", WOOD_D))
    p.append(_t(24, 312, "夾高 1 格＝升 1 個半音。移調夾只能升，不能降；要降就換一組低把位指法。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "移調夾位置與實際調性")


def double_stops() -> str:
    w, h = 680, 380
    third = [("La", "0", "1"), ("Si", "2", "3"), ("Do", "3", "5"), ("Re", "5", "7"),
             ("Mi", "7", "8"), ("Fa", "8", "10"), ("Sol", "10", "12")]
    sixth = [("La", "0", "0"), ("Si", "2", "2"), ("Do", "3", "4"), ("Re", "5", "5"),
             ("Mi", "7", "7"), ("Fa", "8", "9"), ("Sol", "10", "11"), ("La", "12", "12")]
    p = [_t(24, 28, "雙音和聲：兩條弦同時撥響，旋律就多了一層厚度", 14, weight=700)]

    def strip(y, title, rows, s1, s2, note):
        p.append(_t(24, y - 26, title, 12, "start", INK, 700))
        cw, x0 = 58, 212
        for i, (sol, a, b) in enumerate(rows):
            x = x0 + i * cw
            p.append(f'<rect x="{x}" y="{y - 22}" width="{cw - 8}" height="66" rx="7" fill="{SOFT}" stroke="{LINE}"/>')
            p.append(_t(x + (cw - 8) / 2, y - 4, sol, 11, "middle", MUTED))
            p.append(_t(x + (cw - 8) / 2, y + 18, a, 14, "middle", WOOD_D, 700))
            p.append(_t(x + (cw - 8) / 2, y + 36, b, 14, "middle", WOOD_D, 700))
        p.append(_t(x0 - 12, y - 4, "唱名", 9.5, "end", MUTED))
        p.append(_t(x0 - 12, y + 18, s1, 10, "end", INK))
        p.append(_t(x0 - 12, y + 36, s2, 10, "end", INK))
        p.append(_t(24, y + 62, note, 10, "start", MUTED))

    strip(100, "三度雙音（第 1 弦＋第 2 弦）", third, "1 弦格", "2 弦格",
          "兩條弦的格數差 1 或 2 格，不是同格；食指與中指（或無名指）一起放上去。")
    strip(240, "六度雙音（第 1 弦＋第 3 弦）", sixth, "1 弦格", "3 弦格",
          "六度的兩格差距較大，用拇指＋中指或拇指＋無名指同時撥，聲音比三度更開闊。")
    p.append(_t(24, h - 16, "雙音的兩顆音都要清楚，不要一掌蓋上去；先分開撥、聽得出兩個音，再同時撥。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "三度與六度雙音")


def fingerstyle_roles() -> str:
    w, h = 680, 330
    p = [_t(24, 28, "指彈的分工：上面的弦唱歌，下面的弦伴奏", 14, weight=700),
         _t(24, 48, "同一把琴同時做兩件事——右手負責分層，左手負責把和弦按好", 11, fill=MUTED)]
    rows = [("第 1 弦 A", "旋律", "無名指 a", "主旋律，音量最突出"),
            ("第 2 弦 E", "旋律／和聲", "中指 m", "常與第 1 弦搭配成雙音"),
            ("第 3 弦 C", "和聲", "食指 i", "填中間的音，別蓋過旋律"),
            ("第 4 弦 G", "低音 Bass", "拇指 p", "每小節第 1 拍最重")]
    y0 = 92
    for i, (string, role, finger, note) in enumerate(rows):
        y = y0 + i * 46
        accented = i in (0, 3)
        p.append(f'<rect x="24" y="{y}" width="632" height="38" rx="8" '
                 f'fill="{SOFT if accented else PAPER}" stroke="{LINE}"/>')
        p.append(_t(38, y + 24, string, 11.5, "start", INK, 700))
        p.append(_t(160, y + 24, role, 11.5, "start", WOOD_D if accented else MUTED, 700 if accented else None))
        p.append(_t(290, y + 24, finger, 11, "start", INK))
        p.append(_t(430, y + 24, note, 10.5, "start", MUTED))
    p.append(_t(24, h - 44, "改編三步：① 抓出主旋律 ② 旋律音全部排到最上面兩條弦 ③ 剩下的空隙用和弦音填滿。", 11, fill=INK))
    p.append(_t(24, h - 18, "常見錯誤：低音刷得太滿、旋律被蓋掉。第 4 弦一響就收，把空間留給第 1 弦。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "指彈旋律與伴奏分工")


def percussion() -> str:
    w, h = 680, 430
    p = [_t(24, 28, "打板：兩種擊點做出大鼓與小鼓", 14, weight=700),
         _t(24, 48, "大鼓＝掌根敲面板低頻、小鼓＝指甲背拍弦；兩個點位不要混在一起", 11, fill=MUTED)]
    cx, cy = 190, 240
    # 琴身：上下兩個圓（上小下大）＋琴頸
    p.append(f'<circle cx="{cx}" cy="{cy + 34}" r="66" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.6"/>')
    p.append(f'<circle cx="{cx}" cy="{cy - 56}" r="48" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.6"/>')
    p.append(f'<rect x="{cx - 16}" y="{cy - 172}" width="32" height="76" fill="{WOOD_D}" opacity="0.85"/>')
    p.append(f'<rect x="{cx - 20}" y="{cy - 186}" width="40" height="18" rx="5" fill="{WOOD_D}"/>')
    for i in range(4):
        x = cx - 7 + i * 4.6
        p.append(f'<line x1="{x:.1f}" y1="{cy - 182}" x2="{x:.1f}" y2="{cy + 52}" '
                 f'stroke="{INK}" stroke-width="0.8" opacity="0.3"/>')
    p.append(f'<circle cx="{cx}" cy="{cy - 18}" r="17" fill="{PAPER}" stroke="{LINE}" stroke-width="1.2"/>')
    p.append(f'<rect x="{cx - 24}" y="{cy + 44}" width="48" height="11" rx="3" fill="{WOOD_D}"/>')

    def marker(x, y, label, sub, ly):
        p.append(f'<path d="M{x} {y} L340 {ly - 4}" stroke="{MUTED}" stroke-width="1" fill="none"/>')
        p.append(f'<circle cx="{x}" cy="{y}" r="14" fill="{WOOD_D}"/>')
        p.append(_t(x, y + 5, label, 12, "middle", PAPER, 700))
        p.append(_t(348, ly, sub, 10.5, "start", INK))

    marker(cx - 2, cy - 56, "K", "掌根敲上方面板＝大鼓（低、悶）", 128)
    marker(cx, cy - 18, "S", "指甲背拍過琴弦＝小鼓（脆、亮）", 186)
    marker(cx + 34, cy + 62, "K2", "側板下緣也可敲，聲音更集中", 300)
    p.append(_t(348, 250, "兩個擊點要分開練：先只打 K（拍在腿上），再只打 S；", 10.5, fill=MUTED))
    p.append(_t(348, 268, "兩件事都穩了，才把它們輪流放進同一小節。", 10.5, fill=MUTED))
    p.append(_t(24, h - 62, "4 拍基本型：K – S – K – S，每一拍都同時撥一個旋律音（拇指撥低音、食指撥高音）。", 11, fill=INK))
    p.append(_t(24, h - 34, "先把手拍在腿上打出 K–S–K–S，確定節奏穩了再上琴；上琴後音量放小，讓旋律線聽得見。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "打板擊點")


# ---------------------------------------------------------------- 和弦指法圖
# frets 一律照「第 4 弦、第 3 弦、第 2 弦、第 1 弦」的順序寫，-1＝不彈、0＝空弦
CHORD_BLOCKS = {
    "uke-chords-dm-em-g": (
        "三個最常用的和弦：Dm、Em、G",
        "由左至右是第 4 弦到第 1 弦；○ 要刷響、● 是按弦的位置",
        [("Dm", [2, 2, 1, 0], "食指 2 弦 1 格、中指 3 弦 2 格、無名指 4 弦 2 格"),
         ("Em", [0, 4, 3, 2], "小指 3 弦 4 格、無名指 2 弦 3 格、中指 1 弦 2 格"),
         ("G", [0, 2, 3, 2], "食指 2 弦 2 格、中指 1 弦 3 格、無名指 3 弦 2 格")],
        "Em 的 3 弦要按到第 4 格，所以手指是「中指—無名指—小指」一起往琴身方向排。"),
    "uke-chords-bb": (
        "四個要背起來的和弦：Bb、Bm、Cm、F#m",
        "這四個都有橫按；先求每一條弦都響，再求換得快",
        [("Bb", [3, 2, 1, 1], "食指橫按 2、1 弦 1 格，中指 3 弦 2 格，無名指 4 弦 3 格"),
         ("Bm", [4, 2, 2, 2], "食指橫按四條弦第 2 格，其餘三指在上方補位"),
         ("Cm", [0, 3, 3, 3], "4 弦空弦，其餘三條按第 3 格（小的半封閉）"),
         ("F#m", [2, 1, 2, 0], "食指 3 弦 1 格、中指 4 弦 2 格、無名指 2 弦 2 格")],
        "橫按按不響，十次有九次是食指沒有貼著琴衍；先把食指轉成側面再壓。"),
    "uke-chords-d": (
        "D 和弦的兩種按法：同一組音，兩種手指安排",
        "手指細的人用三指法；手指粗、三指擠不進去的人用半封閉法",
        [("D（三指）", [2, 2, 2, 0], "食指 3 弦 2 格、中指 2 弦 2 格、無名指 4 弦 2 格"),
         ("D（半封閉）", [2, 2, 2, 0], "食指一次壓住 4、3、2 弦第 2 格，第 1 弦留空")],
        "兩種按法聽起來一樣；挑一個你換得快的就好，不要兩種混著用。"),
    "uke-chords-gm-c7": (
        "Gm 與 C7：一個小和弦、一個屬七和弦",
        "Gm 有三根手指在動，C7 只要一根——這兩個常一起出現在 F 大調的歌裡",
        [("Gm", [0, 2, 3, 1], "食指 1 弦 1 格、中指 3 弦 2 格、無名指 2 弦 3 格"),
         ("C7", [0, 0, 0, 1], "食指 1 弦 1 格，其餘三條空弦")],
        "C7 的第 1 弦第 1 格是它的個性所在；放開就變回 C，張力會整個消失。"),
    "uke-chords-maj7": (
        "四個七和弦／延伸和弦：Cmaj7、Am7、Fmaj7、G6",
        "七和弦只比三和弦多一顆音，卻讓整首歌多一層「都會感」",
        [("Cmaj7", [0, 0, 0, 2], "中指 1 弦 2 格，其餘三條空弦"),
         ("Am7", [0, 0, 0, 0], "四條全部空弦，一根手指都不用按"),
         ("Fmaj7", [2, 4, 1, 3], "食指 2 弦 1 格、中指 4 弦 2 格、無名指 3 弦 4 格、小指 1 弦 3 格"),
         ("G6", [0, 2, 0, 2], "食指 3 弦 2 格、中指 1 弦 2 格")],
        "F 和弦把 3 弦 4 格那顆音換成 3 弦空弦，就變成 Fmaj7——不是「放開無名指」那麼簡單。"),
}


STEP_GRIDS = {
    "chunk8": (
        "切音搖滾刷法：一小節 8 個位置",
        "括號是空揮（手照樣揮動、不碰弦）；X 是左手虛按、只留下打擊聲",
        [("拍點", ["1", "&", "2", "&", "3", "&", "4", "&"]),
         ("原始民謠", ["↓", "(↑)", "↓", "↑", "(↓)", "↑", "↓", "↑"]),
         ("加入切音", ["↓", "(↑)", "X", "↑", "(↓)", "↑", "X", "↑"]),
         ("口訣", ["下", "—", "切", "上", "—", "上", "切", "上"]),
         ("模擬鼓點", ["大鼓", "", "小鼓", "", "空", "", "小鼓", ""])],
        "切音落在第 2 拍與第 4 拍的正拍，正好對上小鼓；這兩下越乾脆，律動越明顯。"),
    "reggae8": (
        "海島雷鬼刷法：正拍全部留白",
        "正拍（數字）手往下揮但不碰弦，反拍（&）才真的刷下去——這就是雷鬼的彈跳感",
        [("拍點", ["1", "&", "2", "&", "3", "&", "4", "&"]),
         ("右手", ["(↓)", "↑", "(↓)", "↑", "(↓)", "↑", "(↓)", "↑"]),
         ("左手", ["預備", "按緊", "放開", "按緊", "放開", "按緊", "放開", "按緊"]),
         ("聽覺", ["—", "恰！", "—", "恰！", "—", "恰！", "—", "恰！"])],
        "左手在正拍「放開」是關鍵：弦一鬆，聲音就斷，反拍刷下去才有乾淨的「恰」。"),
    "rumba8": (
        "流行倫巴（Rumba）8 拍經典刷法",
        "重音落在第 1 拍與第 3 拍；第 2 拍正反拍都空揮，製造拉丁味的停頓",
        [("拍點", ["1", "&", "2", "&", "3", "&", "4", "&"]),
         ("手腕", ["↓", "(↑)", "(↓)", "↑", "↓", "(↑)", "↓", "↑"]),
         ("實際發聲", ["下", "—", "—", "上", "下", "—", "下", "上"]),
         ("口訣", ["下", "—", "—", "上", "下", "—", "下", "上"]),
         ("重音", ["強", "", "", "次強", "弱", "", "弱", ""])],
        "倫巴的辨識度來自「空兩下再進來」；第 2 拍整個留白，第 3 拍再落重音。"),
}


def fig_step_grid(key) -> str:
    title, subtitle, rows, footer = STEP_GRIDS[key]
    n = len(rows[0][1])
    w, margin = 700, 110
    colw = (w - margin - 30) / n
    h = 128 + len(rows) * 34
    p = [_t(24, 30, title, 15, weight=700),
         _t(24, 50, subtitle, 11.5, fill=MUTED)]
    top = 92
    for i in range(n + 1):
        x = margin + i * colw
        strong = i % 2 == 0
        p.append(f'<line x1="{x:.1f}" y1="{top - 16}" x2="{x:.1f}" y2="{top + len(rows) * 34 - 6}" '
                 f'stroke="{LINE if not strong else WOOD}" stroke-width="{1 if not strong else 1.3}"/>')
    for r, (name, items) in enumerate(rows):
        y = top + r * 34
        p.append(_t(margin - 12, y + 5, name, 10.5, "end", MUTED))
        for i, s in enumerate(items):
            if not s:
                continue
            cx = margin + (i + 0.5) * colw
            if name == "拍點":
                p.append(_t(cx, y + 5, s, 11, "middle", MUTED))
            elif s in ("X",):
                p.append(_t(cx, y + 6, s, 17, "middle", "#B4553F", 700))
            elif s.startswith("(") or s == "—":
                p.append(_t(cx, y + 5, s, 12, "middle", "#cfc4b8"))
            elif name in ("重音", "聽覺", "模擬鼓點"):
                p.append(_t(cx, y + 5, s, 10.5, "middle", MUTED))
            else:
                p.append(_t(cx, y + 6, s, 15, "middle", WOOD_D, 700))
    p.append(_t(24, h - 16, footer, 10.5, fill=MUTED))
    return svg(w, h, "".join(p), title)


# ---------------------------------------------------------------- 由 ASCII 譜轉成的四線譜圖
# strings：四條弦，內容是原稿的字元（位置照原稿，所以對齊不會跑掉）
TAB_DATA = {'4_0': {'strings': [('A', '----------------0---0----------'),
                     ('E', '-------------------------------'),
                     ('C', '0---0--------------------------'),
                     ('G', '--------0---0-----------0------')],
         'others': ['四線譜 (TAB) 閱讀範例：〈小星星〉前兩句（C 大調）']},
 '4_1': {'strings': [('A', '--------0---0----------------------------------------------'),
                     ('E', '------------------------0-----------0---0------------------'),
                     ('C', '--------------------------------------------2---2---0------'),
                     ('G', '0---0-----------0---0-------0---0--------------------------')],
         'others': ['四線譜 (TAB)：〈小蜜蜂〉第一句（G G A A G G E｜G G E E D D C）']},
 '7_0': {'strings': [('A', '-----------------0-----------------------'),
                     ('E', '-----------0-----------------0-----------'),
                     ('C', '-----0-----------0-----------0-----0-----'),
                     ('G', '--0--------------------------------------')],
         'others': ['【經典抒情 8 拍分解和弦四線譜 (TAB)】',
                    '拍點數法：  1     &     2     &     3     &     4     &',
                    '撥弦弦號：  4     3     2     3     1     3     2     3',
                    '手指代號：  T     1     2     1     3     1     2     1']},
 '11_0': {'strings': [('A', '-------------0-------------------'),
                      ('E', '---------0-----------0-----------'),
                      ('C', '-----0-------------------0---2---'),
                      ('G', '--2------------------------------')],
          'others': ['【Am 和弦內建錘音過門 (4/4 拍)】', '拍點：  1   &   2   &   3   &   4   &', '說明：前三拍正常彈奏 Am 分解和弦，最後一拍撥響 C 空弦後，空閒的無名指快速敲擊 C 弦第 2 格！']},
 '11_1': {'strings': [('A', '---0---3---0-------------------|---0---3---0-------------------'),
                      ('E', '---------------3---1---0---1---|---------------3---1---3--/5---'),
                      ('C', '-------------------------------|-------------------------------'),
                      ('G', '-------------------------------|-------------------------------'),
                      ('A', '---0---3---0-------------------|---0---3---5--P--3---0---------'),
                      ('E', '---------------3---1---0-------|-------------------------------'),
                      ('C', '---------------------------2---|-------------------------------'),
                      ('G', '-------------------------------|-------------------------------')],
          'others': ['【〈晴天〉經典前奏風格練習（4/4 拍，BPM = 70）】',
                     '小節 1 (Am 氛圍)                  小節 2 (F 氛圍)',
                     '技巧：                          (E弦第3格用無名指按緊，順勢滑音到第5格！)',
                     '小節 3 (C 氛圍)                   小節 4 (G 氛圍)',
                     '技巧：                                    (A弦第5格撥響後，小指勾音回第3格！)']},
 '15_0': {'strings': [('A', '-----------3---2---------------|-----------3---2---------------'),
                      ('E', '-------3-----------3-----------|-------3-----------3-----------'),
                      ('C', '---4-------------------4-------|---0-------------------0-------'),
                      ('G', '-------------------------------|-------------------------------'),
                      ('A', '-----------3---2-----------2---|---3---2---0-------------------'),
                      ('E', '-------3-----------3-----------|---------------3---2---3---0---'),
                      ('C', '---2-------------------2-------|-------------------------------'),
                      ('G', '-------------------------------|-------------------------------')],
          'others': ['【〈晴天〉經典前奏單音旋律（G 大調原調，4/4 拍）】',
                     '小節 1 (Em7 氛圍)                 小節 2 (Cadd9 氛圍)',
                     '手指： (3) (2) (1) (1) (2) (3)         (2) (1) (1) (2)',
                     '小節 3 (G 氛圍)                   小節 4 (D 氛圍)',
                     '手指： (1) (2) (3) (1) (2) (1) (1)     (2) (1)  空 (3) (1) (2)  空']},
 '19_0': {'strings': [('A', '-----------------------0---3---5---'),
                      ('E', '---------------0---3---------------'),
                      ('C', '-------0---2-----------------------'),
                      ('A', '---------------0---3---5---3---0---------------'),
                      ('E', '-------0---3-----------------------3---0-------'),
                      ('C', '---0---------------------------------------0---'),
                      ('G', '-----------------------------------------------')],
          'others': ['【C 大調五聲音階（第一把位：開放 ～ 第 5 格）四線譜練習】',
                     '（建議由低音往高音上行彈奏，再由高音往低音下行彈回來）',
                     '上行（越來越亮）：Do  Re  Mi  Sol  La  高Do 高Re',
                     'G |---0-------------------------------|  (註：第4弦空弦為高音Sol，初學建議從第3弦0格Do開始往上彈！)',
                     '【最順暢上行＋下行標準練習路徑】',
                     '唱名：Do  Mi  Sol La 高Do 高Re 高Do La Sol Mi  Do',
                     '(註：再補上 C 弦第 2 格的 Re，就是完整五聲音階！)']},
 '19_1': {'strings': [('A', '---3-------0-------|-------------------|---0---3---5--/7---|---5-------3-------'),
                      ('E', '-------3-------3---|---0---3---0-------|-------------------|-------------------'),
                      ('C', '-------------------|---------------2---|-------------------|-------------------'),
                      ('G', '-------------------|-------------------|-------------------|-------------------')],
          'others': ['【示範：C 大調 4 小節即興間奏 Solo 範例（BPM = 75）】',
                     '小節 1 (C)              小節 2 (Am)             小節 3 (F)              小節 4 (G -> 接回唱)',
                     '拍數： 1   2   3   4   |  1   &   2   3 4  |  1   &   2   3 4  |  1   2   3   4']},
 '20_0': {'strings': [('A', '---3---------------0-----------|---2---------------------------'),
                      ('E', '---3---------------0-----------|---3---------------3-----------'),
                      ('C', '-------------------------------|-------------------4-----------'),
                      ('G', '-------------------------------|-------------------------------'),
                      ('A', '---0---------------------------|-------------------------------'),
                      ('E', '---1---------------3-----------|---3---------------0-----------'),
                      ('C', '-------------------4-----------|---4---------------0-----------'),
                      ('G', '-------------------------------|-------------------------------'),
                      ('A', '-------------------------------|-------------------------------'),
                      ('E', '---1---------------0-----------|---0---------------3-----------'),
                      ('C', '---2---------------0-----------|---0---------------4-----------'),
                      ('G', '-------------------------------|-------------------------------')],
          'others': ['【卡農風格雙音練習片段（C 大調，4/4 拍，BPM = 65）】',
                     '小節 1 (C 氛圍)                   小節 2 (G 氛圍)',
                     '拍數： 1       2       3       4   |  1       2       3       4',
                     '旋律： Mi              Do         |  Si              Sol',
                     '(右手：用食指+中指同時撥1,2弦)       (第3拍改用拇指+中指撥1,3弦六度雙音！)',
                     '小節 3 (Am 氛圍)                  小節 4 (Em 氛圍)',
                     '拍數： 1       2       3       4   |  1       2       3       4',
                     '旋律： La              Sol        |  Sol              Mi',
                     '(提示：Am 的 La 配 Do 是1弦0格+2弦1格；後面全部用拇指+食指撥2,3弦！)',
                     '小節 5 (F 氛圍)                   小節 6 (C 氛圍)',
                     '拍數： 1       2       3       4   |  1       2       3       4',
                     '旋律： Fa              Mi         |  Mi               Sol']},
 '21_0': {'strings': [('A', '---(3)-------(3)-------(3)---(1)---'),
                      ('E', '--------1---------1----------------'),
                      ('C', '-------------0---------------------'),
                      ('G', '---2-------------------------------'),
                      ('A', '---(0)-------(0)-------(0)---------'),
                      ('E', '--------3---------3---------(3)----'),
                      ('C', '-------------2---------------------'),
                      ('G', '---0-------------------------------'),
                      ('A', '---(2)-------(0)-------------------'),
                      ('E', '--------3---------(3)-------(0)----'),
                      ('C', '-------------2---------2-----------'),
                      ('G', '---0-------------------------------'),
                      ('A', '-------------0---------3-----------'),
                      ('E', '--------0---------0----------------'),
                      ('C', '---(0)-----------------------------'),
                      ('G', '---0-------------------------------')],
          'others': ['【周杰倫〈告白氣球〉副歌指彈獨奏四線譜 (TAB) —— C 大調，4/4 拍，BPM = 75】',
                     '（符號說明：加括號的數字 `(3)` 代表「主旋律音」，右手撥弦時請稍微加重語氣突出它！）',
                     '小節 1 (F 和弦：塞納河畔 左岸的咖啡)',
                     '拍數： 1    &    2    &    3    &  4 &',
                     '左手指法：先按好 F 和弦（4 弦 2、3 弦 0、2 弦 1、1 弦 0），小指加按第 1 弦第 3 格（C）；第 4 拍後半放開小指，回到第 1 弦空弦（A）。',
                     '小節 2 (G 和弦：我手一杯 品嚐你的美)',
                     '拍數： 1    &    2    &    3    &  4 &',
                     '小節 3 (Em7 和弦：留下唇印的嘴)',
                     '拍數： 1    &    2    &    3    &  4 &',
                     '小節 4 (Am7 和弦：承接句尾長音過門)',
                     '拍數： 1    &    2    &    3    &  4 &']},
 '22_0': {'strings': [('A', '-------0---0---0-------0---0---0---'),
                      ('E', '-----------------------------------'),
                      ('C', '---0---------------0---------------'),
                      ('G', '-----------------------------------')],
          'others': ['【四指輪指基礎分解訓練四線譜 (TAB)】', '手指順序：  p   a   m   i   p   a   m   i', '口訣節奏： 蹦  答  答  答  蹦  答  答  答']},
 '23_0': {'strings': [('A', '-----------(3)-----------------(3)---'),
                      ('E', '-------------------------------------'),
                      ('C', '----------------------0--------------'),
                      ('G', '---0---------------------------------')],
          'others': ['【現代打板指彈（Percussive）4 拍基礎協調練習譜 (TAB)】',
                     '拍點數法：  1         2         3         4',
                     '打擊鼓點： [Kick]    [Slap]    [Kick]    [Slap]',
                     '左手指法：全程保持按住 C 和弦（第1弦第3格）！']}}


TAB_TITLES = {
    "4_0": "〈小星星〉前兩句：先認「數字在哪一條弦上」",
    "4_1": "〈小蜜蜂〉第一句：數字換到別的弦也一樣讀",
    "7_0": "經典抒情 8 拍分解：T 1 2 1 3 1 2 1",
    "11_0": "Am 和弦內建的錘音過門",
    "15_0": "G 大調前奏單音：先練旋律，再配和弦",
    "19_1": "C 大調五聲音階：第一把位到第 5 格",
    "19_0": "四小節即興間奏示範：斜線是滑音",
    "19_2": "四小節即興間奏示範",
    "20_0": "卡農風格雙音片段",
    "21_0": "指彈獨奏：旋律音加括號，伴奏音較輕",
    "22_0": "四指輪指：p-a-m-i 均勻輪流",
    "23_0": "打板：每一拍同時敲擊與撥弦",
    "8_0": "3/4 拍指法分解",
    "8_1": "6/8 拍分解",
}


def fig_tab(key) -> str:
    d = TAB_DATA[key]
    title = TAB_TITLES.get(key, key)
    strings = d["strings"]
    width = max(len(c) for _, c in strings)
    others = [o for o in d["others"]
              if not o.startswith("【") and o != title and not o.startswith(("四線譜", "標準"))]
    w = 700
    left, right = 76, 30
    unit = (w - left - right) / max(width, 1)
    rowh = 26
    h = 96 + len(strings) * rowh + len(others) * 17 + 26
    p = [_t(24, 32, title, 15, weight=700)]
    top = 76
    for i, (name, content) in enumerate(strings):
        y = top + i * rowh
        p.append(f'<line x1="{left}" y1="{y}" x2="{left + width * unit:.1f}" y2="{y}" '
                 f'stroke="{INK}" stroke-width="1" opacity="0.42"/>')
        p.append(_t(left - 12, y + 4, name, 11, "end", MUTED))
        for ci, ch in enumerate(content):
            if ch.isdigit():
                cx = left + (ci + 0.5) * unit
                p.append(f'<rect x="{cx - 8:.1f}" y="{y - 8:.1f}" width="16" height="16" fill="{PAPER}"/>')
                p.append(_t(cx, y + 5, ch, 11.5, "middle", WOOD_D, 700))
    y = top + len(strings) * rowh + 12
    for o in others:
        p.append(_t(left, y, o.replace(" ", " "), 10.5, fill=MUTED))
        y += 17
    p.append(_t(24, h - 12, "數字＝左手按第幾格；弦由上而下是第 1 弦（A）到第 4 弦（G）。", 10, fill=MUTED))
    return svg(w, h, "".join(p), title)


def semitone_keys() -> str:
    """第 2 章：一個八度的鋼琴鍵盤，標出音名與升降記號。"""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"]
    flats = {1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb"}
    w, h = 720, 300
    p = [_t(24, 30, "一個八度裡的 12 個半音", 15, weight=700),
         _t(24, 50, "白鍵 7 個、黑鍵 5 個；升記號與降記號指的是同一個音（C# ＝ Db）", 11.5, fill=MUTED)]
    kw, top = 50, 96
    x0 = (w - kw * 8) / 2
    white = [i for i, n in enumerate(names[:-1]) if n in ("C", "D", "E", "F", "G", "A", "B")]
    for idx, i in enumerate(white):
        x = x0 + idx * kw
        p.append(f'<rect x="{x}" y="{top}" width="{kw - 2}" height="96" rx="4" fill="{PAPER}" stroke="{LINE}"/>')
        p.append(_t(x + kw / 2, top + 78, names[i], 12, "middle", INK, 700))
    for i, n in enumerate(names[:-1]):
        if n in ("C#", "D#", "F#", "G#", "A#"):
            nwhite = len([j for j in white if j < i])
            x = x0 + (nwhite - 1) * kw + kw - 16
            p.append(f'<rect x="{x}" y="{top}" width="30" height="58" rx="4" fill="{WOOD_D}"/>')
            p.append(_t(x + 15, top + 42, flats[i], 9.5, "middle", PAPER))
    seq = " → ".join(names)
    p.append(_t(24, 232, seq, 10.5, fill=INK))
    p.append(_t(24, 258, "相鄰兩個鍵就是半音；隔一個鍵是全音。吉他、烏克麗麗相鄰兩格也都是半音。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "半音階鍵盤圖")


def uk_steps(title, subtitle, steps, footer=""):
    n = len(steps)
    cols = 2 if n > 2 else n
    rows = (n + cols - 1) // cols
    cw = (720 - 48) / cols
    ch = 104
    h = 96 + rows * ch + 34
    p = [_t(24, 34, title, 15, weight=700), _t(24, 55, subtitle, 11.5, fill=MUTED)]
    for i, (head, body) in enumerate(steps):
        col, row = i % cols, i // cols
        x = 24 + col * cw
        y = 84 + row * ch
        p.append(f'<rect x="{x}" y="{y}" width="{cw - 16}" height="{ch - 14}" rx="10" fill="#f3ece2" stroke="{LINE}"/>')
        p.append(_t(x + 18, y + 30, str(i + 1), 20, fill=WOOD_D, weight=700))
        p.append(_t(x + 44, y + 30, head, 12.5, weight=700))
        for k, line in enumerate(_wrap(body, 17)[:3]):
            p.append(_t(x + 18, y + 54 + k * 18, line, 10.5, fill=INK))
    if footer:
        p.append(_t(24, h - 14, footer, 10.5, fill=MUTED))
    return svg(720, h, "".join(p), title)


def uk_compare(title, subtitle, columns, rows, footer=""):
    width, label_w = 720, 132
    ncol = len(columns)
    cw = (width - 48 - label_w) / max(1, ncol - 1)
    rowh = 56
    h = 96 + len(rows) * rowh + 30
    p = [_t(24, 34, title, 15, weight=700), _t(24, 55, subtitle, 11.5, fill=MUTED)]
    for j, name in enumerate(columns[1:]):
        p.append(_t(24 + label_w + j * cw + 8, 84, name, 11.5, fill=WOOD_D, weight=700))
    for i, row in enumerate(rows):
        y = 96 + i * rowh
        if i % 2 == 0:
            p.append(f'<rect x="24" y="{y}" width="{width - 48}" height="{rowh}" fill="#f3ece2" opacity=".5"/>')
        p.append(_t(34, y + 24, row[0], 11.5, weight=700))
        for j, val in enumerate(row[1:]):
            for k, line in enumerate(_wrap(val, 12)[:2]):
                p.append(_t(24 + label_w + j * cw + 8, y + 22 + k * 17, line, 10.5, fill=INK))
    if footer:
        p.append(_t(24, h - 12, footer, 10.5, fill=MUTED))
    return svg(width, h, "".join(p), title)


def uk_timeline(title, subtitle, parts_list, footer=""):
    width, h = 720, 240
    total = sum(w for _, w, _ in parts_list)
    avail = width - 48
    p = [_t(24, 34, title, 15, weight=700), _t(24, 55, subtitle, 11.5, fill=MUTED)]
    x = 24
    for name, wgt, note in parts_list:
        bw = avail * wgt / total
        p.append(f'<rect x="{x:.1f}" y="84" width="{bw - 4:.1f}" height="52" rx="7" fill="#f3ece2" stroke="{LINE}"/>')
        p.append(_t(x + (bw - 4) / 2, 116, name, 11.5, "middle", INK, 700))
        for k, line in enumerate(_wrap(note, 9)[:3]):
            p.append(_t(x + 2, 156 + k * 16, line, 9.5, fill=MUTED))
        x += bw
    if footer:
        p.append(_t(24, h - 12, footer, 10.5, fill=MUTED))
    return svg(width, h, "".join(p), title)


def note_values() -> str:
    rows = [("全音符", 1, "4 拍", "刷一下，讓它響滿整小節"),
            ("二分音符", 2, "2 拍", "一小節兩下"),
            ("四分音符", 4, "1 拍", "跟著節拍器一下一下"),
            ("八分音符", 8, "半拍", "一拍裡兩下，數 1 & 2 &")]
    w, h = 720, 320
    p = [_t(24, 34, "四種基本音符：一個小節可以裝幾個", 15, weight=700),
         _t(24, 55, "橫條的長度就是音延續的長度；4/4 拍一小節固定 4 拍", 11.5, fill=MUTED)]
    bar_x, bar_w = 170, 470
    for i, (name, count, beats, note) in enumerate(rows):
        y = 88 + i * 54
        p.append(_t(160, y + 20, name, 12, "end", INK, 700))
        seg = bar_w / count
        for k in range(count):
            p.append(f'<rect x="{bar_x + k * seg:.1f}" y="{y}" width="{seg - 4:.1f}" height="28" rx="5" '
                     f'fill="{WOOD}" opacity="{0.9 if k % 2 == 0 else 0.55}"/>')
        p.append(_t(bar_x, y + 46, f"{beats}｜{note}", 10, fill=MUTED))
        for x in (bar_x, bar_x + bar_w):
            p.append(f'<line x1="{x}" y1="{y - 6}" x2="{x}" y2="{y + 34}" stroke="{INK}" stroke-width="1.6"/>')
    return svg(w, h, "".join(p), "四種基本音符")


def press_hand() -> str:
    w, h = 720, 330
    p = [_t(24, 34, "按弦的兩件事：位置與角度", 15, weight=700),
         _t(24, 55, "同一顆音，按對地方不用出力就響；按錯地方再用力也是悶的", 11.5, fill=MUTED)]
    panels = [("○ 正確：貼著琴衍右側", 0.80, WOOD_D),
              ("✕ 太中間：要多花一倍力氣", 0.50, "#B4553F"),
              ("✕ 壓在琴衍上：聲音會死掉", 0.97, "#B4553F")]
    for i, (label, frac, color) in enumerate(panels):
        x = 48 + i * 224
        top, fh = 96, 64
        p.append(f'<rect x="{x}" y="{top}" width="176" height="{fh}" fill="#faf4ea" stroke="{LINE}"/>')
        for k in range(3):
            yy = top + k * 32
            p.append(f'<line x1="{x}" y1="{yy}" x2="{x + 176}" y2="{yy}" stroke="{MUTED}" stroke-width="{2.4 if k == 0 else 1}"/>')
        p.append(f'<line x1="{x}" y1="{top + fh}" x2="{x + 176}" y2="{top + fh}" stroke="{MUTED}"/>')
        p.append(f'<line x1="{x + 176}" y1="{top}" x2="{x + 176}" y2="{top + fh}" stroke="{INK}" stroke-width="3"/>')
        fx = x + 18 + frac * 132
        p.append(f'<circle cx="{fx:.1f}" cy="{top + 48}" r="9" fill="{color}"/>')
        p.append(_t(x + 88, top + fh + 28, label, 10.5, "middle", INK))
    p.append(_t(48, 240, "指尖立起來、從琴頸正上方落下：手指與弦垂直，旁邊的弦才不會被悶到。", 11))
    p.append(_t(48, 264, "手腕微拱、虎口留空；手掌貼在琴頸上會讓小指伸不出去。", 11))
    p.append(_t(48, h - 16, "烏克麗麗弦軟，按不響幾乎都是「沒貼著琴衍」或「指尖塌下去」，很少是力氣問題。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "左手按弦的位置與角度")


def wrist_pendulum() -> str:
    w, h = 720, 300
    p = [_t(24, 34, "右手是鐘擺：手腕動，手肘不動", 15, weight=700),
         _t(24, 55, "下刷走全弦、上刷只帶高音弦；中間不碰弦的那一下叫空刷", 11.5, fill=MUTED)]
    # 前臂
    p.append(f'<rect x="90" y="118" width="150" height="34" rx="12" fill="#f3ece2" stroke="{LINE}"/>')
    p.append(_t(165, 108, "前臂（固定）", 10, "middle", MUTED))
    # 手腕支點
    p.append(f'<circle cx="250" cy="135" r="13" fill="{WOOD_D}"/>')
    p.append(_t(250, 172, "手腕支點", 10, "middle", MUTED))
    # 擺動弧
    p.append(f'<path d="M250 135 m -92 -46 a 104 104 0 0 1 0 92" stroke="{WOOD}" stroke-width="3" fill="none"/>')
    p.append(f'<path d="M250 135 L404 96" stroke="{WOOD_D}" stroke-width="3"/>')
    p.append(f'<path d="M250 135 L404 176" stroke="{WOOD_D}" stroke-width="3"/>')
    p.append(_t(414, 100, "上刷（只碰高音弦）", 10.5, fill=INK))
    p.append(_t(414, 180, "下刷（全弦）", 10.5, fill=INK))
    p.append(_t(356, 70, "空刷：手照樣走，只是不碰弦", 10, "middle", MUTED))
    p.append(f'<path d="M330 62 q 26 -18 52 0" stroke="{MUTED}" stroke-width="1" fill="none"/>')
    p.append(_t(24, h - 62, "只要手腕在動，拍子就不會掉；手肘跟著甩，拍子一定亂。", 11))
    p.append(_t(24, h - 34, "刷子越短、越靠手腕，速度才有辦法往上加——這是之後 16 Beat 的前提。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "手腕鐘擺")


def dynamics_timeline() -> str:
    return uk_timeline(
        "一首歌的動態：主歌收、副歌放",
        "同一組和弦，靠「刷幾條弦、刷幾下、多大聲」做出三段落差",
        [("主歌", 3, "指法分解"), ("導歌", 2, "漸強下刷"), ("副歌", 3, "16 Beat 全刷"), ("尾奏", 2, "回到分解")],
        "副歌之所以聽起來大，是因為前面刻意收；一路全刷反而沒有起伏。")

def _wrap(text, n):
    return [text[i:i + n] for i in range(0, len(text), n)]


def fig_chord_block(key) -> str:
    title, subtitle, items, footer = CHORD_BLOCKS[key]
    w = 720
    n = len(items)
    step = (w - 48) / n
    h = 372
    p = [_t(24, 30, title, 15, weight=700),
         _t(24, 50, subtitle, 11.5, fill=MUTED)]
    for i, (name, frets, note) in enumerate(items):
        x = 24 + i * step + step / 2 - 46
        p.append(chord_grid(x, 92, list(reversed(frets)), name, 92, 130))
        for k, line in enumerate(_wrap(note, 11)):
            p.append(_t(24 + i * step + step / 2, 248 + k * 16, line, 9.5, "middle", MUTED))
    p.append(_t(24, h - 14, footer, 10.5, fill=MUTED))
    return svg(w, h, "".join(p), title)


def humidity() -> str:
    return uk_compare(
        "台灣的濕度對琴做了什麼",
        "實木面板怕的是「變化」，不是「濕」或「乾」本身；穩定比數字漂亮重要",
        ["狀況", "太濕（>70%）", "太乾（<40%）"],
        [("面板", "膨脹凸起、弦距變高", "收縮、可能乾裂"),
         ("聲音", "變悶、延音變短", "變尖、失去低頻"),
         ("弦", "生鏽快、手感變澀", "較不易生鏽"),
         ("對策", "琴袋放乾燥劑、除濕機設 55%", "琴袋放調濕包，遠離冷氣出風口")],
        "最省心的做法：琴袋內放一包雙向調濕包（例如 49%），比每天追著濕度計跑有效。")


def chord_loop() -> str:
    """5.2：C → Am → F → G7 的共同指。"""
    items = [("C", [0, 0, 0, 3], "無名指 1 弦 3 格；中指先懸在 4 弦 2 格上方"),
             ("Am", [2, 0, 0, 0], "中指落下來就是 Am，無名指同時抬起"),
             ("F", [2, 0, 1, 0], "中指不要放開，食指加按 2 弦 1 格"),
             ("G7", [0, 2, 1, 2], "食指留著當軸心，中指移到 3 弦 2 格")]
    w = 720
    step = (w - 48) / 4
    h = 372
    p = [_t(24, 34, "無痛換和弦：四顆和弦其實共用手指", 15, weight=700),
         _t(24, 55, "換和弦時手指全部抬起來，是最常見的「慢」；留一根手指當路標就會快很多", 11.5, fill=MUTED)]
    for i, (name, frets, note) in enumerate(items):
        x = 24 + i * step + step / 2 - 46
        p.append(chord_grid(x, 92, list(reversed(frets)), name, 92, 130))
        for k, line in enumerate(_wrap(note, 11)):
            p.append(_t(24 + i * step + step / 2, 248 + k * 16, line, 9.5, "middle", MUTED))
    p.append(_t(24, h - 14, "四個和弦裡，2 弦 1 格、4 弦 2 格、1 弦 2–3 格反覆出現——記位置，不要記「整組手型」。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "換和弦的共同指")


def beats34_68() -> str:
    """8.1：3/4 與 6/8 的重音位置。"""
    w, h = 720, 320
    p = [_t(24, 34, "3/4 與 6/8：重音落在不同地方", 15, weight=700),
         _t(24, 55, "兩者都是三拍一組，但 6/8 是「兩大拍、每大拍三下」，聽起來更快、更圓", 11.5, fill=MUTED)]
    rows = [("3/4", ["強", "弱", "弱"], "三拍一一數；第 1 拍最飽滿"),
            ("6/8", ["強", "弱", "弱", "次強", "弱", "弱"], "兩大拍；第 4 下要再給一次力道")]
    for i, (name, marks, note) in enumerate(rows):
        y = 104 + i * 96
        p.append(_t(96, y + 6, name, 14, "end", WOOD_D, 700))
        n = len(marks)
        colw = 520 / n
        for k, m in enumerate(marks):
            x = 120 + k * colw
            strong = m in ("強", "次強")
            p.append(f'<rect x="{x:.1f}" y="{y - 16}" width="{colw - 6:.1f}" height="36" rx="6" '
                     f'fill="{WOOD if strong else "#f3ece2"}" stroke="{LINE}"/>')
            p.append(_t(x + (colw - 6) / 2, y + 7, m, 11.5, "middle", PAPER if strong else MUTED,
                       700 if strong else None))
        p.append(_t(120, y + 44, note, 10, fill=MUTED))
    p.append(_t(24, h - 16, "6/8 不是「六個平均的四拍」；數成兩大拍，第 1 與第 4 下明顯更用力，律動就對了。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "3/4 與 6/8 的重音")


def transpose_grid() -> str:
    """17.2：移調夾速查。"""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    def up(root, n):
        return names[(names.index(root) + n) % 12]
    groups = [("C 調指法", "C"), ("G 調指法", "G"), ("F 調指法", "F")]
    w = 720
    left, colw = 150, 88
    h = 96 + len(groups) * 44 + 30
    p = [_t(24, 34, "移調夾速查：按同一組指法，實際唱出來的調", 15, weight=700),
         _t(24, 55, "往琴身方向夾 1 格＝升 1 個半音；移調夾只能升，不能降", 11.5, fill=MUTED)]
    for c in range(6):
        p.append(_t(left + c * colw + colw / 2, 86, f"夾 {c} 格" if c else "不夾", 10.5, "middle", MUTED))
    for i, (label, root) in enumerate(groups):
        y = 98 + i * 44
        p.append(_t(left - 12, y + 18, label, 11.5, "end", INK, 700))
        for c in range(6):
            x = left + c * colw
            same = c == 0
            p.append(f'<rect x="{x}" y="{y}" width="{colw - 6}" height="32" rx="6" '
                     f'fill="{"#f3ece2" if same else PAPER}" stroke="{LINE}"/>')
            p.append(_t(x + (colw - 6) / 2, y + 21, up(root, c), 12, "middle", INK if same else WOOD_D,
                       700 if same else None))
    p.append(_t(24, h - 14, "例：原曲 Eb 大調要唱，用 C 調指法夾第 3 格；太高就換一組指法再夾，不是把夾子往回夾。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "移調夾速查")


def tuning_steps() -> str:
    return uk_steps(
        "調音四步驟：從第 4 弦調到第 1 弦",
        "每次拿起琴都先跑一輪，一分鐘內可以完成",
        [("夾上調音器", "夾在琴頭，模式選 C（十二平均律），基準 440Hz"),
         ("一次只撥一根弦", "從第 4 弦開始；撥完等 1～2 秒，讓音穩定再讀"),
         ("先看音名、再看指針", "字母不對就是差太多，先把音名調對，指針只是微調"),
         ("回頭再檢查一次", "調好第 1 弦後張力會變，前面幾條常會跟著跑掉")],
        "換弦後的前兩天一定會一直走音，這是正常的；彈之前先調，彈完再調一次。")


def warmup_steps() -> str:
    return uk_steps(
        "今日暖身：三件事，各兩分鐘",
        "暖身的目的不是練會什麼，是讓手指醒過來、讓音準穩定",
        [("爬格子", "第 1～4 格，一指一格，從第 4 弦爬到第 1 弦，60 BPM"),
         ("空弦穩定度", "每條弦撥四下，聲音要一樣大、一樣長"),
         ("和弦切換", "C → Am → F → G7 慢慢換，只求乾淨不求快")],
        "手還沒熱就練快，是成年人練琴最常見的受傷原因。")


def arrange_steps() -> str:
    return uk_steps(
        "把流行歌改成指彈：四個步驟",
        "順序不能顛倒——先把旋律抓對，再談伴奏",
        [("抓主旋律", "只彈單音，跟著唱，確認每一個音都對"),
         ("旋律搬到高音弦", "把旋律音全部排到第 1、2 弦，方便之後疊和弦"),
         ("填空隙", "旋律的空拍處塞和弦音，一次只塞一兩個"),
         ("決定低音", "每小節第 1 拍給根音，其他拍讓給旋律")],
        "新手最常犯的錯：先編伴奏，結果旋律被蓋掉，聽不出在彈哪一首。")


def wood_types() -> str:
    return uk_compare(
        "三種板材：價格差在哪裡",
        "差別在「面板是幾層」，不是木頭品種的名字好不好聽",
        ["板材", "合板（Laminate）", "全單板（Solid）"],
        [("結構", "三層薄木交錯壓合", "整塊實木切薄"),
         ("聲音", "較平、開聲空間小", "越彈越開，低頻與延音更好"),
         ("價格", "便宜，適合第一把", "貴，需要保養"),
         ("適合", "旅行、隨手彈、預算有限", "每天彈、在意音色")],
        "面單板（面板實木、側背合板）是中間選項：音色明顯比合板好，價格又不到全單板。")


def seventh_pair() -> str:
    w = 720
    items = [("C", [0, 0, 0, 3], "三和弦"), ("Cmaj7", [0, 0, 0, 2], "換一個音就變七和弦"),
             ("Am", [2, 0, 0, 0], "三和弦"), ("Am7", [0, 0, 0, 0], "四條全空弦")]
    step = (w - 48) / 4
    h = 372
    p = [_t(24, 34, "三和弦 → 七和弦：只換一顆音，氣質就變了", 15, weight=700),
         _t(24, 55, "七和弦多的是「第 7 音」；它讓和聲多一層都會感，但不会讓和弦變難按", 11.5, fill=MUTED)]
    for i, (name, frets, note) in enumerate(items):
        x = 24 + i * step + step / 2 - 46
        p.append(chord_grid(x, 92, list(reversed(frets)), name, 92, 130))
        for k, line in enumerate(_wrap(note, 11)):
            p.append(_t(24 + i * step + step / 2, 250 + k * 16, line, 9.5, "middle", MUTED))
        if i % 2 == 1:
            p.append(_t(24 + i * step - 8, 160, "→", 18, "middle", WOOD_D, 700))
    p.append(_t(24, h - 14, "同一段旋律換上七和弦，鼓跟貝斯不用動，整首歌就會突然「夜景」起來。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "三和弦與七和弦對照")


def faq_week1() -> str:
    return uk_compare(
        "第一週最常卡住的三件事",
        "這三個問題幾乎每個人都會遇到，而且都不是「你沒天分」",
        ["問題", "真正的原因", "怎麼解"],
        [("手指痛", "按弦位置太中間、指尖塌下去", "貼琴衍、指尖立起；一天 10 分鐘就夠"),
         ("和弦悶音", "旁邊的弦被手指壓到", "手指站直，只壓需要響的那條弦"),
         ("換和弦太慢", "每次都整組手抬起來重找", "留一根共同指當路標（見 5.2）")],
        "痛是正常的，破皮不是。指尖起繭之前，寧可少彈十分鐘，也不要硬撐。")


def accessories() -> str:
    return uk_steps(
        "買琴必備的四樣配件",
        "這四樣加起來通常不到琴價的一成，但少了會很麻煩",
        [("調音器", "夾式即可；手機 App 也可以，但夾式在吵雜環境更穩"),
         ("琴袋或琴盒", "厚琴袋就夠日常使用；要帶出門選有硬殼的"),
         ("背帶", "站著彈才需要；坐著彈靠三點支撐就好"),
         ("擦拭布", "每次彈完擦弦，弦的壽命差很多")],
        "先不要買一堆效果器或改裝品；把這四樣準備好，再談第二把琴。")


def strum_dynamics() -> str:
    return uk_compare(
        "刷弦的力度：不要從頭到尾一樣大聲",
        "「鋸木頭式」的平刷是新手最常見的問題，差別在重音放哪裡",
        ["段落", "刷法", "力道"],
        [("主歌", "指法分解或半拍下刷", "輕，讓歌聲在前面"),
         ("導歌", "每拍下刷、逐漸加密", "中，一拍比一拍重"),
         ("副歌", "16 Beat 全刷", "重，四條弦全響"),
         ("尾奏", "回到分解、放慢", "漸弱，讓最後一顆音自然消失")],
        "同一組和弦，只要改「刷幾條弦、刷幾下、多大聲」，聽起來就像另一首歌。")


def uk_grid(title, subtitle, rows, footer="", slots=8):
    w = 720
    left = 132
    colw = (w - left - 30) / slots
    h = 120 + len(rows) * 32 + 40
    p = [_t(24, 34, title, 15, weight=700), _t(24, 55, subtitle, 11.5, fill=MUTED)]
    top = 92
    for i in range(slots + 1):
        x = left + i * colw
        strong = i % max(1, slots // 4) == 0
        p.append(f'<line x1="{x:.1f}" y1="{top - 14}" x2="{x:.1f}" y2="{top + len(rows) * 32 - 8}" '
                 f'stroke="{LINE if not strong else WOOD}" stroke-width="1"/>')
    for r, (name, items) in enumerate(rows):
        y = top + r * 32
        p.append(_t(left - 12, y + 5, name, 10.5, "end", MUTED))
        for i, s in enumerate(items):
            if not s:
                continue
            cx = left + (i + 0.5) * colw
            if name == "拍點":
                p.append(_t(cx, y + 5, s, 10.5, "middle", MUTED))
            elif s in ("X", "×"):
                p.append(_t(cx, y + 6, s, 16, "middle", "#B4553F", 700))
            elif s.startswith("("):
                p.append(_t(cx, y + 5, s, 12, "middle", "#cfc4b8"))
            else:
                p.append(_t(cx, y + 6, s, 15, "middle", WOOD_D, 700))
    if footer:
        p.append(_t(24, h - 14, footer, 10.5, fill=MUTED))
    return svg(w, h, "".join(p), title)


def uk_degrees() -> str:
    rows = [("級數", ["1", "2m", "3m", "4", "5", "6m", "7dim"]),
            ("C 大調", ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]),
            ("G 大調", ["G", "Am", "Bm", "C", "D", "Em", "F#dim"])]
    w, h, left = 720, 270, 140
    colw = (w - left - 30) / 7
    p = [_t(24, 34, "級數：不管什麼調，同一個號碼就是同一種角色", 15, weight=700),
         _t(24, 55, "記住級數，換調時只要把整排換名字，進行完全不用重記", 11.5, fill=MUTED)]
    for r, (name, items) in enumerate(rows):
        y = 100 + r * 46
        p.append(_t(left - 12, y + 6, name, 11, "end", MUTED))
        for i, s in enumerate(items):
            x = left + i * colw
            strong = s in ("1", "5", "6m")
            p.append(f'<rect x="{x + 4:.1f}" y="{y - 16}" width="{colw - 8:.1f}" height="34" rx="7" '
                     f'fill="{"#f3ece2" if strong else PAPER}" stroke="{LINE}"/>')
            p.append(_t(x + colw / 2, y + 6, s, 12.5, "middle", INK, 700 if strong else None))
    p.append(_t(24, h - 16, "換調時整排平移：C 調的 1-5-6m-4 到了 G 調就是 G-D-Em-C。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "級數與和弦的對應")


def uk_harmonics() -> str:
    w, h = 720, 300
    p = [_t(24, 34, "泛音：手指輕觸格線正上方，不要壓下去", 15, weight=700),
         _t(24, 55, "第 12 格最好按、音量最大；第 7 與第 5 格更高更薄", 11.5, fill=MUTED)]
    top, fh = 96, 60
    left, right = 90, 640
    p.append(f'<rect x="{left}" y="{top}" width="{right - left}" height="{fh}" fill="#faf4ea" stroke="{LINE}"/>')
    frets = 12
    fw = (right - left) / frets
    for i in range(frets + 1):
        x = left + i * fw
        p.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + fh}" stroke="{MUTED}" stroke-width="{2.6 if i == 0 else 1}"/>')
    for n, label in [(12, "第 12 格｜高八度"), (7, "第 7 格｜高八度＋五度"), (5, "第 5 格｜高兩個八度")]:
        x = left + n * fw
        p.append(f'<circle cx="{x:.1f}" cy="{top + fh / 2}" r="11" fill="{WOOD_D}"/>')
        p.append(_t(x, top + fh + 22, f"{n}", 11, "middle", INK, 700))
        p.append(_t(x, top + fh + 40, label, 9, "middle", MUTED))
    for i in range(1, frets + 1):
        p.append(_t(left + i * fw - fw / 2, top + fh + 22, str(i), 8.5, "middle", "#cfc4b8"))
    p.append(_t(24, h - 62, "做法：左手指腹「浮貼」在格線正上方（不要壓實），右手撥弦，左手同時離開。", 11))
    p.append(_t(24, h - 38, "音量小是正常的；錄音時把麥克風靠近一點，或事後把這幾顆音推上來。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "自然泛音的位置")


def uk_mute() -> str:
    return uk_compare(
        "左手悶音：按下去是聲音，放鬆是「嚓」",
        "手指不離開弦，只改變按壓力道——這是放克與雷鬼的基礎",
        ["狀態", "手指力道", "發出的聲音"],
        [("按實", "指尖立起、壓到底", "和弦音，飽滿"),
         ("虛按", "放鬆到弦貼著指腹、不碰銅條", "悶音，只剩打擊感"),
         ("放開", "手指離弦", "空弦音（通常不是你要的）")],
        "練習：同一個和弦，四下「按實、虛按、虛按、按實」，節奏感就出來了。")


def uk_ensemble() -> str:
    w, h = 720, 280
    p = [_t(24, 34, "雙人合奏：把音域分開，才不會互打架", 15, weight=700),
         _t(24, 55, "兩把琴都待在第 1～3 格，頻率會全部擠在一起", 11.5, fill=MUTED)]
    lanes = [("角色 A｜低把位", 92, 40, "刷節奏、打拍子，負責地板"),
             ("角色 B｜高把位", 156, 40, "第 5～10 格的三和弦與過門，負責天空")]
    for name, y, x0, note in lanes:
        p.append(f'<rect x="40" y="{y}" width="640" height="34" rx="8" fill="#f3ece2" stroke="{LINE}"/>')
        for i in range(8):
            p.append(f'<line x1="{40 + i * 80:.1f}" y1="{y}" x2="{40 + i * 80:.1f}" y2="{y + 34}" stroke="{LINE}" opacity=".7"/>')
        p.append(_t(52, y + 22, name, 11, fill=INK, weight=700))
        p.append(_t(40, y + 54, note, 10, fill=MUTED))
    p.append(_t(24, h - 16, "分工後音量不用大：兩把琴的音域錯開，聽起來自然就厚。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "雙人合奏的音域分工")


def uk_phone() -> str:
    return uk_compare(
        "手機拍彈唱：擺位比器材重要",
        "手機的麥克風在底部，它聽到的是「離它最近的那個聲音」",
        ["項目", "建議", "為什麼"],
        [("距離", "80～120cm", "太近只收到琴，太遠收到整個房間"),
         ("高度", "對準嘴巴，略高於琴", "人聲在最前面，琴在後面"),
         ("角度", "45 度側逆光", "臉有立體感，也不會逆光變黑"),
         ("背景", "布簾、衣櫃、床邊", "硬牆會讓聲音變空")],
        "先錄 20 秒試聽一次再正式錄；位置調對，比換麥克風有效。")


def uk_cold_keys() -> str:
    return uk_compare(
        "冷門調（Eb／Ab／Db）怎麼變簡單",
        "不是換和弦，是「換一組指法 + 夾移調夾」",
        ["原曲調", "用這組指法", "Capo 夾幾格"],
        [("Eb", "C 調指法（C–Am–F–G）", "第 3 格"),
         ("Ab", "C 調指法", "第 8 格（太高，改用 G 調指法夾第 1 格）"),
         ("Db", "C 調指法", "第 1 格")],
        "夾到第 6 格以上琴格會變窄；這時換一組低把位指法，通常更好按。")


def lyric_grid() -> str:
    """5.3：歌詞對到刷弦拍點。"""
    beats = ["1", "&", "2", "&", "3", "&", "4", "&"]
    strum = ["↓", "-", "↓", "↑", "-", "↑", "↓", "↑"]
    lyric = ["有", "一", "個", "美", "麗", "的", "小", "薇"]
    w = 720
    left = 132
    colw = (w - left - 30) / 8
    h = 292
    p = [_t(24, 34, "歌詞對到拍點：一個字配一下刷弦", 15, weight=700),
         _t(24, 55, "先把歌詞一個字一個字放進格子裡，再彈；對不上就是格子放錯，不是手笨", 11.5, fill=MUTED)]
    rows = [("拍點", beats, MUTED, 10.5), ("刷法", strum, WOOD_D, 16), ("歌詞", lyric, INK, 14)]
    top = 92
    for i in range(9):
        x = left + i * colw
        strong = i % 2 == 0
        p.append(f'<line x1="{x:.1f}" y1="{top - 14}" x2="{x:.1f}" y2="{top + 3 * 34 - 6}" '
                 f'stroke="{LINE if not strong else WOOD}" stroke-width="1"/>')
    for r, (name, items, color, size) in enumerate(rows):
        y = top + r * 34
        p.append(_t(left - 12, y + 6, name, 10.5, "end", MUTED))
        for i, s in enumerate(items):
            cx = left + (i + 0.5) * colw
            if r == 1 and s == "-":
                p.append(_t(cx, y + 5, "·", 14, "middle", "#cfc4b8"))
            else:
                p.append(_t(cx, y + 6, s, size, "middle", color, 700 if r == 1 else None))
    p.append(_t(24, h - 62, "練習順序：① 只唸歌詞打拍子 ② 只刷不唱 ③ 兩者一起。", 11))
    p.append(_t(24, h - 36, "換和弦時右手不要停：左手換位置，右手繼續擺動。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "歌詞與拍點對齊")


def slide_fill() -> str:
    """11.2：滑音與和弦內的過門。"""
    w, h = 720, 300
    p = [_t(24, 34, "滑音與過門：讓和弦之間有東西可聽", 15, weight=700),
         _t(24, 55, "滑音是「同一個手指沿著弦移動」；過門是「在空拍處塞一兩個音」", 11.5, fill=MUTED)]

    def panel(x, label, a, b, mark, note):
        top = 96
        p.append(_t(x + 90, top - 16, label, 12, "middle", INK, 700))
        p.append(f'<line x1="{x}" y1="{top + 30}" x2="{x + 180}" y2="{top + 30}" stroke="{INK}" stroke-width="1.2" opacity=".45"/>')
        for i, f in enumerate((a, b)):
            cx = x + 44 + i * 92
            p.append(f'<rect x="{cx - 11}" y="{top + 20}" width="22" height="20" fill="{PAPER}"/>')
            p.append(_t(cx, top + 36, f, 15, "middle", WOOD_D, 700))
        p.append(f'<path d="M{x + 56} {top + 12} Q{x + 90} {top - 18} {x + 124} {top + 12}" '
                 f'stroke="{WOOD_D}" stroke-width="1.6" fill="none"/>')
        p.append(_t(x + 90, top - 2, mark, 13, "middle", WOOD_D, 700))
        for k, line in enumerate(_wrap(note, 11)):
            p.append(_t(x, top + 70 + k * 16, line, 10, fill=MUTED))

    panel(40, "滑音 Slide", "2", "5", "/", "壓住第 2 格撥響，手指不鬆開滑到第 5 格")
    panel(280, "錘音 Hammer", "0", "2", "H", "撥空弦後用手指敲第 2 格，右手不再撥")
    panel(520, "勾音 Pull-off", "2", "0", "P", "按住第 2 格撥響，手指往下勾離開")
    p.append(_t(24, h - 16, "過門的位置通常在每小節最後半拍：先讓和弦響滿，再用一個音把聽眾帶到下一小節。", 10.5))
    return svg(w, h, "".join(p), "滑音與過門")


def shape_shift() -> str:
    """12.3：封閉和弦指型平移。"""
    w, h = 720, 300
    p = [_t(24, 34, "封閉和弦的平移：同一個手型，往右就是升調", 15, weight=700),
         _t(24, 55, "食指橫按整個格，其餘三指補位；整組往琴身移 1 格＝升 1 個半音", 11.5, fill=MUTED)]
    left, top, fw, nf = 90, 96, 88, 5
    p.append(f'<rect x="{left}" y="{top}" width="{nf * fw}" height="80" rx="6" fill="#faf4ea" stroke="{LINE}"/>')
    for i in range(nf + 1):
        x = left + i * fw
        p.append(f'<line x1="{x}" y1="{top}" x2="{x}" y2="{top + 80}" stroke="{MUTED}" stroke-width="{2.6 if i == 0 else 1}"/>')
    for i in range(nf):
        p.append(_t(left + i * fw + fw / 2, top + 98, str(i + 1), 10, "middle", MUTED))
    blocks = [(0, "Bb", "1 格"), (1, "B", "2 格"), (2, "C", "3 格")]
    for i, (idx, name, note) in enumerate(blocks):
        x = left + idx * fw + fw / 2
        p.append(f'<rect x="{x - 26:.1f}" y="{top + 20}" width="52" height="42" rx="8" '
                 f'fill="{WOOD}" opacity="{0.95 - i * 0.2}"/>')
        p.append(_t(x, top + 40, name, 14, "middle", PAPER, 700))
        p.append(_t(x, top + 56, note, 9, "middle", PAPER))
    p.append(_t(24, h - 66, "同一個手型，第 1 格是 Bb、第 2 格是 B、第 3 格是 C——不用換按法，只要移動。", 11))
    p.append(_t(24, h - 40, "每日 3 分鐘：在 1、3、5、7 格各按一次，每次撥四下，確認四條弦都響。", 10.5, fill=MUTED))
    return svg(w, h, "".join(p), "封閉和弦指型平移")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    figures = {
        "slow_soul16.svg": slow_soul16(),
        "funk16.svg": funk16(),
        "legato_up.svg": legato_up(),
        "canon_progression.svg": canon_progression(),
        "capo.svg": capo_up(),
        "double_stops.svg": double_stops(),
        "fingerstyle_roles.svg": fingerstyle_roles(),
        "percussion.svg": percussion(),
        "lyric_grid.svg": lyric_grid(),
        "slide_fill.svg": slide_fill(),
        "shape_shift.svg": shape_shift(),
        "grid_air.svg": uk_grid(
            "空刷：手照樣揮，只是不碰弦",
            "沒有空刷，拍子就會用「停下來等」來補，一停就亂",
            [("拍點", ["1", "&", "2", "&", "3", "&", "4", "&"]),
             ("手腕", ["↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑"]),
             ("實際", ["↓", "(↑)", "↓", "↑", "(↓)", "↑", "↓", "↑"])]),
        "degrees.svg": uk_degrees(),
        "harmonics_map.svg": uk_harmonics(),
        "mute.svg": uk_mute(),
        "ensemble.svg": uk_ensemble(),
        "phone.svg": uk_phone(),
        "cold_keys.svg": uk_cold_keys(),
        "accessories.svg": accessories(),
        "strum_dynamics.svg": strum_dynamics(),
        "wood_types.svg": wood_types(),
        "seventh_pair.svg": seventh_pair(),
        "faq_week1.svg": faq_week1(),
        "tuning_steps.svg": tuning_steps(),
        "warmup_steps.svg": warmup_steps(),
        "arrange_steps.svg": arrange_steps(),
        "chord_loop.svg": chord_loop(),
        "beats34_68.svg": beats34_68(),
        "transpose_grid.svg": transpose_grid(),
        "humidity.svg": humidity(),
        "note_values.svg": note_values(),
        "press_hand.svg": press_hand(),
        "wrist_pendulum.svg": wrist_pendulum(),
        "dynamics_timeline.svg": dynamics_timeline(),

        "semitone_keys.svg": semitone_keys(),
        "tab_4_0.svg": fig_tab("4_0"),
        "tab_4_1.svg": fig_tab("4_1"),
        "tab_7_0.svg": fig_tab("7_0"),
        "tab_11_0.svg": fig_tab("11_0"),
        "tab_11_1.svg": fig_tab("11_1"),
        "tab_15_0.svg": fig_tab("15_0"),
        "tab_19_1.svg": fig_tab("19_1"),
        "tab_20_0.svg": fig_tab("20_0"),
        "tab_21_0.svg": fig_tab("21_0"),
        "tab_22_0.svg": fig_tab("22_0"),
        "tab_23_0.svg": fig_tab("23_0"),
        "tab_19_0.svg": fig_tab("19_0"),


        "chunk8.svg": fig_step_grid("chunk8"),
        "reggae8.svg": fig_step_grid("reggae8"),
        "rumba8.svg": fig_step_grid("rumba8"),

        "uke-chords-dm-em-g.svg": fig_chord_block("uke-chords-dm-em-g"),
        "uke-chords-bb.svg": fig_chord_block("uke-chords-bb"),
        "uke-chords-d.svg": fig_chord_block("uke-chords-d"),
        "uke-chords-gm-c7.svg": fig_chord_block("uke-chords-gm-c7"),
        "uke-chords-maj7.svg": fig_chord_block("uke-chords-maj7"),

        "sizes.svg": sizes(),
        "anatomy.svg": anatomy(),
        "tuning.svg": tuning(),
        "chords_cafg.svg": chords(),
        "strum_folk.svg": strum_folk(),
        "fretboard.svg": fretboard(),
        "posture.svg": posture(),
        "strum_waltz.svg": strum_waltz(),
        "strum_chunk.svg": strum_chunk(),
        "barre.svg": barre(),
        "harmonics.svg": harmonics(),
        "lowg.svg": lowg(),
        "chord_read.svg": chord_read(),
        "picking.svg": picking(),
        "offbeat.svg": offbeat(),
        "fchords.svg": fchords(),
        "sevenths.svg": sevenths(),
        "restring.svg": restring(),
    }
    for name, content in figures.items():
        (OUT / name).write_text(content, encoding="utf-8")
        print(f"wrote {OUT / name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
