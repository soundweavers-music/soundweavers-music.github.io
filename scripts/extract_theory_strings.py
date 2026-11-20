#!/usr/bin/env python3
"""抽出樂理圖裡所有需要翻譯的中文字串，一張圖一個 JSON。

輸出 work/theory_strings/<figure>.json：{"中文": "", ...}，翻譯時把值填成英文。
已經有英文版的（存在於 work/theory_en.py 的字典、或已有的 zh→en 對照）會先填好，
剩下的留空字串，讓待翻的量看得見。

用法：python scripts/extract_theory_strings.py
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

SRC = BASE_DIR / "assets" / "theory"
OUT = BASE_DIR / "work" / "theory_strings"

TEXT_RE = re.compile(r"(<text\b[^>]*>)(.*?)(</text>)", re.S)
TSPAN_RE = re.compile(r"(<tspan\b[^>]*>)(.*?)(</tspan>)", re.S)
CJK = re.compile(r"[一-鿿]")


def known() -> dict[str, str]:
    """已經翻好的字串：theory_en_strings.py 有的就用。"""
    sys.path.insert(0, str(BASE_DIR / "scripts"))
    try:
        from theory_en_strings import EN
        return dict(EN)
    except Exception:
        return {}


def strings_of(svg: str) -> list[str]:
    out: list[str] = []

    def take(txt: str) -> None:
        raw = html.unescape(txt).strip()
        if raw and CJK.search(raw) and raw not in out:
            out.append(raw)

    for m in TEXT_RE.finditer(svg):
        inner = m.group(2)
        if "<tspan" in inner:
            for t in TSPAN_RE.finditer(inner):
                take(t.group(2))
        else:
            take(inner)
    return out


def from_existing_en(name: str, zh_svg: str) -> dict[str, str]:
    """已經產過英文版的圖：位置對位置，把中文檔與英文檔的 <text> 配成對。

    兩邊是同一個檔案換字，結點數量與順序一致，所以可以直接對齊。
    """
    en_path = SRC / "en" / (name + ".svg")
    if not en_path.exists():
        return {}
    zh_nodes = [m.group(2) for m in TEXT_RE.finditer(zh_svg)]
    en_nodes = [m.group(2) for m in TEXT_RE.finditer(en_path.read_text(encoding="utf-8"))]
    if len(zh_nodes) != len(en_nodes):
        return {}
    pairs: dict[str, str] = {}
    for zh, en in zip(zh_nodes, en_nodes):
        a, b = html.unescape(zh).strip(), html.unescape(en).strip()
        if a and CJK.search(a) and b and not CJK.search(b):
            pairs[a] = b
    return pairs


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    have = known()
    total = todo = 0
    for path in sorted(SRC.glob("*.svg")):
        svg = path.read_text(encoding="utf-8")
        keys = strings_of(svg)
        if not keys:
            continue
        seeded = {**have, **from_existing_en(path.stem, svg)}
        payload = {k: seeded.get(k, "") for k in keys}
        (OUT / (path.stem + ".json")).write_text(
            json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        total += len(keys)
        todo += sum(1 for v in payload.values() if not v)
    print("寫出 %d 個 JSON 到 %s" % (len(list(OUT.glob("*.json"))), OUT.relative_to(BASE_DIR)))
    print("字串 %d 條，待翻 %d 條。" % (total, todo))


if __name__ == "__main__":
    main()
