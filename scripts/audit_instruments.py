#!/usr/bin/env python3
"""Deterministic first pass over work/verify evidence: surface contradictions.

Compares each instrument's own metadata (sound_hs, class_code, title_zh,
region_culture, issue_note) against independent evidence (Wikidata P1762,
enwiki infobox, enwiki short description, enwiki categories, zhwiki intro).

Emits work/audit/deterministic.json with one record per instrument:
  status: consistent | conflict | unresolved
  signals: list of {field, ours, evidence, source, severity}

These are *candidates* — a conflict here is a reason to look, not a verdict.
The LLM adjudication pass (audit_llm.py) decides.

Usage: python scripts/audit_instruments.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VERIFY_DIR = BASE_DIR / "work" / "verify"
OUT_DIR = BASE_DIR / "work" / "audit"

FAMILY_CODE = {"1": "體鳴", "2": "膜鳴", "3": "弦鳴", "4": "氣鳴", "5": "電鳴"}
CODE_FAMILY = {v: k for k, v in FAMILY_CODE.items()}

# class_code → expected H-S family numeral
CLASS_EXPECT = {"A1": "4", "A2": "3", "A3": None, "A4": "5", "A9": None}
CLASS_NAME = {"A1": "吹奏與氣息樂器", "A2": "弦樂器", "A3": "鼓與打擊樂器",
              "A4": "電子與電聲樂器", "A9": "待分類／偵錯暫存"}

HS_TEXT_FAMILY = [
    (r"氣鳴|\b4\d\d|Aerophone", "4"),
    (r"弦鳴|\b3\d\d|Chordophone", "3"),
    (r"膜鳴|\b2\d\d|Membranophone", "2"),
    (r"體鳴|体鳴|\b1\d\d|Idiophone", "1"),
    (r"電鳴|複合／電鳴|Electrophone", "5"),
]

REGION_WORDS = {
    "非洲": r"Africa|African|Nigeria|Ghana|Mali|Uganda|Kenya|Congo|Zimbabwe|Senegal|Ethiopia|Egypt|Morocco|Tunisia|Algeria|South Africa|Tanzania|Cameroon|Gambia|Guinea|Sudan",
    "亞洲": r"Asia|Asian|China|Chinese|Japan|Japanese|Korea|Korean|India|Indian|Thai|Vietnam|Viet Nam|Indonesia|Indonesia|Malaysia|Philippines|Philippine|Tibet|Nepal|Persia|Persian|Turkey|Turkish|Arab|Mongolia|Burma|Myanmar|Cambodia|Laos|Sri Lanka|Bangladesh|Pakistan",
    "歐洲": r"Europe|European|Spain|Spanish|France|French|Italy|Italian|German|Germany|Greece|Greek|Irish|Ireland|Scotland|Scottish|England|English|Russia|Russian|Poland|Hungary|Romania|Bulgaria|Norway|Sweden|Finland|Portugal|Austria|Switzerland|Netherlands|Belgium|Ukraine|Serbia|Croatia|Basque|Wales|Welsh|Iceland|Denmark",
    "美洲": r"America|American|Brazil|Mexican|Mexico|Peru|Andes|Andean|Chile|Argentina|Colombia|Venezuela|Cuba|Cuban|Jamaica|Trinidad|Haiti|Bolivia|Ecuador|Guatemala|Paraguay|Uruguay|Puerto Rico|Dominican",
    "中東": r"Middle East|Egypt|Persian|Iran|Iraq|Arab|Turkey|Turkish|Ottoman|Israel|Lebanon|Syria|Armenia|Georgia|Azerbaijan|Kurdish",
    "大洋洲": r"Oceania|Australia|Aboriginal|Maori|Hawaii|Hawaiian|Polynesia|Melanesia|Papua|Samoa|Tonga|Fiji",
}

NAME_STOP = {"the", "of", "and", "a", "an", "instrument", "musical", "music"}


def norm_family(word: str) -> str:
    word = (word or "").strip()
    if word in ("体鳴",):
        return "體鳴"
    return word


def ours_hs_family(sound_hs: str) -> str:
    for pat, fam in HS_TEXT_FAMILY:
        if re.search(pat, sound_hs or ""):
            return fam
    return ""


def wd_family(hs: str) -> str:
    m = re.match(r"\s*([1-5])", hs or "")
    return m.group(1) if m else ""


def name_stems(text: str) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", (text or "").lower())
            if len(w) > 3 and w not in NAME_STOP}


def regions_in(text: str) -> set[str]:
    found = set()
    for region, pat in REGION_WORDS.items():
        if re.search(pat, text or "", re.I):
            found.add(region)
    return found


def audit_one(ev: dict) -> dict:
    cur = ev.get("current", {})
    en = ev.get("enwiki", {}) or {}
    wt = ev.get("wikitext", {}) or {}
    wd = ev.get("wikidata", {}) or {}
    signals = []

    ours_fam = ours_hs_family(cur.get("sound_hs", ""))
    class_code = cur.get("class_code", "")
    expect_fam = CLASS_EXPECT.get(class_code)

    # --- signal 1: our own metadata is self-contradictory
    if expect_fam and ours_fam and ours_fam != expect_fam:
        signals.append({
            "field": "class_code",
            "ours": f"{class_code}（{CLASS_NAME.get(class_code, '')}）",
            "evidence": f"我們的 sound_hs 寫 {cur.get('sound_hs', '')} → {FAMILY_CODE[ours_fam]}類",
            "source": "internal",
            "severity": "high",
            "note": "主分類與自家發聲分類互相矛盾",
        })

    # --- signal 2: Wikidata HS disagrees with our sound_hs family
    wd_hs = (wd.get("hs") or [])
    wd_fam = wd_family(wd_hs[0]) if wd_hs else ""
    if wd_fam and ours_fam and wd_fam != ours_fam:
        signals.append({
            "field": "sound_hs",
            "ours": cur.get("sound_hs", ""),
            "evidence": f"Wikidata P1762 = {' / '.join(wd_hs[:2])} → {FAMILY_CODE[wd_fam]}類",
            "source": "wikidata",
            "severity": "high",
            "note": "H-S 家族不一致",
        })

    # --- signal 3: enwiki infobox HS disagrees
    wt_hs = wt.get("hs_raw") or []
    for h in wt_hs:
        m = re.search(r"\b([1-5])\d", h)
        if m and ours_fam and m.group(1) != ours_fam:
            signals.append({
                "field": "sound_hs",
                "ours": cur.get("sound_hs", ""),
                "evidence": f"英文維基 infobox HS = {h} → {FAMILY_CODE[m.group(1)]}類",
                "source": "enwiki-infobox",
                "severity": "medium",
                "note": "維基 infobox 分類不同",
            })
            break

    # --- signal 4: the article we matched may not be about our instrument
    title = ev.get("title_original", "")
    title_stems = name_stems(re.sub(r"\s*\([^)]*\)", "", title))
    en_title = (en.get("title") or "")
    desc = en.get("description") or ""
    extract = en.get("extract") or ""
    en_stems = name_stems(en_title)
    if title_stems and en_stems and not (title_stems & en_stems):
        signals.append({
            "field": "title_original",
            "ours": title,
            "evidence": f"對到的英文維基條目是「{en_title}」（{desc}）",
            "source": "enwiki",
            "severity": "high",
            "note": "條目標題與樂器名無共同字根，可能是錯配或同名異物",
        })
    if desc and re.search(r"island|head of state|album|film|song by|genus|species|village|town$|people|ethnic group|letter|disambiguation", desc, re.I):
        signals.append({
            "field": "title_original",
            "ours": title,
            "evidence": f"英文維基 short description：{desc}",
            "source": "enwiki",
            "severity": "high",
            "note": "對到的條目不是樂器",
        })

    # --- signal 5: our Chinese intro may describe a different instrument
    zh_intros = ev.get("zhwiki_intro") or {}
    zh_text = " ".join(zh_intros.values())
    intro_text = ev.get("body_intro") or ""
    if zh_text and intro_text:
        zh_stems = name_stems(zh_text[:80])
        # crude: compare the first proper noun-ish latin token
        lat = set(re.findall(r"[A-Za-z][A-Za-z'\-]{3,}", intro_text))
        zh_lat = set(re.findall(r"[A-Za-z][A-Za-z'\-]{3,}", zh_text))
        if lat and zh_lat and not (lat & zh_lat) and not (title_stems & name_stems(intro_text)):
            signals.append({
                "field": "body",
                "ours": intro_text[:60],
                "evidence": f"中文維基開頭：{zh_text[:60]}",
                "source": "zhwiki",
                "severity": "medium",
                "note": "介紹文可能不是同一件樂器",
            })

    # --- signal 6: region drift
    ours_regions = set(re.findall(r"[^／|｜]+", cur.get("region_culture", "").split("｜")[0]))
    ours_regions = {r.strip() for r in ours_regions if r.strip()}
    ev_text = f"{desc} {extract[:400]} {' '.join(en.get('categories') or [])} {zh_text[:200]}"
    ev_regions = regions_in(ev_text)
    if ours_regions and ev_regions and not (ours_regions & ev_regions):
        signals.append({
            "field": "region_culture",
            "ours": cur.get("region_culture", ""),
            "evidence": f"證據指向：{'／'.join(sorted(ev_regions))}",
            "source": "enwiki+zhwiki",
            "severity": "medium",
            "note": "地區標註與來源不一致",
        })

    # --- signal 7: issue_note belongs to another instrument
    note = cur.get("issue_note", "")
    if note:
        idx_stems = name_stems(title)
        note_l = note.lower()
        foreign = [t for t in en_stems if len(t) > 4 and t in note_l]
        if foreign and not (idx_stems & name_stems(note)):
            signals.append({
                "field": "issue_note",
                "ours": note[:80],
                "evidence": f"備註提到的是「{foreign[0]}」，不是本樂器",
                "source": "internal",
                "severity": "high",
                "note": "備註整欄位移，需重新對應或改寫",
            })

    high = sum(1 for s in signals if s["severity"] == "high")
    return {
        "slug": ev.get("slug"),
        "title_original": title,
        "title_zh": ev.get("title_zh", ""),
        "class_code": class_code,
        "status": "conflict" if high else ("unresolved" if not (
            wd_hs or wt_hs or desc) else "consistent"),
        "high_signals": high,
        "signals": signals,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for path in sorted(VERIFY_DIR.glob("*.json")):
        if path.name.startswith("_"):
            continue
        ev = json.loads(path.read_text(encoding="utf-8"))
        # attach body intro for fidelity checks
        md = BASE_DIR / "content" / "instruments" / f"{ev['slug']}.md"
        if md.exists():
            text = md.read_text(encoding="utf-8")
            m = re.search(r"^## 介紹\s*(.*?)(?=^## |\Z)", text, re.S | re.M)
            ev["body_intro"] = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
        records.append(audit_one(ev))

    (OUT_DIR / "deterministic.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")

    by_status = {}
    for r in records:
        by_status.setdefault(r["status"], []).append(r)
    print(f"audited {len(records)} instruments")
    for st in ("conflict", "unresolved", "consistent"):
        print(f"  {st}: {len(by_status.get(st, []))}")
    by_field = {}
    for r in records:
        for s in r["signals"]:
            by_field.setdefault(s["field"], 0)
            by_field[s["field"]] += 1
    print("  signal fields:", dict(sorted(by_field.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
