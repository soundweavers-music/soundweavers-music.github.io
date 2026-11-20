#!/usr/bin/env python3
"""詞曲創作課程（/songwriting/）的示意圖。

沿用 build_vocal_figures 的版面元件，風格跟人聲、樂理課一致：
米白底、細線、單一強調色。每一張都對應課文裡一個具體概念，不做裝飾圖。

用法：python scripts/build_songwriting_figures.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_figures as vf  # noqa: E402

OUT = BASE_DIR / "assets" / "songwriting"
W = 760


def write(name: str, svg: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(svg, encoding="utf-8")
    print("  %-24s %5.1f KB" % (name, len(svg) / 1024))


# ── 1. 七個零件在一條三分鐘時間軸上 ─────────────────────────────
def fig_song_structure():
    w, h = W, 330
    b = []
    b.append(vf.ts(26, 84, "一首三分鐘的歌，橫軸是時間；色塊的寬度就是它在歌裡佔的長度。", size=12))
    x0, x1, y, bh = 40, w - 40, 112, 46
    parts = [
        ("前奏", 8, "#EDE6DC"), ("主歌 1", 16, "#E3D6C4"), ("導歌", 6, "#D8C7AF"),
        ("副歌 1", 12, vf.ACCENT), ("主歌 2", 10, "#E3D6C4"), ("導歌", 6, "#D8C7AF"),
        ("副歌 2", 12, vf.ACCENT), ("橋段", 8, "#CFC2B2"), ("副歌 3", 14, vf.ACCENT),
        ("尾奏", 8, "#EDE6DC"),
    ]
    total = sum(p[1] for p in parts)
    x = x0
    for name, bars, fill in parts:
        width = (x1 - x0) * bars / total
        b.append(vf.rect(x, y, width - 2, bh, fill=fill, stroke=vf.LINE, rx=4))
        dark = fill == vf.ACCENT
        b.append(vf.ts(x + width / 2 - 1, y + 28, name, size=10, anchor="middle",
                       **({"style": "fill:#FFFFFF"} if dark else {"color": vf.INK})))
        x += width
    b.append(vf.ts(x0, y - 10, "0:00", size=10, color=vf.MUTED))
    b.append(vf.ts(x1, y - 10, "約 3:00", size=10, anchor="end", color=vf.MUTED))
    # 說明列
    rows = [
        ("副歌只佔三分之一", "但整首歌的記憶度幾乎全部來自這裡——力氣要放在對的地方。"),
        ("主歌 2 比主歌 1 短", "第一次聽需要資訊，第二次聽只需要回到副歌。"),
        ("橋段可有可無", "換一種情緒用的；沒有橋段不會不成立，只是少了一次對比。"),
    ]
    ry = 196
    for head, line in rows:
        b.append(vf.circle(46, ry - 4, 3.2, fill=vf.ACCENT))
        b.append(vf.ts(58, ry, head, size=12, weight="700"))
        b.append(vf.ts(58, ry + 18, line, size=11, color=vf.MUTED))
        ry += 44
    return vf.frame(w, h, "流行歌的七個零件",
                    "".join(b),
                    subtitle="同樣的骨架用了三十年，改變的是包裝，不是順序")


# ── 2. 前三十秒的兩種策略 ─────────────────────────────────
def fig_hook_window():
    w, h = W, 330
    b = []
    b.append(vf.ts(26, 84, "使用者平均只給你 30 秒。這 30 秒裡要有東西抓住人。", size=12))
    x0, x1 = 130, w - 40
    rows = [
        ("一般結構", ["前奏 8 小節", "主歌 1", "導歌", "副歌 1"], "副歌在 0:45 才出現——風險高"),
        ("副歌先唱", ["副歌（清唱）", "主歌 1", "導歌", "副歌 1"], "一開口就是最強的那八小節"),
        ("前奏即鉤子", ["前奏（記憶點）", "主歌 1", "導歌", "副歌 1"], "前奏自己就是一段會記住的旋律"),
    ]
    b.append(vf.rect(x0, 96, (x1 - x0) * 30 / 180, 196, fill="#F7EDE0", stroke="none", rx=6))
    for i, (label, cells, note) in enumerate(rows):
        y = 112 + i * 74
        b.append(vf.ts(26, y + 22, label, size=11.5, weight="700"))
        cx = x0
        for j, cell in enumerate(cells):
            cw = (x1 - x0) * (0.34 if j == 0 else 0.22)
            hot = j == 0 and i > 0
            b.append(vf.rect(cx, y, cw - 6, 30, fill=vf.ACCENT if hot else "#FFFFFF",
                             stroke=vf.LINE, rx=5))
            b.append(vf.ts(cx + (cw - 6) / 2, y + 20, cell, size=10, anchor="middle",
                           **({"style": "fill:#FFFFFF"} if hot else {"color": vf.INK})))
            cx += cw
        b.append(vf.ts(x0, y + 50, note, size=10, color=vf.ACCENT if i else vf.MUTED))

    return vf.frame(w, h, "三十秒定律",
                    "".join(b),
                    subtitle="粉紅底是前 30 秒；三種結構都在回答同一個問題：怎麼最快給出記憶點")


# ── 3. 抽象 vs 具體 ───────────────────────────────────────
def fig_concrete_abstract():
    w, h = W, 360
    b = []
    b.append(vf.ts(26, 84, "左邊是結論，右邊是證據。聽眾要的是證據。", size=12))
    pairs = [("我很難過", "我把車停在路邊，雨刷還開著"),
             ("我很想他", "我還是買了兩杯咖啡"),
             ("我們回不去了", "你留下的傘，我今天才收進櫃子"),
             ("我很孤單", "我在便利商店等到店員換班")]
    b.append(vf.ts(40, 116, "抽象（結論）", size=11.5, color=vf.MUTED, weight="700"))
    b.append(vf.ts(300, 116, "具體（證據）", size=11.5, color=vf.ACCENT, weight="700"))
    for i, (bad, good) in enumerate(pairs):
        y = 132 + i * 48
        b.append(vf.rect(26, y, 220, 38, fill="#F4EFE7", stroke=vf.LINE, rx=6))
        b.append(vf.ts(40, y + 24, bad, size=11.5, color=vf.MUTED))
        b.append(vf.rect(290, y, 444, 38, fill="#FFFFFF", stroke=vf.ACCENT, rx=6))
        b.append(vf.ts(304, y + 24, good, size=11.5))
    b.append(vf.ts(26, h - 18, "「床前明月光」是證據，「低頭思故鄉」才是結論——唐詩一千年前就這樣寫了。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "具體勝過抽象", "".join(b),
                    subtitle="不要告訴聽眾你的感覺，給他一幅畫面，讓他自己產生那個感覺")


# ── 4. 四聲與旋律 ────────────────────────────────────────
def fig_tone_contour():
    w, h = W, 340
    b = []
    tones = [("一聲", [("平", 20, 0)]), ("二聲", [("升", 0, 20)]),
             ("三聲", [("降", 0, -14), ("升", 0, 14)]), ("四聲", [("降", 20, -20)])]
    b.append(vf.ts(26, 84, "國語四聲的走向（縱軸＝音高）。寫旋律時，順著它走就聽得懂。", size=12))
    base_y, span = 190, 46
    # 四條聲調線
    coords = [(0, 0.0, 0.0), (1, 0.0, 0.85), (2, 0.35, 0.05), (3, 0.75, 0.0)]
    xs = [60, 190, 320, 450]
    for i, ((label, _), (_, a, c)) in enumerate(zip(tones, coords)):
        cx = xs[i]
        x0, y0 = cx, base_y - a * span
        b.append(vf.ts(cx + 24, base_y + 30, label, size=11.5, anchor="middle", weight="700"))
        if i == 2:
            b.append(vf.path(f"M{x0} {base_y - span * 0.25} L{x0 + 22} {base_y - span * 0.05} "
                             f"L{x0 + 44} {base_y - span * 0.55}", cls="acc", sw=2.2))
        else:
            b.append(vf.path(f"M{x0} {base_y - a * span} L{x0 + 44} {base_y - c * span}",
                             cls="acc", sw=2.2))
        b.append(vf.circle(x0, base_y - a * span, 3, fill=vf.ACCENT))
        b.append(vf.circle(x0 + 44, base_y - c * span, 3, fill=vf.ACCENT))
    b.append(vf.ts(26, h - 18, "例：「我愛你」是三聲、四聲、三聲。旋律若把「愛」拉高，聽起來會變成「矮」。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "中文歌詞的聲調陷阱", "".join(b),
                    subtitle="同一個音節，聲調不同就是不同的字；旋律逆著走，聽眾會聽錯字")


# ── 5. 動機的三種變化 ────────────────────────────────────
def fig_motive():
    w, h = W, 360
    b = []
    b.append(vf.ts(26, 84, "四個音是種子。整段副歌＝種子＋三種變化。", size=12))
    rows = [
        ("動機", [1, 2, 3, 2], "四個音，形狀固定"),
        ("重複", [1, 2, 3, 2], "完全一樣再來一次——最有效"),
        ("模進", [2, 3, 4, 3], "同樣形狀整體往上移"),
        ("變尾", [1, 2, 3, 1], "前面一樣，只改最後一個音（收住）"),
    ]
    for i, (label, notes, note) in enumerate(rows):
        y = 116 + i * 58
        b.append(vf.ts(26, y + 22, label, size=11.5, weight="700"))
        for j, n in enumerate(notes):
            cx = 150 + j * 44
            cy = y + 18 - (n - 1) * 7
            b.append(vf.circle(cx, cy, 9, fill=vf.ACCENT if i else "#FFF",
                               stroke=vf.ACCENT if i else vf.LINE, sw=1.6))
            b.append(vf.ts(cx, cy + 4, str(n), size=9, anchor="middle",
                           color="#FFFFFF" if i else vf.INK))
        b.append(vf.ts(360, y + 24, note, size=11, color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "把這三種變化排成八小節，就是一段完整的副歌了：動機、重複、模進、變尾。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "動機與它的三種變化", "".join(b),
                    subtitle="數字是和弦級數裡的音級；真正的重點是形狀，不是音高")


# ── 6. 句尾的落點 ────────────────────────────────────────
def fig_phrase_ending():
    w, h = W, 320
    b = []
    b.append(vf.ts(26, 84, "四句副歌：前三句懸著（逗號），最後一句落地（句號）。", size=12))
    rows = [("第 1 句", "2", "不穩定", vf.MUTED, "往前推"),
            ("第 2 句", "4", "不穩定", vf.MUTED, "再推一次"),
            ("第 3 句", "6", "不穩定", vf.MUTED, "換口氣，但別放掉"),
            ("第 4 句", "1", "穩定", vf.ACCENT, "收住")]
    for i, (label, n, kind, col, note) in enumerate(rows):
        y = 116 + i * 48
        b.append(vf.ts(26, y + 20, label, size=11.5, weight="700"))
        b.append(vf.ts(110, y + 20, f"收在 {n}", size=11.5, color=col, weight="700"))
        b.append(vf.rect(200, y, 300, 30, fill="#FFFFFF" if i < 3 else "#F3E4D2",
                         stroke=vf.LINE, rx=5))
        b.append(vf.path(f"M210 {y + 22} L488 {y + 22}" if i == 3 else
                         f"M210 {y + 22} L440 {y + 22}", cls="ink", sw=1.2, dash="3 4"))
        b.append(vf.ts(516, y + 20, kind, size=10.5, color=col, weight="700"))
        b.append(vf.ts(596, y + 20, note, size=10, color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "四句都落地會很平，四句都懸著會很飄；前後落差就是「完整」的感覺。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "句尾收在哪", "".join(b),
                    subtitle="1、3、5 是穩定音；2、4、6、7 是不穩定音（以 C 大調為例）")


FIGS = [
    ("song-structure.svg", fig_song_structure),
    ("hook-window.svg", fig_hook_window),
    ("concrete-abstract.svg", fig_concrete_abstract),
    ("tone-contour.svg", fig_tone_contour),
    ("motive.svg", fig_motive),
    ("phrase-ending.svg", fig_phrase_ending),
]


def main() -> None:
    print("產生詞曲創作示意圖：")
    for name, fn in FIGS:
        write(name, fn())
    print("\n輸出目錄：%s" % OUT.relative_to(BASE_DIR))


if __name__ == "__main__":
    main()
