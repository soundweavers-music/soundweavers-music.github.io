#!/usr/bin/env python3
"""Verify the enwiki titles adjudicators proposed for mismatched instruments.

A proposed title is accepted only if the page exists, is not a disambiguation
page, and its short description or intro reads as a musical instrument that
shares a name stem with the instrument. Accepted fixes are written into
work/verify/_aliases.json (so evidence can be re-harvested) and flagged in the
adjudication file.

Usage: python scripts/verify_enwiki_fixes.py [--apply]
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
ADJ_DIR = BASE_DIR / "work" / "adjudicate"
ALIAS_FILE = VERIFY_DIR / "_aliases.json"


def page_info(title: str) -> dict | None:
    params = {"action": "query", "format": "json", "redirects": 1,
              "prop": "pageprops|extracts", "exchars": 500, "explaintext": 1,
              "titles": title}
    data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    if not data or "query" not in data:
        return None
    for p in data["query"].get("pages", {}).values():
        if "missing" in p:
            return None
        props = p.get("pageprops") or {}
        return {"title": p.get("title"),
                "desc": props.get("wikibase-shortdesc", ""),
                "item": props.get("wikibase_item", ""),
                "disambiguation": "disambiguation" in props,
                "extract": (p.get("extract") or "")[:500]}
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    aliases = json.loads(ALIAS_FILE.read_text(encoding="utf-8")) if ALIAS_FILE.exists() else {}
    accepted, rejected = {}, {}
    for path in sorted(ADJ_DIR.glob("*.json")):
        adj = json.loads(path.read_text(encoding="utf-8"))
        fix = (adj.get("enwiki_fix") or "").strip()
        if not fix:
            continue
        slug = adj["slug"]
        info = page_info(fix)
        time.sleep(0.8)
        reason = ""
        if not info:
            reason = "頁面不存在"
        elif info["disambiguation"]:
            reason = "消歧義頁"
        elif not MUSIC_HINT.search(f"{info['title']} {info['desc']}"):
            reason = f"不像樂器條目（{info['desc'] or '無簡述'}）"
        else:
            stems = name_stems(re.sub(r"\s*\([^)]*\)", "", adj.get("title_original", "")))
            if stems and not (stems & name_stems(info["title"] + " " + fix)):
                reason = "名稱字根不符"
        if reason:
            rejected[slug] = {"proposed": fix, "reason": reason}
            adj["enwiki_fix_verified"] = False
        else:
            accepted[slug] = {"title": info["title"], "how": "adjudicated",
                              "item": info["item"], "desc": info["desc"]}
            adj["enwiki_fix"] = info["title"]
            adj["enwiki_fix_verified"] = True
        if args.apply:
            path.write_text(json.dumps(adj, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"accepted {len(accepted)} | rejected {len(rejected)}")
    for slug, v in rejected.items():
        print(f"  ✗ {slug}: {v['proposed']} — {v['reason']}")
    for slug, v in accepted.items():
        print(f"  ✓ {slug} → {v['title']} ({v['desc'][:40]})")

    if args.apply:
        aliases.update(accepted)
        ALIAS_FILE.write_text(json.dumps(aliases, ensure_ascii=False, indent=1,
                                         sort_keys=True), encoding="utf-8")
        print(f"aliases now {len(aliases)} → {ALIAS_FILE.name}")


if __name__ == "__main__":
    main()
