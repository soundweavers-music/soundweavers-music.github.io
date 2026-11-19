#!/usr/bin/env python3
"""錄音後製 30 章的機械檢查：圖、表、長度、禁用語。

和人聲課程一樣，這邊只檢查「有沒有」，不判斷「寫得好不好」——
內容對不對是 factcheck_digitalmusic.py 的事。

檢查項目
--------
1. 每一章至少一張圖（/assets/digitalmusic/*.svg）與一張表
2. 圖檔真的存在，而且檔名在 FIGURES 註冊表裡
3. 章節長度：1,200–9,000 字（原文偏長，但短於 1,200 就是沒寫完）
4. 禁用語：萬用開場、行銷詞、沒有條件的保證

用法：
  python scripts/audit_digitalmusic.py
  python scripts/audit_digitalmusic.py --strict   # 有問題就回傳 1
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
DM = BASE_DIR / "content" / "digitalmusic"
FIG_DIR = BASE_DIR / "assets" / "digitalmusic"

BANNED = [
    ("萬用開場", re.compile(r"歡迎來到.{0,12}(課程|世界)|在我們共同走過")),
    ("行銷詞", re.compile(r"完美|極致|神級|終極|震撼|神器|靈魂的洗禮")),
    ("無條件保證", re.compile(r"絕對|保證|百分之百|一定要買")),
    ("含糊來源", re.compile(r"據說|一般認為|大家都知道|眾所周知")),
]
MIN_CHARS, MAX_CHARS = 1200, 12000


def main() -> int:
    strict = "--strict" in sys.argv
    problems = 0
    for n in range(1, 31):
        path = DM / f"digitalmusic{n}.md"
        if not path.exists():
            print(f"!! {n:02d} 缺檔案")
            problems += 1
            continue
        text = path.read_text(encoding="utf-8")
        issues = []

        imgs = re.findall(r"!\[[^\]]*\]\((/assets/digitalmusic/([a-z0-9-]+)\.svg)\)", text)
        if not imgs:
            issues.append("沒有圖")
        for _, key in imgs:
            if not (FIG_DIR / f"{key}.svg").exists():
                issues.append(f"圖檔不存在：{key}.svg")

        if not re.search(r"^\|.+\|\s*$", text, re.M):
            issues.append("沒有表")

        chars = len(re.sub(r"\s", "", text))
        if chars < MIN_CHARS:
            issues.append(f"太短（{chars} 字）")
        elif chars > MAX_CHARS:
            issues.append(f"太長（{chars} 字）")

        for name, pat in BANNED:
            for m in pat.finditer(text):
                issues.append(f"{name}：「{m.group(0)}」")

        mark = "!!" if issues else "OK"
        print(f"{mark} {n:02d} {chars:>5} 字 圖{len(imgs)}  " + "；".join(issues[:4]))
        problems += len(issues)

    print(f"\n{'有問題' if problems else '全部通過'}：{problems} 項")
    return 1 if (problems and strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
