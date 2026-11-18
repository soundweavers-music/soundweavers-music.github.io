#!/usr/bin/env python3
"""Replace (or clear) the `image:` field of instruments after a visual audit.

`fetch_missing_images.py` + `apply_image_picks.py` only fill instruments that
have no image at all. The image audit found instruments whose picture was a
different thing entirely (an antelope for a kudu horn, a road sign for a
nagada), so this script overwrites the field from a reviewed pick list.

Input: a JSON object mapping slug -> candidate record from work/fix_candidates.json,
with an added `pick` key. `pick: null` removes the image line, which the site
renders as a plain placeholder.

Usage:
    python scripts/replace_instrument_images.py work/audit_fixes.json --dry-run
    python scripts/replace_instrument_images.py work/audit_fixes.json
"""
import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
sys.path.insert(0, str(BASE_DIR / "scripts"))

from apply_image_picks import normalize  # noqa: E402


def set_image(text, url):
    """Set, replace, or (url is None) remove the `image:` line."""
    m = re.match(r"(---\n)(.*?)(\n---\n)(.*)", text, re.S)
    if not m:
        return None
    lines = m.group(2).splitlines()
    idxs = [i for i, ln in enumerate(lines) if ln.startswith("image:")]

    if url is None:
        if not idxs:
            return None
        lines = [ln for i, ln in enumerate(lines) if i not in idxs]
    elif idxs:
        lines[idxs[0]] = f"image: {url}"
    else:
        keys = [ln.split(":", 1)[0] for ln in lines if ":" in ln]
        at = keys.index("youtube_ids") if "youtube_ids" in keys else len(lines)
        lines.insert(at, f"image: {url}")

    head = m.group(1) + "\n".join(lines) + m.group(3)
    out = head + m.group(4)
    return out if out != text else None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    spec_path = Path(sys.argv[1])
    dry = "--dry-run" in sys.argv
    spec = json.loads(spec_path.read_text(encoding="utf-8"))

    changed = unchanged = 0
    for slug, rec in spec.items():
        path = CONTENT_DIR / f"{slug}.md"
        if not path.exists():
            print(f"  ! missing file {slug}.md")
            continue
        pick = rec.get("pick")
        if pick is None:
            url = None
            label = "(blank)"
        else:
            cand = rec["candidates"][pick]
            url = normalize(cand["url"])
            label = cand["file"]
        new = set_image(path.read_text(encoding="utf-8"), url)
        if new is None:
            print(f"  = {slug}: unchanged")
            unchanged += 1
            continue
        if not dry:
            path.write_text(new, encoding="utf-8")
        changed += 1
        print(f"  {'~' if dry else '+'} {slug:24s} {label[:60]}")

    print(f"\n{'would change' if dry else 'changed'} {changed} files, {unchanged} unchanged")


if __name__ == "__main__":
    main()
