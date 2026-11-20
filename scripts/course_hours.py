#!/usr/bin/env python3
"""所有學習課程的章數與建議學習時數——全站唯一來源。

首頁的加總、/learn/ 的卡片、每一套課程頁上的標示，全部從這裡算，
才不會出現「首頁說 168 小時、課程頁加起來 152 小時」這種事。

公式
----
閱讀時間（300 字／分）乘以練習倍率，向上取整到半小時，最少 0.5 小時。

練習倍率是「除了讀之外還要花多少時間」：跟唱、練琴、開軟體實作、聽參考錄音。
預設 2.0（讀 1 分鐘、練 1 分鐘）。曼陀林自己有更細的倍率（技法章節 2.5、
聆聽章節 2.0…），沿用 `build_mandolin.study_hours()`，不在這裡重寫一份。

用法
----
    from course_hours import all_courses, totals, study_hours, cjk_count

    for c in all_courses():
        print(c["name"], c["chapters"], c["hours"])

    python scripts/course_hours.py      # 直接印出全部課程與加總
"""
from __future__ import annotations

import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content"

# 大部分課程的單位是「章」，少數是「堂」。顯示時要跟著用對，不然 /learn/ 會
# 寫成「6 章」、課程頁卻是「第 1 堂」。
UNITS = {"daw": "堂", "songwriting": "堂"}

CHARS_PER_MIN = 300
PRACTICE_FACTOR = 2.0
CJK = re.compile(r"[一-鿿]")

# 顯示順序＝/learn/ 與首頁的順序。第四個值是練習倍率，None 表示該課程
# 有自己的算法（曼陀林）。
COURSES = [
    ("vocal", "人聲與歌唱", "vocal", "vocal_ch*.md", 2.0),
    ("digitalmusic", "錄音後製", "digitalmusic", "digitalmusic*.md", 2.0),
    ("theory", "樂理基礎", "musictheory", "musictheory*.md", 2.0),
    ("mandolin", "曼陀林專區", "mandolin", "*.md", None),
    ("guitar", "流行吉他彈唱指南", "guitar", "[0-9]*.md", 2.0),
    ("ukulele", "烏克麗麗流行彈唱與演奏指南", "ukulele", "[0-9]*.md", 2.0),
    ("daw", "線上編曲製作（DAW）課程", "dawcourse", "[0-9]*.md", 2.0),
    # 詞曲創作每堂都要真的坐下來寫 30–60 分鐘，練習倍率比純閱讀的課高
    ("songwriting", "流行歌曲詞曲創作", "songwriting", "[0-9]*.md", 5.0),
]


def study_hours(chars: int, factor: float = PRACTICE_FACTOR) -> float:
    """字數 → 建議學習時數（向上取整到半小時，最少 0.5）。"""
    minutes = chars / CHARS_PER_MIN * factor
    return max(1, -(-int(minutes) // 30)) / 2


def cjk_count(text: str) -> int:
    return len(CJK.findall(text))


def _file_texts(slug: str, pattern: str) -> list[str]:
    folder = CONTENT_DIR / slug
    if not folder.exists():
        return []
    return [p.read_text(encoding="utf-8") for p in sorted(folder.glob(pattern))]


def _theory_texts() -> list[str]:
    """樂理是「一個檔案一個階段」，章要再按 `## 第 N 章` 切。"""
    out = []
    for text in _file_texts("musictheory", "musictheory*.md"):
        for part in re.split(r"(?m)^##\s+", text)[1:]:
            head, _, body = part.partition("\n")
            if re.search(r"第\s*\d+\s*章", head):
                out.append(body)
    return out


def _mandolin() -> tuple[int, float]:
    """曼陀林有自己的練習倍率，用它的 study_hours()。"""
    try:
        import build_mandolin as bm
        chapters = bm.load_chapters()
        return len(chapters), sum(bm.study_hours(c) for c in chapters)
    except Exception:
        return 0, 0.0


def factor_for(slug: str, default: float = PRACTICE_FACTOR) -> float:
    """這門課的練習倍率（各課程頁算時數時要用同一個，不然會跟 /learn/ 對不起來）。"""
    for _k, _name, s, _pattern, factor in COURSES:
        if s == slug and factor is not None:
            return factor
    return default


def course_stats(key: str) -> tuple[int, float]:
    """單一課程的 (章數, 建議學習時數)。"""
    for k, _name, slug, pattern, factor in COURSES:
        if k != key:
            continue
        if factor is None:                       # 曼陀林
            return _mandolin()
        if key == "theory":
            texts = _theory_texts()
        else:
            texts = _file_texts(slug, pattern)
        return len(texts), sum(study_hours(cjk_count(t), factor) for t in texts)
    return 0, 0.0


def all_courses() -> list[dict]:
    """每一套課程的 {key, name, chapters, hours, unit}，依顯示順序。"""
    out = []
    for key, name, _slug, _pattern, _factor in COURSES:
        chapters, hours = course_stats(key)
        out.append({"key": key, "name": name, "chapters": chapters, "hours": hours,
                    "unit": UNITS.get(key, "章")})
    return out


def totals() -> tuple[int, float]:
    """(全部章數, 全部時數)。"""
    courses = all_courses()
    return sum(c["chapters"] for c in courses), sum(c["hours"] for c in courses)


if __name__ == "__main__":
    for c in all_courses():
        print(f"  {c['name']:<24} {c['chapters']:>3} 章・約 {c['hours']:>5g} 小時")
    ch, h = totals()
    print(f"  {'合計':<24} {ch:>3} 章・約 {h:>5g} 小時")
