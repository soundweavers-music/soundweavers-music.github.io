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
    "G":     ([3, 2, 0, 0, 0, 3],  [3, 2, 0, 0, 0, 4]),
    "D":     ([-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]),
    "Am":    ([-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]),
    "Em":    ([0, 2, 2, 0, 0, 0],  [0, 2, 3, 0, 0, 0]),
    "Dm":    ([-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]),
    "G7":    ([3, 2, 0, 0, 0, 1],  [3, 2, 0, 0, 0, 1]),
    "C7":    ([-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0]),
    "Am7":   ([-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0]),
    "Cmaj7": ([-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]),
    "Dm7":   ([-1, -1, 0, 2, 1, 1], [0, 0, 0, 3, 1, 1]),
    "Em7":   ([0, 2, 2, 0, 3, 3],  [0, 2, 3, 0, 4, 4]),
    "Cadd9": ([-1, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4]),
    "F":     ([1, 3, 3, 2, 1, 1],  [1, 3, 4, 2, 1, 1]),
    "Bm":    ([-1, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1]),
    "D/F#":  ([2, -1, 0, 2, 3, 2], [1, 0, 0, 3, 4, 2]),
}


def t(x, y, s, size=12, anchor="middle", fill=INK, weight=None):
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
    """10-1 的保留指四和弦：無名指與小指留在 2 弦 3 格、1 弦 3 格。"""
    names = ["G", "Em7", "Cadd9", "D/F#"]
    width, height = 640, 300
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="保留指四和弦：G、Em7、Cadd9、D/F#">',
        '  <title>保留指四和弦：G、Em7、Cadd9、D/F#</title>',
        f'  <rect width="{width}" height="{height}" fill="{BG}"/>',
        t(26, 34, "保留指的四顆和弦", size=16, anchor="start", weight=700),
        t(26, 55, "G、Em7、Cadd9 的無名指與小指都停在 2 弦 3 格、1 弦 3 格；換到 D/F# 時小指要退到 1 弦 2 格", size=11, anchor="start", fill=MUTED),
    ]
    for i, name in enumerate(names):
        parts.append(chord_diagram(name, 30 + i * 150, 74, w=124, h=150))
    parts.append(t(26, height - 12, "○ 空弦　✕ 不彈；D/F# 的第 6 弦要按第 2 格（F#），第 1 弦按第 2 格才是 D 的根音", size=10, anchor="start", fill=MUTED))
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


FIGURES = {
    "chord-basics": fig_chord_basics,
    "chord-hold": fig_chord_hold,
    "barre-chords": fig_barre,
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
