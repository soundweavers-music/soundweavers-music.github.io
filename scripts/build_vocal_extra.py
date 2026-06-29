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


def page(title, body, page_path=None, extra_head=""):
    csp = ("default-src 'self'; img-src 'self' https: data:; "
           "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com; "
           "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://busuanzi.ibruce.info; "
           "connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; "
           "base-uri 'self'; form-action 'none'; object-src 'none'")
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="{csp}">
  <title>{escape(title)}｜隔壁織音人</title>
  <link rel="stylesheet" href="{resolve_url(page_path, '/assets/site.css')}">
  {extra_head}
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{resolve_url(page_path, '/')}">🌍 世界樂器百科</a>
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
      <span>隔壁織音人 — 世界樂器百科・人聲歌唱・音樂知識</span>
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
      </nav>
      <span class="visit-counter">總瀏覽次數：<span id="busuanzi_value_site_pv"></span> ｜今日訪客：<span id="busuanzi_value_site_uv"></span></span>
    </div>
  </footer>
  <button id="back-top" class="back-top" aria-label="回頂部">↑</button>
  <script src="{resolve_url(page_path, '/assets/search.js')}"></script>
  <script src="{resolve_url(page_path, '/assets/random-instrument.js')}"></script>
  <script async src="https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
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
    <h1>隔壁織音人</h1>
    <p class="hero-sub">循著聲音，走進不同文化的現場</p>
    <p class="hero-desc">一個收錄世界樂器、人聲歌唱教學、音樂理論與製作知識的整合平台。無論你是音樂創作者、教育工作者、學生，或只是對聲音感到好奇的人，這裡都有值得你慢慢探索的內容。</p>
  </section>

  <div class="portal-grid">
    <a class="portal-card card-instruments" href="{resolve_url(index_path, '/instruments/')}">
      <div class="card-icon">🌍</div>
      <div class="card-label">世界樂器</div>
      <div class="card-desc">探索來自世界各地的傳統與現代樂器，從分類、地域分布到聲音特質，系統認識人類音樂文化的多元面貌。</div>
      <span class="card-badge badge-ready">已上線 {len(instruments)} 件</span>
    </a>
    <a class="portal-card card-vocal" href="{resolve_url(index_path, '/vocal/')}">
      <div class="card-icon">🎤</div>
      <div class="card-label">人聲與歌唱</div>
      <div class="card-desc">從初階發聲啟蒙到進階混聲技術，系統化的流行歌唱教學，搭配研究專欄深入探討聲學與製作觀點。</div>
      <span class="card-badge badge-new">新登場</span>
    </a>
    <a class="portal-card card-theory" href="{resolve_url(index_path, '/theory/')}">
      <div class="card-icon">🎼</div>
      <div class="card-label">基礎樂理</div>
      <div class="card-desc">認識譜號、節拍、拍號、音調、音域與發聲原理，系統了解音樂理論的基礎知識。</div>
      <span class="card-badge badge-ready">已上線</span>
    </a>
    <a class="portal-card card-recording" href="#">
      <div class="card-icon">🎚️</div>
      <div class="card-label">錄音後製</div>
      <div class="card-desc">錄音技術、混音觀念、宅錄設備指南，從入門到進階的製作知識即將陸續上線。</div>
      <span class="card-badge badge-soon">敬請期待</span>
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
    write(index_path, page("首頁", body, index_path))
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
            <span class="ch-title">{escape(c["title"])}</span>
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

    research = "\n".join(
        f'<div class="research-item"><div class="research-num">專欄{i}</div><div class="research-title">{escape(t)}</div><span class="ch-status ch-status-writing" style="display:inline-block;margin-top:8px;">撰寫中</span></div>'
        for i, t in enumerate([
            "人聲頻率與共鳴的聲學分析 (Formants & Harmonics)",
            "錄音室人聲後製與修音 (Vocal Tuning) 的聲學標準：歌手該如何配合？",
            "當代流行音樂的和聲編排邏輯：從主旋律到多聲部交織",
            "不同麥克風種類（動圈 vs 電容）對歌手發聲技巧的影響與反饋",
            "流行聲樂教學的系統化與個人化：如何為不同音色的歌手制定訓練菜單",
        ], 1)
    )

    idx_body = f"""<main>
  <section class="vocal-hero">
    <p class="eyebrow">Voice &amp; Singing</p>
    <h1>人聲與歌唱</h1>
    <p class="lead">從啟蒙覺察到錄音室實戰，系統化的流行歌唱教學體系。無論你是零基礎初學者、進階歌者，還是對聲音科學感興趣的音樂人，都能在這裡找到適合的內容。</p>
  </section>
  <div class="vocal-page">
    <section class="vocal-level">
      <div class="vocal-level-header"><h2>🌱 初階篇：啟蒙與覺察</h2></div>
      <p class="vocal-level-desc">適合零基礎、常覺得唱歌會累、抓不到音準或氣息，希望在日常中輕鬆唱歌的初學者。建立放鬆的發聲觀念，認識自己的聲音，並具備基礎的氣息與共鳴概念。</p>
      <div class="vocal-progress"><span>{len(beginner)}/15 堂已上線</span></div>
      <ol class="chapter-list">{bh}</ol>
    </section>
    <section class="vocal-level">
      <div class="vocal-level-header"><h2>🌲 進階篇：肌肉精操與錄音室實戰</h2></div>
      <p class="vocal-level-desc">已具備基礎氣息與音準，希望解決換聲區斷層、豐富音色色彩，並能進階處理錄音室演唱與情感細節的歌者。</p>
      <div class="vocal-progress"><span>{len(advanced)}/35 堂已上線</span></div>
      <ol class="chapter-list" start="16">{ah}</ol>
    </section>
    <section class="vocal-level">
      <div class="vocal-level-header"><h2>🔬 研究專欄：音樂製作與聲學探討</h2></div>
      <p class="vocal-level-desc">結合科學數據、編曲邏輯與後製觀點，提供超越單純演唱的全面性視角。</p>
      <div class="research-grid">{research}</div>
    </section>
  </div>
</main>"""
    write(out_dir / "index.html", page("人聲與歌唱", idx_body, out_dir / "index.html"))

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
        write(ch_dir / "index.html", page(escape(c["title"]), detail_body, ch_dir / "index.html"))

    print(f"  Vocal index + {len(chapters)} chapter pages written.")


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
    write(page_dir / "index.html", page("聯絡我們", body, page_dir / "index.html"))
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


def main():
    instruments = read_instruments()
    print(f"Read {len(instruments)} instruments from content/instruments/")
    append_css()
    build_portal_homepage(instruments)
    build_vocal_pages()
    build_contact_page()
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
.portal-card { display:flex; flex-direction:column; border:1px solid var(--line); border-radius:14px; padding:28px 24px; background:var(--surface); text-decoration:none; transition:transform .18s,box-shadow .18s; position:relative; overflow:hidden; }
.portal-card:hover { transform:translateY(-4px); box-shadow:0 12px 28px rgba(0,0,0,.08); }
.portal-card .card-icon { font-size:36px; margin-bottom:14px; line-height:1; }
.portal-card .card-label { font-size:20px; font-weight:800; margin-bottom:8px; color:var(--ink); }
.portal-card .card-desc { font-size:14px; color:var(--muted); line-height:1.6; flex:1; }
.portal-card .card-badge { display:inline-block; margin-top:14px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; align-self:flex-start; }
.badge-new { background:#fef3c7; color:#92400e; }
.badge-ready { background:#d1fae5; color:#065f46; }
.badge-soon { background:#e0e7ff; color:#3730a3; }
.badge-info { background:#f3e8ff; color:#6b21a8; }
.portal-card::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; }
.card-instruments::before { background:#0f766e; }
.card-vocal::before { background:#d97706; }
.card-theory::before { background:#7c3aed; }
.card-recording::before { background:#0891b2; }
.card-about::before { background:#4f46e5; }
.card-contact::before { background:#dc2626; }
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
"""
    css_path.write_text(css_path.read_text(encoding="utf-8") + extra, encoding="utf-8")
    print("  CSS styles appended to site.css.")


if __name__ == "__main__":
    main()
