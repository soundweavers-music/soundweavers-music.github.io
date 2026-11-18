#!/usr/bin/env python3
"""產生人聲課程的 SVG 示意圖（assets/vocal/ 與 assets/vocal/ex/）。

為什麼要用程式產圖
------------------
先前 62 張圖是手寫的 SVG：樣式區塊每檔複製一份，`ex/` 那批的 <style> 甚至是
空的，class 全部失效（文字掉回瀏覽器預設襯線體、色塊變黑）。同一件事在每張
圖裡長得都不一樣，改一個顏色要開 60 個檔案。

這裡把「圖的長相」抽成一份共用規範（畫布、字級、線寬、色票、標註方式），
每張圖只描述內容。輸出仍是獨立的 .svg 檔，網站建置不需要額外依賴。

用法
----
    python scripts/build_vocal_figures.py          # 重畫全部
    python scripts/build_vocal_figures.py hum mix  # 只重畫指定幾張
    python scripts/build_vocal_figures.py --sheet  # 另外輸出對照表 HTML

色票沿用 assets/site-refresh.css 的木材色系，深淺兩色都讀得清楚。
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = BASE_DIR / "assets" / "vocal"
OUT_EX = OUT_DIR / "ex"

# ── 視覺規範 ────────────────────────────────────────────────────────────
BG = "#FBF8F4"          # 紙色，與 --paper 同步
PANEL = "#FFFFFF"
INK = "#3D3229"         # 主線與標題
INK2 = "#5D4E41"
MUTED = "#8C8078"
LINE = "#D9CFC4"
ACCENT = "#A67C52"      # 示範的重點
ACCENT_2 = "#C4956A"
ACCENT_SOFT = "#F3E9DC"
BLUE = "#6B8FBF"        # 氣息、氣流
BLUE_SOFT = "#DEE8F3"
GREEN = "#6F8F6A"       # 放鬆、正確
GREEN_SOFT = "#E4EBDC"
RED = "#B0563F"         # 緊繃、錯誤
RED_SOFT = "#F4DFD7"

FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif"
SERIF = "'Noto Serif TC','Songti TC',Georgia,serif"

STYLE = f"""
    .t   {{ font-family: {FONT}; fill: {INK}; }}
    .tb  {{ font-family: {FONT}; fill: {INK}; font-weight: 700; }}
    .ts  {{ font-family: {FONT}; fill: {MUTED}; }}
    .num {{ font-family: {FONT}; fill: #FFFFFF; font-weight: 700; font-size: 11px; }}
    .ink {{ fill: none; stroke: {INK}; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }}
    .thin{{ fill: none; stroke: {LINE}; stroke-width: 1.1; }}
    .dash{{ fill: none; stroke: {LINE}; stroke-width: 1.1; stroke-dasharray: 4 5; }}
    .lead{{ fill: none; stroke: {MUTED}; stroke-width: 1; }}
    .acc {{ fill: none; stroke: {ACCENT}; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }}
    .blue{{ fill: none; stroke: {BLUE}; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }}
    .green{{ fill: none; stroke: {GREEN}; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }}
    .red {{ fill: none; stroke: {RED}; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }}
    .dot {{ fill: {INK}; }}
"""


def esc(text: str) -> str:
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# 文字方塊的粗略估算，用來抓「標籤疊在一起」這種排版錯誤
_TEXTS: list[tuple[float, float, float, float, str]] = []


def _record(x, y, s, size, anchor):
    w = sum(1.0 if ord(c) > 0x2E80 else 0.55 for c in s) * size
    if anchor == "middle":
        x -= w / 2
    elif anchor == "end":
        x -= w
    _TEXTS.append((x, y - size * 0.85, x + w, y + size * 0.22, s))


def text_overlaps(margin=2.0):
    """回傳互相重疊的文字對（用於建置時的警告）。"""
    hits = []
    for i in range(len(_TEXTS)):
        a = _TEXTS[i]
        for j in range(i + 1, len(_TEXTS)):
            b = _TEXTS[j]
            if (a[0] < b[2] - margin and b[0] < a[2] - margin
                    and a[1] < b[3] - margin and b[1] < a[3] - margin):
                hits.append((a[4], b[4]))
    return hits


def t(x, y, s, size=13, anchor="start", cls="t", weight=None, color=None, **kw):
    """一行文字。"""
    _record(x, y, s, size, anchor)
    bits = [f'x="{x}"', f'y="{y}"', f'class="{cls}"', f'font-size="{size}"']
    if anchor != "start":
        bits.append(f'text-anchor="{anchor}"')
    if weight:
        bits.append(f'font-weight="{weight}"')
    if color:
        bits.append(f'fill="{color}"')
    extra = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    if extra:
        bits.append(extra)
    return f'  <text {" ".join(bits)}>{esc(s)}</text>'


def tb(x, y, s, size=15, anchor="start", **kw):
    return t(x, y, s, size=size, anchor=anchor, cls="tb", **kw)


def ts(x, y, s, size=11.5, anchor="start", **kw):
    return t(x, y, s, size=size, anchor=anchor, cls="ts", **kw)


def rect(x, y, w, h, fill="none", stroke="none", rx=0, sw=1.4, opacity=None, dash=None):
    bits = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"']
    if rx:
        bits.append(f'rx="{rx}"')
    bits.append(f'fill="{fill}"')
    if stroke != "none":
        bits.append(f'stroke="{stroke}" stroke-width="{sw}"')
    if opacity is not None:
        bits.append(f'opacity="{opacity}"')
    if dash:
        bits.append(f'stroke-dasharray="{dash}"')
    return f'  <rect {" ".join(bits)}/>'


def circle(cx, cy, r, fill="none", stroke="none", sw=1.4, opacity=None):
    bits = [f'cx="{cx}"', f'cy="{cy}"', f'r="{r}"', f'fill="{fill}"']
    if stroke != "none":
        bits.append(f'stroke="{stroke}" stroke-width="{sw}"')
    if opacity is not None:
        bits.append(f'opacity="{opacity}"')
    return f'  <circle {" ".join(bits)}/>'


def path(d, cls="ink", fill="none", stroke=None, sw=None, opacity=None, dash=None):
    bits = [f'd="{d}"', f'class="{cls}"']
    if fill != "none":
        bits.append(f'fill="{fill}"')
    if stroke:
        bits.append(f'stroke="{stroke}" stroke-width="{sw or 1.4}"')
    if opacity is not None:
        bits.append(f'opacity="{opacity}"')
    if dash:
        bits.append(f'stroke-dasharray="{dash}"')
    return f'  <path {" ".join(bits)}/>'


def arrow(x1, y1, x2, y2, cls="acc", size=7, sw=None):
    """直線箭頭（終點帶實心三角）。"""
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    # 讓線停在箭頭底部
    bx, by = x2 - math.cos(ang) * size * 0.9, y2 - math.sin(ang) * size * 0.9
    left = (x2 - math.cos(ang - 0.42) * size, y2 - math.sin(ang - 0.42) * size)
    right = (x2 - math.cos(ang + 0.42) * size, y2 - math.sin(ang + 0.42) * size)
    head = f'M{x2:.1f} {y2:.1f} L{left[0]:.1f} {left[1]:.1f} L{right[0]:.1f} {right[1]:.1f} Z'
    stroke = {"acc": ACCENT, "blue": BLUE, "ink": INK, "green": GREEN, "red": RED, "muted": MUTED}.get(cls, ACCENT)
    return (
        f'  <path d="M{x1:.1f} {y1:.1f} L{bx:.1f} {by:.1f}" fill="none" stroke="{stroke}" '
        f'stroke-width="{sw or 1.7}" stroke-linecap="round"/>'
        f'<path d="{head}" fill="{stroke}"/>'
    )


def badge(x, y, n, color=ACCENT, r=10):
    """編號圓標。"""
    return (
        circle(x, y, r, fill=color)
        + f'  <text x="{x}" y="{y + 4}" text-anchor="middle" class="num">{n}</text>'
    )


def callout(x1, y1, x2, y2):
    """細引線＋起點小圓（標註用）。"""
    return (
        f'  <path d="M{x1} {y1} L{x2} {y2}" class="lead"/>'
        + circle(x1, y1, 2.4, fill=MUTED)
    )


def steps(x, y, items, gap=46, color=ACCENT, size=12.5):
    """編號步驟清單：(標題, 說明)。"""
    out = []
    for i, (head, sub) in enumerate(items):
        yy = y + i * gap
        out.append(badge(x, yy, i + 1, color))
        out.append(t(x + 20, yy + 4, head, size=size, weight=600))
        if sub:
            out.append(ts(x + 20, yy + 21, sub, size=11))
    return "\n".join(out)


def verdict(x, y, w, h, title, sub, ok=True):
    """對／錯對照框。"""
    col, soft = (GREEN, GREEN_SOFT) if ok else (RED, RED_SOFT)
    return "\n".join([
        rect(x, y, w, h, fill=soft, stroke=col, rx=6, sw=1.2),
        t(x + 14, y + 26, title, size=12.5, weight=600, color=col),
        ts(x + 14, y + 48, sub, size=11),
    ])


def chip(x, y, text, col=ACCENT, size=11):
    """小圓角標籤，回傳 (svg, 寬度)。"""
    w = sum(1.0 if ord(c) > 0x2E80 else 0.58 for c in text) * size + 16
    svg = (rect(x, y - size - 3, w, size + 12, fill=col, stroke="none", rx=(size + 12) / 2, opacity=0.16)
           + t(x + 8, y + 3, text, size=size, color=col, weight=600))
    return svg, w


def wave(x0, y0, x1, amp, periods, cls="acc", samples=120, phase=0.0):
    """沿 x 軸畫正弦波。"""
    import math
    pts = []
    for i in range(samples + 1):
        r = i / samples
        x = x0 + (x1 - x0) * r
        y = y0 - amp * math.sin(2 * math.pi * periods * r + phase)
        pts.append(f"{x:.1f},{y:.1f}")
    return f'  <polyline points="{" ".join(pts)}" class="{cls}" fill="none"/>'


def frame(w, h, title, body, subtitle=None, note=None):
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(title)}">',
        f'  <title>{esc(title)}</title>',
        f'  <rect width="{w}" height="{h}" fill="{BG}"/>',
        f'  <style>{STYLE}  </style>',
        tb(26, 34, title, size=16),
    ]
    if subtitle:
        parts.append(ts(26, 55, subtitle, size=12.5))
    parts.append(body)
    if note:
        parts.append(ts(26, h - 18, note, size=11))
    parts.append('</svg>')
    return "\n".join(p for p in parts if p) + "\n"


# ── 圖 ──────────────────────────────────────────────────────────────────
# 每張圖是一個函式，回傳 (寬, 高, 標題, 副標, 內文, 註腳)。


def fig_passaggio():
    w, h = 640, 420
    body = []
    # 音高軸（往上＝音變高）
    body.append(arrow(56, 336, 56, 92, "ink", size=8))
    body.append(ts(44, 88, "音高", anchor="end"))
    # 左：三段音域
    bands = [
        (294, "低音區", "整片聲帶振動", GREEN, GREEN_SOFT),
        (214, "換聲區", "兩套肌肉一起出力", ACCENT, ACCENT_SOFT),
        (134, "高音區", "只有邊緣振動", BLUE, BLUE_SOFT),
    ]
    for y, name, sub, col, soft in bands:
        body.append(rect(72, y - 34, 232, 64, fill=soft, stroke=col, rx=8, sw=1.6))
        body.append(t(88, y - 8, name, size=14, weight=700))
        body.append(ts(88, y + 12, sub, size=11.5))
    # 斷層：換聲區下緣的虛線
    body.append(f'  <path d="M72 248 L304 248" fill="none" stroke="{RED}" stroke-width="1.4" stroke-dasharray="5 4"/>')
    body.append(ts(72, 360, "虛線處是最容易「喀」一聲的地方，不是音域到頂。", size=11, color=RED))

    # 右：TA / CT 出力比例（橫軸＝音高由低到高，縱軸＝出力）
    body.append(ts(330, 88, "兩種肌肉的出力比例", size=12))
    body.append(rect(330, 98, 280, 168, fill=PANEL, stroke=LINE, rx=6, sw=1))
    body.append(path("M342 114 C400 118 440 138 470 182 C500 226 540 248 598 252", cls="green"))
    body.append(path("M342 252 C400 248 440 226 470 182 C500 138 540 118 598 114", cls="blue"))
    body.append(circle(470, 182, 3.6, fill=INK))
    # 圖例
    body.append(circle(342, 288, 4, fill=GREEN))
    body.append(ts(352, 292, "TA 甲杓肌（低音）", size=11))
    body.append(circle(470, 288, 4, fill=BLUE))
    body.append(ts(480, 292, "CT 環甲肌（高音）", size=11))
    body.append(ts(330, 330, "換聲區不是一個音，是一段過渡帶；越放鬆，帶越窄。", size=12.5))
    return w, h, "音域三段與換聲區", "同一個音高，可以有不同的振動方式", "\n".join(body), None


def fig_tone_pair():
    w, h = 640, 360
    body = []

    def folds(cx, thick, gap, color, label_lines):
        # 俯視聲帶：兩條帶子夾著聲門
        g = []
        g.append(rect(cx - 78, 118, 156, 26 + thick * 12, fill=color, opacity=0.22, rx=6))
        g.append(rect(cx - 78, 118, 156, 26 + thick * 12, fill="none", stroke=color, rx=6, sw=1.6))
        g.append(rect(cx - 78, 196 - thick * 6, 156, 26 + thick * 6, fill=color, opacity=0.22, rx=6))
        g.append(rect(cx - 78, 196 - thick * 6, 156, 26 + thick * 6, fill="none", stroke=color, rx=6, sw=1.6))
        g.append(ts(cx, 190 - thick * 6 - 10, "聲門" if gap else "完全閉合", size=10.5, anchor="middle"))
        for i, line in enumerate(label_lines):
            g.append(t(cx, 268 + i * 20, line, size=13, anchor="middle"))
        return "\n".join(g)

    body.append(t(178, 78, "真音／胸聲", size=14, weight=700, anchor="middle"))
    body.append(ts(178, 100, "厚、短、整片振動", size=11.5, anchor="middle"))
    body.append(folds(178, 1.0, False, GREEN, ["聲帶把氣擋住", "聲音有核心、有重量"]))
    body.append(t(462, 78, "假音／頭聲", size=14, weight=700, anchor="middle"))
    body.append(ts(462, 100, "薄、長、只有邊緣", size=11.5, anchor="middle"))
    body.append(folds(462, 0.15, True, BLUE, ["中間留小縫，會漏氣", "輕、飄，但仍有音高"]))
    body.append(path("M300 190 L340 190", cls="thin"))
    body.append(ts(320, 182, "同一條", size=11, anchor="middle"))
    body.append(ts(320, 210, "聲帶", size=11, anchor="middle"))
    body.append(ts(26, h - 18, "厚薄不是力氣，是形狀：拉長就變薄，放鬆就變厚。", size=11))
    return w, h, "同一條聲帶的兩端", "真音與假音差在振動面積，不在音量", "\n".join(body), None


def fig_hum():
    w, h = 640, 400
    body = []
    # 聲道示意：下方氣管，上方分成鼻腔與口腔兩條路
    body.append(path("M120 300 L120 190", cls="ink", sw=1.6))
    body.append(path("M100 300 L100 190", cls="ink", sw=1.6))
    body.append(path("M100 190 C100 158 84 148 66 144 L66 120", cls="blue", sw=2))
    body.append(path("M120 190 C120 164 138 154 162 150 L162 128", cls="acc", sw=2))
    # 鼻腔
    body.append(rect(34, 86, 64, 34, fill=BLUE_SOFT, stroke=BLUE, rx=6, sw=1.3))
    body.append(t(66, 108, "鼻腔", size=12.5, anchor="middle", weight=600))
    # 口腔
    body.append(rect(130, 94, 64, 34, fill=ACCENT_SOFT, stroke=ACCENT, rx=6, sw=1.3))
    body.append(t(162, 116, "口腔", size=12.5, anchor="middle", weight=600))
    # 聲帶
    body.append(rect(97, 300, 26, 9, fill=ACCENT, rx=4))
    body.append(ts(132, 308, "聲帶", size=11, color=ACCENT))
    # 氣流出口
    body.append(arrow(66, 120, 66, 96, "blue", size=6))
    body.append(ts(84, 132, "氣有出路", size=10.5, color=BLUE))
    # 震動標記
    for i in range(3):
        body.append(circle(44 + i * 16, 134, 3, fill=BLUE, opacity=0.85))
    body.append(ts(34, 330, "哼鳴時鼻咽是開的，一小部分聲音走鼻腔，", size=11.5))
    body.append(ts(34, 348, "所以鼻樑與臉頰會震。氣只洩掉一點點。", size=11.5))

    # 步驟
    steps = [("1", "閉嘴發「嗯」", "感覺鼻樑與臉頰在震"),
             ("2", "維持三秒", "喉嚨不能有擠壓感"),
             ("3", "張開成「阿」", "震動的位置不要掉")]
    for i, (n, head_txt, sub) in enumerate(steps):
        y = 150 + i * 62
        body.append(badge(392, y, n))
        body.append(t(410, y + 5, head_txt, size=12.5, weight=600))
        body.append(ts(410, y + 23, sub, size=11))
    body.append(ts(26, h - 18, "哼鳴是「有聲的閉嘴」：氣有出路、聲帶輕鬆，最容易找到臉上的振動。", size=11))
    return w, h, "用「嗯」找振動的位置", "哼鳴（humming）是半閉口練習，氣流有一部分走鼻腔", "\n".join(body), None


def fig_song():
    w, h = 640, 300
    body = []
    # 五線
    for i in range(5):
        y = 110 + i * 16
        body.append(f'  <path d="M86 {y} L520 {y}" class="thin" stroke-width=".9"/>')
    notes = [(120, 174), (170, 158), (214, 142), (250, 150), (292, 126),
             (330, 134), (372, 118), (414, 142), (456, 158)]
    # 旋律線
    d = "M" + " L".join(f"{x} {y}" for x, y in notes)
    body.append(path(d, cls="thin", stroke=ACCENT, sw=1.6, opacity=0.55))
    for i, (x, y) in enumerate(notes):
        hot = i == 6
        body.append(circle(x, y, 7 if hot else 5.5,
                           fill=ACCENT if hot else INK,
                           opacity=1 if hot else 0.75))
    body.append(ts(372, 96, "在這一句上做記號", size=11.5, anchor="middle", color=ACCENT))
    body.append(badge(556, 138, "✓", color=GREEN))
    body.append(t(532, 143, "再唱一次", size=12.5, anchor="end"))
    body.append(ts(86, 236, "先在同一個音上做對，再放回這一句；一次只改一個動作。", size=12.5))
    return w, h, "最後一定要放回一句真的歌", "練習不是把音唱對，是把動作帶回歌裡", "\n".join(body), None


def fig_mix():
    w, h = 640, 300
    body = []
    x0, x1, y = 70, 570, 150
    body.append(rect(x0, y, x1 - x0, 34, fill=PANEL, stroke=LINE, rx=17, sw=1.2))
    # 漸層條
    body.append(f'  <defs><linearGradient id="mixg" x1="0" x2="1">'
                f'<stop offset="0" stop-color="{GREEN}" stop-opacity=".45"/>'
                f'<stop offset=".5" stop-color="{ACCENT}" stop-opacity=".4"/>'
                f'<stop offset="1" stop-color="{BLUE}" stop-opacity=".45"/>'
                f'</linearGradient></defs>')
    body.append(rect(x0 + 2, y + 2, x1 - x0 - 4, 30, fill="url(#mixg)", rx=15))
    body.append(ts(x0, y - 12, "胸聲（厚）", size=12))
    body.append(ts(x1, y - 12, "頭聲（薄）", size=12, anchor="end"))
    for frac, name, col in [(0.22, "強混", GREEN), (0.5, "平衡", ACCENT), (0.78, "弱混", BLUE)]:
        x = x0 + (x1 - x0) * frac
        body.append(circle(x, y + 17, 9, fill=col))
        body.append(t(x, y + 64, name, size=13, anchor="middle", weight=600))
    body.append(ts(26, h - 18, "混聲是比例，不是開關：兩邊各出一點，接縫就不見。", size=11))
    return w, h, "在比例尺上找到你的位置", "同一句歌詞，可以在這條線上自由移動", "\n".join(body), None


def fig_vowel():
    w, h = 640, 400
    body = []
    # F1-F2 平面（F1 往下、F2 往右；慣例是 F1 縱軸向下）
    left, right, top, bottom = 110, 560, 90, 330
    body.append(rect(left, top, right - left, bottom - top, fill=PANEL, stroke=LINE, rx=4, sw=1.2))
    body.append(arrow(left - 18, top, left - 18, bottom, "ink", size=7))
    body.append(ts(left - 26, top - 8, "F1 低", size=10.5, anchor="end"))
    body.append(ts(left - 26, bottom + 4, "F1 高", size=10.5, anchor="end"))
    body.append(arrow(left, bottom + 22, right, bottom + 22, "ink", size=7))
    body.append(ts(right, bottom + 42, "F2 低 → 高", size=10.5, anchor="end"))
    # 母音位置（男聲近似的 F1/F2，僅示意）
    vowels = [("i", 0.18, 0.12), ("e", 0.3, 0.26), ("a", 0.55, 0.9), ("o", 0.4, 0.72), ("u", 0.28, 0.55)]
    for name, fx, fy in vowels:
        x = left + (right - left) * fx
        y = top + (bottom - top) * fy
        body.append(circle(x, y, 15, fill=ACCENT, opacity=0.16))
        body.append(circle(x, y, 5, fill=ACCENT))
        body.append(t(x + 20, y + 5, name, size=15, weight=700))
    body.append(ts(26, h - 18, "同一句話換五個母音，舌頭與嘴唇的位置就換了五次；這是咬字的工作。", size=11))
    return w, h, "五個母音在聲音頻譜上的位置", "F1（張口度）與 F2（舌位前後）決定你聽到的是哪個母音", "\n".join(body), None


def fig_glissando():
    w, h = 640, 320
    body = []
    x0, x1, mid = 90, 560, 190
    body.append(path(f"M{x0} {mid + 60} L{x1} {mid + 60}", cls="thin"))
    body.append(ts(x0, mid + 84, "低", size=11))
    body.append(ts(x1, mid + 84, "高", size=11, anchor="end"))
    # 警報器波形
    body.append(path(f"M{x0} {mid + 40} C{x0 + 60} {mid - 20} {x0 + 90} {mid - 60} {x0 + 140} {mid - 60}"
                     f" C{x0 + 190} {mid - 60} {x0 + 200} {mid + 20} {x0 + 240} {mid + 20}"
                     f" C{x0 + 280} {mid + 20} {x0 + 290} {mid - 70} {x0 + 340} {mid - 70}"
                     f" C{x0 + 390} {mid - 70} {x0 + 400} {mid + 20} {x0 + 450} {mid + 20}", cls="acc"))
    body.append(ts(x0, mid - 96, "慢慢地、不斷地滑，不要一階一階踩", size=11.5))
    body.append(ts(26, h - 18, "滑音是把換聲區變成一條斜坡，而不是一道牆。", size=11))
    return w, h, "像警報器一樣上下滑", "用連續的滑動穿過換聲區，比直接跳上去安全", "\n".join(body), None


def fig_lip_trill():
    w, h = 640, 360
    body = []
    # 唇部剖面：上下兩片唇（圓角長條），中間是閉合的縫
    body.append(rect(132, 108, 112, 22, fill="#F2E7DC", stroke=INK, rx=11, sw=1.5))
    body.append(rect(132, 150, 112, 22, fill="#F2E7DC", stroke=INK, rx=11, sw=1.5))
    body.append(f'  <path d="M132 140 L244 140" fill="none" stroke="{ACCENT}" stroke-width="1.4" stroke-dasharray="4 3"/>')
    body.append(ts(188, 202, "雙唇放鬆、閉攏", size=11.5, anchor="middle"))
    body.append(ts(188, 222, "不用刻意抿", size=10.5, anchor="middle"))
    # 氣流
    body.append(arrow(44, 140, 116, 140, "blue", size=7))
    body.append(ts(42, 124, "穩定氣流", size=11, anchor="end"))
    # 震動
    body.append(wave(262, 126, 340, 9, 4, "acc", samples=60))
    body.append(wave(262, 154, 340, 9, 4, "acc", samples=60))
    body.append(ts(262, 202, "吹成「噗嚕噗嚕」", size=11.5))
    body.append(ts(262, 222, "手摸脖子：鬆的", size=10.5))
    # 對照
    body.append(rect(382, 92, 232, 68, fill=GREEN_SOFT, stroke=GREEN, rx=6, sw=1.2))
    body.append(t(396, 118, "對：喉嚨沒有感覺", size=12.5, weight=600, color=GREEN))
    body.append(ts(396, 140, "只有嘴唇在動", size=11))
    body.append(rect(382, 176, 232, 68, fill=RED_SOFT, stroke=RED, rx=6, sw=1.2))
    body.append(t(396, 202, "錯：喉嚨在出力", size=12.5, weight=600, color=RED))
    body.append(ts(396, 224, "嘴唇反而抖不起來", size=11))
    body.append(ts(26, h - 18, "彈唇是「半閉口」練習：氣有阻力、聲帶壓力變小，換聲區最容易鬆開。", size=11))
    return w, h, "讓嘴唇自己震動", "嘴唇放鬆、氣穩定，震動是氣做出來的，不是喉嚨擠的", "\n".join(body), None


def fig_record():
    w, h = 640, 340
    body = []
    cx, cy, r = 300, 200, 96
    nodes = [(-90, "錄一次"), (0, "聽一遍"), (90, "只改一件事"), (180, "再錄一次")]
    pts = []
    import math
    for deg, label in nodes:
        a = math.radians(deg)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a) * 0.72
        pts.append((x, y, label))
    # 環線
    body.append(f'  <ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{int(r*0.72)}" class="dash" fill="none"/>')
    for i, (x, y, label) in enumerate(pts):
        body.append(circle(x, y, 26, fill=PANEL, stroke=ACCENT, sw=1.6))
        body.append(badge(x, y - 30, i + 1, ACCENT, 9))
        body.append(t(x, y + 5, label, size=12, anchor="middle", weight=600))
    body.append(arrow(cx + 40, cy - 6, cx + 62, cy - 24, "acc", size=7))
    body.append(ts(26, h - 18, "一次只改一個動作，否則你聽不出是哪一個動作造成了差別。", size=11))
    return w, h, "錄、聽、改一件事、再錄", "練習的最小循環：一次只動一個變數", "\n".join(body), None


def fig_fry():
    w, h = 640, 340
    body = []
    body.append(ts(70, 100, "正常振動", size=12))
    body.append(wave(70, 132, 560, 26, 26, "acc", samples=400))
    body.append(ts(70, 206, "氣泡音（vocal fry）", size=12))
    # 不規則低頻脈衝
    xs = [70, 96, 112, 146, 168, 210, 232, 268, 300, 330, 372, 396, 438, 470, 500, 540, 560]
    ys = [238, 218, 240, 216, 240, 218, 238, 216, 238, 216, 238, 216, 238, 216, 238, 216, 238]
    d = "M" + " L".join(f"{x} {y}" for x, y in zip(xs, ys))
    body.append(path(d, cls="blue", sw=2))
    body.append(ts(70, 282, "一下一下、分得開的低頻脈衝", size=11))
    body.append(ts(26, h - 18, "氣泡音不是壞掉的聲音，是聲帶最放鬆、張力最低的振動。", size=11))
    return w, h, "氣泡音與正常振動的波形", "看的是「每一次振動分不分得開」，不是音量", "\n".join(body), None


def fig_longtone():
    w, h = 640, 300
    body = []
    x0, x1, y = 90, 570, 150
    body.append(rect(x0, y, x1 - x0, 18, fill=BLUE_SOFT, stroke=BLUE, rx=9, sw=1.1))
    for i in range(5):
        x = x0 + (x1 - x0) * i / 4
        body.append(path(f"M{x} {y + 26} L{x} {y + 34}", cls="thin"))
        body.append(ts(x, y + 50, f"{i*5}s", size=10.5, anchor="middle"))
    body.append(ts(x0, y - 14, "一口氣", size=11.5))
    body.append(t(x0, y - 34, "一個音，撐滿 20 秒", size=13.5, weight=600))
    body.append(ts(x0, y + 82, "音量從頭到尾一樣大，就代表支撐是穩的；越到後面越小，是氣不夠。", size=12))
    body.append(ts(26, h - 18, "先求穩，再求長：20 秒是練習的門檻，不是表演的要求。", size=11))
    return w, h, "一個音，撐滿 20 秒", "長音測的是「氣有沒有均勻出來」", "\n".join(body), None


def fig_fricative():
    w, h = 640, 300
    body = []
    x0, x1, y = 90, 570, 150
    body.append(rect(x0, y - 12, x1 - x0, 24, fill=BLUE_SOFT, rx=12, opacity=0.6))
    # 細而長的氣流
    for i in range(3):
        body.append(path(
            f"M{x0 + 10} {y - 6 + i * 6} C{(x0 + x1) / 2} {y - 9 + i * 6} {x1 - 60} {y - 7 + i * 6} {x1 - 10} {y - 6 + i * 6}",
            cls="blue", opacity=0.8))
    body.append(ts(x0, y - 30, "「嘶——」：氣要細、要長、不要忽大忽小", size=12))
    body.append(ts(x0, y + 44, "可以拿一張面紙放在嘴前：它只該微微飄，不該被吹得亂飛。", size=12))
    body.append(ts(26, h - 18, "這個練習不發聲，只練「把氣平均送出去」。", size=11))
    return w, h, "嘶——把氣吹得又細又長", "沒有聲音，才聽得出來氣穩不穩", "\n".join(body), None


def fig_dynamic():
    w, h = 640, 320
    body = []
    x0, x1, base = 80, 570, 250
    body.append(path(f"M{x0} {base} L{x1} {base}", cls="thin"))
    body.append(ts(x0, base + 22, "主歌", size=11))
    body.append(ts((x0 + x1) / 2, base + 22, "預副歌", size=11, anchor="middle"))
    body.append(ts(x1, base + 22, "副歌", size=11, anchor="end"))
    body.append(path(f"M{x0} {base - 12} C{200} {base - 30} {260} {base - 40} {330} {base - 96}"
                     f" C{400} {base - 150} {470} {base - 172} {x1} {base - 176}", cls="acc"))
    body.append(ts(330, base - 112, "預副歌開始「存」張力", size=11))
    body.append(ts(x1, base - 190, "副歌放出來", size=11, anchor="end"))
    body.append(ts(26, h - 18, "動態不是越唱越大聲，是「什麼時候留、什麼時候給」。", size=11))
    return w, h, "主歌到副歌的動態曲線", "先收，才有東西可以放", "\n".join(body), None


def fig_break():
    w, h = 640, 320
    body = []
    x0, x1 = 90, 550
    body.append(path(f"M{x0} 250 L{x1} 250", cls="thin"))
    body.append(ts(x0, 272, "低", size=11))
    body.append(ts(x1, 272, "高", size=11, anchor="end"))
    # 上升的線，在換聲區斷開
    body.append(path(f"M{x0} 232 C140 220 180 208 240 190", cls="green", sw=2.2))
    body.append(path("M262 176 C300 166 330 150 360 132", cls="blue", sw=2.2))
    body.append(f'  <path d="M240 190 L262 176" fill="none" stroke="{RED}" stroke-width="1.4" stroke-dasharray="4 3"/>')
    body.append(circle(240, 190, 4.5, fill=GREEN))
    body.append(circle(262, 176, 4.5, fill=BLUE))
    body.append(ts(251, 206, "斷", size=11, anchor="middle", color=RED))
    body.append(ts(251, 148, "不是極限，是交接", size=11, anchor="middle", color=RED))
    body.append(ts(x0, 302, "故意讓它斷一次，你才知道斷在哪裡；一直閃避，永遠找不到那條線。", size=11.5))
    return w, h, "故意破一次，找出斷層", "斷掉的地方就是換聲區的位置", "\n".join(body), None


def fig_breath_points():
    w, h = 640, 300
    body = []
    body.append(path("M70 150 L570 150", cls="thin"))
    # 句子片段
    seg = ["當我們", "唱到這一句", "中間的逗點", "就是換氣的地方"]
    x = 90
    for i, s in enumerate(seg):
        body.append(t(x, 140, s, size=14))
        x += len(s) * 14 + 26
    marks = [90 + len(seg[0]) * 14 + 13, 90 + len(seg[0]) * 14 + 26 + len(seg[1]) * 14 + 13]
    for mx in marks:
        body.append(path(f"M{mx - 6} 176 L{mx} 192 L{mx + 6} 176", fill="none", stroke=BLUE, sw=1.6))
    body.append(ts(70, 220, "在標點換氣，不要在詞中間偷氣——聽的人會聽出來。", size=12.5))
    body.append(ts(70, 244, "一句唱不完，就換一句短一點的歌，而不是把氣擠乾。", size=12.5))
    return w, h, "換氣點畫在句子之間", "換氣是句子的一部分，不是撐不住才補", "\n".join(body), None


def fig_checklist():
    w, h = 640, 340
    body = []
    items = [("冰水、酒精、辛辣", "聲帶黏膜會腫，閉合變差"),
             ("熬夜後硬唱", "肌肉控制最差的時候"),
             ("用力清喉嚨", "等於拿砂紙摩擦聲帶"),
             ("在吵雜環境聊天", "你會不自覺用吼的")]
    for i, (a, b) in enumerate(items):
        y = 100 + i * 52
        body.append(rect(70, y - 18, 22, 22, fill="none", stroke=RED, rx=4, sw=1.4))
        body.append(path(f"M75 {y - 6} L81 {y + 1} L89 {y - 15}", cls="ink", sw=1.4))
        body.append(t(106, y - 2, a, size=13.5, weight=600))
        body.append(ts(300, y - 2, b, size=11.5))
    body.append(ts(26, h - 18, "不是一輩子不能碰，是「要唱之前」先避開。", size=11))
    return w, h, "先避開這幾樣", "護嗓最有效的不是補品，是少做傷害它的事", "\n".join(body), None


def fig_diaphragm():
    w, h = 640, 460
    body = []
    # 左：用肩膀吸
    body.append(human_figure(70, 96, height=280))
    lcx = 70 + 233 / 2
    body.append(t(lcx, 86, "用肩膀吸", size=13, anchor="middle", weight=600, color=RED))
    body.append(arrow(lcx - 26, 156, lcx - 44, 124, "red", size=6))
    body.append(arrow(lcx + 26, 156, lcx + 44, 124, "red", size=6))
    body.append(ts(lcx, 408, "胸口抬起、脖子變短", size=11, anchor="middle"))
    # 右：用下腹
    body.append(human_figure(370, 96, height=280))
    rcx = 370 + 220 / 2
    body.append(t(rcx, 86, "用下腹（橫膈膜）", size=13, anchor="middle", weight=600, color=GREEN))
    body.append(f'  <ellipse cx="{rcx}" cy="236" rx="32" ry="22" fill="{GREEN}" opacity=".2"/>')
    body.append(arrow(rcx + 16, 236, rcx + 46, 236, "green", size=6))
    body.append(arrow(rcx - 16, 236, rcx - 46, 236, "green", size=6))
    body.append(ts(rcx, 408, "肩膀不動，下腹鬆開外擴", size=11, anchor="middle"))
    body.append(ts(26, h - 18, "吸氣像聞花香：沒有聲音、肩膀不動，只有下腹與肋骨在動。", size=11))
    return w, h, "用肚子吸氣，不是用肩膀", "空氣只會進肺，肚子鼓是橫膈膜往下推的結果", "\n".join(body), None


def fig_emotion_map():
    w, h = 640, 340
    body = []
    x0, x1, base = 80, 560, 250
    body.append(path(f"M{x0} {base} L{x1} {base}", cls="thin"))
    for i in range(5):
        x = x0 + (x1 - x0) * i / 4
        body.append(path(f"M{x} {base} L{x} {base + 6}", cls="thin"))
        body.append(ts(x, base + 24, str(i * 2 + 2), size=10.5, anchor="middle"))
    body.append(ts(x0, base + 44, "強度（0–10）", size=10.5))
    pts = [(0.08, 0.2), (0.3, 0.35), (0.55, 0.6), (0.8, 0.85), (0.95, 0.15)]
    d = "M" + " L".join(f"{x0 + (x1 - x0) * fx:.0f} {base - 170 * fy:.0f}" for fx, fy in pts)
    body.append(path(d, cls="acc"))
    for fx, fy in pts:
        body.append(circle(x0 + (x1 - x0) * fx, base - 170 * fy, 4.5, fill=ACCENT))
    body.append(ts(x0, 110, "先標強度，再開口：哪一句該到 8，哪一句只要 3。", size=12))
    body.append(ts(26, h - 18, "把情緒寫成數字很粗魯，但比「唱得有感動一點」有用。", size=11))
    return w, h, "先標強度，再開口", "同一首歌，不是每一句都值得用全力", "\n".join(body), None


def fig_false_folds():
    w, h = 640, 320
    body = []
    # 兩條帶子：真聲帶在上、假聲帶在下
    body.append(rect(90, 130, 180, 16, fill=GREEN, opacity=0.3, rx=8))
    body.append(rect(90, 130, 180, 16, fill="none", stroke=GREEN, rx=8, sw=1.5))
    body.append(rect(90, 168, 180, 10, fill=RED, opacity=0.22, rx=5))
    body.append(rect(90, 168, 180, 10, fill="none", stroke=RED, rx=5, sw=1.4))
    body.append(ts(282, 140, "真聲帶（聲襞）", size=11.5, color=GREEN))
    body.append(ts(282, 176, "假聲帶（室襞）", size=11.5, color=RED))
    body.append(arrow(90, 210, 90, 190, "red", size=6))
    body.append(ts(100, 214, "夾住時，聲音被悶住", size=11, color=RED))
    body.append(verdict(370, 96, 240, 78, "放鬆：只有真聲帶振動", "聲音乾淨、不費力", ok=True))
    body.append(verdict(370, 188, 240, 78, "夾住：假聲帶也擠上來", "聲音悶、喉嚨有感", ok=False))
    body.append(ts(26, h - 18, "假聲帶不會「幫助」你唱高音；它一夾，真聲帶就動不了。", size=11))
    return w, h, "認出假聲帶夾住的那個感覺", "喉嚨裡有兩組皺褶：上面那組一擠，聲音就悶", "\n".join(body), None


def _folds(closed, w=640):
    """聲帶俯視圖：兩片帶子與中間的聲門。"""
    body = []
    gap = 0 if closed else 12
    body.append(rect(70, 120, 200, 46, fill=ACCENT, opacity=0.18, rx=10))
    body.append(rect(70, 120, 200, 46, fill="none", stroke=ACCENT, rx=10, sw=1.5))
    body.append(rect(70, 172 + gap, 200, 46, fill=ACCENT, opacity=0.18, rx=10))
    body.append(rect(70, 172 + gap, 200, 46, fill="none", stroke=ACCENT, rx=10, sw=1.5))
    body.append(ts(170, 110, "聲帶（俯視）", size=11.5, anchor="middle"))
    return "\n".join(body)


def fig_glottis_closed():
    w, h = 640, 300
    body = [_folds(True)]
    body.append(ts(170, 250, "兩片靠攏，中間沒有縫", size=11.5, anchor="middle"))
    body.append(verdict(330, 92, 280, 74, "對：靠攏但不夾", "像兩片嘴唇輕輕碰在一起", ok=True))
    body.append(verdict(330, 182, 280, 74, "錯：夾緊", "像咬牙，氣出不來、聲音刮", ok=False))
    body.append(ts(26, h - 18, "閉合是「碰在一起」，不是「用力夾住」。", size=11))
    return w, h, "讓聲門靠攏但不夾", "閉合不足會漏氣，閉合過度會擠", "\n".join(body), None


def fig_glottis_breathy():
    w, h = 640, 300
    body = [_folds(False)]
    body.append(ts(170, 250, "兩片分開，氣從縫裡漏掉", size=11.5, anchor="middle"))
    for i in range(3):
        body.append(arrow(120 + i * 50, 196, 120 + i * 50, 232, "blue", size=6))
    body.append(ts(330, 120, "氣音是「有氣、沒有清楚音高」；", size=12))
    body.append(ts(330, 142, "假音是「有音高、也漏一點氣」。", size=12))
    body.append(ts(330, 186, "先把閉合調回來，再談真假音。", size=12))
    body.append(ts(26, h - 18, "漏氣不是個性，是閉合不足；長期這樣唱，喉嚨會累。", size=11))
    return w, h, "讓聲門輕輕靠攏", "氣音與假音不同：一個沒有音高，一個有", "\n".join(body), None


def fig_hand_chest():
    w, h = 640, 420
    body = []
    body.append(human_figure(120, 70, height=300))
    cx, cy = 120 + 233 / 2, 70 + 300 * 0.30        # 胸口位置
    # 手掌
    body.append(f'  <g transform="rotate(-12 {cx} {cy})">')
    body.append(rect(cx - 26, cy - 14, 52, 30, fill="#EFD9C6", stroke=INK, rx=8, sw=1.4))
    for i in range(4):
        body.append(path(f"M{cx - 18 + i * 12} {cy - 14} L{cx - 16 + i * 12} {cy + 4}", cls="ink", sw=1))
    body.append("  </g>")
    # 震動
    for i in range(3):
        body.append(circle(cx + 34 + i * 11, cy, 26 + i * 10, fill="none", stroke=ACCENT, sw=1, opacity=0.55))
    body.append(ts(cx - 60, cy + 44, "手掌貼胸口", size=11.5, anchor="end"))
    body.append(ts(400, 150, "唱低音時，手掌會感覺到間歇的震動。", size=12))
    body.append(ts(400, 172, "感覺不到，不代表你唱錯——", size=12))
    body.append(ts(400, 194, "可能是音量太小，或共鳴位置偏高。", size=12))
    body.append(ts(400, 240, "手掌只是感測器：確認低頻有沒有出來，", size=12))
    body.append(ts(400, 262, "不是用來壓。", size=12))
    body.append(ts(26, h - 18, "同一個音，摸得到震動代表低頻共鳴有出來；摸不到也先別硬壓。", size=11))
    return w, h, "手掌貼胸口，找低頻的震動", "摸得到震動，代表低頻共鳴有出來", "\n".join(body), None


def fig_hydrate():
    w, h = 640, 300
    body = []
    x0, x1, y = 90, 560, 160
    body.append(path(f"M{x0} {y} L{x1} {y}", cls="thin"))
    for i in range(4):
        x = x0 + (x1 - x0) * i / 3
        body.append(circle(x, y, 5, fill=INK))
    labels = ["唱歌前 2 小時", "前 1 小時", "唱歌中", "結束後"]
    for i, lab in enumerate(labels):
        x = x0 + (x1 - x0) * i / 3
        body.append(ts(x, y + 28, lab, size=11, anchor="middle"))
    body.append(ts(x0, y - 30, "補水看的是「時間」，不是「總量」", size=12))
    body.append(ts(x0, y + 66, "水喝下去要一段時間才會變成黏膜上的水分；一次灌一大瓶，只是跑厕所。", size=12))
    body.append(ts(26, h - 18, "小口、分散、提前。咖啡與茶可以喝，但不要當成主要水分來源。", size=11))
    return w, h, "提前補水，不要等口渴", "黏膜的濕潤是幾小時前決定的", "\n".join(body), None


def fig_jaw():
    w, h = 640, 300
    body = []
    # 下顎開合的側面示意：一條固定線、一條轉動線
    body.append(path("M140 120 L300 120", cls="ink", sw=2))
    body.append(path("M140 120 L296 214", cls="acc", sw=2))
    body.append(f'  <path d="M290 120 A 176 176 0 0 1 296 214" fill="none" stroke="{RED}" stroke-width="1.2"/>')
    body.append(circle(140, 120, 5, fill=INK))
    body.append(ts(138, 108, "顳顎關節", size=11, anchor="end"))
    body.append(ts(300, 236, "兩指寬", size=11.5, color=RED))
    body.append(ts(200, 106, "固定", size=10.5, color=MUTED))
    body.append(ts(350, 120, "開口的角度在下顎關節，", size=12))
    body.append(ts(350, 142, "不是靠喉嚨往下壓。", size=12))
    body.append(ts(350, 190, "兩指寬（約 3 公分）就夠唱了；", size=12))
    body.append(ts(350, 212, "張太大，喉嚨反而會擠。", size=12))
    body.append(ts(26, h - 18, "下巴是「掉下來」的，不是「拉下來」的：舌頭放鬆，它自己會掉。", size=11))
    return w, h, "讓下巴自己掉下來", "張口的動作在下顎關節，不在喉嚨", "\n".join(body), None


def fig_nasal_check():
    w, h = 640, 300
    body = []
    # 鼻子 + 手指捏住的示意
    body.append(path("M140 120 C140 96 152 84 168 84 C182 84 190 96 190 112 C190 128 178 136 168 136",
                     fill="#F2E7DC", stroke=INK, sw=1.5))
    body.append(circle(150, 150, 16, fill="none", stroke=INK, sw=1.3))
    body.append(circle(186, 150, 16, fill="none", stroke=INK, sw=1.3))
    body.append(arrow(120, 150, 140, 150, "red", size=6))
    body.append(arrow(216, 150, 196, 150, "red", size=6))
    body.append(ts(168, 200, "捏住鼻子再唱一句", size=11.5, anchor="middle"))
    body.append(verdict(262, 92, 170, 74, "聲音沒變", "共鳴在口腔，正常", ok=True))
    body.append(verdict(262, 180, 170, 74, "聲音消失", "太多氣走鼻腔", ok=False))
    body.append(ts(452, 108, "鼻音不是「唱到鼻子」，", size=11.5))
    body.append(ts(452, 130, "是軟顎沒關好、氣漏進鼻腔。", size=11.5))
    body.append(ts(452, 176, "捏住鼻子是 10 秒就能做完的檢查。", size=11.5))
    body.append(ts(26, h - 18, "正常唱歌時，氣應該幾乎全部走口腔。", size=11))
    return w, h, "捏住鼻子，檢查有沒有漏氣", "正常唱歌時，氣應該幾乎全部走口腔", "\n".join(body), None


def fig_octave():
    w, h = 640, 300
    body = []
    x0, x1, base = 90, 550, 230
    body.append(path(f"M{x0} {base} L{x1} {base}", cls="thin"))
    body.append(ts(x0, base + 24, "低音", size=11))
    body.append(ts(x1, base + 24, "同一個音的八度", size=11, anchor="end"))
    body.append(path(f"M{x0} {base - 10} C160 {base - 30} 210 {base - 70} 260 {base - 96}"
                     f" C320 {base - 124} 400 {base - 138} 460 {base - 140} C500 {base - 140} 530 {base - 138} {x1} {base - 136}",
                     cls="acc"))
    body.append(ts(x0, 96, "一口氣滑完八度，中間不要斷、不要用力。", size=12))
    body.append(ts(26, h - 18, "八度滑音是「換聲區通不通」最快的心電圖。", size=11))
    return w, h, "一口氣滑完八度", "滑得順，代表兩套肌肉交接得順", "\n".join(body), None


def fig_posture():
    w, h = 640, 360
    body = []
    # 中軸線
    body.append(f'  <path d="M210 70 L210 320" fill="none" stroke="{LINE}" stroke-width="1.2" stroke-dasharray="5 5"/>')
    pts = [(210, 96, "耳"), (210, 148, "肩"), (210, 226, "骨盆"), (210, 314, "腳踝")]
    for x, y, label in pts:
        body.append(circle(x, y, 7, fill=ACCENT, opacity=0.9))
        body.append(ts(x - 22, y + 4, label, size=11.5, anchor="end"))
    body.append(path("M210 96 C186 120 184 168 196 226 C204 270 206 292 210 314", cls="ink", sw=1.2, opacity=0.35))
    body.append(ts(264, 100, "耳朵、肩膀、骨盆、腳踝，", size=12))
    body.append(ts(264, 122, "從側面看要落在同一條鉛垂線上。", size=12))
    body.append(ts(264, 168, "站直不是挺胸，是「不要塌」：", size=12))
    body.append(ts(264, 190, "肋骨不要往前翻，下巴不要往前伸。", size=12))
    body.append(ts(26, h - 18, "姿勢不是為了好看，是為了讓氣道是直的。", size=11))
    return w, h, "站好，再開始唱", "身體是一根柱子，不是一張弓", "\n".join(body), None


def fig_posture_2():
    w, h = 640, 320
    body = []
    body.append(rect(120, 70, 14, 230, fill=LINE, rx=3))
    body.append(path("M140 90 C176 84 196 130 200 180 C204 226 196 262 190 290", cls="ink", sw=1.5))
    body.append(path("M136 96 L150 96", cls="thin"))
    body.append(ts(150, 76, "牆", size=11))
    body.append(ts(220, 120, "後腦、肩胛、臀部貼牆。", size=12))
    body.append(ts(220, 142, "腰後只留一隻手掌的縫。", size=12))
    body.append(ts(220, 190, "離開牆以後，身體要記得這個位置——", size=12))
    body.append(ts(220, 212, "不是往前挺，是不要塌回去。", size=12))
    body.append(ts(26, h - 18, "貼牆三十秒，比讀十篇姿勢文章有用。", size=11))
    return w, h, "貼牆找中軸", "讓身體先知道「直」是什麼感覺", "\n".join(body), None


def fig_range():
    w, h = 640, 320
    body = []
    rows = [("說話區", 0.0, 0.3, GREEN, "日常講話、最放鬆"),
            ("舒適區", 0.15, 0.62, ACCENT, "能穩定唱、可以練"),
            ("極限區", 0.55, 0.98, RED, "偶爾碰，不要久留")]
    for i, (name, a, b, col, note) in enumerate(rows):
        y = 110 + i * 62
        body.append(t(80, y + 5, name, size=13, weight=600, anchor="end"))
        body.append(rect(100, y - 10, 440, 22, fill=PANEL, stroke=LINE, rx=11, sw=1))
        body.append(rect(100 + 440 * a, y - 10, 440 * (b - a), 22, fill=col, opacity=0.35, rx=11))
        body.append(rect(100 + 440 * a, y - 10, 440 * (b - a), 22, fill="none", stroke=col, rx=11, sw=1.2))
        body.append(ts(556, y + 4, note, size=11))
    body.append(ts(26, h - 18, "選歌看的是「舒適區夠不夠用」，不是「極限音唱不唱得到」。", size=11))
    return w, h, "先量音域，再選歌", "三段音域：能講、能唱、只能碰", "\n".join(body), None


def fig_rest():
    w, h = 640, 300
    body = []
    x0, y0 = 90, 240
    days = ["一", "二", "三", "四", "五", "六", "日"]
    plan = [1, 0, 1, 0, 1, 0, 0]
    for i, (d, p) in enumerate(zip(days, plan)):
        x = x0 + i * 66
        body.append(rect(x, y0 - 90, 44, 90, fill=(ACCENT if p else GREEN), opacity=(0.28 if p else 0.18), rx=4))
        body.append(rect(x, y0 - 90, 44, 90, fill="none", stroke=(ACCENT if p else GREEN), rx=4, sw=1.1))
        body.append(t(x + 22, y0 + 22, d, size=12, anchor="middle"))
        body.append(ts(x + 22, y0 - 100, "練" if p else "休", size=11, anchor="middle"))
    body.append(ts(26, h - 18, "聲帶是肌肉：練完需要恢復。每天硬練，進步反而停住。", size=11))
    return w, h, "聲音是練不出來的，是休息出來的", "一週排三到四天，比天天練有效", "\n".join(body), None


def fig_sigh():
    w, h = 640, 300
    body = []
    x0, x1, base = 100, 540, 200
    body.append(path(f"M{x0} {base - 40} C180 {base - 60} 220 {base - 40} 280 {base + 20}"
                     f" C330 {base + 66} 400 {base + 76} 470 {base + 80} L{x1} {base + 82}",
                     cls="blue", sw=2))
    body.append(ts(x0, base - 70, "「唉——」：氣先出來，聲音跟著掉", size=12))
    body.append(ts(x0, base + 116, "嘆氣是最放鬆的發聲：沒有起音的撞擊，聲帶自己閉合。", size=12))
    body.append(ts(26, h - 18, "唱不下去的時候，先嘆十口氣，比硬唱十分鐘有用。", size=11))
    return w, h, "嘆一口氣，聲音自然掉出來", "沒有用力，聲音也會出來——這是起音的原型", "\n".join(body), None


def fig_soft_onset():
    w, h = 640, 340
    body = []
    cases = [("氣聲起音", "太晚閉合", BLUE, 0.2), ("平衡起音", "氣與閉合同時", GREEN, 1.0), ("硬起音", "先夾再出氣", RED, 0.0)]
    for i, (name, note, col, delay) in enumerate(cases):
        x0 = 90 + i * 180
        base = 220
        body.append(path(f"M{x0} {base} L{x0 + 140} {base}", cls="thin"))
        # 音量包絡
        if delay > 0.6:
            d = f"M{x0} {base} C{x0 + 10} {base - 10} {x0 + 20} {base - 60} {x0 + 60} {base - 76} L{x0 + 130} {base - 76}"
        elif delay < 0.3:
            d = f"M{x0} {base} L{x0 + 8} {base - 96} L{x0 + 130} {base - 70}"
        else:
            d = f"M{x0} {base} C{x0 + 20} {base - 40} {x0 + 40} {base - 78} {x0 + 70} {base - 78} L{x0 + 130} {base - 78}"
        body.append(path(d, cls={BLUE: "blue", GREEN: "green", RED: "red"}[col]))
        body.append(t(x0 + 70, base + 26, name, size=12.5, anchor="middle", weight=600, color=col))
        body.append(ts(x0 + 70, base + 46, note, size=11, anchor="middle"))
    body.append(ts(26, h - 18, "三種起音都合法，但大部分時候你要的是中間那種。", size=11))
    return w, h, "三種起音，先聽再選", "起音決定那一個字聽起來是縮的、圓的，還是撞的", "\n".join(body), None


def fig_steam():
    w, h = 640, 300
    body = []
    x0, x1, y = 90, 560, 160
    body.append(rect(x0, y - 12, x1 - x0, 24, fill=BLUE_SOFT, rx=12, opacity=0.7))
    body.append(rect(x0, y - 12, (x1 - x0) * 0.35, 24, fill=BLUE, rx=12, opacity=0.35))
    body.append(ts(x0, y - 26, "蒸氣 5–10 分鐘", size=11.5, color=BLUE))
    body.append(ts(x1, y - 26, "然後完全休息", size=11.5, anchor="end"))
    body.append(ts(x0, y + 40, "蒸氣只是讓黏膜濕潤、暫時舒服；", size=12))
    body.append(ts(x0, y + 62, "它不會修復聲帶，更不能當成繼續唱的藉口。", size=12))
    body.append(ts(26, h - 18, "真的痛、真的沙啞超過兩週，就看醫生，不要自己處理。", size=11))
    return w, h, "蒸氣急救，然後完全休息", "舒緩不等於治療", "\n".join(body), None


def fig_steps3():
    w, h = 640, 280
    body = []
    labels = [("先分開", "把兩個動作拆開做對"), ("再連起來", "慢慢接，允許失敗"), ("放回歌裡", "一次只改一個字")]
    for i, (a, b) in enumerate(labels):
        x = 70 + i * 180
        body.append(rect(x, 110, 150, 84, fill=PANEL, stroke=ACCENT, rx=8, sw=1.4))
        body.append(badge(x + 20, 132, i + 1, ACCENT, 9))
        body.append(t(x + 40, 137, a, size=13.5, weight=600))
        body.append(ts(x + 16, 172, b, size=11))
        if i < 2:
            body.append(arrow(x + 158, 152, x + 176, 152, "muted", size=6))
    body.append(ts(26, h - 18, "任何技巧都走這三步；跳過第一步，通常會卡在第三步。", size=11))
    return w, h, "三段式練習", "分開 → 連起來 → 放回歌裡", "\n".join(body), None


def fig_timing():
    w, h = 640, 300
    body = []
    x0, x1, base = 90, 560, 180
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8
        body.append(path(f"M{x} {base - 40} L{x} {base + 40}", cls="thin"))
    for i in range(5):
        x = x0 + (x1 - x0) * i / 4
        body.append(path(f"M{x} {base - 54} L{x} {base + 54}", cls="ink", sw=1.2, opacity=0.5))
    marks = [(0.125, "搶拍", RED), (0.25, "正拍", GREEN), (0.375, "拖拍", BLUE)]
    for fx, name, col in marks:
        x = x0 + (x1 - x0) * fx
        body.append(circle(x, base, 7, fill=col))
        body.append(ts(x, base + 74, name, size=11.5, anchor="middle", color=col))
    body.append(ts(x0, 100, "先跟得準，再談「微小的時間差」。", size=12))
    body.append(ts(26, h - 18, "搶拍與拖拍是裝飾，不是走音；前提是你先有能力落在正拍上。", size=11))
    return w, h, "先跟節拍，再談律動", "律動是相對於正拍的偏移，不是隨機", "\n".join(body), None


def _torso(x, y, dome, label, sub, col, note):
    """側面軀幹示意：肺、肋骨弧線與橫膈膜圓頂。dome = 圓頂下降的像素。"""
    g = []
    g.append(rect(x, y, 170, 210, fill=PANEL, stroke=LINE, rx=18, sw=1.2))
    # 肺（兩片氣球狀）
    for cx, cy in [(x + 56, y + 92), (x + 114, y + 92)]:
        g.append(f'  <ellipse cx="{cx}" cy="{cy}" rx="30" ry="48" fill="{BLUE_SOFT}" stroke="{BLUE}" stroke-width="1.3" opacity=".85"/>')
    # 肋骨弧線
    for i in range(3):
        yy = y + 62 + i * 34
        g.append(path(f"M{x + 18} {yy} C{x + 60} {yy - 16} {x + 110} {yy - 16} {x + 152} {yy}", cls="thin", sw=1.3))
    # 橫膈膜圓頂（位置隨吸氣下降）
    base = y + 196
    g.append(path(f"M{x + 16} {base} C{x + 52} {base - 34 - dome} {x + 118} {base - 34 - dome} {x + 154} {base}",
                  fill=ACCENT, stroke=ACCENT, sw=2, opacity=0.3))
    g.append(t(x + 85, y - 18, label, size=13, anchor="middle", weight=600, color=col))
    g.append(ts(x + 85, y - 2, sub, size=10.5, anchor="middle"))
    g.append(ts(x + 85, y + 234, note, size=10.5, anchor="middle"))
    return "\n".join(g)


def fig_breath_cycle():
    w, h = 640, 400
    body = [
        _torso(70, 90, 8, "平常呼吸", "橫膈膜只下降一點", GREEN, "夠活著用"),
        _torso(370, 90, 34, "唱歌吸氣", "下降更多、肋骨外擴", BLUE, "低、寬、不僵"),
    ]
    body.append(arrow(300, 300, 336, 300, "ink", size=6))
    body.append(ts(70, 362, "吸氣像聞花香：沒有聲音，肩膀不動。", size=11.5))
    return w, h, "呼吸與唱歌吸氣的差別", "橫膈膜下降的幅度，決定你吸進多少氣", "\n".join(body), None


def fig_breath_budget():
    w, h = 640, 320
    body = []
    x0, x1, y = 80, 570, 150
    parts = [("起音", 0.1, ACCENT), ("維持", 0.7, GREEN), ("收尾", 0.2, BLUE)]
    cx = x0
    for name, frac, col in parts:
        ww = (x1 - x0) * frac
        body.append(rect(cx, y, ww - 3, 26, fill=col, opacity=0.3, rx=4))
        body.append(rect(cx, y, ww - 3, 26, fill="none", stroke=col, rx=4, sw=1.2))
        body.append(t(cx + ww / 2, y + 18, name, size=12, anchor="middle", weight=600))
        cx += ww
    body.append(path(f"M{x0} {y + 70} C140 {y + 60} 200 {y + 60} 260 {y + 56} L430 {y + 56} C500 {y + 56} 530 {y + 66} {x1} {y + 86}",
                     cls="acc"))
    body.append(ts(x0, y - 16, "一口氣在長音上的分配", size=12))
    body.append(ts(x0, y + 130, "大部分人把 80% 的氣花在前 3 秒；正確的分配剛好相反。", size=12))
    body.append(ts(26, h - 18, "收尾不是「氣用完」，是「氣還有一點，但決定停」。", size=11))
    return w, h, "一口氣在長音上的分配", "起音只該用掉一小部分，留下來給維持", "\n".join(body), None


def fig_diaphragm_support():
    w, h = 640, 360
    body = [
        _torso(70, 86, 30, "吸氣：下腹外擴", "肋骨往側後方打開", BLUE, "肩膀不動"),
        _torso(370, 86, 22, "發聲：保持撐住", "不要立刻塌回去", GREEN, "腹壁有抗力"),
    ]
    body.append(arrow(292, 210, 292, 250, "acc", size=6))
    body.append(ts(70, 340, "支撐不是把肚子用力頂出去，是「不要讓它一下子縮回來」。", size=11.5))
    return w, h, "丹田支撐：吸氣外擴，發聲保持", "氣不是被「推」出來，是被穩定地放出來", "\n".join(body), None


def human_figure(x, y, height=300, fill="#E9DACA", stroke=INK):
    """把 CC0 人形輪廓（assets/vocal/_anatomy/src/human-standing.svg）縮放後放進圖裡。"""
    import re as _re
    src = (BASE_DIR / "assets" / "vocal" / "_anatomy" / "src" / "human-standing.svg").read_text(encoding="utf-8")
    d = _re.search(r'<path[^>]*\sd="([^"]+)"', src, _re.S).group(1)
    s = height / 297.0
    return (
        f'  <g transform="translate({x},{y}) scale({s:.4f})">'
        f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{1.3 / s:.2f}" stroke-linejoin="round"/>'
        f"</g>"
    )


def fig_posture_side():
    w, h = 640, 480
    body = []
    body.append(human_figure(150, 84, height=330))
    # 中軸與四個定位點（正面觀）
    cx = 150 + 233 / 2
    body.append(f'  <path d="M{cx} 96 L{cx} 404" fill="none" stroke="{MUTED}" stroke-width="1" stroke-dasharray="5 5"/>')
    marks = [(cx, 118, "耳"), (cx, 150, "肩"), (cx, 290, "骨盆"), (cx, 402, "腳踝")]
    for mx, my, label in marks:
        body.append(circle(mx, my, 5, fill=ACCENT, stroke="#fff", sw=1.5))
        body.append(callout(mx - 5, my, 196, my))
        body.append(ts(190, my + 4, label, size=11.5, anchor="end"))
    body.append(ts(410, 112, "站好時，耳朵、肩膀、骨盆、", size=12))
    body.append(ts(410, 134, "腳踝要落在同一條鉛垂線上。", size=12))
    body.append(ts(410, 188, "肩膀一高一低、骨盆歪一邊，", size=12))
    body.append(ts(410, 210, "氣就會只進得去半邊。", size=12))
    body.append(ts(410, 264, "站直不是挺胸：挺胸會讓肋骨", size=12))
    body.append(ts(410, 286, "翻起來，腰反而更凹。", size=12))
    body.append(ts(26, h - 18, "姿勢的目的只有一個：讓氣道是直的。", size=11))
    return w, h, "站姿：四個點對齊", "耳朵、肩膀、骨盆、腳踝落在同一條鉛垂線上", "\n".join(body), None


def fig_articulation():
    w, h = 640, 400
    body = []
    # 口腔側剖面的管狀示意：左邊是唇，右邊通往咽
    top = "M96 150 C150 118 230 112 300 124 C330 130 348 146 356 168"
    bottom = "M96 214 C140 236 220 244 300 236 C330 232 350 222 360 208"
    body.append(path(top, cls="ink", sw=1.8))
    body.append(path(bottom, cls="ink", sw=1.8))
    body.append(path(f"{top} L356 168 L360 208 L96 214", fill=ACCENT, opacity=0.05, stroke="none"))
    # 軟顎：從上顎後端垂下
    body.append(path("M300 124 C330 132 344 152 342 176 C332 162 318 152 304 148 Z",
                     fill=ACCENT, stroke=ACCENT, sw=1.3, opacity=0.3))
    # 舌頭
    body.append(path("M118 210 C150 176 230 168 286 186 C306 192 312 200 300 206 C240 220 170 220 118 214 Z",
                     fill=ACCENT, stroke=ACCENT, sw=1.3, opacity=0.25))
    # 齒
    body.append(rect(96, 150, 12, 20, fill=PANEL, stroke=INK, rx=2, sw=1.2))
    body.append(rect(96, 194, 12, 20, fill=PANEL, stroke=INK, rx=2, sw=1.2))
    # 唇
    body.append(path("M96 150 C82 158 82 206 96 214", cls="ink", sw=1.8))

    marks = [(104, 146, "唇", "end"), (140, 190, "齒", "end"), (200, 118, "齒齦", "middle"),
             (268, 108, "硬顎", "middle"), (356, 196, "軟顎", "start"), (196, 240, "舌", "middle")]
    for x, y, txt, anchor in marks:
        body.append(ts(x, y, txt, size=11.5, anchor=anchor))
    body.append(ts(392, 132, "咬字是舌頭與軟顎的形狀變化，", size=12))
    body.append(ts(392, 154, "不是下巴開合的大小。", size=12))
    body.append(ts(392, 198, "換母音＝換舌位；", size=12))
    body.append(ts(392, 220, "換子音＝換阻斷的位置。", size=12))
    body.append(ts(26, h - 18, "六個部位裡，只有舌頭與軟顎需要「練」；唇齒多數時候只是跟著。", size=11))
    return w, h, "口腔：咬字用到的六個部位", "唇、齒、齒齦、硬顎、軟顎、舌", "\n".join(body), None


def fig_closure_grades():
    w, h = 640, 360
    body = []
    cases = [("漏氣", "兩片分開", BLUE, 14), ("平衡", "輕輕靠攏", GREEN, 0), ("壓迫", "夾得太緊", RED, -6)]
    for i, (name, note, col, gap) in enumerate(cases):
        x = 80 + i * 190
        y = 120
        body.append(rect(x, y, 150, 30, fill=col, opacity=0.2, rx=8))
        body.append(rect(x, y, 150, 30, fill="none", stroke=col, rx=8, sw=1.4))
        body.append(rect(x, y + 42 + gap, 150, 30, fill=col, opacity=0.2, rx=8))
        body.append(rect(x, y + 42 + gap, 150, 30, fill="none", stroke=col, rx=8, sw=1.4))
        body.append(t(x + 75, y + 110, name, size=13, anchor="middle", weight=600, color=col))
        body.append(ts(x + 75, y + 130, note, size=11, anchor="middle"))
        outcome = ["氣音多、容易累", "乾淨、省力", "刮、喉嚨痛"][i]
        body.append(ts(x + 75, y + 152, outcome, size=11, anchor="middle"))
    body.append(ts(26, h - 18, "閉合是一個連續的光譜：太少會漏氣，太多會擠，中間才是可以唱很久的位置。", size=11))
    return w, h, "聲帶閉合三級：漏氣、平衡、壓迫", "中間那一級不是「用力」，是「剛好」", "\n".join(body), None


def fig_folds_open_closed():
    w, h = 640, 320
    body = [
        _folds(False),
    ]
    body.append(ts(170, 250, "吸氣：張開讓氣通過", size=11.5, anchor="middle"))
    body.append(rect(330, 90, 0, 0, fill="none"))
    # 右側：閉合
    body.append(rect(370, 120, 200, 46, fill=ACCENT, opacity=0.18, rx=10))
    body.append(rect(370, 120, 200, 46, fill="none", stroke=ACCENT, rx=10, sw=1.5))
    body.append(rect(370, 172, 200, 46, fill=ACCENT, opacity=0.18, rx=10))
    body.append(rect(370, 172, 200, 46, fill="none", stroke=ACCENT, rx=10, sw=1.5))
    body.append(t(470, 100, "發聲：靠攏", size=12, anchor="middle", weight=600))
    body.append(ts(470, 250, "兩片碰在一起，氣才會被擋住", size=11.5, anchor="middle"))
    body.append(ts(26, h - 18, "吸氣與發聲是兩件事：一開一合，中間沒有「半開」的正常狀態。", size=11))
    return w, h, "聲帶開合：吸氣張開，發聲靠攏", "閉合不是用力夾，是兩片剛好碰上", "\n".join(body), None


def fig_fold_thickness():
    w, h = 640, 340
    body = []
    # 厚短
    body.append(rect(90, 120, 120, 60, fill=GREEN, opacity=0.2, rx=30))
    body.append(rect(90, 120, 120, 60, fill="none", stroke=GREEN, rx=30, sw=1.5))
    body.append(t(150, 220, "厚、短", size=13, anchor="middle", weight=600, color=GREEN))
    body.append(ts(150, 240, "振動慢 → 音低", size=11, anchor="middle"))
    # 薄長
    body.append(rect(330, 132, 190, 32, fill=BLUE, opacity=0.2, rx=16))
    body.append(rect(330, 132, 190, 32, fill="none", stroke=BLUE, rx=16, sw=1.5))
    body.append(t(425, 220, "薄、長", size=13, anchor="middle", weight=600, color=BLUE))
    body.append(ts(425, 240, "振動快 → 音高", size=11, anchor="middle"))
    body.append(arrow(240, 150, 316, 150, "ink", size=7))
    body.append(ts(278, 136, "拉長", size=11, anchor="middle"))
    body.append(ts(90, 296, "改變音高的是形狀（長度與厚度），不是氣的大小。", size=12))
    return w, h, "聲帶厚薄與音高", "同一條聲帶，拉長就變薄、變高", "\n".join(body), None


def fig_fold_swelling():
    w, h = 640, 320
    body = []
    body.append(t(150, 90, "正常", size=13, anchor="middle", weight=600, color=GREEN))
    body.append(rect(70, 120, 160, 34, fill=GREEN, opacity=0.2, rx=8))
    body.append(rect(70, 120, 160, 34, fill="none", stroke=GREEN, rx=8, sw=1.4))
    body.append(rect(70, 174, 160, 34, fill=GREEN, opacity=0.2, rx=8))
    body.append(rect(70, 174, 160, 34, fill="none", stroke=GREEN, rx=8, sw=1.4))
    body.append(ts(150, 240, "邊緣乾淨、閉合完整", size=11, anchor="middle"))
    body.append(t(430, 90, "水腫", size=13, anchor="middle", weight=600, color=RED))
    body.append(rect(350, 114, 160, 50, fill=RED, opacity=0.2, rx=20))
    body.append(rect(350, 114, 160, 50, fill="none", stroke=RED, rx=20, sw=1.4))
    body.append(rect(350, 184, 160, 50, fill=RED, opacity=0.2, rx=20))
    body.append(rect(350, 184, 160, 50, fill="none", stroke=RED, rx=20, sw=1.4))
    body.append(ts(430, 258, "變厚、變圓，閉合出現縫隙", size=11, anchor="middle"))
    body.append(ts(26, h - 18, "喝冰水、熬夜、硬唱之後，聲帶會腫；腫起來的聲音你自己聽得出來。", size=11))
    return w, h, "正常聲帶與水腫聲帶", "水腫不會痛，但會讓聲音變悶、變費力", "\n".join(body), None


def fig_breath_noise():
    w, h = 640, 340
    body = []
    body.append(ts(70, 96, "乾淨的聲音：諧波清楚", size=12))
    for i in range(7):
        x = 80 + i * 46
        body.append(rect(x, 220 - (60 + i % 2 * 10), 12, 60 + i % 2 * 10, fill=ACCENT, opacity=0.6, rx=2))
    body.append(ts(70, 250, "諧波＋少量噪音", size=11))
    body.append(ts(70, 300, "氣聲：諧波之間被寬頻噪音填滿", size=12))
    for i in range(7):
        x = 380 + i * 24
        body.append(rect(x, 210 - (40 + i % 2 * 8), 8, 40 + i % 2 * 8, fill=ACCENT, opacity=0.35, rx=2))
    body.append(rect(376, 214, 190, 22, fill=BLUE, opacity=0.25, rx=6))
    body.append(ts(376, 250, "噪音底層被抬起來", size=11, color=BLUE))
    body.append(ts(26, h - 18, "氣聲不是「感情」，是閉合不足加上送氣太多；要用的時候再用。", size=11))
    return w, h, "氣聲成分：諧波加上寬頻噪音", "聲音的「沙沙感」來自聲帶沒有完全閉合", "\n".join(body), None


def fig_onset_types():
    w, h = 640, 340
    body = []
    cases = [("氣聲起音", "氣先出來，聲帶才閉合", BLUE, "h"), ("平衡起音", "氣與閉合一起到", GREEN, ""), ("硬起音", "先夾住再放氣", RED, "")]
    for i, (name, note, col, _) in enumerate(cases):
        x0 = 80 + i * 188
        base = 230
        body.append(path(f"M{x0} {base} L{x0 + 150} {base}", cls="thin"))
        if i == 0:
            d = f"M{x0} {base} C{x0 + 30} {base - 20} {x0 + 60} {base - 76} {x0 + 96} {base - 80} L{x0 + 146} {base - 80}"
        elif i == 1:
            d = f"M{x0} {base} C{x0 + 26} {base - 40} {x0 + 44} {base - 84} {x0 + 80} {base - 84} L{x0 + 146} {base - 84}"
        else:
            d = f"M{x0} {base} L{x0 + 10} {base - 108} L{x0 + 146} {base - 78}"
        body.append(path(d, cls={BLUE: "blue", GREEN: "green", RED: "red"}[col]))
        body.append(t(x0 + 75, base + 26, name, size=12.5, anchor="middle", weight=600, color=col))
        body.append(ts(x0 + 75, base + 46, note, size=10.5, anchor="middle"))
    body.append(ts(26, h - 18, "起音是「氣」與「閉合」誰先到的問題；兩個一起到，聲音最乾淨。", size=11))
    return w, h, "三種起音：氣聲、平衡、硬", "同一句話，起音方式決定第一個字的表情", "\n".join(body), None


def fig_resonance_blend():
    w, h = 640, 320
    body = []
    x0, x1, y = 80, 560, 150
    body.append(rect(x0, y, x1 - x0, 30, fill=PANEL, stroke=LINE, rx=15, sw=1.1))
    segs = [("胸腔", 0.3, GREEN), ("口咽腔", 0.45, ACCENT), ("鼻腔／頭腔", 0.25, BLUE)]
    cx = x0
    for name, frac, col in segs:
        ww = (x1 - x0) * frac
        body.append(rect(cx + 2, y + 2, ww - 4, 26, fill=col, opacity=0.3, rx=13))
        body.append(t(cx + ww / 2, y + 22, name, size=11.5, anchor="middle", weight=600))
        cx += ww
    body.append(ts(x0, y - 14, "三種共鳴腔的比例", size=12))
    body.append(ts(x0, y + 66, "比例可以調：同一句歌詞，往胸腔一點會厚，往頭腔一點會亮。", size=12))
    body.append(ts(x0, y + 90, "但比例不是「全開」最好——三個都滿，聲音會糊。", size=12))
    body.append(ts(26, h - 18, "共鳴不是把聲音「送到」某個腔，是調整聲道形狀讓某些頻率留下來。", size=11))
    return w, h, "三種共鳴腔的比例", "胸腔、口咽腔、鼻腔／頭腔各佔多少", "\n".join(body), None


def fig_soft_palate():
    w, h = 640, 360
    body = []
    for i, (title, up, col) in enumerate([("軟顎放下：聲音走鼻腔", False, RED), ("軟顎抬起：聲音走口腔", True, GREEN)]):
        x = 60 + i * 290
        body.append(t(x + 110, 80, title, size=12, anchor="middle", weight=600, color=col))
        body.append(path(f"M{x} 120 C{x + 60} 100 {x + 130} 100 {x + 180} 118", cls="ink", sw=1.5))
        if up:
            body.append(path(f"M{x + 180} 118 C{x + 196} 104 {x + 208} 96 {x + 214} 86", cls="ink", sw=1.5, fill="none"))
            body.append(arrow(x + 110, 150, x + 110, 200, "green", size=6))
            body.append(ts(x + 110, 222, "氣流走口腔", size=11, anchor="middle", color=GREEN))
        else:
            body.append(path(f"M{x + 180} 118 C{x + 196} 134 {x + 206} 156 {x + 204} 176", cls="ink", sw=1.5, fill="none"))
            body.append(arrow(x + 190, 130, x + 214, 104, "red", size=6))
            body.append(ts(x + 216, 104, "漏進鼻腔", size=11, color=RED))
        body.append(rect(x + 30, 156, 150, 26, fill=PANEL, stroke=LINE, rx=6, sw=1))
        body.append(ts(x + 105, 200, "口腔", size=11, anchor="middle"))
    body.append(ts(26, h - 18, "軟顎是鼻音與非鼻音的開關；它抬不起來，聲音就會「悶」。", size=11))
    return w, h, "軟顎抬起與放下", "聲音往口腔還是往鼻腔，由這塊肌肉決定", "\n".join(body), None


def fig_formant_filter():
    w, h = 640, 340
    body = []
    # 左：諧波列
    body.append(ts(60, 90, "聲源：一串諧波", size=12))
    for i in range(10):
        x = 60 + i * 26
        body.append(rect(x, 220 - 70 + i * 4, 8, 70 - i * 4, fill=ACCENT, opacity=0.55, rx=2))
    body.append(ts(60, 250, "頻率 →", size=10.5))
    # 中：濾波曲線
    body.append(ts(340, 90, "聲道：濾波器", size=12))
    body.append(path("M340 210 C370 210 380 130 420 130 C460 130 470 190 520 190", cls="blue", sw=2))
    body.append(ts(340, 250, "共振峰把某些頻率放大", size=11, color=BLUE))
    # 右：結果
    body.append(ts(340, 296, "結果：輸出頻譜", size=11.5))
    body.append(ts(60, 300, "同樣的聲帶振動，換聲道形狀，就換了母音。", size=12))
    return w, h, "聲源－濾波器：諧波怎麼變成母音", "聲帶提供原料，聲道決定最後的形狀", "\n".join(body), None


def fig_vowel_formants_ch():
    w, h = 640, 400
    body = []
    left, right, top, bottom = 120, 560, 100, 320
    body.append(rect(left, top, right - left, bottom - top, fill=PANEL, stroke=LINE, rx=4, sw=1.2))
    body.append(arrow(left - 16, top, left - 16, bottom, "ink", size=7))
    body.append(ts(left - 24, top + 6, "F1 低", size=10.5, anchor="end"))
    body.append(ts(left - 24, bottom, "F1 高", size=10.5, anchor="end"))
    body.append(arrow(left, bottom + 20, right, bottom + 20, "ink", size=7))
    body.append(ts(right, bottom + 40, "F2 低 → 高", size=10.5, anchor="end"))
    pts = [("i", 0.2, 0.1), ("e", 0.32, 0.26), ("a", 0.55, 0.9), ("o", 0.4, 0.72), ("u", 0.28, 0.55)]
    for name, fx, fy in pts:
        x = left + (right - left) * fx
        y = top + (bottom - top) * fy
        body.append(circle(x, y, 14, fill=ACCENT, opacity=0.16))
        body.append(circle(x, y, 4.5, fill=ACCENT))
        body.append(t(x + 18, y + 5, name, size=14, weight=700))
    body.append(ts(26, h - 18, "母音的位置由舌頭高低（F1）與前後（F2）決定；這是所有語言共通的骨架。", size=11))
    return w, h, "五個母音在 F1－F2 平面上的位置", "唱同一個音，換母音就是換舌位", "\n".join(body), None


def fig_false_folds_ch():
    w, h = 640, 340
    body = []
    # 喉部側剖面的簡化：兩組皺褶
    body.append(path("M120 90 C200 80 260 100 280 140 C296 176 280 214 240 226 L120 226",
                     fill="#F2E7DC", stroke=INK, sw=1.5))
    body.append(rect(150, 120, 110, 12, fill=RED, opacity=0.3, rx=6))
    body.append(rect(150, 120, 110, 12, fill="none", stroke=RED, rx=6, sw=1.3))
    body.append(rect(150, 152, 110, 14, fill=ACCENT, opacity=0.35, rx=7))
    body.append(rect(150, 152, 110, 14, fill="none", stroke=ACCENT, rx=7, sw=1.4))
    body.append(ts(200, 110, "假聲帶", size=11, anchor="middle", color=RED))
    body.append(ts(200, 188, "真聲帶", size=11, anchor="middle", color=ACCENT))
    body.append(arrow(120, 250, 120, 214, "blue", size=6))
    body.append(ts(110, 268, "氣流", size=11, anchor="end", color=BLUE))
    body.append(ts(320, 130, "假聲帶在上、真聲帶在下。", size=12))
    body.append(ts(320, 152, "假聲帶一夾，聲音會被悶住；", size=12))
    body.append(ts(320, 174, "它的工作是閉氣與保護，不是發聲。", size=12))
    body.append(ts(320, 214, "感覺「喉嚨上方有東西擠住」，通常就是它。", size=11.5, color=RED))
    body.append(ts(26, h - 18, "咳、用力、憋氣時，假聲帶會自動關起來——這是身體的防禦，不是唱歌的動作。", size=11))
    return w, h, "喉部側剖面：假聲帶在上、真聲帶在下", "兩個皺褶，一組發聲、一組保護", "\n".join(body), None


def fig_groove():
    w, h = 640, 320
    body = []
    x0, x1, base = 100, 560, 180
    for i in range(9):
        x = x0 + (x1 - x0) * i / 8
        body.append(path(f"M{x} {base - 40} L{x} {base + 40}", cls="thin"))
    for i in range(5):
        x = x0 + (x1 - x0) * i / 4
        body.append(path(f"M{x} {base - 54} L{x} {base + 54}", cls="ink", sw=1.2, opacity=0.45))
    for fx, name, col in [(0.115, "搶拍", RED), (0.25, "正拍", GREEN), (0.39, "拖拍", BLUE)]:
        x = x0 + (x1 - x0) * fx
        body.append(circle(x, base, 7, fill=col))
        body.append(ts(x, base + 74, name, size=11.5, anchor="middle", color=col))
    body.append(ts(x0, 104, "同一個拍點，唱早一點或晚一點，感覺就不同。", size=12))
    body.append(ts(26, h - 18, "律動是「故意」的偏移；先能穩定落在正拍，偏移才有意義。", size=11))
    return w, h, "拍點前後的微小時差", "搶拍、正拍、拖拍差的是幾十毫秒", "\n".join(body), None


def fig_harmony():
    w, h = 640, 320
    body = []
    x0, x1 = 90, 550
    layers = [("高和聲（+3 度）", 0.0, BLUE), ("主唱", 0.5, ACCENT), ("低和聲（−3 度）", 1.0, GREEN)]
    for i, (name, off, col) in enumerate(layers):
        y = 128 + i * 62
        body.append(t(x0, y - 22, name, size=11.5, color=col, weight=600))
        body.append(rect(x0, y - 14, x1 - x0, 28, fill=col, opacity=0.12, rx=6))
        body.append(rect(x0, y - 14, x1 - x0, 28, fill="none", stroke=col, rx=6, sw=1.2))
        for j in range(8):
            x = x0 + 40 + j * 54 + (off - 0.5) * 22
            body.append(circle(x, y, 5, fill=col, opacity=0.85))
    body.append(ts(x0, 290, "和聲不是把同一個音唱大聲，是在上面或下面加一條獨立旋律。", size=12))
    return w, h, "主唱與和聲的堆疊", "每一條都要能單獨聽，合起來才不糊", "\n".join(body), None


def fig_headphone():
    w, h = 640, 320
    body = []
    # 耳機與耳朵
    body.append(path("M110 90 C150 70 210 70 250 90", cls="ink", sw=1.6))
    body.append(rect(96, 88, 26, 60, fill=ACCENT, opacity=0.3, stroke=ACCENT, rx=8, sw=1.2))
    body.append(rect(238, 88, 26, 60, fill=ACCENT, opacity=0.3, stroke=ACCENT, rx=8, sw=1.2))
    body.append(circle(180, 180, 34, fill="#F2E7DC", stroke=INK, sw=1.4))
    body.append(ts(180, 240, "耳朵", size=11.5, anchor="middle"))
    # 兩條路徑
    body.append(arrow(150, 120, 168, 160, "blue", size=6))
    body.append(ts(120, 108, "空氣傳導", size=11, color=BLUE))
    body.append(arrow(196, 130, 196, 158, "green", size=6))
    body.append(ts(208, 140, "骨傳導", size=11, color=GREEN))
    body.append(ts(320, 120, "耳機裡的聲音走空氣傳導，", size=12))
    body.append(ts(320, 142, "自己聽自己的聲音還多一條骨傳導。", size=12))
    body.append(ts(320, 186, "所以錄音裡的你，會跟平時聽到的不同。", size=12))
    body.append(ts(26, h - 18, "這不是耳朵壞了，是路徑不同；先接受這件事，再談混音。", size=11))
    return w, h, "耳機監聽與骨傳導兩條路徑", "錄音聽到的自己，才是別人聽到的你", "\n".join(body), None


def fig_mic_distance():
    w, h = 640, 340
    body = []
    body.append(circle(90, 150, 26, fill=ACCENT, opacity=0.3, stroke=ACCENT, sw=1.4))
    body.append(ts(90, 196, "麥克風", size=11.5, anchor="middle"))
    for i, (d, name, note) in enumerate([(140, "3 公分", "低頻變厚、噴麥"), (230, "15 公分", "最平衡"), (330, "50 公分", "空間感多、細節少")]):
        x = 90 + d
        body.append(path(f"M116 {150 - 40} L{x} {100 + i * 50}", cls="thin"))
        body.append(rect(x, 88 + i * 50, 74, 26, fill=PANEL, stroke=LINE, rx=6, sw=1))
        body.append(ts(x + 8, 106 + i * 50, name, size=10.5, anchor="start"))
        body.append(ts(x + 8, 130 + i * 50, note, size=10.5))
    body.append(ts(26, h - 18, "距離決定的是「低頻比例」與「空間感」，不是音量——音量可以用增益補。", size=11))
    return w, h, "麥克風距離與音色", "越近低頻越多（近接效應），越遠空間越多", "\n".join(body), None


def fig_mix_blend():
    w, h = 640, 360
    body = []
    x0, x1, y = 80, 560, 150
    body.append(f'  <defs><linearGradient id="mbg" x1="0" x2="1">'
                f'<stop offset="0" stop-color="{GREEN}" stop-opacity=".5"/>'
                f'<stop offset="1" stop-color="{BLUE}" stop-opacity=".5"/>'
                f'</linearGradient></defs>')
    body.append(rect(x0, y, x1 - x0, 32, fill="url(#mbg)", rx=16))
    body.append(rect(x0, y, x1 - x0, 32, fill="none", stroke=LINE, rx=16, sw=1))
    body.append(ts(x0, y - 14, "胸聲（TA 多）", size=11.5, color=GREEN))
    body.append(ts(x1, y - 14, "頭聲（CT 多）", size=11.5, anchor="end", color=BLUE))
    body.append(f'  <path d="M{x0 + 250} {y - 6} L{x0 + 250} {y + 38}" fill="none" stroke="{RED}" stroke-width="1.4" stroke-dasharray="4 3"/>')
    body.append(ts(x0 + 250, y + 58, "接縫", size=10.5, anchor="middle", color=RED))
    body.append(ts(x0, y + 100, "混聲要練的是把這道接縫抹平：", size=12))
    body.append(ts(x0, y + 122, "在接縫附近，兩邊各留一點，不要讓任何一邊掉到零。", size=12))
    body.append(ts(26, h - 18, "「混聲」不是第三種聲音，是兩種聲音重疊的比例。", size=11))
    return w, h, "混聲比例尺：從胸聲到頭聲", "接縫不是一條線，是一段要練的區間", "\n".join(body), None


def fig_phrase_breath():
    w, h = 640, 320
    body = []
    x0, x1, base = 90, 560, 170
    body.append(path(f"M{x0} {base} L{x1} {base}", cls="thin"))
    phrases = [(0.05, 0.28), (0.34, 0.58), (0.64, 0.92)]
    for a, b in phrases:
        xa = x0 + (x1 - x0) * a
        xb = x0 + (x1 - x0) * b
        body.append(rect(xa, base - 10, xb - xa, 20, fill=ACCENT, opacity=0.22, rx=10))
        body.append(rect(xa, base - 10, xb - xa, 20, fill="none", stroke=ACCENT, rx=10, sw=1.2))
    for a, b in [(0.28, 0.34), (0.58, 0.64)]:
        xa = x0 + (x1 - x0) * a
        xb = x0 + (x1 - x0) * b
        body.append(path(f"M{xa + 6} {base - 20} L{(xa + xb) / 2} {base - 34} L{xb - 6} {base - 20}",
                         fill="none", stroke=BLUE, sw=1.5))
    body.append(ts(x0, 110, "三個樂句，兩個換氣點：换氣點是設計出來的，不是撐不住才出現。", size=12))
    body.append(ts(26, h - 18, "換氣點要落在句子的縫，不在字的中间。", size=11))
    return w, h, "樂句與換氣點的安排", "先畫句子，再決定在哪裡呼吸", "\n".join(body), None


def fig_practice_loop():
    w, h = 640, 340
    body = []
    cx, cy = 320, 190
    import math
    nodes = [(0, "設定一個目標"), (90, "錄 30 秒"), (180, "聽，只找一個問題"), (270, "改一個動作")]
    pts = []
    for deg, label in nodes:
        a = math.radians(deg - 90)
        x, y = cx + 130 * math.cos(a), cy + 92 * math.sin(a)
        pts.append((x, y, label))
    body.append(f'  <ellipse cx="{cx}" cy="{cy}" rx="130" ry="92" class="dash" fill="none"/>')
    for i, (x, y, label) in enumerate(pts):
        body.append(circle(x, y, 30, fill=PANEL, stroke=ACCENT, sw=1.5))
        body.append(t(x, y + 4, label, size=10.5, anchor="middle", weight=600))
        body.append(badge(x + 24, y - 24, i + 1, ACCENT, 9))
    body.append(ts(26, h - 18, "一輪只改一件事；四輪之後再錄一次完整的，比較前後。", size=11))
    return w, h, "練習循環：設定、錄、聽、改", "沒有錄音的練習，只是在重複你以為的聲音", "\n".join(body), None


def fig_range_test():
    w, h = 640, 340
    body = []
    x0, x1, y = 90, 560, 160
    body.append(path(f"M{x0} {y + 80} L{x1} {y + 80}", cls="thin"))
    rows = [("說話區", 0.0, 0.26, GREEN), ("舒適區", 0.14, 0.6, ACCENT), ("極限區", 0.52, 0.96, RED)]
    for i, (name, a, b, col) in enumerate(rows):
        yy = 90 + i * 40
        body.append(t(78, yy + 4, name, size=11.5, anchor="end"))
        body.append(rect(x0, yy - 9, x1 - x0, 18, fill=PANEL, stroke=LINE, rx=9, sw=1))
        body.append(rect(x0 + (x1 - x0) * a, yy - 9, (x1 - x0) * (b - a), 18, fill=col, opacity=0.35, rx=9))
    body.append(ts(x0, 268, "低音", size=10.5))
    body.append(ts(x1, 268, "高音", size=10.5, anchor="end"))
    body.append(ts(26, h - 18, "舒適區越寬，能唱的歌越多；極限區拿來「碰一下」，不要拿來練整首。", size=11))
    return w, h, "音域測試：說話區、舒適區、極限區", "選歌看舒適區，不看極限音", "\n".join(body), None


def fig_resonance_map_ch():
    w, h = 640, 420
    body = []
    # 聲道示意（側面，簡化為一條彎管 + 三個腔室）
    body.append(path("M150 340 C150 280 150 240 150 200 C150 160 170 140 200 128 C230 116 260 100 268 76",
                     cls="ink", sw=1.8, fill="none"))
    body.append(path("M190 340 C190 286 190 250 190 210 C190 176 206 158 232 146 C258 134 286 118 294 96",
                     cls="ink", sw=1.8, fill="none"))
    # 腔室
    body.append(rect(236, 88, 96, 32, fill=BLUE_SOFT, stroke=BLUE, rx=8, sw=1.2))
    body.append(t(284, 110, "鼻腔", size=11.5, anchor="middle", weight=600))
    body.append(rect(196, 150, 100, 40, fill=ACCENT_SOFT, stroke=ACCENT, rx=8, sw=1.2))
    body.append(t(246, 176, "口腔", size=11.5, anchor="middle", weight=600))
    body.append(rect(160, 210, 70, 60, fill=GREEN_SOFT, stroke=GREEN, rx=8, sw=1.2))
    body.append(t(195, 246, "咽喉", size=11.5, anchor="middle", weight=600))
    body.append(rect(160, 288, 46, 14, fill=ACCENT, rx=7))
    body.append(ts(214, 300, "聲帶", size=11, color=ACCENT))
    body.append(ts(74, 214, "氣流", size=11, anchor="end"))
    body.append(arrow(80, 240, 140, 240, "blue", size=6))
    body.append(ts(360, 110, "鼻腔：決定鼻音與亮度", size=11.5))
    body.append(ts(360, 160, "口腔：母音與咬字的主場", size=11.5))
    body.append(ts(360, 230, "咽喉：低頻與厚度的來源", size=11.5))
    body.append(ts(360, 286, "聲帶：聲源，不是共鳴腔", size=11.5, color=ACCENT))
    body.append(ts(26, h - 18, "共鳴是「形狀」的結果：腔室變大變小，被放大的頻率就跟著變。", size=11))
    return w, h, "聲道側剖面：三個腔室與聲源", "聲音從聲帶出發，經過三個可以改變形狀的空間", "\n".join(body), None


def fig_stage():
    w, h = 640, 360
    body = []
    body.append(rect(70, 90, 500, 220, fill=PANEL, stroke=LINE, rx=10, sw=1.2))
    body.append(t(320, 116, "舞台", size=12, anchor="middle"))
    # 主喇叭
    body.append(rect(70, 70, 500, 12, fill=INK, opacity=0.12, rx=4))
    body.append(ts(320, 62, "主喇叭（面向觀眾）", size=11, anchor="middle"))
    # 監聽
    for x in (200, 320, 440):
        body.append(path(f"M{x} 240 L{x - 22} 200 L{x + 22} 200 Z", fill=ACCENT, opacity=0.3, stroke=ACCENT, sw=1.2))
        body.append(ts(x, 262, "監聽", size=10.5, anchor="middle"))
    body.append(circle(320, 300, 12, fill=BLUE_SOFT, stroke=BLUE, sw=1.2))
    body.append(ts(320, 332, "你", size=11, anchor="middle"))
    body.append(ts(26, h - 18, "監聽喇叭要對著你、不要對著麥克風；主喇叭的声音越大，你越會用力。", size=11))
    return w, h, "舞台監聽與主喇叭", "你聽到的聲音，決定你怎麼用力", "\n".join(body), None


def fig_track_layers():
    w, h = 640, 340
    body = []
    x0, x1 = 130, 580
    tracks = [("主唱", ACCENT, [(0.05, 0.9)]), ("Double", ACCENT_2, [(0.05, 0.9)]),
              ("高和聲", BLUE, [(0.2, 0.55), (0.62, 0.9)]), ("低和聲", GREEN, [(0.2, 0.55), (0.62, 0.9)]),
              ("Ad-lib", RED, [(0.42, 0.5), (0.86, 0.95)])]
    for i, (name, col, segs) in enumerate(tracks):
        y = 100 + i * 44
        body.append(t(x0 - 14, y + 14, name, size=11.5, anchor="end", color=col, weight=600))
        body.append(rect(x0, y, x1 - x0, 26, fill=PANEL, stroke=LINE, rx=4, sw=0.8))
        for a, b in segs:
            body.append(rect(x0 + (x1 - x0) * a, y + 3, (x1 - x0) * (b - a), 20, fill=col, opacity=0.3, rx=3))
    body.append(ts(26, h - 18, "分軌錄音是為了「可以重來」：每一條都獨立，最後才疊在一起。", size=11))
    return w, h, "分段錄音堆疊成一首歌", "主唱、Double、和聲、Ad-lib 各佔一條", "\n".join(body), None


def fig_vibrato():
    w, h = 640, 320
    body = []
    body.append(ts(70, 94, "直音", size=11.5))
    body.append(wave(70, 124, 300, 4, 6, "ink", samples=120))
    body.append(ts(70, 180, "顫音", size=11.5))
    body.append(wave(70, 210, 300, 10, 26, "acc", samples=300))
    body.append(ts(70, 266, "滑音", size=11.5))
    body.append(path("M70 300 C140 300 180 268 240 268 L300 268", cls="blue", sw=1.8))
    body.append(ts(340, 124, "直音：沒有起伏，適合長句的穩定感。", size=11.5))
    body.append(ts(340, 210, "顫音：音高規律上下，速度約每秒 5–7 次。", size=11.5))
    body.append(ts(340, 268, "滑音：一次移動，不來回。", size=11.5))
    body.append(ts(26, h - 18, "顫音不是抖出來的，是「支撐穩定之後自然出現的微小擺動」。", size=11))
    return w, h, "直音、顫音與滑音", "三種線條，三種表情", "\n".join(body), None


def fig_voice_fingerprint():
    w, h = 640, 380
    body = []
    import math
    axes = ["音準", "音域", "音色", "節奏", "咬字", "體力"]
    cx, cy, r = 300, 200, 110
    vals = [0.8, 0.55, 0.7, 0.45, 0.6, 0.5]
    for i in range(6):
        a = math.radians(i * 60 - 90)
        body.append(f'  <path d="M{cx} {cy} L{cx + r * math.cos(a):.1f} {cy + r * math.sin(a):.1f}" class="thin" stroke-dasharray="3 4"/>')
    pts = []
    for i, v in enumerate(vals):
        a = math.radians(i * 60 - 90)
        pts.append((cx + r * v * math.cos(a), cy + r * v * math.sin(a)))
    body.append(f'  <polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{ACCENT}" fill-opacity=".22" stroke="{ACCENT}" stroke-width="2"/>')
    for i, name in enumerate(axes):
        a = math.radians(i * 60 - 90)
        body.append(ts(cx + (r + 26) * math.cos(a), cy + (r + 26) * math.sin(a) + 4, name, size=11.5, anchor="middle"))
    body.append(ts(26, h - 18, "六個軸量的是「你現在的樣子」，不是別人給你的分數；形狀會隨練習改變。", size=11))
    return w, h, "自己的聲音能力分佈", "把抽象的「我唱得怎樣」拆成六個可練的項目", "\n".join(body), None


def fig_dynamics_curve_ch():
    w, h = 640, 360
    body = []
    x0, x1, base = 80, 570, 280
    sections = [("主歌", 0.0, 0.38, 0.25), ("預副歌", 0.38, 0.58, 0.45), ("副歌", 0.58, 0.9, 0.9), ("尾聲", 0.9, 1.0, 0.2)]
    for name, a, b, level in sections:
        xa, xb = x0 + (x1 - x0) * a, x0 + (x1 - x0) * b
        body.append(rect(xa + 2, base + 10, xb - xa - 4, 16, fill=ACCENT, opacity=0.16, rx=4))
        body.append(ts((xa + xb) / 2, base + 46, name, size=11, anchor="middle"))
        # 強度柱
        bh = 150 * level
        body.append(rect(xa + 2, base - bh, xb - xa - 4, bh, fill=ACCENT, opacity=0.10, rx=4))
    body.append(path(f"M{x0} {base} L{x1} {base}", cls="thin"))
    body.append(path(f"M{x0} {base - 34} C160 {base - 60} 210 {base - 66} 260 {base - 84}"
                     f" C320 {base - 108} 380 {base - 128} 440 {base - 146} C480 {base - 156} 520 {base - 158} {x1} {base - 44}",
                     cls="acc", sw=2.2))
    body.append(ts(x0, 96, "縱軸是想給觀眾的感受強度，不是音量。", size=12))
    body.append(ts(x0, base + 76, "副歌要大，靠的是前面願意小；尾聲收得乾淨，靠的是副歌沒有喊到沒氣。", size=11.5))
    return w, h, "主歌到副歌的動態曲線", "先收，才有東西可以放", "\n".join(body), None


def fig_fry_wave_ch():
    w, h = 640, 360
    body = []
    body.append(ts(70, 96, "模態聲：每一次振動長得幾乎一樣", size=12))
    body.append(wave(70, 150, 560, 30, 24, "acc", samples=400))
    body.append(f'  <path d="M70 200 L560 200" fill="none" stroke="{LINE}" stroke-width="1"/>')
    body.append(ts(70, 240, "氣泡音：低頻、不規則、一下一下分得開", size=12))
    xs = [70, 104, 124, 168, 190, 240, 258, 300, 330, 364, 386, 436, 458, 500, 528, 560]
    ys = [276, 250, 278, 248, 278, 250, 276, 248, 278, 250, 276, 248, 278, 250, 276, 252]
    body.append(path("M" + " L".join(f"{x} {y}" for x, y in zip(xs, ys)), cls="blue", sw=2))
    body.append(ts(70, 320, "差別在「每一次振動能不能分開」，不是音量大小。", size=11.5))
    return w, h, "氣泡音與正常振動的波形", "看的是振動的規律性，不是大小聲", "\n".join(body), None


# ── 註冊表 ──────────────────────────────────────────────────────────────
FIGURES = {
    # 章節圖：assets/vocal/
    "vocal/passaggio-ladder": fig_passaggio,
    "vocal/breath-cycle": fig_breath_cycle,
    "vocal/breath-budget": fig_breath_budget,
    "vocal/diaphragm-support": fig_diaphragm_support,
    "vocal/posture-side": fig_posture_side,
    "vocal/articulation": fig_articulation,
    "vocal/folds-open-closed": fig_folds_open_closed,
    "vocal/fold-thickness": fig_fold_thickness,
    "vocal/fold-swelling": fig_fold_swelling,
    "vocal/breath-noise": fig_breath_noise,
    "vocal/onset-types": fig_onset_types,
    "vocal/resonance-blend": fig_resonance_blend,
    "vocal/soft-palate": fig_soft_palate,
    "vocal/formant-filter": fig_formant_filter,
    "vocal/vowel-formants": fig_vowel_formants_ch,
    "vocal/false-folds": fig_false_folds_ch,
    "vocal/groove-grid": fig_groove,
    "vocal/harmony-stack": fig_harmony,
    "vocal/headphone-monitor": fig_headphone,
    "vocal/mic-distance": fig_mic_distance,
    "vocal/mix-blend": fig_mix_blend,
    "vocal/phrase-breath": fig_phrase_breath,
    "vocal/practice-loop": fig_practice_loop,
    "vocal/range-test": fig_range_test,
    "vocal/resonance-map": fig_resonance_map_ch,
    "vocal/stage-monitor": fig_stage,
    "vocal/track-layers": fig_track_layers,
    "vocal/vibrato-wave": fig_vibrato,
    "vocal/voice-fingerprint": fig_voice_fingerprint,
    "vocal/dynamics-curve": fig_dynamics_curve_ch,
    "vocal/fry-wave": fig_fry_wave_ch,

    # 練習圖：assets/vocal/ex/
    "ex/tone-pair": fig_tone_pair,
    "ex/hum": fig_hum,
    "ex/song": fig_song,
    "ex/mix": fig_mix,
    "ex/vowel": fig_vowel,
    "ex/glissando": fig_glissando,
    "ex/lip-trill": fig_lip_trill,
    "ex/record": fig_record,
    "ex/fry": fig_fry,
    "ex/longtone": fig_longtone,
    "ex/fricative": fig_fricative,
    "ex/dynamic": fig_dynamic,
    "ex/break": fig_break,
    "ex/breath-points": fig_breath_points,
    "ex/checklist": fig_checklist,
    "ex/diaphragm": fig_diaphragm,
    "ex/emotion-map": fig_emotion_map,
    "ex/false-folds": fig_false_folds,
    "ex/hand-chest": fig_hand_chest,
    "ex/hydrate": fig_hydrate,
    "ex/jaw": fig_jaw,
    "ex/nasal-check": fig_nasal_check,
    "ex/octave": fig_octave,
    "ex/posture": fig_posture,
    "ex/posture-2": fig_posture_2,
    "ex/range": fig_range,
    "ex/rest": fig_rest,
    "ex/sigh": fig_sigh,
    "ex/soft-onset": fig_soft_onset,
    "ex/steam": fig_steam,
    "ex/steps-3": fig_steps3,
    "ex/timing": fig_timing,
}


def _target(key):
    folder, base = key.split("/", 1)
    return (OUT_EX if folder == "ex" else OUT_DIR) / f"{base}.svg"


def build(names=None):
    written = []
    for key, fn in FIGURES.items():
        base = key.split("/", 1)[1]
        if names and key not in names and base not in names:
            continue
        _TEXTS.clear()
        w, h, title, sub, body, note = fn()
        svg = frame(w, h, title, body, subtitle=sub, note=note)
        for a, b in text_overlaps():
            print(f"  ! {key}: 「{a}」與「{b}」重疊", file=sys.stderr)
        target = _target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(svg, encoding="utf-8")
        written.append(target)
    return written


def sheet(path: Path):
    cards = []
    for name, fn in FIGURES.items():
        w, h, title, sub, body, note = fn()
        svg = frame(w, h, title, body, subtitle=sub, note=note)
        cards.append(
            f'<figure><figcaption>{name}.svg</figcaption>'
            f'<div class="art">{svg}</div></figure>'
        )

    html = f"""<!doctype html><meta charset="utf-8"><title>人聲示意圖對照表</title>
<style>
 body {{ margin:0; padding:32px; background:#EFE9E2; font-family:system-ui,sans-serif; }}
 h1 {{ font-size:18px; margin:0 0 24px; color:#3D3229; }}
 .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:24px; }}
 figure {{ margin:0; background:#fff; border:1px solid #D9CFC4; border-radius:10px; overflow:hidden; }}
 figcaption {{ font:12px/1 ui-monospace,monospace; color:#8C8078; padding:8px 12px; border-bottom:1px solid #eee; }}
 .art svg {{ display:block; width:100%; height:auto; }}
</style>
<h1>人聲示意圖對照表 · {len(FIGURES)} 張</h1>
<div class="grid">{''.join(cards)}</div>"""
    path.write_text(html, encoding="utf-8")


def main(argv):
    names = [a for a in argv if not a.startswith("-")]
    written = build(set(names) or None)
    for p in written:
        print("wrote", p.relative_to(BASE_DIR))
    print(f"{len(written)} figures")
    if "--sheet" in argv:
        target = BASE_DIR / "work" / "vocal-figures.html"
        target.parent.mkdir(exist_ok=True)
        sheet(target)
        print("sheet", target.relative_to(BASE_DIR))


if __name__ == "__main__":
    main(sys.argv[1:])
