#!/usr/bin/env python3
"""流行吉他彈唱課程的機械審查。

只抓「不用讀懂內容也能判定有問題」的東西：格式、行銷詞、死圖、該換成圖表
的 ASCII 方塊字，以及吉他教材最常見的幾種硬錯誤（調弦寫錯、格數差一格、
移調方向寫反）。內容是否合理由對抗審查（多角度反駁）處理，不是這支。

    python scripts/audit_guitar.py
    python scripts/audit_guitar.py --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT = BASE_DIR / "content" / "guitar"

BANNED = ["完美", "極致", "神級", "終極", "震撼", "靈魂的洗禮", "歡迎來到",
          "眾所周知", "據說", "一般認為", "輕而易舉", "一次就上手"]
PLACEHOLDER = ["你的圖片連結", "example.com"]

# 吉他教材最常見的硬錯誤
HARD_ERRORS = [
    (r"標準調弦[^。]{0,20}(EADGCE|EADGBD|DADGBE)", "標準調弦寫錯（應為 EADGBE）"),
    (r"第\s*0\s*格(?!（空弦）|（開放|\s*（open)", "出現「第 0 格」但沒說明是空弦"),
    (r"移調夾[^。]{0,20}(降低|降[0-9一二三四五])", "移調夾寫成降調（夾 N 格是升 N 個半音）"),
    (r"封閉和弦[^。]{0,15}(不需要|不用)壓", "封閉和弦寫成不需要壓"),
    (r"六線譜[^。]{0,20}(由上往下|從下往上)(讀|看)[^。]{0,10}(第 ?1 ?弦|最粗)", "六線譜方向寫錯（第 1 線是最細的高音 E）"),
]

# 應該畫成圖的 ASCII 區塊
ASCII_BOX = re.compile(r"[┌┐└┘├┤┬┴┼─│═║╔╗╚╝]")


def audit(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    title = lines[0] if lines else ""
    body = "\n".join(lines[1:])
    issues: list[tuple[str, str]] = []

    if path.stem.isdigit() and not re.match(r"^# 第 \d+ 章｜", title):
        issues.append(("BLOCKER", "第一行不是「# 第 N 章｜標題」"))

    for word in BANNED:
        if word in body:
            issues.append(("WARN", f"出現行銷／空話詞：{word}"))

    for ph in PLACEHOLDER:
        if ph in text:
            issues.append(("BLOCKER", f"佔位圖連結：{ph}"))

    for ref in re.findall(r"!\[[^\]]*\]\((/[^)]+)\)", text):
        if not (BASE_DIR / ref.lstrip("/")).exists():
            issues.append(("BLOCKER", f"圖片不存在：{ref}"))

    for pat, msg in HARD_ERRORS:
        if re.search(pat, body):
            issues.append(("BLOCKER", msg))

    blocks = re.findall(r"```[a-z]*\n(.*?)```", body, re.S)
    ascii_blocks = [b for b in blocks if ASCII_BOX.search(b)]
    if ascii_blocks:
        issues.append(("WARN", f"{len(ascii_blocks)} 段 ASCII 圖（應改為圖片或表格）"))

    tables = len(re.findall(r"^\|.*\|$", body, re.M))
    images = len(re.findall(r"!\[", text))

    return {
        "file": path.name,
        "title": title,
        "chars": len(re.findall(r"[一-鿿]", body)),
        "images": images,
        "table_rows": tables,
        "ascii_blocks": len(ascii_blocks),
        "issues": issues,
    }


def main(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    files = [p for p in sorted(CONTENT.glob("*.md"), key=lambda p: int(p.stem) if p.stem.isdigit() else 999) if p.stem.isdigit()]
    rows = [audit(p) for p in files]

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0

    blockers = sum(1 for r in rows for i in r["issues"] if i[0] == "BLOCKER")
    warns = sum(1 for r in rows for i in r["issues"] if i[0] == "WARN")
    print(f"{len(rows)} 章｜BLOCKER {blockers}｜WARN {warns}")
    print(f"{'章':>4} {'字數':>5} {'圖':>3} {'表格列':>5} {'ASCII':>5}  問題")
    for r in rows:
        tag = ", ".join(sorted({i[0] for i in r["issues"]})) or "OK"
        print(f"{r['file']:>6} {r['chars']:>5} {r['images']:>3} {r['table_rows']:>5} {r['ascii_blocks']:>5}  {tag}")
        for level, msg in r["issues"]:
            print(f"        {level}: {msg}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
