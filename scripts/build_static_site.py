#!/usr/bin/env python
from __future__ import annotations

import json
import os
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


def normalize_base_path(value):
    if not value or value == "/":
        return ""
    value = value.strip("/")
    return f"/{value}"


SITE_BASE_PATH = normalize_base_path(SITE_BASE_PATH)


def site_url(path):
    path = f"/{path.lstrip('/')}"
    return f"{SITE_BASE_PATH}{path}" or "/"


def safe_external_url(value):
    value = (value or "").strip()
    if value.startswith(("https://", "http://")):
        return value
    return ""


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
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", value).strip("-").lower()
    return slug or "unknown"


def read_instruments():
    instruments = []
    for path in sorted(CONTENT_DIR.glob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        html = markdown.markdown(body, extensions=["extra", "tables", "fenced_code"], output_format="html5")
        instruments.append(
            {
                "slug": path.stem,
                "title": meta.get("title", path.stem),
                "original_name": meta.get("original_name", ""),
                "category": meta.get("category", "其他"),
                "country": meta.get("country", "待考"),
                "era": meta.get("era", "傳統／年代待考"),
                "image": meta.get("image", ""),
                "listen_link": meta.get("listen_link", ""),
                "source_url": meta.get("source_url", ""),
                "wikidata_id": meta.get("wikidata_id", ""),
                "journey": meta.get("journey", ""),
                "journey_name": meta.get("journey_name", ""),
                "chapter_number": meta.get("chapter_number", ""),
                "chapter_name": meta.get("chapter_name", ""),
                "chapter_subtitle": meta.get("chapter_subtitle", ""),
                "sound_class": meta.get("sound_class", ""),
                "hs_class": meta.get("hs_class", ""),
                "family": meta.get("family", ""),
                "playing_method": meta.get("playing_method", ""),
                "body_listening": meta.get("body_listening", ""),
                "soundscape": meta.get("soundscape", ""),
                "body": body,
                "html": html,
            }
        )
    return instruments


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def page(title, body):
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'">
  <title>{escape(title)}｜世界樂器百科</title>
  <link rel="stylesheet" href="{site_url('/assets/site.css')}">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{site_url('/')}">世界樂器百科</a>
    <nav>
      <a href="{site_url('/instruments/')}">全部樂器</a>
      <a href="{site_url('/categories/')}">分類</a>
      <a href="{site_url('/journeys/')}">旅圖</a>
      <a href="{site_url('/sound-classes/')}">發聲</a>
      <a href="{site_url('/countries/')}">國家</a>
      <a href="{site_url('/eras/')}">年代</a>
    </nav>
  </header>
  {body}
  <script src="{site_url('/assets/search.js')}"></script>
</body>
</html>
"""


def card(instrument):
    context = instrument.get("journey") or instrument.get("sound_class") or instrument["era"]
    return f"""
    <a class="instrument-card" href="{site_url(f'/instruments/{instrument["slug"]}/')}">
      <span>{escape(instrument['category'])} · {escape(instrument['country'])} · {escape(context)}</span>
      <strong>{escape(instrument['title'])}</strong>
      <small>{escape(instrument['original_name'])}</small>
    </a>
    """


def list_page(title, instruments):
    cards = "\n".join(card(item) for item in instruments) or '<p class="empty">目前沒有資料。</p>'
    return page(
        title,
        f"""
        <main class="page">
          <section class="compact-hero">
            <p class="eyebrow">Browse</p>
            <h1>{escape(title)}</h1>
          </section>
          <div class="instrument-grid">{cards}</div>
        </main>
        """,
    )


def build_index(instruments):
    categories = Counter(item["category"] for item in instruments)
    countries = Counter(item["country"] for item in instruments)
    eras = Counter(item["era"] for item in instruments)
    journeys = Counter(item["journey"] for item in instruments if item.get("journey"))
    sound_classes = Counter(item["sound_class"] for item in instruments if item.get("sound_class"))
    category_links = "".join(
        f'<a class="facet-card" href="{site_url(f"/categories/{slugify(name)}/")}"><strong>{escape(name)}</strong><span>{count} 筆</span></a>'
        for name, count in categories.most_common()
    )
    journey_links = "".join(
        f'<a class="facet-card" href="{site_url(f"/journeys/{slugify(name)}/")}"><strong>{escape(name)}</strong><span>{count} 筆</span></a>'
        for name, count in journeys.most_common()
    )
    sample_cards = "\n".join(card(item) for item in instruments[:12])
    body = f"""
    <main class="page">
      <section class="hero">
        <p class="eyebrow">Static Markdown Edition</p>
        <h1>世界樂器百科</h1>
        <div class="search-panel">
          <input id="site-search" type="search" placeholder="搜尋中文名、英文名、分類、旅圖、發聲類型、國家或年代...">
        </div>
        <div id="search-results" class="search-results"></div>
      </section>

      <section class="stats">
        <div><strong>{len(instruments)}</strong><span>樂器條目</span></div>
        <div><strong>{len(categories)}</strong><span>分類</span></div>
        <div><strong>{len(journeys)}</strong><span>旅圖段落</span></div>
        <div><strong>{len(sound_classes)}</strong><span>發聲類型</span></div>
        <div><strong>{len(countries)}</strong><span>國家/地區</span></div>
        <div><strong>{len(eras)}</strong><span>年代</span></div>
      </section>

      <section class="view-switch" aria-label="瀏覽模式">
        <button id="mode-dropdown" class="is-active" type="button">下拉式分類</button>
        <button id="mode-cards" type="button">卡片分類</button>
      </section>

      <div id="dropdown-mode" class="browse-mode">
        <section class="section">
          <div class="section-heading"><h2>下拉式分類</h2><span id="dropdown-count" class="section-note"></span></div>
          <div class="dropdown-browser">
            <label>
              <span>分類</span>
              <select id="filter-category"><option value="">全部分類</option></select>
            </label>
            <label>
              <span>旅圖</span>
              <select id="filter-journey"><option value="">全部旅圖</option></select>
            </label>
            <label>
              <span>發聲</span>
              <select id="filter-sound"><option value="">全部發聲</option></select>
            </label>
            <label>
              <span>國家/地區</span>
              <select id="filter-country"><option value="">全部國家/地區</option></select>
            </label>
            <label>
              <span>年代</span>
              <select id="filter-era"><option value="">全部年代</option></select>
            </label>
            <button id="filter-reset" type="button">重設</button>
          </div>
          <div id="dropdown-results" class="dropdown-results"></div>
        </section>
      </div>

      <div id="card-mode" class="browse-mode" hidden>
        <section class="section">
          <div class="section-heading"><h2>分類瀏覽</h2><a href="{site_url('/categories/')}">全部分類</a></div>
          <div class="facet-grid">{category_links}</div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>旅圖瀏覽</h2><a href="{site_url('/journeys/')}">全部旅圖</a></div>
          <div class="facet-grid">{journey_links}</div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>樂器條目</h2><a href="{site_url('/instruments/')}">查看全部</a></div>
          <div class="instrument-grid">{sample_cards}</div>
        </section>
      </div>
    </main>
    """
    write(OUTPUT_DIR / "index.html", page("首頁", body))


def build_detail_pages(instruments):
    for item in instruments:
        image_url = safe_external_url(item["image"])
        listen_url = safe_external_url(item["listen_link"])
        source_url = safe_external_url(item["source_url"])
        image = f'<img class="instrument-image" src="{escape(image_url)}" alt="{escape(item["title"])}">' if image_url else ""
        listen = (
            f'<a class="listen-button" href="{escape(listen_url)}" target="_blank" rel="noopener noreferrer">播放聆聽</a>'
            if listen_url
            else ""
        )
        source = (
            f'<a href="{escape(source_url)}" target="_blank" rel="noopener noreferrer">{escape(source_url)}</a>'
            if source_url
            else "待補"
        )
        detail_meta = [
            ("分類", item["category"]),
            ("國家/地區", item["country"]),
            ("年代", item["era"]),
            ("旅圖", "｜".join(part for part in [item.get("journey"), item.get("journey_name")] if part)),
            ("章節", "｜".join(part for part in [item.get("chapter_number"), item.get("chapter_name")] if part)),
            ("發聲分類", item.get("sound_class")),
            ("H-S 近似分類", item.get("hs_class")),
            ("家族/支系", item.get("family")),
            ("演奏方式", item.get("playing_method")),
        ]
        meta_grid = "".join(
            f"<div><dt>{escape(label)}</dt><dd>{escape(value)}</dd></div>"
            for label, value in detail_meta
            if value
        )
        body = f"""
        <main class="instrument-page">
          <div class="breadcrumb"><a href="{site_url('/')}">首頁</a><span>/</span><a href="{site_url('/instruments/')}">樂器</a></div>
          <header class="instrument-header">
            <div>
              <p class="eyebrow">{escape(item['category'])}</p>
              <h1>{escape(item['title'])}</h1>
              <p class="lead">{escape(item['original_name'])}</p>
              <dl class="meta-grid">
                {meta_grid}
              </dl>
              {listen}
              <p class="source-note">資料來源：{source}</p>
            </div>
            {image}
          </header>
          <article class="markdown-body">{item['html']}</article>
        </main>
        """
        write(OUTPUT_DIR / "instruments" / item["slug"] / "index.html", page(item["title"], body))


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
:root { --ink:#172026; --muted:#64748b; --line:#d8e0ea; --surface:#fff; --soft:#f4f7fb; --accent:#0f766e; --blue:#1d4ed8; }
* { box-sizing: border-box; }
body { margin:0; color:var(--ink); background:#fbfcfe; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
a { color: inherit; }
.site-header { display:flex; justify-content:space-between; gap:20px; align-items:center; padding:18px 28px; border-bottom:1px solid var(--line); background:rgba(255,255,255,.95); position:sticky; top:0; z-index:10; }
.brand { font-weight:800; text-decoration:none; }
.site-header nav { display:flex; gap:16px; color:var(--muted); font-size:14px; }
.site-header nav a { text-decoration:none; }
.page,.instrument-page { max-width:1120px; margin:0 auto; padding:34px 20px 64px; }
.hero { padding:54px 0 34px; }
.compact-hero { padding:28px 0 24px; }
.eyebrow { color:var(--accent); font-size:13px; font-weight:800; margin:0 0 10px; text-transform:uppercase; letter-spacing:0; }
h1 { font-size:44px; line-height:1.12; margin:0 0 14px; }
h2 { margin:0; }
.lead,.empty { color:var(--muted); line-height:1.65; }
.search-panel input { width:100%; min-height:48px; border:1px solid var(--line); border-radius:8px; padding:0 14px; font-size:16px; background:#fff; }
.search-results { margin-top:12px; display:grid; gap:8px; }
.search-results a,.dropdown-results a { padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:#fff; text-decoration:none; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:14px 0 36px; }
.stats div,.facet-card,.instrument-card { border:1px solid var(--line); background:#fff; border-radius:8px; padding:16px; }
.stats strong { display:block; font-size:26px; }
.stats span,.facet-card span,.instrument-card span,.instrument-card small { color:var(--muted); }
.view-switch { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 0; }
.view-switch button { min-height:40px; border:1px solid var(--line); border-radius:7px; padding:0 16px; background:#fff; color:var(--ink); font-weight:800; cursor:pointer; }
.view-switch button.is-active { border-color:var(--accent); background:var(--accent); color:#fff; }
.browse-mode[hidden] { display:none !important; }
.section { margin-top:38px; }
.section-heading { display:flex; justify-content:space-between; align-items:end; margin-bottom:16px; }
.section-heading a { color:var(--blue); font-weight:700; text-decoration:none; }
.section-note { color:var(--muted); font-size:14px; }
.dropdown-browser { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)) auto; gap:10px; align-items:end; padding:16px; border:1px solid var(--line); border-radius:8px; background:#fff; }
.dropdown-browser label { display:grid; gap:6px; min-width:0; }
.dropdown-browser label span { color:var(--muted); font-size:13px; font-weight:700; }
.dropdown-browser select { width:100%; min-height:40px; border:1px solid var(--line); border-radius:6px; padding:0 10px; background:#fff; color:var(--ink); }
.dropdown-browser button { min-height:40px; border:0; border-radius:6px; padding:0 14px; background:var(--ink); color:#fff; font-weight:800; cursor:pointer; }
.dropdown-results { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:12px; }
.dropdown-results a strong,.search-results a strong { display:block; margin-bottom:4px; }
.dropdown-results a span,.search-results a span { color:var(--muted); font-size:13px; line-height:1.45; }
.dropdown-results a small,.search-results a small { display:block; margin-top:4px; color:#667085; font-size:12px; line-height:1.45; }
.facet-grid,.instrument-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
.facet-card,.instrument-card { display:flex; min-height:112px; flex-direction:column; gap:8px; text-decoration:none; }
.instrument-card strong { font-size:18px; }
.breadcrumb { display:flex; gap:8px; color:var(--muted); margin-bottom:16px; font-size:14px; }
.breadcrumb a { text-decoration:none; }
.instrument-header { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr); gap:30px; margin-bottom:32px; align-items:start; }
.instrument-image { width:100%; border:1px solid var(--line); border-radius:8px; background:var(--soft); }
.meta-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:24px 0; }
.meta-grid div { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; }
.meta-grid dt { color:var(--muted); font-size:13px; }
.meta-grid dd { margin:4px 0 0; font-weight:800; }
.listen-button { display:inline-flex; align-items:center; min-height:42px; padding:0 16px; border-radius:6px; background:var(--accent); color:white; text-decoration:none; font-weight:800; }
.source-note { color:var(--muted); font-size:14px; line-height:1.6; word-break:break-word; }
.source-note a { color:var(--blue); }
.markdown-body { color:#344054; line-height:1.75; font-size:16px; }
.markdown-body h2 { color:var(--ink); margin-top:1.4em; border-bottom:1px solid var(--line); padding-bottom:8px; }
@media (max-width:900px){ .facet-grid,.instrument-grid,.dropdown-results{grid-template-columns:repeat(2,1fr)} .dropdown-browser{grid-template-columns:repeat(2,minmax(0,1fr))} .instrument-header{grid-template-columns:1fr} }
@media (max-width:620px){ .site-header{align-items:flex-start; flex-direction:column} h1{font-size:34px} .facet-grid,.instrument-grid,.stats,.meta-grid,.dropdown-browser,.dropdown-results{grid-template-columns:1fr} }
"""
    search_index = [
        {
            "title": item["title"],
            "original_name": item["original_name"],
            "category": item["category"],
            "country": item["country"],
            "era": item["era"],
            "journey": item.get("journey", ""),
            "journey_name": item.get("journey_name", ""),
            "chapter_name": item.get("chapter_name", ""),
            "chapter_subtitle": item.get("chapter_subtitle", ""),
            "sound_class": item.get("sound_class", ""),
            "hs_class": item.get("hs_class", ""),
            "family": item.get("family", ""),
            "playing_method": item.get("playing_method", ""),
            "body_listening": item.get("body_listening", ""),
            "soundscape": item.get("soundscape", ""),
            "url": site_url(f"/instruments/{item['slug']}/"),
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
  journey: document.getElementById('filter-journey'),
  sound_class: document.getElementById('filter-sound'),
  country: document.getElementById('filter-country'),
  era: document.getElementById('filter-era')
}};
const resetFilters = document.getElementById('filter-reset');

function appendResult(container, item) {{
  const link = document.createElement('a');
  link.href = item.url;
  const title = document.createElement('strong');
  title.textContent = item.title;
  const meta = document.createElement('span');
  meta.textContent = `${{item.original_name}} · ${{item.category}} · ${{item.country}} · ${{item.era}}`;
  const details = document.createElement('small');
  details.textContent = [item.journey, item.sound_class, item.family, item.playing_method].filter(Boolean).join(' · ');
  link.append(title, meta);
  if (details.textContent) link.append(details);
  container.append(link);
}}

function setBrowseMode(mode) {{
  if (!dropdownMode || !cardMode || !modeDropdown || !modeCards) return;
  const useDropdown = mode !== 'cards';
  dropdownMode.hidden = !useDropdown;
  cardMode.hidden = useDropdown;
  modeDropdown.classList.toggle('is-active', useDropdown);
  modeCards.classList.toggle('is-active', !useDropdown);
}}

modeDropdown?.addEventListener('click', () => setBrowseMode('dropdown'));
modeCards?.addEventListener('click', () => setBrowseMode('cards'));
setBrowseMode('dropdown');

if (input && results) {{
  input.addEventListener('input', () => {{
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (!q) return;
    const hits = SEARCH_INDEX.filter(item => Object.values(item).join(' ').toLowerCase().includes(q)).slice(0, 20);
    for (const item of hits) {{
      appendResult(results, item);
    }}
  }});
}}

function countValues(field) {{
  const counts = new Map();
  for (const item of SEARCH_INDEX) {{
    const value = item[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }}
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'));
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
  return Object.fromEntries(Object.entries(filterControls).map(([field, select]) => [field, select?.value || '']));
}}

function renderDropdownResults() {{
  if (!dropdownResults) return;
  dropdownResults.replaceChildren();
  const filters = selectedFilters();
  const hits = SEARCH_INDEX.filter(item => Object.entries(filters).every(([field, value]) => !value || item[field] === value));
  if (dropdownCount) dropdownCount.textContent = `${{hits.length}} 筆`;
  for (const item of hits) {{
    appendResult(dropdownResults, item);
  }}
}}

if (dropdownResults) {{
  fillSelect(filterControls.category, 'category');
  fillSelect(filterControls.journey, 'journey');
  fillSelect(filterControls.sound_class, 'sound_class');
  fillSelect(filterControls.country, 'country');
  fillSelect(filterControls.era, 'era');
  for (const select of Object.values(filterControls)) {{
    select?.addEventListener('change', renderDropdownResults);
  }}
  resetFilters?.addEventListener('click', () => {{
    for (const select of Object.values(filterControls)) {{
      if (select) select.value = '';
    }}
    renderDropdownResults();
  }});
  renderDropdownResults();
}}
"""
    write(OUTPUT_DIR / "assets" / "site.css", css.strip() + "\n")
    write(OUTPUT_DIR / "assets" / "search.js", js.strip() + "\n")
    write(OUTPUT_DIR / "search-index.json", json.dumps(search_index, ensure_ascii=False, indent=2))


def main():
    instruments = read_instruments()
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)
    build_assets(instruments)
    build_index(instruments)
    build_detail_pages(instruments)
    write(OUTPUT_DIR / "instruments" / "index.html", list_page("全部樂器", instruments))
    build_facet_pages(instruments, "category", "categories", "分類")
    build_facet_pages(instruments, "journey", "journeys", "旅圖")
    build_facet_pages(instruments, "sound_class", "sound-classes", "發聲分類")
    build_facet_pages(instruments, "country", "countries", "國家/地區")
    build_facet_pages(instruments, "era", "eras", "年代")
    write(OUTPUT_DIR / ".nojekyll", "")
    print(f"Built {len(instruments)} instruments into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
