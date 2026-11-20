#!/usr/bin/env python3
"""把和弦資料庫寫成人看得懂的文字資料庫：content/chord/<樂器>.md

資料來源是 scripts/_chord_library.js（指板工具用的同一份）。每一種調弦都會
列出：和弦名、按格（第 1 弦在前）、手指、封閉與否、其他把位。斜線和弦
（C/E、G/B…）跟在對應調弦的最後面。

    python scripts/gen_chord_library.py   # 先產生／更新資料庫
    python scripts/gen_chord_md.py        # 再寫成 .md
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
LIB = BASE / "scripts" / "_chord_library.js"
OUT = BASE / "content" / "chord"

NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
META = {
    "0": ("吉他 Guitar", "guitar"),
    "2": ("烏克麗麗 Ukulele", "ukulele"),
    "3": ("班卓琴 Banjo", "banjo"),
    "4": ("曼陀林 Mandolin", "mandolin"),
}
QUAL_ZH = {
    "maj": "大三和弦", "m": "小三和弦", "7": "屬七和弦", "maj7": "大七和弦",
    "m7": "小七和弦", "aug": "增三和弦", "dim": "減三和弦", "dim7": "減七和弦",
    "m7b5": "半減七和弦", "6": "大六和弦", "m6": "小六和弦", "9": "屬九和弦",
    "sus2": "掛留二和弦", "sus4": "掛留四和弦", "add9": "加九和弦",
}


def chord_name(key: str) -> str:
    root_s, rest = key.split(":")
    qual, _, bass_s = rest.partition("/")
    name = NOTE[int(root_s)] + ("" if qual == "maj" else qual)
    if bass_s:
        name += "/" + NOTE[int(bass_s)]
    return name


def frets_txt(frets) -> str:
    return " ".join("✕" if f is None or f < 0 else str(f) for f in frets)


def fingers_txt(fingers) -> str:
    return " ".join("·" if not f else str(f) for f in fingers)


def barre_txt(barre) -> str:
    if not barre:
        return "—"
    return f"第 {barre['fret']} 格 {barre['from'] + 1}–{barre['to'] + 1} 弦"


def write_instrument(inst_idx: str, tunings: dict, name: str, fname: str) -> int:
    lines = [f"# {name} 和弦資料庫", "",
             "> 這份檔案由 `scripts/gen_chord_md.py` 從 `scripts/_chord_library.js` 產生。",
             "> 按格一律「第 1 弦在前」；✕ 表示不彈；手指 1=食指 2=中指 3=無名指 4=小指。",
             "> 「其他把位」是同一個和弦在別的位置的按法（指板工具可以切換）。", ""]
    total = 0
    for tuning, table in tunings.items():
        lines.append(f"## {tuning}")
        lines.append("")
        base = [k for k in table if "/" not in k]
        slash = [k for k in table if "/" in k]
        lines.append(f"共 {len(table)} 個（和弦 {len(base)}、斜線和弦 {len(slash)}）")
        lines.append("")
        lines.append("| 和弦 | 類型 | 按格（1→n 弦） | 手指 | 封閉 | 其他把位 |")
        lines.append("| :-- | :-- | :-- | :-- | :-- | :-- |")
        for key in sorted(base, key=lambda k: (int(k.split(":")[0]), k.split(":")[1])):
            e = table[key]
            qual = key.split(":")[1]
            alts = "；".join(frets_txt(a["frets"]) for a in e.get("alts", [])) or "—"
            lines.append(f"| **{chord_name(key)}** | {QUAL_ZH.get(qual, qual)} | {frets_txt(e['frets'])} "
                         f"| {fingers_txt(e['fingers'])} | {barre_txt(e.get('barre'))} | {alts} |")
            total += 1
        if slash:
            lines.append("")
            lines.append("### 斜線和弦（指定低音）")
            lines.append("")
            lines.append("| 和弦 | 按格 | 手指 | 其他把位 |")
            lines.append("| :-- | :-- | :-- | :-- |")
            for key in sorted(slash):
                e = table[key]
                alts = "；".join(frets_txt(a["frets"]) for a in e.get("alts", [])) or "—"
                lines.append(f"| **{chord_name(key)}** | {frets_txt(e['frets'])} "
                             f"| {fingers_txt(e['fingers'])} | {alts} |")
                total += 1
        lines.append("")
    (OUT / f"{fname}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  {name}: {total} 個和弦 → content/chord/{fname}.md")
    return total


def main() -> int:
    src = LIB.read_text(encoding="utf-8")
    lib = json.loads(src[src.find("{"): src.rfind("}") + 1])
    OUT.mkdir(parents=True, exist_ok=True)
    grand = 0
    for inst_idx, tunings in lib.items():
        if inst_idx not in META:
            continue
        name, fname = META[inst_idx]
        grand += write_instrument(inst_idx, tunings, name, fname)
    # 索引檔：各樂器、各調弦幾個和弦
    idx = ["# 和弦資料庫索引", "",
           "> 由 `scripts/gen_chord_md.py` 產生；詳細指法在各自的檔案。", ""]
    for inst_idx, tunings in lib.items():
        if inst_idx not in META:
            continue
        name, fname = META[inst_idx]
        idx.append(f"## {name}（[{fname}.md]({fname}.md)）")
        for tuning, table in tunings.items():
            slash = sum(1 for k in table if "/" in k)
            idx.append(f"- {tuning}：{len(table)} 個（含斜線 {slash}）")
        idx.append("")
    (OUT / "CHORD_INDEX.md").write_text("\n".join(idx) + "\n", encoding="utf-8")
    print(f"合計 {grand} 個和弦")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
