#!/usr/bin/env python3
"""把中文頁面（工具、關於、說明）做成英文版：抽字串 → 翻 → 產出 /en/。

工具頁是手寫的 HTML＋JS（指版、抓和弦、調音器、LRC 工作室），關於頁是
build_static_site.py 產生的樣板。兩種都不適合「再寫一份英文版」——改一次要改
兩份，一定走鐘。所以做法跟圖一樣：中文頁是唯一真相，英文版是建置時換字生出來的。

    python scripts/page_i18n.py extract     # 掃中文頁，抽出要翻的字串
    （翻譯 work/page_strings/*.json）
    python scripts/page_i18n.py merge       # 合併成 scripts/page_strings_en.py
    python scripts/page_i18n.py build       # 產生 outputs/…/en/… 的英文頁

字典沒收錄的字串會原樣保留中文並列出來，所以覆蓋率可以檢查，不用靠眼睛看。

英文頁的位置
------------
    中文                                 英文
    /tools/                              /en/tools/
    /tools/fretboard/                    /en/tools/fretboard/
    /tools/fretboard/guide/              /en/tools/fretboard/guide/
    /chord-detection/                    /en/chord-detection/
    /about/  /about/author/  /about/works/   /en/about/…
    /recruit/  /contact/                 /en/recruit/  /en/contact/
"""
from __future__ import annotations

import argparse
import html
import os
import pathlib
import posixpath
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT = BASE_DIR / "outputs" / "world-instruments-static"
WORK = BASE_DIR / "work" / "page_strings"
STRINGS = BASE_DIR / "scripts" / "page_strings_en.py"

# 要產生英文版的中文頁（相對 outputs/）
PAGES = [
    "tools/index.html",
    "tools/fretboard/index.html",
    "tools/fretboard/guide/index.html",
    "tools/tuner/index.html",
    "tools/tuner/guide/index.html",
    "tools/lrc/index.html",
    "tools/lrc/guide/index.html",
    "chord-detection/index.html",
    "chord-detection/guide/index.html",
    "tools/daw/index.html",
    "tools/daw/guide/index.html",
    "about/index.html",
    "about/author/index.html",
    "about/works/index.html",
    "recruit/index.html",
    "contact/index.html",
]

# 這些中文連結有「不是同路徑」的英文對應（課程在 /en/dawcourse/）
EXTRA_LINKS = {"/tools/daw/learn/": "/en/dawcourse/", "/tools/daw/learn": "/en/dawcourse/"}

CJK = re.compile(r"[一-鿿]")
# 文字節點；<script>／<style> 先整段拿掉，不然會抓到程式碼裡的字串
TEXT_NODE = re.compile(r">([^<>{}]+)<")
ATTR = re.compile(r'\b(?:title|placeholder|aria-label|alt|content)="([^"]*)"')
TAG_RE = re.compile(r"<(script|style)\b.*?</\1>", re.S)

HEADER = '''"""工具／關於／說明頁的中文 → 英文字串表。

由 scripts/page_i18n.py merge 從 work/page_strings/*.json 產生，不要手改。
**一頁一份**：同一個中文字在不同頁上意思不一樣（按鈕的「播放」與說明裡的
「播放」不是同一件事），扁平表會讓後面的頁蓋掉前面的。
"""
from __future__ import annotations

EN: dict[str, dict[str, str]] = {
'''


def load_en() -> dict[str, dict[str, str]]:
    if not STRINGS.exists():
        return {}
    sys.path.insert(0, str(STRINGS.parent))
    try:
        mod = __import__("page_strings_en")
        return {k: dict(v) for k, v in mod.EN.items()}
    finally:
        sys.path.pop(0)


def _key(rel: str) -> str:
    return rel.replace("/index.html", "").strip("/").replace("/", "__") or "root"


# 內嵌的 <script>：工具頁的選單與提示都是 JS 產生的，光翻 HTML 一定不夠
QUOTES = "'`"
SCRIPT_RE = re.compile("<script(?![^>]*src=)[^>]*>(.*?)</script>", re.S)


def _js_strings(block: str) -> list[str]:
    """把 JS 原始碼裡的字串常值挑出來。

    用逐字掃描而不是正規表示式：JS 裡的跳脫（\' 之類）會讓「按引號切一半取奇數位」
    的作法整段錯位，抓到的字就少一大半（實測 tuner 頁只抓到 1 條）。
    """
    out: list[str] = []
    i, n = 0, len(block)
    while i < n:
        ch = block[i]
        if ch in "'\"`":
            quote = ch
            i += 1
            buf: list[str] = []
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
            if s and CJK.search(s) and len(s) <= 120:
                out.append(s)
            continue
        i += 1
    return out


def script_strings(page: str) -> list[str]:
    out: list[str] = []
    for block in SCRIPT_RE.findall(page):
        for s in _js_strings(block):
            if s not in out:
                out.append(s)
    return out


def strings_of(page: str) -> list[str]:
    """一頁裡要翻的字串：可見文字節點 ＋ title/placeholder/aria-label ＋ JS 字串。"""
    body = TAG_RE.sub("", page)
    out: list[str] = []

    def take(s: str) -> None:
        s = html.unescape(s).strip()
        s = re.sub(r"\s+", " ", s)
        if s and CJK.search(s) and s not in out and len(s) < 4000:   # 專輯介紹那種長段落也要翻
            out.append(s)

    for m in TEXT_NODE.finditer(body):
        take(m.group(1))
    for m in ATTR.finditer(body):
        take(m.group(1))
    for s in script_strings(page):
        if s not in out:
            out.append(s)
    return out


def cmd_extract() -> int:
    WORK.mkdir(parents=True, exist_ok=True)
    have = load_en()
    total = todo = 0
    for rel in PAGES:
        path = OUTPUT / rel
        if not path.exists():
            print("  ! 找不到 %s（先跑建置）" % rel)
            continue
        keys = strings_of(path.read_text(encoding="utf-8"))
        if not keys:
            continue
        fig = _key(rel)
        # 保留舊 JSON 裡已經翻好的條目：抽字串只是補新的，不該把長段落之類
        # 這次沒抽到的內容清掉
        prev = {}
        if (WORK / (fig + ".json")).exists():
            try:
                prev = {k: v for k, v in json.loads(
                    (WORK / (fig + ".json")).read_text(encoding="utf-8")).items() if v}
            except Exception:
                prev = {}
        payload = {**prev, **{k: have.get(fig, {}).get(k, prev.get(k, "")) for k in keys}}
        (WORK / (fig + ".json")).write_text(
            json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        total += len(keys)
        todo += sum(1 for v in payload.values() if not v)
    print("字串 %d 條，待翻 %d 條。" % (total, todo))
    return 0


def cmd_merge() -> int:
    if not WORK.exists():
        print("還沒有 work/page_strings，先跑 extract。")
        return 1
    merged: dict[str, dict[str, str]] = {}
    blank: list[str] = []
    for path in sorted(WORK.glob("*.json")):
        for zh, en in json.loads(path.read_text(encoding="utf-8")).items():
            en = (en or "").strip()
            if not en:
                blank.append("%s: %s" % (path.stem, zh))
            else:
                merged.setdefault(path.stem, {})[zh] = en
    chunks = []
    for fig in sorted(merged):
        rows = "\n".join(
            "        %s: %s," % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False))
            for k, v in sorted(merged[fig].items()))
        chunks.append("    %s: {\n%s\n    }," % (json.dumps(fig, ensure_ascii=False), rows))
    STRINGS.write_text(HEADER + "\n".join(chunks) + "\n}\n", encoding="utf-8")
    n = sum(len(v) for v in merged.values())
    print("寫出 %s：%d 頁 %d 條。" % (STRINGS.relative_to(BASE_DIR), len(merged), n))
    if blank:
        print("還沒翻 %d 條：" % len(blank))
        for b in blank[:30]:
            print("  " + b)
        if len(blank) > 30:
            print("  …還有 %d 條" % (len(blank) - 30))
        return 1
    return 0


HEADER_RE = re.compile(r'<header class="site-header">.*?</header>', re.S)
FOOTER_RE = re.compile(r'<footer class="site-footer">.*?</footer>', re.S)
BACKTOP_RE = re.compile(r'aria-label="回頂部"')



def asset_rel(page_path, url: str) -> str:
    """站內絕對網址 → 從這個頁面看過去的相對路徑。"""
    here = posixpath.dirname("/en/" + str(page_path.relative_to(OUTPUT / "en")).replace("\\", "/"))
    return posixpath.relpath(url, here)


def swap_chrome(page: str, dst: Path) -> str:
    """把中文頁的標頭／頁尾換成英文版，回頂部按鈕的 aria-label 也換。"""
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    import build_vocal_extra as bve
    page = HEADER_RE.sub(lambda _m: bve.site_header_en(dst), page, count=1)
    page = FOOTER_RE.sub(lambda _m: bve.site_footer_en(dst), page, count=1)
    return BACKTOP_RE.sub('aria-label="Back to top"', page)



LINK_RE = re.compile(r'(href|src)="([^"]+)"')


def _abs_href(href: str, zh_dir: str) -> str:
    """頁面上的連結 → 以 / 開頭的站內絕對路徑（外部連結回傳空字串）。

    相對連結要從「中文頁所在目錄」解析，不是直接加斜線：中文 /about/ 上的
    `author/` 是 /about/author/，不是 /author/。
    """
    if href.startswith(("http://", "https://", "mailto:", "#", "data:", "tel:")):
        return ""
    if href.startswith("/"):
        return posixpath.normpath(href) + ("/" if href.endswith("/") else "")
    return posixpath.normpath(posixpath.join(zh_dir, href)) + ("/" if href.endswith("/") else "")


def _en_target(zh_url: str) -> str:
    """中文站內路徑 → 英文版路徑；沒有英文版就回傳空字串。"""
    if zh_url in EXTRA_LINKS:
        return EXTRA_LINKS[zh_url]
    norm = zh_url if zh_url.endswith("/") else zh_url
    for rel in PAGES:
        zh_page = "/" + rel.replace("/index.html", "/")
        if norm == zh_page:
            return "/en/" + rel.replace("/index.html", "/")
    return ""


def remap_links(page: str, rel: str) -> str:
    """把整頁的站內連結改寫成「從英文頁看過去正確」的形式。

    英文頁在 /en/<同一條路徑>，所以連結不能只是加一個 ../：
    目的地本身也有英文版時要指到英文版，沒有才退回中文頁（並補一層 ../）。
    """
    en_dir = posixpath.dirname("/en/" + rel)
    zh_dir = posixpath.dirname("/" + rel)

    def fix(m):
        attr, href = m.group(1), m.group(2)
        abs_zh = _abs_href(href, zh_dir)
        if not abs_zh:
            return m.group(0)                       # 外部連結／錨點不動
        target = _en_target(abs_zh)
        resolved = pathlib.PurePosixPath(target or abs_zh)
        # 沒有英文版的中文頁：英文頁多一層，所以要多退一層回去
        rel_path = posixpath.relpath(str(resolved), en_dir)
        if target:
            rel_path = rel_path or "."
        if resolved.name == "" and not rel_path.endswith("/"):
            rel_path += "/"
        return '%s="%s"' % (attr, rel_path)

    return LINK_RE.sub(fix, page)


def cmd_build() -> int:
    en = load_en()
    made = missing_all = 0
    for rel in PAGES:
        src = OUTPUT / rel
        if not src.exists():
            continue
        page = src.read_text(encoding="utf-8")
        fig = _key(rel)
        table = en.get(fig, {})
        missing: list[str] = []

        def conv(raw: str) -> str:
            raw_s = re.sub(r"\s+", " ", html.unescape(raw))
            key = raw_s.strip()
            if not key or not CJK.search(key):
                return raw
            val = table.get(key)
            if val is None:
                missing.append(key)
                return raw
            lead = raw[:len(raw) - len(raw.lstrip())]
            trail = raw[len(raw.rstrip()):]
            return lead + html.escape(val) + trail

        body = page
        # 先把 <script>/<style> 遮起來，避免翻到程式碼
        slots: list[str] = []
        def hide(m):
            slots.append(m.group(0))
            return "\x00%d\x00" % (len(slots) - 1)
        body = TAG_RE.sub(hide, body)
        body = TEXT_NODE.sub(lambda m: ">" + conv(m.group(1)) + "<", body)
        body = ATTR.sub(lambda m: m.group(0).split("=")[0] + '="' + conv(m.group(1)) + '"', body)
        body = re.sub(r"\x00(\d+)\x00", lambda m: slots[int(m.group(1))], body)

        # 語系與內部連結
        body = body.replace('<html lang="zh-Hant">', '<html lang="en">', 1)
        for zh_rel in PAGES:
            zh_url = "/" + zh_rel.replace("/index.html", "/")
            en_url = "/en/" + zh_rel.replace("/index.html", "/")
            body = body.replace('href="%s"' % zh_url, 'href="%s"' % en_url)
        body = remap_links(body, rel)

        dst = OUTPUT / "en" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        # JS 事後塞進畫面的字（選單、狀態列）靜態換不到：把字典內嵌，
        # 再由 assets/i18n-runtime.js 在載入後套上去
        if table:
            js = json.dumps(table, ensure_ascii=False).replace("</", "<\\/")
            inject = ('<script>window.__PAGE_I18N=%s;</script>'
                      '<script src="%s"></script>' %
                      (js, asset_rel(dst, "/assets/i18n-runtime.js")))
            # 插在「最後一個」</body> 之前：頁面的 JS 裡也可能有 "</body>" 字串
            # （抓和弦有匯出 HTML 的功能），用第一個會把 script 切斷，
            # 整段程式碼就原樣印在頁面上
            cut = body.rfind("</body>")
            if cut != -1:
                body = body[:cut] + inject + "\n" + body[cut:]

        body = swap_chrome(body, dst)
        dst.write_text(body, encoding="utf-8")
        made += 1
        if missing:
            missing_all += len(missing)
            print("  %-38s 還有 %d 條沒翻" % (rel, len(set(missing))))
    print("產生 %d 個英文頁；未翻譯字串 %d 條。" % (made, missing_all))
    return 1 if missing_all else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("action", choices=["extract", "merge", "build"])
    a = ap.parse_args()
    return {"extract": cmd_extract, "merge": cmd_merge, "build": cmd_build}[a.action]()


if __name__ == "__main__":
    sys.exit(main())
