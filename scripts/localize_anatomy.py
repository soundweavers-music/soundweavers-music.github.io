#!/usr/bin/env python3
"""把 Wikimedia Commons 的解剖底圖本地化：裁切、中文標籤、加註出處。

原始檔在 `assets/vocal/_anatomy/src/`（授權見同目錄 SOURCES.md），
輸出到 `assets/vocal/`。一張底圖可以裁成多張圖（例如呼吸道全圖同時供
「頭頸側剖」與「肺與橫膈膜」使用）。

    python scripts/localize_anatomy.py            # 全部
    python scripts/localize_anatomy.py larynx     # 只做指定輸出
    python scripts/localize_anatomy.py --check    # 只列出翻譯對照
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "assets" / "vocal" / "_anatomy" / "src"
OUT = BASE / "assets" / "vocal"

PAPER = "#FBF8F4"
INK = "#3D3229"
MUTED = "#8C8078"
FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif"

# 每個項目：src 底圖、out 輸出檔名、crop 裁切框 (x, y, w, h)，不裁切就省略
FIGURES = [
    {
        "src": "larynx-external",
        "out": "larynx-anatomy.svg",
        "title": "喉部構造",
        "sub": "甲狀軟骨、環狀軟骨、環甲肌與氣管（正面觀）",
        "width": 640,
        "credit": "底圖：Wikimedia Commons／Olek Remesz（CC BY-SA 2.5），本站翻譯標籤",
        "labels": {
            "thyrohyoid membrane": "甲狀舌骨膜",
            "median thyrohyoid": "正中甲狀舌骨",
            "ligament": "韌帶",
            "laryngeal incisure": "甲狀軟骨上切跡",
            "thyroid cartilage": "甲狀軟骨",
            "median cricothyroid": "正中環甲",
            "conus elasticus": "彈性圓錐",
            "cricoid cartilage": "環狀軟骨",
            "trachea": "氣管",
            "hyoid bone": "舌骨",
            "lateral thyrohyoid ": "外側甲狀舌骨",
            "superior cornu ": "上角",
            "of thyroid cartilage": "（甲狀軟骨）",
            "superior laryngeal": "喉上",
            "nerve and artery": "神經與動脈",
            "oblique line": "斜線",
            "cricothyroid muscle": "環甲肌",
            "inferior cornu ": "下角",
            "cricothyroid joint": "環甲關節",
        },
    },
]


def _inner(svg: str) -> str:
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!DOCTYPE[^>]*>", "", svg)
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    inner = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    inner = re.sub(r"</svg>\s*$", "", inner, flags=re.S)
    return inner


def localize(cfg: dict, check_only=False) -> Path | None:
    raw = (SRC / f"{cfg['src']}.svg").read_text(encoding="utf-8", errors="replace")
    body = _inner(raw)

    labels = {k.strip(): v for k, v in cfg.get("labels", {}).items()}
    missing = []

    def swap(m):
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        zh = labels.get(text)
        if zh is None:
            missing.append(text)
            return m.group(0)
        opening = re.sub(r'font-size="([\d.]+)"',
                         lambda f: f'font-size="{float(f.group(1)) * 0.8:.1f}"',
                         m.group(1))
        return f"{opening}{zh}{m.group(3)}"

    if cfg.get("strip_text"):
        body = re.sub(r"<text[^>]*>.*?</text>", "", body, flags=re.S)
    else:
        body = re.sub(r"(<text[^>]*>)(.*?)(</text>)", swap, body, flags=re.S)
    body = body.replace('font-family="Liberation Sans"', f'font-family="{FONT}"')
    body = re.sub(r'font-family="(?!\'Noto)[^"]*"', f'font-family="{FONT}"', body)

    if check_only:
        for en, zh in cfg["labels"].items():
            print(f"  {en.strip():30s} → {zh}")
        if missing:
            print("  ! 未翻譯：", sorted(set(missing)))
        return None

    if cfg.get("crop"):
        cx, cy, cw, ch = cfg["crop"]
    else:
        cx, cy, cw, ch = 0, 0, float(re.search(r'width="(\d+)', raw).group(1)), float(re.search(r'height="(\d+)', raw).group(1))

    width = cfg["width"]
    scale = width / cw

    overlay_parts = []
    for ax, ay, text, tx, ty in cfg.get("overlay", []):
        lx = (tx - cx) * scale
        ly = (ty - cy) * scale + 100
        overlay_parts.append(
            f'  <g transform="translate(0,66) scale({scale:.5f}) translate({-cx},{-cy})">'
            f'<path d="M{ax} {ay} L{tx} {ty}" stroke="{MUTED}" stroke-width="1" fill="none"/>'
            f'<circle cx="{ax}" cy="{ay}" r="2.6" fill="{MUTED}"/></g>'
        )
        overlay_parts.append(
            f'  <text x="{lx:.1f}" y="{ly:.1f}" font-family="{FONT}" font-size="12.5" fill="{INK}">{text}</text>'
        )
    overlay = "\n".join(overlay_parts)
    out_h = round(ch * scale) + 100

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {width} {out_h}" role="img" aria-label="{cfg['title']}">
  <title>{cfg['title']}：{cfg['sub']}</title>
  <rect width="{width}" height="{out_h}" fill="{PAPER}"/>
  <text x="26" y="34" font-family="{FONT}" font-size="16" font-weight="700" fill="{INK}">{cfg['title']}</text>
  <text x="26" y="55" font-family="{FONT}" font-size="12.5" fill="{MUTED}">{cfg['sub']}</text>
  <g transform="translate(0,66) scale({scale:.5f}) translate({-cx},{-cy})">{body}</g>
{overlay}
  <text x="26" y="{out_h - 12}" font-family="{FONT}" font-size="10.5" fill="{MUTED}">{cfg['credit']}</text>
</svg>
"""
    target = OUT / cfg["out"]
    target.write_text(svg, encoding="utf-8")
    return target


def main(argv) -> int:
    check = "--check" in argv
    names = [a for a in argv if not a.startswith("-")]
    for cfg in FIGURES:
        if names and cfg["out"].replace(".svg", "") not in names:
            continue
        target = localize(cfg, check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    for cfg in PNG_FIGURES:
        if names and cfg["out"].replace(".svg", "") not in names:
            continue
        target = build_png(cfg, check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    return 0


# ── PNG 底圖（Wikimedia 只放行縮圖，原檔 SVG 被 CDN 擋住）──────────────
# 這些是 thumb.php 產生的高解析 PNG，透明背景；輸出成「PNG＋SVG 標籤」的混合圖。
PNG_FIGURES = [
    {
        "src": "vocal-fold-scheme.png",
        "out": "vocal-fold-layers.svg",
        "title": "一片聲帶的剖面：三層結構",
        "sub": "外層黏膜、中間韌帶、內層肌肉；厚度與張力就由這三層決定",
        "crop": (20, 50, 880, 880),
        "width": 640,
        "credit": "底圖：Fred the Oyster（CC BY-SA 4.0，Wikimedia Commons），本站裁切並加中文標籤",
        "labels": [
            ("黏膜", 700, 300, 790, 240),
            ("韌帶", 650, 470, 790, 450),
            ("聲帶肌", 520, 720, 790, 700),
        ],
    },
    {
        "src": "neutral-sagittal.png",
        "out": "sagittal-head.svg",
        "title": "頭頸側剖：聲音走過的路",
        "sub": "從鼻腔、口腔，經過咽與喉，最後進到氣管",
        "crop": (40, 60, 1520, 2140),
        "width": 640,
        "credit": "底圖：Richard Wright、Dan McCloy（CC0，Wikimedia Commons），本站裁切並加中文標籤",
        "labels": [
            ("鼻腔", 1010, 900, 1180, 830),
            ("口腔", 1150, 1210, 1260, 1150),
            ("舌", 1060, 1430, 1200, 1430),
            ("咽", 880, 1240, 700, 1180),
            ("喉（聲帶）", 950, 1730, 700, 1700),
            ("氣管", 900, 1980, 700, 1950),
        ],
    },
]


def build_png(cfg: dict, check_only=False) -> Path | None:
    if check_only:
        for text, *_ in cfg["labels"]:
            print("  label:", text)
        return None

    cx, cy, cw, ch = cfg["crop"]
    width = cfg["width"]
    scale = width / cw
    out_h = round(ch * scale) + 150
    href = f"_anatomy/src/{cfg['src']}"
    import struct
    with open(SRC / cfg["src"], "rb") as fh:
        im_w, im_h = struct.unpack(">II", fh.read(33)[16:24])

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {width} {out_h}" role="img" aria-label="{cfg["title"]}">',
        f'  <title>{cfg["title"]}：{cfg["sub"]}</title>',
        f'  <rect width="{width}" height="{out_h}" fill="{PAPER}"/>',
        f'  <text x="26" y="34" font-family="{FONT}" font-size="16" font-weight="700" fill="{INK}">{cfg["title"]}</text>',
        f'  <text x="26" y="55" font-family="{FONT}" font-size="12.5" fill="{MUTED}">{cfg["sub"]}</text>',
        f'  <g transform="translate(0,100) scale({scale:.5f}) translate({-cx},{-cy})">',
        f'    <image x="0" y="0" width="{im_w}" height="{im_h}" xlink:href="{href}"/>',
        "  </g>",
    ]
    for text, ax, ay, tx, ty in cfg["labels"]:
        lx = (tx - cx) * scale
        ly = (ty - cy) * scale + 100
        px = (ax - cx) * scale
        py = (ay - cy) * scale + 100
        parts.append(
            f'  <path d="M{px:.1f} {py:.1f} L{lx:.1f} {ly + 4:.1f}" stroke="{MUTED}" stroke-width="1" fill="none"/>'
            f'<circle cx="{px:.1f}" cy="{py:.1f}" r="2.8" fill="{MUTED}"/>'
            f'<text x="{lx:.1f}" y="{ly:.1f}" font-family="{FONT}" font-size="12.5" fill="{INK}" '
            f'text-anchor="{"end" if tx < ax else "start"}">{text}</text>'
        )
    parts.append(f'  <text x="26" y="{out_h - 12}" font-family="{FONT}" font-size="10.5" fill="{MUTED}">{cfg["credit"]}</text>')
    parts.append("</svg>\n")

    target = OUT / cfg["out"]
    target.write_text("\n".join(parts), encoding="utf-8")
    return target


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
