#!/usr/bin/env python3
"""Resolve instruments that have no enwiki page through Wikidata sitelinks.

For each unresolved slug, search Wikidata for the instrument name, keep hits
whose description reads as a musical instrument, and take the enwiki sitelink
(or zhwiki if English is missing). Verified matches are written to
work/verify/_aliases.json and a compact evidence stub is produced, so the
rewrite step has something grounded to work from.

Usage: python scripts/resolve_via_wikidata.py [--apply]
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from verify_instruments import http_json  # noqa: E402
from resolve_missing_pages import MUSIC_HINT, name_stems  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
VERIFY_DIR = BASE_DIR / "work" / "verify"
ALIAS_FILE = VERIFY_DIR / "_aliases.json"
OUT_DIR = BASE_DIR / "work" / "wikidata_resolve"


def search_entities(query: str, limit: int = 5) -> list[dict]:
    params = {"action": "wbsearchentities", "search": query, "language": "en",
              "uselang": "en", "type": "item", "limit": limit, "format": "json"}
    data = http_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params))
    return (data or {}).get("search", [])


def fetch_entities(qids: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(qids), 40):
        batch = qids[i:i + 40]
        params = {"action": "wbgetentities", "format": "json", "ids": "|".join(batch),
                  "props": "claims|labels|aliases|sitelinks|descriptions",
                  "languages": "en|zh|zh-hant", "sitefilter": "enwiki|zhwiki"}
        data = http_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params), timeout=40)
        if not data:
            continue
        for qid, ent in (data.get("entities") or {}).items():
            if "claims" not in ent:
                continue
            def strs(prop):
                return [c["mainsnak"]["datavalue"]["value"]
                        for c in ent["claims"].get(prop, [])
                        if c.get("mainsnak", {}).get("datavalue")]
            out[qid] = {
                "labels": {k: v["value"] for k, v in (ent.get("labels") or {}).items()},
                "descriptions": {k: v["value"] for k, v in (ent.get("descriptions") or {}).items()},
                "aliases": {k: [a["value"] for a in v][:5]
                            for k, v in (ent.get("aliases") or {}).items()},
                "hs": strs("P1762"),
                "enwiki": (ent.get("sitelinks") or {}).get("enwiki", {}).get("title"),
                "zhwiki": (ent.get("sitelinks") or {}).get("zhwiki", {}).get("title"),
            }
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    aliases = json.loads(ALIAS_FILE.read_text(encoding="utf-8")) if ALIAS_FILE.exists() else {}
    index = json.loads((VERIFY_DIR / "_index.json").read_text(encoding="utf-8"))
    targets = [s for s, v in index.items() if v.get("enwiki") != "ok" and s not in aliases]
    print(f"{len(targets)} instruments to resolve via Wikidata", flush=True)

    # 1. search
    candidates: dict[str, list[str]] = {}
    for i, slug in enumerate(targets, 1):
        ev = json.loads((VERIFY_DIR / f"{slug}.json").read_text(encoding="utf-8"))
        title = re.sub(r"\s*\([^)]*\)", "", ev.get("title_original") or slug)
        hits = search_entities(title)
        time.sleep(0.6)
        qids = [h["id"] for h in hits
                if MUSIC_HINT.search(f"{h.get('label', '')} {h.get('description', '')}")]
        if not qids and " " in title:
            hits = search_entities(title.split()[0])
            time.sleep(0.6)
            qids = [h["id"] for h in hits
                    if MUSIC_HINT.search(f"{h.get('label', '')} {h.get('description', '')}")
                    and name_stems(title) & name_stems(h.get("label", ""))]
        candidates[slug] = qids
        if i % 15 == 0:
            print(f"  searched {i}/{len(targets)}", flush=True)

    # 2. fetch entity details
    all_qids = sorted({q for qs in candidates.values() for q in qs})
    ents = fetch_entities(all_qids)
    print(f"  fetched {len(ents)} entities", flush=True)

    # 3. pick best and write evidence stub
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    resolved = 0
    for slug, qids in candidates.items():
        title = re.sub(r"\s*\([^)]*\)", "", json.loads(
            (VERIFY_DIR / f"{slug}.json").read_text(encoding="utf-8")).get("title_original") or slug)
        stems = name_stems(title)
        best = None
        for qid in qids:
            ent = ents.get(qid)
            if not ent or not ent["enwiki"]:
                continue
            if not (stems & name_stems(ent["enwiki"] + " " + ent["labels"].get("en", ""))):
                continue
            desc = ent["descriptions"].get("en", "")
            # the description must read as an instrument, not a material,
            # band, genre, or natural phenomenon
            if not re.search(r"instrument|drum|flute|string|percussion|horn|"
                             r"trumpet|harp|guitar|lute|bell|gong|pipe|zither|"
                             r"whistle|reed|chime|idiophone|chordophone|"
                             r"membranophone|aerophone|lyre|viol|piano|"
                             r"obo\w*|clarinet|saxophone|organ|cymbal|"
                             r"rattle|clapper|shaker|drum|bow", desc, re.I):
                continue
            if re.search(r"material|wood|metal|alloy|genre|band|group|"
                         r"phenomenon|lightning|weather|river|species|genus|"
                         r"improv\w*|discipline", desc, re.I):
                continue
            best = ent
            break
        if not best:
            continue
        resolved += 1
        aliases[slug] = {"title": best["enwiki"], "how": "wikidata",
                         "item": next(k for k, v in ents.items() if v is best),
                         "desc": best["descriptions"].get("en", "")}
        stub = {"slug": slug, "resolved_via": "wikidata",
                "wd": {"enwiki": best["enwiki"], "zhwiki": best["zhwiki"],
                       "hs": best["hs"], "labels": best["labels"],
                       "descriptions": best["descriptions"], "aliases": best["aliases"]}}
        (OUT_DIR / f"{slug}.json").write_text(json.dumps(stub, ensure_ascii=False, indent=1),
                                              encoding="utf-8")
        print(f"  ✓ {slug} → {best['enwiki']} ({best['descriptions'].get('en', '')[:40]})")

    print(f"resolved {resolved}/{len(targets)} via Wikidata")
    if args.apply:
        ALIAS_FILE.write_text(json.dumps(aliases, ensure_ascii=False, indent=1,
                                         sort_keys=True), encoding="utf-8")
        print(f"aliases now {len(aliases)}")


if __name__ == "__main__":
    main()
