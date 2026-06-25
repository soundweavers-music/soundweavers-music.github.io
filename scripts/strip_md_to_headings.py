#!/usr/bin/env python3
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent.parent / "content" / "instruments"

KEEP_FIELDS = [
    "title", "original_name", "category", "country", "era",
    "sound_class", "hs_class", "family", "playing_method",
    "body_listening", "soundscape", "region_type", "image",
]

KEEP_HEADINGS = {"## 介紹", "## 歷史背景", "## 音色描述", "### 讀者導覽"}


def strip_to_headings(text):
    if not text.startswith("---\n"):
        return text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return text
    frontmatter_lines = parts[1].splitlines()
    kept_fields = []
    for line in frontmatter_lines:
        if ":" in line:
            key = line.split(":", 1)[0].strip()
            if key in KEEP_FIELDS:
                kept_fields.append(line)
    new_frontmatter = "\n".join(kept_fields)
    body = parts[2].strip()
    heading_lines = [line for line in body.splitlines() if line in KEEP_HEADINGS]
    new_body = "\n\n".join(heading_lines)
    return f"---\n{new_frontmatter}\n---\n{new_body}\n"


def main(dry_run=True):
    files = sorted(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(files)} files")
    for path in files:
        original = path.read_text(encoding="utf-8")
        result = strip_to_headings(original)
        if result != original:
            if dry_run:
                print(f"[DRY RUN] Would modify: {path.name}")
            else:
                path.write_text(result, encoding="utf-8")
                print(f"Modified: {path.name}")


if __name__ == "__main__":
    import sys
    dry_run = "--apply" not in sys.argv
    if dry_run:
        print("=== DRY RUN (pass --apply to actually modify files) ===")
    main(dry_run=dry_run)
