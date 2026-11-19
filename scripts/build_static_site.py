#!/usr/bin/env python
from __future__ import annotations

import datetime
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
SITE_DOMAIN = "https://soundweavers-music.github.io"
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


_IMAGE_CREDITS: dict | None = None


def image_credit_html(slug):
    """Author + licence line under an instrument photo.

    Data comes from content/image_credits.json (scripts/fetch_image_credits.py
    reads it off each Commons file page). Instruments without an entry fall back
    to the old generic line."""
    global _IMAGE_CREDITS
    if _IMAGE_CREDITS is None:
        try:
            _IMAGE_CREDITS = json.loads((BASE_DIR / "content" / "image_credits.json").read_text(encoding="utf-8"))
        except Exception:
            _IMAGE_CREDITS = {}
    info = _IMAGE_CREDITS.get(slug) or {}
    author = (info.get("author") or "").strip()
    licence = (info.get("license") or "").strip()
    page = (info.get("page") or "").strip()
    if not author and not licence:
        return '<p class="image-credit">圖片來源：Wikimedia Commons</p>'
    label = "／".join(x for x in (escape(author), escape(licence)) if x)
    if page:
        return (f'<p class="image-credit"><a href="{escape(page)}" target="_blank" rel="noopener"'
                f' title="Wikimedia Commons 上的檔案頁">圖片：{label}</a></p>')
    return f'<p class="image-credit">圖片：{label}（Wikimedia Commons）</p>'


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
    # Convert fullwidth parentheses to underscores to differentiate from separators
    value = value.replace("（", "_").replace("）", "")
    slug = re.sub(r"[^a-zA-Z0-9一-鿿_]+", "-", value).strip("-_").lower()
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

        # Parse listening_sound_tags into body_listening + soundscape components
        listening_raw = meta.get("listening_sound_tags", "")
        if "｜" in listening_raw:
            body_listening_val, soundscape_val = listening_raw.split("｜", 1)
        else:
            body_listening_val = listening_raw
            soundscape_val = ""

        instruments.append(
            {
                "slug": path.stem,
                # New v1.2 field names
                "class_code": meta.get("class_code", ""),
                "frontend_class": meta.get("frontend_class", ""),
                "subcategory": meta.get("subcategory", ""),
                "title_zh": meta.get("title_zh", path.stem),
                "title_original": meta.get("title_original", ""),
                "family_std": meta.get("family_std", ""),
                "sound_hs": meta.get("sound_hs", ""),
                "playing_method": meta.get("playing_method", ""),
                "interface_tags": meta.get("interface_tags", ""),
                "region_culture": meta.get("region_culture", ""),
                "listening_sound_tags": listening_raw,
                "ensemble_links": meta.get("ensemble_links", ""),
                "verification_status": meta.get("verification_status", ""),
                "issue_note": meta.get("issue_note", ""),
                "source_url": meta.get("source_url", ""),
                # Backward-compat aliases for un-updated functions
                "title": meta.get("title_zh", meta.get("title", path.stem)),
                "original_name": meta.get("title_original", meta.get("original_name", "")),
                "category": meta.get("frontend_class", meta.get("class_code", "")),
                "country": meta.get("region_culture", meta.get("country", "")),
                "era": "",
                "sound_class": meta.get("sound_hs", ""),
                "hs_class": "",
                "family": meta.get("family_std", ""),
                "body_listening": body_listening_val,
                "soundscape": soundscape_val,
                "region_type": "",
                "image": meta.get("image", ""),
                "youtube_ids": parse_youtube_ids(meta.get("youtube_ids", "")),
                "instrument_key": "",
                "range": "",
                "is_popular": False,
                "is_uncommon": False,
                "site_url": meta.get("source_url", ""),
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


# ─── Navigation subcategory menu (generated from real data) ──────────
# The nav used to hard-code seven subcategory names that no instrument uses
# (擊弦樂器, 木琴石琴竹琴, 電子振盪 …), so every one of those links 404'd.
# These are built from the instruments actually in the build.
NAV_CLASSES = [("A1", "吹奏與氣息樂器"), ("A2", "弦樂器"),
               ("A3", "鼓與打擊樂器"), ("A4", "電子與電聲樂器")]
_NAV_SUBCATS: dict[str, list[tuple[str, int]]] = {}


def set_nav_subcategories(instruments):
    """Record each class's real subcategories, most populous first."""
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for item in instruments:
        code, sub = item.get("class_code", ""), item.get("subcategory", "")
        if code and sub and sub != "待確認":
            counts[code][sub] += 1
    _NAV_SUBCATS.clear()
    _NAV_SUBCATS.update(
        {code: sorted(v.items(), key=lambda kv: (-kv[1], kv[0]))
         for code, v in counts.items()}
    )


SOUND_JOURNEY_SOON = ("氣息離開身體", "懷裡與大地的弦", "天空裡拉長的弦",
                      "地心與手邊的微光", "城市與星塵的節奏", "按鍵打開房間，眾聲走向廣場")


def sound_journey_soon():
    """The numbered 聲音旅圖 articles are not built any more — the section now
    serves the Word originals as PDF. List them as 建置中 instead of dead links."""
    rows = []
    for i, title in enumerate(SOUND_JOURNEY_SOON, 1):
        rows.append(
            f'<span class="nav-soon">旅圖{"一二三四五六"[i - 1]}｜{escape(title)}'
            f'<span class="nav-soon-tag">建置中</span></span>'
        )
    return "\n          ".join(rows)


def nav_class_links(page_path):
    """A1–A4 as a flat vertical list, one line each.

    Each class used to be followed by its subcategories as a ├/└ tree, which
    made the panel tall and hard to scan. The subcategories live on the class
    page now — you see them after you click in."""
    rows = []
    for code, name in NAV_CLASSES:
        rows.append(
            f'<a href="{resolve_url(page_path, f"/categories/{name}/")}">'
            f'<strong>{code}</strong>　{escape(name)}</a>'
        )
    return "\n            ".join(rows)


def canonical_for(page_path):
    """Absolute public URL of an output page (…/vocal/1/index.html → /vocal/1/).

    Built from the path inside OUTPUT_DIR — resolve_url() returns relative
    links, which used to collapse every canonical to "github.io./".
    """
    if page_path is None:
        return f"{SITE_DOMAIN}{SITE_BASE_PATH}/"
    try:
        rel = Path(page_path).relative_to(OUTPUT_DIR).as_posix()
    except ValueError:
        return f"{SITE_DOMAIN}{SITE_BASE_PATH}/"
    if rel.endswith("index.html"):
        rel = rel[: -len("index.html")]
    path = "/" + rel if rel else "/"
    return f"{SITE_DOMAIN}{SITE_BASE_PATH}{path}"


_COURSE_CHAPTERS: dict[str, int] = {}


def course_chapters(slug):
    """How many numbered chapters a course in content/<slug>/ has.

    Read from disk so the counts in the nav and the 學習 hub cannot drift when
    chapters are added (the guitar course was advertised as 16 chapters while
    it had 25)."""
    if slug not in _COURSE_CHAPTERS:
        folder = BASE_DIR / "content" / slug
        _COURSE_CHAPTERS[slug] = (
            sum(1 for p in folder.glob("*.md") if re.fullmatch(r"\d+\.md", p.name))
            if folder.exists()
            else 0
        )
    return _COURSE_CHAPTERS[slug]


def content_count(folder, pattern="*.md", exclude=()):
    """How many files a content folder holds — so 關於 can quote real numbers."""
    path = BASE_DIR / "content" / folder
    if not path.exists():
        return 0
    return sum(1 for p in path.glob(pattern) if p.name not in exclude)


def verification_breakdown():
    """Count instruments by verification_status, for the 關於 page."""
    counts = {"已查證": 0, "partial": 0, "pending": 0}
    for path in CONTENT_DIR.glob("*.md"):
        head = path.read_text(encoding="utf-8")[:1200]
        m = re.search(r"^verification_status:\s*(.*)$", head, re.M)
        status = (m.group(1).strip() if m else "")
        if status.startswith("已查證") and "待" not in status:
            counts["已查證"] += 1
        elif status.startswith("已查證"):
            counts["partial"] += 1
        else:
            counts["pending"] += 1
    return counts


def site_header(page_path):
    """The one site header + nav. page() here and in build_vocal_extra, plus
    the hand-maintained tool pages, all use this so the nav cannot drift."""
    if not _NAV_SUBCATS:
        set_nav_subcategories(read_instruments())
    return f"""  <header class="site-header">
    <a class="brand" href="{resolve_url(page_path, '/')}"><img class="brand-mark" src="{resolve_url(page_path, '/assets/brand/logo.png')}" alt="" width="34" height="34"><span class="brand-text">世界聲音</span></a>
    <nav>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/instruments/')}" class="dropdown-trigger">樂器百科</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/categories/')}" style="font-weight:700;">分類</a>
          <a href="#" id="random-nav-link" class="random-link">隨選樂器</a>
          <a href="{resolve_url(page_path, '/countries/')}">國家／地區</a>
          <a href="{resolve_url(page_path, '/map/')}">地圖</a>
          <hr style="margin:6px 0;border:none;border-top:1px solid var(--line);">
          {nav_class_links(page_path)}
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/ensembles/')}" class="dropdown-trigger">合奏百科</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/ensembles/')}" style="font-weight:700;">總覽</a>
          <hr style="margin:4px 0;border:none;border-top:1px solid var(--line);">
          <a href="{resolve_url(page_path, '/ensembles/B1/')}">B1 地域傳統合奏</a>
          <a href="{resolve_url(page_path, '/ensembles/B2/')}">B2 民間樂隊</a>
          <a href="{resolve_url(page_path, '/ensembles/B3/')}">B3 鼓樂與節慶編制</a>
          <a href="{resolve_url(page_path, '/ensembles/B4/')}">B4 古典與大型編制</a>
          <a href="{resolve_url(page_path, '/ensembles/B5/')}">B5 現代民族樂團</a>
          <a href="{resolve_url(page_path, '/ensembles/B6/')}">B6 爵士與流行編制</a>
          <a href="{resolve_url(page_path, '/ensembles/B7/')}">B7 現代混合與跨界編制</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/learn/')}" class="dropdown-trigger">學習</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/learn/')}" style="font-weight:700;">學習總覽</a>
          <hr style="margin:4px 0;border:none;border-top:1px solid var(--line);">
          <a href="{resolve_url(page_path, '/vocal/')}"><strong>人聲與歌唱</strong>　初階 15 堂・進階 35 堂</a>
          <a href="{resolve_url(page_path, '/digitalmusic/')}"><strong>錄音後製</strong>　基礎 15 堂・進階 15 堂</a>
          <a href="{resolve_url(page_path, '/theory/')}"><strong>樂理基礎</strong>　五階段二十章</a>
          <a href="{resolve_url(page_path, '/mandolin/')}"><strong>曼陀林專區</strong>　{course_chapters('mandolin')} 章知識庫</a>
          <a href="{resolve_url(page_path, '/guitar/')}"><strong>流行吉他彈唱指南</strong>　{course_chapters('guitar')} 章</a>
          <a href="{resolve_url(page_path, '/ukulele/')}"><strong>烏克麗麗流行彈唱與演奏</strong>　{course_chapters('ukulele')} 章</a>
          <a href="{resolve_url(page_path, '/tools/daw/learn/')}"><strong>線上編曲製作（DAW）</strong>　{len(list((BASE_DIR / 'content' / 'dawcourse').glob('*.md')))} 堂操作課</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/tools/')}" class="dropdown-trigger">工具</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/tools/daw/')}">🎚️ 織音線上編曲製作</a>
          <a href="{resolve_url(page_path, '/tools/fretboard/')}">🎸 世界樂器指版和弦圖</a>
          <a href="{resolve_url(page_path, '/tools/tuner/')}">🎯 線上調音器與節拍器</a>
          <a href="{resolve_url(page_path, '/chord-detection/')}">🎼 自動抓和弦</a>
          <a href="{resolve_url(page_path, '/tools/lrc/')}">📝 LRC 動態歌詞工作室</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/sound-journey/')}" class="dropdown-trigger">聲音旅圖</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/sound-journey/')}">旅圖門口</a>
          {sound_journey_soon()}
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/about/')}" class="dropdown-trigger">關於</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/about/')}">關於世界聲音</a>
          <a href="{resolve_url(page_path, '/about/author/')}">作者</a>
          <a href="{resolve_url(page_path, '/about/works/')}">歷年作品</a>
          <a href="{resolve_url(page_path, '/recruit/')}">招募夥伴</a>
          <a href="{resolve_url(page_path, '/contact/')}">聯絡我們</a>
        </div>
      </div>
    </nav>
    <button id="theme-toggle" class="theme-toggle" aria-label="切換色調">🎋</button>
  </header>
  <div class="site-banner" role="img" aria-label="世界聲音 — 木質工作室裡的吉他、曼陀林、鋼琴與麥克風"></div>"""


def site_footer(page_path):
    """Footer plus the floating music player.

    The long link list that used to sit here duplicated the header nav; it is
    replaced by 隔壁織音人's own music, one song picked at random per page and
    played from a small player pinned to the bottom-right corner."""
    player_js = resolve_url(page_path, "/assets/music-player.js")
    return f"""  <footer class="site-footer">
    <div class="footer-inner">
      <span>世界聲音 — 世界樂器、音樂教學、線上編曲軟體</span>
      <span>作者：<a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">隔壁織音人</a></span>
    </div>
  </footer>
  <div class="mini-player" data-music hidden>
    <div class="mini-player-frame" data-music-frame hidden></div>
    <div class="mini-player-bar">
      <button type="button" class="mini-player-btn" data-music-play
              aria-label="播放隔壁織音人的音樂">▶</button>
      <span class="mini-player-text">
        <span class="mini-player-name" data-music-title>隔壁織音人</span>
        <span class="mini-player-sub" data-music-album>按 ▶ 隨機聽一首</span>
      </span>
      <button type="button" class="mini-player-btn" data-music-next
              aria-label="換一首" title="換一首">↻</button>
      <button type="button" class="mini-player-close" data-music-close
              aria-label="收起播放器" title="收起">×</button>
    </div>
    <button type="button" class="mini-player-launcher" data-music-open hidden
            aria-label="開啟隔壁織音人音樂播放器" title="播放隔壁織音人的音樂">♪</button>
  </div>
  <script src="{player_js}" defer></script>"""


MUSIC_PLAYER_JS = """/* Floating player: one of 隔壁織音人's songs at random.
 *
 * The track list is written into this file at build time from
 * content/music_tracks.json, so the page makes no network request until the
 * listener presses ▶ — and the iframe only appears after that click.
 * Backing-track ("伴奏版") entries are filtered out of the list at build time.
 */
(function () {
  'use strict';
  var TRACKS = __TRACKS__;
  var root = document.querySelector('[data-music]');
  if (!root || !TRACKS.length) { return; }

  var nameEl = root.querySelector('[data-music-title]');
  var albumEl = root.querySelector('[data-music-album]');
  var playBtn = root.querySelector('[data-music-play]');
  var nextBtn = root.querySelector('[data-music-next]');
  var closeBtn = root.querySelector('[data-music-close]');
  var openBtn = root.querySelector('[data-music-open]');
  var bar = root.querySelector('.mini-player-bar');
  var frame = document.querySelector('[data-music-frame]');
  var current = null;
  var started = false;

  root.hidden = false;

  function pick() {
    var next;
    do { next = TRACKS[Math.floor(Math.random() * TRACKS.length)]; }
    while (TRACKS.length > 1 && current && next.id === current.id);
    return next;
  }

  function embed(autoplay) {
    frame.hidden = false;
    frame.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.className = 'mini-player-iframe';
    iframe.title = current.title;
    iframe.allow = 'autoplay; encrypted-media';
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + current.id +
                 '?rel=0&modestbranding=1' + (autoplay ? '&autoplay=1' : '');
    frame.appendChild(iframe);
  }

  function show(track) {
    current = track;
    nameEl.textContent = track.title;
    albumEl.textContent = track.album || '隔壁織音人';
    if (started) { embed(true); }
  }

  playBtn.addEventListener('click', function () {
    started = true;
    embed(true);
  });
  nextBtn.addEventListener('click', function () { show(pick()); });
  closeBtn.addEventListener('click', function () {
    // 收起來只是縮成角落的 ♪ 按鈕，隨時可以再打開
    bar.hidden = true;
    frame.hidden = true;
    frame.innerHTML = '';
    started = false;
    root.hidden = false;
    openBtn.hidden = false;
  });
  openBtn.addEventListener('click', function () {
    openBtn.hidden = true;
    bar.hidden = false;
  });

  show(pick());
})();
"""


def build_music_player():
    """Write assets/music-player.js with the track list baked in.

    Backing tracks ("伴奏版" and friends) are left out — the player is meant to
    play the songs, not their karaoke versions."""
    try:
        tracks = json.loads((BASE_DIR / "content" / "music_tracks.json").read_text(encoding="utf-8"))
    except Exception:
        tracks = []
    skip = re.compile(r"伴奏|卡拉|Karaoke|Instrumental|Off Vocal|カラオケ", re.I)
    tracks = [t for t in tracks if not skip.search(t.get("title", ""))]
    payload = json.dumps([{"id": t["id"], "title": t["title"], "album": t.get("album", "")}
                          for t in tracks], ensure_ascii=False)
    write(OUTPUT_DIR / "assets" / "music-player.js", MUSIC_PLAYER_JS.replace("__TRACKS__", payload))
    print(f"  music player: {len(tracks)} tracks")


SITE_NAME = "世界聲音"
SITE_DESC = ("世界聲音 by 隔壁織音人：世界樂器百科、人聲與歌唱教學、錄音後製與樂理課程，"
             "以及在瀏覽器直接使用的音樂工具——指版和弦圖、自動抓和弦、LRC 歌詞工作室與線上編曲軟體。")


def website_jsonld(desc):
    return f'''{{
  "@type": "WebSite",
  "@id": "{SITE_DOMAIN}/#website",
  "name": "{SITE_NAME}",
  "alternateName": ["世界聲音", "World Sound Encyclopedia"],
  "url": "{SITE_DOMAIN}/",
  "description": "{escape(desc)}",
  "inLanguage": "zh-Hant",
  "publisher": {{
    "@type": "Organization",
    "name": "隔壁織音人",
    "url": "{SITE_DOMAIN}/about/author/",
    "sameAs": ["https://www.youtube.com/@NextDoorSoundWeavers/"]
  }},
  "potentialAction": {{
    "@type": "SearchAction",
    "target": {{"@type": "EntryPoint", "urlTemplate": "{SITE_DOMAIN}/?q={{search_term_string}}"}},
    "query-input": "required name=search_term_string"
  }}
}}'''


def breadcrumb_jsonld(trail):
    """trail: [(name, absolute_url), …] starting with 首頁."""
    parts = []
    for i, (name, url) in enumerate(trail, 1):
        parts.append('{"@type":"ListItem","position":%d,"name":"%s","item":"%s"}'
                     % (i, escape(name), url))
    return '{"@type":"BreadcrumbList","itemListElement":[' + ",".join(parts) + "]}"


def page_jsonld(type_, name, desc, url, extra=""):
    body = ('"@type":"%s","name":"%s","description":"%s","url":"%s","inLanguage":"zh-Hant"'
            % (type_, escape(name), escape(desc), url))
    if extra:
        body += "," + extra
    return "{" + body + "}"


def page(title, body, page_path=None, meta_extra="", extra_head="", meta_description="",
         meta_keywords="", csp=None, jsonld_extra="", og_type="website"):
    if csp is None:
        csp = (
            "default-src 'self'; "
            "img-src 'self' https: data:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'; "
            "worker-src 'self' blob:; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com; "
            "base-uri 'self'; form-action 'self'; object-src 'none'"
        )
    keywords_default = ("隔壁織音人,世界聲音,世界樂器,樂器百科,音樂教學,線上編曲,編曲軟體,"
                        "自動抓和弦,和弦圖,歌唱教學,錄音後製,吉他教學,基礎樂理,民族樂器,傳統樂器,打擊樂器,管樂器,弦樂器")
    kw = meta_keywords or keywords_default
    desc = re.sub(r"\s+", " ", meta_description or SITE_DESC).strip()
    canonical_url = canonical_for(page_path)
    og_image = f"{SITE_DOMAIN}{SITE_BASE_PATH}/assets/brand/banner.webp"
    full_title = escape(title) if ("|" in title or "｜" in title) else escape(title) + "｜世界聲音"
    graph = [website_jsonld(desc)]
    if jsonld_extra:
        graph.append(jsonld_extra)
    jsonld = '{"@context":"https://schema.org","@graph":[' + ",".join(graph) + "]}"
    robots_tag = "" if 'name="robots"' in meta_extra else '<meta name="robots" content="index,follow,max-image-preview:large">'
    seo_tags = f'''<meta name="description" content="{escape(desc)}">
<meta name="keywords" content="{escape(kw)}">
<meta name="author" content="隔壁織音人">
{robots_tag}
<link rel="canonical" href="{canonical_url}">
<script type="application/ld+json">{jsonld}</script>'''
    seo_tags += f'''
<meta property="og:site_name" content="世界聲音">
<meta property="og:locale" content="zh_TW">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{full_title}">
<meta name="twitter:description" content="{escape(desc)}">
<meta name="twitter:image" content="{og_image}">'''
    if "og:title" not in meta_extra:
        seo_tags += f'''
<meta property="og:title" content="{full_title}">
<meta property="og:description" content="{escape(desc)}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:alt" content="世界聲音 — 世界樂器、音樂教學、線上編曲軟體">
<meta property="og:type" content="{og_type}">
<meta property="og:url" content="{canonical_url}">'''
    _dm_head = '<script>!function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t);else document.documentElement.setAttribute("data-theme","nextdoor")}catch(e){}}()</script>'
    _dm_foot = '<script>(function(){var t=document.getElementById("theme-toggle"),d=document.documentElement;var I={nextdoor:"🎋",light:"🌤",dark:"🌙"};function s(m){d.setAttribute("data-theme",m);if(t)t.textContent=I[m]||"🎋";try{localStorage.setItem("theme",m)}catch(e){}}var v=(localStorage.getItem("theme")||"nextdoor");s(v);if(t)t.addEventListener("click",function(){var c=d.getAttribute("data-theme");s(c==="nextdoor"?"light":c==="light"?"dark":"nextdoor")});})();</script>'

    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <meta http-equiv="Content-Security-Policy" content="{csp}">
  <meta name="google-site-verification" content="AzedQ-PxUmSW7_0jyEHmHCKgN2nIK0Bio5d6LCsJTtE">
  <title>{full_title}</title>
  {seo_tags}
  {meta_extra}
  {_dm_head}
  <link rel="icon" href="{resolve_url(page_path, '/assets/brand/favicon.png')}" type="image/png">
  <link rel="apple-touch-icon" href="{resolve_url(page_path, '/assets/brand/logo.png')}">
  <link rel="stylesheet" href="{resolve_url(page_path, '/assets/site.css')}">
  <link rel="stylesheet" href="{resolve_url(page_path, '/assets/site-refresh.css')}">
  {extra_head}
</head>
<body>
  {site_header(page_path)}
  {body}
  {site_footer(page_path)}
  <button id="back-top" class="back-top" aria-label="回頂部">↑</button>
  <script src="{resolve_url(page_path, '/assets/search.js')}"></script>
    <script src="{resolve_url(page_path, '/assets/random-instrument.js')}"></script>
  {_dm_foot}
</body>
</html>
"""


def image_src(value, page_path=None):
    """Image URL for a page: remote https, or a file shipped with the site.

    Instruments whose photo cannot come from Commons use `/assets/instruments/*`
    (downloaded, resized and credited locally); those resolve relative to the
    page like every other asset.
    """
    value = (value or "").strip()
    if value.startswith("/"):
        return resolve_url(page_path, value)
    return safe_external_url(value)


def card(instrument, page_path=None):
    code_tag = f'<span class="card-code">{escape(instrument["class_code"])}</span>' if instrument.get("class_code") else ""
    img = image_src(instrument.get("image", ""), page_path)
    img_html = f'<img class="card-thumb" src="{img}" alt="" loading="lazy" onerror="this.style.display=\'none\'">' if img else '<div class="card-thumb card-thumb--empty" aria-hidden="true">♩</div>'
    return f"""<a class="instrument-card" href="{resolve_url(page_path, '/instruments/' + instrument['slug'] + '/')}">
      {img_html}
      <div class="card-body">
        <span class="card-cat">{code_tag}{escape(instrument['category'])}</span>
        <strong class="card-title">{escape(instrument['title'])}</strong>
        {f'<span class="card-orig">{escape(instrument["original_name"])}</span>' if instrument.get("original_name") and instrument["original_name"] != instrument["title"] else ""}
        <span class="card-meta">{escape(instrument['country'])}</span>
      </div>
    </a>"""


def list_page(title, instruments, page_path=None, meta_description="", label=None):
    """label 只在標題與 H1 加上「（子分類）」這類說明，避免與樂器頁同名。"""
    label = label or title
    desc = meta_description or f"{title} — {len(instruments)} 件樂器的完整列表，包含樂器介紹、聆賞示範、演奏教學與文化背景。世界聲音 by 隔壁織音人。"
    cards = "\n".join(card(item, page_path) for item in instruments) or '<p class="empty">目前沒有資料。</p>'
    return page(
        label,
        f"""
        <main class="page">
          <section class="compact-hero">
            <p class="eyebrow">Browse</p>
            <h1>{escape(label)}</h1>
            <p class="lead">{len(instruments)} 件樂器</p>
          </section>
          <div class="instrument-grid">{cards}</div>
        </main>
        """,
        page_path,
        meta_description=desc,
    )


def build_instruments_list_page(instruments):
    """Build the /instruments/ page with view-switch: filter dropdown + category cards."""
    page_path = OUTPUT_DIR / "instruments" / "index.html"
    by_cat = defaultdict(list)
    for item in instruments:
        by_cat[item["category"]].append(item)
    category_links = "".join(
        f'<a class="facet-card" href="{resolve_url(page_path, f"/categories/{slugify(name)}/")}"><strong>{escape(name)}</strong><span>{len(items)} 筆</span></a>'
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
        <button id="mode-cards" class="is-active" type="button">📂 分類卡片</button>
        <button id="mode-dropdown" type="button">🔍 篩選瀏覽</button>
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
              <span>子分類</span>
              <select id="filter-subcategory"><option value="">全部分類</option></select>
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

      <div id="card-mode" class="browse-mode">
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
    write(page_path, page("全部樂器", body, page_path, meta_description="世界樂器百科 — 收錄世界各國 897 件傳統與現代樂器，可按分類、國家、年代、發聲方式篩選。提供樂器介紹、音色描述、歷史背景、演奏教學與 YouTube 聆賞示範。由隔壁織音人整理。"))


def build_index(instruments):
    index_path = OUTPUT_DIR / "index.html"
    categories = Counter(item["category"] for item in instruments)
    countries = Counter(item["country"] for item in instruments)
    subcategories = Counter(item.get("subcategory", "") for item in instruments if item.get("subcategory"))
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
        <h1>世界聲音</h1>
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
        <div class="stat-item"><strong>{len(subcategories)}</strong><span>子分類</span></div>
      </section>


      <section class="section">
        <div class="section-heading"><h2>工具</h2></div>
        <div class="featured-links" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
          <a class="featured-card" href="{resolve_url(index_path, '/tools/fretboard/')}" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;">
            <strong>🎸 世界樂器指版與和弦圖</strong>
            <span>瀏覽常見彈撥樂器的調弦法、各調性和弦、指版音位圖與順階和弦</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/chord-detection/')}" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;">
            <strong>🎼 自動抓和弦</strong>
            <span>上傳音檔自動分析節拍與和弦，簡譜式小節表可移調、標示 Capo、匯入 .lrc 歌詞</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/tools/tuner/')}" style="background:linear-gradient(135deg,#f5f5f0,#e8e6dd);border:1px solid #d6d2c4;">
            <strong>🎯 線上調音器與節拍器</strong>
            <span>麥克風即時測音高與音分偏差，15 種樂器調弦、參考音與節拍器</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/tools/lrc/')}" style="background:linear-gradient(135deg,#eef6ff,#dbeafe);border:1px solid #bfdbfe;">
            <strong>📝 LRC 動態歌詞工作室</strong>
            <span>邊聽邊打時間碼，自動偵測句與句的停頓先排好初稿，輸出 .lrc 或 .srt</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/tools/daw/')}" style="background:linear-gradient(135deg,#1f2937,#111827);border:1px solid #374151;color:#e5e7eb;">
            <strong>🎚️ 織音線上編曲製作</strong>
            <span>瀏覽器裡的多軌錄音與混音，16 軌起跳、可存專案與輸出 WAV；音檔不會上傳雲端</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/experience/')}" style="background:linear-gradient(135deg,#f5f0ff,#ebe0ff);border:1px solid #d5c5fd;">
            <strong>🎹 世界樂器體驗</strong>
            <span>用虛擬鍵盤試聽鋼琴、吉他、小提琴、琵琶等樂器的音色與音域</span>
          </a>
        </div>
      </section>

      <section class="section">
        <div class="section-heading"><h2>樂器分類</h2></div>
        <div class="featured-links">
          <a class="featured-card" href="{resolve_url(index_path, '/categories/吹奏與氣息樂器/')}">
            <strong>A1 吹奏與氣息樂器</strong>
            <span>氣流、管身、簧片、號角到風箱的聲音</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/categories/弦樂器/')}">
            <strong>A2 弦樂器</strong>
            <span>撥弦、擦弦、擊弦到鍵控弦鳴的世界</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/categories/鼓與打擊樂器/')}">
            <strong>A3 鼓與打擊樂器</strong>
            <span>鼓皮、鑼鐘、木竹到舌片手碟的節奏</span>
          </a>
          <a class="featured-card" href="{resolve_url(index_path, '/categories/電子與電聲樂器/')}">
            <strong>A4 電子與電聲樂器</strong>
            <span>合成器、取樣、電聲改造到數位控制</span>
          </a>
          <a class="featured-card random" href="#" id="random-link-home">
            <strong>隨選樂器</strong>
            <span>每次點選都隨機產生一個樂器，驚喜不斷</span>
          </a>
        </div>
      </section>

      <section class="view-switch" aria-label="瀏覽模式">
        <button id="mode-cards" class="is-active" type="button">📂 分類卡片</button>
        <button id="mode-dropdown" type="button">🔍 篩選瀏覽</button>
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
              <span>子分類</span>
              <select id="filter-subcategory"><option value="">全部分類</option></select>
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

      <div id="card-mode" class="browse-mode">
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
    write(index_path, page("世界聲音 | 隔壁織音人", body, index_path, meta_description="世界聲音 by 隔壁織音人 — 收錄世界各國傳統與現代樂器（卡林巴、手碟、鋼琴、吉他、小提琴等）、人聲歌唱教學、錄音後製知識與基礎樂理。探索樂器分類、國家地區、年代與音色，適合音樂創作者、教育工作者與樂器愛好者。"))

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
            ("主分類", item["category"]),
            ("子分類", item.get("subcategory", "")),
            ("地域／文化", item["country"]),
            ("發聲原理", item["sound_class"]),
            ("樂器家族", item["family"]),
            ("演奏方式", item["playing_method"]),
            ("操作介面", item.get("interface_tags", "")),
            ("聆聽標籤", item.get("listening_sound_tags", "")),
            ("查證狀態", item.get("verification_status", "")),
        ]
        meta_grid = "".join(meta_row(label, val) for label, val in meta_fields if val)
        code_badge = f'<span class="badge badge-code">{escape(item["class_code"])}</span>' if item.get("class_code") else ""
        orig = f'<p class="original-name">{escape(item["original_name"])}</p>' if item["original_name"] and item["original_name"] != item["title"] else ""
        soundscape_val = item.get("soundscape", "")
        soundscape_html = f'<p class="soundscape-tag">{escape(soundscape_val)}</p>' if soundscape_val else ""
        # Inject YouTube iframes into the 聆聽示範 section in the article body
        body_html = inject_youtube_into_body(item['html'], item.get("youtube_ids", []))
        # Extract plain-text description from first paragraph of HTML body
        desc_match = re.search(r'<p>(.*?)</p>', body_html, re.DOTALL)
        desc_text = re.sub(r'<[^>]+>', '', desc_match.group(1))[:160] if desc_match else ""
        if not desc_text.strip():
            # a few entries start with a list instead of a paragraph
            plain = re.sub(r'<[^>]+>', ' ', body_html)
            plain = re.sub(r'\s+', ' ', plain).strip()
            desc_text = (f"{item['title']}（{item['original_name']}）— "
                         f"{item['category']}・{item['country']}。{plain}")[:160] if plain else \
                        f"{item['title']}（{item['original_name']}）— {item['category']}・{item['country']} 的世界樂器介紹。"
        # Image HTML
        img_url = image_src(item.get("image", ""), OUTPUT_DIR / "instruments" / item["slug"] / "index.html")
        img_html = f'<img class="instrument-image" src="{img_url}" alt="{escape(item["title"])}" loading="lazy" onerror="this.style.display=\'none\'">' if img_url else ""
        img_credit_html = image_credit_html(item["slug"]) if img_url else ""
        header_class = "instrument-header has-image" if img_url else "instrument-header"
        keywords = f"{item['title']},{item['original_name']},{item['category']},{item['country']},樂器教學,世界樂器,樂器介紹"
        article_tags = "\n".join(
            f'<meta property="article:tag" content="{escape(tag)}">'
            for tag in [item['category'], item['country'], item.get('family', ''), item.get('sound_class', '')]
            if tag
        )
        og_tags = "\n".join(filter(None, [
            f'<meta property="og:title" content="{escape(item["title"])}｜世界聲音">',
            f'<meta property="og:description" content="{escape(desc_text)}">' if desc_text else "",
            f'<meta property="og:image" content="{img_url}">' if img_url else "",
            f'<meta property="og:type" content="article">',
            article_tags if article_tags else "",
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
              <p class="eyebrow">{escape(item['category'])} {code_badge}</p>
              <h1>{escape(item['title'])}</h1>
              {orig}
              {soundscape_html}
            </div>
            {f'<div class="header-image">{img_html}{img_credit_html}</div>' if img_url else ""}
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
        inst_url = canonical_for(OUTPUT_DIR / "instruments" / item["slug"] / "index.html")
        crumb = breadcrumb_jsonld([
            ("首頁", SITE_DOMAIN + "/"),
            ("樂器百科", SITE_DOMAIN + site_url("/instruments/")),
            (item["category"], SITE_DOMAIN + site_url(f'/categories/{item["category"]}/')),
            (item["title"], inst_url),
        ])
        write(OUTPUT_DIR / "instruments" / item["slug"] / "index.html", page(
            item["title"], body, meta_extra=og_tags, meta_description=desc_text,
            meta_keywords=keywords, jsonld_extra=crumb, og_type="article"))


def build_facet_pages(instruments, field, folder, title):
    grouped = defaultdict(list)
    for item in instruments:
        if item.get(field):
            grouped[item[field]].append(item)

    facet_cards = "".join(
        f'<a class="facet-card" href="{site_url(f"/{folder}/{slugify(name)}/")}"><strong>{escape(name)}</strong><span>{len(items)} 筆</span></a>'
        for name, items in sorted(grouped.items())
    )
    desc_map = {"category": "世界樂器主分類一覽", "subcategory": "世界樂器子分類一覽", "country": "世界樂器國家地區一覽"}
    browse_desc = desc_map.get(field, f"{title}一覽")
    write(
        OUTPUT_DIR / folder / "index.html",
        page(title, f'<main class="page"><section class="compact-hero"><h1>{escape(title)}</h1></section><div class="facet-grid">{facet_cards}</div></main>', meta_description=f"{browse_desc} — 探索來自各{field}的樂器，包含樂器介紹、聆賞示範與文化背景。世界聲音 by 隔壁織音人。"),
    )
    facet_label = {"category": "主分類", "subcategory": "子分類", "country": "國家／地區"}.get(field, "")
    for name, items in grouped.items():
        write(OUTPUT_DIR / folder / slugify(name) / "index.html", list_page(
            name, sorted(items, key=lambda item: item["title"]),
            label=f"{name}（{facet_label}）" if facet_label else None))


# ─── 07_整體架構_v1_2 資料 ────────────────────────────────────
CATEGORY_ARCHITECTURE = {
    "A1": {
        "name": "吹奏與氣息樂器",
        "hs": "底層 H 分類：4 氣鳴樂器 Aerophones",
        "description": "靠氣流、管身、簧片、唇振、風箱或風管系統發聲。",
        "subcategories": ["無簧吹管", "簧片樂器", "號角與唇振樂器", "風袋與風箱樂器", "風管與鍵控氣鳴"],
    },
    "A2": {
        "name": "弦樂器",
        "hs": "底層 H 分類：3 弦鳴樂器 Chordophones",
        "description": "靠弦震動發聲；鍵盤、輪弦、鍵控只作操作方式，不作主分類。",
        "subcategories": ["撥弦與抱持弦樂", "平放弦與齊特琴類", "擊弦樂器", "豎琴里拉與開放弦", "擦弦樂器", "鍵控輪弦與特殊弦鳴"],
    },
    "A3": {
        "name": "鼓與打擊樂器",
        "hs": "底層 H 分類：1 體鳴樂器 Idiophones／2 膜鳴樂器 Membranophones",
        "description": "膜鳴與體鳴；鼓、鑼鐘、木石竹、沙鈴、舌片與手邊共鳴同區處理。",
        "subcategories": ["鼓皮與鼓類", "鑼鐘與金屬敲擊", "木琴石琴竹琴", "沙鈴刮器與小打擊", "舌片手碟與手邊共鳴"],
    },
    "A4": {
        "name": "電子與電聲樂器",
        "hs": "底層 H 分類：5 電鳴／電聲樂器 Electrophones",
        "description": "電子振盪、合成、取樣、磁帶、擴音、控制器或電聲改造。",
        "subcategories": ["電子振盪", "合成器", "取樣與磁帶", "鼓機與節奏機", "電聲改造樂器", "控制器與數位介面"],
    },
}

ENSEMBLE_ARCHITECTURE = [
    ("B1", "地域傳統合奏", "以地域文化、傳統聲音系統為核心的合奏。", "甘美朗合奏、阿拉伯塔赫特、安地斯合奏"),
    ("B2", "民間樂隊", "街頭、民俗、社群生活或地方傳統中的樂隊編制。", "墨西哥流浪樂隊、藍草樂隊、巴爾幹銅管樂隊"),
    ("B3", "鼓樂與節慶編制", "以鼓樂、節慶、儀式或隊伍節奏為核心。", "太鼓團、非洲鼓樂隊、桑巴打擊樂隊"),
    ("B4", "古典與大型編制", "古典或大型制度化編制。", "管弦樂團、管樂團、室內樂"),
    ("B5", "現代民族樂團", "現代整理後的民族樂器大型編制。", "國樂團、民族管弦樂團、韓國國樂管弦樂團"),
    ("B6", "爵士與流行編制", "爵士、流行、搖滾與節奏組相關編制。", "爵士小編制、爵士大樂團、搖滾樂團、流行樂隊"),
    ("B7", "現代混合與跨界編制", "世界音樂、影視配樂、劇場、電子原聲混合。", "世界音樂樂團、影視配樂編制、實驗聲響團體"),
]


def build_category_detail_pages(instruments):
    """為每個 A1-A4 分類建立含子分類樹狀結構的頁面。"""
    # Build class_code → list of instruments
    code_to_instruments = defaultdict(list)
    code_to_subcats = defaultdict(set)
    for item in instruments:
        code = item.get("class_code", "")
        subcat = item.get("subcategory", "")
        if code:
            code_to_instruments[code].append(item)
            if subcat:
                code_to_subcats[code].add(subcat)

    # ─── /categories/index.html — 全部分類：A.單一樂器百科 + B.合奏與編制百科 ───
    cat_index_body = f"""
    <main class="page">
      <section class="compact-hero">
        <p class="eyebrow">World Musical Instruments Encyclopedia</p>
        <h1>全部分類</h1>
        <p class="lead">探索世界樂器的分類體系，從單一樂器到合奏編制。</p>
      </section>
      <section class="section">
        <div class="section-heading"><h2>樂器百科</h2></div>
        <div class="featured-links">
          <a class="featured-card" href="{site_url('/categories/single-instrument/')}" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;">
            <strong>A. 單一樂器百科</strong>
            <span>依發聲原理分為 A1 吹奏與氣息樂器、A2 弦樂器、A3 鼓與打擊樂器、A4 電子與電聲樂器，共 4 大類。</span>
          </a>
          <a class="featured-card" href="{site_url('/ensembles/')}" style="background:linear-gradient(135deg,#f0f5ff,#e0efff);border:1px solid #c5ddfd;">
            <strong>B. 合奏與編制百科</strong>
            <span>從地域傳統合奏、民間樂隊到現代跨界編制，探索樂器如何分工合作形成聲音系統。</span>
          </a>
        </div>
      </section>
    </main>
    """
    write(
        OUTPUT_DIR / "categories" / "index.html",
        page("全部分類", cat_index_body, OUTPUT_DIR / "categories" / "index.html",
             meta_description="世界樂器全部分類 — A. 單一樂器百科（A1-A4）與 B. 合奏與編制百科（B1-B7）。"),
    )

    # ─── /categories/single-instrument/index.html — A. 單一樂器百科（A1-A4 列表） ───
    a_cards_list = []
    for code, arch in CATEGORY_ARCHITECTURE.items():
        cat_slug = slugify(arch['name'])
        cat_url = site_url(f'/categories/{cat_slug}/')
        a_cards_list.append(
            f'<a class="facet-card" href="{cat_url}">'
            f'<strong>{escape(code)} {escape(arch["name"])}</strong>'
            f'<span>{len(code_to_instruments.get(code, []))} 件樂器</span>'
            f'<span style="font-size:12px;color:var(--muted);">{escape(arch["description"])}</span>'
            f'</a>'
        )
    a_cards = "".join(a_cards_list)
    single_instrument_dir = OUTPUT_DIR / "categories" / "single-instrument"
    single_instrument_dir.mkdir(parents=True, exist_ok=True)
    write(
        single_instrument_dir / "index.html",
        page(
            "A. 單一樂器百科",
            f"""
            <main class="page">
              <section class="compact-hero">
                <p class="eyebrow">Single Instrument Encyclopedia</p>
                <h1>A. 單一樂器百科</h1>
                <p class="lead">依發聲原理分類，涵蓋世界各地的傳統與現代樂器。</p>
              </section>
              <div class="facet-grid">{a_cards}</div>
            </main>
            """,
            single_instrument_dir / "index.html",
            meta_description="單一樂器百科 A1-A4 分類總覽 — 從吹奏樂器到電子樂器，探索世界各地的樂器分類。",
        ),
    )

    # ─── 各 A1-A4 分類頁面（含子分類） ───
    for code, arch in CATEGORY_ARCHITECTURE.items():
        cat_name = arch["name"]
        slug = slugify(cat_name)
        items_in_cat = code_to_instruments.get(code, [])
        actual_subcats = code_to_subcats.get(code, set())

        # Build subcategory listing
        subcat_sections = []
        for subcat_name in arch["subcategories"]:
            # Find matching instruments (try exact match first, then fuzzy)
            matched = sorted(
                [i for i in items_in_cat if i.get("subcategory", "") == subcat_name or slugify(i.get("subcategory", "")) == slugify(subcat_name)],
                key=lambda i: i["title"],
            )
            if not matched:
                # Try fuzzy matching
                for i in items_in_cat:
                    s = i.get("subcategory", "")
                    if s and (slugify(s) == slugify(subcat_name) or s.startswith(subcat_name[:2])):
                        matched.append(i)
                matched = sorted(matched, key=lambda i: i["title"], reverse=False)
            # The architecture names (07_整體架構) differ slightly from the
            # subcategory values in the data; link to the facet page that the
            # matched instruments actually live under.
            real_sub = matched[0].get("subcategory", "") if matched else ""
            subcat_link = resolve_url(OUTPUT_DIR / "categories" / slug / "index.html", f'/subcategories/{slugify(real_sub)}/') if real_sub else ""
            subcat_items_html = "\n".join(card(item, OUTPUT_DIR / "categories" / slug / "index.html") for item in matched) if matched else '<p class="empty">（此子分類暫無樂器資料）</p>'
            subcat_sections.append(f"""
            <section class="section">
              <div class="section-heading">
                <h3>{f'<a href="{subcat_link}" style="color:var(--accent);text-decoration:none;">{escape(subcat_name)}</a>' if subcat_link else escape(subcat_name)}</h3>
                <span class="section-note">{len(matched)} 件樂器</span>
              </div>
              <div class="instrument-grid">{subcat_items_html}</div>
            </section>""")

        subcat_html = "\n".join(subcat_sections)

        # Build category page
        hs_html = f'<p class="hs-note">{escape(arch["hs"])}</p>' if arch["hs"] else ""
        body = f"""
        <main class="page">
          <section class="compact-hero">
            <p class="eyebrow"><span class="badge badge-code">{escape(code)}</span> {escape(arch["description"])}</p>
            <h1>{escape(cat_name)}</h1>
            <p class="lead">{len(items_in_cat)} 件樂器</p>
            {hs_html}
          </section>
          <div class="category-tree">
            {subcat_html}
          </div>
        </main>
        """

        write(
            OUTPUT_DIR / "categories" / slug / "index.html",
            page(
                f"{code} {cat_name}",
                body,
                OUTPUT_DIR / "categories" / slug / "index.html",
                meta_description=f"{cat_name} — {arch['description']} 共 {len(items_in_cat)} 件樂器，含子分類：{'、'.join(arch['subcategories'])}。世界聲音 by 隔壁織音人。",
            ),
        )


def build_ensemble_pages():
    """建立 B1-B7 合奏與編制百科頁面（目前為占位）。"""
    ensemble_dir = OUTPUT_DIR / "ensembles"
    ensemble_dir.mkdir(parents=True, exist_ok=True)

    # Index page
    cards = "".join(
        f'<a class="facet-card" href="{site_url(f"/ensembles/{code}/")}"><strong>{escape(code)} {escape(name)}</strong><span>{escape(desc)}</span></a>'
        for code, name, desc, _ in ENSEMBLE_ARCHITECTURE
    )
    body = f"""
    <main class="page">
      <section class="compact-hero">
        <p class="eyebrow">Ensemble Encyclopedia</p>
        <h1>合奏與編制百科</h1>
        <p class="lead">探索世界各地的樂器合奏形式與編制傳統。</p>
      </section>
      <div class="facet-grid">{cards}</div>
    </main>
    """
    write(
        ensemble_dir / "index.html",
        page("合奏與編制百科", body, ensemble_dir / "index.html", meta_description="世界樂器合奏與編制百科 — 從地域傳統合奏、民間樂隊到現代跨界編制，探索樂器如何分工合作形成聲音系統。"),
    )

    # Individual ensemble pages (placeholder)
    for code, name, desc, examples in ENSEMBLE_ARCHITECTURE:
        examples_html = f'<p class="lead">例如：{escape(examples)}</p>' if examples else ""
        body = f"""
        <main class="page">
          <section class="compact-hero">
            <p class="eyebrow">Ensemble <span class="badge badge-code">{escape(code)}</span></p>
            <h1>{escape(name)}</h1>
            <p class="lead">{escape(desc)}</p>
            {examples_html}
          </section>
          <section class="section">
            <p class="empty">📝 此條目建置中，敬請期待。</p>
          </section>
        </main>
        """
        write(
            ensemble_dir / code / "index.html",
            page(f"{code} {name}", body, ensemble_dir / code / "index.html", meta_description=f"{name} — {desc}。合奏與編制百科建置中。"),
        )


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
[data-theme="dark"] {
  --ink: #e2e8f0;
  --ink2: #cbd5e1;
  --muted: #94a3b8;
  --line: #334155;
  --surface: #1e293b;
  --soft: #0f172a;
  --accent: #5eead4;
  --accent2: #14b8a6;
  --blue: #60a5fa;
  --shadow: 0 1px 3px rgba(0,0,0,.3), 0 1px 2px rgba(0,0,0,.25);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.35), 0 2px 4px -2px rgba(0,0,0,.3);
}
[data-theme="nextdoor"] {
  --ink: #3D3229;
  --ink2: #5D4E41;
  --muted: #9C8F87;
  --line: #E5DDD6;
  --surface: #FFFFFF;
  --soft: #F7F3EE;
  --accent: #C4956A;
  --accent2: #A67C52;
  --blue: #6B8FBF;
  --shadow: 0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.04), 0 2px 4px -2px rgba(0,0,0,.04);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin:0; color:var(--ink); background:var(--soft); font-family:"Noto Serif TC","Source Han Serif TW VF",Georgia,"Times New Roman",serif; line-height:1.6; }
a { color:inherit; }
img { max-width:100%; }

/* ── Site header ─────────────────────────────────────────────── */
.site-header {
  display:flex; justify-content:space-between; gap:20px; align-items:center;
  padding:14px 28px; border-bottom:1px solid var(--line);
  background:var(--surface); backdrop-filter:blur(8px);
  position:sticky; top:0; z-index:100;
  box-shadow: 0 1px 0 var(--line);
}
.brand { font-weight:800; font-size:17px; text-decoration:none; color:var(--accent); letter-spacing:-.3px; }
.site-header nav { display:flex; gap:4px; }
.site-header nav a { text-decoration:none; color:var(--muted); font-size:14px; font-weight:500; padding:6px 10px; border-radius:6px; transition:color .15s,background .15s; }
.site-header nav a:hover { color:var(--ink); background:var(--soft); }

/* ── Theme toggle ─────────────────────────────────────────────── */
.theme-toggle { background:none; border:1px solid var(--line); border-radius:6px; cursor:pointer; font-size:16px; line-height:1; padding:5px 8px; color:var(--ink2); transition:border-color .15s; flex-shrink:0; margin-left:4px; }
.theme-toggle:hover { border-color:var(--accent); }

/* ── Dropdown nav ─────────────────────────────────────────────── */
.nav-dropdown { position:relative; display:flex; align-items:stretch; }
.nav-dropdown .dropdown-trigger { cursor:pointer; display:flex; align-items:center; }
.dropdown-menu {
  display:none; position:absolute; top:100%; left:0; z-index:200;
  min-width:140px; background:var(--surface); border:1px solid var(--line);
  border-radius:8px; box-shadow:var(--shadow-md); padding:4px 0;
}
.dropdown-menu.multi-col { min-width:600px; padding:8px; }
.nav-dropdown:hover .dropdown-menu,
.nav-dropdown .dropdown-menu:hover { display:block; }
.nav-dropdown:hover .dropdown-menu.multi-col,
.nav-dropdown .dropdown-menu.multi-col:hover { display:flex !important; }
.menu-col { flex:1; min-width:0; }
.menu-col hr { margin:6px 8px; }
.sub-link { padding:2px 16px !important; font-size:12px !important; color:var(--muted) !important; display:flex !important; justify-content:space-between; gap:8px; }
.sub-link:hover { color:var(--accent) !important; background:transparent !important; }
.sub-count { font-size:10px; color:var(--muted); opacity:.65; }
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
/* nav entries that are not clickable yet */
.nav-soon {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:7px 11px; color:var(--muted); font-size:13px; cursor:default;
}
.nav-soon-tag {
  font-size:10.5px; letter-spacing:.04em; padding:1px 6px; border-radius:999px;
  background:var(--soft); color:var(--muted); flex:none;
}
/* floating random-song player (bottom-right) */
.mini-player {
  position:fixed; right:16px; bottom:16px; z-index:60;
  display:flex; flex-direction:column; align-items:flex-end; gap:8px;
  max-width:min(320px, calc(100vw - 32px));
}
.mini-player[hidden] { display:none; }
.mini-player-frame iframe, .mini-player-iframe {
  display:block; width:min(320px, calc(100vw - 32px)); height:180px;
  border:0; border-radius:10px; background:#000; box-shadow:0 10px 28px rgba(0,0,0,.22);
}
.mini-player-bar {
  display:flex; align-items:center; gap:8px; padding:7px 10px;
  border:1px solid var(--line); border-radius:999px; background:var(--paper);
  box-shadow:0 6px 20px rgba(0,0,0,.14);
}
.mini-player-btn {
  width:28px; height:28px; border-radius:50%; border:1px solid var(--line);
  background:#fff; color:var(--accent); font-size:12px; cursor:pointer; flex:none;
  transition:background .2s ease, transform .2s ease;
}
.mini-player-btn:hover { background:var(--accent-soft); transform:translateY(-1px); }
.mini-player-text { display:flex; flex-direction:column; line-height:1.25; min-width:0; }
.mini-player-name,
.mini-player-sub { max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mini-player-name { color:var(--ink); font-weight:700; font-size:12.5px; }
.mini-player-sub { color:var(--muted); font-size:11px; }
.mini-player-close {
  border:0; background:transparent; color:var(--muted); cursor:pointer;
  font-size:15px; line-height:1; padding:0 2px;
}
.mini-player-close:hover { color:var(--ink); }
.mini-player-launcher {
  width:44px; height:44px; border-radius:50%; border:1px solid var(--line);
  background:var(--paper); color:var(--accent); font-size:18px; cursor:pointer;
  box-shadow:0 6px 20px rgba(0,0,0,.14);
}
.mini-player-launcher:hover { background:var(--accent-soft); }
@media (max-width: 520px) {
  .mini-player-name, .mini-player-sub { max-width:110px; }
}
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
.about-text ul { margin:0 0 18px; padding-left:1.2em; }
.about-text li { color:var(--ink2); line-height:1.85; font-size:15.5px; margin-bottom:10px; }
.about-text li strong { color:var(--ink); }
.about-index { list-style:none; padding-left:0; }
.about-index li { padding-left:14px; border-left:2px solid var(--line); }
.about-index li strong a { color:var(--ink); text-decoration:none; border-bottom:1px solid var(--line); }
.about-index li strong a:hover { color:var(--accent); border-bottom-color:var(--accent); }
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
.image-credit a { color:inherit; text-decoration:none; border-bottom:1px dotted currentColor; }
.image-credit a:hover { color:var(--accent); border-bottom-color:var(--accent); }

/* ── Badges ──────────────────────────────────────────────────── */
.badge-row { margin:8px 0 0; display:flex; gap:6px; }
.badge {
  display:inline-flex; padding:3px 8px; border-radius:4px;
  font-size:11px; font-weight:700;
}
.badge-hot { background:#fef2f0; color:#c2410c; border:1px solid #fed7c5; }
.badge-cold { background:#f0f5ff; color:#1e40af; border:1px solid #c5ddfd; }
.badge-code { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }
.card-code {
  display:inline-block; padding:1px 5px; border-radius:3px;
  background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;
  font-size:10px; font-weight:700; margin-right:4px; vertical-align:middle;
}
.card-cat { color:var(--accent); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; display:flex; align-items:center; gap:4px; }

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

/* ── Sound journey page ────────────────────────────────────────── */
.sound-journey-page { max-width:780px; }
.journey-article { line-height:2; font-size:17px; color:var(--ink2); }
.journey-article h1 { font-size:clamp(26px,4vw,36px); margin-bottom:8px; }
.journey-article h2 { font-size:22px; margin:2em 0 .6em; padding-bottom:8px; border-bottom:1px solid var(--line); color:var(--ink); }
.journey-article h3 { font-size:18px; margin:1.8em 0 .4em; color:var(--ink); }
.journey-article p { margin:0 0 1.2em; }
.journey-images { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:1.2em 0; }
.journey-img { max-width:100%; height:auto; border-radius:6px; flex-shrink:0; object-fit:contain; }
.journey-images .journey-img { max-height:120px; width:auto; }
.experiment-box {
  margin:1.2em 0; padding:18px 20px;
  border:1px solid var(--accent); border-radius:8px;
  background:var(--surface); box-shadow:var(--shadow);
  font-size:15px; line-height:1.7;
}
.experiment-box p { margin:0; }
.experiment-box::before { content:"🧪 小實驗"; display:block; font-weight:700; color:var(--accent); font-size:13px; margin-bottom:8px; text-transform:uppercase; letter-spacing:.05em; }
.btn-back {
  display:inline-block; margin-top:16px; padding:10px 20px;
  background:var(--accent); color:#fff; border-radius:8px;
  text-decoration:none; font-weight:700;
}
.btn-back:hover { background:var(--accent2); }
@media (max-width:700px) {
  .journey-images .journey-img { max-height:80px; }
  .journey-article { font-size:16px; }
}
"""
    search_index = [
        {
            "title": item["title"],
            "original_name": item.get("original_name", ""),
            "category": item["category"],
            "country": item["country"],
            "subcategory": item.get("subcategory", ""),
            "sound_class": item.get("sound_class", ""),
            "url": site_url(f"/instruments/{item['slug']}/"),
            # was hard-coded to "", which left every search result thumbnailless
            "image": item.get("image", ""),
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
  subcategory: document.getElementById('filter-subcategory'),
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

// Restore saved mode; cards is the default — a grid of instruments with
// images is a better first impression than a wall of text rows.
try {{
  const saved = localStorage.getItem('wmi_browse_mode');
  setBrowseMode(saved || 'cards');
}} catch(e) {{ setBrowseMode('cards'); }}

// Search box
if (input && results) {{
  input.addEventListener('input', () => {{
    if (typeof renderDropdownResults === 'function') renderDropdownResults();
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

  // The homepage hero links here as /instruments/?q=<term>. Run it after the
  // listener exists, and switch to the view that actually shows results.
  const initialQ = new URLSearchParams(location.search).get('q');
  if (initialQ) {{
    input.value = initialQ;
    setBrowseMode('dropdown');
    input.dispatchEvent(new Event('input'));
  }}
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
  // The keyword box feeds this list too — without it, typing "尺八" showed
  // one hit above and 833 rows below.
  const kw = (input && input.value.trim().toLowerCase()) || '';
  currentHits = SEARCH_INDEX.filter(item =>
    Object.entries(filters).every(([field, value]) => !value || item[field] === value)
    && (!kw || [item.title, item.original_name, item.category, item.country,
                item.subcategory, item.sound_class]
          .join(' ').toLowerCase().includes(kw))
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
  fillSelect(filterControls.subcategory, 'subcategory');
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
    # Visual refresh layer (Swiss/editorial). Kept as a separate hand-maintained
    # file rather than appended here, so it stays reviewable on its own.
    refresh_src = BASE_DIR / "assets" / "site-refresh.css"
    if refresh_src.exists():
        write(OUTPUT_DIR / "assets" / "site-refresh.css",
              refresh_src.read_text(encoding="utf-8"))
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
    write(OUTPUT_DIR / "404.html", page(
        "頁面找不到", body,
        meta_description="找不到這個頁面。可以回首頁，或從樂器百科、聲音旅圖與工具重新找起。",
        meta_extra='<meta name="robots" content="noindex">'))


def build_sitemap(instruments):
    site_base = f"{SITE_DOMAIN}{SITE_BASE_PATH}"
    today = datetime.date.today().isoformat()

    def u(path):
        return f"<url><loc>{site_base}{path}</loc><lastmod>{today}</lastmod></url>"

    # Collect all unique facet values from instruments
    categories = sorted(set(i["category"] for i in instruments if i.get("category")))
    countries = sorted(set(i["country"] for i in instruments if i.get("country")))
    subcategories = sorted(set(i["subcategory"] for i in instruments if i.get("subcategory")))

    urls = []

    # Static top-level pages
    for path in ["/", "/instruments/", "/categories/", "/categories/single-instrument/",
                 "/countries/", "/ensembles/", "/subcategories/", "/map/",
                 "/about/", "/theory/", "/vocal/", "/digitalmusic/",
                 "/sound-journey/", "/experience/", "/contact/",
                 "/chord-detection/", "/tools/", "/tools/fretboard/", "/tools/fretboard/guide/",
                 "/chord-detection/guide/", "/tools/lrc/", "/tools/lrc/guide/", "/tools/daw/", "/tools/daw/guide/",
                 "/tools/tuner/", "/tools/tuner/guide/",
                 "/learn/", "/about/author/", "/about/works/", "/recruit/", "/mandolin/",
                 "/guitar/", "/ukulele/"]:
        urls.append(u(path))

    # Instrument detail pages
    for item in instruments:
        urls.append(u(f"/instruments/{item['slug']}/"))

    # Category detail pages
    for name in categories:
        urls.append(u(f"/categories/{slugify(name)}/"))

    # Country detail pages
    for name in countries:
        urls.append(u(f"/countries/{slugify(name)}/"))

    # Subcategory detail pages
    for name in subcategories:
        urls.append(u(f"/subcategories/{slugify(name)}/"))

    # Ensemble pages
    for code, name, _, _ in ENSEMBLE_ARCHITECTURE:
        urls.append(u(f"/ensembles/{code}/"))

    # Ensemble entries (generated by build_ensembles.py from content/ensembles/)
    for entry in sorted((BASE_DIR / "content" / "ensembles").glob("b*-*.md")):
        urls.append(u(f"/ensembles/{entry.stem}/"))

    # 樂理：五個階段總覽 + 一頁一章
    urls.append(u("/theory/preface/"))
    for i in range(1, 6):
        urls.append(u(f"/theory/{i}/"))
    for i in range(1, 21):
        urls.append(u(f"/theory/ch{i}/"))

    # Vocal chapter pages (generated by build_vocal_extra.py)
    for i in range(1, 51):  # 1–50
        urls.append(u(f"/vocal/{i}/"))
    for i in range(1, 4):  # research columns 1–3
        urls.append(u(f"/vocal/research/{i}/"))

    # Digital music lesson pages (generated by build_vocal_extra.py)
    for i in range(1, 31):  # 1–30
        urls.append(u(f"/digitalmusic/{i}/"))

    # Mandolin chapters (generated by build_mandolin.py)
    mand_index = BASE_DIR / "content" / "mandolin" / "_index.json"
    if mand_index.exists():
        for ch in json.loads(mand_index.read_text(encoding="utf-8")):
            urls.append(u(f"/mandolin/{ch['slug']}/"))

    # Sound journey pages
    urls.append(u("/sound-journey/all/"))
    for i in range(1, 7):  # 1–6
        urls.append(u(f"/sound-journey/{i}/"))

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    # Different names can slugify to the same page (e.g. two spellings of a region).
    xml += "\n".join(dict.fromkeys(urls)) + "\n</urlset>\n"
    write(OUTPUT_DIR / "sitemap.xml", xml)


def build_special_pages(instruments):
    """Build popular and uncommon list pages."""
    popular = [i for i in instruments if i.get("is_popular")]
    uncommon = [i for i in instruments if i.get("is_uncommon")]

    if popular:
        page_dir = OUTPUT_DIR / "popular"
        page_dir.mkdir(parents=True, exist_ok=True)
        write(page_dir / "index.html", list_page("熱門樂器", popular, page_dir / "index.html", meta_description=f"熱門樂器 — {len(popular)} 件最受歡迎的世界樂器，包含鋼琴、吉他、小提琴、爵士鼓、卡林巴、手碟等知名樂器的介紹、聆賞與教學。世界聲音 by 隔壁織音人。"))

    if uncommon:
        page_dir = OUTPUT_DIR / "uncommon"
        page_dir.mkdir(parents=True, exist_ok=True)
        write(page_dir / "index.html", list_page("冷門樂器", uncommon, page_dir / "index.html", meta_description=f"冷門樂器 — {len(uncommon)} 件稀有珍奇的世界樂器，發掘來自世界各地的獨特聲音。世界聲音 by 隔壁織音人。"))

def build_map_page(instruments):
    """Build a standalone map page at /map/ with clickable markers."""
    from collections import defaultdict
    map_features = build_map_data(instruments)
    map_json = json.dumps(map_features, ensure_ascii=False)
    page_dir_ = OUTPUT_DIR / "map"
    page_dir_.mkdir(parents=True, exist_ok=True)

    slugs_json = json.dumps([i["slug"] for i in instruments], ensure_ascii=False)

    extra = f'<link rel="stylesheet" href="{resolve_url(page_dir_ / "index.html", "/assets/vendor/leaflet/leaflet.css")}">'
    body = f"""<main class="page">
  <section class="compact-hero">
    <p class="eyebrow">Geography</p>
    <h1>地圖導覽</h1>
    <p class="lead">點擊地圖上的標記，瀏覽該地區的所有樂器。</p>
  </section>
  <div id="world-map" class="world-map"></div>
  <p class="map-hint">每個圓點代表一個地區的樂器數量，點擊可查看該地區樂器列表。</p>
</main>
<script src="{resolve_url(page_dir_ / "index.html", "/assets/vendor/leaflet/leaflet.js")}"></script>
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
    write(page_dir_ / "index.html", page("地圖導覽", body, page_dir_ / "index.html", extra_head=extra, meta_description="世界樂器地圖導覽 — 透過互動式世界地圖探索各國樂器，點擊標記瀏覽該地區的所有樂器。世界聲音 by 隔壁織音人。"))


def build_manager_page(instruments):
    """Build a static manager page at /manage/ with Excel download and client-side upload."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    page_dir_ = OUTPUT_DIR / "manage"
    page_dir_.mkdir(parents=True, exist_ok=True)

    fm_fields = [
        ("class_code", "主分類代碼"),
        ("frontend_class", "前台主分類"),
        ("subcategory", "子分類"),
        ("title_zh", "中文名"),
        ("title_original", "英文／原文名"),
        ("family_std", "樂器家族"),
        ("sound_hs", "發聲原理／H-S"),
        ("playing_method", "演奏方式"),
        ("interface_tags", "操作介面"),
        ("region_culture", "地域／文化"),
        ("listening_sound_tags", "聆聽與聲音標籤"),
        ("ensemble_links", "常見合奏／編制"),
        ("verification_status", "查證狀態"),
        ("issue_note", "核實／修正備註"),
        ("source_url", "來源網址"),
        ("image", "圖片網址"),
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
            # Convert youtube_ids list back to space-separated string
            if key == "youtube_ids" and isinstance(val, list):
                val = " ".join(val)
            if val:
                cell = ws.cell(row=row_idx, column=col_idx, value=str(val))
                if key in ("source_url", "image") and str(val).startswith("http"):
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
    <p class="eyebrow">Data &amp; Downloads</p>
    <h1>資料下載與轉檔</h1>
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


  </div>


</main>

<script src="../assets/vendor/xlsx.full.min.js"></script>
<script src="../assets/vendor/jszip.min.js"></script>
<script>
(function() {
  // No password gate: everything this page offers is public anyway, and a
  // client-side password check is a pattern phishing scanners flag.

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
            if (key === 'title_original') origName = val;
            if (key === 'introduction' || key === 'history' || key === 'timbre' || key === 'material' || key === 'tutorial') {
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
          if (sections.material) bodyParts.push('\n## 樂器材質\n\n' + sections.material);
          if (sections.tutorial) bodyParts.push('\n## 教學\n\n' + sections.tutorial);
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
    write(page_dir_ / "index.html", page("資料下載與轉檔", body, page_dir_ / "index.html", meta_extra='<meta name="robots" content="noindex">'))



ABOUT_TABS = [("/about/", "關於世界聲音"), ("/about/author/", "作者"),
              ("/about/works/", "歷年作品"), ("/recruit/", "招募夥伴"),
              ("/contact/", "聯絡我們")]


def about_tabs(page_path, current):
    links = []
    for target, label in ABOUT_TABS:
        cur = ' aria-current="page"' if target == current else ""
        links.append(f'<a href="{resolve_url(page_path, target)}"{cur}>{label}</a>')
    return f'<nav class="page-tabs" aria-label="關於">{"".join(links)}</nav>'


def banner_hero(eyebrow, title, lead):
    """The brand banner as a landing-page hero (see .banner-hero in site-refresh.css)."""
    return f"""<section class="banner-hero">
    <div class="banner-hero-inner">
      <p class="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p class="lead">{lead}</p>
    </div>
  </section>"""


def discography_section(page_path: Path) -> str:
    """歷年作品 album grid from content/discography.json (covers in assets/brand/albums/)."""
    data = json.loads((BASE_DIR / "content" / "discography.json").read_text(encoding="utf-8"))
    released = data["released"]
    cards = []
    for a in released:
        apple = f"https://music.apple.com/tw/album/{a['apple']}"
        ytm = f"https://music.youtube.com/playlist?list={a['ytm']}"
        cover = resolve_url(page_path, f"/assets/brand/albums/{a['apple']}.webp")
        title = escape(a["title"])
        sub = f'<span class="album-en">{escape(a["en"])}</span>' if a.get("en") else ""
        cards.append(f"""      <li class="album-card">
        <a class="album-cover" href="{ytm}" target="_blank" rel="noopener" aria-label="在 YouTube Music 播放《{title}》">
          <img src="{cover}" alt="《{title}》專輯封面" width="480" height="480" loading="lazy">
          <span class="album-tag">{escape(a["cat"])}</span>
        </a>
        <div class="album-body">
          <h3>{title}</h3>{sub}
          <p class="album-meta">{a["date"].replace("-", ".")}・{escape(a["type"])}・{a["tracks"]} 首</p>
          <p class="album-links">
            <a class="album-link is-apple" href="{apple}" target="_blank" rel="noopener">Apple Music</a>
            <a class="album-link is-ytm" href="{ytm}" target="_blank" rel="noopener">YouTube Music</a>
          </p>
        </div>
      </li>""")
    upcoming = "".join(
        f'<li><span>{a["date"].replace("-", ".")}</span>{escape(a["title"])}<em>{escape(a["type"])}・{a["tracks"]} 首</em></li>'
        for a in data.get("upcoming", []))
    upcoming_html = f"""
    <div class="album-upcoming">
      <h3>即將發行</h3>
      <ul>{upcoming}</ul>
    </div>""" if upcoming else ""
    n_album = sum(a["type"] == "專輯" for a in released)
    return f"""    <section class="about-section discography">
      <h2>歷年作品 Discography</h2>
      <p class="discography-lead">自 2024 年起已發行 {len(released)} 張作品（專輯 {n_album} 張、單曲 {len(released) - n_album} 張），橫跨療癒純音樂、兒童音樂與華語、日語流行歌曲。點封面即可在 YouTube Music 播放。</p>
      <p class="discography-artist">
        <a class="btn-ghost" href="{data["apple_artist"]}" target="_blank" rel="noopener">Apple Music 歌手頁 ↗</a>
        <a class="btn-ghost" href="{data["ytm_artist"]}" target="_blank" rel="noopener">YouTube Music 歌手頁 ↗</a>
      </p>
      <ul class="album-grid">
{chr(10).join(cards)}
      </ul>{upcoming_html}
    </section>"""


def build_about_page():
    """/about/ (the site), /about/author/ (隔壁織音人) and /about/works/ (歷年作品) as tabs."""
    about_path = OUTPUT_DIR / "about" / "index.html"
    n_inst = content_count("instruments")
    v = verification_breakdown()
    n_ens = content_count("ensembles", exclude=("_STYLE.md",))
    n_vocal = content_count("vocal", "vocal_ch*.md")
    n_digital = content_count("digitalmusic")
    n_theory = content_count("musictheory") - 1  # 前言不算階段
    n_mandolin = course_chapters("mandolin")
    n_guitar = course_chapters("guitar")
    n_ukulele = course_chapters("ukulele")

    def link(href, label):
        return f'<a href="{resolve_url(about_path, href)}">{label}</a>'

    body = f"""<main class="about-page">
  {banner_hero("About World Sound Encyclopedia", "關於世界聲音", "循著聲音，走進不同文化的現場")}
  {about_tabs(about_path, "/about/")}
  <div class="about-body">
    <section class="about-section">
      <h2>這個網站是什麼</h2>
      <div class="about-text">
        <p>世界聲音從一個很簡單的念頭開始：世界上有這麼多種樂器，卻很少有人能把它們連在一起看。我們想做的，就是那張可以連起來的地圖。</p>
        <p>每一件樂器都不只是發聲的工具。它是當地的材料與工藝——竹子、葫蘆、羊皮、銅與絲線；也是信仰、勞動與生活的痕跡。當你聽見陌生的音色，有時覺得遙遠，有時又莫名熟悉，那就是這個網站想帶你反覆經過的時刻。</p>

        <h3 style="font-size:18px;margin:1.5em 0 .5em;color:var(--ink);">為什麼需要這個平台？</h3>
        <p>關於樂器的知識，長期散落在學術論文、零散文章與影音平台之間。想看一件樂器的分類、地理分布、構造、演奏方式，再一路走到它的文化脈絡，往往要在好幾個網站之間跳來跳去。</p>
        <p>所以我們把它整理成一套可以循著走的系統：先分聲學家族，再分地區與文化圈，然後才是單件樂器。你可以從「氣鳴」開始，也可以從「非洲」開始，或直接搜一件樂器的名字。</p>
      </div>
    </section>

    <section class="about-section">
      <h2>現在這裡有什麼</h2>
      <div class="about-text">
        <ul class="about-index">
          <li><strong>{link('/instruments/', '世界樂器')}</strong>　{n_inst} 件。每頁包含介紹、歷史背景、音色描述、材質構造、教學建議與聆聽示範，並標註 Hornbostel–Sachs 編號。</li>
          <li><strong>{link('/ensembles/', '合奏與編制百科')}</strong>　{n_ens} 篇，分七大類編制，談的是樂器怎麼湊在一起、以及那樣的組合出現在什麼場合。</li>
          <li><strong>{link('/sound-journey/', '聲音旅圖')}</strong>　以 Word 原稿轉成 PDF 呈現，版面與圖片位置原樣保留，可在站內以書本式翻頁閱讀。</li>
          <li><strong>{link('/vocal/', '人聲與歌唱')}</strong>　{n_vocal} 章。從發聲啟蒙、身體覺察到混聲技術與聲學研究。</li>
          <li><strong>{link('/digitalmusic/', '錄音後製')}</strong>　{n_digital} 堂。宅錄建置、麥克風、EQ 與壓縮、曲風實戰到母帶。</li>
          <li><strong>{link('/theory/', '樂理基礎')}</strong>　前言＋{n_theory} 個階段，從譜號與節拍到音調與發聲原理。</li>
          <li><strong>{link('/mandolin/', '曼陀林專區')}</strong>　{n_mandolin} 章知識庫，附各章建議學習時數。</li>
          <li><strong>{link('/guitar/', '流行吉他彈唱指南')}</strong>　{n_guitar} 章，{link('/ukulele/', '烏克麗麗')}　{n_ukulele} 章，都從挑琴調音寫到能自彈自唱。</li>
        </ul>

        <h3 style="font-size:18px;margin:1.5em 0 .5em;color:var(--ink);">可以動手的工具</h3>
        <ul class="about-index">
          <li><strong>{link('/tools/fretboard/', '世界樂器指版與和弦圖')}</strong>　19 種彈撥樂器的調弦、和弦與指版音位。</li>
          <li><strong>{link('/chord-detection/', '自動抓和弦')}</strong>　上傳音檔，在瀏覽器裡分析和弦與調性，檔案不會離開你的電腦。</li>
          <li><strong>{link('/experience/', '世界樂器體驗')}</strong>　用虛擬鍵盤試聽各種樂器的音色與音域。</li>
          <li><strong>{link('/tools/tuner/', '線上調音器與節拍器')}</strong>　用麥克風測音高與音分偏差，內建 15 種樂器調弦與節拍器。</li>
          <li><strong>{link('/tools/lrc/', 'LRC 動態歌詞工作室')}</strong>　邊聽邊打時間碼，輸出 .lrc 或 .srt。</li>
          <li><strong>{link('/tools/daw/', '織音線上編曲製作')}</strong>　免安裝的瀏覽器編曲軟體：多軌錄音、MIDI 編曲、效果器、混音、母帶與輸出。（{link('/tools/daw/guide/', '使用說明')}）</li>
        </ul>
      </div>
    </section>

    <section class="about-section">
      <h2>織音線上編曲製作</h2>
      <div class="about-text">
        <p>這是一套直接在瀏覽器裡執行的數位音訊工作站（DAW），介面參考專業編曲軟體的工作流程：上方是播放控制與小節時間顯示，中間是多軌時間軸，下方可以切換混音台、鋼琴捲簾與母帶面板。不需要安裝、不需要註冊。</p>
        <p><strong>檔案不會上傳。</strong>這個頁面的安全政策禁止連到其他任何伺服器（Content-Security-Policy 的 <code>connect-src 'self'</code>，只能讀取本站自己的程式檔），而本站是沒有後端的靜態網站，所以你的錄音、匯入的音檔與專案，在技術上就不可能離開你的電腦。專案存成 <code>.zyproj</code> 檔放在你自己的硬碟，瀏覽器另外會自動暫存一份，避免關掉分頁時遺失。</p>
        <ul class="about-index">
          <li><strong>多軌錄音與編輯</strong>　預設 16 軌，最多 32 軌；可錄麥克風、拖入本機音檔，切割、修剪、淡入淡出。</li>
          <li><strong>MIDI 編曲</strong>　鋼琴捲簾、12 種內建合成音色與鼓組；可接 MIDI 鍵盤，也能載入你自己下載的 SoundFont（.sf2）音色庫。</li>
          <li><strong>效果器</strong>　多段 EQ、壓縮、殘響、延遲、合唱、飽和度、去齒音、噪音閘，附常用預設值。</li>
          <li><strong>混音與母帶</strong>　混音台、Send 匯流排、自動化曲線；母帶處理鏈附 LUFS 響度表與一鍵最佳化。</li>
          <li><strong>人聲／伴奏分離</strong>　簡易版：利用人聲通常在正中央的特性分出人聲與伴奏，適合練唱或做卡拉 OK 伴奏。</li>
          <li><strong>輸出</strong>　WAV、FLAC、MP3、分軌 zip 與 MIDI 檔。</li>
        </ul>
        <p>建議使用桌機版 Chrome 或 Edge。瀏覽器的錄音延遲比原生軟體高，錄音時請使用有線耳機。詳細操作請看{link('/tools/daw/guide/', '使用說明')}。</p>
      </div>
    </section>

    <section class="about-section">
      <h2>內容怎麼把關</h2>
      <div class="about-text">
        <p>百科的價值在於能不能被信任，所以每一件樂器都帶著它的「履歷」：</p>
        <ul>
          <li><strong>聲學分類</strong>：以 Hornbostel–Sachs 編號標示發聲方式，不憑印象歸類。</li>
          <li><strong>查證狀態</strong>：{n_inst} 件樂器中，{v['已查證']} 件已完成查證，{v['partial']} 件部分欄位待補，{v['pending']} 件仍標為待考。標記就寫在頁面上，不把不確定的東西講得像確定的。</li>
          <li><strong>圖片授權</strong>：照片取自 Wikimedia Commons，每張圖下方標示作者與授權（CC0、CC BY、CC BY-SA 或公有領域），可點回原始檔案頁；找不到合適照片的條目寧可留白，也不放示意圖。</li>
          <li><strong>聲音示範</strong>：以真正在演奏該樂器的影片為主，教學影片與器材測試會排除。</li>
        </ul>

        <h3 style="font-size:18px;margin:1.5em 0 .5em;color:var(--ink);">AI 參與到什麼程度</h3>
        <p>我們用人工智慧協助蒐集來源、交叉比對、把生硬的資料改寫成可讀的段落，也用它來抓前後矛盾與錯字。但判斷留給人：分類對不對、這段話有沒有過度推論、這張照片是不是真的那件樂器，都還是逐條核對，查不到的就標成待考。</p>
        <p>這樣做的好處是規模，代價是錯誤一定還會有。若您在閱讀時發現任何不對勁的地方，歡迎透過{link('/contact/', '聯絡頁面')}告訴我們。</p>
      </div>
    </section>

    <section class="about-section">
      <h2>一起讓它更好</h2>
      <div class="about-text">
        <p>這個網站還在長。需要有人指正錯誤、推薦還沒收錄的樂器、提供更好的照片或演奏影片；也需要會寫、會彈、會唱的人一起把內容做深。如果您手上有一件樂器的知識，或一段真正動人的聲音，都歡迎來信。</p>
        <p>{link('/recruit/', '招募夥伴')}　·　{link('/contact/', '聯絡我們')}</p>
      </div>
    </section>

    <section class="about-section">
      <div class="about-text">
        <p style="margin-top:20px;padding:12px 18px;background:var(--accent-soft);color:var(--accent2);border-radius:3px;display:inline-block;font-weight:700;letter-spacing:.04em;">創站日期：2026 年 6 月 25 日</p>
      </div>
    </section>
    <div class="about-cta">
      <p>想認識網站背後的人？</p>
      <a class="btn-ghost" href="{resolve_url(about_path, '/about/author/')}">認識作者 →</a>
    </div>
  </div>
</main>"""
    write(about_path, page("關於世界聲音", body, about_path,
          meta_description="世界聲音是什麼：世界樂器、合奏編制、人聲、錄音、樂理與樂器教材的內容總覽，以及我們如何查證分類、標示圖片授權與說明 AI 的參與程度。"))

    author_path = OUTPUT_DIR / "about" / "author" / "index.html"
    logo = resolve_url(author_path, "/assets/brand/logo.png")
    body = f"""<main class="about-page">
  {banner_hero("About the Author", "作者・隔壁織音人", "隔壁音樂工作室 Next Door Music 的音樂團體")}
  {about_tabs(author_path, "/about/author/")}
  <div class="about-body">
    <section class="about-section">
      <h2>隔壁織音人</h2>
      <div class="about-author">
        <img class="author-logo" src="{logo}" alt="隔壁織音人 LOGO" width="256" height="180">
        <div class="author-info">
          <p>為隔壁音樂工作室 Next Door Music 的音樂團體。</p>
          <p>隔壁音樂匯聚熱愛音樂夥伴的創意單位。我們將每位合作夥伴視為珍貴的「音樂鄰居」，在此紀錄彼此的創作火花。</p>
          <p>我們致力探索音符的無限可能，打造高品質聽覺體驗，並提供專業音樂製作服務。</p>
          <p><a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">YouTube 頻道：隔壁織音人 ↗</a></p>
        </div>
      </div>
    </section>

    <section class="about-section">
      <h2>服務項目 Service</h2>
      <ul class="service-list">
        <li><span class="service-icon">🎵</span>編曲製作｜翻唱改編．風格重塑</li>
        <li><span class="service-icon">🎼</span>詞曲訂製｜原創詞曲</li>
        <li><span class="service-icon">🎚️</span>後期處理｜人聲修音．混音</li>
        <li><span class="service-icon">🎤</span>人聲錄製｜DEMO 代唱．導唱</li>
      </ul>
    </section>
    <div class="about-cta">
      <p>有音樂製作需求，或想成為我們的音樂鄰居？</p>
      <span class="about-cta-actions">
        <a class="btn-ghost" href="{resolve_url(author_path, '/about/works/')}">聽聽歷年作品</a>
        <a class="btn-wood" href="{resolve_url(author_path, '/recruit/')}">招募夥伴</a>
        <a class="btn-ghost" href="{resolve_url(author_path, '/contact/')}">聯絡我們</a>
      </span>
    </div>
  </div>
</main>"""
    write(author_path, page("作者・隔壁織音人", body, author_path,
          meta_description="隔壁織音人 — 隔壁音樂工作室 Next Door Music 的音樂團體，提供編曲製作、詞曲訂製、人聲修音混音與 DEMO 代唱服務。"))

    works_path = OUTPUT_DIR / "about" / "works" / "index.html"
    body = f"""<main class="about-page">
  {banner_hero("Discography", "歷年作品", "隔壁織音人自 2024 年起發行的專輯與單曲")}
  {about_tabs(works_path, "/about/works/")}
  <div class="about-body">
{discography_section(works_path)}
    <div class="about-cta">
      <p>喜歡我們的音樂，或有合作想法？</p>
      <span class="about-cta-actions">
        <a class="btn-wood" href="{resolve_url(works_path, '/recruit/')}">招募夥伴</a>
        <a class="btn-ghost" href="{resolve_url(works_path, '/contact/')}">聯絡我們</a>
      </span>
    </div>
  </div>
</main>"""
    write(works_path, page("歷年作品・隔壁織音人", body, works_path,
          meta_description="隔壁織音人歷年作品：療癒純音樂、兒童音樂與華語、日語流行歌曲專輯與單曲，附 Apple Music 與 YouTube Music 收聽連結。"))


def build_recruit_page():
    """/recruit/: open calls for songwriters and session vocalists."""
    path = OUTPUT_DIR / "recruit" / "index.html"
    mail = "nextdoor20250726@gmail.com"
    mailto = f"mailto:{mail}?subject=%E6%8B%9B%E5%8B%9F%E5%A0%B1%E5%90%8D"  # 招募報名
    body = f"""<main class="about-page">
  {banner_hero("Join Us", "招募夥伴", "成為隔壁的音樂鄰居——我們正在尋找詞曲創作與人聲配唱夥伴，一起把作品做出來。")}
  {about_tabs(path, "/recruit/")}
  <div class="hub-page">
    <div class="hub-grid">
      <section class="hub-card">
        <span class="hub-icon">🎼</span>
        <h2>音樂詞曲創作</h2>
        <p>為原創歌曲、翻唱改編與合作企劃撰寫詞曲。</p>
        <ul>
          <li>能獨立完成作詞、作曲，或其中之一</li>
          <li>有完成的作品 DEMO（手機錄音、簡譜、歌詞稿皆可）</li>
          <li>不限曲風：流行、民謠、搖滾、世界音樂都歡迎</li>
          <li>樂於溝通修改，能配合專案時程</li>
        </ul>
        <span class="hub-meta">遠端合作・依專案計酬或分潤</span>
      </section>
      <section class="hub-card">
        <span class="hub-icon">🎤</span>
        <h2>人聲配唱夥伴</h2>
        <p>為 DEMO、導唱、原創作品與影片配樂演唱。</p>
        <ul>
          <li>音準、節奏穩定，能依指示調整情緒與咬字</li>
          <li>具備基本自錄能力尤佳（麥克風＋錄音介面）</li>
          <li>男聲、女聲、各音域與聲線皆歡迎</li>
          <li>可接受錄音室或遠端錄音</li>
        </ul>
        <span class="hub-meta">遠端或錄音室・依專案計酬</span>
      </section>
    </div>

    <div class="about-cta recruit-how">
      <p>讀完這些資訊，有意願歡迎來信溝通。</p>
      <a class="btn-wood" href="{mailto}">✉️ {mail}</a>
    </div>
  </div>
</main>"""
    write(path, page("招募夥伴｜詞曲創作・人聲配唱", body, path,
          meta_description="隔壁織音人招募音樂詞曲創作與人聲配唱夥伴，遠端或錄音室合作，依專案計酬。透過 Email 寄送作品即可報名。"))


def build_learn_page():
    """/learn/: hub for the four course areas the 學習 menu points to."""
    path = OUTPUT_DIR / "learn" / "index.html"
    courses = [
        ("/vocal/", "🎤", "人聲與歌唱", "從發聲啟蒙、身體覺察到混聲技術，系統化的流行歌唱教學，搭配研究專欄深入聲學與製作觀點。", "初階 15 堂・進階 35 堂"),
        ("/digitalmusic/", "🎛", "錄音後製", "從宅錄建置、錄音與混音基礎，到音色雕塑、曲風實戰與母帶後期的完整課程。", "基礎 15 堂・進階 15 堂"),
        ("/theory/", "🎼", "樂理基礎", "譜號、節拍、拍號、音調、音域與發聲原理，分五個階段建立紮實的音樂理論基礎。", "前言＋五階段"),
        ("/mandolin/", "🪕", "曼陀林專區", "22 章中文曼陀林知識庫：琴型歷史、構造製琴、演奏技法、曲風合奏與專輯導聆，附學習建議時數。", f"{course_chapters('mandolin')} 章・建議約 28.5 小時"),
        ("/guitar/", "🎸", "流行吉他彈唱指南", "從挑琴、調音、看懂六線譜，到刷奏、和弦與彈唱協調，寫給零基礎成人的流行吉他彈唱教材。", f"{course_chapters('guitar')} 章・持續增補"),
        ("/ukulele/", "🎵", "烏克麗麗流行彈唱與演奏指南", "四條弦的大小事：選琴、調音、和弦家族、刷奏節奏型到指彈與打板，以華語流行歌為練習材料。", f"{course_chapters('ukulele')} 章・持續增補"),
        ("/tools/daw/learn/", "🎚️", "線上編曲製作（DAW）課程", "搭配本站的瀏覽器編曲軟體，從錄音、MIDI、混音、修音與和聲到母帶輸出，每一堂都有實際軟體截圖與原理說明。", f"{len(list((BASE_DIR / 'content' / 'dawcourse').glob('*.md')))} 堂操作課"),
    ]
    cards = "\n".join(
        f"""      <a class="hub-card" href="{resolve_url(path, href)}">
        <span class="hub-icon">{icon}</span>
        <h2>{name}</h2>
        <p>{desc}</p>
        <span class="hub-meta">{meta} →</span>
      </a>""" for href, icon, name, desc, meta in courses)
    body = f"""<main>
  {banner_hero("Learn", "學習", "人聲、錄音、樂理、曼陀林、吉他、烏克麗麗與線上編曲——挑一條路開始，按自己的節奏前進。")}
  <div class="hub-page">
    <div class="hub-grid">
{cards}
    </div>
    <p class="hub-note">每個課程都可以單獨閱讀；第一次來的話，建議從「樂理基礎」的前言開始，再依興趣進入人聲或錄音課程。</p>
  </div>
</main>"""
    write(path, page("學習", body, path,
          meta_description="世界聲音學習專區：人聲與歌唱、錄音後製、樂理基礎、曼陀林專區、流行吉他彈唱指南、烏克麗麗教學、線上編曲製作（DAW）課程。"))


def get_theory_data():
    """Stub - theory data now read from content/musictheory/*.md by build_vocal_extra.py"""
    return []


def build_theory_page():
    """Stub - theory page now generated by build_vocal_extra.py"""
    pass

def build_robots(instruments):
    """Generate robots.txt allowing all crawlers and referencing sitemap."""
    sitemap_url = f"{SITE_DOMAIN}{SITE_BASE_PATH}/sitemap.xml"
    robots_txt = "User-agent: *\nAllow: /\nSitemap: " + sitemap_url + "\n"
    write(OUTPUT_DIR / "robots.txt", robots_txt)


def build_sound_journey_pages():
    """Build the sound-journey section: index (旅圖門口), journey placeholders, and all articles page."""
    import re as _re
    sj_content_dir = BASE_DIR / "content" / "sound-journey"
    sj_output_dir = OUTPUT_DIR / "sound-journey"

    if not sj_content_dir.exists():
        return

    # --- Build index page (旅圖門口) ---
    index_md = sj_content_dir / "index.md"
    if index_md.exists():
        meta, body = parse_frontmatter(index_md.read_text(encoding="utf-8"))

        # Pre-process markdown images to HTML so they work inside div blocks
        body = _re.sub(
            r'!\[([^\]]*)\]\(([^)]+)\)',
            r'<img src="\2" alt="\1" class="journey-img" loading="lazy">',
            body,
        )

        body_html = markdown.markdown(body, extensions=["extra"], output_format="html5")

        # Copy images to output
        img_src = sj_content_dir / "images"
        img_dst = sj_output_dir / "images"
        if img_src.exists():
            if img_dst.exists():
                shutil.rmtree(str(img_dst))
            shutil.copytree(str(img_src), str(img_dst))

        page_body = f"""
        <main class="page sound-journey-page">
          <article class="journey-article">
            {body_html}
          </article>
        </main>
        """
        write(
            sj_output_dir / "index.html",
            page(
                meta.get("title", "旅圖門口"),
                page_body,
                sj_output_dir / "index.html",
                meta_description="隔壁家的世界聲音旅圖：從古老樂器到現代耳朵的聲音巡禮 — 循著聲音，走進不同文化的現場。",
            ),
        )

    # --- Build journey placeholder pages (旅圖一 ~ 旅圖六) ---
    journeys = [
        ("1", "旅圖一｜氣息離開身體", "氣息離開身體"),
        ("2", "旅圖二｜懷裡與大地的弦", "懷裡與大地的弦"),
        ("3", "旅圖三｜天空裡拉長的弦", "天空裡拉長的弦"),
        ("4", "旅圖四｜地心與手邊的微光", "地心與手邊的微光"),
        ("5", "旅圖五｜城市與星塵的節奏", "城市與星塵的節奏"),
        ("6", "旅圖六｜按鍵打開房間，眾聲走向廣場", "按鍵打開房間，眾聲走向廣場"),
    ]
    for num, title, subtitle in journeys:
        page_dir = sj_output_dir / num
        body = f"""
        <main class="page">
          <section class="compact-hero">
            <p class="eyebrow">聲音旅圖</p>
            <h1>{escape(title)}</h1>
            <p class="lead" style="font-size:1.2em;margin:1em 0;">📝 此篇章撰寫中，敬請期待</p>
            <p style="color:var(--muted);">{escape(subtitle)}</p>
            <a href="../" class="btn-back">← 回到旅圖門口</a>
          </section>
        </main>
        """
        write(
            page_dir / "index.html",
            page(
                title,
                body,
                page_dir / "index.html",
                meta_description=f"隔壁家的世界聲音旅圖 — {title}。篇章撰寫中，敬請期待。",
            ),
        )

    # --- Build "全部文章" page ---
    all_items = [
        ("../", "旅圖門口", "耳朵，可以醒來了", ""),
        ("../1/", "旅圖一｜氣息離開身體", "氣息離開身體", "更新中"),
        ("../2/", "旅圖二｜懷裡與大地的弦", "懷裡與大地的弦", "更新中"),
        ("../3/", "旅圖三｜天空裡拉長的弦", "天空裡拉長的弦", "更新中"),
        ("../4/", "旅圖四｜地心與手邊的微光", "地心與手邊的微光", "更新中"),
        ("../5/", "旅圖五｜城市與星塵的節奏", "城市與星塵的節奏", "更新中"),
        ("../6/", "旅圖六｜按鍵打開房間，眾聲走向廣場", "按鍵打開房間，眾聲走向廣場", "更新中"),
    ]
    items_html = ""
    for url, title, subtitle, status in all_items:
        status_badge = f'<span class="badge badge-cold">{escape(status)}</span>' if status else ""
        items_html += f'<a class="facet-card" href="{url}"><strong>{escape(title)}</strong><span>{escape(subtitle)}</span>{status_badge}</a>'

    body = f"""
    <main class="page">
      <section class="compact-hero">
        <p class="eyebrow">Sound Journey</p>
        <h1>全部文章</h1>
        <p class="lead">隔壁家的世界聲音旅圖 — 全部篇章一覽</p>
      </section>
      <div class="facet-grid">{items_html}</div>
    </main>
    """
    write(
        sj_output_dir / "all" / "index.html",
        page(
            "全部文章",
            body,
            meta_description="隔壁家的世界聲音旅圖全部篇章一覽 — 從氣息、弦、鼓到電子聲音，六段旅圖六種靠近世界的方式。",
        ),
    )
def build_fretboard_tool():
    """Build the interactive fretboard / chord visualizer tool at /tools/fretboard/.

    The tool is a self-contained, hand-maintained page at ``tools/fretboard/index.html``
    (repo root): it embeds its own instrument data, the validated ``CHORD_LIBRARY`` and all
    rendering JS, and is therefore the single source of truth. We copy it into the build
    output verbatim instead of regenerating it here, so the two can never drift apart.
    """
    src = BASE_DIR / "tools" / "fretboard" / "index.html"
    page_dir = OUTPUT_DIR / "tools" / "fretboard"
    page_dir.mkdir(parents=True, exist_ok=True)
    out = page_dir / "index.html"
    write(out, with_site_chrome(src.read_text(encoding="utf-8"), out))


def with_site_chrome(html, page_path):
    """Swap a hand-maintained page's header/footer for the current ones.

    Pages kept as standalone HTML (the fretboard tool) carry a frozen copy of
    the nav from whenever they were last edited; replacing it at build time
    keeps every page on the same menu.
    """
    # site_header() also emits the .site-banner div, so swallow any banners
    # left by earlier builds or they stack up one per rebuild.
    html = re.sub(r'[ 	]*<header class="site-header">.*?</header>(?:\s*<div class="site-banner"[^>]*></div>)*',
                  lambda _: site_header(page_path), html, count=1, flags=re.S)
    html = re.sub(r'[ 	]*<footer class="site-footer">.*?</footer>',
                  lambda _: site_footer(page_path), html, count=1, flags=re.S)
    refresh = resolve_url(page_path, "/assets/site-refresh.css")
    if "site-refresh.css" not in html:
        site_css = resolve_url(page_path, "/assets/site.css")
        html = html.replace(
            f'<link rel="stylesheet" href="{site_css}">',
            f'<link rel="icon" href="{resolve_url(page_path, "/assets/brand/favicon.png")}" type="image/png">\n'
            f'  <link rel="stylesheet" href="{site_css}">\n'
            f'  <link rel="stylesheet" href="{refresh}">', 1)
    return html


def build_chord_detection_tool():
    """Build the chord detection tool at /chord-detection/.

    The source is ``chord-detection/index.html`` (a self-contained page with
    inline JS). The build script wraps it with the site template (``page()``)
    so it inherits the full header, nav, footer, SEO, and theme infrastructure.
    Also ensures ``scripts/_chord_library.js`` is available in the output for runtime loading via a regular ``<script>`` tag.
    """
    src_path = BASE_DIR / "chord-detection" / "index.html"
    page_dir = OUTPUT_DIR / "chord-detection"
    page_dir.mkdir(parents=True, exist_ok=True)

    raw = src_path.read_text(encoding="utf-8")

    # Extract inline CSS
    style_m = re.search(r'<style[^>]*>(.*?)</style>', raw, re.DOTALL)
    inline_css = style_m.group(1).strip() if style_m else ""

    # Extract main content (everything between <main> and </main>)
    main_m = re.search(r'<main[^>]*>(.*?)</main>', raw, re.DOTALL)
    main_content = main_m.group(1).strip() if main_m else ""

    # Extract inline JS (the last <script> block with analysis code, ignoring src-only scripts)
    all_scripts = re.findall(r'<script>(.*?)</script>', raw, re.DOTALL)
    inline_js = all_scripts[-1].strip() if all_scripts else ""

    # Custom CSP for chord-detection (needs blob: images for the waveform/diagrams)
    chord_csp = (
        "default-src 'self'; "
        "img-src 'self' https: data: blob:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "
        "connect-src 'self'; "
        "worker-src 'self' blob:; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com; "
        "base-uri 'self'; form-action 'self'; object-src 'none'"
    )

    chord_extra_head = (
        f'<style>{inline_css}</style>\n'
        f'<script src="{resolve_url(page_dir / "index.html", "/scripts/_chord_library.js")}"></script>'
    )

    body = f'<main class="page">\n{main_content}\n</main>\n' + f'\n<script>{inline_js}</script>\n'

    write(page_dir / "index.html", page(
        "自動抓和弦",
        body,
        page_dir / "index.html",
        extra_head=chord_extra_head,
        csp=chord_csp,
        meta_description="上傳音檔，自動分析節拍與和弦，以簡譜式小節表顯示；可移調、標示 Capo、匯入 .lrc 歌詞、點小節試聽，並匯出文字或 Word。所有分析都在瀏覽器內完成。",
    ))

    # chord-detection/local-agent/ (a Python program) stays in the repo only.
    # The public page must not ask visitors to install or run anything, or
    # connect to localhost: Safe Browsing flagged the site for that pattern.

    # Ensure chord library is in output scripts/ directory
    lib_src = BASE_DIR / "scripts" / "_chord_library.js"
    lib_dst = OUTPUT_DIR / "scripts" / "_chord_library.js"
    if lib_src.exists():
        lib_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(lib_src), str(lib_dst))


def build_lrc_tool():
    """Build the LRC 動態歌詞工作室 at /tools/lrc/.

    Source is ``lrc-studio/index.html`` — a self-contained page with inline CSS
    and JS. Like the chord-detection tool, only the ``<style>``, the ``<main>``
    contents and the inline ``<script>`` are lifted out of it; header, nav,
    footer, SEO and the theme switcher all come from ``page()``, so the nav can
    never drift away from the rest of the site.
    """
    src_path = BASE_DIR / "lrc-studio" / "index.html"
    page_dir = OUTPUT_DIR / "tools" / "lrc"
    page_dir.mkdir(parents=True, exist_ok=True)

    raw = src_path.read_text(encoding="utf-8")

    style_m = re.search(r'<style[^>]*>(.*?)</style>', raw, re.DOTALL)
    inline_css = style_m.group(1).strip() if style_m else ""

    # 抓「最後一個」<main>：CSS 或文字裡若出現 <main> 字樣，非貪婪的 search
    # 會從那裡開始吞，整份文件就被塞進頁面裡了。
    opening = list(re.finditer(r'<main[^>]*>', raw))
    main_content = ""
    if opening:
        start = opening[-1].end()
        end = raw.find('</main>', start)
        if end > start:
            main_content = raw[start:end].strip()

    # 來源檔放在 /lrc-studio/，但成品在 /tools/lrc/，所以「相關工具」的相對連結要重算
    for target in ("/tools/fretboard/", "/chord-detection/", "/experience/", "/tools/daw/"):
        main_content = main_content.replace(
            f'href="..{target}"',
            f'href="{resolve_url(page_dir / "index.html", target)}"',
        )

    scripts = re.findall(r'<script>(.*?)</script>', raw, re.DOTALL)
    inline_js = scripts[-1].strip() if scripts else ""

    # <audio> plays a local file through an object URL, so media-src needs blob:.
    # 'wasm-unsafe-eval' 是編譯 WebAssembly 必需的（選用的人聲模型），
    # 它只允許編譯 wasm，不會像 'unsafe-eval' 那樣開放 JS eval。
    lrc_csp = (
        "default-src 'self'; "
        "img-src 'self' https: data: blob:; "
        "media-src 'self' blob:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "
        "connect-src 'self'; "
        "worker-src 'self' blob:; "
        "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com; "
        "base-uri 'self'; form-action 'self'; object-src 'none'"
    )

    body = f'<main class="page">\n{main_content}\n</main>\n<script>\n{inline_js}\n</script>\n'
    write(page_dir / "index.html", page(
        "LRC 動態歌詞工作室",
        body,
        page_dir / "index.html",
        extra_head=f"<style>{inline_css}</style>",
        csp=lrc_csp,
        meta_description="貼上歌詞、載入音檔，一邊播放一邊按下時間碼，輸出 .lrc 或 .srt。內建音量斷點偵測，會先找出句與句之間的停頓自動排好初稿；音檔只在瀏覽器本機解碼，不會上傳。",
        meta_keywords="LRC,動態歌詞,歌詞製作,時間碼,歌詞同步,字幕製作,SRT,歌詞工具",
    ))


def build_tuner_tool():
    """Build 線上調音器與節拍器 at /tools/tuner/.

    Source is ``tuner-studio/index.html`` — a self-contained page with inline
    CSS and JS, same shape as the LRC studio. Only the ``<style>``, the
    ``<main>`` contents and the inline ``<script>`` are lifted out; header,
    nav, footer, SEO and the theme switcher all come from ``page()``.

    The microphone stays in the browser: the audio never leaves the page and
    the default CSP (``connect-src 'self'``) keeps it that way.

    Trap: the extractor takes the *last* ``<script>`` match, so the source
    file must not contain the literal tag text inside a comment — that has
    already swallowed the whole page once.
    """
    src_path = BASE_DIR / "tuner-studio" / "index.html"
    if not src_path.exists():
        return
    page_dir = OUTPUT_DIR / "tools" / "tuner"
    page_dir.mkdir(parents=True, exist_ok=True)
    out = page_dir / "index.html"

    raw = src_path.read_text(encoding="utf-8")

    style_m = re.search(r'<style[^>]*>(.*?)</style>', raw, re.DOTALL)
    inline_css = style_m.group(1).strip() if style_m else ""

    opening = list(re.finditer(r'<main[^>]*>', raw))
    main_content = ""
    if opening:
        start = opening[-1].end()
        end = raw.find("</main>", start)
        if end > start:
            main_content = raw[start:end].strip()

    # 來源檔在 /tuner-studio/，成品在 /tools/tuner/，主內容裡的相對連結要重算
    for target in ("/tools/fretboard/", "/tools/daw/", "/chord-detection/",
                   "/theory/", "/tools/lrc/", "/experience/"):
        main_content = main_content.replace(
            f'href="..{target}"', f'href="{resolve_url(out, target)}"')

    scripts = re.findall(r'<script>(.*?)</script>', raw, re.DOTALL)
    inline_js = scripts[-1].strip() if scripts else ""

    body = f'<main class="page">\n{main_content}\n</main>\n<script>\n{inline_js}\n</script>\n'
    write(out, page(
        "線上調音器與節拍器",
        body,
        out,
        extra_head=f"<style>{inline_css}</style>",
        meta_description="用麥克風即時顯示音高與音分偏差，內建吉他、烏克麗麗、貝斯、小提琴、二胡、琵琶等 15 種樂器調弦，可播參考音，附節拍器。聲音只在瀏覽器裡分析，不會上傳。",
        meta_keywords="線上調音器,調音器,節拍器,吉他調音,烏克麗麗調音,小提琴調音,二胡調音,音準,音分,cent,BPM,拍速",
    ))


def build_daw_tool():
    """Build 織音線上編曲製作 (browser DAW) at /tools/daw/.

    Unlike the other tools this page is NOT wrapped with ``page()``: a DAW
    needs the whole viewport, so it ships as a full-screen app with its own
    ``<head>``. The source dir ``daw-studio/`` (index.html + daw.css + js/
    ES modules) is copied as-is; only the ``../`` links, which are relative
    to the source dir, are rewritten for the deeper /tools/daw/ location.

    Its CSP is ``connect-src 'self'`` + ``'wasm-unsafe-eval'`` — the page can
    only read this static site's own files (the ONNX Runtime engine for the
    opt-in Demucs separation) and cannot reach any other server, which is what
    backs the "不上傳雲端" promise on the page. The 172 MB model is downloaded
    by the user's browser via a plain link and handed to the page as a file.
    """
    src_dir = BASE_DIR / "daw-studio"
    if not src_dir.exists():
        return
    page_dir = OUTPUT_DIR / "tools" / "daw"
    if page_dir.exists():
        shutil.rmtree(page_dir)
    # 底線開頭的是本機測試頁（_selftest*.html 等），GUIDE.md 會另外轉成說明頁，都不原樣發佈
    shutil.copytree(str(src_dir), str(page_dir), ignore=shutil.ignore_patterns("_*", "*.md"))
    out = page_dir / "index.html"
    html = (src_dir / "index.html").read_text(encoding="utf-8")
    for attr in ("href", "src"):
        html = html.replace(f'{attr}="../assets/', f'{attr}="{resolve_url(out, "/assets/").rstrip("/")}/')
    html = html.replace('href="../"', f'href="{resolve_url(out, "/")}"')
    html = html.replace("<!--CANONICAL-->", f'<link rel="canonical" href="{canonical_for(out)}">')
    write(out, html)

    # 使用說明：一般網站頁面（有導覽列，能回首頁）
    guide_md = src_dir / "GUIDE.md"
    if guide_md.exists():
        gout = page_dir / "guide" / "index.html"
        md = guide_md.read_text(encoding="utf-8")
        # 第一行標題交給頁首 hero，內文從第二段開始
        md = re.sub(r"^# .*\n", "", md, count=1)
        md_html = markdown.markdown(md, extensions=["extra", "tables", "toc"], output_format="html5")
        # 「開啟工具」那個連結在 Markdown 裡寫成 ../，指向 /tools/daw/
        md_html = md_html.replace('href="../"', f'href="{resolve_url(gout, "/tools/daw/")}"')
        toc = "".join(
            f'<a href="#{m.group(1)}">{m.group(2)}</a>'
            for m in re.finditer(r'<h2 id="([^"]+)">(.*?)</h2>', md_html)
        )
        body = f"""<main class="page daw-guide">
  <section class="hero" style="padding-bottom:12px">
    <p class="eyebrow">Tools · Browser DAW</p>
    <h1>織音線上編曲製作　使用說明</h1>
    <p class="lead">免安裝的瀏覽器編曲軟體：多軌錄音、MIDI 編曲、效果器、混音、母帶與輸出。所有音訊只在你的電腦上處理。</p>
    <p><a class="btn btn-primary" href="{resolve_url(gout, '/tools/daw/')}">開啟織音線上編曲製作 →</a>
       <a class="btn" href="{resolve_url(gout, '/tools/')}">全部工具</a></p>
  </section>
  <div class="daw-guide-wrap">
    <nav class="daw-guide-toc" aria-label="目錄">{toc}</nav>
    <article class="daw-guide-body">{md_html}</article>
  </div>
</main>"""
        css = """<style>
.daw-guide-wrap{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;align-items:start;margin:8px 0 48px}
.daw-guide-toc{position:sticky;top:84px;display:flex;flex-direction:column;gap:2px;font-size:14px;border-left:2px solid var(--line,#e5e0d8);padding-left:12px}
.daw-guide-toc a{color:var(--muted,#6b6257);text-decoration:none;padding:3px 0}
.daw-guide-toc a:hover{color:var(--accent,#a0522d)}
.daw-guide-body{max-width:820px;line-height:1.85}
.daw-guide-body h2{margin-top:2.2em;padding-top:.4em;border-top:1px solid var(--line,#e5e0d8)}
.daw-guide-body h2:first-child{border-top:0;margin-top:0}
.daw-guide-body table{width:100%;border-collapse:collapse;margin:1em 0;font-size:15px}
.daw-guide-body th,.daw-guide-body td{border:1px solid var(--line,#e5e0d8);padding:7px 10px;text-align:left;vertical-align:top}
.daw-guide-body th{background:var(--paper-2,#f6f2ec)}
.daw-guide-body code{background:var(--paper-2,#f3efe8);padding:1px 5px;border-radius:4px;font-size:.92em}
.daw-guide-body blockquote{margin:1em 0;padding:8px 14px;border-left:3px solid var(--accent,#a0522d);background:var(--paper-2,#f8f4ee)}
@media (max-width:900px){.daw-guide-wrap{grid-template-columns:1fr}.daw-guide-toc{position:static;flex-direction:row;flex-wrap:wrap;gap:4px 12px;border-left:0;padding-left:0}}
</style>"""
        build_daw_course(page_dir)
        write(gout, page(
            "織音線上編曲製作　使用說明", body, gout, extra_head=css,
            meta_description="織音線上編曲製作的完整使用說明：錄音、MIDI 編曲、SoundFont 音色庫、效果器（EQ、壓縮、去齒音、飽和度）、混音、自動化、人聲伴奏分離、母帶與輸出。",
            meta_keywords="DAW,線上編曲,瀏覽器編曲,錄音軟體,混音,母帶,LUFS,MIDI,SoundFont,人聲分離",
        ))


# 全站工具清單：/tools/ 總覽頁與各工具頁的「相關工具」都用這一份，新增工具只要改這裡
TOOLS = [
    ("/tools/daw/", "🎚️", "織音線上編曲製作", "", "免安裝的瀏覽器編曲軟體：16 軌起跳的多軌錄音、MIDI 編曲與音色庫、效果器、混音、母帶與輸出 WAV／FLAC／MP3。檔案不會上傳。", "/tools/daw/guide/"),
    ("/chord-detection/", "🎼", "自動抓和弦", "", "上傳音檔自動分析節拍與和弦，簡譜式小節表可移調、標示 Capo、匯入 .lrc 歌詞。", "/chord-detection/guide/"),
    ("/tools/tuner/", "🎯", "線上調音器與節拍器", "", "麥克風即時測音高與音分偏差，內建 15 種樂器調弦與參考音，右欄還有節拍器。", "/tools/tuner/guide/"),
    ("/tools/lrc/", "📝", "LRC 動態歌詞工作室", "", "邊聽邊打時間碼，自動偵測句與句的停頓先排好初稿，輸出 .lrc 或 .srt。", "/tools/lrc/guide/"),
    ("/tools/fretboard/", "🎸", "世界樂器指版與和弦圖", "", "19 種彈撥樂器的調弦法、各調性和弦、指版音位圖與順階和弦。", "/tools/fretboard/guide/"),
]


TOOL_GUIDES = [
    ("fretboard", "/tools/fretboard/", "世界樂器指版與和弦圖", "Fretboard & Chord Charts",
     "19 種彈撥樂器的調弦、和弦與指版音位，全部在瀏覽器裡算。"),
    ("chord-detection", "/chord-detection/", "自動抓和弦", "Chord Detection",
     "上傳音檔，自動分析節拍與和弦，整理成可移調的簡譜小節表。"),
    ("lrc", "/tools/lrc/", "LRC 動態歌詞工作室", "LRC Lyrics Studio",
     "邊聽邊打時間碼，輸出 .lrc 或 .srt。"),
    ("tuner", "/tools/tuner/", "線上調音器與節拍器", "Tuner & Metronome",
     "麥克風即時測音高與音分偏差，15 種樂器調弦、參考音與節拍器。"),
]


def build_tool_guides():
    """使用說明頁：content/tool-guides/<slug>.md → <工具>/guide/"""
    css = """<style>
.guide-wrap{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;align-items:start;margin:8px 0 48px}
.guide-toc{position:sticky;top:84px;display:flex;flex-direction:column;gap:2px;font-size:14px;border-left:2px solid var(--line,#e5e0d8);padding-left:12px}
.guide-toc a{color:var(--muted,#6b6257);text-decoration:none;padding:3px 0}
.guide-toc a:hover{color:var(--accent,#a0522d)}
.guide-body{max-width:820px;line-height:1.85}
.guide-body h2{margin-top:2.2em;padding-top:.4em;border-top:1px solid var(--line,#e5e0d8)}
.guide-body h2:first-child{border-top:0;margin-top:0}
.guide-body table{width:100%;border-collapse:collapse;margin:1em 0}
.guide-body th,.guide-body td{border:1px solid var(--line,#e5e0d8);padding:7px 10px;text-align:left;vertical-align:top}
.guide-body th{background:var(--soft,#f4efe6)}
@media (max-width:820px){.guide-wrap{grid-template-columns:1fr}.guide-toc{position:static;border-left:0;border-top:1px solid var(--line,#e5e0d8);padding:8px 0 0}}
</style>"""
    built = 0
    for slug, tool_path, name, eyebrow, lead in TOOL_GUIDES:
        src = BASE_DIR / "content" / "tool-guides" / f"{slug}.md"
        if not src.exists():
            continue
        out = OUTPUT_DIR / tool_path.strip("/") / "guide" / "index.html"
        md = src.read_text(encoding="utf-8")
        md = re.sub(r"^# .*\n", "", md, count=1)   # 標題交給頁首
        md_html = markdown.markdown(md, extensions=["extra", "tables", "toc"], output_format="html5")
        toc = "".join(f'<a href="#{m.group(1)}">{m.group(2)}</a>'
                      for m in re.finditer(r'<h2 id="([^"]+)">(.*?)</h2>', md_html))
        body = f"""<main class="page">
  <section class="hero" style="padding-bottom:12px">
    <p class="eyebrow">Tools · {escape(eyebrow)}</p>
    <h1>{escape(name)}　使用說明</h1>
    <p class="lead">{escape(lead)}</p>
    <p><a class="btn btn-primary" href="{resolve_url(out, tool_path)}">開啟{escape(name)} →</a>
       <a class="btn" href="{resolve_url(out, '/tools/')}">全部工具</a></p>
  </section>
  <div class="guide-wrap">
    <nav class="guide-toc" aria-label="目錄">{toc}</nav>
    <article class="guide-body">{md_html}</article>
  </div>
</main>{css}"""
        write(out, page(f"{name}　使用說明", body, out,
                        meta_description=f"{name}怎麼用：{lead} 這頁說明操作步驟、參數意義與常見問題。",
                        jsonld_extra=page_jsonld("TechArticle", f"{name} 使用說明", lead,
                                                 canonical_for(out))))
        built += 1
    print(f"  tool guides: {built}")


def build_daw_course(daw_dir: Path) -> None:
    """20 堂 DAW 課程：/tools/daw/learn/。

    原始內容在 content/dawcourse/NN.md（frontmatter: title / summary / image），
    截圖在 assets/daw-course/。每頁都有上一堂／下一堂與「打開軟體」的連結。
    """
    src = BASE_DIR / "content" / "dawcourse"
    if not src.exists():
        return
    files = sorted(src.glob("*.md"))
    if not files:
        return
    lessons = []
    for f in files:
        raw = f.read_text(encoding="utf-8")
        NL = chr(10)
        meta, body_md = "", raw
        if raw.startswith("---" + NL):
            parts = raw[4:].split(NL + "---" + NL, 1)
            if len(parts) == 2:
                meta, body_md = parts[0], parts[1]

        def field(key):
            for line in meta.split(NL):
                if line.startswith(key + ":"):
                    return line.split(":", 1)[1].strip()
            return ""
        lessons.append({"no": f.stem, "title": field("title"), "summary": field("summary"),
                        "image": field("image"), "md": body_md})
    out_dir = daw_dir / "learn"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    css = """<style>
.dawc-wrap{max-width:860px;margin:0 auto;line-height:1.9}
.dawc-hero{margin:8px 0 24px}
.dawc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin:24px 0 48px}
.dawc-card{display:block;border:1px solid var(--line,#e5e0d8);border-radius:12px;padding:14px 16px;text-decoration:none;color:inherit;background:var(--paper,#fff);transition:.15s}
.dawc-card:hover{border-color:var(--accent,#a0522d);transform:translateY(-2px)}
.dawc-card b{display:block;font-size:15px;margin-bottom:4px}
.dawc-card span{color:var(--muted,#6b6257);font-size:13px;line-height:1.6}
.dawc-card em{display:block;font-style:normal;font-size:11px;color:var(--accent,#a0522d);letter-spacing:.08em;margin-bottom:6px}
.dawc-shot{margin:18px 0 8px;border:1px solid var(--line,#e5e0d8);border-radius:12px;overflow:hidden;background:#0c0d11}
.dawc-shot img{display:block;width:100%;height:auto}
.dawc-shot figcaption{font-size:12px;color:var(--muted,#6b6257);padding:8px 12px;background:var(--paper-2,#f6f2ec)}
.dawc-nav{display:flex;justify-content:space-between;gap:12px;margin:36px 0 8px;border-top:1px solid var(--line,#e5e0d8);padding-top:16px}
.dawc-nav a{text-decoration:none;color:var(--accent,#a0522d)}
.daw-tip{border-left:3px solid var(--accent,#a0522d);background:var(--paper-2,#f8f4ee);padding:10px 14px;border-radius:0 8px 8px 0;margin:1.2em 0}
</style>"""

    # 目錄頁
    def lesson_url(base_dir, no):
        return resolve_url(base_dir, "/tools/daw/learn/" + no + "/")

    cards = "".join(
        '<a class="dawc-card" href="' + lesson_url(out_dir / "index.html", l["no"]) + '">'
        + '<em>第 ' + str(int(l["no"])) + ' 堂</em><b>' + l["title"].split("：", 1)[-1] + '</b><span>' + l["summary"] + '</span></a>'
        for l in lessons)
    tool_url = resolve_url(out_dir / "index.html", "/tools/daw/?demo=1")
    guide_url = resolve_url(out_dir / "index.html", "/tools/daw/guide/")
    index_body = (
        '<main class="page"><div class="dawc-wrap">'
        '<section class="dawc-hero">'
        '<p class="eyebrow">Tools · Browser DAW</p>'
        '<h1>織音線上編曲製作　20 堂課</h1>'
        '<p class="lead">從看懂畫面到母帶輸出，一堂一個主題，配實際操作截圖與「為什麼」的原理說明。邊看邊開軟體跟著做最快。</p>'
        f'<p><a class="btn btn-primary" href="{tool_url}">開啟軟體（載入示範專案）→</a> '
        f'<a class="btn" href="{guide_url}">功能說明書</a></p>'
        '</section>'
        f'<div class="dawc-grid">{cards}</div>'
        '</div></main>')
    write(out_dir / "index.html", page("織音線上編曲製作　20 堂課",
        index_body, out_dir / "index.html", extra_head=css,
        meta_description="織音線上編曲製作的 20 堂課程：畫面總覽、專案與存檔、錄音、MIDI、和弦軌、自動伴奏、EQ、壓縮、人聲修音、和聲、空間效果、混音、自動化、母帶與輸出。",
        meta_keywords="DAW,編曲教學,錄音教學,混音教學,母帶,MIDI,人聲修音"))

    # 各堂
    for i, l in enumerate(lessons):
        d = out_dir / l["no"]
        d.mkdir(parents=True, exist_ok=True)
        html_md = markdown.markdown(l["md"], extensions=["extra", "tables"])
        img = ""
        if l["image"]:
            src_img = resolve_url(d / "index.html", l["image"])
            img = ('<figure class="dawc-shot"><img src="' + src_img + '" alt="' + l["title"] + '" loading="lazy">'
                   '<figcaption>' + l["summary"] + '</figcaption></figure>')
        prev_l = lessons[i - 1] if i else None
        next_l = lessons[i + 1] if i + 1 < len(lessons) else None
        nav = '<nav class="dawc-nav">'
        if prev_l:
            nav += '<a href="' + lesson_url(d / "index.html", prev_l["no"]) + '">← 第 ' + str(int(prev_l["no"])) + ' 堂</a>'
        else:
            nav += '<span></span>'
        if next_l:
            nav += '<a href="' + lesson_url(d / "index.html", next_l["no"]) + '">第 ' + str(int(next_l["no"])) + ' 堂 →</a>'
        else:
            nav += '<a href="' + resolve_url(d / "index.html", "/tools/daw/learn/") + '">回課程目錄</a>'
        nav += '</nav>'
        back_url = resolve_url(d / "index.html", "/tools/daw/learn/")
        go_url = resolve_url(d / "index.html", "/tools/daw/?demo=1")
        body = (
            '<main class="page"><div class="dawc-wrap">'
            '<section class="dawc-hero">'
            f'<p class="eyebrow"><a href="{back_url}" style="text-decoration:none">20 堂課</a> · 第 {int(l["no"])} 堂</p>'
            f'<h1>{l["title"]}</h1>'
            f'<p class="lead">{l["summary"]}</p>'
            f'<p><a class="btn btn-primary" href="{go_url}">邊看邊做 →</a></p>'
            '</section>'
            + img +
            f'<article class="dawc-body">{html_md}</article>'
            + nav +
            '</div></main>')
        write(d / "index.html", page(f'{l["title"]}｜織音線上編曲製作', body, d / "index.html",
            extra_head=css, meta_description=l["summary"],
            meta_keywords="DAW,編曲,錄音,混音,MIDI,教學"))


def build_tools_index():
    """/tools/ — 全部工具的總覽頁（導覽列「工具」連到這裡）。"""
    out = OUTPUT_DIR / "tools" / "index.html"
    cards = []
    for href, icon, name, badge, desc, guide in TOOLS:
        extra = f'<a class="tool-guide" href="{resolve_url(out, guide)}">使用說明</a>' if guide else ""
        cards.append(f"""<div class="tool-card">
      <a class="tool-main" href="{resolve_url(out, href)}">
        <span class="tool-icon">{icon}</span>
        <strong>{name}{f' <span class="tool-badge">{badge}</span>' if badge else ''}</strong>
        <span class="tool-desc">{desc}</span>
      </a>{extra}
    </div>""")
    body = f"""<main class="page">
  <section class="hero" style="padding-bottom:8px">
    <p class="eyebrow">Tools</p>
    <h1>工具</h1>
    <p class="lead">可以直接在瀏覽器裡動手的音樂工具。全部在你的電腦上執行，音檔不會上傳。</p>
  </section>
  <section class="tool-grid">
    {''.join(cards)}
  </section>
</main>"""
    css = """<style>
.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin:12px 0 56px}
.tool-card{border:1px solid var(--line,#e5e0d8);border-radius:12px;background:var(--paper,#fff);display:flex;flex-direction:column;overflow:hidden;transition:box-shadow .15s,transform .15s}
.tool-card:hover{box-shadow:0 8px 24px rgba(60,40,20,.10);transform:translateY(-2px)}
.tool-main{display:flex;flex-direction:column;gap:8px;padding:20px;color:inherit;text-decoration:none;flex:1}
.tool-icon{font-size:30px;line-height:1}
.tool-main strong{font-size:18px}
.tool-badge{font-size:11px;font-weight:600;border:1px solid currentColor;border-radius:999px;padding:0 7px;margin-left:4px;opacity:.7;vertical-align:2px}
.tool-desc{color:var(--muted,#6b6257);line-height:1.7;font-size:14.5px}
.tool-guide{border-top:1px solid var(--line,#e5e0d8);padding:10px 20px;font-size:14px;text-decoration:none}
</style>"""
    write(out, page("工具", body, out, extra_head=css,
                    meta_description="世界聲音的線上音樂工具：瀏覽器編曲軟體、自動抓和弦、LRC 歌詞工作室、指版和弦圖、樂器體驗。全部在瀏覽器裡執行，檔案不上傳。"))


def build_experience_page():
    """/tools/experience/ is the old address of 世界樂器體驗; redirect it to /experience/.

    The page itself (virtual keyboard) is written by build_vocal_extra.py at /experience/.
    """
    out = OUTPUT_DIR / "tools" / "experience" / "index.html"
    target = resolve_url(out, "/experience/")
    write(out, f'''<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={target}"><link rel="canonical" href="{canonical_for(OUTPUT_DIR / "experience" / "index.html")}"><meta name="robots" content="noindex"><title>世界樂器體驗</title></head>
<body><a href="{target}">前往世界樂器體驗</a></body>
</html>''')


def main():
    global _TOTAL_INSTRUMENTS
    instruments = read_instruments()
    _TOTAL_INSTRUMENTS = len(instruments)
    # nav subcategory links must come from real data, not a hard-coded list
    set_nav_subcategories(instruments)
    if OUTPUT_DIR.exists():
        def on_rm_error(func, path, exc_info):
            pass
        shutil.rmtree(OUTPUT_DIR, onerror=on_rm_error)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_assets(instruments)
    build_index(instruments)
    build_map_page(instruments)
    build_about_page()
    build_recruit_page()
    build_learn_page()
    build_sound_journey_pages()
    build_theory_page()
    build_manager_page(instruments)
    build_detail_pages(instruments)
    build_special_pages(instruments)
    build_instruments_list_page(instruments)
    build_category_detail_pages(instruments)
    build_ensemble_pages()
    build_facet_pages(instruments, "subcategory", "subcategories", "子分類")
    build_facet_pages(instruments, "country", "countries", "國家/地區")
    build_404(instruments)
    build_tool_guides()
    build_music_player()
    build_sitemap(instruments)
    build_robots(instruments)
    build_fretboard_tool()
    build_chord_detection_tool()
    build_lrc_tool()
    build_tuner_tool()
    build_daw_tool()
    build_tools_index()
    build_experience_page()
    # Copy sitemap and robots.txt to project root for local development
    shutil.copy2(OUTPUT_DIR / "sitemap.xml", BASE_DIR / "sitemap.xml")
    shutil.copy2(OUTPUT_DIR / "robots.txt", BASE_DIR / "robots.txt")
    # Copy root-level pages (index, 404, search-index) to project root
    for root_fname in ["index.html", "404.html", "search-index.json"]:
        src_root = OUTPUT_DIR / root_fname
        if src_root.exists():
            shutil.copy2(str(src_root), str(BASE_DIR / root_fname))
    # Mirror generated tool pages to the project root. Never rmtree root tools/:
    # tools/fretboard/index.html there is the hand-maintained source.
    for sync_dir in ["tools/experience", "experience"]:
        src_dir = OUTPUT_DIR / sync_dir
        if src_dir.exists():
            shutil.copytree(str(src_dir), str(BASE_DIR / sync_dir), dirs_exist_ok=True)
    # Sync assets to project root (tracked by git for direct access)
    root_assets = BASE_DIR / "assets"
    root_assets.mkdir(parents=True, exist_ok=True)
    out_assets = OUTPUT_DIR / "assets"
    if out_assets.exists():
        for fname in ["instruments_database.xlsx", "site.css", "site-refresh.css", "search.js",
                       "random-instrument.js", "map-data.json"]:
            src = out_assets / fname
            if src.exists():
                shutil.copy2(str(src), str(root_assets / fname))
        # brand + mandolin asset trees live in assets/ already; only mirror
        # them under outputs so the deployed site serves them
        for sub in ("brand", os.path.join("mandolin", "img")):
            src = out_assets / sub
            if src.exists():
                shutil.copytree(str(src), str(root_assets / sub), dirs_exist_ok=True)
    # Copy the bundled CJK serif so @font-face in site-refresh.css resolves
    font_src = BASE_DIR / "fonts"
    if font_src.exists():
        shutil.copytree(str(font_src), str(OUTPUT_DIR / "fonts"), dirs_exist_ok=True)
    # Brand artwork (logo mark, favicon, banner)
    brand_src = BASE_DIR / "assets" / "brand"
    if brand_src.exists():
        shutil.copytree(str(brand_src), str(OUTPUT_DIR / "assets" / "brand"), dirs_exist_ok=True)
    # Vocal course diagrams
    vocal_img = BASE_DIR / "assets" / "vocal"
    if vocal_img.exists():
        shutil.copytree(str(vocal_img), str(OUTPUT_DIR / "assets" / "vocal"), dirs_exist_ok=True)
    guitar_img = BASE_DIR / "assets" / "guitar"
    if guitar_img.exists():
        shutil.copytree(str(guitar_img), str(OUTPUT_DIR / "assets" / "guitar"), dirs_exist_ok=True)
    # Ukulele course diagrams (used by content/ukulele/*.md via ../../assets/ukulele/)
    ukulele_img = BASE_DIR / "assets" / "ukulele"
    if ukulele_img.exists():
        shutil.copytree(str(ukulele_img), str(OUTPUT_DIR / "assets" / "ukulele"), dirs_exist_ok=True)
    # Recording / mixing course diagrams
    dm_img = BASE_DIR / "assets" / "digitalmusic"
    if dm_img.exists():
        shutil.copytree(str(dm_img), str(OUTPUT_DIR / "assets" / "digitalmusic"), dirs_exist_ok=True)
    # Theory course diagrams (content/musictheory/*.md → /assets/theory/*.svg)
    theory_img = BASE_DIR / "assets" / "theory"
    if theory_img.exists():
        shutil.copytree(str(theory_img), str(OUTPUT_DIR / "assets" / "theory"), dirs_exist_ok=True)
    # DAW 課程截圖
    dawcourse_img = BASE_DIR / "assets" / "daw-course"
    if dawcourse_img.exists():
        shutil.copytree(str(dawcourse_img), str(OUTPUT_DIR / "assets" / "daw-course"), dirs_exist_ok=True)
    # Mandolin book images
    mand_img = BASE_DIR / "assets" / "mandolin" / "img"
    if mand_img.exists():
        shutil.copytree(str(mand_img), str(OUTPUT_DIR / "assets" / "mandolin" / "img"), dirs_exist_ok=True)
    # Instrument photos that could not come from Commons (CC-licensed, resized
    # to WebP here so the page never hot-links a third-party host)
    inst_img = BASE_DIR / "assets" / "instruments"
    if inst_img.exists():
        shutil.copytree(str(inst_img), str(OUTPUT_DIR / "assets" / "instruments"), dirs_exist_ok=True)
    # Self-hosted third-party JS (Leaflet, SheetJS, JSZip, html2canvas, jsPDF, Meyda);
    # the CSP allows no CDN origins, so these must ship with the site
    vendor_src = BASE_DIR / "assets" / "vendor"
    if vendor_src.exists():
        shutil.copytree(str(vendor_src), str(OUTPUT_DIR / "assets" / "vendor"), dirs_exist_ok=True)
    write(OUTPUT_DIR / ".nojekyll", "")
    # Copy Google Search Console verification file to output root
    gsc_file = BASE_DIR / "googled81b331c3a5b66a0.html"
    if gsc_file.exists():
        shutil.copy2(gsc_file, OUTPUT_DIR / "googled81b331c3a5b66a0.html")
    print(f"Built {len(instruments)} instruments into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
