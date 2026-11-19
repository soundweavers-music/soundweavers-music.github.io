#!/usr/bin/env python3
"""Insert the generated ukulele figures into the course chapters.

Idempotent: a chapter that already references a figure is skipped, so the
script can be re-run after editing either the diagrams or the text.

Usage:
  python scripts/insert_ukulele_figures.py [--check]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
CONTENT = BASE / "content" / "ukulele"

# (chapter file, 插在哪个标题之后, 图档, 图说)
PLAN = [
    ("1.md", "## 1.1", "sizes.svg",
     "四種尺寸依實際長度比例繪製：21／23／26 吋的調音相同，30 吋 Baritone 是 D-G-B-E。"),
    ("1.md", "## 1.3", "anatomy.svg",
     "全琴構造：上弦枕決定有效弦長的起點，琴橋與琴身負責把弦的振動變成聲音。"),
    ("2.md", "## 2.1", "tuning.svg",
     "標準調音 G-C-E-A。High-G 的第 4 弦比第 3 弦高八度，所以四條弦由低到高不是「愈左愈低」。"),
    ("5.md", "## 5.1", "chords_cafg.svg",
     "C、Am、F、G7 的按法（由左至右＝第 4 弦到第 1 弦；○ 空弦、✕ 不彈）。"),
    ("6.md", "## 6.1", "strum_folk.svg",
     "民謠搖滾的 8 個動作：↓　↓↑　↑↓↑，空白格是手繼續擺動但不碰弦的空刷。"),
    ("19.md", "## 19.1", "fretboard.svg",
     "0–12 格的音名對照：第 12 格是空弦的八度，第 5、7 格可當把位參考。"),
    ("3.md", "## 3.1", "posture.svg",
     "三點都只是「靠著」：胸口、右前臂、左手虎口；任何一點用力夾緊都會讓音色變悶、換和弦變慢。"),
    ("8.md", "## 8.2", "strum_waltz.svg",
     "3/4 的第 1 拍最飽滿；6/8 是「兩大拍」，每大拍三下，不要把六下刷得一樣重。"),
    ("9.md", "## 9.2", "strum_chunk.svg",
     "切音落在第 2 拍與第 4 拍的正拍（X），其餘位置照常上下刷。"),
    ("12.md", "## 12.1", "barre.svg",
     "封閉和弦：食指整根橫壓四條弦，其餘手指再按出和弦形狀。"),
    ("22.md", "## 22.", "harmonics.svg",
     "第 12 格是高八度、第 7 格高八度＋五度、第 5 格高兩個八度；手指輕觸格線正上方就別壓。"),
    ("24.md", "## 24.", "lowg.svg",
     "Low-G 只換第 4 弦：High-G 的第 4 弦比第 3 弦高，Low-G 則變成最低音，指法不變。"),
    ("4.md", "## 4.1", "chord_read.svg",
     "和弦圖是「直立看琴」：左邊是第 4 弦；上面 ○ 是空弦、✕ 是不彈的弦，數字是格數不是手指。"),
    ("7.md", "## 7.2", "picking.svg",
     "T1213121：拇指先落、食指中指交替；同一組型換和弦時，拇指仍負責第 4 弦。"),
    ("13.md", "## 13.1", "offbeat.svg",
     "雷鬼的正拍是悶音（X），反拍才刷；正拍越安靜，反拍越有彈跳感。"),
    ("16.md", "## 16.1", "fchords.svg",
     "F 大調順階：F、Gm、Am、Bb、C、Dm、Edim——同一排看，就看得出三和弦家族的規律。"),
    ("18.md", "## 18.1", "sevenths.svg",
     "Cmaj7、Am7、Dm7、G7 只比三和弦多按一根手指，卻多出「成熟感」。"),
    ("25.md", "## 25.1", "restring.svg",
     "換弦三步：先鬆、再拆、最後繞八字結邊調邊拉緊；一次只換一條。"),
]


def insert_once(text: str, heading_prefix: str, image: str, caption: str) -> tuple[str, bool]:
    if image in text:
        return text, False
    lines = text.splitlines()
    idx = None
    for i, line in enumerate(lines):
        if line.startswith(heading_prefix):
            idx = i
            break
    if idx is None:
        return text, False
    # 找這個標題後的下一段（到下一個同級或更高階標題為止），把圖插在段落之後
    j = idx + 1
    while j < len(lines) and not lines[j].startswith("#"):
        j += 1
    block = ["", f'![{caption}](../../assets/ukulele/{image} "{image}")', "",
             f"*圖：{caption}*", ""]
    new = lines[:j] + block + lines[j:]
    return "\n".join(new) + ("\n" if text.endswith("\n") else ""), True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    changed = 0
    missing = 0
    for name, heading, image, caption in PLAN:
        path = CONTENT / name
        if not path.exists():
            print(f"!! 找不到 {name}")
            missing += 1
            continue
        text = path.read_text(encoding="utf-8")
        new, ok = insert_once(text, heading, image, caption)
        if ok:
            if not args.check:
                path.write_text(new, encoding="utf-8")
                print(f"++ {name} 插入 {image}")
                changed += 1
            else:
                print(f"ok {name} 會插入 {image}")
        elif image in text:
            print(f".. {name} 已有 {image}")
        else:
            print(f"?? {name} 找不到標題 {heading}")
            missing += 1
    print(f"\n變更 {changed} 處、{missing} 個問題")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
