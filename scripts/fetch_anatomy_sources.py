#!/usr/bin/env python3
"""從 Wikimedia Commons 抓解剖底圖原始檔（有耐心地重試）。

這個網路的 upload.wikimedia.org 會持續回 429，所以這支腳本每 3 分鐘試一次、
最多試 15 輪（約 45 分鐘）。抓齊就結束，抓不到就留下已完成的檔案。

    python scripts/fetch_anatomy_sources.py
    python scripts/fetch_anatomy_sources.py --interval 300 --rounds 20

檔案存在時會跳過，所以可以重複執行。
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DEST = BASE / "assets" / "vocal" / "_anatomy" / "src"

# Commons 檔名 → 本地檔名
WANTED = {
    "Vocal fold scheme.svg": "vocal-fold-scheme.svg",
    "Neutral Sagittal Section.svg": "neutral-sagittal-section.svg",
    "Mouvement diaphragme respiration.svg": "diaphragm-movement.svg",
    "Vocal fold vibration and airflow.svg": "vocal-fold-vibration.svg",
}

UA = {"User-Agent": "WorldSoundsEncyclopedia/1.0 (educational site; contact: site owner)"}


def image_info(title: str) -> dict:
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json"
        "&prop=imageinfo&iiprop=url|extmetadata&titles="
        + urllib.parse.quote("File:" + title)
    )
    req = urllib.request.Request(url, headers=UA)
    d = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
    page = next(iter(d["query"]["pages"].values()))
    return page["imageinfo"][0]


def try_fetch(title: str) -> bool:
    local = DEST / WANTED[title]
    if local.exists() and local.stat().st_size > 20000:
        return True
    try:
        info = image_info(title)
    except Exception as exc:                                  # noqa: BLE001
        print(f"  api failed: {exc}", flush=True)
        return False
    try:
        req = urllib.request.Request(info["url"], headers=UA)
        data = urllib.request.urlopen(req, timeout=90).read()
    except Exception as exc:                                  # noqa: BLE001
        print(f"  download failed: {exc}", flush=True)
        return False
    if not data.lstrip().startswith(b"<?xml") and b"<svg" not in data[:2000]:
        print("  not an svg, skipped", flush=True)
        return False
    local.write_bytes(data)
    lic = info["extmetadata"].get("LicenseShortName", {}).get("value", "?")
    print(f"  saved {local.name} ({len(data) // 1024} KB, {lic})", flush=True)
    return True


def main(argv) -> int:
    interval = 180
    rounds = 15
    if "--interval" in argv:
        interval = int(argv[argv.index("--interval") + 1])
    if "--rounds" in argv:
        rounds = int(argv[argv.index("--rounds") + 1])

    DEST.mkdir(parents=True, exist_ok=True)
    pending = [t for t, local in WANTED.items()
               if not (DEST / local).exists() or (DEST / local).stat().st_size < 20000]

    for r in range(rounds):
        print(f"round {r + 1}/{rounds}: {len(pending)} to go", flush=True)
        still = []
        for title in pending:
            print(" -", title, flush=True)
            if not try_fetch(title):
                still.append(title)
            time.sleep(5)
        pending = still
        if not pending:
            print("ALL DONE", flush=True)
            return 0
        if r < rounds - 1:
            time.sleep(interval)

    print(f"GAVE UP: {len(pending)} missing", flush=True)
    for t in pending:
        print("  missing:", t, flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
