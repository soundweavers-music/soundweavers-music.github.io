#!/usr/bin/env python3
"""產生 /learn/ 搜尋框用的索引：assets/learn-index.json

掃「學習」各課程已經建好的頁面，抓標題、描述與各級小標（h2/h3），做成一份
給前端用的精簡索引。不用另外維護清單——課程新增章節，重跑就有。

要跑在所有課程建置之後（build_courses.py、build_ensembles.py 之後）：
  python scripts/build_learn_index.py
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
OUTPUT = BASE / "outputs" / "world-instruments-static"
INDEX = OUTPUT / "assets" / "learn-index.json"

# (輸出目錄, 課程名稱, 課程首頁標籤)
COURSES = [
    ("vocal", "人聲與歌唱"),
    ("digitalmusic", "錄音後製"),
    ("theory", "音樂理論"),
    ("mandolin", "曼陀林專區"),
    ("guitar", "流行吉他彈唱指南"),
    ("ukulele", "烏克麗麗"),
    ("tools/daw/learn", "線上編曲（DAW）"),
]

TAG = re.compile(r"<[^>]+>")
HEAD = re.compile(r"<h([23])[^>]*>(.*?)</h\1>", re.S)
TITLE = re.compile(r"<title>(.*?)</title>", re.S)
DESC = re.compile(r'<meta name="description" content="(.*?)"', re.S)
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)


def text(s: str) -> str:
    s = TAG.sub(" ", s)
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
         .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " "))
    return re.sub(r"\s+", " ", s).strip()


def entry(path: Path, course: str) -> dict | None:
    html = path.read_text(encoding="utf-8", errors="replace")
    t = TITLE.search(html)
    if not t:
        return None
    title = re.sub(r"\s*[｜|]\s*.*$", "", text(t.group(1)))
    if not title:
        return None
    d = DESC.search(html)
    desc = text(d.group(1)) if d else ""
    heads = [text(m.group(2)) for m in HEAD.finditer(html)]
    seen, keep = set(), []
    for h in heads:
        h = h[:48]
        if h and h not in seen and len(keep) < 12:
            seen.add(h)
            keep.append(h)
    url = "/" + path.parent.relative_to(OUTPUT).as_posix().strip("/") + "/"
    if url == "//":
        url = "/"
    return {"c": course, "t": title, "u": url, "d": desc[:140], "h": keep}


def main() -> int:
    if not OUTPUT.exists():
        print("找不到建置輸出，請先跑 build_static_site.py")
        return 1
    items = []
    for rel, course in COURSES:
        d = OUTPUT / rel
        if not d.exists():
            print(f"  （略過 {rel}：還沒建置）")
            continue
        n = 0
        for page in sorted(d.rglob("index.html")):
            e = entry(page, course)
            if e:
                items.append(e)
                n += 1
        print(f"  {course}: {n} 頁")
    items.sort(key=lambda e: (e["c"], e["u"]))
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")),
                     encoding="utf-8")
    size = INDEX.stat().st_size
    print(f"{len(items)} 頁 → {INDEX.relative_to(BASE)}（{size / 1024:.0f} KB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
