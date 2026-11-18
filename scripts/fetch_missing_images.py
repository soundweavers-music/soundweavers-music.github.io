#!/usr/bin/env python3
"""Resolve image candidates for instruments that still lack an `image:` field.

The legacy fetch_images.py read the removed `original_name` / `title` fields and
so fell back to searching Commons for the *slug*, which produced junk such as a
Sho-Bud pedal steel guitar for 笙.

The Wikimedia **action API** (`w/api.php`) and the REST API both answer 429 for
this network, while plain page requests do not — so this script reads the raw
wikitext (`index.php?action=raw`), which is small, and pulls the infobox
`image=` parameter, falling back to the first `[[File:...]]` on the page.

Resolution order per instrument:
  1. en.wikipedia article for `title_original`, following redirects
  2. zh.wikipedia article for `title_zh`
  3. Commons file search (only when --commons is passed; it is rate-limited)

Candidates go to work/missing_images.json for review. Nothing is written into
content/ here — apply_image_picks.py does that after a human/vision check.

Usage:
    python scripts/fetch_missing_images.py
    python scripts/fetch_missing_images.py --commons
    python scripts/fetch_missing_images.py --only sho,sipsi
"""
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
WORK = BASE_DIR / "work"
OUT_FILE = WORK / "missing_images.json"
# WMI_CACHE lets several chunked runs work in parallel without clobbering
# one another's progress file.
CACHE_FILE = Path(os.environ.get("WMI_CACHE", WORK / "image_candidates_cache.json"))
THUMB = 500
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}

MIN_GAP = 1.0
current_gap = MIN_GAP
requests_made = 0
errors = []

BAD_FILE = re.compile(
    r"(commons-logo|wiktionary|wikiquote|wikisource|question_book|ambox|edit-|disambig|red_pog|"
    r"padlock|symbol_|folder_|crystal_|nuvola|\.svg$)",
    re.I,
)
PHOTO_EXT = re.compile(r"\.(jpe?g|png|gif|tiff?|webp)$", re.I)


def sleep_gap():
    global current_gap
    time.sleep(current_gap)
    if current_gap < 1.6:
        current_gap = min(1.6, current_gap + 0.02)


def fetch_raw(lang, title):
    """Raw wikitext for a page, or None. Raises RateLimited on 429."""
    global requests_made
    sleep_gap()
    requests_made += 1
    try:
        r = requests.get(
            f"https://{lang}.wikipedia.org/w/index.php",
            params={"title": title, "action": "raw"},
            headers=HEADERS,
            timeout=(5, 20),
            allow_redirects=True,
        )
    except Exception as exc:
        errors.append(f"{lang}:{title[:30]}: {exc}")
        return None
    if r.status_code == 429:
        raise RateLimited
    if r.status_code != 200:
        return None
    return r.text


class RateLimited(Exception):
    pass


REDIRECT = re.compile(r"^\s*#redirect\s*\[\[([^\]|#]+)", re.I)


def looks_musical(text):
    """Guard against title collisions: 桑薩 is a French commune, Sho-Bud is a guitar brand."""
    low = text.lower()
    if "infobox instrument" in low or "infobox musical" in low or "musical instrument" in low:
        return True
    if any(w in low for w in ("instrument", "luthier", "percussion", "woodwind", "string instrument", "brass")):
        return True
    return any(w in text for w in ("樂器", "乐器", "音樂", "音乐", "演奏", "簧", "編鐘", "编钟"))


def article_image(lang, title):
    """Lead image filename from an article, following up to two redirects."""
    seen = set()
    for _ in range(3):
        if not title or title in seen:
            return None
        seen.add(title)
        text = fetch_raw(lang, title)
        if text is None:
            return None
        m = REDIRECT.match(text)
        if m:
            title = m.group(1).strip()
            continue
        if not looks_musical(text):
            return None

        # infobox parameter:  | image = Foo.jpg   /  | Image = [[File:Foo.jpg]]
        for pat in (r"\|\s*image\s*=\s*(?:\[\[\s*(?:File|Image):)?([^|\]}\n]+)",):
            m = re.search(pat, text, re.I)
            if m:
                cand = clean_filename(m.group(1))
                if cand:
                    return cand
        for m in re.finditer(r"\[\[\s*(?:File|Image):([^|\]\n]+)", text):
            cand = clean_filename(m.group(1))
            if cand:
                return cand
        return None
    return None


def clean_filename(raw):
    name = raw.strip().strip("[]")
    name = re.sub(r"^(?:File|Image):", "", name, flags=re.I).strip()
    name = re.sub(r"\s*<[^>]*>.*$", "", name)
    name = re.sub(r"\s*(?:thumb|left|right|upright|\d+px).*$", "", name, flags=re.I).strip()
    if not name or not PHOTO_EXT.search(name) or BAD_FILE.search(name):
        return ""
    return name


def thumb_url(filename):
    """Canonical 500px thumb URL; SVG/TIF go through Special:FilePath instead."""
    name = filename.replace(" ", "_")
    if re.search(r"\.(svg|tiff?)$", name, re.I):
        return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name, safe="") + f"?width={THUMB}"
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()
    quoted = urllib.parse.quote(name, safe="")
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{digest[0]}/{digest[:2]}/{quoted}/{THUMB}px-{quoted}"


def commons_search(query, limit=8):
    """Commons file search through the plain search page (REST is throttled)."""
    global requests_made
    sleep_gap()
    requests_made += 1
    try:
        r = requests.get(
            "https://commons.wikimedia.org/w/index.php",
            params={"search": query, "ns6": "1", "limit": str(limit)},
            headers=HEADERS,
            timeout=(5, 20),
        )
    except Exception as exc:
        errors.append(f"commons:{query[:25]}: {exc}")
        return []
    if r.status_code != 200:
        return []
    # <div class="mw-search-result-heading"><a ... title="File:X.jpg">
    hits = re.findall(r'title="(File:[^"]+)"', r.text)
    out, seen = [], set()
    for h in hits:
        fname = h[5:]
        if fname in seen or not PHOTO_EXT.search(fname) or BAD_FILE.search(fname):
            continue
        seen.add(fname)
        out.append({"url": thumb_url(fname), "file": fname, "via": f"commons:{query}"})
        if len(out) >= limit:
            break
    return out


def parse_frontmatter(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}
    out = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def strip_notes(name):
    return re.sub(r"（[^）]*）|\([^)]*\)", "", name).strip()


def en_variants(name):
    base = strip_notes(name)
    out = [base.title() if base.isupper() else base]
    if "/" in base:
        out += [p.strip() for p in base.split("/") if p.strip()]
    if base:
        out += [base.capitalize(), f"{base} (instrument)"]
    return [v for v in dict.fromkeys(out) if v]


def missing_entries():
    found = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        meta = parse_frontmatter(path.read_text(encoding="utf-8"))
        if not meta.get("image"):
            found.append((path.stem, meta))
    return found


def load_cache():
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def resolve(slug, meta, with_commons):
    en = meta.get("title_original", "")
    zh = strip_notes(meta.get("title_zh", ""))
    cands, tried = [], []

    for v in en_variants(en):
        tried.append(f"en:{v}")
        name = article_image("en", v)
        if name:
            cands.append({"url": thumb_url(name), "file": name, "via": f"enwiki:{v}"})
            break

    if not cands and zh:
        tried.append(f"zh:{zh}")
        name = article_image("zh", zh)
        if name:
            cands.append({"url": thumb_url(name), "file": name, "via": f"zhwiki:{zh}"})

    needs_check = not cands
    if needs_check and with_commons:
        primary = en_variants(en)[0] if en else slug
        for q in (f"{primary} instrument", primary):
            tried.append(f"commons:{q}")
            hits = commons_search(q)
            if hits:
                cands += hits
                break

    return {
        "slug": slug,
        "title_en": en,
        "title_zh": zh,
        "status": "candidate" if cands else "unresolved",
        "needs_visual_check": needs_check,
        "tried": tried,
        "candidates": cands,
        "pick": None,
    }


def main():
    global current_gap
    with_commons = "--commons" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = {s.strip() for s in sys.argv[sys.argv.index("--only") + 1].split(",")}

    todo = missing_entries()
    if only:
        todo = [(s, m) for s, m in todo if s in only]
    print(f"{len(todo)} instruments to resolve", flush=True)

    cache = load_cache()
    results, deferred = [], []
    for i, (slug, meta) in enumerate(todo, 1):
        if slug in cache and not only:
            results.append(cache[slug])
            continue
        try:
            rec = resolve(slug, meta, with_commons)
        except RateLimited:
            deferred.append((slug, meta))
            print(f"[{i}/{len(todo)}] ⏸ {slug:26s} rate limited", flush=True)
            current_gap = min(4.0, current_gap + 0.5)
            time.sleep(20)
            continue
        cache[slug] = rec
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        results.append(rec)
        mark = "✓" if not rec["needs_visual_check"] else ("?" if rec["candidates"] else "✗")
        src = rec["candidates"][0]["via"] if rec["candidates"] else "-"
        print(f"[{i}/{len(todo)}] {mark} {slug:26s} {src[:40]}", flush=True)

    for attempt in (1, 2):
        if not deferred:
            break
        print(f"\nretrying {len(deferred)} deferred (pass {attempt}) ...", flush=True)
        time.sleep(30)
        retry, deferred = deferred, []
        for slug, meta in retry:
            try:
                rec = resolve(slug, meta, with_commons)
            except RateLimited:
                deferred.append((slug, meta))
                time.sleep(20)
                continue
            cache[slug] = rec
            CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
            results.append(rec)
            print(f"  ↻ {slug:26s} {len(rec['candidates'])} cand", flush=True)

    OUT_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    clean = sum(1 for r in results if not r["needs_visual_check"])
    review = sum(1 for r in results if r["needs_visual_check"] and r["candidates"])
    none = sum(1 for r in results if not r["candidates"])
    print(f"\narticle image: {clean}   needs review: {review}   unresolved: {none}   deferred: {len(deferred)}")
    print(f"{requests_made} requests")
    if errors:
        print(f"{len(errors)} issues, last few:")
        for e in errors[-5:]:
            print("  ", e)
    print(f"wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
