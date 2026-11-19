#!/usr/bin/env python3
"""把站上用的中日韓襯線字型裁成「只留實際用到的字」。

原始檔是 Source Han Serif TW 可變字型（16 MB），整個站其實只用到約 3,700 個
中文字。裁成 woff2 之後是 1.5 MB，`@font-face` 只指向這個檔案。

需要原始 TTF 才能重跑（Adobe 的 Source Han Serif TW，SIL OFL）：

    https://github.com/adobe-fonts/source-han-serif/raw/release/Variable/TTF/Subset/SourceHanSerifTW-VF.ttf

用法：
    python scripts/subset_font.py                      # 需要 fonts/ 底下有原始 TTF
    python scripts/subset_font.py /path/to/SourceHanSerifTW-VF.ttf
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SOURCE = BASE / "fonts" / "Variable" / "TTF" / "Subset" / "SourceHanSerifTW-VF.ttf"
OUTPUT = BASE / "fonts" / "SourceHanSerifTW-VF-subset.woff2"
CHARSET = BASE / "work" / "font_chars.txt"

# 掃這些地方的字：課程內容、頁面模板、前端腳本、產生頁面的程式
GLOBS = ["content/**/*.md", "templates/**/*.html", "assets/*.js", "assets/*.json",
         "scripts/*.py", "*.html"]


def collect_chars() -> str:
    chars = set()
    for pattern in GLOBS:
        for p in BASE.glob(pattern):
            try:
                chars |= set(p.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                continue
    # 保險：ASCII、常用全形標點、以及介面上可能出現的箭頭與符號
    chars |= set(chr(c) for c in range(0x20, 0x7F))
    chars |= set("　、。，．；：？！「」『』（）〈〉《》…—－–·×÷＝＋％＃＆＊＠§¶†‡•‥※→←↑↓↔⇒⇔★☆○●◎◇◆□■△▲▽▼")
    return "".join(sorted(chars))


def main(argv: list[str]) -> int:
    src = Path(argv[0]) if argv else SOURCE
    if not src.exists():
        print(f"找不到原始字型：{src}")
        print("請先下載 Source Han Serif TW VF（見本檔開頭的網址），或用參數指定路徑。")
        return 1
    text = collect_chars()
    CHARSET.parent.mkdir(parents=True, exist_ok=True)
    CHARSET.write_text(text, encoding="utf-8")
    cjk = sum(1 for c in text if "㐀" <= c <= "鿿")
    print(f"收集到 {len(text)} 個字元（其中 CJK {cjk} 個）")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "pyftsubset", str(src),
        f"--text-file={CHARSET}",
        "--flavor=woff2",
        "--layout-features=*",
        "--no-hinting",
        f"--output-file={OUTPUT}",
    ]
    print("執行：", " ".join(cmd))
    subprocess.run(cmd, check=True)
    before = src.stat().st_size / 1e6
    after = OUTPUT.stat().st_size / 1e6
    print(f"{before:.1f} MB → {after:.1f} MB（{OUTPUT.relative_to(BASE)}）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
