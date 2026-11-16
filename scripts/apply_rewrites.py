#!/usr/bin/env python3
"""Apply adjudicated metadata + rewritten sections to content/instruments/*.md.

This is the ONLY script that writes to content/. Everything it writes comes
from work/adjudicate/<slug>.json and work/rewrite/<slug>.json, both of which
were produced by the evidence and validation pipeline.

What changes:
  frontmatter  class_code / frontend_class / subcategory — only when the
               adjudicated family differs and maps cleanly to a class code
               sound_hs             — the ballot's H-S number, keeping our label
               region_culture       — only when two of three reviewers say wrong
               title_zh             — only when two of three say the name is wrong
               verification_status  — 已查證 / 已查證（部分欄位待補）
               issue_note           — replaced with a sourced note; never copied
                                      from the shifted legacy column
  body         ## 介紹 / 聆聽示範 / 歷史背景 / 音色描述 / 樂器材質 / 教學 —
               only the sections present in the rewrite proposal; anything the
               grader could not ground keeps its existing text.

Every touched file is backed up to work/backup/<slug>.md before writing.
Nothing is committed or built here.

Usage:
  python scripts/apply_rewrites.py --dry-run
  python scripts/apply_rewrites.py
  python scripts/apply_rewrites.py --slugs accordion,aulos
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
REWRITE_DIR = BASE_DIR / "work" / "rewrite"
BACKUP_DIR = BASE_DIR / "work" / "backup"

# H-S family → (class_code, frontend_class, default subcategory)
FAMILY_TO_CLASS = {
    "氣鳴": ("A1", "吹奏與氣息樂器", "簧片樂器"),
    "弦鳴": ("A2", "弦樂器", "撥弦與抱持弦樂"),
    "體鳴": ("A3", "鼓與打擊樂器", "鑼鐘與金屬敲擊"),
    "膜鳴": ("A3", "鼓與打擊樂器", "鼓皮與鼓類"),
    "電鳴": ("A4", "電子與電聲樂器", "電聲改造樂器"),
}

# A subcategory only survives a family change if it belongs to the new family.
SUBCATEGORY_FAMILY = {
    "撥弦與抱持弦樂": "A2", "平放弦與擊弦": "A2", "擦弦、鍵控與輪弦": "A2",
    "豎琴、里拉與開放弦": "A2", "平放弦與齊特琴": "A2",
    "鼓皮與鼓類": "A3", "鑼鐘與金屬敲擊": "A3", "沙鈴、刮器與小打擊": "A3",
    "無簧吹管": "A1", "風箱與自由簧": "A1", "簧片樂器": "A1",
    "號角與唇振": "A1", "風袋樂器": "A1",
    "電聲改造樂器": "A4", "取樣與磁帶": "A4", "控制器與數位介面": "A4",
    "合成器": "A4", "鼓機與節奏機": "A4",
}

BODY_ORDER = ["介紹", "聆聽示範", "歷史背景", "音色描述", "樂器材質", "教學"]


def split_frontmatter(text: str) -> tuple[list[str], str]:
    """Return (frontmatter lines, body). Preserves the original line order."""
    if not text.startswith("---"):
        return [], text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return [], text
    return parts[1].strip("\n").splitlines(), parts[2]


def set_key(lines: list[str], key: str, value: str) -> list[str]:
    """Replace a frontmatter line in place, or append before the end."""
    pattern = re.compile(rf"^{re.escape(key)}:")
    out = []
    replaced = False
    for line in lines:
        if pattern.match(line):
            if not replaced:
                out.append(f"{key}: {value}")
                replaced = True
            continue
        out.append(line)
    if not replaced:
        out.append(f"{key}: {value}")
    return out


def get_key(lines: list[str], key: str) -> str:
    pattern = re.compile(rf"^{re.escape(key)}:\s*(.*)$")
    for line in lines:
        m = pattern.match(line)
        if m:
            return m.group(1).strip()
    return ""


def replace_section(body: str, name: str, text: str) -> str:
    """Replace '## name' content, preserving heading style and neighbors."""
    heading = f"## {name}"
    idx = body.find(heading)
    if idx == -1:
        return body
    after = idx + len(heading)
    # skip to end of the heading line
    nl = body.find("\n", after)
    if nl == -1:
        return body + f"\n\n{text}\n"
    # next '## ' or '### ' at start of a line, or EOF — a rewritten section
    # replaces its sub-headings (e.g. 聆聽示範's old 代表性作品) too
    nxt = re.search(r"^#{2,3} ", body[nl + 1:], re.M)
    end = (nl + 1 + nxt.start()) if nxt else len(body)
    tail = body[end:] if nxt else ""
    return body[:nl + 1] + f"\n{text}\n" + (f"\n{tail}" if tail else "")


def class_update(adj_family: str, cur_code: str,
                 cur_sub: str) -> tuple[str, str, str] | None:
    """Return (class_code, frontend_class, subcategory) for a clean remap."""
    target = FAMILY_TO_CLASS.get(adj_family)
    if not target:
        return None
    code, frontend, default_sub = target
    if code == cur_code:
        return None
    # Keep an existing subcategory only when it belongs to the new family.
    sub = cur_sub if SUBCATEGORY_FAMILY.get(cur_sub) == code else default_sub
    return code, frontend, sub


PLACEHOLDER_MARK = "※本段來源不足，待補考："


def is_placeholder(text: str) -> bool:
    """A section the rewriter admits it could not ground (has content, no facts)."""
    return text.startswith(PLACEHOLDER_MARK)


def build_issue_note(adj: dict, rw: dict | None) -> str:
    parts = []
    fam = adj.get("family")
    hs = adj.get("hs")
    if fam and fam != "不確定":
        basis = next((v.get("family_basis") for v in adj.get("votes", [])
                      if v.get("family") == fam and v.get("family_basis")), "")
        parts.append(f"分類查證：{fam}" + (f"（{hs}）" if hs and hs != "不確定" else "")
                     + (f"；依據：{basis[:60]}" if basis else ""))
    if adj.get("duplicate_of"):
        parts.append(f"與「{adj['duplicate_of']}」互為別名／變體")
    if rw and rw.get("failed_sections"):
        parts.append("內文段落來源不足未改寫：" + "、".join(rw["failed_sections"]))
    return "；".join(parts)


def apply_one(slug: str, dry_run: bool) -> dict:
    md_path = CONTENT_DIR / f"{slug}.md"
    if not md_path.exists():
        return {"slug": slug, "status": "missing_file"}
    adj_path = ADJ_DIR / f"{slug}.json"
    rw_path = REWRITE_DIR / f"{slug}.json"
    adj = json.loads(adj_path.read_text(encoding="utf-8")) if adj_path.exists() else None
    rw = json.loads(rw_path.read_text(encoding="utf-8")) if rw_path.exists() else None
    if not adj and not (rw and rw.get("status") == "ok"):
        return {"slug": slug, "status": "nothing_to_apply"}

    text = md_path.read_text(encoding="utf-8")
    lines, body = split_frontmatter(text)
    changes = []

    if adj:
        cur_code = get_key(lines, "class_code")
        cur_sub = get_key(lines, "subcategory")
        remap = class_update(adj.get("family", ""), cur_code, cur_sub)
        if remap:
            lines = set_key(lines, "class_code", remap[0])
            lines = set_key(lines, "frontend_class", remap[1])
            if remap[2] != cur_sub:
                lines = set_key(lines, "subcategory", remap[2])
            changes.append(f"class {cur_code}→{remap[0]}")
        else:
            # class stays, but the subcategory may still belong to another
            # family (e.g. an acoustic guitar filed under 電聲改造樂器)
            valid = SUBCATEGORY_FAMILY.get(cur_sub)
            if valid and valid != cur_code:
                target_sub = FAMILY_TO_CLASS.get(adj.get("family", ""), ("", "", ""))[2]
                if target_sub and SUBCATEGORY_FAMILY.get(target_sub) == cur_code:
                    lines = set_key(lines, "subcategory", target_sub)
                    changes.append(f"subcategory {cur_sub}→{target_sub}")

        hs = adj.get("hs", "")
        if hs and hs != "不確定":
            cur_hs = get_key(lines, "sound_hs")
            label = cur_hs.split("｜")[0] if "｜" in cur_hs else ""
            new_hs = f"{label}｜{hs}" if label and label not in ("待確認",) else hs
            if new_hs != cur_hs:
                lines = set_key(lines, "sound_hs", new_hs)
                changes.append("sound_hs")

        if adj.get("region") == "wrong":
            fix = (adj.get("region_fix") or "").strip()
            # 133 of 232 "wrong" verdicts carry no usable replacement; those keep
            # the legacy value and only get flagged in issue_note.
            if fix and fix != "不確定":
                lines = set_key(lines, "region_culture", fix)
                changes.append("region")

        if adj.get("name") == "wrong":
            fix = (adj.get("name_fix") or "").strip()
            if fix and fix != "不確定" and re.search(r"[一-鿿]", fix):
                lines = set_key(lines, "title_zh", fix)
                changes.append("title_zh")

        note = build_issue_note(adj, rw if rw and rw.get("status") == "ok" else None)
        lines = set_key(lines, "issue_note", note)

    body_changed = []
    if rw and rw.get("status") == "ok":
        for name in BODY_ORDER:
            sec = (rw.get("sections") or {}).get(name)
            if not sec:
                continue
            if sec.startswith(PLACEHOLDER_MARK):
                # The rewriter could not ground this section. Keep whatever the
                # article already says (deleting legacy prose loses real
                # information); the gap is recorded in issue_note instead.
                continue
            body = replace_section(body, name, sec)
            body_changed.append(name)

    if adj:
        verified = "已查證" if not (rw and rw.get("failed_sections")) else "已查證（部分欄位待補）"
        lines = set_key(lines, "verification_status", verified)

    if not changes and not body_changed:
        return {"slug": slug, "status": "no_change"}

    new_text = "---\n" + "\n".join(lines) + "\n---\n" + body
    if not dry_run:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(md_path, BACKUP_DIR / f"{slug}.md")
        md_path.write_text(new_text, encoding="utf-8")
    return {"slug": slug, "status": "applied" if not dry_run else "would_apply",
            "frontmatter": changes, "sections": body_changed}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = sorted({p.stem for p in ADJ_DIR.glob("*.json")}
                       | {p.stem for p in REWRITE_DIR.glob("*.json")})

    stats = {}
    sample = []
    for slug in slugs:
        res = apply_one(slug, args.dry_run)
        stats[res["status"]] = stats.get(res["status"], 0) + 1
        if res.get("sections") and len(sample) < 5:
            sample.append(f"{slug}: {','.join(res['frontmatter'] + res['sections'])}")
    print(("DRY RUN " if args.dry_run else "") + f"{len(slugs)} instruments: {stats}")
    for s in sample:
        print("  " + s)


if __name__ == "__main__":
    main()
