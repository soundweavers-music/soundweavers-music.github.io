"""Download album covers for content/discography.json into assets/brand/albums/.

Artwork comes from the iTunes Lookup API (Apple Music). Covers are stored
locally as webp so the site never hotlinks third-party images.

    python scripts/fetch_album_covers.py          # skip covers that already exist
    python scripts/fetch_album_covers.py --force  # re-download everything
"""
import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
DATA = BASE_DIR / "content" / "discography.json"
OUT_DIR = BASE_DIR / "assets" / "brand" / "albums"
SIZE = 480


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    albums = json.loads(DATA.read_text(encoding="utf-8"))["released"]
    for a in albums:
        out = OUT_DIR / f"{a['apple']}.webp"
        if out.exists() and not force:
            continue
        info = json.loads(fetch(f"https://itunes.apple.com/lookup?id={a['apple']}&country=tw"))
        art = info["results"][0]["artworkUrl100"].replace("100x100bb", f"{SIZE * 2}x{SIZE * 2}bb")
        img = Image.open(io.BytesIO(fetch(art))).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
        img.save(out, "WEBP", quality=82, method=6)
        print(f"{out.name}  {out.stat().st_size // 1024}KB  {a['title']}")


if __name__ == "__main__":
    main()
