#!/usr/bin/env python3
"""Remove legacy ### sub-sections that survived the section rewrite.

The old template put a '### 代表性作品' block inside ## 聆聽示範. Where the new
聆聽示範 text replaced the heading but not the sub-block, the old (often
fabricated) repertoire list is still published. This strips any '###' block
that sits inside a section whose text was rewritten — i.e. a '###' heading
whose following text predates the rewrite.

Safe by construction: it only deletes a '### <name>' block together with its
body when that sub-heading name is on the known-legacy list and the block's
first sentence is not present in the rewritten proposal.

Usage: python scripts/cleanup_legacy_subsections.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
REWRITE_DIR = BASE_DIR / "work" / "rewrite"
BACKUP_DIR = BASE_DIR / "work" / "backup"

LEGACY_SUBHEADS = {"代表性作品", "代表作品", "著名作品", "經典曲目"}


def strip_legacy(body: str) -> tuple[str, list[str]]:
    removed = []
    pattern = re.compile(r"^\s*###\s*(.+?)\s*\n(.*?)(?=^#{2,3} |\Z)", re.S | re.M)
    out = body
    for m in list(pattern.finditer(body)):
        name = m.group(1).strip()
        if name not in LEGACY_SUBHEADS:
            continue
        removed.append(name)
        out = out.replace(m.group(0), "")
    return out, removed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cleaned, skipped = 0, 0
    for md in sorted(CONTENT_DIR.glob("*.md")):
        rw_path = REWRITE_DIR / f"{md.stem}.json"
        if not rw_path.exists():
            continue
        rw = json.loads(rw_path.read_text(encoding="utf-8"))
        if rw.get("status") != "ok":
            continue
        text = md.read_text(encoding="utf-8")
        if "###" not in text:
            continue
        head, sep, body = text.partition("\n---\n")
        new_body, removed = strip_legacy(body)
        if not removed:
            skipped += 1
            continue
        cleaned += 1
        print(f"  {md.stem}: removed {removed}")
        if not args.dry_run:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(md, BACKUP_DIR / md.name)
            md.write_text(head + sep + new_body, encoding="utf-8")
    print(("DRY RUN " if args.dry_run else "") + f"cleaned {cleaned}, untouched {skipped}")


if __name__ == "__main__":
    main()
