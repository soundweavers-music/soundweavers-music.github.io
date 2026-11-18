#!/usr/bin/env python3
"""Insert one exercise card under every 練習 section of the vocal course.

Chapters 1–32 have `### 練習N：標題` headings — one card each.
Chapters 33–50 keep their exercises as a numbered list under `## 現在就做`,
so they get a single card at the top of that section.

The cards are reused across exercises that teach the same body action; the
mapping lives here so it is reviewable in one place.

Usage:  python scripts/insert_vocal_exercises.py [--check]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

VOCAL = Path(__file__).resolve().parent.parent / "content" / "vocal"
EX = "/assets/vocal/ex"

# chapter → card slug per exercise, in document order
BY_CHAPTER = {
    1: ["posture", "diaphragm", "sigh", "longtone"],
    2: ["posture", "jaw", "posture-2", "song"],
    3: ["diaphragm", "longtone", "fricative", "longtone", "song"],
    4: ["fricative", "longtone", "dynamic", "breath-points"],
    5: ["posture", "jaw", "hum", "song"],
    6: ["lip-trill", "lip-trill", "glissando", "song"],
    7: ["jaw", "vowel", "vowel", "song"],
    8: ["hand-chest", "hand-chest", "nasal-check", "song"],
    9: ["sigh", "hand-chest", "tone-pair", "song", "fry"],
    10: ["hum", "hum", "hum", "glissando", "song"],
    11: ["tone-pair", "tone-pair", "break", "song"],
    12: ["song", "longtone", "song", "break"],
    13: ["range", "range", "range", "record"],
    14: ["emotion-map", "song", "breath-points", "emotion-map", "song"],
    15: ["hydrate", "checklist", "steam", "rest"],
    16: ["diaphragm", "fricative", "fricative", "dynamic"],
    17: ["soft-onset", "soft-onset", "dynamic", "song"],
    18: ["fricative", "dynamic", "soft-onset", "song", "record"],
    19: ["tone-pair", "tone-pair", "glissando", "mix"],
    20: ["glottis-closed", "glottis-closed", "fry", "dynamic"],
    21: ["tone-pair", "glissando", "mix"],
    22: ["false-folds", "false-folds", "false-folds", "glissando"],
    23: ["fry", "fry", "fry", "song"],
    24: ["break", "vowel", "mix", "song"],
    25: ["mix", "vowel", "octave", "mix"],
    26: ["mix", "vowel", "glissando", "mix", "song"],
    27: ["mix", "vowel", "octave", "mix"],
    28: ["mix", "nasal-check", "mix", "dynamic"],
    29: ["hum", "vowel", "nasal-check", "hum", "song"],
    30: ["hum", "hum", "hum", "octave"],
    31: ["record", "mix", "mix", "mix", "record"],
    32: ["false-folds", "glottis-closed", "tone-pair", "glissando", "song"],
}

# chapters without 練習 sub-headings: one card at the top of 現在就做
SECTION_CARD = {
    33: "vowel", 34: "vowel", 35: "timing", 36: "timing", 37: "glissando",
    38: "emotion-map", 39: "sigh", 40: "breath-points", 41: "emotion-map",
    42: "steps-3", 43: "record", 44: "record", 45: "record", 46: "record",
    47: "posture", 48: "mix", 49: "steps-3", 50: "record",
}

HEAD_RE = re.compile(r"^### (練習[一二三四五六七八九十]+)：?(.*)$", re.M)


def main() -> None:
    check = "--check" in sys.argv
    added = skipped = 0
    problems: list[str] = []
    for ch in range(1, 51):
        path = VOCAL / f"vocal_ch{ch}.md"
        src = path.read_text(encoding="utf-8")
        lines = src.split("\n")

        if ch in BY_CHAPTER:
            slugs = BY_CHAPTER[ch]
            idx = [i for i, ln in enumerate(lines) if HEAD_RE.match(ln)]
            if len(idx) != len(slugs):
                problems.append(f"ch{ch}: {len(idx)} 練習 headings vs {len(slugs)} cards")
                continue
            for i, slug in zip(reversed(idx), reversed(slugs)):
                title = HEAD_RE.match(lines[i]).group(2).strip()
                img = f"![練習示意圖：{title}]({EX}/{slug}.svg)"
                if i + 2 < len(lines) and EX in lines[i + 2]:
                    skipped += 1
                    continue
                # drop a stale card that points at a different file
                if i + 2 < len(lines) and lines[i + 2].startswith("![練習示意圖"):
                    lines[i + 2] = img
                    skipped += 1
                    continue
                lines[i + 1:i + 1] = ["", img]
                added += 1
        else:
            slug = SECTION_CARD.get(ch)
            if not slug:
                continue
            try:
                i = lines.index("## 現在就做")
            except ValueError:
                problems.append(f"ch{ch}: no 現在就做 heading")
                continue
            img = f"![練習示意圖：本章動作拆解]({EX}/{slug}.svg)"
            if i + 2 < len(lines) and EX in lines[i + 2]:
                skipped += 1
            else:
                lines[i + 1:i + 1] = ["", img]
                added += 1

        new = "\n".join(lines)
        if not check and new != src:
            path.write_text(new, encoding="utf-8")

    verb = "would add" if check else "added"
    print(f"{verb} {added} cards, {skipped} already present")
    for p in problems:
        print("  !", p)


if __name__ == "__main__":
    main()
