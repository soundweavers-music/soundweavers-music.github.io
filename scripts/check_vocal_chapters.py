#!/usr/bin/env python3
"""檢查 content/vocal/ 的章節是否符合 _STYLE.md 的規格。

用途：改寫 50 章之後，一次看完哪幾章缺小節、字數不對、引用了清單外的 PMID、
或圖片路徑不存在。只讀檔，不會修改任何東西。

    python scripts/check_vocal_chapters.py
    python scripts/check_vocal_chapters.py --verbose
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT = BASE_DIR / "content" / "vocal"
SOURCES = CONTENT / "_SOURCES.md"

SECTIONS = [
    "## 先講結論",
    "## 常見誤解",
    "## 原理：為什麼會這樣",
    "## 打個比方",
    "## 現在就做",
    "## 練完之後",
    "## 延伸查證",
]

MIN_CHARS, MAX_CHARS = 1200, 2400
CJK = re.compile(r"[㐀-䶿一-鿿]")


def chinese_chars(text: str) -> int:
    """只算中文字，避免英文文獻條目把字數撐高。"""
    return len(CJK.findall(text))


def main(argv) -> int:
    verbose = "--verbose" in argv
    known_pmids = set(re.findall(r"PMID:\s*(\d+)", SOURCES.read_text(encoding="utf-8")))
    files = sorted(CONTENT.glob("vocal_ch*.md"), key=lambda p: int(re.search(r"ch(\d+)", p.name).group(1)))

    problems = 0
    rows = []
    for path in files:
        text = path.read_text(encoding="utf-8")
        issues = []

        if not text.startswith("# [歌唱教學]"):
            issues.append("H1 標題不見了")

        # 小節必須齊全且順序正確
        positions = [text.find(s) for s in SECTIONS]
        missing = [SECTIONS[i] for i, p in enumerate(positions) if p < 0]
        if missing:
            issues.append("缺小節：" + "、".join(s.replace("## ", "") for s in missing))
        elif positions != sorted(positions):
            issues.append("小節順序不對")

        chars = chinese_chars(text)
        if chars < MIN_CHARS:
            issues.append(f"字數偏少（{chars}）")
        elif chars > MAX_CHARS:
            issues.append(f"字數偏多（{chars}）")

        # PMID 必須來自 _SOURCES.md
        pmids = set(re.findall(r"PMID:?\s*(\d+)", text))
        unknown = pmids - known_pmids
        if unknown:
            issues.append("清單外的 PMID：" + ", ".join(sorted(unknown)))
        if len(pmids) < 2:
            issues.append(f"延伸查證只有 {len(pmids)} 條來源")

        # 圖片必須存在
        for ref in re.findall(r"!\[[^\]]*\]\((/[^)]+)\)", text):
            if not (BASE_DIR / ref.lstrip("/")).exists():
                issues.append("圖片不存在：" + ref)

        rows.append((path.name, chars, len(pmids), issues))
        problems += len(issues)

    width = max(len(r[0]) for r in rows) if rows else 10
    for name, chars, n_pmid, issues in rows:
        flag = "OK  " if not issues else "FAIL"
        line = f"{flag} {name:<{width}} {chars:>5} 字  {n_pmid} 來源"
        if issues:
            line += "  | " + "；".join(issues)
        print(line)
        if verbose and not issues:
            print("      小節齊全、來源皆在清單內")

    print(f"\n{len(rows)} 章，{problems} 個問題。")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
