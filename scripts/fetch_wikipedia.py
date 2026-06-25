#!/usr/bin/env python3
"""Fetch Wikipedia intro text and images for instrument .md files.

Resumable: results are cached in work/wiki_content_cache.json.
Re-run after interruption to continue from where it left off.
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
CACHE_FILE = BASE_DIR / "work" / "wiki_content_cache.json"

RATE_LIMIT = 1.0  # seconds between API calls
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}

_last_call = 0.0


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_title(title):
    """Strip bracketed suffixes like （暫譯）、（英）."""
    return re.sub(r"（[^）]*）", "", title).strip()


def has_chinese(text):
    return bool(re.search(r"[一-鿿]", text))


def clean_extract(text):
    if not text:
        return ""
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def trim_extract(text, max_chars=600):
    if not text or len(text) <= max_chars:
        return text.strip()
    chunk = text[:max_chars]
    for sep in ["。", "！", "？", ". ", "! ", "? "]:
        pos = chunk.rfind(sep)
        if pos > max_chars // 3:
            return chunk[: pos + len(sep)].strip()
    return chunk.strip() + "…"


def fetch_wiki(lang, title):
    global _last_call
    elapsed = time.time() - _last_call
    if elapsed < RATE_LIMIT:
        time.sleep(RATE_LIMIT - elapsed)
    _last_call = time.time()

    params = {
        "action": "query",
        "titles": title,
        "prop": "extracts|pageimages",
        "exintro": "1",
        "explaintext": "1",
        "piprop": "thumbnail",
        "pithumbsize": "500",
        "format": "json",
        "redirects": "1",
        "maxlag": "5",
    }
    if lang == "zh":
        params["variant"] = "zh-tw"

    for attempt in range(3):
        try:
            resp = requests.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params=params,
                headers=HEADERS,
                timeout=15,
            )
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("retry-after", "10"))
                time.sleep(retry_after + 1)
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.RequestException as exc:
            if attempt == 2:
                print(f"  [{lang}] request error: {exc}")
                return None, None
            time.sleep(3)
    else:
        return None, None

    for page_id, page_data in data.get("query", {}).get("pages", {}).items():
        if page_id == "-1":
            return None, None
        extract = clean_extract(page_data.get("extract", ""))
        image = page_data.get("thumbnail", {}).get("source", "")
        return extract or None, image or None

    return None, None


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return {}, [], ""
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, [], ""
    fm_lines = parts[1].splitlines()
    body = parts[2]
    meta = {}
    for line in fm_lines:
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, fm_lines, body


def has_intro_content(body):
    m = re.search(r"^## 介紹\s*\n(.*?)(?=^##|\Z)", body, re.MULTILINE | re.DOTALL)
    if not m:
        return False
    return bool(m.group(1).strip())


def update_md(path, extract, image):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return
    parts = text.split("---", 2)
    if len(parts) < 3:
        return

    fm_lines = parts[1].strip("\n").splitlines()
    body = parts[2]
    changed = False

    if extract and not has_intro_content(body):
        body = re.sub(
            r"^(## 介紹)\s*$",
            f"## 介紹\n\n{extract}",
            body,
            count=1,
            flags=re.MULTILINE,
        )
        changed = True

    existing_image = any(l.strip().startswith("image:") for l in fm_lines)
    if image and not existing_image:
        inserted = False
        for idx, line in enumerate(fm_lines):
            if line.strip().startswith("era:"):
                fm_lines.insert(idx + 1, f"image: {image}")
                inserted = True
                break
        if not inserted:
            fm_lines.append(f"image: {image}")
        changed = True

    if not changed:
        return

    new_fm = "\n".join(fm_lines)
    path.write_text(f"---\n{new_fm}\n---{body}", encoding="utf-8")


def main():
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} instrument files")

    cache = load_cache()
    processed = skipped = not_found = 0

    for i, path in enumerate(files, 1):
        slug = path.stem
        text = path.read_text(encoding="utf-8")
        meta, _, body = parse_frontmatter(text)

        title = meta.get("title", "")
        original_name = meta.get("original_name", "")
        has_image = bool(meta.get("image", ""))
        has_intro = has_intro_content(body)

        if has_image and has_intro:
            skipped += 1
            continue

        if slug in cache:
            cached = cache[slug]
            update_md(path, cached.get("extract"), cached.get("image"))
            processed += 1
            continue

        print(f"[{i}/{len(files)}] {slug}", end=" ", flush=True)

        extract, image = None, None
        lang_used = None

        zh_title = clean_title(title)
        if zh_title and has_chinese(zh_title):
            extract, image = fetch_wiki("zh", zh_title)
            if extract:
                lang_used = "zh"

        if not extract and original_name:
            en_extract, en_image = fetch_wiki("en", original_name)
            if en_extract:
                extract = en_extract
                lang_used = "en"
                if not image:
                    image = en_image

        if extract:
            extract = trim_extract(extract)
            print(f"✓ ({lang_used})")
        else:
            not_found += 1
            print("✗")

        cache[slug] = {"extract": extract, "image": image, "lang": lang_used}
        save_cache(cache)
        update_md(path, extract, image)
        processed += 1

    print(f"\nDone. Processed: {processed}, Skipped (complete): {skipped}, Not found: {not_found}")


if __name__ == "__main__":
    main()
