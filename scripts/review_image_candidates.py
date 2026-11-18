#!/usr/bin/env python3
"""Build contact sheets for reviewing instrument-image candidates.

Reads work/missing_images.json, downloads candidate thumbnails into
work/candidates/, and lays them out as labelled sheets so a human (or a vision
pass) can confirm each pick is the right instrument before anything is written
into content/.

Two layouts:
  --mode grid   one thumbnail per instrument, many per sheet (fast scan)
  --mode rows   one instrument per row with all its candidates (Commons hits
                that need a closer look)

Usage:
    python scripts/review_image_candidates.py --mode grid
    python scripts/review_image_candidates.py --mode rows --only sho,sipsi
"""
import io
import json
import sys
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
WORK = BASE_DIR / "work"
CAND_DIR = WORK / "candidates"
SHEET_DIR = WORK / "sheets"
IN_FILE = WORK / "missing_images.json"
HEADERS = {"User-Agent": "WorldMusicalInstrumentsWiki/1.0 (educational non-commercial project)"}

CELL = 210
LABEL_W = 230
PAD = 8


def download(url, dest, attempts=4):
    """Fetch a thumbnail, waiting out 429s — the image CDN throttles this host."""
    if dest.exists() and dest.stat().st_size > 512:
        try:
            return Image.open(dest)
        except Exception:
            dest.unlink(missing_ok=True)
    for i in range(attempts):
        time.sleep(1.2 + i)
        try:
            r = requests.get(url, headers=HEADERS, timeout=(5, 25))
        except Exception:
            continue
        if r.status_code == 429:
            wait = min(float(r.headers.get("Retry-After") or 30), 90)
            time.sleep(wait)
            continue
        if r.status_code != 200 or len(r.content) < 512:
            return None
        try:
            dest.write_bytes(r.content)
            return Image.open(io.BytesIO(r.content))
        except Exception:
            return None
    return None


def fit(img, box):
    img = img.convert("RGB")
    img.thumbnail((box, box), Image.LANCZOS)
    return img


def safe_name(name):
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)[:80]


def get_image(slug, idx, cand):
    return download(cand["url"], CAND_DIR / f"{slug}__{idx}__{safe_name(cand['file'])}")


def grid_sheets(records, cols=6, rows=4):
    per = cols * rows
    chunks = [records[i : i + per] for i in range(0, len(records), per)]
    for n, chunk in enumerate(chunks, 1):
        w = cols * (CELL + PAD) + PAD
        h = rows * (CELL + PAD) + PAD
        sheet = Image.new("RGB", (w, h), "#ffffff")
        draw = ImageDraw.Draw(sheet)
        labels = []
        for k, rec in enumerate(chunk):
            cand = rec["candidates"][0]
            img = get_image(rec["slug"], 0, cand)
            x = PAD + (k % cols) * (CELL + PAD)
            y = PAD + (k // cols) * (CELL + PAD)
            draw.rectangle([x, y, x + CELL - 1, y + CELL - 1], outline="#cccccc")
            if img:
                thumb = fit(img, CELL - 26)
                sheet.paste(thumb, (x + (CELL - thumb.width) // 2, y + (CELL - 26 - thumb.height) // 2))
            draw.text((x + 2, y + CELL - 22), rec["slug"][:30], fill="#000000")
            draw.text((x + 2, y + CELL - 11), rec["title_zh"][:16], fill="#666666")
            labels.append(rec["slug"])
        path = SHEET_DIR / f"grid_{n:02d}.png"
        sheet.save(path)
        print(f"{path.name}: {' '.join(labels)}")
    return len(chunks)


def row_sheets(records, cols=4, rows=5):
    chunks = [records[i : i + rows] for i in range(0, len(records), rows)]
    for n, chunk in enumerate(chunks, 1):
        w = LABEL_W + cols * (CELL + PAD) + PAD
        h = PAD + len(chunk) * (CELL + PAD)
        sheet = Image.new("RGB", (w, h), "#ffffff")
        draw = ImageDraw.Draw(sheet)
        labels = []
        for r, rec in enumerate(chunk):
            y = PAD + r * (CELL + PAD)
            draw.text((PAD, y + 4), rec["slug"][:30], fill="#000000")
            draw.text((PAD, y + 22), rec["title_en"][:30], fill="#555555")
            draw.text((PAD, y + 40), rec["title_zh"][:14], fill="#555555")
            marks = []
            for c, cand in enumerate(rec["candidates"][:cols]):
                img = get_image(rec["slug"], c, cand)
                x = LABEL_W + c * (CELL + PAD)
                draw.rectangle([x, y, x + CELL - 1, y + CELL - 1], outline="#cccccc")
                if img:
                    thumb = fit(img, CELL - 26)
                    sheet.paste(thumb, (x + (CELL - thumb.width) // 2, y + (CELL - 26 - thumb.height) // 2))
                draw.text((x + 2, y + CELL - 22), f"#{c} {cand['file'][:24]}", fill="#000000")
                draw.text((x + 2, y + CELL - 11), cand["via"][:30], fill="#666666")
                marks.append(str(c))
            labels.append(f"{rec['slug']}({','.join(marks)})")
        path = SHEET_DIR / f"rows_{n:02d}.png"
        sheet.save(path)
        print(f"{path.name}: {' '.join(labels)}")
    return len(chunks)


def main():
    mode = sys.argv[sys.argv.index("--mode") + 1] if "--mode" in sys.argv else "grid"
    only = None
    if "--only" in sys.argv:
        only = {s.strip() for s in sys.argv[sys.argv.index("--only") + 1].split(",")}

    records = json.loads(IN_FILE.read_text(encoding="utf-8"))
    if only:
        records = [r for r in records if r["slug"] in only]
    records = [r for r in records if r["candidates"]]

    CAND_DIR.mkdir(parents=True, exist_ok=True)
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    for old in SHEET_DIR.glob(f"{'grid' if mode == 'grid' else 'rows'}_*.png"):
        old.unlink()

    n = grid_sheets(records) if mode == "grid" else row_sheets(records)
    print(f"\n{len(records)} instruments, {n} sheets in {SHEET_DIR}")


if __name__ == "__main__":
    main()
