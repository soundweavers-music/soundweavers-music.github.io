#!/usr/bin/env python3
"""Write reviewed image picks from work/missing_images.json into content/.

Only records whose `pick` is set are applied — `pick` is the index into that
record's `candidates` list, chosen after looking at work/sheets/*.png. Records
with `pick: null` are left alone.

The `image:` field is placed the way the rest of the corpus has it: right
before `youtube_ids:` (or at the end of the frontmatter when that field is
absent). An existing empty `image:` line is filled in place rather than
duplicated.

Usage:
    python scripts/apply_image_picks.py --dry-run
    python scripts/apply_image_picks.py
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
IN_FILE = BASE_DIR / "work" / "missing_images.json"
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}


def normalize(url):
    """Drop tracking params and prefer the main CDN host.

    Only `utm_*` parameters are removed: `Special:FilePath` URLs carry a
    meaningful `?width=`, and losing it makes the browser pull the full-size
    TIFF.
    """
    base, _, query = url.partition("?")
    keep = [p for p in query.split("&") if p and not p.startswith("utm_")]
    url = base + (("?" + "&".join(keep)) if keep else "")
    url = re.sub(r"^https://thumb\.wikimedia\.org/", "https://upload.wikimedia.org/", url)
    return url


def apply_image(text, url):
    """Return text with `image: url` set in the frontmatter, or None if unchanged."""
    m = re.match(r"(---\n)(.*?)(\n---\n)(.*)", text, re.S)
    if not m:
        return None
    lines = m.group(2).splitlines()
    keys = [ln.split(":", 1)[0] for ln in lines if ":" in ln]

    idxs = [i for i, ln in enumerate(lines) if ln.startswith("image:")]
    for i in idxs:
        if lines[i].split(":", 1)[1].strip():
            return None  # already has an image
    if idxs:
        lines[idxs[0]] = f"image: {url}"
    elif "youtube_ids" in keys:
        at = keys.index("youtube_ids")
        lines.insert(at, f"image: {url}")
    else:
        lines.append(f"image: {url}")

    head = m.group(1) + "\n".join(lines) + m.group(3)
    return head + m.group(4)


def main():
    dry = "--dry-run" in sys.argv
    records = json.loads(IN_FILE.read_text(encoding="utf-8"))
    picked = [r for r in records if r.get("pick") is not None]
    print(f"{len(picked)} records have a pick (of {len(records)})")

    changed = skipped = 0
    written = []
    for rec in picked:
        path = CONTENT_DIR / f"{rec['slug']}.md"
        if not path.exists():
            print(f"  ! missing file {path.name}")
            continue
        try:
            cand = rec["candidates"][rec["pick"]]
        except (IndexError, TypeError):
            print(f"  ! {rec['slug']}: pick {rec['pick']} out of range")
            continue
        url = normalize(cand["url"])
        text = path.read_text(encoding="utf-8")
        new = apply_image(text, url)
        if new is None:
            print(f"  = {rec['slug']}: already has an image, skipped")
            skipped += 1
            continue
        if not dry:
            path.write_text(new, encoding="utf-8")
        changed += 1
        written.append((rec["slug"], url))
        print(f"  + {rec['slug']:26s} {cand['file'][:60]}  [{cand['via']}]")

    action = "would change" if dry else "wrote"
    print(f"\n{action} {changed} files, {skipped} already had images")

    if "--verify" in sys.argv and written:
        print("\nchecking the URLs resolve to images ...")
        bad = 0
        for slug, url in written:
            try:
                r = requests.get(url, headers={"User-Agent": HEADERS["User-Agent"]}, timeout=(5, 20), stream=True)
                ctype = r.headers.get("content-type", "")
                if r.status_code != 200 or not ctype.startswith("image/"):
                    bad += 1
                    print(f"  ✗ {slug}: HTTP {r.status_code} {ctype}")
                r.close()
            except Exception as exc:
                bad += 1
                print(f"  ✗ {slug}: {exc}")
            time.sleep(0.2)
        print(f"{len(written) - bad}/{len(written)} image URLs OK")


if __name__ == "__main__":
    main()
