#!/usr/bin/env python3
"""Fetch missing instrument images from Wikipedia/Wikimedia Commons.

Strategy:
1. Try Wikipedia pageimages API (most reliable, same as fetch_wikipedia.py but for missed ones)
2. Try Wikimedia Commons search via API
Resumable via work/images_cache.json.
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_FILE = BASE_DIR / "work" / "images_cache.json"
RATE_LIMIT = 0.8
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}
THUMB_WIDTH = 500

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


def get_wikipedia_image(en_title):
    """Get main image URL from Wikipedia pageimages API."""
    rate_wait()
    params = {
        "action": "query",
        "titles": en_title,
        "prop": "pageimages",
        "pithumbsize": THUMB_WIDTH,
        "format": "json",
        "redirects": "1",
    }
    try:
        resp = requests.get("https://en.wikipedia.org/w/api.php", params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for page in data.get("query", {}).get("pages", {}).values():
            thumb = page.get("thumbnail", {})
            if thumb.get("source"):
                return thumb["source"]
    except Exception:
        pass
    return None


def search_wikimedia_commons(query):
    """Search Wikimedia Commons for an image by query."""
    rate_wait()
    params = {
        "action": "query",
        "list": "search",
        "srnamespace": "6",
        "srsearch": query,
        "srlimit": "5",
        "format": "json",
    }
    try:
        resp = requests.get("https://commons.wikimedia.org/w/api.php", params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("query", {}).get("search", [])
        if not results:
            return None
        # Get the first result's image URL
        title = results[0].get("title", "")
        if not title:
            return None
        # Fetch the actual thumbnail URL
        rate_wait()
        params2 = {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": THUMB_WIDTH,
            "format": "json",
        }
        resp2 = requests.get("https://commons.wikimedia.org/w/api.php", params=params2, headers=HEADERS, timeout=15)
        resp2.raise_for_status()
        data2 = resp2.json()
        for page in data2.get("query", {}).get("pages", {}).values():
            ii = page.get("imageinfo", [{}])[0]
            url = ii.get("thumburl") or ii.get("url", "")
            if url.startswith("https://"):
                return url
    except Exception:
        pass
    return None


def set_frontmatter_field(text, field, value):
    """Set or insert a frontmatter field."""
    if re.search(rf"^{field}:\s*", text, re.MULTILINE):
        return re.sub(rf"^{field}:.*$", f"{field}: {value}", text, count=1, flags=re.MULTILINE)
    # Insert after 'era:' line
    if re.search(r"^era:\s*", text, re.MULTILINE):
        return re.sub(r"^(era:.+)$", rf"\1\n{field}: {value}", text, count=1, flags=re.MULTILINE)
    # Fallback: before closing ---
    return re.sub(r"(---\n)(## )", rf"\1{field}: {value}\n\2", text, count=1)


def main():
    cache = load_cache()
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} md files")

    found_wiki = found_commons = skipped = not_found = 0

    for i, path in enumerate(files, 1):
        slug = path.stem
        text = path.read_text(encoding="utf-8")
        meta, _ = parse_frontmatter(text)

        img = meta.get("image", "").strip()
        if img.startswith("https://"):
            skipped += 1
            continue

        orig = meta.get("original_name", "")
        title = meta.get("title", slug)

        print(f"[{i}/{len(files)}] {slug}", end=" ", flush=True)

        if slug in cache:
            url = cache[slug]
        else:
            url = None
            # Try Wikipedia pageimages first
            if orig and not re.search(r"[一-鿿]", orig):
                url = get_wikipedia_image(orig)
            # Try Wikimedia Commons search
            if not url:
                query = orig if (orig and not re.search(r"[一-鿿]", orig)) else title
                url = search_wikimedia_commons(f"{query} instrument")
            cache[slug] = url or ""
            save_cache(cache)

        if url:
            new_text = set_frontmatter_field(text, "image", url)
            if new_text != text:
                path.write_text(new_text, encoding="utf-8")
            if "wikipedia.org" in url or "wikimedia.org" in url:
                found_wiki += 1
                print(f"✓ wiki")
            else:
                found_commons += 1
                print(f"✓ commons")
        else:
            not_found += 1
            print("✗")

        if i % 50 == 0:
            save_cache(cache)

    save_cache(cache)
    print(f"\nDone. Wiki: {found_wiki}, Commons: {found_commons}, Not found: {not_found}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
