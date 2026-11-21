#!/usr/bin/env python3
"""詞曲創作課程（/songwriting/）的示意圖。

沿用 build_vocal_figures 的版面元件，風格跟人聲、樂理課一致：
米白底、細線、單一強調色。每一張都對應課文裡一個具體概念，不做裝飾圖。

用法：python scripts/build_songwriting_figures.py
"""
from __future__ import annotations

import html
import re
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


# ═══════════════════════════════════════════════════════════════
# 第二批：第 1–6 堂各再補圖
# ═══════════════════════════════════════════════════════════════

def _card(b, x, y, w, h, title, lines, accent=False):
    """一張小卡：標題＋兩三行說明。"""
    b.append(vf.rect(x, y, w, h, fill="#F3E4D2" if accent else "#FFFFFF", stroke=vf.LINE, rx=8))
    b.append(vf.ts(x + 16, y + 26, title, size=12.5, weight="700",
                   color=vf.ACCENT if accent else vf.INK))
    for i, line in enumerate(lines):
        b.append(vf.ts(x + 16, y + 48 + i * 18, line, size=10.5, color=vf.MUTED))


def fig_three_steps():
    w, h = W, 300
    b = []
    steps = [("① 標段落", ["聽第一遍，只標「換段落」", "不用術語：聽起來變成", "另一件事就是了"]),
             ("② 標和弦", ["聽第二遍，抓每個段落的", "和弦。抓不到全部沒關係，", "副歌那幾顆一定要有"]),
             ("③ 標動機", ["聽第三遍，把副歌第一句的", "音高形狀畫出來：往上、", "往下、持平"])]
    for i, (title, lines) in enumerate(steps):
        _card(b, 26 + i * 246, 92, 226, 130, title, lines, accent=(i == 2))
    b.append(vf.ts(26, 258, "三步都不碰歌詞——你要抓的是骨架，不是內容。", size=11, color=vf.MUTED))
    return vf.frame(w, h, "拆歌三步", "".join(b), subtitle="一首歌聽三遍，一遍只做一件事")


def fig_line_capacity():
    w, h = W, 300
    b = []
    b.append(vf.ts(26, 84, "副歌八小節＝四句；一句 8–12 個字是最好唱的長度。", size=12))
    for i in range(4):
        x = 40 + i * 176
        b.append(vf.rect(x, 108, 152, 60, fill="#FFFFFF" if i < 3 else "#F3E4D2",
                         stroke=vf.LINE, rx=7))
        b.append(vf.ts(x + 12, 132, "第 %d 句" % (i + 1), size=11, weight="700"))
        b.append(vf.ts(x + 12, 152, "8–12 字", size=10.5, color=vf.MUTED))
    b.append(vf.ts(40, 196, "八小節用完之後，第 2 輪副歌通常只留四句——不再加新內容。", size=11, color=vf.MUTED))
    b.append(vf.ts(40, 226, "寫之前先數格子：四句，就是四件事。第五件請留給下一首歌。",
                   size=11, color=vf.ACCENT, weight="700"))
    return vf.frame(w, h, "副歌的容納量", "".join(b),
                    subtitle="不是「寫得下就塞」，是先算你有幾個格子")


def fig_range_map():
    w, h = W, 320
    b = []
    y = 186
    b.append(vf.path("M60 %d L%d %d" % (y, w - 40, y), cls="ink", sw=1.2))
    for i, (name, lo, hi, note) in enumerate([("男聲", 0.18, 0.52, "C3–E4 左右"),
                                              ("女聲", 0.42, 0.78, "G3–C5 左右")]):
        yy = y - 52 - i * 44
        b.append(vf.rect(60 + (w - 100) * lo, yy, (w - 100) * (hi - lo), 22,
                         fill=vf.ACCENT if i else "#D8C7AF", stroke="none", rx=6))
        b.append(vf.ts(60, yy - 8, name, size=11.5, weight="700"))
        b.append(vf.ts(60 + (w - 100) * hi + 10, yy + 16, note, size=10, color=vf.MUTED))
    b.append(vf.ts(60, y + 24, "低", size=10.5, color=vf.MUTED))
    b.append(vf.ts(w - 40, y + 24, "高", size=10.5, anchor="end", color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "副歌的最高音不要超過舒適音域的邊緣——可以碰一下，不能整段待在那裡。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "先決定誰唱", "".join(b),
                    subtitle="寫給自己唱的歌，最好當場唱一次；唱不上去就不是高潮，是冒險")


def fig_chord_functions():
    w, h = W, 320
    b = []
    cols = [("主 T", ["1（C）", "3m（Em）", "6m（Am）"], "家。安定、結束", vf.ACCENT),
            ("下屬 S", ["4（F）", "2m（Dm）"], "往外走", "#C9A883"),
            ("屬 D", ["5（G）", "7°（Bdim）"], "最想回家", vf.INK)]
    for i, (name, chords, note, col) in enumerate(cols):
        x = 30 + i * 244
        b.append(vf.rect(x, 96, 224, 150, fill="#FFFFFF", stroke=vf.LINE, rx=10))
        b.append(vf.rect(x, 96, 224, 34, fill=col, stroke="none", rx=10))
        b.append(vf.ts(x + 112, 118, name, size=12.5, anchor="middle",
                       style="fill:#FFFFFF", weight="700"))
        for j, c in enumerate(chords):
            b.append(vf.ts(x + 112, 158 + j * 26, c, size=12, anchor="middle"))
        b.append(vf.ts(x + 112, 236, note, size=10.5, anchor="middle", color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "流行歌九成的段落就是這三種角色在輪流：家 → 出去 → 更想回家 → 回家。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "七顆和弦，三種角色", "".join(b),
                    subtitle="2、3、6 都是替身，讓路線不要那麼直")


def fig_progressions():
    w, h = W, 330
    b = []
    rows = [("1-5-6-4", ["1", "5", "6", "4"], "C–G–Am–F", "最通用；一直在動，適合主歌"),
            ("卡農", ["1", "5", "6", "3", "4", "1", "4", "5"], "C–G–Am–Em–F–C–F–G", "八小節；旋律怎麼唱都合"),
            ("4-5-3-6", ["4", "5", "3", "6"], "F–G–Em–Am", "王道進行；還沒開始就在路上")]
    for i, (name, degs, chords, note) in enumerate(rows):
        y = 108 + i * 74
        b.append(vf.ts(26, y + 20, name, size=12, weight="700"))
        for j, d in enumerate(degs):
            cx = 150 + j * 58
            b.append(vf.circle(cx, y + 14, 15, fill="#FFFFFF", stroke=vf.ACCENT, sw=1.6))
            b.append(vf.ts(cx, y + 19, d, size=11, anchor="middle", color=vf.ACCENT, weight="700"))
        b.append(vf.ts(150, y + 44, chords, size=10, color=vf.MUTED))
        b.append(vf.ts(26, y + 44, note, size=10, color=vf.MUTED))
    return vf.frame(w, h, "三組萬用進行", "".join(b),
                    subtitle="差別不在和弦，在「從哪裡開始、繞多遠」")


def fig_chord_density():
    w, h = W, 300
    b = []
    rows = [("一小節一顆", 1, "抒情、慢歌，旋律有空間"),
            ("兩拍一顆", 2, "副歌，有推動感"),
            ("前半＋後半", 2, "導歌，製造「快到了」")]
    for i, (label, per, note) in enumerate(rows):
        y = 104 + i * 66
        b.append(vf.ts(26, y + 22, label, size=11.5, weight="700"))
        for bar in range(2):
            for k in range(per):
                width = 170 / per
                x = 190 + bar * 200 + k * width
                b.append(vf.rect(x, y, width - 8, 32, fill="#F3E4D2" if i == 1 else "#FFFFFF",
                                 stroke=vf.ACCENT if per > 1 else vf.LINE, rx=6))
                b.append(vf.ts(x + (width - 8) / 2, y + 21, "和弦", size=10, anchor="middle"))
        b.append(vf.ts(600, y + 22, note, size=10, color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "要延長情緒時，降低密度比加樂器有效——把一顆和弦拉成兩小節試試看。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "換和弦的密度", "".join(b),
                    subtitle="同樣四個小節，換的時機一變，氣質就變")


def fig_stress_on_beat():
    w, h = W, 300
    b = []
    words = ["我", "把", "車", "停", "在", "路", "邊"]
    for i, (label, stress, note) in enumerate([("重音在「車」", 2, "聽起來：我把〔車〕停在路邊"),
                                               ("重音在「停」", 3, "聽起來：我把車〔停〕在路邊")]):
        y = 110 + i * 84
        b.append(vf.ts(26, y + 26, label, size=11.5, weight="700"))
        for j, wd in enumerate(words):
            cx = 190 + j * 46
            strong = j == stress
            if strong:
                b.append(vf.circle(cx, y + 20, 17, fill=vf.ACCENT))
            b.append(vf.ts(cx, y + 25, wd, size=13, anchor="middle",
                           **({"style": "fill:#FFFFFF"} if strong else {"color": vf.INK})))
        b.append(vf.ts(190, y + 50, note, size=10, color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "先決定這句話的重點是哪個字，再讓旋律把它放到第 1 拍。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "重音要落在強拍上", "".join(b),
                    subtitle="同一句話，重音一換，意思的重心就換了")


def fig_syllable_beat():
    w, h = W, 330
    b = []
    rows = [("一字一拍", 4, "很清楚，適合抒情"),
            ("一字半拍", 8, "流行歌最常見，有流動感"),
            ("一字四分之一拍", 16, "已經是饒舌的密度")]
    for i, (label, n, note) in enumerate(rows):
        y = 104 + i * 66
        b.append(vf.ts(26, y + 22, label, size=11.5, weight="700"))
        b.append(vf.ts(190, y + 22, "一小節 %d 個字" % n, size=11, color=vf.ACCENT, weight="700"))
        b.append(vf.ts(190, y + 42, note, size=10, color=vf.MUTED))
        for k in range(n):
            width = 360 / n
            b.append(vf.rect(360 + k * width, y - 4, width - 3, 24, fill="#F3E4D2",
                             stroke=vf.LINE, rx=3))
    b.append(vf.ts(26, 314, "寫之前先數：這句幾個字？超過 10 個字又要塞進一小節，就得砍。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "字與拍的密度", "".join(b),
                    subtitle="同樣四拍，放 4 個字和放 16 個字是兩種完全不同的歌")


def fig_prechorus_lift():
    w, h = W, 320
    b = []
    x0, x1 = 70, w - 50
    yb = 250

    def curve(pts, col, sw=2.2, dash=None):
        d = "M" + " L".join("%.0f %.0f" % (x0 + (x1 - x0) * a, yb - v) for a, v in pts)
        b.append(vf.path(d, stroke=col, sw=sw, dash=dash))

    curve([(0, 20), (0.25, 40), (0.5, 55), (0.66, 80), (0.78, 140), (1, 190)], vf.ACCENT)
    curve([(0, 30), (0.3, 30), (0.6, 45), (0.8, 70), (1, 90)], "#C9A883", 2, "5 4")
    curve([(0, 45), (0.4, 45), (0.7, 60), (0.85, 120), (1, 160)], vf.MUTED, 1.8, "2 4")
    for x, label in ((x0, "主歌"), (x0 + (x1 - x0) * 0.72, "導歌"), (x1, "副歌")):
        b.append(vf.ts(x, yb + 26, label, size=11, anchor="middle", color=vf.MUTED))
    b.append(vf.ts(x1 - 6, 66, "音高", size=10.5, anchor="end", color=vf.ACCENT))
    b.append(vf.ts(x1 - 6, 84, "節奏密度", size=10.5, anchor="end", color="#C9A883"))
    b.append(vf.ts(x1 - 6, 102, "和聲張力", size=10.5, anchor="end", color=vf.MUTED))
    b.append(vf.ts(26, h - 18, "三個工具可以只用一個。最省事的是第三個：導歌最後一小節停在 5 級不動。",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "導歌：三條線同時往上", "".join(b),
                    subtitle="導歌不講內容，只做「往上」這件事")


def fig_rewrite_check():
    w, h = W, 310
    b = []
    rows = [("唱到某個字會卡", "聲調與旋律打架", "改那個字的旋律，或換聲調不同的同義字"),
            ("唱到一半沒氣", "換氣點不見了", "把句子切短，或把某個字改成拖腔"),
            ("像講話，不像唱歌", "整首一路太密", "在句尾拉長一個字，兩拍到四拍")]
    b.append(vf.ts(30, 104, "症狀", size=11, color=vf.MUTED, weight="700"))
    b.append(vf.ts(300, 104, "原因", size=11, color=vf.MUTED, weight="700"))
    b.append(vf.ts(450, 104, "修法", size=11, color=vf.ACCENT, weight="700"))
    for i, (sym, cause, fix) in enumerate(rows):
        y = 120 + i * 52
        b.append(vf.rect(26, y, 232, 40, fill="#FFFFFF", stroke=vf.LINE, rx=6))
        b.append(vf.ts(40, y + 26, sym, size=11))
        b.append(vf.ts(300, y + 26, cause, size=10.5, color=vf.MUTED))
        b.append(vf.ts(450, y + 26, fix, size=10.5, color=vf.ACCENT))
    b.append(vf.ts(26, h - 16, "三個症狀對應三種修法，先判斷是哪一種，再動手。", size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "唱不順的三種症狀", "".join(b),
                    subtitle="先診斷，再修；三種一起改通常會全改壞")


def fig_demo_two_track():
    w, h = W, 300
    b = []
    b.append(vf.ts(26, 84, "左邊是兩軌 demo 該有的樣子；右邊是「加太多會發生的事」。", size=12))
    left = [("人聲", vf.ACCENT), ("吉他／鋼琴", "#C9A883")]
    right = [("人聲", vf.ACCENT), ("鼓", "#D8C7AF"), ("貝斯", "#D8C7AF"),
             ("吉他", "#D8C7AF"), ("弦樂", "#D8C7AF"), ("合聲", "#D8C7AF")]
    for i, (name, col) in enumerate(left):
        y = 112 + i * 40
        b.append(vf.rect(40, y, 250, 30, fill=col, stroke="none", rx=6))
        b.append(vf.ts(52, y + 20, name, size=11, style="fill:#FFFFFF", weight="700"))
    b.append(vf.ts(40, 212, "聽得出走音、拍子、換氣點", size=10.5, color=vf.ACCENT, weight="700"))
    for i, (name, col) in enumerate(right):
        y = 104 + i * 28
        b.append(vf.rect(410, y, 300, 22, fill=col, stroke="none", rx=5))
        b.append(vf.ts(422, y + 16, name, size=10,
                       **({"style": "fill:#FFFFFF"} if col == vf.ACCENT else {"color": vf.INK})))
    b.append(vf.ts(410, 284, "聽起來很滿，但問題全被蓋住了", size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "兩軌 demo 是照妖鏡", "".join(b),
                    subtitle="demo 的用途是讓人聽懂歌，不是讓人驚豔製作")


def fig_thirty_minute():
    w, h = W, 290
    b = []
    blocks = [("0–5", "主題句"), ("5–15", "四句副歌"), ("15–25", "旋律"), ("25–30", "錄音／標記")]
    for i, (span, task) in enumerate(blocks):
        x = 30 + i * 178
        b.append(vf.rect(x, 104, 164, 72, fill=vf.ACCENT if i == 1 else "#FFFFFF",
                         stroke=vf.LINE, rx=8))
        b.append(vf.ts(x + 82, 132, span, size=11, anchor="middle",
                       **({"style": "fill:#FFFFFF"} if i == 1 else {"color": vf.MUTED})))
        b.append(vf.ts(x + 82, 156, task, size=12.5, anchor="middle",
                       **({"style": "fill:#FFFFFF"} if i == 1 else {"color": vf.INK})))
    b.append(vf.ts(30, 206, "時間到就停。你練的是「在壓力下做決定」，不是「無限修到好」。",
                   size=11, color=vf.MUTED))
    b.append(vf.ts(30, 236, "第一次做完，你至少會有一段完整（但粗糙）的副歌——那就夠了。",
                   size=11, color=vf.ACCENT, weight="700"))
    return vf.frame(w, h, "三十分鐘計時流程", "".join(b),
                    subtitle="四個階段，每段只做一件事")


def fig_checklist():
    w, h = W, 300
    b = []
    items = ["副歌一次就能懂", "主歌有畫面", "沒有唱不順的地方",
             "副歌會重複，而且第二次有變化", "兩軌 demo 聽得完", "標題對得上"]
    for i, item in enumerate(items):
        y = 96 + i * 32
        b.append(vf.rect(40, y, 18, 18, fill="#FFFFFF", stroke=vf.ACCENT, rx=4))
        b.append(vf.ts(70, y + 15, item, size=11.5))
    b.append(vf.ts(430, 108, "六項都過", size=12.5, color=vf.ACCENT, weight="700"))
    b.append(vf.ts(430, 130, "才拿出去給人聽。", size=11, color=vf.MUTED))
    b.append(vf.ts(430, 162, "沒過的那一項，", size=11, color=vf.MUTED))
    b.append(vf.ts(430, 180, "就是你下一次要改的東西。", size=11, color=vf.MUTED))
    return vf.frame(w, h, "可以拿出去之前的六項檢查", "".join(b),
                    subtitle="檢核表不是打分數，是告訴你「還差哪一項」")


FIGS = [
    ("song-structure.svg", fig_song_structure),
    ("hook-window.svg", fig_hook_window),
    ("concrete-abstract.svg", fig_concrete_abstract),
    ("tone-contour.svg", fig_tone_contour),
    ("motive.svg", fig_motive),
    ("phrase-ending.svg", fig_phrase_ending),
    ("three-steps.svg", fig_three_steps),
    ("line-capacity.svg", fig_line_capacity),
    ("range-map.svg", fig_range_map),
    ("chord-functions.svg", fig_chord_functions),
    ("progressions.svg", fig_progressions),
    ("chord-density.svg", fig_chord_density),
    ("stress-on-beat.svg", fig_stress_on_beat),
    ("syllable-beat.svg", fig_syllable_beat),
    ("prechorus-lift.svg", fig_prechorus_lift),
    ("rewrite-check.svg", fig_rewrite_check),
    ("demo-two-track.svg", fig_demo_two_track),
    ("thirty-minute.svg", fig_thirty_minute),
    ("checklist.svg", fig_checklist),
]


# ── 英文版 ───────────────────────────────────────────────────
# 圖是程式畫的，重畫一份英文版最容易走鐘；改成「畫一次中文，再把 <text> 的
# 內容換成英文」。字典裡沒有的字串會原樣留下，並列在跑完的報告裡。
EN = {
    "流行歌的七個零件": "The seven parts of a pop song",
    "同樣的骨架用了三十年，改變的是包裝，不是順序":
        "The same skeleton for thirty years: the wrapping changed, not the order",
    "一首三分鐘的歌，橫軸是時間；色塊的寬度就是它在歌裡佔的長度。":
        "A three-minute song; the bar is time, and each block is how long that part lasts.",
    "副歌只佔三分之一": "The chorus is a third of the clock",
    "但整首歌的記憶度幾乎全部來自這裡——力氣要放在對的地方。":
        "and nearly all of the memorability comes from here.",
    "主歌 2 比主歌 1 短": "Verse 2 is shorter than verse 1",
    "第一次聽需要資訊，第二次聽只需要回到副歌。":
        "The first listen needs information; the second just wants the chorus.",
    "橋段可有可無": "The bridge is optional",
    "換一種情緒用的；沒有橋段不會不成立，只是少了一次對比。":
        "It exists for contrast; without it the song still works, it just has one fewer turn.",
    "前奏": "Intro", "主歌 1": "Verse 1", "主歌 2": "Verse 2",
    "導歌": "Pre", "副歌 1": "Chorus 1", "副歌 2": "Chorus 2", "副歌 3": "Chorus 3",
    "橋段": "Bridge", "尾奏": "Outro",
    "三十秒定律": "The thirty-second rule",
    "粉紅底是前 30 秒；三種結構都在回答同一個問題：怎麼最快給出記憶點":
        "The tinted band is the first 30 seconds; all three answer one question: how to give them something to remember, fastest.",
    "使用者平均只給你 30 秒。這 30 秒裡要有東西抓住人。":
        "Listeners give you about 30 seconds. Something has to grab them inside it.",
    "一般結構": "Standard", "副歌先唱": "Chorus first", "前奏即鉤子": "Intro is the hook",
    "前奏 8 小節": "Intro 8 bars", "副歌 1": "Chorus 1",
    "副歌（清唱）": "Chorus (bare)", "前奏（記憶點）": "Intro (the hook)",
    "副歌在 0:45 才出現——風險高": "The chorus lands at 0:45 — risky",
    "一開口就是最強的那八小節": "The strongest eight bars are the first thing you hear",
    "前奏自己就是一段會記住的旋律": "The intro is itself a melody you remember",
    "拆歌三步": "Three steps to take a song apart",
    "一首歌聽三遍，一遍只做一件事": "Listen three times, one job per pass",
    "① 標段落": "1. Mark sections",
    "② 標和弦": "2. Mark chords",
    "③ 標動機": "3. Mark the motif",
    "聽第一遍，只標「換段落」": "First pass: only mark section changes",
    "不用術語：聽起來變成": "No terminology: if it sounds like",
    "另一件事就是了": "a different thing, mark it",
    "聽第二遍，抓每個段落的": "Second pass: find the chords in each",
    "和弦。抓不到全部沒關係，": "section. You don't need all of them,",
    "副歌那幾顆一定要有": "but you must get the chorus",
    "聽第三遍，把副歌第一句的": "Third pass: draw the pitch shape of",
    "音高形狀畫出來：往上、": "the chorus's first line — up, down,",
    "往下、持平": "or flat",
    "三步都不碰歌詞——你要抓的是骨架，不是內容。":
        "None of the three touches the lyrics: you want the skeleton, not the content.",
    "主歌": "Verse", "副歌": "Chorus", "約 3:00": "~3:00",
}

# 第二批字串（第 2–6 堂與共用元件）
EN.update({
    '和弦': 'chord',
    '8–12 字': '8–12 words',
    '不穩定': 'unstable',
    '第 1 句': 'Line 1',
    '第 2 句': 'Line 2',
    '第 3 句': 'Line 3',
    '第 4 句': 'Line 4',
    '人聲': 'Vocal',
    '具體勝過抽象': 'Concrete beats abstract',
    '不要告訴聽眾你的感覺，給他一幅畫面，讓他自己產生那個感覺': "Don't tell the listener how you feel. Give them an image and let the feeling arrive on its own.",
    '左邊是結論，右邊是證據。聽眾要的是證據。': 'Left is the conclusion, right is the evidence. Listeners want evidence.',
    '抽象（結論）': 'Abstract (conclusion)',
    '具體（證據）': 'Concrete (evidence)',
    '我很難過': "I'm sad",
    '我把車停在路邊，雨刷還開著': 'I pulled over; the wipers are still on',
    '我很想他': 'I miss him',
    '我還是買了兩杯咖啡': 'I still bought two coffees',
    '我們回不去了': "We can't go back",
    '你留下的傘，我今天才收進櫃子': 'I put your umbrella away today',
    '我很孤單': "I'm lonely",
    '我在便利商店等到店員換班': 'I waited until the clerk changed shift',
    '「床前明月光」是證據，「低頭思故鄉」才是結論——唐詩一千年前就這樣寫了。': 'Li Bai didn\'t write "I\'m homesick". He wrote moonlight, frost, a lifted head—and let you feel it.',
    '中文歌詞的聲調陷阱': 'The tone trap in Mandarin lyrics',
    '同一個音節，聲調不同就是不同的字；旋律逆著走，聽眾會聽錯字': 'Same syllable, different tone, different word. If the melody fights the tone, listeners hear the wrong word.',
    '國語四聲的走向（縱軸＝音高）。寫旋律時，順著它走就聽得懂。': 'The four Mandarin tones (vertical axis = pitch). Follow the contour and people understand.',
    '一聲': 'Tone 1',
    '二聲': 'Tone 2',
    '三聲': 'Tone 3',
    '四聲': 'Tone 4',
    '例：「我愛你」是三聲、四聲、三聲。旋律若把「愛」拉高，聽起來會變成「矮」。': 'Example: wǒ-ài-nǐ is tone 3–4–3. Lift the 愛 and it starts sounding like 矮 ("short").',
    '動機與它的三種變化': 'A motif and its three moves',
    '數字是和弦級數裡的音級；真正的重點是形狀，不是音高': 'The numbers are scale degrees; what matters is the shape, not the pitch.',
    '四個音是種子。整段副歌＝種子＋三種變化。': 'Four notes are the seed. A whole chorus is the seed plus three moves.',
    '動機': 'Motif',
    '四個音，形狀固定': 'Four notes, fixed shape',
    '重複': 'Repeat',
    '完全一樣再來一次——最有效': 'Exactly the same again — the strongest move',
    '模進': 'Sequence',
    '同樣形狀整體往上移': 'Same shape, moved up',
    '變尾': 'New ending',
    '前面一樣，只改最後一個音（收住）': 'Same start, only the last note changes (it lands)',
    '把這三種變化排成八小節，就是一段完整的副歌了：動機、重複、模進、變尾。': 'Arrange those moves over eight bars and you have a chorus: motif, repeat, sequence, new ending.',
    '句尾收在哪': 'Where the phrase lands',
    '1、3、5 是穩定音；2、4、6、7 是不穩定音（以 C 大調為例）': '1, 3 and 5 are stable; 2, 4, 6 and 7 are unstable (in C major)',
    '四句副歌：前三句懸著（逗號），最後一句落地（句號）。': 'Four lines: the first three hang in the air (commas), the last one lands (a full stop).',
    '收在 2': 'ends on 2',
    '往前推': 'pushes forward',
    '收在 4': 'ends on 4',
    '再推一次': 'pushes again',
    '收在 6': 'ends on 6',
    '換口氣，但別放掉': "take a breath, don't let go",
    '收在 1': 'ends on 1',
    '穩定': 'stable',
    '收住': 'lands',
    '四句都落地會很平，四句都懸著會很飄；前後落差就是「完整」的感覺。': 'All four landing is flat; all four hanging is unmoored. The drop is what makes it feel complete.',
    '副歌的容納量': 'How much a chorus holds',
    '不是「寫得下就塞」，是先算你有幾個格子': "Don't cram what fits. Count the slots first.",
    '副歌八小節＝四句；一句 8–12 個字是最好唱的長度。': 'Eight bars is four lines; 8–12 syllables a line sings best.',
    '八小節用完之後，第 2 輪副歌通常只留四句——不再加新內容。': 'After the first pass, chorus 2 usually keeps the four lines and adds nothing new.',
    '寫之前先數格子：四句，就是四件事。第五件請留給下一首歌。': 'Count the slots first: four lines, four things. Save the fifth for the next song.',
    '先決定誰唱': 'Decide who sings it',
    '寫給自己唱的歌，最好當場唱一次；唱不上去就不是高潮，是冒險': "If you're writing it for yourself, sing it on the spot. If you can't reach it, that isn't a climax—it's a gamble.",
    '男聲': 'Male voice',
    'C3–E4 左右': 'about C3–E4',
    '女聲': 'Female voice',
    'G3–C5 左右': 'about G3–C5',
    '低': 'low',
    '高': 'high',
    '副歌的最高音不要超過舒適音域的邊緣——可以碰一下，不能整段待在那裡。': "Never let the chorus's top note sit at the edge of the comfortable range. Touch it; don't live there.",
    '七顆和弦，三種角色': 'Seven chords, three roles',
    '2、3、6 都是替身，讓路線不要那麼直': '2, 3 and 6 are stand-ins; they keep the route from going straight.',
    '主 T': 'Tonic',
    '家。安定、結束': 'Home. Rest, resolution',
    '下屬 S': 'Subdominant',
    '往外走': 'Leaving home',
    '屬 D': 'Dominant',
    '最想回家': 'Wants to go home',
    '流行歌九成的段落就是這三種角色在輪流：家 → 出去 → 更想回家 → 回家。': 'Ninety percent of pop sections are these three roles taking turns: home → out → wanting home → home.',
    '三組萬用進行': 'Three progressions that cover everything',
    '差別不在和弦，在「從哪裡開始、繞多遠」': "The difference isn't the chords; it's where you start and how far you go round.",
    '最通用；一直在動，適合主歌': 'Most common',
    '卡農': 'Canon',
    '八小節；旋律怎麼唱都合': 'Eight bars',
    '王道進行；還沒開始就在路上': 'The royal road',
    '換和弦的密度': 'How often you change chords',
    '同樣四個小節，換的時機一變，氣質就變': 'Same four bars; change when the chords move and the mood changes.',
    '一小節一顆': 'One per bar',
    '抒情、慢歌，旋律有空間': 'Ballads; leaves the melody room',
    '兩拍一顆': 'One every two beats',
    '副歌，有推動感': 'Choruses; drives',
    '前半＋後半': 'Split in half',
    '導歌，製造「快到了」': 'Pre-choruses; makes it feel imminent',
    '要延長情緒時，降低密度比加樂器有效——把一顆和弦拉成兩小節試試看。': 'To stretch a feeling, thin out the changes rather than add instruments—hold one chord for two bars.',
    '重音要落在強拍上': 'Put the stressed word on the strong beat',
    '同一句話，重音一換，意思的重心就換了': 'Same sentence; move the stress and the meaning moves with it.',
    '重音在「車」': 'Stress on "car"',
    '聽起來：我把〔車〕停在路邊': 'reads: I left the CAR by the road',
    '重音在「停」': 'Stress on "left"',
    '聽起來：我把車〔停〕在路邊': 'reads: I LEFT the car by the road',
    '先決定這句話的重點是哪個字，再讓旋律把它放到第 1 拍。': 'Decide which word carries the meaning, then let the melody put it on beat one.',
    '字與拍的密度': 'Syllables per beat',
    '同樣四拍，放 4 個字和放 16 個字是兩種完全不同的歌': 'Four beats holds four syllables or sixteen—two completely different songs.',
    '一字一拍': 'One syllable per beat',
    '一小節 4 個字': '4 syllables a bar',
    '很清楚，適合抒情': 'Very clear; suits ballads',
    '一字半拍': 'One syllable per half beat',
    '一小節 8 個字': '8 syllables a bar',
    '流行歌最常見，有流動感': 'The pop default; it flows',
    '一字四分之一拍': 'One syllable per quarter beat',
    '一小節 16 個字': '16 syllables a bar',
    '已經是饒舌的密度': "That's rap density",
    '寫之前先數：這句幾個字？超過 10 個字又要塞進一小節，就得砍。': 'Count before you write: how many syllables? More than ten in one bar means cutting.',
    '導歌：三條線同時往上': 'The pre-chorus: three lines rising',
    '導歌不講內容，只做「往上」這件事': 'A pre-chorus says nothing new. It only lifts.',
    '音高': 'Pitch',
    '節奏密度': 'Rhythmic density',
    '和聲張力': 'Harmonic tension',
    '三個工具可以只用一個。最省事的是第三個：導歌最後一小節停在 5 級不動。': 'You only need one. Easiest is the third: hold the dominant through the last bar.',
    '唱不順的三種症狀': "Three symptoms of a line that won't sing",
    '先診斷，再修；三種一起改通常會全改壞': 'Diagnose first; fixing all three at once usually breaks all three.',
    '症狀': 'Symptom',
    '原因': 'Cause',
    '修法': 'Fix',
    '唱到某個字會卡': 'It snags on a word',
    '聲調與旋律打架': 'Tone fighting the melody',
    '改那個字的旋律，或換聲調不同的同義字': "Change that word's melody, or swap in a synonym with another tone",
    '唱到一半沒氣': 'You run out of breath',
    '換氣點不見了': 'No place to breathe',
    '把句子切短，或把某個字改成拖腔': 'Split the line, or let one word stretch',
    '像講話，不像唱歌': 'It sounds spoken, not sung',
    '整首一路太密': 'Everything is too dense',
    '在句尾拉長一個字，兩拍到四拍': 'Stretch one word at the end of the line, two to four beats',
    '三個症狀對應三種修法，先判斷是哪一種，再動手。': 'Three symptoms, three fixes. Work out which one you have before touching anything.',
    '兩軌 demo 是照妖鏡': 'A two-track demo shows everything',
    'demo 的用途是讓人聽懂歌，不是讓人驚豔製作': 'A demo exists so people understand the song, not so they admire the production.',
    '左邊是兩軌 demo 該有的樣子；右邊是「加太多會發生的事」。': 'Left: what a two-track demo looks like. Right: what happens when you add too much.',
    '吉他／鋼琴': 'Guitar / piano',
    '聽得出走音、拍子、換氣點': 'You can hear tuning, timing, breathing',
    '鼓': 'Drums',
    '貝斯': 'Bass',
    '吉他': 'Guitar',
    '弦樂': 'Strings',
    '合聲': 'Backing vocals',
    '聽起來很滿，但問題全被蓋住了': 'Sounds full; every problem is buried',
    '三十分鐘計時流程': 'The thirty-minute timer',
    '四個階段，每段只做一件事': 'Four stages; one job each',
    '主題句': 'Thesis line',
    '四句副歌': 'Four-line chorus',
    '旋律': 'Melody',
    '錄音／標記': 'Record / mark',
    '時間到就停。你練的是「在壓力下做決定」，不是「無限修到好」。': "Stop when the timer stops. You're practising decisions under pressure, not infinite revision.",
    '第一次做完，你至少會有一段完整（但粗糙）的副歌——那就夠了。': "The first attempt leaves you one complete, rough chorus. That's enough.",
    '可以拿出去之前的六項檢查': 'Six checks before you play it for anyone',
    '檢核表不是打分數，是告訴你「還差哪一項」': "The list isn't a score. It tells you which one is missing.",
    '副歌一次就能懂': 'The chorus lands on the first listen',
    '主歌有畫面': 'The verse has an image',
    '沒有唱不順的地方': 'Nothing snags when you sing it',
    '副歌會重複，而且第二次有變化': 'The chorus repeats, and the second one changes',
    '兩軌 demo 聽得完': 'You can sit through the two-track demo',
    '標題對得上': 'The title matches',
    '六項都過': 'All six',
    '才拿出去給人聽。': 'before you play it for anyone.',
    '沒過的那一項，': 'The one you fail',
    '就是你下一次要改的東西。': 'is what you fix next time.',
})


def fig_stress_on_beat_en():
    """英文版：換成英文句子逐詞排列，重音位置跟中文版同一個概念。"""
    w, h = W, 300
    b = []
    words = ["I", "left", "the", "car", "by", "the", "road"]
    rows = [('Stress on "car"', 3, "reads: I left the CAR by the road"),
            ('Stress on "left"', 1, "reads: I LEFT the car by the road")]
    for i, (label, stress, note) in enumerate(rows):
        y = 110 + i * 84
        b.append(vf.ts(26, y + 26, label, size=11.5, weight="700"))
        for j, wd in enumerate(words):
            cx = 160 + j * 62
            strong = j == stress
            if strong:
                b.append(vf.circle(cx, y + 20, 20, fill=vf.ACCENT))
            b.append(vf.ts(cx, y + 25, wd, size=12.5, anchor="middle",
                           **({"style": "fill:#FFFFFF"} if strong else {"color": vf.INK})))
        b.append(vf.ts(160, y + 52, note, size=10, color=vf.MUTED))
    b.append(vf.ts(26, h - 18,
                   "Decide which word carries the meaning, then let the melody put it on beat one.",
                   size=10.5, color=vf.MUTED))
    return vf.frame(w, h, "Put the stressed word on the strong beat", "".join(b),
                    subtitle="Same sentence; move the stress and the meaning moves with it")


TEXT_RE = re.compile(r"(<text\b[^>]*>)(.*?)(</text>)", re.S)
CJK_RE = re.compile(r"[一-鿿]")


def translate_svg(svg: str):
    """把 <text> 的內容換成英文；回傳 (新 svg, 沒翻到的字串)。"""
    missing = []

    def repl(m):
        raw = html.unescape(m.group(2)).strip()
        if not raw or not CJK_RE.search(raw):
            return m.group(0)
        en = EN.get(raw)
        if en is None:
            missing.append(raw)
            return m.group(0)
        return m.group(1) + html.escape(en) + m.group(3)

    return TEXT_RE.sub(repl, svg), missing


def main() -> None:
    print("產生詞曲創作示意圖：")
    en_out = OUT / "en"
    en_out.mkdir(parents=True, exist_ok=True)
    untranslated = {}
    for name, fn in FIGS:
        svg = fn()
        write(name, svg)
        en_svg, missing = translate_svg(svg)
        if name == "stress-on-beat.svg":
            # 中文那張是逐「字」排，英文要逐「詞」，逐字翻會變成亂碼
            en_svg, missing = fig_stress_on_beat_en(), []
        (en_out / name).write_text(en_svg, encoding="utf-8")
        if missing:
            untranslated[name] = missing
    print("\n中文：%s　英文：%s" % (OUT.relative_to(BASE_DIR), en_out.relative_to(BASE_DIR)))
    if untranslated:
        total = sum(len(v) for v in untranslated.values())
        print("\n還有 %d 條字串沒有英文（會以中文顯示）：" % total)
        for name, items in untranslated.items():
            print("  %-24s %s" % (name, "、".join(items[:5])))
    else:
        print("\n全部字串都有英文版。")


if __name__ == "__main__":
    main()
