#!/usr/bin/env python3
"""List course sections that have no diagram.

目標是「每個小節至少一張圖」。這支只回答一件事：哪一個 `## x.y` 底下
一張圖都沒有。它不管圖畫得好不好，也不管有沒有 ASCII 區塊 —— 那是
audit_guitar.py / audit_ukulele.py 的事。

    python scripts/audit_figure_coverage.py            # 兩套課程都看
    python scripts/audit_figure_coverage.py guitar     # 只看吉他
    python scripts/audit_figure_coverage.py --md       # 輸出 markdown 待辦清單
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
COURSES = {"guitar": BASE_DIR / "content" / "guitar", "ukulele": BASE_DIR / "content" / "ukulele"}
H2 = re.compile(r"^##\s+(\S.*)$")
IMAGE = re.compile(r"!\[[^\]]*\]\(")


def sections(path: Path) -> list[dict]:
    """把一章切成若干小節，記錄標題、行號、是否有圖。"""
    lines = path.read_text(encoding="utf-8").splitlines()
    out, cur = [], None
    for i, ln in enumerate(lines):
        m = H2.match(ln)
        if m:
            if cur:
                out.append(cur)
            cur = {"title": m.group(1).strip(), "line": i + 1, "images": 0, "chars": 0}
            continue
        if cur is None:
            continue
        if IMAGE.search(ln):
            cur["images"] += 1
        cur["chars"] += len(re.findall(r"[一-鿿]", ln))
    if cur:
        out.append(cur)
    # 「本章重點檢查表」這類收尾小節不需要圖
    return [s for s in out if not re.search(r"檢查表|檢核|重點整理", s["title"])]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("course", nargs="?", choices=sorted(COURSES), help="只看某一套課程")
    ap.add_argument("--md", action="store_true", help="輸出 markdown 待辦清單")
    args = ap.parse_args(argv)

    total = missing = 0
    report = {}
    for slug, folder in COURSES.items():
        if args.course and slug != args.course:
            continue
        rows = []
        paths = [p for p in folder.glob("*.md") if p.stem.isdigit()]
        for p in sorted(paths, key=lambda x: int(x.stem)):
            for s in sections(p):
                total += 1
                if s["images"] == 0:
                    missing += 1
                    rows.append((int(p.stem), s))
        report[slug] = rows
        if not args.md:
            print(f"== {slug}: {len(rows)} 個小節沒有圖")
            for num, s in rows:
                print(f"   {num:2d}.md:{s['line']:<4} {s['title'][:44]:46s} {s['chars']:4d} 字")

    if args.md:
        print("# 缺圖的小節\n")
        for slug, rows in report.items():
            print(f"## {slug}（{len(rows)}）\n")
            for num, s in rows:
                print(f"- [ ] `{num}.md` §{s['title']}（{s['chars']} 字）")
            print()
    else:
        print(f"\n合計 {total} 個小節，{missing} 個沒有圖（{missing / total:.0%}）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
