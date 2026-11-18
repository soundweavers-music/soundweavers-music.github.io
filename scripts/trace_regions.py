#!/usr/bin/env python3
"""把參考圖「分色區」描成向量：每一種顏色各自描輪廓，輸出 JSON。

用在有多層構造的解剖圖（骨、軟骨、肌肉各一色）。跟 trace_figure.py 的差別：
那支只描單一剪影，這支會把每個色塊的每個連通區都描出來，之後由
build_vocal_figures.py 依圖層順序畫成我們自己的 SVG。

    python scripts/trace_regions.py --src a.png --out b.json --colors 6 --eps 2

只用 PIL + numpy。
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

BASE = Path(__file__).resolve().parent.parent


def flatten(im: Image.Image) -> Image.Image:
    """把透明區域壓平成白色，腔室才會變成可描的「色面」。"""
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, im).convert("RGB")


def quantise(im: Image.Image, bins: int = 24) -> tuple[np.ndarray, np.ndarray]:
    """把顏色量化成少數幾類，回傳 (分類索引圖, 每類代表色)。"""
    rgb = np.array(im.convert("RGB")).astype(np.int32)
    key = (rgb[..., 0] // bins) * 10_000 + (rgb[..., 1] // bins) * 100 + (rgb[..., 2] // bins)
    uniq, inverse = np.unique(key, return_inverse=True)
    centres = np.zeros((len(uniq), 3), dtype=np.int32)
    for i, k in enumerate(uniq):
        if k < 0:
            continue
        mask = key == k
        centres[i] = rgb[mask].mean(axis=0).astype(np.int32)
    return inverse.reshape(key.shape), centres


def components(mask: np.ndarray, min_area: int) -> list[np.ndarray]:
    """四連通標記，回傳每個連通區的座標陣列。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            cells = []
            while q:
                cy, cx = q.popleft()
                cells.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(cells) >= min_area:
                out.append(np.array(cells))
    return out


from trace_figure import trace_boundary  # noqa: E402  同一套邊界追蹤


def boundary_points(cells: np.ndarray) -> list[tuple[int, int]]:
    """用連通區自己的遮罩跑邊界追蹤，保留真實輪廓。"""
    ys, xs = cells[:, 0], cells[:, 1]
    y0, x0 = ys.min(), xs.min()
    sub = np.zeros((ys.max() - y0 + 1, xs.max() - x0 + 1), dtype=bool)
    sub[ys - y0, xs - x0] = True
    pts = trace_boundary(sub)
    return [(x + int(x0), y + int(y0)) for x, y in pts]


def _unused_boundary_points(cells: np.ndarray) -> list[tuple[int, int]]:
    """把一個連通區的邊界點依角度排序，形成封閉多邊形（足夠畫出色塊用）。"""
    ys, xs = cells[:, 0], cells[:, 1]
    cy, cx = ys.mean(), xs.mean()
    # 極座標排序，半徑取邊界上的點
    ang = np.arctan2(ys - cy, xs - cx)
    rad = np.hypot(ys - cy, xs - cx)
    order = np.argsort(ang)
    # 每個角度區間取最外側的點
    buckets: dict[int, tuple[int, int, float]] = {}
    for i in order:
        b = int((ang[i] + np.pi) / (2 * np.pi) * 72) % 72
        if b not in buckets or rad[i] > buckets[b][2]:
            buckets[b] = (int(xs[i]), int(ys[i]), float(rad[i]))
    return [(buckets[b][0], buckets[b][1]) for b in sorted(buckets)]


def rdp(points, eps):
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
        return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)
    return [points[0], points[-1]]


def main(argv) -> int:
    src = Path(argv[argv.index("--src") + 1])
    out = Path(argv[argv.index("--out") + 1])
    bins = int(argv[argv.index("--colors") + 1]) if "--colors" in argv else 24
    eps = float(argv[argv.index("--eps") + 1]) if "--eps" in argv else 2.0
    min_area = int(argv[argv.index("--min-area") + 1]) if "--min-area" in argv else 200

    im = flatten(Image.open(src))
    scale = 2 if max(im.size) > 900 else 1
    if scale > 1:
        im = im.resize((im.width // scale, im.height // scale))

    idx, centres = quantise(im, bins)
    uniq = np.unique(idx)
    regions = []
    bg_index = int(np.where(uniq == -1)[0][0]) if (uniq == -1).any() else -1
    for ci in range(len(centres)):
        if ci == bg_index:
            continue                      # 透明背景不描
        r, g, b = (int(v) for v in centres[ci])
        if 0.299 * r + 0.587 * g + 0.114 * b < 60:
            continue                      # 黑色線稿交給程式自己描邊
        mask = idx == ci
        if mask.sum() < min_area:
            continue
        for cells in components(mask, min_area):
            ys0, xs0 = cells[:, 0], cells[:, 1]
            if (ys0.min() == 0 or xs0.min() == 0
                    or ys0.max() == idx.shape[0] - 1 or xs0.max() == idx.shape[1] - 1):
                continue          # 貼邊＝外背景
            pts = boundary_points(cells)
            if len(pts) < 3:
                continue
            pts = [(x * scale, y * scale) for x, y in pts]
            simple = rdp(pts, eps)
            regions.append({
                "rgb": [int(v) for v in centres[ci]],
                "points": [[int(x), int(y)] for x, y in simple],
                "area": int(len(cells)),
            })

    regions.sort(key=lambda r: -r["area"])
    out.write_text(json.dumps({"size": [int(im.width * scale), int(im.height * scale)],
                               "regions": regions}), encoding="utf-8")
    print(f"{len(regions)} regions -> {out} (largest {regions[0]['area'] if regions else 0}px)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
