#!/usr/bin/env python3
"""Insert the vocal-course diagrams into the 50 chapter files.

Each chapter gets one figure placed right under its「原理：為什麼會這樣」heading —
that is the section where the mechanism is explained, so the picture lands where
the reader needs it. Reuses a small library of diagrams across chapters that talk
about the same mechanism (see content/vocal/_STYLE.md).

Idempotent: a chapter that already references its figure is left untouched, and
old relative refs (../../assets/vocal/x.svg) are normalised to the absolute path.

Usage:  python scripts/insert_vocal_figures.py [--check]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VOCAL = BASE_DIR / "content" / "vocal"
HEADING = "## 原理：為什麼會這樣"

FIGURES = {
    1: ("breath-cycle", "平常呼吸與唱歌吸氣時，橫膈膜下降幅度的差別"),
    2: ("posture-side", "站姿對齊：耳、肩、髖、踝四個點是否疊在一起"),
    3: ("diaphragm-support", "丹田支撐：吸氣時腹壁外擴，發聲時保持撐住"),
    4: ("breath-budget", "一口氣在長音上的分配：起音、維持、收尾"),
    5: ("resonance-map", "側面示意圖：胸腔、咽喉腔、鼻腔與頭腔的位置"),
    6: ("folds-open-closed", "聲帶開合示意圖：吸氣時張開，發聲時靠攏"),
    7: ("articulation", "口腔側面圖：唇、齒、齒齦、硬顎、軟顎與舌頭各部位"),
    8: ("resonance-map", "側面示意圖：胸腔、咽喉腔、鼻腔與頭腔的位置"),
    9: ("resonance-blend", "三種共鳴腔的比例尺：胸腔、口咽腔、鼻腔頭腔"),
    10: ("resonance-map", "側面示意圖：胸腔、咽喉腔、鼻腔與頭腔的位置"),
    11: ("passaggio-ladder", "音域三段與換聲區示意圖"),
    12: ("dynamics-curve", "主歌到副歌的動態曲線：段落與情緒強度"),
    13: ("range-test", "音域測試：說話區、舒適區、極限區"),
    14: ("dynamics-curve", "情緒線：把每段標上強度後的曲線"),
    15: ("fold-swelling", "正常聲帶與水腫聲帶的比較"),
    16: ("diaphragm-support", "橫膈膜的深度：吸氣時的下降幅度與腹壁支撐"),
    17: ("onset-types", "三種起音：氣聲起音、平衡起音、硬起音"),
    18: ("diaphragm-support", "強弱對比時腹壁的抗力"),
    19: ("fold-thickness", "聲帶厚薄與音高：甲杓肌（TA）與環甲肌（CT）"),
    20: ("closure-grades", "聲帶閉合三級：漏氣、平衡、壓迫"),
    21: ("fold-thickness", "聲帶被拉長拉薄時，音變高"),
    22: ("false-folds", "假聲帶（室襞）與真聲帶（聲襞）的上下位置"),
    23: ("fry-wave", "氣泡音與正常振動的波形差異"),
    24: ("passaggio-ladder", "音域三段與換聲區示意圖"),
    25: ("mix-blend", "混聲比例尺：從胸聲到頭聲"),
    26: ("mix-blend", "弱混聲在混聲比例尺上的位置"),
    27: ("mix-blend", "強混聲在混聲比例尺上的位置"),
    28: ("formant-filter", "聲源－濾波器示意圖：諧波經過聲道形成共振峰"),
    29: ("soft-palate", "軟顎抬起與放下，聲音分別往口腔或鼻腔走"),
    30: ("resonance-map", "側面示意圖：胸腔、咽喉腔、鼻腔與頭腔的位置"),
    31: ("resonance-blend", "依曲風調整的共鳴比例"),
    32: ("formant-filter", "咽音讓共振峰往高頻集中"),
    33: ("vowel-formants", "五個母音在 F1－F2 平面上的大致位置"),
    34: ("articulation", "唇齒舌的咬字部位"),
    35: ("groove-grid", "拍點前後的微小時差：搶拍、正拍、拖拍"),
    36: ("groove-grid", "搶拍與拖拍在節拍格上的位置"),
    37: ("vibrato-wave", "直音、顫音與滑音的波形"),
    38: ("dynamics-curve", "把主歌與副歌的張力推向高點"),
    39: ("breath-noise", "氣聲成分：諧波加上寬頻噪音"),
    40: ("phrase-breath", "樂句與換氣點的安排"),
    41: ("dynamics-curve", "段落張力曲線：畫面感跟著段落走"),
    42: ("mic-distance", "麥克風距離與音色變化"),
    43: ("headphone-monitor", "耳機監聽與骨傳導兩條路徑"),
    44: ("track-layers", "分段錄音堆疊成一首歌的分軌"),
    45: ("harmony-stack", "主唱與和聲的堆疊關係"),
    46: ("track-layers", "分軌檔案交出去給混音師"),
    47: ("stage-monitor", "舞台監聽喇叭與主喇叭"),
    48: ("resonance-blend", "不同曲風的共鳴比例"),
    49: ("practice-loop", "練習循環：錄、聽、找出一個問題、再錄"),
    50: ("voice-fingerprint", "自己的聲音能力分佈"),
}

REL_RE = re.compile(r"!\[([^\]]*)\]\((?:\.\./)+assets/vocal/([a-z0-9-]+)\.svg\)")


def main() -> None:
    check_only = "--check" in sys.argv
    added = normalised = already = 0
    missing: list[str] = []
    for num, (slug, alt) in sorted(FIGURES.items()):
        path = VOCAL / f"vocal_ch{num}.md"
        src = path.read_text(encoding="utf-8")

        # normalise legacy relative references to the site-absolute path
        new, n = REL_RE.subn(lambda m: f"![{m.group(1)}](/assets/vocal/{m.group(2)}.svg)", src)
        if n:
            normalised += 1
            src = new

        if f"/assets/vocal/{slug}.svg" in src:
            already += 1
        else:
            image = f"![{alt}](/assets/vocal/{slug}.svg)"
            lines = src.split("\n")
            try:
                i = lines.index(HEADING)
            except ValueError:
                missing.append(f"ch{num}: no「{HEADING}」heading")
                continue
            lines[i + 1:i + 1] = ["", image]
            src = "\n".join(lines)
            added += 1

        if not check_only and src != path.read_text(encoding="utf-8"):
            path.write_text(src, encoding="utf-8")

    verb = "would add" if check_only else "added"
    print(f"{verb} {added} figures, normalised {normalised} paths, "
          f"{already} already had one")
    for m in missing:
        print("  !", m)


if __name__ == "__main__":
    main()
