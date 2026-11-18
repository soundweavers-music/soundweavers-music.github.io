#!/usr/bin/env python3
"""Collect the artist's own tracks for the footer music player.

The footer replaced its link list with a small "random song" player, so the
build needs a list of {video id, title}. YouTube's RSS feed is empty on this
network, but a YouTube-Music album playlist page still embeds its video ids, and
the oEmbed endpoint answers with a clean title for each one.

Run this occasionally (after a release) and commit content/music_tracks.json;
the build only reads that file, so CI needs no network for it.

Usage:
    python scripts/fetch_music_tracks.py
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
DISCOGRAPHY = BASE_DIR / "content" / "discography.json"
TRACKS = BASE_DIR / "content" / "music_tracks.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}
CHANNEL_MARK = "隔壁織音人"


def playlist_ids(playlist):
    try:
        r = requests.get("https://www.youtube.com/playlist", params={"list": playlist},
                         headers=HEADERS, timeout=30)
    except Exception:
        return []
    if r.status_code != 200:
        return []
    return list(dict.fromkeys(re.findall(r'"contentId":"([\w-]{11})"', r.text)))


def track_title(video_id):
    try:
        r = requests.get("https://www.youtube.com/oembed",
                         params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
                         headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return ""
        return r.json().get("title", "")
    except Exception:
        return ""


def clean(title):
    """'出發！聖誕小市集 | 隔壁織音人 - Topic' -> '出發！聖誕小市集'"""
    title = re.split(r"\s*[|｜]\s*", title)[0].strip()
    return title.replace(" - Topic", "").strip()


def main():
    data = json.loads(DISCOGRAPHY.read_text(encoding="utf-8"))
    albums = [a for a in data.get("released", []) if a.get("ytm")]
    print(f"{len(albums)} albums with a YouTube Music playlist")

    tracks, seen = [], set()
    for album in albums:
        ids = playlist_ids(album["ytm"])
        print(f"  {album['title'][:24]:24s} {len(ids)} videos")
        for vid in ids:
            if vid in seen:
                continue
            title = clean(track_title(vid))
            time.sleep(0.35)
            if not title:
                continue
            seen.add(vid)
            tracks.append({"id": vid, "title": title, "album": album["title"]})

    TRACKS.write_text(json.dumps(tracks, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(tracks)} tracks -> {TRACKS}")


if __name__ == "__main__":
    main()
