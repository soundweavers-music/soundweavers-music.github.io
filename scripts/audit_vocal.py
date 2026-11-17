#!/usr/bin/env python3
"""Structural audit of content/vocal/*.md before it becomes pages.

Mechanical half of the review: it cannot tell whether a claim is true, but it
catches the things that make a lesson look unfinished or machine-written, and
the specific failure modes voice-training writing invites (anatomy written
backwards, invented percentages, marketing adjectives, dead image links).

Usage:
  python scripts/audit_vocal.py [--strict]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT = BASE_DIR / "content" / "vocal"
OUT = BASE_DIR / "work" / "audit" / "vocal.json"

SECTIONS = ["先講結論", "常見誤解", "原理：為什麼會這樣", "現在就做", "練完之後"]
MIN_CHARS, MAX_CHARS = 1000, 2200

BANNED = ["完美", "極致", "神級", "終極", "震撼", "據說", "一般認為", "眾所周知",
          "靈魂的洗禮", "歡迎來到", "這堂 45 分鐘", "在我們共同走過"]
PLACEHOLDER = ["你的圖片連結", "example.com"]

# Anatomy statements that are wrong if they appear in this direction.
BAD_ANATOMY = [
    (r"甲杓肌[^。]{0,30}(拉長|變薄)", "甲杓肌被寫成拉長變薄（應為變厚變短）"),
    (r"環甲肌[^。]{0,30}(變厚|變短|放鬆聲帶)", "環甲肌被寫成變厚變短（應為拉長變薄）"),
    (r"橫膈膜[^。]{0,20}(往上|向上)(推|頂)", "橫膈膜被寫成往上頂（收縮時是往下）"),
]

CJK = re.compile(r"[一-鿿]")


def cjk(s: str) -> int:
    return len(CJK.findall(s))


def audit(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    title = lines[0] if lines else ""
    body = "\n".join(lines[1:])
    issues: list[tuple[str, str]] = []

    if not re.match(r"^# \[歌唱教學\] (初階|進階) 第 \d+ 章：", title):
        issues.append(("BLOCKER", "第一行不是規定格式：# [歌唱教學] 初階/進階 第 N 章：標題"))

    found = re.findall(r"^##\s+(.+?)\s*$", body, re.M)
    if found != SECTIONS:
        missing = [s for s in SECTIONS if s not in found]
        extra = [s for s in found if s not in SECTIONS]
        msg = "章節不符規格"
        if missing:
            msg += f"；缺少 {missing}"
        if extra:
            msg += f"；多出 {extra}"
        if not missing and not extra:
            msg += f"；順序不對（實際 {found}）"
        issues.append(("BLOCKER", msg))

    n = cjk(body)
    if n < MIN_CHARS:
        issues.append(("BLOCKER", f"正文只有 {n} 字，未達 {MIN_CHARS}"))
    elif n > MAX_CHARS:
        issues.append(("WARN", f"正文 {n} 字，超過 {MAX_CHARS}"))

    for w in BANNED:
        if w in body:
            issues.append(("BLOCKER", f"出現禁用語「{w}」"))
    for w in PLACEHOLDER:
        if w in body:
            issues.append(("BLOCKER", f"仍有佔位圖片「{w}」"))
    for pat, msg in BAD_ANATOMY:
        if re.search(pat, body):
            issues.append(("BLOCKER", msg))

    # 「現在就做」must contain a numbered list, or it is not executable.
    if "## 現在就做" in body:
        seg = body.split("## 現在就做")[1].split("\n## ")[0]
        if len(re.findall(r"^\s*\d+\.", seg, re.M)) < 2:
            issues.append(("BLOCKER", "「現在就做」缺少可執行的編號步驟"))

    # SVG references must point at an existing file.
    for src in re.findall(r"!\[[^\]]*\]\((/assets/vocal/[^)]+)\)", body):
        if not (BASE_DIR / src.lstrip("/")).exists():
            issues.append(("BLOCKER", f"示意圖不存在：{src}"))

    blockers = [m for s, m in issues if s == "BLOCKER"]
    return {
        "file": path.name,
        "title": title,
        "chars": n,
        "issues": [{"severity": s, "message": m} for s, m in issues],
        "ok": not blockers,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    files = sorted(CONTENT.glob("vocal_ch*.md"),
                   key=lambda p: int(re.search(r"\d+", p.name).group()))
    results = [audit(p) for p in files]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

    bad = 0
    for r in results:
        flag = "OK  " if r["ok"] else "FAIL"
        print(f"{flag} {r['file']:<14}{r['chars']:>6} 字")
        for i in r["issues"]:
            print(f"       {i['severity']}: {i['message']}")
        if not r["ok"]:
            bad += 1
    print(f"\n{len(results)} 章，{bad} 章未通過，報告：{OUT.relative_to(BASE_DIR)}")
    return 1 if (args.strict and bad) else 0


if __name__ == "__main__":
    sys.exit(main())
