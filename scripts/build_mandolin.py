#!/usr/bin/env python3
"""Build the /mandolin/ section: index + 22 chapter pages.

Content comes from content/mandolin/*.md (produced by prepare_mandolin.py).
Layout mirrors the vocal/digitalmusic course pages so the whole "學習" area
shares one visual language.

Output: outputs/world-instruments-static/mandolin/...
Run AFTER build_static_site.py (it reuses that module's page() template).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_extra as bve  # noqa: E402  (page(), markdown_to_html, OUTPUT_DIR)

CONTENT_DIR = BASE_DIR / "content" / "mandolin"
OUT_DIR = bve.OUTPUT_DIR / "mandolin"

PART_ORDER = ["入門", "Part B", "Part C", "Part D", "Part E", "Part G"]
PART_TITLES = {
    "入門": "入門",
    "Part B": "歷史、家族與琴型",
    "Part C": "構造、材料與製作",
    "Part D": "演奏技法與音樂表現",
    "Part E": "曲風與樂團合奏",
    "Part G": "專輯欣賞與聆聽應用",
}


def part_key(part: str) -> str:
    return part.split("　")[0].strip()


def load_chapters() -> list[dict]:
    index = json.loads((CONTENT_DIR / "_index.json").read_text(encoding="utf-8"))
    for ch in index:
        ch["path"] = CONTENT_DIR / f"{ch['slug']}.md"
        ch["part_key"] = part_key(ch["part"])
    return index


def body_of(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    parts = text.split("\n---\n", 1)
    return parts[1] if len(parts) > 1 else text


def build_index(chapters: list[dict]) -> None:
    grouped: dict[str, list[dict]] = {}
    for ch in chapters:
        grouped.setdefault(ch["part_key"], []).append(ch)

    sections = []
    for key in PART_ORDER:
        items = grouped.get(key)
        if not items:
            continue
        rows = []
        for ch in items:
            slug, num, title, chars = ch["slug"], ch["num"], ch["title"], ch["chars"]
            href = bve.resolve_url(OUT_DIR / "index.html", f"/mandolin/{slug}/")
            rows.append(
                f'<li class="chapter-item has-link">'
                f'<a href="{href}">'
                f'<span class="ch-num done">{num}</span>'
                f'<span class="ch-title">{bve.escape(title)}</span>'
                f'<span class="ch-status ch-status-done">{chars:,} 字</span>'
                f'</a></li>'
            )
        title = PART_TITLES.get(key, key)
        sections.append(
            f'<section class="vocal-level">'
            f'<div class="vocal-level-header"><h2>{bve.escape(title)}</h2></div>'
            f'<ol class="chapter-list">{"".join(rows)}</ol></section>'
        )

    total_chars = sum(c["chars"] for c in chapters)
    body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">Mandolin Handbook</p>
    <h1>曼陀林專區</h1>
    <p class="lead">從八根弦、五度調弦到顫音與跨弦，再到選琴、製琴與專輯導聆——22 章完整的中文曼陀林知識庫，全書內容均經多來源查證並改寫為易讀版本。</p>
    <p class="hero-stats" style="text-align:left;margin-top:20px">
      <span><strong>{len(chapters)}</strong> 章</span>
      <span><strong>{total_chars // 10000}</strong> 萬字</span>
      <span><strong>5</strong> 大部分</span>
    </p>
  </section>
  <div class="vocal-page">
    <div class="mandolin-sections">{"".join(sections)}</div>
  </div>
</main>"""
    bve.write(OUT_DIR / "index.html", bve.page(
        "曼陀林專區", body, OUT_DIR / "index.html",
        meta_description="22 章完整的中文曼陀林知識庫：弦組、調弦、構造、製琴、演奏技法、曲風合奏與專輯導聆。"))


def build_chapters(chapters: list[dict]) -> None:
    lookup = {c["num"]: c for c in chapters}
    for ch in chapters:
        ch_dir = OUT_DIR / ch["slug"]
        ch_dir.mkdir(parents=True, exist_ok=True)
        html_body = bve.markdown_to_html(body_of(ch["path"]), strip_first_h1=False)

        prev_num, next_num = ch["num"] - 1, ch["num"] + 1
        if prev_num in lookup:
            prev_href = bve.resolve_url(ch_dir / "index.html", f"/mandolin/{lookup[prev_num]['slug']}/")
            prev_link = f'<a class="vocal-nav-link" href="{prev_href}">← 上一章</a>'
        else:
            prev_link = '<span class="vocal-nav-link disabled">← 上一章</span>'
        if next_num in lookup:
            next_href = bve.resolve_url(ch_dir / "index.html", f"/mandolin/{lookup[next_num]['slug']}/")
            next_link = f'<a class="vocal-nav-link" href="{next_href}">下一章 →</a>'
        else:
            next_link = '<span class="vocal-nav-link disabled">下一章 →</span>'

        detail = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{bve.resolve_url(ch_dir / "index.html", "/mandolin/")}">← 曼陀林專區</a>
      <span>/</span>
      <span>第 {ch["num"]} 章</span>
    </div>
    <span class="level-tag level-tag-beginner">{bve.escape(PART_TITLES.get(ch["part_key"], ch["part_key"]))}</span>
    <h1>{bve.escape(ch["title"])}</h1>
    <p class="level-name">第 {ch["num"]} 章・{ch["chars"]:,} 字</p>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <div class="vocal-nav-links">{prev_link}{next_link}</div>
  <a class="back-link" href="{bve.resolve_url(ch_dir / "index.html", "/mandolin/")}">← 返回章節列表</a>
</main>"""
        bve.write(ch_dir / "index.html", bve.page(
            ch["title"], detail, ch_dir / "index.html",
            meta_description=f"曼陀林知識全書 第 {ch['num']} 章：{ch['title']}"))


def main() -> None:
    chapters = load_chapters()
    build_index(chapters)
    build_chapters(chapters)
    print(f"  Mandolin: index + {len(chapters)} chapter pages written.")


if __name__ == "__main__":
    main()
