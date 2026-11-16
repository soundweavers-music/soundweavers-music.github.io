#!/usr/bin/env python3
"""Turn the supplied artwork into web-ready brand assets.

Source: content/image/LOGO.png (1254² watercolour) and BANNER.png (1672×941).
Output (in assets/brand/):
  logo.png     crop of the illustration only (no wordmark) — header mark
  favicon.png  64² mark for the tab icon
  banner.webp  full banner, downscaled
  banner-narrow.webp  centre crop for phones

Idempotent; pass --force to re-encode.

Usage: python scripts/prepare_brand_assets.py [--force]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
SRC = BASE_DIR / "content" / "image"
OUT = BASE_DIR / "assets" / "brand"


def crop_mark(im: Image.Image) -> Image.Image:
    """Keep the house/guitar/mic illustration, drop the 「隔壁織音人」 wordmark."""
    w, h = im.size
    return im.crop((int(w * 0.08), int(h * 0.03), int(w * 0.92), int(h * 0.62)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    logo_src = SRC / "LOGO.png"
    banner_src = SRC / "BANNER.png"

    # header mark — 256px wide is plenty for a 32px display slot at 2×
    mark = crop_mark(Image.open(logo_src).convert("RGB"))
    mark.resize((256, round(256 * mark.height / mark.width)), Image.LANCZOS).save(
        OUT / "logo.png", optimize=True)

    # favicon — square crop centred on the house
    w, h = mark.size
    side = min(w, h)
    sq = mark.crop(((w - side) // 2, 0, (w + side) // 2, side))
    sq.resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png", optimize=True)

    # banner — full width, and a square-ish centre crop for mobile
    ban = Image.open(banner_src).convert("RGB")
    if args.force or not (OUT / "banner.webp").exists():
        ban.resize((1400, round(1400 * ban.height / ban.width)), Image.LANCZOS).save(
            OUT / "banner.webp", "WEBP", quality=82, method=6)
        bw, bh = ban.size
        cw = int(bh * 1.15)
        left = (bw - cw) // 2
        ban.crop((left, 0, left + cw, bh)).resize((760, round(760 * bh / cw)), Image.LANCZOS).save(
            OUT / "banner-narrow.webp", "WEBP", quality=82, method=6)

    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:<22} {f.stat().st_size / 1024:>7.0f} KB")


if __name__ == "__main__":
    main()
