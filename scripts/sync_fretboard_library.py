#!/usr/bin/env python3
"""把 scripts/_chord_library.js 同步進 /tools/fretboard/ 的頁面。

指板工具是「手維護的單檔頁面」，和弦資料是直接內嵌在 HTML 裡的
（`var CHORD_LIBRARY = {...}`）。所以重新產生 _chord_library.js 之後，
要跑這支把頁面裡的那一份換掉，不然頁面會繼續用舊資料。

    python scripts/gen_chord_library.py     # 產生 / 更新資料庫
    python scripts/sync_fretboard_library.py
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
LIB = BASE / "scripts" / "_chord_library.js"
PAGES = [
    BASE / "tools" / "fretboard" / "index.html",
]
BLOCK = re.compile(r"var CHORD_LIBRARY = \{.*?\};(?=\s*\n)", re.S)
EXTERNAL = '<script src="../../scripts/_chord_library.js"></script>'


def main() -> int:
    lib_js = LIB.read_text(encoding="utf-8").strip()
    if not lib_js.startswith("var CHORD_LIBRARY"):
        print("資料庫檔案格式不對，應以 var CHORD_LIBRARY 開頭")
        return 1
    # 驗一下真的是合法 JSON，避免把壞資料寫進頁面
    data = json.loads(lib_js[lib_js.find("{"): lib_js.rfind("}") + 1])
    counts = {inst: len(next(iter(t.values()))) for inst, t in data.items()}
    tunings = {inst: len(t) for inst, t in data.items()}

    for page in PAGES:
        html = page.read_text(encoding="utf-8")
        m = BLOCK.search(html)
        if not m:
            # 已經是外部檔案版本：只要確認有載入就行
            ok = EXTERNAL in html
            print(f"{page.relative_to(BASE)}：使用外部資料檔 {'✓' if ok else '✗ 沒載入'}")
            continue
        before = len(m.group(0))
        page.write_text(BLOCK.sub(lib_js.rstrip() + "\n", html, count=1), encoding="utf-8")
        print(f"{page.relative_to(BASE)}：內嵌資料 {before} → {len(lib_js)} 字元")
    print("調弦數：", ", ".join(f"{inst} 種 {n}" for inst, n in tunings.items()))
    print("每種調弦指型數：", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
