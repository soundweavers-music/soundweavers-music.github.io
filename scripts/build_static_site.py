#!/usr/bin/env python
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import shutil
import time
from collections import Counter, defaultdict
from html import escape
from pathlib import Path

import markdown


BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
OUTPUT_DIR = BASE_DIR / "outputs" / "world-instruments-static"
SITE_BASE_PATH = os.environ.get("SITE_BASE_PATH", "").strip()
_TOTAL_INSTRUMENTS = 0  # set in main()

COUNTRY_COORDS = {
    "非洲": (5.0, 20.0), "非洲／西非": (8.0, -5.0), "非洲／中非": (0.0, 20.0),
    "非洲／東非": (0.0, 35.0), "非洲／南非": (-25.0, 25.0), "非洲／北非": (25.0, 10.0),
    "非洲／辛巴威": (-19.0, 30.0),
    "亞洲": (35.0, 100.0), "亞洲／東亞": (35.0, 115.0), "亞洲／東南亞": (10.0, 105.0),
    "亞洲／南亞": (20.0, 78.0), "亞洲／中亞": (45.0, 65.0), "亞洲／西亞": (30.0, 45.0),
    "歐洲": (50.0, 10.0), "歐洲／西歐": (50.0, 0.0), "歐洲／南歐": (42.0, 12.0),
    "歐洲／北歐": (60.0, 15.0), "歐洲／中歐": (50.0, 10.0), "歐洲／東歐": (52.0, 25.0),
    "美洲": (40.0, -100.0), "美洲／北美": (45.0, -100.0), "美洲／中美": (15.0, -90.0),
    "美洲／南美": (-15.0, -60.0), "美洲／加勒比": (20.0, -75.0),
    "大洋洲": (-25.0, 135.0), "大洋洲／澳洲": (-25.0, 135.0),
    "中東": (28.0, 45.0), "印度": (20.0, 78.0), "中國": (35.0, 105.0),
    "日本": (36.0, 138.0), "韓國": (37.0, 127.5), "臺灣": (23.5, 121.0),
    "台灣": (23.5, 121.0), "印尼": (-5.0, 120.0), "泰國": (15.0, 101.0),
    "越南": (16.0, 108.0), "菲律賓": (12.0, 122.0), "緬甸": (22.0, 96.0),
    "柬埔寨": (12.0, 105.0), "馬來西亞": (4.0, 102.0), "尼泊爾": (28.0, 84.0),
    "蒙古": (46.0, 105.0), "土耳其": (39.0, 35.0), "伊朗": (32.0, 53.0),
    "俄羅斯": (60.0, 40.0), "希臘": (39.0, 22.0), "義大利": (42.0, 12.0),
    "西班牙": (40.0, -3.0), "葡萄牙": (39.5, -8.0), "法國": (46.0, 2.0),
    "德國": (51.0, 10.0), "英國": (55.0, -3.0), "愛爾蘭": (53.0, -8.0),
    "荷蘭": (52.0, 5.0), "比利時": (50.5, 4.5), "瑞士": (47.0, 8.0),
    "奧地利": (47.5, 14.0), "波蘭": (52.0, 20.0), "捷克": (50.0, 15.0),
    "匈牙利": (47.0, 20.0), "羅馬尼亞": (46.0, 25.0), "保加利亞": (43.0, 25.0),
    "挪威": (62.0, 10.0), "瑞典": (62.0, 15.0), "丹麥": (56.0, 10.0),
    "芬蘭": (64.0, 26.0), "冰島": (65.0, -18.0),
    "埃及": (27.0, 30.0), "摩洛哥": (32.0, -6.0), "衣索比亞": (9.0, 38.0),
    "肯亞": (0.0, 38.0), "坦尚尼亞": (-6.0, 35.0), "奈及利亞": (8.0, 8.0),
    "迦納": (8.0, -2.0), "塞內加爾": (14.0, -14.0), "南非": (-30.0, 25.0),
    "澳洲": (-25.0, 135.0), "加拿大": (56.0, -106.0), "美國": (40.0, -100.0),
    "墨西哥": (23.0, -102.0), "巴西": (-14.0, -53.0), "阿根廷": (-38.0, -63.0),
    "祕魯": (-9.0, -75.0), "哥倫比亞": (4.0, -73.0), "古巴": (22.0, -79.0),
}

GLOBAL_KEYWORDS = {"全球", "全球／多地", "跨文化／多地", "全球現代", "多地", "國際"}


def get_region_coords(country_str):
    if not country_str:
        return None
    parts = [p.strip() for p in country_str.replace("／", "/").split("/")]
    for part in parts:
        if part in COUNTRY_COORDS:
            return COUNTRY_COORDS[part]
    for part in parts:
        for key, coord in COUNTRY_COORDS.items():
            if part in key or key in part:
                return coord
    return None


def get_all_region_coords(country_str):
    """Return ALL matching coordinates for multi-region country strings."""
    if not country_str:
        return []
    parts = [p.strip() for p in country_str.replace("／", "/").split("/")]
    found = []
    seen = set()
    for part in parts:
        if part in COUNTRY_COORDS:
            coord = COUNTRY_COORDS[part]
            key = (round(coord[0], 1), round(coord[1], 1))
            if key not in seen:
                seen.add(key)
                found.append(coord)
    for part in parts:
        for key, coord in COUNTRY_COORDS.items():
            if part in key or key in part:
                ckey = (round(coord[0], 1), round(coord[1], 1))
                if ckey not in seen:
                    seen.add(ckey)
                    found.append(coord)
    return found


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


def build_map_data(instruments):
    """Return features with lat, lng, name, count, url, samples.
    Multi-region instruments (e.g. '亞洲／歐洲') are counted in ALL matching regions."""
    from collections import defaultdict
    coord_counts = defaultdict(int)
    coord_samples = defaultdict(list)
    coord_country_names = defaultdict(set)

    for item in instruments:
        country = item.get("country", "")
        if not country or country in GLOBAL_KEYWORDS:
            continue
        if any(country.startswith(gk) for gk in GLOBAL_KEYWORDS):
            continue
        all_coords = get_all_region_coords(country)
        if not all_coords:
            continue
        for coords in all_coords:
            key = (round(coords[0], 1), round(coords[1], 1))
            coord_counts[key] += 1
            if len(coord_samples[key]) < 5:
                coord_samples[key].append(item["title"])
            coord_country_names[key].add(country)

    features = []
    for (lat, lng), count in sorted(coord_counts.items(), key=lambda x: -x[1]):
        countries_list = sorted(coord_country_names.get((lat, lng), []))
        primary = max(countries_list, key=len) if countries_list else "未知地區"
        all_urls = [SITE_BASE_PATH + '/countries/' + slugify(c) + '/' for c in countries_list]
        features.append({
            "lat": lat,
            "lng": lng,
            "name": primary,
            "count": count,
            "url": all_urls[0] if all_urls else "{SITE_BASE_PATH}/countries/",
            "urls": all_urls[:10],
            "samples": coord_samples.get((lat, lng), [])[:5],
        })
    return features


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
        # Strip tutorial section from body before conversion (it's extracted separately for the tutorial tab)
        body_without_tutorial = re.sub(
            r"^## 教學\s*\n.*?(?=\n## |\Z)",
            "",
            body.strip(),
            flags=re.DOTALL | re.MULTILINE,
        )
        body_html = markdown.markdown(body_without_tutorial, extensions=["extra", "tables", "fenced_code"], output_format="html5")
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
                "is_popular": meta.get("is_popular", "").lower() == "true",
                "is_uncommon": meta.get("is_uncommon", "").lower() == "true",
                "site_url": meta.get("site_url", ""),
                "html": body_html,
                "tutorial": "",
            }
        )
        # Extract tutorial section from raw body
        tut_match = re.search(
            r"^## 教學\s*\n(.*?)(?=\n## |\Z)",
            body.strip(),
            re.DOTALL | re.MULTILINE,
        )
        if tut_match:
            instruments[-1]["tutorial"] = markdown.markdown(
                tut_match.group(1).strip(),
                extensions=["extra"],
                output_format="html5",
            )
    return instruments


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def page(title, body, page_path=None, meta_extra="", extra_head=""):
    csp = (
        "default-src 'self'; "
        "img-src 'self' https: data:; "
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://busuanzi.ibruce.info; "
        "connect-src 'self'; "
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com; "
        "base-uri 'self'; form-action 'none'; object-src 'none'"
    )
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <meta http-equiv="Content-Security-Policy" content="{csp}">
  <title>{escape(title)}｜世界聲音百科</title>
  {meta_extra}
  <link rel="stylesheet" href="{resolve_url(page_path, '/assets/site.css')}">
  {extra_head}
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{resolve_url(page_path, '/')}">🌍 世界聲音百科</a>
    <nav>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/instruments/')}" class="dropdown-trigger">全部樂器</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/categories/')}">分類</a>
          <a href="#" id="random-nav-link" class="random-link">隨選</a>
          <a href="{resolve_url(page_path, '/popular/')}">熱門</a>
          <a href="{resolve_url(page_path, '/uncommon/')}">冷門</a>
          <a href="{resolve_url(page_path, '/countries/')}">國家</a>
          <a href="{resolve_url(page_path, '/eras/')}">年代</a>
          <a href="{resolve_url(page_path, '/map/')}">地圖</a>
        </div>
      </div>
      <a href="{resolve_url(page_path, '/vocal/')}">人聲與歌唱</a>
      <a href="{resolve_url(page_path, '/theory/')}">樂理</a>
      <a href="{resolve_url(page_path, '/about/')}">關於</a>
      <a href="{resolve_url(page_path, '/contact/')}">聯絡我們</a>
    </nav>
  </header>
  {body}
  <footer class="site-footer">
    <div class="footer-inner">
      <span>世界聲音百科 — 世界樂器、人聲與音樂文化的旅圖</span>
      <span>作者：<a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">隔壁織音人</a></span>
      <nav class="footer-nav">
        <a href="{resolve_url(page_path, '/')}">首頁</a>
        <a href="{resolve_url(page_path, '/vocal/')}">人聲與歌唱</a>
        <a href="{resolve_url(page_path, '/categories/')}">分類</a>
        <a href="{resolve_url(page_path, '/countries/')}">國家</a>
        <a href="{resolve_url(page_path, '/popular/')}">熱門</a>
        <a href="{resolve_url(page_path, '/uncommon/')}">冷門</a>
        <a href="{resolve_url(page_path, '/theory/')}">樂理</a>
        <a href="{resolve_url(page_path, '/contact/')}">聯絡我們</a>
        <a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">訂閱 YouTube</a>
      <span class="visit-counter">總瀏覽次數：<span id="busuanzi_value_site_pv"></span> ｜今日訪客：<span id="busuanzi_value_site_uv"></span></span>
      </nav>
    </div>
  </footer>
  <button id="back-top" class="back-top" aria-label="回頂部">↑</button>
  <script src="{resolve_url(page_path, '/assets/search.js')}"></script>
    <script src="{resolve_url(page_path, '/assets/random-instrument.js')}"></script>
  <script async src="https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
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


def build_instruments_list_page(instruments):
    """Build the /instruments/ page with view-switch: filter dropdown + category cards."""
    page_path = OUTPUT_DIR / "instruments" / "index.html"
    by_cat = defaultdict(list)
    for item in instruments:
        by_cat[item["category"]].append(item)
    category_links = "".join(
        f'<a class="facet-card" href="../../categories/{slugify(name)}/"><strong>{escape(name)}</strong><span>{len(items)} 筆</span></a>'
        for name, items in sorted(by_cat.items())
    )
    cards = "\n".join(card(item, page_path) for item in instruments) or '<p class="empty">目前沒有資料。</p>'
    body = f"""
    <main class="page">
      <section class="compact-hero">
        <p class="eyebrow">All Instruments</p>
        <h1>全部樂器</h1>
        <p class="lead">{len(instruments)} 件樂器</p>
        <div class="search-panel" style="max-width:520px;margin-top:16px;">
          <input id="site-search" type="search" placeholder="搜尋中文名、英文名、分類、國家或年代…" autocomplete="off" spellcheck="false">
        </div>
        <div id="search-results" class="search-results"></div>
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
          <div class="section-heading"><h2>分類瀏覽</h2></div>
          <div class="facet-grid">{category_links}</div>
        </section>
        <section class="section">
          <div class="section-heading"><h2>全部樂器</h2><span class="section-note">{len(instruments)} 件</span></div>
          <div class="instrument-grid">{cards}</div>
        </section>
      </div>
    </main>
    """
    write(page_path, page("全部樂器", body, page_path))


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

    # Popular/uncommon counts
    pop_count = sum(1 for i in instruments if i.get("is_popular"))
    un_count = sum(1 for i in instruments if i.get("is_uncommon"))

    body = f"""
    <main class="page">
      <section class="hero">
        <p class="eyebrow">World Musical Instruments Encyclopedia</p>
        <h1>世界聲音百科</h1>
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


      <section class="section">
        <div class="section-heading"><h2>精選分類</h2></div>
        <div class="featured-links">
          <a class="featured-card hot" href="{resolve_url(index_path, '/popular/')}">
            <strong>熱門樂器</strong>
            <span>{pop_count} 件熱門樂器，探索世界知名樂器</span>
          </a>
          <a class="featured-card cold" href="{resolve_url(index_path, '/uncommon/')}">
            <strong>冷門樂器</strong>
            <span>{un_count} 件冷門樂器，發掘稀有珍品</span>
          </a>
          <a class="featured-card random" href="#" id="random-link-home">
            <strong>隨選樂器</strong>
            <span>每次點選都隨機產生一個樂器，驚喜不斷</span>
          </a>
        </div>
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

    # Write map data as JSON for the map page
    map_features = build_map_data(instruments)
    map_json_path = OUTPUT_DIR / "assets" / "map-data.json"
    map_json_path.write_text(json.dumps(map_features, ensure_ascii=False, indent=2), encoding="utf-8")

    # Write random-instrument JS for the nav link and homepage card
    slugs_json = json.dumps([item["slug"] for item in instruments], ensure_ascii=False)
    rand_js = f"""
function goRandom() {{
  var slugs = {slugs_json};
  var idx = Math.floor(Math.random() * slugs.length);
  window.location.href = '{SITE_BASE_PATH}/instruments/' + slugs[idx] + '/';
}}
document.getElementById('random-link-home')?.addEventListener('click', function(e) {{ e.preventDefault(); goRandom(); }});
document.getElementById('random-nav-link')?.addEventListener('click', function(e) {{ e.preventDefault(); goRandom(); }});
"""
    write(OUTPUT_DIR / "assets" / "random-instrument.js", rand_js.strip() + "\n")


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
        img_credit_html = '<p class="image-credit">圖片來源：Wikimedia Commons</p>' if img_url else ""
        header_class = "instrument-header has-image" if img_url else "instrument-header"
        # Popularity badges
        badges = ""
        if item.get("is_popular"):
            badges += '<span class="badge badge-hot">熱門</span>'
        if item.get("is_uncommon"):
            badges += '<span class="badge badge-cold">冷門</span>'
        # Inject YouTube iframes into the 聆聽示範 section in the article body
        body_html = inject_youtube_into_body(item['html'], item.get("youtube_ids", []))
        # Extract plain-text description from first paragraph of HTML body
        desc_match = re.search(r'<p>(.*?)</p>', body_html, re.DOTALL)
        desc_text = re.sub(r'<[^>]+>', '', desc_match.group(1))[:160] if desc_match else ""
        og_tags = "\n".join(filter(None, [
            f'<meta name="description" content="{escape(desc_text)}">' if desc_text else "",
            f'<meta property="og:title" content="{escape(item["title"])}｜世界聲音百科">',
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
              <p class="badge-row">{badges}</p>
            </div>
            {f'<div class="header-image">{img_html}{img_credit_html}</div>' if img_url else ""}
          </header>
          {"<dl class='meta-grid'>" + meta_grid + "</dl>" if meta_grid else ""}
          {f'''
          <div class="tab-bar">
            <button class="tab-btn is-active" data-tab="intro">介紹</button>
            <button class="tab-btn" data-tab="tutorial">教學</button>
          </div>
          <div id="tab-intro" class="tab-pane is-active"><article class="markdown-body">{body_html}</article></div>
          <div id="tab-tutorial" class="tab-pane"><article class="markdown-body">{item["tutorial"]}</article></div>
          '''}
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

/* ── Dropdown nav ─────────────────────────────────────────────── */
.nav-dropdown { position:relative; display:inline-block; }
.nav-dropdown .dropdown-trigger { cursor:pointer; }
.dropdown-menu {
  display:none; position:absolute; top:100%; left:0; z-index:200;
  min-width:140px; background:#fff; border:1px solid var(--line);
  border-radius:8px; box-shadow:var(--shadow-md); padding:4px 0;
}
.nav-dropdown:hover .dropdown-menu,
.nav-dropdown .dropdown-menu:hover { display:block; }
.dropdown-menu a {
  display:block; padding:8px 16px; font-size:13px; color:var(--ink2);
  text-decoration:none; border-radius:0; white-space:nowrap;
}
.dropdown-menu a:hover { background:var(--soft); color:var(--accent); }

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

/* ── Tab bar ─────────────────────────────────────────────────── */
.tab-bar { display:flex; gap:4px; margin:0 0 20px; border-bottom:2px solid var(--line); padding-bottom:0; }
.tab-btn {
  padding:10px 20px; border:1px solid var(--line); border-bottom:none;
  border-radius:8px 8px 0 0; background:var(--soft); color:var(--muted);
  font-weight:700; font-size:14px; cursor:pointer; transition:all .15s;
  position:relative; top:2px;
}
.tab-btn:hover { color:var(--accent); }
.tab-btn.is-active { background:var(--surface); color:var(--accent); border-color:var(--line); border-bottom-color:var(--surface); }
.tab-pane { display:none; }
.tab-pane.is-active { display:block; }

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
.footer-inner a { color:var(--blue); text-decoration:none; }
.visit-counter { font-size:12px; color:var(--muted); white-space:nowrap; }
.footer-nav { display:flex; gap:16px; }
.footer-nav a { color:var(--muted); text-decoration:none; }
.footer-nav a:hover { color:var(--accent); }

/* ── About page ─────────────────────────────────────────────── */
.about-hero {
  padding:48px 24px; text-align:center; color:#fff; border-radius:0 0 20px 20px;
  margin:-36px -24px 0; min-height:200px; display:flex; align-items:center; justify-content:center;
}
.about-hero-content { max-width:640px; }
.about-eyebrow { color:rgba(255,255,255,0.7); font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin:0 0 12px; }
.about-hero h1 { font-size:clamp(28px,4vw,42px); margin:0 0 16px; color:#fff; text-shadow:0 2px 8px rgba(0,0,0,0.3); }
.about-subtitle { font-size:18px; opacity:0.9; margin:0; }
.about-body { max-width:800px; margin:40px auto; }
.about-section { margin-bottom:40px; }
.about-section h2 { font-size:22px; margin:0 0 16px; padding-bottom:8px; border-bottom:2px solid var(--accent); display:inline-block; }
.about-text p { color:var(--ink2); line-height:1.9; font-size:16px; margin:0 0 16px; }
.about-author { display:flex; gap:24px; align-items:start; flex-wrap:wrap; }
.author-avatar { width:80px; height:80px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:800; flex-shrink:0; }
.author-avatar img,img.author-avatar { width:80px; height:80px; border-radius:50%; object-fit:cover; display:block; }
.author-info { flex:1; min-width:200px; }
.author-info h3 { font-size:20px; margin:0 0 8px; }
.author-info p { color:var(--ink2); line-height:1.7; margin:0 0 8px; }
.about-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.service-list { list-style:none; padding:0; margin:0; }
.service-list li { padding:10px 14px; border:1px solid var(--line); border-radius:8px; margin-bottom:8px; background:var(--surface); font-size:15px; display:flex; align-items:center; gap:10px; }
.service-icon { font-size:20px; }
.contact-info p { margin:0 0 12px; font-size:16px; }
.contact-info a { color:var(--blue); text-decoration:none; font-weight:600; }
.contact-info a:hover { text-decoration:underline; }

/* ── Feedback section ────────────────────────────────────────── */
.feedback-actions { margin-top:20px; display:flex; gap:12px; flex-wrap:wrap; }
.btn-line { display:inline-flex; align-items:center; gap:8px; padding:12px 24px; background:#06C755; color:#fff; border-radius:8px; text-decoration:none; font-weight:700; font-size:15px; transition:background .15s,transform .15s; box-shadow:0 2px 6px rgba(6,199,85,.3); }
.btn-line:hover { background:#05a648; transform:translateY(-1px); box-shadow:0 4px 12px rgba(6,199,85,.35); }
.btn-icon { font-size:20px; }

/* ── Image credit ───────────────────────────────────────────── */
.image-credit { font-size:12px; color:var(--muted); text-align:center; margin-top:6px; }

/* ── Badges ──────────────────────────────────────────────────── */
.badge-row { margin:8px 0 0; display:flex; gap:6px; }
.badge {
  display:inline-flex; padding:3px 8px; border-radius:4px;
  font-size:11px; font-weight:700;
}
.badge-hot { background:#fef2f0; color:#c2410c; border:1px solid #fed7c5; }
.badge-cold { background:#f0f5ff; color:#1e40af; border:1px solid #c5ddfd; }

/* ── Featured links ──────────────────────────────────────────── */
.featured-links { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:0 0 40px; }
.featured-card {
  display:flex; flex-direction:column; gap:10px; border-radius:10px; padding:22px;
  text-decoration:none; transition:transform .15s,box-shadow .15s;
}
.featured-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.08); }
.featured-card.hot { background:linear-gradient(135deg,#fff5f0,#ffe8e0); border:1px solid #fdd4c5; }
.featured-card.cold { background:linear-gradient(135deg,#f0f7ff,#e0efff); border:1px solid #c5ddfd; }
.featured-card.random { background:linear-gradient(135deg,#f5f0ff,#ebe0ff); border:1px solid #d5c5fd; }
.featured-card strong { font-size:18px; }
.featured-card span { color:var(--muted); line-height:1.5; font-size:14px; }

/* ── Map section ─────────────────────────────────────────────── */
.world-map { width:100%; height:420px; border-radius:10px; border:1px solid var(--line); overflow:hidden; background:var(--soft); margin-bottom:8px; }
.map-hint { text-align:center; color:var(--muted); font-size:14px; margin:0 0 24px; }

/* ── Manager page ────────────────────────────────────────────── */
.manage-card {
  background:var(--surface); border:1px solid var(--line); border-radius:var(--radius);
  padding:28px; margin-bottom:24px; box-shadow:var(--shadow);
}
.manage-card h2 { font-size:18px; margin:0 0 8px; }
.manage-card p { color:var(--muted); font-size:14px; line-height:1.6; margin:0 0 18px; }
.btn {
  display:inline-flex; align-items:center; padding:10px 20px; border:0;
  border-radius:6px; font-size:15px; font-weight:700; cursor:pointer; text-decoration:none;
}
.btn-primary { background:var(--accent); color:#fff; }
.btn-primary:hover { background:var(--accent2); }
.upload-area { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.upload-area input[type="file"] { flex:1; min-width:200px; padding:6px 0; font-size:14px; }
.upload-status { margin-top:12px; padding:8px 12px; border-radius:6px; font-size:14px; }
.upload-status.error { background:#fef2f0; color:#c2410c; border:1px solid #fed7c5; }
.upload-status.success { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }

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
  .featured-links { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .yt-grid { grid-template-columns:1fr !important; }
}
@media (max-width:700px) {
  .site-header { flex-direction:column; align-items:flex-start; gap:10px; padding:14px 18px; }
  .site-header nav { flex-wrap:wrap; gap:2px; }
  h1 { font-size:28px; }
  .instrument-grid,.stats,.meta-grid,.dropdown-browser,.dropdown-results,.featured-links { grid-template-columns:1fr !important; }
  .instrument-header,.instrument-header.has-image { grid-template-columns:1fr; }
  .header-image { position:static; }
  .page,.instrument-page { padding:20px 16px 60px; }
  .facet-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .world-map { height:280px; }
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

/* ── Tab switching ──────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {{
  btn.addEventListener('click', () => {{
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('is-active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    const pane = document.getElementById('tab-' + btn.dataset.tab);
    if (pane) pane.classList.add('is-active');
  }});
}});
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
            f"<url><loc>{base}/eras/</loc></url>",
            f"<url><loc>{base}/popular/</loc></url>",
            f"<url><loc>{base}/uncommon/</loc></url>",
            f"<url><loc>{base}/map/</loc></url>",
            f"<url><loc>{base}/about/</loc></url>",
            f"<url><loc>{base}/theory/</loc></url>"]
    for item in instruments:
        urls.append(f"<url><loc>{base}/instruments/{item['slug']}/</loc></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls) + "\n</urlset>\n"
    write(OUTPUT_DIR / "sitemap.xml", xml)


def build_special_pages(instruments):
    """Build popular and uncommon list pages."""
    popular = [i for i in instruments if i.get("is_popular")]
    uncommon = [i for i in instruments if i.get("is_uncommon")]

    if popular:
        page_dir = OUTPUT_DIR / "popular"
        page_dir.mkdir(parents=True, exist_ok=True)
        write(page_dir / "index.html", list_page("熱門樂器", popular, page_dir / "index.html"))

    if uncommon:
        page_dir = OUTPUT_DIR / "uncommon"
        page_dir.mkdir(parents=True, exist_ok=True)
        write(page_dir / "index.html", list_page("冷門樂器", uncommon, page_dir / "index.html"))

def build_map_page(instruments):
    """Build a standalone map page at /map/ with clickable markers."""
    from collections import defaultdict
    map_features = build_map_data(instruments)
    map_json = json.dumps(map_features, ensure_ascii=False)
    page_dir_ = OUTPUT_DIR / "map"
    page_dir_.mkdir(parents=True, exist_ok=True)

    slugs_json = json.dumps([i["slug"] for i in instruments], ensure_ascii=False)

    extra = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">'
    body = f"""<main class="page">
  <section class="compact-hero">
    <p class="eyebrow">Geography</p>
    <h1>地圖導覽</h1>
    <p class="lead">點擊地圖上的標記，瀏覽該地區的所有樂器。</p>
  </section>
  <div id="world-map" class="world-map"></div>
  <p class="map-hint">每個圓點代表一個地區的樂器數量，點擊可查看該地區樂器列表。</p>
</main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
(function() {{
  var mapData = {map_json};
  var container = document.getElementById('world-map');
  if (!container || !mapData.length) return;
  var map = L.map('world-map', {{ center: [20, 30], zoom: 2, minZoom: 1, maxZoom: 6, zoomControl: true, attributionControl: true }});
  L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{ maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }}).addTo(map);
  var bounds = [];
  mapData.forEach(function(item) {{
    var radius = Math.min(8 + item.count * 1.5, 30);
    var marker = L.circleMarker([item.lat, item.lng], {{ radius: radius, fillColor: '#0d766b', color: '#0a5c53', weight: 2, opacity: 1, fillOpacity: 0.6 }}).addTo(map);
    var tip = '<strong>' + item.name + '<\/strong><br>' + item.count + ' 件樂器';
    if (item.samples.length) tip += '<br><small>' + item.samples.join('、') + (item.count > 5 ? '…' : '') + '<\/small>';
    marker.bindTooltip(tip, {{ direction: 'top', offset: [0, -8] }});
    var links = '<div style="max-height:200px;overflow-y:auto">' + (item.urls || [item.url]).map(function(u) {{ return '<a href="' + u + '" style="display:block;padding:4px 0;color:#1d4ed8;text-decoration:none;border-bottom:1px solid #eee">' + u.split('/').filter(Boolean).pop() + '</a>'; }}).join('') + '</div>';
    marker.bindPopup('<strong>' + item.name + '</strong><br>' + item.count + ' 件樂器' + links, {{ maxWidth: 300 }});
    bounds.push([item.lat, item.lng]);
  }});
  if (bounds.length > 0) map.fitBounds(bounds, {{ padding: [30, 30], maxZoom: 4 }});
}})();
</script>"""
    write(page_dir_ / "index.html", page("地圖導覽", body, page_dir_ / "index.html", extra_head=extra))


def build_manager_page(instruments):
    """Build a static manager page at /manage/ with Excel download and client-side upload."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    page_dir_ = OUTPUT_DIR / "manage"
    page_dir_.mkdir(parents=True, exist_ok=True)

    fm_fields = [
        ("title", "樂器名稱（繁體中文）"),
        ("original_name", "原文名稱（英文）"),
        ("category", "分類"),
        ("country", "來源地區"),
        ("era", "年代"),
        ("image", "圖片網址"),
        ("site_url", "網站連結"),
        ("sound_class", "發聲大類"),
        ("range", "音域"),
        ("instrument_key", "調性"),
        ("hs_class", "H-S 分類"),
        ("family", "家族"),
        ("playing_method", "演奏方式"),
        ("body_listening", "身體聆聽"),
        ("soundscape", "聲音景觀"),
        ("region_type", "區域類型"),
        ("youtube_ids", "YouTube ID"),
        ("introduction", "介紹內容"),
        ("history", "歷史背景"),
        ("timbre", "音色描述"),
        ("material", "樂器材質"),
        ("tutorial", "教學"),
    ]
    field_keys = [f[0] for f in fm_fields]

    # Generate Excel
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "樂器總資料庫"
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
    sub_font = Font(bold=True, color="666666", size=10)
    sub_fill = PatternFill(start_color="E6F4F1", end_color="E6F4F1", fill_type="solid")
    link_font = Font(color="1D4ED8", underline="single")

    for col_idx, (key, zh) in enumerate(fm_fields, 1):
        cell = ws.cell(row=1, column=col_idx, value=key)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell2 = ws.cell(row=2, column=col_idx, value=zh)
        cell2.font = sub_font
        cell2.fill = sub_fill
        cell2.alignment = Alignment(horizontal="center")
    ws.freeze_panes = "A3"

    # Parse body sections from markdown files for Excel export
    body_keys = {"introduction": "## \u4ecb\u7d39", "history": "## \u6b77\u53f2\u80cc\u666f",
                 "timbre": "## \u97f3\u8272\u63cf\u8ff0",
                 "listen": "## \u8046\u807d\u793a\u7bc4",
                 "representative": "## \u4ee3\u8868\u6027\u4f5c\u54c1",
                 "material": "## \u6a02\u5668\u6750\u8cea",
                 "tutorial": "## \u6559\u5b78"}

    md_files = sorted(OUTPUT_DIR.parent.parent.glob("content/instruments/*.md"))
    md_body_cache = {}
    for mf in md_files:
        slug = mf.stem
        md_text = mf.read_text(encoding="utf-8")
        # Split frontmatter from body
        fm_match = re.match(r"^---\s*\n.*?\n---", md_text, re.DOTALL)
        raw_body = md_text[fm_match.end():].strip() if fm_match else md_text.strip()
        sections = {}
        for key, heading in body_keys.items():
            pattern = re.compile(rf"^{re.escape(heading)}\s*\n(.*?)(?=\n## |\Z)", re.DOTALL | re.MULTILINE)
            m = pattern.search(raw_body)
            if m:
                sections[key] = m.group(1).strip()
        md_body_cache[slug] = sections

    for row_idx, item in enumerate(instruments, 3):
        slug = item.get("slug", "")
        body_sections = md_body_cache.get(slug, {})
        for col_idx, key in enumerate(field_keys, 1):
            val = item.get(key, "")
            # For body keys, get from parsed markdown
            if key in ("introduction", "history", "timbre", "material", "tutorial"):
                val = body_sections.get(key, "")
            if val:
                cell = ws.cell(row=row_idx, column=col_idx, value=str(val))
                if key in ("site_url", "image") and str(val).startswith("http"):
                    cell.font = link_font
                    cell.hyperlink = str(val)

    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 4, 50)

    # Add theory basics sheet
    ws_theory = wb.create_sheet(title="樂理基礎")
    theory_fields = [("topic", "主題"), ("content", "內容")]
    for col_idx, (key, zh) in enumerate(theory_fields, 1):
        cell = ws_theory.cell(row=1, column=col_idx, value=key)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell2 = ws_theory.cell(row=2, column=col_idx, value=zh)
        cell2.font = sub_font
        cell2.fill = sub_fill
        cell2.alignment = Alignment(horizontal="center")
    for row_idx, tab in enumerate(get_theory_data(), 3):
        ws_theory.cell(row=row_idx, column=1, value=tab["label"]).font = Font(bold=True, size=11)
        plain_text = re.sub(r"<[^>]+>", "", tab["content"]).strip()
        cell = ws_theory.cell(row=row_idx, column=2, value=plain_text)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws_theory.column_dimensions["A"].width = 16
    ws_theory.column_dimensions["B"].width = 120
    ws_theory.freeze_panes = "A3"

    excel_path = OUTPUT_DIR / "assets" / "instruments_database.xlsx"
    excel_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        wb.save(str(excel_path))
    except PermissionError:
        print("Warning: Excel file locked, skipping")

    body = """<main class="page" style="max-width:720px;">
  <section class="compact-hero">
    <p class="eyebrow">Management</p>
    <h1>管理者頁面</h1>
  </section>

  <div id="manage-app">
    <div class="manage-card">
      <h2>下載 Excel 樂器總資料庫</h2>
      <p>將所有樂器的 Markdown 檔案匯出為 Excel 格式。包含所有 frontmatter 欄位與介紹、歷史、音色描述等內容。第一列為英文欄位名稱，第二列為中文說明。</p>
      <a class="btn btn-primary" href="../assets/instruments_database.xlsx" download>下載 Excel</a>
    </div>

    <div class="manage-card">
      <h2>上傳 Excel 還原 Markdown</h2>
      <p>上傳一個 Excel 檔案（格式需與下載版本相同），系統會在瀏覽器中自動處理每一列資料，還原為獨立的 Markdown 檔案，並打包成 ZIP 壓縮檔供下載。</p>
      <div class="upload-area">
        <input type="file" id="excel-upload" accept=".xlsx">
        <button class="btn btn-primary" id="process-excel">上傳並下載 ZIP</button>
      </div>
      <div id="upload-status" class="upload-status"></div>
    </div>
  </div>


</main>

<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
(function() {
  if (sessionStorage.getItem('manage_pass') === 'ok') {
    document.getElementById('manage-locked').style.display = 'none';
    document.getElementById('manage-app').style.display = 'block';
  } else {
    document.getElementById('manage-locked').style.display = 'block';
    document.getElementById('manage-app').style.display = 'none';
    setTimeout(function() {
      var c = prompt('管理者密碼：');
      if (c && c === atob('NTIwMTMxNA==')) {
        sessionStorage.setItem('manage_pass', 'ok');
        document.getElementById('manage-locked').style.display = 'none';
        document.getElementById('manage-app').style.display = 'block';
      } else if (c !== null) {
        document.getElementById('password-error').textContent = '密碼錯誤';
      }
    }, 200);
  }

  function slugify(name) {
    if (!name) return 'instrument';
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'instrument';
  }

  document.getElementById('process-excel')?.addEventListener('click', function() {
    if (typeof XLSX === 'undefined' || typeof JSZip === 'undefined') {
      document.getElementById('upload-status').textContent = '函式庫載入中，請稍後再試...';
      document.getElementById('upload-status').className = 'upload-status error';
      return;
    }
    var fileInput = document.getElementById('excel-upload');
    var status = document.getElementById('upload-status');
    if (!fileInput || !fileInput.files.length) {
      status.textContent = '請選擇一個 Excel 檔案';
      status.className = 'upload-status error';
      return;
    }
    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, {type: 'array'});
        var sheet = workbook.Sheets[workbook.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(sheet, {header: 1});
        if (rows.length < 3) {
          status.textContent = '檔案格式錯誤：缺少足夠的資料列（需要標題列 + 資料列）';
          status.className = 'upload-status error';
          return;
        }
        var headers = rows[0] || [];
        var zip = new JSZip();
        var count = 0;
        for (var i = 2; i < rows.length; i++) {
          var row = rows[i];
          if (!row || !row[0]) continue;
          var fmLines = ['---'];
          var sections = {};
          var origName = '';
          for (var j = 0; j < headers.length; j++) {
            var key = String(headers[j] || '').trim();
            var val = row[j] !== undefined ? String(row[j]).trim() : '';
            if (!key || !val) continue;
            if (key === 'original_name') origName = val;
            if (key === 'introduction' || key === 'history' || key === 'timbre') {
              sections[key] = val;
            } else {
              fmLines.push(key + ': ' + val);
            }
          }
          fmLines.push('---');
          var bodyParts = [];
          if (sections.introduction) bodyParts.push('\n## 介紹\n\n' + sections.introduction);
          if (sections.history) bodyParts.push('\n## 歷史背景\n\n' + sections.history);
          if (sections.timbre) bodyParts.push('\n## 音色描述\n\n' + sections.timbre);
          var fullContent = fmLines.join('\n') + bodyParts.join('\n') + '\n';
          var filename = slugify(origName || ('instrument_' + (i + 1))) + '.md';
          zip.file(filename, fullContent);
          count++;
        }
        if (count === 0) {
          status.textContent = '找不到有效的樂器資料，請確認 Excel 格式是否正確。';
          status.className = 'upload-status error';
          return;
        }
        zip.generateAsync({type: 'blob'}).then(function(blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'instruments_markdown.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
          status.textContent = '成功生成 ' + count + ' 個 .md 檔案，已開始下載。';
          status.className = 'upload-status success';
        });
      } catch(err) {
        status.textContent = '處理失敗：' + err.message;
        status.className = 'upload-status error';
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
})();
</script>"""
    write(page_dir_ / "index.html", page("管理者頁面", body, page_dir_ / "index.html", meta_extra='<meta name="robots" content="noindex">'))



def build_about_page():
    """Build the About page with website info and author details."""
    page_dir_ = OUTPUT_DIR / "about"
    page_dir_.mkdir(parents=True, exist_ok=True)
    bg_url = "https://yt3.googleusercontent.com/6nBZ7RVoXGMH2fuMPWiju_tpAET9D-qVkOhg1HjGqh8m9EaO-u9wO_oHVA12Sy0DzoKn7mGVmA=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj"
    # Copy author logo into output assets
    src_logo = BASE_DIR / "static" / "author-logo.jpg"
    dst_logo = OUTPUT_DIR / "assets" / "author-logo.jpg"
    dst_logo.parent.mkdir(parents=True, exist_ok=True)
    if src_logo.exists():
        import shutil as _shutil
        _shutil.copy2(str(src_logo), str(dst_logo))
    logo_url = resolve_url(page_dir_ / "index.html", "/assets/author-logo.jpg")
    body = f"""<main class="about-page">
  <section class="about-hero" style="background:linear-gradient(135deg,rgba(0,0,0,0.7),rgba(0,0,0,0.4)),url({bg_url}) center/cover no-repeat;">
    <div class="about-hero-content">
      <p class="about-eyebrow">World Musical Instruments Encyclopedia</p>
      <h1>關於世界聲音百科</h1>
      <p class="about-subtitle">循著聲音，走進不同文化的現場</p>
    </div>
  </section>

  <div class="about-body">
    <section class="about-section">
      <h2>創建網站理念</h2>
      <div class="about-text">
        <p>這個網站的出發點，來自於我們對世界樂器長期的喜愛與好奇。每一件樂器都不只是聲音的工具，它也承載著一個地方的生活方式、信仰、節慶、遷徙、工藝與情感記憶。當我們聽見一種陌生的音色，有時會感到遙遠，有時卻會莫名產生共鳴。這正是世界樂器迷人的地方。</p>
        <p>目前網路上雖然能找到許多樂器資料，但多半分散在不同網站、影片、學術資料或零散文章中，缺少一個清楚、完整、可持續擴充的整理系統。對一般讀者來說，常常很難從樂器分類、地域分布、聲音特質、演奏方式、文化背景與現代應用之間建立完整的理解。</p>
        <p>因此，我們想建立一個兼具知識性、可讀性與探索感的樂器百科平台。網站將以更有系統的方式整理世界各地的樂器，包含樂器名稱、分類、起源地區、構造特色、演奏方式、音色描述、文化背景、代表曲目、延伸聆聽與創作應用等內容，讓讀者可以像翻閱地圖一樣，循著聲音走進不同文化的現場。</p>
        <p>這個網站的核心目標，是讓世界樂器不再只是冷冰冰的資料條目，而是成為人們認識音樂、理解文化、激發創作靈感的一扇門。無論是音樂創作者、教育工作者、學生、樂器愛好者，或只是單純對聲音感到好奇的人，都能在這裡找到清楚、有脈絡、值得慢慢探索的內容。</p>
        <p>隨著網站的發展，我們逐漸意識到：音樂的世界不只有樂器。如果說樂器是人類創造聲音的延伸，那麼<strong>人聲</strong>就是最原始、最直接的音樂表達工具。每一個人從出生的那一刻起，就擁有這副獨一無二的「樂器」。因此，我們開設了<strong>人聲與歌唱</strong>專區，從初階的發聲啟蒙、身體覺察，到進階的混聲技術、錄音室實戰，乃至聲學研究與教學法探討，打造一套從零開始、循序漸進的流行歌唱教學體系。我們希望透過這套內容，幫助更多人重新認識自己的聲音，找到自在歌唱的自信與樂趣。</p>
        <p>另一方面，音樂創作的過程中，<strong>錄音與後製</strong>是不可或缺的關鍵環節。無論是宅錄自製 DEMO、Podcast 收音，或是進階的混音與母帶處理，好的錄音知識能讓創作成果大幅提升。為此，我們規劃了<strong>錄音後製</strong>專區，涵蓋錄音技術、聲學概念、器材指南與製作觀念，從入門到進階，逐步建立對聲音製作的理解。這個專區將會陸續上線，敬請期待。</p>
        <p>從世界樂器、人聲歌唱到錄音後製，這三個面向分別代表了「聲音的載體」、「聲音的源頭」與「聲音的塑造」。我們希望將它們整合在同一個平台上，讓音樂的學習不再是零散的片段，而是一幅完整、互相連結的知識地圖。無論你想認識一件從未聽過的樂器、想學好一首歌、或是想把自己的音樂作品打磨得更好，這裡都有適合你的章節。</p>
        <p style="margin-top:20px;padding:14px 18px;background:var(--accent);color:#fff;border-radius:8px;display:inline-block;font-weight:700;">創站日期：2026 年 6 月 25 日</p>
      </div>
    </section>

    <section class="about-section">
      <h2>作者</h2>
      <div class="about-author">
        <img class="author-avatar" src="{logo_url}" alt="隔壁織音人" loading="lazy">
        <div class="author-info">
          <h3>隔壁織音人</h3>
          <p>為隔壁音樂工作室 Next Door Music 的音樂團體</p>
          <p>隔壁音樂匯聚熱愛音樂夥伴的創意單位。我們將每位合作夥伴視為珍貴的「音樂鄰居」，在此紀錄彼此的創作火花。</p>
          <p>我們致力探索音符的無限可能，打造高品質聽覺體驗，並提供專業音樂製作服務。</p>
        </div>
      </div>
    </section>

    <div class="about-grid">
      <section class="about-section">
        <h2>服務項目 Service</h2>
        <ul class="service-list">
          <li><span class="service-icon">🎵</span>編曲製作｜翻唱改編．風格重塑</li>
          <li><span class="service-icon">🎼</span>詞曲訂製｜原創詞曲</li>
          <li><span class="service-icon">🎚️</span>後期處理｜人聲修音．混音</li>
          <li><span class="service-icon">🎤</span>人聲錄製｜DEMO 代唱．導唱</li>
        </ul>
      </section>

      <section class="about-section">
        <h2>聯絡我們 Contact Us</h2>
        <div class="contact-info">
          <p>✉️ <a href="mailto:nextdoor20250726@gmail.com">nextdoor20250726@gmail.com</a></p>
          <p>🔗 <a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">YouTube 頻道：隔壁織音人</a></p>
        </div>
      </section>
    </div>

    <section class="about-section">
      <h2>回饋建議 Feedback</h2>
      <div class="about-text">
        <p>如果您對本網站有任何建議、發現資料錯誤、或想推薦更多樂器資料，歡迎透過 LINE 官方帳號告訴我們！您的回饋是我們持續改善的重要動力。</p>
        <div class="feedback-actions">
          <a class="btn btn-line" href="https://line.me/R/ti/p/@971xnxql" target="_blank" rel="noopener">
            <span class="btn-icon">💬</span>透過 LINE 送出回饋
          </a>
          <a class="btn" href="mailto:nextdoor20250726@gmail.com" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:var(--blue);color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 2px 6px rgba(29,78,216,.3);">
            <span class="btn-icon">✉️</span>email：nextdoor20250726@gmail.com
          </a>
        </div>
      </div>
    </section>
  </div>
</main>"""
    write(page_dir_ / "index.html", page("關於", body, page_dir_ / "index.html"))

def get_theory_data():
    """Return a list of dicts with music theory content (label, icon, id, html_content)."""
    return [
        {
            "id": "notation",
            "label": "譜號",
            "icon": "🎼",
            "content": """
<h2>譜號的起源與功能</h2>
<p>譜號（Clef，源自拉丁語 clavis，意為「鑰匙」）是五線譜中最重要的標記之一，其功能相當於一把「解碼鑰匙」，告訴我們五線譜上的每一條線和每一間分別對應到什麼音高。沒有譜號，五線譜上的音符就只是一堆沒有意義的記號。譜號的發明是西方音樂記譜法發展過程中最關鍵的里程碑之一，它的出現讓音樂得以被精確記錄與傳承。</p>

<h2>常見譜號的種類</h2>
<p>在西方音樂歷史中，譜號的種類繁多，但經過數百年的演變，目前最常使用的譜號主要分為三大類：高音譜號（G譜號）、低音譜號（F譜號）與中音譜號（C譜號）。</p>

<p><strong>高音譜號（G Clef）</strong>：高音譜號是現代音樂中最常見的譜號。它的符號源自字母 G 的裝飾性寫法，其螺旋中心所在的位置標示了 G4 音（中央 C 上方的 G）。在鋼琴譜中，右手通常使用高音譜號。高音譜號的記譜範圍大致涵蓋小字一組的中央 C 到小字三組或四組的音域，適合記錄音域較高的樂器，如小提琴、長笛、單簧管、小號、女高音聲部等。吉他雖然音域比女高音低，也採用高音譜號但實際音高比記譜低一個八度。</p>

<p><strong>低音譜號（F Clef）</strong>：低音譜號的符號源自字母 F 的裝飾性寫法，符號中兩個點之間的那條線標示了 F3 音（中央 C 下方）。在鋼琴譜中，左手通常使用低音譜號。低音譜號適合記錄音域較低的樂器，如大提琴、低音提琴、低音管、長號、男低音聲部等。低音譜號讓這些低音樂器的記譜更加方便，避免了大量的加線。</p>

<p><strong>中音譜號（C Clef）</strong>：中音譜號的符號源自字母 C，其中心位置標示了中央 C（C4）。中音譜號有兩種常見的變體：中音譜號（Alto Clef）將中央 C 放在第三線，主要用於中提琴；次中音譜號（Tenor Clef）將中央 C 放在第四線，用於大提琴、低音管等樂器的高音域段落。中音譜號的美妙之處在於它能讓中音樂器的記譜更加簡潔流暢。</p>

<h2>譜號的歷史演變</h2>
<p>中世紀時期，音樂記譜最初使用的是紐姆譜（Neumes），僅能表示旋律的起伏方向而無法標示精確音高。11世紀，阿雷佐的桂多（Guido d'Arezzo）發明了四線譜，並在線條上標示字母以表示音高，這成為譜號的雛形。早期的譜號稱為「字母譜號」（Letter Clefs），直接在線條上寫下 F、C 或 G 字母。隨著時間推移，這些字母逐漸演化為更為裝飾性的符號，到了文藝復興時期，譜號的形式已經相當接近現代的模樣。</p>

<p>在巴洛克時期，譜號的使用比現代更加多樣化。作曲家會根據聲部或樂器的音域靈活選擇不同線位的高音譜號或中音譜號。十八世紀後期至十九世紀，隨著管弦樂團的標準化，譜號的使用也逐漸統一，形成了今日我們熟悉的高音、中音、低音三種主要譜號體制。</p>

<h2>譜號的實際應用</h2>
<p>在現代音樂實踐中，譜號的選擇直接影響樂譜的可讀性。鋼琴音樂使用大譜表（Grand Staff），將高音譜號與低音譜號用花括號連結，涵蓋了人耳可辨識的絕大部分音域。某些樂器如大提琴和低音管在不同音域會變換譜號，以避免過多的上加線或下加線。此外，打擊樂器有時使用中立譜號（Neutral Clef），不表示特定音高，僅表示節奏。在現代樂譜中，有時也會遇到八度譜號，在譜號上方或下方加上數字 8，表示實際音高比記譜高或低一個八度。</p>
""",
        },
        {
            "id": "beat",
            "label": "節拍",
            "icon": "🥁",
            "content": """
<h2>節拍的定義與本質</h2>
<p>節拍（Beat）是音樂中最基本的時間單位，可以理解為音樂的心跳。西方音樂理論將節拍定義為音樂中規律出現的脈動，它構成了音樂時間感的骨架。節拍的存在使人們能夠感知音樂的進行速度與節奏結構，也是我們不自覺地跟著音樂點頭、跺腳或拍手時所對應的那個基本單位。</p>

<p>節拍與節奏是兩個相關但不同的概念：節拍是規律的、持續的背景脈動，而節奏則是實際聲音在節拍框架上的各種組合與變化。如果用走路來比喻，節拍就像是穩定行走時腳步落地的聲音，而節奏則是在這些步伐上產生的各種身體動作變化。</p>

<h2>節拍的類型</h2>
<p><strong>強拍與弱拍</strong>：節拍並非所有拍子都有相同的強度。在西方音樂中，拍子被分為強拍（Accented Beat）和弱拍（Unaccented Beat）。例如在 4/4 拍中，第一拍是最強的，第三拍次之，而第二拍和第四拍則較弱。這種強弱交替的模式為音樂提供了自然的韻律感。</p>

<p><strong>二拍子</strong>：以「強—弱」的模式循環，是最基本的節拍形式。進行曲多採用二拍子，因為它的強烈交替感適合整齊的步伐。典型的二拍子包括 2/2（二二拍）和 2/4（二四拍）。</p>

<p><strong>三拍子</strong>：以「強—弱—弱」的模式循環，給人一種旋轉、搖曳的感覺。華爾滋（Waltz）是最經典的三拍子音樂形式。3/4 拍和 3/8 拍是常見的三拍子拍號。</p>

<p><strong>四拍子</strong>：以「強—弱—次強—弱」的模式循環，是現代流行音樂中最常見的節拍形式。4/4 拍幾乎成了流行、搖滾、爵士等音樂風格的標準配置。</p>

<p><strong>六拍子</strong>：複合拍子中的常見形式，如 6/8 拍，其內部節奏組織為「強—弱—弱—次強—弱—弱」，形成兩組三個八分音符的結構。</p>

<h2>節拍速度（Tempo）</h2>
<p>節拍的快慢稱為速度（Tempo），通常以 BPM（Beats Per Minute，每分鐘拍數）來表示。BPM 數值越高，音樂進行越快。古典音樂中常使用義大利語的速度術語：Largo（極緩板，約 40-60 BPM）、Adagio（慢板，約 66-76 BPM）、Andante（行板，約 76-108 BPM）、Moderato（中板，約 108-120 BPM）、Allegro（快板，約 120-168 BPM）以及 Presto（急板，約 168-200 BPM）。節拍的選擇直接影響音樂的情緒表達：緩慢的節拍往往與莊嚴、悲傷或沉思的氣氛相關，而快速的節拍則常用於表現歡樂、興奮或緊張的情緒。</p>

<h2>節拍在多元音樂文化中的差異</h2>
<p>雖然西方音樂理論主導了現代節拍的概念，但不同文化對節拍的理解和應用存在顯著差異。非洲音樂中常見複雜的多重節奏（Polyrhythm），同時存在多個不同的節拍層次；印度傳統音樂中，塔拉（Tala）系統擁有極其複雜的節拍週期結構；巴爾幹半島的民間音樂則經常使用不對稱節拍，如 7/8、9/8、11/8 等，這些不規則的節拍組合創造出獨特的韻律美感。理解節拍的多樣性，是深入認識世界各國音樂文化的重要基礎。</p>
""",
        },
        {
            "id": "time-signature",
            "label": "拍號",
            "icon": "⏱️",
            "content": """
<h2>拍號的結構與意義</h2>
<p>拍號（Time Signature）是寫在樂譜開頭（譜號之後、調號之前）的標記，通常以兩個上下疊放的數字表示。拍號的功能是告訴演奏者每一小節有多少拍，以及以哪一種音符的時值作為一拍的基本單位。拍號的發明使得音樂的節奏組織有了清晰的視覺標記，是音樂記譜法中的核心元素之一。</p>

<p>拍號的上下兩個數字各有其含義：上方的數字代表每一小節中的拍數，下方的數字則代表以哪一種音符作為一拍的單位。例如 4/4 拍號表示每小節有四拍，以四分音符為一拍；3/4 拍號表示每小節有三拍，同樣以四分音符為一拍；而 6/8 拍號則表示每小節有六拍，以八分音符為一拍。</p>

<h2>單拍子與複拍子</h2>
<p><strong>單拍子（Simple Time）</strong>：在單拍子中，每一拍可以自然地分成兩個等份。最常見的單拍子包括 2/4、3/4 和 4/4。例如在 4/4 拍中，每一拍（四分音符）可以分成兩個八分音符。單拍子的節奏感覺直接明瞭，是初學者在學習節奏時最先接觸到的類型。民間音樂、流行音樂和古典音樂中大量使用單拍子。</p>

<p><strong>複拍子（Compound Time）</strong>：在複拍子中，每一拍本身是一個附點音符，可以自然地分成三個等份。典型的複拍子包括 6/8、9/8 和 12/8。以 6/8 為例，雖然記譜上每小節有六個八分音符，但實際的節奏組織是以兩個附點四分音符（每組三個八分音符）為基礎的。複拍子的節奏感覺更加流暢，適合表現搖曳、旋轉的音樂風格，如船歌、西西里舞曲等。</p>

<h2>常見拍號的應用</h2>
<p><strong>4/4 拍（普通拍）</strong>：是最常見的拍號，廣泛應用於古典、流行、搖滾、爵士、電影配樂等幾乎所有音樂類型。流行音樂中絕大多數歌曲都使用 4/4 拍。有時 4/4 拍會被標示為 C（Common Time 的縮寫），這也是 4/4 拍被稱為「普通拍」的原因。</p>

<p><strong>3/4 拍</strong>：每小節三拍，是華爾滋的標準拍號。其「強—弱—弱」的模式帶來優雅的旋轉感。除了華爾滋，許多古典樂曲的慢板樂章也採用 3/4 拍。在流行音樂中，3/4 拍相對少見但仍有不少經典作品。</p>

<p><strong>6/8 拍</strong>：每小節六拍，每組三拍形成兩個大拍。6/8 拍在民謠、搖滾抒情曲和古典音樂中都很常見，其特有的流動感適合表現搖擺、輕快的音樂情緒。義大利的塔朗泰拉舞曲（Tarantella）就是典型的 6/8 拍舞蹈音樂。</p>

<p><strong>2/2 拍（二二拍）</strong>：也稱為 Alla Breve，有時標示為 C 中間加一豎線。每小節兩拍，以二分音符為一拍。二二拍常用於進行曲或快速樂章，因為它的節奏感覺比 4/4 拍更加緊湊有力。</p>

<p><strong>5/4 拍與 7/8 拍</strong>：屬於不對稱拍號（Irregular Time Signature），每小節的拍數是奇數。5/4 拍最著名的例子是電影《不可能的任務》主題曲和戴夫·布魯貝克的《Take Five》。7/8 拍在巴爾幹半島民間音樂中十分常見，也出現在前衛搖滾和藝術音樂中。這些不規則拍號為音樂帶來獨特的動力和不穩定的緊張感。</p>

<h2>拍號的歷史與演變</h2>
<p>拍號的起源可以追溯到 13 世紀的聖母院樂派。當時的音樂理論家使用「完整記號」（Tempus Perfectum，圓形）和「不完整記號」（Tempus Imperfectum，半圓形）來區分三拍子（被視為完美的神聖數字）和兩拍子。這些符號後來演化為現代的 C 和 C 加斜線記號。14 世紀的法國作曲家 Philippe de Vitry 在其著作《新藝術》（Ars Nova）中系統化了節奏記譜法，奠定了現代拍號的理論基礎。到了文藝復興和巴洛克時期，拍號的使用越發規範，最終於古典時期形成了與現代拍號幾乎相同的體系。</p>
""",
        },
        {
            "id": "pitch",
            "label": "音調",
            "icon": "🔊",
            "content": """
<h2>音調的物理基礎</h2>
<p>音調（Pitch）是人耳對聲音頻率的主觀感知，是音樂中最基本的要素之一。從物理學的角度來看，聲音由物體的振動產生，振動的頻率決定音調的高低。頻率以赫茲（Hz）為單位，表示每秒振動的次數。振動越快的聲音聽起來越高，振動越慢的聲音聽起來越低。人類耳朵能夠感知的頻率範圍大約在 20 Hz 到 20,000 Hz 之間，而音樂中使用的頻率範圍通常集中在 27.5 Hz（鋼琴最低音 A0）到 4,186 Hz（鋼琴最高音 C8）之間。</p>

<p>音調的感知並非單純的物理線性關係，人耳對不同頻率區域的敏感度不同。根據等響曲線（Fletcher-Munson Curves），人耳對中高頻區域（約 2,000-5,000 Hz）最為敏感，這也解釋了為何在這個頻率範圍內的樂器聲響最容易被人聽見和辨識。</p>

<h2>音名與音高系統</h2>
<p>在西方音樂體系中，基本音級使用七個拉丁字母命名：C、D、E、F、G、A、B，對應中文的 Do、Re、Mi、Fa、Sol、La、Si。這七個基本音以全音和半音的間隔排列，構成自然音階。C 到 D 為全音，D 到 E 為全音，E 到 F 為半音，F 到 G 為全音，G 到 A 為全音，A 到 B 為全音，B 到 C 為半音。</p>

<p>升記號（♯）將音高提升半音，降記號（♭）將音高降低半音。同音異名的現象（如 C♯ 等於 D♭）源自平均律中將八度等分為十二個半音的調律系統。這種系統由德國音樂理論家 Andreas Werckmeister 在 17 世紀末推廣，並由巴赫的《平均律鍵盤曲集》確立其地位。</p>

<p>為了區分不同八度中的同名音位，科學音高記譜法（Scientific Pitch Notation）使用數字標記八度範圍。例如 C4 為中央 C，鋼琴上中央 C 的位置。A4 的頻率被標準化為 440 Hz（即標準音高），這是 1939 年國際標準化組織確定的通用標準。然而在歷史實踐中，A4 的頻率曾經有過很大變化，巴洛克時期有時使用 415 Hz，而古典時期某些地區則採用 430 Hz 或更高。</p>

<h2>音調與和聲的關係</h2>
<p>當兩個或多個不同的音調同時發聲時，產生和聲效果。最簡單的和聲關係是八度（頻率比 2:1），兩個相差八度的音聽起來幾乎像是同一個音的疊加。其他重要的和諧音程包括純五度（頻率比 3:2）、純四度（頻率比 4:3）和大三度（頻率比 5:4）。這些簡單整數比的音程被稱為自然泛音列（Harmonic Series），是構成西方和聲體系的物理基礎。泛音列的原理是：任何一個樂器發出的音都不只是單一頻率，而是由基音（Fundamental）和一系列整數倍頻率的泛音（Overtones）組合而成，這種組合決定了樂器的音色。</p>

<h2>不同文化的音調體系</h2>
<p>雖然西方平均律十二音體系成為現代主流，但世界上許多文化使用截然不同的音調系統。印度古典音樂的拉格（Raga）系統使用 22 個什魯蒂（Shruti）微音，每個八度被劃分為 22 個不等距的音級。印尼甘美朗（Gamelan）樂團使用斯連德羅（Slendro，五聲音階）和培羅格（Pelog，七聲音階）兩種獨特的音律系統，其音高與西方平均律明顯不同。阿拉伯音樂的馬卡姆（Maqam）系統包含四分音（Quarter Tone），將半音進一步細分。中國傳統音樂以五聲音階為基礎，但不同的地方戲曲和器樂傳統衍生出豐富的調式變化。理解這些不同的音調體系，能幫助我們更深刻地認識音樂文化的多樣性和人類聽覺感知的豐富可能性。</p>
""",
        },
        {
            "id": "range",
            "label": "音域",
            "icon": "📐",
            "content": """
<h2>音域的定義與分類</h2>
<p>音域（Range）指的是一個樂器或人聲能夠發出的最低音到最高音之間的距離範圍。音域的概念不僅是物理能力的描述，更是理解樂器性能、作曲技法、聲部配置和音樂表現力的重要基礎。音域通常以鋼琴鍵盤的範圍作為參考標準，並以音名和八度數字來標記，例如「C3 到 C6」表示從大字組 C 到小字三組 C 的三個八度的範圍。</p>

<p>在樂器學（Organology）和音樂創作中，音域可以分為以下幾個層次：理論音域（樂器在理想條件下能達到的全部音高範圍）、實用音域（樂器在實際演奏中能穩定且良好表現的音高範圍）以及舒適音域（演奏者或演唱者能夠輕鬆控制、音質最佳的音高範圍）。對於聲樂而言，舒適音域尤其重要，不當的換調可能導致聲帶損傷。</p>

<h2>人聲音域的分類</h2>
<p>在古典聲樂中，人聲依據音域和音色被細分為多個聲部：女高音（Soprano，約 C4-C6）音域最高，音色明亮，常擔任主旋律；女中音（Mezzo-soprano，約 A3-A5）音色較溫暖豐滿；女低音（Alto/Contralto，約 F3-F5）音域最低的女聲，音色深沉；男高音（Tenor，約 C3-C5）是最高音域的男聲，具有明亮穿透力；男中音（Baritone，約 G2-G4）介於男高音與男低音之間，音色厚實；男低音（Bass，約 E2-E4）音域最低的男聲，音色雄渾。歷史上還有特殊的聲部類型如閹人歌手（Castrato）和現代的假聲男高音（Countertenor），以特殊技巧達到超越常規人聲音域的高度。</p>

<p>人聲的音域並非固定不變，透過專業的發聲訓練可以擴大音域範圍，但過度強求音域擴展可能對聲帶造成傷害。每一位演唱者都有其獨特的自然音域和音色特質，優秀的聲樂教育強調在自身音域內開發最佳的聲響效果，而非盲目追求高低音的極限。</p>

<h2>樂器音域與樂團配置</h2>
<p>管弦樂團中不同樂器的音域差異極大，作曲家正是利用這種差異來創造豐富的音響層次。弦樂器家族中，小提琴（約 G3-E7）音域最高，中提琴（約 C3-A6）比小提琴低五度，大提琴（約 C2-C5）音域深沉溫暖，低音提琴（約 E1-G4）則提供樂團最低的音響基礎。木管樂器中，長笛（約 C4-C7）音域清澈明亮，雙簧管（約 B♭3-A6）音色帶有鼻音特質，單簧管（約 E3-G6）音域寬廣且音色變化豐富，低音管（約 B♭1-E5）則提供木管組的低音支撐。銅管樂器中，小號（約 E3-C6）音色明亮輝煌，法國號（約 B1-F5）音色圓潤溫暖，長號（約 E2-B♭5）具有雄壯的音質，低音號（約 B♭0-B♭4）則是銅管組中音域最低的樂器。</p>

<p>打擊樂器的音域分布更為廣泛，有固定音高的樂器如木琴（Xylophone）、馬林巴（Marimba）、鐵琴（Glockenspiel）和定音鼓（Timpani），也有無固定音高的樂器如小鼓、大鼓、鈸等。鍵盤樂器如鋼琴擁有最寬廣的音域（約 A0-C8，超過七個八度），涵蓋了管弦樂團中所有樂器的音域。</p>

<h2>音域與音樂創作的關係</h2>
<p>理解樂器的音域對作曲和編曲至關重要。每種樂器在不同音域的音色特質差異很大，例如小提琴的高音區明亮尖銳，低音區則溫暖厚實。優秀的作曲家會充分利用每種樂器不同音域的音色特點來創造豐富的音樂織體（Texture）。在管弦樂配器法中，音域的配置還涉及聲部平衡的問題，如何讓不同樂器在各個音域相互補充而不互相掩蓋，是指揮和配器學的核心課題之一。</p>

<p>在現代流行音樂製作中，音域的概念同樣重要。為歌手創作旋律時，需要考慮該歌手的音域範圍，避免旋律超出其舒適音域。混音時，不同樂器在頻譜上的音域配置決定了聲音的清晰度和層次感。透過均衡器（Equalizer）調整各樂器的頻率範圍，可以使整個編曲的頻譜分布更加均衡，創造出更加專業的聽覺體驗。</p>
""",
        },
        {
            "id": "sound-production",
            "label": "發聲原理",
            "icon": "⚙️",
            "content": """
<h2>樂器發聲原理的分類體系</h2>
<p>樂器發聲原理是樂器學（Organology）的核心研究課題。最廣泛使用的分類系統是薩克斯—霍恩博斯特爾分類法（Sachs-Hornbostel System），由德國音樂學家古特·薩克斯（Curt Sachs）和埃里希·霍恩博斯特爾（Erich Moritz von Hornbostel）於1914年提出。該系統根據樂器產生聲音的振動方式，將世界各地的樂器分為五大類：弦鳴樂器（Chordophones）、氣鳴樂器（Aerophones）、膜鳴樂器（Membranophones）、體鳴樂器（Idiophones）和電鳴樂器（Electrophones）。這個分類系統被廣泛應用於民族音樂學和博物館樂器收藏的分類工作中，也是聯合國教科文組織所推薦的標準分類法。</p>

<h2>弦鳴樂器（Chordophones）</h2>
<p>弦鳴樂器的發聲原理是：聲音來自一根或多根繃緊的弦的振動。弦的振動透過琴橋傳遞到共鳴箱（Resonator），共鳴箱將弦的微小振動放大並賦予其特定的音色特質。根據演奏方式的不同，弦鳴樂器可分為弓弦樂器（如小提琴、大提琴）、撥弦樂器（如吉他、豎琴、琵琶）和擊弦樂器（如鋼琴）。</p>

<p>弦的振動頻率由三個因素決定：弦的長度（越短音越高）、弦的張力（越緊音越高）和單位長度的質量（越細越輕音越高）。這就是為什麼小提琴的四條弦由細到粗、張力由鬆到緊，分別對應由高到低的四個音。演奏者透過按壓弦來改變有效振動長度，從而改變音高。共鳴箱的材質、形狀和構造對音色有決定性的影響，例如小提琴使用雲杉面板和楓木背板的經典組合已被證明能產生最佳的音響效果。在世界各民族的樂器中，弦鳴樂器是種類最豐富、分布最廣泛的樂器類別之一，從非洲的科拉琴（Kora）到日本的箏（Koto），形式多種多樣。</p>

<h2>氣鳴樂器（Aerophones）</h2>
<p>氣鳴樂器的發聲原理是：聲音來自空氣柱的振動。演奏者透過吹氣使樂器內部的空氣柱產生振動，空氣柱的長度、形狀和開口方式決定了音高。氣鳴樂器又細分為多個子類別：邊棱音樂器（如長笛、排笛）透過吹氣經過鋒利邊緣產生空氣擾動發聲；簧片樂器（如單簧管、薩克斯風、雙簧管）利用簧片的振動作為聲音激發源；唇振樂器（如小號、長號、法國號）透過嘴唇在吹嘴上的振動發聲；自由簧樂器（如口琴、手風琴）則利用金屬簧片在氣流中的振動發聲。</p>

<p>空氣柱的振動遵循聲學原理：管樂器的長度與音高成反比，管越長音越低。在閉管（一端封閉）的情況下，空氣柱的振動頻率是開管（兩端開放）的一半，因此同樣長度的閉管比開管低一個八度。這一物理原理被廣泛應用於樂器設計中，例如低音管的巨大長度使其能夠發出深沉的低音。此外，管樂器的管徑、管壁材質、喇叭口形狀等都會影響音色：黃銅材質的銅管樂器音色明亮輝煌，而木製的單簧管和雙簧管音色則較為溫暖柔和。</p>

<h2>膜鳴樂器（Membranophones）</h2>
<p>膜鳴樂器的發聲原理是：聲音來自一張或多張繃緊的薄膜（通常為動物皮或合成材料）的振動。鼓類樂器是膜鳴樂器的主要代表。演奏者透過敲擊、摩擦或以聲波激發膜面，使其產生振動並透過共鳴腔放大聲音。膜的張力決定了其振動頻率：張力越大聲音越高。定音鼓（Timpani）是唯一能精確調音的膜鳴樂器，透過踏板機構調整膜面張力以改變音高。</p>

<p>膜鳴樂器在人類歷史上有極其悠久的歷史，幾乎所有文化都有其獨特的鼓類樂器。從非洲的非洲鼓（Djembe）和說話鼓（Talking Drum），到中東的達布卡鼓（Darbuka）、亞洲的太鼓（Taiko）、拉丁美洲的康加鼓（Conga）和邦哥鼓（Bongos）、以及管弦樂團中使用的定音鼓、小鼓和大鼓，膜鳴樂器的種類令人眼花撩亂。不同類型的鼓不僅音色各異，在各自的文化傳統中也承載著重要的儀式、溝通和社會功能。</p>

<h2>體鳴樂器（Idiophones）</h2>
<p>體鳴樂器的發聲原理是：樂器本身的材質（金屬、木頭、石頭、玻璃等）直接產生振動發聲，不需借助弦、膜或氣流作為中介。體鳴樂器可能是最古老的人造樂器類別，最早的體鳴樂器可以追溯到舊石器時代。體鳴樂器的演奏方式多種多樣：直接敲擊（如木琴、鑼、鈸、三角鐵）、互相撞擊（如響板、木魚）、搖動（如沙鈴、雨聲棒）、刮奏（如刮瓜 Guiro）或撥奏（如口簧琴 Jew's Harp、拇指琴 Kalimba）。</p>

<p>體鳴樂器的音高取決於樂器材質的密度、形狀、大小和厚度。以木琴（Xylophone）為例，不同長度的木塊對應不同的音高：木塊越長音越低，越短音越高。鑼和鈸的金屬材質和厚度決定了其共鳴頻率。體鳴樂器在世界民族音樂中的應用極為豐富，印尼甘美朗（Gamelan）樂團大量使用鑼、鐵琴等體鳴樂器；非洲的姆比拉（Mbira，拇指琴）是極具代表性的撥奏體鳴樂器；西方管弦樂團中，木琴、鐵琴（Glockenspiel）、管鐘（Chimes）等體鳴樂器為樂隊增添了豐富的色彩效果。</p>

<h2>電鳴樂器（Electrophones）</h2>
<p>電鳴樂器是薩克斯—霍恩博斯特爾分類法在20世紀新增的第五大類別，專門用於分類那些依賴電子電路來產生或放大聲音的樂器。電鳴樂器的發聲原理可以分為兩大類型：電聲樂器（Electroacoustic）和電子樂器（Electronic）。</p>

<p>電聲樂器如電吉他、電貝斯和電小提琴，其本體仍有傳統的弦振動，但透過電磁拾音器（Pickup）將弦的振動轉換為電信號，再經過擴大機和音箱將聲音放大。拾音器的位置和類型會影響最終的電聲效果：靠近琴橋的拾音器聲音較亮，靠近琴頸的聲音較溫暖。電吉他可以透過各種效果器（Effects Pedals）改變聲音，如破音（Distortion）、延遲（Delay）、殘響（Reverb）等，創造出極為豐富的聲響變化。</p>

<p>純電子樂器包括合成器（Synthesizer）、電子琴（Electronic Keyboard）、特雷門（Theremin）和馬特諾音波（Ondes Martenot）等。合成器使用電子振盪器（Oscillator）產生原始聲波（正弦波、方波、鋸齒波等），再透過濾波器、放大器、調製器等模組改變聲音特性。現代的數位合成技術（如FM合成、波表合成、物理建模合成）可以模擬幾乎任何樂器的聲音，甚至創造出自然界中不存在的全新聲響。電子樂器的發展徹底改變了20世紀以來的音樂創作和製作方式，從電子音樂到流行音樂，電鳴樂器無所不在。</p>
""",
        },
    ]


def build_theory_page():
    """Build the music theory basics page at /theory/ with tabbed content."""
    page_dir_ = OUTPUT_DIR / "theory"
    page_dir_.mkdir(parents=True, exist_ok=True)

    theory_tabs = get_theory_data()

    tab_buttons = "".join(
        f'<button class="tab-btn{" is-active" if i == 0 else ""}" data-tab="{t["id"]}">{t["icon"]} {t["label"]}</button>'
        for i, t in enumerate(theory_tabs)
    )
    tab_panes = "".join(
        f'<div id="tab-{t["id"]}" class="tab-pane{" is-active" if i == 0 else ""}"><article class="markdown-body">{t["content"].strip()}</article></div>'
        for i, t in enumerate(theory_tabs)
    )

    extra_css = """
<style>
.theory-hero { padding:48px 0 28px; }
.theory-page { max-width:860px; }
.theory-tabs { margin-top:8px; }
.theory-tabs .tab-bar { margin-bottom:24px; }
.theory-tabs .tab-btn { font-size:13px; padding:8px 14px; }
.theory-tabs .markdown-body p { margin:0 0 1.2em; }
.theory-tabs .markdown-body h2 { font-size:22px; margin-top:1.6em; }
.theory-nav { display:flex; flex-wrap:wrap; gap:10px; margin:28px 0 8px; }
.theory-nav a { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border:1px solid var(--line); border-radius:8px; background:var(--surface); text-decoration:none; font-size:13px; font-weight:600; color:var(--ink2); transition:all .15s; }
.theory-nav a:hover { border-color:var(--accent); color:var(--accent); background:rgba(13,118,107,.04); }
@media (max-width:700px) {
  .theory-tabs .tab-bar { flex-wrap:wrap; }
  .theory-tabs .tab-btn { flex:1; min-width:80px; text-align:center; }
}
</style>
"""
    body = f"""<main class="page theory-page">
  <section class="theory-hero">
    <p class="eyebrow">Music Theory</p>
    <h1>樂理基礎</h1>
    <p class="lead">認識音樂的構成要素，從譜號、節拍到發聲原理，系統性了解音樂理論的基礎知識。</p>
  </section>
  <div class="theory-nav">
    {"".join(f'<a href="#tab-{t["id"]}">{t["icon"]} {t["label"]}</a>' for t in theory_tabs)}
  </div>
  <div class="theory-tabs">
    <div class="tab-bar">{tab_buttons}</div>
    {tab_panes}
  </div>
</main>
"""
    extra_head = extra_css
    write(page_dir_ / "index.html", page("樂理基礎", body, page_dir_ / "index.html", extra_head=extra_head))


def build_robots(instruments):
    """Generate robots.txt allowing all crawlers and referencing sitemap."""
    robots_txt = "User-agent: *\nAllow: /\nSitemap: " + site_url("/sitemap.xml") + "\n"
    write(OUTPUT_DIR / "robots.txt", robots_txt)
def main():
    global _TOTAL_INSTRUMENTS
    instruments = read_instruments()
    _TOTAL_INSTRUMENTS = len(instruments)
    if OUTPUT_DIR.exists():
        def on_rm_error(func, path, exc_info):
            pass
        shutil.rmtree(OUTPUT_DIR, onerror=on_rm_error)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_assets(instruments)
    build_index(instruments)
    build_map_page(instruments)
    build_about_page()
    build_theory_page()
    build_manager_page(instruments)
    build_detail_pages(instruments)
    build_special_pages(instruments)
    build_instruments_list_page(instruments)
    build_facet_pages(instruments, "category", "categories", "分類")
    build_facet_pages(instruments, "sound_class", "sound-classes", "發聲分類")
    build_facet_pages(instruments, "country", "countries", "國家/地區")
    build_facet_pages(instruments, "era", "eras", "年代")
    build_404(instruments)
    build_sitemap(instruments)
    build_robots(instruments)
    write(OUTPUT_DIR / ".nojekyll", "")
    print(f"Built {len(instruments)} instruments into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
