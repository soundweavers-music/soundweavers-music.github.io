#!/usr/bin/env python3
"""掃出圖上「文字疊在一起」的地方。

SVG 裡的文字沒有換行概念，疊在一起在原始碼看不出來，只有在瀏覽器裡才看得到。
這支把每個 <text> 依字型大小估一個矩形（中日韓字算 1 em、其餘算 0.55 em），
兩兩比較重疊面積，超過其中較小那塊的三成就算疊。

    python scripts/audit_figure_overlap.py                 # 全部
    python scripts/audit_figure_overlap.py vocal guitar    # 只掃某些圖庫
    python scripts/audit_figure_overlap.py --top 40        # 只列前 40 個檔案
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import unicodedata
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS = BASE_DIR / "assets"
SKIP_DIRS = {"vendor", "instruments", "brand", "mandolin"}

TEXT = re.compile(r"<text\b([^>]*)>(.*?)</text>", re.S)
ATTR = re.compile(r'(\w[\w-]*)="([^"]*)"')


def _width(s: str, size: float) -> float:
    w = 0.0
    for ch in s:
        if unicodedata.east_asian_width(ch) in ("W", "F"):
            w += size
        elif ch == " ":
            w += size * 0.28
        else:
            w += size * 0.56
    return w


def text_boxes(svg: str):
    out = []
    for m in TEXT.finditer(svg):
        attrs = dict(ATTR.findall(m.group(1)))
        raw = re.sub(r"<[^>]+>", "", m.group(2))
        raw = html.unescape(raw).strip()
        if not raw:
            continue
        try:
            x = float(attrs.get("x", "0"))
            y = float(attrs.get("y", "0"))
            size = float(attrs.get("font-size", "12").replace("px", ""))
        except ValueError:
            continue
        w = _width(raw, size)
        anchor = attrs.get("text-anchor", "start")
        x0 = x - (w / 2 if anchor == "middle" else (w if anchor == "end" else 0))
        out.append({
            "s": raw[:26], "x0": x0, "x1": x0 + w,
            "y0": y - size * 0.78, "y1": y + size * 0.22, "name": raw,
        })
    return out


def overlap(a, b) -> float:
    ox = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    oy = min(a["y1"], b["y1"]) - max(a["y0"], b["y0"])
    if ox <= 0 or oy <= 0:
        return 0.0
    area = ox * oy
    smaller = min((a["x1"] - a["x0"]) * (a["y1"] - a["y0"]),
                  (b["x1"] - b["x0"]) * (b["y1"] - b["y0"]))
    return area / smaller if smaller else 0.0


def check(path: Path) -> list[tuple[str, str, float]]:
    boxes = text_boxes(path.read_text(encoding="utf-8"))
    bad = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            r = overlap(boxes[i], boxes[j])
            if r > 0.3:
                bad.append((boxes[i]["s"], boxes[j]["s"], r))
    return bad


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("groups", nargs="*", help="只掃這些資料夾（vocal、guitar…）")
    ap.add_argument("--top", type=int, default=0)
    args = ap.parse_args(argv)

    dirs = []
    for sub in sorted(ASSETS.iterdir()):
        if not sub.is_dir() or sub.name in SKIP_DIRS:
            continue
        if args.groups and sub.name not in args.groups:
            continue
        dirs.append(sub)

    files = 0
    offenders = []
    for d in dirs:
        for svg in sorted(d.rglob("*.svg")):
            if "_anatomy" in svg.parts:
                continue
            files += 1
            bad = check(svg)
            if bad:
                offenders.append((svg, bad))
    offenders.sort(key=lambda x: -len(x[1]))
    show = offenders[: args.top] if args.top else offenders
    for svg, bad in show:
        print(f"!! {svg.relative_to(BASE_DIR)}  {len(bad)} 處")
        for a, b, r in bad[:3]:
            print(f"     「{a}」×「{b}」 {r:.0%}")
    print(f"\n掃了 {files} 張圖，{len(offenders)} 張有文字重疊")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
