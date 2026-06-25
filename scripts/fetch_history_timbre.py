#!/usr/bin/env python3
"""Fill empty 歷史背景 and 音色描述 sections in instrument md files.

Strategy:
1. Fetch Wikipedia article sections (History/Origins) via API → translate with Claude
2. For 音色描述: generate with Claude using instrument context
3. Resumable via work/history_timbre_cache.json
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import anthropic
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
CACHE_FILE = BASE_DIR / "work" / "history_timbre_cache.json"
MODEL = "claude-haiku-4-5"
RATE_LIMIT = 0.4
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}

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


def section_is_empty(text, heading):
    """Return True if the ## heading exists but has no content before the next heading."""
    # Use [ \t]* (not \s*) to avoid consuming the blank line between headings
    pattern = rf"^## {re.escape(heading)}[ \t]*\n(.*?)(?=\n## |\Z)"
    m = re.search(pattern, text, re.DOTALL | re.MULTILINE)
    if not m:
        return True
    content = m.group(1).strip()
    return len(content) < 10


def set_section_content(text, heading, content):
    """Replace or append section body with content."""
    pattern = rf"(^## {re.escape(heading)}[ \t]*\n)(.*?)(?=\n## |\Z)"
    replacement = rf"\g<1>\n{content}\n"
    result = re.sub(pattern, replacement, text, count=1, flags=re.DOTALL | re.MULTILINE)
    if result == text:
        # Section heading not present — append at end
        result = text.rstrip() + f"\n## {heading}\n\n{content}\n"
    return result


def get_wikipedia_sections(en_title):
    """Fetch History/Origins section text from English Wikipedia."""
    rate_wait()
    params = {
        "action": "parse",
        "page": en_title,
        "prop": "sections|wikitext",
        "format": "json",
        "redirects": "1",
    }
    try:
        resp = requests.get("https://en.wikipedia.org/w/api.php", params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        sections = data.get("parse", {}).get("sections", [])
        # Find history-related sections
        history_keys = {"history", "origin", "origins", "background", "development", "etymology"}
        target_sections = [s for s in sections if any(k in s.get("line", "").lower() for k in history_keys)]
        if not target_sections:
            return None
        # Fetch the actual section text
        section_idx = target_sections[0]["index"]
        params2 = {
            "action": "parse",
            "page": en_title,
            "prop": "wikitext",
            "section": section_idx,
            "format": "json",
            "redirects": "1",
        }
        resp2 = requests.get("https://en.wikipedia.org/w/api.php", params=params2, headers=HEADERS, timeout=15)
        resp2.raise_for_status()
        wikitext = resp2.json().get("parse", {}).get("wikitext", {}).get("*", "")
        # Clean wikitext to plain text
        wikitext = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", wikitext)
        wikitext = re.sub(r"\{\{[^}]*\}\}", "", wikitext)
        wikitext = re.sub(r"<[^>]+>", "", wikitext)
        wikitext = re.sub(r"'{2,3}", "", wikitext)
        wikitext = re.sub(r"={2,}[^=]+=+", "", wikitext)
        wikitext = re.sub(r"\n{3,}", "\n\n", wikitext).strip()
        return wikitext[:2000] if wikitext else None
    except Exception:
        return None


def ask_claude_history(client, title, orig, intro, wiki_history=None):
    """Generate history background in Traditional Chinese."""
    if wiki_history:
        prompt = (
            f"請將以下關於樂器「{title}」（{orig}）的英文歷史資料翻譯整理成繁體中文，"
            "約150至250字，保留重要的歷史事件、地名、年代。只輸出繁體中文正文，不要標題。\n\n"
            f"{wiki_history[:1500]}"
        )
    else:
        prompt = (
            f"請用繁體中文撰寫樂器「{title}」（{orig}）的歷史背景，約150至200字。"
            f"樂器簡介：{intro[:300]}\n\n"
            "涵蓋：起源地區、發展歷史、傳播脈絡。只輸出正文，不要標題。"
        )
    rate_wait()
    msg = client.messages.create(model=MODEL, max_tokens=512,
                                  messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text.strip()


def ask_claude_timbre(client, title, orig, intro, sound_class, category):
    """Generate timbre/tone description in Traditional Chinese."""
    context_parts = [f"樂器：{title}（{orig}）"]
    if category:
        context_parts.append(f"分類：{category}")
    if sound_class:
        context_parts.append(f"發聲原理：{sound_class}")
    if intro:
        context_parts.append(f"簡介：{intro[:250]}")
    context = "\n".join(context_parts)
    prompt = (
        f"{context}\n\n"
        "請用繁體中文描述這個樂器的音色與音響特徵，約120至180字。"
        "涵蓋：音色質感（明亮/暗沉/溫潤等）、音域特點、共鳴方式、與其他樂器的音色比較。"
        "只輸出正文，不要標題。"
    )
    rate_wait()
    msg = client.messages.create(model=MODEL, max_tokens=400,
                                  messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text.strip()


def get_intro_snippet(body):
    m = re.search(r"## 介紹\s*\n\n(.+?)(?=\n## |\Z)", body, re.DOTALL)
    return m.group(1).strip()[:300] if m else ""


def main():
    client = anthropic.Anthropic()
    cache = load_cache()
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} md files")

    hist_filled = timbre_filled = skipped = 0

    for i, path in enumerate(files, 1):
        slug = path.stem
        text = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        title = meta.get("title", slug)
        orig = meta.get("original_name", "")
        sound_class = meta.get("sound_class", "")
        category = meta.get("category", "")
        intro = get_intro_snippet(body)

        hist_empty = section_is_empty(body, "歷史背景")
        timbre_empty = section_is_empty(body, "音色描述")

        if not hist_empty and not timbre_empty:
            skipped += 1
            continue

        changed = False

        if hist_empty:
            cache_key = f"{slug}_history"
            if cache_key not in cache:
                # Try Wikipedia first
                wiki_hist = None
                if orig and not re.search(r"[一-鿿]", orig):
                    wiki_hist = get_wikipedia_sections(orig)
                history_text = ask_claude_history(client, title, orig, intro, wiki_hist)
                cache[cache_key] = history_text
                save_cache(cache)
            else:
                history_text = cache[cache_key]

            if history_text:
                text_new = text.replace(body, body)
                # We need to update the full file text including frontmatter
                text = set_section_content(text, "歷史背景", history_text)
                changed = True
                hist_filled += 1

        if timbre_empty:
            cache_key = f"{slug}_timbre"
            if cache_key not in cache:
                timbre_text = ask_claude_timbre(client, title, orig, intro, sound_class, category)
                cache[cache_key] = timbre_text
                save_cache(cache)
            else:
                timbre_text = cache[cache_key]

            if timbre_text:
                text = set_section_content(text, "音色描述", timbre_text)
                changed = True
                timbre_filled += 1

        if changed:
            path.write_text(text, encoding="utf-8")

        if i % 50 == 0:
            print(f"  [{i}/{len(files)}] history={hist_filled} timbre={timbre_filled} skipped={skipped}")

    save_cache(cache)
    print(f"\nDone. History filled: {hist_filled}, Timbre filled: {timbre_filled}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
