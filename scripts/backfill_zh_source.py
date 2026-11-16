#!/usr/bin/env python3
"""Fill in zhwiki extracts that the throttled full-text pass missed.

Reads work/verify/source/*.json, retries the ones whose zh block is empty,
one request at a time with generous backoff. Only the zh side is touched.

Usage: python scripts/backfill_zh_source.py [--limit N]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_source_text import SRC_DIR, VERIFY_DIR, zh_article  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    targets = []
    for path in sorted(SRC_DIR.glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        if d.get("zh") and d["zh"].get("text"):
            continue
        ev_path = VERIFY_DIR / path.name
        if not ev_path.exists():
            continue
        ev = json.loads(ev_path.read_text(encoding="utf-8"))
        zh_titles = ev.get("enwiki", {}).get("zh_titles") or []
        if not zh_titles:
            continue
        targets.append((path, zh_titles[0]))
    if args.limit:
        targets = targets[:args.limit]
    print(f"backfilling zh source for {len(targets)} instruments ...", flush=True)

    filled = 0
    for i, (path, title) in enumerate(targets, 1):
        zh = zh_article(title)
        if zh.get("_throttled"):
            print("  throttled — waiting 60s", flush=True)
            time.sleep(60)
            continue
        if zh.get("text"):
            d = json.loads(path.read_text(encoding="utf-8"))
            d["zh"] = zh
            path.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
            filled += 1
        time.sleep(2.0)
        if i % 10 == 0:
            print(f"  {i}/{len(targets)} ({filled} filled)", flush=True)
    print(f"filled {filled}/{len(targets)}")


if __name__ == "__main__":
    main()
