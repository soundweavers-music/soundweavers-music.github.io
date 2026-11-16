#!/usr/bin/env python3
"""Replace (or drop) frontmatter images that are not photographs of an instrument.

For each instrument whose `image:` points at a book scan, coat of arms, flag or
statue, try to find a real photograph on its Wikipedia article:
  1. the article's lead image (`pageimages`), if the filename looks photographic
  2. otherwise the first File: candidate whose name is not a scan/crest/score

If nothing suitable exists, the image is cleared so the card shows the neutral
placeholder instead of a misleading picture.

Usage: python scripts/fix_bad_images.py [--dry-run] [--slugs a,b]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import time
import urllib.parse
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from verify_instruments import http_json  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
VERIFY_DIR = BASE_DIR / "work" / "verify"
BACKUP_DIR = BASE_DIR / "work" / "backup_images"

BAD = [
    (r"\.pdf(\.jpg)?$", "書頁／PDF 掃描"),
    (r"page1-\d+px", "PDF 書頁縮圖"),
    (r"Arms_of|_arms_|coat_of_arms", "紋章"),
    (r"flag|Flag", "旗幟"),
    (r"Emblem|emblem", "徽章"),
    (r"Signature|signature", "簽名"),
    (r"(?:IA_|_IA)", "Internet Archive 掃描"),
    (r"encyclopedia|_courant_|_Verbs|英國史|盛京時", "書籍／報紙掃描"),
    (r"statue|Statue", "雕像"),
    (r"Commons-logo|\.svg$", "非照片（SVG／標誌）"),
    (r"FClef|GClef|Clef\.", "譜號圖示"),
    (r"Birth_of|Columbus_saints", "與樂器無關的照片"),
]

# wiki article override where title_original does not resolve
ARTICLE = {}


def is_bad(name: str) -> str:
    for pat, why in BAD:
        if re.search(pat, name):
            return why
    return ""


def thumb_url(file_title: str) -> str:
    """Commons thumbnail URL for a File: title."""
    name = file_title.replace("File:", "").replace(" ", "_")
    params = {"action": "query", "format": "json", "titles": f"File:{name}",
              "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 500}
    data = http_json("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params))
    if not data:
        return ""
    for p in data.get("query", {}).get("pages", {}).values():
        info = (p.get("imageinfo") or [{}])[0]
        return info.get("thumburl") or info.get("url") or ""
    return ""


def lead_image(title: str) -> str:
    params = {"action": "query", "format": "json", "redirects": 1,
              "prop": "pageimages", "piprop": "name|thumbnail", "pithumbsize": 500,
              "titles": title}
    data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    if not data:
        return ""
    for p in data.get("query", {}).get("pages", {}).values():
        th = p.get("thumbnail") or {}
        name = p.get("pageimage") or ""
        if th.get("source") and not is_bad(name or th["source"]):
            return th["source"]
    return ""


def article_images(title: str) -> list[str]:
    params = {"action": "query", "format": "json", "redirects": 1,
              "prop": "images", "imlimit": 20, "titles": title}
    data = http_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))
    if not data:
        return []
    out = []
    for p in data.get("query", {}).get("pages", {}).values():
        for img in p.get("images", []):
            name = img["title"].replace("File:", "")
            if not is_bad(name) and re.search(r"\.(jpe?g|png)$", name, re.I):
                out.append(img["title"])
    return out


NAME_STOP = {"the", "and", "instrument", "musical", "music", "world"}


def stems(text: str) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", text.lower())
            if len(w) > 3 and w not in NAME_STOP}


# slug -> extra filename stems that are legitimate for that instrument
ALIAS_STEMS = {
    "rhythm-sticks": {"claves"},
    "litungu": {"lyre", "adungu"},
    "bow-harp": {"adungu"},
    "nyonganyonga": {"mbira"},
    "coconut-lamellophone": {"kalimba", "mbira", "lamellophone"},
    "malagasy-tube-zither": {"valiha", "zither"},
    "ichigenkin": {"koto", "goto"},
    "ry-teki": {"ryuteki", "fue"},
    "mey": {"duduk", "mey"},
    "bamboo-xylophone": {"trung", "xylophone"},
    "bukkehorn": {"bockhorn", "horn"},
    "rain-drum": {"rainstick", "rain"},
    "aboriginal-trumpet": {"didgeridoo"},
}


def plausible(instrument: str, image_name: str, slug: str = "") -> bool:
    """Accept a replacement photo only when its filename shares a name stem
    with the instrument (or a known alias) — that is how 'mey' nearly ended up
    illustrated with a duduk."""
    a = stems(instrument) | ALIAS_STEMS.get(slug, set())
    clean = re.sub(r"^\d+px-|^lossy-page\d+-\d+px-|^MET_", "", image_name)
    b = stems(clean)
    if not a:
        return True
    return bool(a & b)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--slugs", default="")
    args = ap.parse_args()

    if args.slugs:
        paths = [CONTENT_DIR / f"{s.strip()}.md" for s in args.slugs.split(",")]
    else:
        paths = sorted(CONTENT_DIR.glob("*.md"))

    replaced = cleared = 0
    for path in paths:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        head, sep, body = text.partition("\n---\n")
        m = re.search(r"^image:[ \t]*(.*)$", head, re.M)
        if not m or not m.group(1).strip():
            continue
        url = m.group(1).strip()
        why = is_bad(url)
        if not why:
            continue

        ev = VERIFY_DIR / f"{path.stem}.json"
        title = inst_name = ""
        if ev.exists():
            data = json.loads(ev.read_text(encoding="utf-8"))
            title = (data.get("enwiki") or {}).get("title", "")
            inst_name = data.get("title_original") or path.stem
        new_url = ""
        if title:
            cand_url = lead_image(title)
            time.sleep(0.4)
            if cand_url and plausible(inst_name, cand_url, path.stem):
                new_url = cand_url
            if not new_url:
                for cand in article_images(title)[:6]:
                    if not plausible(inst_name, cand, path.stem):
                        continue
                    u = thumb_url(cand)
                    time.sleep(0.4)
                    if u:
                        new_url = u
                        break
        action = "換圖" if new_url else "清除"
        print(f"  {path.stem}: {why} → {action}"
              + (f" {new_url.rsplit('/', 1)[-1][:50]}" if new_url else ""))
        if new_url:
            replaced += 1
        else:
            cleared += 1
        if not args.dry_run:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, BACKUP_DIR / path.name)
            new_head = head[:m.start()] + f"image: {new_url}" + head[m.end():]
            path.write_text(new_head + sep + body, encoding="utf-8")

    print(("DRY RUN " if args.dry_run else "")
          + f"replaced {replaced}, cleared {cleared}")


if __name__ == "__main__":
    main()
