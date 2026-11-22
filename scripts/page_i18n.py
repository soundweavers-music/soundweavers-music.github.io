#!/usr/bin/env python3
"""把中文頁面做成英文版：中文頁是唯一真相，建置時換字生出 /en/ 的副本。

工具頁、關於頁、樂器百科、國家頁……都是手寫 HTML 或樣板產生的，再寫一份英文版
一定走鐘。所以：

    python scripts/page_i18n.py extract   # 掃 outputs，抽出每個頁面要翻的字串
    （翻譯 content/en/_pages/*.json）
    python scripts/page_i18n.py build     # 產生 outputs/.../en/... 的英文頁
    python scripts/page_i18n.py stats     # 還剩多少沒翻

字典
----
一頁一個 JSON，放在 `content/en/_pages/`（要進版控）：

    _shared.json              導覽列、頁尾、播放器——出現在 20 頁以上的字串
    instruments__enanga.json  單一樂器頁
    countries__japan.json     單一國家頁

頁面鍵＝輸出路徑去掉 index.html、斜線換成 `__`。建置時先查 `_shared`，再查該頁
自己的表；查不到的字串原樣保留中文並列出來，所以覆蓋率可以檢查。

英文頁的位置是 `/en/<同一條路徑>`，相對連結會重新算過（目的地有英文版就指英文版）。
"""
from __future__ import annotations

import argparse
import html
import json
import posixpath
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT = BASE_DIR / "outputs" / "world-instruments-static"
PAGES_DIR = BASE_DIR / "content" / "en" / "_pages"
SHARED_MIN_PAGES = 20

CJK = re.compile(r"[一-鿿]")
TEXT_NODE = re.compile(r">([^<>{}]+)<")
ATTR = re.compile(r'\b(?:title|placeholder|aria-label|alt|content)="([^"]*)"')
TAG_RE = re.compile(r"<(script|style)\b.*?</\1>", re.S)
QUOTES = "'\"`"
SCRIPT_RE = re.compile("<script(?![^>]*src=)[^>]*>(.*?)</script>", re.S)

# 這些中文連結的英文版不是同一條路徑
EXTRA_LINKS = {
    "/tools/daw/learn/": "/en/dawcourse/",
    "/tools/daw/learn": "/en/dawcourse/",
}
# /tools/daw/learn/NN/ 是中文的 DAW 課程，英文版是 build_en_courses.py 建的
# /en/dawcourse/chNN/。同樣的內容不再翻第二份：英文站那邊直接轉址過去。
for _n in range(1, 25):
    EXTRA_LINKS["/tools/daw/learn/%02d/" % _n] = "/en/dawcourse/ch%02d/" % _n
    EXTRA_LINKS["/tools/daw/learn/%02d" % _n] = "/en/dawcourse/ch%02d/" % _n

DAW_LESSON = re.compile(r"tools/daw/learn/(\d+)")
REDIRECT_KEYS = {"tools__daw__learn"} | {"tools__daw__learn__%02d" % n for n in range(1, 25)}

# 這些區塊已經有專門的英文建置程式（build_en_courses.py）：章節頁在
# /en/<課程>/chNN/，目錄頁在 /en/<課程>/。不要再翻一份放 /en/<課程>/NN/，
# 那會變成兩份內容不同的英文頁，而且彼此互相覆蓋。
EN_COURSE_SLUGS = {"vocal", "digitalmusic", "guitar", "ukulele", "mandolin", "songwriting"}
for _s in EN_COURSE_SLUGS:
    REDIRECT_KEYS.add(_s)

# 這些區塊的英文頁由別的建置程式直接寫在「同一條路徑」（/theory/ → /en/theory/），
# page_i18n 連碰都不能碰：以前沒擋，產生的中文副本把英文頁蓋掉了。
SAME_PATH_SECTIONS = {"theory"}


def redirect_for(rel: str) -> str:
    """這一頁的英文版不在 /en/<路徑>，而是已經有現成的英文頁 → 轉址目的地。

    回傳空字串＝照正常流程翻成 /en/<同一條路徑>。
    """
    d = posixpath.dirname(rel)
    seg = d.split("/")
    if d == "tools/daw/learn":
        return "/en/dawcourse/"
    m = DAW_LESSON.fullmatch(d)
    if m:
        return "/en/dawcourse/ch%02d/" % int(m.group(1))
    if len(seg) == 1 and seg[0] in EN_COURSE_SLUGS:
        return "/en/%s/" % seg[0]
    if len(seg) == 2 and seg[0] in EN_COURSE_SLUGS and seg[1].isdigit():
        tgt = "/en/%s/ch%02d/" % (seg[0], int(seg[1]))
        # 英文頁就在同一條路徑（吉他、烏克麗麗、詞曲創作）→ 不是轉址，是「不要碰」
        return "" if tgt.strip("/") == d else tgt
    return ""

# /hans/ 是簡體版，也是中文（只是換了字面），不是「還要翻成英文」的頁面
SKIP_PREFIX = ("en/", "hans/", "assets/", "vendor/", "manage/", "scripts/")


# ── 字典 ────────────────────────────────────────────────────────
def load_en() -> dict:
    out = {}
    if not PAGES_DIR.exists():
        return out
    for f in sorted(PAGES_DIR.glob("*.json")):
        try:
            out[f.stem] = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            out[f.stem] = {}
    return out


def save_page(key: str, table: dict) -> None:
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    (PAGES_DIR / (key + ".json")).write_text(
        json.dumps(table, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8")


def _key(rel: str) -> str:
    return rel.replace("/index.html", "").strip("/").replace("/", "__") or "root"


def discover_pages() -> list:
    """所有還帶著中文的 index.html（英文版要一一對應產生）。"""
    pages = []
    for p in sorted(OUTPUT.glob("**/index.html")):
        rel = p.relative_to(OUTPUT).as_posix()
        if rel.startswith(SKIP_PREFIX):
            continue
        head = p.read_text(encoding="utf-8", errors="replace")[:200000]
        if not CJK.search(head):
            continue
        pages.append(rel)
    return pages


# ── 抽字串 ──────────────────────────────────────────────────────
def _js_strings(block: str) -> list:
    """JS 原始碼裡的字串常值（逐字掃描，跳脫才不會讓整段錯位）。"""
    out = []
    i, n = 0, len(block)
    while i < n:
        ch = block[i]
        if ch in QUOTES:
            quote = ch
            i += 1
            buf = []
            while i < n:
                c = block[i]
                if c == "\\":
                    buf.append(block[i:i + 2])
                    i += 2
                    continue
                if c == quote:
                    i += 1
                    break
                buf.append(c)
                i += 1
            s = "".join(buf).strip()
            code_like = (";" in s or "{" in s or "}" in s or "=>" in s
                         or "\n" in s or s.startswith("/") or s.startswith(".")
                         or "<" in s or ">" in s)   # innerHTML 片段不是給人看的字
            if s and CJK.search(s) and len(s) <= 120 and not code_like:
                out.append(s)
            continue
        i += 1
    return out


def strings_of(page: str) -> list:
    """一頁要翻的字串：可見文字 ＋ title/placeholder/aria-label ＋ JS 字串。"""
    # 標頭與 banner 在英文頁是整個換掉的（site_header_en），不要抽進來翻
    page = HEADER_RE.sub("", page)
    body = TAG_RE.sub("", page)
    out = []

    def take(s: str) -> None:
        s = re.sub(r"\s+", " ", html.unescape(s)).strip()
        # 網址不翻：國家／子分類頁的 canonical 帶著中文路徑（/subcategories/取樣與磁帶/）
        if "://" in s or s.startswith(("/", "#")):
            return
        if s and CJK.search(s) and s not in out and len(s) < 4000:
            out.append(s)

    for m in TEXT_NODE.finditer(body):
        take(m.group(1))
    for m in ATTR.finditer(body):
        take(m.group(1))
    for block in SCRIPT_RE.findall(page):
        for s in _js_strings(block):
            if s not in out:
                out.append(s)
    return out


def cmd_extract() -> int:
    have = load_en()
    seen, per_page = {}, {}
    total = 0
    for rel in discover_pages():
        sec = posixpath.dirname(rel).split("/")[0]
        if sec in EN_COURSE_SLUGS or sec in SAME_PATH_SECTIONS or redirect_for(rel):
            continue                      # 不翻的頁不要抽，字典才不會白長
        path = OUTPUT / rel
        if not path.exists():
            continue
        keys = strings_of(path.read_text(encoding="utf-8"))
        if not keys:
            continue
        fig = _key(rel)
        prev = have.get(fig, {})
        per_page[fig] = {k: prev.get(k, "") for k in keys}
        total += len(keys)
        for k in keys:
            seen[k] = seen.get(k, 0) + 1

    # 每頁都有的外框字串抽出來只翻一次
    shared_keys = {k for k, n in seen.items() if n >= SHARED_MIN_PAGES}
    shared = {k: have.get("_shared", {}).get(k, "") for k in shared_keys}
    save_page("_shared", shared)
    for fig, payload in per_page.items():
        save_page(fig, {k: v for k, v in payload.items() if k not in shared_keys})
    print("頁數 %d、字串 %d 條（共用 %d 條）" % (len(per_page), total, len(shared)))
    todo_s = sum(1 for v in shared.values() if not v)
    todo_p = sum(1 for payload in per_page.values()
                 for k, v in payload.items() if k not in shared_keys and not v)
    print("待翻：共用 %d、各頁合計 %d" % (todo_s, todo_p))
    return 0


# ── 連結與外框 ──────────────────────────────────────────────────
LINK_RE = re.compile(r'(href|src)="([^"]+)"')
# 中文頁的標頭＋緊接的 banner 條：英文標頭自己就帶 banner，兩份都留會多一條
HEADER_RE = re.compile(r'<header class="site-header">.*?</header>'
                       r'(?:\s*<div class="site-banner"[^>]*></div>)?', re.S)
FOOTER_RE = re.compile(r'<footer class="site-footer">.*?</footer>', re.S)
BACKTOP_RE = re.compile(r'aria-label="回頂部"')


def _abs_href(href: str, zh_dir: str) -> str:
    """頁面上的連結 → 站內絕對路徑（外部連結／錨點回傳空字串）。"""
    if href.startswith(("http://", "https://", "mailto:", "#", "data:", "tel:")):
        return ""
    if href.startswith("/"):
        return posixpath.normpath(href) + ("/" if href.endswith("/") else "")
    joined = posixpath.normpath(posixpath.join(zh_dir, href))
    return joined + ("/" if href.endswith("/") else "")


def _en_target(zh_url: str) -> str:
    """中文站內路徑 → 英文版路徑；這一頁沒有英文版就回傳空字串。"""
    if zh_url in EXTRA_LINKS:
        return EXTRA_LINKS[zh_url]
    rel = zh_url.strip("/")
    if not rel:
        return "/en/"
    if (OUTPUT / rel / "index.html").exists():
        return "/en/" + rel + "/"
    return ""


def remap_links(page: str, rel: str) -> str:
    """把整頁的站內連結改寫成「從英文頁看過去正確」的形式。

    英文頁在 /en/<同一條路徑>，所以不能只加一層 ../：目的地本身有英文版時要
    指到英文版，沒有才退回中文頁（那時才補一層 ../）。
    """
    en_dir = posixpath.dirname("/en/" + rel)
    zh_dir = posixpath.dirname("/" + rel)

    def fix(m):
        attr, href = m.group(1), m.group(2)
        abs_zh = _abs_href(href, zh_dir)
        if not abs_zh:
            return m.group(0)
        target = _en_target(abs_zh)
        resolved = target or abs_zh
        rel_path = posixpath.relpath(resolved, en_dir)
        if resolved.endswith("/") and not rel_path.endswith("/"):
            rel_path += "/"
        return '%s="%s"' % (attr, rel_path)

    return LINK_RE.sub(fix, page)


def asset_rel(page_path: Path, url: str) -> str:
    """站內絕對網址 → 從這個頁面看過去的相對路徑。"""
    rel = str(page_path.relative_to(OUTPUT / "en")).replace("\\", "/")
    here = posixpath.dirname("/en/" + rel)
    return posixpath.relpath(url, here)


def swap_chrome(page: str, dst: Path) -> str:
    """中文頁的標頭／頁尾換成英文版；回頂部按鈕的 aria-label 也換。"""
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    import build_vocal_extra as bve
    page = HEADER_RE.sub(lambda _m: bve.site_header_en(dst), page, count=1)
    page = FOOTER_RE.sub(lambda _m: bve.site_footer_en(dst), page, count=1)
    return BACKTOP_RE.sub('aria-label="Back to top"', page)


# ── 產生英文頁 ───────────────────────────────────────────────────
REDIRECT_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url={url}">
<link rel="canonical" href="https://soundweavers-music.github.io{target}">
</head>
<body>
<p>This page lives in the English course now: <a href="{url}">{target}</a></p>
</body>
</html>
"""


def write_redirect(rel: str, target: str) -> None:
    dst = OUTPUT / "en" / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    here = posixpath.dirname("/en/" + rel)
    url = posixpath.relpath(target, here)
    if target.endswith("/") and not url.endswith("/"):
        url += "/"
    dst.write_text(REDIRECT_PAGE.replace("{url}", url).replace("{target}", target),
                   encoding="utf-8")


def cmd_build() -> int:
    en = load_en()
    shared = en.get("_shared", {})
    made = missing_total = redirected = 0
    skipped: list = []
    for rel in discover_pages():
        src = OUTPUT / rel
        if not src.exists():
            continue
        target = redirect_for(rel)
        if target:
            # 目標頁還沒建出來就不要轉址（不然會轉到 404），也不要退回去生中文頁
            if (OUTPUT / target.strip("/") / "index.html").exists():
                write_redirect(rel, target)
                redirected += 1
            else:
                skipped.append(rel)
            continue
        sec = posixpath.dirname(rel).split("/")[0]
        if sec in SAME_PATH_SECTIONS or sec in EN_COURSE_SLUGS:
            continue          # 課程頁由 build_en_courses.py 負責，這裡一份都不寫
        fig = _key(rel)
        table = dict(shared)
        table.update(en.get(fig, {}))
        missing = []

        def conv(raw: str) -> str:
            key = re.sub(r"\s+", " ", html.unescape(raw)).strip()
            if not key or not CJK.search(key):
                return raw
            if "://" in key or key.startswith(("/", "#")):
                return raw          # 網址（canonical、og:url）原樣留著
            val = table.get(key)
            # 空字串＝還沒翻，不能當成譯文：那會把整段文字換成空白
            if not val:
                missing.append(key)
                return raw
            lead = raw[:len(raw) - len(raw.lstrip())]
            trail = raw[len(raw.rstrip()):]
            return lead + html.escape(val) + trail

        body = src.read_text(encoding="utf-8")
        slots = []

        def hide(m):
            slots.append(m.group(0))
            return "\x00%d\x00" % (len(slots) - 1)

        body = TAG_RE.sub(hide, body)
        # 導覽列等一下會換成英文版，先藏起來——不然語言選單的中文字會被算成「待翻」
        body = HEADER_RE.sub(hide, body)
        body = TEXT_NODE.sub(lambda m: ">" + conv(m.group(1)) + "<", body)
        body = ATTR.sub(lambda m: m.group(0).split("=")[0] + '="' + conv(m.group(1)) + '"', body)
        body = re.sub(r"\x00(\d+)\x00", lambda m: slots[int(m.group(1))], body)
        body = body.replace('<html lang="zh-Hant">', '<html lang="en">', 1)
        body = remap_links(body, rel)

        dst = OUTPUT / "en" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        if table:
            js = json.dumps(table, ensure_ascii=False).replace("</", "<\\/")
            inject = ('<script>window.__PAGE_I18N=%s;</script>'
                      '<script src="%s"></script>' %
                      (js, asset_rel(dst, "/assets/i18n-runtime.js")))
            cut = body.rfind("</body>")
            if cut != -1:
                body = body[:cut] + inject + "\n" + body[cut:]

        body = swap_chrome(body, dst)
        dst.write_text(body, encoding="utf-8")
        made += 1
        if missing:
            missing_total += len(set(missing))
            print("  %-46s 還有 %d 條沒翻" % (rel, len(set(missing))))
    print("產生 %d 個英文頁（另有 %d 頁轉址、%d 頁沒有英文版可轉）；未翻譯字串 %d 條。"
          % (made, redirected, len(skipped), missing_total))
    return 1 if missing_total else 0


def cmd_stats() -> int:
    en = load_en()
    shared = en.get("_shared", {})
    # 轉址頁（見 redirect_for）不翻譯，也不該算進待翻
    pages = {k: v for k, v in en.items() if k != "_shared" and k not in REDIRECT_KEYS}
    done_s = sum(1 for v in shared.values() if v)
    todo_s = len(shared) - done_s
    done_p = sum(1 for t in pages.values() for v in t.values() if v)
    todo_p = sum(1 for t in pages.values() for v in t.values() if not v)
    print("共用外框：%d / %d 已翻" % (done_s, len(shared)))
    print("各頁內容：%d 頁、%d / %d 已翻" % (len(pages), done_p, done_p + todo_p))
    return 0 if not (todo_s + todo_p) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("action", choices=["extract", "build", "stats"])
    a = ap.parse_args()
    return {"extract": cmd_extract, "build": cmd_build, "stats": cmd_stats}[a.action]()


if __name__ == "__main__":
    sys.exit(main())
