#!/usr/bin/env python3
"""Cache full encyclopedic source text per instrument for grounded rewriting.

For each resolved enwiki page: full plaintext (all sections, capped) + section
headings. For each linked zhwiki page: full plaintext (capped). Wikimedia
Commons page image URL, too.

Output work/verify/source/<slug>.json  — resumable, safe to interrupt.

Usage: python scripts/fetch_source_text.py [--limit N] [--slugs a,b] [--refresh]
"""
from __future__ import annotations

import argparse
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VERIFY_DIR = BASE_DIR / "work" / "verify"
SRC_DIR = VERIFY_DIR / "source"
UA = "WorldInstrumentsVerify/1.0 (educational)"
WORKERS = 2
_lock = threading.Lock()


def http_json(url: str, retries: int = 6, timeout: int = 30,
              base_backoff: float = 2.0) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            time.sleep(base_backoff * (2 ** attempt) if e.code == 429
                       else base_backoff * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            time.sleep(base_backoff * (attempt + 1))
    return None


def en_article(title: str) -> dict:
    params = {"action": "query", "format": "json", "redirects": 1,
              "prop": "extracts|images", "explaintext": 1, "exlimit": "max",
              "imlimit": 50, "titles": title}
    data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    if not data or "query" not in data:
        return {}
    for p in data["query"].get("pages", {}).values():
        if "missing" in p:
            return {}
        text = p.get("extract") or ""
        # keep section headings in a compact side list
        heads = re.findall(r"^(==+)\s*(.+?)\s*\1\s*$", text, re.M)
        return {
            "title": p.get("title"),
            "text": text[:24000],
            "sections": [h[1] for h in heads][:40],
            "images": [i["title"] for i in p.get("images", [])][:20],
        }
    return {}


def zh_article(title: str) -> dict:
    params = {"action": "query", "format": "json", "redirects": 1,
              "prop": "extracts", "explaintext": 1, "exlimit": "max",
              "titles": title}
    # zh.wikipedia throttles far harder than en.wikipedia
    data = http_json("https://zh.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params),
                     retries=7, base_backoff=5.0)
    if not data or "query" not in data:
        return {"_throttled": True}
    for p in data["query"].get("pages", {}).values():
        if "missing" in p:
            return {}
        return {"title": p.get("title"), "text": (p.get("extract") or "")[:16000]}
    return {}


def process(slug: str) -> None:
    ev_path = VERIFY_DIR / f"{slug}.json"
    if not ev_path.exists():
        return
    ev = json.loads(ev_path.read_text(encoding="utf-8"))
    en_title = ev.get("enwiki", {}).get("title") or ev.get("title_resolved")
    if not en_title or ev.get("enwiki", {}).get("status") != "ok":
        out = {"slug": slug, "en": {}, "zh": {}, "status": "no_page"}
    else:
        en = en_article(en_title)
        time.sleep(0.4)
        zh_title = next(iter(ev.get("wikidata", {}).get("labels") or {}), "")
        zh_titles = ev.get("enwiki", {}).get("zh_titles") or []
        zh = {}
        for zt in zh_titles[:1]:
            zh = zh_article(zt)
            time.sleep(0.4)
        out = {"slug": slug, "en_title": en_title, "en": en, "zh": zh,
               "status": "ok" if en.get("text") else "no_text"}
    (SRC_DIR / f"{slug}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1),
                                          encoding="utf-8")
    with _lock:
        process.done += 1
        if process.done % 25 == 0:
            print(f"  {process.done}/{process.total}", flush=True)


process.done = 0
process.total = 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    SRC_DIR.mkdir(parents=True, exist_ok=True)
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = sorted(p.stem for p in VERIFY_DIR.glob("*.json") if not p.name.startswith("_"))
        if not args.refresh:
            slugs = [s for s in slugs if not (SRC_DIR / f"{s}.json").exists()]
    if args.limit:
        slugs = slugs[:args.limit]
    if not slugs:
        print("nothing to do")
        return
    process.total = len(slugs)
    print(f"fetching source text for {len(slugs)} instruments ...", flush=True)
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(process, slugs))
    ok = sum(1 for s in slugs
             if json.loads((SRC_DIR / f"{s}.json").read_text(encoding="utf-8")).get("en", {}).get("text"))
    print(f"done: {ok}/{len(slugs)} with English source text → {SRC_DIR.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
