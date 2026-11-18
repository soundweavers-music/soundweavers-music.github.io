#!/usr/bin/env python3
"""把點陣參考圖描成我們自己的 SVG 路徑。

為什麼要這支：網站的示意圖底圖要自己畫，但憑空手繪人體／器官的曲線很難
一次抓到比例。這裡把公開授權（CC0／公有領域）的參考圖當「幾何參考」，
描出輪廓後用站上的線條與配色重畫——輸出是我們自己的向量，不內嵌外部圖片。

只用 PIL + numpy，不依賴 skimage／opencv。

    python scripts/trace_figure.py --src a.png --out b.json --threshold 200
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent.parent


def load_mask(path: Path, alpha_cut: int = 128) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    # 有透明通道就用 alpha，否則用「不是白色」
    if a[..., 3].min() < 250:
        return a[..., 3] > alpha_cut
    grey = a[..., :3].mean(axis=2)
    return grey < 235


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """把內部孔洞填滿，只留外輪廓（人形剪影用）。"""
    im = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    w, h = im.size
    # 先補一圈邊框，確保外部連通
    canvas = Image.new("L", (w + 2, h + 2), 0)
    canvas.paste(im, (1, 1))
    ImageDraw.floodfill(canvas, (0, 0), 128)
    arr = np.array(canvas)[1:-1, 1:-1]
    return (arr == 255) | (arr == 0)


def trace_boundary(mask: np.ndarray) -> list[tuple[int, int]]:
    """取外輪廓：先找邊界像素，再用最近鄰走訪把它們串成一圈。

    比逐格 Moore 追蹤簡單，對單一連通塊（人形、器官）也更不容易中斷。
    """
    m = mask.astype(np.uint8)
    # 邊界 = 自己亮、四鄰居有暗的
    padded = np.pad(m, 1)
    neighbours = (
        padded[:-2, 1:-1] + padded[2:, 1:-1] + padded[1:-1, :-2] + padded[1:-1, 2:]
    )
    edge = (m == 1) & (neighbours < 4)
    ys, xs = np.nonzero(edge)
    if len(xs) == 0:
        return []

    # 從最上面的點開始，往右走
    order = np.lexsort((xs, ys))
    pts = list(zip(xs[order], ys[order]))
    remaining = set(pts)
    cur = pts[0]
    remaining.discard(cur)
    contour = [cur]
    while remaining:
        best, best_d = None, None
        for p in remaining:
            d = (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2
            if best_d is None or d < best_d:
                best, best_d = p, d
        if best_d is None or best_d > 900:      # 距離超過 30px 視為斷開
            break
        contour.append(best)
        remaining.discard(best)
        cur = best
    return contour


def rdp(points: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Ramer–Douglas–Peucker 簡化。"""
    if len(points) < 3:
        return points
    x0, y0 = points[0]
    x1, y1 = points[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = (dx * dx + dy * dy) ** 0.5 or 1e-9
    idx, dmax = 0, 0.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * (px - x0) - dx * (py - y0)) / norm
        if d > dmax:
            idx, dmax = i, d
    if dmax > eps:
        left = rdp(points[:idx + 1], eps)
        right = rdp(points[idx:], eps)
        return left[:-1] + right
    return [points[0], points[-1]]


def to_path(points: list[tuple[float, float]], scale=1.0, dx=0.0, dy=0.0) -> str:
    if not points:
        return ""
    pts = [(x * scale + dx, y * scale + dy) for x, y in points]
    d = [f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"]
    for x, y in pts[1:]:
        d.append(f"L{x:.1f} {y:.1f}")
    d.append("Z")
    return " ".join(d)


def main(argv) -> int:
    src = Path(argv[argv.index("--src") + 1])
    out = Path(argv[argv.index("--out") + 1])
    eps = float(argv[argv.index("--eps") + 1]) if "--eps" in argv else 1.6
    alpha_cut = int(argv[argv.index("--threshold") + 1]) if "--threshold" in argv else 128

    mask = load_mask(src, alpha_cut)
    # --close x1,y1,x2,y2：把指定區域先填滿（用來「閉嘴」等封口）
    if "--close" in argv:
        x1, y1, x2, y2 = [int(v) for v in argv[argv.index("--close") + 1].split(",")]
        mask[y1:y2, x1:x2] = True
    if "--no-fill" not in argv:
        mask = fill_holes(mask)
    # 縮小以加快追蹤，之後再放大回座標
    step = 4
    small = mask[::step, ::step]
    contour = trace_boundary(small)
    if not contour:
        print("no contour found")
        return 1
    contour = [(x * step, y * step) for x, y in contour]
    simple = rdp(contour, eps)
    data = {"points": [[float(x), float(y)] for x, y in simple],
            "bbox": [int(mask.shape[1]), int(mask.shape[0])]}
    out.write_text(json.dumps(data), encoding="utf-8")
    print(f"traced {len(contour)} -> {len(simple)} points, bbox {data['bbox']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
