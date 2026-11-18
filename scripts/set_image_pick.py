#!/usr/bin/env python3
"""Record which candidate was chosen for an instrument.

    python scripts/set_image_pick.py sho:0 sipsi:1 ruan:0
    python scripts/set_image_pick.py sho:none     # reject all candidates
    python scripts/set_image_pick.py --list       # show current picks

`pick` is an index into that record's `candidates` list in
work/missing_images.json; apply_image_picks.py turns it into frontmatter.
"""
import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

IN_FILE = Path(__file__).resolve().parent.parent / "work" / "missing_images.json"


def main():
    records = json.loads(IN_FILE.read_text(encoding="utf-8"))
    by_slug = {r["slug"]: r for r in records}

    args = [a for a in sys.argv[1:] if a != "--list"]
    if not args or "--list" in sys.argv:
        picked = [r for r in records if r.get("pick") is not None]
        print(f"{len(picked)} picks set, {len(records) - len(picked)} undecided")
        for r in picked:
            name = r["candidates"][r["pick"]]["file"] if r.get("pick") is not None and r["candidates"] else "-"
            print(f"  {r['slug']:26s} #{r['pick']} {name[:60]}")
        return

    for arg in args:
        slug, _, value = arg.partition(":")
        rec = by_slug.get(slug)
        if not rec:
            print(f"  ! unknown slug {slug}")
            continue
        if value in ("none", "-", "null"):
            rec["pick"] = None
            print(f"  {slug}: cleared")
            continue
        try:
            idx = int(value)
            rec["candidates"][idx]
        except (ValueError, IndexError):
            print(f"  ! {slug}: bad index {value} (has {len(rec['candidates'])} candidates)")
            continue
        rec["pick"] = idx
        print(f"  {slug}: #{idx} {rec['candidates'][idx]['file'][:60]}")

    IN_FILE.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
