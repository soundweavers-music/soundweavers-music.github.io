#!/usr/bin/env python
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import shutil
from collections import Counter, defaultdict
from html import escape
from pathlib import Path

import markdown


BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
OUTPUT_DIR = BASE_DIR / "outputs" / "world-instruments-static"
SITE_BASE_PATH = os.environ.get("SITE_BASE_PATH", "").strip()
_TOTAL_INSTRUMENTS = 0  # set in main()


def normalize_base_path(value):
    if not value or value == "/":
        return ""
    value = value.strip("/")
    return f"/{value}"


SITE_BASE_PATH = normalize_base_path(SITE_BASE_PATH)


def site_url(path):
    path = f"/{path.lstrip('/') }"
    return f"{SITE_BASE_PATH}{path}" or "/"


def resolve_url(page_path, target):
    target = f"/{target.lstrip('/')}"
    if SITE_BASE_PATH:
        return f"{SITE_BASE_PATH}{target}"
    if page_path is None:
        return target
    page_dir = page_path.parent
    asset_path = OUTPUT_DIR / target.lstrip("/")
    url = os.path.relpath(asset_path, page_dir).replace("\\", "/")
    if target.endswith("/") and not url.endswith("/"):
        url += "/"
    if url == ".":
        return "./"
    return url


def safe_external_url(value):
    value = (value or "").strip()
    if value.startswith(("https://", "http://")):
        return value
    return ""


def is_wiki_url(value):
    return bool(value and re.search(r"//(?:[^/]+\.)?(?:wikipedia|wikidata|wikimedia)\.org\b", value, flags=re.IGNORECASE))


def strip_wiki_links(html):
    if not html:
        return html
    link_pattern = re.compile(
        r'<a\b[^>]*href=["\'](?:https?://)?(?:[^/]+\.)?(?:wikipedia|wikidata|wikimedia)\.org[^"\']*["\'][^>]*>(.*?)</a>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    url_pattern = re.compile(
        r"https?://(?:[^/\s]+\.)?(?:wikipedia|wikidata|wikimedia)\.org[^\s<>\"']*",
        flags=re.IGNORECASE,
    )
    while True:
        new_html = link_pattern.sub(lambda m: m.group(1), html)
        if new_html == html:
            break
        html = new_html
    return url_pattern.sub("", html)


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return {}, text
    _, frontmatter, body = text.split("---", 2)
    data = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        data[key.strip()] = value
    return data, body.strip()


def slugify(value):
    slug = re.sub(r"[^a-zA-Z0-9一-鿿]+", "-", value).strip("-").lower()
    return slug or "unknown"


def parse_youtube_ids(value):
    if not value:
        return []
    ids = [v.strip() for v in re.split(r"[,\s]+", value.strip()) if v.strip()]
    return [v for v in ids if re.match(r'^[A-Za-z0-9_\-]{11}$', v)]


def remove_empty_headings(html):
    """Remove h2 tags that have no content before the next h2/end."""
    return re.sub(r'(<h2>[^<]+</h2>)\s*(?=<h2>|$)', '', html)


def strip_intro_heading(html):
    """Remove the '介紹' h2 heading tag but keep its content."""
    return re.sub(r'<h2>\s*介紹\s*</h2>', '', html)


def read_instruments():
    instruments = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        body_html = markdown.markdown(body.strip(), extensions=["extra", "tables", "fenced_code"], output_format="html5")
        body_html = strip_wiki_links(body_html)
        body_html = remove_empty_headings(body_html)
        body_html = strip_intro_heading(body_html)
        instruments.append(
            {
                "slug": path.stem,
                "title": meta.get("title", path.stem),
                "original_name": meta.get("original_name", ""),
                "category": meta.get("category", "其他"),
                "country": meta.get("country", "待考"),
                "era": meta.get("era", "傳統／年代待考"),
                "sound_class": meta.get("sound_class", ""),
                "hs_class": meta.get("hs_class", ""),
                "family": meta.get("family", ""),
                "playing_method": meta.get("playing_method", ""),
                "body_listening": meta.get("body_listening", ""),
                "soundscape": meta.get("soundscape", ""),
                "region_type": meta.get("region_type", ""),
                "image": meta.get("image", ""),
                "youtube_ids": parse_youtube_ids(meta.get("youtube_ids", "")),
                "instrument_key": meta.get("instrument_key", ""),
                "range": meta.get("range", ""),
                "html": body_html,
            }
        )
    return instruments


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def page(title, body, page_path=None, meta_extra=""):
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; base-uri 'self'; form-action 'none'; object-src 'none'">
  <title>{escape(title)}｜世界樂器百科</title>
  {meta_extra}
  <link rel="stylesheet" href="{resolve_url(page_path, '/assets/site.css')}">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{resolve_url(page_path, '/')}">🌍 世界樂器百科</a>
    <nav>
      <a href="{resolve_url(page_path, '/instruments/')}">全部樂器</a>
      <a href="{resolve_url(page_path, '/categories/')}">分類</a>
      <a href="{resolve_url(page_path, '/sound-classes/')}">發聲</a>
      <a href="{resolve_url(page_path, '/countries/')}">國家</a>
      <a href="{resolve_url(page_path, '/eras/')}">年代</a>
    </nav>
  </header>
  {body}
  <footer class="site-footer">
    <div class="footer-inner">
      <span>世界樂器百科 — 收錄 {_TOTAL_INSTRUMENTS} 件世界樂器</span>
      <nav class="footer-nav">
        <a href="{resolve_url(page_path, '/')}">首頁</a>
        <a href="{resolve_url(page_path, '/categories/')}">分類</a>
        <a href="{resolve_url(page_path, '/countries/')}">國家</a>
        <a href="{resolve_url(page_path, '/eras/')}">年代</a>
      </nav>
    </div>
  </footer>
  <button id="back-top" class="back-top" aria-label="回頂部">↑</button>
  <script src="{resolve_url(page_path, '/assets/search.js')}"></script>
</body>
</html>
"""


def card(instrument, page_path=None):
    img = safe_external_url(instrument.get("image", ""))
    img_html = f'<img class="card-thumb" src="{img}" alt="" loading="lazy" onerror="this.style.display=\'none\'">' if img else '<div class="card-thumb card-thumb--empty" aria-hidden="true">♩</div>'
    return f"""<a class="instrument-card" href="{resolve_url(page_path, '/instruments/' + instrument['slug'] + '/')}">
      {img_html}
      <div class="card-body">
        <span class="card-cat">{escape(instrument['category'])}</span>
        <strong class="card-title">{escape(instrument['title'])}</strong>
        {f'<span class="card-orig">{escape(instrument["original_name"])}</span>' if instrument.get("original_name") and instrument["original_name"] != instrument["title"] else ""}
        <span class="card-meta">{escape(instrument['country'])}</span>
      </div>
    </a>"""


def list_page(title, instruments, page_path=None):
    cards = "\n".join(card(item, page_path) for item in instruments) or '<p class="empty">目前沒有資料。</p>'
    return page(
        title,
        f"""
        <main class="page">
          <section class="compact-hero">
            <p class="eyebrow">Browse</p>
            <h1>{escape(title)}</h1>
            <p class="lead">{len(instruments)} 件樂器</p>
          </section>
          <div class="instrument-grid">{cards}</div>
        </main>
        """,
        page_path,
    )


def build_index(instruments):
    index_path = OUTPUT_DIR / "index.html"
    categories = Counter(item["category"] for item in instruments)
    countries = Counter(item["country"] for item in instruments)
    eras = Counter(item["era"] for item in instruments)
    category_links = "".join(
        f'<a class="facet-card" href="{resolve_url(index_path, f"/categories/{slugify(name)}/")}"><strong>{escape(name)}</strong><span>{count} 筆</span></a>'
        for name, count in categories.most_common()
    )
    # Pick 12 featured instruments: 2 per category, image preferred, deterministic
    by_cat = defaultdict(list)
    for item in instruments:
        by_cat[item["category"]].append(item)
    featured = []
    rng = random.Random(42)
    for cat_items in by_cat.values():
        with_img = [i for i in cat_items if i.get("image")]
        pool = with_img if with_img else cat_items
        shuffled = list(pool)
        rng.shuffle(shuffled)
        featured.extend(shuffled[:2])
    rng.shuffle(featured)
    sample_cards = "\n".join(card(item, index_path) for item in featured[:12])
    body = f"""
    <main class="page">
      <section class="hero">
        <p class="eyebrow">World Musical Instruments Encyclopedia</p>
        <h1>世界樂器百科</h1>
        <p class="lead hero-lead">收錄來自世界各地的傳統與現代樂器，探索人類音樂的多元面貌。</p>
        <div class="search-panel">
          <input id="site-search" type="search" placeholder="搜尋中文名、英文名、分類、國家或年代…" autocomplete="off" spellcheck="false">
        </div>
        <div id="search-results" class="search-results"></div>
      </section>

      <section class="stats">
        <div class="stat-item"><strong>{len(instruments)}</strong><span>樂器條目</span></div>
        <div class="stat-item"><strong>{len(categories)}</strong><span>分類</span></div>
        <div class="stat-item"><strong>{len(countries)}</strong><span>國家/地區</span></div>
        <div class="stat-item"><strong>{len(eras)}</strong><span>年代</span></div>
      </section>

      <section class="view-switch" aria-label="瀏覽模式">
        <button id="mode-dropdown" class="is-active" type="button">🔍 篩選瀏覽</button>
        <button id="mode-cards" type="button">📂 分類卡片</button>
      </section>

      <div id="dropdown-mode" class="browse-mode">
        <section class="section">
          <div class="section-heading"><h2>篩選樂器</h2><span id="dropdown-count" class="section-note"></span></div>
          <div class="dropdown-browser">
            <label>
              <span>分類</span>
              <select id="filter-category"><option value="">全部分類</option></select>
            </label>
            <label>
              <span>國家/地區</span>
              <select id="filter-country"><option value="">全部國家/地區</option></select>
            </label>
            <label>
              <span>年代</span>
              <select id="filter-era"><option value="">全部年代</option></select>
            </label>
            <label>
              <span>發聲方式</span>
              <select id="filter-sound-class"><option value="">全部發聲</option></select>
            </label>
            <button id="filter-reset" type="button">✕ 重設</button>
          </div>
          <div id="dropdown-results" class="dropdown-results"></div>
        </section>
      </div>

      <div id="card-mode" class="browse-mode" hidden>
        <section class="section">
          <div class="section-heading"><h2>分類瀏覽</h2><a href="{resolve_url(index_path, '/categories/')}">全部分類 →</a></div>
          <div class="facet-grid">{category_links}</div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>精選樂器</h2><a href="{resolve_url(index_path, '/instruments/')}">查看全部 →</a></div>
          <div class="instrument-grid">{sample_cards}</div>
        </section>
      </div>
    </main>
    """
    write(index_path, page("首頁", body, index_path))


def meta_row(label, value):
    if not value:
        return ""
    return f'<div class="meta-item"><dt>{escape(label)}</dt><dd>{escape(value)}</dd></div>'


def build_youtube_grid(youtube_ids):
    """Return the yt-grid div HTML for injecting into the 聆聽示範 section."""
    if not youtube_ids:
        return ""
    iframes = []
    for vid_id in youtube_ids[:2]:
        iframes.append(
            f'<div class="yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/{escape(vid_id)}" '
            f'title="YouTube video player" frameborder="0" '
            f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
            f'allowfullscreen loading="lazy"></iframe></div>'
        )
    return f'<div class="yt-grid">{"".join(iframes)}</div>'


def inject_youtube_into_body(body_html, youtube_ids):
    """Inject YouTube iframes after the <h2>聆聽示範</h2> heading in body HTML."""
    grid_html = build_youtube_grid(youtube_ids)
    if not grid_html:
        return body_html
    return body_html.replace(
        '<h2>聆聽示範</h2>',
        f'<h2>聆聽示範</h2>{grid_html}',
        1,
    )


def build_detail_pages(instruments):
    by_category = defaultdict(list)
    for item in instruments:
        by_category[item["category"]].append(item)

    for item in instruments:
        meta_fields = [
            ("分類", item["category"]),
            ("國家／地區", item["country"]),
            ("年代", item["era"]),
            ("發聲原理", item["sound_class"]),
            ("樂器調性", item.get("instrument_key", "")),
            ("音域範圍", item.get("range", "")),
            ("HS 分類", item["hs_class"]),
            ("樂器家族", item["family"]),
            ("演奏方式", item["playing_method"]),
            ("身體聆聽", item["body_listening"]),
            ("地區類型", item["region_type"]),
        ]
        meta_grid = "".join(meta_row(label, val) for label, val in meta_fields if val)
        orig = f'<p class="original-name">{escape(item["original_name"])}</p>' if item["original_name"] and item["original_name"] != item["title"] else ""
        soundscape_val = item.get("soundscape", "")
        soundscape_html = f'<p class="soundscape-tag">{escape(soundscape_val)}</p>' if soundscape_val else ""
        img_url = safe_external_url(item.get("image", ""))
        img_html = f'<img class="instrument-image" src="{img_url}" alt="{escape(item["title"])}" loading="lazy" onerror="this.style.display=\'none\'">' if img_url else ""
        header_class = "instrument-header has-image" if img_url else "instrument-header"
        # Inject YouTube iframes into the 聆聽示範 section in the article body
        body_html = inject_youtube_into_body(item['html'], item.get("youtube_ids", []))
        # Extract plain-text description from first paragraph of HTML body
        desc_match = re.search(r'<p>(.*?)</p>', body_html, re.DOTALL)
        desc_text = re.sub(r'<[^>]+>', '', desc_match.group(1))[:160] if desc_match else ""
        og_tags = "\n".join(filter(None, [
            f'<meta name="description" content="{escape(desc_text)}">' if desc_text else "",
            f'<meta property="og:title" content="{escape(item["title"])}｜世界樂器百科">',
            f'<meta property="og:description" content="{escape(desc_text)}">' if desc_text else "",
            f'<meta property="og:image" content="{img_url}">' if img_url else "",
            f'<meta property="og:type" content="article">',
        ]))
        related_pool = [i for i in by_category[item["category"]] if i["slug"] != item["slug"]]
        seed = int(hashlib.md5(item["slug"].encode()).hexdigest(), 16)
        random.Random(seed).shuffle(related_pool)
        related = related_pool[:4]
        related_html = ""
        if related:
            related_cards = "\n".join(card(r) for r in related)
            related_html = f'<section class="related-section"><h2 class="related-heading">同類樂器</h2><div class="instrument-grid">{related_cards}</div></section>'
        body = f"""
        <main class="instrument-page">
          <nav class="breadcrumb">
            <a href="../../">← 返回篩選</a> <span class="sep">/</span>
            <span>{escape(item['title'])}</span>
          </nav>
          <header class="{header_class}">
            <div class="header-text">
              <p class="eyebrow">{escape(item['category'])}</p>
              <h1>{escape(item['title'])}</h1>
              {orig}
              {soundscape_html}
            </div>
            {f'<div class="header-image">{img_html}</div>' if img_url else ""}
          </header>
          {"<dl class='meta-grid'>" + meta_grid + "</dl>" if meta_grid else ""}
          <article class="markdown-body">{body_html}</article>
          {related_html}
        </main>
        """
        write(OUTPUT_DIR / "instruments" / item["slug"] / "index.html", page(item["title"], body, meta_extra=og_tags))


def build_facet_pages(instruments, field, folder, title):
    grouped = defaultdict(list)
    for item in instruments:
        if item.get(field):
            grouped[item[field]].append(item)

    facet_cards = "".join(
        f'<a class="facet-card" href="{site_url(f"/{folder}/{slugify(name)}/")}"><strong>{escape(name)}</strong><span>{len(items)} 筆</span></a>'
        for name, items in sorted(grouped.items())
    )
    write(
        OUTPUT_DIR / folder / "index.html",
        page(title, f'<main class="page"><section class="compact-hero"><h1>{escape(title)}</h1></section><div class="facet-grid">{facet_cards}</div></main>'),
    )
    for name, items in grouped.items():
        write(OUTPUT_DIR / folder / slugify(name) / "index.html", list_page(name, sorted(items, key=lambda item: item["title"])))


def build_assets(instruments):
    css = """
/* ── Reset & tokens ─────────────────────────────────────────── */
:root {
  --ink: #1a2332;
  --ink2: #344054;
  --muted: #667085;
  --line: #e4e7ec;
  --surface: #fff;
  --soft: #f8fafc;
  --accent: #0d766b;
  --accent2: #0a5c53;
  --blue: #1d4ed8;
  --radius: 10px;
  --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -2px rgba(0,0,0,.07);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin:0; color:var(--ink); background:var(--soft); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif; line-height:1.6; }
a { color:inherit; }
img { max-width:100%; }

/* ── Site header ─────────────────────────────────────────────── */
.site-header {
  display:flex; justify-content:space-between; gap:20px; align-items:center;
  padding:14px 28px; border-bottom:1px solid var(--line);
  background:rgba(255,255,255,.97); backdrop-filter:blur(8px);
  position:sticky; top:0; z-index:100;
  box-shadow: 0 1px 0 var(--line);
}
.brand { font-weight:800; font-size:17px; text-decoration:none; color:var(--accent); letter-spacing:-.3px; }
.site-header nav { display:flex; gap:4px; }
.site-header nav a { text-decoration:none; color:var(--muted); font-size:14px; font-weight:500; padding:6px 10px; border-radius:6px; transition:color .15s,background .15s; }
.site-header nav a:hover { color:var(--ink); background:var(--soft); }

/* ── Page layout ─────────────────────────────────────────────── */
.page,.instrument-page { max-width:1160px; margin:0 auto; padding:36px 24px 80px; }

/* ── Hero ────────────────────────────────────────────────────── */
.hero { padding:60px 0 40px; }
.compact-hero { padding:32px 0 28px; }
.eyebrow { color:var(--accent); font-size:12px; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:.08em; }
h1 { font-size:clamp(32px,5vw,48px); line-height:1.1; margin:0 0 16px; font-weight:800; letter-spacing:-.5px; }
h2 { margin:0; font-weight:700; }
.lead { color:var(--muted); line-height:1.7; margin:0 0 8px; }
.hero-lead { max-width:520px; font-size:17px; margin:0 0 32px; }
.empty { color:var(--muted); }

/* ── Search ──────────────────────────────────────────────────── */
.search-panel { max-width:580px; }
.search-panel input {
  width:100%; height:52px; border:2px solid var(--line); border-radius:var(--radius);
  padding:0 18px; font-size:16px; background:var(--surface); color:var(--ink);
  transition:border-color .2s, box-shadow .2s;
}
.search-panel input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(13,118,107,.12); }
.search-results { margin-top:10px; display:grid; gap:6px; max-width:580px; }

/* ── Stats ───────────────────────────────────────────────────── */
.stats { display:grid; grid-template-columns:repeat(4,minmax(120px,1fr)); gap:12px; margin:0 0 40px; }
.stat-item { border:1px solid var(--line); background:var(--surface); border-radius:var(--radius); padding:20px; text-align:center; box-shadow:var(--shadow); }
.stat-item strong { display:block; font-size:32px; font-weight:800; color:var(--accent); line-height:1.1; }
.stat-item span { color:var(--muted); font-size:13px; }

/* ── View switch ─────────────────────────────────────────────── */
.view-switch { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 4px; }
.view-switch button {
  height:40px; border:2px solid var(--line); border-radius:8px;
  padding:0 18px; background:var(--surface); color:var(--muted);
  font-weight:700; font-size:14px; cursor:pointer; transition:all .15s;
}
.view-switch button:hover { border-color:var(--accent); color:var(--accent); }
.view-switch button.is-active { border-color:var(--accent); background:var(--accent); color:#fff; }
.browse-mode[hidden] { display:none !important; }

/* ── Section ─────────────────────────────────────────────────── */
.section { margin-top:40px; }
.section-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
.section-heading a { color:var(--accent); font-weight:600; text-decoration:none; font-size:14px; }
.section-note { color:var(--muted); font-size:14px; font-weight:600; }

/* ── Dropdown filter ─────────────────────────────────────────── */
.dropdown-browser {
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr)) auto;
  gap:12px; align-items:end; padding:20px; margin-bottom:16px;
  border:1px solid var(--line); border-radius:var(--radius);
  background:var(--surface); box-shadow:var(--shadow);
}
.dropdown-browser label { display:grid; gap:6px; min-width:0; }
.dropdown-browser label span { color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.dropdown-browser select {
  width:100%; height:42px; border:1px solid var(--line); border-radius:7px;
  padding:0 12px; background:var(--surface); color:var(--ink); font-size:14px;
  cursor:pointer; transition:border-color .15s;
}
.dropdown-browser select:focus { outline:none; border-color:var(--accent); }
.dropdown-browser button {
  height:42px; border:0; border-radius:7px; padding:0 16px;
  background:var(--ink); color:#fff; font-weight:700; font-size:14px; cursor:pointer;
  white-space:nowrap; transition:background .15s;
}
.dropdown-browser button:hover { background:#2d3f50; }
.dropdown-results { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.load-more-btn {
  display:block; width:100%; margin-top:16px; padding:12px 0;
  border:2px dashed var(--line); border-radius:var(--radius);
  background:none; color:var(--muted); font-size:14px; font-weight:600;
  cursor:pointer; transition:all .15s;
}
.load-more-btn:hover { border-color:var(--accent); color:var(--accent); background:rgba(13,118,107,.04); }

/* ── Result items (search + dropdown) ───────────────────────── */
.search-results a,.dropdown-results a {
  display:flex; gap:12px; align-items:center;
  padding:12px 14px; border:1px solid var(--line); border-radius:var(--radius);
  background:var(--surface); text-decoration:none; transition:all .15s;
  box-shadow:var(--shadow);
}
.search-results a:hover,.dropdown-results a:hover { border-color:var(--accent); box-shadow:var(--shadow-md); transform:translateY(-1px); }
.search-results a strong,.dropdown-results a strong { display:block; font-size:15px; margin-bottom:3px; }
.search-results a span,.dropdown-results a span { color:var(--muted); font-size:13px; line-height:1.4; }
.result-thumb { width:56px; height:44px; object-fit:cover; border-radius:6px; flex-shrink:0; }

/* ── Facet grid ──────────────────────────────────────────────── */
.facet-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }
.facet-card {
  display:flex; flex-direction:column; gap:6px; padding:18px;
  border:1px solid var(--line); border-radius:var(--radius); background:var(--surface);
  text-decoration:none; transition:all .15s; box-shadow:var(--shadow);
}
.facet-card:hover { border-color:var(--accent); box-shadow:var(--shadow-md); transform:translateY(-2px); }
.facet-card strong { font-size:15px; font-weight:700; }
.facet-card span { color:var(--muted); font-size:13px; }

/* ── Instrument card grid ────────────────────────────────────── */
.instrument-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; }
.instrument-card {
  display:flex; flex-direction:column;
  border:1px solid var(--line); border-radius:var(--radius); background:var(--surface);
  text-decoration:none; overflow:hidden; transition:all .15s;
  box-shadow:var(--shadow);
}
.instrument-card:hover { border-color:var(--accent); box-shadow:var(--shadow-md); transform:translateY(-2px); }
.card-thumb { display:block; width:100%; height:140px; object-fit:cover; flex-shrink:0; }
.card-thumb--empty { height:80px; background:linear-gradient(135deg,#f0f4f8,#e2e8f0); display:flex; align-items:center; justify-content:center; font-size:28px; color:#c5ced8; }
.card-body { padding:14px; display:flex; flex-direction:column; gap:4px; flex:1; }
.card-cat { color:var(--accent); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.card-title { font-size:16px; font-weight:700; line-height:1.3; }
.card-orig { color:var(--muted); font-size:12px; }
.card-meta { color:var(--muted); font-size:12px; margin-top:auto; }

/* ── Instrument detail page ──────────────────────────────────── */
.instrument-page { max-width:860px; }
.breadcrumb { display:flex; flex-wrap:wrap; gap:6px; color:var(--muted); font-size:13px; margin-bottom:24px; }
.breadcrumb a { text-decoration:none; color:var(--muted); }
.breadcrumb a:hover { color:var(--accent); }
.breadcrumb .sep { color:var(--line); }
.instrument-header { display:grid; gap:28px; margin-bottom:28px; align-items:start; }
.instrument-header.has-image { grid-template-columns:minmax(0,1fr) 240px; }
.header-text { display:flex; flex-direction:column; gap:4px; }
.header-image { position:sticky; top:80px; }
.original-name { color:var(--muted); font-size:15px; margin:6px 0 0; }
.soundscape-tag { color:var(--accent); font-size:14px; font-style:italic; margin:8px 0 0; line-height:1.5; }
.instrument-image { width:100%; border-radius:var(--radius); box-shadow:var(--shadow-md); object-fit:cover; }
.meta-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(175px,1fr));
  gap:10px; margin:0 0 32px; padding:0;
}
.meta-item { border:1px solid var(--line); border-radius:var(--radius); padding:14px; background:var(--surface); box-shadow:var(--shadow); }
.meta-item dt { color:var(--muted); font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
.meta-item dd { margin:0; font-weight:700; font-size:14px; line-height:1.4; word-break:break-word; }

/* ── YouTube embeds ──────────────────────────────────────────── */
.yt-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin:16px 0 24px; }
.yt-embed { position:relative; padding-bottom:56.25%; border-radius:var(--radius); overflow:hidden; background:#000; box-shadow:var(--shadow-md); }
.yt-embed iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }

/* ── Article body ────────────────────────────────────────────── */
.markdown-body { color:var(--ink2); line-height:1.8; font-size:16px; }
.markdown-body h2 { color:var(--ink); font-size:20px; margin:2em 0 .6em; padding-bottom:8px; border-bottom:1px solid var(--line); }
.markdown-body h3 { color:var(--ink); font-size:17px; margin:1.5em 0 .5em; }
.markdown-body p { margin:0 0 1.1em; }
.markdown-body ul,.markdown-body ol { margin:0 0 1em; padding-left:1.6em; }
.markdown-body li { margin-bottom:.35em; }
.markdown-body a { color:var(--blue); }
.markdown-body blockquote { margin:1em 0; padding:.5em 1em; border-left:3px solid var(--accent); color:var(--muted); background:var(--soft); border-radius:0 6px 6px 0; }
.markdown-body table { width:100%; border-collapse:collapse; margin-bottom:1.2em; font-size:15px; }
.markdown-body th { text-align:left; border-bottom:2px solid var(--line); padding:8px 12px; color:var(--muted); font-size:12px; text-transform:uppercase; }
.markdown-body td { border-bottom:1px solid var(--line); padding:9px 12px; }
.listen-button { display:inline-flex; align-items:center; min-height:42px; padding:0 18px; border-radius:7px; background:var(--accent); color:white; text-decoration:none; font-weight:700; font-size:14px; transition:background .15s; }
.listen-button:hover { background:var(--accent2); }
.source-note { color:var(--muted); font-size:14px; line-height:1.6; word-break:break-word; }
.source-note a { color:var(--blue); }

/* ── Related instruments ─────────────────────────────────────── */
.related-section { margin-top:48px; padding-top:32px; border-top:1px solid var(--line); }
.related-heading { font-size:20px; margin-bottom:20px; color:var(--ink); }

/* ── Footer ──────────────────────────────────────────────────── */
.site-footer {
  border-top:1px solid var(--line); background:var(--surface);
  padding:20px 28px; margin-top:60px;
}
.footer-inner {
  max-width:1160px; margin:0 auto;
  display:flex; justify-content:space-between; align-items:center;
  flex-wrap:wrap; gap:12px; color:var(--muted); font-size:13px;
}
.footer-nav { display:flex; gap:16px; }
.footer-nav a { color:var(--muted); text-decoration:none; }
.footer-nav a:hover { color:var(--accent); }

/* ── Back to top ─────────────────────────────────────────────── */
.back-top {
  position:fixed; bottom:24px; right:24px;
  width:42px; height:42px; border-radius:50%;
  background:var(--accent); color:#fff; border:none;
  display:flex; align-items:center; justify-content:center;
  font-size:18px; cursor:pointer; opacity:0;
  transform:translateY(8px); transition:opacity .2s, transform .2s;
  z-index:50; box-shadow:0 2px 8px rgba(0,0,0,.2);
}
.back-top.visible { opacity:1; transform:none; }

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width:960px) {
  .instrument-grid { grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); }
  .dropdown-browser { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dropdown-browser button { grid-column:1 / -1; }
  .dropdown-results { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .stats { grid-template-columns:repeat(2,1fr); }
  .yt-grid { grid-template-columns:1fr !important; }
}
@media (max-width:700px) {
  .site-header { flex-direction:column; align-items:flex-start; gap:10px; padding:14px 18px; }
  .site-header nav { flex-wrap:wrap; gap:2px; }
  h1 { font-size:28px; }
  .instrument-grid,.stats,.meta-grid,.dropdown-browser,.dropdown-results { grid-template-columns:1fr; }
  .instrument-header,.instrument-header.has-image { grid-template-columns:1fr; }
  .header-image { position:static; }
  .page,.instrument-page { padding:20px 16px 60px; }
  .facet-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
"""
    search_index = [
        {
            "title": item["title"],
            "original_name": item.get("original_name", ""),
            "category": item["category"],
            "country": item["country"],
            "era": item["era"],
            "sound_class": item.get("sound_class", ""),
            "url": site_url(f"/instruments/{item['slug']}/"),
            "image": safe_external_url(item.get("image", "")),
        }
        for item in instruments
    ]
    js = f"""
const SEARCH_INDEX = {json.dumps(search_index, ensure_ascii=False)};
const input = document.getElementById('site-search');
const results = document.getElementById('search-results');
const dropdownResults = document.getElementById('dropdown-results');
const dropdownCount = document.getElementById('dropdown-count');
const modeDropdown = document.getElementById('mode-dropdown');
const modeCards = document.getElementById('mode-cards');
const dropdownMode = document.getElementById('dropdown-mode');
const cardMode = document.getElementById('card-mode');
const filterControls = {{
  category: document.getElementById('filter-category'),
  country: document.getElementById('filter-country'),
  era: document.getElementById('filter-era'),
  sound_class: document.getElementById('filter-sound-class')
}};
const resetFilters = document.getElementById('filter-reset');

function appendResult(container, item) {{
  const link = document.createElement('a');
  link.href = item.url;
  if (item.image) {{
    const img = document.createElement('img');
    img.src = item.image;
    img.className = 'result-thumb';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    link.append(img);
  }}
  const info = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.title;
  const meta = document.createElement('span');
  const parts = [item.category, item.country, item.era].filter(Boolean);
  meta.textContent = parts.join(' · ');
  info.append(title, meta);
  link.append(info);
  container.append(link);
}}

function setBrowseMode(mode) {{
  if (!dropdownMode || !cardMode) return;
  const useDropdown = mode !== 'cards';
  dropdownMode.hidden = !useDropdown;
  cardMode.hidden = useDropdown;
  if (modeDropdown) modeDropdown.classList.toggle('is-active', useDropdown);
  if (modeCards) modeCards.classList.toggle('is-active', !useDropdown);
  try {{ localStorage.setItem('wmi_browse_mode', mode); }} catch(e) {{}}
}}

modeDropdown?.addEventListener('click', () => setBrowseMode('dropdown'));
modeCards?.addEventListener('click', () => setBrowseMode('cards'));

// Restore saved mode
try {{
  const saved = localStorage.getItem('wmi_browse_mode');
  if (saved) setBrowseMode(saved); else setBrowseMode('dropdown');
}} catch(e) {{ setBrowseMode('dropdown'); }}

// Search box
if (input && results) {{
  input.addEventListener('input', () => {{
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (!q) return;
    const scored = SEARCH_INDEX.flatMap(item => {{
      const t = item.title.toLowerCase();
      const o = (item.original_name || '').toLowerCase();
      const haystack = [t, o, item.category, item.country, item.era, item.sound_class].join(' ').toLowerCase();
      if (!haystack.includes(q)) return [];
      const score = t === q ? 0 : t.startsWith(q) ? 1 : o.startsWith(q) ? 2 : 3;
      return [{{item, score}}];
    }});
    scored.sort((a, b) => a.score - b.score);
    const hits = scored.slice(0, 20).map(x => x.item);
    for (const item of hits) appendResult(results, item);
  }});
}}

// Populate selects
function countValues(field) {{
  const counts = new Map();
  for (const item of SEARCH_INDEX) {{
    const v = item[field];
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }}
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}}

function fillSelect(select, field) {{
  if (!select) return;
  for (const [value, count] of countValues(field)) {{
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${{value}}（${{count}}）`;
    select.append(option);
  }}
}}

function selectedFilters() {{
  return Object.fromEntries(
    Object.entries(filterControls).map(([field, select]) => [field, select?.value || ''])
  );
}}

const PAGE_SIZE = 100;
let currentHits = [];
let shownCount = 0;

function renderNextPage() {{
  const batch = currentHits.slice(shownCount, shownCount + PAGE_SIZE);
  for (const item of batch) appendResult(dropdownResults, item);
  shownCount += batch.length;
  const oldBtn = document.getElementById('load-more-btn');
  if (oldBtn) oldBtn.remove();
  if (shownCount < currentHits.length) {{
    const btn = document.createElement('button');
    btn.id = 'load-more-btn';
    btn.className = 'load-more-btn';
    btn.textContent = `顯示更多（還有 ${{currentHits.length - shownCount}} 筆）`;
    btn.addEventListener('click', renderNextPage);
    dropdownResults.after(btn);
  }}
}}

function renderDropdownResults() {{
  if (!dropdownResults) return;
  dropdownResults.replaceChildren();
  const filters = selectedFilters();
  currentHits = SEARCH_INDEX.filter(item =>
    Object.entries(filters).every(([field, value]) => !value || item[field] === value)
  );
  shownCount = 0;
  if (dropdownCount) dropdownCount.textContent = `${{currentHits.length}} 筆`;
  renderNextPage();
  // Save filter state
  try {{ localStorage.setItem('wmi_filters', JSON.stringify(filters)); }} catch(e) {{}}
}}

if (dropdownResults) {{
  fillSelect(filterControls.category, 'category');
  fillSelect(filterControls.country, 'country');
  fillSelect(filterControls.era, 'era');
  fillSelect(filterControls.sound_class, 'sound_class');

  // Restore saved filters
  try {{
    const saved = JSON.parse(localStorage.getItem('wmi_filters') || '{{}}');
    for (const [field, value] of Object.entries(saved)) {{
      if (filterControls[field] && value) filterControls[field].value = value;
    }}
  }} catch(e) {{}}

  for (const select of Object.values(filterControls)) {{
    select?.addEventListener('change', renderDropdownResults);
  }}
  resetFilters?.addEventListener('click', () => {{
    for (const select of Object.values(filterControls)) {{
      if (select) select.value = '';
    }}
    try {{ localStorage.removeItem('wmi_filters'); }} catch(e) {{}}
    renderDropdownResults();
  }});
  renderDropdownResults();
}}

/* ── Back to top ──────────────────────────────────────────────── */
const backTop = document.getElementById('back-top');
if (backTop) {{
  window.addEventListener('scroll', () => {{
    backTop.classList.toggle('visible', window.scrollY > 400);
  }}, {{passive: true}});
  backTop.addEventListener('click', () => window.scrollTo({{top:0, behavior:'smooth'}}));
}}
"""
    write(OUTPUT_DIR / "assets" / "site.css", css.strip() + "\n")
    write(OUTPUT_DIR / "assets" / "search.js", js.strip() + "\n")
    write(OUTPUT_DIR / "search-index.json", json.dumps(search_index, ensure_ascii=False, indent=2))


def build_404(instruments):
    sample = random.Random(7).sample(instruments, min(8, len(instruments)))
    cards = "\n".join(card(item) for item in sample)
    body = f"""
    <main class="page">
      <section class="compact-hero">
        <p class="eyebrow">404</p>
        <h1>找不到頁面</h1>
        <p class="lead">這個頁面不存在，或已被移動。</p>
        <a href="{site_url('/')}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">回首頁</a>
      </section>
      <section class="section">
        <div class="section-heading"><h2>隨機推薦</h2></div>
        <div class="instrument-grid">{cards}</div>
      </section>
    </main>"""
    write(OUTPUT_DIR / "404.html", page("頁面找不到", body))


def build_sitemap(instruments):
    base = SITE_BASE_PATH or ""
    urls = [f"<url><loc>{base}/</loc></url>",
            f"<url><loc>{base}/instruments/</loc></url>",
            f"<url><loc>{base}/categories/</loc></url>",
            f"<url><loc>{base}/countries/</loc></url>",
            f"<url><loc>{base}/eras/</loc></url>"]
    for item in instruments:
        urls.append(f"<url><loc>{base}/instruments/{item['slug']}/</loc></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls) + "\n</urlset>\n"
    write(OUTPUT_DIR / "sitemap.xml", xml)


def main():
    global _TOTAL_INSTRUMENTS
    instruments = read_instruments()
    _TOTAL_INSTRUMENTS = len(instruments)
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)
    build_assets(instruments)
    build_index(instruments)
    build_detail_pages(instruments)
    write(OUTPUT_DIR / "instruments" / "index.html", list_page("全部樂器", instruments))
    build_facet_pages(instruments, "category", "categories", "分類")
    build_facet_pages(instruments, "sound_class", "sound-classes", "發聲分類")
    build_facet_pages(instruments, "country", "countries", "國家/地區")
    build_facet_pages(instruments, "era", "eras", "年代")
    build_404(instruments)
    build_sitemap(instruments)
    write(OUTPUT_DIR / ".nojekyll", "")
    print(f"Built {len(instruments)} instruments into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
