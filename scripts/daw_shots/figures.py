"""課程圖：從 2 倍截圖裁出「正在講的那一小塊」，加上紅框、編號與箭頭。

座標一律從 raw/<shot>.json 讀——那是 capture.py 在截圖前，把每一個介面元素的
getBoundingClientRect 回報出來的結果。以前的版本把座標寫死在這裡，介面一改版
（多一條軌、換示範專案、面板高度變）標註就全部跑掉，所以現在只寫「標哪個元素」。

`box` 決定裁切範圍，`marks` 是疊上去的標註：

    [x, y, w, h]                  直接用 CSS px
    ("sel", 選擇器, 第幾個, 邊距)   用元素的位置，四周留邊距

    ('r', 框) / ('R', 元素, i, 邊距)     紅色圓角框
    ('s', 框) / ('S', 元素, i, 邊距)     聚光：這個範圍以外壓暗
    ('n', x, y, 文字)                   編號圓標
    ('a', x1, y1, x2, y2)               箭頭
    ('t', x, y, 文字)                   小字標籤

用法：python scripts/daw_shots/figures.py [圖 id ...]
"""
import json
import math
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
# --en：讀英文介面的截圖，輸出到 assets/daw-course/en/（中文版那一批不動）
EN = "--en" in sys.argv
if EN:
    sys.argv.remove("--en")
RAW = BASE / "work" / "daw-shots" / ("raw-en" if EN else "raw")
OUT = BASE / "assets" / "daw-course" / ("en" if EN else "")
DPR = 2
W, H = 1400, 840          # capture.py 的視窗區大小（CSS px）

RED = (226, 74, 52)
WHITE = (255, 255, 255)


def font(size):
    for name in ("msyhbd.ttc", "msjh.ttc", "seguisb.ttf", "arialbd.ttf"):
        p = pathlib.Path(r"C:\Windows\Fonts") / name
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                pass
    return ImageFont.load_default()


FIGS = [
    # ── 第 1 堂：介面五大區 ─────────────────────────────────
    dict(id="daw-01-areas", shot="overview", box=[0, 0, 1400, 840],
         marks=[("n", 480, 28, "1"), ("n", 178, 106, "2"), ("n", 232, 690, "3"),
                ("n", 472, 104, "4"), ("n", 700, 826, "5")]),
    dict(id="daw-01-transport", shot="overview", box=[596, 0, 470, 56],
         marks=[("r", (611, 4, 241, 46))]),
    dict(id="daw-01-head", shot="overview", box=("sel", ".thead", 0, 10), marks=[]),

    # ── 第 2 堂：專案與存檔 ─────────────────────────────────
    dict(id="daw-02-project", shot="overview", box=[0, 0, 780, 56],
         marks=[("r", (46, 10, 126, 36)), ("r", (160, 4, 64, 48))]),

    # ── 第 3 堂：時間軸與對齊 ───────────────────────────────
    dict(id="daw-03-ruler", shot="overview", box=[60, 44, 760, 170],
         marks=[("r", (91, 47, 56, 42)), ("r", (428, 90, 600, 64))]),

    # ── 第 4 堂：軌道 ─────────────────────────────────────
    dict(id="daw-04-track", shot="overview", box=("sel", ".thead", 0, 12), marks=[]),

    # ── 第 5 堂：匯入音檔 ──────────────────────────────────
    dict(id="daw-05-import", shot="overview", box=[428, 538, 900, 275],
         marks=[("R", (444, 656, 868, 130)),
                ("t", (462, 692, "Drag the file onto an empty part of a track" if EN
                       else "把檔案拖到軌道的空白處"))]),

    # ── 第 6 堂：錄音 ─────────────────────────────────────
    dict(id="daw-06-record", shot="overview", box=("sel", ".thead", 0, 12),
         marks=[("r", (222, 180, 108, 28))]),
    dict(id="daw-06-transport", shot="overview", box=[700, 0, 140, 56],
         marks=[("r", (763, 4, 51, 46))]),

    # ── 第 9 堂：鋼琴捲簾怎麼讀（英文版補的，中文版那張是舊腳本畫的）──────
    # 不疊字：紅標貼上去會壓住音符，這張乾淨的就好，讀法交給課文說明
    dict(id="daw-09-pr", shot="pianoroll", box=[0, 500, 1400, 340], marks=[]),

    # ── 第 8 堂：片段編輯 ─────────────────────────────────
    dict(id="daw-08-clip", shot="overview", box=[428, 280, 620, 72],
         marks=[("r", (432, 284, 580, 52))]),

    # ── 第 9／10 堂：MIDI 與音色 ───────────────────────────
    dict(id="daw-10-instrument", shot="overview", box=("sel", ".thead", 0, 12),
         marks=[("r", (356, 154, 70, 28))]),
    dict(id="daw-10-banks", shot="dlg-banks", box=("sel", "#dlgBanks", 0, 10), marks=[]),

    # ── 第 11 堂：和弦軌 ──────────────────────────────────
    dict(id="daw-11-chords", shot="chords", box=[0, 60, 950, 700],
         marks=[("r", (428, 118, 904, 40)), ("r", (4, 366, 191, 340))]),

    # ── 第 12 堂：自動伴奏 ────────────────────────────────
    dict(id="daw-12-arranger", shot="arranger", box=("sel", ".arr-win", 0, 12), marks=[]),

    # ── 第 13-17 堂：效果器面板 ────────────────────────────
    dict(id="daw-13-eq", shot="fx-eq", box=("sel", ".fx-panel", 0, 12), marks=[]),
    dict(id="daw-14-comp", shot="fx-comp", box=("sel", ".fx-panel", 0, 12), marks=[]),
    dict(id="daw-15-tune", shot="fx-tune", box=("sel", ".fx-panel", 0, 12), marks=[]),
    dict(id="daw-16-harm", shot="fx-harm", box=("sel", ".fx-panel", 0, 12), marks=[]),
    dict(id="daw-17-reverb", shot="fx-reverb", box=("sel", ".fx-panel", 0, 12), marks=[]),

    # ── 第 18 堂：混音台 ──────────────────────────────────
    dict(id="daw-18-mixer", shot="mixer", box=("sel", "#mixer", 0, 6),
         marks=[("r", (4, 456, 84, 352)), ("r", (1310, 456, 84, 352))]),

    # ── 第 19 堂：自動化 ──────────────────────────────────
    dict(id="daw-19-auto", shot="automation", box=[196, 150, 820, 210],
         marks=[("r", (432, 262, 900, 56))]),

    # ── 第 21-24 堂：電子琴進階、智慧編曲與創作 ─────────────
    dict(id="daw-21-sections", shot="arranger", box=[60, 40, 1120, 520], marks=[]),
    dict(id="daw-23-tabs", shot="ai", box=[210, 340, 1035, 175], marks=[]),
    dict(id="daw-23-analyze", shot="ai", box=[210, 385, 1035, 250], marks=[]),
    dict(id="daw-24-chords", shot="ai-compose", box=[205, 455, 1045, 330], marks=[]),
    dict(id="daw-24-compose", shot="ai-compose", box=[205, 350, 1045, 520], marks=[]),

    # ── 第 20 堂：母帶與輸出 ───────────────────────────────
    dict(id="daw-20-master", shot="master", box=("sel", "#masterPanel", 0, 6), marks=[]),

    # ── 課程封面圖（每個檔案開頭那一張，整螢幕）────────────────
    dict(id="course-overview", shot="overview", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-chords", shot="chords0", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-arranger", shot="arranger", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-eq", shot="fx-eq", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-tune", shot="fx-tune", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-mixer", shot="mixer", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-master", shot="master", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-piano", shot="piano", box=[0, 0, 1400, 840], marks=[]),
    dict(id="course-album", shot="album", box=[0, 0, 1400, 840], marks=[]),
]



def load_meta(shot):
    p = RAW / (shot + ".json")
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def rect_of(meta, sel, i=0):
    v = meta.get(sel) or []
    if i >= len(v):
        raise SystemExit(f"量不到 {sel}[{i}]（先跑 capture.py）")
    return v[i]


def box_of(meta, spec):
    if isinstance(spec, (list, tuple)) and spec and isinstance(spec[0], str):
        _, sel, i, pad = spec
        x, y, w, h = rect_of(meta, sel, i)
        return [x - pad, y - pad, w + 2 * pad, h + 2 * pad]
    return list(spec)


def load_shot(name):
    p = RAW / (name + ".png")
    if not p.exists():
        raise SystemExit(f"缺 {p}（先跑 capture.py {name}）")
    im = Image.open(p).convert("RGB")
    # Chrome 的截圖是「視窗」大小，左上角才是視窗區
    return im.crop((0, 0, W * DPR, H * DPR))


def rounded(draw, box, r, outline, width):
    x, y, w, h = [int(round(v)) for v in box]
    r, width = int(round(r)), int(round(width))
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r, outline=outline, width=width)


def badge(draw, x, y, text, f, r=17):
    draw.ellipse([x - r, y - r, x + r, y + r], fill=RED, outline=WHITE, width=2)
    tw = draw.textlength(text, font=f)
    draw.text((x - tw / 2, y - r * 0.82), text, font=f, fill=WHITE)


def arrow(draw, x1, y1, x2, y2, width=4):
    draw.line([x1, y1, x2, y2], fill=RED, width=width)
    ang = math.atan2(y2 - y1, x2 - x1)
    L, Wd = 16, 9
    draw.polygon([
        (x2, y2),
        (x2 - L * math.cos(ang) + Wd * math.sin(ang), y2 - L * math.sin(ang) - Wd * math.cos(ang)),
        (x2 - L * math.cos(ang) - Wd * math.sin(ang), y2 - L * math.sin(ang) + Wd * math.cos(ang)),
    ], fill=RED)


def render(fig):
    meta = load_meta(fig["shot"])
    im = load_shot(fig["shot"])
    bx, by, bw, bh = box_of(meta, fig["box"])
    bx, by = max(0, bx), max(0, by)
    bw, bh = min(W - bx, bw), min(H - by, bh)
    crop = im.crop((bx * DPR, by * DPR, (bx + bw) * DPR, (by + bh) * DPR))

    def box_of_mark(spec):
        return box_of(meta, spec)

    # 聚光：先把整張壓暗，再把 focus 範圍貼回去
    spot = [box_of_mark(m[1]) for m in fig.get("marks", []) if m[0] in ("s", "S")]
    if spot:
        base = crop.copy()
        dark = Image.new("RGB", crop.size, (10, 8, 6))
        mask = Image.new("L", crop.size, 170)
        d0 = ImageDraw.Draw(mask)
        for x, y, w, h in spot:
            d0.rounded_rectangle([(x - bx) * DPR, (y - by) * DPR,
                                  (x - bx + w) * DPR, (y - by + h) * DPR],
                                 radius=8 * DPR, fill=0)
        crop = Image.composite(base, Image.blend(base, dark, 0.72), mask)

    d = ImageDraw.Draw(crop)
    f = font(16 * DPR)
    ft = font(12 * DPR)

    def px(v):
        return v * DPR

    for m in fig.get("marks", []):
        kind = m[0]
        if kind in ("r", "s", "R", "S"):
            x, y, w, h = box_of_mark(m[1])
            if kind in ("R", "S") or True:
                rounded(d, [px(x - bx), px(y - by), px(w), px(h)], px(7), RED,
                        max(2, int(px(1.6))))
        elif kind == "n":
            x, y, text = (m[1] if len(m) == 2 else m[1:])
            badge(d, px(x - bx), px(y - by), text, f)
        elif kind == "a":
            _, x1, y1, x2, y2 = m
            arrow(d, px(x1 - bx), px(y1 - by), px(x2 - bx), px(y2 - by), max(3, px(1.6)))
        elif kind == "t":
            x, y, text = (m[1] if len(m) == 2 else m[1:])
            tw = d.textlength(text, font=ft)
            d.rectangle([px(x - bx) - 6, px(y - by) - 4, px(x - bx) + tw + 6, px(y - by) + 20],
                        fill=RED)
            d.text((px(x - bx), px(y - by)), text, font=ft, fill=WHITE)
    return crop


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:]
    made = []
    for fig in FIGS:
        if wanted and fig["id"] not in wanted:
            continue
        im = render(fig)
        p = OUT / (fig["id"] + ".webp")
        im.save(p, quality=88, method=6)
        made.append((fig["id"], im.size, p.stat().st_size // 1024))
    for cid, size, kb in made:
        print(f"  {cid:18s} {size[0]}x{size[1]}  {kb} KB")

    cols, cw = 3, 660
    rows = (len(made) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * 420), "#151515")
    for i, (cid, _, _) in enumerate(made):
        im = Image.open(OUT / (cid + ".webp"))
        im.thumbnail((cw - 10, 380))
        sheet.paste(im, ((i % cols) * cw + 5, (i // cols) * 420 + 5))
    sheet.save(RAW.parent / "_figs.png")
    print(f"{len(made)} 張 → work/daw-shots/_figs.png")


if __name__ == "__main__":
    main()
