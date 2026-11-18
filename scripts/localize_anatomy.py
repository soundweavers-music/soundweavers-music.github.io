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
        ly = (ty - cy) * scale + 150
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


# ── 本站描線重繪 ────────────────────────────────────────────────────────
# 幾何取自 traced/*.json（由 trace_regions.py 產生），顏色、線條與標註都在這裡
# 決定；輸出不含任何外部圖片，是本站自己的向量圖。
TRACE_PALETTE = {
    (217, 217, 209): "#EFE9E0",
    (215, 214, 186): "#E8DCC6",
    (230, 230, 212): "#F1E7D4",
    (184, 183, 158): "#D9CBAE",
    (236, 236, 238): "#F9F5EE",
    (155, 154, 134): "#C4B394",
    (0, 0, 0): "#3D3229",
    (230, 165, 153): "#DFB09A",
}

TRACED_FIGURES = [
    {
        "json": "torso-regions.json",
        "out": "breathing-apparatus.svg",
        "title": "呼吸用到的構造",
        "sub": "肋骨圍住肺，橫膈膜在肺的下面；吸氣時它往下降",
        "width": 640,
        "palette": {
            (254, 254, 254): "#F7F1E8",
            (192, 192, 254): "#DCE7F2",
            (254, 192, 192): "#F0D6CC",
            (134, 134, 134): "#C9BBA9",
            (0, 0, 0): "#3D3229",
        },
        "credit": "幾何參考 Cdang（CC0，Wikimedia Commons），本站描線重繪",
        "labels": [
            ("肺", 800, 430, 560, 330),
            ("心臟", 870, 505, 560, 500),
            ("肋骨", 1120, 560, 1200, 460),
            ("橫膈膜", 760, 780, 560, 760),
            ("肝臟", 700, 980, 560, 960),
        ],
    },
    {
        "json": "sagittal-regions.json",
        "out": "sagittal-head.svg",
        "title": "頭頸側剖：聲音走過的路",
        "sub": "鼻腔、口腔與咽的位置；氣從鼻子或嘴巴進來，轉彎往下",
        "width": 640,
        "palette": {
            (229, 229, 229): "#EFE2D2",
            (254, 254, 254): "#FBF8F4",
            (0, 0, 0): "#3D3229",
        },
        "credit": "幾何參考 Richard Wright、Dan McCloy（CC0，Wikimedia Commons），本站描線重繪",
        "labels": [
            ("鼻腔", 1000, 950, 700, 870),
            ("口腔", 1150, 1230, 1330, 1140),
            ("咽", 880, 1240, 700, 1210),
            ("喉（聲帶）", 950, 1730, 700, 1700),
            ("氣管", 900, 1980, 700, 1950),
        ],
    },
    {
        "json": "larynx-regions.json",
        "out": "larynx-anatomy.svg",
        "title": "喉部構造",
        "sub": "舌骨在上、甲狀軟骨像一面盾、環狀軟骨在下方一圈，氣管接著往下",
        "width": 640,
        "credit": "幾何參考 Wikimedia Commons／Olek Remesz（CC BY-SA 2.5），本站描線重繪、改用自家配色",
        "labels": [
            ("舌骨", 280, 62, 150, 60),
            ("甲狀軟骨", 250, 205, 120, 190),
            ("環甲肌", 185, 305, 110, 320),
            ("氣管", 270, 405, 150, 420),
        ],
    },
]


def _nearest(rgb, palette=None):
    palette = palette or TRACE_PALETTE
    best, bd = "#EFE9E0", 1e9
    for k, v in palette.items():
        d = sum((a - c) ** 2 for a, c in zip(k, rgb))
        if d < bd:
            best, bd = v, d
    return best


def build_traced(cfg, check_only=False):
    import json as _json

    data = _json.loads((BASE / "assets" / "vocal" / "_anatomy" / "traced" / cfg["json"]).read_text(encoding="utf-8"))
    sw, sh = data["size"]
    if check_only:
        print("  traced:", cfg["out"], len(data["regions"]), "regions")
        return None

    scale = cfg["width"] / sw
    out_w, out_h, top = cfg["width"], round(sh * scale) + 150, 100
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {out_w} {out_h}" role="img" aria-label="{cfg["title"]}">',
        f'  <title>{cfg["title"]}：{cfg["sub"]}</title>',
        f'  <rect width="{out_w}" height="{out_h}" fill="{PAPER}"/>',
        f'  <text x="26" y="34" font-family="{FONT}" font-size="16" font-weight="700" fill="{INK}">{cfg["title"]}</text>',
        f'  <text x="26" y="55" font-family="{FONT}" font-size="12.5" fill="{MUTED}">{cfg["sub"]}</text>',
        f'  <g transform="translate(0,{top}) scale({scale:.5f})">',
    ]
    for reg in data["regions"]:
        pts = reg["points"]
        if len(pts) < 3:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        if min(xs) <= 2 and min(ys) <= 2 and max(xs) >= sw - 3 and max(ys) >= sh - 3:
            continue
        d = "M" + " L".join(f"{x} {y}" for x, y in pts) + " Z"
        fill = _nearest(reg["rgb"], cfg.get("palette"))
        parts.append(f'    <path d="{d}" fill="{fill}" stroke="#C9BCAA" stroke-width="1.2"/>')
    parts.append("  </g>")

    for text, ax, ay, tx, ty in cfg["labels"]:
        lx, ly = tx * scale, ty * scale + top
        px, py = ax * scale, ay * scale + top
        parts.append(f'  <path d="M{px:.1f} {py:.1f} L{lx:.1f} {ly + 4:.1f}" stroke="{MUTED}" stroke-width="1" fill="none"/>')
        parts.append(f'  <circle cx="{px:.1f}" cy="{py:.1f}" r="2.8" fill="{MUTED}"/>')
        anchor = "end" if tx < ax else "start"
        parts.append(f'  <text x="{lx:.1f}" y="{ly:.1f}" font-family="{FONT}" font-size="12.5" fill="{INK}" '
                     f'text-anchor="{anchor}">{text}</text>')
    parts.append(f'  <text x="26" y="{out_h - 12}" font-family="{FONT}" font-size="10.5" fill="{MUTED}">{cfg["credit"]}</text>')
    parts.append("</svg>")

    target = OUT / cfg["out"]
    target.write_text("\n".join(parts) + "\n", encoding="utf-8")
    return target


def main(argv) -> int:
    check = "--check" in argv
    names = [a for a in argv if not a.startswith("-")]
    for cfg in FIGURES:
        if names and cfg["out"].split("/")[-1].replace(".svg", "") not in names:
            continue
        target = localize(cfg, check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    for cfg in PNG_FIGURES:
        if names and cfg["out"].split("/")[-1].replace(".svg", "") not in names:
            continue
        target = build_png(cfg, check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    if not names or "closure-grades" in names:
        target = build_glottis_states(check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    for cfg in TRACED_FIGURES:
        if names and cfg["out"].split("/")[-1].replace(".svg", "") not in names:
            continue
        target = build_traced(cfg, check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    if not names or "folds-open-closed" in names:
        target = build_glottis_pair(check_only=check)
        if target:
            print("wrote", target.relative_to(BASE))
    return 0


# ── PNG 底圖（Wikimedia 只放行縮圖，原檔 SVG 被 CDN 擋住）──────────────
# 這些是 thumb.php 產生的高解析 PNG，透明背景；輸出成「PNG＋SVG 標籤」的混合圖。
PNG_FIGURES = [
    {
        "src": "glottis-positions.png",
        "out": "ex/glottis-closed.svg",
        "title": "完全閉合（圖例 A）",
        "sub": "兩片靠在一起，氣被擋住；這是發聲的起點，不是用力夾",
        "crop": (34, 0, 116, 226),
        "width": 420,
        "credit": "底圖：Wikimedia Commons「Glottis positions」（公有領域），本站裁切",
        "labels": [],
    },
    {
        "src": "glottis-positions.png",
        "out": "ex/glottis-breathy.svg",
        "title": "氣聲（圖例 D）",
        "sub": "兩片分開，氣一直漏；音色沙，唱不久",
        "crop": (634, 0, 116, 226),
        "width": 420,
        "credit": "底圖：Wikimedia Commons「Glottis positions」（公有領域），本站裁切",
        "labels": [],
    },

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

]


def build_png(cfg: dict, check_only=False) -> Path | None:
    if check_only:
        for text, *_ in cfg["labels"]:
            print("  label:", text)
        return None

    cx, cy, cw, ch = cfg["crop"]
    width = cfg["width"]
    scale = width / cw
    out_h = round(ch * scale) + 200
    depth = "../" if "/" in cfg["out"] else ""
    href = f"{depth}_anatomy/src/{cfg['src']}"
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
        f'  <g transform="translate(0,150) scale({scale:.5f}) translate({-cx},{-cy})">',
        f'    <image x="0" y="0" width="{im_w}" height="{im_h}" xlink:href="{href}"/>',
        "  </g>",
    ]
    for text, ax, ay, tx, ty in cfg["labels"]:
        lx = (tx - cx) * scale
        ly = (ty - cy) * scale + 150
        px = (ax - cx) * scale
        py = (ay - cy) * scale + 150
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


def build_glottis_states(check_only=False) -> Path | None:
    """聲帶閉合三級：同一張《Glottis positions》裁出 D／B／A 三格。

    這張圖是公有領域的線稿，圖例寫在檔案說明裡：
    A 閉合、B 正常嗓音、C 耳語、D 氣聲、E–F 呼吸。
    """
    panels = [
        ("氣聲（D）", "兩片分開，氣一直漏", "音色沙、容易累", 600),
        ("正常嗓音（B）", "輕輕靠攏", "乾淨、省力", 200),
        ("閉合（A）", "完全閉上，準備發聲", "擋得住氣，但別夾", 0),
    ]
    if check_only:
        for name, *_ in panels:
            print("  panel:", name)
        return None

    width, height = 640, 430
    src_w, src_h = 1200, 226
    panel_w, panel_h = 180, 194
    xs = [40, 240, 440]
    top = 96

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="聲帶閉合三級：氣聲、正常、閉合">',
        '  <title>聲帶閉合三級：氣聲、正常、閉合</title>',
        f'  <rect width="{width}" height="{height}" fill="{PAPER}"/>',
        f'  <text x="26" y="34" font-family="{FONT}" font-size="16" font-weight="700" fill="{INK}">聲帶閉合三級</text>',
        f'  <text x="26" y="55" font-family="{FONT}" font-size="12.5" fill="{MUTED}">'
        f'聲門張開的程度，決定聲音漏不漏氣、喉嚨累不累</text>',
    ]
    for i, (name, what, why, sx) in enumerate(panels):
        x = xs[i]
        parts.append(
            f'  <svg x="{x}" y="{top}" width="{panel_w}" height="{panel_h}" '
            f'viewBox="{sx} 0 200 {src_h}">'
            f'<image x="0" y="0" width="{src_w}" height="{src_h}" xlink:href="_anatomy/src/glottis-positions.png"/>'
            f"</svg>"
        )
        parts.append(f'  <text x="{x + panel_w / 2}" y="{top + panel_h + 26}" text-anchor="middle" '
                     f'font-family="{FONT}" font-size="13" font-weight="600" fill="{INK}">{name}</text>')
        parts.append(f'  <text x="{x + panel_w / 2}" y="{top + panel_h + 46}" text-anchor="middle" '
                     f'font-family="{FONT}" font-size="11.5" fill="{MUTED}">{what}</text>')
        parts.append(f'  <text x="{x + panel_w / 2}" y="{top + panel_h + 64}" text-anchor="middle" '
                     f'font-family="{FONT}" font-size="11.5" fill="{MUTED}">{why}</text>')
    parts.append(f'  <text x="26" y="{height - 14}" font-family="{FONT}" font-size="10.5" fill="{MUTED}">'
                 f'底圖：Wikimedia Commons（公有領域），說明文字依原檔圖例 A／B／D 重繪</text>')
    parts.append("</svg>\n")

    target = OUT / "closure-grades.svg"
    target.write_text("\n".join(parts), encoding="utf-8")
    return target


def build_glottis_pair(check_only=False) -> Path | None:
    """吸氣張開／發聲靠攏：同一份線稿的 F（呼吸）與 A（閉合）。"""
    if check_only:
        print("  panels: F（呼吸）, A（閉合）")
        return None

    panels = [
        ("吸氣：張開", "讓氣通過", 1034),
        ("發聲：靠攏", "兩片碰在一起才擋得住氣", 34),
    ]
    width, height = 640, 430
    src_w, src_h = 1200, 226
    panel_w, panel_h = 160, 200
    xs = [120, 360]

    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="聲帶開合：吸氣張開、發聲靠攏">',
        "  <title>聲帶開合：吸氣張開、發聲靠攏</title>",
        f'  <rect width="{width}" height="{height}" fill="{PAPER}"/>',
        f'  <text x="26" y="34" font-family="{FONT}" font-size="16" font-weight="700" fill="{INK}">聲帶的開與合</text>',
        f'  <text x="26" y="55" font-family="{FONT}" font-size="12.5" fill="{MUTED}">'
        "吸氣時張開讓氣通過，發聲時靠攏把氣擋住</text>",
    ]
    for i, (name, note, sx) in enumerate(panels):
        x = xs[i]
        parts.append(
            f'  <svg x="{x}" y="96" width="{panel_w}" height="{panel_h}" viewBox="{sx} 0 116 {src_h}">'
            f'<image x="0" y="0" width="{src_w}" height="{src_h}" xlink:href="_anatomy/src/glottis-positions.png"/>'
            f"</svg>"
        )
        parts.append(f'  <text x="{x + panel_w / 2}" y="{96 + panel_h + 28}" text-anchor="middle" '
                     f'font-family="{FONT}" font-size="13" font-weight="600" fill="{INK}">{name}</text>')
        parts.append(f'  <text x="{x + panel_w / 2}" y="{96 + panel_h + 48}" text-anchor="middle" '
                     f'font-family="{FONT}" font-size="11.5" fill="{MUTED}">{note}</text>')
    parts.append(f'  <text x="26" y="{height - 14}" font-family="{FONT}" font-size="10.5" fill="{MUTED}">'
                 "底圖：Wikimedia Commons「Glottis positions」（公有領域），本站裁切</text>")
    parts.append("</svg>\n")

    target = OUT / "folds-open-closed.svg"
    target.write_text("\n".join(parts), encoding="utf-8")
    return target


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
