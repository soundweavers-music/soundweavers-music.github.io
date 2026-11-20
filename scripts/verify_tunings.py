#!/usr/bin/env python3
"""核對指板工具裡的調弦定義（tools/fretboard/index.html 的 INSTRUMENTS_DATA）。

調弦是硬事實：第幾弦是什麼音、哪一條降了幾格，寫錯就是整張指板圖都錯。
這裡用一份人工核對過的參考表（來源：Wikipedia 各調弦條目＋常見教材寫法）逐條
比對「第 1 弦到第 n 弦」的音名與八度。

    python scripts/verify_tunings.py
    python scripts/verify_tunings.py --all     # 連沒列入參考表的也列出來
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
TOOL = BASE / "tools" / "fretboard" / "index.html"

# 參考表：{樂器: {調弦名稱: [第1弦, 第2弦, ...]}}（跟工具一樣由高音弦排到低音弦）
REF = {
    "吉他 Guitar": {
        "標準調弦 Standard": ["E4", "B3", "G3", "D3", "A2", "E2"],
        "Drop D": ["E4", "B3", "G3", "D3", "A2", "D2"],
        "Drop C": ["D4", "A3", "F3", "C3", "G2", "C2"],        # C G C F A D
        "Open D": ["D4", "A3", "F♯3", "D3", "A2", "D2"],
        "Open G": ["D4", "B3", "G3", "D3", "G2", "D2"],
        "Open C": ["E4", "C4", "G3", "C3", "G2", "C2"],        # C G C G C E
        "DADGAD": ["D4", "A3", "G3", "D3", "A2", "D2"],
        "Half-step Down": ["E♭4", "B♭3", "G♭3", "D♭3", "A♭2", "E♭2"],
        "Full-step Down": ["D4", "A3", "F3", "C3", "G2", "D2"],  # D G C F A D
        "Nashville Tuning": ["E4", "B3", "G4", "D4", "A3", "E3"],
    },
    "烏克麗麗 Ukulele": {
        "標準 (高音 GCEA)": ["A4", "E4", "C4", "G4"],
        "Low G": ["A4", "E4", "C4", "G3"],
        "D 調 (ADF♯B)": ["B4", "F♯4", "D4", "A4"],
        "Baritone (DGBE)": ["E4", "B3", "G3", "D3"],
    },
    "電貝斯 Bass": {
        "標準 4弦": ["G2", "D2", "A1", "E1"],
        "Standard 5-String": ["G2", "D2", "A1", "E1", "B0"],
        "Standard 6-String": ["C3", "G2", "D2", "A1", "E1", "B0"],  # B E A D G C
        "Drop D (4弦)": ["G2", "D2", "A1", "D1"],
        "Half-step Down": ["G♭2", "D♭2", "A♭1", "E♭1"],
    },
    "班卓琴 Banjo": {
        "標準 Open G (5弦)": ["D4", "B3", "G3", "D3", "G4"],
        "Open C": ["D4", "B3", "G3", "C3", "G4"],      # gCGBD
        "Double C": ["D4", "C4", "G3", "C3", "G4"],    # gCGCD
        "Sawmill": ["D4", "C4", "G3", "D3", "G4"],     # gDGCD
        "Irish (4弦)": ["D4", "B3", "G3", "D3"],       # DGBD
    },
    "曼陀林 Mandolin": {
        "標準": ["E5", "A4", "D4", "G3"],
        "跨弦標準 (CGDA)": ["A4", "D4", "G3", "C3"],
        "Open G": ["D5", "G4", "D4", "G3"],            # G D G D
    },
}


def load_tool() -> list[dict]:
    s = TOOL.read_text(encoding="utf-8")
    i = s.find("INSTRUMENTS_DATA = ")
    j = s.find("];", i)
    return json.loads(s[i + len("INSTRUMENTS_DATA = "): j + 1])


def main() -> int:
    show_all = "--all" in sys.argv
    data = load_tool()
    problems, unchecked = [], []
    checked = 0
    for inst in data:
        name = inst["name"]
        ref = REF.get(name)
        for tuning, notes in inst["tunings"].items():
            if not ref or tuning not in ref:
                unchecked.append(f"{name} · {tuning}：{' '.join(notes)}")
                continue
            checked += 1
            want = ref[tuning]
            got = [n.replace("♯", "♯").replace("♭", "♭") for n in notes]
            if got != want:
                problems.append(f"{name} · {tuning}\n    現在：{' '.join(got)}\n    應為：{' '.join(want)}")
    print(f"核對 {checked} 組調弦，問題 {len(problems)} 組；未列入參考表 {len(unchecked)} 組")
    for p in problems:
        print("  ✗", p)
    if show_all and unchecked:
        print("\n未列入參考表（需要再查）：")
        for u in unchecked:
            print("  ·", u)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
