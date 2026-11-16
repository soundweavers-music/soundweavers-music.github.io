#!/usr/bin/env python3
"""Mark instruments that could not be grounded with an honest status.

For instruments where the evidence pipeline found no reliable match (wrong
article, non-instrument page, or no page at all), write:

    verification_status: 待考（來源不足）
    issue_note: <why, citing what was tried>

Existing body text is left in place but each section that still carries an
unverified claim is tagged, so readers are not misled. Nothing is deleted.

Usage: python scripts/mark_unresolved.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
ADJ_DIR = BASE_DIR / "work" / "adjudicate"
BACKUP_DIR = BASE_DIR / "work" / "backup_unresolved"

# Hand-written explanations where the automated note would be vague.
REASONS = {
    "caixa": "英文維基 Caixa 為消歧義頁；樂器義（巴西小鼓）無獨立條目，Wikidata 亦無對應樂器實體。",
    "ceramic-percussion": "「陶土打擊樂器」是材料分類而非單一樂器；英文維基僅有通論性的 Percussion instrument 條目。",
    "citera": "英文維基無 Citera 條目；可能為匈牙利／中歐齊特琴地方名，需專業樂器辭書補證。",
    "kamaycha": "英文維基無 Kamaycha 條目；Wikidata 的 Kamayacha 記錄不完整，無可引用的分類來源。",
    "kudu-horn": "英文維基只有 Shofar（猶太號角）條目，未涵蓋庫杜羚角號；以 Shofar 代證會誤植宗教用途。",
    "oopoochawa": "Wikidata 有 Oopoochawa 實體但無分類陳述；英文維基無對應條目，來源僅及通論性 Lamellophone。",
    "p-fano": "英文維基 Pífano 未建立條目，且同名檢索會落到蘇格蘭 Fife 地區；巴西橫笛的專屬來源待補。",
    "wankara-lyre": "以 Ground bow 代證與本樂器（安地斯鼓／里拉）不符；英文維基無 Wankara 樂器條目。",
}


def set_key(lines: list[str], key: str, value: str) -> list[str]:
    pat = re.compile(rf"^{re.escape(key)}:")
    out, done = [], False
    for line in lines:
        if pat.match(line):
            if not done:
                out.append(f"{key}: {value}")
                done = True
            continue
        out.append(line)
    if not done:
        out.append(f"{key}: {value}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    count = 0
    for slug, reason in sorted(REASONS.items()):
        md = CONTENT_DIR / f"{slug}.md"
        if not md.exists():
            continue
        text = md.read_text(encoding="utf-8")
        parts = text.split("\n---\n", 1)
        if len(parts) < 2:
            continue
        fm = parts[0].lstrip("-\n").splitlines()
        body = parts[1]

        # tag only sections that read as asserted prose (not already placeholders)
        def tag(m: re.Match) -> str:
            name, content = m.group(1), m.group(2).strip()
            if content.startswith("※"):
                return m.group(0)
            return (f"## {name}\n\n※本段來源不足，待補考：{content}\n\n")

        new_body = re.sub(
            r"^## (介紹|聆聽示範|歷史背景|音色描述|樂器材質|教學)[ \t]*\n(.*?)(?=^## |\Z)",
            tag, body, flags=re.S | re.M)

        fm = set_key(fm, "verification_status", "待考（來源不足）")
        fm = set_key(fm, "issue_note", reason)
        new_text = "---\n" + "\n".join(fm) + "\n---\n" + new_body

        count += 1
        print(f"  {slug}: {reason[:40]}")
        if not args.dry_run:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(md, BACKUP_DIR / md.name)
            md.write_text(new_text, encoding="utf-8")
    print(("DRY RUN " if args.dry_run else "") + f"marked {count} unresolved instruments")


if __name__ == "__main__":
    main()
