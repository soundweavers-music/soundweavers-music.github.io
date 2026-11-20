#!/usr/bin/env python3
"""Build the /guitar/ and /ukulele/ course sections.

Content lives in content/guitar/*.md and content/ukulele/*.md — the chapters
are numbered files (1.md, 2.md, …) with the chapter title as the first H1.
Layout mirrors the vocal/mandolin course pages so the whole「學習」area shares
one visual language.

Files that are not plain numbered chapters (code_artifact.md, and the ukulele
alternate-take files such as 9_soul.md / 12_f_bm.md) are skipped: they are
drafts of a parallel syllabus and would duplicate chapter numbers.

Output: outputs/world-instruments-static/{guitar,ukulele}/...
Run AFTER build_static_site.py (reuses its page() template via build_vocal_extra).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_extra as bve  # noqa: E402

COURSES = {
    "guitar": {
        "name": "流行吉他彈唱指南",
        "eyebrow": "Pop Guitar",
        "lead": "從挑琴、調音、看懂六線譜，到刷奏、和弦與彈唱協調——寫給零基礎成人"
                "的流行吉他彈唱教材，每一步都附可執行的練習。",
        "icon": "🎸",
    },
    "songwriting": {
        "name": "流行歌曲詞曲創作",
        "eyebrow": "Songwriting",
        "lead": "從拆解一首歌的結構開始，依序寫詞、寫旋律、配和弦，最後把六堂課的產出"
                "黏成一首寫得完、唱得順、拿得出去的原創歌。",
        "icon": "✍️",
        "unit": "堂",
    },
    "ukulele": {
        "name": "烏克麗麗流行彈唱與演奏指南",
        "eyebrow": "Ukulele",
        "lead": "四條弦的大小事：選琴、調音、和弦家族、刷奏節奏型到指彈與打板，"
                "以華語流行歌為練習材料，從零開始到能自彈自唱。",
        "icon": "🪗",
    },
}
# 時數公式集中在 course_hours.py；這裡只留 import，避免兩邊各自演化
from course_hours import study_hours, factor_for  # noqa: E402
CHAPTER_RE = re.compile(r"^(\d+)\.md$")
EXTRA = [("前言.md", "preface", "前言"), ("目錄.md", "toc", "目錄")]


def load_chapters(slug: str) -> list[dict]:
    folder = BASE_DIR / "content" / slug
    if not folder.exists():
        return []
    chapters = []
    for path in folder.iterdir():
        m = CHAPTER_RE.match(path.name)
        if not m:
            continue
        text = path.read_text(encoding="utf-8")
        h1 = next((ln[2:].strip() for ln in text.splitlines() if ln.startswith("# ")), path.stem)
        title = re.sub(r"^第\s*\d+\s*[章堂][｜:：]\s*", "", h1)
        chars = len(re.findall(r"[一-鿿]", text))
        chapters.append({
            "num": int(m.group(1)),
            "slug": f"ch{int(m.group(1)):02d}",
            "title": title,
            "path": path,
            "chars": chars,
            # 建議學習時數：公式在 scripts/course_hours.py（首頁、/learn/ 共用同一個）
            "hours": study_hours(chars, factor_for(slug)),
        })
    return sorted(chapters, key=lambda c: c["num"])


def build_index(slug: str, conf: dict, chapters: list[dict]) -> None:
    out_dir = bve.OUTPUT_DIR / slug
    extra_links = ""
    if (BASE_DIR / "content" / slug / "前言.md").exists():
        extra_links = ('<p class="course-extras">'
                       f'<a href="{bve.resolve_url(out_dir / "index.html", "/%s/preface/" % slug)}">前言</a>'
                       f'<a href="{bve.resolve_url(out_dir / "index.html", "/%s/toc/" % slug)}">目錄</a>'
                       '</p>')
    rows = []
    for ch in chapters:
        href = bve.resolve_url(out_dir / "index.html", f"/{slug}/{ch['slug']}/")
        rows.append(
            f'<li class="chapter-item has-link"><a href="{href}">'
            f'<span class="ch-num done">{ch["num"]}</span>'
            f'<span class="ch-title">{bve.escape(ch["title"])}</span>'
            f'<span class="ch-status ch-status-done">約 {ch["hours"]:g} 小時</span>'
            f'</a></li>'
        )
    body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">{conf["eyebrow"]}</p>
    <h1>{bve.escape(conf["name"])}</h1>
    <p class="lead">{bve.escape(conf["lead"])}</p>
    <p class="hero-stats" style="text-align:left;margin-top:20px">
      <span><strong>{len(chapters)}</strong> {conf.get("unit", "章")}</span>
      <span>建議約 <strong>{sum(c["hours"] for c in chapters):g}</strong> 小時</span>
    </p>
  </section>
  <div class="vocal-page">
    {extra_links}
    <ol class="chapter-list">{"".join(rows)}</ol>
  </div>
</main>"""
    bve.write(out_dir / "index.html", bve.page(
        conf["name"], body, out_dir / "index.html",
        meta_description=f"{conf['name']}：{len(chapters)} 章完整教材。"))


def build_chapters(slug: str, conf: dict, chapters: list[dict]) -> None:
    out_dir = bve.OUTPUT_DIR / slug
    lookup = {c["num"]: c for c in chapters}
    for ch in chapters:
        ch_dir = out_dir / ch["slug"]
        ch_dir.mkdir(parents=True, exist_ok=True)
        html_body = bve.relativize(bve.markdown_to_html(ch["path"].read_text(encoding="utf-8")),
                                   ch_dir / "index.html")

        prev_c = lookup.get(ch["num"] - 1)
        next_c = lookup.get(ch["num"] + 1)
        if prev_c:
            prev_url = bve.resolve_url(ch_dir / "index.html", "/%s/%s/" % (slug, prev_c["slug"]))
            prev_link = '<a class="vocal-nav-link" href="%s">← 上一章</a>' % prev_url
        else:
            prev_link = '<span class="vocal-nav-link disabled">← 上一章</span>'
        if next_c:
            next_url = bve.resolve_url(ch_dir / "index.html", "/%s/%s/" % (slug, next_c["slug"]))
            next_link = '<a class="vocal-nav-link" href="%s">下一章 →</a>' % next_url
        else:
            next_link = '<span class="vocal-nav-link disabled">下一章 →</span>'

        detail = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{bve.resolve_url(ch_dir / "index.html", "/" + slug + "/")}">← {bve.escape(conf["name"])}</a>
      <span>/</span><span>第 {ch["num"]} {conf.get("unit", "章")}</span>
    </div>
    <h1>{bve.escape(ch["title"])}</h1>
    <p class="level-name">第 {ch["num"]} {conf.get("unit", "章")}・建議約 {ch["hours"]:g} 小時</p>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <div class="vocal-nav-links">{prev_link}{next_link}</div>
  <a class="back-link" href="{bve.resolve_url(ch_dir / "index.html", "/" + slug + "/")}">← 返回章節列表</a>
</main>"""
        bve.write(ch_dir / "index.html", bve.page(
            ch["title"], detail, ch_dir / "index.html",
            meta_description=f"{conf['name']} 第 {ch['num']} 章：{ch['title']}"))


def build_extras(slug: str, conf: dict) -> list[tuple[str, str]]:
    """前言 / 目錄 are part of the book but are not numbered chapters."""
    folder = BASE_DIR / "content" / slug
    out_dir = bve.OUTPUT_DIR / slug
    made = []
    for fname, page_slug, label in EXTRA:
        path = folder / fname
        if not path.exists():
            continue
        d = out_dir / page_slug
        d.mkdir(parents=True, exist_ok=True)
        html_body = bve.relativize(bve.markdown_to_html(path.read_text(encoding="utf-8")),
                                   d / "index.html")
        body = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{bve.resolve_url(d / "index.html", "/" + slug + "/")}">← {bve.escape(conf["name"])}</a>
    </div>
    <h1>{label}</h1>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <a class="back-link" href="{bve.resolve_url(d / "index.html", "/" + slug + "/")}">← 返回章節列表</a>
</main>"""
        bve.write(d / "index.html", bve.page(f"{conf['name']}・{label}", body, d / "index.html",
                                             meta_description=f"{conf['name']}的{label}。{conf['lead']}"))
        made.append((page_slug, label))
    return made


def main() -> None:
    for slug, conf in COURSES.items():
        chapters = load_chapters(slug)
        if not chapters:
            print(f"  {slug}: no chapters found, skipped")
            continue
        build_index(slug, conf, chapters)
        build_extras(slug, conf)
        build_chapters(slug, conf, chapters)
        print(f"  {conf['name']}: index + {len(chapters)} chapter pages written.")


if __name__ == "__main__":
    main()
