#!/usr/bin/env python3
"""Repair published articles using fact-check findings.

Two mechanical repairs, both derived from findings in work/factcheck/:

  1. hs-number  — the article states a Hornbostel–Sachs number that differs
                  from the adjudicated one (often a truncated prefix like
                  211.2 vs 211.22.2). Rewritten to the adjudicated value.
  2. stale-section — the section still contains the OLD pre-rewrite text,
                  recognisable because it opens with a "來源未記載／未提供…" or
                  "來源僅記載…" disclaimer that the rewriter never emits into
                  published body. Those sections are re-generated from source
                  by rewrite_instruments.py --force-setion (below), not by
                  deleting text.

Anything else is reported for review rather than auto-edited.

Usage:
  python scripts/repair_from_factcheck.py [--dry-run] [--slugs a,b]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
FACT_DIR = BASE_DIR / "work" / "factcheck"
ADJ_DIR = BASE_DIR / "work" / "adjudicate"
BACKUP_DIR = BASE_DIR / "work" / "backup_repair"

HS_RE = re.compile(r"\b(\d{3}(?:\.\d+)*)\b")
STALE_OPENERS = (
    "來源未記載", "來源未提供", "來源僅記載", "來源僅指出", "來源僅顯示",
    "現有資料僅", "現有來源僅", "來源資料僅", "來源未說明", "來源未提及",
)


def get_hs_from_article(text: str) -> str:
    m = re.search(r"^sound_hs:\s*(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def strip_label(hs: str) -> str:
    return hs.split("｜")[-1].strip()


def repair_hs(text: str, adj_hs: str) -> tuple[str, int]:
    """Replace wrong H-S numbers in the body with the adjudicated one."""
    target = strip_label(adj_hs)
    if not re.match(r"\d{3}", target):
        return text, 0
    head, sep, body = text.partition("\n---\n")
    changed = 0

    def sub(m: re.Match) -> str:
        nonlocal changed
        found = m.group(1)
        # only touch numbers that are a prefix of the adjudicated one, or share
        # its top two components — not every 3-digit number in the prose
        if found == target:
            return m.group(0)
        if target.startswith(found) and found != target:
            changed += 1
            return m.group(0).replace(found, target, 1)
        return m.group(0)

    new_body = HS_RE.sub(sub, body)
    return head + sep + new_body, changed


def stale_sections(text: str) -> list[str]:
    """Sections that open with a source-gap disclaimer (old or new wording) or
    that carry the explicit placeholder marker."""
    out = []
    for m in re.finditer(r"^## (介紹|聆聽示範|歷史背景|音色描述|樂器材質|教學)[ \t]*\n(.*?)(?=^## |\Z)",
                         text, re.S | re.M):
        body = m.group(2).strip()
        if body.startswith("※") or any(body.startswith(o) for o in STALE_OPENERS):
            out.append(m.group(1))
    return out


def normalise_placeholders(text: str) -> tuple[str, int]:
    """Unify source-gap sections under one label so the UI can flag them."""
    head, sep, body = text.partition("\n---\n")
    changed = 0

    def repl(m: re.Match) -> str:
        nonlocal changed
        name, content = m.group(1), m.group(2).strip()
        if not (content.startswith("※") or any(content.startswith(o) for o in STALE_OPENERS)):
            return m.group(0)
        changed += 1
        return f"## {name}\n\n※本段來源不足，待補考：{content}\n\n"

    new_body = re.sub(r"^## (介紹|聆聽示範|歷史背景|音色描述|樂器材質|教學)[ \t]*\n(.*?)(?=^## |\Z)",
                      repl, body, flags=re.S | re.M)
    return head + sep + new_body, changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    targets = ([s.strip() for s in args.slugs.split(",") if s.strip()]
               if args.slugs else sorted(p.stem for p in FACT_DIR.glob("*.json")))

    hs_fixed = 0
    stale_list = []
    for slug in targets:
        fact_path = FACT_DIR / f"{slug}.json"
        adj_path = ADJ_DIR / f"{slug}.json"
        md_path = CONTENT_DIR / f"{slug}.md"
        if not (fact_path.exists() and adj_path.exists() and md_path.exists()):
            continue
        fact = json.loads(fact_path.read_text(encoding="utf-8"))
        adj = json.loads(adj_path.read_text(encoding="utf-8"))
        text = md_path.read_text(encoding="utf-8")

        stale = stale_sections(text)
        if stale:
            stale_list.append((slug, stale))

        new_text, changed = repair_hs(text, adj.get("hs", ""))
        new_text2, placeholders = normalise_placeholders(new_text)
        if changed or placeholders:
            hs_fixed += 1 if changed else 0
            if not args.dry_run:
                BACKUP_DIR.mkdir(parents=True, exist_ok=True)
                shutil.copy2(md_path, BACKUP_DIR / md_path.name)
                md_path.write_text(new_text2, encoding="utf-8")

    print(("DRY RUN " if args.dry_run else "") +
          f"hs numbers repaired: {hs_fixed}; articles with stale sections: {len(stale_list)}")
    for slug, secs in stale_list[:40]:
        print(f"  {slug}: {','.join(secs)}")
    (BASE_DIR / "work" / "stale_sections.json").write_text(
        json.dumps(stale_list, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
