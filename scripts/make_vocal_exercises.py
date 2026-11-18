#!/usr/bin/env python3
"""Exercise figures for the vocal course (one per 練習 section).

These are instruction cards, not anatomy plates: the chapter figure explains the
mechanism, the exercise figure shows what your body does, in what order, and how
to tell whether you got it. Same palette and typography as vocal_anatomy so the
two sets sit on the page together.

Writes assets/vocal/ex/*.svg.

Usage:  python scripts/make_vocal_exercises.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
import vocal_anatomy as V  # noqa: E402

OUT = BASE.parent / "assets" / "vocal" / "ex"

W, H = 540, 300


def card(title, body, note) -> str:
    return V.wrap(W, H, "\n  ".join([
        V.T(26, 30, title, "lbl-b"),
        body,
        V.T(26, H - 16, note, "lbl-s"),
    ]), title)


# ── primitives ────────────────────────────────────────────────────────
def head(cx=110, cy=120, r=34, tilt=0):
    """Simple head + neck glyph (side view) for posture/airflow cards."""
    return (f'<circle class="skin" cx="{cx}" cy="{cy}" r="{r}"/>'
            f'<path class="ink" d="M{cx - 12} {cy + r - 4} C{cx - 10} {cy + r + 26} '
            f'{cx + 6} {cy + r + 40} {cx + 4} {cy + r + 60}"/>'
            f'<path class="ink" d="M{cx + 14} {cy + r - 2} C{cx + 18} {cy + r + 30} '
            f'{cx + 10} {cy + r + 46} {cx + 8} {cy + r + 60}"/>')


def torso(cx=110, cy=170, w=52, h=110):
    return (f'<path class="skin" d="M{cx} {cy - h / 2} C{cx - w} {cy - h / 2 + 10} '
            f'{cx - w - 6} {cy} {cx - w} {cy + h / 2} L{cx + w} {cy + h / 2} '
            f'C{cx + w + 6} {cy} {cx + w} {cy - h / 2 + 10} {cx} {cy - h / 2} Z"/>')


def badge(x, y, n, r=13):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{V.ACCENT}" fill-opacity=".9"/>'
            f'{V.T(x, y + 5, str(n), "lbl", "middle")}')


def pitch_line(x0, y0, pts, cls="ave"):
    d = f"M{x0} {y0}"
    for dx, dy in pts:
        d += f" L{x0 + dx} {y0 + dy}"
    return f'<path class="{cls}" d="{d}"/>'


def dotline(x0, y0, n, gap=26, cls="AVE"):
    out = []
    for i in range(n):
        out.append(f'<circle cx="{x0 + i * gap}" cy="{y0}" r="4.5" fill="{V.ACCENT if cls == "AVE" else V.ACCENT2}"/>')
    return "\n  ".join(out)


def arrow_between(x1, y1, x2, y2, cls="ave"):
    return V.arrow(x1, y1, x2, y2, cls)


def ticks(x0, y0, n, gap=24, h=18):
    return "\n  ".join(f'<path class="ink" d="M{x0 + i * gap} {y0} L{x0 + i * gap} {y0 - h}"/>'
                       for i in range(n))


# ── exercise cards ────────────────────────────────────────────────────
def ex_posture(title, note="肩膀放下、下巴微收，讓耳—肩—髖大致一線"):
    b = [head(120, 110), torso(120, 215)]
    b.append(V.arrow(200, 108, 260, 108))
    b.append(V.T(268, 112, "肩膀往後、往下", "lbl-s"))
    b.append(V.arrow(120, 60, 120, 92))
    b.append(V.T(134, 60, "頭頂往天花板", "lbl-s"))
    b.append(f'<path class="thin" d="M120 60 L120 270"/>')
    b.append(badge(350, 200, 1))
    b.append(V.T(370, 204, "先做 3 次深呼吸", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_diaphragm(title, note="躺著時手放肋骨下緣，吸氣時手被推起來"):
    b = [torso(110, 190, 62, 130)]
    b.append(f'<path class="hl" d="M60 232 C86 200 134 200 160 232 C134 248 86 248 60 232 Z"/>')
    b.append(V.arrow(110, 260, 110, 216))
    b.append(V.T(124, 266, "吸氣：橫膈膜下降、腹壁外擴", "lbl-s"))
    b.append(V.T(210, 100, "手放在這裡", "lbl-s"))
    b.append(V.leader(150, 226, 210, 104))
    b.append(badge(360, 180, 2))
    b.append(V.T(380, 184, "手要感覺到", "lbl-s"))
    b.append(V.T(380, 202, "「被推開」不是「縮起來」", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_sigh(title, note="嘆氣是放鬆的發聲：先出氣，聲音自然跟著出來"):
    b = [head(110, 110)]
    b.append(f'<path class="thin" d="M70 150 C40 120 40 90 66 74"/>')
    b.append(V.arrow(110, 200, 240, 200))
    b.append(V.T(250, 204, "氣先出去", "lbl-s"))
    b.append(f'<path class="ave" d="M300 200 C316 186 326 214 342 200 C358 186 368 214 384 200"/>')
    b.append(V.T(300, 232, "聲音隨後接上", "lbl-s"))
    b.append(badge(350, 120, 1))
    b.append(V.T(370, 124, "「哈——」", "lbl"))
    return card(title, "\n  ".join(b), note)


def ex_longtone(title, note="同一個音撐住，聽的是「穩」不是「大」"):
    b = [V.L(40, 150, 420, 150) if hasattr(V, "L") else '<path class="ink" d="M40 150 L420 150"/>']
    b.append(f'<path class="ave" d="M60 150 L60 150"/>')
    b.append(dotline(80, 150, 10, 34))
    b.append(V.T(60, 120, "同一個音，20 秒", "lbl-s"))
    b.append(f'<path class="thin" d="M60 176 L400 176"/>')
    for i, lab in enumerate(["0", "5", "10", "15", "20 秒"]):
        x = 60 + i * 85
        b.append(f'<path class="ink" d="M{x} 176 L{x} 186"/>')
        b.append(V.T(x, 204, lab, "lbl-s", "middle"))
    b.append(V.T(60, 246, "第 15 秒還覺得「還有氣」，就代表分配對了", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_jaw(title, note="下巴是吊著的，不是夾住的；讓它自己掉下來"):
    b = [head(120, 120, 38)]
    b.append(V.arrow(120, 190, 120, 236))
    b.append(V.T(136, 214, "下顎往下、往後", "lbl-s"))
    b.append(f'<path class="thin" d="M120 100 L120 250"/>')
    b.append(badge(340, 150, 1))
    b.append(V.T(360, 154, "嘴巴微開", "lbl-s"))
    b.append(badge(340, 210, 2))
    b.append(V.T(360, 214, "舌頭平放", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_fricative(title, note="氣要細、要長、要穩；喉嚨全程不出力"):
    b = [head(110, 120, 34)]
    b.append(f'<path class="ave" d="M150 130 L200 122 L250 132 L300 122 L350 132"/>')
    b.append(V.T(200, 104, "嘶——（持續、均勻）", "lbl-s"))
    b.append(ticks(160, 220, 8, 26))
    b.append(V.T(160, 246, "一次撐 15–20 秒", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_lip_trill(title, note="嘴唇放鬆，用氣把它吹到震動——不是用喉嚨擠"):
    b = [head(110, 120, 34)]
    b.append(f'<path class="muc" d="M76 132 C92 122 108 122 122 132 C108 142 92 142 76 132 Z"/>')
    b.append(V.arrow(130, 132, 180, 132))
    b.append(f'<path class="ave" d="M200 132 C212 118 224 146 236 132 C248 118 260 146 272 132 '
             f'C284 118 296 146 308 132"/>')
    b.append(V.T(200, 108, "嘴唇在震", "lbl-s"))
    b.append(V.T(200, 168, "手摸喉嚨：不該有擠壓感", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_hum(title, note="哼鳴是「有聲的閉嘴」，用來找振動位置"):
    b = [head(110, 120, 34)]
    b.append(f'<path class="hl" d="M120 104 C140 96 154 106 152 122 C150 136 134 142 122 136 Z"/>')
    b.append(V.T(170, 108, "鼻樑附近在震", "lbl-s"))
    b.append(V.leader(136, 118, 170, 112))
    b.append(badge(340, 170, 1))
    b.append(V.T(360, 174, "閉嘴發「嗯」", "lbl-s"))
    b.append(badge(340, 224, 2))
    b.append(V.T(360, 228, "再張開成「阿」", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_hand_chest(title, note="手掌貼胸口，低音時會感覺到震動"):
    b = [torso(110, 190, 60, 130)]
    b.append(f'<path class="hl2" d="M74 168 C94 154 126 154 146 168 C126 182 94 182 74 168 Z"/>')
    b.append(V.T(170, 172, "手掌貼這裡", "lbl-s"))
    b.append(V.leader(146, 168, 170, 168))
    b.append(V.T(60, 262, "震動＝低頻共鳴在作用；感覺不到就把音壓低", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_nasal_check(title, note="捏住鼻子：聲音明顯變小，代表共鳴沒漏到鼻腔"):
    b = [head(110, 120, 34)]
    b.append(f'<path class="muc" d="M96 96 C110 90 122 96 122 108 C110 112 98 110 96 96 Z"/>')
    b.append(V.T(146, 100, "捏住鼻子再唱一句", "lbl-s"))
    b.append(badge(330, 180, 1))
    b.append(V.T(350, 184, "聲音變小 → 好", "lbl-s"))
    b.append(badge(330, 224, 2))
    b.append(V.T(350, 228, "幾乎沒差 → 鼻音漏太多", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_glissando(title, note="滑音是連續的，不是一階一階跳；喉嚨要保持鬆"):
    b = [f'<path class="grid" d="M50 220 L420 220"/>',
         f'<path class="grid" d="M50 80 L50 220"/>']
    b.append(f'<path class="ave" d="M60 210 C140 200 160 90 240 80 C320 72 360 96 410 88"/>')
    b.append(V.T(60, 246, "低", "lbl-s"))
    b.append(V.T(400, 246, "高", "lbl-s", "end"))
    b.append(V.T(240, 60, "像警報器一樣來回", "lbl-s", "middle"))
    return card(title, "\n  ".join(b), note)


def ex_break(title, note="刻意破一次，是為了知道斷層在哪；不是每首都這樣唱"):
    b = [f'<path class="grid" d="M50 220 L420 220"/>']
    b.append(f'<path class="ave" d="M60 200 L180 150"/>')
    b.append(f'<path class="ave2" d="M190 146 L300 70"/>')
    b.append(f'<circle cx="185" cy="148" r="7" fill="{V.ACCENT}"/>')
    b.append(V.T(185, 130, "斷層", "lbl-s", "middle"))
    b.append(V.T(60, 246, "慢慢往上滑，記住聲音「喀」一聲的高度", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_range(title, note="先量再練：知道自己的舒適區在哪，選歌才不會硬拚"):
    b = [f'<path class="grid" d="M50 200 L420 200"/>']
    b.append(ticks(70, 200, 12, 30, 22))
    b.append(f'<rect class="hl2" x="130" y="150" width="150" height="26" rx="8"/>')
    b.append(f'<rect class="hl" x="290" y="150" width="80" height="26" rx="8"/>')
    b.append(V.T(205, 168, "舒適區", "lbl", "middle"))
    b.append(V.T(330, 168, "極限區", "lbl", "middle"))
    b.append(V.T(70, 240, "把最低與最高舒服唱出的音記下來", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_emotion_map(title, note="先標強度再唱：0–8 分，每段一個數字"):
    b = [f'<rect class="grid" x="50" y="70" width="360" height="130" rx="8"/>']
    for i, (lab, v) in enumerate([("主歌", 3), ("預副歌", 5), ("副歌", 8), ("橋段", 4)]):
        x = 80 + i * 90
        h = v * 15
        b.append(f'<rect class="hl" x="{x}" y="{196 - h}" width="52" height="{h}" rx="6"/>')
        b.append(V.T(x + 26, 214, lab, "lbl-s", "middle"))
        b.append(V.T(x + 26, 188 - h, str(v), "lbl", "middle"))
    b.append(V.T(50, 250, "全程 8 分等於沒有曲線；後面一定要比前面高", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_breath_points(title, note="換氣點畫在句子之間，而不是氣不夠才換"):
    b = []
    lines = ["第一句到這裡", "第二句再長一點", "第三句"]
    for i, line in enumerate(lines):
        y = 90 + i * 54
        b.append(f'<rect class="grid" x="50" y="{y - 20}" width="360" height="32" rx="8"/>')
        b.append(V.T(64, y + 2, line, "lbl-s"))
        bx = 118 + len(line) * 15
        b.append(f'<path class="ink" d="M{bx} {y - 26} L{bx} {y + 20}"/>')
        b.append(V.arrow(bx + 6, y - 30, bx + 40, y - 30))
    b.append(V.T(50, 250, "每句之間留一個換氣點，情緒反而更滿", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_hydrate(title, note="水分是聲帶的潤滑；等到口渴才喝就太晚"):
    b = [f'<rect class="air" x="80" y="80" width="46" height="120" rx="10"/>',
         f'<rect class="air" x="80" y="80" width="46" height="70" rx="10"/>']
    b.append(V.T(150, 110, "小口、常喝", "lbl"))
    b.append(V.T(150, 134, "一天 1500–2000 ml", "lbl-s"))
    b.append(badge(150, 182, 1))
    b.append(V.T(172, 186, "唱前 30 分鐘先喝水", "lbl-s"))
    b.append(badge(150, 222, 2))
    b.append(V.T(172, 226, "室溫，不要冰的", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_checklist(title, items, note):
    b = []
    for i, it in enumerate(items[:4]):
        y = 86 + i * 46
        b.append(f'<path class="ave2" d="M60 {y} L70 {y + 12} L88 {y - 10}"/>')
        b.append(V.T(104, y + 4, it, "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_tone_pair(title, lo, hi, note):
    """Two-panel: low vs high placement."""
    b = [V.T(160, 76, lo, "lbl", "middle"), V.T(340, 76, hi, "lbl", "middle")]
    b.append(f'<path class="ave" d="M60 190 C100 150 130 150 160 150 C190 150 220 178 250 190"/>')
    b.append(f'<path class="ave2" d="M240 190 C270 160 300 110 340 96 C380 86 400 96 420 104"/>')
    b.append(V.T(60, 230, "厚、鬆、低", "lbl-s"))
    b.append(V.T(330, 230, "薄、集中、高", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_record(title, note="錄下來再聽，比當下憑感覺準得多"):
    b = [f'<rect class="grid" x="60" y="90" width="150" height="60" rx="10"/>',
         f'<rect class="grid" x="250" y="90" width="150" height="60" rx="10"/>']
    b.append(V.T(135, 126, "第一次", "lbl", "middle"))
    b.append(V.T(325, 126, "第二次", "lbl", "middle"))
    b.append(V.arrow(212, 120, 246, 120))
    b.append(f'<path class="ink" d="M60 196 L410 196"/>')
    b.append(V.T(60, 222, "只改一個動作，其他全部不變，才比較得出來", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_song(title, note="練習的最後一步永遠是：放回一句真的歌裡"):
    b = [f'<path class="grid" d="M60 90 L400 90"/>']
    b.append(f'<path class="ink" d="M60 90 L60 210"/>')
    for i in range(6):
        x = 70 + i * 54
        b.append(f'<circle cx="{x}" cy="{150 - (i % 3) * 24}" r="7" fill="{V.ACCENT}"/>')
    b.append(f'<path class="thin" d="M60 230 L400 230"/>')
    b.append(V.T(60, 256, "歌詞 → 動作 → 再唱一次", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_soft_onset(title, note="三種起音：氣聲、平衡、硬；日常以平衡為主"):
    b = []
    for i, (name, off) in enumerate([("氣聲", 30), ("平衡", 6), ("硬", 0)]):
        x = 60 + i * 130
        b.append(V.T(x + 45, 84, name, "lbl", "middle"))
        b.append(f'<path class="grid" d="M{x} 210 L{x + 100} 210"/>')
        b.append(f'<path class="ave" d="M{x} 150 C{x + 20} 150 {x + 20 + off} 120 '
                 f'{x + 60 + off} 120 C{x + 80 + off} 120 {x + 90} 140 {x + 100} 150"/>')
        b.append(f'<path class="ave2" d="M{x + off} 210 C{x + off + 10} 186 {x + off + 20} 234 '
                 f'{x + off + 30} 210 C{x + off + 40} 186 {x + off + 56} 206 {x + 100} 212"/>')
    b.append(V.T(60, 246, "上面是氣流、下面是聲帶振動；兩條同時到位＝平衡起音", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_dynamic(title, note="小聲→大聲→小聲，音量變、位置不變"):
    b = [f'<path class="grid" d="M50 150 L420 150"/>']
    b.append(f'<path class="ave" d="M60 150 C130 150 150 80 230 80 C310 80 330 150 400 150"/>')
    b.append(V.T(60, 190, "小", "lbl-s"))
    b.append(V.T(230, 66, "大", "lbl-s", "middle"))
    b.append(V.T(400, 190, "小", "lbl-s", "end"))
    b.append(V.T(60, 232, "音量變化時，共鳴位置必須留在同一點", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_mix(title, note="混聲是比例：胸聲與頭聲各出一點，接縫就不見"):
    b = [f'<rect class="grid" x="60" y="130" width="340" height="34" rx="17"/>']
    b.append(f'<rect class="hl2" x="60" y="130" width="180" height="34" rx="17"/>')
    b.append(f'<rect class="hl" x="240" y="130" width="160" height="34" rx="17"/>')
    b.append(V.T(110, 118, "胸聲", "lbl-s"))
    b.append(V.T(390, 118, "頭聲", "lbl-s", "end"))
    for x, name in [(150, "強混"), (230, "平衡"), (310, "弱混")]:
        b.append(f'<circle cx="{x}" cy="147" r="9" fill="{V.ACCENT}"/>')
        b.append(V.T(x, 194, name, "lbl-s", "middle"))
    b.append(V.T(60, 236, "練到能在這條線上自由移動，而不是只會站一邊", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_vowel(title, note="同一個音高，只換母音；感覺位置跟著跑就是對的"):
    b = []
    for i, (v, note_) in enumerate([("阿", "最開"), ("欸", "扁平"), ("衣", "最扁"), ("喔", "圓"), ("嗚", "最圓")]):
        x = 60 + i * 74
        b.append(f'<circle class="hl" cx="{x}" cy="150" r="24"/>')
        b.append(V.T(x, 156, v, "lbl", "middle"))
        b.append(V.T(x, 190, note_, "lbl-s", "middle"))
    b.append(V.T(60, 236, "先在同一個音上換，再換到旋律裡", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_octave(title, note="八度滑行是從胸聲一路帶到頭聲，中間不能斷"):
    b = [f'<path class="grid" d="M50 220 L420 220"/>']
    b.append(f'<path class="ave" d="M70 200 C150 190 200 80 300 70 C350 66 390 84 410 92"/>')
    b.append(f'<circle cx="70" cy="200" r="6" fill="{V.ACCENT}"/>')
    b.append(f'<circle cx="410" cy="92" r="6" fill="{V.ACCENT}"/>')
    b.append(V.T(70, 240, "低八度", "lbl-s"))
    b.append(V.T(400, 240, "高八度", "lbl-s", "end"))
    b.append(V.T(240, 52, "一口氣滑完，不要中途換檔", "lbl-s", "middle"))
    return card(title, "\n  ".join(b), note)


def ex_rest(title, note="聲音的恢復靠休息，不靠意志力"):
    b = [f'<rect class="grid" x="60" y="110" width="340" height="46" rx="10"/>']
    b.append(f'<rect class="hl" x="60" y="110" width="120" height="46" rx="10"/>')
    b.append(V.T(120, 138, "用聲", "lbl", "middle"))
    b.append(V.T(300, 138, "安靜休息", "lbl", "middle"))
    b.append(V.T(60, 196, "每 45 分鐘用聲，至少給 15 分鐘安靜", "lbl-s"))
    b.append(V.T(60, 226, "沙啞超過兩週，先看醫生，不要繼續練", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_steam(title, note="蒸氣是急救，不是治療；隔天再唱，不要當天硬練"):
    b = [f'<rect class="air" x="90" y="150" width="90" height="80" rx="12"/>']
    b.append(f'<path class="thin" d="M120 146 C110 126 130 116 120 96"/>')
    b.append(f'<path class="thin" d="M150 146 C140 126 160 116 150 96"/>')
    b.append(V.T(70, 256, "溫水蒸氣 5–10 分鐘，之後完全休息", "lbl-s"))
    b.append(badge(300, 130, 1))
    b.append(V.T(320, 134, "不要加精油", "lbl-s"))
    b.append(badge(300, 180, 2))
    b.append(V.T(320, 184, "不要燙到", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_false_folds(title, note="那個「夾住」的感覺，是假聲帶在關門"):
    b = [f'<g transform="translate(20,40) scale(0.62)">{V.larynx_side(hl="false")}</g>']
    b.append(V.leader(180, 146, 250, 110, "假聲帶關起來"))
    b.append(V.leader(180, 200, 250, 214, "真聲帶在下面"))
    b.append(V.T(30, 280, "先認識它，再學會不要叫它出來", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_glottis_card(title, gap, note):
    b = [f'<g transform="translate(50,30) scale(0.66)">{V.glottis(gap=gap)}</g>']
    b.append(V.T(300, 120, "從上往下看", "lbl-s"))
    b.append(V.T(300, 146, "白色＝聲帶", "lbl-s"))
    b.append(V.T(300, 172, "中間縫＝聲門", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_timing(title, note="節拍是律動的底，先穩再談彈性"):
    b = [f'<path class="grid" d="M60 150 L410 150"/>']
    for i in range(9):
        x = 70 + i * 40
        b.append(f'<path class="grid" d="M{x} 120 L{x} 180"/>')
    b.append(f'<circle cx="230" cy="150" r="9" fill="{V.ACCENT}"/>')
    b.append(V.T(60, 216, "先跟節拍器 60 BPM，穩了再放慢或加快", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_fry(title, note="氣泡音是慢速、不規則的振動，喉嚨要鬆"):
    b = [f'<path class="ave" d="M60 120 C72 100 84 140 96 120 C108 100 120 140 132 120 '
         f'C144 100 156 140 168 120"/>']
    b.append(f'<path class="ave2" d="M60 200 C74 190 86 210 100 200 C114 190 126 210 140 200 '
             f'C154 190 166 210 180 200"/>')
    b.append(V.T(200, 124, "正常振動：快而規律", "lbl-s"))
    b.append(V.T(200, 204, "氣泡音：慢、一下一下", "lbl-s"))
    b.append(V.T(60, 250, "一天練 3 次、每次 30 秒就好，不要久練", "lbl-s"))
    return card(title, "\n  ".join(b), note)


def ex_three_step(title, steps, note):
    b = []
    for i, s in enumerate(steps[:3]):
        y = 100 + i * 56
        b.append(badge(70, y, i + 1))
        b.append(V.T(96, y + 5, s, "lbl-s"))
        if i < 2:
            b.append(V.arrow(70, y + 18, 70, y + 38))
    return card(title, "\n  ".join(b), note)


# ── registry ──────────────────────────────────────────────────────────
REGISTRY = {
    "posture": lambda: ex_posture("站好，再開始唱"),
    "posture-2": lambda: ex_posture("貼牆找中軸", "後腦、肩胛、臀貼牆，腰椎只留一個手掌的縫"),
    "diaphragm": lambda: ex_diaphragm("用肚子吸氣，不是用肩膀"),
    "sigh": lambda: ex_sigh("嘆一口氣，聲音自然掉出來"),
    "longtone": lambda: ex_longtone("一個音，撐滿 20 秒"),
    "jaw": lambda: ex_jaw("讓下巴自己掉下來"),
    "fricative": lambda: ex_fricative("嘶——把氣吹得又細又長"),
    "lip-trill": lambda: ex_lip_trill("讓嘴唇自己震動"),
    "hum": lambda: ex_hum("用「嗯」找振動的位置"),
    "hand-chest": lambda: ex_hand_chest("手掌貼胸口，找低頻的震動"),
    "nasal-check": lambda: ex_nasal_check("捏住鼻子，檢查有沒有漏氣"),
    "glissando": lambda: ex_glissando("像警報器一樣上下滑"),
    "break": lambda: ex_break("故意破一次，找出斷層"),
    "range": lambda: ex_range("先量音域，再選歌"),
    "emotion-map": lambda: ex_emotion_map("先標強度，再開口"),
    "breath-points": lambda: ex_breath_points("換氣點畫在句子之間"),
    "hydrate": lambda: ex_hydrate("提前補水，不要等口渴"),
    "checklist": lambda: ex_checklist("先避開這幾樣", ["冰飲與酒精", "麻辣與油炸", "熬夜與大吼", "長時間低聲細語"], "避開不是永久禁止，是錄音與演出前 24 小時"),
    "tone-pair": lambda: ex_tone_pair("同一條聲帶的兩端", "厚、短", "薄、長", "厚薄不是力度，是形狀"),
    "record": lambda: ex_record("錄一次，只改一個動作，再錄一次"),
    "song": lambda: ex_song("最後一定要放回一句真的歌"),
    "soft-onset": lambda: ex_soft_onset("三種起音，先聽再選"),
    "dynamic": lambda: ex_dynamic("小聲、大聲、小聲"),
    "mix": lambda: ex_mix("在比例尺上找到你的位置"),
    "vowel": lambda: ex_vowel("同一個音，換五個母音"),
    "octave": lambda: ex_octave("一口氣滑完八度"),
    "rest": lambda: ex_rest("聲音是練不出來的，是休息出來的"),
    "steam": lambda: ex_steam("蒸氣急救，然後完全休息"),
    "false-folds": lambda: ex_false_folds("認出假聲帶夾住的那個感覺"),
    "glottis-breathy": lambda: ex_glottis_card("讓聲門輕輕靠攏", 0.9, "太開＝漏氣，太閉＝擠壓"),
    "glottis-closed": lambda: ex_glottis_card("讓聲門靠攏但不夾", -0.4, "感覺是「併起來」，不是「壓下去」"),
    "timing": lambda: ex_timing("先跟節拍，再談律動"),
    "fry": lambda: ex_fry("氣泡音：慢、鬆、一下一下"),
    "steps-3": lambda: ex_three_step("三段式練習", ["先做無聲的動作", "加上氣", "才加上聲音"], "任何新動作都拆成這三步"),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in REGISTRY.items():
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
    print(f"{len(REGISTRY)} exercise cards written to {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
