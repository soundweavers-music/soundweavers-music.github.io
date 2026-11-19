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
    # 早期有些呼叫把顏色當成第 5 個參數傳進來（text(x, y, s, 12, MUTED)），
    # 結果 anchor 收到色碼、weight 收到顏色，輸出成 text-anchor="#8a8078"。
    # 這裡自動把它們撥回正確的位置，舊圖不必一張張改。
    if isinstance(anchor, str) and anchor.startswith("#"):
        weight, color, anchor = color, anchor, "start"
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


def ellipse(cx, cy, rx, ry, fill=INK, stroke="none", sw=1.4, rotate=-20):
    return (f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}" transform="rotate({rotate} {cx:.1f} {cy:.1f})"/>')


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
    W, H = 760, 386
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
    body.append(text(40, 292, "拍號決定「一拍」是什麼音符：", 12, INK, "700"))
    body.append(text(40, 314, "4/4 → 四分音符為一拍", 11.5, MUTED))
    body.append(text(40, 334, "6/8 → 八分音符為一拍", 11.5, MUTED))
    body.append(text(40, 354, "2/2 → 二分音符為一拍", 11.5, MUTED))
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
    W, H = 760, 430
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


# ── 10. 速度術語與 BPM ──────────────────────────────────────
def fig_tempo():
    W, H = 760, 380
    body = []
    x0, x1 = 210, 620
    lo, hi = 30.0, 210.0

    def xb(b):
        return x0 + (b - lo) / (hi - lo) * (x1 - x0)

    terms = [
        ("Largo 極緩板", 40, 60, "寬廣、莊嚴、沉重"),
        ("Adagio 慢板", 66, 76, "自在、抒情、寧靜"),
        ("Andante 行板", 76, 108, "散步的步調"),
        ("Moderato 中板", 108, 120, "節制、平穩地推進"),
        ("Allegro 快板", 120, 168, "活潑、有能量"),
        ("Presto 急板", 168, 200, "狂熱、急迫"),
    ]
    for i, (name, a, b, feel) in enumerate(terms):
        y = 108 + i * 33
        body.append(text(28, y - 2, name, 12, weight="700"))
        body.append(text(28, y + 13, feel, 10, color=MUTED))
        body.append(rect(xb(a), y - 10, xb(b) - xb(a), 16, ACCENT, "none", 4))
        body.append(text(xb(b) + 8, y + 5, "%d–%d" % (a, b), 10.5, color=MUTED))
    body.append(line(x0, 318, x1, 318, MUTED, 1.2))
    for v in range(30, 211, 30):
        body.append(line(xb(v), 312, xb(v), 324, MUTED, 1))
        body.append(text(xb(v), 344, str(v), 10, "middle", MUTED))
    body.append(text(x1 + 14, 344, "BPM", 10, color=MUTED))
    write("tempo-ranges.svg", frame(W, H, "速度術語與它們的 BPM 區間",
                                   "長條是該術語常見的範圍；相鄰術語之間本來就有模糊地帶", body,
                                   "各版本教材給的數值略有出入。術語真正要傳達的是情緒，不是節拍器上的數字。"))


# ── 11. 高音譜號上的線與間 ──────────────────────────────────
def _staff(x0, x1):
    return [line(x0, 156 - k * 14, x1, 156 - k * 14, INK, 1.1) for k in range(5)]


def fig_treble_notes():
    W, H = 760, 340
    body = list(_staff(110, 720))
    body.append(circle(140, 142, 15, "none", ACCENT, 2))
    body.append(text(140, 147, "G", 14, "middle", ACCENT, "700"))
    body.append(text(140, 178, "螺旋圈住第二線", 9.5, "middle", MUTED))

    notes = [("C4", 170), ("D4", 163), ("E4", 156), ("F4", 149),
             ("G4", 142), ("A4", 135), ("B4", 128), ("C5", 121)]
    for i, (nm, y) in enumerate(notes):
        cx = 240 + i * 56
        if nm == "C4":
            body.append(line(cx - 18, 170, cx + 18, 170, INK, 1.1))
        body.append(ellipse(cx, y, 8.5, 6.2, ACCENT if nm == "G4" else INK))
        body.append(text(cx + 11, y - 7, nm, 9.5, color=ACCENT if nm == "G4" else MUTED))

    body.append(text(28, 218, "看線（下→上）：E4・G4・B4・D5・F5", 12))
    body.append(text(28, 242, "看間（下→上）：F4・A4・C5・E5", 12))
    body.append(text(28, 268, "口訣：Every Good Boy Deserves Fudge　／　FACE", 11.5, color=MUTED))
    body.append(text(28, 296, "中央 C（C4）在下加一線；再往下就只是多畫一條短線，階梯照樣推算。", 11.5, color=MUTED))
    write("treble-clef-notes.svg", frame(W, H, "高音譜號：五條線與四個間",
                                        "第二線（G4）被螺旋圈住，其餘的音就照著階梯數", body))


# ── 12. 低音譜號上的線與間 ──────────────────────────────────
def fig_bass_notes():
    W, H = 760, 340
    body = list(_staff(110, 720))
    body.append(circle(140, 114, 15, "none", ACCENT, 2))
    body.append(text(140, 119, "F", 14, "middle", ACCENT, "700"))
    body.append(text(140, 82, "兩點夾住第四線", 9.5, "middle", MUTED))

    notes = [("C3", 135), ("D3", 128), ("E3", 121), ("F3", 114),
             ("G3", 107), ("A3", 100), ("B3", 93), ("C4", 86)]
    for i, (nm, y) in enumerate(notes):
        cx = 240 + i * 56
        if nm == "C4":
            body.append(line(cx - 18, 86, cx + 18, 86, INK, 1.1))
        body.append(ellipse(cx, y, 8.5, 6.2, ACCENT if nm == "F3" else INK))
        body.append(text(cx + 11, y - 7, nm, 9.5, color=ACCENT if nm == "F3" else MUTED))

    body.append(text(28, 218, "看線（下→上）：G2・B2・D3・F3・A3", 12))
    body.append(text(28, 242, "看間（下→上）：A2・C3・E3・G3", 12))
    body.append(text(28, 268, "口訣：Good Boys Do Fine Always　／　All Cows Eat Grass", 11.5, color=MUTED))
    body.append(text(28, 296, "同樣一條線，換了譜號就換了音名——中央 C 在低音譜號是上加一線。", 11.5, color=MUTED))
    write("bass-clef-notes.svg", frame(W, H, "低音譜號：五條線與四個間",
                                       "第四線（F3）被兩個點夾住，往上下都照階梯推算", body))


# ── 13. 科學音高與鍵盤 ─────────────────────────────────────
def fig_scientific_pitch():
    W, H = 760, 330
    body = []
    x0, kw, top, wh = 50, 41, 96, 84
    whites = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5",
              "D5", "E5", "F5", "G5", "A5", "B5"]
    for i, nm in enumerate(whites):
        body.append(rect(x0 + i * kw, top, kw - 1, wh, "#fff", LINE, 2))
    for i in [0, 1, 3, 4, 5, 7, 8, 10, 11]:
        body.append(rect(x0 + (i + 1) * kw - 13, top, 26, wh * 0.62, INK, "none", 2))
    for i, nm in enumerate(whites):
        if nm.startswith("C") or nm in ("A4", "B5"):
            body.append(text(x0 + i * kw + kw / 2, top + wh + 18, nm, 9.5, "middle", MUTED))
    body.append(line(x0 + kw, top - 6, x0 + kw, top, ACCENT, 1))
    body.append(text(x0 + kw, top - 14, "C♯／D♭ 同一個鍵", 10, "middle", ACCENT))
    body.append(text(x0 + 5 * kw + kw / 2, top - 14, "A4＝440 Hz", 10, "middle", ACCENT))
    body.append(text(x0 + kw / 2, top + wh + 34, "中央 C", 9.5, "middle", ACCENT))

    body.append(text(28, 240, "科學音高＝音名＋八度數字。C4 是中央 C，所以中央 C 上方的 A 就叫 A4。", 12))
    body.append(text(28, 264, "同一個黑鍵有兩個名字：從 C 往上升叫 C♯，從 D 往下降叫 D♭——", 11.5, color=MUTED))
    body.append(text(28, 286, "聲音完全一樣，寫哪一個取決於它所在的調性。", 11.5, color=MUTED))
    body.append(text(28, 312, "頻率：C4 261.63 Hz　A4 440 Hz　C5 523.25 Hz（每升八度就乘以 2）", 11.5, color=MUTED))
    write("scientific-pitch.svg", frame(W, H, "科學音高：音名加上八度數字",
                                       "同一顆鍵在不同調性裡會有不同的寫法", body))


# ── 14. 不對稱拍號的分組 ───────────────────────────────────
def fig_odd_meters():
    W, H = 760, 350
    body = []
    rows = [
        ("5/4　3 + 2", [3, 2], "長—長—長、短—短"),
        ("5/4　2 + 3", [2, 3], "短—短、長—長—長"),
        ("7/8　3 + 2 + 2", [3, 2, 2], "巴爾幹舞步：一步長、兩步短"),
        ("7/8　2 + 2 + 3", [2, 2, 3], "同樣七個音，換一個重音位置"),
    ]
    for i, (label, groups, feel) in enumerate(rows):
        y = 112 + i * 54
        body.append(text(28, y - 8, label, 12, weight="700"))
        body.append(text(28, y + 12, feel, 10, color=MUTED))
        cx = 300
        for g in groups:
            start = cx
            for k in range(g):
                strong = k == 0
                body.append(circle(cx, y, 11 if strong else 8,
                                   ACCENT if strong else SOFT,
                                   ACCENT if strong else MUTED, 1.8))
                cx += 30
            body.append(line(start - 13, y + 20, cx - 17, y + 20, ACCENT, 1.1))
            body.append(text((start + cx - 30) / 2, y + 36, str(g), 9.5, "middle", MUTED))
            cx += 20
    body.append(text(28, 336, "大圓＝重音；重音落在每一組的第一拍，七個音就會有兩種完全不同的跛腳感。", 11.5, color=MUTED))
    write("odd-meters.svg", frame(W, H, "不對稱拍號：分組決定律動",
                                  "5/4 與 7/8 都是把同樣的音符切成不等長的小組", body))


# ── 15. S-H 五大分類 ──────────────────────────────────────
def fig_sh_taxonomy():
    W, H = 760, 382
    body = []
    body.append(rect(28, 164, 156, 64, ACCENT, "none", 8))
    body.append(text(106, 190, "什麼東西", 13, "middle", "#fff", "700"))
    body.append(text(106, 212, "在振動？", 13, "middle", "#fff", "700"))
    rows = [
        ("弦鳴", "弦", "小提琴・吉他・鋼琴"),
        ("氣鳴", "空氣柱", "長笛・小號・迪吉里杜管"),
        ("膜鳴", "繃緊的皮膜", "定音鼓・小鼓・鈴鼓"),
        ("體鳴", "樂器本體", "木琴・鑼・鈸"),
        ("電鳴", "電路或電子拾音", "合成器・電鋼琴・電吉他"),
    ]
    for i, (name, src, eg) in enumerate(rows):
        y = 92 + i * 52
        body.append(line(184, 196, 240, y, LINE, 1.1))
        body.append(rect(240, y - 24, 250, 48, SOFT, LINE, 6))
        body.append(text(254, y - 4, name, 12.5, weight="700"))
        body.append(text(254, y + 15, "振動源：" + src, 10.5, color=MUTED))
        body.append(text(506, y + 4, eg, 10.5))
    body.append(text(28, 350, "外觀、材質、怎麼演奏都是表象；只有「什麼在振動」是單一標準。", 11.5, color=MUTED))
    write("sh-taxonomy.svg", frame(W, H, "薩克斯—霍恩博斯特爾分類",
                                   "一個問題問到底：聲音的源頭是什麼在震動？", body,
                                   "電鳴是後來補上的第五類，不在 1914 年的原始架構裡。"))


# ── 16. 六大聲部音域 ──────────────────────────────────────
def fig_voice_ranges():
    W, H = 760, 340
    body = []
    lo, hi = 65.0, 1100.0
    x0, x1 = 230, 690

    def x_of(f):
        return x0 + (math.log2(f) - math.log2(lo)) / (math.log2(hi) - math.log2(lo)) * (x1 - x0)

    voices = [
        ("女高音 Soprano", 261.6, 1046.5, "C4–C6"),
        ("女中音 Mezzo", 220.0, 880.0, "A3–A5"),
        ("女低音 Contralto", 174.6, 698.5, "F3–F5"),
        ("男高音 Tenor", 130.8, 523.3, "C3–C5"),
        ("男中音 Baritone", 110.0, 440.0, "A2–A4"),
        ("男低音 Bass", 82.4, 329.6, "E2–E4"),
    ]
    y = 110
    for name, low, high, label in voices:
        body.append(text(28, y + 4, name, 11.5))
        body.append(rect(x_of(low), y - 8, max(4, x_of(high) - x_of(low)), 16, ACCENT, "none", 4))
        body.append(text(x_of(high) + 8, y + 4, label, 10, color=MUTED))
        y += 32
    body.append(line(x_of(261.6), 92, x_of(261.6), y - 10, ACCENT, 1.1, "4 4"))
    body.append(text(x_of(261.6), 86, "中央 C", 9.5, "middle", ACCENT))
    for f, lab in [(65.4, "C2"), (130.8, "C3"), (261.6, "C4"), (523.3, "C5"), (1046.5, "C6")]:
        body.append(line(x_of(f), y - 10, x_of(f), y - 4, MUTED, 1))
        body.append(text(x_of(f), y + 10, lab, 9.5, "middle", MUTED))
    write("voice-ranges.svg", frame(W, H, "六大聲部的常見音域",
                                   "橫軸是對數刻度，同一個八度佔一樣寬", body,
                                   "這是常見範圍，不是絕對界線；每個人的聲帶條件差很多。"))


# ── 17. 自然泛音列 ────────────────────────────────────────
def fig_harmonic_series():
    W, H = 760, 400
    body = []
    body.append(text(28, 92, "一根弦除了整條振動，也會同時分成 2 段、3 段振動。", 12))
    for i, n in enumerate((1, 2, 3)):
        y = 122 + i * 28
        body.append(text(28, y + 4, "整條" if n == 1 else "%d 段" % n, 11, color=MUTED))
        body.append(line(210, y, 690, y, INK, 1.2))
        for k in range(1, n):
            nx = 210 + (690 - 210) * k / n
            body.append(circle(nx, y, 3.4, SOFT, ACCENT, 1.4))
    body.append(text(400, 196, "小圓圈＝節點，不振動的位置", 9.5, color=MUTED))

    body.append(text(210, 210, "泛音", 10.5, color=MUTED))
    body.append(text(286, 210, "頻率（基音 100 Hz）", 10.5, color=MUTED))
    body.append(text(452, 210, "相鄰比", 10.5, color=MUTED))
    body.append(text(540, 210, "音程", 10.5, color=MUTED))
    rows = [
        (1, 100, "—", "基音"),
        (2, 200, "2:1", "完全八度"),
        (3, 300, "3:2", "完全五度"),
        (4, 400, "4:3", "完全四度"),
        (5, 500, "5:4", "大三度"),
        (6, 600, "6:5", "小三度"),
    ]
    for i, (n, f, ratio, iv) in enumerate(rows):
        y = 236 + i * 23
        body.append(text(210, y, "%d" % n, 11.5, weight="700"))
        body.append(text(286, y, "%d Hz" % f, 11.5))
        body.append(text(452, y, ratio, 11.5, color=ACCENT if n > 1 else MUTED))
        body.append(text(540, y, iv, 11.5))
    body.append(text(28, 376, "比例越簡單，兩個音越容易重合，聽起來越協和；十二平均律把 3:2 的純五度壓成 700 音分，換來自由轉調。", 11, color=MUTED))
    write("harmonic-series.svg", frame(W, H, "自然泛音列：和諧的物理來源",
                                     "第 n 個泛音的頻率就是基音的 n 倍", body))


# ── 18. 單拍子的三種性格 ──────────────────────────────────
def fig_simple_meters():
    W, H = 760, 340
    body = []
    rows = [
        ("2/4", [2, 2], "進行曲、行軍、嘉年華", [(2, "1"), (0, "2")]),
        ("3/4", [3, 3], "華爾滋、小步舞曲", [(2, "1"), (0, "2"), (0, "3")]),
        ("4/4", [4, 4], "流行、搖滾、多數現代音樂", [(2, "1"), (0, "2"), (1, "3"), (0, "4")]),
    ]
    for i, (sig, groups, use, pattern) in enumerate(rows):
        y = 112 + i * 68
        body.append(text(28, y - 2, sig, 15, weight="700"))
        body.append(text(28, y + 16, use, 10, color=MUTED))
        cx = 340
        for strong, label in pattern * 2:
            if strong == 2:
                body.append(circle(cx, y, 15, ACCENT, ACCENT, 2))
                body.append(text(cx, y + 5, label, 11, "middle", "#fff", "700"))
            elif strong == 1:
                body.append(circle(cx, y, 11, SOFT, ACCENT, 2))
                body.append(text(cx, y + 4, label, 10, "middle", ACCENT, "700"))
            else:
                body.append(circle(cx, y, 8, SOFT, MUTED, 1.6))
                body.append(text(cx, y + 3.5, label, 9.5, "middle", MUTED))
            cx += 40
    body.append(text(28, 318, "兩小節為一組；圓圈越大＝重音越強，每小節的第一拍永遠是強拍。", 11.5, color=MUTED))
    write("simple-meters.svg", frame(W, H, "單拍子的三種性格",
                                   "同樣的四分音符，分成 2 堆、3 堆、4 堆，走路的方式就不同", body))


# ── 19. 弦與管的音高控制 ──────────────────────────────────
def fig_string_air():
    W, H = 760, 380
    body = []
    body.append(text(28, 96, "弦：按弦把有效弦長縮短，音就變高", 12.5, weight="700"))
    for i, (frac, label) in enumerate([(1.0, "全弦＝C"), (0.5, "一半＝高八度"), (0.25, "四分之一＝再高八度")]):
        y = 132 + i * 34
        w = 420 * frac
        body.append(line(120, y, 120 + w, y, INK, 2.4))
        body.append(circle(120, y, 4.2, ACCENT))
        body.append(text(120 + w + 10, y + 4, label, 10.5, color=MUTED))

    body.append(text(28, 254, "氣柱：開孔改變有效管長，音就變高", 12.5, weight="700"))
    for i, (frac, label) in enumerate([(1.0, "全管＝C"), (0.5, "一半＝高八度")]):
        y = 286 + i * 36
        w = 420 * frac
        body.append(rect(120, y - 9, w, 18, SOFT, INK, 3))
        body.append(text(120 + w + 10, y + 4, label, 10.5, color=MUTED))
    write("string-air-pitch.svg", frame(W, H, "弦與管怎麼控制音高",
                                       "兩者共用同一個物理法則：振動的長度減半，頻率就加倍", body,
                                       "弦的張力與粗細、管子的開口與形狀也會影響音高；長度是最直接的那個旋鈕。"))


# ── 20. 三類發聲體的包絡 ──────────────────────────────────
def fig_timbre_families():
    W, H = 760, 350
    body = []
    body.append(text(28, 96, "同一個敲擊動作，振動體不同，能量留下來的形狀就不同。", 12))

    def curve(x0, x1, base, height, fn):
        pts = []
        for i in range(121):
            t = i / 120
            pts.append(f"{x0 + (x1 - x0) * t:.1f} {base - fn(t) * height:.1f}")
        return path("M" + " L".join(pts), stroke=ACCENT, sw=2)

    panels = [
        (70, "膜鳴 Membranophone", "鼓皮：起音快、尾巴短", "定音鼓・小鼓・鈴鼓",
         lambda t: (1 - math.exp(-t * 70)) * math.exp(-t * 5)),
        (300, "體鳴 Idiophone", "木頭與金屬：泛音複雜、殘響長", "木琴・鑼・鈸",
         lambda t: (1 - math.exp(-t * 70)) * math.exp(-t * 2.2) * (1 + 0.22 * math.sin(2 * math.pi * 9 * t))),
        (530, "電鳴 Electrophone", "電路：要延多長就延多長", "合成器・電鋼琴",
         lambda t: min(1.0, t / 0.08) * (1.0 if t < 0.72 else max(0.0, (1 - t) / 0.28))),
    ]
    for x, title, sub, eg, fn in panels:
        body.append(text(x, 130, title, 11.5, weight="700"))
        body.append(text(x, 148, sub, 10, color=MUTED))
        body.append(line(x, 250, x + 160, 250, LINE, 1.1))
        body.append(curve(x, x + 160, 250, 84, fn))
        body.append(text(x, 272, eg, 10, color=MUTED))
    body.append(text(28, 320, "橫軸是時間、縱軸是音量；實際音色還要看泛音列怎麼排。", 11.5, color=MUTED))
    write("timbre-families.svg", frame(W, H, "三類發聲體的包絡",
                                      "敲擊類起音快、衰減快；持續類可以維持不墜", body))


# ═══════════════════════════════════════════════════════════════
# 第二批：每一節再補一張，把抽象的說法畫成看得見的東西
# ═══════════════════════════════════════════════════════════════

def arrow(x1, y1, x2, y2, color=ACCENT, sw=1.5, head=7.5):
    ang = math.atan2(y2 - y1, x2 - x1)
    a1 = (x2 - head * math.cos(ang - 0.42), y2 - head * math.sin(ang - 0.42))
    a2 = (x2 - head * math.cos(ang + 0.42), y2 - head * math.sin(ang + 0.42))
    return (line(x1, y1, x2, y2, color, sw)
            + path("M%.1f %.1f L%.1f %.1f L%.1f %.1f" % (a1[0], a1[1], x2, y2, a2[0], a2[1]),
                   stroke=color, sw=sw))


# ── 21. 聲音是空氣的疏密波（1.1） ───────────────────────────
def fig_sound_wave_air():
    W, H = 760, 330
    body = []
    body.append(text(28, 96, "點＝空氣分子。擠在一起是「密」，拉開是「鬆」；波往外走，分子幾乎原地不動。", 12))
    body.append(rect(50, 136, 12, 84, ACCENT, "none", 3))
    body.append(text(56, 244, "鼓面", 10.5, "middle", MUTED))
    for y in (132, 162, 192, 222):
        for k in range(44):
            x = 96 + k * 14
            dx = -9 * math.sin((x - 96) / 160.0 * 2 * math.pi)
            body.append(circle(x + dx, y, 2.5, INK))
    body.append(text(256, 112, "密", 11.5, "middle", ACCENT, "700"))
    body.append(text(336, 112, "鬆", 11.5, "middle", MUTED, "700"))
    body.append(arrow(160, 268, 700, 268))
    body.append(text(430, 290, "疏密往外傳", 11.5, "middle", MUTED))
    write("sound-wave-air.svg", frame(W, H, "聲音是空氣的疏密波",
                                     "鼓面一推一退，空氣就被壓成疏密相間、往外跑的波", body,
                                     "空氣中約 343 m/s；水中約 1,480 m/s，固體更快。"))


# ── 22. 人耳聽得到什麼（1.3） ───────────────────────────────
def fig_hearing_range():
    W, H = 760, 370
    body = []
    lo, hi = 10.0, 100000.0
    x0, x1 = 150, 700

    def xf(f):
        return x0 + (math.log10(f) - math.log10(lo)) / (math.log10(hi) - math.log10(lo)) * (x1 - x0)

    body.append(rect(xf(20), 96, xf(20000) - xf(20), 216, "#efe8df", "none", 6))
    body.append(text(xf(20) + 4, 88, "人耳（20 Hz – 20 kHz）", 10.5, color=MUTED))
    rows = [
        ("人耳", 20, 20000, "20 Hz – 20 kHz", True),
        ("鋼琴", 27.5, 4186, "A0 – C8", False),
        ("小提琴", 196, 3136, "G3 – G7", False),
        ("人聲", 82, 1100, "E2 – C6", False),
        ("狗", 40, 60000, "40 – 60 kHz", False),
    ]
    y = 136
    for name, f1, f2, lab, hot in rows:
        body.append(text(28, y + 4, name, 11.5, weight="700" if hot else "400"))
        body.append(rect(xf(f1), y - 7, max(3, xf(f2) - xf(f1)), 14,
                         ACCENT if hot else "#c2ae97", "none", 3))
        body.append(text(xf(f2) + 8, y + 4, lab, 9.5, MUTED))
        y += 40
    body.append(line(x0, 316, x1, 316, MUTED, 1.2))
    for f in (10, 100, 1000, 10000, 100000):
        body.append(line(xf(f), 310, xf(f), 322, MUTED, 1))
        lab = {10: "10", 100: "100", 1000: "1k", 10000: "10k", 100000: "100k"}[f]
        body.append(text(xf(f), 338, lab, 10, "middle", MUTED))
    body.append(text(x0 - 10, 338, "Hz", 10, "end", MUTED))
    write("hearing-range.svg", frame(W, H, "聽覺的邊界：20 Hz 到 20 kHz",
                                     "橫軸是對數刻度；超過 20 kHz 就是「超音波」", body,
                                     "年紀越大，高頻的上限越低；成年後多數人只聽到 15–17 kHz。"))


# ── 23. 等響曲線（1.4） ────────────────────────────────────
def fig_equal_loudness():
    W, H = 760, 390
    body = []
    x0, x1 = 120, 640
    y0, y1 = 116, 300

    def xf(f):
        return x0 + (math.log10(f) - math.log10(20)) / (math.log10(20000) - math.log10(20)) * (x1 - x0)

    def ydb(db):
        return y1 - max(0.0, min(db, 100.0)) / 100.0 * (y1 - y0)

    for f, lab in ((100, "100 Hz"), (1000, "1 kHz"), (10000, "10 kHz")):
        body.append(line(xf(f), y0, xf(f), y1, LINE, 1))
        body.append(text(xf(f), y1 + 16, lab, 10, "middle", MUTED))
    for db in (20, 40, 60, 80, 100):
        body.append(line(x0, ydb(db), x1, ydb(db), LINE, 1))
        body.append(text(x0 - 10, ydb(db) + 4, str(db), 10, "end", MUTED))
    body.append(text(x0 - 10, y0 - 16, "音壓 dB SPL", 10.5, "end", MUTED))

    def curve(phon, color, sw):
        pts = []
        for i in range(121):
            lf = math.log10(20) + i / 120.0 * (math.log10(20000) - math.log10(20))
            f = 10 ** lf
            boost = max(0.0, 3.2 - lf) * 20 * (1.0 - 0.42 * (phon - 40) / 40.0)
            boost -= 3.0 * math.exp(-((lf - 3.5) ** 2) / 0.03)   # 3–4 kHz 耳道共振
            pts.append("%.1f %.1f" % (x0 + i / 120.0 * (x1 - x0), ydb(phon + boost)))
        return path("M" + " L".join(pts), stroke=color, sw=sw)

    for phon, col, sw in ((80, ACCENT, 2), (60, BLUE, 1.8), (40, MUTED, 1.8)):
        body.append(curve(phon, col, sw))
        body.append(text(x1 + 10, ydb(phon) + 4, "%d 方" % phon, 10.5, color=col, weight="700"))
    body.append(text(28, 336, "同一條線上的音，聽起來一樣大聲。音量轉小之後，低頻與極高頻會先「消失」。", 11.5))
    body.append(text(28, 356, "所以小聲聽音樂時總覺得沒低音——把音量調大，低頻就回來了。", 11, MUTED))
    write("equal-loudness.svg", frame(W, H, "等響曲線：同樣大聲，不等於同樣音壓",
                                      "曲線是等響線，數字是 phon（方）；低頻要更多音壓才聽得一樣響", body,
                                      "曲線為示意，實際數據見 ISO 226 等響曲線。"))


# ── 24. 全音與半音（2.2） ──────────────────────────────────
def fig_whole_half_step():
    W, H = 760, 340
    body = []
    names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
    black = {1, 3, 6, 8, 10}
    x0, w, y = 52, 54, 140
    body.append(text(28, 106, "把一個八度攤平：12 個半音，白鍵 7 個、黑鍵 5 個。", 12))
    for i, nm in enumerate(names):
        x = x0 + i * w
        body.append(rect(x, y, w - 3, 78, INK if i in black else "#fff", LINE, 3))
        body.append(text(x + (w - 3) / 2, y + 46, nm, 12, "middle",
                         "#fff" if i in black else INK, "700"))
    body.append(arrow(x0 + 4, 250, x0 + 2 * w - 10, 250))
    body.append(text(x0 + 4, 272, "全音＝跨 2 格（2 個半音）", 11, ACCENT, "700"))
    xe = x0 + 4 * w
    body.append(arrow(xe + 4, 250, xe + w - 10, 250))
    body.append(text(xe + 22, 272, "半音＝跨 1 格", 11, ACCENT, "700"))
    write("whole-half-step.svg", frame(W, H, "全音與半音：樓梯的高度差",
                                      "半音是最小的一格；兩個半音黏起來就是一個全音", body,
                                      "E–F 與 B–C 之間沒有黑鍵，那兩格本來就只有半音。"))


# ── 25. 節拍 vs 節奏（3.2） ────────────────────────────────
def fig_beat_vs_rhythm():
    W, H = 760, 330
    body = []
    x0, slot = 160, 66
    for i in range(9):
        body.append(line(x0 + i * slot, 104, x0 + i * slot, 268, LINE, 1, "3 5"))
    body.append(text(28, 118, "節拍", 13, weight="700"))
    body.append(text(28, 136, "背景的格子", 10.5, color=MUTED))
    body.append(text(28, 206, "節奏", 13, weight="700"))
    body.append(text(28, 224, "格子上的長短", 10.5, color=MUTED))
    beats = [(2, "1"), (0, "2"), (1, "3"), (0, "4")]
    for i, (strong, lab) in enumerate(beats):
        cx = x0 + i * 2 * slot
        r = 15 if strong == 2 else (10 if strong == 1 else 8)
        body.append(circle(cx, 150, r, ACCENT if strong == 2 else SOFT,
                           ACCENT if strong else MUTED, 1.8))
        body.append(text(cx, 154, lab, 10.5 if strong else 9, "middle",
                         "#fff" if strong == 2 else (ACCENT if strong else MUTED)))
    k = 0
    for d in (2, 1, 1, 2, 1, 1):
        body.append(rect(x0 + k * slot + 6, 236, d * slot - 12, 22, ACCENT, "none", 6))
        k += d
    write("beat-vs-rhythm.svg", frame(W, H, "節拍是格子，節奏是格子裡的東西",
                                      "同一小節、同一個速度：格子不動，填進去的長短可以千變萬化", body,
                                      "沒有節拍，節奏就沒有參考點；沒有節奏，節拍只是節拍器。"))


# ── 26. 切分（3.3） ────────────────────────────────────────
def fig_syncopation():
    W, H = 760, 310
    body = []
    x0, slot = 190, 62
    rows = [
        ("正拍重音", [1, 0, 0, 0, 1, 0, 0, 0], "重音落在 1、3 拍：穩定、好數拍"),
        ("切分", [0, 0, 1, 0, 0, 0, 1, 0], "重音閃開正拍：往前推、坐不住"),
    ]
    for ri, (name, pattern, desc) in enumerate(rows):
        y = 132 + ri * 96
        body.append(text(28, y - 4, name, 12.5, weight="700"))
        body.append(text(20, y + 34, desc, 10, color=MUTED))
        for i, acc in enumerate(pattern):
            cx = x0 + i * slot
            body.append(circle(cx, y, 13 if acc else 8,
                               ACCENT if acc else SOFT, ACCENT if acc else MUTED, 1.8))
        for i in range(9):
            body.append(line(x0 + i * slot, y + 20, x0 + i * slot, y + 26, LINE, 1))
    body.append(text(x0, 268, "格＝八分音符；大圓＝重音", 10, color=MUTED))
    write("syncopation.svg", frame(W, H, "切分：把重音搬到不該在的地方",
                                   "一樣的音符、一樣的總長，重音換位置，身體的感覺就完全不同", body))


# ── 27. 速度是活的（4.3） ──────────────────────────────────
def fig_tempo_feel():
    W, H = 760, 320
    body = []
    body.append(text(28, 100, "節拍器：每一拍間隔一模一樣", 12, weight="700"))
    body.append(text(20, 118, "適合練習，不適合演奏", 10, color=MUTED))
    for i in range(13):
        body.append(line(140 + i * 44, 130, 140 + i * 44, 168, INK, 1.6))
    body.append(text(28, 214, "真人演奏：靠近高潮時撐開，過了再收緊", 12, weight="700"))
    body.append(text(20, 232, "術語叫 rubato（彈性速度）", 10, color=MUTED))
    x = 140.0
    for g in (40, 40, 40, 44, 50, 58, 64, 58, 48, 40, 34, 30, 28):
        body.append(line(x, 244, x, 282, INK, 1.6))
        if abs(g - 64) < 1:
            body.append(line(x + 32, 118, x + 32, 292, ACCENT, 1.2, "5 5"))
            body.append(text(x + 38, 108, "樂句高潮", 10.5, color=ACCENT, weight="700"))
        x += g
    write("tempo-feel.svg", frame(W, H, "速度是活的，不是節拍器上的數字",
                                  "同樣標 BPM 120，機器與人的差別在「每一拍之間怎麼分配」", body))


# ── 28. 記譜法的演化（5.1／5.2） ───────────────────────────
def fig_notation_history():
    W, H = 760, 360
    body = []
    panels = [
        (52, "紐姆譜", "9–10 世紀", ["記號浮在歌詞上方", "只記方向與輪廓", "高低靠記憶與口傳"]),
        (290, "四線譜", "11 世紀・桂多", ["把線拉出來", "音高第一次有位置", "唱詩班可以遠距教學"]),
        (528, "五線譜", "17 世紀至今", ["五條線＋譜號", "高低與節奏都寫得清", "樂器、聲部都能記"]),
    ]
    for x, name, era, lines in panels:
        body.append(text(x, 108, name, 14, weight="700"))
        body.append(text(x, 126, era, 10.5, color=MUTED))
        if name == "紐姆譜":
            for k, (dx, dy) in enumerate(((20, 0), (52, -6), (86, 2), (118, -4))):
                body.append(ellipse(x + 26 + dx, 176 + dy, 7, 4.5, ACCENT))
            body.append(text(x + 10, 214, "歌　詞　行", 10, color=MUTED))
        elif name == "四線譜":
            for k in range(4):
                body.append(line(x, 164 + k * 14, x + 170, 164 + k * 14, INK, 1.1))
            for k, nx in enumerate((40, 92, 140)):
                body.append(rect(x + nx, 170 + k % 2 * 14 - 5, 9, 9, ACCENT, "none", 1))
            body.append(text(x + 10, 232, "線＝音高的樓梯", 10, color=MUTED))
        else:
            for k in range(5):
                body.append(line(x, 158 + k * 13, x + 170, 158 + k * 13, INK, 1.1))
            body.append(circle(x + 22, 171, 12, "none", ACCENT, 2))
            body.append(text(x + 22, 176, "G", 11, "middle", ACCENT, "700"))
            for k, nx in enumerate((70, 120)):
                body.append(ellipse(x + nx, 184 - k * 13, 8, 6, ACCENT))
            body.append(text(x + 10, 232, "線＋譜號＝解碼鑰匙", 10, color=MUTED))
        for k, ln in enumerate(lines):
            body.append(text(x, 268 + k * 18, ln, 10, color=MUTED))
    body.append(arrow(60, 336, 700, 336, MUTED, 1.2))
    write("notation-history.svg", frame(W, H, "從紐姆譜到五線譜",
                                       "每一個發明都在回答同一個問題：怎麼把聲音寫下來，讓別人唱得一樣", body))


# ── 29. 高音譜號的地盤（6.3） ─────────────────────────────
def fig_treble_territory():
    W, H = 760, 330
    body = []
    x0, x1 = 52, 250
    for k in range(5):
        body.append(line(x0, 150 + k * 13, x1, 150 + k * 13, INK, 1.1))
    body.append(circle(x0 + 26, 163, 14, "none", ACCENT, 2))
    body.append(text(x0 + 26, 168, "G", 13, "middle", ACCENT, "700"))
    body.append(text(x0, 128, "高音譜號（G 譜號）", 13, weight="700"))
    body.append(text(x0, 232, "螺旋圈住第二線 → 那條線就是 G4", 10, color=MUTED))
    body.append(text(x0, 252, "常用範圍大約 C4 – C6，往上加線可以更高", 10, color=MUTED))
    chips = ["長笛", "雙簧管", "單簧管", "小提琴", "小號", "鋼琴右手"]
    for i, nm in enumerate(chips):
        cx = 330 + (i % 2) * 200
        cy = 116 + (i // 2) * 58
        body.append(rect(cx, cy, 180, 44, "#fff", LINE, 8))
        body.append(text(cx + 16, cy + 28, nm, 12))
    body.append(text(330, 300, "旋律幾乎都住在這裡：這是「主角」的譜號。", 11.5, color=ACCENT, weight="700"))
    write("treble-territory.svg", frame(W, H, "高音譜號管什麼",
                                        "大部分旋律樂器與人聲的高音，都寫在高音譜號上", body))


# ── 30. 低音譜號的地盤（7.3） ─────────────────────────────
def fig_bass_territory():
    W, H = 760, 330
    body = []
    x0, x1 = 52, 250
    for k in range(5):
        body.append(line(x0, 150 + k * 13, x1, 150 + k * 13, INK, 1.1))
    body.append(circle(x0 + 26, 176, 14, "none", ACCENT, 2))
    body.append(text(x0 + 26, 181, "F", 13, "middle", ACCENT, "700"))
    body.append(text(x0, 128, "低音譜號（F 譜號）", 13, weight="700"))
    body.append(text(x0, 232, "兩點夾住第四線 → 那條線就是 F3", 10, color=MUTED))
    body.append(text(x0, 252, "常用範圍大約 E2 – C4，往下加線可以更低", 10, color=MUTED))
    chips = ["低音管", "長號", "大提琴", "低音提琴", "低音號", "鋼琴左手"]
    for i, nm in enumerate(chips):
        cx = 330 + (i % 2) * 200
        cy = 116 + (i // 2) * 58
        body.append(rect(cx, cy, 180, 44, "#fff", LINE, 8))
        body.append(text(cx + 16, cy + 28, nm, 12))
    body.append(text(330, 300, "地基都寫在這裡：這是「根」的譜號。", 11.5, color=ACCENT, weight="700"))
    write("bass-territory.svg", frame(W, H, "低音譜號管什麼",
                                      "低音樂器與左手聲部，都寫在低音譜號上", body))


# ── 31. C 譜號會移動（8.2） ───────────────────────────────
def fig_alto_clef():
    W, H = 760, 360
    body = []
    rows = [
        (1, "女高音譜號", "第一線＝中央 C", "少見，特定教材與古樂"),
        (3, "中音譜號", "第三線＝中央 C", "中提琴的標準譜號"),
        (4, "次中音譜號", "第四線＝中央 C", "大提琴、低音管的高音域"),
    ]
    for i, (line_no, name, where, who) in enumerate(rows):
        y0 = 128 + i * 78
        body.append(text(28, y0 - 20, name, 12, weight="700"))
        body.append(text(28, y0 + 26, who, 9.5, color=MUTED))
        for k in range(5):
            body.append(line(260, y0 - 26 + k * 13, 560, y0 - 26 + k * 13, INK, 1.1))
        cy = y0 + 26 - (line_no - 1) * 13
        body.append(circle(300, cy, 13, "none", ACCENT, 2))
        body.append(text(300, cy + 5, "C", 12, "middle", ACCENT, "700"))
        body.append(circle(400, cy, 4.5, ACCENT))
        body.append(text(414, cy + 4, where, 10.5, color=ACCENT, weight="700"))
    write("alto-clef.svg", frame(W, H, "C 譜號：記號放在哪一條線，中央 C 就在那裡",
                                 "同一組五線，C 譜號往上一條線，整把尺就跟著上移", body,
                                 "這也是為什麼中提琴手換到高音譜號會卡住——尺換了。"))


# ── 32. 升降記號（9.1） ───────────────────────────────────
def fig_accidentals():
    W, H = 760, 310
    body = []
    cards = [
        ("♯", "升記號", "把音升高半音", "C → C♯", ACCENT),
        ("♭", "降記號", "把音降低半音", "D → D♭", ACCENT),
        ("♮", "還原記號", "取消前面的升降", "C♯ → C", MUTED),
    ]
    for i, (sym, name, what, eg, col) in enumerate(cards):
        x = 34 + i * 244
        body.append(rect(x, 104, 224, 168, "#fff", LINE, 10))
        body.append(text(x + 112, 176, sym, 44, "middle", col, "700"))
        body.append(text(x + 112, 206, name, 12.5, "middle", weight="700"))
        body.append(text(x + 112, 230, what, 10.5, "middle", color=MUTED))
        body.append(text(x + 112, 252, eg, 11, "middle", color=ACCENT, weight="700"))
    write("accidentals.svg", frame(W, H, "臨時記號只管一小節",
                                  "同一個音，加一個記號就換了身分；小節線之後自動失效", body))


# ── 33. 小節與拍號（10.2） ───────────────────────────────
def fig_bar_measure():
    W, H = 760, 320
    body = []
    x0, x1 = 70, 700
    for k in range(5):
        body.append(line(x0, 150 + k * 13, x1, 150 + k * 13, INK, 1.1))
    body.append(line(170, 150, 170, 202, INK, 2))
    for bx in (302, 435, 567):
        body.append(line(bx, 150, bx, 202, INK, 2))
    body.append(line(695, 150, 695, 202, INK, 2))
    body.append(line(700, 150, 700, 202, INK, 2))
    body.append(text(120, 170, "4", 13, "middle", INK, "700"))
    body.append(text(120, 194, "4", 13, "middle", INK, "700"))
    for b in range(4):
        bx = 170 + b * 132.5
        for k in range(4):
            body.append(text(bx + 17 + k * 33, 226, str(k + 1), 10, "middle", MUTED))
    body.append(text(70, 128, "拍號", 11, color=ACCENT, weight="700"))
    body.append(text(302, 128, "小節線", 11, color=ACCENT, weight="700"))
    body.append(text(648, 128, "終止線", 11, "end", color=ACCENT, weight="700"))
    body.append(text(28, 268, "上面的 4：一小節有幾拍。下面的 4：用四分音符當一拍。", 11.5))
    body.append(text(28, 290, "小節線只是把拍子分組，不是音樂「暫停」的地方。", 11, color=MUTED))
    write("bar-measure.svg", frame(W, H, "拍號與小節：把時間切成一格一格",
                                  "4/4 ＝ 每小節 4 拍，每拍是四分音符", body))


# ── 34. 附點音符（12.1） ─────────────────────────────────
def fig_dotted_note():
    W, H = 760, 320
    body = []
    rows = [
        ("四分音符", 1.0, 0.0, "1 拍"),
        ("附點四分音符", 1.5, 0.5, "1.5 拍"),
        ("二分音符", 2.0, 0.0, "2 拍"),
        ("附點二分音符", 3.0, 1.0, "3 拍"),
    ]
    x, scale = 260, 92
    y = 120
    for name, total, extra, label in rows:
        body.append(text(248, y + 5, name, 11.5, "end", weight="700"))
        body.append(rect(x, y - 11, (total - extra) * scale, 22, ACCENT, "none", 4))
        if extra:
            body.append(rect(x + (total - extra) * scale, y - 11, extra * scale, 22,
                             "#e7d9c8", ACCENT, 4))
            body.append(text(x + (total - extra) * scale + extra * scale / 2, y + 4,
                             "＋一半", 9.5, "middle", ACCENT))
        body.append(text(x + total * scale + 14, y + 5, label, 10.5, color=MUTED))
        y += 44
    body.append(text(28, 272, "附點只做一件事：把原本的音符長度再加一半。", 11.5))
    write("dotted-note.svg", frame(W, H, "附點：加上原本的一半",
                                  "淺色那一段就是點帶來的長度", body,
                                  "兩個附點＝加一半再一半，也就是原本的 1.75 倍。"))


# ── 35. 2/2 與 4/4（13.1） ───────────────────────────────
def fig_two_two():
    W, H = 760, 320
    body = []
    x0, step = 170, 130

    def note(cx, y, filled=True):
        return (ellipse(cx, y, 9, 6.5, ACCENT if filled else "none", INK, 1.4)
                + line(cx + 8.5, y, cx + 8.5, y - 34, INK, 1.4))

    body.append(text(28, 112, "4/4", 15, weight="700"))
    body.append(text(28, 130, "四拍，四分音符為一拍", 10, color=MUTED))
    for k in range(4):
        body.append(note(x0 + k * step, 160))
        body.append(text(x0 + k * step, 196, str(k + 1), 11, "middle", MUTED))
    body.append(text(28, 226, "2/2", 15, weight="700"))
    body.append(text(28, 244, "兩拍，二分音符為一拍", 10, color=MUTED))
    for k in range(4):
        body.append(note(x0 + k * step, 268))
    for a, b, lab in ((0, 1, "第 1 拍"), (2, 3, "第 2 拍")):
        lx, rx = x0 + a * step - 12, x0 + b * step + 12
        body.append(path("M%.1f 288 L%.1f 296 L%.1f 296 L%.1f 288" % (lx, lx, rx, rx),
                         stroke=ACCENT, sw=1.3))
        body.append(text((lx + rx) / 2, 312, lab, 10.5, "middle", ACCENT, "700"))
    write("two-two.svg", frame(W, H, "二二拍：一樣的音符，兩倍長的一拍",
                               "4/4 與 2/2 寫的是同一串音，但「一拍」的長度不同，重量感就不同", body))


# ── 36. 鋼琴的身分危機（14.1） ───────────────────────────
def fig_piano_identity():
    W, H = 760, 330
    body = []
    body.append(rect(40, 148, 130, 74, ACCENT, "none", 8))
    body.append(text(105, 182, "鋼琴", 15, "middle", "#fff", "700"))
    body.append(text(105, 204, "有弦・有槌・有鍵", 9.5, "middle", "#f0e6da"))
    cands = [("弦樂", "有弦，可是不是拉也不是撥"), ("打擊樂", "用槌敲，可是敲的是弦"), ("鍵盤樂", "有鍵盤，可是鍵盤只是開關")]
    for i, (name, why) in enumerate(cands):
        y = 104 + i * 70
        body.append(arrow(178, 185, 300, y + 24, MUTED, 1.2))
        body.append(rect(300, y, 400, 48, "#fff", LINE, 8))
        body.append(text(318, y + 22, name, 12.5, weight="700"))
        body.append(text(318, y + 40, why, 10, color=MUTED))
    body.append(rect(300, 290, 400, 0, "none"))
    body.append(text(28, 300, "S-H 的答案：弦鳴・敲弦。振動源是弦，動它的是槌——兩個問題分開問就沒有矛盾。", 11, color=ACCENT, weight="700"))
    write("piano-identity.svg", frame(W, H, "鋼琴是弦樂、打擊還是鍵盤？",
                                      "三種說法都對一半，因為它們回答的是不同的問題", body))


# ── 37. 弦的三個旋鈕（15.1） ─────────────────────────────
def fig_string_three_knobs():
    W, H = 760, 350
    body = []
    body.append(text(28, 96, "音高由三件事決定，任何一個變動都會改變頻率。", 12))
    body.append(text(28, 140, "長度", 12, weight="700"))
    body.append(line(120, 136, 460, 136, INK, 2.6))
    body.append(line(120, 168, 250, 168, INK, 2.6))
    body.append(arrow(470, 136, 530, 136))
    body.append(text(540, 141, "弦越短 → 音越高", 11, color=ACCENT, weight="700"))
    body.append(text(120, 190, "按弦就是這個動作：把有效弦長砍短。", 10, color=MUTED))
    body.append(text(28, 228, "張力", 12, weight="700"))
    body.append(line(120, 224, 460, 224, INK, 2.6))
    body.append(arrow(112, 224, 60, 224, MUTED, 1.2))
    body.append(arrow(468, 224, 520, 224, MUTED, 1.2))
    body.append(arrow(520, 224, 580, 224))
    body.append(text(590, 229, "越緊 → 音越高", 11, color=ACCENT, weight="700"))
    body.append(text(28, 292, "質量", 12, weight="700"))
    body.append(line(120, 288, 460, 288, INK, 2.6))
    body.append(line(120, 306, 460, 306, INK, 5.2))
    body.append(text(472, 292, "細弦 高", 10, color=ACCENT))
    body.append(text(472, 310, "粗弦 低", 10, color=MUTED))
    body.append(text(120, 332, "同樣長度下，越粗越重，振動越慢。", 10, color=MUTED))
    write("string-three-knobs.svg", frame(W, H, "弦的三個旋鈕：長度、張力、質量",
                                         "頻率 ∝ √(張力／質量) ÷ 長度；實務上最常動的是長度", body))


# ── 38. 鼓皮的張力（16.1） ───────────────────────────────
def fig_membrane_tension():
    W, H = 760, 320
    body = []
    cx, cy, r = 170, 200, 66
    body.append(circle(cx, cy, r, "#fff", INK, 1.6))
    body.append(circle(cx, cy, r + 9, "none", LINE, 1.2))
    for k in range(8):
        a = math.pi * 2 * k / 8
        x1, y1 = cx + (r + 2) * math.cos(a), cy + (r + 2) * math.sin(a)
        x2, y2 = cx + (r + 16) * math.cos(a), cy + (r + 16) * math.sin(a)
        body.append(line(x1, y1, x2, y2, ACCENT, 1.6))
    body.append(text(cx, cy - 66, "鼓皮", 11, "middle", MUTED))
    body.append(text(28, 296, "八個張力點一起拉＝調音；單邊拉太緊，鼓皮會歪，音也不乾淨。", 10.5, color=MUTED))
    body.append(text(320, 130, "面積越大 → 音越低", 11.5, weight="700"))
    body.append(circle(360, 210, 24, "#fff", INK, 1.4))
    body.append(text(360, 252, "小鼓", 10, "middle", MUTED))
    body.append(circle(500, 210, 46, "#fff", INK, 1.4))
    body.append(text(500, 272, "大鼓", 10, "middle", MUTED))
    body.append(text(320, 176, "拉得越緊 → 音越高", 11.5, color=ACCENT, weight="700"))
    body.append(text(600, 190, "鼓皮張力＝弦的", 10.5, color=MUTED))
    body.append(text(600, 208, "「張力旋鈕」；", 10.5, color=MUTED))
    body.append(text(600, 226, "直徑＝弦的", 10.5, color=MUTED))
    body.append(text(600, 244, "「長度」。", 10.5, color=MUTED))
    write("membrane-tension.svg", frame(W, H, "鼓的聲音怎麼調",
                                        "膜鳴樂器用張力與面積控制音高，跟弦樂是同一個物理", body))


# ── 39. 音域的三個層次（17.2） ───────────────────────────
def fig_range_three_levels():
    W, H = 760, 350
    body = []
    x0, x1 = 250, 690
    rows = [
        ("理論音域", 0.02, 0.98, "樂譜寫得出來、樂器做得到", "#e7d9c8"),
        ("實用音域", 0.18, 0.86, "演出與錄音真正會用的", "#d6c3ab"),
        ("舒適音域", 0.36, 0.68, "長時間待著也不累的", ACCENT),
    ]
    for i, (name, a, b, desc, col) in enumerate(rows):
        y = 130 + i * 60
        body.append(text(28, y - 4, name, 12.5, weight="700"))
        body.append(text(28, y + 14, desc, 9.5, color=MUTED))
        body.append(rect(x0 + (x1 - x0) * a, y - 12, (x1 - x0) * (b - a), 24, col, "none", 5))
    body.append(text(28, 308, "越往裡面，越能長時間待著；把高潮寫在舒適帶上緣，而不是極限。", 11.5, color=ACCENT, weight="700"))
    write("range-three-levels.svg", frame(W, H, "音域不是一條線，是三層",
                                          "理論、實用、舒適——同一個樂器，三種不同的「極限」", body,
                                          "實際數字依樂器、型號與演奏者而異；重點是三層之間的關係。"))


# ── 40. 舒適音域（18.2） ────────────────────────────────
def fig_tessitura():
    W, H = 760, 350
    body = []
    x0, x1 = 250, 690
    rows = [
        ("女高音", 0.46, 0.86, 0.58, 0.74),
        ("女中音", 0.36, 0.76, 0.48, 0.64),
        ("男高音", 0.20, 0.58, 0.30, 0.46),
        ("男低音", 0.04, 0.42, 0.14, 0.30),
    ]
    for i, (name, a, b, ca, cb) in enumerate(rows):
        y = 120 + i * 44
        body.append(text(28, y + 5, name, 11.5, weight="700"))
        body.append(rect(x0 + (x1 - x0) * a, y - 9, (x1 - x0) * (b - a), 18, "#e7d9c8", "none", 4))
        body.append(rect(x0 + (x1 - x0) * ca, y - 9, (x1 - x0) * (cb - ca), 18, ACCENT, "none", 4))
    body.append(text(x0, 288, "深色＝舒適帶（tessitura），淺色＝能唱到的範圍", 10.5, color=MUTED))
    body.append(text(28, 306, "整場演出大部分的音落在深色裡，聲音才撐得住；一首歌從頭飆在淺色邊緣，兩首就燒聲。", 11))
    write("tessitura.svg", frame(W, H, "能唱到 ≠ 能一直唱",
                                "淺色是極限，深色是「可以待很久」的地方", body,
                                "寫歌時把最高音放在舒適帶上緣，而不是聲部極限。"))


# ── 41. 管弦樂團的聲部疊法（19.1） ──────────────────────
def fig_orchestra_layers():
    W, H = 760, 380
    body = []
    x0, x1 = 180, 700
    bands = [
        ("高音", 106, ["長笛", "小提琴", "雙簧管", "小號"]),
        ("中音", 190, ["中提琴", "單簧管", "法國號", "雙簧管 II"]),
        ("低音", 274, ["大提琴", "低音管", "低音提琴", "低音號"]),
    ]
    body.append(text(28, 96, "三層各自有住戶；相鄰兩層留一點重疊（法國號可以補中音，也可以補低音）。", 12))
    for name, y, chips in bands:
        body.append(rect(x0, y, x1 - x0, 72, "#efe8df", "none", 10))
        body.append(text(x0 - 14, y + 42, name, 12.5, "end", weight="700"))
        for i, nm in enumerate(chips):
            cx = x0 + 16 + i * 126
            body.append(rect(cx, y + 14, 112, 44, "#fff", LINE, 8))
            body.append(text(cx + 56, y + 42, nm, 10.5, "middle"))
    body.append(text(28, 372, "真正的重點不是「塞滿」，是每一層都聽得見。", 11.5, color=MUTED))
    write("orchestra-layers.svg", frame(W, H, "管弦樂團的三層樓",
                                        "高、中、低三層各自有幾個住戶；重疊太多會互相蓋住", body))


# ── 42. 世界各地的調音（20.2） ──────────────────────────
def fig_world_tunings():
    W, H = 760, 400
    body = []
    x0, x1 = 120, 690

    def xc(c):
        return x0 + c / 1200.0 * (x1 - x0)

    systems = [
        ("十二平均律", [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200], ACCENT,
         "每個半音都剛好 100 音分，轉調最方便"),
        ("純律（Just）", [0, 204, 386, 498, 702, 884, 1088, 1200], BLUE,
         "用簡單比例算，三度特別甜，但換調會走音"),
        ("甘美朗 Slendro", [0, 240, 480, 720, 960, 1200], INK,
         "一個八度切成五個幾乎等長的小步"),
    ]
    y = 116
    for name, cents, col, desc in systems:
        body.append(text(28, y - 4, name, 11.5, weight="700"))
        body.append(text(20, y + 14, desc, 9.5, color=MUTED))
        body.append(line(x0, y + 4, x1, y + 4, LINE, 1))
        for c in cents:
            body.append(line(xc(c), y - 6, xc(c), y + 14, col, 2))
        y += 96
    for c in range(0, 1301, 200):
        body.append(line(xc(c), 84, xc(c), 300, LINE, 1, "2 6"))
        body.append(text(xc(c), 338, str(c), 10, "middle", MUTED))
    body.append(text((x0 + x1) / 2, 360, "音分（cent）── 一個八度＝1200 音分", 10.5, "middle", MUTED))
    write("world-tunings.svg", frame(W, H, "十二平均律只是其中一種切法",
                                     "同一個八度，不同文化切在不同位置上；耳朵會適應，也會聽出不同", body,
                                     "圖為概念示意，不同地區與樂團的實際調音仍有差異。"))


# ── 43. 伴奏型：走路還是轉圈（11.2–11.4） ─────────────────
def fig_accompaniment():
    W, H = 760, 330
    body = []
    x0, cell = 230, 74
    rows = [
        ("2/4 進行曲", "碰 · 恰", ["碰", "恰"], "左腳踩在「碰」上，右腳在「恰」上"),
        ("3/4 華爾滋", "碰 · 恰 · 恰", ["碰", "恰", "恰"], "一步重、兩步輕，所以會轉圈"),
        ("4/4 流行", "碰 · 恰 · 碰 · 恰", ["碰", "恰", "碰", "恰"], "兩組「碰恰」，聽起來最穩"),
    ]
    body.append(text(28, 96, "同樣的和弦，重音怎麼擺，律動就不同。", 12))
    for i, (name, pattern, beats, desc) in enumerate(rows):
        y = 140 + i * 60
        body.append(text(28, y - 4, name, 12, weight="700"))
        body.append(text(20, y + 16, desc, 9.5, color=MUTED))
        body.append(line(x0 - 10, y + 20, x0 + len(beats) * cell - 10, y + 20, LINE, 1.2))
        for k, b in enumerate(beats):
            cx = x0 + k * cell + 20
            big = b == "碰"
            body.append(circle(cx, y, 15 if big else 10,
                               ACCENT if big else SOFT, ACCENT if big else MUTED, 1.8))
            body.append(text(cx, y + 5, b, 11 if big else 9.5, "middle",
                             "#fff" if big else MUTED))
    body.append(text(28, 306, "把三種伴奏輪流彈一次，同一首歌換一個拍子，感覺就換了。", 11.5, color=MUTED))
    write("accompaniment.svg", frame(W, H, "同樣的和弦，不同的律動",
                                    "「碰」是低音、「恰」是和弦；重音落在哪一拍，決定音樂是走路還是轉圈", body))


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
    fig_tempo()
    fig_treble_notes()
    fig_bass_notes()
    fig_scientific_pitch()
    fig_odd_meters()
    fig_sh_taxonomy()
    fig_voice_ranges()
    fig_harmonic_series()
    fig_simple_meters()
    fig_string_air()
    fig_timbre_families()
    print("── 第二批 ──")
    fig_sound_wave_air()
    fig_hearing_range()
    fig_equal_loudness()
    fig_whole_half_step()
    fig_beat_vs_rhythm()
    fig_syncopation()
    fig_tempo_feel()
    fig_notation_history()
    fig_treble_territory()
    fig_bass_territory()
    fig_alto_clef()
    fig_accidentals()
    fig_bar_measure()
    fig_dotted_note()
    fig_two_two()
    fig_piano_identity()
    fig_string_three_knobs()
    fig_membrane_tension()
    fig_range_three_levels()
    fig_tessitura()
    fig_orchestra_layers()
    fig_world_tunings()
    fig_accompaniment()
    print("\n輸出目錄：%s" % OUT.relative_to(BASE_DIR))


if __name__ == "__main__":
    main()
