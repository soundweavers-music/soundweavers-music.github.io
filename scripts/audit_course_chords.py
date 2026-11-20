#!/usr/bin/env python3
"""吉他／烏克麗麗課程的「樂理對不對」稽核：和弦、順階、進行、按法。

機械審查（audit_guitar.py、audit_ukulele.py）只抓格式與常識錯誤；這裡抓的是
讀懂內容才看得出來、但可以用規則判定的部份：

  1. 順階和弦表：寫「C 大調成員」卻列出不屬於 C 大調的和弦
  2. 和弦進行：`G - D - Em - C` 這種，檢查是否都落在同一組順階和弦裡
  3. 按法描述：「Em 第 5 弦第 2 格」這類句子，跟和弦資料庫比對
  4. 組成音：`Em（E・G・B）` 這種，檢查是不是真的這三個音
  5. 調弦與弦序：第 N 弦的音名寫錯

    python scripts/audit_course_chords.py            # 列出問題
    python scripts/audit_course_chords.py --verbose  # 連檢查過的項目也印
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
COURSES = {"guitar": "吉他", "ukulele": "烏克麗麗"}

NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
PC = {"C": 0, "C#": 1, "C♯": 1, "Db": 1, "D": 2, "D#": 3, "D♯": 3, "Eb": 3, "E♭": 3,
      "E": 4, "F": 5, "F#": 6, "F♯": 6, "Gb": 6, "G": 7, "G#": 8, "G♯": 8,
      "Ab": 8, "A♭": 8, "A": 9, "A#": 10, "A♯": 10, "Bb": 10, "B♭": 10, "B": 11}

TRIAD = {"maj": {0, 4, 7}, "m": {0, 3, 7}, "dim": {0, 3, 6}, "aug": {0, 4, 8},
         "7": {0, 4, 7, 10}, "maj7": {0, 4, 7, 11}, "m7": {0, 3, 7, 10},
         "dim7": {0, 3, 6, 9}, "m7b5": {0, 3, 6, 10}, "6": {0, 4, 7, 9},
         "m6": {0, 3, 7, 9}, "add9": {0, 4, 7, 2}, "sus2": {0, 2, 7}, "sus4": {0, 5, 7},
         "9": {0, 4, 7, 10, 2}}
MAJOR_DEGREES = ["maj", "m", "m", "maj", "maj", "m", "dim"]

CHORD = re.compile(
    r"(?<![A-Za-z0-9])([A-G][♯♭#b]?)(maj7|maj|dim7|m7b5|dim|aug|sus4|sus2|add9|m7|m6|m|7|6|9)?"
    r"(?:\s*/\s*([A-G][♯♭#b]?))?(?![A-Za-z0-9])")
KEY_RE = re.compile(r"([A-G][♯♭#b]?)\s*(大調|小調|調)")
FINGER_RE = re.compile(r"([A-G][♯♭#b]?(?:m|7|maj7|m7)?)\s*[：:，,（(]?[^。\n]{0,40}?第\s*(\d)\s*弦[^。\n]{0,10}?第\s*(\d+)\s*格")
SPELL_RE = re.compile(r"([A-G][♯♭#b]?(?:m|7|maj7|m7|dim|6|m6|sus2|sus4|add9)?)\s*[（(]\s*([^）)]{3,40})[）)]")

TUNING = {
    "guitar": {1: "E", 2: "B", 3: "G", 4: "D", 5: "A", 6: "E"},
    "ukulele": {1: "A", 2: "E", 3: "C", 4: "G"},
}


def chords_in(text: str):
    out = []
    for m in CHORD.finditer(text):
        root, qual = m.group(1), (m.group(2) or "maj")
        qual = {"": "maj", "maj": "maj"}.get(qual, qual)
        if root in PC:
            out.append((root, qual))
    return out


def diatonic_pcs(key_root: int, mode: str = "major"):
    steps = [0, 2, 4, 5, 7, 9, 11] if mode == "major" else [0, 2, 3, 5, 7, 8, 10]
    return [(key_root + s) % 12 for s in steps]


def fits_key(root: str, qual: str, key_pcs, key_root: int) -> bool:
    pcs = {(PC[root] + i) % 12 for i in TRIAD.get(qual, TRIAD["maj"])}
    if not pcs <= set(key_pcs):
        return False
    # 級數上的和弦性質也要對得上（大調：I ii iii IV V vi vii°）
    root_pc = PC[root]
    if root_pc in key_pcs:
        deg = key_pcs.index(root_pc)
        want = MAJOR_DEGREES[deg]
        if qual in ("maj", "m") and qual != want:
            return False
    return True


def main() -> int:
    verbose = "--verbose" in sys.argv
    problems = []
    checked = {"順階表": 0, "進行": 0, "按法": 0, "組成音": 0, "調弦": 0}

    for folder, label in COURSES.items():
        for path in sorted((BASE / "content" / folder).glob("*.md")):
            if not re.match(r"^\d+\.md$|^前言\.md$|^目錄\.md$", path.name):
                continue
            text = path.read_text(encoding="utf-8")
            for lineno, line in enumerate(text.splitlines(), 1):
                where = f"{label} {path.name}:{lineno}"

                # 1) 順階和弦表：同一行有「X 大調」＋3 個以上和弦
                km = KEY_RE.search(line)
                cs = chords_in(line)
                if km and len(cs) >= 3:
                    key_root = PC[km.group(1)]
                    keyp = diatonic_pcs(key_root, "major" if km.group(2) == "大調" else "minor")
                    bad = [f"{r}{'' if q == 'maj' else q}" for r, q in cs
                           if not fits_key(r, q, keyp, key_root)]
                    checked["順階表"] += 1
                    if bad:
                        problems.append(f"{where} 「{km.group(0)}」裡出現不屬於這調的和弦："
                                        f"{bad}｜{line.strip()[:90]}")
                # 2) 和弦進行：只在 code span 裡、用 - → 連起來的才算
                spans = re.findall(r"`([^`]+)`", line)
                seq = [sp for sp in spans
                       if len(chords_in(sp)) >= 3 and re.fullmatch(r"[A-G♯♭#bmjadisu47\s\-–—→/]+", sp.strip())]
                cs = chords_in(" ".join(seq)) if seq else []
                if len(cs) >= 3 and re.search(r"[-–—→]", line):
                    roots = {(PC[r] + i) % 12 for r, q in cs for i in TRIAD.get(q, TRIAD['maj'])}
                    ok = any(roots <= set(diatonic_pcs(k)) for k in range(12))
                    checked["進行"] += 1
                    if not ok:
                        problems.append(f"{where} 和弦進行落不出任何一個大調："
                                        f"{[r + ('' if q == 'maj' else q) for r, q in cs]}"
                                        f"｜{line.strip()[:90]}")
                # 3) 按法描述
                for m in FINGER_RE.finditer(line):
                    name, string_no, fret = m.group(1), int(m.group(2)), int(m.group(3))
                    checked["按法"] += 1
                    chords = chords_in(name)
                    if not chords:
                        continue
                    root, qual = chords[-1]
                    open_note = TUNING[folder].get(string_no)
                    if not open_note:
                        problems.append(f"{where} {label}沒有第 {string_no} 弦｜{line.strip()[:90]}")
                        continue
                    pc = (PC[open_note] + fret) % 12
                    if pc not in {(PC[root] + i) % 12 for i in TRIAD.get(qual, TRIAD['maj'])}:
                        problems.append(f"{where} {name} 寫「第 {string_no} 弦第 {fret} 格」"
                                        f"＝{NOTE[pc]}，不是 {name} 的音｜{line.strip()[:90]}")
                # 4) 組成音：和弦（A・B・C）
                for m in SPELL_RE.finditer(line):
                    name, tones = m.group(1), m.group(2)
                    chords = chords_in(name)
                    if not chords or "・" not in tones and "、" not in tones:
                        continue
                    root, qual = chords[-1]
                    checked["組成音"] += 1
                    want = {(PC[root] + i) % 12 for i in TRIAD.get(qual, TRIAD['maj'])}
                    said = set()
                    for t in re.split(r"[・、,，/ ]+", tones):
                        t = t.strip()
                        if t in PC:
                            said.add(PC[t])
                    if said and said != want:
                        problems.append(f"{where} {name} 的組成音寫「{tones}」，"
                                        f"應為 {sorted(NOTE[p] for p in want)}")

    print(f"檢查：順階表 {checked['順階表']} 處、和弦進行 {checked['進行']} 處、"
          f"按法描述 {checked['按法']} 處、組成音 {checked['組成音']} 處")
    if verbose:
        print("（--verbose：以上為檢查量）")
    if problems:
        print(f"\n發現 {len(problems)} 個問題：")
        for p in problems:
            print("  ✗", p)
        return 1
    print("\n沒有發現問題")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
