#!/usr/bin/env python
"""Post-build script: generates portal homepage, vocal pages, and contact page.
Runs AFTER build_static_site.py to add/overwrite pages in the output directory."""
import json
import markdown
import os
import random
import re
import sys
from collections import Counter, defaultdict
from html import escape
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content"
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


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def read_instruments():
    """Read instrument data from content/instruments/*.md frontmatter."""
    instruments = []
    for path in sorted((CONTENT_DIR / "instruments").glob("*.md")):
        text = path.read_text(encoding="utf-8")
        meta = {}
        if text.startswith("---\n"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                for line in parts[1].strip().split("\n"):
                    if ":" in line:
                        k, v = line.split(":", 1)
                        meta[k.strip()] = v.strip().strip('"')
        instruments.append({
            "slug": path.stem,
            "title": meta.get("title", path.stem),
            "original_name": meta.get("original_name", ""),
            "category": meta.get("category", "其他"),
            "country": meta.get("country", ""),
            "era": meta.get("era", ""),
            "image": meta.get("image", ""),
            "is_popular": meta.get("is_popular", "").lower() == "true",
            "is_uncommon": meta.get("is_uncommon", "").lower() == "true",
        })
    return instruments


def markdown_to_html(md_text):
    raw = markdown.markdown(md_text, extensions=["extra", "toc", "tables", "fenced_code", "nl2br"], output_format="html5")
    # Remove wiki links
    raw = re.sub(r'<a\b[^>]*href=["\'](?:https?://)?(?:[^/]+\.)?(?:wikipedia|wikidata|wikimedia)\.org[^"\']*["\'][^>]*>(.*?)</a>', r'\1', raw, flags=re.IGNORECASE | re.DOTALL)
    return raw


def page(title, body, page_path=None, extra_head="", meta_description="", og_image=""):
    desc = meta_description or "世界聲音百科 by 隔壁織音人 — 收錄世界各國樂器、人聲歌唱教學、錄音後製知識與基礎樂理。從傳統民族樂器到現代電子樂器，提供樂器介紹、聆賞示範、演奏教學與文化背景。循著聲音，走進不同文化的現場。"
    csp = ("default-src 'self'; img-src 'self' https: data:; "
           "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com; "
           "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://busuanzi.ibruce.info https://pagead2.googlesyndication.com; "
           "connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; "
           "base-uri 'self'; form-action 'none'; object-src 'none'")
    raw_canon = resolve_url(page_path, "/") if page_path else "/"
    clean_canon = raw_canon.replace("./", "/").replace("../", "/").rstrip("/") or "/"
    canonical = f"https://soundweavers-music.github.io{clean_canon}".rstrip(".")
    og_img = og_image or "https://yt3.googleusercontent.com/6nBZ7RVoXGMH2fuMPWiju_tpAET9D-qVkOhg1HjGqh8m9EaO-u9wO_oHVA12Sy0DzoKn7mGVmA=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj"
    jsonld = f'''{{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "世界聲音百科",
  "alternateName": "World Sound Encyclopedia",
  "url": "https://soundweavers-music.github.io/",
  "description": "{escape(desc)}",
  "author": {{
    "@type": "Person",
    "name": "隔壁織音人",
    "url": "https://www.youtube.com/@NextDoorSoundWeavers/"
  }},
  "potentialAction": {{
    "@type": "SearchAction",
    "target": {{
      "@type": "EntryPoint",
      "urlTemplate": "https://soundweavers-music.github.io/?q={{search_term_string}}"
    }},
    "query-input": "required name=search_term_string"
  }},
  "sameAs": [
    "https://www.youtube.com/@NextDoorSoundWeavers/"
  ]
}}'''
    _dm_head = '<script>!function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t);else document.documentElement.setAttribute("data-theme","nextdoor")}catch(e){}}()</script>'
    _dm_foot = '<script>(function(){var t=document.getElementById("theme-toggle"),d=document.documentElement;var I={nextdoor:"🎋",light:"🌤",dark:"🌙"};function s(m){d.setAttribute("data-theme",m);if(t)t.textContent=I[m]||"🎋";try{localStorage.setItem("theme",m)}catch(e){}}var v=(localStorage.getItem("theme")||"nextdoor");s(v);if(t)t.addEventListener("click",function(){var c=d.getAttribute("data-theme");s(c==="nextdoor"?"light":c==="light"?"dark":"nextdoor")});})();</script>'
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{escape(desc)}">
  <meta name="keywords" content="隔壁織音人,世界樂器,世界樂器百科,世界聲音百科,樂器教學,歌唱教學,錄音後製,吉他教學,鋼琴教學,基礎樂理,音樂知識">
  <meta property="og:title" content="{escape(title) if "|" in title or "｜" in title else escape(title) + "｜世界聲音百科"}">
  <meta property="og:description" content="{escape(desc)}">
  <meta property="og:image" content="{og_img}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://soundweavers-music.github.io{escape(str(page_path.parent if page_path else '/'))}/">
  <link rel="canonical" href="{canonical}">
  <meta http-equiv="Content-Security-Policy" content="{csp}">
  <meta name="google-site-verification" content="AzedQ-PxUmSW7_0jyEHmHCKgN2nIK0Bio5d6LCsJTtE">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6561686484716387" crossorigin="anonymous"></script>
  <title>{escape(title) if "|" in title or "｜" in title else escape(title) + "｜世界聲音百科"}</title>
  {_dm_head}
  <link rel="stylesheet" href="{resolve_url(page_path, '/assets/site.css')}">
  <script type="application/ld+json">{jsonld}</script>
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
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/sound-journey/')}" class="dropdown-trigger">聲音旅圖</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/sound-journey/')}">旅圖門口</a>
          <a href="{resolve_url(page_path, '/sound-journey/1/')}">旅圖一｜氣息離開身體</a>
          <a href="{resolve_url(page_path, '/sound-journey/2/')}">旅圖二｜懷裡與大地的弦</a>
          <a href="{resolve_url(page_path, '/sound-journey/3/')}">旅圖三｜天空裡拉長的弦</a>
          <a href="{resolve_url(page_path, '/sound-journey/4/')}">旅圖四｜地心與手邊的微光</a>
          <a href="{resolve_url(page_path, '/sound-journey/5/')}">旅圖五｜城市與星塵的節奏</a>
          <a href="{resolve_url(page_path, '/sound-journey/6/')}">旅圖六｜按鍵打開房間，眾聲走向廣場</a>
          <a href="{resolve_url(page_path, '/sound-journey/all/')}">全部文章</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/vocal/')}" class="dropdown-trigger">人聲與歌唱</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/vocal/')}">課程總覽</a>
          <a href="{resolve_url(page_path, '/vocal/1/')}">初階篇</a>
          <a href="{resolve_url(page_path, '/vocal/16/')}">進階篇</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/digitalmusic/')}" class="dropdown-trigger">錄音後製</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/digitalmusic/')}">課程總覽</a>
          <a href="{resolve_url(page_path, '/digitalmusic/1/')}">基礎篇</a>
          <a href="{resolve_url(page_path, '/digitalmusic/16/')}">進階篇</a>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="{resolve_url(page_path, '/theory/')}" class="dropdown-trigger">樂理基礎</a>
        <div class="dropdown-menu">
          <a href="{resolve_url(page_path, '/theory/')}">課程總覽</a>
          <a href="{resolve_url(page_path, '/theory/0/')}">前言</a>
          <a href="{resolve_url(page_path, '/theory/1/')}">階段一</a>
          <a href="{resolve_url(page_path, '/theory/2/')}">階段二</a>
          <a href="{resolve_url(page_path, '/theory/3/')}">階段三</a>
          <a href="{resolve_url(page_path, '/theory/4/')}">階段四</a>
          <a href="{resolve_url(page_path, '/theory/5/')}">階段五</a>
        </div>
      </div>
      <a href="{resolve_url(page_path, '/experience/')}">🎹 體驗</a>
      <a href="{resolve_url(page_path, '/about/')}">關於</a>
      <a href="{resolve_url(page_path, '/contact/')}">聯絡我們</a>
    </nav>
    <button id="theme-toggle" class="theme-toggle" aria-label="切換色調">🎋</button>
  </header>
  {body}
  <footer class="site-footer">
    <div class="footer-inner">
      <span>世界聲音百科 — 世界樂器、人聲與音樂文化的旅圖</span>
      <span>作者：<a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">隔壁織音人</a></span>
      <nav class="footer-nav">
        <a href="{resolve_url(page_path, '/')}">首頁</a>
        <a href="{resolve_url(page_path, '/sound-journey/')}">聲音旅圖</a>
        <a href="{resolve_url(page_path, '/vocal/')}">人聲與歌唱</a>
	      <a href="{resolve_url(page_path, '/digitalmusic/')}">錄音後製</a>
        <a href="{resolve_url(page_path, '/categories/')}">分類</a>
        <a href="{resolve_url(page_path, '/countries/')}">國家</a>
        <a href="{resolve_url(page_path, '/popular/')}">熱門</a>
        <a href="{resolve_url(page_path, '/uncommon/')}">冷門</a>
        <a href="{resolve_url(page_path, '/theory/')}">樂理基礎</a>
        <a href="{resolve_url(page_path, '/contact/')}">聯絡我們</a>
        <a href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">訂閱 YouTube</a>
      </nav>
      <span class="visit-counter">總瀏覽次數：<span id="busuanzi_value_site_pv"></span> ｜今日訪客：<span id="busuanzi_value_site_uv"></span></span>
    </div>
  </footer>
  <button id="back-top" class="back-top" aria-label="回頂部">↑</button>
  <script src="{resolve_url(page_path, '/assets/search.js')}"></script>
  <script src="{resolve_url(page_path, '/assets/random-instrument.js')}"></script>
  <script async src="https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
  {_dm_foot}
</body>
</html>"""


def card(instrument, page_path=None):
    img = instrument.get("image", "")
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


def build_portal_homepage(instruments):
    print("Building portal homepage...")
    index_path = OUTPUT_DIR / "index.html"

    # Featured instruments
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
    sample_cards = "\n".join(card(item, index_path) for item in featured[:8])

    body = f"""<main>
  <section class="portal-hero">
    <h1>世界聲音百科</h1>
    <p class="hero-sub">世界樂器・人聲歌唱・音樂文化 — 循著聲音，走進不同文化的現場</p>
    <p class="hero-desc">從數千年的古老樂器到當代的人聲技法，從基礎樂理到錄音後製，這是一幅連結聲音、文化與創作靈感的知識地圖。無論你是音樂創作者、教育工作者、學生，或只是對聲音感到好奇的人，這裡都有值得你慢慢探索的內容。</p>
  </section>

  <div class="portal-grid">
    <a class="portal-card card-instruments" href="{resolve_url(index_path, '/instruments/')}">
      <div class="card-icon">🌍</div>
      <div class="card-label">世界樂器</div>
      <div class="card-desc">探索來自世界各地的傳統與現代樂器，從分類、地域分布到聲音特質，系統認識人類音樂文化的多元面貌。</div>
      <span class="card-badge badge-ready">已上線 {len(instruments)} 件</span>
    </a>
    <a class="portal-card card-digitalmusic" href="{resolve_url(index_path, '/digitalmusic/')}">
	      <div class="card-icon">🎛</div>
	      <div class="card-label">錄音後製</div>
	      <div class="card-desc">從宅錄建置到專業混音母帶的系統化課程</div>
	      <span class="card-badge badge-ready">已上線 30 堂</span>
	    </a>

	    <a class="portal-card card-vocal" href="{resolve_url(index_path, '/vocal/')}">
      <div class="card-icon">🎤</div>
      <div class="card-label">人聲與歌唱</div>
      <div class="card-desc">從初階發聲啟蒙到進階混聲技術，系統化的流行歌唱教學，搭配研究專欄深入探討聲學與製作觀點。</div>
      <span class="card-badge badge-new">新登場</span>
    </a>
    <a class="portal-card card-theory" href="{resolve_url(index_path, '/theory/')}">
      <div class="card-icon">🎼</div>
      <div class="card-label">樂理基礎</div>
      <div class="card-desc">認識譜號、節拍、拍號、音調、音域與發聲原理，系統了解音樂理論的基礎知識。</div>
      <span class="card-badge badge-ready">已上線</span>
    </a>
    <a class="portal-card card-about" href="{resolve_url(index_path, '/about/')}">
      <div class="card-icon">ℹ️</div>
      <div class="card-label">關於</div>
      <div class="card-desc">了解這個網站的創建理念、作者與服務項目，以及我們正在進行的計畫。</div>
      <span class="card-badge badge-info">了解更多</span>
    </a>
    <a class="portal-card card-contact" href="{resolve_url(index_path, '/contact/')}">
      <div class="card-icon">✉️</div>
      <div class="card-label">聯絡我們</div>
      <div class="card-desc">有任何建議、發現資料錯誤、或想推薦更多內容？歡迎通過 LINE 或 Email 告訴我們。</div>
      <span class="card-badge badge-info">與我們聯絡</span>
    </a>
  </div>

  <section class="portal-content">
    <div class="section-heading"><h2>最新樂器條目</h2><a href="{resolve_url(index_path, '/instruments/')}">查看全部 →</a></div>
    <div class="instrument-grid">{sample_cards}</div>
  </section>
</main>"""
    write(index_path, page("世界聲音百科 | 隔壁織音人", body, index_path, meta_description="世界聲音百科 by 隔壁織音人 — 收錄世界各國樂器、人聲歌唱教學、錄音後製知識與基礎樂理。從傳統民族樂器到現代電子樂器，提供樂器介紹、聆賞示範、演奏教學與文化背景。循著聲音，走進不同文化的現場。"))
    print("  Portal homepage written.")


def build_vocal_pages():
    """Build vocal index + detail pages from content/vocal/*.md."""
    print("Building vocal pages...")
    vocal_dir = CONTENT_DIR / "vocal"
    out_dir = OUTPUT_DIR / "vocal"
    out_dir.mkdir(parents=True, exist_ok=True)

    def parse_h1(h1):
        m = re.search(r"\[歌唱教學\]\s*(初階|進階)\s*第\s*(\d+)\s*章[：:]\s*(.+)", h1)
        if m:
            return m.group(1), int(m.group(2)), m.group(3).strip()
        return None, None, None

    chapters = []
    for fpath in sorted(vocal_dir.glob("*.md")):
        raw = fpath.read_text(encoding="utf-8")
        first = raw.strip().split("\n")[0]
        level, num, title = parse_h1(first)
        if level:
            chapters.append({"num": num, "title": title, "level": level, "filepath": fpath, "raw": raw})

    chapters.sort(key=lambda c: c["num"])
    beginner = [c for c in chapters if c["level"] == "初階"]
    advanced = [c for c in chapters if c["level"] == "進階"]

    # ── Index page ──
    # Build lookup: chapter_num → chapter data
    ch_lookup = {c["num"]: c for c in chapters}

    def ch_range_html(start, end):
        """Generate chapter list items for a range, with 'writing' placeholders."""
        items = []
        idx_path = out_dir / "index.html"
        for num in range(start, end + 1):
            if num in ch_lookup:
                c = ch_lookup[num]
                items.append(f"""<li class="chapter-item has-link">
          <a href="{resolve_url(idx_path, f'/vocal/{num}/')}">
            <span class="ch-num done">{num}</span>
            <span class="ch-title">第 {num} 章：{escape(c["title"])}</span>
            <span class="ch-status ch-status-done">可閱讀</span>
          </a>
        </li>""")
            else:
                items.append(f"""<li class="chapter-item">
            <span class="ch-num pending">{num}</span>
            <span class="ch-title">第 {num} 章</span>
            <span class="ch-status ch-status-writing">撰寫中</span>
        </li>""")
        return "\n".join(items)

    bh = ch_range_html(1, 15)
    ah = ch_range_html(16, 50)

    # Research columns: (filename, fallback_title)
    research_columns = [
        ("人聲共鳴聲學分析研究.md", "人聲頻率與共鳴的聲學分析 (Formants & Harmonics)"),
        ("人聲修音聲學標準研究.md", "錄音室人聲後製與修音 (Vocal Tuning) 的聲學標準：歌手該如何配合？"),
        ("Contemporary Pop Harmony Research.md", "當代流行音樂的和聲編排邏輯：從主旋律到多聲部交織"),
        (None, "不同麥克風種類（動圈 vs 電容）對歌手發聲技巧的影響與反饋"),
        (None, "流行聲樂教學的系統化與個人化：如何為不同音色的歌手制定訓練菜單"),
    ]

    research_items = []
    research_count = 0
    for idx, (fname, fallback_title) in enumerate(research_columns, 1):
        if fname:
            rf = vocal_dir / fname
            has_content = rf.exists()
        else:
            has_content = False

        if has_content:
            research_count += 1
            raw = rf.read_text(encoding="utf-8")
            title_line = raw.strip().split("\n")[0].lstrip("#").strip().strip("*")
            research_items.append(f'<div class="research-item has-link"><a href="{resolve_url(out_dir / "index.html", f"/vocal/research/{idx}/")}" class="research-link"><div class="research-num">專欄{idx}</div><div class="research-title">{escape(title_line)}</div><span class="ch-status ch-status-done">可閱讀</span></a></div>')
        else:
            research_items.append(f'<div class="research-item"><div class="research-num">專欄{idx}</div><div class="research-title">{escape(fallback_title)}</div><span class="ch-status ch-status-writing" style="display:inline-block;margin-top:8px;">撰寫中</span></div>')
    research = "\n".join(research_items)

    idx_body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">Voice &amp; Singing</p>
    <h1>人聲與歌唱</h1>
    <p class="lead">從啟蒙覺察到錄音室實戰，系統化的流行歌唱教學體系。無論你是零基礎初學者、進階歌者，還是對聲音科學感興趣的音樂人，都能在這裡找到適合的內容。</p>
  </section>
  <div class="vocal-page">
    <div class="vocal-tabs">
      <div class="vocal-tab-bar">
        <button class="vocal-tab-btn is-active" data-tab="beginner">🌱 初階篇 ({len(beginner)}/15)</button>
        <button class="vocal-tab-btn" data-tab="advanced">🌲 進階篇 ({len(advanced)}/35)</button>
        <button class="vocal-tab-btn" data-tab="research">🔬 研究專欄 ({research_count}/5)</button>
      </div>

      <div id="tab-beginner" class="vocal-tab-pane is-active">
        <section class="vocal-level">
          <div class="vocal-level-header"><h2>🌱 初階篇：啟蒙與覺察</h2></div>
          <p class="vocal-level-desc">適合零基礎、常覺得唱歌會累、抓不到音準或氣息，希望在日常中輕鬆唱歌的初學者。建立放鬆的發聲觀念，認識自己的聲音，並具備基礎的氣息與共鳴概念。</p>
          <div class="vocal-progress"><span>{len(beginner)}/15 堂已上線</span><div class="vocal-progress-bar"><div class="vocal-progress-fill" style="width:{100 * len(beginner) // 15}%"></div></div></div>
          <ol class="chapter-list">{bh}</ol>
        </section>
      </div>

      <div id="tab-advanced" class="vocal-tab-pane">
        <section class="vocal-level">
          <div class="vocal-level-header"><h2>🌲 進階篇：肌肉精操與錄音室實戰</h2></div>
          <p class="vocal-level-desc">已具備基礎氣息與音準，希望解決換聲區斷層、豐富音色色彩，並能進階處理錄音室演唱與情感細節的歌者。</p>
          <div class="vocal-progress"><span>{len(advanced)}/35 堂已上線</span><div class="vocal-progress-bar"><div class="vocal-progress-fill" style="width:{100 * len(advanced) // 35}%"></div></div></div>
          <ol class="chapter-list" start="16">{ah}</ol>
        </section>
      </div>

      <div id="tab-research" class="vocal-tab-pane">
        <section class="vocal-level">
          <div class="vocal-level-header"><h2>🔬 研究專欄：音樂製作與聲學探討</h2></div>
          <p class="vocal-level-desc">結合科學數據、編曲邏輯與後製觀點，提供超越單純演唱的全面性視角。適合聲樂教師、音樂製作人、配唱製作人，或是對聲音科學有濃厚興趣的歌者。</p>
          <div class="research-grid">{research}</div>
        </section>
      </div>
    </div>
  </div>
</main>

<script>
document.addEventListener('DOMContentLoaded', function() {{
  var tabs = document.querySelectorAll('.vocal-tab-btn');
  tabs.forEach(function(btn) {{
    btn.addEventListener('click', function() {{
      tabs.forEach(function(b) {{ b.classList.remove('is-active'); }});
      document.querySelectorAll('.vocal-tab-pane').forEach(function(p) {{ p.classList.remove('is-active'); }});
      btn.classList.add('is-active');
      var pane = document.getElementById('tab-' + btn.dataset.tab);
      if (pane) pane.classList.add('is-active');
    }});
  }});
}});
</script>"""
    write(out_dir / "index.html", page("人聲與歌唱", idx_body, out_dir / "index.html", meta_description="從初階發聲啟蒙到進階混聲技術，系統化的流行歌唱教學體系。包含初階15堂、進階35堂與研究專欄。"))

    # ── Detail pages ──
    for c in chapters:
        ch_dir = out_dir / str(c["num"])
        ch_dir.mkdir(parents=True, exist_ok=True)
        html_body = markdown_to_html(c["raw"])
        # Strip unwanted tags
        from bleach.sanitizer import ALLOWED_TAGS as BTAGS, ALLOWED_ATTRIBUTES as BATTRS
        import bleach
        allowed_tags = BTAGS.union({"p","pre","code","h1","h2","h3","h4","ul","ol","li","blockquote","strong","em","table","thead","tbody","tr","th","td","hr","br","img"})
        allowed_attrs = {**BATTRS, "a": ["href","title","target","rel"], "img": ["src","alt","title"]}
        html_body = bleach.clean(html_body, tags=allowed_tags, attributes=allowed_attrs, protocols=["http","https","mailto"], strip=True)

        level_tag = "level-tag-beginner" if c["level"] == "初階" else "level-tag-advanced"
        level_icon = "🌱" if c["level"] == "初階" else "🌲"
        level_group = "初階篇：啟蒙與覺察" if c["level"] == "初階" else "進階篇：肌肉精操與錄音室實戰"

        prev_num = c["num"] - 1
        next_num = c["num"] + 1
        prev_link = f'<a class="vocal-nav-link" href="{resolve_url(ch_dir / "index.html", f"/vocal/{prev_num}/")}">← 上一章</a>' if c["num"] > 1 else '<span class="vocal-nav-link disabled">← 上一章</span>'
        next_link = f'<a class="vocal-nav-link" href="{resolve_url(ch_dir / "index.html", f"/vocal/{next_num}/")}">下一章 →</a>'

        detail_body = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{resolve_url(ch_dir / "index.html", "/vocal/")}">← 人聲與歌唱</a>
      <span>/</span>
      <span>第 {c["num"]} 章</span>
    </div>
    <span class="level-tag {level_tag}">{level_icon} {c["level"]}篇</span>
    <h1>{escape(c["title"])}</h1>
    <p class="level-name">{level_group}</p>
  </div>
  <div class="vocal-content markdown-body">{html_body}</div>
  <div class="vocal-nav-links">{prev_link}{next_link}</div>
  <a class="back-link" href="{resolve_url(ch_dir / "index.html", "/vocal/")}">← 返回課程總覽</a>
</main>"""
        write(ch_dir / "index.html", page(escape(c["title"]), detail_body, ch_dir / "index.html", meta_description=escape(c["title"])))

    # ── Research article detail pages ──
    research_files = [
        ("人聲共鳴聲學分析研究.md", 1),
        ("人聲修音聲學標準研究.md", 2),
        ("Contemporary Pop Harmony Research.md", 3),
    ]
    for r_fname, r_idx in research_files:
        rf = vocal_dir / r_fname
        if not rf.exists():
            continue
        r_raw = rf.read_text(encoding="utf-8")
        first_line = r_raw.strip().split("\n")[0]
        r_title = first_line.lstrip("#").strip().strip("*")
        r_html = markdown_to_html(r_raw)
        from bleach.sanitizer import ALLOWED_TAGS as BTAGS2, ALLOWED_ATTRIBUTES as BATTRS2
        import bleach as _bl
        allowed_tags = BTAGS2.union({"p","pre","code","h1","h2","h3","h4","ul","ol","li","blockquote","strong","em","table","thead","tbody","tr","th","td","hr","br","img"})
        allowed_attrs = {**BATTRS2, "a": ["href","title","target","rel"], "img": ["src","alt","title"]}
        r_html = _bl.clean(r_html, tags=allowed_tags, attributes=allowed_attrs, protocols=["http","https","mailto"], strip=True)
        r_dir = out_dir / "research" / str(r_idx)
        r_dir.mkdir(parents=True, exist_ok=True)
        r_body = f"""<main class="vocal-detail-page">
  <div class="vocal-detail-header">
    <div class="breadcrumb">
      <a href="{resolve_url(r_dir / "index.html", "/vocal/")}">← 人聲與歌唱</a>
      <span>/</span>
      <span>研究專欄</span>
    </div>
    <span class="level-tag level-tag-beginner">🔬 研究專欄</span>
    <h1>{escape(r_title)}</h1>
    <p class="level-name">音樂製作與聲學探討</p>
  </div>
  <div class="vocal-content markdown-body">{r_html}</div>
  <a class="back-link" href="{resolve_url(r_dir / "index.html", "/vocal/")}">← 返回課程總覽</a>
</main>"""
        write(r_dir / "index.html", page(escape(r_title), r_body, r_dir / "index.html", meta_description=escape(r_title)))
        print(f"  Research article {r_idx} page written.")

    print(f"  Vocal index + {len(chapters)} chapter pages written.")


def build_digitalmusic_pages():
    """Build digitalmusic index + detail pages from content/digitalmusic/*.md."""
    print("Building digitalmusic pages...")
    dm_dir = CONTENT_DIR / "digitalmusic"
    out_dir = OUTPUT_DIR / "digitalmusic"
    out_dir.mkdir(parents=True, exist_ok=True)

    def parse_title(h1):
        import re as _re
        m = _re.search(r"第\s*(\d+)\s*堂[：:]\s*(.+)", h1)
        if m:
            title = m.group(2).strip().replace("**", "").replace("#", "").strip()
            return int(m.group(1)), title
        return None, None

    lessons = []
    for fpath in sorted(dm_dir.glob("*.md")):
        raw = fpath.read_text(encoding="utf-8")
        first = raw.strip().split("\n")[0]
        num, title = parse_title(first)
        if num:
            has_content = len(raw.strip()) > 300
            level = "基礎篇" if num <= 15 else "進階篇"
            lessons.append({"num": num, "title": title, "level": level, "filepath": fpath, "raw": raw, "published": has_content})

    lessons.sort(key=lambda c: c["num"])
    pub_count = sum(1 for c in lessons if c["published"])
    total = len(lessons)
    lookup = {c["num"]: c for c in lessons}

    def lesson_range_html(start, end):
        items = []
        idx_path = out_dir / "index.html"
        for n in range(start, end + 1):
            if n in lookup:
                c = lookup[n]
                if c["published"]:
                    items.append(f"""<li class="chapter-item has-link">
              <a href="{resolve_url(idx_path, f'/digitalmusic/{n}/')}">
                <span class="ch-num done">{n}</span>
                <span class="ch-title">{escape(c["title"])}</span>
                <span class="ch-status ch-status-done">可閱讀</span>
              </a>
            </li>""")
                else:
                    items.append(f"""<li class="chapter-item">
                <span class="ch-num pending">{n}</span>
                <span class="ch-title">{escape(c["title"])}</span>
                <span class="ch-status ch-status-writing">即將上線</span>
            </li>""")
        return "\n".join(items)

    bh = lesson_range_html(1, 15)
    ah = lesson_range_html(16, 30)

    idx_body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">Recording &amp; Mixing</p>
    <h1>錄音後製</h1>
    <p class="lead">從宅錄設備建置到專業混音母帶，系統化的錄音後製教學體系。無論你是剛起步的獨立音樂人、Podcast 創作者，還是想提升混音實力的工程師，都能在這裡找到適合的內容。</p>
  </section>
  <div class="vocal-page">
    <div class="vocal-tabs">
      <div class="vocal-tab-bar">
        <button class="vocal-tab-btn is-active" data-tab="beginner">基礎篇：宅錄建置與錄音混音基礎 ({pub_count}/{total})</button>
        <button class="vocal-tab-btn" data-tab="advanced">進階篇：音色雕塑、曲風實戰與母帶後期 ({pub_count}/{total})</button>
      </div>
      <div id="tab-beginner" class="vocal-tab-pane is-active">
        <section class="vocal-level">
          <div class="vocal-level-header"><h2>基礎篇：宅錄建置與錄音混音基礎</h2></div>
          <p class="vocal-level-desc">適合剛踏入錄音世界的新手，從設備選擇、聲學處理、DAW 設定到基礎混音概念，一步步建構你的宅錄工作室。</p>
          <div class="vocal-progress"><span>{pub_count}/{total} 堂已上線</span></div>
          <ol class="chapter-list">{bh}</ol>
        </section>
      </div>
      <div id="tab-advanced" class="vocal-tab-pane">
        <section class="vocal-level">
          <div class="vocal-level-header"><h2>進階篇：音色雕塑、曲風實戰與母帶後期</h2></div>
          <p class="vocal-level-desc">已具備基礎概念，想進一步掌握 EQ 雕塑、壓縮技巧、空間效果、曲風混音實戰與母帶後製的進階學習者。</p>
          <div class="vocal-progress"><span>{pub_count}/{total} 堂已上線</span></div>
          <ol class="chapter-list" start="16">{ah}</ol>
        </section>
      </div>
    </div>
  </div>
</main>
<script>
document.addEventListener('DOMContentLoaded', function() {{
  var tabs = document.querySelectorAll('.vocal-tab-btn');
  tabs.forEach(function(btn) {{
    btn.addEventListener('click', function() {{
      tabs.forEach(function(b) {{ b.classList.remove('is-active'); }});
      document.querySelectorAll('.vocal-tab-pane').forEach(function(p) {{ p.classList.remove('is-active'); }});
      btn.classList.add('is-active');
      var pane = document.getElementById('tab-' + btn.dataset.tab);
      if (pane) pane.classList.add('is-active');
    }});
  }});
}});
</script>"""
    write(out_dir / "index.html", page("錄音後製", idx_body, out_dir / "index.html", meta_description="從宅錄設備建置到專業混音母帶，系統化的錄音後製教學。包含基礎篇15堂與進階篇15堂，適合獨立音樂人與混音工程師。"))

    for c in lessons:
        if not c["published"]:
            continue
        ch_dir = out_dir / str(c["num"])
        ch_dir.mkdir(parents=True, exist_ok=True)
        html_body = markdown_to_html(c["raw"])
        import bleach
        from bleach.sanitizer import ALLOWED_TAGS as BTAGS, ALLOWED_ATTRIBUTES as BATTRS
        allowed_tags = BTAGS.union({"p","pre","code","h1","h2","h3","h4","ul","ol","li","blockquote","strong","em","table","thead","tbody","tr","th","td","hr","br","img"})
        allowed_attrs = {**BATTRS, "a": ["href","title","target","rel"], "img": ["src","alt","title"]}
        html_body = bleach.clean(html_body, tags=allowed_tags, attributes=allowed_attrs, protocols=["http","https","mailto"], strip=True)

        prev_num = c["num"] - 1
        next_num = c["num"] + 1
        prev_link = f'<a class="vocal-nav-link" href="{resolve_url(ch_dir / "index.html", f"/digitalmusic/{prev_num}/")}">← 上一堂</a>' if prev_num in lookup else '<span class="vocal-nav-link disabled">← 上一堂</span>'
        next_link = f'<a class="vocal-nav-link" href="{resolve_url(ch_dir / "index.html", f"/digitalmusic/{next_num}/")}">下一堂 →</a>' if next_num in lookup else '<span class="vocal-nav-link disabled">下一堂 →</span>'

        detail_body = f"""<main>
  <div class="vocal-article">
    <div class="vocal-article-header">
      <div class="breadcrumb">
        <a href="{resolve_url(ch_dir / "index.html", "/digitalmusic/")}">← 錄音後製課程</a>
        <span class="sep">/</span>
        <span>{escape(c["title"])}</span>
      </div>
    </div>
    <article class="markdown-body vocal-content">{html_body}</article>
    <div class="vocal-nav">
      {prev_link}
      <a class="vocal-nav-link" href="{resolve_url(ch_dir / "index.html", "/digitalmusic/")}">回課程列表</a>
      {next_link}
    </div>
  </div>
</main>"""
        write(ch_dir / "index.html", page(escape(c["title"]), detail_body, ch_dir / "index.html", meta_description=escape(c["title"])))

    print(f"  Digitalmusic index + {pub_count} lesson pages written.")


def build_contact_page():
    """Build the contact page."""
    print("Building contact page...")
    page_dir = OUTPUT_DIR / "contact"
    page_dir.mkdir(parents=True, exist_ok=True)
    body = """<main class="contact-page">
  <section class="contact-hero">
    <p class="eyebrow">Contact Us</p>
    <h1>聯絡我們</h1>
    <p class="lead">如果您對本站有任何建議、發現資料錯誤、或想推薦更多內容，歡迎通過以下方式與我們聯繫。您的回饋是我們持續改善的重要動力。</p>
  </section>
  <div class="contact-card">
    <h2>💬 回饋建議</h2>
    <p class="card-desc">對網站內容有任何想法或建議嗎？歡迎通過 LINE 官方帳號或 Email 告訴我們！</p>
    <div class="contact-actions">
      <a class="btn-line" href="https://line.me/R/ti/p/@971xnxql" target="_blank" rel="noopener">💬 LINE 官方帳號</a>
      <a class="btn-email" href="mailto:nextdoor20250726@gmail.com">✉️ 寄送 Email</a>
    </div>
  </div>
  <div class="contact-card">
    <h2>📬 聯絡方式</h2>
    <p class="card-desc">選擇最適合你的方式與我們保持聯繫。</p>
    <div class="contact-row"><div class="contact-icon email">✉️</div><span class="contact-label">Email</span><a class="contact-value" href="mailto:nextdoor20250726@gmail.com">nextdoor20250726@gmail.com</a></div>
    <div class="contact-row"><div class="contact-icon line">💬</div><span class="contact-label">LINE 官方帳號</span><a class="contact-value" href="https://line.me/R/ti/p/@971xnxql" target="_blank" rel="noopener">@971xnxql</a></div>
    <div class="contact-row"><div class="contact-icon youtube">▶️</div><span class="contact-label">YouTube 頻道</span><a class="contact-value" href="https://www.youtube.com/@NextDoorSoundWeavers/" target="_blank" rel="noopener">隔壁織音人</a></div>
  </div>
  <div class="contact-card">
    <h2>⏱️ 回應時間</h2>
    <p class="card-desc">我們會在 2-3 個工作日內回覆您的訊息。若您有商業合作、音樂製作相關需求，也歡迎來信洽談。</p>
  </div>
</main>"""
    write(page_dir / "index.html", page("聯絡我們", body, page_dir / "index.html", meta_description="對世界聲音百科有任何建議、發現資料錯誤或想推薦內容？歡迎透過 LINE 官方帳號或 Email 與我們聯繫。"))
    print("  Contact page written.")


def build_about_page_extra():
    """Update about page to add link to contact page."""
    about_path = OUTPUT_DIR / "about" / "index.html"
    if about_path.exists():
        text = about_path.read_text(encoding="utf-8")
        # Add contact link if not already there
        if "contact" not in text:
            text = text.replace(
                '<a class="btn" href="mailto:nextdoor20250726@gmail.com"',
                '<a href="/contact/" style="display:inline-block;padding:12px 24px;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px;">→ 前往完整聯絡頁面</a>\n          <a class="btn" href="mailto:nextdoor20250726@gmail.com"',
                1
            )
            about_path.write_text(text, encoding="utf-8")
            print("  About page updated with contact link.")


def build_theory_pages():
    """Build music theory page from content/musictheory/*.md files."""
    theory_dir = CONTENT_DIR / "musictheory"
    out_dir = OUTPUT_DIR / "theory"
    out_dir.mkdir(parents=True, exist_ok=True)
    import bleach as _bl
    from bleach.sanitizer import ALLOWED_TAGS as _BT, ALLOWED_ATTRIBUTES as _BA
    allowed_tags = _BT.union({"p","pre","code","h1","h2","h3","h4","ul","ol","li","blockquote","strong","em","table","thead","tbody","tr","th","td","hr","br","img"})
    allowed_attrs = {**_BA, "a": ["href","title","target","rel"], "img": ["src","alt","title"]}

    stages = []
    for fpath in sorted(theory_dir.glob("*.md")):
        raw = fpath.read_text(encoding="utf-8")
        first = raw.strip().split("\n")[0]
        title = first.lstrip("#").strip().strip("*")
        num = fpath.stem.replace("musictheory", "")
        stages.append({"num": num, "title": title, "raw": raw})
    stages.sort(key=lambda s: int(s["num"]))

    # Generate detail pages
    for s in stages:
        body_html = markdown.markdown(s["raw"], extensions=["extra","tables","fenced_code"], output_format="html5")
        body_html = _bl.clean(body_html, tags=allowed_tags, attributes=allowed_attrs, protocols=["http","https","mailto"], strip=True)
        s_dir = out_dir / s["num"]
        s_dir.mkdir(parents=True, exist_ok=True)
        sn = int(s["num"])
        prev_l = f'<a class="vocal-nav-link" href="{resolve_url(s_dir / "index.html", f"/theory/{sn-1}/")}">← 上一階段</a>' if sn > 0 else '<span class="vocal-nav-link disabled">← 上一階段</span>'
        next_l = f'<a class="vocal-nav-link" href="{resolve_url(s_dir / "index.html", f"/theory/{sn+1}/")}">下一階段 →</a>' if sn < len(stages) else '<span class="vocal-nav-link disabled">下一階段 →</span>'
        detail = f"""<main class="page theory-page">
  <nav class="breadcrumb" style="margin-bottom:24px;">
    <a href="{resolve_url(s_dir / "index.html", "/theory/")}">← 樂理基礎</a> <span>/</span> <span>{escape(s["title"])}</span>
  </nav>
  <article class="markdown-body">{body_html}</article>
  <div class="vocal-nav-links">{prev_l}{next_l}</div>
  <a class="back-link" href="{resolve_url(s_dir / "index.html", "/theory/")}">← 返回樂理基礎</a>
</main>"""
        write(s_dir / "index.html", page(s["title"], detail, s_dir / "index.html", meta_description=escape(s["title"])))

    # Generate index page with cards
    extra_css = """
<style>
.theory-hero { padding:48px 0 28px; }
.theory-page { max-width:860px; }
.theory-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; margin-top:24px; }
.theory-card { display:flex; flex-direction:column; gap:6px; border:1px solid var(--line); border-radius:10px; padding:20px 22px; background:var(--surface); text-decoration:none; transition:border-color.15s,box-shadow.15s; }
.theory-card:hover { border-color:var(--accent); box-shadow:0 2px 8px rgba(0,0,0,.06); }
.theory-card .card-label { font-weight:700; font-size:16px; color:var(--ink); }
.theory-card .card-desc { color:var(--muted); font-size:13px; }
</style>
"""
    def _card(s):
        sn = s["num"]
        stage_descs = {
            "0": "認識音樂的 15 個基礎名詞：從聲音三維空間、時間律動到旋律和聲。",
            "1": "先放下樂譜，單純用耳朵去感受聲音的高低，以及學會跟著音樂打穩定的拍子。",
            "2": "認識高低音譜號，把剛剛耳朵聽到的聲音，準確對應到紙上的線條位置。",
            "3": "認識拍號，學會算數學，知道每一個黑色小音符到底要唱多長、停多久。",
            "4": "認識弦樂、管樂和打擊樂器，了解它們為什麼會發出不一樣的聲音。",
            "5": "把前面的東西全部加起來，看看交響樂團怎麼運作，並聽聽其他國家的特殊音階。",
        }
        desc = stage_descs.get(sn, f"第 {sn} 階段")
        return f'<a class="theory-card" href="{resolve_url(out_dir / "index.html", f"/theory/{sn}/")}"><span class="card-label">{escape(s["title"])}</span><span class="card-desc">{escape(desc)}</span></a>'
    cards = "".join(_card(s) for s in stages)
    body = f"""<main class="page theory-page">
  <section class="theory-hero">
    <p class="eyebrow">Music Theory</p>
    <h1>樂理基礎</h1>
    <p class="lead">從前言到五大階段，系統性學習音樂理論基礎知識。</p>
  </section>
  <div class="theory-grid">{cards}</div>
</main>"""
    write(out_dir / "index.html", page("樂理基礎", body, out_dir / "index.html", extra_head=extra_css, meta_description="從前言到五大階段，系統性學習音樂理論基礎知識。"))
    print(f"  Built theory page with {len(stages)} stages + detail pages")


def build_experience_page():
    """Build the World Instrument Experience page with a virtual keyboard."""
    print("Building experience page...")
    out_dir = OUTPUT_DIR / "experience"
    out_dir.mkdir(parents=True, exist_ok=True)

    css = """
<style>
.exp-hero { padding:48px 20px 32px; text-align:center; background:linear-gradient(135deg,#f0fdfa 0%,#ecfeff 100%); border-bottom:1px solid var(--line); }
.exp-hero h1 { font-size:clamp(28px,4vw,40px); margin:0 0 8px; }
.exp-hero .lead { color:var(--muted); max-width:560px; margin:0 auto 8px; line-height:1.6; }
.exp-badge { display:inline-block; padding:4px 14px; border-radius:20px; background:rgba(245,158,11,.15); color:#b45309; font-size:12px; font-weight:700; margin-bottom:12px; }

.exp-controls { display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap; max-width:800px; margin:28px auto 20px; }
.exp-controls label { font-weight:600; font-size:14px; color:var(--ink2); display:flex; align-items:center; gap:8px; }
.exp-controls select { height:42px; border:1px solid var(--line); border-radius:8px; padding:0 14px; background:var(--surface); color:var(--ink); font-size:15px; cursor:pointer; min-width:200px; }
.exp-controls select:focus { outline:none; border-color:var(--accent); }

.exp-info { text-align:center; margin:4px 0 18px; font-size:14px; color:var(--muted); }
.exp-info strong { color:var(--ink); }

/* ── Keyboard ── */
.keyboard-wrap { max-width:100%; margin:0 auto; padding:18px 20px 28px; overflow-x:auto; }
.keyboard { display:flex; flex-direction:column; gap:6px; margin:0 auto; user-select:none; width:fit-content; }
.keyboard-row { position:relative; height:150px; }
.key-white { position:absolute; height:150px; width:36px; border:1px solid #d0d5dd; border-radius:0 0 6px 6px; background:#fff; cursor:pointer; display:flex; align-items:flex-end; justify-content:center; padding-bottom:6px; font-size:9px; color:#999; box-sizing:border-box; z-index:1; transition:background .08s; }
.key-white:hover { background:#f0f4f8; }
.key-white.active { background:#d1fae5; }
.key-black { position:absolute; height:90px; width:22px; border:1px solid #1a2332; border-radius:0 0 4px 4px; background:#1a2332; cursor:pointer; z-index:2; transition:background .08s; }
.key-black:hover { background:#344054; }
.key-black.active { background:#0f766e; }
.key-label { pointer-events:none; }

/* Instrument info panel */
.exp-panel { max-width:800px; margin:0 auto 42px; padding:20px 24px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.exp-panel h3 { margin:0 0 8px; font-size:16px; }
.exp-panel .range-info { color:var(--muted); font-size:13px; margin:0; }
.exp-panel .keys-count { color:var(--muted); font-size:13px; margin:4px 0 0; }

/* Nav toggle */
.nav-toggle-btn {
  position:fixed; top:58px; right:14px; z-index:200;
  background:var(--surface); border:1px solid var(--line); border-radius:6px;
  padding:4px 8px; cursor:pointer; font-size:11px; color:var(--muted);
  line-height:1.4; transition:all .15s; white-space:nowrap;
}
.nav-toggle-btn:hover { border-color:var(--accent); color:var(--accent); }
body.nav-hidden .site-header { display:none !important; }
body.nav-hidden .nav-toggle-btn { top:12px; }

/* Responsive keyboard */
@media (max-width:700px) {
  .key-white { width:30px; height:110px; font-size:7px; }
  .key-black { width:18px; height:66px; }
  .keyboard-row { height:110px; }
}
</style>"""

    # Instrument range mapping (MIDI note numbers: C0=12, C1=24, ..., C8=108)
    instruments_map = [
        {"id": "piano", "name": "鋼琴 Piano", "min": 21, "max": 108, "wave": "piano", "desc": "88 鍵標準鋼琴，A0–C8"},
        {"id": "guitar", "name": "吉他 Guitar", "min": 40, "max": 76, "wave": "guitar", "desc": "E2–E6，約 4 個 8 度"},
        {"id": "violin", "name": "小提琴 Violin", "min": 55, "max": 88, "wave": "string", "desc": "G3–A7，約 3 個 8 度"},
        {"id": "cello", "name": "大提琴 Cello", "min": 36, "max": 72, "wave": "string", "desc": "C2–C6，約 4 個 8 度"},
        {"id": "flute", "name": "長笛 Flute", "min": 60, "max": 84, "wave": "wind", "desc": "C4–C7，約 3 個 8 度"},
        {"id": "trumpet", "name": "小號 Trumpet", "min": 54, "max": 78, "wave": "wind", "desc": "F#3–C6，約 2.5 個 8 度"},
        {"id": "clarinet", "name": "單簧管 Clarinet", "min": 52, "max": 79, "wave": "wind", "desc": "E3–G6，約 3.5 個 8 度"},
        {"id": "saxophone", "name": "薩克斯風 Sax", "min": 46, "max": 77, "wave": "wind", "desc": "Bb3–F6，約 2.5 個 8 度"},
        {"id": "harp", "name": "豎琴 Harp", "min": 36, "max": 91, "wave": "piano", "desc": "C3–C7，約 4 個 8 度"},
        {"id": "organ", "name": "管風琴 Organ", "min": 24, "max": 108, "wave": "organ", "desc": "C1–C8，寬廣音域"},
        {"id": "bass", "name": "低音提琴 Double Bass", "min": 28, "max": 64, "wave": "guitar", "desc": "E1–G4，約 3.5 個 8 度"},
        {"id": "accordion", "name": "手風琴 Accordion", "min": 48, "max": 90, "wave": "organ", "desc": "C3–F6，約 3.5 個 8 度"},
        {"id": "marimba", "name": "馬林巴 Marimba", "min": 48, "max": 84, "wave": "piano", "desc": "C3–C7，約 4 個 8 度"},
        {"id": "xylophone", "name": "木琴 Xylophone", "min": 60, "max": 96, "wave": "piano", "desc": "C4–C8，約 4 個 8 度"},
        {"id": "harmonica", "name": "口琴 Harmonica", "min": 60, "max": 84, "wave": "wind", "desc": "C4–C7，約 3 個 8 度"},
        {"id": "erhu", "name": "二胡 Erhu", "min": 55, "max": 79, "wave": "string", "desc": "G3–G6，約 2.5 個 8 度"},
        {"id": "pipa", "name": "琵琶 Pipa", "min": 48, "max": 84, "wave": "piano", "desc": "C3–C7，約 4 個 8 度"},
    ]

    ins_json = json.dumps(instruments_map, ensure_ascii=False)

    body = f"""{css}
<main>
  <section class="exp-hero">
    <div class="exp-badge">🎹 建置中 · 測試版</div>
    <h1>世界樂器體驗</h1>
    <p class="lead">透過虛擬鍵盤模擬不同樂器的音色與音域，探索各種樂器的聲音特質。</p>
  </section>

  <button class="nav-toggle-btn" id="nav-toggle" title="隱藏/顯示導覽列">📌 導覽列</button>

  <div class="keyboard-wrap">
    <div class="exp-controls">
      <label>選擇樂器：
        <select id="ins-select"></select>
      </label>
    </div>

    <div class="exp-info">
      <span>音域：<strong id="range-label">A0–C8</strong></span>
      <span style="margin-left:16px;">按鍵數：<strong id="keys-count">88</strong></span>
      <span style="margin-left:16px;font-size:12px;">💡 點擊琴鍵或用電腦鍵盤彈奏</span>
    </div>

    <div class="keyboard" id="keyboard"></div>
  </div>

  <div class="exp-panel">
    <h3 id="ins-name">鋼琴 Piano</h3>
    <p class="range-info" id="ins-desc">88 鍵標準鋼琴，A0–C8</p>
    <p class="keys-count" id="ins-keys"></p>
  </div>
</main>

<script>
(function() {{
  var insList = {ins_json};

  // ── Nav toggle ──
  (function() {{
    var body = document.body;
    var btn = document.getElementById('nav-toggle');
    var saved = localStorage.getItem('wmi_nav_hidden');
    if (saved === '1') body.classList.add('nav-hidden');
    if (btn) {{
      btn.addEventListener('click', function() {{
        body.classList.toggle('nav-hidden');
        localStorage.setItem('wmi_nav_hidden', body.classList.contains('nav-hidden') ? '1' : '0');
      }});
    }}
  }})();

  var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  function noteName(midi) {{
    var oct = Math.floor(midi / 12) - 1;
    return NOTES[midi % 12] + oct;
  }}

  // ── Audio engine ──
  var audioCtx = null;
  function getAudio() {{
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }}

  var activeNotes = {{}};

  function playNote(midi, waveType) {{
    var ctx = getAudio();
    if (activeNotes[midi]) return;
    var freq = 440 * Math.pow(2, (midi - 69) / 12);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();

    switch(waveType) {{
      case 'piano':
        osc.type = 'triangle';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(2000 + (midi - 21) * 40, 8000);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        break;
      case 'guitar':
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(800 + (midi - 21) * 25, 4000);
        filter.Q.value = 2;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        break;
      case 'string':
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(1200 + (midi - 21) * 30, 6000);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
        break;
      case 'wind':
        osc.type = 'sine';
        osc.frequency.value = freq;
        filter.type = 'bandpass';
        filter.frequency.value = freq * 2;
        filter.Q.value = 3;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
        break;
      case 'organ':
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(1500 + (midi - 21) * 30, 6000);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.03);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 2.0);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.0);
        break;
    }}

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 4);

    activeNotes[midi] = {{ osc: osc, gain: gain }};
    osc.onended = function() {{ delete activeNotes[midi]; }};
  }}

  function stopNote(midi) {{
    if (activeNotes[midi]) {{
      try {{
        var g = activeNotes[midi].gain;
        g.gain.cancelScheduledValues(audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      }} catch(e) {{}}
      setTimeout(function() {{
        try {{ activeNotes[midi].osc.stop(); }} catch(e) {{}}
        delete activeNotes[midi];
      }}, 100);
    }}
  }}

  // ── Keyboard rendering ──
  var keyboard = document.getElementById('keyboard');
  var insSelect = document.getElementById('ins-select');
  var rangeLabel = document.getElementById('range-label');
  var keysCount = document.getElementById('keys-count');
  var insName = document.getElementById('ins-name');
  var insDesc = document.getElementById('ins-desc');
  var insKeys = document.getElementById('ins-keys');
  var currentIns = null;

  // Device detection: how many white keys fit per row
  function getMaxWhitesPerRow() {{
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (w >= 1024) return 999;       // Desktop: all keys in one row
    if (w < h) return 14;            // Mobile portrait: 2 octaves per row
    return 999;                       // Mobile landscape: all keys in one row
  }}

  // Populate instrument selector
  insList.forEach(function(ins) {{
    var opt = document.createElement('option');
    opt.value = ins.id;
    opt.textContent = ins.name;
    insSelect.appendChild(opt);
  }});

  function renderKeyboard(insId) {{
    var ins = insList.find(function(i) {{ return i.id === insId; }});
    if (!ins) return;
    currentIns = ins;
    rangeLabel.textContent = ins.desc;
    insName.textContent = ins.name;
    insDesc.textContent = ins.desc;

    // Build key data
    var keys = [];
    for (var m = ins.min; m <= ins.max; m++) {{
      var isBlack = NOTES[m % 12].indexOf('#') !== -1;
      keys.push({{ midi: m, black: isBlack, name: noteName(m) }});
    }}
    keysCount.textContent = keys.length;
    insKeys.textContent = '共 ' + keys.length + ' 個音高';

    // Key dimensions (smaller keys, ~36px wide)
    var whiteW = 36;
    var blackW = 22;
    var whiteH = 150;
    var blackH = 90;
    var MAX_WHITES_PER_ROW = getMaxWhitesPerRow();

    // Split keys into rows by white-key count
    var rows = [];
    var currentRow = [];
    var whiteCount = 0;
    keys.forEach(function(k) {{
      if (!k.black) {{
        if (whiteCount >= MAX_WHITES_PER_ROW) {{
          rows.push(currentRow);
          currentRow = [];
          whiteCount = 0;
        }}
        whiteCount++;
      }}
      currentRow.push(k);
    }});
    if (currentRow.length > 0) rows.push(currentRow);

    // Calculate row width based on actual white keys in widest row
    var whiteKeyCount = 0;
    keys.forEach(function(k) {{ if (!k.black) whiteKeyCount++; }});
    var rowWidth = Math.min(MAX_WHITES_PER_ROW, whiteKeyCount) * whiteW;
    keyboard.style.width = rowWidth + 'px';
    keyboard.innerHTML = '';

    // Helper: attach event listeners to a key element
    function attachKeyEvents(el, waveType) {{
      el.addEventListener('mousedown', function(e) {{
        e.preventDefault();
        var midi = parseInt(this.dataset.midi);
        this.classList.add('active');
        playNote(midi, waveType);
      }});
      el.addEventListener('mouseup', function() {{
        var midi = parseInt(this.dataset.midi);
        this.classList.remove('active');
        stopNote(midi);
      }});
      el.addEventListener('mouseleave', function() {{
        var midi = parseInt(this.dataset.midi);
        this.classList.remove('active');
        stopNote(midi);
      }});
      el.addEventListener('touchstart', function(e) {{
        e.preventDefault();
        var midi = parseInt(this.dataset.midi);
        this.classList.add('active');
        playNote(midi, waveType);
      }});
      el.addEventListener('touchend', function(e) {{
        e.preventDefault();
        var midi = parseInt(this.dataset.midi);
        this.classList.remove('active');
        stopNote(midi);
      }});
    }}

    // Render each row
    rows.forEach(function(row) {{
      var rowDiv = document.createElement('div');
      rowDiv.className = 'keyboard-row';

      var whiteIdx = 0;
      row.forEach(function(k) {{
        var el = document.createElement('div');
        if (k.black) {{
          var pos = whiteIdx * whiteW - blackW / 2;
          el.className = 'key-black';
          el.style.left = pos + 'px';
          el.style.height = blackH + 'px';
          el.dataset.midi = k.midi;
        }} else {{
          el.className = 'key-white';
          el.style.left = (whiteIdx * whiteW) + 'px';
          el.style.height = whiteH + 'px';
          el.dataset.midi = k.midi;
          var label = document.createElement('span');
          label.className = 'key-label';
          label.textContent = k.name;
          el.appendChild(label);
          whiteIdx++;
        }}
        attachKeyEvents(el, ins.wave);
        rowDiv.appendChild(el);
      }});
      keyboard.appendChild(rowDiv);
    }});
  }}

  insSelect.addEventListener('change', function() {{
    renderKeyboard(this.value);
  }});

  // Computer keyboard support
  var keyMap = 'awsedftgyhujkolp;';
  var keyMidiOffset = 48;
  document.addEventListener('keydown', function(e) {{
    if (!currentIns) return;
    var idx = keyMap.indexOf(e.key.toLowerCase());
    if (idx === -1) return;
    var midi = currentIns.min + idx;
    if (midi > currentIns.max) return;
    var keyEl = keyboard.querySelector('[data-midi=\"' + midi + '\"]');
    if (keyEl) {{
      keyEl.classList.add('active');
      playNote(midi, currentIns.wave);
    }}
  }});
  document.addEventListener('keyup', function(e) {{
    if (!currentIns) return;
    var idx = keyMap.indexOf(e.key.toLowerCase());
    if (idx === -1) return;
    var midi = currentIns.min + idx;
    var keyEl = keyboard.querySelector('[data-midi=\"' + midi + '\"]');
    if (keyEl) keyEl.classList.remove('active');
    stopNote(midi);
  }});

  // Initial render
  renderKeyboard('piano');

  // Re-render on resize/orientation change for responsive rows
  var resizeTimer;
  window.addEventListener('resize', function() {{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {{
      if (currentIns) renderKeyboard(currentIns.id);
    }}, 300);
  }});
}})();
</script>"""

    write(out_dir / "index.html", page("世界樂器體驗", body, out_dir / "index.html",
        meta_description="世界樂器體驗 — 透過虛擬鍵盤模擬鋼琴、吉他、小提琴等樂器的音色與音域。世界聲音百科 by 隔壁織音人。"))
    print("  Experience page written.")


def main():
    instruments = read_instruments()
    print(f"Read {len(instruments)} instruments from content/instruments/")
    append_css()
    build_portal_homepage(instruments)
    build_vocal_pages()
    build_theory_pages()
    build_contact_page()
    build_digitalmusic_pages()
    build_experience_page()
    build_about_page_extra()
    print("\nPost-build complete.")


def append_css():
    """Append portal, vocal, and contact CSS to output site.css."""
    css_path = OUTPUT_DIR / "assets" / "site.css"
    if not css_path.exists():
        print("  site.css not found, skipping CSS append.")
        return
    extra = """
/* ── Portal homepage ──────────────────────── */
.portal-hero {
  padding: 72px 20px 56px;
  text-align: center;
  background: linear-gradient(180deg, #f0fdfa 0%, #fbfcfe 100%);
  border-bottom: 1px solid var(--line);
}
.portal-hero h1 { font-size: clamp(32px,5vw,52px); font-weight:800; letter-spacing:-.02em; margin:0 0 12px; line-height:1.15; }
.portal-hero .hero-sub { color:var(--muted); font-size:clamp(16px,2vw,19px); max-width:600px; margin:0 auto 28px; line-height:1.7; }
.portal-hero .hero-desc { color:var(--muted); font-size:15px; max-width:660px; margin:0 auto; line-height:1.8; }
.portal-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; max-width:1100px; margin:48px auto 0; padding:0 20px; }
.portal-card {
  display:flex; flex-direction:column; border:1px solid var(--line); border-radius:16px;
  padding:28px 24px; text-decoration:none; position:relative; overflow:hidden;
  min-height:320px;
  transition:transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1);
}
.portal-card:hover { transform:translateY(-4px); }
.portal-card .card-icon { font-size:36px; margin-bottom:14px; line-height:1; position:relative; z-index:1; }
.portal-card .card-label { font-size:20px; font-weight:800; margin-bottom:8px; position:relative; z-index:1; }
.portal-card .card-desc { font-size:14px; color:var(--muted); line-height:1.6; flex:1; position:relative; z-index:1; }
.portal-card .card-badge { display:inline-block; margin-top:14px; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; align-self:flex-start; position:relative; z-index:1; }
.badge-new { background:rgba(217,119,6,.15); color:#b45309; }
.badge-ready { background:rgba(15,118,110,.15); color:#0f766e; }
.badge-soon { background:rgba(55,48,163,.12); color:#3730a3; }
.badge-info { background:rgba(107,33,168,.12); color:#6b21a8; }
.portal-card::before { content:''; position:absolute; top:0; left:0; right:0; height:5px; z-index:2; }
.portal-card::after { content:''; position:absolute; inset:0; opacity:0; transition:opacity .35s ease; }
.portal-card:hover::after { opacity:1; }
.portal-card:hover { box-shadow:0 12px 32px rgba(0,0,0,.1); }

/* ── Instrument card (#0f766e teal) ── */
.card-instruments { background:linear-gradient(135deg,#f0fdfa 0%,#f8fafc 100%); }
.card-instruments::before { background:linear-gradient(90deg,#0f766e,#14b8a6); }
.card-instruments::after { background:linear-gradient(135deg,rgba(15,118,110,.06) 0%,transparent 60%); }
.card-instruments:hover { box-shadow:0 12px 32px rgba(15,118,110,.15); }
.card-instruments .card-label { color:#0f766e; }

/* ── Digitalmusic card (#0891b2 cyan) ── */
.card-digitalmusic { background:linear-gradient(135deg,#ecfeff 0%,#f8fafc 100%); }
.card-digitalmusic::before { background:linear-gradient(90deg,#0891b2,#22d3ee); }
.card-digitalmusic::after { background:linear-gradient(135deg,rgba(8,145,178,.06) 0%,transparent 60%); }
.card-digitalmusic:hover { box-shadow:0 12px 32px rgba(8,145,178,.15); }
.card-digitalmusic .card-label { color:#0891b2; }

/* ── Vocal card (#d97706 amber) ── */
.card-vocal { background:linear-gradient(135deg,#fffbeb 0%,#fefce8 100%); }
.card-vocal::before { background:linear-gradient(90deg,#d97706,#f59e0b); }
.card-vocal::after { background:linear-gradient(135deg,rgba(217,119,6,.06) 0%,transparent 60%); }
.card-vocal:hover { box-shadow:0 12px 32px rgba(217,119,6,.15); }
.card-vocal .card-label { color:#b45309; }

/* ── Theory card (#7c3aed purple) ── */
.card-theory { background:linear-gradient(135deg,#f5f3ff 0%,#faf5ff 100%); }
.card-theory::before { background:linear-gradient(90deg,#7c3aed,#a78bfa); }
.card-theory::after { background:linear-gradient(135deg,rgba(124,58,237,.06) 0%,transparent 60%); }
.card-theory:hover { box-shadow:0 12px 32px rgba(124,58,237,.15); }
.card-theory .card-label { color:#7c3aed; }

/* ── About card (#4f46e5 indigo) ── */
.card-about { background:linear-gradient(135deg,#eef2ff 0%,#f8faff 100%); }
.card-about::before { background:linear-gradient(90deg,#4f46e5,#818cf8); }
.card-about::after { background:linear-gradient(135deg,rgba(79,70,229,.06) 0%,transparent 60%); }
.card-about:hover { box-shadow:0 12px 32px rgba(79,70,229,.15); }
.card-about .card-label { color:#4f46e5; }

/* ── Contact card (#dc2626 red) ── */
.card-contact { background:linear-gradient(135deg,#fef2f2 0%,#fef8f8 100%); }
.card-contact::before { background:linear-gradient(90deg,#dc2626,#f87171); }
.card-contact::after { background:linear-gradient(135deg,rgba(220,38,38,.06) 0%,transparent 60%); }
.card-contact:hover { box-shadow:0 12px 32px rgba(220,38,38,.15); }
.card-contact .card-label { color:#dc2626; }
.portal-content { max-width:1100px; margin:56px auto 0; padding:0 20px 64px; }
@media (max-width:800px) { .portal-grid { grid-template-columns:repeat(2,1fr); } }
@media (max-width:520px) { .portal-grid { grid-template-columns:1fr; } }

/* ── Vocal pages ──────────────────────────── */
.vocal-hero { padding:56px 20px 40px; text-align:center; background:linear-gradient(135deg,#fffbeb 0%,#fefce8 100%); border-bottom:1px solid var(--line); }
.vocal-hero h1 { font-size:clamp(28px,4vw,42px); margin:0 0 12px; }
.vocal-hero .lead { max-width:600px; margin:0 auto; color:var(--muted); line-height:1.7; }
.vocal-page { max-width:980px; margin:0 auto; padding:40px 20px 80px; }
.vocal-level { margin-bottom:48px; }
.vocal-level-header { display:flex; align-items:center; gap:14px; margin-bottom:8px; }
.vocal-level-header h2 { font-size:24px; font-weight:800; }
.vocal-level-desc { color:var(--muted); font-size:15px; line-height:1.6; margin:0 0 6px; max-width:720px; }
.vocal-progress { display:flex; align-items:center; gap:10px; margin-bottom:20px; font-size:13px; color:var(--muted); }
.chapter-list { list-style:none; padding:0; margin:0; display:grid; gap:8px; }
.chapter-item { display:flex; align-items:center; gap:12px; padding:14px 18px; border:1px solid var(--line); border-radius:10px; background:var(--surface); transition:border-color .15s,box-shadow .15s; }
.chapter-item.has-link:hover { border-color:var(--accent); box-shadow:0 2px 8px rgba(0,0,0,.06); }
.chapter-item .ch-num { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; flex-shrink:0; }
.chapter-item .ch-num.done { background:var(--accent); color:#fff; }
.chapter-item .ch-title { flex:1; font-weight:600; font-size:15px; }
.chapter-item .ch-status { font-size:12px; font-weight:600; padding:3px 10px; border-radius:20px; flex-shrink:0; }
.ch-status-done { background:#d1fae5; color:#065f46; }
.ch-status-writing { background:#fef3c7; color:#92400e; }
.chapter-item a { text-decoration:none; color:inherit; display:flex; align-items:center; gap:12px; flex:1; }
.research-grid { display:grid; gap:12px; }
.research-item { padding:18px 20px; border:1px solid var(--line); border-radius:10px; background:var(--surface); }
.research-item.has-link { padding:0; transition:border-color .15s,box-shadow .15s; }
.research-item.has-link:hover { border-color:var(--accent); box-shadow:0 2px 8px rgba(0,0,0,.06); }
.research-link { display:block; padding:18px 20px; text-decoration:none; color:inherit; }
.research-item .research-num { display:inline-block; padding:2px 10px; border-radius:20px; background:#e0e7ff; color:#3730a3; font-size:11px; font-weight:700; margin-bottom:6px; }
.research-item .research-title { font-weight:600; font-size:15px; }
.vocal-detail-page { max-width:800px; margin:0 auto; padding:32px 20px 80px; }
.vocal-detail-header { margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid var(--line); }
.vocal-detail-header .breadcrumb { display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-size:13px; margin-bottom:16px; }
.vocal-detail-header .breadcrumb a { text-decoration:none; color:var(--muted); }
.vocal-detail-header .breadcrumb a:hover { color:var(--accent); }
.vocal-detail-header .level-tag { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; margin-bottom:12px; }
.level-tag-beginner { background:#fef3c7; color:#92400e; }
.level-tag-advanced { background:#e0e7ff; color:#3730a3; }
.vocal-detail-header h1 { font-size:clamp(24px,3.5vw,34px); margin:0; line-height:1.3; }
.vocal-detail-header .level-name { color:var(--muted); font-size:14px; margin-top:8px; }
.vocal-content { color:#344054; line-height:1.9; font-size:16px; }
.vocal-content h2 { font-size:22px; margin:1.6em 0 .6em; padding-bottom:8px; border-bottom:1px solid var(--line); color:var(--ink); }
.vocal-content h3 { font-size:18px; margin:1.4em 0 .5em; color:var(--ink); }
.vocal-content p { margin:0 0 1.2em; }
.vocal-content blockquote { margin:1em 0; padding:.5em 1em; border-left:3px solid var(--accent); color:var(--muted); background:var(--soft); border-radius:0 6px 6px 0; }
.vocal-content img { max-width:100%; border-radius:8px; margin:1em 0; }
.vocal-nav-links { display:flex; justify-content:space-between; margin-top:48px; padding-top:24px; border-top:1px solid var(--line); }
.vocal-nav-link { display:inline-flex; align-items:center; gap:6px; padding:10px 18px; border:1px solid var(--line); border-radius:8px; text-decoration:none; font-weight:600; font-size:14px; color:var(--muted); transition:all .15s; }
.vocal-nav-link:hover { border-color:var(--accent); color:var(--accent); }
.vocal-nav-link.disabled { opacity:.35; pointer-events:none; }
.back-link { display:inline-flex; align-items:center; gap:6px; margin-top:40px; padding:10px 18px; border:1px solid var(--line); border-radius:8px; text-decoration:none; font-weight:600; font-size:14px; color:var(--muted); transition:all .15s; }
.back-link:hover { border-color:var(--accent); color:var(--accent); }
.vocal-tabs { margin-top: 8px; }
.vocal-tab-bar { display:flex; gap:4px; margin:0 0 24px; border-bottom:2px solid var(--line); padding-bottom:0; }
.vocal-tab-btn {
  padding:10px 20px; border:1px solid var(--line); border-bottom:none;
  border-radius:8px 8px 0 0; background:var(--soft); color:var(--muted);
  font-weight:700; font-size:14px; cursor:pointer; transition:all .15s;
  position:relative; top:2px;
}
.vocal-tab-btn:hover { color:var(--accent); }
.vocal-tab-btn.is-active { background:var(--surface); color:var(--accent); border-color:var(--line); border-bottom-color:var(--surface); }
.vocal-tab-pane { display:none; }
.vocal-tab-pane.is-active { display:block; }
.vocal-progress-bar { height:6px; border-radius:3px; background:var(--line); flex:1; max-width:260px; overflow:hidden; }
.vocal-progress-fill { height:100%; border-radius:3px; background:linear-gradient(90deg,var(--accent),#34d399); transition:width .4s; }
@media (max-width:700px) { .vocal-tab-bar { flex-wrap:wrap; } .vocal-tab-btn { flex:1; min-width:80px; text-align:center; } }

/* ── Contact page ─────────────────────────── */
.contact-page { max-width:740px; margin:0 auto; padding:48px 20px 80px; }
.contact-hero { text-align:center; padding:48px 0 40px; }
.contact-hero h1 { font-size:clamp(28px,4vw,40px); margin:0 0 12px; }
.contact-hero .lead { color:var(--muted); max-width:520px; margin:0 auto; line-height:1.7; }
.contact-card { border:1px solid var(--line); border-radius:14px; padding:32px; background:var(--surface); margin-bottom:24px; }
.contact-card h2 { font-size:20px; margin:0 0 6px; display:flex; align-items:center; gap:10px; }
.contact-card .card-desc { color:var(--muted); font-size:15px; line-height:1.6; margin:0 0 20px; }
.contact-row { display:flex; align-items:center; gap:14px; padding:14px 0; border-bottom:1px solid var(--line); }
.contact-icon { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
.contact-icon.line { background:#e8faf0; }
.contact-icon.email { background:#e8f0fe; }
.contact-icon.youtube { background:#fde8e8; }
.contact-row .contact-label { font-weight:600; font-size:15px; flex:1; }
.contact-row .contact-value { font-size:14px; color:var(--blue); text-decoration:none; font-weight:600; }
.contact-actions { display:flex; gap:16px; flex-wrap:wrap; margin-top:20px; }
.btn-line { display:inline-flex; align-items:center; gap:8px; padding:14px 28px; background:#06C755; color:#fff; border-radius:10px; text-decoration:none; font-weight:700; font-size:16px; transition:background .15s,transform .15s; box-shadow:0 2px 8px rgba(6,199,85,.3); }
.btn-line:hover { background:#05a648; transform:translateY(-2px); box-shadow:0 4px 16px rgba(6,199,85,.4); }
.btn-email { display:inline-flex; align-items:center; gap:8px; padding:14px 28px; background:var(--blue); color:#fff; border-radius:10px; text-decoration:none; font-weight:700; font-size:16px; transition:background .15s,transform .15s; box-shadow:0 2px 8px rgba(29,78,216,.3); }
.btn-email:hover { background:#1e40af; transform:translateY(-2px); box-shadow:0 4px 16px rgba(29,78,216,.4); }

/* Dark mode */
[data-theme="dark"] {
  --ink: #e2e8f0; --ink2: #cbd5e1; --muted: #94a3b8; --line: #334155;
  --surface: #1e293b; --soft: #0f172a; --accent: #5eead4; --accent2: #14b8a6;
  --blue: #60a5fa;
  --shadow: 0 1px 3px rgba(0,0,0,.3), 0 1px 2px rgba(0,0,0,.25);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.35), 0 2px 4px -2px rgba(0,0,0,.3);
}
.theme-toggle { background:none; border:1px solid var(--line); border-radius:6px; cursor:pointer; font-size:16px; line-height:1; padding:5px 8px; color:var(--ink2); transition:border-color .15s; flex-shrink:0; margin-left:4px; }
.theme-toggle:hover { border-color:var(--accent); }
"""
    css_path.write_text(css_path.read_text(encoding="utf-8") + extra, encoding="utf-8")
    print("  CSS styles appended to site.css.")


if __name__ == "__main__":
    main()
