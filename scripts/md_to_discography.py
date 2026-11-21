"""把 content/歷年作品.md（人工維護的母檔）轉成 content/discography.json。

md 是資料母檔：發行資訊、平台連結、逐曲清單、專輯簡介都來自它；
discography.json 只是網站用的中間格式。封面檔名沿用既有對應，
md 沒寫的平台就留空。
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
MD = BASE / "content" / "歷年作品.md"
JS = BASE / "content" / "discography.json"

SKIP_TITLES = ("人聲（", "純音樂（", "發行節奏", "系列作品", "曲目命名")

# md 還是後台記的 2027-03-05，但 KKBOX／Apple Music／Spotify／YouTube Music
# 都已經是 2026-03-05 上架，使用者 2026-11-21 確認以 2026-03-05 為準。
# md 改好之後這行就可以刪掉。
DATE_OVERRIDES = {"留白的午後練習": "2026-03-05"}


def norm(s: str) -> str:
    return re.sub(r"[\s　:：()（）・．.、,，!！?？\-—–－'\"～~｜|]", "", s or "").lower()


def parse_links(text: str) -> dict[str, str]:
    """[KKBOX](url) ｜ [Apple Music](url) … → {'kkbox': url, ...}"""
    out = {}
    for label, url in re.findall(r"\[([^\]]+)\]\((https?://[^)]+)\)", text):
        key = {"KKBOX": "kkbox", "Apple Music": "apple", "Spotify": "spotify",
               "YouTube Music": "ytm"}.get(label.strip())
        if key:
            out[key] = url
    return out


def parse_cat_table(md: str) -> dict[str, str]:
    """人聲／純音樂分類總表：| 發行日 | 類型 | 名稱 | 曲數 |"""
    out = {}
    section = md[md.find("人聲／純音樂分類總表"):] if "人聲／純音樂分類總表" in md else ""
    cur = ""
    for line in section.split("\n"):
        if line.startswith("### "):
            cur = "人聲" if line.startswith("### 人聲") else ("純音樂" if line.startswith("### 純音樂") else "")
            continue
        if line.startswith("|") and cur:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 3 and re.match(r"\d{4}-\d{2}-\d{2}", cells[0]):
                out[norm(cells[2])] = cur
    return out


def parse_timeline(md: str) -> dict[str, dict]:
    """發行年表：| 發行日 | 類型 | 名稱 | 曲數 | 分類 | 長度 |"""
    out = {}
    for line in md.split("\n"):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or not re.match(r"\d{4}-\d{2}-\d{2}$", cells[0]):
            continue
        out[norm(cells[2])] = {"date": cells[0], "type": cells[1],
                               "tracks": int(cells[3]) if cells[3].isdigit() else None,
                               "cat": cells[4]}
    return out


def parse_sections(md: str) -> list[dict]:
    albums = []
    for sec in re.split(r"\n### ", md)[1:]:
        title = sec.split("\n", 1)[0].strip()
        if title.startswith(SKIP_TITLES):
            continue
        rec = {"title": title}

        def field(name: str) -> str:
            m = re.search(rf"^- \*\*{name}\*\*[：:]\s*(.+?)\s*$", sec, re.M)
            return m.group(1).strip() if m else ""

        rec["type"] = field("類型")
        raw_date = field("發行日期")
        m = re.match(r"(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日", raw_date)
        rec["date"] = (f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
                       if m else "")
        rec["status"] = field("狀態")
        rec["en"] = field("英文名稱")
        rec["cat"] = field("分類").replace(" ", "")
        links = parse_links(sec)
        rec["links"] = links

        # 曲目表：| # | 曲名 | … |
        tracks = []
        for row in sec.split("\n"):
            if not row.startswith("|"):
                continue
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if len(cells) < 2 or cells[0] in ("#", r"\#", "") or set(cells[0]) <= {"-", ":"}:
                continue
            if not cells[0].isdigit():
                continue
            name = re.sub(r"^\[([^\]]+)\]\([^)]+\)$", r"\1", cells[1]).strip()
            if name:
                tracks.append(name)
        rec["tracklist"] = tracks
        rec["tracks"] = len(tracks)

        intro = ""
        i = sec.find("**專輯簡介**")
        if i >= 0:
            body = sec[i + len("**專輯簡介**"):]
            keep = []
            for line in body.split("\n"):
                if line.startswith("**") and line.rstrip().endswith("**"):
                    break
                keep.append(line)
            paras, cur = [], []
            for line in keep:
                if line.strip():
                    cur.append(line.strip())
                elif cur:
                    paras.append("".join(cur))
                    cur = []
            if cur:
                paras.append("".join(cur))
            rec["intro"] = [re.sub(r"\s{2,}", " ", p).strip() for p in paras if p.strip()]
        albums.append(rec)
    return albums


def main() -> None:
    md = MD.read_text(encoding="utf-8")
    albums = parse_sections(md)
    old = json.loads(JS.read_text(encoding="utf-8")) if JS.exists() else {}
    covers = {norm(a["title"]): a.get("cover", "") for a in old.get("released", []) + old.get("upcoming", [])}
    covers_en = {norm(a.get("en", "")): a.get("cover", "") for a in old.get("released", []) + old.get("upcoming", []) if a.get("en")}
    # md 用曲名比對平台，別名帳號（隔壁男孩／隔壁女孩等）上架的專輯會被標成
    # 「KKBOX 尚未上架」；這些連結是逐張開頁確認過曲數的，另存一份。
    alias_path = BASE / "content" / "kkbox_aliases.json"
    alias = json.loads(alias_path.read_text(encoding="utf-8"))["albums"] if alias_path.exists() else {}
    alias_kkbox = {norm(t): v["id"] for t, v in alias.items()}

    cats = parse_cat_table(md)
    timeline = parse_timeline(md)

    today = date.today().isoformat()
    released, upcoming = [], []
    for a in albums:
        if a["title"] in DATE_OVERRIDES:
            a["date"] = DATE_OVERRIDES[a["title"]]
        cover = covers.get(norm(a["title"])) or covers_en.get(norm(a.get("en", "")))
        key = norm(a["title"])
        tl = timeline.get(key, {})
        item = {
            "title": a["title"],
            "date": a["date"] or tl.get("date", ""),
            "type": a["type"] or tl.get("type") or "專輯",
            "cat": cats.get(key) or a["cat"] or tl.get("cat") or "純音樂",
            "tracks": len(a["tracklist"]) or tl.get("tracks") or 0,
            "tracklist": a["tracklist"],
        }
        if a.get("en"):
            item["en"] = a["en"]
        if a.get("intro"):
            item["intro"] = a["intro"]
        if cover:
            item["cover"] = cover
        for key in ("apple", "ytm", "kkbox", "spotify"):
            url = a["links"].get(key, "")
            if not url:
                continue
            if key == "apple":
                m = re.search(r"/album/(\d+)", url)
                item["apple"] = m.group(1) if m else url
            elif key == "kkbox":
                m = re.search(r"/album/([A-Za-z0-9_-]+)", url)
                item["kkbox"] = m.group(1) if m else url
            elif key == "spotify":
                m = re.search(r"/album/([A-Za-z0-9]+)", url)
                item["spotify"] = m.group(1) if m else url
            else:
                m = re.search(r"(?:list=|browse/)([A-Za-z0-9_-]+)", url)
                item["ytm"] = m.group(1) if m else url
        if not item.get("kkbox"):
            item["kkbox"] = alias_kkbox.get(norm(a["title"]), "")
        item = {k: v for k, v in item.items() if v not in ("", [])}
        (released if item["date"] and item["date"] <= today else upcoming).append(item)

    released.sort(key=lambda a: a["date"], reverse=True)
    upcoming.sort(key=lambda a: a["date"])

    out = {
        "_source": "content/歷年作品.md（由 scripts/md_to_discography.py 產生，請改 md 不要改這份）",
        "apple_artist": old.get("apple_artist", ""),
        "ytm_artist": old.get("ytm_artist", ""),
        "kkbox_artist": old.get("kkbox_artist", ""),
        "released": released,
        "upcoming": upcoming,
    }
    if old.get("spotify_artist"):
        out["spotify_artist"] = old["spotify_artist"]
    JS.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    n_links = {k: sum(1 for a in released if a.get(k)) for k in ("apple", "ytm", "kkbox", "spotify")}
    print(f"released {len(released)} / upcoming {len(upcoming)}")
    print("platform links:", n_links)
    print("no cover:", [a["title"] for a in released + upcoming if not a.get("cover")])


if __name__ == "__main__":
    main()
