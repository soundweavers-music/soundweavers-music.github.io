#!/usr/bin/env python3
"""简体中文版：把繁體頁逐字轉成簡体，產生 /hans/<同一條路徑>。

不另外翻譯，也不另外維護稿子——繁體頁是唯一真相，簡体只是它的另一種字面。
轉字表在 `scripts/data/zh_hans_map.json`（繁→簡，逐字），是從 OpenCC 的
t2s 轉出來的，建置時不需要安裝任何套件。

三個地方要特別處理：

1. **href／src 不能轉**。站上有中文網址（`/countries/中國-廣東/`），把網址
   一起轉掉就會連到不存在的資料夾。所以先把整個屬性抽出來，轉完再放回去。
2. **站內絕對連結要加 `/hans`**：`/instruments/` → `/hans/instruments/`。
   `/assets/`、`/en/`、`/hans/` 不動。
3. **導覽列的語言選單要重做**：轉字後「简体中文」要標成 selected，三個選項的
   連結也要是從 /hans/ 這一頁看過去的相對路徑。

建置順序：排在 page_i18n build 之後（英文頁也要在，才好算語言選單的連結）。
"""
from __future__ import annotations

import json
import posixpath
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_static_site as bss                                   # noqa: E402

BASE = Path(__file__).resolve().parent.parent
OUTPUT = BASE / "outputs" / "world-instruments-static"
MAP_FILE = BASE / "scripts" / "data" / "zh_hans_map.json"

SKIP_DIRS = ("en", "hans", "assets", "vendor", "manage", "scripts")
LINK_ATTR = re.compile(r'\b(href|src)="([^"]*)"')
SELECT = re.compile(r'<select class="nav-lang".*?</select>', re.S)
HREFLANG = re.compile(r'\n?\s*<link rel="alternate" hreflang="[^"]*"[^>]*>')
SITE = "https://soundweavers-music.github.io"
# 站台自己的絕對網址（canonical、og:url、JSON-LD）。資產與另外兩個語言版本不動，
# 不然 og:image 會被指到 /hans/assets/… 這種不存在的地方。
ABS_SITE = re.compile(re.escape(SITE) + r'(?!/?(?:en|hans|assets|vendor|fonts)/)(/[^"\s]*)?')
HTML_LANG = re.compile(r'<html lang="zh-Hant"')
CANON = re.compile(r'<link rel="canonical"[^>]*>')


def load_map() -> dict:
    return json.loads(MAP_FILE.read_text(encoding="utf-8"))


def pages() -> list:
    out = []
    for p in sorted(OUTPUT.glob("**/index.html")):
        rel = p.relative_to(OUTPUT).as_posix()
        if rel.startswith(SKIP_DIRS):
            continue
        out.append(rel)
    return out


def convert_html(html: str, table: dict, rel: str = "") -> str:
    """整頁轉字，但 href／src 的內容原封不動（只調整要去的位置）。"""
    held: list[str] = []
    here = posixpath.dirname(rel)

    def hold(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith("/") and not url.startswith(("//", "/en/", "/hans/", "/assets/")):
            # 站內絕對連結跟著搬進 /hans/
            url = "/hans" + url
        elif url and not url.startswith(("//", "http://", "https://", "mailto:", "tel:",
                                         "javascript:", "data:", "#", "/")):
            # 相對連結只有在「指到鏡像外面」時才要補一層：資產、字型這些不進 /hans/
            # （頁面與鏡像內的頁面一起往下搬，相對關係不變，例如 digitalmusic/19/）
            target = posixpath.normpath(posixpath.join(here, url))
            if target.split("/")[0] in ("assets", "vendor", "fonts") or target.startswith(".."):
                url = "../" + url
        held.append('%s="%s"' % (attr, url))
        return "\x00%d\x00" % (len(held) - 1)

    html = LINK_ATTR.sub(hold, html)
    html = "".join(table.get(ch, ch) for ch in html)
    html = re.sub(r"\x00(\d+)\x00", lambda m: held[int(m.group(1))], html)
    return html


def fix_site_urls(html: str) -> str:
    """絕對網址（canonical、og:url、JSON-LD）也要指到 /hans/。"""
    return ABS_SITE.sub(lambda m: SITE + "/hans" + (m.group(1) or "/"), html)


def build_page(rel: str, table: dict, made: list) -> None:
    src = OUTPUT / rel
    html = src.read_text(encoding="utf-8", errors="replace")
    dst = OUTPUT / "hans" / rel
    dst.parent.mkdir(parents=True, exist_ok=True)

    html = fix_site_urls(convert_html(html, table, rel))
    html = HTML_LANG.sub('<html lang="zh-Hans"', html, count=1)
    html = HREFLANG.sub("", html)

    urls, _ = bss.lang_links(dst)
    alts = "".join('<link rel="alternate" hreflang="%s" href="%s%s">\n' % (code, SITE, urls[key])
                   for code, key in (("zh-Hant", "zh"), ("zh-Hans", "hans"), ("en", "en")))
    html = CANON.sub(lambda m: m.group(0) + "\n" + alts.rstrip("\n"), html, count=1)
    html = SELECT.sub(lambda _m: bss.lang_selector(dst, "hans"), html, count=1)

    dst.write_text(html, encoding="utf-8")
    made.append(rel)


def main() -> int:
    if not OUTPUT.exists():
        print("找不到輸出目錄，先跑一次建置")
        return 1
    table = load_map()
    made: list[str] = []
    for rel in pages():
        build_page(rel, table, made)
    print("產生 %d 個簡體頁（對照表 %d 字）。" % (len(made), len(table)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
