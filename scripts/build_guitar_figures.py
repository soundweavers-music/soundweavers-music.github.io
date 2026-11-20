#!/usr/bin/env python3
"""流行吉他彈唱課程的示意圖產生器。

和人聲課一樣：圖由程式產生、共用一套線條與配色，不手寫 SVG、不用外部圖片。

和弦圖的座標規則（照標準和弦圖慣例）：
- 六條縱線由左到右＝第 6 弦（低音 E）到第 1 弦（高音 E）
- 最上面那條粗橫線是上弦枕；有格數標示時，最上面是該段的第一格
- 圓點＝按弦位置，點裡的數字＝手指（1 食指、2 中指、3 無名指、4 小指）
- 弦上方 `○`＝空弦、`✕`＝不彈

    python scripts/build_guitar_figures.py            # 全部
    python scripts/build_guitar_figures.py chords     # 只做指定幾張
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "assets" / "guitar"

BG = "#FBF8F4"
INK = "#3D3229"
MUTED = "#8C8078"
LINE = "#C9BCAA"
ACCENT = "#A67C52"
ACCENT_SOFT = "#F3E9DC"
FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif"

# 和弦資料：六條弦由低到高，-1＝不彈、0＝空弦、n＝按第 n 格；fingers 對應手指
CHORDS = {
    "C":     ([-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]),
    "G":     ([3, 2, 0, 0, 0, 3],  [2, 1, 0, 0, 0, 3]),
    "D":     ([-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]),
    "Am":    ([-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]),
    "Em":    ([0, 2, 2, 0, 0, 0],  [0, 1, 2, 0, 0, 0]),
    "Dm":    ([-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]),
    "G7":    ([3, 2, 0, 0, 0, 1],  [3, 2, 0, 0, 0, 1]),
    "C7":    ([-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0]),
    "Am7":   ([-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0]),
    "Cmaj7": ([-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]),
    "Dm7":   ([-1, -1, 0, 2, 1, 1], [0, 0, 0, 3, 1, 1]),
    "Em7":   ([0, 2, 2, 0, 3, 3],  [0, 1, 2, 0, 3, 4]),
    "Cadd9": ([-1, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4]),
    "F":     ([1, 3, 3, 2, 1, 1],  [1, 3, 4, 2, 1, 1]),
    "Bm":    ([-1, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1]),
    "D/F#":  ([2, -1, 0, 2, 3, 2], [1, 0, 0, 3, 4, 2]),
}


def t(x, y, s, size=12, anchor="middle", fill=INK, weight=None):
    s = str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    w = f' font-weight="{weight}"' if weight else ""
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}"{w}>{s}</text>')


def chord_diagram(name, x, y, w=96, h=118, frets=None, fingers=None, base_fret=1):
    """畫一個和弦圖。回傳 SVG 片段。"""
    frets = frets if frets is not None else CHORDS[name][0]
    fingers = fingers if fingers is not None else CHORDS[name][1]
    left = x + 14
    top = y + 26
    gap = (w - 28) / 5
    rows = 4
    rh = (h - 48) / rows

    g = [t(x + w / 2, y + 12, name, size=13, weight=700)]

    # 六條弦
    for i in range(6):
        sx = left + i * gap
        g.append(f'<line x1="{sx:.1f}" y1="{top}" x2="{sx:.1f}" y2="{top + rows * rh:.1f}" '
                 f'stroke="{LINE}" stroke-width="1"/>')

    # 格線
    for r in range(rows + 1):
        ly = top + r * rh
        sw = 3 if (r == 0 and base_fret == 1) else 1
        g.append(f'<line x1="{left}" y1="{ly:.1f}" x2="{left + 5 * gap}" y2="{ly:.1f}" '
                 f'stroke="{INK if sw == 3 else LINE}" stroke-width="{sw}"/>')

    if base_fret > 1:
        g.append(t(left - 4, top + rh * 0.75, str(base_fret), size=10, anchor="end", fill=MUTED))

    # 空弦／不彈
    for i in range(6):
        sx = left + i * gap
        if frets[i] == 0:
            g.append(f'<circle cx="{sx:.1f}" cy="{top - 9}" r="3.4" fill="none" stroke="{INK}" stroke-width="1.2"/>')
        elif frets[i] < 0:
            g.append(t(sx, top - 6, "✕", size=11, fill=MUTED))

    # 按弦點
    for i, f in enumerate(frets):
        if f <= 0:
            continue
        row = f - base_fret
        if row < 0 or row >= rows:
            continue
        cx = left + i * gap
        cy = top + (row + 0.5) * rh
        g.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{min(gap, rh) * 0.34:.1f}" fill="{ACCENT}"/>')
        if fingers[i]:
            g.append(t(cx, cy + 3.8, str(fingers[i]), size=10, fill="#FFFFFF", weight=700))
    return "\n".join(g)


def fig_chord_basics():
    """第一章要認的六個開放和弦。"""
    names = ["C", "G", "D", "Am", "Em", "Dm"]
    cols = 3
    cw, ch, pad = 150, 170, 24
    width = 640
    height = 96 + ch * 2 + 60
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="六個基礎開放和弦的按法">',
        '  <title>六個基礎開放和弦：C、G、D、Am、Em、Dm</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "六個基礎開放和弦怎麼按", size=16, anchor="start", weight=700),
        t(26, 55, "由左到右是第 6 弦到第 1 弦；點裡的數字是手指：1 食指、2 中指、3 無名指、4 小指", size=11.5, anchor="start", fill=MUTED),
    ]
    for i, name in enumerate(names):
        col, row = i % cols, i // cols
        x = pad + col * cw
        y = 82 + row * ch
        parts.append(chord_diagram(name, x, y, w=120, h=140))
    parts.append(t(26, height - 16, "○ 空弦　✕ 不彈；最上面那條粗線是上弦枕", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)




def fig_chord_hold():
    """10-1 的保留指四和弦：無名指與小指留在 2 弦 3 格、1 弦 3 格。

    這裡的 G 是「現代四指版」（3-2-0-0-3-3），和第一章的三指版 G 不同；
    保留指的關鍵就是多了 2 弦 3 格那一顆。
    """
    shapes = {
        "G":     ([3, 2, 0, 0, 3, 3], [2, 1, 0, 0, 3, 4]),
        "Em7":   ([0, 2, 2, 0, 3, 3], [0, 1, 2, 0, 3, 4]),
        "Cadd9": ([-1, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4]),
        "D/F#":  ([2, -1, 0, 2, 3, 2], [1, 0, 0, 3, 4, 2]),
    }
    names = ["G", "Em7", "Cadd9", "D/F#"]
    width, height = 640, 300
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="保留指四和弦：G、Em7、Cadd9、D/F#">',
        '  <title>保留指四和弦：G、Em7、Cadd9、D/F#</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "保留指的四顆和弦", size=16, anchor="start", weight=700),
        t(26, 55, "G（四指版）、Em7、Cadd9 的無名指與小指都停在 2 弦 3 格、1 弦 3 格；換到 D/F# 時小指仍留在 2 弦 3 格", size=11, anchor="start", fill=MUTED),
    ]
    for i, name in enumerate(names):
        frets, fingers = shapes[name]
        parts.append(chord_diagram(name, 30 + i * 150, 74, w=124, h=150,
                                   frets=frets, fingers=fingers))
    parts.append(t(26, height - 12, "○ 空弦　✕ 不彈；D/F# 的第 6 弦按第 2 格是低音 F#，D 的根音在第 2 弦第 3 格", size=10, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


def fig_barre():
    """12-2 的封閉和弦：F（6 弦橫按）與 Bm（5 弦橫按）。"""
    width, height = 640, 330
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="封閉和弦：F 與 Bm 的按法">',
        '  <title>封閉和弦：F 與 Bm</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "兩個必學的封閉和弦", size=16, anchor="start", weight=700),
        t(26, 55, "食指一次壓住整排弦（橫按），其餘三指補上；數字是手指，1 就是橫按的食指", size=11, anchor="start", fill=MUTED),
    ]
    parts.append(chord_diagram("F", 90, 80, w=150, h=190))
    parts.append(chord_diagram("Bm", 330, 80, w=150, h=190))
    parts.append(t(26, height - 12, "F = 133211（6 弦全按）；Bm = x24432（第 5 弦到第 1 弦）", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)




def fig_guitar_anatomy():
    """民謠吉他各部位（正面觀、直立擺放）。

    比例照真實的 dreadnought 量：琴身長約寬的 1.25 倍、腰身約在下半部 40% 處、
    弦長（上弦枕到琴橋）418 px、琴格依 2^(-n/12) 遞減間距，不是等分。
    """
    width, height = 640, 660
    cx = 320
    NUT, BRIDGE = 132, 548          # 上弦枕、琴橋（決定弦長）
    BODY_TOP, BODY_BOT = 300, 606
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="民謠吉他各部位名稱">',
        '  <title>民謠吉他的部位</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "民謠吉他的部位", size=16, anchor="start", weight=700),
        t(26, 55, "由上而下：琴頭、上弦枕、指板與琴格、琴身、響孔、琴橋", size=11.5, anchor="start", fill=MUTED),
    ]
    # 琴身：上窄、腰細、下寬（左右對稱的貝茲曲線）
    body = (f'M{cx-88} {BODY_TOP} '
            f'C{cx-112} {BODY_TOP+26} {cx-104} 372 {cx-86} 402 '
            f'C{cx-76} 420 {cx-74} 434 {cx-82} 456 '
            f'C{cx-106} 500 {cx-124} 552 {cx-98} 580 '
            f'C{cx-70} 604 {cx-28} 606 {cx} {BODY_BOT} '
            f'C{cx+28} 606 {cx+70} 604 {cx+98} 580 '
            f'C{cx+124} 552 {cx+106} 500 {cx+82} 456 '
            f'C{cx+74} 434 {cx+76} 420 {cx+86} 402 '
            f'C{cx+104} 372 {cx+112} {BODY_TOP+26} {cx+88} {BODY_TOP} Z')
    parts.append(f'<path d="{body}" fill="{ACCENT_SOFT}" stroke="{INK}" stroke-width="2"/>')
    # 琴頸／指板（往上愈窄：琴枕 50、接琴身處 66）
    neck = (f'<path d="M{cx-25} {NUT} L{cx+25} {NUT} L{cx+33} {BODY_TOP} L{cx-33} {BODY_TOP} Z" '
            f'fill="#EDE3D6" stroke="{INK}" stroke-width="1.4"/>')
    parts.append(neck)
    # 指板延伸到琴身上（19 格），琴格才不會浮在琴身上面
    ext_bottom = NUT + (BRIDGE - NUT) * (1 - 2 ** (-19 / 12))
    parts.append(f'<rect x="{cx-33}" y="{BODY_TOP}" width="66" '
                 f'height="{ext_bottom - BODY_TOP:.1f}" fill="#EDE3D6" stroke="{INK}" stroke-width="1.2"/>')
    # 琴格：2^(-n/12) 真實間距
    scale = BRIDGE - NUT
    for n in range(1, 20):
        y = NUT + scale * (1 - 2 ** (-n / 12))
        half = 25 + (33 - 25) * (y - NUT) / (BODY_TOP - NUT)
        parts.append(f'<line x1="{cx-half:.1f}" y1="{y:.1f}" x2="{cx+half:.1f}" y2="{y:.1f}" '
                     f'stroke="{MUTED}" stroke-width="0.9" opacity=".8"/>')
    # 弦：六條，往琴橋方向微微變寬
    for i in range(6):
        x1 = cx - 20 + i * 8
        x2 = cx - 27.5 + i * 11
        w = 0.7 + i * 0.12
        parts.append(f'<line x1="{x1}" y1="{NUT}" x2="{x2:.1f}" y2="{BRIDGE}" '
                     f'stroke="{INK}" stroke-width="{w:.2f}" opacity=".55"/>')
    # 上弦枕
    parts.append(f'<rect x="{cx-27}" y="{NUT-7}" width="54" height="7" fill="{INK}"/>')
    # 琴頭（上寬下窄，兩側各三顆弦鈕）
    parts.append(f'<path d="M{cx-27} {NUT-7} L{cx-31} 74 L{cx+31} 74 L{cx+27} {NUT-7} Z" '
                 f'fill="#EDE3D6" stroke="{INK}" stroke-width="1.4"/>')
    for i in range(3):
        parts.append(f'<circle cx="{cx-20}" cy="{88+i*17}" r="4.6" fill="{BG}" stroke="{INK}" stroke-width="1.2"/>')
        parts.append(f'<circle cx="{cx+20}" cy="{88+i*17}" r="4.6" fill="{BG}" stroke="{INK}" stroke-width="1.2"/>')
    # 響孔與琴橋
    parts.append(f'<circle cx="{cx}" cy="452" r="32" fill="{BG}" stroke="{INK}" stroke-width="1.6"/>')
    parts.append(f'<rect x="{cx-42}" y="{BRIDGE-6}" width="84" height="13" rx="3" fill="#DCCDBB" stroke="{INK}" stroke-width="1.2"/>')

    def label(txt, ax, ay, lx, ly):
        parts.append(f'<path d="M{ax} {ay} L{lx} {ly}" stroke="{MUTED}" stroke-width="1" fill="none"/>')
        parts.append(f'<circle cx="{ax}" cy="{ay}" r="2.6" fill="{MUTED}"/>')
        parts.append(t(lx + (8 if lx > ax else -8), ly + 4, txt, size=12,
                       anchor="start" if lx > ax else "end"))

    label("琴頭 Headstock", cx + 30, 96, 400, 88)
    label("弦鈕 Tuning Pegs", cx + 20, 122, 400, 120)
    label("上弦枕 Nut", cx + 27, NUT, 400, 160)
    label("指板與琴格 Frets", cx - 30, 220, 150, 216)
    label("琴身 Body", cx - 112, 360, 120, 340)
    label("響孔 Soundhole", cx - 30, 452, 150, 452)
    label("琴橋 Bridge", cx - 42, BRIDGE, 130, BRIDGE + 4)
    label("弦 Strings（六條）", cx + 10, 250, 400, 248)

    parts.append(t(26, height - 14, "第 1 弦是最細的高音 E，第 6 弦是最粗的低音 E；和弦圖的左右順序就是照這張圖。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "@@NL@@".join(parts).replace("@@NL@@", chr(10))

BEATS = ["1", "&", "2", "&", "3", "&", "4", "&"]
ARROWS = ["↓", "-", "↓", "↑", "↓", "-", "↓", "↑"]

# ---------------------------------------------------------------------------
# 六線譜（TAB）的共用工具
# ---------------------------------------------------------------------------

STRING_LABELS = {1: "第 1 弦　E", 2: "第 2 弦　B", 3: "第 3 弦　G",
                 4: "第 4 弦　D", 5: "第 5 弦　A", 6: "第 6 弦　E"}
TAB_ROW = 16          # 弦與弦的間距
LABEL_W = 76          # 左邊弦名欄寬
BEATS4 = ["1", "2", "3", "4"]


def _tab_grid(x, y, w, labels=True, label_fill=MUTED):
    """六條弦線（第 1 弦在最上面）。"""
    g = []
    for i in range(6):
        yy = y + i * TAB_ROW
        g.append(f'<line x1="{x:.1f}" y1="{yy:.1f}" x2="{x + w:.1f}" y2="{yy:.1f}" '
                 f'stroke="{INK}" stroke-width="1" opacity=".38"/>')
        if labels:
            g.append(t(x - 10, yy + 4, STRING_LABELS[i + 1], size=9.5, anchor="end", fill=label_fill))
    return g


def _tab_notes(x, y, w, slots, notes):
    """notes = {弦號: {格位: 文字}}；文字畫在弦線上，底下墊一塊背景遮掉弦線。"""
    g = []
    colw = w / slots
    for s, positions in notes.items():
        yy = y + (s - 1) * TAB_ROW
        for slot, fret in positions.items():
            cx = x + (slot + 0.5) * colw
            g.append(f'<rect x="{cx - 8:.1f}" y="{yy - 7:.1f}" width="16" height="14" fill="{BG}"/>')
            g.append(t(cx, yy + 4, fret, size=11, fill=ACCENT, weight=700))
    return g


def _tab_row_of(texts, x, y, w, size=10, fill=MUTED, weight=None):
    g, colw = [], w / len(texts)
    for i, s in enumerate(texts):
        if s:
            g.append(t(x + (i + 0.5) * colw, y, s, size=size, fill=fill, weight=weight))
    return g


def _bar_lines(x, y, w, bar_left=True):
    """小節線。y 是第 1 弦的位置。"""
    top, bottom = y - 7, y + 5 * TAB_ROW + 7
    g = [f'<line x1="{x + w:.1f}" y1="{top:.1f}" x2="{x + w:.1f}" y2="{bottom:.1f}" '
         f'stroke="{INK}" stroke-width="1.6"/>']
    if bar_left:
        g.append(f'<line x1="{x:.1f}" y1="{top:.1f}" x2="{x:.1f}" y2="{bottom:.1f}" '
                 f'stroke="{INK}" stroke-width="1.6"/>')
    return g


def _align_row(parts, y, chords, lyric, colw=64, left=26):
    """一格一拍的對齊列：和弦｜拍點｜刷法｜歌詞。"""
    parts.append(t(left - 6, y + 4, chords[0], size=12.5, anchor="end", weight=700))
    for i, b in enumerate(BEATS):
        x = left + i * colw + colw / 2
        parts.append(t(x, y + 4, b, size=11.5, fill=MUTED))
    parts.append(t(left - 6, y + 26, chords[1], size=12.5, anchor="end", weight=700))
    for i, a in enumerate(ARROWS):
        x = left + i * colw + colw / 2
        parts.append(t(x, y + 26, a, size=13, fill=ACCENT, weight=700))
    for i, ch in enumerate(lyric):
        x = left + i * colw + colw / 2
        if ch and ch != "空":
            parts.append(t(x, y + 50, ch, size=14))
        else:
            parts.append(t(x, y + 50, "·", size=13, fill=MUTED))
    # 格線
    for i in range(len(BEATS) + 1):
        x = left + i * colw
        parts.append(f'<line x1="{x}" y1="{y - 14}" x2="{x}" y2="{y + 60}" stroke="{LINE}" stroke-width="1" opacity=".7"/>')
    parts.append(f'<line x1="{left}" y1="{y + 60}" x2="{left + len(BEATS) * colw}" y2="{y + 60}" stroke="{LINE}" stroke-width="1" opacity=".7"/>')


def fig_lyric_alignment():
    """第 8 章：〈擁抱〉逐拍對齊。一格一拍，歌詞落在格子裡就不會跑掉。"""
    rows = [
        ("主歌", ("C", "Em"), list("脫下長日的假面空")),
        ("", ("Am", "G"), list("南瓜馬車的午夜空")),
        ("", ("C", "Em"), list("奔向夢幻的疆界空")),
        ("", ("Am", "G"), list("換上童話的玻璃鞋")),
        ("副歌", ("C", "Em"), list("抱緊我空空吻我空")),
        ("", ("Am", "G"), list("愛空別走空空空空")),
        ("", ("C", "Em"), list("隱藏自己的疲倦空")),
        ("", ("Am", "G"), list("表達自己的狼狽空")),
    ]
    width, height = 640, 96 + len(rows) * 84 + 40
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="擁抱逐拍歌詞對齊譜">',
        '  <title>〈擁抱〉逐拍對齊譜</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "〈擁抱〉逐拍對齊：一個格子就是一個拍點", size=16, anchor="start", weight=700),
        t(26, 55, "最上面是和弦與拍點，中間是刷弦方向，最下面是歌詞；「·」代表這個位置沒有字，但右手照樣要刷", size=11, anchor="start", fill=MUTED),
    ]
    for i, (label, chords, lyric) in enumerate(rows):
        y = 96 + i * 84
        if label:
            parts.append(t(26, y - 22, label, size=12, anchor="start", weight=700, fill=ACCENT))
        _align_row(parts, y, chords, lyric)
    parts.append(t(26, height - 14, "速度 74 BPM；刷法 ↓ - ↓↑ ↓ - ↓↑（每兩格一組，第二格是回程的空揮）", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "@@NL@@".join(parts).replace("@@NL@@", chr(10))


def fig_tab_reading():
    """3-1：六線譜的讀法。六條線＝六條弦，數字＝左手按第幾格。"""
    width, height = 640, 330
    left, right = 118, 470
    top, step = 96, 19
    marks = {1: (168, "0"), 2: (218, "1"), 3: (268, "0"),
             4: (318, "2"), 5: (368, "3"), 6: (418, "3")}
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="六線譜的結構：六條橫線由第 1 弦到第 6 弦，數字是琴格">',
        '  <title>六線譜怎麼看</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "六線譜（TAB）：最上面是第 1 弦，不是第 6 弦", size=16, anchor="start", weight=700),
        t(26, 55, "六條橫線由上到下＝第 1 弦（最細）到第 6 弦（最粗）；線上的數字是左手要按第幾格", size=11.5, anchor="start", fill=MUTED),
    ]
    for i in range(6):
        y = top + i * step
        parts.append(f'<line x1="{left}" y1="{y}" x2="{right}" y2="{y}" stroke="{INK}" stroke-width="1" opacity=".45"/>')
        parts.append(t(left - 12, y + 4, STRING_LABELS[i + 1], size=10, anchor="end", fill=MUTED))
    for s, (x, fret) in marks.items():
        y = top + (s - 1) * step
        parts.append(f'<rect x="{x - 9}" y="{y - 8}" width="18" height="16" fill="{BG}"/>')
        parts.append(t(x, y + 5, fret, size=13, fill=ACCENT, weight=700))
    # 讀取方向
    parts.append(f'<path d="M{left} {top + 5 * step + 34} L{right} {top + 5 * step + 34}" stroke="{ACCENT}" stroke-width="1.4" fill="none"/>')
    parts.append(f'<path d="M{right} {top + 5 * step + 34} l-7 -4 v8 z" fill="{ACCENT}"/>')
    parts.append(t((left + right) / 2, top + 5 * step + 28, "由左往右依序彈", size=11, fill=ACCENT))
    for i, line in enumerate([
            "① 最上面那一條＝第 1 弦（最細的高音 E）；最下面＝第 6 弦（最粗的低音 E）",
            "② 數字＝左手按住第幾格。寫在第 3 弦那條線上，就是按第 3 弦",
            "③ 0 ＝ 空弦，左手不按，右手直接撥",
            "④ 同一條垂直線上疊起來的數字＝同時發聲（例：刷一個 C 和弦）"]):
        parts.append(t(26, 232 + i * 22, line, size=11, anchor="start", fill=INK))
    parts.append(t(26, height - 12, "由上往下讀＝由細弦往粗弦；和弦圖的左右順序是反過來的，兩張表不要混著背", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


def fig_chord_diagram_reading():
    """3-2：和弦指法圖的讀法（以 C 和弦為例）。"""
    width, height = 640, 492
    dx, dy = 200, 118
    dw, dh = 190, 230
    left = dx + 14
    top = dy + 26
    gap = (dw - 28) / 5
    rh = (dh - 48) / 4
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="和弦指法圖的讀法，以 C 和弦為例">',
        '  <title>和弦指法圖怎麼讀</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "和弦指法圖怎麼讀（以 C 和弦為例）", size=16, anchor="start", weight=700),
        t(26, 55, "圖是「把琴直立起來正面看」：左邊是第 6 弦，上面是琴頭那一端", size=11.5, anchor="start", fill=MUTED),
        chord_diagram("C", dx, dy, w=dw, h=dh),
    ]
    # 弦號與格數
    for i in range(6):
        parts.append(t(left + i * gap, top + 4 * rh + 20, str(6 - i), size=10.5, fill=MUTED))
    for r in range(4):
        parts.append(t(left + 5 * gap + 14, top + (r + 0.5) * rh + 4, f"第 {r + 1} 格", size=10, anchor="start", fill=MUTED))
    # 琴頭上的 ○ / ✕
    parts.append(f'<path d="M{left} {top - 16} L{left} {top - 24}" stroke="{MUTED}" stroke-width="1"/>')
    parts.append(t(left, top - 30, "✕ 不刷", size=10.5, fill=INK))
    parts.append(f'<path d="M{left + 2 * gap:.1f} {top - 16} L{left + 2 * gap:.1f} {top - 24}" stroke="{MUTED}" stroke-width="1"/>')
    parts.append(t(left + 2 * gap, top - 30, "○ 空弦", size=10.5, fill=INK))
    # 上弦枕
    parts.append(f'<path d="M{left - 10} {top} L{left - 26} {top}" stroke="{MUTED}" stroke-width="1"/>')
    parts.append(t(left - 30, top + 4, "上弦枕 Nut", size=10.5, anchor="end", fill=INK))
    lines = [
        "○ ＝ 空弦：左手不按，但右手要刷到",
        "✕ ＝ 不刷：和弦外音，右手要避開",
        "● 裡的數字是建議手指：1 食指、2 中指、3 無名指、4 小指",
        "最左邊的直線是第 6 弦，最右邊是第 1 弦；最上面那條粗線是上弦枕，往下一格一格數",
    ]
    for i, line in enumerate(lines):
        parts.append(t(26, 404 + i * 21, line, size=11, anchor="start", fill=INK))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


def fig_chromatic_walk():
    """4-1：1-2-3-4 爬格子。每一條弦都用 1、2、3、4 指依序按 1、2、3、4 格。"""
    width, height = 640, 360
    left, colw, top, rowh = 24, 124, 96, 34
    names = ["食指", "中指", "無名指", "小指"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="1-2-3-4 爬格子練習：六條弦各按 1 到 4 格">',
        '  <title>1-2-3-4 爬格子</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "1-2-3-4 爬格子：一格一指，按下去就不抬起來", size=16, anchor="start", weight=700),
        t(26, 55, "每一條弦都依序按第 1、2、3、4 格（食指、中指、無名指、小指）；第 6 弦爬完換第 5 弦", size=11.5, anchor="start", fill=MUTED),
    ]
    for i, string in enumerate([6, 5, 4, 3, 2, 1]):
        y = top + i * rowh
        parts.append(t(left + 4, y + 16, f"第 {string} 弦", size=12, anchor="start", weight=700))
        for fret in range(1, 5):
            x = left + 84 + (fret - 1) * colw
            parts.append(f'<rect x="{x}" y="{y}" width="{colw - 16}" height="24" rx="6" '
                         f'fill="{ACCENT_SOFT}" stroke="{LINE}" stroke-width="1"/>')
            parts.append(t(x + (colw - 16) / 2 - 20, y + 16, f"{fret} 格", size=11, fill=INK, weight=700))
            parts.append(t(x + (colw - 16) / 2 + 22, y + 16, names[fret - 1], size=9.5, fill=MUTED))
    # 進行方向
    parts.append(f'<path d="M{width - 12} {top} L{width - 12} {top + 5 * rowh + 24}" stroke="{ACCENT}" stroke-width="1.4" fill="none"/>')
    parts.append(f'<path d="M{width - 12} {top + 5 * rowh + 24} l-4 -7 h8 z" fill="{ACCENT}"/>')
    parts.append(t(26, height - 40, "節拍器 60 BPM，一拍一個音：先爬完第 6 弦，再換第 5 弦，最後到第 1 弦。", size=11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "四根手指都留在弦上不要抬（保留指）；抬得越高，按回來就越慢。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


C_MAJOR_SCALE = {
    6: {0: "E", 1: "F", 3: "G"},
    5: {0: "A", 2: "B", 3: "C"},
    4: {0: "D", 2: "E", 3: "F"},
    3: {0: "G", 2: "A"},
    2: {0: "B", 1: "C", 3: "D"},
    1: {0: "E", 1: "F", 3: "G"},
}
SOLFEGE = {"C": "Do", "D": "Re", "E": "Mi", "F": "Fa", "G": "Sol", "A": "La", "B": "Si"}


def fig_c_major_scale():
    """4-2：第一把位（第 0～3 格）的 C 大調音階地圖。"""
    width, height = 640, 380
    left, colw, top, rowh = 24, 124, 106, 36
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="第一把位 C 大調音階位置圖">',
        '  <title>第一把位 C 大調音階地圖</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "第一把位 C 大調音階：第 0～3 格的音在哪裡", size=16, anchor="start", weight=700),
        t(26, 55, "格子裡是音名與唱名；沒有格子的位置不屬於 C 大調，初學階段先跳過", size=11.5, anchor="start", fill=MUTED),
    ]
    for fret, label in enumerate(["空弦 (0)", "第 1 格", "第 2 格", "第 3 格"]):
        x = left + 84 + fret * colw
        parts.append(t(x + (colw - 16) / 2, 90, label, size=10.5, fill=MUTED))
    for i, string in enumerate([1, 2, 3, 4, 5, 6]):
        y = top + i * rowh
        parts.append(t(left + 4, y + 20, f"第 {string} 弦", size=12, anchor="start", weight=700))
        for fret in range(4):
            x = left + 84 + fret * colw
            w = colw - 16
            note = C_MAJOR_SCALE[string].get(fret)
            if note:
                parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="28" rx="7" '
                             f'fill="{ACCENT_SOFT}" stroke="{LINE}" stroke-width="1"/>')
                parts.append(t(x + w / 2 - 12, y + 19, note, size=12.5, weight=700))
                parts.append(t(x + w / 2 + 16, y + 19, SOLFEGE[note], size=10, fill=MUTED))
            else:
                parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="28" rx="7" '
                             f'fill="none" stroke="{LINE}" stroke-width="1" stroke-dasharray="3 4"/>')
    parts.append(t(26, height - 42, "口訣：第 0 格用空弦、第 1 格用食指、第 2 格用中指、第 3 格用無名指。", size=11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "低音 Do 在第 5 弦第 3 格；高音 Do 在第 2 弦第 1 格。先記這兩顆，其餘用音階關係推。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


TWINKLE = [
    {"chord": "", "notes": {5: {0: "3", 1: "3"}, 3: {2: "0", 3: "0"}},
     "jianpu": ["1", "1", "5", "5"], "lyric": ["一", "閃", "一", "閃"]},
    {"chord": "", "notes": {3: {0: "2", 1: "2"}, 2: {}}, "jianpu": ["6", "6", "5", ""],
     "lyric": ["亮", "晶", "晶", "·"]},
    {"chord": "", "notes": {4: {0: "3", 1: "3", 2: "2", 3: "2"}}, "jianpu": ["4", "4", "3", "3"],
     "lyric": ["滿", "天", "都", "是"]},
    {"chord": "", "notes": {4: {0: "0", 1: "0"}, 5: {2: "3", 3: "3"}}, "jianpu": ["2", "2", "1", ""],
     "lyric": ["小", "星", "星", "·"]},
    {"chord": "", "notes": {3: {0: "0", 1: "0"}, 4: {2: "3", 3: "3"}}, "jianpu": ["5", "5", "4", "4"],
     "lyric": ["掛", "在", "天", "空"]},
    {"chord": "", "notes": {4: {0: "2", 1: "2", 2: "0", 3: "0"}}, "jianpu": ["3", "3", "2", ""],
     "lyric": ["放", "光", "明", "·"]},
    {"chord": "", "notes": {3: {0: "0", 1: "0"}, 4: {2: "3", 3: "3"}}, "jianpu": ["5", "5", "4", "4"],
     "lyric": ["好", "像", "許", "多"]},
    {"chord": "", "notes": {4: {0: "2", 1: "2", 2: "0", 3: "0"}}, "jianpu": ["3", "3", "2", ""],
     "lyric": ["小", "眼", "睛", "·"]},
]


def fig_twinkle():
    """4-3：〈小星星〉單音六線譜，一小節四拍。"""
    width, height = 640, 500
    left, top, bar_w = LABEL_W + 8, 104, (width - LABEL_W - 40) / 4
    rows = [TWINKLE[:4], TWINKLE[4:]]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="小星星單音六線譜">',
        '  <title>〈小星星〉單音六線譜</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "〈小星星〉：C 大調、4/4 拍、一分鐘 72 拍", size=16, anchor="start", weight=700),
        t(26, 55, "上面是簡譜，中間是六線譜，下面是歌詞；一個格子一拍，「·」代表這一拍不彈、讓上一個音延續", size=11.5, anchor="start", fill=MUTED),
    ]
    for r, bars in enumerate(rows):
        y = top + r * 196
        for b, bar in enumerate(bars):
            x = left + b * bar_w
            parts += _tab_grid(x, y, bar_w, labels=(b == 0))
            parts += _tab_notes(x, y, bar_w, 4, bar["notes"])
            parts += _bar_lines(x, y, bar_w, bar_left=(b == 0))
            parts += _tab_row_of(bar["jianpu"], x, y + 5 * TAB_ROW + 20, bar_w, size=10.5, fill=ACCENT, weight=700)
            parts += _tab_row_of(bar["lyric"], x, y + 5 * TAB_ROW + 40, bar_w, size=12.5, fill=INK)
            if b == 0:
                parts.append(t(x - 10, y + 5 * TAB_ROW + 20, "簡譜", size=9.5, anchor="end", fill=MUTED))
                parts.append(t(x - 10, y + 5 * TAB_ROW + 40, "歌詞", size=9.5, anchor="end", fill=MUTED))
    parts.append(t(26, height - 40, "第 5 弦第 3 格是低音 Do，第 2 弦第 1 格是高音 Do；這首只用到中央這一段。", size=11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "手指：第 3 格＝無名指、第 2 格＝中指、0＝空弦。右手用大拇指往下撥或 Pick 往下撥都可以。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


SCALE_RUN = [
    ("1", 5, "3", "3"), ("2", 4, "0", ""), ("3", 4, "2", "2"), ("4", 4, "3", "3"),
    ("5", 3, "0", ""), ("6", 3, "2", "2"), ("7", 2, "0", ""), ("i", 2, "1", "1"),
    ("7", 2, "0", ""), ("6", 3, "2", "2"), ("5", 3, "0", ""), ("4", 4, "3", "3"),
    ("3", 4, "2", "2"), ("2", 4, "0", ""), ("1", 5, "3", "3"),
]


def fig_scale_run():
    """4-2：C 大調第一把位上下行（一個音一拍，共 15 拍）。"""
    width, height = 640, 330
    left, top = LABEL_W + 10, 116
    tab_w = width - left - 30
    slots = len(SCALE_RUN)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="C 大調第一把位上下行音階">',
        '  <title>C 大調第一把位上下行</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "C 大調上下行：Do 到高音 Do 再回到 Do", 16, anchor="start", weight=700),
        t(26, 55, "一個音一拍，速度 60～70 BPM。上面是簡譜、中間是六線譜、下面是指法", 11.5, anchor="start", fill=MUTED),
    ]
    parts += _tab_grid(left, top, tab_w, labels=True)
    colw = tab_w / slots
    for i, (jp, string, fret, _) in enumerate(SCALE_RUN):
        cx = left + (i + 0.5) * colw
        y = top + (string - 1) * TAB_ROW
        parts.append(f'<rect x="{cx - 9:.1f}" y="{y - 7:.1f}" width="18" height="14" fill="{BG}"/>')
        parts.append(t(cx, y + 4, fret, size=11, fill=ACCENT, weight=700))
    for i, (jp, _, _, finger) in enumerate(SCALE_RUN):
        cx = left + (i + 0.5) * colw
        parts.append(t(cx, top - 16, jp, size=12, fill=INK, weight=700))
        parts.append(t(cx, top + 5 * TAB_ROW + 22, finger or "○", size=10.5, fill=MUTED))
    for i in range(slots + 1):
        x = left + i * colw
        strong = i % 4 == 0
        parts.append(f'<line x1="{x:.1f}" y1="{top - 26}" x2="{x:.1f}" y2="{top + 5 * TAB_ROW + 34}" '
                     f'stroke="{LINE if not strong else MUTED}" stroke-width="1"/>')
    parts.append(t(left - 10, top - 16, "簡譜", 9.5, anchor="end", fill=MUTED))
    parts.append(t(left - 10, top + 5 * TAB_ROW + 22, "手指", 9.5, anchor="end", fill=MUTED))
    parts.append(t(26, height - 40, "空弦寫「0」、不按弦；其他都是第 1 格食指、第 2 格中指、第 3 格無名指。", 11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "第 5 弦第 3 格的低音 Do 只有一顆，第 2 弦第 1 格才是高音 Do。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


HAPPY_BIRTHDAY = [
    (["5", "5", "6", "", "5", ""], ["祝", "你", "生", "", "日", ""]),
    (["1′", "", "7", "", "", ""], ["快", "", "樂", "", "", ""]),
    (["5", "5", "6", "", "5", ""], ["祝", "你", "生", "", "日", ""]),
    (["2′", "", "1′", "", "", ""], ["快", "", "樂", "", "", ""]),
    (["5", "5", "5′", "", "3", ""], ["祝", "你", "生", "", "日", ""]),
    (["1", "", "7", "", "6", ""], ["快", "", "樂", "", "呀", ""]),
    (["4", "4", "3", "", "1", ""], ["祝", "你", "生", "", "日", ""]),
    (["2", "", "1", "", "", ""], ["快", "", "樂", "", "", ""]),
]
# 簡譜 → 第一把位的（弦, 格）
JIANPU_TO_TAB = {
    "1": (5, "3"), "2": (4, "0"), "3": (4, "2"), "4": (4, "3"),
    "5": (3, "0"), "6": (3, "2"), "7": (2, "0"),
    "1′": (2, "1"), "2′": (2, "3"), "5′": (1, "3"),
}


def fig_happy_birthday():
    """4-4：〈祝你生日快樂〉——公有領域、旋律沒有版本爭議的實唱曲。"""
    width, height = 640, 530
    left, top = LABEL_W + 10, 110
    bar_w = (width - left - 24) / 4
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="祝你生日快樂單音六線譜">',
        '  <title>〈祝你生日快樂〉單音六線譜</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "〈祝你生日快樂〉：C 大調、3/4 拍、一分鐘 80 拍", 16, anchor="start", weight=700),
        t(26, 55, "這首在美國與歐盟都已進入公有領域，旋律沒有版本爭議，很適合拿來驗收第一把位", 11.5, anchor="start", fill=MUTED),
    ]
    for r, chunk in enumerate([HAPPY_BIRTHDAY[:4], HAPPY_BIRTHDAY[4:]]):
        y = top + r * 190
        for b, (notes, lyric) in enumerate(chunk):
            x = left + b * bar_w
            spots = {}
            jianpu = [""] * 6
            for i, token in enumerate(notes):
                if not token:
                    continue
                jianpu[i] = token
                s, f = JIANPU_TO_TAB[token]
                spots.setdefault(s, {})[i] = f
            parts += _tab_grid(x, y, bar_w, labels=(b == 0))
            parts += _tab_notes(x, y, bar_w, 6, spots)
            parts += _bar_lines(x, y, bar_w, bar_left=(b == 0))
            parts += _tab_row_of(jianpu, x, y + 5 * TAB_ROW + 20, bar_w, size=10.5, fill=ACCENT, weight=700)
            parts += _tab_row_of(lyric, x, y + 5 * TAB_ROW + 40, bar_w, size=12.5, fill=INK)
            if b == 0:
                parts.append(t(x - 10, y + 5 * TAB_ROW + 20, "簡譜", size=9.5, anchor="end", fill=MUTED))
                parts.append(t(x - 10, y + 5 * TAB_ROW + 40, "歌詞", size=9.5, anchor="end", fill=MUTED))
    parts.append(t(26, height - 40, "每小節三拍：第 1 拍是兩個八分音符（祝—你），第 2、3 拍各一個四分音符。", 11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "高音 Do 在第 2 弦第 1 格、高音 Re 在第 2 弦第 3 格、高音 Sol 在第 1 弦第 3 格。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


def fig_arpeggio_study(title, subtitle, bars, footer):
    """把和弦進行畫成八音分解練習。bars = [(和弦, {弦: {格位: 文字}}, 錘音格位或 None)]"""
    width = 640
    left = LABEL_W + 10
    bar_w = (width - left - 24) / 2
    rows = (len(bars) + 1) // 2
    height = 104 + rows * 130
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, title, 16, anchor="start", weight=700),
        t(26, 55, subtitle, 11.5, anchor="start", fill=MUTED),
    ]
    for idx, (chord, notes, hammer) in enumerate(bars):
        r, c = idx // 2, idx % 2
        x = left + c * bar_w
        y = 104 + r * 130
        parts += _tab_grid(x, y, bar_w, labels=(c == 0))
        parts += _tab_notes(x, y, bar_w, 8, notes)
        parts += _bar_lines(x, y, bar_w, bar_left=(c == 0))
        parts.append(t(x + bar_w / 2, y - 12, chord, 12.5, fill=INK, weight=700))
        if hammer is not None:
            hx = x + (hammer + 0.5) * (bar_w / 8)
            parts.append(t(hx, y - 2, "H", 9.5, fill=ACCENT, weight=700))
        parts += _tab_row_of(["1", "&", "2", "&", "3", "&", "4", "&"], x, y + 5 * TAB_ROW + 20, bar_w, size=9.5)
    parts.append(t(26, height - 14, footer, 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


def fig_sunny_study():
    """10-3：以 Em7–Cadd9–G–D/F# 做的分解練習（不是原曲逐音採譜）。"""
    bars = [
        ("Em7", {6: {0: "0"}, 3: {1: "0", 3: "0", 5: "0", 7: "0"},
                 2: {2: "3", 6: "3"}, 1: {4: "3"}}, None),
        ("Cadd9", {5: {0: "3"}, 3: {1: "0", 3: "0", 5: "0", 7: "0"},
                   2: {2: "3", 6: "3"}, 1: {4: "3"}}, None),
        ("G", {6: {0: "3"}, 3: {1: "0", 3: "0", 5: "0", 7: "0"},
               2: {2: "3", 6: "3"}, 1: {4: "3"}}, None),
        ("D/F#", {6: {0: "2"}, 3: {1: "2", 3: "2", 5: "2", 7: "2"},
                  2: {2: "3", 6: "3"}, 1: {4: "2"}}, None),
    ]
    return fig_arpeggio_study(
        "G 調四和弦的分解練習：大拇指撥根音，其餘手指守在高音弦",
        "Em7、Cadd9、G 的無名指與小指全程停在 2 弦 3 格與 1 弦 3 格；這是以這組和弦做的練習，不是原曲逐音採譜",
        bars,
        "八個音一循環：根音 → 3 弦 → 2 弦 → 3 弦 → 1 弦 → 3 弦 → 2 弦 → 3 弦。速度先從 60 BPM 開始，換和弦時只動大拇指。")


def fig_turan_study():
    """16-2：以 C–G/B–Am7–Am7/G–F–C/E–Dm7–G 練 4 弦錘音裝飾。"""
    def bar(bass_string, bass_fret, third, second, first, hammer=False):
        notes = {bass_string: {0: bass_fret},
                 3: {1: third, 3: third, 5: third},
                 2: {2: second}, 1: {4: first}}
        if hammer:
            notes[3] = {1: third, 3: third, 5: third}
            notes[4] = {6: "0", 7: "2"}
        else:
            notes[3][7] = third
        return notes

    bars = [
        ("C", bar(5, "3", "0", "1", "0", hammer=True), 7),
        ("G/B", bar(5, "2", "0", "0", "3"), None),
        ("Am7", bar(5, "0", "0", "1", "0", hammer=True), 7),
        ("Am7/G", bar(6, "3", "2", "1", "0"), None),
        ("F", bar(6, "1", "2", "1", "1"), None),
        ("C/E", bar(6, "0", "0", "1", "0"), None),
        ("Dm7", bar(4, "0", "2", "1", "1"), None),
        ("G", bar(6, "3", "0", "3", "3"), None),
    ]
    return fig_arpeggio_study(
        "跟著進行練錘音：C 與 Am7 的第 4 拍在 4 弦做 0 → 2",
        "和弦是這首歌的進行（C–G/B–Am7–Am7/G–F–C/E–Dm7–G）；下面的分解與錘音是練習用的編排，不是原曲採譜",
        bars,
        "低音一路往下：C → B → A → G → F → E → D → G。標 H 的位置右手不撥，用中指敲第 4 弦第 2 格。")


# ---------------------------------------------------------------------------
# 和弦＋刷法＋歌詞的練習譜（由原本的純文字譜面整理而成）
# ---------------------------------------------------------------------------
# ----------------------------------------------------------------- 歌詞對拍圖
# 原本第 5 章有兩段用空白與框線排的 ASCII 譜（和弦／刷法／拍數／歌詞四層）。
# 方框線在網頁上會隨字型跑掉，改成畫出來的圖。
LYRIC_CHARTS = {
    "ch5verse": (
        "〈小薇〉主歌：C → Am → Dm（或 Fmaj7）→ G",
        "每小節四拍、第 1 拍下刷；歌詞下方對齊的是拍點，不是字數",
        [[("C", "有一個美"), ("Am", "麗的小女"), ("Dm", "孩"), ("G", "她的名字")],
         [("C", "叫作小"), ("Am", "薇"), ("Dm", "她有雙溫"), ("G", "柔的眼")],
         [("C", "—"), ("Am", "—"), ("Dm", "—"), ("G", "→ C")]],
    ),
    "ch5chorus": (
        "〈小薇〉副歌：C → Am → Fmaj7 → G",
        "同樣四小節一循環；副歌把第 2、4 拍刷滿，情緒就推上去了",
        [[("C", "小薇啊"), ("Am", "你可知道"), ("Fmaj7", "我多愛"), ("G", "你")],
         [("C", "我要帶你"), ("Am", "飛到天上"), ("Fmaj7", "去"), ("G", "看看那顆")],
         [("C", "星"), ("Am", "—"), ("Fmaj7", "摘下一"), ("G", "顆")]],
    ),
}


def fig_lyric_chart(key):
    """和弦／刷法／拍數／歌詞四層對齊的練習譜（一行四個小節）。"""
    title, subtitle, rows = LYRIC_CHARTS[key]
    w, margin = 760, 24
    bar_w = (w - margin * 2) / 4
    row_h = 92
    h = 104 + len(rows) * row_h + 26
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">',
         f'<title>{title}</title>',
         f'<rect width="{w}" height="{h}" fill="{BG}"/>',
         t(margin, 34, title, 15, anchor="start", weight=700),
         t(margin, 55, subtitle, 11.5, anchor="start", fill=MUTED)]
    y = 96
    for row in rows:
        for bi, (chord, lyric) in enumerate(row):
            x = margin + bi * bar_w
            p.append(f'<rect x="{x + 2:.1f}" y="{y}" width="{bar_w - 4:.1f}" height="{row_h - 20}" '
                     f'rx="7" fill="#F4EFE7" stroke="{LINE}"/>')
            p.append(t(x + bar_w / 2, y + 20, chord, 12.5, fill=INK, weight=700))
            # 四拍的刷法：第 1 拍下刷、第 2–4 拍手繼續擺動但不碰弦
            for k in range(4):
                cx = x + bar_w / 2 + (k - 1.5) * 34
                p.append(t(cx, y + 40, "↓" if k == 0 else "-", 13,
                           fill=INK if k == 0 else MUTED))
                p.append(t(cx, y + 53, str(k + 1), 9, fill=MUTED))
            if lyric and lyric != "—":
                p.append(t(x + bar_w / 2, y + 68, lyric, 10.5, fill=INK))
        y += row_h
    p.append(t(margin, h - 12,
               "「-」是手繼續上下擺動但不碰弦的空揮；先把右手刷成自動化，再把歌詞掛在第 1 拍上。",
               10.5, anchor="start", fill=MUTED))
    p.append("</svg>")
    return "\n".join(p)


CHART_DATA = {'ch7': [{'chords': ['C', 'Em'],
          'strums': [{0: '↓', 1: '-', 2: '↓', 3: '↑', 4: '↓', 5: '-', 6: '↓', 7: '↑'}, {0: '↓', 1: '-', 2: '↓', 3: '↑', 4: '↓', 5: '-', 6: '↓', 7: '↑'}],
          'beats': [{0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}, {0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}],
          'lyrics': [{0: '脫', 1: '下', 2: '長', 3: '日', 4: '的', 5: '假', 6: '面'}, {0: '奔', 1: '向', 2: '夢', 3: '幻', 4: '的', 5: '疆', 6: '界'}],
          'per_bar': 8},
         {'chords': ['Am', 'G'],
          'strums': [{0: '↓', 1: '-', 2: '↓', 3: '↑', 4: '↓', 5: '-', 6: '↓', 7: '↑'}, {0: '↓', 1: '-', 2: '↓', 3: '↑', 4: '↓', 5: '-', 6: '↓', 7: '↑'}],
          'beats': [{0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}, {0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}],
          'lyrics': [{0: '南', 1: '瓜', 2: '馬', 3: '車', 4: '的', 5: '午', 6: '夜'}, {0: '換', 1: '上', 2: '童', 3: '話', 4: '的', 5: '玻', 6: '璃', 7: '鞋'}],
          'per_bar': 8}],
 'ch9': [{'chords': ['C', 'G'],
          'strums': [{0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}, {0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}],
          'beats': [{0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}, {0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}],
          'lyrics': [{0: '難', 1: '以', 2: '忘', 3: '記', 4: '初', 5: '次', 6: '見', 7: '你'}, {0: '一', 1: '雙', 2: '迷', 3: '人', 4: '的', 5: '眼', 6: '睛'}],
          'per_bar': 8},
         {'chords': ['Am', 'Em'],
          'strums': [{0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}, {0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}],
          'beats': [{0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}, {0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}],
          'lyrics': [{0: '在', 1: '我', 2: '腦', 3: '海', 4: '裡', 5: '(空)', 7: '你'}, {0: '的', 1: '身', 2: '影', 3: '(空)', 5: '揮', 6: '散', 7: '不'}],
          'per_bar': 8},
         {'chords': ['Fmaj7', 'C'],
          'strums': [{0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}, {0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}],
          'beats': [{0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}, {0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}],
          'lyrics': [{0: '握', 1: '你', 2: '的', 3: '雙', 4: '手', 5: '感', 6: '覺', 7: '你'}, {0: '的', 1: '溫', 2: '柔', 3: '(空)'}],
          'per_bar': 8},
         {'chords': ['Dm', 'G'],
          'strums': [{0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}, {0: '↓', 1: '-', 2: '✕', 3: '↑', 4: '-', 5: '↑', 6: '✕', 7: '↑'}],
          'beats': [{0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}, {0: '1', 1: '&', 2: '2', 3: '&', 4: '3', 5: '&', 6: '4', 7: '&'}],
          'lyrics': [{0: '真', 1: '的', 2: '有', 3: '點', 4: '透', 5: '不', 6: '過', 7: '氣'}, {0: '(空)'}],
          'per_bar': 8}]}



CHART_TITLES = {
    "ch7": ("〈擁抱〉基礎刷奏循環：↓ - ↓ ↑ - ↑ ↓ ↑",
            "四小節一循環，每個和弦一小節；「-」是手繼續擺動但不碰弦的空揮", ""),
    "ch9": ("〈情非得已〉切音刷奏：↓ - ✕ ↑ - ↑ ✕ ↑",
            "✕ 是右手手刀切音，落在第 2 拍與第 4 拍的正拍；其餘位置照常上下刷", ""),
}


def fig_song_chart(key):
    """把 CHART_DATA[key] 畫成和弦／刷法／歌詞對齊的練習譜（一行兩個小節）。"""
    title, subtitle, _ = CHART_TITLES[key]
    lines = CHART_DATA[key]
    width, margin, per_row = 720, 24, 2
    bar_w = (width - margin * 2) / per_row
    # 把每個線性區塊再切成每行兩個小節
    blocks = []
    for line in lines:
        for b in range(0, len(line["chords"]), per_row):
            chunk = {"chords": line["chords"][b:b + per_row], "per_bar": line["per_bar"]}
            for k in ("strums", "fingers", "beats", "lyrics"):
                if line.get(k):
                    chunk[k] = line[k][b:b + per_row]
            blocks.append(chunk)
    heights = []
    for c in blocks:
        rows = sum(1 for k in ("strums", "fingers", "beats", "lyrics") if c.get(k))
        heights.append(34 + rows * 21 + 12)
    height = 92 + sum(heights) + 34
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(margin, 34, title, 15, anchor="start", weight=700),
        t(margin, 55, subtitle, 11.5, anchor="start", fill=MUTED),
    ]
    y = 96
    for bi, c in enumerate(blocks):
        n, per = len(c["chords"]), c["per_bar"]
        rows = [(k, s) for k, s in (("strums", 15), ("fingers", 12),
                                    ("beats", 10), ("lyrics", 12.5)) if c.get(k)]
        bottom = y + heights[bi] - 14
        for b, chord in enumerate(c["chords"]):
            x = margin + b * bar_w
            parts.append(t(x + 6, y + 4, chord, 13, anchor="start", weight=700))
            parts.append(f'<line x1="{x:.1f}" y1="{y - 16}" x2="{x:.1f}" y2="{bottom:.1f}" '
                         f'stroke="{LINE}" stroke-width="1.2"/>')
        parts.append(f'<line x1="{margin + n * bar_w:.1f}" y1="{y - 16}" x2="{margin + n * bar_w:.1f}" '
                     f'y2="{bottom:.1f}" stroke="{LINE}" stroke-width="1.2"/>')
        ry = y + 30
        for kind, size in rows:
            for b in range(n):
                xs = margin + b * bar_w
                colw = bar_w / per
                for slot, txt in c[kind][b].items():
                    cx = xs + (slot + 0.5) * colw
                    if kind == "strums":
                        color = MUTED if txt in "-" else ("#B4553F" if txt in "✕X" else ACCENT)
                        parts.append(t(cx, ry, txt, size, fill=color, weight=700))
                    elif kind == "beats":
                        parts.append(t(cx, ry, txt, size, fill=MUTED))
                    elif kind == "fingers":
                        parts.append(t(cx, ry, txt, size, fill=INK))
                    else:
                        parts.append(t(cx, ry, txt, size, fill=INK))
            ry += 21
        y += heights[bi]
    parts.append(t(margin, height - 14, "一個格子就是一個拍點；換和弦時右手不要停，只換左手。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


PATTERNS = {
    "beat16": {
        "title": "16 Beat 民謠搖滾節奏型",
        "subtitle": "奇數格一律下刷、偶數格一律上刷，手腕像鐘擺不逆向；前兩拍只打正拍，後兩拍才補滿十六分音符",
        "beats": ["1", "e", "&", "a"] * 4,
        "strums": ["↓", "-", "↓", "-", "↓", "-", "↓", "-", "↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑"],
        "extra": ("擬聲", ["咚", "", "咚", "", "咚", "", "咚", "", "咚", "卡", "咚", "卡", "咚", "卡", "咚", "卡"]),
        "footer": "前兩拍拍點稀疏、後兩拍拍點密集，這個「先穩後密」的落差就是 16 Beat 聽起來輕快的原因。",
    },
    "beat68": {
        "title": "6/8 拍：兩大拍，每大拍三下",
        "subtitle": "重音落在第 1 與第 4 個八分音符；不要把六下刷得一樣重",
        "beats": ["1", "2", "3", "4", "5", "6"],
        "strums": ["↓", "↓", "↓", "↓", "↓", "↑"],
        "weights": ["重", "輕", "輕", "次重", "輕", "輕"],
        "extra": ("指法", ["T", "1", "2", "3", "2", "1"]),
        "footer": "6/8 不是「六個平均的四拍」，是兩大拍、每大拍三下；刷奏時第 1 與第 4 下要明顯更飽滿。",
    },
}


def fig_pattern(key):
    d = PATTERNS[key]
    n = len(d["beats"])
    width, margin = 720, 40
    colw = (width - margin * 2) / n
    height = 300
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{d["title"]}">',
        f'  <title>{d["title"]}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(margin, 34, d["title"], 16, anchor="start", weight=700),
        t(margin, 55, d["subtitle"], 11.5, anchor="start", fill=MUTED),
    ]
    top = 84
    for i in range(n + 1):
        x = margin + i * colw
        parts.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + 168}" '
                     f'stroke="{LINE}" stroke-width="1"/>')
    rows = [("拍點", d["beats"], top + 24, 12, MUTED, None),
            ("刷法", d["strums"], top + 70, 22, ACCENT, None),
            ("重量", d.get("weights", [""] * n), top + 100, 10.5, MUTED, None),
            (d["extra"][0], d["extra"][1], top + 138, 12, INK, None)]
    for name, items, y, size, color, _ in rows:
        if not any(items):
            continue
        parts.append(t(margin - 8, y + 4, name, 10.5, anchor="end", fill=MUTED))
        for i, s in enumerate(items):
            if s:
                parts.append(t(margin + (i + 0.5) * colw, y, s, size, fill=color,
                               weight=700 if size >= 20 else None))
    parts.append(t(margin, height - 26, d["footer"], 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


# ---------------------------------------------------------------------------
# 通用版面：步驟卡、比較欄、曲式時間軸、音符時值
# ---------------------------------------------------------------------------

def fig_steps(title, subtitle, steps, footer=""):
    """編號卡片：每張一個標題 + 一兩行說明。"""
    n = len(steps)
    width = 640
    cols = 2 if n > 3 else n
    rows = (n + cols - 1) // cols
    cw = (width - 48) / cols
    ch = 104
    height = 96 + rows * ch + 34
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, title, 15, anchor="start", weight=700),
        t(24, 55, subtitle, 11.5, anchor="start", fill=MUTED),
    ]
    for i, (head, body) in enumerate(steps):
        col, row = i % cols, i // cols
        x = 24 + col * cw
        y = 84 + row * ch
        parts.append(f'<rect x="{x}" y="{y}" width="{cw - 16}" height="{ch - 14}" rx="10" fill="{ACCENT_SOFT}" stroke="{LINE}"/>')
        parts.append(t(x + 18, y + 30, f"{i + 1}", 20, anchor="start", fill=ACCENT, weight=700))
        parts.append(t(x + 44, y + 30, head, 12.5, anchor="start", weight=700))
        for k, line in enumerate(_wrap(body, 17)[:3]):
            parts.append(t(x + 18, y + 54 + k * 18, line, 10.5, anchor="start", fill=INK))
    if footer:
        parts.append(t(24, height - 14, footer, 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_compare(title, subtitle, columns, rows, footer=""):
    """左右對照：columns 是欄名，rows 是每列的 (項目, 值1, 值2…)。"""
    width = 640
    ncol = len(columns)
    label_w = 132
    cw = (width - 48 - label_w) / max(1, ncol - 1)
    rowh = 56
    height = 96 + len(rows) * rowh + 30
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, title, 15, anchor="start", weight=700),
        t(24, 55, subtitle, 11.5, anchor="start", fill=MUTED),
    ]
    for j, name in enumerate(columns[1:]):
        parts.append(t(24 + label_w + j * cw + 8, 84, name, 11.5, anchor="start", fill=ACCENT, weight=700))
    for i, row in enumerate(rows):
        y = 96 + i * rowh
        if i % 2 == 0:
            parts.append(f'<rect x="24" y="{y}" width="{width - 48}" height="{rowh}" fill="{ACCENT_SOFT}" opacity=".5"/>')
        parts.append(t(34, y + 24, row[0], 11.5, anchor="start", weight=700))
        for j, val in enumerate(row[1:]):
            for k, line in enumerate(_wrap(val, 12)[:2]):
                parts.append(t(24 + label_w + j * cw + 8, y + 22 + k * 17, line, 10.5, anchor="start", fill=INK))
    if footer:
        parts.append(t(24, height - 12, footer, 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_timeline(title, subtitle, parts_list, footer=""):
    """曲式時間軸：parts_list = [(段落, 相對長度, 說明)]"""
    width = 640
    total = sum(w for _, w, _ in parts_list)
    x = 24
    height = 230
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, title, 15, anchor="start", weight=700),
        t(24, 55, subtitle, 11.5, anchor="start", fill=MUTED),
    ]
    avail = width - 48
    for name, wgt, note in parts_list:
        bw = avail * wgt / total
        out.append(f'<rect x="{x:.1f}" y="84" width="{bw - 4:.1f}" height="52" rx="7" '
                   f'fill="{ACCENT_SOFT}" stroke="{LINE}"/>')
        out.append(t(x + (bw - 4) / 2, 116, name, 11.5, weight=700))
        for k, line in enumerate(_wrap(note, 9)[:3]):
            out.append(t(x + 2, 156 + k * 16, line, 9.5, anchor="start", fill=MUTED))
        x += bw
    if footer:
        out.append(t(24, height - 12, footer, 10.5, anchor="start", fill=MUTED))
    out.append("</svg>")
    return width, height, chr(10).join(out)


def fig_note_values(title="四種基本音符：一個小節可以裝幾個"):
    """全音符／二分／四分／八分在 4/4 一小節裡的長度。"""
    width, height = 640, 320
    rows = [("全音符", 1, "4 拍", "刷一下，讓它響滿整小節"),
            ("二分音符", 2, "2 拍", "一小節兩下"),
            ("四分音符", 4, "1 拍", "跟著節拍器一下一下"),
            ("八分音符", 8, "半拍", "一拍裡兩下，數成 1 & 2 &")]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, title, 15, anchor="start", weight=700),
        t(24, 55, "橫條的長度就是音延續的長度；4/4 拍一小節固定 4 拍", 11.5, anchor="start", fill=MUTED),
    ]
    bar_x, bar_w = 150, 420
    for i, (name, count, beats, note) in enumerate(rows):
        y = 88 + i * 54
        parts.append(t(140, y + 20, name, 12, anchor="end", weight=700))
        seg = bar_w / count
        for k in range(count):
            parts.append(f'<rect x="{bar_x + k * seg:.1f}" y="{y}" width="{seg - 4:.1f}" height="28" rx="5" '
                         f'fill="{ACCENT}" opacity="{0.85 if k % 2 == 0 else 0.55}"/>')
        parts.append(t(bar_x, y + 46, f"{beats}｜{note}", 10, anchor="start", fill=MUTED))
        parts.append(f'<line x1="{bar_x}" y1="{y - 6}" x2="{bar_x}" y2="{y + 34}" stroke="{INK}" stroke-width="1.6"/>')
        parts.append(f'<line x1="{bar_x + bar_w}" y1="{y - 6}" x2="{bar_x + bar_w}" y2="{y + 34}" stroke="{INK}" stroke-width="1.6"/>')
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_strum_four():
    """7-2：四種 8 Beat 節奏型並列。"""
    patterns = [
        ("節奏型 1", ["↓", "·", "↓", "·", "↓", "·", "↓", "·"], "四拍全下刷，最穩"),
        ("節奏型 2", ["↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑"], "八下全刷，練手腕均勻"),
        ("節奏型 3", ["↓", "·", "↓", "↑", "↓", "·", "↓", "↑"], "最經典的入門民謠"),
        ("節奏型 4", ["↓", "·", "↓", "↑", "·", "↑", "↓", "↑"], "靈魂刷法：第 3 拍空揮"),
    ]
    width, height = 640, 400
    left = 110
    colw = (610 - left) / 8
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="四種 8 Beat 刷奏節奏型">',
        '  <title>四種 8 Beat 節奏型</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "四種 8 Beat 節奏型：從第一種練到第四種", 15, anchor="start", weight=700),
        t(24, 55, "「·」是手繼續擺動但不碰弦的空揮；八個格子就是一拍的兩半", 11.5, anchor="start", fill=MUTED),
    ]
    for b in range(4):
        parts.append(t(left + (b * 2 + 1) * colw, 84, str(b + 1), 11, fill=MUTED))
    for i, (name, syms, note) in enumerate(patterns):
        y = 112 + i * 68
        parts.append(t(left - 12, y + 2, name, 11, anchor="end", weight=700))
        parts.append(t(left - 12, y + 18, note, 9, anchor="end", fill=MUTED))
        for k in range(8):
            x = left + k * colw
            bg = ACCENT_SOFT if (k // 2) % 2 == 0 else BG
            parts.append(f'<rect x="{x:.1f}" y="{y - 14}" width="{colw:.1f}" height="44" fill="{bg}"/>')
            s = syms[k]
            if s == "·":
                parts.append(t(x + colw / 2, y + 12, "·", 15, fill="#cfc4b8"))
            else:
                parts.append(t(x + colw / 2, y + 10, s, 19, fill=ACCENT, weight=700))
    for k in range(9):
        x = left + k * colw
        parts.append(f'<line x1="{x:.1f}" y1="96" x2="{x:.1f}" y2="308" stroke="{LINE}" stroke-width="1" opacity=".6"/>')
    parts.append(t(24, height - 14, "節奏型 3 是民謠的骨幹；節奏型 4 只是把第 3 拍正拍放掉，感覺就完全不同。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_posture():
    """2-1：三個支撐點，都是「靠著」不是「夾住」。"""
    width, height = 640, 360
    cx = 320
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="持琴的三個支撐點">',
        '  <title>持琴的三個支撐點</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "持琴三點：胸口、右前臂、左手虎口", 15, anchor="start", weight=700),
        t(24, 55, "三個點都只是「靠著」；任何一點用力夾緊，音色會變悶、換和弦也會變慢", 11.5, anchor="start", fill=MUTED),
    ]
    parts.append(f'<path d="M{cx - 76} 150 C{cx - 130} 168 {cx - 138} 226 {cx - 128} 264 '
                 f'C{cx - 118} 306 {cx - 82} 330 {cx} 330 C{cx + 82} 330 {cx + 118} 306 {cx + 128} 264 '
                 f'C{cx + 138} 226 {cx + 130} 168 {cx + 76} 150 Z" fill="{ACCENT_SOFT}" stroke="{INK}" stroke-width="2"/>')
    parts.append(f'<rect x="{cx - 24}" y="96" width="48" height="70" fill="#EDE3D6" stroke="{INK}" stroke-width="1.6"/>')
    parts.append(f'<circle cx="{cx}" cy="242" r="26" fill="{BG}" stroke="{INK}" stroke-width="1.5"/>')
    pts = [("① 胸口", cx - 96, 196, 118, 136),
           ("② 右前臂", cx + 108, 216, 470, 200),
           ("③ 左虎口", cx - 24, 110, 150, 96)]
    for label, ax, ay, lx, ly in pts:
        parts.append(f'<path d="M{ax} {ay} L{lx} {ly - 4}" stroke="{MUTED}" stroke-width="1" fill="none"/>')
        parts.append(f'<circle cx="{ax}" cy="{ay}" r="5" fill="{ACCENT}"/>')
        parts.append(t(lx + (10 if lx > ax else -10), ly, label, 11.5,
                       anchor="start" if lx > ax else "end", weight=700))
    parts.append(t(24, height - 16, "背帶只是備援：坐著彈時，琴不該靠背帶撐住；站著彈時才讓背帶分擔重量。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_fret_press():
    """2-4：手指要按在琴格右側、指尖立起來。"""
    width, height = 640, 330
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="左手按弦的位置與角度">',
        '  <title>左手按弦：靠近琴衍、指尖立起</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "按弦的兩件事：位置與角度", 15, anchor="start", weight=700),
        t(24, 55, "同一顆音，按對地方不用出力就響；按錯地方再用力也是悶的", 11.5, anchor="start", fill=MUTED),
    ]
    panels = [("○ 正確：貼著琴衍右側", 0.80, ACCENT),
              ("✕ 太中間：要多花一倍力氣", 0.50, "#B4553F"),
              ("✕ 壓在琴衍上：聲音會死掉", 0.97, "#B4553F")]
    for i, (label, frac, color) in enumerate(panels):
        x = 40 + i * 200
        top, fh = 96, 64
        parts.append(f'<rect x="{x}" y="{top}" width="160" height="{fh}" fill="#F7F1E7" stroke="{LINE}"/>')
        for k in range(3):
            yy = top + k * 32
            parts.append(f'<line x1="{x}" y1="{yy}" x2="{x + 160}" y2="{yy}" stroke="{MUTED}" stroke-width="{2.4 if k == 0 else 1}"/>')
        parts.append(f'<line x1="{x}" y1="{top + fh}" x2="{x + 160}" y2="{top + fh}" stroke="{MUTED}" stroke-width="1"/>')
        # 右邊那條粗線＝琴衍（金屬條）
        parts.append(f'<line x1="{x + 160}" y1="{top}" x2="{x + 160}" y2="{top + fh}" stroke="{INK}" stroke-width="3"/>')
        fx = x + 16 + frac * 120
        parts.append(f'<circle cx="{fx:.1f}" cy="{top + 48}" r="9" fill="{color}"/>')
        parts.append(t(x + 80, top + fh + 28, label, 10.5, fill=INK))
    parts.append(t(40, 240, "指尖立起來、從琴頸正上方落下：手指與弦垂直，旁邊的弦才不會被悶到。", 11, anchor="start", fill=INK))
    parts.append(t(40, 264, "手腕微拱、虎口留空；手掌貼在琴頸上會讓小指伸不出去。", 11, anchor="start", fill=INK))
    parts.append(t(40, height - 16, "按不響先檢查兩件事：有沒有貼著琴衍、指尖有沒有立起來。力氣通常不是問題。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_chord_colors():
    """5-1：大三與小三只差中間那顆音。"""
    width, height = 640, 300
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="大三和弦與小三和弦的差別">',
        '  <title>大三與小三：只差中間那顆音</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "大三與小三：只差中間那顆音差幾個半音", 15, anchor="start", weight=700),
        t(24, 55, "根音與五音都一樣，只有三音不同——這就是「明亮」與「憂傷」的全部差別", 11.5, anchor="start", fill=MUTED),
    ]
    for i, (name, gaps, note) in enumerate([("大三和弦（C）", [4, 3], "根音 → 4 個半音 → 再 3 個半音"),
                                           ("小三和弦（Cm）", [3, 4], "根音 → 3 個半音 → 再 4 個半音")]):
        y = 108 + i * 84
        parts.append(t(150, y + 5, name, 12.5, anchor="end", weight=700))
        x, unit = 176, 26
        labels = ["根音", "三音", "五音"]
        pos = [0, gaps[0], gaps[0] + gaps[1]]
        for k in range(3):
            cx = x + pos[k] * unit
            parts.append(f'<rect x="{cx - 18:.1f}" y="{y - 18}" width="36" height="36" rx="8" '
                         f'fill="{ACCENT if k else ACCENT_SOFT}" stroke="{ACCENT}"/>')
            parts.append(t(cx, y + 5, labels[k], 10, "middle", "#FFFFFF" if k else INK, 700))
        for k in range(2):
            x1 = x + pos[k] * unit + 18
            x2 = x + pos[k + 1] * unit - 18
            parts.append(f'<path d="M{x1:.1f} {y} L{x2:.1f} {y}" stroke="{MUTED}" stroke-width="1" stroke-dasharray="3 3"/>')
            parts.append(t((x1 + x2) / 2, y - 8, str(gaps[k]), 10, "middle", MUTED))
        parts.append(t(x + 7 * unit + 34, y + 5, note, 10.5, anchor="start", fill=MUTED))
    parts.append(t(24, height - 16, "把三音降半個音，大三就變成小三；這也是為什麼同一個根音可以有兩種完全不同的情緒。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_bass_note():
    """6-2：大拇指要撥哪一條弦。"""
    width, height = 640, 330
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="各和弦的根音在第幾弦">',
        '  <title>大拇指該撥哪一條弦</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "大拇指（T）只跟著根音換弦", 15, anchor="start", weight=700),
        t(24, 55, "食指、中指、無名指固定守在第 3、2、1 弦；整組指法裡唯一會動的就是大拇指", 11.5, anchor="start", fill=MUTED),
    ]
    groups = [("C、Am", 5, "根音在第 5 弦；第 6 弦打 ✕ 不刷"),
              ("G、Em", 6, "六條弦全刷，最粗的那條就是根音"),
              ("D、Fmaj7", 4, "第 6、5 弦都打 ✕，從第 4 弦開始")]
    for i, (name, string, note) in enumerate(groups):
        y = 112 + i * 62
        parts.append(t(110, y + 6, name, 12.5, anchor="end", weight=700))
        for k in range(6):
            s = 6 - k
            x = 140 + k * 32
            hit = (s == string)
            parts.append(f'<rect x="{x}" y="{y - 14}" width="26" height="30" rx="6" '
                         f'fill="{ACCENT if hit else BG}" stroke="{ACCENT if hit else LINE}" stroke-width="{2 if hit else 1}"/>')
            parts.append(t(x + 13, y + 6, str(s), 11, "middle", "#FFFFFF" if hit else MUTED, 700 if hit else None))
        parts.append(t(340, y + 6, note, 10.5, anchor="start", fill=INK))
    parts.append(t(140, 86, "← 第 6 弦　　　　　第 1 弦 →", 9.5, anchor="start", fill=MUTED))
    parts.append(t(24, height - 16, "換和弦時只換大拇指的位置，其他三根手指留在原地——這是分散和弦能彈快的關鍵。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_string_tuning():
    """2-2：六條弦與標準調音。"""
    strings = [(1, "E4", "329.63"), (2, "B3", "246.94"), (3, "G3", "196.00"),
               (4, "D3", "146.83"), (5, "A2", "110.00"), (6, "E2", "82.41")]
    width, height = 640, 340
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="六條弦的標準調音">',
        '  <title>六條弦的標準調音</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "六條弦與標準調音 E–A–D–G–B–E", 15, anchor="start", weight=700),
        t(24, 55, "由上而下是第 1 弦（最細）到第 6 弦（最粗）；數字是空弦的頻率", 11.5, anchor="start", fill=MUTED),
    ]
    left, right, top = 110, 452, 96
    for i, (num, name, hz) in enumerate(strings):
        y = top + i * 34
        wide = 1 + (num - 1) * 0.55
        parts.append(f'<line x1="{left}" y1="{y}" x2="{right}" y2="{y}" stroke="{INK}" '
                     f'stroke-width="{wide:.1f}" opacity=".55"/>')
        parts.append(t(left - 14, y + 5, f"第 {num} 弦", 11.5, anchor="end", weight=700))
        parts.append(f'<circle cx="{right + 30}" cy="{y}" r="14" fill="{ACCENT_SOFT}" stroke="{LINE}"/>')
        parts.append(t(right + 30, y + 5, name, 11, fill=ACCENT, weight=700))
        parts.append(t(right + 58, y + 5, f"{hz} Hz", 10, fill=MUTED))
    parts.append(t(24, height - 48, "第 1 弦在最上面、第 6 弦在最下面——這和「抱琴時粗弦在上面」是同一件事。", 11, anchor="start", fill=INK))
    parts.append(t(24, height - 22, "口訣：Eddie Ate Dynamite, Good Bye Eddie（E-A-D-G-B-E）。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_grid(title, subtitle, rows, footer="", slots=8):
    """通用拍點格：rows = [(列名, [每個位置的文字])]"""
    width, height = 640, 120 + len(rows) * 32 + 40
    left = 120
    colw = (width - left - 30) / slots
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, title, 15, anchor="start", weight=700),
        t(24, 55, subtitle, 11.5, anchor="start", fill=MUTED),
    ]
    top = 92
    for i in range(slots + 1):
        x = left + i * colw
        strong = i % (slots // 4) == 0
        parts.append(f'<line x1="{x:.1f}" y1="{top - 14}" x2="{x:.1f}" y2="{top + len(rows) * 32 - 8}" '
                     f'stroke="{LINE if not strong else MUTED}" stroke-width="1"/>')
    for r, (name, items) in enumerate(rows):
        y = top + r * 32
        parts.append(t(left - 12, y + 5, name, 10.5, anchor="end", fill=MUTED))
        for i, s in enumerate(items):
            if not s:
                continue
            cx = left + (i + 0.5) * colw
            if name == "拍點":
                parts.append(t(cx, y + 5, s, 10.5, fill=MUTED))
            elif s.startswith("("):
                parts.append(t(cx, y + 5, s, 12, fill="#cfc4b8"))
            else:
                parts.append(t(cx, y + 6, s, 15, fill=ACCENT, weight=700))
    if footer:
        parts.append(t(24, height - 14, footer, 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_degrees():
    """19-1：級數與和弦的對應。"""
    rows = [("級數", ["1", "2m", "3m", "4", "5", "6m", "7dim"]),
            ("C 大調", ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]),
            ("G 大調", ["G", "Am", "Bm", "C", "D", "Em", "F#dim"])]
    width, height = 640, 260
    left, colw = 130, (640 - 130 - 30) / 7
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="級數與和弦的對應">',
        '  <title>級數與和弦的對應</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "級數：不管什麼調，同一個號碼就是同一種角色", 15, anchor="start", weight=700),
        t(24, 55, "記住級數，換調時只要把整排換名字，進行完全不用重記", 11.5, anchor="start", fill=MUTED),
    ]
    for r, (name, items) in enumerate(rows):
        y = 96 + r * 46
        parts.append(t(left - 12, y + 6, name, 11, anchor="end", fill=MUTED))
        for i, s in enumerate(items):
            x = left + i * colw
            strong = s in ("1", "5", "6m") or (r == 0 and s in ("1", "5", "6m"))
            parts.append(f'<rect x="{x + 4:.1f}" y="{y - 16}" width="{colw - 8:.1f}" height="34" rx="7" '
                         f'fill="{ACCENT_SOFT if strong else BG}" stroke="{LINE}"/>')
            parts.append(t(x + colw / 2, y + 6, s, 12.5, "middle", INK, 700 if strong else None))
    parts.append(t(24, height - 16, "1、5、6m 是最常出現的三個：主和弦、屬和弦、關係小調。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_capo_grid():
    """10-2：移調夾速查（吉他版）。"""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    def up(root, n):
        return names[(names.index(root) + n) % 12]

    groups = [("C 調指法", "C"), ("G 調指法", "G"), ("D 調指法", "D"), ("A 調指法", "A")]
    width, left, colw = 640, 140, 82
    height = 100 + len(groups) * 40 + 40
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="移調夾速查">',
        '  <title>移調夾速查</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "移調夾速查：按同一組指法，實際唱出來的調", 15, anchor="start", weight=700),
        t(24, 55, "往琴身方向夾 1 格＝升 1 個半音；移調夾只能升，不能降", 11.5, anchor="start", fill=MUTED),
    ]
    for c in range(6):
        parts.append(t(left + c * colw + colw / 2, 86, f"夾 {c} 格" if c else "不夾", 10, "middle", MUTED))
    for i, (label, root) in enumerate(groups):
        y = 96 + i * 40
        parts.append(t(left - 12, y + 17, label, 11, anchor="end", weight=700))
        for c in range(6):
            x = left + c * colw
            same = c == 0
            parts.append(f'<rect x="{x}" y="{y}" width="{colw - 6}" height="30" rx="6" '
                         f'fill="{ACCENT_SOFT if same else BG}" stroke="{LINE}"/>')
            parts.append(t(x + (colw - 6) / 2, y + 20, up(root, c), 12, "middle",
                           INK if same else ACCENT, 700 if same else None))
    parts.append(t(24, height - 14, "例：原曲 E 大調要唱，用 C 調指法夾第 4 格；覺得太高就換 D 調或 G 調指法再夾。", 10.5,
                   anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


def fig_pluck_check():
    """5-3：爬音測試——每一條弦都要單獨響。"""
    width, height = 640, 320
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="爬音測試">',
        '  <title>爬音測試</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(24, 34, "爬音測試：一顆和弦按好之後，六條弦逐條撥", 15, anchor="start", weight=700),
        t(24, 55, "哪一條悶，就修那一條；不要一次改三個地方", 11.5, anchor="start", fill=MUTED),
    ]
    good = [6, 5, 4, 3, 2, 1]
    bad = {4: True}
    for i, s in enumerate(good):
        y = 104 + i * 32
        parts.append(t(120, y, f"第 {s} 弦", 11.5, anchor="end", weight=700))
        mute = s in bad
        parts.append(f'<circle cx="160" cy="{y - 4}" r="9" '
                     f'fill="{"#B4553F" if mute else ACCENT}"/>')
        parts.append(t(186, y, "悶音 → 檢查手指有沒有壓到旁邊的弦" if mute else "清脆、能延音", 10.5,
                       anchor="start", fill="#B4553F" if mute else MUTED))
    parts.append(t(24, height - 48, "順序固定：由第 6 弦往上撥到第 1 弦，每次都一樣，耳朵才比較得出來。", 11, anchor="start", fill=INK))
    parts.append(t(24, height - 22, "全部清脆之後再刷整排；有一條悶，刷起來就會「少一塊」。", 10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, chr(10).join(parts)


ARPEGGIO_FINGERS = ["T", "1", "2", "1", "3", "1", "2", "1"]
ARPEGGIO_STRINGS = [5, 3, 2, 3, 1, 3, 2, 3]


def fig_arpeggio():
    """6-3：T 1 2 1 3 1 2 1 分散指法（以 C 和弦為例）。"""
    width, height = 640, 360
    left, tab_left, tab_w = 26, LABEL_W + 8, width - LABEL_W - 60
    top = 118
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="T 1 2 1 3 1 2 1 分散指法">',
        '  <title>T 1 2 1 3 1 2 1 分散指法</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "T 1 2 1 3 1 2 1：一根手指守一條弦", size=16, anchor="start", weight=700),
        t(26, 55, "以 C 和弦為例。食指、中指、無名指固定守在第 3、2、1 弦；只有大拇指（T）跟著根音換弦", size=11.5, anchor="start", fill=MUTED),
    ]
    parts += _tab_grid(tab_left, top, tab_w, labels=True)
    parts += _bar_lines(tab_left, top, tab_w)
    colw = tab_w / 8
    for i, (finger, string) in enumerate(zip(ARPEGGIO_FINGERS, ARPEGGIO_STRINGS)):
        cx = tab_left + (i + 0.5) * colw
        y = top + (string - 1) * TAB_ROW
        is_bass = i == 0
        r = 6.5 if is_bass else 5
        parts.append(f'<circle cx="{cx:.1f}" cy="{y}" r="{r}" fill="{"#FFFFFF" if is_bass else BG}" '
                     f'stroke="{ACCENT}" stroke-width="1.8"/>')
    parts += _tab_row_of(["1", "&", "2", "&", "3", "&", "4", "&"], tab_left, top + 5 * TAB_ROW + 26, tab_w, size=10.5)
    parts += _tab_row_of(ARPEGGIO_FINGERS, tab_left, top + 5 * TAB_ROW + 52, tab_w, size=12, fill=ACCENT, weight=700)
    parts.append(t(tab_left - 10, top + 5 * TAB_ROW + 52, "右手指法", size=9.5, anchor="end", fill=MUTED))
    parts.append(t(tab_left - 10, top + 5 * TAB_ROW + 26, "拍點", size=9.5, anchor="end", fill=MUTED))
    parts.append(t(26, height - 40, "換和弦時只動大拇指：C、Am 撥第 5 弦，G、Em 撥第 6 弦，Dm、Fmaj7 撥第 4 弦。", size=11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "八個音要一樣大聲，像齒輪一樣均勻；圈起來的是根音，可以稍微重一點點。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


SOUL = [("↓", True), ("↑", False), ("↓", True), ("↑", True),
        ("↓", False), ("↑", True), ("↓", True), ("↑", True)]


def fig_soul_strum():
    """9-1：8 Beat 靈魂刷法，第 3 拍正拍是空揮。"""
    width, height = 640, 340
    left, w = 84, width - 84 - 26
    colw = w / 8
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="8 Beat 靈魂刷法的八個拍點">',
        '  <title>8 Beat 靈魂刷法</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "8 Beat 靈魂刷法：↓　↓↑　↑↓↑", size=16, anchor="start", weight=700),
        t(26, 55, "灰線是空揮——手照樣擺動，只是不碰到弦。第 3 拍正拍不刷，所以第 3 拍的反拍聽起來像突然往前跳", size=11.5, anchor="start", fill=MUTED),
    ]
    rows = [("拍點", ["1", "&", "2", "&", "3", "&", "4", "&"], 100, 12, MUTED),
            ("手腕", ["↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑"], 168, 20, LINE),
            ("實際發聲", [a if real else "" for a, real in SOUL], 236, 22, ACCENT)]
    for name, items, y, size, color in rows:
        parts.append(t(left - 4, y + 6, name, size=10.5, anchor="end", fill=MUTED))
        for i, s in enumerate(items):
            cx = left + (i + 0.5) * colw
            if s:
                parts.append(t(cx, y, s, size=size, fill=color, weight=700 if color == ACCENT else None))
        parts.append(f'<line x1="{left}" y1="{y + 26}" x2="{left + w}" y2="{y + 26}" stroke="{LINE}" stroke-width="1"/>')
    for i in range(9):
        x = left + i * colw
        parts.append(f'<line x1="{x}" y1="{86}" x2="{x}" y2="{262}" stroke="{LINE}" stroke-width="1" opacity=".55"/>')
    for i, (_, real) in enumerate(SOUL):
        if not real:
            x = left + i * colw
            parts.append(f'<rect x="{x}" y="86" width="{colw}" height="176" fill="{ACCENT_SOFT}" opacity=".55"/>')
    parts.append(t(26, height - 40, "口訣「下、下上、上下上」：只有第 3 拍的正拍是空的，其餘照著手腕的慣性走。", size=11, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "新手最容易卡住的地方：第 2 拍上刷完不要停在空中，讓手腕繼續往下揮，反拍才接得上。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


LEGATO = [
    ("錘音 Hammer-on", "H", "0", "2", "右手撥 0 之後，左手手指像小鐵鎚敲進第 2 格"),
    ("勾音 Pull-off", "P", "2", "0", "按住第 2 格撥響，手指往地板方向勾離開，帶出空弦"),
    ("滑音 Slide", "S", "2", "4", "壓住第 2 格撥響後不鬆手，沿著弦滑到第 4 格停住"),
]


def fig_legato():
    """16-1：錘音、勾音、滑音。"""
    width, height = 640, 320
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="錘音、勾音與滑音三種圓滑音">',
        '  <title>錘音、勾音、滑音</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "圓滑音三兄弟：右手只撥第一下", size=16, anchor="start", weight=700),
        t(26, 55, "第二個音不靠右手，是靠左手敲、勾、滑出來的，所以聽起來像人聲的轉音", size=11.5, anchor="start", fill=MUTED),
    ]
    for i, (name, mark, a, b, note) in enumerate(LEGATO):
        x = 26 + i * 202
        w = 186
        y = 150
        parts.append(t(x + w / 2, 96, name, size=12.5, weight=700))
        parts.append(f'<line x1="{x}" y1="{y}" x2="{x + w}" y2="{y}" stroke="{INK}" stroke-width="1.2" opacity=".45"/>')
        for j, fret in enumerate((a, b)):
            cx = x + 34 + j * (w - 68)
            parts.append(f'<rect x="{cx - 10}" y="{y - 9}" width="20" height="18" fill="{BG}"/>')
            parts.append(t(cx, y + 5, fret, size=15, fill=ACCENT, weight=700))
        ax, bx = x + 34, x + w - 34
        parts.append(f'<path d="M{ax + 12} {y - 14} Q{(ax + bx) / 2} {y - 52} {bx - 12} {y - 14}" '
                     f'stroke="{ACCENT}" stroke-width="1.6" fill="none"/>')
        parts.append(f'<path d="M{bx - 12} {y - 14} l-6 -2 l2 -6 z" fill="{ACCENT}"/>')
        parts.append(t((ax + bx) / 2, y - 42, mark, size=13, fill=ACCENT, weight=700))
        for k, line in enumerate(_wrap(note, 11)):
            parts.append(t(x, y + 44 + k * 18, line, size=10.5, anchor="start", fill=INK))
    parts.append(t(26, height - 14, "三個動作的共同點：左手在發聲的瞬間才動，而且要「壓得住」——離弦太遠就只剩一聲悶響。", size=10.5, anchor="start", fill=MUTED))
    parts.append("</svg>")
    return width, height, "\n".join(parts)


def _wrap(text, n):
    return [text[i:i + n] for i in range(0, len(text), n)]


FIGURES = {
    "capo-grid": fig_capo_grid,
    "pluck-check": fig_pluck_check,
    "compare-strum-vs-pluck": lambda: fig_compare(
        "刷和弦與分散和弦：同一個和弦的兩種長相",
        "一個是和聲一起響，一個是一顆一顆排隊",
        ["比較", "刷奏", "分散（Arpeggio）"],
        [("聲音", "厚、整塊", "一顆一顆，線條清楚"),
         ("適合", "副歌、需要氣勢", "主歌、抒情、夜深"),
         ("右手", "Pick 或食指上下刷", "拇指與三根手指分工"),
         ("難點", "手腕要穩", "每根手指的音量要一樣")],
        "同一首歌常兩者交替：主歌分解，副歌改刷，落差自然就出來了。"),
    "steps-shoot": lambda: fig_steps(
        "拍 Cover 影片：四個讓畫面變好看的順序",
        "先解決聲音，再處理畫面；聲音不對，畫質再好也沒人看完",
        [("收音", "手機離 40～60cm，對準嘴巴略高於琴；先試錄 20 秒"),
         ("光線", "側面窗光或立燈，不要背光；臉上有光就有精神"),
         ("構圖", "橫式放琴與手，直式放臉與上胸；留一點空間給字幕"),
         ("背景", "牆面乾淨、雜物移開；布簾或書櫃都可以")],
        "錄之前先開飛航模式：一通電話就會毀掉最好的一次。"),
    "steps-recital": lambda: fig_steps(
        "你的個人畢業音樂會：四步準備",
        "不是等練好才錄，是錄了才知道哪裡沒練好",
        [("挑三首", "一首抒情分解、一首輕快刷奏、一首 6/8 或慢靈魂"),
         ("練段落", "每首只練主歌＋副歌，先求完整不求完美"),
         ("錄一次", "從頭到尾不中斷，錯也繼續；錄完再回頭修"),
         ("公開", "貼給一個朋友聽；有人聽，才會真的彈完")],
        "畢業的標準不是彈得完美，是能在別人面前從頭彈完一首歌。"),
    "compare-recital": lambda: fig_compare(
        "三首畢業曲目：技術規格對照",
        "三首分別考驗不同東西，練的時候分開檢核",
        ["曲目", "主要技巧", "難點"],
        [("抒情分解", "T1213121、保留指", "音量均勻、換和弦不斷"),
         ("輕快刷奏", "8 Beat、切音", "拍子穩、切音乾淨"),
         ("6/8 或慢靈魂", "三拍子或 16 Beat", "重音位置、手腕幅度")],
        "三首都錄一次，就知道自己哪一種類型的歌最弱。"),
    "grid16": lambda: fig_grid(
        "16 分音符：一拍切成四下",
        "口訣 1 e & a｜2 e & a｜3 e & a｜4 e & a；手腕在同一個幅度裡抖四下",
        [("拍點", ["1", "e", "&", "a", "2", "e", "&", "a", "3", "e", "&", "a", "4", "e", "&", "a"]),
         ("手腕", ["↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑", "↓", "↑"])],
        "8 Beat 是一拍兩下；16 Beat 是一拍四下，速度不變、密度加倍。", slots=16),
    "grid-shuffle": lambda: fig_grid(
        "Shuffle：把一拍切成三份，重音放前兩份",
        "不是「平均的兩半」，而是「長—短」；第二下要刻意延後一點點",
        [("三連音", ["1", "·", "·", "2", "·", "·"]),
         ("刷法", ["↓", "·", "↑", "↓", "·", "↑"]),
         ("對照", ["正拍", "·", "反拍", "正拍", "·", "反拍"])],
        "先唸「噠—啊—噠」抓比例，再上琴；用節拍器時把細分設成三連音。", slots=6),
    "degrees": fig_degrees,
    "steps-accessories": lambda: fig_steps(
        "彈唱必備的五樣東西",
        "加起來通常不到琴價的兩成，但少了任何一樣都會卡住",
        [("調音器", "夾式為主；每次拿琴先調，一分鐘就好"),
         ("Pick", "三種厚度各一：0.6 刷弦、0.8 萬用、1.0 練重音"),
         ("移調夾", "彈唱一定要有，夾上去就換調"),
         ("背帶", "站著彈才需要；坐著彈靠三點支撐"),
         ("擦拭布", "每次彈完擦弦，弦的壽命差很多")],
        "先不要買效果器或第二把琴；把這五樣準備好，前半年就很夠用。"),
    "compare-direction": lambda: fig_compare(
        "下刷與上刷：同一個動作的兩邊",
        "正拍永遠往下、反拍永遠往上；這條規則不要破",
        ["比較", "下刷 ↓", "上刷 ↑"],
        [("拍點", "1、2、3、4 正拍", "&（每拍後半）"),
         ("碰到幾條弦", "從根音弦刷到第 1 弦", "只帶第 1～3 弦"),
         ("聲音", "厚、重、撐住律動", "輕、亮、推進感"),
         ("力道", "約七成", "約三成")],
        "手腕像鐘擺一樣上下不間斷；不碰弦的那一下叫空刷，照樣要揮過去。"),
    "compare-blank": lambda: fig_compare(
        "一開口就亂：三個真正的原因",
        "不是「手口不協調」這麼抽象，是這三件具體的事",
        ["原因", "症狀", "怎麼解"],
        [("伴奏還沒自動化", "一開口就要看手", "把伴奏彈到不看也能彈"),
         ("歌詞沒有對到拍點", "某個字永遠亂", "把那句的歌詞標上拍點（見 8-3）"),
         ("速度靠感覺", "副歌越來越快", "全程跟節拍器，先慢到 60 BPM")],
        "卡住的位置要記下來：每次都在同一個字亂，就是那一個字的拍點還沒對齊。"),
    "compare-fancy": lambda: fig_compare(
        "「高級感」從哪裡來：三個最有效的裝飾",
        "不是加更多音，而是換掉關鍵的那一顆",
        ["手法", "怎麼做", "效果"],
        [("加九音", "C 換成 Cadd9（多一顆 D）", "現代、清爽"),
         ("換七和弦", "C 換 Cmaj7、Am 換 Am7", "都會、夜景感"),
         ("掛留音", "G 換 Gsus4 再接回 G", "懸浮、期待")],
        "一次只用一種：整首歌都掛留音，就失去「解決」的對比了。"),
    "compare-tension": lambda: fig_compare(
        "反差感：讓同一段聽起來有張力",
        "張力不是彈得更大聲，是「前面收得夠小」",
        ["做法", "主歌", "副歌"],
        [("力道", "四成，像在耳邊說話", "八成，整把琴都在響"),
         ("節奏", "分解和弦、留白", "滿弦刷奏、切音"),
         ("音域", "低音區為主", "高音弦一起來"),
         ("歌聲", "低而近", "放開，不過度用力")],
        "錄一段自己彈的主歌與副歌來聽：如果兩段一樣大聲，就沒有副歌。"),
    "compare-humidity": lambda: fig_compare(
        "台灣的濕度對吉他的影響",
        "木材怕的是「變化」，不是「濕」或「乾」本身",
        ["狀況", "太濕（>70%）", "太乾（<40%）"],
        [("面板", "膨脹、弦距變高", "收縮、可能乾裂"),
         ("聲音", "變悶、延音短", "變尖、低頻不見"),
         ("弦", "生鏽快", "較不易生鏽"),
         ("對策", "琴袋放乾燥劑、除濕機 55%", "琴袋放調濕包，遠離出風口")],
        "最省心：琴袋裡放一包雙向調濕包（49%），比每天追濕度計有效。"),
    "compare-slash": lambda: fig_compare(
        "看到 G/B 別慌：斜線右邊只是低音",
        "斜線和弦＝左邊的和弦 ＋ 右邊指定的低音",
        ["符號", "意思", "怎麼按"],
        [("G/B", "G 和弦，低音改彈 B", "原 G 指型，第 5 弦改按第 2 格"),
         ("D/F#", "D 和弦，低音改彈 F#", "第 6 弦按第 2 格，其餘照 D"),
         ("C/E", "C 和弦，低音改彈 E", "第 6 弦空弦，其餘照 C")],
        "按不出來時，直接彈斜線左邊那個和弦也不會錯；低音只是加分。"),
    "compare-simplify": lambda: fig_compare(
        "複雜和弦的簡化：先求彈得出來",
        "網路上抓來的譜常常有大七、九、掛留；新手可以先簡化",
        ["看到", "可以簡化成", "差別"],
        [("Fmaj7", "F 或 C 的省力版", "少了第 7 音的夢幻感"),
         ("Gsus4", "G", "少了懸浮感，但進行不變"),
         ("Am7 / Am9", "Am", "少了都會感，不影響和聲方向"),
         ("D/F#", "D", "低音線條不見，和弦本身沒錯")],
        "簡化只動「顏色」，不要動根音與級數；這首歌聽起來才還是同一首。"),
    "compare-record": lambda: fig_compare(
        "手機錄彈唱：三個常見的失衡",
        "手機只有一個收音點，它會放大最靠近的那個聲音",
        ["問題", "原因", "怎麼解"],
        [("吉他太大聲", "手機離響孔太近", "把手機移到嘴與琴中間，約 40～60cm"),
         ("人聲太遠", "手機對著琴、背對人", "讓手機正對嘴巴高度"),
         ("整個房間在響", "硬牆反射", "背後掛布簾、靠近衣櫃或床邊錄")],
        "先錄 20 秒聽一次，再調整位置；十次盲錄不如一次試聽。"),
    "steps-intro": lambda: fig_steps(
        "三套萬用前奏：沒有前奏也能開場",
        "這三招都用同一組和弦，差別只在「從哪裡開始、彈幾拍」",
        [("最後一小節先出現", "從副歌最後一句的和弦開始，彈 4 拍再接主歌"),
         ("單音爬音", "從根音開始往上爬，最慢但最有氣氛"),
         ("切音四拍", "四下短促切音，適合輕快的歌")],
        "前奏的目的不是炫技，是給聽眾與自己「準備開始唱」的四到八拍。"),
    "steps-outro": lambda: fig_steps(
        "收尾兩招：讓歌不只是「停下來」",
        "直接停會很突兀；給一個收的動作，耳朵會舒服很多",
        [("漸慢刷奏", "最後四小節每兩拍慢一點，最後一下延長"),
         ("第 12 格泛音", "在最後一個和弦上輕觸第 12 格，刷一下收掉")],
        "泛音那一下要留在最後一拍之後：先讓和弦響完，再讓泛音浮出來。"),
    "compare-posture-sing": lambda: fig_compare(
        "坐著唱為什麼比較難發力",
        "不是姿勢本身有錯，是「低頭看琴」把呼吸道擠掉了",
        ["比較", "坐著彈唱", "站著彈唱"],
        [("視線", "容易低頭看手", "自然看向前方"),
         ("喉嚨", "下巴內收、氣道變窄", "氣道打開"),
         ("支撐", "腹部常塌下去", "比較容易用到腹式呼吸")],
        "坐著也可以：把琴架高、譜放在眼睛高度，不要為了看琴而低頭。"),
    "steps-breath": lambda: fig_steps(
        "換氣點怎麼標：三個原則",
        "標在譜上，比每次憑感覺可靠",
        [("句尾換氣", "一個樂句結束的地方標一個「V」"),
         ("長音前先吸", "遇到兩拍以上的長音，前一小節就要準備"),
         ("不要卡在字中間", "換氣點要落在詞與詞之間，不要切斷一個詞")],
        "用鉛筆標、用螢光筆畫都可以；標過一次，下次就不用再想。"),
    "string-tuning": fig_string_tuning,
    "compare-dynamics": lambda: fig_compare(
        "一把吉他的「混音台」：四個旋鈕",
        "沒有第二把琴、沒有踏板，一樣可以做出主歌與副歌的落差",
        ["旋鈕", "收（主歌）", "放（副歌）"],
        [("發聲方式", "指腹撥弦，圓潤", "Pick 刷奏，清脆"),
         ("觸弦位置", "靠指板末端，柔", "靠響孔中央，穿透"),
         ("音域", "只彈低音與中音弦", "六條全刷"),
         ("節奏密度", "分解和弦，一次一顆音", "滿弦刷奏，加切音")],
        "副歌之所以大，是因為主歌刻意小；四件事同時做，落差才出得來。"),
    "compare-switch": lambda: fig_compare(
        "換和弦卡卡的：兩個可以馬上改的習慣",
        "不是手指不夠快，是每次都多做了不必要的工作",
        ["習慣", "現在的做法", "改成"],
        [("保留指", "整組手抬起來重新找位置", "找一根兩顆和弦共用的手指，留著不動"),
         ("共同軸心", "每顆和弦都從零開始按", "用同一根手指當旋轉軸，其餘手指繞著它移動")],
        "先挑一組最常彈的進行（例如 C–Am–F–G7），只練這兩個動作，一週就會有差。"),
    "compare-mute": lambda: fig_compare(
        "兩種切音：右手手刀 vs 左手放鬆",
        "一樣是「讓聲音停掉」，但聲音特質完全不同",
        ["比較", "右手手刀（Palm Mute）", "左手放鬆"],
        [("動作", "手掌外側蓋住弦，Pick 順勢刷過", "手指不離開弦，只放掉按壓的力氣"),
         ("聲音", "清脆的「咔」，有打擊感", "乾淨歸零，沒有額外雜音"),
         ("適用", "所有和弦，包括含空弦的", "封閉和弦，或用閒置手指輕觸空弦")],
        "快歌用右手手刀做出鼓點；需要乾淨休止的地方，用左手放鬆比較不會多出雜音。"),
    "steps-pick": lambda: fig_steps(
        "拿穩 Pick：三個地方會出事",
        "Pick 拿不穩，刷弦一定卡；先固定握法再談速度",
        [("握法", "食指第一指節側面托住，大拇指指腹垂直蓋上，形成十字"),
         ("露出長度", "尖端只露 3～5mm；露太多會卡弦、太少會刮不出聲音"),
         ("力道", "三成力，能拿穩不掉就好；捏死會讓整條前臂跟著僵硬"),
         ("角度", "稍微斜 15～20 度，用側面切過弦，聲音會圓很多")],
        "掉 Pick 通常不是手滑，是握太緊——肌肉一僵，反而更容易掉。"),
    "steps-coordination": lambda: fig_steps(
        "手口協調四步驟：先拆開，再合起來",
        "一開口就亂，是因為大腦同時要處理兩件事；把它們分開練",
        [("只彈不唱", "把伴奏彈到不用看也能彈，嘴巴完全安靜"),
         ("只唱不彈", "跟著原曲唱，手上什麼都不做，確認歌詞與拍子對得上"),
         ("唱拍不唱詞", "嘴巴只數 1 & 2 &，手照彈；先讓節奏對齊"),
         ("合起來慢練", "降到原速的 80%，歌詞與刷弦一起來，錯了就退回上一步")],
        "卡住的位置要記下來：每次都在同一個字亂，就是那一個字的拍點還沒對齊。"),
    "compare-saddle": lambda: fig_compare(
        "弦距：決定「好不好按」的頭號關鍵",
        "弦距＝琴弦底部到琴格銅條的距離，量第 12 格最準",
        ["狀況", "太高", "太低"],
        [("手感", "按不緊、手指痛、和弦悶", "隨便按就響，但容易打弦"),
         ("聲音", "音量小，怎麼刷都不亮", "用力就出現「啪」的打弦雜音"),
         ("怎麼辦", "調整上下弦枕或琴頸鋼筋", "確認弦有沒有裝好，必要時換粗一號的弦")],
        "剛好的弦距：第 12 格夾一張名片不會掉、按起來不痛。新手別自己磨弦枕。"),
    "steps-metronome": lambda: fig_steps(
        "節拍器訓練：三階段，每階段 5 分鐘",
        "先求穩，再求快；跟著節拍器彈對一次，勝過亂彈十次",
        [("只刷正拍", "60 BPM，一拍一下；每一聲「噠」都要和撥弦同時"),
         ("加反拍", "同樣 60 BPM，改成一拍兩下，數 1 and 2 and"),
         ("混搭節奏型", "用節奏型 3（↓ - ↓↑ - ↑↓↑），第 3 拍空揮不能亂")],
        "跟不上就把速度降到 50；能穩穩彈完兩遍再往上加 5 BPM。"),
    "compare-trouble": lambda: fig_compare(
        "單音彈奏常見問題：聽起來卡卡的，通常是這三件事",
        "先聽聲音、再找原因，不要一開始就懷疑手指太短",
        ["狀況", "原因", "對策"],
        [("聲音很短促", "手指太早離開琴弦", "下一個音要按下去的瞬間才放開"),
         ("音色乾癟", "撥弦位置太靠近琴橋", "移到響孔正中央或左側"),
         ("跨弦常撥錯", "右手沒有支點", "小指輕靠在護板上當參考點")],
        "同一個問題反覆出現，先改動作，不要用更大的力氣硬蓋過去。"),
    "compare-barre": lambda: fig_compare(
        "大橫按按不響：三個物理盲點",
        "不是力氣不夠，是施力方式不對——這三點改掉，F 和弦就會響",
        ["盲點", "為什麼按不響", "怎麼改"],
        [("食指用正面軟肉", "關節凹陷處卡住弦", "食指側轉 15～20 度，用骨頭邊緣壓"),
         ("壓在琴格正中央", "離銅條太遠，要兩倍力氣", "貼著第 1 格右側銅條邊緣"),
         ("只靠虎口死命夾", "左手很快就會痠", "右手前臂往內收，讓琴頸靠向食指")],
        "檢查方式：從第 6 弦到第 1 弦逐條撥，哪一條悶就先修那一條。"),
    "strum-four": fig_strum_four,
    "posture": fig_posture,
    "fret-press": fig_fret_press,
    "chord-colors": fig_chord_colors,
    "bass-note": fig_bass_note,
    "note-values": fig_note_values,
    "steps-tuning": lambda: fig_steps(
        "調音四步驟：從第 6 弦調到第 1 弦",
        "每次拿起琴都先做這一輪，一分鐘內可以完成",
        [("夾上調音器", "夾在琴頭，模式選 C（十二平均律）或 G（吉他），基準 440Hz"),
         ("一次只撥一根弦", "從第 6 弦開始；撥完等 1～2 秒，讓音穩定再讀"),
         ("先看音名、再看指針", "音名不對就是差太多，先把字母調對，指針只是微調"),
         ("調完回頭再檢查一次", "調好第 1 弦之後，張力變化會讓前面幾條弦跑掉，再跑一輪")],
        "調音器顯示 D 或 D♯ 而你正在調第 6 弦（E），代表現在太低，要轉緊。"),
    "steps-string-change": lambda: fig_steps(
        "換弦四步驟：一次只換一條",
        "四條一起拆掉，琴頸會突然失去張力，音準與琴頸都要重新穩定",
        [("鬆弦", "轉鬆弦鈕到完全沒有張力，再動手拆"),
         ("取出舊弦", "從琴橋把弦釘／弦球取出，順手擦一下指板與琴格"),
         ("穿新弦", "弦球卡進琴橋、弦穿過弦鈕，預留約兩指寬的長度"),
         ("邊調邊拉", "一圈一圈繞整齊，調音時把弦輕輕拉起再調，重複到不再走音")],
        "新弦頭兩天一定會再走音，這是正常的；彈之前先調，彈完再調一次。"),
    "compare-body": lambda: fig_compare(
        "三種常見桶型：差別在音量與抱起來的舒不舒服",
        "桶型沒有好壞，只有適不適合你的體型與彈法",
        ["桶型", "Dreadnought", "OM / 000"],
        [("音量", "大，低頻厚", "均衡，中頻清楚"),
         ("抱起來", "琴身大，肩膀要張開", "薄一些，久坐不吃力"),
         ("適合", "刷奏伴奏、需要音量", "指法、錄音、長時間練習")],
        "第一次買琴，先確認「抱十分鐘不會想放下」再談聲音。"),
    "timeline-form": lambda: fig_timeline(
        "一首流行歌的標準曲式",
        "同一組和弦，靠段落與力度做出起伏",
        [("前奏", 1, "8 小節內"), ("主歌", 2, "留白"), ("導歌", 1, "漸強"),
         ("副歌", 2, "全刷"), ("間奏", 1, "喘息"), ("副歌", 2, "最高點"), ("尾奏", 1, "漸慢")],
        "副歌之所以聽起來大聲，是因為前面的主歌刻意收；一路全刷反而沒有起伏。"),
    "beat16": (lambda: fig_pattern("beat16")),
    "beat68": (lambda: fig_pattern("beat68")),
    "ch7": (lambda k="ch7": fig_song_chart(k)),
    "ch9": (lambda k="ch9": fig_song_chart(k)),
    "ch5verse": (lambda k="ch5verse": fig_lyric_chart(k)),
    "ch5chorus": (lambda k="ch5chorus": fig_lyric_chart(k)),
    "tab-reading": fig_tab_reading,
    "chord-diagram-reading": fig_chord_diagram_reading,
    "chromatic-walk": fig_chromatic_walk,
    "c-major-scale": fig_c_major_scale,
    "c-major-scale-run": fig_scale_run,
    "twinkle": fig_twinkle,
    "happy-birthday": fig_happy_birthday,
    "sunny-study": fig_sunny_study,
    "turan-study": fig_turan_study,
    "arpeggio-t1213121": fig_arpeggio,
    "soul-strum": fig_soul_strum,
    "legato": fig_legato,
    "chord-basics": fig_chord_basics,
    "chord-hold": fig_chord_hold,
    "barre-chords": fig_barre,
    "guitar-anatomy": fig_guitar_anatomy,
    "lyric-alignment": fig_lyric_alignment,
}


def main(argv) -> int:
    names = [a for a in argv if not a.startswith("-")]
    OUT.mkdir(parents=True, exist_ok=True)
    for key, fn in FIGURES.items():
        if names and key not in names:
            continue
        w, h, svg = fn()
        target = OUT / f"{key}.svg"
        target.write_text(svg, encoding="utf-8")
        print("wrote", target.relative_to(BASE))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
