#!/usr/bin/env python3
"""Mechanical audit of content/ukulele/*.md.

The cheap half of the review: it cannot judge whether a sentence is true, but it
catches the failure modes ukulele teaching writing invites — string order and
tuning written backwards, inch/cm conversions that don't agree, invented
precision, marketing adjectives, dead image links, chapter numbers that don't
match the file.

Usage:
  python scripts/audit_ukulele.py [--strict]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT = BASE_DIR / "content" / "ukulele"
OUT = BASE_DIR / "work" / "audit" / "ukulele.json"

MIN_CHARS, MAX_CHARS = 2000, 14000

BANNED = ["完美", "極致", "終極", "震撼", "據說", "一般認為", "眾所周知",
          "靈魂的洗禮", "歡迎來到", "神級"]

# 明顯寫反的樂器事實（命中就是錯，不需要判斷語氣）
BAD_FACTS = [
    (r"第\s*1\s*弦[^。\n]{0,12}(?:是|為|＝|=)\s*(?:G|C)", "第 1 弦是 A，不是 G 或 C"),
    (r"第\s*4\s*弦[^。\n]{0,12}(?:是|為|＝|=)\s*(?:A|E)", "第 4 弦是 G（High-G 或 Low-G），不是 A 或 E"),
    (r"High[-\s]?G[^。\n]{0,12}(?:等於|就是|指的是)\s*第\s*3\s*弦", "High-G 講的是第 4 弦，不是第 3 弦"),
    (r"[Bb]aritone[^。\n]{0,20}G\s*[-－]\s*C\s*[-－]\s*E\s*[-－]\s*A", "Baritone 是 D-G-B-E，不是 G-C-E-A"),
    (r"soprano[^。\n]{0,20}23\s*吋", "Soprano 是 21 吋，23 吋是 Concert"),
    (r"tenor[^。\n]{0,20}21\s*吋", "Tenor 是 26 吋"),
]

# 吋 → 公分 的合理範圍（含四捨五入誤差）
INCH_CM = {21: (52, 55), 23: (57, 60), 26: (65, 68), 30: (75, 78)}

CJK = re.compile(r"[㐀-鿿]")


def audit(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    issues: list[dict] = []
    n = len(text)

    # 有圖的章節字數會比較少（圖取代了一段文字），門檻跟著放寬
    has_img = "![" in text
    floor = MIN_CHARS if not has_img else 1000
    if n < floor:
        issues.append({"kind": "short", "quote": "", "why": f"只有 {n} 字，可能沒寫完"})
    if n > MAX_CHARS:
        issues.append({"kind": "long", "quote": "", "why": f"{n} 字，超過 {MAX_CHARS}"})

    stem = path.stem
    if stem.isdigit():
        m = re.match(r"#\s*第\s*(\d+)\s*章", text)
        if not m:
            issues.append({"kind": "numbering", "quote": text.splitlines()[0],
                           "why": "第一行不是「# 第 N 章」"})
        elif int(m.group(1)) != int(stem):
            issues.append({"kind": "numbering", "quote": m.group(0),
                           "why": f"檔名是 {stem}.md，標題卻寫第 {m.group(1)} 章"})

    for word in BANNED:
        for m in re.finditer(re.escape(word), text):
            line = text[text.rfind("\n", 0, m.start()) + 1: text.find("\n", m.start())]
            issues.append({"kind": "tone", "quote": line.strip()[:40], "why": f"行銷形容詞「{word}」"})

    for pat, why in BAD_FACTS:
        for m in re.finditer(pat, text):
            line = text[text.rfind("\n", 0, m.start()) + 1: text.find("\n", m.start())]
            # 「由第 4 弦到第 1 弦是 G-C-E-A」「第 4 弦比第 3 弦高八度」都是正確說法
            if re.search(r"(到|至)第\s*1\s*弦|由第|比第|高八度", line):
                continue
            issues.append({"kind": "fact", "quote": line.strip()[:60], "why": why})

    # 吋↔公分 的配對
    for m in re.finditer(r"(\d{2})\s*吋[^。\n]{0,12}?(\d{2,3})\s*(?:cm|公分|厘米)", text):
        inch, cm = int(m.group(1)), int(m.group(2))
        if inch in INCH_CM:
            lo, hi = INCH_CM[inch]
            if not (lo <= cm <= hi):
                issues.append({"kind": "unit", "quote": m.group(0),
                               "why": f"{inch} 吋約 {inch * 2.54:.0f} 公分，不是 {cm}"})

    # 圖片連結：相對路徑是否存在
    for m in re.finditer(r"!\[[^\]]*\]\(([^)]+)\)", text):
        src = m.group(1).split()[0]
        if src.startswith(("http://", "https://", "data:")):
            continue
        target = (path.parent / src).resolve()
        if not target.exists():
            issues.append({"kind": "image", "quote": m.group(0)[:60], "why": "圖片檔案不存在"})

    # 「90% 的人…」這種百分比是宣稱，不是量測
    for m in re.finditer(r"(\d{2})%\s*的", text):
        line = text[text.rfind("\n", 0, m.start()) + 1: text.find("\n", m.start())]
        issues.append({"kind": "claim", "quote": line.strip()[:40],
                       "why": f"未經量測的百分比「{m.group(0).strip()}」"})

    # 章末應有檢查表／重點整理
    if stem.isdigit() and not re.search(r"本章(重點|檢查表|回顧)", text):
        issues.append({"kind": "structure", "quote": "", "why": "缺少章末重點／檢查表"})

    return issues


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    paths = sorted([p for p in CONTENT.glob("*.md") if not p.name.startswith("_")],
                   key=lambda p: (0, 0) if p.stem == "前言" else
                   (1, int(re.search(r"\d+", p.name).group())) if re.search(r"\d+", p.name) else (2, 0))
    report = {}
    total = 0
    for p in paths:
        issues = audit(p)
        report[p.name] = issues
        total += len(issues)
        if issues:
            print(f"!! {p.name:14s} {len(issues)} 項")
            for i in issues[:6]:
                print(f"     [{i['kind']}] {i['why']}  {i['quote'][:40]}")
        else:
            print(f".. {p.name:14s}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n合計 {len(paths)} 篇、{total} 項；報告在 {OUT}")
    return 1 if (args.strict and total) else 0


if __name__ == "__main__":
    sys.exit(main())
