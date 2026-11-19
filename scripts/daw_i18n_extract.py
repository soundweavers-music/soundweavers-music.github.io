#!/usr/bin/env python3
"""從 daw-studio 抽出要翻譯的介面字串（給 daw_i18n_translate.py 用）。

只抓「看得到」的中文字串：
  - HTML 的文字節點與 title / placeholder / aria-label 屬性
  - JS 裡的引號字串與 template literal（含 ${...} 的先跳過，執行期對不到）

輸出 work/daw-strings.json（排序後的去重清單）。
"""
from __future__ import annotations

import html as htmllib
import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "daw-studio"
OUT = BASE / "work" / "daw-strings.json"

CJK = re.compile(r"[㐀-鿿]")


def main() -> int:
    found: set[str] = set()

    html = (SRC / "index.html").read_text(encoding="utf-8")
    # 文字節點
    for m in re.finditer(r">([^<>{}]*[㐀-鿿][^<>{}]*)<", html):
        s = m.group(1).strip()
        if s:
            found.add(s)
    # 屬性
    for m in re.finditer(r'(?:title|placeholder|aria-label|alt)="([^"]*[㐀-鿿][^"]*)"', html):
        found.add(m.group(1).strip())

    # JS / HTML：引號字串
    for path in sorted((SRC / "js").glob("*.js")):
        src = path.read_text(encoding="utf-8")
        for m in re.finditer(r"""(['"`])((?:(?!\1)[^\\\n]|\\.)*?[一-鿿](?:(?!\1)[^\\\n]|\\.)*?)\1""", src):
            s = m.group(2)
            if "${" in s:          # 含插值的樣板：渲染後對不到原文，先跳過
                continue
            s = s.replace("\\'", "'").replace('\\"', '"').replace("\\n", " ").strip()
            if s and CJK.search(s) and len(s) <= 240 and not any(c in s for c in '<>&{}$`'):
                found.add(s)

    # 執行期盤點（work/harvest.html 用真人操作掃出來的畫面字串）也併進來：
    # 樣板字串、編號＋名稱這種靜態分析抓不到的，只有這裡收得到。
    harvest = BASE / "work" / "harvest-strings.json"
    if harvest.exists():
        for s in json.loads(harvest.read_text(encoding="utf-8")):
            s = htmllib.unescape(s).strip()
            if s and CJK.search(s) and len(s) <= 240:
                found.add(s)

    out = sorted(found, key=lambda s: (-len(s), s))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(out)} 條字串 → {OUT.relative_to(BASE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
