#!/usr/bin/env python3
"""Collect author + licence for every instrument image from Commons.

Each instrument page shows its photo with a one-line credit. The action API is
throttled on this network, so this reads the file description page instead and
pulls two things out of the «Licensing» block:

  * the author from the file-info table,
  * the licence from the first creativecommons.org deed link after the
    Licensing heading (licenses/by-sa/4.0 → CC BY-SA 4.0).

Results land in content/image_credits.json, keyed by instrument slug; the
build reads that file. Resumable through work/image_credits_cache.json.

Usage:
    python scripts/fetch_image_credits.py
    python scripts/fetch_image_credits.py --limit 10
"""
import io
import json
import re
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
OUT_FILE = BASE_DIR / "content" / "image_credits.json"
CACHE_FILE = BASE_DIR / "work" / "image_credits_cache.json"
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}
GAP = 1.0
WORKERS = 4

LICENSE_NAMES = {
    "zero": "CC0",
}


def file_name_from_url(url):
    """Commons file name behind a thumbnail URL (or a Special:FilePath link)."""
    if "Special:FilePath/" in url:
        return urllib.parse.unquote(url.split("Special:FilePath/", 1)[1].split("?", 1)[0])
    m = re.search(r"/thumb/[0-9a-f]/[0-9a-f]{2}/([^/]+)/", url)
    if m:
        return urllib.parse.unquote(m.group(1))
    m = re.search(r"/commons/[0-9a-f]/[0-9a-f]{2}/([^/]+)$", url)
    if m:
        return urllib.parse.unquote(m.group(1))
    return None


def pretty_license(path):
    """licenses/by-sa/4.0 → CC BY-SA 4.0, publicdomain/zero/1.0 → CC0."""
    if not path:
        return ""
    kind, _, rest = path.partition("/")
    if kind == "publicdomain":
        name, _, version = rest.partition("/")
        return LICENSE_NAMES.get(name, "Public domain" if name else "")
    name, _, version = rest.partition("/")
    return f"CC {name.upper()} {version}".strip()


def parse_credit(html, file_name):
    licence = ""
    heading = html.find('id="Licensing"')
    block = html[heading:] if heading > 0 else html
    m = re.search(
        r"https?://(?:www\.)?creativecommons\.org/(licenses/[a-z-]+/[0-9.]+|publicdomain/[a-z]+/[0-9.]+)",
        block,
    )
    if m:
        licence = pretty_license(m.group(1))

    author = ""
    am = re.search(r'>\s*Author\s*</td>\s*<td[^>]*>(.*?)</td>', html, re.S)
    if am:
        author = re.sub(r"<[^>]+>", " ", am.group(1))
        author = re.sub(r"\s+", " ", author).strip(" ,;")
        author = re.sub(r"^(User|使用者|用戶)\s*:\s*", "", author, flags=re.I)
    if not author:
        tm = re.search(r'class="licensetpl_attr"[^>]*>(.*?)</span>', html, re.S)
        if tm:
            author = re.sub(r"<[^>]+>", " ", tm.group(1))
            author = re.sub(r"\s+", " ", author).strip(" ,;")
    if re.search(r"lacking author|author information|no author|未知|不明", author, re.I):
        author = ""

    return {
        "file": file_name,
        "author": author[:120],
        "license": licence,
        "page": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(file_name.replace(" ", "_")),
    }


def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    cache = {}
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    slugs = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        m = re.search(r"^image:\s*(\S+)", text, re.M)
        if not m:
            continue
        name = file_name_from_url(m.group(1))
        if name:
            slugs.append((path.stem, name))

    print(f"{len(slugs)} instrument images, {len(cache)} already looked up")
    if limit:
        slugs = slugs[:limit]

    # Each description page is ~100 KB and takes seconds; a few workers keep the
    # whole corpus under ten minutes without tripping the rate limiter.
    todo = [(s, n) for s, n in dict.fromkeys(slugs) if n not in cache]
    lock = threading.Lock()
    done = [0]

    def work(name):
        time.sleep(GAP)
        try:
            r = requests.get(
                "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(name.replace(" ", "_")),
                headers=HEADERS,
                timeout=(10, 40),
            )
        except Exception as exc:
            print(f"  ! {name[:40]}: {type(exc).__name__}")
            return
        if r.status_code != 200:
            print(f"  ! {name[:40]}: HTTP {r.status_code}")
            return
        info = parse_credit(r.text, name)
        with lock:
            cache[name] = info
            done[0] += 1
            if done[0] % 50 == 0:
                CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"  ... {done[0]}/{len(todo)}", flush=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(work, [n for _, n in todo]))

    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    out = {}
    for slug, name in slugs:
        if name in cache:
            out[slug] = cache[name]
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    missing = [s for s, n in slugs if n not in cache]
    print(f"\n{len(out)} credits written, {len(missing)} unresolved")
    if missing:
        print("  e.g.", ", ".join(missing[:8]))
    print(f"wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
