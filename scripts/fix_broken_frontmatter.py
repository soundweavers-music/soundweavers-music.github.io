#!/usr/bin/env python3
"""Repair frontmatter fields the import left broken.

Problems this fixes (all verified against the repo, not guessed):
  source_url   empty or truncated with a literal "..." — rebuilt from the slug
  title_zh     two instruments sharing one Chinese name — renamed from the
               zhwiki title / Wikidata zh label captured in work/verify

Each fix is explicit and listed below; nothing is inferred at runtime.

Usage: python scripts/fix_broken_frontmatter.py [--dry-run]
"""
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
BACKUP_DIR = BASE_DIR / "work" / "backup_frontmatter"
SITE = "https://soundweavers-music.github.io/instruments"

# slug -> {field: value}. Reasons in comments; all sourced from work/verify/.
FIXES = {
    # source_url was truncated to "https://…/extended-range-classical-gui..."
    "extended-range-classical-guitar": {"source_url": f"{SITE}/extended-range-classical-guitar/"},
    # Three entries collided on 手鐘. They are two instruments plus one
    # duplicate: handbell and handbells are the same instrument (English plural
    # is an alternate slug), handchime is a different one (tuned tubes).
    #   handbell  — the reference entry, named 手鐘 (zhwiki/Wikidata both say so)
    #   handbells — duplicate; keeps a distinct name + alias note, per the
    #               "keep duplicates, annotate" rule
    #   handchime — 棒鐘, the common Taiwanese name for chime tubes
    "handbell": {"source_url": f"{SITE}/handbell/", "title_zh": "手鐘"},
    "handbells": {"title_zh": "手鈴（複數形，與 Handbell 同器）"},
    "handchime": {"source_url": f"{SITE}/handchime/", "title_zh": "棒鐘"},
    "qinqin": {"source_url": f"{SITE}/qinqin/"},
}


def set_key(fm: list[str], key: str, value: str) -> list[str]:
    pat = re.compile(rf"^{re.escape(key)}:")
    out, done = [], False
    for line in fm:
        if pat.match(line):
            if not done:
                out.append(f"{key}: {value}".rstrip())
                done = True
            continue
        out.append(line)
    if not done:
        out.append(f"{key}: {value}".rstrip())
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    changed = 0
    for slug, fields in sorted(FIXES.items()):
        path = CONTENT_DIR / f"{slug}.md"
        if not path.exists():
            print(f"  ! missing {slug}")
            continue
        text = path.read_text(encoding="utf-8")
        head, sep, body = text.partition("\n---\n")
        fm = head.lstrip("-\n").splitlines()
        applied = []
        for key, value in fields.items():
            fm = set_key(fm, key, value)
            applied.append(key)
        new_text = "---\n" + "\n".join(fm) + "\n---\n" + body
        if new_text == text:
            continue
        changed += 1
        print(f"  {slug}: {', '.join(applied)}")
        if not args.dry_run:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, BACKUP_DIR / path.name)
            path.write_text(new_text, encoding="utf-8")
    print(("DRY RUN " if args.dry_run else "") + f"fixed {changed} files")


if __name__ == "__main__":
    main()
