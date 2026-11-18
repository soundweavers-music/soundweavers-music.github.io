#!/usr/bin/env python3
"""Vocal-tract sagittal base, traced from a public-domain-style vector plate.

The outline geometry comes from Wikimedia Commons `VocalTract.svg` (CC BY 3.0).
Re-drawing that anatomy by hand never matched the real proportions, so this
module reuses the original paths, recolours them into the site palette and
throws away the original numbering; Chinese labels are added by the figures.

Attribution is part of the licence, so every figure built on this base carries
the credit line the caller supplies (see CREDIT).

Usage:
    from vocal_tract import tract
    body = tract(hl="nasal")          # recoloured paths, 378x400

The paths are loaded from scripts/data/vocal_tract_base.svg at import time.
"""
from __future__ import annotations

import re
from pathlib import Path

import vocal_anatomy as V

SRC = Path(__file__).resolve().parent / "data" / "vocal_tract_base.svg"

CREDIT = "解剖底圖：Wikimedia Commons「VocalTract」CC BY 3.0，本站重新上色標註"

# original fills → palette
FILL_MAP = {
    "#ececec": V.SKIN,
    "#e6e6e6": V.MUCOSA,
    "#000000": V.FOLD,
}

_D = ""


def _load() -> str:
    global _D
    if _D:
        return _D
    raw = SRC.read_text(encoding="utf-8")
    found = []
    for m in re.finditer(r"<path\b[^>]*?/>", raw, re.S):
        tag = m.group(0)
        d = re.search(r'\bd="([^"]+)"', tag, re.S)
        if not d:
            continue
        fill = re.search(r'\bfill="([^"]+)"', tag)
        tf = re.search(r'transform="([^"]+)"', tag)
        found.append((d.group(1), (fill.group(1) if fill else "").lower(),
                      tf.group(1) if tf else None))
    # The head silhouette is the biggest shape and carries the skin tone;
    # every other path is wall/airway geometry, left unfilled so the cavities
    # read as air instead of being painted over.
    biggest = max(found, key=lambda t: len(t[0]))[0]
    paths = []
    for d, fill, tf in found:
        if d == biggest:
            colour = V.SKIN
        elif fill == "#000000":
            colour = V.FOLD
        else:
            colour = "none"
        attr = f' transform="{tf}"' if tf else ""
        paths.append(
            f'<path d="{d}" fill="{colour}" stroke="{V.INK}" '
            f'stroke-width="1.6" stroke-linejoin="round"{attr}/>'
        )
    _D = "\n  ".join(paths)
    return _D


def tract(hl=None) -> str:
    """The base drawing, already placed on the figure canvas (translate 26,18).

    hl: 'nasal' | 'oral' | 'larynx' tints a region in canvas coordinates.
    """
    body = _load()
    inner = [body]
    if hl == "nasal":
        inner.append(f'<ellipse cx="120" cy="172" rx="56" ry="20" fill="{V.ACCENT}" '
                     f'fill-opacity=".20" stroke="{V.ACCENT}" stroke-width="1.8"/>')
    elif hl == "oral":
        inner.append(f'<ellipse cx="122" cy="246" rx="52" ry="28" fill="{V.ACCENT2}" '
                     f'fill-opacity=".20" stroke="{V.ACCENT2}" stroke-width="1.8"/>')
    elif hl == "larynx":
        inner.append(f'<ellipse cx="210" cy="327" rx="24" ry="26" fill="{V.ACCENT}" '
                     f'fill-opacity=".20" stroke="{V.ACCENT}" stroke-width="1.8"/>')
    return f'<g transform="translate(26,18)">' + "\n  ".join(inner) + '</g>'


def credit(x, y, cls="lbl-s"):
    return V.T(x, y, CREDIT, cls)
