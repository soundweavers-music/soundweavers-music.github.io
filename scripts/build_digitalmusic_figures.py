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

OUT_DIR = BASE_DIR / "assets" / "digitalmusic"

ACCENT, ACCENT_SOFT = vf.ACCENT, vf.ACCENT_SOFT
BLUE, BLUE_SOFT = vf.BLUE, vf.BLUE_SOFT
GREEN, GREEN_SOFT = vf.GREEN, vf.GREEN_SOFT
RED, RED_SOFT = vf.RED, vf.RED_SOFT
INK, INK2, MUTED, LINE, PANEL = vf.INK, vf.INK2, vf.MUTED, vf.LINE, vf.PANEL

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
}


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
