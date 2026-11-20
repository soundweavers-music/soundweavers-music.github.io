#!/usr/bin/env python3
"""拿線上和弦資料庫對照我們的指型（多來源交叉查證）。

來源（都是公開的 JSON／固定頁面，不需要 API key）：
  1. chords-db（github: tombatossals/chords-db）—— 吉他、烏克麗麗各數百個指型
  2. 我們的規則驗算（verify_chord_data.py）—— 組成音對不對

比對方式：我們的 frets 是「第 1 弦在前」，chords-db 是「第 6 弦在前」，
反轉後逐條比對；chords-db 的 baseFret > 1 表示把位，先換算成實際格數。

判讀原則：
  - 我們的指型出現在 chords-db 的清單裡 → 一致
  - 不在清單裡，但組成音正確 → 可能是另一種合理按法（列出來人工看）
  - 組成音錯誤 → 一定錯（由 verify_chord_data.py 負責）

    python scripts/verify_chord_online.py
    python scripts/verify_chord_online.py --show-missing
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
LIB = BASE / "scripts" / "_chord_library.js"
CACHE = BASE / "work" / "chords-db"
DB_BASE = "https://raw.githubusercontent.com/tombatossals/chords-db/master/lib"

NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
DB_KEY = ["C", "Csharp", "D", "Eb", "E", "F", "Fsharp", "G", "Ab", "A", "Bb", "B"]
DB_SUFFIX = {
    "maj": "major", "m": "minor", "7": "7", "maj7": "maj7", "m7": "m7",
    "aug": "aug", "dim": "dim", "dim7": "dim7", "m7b5": "m7b5",
    "6": "6", "m6": "m6", "9": "9", "sus2": "sus2", "sus4": "sus4", "add9": "add9",
}
# 我們的樂器索引 → chords-db 檔案；只有標準調弦有對照資料
TARGETS = {0: ("guitar", "guitar"), 2: ("ukulele", "ukulele")}


def fetch(name: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    url = f"{DB_BASE}/{name}.json"
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    data = urllib.request.urlopen(req, timeout=60).read()
    path.write_bytes(data)
    return json.loads(data)


def absolute(pos: dict) -> list[int]:
    """chords-db 的 frets（第 6 弦在前）換成實際格數，仍是第 6 弦在前。"""
    base = pos.get("baseFret", 1)
    out = []
    for f in pos["frets"]:
        if f <= 0:
            out.append(f)
        else:
            out.append(f + base - 1 if base > 1 else f)
    return out


def main() -> int:
    show_missing = "--show-missing" in sys.argv
    src = LIB.read_text(encoding="utf-8")
    lib = json.loads(src[src.find("{"): src.rfind("}") + 1])

    total = matched = 0
    missing: list[str] = []
    mismatched_notes: list[str] = []

    for inst, (dbname, label) in TARGETS.items():
        db = fetch(dbname)
        table = next(iter(lib[str(inst)].values()))
        for key, entry in table.items():
            root_s, qual = key.split(":")
            root = int(root_s)
            suffix = DB_SUFFIX.get(qual)
            if suffix is None:
                continue
            chords = db["chords"].get(DB_KEY[root], [])
            positions = [p for c in chords if c["suffix"] == suffix for p in c["positions"]]
            if not positions:
                continue
            ours = list(reversed(entry["frets"]))     # 第 6 弦在前，跟 chords-db 一致
            ours_abs = [(-1 if f < 0 else f) for f in ours]
            total += 1
            if any(absolute(p) == ours_abs for p in positions):
                matched += 1
            else:
                missing.append(f"{label} {NOTE[root]}{'' if qual == 'maj' else qual} "
                               f"我們的 {ours}；chords-db 有 {len(positions)} 種，"
                               f"低把位其中一種 {absolute(positions[0])}")

    print(f"對照 chords-db：{total} 個和弦，指型完全一致 {matched}，"
          f"不在官方清單 {len(missing)}")
    if missing and show_missing:
        print("\n不在 chords-db 清單裡的（多半是我們自己挑的另一種按法，需人工看）：")
        for m in missing[:60]:
            print("  ·", m)
    elif missing:
        print("  （加 --show-missing 看是哪些）")
    for m in mismatched_notes:
        print("  ✗", m)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
