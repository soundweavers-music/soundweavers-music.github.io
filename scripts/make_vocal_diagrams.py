#!/usr/bin/env python3
"""Generate the hand-drawn-style SVG diagrams used by the vocal chapters.

These are schematic illustrations, not data plots: the goal is to make a
mechanism visible (where resonance sits, how the folds open, where the passaggio
is). Everything is plain SVG so it ships with the site, scales cleanly, and
needs no external fonts or images.

Writes assets/vocal/*.svg. Run once; chapters reference the files by path.

Usage:  python scripts/make_vocal_diagrams.py
"""
from __future__ import annotations

import math
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT = BASE_DIR / "assets" / "vocal"

INK = "#2b2a26"
MUTED = "#8a8578"
ACCENT = "#b5734a"
ACCENT2 = "#7d9b76"
PAPER = "#fbf8f2"
LINE = "#d8d0c2"

# SVGs are served through <img>, so the page's @font-face does not reach them.
# Fall back through what Windows/macOS ship for Traditional Chinese.
FONT = "font-family: 'Noto Serif TC', 'Songti TC', 'PingFang TC', serif"


def svg(w: int, h: int, body: str, title: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">
  <title>{title}</title>
  <rect width="{w}" height="{h}" fill="{PAPER}"/>
  <style>
    .ink {{ fill: none; stroke: {INK}; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }}
    .thin {{ fill: none; stroke: {MUTED}; stroke-width: 1.4; stroke-dasharray: 5 5; }}
    .grid {{ fill: none; stroke: {LINE}; stroke-width: 1.2; }}
    .fill {{ fill: {ACCENT}; opacity: .18; stroke: {ACCENT}; stroke-width: 1.8; }}
    .fill2 {{ fill: {ACCENT2}; opacity: .18; stroke: {ACCENT2}; stroke-width: 1.8; }}
    .solid {{ fill: {ACCENT}; opacity: .85; }}
    .solid2 {{ fill: {ACCENT2}; opacity: .85; }}
    .lbl {{ {FONT}; font-size: 15px; fill: {INK}; }}
    .lbl-s {{ {FONT}; font-size: 12.5px; fill: {MUTED}; }}
    .lbl-b {{ {FONT}; font-size: 15px; fill: {INK}; font-weight: 700; }}
  </style>
{body}
</svg>
"""


# ── small drawing helpers ──────────────────────────────────────────────
def T(x, y, s, cls="lbl", anchor=None, rot=None):
    a = f' text-anchor="{anchor}"' if anchor else ""
    r = f' transform="rotate({rot} {x} {y})"' if rot is not None else ""
    return f'<text class="{cls}" x="{x}" y="{y}"{a}{r}>{s}</text>'


def L(x1, y1, x2, y2, cls="ink", dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path class="{cls}" d="M{x1} {y1} L{x2} {y2}"{d}/>'


def A(x1, y1, x2, y2, cls="ink"):
    """Arrow from (x1,y1) to (x2,y2)."""
    ang = math.atan2(y2 - y1, x2 - x1)
    h = 11
    p1 = (x2 - h * math.cos(ang - 0.42), y2 - h * math.sin(ang - 0.42))
    p2 = (x2 - h * math.cos(ang + 0.42), y2 - h * math.sin(ang + 0.42))
    return (L(x1, y1, x2, y2, cls)
            + f'<path class="{cls}" d="M{x2} {y2} L{p1[0]:.1f} {p1[1]:.1f} '
              f'L{p2[0]:.1f} {p2[1]:.1f} Z" fill="{INK}"/>')


def R(x, y, w, h, cls="ink", rx=10):
    return f'<rect class="{cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>'


def E(cx, cy, rx, ry, cls="fill", rot=0):
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ""
    return f'<ellipse class="{cls}" cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"{t}/>'


def C(cx, cy, r, cls="fill2"):
    return f'<circle class="{cls}" cx="{cx}" cy="{cy}" r="{r}"/>'


def panel_head(x, y, s):
    return T(x, y, s, "lbl-b")


# ── 1. breathing ──────────────────────────────────────────────────────
def breath_cycle() -> str:
    """Everyday vs singing inhalation: how far the diaphragm drops."""
    b = [T(60, 40, "橫膈膜下降的幅度，決定你吸進多少氣", "lbl-b")]
    for x, head, drop, note in [
        (60, "平常呼吸", 0, "只下降一點，夠活著用"),
        (330, "唱歌吸氣", 42, "下降更多，肋骨同時外擴"),
    ]:
        b.append(panel_head(x, 84, head))
        b.append(R(x, 100, 190, 220, "ink", 16))
        for i in range(3):
            yy = 138 + i * 34
            b.append(f'<path class="ink" d="M{x + 18} {yy} C{x + 76} {yy - 12} '
                     f'{x + 132} {yy - 12} {x + 172} {yy + 6}"/>')
        dy = 268 + drop
        b.append(f'<path class="fill" d="M{x + 16} {dy} C{x + 66} {dy - 44} '
                 f'{x + 126} {dy - 44} {x + 176} {dy} Z"/>')
        b.append(T(x + 96, dy + 20, "橫膈膜", "lbl-s", "middle"))
        b.append(A(x + 150, 196, x + 150, 232 + drop // 2))
        b.append(T(x, 348, note, "lbl-s"))
    b.append(T(60, 384, "唱歌時要的是「低、寬、不僵」：吸氣像聞花香，不是把肩膀抬起來", "lbl-s"))
    return svg(600, 410, "\n  ".join(b), "平常呼吸與唱歌吸氣時，橫膈膜下降幅度的差別")


def posture_side() -> str:
    """Four landmarks — ear, shoulder, hip, ankle — either stacked or splayed."""
    b = [T(40, 40, "站姿對不對，看這四個點有沒有疊在一起", "lbl-b")]
    for x, head, xs, note in [
        (90, "常見的塌", [150, 118, 104, 128], "下巴前伸、肩膀往前掉、骨盆後坐"),
        (380, "對齊的站姿", [150, 148, 148, 150], "四個點大致落在同一條垂直線上"),
    ]:
        b.append(panel_head(x - 30, 84, head))
        b.append(L(150 + (x - 90), 110, 150 + (x - 90), 380, "thin", "4 6"))
        marks = [("耳／下巴", 130), ("肩", 200), ("髖", 300), ("踝", 372)]
        for (name, y), px in zip(marks, [v + (x - 90) for v in xs]):
            b.append(C(px, y, 8, "solid"))
            b.append(T(px + 24, y + 5, name, "lbl-s"))
        b.append(T(x - 30, 420, note, "lbl-s"))
    b.append(T(40, 452, "先讓身體回到中線，共鳴才有空間；下巴一縮，喉嚨就鬆一半", "lbl-s"))
    return svg(620, 480, "\n  ".join(b), "站姿側面：耳朵、肩膀、骨盆與腳踝的位置關係")


def diaphragm_support() -> str:
    """Support = the abdominal wall stays out while the air leaves."""
    b = [T(40, 40, "支撐不是用力縮肚子，是「不讓它塌回去」", "lbl-b")]
    for x, head, bar, note, bulge in [
        (40, "吸氣", "外擴", "腹壁往四個方向撐開", 1),
        (230, "發聲中", "撐住", "氣出去了，腹壁仍然頂著", 1),
        (420, "洩氣", "塌陷", "肚子一縮，氣就整口噴完", -1),
    ]:
        b.append(panel_head(x + 60, 84, head))
        cx = x + 82
        waist = 34 + (10 if bulge > 0 else -12)
        # front-view torso: shoulders → waist → hips
        b.append(f'<path class="ink" d="M{cx - 46} 100 C{cx - 54} 140 {cx - waist - 8} 190 '
                 f'{cx - waist} 246 C{cx - 34} 280 {cx + 34} 280 {cx + waist} 246 '
                 f'C{cx + waist + 8} 190 {cx + 54} 140 {cx + 46} 100 Z"/>')
        b.append(E(cx, 238, waist - 4, 20, "fill"))
        if bar == "外擴":
            b.append(A(cx, 238, cx - 62, 238))
            b.append(A(cx, 238, cx + 62, 238))
            b.append(A(cx, 238, cx, 292))
        elif bar == "撐住":
            b.append(A(cx - 62, 238, cx - 18, 238))
            b.append(A(cx + 62, 238, cx + 18, 238))
            b.append(T(cx, 292, "頂著", "lbl-s", "middle"))
        else:
            b.append(A(cx - 62, 238, cx - 6, 238))
            b.append(A(cx + 62, 238, cx + 6, 238))
            b.append(A(cx, 296, cx, 262))
        b.append(T(cx, 314, bar, "lbl-b", "middle"))
        b.append(T(cx, 334, note, "lbl-s", "middle"))
    return svg(600, 360, "\n  ".join(b), "丹田支撐：吸氣時腹壁外撐，發聲時保持撐住")


def breath_budget() -> str:
    """How one breath should be spent across a long note."""
    b = [T(40, 40, "一口氣分三段用，不要一次噴完", "lbl-b")]
    seg = [(60, 150, "起音 20%", "fill"), (210, 260, "維持 55%", "fill2"), (470, 90, "收尾 25%", "fill")]
    b.append(R(50, 90, 520, 54, "grid", 27))
    for x, w, lab, cls in seg:
        b.append(R(x, 90, w, 54, cls, 27))
        b.append(T(x + w // 2, 122, lab.split(" ")[0], "lbl", "middle"))
        b.append(T(x + w // 2, 164, lab.split(" ")[1], "lbl-s", "middle"))
    # volume curve
    b.append('<path class="ink" d="M60 250 C120 218 150 210 200 210 C300 210 380 216 460 224 '
             'C500 228 520 244 540 268"/>')
    b.append(T(60, 300, "音量", "lbl-s"))
    b.append(T(120, 320, "起音別爆：先出氣再讓聲音接上", "lbl-s"))
    b.append(T(300, 320, "維持段只要「不塌」，不要一路加壓", "lbl-s"))
    b.append(T(60, 356, "練習：同一個音唱 20 秒，第 15 秒還覺得「還有氣」，就代表分配對了", "lbl-s"))
    return svg(600, 390, "\n  ".join(b), "一口氣在長音上的分配：起音、維持、收尾")


def articulation() -> str:
    """Sagittal mouth: where each consonant is made."""
    b = [T(40, 40, "咬字的位置只有那幾個，分別管不同的事", "lbl-b")]
    # upper outline: lips → teeth ridge → hard palate → soft palate
    b.append('<path class="ink" d="M96 196 C92 176 100 166 116 166 L150 166 '
             'C170 166 186 160 210 152 C250 138 306 132 348 138 '
             'C378 142 398 152 412 162"/>')
    # lower outline: lower lip → floor of mouth → back wall
    b.append('<path class="ink" d="M96 196 C96 214 108 224 126 224 L260 232 '
             'C330 234 392 226 420 210"/>')
    # lips
    b.append('<path class="fill" d="M96 196 C86 186 86 206 96 196 Z"/>')
    # upper teeth
    for i in range(4):
        x = 150 + i * 11
        b.append(f'<path class="ink" d="M{x} 166 L{x} 180"/>')
    # lower teeth
    for i in range(4):
        x = 150 + i * 11
        b.append(f'<path class="ink" d="M{x} 222 L{x} 210"/>')
    # tongue
    b.append('<path class="fill2" d="M132 220 C168 206 210 182 262 178 '
             'C312 174 352 186 366 206 C372 216 366 224 352 226 '
             'C290 234 196 232 132 224 Z"/>')
    up = [
        (100, 190, "唇", "p b m"),
        (162, 172, "齒", "f"),
        (200, 158, "齒齦", "t d n l"),
        (280, 136, "硬顎", "j q x"),
        (390, 146, "軟顎", "k g ng"),
    ]
    for x, y, lab, ex in up:
        b.append(L(x, y - 6, x, y - 44, "thin"))
        b.append(T(x, y - 52, lab, "lbl", "middle"))
        b.append(T(x, y - 70, ex, "lbl-s", "middle"))
    down = [(190, 226, "舌尖", "ㄗ ㄘ ㄙ"), (300, 186, "舌面", "ㄧ 類母音")]
    for x, y, lab, ex in down:
        b.append(L(x, y + 10, x, y + 44, "thin"))
        b.append(T(x, y + 62, lab, "lbl", "middle"))
        b.append(T(x, y + 80, ex, "lbl-s", "middle"))
    b.append(T(40, 336, "字咬死，是因為整張嘴都在用力；只有碰到的那一點該動", "lbl-s"))
    return svg(560, 360, "\n  ".join(b), "口腔側面圖：唇、齒、齒齦、硬顎、軟顎與舌頭各部位")


def resonance_blend() -> str:
    """Three resonance chambers as a mix, with two presets."""
    b = [T(40, 40, "共鳴不是開關，是三條比例尺", "lbl-b")]
    rows = [("胸腔", "低頻、厚"), ("口咽腔", "中頻、主體"), ("鼻腔／頭腔", "高頻、亮")]
    presets = {"抒情中低音": [72, 58, 24], "高音副歌": [26, 62, 74]}
    x0, w = 180, 300
    b.append(C(x0, 66, 8, "solid"))
    b.append(T(x0 + 16, 71, "抒情中低音", "lbl-s"))
    b.append(C(x0 + 116, 66, 8, "solid2"))
    b.append(T(x0 + 132, 71, "高音副歌", "lbl-s"))
    for i, (name, note) in enumerate(rows):
        y = 96 + i * 62
        b.append(T(40, y + 6, name, "lbl-b"))
        b.append(T(40, y + 26, note, "lbl-s"))
        b.append(R(x0, y, w, 26, "grid", 13))
        for j, (pname, vals) in enumerate(presets.items()):
            cx = x0 + int(w * vals[i] / 100)
            cls = "solid" if j == 0 else "solid2"
            b.append(C(cx, y + 13, 9, cls))
        b.append(T(x0 + w + 14, y + 18, "少 ←→ 多", "lbl-s"))
    b.append(T(40, 310, "換曲風＝換比例，不是換力氣：想厚一點就讓胸腔參與多一點，想亮就往頭腔移", "lbl-s"))
    return svg(600, 340, "\n  ".join(b), "三種共鳴腔的比例尺：胸腔、口咽腔、鼻腔頭腔")


def dynamics_curve() -> str:
    """Verse → chorus dynamic curve on a 1–8 scale."""
    b = [T(40, 40, "把每段的強度先標好，唱的時候照著走", "lbl-b")]
    # grid
    for i in range(1, 9):
        y = 320 - i * 28
        b.append(L(70, y, 560, y, "grid"))
        b.append(T(52, y + 4, str(i), "lbl-s", "end"))
    secs = [(90, 170, "主歌", 3), (170, 250, "預副歌", 5), (250, 350, "副歌", 8),
            (350, 420, "橋段", 4), (420, 545, "最後副歌", 8)]
    for x1, x2, name, lvl in secs:
        y = 320 - lvl * 28
        b.append(L(x1, 320, x2, y))
        b.append(C(x1, y, 5, "solid"))
        b.append(T((x1 + x2) // 2, 342, name, "lbl-s", "middle"))
    b.append(C(545, 320 - 8 * 28, 5, "solid2"))
    b.append(A(545, 320 - 8 * 28, 552, 320 - 8 * 28 - 10, "thin"))
    b.append(T(556, 320 - 8 * 28 - 18, "留一點", "lbl-s", "end"))
    b.append(T(70, 372, "數字是相對的，重點是「後面一定比前面高」；全程 8 分等於沒有曲線", "lbl-s"))
    return svg(600, 400, "\n  ".join(b), "主歌到副歌的動態曲線：段落與情緒強度")


def range_test() -> str:
    """Three zones of a singer's usable range."""
    b = [T(40, 40, "先找出三個區，再決定這首歌能不能唱", "lbl-b")]
    zones = [(70, 190, "說話區", "平常講話的高度", "fill2"),
             (260, 240, "舒適區", "能控制、能撐長音", "fill"),
             (500, 120, "極限區", "碰得到但不穩", "grid")]
    for x, w, name, note, cls in zones:
        b.append(R(x, 110, w, 70, cls, 14))
        b.append(T(x + w // 2, 144, name, "lbl-b", "middle"))
        b.append(T(x + w // 2, 166, note, "lbl-s", "middle"))
    # note ladder
    for i in range(11):
        x = 70 + i * 50
        b.append(L(x, 210, x, 244, "ink"))
    b.append(T(70, 268, "低", "lbl-s"))
    b.append(T(570, 268, "高", "lbl-s", "end"))
    b.append(A(70, 290, 560, 290, "thin"))
    b.append(T(40, 322, "定 KEY 就是挑一首歌，讓它的最高音落在舒適區上緣——不是剛好踩到極限", "lbl-s"))
    return svg(620, 350, "\n  ".join(b), "音域測試：說話區、舒適區、極限區")


def onset_types() -> str:
    """Three onsets: aspirate, balanced, glottal."""
    b = [T(40, 40, "起音決定前半秒的音色，也決定會不會破", "lbl-b")]

    def panel(x, name, note, air_lead, fold_delay):
        w = 150
        out = [panel_head(x, 84, name)]
        out.append(L(x, 196, x + w, 196, "grid"))       # baseline
        out.append(L(x, 104, x, 212, "grid"))           # onset axis
        # airflow comes up first (upper curve)
        out.append(f'<path class="ink" d="M{x} 160 C{x + 30} 160 {x + 40 + air_lead} 118 '
                   f'{x + 78 + air_lead} 118 C{x + 116 + air_lead} 118 '
                   f'{x + w - 12} 134 {x + w} 146"/>')
        # folds start vibrating later (lower trace)
        sx = x + max(fold_delay, 4)
        out.append(f'<path class="fill" d="M{sx} 196 C{sx + 8} 170 {sx + 16} 222 {sx + 24} 196 '
                   f'C{sx + 32} 170 {sx + 40} 222 {sx + 48} 196 '
                   f'C{sx + 56} 170 {sx + 64} 222 {sx + 72} 196 '
                   f'C{sx + 80} 172 {sx + 96} 192 {x + w - 4} 198"/>')
        out.append(T(x, 236, "上：氣流", "lbl-s"))
        out.append(T(x, 254, "下：聲帶振動", "lbl-s"))
        out.append(T(x, 292, note, "lbl-s"))
        return out

    b += panel(40, "氣聲起音", "先漏一點氣，聲音才接上；柔和但容易虛", 22, 46)
    b += panel(230, "平衡起音", "氣與聲同時到位，最耐用", 0, 6)
    b += panel(420, "硬起音", "先卡住再爆出來；有力但傷聲帶", -26, 0)
    b.append(T(40, 360, "日常練唱請以「平衡起音」為主，氣聲起音留給需要的句子", "lbl-s"))
    return svg(600, 390, "\n  ".join(b), "三種起音：氣聲起音、平衡起音、硬起音")


def closure_grades() -> str:
    """Three degrees of vocal-fold closure, seen from above."""
    b = [T(40, 40, "閉合度不是愈緊愈好，是「剛好不漏」", "lbl-b")]
    for x, name, gap, cls, note in [
        (70, "漏氣", 22, "fill", "中間有縫：氣音多、撐不久"),
        (255, "平衡", 3, "fill2", "剛好靠攏：聲音穩、最省力"),
        (440, "壓迫", -14, "fill", "擠過頭：亮但緊、容易累"),
    ]:
        b.append(panel_head(x, 94, name))
        cx = x + 62
        # two folds as wedges converging toward the front commissure
        left_in = cx - gap // 2
        right_in = cx + gap // 2
        b.append(f'<path class="{cls}" d="M{cx - 78} 110 C{cx - 62} 142 {left_in - 10} 172 '
                 f'{left_in} 208 C{cx - 26} 196 {cx - 62} 176 {cx - 84} 130 Z"/>')
        b.append(f'<path class="{cls}" d="M{cx + 78} 110 C{cx + 62} 142 {right_in + 10} 172 '
                 f'{right_in} 208 C{cx + 26} 196 {cx + 62} 176 {cx + 84} 130 Z"/>')
        b.append(f'<path class="ink" d="M{left_in} 208 C{cx} 194 {right_in} 208"/>')
        b.append(T(cx, 232, "聲門", "lbl-s", "middle"))
        b.append(T(cx, 262, note, "lbl-s", "middle"))
    b.append(T(40, 312, "從上往下看：兩片膜在中線相遇。理想是「靠攏但不夾死」，不是愈用力愈好", "lbl-s"))
    return svg(600, 340, "\n  ".join(b), "聲帶閉合三級：漏氣、平衡、壓迫")


def fold_thickness() -> str:
    """TA shortens and thickens the folds; CT stretches and thins them."""
    b = [T(40, 40, "同一條聲帶，厚薄改變就是音高改變", "lbl-b")]
    for x, name, note, thick in [
        (110, "厚、短 → 低音", "甲杓肌（TA）收縮：變厚變短", 48),
        (370, "薄、長 → 高音", "環甲肌（CT）收縮：拉長拉薄", 9),
    ]:
        b.append(panel_head(x, 92, name))
        # one fold seen from the side: a lens whose height is its thickness
        cy = 168
        b.append(f'<path class="fill2" d="M{x} {cy} C{x + 50} {cy - thick} '
                 f'{x + 120} {cy - thick} {x + 170} {cy} '
                 f'C{x + 120} {cy + thick} {x + 50} {cy + thick} {x} {cy} Z"/>')
        b.append(A(x - 34, cy, x - 66, cy))
        b.append(A(x + 204, cy, x + 236, cy))
        b.append(T(x + 85, cy + thick + 34, note, "lbl-s", "middle"))
    b.append(T(40, 300, "厚的時候面積大、振動慢；拉薄之後張力高、振動快。你不需要「感覺」它，只要知道方向", "lbl-s"))
    return svg(620, 330, "\n  ".join(b), "聲帶厚薄與音高：甲杓肌（TA）與環甲肌（CT）")


def false_folds() -> str:
    """False folds sit above the true folds."""
    b = [T(40, 40, "假聲帶在真的上面，負責關門與保護", "lbl-b")]
    b.append('<path class="ink" d="M90 90 C90 70 400 70 400 90 L400 300 '
             'C400 320 90 320 90 300 Z"/>')
    b.append('<path class="fill" d="M108 132 C180 112 320 112 382 132 '
             'C392 156 392 166 382 178 C320 158 180 158 108 178 Z"/>')
    b.append('<path class="fill2" d="M106 210 C180 192 320 192 384 210 '
             'C394 234 394 244 384 258 C320 240 180 240 106 258 Z"/>')
    b.append(A(130, 296, 130, 260, "thin"))
    b.append(T(140, 292, "氣流由下往上", "lbl-s"))
    b.append(L(392, 155, 424, 155, "thin"))
    b.append(T(432, 138, "假聲帶（室襞）", "lbl"))
    b.append(T(432, 158, "關門保護，", "lbl-s"))
    b.append(T(432, 176, "也能做特殊音色", "lbl-s"))
    b.append(L(392, 234, 424, 234, "thin"))
    b.append(T(432, 218, "真聲帶（聲襞）", "lbl"))
    b.append(T(432, 238, "真正振動發聲的", "lbl-s"))
    b.append(T(432, 256, "地方", "lbl-s"))
    b.append(T(40, 350, "咳嗽、清喉嚨、硬擠高音，都是叫上面的假聲帶出來代班——聲音會啞就是這樣來的", "lbl-s"))
    return svg(700, 380, "\n  ".join(b), "假聲帶（室襞）與真聲帶（聲襞）的上下位置")


def fry_wave() -> str:
    """Vocal fry vs normal vibration waveform."""
    b = [T(40, 40, "氣泡音是「慢慢漏、一下一下」，不是用力壓", "lbl-b")]
    b.append(panel_head(60, 90, "正常振動"))
    for i in range(9):
        x = 70 + i * 55
        b.append(f'<path class="ink" d="M{x} 150 C{x + 12} 100 {x + 30} 100 {x + 42} 150 '
                 f'C{x + 48} 172 {x + 52} 172 {x + 55} 150"/>')
    b.append(panel_head(60, 230, "氣泡音"))
    for i in range(5):
        x = 70 + i * 100
        b.append(f'<path class="ink" d="M{x} 290 C{x + 14} 276 {x + 26} 304 {x + 38} 290 '
                 f'C{x + 50} 278 {x + 60} 300 {x + 70} 292"/>')
        b.append(C(x + 70, 292, 3, "solid"))
    b.append(T(70, 340, "一秒大約 30–70 次，明顯比正常唱歌慢；喉嚨要鬆，不是擠出來的", "lbl-s"))
    return svg(600, 370, "\n  ".join(b), "氣泡音與正常振動的波形差異")


def mix_blend() -> str:
    """A scale from chest voice to head voice with three markers."""
    b = [T(40, 40, "混聲是比例問題：兩邊各出一點，接縫就不見了", "lbl-b")]
    b.append(R(60, 130, 480, 40, "grid", 20))
    b.append(f'<path class="fill2" d="M60 130 L300 130 L300 170 L60 170 Z" rx="20"/>')
    b.append(f'<path class="fill" d="M300 130 L540 130 L540 170 L300 170 Z" rx="20"/>')
    b.append(T(110, 118, "胸聲：厚、實", "lbl-s"))
    b.append(T(430, 118, "頭聲：輕、亮", "lbl-s", "middle"))
    for pos, name, note in [(190, "強混聲", "胸多一點，有力"),
                            (300, "平衡混聲", "兩邊各半，最耐用"),
                            (410, "弱混聲", "頭多一點，輕柔")]:
        b.append(L(pos, 150, pos, 196, "ink"))
        b.append(C(pos, 150, 7, "solid"))
        b.append(T(pos, 214, name, "lbl", "middle"))
        b.append(T(pos, 234, note, "lbl-s", "middle"))
    b.append(T(40, 292, "練的時候不是「選一邊」，是練到能在這條線上自由移動", "lbl-s"))
    return svg(600, 320, "\n  ".join(b), "混聲比例尺：從胸聲到頭聲")


def soft_palate() -> str:
    """Raised vs lowered soft palate changes the path of the sound."""
    b = [T(40, 40, "軟顎是一扇門：開哪邊，聲音就往哪邊去", "lbl-b")]
    for x, head, up, note in [
        (60, "軟顎抬起", True, "聲音走口腔，字清楚"),
        (330, "軟顎放下", False, "聲音漏進鼻腔，變鼻音"),
    ]:
        b.append(panel_head(x, 90, head))
        # palate + mouth
        b.append(f'<path class="ink" d="M{x} 150 C{x + 60} 116 {x + 130} 116 {x + 176} 146"/>')
        sy = 132 if up else 176
        b.append(f'<path class="ink" d="M{x + 176} 146 C{x + 196} 138 {x + 206} {sy - 8} '
                 f'{x + 196} {sy}"/>')
        b.append(E(x + 176, 132, 8, 8, "solid"))
        b.append(f'<path class="ink" d="M{x} 226 C{x + 70} 250 {x + 140} 246 {x + 196} 226"/>')
        # path
        if up:
            b.append(A(x + 96, 220, x + 96, 168))
        else:
            b.append(A(x + 96, 220, x + 150, 158))
            b.append(f'<path class="thin" d="M{x + 150} 150 C{x + 168} 132 {x + 190} 130 {x + 204} 140"/>')
        b.append(T(x, 274, note, "lbl-s"))
    b.append(T(40, 312, "想加鼻音色彩就把軟顎放一點；想要乾淨通透就抬起來", "lbl-s"))
    return svg(620, 340, "\n  ".join(b), "軟顎抬起與放下，聲音分別往口腔或鼻腔走")


def vowel_formants() -> str:
    """Five vowels on the F1–F2 plane."""
    b = [T(40, 40, "同一條聲帶，換母音就是換共振峰的位置", "lbl-b")]
    b.append(L(90, 300, 520, 300, "ink"))
    b.append(L(90, 300, 90, 90, "ink"))
    b.append(T(520, 324, "第一共振峰 F1（Hz）→", "lbl-s", "end"))
    b.append(T(78, 96, "← F2", "lbl-s", "end"))
    pts = [(230, 120, "i", "嘴扁、舌前高"), (170, 170, "e", ""),
           (330, 200, "a", "嘴最開"), (250, 240, "o", ""),
           (200, 272, "u", "嘴圓")]
    for x, y, v, note in pts:
        b.append(C(x, y, 20, "fill"))
        b.append(T(x, y + 6, v, "lbl", "middle"))
        if note:
            b.append(T(x + 30, y + 6, note, "lbl-s"))
    b.append(T(40, 348, "往左上＝舌位高、嘴扁（i）；往右下＝嘴開（a）；往左下＝嘴圓（u）", "lbl-s"))
    return svg(560, 380, "\n  ".join(b), "五個母音在 F1－F2 平面上的大致位置")


def groove_grid() -> str:
    """Notes landing before, on, and after the beat."""
    b = [T(40, 40, "律動就是「不剛好在線上」，但每一拍都一樣偏", "lbl-b")]
    for i in range(9):
        x = 80 + i * 52
        b.append(L(x, 90, x, 250, "grid"))
        b.append(T(x, 274, str(i // 2 + 1) if i % 2 == 0 else "·", "lbl-s", "middle"))
    for name, shift, note, y in [("搶拍", -16, "早一點進去，推力強", 120),
                                 ("正拍", 0, "穩、但容易死板", 170),
                                 ("拖拍", 18, "晚一點出來，鬆、有味道", 220)]:
        cx = 288 + shift
        b.append(E(cx, y, 16, 10, "solid"))
        b.append(T(70, y + 5, name, "lbl-s", "end"))
        b.append(T(cx - 42, y + 5, note, "lbl-s", "end"))
    b.append(T(40, 320, "重點是同一個偏移量從頭到尾——忽快忽慢叫不穩，穩定偏一點才叫律動", "lbl-s"))
    return svg(620, 350, "\n  ".join(b), "拍點前後的微小時差：搶拍、正拍、拖拍")


def vibrato_wave() -> str:
    """Straight tone, vibrato, and slide."""
    b = [T(40, 40, "三種裝飾音，三種波形", "lbl-b")]
    rows = [("直音", 0, "中心音高不動，只有音色變化", 100),
            ("顫音", 1, "在中心音高上下規律來回", 180),
            ("滑音", 2, "單方向移動，不是來回", 260)]
    for name, kind, note, y in rows:
        b.append(T(50, y - 24, name, "lbl-b"))
        b.append(T(50, y - 12, note, "lbl-s"))
        if kind == 0:
            d = f"M100 {y} L520 {y}"
        elif kind == 1:
            d = f"M100 {y}"
            for i in range(14):
                x = 100 + i * 30
                d += f" Q{x + 15} {y - 14 if i % 2 == 0 else y + 14} {x + 30} {y}"
        else:
            d = f"M100 {y + 26} C180 {y + 26} 260 {y - 26} 340 {y - 26} C420 {y - 26} 470 {y - 6} 520 {y}"
        b.append(f'<path class="ink" d="{d}"/>')
        b.append(L(100, y, 520, y, "thin", "3 6"))
    b.append(T(40, 322, "顫音先求「規律」再求「深」；不規律的抖動聽起來是緊張，不是感情", "lbl-s"))
    return svg(600, 350, "\n  ".join(b), "直音、顫音與滑音的波形")


def fold_swelling() -> str:
    """Normal folds vs swollen folds, side view."""
    b = [T(40, 40, "沙啞常常不是唱壞，是聲帶腫了、關不緊", "lbl-b")]
    for x, head, sw, note in [
        (90, "正常", 0, "邊緣清楚、有稜角，能靠攏"),
        (360, "水腫", 14, "變圓變厚，中間合不起來"),
    ]:
        b.append(panel_head(x, 92, head))
        cy = 172
        if sw == 0:
            d = (f"M{x} {cy - 8} C{x + 60} {cy - 30} {x + 130} {cy - 30} {x + 176} {cy - 2} "
                 f"C{x + 130} {cy + 30} {x + 60} {cy + 30} {x} {cy + 8} Z")
        else:
            d = (f"M{x} {cy - 26} C{x + 56} {cy - 54} {x + 132} {cy - 50} {x + 176} {cy - 12} "
                 f"C{x + 150} {cy + 4} {x + 140} {cy + 6} {x + 132} {cy + 2} "
                 f"C{x + 122} {cy + 34} {x + 54} {cy + 38} {x} {cy + 12} Z")
        b.append(f'<path class="fill2" d="{d}"/>')
        if sw:
            b.append(T(x + 186, cy - 40, "鼓起來", "lbl-s"))
        b.append(T(x, cy + 78, note, "lbl-s"))
    b.append(T(40, 300, "水腫時硬唱，大腦會叫假聲帶代班補縫隙——那才是真正傷聲帶的一步", "lbl-s"))
    b.append(T(40, 328, "處理方式只有休息、補水、少說話；隔天再唱，不要當天硬練", "lbl-s"))
    return svg(600, 360, "\n  ".join(b), "正常聲帶與水腫聲帶的比較")


def breath_noise() -> str:
    """Harmonics plus broadband noise = breathy colour."""
    b = [T(40, 40, "氣聲不是玄學：是「噪音」在諧波上面加了一層", "lbl-b")]
    b.append(L(70, 260, 540, 260, "ink"))
    b.append(L(70, 260, 70, 80, "ink"))
    for i in range(1, 9):
        x = 80 + i * 48
        h = 120 - i * 9
        b.append(R(x, 260 - h, 14, h, "fill2", 3))
    b.append(f'<path class="fill" d="M75 250 C120 240 180 246 240 238 C300 250 360 242 420 248 '
             f'C470 242 510 250 540 246 L540 260 L75 260 Z"/>')
    b.append(T(300, 92, "諧波（音高）", "lbl-s"))
    b.append(T(300, 150, "↑ 這一整片是氣聲的噪音", "lbl-s"))
    b.append(T(70, 300, "哭腔、嘆氣、呢喃，都是靠「氣聲比例」在做事，不是靠音量", "lbl-s"))
    return svg(600, 330, "\n  ".join(b), "氣聲成分：諧波加上寬頻噪音")


def phrase_breath() -> str:
    """Bars, lyric chunks, and where the breath goes."""
    b = [T(40, 40, "換氣點要跟著句子走，不是跟著肺走", "lbl-b")]
    lines = ["第一句歌詞到這裡", "第二句歌詞再長一點點", "第三句"]
    y = 100
    for i, line in enumerate(lines):
        b.append(R(70, y - 22, 470, 34, "grid", 8))
        b.append(T(84, y + 2, line, "lbl"))
        bx = 70 + 40 + len(line) * 15
        b.append(L(bx, y - 30, bx, y + 30, "ink"))
        b.append(T(bx + 8, y - 34, "換氣", "lbl-s"))
        b.append(A(bx + 34, y - 40, bx + 74, y - 40))
        y += 76
    b.append(T(40, 320, "同一口氣裡塞兩個句子，聽起來會趕；多換一次氣，情緒反而更滿", "lbl-s"))
    return svg(600, 350, "\n  ".join(b), "樂句與換氣點的安排")


def headphone_monitor() -> str:
    """What you hear in headphones vs through bone conduction."""
    b = [T(40, 40, "戴耳機時，你聽到的是兩個版本的自己", "lbl-b")]
    b.append(C(300, 170, 66, "fill2"))
    b.append(f'<path class="ink" d="M234 150 C210 130 206 190 232 200"/>')
    b.append(f'<path class="ink" d="M366 150 C390 130 394 190 368 200"/>')
    b.append(T(300, 176, "你", "lbl", "middle"))
    b.append(f'<path class="fill" d="M226 150 C206 132 196 168 212 186 Z"/>')
    b.append(f'<path class="fill" d="M374 150 C394 132 404 168 388 186 Z"/>')
    b.append(A(214, 138, 262, 106, "ink"))
    b.append(T(118, 90, "耳機送來的聲音", "lbl"))
    b.append(T(118, 110, "別人聽到的版本（含殘響）", "lbl-s"))
    b.append(A(386, 200, 470, 240, "ink"))
    b.append(T(430, 262, "骨傳導", "lbl"))
    b.append(T(400, 282, "自己聽到的版本（低頻多）", "lbl-s"))
    b.append(T(40, 330, "錄音時以麥克風收到的為準；覺得自己聲音「很薄」是正常的，那是少了骨傳導", "lbl-s"))
    return svg(620, 360, "\n  ".join(b), "耳機監聽與骨傳導兩條路徑")


def track_layers() -> str:
    """Multiple takes stacked into one vocal."""
    b = [T(40, 40, "分軌錄音就是「一次只做一件事」", "lbl-b")]
    tracks = [("主唱", 0, "fill"), ("主唱（第二次）", 1, "fill2"),
              ("低三度和聲", 2, "fill"), ("高八度和聲", 3, "fill2"),
              ("氣音層", 4, "grid")]
    for i, (name, idx, cls) in enumerate(tracks):
        y = 90 + i * 50
        b.append(T(50, y + 18, name, "lbl-s"))
        for j in range(6):
            x = 200 + j * 58
            b.append(R(x, y, 52, 30, cls, 6))
    b.append(T(40, 360, "每一軌只修一個問題：這軌收音準、那軌咬字、另一軌情緒——合起來才會像一個人", "lbl-s"))
    return svg(620, 390, "\n  ".join(b), "分段錄音堆疊成一首歌的分軌")


def harmony_stack() -> str:
    """Harmony intervals stacked over the lead."""
    b = [T(40, 40, "和聲不是愈多愈好，是三度最安全", "lbl-b")]
    rows = [("高八度", 8, "fill2"), ("高五度", 5, "grid"),
            ("高三度", 3, "fill"), ("主唱", 0, "fill2"), ("低三度", -3, "fill")]
    base = 260
    for i, (name, semi, cls) in enumerate(rows):
        y = 90 + i * 46
        b.append(T(50, y + 18, name, "lbl-s"))
        b.append(R(200, y, 300, 30, "fill2" if cls == "grid" else cls, 6))
        b.append(T(510, y + 20, f"{semi:+d} 半音" if semi else "基準", "lbl-s"))
    b.append(T(40, 340, "先錄好主唱，再一條一條疊；兩條和聲已經夠厚，四條開始糊", "lbl-s"))
    return svg(620, 370, "\n  ".join(b), "主唱與和聲的堆疊關係")


def stage_monitor() -> str:
    """Floor monitor vs main PA on a small stage."""
    b = [T(40, 40, "台上聽不到自己，通常是路徑問題，不是音量問題", "lbl-b")]
    # stage floor
    b.append(L(50, 300, 580, 300, "ink"))
    b.append(L(50, 300, 50, 318, "ink"))
    b.append(T(500, 316, "舞台地板", "lbl-s"))
    # singer
    b.append(C(250, 210, 26, "fill2"))
    b.append(T(250, 216, "你", "lbl", "middle"))
    b.append(L(250, 236, 250, 300, "ink"))
    # wedge monitor on the floor, tilted up at the singer
    b.append('<path class="fill" d="M170 292 L206 292 L200 258 L176 258 Z"/>')
    b.append(A(190, 262, 226, 232, "ink"))
    b.append(T(96, 244, "地板監聽", "lbl-s"))
    b.append(T(96, 262, "指向你的臉", "lbl-s"))
    # main PA up on the side
    b.append(R(500, 96, 30, 54, "fill", 6))
    b.append(T(486, 88, "主喇叭", "lbl-s", "middle"))
    b.append(f'<path class="thin" d="M500 150 C440 190 360 190 296 200"/>')
    b.append(T(360, 178, "延遲、殘響一起進來", "lbl-s"))
    # what the singer hears
    b.append(A(196, 256, 232, 226, "ink"))
    b.append(T(402, 250, "聽得到自己的聲音", "lbl-s"))
    b.append(T(40, 356, "要求監聽送回「你的聲音＋拍點」，不要整團都塞進去；聽得到的東西愈少，音準愈穩", "lbl-s"))
    return svg(620, 380, "\n  ".join(b), "舞台監聽喇叭與主喇叭")


def practice_loop() -> str:
    """The five-step practice loop for a plateau."""
    b = [T(40, 40, "卡住的時候，不要練更多，先練得更小", "lbl-b")]
    steps = [("錄一段", 300, 92), ("聽出來", 470, 190), ("只挑一個問題", 470, 300),
             ("改一個動作", 300, 398), ("再錄", 130, 300), ("比對", 130, 190)]
    for i, (name, cx, cy) in enumerate(steps):
        b.append(C(cx, cy, 46, "fill2" if i % 2 == 0 else "fill"))
        b.append(T(cx, cy + 5, name, "lbl", "middle"))
    seq = [(346, 118), (420, 158), (474, 244), (474, 344), (420, 388),
           (346, 400), (140, 350), (96, 300), (96, 220), (150, 140)]
    for x, y in seq:
        b.append(C(x, y, 3, "solid"))
    b.append(T(40, 460, "一次只改一個動作，改完立刻再錄一次比對——這才是「有效練習」", "lbl-s"))
    return svg(620, 490, "\n  ".join(b), "練習循環：錄、聽、找出一個問題、再錄")


def voice_fingerprint() -> str:
    """A radar of the singer's own traits."""
    b = [T(40, 40, "聲音品牌＝你在這六件事上的比例", "lbl-b")]
    cx, cy, rad = 300, 250, 150
    axes = [("音域", -90), ("氣息", -30), ("共鳴", 30), ("咬字", 90), ("律動", 150), ("情感", 210)]
    for i in range(3):
        r = rad * (i + 1) / 3
        pts = []
        for _, ang in axes:
            a = math.radians(ang)
            pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
        b.append(f'<path class="grid" d="M{" L".join(pts)} Z"/>')
    b.append(f'<path class="ink" d="M{cx} {cy - rad} L{cx} {cy + rad}"/>')
    b.append(f'<path class="ink" d="M{cx - rad * 0.87:.1f} {cy - rad / 2:.1f} '
             f'L{cx + rad * 0.87:.1f} {cy + rad / 2:.1f}"/>')
    b.append(f'<path class="ink" d="M{cx - rad * 0.87:.1f} {cy + rad / 2:.1f} '
             f'L{cx + rad * 0.87:.1f} {cy - rad / 2:.1f}"/>')
    vals = [0.78, 0.62, 0.9, 0.55, 0.7, 0.85]
    pts = []
    for (name, ang), v in zip(axes, vals):
        a = math.radians(ang)
        x, y = cx + rad * v * math.cos(a), cy + rad * v * math.sin(a)
        pts.append(f"{x:.1f},{y:.1f}")
        lx, ly = cx + (rad + 34) * math.cos(a), cy + (rad + 34) * math.sin(a)
        b.append(T(lx, ly + 5, name, "lbl", "middle"))
    b.append(f'<path class="fill" d="M{" L".join(pts)} Z"/>')
    b.append(T(40, 450, "長處留著、短處補到及格就好；全部拉滿就變成別人，不是你的聲音", "lbl-s"))
    return svg(620, 480, "\n  ".join(b), "自己的聲音能力分佈")


# ── original five ─────────────────────────────────────────────────────
def resonance_map() -> str:
    """Side profile (facing left) with the three resonance spaces marked."""
    body = f"""
  <!-- head: cranium, face, neck -->
  <path class="ink" d="M120 300 C112 250 116 200 140 162 C164 124 212 100 262 102
                        C316 104 356 140 362 190 C366 222 352 236 346 250
                        C364 262 386 274 404 296 C414 309 410 322 398 326
                        C384 331 366 330 350 323 C342 337 336 351 340 366
                        C344 384 352 400 350 418"/>
  <path class="ink" d="M120 300 C110 340 106 400 112 452 C116 482 128 502 150 512"/>
  <path class="ink" d="M350 418 C338 452 332 492 340 528"/>

  <!-- ear hint -->
  <path class="ink" d="M300 214 C322 206 340 218 342 238 C344 258 328 270 310 266"/>

  <!-- 1 chest -->
  <ellipse class="fill" cx="186" cy="474" rx="62" ry="34" transform="rotate(-8 186 474)"/>
  <text class="lbl" x="196" y="540">胸腔</text>
  <text class="lbl-s" x="196" y="558">低頻、厚實</text>

  <!-- 2 pharynx -->
  <ellipse class="fill2" cx="352" cy="330" rx="26" ry="40" transform="rotate(14 352 330)"/>
  <text class="lbl" x="408" y="326">咽喉腔</text>
  <text class="lbl-s" x="408" y="344">中頻、穿透</text>

  <!-- 3 nasal / head -->
  <ellipse class="fill" cx="318" cy="236" rx="38" ry="20" transform="rotate(-18 318 236)"/>
  <text class="lbl" x="404" y="240">鼻腔／頭腔</text>
  <text class="lbl-s" x="404" y="258">高頻、明亮</text>

  <!-- airflow -->
  <path class="thin" d="M192 460 C230 420 288 392 336 366 C352 332 340 300 330 274"/>
  <path class="ink" d="M334 282 l-10 6 l12 8z" fill="{INK}"/>
  <text class="lbl-s" x="150" y="404">氣流與聲波往上走</text>
"""
    return svg(560, 570, body, "人體三大共鳴腔示意圖：胸腔、咽喉腔、鼻腔與頭腔")


def folds_open_closed() -> str:
    """Two panels: vocal folds open (breathing) and closed (voicing)."""
    body = """
  <text class="lbl" x="70" y="46">吸氣時：聲帶張開</text>
  <text class="lbl" x="360" y="46">發聲時：聲帶靠攏</text>

  <!-- trachea tubes -->
  <path class="ink" d="M96 250 C96 190 96 140 96 90"/>
  <path class="ink" d="M214 250 C214 190 214 140 214 90"/>
  <path class="ink" d="M386 250 C386 190 386 140 386 90"/>
  <path class="ink" d="M504 250 C504 190 504 140 504 90"/>

  <!-- open folds: a wide V gap -->
  <path class="fill" d="M96 110 C130 128 146 152 155 186 C160 205 158 226 150 244
                        L96 244 Z"/>
  <path class="fill" d="M214 110 C180 128 164 152 155 186 C150 205 152 226 160 244
                        L214 244 Z"/>
  <path class="ink" d="M155 186 L155 250"/>

  <!-- closed folds: meet at the midline -->
  <path class="fill2" d="M386 108 C402 130 412 158 412 186 C412 214 402 238 388 252
                         L386 252 Z"/>
  <path class="fill2" d="M504 108 C488 130 478 158 478 186 C478 214 488 238 502 252
                         L504 252 Z"/>
  <path class="ink" d="M412 190 L478 190" stroke-dasharray="0"/>
  <path class="ink" d="M445 120 L445 168" stroke-dasharray="0"/>

  <text class="lbl-s" x="120" y="290">中間有空隙，空氣通過</text>
  <text class="lbl-s" x="372" y="290">靠攏閉合，氣流讓它們振動</text>

  <path class="thin" d="M70 320 L530 320"/>
  <text class="lbl-s" x="70" y="345">正面看聲帶（從上往下看喉部）</text>
"""
    return svg(600, 380, body, "聲帶開合示意圖：吸氣時張開，發聲時靠攏")


def passaggio_ladder() -> str:
    """Pitch ladder showing where chest → mix → head switch happens."""
    rows = []
    labels = ["低音區", "換聲區", "高音區"]
    subs = ["胸聲為主", "混聲：兩種肌肉一起出力", "頭聲為主"]
    tops = ["甲杓肌（TA）主導", "交接區，最容易破音", "環甲肌（CT）主導"]
    for i, (lab, sub, top) in enumerate(zip(labels, subs, tops)):
        y = 90 + i * 96
        cls = "fill" if i == 1 else "fill2"
        rows.append(f'<rect class="{cls}" x="70" y="{y}" width="420" height="72" rx="10"/>')
        rows.append(f'<text class="lbl" x="92" y="{y + 30}">{lab}</text>')
        rows.append(f'<text class="lbl-s" x="92" y="{y + 52}">{sub}</text>')
        rows.append(f'<text class="lbl-s" x="470" y="{y + 40}">{top}</text>')
    body = "\n  ".join(rows) + f"""
  <path class="ink" d="M40 340 L40 74"/>
  <path class="ink" d="M40 74 l-8 16 l16 0 z" fill="{INK}"/>
  <text class="lbl-s" x="18" y="210" transform="rotate(-90 18 210)">音高往上</text>
"""
    return svg(700, 400, body, "音域三段與換聲區示意圖")


def mic_distance() -> str:
    """Three mic positions with the acoustic result of each."""
    body = ""
    configs = [
        ("太近", "噴麥、低音過重", 40),
        ("剛好", "聲音清楚、低音自然", 120),
        ("太遠", "空、容易收到房間反射", 250),
    ]
    for i, (head, note, gap) in enumerate(configs):
        y = 80 + i * 110
        body += f'<text class="lbl" x="30" y="{y}">{head}</text>\n'
        body += f'<circle class="fill2" cx="120" cy="{y + 20}" r="22"/>\n'
        mx = 120 + gap
        body += f'<rect class="fill" x="{mx}" y="{y + 4}" width="16" height="32" rx="8"/>\n'
        body += f'<path class="thin" d="M142 {y + 20} L{mx - 4} {y + 20}"/>\n'
        body += f'<text class="lbl-s" x="{mx + 28}" y="{y + 24}">{note}</text>\n'
    body += '<text class="lbl-s" x="30" y="420">距離是相對的：小聲時靠近，大聲時退開，讓麥克風幫你做動態</text>'
    return svg(560, 450, body, "麥克風距離與音色變化示意圖")


def formant_filter() -> str:
    """Source-filter: harmonics in, a filter shape, formants out."""
    body = """
  <text class="lbl" x="40" y="40">聲帶產生：一組整數倍頻率</text>
  <text class="lbl" x="300" y="40">聲道像濾網，放大某些頻率</text>
"""
    for i in range(1, 9):
        x = 50 + i * 26
        h = 90 - i * 6
        body += f'<rect class="fill2" x="{x}" y="{150 - h}" width="12" height="{h}" rx="2"/>\n'
    body += '<path class="ink" d="M300 150 C330 150 345 70 372 52 C400 36 420 96 450 140 C480 168 510 168 540 168"/>\n'
    for i in range(1, 8):
        x = 305 + i * 28
        base = 90 - i * 5
        boost = 40 if i in (2, 4) else 0
        h = base + boost
        body += f'<rect class="fill" x="{x}" y="{260 - h}" width="12" height="{h}" rx="2"/>\n'
    body += '<text class="lbl-s" x="300" y="300">峰的位置就是共振峰（F1、F2…）</text>\n'
    body += '<text class="lbl-s" x="40" y="200">頻率 →</text>\n'
    return svg(600, 330, body, "線性聲源－濾波器示意圖：諧波經過聲道濾波形成共振峰")


DIAGRAMS = {
    # breathing / support / posture
    "breath-cycle.svg": breath_cycle,
    "posture-side.svg": posture_side,
    "diaphragm-support.svg": diaphragm_support,
    "breath-budget.svg": breath_budget,
    # articulation
    "articulation.svg": articulation,
    # resonance
    "resonance-map.svg": resonance_map,
    "resonance-blend.svg": resonance_blend,
    "formant-filter.svg": formant_filter,
    "soft-palate.svg": soft_palate,
    "vowel-formants.svg": vowel_formants,
    # folds
    "folds-open-closed.svg": folds_open_closed,
    "closure-grades.svg": closure_grades,
    "fold-thickness.svg": fold_thickness,
    "false-folds.svg": false_folds,
    "fry-wave.svg": fry_wave,
    "fold-swelling.svg": fold_swelling,
    "onset-types.svg": onset_types,
    # range / mix
    "passaggio-ladder.svg": passaggio_ladder,
    "mix-blend.svg": mix_blend,
    "range-test.svg": range_test,
    # musicality
    "dynamics-curve.svg": dynamics_curve,
    "groove-grid.svg": groove_grid,
    "vibrato-wave.svg": vibrato_wave,
    "breath-noise.svg": breath_noise,
    "phrase-breath.svg": phrase_breath,
    # studio / stage
    "mic-distance.svg": mic_distance,
    "headphone-monitor.svg": headphone_monitor,
    "track-layers.svg": track_layers,
    "harmony-stack.svg": harmony_stack,
    "stage-monitor.svg": stage_monitor,
    # meta
    "practice-loop.svg": practice_loop,
    "voice-fingerprint.svg": voice_fingerprint,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in DIAGRAMS.items():
        (OUT / name).write_text(fn(), encoding="utf-8")
        print(f"  {name}")
    print(f"{len(DIAGRAMS)} diagrams written to {OUT.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
