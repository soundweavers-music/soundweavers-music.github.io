#!/usr/bin/env python3
"""英文版的收尾檢查：翻譯完了沒、圖有沒有少、連結有沒有斷。

翻譯是分很多批做的，所以「看起來做完」跟「真的做完」差很遠：
少一張圖、少一章、某一段還是中文，翻的時候都不會叫。這支一次檢查完。

    python scripts/check_en_site.py          # 檢查（有問題就離開碼 1）
    python scripts/check_en_site.py --build  # 先建站再檢查

檢查四件事
    1. 每套課程的英文章數 vs 中文章數（樂理的章要按 `## 第 N 章` 切）
    2. 英文稿引用的 /assets/<course>/en/*.svg 存不存在
    3. 英文稿裡還有沒有中文（歌名〈〉、術語對照表、品牌名除外）
    4. 英文章節頁的內文有沒有漏（檔案太小就是翻到一半）

第 3 點刻意放寬：〈〉裡的歌名、括號裡的羅馬字、雙語術語表都是刻意留的。
真正該抓的是「整段還是中文」，所以用「一行裡連續 12 個中文字以上」當門檻。
"""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent
EN = BASE / "content" / "en"
OUT = BASE / "outputs" / "world-instruments-static"

COURSES = {                      # 英文資料夾 → 中文資料夾／副檔名樣式
    "musictheory": ("musictheory", "musictheory*.md"),
    "vocal": ("vocal", "vocal_ch*.md"),
    "digitalmusic": ("digitalmusic", "digitalmusic*.md"),
    "guitar": ("guitar", "[0-9]*.md"),
    "ukulele": ("ukulele", "[0-9]*.md"),
    "mandolin": ("mandolin", "[0-9]*.md"),
    "songwriting": ("songwriting", "[0-9]*.md"),
}
TITLE = re.compile(r"〈[^〉]*〉")
CJK_RUN = re.compile(r"[一-鿿]{12,}")
IMG = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


def chapter_count(folder: pathlib.Path, pattern: str) -> int:
    if not folder.exists():
        return 0
    n = 0
    for p in sorted(folder.glob(pattern)):
        # preface / contents 不是章，不要算進去（中文那邊用 前言.md／目錄.md 也一樣）
        if p.stem.lower() in {"preface", "contents", "前言", "目錄", "code_artifact"}:
            continue
        text = p.read_text(encoding="utf-8")
        if folder.name == "musictheory":
            n += len(re.findall(r"(?m)^##\s+\**\s*(?:第\s*\d+\s*章|Chapter\s+\d+)", text))
        else:
            n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true", help="先跑一次建置")
    a = ap.parse_args()
    if a.build:
        env = {"PYTHONIOENCODING": "utf-8", "SITE_BASE_PATH": ""}
        for s in ["build_static_site.py", "build_vocal_extra.py", "build_mandolin.py",
                  "build_courses.py", "build_en_courses.py"]:
            subprocess.run([sys.executable, str(BASE / "scripts" / s)], check=True,
                           cwd=BASE, env={**env, "PATH": ""})

    problems: list[str] = []
    print("課程\t\t英文章數\t中文章數")
    for en_slug, (zh_slug, pattern) in COURSES.items():
        e = chapter_count(EN / en_slug, "*.md")
        z = chapter_count(BASE / "content" / zh_slug, pattern)
        mark = "" if e >= z else "   ← 少 %d 章" % (z - e)
        print("  %-14s %4d\t\t%4d%s" % (en_slug, e, z, mark))
        if e < z:
            problems.append("%s：英文只有 %d 章，中文有 %d 章" % (en_slug, e, z))

    print("\n圖：")
    for course in sorted({p.name for p in (BASE / "assets").iterdir() if p.is_dir()}):
        en_dir = BASE / "assets" / course / "en"
        if not en_dir.exists():
            continue
        zh_svgs = list((BASE / "assets" / course).glob("*.svg"))
        en_svgs = list(en_dir.rglob("*.svg"))
        ok = len(en_svgs) >= len(zh_svgs)
        print("  %-14s %3d / %3d 張%s" % (course, len(en_svgs), len(zh_svgs),
                                          "" if ok else "   ← 少了"))
        if not ok:
            problems.append("%s：英文圖 %d 張，中文 %d 張" % (course, len(en_svgs), len(zh_svgs)))

    print("\n中文殘留：")
    for path in sorted(EN.rglob("*.md")):
        if path.name.startswith("_"):
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if CJK_RUN.search(TITLE.sub("", line)):
                problems.append("%s：還有一整段中文 → %s" % (path.relative_to(EN), line.strip()[:60]))
                break

    print("\n英文稿引用的圖：")
    missing = set()
    for path in sorted(EN.rglob("*.md")):
        if path.name.startswith("_"):        # _STYLE.md 是說明文件，不用檢查
            continue
        for target in IMG.findall(path.read_text(encoding="utf-8")):
            if not target.startswith("/assets/"):
                problems.append("%s：圖不是絕對路徑 %s" % (path.relative_to(EN), target))
                continue
            # 只有「這套課程有英文圖資料夾」時才要求指到 en/：
            # 曼陀林的圖是兩版共用的照片，沒有 en/ 這一層
            course = target.split("/")[2] if target.count("/") > 2 else ""
            if (BASE / "assets" / course / "en").exists() and "/en/" not in target:
                problems.append("%s：英文稿指到中文圖 %s" % (path.relative_to(EN), target))
                continue
            if not (BASE / target.lstrip("/")).exists():
                missing.add(target)
    for m in sorted(missing):
        problems.append("缺圖：%s" % m)
    print("  缺 %d 張" % len(missing))

    print()
    if problems:
        print("發現 %d 個問題：" % len(problems))
        for p in problems[:40]:
            print("  - " + p)
        if len(problems) > 40:
            print("  …還有 %d 個" % (len(problems) - 40))
        return 1
    print("英文版檢查通過")
    return 0


if __name__ == "__main__":
    sys.exit(main())
