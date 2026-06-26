#!/usr/bin/env python3
"""Enrich all instrument md files with new sections and frontmatter fields.

Adds per instrument (resumable via work/enrich_all_cache.json):
  - Fills empty ## 介紹 section
  - Inserts ## 聆聽示範 (with ### 代表性作品 subsection) between 介紹 and 歷史背景
  - Appends ## 樂器材質 section after ## 音色描述
  - Adds `instrument_key` frontmatter field (樂器調性)
  - Adds `range` frontmatter field (音域範圍)

Uses 5 concurrent workers for speed.
"""
import io
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import anthropic

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_FILE = BASE_DIR / "work" / "enrich_all_cache.json"
MODEL = "claude-haiku-4-5"
WORKERS = 5

_cache_lock = threading.Lock()
_print_lock = threading.Lock()
_counter_lock = threading.Lock()
_done = 0
_skipped = 0
_errors = 0


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


def section_exists(text, heading):
    return bool(re.search(rf"^## {re.escape(heading)}[ \t]*$", text, re.MULTILINE))


def section_is_empty(text, heading):
    pattern = rf"^## {re.escape(heading)}[ \t]*\n(.*?)(?=\n## |\Z)"
    m = re.search(pattern, text, re.DOTALL | re.MULTILINE)
    if not m:
        return True
    return len(m.group(1).strip()) < 10


def get_section_text(text, heading):
    pattern = rf"^## {re.escape(heading)}[ \t]*\n(.*?)(?=\n## |\Z)"
    m = re.search(pattern, text, re.DOTALL | re.MULTILINE)
    return m.group(1).strip() if m else ""


def set_frontmatter_field(text, field, value):
    if re.search(rf"^{field}:\s*", text, re.MULTILINE):
        return re.sub(rf"^{field}:.*$", f"{field}: {value}", text, count=1, flags=re.MULTILINE)
    if re.search(r"^sound_class:\s*", text, re.MULTILINE):
        return re.sub(r"^(sound_class:.+)$", rf"\1\n{field}: {value}", text, count=1, flags=re.MULTILINE)
    before, sep, after = text.partition("\n---\n")
    if sep:
        return before + f"\n{field}: {value}" + sep + after
    return text


def ask_claude(client, title, orig, category, sound_class, intro_text, hist_text, timbre_text, need_intro):
    context_parts = [f"樂器名稱：{title}"]
    if orig:
        context_parts.append(f"原文名稱：{orig}")
    if category:
        context_parts.append(f"分類：{category}")
    if sound_class:
        context_parts.append(f"發聲原理：{sound_class}")
    if intro_text:
        context_parts.append(f"介紹：{intro_text[:200]}")
    if hist_text:
        context_parts.append(f"歷史：{hist_text[:200]}")
    if timbre_text:
        context_parts.append(f"音色：{timbre_text[:200]}")
    context = "\n".join(context_parts)

    fields_needed = []
    if need_intro:
        fields_needed.append('"intro": 約150字繁體中文樂器介紹，說明樂器外型、用途、特色')
    fields_needed.append('"instrument_key": 樂器演奏調性，例如「C大調」「降B大調」「全調性」「無固定調性」「多調性」等，只寫調性值不要解釋')
    fields_needed.append('"range": 音域範圍，例如「E2–G5（約3個半8度）」「約2個8度」「全音域」等，只寫範圍值不要解釋')
    fields_needed.append('"representative_works": 約100至120字，用繁體中文描述2至4件代表性作品，包含作品名稱、作曲者、年代')
    fields_needed.append('"materials": 約100至130字，用繁體中文描述樂器主要材質，包含各部位使用的木材、金屬、皮革或其他材料')

    prompt = (
        f"{context}\n\n"
        "請根據以上樂器資訊，以JSON格式輸出下列欄位（只輸出JSON，不要其他文字）：\n"
        "{\n" + ",\n".join(f'  {f}' for f in fields_needed) + "\n}"
    )

    msg = client.messages.create(
        model=MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip()
    m = re.search(r'\{.*\}', raw, re.DOTALL)
    if m:
        raw = m.group(0)
    return json.loads(raw)


def apply_enrichment(text, data, need_intro):
    if need_intro and data.get("intro"):
        pattern = rf"(^## 介紹[ \t]*\n)(.*?)(?=\n## |\Z)"
        replacement = rf"\g<1>\n{data['intro']}\n"
        new = re.sub(pattern, replacement, text, count=1, flags=re.DOTALL | re.MULTILINE)
        if new != text:
            text = new
        else:
            text = text.rstrip() + f"\n## 介紹\n\n{data['intro']}\n"

    if not section_exists(text, "聆聽示範") and data.get("representative_works"):
        works = data["representative_works"]
        listening_block = f"\n## 聆聽示範\n\n### 代表性作品\n\n{works}\n"
        if re.search(r"\n## 歷史背景", text):
            text = re.sub(r"\n## 歷史背景", listening_block + "\n## 歷史背景", text, count=1)
        else:
            text = text.rstrip() + listening_block

    if not section_exists(text, "樂器材質") and data.get("materials"):
        text = text.rstrip() + f"\n## 樂器材質\n\n{data['materials']}\n"

    if data.get("instrument_key"):
        text = set_frontmatter_field(text, "instrument_key", data["instrument_key"])
    if data.get("range"):
        text = set_frontmatter_field(text, "range", data["range"])

    return text


def process_file(args):
    global _done, _skipped, _errors
    i, total, path, cache, client = args
    slug = path.stem
    text = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)

    title = meta.get("title", slug)
    orig = meta.get("original_name", "")
    category = meta.get("category", "")
    sound_class = meta.get("sound_class", "")

    need_intro = section_is_empty(body, "介紹")
    need_listening = not section_exists(body, "聆聽示範")
    need_materials = not section_exists(body, "樂器材質")
    need_key = not meta.get("instrument_key")
    need_range = not meta.get("range")

    if not any([need_intro, need_listening, need_materials, need_key, need_range]):
        with _counter_lock:
            _skipped += 1
        return "skip"

    flags = []
    if need_intro: flags.append("intro")
    if need_listening: flags.append("listening")
    if need_materials: flags.append("materials")
    if need_key: flags.append("key")
    if need_range: flags.append("range")

    with _cache_lock:
        cached = cache.get(slug)

    if cached is None:
        intro_text = get_section_text(body, "介紹")
        hist_text = get_section_text(body, "歷史背景")
        timbre_text = get_section_text(body, "音色描述")
        try:
            data = ask_claude(client, title, orig, category, sound_class,
                              intro_text, hist_text, timbre_text, need_intro)
            with _cache_lock:
                cache[slug] = data
                save_cache(cache)
        except Exception as e:
            with _print_lock:
                print(f"[{i}/{total}] {slug} ✗ error: {e}", flush=True)
            with _counter_lock:
                _errors += 1
            return "error"
    else:
        data = cached

    try:
        new_text = apply_enrichment(text, data, need_intro)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
        with _print_lock:
            print(f"[{i}/{total}] {slug} ({','.join(flags)}) ✓", flush=True)
        with _counter_lock:
            _done += 1
        return "done"
    except Exception as e:
        with _print_lock:
            print(f"[{i}/{total}] {slug} ✗ apply error: {e}", flush=True)
        with _counter_lock:
            _errors += 1
        return "error"


def main():
    client = anthropic.Anthropic()
    cache = load_cache()
    files = sorted(CONTENT_DIR.glob("*.md"))
    total = len(files)
    print(f"Found {total} md files, using {WORKERS} workers")

    args_list = [(i, total, path, cache, client) for i, path in enumerate(files, 1)]

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(process_file, args): args[2].stem for args in args_list}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 100 == 0:
                with _counter_lock:
                    print(f"\n  Progress: {completed}/{total} | done={_done} skipped={_skipped} errors={_errors}\n", flush=True)

    save_cache(cache)
    print(f"\nDone. Enriched: {_done}, Skipped: {_skipped}, Errors: {_errors}")


if __name__ == "__main__":
    main()
