#!/usr/bin/env python3
"""Resolve enwiki page titles for instruments whose title_original missed.

Strategy is batch-first so it stays under MediaWiki's rate limits:

  Round 1 (cheap): generate title variants — parenthetical stripped, each side
    of "A / B" or "A or B" glue, slug title-cased, diacritics folded, zh title
    as a search seed — and resolve them all with nx (batch redirect) lookups.
  Round 2 (search): whatever is still unmatched gets one MediaWiki search hit,
    accepted only when the result looks like a musical instrument *and* shares
    a name stem with the instrument.

Confirmed matches land in work/verify/_aliases.json, which verify_instruments.py
prefers over title_original.

Usage: python scripts/resolve_missing_pages.py [--no-search]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VERIFY_DIR = BASE_DIR / "work" / "verify"
ALIAS_FILE = VERIFY_DIR / "_aliases.json"
UA = "WorldInstrumentsVerify/1.0 (educational)"
MUSIC_HINT = re.compile(
    r"instrument|drum|flute|string|percussion|horn|trumpet|harp|guitar|lute|"
    r"bell|gong|pipe|zither|bow|music|whistle|reed|chime|idiophone|chordophone|"
    r"membranophone|aerophone|singing|sound|tone|zither|lyre|viol", re.I)


def http_json(url: str, retries: int = 4) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            time.sleep(4.0 * (attempt + 1) if e.code == 429 else 2.0 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            time.sleep(2.0 * (attempt + 1))
    return None


def fold(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def variants(slug: str, title: str, zh: str) -> list[tuple[str, str]]:
    """(candidate_title, how) pairs, most trustworthy first."""
    out = []
    bare = re.sub(r"\s*\([^)]*\)", "", title).strip()
    if bare and bare != title:
        out.append((bare, "bare"))
    for part in re.split(r"\s*/\s*|\s+or\s+", title):
        part = part.strip()
        if part and part != title:
            out.append((part, "glue"))
    words = slug.replace("-", " ").title()
    # MediaWiki titles are case-insensitive except for the first letter, so
    # "Saung Gauk"→"Saung gauk" and "Paraguayan Harp"→"Paraguayan harp" both work.
    out.append((words[:1].upper() + words[1:].lower(), "slug"))
    out.append((words, "slug"))
    if fold(title) != title:
        out.append((fold(title), "diacritic"))
    if zh:
        out.append((zh, "zh"))
    seen, uniq = set(), []
    for t, how in out:
        key = t.lower()
        if t and len(t) > 1 and key not in seen:
            seen.add(key)
            uniq.append((t, how))
    return uniq


def resolve_batch(titles: list[str]) -> dict[str, dict]:
    """Batch redirect-resolution; returns {candidate_title: page_info}."""
    out: dict[str, dict] = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        params = {"action": "query", "format": "json", "redirects": 1,
                  "prop": "pageprops", "titles": "|".join(batch)}
        data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
        if not data or "query" not in data:
            continue
        q = data["query"]
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        by_title = {p.get("title", ""): p for p in q.get("pages", {}).values()}
        for t in batch:
            key = redir.get(norm.get(t, t), norm.get(t, t))
            p = by_title.get(key)
            if not p or "missing" in p:
                continue
            props = p.get("pageprops") or {}
            if "disambiguation" in props:
                continue
            out[t] = {"title": p["title"], "desc": props.get("wikibase-shortdesc", ""),
                      "item": props.get("wikibase_item", "")}
        time.sleep(0.5)
    return out


LIST_PAGE = re.compile(r"^(list of|outline of|index of|timeline of)", re.I)


def name_stems(text: str) -> set[str]:
    """Distinctive name tokens, e.g. 'kabuli rubab' → {'kabuli','rubab'}."""
    stop = {"the", "and", "a", "an", "of", "instrument", "musical", "music",
            "traditional", "folk", "bass", "alto", "soprano", "tenor", "small",
            "large", "pair", "variants", "family", "type"}
    return {w for w in re.split(r"[^a-z0-9]+", fold(text).lower())
            if len(w) > 3 and w not in stop}


def search_one(title: str, zh: str) -> str:
    """Search enwiki, accepting only a specific page that shares the name stem."""
    stems = name_stems(re.sub(r"\s*\([^)]*\)", "", title))
    if zh:
        stems |= name_stems(zh)
    for query in (f'"{title}" instrument', f"{title} instrument"):
        params = {"action": "query", "format": "json", "list": "search",
                  "srsearch": query, "srlimit": 5}
        data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
        time.sleep(1.2)
        if not data:
            continue
        for r in data.get("query", {}).get("search", []):
            cand = r["title"]
            if LIST_PAGE.match(cand):
                continue
            if not MUSIC_HINT.search(f"{cand} {r.get('snippet', '')}"):
                continue
            if stems & name_stems(cand):
                return cand
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-search", action="store_true")
    args = ap.parse_args()

    index = json.loads((VERIFY_DIR / "_index.json").read_text(encoding="utf-8"))
    aliases = json.loads(ALIAS_FILE.read_text(encoding="utf-8")) if ALIAS_FILE.exists() else {}
    missing = [s for s, v in index.items() if v.get("enwiki") != "ok" and s not in aliases]
    print(f"{len(missing)} unresolved slugs", flush=True)

    evs = {}
    for slug in missing:
        p = VERIFY_DIR / f"{slug}.json"
        if p.exists():
            evs[slug] = json.loads(p.read_text(encoding="utf-8"))

    # ---- round 1: batch variants
    cand_map: dict[str, list[tuple[str, str]]] = {}
    all_cands: list[str] = []
    for slug, ev in evs.items():
        zh = next(iter(ev.get("zhwiki_intro") or {}), "")
        cand_map[slug] = variants(slug, ev.get("title_original") or slug, zh)
        all_cands.extend(c for c, _ in cand_map[slug])
    all_cands = list(dict.fromkeys(all_cands))
    print(f"round 1: {len(all_cands)} title variants ...", flush=True)
    resolved_titles = resolve_batch(all_cands)
    print(f"  {len(resolved_titles)} variants exist on enwiki", flush=True)

    for slug, cands in cand_map.items():
        for cand, how in cands:
            hit = resolved_titles.get(cand)
            if hit and MUSIC_HINT.search(hit["desc"] or "musical instrument"):
                aliases[slug] = {"title": hit["title"], "how": how,
                                 "item": hit["item"], "desc": hit["desc"]}
                break
    ALIAS_FILE.write_text(json.dumps(aliases, ensure_ascii=False, indent=1,
                                     sort_keys=True), encoding="utf-8")
    print(f"  resolved {len(aliases)}/{len(missing)}", flush=True)

    # ---- round 2: search for the rest
    if not args.no_search:
        rest = [s for s in missing if s not in aliases]
        print(f"round 2: search {len(rest)} remaining ...", flush=True)
        for n, slug in enumerate(rest, 1):
            ev = evs.get(slug) or {}
            title = re.sub(r"\s*\([^)]*\)", "", ev.get("title_original") or slug)
            zh = next(iter(ev.get("zhwiki_intro") or {}), "")
            hit = search_one(title, zh)
            if hit:
                aliases[slug] = {"title": hit, "how": "search", "item": "", "desc": ""}
                print(f"  [{n}/{len(rest)}] {slug} → {hit}", flush=True)
            if n % 10 == 0:
                ALIAS_FILE.write_text(json.dumps(aliases, ensure_ascii=False, indent=1,
                                                 sort_keys=True), encoding="utf-8")
        ALIAS_FILE.write_text(json.dumps(aliases, ensure_ascii=False, indent=1,
                                         sort_keys=True), encoding="utf-8")

    print(f"total aliases {len(aliases)} of {len(index)} instruments "
          f"({len(index) - len(aliases)} still unmatched)")


if __name__ == "__main__":
    main()
