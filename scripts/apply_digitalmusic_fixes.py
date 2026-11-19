#!/usr/bin/env python3
"""把 adjudicated.json 裡 CONFIRMED 的內容寫回課程。

只做「把原文片段換成裁判給的寫法」這一件事；找不到原文就跳過並列出來，
不猜、不整段重寫。每個改動都會印出來，方便人工複核。

用法：
  python scripts/apply_digitalmusic_fixes.py --dry-run
  python scripts/apply_digitalmusic_fixes.py
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
DM = BASE_DIR / "content" / "digitalmusic"
SRC = BASE_DIR / "work" / "factcheck-digitalmusic" / "adjudicated.json"


def main() -> int:
    dry = "--dry-run" in sys.argv
    records = json.loads(SRC.read_text(encoding="utf-8"))
    applied = skipped = 0
    report = []
    for rec in records:
        path = DM / rec["file"]
        text = path.read_text(encoding="utf-8")
        original = text
        for item in rec.get("confirmed", []):
            quote = (item.get("quote") or "").strip()
            fix = (item.get("judge_fix") or "").strip()
            if not quote or not fix or item.get("kind") == "error":
                continue
            if quote not in text:
                skipped += 1
                report.append(f"  ? {rec['file']}: 找不到「{quote[:18]}」")
                continue
            text = text.replace(quote, fix, 1)
            applied += 1
            report.append(f"  ~ {rec['file']}: {quote[:18]} → {fix[:34]}")
        if text != original and not dry:
            path.write_text(text, encoding="utf-8")

    print("\n".join(report))
    print(f"\n{'預計' if dry else '已'}套用 {applied} 條，{skipped} 條需要人工處理")


if __name__ == "__main__":
    raise SystemExit(main())
