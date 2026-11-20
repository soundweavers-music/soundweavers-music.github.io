#!/usr/bin/env python3
"""把 work/theory_strings/*.json 合併成 scripts/theory_en_strings.py。

空字串（還沒翻）會被跳過並列出來 —— 沒翻的字串在產圖時會原樣保留中文，
所以少一條就要看得見。

用法：python scripts/merge_theory_strings.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SRC = BASE_DIR / "work" / "theory_strings"
DST = BASE_DIR / "scripts" / "theory_en_strings.py"

HEADER = '''"""樂理圖的中文 → 英文字串表。

由 scripts/merge_theory_strings.py 從 work/theory_strings/*.json 產生，
不要手改這一份（改 JSON 再合併）。

key 是 SVG 裡 <text> 的原文（去頭尾空白、XML 實體已還原），value 是英文。
"""
from __future__ import annotations

EN: dict[str, str] = {
'''


def main() -> None:
    merged: dict[str, str] = {}
    blank: list[str] = []
    for path in sorted(SRC.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for zh, en in data.items():
            en = (en or "").strip()
            if not en:
                blank.append("%s: %s" % (path.stem, zh))
                continue
            merged[zh] = en
    items = "\n".join(
        "    %s: %s," % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False))
        for k, v in sorted(merged.items()))
    DST.write_text(HEADER + items + "\n}\n", encoding="utf-8")
    print("寫出 %s：%d 條。" % (DST.relative_to(BASE_DIR), len(merged)))
    if blank:
        print("還沒翻 %d 條：" % len(blank))
        for b in blank:
            print("  " + b)
        sys.exit(1)


if __name__ == "__main__":
    main()
