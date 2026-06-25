#!/usr/bin/env python3
"""Find Chinese names for instruments with 暫譯 or no Chinese title.

Strategy:
1. en.wikipedia langlinks → get zh article title (accurate)
2. Fallback: ask Claude with instrument context

Resumable: results cached in work/chinese_names_cache.json.
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import anthropic
import opencc
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

_cc = opencc.OpenCC("s2twp")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_FILE = BASE_DIR / "work" / "chinese_names_cache.json"

RATE_LIMIT = 1.0
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}
MODEL = "claude-haiku-4-5"

_last_call = 0.0


def has_chinese(text):
    return bool(re.search(r"[一-鿿]", text))


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def rate_wait():
    global _last_call
    elapsed = time.time() - _last_call
    if elapsed < RATE_LIMIT:
        time.sleep(RATE_LIMIT - elapsed)
    _last_call = time.time()


def get_zh_title_via_langlink(en_title):
    """Get zh Wikipedia title from en.wikipedia langlinks."""
    rate_wait()
    params = {
        "action": "query",
        "titles": en_title,
        "prop": "langlinks",
        "lllang": "zh",
        "format": "json",
        "redirects": "1",
    }
    try:
        resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params=params,
            headers=HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        for page in data.get("query", {}).get("pages", {}).values():
            if str(page.get("pageid", "-1")) == "-1":
                return None
            for ll in page.get("langlinks", []):
                if ll.get("lang") == "zh":
                    return ll.get("*", "")
    except Exception:
        pass
    return None


def convert_to_traditional(zh_title):
    return _cc.convert(zh_title)


def ask_claude(client, original_name, category, intro_snippet):
    """Ask Claude for the Traditional Chinese name of the instrument."""
    context = f"樂器英文名：{original_name}"
    if category:
        context += f"\n分類：{category}"
    if intro_snippet:
        context += f"\n簡介：{intro_snippet[:200]}"

    prompt = (
        f"{context}\n\n"
        "請提供這個樂器的繁體中文正式名稱（如有多個常用名稱，選最常見的一個）。"
        "只輸出中文名稱本身，不要加括號說明或其他文字。"
        "如果確實沒有通用的中文名稱，只輸出「無」。"
    )
    msg = client.messages.create(
        model=MODEL,
        max_tokens=64,
        messages=[{"role": "user", "content": prompt}],
    )
    result = msg.content[0].text.strip()
    if result == "無" or not has_chinese(result):
        return None
    # Strip any parenthetical notes
    result = re.sub(r"[（(][^）)]*[）)]", "", result).strip()
    return result if has_chinese(result) else None


def parse_meta(text):
    meta = {}
    m = re.match(r"---\n(.*?)---", text, re.DOTALL)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    return meta


def get_intro_snippet(text):
    m = re.search(r"## 介紹\s*\n\n(.+?)(?=\n##|\Z)", text, re.DOTALL)
    return m.group(1).strip()[:200] if m else ""


def update_title(path, new_title):
    text = path.read_text(encoding="utf-8")
    new_text = re.sub(
        r"^(title:\s*)(.+)$",
        lambda m: m.group(1) + new_title,
        text,
        count=1,
        flags=re.MULTILINE,
    )
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


def main():
    client = anthropic.Anthropic()
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} instrument files")

    cache = load_cache()
    found_wiki = found_claude = skipped = not_found = 0

    for i, path in enumerate(files, 1):
        slug = path.stem
        text = path.read_text(encoding="utf-8")
        meta = parse_meta(text)

        title = meta.get("title", "")
        original_name = meta.get("original_name", "")

        needs_lookup = "暫譯" in title or (title and not has_chinese(title))
        if not needs_lookup or not original_name:
            skipped += 1
            continue

        if slug in cache:
            result = cache[slug]
            if result:
                update_title(path, result)
                found_wiki += 1
            else:
                not_found += 1
            continue

        print(f"[{i}/{len(files)}] {slug} ({original_name})", end=" ", flush=True)

        # Step 1: en.wikipedia langlinks
        zh_title = get_zh_title_via_langlink(original_name)
        if zh_title and has_chinese(zh_title):
            zh_title = convert_to_traditional(zh_title)

        if zh_title and has_chinese(zh_title):
            cache[slug] = zh_title
            save_cache(cache)
            update_title(path, zh_title)
            found_wiki += 1
            print(f"✓ wiki → {zh_title}")
            continue

        # Step 2: Claude fallback
        intro = get_intro_snippet(text)
        category = meta.get("category", "")
        zh_title = ask_claude(client, original_name, category, intro)

        if zh_title:
            cache[slug] = zh_title
            save_cache(cache)
            update_title(path, zh_title)
            found_claude += 1
            print(f"✓ claude → {zh_title}")
        else:
            cache[slug] = None
            save_cache(cache)
            not_found += 1
            print("✗")

    print(f"\nDone. Wiki: {found_wiki}, Claude: {found_claude}, Not found: {not_found}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
