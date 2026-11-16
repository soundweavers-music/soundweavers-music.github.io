#!/usr/bin/env python3
"""Drop frontmatter images that are not photographs of the instrument.

The original image fetcher fell back to "first Commons file on the article",
which for poorly-illustrated instruments is often a book plate (a `.pdf`
scan), a coat of arms, or a statue. Those are worse than showing the neutral
placeholder the card template already provides.

This removes the `image:` value (leaving the key empty) for URLs whose filename
matches a non-photographic pattern. Each removal is printed with the reason.

Usage: python scripts/cleanup_bad_images.py [--dry-run]
"""
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
BACKUP_DIR = BASE_DIR / "work" / "backup_images"

# (pattern, reason) — matched against the URL filename
BAD = [
    (r"\.pdf(\.jpg)?$", "書頁／PDF 掃描，不是樂器照片"),
    (r"page1-\d+px", "PDF 書頁縮圖"),
    (r"Arms_of|_arms_|coat_of_arms|coat-of-arms", "紋章"),
    (r"/(?:[A-Z][a-z]+_)?[Ff]lag_of|_flag_", "旗幟"),
    (r"(?:^|/)Flag", "旗幟"),
    (r"(?:^|/)Emblem", "徽章"),
    (r"(?:^|/)Signature", "簽名檔"),
    (r"(?:IA_|_IA)", "Internet Archive 書頁掃描"),
    (r"encyclopedia|_courant_|_Verbs|英國史|盛京時|歴史|歷史", "書籍／報紙掃描"),
    (r"statue|Statue", "雕像而非樂器本體"),
]


def reason(url: str) -> str:
    name = url.rsplit("/", 1)[-1]
    for pat, why in BAD:
        if re.search(pat, url):
            return why
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    removed = 0
    for path in sorted(CONTENT_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        head, sep, body = text.partition("\n---\n")
        if not sep:
            continue
        m = re.search(r"^image:[ \t]*(.*)$", head, re.M)
        if not m or not m.group(1).strip():
            continue
        url = m.group(1).strip()
        why = reason(url)
        if not why:
            continue
        removed += 1
        print(f"  {path.stem}: {why}")
        new_head = head[:m.start()] + "image: " + head[m.end():]
        if not args.dry_run:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, BACKUP_DIR / path.name)
            path.write_text(new_head + sep + body, encoding="utf-8")

    print(("DRY RUN " if args.dry_run else "") + f"removed {removed} bad images")


if __name__ == "__main__":
    main()
