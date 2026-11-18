#!/usr/bin/env python3
"""Reusable teaching-anatomy bases for the vocal-course figures.

The visual language is the one anatomy plates use: flat muted fills, a single
dark outline, thin leader lines ending in a small dot, sans-serif labels.
Shapes are simplified — these are teaching diagrams, not medical plates — but
the relationships are correct (checked against Wikimedia Commons plates and a
laryngoscopy photo: the glottis is a V opening downward, the folds are
pearl-white, the false folds sit above them, the nasal cavity sits above the
hard palate with the pharynx behind the tongue).
"""
from __future__ import annotations

import math

# ── palette ───────────────────────────────────────────────────────────
PAPER = "#fbf8f2"
INK = "#2a2724"
RULE = "#d8d0c2"
SKIN = "#f1e0d6"
MUCOSA = "#e2a99b"
MUCOSA_D = "#cb8f82"
CARTILAGE = "#d5d5c2"
BONE = "#ece6d8"
AIR = "#d5e5e7"
FOLD = "#f6f3ea"
FOLD_D = "#c9c1ac"
MUSCLE = "#cf8f88"
ACCENT = "#b5734a"
ACCENT2 = "#7d9b76"

STYLE = f"""
    .out   {{ fill: none; stroke: {INK}; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }}
    .lead  {{ fill: none; stroke: {INK}; stroke-width: .9; }}
    .dot   {{ fill: {INK}; }}
    .skin  {{ fill: {SKIN}; stroke: {INK}; stroke-width: 1.8; }}
    .muc   {{ fill: {MUCOSA}; stroke: {MUCOSA_D}; stroke-width: 1.2; }}
    .muc2  {{ fill: {MUCOSA_D}; stroke: {INK}; stroke-width: 1.4; }}
    .cart  {{ fill: {CARTILAGE}; stroke: {INK}; stroke-width: 1.5; }}
    .bone  {{ fill: {BONE}; stroke: {INK}; stroke-width: 1.4; }}
    .air   {{ fill: {AIR}; stroke: {INK}; stroke-width: 1.3; }}
    .fold  {{ fill: {FOLD}; stroke: {FOLD_D}; stroke-width: 1.6; }}
    .musc  {{ fill: {MUSCLE}; stroke: {INK}; stroke-width: 1.1; }}
    .hl    {{ fill: {ACCENT}; fill-opacity: .22; stroke: {ACCENT}; stroke-width: 1.7; }}
    .hl2   {{ fill: {ACCENT2}; fill-opacity: .22; stroke: {ACCENT2}; stroke-width: 1.7; }}
    .ink   {{ fill: none; stroke: {INK}; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }}
    .ave   {{ fill: none; stroke: {ACCENT}; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }}
    .ave2  {{ fill: none; stroke: {ACCENT2}; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }}
    .thin  {{ fill: none; stroke: {RULE}; stroke-width: 1.3; stroke-dasharray: 5 5; }}
    .lbl   {{ font-family: 'Noto Sans TC','PingFang TC',system-ui,sans-serif; font-size: 14px; fill: {INK}; }}
    .lbl-s {{ font-family: 'Noto Sans TC','PingFang TC',system-ui,sans-serif; font-size: 12px; fill: #6f6a60; }}
    .lbl-b {{ font-family: 'Noto Sans TC','PingFang TC',system-ui,sans-serif; font-size: 14px; fill: {INK}; font-weight: 700; }}
"""


def T(x, y, s, cls="lbl", anchor=None):
    a = f' text-anchor="{anchor}"' if anchor else ""
    return f'<text class="{cls}" x="{x}" y="{y}"{a}>{s}</text>'


def leader(x1, y1, x2, y2, label=None, cls="lbl", anchor=None, dy=4):
    """Leader line with the endpoint dot that anatomy plates use."""
    out = (f'<path class="lead" d="M{x1} {y1} L{x2} {y2}"/>'
           f'<circle class="dot" cx="{x1}" cy="{y1}" r="2.6"/>')
    if label:
        tx = x2 + (6 if anchor != "end" else -6)
        out += T(tx, y2 + dy, label, cls, anchor)
    return out


def arrow(x1, y1, x2, y2, cls="ave"):
    ang = math.atan2(y2 - y1, x2 - x1)
    h = 10
    p1 = (x2 - h * math.cos(ang - .42), y2 - h * math.sin(ang - .42))
    p2 = (x2 - h * math.cos(ang + .42), y2 - h * math.sin(ang + .42))
    col = ACCENT2 if cls.endswith("2") else ACCENT
    return (f'<path class="{cls}" d="M{x1} {y1} L{x2} {y2}"/>'
            f'<path d="M{x2} {y2} L{p1[0]:.1f} {p1[1]:.1f} L{p2[0]:.1f} {p2[1]:.1f} Z" '
            f'fill="{col}" stroke="none"/>')


def wrap(w, h, body, title):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">
  <title>{title}</title>
  <rect width="{w}" height="{h}" fill="{PAPER}"/>
  <style>{STYLE}  </style>
{body}
</svg>
"""


# ── base 1: sagittal head + neck (facing left) ────────────────────────
HEAD_PROFILE = (
    "M302 92 C252 52 182 58 156 100 C138 128 132 158 138 182 "
    "C144 200 152 210 150 220 C140 230 132 244 134 256 C136 266 144 270 154 268 "
    "C148 278 146 286 152 294 C146 304 148 316 158 322 C150 332 152 344 162 352 "
    "C156 366 160 382 174 392 C198 404 234 406 260 398 "
    "C298 386 322 348 322 298 C322 228 332 130 302 92 Z"
)
NECK = ("M188 380 C202 414 208 468 210 566 L306 566 "
        "C312 496 314 434 306 392 C284 404 224 406 188 380 Z")


def head_sagittal(highlight=None) -> str:
    """Side section. highlight: 'nasal' | 'oral' | 'pharynx' | 'larynx'."""
    f = []
    f.append(f'<path class="skin" d="{NECK}"/>')
    f.append(f'<path class="skin" d="{HEAD_PROFILE}"/>')
    f.append('<path class="ink" d="M300 208 C324 200 342 216 340 238 '
             'C338 258 320 268 304 262"/>')
    f.append('<path class="bone" d="M292 350 L312 350 L316 470 L296 470 Z"/>')
    n = "hl" if highlight == "nasal" else "air"
    f.append(f'<path class="{n}" d="M146 214 C154 200 170 198 186 206 '
             f'C214 218 246 224 272 226 C280 236 280 250 274 258 '
             f'C244 250 208 246 180 250 C164 254 148 256 144 248 '
             f'C140 238 140 224 146 214 Z"/>')
    f.append('<path class="ink" d="M146 246 C158 252 170 254 182 252"/>')
    f.append('<path class="bone" d="M150 262 L276 258 L276 272 L152 278 Z"/>')
    f.append('<path class="muc" d="M276 258 C296 262 304 276 300 290 '
             'C294 302 282 302 276 294 Z"/>')
    o = "hl2" if highlight == "oral" else "muc"
    f.append(f'<path class="{o}" d="M154 280 C196 274 238 272 276 274 '
             f'C284 288 282 310 276 322 C240 330 198 332 158 326 '
             f'C150 312 148 294 154 280 Z"/>')
    f.append('<path class="muc" d="M160 324 C190 304 230 300 272 310 '
             'C278 316 272 324 260 326 C222 332 188 332 160 328 Z"/>')
    for x in (156, 166):
        f.append(f'<path class="ink" d="M{x} 262 L{x} 276"/>')
        f.append(f'<path class="ink" d="M{x} 328 L{x} 340"/>')
    p = "hl" if highlight == "pharynx" else "air"
    f.append(f'<path class="{p}" d="M276 258 L306 256 L312 392 L280 398 Z"/>')
    l = "hl" if highlight == "larynx" else "cart"
    f.append(f'<path class="{l}" d="M280 396 L314 390 L318 448 L284 454 Z"/>')
    f.append('<path class="fold" d="M286 424 L312 420 L312 430 L286 434 Z"/>')
    f.append('<path class="cart" d="M282 390 C270 384 262 394 266 404 '
             'C270 414 282 414 286 406 Z"/>')
    f.append('<path class="air" d="M284 454 L320 448 L326 560 L290 566 Z"/>')
    for i in range(5):
        y = 472 + i * 17
        f.append(f'<path class="ink" d="M{285 + i} {y} L{320 + i} {y - 3}"/>')
    return "\n  ".join(f)


# ── base 2: glottis from above ────────────────────────────────────────
def glottis(gap=0.0, swollen=0.0, hl=None, cx=180, cy=176) -> str:
    """Pearl-white folds forming a V; gap>0 parts them, gap<0 presses them."""
    f = []
    f.append(f'<ellipse class="muc" cx="{cx}" cy="{cy}" rx="110" ry="136"/>')
    f.append(f'<ellipse class="muc2" cx="{cx - 34}" cy="{cy + 112}" rx="17" ry="14"/>')
    f.append(f'<ellipse class="muc2" cx="{cx + 34}" cy="{cy + 112}" rx="17" ry="14"/>')
    inner_l = cx - 5 - gap * 10 - swollen * 6
    inner_r = cx + 5 + gap * 10 + swollen * 6
    outer = 58 + swollen * 8
    a1, a2, a3, a4 = inner_l - 26, inner_l - 54, inner_l - outer, inner_l - outer - 6
    b1, b2, b3, b4 = inner_r + 26, inner_r + 54, inner_r + outer, inner_r + outer + 6
    hl_cls = hl or "fold"
    f.append(f'<path class="{hl_cls}" d="M{cx} {cy - 120} C{inner_l - 14} {cy - 64} '
             f'{inner_l - 10} {cy + 22} {inner_l} {cy + 88} '
             f'C{a1} {cy + 102} {a2} {cy + 96} {a3} {cy + 70} '
             f'C{a4} {cy - 12} {inner_l - 30} {cy - 86} {cx} {cy - 120} Z"/>')
    f.append(f'<path class="{hl_cls}" d="M{cx} {cy - 120} C{inner_r + 14} {cy - 64} '
             f'{inner_r + 10} {cy + 22} {inner_r} {cy + 88} '
             f'C{b1} {cy + 102} {b2} {cy + 96} {b3} {cy + 70} '
             f'C{b4} {cy - 12} {inner_r + 30} {cy - 86} {cx} {cy - 120} Z"/>')
    f.append(f'<path d="M{cx} {cy - 116} L{inner_l} {cy + 86} L{inner_r} {cy + 86} Z" '
             f'fill="{AIR}" stroke="{INK}" stroke-width="1.2"/>')
    return "\n  ".join(f)


# ── base 3: torso, front view ────────────────────────────────────────
def torso(bulge=0, hl=None, lungs=False) -> str:
    waist = 78 + bulge
    f = []
    f.append(f'<path class="skin" d="M180 44 C142 44 120 70 118 106 '
             f'C116 150 {180 - waist} 206 {180 - waist} 264 '
             f'C{180 - waist + 4} 336 132 372 128 406 '
             f'C152 430 208 430 232 406 C228 372 {180 + waist - 4} 336 {180 + waist} 264 '
             f'C{180 + waist} 206 244 150 242 106 C240 70 218 44 180 44 Z"/>')
    if lungs:
        f.append('<path class="air" d="M150 120 C134 152 132 208 142 250 '
                 'C158 258 172 256 178 248 C176 200 170 152 160 122 Z"/>')
        f.append('<path class="air" d="M210 120 C226 152 228 208 218 250 '
                 'C202 258 188 256 182 248 C184 200 190 152 200 122 Z"/>')
        f.append('<path class="air" d="M172 118 L188 118 L188 248 L172 248 Z"/>')
    for i in range(3):
        y = 138 + i * 44
        f.append(f'<path class="ink" d="M140 {y} C170 {y - 9} 190 {y - 9} 220 {y}"/>')
    d = "hl" if hl in (None, "diaphragm") else "cart"
    f.append(f'<path class="{d}" d="M122 296 C152 250 208 250 238 296 '
             f'C210 314 150 314 122 296 Z"/>')
    f.append(f'<ellipse class="muc" cx="180" cy="356" rx="{waist - 16}" ry="32"/>')
    return "\n  ".join(f)


# ── base 4: larynx, side section ─────────────────────────────────────
def larynx_side(hl="true", stretched=False) -> str:
    """Side section: false folds above, true folds below."""
    f = []
    f.append('<path class="cart" d="M96 60 C130 44 210 44 244 60 '
             'C252 110 250 176 240 216 C210 232 130 232 100 216 '
             'C90 176 90 110 96 60 Z"/>')
    f.append('<path class="air" d="M124 76 C160 66 190 66 216 76 '
             'C222 130 220 186 212 216 C182 226 156 226 128 216 '
             'C120 186 118 130 124 76 Z"/>')
    fc = "hl" if hl == "false" else "musc"
    f.append(f'<path class="{fc}" d="M124 118 C144 104 166 102 186 110 '
             f'C192 118 190 126 182 128 C162 122 142 124 126 132 Z"/>')
    f.append(f'<path class="{fc}" d="M216 118 C196 104 174 102 154 110 '
             f'C148 118 150 126 158 128 C178 122 198 124 214 132 Z"/>')
    tc = "hl2" if hl == "true" else "fold"
    if stretched:
        f.append(f'<path class="{tc}" d="M126 168 C150 160 176 160 196 166 '
                 f'C200 172 196 178 188 178 C166 174 146 176 128 180 Z"/>')
        f.append(f'<path class="{tc}" d="M214 168 C190 160 164 160 144 166 '
                 f'C140 172 144 178 152 178 C174 174 194 176 212 180 Z"/>')
    else:
        f.append(f'<path class="{tc}" d="M126 156 C152 146 178 146 198 158 '
                 f'C202 170 196 180 186 182 C162 172 144 174 128 180 Z"/>')
        f.append(f'<path class="{tc}" d="M214 156 C188 146 162 146 142 158 '
                 f'C138 170 144 180 154 182 C178 172 196 174 212 180 Z"/>')
    f.append('<path class="ink" d="M170 140 L192 140"/>')
    f.append('<path class="air" d="M128 218 L212 218 L216 292 L132 292 Z"/>')
    for i in range(4):
        y = 232 + i * 16
        f.append(f'<path class="ink" d="M130 {y} L214 {y}"/>')
    return "\n  ".join(f)


# ── base 5: mouth close-up, sagittal ─────────────────────────────────
def mouth_sagittal(hl_palate=False, hl_tongue=False, lowered=False) -> str:
    f = []
    f.append('<path class="skin" d="M40 120 C60 104 84 100 104 106 '
             'L104 150 C86 146 64 150 44 160 Z"/>')
    f.append('<path class="bone" d="M104 106 C160 92 250 88 320 96 '
             'C352 100 372 110 386 124 L386 140 C350 126 300 120 260 120 '
             'C200 120 150 128 104 150 Z"/>')
    for i in range(4):
        x = 108 + i * 14
        f.append(f'<path class="bone" d="M{x} 124 L{x + 10} 124 L{x + 10} 148 L{x} 148 Z"/>')
        f.append(f'<path class="bone" d="M{x} 214 L{x + 10} 214 L{x + 10} 240 L{x} 240 Z"/>')
    f.append('<path class="skin" d="M40 210 C64 200 86 198 104 202 '
             'L104 250 C84 254 60 248 42 236 Z"/>')
    f.append('<path class="muc" d="M104 240 C170 252 260 254 330 246 '
             'L336 262 C260 272 168 270 104 254 Z"/>')
    tg = "hl" if hl_tongue else "muc"
    f.append(f'<path class="{tg}" d="M108 242 C150 214 210 200 272 204 '
             f'C316 208 340 222 352 236 C342 250 300 258 250 258 '
             f'C196 258 140 254 108 246 Z"/>')
    sy = 128 if not lowered else 176
    sp = "hl" if hl_palate else "muc"
    f.append(f'<path class="{sp}" d="M386 124 C420 132 440 152 436 {sy} '
             f'C428 {sy + 16} 410 {sy + 14} 404 {sy - 2} '
             f'C404 156 396 138 386 140 Z"/>')
    f.append('<path class="air" d="M120 100 C180 78 260 72 330 82 '
             'C356 86 376 94 392 106 C360 96 300 92 240 94 '
             'C190 96 150 104 120 116 Z"/>')
    return "\n  ".join(f)


# ── base 6: standing figure, side view ───────────────────────────────
def body_side(lean=False) -> str:
    hx = 150 if not lean else 178
    sx = 150 if not lean else 128
    sy = 168 if not lean else 156
    hip = 150 if not lean else 136
    return "\n  ".join([
        f'<circle class="skin" cx="{hx}" cy="100" r="30"/>',
        f'<path class="ink" d="M{hx - 10} 128 C{hx - 14} {sy - 14} {sx + 10} {sy - 8} {sx} {sy}"/>',
        f'<path class="ink" d="M{sx} {sy} C{sx - 24} {sy + 34} {sx - 16} 258 {hip} 296"/>',
        f'<path class="ink" d="M{sx} {sy + 4} C{sx + 30} {sy + 38} {sx + 26} 252 {hip + 6} 288"/>',
        f'<path class="ink" d="M{hip} 296 C{hip + 16} 330 {hip + 8} 352 {hip + 2} 374"/>',
        f'<path class="ink" d="M{hip + 6} 290 C{hip + 24} 326 {hip + 18} 352 {hip + 8} 374"/>',
        f'<circle class="muc2" cx="{sx}" cy="{sy}" r="5"/>',
        f'<circle class="muc2" cx="{hip}" cy="296" r="5"/>',
    ])
