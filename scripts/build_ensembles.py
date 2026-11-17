#!/usr/bin/env python3
"""Build the /ensembles/ section: index + 40 entry pages.

Content comes from content/ensembles/*.md (frontmatter + seven fixed sections).
The seven B-classes (B1–B7) live in build_static_site.ENSEMBLE_ARCHITECTURE so
the nav, the sitemap and this builder agree on the taxonomy.

Run AFTER build_static_site.py — it reuses that module's page() template, and it
overwrites the placeholder pages that builder leaves behind.

Output: outputs/world-instruments-static/ensembles/...
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_extra as bve  # noqa: E402  (page(), markdown_to_html, write, OUTPUT_DIR)
import build_static_site as bss  # noqa: E402  (ENSEMBLE_ARCHITECTURE)

CONTENT_DIR = BASE_DIR / "content" / "ensembles"
OUT_DIR = bve.OUTPUT_DIR / "ensembles"

# One-line description per class, used as the section lead on the index.
CLASS_BLURB = {
    "B1": "以地域文化與傳統聲音系統為核心的合奏。重點在音律、調式與社群場合。",
    "B2": "街頭、民俗與社群生活中的樂隊編制。多半與舞蹈、節慶或特定地區的職業傳統綁在一起。",
    "B3": "以鼓樂、節慶、儀式或隊伍節奏為核心的編制。沒有旋律主奏時，時間怎麼被組織起來。",
    "B4": "制度化、有指揮、有固定曲目的大型與室內編制。",
    "B5": "把傳統樂器整理成現代樂團格式之後的產物。這一類的張力都在「改良」與「原貌」之間。",
    "B6": "以節奏組為引擎、以錄音與演出市場為前提的編制。",
    "B7": "因錄音、媒體、場館或當代藝術而生的混合編制。",
}

FM_KEYS = ["class", "num", "title", "en", "region", "summary", "keywords"]


def parse(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    _, fm, body = text.split("---", 2)
    meta = {}
    for line in fm.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body.strip()


def youtube_block(video_ids: list[str]) -> str:
    """Embedded performances, injected under 聆聽入口.

    The videos are vetted by scripts/fetch_ensemble_videos.py — this function
    only renders. If an entry has none, return "" so the page is unchanged.
    """
    if not video_ids:
        return ""
    embeds = "".join(
        f'<div class="yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/{vid}" '
        f'title="YouTube 演出影片" frameborder="0" '
        f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
        f'allowfullscreen loading="lazy"></iframe></div>'
        for vid in video_ids[:2]
    )
    return (f'<div class="ensemble-videos"><h3>演出影片</h3>'
            f'<div class="yt-grid">{embeds}</div></div>')


def load_entries() -> list[dict]:
    entries = []
    for path in sorted(CONTENT_DIR.glob("b*-*.md")):
        meta, body = parse(path.read_text(encoding="utf-8"))
        if not meta.get("title"):
            continue
        slug = path.stem
        meta.update(slug=slug, path=path, body=body)
        entries.append(meta)
    entries.sort(key=lambda e: (e.get("class", "B9"), int(e.get("num", 99))))
    return entries


def build_index(entries: list[dict]) -> None:
    by_class: dict[str, list[dict]] = {}
    for e in entries:
        by_class.setdefault(e["class"], []).append(e)

    sections = []
    for code, name, desc, _ in bss.ENSEMBLE_ARCHITECTURE:
        items = by_class.get(code, [])
        cards = "".join(
            f'<li class="ensemble-card"><a href="{bve.resolve_url(OUT_DIR / "index.html", "/ensembles/" + e["slug"] + "/")}">'
            f'<p class="ensemble-region">{bve.escape(e.get("region", ""))}</p>'
            f'<h3>{bve.escape(e["title"])}</h3>'
            f'<p class="ensemble-en">{bve.escape(e.get("en", ""))}</p>'
            f'<p class="ensemble-summary">{bve.escape(e.get("summary", ""))}</p>'
            f'</a></li>'
            for e in items
        )
        sections.append(f"""<section class="about-section ensemble-class">
      <div class="ensemble-class-head">
        <span class="ensemble-code">{code}</span>
        <div>
          <h2>{bve.escape(name)}</h2>
          <p class="ensemble-class-desc">{bve.escape(CLASS_BLURB.get(code, desc))}</p>
        </div>
      </div>
      <ul class="ensemble-grid">{cards}</ul>
    </section>""")

    body = f"""<main class="about-page">
  {bss.banner_hero("Ensemble Encyclopedia", "合奏與編制百科", "樂器如何分工，聲音如何被組織成一個整體")}
  <div class="about-body">
    <section class="about-section">
      <p class="discography-lead">這一區談的不是單一樂器，而是<b>一群人怎麼一起發出聲音</b>：誰管時間、誰管低音、誰帶旋律、樂手之間靠什麼協調。目前收錄 {len(entries)} 種編制，分成七大類。</p>
    </section>
{"".join(sections)}
  </div>
</main>"""
    bve.write(OUT_DIR / "index.html", bve.page(
        "合奏與編制百科", body, OUT_DIR / "index.html",
        meta_description=f"世界樂器合奏與編制百科 — 收錄 {len(entries)} 種合奏形式，從甘美朗、塔赫特到管弦樂團與爵士大樂團，說明每種編制的分工、聲音運作方式與聆聽入口。"))


def build_entries(entries: list[dict]) -> None:
    lookup = {e["slug"]: e for e in entries}
    ordered = [e["slug"] for e in entries]
    classes = {code: (name, [e for e in entries if e["class"] == code])
               for code, name, _, _ in bss.ENSEMBLE_ARCHITECTURE}

    for idx, e in enumerate(entries):
        slug = e["slug"]
        out = OUT_DIR / slug / "index.html"
        html_body = bve.markdown_to_html(e["body"], strip_first_h1=True)
        ids = (e.get("youtube") or "").split()
        if ids:
            # Put the performances at the end of the listening guide, where the
            # reader has just been told what to listen for.
            block = youtube_block(ids)
            m = re.search(r'<h2[^>]*>\s*常見誤解', html_body)
            html_body = (html_body[:m.start()] + block + html_body[m.start():]
                         if m else html_body + block)

        # Prev/next inside the same class, then across the whole set.
        siblings = [x["slug"] for x in classes[e["class"]][1]]
        pos = siblings.index(slug)
        prev_slug = siblings[pos - 1] if pos > 0 else None
        next_slug = siblings[pos + 1] if pos + 1 < len(siblings) else None

        def nav(target, label, arrow_class):
            if not target:
                return f'<span class="vocal-nav-link disabled">{label}</span>'
            other = lookup[target]
            return (f'<a class="vocal-nav-link" href="{bve.resolve_url(out, "/ensembles/" + target + "/")}">'
                    f'{label}｜{bve.escape(other["title"])}</a>')

        class_name = classes[e["class"]][0]
        body = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{bve.resolve_url(out, "/ensembles/")}">← 合奏與編制百科</a>
      <span>/</span>
      <span>{bve.escape(e["class"])} {bve.escape(class_name)}</span>
    </div>
    <span class="level-tag level-tag-beginner">{bve.escape(e.get("region", ""))}</span>
    <h1>{bve.escape(e["title"])}</h1>
    <p class="level-name">{bve.escape(e.get("en", ""))}</p>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <div class="vocal-nav-links">{nav(prev_slug, "← 上一則", "")}{nav(next_slug, "下一則 →", "")}</div>
  <a class="back-link" href="{bve.resolve_url(out, "/ensembles/")}">← 返回編制列表</a>
</main>"""
        bve.write(out, bve.page(
            f'{e["title"]}｜合奏與編制百科', body, out,
            meta_description=f'{e["title"]}（{e.get("en", "")}）— {e.get("summary", "")} 合奏與編制百科 by 隔壁織音人。'))


def build_class_pages(entries: list[dict]) -> None:
    """The B1–B7 landing pages that build_static_site left as placeholders."""
    for code, name, desc, examples in bss.ENSEMBLE_ARCHITECTURE:
        items = [e for e in entries if e["class"] == code]
        if not items:
            continue
        out = OUT_DIR / code / "index.html"
        cards = "".join(
            f'<li class="ensemble-card"><a href="{bve.resolve_url(out, "/ensembles/" + e["slug"] + "/")}">'
            f'<p class="ensemble-region">{bve.escape(e.get("region", ""))}</p>'
            f'<h3>{bve.escape(e["title"])}</h3>'
            f'<p class="ensemble-en">{bve.escape(e.get("en", ""))}</p>'
            f'<p class="ensemble-summary">{bve.escape(e.get("summary", ""))}</p>'
            f'</a></li>'
            for e in items
        )
        body = f"""<main class="about-page">
  {bss.banner_hero(f"Ensemble · {code}", name, desc)}
  <div class="about-body">
    <section class="about-section">
      <p class="discography-lead">{bve.escape(CLASS_BLURB.get(code, ""))}本類共 {len(items)} 種編制。</p>
      <ul class="ensemble-grid">{cards}</ul>
    </section>
  </div>
</main>"""
        bve.write(out, bve.page(
            f"{code} {name}｜合奏與編制百科", body, out,
            meta_description=f"{name} — {desc} 收錄 {len(items)} 種編制：{'、'.join(e['title'] for e in items)}。"))


def main() -> int:
    entries = load_entries()
    if not entries:
        print("no ensemble entries found")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_index(entries)
    build_class_pages(entries)
    build_entries(entries)
    print(f"  {len(entries)} ensemble entries written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
