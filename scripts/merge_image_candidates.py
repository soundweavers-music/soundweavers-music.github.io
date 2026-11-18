#!/usr/bin/env python3
"""Merge the per-chunk candidate caches into work/missing_images.json.

The resolver can be run in parallel slices (WMI_CACHE=work/cache_chunkN.json);
this collects every cache file back into one review file, keeping the
instruments in the same order as the content directory.
"""
import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
WORK = BASE_DIR / "work"
OUT_FILE = WORK / "missing_images.json"


def main():
    merged = {}
    for path in sorted(WORK.glob("cache_chunk*.json")) + [WORK / "image_candidates_cache.json"]:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            print(f"  ! unreadable {path.name}")
            continue
        merged.update(data)
        print(f"  {path.name}: {len(data)}")

    order = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        m = re.match(r"---\n(.*?)\n---\n", text, re.S)
        fm = m.group(1) if m else ""
        vals = [ln.split(":", 1)[1].strip() for ln in fm.splitlines() if ln.startswith("image:")]
        if not any(vals) and path.stem in merged:
            order.append(merged[path.stem])

    OUT_FILE.write_text(json.dumps(order, ensure_ascii=False, indent=1), encoding="utf-8")
    got = sum(1 for r in order if r["candidates"])
    print(f"\n{len(order)} records, {got} with candidates -> {OUT_FILE}")


if __name__ == "__main__":
    main()
