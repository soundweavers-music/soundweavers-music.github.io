#!/usr/bin/env python3
"""Annotate duplicate-instrument pairs instead of deleting them.

Policy for this project: duplicates are kept (their URLs may be linked
externally) but must be honest — each pair member gets a distinct display name
and an issue_note naming its counterpart.

These five pairs all resolve to the same enwiki article, verified in
work/verify/<slug>.json:

    agong / agung                  → en:Agung
    claves / rhythm-sticks         → en:Claves
    glass-harmonica /
      hydrodaktulopsychicharmonica → en:Glass harmonica
    paixiao / pan-flute            → distinct articles, but same Chinese name
    steel-drum / steelpan          → en:Steelpan

Usage: python scripts/annotate_alias_pairs.py [--dry-run]
"""
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
BACKUP_DIR = BASE_DIR / "work" / "backup_alias_pairs"

# slug -> (title_zh, note)
PAIRS = {
    "agong": ("阿貢鑼（馬來西亞拼法）",
              "與 Agung 為同一類樂器的不同拼法；此列保留馬來西亞用名。"),
    "agung": ("阿貢鑼（Agung）",
              "與 Agong 為同一類樂器的不同拼法；此列保留印尼／菲律賓用名。"),
    "claves": ("響木（Claves）",
               "與 Rhythm Sticks 同指成對短木棒；此列保留古巴傳統用名。"),
    "rhythm-sticks": ("節奏棒",
                      "英文 Rhythm Sticks 在部分教材中與 Claves（響木）混用；"
                      "兩列並存，此列保留泛稱。"),
    "glass-harmonica": ("玻璃琴（Glass harmonica）",
                        "Hydrodaktulopsychicharmonica 為同一樂器的冗長別名；兩列並存。"),
    "hydrodaktulopsychicharmonica": ("水鍵琴（玻璃琴別名）",
                                     "本名實為 Glass harmonica 的別名；兩列並存，此列保留別名。"),
    "paixiao": ("排簫（Paixiao）",
                "中國古代排簫；與泛稱 Pan Flute 同屬排簫家族但形制有別，兩列並存。"),
    "pan-flute": ("排簫（Pan flute）",
                  "泛稱；具體形制見 Paixiao（中國排簫）等條目。"),
    "steel-drum": ("鋼鼓（Steel drum）",
                   "與 Steelpan 指同一樂器；兩列並存，此列保留英文俗名。"),
    "steelpan": ("鋼鐵鼓（Steelpan）",
                 "與 Steel drum 指同一樂器；兩列並存，此列保留千里達原名。"),
}


def set_key(fm: list[str], key: str, value: str) -> list[str]:
    pat = re.compile(rf"^{re.escape(key)}:")
    out, done = [], False
    for line in fm:
        if pat.match(line):
            if not done:
                out.append(f"{key}: {value}".rstrip())
                done = True
            continue
        out.append(line)
    if not done:
        out.append(f"{key}: {value}".rstrip())
    return out


def get_key(fm: list[str], key: str) -> str:
    m = re.search(rf"^{re.escape(key)}:\s*(.*)$", "\n".join(fm), re.M)
    return m.group(1).strip() if m else ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    changed = 0
    for slug, (title, note) in sorted(PAIRS.items()):
        path = CONTENT_DIR / f"{slug}.md"
        if not path.exists():
            print(f"  ! missing {slug}")
            continue
        text = path.read_text(encoding="utf-8")
        head, sep, body = text.partition("\n---\n")
        fm = head.lstrip("-\n").splitlines()
        old_note = get_key(fm, "issue_note")
        fm = set_key(fm, "title_zh", title)
        # keep any classification note, append the alias note
        merged = f"{old_note}；{note}" if old_note and note not in old_note else (old_note or note)
        fm = set_key(fm, "issue_note", merged)
        new_text = "---\n" + "\n".join(fm) + "\n---\n" + body
        if new_text == text:
            continue
        changed += 1
        print(f"  {slug}: {title}")
        if not args.dry_run:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, BACKUP_DIR / path.name)
            path.write_text(new_text, encoding="utf-8")
    print(("DRY RUN " if args.dry_run else "") + f"annotated {changed} entries")


if __name__ == "__main__":
    main()
