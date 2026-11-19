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


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    figures = {
        "sizes.svg": sizes(),
        "anatomy.svg": anatomy(),
        "tuning.svg": tuning(),
        "chords_cafg.svg": chords(),
        "strum_folk.svg": strum_folk(),
        "fretboard.svg": fretboard(),
    }
    for name, content in figures.items():
        (OUT / name).write_text(content, encoding="utf-8")
        print(f"wrote {OUT / name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
