#!/usr/bin/env python3
"""Multi-source evidence collector for content/instruments/*.md.

Four independent engines per instrument:
  1. en.wikipedia.org  — page status, short description, intro, langlinks
                         (→ zh.wikipedia title), categories, wikitext infobox
                         (Hornbostel-Sachs, origin, names)
  2. zh.wikipedia.org  — intro extract for the linked Chinese article
  3. wikidata.org      — P1762 (Hornbostel-Sachs), P31, P279, zh/zh-tw labels
  4. wikimedia commons — page image

Each slug is written to work/verify/<slug>.json as soon as it is fetched, so
the run is resumable and safe to interrupt. Summary: work/verify/_index.json.

Usage:
  python scripts/verify_instruments.py                # all, skipping finished
  python scripts/verify_instruments.py --refresh      # refetch everything
  python scripts/verify_instruments.py --slugs a,b    # specific slugs
  python scripts/verify_instruments.py --limit 50
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
OUT_DIR = BASE_DIR / "work" / "verify"
UA = "WorldInstrumentsVerify/1.0 (educational; https://soundweavers-music.github.io)"
TIMEOUT = 25
WORKERS = 6

_lock = threading.Lock()


def http_json(url: str, retries: int = 3, timeout: int = TIMEOUT) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
                json.JSONDecodeError, OSError):
            time.sleep(0.8 * (attempt + 1))
    return None


def parse_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    data = {}
    for line in parts[1].splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            k, v = line.split(":", 1)
            data[k.strip()] = v.strip()
    return data


# ---------------------------------------------------------------- Wikipedia
def fetch_enwiki(titles: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        params = {
            "action": "query", "format": "json", "redirects": 1,
            "prop": "pageprops|extracts|langlinks|categories", "explaintext": 1,
            "exintro": 0, "exchars": 1200, "exlimit": "max", "lllang": "zh",
            "cllimit": "max", "clshow": "!hidden",
            "titles": "|".join(batch),
        }
        data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
        if not data or "query" not in data:
            for t in batch:
                out[t] = {"status": "fetch_error"}
            continue
        query = data["query"]
        norm = {n["from"]: n["to"] for n in query.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in query.get("redirects", [])}
        by_title = {p.get("title", ""): p for p in query.get("pages", {}).values()}
        for t in batch:
            key = redir.get(norm.get(t, t), norm.get(t, t))
            p = by_title.get(key)
            if p is None or "missing" in p:
                out[t] = {"status": "missing"}
                continue
            props = p.get("pageprops") or {}
            out[t] = {
                "status": "ok",
                "title": p.get("title"),
                "description": props.get("wikibase-shortdesc", ""),
                "item": props.get("wikibase_item", ""),
                "disambiguation": "disambiguation" in props,
                "extract": (p.get("extract") or "").strip(),
                "zh_titles": [l["*"] for l in p.get("langlinks", [])],
                "categories": [c["title"].replace("Category:", "")
                               for c in p.get("categories", [])],
            }
    return out


def fetch_wikitext(title: str) -> dict:
    params = {"action": "parse", "page": title, "prop": "wikitext", "format": "json",
              "formatversion": 2, "redirects": 1}
    data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    if not data or "parse" not in data:
        return {"status": "missing"}
    w = data["parse"].get("wikitext", "")
    hs = re.findall(r"\|\s*hornbostel[-_ ]?sachs[^\n=]*=\s*([^\n|}]+)", w, re.I)
    origin = re.findall(r"\|\s*(?:origin|country|developed|region|related)\s*=\s*([^\n|}]+)",
                        w, re.I)
    names = re.findall(r"\|\s*(?:names|other_names|alias|native_name)\s*=\s*([^\n|}]+)",
                       w, re.I)
    return {
        "status": "ok",
        "hs_raw": [wiki_plain(h) for h in hs][:3],
        "origin_raw": [wiki_plain(o) for o in origin][:4],
        "names_raw": [wiki_plain(n) for n in names][:2],
    }


def fetch_zhwiki(titles: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i in range(0, len(titles), 20):
        batch = [t for t in titles[i:i + 20] if t]
        if not batch:
            continue
        params = {"action": "query", "format": "json", "redirects": 1,
                  "prop": "extracts", "explaintext": 1, "exchars": 1200,
                  "titles": "|".join(batch)}
        data = http_json("https://zh.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
        if not data or "query" not in data:
            continue
        norm = {n["from"]: n["to"] for n in data["query"].get("normalized", [])}
        redir = {r["from"]: r["to"] for r in data["query"].get("redirects", [])}
        pages = {p.get("title"): p for p in data["query"].get("pages", {}).values()}
        for t in batch:
            key = redir.get(norm.get(t, t), norm.get(t, t))
            p = pages.get(key)
            if p and "missing" not in p:
                out[t] = (p.get("extract") or "").strip()
    return out


# ---------------------------------------------------------------- Wikidata
HS_ROOTS = {
    "1": "idiophone 體鳴", "11": "struck idiophone 敲擊體鳴",
    "12": "plucked idiophone 撥奏體鳴", "13": "friction idiophone 擦奏體鳴",
    "14": "blown idiophone 吹奏體鳴",
    "2": "membranophone 膜鳴", "21": "struck drum 敲擊鼓",
    "22": "plucked drum 撥奏鼓", "23": "friction drum 擦奏鼓",
    "24": "singing membrane 歌唱膜",
    "3": "chordophone 弦鳴", "31": "simple chordophone 簡單弦鳴",
    "32": "composite chordophone 複合弦鳴",
    "4": "aerophone 氣鳴", "41": "free aerophone 自由氣鳴",
    "42": "wind instrument proper 管樂器",
    "5": "electrophone 電鳴",
}


def hs_root(hs: str) -> str:
    m = re.match(r"\s*([1-5])(\d)?", hs or "")
    if not m:
        return ""
    two = (m.group(1) + (m.group(2) or ""))
    return HS_ROOTS.get(two) or HS_ROOTS.get(m.group(1), "")


def fetch_wikidata(items: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    items = [x for x in items if x]
    for i in range(0, len(items), 40):
        batch = items[i:i + 40]
        params = {"action": "wbgetentities", "format": "json", "ids": "|".join(batch),
                  "props": "claims|labels|aliases|sitelinks",
                  "languages": "en|zh|zh-hant|zh-tw|zh-hk|ja"}
        data = http_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params), timeout=40)
        if not data:
            continue
        for qid, ent in (data.get("entities") or {}).items():
            if "claims" not in ent:
                continue
            def ids(prop):
                return [c["mainsnak"]["datavalue"]["value"]["id"]
                        for c in ent["claims"].get(prop, [])
                        if c.get("mainsnak", {}).get("datavalue")]
            def strs(prop):
                return [c["mainsnak"]["datavalue"]["value"]
                        for c in ent["claims"].get(prop, [])
                        if c.get("mainsnak", {}).get("datavalue")]
            out[qid] = {
                "labels": {k: v["value"] for k, v in (ent.get("labels") or {}).items()},
                "aliases": {k: [a["value"] for a in v][:6]
                            for k, v in (ent.get("aliases") or {}).items()},
                "hs": strs("P1762"),
                "instance_of": ids("P31"),
                "subclass_of": ids("P279"),
                "zhwiki": (ent.get("sitelinks") or {}).get("zhwiki", {}).get("title"),
            }
    return out


def fetch_label_map(qids: set[str]) -> dict[str, str]:
    qids = sorted(q for q in qids if q)
    out: dict[str, str] = {}
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        params = {"action": "wbgetentities", "format": "json", "ids": "|".join(batch),
                  "props": "labels", "languages": "en|zh"}
        data = http_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params), timeout=40)
        if not data:
            continue
        for qid, ent in (data.get("entities") or {}).items():
            labs = ent.get("labels") or {}
            out[qid] = (labs.get("en") or labs.get("zh") or {}).get("value", qid)
    return out


# ---------------------------------------------------------------- helpers
def wiki_plain(s: str) -> str:
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"&#\d+;|&[a-z]+;", " ", s)
    s = s.replace("{{", "").replace("}}", "")
    return re.sub(r"\s+", " ", s.replace("\n", " ")).strip(" |;,")


def build_one(slug: str, fm: dict, en: dict, wiki: dict, zh: dict, wd: dict,
              labels: dict, alias: dict | None = None) -> dict:
    title = (alias or {}).get("title") or fm.get("title_original") or slug
    info = en.get(title, {"status": "missing"})
    item = info.get("item")
    wde = wd.get(item) or {}
    return {
        "slug": slug,
        "title_original": fm.get("title_original", ""),
        "title_zh": fm.get("title_zh", ""),
        "current": {k: fm.get(k, "") for k in
                    ("class_code", "frontend_class", "subcategory", "family_std",
                     "sound_hs", "playing_method", "region_culture",
                     "verification_status", "issue_note", "image", "youtube_ids")},
        "enwiki": info,
        "title_resolved": title if (alias or {}).get("title") else "",
        "wikitext": wiki.get(title) or {},
        "zhwiki_intro": {t: zh.get(t, "") for t in info.get("zh_titles", [])},
        "wikidata": {
            "qid": item,
            **{k: wde.get(k) for k in ("labels", "aliases", "hs", "zhwiki")},
            "instance_of": [labels.get(q, q) for q in wde.get("instance_of", [])],
            "subclass_of": [labels.get(q, q) for q in wde.get("subclass_of", [])],
        },
    }


def collect(slugs: list[str]) -> None:
    files = {p.stem: p for p in CONTENT_DIR.glob("*.md")}
    meta = {s: parse_frontmatter(files[s].read_text(encoding="utf-8"))
            for s in slugs if s in files}
    alias_path = OUT_DIR / "_aliases.json"
    aliases = json.loads(alias_path.read_text(encoding="utf-8")) if alias_path.exists() else {}
    titles = {s: (aliases.get(s, {}).get("title") or m.get("title_original") or s)
              for s, m in meta.items()}

    print(f"[1/4] enwiki pages for {len(set(titles.values()))} titles ...", flush=True)
    en = fetch_enwiki(sorted(set(titles.values())))

    print("[2/4] wikitext infoboxes (concurrent) ...", flush=True)
    need = [t for t in titles.values()
            if en.get(t, {}).get("status") == "ok" and not en[t].get("disambiguation")]
    wiki: dict[str, dict] = {}
    done = 0

    def _wt(t: str) -> None:
        nonlocal done
        wiki[t] = fetch_wikitext(t)
        with _lock:
            done += 1
            if done % 50 == 0:
                print(f"    wikitext {done}/{len(need)}", flush=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(_wt, need))

    print("[3/4] zhwiki intros ...", flush=True)
    zh_titles = sorted({t for info in en.values() for t in info.get("zh_titles", [])})
    zh: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fetch_zhwiki, zh_titles[i:i + 20])
                   for i in range(0, len(zh_titles), 20)]
        for f in futures:
            zh.update(f.result())

    print("[4/4] wikidata ...", flush=True)
    items = [info.get("item") for info in en.values() if info.get("item")]
    wd = fetch_wikidata(items)
    labels = fetch_label_map({q for e in wd.values()
                              for q in e["instance_of"] + e["subclass_of"]})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index_path = OUT_DIR / "_index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    for slug, fm in meta.items():
        ev = build_one(slug, fm, en, wiki, zh, wd, labels, aliases.get(slug))
        (OUT_DIR / f"{slug}.json").write_text(
            json.dumps(ev, ensure_ascii=False, indent=1), encoding="utf-8")
        wde = wd.get(ev["wikidata"]["qid"]) or {}
        index[slug] = {
            "enwiki": ev["enwiki"].get("status"),
            "item": ev["wikidata"]["qid"] or "",
            "hs_wd": (wde.get("hs") or [""])[0],
            "hs_root": hs_root((wde.get("hs") or [""])[0]),
            "desc": ev["enwiki"].get("description", ""),
            "zh": (ev["enwiki"].get("zh_titles") or [""])[0],
        }
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for s in meta if en.get(titles[s], {}).get("status") == "ok")
    print(f"done: {len(meta)} instruments (enwiki ok {ok}) "
          f"→ {OUT_DIR.relative_to(BASE_DIR)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    all_slugs = [p.stem for p in sorted(CONTENT_DIR.glob("*.md"))]
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = all_slugs
        if not args.refresh and (OUT_DIR / "_index.json").exists():
            idx = json.loads((OUT_DIR / "_index.json").read_text(encoding="utf-8"))
            slugs = [s for s in slugs if s not in idx]
    if args.limit:
        slugs = slugs[:args.limit]
    if not slugs:
        print("nothing to do")
        return
    collect(slugs)


if __name__ == "__main__":
    main()
