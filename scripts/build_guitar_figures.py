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
    """民謠吉他各部位（正面觀、直立擺放）。"""
    width, height = 640, 520
    cx = 300
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="民謠吉他各部位名稱">',
        '  <title>民謠吉他的部位</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "民謠吉他的部位", size=16, anchor="start", weight=700),
        t(26, 55, "由上而下：琴頭、上弦枕、指板與琴格、琴身、響孔、琴橋", size=11.5, anchor="start", fill=MUTED),
    ]
    # 琴身（上下兩個圓弧 + 腰身）
    parts.append(f'<path d="M{cx-62} 250 C{cx-118} 268 {cx-128} 330 {cx-118} 372 '
                 f'C{cx-108} 420 {cx-70} 452 {cx} 452 C{cx+70} 452 {cx+108} 420 {cx+118} 372 '
                 f'C{cx+128} 330 {cx+118} 268 {cx+62} 250 Z" '
                 f'fill="{ACCENT_SOFT}" stroke="{INK}" stroke-width="2"/>')
    # 琴頸／指板
    parts.append(f'<rect x="{cx-26}" y="120" width="52" height="132" fill="#EDE3D6" stroke="{INK}" stroke-width="1.6"/>')
    # 琴格
    for i in range(1, 8):
        y = 120 + i * 16
        parts.append(f'<line x1="{cx-26}" y1="{y}" x2="{cx+26}" y2="{y}" stroke="{MUTED}" stroke-width="1"/>')
    # 弦
    for i in range(6):
        x = cx - 20 + i * 8
        parts.append(f'<line x1="{x}" y1="150" x2="{x}" y2="392" stroke="{INK}" stroke-width="0.9" opacity=".55"/>')
    # 上弦枕
    parts.append(f'<rect x="{cx-28}" y="146" width="56" height="7" fill="{INK}"/>')
    # 琴頭
    parts.append(f'<path d="M{cx-30} 146 L{cx-24} 72 L{cx+24} 72 L{cx+30} 146 Z" fill="#EDE3D6" stroke="{INK}" stroke-width="1.6"/>')
    for i in range(3):
        parts.append(f'<circle cx="{cx-16}" cy="{86+i*20}" r="5" fill="{BG}" stroke="{INK}" stroke-width="1.2"/>')
        parts.append(f'<circle cx="{cx+16}" cy="{86+i*20}" r="5" fill="{BG}" stroke="{INK}" stroke-width="1.2"/>')
    # 響孔與琴橋
    parts.append(f'<circle cx="{cx}" cy="352" r="30" fill="{BG}" stroke="{INK}" stroke-width="1.6"/>')
    parts.append(f'<rect x="{cx-34}" y="404" width="68" height="12" rx="3" fill="#DCCDBB" stroke="{INK}" stroke-width="1.2"/>')

    def label(txt, ax, ay, lx, ly):
        parts.append(f'<path d="M{ax} {ay} L{lx} {ly}" stroke="{MUTED}" stroke-width="1" fill="none"/>')
        parts.append(f'<circle cx="{ax}" cy="{ay}" r="2.6" fill="{MUTED}"/>')
        parts.append(t(lx + (8 if lx > ax else -8), ly + 4, txt, size=12,
                       anchor="start" if lx > ax else "end"))

    label("琴頭 Headstock", cx + 24, 100, 400, 92)
    label("弦鈕 Tuning Pegs", cx + 16, 126, 400, 132)
    label("上弦枕 Nut", cx + 26, 150, 400, 172)
    label("指板與琴格 Frets", cx - 26, 200, 150, 196)
    label("琴身 Body", cx - 118, 350, 110, 330)
    label("響孔 Soundhole", cx - 22, 352, 150, 380)
    label("琴橋 Bridge", cx - 34, 410, 130, 448)
    label("弦 Strings（六條）", cx + 4, 300, 400, 300)

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
    """把和弦進行畫成八音分解練習。bars = [(和弦, {弦: {格位: 文字}}, 垂音格位或 None)]"""
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
    """16-2：以 C–G/B–Am7–Am7/G–F–C/E–Dm7–G 練 4 弦垂音裝飾。"""
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
        "跟著進行練垂音：C 與 Am7 的第 4 拍在 4 弦做 0 → 2",
        "和弦是這首歌的進行（C–G/B–Am7–Am7/G–F–C/E–Dm7–G）；下面的分解與垂音是練習用的編排，不是原曲採譜",
        bars,
        "低音一路往下：C → B → A → G → F → E → D → G。標 H 的位置右手不撥，用中指敲第 4 弦第 2 格。")


# ---------------------------------------------------------------------------
# 和弦＋刷法＋歌詞的練習譜（由原本的純文字譜面整理而成）
# ---------------------------------------------------------------------------
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
    ("垂音 Hammer-on", "H", "0", "2", "右手撥 0 之後，左手手指像小鐵鎚敲進第 2 格"),
    ("勾音 Pull-off", "P", "2", "0", "按住第 2 格撥響，手指往地板方向勾離開，帶出空弦"),
    ("滑音 Slide", "S", "2", "4", "壓住第 2 格撥響後不鬆手，沿著弦滑到第 4 格停住"),
]


def fig_legato():
    """16-1：垂音、勾音、滑音。"""
    width, height = 640, 320
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="垂音、勾音與滑音三種圓滑音">',
        '  <title>垂音、勾音、滑音</title>',
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
    "beat16": (lambda: fig_pattern("beat16")),
    "beat68": (lambda: fig_pattern("beat68")),
    "ch7": (lambda k="ch7": fig_song_chart(k)),
    "ch9": (lambda k="ch9": fig_song_chart(k)),
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
