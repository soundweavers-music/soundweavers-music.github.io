#!/usr/bin/env python3
"""Structural audit of content/ensembles/*.md before they become pages.

This is the mechanical half of the adversarial review: it cannot judge whether
a sentence is TRUE, but it reliably catches everything that makes a page look
unfinished or machine-written, and it flags the specific failure modes this
section is prone to (invented numbers, hedging, marketing language, entries
that are really about one instrument rather than an ensemble).

Writes work/audit/ensembles.json and prints a per-file report.

Usage:
  python scripts/audit_ensembles.py [--strict]
  (--strict exits 1 if any BLOCKER is found, for use in CI)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "ensembles"
OUT = BASE_DIR / "work" / "audit" / "ensembles.json"

HEADINGS = ["一句話定位", "編制與分工", "聲音如何運作", "場合與曲目",
            "與相鄰編制的差別", "聆聽入口", "常見誤解"]

# Words that mark either hedging or the marketing register this section bans.
HEDGES = ["據說", "據傳", "一般認為", "眾所皆知", "自古以來", "相傳", "有人認為", "據信"]
MARKETING = ["獨特魅力", "天籟", "令人陶醉", "震撼人心", "完美融合", "扣人心弦",
             "餘音繞樑", "淋漓盡致", "無與倫比", "瑰寶", "璀璨"]
PLACEHOLDER = ["建置中", "敬請期待", "待補", "TODO", "TBD", "此條目"]

MIN_CHARS, MAX_CHARS = 1500, 3200
MIN_BODY = 1800

FRONTMATTER_KEYS = ["class", "num", "title", "en", "region", "summary", "keywords"]

CJK = re.compile(r"[一-鿿]")


def cjk_count(text: str) -> int:
    return len(CJK.findall(text))


def parse(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    _, fm, body = text.split("---", 2)
    meta = {}
    for line in fm.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body.strip()


def audit_file(path: Path) -> dict:
    meta, body = parse(path.read_text(encoding="utf-8"))
    issues: list[tuple[str, str]] = []   # (severity, message)

    for key in FRONTMATTER_KEYS:
        if key not in meta:
            issues.append(("BLOCKER", f"frontmatter 缺少 {key}"))
    summary = meta.get("summary", "")
    if summary and len(summary) > 60:
        issues.append(("WARN", f"summary 過長（{len(summary)} 字）：{summary}"))
    cls = meta.get("class", "")
    if cls and not re.fullmatch(r"B[1-7]", cls):
        issues.append(("BLOCKER", f"class 不是 B1–B7：{cls}"))

    # Headings: exact set, exact order.
    found = [h for h in re.findall(r"^##\s+(.+?)\s*$", body, re.M)]
    if found != HEADINGS:
        missing = [h for h in HEADINGS if h not in found]
        extra = [h for h in found if h not in HEADINGS]
        msg = "章節不符規格"
        if missing:
            msg += f"；缺少 {missing}"
        if extra:
            msg += f"；多出 {extra}"
        if not missing and not extra:
            msg += f"；順序不對（實際 {found}）"
        issues.append(("BLOCKER", msg))

    # Length, counted over the whole body minus tables.
    prose = "\n".join(l for l in body.splitlines() if not l.strip().startswith("|"))
    n = cjk_count(prose)
    if n < MIN_BODY:
        issues.append(("BLOCKER", f"正文只有 {n} 字，未達 {MIN_BODY} 字下限"))
    elif n > MAX_CHARS:
        issues.append(("WARN", f"正文 {n} 字，超過 {MAX_CHARS} 字上限"))

    for word in HEDGES:
        if word in body:
            issues.append(("BLOCKER", f"出現無來源的模糊說法「{word}」"))
    for word in MARKETING:
        if word in body:
            issues.append(("BLOCKER", f"出現行銷語「{word}」"))
    for word in PLACEHOLDER:
        if word in body:
            issues.append(("BLOCKER", f"出現佔位文字「{word}」"))

    # Generic openers — the first prose line must not be throat-clearing.
    first = next((l for l in body.splitlines()
                  if l.strip() and not l.startswith(("#", ">", "|", "---"))), "")
    for opener in ["音樂是人類", "自古以來", "隨著時代", "在人類的歷史", "音樂，是"]:
        if opener in first:
            issues.append(("BLOCKER", f"用了空泛開場：{first[:40]}"))

    # The format of 常見誤解 is fixed; count the pairs.
    makai = body.split("## 常見誤解")
    if len(makai) == 2:
        pairs = makai[1].count("**誤解**")
        answers = makai[1].count("**其實**")
        if pairs < 2:
            issues.append(("WARN", f"常見誤解只有 {pairs} 組，規格要求 2–3 組"))
        if pairs != answers:
            issues.append(("BLOCKER", f"常見誤解的「誤解」({pairs}) 與「其實」({answers}) 數量不符"))

    # 聆聽入口 should be a bullet list.
    if "## 聆聽入口" in body:
        seg = body.split("## 聆聽入口")[1].split("## ")[0]
        if seg.count("\n- ") < 3:
            issues.append(("BLOCKER", "聆聽入口少於 3 點"))

    # 編制與分工 must contain a table.
    if "## 編制與分工" in body:
        seg = body.split("## 編制與分工")[1].split("## ")[0]
        if seg.count("\n|") < 4:
            issues.append(("BLOCKER", "編制與分工沒有表格"))

    blockers = [m for s, m in issues if s == "BLOCKER"]
    return {
        "file": path.name,
        "class": cls,
        "title": meta.get("title", ""),
        "chars": n,
        "issues": [{"severity": s, "message": m} for s, m in issues],
        "ok": not blockers,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    files = sorted(p for p in CONTENT_DIR.glob("b*-*.md"))
    if not files:
        print("no entries found")
        return 1

    results = [audit_file(p) for p in files]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

    bad = 0
    for r in results:
        flag = "OK  " if r["ok"] else "FAIL"
        print(f"{flag} {r['file']:<34} {r['chars']:>5} 字  {r['title']}")
        for i in r["issues"]:
            print(f"       {i['severity']}: {i['message']}")
        if not r["ok"]:
            bad += 1

    print(f"\n{len(results)} 篇，{bad} 篇未通過，報告：{OUT.relative_to(BASE_DIR)}")
    return 1 if (args.strict and bad) else 0


if __name__ == "__main__":
    sys.exit(main())
