#!/usr/bin/env python3
"""Prepare the mandolin book for the static site.

Source: content/曼陀林知識全書/曼陀林_易讀版_完整.md (22 chapters, 289 images).
Output: content/mandolin/<chapter-slug>.md + assets/mandolin/img/*.webp

Steps
  1. split the book at "第 N 章" headings into one Markdown file per chapter,
     keeping the Part label the chapter belongs to
  2. copy referenced images into the site asset tree, downscaling to 900px
     WebP (the originals are 1536px JPEG, ~104MB total)
  3. write content/mandolin/_index.json with chapter order, titles, part
     grouping and word counts for the index page

Idempotent: images are skipped when the .webp already exists.

Usage: python scripts/prepare_mandolin.py [--force]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = BASE_DIR / "content" / "曼陀林知識全書"
SRC_MD = SRC_DIR / "曼陀林_易讀版_完整.md"
OUT_DIR = BASE_DIR / "content" / "mandolin"
IMG_OUT = BASE_DIR / "assets" / "mandolin" / "img"

MAX_WIDTH = 900
QUALITY = 78

PART_LABELS = {
    "B": "歷史、家族與琴型",
    "C": "構造、材料與製作",
    "D": "演奏技法與音樂表現",
    "E": "曲風與樂團合奏",
    "G": "專輯欣賞與聆聽應用",
}


def split_chapters(text: str) -> list[dict]:
    """Split at top-level '# 第 N 章' headings, tracking Part labels."""
    lines = text.splitlines()
    chapters: list[dict] = []
    current_part = "入門"
    cur = None

    chapter_re = re.compile(r"^# 第 (\d+) 章　?(.+)$")
    part_re = re.compile(r"^# Part ([A-Z])[　 ]*(.+)$")

    for line in lines:
        m = chapter_re.match(line)
        if m:
            if cur:
                chapters.append(cur)
            cur = {
                "num": int(m.group(1)),
                "title": m.group(2).strip(),
                "part": current_part,
                "lines": [],
            }
            continue
        p = part_re.match(line)
        if p:
            current_part = f"Part {p.group(1)}　{p.group(2).strip()}"
            continue
        if cur is not None:
            cur["lines"].append(line)
    if cur:
        chapters.append(cur)
    return chapters


def rewrite_image_refs(body: str) -> tuple[str, list[str]]:
    """Point image refs at the compressed site assets; return used source names."""
    used: list[str] = []

    def repl(m: re.Match) -> str:
        alt, src = m.group(1), m.group(2)
        name = Path(src).name
        if name not in used:
            used.append(name)
        # Relative to the chapter page (e.g. /mandolin/01/) so the links keep
        # working when the site is served from a sub-path.
        return f"![{alt}](../../assets/mandolin/img/{Path(name).stem}.webp)"

    return re.sub(r"!\[([^\]]*)\]\(((?:images|figures)/[^)]+)\)", repl, body), used


def compress(src: Path, dst: Path, force: bool) -> bool:
    from PIL import Image
    if dst.exists() and not force:
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = im.convert("RGB")
        if im.width > MAX_WIDTH:
            ratio = MAX_WIDTH / im.width
            im = im.resize((MAX_WIDTH, round(im.height * ratio)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=QUALITY, method=6)
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-encode all images")
    args = ap.parse_args()

    text = SRC_MD.read_text(encoding="utf-8")
    chapters = split_chapters(text)
    if not chapters:
        raise SystemExit("no chapters found")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_OUT.mkdir(parents=True, exist_ok=True)

    all_images: set[str] = set()
    index = []
    for ch in chapters:
        body = "\n".join(ch["lines"]).strip()
        body, used = rewrite_image_refs(body)
        all_images.update(used)

        slug = f"{ch['num']:02d}"
        # strip the in-chapter H1 duplicates: keep subsections only
        fm = [
            "---",
            f"chapter: {ch['num']}",
            f"title: {ch['title']}",
            f"part: {ch['part']}",
            f"words: {len(body)}",
            "---",
            "",
        ]
        (OUT_DIR / f"{slug}.md").write_text("\n".join(fm) + body + "\n", encoding="utf-8")
        index.append({
            "num": ch["num"],
            "slug": slug,
            "title": ch["title"],
            "part": ch["part"],
            "chars": len(body),
        })
        print(f"  ch{ch['num']:>2} {ch['title'][:28]:<30} {len(body):>7} chars")

    (OUT_DIR / "_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    # compress images
    done = skipped = 0
    for name in sorted(all_images):
        for sub in ("images", "figures"):
            src = SRC_DIR / sub / name
            if src.exists():
                dst = IMG_OUT / (Path(name).stem + ".webp")
                if compress(src, dst, args.force):
                    done += 1
                else:
                    skipped += 1
                break
        else:
            print(f"  ! missing {name}")

    total = sum(f.stat().st_size for f in IMG_OUT.glob("*.webp"))
    print(f"\nchapters {len(chapters)} | images encoded {done}, cached {skipped}")
    print(f"image payload {total / 1e6:.1f} MB (was ~107 MB)")


if __name__ == "__main__":
    main()
