#!/usr/bin/env python3
"""共用的「歌曲卡」：把和弦進行畫成一排圓角方塊，下面接歌詞或刷法。

兩套課程（`build_guitar_figures.py`、`make_ukulele_diagrams.py`）都匯入這支，
這樣實戰章節的圖只要換資料，版面不用各寫一次。

資料格式：
    rows = [("C → Am → F → G7", "刷法：↓ - ↓↑ - ↑↓↑"), …]
"""
from __future__ import annotations

BG = "#FBF8F4"
INK = "#3D3229"
MUTED = "#8C8078"
LINE = "#C9BCAA"
ACCENT = "#A67C52"
ACCENT_SOFT = "#F3E9DC"
FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif"


def _t(x, y, s, size=11, anchor="start", fill=INK, weight=None):
    s = str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    w = f' font-weight="{weight}"' if weight else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}"{w}>{s}</text>')


def _wrap(text, n):
    return [text[i:i + n] for i in range(0, len(text), n)]


def render(title: str, subtitle: str, rows, footer: str = "") -> tuple[int, int, str]:
    width = 720
    margin = 28
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 100" role="img" aria-label="{title}">',
        f'  <title>{title}</title>',
        f'  <rect width="{width}" height="100" fill="{BG}"/>',
        _t(margin, 34, title, 15, weight=700),
        _t(margin, 55, subtitle, 11.5, fill=MUTED),
    ]
    y = 92
    for prog, note in rows:
        chords = [c.strip() for c in prog.replace("`", "").split("→") if c.strip()]
        x = margin
        for i, ch in enumerate(chords):
            w = max(52, 15 + len(ch) * 11)
            parts.append(f'<rect x="{x:.1f}" y="{y}" width="{w}" height="30" rx="8" '
                         f'fill="{ACCENT_SOFT}" stroke="{LINE}"/>')
            parts.append(_t(x + w / 2, y + 20, ch, 12, "middle", INK, 700))
            x += w
            if i < len(chords) - 1:
                parts.append(_t(x + 6, y + 20, "→", 12, "start", MUTED))
                x += 20
        if note:
            for k, line in enumerate(_wrap(note, 46)[:2]):
                parts.append(_t(margin, y + 48 + k * 16, line, 10, fill=MUTED))
            y += 54 + 16 * max(0, len(_wrap(note, 46)[:2]) - 1)
        else:
            y += 40
        y += 14
    if footer:
        parts.append(_t(margin, y + 6, footer, 10, fill=MUTED))
        y += 22
    height = int(y + 18)
    parts.append("</svg>")
    svg = "\n".join(parts).replace('viewBox="0 0 720 100"', f'viewBox="0 0 {width} {height}"')
    svg = svg.replace('<rect width="720" height="100"', f'<rect width="{width}" height="{height}"')
    return width, height, svg
