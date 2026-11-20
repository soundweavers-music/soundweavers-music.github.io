#!/usr/bin/env python3
"""樂理圖的英文版：讀 assets/theory/*.svg，換掉 <text> 內容，寫到 assets/theory/en/。

做法跟 build_songwriting_figures.py 一致：先產生中文圖，再把每個 <text> 的
內容換成英文。字典沒收錄的字串會原樣保留（仍是中文）並列出來，所以覆蓋率
是可以檢查的，不用靠眼睛看整張圖。

字串表在 scripts/theory_en_strings.py。合併流程：
    python scripts/extract_theory_strings.py      # 抽出待翻字串 → work/theory_strings/
    （翻譯 → work/theory_strings/*.json）
    python scripts/merge_theory_strings.py        # 合併 → scripts/theory_en_strings.py
    python scripts/theory_figures_en.py           # 產生 assets/theory/en/*.svg

用法：python scripts/theory_figures_en.py
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

from theory_en_strings import EN  # noqa: E402

SRC = BASE_DIR / "assets" / "theory"
DST = SRC / "en"

TEXT_RE = re.compile(r"(<text\b[^>]*>)(.*?)(</text>)", re.S)
CJK = re.compile(r"[一-鿿]")
TSPAN_RE = re.compile(r"(<tspan\b[^>]*>)(.*?)(</tspan>)", re.S)


def _swap(inner: str, missing: list[str]) -> str:
    """一個 <text> 裡的內容：可能有巢狀 <tspan>，逐段換。"""
    def conv(raw_txt: str) -> str | None:
        raw = html.unescape(raw_txt).strip()
        if not raw or not CJK.search(raw):
            return None
        en = EN.get(raw)
        if en is None:
            missing.append(raw)
            return None
        # 保留原本的前後空白，版面靠它對齊
        lead = raw_txt[:len(raw_txt) - len(raw_txt.lstrip())]
        trail = raw_txt[len(raw_txt.rstrip()):]
        return lead + html.escape(en) + trail

    if "<tspan" in inner:
        return TSPAN_RE.sub(
            lambda m: m.group(1) + (conv(m.group(2)) or m.group(2)) + m.group(3), inner)
    new = conv(inner)
    return inner if new is None else new


def translate_svg(svg: str) -> tuple[str, list[str]]:
    missing: list[str] = []
    out = TEXT_RE.sub(
        lambda m: m.group(1) + _swap(m.group(2), missing) + m.group(3), svg)
    return out, missing


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    total = 0
    missing_all: dict[str, list[str]] = {}
    for path in sorted(SRC.glob("*.svg")):
        out, missing = translate_svg(path.read_text(encoding="utf-8"))
        (DST / path.name).write_text(out, encoding="utf-8")
        total += 1
        if missing:
            missing_all[path.name] = sorted(set(missing))
    print("產生 %d 張英文圖 → %s" % (total, DST.relative_to(BASE_DIR)))
    if missing_all:
        n = sum(len(v) for v in missing_all.values())
        print("還有 %d 條字串沒翻（原樣保留中文）：" % n)
        for k, v in missing_all.items():
            print("  %s: %s" % (k, "、".join(v)))
        sys.exit(1)
    print("全部字串都有英文版。")


if __name__ == "__main__":
    main()
