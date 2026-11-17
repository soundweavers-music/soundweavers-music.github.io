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

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT = BASE_DIR / "assets" / "vocal"

INK = "#2b2a26"
MUTED = "#8a8578"
ACCENT = "#b5734a"
ACCENT2 = "#7d9b76"
PAPER = "#fbf8f2"
LINE = "#d8d0c2"

FONT = "font-family='Noto Serif TC, serif'"


def svg(w: int, h: int, body: str, title: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">
  <title>{title}</title>
  <rect width="{w}" height="{h}" fill="{PAPER}"/>
  <style>
    .ink {{ fill: none; stroke: {INK}; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }}
    .thin {{ fill: none; stroke: {MUTED}; stroke-width: 1.4; stroke-dasharray: 5 5; }}
    .fill {{ fill: {ACCENT}; opacity: .18; stroke: {ACCENT}; stroke-width: 1.8; }}
    .fill2 {{ fill: {ACCENT2}; opacity: .18; stroke: {ACCENT2}; stroke-width: 1.8; }}
    .lbl {{ {FONT}; font-size: 15px; fill: {INK}; }}
    .lbl-s {{ {FONT}; font-size: 12.5px; fill: {MUTED}; }}
  </style>
{body}
</svg>
"""


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
    return svg(560, 560, body, "人體三大共鳴腔示意圖：胸腔、咽喉腔、鼻腔與頭腔")


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
        # mouth
        body += f'<circle class="fill2" cx="120" cy="{y + 20}" r="22"/>\n'
        # mic capsule
        mx = 120 + gap
        body += f'<rect class="fill" x="{mx}" y="{y + 4}" width="16" height="32" rx="8"/>\n'
        body += f'<path class="thin" d="M142 {y + 20} L{mx - 4} {y + 20}"/>\n'
        body += f'<text class="lbl-s" x="{mx + 28}" y="{y + 24}">{note}</text>\n'
    body += f'<text class="lbl-s" x="30" y="420">距離是相對的：小聲時靠近，大聲時退開，讓麥克風幫你做動態</text>'
    return svg(560, 450, body, "麥克風距離與音色變化示意圖")


def formant_filter() -> str:
    """Source-filter: harmonics in, a filter shape, formants out."""
    body = """
  <text class="lbl" x="40" y="40">聲帶產生：一組整數倍頻率</text>
  <text class="lbl" x="300" y="40">聲道像濾網，放大某些頻率</text>
"""
    # harmonic bars
    for i in range(1, 9):
        x = 50 + i * 26
        h = 90 - i * 6
        body += f'<rect class="fill2" x="{x}" y="{150 - h}" width="12" height="{h}" rx="2"/>\n'
    # filter curve
    body += f'<path class="ink" d="M300 150 C330 150 345 70 372 52 C400 36 420 96 450 140 C480 168 510 168 540 168"/>\n'
    # resulting spectrum
    for i in range(1, 8):
        x = 305 + i * 28
        base = 90 - i * 5
        boost = 40 if i in (2, 4) else 0
        h = base + boost
        body += f'<rect class="fill" x="{x}" y="{260 - h}" width="12" height="{h}" rx="2"/>\n'
    body += f'<text class="lbl-s" x="300" y="300">峰的位置就是共振峰（F1、F2…）</text>\n'
    body += f'<text class="lbl-s" x="40" y="200">頻率 →</text>\n'
    return svg(600, 330, body, "線性聲源－濾波器示意圖：諧波經過聲道濾波形成共振峰")


DIAGRAMS = {
    "resonance-map.svg": resonance_map,
    "folds-open-closed.svg": folds_open_closed,
    "passaggio-ladder.svg": passaggio_ladder,
    "mic-distance.svg": mic_distance,
    "formant-filter.svg": formant_filter,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in DIAGRAMS.items():
        (OUT / name).write_text(fn(), encoding="utf-8")
        print(f"  {name}")
    print(f"{len(DIAGRAMS)} diagrams written to {OUT.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
