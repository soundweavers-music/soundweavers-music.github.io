#!/usr/bin/env python3
"""Find top YouTube video IDs for each instrument and store in frontmatter.

Uses yt-dlp to search YouTube for the most-viewed demo videos for each
instrument. Stores IDs as 'youtube_ids' frontmatter field.
Resumable via work/youtube_cache.json.
"""
import io
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_FILE = BASE_DIR / "work" / "youtube_cache.json"
RATE_LIMIT = 2.5

_last_call = 0.0


def rate_wait():
    global _last_call
    elapsed = time.time() - _last_call
    if elapsed < RATE_LIMIT:
        time.sleep(RATE_LIMIT - elapsed)
    _last_call = time.time()


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    data = {}
    for line in parts[1].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            data[k.strip()] = v.strip()
    return data, parts[2]


def search_youtube(query, limit=10):
    """Use yt-dlp to search YouTube and return top-2 video IDs by view count."""
    rate_wait()
    try:
        result = subprocess.run(
            [
                "yt-dlp",
                f"ytsearch{limit}:{query}",
                "--print", "%(id)s\t%(view_count)s",
                "--no-download",
                "--quiet",
                "--no-warnings",
                "--socket-timeout", "15",
            ],
            capture_output=True, text=True, timeout=30, encoding="utf-8"
        )
        videos = []
        for line in result.stdout.splitlines():
            parts = line.strip().split("\t")
            if len(parts) == 2:
                vid_id, view_str = parts
                if re.match(r"^[A-Za-z0-9_\-]{11}$", vid_id):
                    try:
                        views = int(view_str) if view_str != "NA" else 0
                    except ValueError:
                        views = 0
                    videos.append((vid_id, views))
        videos.sort(key=lambda x: x[1], reverse=True)
        return [v[0] for v in videos[:2]]
    except Exception as exc:
        print(f"  error: {exc}", file=sys.stderr)
        return []


def set_frontmatter_field(text, field, value):
    """Set a frontmatter field, inserting before the closing --- if absent."""
    if re.search(rf"^{field}:\s*", text, re.MULTILINE):
        return re.sub(rf"^{field}:.*$", f"{field}: {value}", text, count=1, flags=re.MULTILINE)
    # Insert before the closing --- (first \n---\n after the opening ---)
    before, sep, after = text.partition("\n---\n")
    if sep:
        return before + f"\n{field}: {value}" + sep + after
    return text


def build_query(title, orig, category):
    """Build best search query for instrument demo videos."""
    if orig and not re.search(r"[一-鿿]", orig):
        base = orig
    else:
        base = title
    return f"{base} musical instrument"


def main():
    cache = load_cache()
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} md files")

    found = skipped = not_found = 0

    for i, path in enumerate(files, 1):
        slug = path.stem
        text = path.read_text(encoding="utf-8")
        meta, _ = parse_frontmatter(text)

        if meta.get("youtube_ids", "").strip():
            skipped += 1
            continue

        title = meta.get("title", slug)
        orig = meta.get("original_name", "")
        category = meta.get("category", "")

        print(f"[{i}/{len(files)}] {slug}", end=" ", flush=True)

        if slug in cache:
            ids = cache[slug]
        else:
            query = build_query(title, orig, category)
            ids = search_youtube(query)
            cache[slug] = ids
            save_cache(cache)

        if ids:
            ids_str = " ".join(ids)
            new_text = set_frontmatter_field(text, "youtube_ids", ids_str)
            if new_text != text:
                path.write_text(new_text, encoding="utf-8")
            found += 1
            print(f"✓ {ids}")
        else:
            not_found += 1
            print("✗ not found")

        if i % 50 == 0:
            save_cache(cache)

    save_cache(cache)
    print(f"\nDone. Found: {found}, Not found: {not_found}, Skipped (already set): {skipped}")


if __name__ == "__main__":
    main()
