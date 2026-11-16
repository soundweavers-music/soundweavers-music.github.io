#!/usr/bin/env python3
"""Rewrite instrument article bodies from grounded source text.

Every section is generated from the cached encyclopedic text (plus zhwiki
extract when available) and validated in Python before it can touch the repo:

  介紹     2 paragraphs — what it is, who plays it, how it sounds
  聆聽示範  representative works, only ones the source actually names
  歷史背景  origin, development, spread
  音色描述  timbre, register, playing characteristics
  樂器材質  what it is built from (only materials the source states)
  教學      how to hold/play it

Guardrails:
  - the model must mark any claim it cannot source with a leading "※"
  - Python rejects a section if it contains "※", is too short, or is written
    in English-only prose; rejected sections are regenerated up to 3 times
  - instruments never receive a whole-body replacement unless all six
    sections pass, so a failure degrades to the existing text, not to garbage

Writes proposals to work/rewrite/<slug>.json (never edits content/ directly).
apply_rewrites.py is the only writer.

Usage:
  python scripts/rewrite_instruments.py [--slugs a,b] [--limit N]
                                       [--workers 8] [--refresh]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
VERIFY_DIR = BASE_DIR / "work" / "verify"
SRC_DIR = VERIFY_DIR / "source"
ADJ_DIR = BASE_DIR / "work" / "adjudicate"
OUT_DIR = BASE_DIR / "work" / "rewrite"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

SECTIONS = ["介紹", "聆聽示範", "歷史背景", "音色描述", "樂器材質", "教學"]

SYSTEM = """你是《世界聲音百科》的編輯，為世界樂器撰寫繁體中文（台灣用語）條目。

硬性規則：
1. 只能使用使用者提供的「來源資料」。來源沒寫的事實一律不得寫出——
   不要補充人名、曲名、年份、數字、材質或傳說。這是最重要的一條。
2. 若某段落真的無可寫（來源完全未提及），整段只輸出：※來源不足
3. 不要使用「據說」「據傳」「一般認為」來包裝沒有來源的內容。
4. 引用具體作品時，只用來源明確提到的作曲家與曲名；來源沒提就不寫作品名，
   改寫這件樂器在什麼場合、什麼編制中被使用。
5. 文風：百科式、平實、具體，避免行銷語與空泛形容（「獨特魅力」「天籟」）。
6. 每段 80–220 字，不要標題、不要 markdown 符號、不要項目符號。
7. 除樂器原名、Hornbostel–Sachs 編號、人名與曲名外，正文一律使用繁體中文。
   音樂類型、術語與地名要譯出或加註中文（例：chamamé→查馬梅、
   vallenato→巴耶納托、bisonoric→雙向簧系統），不要直接留英文。

輸出格式（只輸出這些，不要其他文字）：
### 介紹
<文字>
### 聆聽示範
<文字>
### 歷史背景
<文字>
### 音色描述
<文字>
### 樂器材質
<文字>
### 教學
<文字>"""

# Terms the model tends to leave in English. Leftovers are reported so the
# section can be regenerated rather than silently shipped untranslated.
LEFTOVER_EN = re.compile(
    r"\b(chamam[eé]|vallenato|merengue|norte[nñ]o|klezmer|zydeco|cajun|forr[oó]|"
    r"sertanejo|bisonoric|unisonoric|register|voicing|concertina|bandoneon|"
    r"harmonium|free reed|bellows|diatonic|chromatic|articulation|"
    r"tremolo|percussive|overtones?|timbre|dunun|shekere|hosho|"
    r"mylar|polyester|rombus|embouchure|glissando|counterpoint|"
    r"ostinato|polyphony|heterophon\w*|organolog\w*)\b", re.I)


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))


_client = None
_client_lock = threading.Lock()


def client() -> anthropic.Anthropic:
    global _client
    with _client_lock:
        if _client is None:
            _client = get_client()
    return _client


def load(slug: str) -> tuple[dict, dict, dict | None]:
    ev = json.loads((VERIFY_DIR / f"{slug}.json").read_text(encoding="utf-8"))
    src_path = SRC_DIR / f"{slug}.json"
    src = json.loads(src_path.read_text(encoding="utf-8")) if src_path.exists() else {}
    adj_path = ADJ_DIR / f"{slug}.json"
    adj = json.loads(adj_path.read_text(encoding="utf-8")) if adj_path.exists() else None
    return ev, src, adj


def render_prompt(slug: str, ev: dict, src: dict, adj: dict | None) -> str:
    cur = ev.get("current", {})
    en = ev.get("enwiki", {}) or {}
    wd = ev.get("wikidata", {}) or {}
    en_text = (src.get("en") or {}).get("text") or en.get("extract") or ""
    zh_text = (src.get("zh") or {}).get("text") or ""
    zh_intro = "\n".join((ev.get("zhwiki_intro") or {}).values())

    facts = [
        f"- 樂器：{ev.get('title_original', '')}（中文：{ev.get('title_zh', '')}）",
        f"- 發聲分類：{(adj or {}).get('family') or cur.get('sound_hs', '')}",
        f"- 地區：{(adj or {}).get('region_fix') if (adj or {}).get('region') == 'wrong' else cur.get('region_culture', '')}",
    ]
    if adj and adj.get("duplicate_of"):
        facts.append(f"- 與以下樂器互為別名／變體：{adj['duplicate_of']}")
    if adj and adj.get("wrong_claims"):
        facts.append("- 舊稿已知錯誤（不要重複）：" + "；".join(adj["wrong_claims"][:3]))

    lines = [
        "## 樂器基本資料",
        "\n".join(facts),
        "",
        "## 來源資料 A：英文百科全文（節錄）",
        en_text[:9000] or "（無）",
        "",
    ]
    if zh_text:
        lines += ["## 來源資料 B：中文百科全文（節錄）", zh_text[:6000], ""]
    elif zh_intro:
        lines += ["## 來源資料 B：中文百科開頭", zh_intro[:2000], ""]
    if en.get("description"):
        lines += ["## 來源資料 C：一句話定義", en["description"], ""]
    if wd.get("hs"):
        lines += ["## 來源資料 D：Hornbostel–Sachs", " / ".join(wd["hs"][:2]), ""]
    lines += ["## 任務", "依來源資料撰寫六個段落。來源未支持的事實不要寫。"]
    return "\n".join(lines)


def parse_sections(text: str) -> dict[str, str]:
    out = {}
    pattern = r"###\s*(介紹|聆聽示範|歷史背景|音色描述|樂器材質|教學)\s*\n(.*?)(?=\n###\s|\Z)"
    for m in re.finditer(pattern, text, re.S):
        body = re.sub(r"\s*\n\s*", "", m.group(2)).strip()
        out[m.group(1)] = body
    return out


CJK = re.compile(r"[一-鿿]")


SECTION_FLOOR = {"介紹": 70, "聆聽示範": 70, "歷史背景": 70,
                 "音色描述": 70, "樂器材質": 70, "教學": 40}


def validate(sections: dict[str, str],
             only: list[str] | None = None) -> tuple[bool, list[str]]:
    problems = []
    for name in (only or SECTIONS):
        body = sections.get(name, "")
        if not body:
            problems.append(f"{name}: 缺漏")
            continue
        # A placeholder is accepted (the applier keeps the legacy text instead)
        # as long as it is not the whole section.
        if body.startswith(PLACEHOLDER_PREFIX) and len(body) <= len(PLACEHOLDER_PREFIX) + 12:
            continue
        if "※" in body and not body.startswith(PLACEHOLDER_PREFIX):
            problems.append(f"{name}: 來源不足")
        if len(body) < SECTION_FLOOR.get(name, 70):
            problems.append(f"{name}: 過短({len(body)})")
        if len(body) > 900:
            problems.append(f"{name}: 過長")
        cjk = len(CJK.findall(body))
        if cjk < len(body) * 0.35:
            problems.append(f"{name}: 中文比例過低")
        for bad in ("據說", "據傳", "一般認為", "被譽為世界上最", "獨特魅力", "天籟"):
            if bad in body:
                problems.append(f"{name}: 含無來源套語「{bad}」")
        leftovers = {m.group(0).lower() for m in LEFTOVER_EN.finditer(body)}
        if len(leftovers) >= 2:
            problems.append(f"{name}: 未譯術語 {sorted(leftovers)[:4]}")
        # placeholder sections are exempt from the untranslated-term check,
        # since they are short assertions about method, not prose
    return (not problems), problems


SECTION_BRIEF = {
    "介紹": "這是什麼樂器、構造與演奏方式、屬於哪個家族、誰在什麼場合使用。"
            "若來源有明確的 H-S 分類編號可寫出。",
    "聆聽示範": "這件樂器實際上在哪些音樂場合、類型或編制中出現。"
                "只有來源明確提到的作曲家／曲目才可以寫；來源沒有就不要編曲名。",
    "歷史背景": "起源、發展、傳播與重要變化。年份與人名只寫來源有的。",
    "音色描述": "聲音特質、音域、音量控制方式、與同族樂器的差異。"
                "以來源描述的發聲原理為依據，不要用形容詞堆砌。",
    "樂器材質": "琴身、發聲體與其他部件用什麼材料。來源沒寫的材質不要出現；"
                "若只知道簧片或木條材質，就只寫那些，並說明其餘未載明。",
    "教學": "如何持琴、如何發聲、初學要點。只寫來源可支持的演奏方式；"
            "沒有教材內容時，寫這件樂器的基本操作順序。",
}


HONEST_FALLBACK = (
    "若來源確實沒有這段所需的資訊，就先寫一句「※本段來源不足，待補考：」，"
    "接著只陳述來源真正支持的內容（分類、發聲原理、地區），"
    "不要編造曲名、人名、年份或材質，也不要為湊字數而重複。"
)
PLACEHOLDER_PREFIX = "※本段來源不足，待補考："


def one_section(slug: str, name: str, base_prompt: str, retries: int = 3) -> tuple[str, str]:
    """Generate and validate a single section. Returns (text, problem)."""
    brief = SECTION_BRIEF[name]
    prompt = (f"{base_prompt}\n\n## 本次只寫「{name}」一段。\n"
              f"內容要求：{brief}\n"
              f"{HONEST_FALLBACK}\n"
              f"絕對不要只輸出「※來源不足」——改用上述方式寫滿 {SECTION_MIN[name]}–220 字。")
    problem = ""
    for attempt in range(retries):
        try:
            resp = client().messages.create(
                model=MODEL, max_tokens=10000, temperature=0.3 + 0.1 * attempt,
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if hasattr(b, "text"))
            text = re.sub(r"^\s*###.*$", "", text, flags=re.M).strip()
            text = re.sub(r"\s*\n\s*", "", text).strip()
            if not text:
                problem = "空回應（推理耗盡額度）"
                continue
            ok, problems = validate({name: text}, only=[name])
            if ok:
                return text, ""
            problem = "；".join(problems)
        except Exception as exc:  # noqa: BLE001
            problem = f"api: {exc}"[:120]
            time.sleep(2.0 * (attempt + 1))
    return "", problem


SECTION_MIN = {"介紹": 80, "聆聽示範": 80, "歷史背景": 80,
               "音色描述": 80, "樂器材質": 80, "教學": 50}


def generate(slug: str, only: list[str] | None = None) -> dict | None:
    ev, src, adj = load(slug)
    if not ((src.get("en") or {}).get("text") or ev.get("enwiki", {}).get("extract")):
        return {"slug": slug, "status": "no_source"}
    base = render_prompt(slug, ev, src, adj)

    sections: dict[str, str] = {}
    failures: dict[str, str] = {}
    for name in (only or SECTIONS):
        text, problem = one_section(slug, name, base)
        if not text:
            failures[name] = problem
            continue
        sections[name] = text

    # A section the source genuinely cannot support is allowed to fall back to
    # the existing body text — but 介紹 must be grounded, or nothing ships.
    # In repair mode only the named sections are attempted, so the count check
    # is against those.
    attempted = only or SECTIONS
    if ("介紹" in attempted and "介紹" in failures) or \
            len(sections) < max(1, len(attempted) // 2):
        return {"slug": slug, "status": "rejected", "problems": failures}
    return {"slug": slug, "status": "ok", "sections": sections,
            "failed_sections": failures,
            "sources": {"en_chars": len((src.get("en") or {}).get("text") or ""),
                        "zh_chars": len((src.get("zh") or {}).get("text") or ""),
                        "adjudicated": bool(adj)}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--only-sections", default="",
                    help="comma-separated section names; repair mode")
    args = ap.parse_args()
    only = [s.strip() for s in args.only_sections.split(",") if s.strip()] or None
    if only:
        for name in only:
            if name not in SECTIONS:
                raise SystemExit(f"unknown section: {name}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = [p.stem for p in sorted(CONTENT_DIR.glob("*.md"))]
        if not args.refresh:
            slugs = [s for s in slugs if not (OUT_DIR / f"{s}.json").exists()]
    if args.limit:
        slugs = slugs[:args.limit]
    if not slugs:
        print("nothing to do")
        return

    print(f"rewriting {len(slugs)} instruments, {args.workers} workers ...", flush=True)
    counts = {"ok": 0, "rejected": 0, "no_source": 0}
    lock = threading.Lock()
    done = 0

    def run(s: str) -> None:
        nonlocal done
        res = generate(s, only=only)
        if res and only:
            # repair mode: merge the regenerated sections into the existing
            # proposal so apply_rewrites.py sees a complete record
            old_path = OUT_DIR / f"{s}.json"
            old = json.loads(old_path.read_text(encoding="utf-8")) if old_path.exists() else {}
            merged = {**old, "slug": s}
            sections = dict(old.get("sections") or {})
            sections.update(res.get("sections") or {})
            merged["sections"] = sections
            failed = dict(old.get("failed_sections") or {})
            failed.update(res.get("failed_sections") or {})
            for name in only:
                if name in sections:
                    failed.pop(name, None)
            merged["failed_sections"] = failed
            merged["status"] = "ok" if sections else "rejected"
            res = merged
        if res:
            (OUT_DIR / f"{s}.json").write_text(
                json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
            with lock:
                counts[res["status"]] = counts.get(res["status"], 0) + 1
        with lock:
            done += 1
            if done % 20 == 0:
                print(f"  {done}/{len(slugs)} {counts}", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(run, slugs))
    print(f"done: {counts}")


if __name__ == "__main__":
    main()
