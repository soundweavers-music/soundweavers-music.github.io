#!/usr/bin/env python3
"""錄音後製課程的「定量圖」：EQ 曲線、壓縮轉換曲線、殘響衰減、遮蔽、LFO。

這些圖的座標都是真的算出來的（對數頻率軸、dB 軸、時間軸），不是示意畫，
所以圖上標的數字和曲線是同一件事。

由 `build_digitalmusic_figures.py` 匯入，沿用它的色票與文字工具。
"""
from __future__ import annotations

import math

# 頻率軸：20 Hz – 20 kHz，對數
F_MIN, F_MAX = 20.0, 20000.0
DB_MIN, DB_MAX = -18.0, 18.0


def _x(f, x0, x1):
    return x0 + (math.log10(max(f, F_MIN) / F_MIN) / math.log10(F_MAX / F_MIN)) * (x1 - x0)


def _y(db, y0, y1):
    return y1 - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * (y1 - y0)


def grid(x0, y0, x1, y1, t, ts, path, LINE, MUTED):
    """EQ 圖的格線：0 dB 實線、±6/±12 虛線、頻率刻度。"""
    out = []
    for db in (12, 6, 0, -6, -12):
        yy = _y(db, y0, y1)
        sw = 1.3 if db == 0 else 1
        out.append(path(f"M{x0} {yy:.1f} L{x1} {yy:.1f}", cls="thin", sw=sw))
        out.append(ts(x0 - 6, yy + 3.5, f"{db:+d}" if db else "0", size=9, anchor="end", color=MUTED))
    for f in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        xx = _x(f, x0, x1)
        out.append(path(f"M{xx:.1f} {y0} L{xx:.1f} {y1}", cls="thin", sw=0.8, opacity=0.5))
        label = f"{f // 1000}k" if f >= 1000 else str(f)
        out.append(ts(xx, y1 + 14, label, size=8.5, anchor="middle", color=MUTED))
    out.append(ts(x1, y1 + 26, "Hz", size=8.5, anchor="end", color=MUTED))
    return out


def bell_db(f, fc, gain, q):
    """鐘形濾波器的近似響應。"""
    if f <= 0 or fc <= 0:
        return 0.0
    octaves = math.log2(f / fc)
    sigma = max(0.12, 0.9 / max(q, 0.3))
    return gain * math.exp(-(octaves ** 2) / (2 * sigma ** 2))


def shelf_db(f, fc, gain, high=True, q=0.7):
    r = math.log2(max(f, 1) / fc)
    shape = 1 / (1 + math.exp(-r * 2.5)) if high else 1 / (1 + math.exp(r * 2.5))
    return gain * shape


def hp_db(f, fc, order=2):
    r = f / fc
    return -20 * math.log10(math.sqrt(1 + (fc / max(f, 1)) ** (2 * order)))


def lp_db(f, fc, order=2):
    r = f / fc
    return -20 * math.log10(math.sqrt(1 + (f / fc) ** (2 * order)))


def eq_curve(x0, y0, x1, y1, bands, path):
    """bands: list of dict(kind='bell'|'hp'|'lp'|'shelf', f=, gain=, q=)"""
    pts = []
    n = 160
    for i in range(n + 1):
        f = F_MIN * (F_MAX / F_MIN) ** (i / n)
        db = 0.0
        for b in bands:
            k = b.get("kind", "bell")
            if k == "bell":
                db += bell_db(f, b["f"], b["gain"], b.get("q", 1.0))
            elif k == "hp":
                db += hp_db(f, b["f"], b.get("order", 2))
            elif k == "lp":
                db += lp_db(f, b["f"], b.get("order", 2))
            elif k == "high_shelf":
                db += shelf_db(f, b["f"], b["gain"], True)
            elif k == "low_shelf":
                db += shelf_db(f, b["f"], b["gain"], False)
        db = max(DB_MIN, min(DB_MAX, db))
        pts.append(f"{_x(f, x0, x1):.1f} {_y(db, y0, y1):.1f}")
    return path("M" + " L".join(pts), cls="acc", sw=2.0)


def comp_curve(x0, y0, x1, y1, threshold=-24.0, ratio=4.0, knee=6.0, path=None,
               line_only=False):
    """輸入/輸出轉換曲線（dB）。x=輸入、y=輸出，範圍 -60…0。"""
    lo, hi = -60.0, 0.0

    def to_x(v):
        return x0 + (v - lo) / (hi - lo) * (x1 - x0)

    def to_y(v):
        return y1 - (v - lo) / (hi - lo) * (y1 - y0)

    pts = []
    for i in range(101):
        inp = lo + (hi - lo) * i / 100
        if inp <= threshold - knee / 2:
            out = inp
        elif inp >= threshold + knee / 2:
            out = threshold + (inp - threshold) / ratio
        else:  # 軟膝
            x = inp - (threshold - knee / 2)
            out = inp + (1 / ratio - 1) * (x ** 2) / (2 * knee)
        pts.append(f"{to_x(inp):.1f} {to_y(min(out, 0)):.1f}")
    body = [path("M" + " L".join(pts), cls="acc", sw=2.0)]
    body.append(path(f"M{to_x(lo)} {to_y(lo)} L{to_x(hi)} {to_y(hi)}", cls="thin", sw=1, opacity=0.5))
    if not line_only:
        body.append(path(f"M{to_x(threshold)} {y0} L{to_x(threshold)} {y1}", cls="thin", sw=1, opacity=0.6))
        body.append(path(f"M{x0} {to_y(threshold)} L{x1} {to_y(threshold)}", cls="thin", sw=1, opacity=0.6))
    return "".join(body)


def decay_curve(x0, y0, x1, y1, rt60=2.0, pre_delay=0.02, path=None, n=140):
    """殘響衰減：60 dB 的時間為 rt60 秒；pre-delay 之後才開始。"""
    total = rt60 * 1.08
    pts = []
    for i in range(n + 1):
        tsec = total * i / n
        if tsec < pre_delay:
            db = 0.0
        else:
            db = -60.0 * min(1.0, (tsec - pre_delay) / rt60)
        xx = x0 + (tsec / total) * (x1 - x0)
        yy = y1 - ((db + 60) / 60) * (y1 - y0)
        pts.append(f"{xx:.1f} {yy:.1f}")
    return path("M" + " L".join(pts), cls="acc", sw=2.0)


def spectrum(x0, y0, x1, y1, peak_hz=1000.0, width=1.2, amp=1.0, cls="acc", path=None):
    """一個「頻譜山丘」，用來畫遮蔽。"""
    pts = []
    for i in range(121):
        f = F_MIN * (F_MAX / F_MIN) ** (i / 120)
        v = amp * math.exp(-((math.log2(f / peak_hz)) ** 2) / (2 * width ** 2))
        xx = _x(f, x0, x1)
        yy = y1 - v * (y1 - y0) * 0.9
        pts.append(f"{xx:.1f} {yy:.1f}")
    return path("M" + " L".join(pts), cls=cls, sw=1.8)


def lfo(x0, y0, x1, y1, cycles=3.0, path=None, cls="acc"):
    pts = []
    n = 160
    for i in range(n + 1):
        u = i / n
        v = math.sin(2 * math.pi * cycles * u)
        xx = x0 + u * (x1 - x0)
        yy = (y0 + y1) / 2 - v * (y1 - y0) / 2 * 0.8
        pts.append(f"{xx:.1f} {yy:.1f}")
    return path("M" + " L".join(pts), cls=cls, sw=1.8)
