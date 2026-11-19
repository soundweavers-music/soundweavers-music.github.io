#!/usr/bin/env python3
"""產生樂理課程的 SVG 示意圖（assets/theory/）。

風格跟 assets/vocal/ 一致：米白底、細線、單一強調色，標題在上、圖說在下。
每一張圖都對應樂理課程裡一個具體概念，不做裝飾性插圖。

用法：python scripts/make_theory_figures.py
"""
from __future__ import annotations

import math
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUT = BASE_DIR / "assets" / "theory"

INK = "#2b2722"
MUTED = "#8a8078"
ACCENT = "#A67C52"
SOFT = "#f7f3ee"
LINE = "#d9d2c9"
BLUE = "#6B8FBF"

_usage: dict[str, list[tuple[float, float, float, float]]] = {}


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _room(x, y, s, size):
    """粗略估計文字佔的方框，避免標籤疊在一起。"""
    w = sum(size * (1.0 if ord(ch) > 0x2E80 else 0.55) for ch in s)
    return (x, y - size, w, size * 1.35)


def text(x, y, s, size=13, anchor="start", color=INK, weight="400", _track=True):
    if _track:
        box = _room(x, y, s, size)
        if anchor == "middle":
            box = (x - box[2] / 2, box[1], box[2], box[3])
        elif anchor == "end":
            box = (x - box[2], box[1], box[2], box[3])
        _usage.setdefault("_", []).append(box)
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" text-anchor="{anchor}" '
            f'fill="{color}" font-weight="{weight}">{esc(s)}</text>')


def rect(x, y, w, h, fill="none", stroke="none", rx=0, sw=1.4):
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def line(x1, y1, x2, y2, color=INK, sw=1.4, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{color}" stroke-width="{sw}"{d}/>')


def circle(cx, cy, r, fill="none", stroke="none", sw=1.4):
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"/>')


def path(d, stroke=INK, fill="none", sw=1.4):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def frame(w, h, title, subtitle, body, note=None):
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="100%" '
        f'role="img" aria-label="{esc(title)}">',
        f'<rect width="{w}" height="{h}" fill="{SOFT}"/>',
        text(28, 40, title, 19, weight="700"),
    ]
    if subtitle:
        parts.append(text(28, 62, subtitle, 12.5, color=MUTED))
    parts.extend(body)
    if note:
        parts.append(text(28, h - 18, note, 11.5, color=MUTED))
    parts.append("</svg>")
    return "\n".join(parts)


def write(name: str, svg: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(svg + "\n", encoding="utf-8")
    print("  %-34s %5.1f KB" % (name, len(svg) / 1024))


# ── 1. 頻率與音高：慢振動 vs 快振動 ────────────────────────────
def fig_frequency():
    W, H = 760, 300
    body = []
    for i, (y, periods, name, hz, label) in enumerate([
        (120, 2.2, "慢振動", "110 Hz", "聽起來低、厚"),
        (215, 8.0, "快振動", "880 Hz", "聽起來高、亮"),
    ]):
        amp = 34
        pts = []
        for k in range(121):
            x = 210 + k * 4.0
            v = math.sin(2 * math.pi * periods * k / 120)
            pts.append(f"{x:.1f},{y + amp * v:.1f}")
        body.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{ACCENT}" stroke-width="2"/>')
        body.append(text(28, y - 14, name, 15, weight="700"))
        body.append(text(28, y + 8, hz, 13, color=ACCENT))
        body.append(text(28, y + 28, label, 12, color=MUTED))
        body.append(line(210, y, 700, y, LINE, 1))
    body.append(line(210, 80, 210, 255, MUTED, 1.2, "4 5"))
    body.append(text(210, 72, "時間 →", 11.5, "middle", MUTED))
    body.append(text(455, 272, "同樣的時間裡，振動次數越多 → 音越高", 13, "middle", INK))
    write("frequency-wave.svg", frame(W, H, "頻率決定音高", "同一個時間長度內，波形來回幾次就是幾赫茲（Hz）", body))


# ── 2. 鋼琴音域 ──────────────────────────────────────────────
def fig_piano_range():
    W, H = 760, 260
    body = []
    x0, x1 = 90, 700
    top = 118

    def hz_to_x(f):
        lo, hi = math.log2(27.5), math.log2(4186.0)
        return x0 + (math.log2(f) - lo) / (hi - lo) * (x1 - x0)

    body.append(rect(x0, top - 26, x1 - x0, 52, SOFT, LINE, 4))
    for f, name in [(27.5, "A0"), (65.4, "C2"), (261.6, "C4"), (1046.5, "C6"), (4186.0, "C8")]:
        x = hz_to_x(f)
        body.append(line(x, top - 26, x, top + 26, MUTED, 1))
        body.append(circle(x, top + 34, 3.2, ACCENT))
        body.append(text(x, top + 52, name, 11.5, "middle", INK))
        body.append(text(x, top + 68, ("%.0f Hz" % f), 10.5, "middle", MUTED))
    body.append(text(28, top - 6, "低", 14, weight="700"))
    body.append(text(28, top + 12, "27.5 Hz", 12, color=ACCENT))
    body.append(text(732, top - 6, "高", 14, "end", weight="700"))
    body.append(text(732, top + 12, "4186 Hz", 12, "end", color=ACCENT))
    body.append(text(395, 88, "鋼琴 88 鍵的音域：A0 到 C8，約 7 個八度", 13, "middle", INK))
    body.append(text(395, 232, "橫軸是對數刻度——每個八度（頻率加倍）佔一樣寬", 11.5, "middle", MUTED))
    write("piano-range.svg", frame(W, H, "鋼琴的音域", "同一個八度裡頻率加倍，所以聽起來「像同一個音」", body))


# ── 3. 音名對照表 ────────────────────────────────────────────
def fig_note_names():
    W, H = 760, 300
    body = []
    cols = [("唱名", ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"]),
            ("音名", ["C", "D", "E", "F", "G", "A", "B"]),
            ("簡譜", ["1", "2", "3", "4", "5", "6", "7"]),
            ("C 大調音級", ["I", "II", "III", "IV", "V", "VI", "VII"])]
    x0, cw = 40, 100
    y0 = 104
    for ci, (head, vals) in enumerate(cols):
        x = x0 + ci * cw
        body.append(text(x + 46, y0 - 12, head, 12.5, "middle", MUTED, "700"))
        for ri, v in enumerate(vals):
            y = y0 + ri * 34
            body.append(rect(x + 6, y - 20, 80, 28, "#fff", LINE, 4))
            body.append(text(x + 46, y, v, 13.5, "middle", INK, "700" if ci < 2 else "400"))
    body.append(line(40, y0 + 7 * 34 - 6, 460, y0 + 7 * 34 - 6, LINE, 1))
    body.append(text(500, 118, "同一個音，四種寫法。", 13, INK, "700"))
    body.append(text(500, 140, "台灣的教材多半用「音名＋唱名」", 11.5, MUTED))
    body.append(text(500, 158, "並用，簡譜則常見於流行歌譜。", 11.5, MUTED))
    body.append(text(500, 186, "唱名是「相對」的：換一個調，", 11.5, MUTED))
    body.append(text(500, 204, "同一個唱名會對到不同的音名。", 11.5, MUTED))
    write("note-names.svg", frame(W, H, "音名的四種寫法", "C 大調的情況", body))


# ── 4. 拍子的強弱 ────────────────────────────────────────────
def fig_beat():
    W, H = 760, 280
    body = []

    def row(y, counts, title, sub):
        body.append(text(28, y - 26, title, 14.5, weight="700"))
        body.append(text(28, y - 6, sub, 11.5, color=MUTED))
        for i, (strong, label) in enumerate(counts):
            cx = 300 + i * 78
            if strong == 2:
                body.append(circle(cx, y, 22, ACCENT, ACCENT, 2))
                body.append(text(cx, y + 6, label, 14, "middle", "#fff", "700"))
            elif strong == 1:
                body.append(circle(cx, y, 15, SOFT, ACCENT, 2))
                body.append(text(cx, y + 5, label, 12.5, "middle", ACCENT, "700"))
            else:
                body.append(circle(cx, y, 11, SOFT, MUTED, 1.6))
                body.append(text(cx, y + 4.5, label, 11.5, "middle", MUTED))

    row(120, [(2, "1"), (0, "2"), (1, "3"), (0, "4")], "四拍子（4/4）", "強 · 弱 · 中強 · 弱")
    row(225, [(2, "1"), (0, "2"), (0, "3")], "三拍子（3/4）", "強 · 弱 · 弱")
    body.append(text(300, 262, "圓圈越大＝重音越強；第一拍永遠是強拍", 11.5, MUTED))
    write("beat-accent.svg", frame(W, H, "拍子不是等速的滴答，是強弱的重複", "同樣的時間間隔，重音位置不同，律動就不同", body))


# ── 5. 譜號：三種譜號在同一組五線上的位置 ──────────────────────
def fig_clefs():
    W, H = 760, 340
    body = []
    systems = [
        ("高音譜號（G 譜號）", "圈圈繞著第二線 → 第二線就是 G", "G"),
        ("中音譜號（C 譜號）", "缺口對準第三線 → 第三線就是中央 C", "C"),
        ("低音譜號（F 譜號）", "兩點夾住第四線 → 第四線就是 F", "F"),
    ]
    for i, (title, sub, letter) in enumerate(systems):
        y0 = 100 + i * 78
        body.append(text(28, y0 + 4, title, 13.5, weight="700"))
        body.append(text(28, y0 + 22, sub, 11, color=MUTED))
        x0, x1 = 300, 700
        for k in range(5):
            body.append(line(x0, y0 - 24 + k * 12, x1, y0 - 24 + k * 12, INK, 1.1))
        ty = {"G": y0 - 12, "C": y0 - 12, "F": y0}[letter]
        # 用畫的標記，不依賴樂譜字型（站上沒有音樂符號字）
        body.append(circle(x0 + 34, ty, 13, "none", ACCENT, 2))
        body.append(text(x0 + 34, ty + 5, letter, 13, "middle", ACCENT, "700"))
        body.append(circle(x1 - 190, ty, 7, ACCENT))
        body.append(text(x1 - 190 + 13, ty + 4, "這一條線 = " + letter, 11.5, ACCENT, "700"))
    write("clefs.svg", frame(W, H, "三種譜號：記號本身就是線索",
                             "圈起來的那條線，就是譜號名字說的那個音", body,
                             "實際樂譜中，三種譜號不會同時出現在同一組五線上。"))


# ── 6. 大譜表與中央 C ────────────────────────────────────────
def fig_grand_staff():
    W, H = 760, 300
    body = []
    x0, x1 = 300, 660
    for k in range(5):
        body.append(line(x0, 90 + k * 12, x1, 90 + k * 12, INK, 1.1))
    for k in range(5):
        body.append(line(x0, 190 + k * 12, x1, 190 + k * 12, INK, 1.1))
    body.append(circle(x0 + 34, 114, 13, "none", ACCENT, 2))
    body.append(text(x0 + 34, 119, "G", 13, "middle", ACCENT, "700"))
    body.append(circle(x0 + 34, 214, 13, "none", ACCENT, 2))
    body.append(text(x0 + 34, 219, "F", 13, "middle", ACCENT, "700"))
    cy = 152
    body.append(line(x0, cy, x1, cy, ACCENT, 1.2, "4 4"))
    body.append(circle(x0 + 210, cy, 5.5, ACCENT))
    body.append(text(x0 + 226, cy + 4, "中央 C（C4，約 261.6 Hz）", 12, ACCENT, "700"))
    body.append(text(28, 96, "高音譜號", 13, weight="700"))
    body.append(text(28, 114, "右手常用", 11, color=MUTED))
    body.append(text(28, 196, "低音譜號", 13, weight="700"))
    body.append(text(28, 214, "左手常用", 11, color=MUTED))
    body.append(text(x0 + 210, 262, "兩個譜表只隔一條加線——那條線上的音就是中央 C", 11.5, "middle", MUTED))
    write("grand-staff.svg", frame(W, H, "大譜表：把兩個譜號縫在一起",
                                  "鋼琴譜用大譜表，中央 C 落在兩個譜表之間", body))


# ── 7. 音符時值 ──────────────────────────────────────────────
def fig_note_values():
    W, H = 760, 300
    body = []
    body.append(text(40, 96, "一個全音符 = 4 拍（4/4 拍下）", 12.5, INK, "700"))
    bars = [("全音符", 4, "4 拍"), ("二分音符", 2, "2 拍"), ("四分音符", 1, "1 拍"),
            ("八分音符", 0.5, "半拍"), ("十六分音符", 0.25, "1/4 拍")]
    y = 130
    for name, beats, label in bars:
        w = 400 * (beats / 4.0)
        body.append(rect(200, y - 12, w, 20, ACCENT, ACCENT, 3))
        body.append(text(190, y + 3, name, 12, "end", INK, "700"))
        body.append(text(200 + w + 10, y + 3, label, 11.5, MUTED))
        y += 32
    body.append(text(40, 196, "拍號決定「一拍」是什麼音符：", 12, INK, "700"))
    body.append(text(40, 216, "4/4 → 四分音符為一拍", 11.5, MUTED))
    body.append(text(40, 234, "6/8 → 八分音符為一拍", 11.5, MUTED))
    body.append(text(40, 252, "2/2 → 二分音符為一拍", 11.5, MUTED))
    write("note-values.svg", frame(W, H, "音符的時值：倍數關係",
                                   "每一種音符都是上一種的一半長", body))


# ── 8. 單拍子與複拍子 ────────────────────────────────────────
def fig_meter():
    W, H = 760, 300
    body = []

    def grp(x, y, groups, label, sub):
        body.append(text(x, y - 46, label, 13.5, weight="700"))
        body.append(text(x, y - 26, sub, 11, color=MUTED))
        cx = x
        for g in groups:
            for i in range(g):
                body.append(circle(cx + 16, y, 9, SOFT, ACCENT, 1.8))
                cx += 30
            cx += 14
            body.append(line(cx - 12, y - 16, cx - 12, y + 16, LINE, 1.2))

    grp(60, 130, [2, 2], "4/4 單拍子", "每拍可以再對半分")
    grp(430, 130, [3, 3], "6/8 複拍子", "每組三拍，聽起來是兩大拍")
    body.append(text(60, 200, "單拍子：一拍＝一個自然單位（2 或 3 等分都自然）", 12, INK))
    body.append(text(60, 222, "複拍子：一拍＝三個小單位組成的「大拍」", 12, INK))
    body.append(text(60, 252, "所以 6/8 不是「六拍的 4/4」，而是「兩大拍、每拍三下」。", 12, ACCENT, "700"))
    write("meter-simple-compound.svg", frame(W, H, "單拍子 vs 複拍子",
                                            "同樣的總長度，分組方式不同，律動就不同", body))


# ── 9. 樂器音域對照 ──────────────────────────────────────────
def fig_instrument_ranges():
    W, H = 760, 380
    body = []
    lo_f, hi_f = 27.5, 4186.0
    x0, x1 = 230, 700

    def x_of(f):
        return x0 + (math.log2(f) - math.log2(lo_f)) / (math.log2(hi_f) - math.log2(lo_f)) * (x1 - x0)

    rows = [
        ("長笛 Flute", 261.6, 2093.0, "C4–C7"),
        ("小提琴 Violin", 196.0, 3136.0, "G3–G7"),
        ("單簧管 Clarinet", 146.8, 1568.0, "D3–G6"),
        ("小號 Trumpet", 164.8, 1174.7, "E3–D6"),
        ("大提琴 Cello", 65.4, 1046.5, "C2–C6"),
        ("吉他 Guitar", 82.4, 1318.5, "E2–E6"),
        ("低音管 Bassoon", 58.3, 587.3, "Bb1–D5"),
        ("低音提琴 Bass", 41.2, 392.0, "E1–G4"),
    ]
    y = 108
    for name, lo, hi, label in rows:
        body.append(text(28, y + 4, name, 12))
        body.append(rect(x_of(lo), y - 7, max(3, x_of(hi) - x_of(lo)), 14, ACCENT, "none", 3))
        body.append(text(x_of(hi) + 8, y + 4, label, 10.5, MUTED))
        y += 30
    for f, lab in [(32.7, "C1"), (65.4, "C2"), (130.8, "C3"), (261.6, "C4"), (523.3, "C5"), (1046.5, "C6"), (2093.0, "C7")]:
        body.append(line(x_of(f), 96, x_of(f), y - 12, LINE, 1))
        body.append(text(x_of(f), y + 12, lab, 10.5, "middle", MUTED))
    body.append(text(x1 + 4, 96, "", 11))
    write("instrument-ranges.svg", frame(W, H, "常見樂器的實際音域",
                                         "橫軸是對數刻度；同一個八度佔一樣寬", body,
                                         "各樂器實際可演奏範圍因型號與演奏者而異，此為常見範圍。"))


def main() -> None:
    print("產生樂理示意圖：")
    fig_frequency()
    fig_piano_range()
    fig_note_names()
    fig_beat()
    fig_clefs()
    fig_grand_staff()
    fig_note_values()
    fig_meter()
    fig_instrument_ranges()
    print("\n輸出目錄：%s" % OUT.relative_to(BASE_DIR))


if __name__ == "__main__":
    main()
