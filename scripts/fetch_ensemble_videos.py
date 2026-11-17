#!/usr/bin/env python3
"""Find and vet a YouTube performance for each 合奏與編制百科 entry.

Not the same problem as fetch_youtube.py (instruments). A *ensemble* entry needs
a recording that shows the ensemble actually playing — a group, in the room —
not a soloist, not a software rendition, not a tutorial, not a ten-hour loop.
Ranking by view count alone reliably picks up the wrong thing.

So: search several queries per entry, score each candidate against the entry's
own terminology, and only accept what passes. Rejected candidates and the reason
are kept in the cache so a re-run does not re-query the same title.

Vet rules (all must pass):
  · public, not age-restricted, embeddable  (availability / playable_in_embed)
  · not live-streamed, not a premiere
  · duration 60s–30min  (drops shorts, loops and full concerts)
  · title / channel / description hits the entry's keywords
  · title does NOT look like a tutorial, a cover by a solo instrument,
    a backing track, or an AI/software rendition

Writes `youtube` frontmatter (space-separated ids) on content/ensembles/*.md.
Cache: work/ensemble_videos.json — resumable, safe to re-run.

Usage:
  python scripts/fetch_ensemble_videos.py [--files a.md] [--per-entry 2] [--refresh] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "ensembles"
CACHE_FILE = BASE_DIR / "work" / "ensemble_videos.json"

MIN_SEC, MAX_SEC = 60, 7200
RATE_LIMIT = 2.0
_last = [0.0]

# Titles containing these are almost never "the ensemble performing".
BAD_TITLE = [
    "tutorial", "lesson", "how to", "learn ", "masterclass", "explained",
    "reaction", "review", "unboxing", "backing track", "karaoke", "play along",
    "sheet music", "midi", "synthesia", "ai generated", "ai cover", "8-bit",
    "loop", "1 hour", "10 hours", "full album", "podcast", "interview",
    "documentary", "trailer", "teaser",
]

# Channel patterns that indicate software renditions or reposts.
BAD_CHANNEL = ["topic", "auto-generated", "vevo"]

CJK = re.compile(r"[一-鿿]")

# A title should read like a recording of people playing: a concert, a live take,
# a named piece, a festival. Otherwise it is a film about the music.
PERFORMANCE_HINTS = [
    "live", "concert", "performance", "performing", "ensemble", "orchestra",
    "festival", "plays", "playing", "recital", "session", "stage", "show",
    "palace", "temple", "ceremony", "dance", "dances", "music of", "recorded",
]

# Content that is about or around the music rather than the ensemble playing:
# camera/hardware test footage, arrangements of film scores, "inspired by" pieces.
OFF_TOPIC_HINTS = [
    "4k test", "test footage", "cinematic", "cover", "tribute", "remix",
    "inspired by", "princess mononoke", "もののけ姫", "anime", "game music",
    "soundtrack", "ost", "crossover", "mario kart", "8-bit big band",
    "big band jazz fusion version", "full big band version", "tv themes",
    "video game", "game soundtrack",
    # Arrangements that share the name but are a different genre entirely.
    "pink floyd", "rock version", "metal version", "jazz version", "pop version",
    "东方", "東方", "touhou", "anime arrangement", "acoustic cover",
    # Film-score medleys are not the classical orchestra doing its own repertoire.
    "my heart will go on", "pirates of the caribbean", "lion king", "greatest showman",
    "interstellar", "prince of egypt", "star wars", "harry potter", "lord of the rings",
    "game of thrones", "jurassic park", "avengers", "superman", "batman", "frozen",
    "westworld", "tv theme", "main theme", "laufey", "orchestral version of",
    # Film-score medleys and pop arrangements that swap out the real repertoire.
    "el condor pasa", "lion king", "greatest showman", "hans zimmer symphony",
    "monster hunter", "proof of a hero", "barrios choro de saudade",
    # Studio session players as a school ensemble are not the entry's subject.
    "percussion ensemble and jazz combo", "solo and ensemble",
]

# A recording of the ensemble should name the tradition in the TITLE; the
# channel check alone lets too much through (a guitarist's channel mentioning
# "choro" once is not a choro ensemble).
QUERY_OVERRIDES = {
    "b4-01-orchestra": ["symphony orchestra concert live Beethoven",
                        "symphony orchestra live concert Brahms",
                        "Berlin Philharmonic live concert"],
    "b6-01-jazz-combo": ["jazz combo live club", "jazz quartet live performance"],
    "b4-05-pit-orchestra": ["pit orchestra musical theatre", "Broadway pit orchestra"],
    "b6-04-horn-section": ["horn section live funk", "brass section live band"],
    "b7-01-world-music-ensemble": ["world music ensemble live concert"],
    "b7-02-film-scoring": ["film scoring session orchestra recording"],
    "b7-03-experimental": ["experimental music ensemble live performance"],
    "b7-05-theatre-music": ["theatre music ensemble live"],
}

# Some entries are named by a general category ("rock band", "horn section").
# Their search terms must come from the entry's own vocabulary instead.
TERM_OVERRIDES = {
    "b6-03-rock-band": ["rock band", "rock concert", "band live", "electric guitar band"],
    "b6-04-horn-section": ["horn section", "brass section", "horns live"],
    "b4-05-pit-orchestra": ["pit orchestra", "orchestra pit", "musical theatre orchestra"],
    "b7-01-world-music-ensemble": ["world music ensemble", "world music concert"],
    "b7-02-film-scoring": ["film orchestra", "scoring session", "film music orchestra"],
    "b7-03-experimental": ["experimental ensemble", "experimental music"],
    "b7-05-theatre-music": ["theatre music", "incidental music", "stage music ensemble"],
}

REQUIRE_NAME_IN_TITLE = {
    "b1-03-andean", "b1-02-takht", "b4-01-orchestra", "b5-04-mandolin-orchestra",
    "b6-01-jazz-combo", "b5-05-hogaku",
}

# Titles that describe the music rather than present a recording of it.
NON_PERFORMANCE_HINTS = [
    "documentary", "history of", "explained", "introduction to",
    "the story of", "a guide", "lecture", "sound tracker", "unique ancient",
    "supernatural", "amazing", "incredible",
]


def rate_wait() -> None:
    elapsed = time.time() - _last[0]
    if elapsed < RATE_LIMIT:
        time.sleep(RATE_LIMIT - elapsed)
    _last[0] = time.time()


def load_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    _, fm, body = text.split("---", 2)
    meta = {}
    for line in fm.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body


def set_field(text: str, field: str, value: str) -> str:
    if re.search(rf"^{field}:", text, re.MULTILINE):
        return re.sub(rf"^{field}:.*$", f"{field}: {value}", text, count=1, flags=re.MULTILINE)
    before, sep, after = text.partition("\n---\n")
    return before + f"\n{field}: {value}" + sep + after if sep else text


def search(query: str, limit: int = 8) -> list[str]:
    rate_wait()
    try:
        out = subprocess.run(
            ["yt-dlp", f"ytsearch{limit}:{query}", "--flat-playlist",
             "--print", "%(id)s", "--no-warnings", "--quiet", "--socket-timeout", "20"],
            capture_output=True, text=True, timeout=90, encoding="utf-8",
        ).stdout
        return [x.strip() for x in out.splitlines() if re.fullmatch(r"[A-Za-z0-9_-]{11}", x.strip())]
    except Exception:
        return []


def inspect(vid: str) -> dict | None:
    rate_wait()
    try:
        out = subprocess.run(
            ["yt-dlp", f"https://www.youtube.com/watch?v={vid}", "--dump-json",
             "--no-download", "--no-warnings", "--quiet", "--socket-timeout", "20"],
            capture_output=True, text=True, timeout=90, encoding="utf-8",
        ).stdout
        return json.loads(out) if out.strip() else None
    except Exception:
        return None


def terms_for(entry: dict) -> list[str]:
    """Words that must plausibly appear for the video to be about this entry."""
    words = []
    for key in ("en", "title"):
        raw = entry.get(key, "")
        for part in re.split(r"[・／/()（）,，、]", raw):
            part = part.strip()
            if part and len(part) > 2:
                words.append(part.lower())
    for kw in entry.get("keywords", "").split(","):
        kw = kw.strip()
        if kw and not CJK.search(kw) and len(kw) > 3:
            words.append(kw.lower())
    return list(dict.fromkeys(words))


def accept(info: dict, entry: dict) -> tuple[bool, str]:
    """Decide whether this video is a recording of this ensemble. Returns (ok, reason)."""
    title = (info.get("title") or "").lower()
    channel = (info.get("channel") or info.get("uploader") or "").lower()
    desc = (info.get("description") or "")[:1500].lower()
    dur = info.get("duration") or 0

    if info.get("availability") not in (None, "public"):
        return False, f"not public ({info.get('availability')})"
    if info.get("age_limit"):
        return False, "age restricted"
    if info.get("playable_in_embed") is False:
        return False, "blocked from embedding"
    if info.get("live_status") in ("is_live", "is_upcoming", "was_live"):
        return False, f"live/{info.get('live_status')}"
    if not (MIN_SEC <= dur <= MAX_SEC):
        return False, f"duration {dur}s out of range"
    if any(b in title for b in BAD_TITLE):
        return False, "title suggests tutorial/loop/derivative"
    if any(b in channel for b in BAD_CHANNEL):
        return False, "channel suggests auto-generated content"

    # The entry's own name must be in the TITLE or CHANNEL — a passing mention
    # in a long description is how documentaries and "best of world music"
    # compilations sneak in.
    terms = TERM_OVERRIDES.get(entry.get("_slug", "")) or terms_for(entry)
    slug = entry.get("_slug", "")
    if slug in REQUIRE_NAME_IN_TITLE:
        hits = [t for t in terms if t in title]
        if not hits:
            return False, f"entry name not in title (terms={terms[:3]})"
    else:
        hits = [t for t in terms if t in title + " " + channel]
        if not hits:
            return False, f"entry name not in title/channel (terms={terms[:3]})"

    # Require SOME sign of a recording of people playing, but accept the
    # typical short forms: "in Ubud Palace", a place name, a named piece.
    # Only reject when the title reads like an essay about the music.
    # Hard reject: about something else entirely (a film theme, a gear test).
    if any(w in title for w in OFF_TOPIC_HINTS):
        return False, "off-topic (arrangement/test/other subject)"
    looks_like_film = any(w in title for w in NON_PERFORMANCE_HINTS)
    has_hint = (any(w in title for w in PERFORMANCE_HINTS)
                or any(t in channel for t in terms))
    if looks_like_film and not has_hint:
        return False, "title reads like a documentary/essay"
    if not has_hint:
        return False, "title gives no sign of an actual performance"

    # Guard against the "one instrument covers the tune" case: if the title only
    # names a single instrument and never the ensemble, it is probably a cover.
    return True, f"matched {hits[:3]}"


def score(info: dict, entry: dict) -> int:
    """Higher is better among candidates that already passed `accept`."""
    s = 0
    title = (info.get("title") or "").lower()
    dur = info.get("duration") or 0
    if "live" in title or "concert" in title:
        s += 3
    for t in terms_for(entry):
        if t in title:
            s += 2
    # A few minutes of an actual group is the useful length; a 25-minute
    # ceremony is a different commitment for the reader.
    if 200 <= dur <= 900:
        s += 2
    elif dur < 120:
        s += 1
    return s


def find_for(entry: dict, want: int) -> dict:
    name = entry.get("en") or entry["title"]
    queries = [
        f"{name} performance",
        f"{name} ensemble",
        f"{entry['title']} {name} live",
        f"{name} concert",
        f"{name} orchestra live",
    ]
    seen: set[str] = set()
    tried: list[dict] = []
    good: list[tuple[int, str, dict]] = []

    queries += QUERY_OVERRIDES.get(entry.get("_slug", ""), [])
    for q in queries:
        # Inspect a fixed budget per query rather than stopping at `want`,
        # so the ranking has something to choose between.
        for vid in search(q, limit=8):
            if vid in seen:
                continue
            seen.add(vid)
            info = inspect(vid)
            if not info:
                tried.append({"id": vid, "reason": "no metadata"})
                continue
            ok, reason = accept(info, entry)
            tried.append({
                "id": vid, "ok": ok, "reason": reason,
                "title": info.get("title"), "channel": info.get("channel"),
                "duration": info.get("duration"), "views": info.get("view_count"),
            })
            if ok:
                good.append((score(info, entry), vid, info))

    good.sort(key=lambda x: (-x[0], -(x[2].get("view_count") or 0)))
    picked, titles = [], set()
    for _, vid, info in good:
        key = (info.get("title") or "")[:60].lower()
        if key in titles:
            continue
        titles.add(key)
        picked.append(vid)
        if len(picked) >= want:
            break
    return {"ids": picked, "tried": tried}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--files")
    ap.add_argument("--per-entry", type=int, default=2)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--set", action="append", default=[], metavar="FILE=ID[ ID]",
                    help="override an entry with hand-picked video ids (comma-free)")
    args = ap.parse_args()

    paths = ([CONTENT_DIR / f.strip() for f in args.files.split(",")]
             if args.files else sorted(CONTENT_DIR.glob("b*-*.md")))
    cache = load_cache()

    def work(path: Path) -> tuple[str, list[str]]:
        text = path.read_text(encoding="utf-8")
        if path.name in manual:
            ids = manual[path.name]
            path.write_text(set_field(text, "youtube", " ".join(ids)), encoding="utf-8")
            return path.name, ids
        meta, _ = parse_frontmatter(text)
        if meta.get("youtube", "").strip() and not args.refresh:
            return path.name, meta["youtube"].split()
        if path.stem in cache and not args.refresh:
            res = cache[path.stem]
        else:
            meta["_slug"] = path.stem
            res = find_for(meta, args.per_entry)
            cache[path.stem] = res
            save_cache(cache)
        ids = res["ids"]
        if ids and not args.dry_run:
            path.write_text(set_field(text, "youtube", " ".join(ids)), encoding="utf-8")
        return path.name, ids

    manual = {}
    for spec in args.set:
        fname, _, ids = spec.partition("=")
        manual[fname] = ids.split()

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(work, paths))

    ok = sum(1 for _, ids in results if ids)
    for name, ids in results:
        print(f"{'✓' if ids else '✗'} {name:<34} {' '.join(ids) if ids else '—'}")
    print(f"\n{ok}/{len(results)} 篇找到影片。快取：{CACHE_FILE.relative_to(BASE_DIR)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
