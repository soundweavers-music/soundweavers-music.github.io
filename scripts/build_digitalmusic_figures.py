#!/usr/bin/env python3
"""產生錄音後製課程的 SVG 示意圖（assets/digitalmusic/）。

圖的畫法、色票、字級全部沿用 `build_vocal_figures.py`：那支程式把人聲課程的
62 張圖抽成一套共用規範，這裡只是把同樣的規範用在錄音／混音的題目上，
不再各自手寫 SVG。

用法
----
    python scripts/build_digitalmusic_figures.py            # 重畫全部
    python scripts/build_digitalmusic_figures.py signal-chain eq-filters
    python scripts/build_digitalmusic_figures.py --sheet    # 輸出對照表 HTML

每張圖是一個函式，回傳 (寬, 高, 標題, 副標, 內文, 註腳)。
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

import build_vocal_figures as vf  # noqa: E402
import dm_graphs as dg  # noqa: E402

OUT_DIR = BASE_DIR / "assets" / "digitalmusic"

ACCENT, ACCENT_SOFT = vf.ACCENT, vf.ACCENT_SOFT
BLUE, BLUE_SOFT = vf.BLUE, vf.BLUE_SOFT
GREEN, GREEN_SOFT = vf.GREEN, vf.GREEN_SOFT
RED, RED_SOFT = vf.RED, vf.RED_SOFT
INK, INK2, MUTED, LINE, PANEL, BG = vf.INK, vf.INK2, vf.MUTED, vf.LINE, vf.PANEL, vf.BG

t, tb, ts = vf.t, vf.tb, vf.ts
rect, circle, path, arrow, badge, callout, steps = (
    vf.rect, vf.circle, vf.path, vf.arrow, vf.badge, vf.callout, vf.steps)


def box(x, y, w, h, title, sub="", fill=PANEL, stroke=LINE, tint=None):
    """一個說明方塊：標題在上、說明在下。"""
    out = [rect(x, y, w, h, fill=tint or fill, stroke=stroke, rx=8, sw=1.3)]
    out.append(t(x + 12, y + 22, title, size=13, weight=700))
    if sub:
        out.append(ts(x + 12, y + 41, sub, size=11))
    return "\n".join(out)


def wave(x, y, w, amp, cycles, cls="acc", samples=240, phase=0.0):
    import math
    pts = []
    for i in range(samples + 1):
        px = x + w * i / samples
        py = y - amp * math.sin(2 * math.pi * cycles * i / samples + phase)
        pts.append(f"{px:.1f} {py:.1f}")
    return path("M" + " L".join(pts), cls=cls, sw=1.8)


def hz_label(x, y, s, size=10.5):
    return ts(x, y, s, size=size, anchor="middle")


# ── 第 01 堂：訊號鏈 ────────────────────────────────────────────────────
def fig_signal_chain():
    w, h = 660, 400
    b = []
    b.append(ts(26, 82, "聲音從嘴巴到耳朵，中間每一站都會改一次它的樣子。", size=12))
    xs = [40, 148, 256, 372, 480, 574]
    names = [("聲音", "類比・空氣振動", BLUE), ("麥克風", "聲→電", BLUE),
             ("麥克風線", "平衡 XLR", ACCENT), ("錄音介面", "類比→數位", ACCENT),
             ("DAW", "編輯・混音", GREEN), ("耳機／喇叭", "數位→類比", GREEN)]
    for i, (x, (n1, n2, col)) in enumerate(zip(xs, names)):
        b.append(rect(x, 108, 86, 74, fill=PANEL, stroke=col, rx=8, sw=1.6))
        b.append(t(x + 43, 133, n1, size=12.5, anchor="middle", weight=700))
        b.append(ts(x + 43, 154, n2, size=10, anchor="middle"))
        b.append(ts(x + 43, 172, ["類比", "類比", "類比", "轉數位", "數位", "轉類比"][i],
                    size=9.5, anchor="middle", color=col))
        if i < len(xs) - 1:
            b.append(arrow(x + 88, 145, xs[i + 1] - 4, 145, "muted", size=6))
    b.append(rect(40, 206, 250, 46, fill=BLUE_SOFT, rx=6, opacity=0.75))
    b.append(rect(300, 206, 170, 46, fill=ACCENT_SOFT, rx=6, opacity=0.75))
    b.append(rect(480, 206, 160, 46, fill=GREEN_SOFT, rx=6, opacity=0.75))
    b.append(ts(48, 234, "電壓連續：怕干擾", size=10.5, color=BLUE))
    b.append(ts(308, 234, "0 與 1：可完美複製", size=10.5, color=ACCENT))
    b.append(ts(488, 234, "回到電壓才推得動耳機", size=10, color=GREEN))
    b.append(ts(26, 288, "鏈上任何一段有雜訊，後面都會一起被放大；所以先顧好收音與線材。", size=11.5))
    b.append(ts(26, 312, "兩次類比／數位轉換就是兩次失真機會，能少一次就少一次。", size=11.5, color=MUTED))
    b.append(ts(26, h - 18, "監聽的品質決定你能不能聽見問題；聽不到，就調不出來。", size=11))
    return w, h, "訊號鏈上的每一次轉換", "麥克風、介面、DAW、監聽各自改變了什麼", "\n".join(b), None


# ── 第 02 堂：駐波 ──────────────────────────────────────────────────────
def fig_room_modes():
    w, h = 660, 400
    b = []
    b.append(ts(26, 82, "兩面平行的硬牆，等於一根共振管：某些低頻被留下，某些被抵銷。", size=12))
    x0, x1, top = 60, 600, 108
    b.append(rect(x0, top, x1 - x0, 160, fill=PANEL, stroke=INK, rx=4, sw=1.6))
    for x in (x0, x1):
        b.append(rect(x - 5, top - 4, 10, 168, fill=INK, opacity=0.55, rx=2))
    b.append(ts(330, top + 184, "硬牆", size=10, anchor="middle", color=MUTED))
    import math
    modes = [(138, 1, "1 次駐波（波長＝2L）", "acc", ACCENT),
             (168, 2, "2 次（波長＝L）", "blue", BLUE),
             (196, 3, "3 次（2L/3）", "green", GREEN)]
    for y, n, label, cls, col in modes:
        pts = []
        for i in range(241):
            px = x0 + 6 + (x1 - x0 - 12) * i / 240
            py = y - 14 * math.sin(math.pi * n * i / 240)
            pts.append(f"{px:.1f} {py:.1f}")
        b.append(path("M" + " L".join(pts), cls=cls, sw=1.8))
        b.append(circle(x0, y, 3.6, fill=RED))
        b.append(circle(x1, y, 3.6, fill=RED))
    for i, (_, _, label, _, col) in enumerate(modes):
        x = 60 + i * 150
        b.append(rect(x, 288, 14, 10, fill=col, rx=2, opacity=0.6))
        b.append(ts(x + 22, 298, label.split("（")[0], size=10.5, color=col))
    b.append(ts(26, 332, "牆面永遠是壓力最大處：越靠牆，低頻越多、越濁。房間越大，最低那個駐波越低。", size=11))
    b.append(ts(26, 356, "小房間的問題集中在 100–300 Hz；把喇叭與耳朵都離開牆面，等於讓開節點。", size=11, color=MUTED))
    b.append(ts(26, h - 18, "紅點＝牆面；曲線的每一個交叉點，就是耳朵會聽到「特別多」或「特別少」的位置。", size=11))
    return w, h, "房間裡的駐波", "平行牆面把某些低頻留下來、某些抵消掉", chr(10).join(b), None


def fig_comb_filter():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "同一個聲音晚到幾毫秒，就會跟原聲疊成梳子狀的頻率響應。", size=12))
    x0, y0, pw, ph = 60, 100, 540, 130
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(path(f"M{x0} {y0 + ph} L{x0 + pw} {y0 + ph}", cls="thin"))
    import math
    pts = []
    for i in range(361):
        f = i / 360
        # 梳狀：|1 + e^{-j2πf d}|，d = 1.2
        v = abs(1 + complex(math.cos(-2 * math.pi * f * 3.4), math.sin(-2 * math.pi * f * 3.4)))
        px = x0 + pw * f
        py = y0 + ph - (v / 2) * ph * 0.92
        pts.append(f"{px:.1f} {py:.1f}")
    b.append(path("M" + " L".join(pts), cls="acc", sw=1.9))
    b.append(ts(x0, y0 + ph + 22, "頻率 →", size=10.5))
    b.append(ts(x0 + 6, y0 + 16, "振幅", size=10.5))
    b.append(ts(x0 + pw, y0 + ph + 22, "凹陷處＝被抵銷的頻率", size=10.5, anchor="end", color=RED))
    steps_items = [
        ("直接音", "先到，能量最強"),
        ("早期反射", "晚 1–10 ms，決定音色與定位"),
        ("殘響尾", "晚 20 ms 以上，決定空間大小"),
    ]
    b.append(chr(10).join(steps(70, 266, steps_items, gap=34, color=BLUE)))
    b.append(ts(400, 276, "延遲越短，梳子的齒距越寬。", size=11))
    b.append(ts(400, 296, "兩支麥克風距離一變，凹陷的頻率就整排搬家。", size=11))
    b.append(ts(400, 320, "3:1 規則＝讓齒距密到聽不出來。", size=11, color=MUTED))
    b.append(ts(400, 344, "單麥克風錄音也會有梳狀濾波——來自地板與桌面的反射。", size=10.5, color=MUTED))
    return w, h, "梳狀濾波", "直達音與反射音相差幾毫秒的結果", "\n".join(b), None


# ── 第 03 堂：取樣與量化 ────────────────────────────────────────────────
def fig_ad_conversion():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "取樣＝每隔固定時間量一次；量化＝把量到的值對到最近的格子。", size=12))
    x0, y0, pw, ph = 60, 104, 540, 150
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    for k in range(5):
        yy = y0 + ph * k / 4
        b.append(path(f"M{x0} {yy} L{x0 + pw} {yy}", cls="thin"))
    b.append(wave(x0 + pw / 2, y0 + ph / 2, pw - 20, ph / 2 - 10, 2.2, "thin", 300))
    import math
    samples = 22
    for i in range(samples):
        px = x0 + 10 + (pw - 20) * i / (samples - 1)
        val = math.sin(2 * math.pi * 2.2 * i / (samples - 1))
        py = y0 + ph / 2 - (ph / 2 - 10) * val
        qy = y0 + ph / 2 - (ph / 2 - 10) * round(val * 4) / 4
        b.append(circle(px, py, 2.4, fill=ACCENT))
        b.append(rect(px - 4, min(py, qy), 8, abs(py - qy) + 1, fill=RED, opacity=0.35))
    b.append(ts(x0 + pw / 2, y0 + ph + 24, "紅色＝量化誤差；取樣點越密，波形越接近原聲。", size=11, anchor="middle"))
    spec = [
        ("44.1 kHz", "可還原到 22.05 kHz", "CD 標準"),
        ("48 kHz", "可還原到 24 kHz", "影片與大部分 DAW 預設"),
        ("96 kHz", "可還原到 48 kHz", "高解析母帶、大量後製"),
    ]
    for i, (a, c, d) in enumerate(spec):
        x = 60 + i * 184
        b.append(rect(x, 296, 168, 54, fill=BLUE_SOFT, rx=6, opacity=0.8))
        b.append(t(x + 12, 316, a, size=12.5, weight=700))
        b.append(ts(x + 12, 332, c, size=9.5, color=MUTED))
        b.append(ts(x + 12, 346, d, size=9.5, color=MUTED))
    b.append(ts(26, h - 18, "取樣率決定「最高能記錄到多高」；位元深度決定「能記錄多安靜」。", size=11))
    return w, h, "取樣率與位元深度", "Nyquist：取樣率至少要是最高頻率的兩倍", "\n".join(b), None


def fig_buffer_latency():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "緩衝區是一塊一塊處理的；越大越穩，但延遲越長。", size=12))
    track_y = 130
    b.append(path(f"M60 {track_y} L600 {track_y}", cls="thin", sw=1.2))
    for i in range(8):
        x = 60 + i * 68
        fill = ACCENT_SOFT if i % 2 == 0 else PANEL
        b.append(rect(x, track_y - 26, 62, 52, fill=fill, stroke=LINE, rx=3))
        b.append(ts(x + 31, track_y + 4, "128", size=10, anchor="middle", color=MUTED))
    b.append(ts(330, track_y + 46, "每一格＝一個緩衝區（sample 數）", size=10.5, anchor="middle"))
    for i, (ms, label, col) in enumerate([(2.7, "64 samples　來回約 2.7 ms", GREEN),
                                          (5.3, "128 samples　來回約 5.3 ms", ACCENT),
                                          (10.7, "256 samples　來回約 10.7 ms", BLUE),
                                          (21.3, "512 samples　來回約 21.3 ms", RED)]):
        y = 214 + i * 32
        b.append(rect(60, y - 14, 12, 12, fill=col, rx=2, opacity=0.5))
        b.append(t(84, y - 2, label, size=11.5))
    b.append(ts(360, 214, "延遲 = 緩衝區 ÷ 取樣率 × 2", size=12, color=INK))
    b.append(ts(360, 236, "（輸入一次、輸出一次）", size=10.5))
    b.append(ts(360, 276, "48 kHz、128 samples →", size=11))
    b.append(ts(360, 296, "約 2.7 ms 單程、5.3 ms 來回", size=11))
    b.append(ts(26, h - 18, "錄音時把緩衝區壓小、把外掛關掉；混音時再放大讓它跑得動。", size=11))
    return w, h, "緩衝區大小與延遲", "同一台電腦，穩定與即時是交換關係", "\n".join(b), None


# ── 第 04 堂：近接效應 ──────────────────────────────────────────────────
def fig_mic_proximity():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "唱得越近，低頻越厚；距離是最好用的音色旋鈕。", size=12))
    # 左：距離尺
    b.append(circle(92, 168, 26, fill=INK, opacity=0.85))
    b.append(circle(92, 168, 16, fill=PANEL, opacity=0.25))
    b.append(ts(92, 210, "麥克風", size=10.5, anchor="middle"))
    b.append(path("M120 168 L330 168", cls="thin", dash="4 4"))
    b.append(arrow(126, 168, 150, 168, "muted", 5))
    for d, label, col in [(40, "5 cm", RED), (105, "15 cm", ACCENT), (200, "40 cm", GREEN)]:
        x = 126 + d
        b.append(circle(x, 168, 4, fill=col))
        b.append(ts(x, 194, label, size=10.5, anchor="middle", color=col))
    b.append(ts(126, 150, "越近：低頻越多、唇齒越清楚", size=10, color=MUTED))
    b.append(ts(126, 232, "越遠：房間的聲音開始混進來", size=10, color=MUTED))
    # 右：曲線
    b.append(t(360, 112, "150 Hz 以下的相對能量", size=11.5, weight=700))
    x0, y0, pw, ph = 360, 124, 250, 120
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(path(f"M{x0 + 10} {y0 + ph - 16} L{x0 + pw - 10} {y0 + ph - 16}", cls="thin"))
    curve = [(0, 0.15), (0.1, 0.32), (0.2, 0.5), (0.35, 0.66), (0.5, 0.74), (0.7, 0.76), (1.0, 0.74)]
    pts = [(x0 + 10 + (pw - 20) * a, y0 + ph - 16 - (ph - 36) * v) for a, v in curve]
    b.append(path("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts), cls="acc", sw=2))
    b.append(ts(x0 + 6, y0 + ph - 2, "近", size=9.5))
    b.append(ts(x0 + pw - 6, y0 + ph - 2, "遠", size=9.5, anchor="end"))
    b.append(chr(10).join(steps(60, 268, [
        ("貼近 5–10 cm", "低頻厚、唇齒清楚，但噴麥風險最高"),
        ("15–25 cm", "多數人聲的折衷；用防噴罩擋氣流"),
        ("40 cm 以上", "房間聲音開始跟人聲一樣大"),
    ], gap=34, color=ACCENT)))
    b.append(ts(26, h - 18, "近接效應是物理現象，不是麥克風的缺點；想少一點低頻就往後退。", size=11))
    return w, h, "麥克風距離與近接效應", "指向性麥克風離嘴巴越近，低頻越飽", chr(10).join(b), None


def text_marker(x, y, s, color):
    return (f'  <text x="{x}" y="{y}" text-anchor="middle" font-size="10.5" '
            f'fill="{color}">{vf.esc(s)}</text>')


# ── 第 05 堂：立體聲收音 ────────────────────────────────────────────────
def fig_stereo_techniques():
    w, h = 660, 420
    b = []
    b.append(ts(26, 84, "同一組樂器，四種擺法＝四種空間感；差別在「時間差」與「音量差」。", size=12))
    cells = [
        ("AB", "兩支全指向、間距 40–80 cm", "時間差為主", BLUE),
        ("XY", "兩支心形、90° 交叉同點", "音量差為主，單聲道相容", ACCENT),
        ("ORTF", "兩支心形、17 cm、110°", "時間差＋音量差", GREEN),
        ("MS", "一支中置＋一支雙向", "M/S 比例決定寬度", INK2),
    ]
    for i, (name, how, why, col) in enumerate(cells):
        x = 40 + (i % 2) * 300
        y = 104 + (i // 2) * 140
        b.append(rect(x, y, 280, 118, fill=PANEL, stroke=col, rx=8, sw=1.5))
        b.append(t(x + 14, y + 26, name, size=15, weight=700, color=col))
        b.append(ts(x + 14, y + 48, how, size=10.5))
        b.append(ts(x + 14, y + 68, why, size=10.5, color=MUTED))
        # 示意圖
        cx, cy = x + 236, y + 92
        if name == "AB":
            b.append(circle(cx - 26, cy, 5, fill=col))
            b.append(circle(cx + 26, cy, 5, fill=col))
            b.append(path(f"M{cx - 21} {cy} L{cx + 21} {cy}", cls="thin", dash="3 3"))
        elif name == "XY":
            b.append(circle(cx - 4, cy, 5, fill=col))
            b.append(circle(cx + 4, cy, 5, fill=col))
            b.append(path(f"M{cx - 4} {cy} l-14 -10 M{cx - 4} {cy} l-14 10", cls="thin"))
            b.append(path(f"M{cx + 4} {cy} l14 -10 M{cx + 4} {cy} l14 10", cls="thin", dash="3 3"))
        elif name == "ORTF":
            b.append(circle(cx - 9, cy - 4, 5, fill=col))
            b.append(circle(cx + 9, cy + 4, 5, fill=col))
            b.append(path(f"M{cx - 9} {cy - 4} l-12 -12", cls="thin"))
            b.append(path(f"M{cx + 9} {cy + 4} l12 12", cls="thin", dash="3 3"))
        else:
            b.append(circle(cx, cy - 10, 5, fill=col))
            b.append(circle(cx, cy + 10, 5, fill=BLUE))
            b.append(path(f"M{cx - 16} {cy - 10} L{cx + 16} {cy - 10}", cls="thin"))
            b.append(path(f"M{cx} {cy + 10} l0 0", cls="thin"))
    b.append(ts(26, 380, "3:1 規則：第二支麥克風的距離，至少是第一支到音源距離的三倍。", size=11.5))
    b.append(ts(26, h - 18, "單聲道相容性：把左右相加不會讓樂器突然消失，才算擺得安全。", size=11))
    return w, h, "四種立體聲收音", "AB、XY、ORTF、MS 各自的時間差與音量差", "\n".join(b), None


# ── 第 06 堂：Gain staging ─────────────────────────────────────────────
def fig_gain_staging():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "訊號每經過一站都要重新對齊電平；任何一站過熱，後面就救不回來。", size=12))
    x0, y0, pw, ph = 76, 112, 40, 200
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(ts(x0 + pw / 2, y0 - 8, "0 dBFS", size=10, anchor="middle", color=MUTED))
    marks = [(0, "0"), (0.2, "−20"), (0.4, "−40"), (0.6, "−60"), (0.8, "−80"), (1.0, "−∞")]
    for frac, label in marks:
        yy = y0 + ph * frac
        b.append(path(f"M{x0 - 6} {yy} L{x0 + pw} {yy}", cls="thin"))
        b.append(ts(x0 - 10, yy + 4, label, size=9.5, anchor="end", color=MUTED))
    stages = [
        (0.66, "麥克風輸出", "−50 dBFS 左右，非常小", BLUE),
        (0.36, "前級放大", "推到 −18 dBFS 的目標", ACCENT),
        (0.18, "錄進 DAW", "峰值 −12 到 −6 dBFS", GREEN),
        (0.04, "混音總線", "尖峰不超過 −3 dBFS", ACCENT),
    ]
    for frac, name, note, col in stages:
        yy = y0 + ph * frac
        b.append(circle(x0 + pw + 14, yy, 4.5, fill=col))
        b.append(t(x0 + pw + 30, yy + 4, name, size=12, weight=600, color=col))
        b.append(ts(x0 + pw + 130, yy + 4, note, size=10.5))
    b.append(rect(60, 330, 540, 34, fill=RED_SOFT, rx=6, opacity=0.6))
    b.append(ts(74, 352, "0 dBFS 是硬天花板：一超過就是削波，錄進去就救不回來。", size=10.5, color=RED))
    b.append(ts(26, h - 18, "先量再調：每一站都用錶頭確認，不要靠耳朵猜增益。", size=11))
    return w, h, "Gain staging：四站的電平", "從麥克風到總線，每一段都要留餘裕", "\n".join(b), None


# ── 第 07 堂：監聽與延遲 ────────────────────────────────────────────────
def fig_latency_routing():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "同一段聲音，走「介面直出」和「繞進電腦」的差別就是延遲。", size=12))
    b.append(box(50, 120, 130, 64, "歌手", "唱進麥克風"))
    b.append(box(220, 120, 150, 64, "錄音介面", "前級＋AD", tint=ACCENT_SOFT))
    b.append(box(410, 120, 130, 64, "電腦 DAW", "錄音、掛外掛", tint=BLUE_SOFT))
    b.append(box(220, 250, 150, 64, "耳機輸出", "Cue mix", tint=GREEN_SOFT))
    b.append(arrow(180, 152, 216, 152, "muted", 6))
    b.append(arrow(370, 152, 406, 152, "muted", 6))
    b.append(path("M475 184 C475 232 420 250 374 268", cls="blue", sw=1.8))
    b.append(arrow(420, 258, 376, 270, "blue", 6))
    b.append(ts(492, 232, "繞電腦＝延遲", size=10.5, color=BLUE))
    b.append(path("M260 184 C260 216 258 234 258 246", cls="green", sw=1.8))
    b.append(arrow(258, 240, 258, 246, "green", 6))
    b.append(ts(272, 218, "Direct Monitor：不進電腦", size=10.5, color=GREEN))
    b.append(arrow(370, 282, 180, 282, "muted", 6))
    b.append(ts(275, 300, "耳機裡聽到的伴奏", size=10, anchor="middle"))
    b.append(ts(26, 348, "延遲大於約 10 ms，唱起來就會「對不準」；用 Direct Monitor 或壓小緩衝區。", size=11))
    b.append(ts(26, h - 18, "別忘了錄完要補償：DAW 回放的位置，可能比實際錄進來的晚幾個 ms。", size=11))
    return w, h, "Direct Monitor 與軟體監聽", "把延遲留在電腦裡，不要讓它回到耳朵", "\n".join(b), None


# ── 第 08 堂：相位 ──────────────────────────────────────────────────────
def fig_phase_correlation():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "兩支麥克風收到同一個聲音、卻差了半個波長，相加就會變小。", size=12))
    b.append(ts(60, 116, "同相（相差 0°）", size=11.5, color=GREEN))
    b.append(wave(60, 150, 240, 26, 2, "green", 200))
    b.append(ts(360, 116, "反相（相差 180°）", size=11.5, color=RED))
    b.append(wave(360, 150, 120, 26, 2, "red", 200))
    b.append(wave(480, 150, 120, 26, 2, "red", 200, phase=3.14159))
    b.append(ts(360, 208, "相加 → 幾乎無聲", size=10.5, color=RED))
    b.append(path("M60 226 L600 226", cls="thin"))
    b.append(ts(60, 250, "相位相關儀：+1 完全同相、0 無關、−1 完全反相", size=11))
    b.append(rect(60, 262, 540, 22, fill=GREEN_SOFT, rx=4))
    b.append(rect(330, 262, 270, 22, fill=RED_SOFT, rx=4, opacity=0.8))
    b.append(ts(66, 278, "安全", size=10, color=GREEN))
    b.append(ts(560, 278, "可能互相抵消", size=10, anchor="end", color=RED))
    b.append(rect(300, 262, 3, 22, fill=INK))
    b.append(ts(303, 300, "0", size=10, anchor="middle"))
    b.append(ts(26, 340, "處理順序：先檢查相位，再談 EQ；反相沒解決，EQ 只是在錯的訊號上加料。", size=11.5))
    b.append(ts(26, h - 18, "單聲道相容性測試：把左右相加，聽聽看有沒有東西突然消失。", size=11))
    return w, h, "相位抵消", "同一個聲音晚半個波長，能量就變成零", "\n".join(b), None


# ── 第 09 堂：Crossfade ────────────────────────────────────────────────
def fig_crossfade():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "兩個 Take 交界處的淡出淡入；曲線選錯，交接點會凹一個洞。", size=12))
    b.append(box(60, 108, 250, 88, "Take A", "淡出", tint=ACCENT_SOFT))
    b.append(box(350, 108, 250, 88, "Take B", "淡入", tint=BLUE_SOFT))
    b.append(arrow(310, 152, 346, 152, "muted", 6))
    x0, y0, pw, ph = 90, 220, 480, 72
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    import math
    a_pts, b_pts, s_pts = [], [], []
    for i in range(101):
        f = i / 100
        a_pts.append(f"{x0 + pw * f:.1f} {y0 + ph - ph * math.cos(f * math.pi / 2) * 0.9:.1f}")
        b_pts.append(f"{x0 + pw * f:.1f} {y0 + ph - ph * math.sin(f * math.pi / 2) * 0.9:.1f}")
        s_pts.append(f"{x0 + pw * f:.1f} {y0 + ph - ph * (math.sin(f * math.pi / 2) ** 2 + math.cos(f * math.pi / 2) ** 2) * 0.5 * 0.9:.1f}")
    b.append(path("M" + " L".join(a_pts), cls="acc", sw=1.8))
    b.append(path("M" + " L".join(b_pts), cls="blue", sw=1.8))
    b.append(path("M" + " L".join(s_pts), cls="green", sw=1.4))
    b.append(ts(x0 + pw / 2, y0 + ph + 20, "等功率曲線相加＝水平線", size=10.5, anchor="middle", color=GREEN))
    b.append(chr(10).join(steps(60, 278, [
        ("Equal Power", "兩軌同相時的預設，音量不會掉"),
        ("Equal Gain", "兩軌內容不同、相關性低時用"),
        ("手動拉長", "換氣聲、長音尾巴可拉 30–80 ms"),
    ], gap=32)))
    return w, h, "Crossfade 的兩條曲線", "交界處要嘛等功率、要嘛等增益", "\n".join(b), None


# ── 第 10 堂：Warp ────────────────────────────────────────────────────
def fig_warp_markers():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "Warp 標記就是「這個鼓點應該在格線上的哪裡」；標記位置＝時間校正。", size=12))
    x0, y0, pw, ph = 70, 110, 500, 150
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    for k in range(9):
        x = x0 + pw * k / 8
        b.append(path(f"M{x} {y0} L{x} {y0 + ph}", cls="thin"))
        b.append(ts(x, y0 + ph + 18, str(k * 4), size=9, anchor="middle", color=MUTED))
    xs = [x0 + pw * f for f in (0.02, 0.16, 0.29, 0.41, 0.55, 0.68, 0.82, 0.96)]
    b.append(path("M" + " L".join(f"{x:.1f} {y0 + 78}" for x in xs), cls="acc", sw=2))
    for i, x in enumerate(xs):
        b.append(circle(x, y0 + 78, 4.5, fill=ACCENT if i % 2 == 0 else RED))
        b.append(path(f"M{x:.1f} {y0 + 72} L{x:.1f} {y0 + 34}", cls="thin", dash="3 3"))
    b.append(ts(x0, y0 + 30, "標記釘在聽到的瞬態上，格線是專案速度", size=10.5, color=MUTED))
    for i in range(5):
        b.append(path(f"M{x0 + 10 + i * 4} {y0 + ph - 6} l0 -10", cls="thin"))
    b.append(ts(x0, y0 + 106, "A", size=10, color=ACCENT))
    b.append(ts(x0 + pw, y0 + 106, "B", size=10, anchor="end", color=RED))
    b.append(box(70, 288, 240, 52, "Q：先對大鼓還是先對小鼓？", "先對最清楚的瞬態，其餘自然跟上", tint=BLUE_SOFT))
    b.append(box(330, 288, 240, 52, "Q：要不要 100% 量化？", "鼓可 100%，貝斯與人聲留 60–80%", tint=GREEN_SOFT))
    return w, h, "時間伸縮與量化", "標記的位置比演算法更能決定「聽起來自不自然」", "\n".join(b), None


# ── 第 11 堂：音分 ────────────────────────────────────────────────────
def fig_pitch_cents():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "半音＝100 音分；人耳大約在 5–10 音分才聽得出偏差。", size=12))
    x0, y0, pw = 80, 164, 500
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="ink", sw=1.6))
    for k in range(0, 101, 25):
        x = x0 + pw * k / 100
        b.append(path(f"M{x} {y0 - 6} L{x} {y0 + 6}", cls="ink"))
        b.append(ts(x, y0 + 26, str(k), size=10, anchor="middle", color=MUTED))
    b.append(ts(x0, y0 - 16, "0 音分（準）", size=10.5))
    b.append(ts(x0 + pw, y0 - 16, "100 音分（下一個半音）", size=10.5, anchor="end"))
    zones = [(0, 10, GREEN, "自然"), (10, 35, ACCENT, "聽得出、可接受"), (35, 100, RED, "走音")]
    for a, c, col, label in zones:
        xa, xb = x0 + pw * a / 100, x0 + pw * c / 100
        b.append(rect(xa, y0 - 44, xb - xa, 16, fill=col, rx=3, opacity=0.35))
        b.append(ts((xa + xb) / 2, y0 - 52, label, size=9.5, anchor="middle", color=col))
    b.append("\n".join(steps(80, 230, [
        ("修多少", "流行歌 60–90%、爵士 20–40%，全修會扁"),
        ("共振峰", "先修音高、再輕修共振峰，避免「卡通音」"),
        ("抖音", "保留 4–7 Hz 的擺動；整條拉平就死了"),
    ], gap=34, color=BLUE)))
    b.append(ts(360, 232, "修音前先確認：", size=11, color=INK))
    b.append(ts(360, 252, "是音準問題，還是氣息與咬字的問題？", size=10.5))
    b.append(ts(360, 272, "後者拉音準只會更假。", size=10.5, color=MUTED))
    return w, h, "音高偏差以音分計", "半音切成 100 份，耳朵聽得出 5 音分", "\n".join(b), None


def fig_pitch_curve():
    import math
    w, h = 660, 430
    b = []
    b.append(ts(26, 84, "同一段旋律的兩種樣子：藍色是唱出來的，棕色是修過的。", size=12))
    K = 0.42  # 每 1 音分 0.42 px

    def seg(xa, xb, y, fn, n=56):
        pts = []
        for i in range(n + 1):
            t = i / n
            pts.append(f"{xa + (xb - xa) * t:.1f} {y - fn(t) * K:.1f}")
        return "M" + " L".join(pts)

    for xa, xb, y, name in [(74, 205, 250, "C4"), (210, 335, 205, "D4"),
                            (340, 465, 160, "E4"), (470, 618, 205, "D4")]:
        b.append(path(f"M{xa} {y} L{xb} {y}", cls="thin", dash="5 4"))
        b.append(ts(xa + 4, y - 9, name, size=9.5, color=MUTED))

    b.append(arrow(52, 320, 52, 110, "ink", 8))
    b.append(ts(46, 104, "音高", size=10.5, anchor="end"))

    orig = [
        seg(74, 108, 250, lambda t: -38 + 34 * t),                                # 進歌偏低
        seg(108, 205, 250, lambda t: -4 + 28 * math.sin(2 * math.pi * 1.6 * t)),  # 抖音
        seg(210, 230, 205, lambda t: 58 * math.exp(-3.6 * t)),                    # 進歌衝高
        seg(230, 335, 205, lambda t: -6 + 12 * math.sin(2 * math.pi * 1.5 * t)),
        seg(340, 465, 160, lambda t: 6 - 74 * t),                                 # 長音下滑
        seg(470, 556, 205, lambda t: -6 + 5 * math.sin(2 * math.pi * 1.2 * t)),
        seg(556, 618, 205, lambda t: -6 + 58 * max(0.0, (t - 0.45) / 0.55) ** 1.6),  # 結尾上飄
    ]
    b.append(path(" ".join(orig), cls="blue", sw=1.9, dash="6 4", opacity=0.9))

    fixed = [
        seg(74, 205, 250, lambda t: 26 * math.sin(2 * math.pi * 1.6 * t)),
        seg(210, 335, 205, lambda t: 24 * math.sin(2 * math.pi * 1.5 * t)),
        seg(340, 465, 160, lambda t: 25 * math.sin(2 * math.pi * 1.4 * t)),
        seg(470, 618, 205, lambda t: 22 * math.sin(2 * math.pi * 1.3 * t)),
    ]
    b.append(path(" ".join(fixed), cls="acc", sw=2.3))

    for x, y, n, s in [(80, 292, 1, "進歌偏低 10–20 音分"), (222, 172, 2, "進歌先衝高再拉回"),
                       (402, 118, 3, "長音一路下滑"), (534, 168, 4, "結尾往上飄")]:
        b.append(badge(x, y, n))
        b.append(ts(x + 16, y + 4, s, size=10.5))

    b.append(ts(26, 344, "修的方式：把整條曲線的中心線搬到目標音，抖音的擺動原樣留著。", size=11.5))
    b.append(ts(26, 366, "逐點壓平會聽出機械感；中心線對了，耳朵就覺得準。", size=11, color=MUTED))
    b.append(ts(26, 390, "藍色虛線＝原始演唱　棕色實線＝修正後　灰色虛線＝目標音高", size=10.5, color=MUTED))
    return w, h, "音高曲線上的四種毛病", "Melodyne 這類工具看到的就是這條線", "\n".join(b), None


def fig_retune_speed():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "同一句換音，Retune Speed 決定它「跳」過去還是「滑」過去。", size=12))

    def sstep(t):
        return t * t * (3 - 2 * t)

    panels = [
        (60, "0–5 ms", "瞬間到位，中間沒有過渡", "階梯感＝T-Pain 效果", RED, "jump"),
        (250, "20–30 ms", "幾十毫秒內追上目標", "自然風格的常用設定", ACCENT, "fast"),
        (440, "50 ms 以上", "慢到幾乎跟著原聲", "只修大方向，細節不動", BLUE, "slow"),
    ]
    for x, top, mid, bot, col, kind in panels:
        b.append(rect(x, 100, 165, 132, fill=PANEL, stroke=LINE, rx=6))
        y_lo, y_hi = 206, 156
        xa, xb = x + 14, x + 150
        b.append(path(f"M{xa} {y_lo} L{xb} {y_lo}", cls="thin", dash="4 4"))
        b.append(path(f"M{xa} {y_hi} L{xb} {y_hi}", cls="thin", dash="4 4"))
        if kind == "jump":
            d = f"M{xa} {y_lo} L{x + 62} {y_lo} L{x + 62} {y_hi} L{xb} {y_hi}"
        else:
            span = 26 if kind == "fast" else 92
            pts = []
            for i in range(41):
                xx = xa + (xb - xa) * i / 40
                tt = min(1.0, max(0.0, ((xx - x) - 50) / span))
                pts.append(f"{xx:.1f} {y_lo - (y_lo - y_hi) * sstep(tt):.1f}")
            d = "M" + " L".join(pts)
        b.append(path(d, cls={"jump": "red", "fast": "acc", "slow": "blue"}[kind], sw=2.2))
        b.append(t(x + 10, 240, top, size=11.5, weight=700, color=col))
        b.append(ts(x + 10, 258, mid, size=10))
        b.append(ts(x + 10, 276, bot, size=10, color=MUTED))

    b.append(ts(26, 306, "Retune Speed 是一個時間值，不是強度：數值越小，聲音越快被拉回目標音。", size=11.5))
    b.append(ts(26, 328, "要人味就把 Speed 放慢，同時留一點 Humanize／Flex-Tune 的空間；", size=11, color=MUTED))
    b.append(ts(26, 348, "要機械感就把 Speed 歸零，兩個自然化參數一起關掉。", size=11, color=MUTED))
    return w, h, "Retune Speed 的快慢", "差別只在聲音用幾十毫秒追上目標音", "\n".join(b), None


def fig_formant_shift():
    import math
    w, h = 660, 440
    b = []
    b.append(ts(26, 84, "移調時泛音該跟著移；共振峰跟著移，聲音就變形了。", size=12))
    lo, hi = 150.0, 4000.0
    x0, x1 = 210, 620

    def xf(f):
        return x0 + (math.log2(f) - math.log2(lo)) / (math.log2(hi) - math.log2(lo)) * (x1 - x0)

    rows = [
        (112, ["原音", "220 Hz（A3）"], [700, 1220, 2600], ACCENT, "acc"),
        (208, ["移高 5 個半音", "未修正共振峰"], [934, 1629, 3471], BLUE, "blue"),
        (304, ["移高 5 個半音", "已修正共振峰"], [700, 1220, 2600], GREEN, "green"),
    ]
    for ybase, (l1, l2), peaks, col, cls in rows:
        b.append(ts(28, ybase + 26, l1, size=10, color=col))
        b.append(ts(28, ybase + 44, l2, size=10, color=MUTED))
        base = ybase + 70
        b.append(path(f"M{x0} {base} L{x1} {base}", cls="thin"))
        pts = []
        for i in range(161):
            f = lo * (hi / lo) ** (i / 160)
            v = sum(math.exp(-((math.log2(f / pf)) ** 2) / (2 * 0.16 ** 2)) for pf in peaks)
            pts.append(f"{xf(f):.1f} {base - min(v, 1.0) * 48:.1f}")
        b.append(path("M" + " L".join(pts), cls=cls, sw=1.9))
        for pf in peaks:
            b.append(circle(xf(pf), base, 2.6, fill=col))

    for pf, nm in [(700, "F1"), (1220, "F2"), (2600, "F3")]:
        b.append(path(f"M{xf(pf)} 100 L{xf(pf)} 386", cls="thin", dash="3 5", opacity=0.7))
        b.append(ts(xf(pf), 96, nm, size=9.5, anchor="middle", color=MUTED))

    for f, lab in [(200, "200"), (500, "500"), (1000, "1k"), (2000, "2k"), (4000, "4k Hz")]:
        b.append(ts(xf(f), 400, lab, size=9.5, anchor="middle", color=MUTED))

    b.append(ts(26, 424, "5 個半音＝頻率 ×1.335。共振峰沒有一起搬回來，聽起來就是花栗鼠或巨人。", size=11))
    return w, h, "移調與共振峰", "泛音列與共振峰是兩件事，改一個不一定會改另一個", "\n".join(b), None


# ── 第 12 堂：混音三維 ────────────────────────────────────────────────
def fig_mix_3d():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "左右（X）、頻率（Y）、深度（Z）三個軸各自獨立，才不會互相打架。", size=12))
    ox, oy = 330, 300
    b.append(arrow(ox, oy, ox + 240, oy, "acc", 8))
    b.append(ts(ox + 250, oy + 4, "X 聲像", size=11))
    b.append(arrow(ox, oy, ox, oy - 190, "green", 8))
    b.append(ts(ox - 6, oy - 200, "Y 頻率", size=11, anchor="middle"))
    b.append(arrow(ox, oy, ox - 170, oy + 78, "blue", 8))
    b.append(ts(ox - 178, oy + 92, "Z 深度", size=11))
    pts = [(120, 190, "人聲", ACCENT), (250, 150, "吉他", GREEN), (300, 250, "鼓", INK2), (180, 270, "貝斯", BLUE)]
    for x, y, name, col in pts:
        b.append(circle(x, y, 7, fill=col, opacity=0.85))
        b.append(ts(x + 12, y - 8, name, size=10.5, color=col))
    b.append(ts(60, 110, "前：乾、近、亮", size=10.5, color=MUTED))
    b.append(ts(60, 130, "後：濕、遠、暗", size=10.5, color=MUTED))
    b.append(box(60, 322, 160, 48, "X", "聲像與寬度", tint=ACCENT_SOFT))
    b.append(box(240, 322, 160, 48, "Y", "頻率與 EQ", tint=GREEN_SOFT))
    b.append(box(420, 322, 160, 48, "Z", "深度與殘響", tint=BLUE_SOFT))
    return w, h, "混音的三維座標", "把每個樂器放在一個立體位置，而不是全部擠在中央", "\n".join(b), None


# ── 第 13 堂：Fader 層級 ─────────────────────────────────────────────
def fig_fader_pyramid():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "先決定誰在前景，其餘照著它排；順序比音量數字重要。", size=12))
    layers = [
        ("主唱", "0 dB 參考", ACCENT, 0.95),
        ("鼓與貝斯", "−3 到 −6 dB", INK2, 0.82),
        ("節奏吉他／鍵盤", "−9 到 −15 dB", GREEN, 0.66),
        ("和聲與裝飾", "−15 到 −21 dB", BLUE, 0.5),
    ]
    for i, (name, note, col, op) in enumerate(layers):
        width = 420 * (1 - i * 0.18)
        x = 120 + (420 - width) / 2
        y = 118 + i * 52
        b.append(rect(x, y, width, 40, fill=col, rx=6, opacity=op * 0.35, stroke=col, sw=1.3))
        b.append(t(x + 14, y + 25, name, size=12, weight=700))
        b.append(ts(x + width - 12, y + 25, note, size=10, anchor="end"))
    b.append(ts(26, 318, "推完先靜音主唱：其他樂器還聽得出「這是一首歌」嗎？", size=11.5))
    b.append(ts(26, h - 18, "靜態混音完成前不要碰 EQ 與壓縮；先確定平衡，再處理音色。", size=11))
    return w, h, "Fader 的層級", "從主唱往下排，不要從上往下猜", "\n".join(b), None


# ── 第 14 堂：濾波器 ─────────────────────────────────────────────────
def fig_eq_filters():
    w, h = 660, 420
    b = []
    b.append(ts(26, 84, "五種基本形狀；每一種的參數只有頻率、增益、Q 三件事。", size=12))
    shapes = [
        ("High-pass", "切掉低頻，斜率 12–24 dB/oct", lambda f: max(0, 1 - (1 - f) * 2.2), ACCENT),
        ("Low-pass", "切掉高頻", lambda f: max(0, 1 - f * 2.2), BLUE),
        ("Bell", "中間挖或加，Q 決定寬窄", lambda f: 0.5 + 0.45 * pow(2.718, -((f - 0.5) ** 2) / 0.006), GREEN),
        ("Low shelf", "低頻整段上下移", lambda f: 0.5 - 0.4 / (1 + pow(2.718, (f - 0.35) * 18)), ACCENT),
        ("High shelf", "高頻整段上下移", lambda f: 0.5 + 0.4 / (1 + pow(2.718, -(f - 0.65) * 18)), BLUE),
    ]
    for i, (name, note, fn, col) in enumerate(shapes):
        x = 40 + (i % 3) * 200
        y = 104 + (i // 3) * 150
        b.append(rect(x, y, 184, 128, fill=PANEL, stroke=LINE, rx=6))
        b.append(t(x + 10, y + 20, name, size=11.5, weight=700, color=col))
        b.append(ts(x + 10, y + 36, note, size=9, color=MUTED))
        pts = []
        for k in range(41):
            f = k / 40
            py = y + 116 - 66 * fn(f)
            pts.append(f"{x + 10 + 164 * f:.1f} {py:.1f}")
        b.append(path(f"M{x + 10} {y + 106} L{x + 174} {y + 106}", cls="thin"))
        b.append(path("M" + " L".join(pts), cls={"acc": "acc", "blue": "blue", "green": "green"}[
            {ACCENT: "acc", BLUE: "blue", GREEN: "green"}[col]], sw=1.7))
    b.append(ts(26, 400, "減法優先：先想「哪個頻段不需要」，再想「哪裡要加」。", size=11.5))
    return w, h, "五種基本濾波器", "高通、低通、鐘形、低擱架、高擱架", "\n".join(b), None


# ── 第 15 堂：壓縮轉換曲線 ────────────────────────────────────────────
def fig_compressor_curve():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "壓縮器改變的是「輸入變大時，輸出怎麼跟」——看的是斜率，不是音量。", size=12))
    x0, y0, s = 90, 336, 206
    b.append(rect(x0, y0 - s, s, s, fill=PANEL, stroke=LINE, rx=4))
    b.append(arrow(x0, y0, x0 + s + 24, y0, "muted", 7))
    b.append(arrow(x0, y0, x0, y0 - s - 22, "muted", 7))
    b.append(ts(x0 + s + 18, y0 + 34, "輸入 dB", size=10, anchor="end"))
    b.append(ts(x0 - 8, y0 - s - 14, "輸出 dB", size=10, anchor="middle"))
    b.append(path(f"M{x0} {y0} L{x0 + s} {y0 - s}", cls="thin", dash="4 4"))
    th = -18
    xth = x0 + s * (th + 60) / 60.0
    yth = y0 - s * (th + 60) / 60.0
    ratio_y = yth - (y0 - s - yth) / 4
    b.append(path(f"M{x0} {y0} L{xth:.1f} {yth:.1f} L{x0 + s} {ratio_y:.1f}", cls="acc", sw=2))
    b.append(circle(xth, yth, 4.5, fill=RED))
    b.append(ts(xth + 8, yth - 8, "Threshold −18 dB", size=10, color=RED))
    b.append(ts(x0 + s - 4, ratio_y - 8, "4:1", size=11, anchor="end", color=ACCENT))
    b.append(ts(x0 + 10, y0 - 6, "1:1", size=9.5, color=MUTED))
    params = [("Threshold", "從哪裡開始壓"), ("Ratio", "壓多用力"),
              ("Attack", "多快開始壓"), ("Release", "多快放開")]
    for i, (name, note) in enumerate(params):
        y = 120 + i * 44
        b.append(t(400, y, name, size=12, weight=700))
        b.append(ts(400, y + 18, note, size=10.5, color=MUTED))
    b.append(circle(392, 116, 5, fill=ACCENT, opacity=0.7))
    b.append(ts(26, 352, "壓得越多，Makeup Gain 補回來的雜訊也越多——這是壓縮的隱性成本。", size=11))
    b.append(ts(26, h - 18, "先聽「尾巴變長還是變短」，比盯著增益衰減表有用。", size=11))
    return w, h, "壓縮器的轉換曲線", "Threshold 以上，輸入與輸出的斜率改變", "\n".join(b), None


# ── 第 16 堂：頻率遮蔽 ───────────────────────────────────────────────
def fig_masking():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "兩個聲音搶同一段頻率時，比較小的那個會被藏起來——不是變小聲，是聽不見。", size=12))
    x0, y0, pw, ph = 70, 120, 520, 140
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    import math
    pts1 = []
    pts2 = []
    for i in range(201):
        f = i / 200
        v1 = math.exp(-((f - 0.35) ** 2) / 0.012)
        v2 = 0.62 * math.exp(-((f - 0.40) ** 2) / 0.010)
        pts1.append(f"{x0 + pw * f:.1f} {y0 + ph - 110 * v1:.1f}")
        pts2.append(f"{x0 + pw * f:.1f} {y0 + ph - 110 * v2:.1f}")
    b.append(path("M" + " L".join(pts1), cls="acc", sw=1.9))
    b.append(path("M" + " L".join(pts2), cls="blue", sw=1.9))
    b.append(ts(x0 + pw * 0.35, y0 + 18, "主唱", size=10.5, anchor="middle", color=ACCENT))
    b.append(ts(x0 + pw * 0.46, y0 + 40, "吉他（被遮住）", size=10.5, anchor="middle", color=BLUE))
    b.append(rect(x0 + pw * 0.28, y0 + ph - 4, pw * 0.22, 10, fill=RED, opacity=0.28, rx=3))
    b.append(ts(x0 + pw * 0.39, y0 + ph + 22, "重疊區", size=10, anchor="middle", color=RED))
    b.append("\n".join(steps(70, 292, [
        ("先找誰被遮住", "獨奏每一軌，找出「消失的那個」"),
        ("再讓路", "被遮住的那軌在重疊區挖 2–4 dB"),
        ("必要時換位置", "聲像左右分開、或換八度"),
    ], gap=34)))
    return w, h, "頻率遮蔽", "兩條曲線重疊的地方，小的一方消失", "\n".join(b), None


# ── 第 17 堂：平行與串聯 ─────────────────────────────────────────────
def fig_parallel_serial():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "串聯＝一關接一關；平行＝複製一份走別的路，最後混回去。", size=12))
    b.append(t(60, 116, "串聯（Serial）", size=12.5, weight=700))
    for i, name in enumerate(["人聲", "EQ", "壓縮", "飽和"]):
        x = 60 + i * 108
        b.append(rect(x, 132, 88, 46, fill=PANEL, stroke=ACCENT, rx=6))
        b.append(t(x + 44, 160, name, size=11, anchor="middle"))
        if i < 3:
            b.append(arrow(x + 90, 155, x + 104, 155, "muted", 5))
    b.append(ts(60, 196, "每一關都會聽到前一關的結果，錯誤會被放大。", size=10.5, color=MUTED))
    b.append(t(60, 236, "平行（Parallel）", size=12.5, weight=700))
    b.append(rect(60, 252, 88, 40, fill=PANEL, stroke=BLUE, rx=6))
    b.append(t(104, 277, "人聲", size=11, anchor="middle"))
    b.append(path("M148 272 L196 272 L196 252", cls="blue", sw=1.6))
    b.append(path("M148 272 L196 272 L196 292", cls="blue", sw=1.6))
    b.append(rect(200, 228, 100, 44, fill=BLUE_SOFT, stroke=BLUE, rx=6))
    b.append(t(250, 254, "壓縮（重）", size=10.5, anchor="middle"))
    b.append(rect(200, 290, 100, 44, fill=PANEL, stroke=LINE, rx=6))
    b.append(t(250, 316, "乾訊號", size=10.5, anchor="middle"))
    b.append(arrow(304, 250, 350, 268, "muted", 5))
    b.append(arrow(304, 312, 350, 288, "muted", 5))
    b.append(rect(354, 258, 96, 40, fill=GREEN_SOFT, stroke=GREEN, rx=6))
    b.append(t(402, 283, "混合", size=11, anchor="middle"))
    b.append(ts(470, 250, "平行的好處：", size=10.5, color=INK))
    b.append(ts(470, 268, "可以推到很誇張，", size=10.5, color=MUTED))
    b.append(ts(470, 284, "再用乾訊號稀釋回來。", size=10.5, color=MUTED))
    b.append(ts(26, h - 18, "串聯處理順序會改變結果；平行處理的量比順序重要。", size=11))
    return w, h, "串聯與平行壓縮", "一關接一關，還是另開一條路", "\n".join(b), None


# ── 第 18 堂：多頻段 ────────────────────────────────────────────────
def fig_multiband():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "先把頻譜切成幾段，各自壓縮，再合起來——問題才不會被別段蓋掉。", size=12))
    bands = [("低頻 20–120 Hz", "控制貝斯與大鼓的起伏", BLUE, 0.28),
             ("中低 120–800 Hz", "處理箱音與悶感", GREEN, 0.28),
             ("中高 800–4k", "修人聲與吉他的前傾", ACCENT, 0.24),
             ("高頻 4k–20k", "馴服齒音與鈸", RED, 0.20)]
    x0 = 70
    for i, (name, note, col, frac) in enumerate(bands):
        wid = 500 * frac
        x = x0
        b.append(rect(x, 118, wid, 40, fill=col, rx=4, opacity=0.3, stroke=col, sw=1.2))
        b.append(ts(x + wid / 2, 143, name.split(" ")[0], size=10.5, anchor="middle"))
        b.append(ts(x + 6, 178, note, size=9.5, color=MUTED))
        if i < 3:
            b.append(path(f"M{x + wid} 118 L{x + wid} 250", cls="thin", dash="3 3"))
        x0 += wid
    b.append(path("M70 250 L570 250", cls="thin"))
    b.append(ts(70, 274, "分頻點（crossover）：預設 120 Hz／800 Hz／4 kHz 是多數素材的起點。", size=10.5))
    b.append(box(70, 294, 220, 54, "什麼時候用", "某一段一直失控、其他段好好的", tint=GREEN_SOFT))
    b.append(box(320, 294, 230, 54, "什麼時候別用", "整首平均時只多一個相位問題", tint=RED_SOFT))
    return w, h, "多頻段壓縮的分頻", "先把問題隔離，再各自處理", "\n".join(b), None


# ── 第 19 堂：諧波 ──────────────────────────────────────────────────
def fig_harmonics():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "飽和不是變大聲，是往上長出原本沒有的泛音。", size=12))
    base_y = 300
    heights = [150 / (i + 1) for i in range(8)]
    b.append(ts(80, 116, "未飽和：只有基音與少量泛音", size=11))
    b.append(ts(80, 150, "輕微飽和後（示意）", size=11, color=RED))
    for i in range(8):
        x = 80 + i * 66
        add = 60 / (i + 1.4)
        b.append(rect(x, base_y - heights[i], 36, heights[i], fill=ACCENT, opacity=0.30, rx=3))
        b.append(ts(x + 18, base_y + 18, f"{i + 1}f", size=9.5, anchor="middle", color=MUTED))
        b.append(rect(x, base_y - add, 36, add, fill=RED, opacity=0.28, rx=3))
    b.append(path(f"M60 {base_y} L600 {base_y}", cls="thin"))
    b.append(box(70, 330, 240, 40, "偶次泛音", "聽起來厚、像加了低八度", tint=BLUE_SOFT))
    b.append(box(330, 330, 240, 40, "奇次泛音", "聽起來亮、有攻擊性", tint=ACCENT_SOFT))
    return w, h, "飽和如何改變泛音結構", "總電平不變，泛音比例變了", "\n".join(b), None


# ── 第 20 堂：Reverb 架構 ───────────────────────────────────────────
def fig_reverb_architecture():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "用 Send/Return：同一個空間給很多軌共用，才不會各彈各的。", size=12))
    b.append(box(60, 112, 120, 52, "人聲", "Send −12 dB", tint=ACCENT_SOFT))
    b.append(box(60, 178, 120, 52, "吉他", "Send −18 dB", tint=ACCENT_SOFT))
    b.append(box(60, 244, 120, 52, "鼓", "Send −24 dB", tint=ACCENT_SOFT))
    b.append(rect(250, 158, 150, 96, fill=GREEN_SOFT, stroke=GREEN, rx=8, sw=1.5))
    b.append(t(325, 186, "Reverb Return", size=11.5, anchor="middle", weight=700))
    b.append(ts(325, 206, "Pre-delay 20 ms", size=10, anchor="middle"))
    b.append(ts(325, 222, "Decay 1.8 s", size=10, anchor="middle"))
    b.append(ts(325, 238, "High-cut 8 kHz", size=10, anchor="middle"))
    for y in (138, 204, 270):
        b.append(path(f"M180 {y} L246 {y} L246 206", cls="blue", sw=1.4, opacity=0.8))
    b.append(arrow(400, 206, 460, 206, "muted", 6))
    b.append(box(464, 180, 130, 52, "混音總線", "乾＋濕一起", tint=BLUE_SOFT))
    b.append(ts(26, 330, "Pre-delay 越長，聲音越「離開」原音；Decay 越長，空間越大。", size=11))
    b.append(ts(26, 352, "多個 Reverb 各自對應不同空間：近的、遠的、只給鼓的。", size=11, color=MUTED))
    b.append(ts(26, h - 18, "Return 上也掛 EQ：把 300 Hz 以下切掉，殘響才不會糊住低頻。", size=11))
    return w, h, "Send/Return 的殘響架構", "一條匯流排，多軌共用同一個空間", "\n".join(b), None


# ── 第 21 堂：Delay ────────────────────────────────────────────────
def fig_delay_types():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "Delay 的時間決定它是「加厚」還是「回聲」；低於 30 ms 就聽成同一個聲音。", size=12))
    rows = [
        ("Haas / 加厚", "10–30 ms", "聽不出回聲，只覺得聲音變寬", BLUE, [14, 22, 30]),
        ("Slapback", "60–120 ms", "搖滾與鄉村的人聲經典", ACCENT, [80, 160, 240]),
        ("拍點同步", "1/8、1/4、dotted", "跟節奏咬合，記得轉 Low-cut", GREEN, [120, 240, 360]),
        ("Ping-pong", "左右交替", "把單聲道東西放到兩側", INK2, [100, 200, 300]),
    ]
    for i, (name, time, note, col, echoes) in enumerate(rows):
        y = 116 + i * 60
        b.append(t(60, y + 4, name, size=11.5, weight=700, color=col))
        b.append(ts(60, y + 22, f"{time}　{note}", size=9.5, color=MUTED))
        for j, e in enumerate(echoes):
            x = 330 + j * 78
            op = 0.75 - j * 0.18
            if name == "Ping-pong":
                yy = y - 8 if j % 2 == 0 else y + 8
            else:
                yy = y
            b.append(circle(x, yy, 6, fill=col, opacity=max(0.15, op)))
            if j < len(echoes) - 1:
                nx = 330 + (j + 1) * 78
                ny = y - 8 if (j + 1) % 2 == 0 else y + 8
                if name != "Ping-pong":
                    ny = y
                b.append(path(f"M{x + 6} {yy} L{nx - 8} {ny}", cls="thin"))
    b.append(ts(26, h - 18, "Delay 一定加 Low-cut：低頻重複會把混音拖垮。", size=11))
    return w, h, "四種 Delay 的用途", "差別在時間長度與左右安排", "\n".join(b), None


# ── 第 22 堂：調變 ────────────────────────────────────────────────
def fig_modulation():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "三者都在「週期性地改變時間或相位」，差別在延遲長度與迴授。", size=12))
    import math
    specs = [("Chorus", "20–30 ms 延遲＋緩慢 LFO", "加厚、變寬", BLUE, 0.08),
             ("Flanger", "1–10 ms 延遲＋迴授", "噴射機、金屬掃頻", RED, 0.02),
             ("Phaser", "全通濾波＋相位", "溫柔的漩渦", GREEN, 0.2)]
    for i, (name, how, hear, col, depth) in enumerate(specs):
        x = 40 + i * 206
        y = 104
        b.append(rect(x, y, 190, 150, fill=PANEL, stroke=LINE, rx=6))
        b.append(t(x + 12, y + 22, name, size=12.5, weight=700, color=col))
        b.append(ts(x + 12, y + 40, how, size=9))
        b.append(ts(x + 12, y + 56, hear, size=9.5, color=MUTED))
        pts = []
        for k in range(61):
            f = k / 60
            v = math.sin(2 * math.pi * (f * 3 + i)) * (0.5 - depth) + 0.5
            pts.append(f"{x + 12 + 166 * f:.1f} {y + 130 - 52 * v:.1f}")
        b.append(path("M" + " L".join(pts), cls={BLUE: "blue", RED: "red", GREEN: "green"}[col], sw=1.7))
        b.append(path(f"M{x + 12} {y + 130} L{x + 178} {y + 130}", cls="thin"))
    b.append(ts(26, 286, "放在訊號鏈太前面，會讓後面的壓縮器與 EQ 抓不準；通常擺在飽和之後、殘響之前。", size=11))
    b.append(ts(26, 314, "Mono 相容性：Chorus 與 Flanger 相加成單聲道時，有些東西會消失。", size=11, color=MUTED))
    b.append(ts(26, h - 18, "Rate 慢（0.2–1 Hz）＝寬；快（3–8 Hz）＝明顯的效果音。", size=11))
    return w, h, "Chorus、Flanger、Phaser", "同樣是 LFO，改的是不同的參數", "\n".join(b), None


# ── 第 23 堂：人聲鏈 ──────────────────────────────────────────────
def fig_vocal_chain():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "順序會決定結果：先修掉問題，再雕塑音色，最後才加空間。", size=12))
    chain = [
        ("Trim", "先對齊電平"),
        ("High-pass", "80–120 Hz"),
        ("動態 EQ", "只壓特定頻段"),
        ("壓縮", "3–6 dB 衰減"),
        ("De-ess", "6–9 kHz"),
        ("EQ 雕塑", "加法為主"),
        ("飽和", "可選"),
        ("空間", "Send 出去"),
    ]
    for i, (name, note) in enumerate(chain):
        x = 50 + (i % 4) * 148
        y = 110 + (i // 4) * 84
        b.append(rect(x, y, 132, 60, fill=PANEL, stroke=ACCENT, rx=8, sw=1.3))
        b.append(t(x + 12, y + 24, name, size=11.5, weight=700))
        b.append(ts(x + 12, y + 43, note, size=9.5, color=MUTED))
        if i % 4 != 3:
            b.append(arrow(x + 134, y + 30, x + 146, y + 30, "muted", 5))
        elif i == 3:
            b.append(path(f"M{x + 66} {y + 62} L{x + 66} {y + 80}", cls="thin"))
    b.append(box(60, 300, 240, 52, "去齒音擺在壓縮後", "壓縮會把齒音一起拉起來", tint=RED_SOFT))
    b.append(box(330, 300, 250, 52, "空間效果永遠最後", "前面的處理不該被殘響糊掉", tint=GREEN_SOFT))
    b.append(ts(26, h - 18, "同樣的鏈不等於同樣的聲音：每個參數都要對著這首歌調。", size=11))
    return w, h, "流行人聲的處理鏈", "從修問題到加空間，順序不能顛倒", "\n".join(b), None


# ── 第 24 堂：後搖滾動態弧 ────────────────────────────────────────
def fig_dynamic_arc():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "後搖滾的張力來自「前面願意小」；爆點之前的留白是設計，不是沒錄好。", size=12))
    x0, y0, pw, ph = 70, 290, 520, 180
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    sections = [("前奏", 0.0, 0.18, 0.16), ("主歌", 0.18, 0.38, 0.3), ("堆疊", 0.38, 0.62, 0.55),
                ("爆點", 0.62, 0.82, 1.0), ("尾聲", 0.82, 1.0, 0.34)]
    for name, a, c, level in sections:
        xa, xb = x0 + pw * a, x0 + pw * c
        bh = ph * level * 0.9
        b.append(rect(xa + 3, y0 - bh, xb - xa - 6, bh, fill=ACCENT, opacity=0.16, rx=4))
        b.append(ts((xa + xb) / 2, y0 + 24, name, size=10.5, anchor="middle", color=MUTED))
    b.append(ts(26, 340, "混音上：爆點的音量不是「推大」，而是前面把動態留出來，讓同一條總線有東西可放。", size=11))
    b.append(ts(26, h - 18, "整首的最大值通常出現在最後一次爆點；前面的爆點要比它小 1–2 dB。", size=11))
    return w, h, "後搖滾的動態弧", "五段結構，爆點靠前面的留白撐起來", "\n".join(b), None


# ── 第 25 堂：Ambient 分層 ──────────────────────────────────────
def fig_ambient_layers():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "環境音樂不是「什麼都沒有」，是很多層各做一點事。", size=12))
    layers = [("高頻空氣", "shimmer、磁帶嘶聲", 0.9, BLUE),
              ("中頻旋律", "主奏 pad、口風琴", 0.72, ACCENT),
              ("和聲底", "長音 pad、人聲片段", 0.55, GREEN),
              ("低頻 drone", "持續的低音，幾乎不變", 0.3, INK2)]
    for i, (name, note, level, col) in enumerate(layers):
        y = 122 + i * 56
        b.append(rect(70, y, 360 * level + 60, 40, fill=col, rx=6, opacity=0.22, stroke=col, sw=1.2))
        b.append(t(84, y + 25, name, size=11.5, weight=700))
        b.append(ts(430, y + 25, note, size=10, color=MUTED))
    b.append(ts(26, 340, "每一層都要有動作（緩慢的濾波掃頻、音量漂移），否則聽起來只是靜止的合成器。", size=11))
    b.append(ts(26, h - 18, "殘響是主樂器：長 decay、低 high-cut、送出去之前先把 200 Hz 以下切掉。", size=11))
    return w, h, "環境音樂的四層", "每一層只負責一件事", "\n".join(b), None


# ── 第 26 堂：Automation ────────────────────────────────────────
def fig_automation_curve():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "自動化曲線就是「這一軌在每一秒該多大聲」；畫得越像人，聽起來越自然。", size=12))
    x0, y0, pw, ph = 70, 200, 520, 104
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(ts(x0, y0 - 8, "0 dB", size=9, color=MUTED))
    b.append(ts(x0, y0 + ph + 18, "−∞", size=9, color=MUTED))
    import math
    pts = []
    for i in range(161):
        f = i / 160
        v = 0.55 + 0.12 * math.sin(f * 7) + (0.28 if 0.42 < f < 0.72 else 0)
        v = min(0.95, max(0.1, v))
        pts.append(f"{x0 + pw * f:.1f} {y0 + ph - ph * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="acc", sw=1.9))
    b.append(ts(x0 + pw * 0.55, y0 - 8, "副歌：+2 dB", size=9.5, color=ACCENT, anchor="middle"))
    b.append(ts(x0 + pw * 0.15, y0 + ph + 22, "主歌：−1.5 dB", size=9.5, color=MUTED, anchor="middle"))
    b.append(box(70, 326, 250, 40, "線性 vs 曲線", "人耳對直的斜線很敏感", tint=GREEN_SOFT))
    b.append(box(340, 326, 250, 40, "Clip gain vs automation", "修問題用 clip gain，表情用 automation", tint=BLUE_SOFT))
    return w, h, "音量自動化", "把「這一段要多大聲」畫成一條線", "\n".join(b), None


# ── 第 27 堂：母帶鏈 ──────────────────────────────────────────
def fig_master_chain():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "母帶是「最後一次全域調整」；鏈越長，前一步的錯誤越難救。", size=12))
    chain = [("參考檢查", "先聽，不動手"), ("EQ", "極輕微的整體平衡"), ("多頻段壓縮", "可選"),
             ("限縮 Limiter", "最後一道"), ("LUFS 檢查", "對平台目標")]
    for i, (name, note) in enumerate(chain):
        x = 46 + i * 118
        b.append(rect(x, 130, 106, 66, fill=PANEL, stroke=BLUE, rx=8, sw=1.3))
        b.append(t(x + 10, 156, name, size=11, weight=700))
        b.append(ts(x + 10, 176, note, size=9, color=MUTED))
        if i < 4:
            b.append(arrow(x + 108, 163, x + 116, 163, "muted", 5))
    b.append(ts(26, 236, "Master bus 不是「把聲音變好聽」的地方，是「確認整首一致」的地方。", size=11.5))
    b.append(ts(26, 262, "若某一軌在總線上必須靠大量處理才站得住，問題在混音，不在母帶。", size=11, color=MUTED))
    b.append(box(46, 296, 180, 60, "該自己做的", "單曲、EP、預算有限", tint=GREEN_SOFT))
    b.append(box(246, 296, 180, 60, "該交給別人", "專輯、發行、需要第二雙耳朵", tint=ACCENT_SOFT))
    b.append(box(446, 296, 180, 60, "留 headroom", "交給母帶師前峰值 −6 dBFS", tint=BLUE_SOFT))
    return w, h, "Master Bus 的處理順序", "每一站都只做一點，合起來才成立", "\n".join(b), None


# ── 第 28 堂：LUFS 與限縮 ────────────────────────────────────
def fig_loudness_limiter():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "LUFS 量的是「人耳感受的整體響度」，不是峰值；同一首歌可以很大聲卻不刺。", size=12))
    targets = [("Spotify / YouTube", "−14 LUFS"), ("Apple Music", "−16 LUFS"),
               ("Podcast", "−16 LUFS"), ("廣播（EBU R128）", "−23 LUFS")]
    for i, (name, val) in enumerate(targets):
        y = 112 + i * 34
        b.append(t(60, y, name, size=11))
        b.append(ts(360, y, val, size=11, color=ACCENT, anchor="end"))
        b.append(path("M60 {0} L360 {0}".format(y + 8), cls="thin", dash="2 4"))
    b.append(ts(60, 268, "True Peak 要留在 −1 dBTP 以下，串流轉檔才不會爆。", size=11, color=RED))
    x0, y0, pw, ph = 400, 112, 210, 150
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(path(f"M{x0} {y0 + ph - 20} L{x0 + pw} {y0 + ph - 20}", cls="thin"))
    b.append(path(f"M{x0} {y0 + 26} L{x0 + pw} {y0 + 26}", cls="thin", dash="3 3"))
    b.append(ts(x0 + 4, y0 + 20, "0 dBFS", size=9, color=MUTED))
    for i in range(9):
        hgt = 20 + i * 12
        b.append(rect(x0 + 18 + i * 20, y0 + ph - 20 - hgt, 12, hgt, fill=ACCENT, opacity=0.35, rx=2))
    b.append(ts(x0 + pw / 2, y0 + ph + 18, "限縮後的波形", size=9.5, anchor="middle"))
    b.append(ts(26, 340, "限縮到 −14 LUFS 通常只掉 2–4 dB；要再大聲，通常是混音階段就有問題。", size=11))
    b.append(ts(26, h - 18, "大聲不等於好聽：串流平台會把過大的母帶轉小，你的動態反而被吃掉。", size=11, color=MUTED))
    return w, h, "LUFS 與限縮", "響度標準與 True Peak 的關係", "\n".join(b), None


# ── 第 29 堂：分析工具 ───────────────────────────────────────
def fig_analysis_meter():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "三種儀表看三件事：頻譜看平衡、相位看單聲道相容、測角儀看立體聲寬度。", size=12))
    # 頻譜
    x0, y0, pw, ph = 50, 120, 180, 140
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(t(x0 + 8, y0 + 18, "頻譜儀", size=11, weight=700))
    import math
    pts = []
    for i in range(81):
        f = i / 80
        v = math.exp(-((f - 0.18) ** 2) / 0.02) * 0.9 + math.exp(-((f - 0.62) ** 2) / 0.006) * 0.5
        pts.append(f"{x0 + 6 + (pw - 12) * f:.1f} {y0 + ph - 14 - (ph - 40) * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="blue", sw=1.5))
    b.append(ts(x0 + 8, y0 + ph - 4, "20 Hz", size=8, color=MUTED))
    b.append(ts(x0 + pw - 8, y0 + ph - 4, "20 kHz", size=8, color=MUTED, anchor="end"))
    # 相位
    x1 = 250
    b.append(rect(x1, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(t(x1 + 8, y0 + 18, "相位相關", size=11, weight=700))
    b.append(rect(x1 + 10, y0 + 74, pw - 20, 16, fill=GREEN_SOFT, rx=3))
    b.append(rect(x1 + 10 + (pw - 20) * 0.45, y0 + 74, (pw - 20) * 0.55, 16, fill=RED_SOFT, rx=3, opacity=0.7))
    b.append(rect(x1 + 10 + (pw - 20) * 0.62, y0 + 68, 3, 28, fill=INK))
    b.append(ts(x1 + 8, y0 + 108, "+1", size=8, color=MUTED))
    b.append(ts(x1 + pw - 8, y0 + 108, "−1", size=8, color=MUTED, anchor="end"))
    b.append(ts(x1 + pw / 2, y0 + 126, "指標停在右半邊＝可能抵消", size=9, anchor="middle", color=RED))
    # 測角儀
    x2 = 450
    b.append(rect(x2, y0, 160, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(t(x2 + 8, y0 + 18, "測角儀", size=11, weight=700))
    b.append(circle(x2 + 80, y0 + 90, 48, fill="none", stroke=LINE))
    b.append(path(f"M{x2 + 80} {y0 + 42} L{x2 + 80} {y0 + 138}", cls="thin", dash="2 3"))
    for dx, dy in [(-18, -20), (14, -12), (-6, 6), (22, 18), (2, -30)]:
        b.append(circle(x2 + 80 + dx, y0 + 90 + dy, 2.2, fill=BLUE, opacity=0.7))
    b.append(ts(x2 + 8, y0 + ph - 6, "越寬＝越立體", size=8.5, color=MUTED))
    b.append(ts(26, 306, "儀表是輔助，不是判決：頻譜好看但聽起來扁，就是耳朵對。", size=11.5))
    b.append(ts(26, 332, "A/B 測試：音量先對齊，不然大聲的那個永遠贏。", size=11.5, color=MUTED))
    b.append(ts(26, h - 18, "每次只改一件事，改完再 A/B；一次改三樣，你分不出是哪一項有效。", size=11))
    return w, h, "三種分析儀表", "頻譜、相位、測角儀各自回答一個問題", "\n".join(b), None


# ── 第 30 堂：Dither 與輸出 ──────────────────────────────────
def fig_dither_quantize():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "位元深度下降時，低電平的細節會被四捨五入成階梯；Dither 用極小的雜訊把階梯換成平滑。", size=12))
    x0, y0, pw, ph = 60, 120, 250, 130
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(t(x0 + 8, y0 + 18, "沒有 Dither", size=10.5, weight=700, color=RED))
    import math
    pts = []
    for i in range(81):
        f = i / 80
        v = math.sin(2 * math.pi * f * 2) * 0.5 + 0.5
        q = round(v * 6) / 6
        pts.append(f"{x0 + 10 + (pw - 20) * f:.1f} {y0 + ph - 16 - (ph - 44) * q:.1f}")
    b.append(path("M" + " L".join(pts), cls="red", sw=1.5))
    x1 = 350
    b.append(rect(x1, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(t(x1 + 8, y0 + 18, "有 Dither", size=10.5, weight=700, color=GREEN))
    pts = []
    for i in range(121):
        f = i / 120
        v = math.sin(2 * math.pi * f * 2) * 0.5 + 0.5
        q = round(v * 6) / 6
        jitter = (0.5 - ((i * 7919) % 100) / 100) * 0.06
        pts.append(f"{x1 + 10 + (pw - 20) * f:.1f} {y0 + ph - 16 - (ph - 44) * (q + jitter):.1f}")
    b.append(path("M" + " L".join(pts), cls="green", sw=1.2, opacity=0.9))
    b.append(box(60, 272, 250, 52, "24-bit 混音 → 16-bit 交付", "只在最後一次輸出時做", tint=ACCENT_SOFT))
    b.append(box(330, 272, 270, 52, "32-bit float 內部處理", "不需要也不會壞，但別重複加", tint=BLUE_SOFT))
    b.append(ts(26, h - 18, "Dither 只能加一次，且要在降位元深度的那一步；加兩次等於多一層雜訊。", size=11))
    return w, h, "Dither 在做什麼", "把量化階梯換成聽起來像底噪的隨機抖動", "\n".join(b), None


# ── 追加圖（第二批）────────────────────────────────────────────────────

def fig_mic_types():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "同一句話，兩種麥克風收到的是不同版本；差別在靈敏度與耐音壓。", size=12))
    specs = [("動圈 Dynamic", "靈敏度低、耐音壓高、不用供電", ACCENT, 0.45),
             ("電容 Condenser", "靈敏度高、細節多、要 +48V", BLUE, 0.95)]
    for i, (name, note, col, reach) in enumerate(specs):
        x = 60 + i * 290
        b.append(rect(x, 108, 250, 150, fill=PANEL, stroke=col, rx=8, sw=1.5))
        b.append(t(x + 14, 132, name, size=12.5, weight=700, color=col))
        b.append(ts(x + 14, 152, note, size=9.5, color=MUTED))
        cx, cy = x + 60, 210
        b.append(circle(cx, cy, 18, fill=INK, opacity=0.8))
        for k in range(4):
            b.append(path(f"M{cx + 20} {cy - 12 + k * 8} q{40 * reach:.0f} {-6 + k * 4} {80 * reach:.0f} 0",
                          cls="thin", dash="3 3"))
        b.append(ts(x + 96, 238, "收音範圍", size=9))
        b.append(ts(x + 96, 252, f"約 {int(reach * 100)}%", size=10, color=col))
    b.append(box(60, 280, 250, 56, "房間吵、要錄鼓與吉他音箱", "先買動圈", tint=ACCENT_SOFT))
    b.append(box(340, 280, 260, 56, "房間安靜、要錄細膩人聲", "再買電容", tint=BLUE_SOFT))
    b.append(ts(26, h - 18, "電容麥克風錄到的是「房間＋人聲」；房間不好，它會誠實地告訴你。", size=11))
    return w, h, "動圈與電容麥克風", "靈敏度決定它聽見多少房間", chr(10).join(b), None


def fig_headphone_types():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "封閉式擋住漏音、開放式聽得自然；錄音與混音要的是不同的東西。", size=12))
    for i, (name, note, col, open_) in enumerate([
            ("封閉式 Closed-back", "耳罩密封，聲音不會漏出去", ACCENT, False),
            ("開放式 Open-back", "耳罩有孔，聲音像喇叭自然", GREEN, True)]):
        x = 60 + i * 300
        b.append(rect(x, 110, 260, 120, fill=PANEL, stroke=col, rx=8, sw=1.5))
        b.append(t(x + 14, 134, name, size=12, weight=700, color=col))
        b.append(ts(x + 14, 154, note, size=9.5, color=MUTED))
        cx, cy = x + 60, 196
        b.append(path(f"M{cx - 25} {cy} a25 25 0 1 1 50 0", cls="ink"))
        b.append(rect(cx - 32, cy - 4, 16, 30, fill=col, rx=4, opacity=0.35))
        b.append(rect(cx + 16, cy - 4, 16, 30, fill=col, rx=4, opacity=0.35))
        if open_:
            for k in range(3):
                b.append(circle(cx - 24 + k * 4, cy + 12, 2, fill=BG))
        b.append(ts(x + 120, 196, "漏音", size=9.5))
        b.append(ts(x + 120, 214, "低" if not open_ else "高", size=11, color=col))
    b.append(box(60, 252, 250, 56, "錄音時戴封閉式", "伴奏不會被麥克風收進去", tint=ACCENT_SOFT))
    b.append(box(340, 252, 260, 56, "混音時用開放式或喇叭", "長時間聽不壓迫，空間感正確", tint=GREEN_SOFT))
    b.append(ts(26, h - 18, "藍牙耳機不能用：延遲與音染都會讓你對不準、判斷錯。", size=11))
    return w, h, "封閉式與開放式耳機", "一個用來錄，一個用來聽", chr(10).join(b), None


def fig_first_reflection():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "鏡子法：坐在位置上，哪裡能從鏡中看到喇叭，那裡就是第一反射點。", size=12))
    b.append(rect(80, 122, 500, 168, fill=PANEL, stroke=LINE, rx=4))
    b.append(rect(80, 122, 500, 10, fill=INK, opacity=0.25))
    b.append(ts(330, 116, "側牆與背牆", size=10, anchor="middle", color=MUTED))
    b.append(circle(330, 250, 8, fill=ACCENT))
    b.append(ts(330, 274, "耳朵", size=10, anchor="middle"))
    b.append(circle(180, 150, 7, fill=BLUE))
    b.append(circle(480, 150, 7, fill=BLUE))
    b.append(ts(180, 136, "喇叭 L", size=9.5, anchor="middle", color=BLUE))
    b.append(ts(480, 136, "喇叭 R", size=9.5, anchor="middle", color=BLUE))
    for sx, rx_, tx in ((180, 100, 275), (480, 560, 385)):
        b.append(path(f"M{sx} 158 L{rx_} 172", cls="thin"))
        b.append(path(f"M{rx_} 172 L{tx} 244", cls="thin"))
        b.append(circle(rx_, 172, 5, fill=RED))
    b.append(ts(120, 196, "反射點", size=10, color=RED))
    b.append(ts(544, 196, "反射點", size=10, color=RED, anchor="end"))
    b.append(ts(26, 320, "反射點上放吸音板，比把整面牆貼滿有效得多。", size=11.5))
    b.append(ts(26, h - 18, "背牆也一樣：喇叭後方與耳朵後方都會有反射，先處理最近的兩個。", size=11))
    return w, h, "找出第一反射點", "鏡子看得到喇叭的位置，就是吸音該放的位置", chr(10).join(b), None


def fig_absorber_diffuser():
    w, h = 660, 370
    b = []
    b.append(ts(26, 84, "吸音把能量吃掉，擴散把能量打散；兩種都要，不是越多越好。", size=12))
    for i, (name, note, col, kind) in enumerate([
            ("吸音 Absorber", "厚布料、泡棉、低頻陷阱", ACCENT, "absorb"),
            ("擴散 Diffuser", "格柵、書櫃、不規則表面", GREEN, "diffuse")]):
        x = 60 + i * 300
        b.append(rect(x, 110, 260, 160, fill=PANEL, stroke=col, rx=8, sw=1.4))
        b.append(t(x + 14, 134, name, size=12, weight=700, color=col))
        b.append(ts(x + 14, 154, note, size=9.5, color=MUTED))
        bx = x + 130
        b.append(rect(bx - 6, 168, 12, 84, fill=col, opacity=0.25, rx=2))
        for k in range(3):
            y = 186 + k * 24
            if kind == "absorb":
                b.append(arrow(bx - 60, y, bx - 10, y, "muted", 5))
                b.append(path(f"M{bx - 6} {y} l10 -4", cls="thin"))
            else:
                b.append(arrow(bx - 60, y, bx - 10, y, "muted", 5))
                for dy in (-14, 0, 14):
                    b.append(arrow(bx + 8, y, bx + 62, y + dy, "green", 4))
    b.append(box(60, 290, 250, 52, "小房間先吸音", "處理 100–300 Hz 與早期反射", tint=ACCENT_SOFT))
    b.append(box(340, 290, 260, 52, "空間夠大才擴散", "否則只是把問題彈回來", tint=GREEN_SOFT))
    return w, h, "吸音與擴散", "一個減少反射，一個讓反射變得均勻", chr(10).join(b), None


def fig_nyquist_alias():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "取樣率不夠時，高頻不會消失，而是「折返」成一個不存在的低頻。", size=12))
    import math
    x0, y0, pw = 80, 150, 480
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    b.append(ts(x0, y0 + 24, "實際頻率 →", size=10))
    for f, name, col in [(0.35, "真實訊號", BLUE), (0.85, "超過 Nyquist", RED)]:
        pts = []
        for i in range(81):
            px = x0 + pw * i / 80
            py = y0 - 26 * math.sin(2 * math.pi * f * i / 8)
            pts.append(f"{px:.1f} {py:.1f}")
        b.append(path("M" + " L".join(pts), cls="blue" if col == BLUE else "red", sw=1.8))
        b.append(ts(x0 + pw * f, y0 - 40, name, size=10, anchor="middle", color=col))
    b.append(path(f"M{x0 + pw * 0.5} {y0} L{x0 + pw * 0.5} {y0 + 60}", cls="thin", dash="4 4"))
    b.append(ts(x0 + pw * 0.5, y0 + 76, "Nyquist（取樣率的一半）", size=10, anchor="middle", color=MUTED))
    b.append(arrow(x0 + pw * 0.85, y0 + 100, x0 + pw * 0.15, y0 + 100, "red", 6))
    b.append(ts(x0 + pw * 0.5, y0 + 124, "折返後的假頻率：聽起來像另一個音", size=10.5, anchor="middle", color=RED))
    b.append(ts(26, 330, "這就是為什麼抗混疊濾波器必須存在，也是 44.1 kHz 選在 20 kHz 兩倍以上的原因。", size=11))
    return w, h, "Nyquist 與折返失真", "取樣率不足時，高頻會變成不存在的低頻", chr(10).join(b), None


def fig_bit_depth_range():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "位元深度決定的是「最安靜能到多小」，不是「最大聲能多大」。", size=12))
    rows = [("16-bit", "96 dB", "約 6.5 萬階", ACCENT, 0.55),
            ("24-bit", "144 dB", "約 1670 萬階", BLUE, 0.8),
            ("32-bit float", "≈ 1528 dB（數學上）", "內部處理用", GREEN, 1.0)]
    for i, (name, dr, steps, col, frac) in enumerate(rows):
        y = 120 + i * 62
        b.append(t(60, y + 6, name, size=12, weight=700, color=col))
        b.append(rect(180, y - 10, 380, 22, fill=PANEL, stroke=LINE, rx=4))
        b.append(rect(180, y - 10, 380 * frac, 22, fill=col, rx=4, opacity=0.30))
        b.append(ts(570, y + 6, dr, size=9.5, color=col, anchor="end"))
        b.append(ts(180, y + 26, steps, size=9, color=MUTED))
    b.append(rect(180, 300, 380, 18, fill=RED_SOFT, rx=4, opacity=0.7))
    b.append(ts(370, 313, "任何一段聽得到的底噪，都會佔掉最底下那幾階", size=9.5, anchor="middle", color=RED))
    b.append(ts(26, h - 18, "錄音用 24-bit：不是為了更大聲，是為了留著後面還能修。", size=11))
    return w, h, "位元深度與動態範圍", "位元數越多，最低的那一階越小", chr(10).join(b), None


def fig_plosive():
    w, h = 660, 370
    b = []
    b.append(ts(26, 84, "「P」「B」噴出的那股氣流撞上振膜，會在低頻留下一個脈衝。", size=12))
    import math
    x0, y0 = 90, 210
    b.append(path(f"M{x0} {y0} L{x0 + 420} {y0}", cls="thin"))
    pts = []
    for i in range(201):
        t = i / 200
        v = math.sin(2 * math.pi * 7 * t) * 0.28
        if 0.42 < t < 0.5:
            v += 0.62 * math.exp(-((t - 0.46) ** 2) / 0.0004)
        pts.append(f"{x0 + 420 * t:.1f} {y0 - 90 * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="acc", sw=1.6))
    b.append(rect(x0 + 420 * 0.42, y0 - 96, 34, 110, fill=RED, opacity=0.13, rx=3))
    b.append(ts(x0 + 420 * 0.46, y0 + 30, "噴麥", size=10, anchor="middle", color=RED))
    b.append(box(60, 268, 250, 54, "防噴罩", "把氣流打散，高頻幾乎不變", tint=GREEN_SOFT))
    b.append(box(340, 268, 260, 54, "麥克風稍微偏 10–15 度", "讓氣流擦過而不是正面撞上", tint=BLUE_SOFT))
    b.append(ts(26, h - 18, "防噴罩擋的是氣流，不是聲音；距離太遠反而失去效果。", size=11))
    return w, h, "噴麥是氣流問題", "波形上是一個低頻脈衝，不是「太大聲」", chr(10).join(b), None


def fig_off_axis():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "正對嘴巴收得最亮、最多唇齒聲；偏一點角度，這兩樣都會少。", size=12))
    cx, cy = 200, 190
    b.append(circle(cx, cy, 26, fill=INK, opacity=0.85))
    b.append(ts(cx, cy + 48, "麥克風", size=10, anchor="middle"))
    import math
    for ang, name, col, cls in [(0, "軸上 0°", ACCENT, "acc"), (15, "偏 15°", GREEN, "green"),
                                (40, "偏 40°", BLUE, "blue")]:
        dx, dy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        b.append(path(f"M{cx + 28 * dx:.0f} {cy + 28 * dy:.0f} L{cx + 150 * dx:.0f} {cy + 150 * dy:.0f}",
                      cls=cls, sw=1.6))
        b.append(ts(cx + 160 * dx + 6, cy + 160 * dy, name, size=10, color=col))
    b.append(box(400, 120, 200, 54, "軸上", "唇齒、鼻音最明顯", tint=ACCENT_SOFT))
    b.append(box(400, 184, 200, 54, "偏 15–20°", "噴麥與齒音都減少", tint=GREEN_SOFT))
    b.append(box(400, 248, 200, 54, "偏 40° 以上", "聲音開始發悶", tint=BLUE_SOFT))
    b.append(ts(26, h - 18, "偏角是取捨：少一點噴麥，就少一點高頻細節。先錄一版聽聽看。", size=11))
    return w, h, "軸上與軸外", "角度換掉的是唇齒與氣流", chr(10).join(b), None


def fig_drum_kit_map():
    w, h = 660, 400
    b = []
    b.append(ts(26, 84, "鼓組收音的麥克風位置：先顧好 kick、snare 與 overheads，其餘再補。", size=12))
    b.append(rect(120, 104, 420, 210, fill=PANEL, stroke=LINE, rx=6))
    positions = [("Kick", 250, 250, "in / out", ACCENT),
                 ("Snare", 320, 200, "top + bottom", GREEN),
                 ("Hi-Hat", 400, 180, "邊緣上方", BLUE),
                 ("Tom 1", 300, 150, "", INK2),
                 ("Tom 2", 370, 150, "", INK2),
                 ("Floor Tom", 430, 240, "", INK2)]
    for name, x, y, note, col in positions:
        b.append(circle(x, y, 16, fill=col, opacity=0.25, stroke=col))
        b.append(ts(x, y + 30, name, size=9, anchor="middle"))
        if note:
            b.append(ts(x, y + 42, note, size=8, anchor="middle", color=MUTED))
    b.append(path("M180 130 L480 130", cls="acc", sw=1.4, dash="4 4"))
    b.append(ts(180, 122, "Overheads（XY 或 AB）", size=9.5, color=ACCENT))
    b.append(circle(150, 180, 7, fill=BLUE))
    b.append(ts(150, 164, "Room", size=9, anchor="middle", color=BLUE))
    b.append(ts(26, 344, "每一支額外的麥克風都會帶來相位問題；先用四支能聽，再加。", size=11))
    b.append(ts(26, h - 18, "Overheads 決定鼓組的整體聲音，close mic 只是補細節。", size=11, color=MUTED))
    return w, h, "鼓組的麥克風地圖", "先有輪廓，再補細節", chr(10).join(b), None


def fig_three_to_one():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "第二支麥克風的距離，至少是第一支到音源的三倍。", size=12))
    src = (110, 220)
    b.append(circle(*src, 12, fill=ACCENT, opacity=0.6))
    b.append(ts(src[0], src[1] + 34, "音源", size=10, anchor="middle"))
    m1 = (200, 220)
    m2 = (420, 220)
    b.append(circle(*m1, 10, fill=INK))
    b.append(circle(*m2, 10, fill=INK))
    b.append(ts(m1[0], m1[1] + 30, "Mic 1（1 倍）", size=9.5, anchor="middle"))
    b.append(ts(m2[0], m2[1] + 30, "Mic 2（≥3 倍）", size=9.5, anchor="middle"))
    b.append(path(f"M{src[0] + 14} {src[1]} L{m1[0] - 12} {m1[1]}", cls="thin"))
    b.append(path(f"M{src[0] + 14} {src[1]} L{m2[0] - 12} {m2[1]}", cls="thin"))
    b.append(ts(155, 208, "d", size=10, color=MUTED))
    b.append(ts(265, 208, "3d 以上", size=10, color=RED))
    b.append(box(60, 268, 250, 52, "為什麼是三倍", "距離差越大，梳狀濾波的凹陷越密", tint=BLUE_SOFT))
    b.append(box(340, 268, 260, 52, "不能只靠耳朵", "相位問題在單聲道監聽下才明顯", tint=ACCENT_SOFT))
    return w, h, "3:1 規則", "兩支麥克風的距離差決定相位問題的密度", chr(10).join(b), None


def fig_vu_vs_peak():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "同一個訊號，VU 表看的是平均值，峰值表看的是那一瞬間。", size=12))
    import math
    x0, y0 = 80, 210
    b.append(path(f"M{x0} {y0} L{x0 + 420} {y0}", cls="thin"))
    pts = []
    for i in range(201):
        t = i / 200
        v = math.sin(2 * math.pi * 9 * t) * 0.35 * math.sin(math.pi * t)
        pts.append(f"{x0 + 420 * t:.1f} {y0 - 100 * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="acc", sw=1.5))
    env = []
    for i in range(201):
        t = i / 200
        env.append(f"{x0 + 420 * t:.1f} {y0 - 100 * 0.35 * math.sin(math.pi * t):.1f}")
    b.append(path("M" + " L".join(env), cls="blue", sw=1.4, dash="5 4"))
    b.append(ts(x0 + 6, y0 - 92, "VU ≈ 這條包絡線", size=9.5, color=BLUE))
    b.append(ts(x0 + 300, y0 - 116, "peak", size=9.5, color=ACCENT))
    b.append(box(60, 258, 250, 54, "VU：接近人耳的感受", "適合看整體平衡", tint=BLUE_SOFT))
    b.append(box(340, 258, 260, 54, "Peak／dBFS：看得到削波風險", "適合看 headroom", tint=ACCENT_SOFT))
    b.append(ts(26, h - 18, "兩個都要看：VU 決定好不好聽，peak 決定會不會爆。", size=11))
    return w, h, "VU 與峰值表", "一個看平均，一個看瞬間", chr(10).join(b), None


def fig_crest_factor():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "Crest factor＝峰值減平均；數字越小，代表動態被壓得越扁。", size=12))
    cases = [("人聲（未壓縮）", "約 12–18 dB", 0.18, ACCENT),
             ("混音總線", "約 8–12 dB", 0.55, BLUE),
             ("已母帶的流行歌", "約 6–9 dB", 0.85, RED)]
    for i, (name, cf, frac, col) in enumerate(cases):
        y = 120 + i * 62
        b.append(t(60, y + 6, name, size=11))
        b.append(rect(210, y - 12, 300, 24, fill=PANEL, stroke=LINE, rx=4))
        b.append(rect(210, y - 12, 300 * frac, 24, fill=col, rx=4, opacity=0.30))
        b.append(ts(214 + 300 * frac, y + 24, cf, size=9.5, color=col))
    b.append(ts(26, 320, "壓縮做得越多，crest factor 越小——聽起來越「貼」，也越沒有呼吸。", size=11))
    b.append(ts(26, h - 18, "混音階段留 10 dB 左右，母帶才有東西可以處理。", size=11, color=MUTED))
    return w, h, "動態餘裕（Crest Factor）", "峰值與平均的差距", chr(10).join(b), None


def fig_punch_in():
    w, h = 660, 340
    b = []
    b.append(ts(26, 84, "Punch In/Out 就是在時間軸上開一個窗口，只重錄那一段。", size=12))
    x0, y0, pw = 70, 170, 520
    for label, y in (("原始 Take", 140), ("Punch 錄音", 210)):
        b.append(ts(x0 - 8, y + 4, label, size=9.5, anchor="end", color=MUTED))
        b.append(rect(x0, y - 22, pw, 44, fill=PANEL, stroke=LINE, rx=4))
    b.append(rect(x0 + pw * 0.35, 118, pw * 0.3, 44, fill=RED, opacity=0.18))
    b.append(rect(x0 + pw * 0.35, 188, pw * 0.3, 44, fill=GREEN, opacity=0.25))
    for f, name in ((0.35, "In"), (0.65, "Out")):
        x = x0 + pw * f
        b.append(path(f"M{x} 108 L{x} 244", cls="red", sw=1.4, dash="4 4"))
        b.append(ts(x, 102, name, size=9.5, anchor="middle", color=RED))
    b.append(ts(x0 + pw * 0.5, 258, "只這一段被新錄音取代，前後保持原樣", size=10, anchor="middle"))
    b.append(ts(26, 300, "錄之前先留兩小節前後緩衝，剪接點比較好處理。", size=11))
    b.append(ts(26, h - 18, "Punch 進去的瞬間要對準拍點，否則會聽到一個接縫。", size=11, color=MUTED))
    return w, h, "Punch In／Out", "時間軸上開一個窗口重錄", chr(10).join(b), None


def fig_noise_floor():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "底噪不是「有雜音」，而是一條一直存在的低電平頻譜。", size=12))
    import math
    x0, y0, pw, ph = 80, 100, 490, 160
    b.append(rect(x0, y0, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    pts = []
    for i in range(121):
        f = i / 120
        v = 0.22 + 0.10 * math.exp(-((f - 0.08) ** 2) / 0.004) + 0.045 * (0.5 - ((i * 37) % 100) / 200)
        pts.append(f"{x0 + pw * f:.1f} {y0 + ph - ph * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="thin", sw=1.4))
    b.append(ts(x0 + 8, y0 + 26, "60 Hz 嗡嗡聲", size=9.5, color=RED))
    b.append(circle(x0 + pw * 0.08, y0 + ph - ph * 0.32, 4, fill=RED))
    b.append(path(f"M{x0 + pw * 0.2} {y0} L{x0 + pw * 0.2} {y0 + ph}", cls="thin", dash="4 4"))
    b.append(ts(x0 + pw * 0.21, y0 + 18, "高通起點", size=9.5, color=GREEN))
    b.append(box(60, 282, 250, 50, "先找來源", "冷氣、變壓器、USB 供電", tint=RED_SOFT))
    b.append(box(340, 282, 260, 50, "再考慮處理", "高通＋降噪，但別把細節一起吃掉", tint=GREEN_SOFT))
    b.append(ts(26, h - 18, "底噪是錄進來就固定的；後面放大，它也一起變大。", size=11))
    return w, h, "底噪長什麼樣子", "一條持續存在、低於訊號的頻譜", chr(10).join(b), None


def fig_comp_lanes():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "Comping 就是從幾條 Take 裡，一段一段挑最好的。", size=12))
    lanes = [("Take 1", [1, 0, 0, 0]), ("Take 2", [0, 1, 0, 1]), ("Take 3", [0, 0, 1, 0])]
    x0, y0, pw = 110, 120, 460
    for i, (name, seg) in enumerate(lanes):
        y = y0 + i * 54
        b.append(ts(x0 - 10, y + 16, name, size=9.5, anchor="end", color=MUTED))
        for k in range(4):
            xa = x0 + pw * k / 4
            chosen = seg[k]
            b.append(rect(xa + 2, y, pw / 4 - 4, 32,
                          fill=GREEN if chosen else PANEL,
                          stroke=LINE, rx=3, opacity=0.35 if chosen else 1))
            if chosen:
                b.append(ts(xa + pw / 8, y + 22, "✓", size=11, anchor="middle", color=GREEN))
    y = y0 + 3 * 54
    b.append(ts(x0 - 10, y + 16, "Comp", size=9.5, anchor="end", color=ACCENT))
    for k in range(4):
        xa = x0 + pw * k / 4
        b.append(rect(xa + 2, y, pw / 4 - 4, 32, fill=ACCENT, rx=3, opacity=0.25))
    b.append(ts(x0 + pw / 2, y + 22, "選定的段落，交界處做 crossfade", size=9.5, anchor="middle"))
    b.append(ts(26, 348, "每一段都聽三次：一次聽音準、一次聽節奏、一次只聽情緒。", size=11))
    b.append(ts(26, h - 18, "交界點放在換氣或子音上，剪接幾乎聽不出來。", size=11, color=MUTED))
    return w, h, "Take 與 Comp", "一條成品由很多小段落組成", chr(10).join(b), None


def fig_warp_modes():
    w, h = 660, 370
    b = []
    b.append(ts(26, 84, "同一段音訊，四種 Warp 模式對「什麼該保留」有不同的答案。", size=12))
    modes = [("Beats", "保留瞬態，適合鼓與打擊", ACCENT, "acc"),
             ("Tones", "保留音高與和聲，適合人聲與貝斯", BLUE, "blue"),
             ("Texture", "保留質感，適合 pad 與環境音", GREEN, "green"),
             ("Re-Pitch", "像改變轉速，音高會跟著變", INK2, "ink")]
    for i, (name, note, col, cls) in enumerate(modes):
        x = 50 + (i % 2) * 300
        y = 112 + (i // 2) * 118
        b.append(rect(x, y, 270, 100, fill=PANEL, stroke=col, rx=8, sw=1.4))
        b.append(t(x + 14, y + 26, name, size=12.5, weight=700, color=col))
        b.append(ts(x + 14, y + 48, note, size=9.5, color=MUTED))
        import math
        pts = []
        for k in range(41):
            f = k / 40
            if name == "Beats":
                v = (1 if (f * 8) % 1 < 0.08 else 0.2) * (1 if k % 2 else -1)
            elif name == "Re-Pitch":
                v = math.sin(2 * math.pi * 4.2 * f) * 0.4
            else:
                v = math.sin(2 * math.pi * 3 * f) * 0.4
            pts.append(f"{x + 16 + 236 * f:.1f} {y + 82 - 20 * v:.1f}")
        b.append(path("M" + " L".join(pts), cls=cls, sw=1.4))
    b.append(ts(26, h - 18, "選錯模式，時間伸縮就會出現金屬聲或雙重瞬態。", size=11))
    return w, h, "四種 Warp 模式", "每一種保留的東西不一樣", chr(10).join(b), None


# ── 追加圖（第三批）────────────────────────────────────────────────────

def fig_pan_law():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "把聲音推到一邊，另一邊不會自動變大——這就是等功率聲像。", size=12))
    x0, y0, pw, ph = 90, 250, 400, 120
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    b.append(ts(x0 - 8, y0 + 4, "L", size=10, anchor="end"))
    b.append(ts(x0 + pw + 8, y0 + 4, "R", size=10))
    b.append(ts(x0 + pw / 2, y0 + 24, "中央", size=9.5, anchor="middle", color=MUTED))
    import math
    left, right = [], []
    for i in range(41):
        f = i / 40
        left.append(f"{x0 + pw * f:.1f} {y0 - ph * math.cos(f * math.pi / 2) * 0.9:.1f}")
        right.append(f"{x0 + pw * f:.1f} {y0 - ph * math.sin(f * math.pi / 2) * 0.9:.1f}")
    b.append(path("M" + " L".join(left), cls="acc", sw=1.8))
    b.append(path("M" + " L".join(right), cls="blue", sw=1.8))
    b.append(ts(x0 + 10, y0 - ph * 0.9 - 6, "左聲道", size=9.5, color=ACCENT))
    b.append(ts(x0 + pw - 10, y0 - ph * 0.9 - 6, "右聲道", size=9.5, color=BLUE, anchor="end"))
    b.append(box(60, 276, 250, 52, "置中", "兩邊等量，中央最實", tint=ACCENT_SOFT))
    b.append(box(340, 276, 260, 52, "推到底", "只剩單邊，另一邊 -∞", tint=BLUE_SOFT))
    return w, h, "等功率聲像", "推到一邊時，另一邊會補上来", chr(10).join(b), None


def fig_frequency_map():
    w, h = 660, 340
    b = []
    b.append(ts(26, 84, "同一個頻譜，不同區段負責不同的「感覺」；先知道自己在調哪一段。", size=12))
    bands = [("Sub", "20–60", "身體感", BLUE, 0.10),
             ("低頻", "60–250", "厚度", GREEN, 0.18),
             ("中低", "250–800", "箱音、悶", ACCENT, 0.22),
             ("中頻", "800–3k", "存在感", INK2, 0.20),
             ("中高", "3k–6k", "清晰、齒音", RED, 0.15),
             ("高頻", "6k–20k", "空氣感", BLUE, 0.15)]
    x = 60
    for name, rng, feel, col, frac in bands:
        wid = 540 * frac
        b.append(rect(x, 120, wid - 2, 44, fill=col, rx=4, opacity=0.25, stroke=col, sw=1.2))
        b.append(ts(x + wid / 2, 147, name, size=10, anchor="middle"))
        b.append(ts(x + wid / 2, 182, rng + " Hz", size=8.5, anchor="middle", color=MUTED))
        b.append(ts(x + wid / 2, 200, feel, size=8.5, anchor="middle", color=MUTED))
        x += wid
    b.append(ts(26, 250, "樂器之間搶的通常是 250–800 Hz 與 3–6 kHz 這兩段。", size=11))
    b.append(ts(26, 276, "低頻留給大鼓與貝斯，中高頻留給人聲與鈸——先決定誰擁有哪一段。", size=11, color=MUTED))
    return w, h, "頻譜分區", "每一段負責不同的感覺", chr(10).join(b), None


def fig_fader_ride():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "Fader ride 是在一句話之內微調，不是把整段推大。", size=12))
    x0, y0, pw = 80, 210, 480
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    import math
    pts = []
    for i in range(121):
        f = i / 120
        v = 0.5 + 0.18 * math.sin(f * 5) - 0.12 * math.exp(-((f - 0.55) ** 2) / 0.004)
        pts.append(f"{x0 + pw * f:.1f} {y0 - 90 * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="acc", sw=1.8))
    b.append(ts(x0 + pw * 0.55, y0 - 100, "某個字被吃掉 → 只推那一下", size=9.5, anchor="middle", color=RED))
    b.append(box(60, 250, 250, 54, "先修 clip gain", "段落性的問題用它，推桿留給表情", tint=BLUE_SOFT))
    b.append(box(340, 250, 260, 54, "推桿只做小幅度", "超過 3 dB 就該回頭看錄音", tint=ACCENT_SOFT))
    return w, h, "Fader ride", "在句子裡面微調，而不是整段推大", chr(10).join(b), None


def fig_q_width():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "同一個增益，Q 越小影響的範圍越寬；掃頻找問題時先把 Q 拉高。", size=12))
    import math
    x0, y0, pw, ph = 90, 250, 460, 130
    b.append(rect(x0, y0 - ph, pw, ph, fill=PANEL, stroke=LINE, rx=4))
    b.append(path(f"M{x0} {y0 - ph / 2} L{x0 + pw} {y0 - ph / 2}", cls="thin", dash="3 4"))
    for q, name, col, cls in ((0.7, "Q 低（寬）", BLUE, "blue"), (3.0, "Q 中", ACCENT, "acc"), (9.0, "Q 高（窄）", RED, "red")):
        pts = []
        for i in range(121):
            f = i / 120
            v = math.exp(-((f - 0.5) ** 2) * q * 18)
            pts.append(f"{x0 + pw * f:.1f} {y0 - ph / 2 - 44 * v:.1f}")
        b.append(path("M" + " L".join(pts), cls=cls, sw=1.7))
    b.append(ts(x0 + 6, y0 - ph - 8, "0 dB", size=9, color=MUTED))
    b.append(ts(x0 + pw / 2, y0 + 18, "頻率 →", size=9.5, anchor="middle"))
    b.append(box(60, 276, 250, 50, "寬 Q：修整體音色", "影響範圍大，聽起來自然", tint=BLUE_SOFT))
    b.append(box(340, 276, 260, 50, "窄 Q：抓單一頻率", "掃頻時用，找到再放寬", tint=RED_SOFT))
    return w, h, "Q 值與影響範圍", "窄 Q 像手術刀，寬 Q 像調整體", chr(10).join(b), None


def fig_attack_release():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "Attack 決定「多快開始壓」，Release 決定「多快放開」。", size=12))
    import math
    x0, y0 = 90, 120
    b.append(rect(x0, y0, 480, 150, fill=PANEL, stroke=LINE, rx=4))
    base = y0 + 110
    b.append(path(f"M{x0 + 10} {base} L{x0 + 470} {base}", cls="thin"))
    xin = x0 + 60
    b.append(path(f"M{xin} {base} L{xin} {base - 90}", cls="acc", sw=1.6))
    b.append(path(f"M{xin + 120} {base} L{xin + 120} {base - 30}", cls="acc", sw=1.6))
    b.append(ts(xin, base + 18, "輸入", size=9, anchor="middle", color=ACCENT))
    fast = []
    slow = []
    for i in range(61):
        t = i / 60
        fast.append(f"{xin + 160 + 120 * t:.1f} {base - 86 + 30 * t:.1f}")
        slow.append(f"{xin + 160 + 120 * t:.1f} {base - 86 + 40 * (1 - math.exp(-t * 3)):.1f}")
    b.append(path("M" + " L".join(fast), cls="red", sw=1.5))
    b.append(path("M" + " L".join(slow), cls="green", sw=1.5))
    b.append(ts(xin + 250, base - 74, "慢 Attack：瞬態先通過", size=9.5, color=GREEN))
    b.append(ts(xin + 250, base - 56, "快 Attack：瞬態被壓住", size=9.5, color=RED))
    b.append(ts(xin + 250, base - 36, "（兩條曲線都在同一格裡）", size=8.5, color=MUTED))
    b.append(ts(26, 300, "鼓要留打擊感就把 Attack 放慢；人聲要平順就快一點。", size=11))
    b.append(ts(26, h - 18, "Release 太短會「抽」，太長會讓下一句來不及恢復。", size=11, color=MUTED))
    return w, h, "Attack 與 Release 對波形的影響", "一個管開頭，一個管尾巴", chr(10).join(b), None


def fig_mid_side_eq():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "Mid 是左右共同的內容（人聲、大鼓），Side 是左右的差異（殘響、寬度）。", size=12))
    b.append(box(60, 110, 160, 60, "立體聲", "L / R", tint=PANEL))
    b.append(box(270, 110, 120, 60, "Mid", "L+R", tint=ACCENT_SOFT))
    b.append(box(270, 200, 120, 60, "Side", "L−R", tint=BLUE_SOFT))
    b.append(path("M220 140 L266 140", cls="thin"))
    b.append(path("M220 140 C240 140 246 230 266 230", cls="thin"))
    b.append(box(440, 110, 160, 60, "EQ 只動 Mid", "人聲更清楚", tint=ACCENT_SOFT))
    b.append(box(440, 200, 160, 60, "EQ 只動 Side", "殘響變乾淨", tint=BLUE_SOFT))
    b.append(path("M390 140 L436 140", cls="thin"))
    b.append(path("M390 230 L436 230", cls="thin"))
    b.append(ts(26, 300, "把 200 Hz 以下的 Side 切掉，低頻會立刻集中；把 3 kHz 的 Mid 修掉，人聲不會那麼刺。", size=11))
    b.append(ts(26, h - 18, "M/S 處理後一定要檢查單聲道：Side 完全消失是正常，Mid 不該消失。", size=11, color=MUTED))
    return w, h, "Mid / Side 處理", "把中央與兩側分開處理", chr(10).join(b), None


def fig_parallel_blend():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "平行壓縮的關鍵是「乾濕比例」，不是壓得多兇。", size=12))
    blends = [(0, "全乾：只有原本的動態", 0.0), (35, "輕混：加厚但不失動態", 0.35),
              (70, "重混：明顯變厚、變近", 0.7), (100, "全濕：等於串聯壓縮", 1.0)]
    for i, (pct, note, frac) in enumerate(blends):
        y = 118 + i * 52
        b.append(t(60, y + 6, f"{pct}% 濕", size=10.5))
        b.append(rect(140, y - 10, 380, 22, fill=PANEL, stroke=LINE, rx=4))
        b.append(rect(140, y - 10, 380 * frac, 22, fill=ACCENT, rx=4, opacity=0.30))
        b.append(ts(146 + 380 * frac, y + 24, note, size=9, color=MUTED))
    b.append(ts(26, 330, "實務上從 30% 開始加，加到「聽得出厚、但還聽得出原本的動態」為止。", size=11))
    return w, h, "平行壓縮的乾濕比", "混多少進去，決定它有多明顯", chr(10).join(b), None


def fig_mb_bands():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "多頻段壓縮的實務順序：先單獨聽一段，確定問題在哪，再動手。", size=12))
    bands = [("低頻", "120 Hz 以下", "貝斯與大鼓的起伏", BLUE),
             ("中低", "120–800 Hz", "箱音、悶", GREEN),
             ("中高", "800–4k", "人聲前傾", ACCENT),
             ("高頻", "4k 以上", "齒音、鈸", RED)]
    for i, (name, rng, note, col) in enumerate(bands):
        y = 116 + i * 48
        b.append(rect(60, y, 60, 34, fill=col, rx=4, opacity=0.25, stroke=col, sw=1.2))
        b.append(ts(90, y + 22, "S", size=10, anchor="middle", color=col))
        b.append(t(140, y + 16, name, size=11, weight=700))
        b.append(ts(140, y + 32, rng, size=9, color=MUTED))
        b.append(ts(300, y + 22, note, size=10))
        b.append(ts(500, y + 22, "衰減 2–4 dB" if i else "衰減 1–2 dB", size=9.5, color=col))
    b.append(ts(26, 330, "一次只 solo 一段，否則你會以為問題消失了，其實只是被別段蓋住。", size=11))
    return w, h, "單獨聽某一段", "Solo 是按鈕，不是診斷", chr(10).join(b), None


def fig_saturation_curves():
    w, h = 660, 380
    b = []
    b.append(ts(26, 84, "軟削波保留一點圓角，硬削波直接切平——泛音結構完全不同。", size=12))
    import math
    x0, y0, scale = 100, 190, 110
    for k, (name, col, cls) in enumerate([("軟削波 Soft clip", ACCENT, "acc"),
                                         ("硬削波 Hard clip", RED, "red")]):
        cx = x0 + k * 280
        b.append(path(f"M{cx - scale} {y0} L{cx + scale} {y0}", cls="thin"))
        b.append(path(f"M{cx} {y0 - scale} L{cx} {y0 + scale}", cls="thin"))
        pts = []
        for i in range(81):
            x = -1 + 2 * i / 80
            y = math.tanh(2.2 * x) if k == 0 else max(-0.7, min(0.7, x))
            pts.append(f"{cx + x * scale:.1f} {y0 - y * scale:.1f}")
        b.append(path("M" + " L".join(pts), cls=cls, sw=2))
        b.append(ts(cx, y0 + scale + 26, name, size=10, anchor="middle", color=col))
    b.append(box(60, 316, 250, 44, "軟削波：奇次泛音較少", "聽起來厚、溫和", tint=ACCENT_SOFT))
    b.append(box(340, 316, 260, 44, "硬削波：大量奇次泛音", "聽起來刺、有攻擊性", tint=RED_SOFT))
    return w, h, "軟削波與硬削波", "圓角與切平，差的是泛音", chr(10).join(b), None


def fig_reverb_timeline():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "殘響的時間軸：pre-delay 是空白，decay 是尾巴。", size=12))
    x0, y0, pw = 70, 200, 520
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    b.append(rect(x0, y0 - 46, 40, 46, fill=ACCENT, opacity=0.35, rx=3))
    b.append(ts(x0 + 20, y0 + 20, "直接音", size=9, anchor="middle"))
    import math
    start = x0 + 90
    pts = []
    for i in range(101):
        f = i / 100
        amp = math.exp(-f * 3.2) * 0.9
        pts.append(f"{start + (pw - 120) * f:.1f} {y0 - 40 * amp * (0.6 + 0.4 * abs(math.sin(f * 40))):.1f}")
    b.append(path("M" + " L".join(pts), cls="blue", sw=1.2))
    b.append(path(f"M{x0 + 40} {y0 - 60} L{start} {y0 - 60}", cls="acc", sw=1.4))
    b.append(ts((x0 + 40 + start) / 2, y0 - 68, "Pre-delay", size=9.5, anchor="middle", color=ACCENT))
    b.append(path(f"M{start} {y0 - 60} L{start + (pw - 120)} {y0 - 60}", cls="blue", sw=1.4))
    b.append(ts(start + (pw - 120) / 2, y0 - 68, "Decay", size=9.5, anchor="middle", color=BLUE))
    b.append(ts(26, 280, "Pre-delay 20–30 ms：聲音清楚但仍有空間；60 ms 以上：明顯聽成另一個空間。", size=11))
    b.append(ts(26, h - 18, "Early reflections 決定「牆有多近」，decay 決定「房間有多大」。", size=11, color=MUTED))
    return w, h, "殘響的時間軸", "pre-delay、early reflections、decay", chr(10).join(b), None


def fig_delay_sync():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "拍點同步的 delay：音符長度決定時間，BPM 一改它就跟著改。", size=12))
    rows = [("1/4", "一拍", 120), ("1/8", "半拍", 60), ("1/8 dotted", "附點八分", 90), ("1/16", "十六分", 30)]
    for i, (note, name, frac) in enumerate(rows):
        y = 116 + i * 50
        b.append(t(60, y + 6, note, size=11, weight=700))
        b.append(ts(180, y + 6, name, size=10, color=MUTED))
        for k in range(5):
            x = 320 + k * 68 * (frac / 120)
            b.append(circle(x, y, 5, fill=ACCENT, opacity=0.75 - k * 0.14))
    b.append(ts(320, 96, "第一下之後的回聲位置", size=9.5, color=MUTED))
    b.append(ts(26, 300, "120 BPM 時：1/8＝250 ms、1/8 dotted＝375 ms、1/4＝500 ms。", size=11))
    b.append(ts(26, h - 18, "dotted 的比例最好聽，因為它跟人類的擺動感接近。", size=11, color=MUTED))
    return w, h, "拍點同步的 Delay", "音符長度換算成毫秒", chr(10).join(b), None


def fig_chorus_mod():
    w, h = 660, 340
    b = []
    b.append(ts(26, 84, "Chorus 是把延遲時間緩緩地推來推去，讓兩個聲音永遠差一點點。", size=12))
    import math
    x0, y0, pw = 90, 190, 480
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    base = []
    mod = []
    for i in range(161):
        f = i / 160
        base.append(f"{x0 + pw * f:.1f} {y0 - 60 * math.sin(2 * math.pi * 4 * f):.1f}")
        m = 0.06 * math.sin(2 * math.pi * 1.2 * f)
        mod.append(f"{x0 + pw * (f + m):.1f} {y0 - 34 * math.sin(2 * math.pi * 4 * f):.1f}")
    b.append(path("M" + " L".join(base), cls="acc", sw=1.6))
    b.append(path("M" + " L".join(mod), cls="blue", sw=1.6))
    b.append(ts(x0 + 6, y0 - 70, "原本的訊號", size=9.5, color=ACCENT))
    b.append(ts(x0 + 6, y0 - 92, "加上延遲調變後", size=9.5, color=BLUE))
    b.append(ts(26, 260, "Rate 慢＝寬鬆、像很多人一起唱；Rate 快＝明顯的效果音。", size=11))
    b.append(ts(26, h - 18, "Depth 決定音高飄多少；太多會走音，太少等於沒效果。", size=11, color=MUTED))
    return w, h, "Chorus 在做什麼", "把延遲時間緩慢地推來推去", chr(10).join(b), None


def fig_vocal_double():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "雙軌人聲不是複製貼上：要的是兩次「幾乎一樣但不一樣」的演出。", size=12))
    b.append(box(60, 108, 160, 56, "主唱", "置中、乾", tint=ACCENT_SOFT))
    b.append(box(60, 186, 160, 56, "Double", "偏 10–20 ms", tint=BLUE_SOFT))
    for i, (label, y, col, dx) in enumerate([("L", 136, ACCENT, 0), ("R", 214, BLUE, 4)]):
        b.append(rect(280 + dx, y - 8, 240, 18, fill=col, rx=3, opacity=0.25))
        b.append(ts(286 + dx, y + 4, label, size=9, color=col))
    b.append(ts(560, 140, "主唱：兩邊等量", size=9.5, color=ACCENT))
    b.append(ts(560, 218, "Double：稍微偏一邊", size=9.5, color=BLUE))
    b.append(ts(26, 290, "兩軌時間差 10–25 ms，聽起來會變寬；完全相同只會變大聲。", size=11))
    b.append(ts(26, h - 18, "Double 要重新唱一次；複製貼上加延遲是另一種效果，不是加厚。", size=11, color=MUTED))
    return w, h, "雙軌人聲", "兩次演出，不是兩份檔案", chr(10).join(b), None


def fig_wall_of_sound():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "音牆不是把音量推大，是把很多層疊到頻譜上沒有空隙。", size=12))
    layers = [("主奏吉他", 0.9, ACCENT), ("節奏吉他 1", 0.75, BLUE),
              ("節奏吉他 2", 0.65, GREEN), ("Pad", 0.5, INK2)]
    for i, (name, level, col) in enumerate(layers):
        y = 118 + i * 46
        b.append(rect(70, y, 420 * level + 60, 32, fill=col, rx=5, opacity=0.20, stroke=col, sw=1.2))
        b.append(t(84, y + 21, name, size=10.5, weight=700))
    b.append(ts(26, 300, "每一層在頻譜上佔不同位置：一層留低中頻、一層留中高頻，就不會互相遮蔽。", size=11))
    b.append(ts(26, h - 18, "所有層都開滿破音與殘響，只會得到一團噪音；留白是音牆的一部分。", size=11, color=MUTED))
    return w, h, "音牆是疊出來的", "每一層負責一段頻率", chr(10).join(b), None


def fig_granular():
    w, h = 660, 340
    b = []
    b.append(ts(26, 84, "顆粒合成把聲音切成幾十毫秒的小片，再以不同的密度與位置重組。", size=12))
    import math
    x0, y0, pw = 70, 180, 520
    b.append(path(f"M{x0} {y0} L{x0 + pw} {y0}", cls="thin"))
    for i in range(60):
        f = i / 60
        x = x0 + pw * f
        amp = 0.5 + 0.5 * math.sin(f * 17)
        b.append(rect(x, y0 - 70 * amp, 5, 70 * amp, fill=BLUE, rx=2, opacity=0.35))
    b.append(ts(x0, y0 + 24, "時間 →", size=9.5))
    b.append(ts(26, 250, "Grain size 決定「是顆粒還是糊」：10–50 ms 聽得出顆粒，200 ms 以上幾乎是原音。", size=11))
    b.append(ts(26, 276, "Density 越高越連續，越低越像星塵。", size=11, color=MUTED))
    return w, h, "顆粒合成", "把聲音切成小片再重組", chr(10).join(b), None


def fig_clip_gain_vs_fader():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "Clip gain 改的是「檔案本身」，fader 改的是「播放時」。", size=12))
    b.append(box(60, 110, 250, 70, "Clip gain", "在波形上直接調，訊號進外掛前就變了", tint=BLUE_SOFT))
    b.append(box(340, 110, 260, 70, "Fader／volume automation", "在外掛之後調，送出去的量才變", tint=ACCENT_SOFT))
    b.append(path("M60 220 L600 220", cls="thin"))
    for i, (label, col) in enumerate([("Clip gain", BLUE), ("EQ", INK2), ("壓縮", INK2), ("Fader", ACCENT)]):
        x = 80 + i * 130
        b.append(rect(x, 240, 110, 40, fill=PANEL, stroke=col, rx=6))
        b.append(ts(x + 55, 265, label, size=9.5, anchor="middle", color=col))
        if i < 3:
            b.append(arrow(x + 112, 260, x + 128, 260, "muted", 5))
    b.append(ts(26, 316, "要修「這段錄太大」用 clip gain；要做「這句要更靠近」用 fader。", size=11))
    return w, h, "Clip gain 與 Fader", "動在哪裡，決定後面聽到什麼", chr(10).join(b), None


def fig_stem_vs_master():
    w, h = 660, 340
    b = []
    b.append(ts(26, 84, "Stem 是分組的混音結果，母帶是最後那一份；交出去之前先搞清楚對方要哪一種。", size=12))
    b.append(box(60, 110, 150, 52, "鼓", "", tint=ACCENT_SOFT))
    b.append(box(60, 174, 150, 52, "貝斯", "", tint=ACCENT_SOFT))
    b.append(box(60, 238, 150, 52, "人聲", "", tint=ACCENT_SOFT))
    b.append(box(250, 110, 150, 52, "吉他／鍵盤", "", tint=ACCENT_SOFT))
    b.append(box(250, 174, 150, 52, "效果／氛圍", "", tint=ACCENT_SOFT))
    b.append(arrow(400, 200, 440, 200, "muted", 6))
    b.append(box(444, 168, 90, 64, "Master", "2 軌", tint=GREEN_SOFT))
    b.append(ts(26, 320, "Stem 交出去時：不加母帶處理、檔頭對齊、峰值 −6 dBFS。", size=11))
    return w, h, "Stem 與母帶", "分組輸出與最終輸出的差別", chr(10).join(b), None


def fig_limiter_gr():
    w, h = 660, 350
    b = []
    b.append(ts(26, 84, "Limiter 的工作是「只切掉超過 Ceiling 的那一點」，不是把整首壓扁。", size=12))
    import math
    x0, y0 = 80, 230
    b.append(path(f"M{x0} {y0} L{x0 + 460} {y0}", cls="thin"))
    ceiling = y0 - 120
    b.append(path(f"M{x0} {ceiling} L{x0 + 460} {ceiling}", cls="red", sw=1.2, dash="5 4"))
    b.append(ts(x0 + 464, ceiling + 4, "Ceiling", size=9, color=RED))
    pts = []
    for i in range(161):
        f = i / 160
        v = math.sin(2 * math.pi * 6 * f) * (0.75 + 0.35 * math.sin(f * 3))
        pts.append(f"{x0 + 460 * f:.1f} {y0 - 110 * v:.1f}")
    b.append(path("M" + " L".join(pts), cls="thin", sw=1.3))
    b.append(rect(x0, ceiling, 460, 14, fill=RED, opacity=0.1))
    b.append(ts(26, 286, "Gain reduction 通常 1–3 dB 聽不出來；超過 6 dB 會開始失去衝擊。", size=11))
    b.append(ts(26, h - 18, "要看的是 GR 表，不是波形；波形被切平代表 Ceiling 設太低或推太大。", size=11, color=MUTED))
    return w, h, "Limiter 與 Gain Reduction", "只處理超過 Ceiling 的那一點", chr(10).join(b), None


def fig_stereo_width():
    w, h = 660, 340
    b = []
    b.append(ts(26, 84, "寬度不是越大越好：太窄擠在中央，太寬在單聲道下會消失。", size=12))
    cases = [("單聲道", 0.1, "全部擠在中央", RED), ("正常", 0.55, "有寬度但中央仍清楚", GREEN),
             ("過寬", 1.0, "單聲道下會塌掉", RED)]
    for i, (name, frac, note, col) in enumerate(cases):
        x = 60 + i * 200
        b.append(rect(x, 120, 170, 90, fill=PANEL, stroke=LINE, rx=6))
        cx, cy = x + 85, 165
        for k, ww in enumerate((40, 80, 120)):
            b.append(path(f"M{cx - ww / 2} {cy - 20 + k * 20} L{cx + ww / 2} {cy - 20 + k * 20}",
                          cls="thin", opacity=0.5))
        b.append(rect(cx - 120 * frac / 2, cy - 12, 120 * frac, 24, fill=col, rx=4, opacity=0.22))
        b.append(ts(x + 85, 228, name, size=10.5, anchor="middle", weight=700))
        b.append(ts(x + 85, 244, note, size=8.5, anchor="middle", color=MUTED))
    b.append(ts(26, 300, "檢查方式：按 mono，聽聽看有沒有東西消失，或中央突然變大。", size=11))
    return w, h, "立體聲寬度", "三種寬度在單聲道下的下場", chr(10).join(b), None


def fig_export_formats():
    w, h = 660, 360
    b = []
    b.append(ts(26, 84, "輸出格式決定「誰還能再處理」：WAV 是工作檔，MP3 是成品。", size=12))
    rows = [("WAV 24-bit", "未壓縮", "母帶、送母帶師", GREEN),
            ("AIFF 24-bit", "未壓縮", "macOS 生態、交換", GREEN),
            ("FLAC", "無損壓縮", "存檔、發行無損版", BLUE),
            ("AAC / M4A", "有損", "Apple 生態串流", ACCENT),
            ("MP3 320k", "有損", "相容性最好的成品", ACCENT)]
    for i, (name, kind, use, col) in enumerate(rows):
        y = 112 + i * 42
        b.append(rect(60, y, 540, 32, fill=col, rx=4, opacity=0.10))
        b.append(t(74, y + 22, name, size=11, weight=700))
        b.append(ts(220, y + 22, kind, size=10, color=MUTED))
        b.append(ts(380, y + 22, use, size=10))
    b.append(ts(26, 330, "不管輸出哪一種，母帶檔一定要留一份未壓縮的原始版本。", size=11))
    return w, h, "輸出格式", "工作檔與成品是兩件事", chr(10).join(b), None


FIGURES = {
    "signal-chain": fig_signal_chain,
    "room-modes": fig_room_modes,
    "comb-filter": fig_comb_filter,
    "ad-conversion": fig_ad_conversion,
    "buffer-latency": fig_buffer_latency,
    "mic-proximity": fig_mic_proximity,
    "stereo-techniques": fig_stereo_techniques,
    "gain-staging": fig_gain_staging,
    "latency-routing": fig_latency_routing,
    "phase-correlation": fig_phase_correlation,
    "crossfade": fig_crossfade,
    "warp-markers": fig_warp_markers,
    "pitch-cents": fig_pitch_cents,
    "pitch-curve": fig_pitch_curve,
    "retune-speed": fig_retune_speed,
    "formant-shift": fig_formant_shift,
    "mix-3d": fig_mix_3d,
    "fader-pyramid": fig_fader_pyramid,
    "eq-filters": fig_eq_filters,
    "compressor-curve": fig_compressor_curve,
    "masking": fig_masking,
    "parallel-serial": fig_parallel_serial,
    "multiband": fig_multiband,
    "harmonics": fig_harmonics,
    "reverb-architecture": fig_reverb_architecture,
    "delay-types": fig_delay_types,
    "modulation": fig_modulation,
    "vocal-chain": fig_vocal_chain,
    "dynamic-arc": fig_dynamic_arc,
    "ambient-layers": fig_ambient_layers,
    "automation-curve": fig_automation_curve,
    "master-chain": fig_master_chain,
    "loudness-limiter": fig_loudness_limiter,
    "analysis-meter": fig_analysis_meter,
    "dither-quantize": fig_dither_quantize,
    "mic-types": fig_mic_types,
    "headphone-types": fig_headphone_types,
    "first-reflection": fig_first_reflection,
    "absorber-diffuser": fig_absorber_diffuser,
    "nyquist-alias": fig_nyquist_alias,
    "bit-depth-range": fig_bit_depth_range,
    "plosive": fig_plosive,
    "off-axis": fig_off_axis,
    "drum-kit-map": fig_drum_kit_map,
    "three-to-one": fig_three_to_one,
    "vu-vs-peak": fig_vu_vs_peak,
    "crest-factor": fig_crest_factor,
    "punch-in": fig_punch_in,
    "noise-floor": fig_noise_floor,
    "comp-lanes": fig_comp_lanes,
    "warp-modes": fig_warp_modes,
    "pan-law": fig_pan_law,
    "frequency-map": fig_frequency_map,
    "fader-ride": fig_fader_ride,
    "q-width": fig_q_width,
    "attack-release": fig_attack_release,
    "mid-side-eq": fig_mid_side_eq,
    "parallel-blend": fig_parallel_blend,
    "mb-bands": fig_mb_bands,
    "saturation-curves": fig_saturation_curves,
    "reverb-timeline": fig_reverb_timeline,
    "delay-sync": fig_delay_sync,
    "chorus-mod": fig_chorus_mod,
    "vocal-double": fig_vocal_double,
    "wall-of-sound": fig_wall_of_sound,
    "granular": fig_granular,
    "clip-gain-vs-fader": fig_clip_gain_vs_fader,
    "stem-vs-master": fig_stem_vs_master,
    "limiter-gr": fig_limiter_gr,
    "stereo-width": fig_stereo_width,
    "export-formats": fig_export_formats,
}


# ---------------------------------------------------------------- 流程卡與對照卡
def _wrap(text, n):
    return [text[i:i + n] for i in range(0, len(text), n)]


def _flow_body(items, w=660):
    """橫向編號流程：超過四個自動折成兩列。"""
    b = []
    per_row = min(4, len(items))
    gap = 14
    bw = (w - 52 - (per_row - 1) * gap) / per_row
    bh = 88
    for i, (head, sub) in enumerate(items):
        row, col = divmod(i, per_row)
        x = 26 + col * (bw + gap)
        y = 96 + row * (bh + 34)
        b.append(badge(x + 12, y + 14, i + 1))
        b.append(rect(x, y, bw, bh, fill=ACCENT_SOFT, stroke=LINE, rx=9))
        for k, line in enumerate(_wrap(head, 9)[:2]):
            b.append(t(x + 10, y + 44 + k * 17, line, 12.5, weight=700))
        for k, line in enumerate(_wrap(sub, 11)[:3]):
            b.append(ts(x + 10, y + 62 + k * 15, line, 9.5, color=MUTED))
        if col < per_row - 1 and i < len(items) - 1:
            b.append(arrow(x + bw + 2, y + bh / 2, x + bw + gap - 2, y + bh / 2))
    rows = (len(items) + per_row - 1) // per_row
    return b, 96 + rows * (bh + 34)


def make_flow(title, sub, items, note=""):
    def fn():
        b, h = _flow_body(items)
        return 660, h + 6, title, sub, "".join(b), note
    return fn


def make_cmp(title, sub, columns, rows, note=""):
    def fn():
        b = []
        label_w = 118
        ncol = len(columns) - 1
        cw = (660 - 52 - label_w) / max(1, ncol)
        rowh = 58
        for j, name in enumerate(columns[1:]):
            b.append(t(26 + label_w + j * cw + 6, 92, name, 11.5, color=ACCENT, weight=700))
        for i, row in enumerate(rows):
            y = 104 + i * rowh
            if i % 2 == 0:
                b.append(rect(26, y, 660 - 52, rowh, fill=ACCENT_SOFT, opacity=0.55, rx=4))
            b.append(t(34, y + 22, row[0], 11.5, weight=700))
            for j, val in enumerate(row[1:]):
                for k, line in enumerate(_wrap(val, 13)[:3]):
                    b.append(ts(26 + label_w + j * cw + 6, y + 20 + k * 15, line, 10, color=INK2))
        h = 122 + len(rows) * rowh
        return 660, h, title, sub, "".join(b), note
    return fn



FLOW_FIGURES = {
    "flow-vocal-tune": ("手動調音的工作流程：先修大的，再修小的",
        "一次只調一個音，調完立刻聽前後兩秒；不要整首掃過去",
        [("標記問題音", "聽一遍，把明顯走音的地方留下 marker"), ("粗調", "先把差半音以上的拉回來"),
         ("細調", "1～2 個半音內的誤差，看音高曲線平不平"), ("修抖音", "把抖動的幅度縮小，保留頻率"),
         ("回聽", "整段播一次，確認沒有不自然的跳動")],
        "修完一定要從頭聽：單獨聽都對，連起來聽才聽得出來「太機械」。"),
    "flow-mix": ("建立混音的順序：先把地基打好",
        "順序錯了會一直在補救；照這個順序，每一步都只需要顧一件事",
        [("Fader 歸零", "全部推回 0，先聽原始平衡"), ("主唱定位", "以人聲為基準，決定整體音量"),
         ("節奏組", "Kick、Snare、Bass 對齊"), ("支撐樂器", "吉他、鍵盤、Pad 補空隙"),
         ("聲向", "擺左右，把頻率錯開"), ("動態與空間", "最後才加壓縮與殘響")],
        "順序不是鐵律，但「先平衡、後處理」幾乎不會錯。"),
    "flow-masking": ("頻率遮蔽的解決流程：先找誰擋誰",
        "遮蔽不是「不夠亮」，是「被別的東西蓋住」",
        [("找出被蓋住的聲音", " Solo 每一軌，聽哪一軌在合奏時消失"),
         ("找頻段", "用窄頻掃描，找出兩者重疊的位置"),
         ("決定誰讓位", "通常讓配樂讓給主唱，而不是把主唱推大"),
         ("用減法", "在讓位的那一軌做幾 dB 的衰減"), ("回聽", "兩軌一起播，確認焦點回來了")],
        "加法 EQ 會讓整體變吵；先試著「讓誰小一點」，通常一次就解決。"),
    "flow-static-mix": ("靜態混音的建立順序",
        "先建立不用自動化也站得住的平衡，之後的動態才有意義",
        [("全部歸零", "Fader 全部回 0，關掉所有效果"), ("主唱", "先讓主唱在合理音量"),
         ("Kick 與 Bass", "確認低頻不打架"), ("Snare 與節奏", "把拍點釘住"),
         ("鋪底與裝飾", "最後才加"), ("檢查", "用參考曲目比對整體亮度與低頻")],
        "靜態混音沒做好，之後所有壓縮與自動化都只是在補破網。"),
    "flow-export": ("輸出的檢查順序",
        "輸出前五分鐘做這幾件事，可以少一次重做",
        [("檢查峰值", "True Peak 不要超過 -1 dBTP"), ("檢查響度", "確認符合平台要求"),
         ("檢查長度", "頭尾不要有多的空白或截斷"), ("檢查相位", "單聲道摺疊聽一次，有沒有東西消失"),
         ("命名", "檔名帶上版本與日期")],
        "輸出的檔案要留一份無損的母帶，平台用的壓縮檔另外轉。"),
    "flow-drum-edit": ("鼓組編輯的順序",
        "先對拍、再對音，最後才談音色",
        [("對拍", "先把明顯拖拍的音移回格線"), ("對齊相位", "多麥克風時確認沒有抵銷"),
         ("修音高", "大鼓與小鼓必要時微調"), ("清理", "剪掉沒聲音的段落與雜音"),
         ("檢查", "整段播一次，確認沒有喀噠聲")],
        "編輯的痕跡通常來自「剪太狠」；交界處留 2～3ms 的交叉淡化。"),
}

CMP_FIGURES = {
    "cmp-compress-errors": ("壓縮最常見的四個錯誤",
        "同一個問題通常會連帶出現另一個；一次只修一種",
        ["錯誤", "聽起來", "怎麼修"],
        [("Attack 太快", "鼓的衝擊感不見了", "放慢 attack，讓瞬態先過去"),
         ("Release 太快", "聲音一抽一抽", "放慢 release，跟歌曲節奏對齊"),
         ("Ratio 太高", "動態被壓平、變扁", "降到 2:1～4:1，用兩段串聯"),
         ("沒有補償增益", "壓完之後整體變小", "用 makeup gain 補回來再比較")],
        "判斷方法：旁通（bypass）前後切換，音量要一樣，只聽動態的差別。"),
    "cmp-reverb-types": ("四種殘響：差別在「空間怎麼被算出來」",
        "不是哪一種比較好，是適合哪一種場合",
        ["類型", "聽起來", "適合"],
        [("Plate", "密、亮、尾巴平滑", "人聲、小鼓"),
         ("Spring", "金屬感、彈簧聲", "吉他、復古風"),
         ("Room", "短、自然、有實體感", "鼓組、需要「同一個房間」"),
         ("Hall", "長、寬、尾巴厚", "弦樂、慢歌、營造空間")],
        "古典與電影感常用 Hall；流行歌人聲多半用 Plate 疊一點 Room。"),
    "cmp-delay-types": ("Delay 的三種用法",
        "同一台 Delay，換個節奏型就是另一種效果",
        ["用法", "設定", "聽起來"],
        [("Slap", "30～120ms，一次", "像在牆邊彈"),
         ("八分／附點八分", "跟著 BPM 對拍", "流行歌最常見的寬度"),
         ("Ping-pong", "左右交替", "很寬，但會搶戲")],
        "Delay 一定要跟拍；沒有對拍的 delay 聽起來就是「髒」。"),
    "cmp-saturation": ("飽和、失真、破音：同一件事的三種程度",
        "都是「加諧波」，差別在加了多兇、以及有沒有削波",
        ["名稱", "加了什麼", "聽起來"],
        [("Saturation", "少量的偶次諧波", "厚、暖，動態還在"),
         ("Overdrive", "更多諧波、開始軟削波", "有明顯顆粒"),
         ("Distortion", "硬削波", "粗糙、有攻擊性")],
        "母帶階段通常只用到最輕的 saturation；重一點的留給單軌。"),
    "cmp-master-order": ("母帶處理的順序",
        "順序錯了，後面的處理會一直在補前面的問題",
        ["步驟", "做什麼", "為什麼在這"],
        [("1 修正", "修掉極端的低頻與刺耳", "先處理問題，再談音量"),
         ("2 動態", "壓縮或限制，控制峰值", "讓後面的限制器不用做苦工"),
         ("3 音色", "寬度與飽和度微調", "讓整體聽起來像同一張專輯"),
         ("4 響度", "限制器推到目標", "最後一步，前面都沒動它")],
        "每一首歌都照同一個順序做，專輯裡各首歌的差異才不會忽大忽小。"),
}

FLOW_FIGURES.update({
    "flow-rhythm-section": ("節奏組的平衡順序",
        "Kick、Snare、Bass 先對好，後面所有樂器才有地方站",
        [("Kick 定基準", "先讓大鼓在合理音量，它是整首的地板"), ("Bass 對齊 Kick", "低頻不要打架，必要時讓一邊讓位"),
         ("Snare 補拍點", "小鼓決定歌曲的「拍手」位置"), ("檢查低頻", "單聲道摺疊聽一次，Bass 不能被吃掉"),
         ("加上裝飾", "Hi-hat、打擊樂最後才進來")],
        "順序反過來（先加裝飾）會讓低頻一路被追著補。"),
    "flow-ab": ("A/B 測試的順序",
        "切換要快、音量要一樣，耳朵才比得出來",
        [("音量對齊", "參考曲與自己的混音用同一個響度"), ("切同一個段落", "副歌對副歌，不要拿主歌比副歌"),
         ("只聽一個維度", "這次只聽低頻，下次只聽人聲"), ("短時間多次", "一次聽 10 秒，休息再聽"),
         ("記錄差異", "寫下來，不要只憑印象")],
        "切換超過三秒就失去意義；AB 工具要用同一條音源通道。"),
})

CMP_FIGURES.update({
    "cmp-treat-vs-isolate": ("吸音與隔音：兩件完全不同的事",
        "一個處理「房間裡的聲音」，一個處理「進出房間的聲音」",
        ["項目", "吸音（Absorption）", "隔音（Isolation）"],
        [("處理什麼", "反射音、殘響", "空氣傳導與結構傳導"),
         ("材料", "泡棉、吸音板、厚窗簾", "質量、彈性減振、氣密"),
         ("效果", "聲音變乾、變清楚", "外面聽不到、裡面聽不到外面"),
         ("常見誤解", "貼滿泡棉不會變安靜", "吸音棉對低頻幾乎沒用")],
        "先做吸音（便宜有效），隔音是裝修等級的工程。"),
    "cmp-headroom": ("類比與數位的 Headroom：兩種哲學",
        "類比怕太小聲（雜訊），數位怕太大聲（削波）",
        ["項目", "類比", "數位"],
        [("上限", "軟壓縮，超過只是失真", "0 dBFS 硬切，直接壞掉"),
         ("底噪", "本身有嘶聲", "幾乎沒有底噪"),
         ("最佳工作區", "推高一點，蓋過雜訊", "峰值留 -6 dB 以下"),
         ("心態", "盡量用滿動態", "留空間給之後的處理")],
        "錄音時的目標很簡單：平均 -18 dBFS 左右，峰值不要碰到 0。"),
    "cmp-gate-expander": ("雜訊閘與擴展器：都是「安靜時更安靜」",
        "差別在小聲時被壓多少、以及過渡自不自然",
        ["項目", "Noise Gate", "Expander"],
        [("動作", "低於門檻直接切掉", "低於門檻按比例衰減"),
         ("聽感", "乾淨但可能有「呼吸」", "自然、不留痕跡"),
         ("適用", "明顯的底噪、串音", "想要保留一點動態"),
         ("風險", "尾音被切斷", "設定錯會忽大忽小")],
        "先試 Expander；只有底噪很明顯時才用 Gate，而且要放慢 release。"),
    "cmp-groove-quantize": ("保留 Groove 還是完美量化",
        "量化讓節奏整齊，也讓它變得沒有味道",
        ["做法", "聽起來", "什麼時候用"],
        [("全量化", "精準、機械", "電子舞曲、需要整齊的段落"),
         ("保留 Groove", "有人味、微微搖擺", "爵士、放克、真人演奏"),
         ("只修明顯的", "兩者之間", "流行歌最常用的做法")],
        "折衷法：先全量化，再把每個音的強度與時間「人為地」加回一點誤差。"),
    "cmp-tune-mode": ("手動調音與自動修正",
        "一個保留細節，一個追求速度",
        ["項目", "手動", "自動"],
        [("精度", "可只修一個音", "整段統一"),
         ("時間", "慢，但要修的地方通常不多", "快，適合整首"),
         ("自然度", "高（可保留抖音）", "低（容易變成 T-Pain）"),
         ("適用", "主唱、需要細修", "和聲、背景、創意效果")],
        "主唱用手動、和聲用自動，是多數流行製作的實際分工。"),
    "cmp-comp-types": ("四種壓縮器的個性",
        "同一組參數，換一台壓縮器，聲音就換一個樣子",
        ["類型", "個性", "常用在"],
        [("VCA", "乾淨、快、可控", "鼓組、匯流排"),
         ("FET", "有攻擊性、顆粒明顯", "搖滾人聲、房間鼓"),
         ("Optical", "慢、圓、有音樂性", "人聲、貝斯"),
         ("Vari-Mu", "柔和、厚、黏", "母帶、匯流排")],
        "先選個性，再調參數；個性不對，怎麼調都像在硬拉。"),
    "cmp-multiband": ("多頻段壓縮與單頻段壓縮",
        "一個處理整個動態，一個只處理「某一段」的動態",
        ["項目", "單頻段", "多頻段"],
        [("處理範圍", "整個訊號", "分成 2～4 段各自處理"),
         ("優點", "自然、整體感", "精準，不會牽動其他頻段"),
         ("缺點", "壓低頻會影響高頻", "相位與設定較複雜"),
         ("適用", "匯流排、整體黏合", "母帶、有問題的頻段")],
        "新手先練單頻段；多頻段是拿來修「只有某一段有問題」的情況。"),
    "cmp-delay-vs-reverb": ("Delay 與 Reverb：兩種「後面有東西」",
        "一個是清楚的複製，一個是模糊的擴散",
        ["項目", "Delay", "Reverb"],
        [("聽感", "可以數得出幾下", "一片模糊的尾巴"),
         ("節奏", "要對拍", "不需要對拍"),
         ("用途", "製造寬度、丟詞尾", "製造空間、距離"),
         ("風險", "太多會糊、搶拍", "太多會遠、失去焦點")],
        "流行歌常兩者並用：Delay 給寬度，Reverb 給深度，但兩者都要節制。"),
    "cmp-modulation": ("Chorus、Flanger、Phaser：三種掃掠",
        "都是「複製一份、稍微改變、再混回去」，差在怎麼改",
        ["效果", "怎麼做", "聽起來"],
        [("Chorus", "微小延遲 + 音高漂移", "變厚、像兩三個人同時唱"),
         ("Flanger", "很短的延遲 + 回饋", "噴射機、金屬掃掠"),
         ("Phaser", "全通濾波掃掠", "水下感、柔和的流動")],
        "人聲用 Chorus 會變寬但容易糊；吉他與合成器比較吃得住。"),
    "cmp-lufs": ("LUFS 的三種測量：看哪一個才對",
        "同一首歌，三個數字回答三個不同問題",
        ["類型", "時間窗", "看什麼"],
        [("Momentary", "400ms", "當下的音量"),
         ("Short-term", "3 秒", "段落的平均"),
         ("Integrated", "整首（有閘門）", "平台要求的數字")],
        "串流平台看的是 Integrated；動態反差用 Short-term 前後的差距判斷。"),
    "cmp-dither": ("Dither 的類型：加什麼樣的雜訊",
        "目的是把「截斷失真」換成「聽不見的雜訊」",
        ["類型", "特性", "適合"],
        [("TPDF", "平坦、無頻譜偏色", "最安全，幾乎萬用"),
         ("Noise Shaping", "把雜訊推到聽感較弱的頻段", "16-bit 輸出"),
         ("無 Dither", "乾淨，但有截斷失真", "32-bit 內部處理")],
        "16-bit 才需要 Dither；24-bit 以上直接輸出就好。"),
    "cmp-analyzer": ("三種分析工具：各看一件事",
        "沒有一種工具能告訴你「好不好聽」",
        ["工具", "看什麼", "拿來判斷"],
        [("頻譜儀", "頻率分佈隨時間", "哪個頻段擠、哪裡缺"),
         ("相位表", "左右聲道相關性", "單聲道摺疊會不會消失"),
         ("響度表", "LUFS 與 True Peak", "夠不夠大聲、會不會削波")],
        "工具只用來「發現問題」；要不要修、怎麼修，還是耳朵決定。"),
    "cmp-diagnose": ("混音常見問題：先猜這五個",
        "九成的「聽起來不對」都在這幾項裡",
        ["症狀", "可能原因", "先動哪裡"],
        [("人聲不清楚", "被中頻樂器蓋住", "讓樂器讓位，不是把人聲推大"),
         ("低頻糊", "Kick 與 Bass 撞在一起", "分工：一高一低的角色"),
         ("整體很吵", "每軌都塞滿", "先減，不要一直加"),
         ("沒有立體感", "全部擺中間", "把配角往兩側擺"),
         ("聽起來很遠", "殘響太多", "縮短 decay、加 pre-delay")],
        "一次只改一個地方，改完 A/B 一次；同時改三個就不知道誰有效。"),
})



# ---------------------------------------------------------------- 定量圖（真的算出來的曲線）
def make_eq(title, sub, bands, note="", marks=()):
    """bands: dict(kind, f, gain, q)；marks: [(freq, 文字)] 標在曲線上。"""
    def fn():
        x0, y0, x1, y1 = 70, 96, 590, 300
        b = []
        b += dg.grid(x0, y0, x1, y1, t, ts, path, LINE, MUTED)
        b.append(dg.eq_curve(x0, y0, x1, y1, bands, path))
        for f, label in marks:
            xx = dg._x(f, x0, x1)
            b.append(path(f"M{xx:.1f} {y0} L{xx:.1f} {y1}", cls="thin", sw=0.8, opacity=0.45, dash="3 3"))
            b.append(ts(xx + 4, y0 + 12, label, size=9.5, color=ACCENT))
        b.append(ts(26, 344, note, size=11))
        return 660, 366, title, sub, "".join(b), None
    return fn


def make_comp(title, sub, threshold=-24, ratio=4, knee=6, note=""):
    def fn():
        x0, y0, x1, y1 = 80, 96, 560, 300
        b = []
        for v in (-60, -48, -36, -24, -12, 0):
            xx = x0 + (v + 60) / 60 * (x1 - x0)
            yy = y1 - (v + 60) / 60 * (y1 - y0)
            b.append(path(f"M{xx:.1f} {y0} L{xx:.1f} {y1}", cls="thin", sw=0.8, opacity=0.5))
            b.append(path(f"M{x0} {yy:.1f} L{x1} {yy:.1f}", cls="thin", sw=0.8, opacity=0.5))
            b.append(ts(xx, y1 + 15, f"{v}", size=8.5, anchor="middle", color=MUTED))
            b.append(ts(x0 - 6, yy + 3.5, f"{v}", size=8.5, anchor="end", color=MUTED))
        b.append(dg.comp_curve(x0, y0, x1, y1, threshold, ratio, knee, path))
        xx = x0 + (threshold + 60) / 60 * (x1 - x0)
        b.append(ts(xx + 4, y1 - 8, f"Threshold {threshold} dB", size=9.5, color=ACCENT))
        b.append(ts(26, 340, note, size=11))
        b.append(ts(x1 + 8, y1 + 15, "輸入 dBFS", size=9, color=MUTED))
        return 660, 362, title, sub, "".join(b), None
    return fn


def make_decay(title, sub, rt60=2.0, pre=0.02, note=""):
    def fn():
        x0, y0, x1, y1 = 70, 96, 590, 300
        b = []
        for db in (0, -20, -40, -60):
            yy = y1 - ((db + 60) / 60) * (y1 - y0)
            b.append(path(f"M{x0} {yy:.1f} L{x1} {yy:.1f}", cls="thin", sw=1 if db else 1.3))
            b.append(ts(x0 - 6, yy + 3.5, f"{db} dB", size=8.5, anchor="end", color=MUTED))
        b.append(dg.decay_curve(x0, y0, x1, y1, rt60, pre, path))
        for sec in range(1, int(rt60 * 1.08) + 1):
            xx = x0 + (sec / (rt60 * 1.08)) * (x1 - x0)
            b.append(path(f"M{xx:.1f} {y1} L{xx:.1f} {y1 + 5}" , cls="thin", sw=0.9))
            b.append(ts(xx, y1 + 16, f"{sec}s", size=8.5, anchor="middle", color=MUTED))
        b.append(ts(26, 340, note, size=11))
        return 660, 362, title, sub, "".join(b), None
    return fn


def make_masking(title, sub, peaks, note=""):
    def fn():
        x0, y0, x1, y1 = 70, 96, 590, 300
        b = []
        for f in (100, 500, 2000, 8000):
            xx = dg._x(f, x0, x1)
            b.append(path(f"M{xx:.1f} {y0} L{xx:.1f} {y1}", cls="thin", sw=0.8, opacity=0.45))
            b.append(ts(xx, y1 + 14, f"{f}", size=8.5, anchor="middle", color=MUTED))
        for peak, width, amp, cls in peaks:
            b.append(dg.spectrum(x0, y0, x1, y1, peak, width, amp, cls, path))
        b.append(ts(26, 340, note, size=11))
        return 660, 362, title, sub, "".join(b), None
    return fn


EQ_FIGURES = {
    "eq-mud-cut": ("清掉 200–500 Hz 的模糊區",
        "人聲與吉他常在這一段累積「箱音」；用窄一點的鐘形挖 2–4 dB 就好",
        [{"kind": "bell", "f": 320, "gain": -4, "q": 1.4}],
        "挖太多會變薄；先挖 2 dB，聽不出差別再往下加。", [(320, "300–400 Hz")]),
    "eq-harsh-cut": ("減少 2–4 kHz 的刺耳感",
        "這一段是耳朵最敏感的地方，長時間聽會累",
        [{"kind": "bell", "f": 2800, "gain": -3.5, "q": 1.6}],
        "刺耳常常是「某個音特別衝」，用窄 Q 只處理那一顆，不要整段壓。", [(2800, "2.8 kHz")]),
    "eq-highpass": ("高通：把不需要的低頻清掉",
        "人聲 80 Hz 以下幾乎沒有內容，留著只會讓混音變糊",
        [{"kind": "hp", "f": 90, "order": 2}],
        "12 dB/oct 是常用的斜率；太陡會有相位問題，太緩又清不乾淨。", [(90, "90 Hz")]),
    "eq-shelf": ("擱架式 EQ：整段抬起或放下",
        "不是只動一個點，而是「這個頻率以上／以下全部」",
        [{"kind": "high_shelf", "f": 4000, "gain": 3},
         {"kind": "low_shelf", "f": 200, "gain": -2}],
        "母帶最常用擱架：抬一點空氣感、放一點低頻，整體就換一個氣質。", [(4000, "4 kHz 以上 +3"), (200, "200 Hz 以下 −2")]),
}

COMP_FIGURES = {
    "comp-ratio-mid": ("2:1 與 4:1：差別在「壓多少」",
        "同一條對角線，Ratio 越大，轉折後越平",
        -24, 4, 6, "流行歌人聲常用 2:1～4:1；超過 8:1 就已經接近限制了。"),
    "comp-attack-fast": ("Threshold 越低，越早開始壓",
        "Threshold 決定「從多大聲開始被壓」，Ratio 決定「壓得多兇」",
        -36, 3, 3, "Threshold 太低會把整首歌都壓住，動態就不見了。"),
}

DECAY_FIGURES = {
    "decay-short": ("短殘響：房間／Plate 的尾巴",
        "RT60 約 1.2 秒，適合流行歌的人聲與小鼓",
        1.2, 0.02, "RT60＝聲音衰減 60 dB 所需的時間，是描述殘響長度的標準說法。"),
    "decay-long": ("長殘響：Hall 的尾巴",
        "RT60 約 3 秒；尾巴越長，越快聽起來「遠」",
        3.0, 0.03, "長殘響要配 pre-delay，否則人聲會黏在空間裡、字變得模糊。"),
}

MASK_FIGURES = {
    "mask-vocal-guitar": ("遮蔽：人聲被吉他蓋住長什麼樣",
        "兩個頻譜重疊的地方，聽起來只剩比較大的那一個",
        [(1000, 1.1, 1.0, "blue"), (1150, 1.0, 0.75, "acc")],
        "解法不是把人聲推大，而是在吉他那一軌的 1 kHz 附近挖 2～3 dB。"),
    "mask-bass-kick": ("低頻遮蔽：Kick 與 Bass 撞在一起",
        "兩個都在 60–90 Hz，結果是誰也不清楚",
        [(70, 0.9, 1.0, "acc"), (95, 0.9, 0.85, "blue")],
        "分工的方式：讓 Kick 負責 60 Hz 的衝擊、Bass 負責 100 Hz 的厚度。"),
}



EQ_FIGURES.update({
    "eq-hpf-usage": ("高通在實際運用上：每一軌都該有一個",
        "除了 Kick 與 Bass，幾乎所有軌道都可以從 60–120 Hz 開始清",
        [{"kind": "hp", "f": 80, "order": 2}],
        "高通是「減法」，先清掉不需要的低頻，後面的壓縮與殘響都會更乾淨。", [(80, "80 Hz")]),
    "eq-vocal-mandopop": ("華語流行人聲的 EQ 方向",
        "清低頻、修中頻的箱音、加一點空氣感；三步就好",
        [{"kind": "hp", "f": 100, "order": 2}, {"kind": "bell", "f": 350, "gain": -3, "q": 1.2},
         {"kind": "high_shelf", "f": 9000, "gain": 2.5}],
        "每一步都要 A/B：改完聽兩秒，確認是「變清楚」而不是「變大聲」。",
        [(100, "100 Hz 高通"), (350, "350 Hz −3"), (9000, "9 kHz +2.5")]),
})

COMP_FIGURES.update({
    "comp-makeup": ("Makeup Gain：把被壓掉的音量補回來",
        "壓縮之後整體變小是正常的；補回來才能公平地 A/B",
        -24, 4, 6, "補償的原則是「聽起來一樣大聲」，不是「數字一樣」。"),
})

DECAY_FIGURES.update({
    "decay-er": ("Early Reflections 與 Tail：兩段不同的東西",
        "前 20 毫秒是「房間的形狀」，之後才是「空間的尾巴」",
        1.6, 0.015, "Early Reflections 影響清晰度，Tail 影響距離感；兩者要分開調。"),
    "decay-near-far": ("越近的樂器，殘響要越少",
        "同一個空間裡，靠近麥克風的樂器本來就收到比較多直接音",
        0.8, 0.005, "不是所有軌道都送一樣的 reverb；近的直接音多，就少送一點。"),
})

# ---- 對照與流程：一次補齊剩下的小節 ----
CMP_FIGURES.update({
    "cmp-cables": ("三種最常見的接頭",
        "接錯不會壞，但會沒有聲音、或只有一邊有聲音",
        ["接頭", "長相", "用在哪"],
        [("TS（6.3mm 單聲道）", "一個黑環", "吉他、導線，非平衡"),
         ("TRS（6.3mm 立體）", "兩個黑環", "耳機、平衡輸出"),
         ("XLR（卡農）", "三個接腳", "麥克風，平衡、可長距離")],
        "麥克風一定要 XLR；用 TS 轉接頭接麥克風通常不會有聲音。"),
    "cmp-low-level": ("為什麼錄音時要保持低電平",
        "不是怕太大聲，是怕沒有空間給之後的處理",
        ["項目", "低電平（-18 dBFS）", "接近 0 dBFS"],
        [("Headroom", "還有 18 dB 可以用", "幾乎沒有"),
         ("削波風險", "低", "高，一爆就回不來"),
         ("之後的處理", "壓縮、EQ 都有空間", "一推就爆")],
        "數位錄音沒有底噪問題，所以「錄小聲一點」幾乎沒有代價。"),
    "cmp-multitrack": ("多軌錄音的基本配置",
        "一次錄很多軌，重點是「每個人聽到不同的 mix」",
        ["項目", "說明", "注意"],
        [("Input 清單", "哪一軌接哪個樂器", "先標好名字，事後才不會找不到"),
         ("Cue Mix", "每位樂手一組耳機混音", "自己聽不到自己就會彈大聲"),
         ("Buffer", "越小延遲越低", "太小會爆音，錄音時通常 128–256")],
        "多軌錄音最常見的災難是事後才發現某一軌沒錄到；開錄前逐一確認。"),
    "cmp-tune-tools": ("三種音高修正工具",
        "都能修音，差別在「怎麼修」與「聲音痕跡」",
        ["工具", "方式", "適合"],
        [("Melodyne", "抓成音塊，逐音編輯", "主唱、需要細修"),
         ("Auto-Tune", "即時、以半音為單位", "現場、和聲、T-Pain 效果"),
         ("DAW 內建", "整段拉伸", "快速修一兩個明顯走音")],
        "主唱通常用 Melodyne，和聲與效果用 Auto-Tune。"),
    "cmp-vibrato": ("修抖音：修到什麼程度",
        "抖動是情感，走音才是問題",
        ["項目", "保留抖動", "壓平抖動"],
        [("聽感", "有生命、有張力", "平、像合成器"),
         ("適用", "主唱、長音", "和聲、電子、效果"),
         ("做法", "只修音準，不動曲線高低", "把整條曲線拉直")],
        "判斷方法：把手放在喇叭上，感覺到「有起伏」就是還有抖動。"),
    "cmp-tpain": ("T-Pain 效果：把修正當成一種音色",
        "不是修不準，是故意讓它不自然",
        ["項目", "細修", "T-Pain 效果"],
        [("Retune Speed", "慢，貼合原音", "最快，變成階梯"),
         ("音高曲線", "平滑", "一格一格跳"),
         ("用途", "自然的修正", "創意、未來感")],
        "做效果時要把「修正量」與「速度」一起推到極端，否則只會像沒修好。"),
    "cmp-panning": ("聲向擺放：把東西放到左右",
        "中間留給最重要的兩個東西：主唱與低頻",
        ["元素", "位置", "為什麼"],
        [("主唱、Kick、Bass", "中間", "低頻與主旋律要在中央才穩"),
         ("吉他、鍵盤", "左右 30–70%", "錯開才聽得見各自"),
         ("裝飾、打擊", "更外側或 extreme", "讓中間保持乾淨")],
        "單聲道摺疊檢查：摺起來之後，重要的東西不能消失。"),
    "cmp-eq-errors": ("新手最常見的三個 EQ 錯誤",
        "三個都跟「加法」有關",
        ["錯誤", "結果", "怎麼改"],
        [("一直加不減", "整體變吵、變尖", "先想「哪一段不需要」"),
         ("Q 太窄又挖很深", "聲音出現「洞」", "Q 放寬、增益減半"),
         ("每一軌都切低頻", "整體變薄", "只切真的沒有內容的軌")],
        "EQ 的目的不是讓單軌好聽，是讓所有軌道一起好聽。"),
    "cmp-deess": ("多頻段壓縮與專用 De-esser",
        "都在處理齒音，差別在工具的精細程度",
        ["項目", "多頻段壓縮", "De-esser"],
        [("控制範圍", "整個高頻段", "只看 5–9 kHz 的齒音"),
         ("設定難度", "較高", "低，通常兩個旋鈕"),
         ("副作用", "容易讓聲音變悶", "較小")],
        "先用 De-esser；只有同時有別的高的問題時，才用多頻段。"),
    "cmp-settings-cheat": ("各類素材的起始設定",
        "不要從零開始調，從「大概對」的地方調",
        ["素材", "起點", "往哪調"],
        [("人聲", "3:1、attack 10ms、release 80ms", "想更有顆粒就放慢 attack"),
         ("鼓組", "4:1、attack 5ms、release 100ms", "想更衝就加快 attack"),
         ("Bass", "4:1、attack 20ms、release 150ms", "想更穩就提高 ratio")],
        "這些只是起點；每一首歌都不一樣，耳朵才是最後的判斷。"),
    "cmp-reverb-presets": ("實用 Reverb 設定：從這裡開始調",
        "先選對類型，再微調三個參數",
        ["用途", "類型", "Decay / Pre-delay"],
        [("流行人聲", "Plate", "1.2–1.8 s ／ 20–40 ms"),
         ("鼓組房間", "Room", "0.6–1.0 s ／ 0–15 ms"),
         ("弦樂與慢歌", "Hall", "2.5–4 s ／ 30–60 ms")],
        "Decay 越長、pre-delay 也要跟著拉長，字才不會糊。"),
    "cmp-delay-cheat": ("不同樂器的 Delay 起點",
        "Delay 是「節奏樂器」，先對拍再談音色",
        ["素材", "時間", "回饋"],
        [("人聲", "附點八分", "15–25%，濾掉低頻"),
         ("吉他", "八分或 slapback", "20–35%"),
         ("合成器", "四分或更長", "可以拉到 40% 做音牆")],
        "不管哪一種，回饋都要濾頻：低頻留著會糊、高頻留著會刺。"),
    "cmp-delay-creative": ("Delay 的創意用法",
        "同一台 Delay，換設定就是另一種樂器",
        ["用法", "設定", "效果"],
        [("Throw", "只在一句結尾送一次", "詞尾回聲，不影響整段"),
         ("Ping-pong", "左右交替", "很寬的立體感"),
         ("100% 濕", "只留回聲", "制造節奏性的「答」")],
        "創意用法要節制：整首歌都用，聽眾會疲乏。"),
    "cmp-vocal-harmony": ("和聲編排：三種常見排法",
        "和聲不是把人聲複製貼上，是分配音高",
        ["排法", "音程", "聽感"],
        [("三度", "主唱上方 3 度", "最常見、最自然"),
         ("五度", "上方 5 度", "空、開闊，容易太明顯"),
         ("八度", "同音高八度", "加厚，不改變和聲")],
        "和聲要先修音準再做效果；不準的和聲會讓整個混音變糊。"),
    "cmp-lufs-what": ("LUFS 是什麼：為什麼不是 dB",
        "它試著模擬「人耳覺得多大聲」，不是「波形多大」",
        ["項目", "dBFS（峰值）", "LUFS（響度）"],
        [("量什麼", "波形最高點", "人耳感受到的音量"),
         ("用途", "不要削波", "平台與專輯的一致性"),
         ("例子", "−1 dBFS 的歌不一定比較大聲", "−9 LUFS 才是真的比較大聲")],
        "兩個都要看：LUFS 決定大小聲，True Peak 決定會不會爆。"),
    "cmp-dither-when": ("什麼時候不該用 Dither",
        "只有在「降位元」的時候才需要",
        ["情況", "要不要 Dither", "為什麼"],
        [("32-bit 內部處理", "不要", "位元足夠，加了只是多雜訊"),
         ("輸出 24-bit", "通常不要", "底噪遠低於聽感"),
         ("輸出 16-bit（CD）", "要", "補償截斷失真")],
        "最常見的錯誤：每一軌都掛 Dither，結果雜訊一層一層疊上去。"),
    "cmp-analysis-problems": ("分析工具幫你抓出的五個問題",
        "工具只負責「發現」，不負責「決定」",
        ["看到", "代表", "先做什麼"],
        [("頻譜中間凹陷", "兩個樂器搶同一段", "做頻率分工"),
         ("相位表偏低", "單聲道會消失", "檢查時間差與極性"),
         ("True Peak 超標", "串流平台會轉小", "降限制器輸出"),
         ("動態範圍很窄", "整首都一樣大聲", "回頭處理主歌"),
         ("低頻不穩", "每段音量不同", "用多頻段或自動化")],
        "先修最明顯的那一個，修完再看下一個；一次改全部會失控。"),
    "cmp-reverb-vs-digital": ("自然殘響與數位殘響",
        "一個是錄進去的，一個是後來加的",
        ["項目", "自然（房間）", "數位（插件）"],
        [("可控性", "低，只能換房間", "高，每個參數都能調"),
         ("真實感", "最高", "好到幾乎聽不出來"),
         ("成本", "裝修很貴", "幾乎為零")],
        "最好的做法是「錄到一點真的房間」，再加一點數位的補足。"),
    "cmp-mic-placement": ("麥克風擺位的三個變數",
        "距離、角度、高度，換一個聲音就不同",
        ["變數", "改變什麼", "起點"],
        [("距離", "近接效應與空間比例", "15–25 cm（人聲）"),
         ("角度", "離軸染色與噴麥", "略偏 15–30 度"),
         ("高度", "鼻腔與胸腔的比例", "對準嘴巴或略高")],
        "一次只動一個變數，錄 20 秒比較；同時改三個就分不清效果。"),
    "cmp-polar-pattern": ("指向性與距離：為什麼心形指向適合人聲",
        "指向性決定「聽見什麼、忽略什麼」",
        ["指向", "收什麼", "適合"],
        [("心形 Cardioid", "正前方，忽略背面", "人聲、獨奏"),
         ("全指向 Omni", "全部，包括房間", "房間聲、多人"),
         ("八字 Figure-8", "前後，忽略兩側", "特殊立體聲技巧")],
        "房間不好時用越窄的指向越好；心形是宅錄的預設值。"),
    "cmp-direct-reflect": ("直接音與反射音",
        "你聽到的永遠是兩者的總和",
        ["項目", "直接音", "反射音"],
        [("到達時間", "最早", "晚 5–50 ms"),
         ("影響", "定位與清晰度", "空間感與距離"),
         ("怎麼控制", "麥克風距離", "吸音與擺位")],
        "反射音晚太多（>50 ms）會變成明顯的回聲；太早則變成梳狀濾波。"),
    "cmp-microphone-first": ("麥克風擺位的核心邏輯",
        "擺位解決的問題，EQ 只能在事後補救",
        ["原則", "意思", "實作"],
        [("先決定距離", "近＝乾、遠＝空間", "人聲 15–25 cm"),
         ("再決定角度", "正軸最亮、離軸最柔", "偏 15–30 度降噴麥"),
         ("最後才用 EQ", "EQ 補不回的，擺位可以", "先重錄再修")],
        "能重錄就重錄：修一個錄壞的軌道，花的時間通常比重錄多。"),
})

FLOW_FIGURES.update({
    "flow-gain-staging": ("Gain Staging 的順序",
        "每一個環節都留一樣的空間，訊號才不會在某處被壓死",
        [("樂器端", "先讓樂器本身的音量合理"), ("前級", "增益轉到平均 −18 dBFS"),
         ("介面輸入", "必要時微調，不要靠軟體救"), ("DAW 軌道", "Fader 保持 0，看電平"),
         ("插件鏈", "每一顆都檢查 input/output")],
        "常見錯誤：前級推爆再用插件衰減，雜訊與失真已經進去了。"),
    "flow-latency-fix": ("延遲補償的工作流程",
        "錄完發現對不上，先量、再移、最後才手動調",
        [("量測", "錄一個短脈衝，看差幾個 sample"), ("整體位移", "把整軌往前移"),
         ("檢查相位", "與其他軌一起播，確認沒有抵銷"), ("微調", "必要時逐句手動對"),
         ("記錄", "把補償值寫下來，下次直接用")],
        "延遲是固定值，量一次就好；每次重錄都重新量只是浪費時間。"),
    "flow-comping": ("人聲 Comping 的完整流程",
        "先選、再接、最後修；順序錯了會一直回頭",
        [("聽一輪", "整首聽完，標出每 Take 最好的一句"), ("建立 Comp", "把選到的段落拼起來"),
         ("交叉淡化", "每個交界做 5–15 ms"), ("清理", "處理喀噠聲與換氣"),
         ("再聽一輪", "整段播，確認沒有拼接感")],
        "拼接感通常來自音量不一致；先對齊音量再談淡化。"),
    "flow-signal-chain-position": ("調變效果在訊號鏈的哪裡",
        "位置不同，聲音完全不同",
        [("之前", "放在壓縮前：會讓壓縮反應跟著動"), ("之後", "放在壓縮後：比較穩定"),
         ("並聯", "用 Send 送一部分出去混回來"), ("結論", "先試「之後」，最容易控制")],
        "Chorus 放太前面會讓壓縮器無所適從；不確定就先放最後。"),
    "flow-recording-habits": ("專業錄音師的五個習慣",
        "錄音品質的差距，多半在按下錄音鍵之前就決定了",
        [("先測音量", "每軌試錄 20 秒，看峰值"), ("標好名字", "軌道命名與顏色"),
         ("開錄前確認", "每一軌都過一次耳機"), ("留一份原始檔", "不要在原檔上編輯"),
         ("當天備份", "至少兩個地方")],
        "這五件事每次錄音都做一遍，省下的時間遠比做的時間多。"),
})

for _k, (_title, _sub, _bands, _note, _marks) in EQ_FIGURES.items():
    FIGURES[_k] = make_eq(_title, _sub, _bands, _note, _marks)
for _k, (_title, _sub, _th, _ra, _kn, _note) in COMP_FIGURES.items():
    FIGURES[_k] = make_comp(_title, _sub, _th, _ra, _kn, _note)
for _k, (_title, _sub, _rt, _pre, _note) in DECAY_FIGURES.items():
    FIGURES[_k] = make_decay(_title, _sub, _rt, _pre, _note)
for _k, (_title, _sub, _peaks, _note) in MASK_FIGURES.items():
    FIGURES[_k] = make_masking(_title, _sub, _peaks, _note)
for _k, (_title, _sub, _items, _note) in FLOW_FIGURES.items():
    FIGURES[_k] = make_flow(_title, _sub, _items, _note)
for _k, (_title, _sub, _cols, _rows, _note) in CMP_FIGURES.items():
    FIGURES[_k] = make_cmp(_title, _sub, _cols, _rows, _note)


def fig_buffer_latency_chart():
    """3-4：Buffer 大小與延遲的關係（48 kHz 下）。"""
    w, h = 660, 372
    b = []
    x0, y0, x1, y1 = 90, 100, 560, 300
    sizes = [32, 64, 128, 256, 512, 1024]
    lat = [s / 48000 * 1000 * 2 for s in sizes]   # 來回＝兩倍
    mx = max(lat)
    b.append(vf.ts(26, 82, "Buffer 越小延遲越低，但越容易爆音；48 kHz 下單趟延遲＝Buffer ÷ 48000。", size=11.5))
    for i in range(5):
        yy = y0 + (y1 - y0) * i / 4
        b.append(vf.path(f"M{x0} {yy:.1f} L{x1} {yy:.1f}", cls="thin", sw=0.8, opacity=0.5))
    for i, (s, ms) in enumerate(zip(sizes, lat)):
        xx = x0 + (x1 - x0) * i / (len(sizes) - 1)
        hh = (y1 - y0) * ms / mx
        b.append(vf.rect(xx - 18, y1 - hh, 36, hh, fill=vf.ACCENT_SOFT, stroke=vf.ACCENT, rx=4))
        b.append(vf.t(xx, y1 - hh - 6, f"{ms:.1f}", size=9.5, anchor="middle", color=vf.ACCENT))
        b.append(vf.ts(xx, y1 + 16, str(s), size=9.5, anchor="middle", color=vf.MUTED))
    b.append(vf.ts((x0 + x1) / 2, y1 + 34, "Buffer Size（samples）", size=9.5, anchor="middle", color=vf.MUTED))
    b.append(vf.ts(26, 352, "錄音時 128–256 是常見折衷；混音時可以拉到 1024，反正不需要即時。", size=11))
    return w, h, "Buffer 大小與延遲", "來回延遲（毫秒）大約是 Buffer 的兩倍", "".join(b), None


def fig_automation_curve():
    """26：Automation 的自然曲線。"""
    w, h = 660, 330
    b = []
    x0, y0, x1, y1 = 80, 96, 580, 270
    b.append(vf.path(f"M{x0} {y1} L{x1} {y1}", cls="thin", sw=1))
    b.append(vf.path(f"M{x0} {y0} L{x0} {y1}", cls="thin", sw=1))
    pts = [f"{x0} {y1 - 20}"]
    import math as _m
    for i in range(1, 101):
        u = i / 100
        v = 1 / (1 + _m.exp(-(u - 0.5) * 9))     # S 曲線
        pts.append(f"{x0 + u * (x1 - x0):.1f} {y1 - 20 - v * (y1 - y0 - 40):.1f}")
    b.append(vf.path("M" + " L".join(pts), cls="acc", sw=2))
    b.append(vf.path(f"M{x0} {y1 - 20} L{x1} {y1 - 20}", cls="thin", sw=1, dash="4 4"))
    b.append(vf.ts(x0 + 4, y1 - 26, "主歌（小聲）", size=9.5, color=vf.MUTED))
    b.append(vf.ts(x1 - 4, y0 + 10, "副歌（大聲）", size=9.5, anchor="end", color=vf.ACCENT))
    b.append(vf.ts((x0 + x1) / 2, y1 + 18, "時間 →", size=9.5, anchor="middle", color=vf.MUTED))
    b.append(vf.ts(26, 312, "手畫的直線會聽起來很假；用 S 曲線，或把「開始變大」的地方往後推一點。", size=11))
    return w, h, "Automation 的自然曲線", "音量慢慢推上去，比突然跳上去好聽", "".join(b), None


def fig_postrock_arc():
    """24：後搖滾的動態曲線。"""
    w, h = 660, 330
    b = []
    x0, y0, x1, y1 = 80, 96, 580, 270
    b.append(vf.path(f"M{x0} {y1} L{x1} {y1}", cls="thin", sw=1))
    import math as _m
    marks = [(0.0, 0.12), (0.25, 0.18), (0.45, 0.35), (0.62, 0.95), (0.8, 0.75), (1.0, 0.2)]
    pts = []
    for i in range(121):
        u = i / 120
        v = 0.12
        for k in range(len(marks) - 1):
            a, b2 = marks[k], marks[k + 1]
            if a[0] <= u <= b2[0]:
                t = (u - a[0]) / max(1e-6, b2[0] - a[0])
                v = a[1] + (b2[1] - a[1]) * (t * t * (3 - 2 * t))
                break
        pts.append(f"{x0 + u * (x1 - x0):.1f} {y1 - v * (y1 - y0):.1f}")
    b.append(vf.path("M" + " L".join(pts), cls="acc", sw=2))
    for name, u in (("安靜的鋪陳", 0.2), ("累積", 0.45), ("爆裂", 0.62), ("收", 0.95)):
        b.append(vf.ts(x0 + u * (x1 - x0), y1 + 18, name, size=9.5, anchor="middle", color=vf.MUTED))
    b.append(vf.ts(26, 300, "後搖滾靠的是「長時間的安靜」換「一次徹底的爆裂」；爆完一定要收，否則沒有對比。", size=11))
    return w, h, "後搖滾的動態弧線", "安靜 → 累積 → 爆裂 → 收", "".join(b), None


FIGURES.update({
    "buffer-latency-chart": fig_buffer_latency_chart,
    "automation-curve": fig_automation_curve,
    "postrock-arc": fig_postrock_arc,
})

CMP_FIGURES.update({
    "cmp-recording-quality": ("「好錄音」與「頂級錄音」差在哪",
        "差的不是器材等級，是那些事後修不回來的東西",
        ["項目", "好錄音", "頂級錄音"],
        [("空間", "安靜、沒有明顯反射", "連殘響都選過"),
         ("動態", "沒有爆、沒有底噪", "保留了完整的表情"),
         ("音準與節奏", "事後修得回來", "一開始就對"),
         ("音色", "清楚", "一聽就知道是什麼樂器")],
        "前三項修不回來，後兩項可以；所以錄音時把力氣花在前三項。"),
})
for _k, (_title, _sub, _cols, _rows, _note) in CMP_FIGURES.items():
    if _k not in FIGURES:
        FIGURES[_k] = make_cmp(_title, _sub, _cols, _rows, _note)

def build(names=None):
    written = []
    for key, fn in FIGURES.items():
        if names and key not in names:
            continue
        vf._TEXTS.clear()
        w, h, title, sub, body, note = fn()
        svg = vf.frame(w, h, title, body, subtitle=sub, note=note)
        for a, b_ in vf.text_overlaps():
            print(f"  ! {key}: 「{a}」與「{b_}」重疊", file=sys.stderr)
        target = OUT_DIR / f"{key}.svg"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(svg, encoding="utf-8")
        written.append(target)
    return written


def sheet(path: Path):
    cards = []
    for key, fn in FIGURES.items():
        vf._TEXTS.clear()
        w, h, title, sub, body, note = fn()
        svg = vf.frame(w, h, title, body, subtitle=sub, note=note)
        cards.append(f'<figure><figcaption>{key}.svg</figcaption><div class="art">{svg}</div></figure>')
    html = f"""<!doctype html><meta charset="utf-8"><title>錄音後製示意圖對照表</title>
<style>
 body {{ margin:0; padding:32px; background:#EFE9E2; font-family:system-ui,sans-serif; }}
 h1 {{ font-size:18px; margin:0 0 24px; color:#3D3229; }}
 .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:24px; }}
 figure {{ margin:0; background:#fff; border:1px solid #D9CFC4; border-radius:10px; overflow:hidden; }}
 figcaption {{ font:12px/1 ui-monospace,monospace; color:#8C8078; padding:8px 12px; border-bottom:1px solid #eee; }}
 .art svg {{ display:block; width:100%; height:auto; }}
</style>
<h1>錄音後製示意圖對照表 · {len(FIGURES)} 張</h1>
<div class="grid">{''.join(cards)}</div>"""
    path.write_text(html, encoding="utf-8")


def main(argv):
    names = [a for a in argv if not a.startswith("-")]
    written = build(set(names) or None)
    for p in written:
        print("wrote", p.relative_to(BASE_DIR))
    print(f"{len(written)} figures")
    if "--sheet" in argv:
        target = BASE_DIR / "work" / "digitalmusic-figures.html"
        target.parent.mkdir(exist_ok=True)
        sheet(target)
        print("sheet", target.relative_to(BASE_DIR))


if __name__ == "__main__":
    main(sys.argv[1:])
