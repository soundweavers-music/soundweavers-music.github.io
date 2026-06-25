#!/usr/bin/env python3
"""Translate English introductions to Traditional Chinese using Claude API.

Resumable: results cached in work/translation_cache.json.
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import anthropic

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_FILE = BASE_DIR / "work" / "translation_cache.json"

MODEL = "claude-haiku-4-5"
RATE_LIMIT = 0.3  # seconds between API calls


def has_chinese(text):
    return bool(re.search(r"[一-鿿]", text))


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return {}, "", text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, "", text
    fm_block = parts[1]
    body = parts[2]
    meta = {}
    for line in fm_block.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, fm_block, body


def get_intro_text(body):
    m = re.search(r"## 介紹\s*\n\n(.+?)(?=\n## |\Z)", body, re.DOTALL)
    if not m:
        return ""
    return m.group(1).strip()


def translate(client, text, title):
    prompt = (
        f"請將以下關於樂器「{title}」的介紹文字翻譯成繁體中文。"
        "只輸出翻譯結果，不要加任何說明或前綴。保持段落結構。\n\n"
        f"{text}"
    )
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def update_md(path, translated):
    text = path.read_text(encoding="utf-8")
    new_text = re.sub(
        r"(## 介紹\s*\n\n)(.+?)(?=\n## |\Z)",
        lambda m: m.group(1) + translated,
        text,
        count=1,
        flags=re.DOTALL,
    )
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")


def main():
    client = anthropic.Anthropic()
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} instrument files")

    cache = load_cache()
    processed = skipped = errors = 0
    _last_call = 0.0

    for i, path in enumerate(files, 1):
        slug = path.stem
        text = path.read_text(encoding="utf-8")
        meta, _, body = parse_frontmatter(text)
        title = meta.get("title", slug)
        intro = get_intro_text(body)

        if not intro or has_chinese(intro):
            skipped += 1
            continue

        if slug in cache:
            update_md(path, cache[slug])
            processed += 1
            continue

        print(f"[{i}/{len(files)}] {slug}", end=" ", flush=True)

        elapsed = time.time() - _last_call
        if elapsed < RATE_LIMIT:
            time.sleep(RATE_LIMIT - elapsed)
        _last_call = time.time()

        try:
            translated = translate(client, intro, title)
            cache[slug] = translated
            save_cache(cache)
            update_md(path, translated)
            processed += 1
            print("✓")
        except Exception as exc:
            errors += 1
            print(f"✗ {exc}")

    print(f"\nDone. Translated: {processed}, Skipped (already Chinese): {skipped}, Errors: {errors}")


if __name__ == "__main__":
    main()
