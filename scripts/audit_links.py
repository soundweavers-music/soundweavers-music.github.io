#!/usr/bin/env python3
"""掃出站內壞連結。

只檢查站內連結（相對路徑與 `/xxx/` 根路徑），外部連結一律跳過——那要連網，
而且會因為對方擋爬蟲而誤報。

判斷方式：把連結換算成輸出目錄裡的實際路徑，看那個檔案（或那個資料夾裡的
index.html）在不在。產生的頁面是 `x/index.html`，所以 `/tools/lrc/` 這種
結尾是斜線的要當成資料夾。

用法：
    python scripts/audit_links.py            # 全部
    python scripts/audit_links.py tools      # 只看某個資料夾底下的頁面
"""
from __future__ import annotations

import posixpath
import re
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT = BASE_DIR / "outputs" / "world-instruments-static"

LINK = re.compile(r'(?:href|src)="([^"]*)"')
SKIP_PREFIX = ("http://", "https://", "//", "mailto:", "tel:", "javascript:", "data:", "#")


def main(argv: list[str]) -> int:
    if not OUT.exists():
        print(f"找不到 {OUT}——先跑一次建置")
        return 1
    only = argv[0].strip("/") if argv else ""

    # 先把輸出目錄的檔案與資料夾記下來，之後全部在記憶體裡比對（幾萬個連結，
    # 一個一個問檔案系統會太慢）
    files, dirs = set(), set()
    for p in OUT.rglob("*"):
        rel = p.relative_to(OUT).as_posix()
        (dirs if p.is_dir() else files).add(rel)

    def resolves(target: str) -> bool:
        target = target.rstrip("/")
        if target in ("", "."):
            return True
        return target in files or (target in dirs and f"{target}/index.html" in files)

    bad = defaultdict(list)
    checked = 0
    for page in OUT.rglob("*.html"):
        page_rel = page.relative_to(OUT).as_posix()
        if only and not page_rel.startswith(only):
            continue
        here = posixpath.dirname(page_rel)
        try:
            html = page.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        # 內嵌腳本裡的網址是拼接出來的（例：' + u + '），不是靜態連結，先去掉
        html = re.sub(r"(?is)<script\b.*?</script>", "", html)
        for raw in LINK.findall(html):
            if not raw or raw.startswith(SKIP_PREFIX):
                continue
            url = urllib.parse.unquote(raw.split("#")[0].split("?")[0])
            if not url:
                continue
            target = posixpath.normpath(
                url.lstrip("/") if url.startswith("/") else posixpath.join(here, url))
            checked += 1
            if not resolves(target):
                bad[(here, raw)].append(page_rel)

    print(f"檢查 {checked} 個站內連結，壞掉 {len(bad)} 種")
    for (here, raw), pages in sorted(bad.items(), key=lambda kv: -len(kv[1]))[:60]:
        extra = f"（{len(pages)} 頁）" if len(pages) > 1 else f"（{pages[0]}）"
        print(f"  [{here or 'root'}] {raw} {extra}")
    return 0 if not bad else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
