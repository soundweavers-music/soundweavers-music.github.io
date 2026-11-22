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


# 會被搬進 /hans/ 的頁面（main() 先填好）。相對連結要判斷「指到的東西兩邊都有嗎」，
# 不能只看資料夾名字：doc/index.docx、daw.css 這種檔案不會有第二份。
MIRRORED: set[str] = set()


def load_map() -> dict:
    return json.loads(MAP_FILE.read_text(encoding="utf-8"))


def pages() -> list:
    out = []
    for p in sorted(OUTPUT.glob("**/index.html")):
        rel = p.relative_to(OUTPUT).as_posix()
        # 要比對「第一層資料夾名稱」而不是字首：用 startswith 的話
        # ensembles/ 會被 "en" 吃掉，/hans/ensembles/ 整批漏掉，
        # 所有簡體頁指過去的合奏百科連結就全 404（audit_links 會擋下部署）。
        if rel.split("/")[0] in SKIP_DIRS:
            continue
        out.append(rel)
    return out


def _mirror_url(url: str, here: str, rel: str) -> str:
    """一個相對連結在 /hans/ 的頁面上要寫成什麼。

    指到「頁面」的：整棵樹一起搬，相對關係不變，原樣留著。
    指到「別的檔案」的（assets、fonts 與 doc/index.docx、daw.css 這種）：/hans/ 只
    轉 HTML，不會有第二份，所以要改寫成從 /hans/<rel> 看過去、指到中文樹同一份
    檔案的路徑。以前一律補一層 `../`，深層頁面會指錯（/hans/tools/daw/ + ../daw.css
    → /hans/tools/daw.css）。
    """
    base, sep, frag = url.partition("#")
    if not base:
        return url
    target = posixpath.normpath(posixpath.join(here, base))
    if target.startswith(".."):
        return url                      # 指到站外，不關 /hans/ 的事
    if target in MIRRORED or target + "/index.html" in MIRRORED:
        return url                      # 頁面：兩邊一起搬
    # 兩邊都要用「從站台根算起」的絕對路徑，不然 relpath 會把相對路徑當成從目前
    # 工作目錄開始，/hans/ 這一層會少算，多退一層就跑到站台外面（../../../../assets）。
    new = posixpath.relpath("/" + target + ("/" if base.endswith("/") else ""),
                            "/" + posixpath.dirname("hans/" + rel))
    return new + sep + frag


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
            url = _mirror_url(url, here, rel)
        held.append('%s="%s"' % (attr, url))
        return "\x00%d\x00" % (len(held) - 1)

    html = LINK_ATTR.sub(hold, html)
    html = "".join(table.get(ch, ch) for ch in html)
    html = re.sub(r"\x00(\d+)\x00", lambda m: held[int(m.group(1))], html)
    return html


def fix_site_urls(html: str) -> str:
    """絕對網址（canonical、og:url、JSON-LD）也要指到 /hans/。"""
    return ABS_SITE.sub(lambda m: SITE + "/hans" + (m.group(1) or "/"), html)


def _nearest(url: str) -> str:
    """站內絕對路徑 → 真的存在的最接近頁面（不存在就一層層往上退，最後回首頁）。

    中文有、英文沒有的頁面（`/guitar/toc/`、`/vocal/research/1/`、`/manage/`…）
    在語言選單裡直接指過去就是 404，所以退到最近一個存在的目錄（例如 /en/guitar/）。
    """
    cur = url
    while True:
        d = cur.strip("/")
        if not d:
            return cur
        if ((OUTPUT / d / "index.html").exists()
                or (d.startswith("hans/") and d[5:] in MIRRORED)):   # 正在產生的簡體頁
            return cur
        parent = posixpath.dirname(d)
        cur = "/" + (parent + "/" if parent else "")


def fix_language_links() -> int:
    """最後一關：每一頁的語言選單只連到真的存在的那一頁。

    這一關要等 /en/ 與 /hans/ 都建完才跑，不然判斷不準。
    """
    changed = 0
    for p in sorted(OUTPUT.rglob("index.html")):
        rel = p.relative_to(OUTPUT).as_posix()
        if rel.split("/")[0] in ("assets", "fonts", "vendor", "scripts"):
            continue
        html = p.read_text(encoding="utf-8", errors="replace")
        m = SELECT.search(html)
        if not m:
            continue
        urls, cur = bss.lang_links(p)
        opts = "".join(
            '<option value="%s"%s%s>%s</option>' % (
                bss.resolve_url(p, _nearest(urls[code])),
                ' lang="en"' if code == "en" else "",
                " selected" if code == cur else "",
                label)
            for code, label in bss.LANG_ORDER)
        new = ('<select class="nav-lang" aria-label="語言／Language" '
               'onchange="if(this.value)location.href=this.value">' + opts + "</select>")
        if new != m.group(0):
            p.write_text(html[:m.start()] + new + html[m.end():], encoding="utf-8")
            changed += 1
    return changed


def build_page(rel: str, table: dict, made: list) -> None:
    src = OUTPUT / rel
    html = src.read_text(encoding="utf-8", errors="replace")
    dst = OUTPUT / "hans" / rel
    dst.parent.mkdir(parents=True, exist_ok=True)

    html = fix_site_urls(convert_html(html, table, rel))
    html = HTML_LANG.sub('<html lang="zh-Hans"', html, count=1)
    html = HREFLANG.sub("", html)

    urls, _ = bss.lang_links(dst)
    alts = "".join('<link rel="alternate" hreflang="%s" href="%s%s">\n' % (code, SITE, _nearest(urls[key]))
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
        MIRRORED.add(rel)
    for rel in sorted(MIRRORED):
        build_page(rel, table, made)
    print("產生 %d 個簡體頁（對照表 %d 字）。" % (len(made), len(table)))
    print("語言選單修正 %d 頁。" % fix_language_links())
    return 0


if __name__ == "__main__":
    sys.exit(main())
