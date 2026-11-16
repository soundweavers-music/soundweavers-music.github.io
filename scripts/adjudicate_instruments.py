#!/usr/bin/env python3
"""Adversarial adjudication of instrument metadata against 4-source evidence.

Each instrument is judged three times by *differently framed* reviewers, then
majority-voted in Python (the LLM never tallies):

  R1 bibliographic  — "what does the reference work say this instrument is?"
  R2 skeptical      — "which of our fields can you actually prove wrong?"
  R3 naming/history — "is the Chinese name and origin region defensible?"

Reviewers see enwiki title/description/extract, the enwiki infobox (HS/origin/
names), Wikidata P1762 + instance-of, the zhwiki intro, and a list of articles
the source text is a good match for. They are told that ambiguous or
contradictory evidence means *uncertain*, never a guess.

Output work/adjudicate/<slug>.json holds the three verdicts + the majority
resolution. Resumable; --refresh re-judges.

Usage:
  python scripts/adjudicate_instruments.py [--limit N] [--slugs a,b]
                                          [--workers 24] [--refresh]
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
VERIFY_DIR = BASE_DIR / "work" / "verify"
SRC_DIR = VERIFY_DIR / "source"
AUDIT_FILE = BASE_DIR / "work" / "audit" / "deterministic.json"
OUT_DIR = BASE_DIR / "work" / "adjudicate"
MODEL = os.environ.get("ADJUDICATE_MODEL", "fast")

FAMILIES = ["弦鳴", "氣鳴", "膜鳴", "體鳴", "電鳴", "複合", "非樂器／非單一樂器", "不確定"]

PERSONAS = {
    "bibliographic": (
        "你是百科全書分類員。只依參考資料判定這件樂器是什麼，"
        "以 Hornbostel–Sachs 系統為準。資料不足時選「不確定」，不要憑印象補齊。"
    ),
    "skeptical": (
        "你是懷疑論審稿人。你的任務是找出現有欄位中「能被證據推翻」的部分。"
        "若證據不足以下判斷，明確標為 uncertain；寧可漏抓，不可誤判。"
    ),
    "naming": (
        "你是名稱與源流考證者。專注中文譯名是否恰當、來源地區是否正確，"
        "以及這件樂器是否其實是另一件的別名或變體。"
    ),
}

SYSTEM = """{persona}

裁決規則：
- 你的判斷只能來自下方證據；不得使用訓練印象中未出現在證據裡的事實。
- 若證據互相矛盾、或關鍵證據缺失，該欄位填 "不確定"。
- 家族只能是：{families}
- 判斷 confidence 反映證據強度：只有單一薄弱來源時不得高於 0.6。

只輸出一個 JSON 物件，不要 markdown 圍籬、不要解釋文字。格式：
{{
 "family": "<家族>",
 "family_basis": "引用哪一項證據支持",
 "hs": "<H-S 分類，如 321.322；不確定填不確定>",
 "name_ok": "ok|wrong|uncertain",
 "name_fix": "<若不對，建議中文名；否則空字串>",
 "region_ok": "ok|wrong|uncertain",
 "region_fix": "<若不對，建議地區；否則空字串>",
 "duplicate_of": "<若本件是另一件的別名/變體，寫該樂器英文名；否則空字串>",
 "correct_enwiki": "<若來源一對到的條目明顯不是本樂器，寫出正確的英文維基條目標題（只寫你確定的）；否則空字串>",
 "wrong_claims": ["<明確可證偽的內文描述，最多3條>"],
 "confidence": <0到1小數>
}}"""


def http_json(*_a, **_k):  # keep import surface uniform with other scripts
    raise NotImplementedError


def build_evidence(slug: str) -> dict:
    ev = json.loads((VERIFY_DIR / f"{slug}.json").read_text(encoding="utf-8"))
    src_path = SRC_DIR / f"{slug}.json"
    src = json.loads(src_path.read_text(encoding="utf-8")) if src_path.exists() else {}
    return {"ev": ev, "src": src}


def render_prompt(slug: str, ev: dict, src: dict) -> str:
    cur = ev.get("current", {})
    en = ev.get("enwiki", {}) or {}
    wt = ev.get("wikitext", {}) or {}
    wd = ev.get("wikidata", {}) or {}
    zh = (ev.get("zhwiki_intro") or {})
    lines = [
        "## 待查樂器",
        f"- 檔案：{slug}",
        f"- 原題名（我們的）：{ev.get('title_original', '')}",
        f"- 中文名（我們的）：{ev.get('title_zh', '')}",
        "",
        "## 我們現有的欄位（可能有錯，需驗證）",
        f"- 聲響分類 sound_hs：{cur.get('sound_hs', '') or '（空）'}",
        f"- 子分類 subcategory：{cur.get('subcategory', '')}",
        f"- 家族 family_std：{cur.get('family_std', '')}",
        f"- 地區 region_culture：{cur.get('region_culture', '')}",
        f"- 既有備註 issue_note：{cur.get('issue_note', '') or '（無）'}",
        "",
    ]
    if en.get("status") == "ok":
        lines += [
            "## 來源一：英文維基百科",
            f"- 條目標題：{en.get('title')}",
            f"- 簡述：{en.get('description') or '（無）'}",
            f"- 是否消歧義頁：{'是' if en.get('disambiguation') else '否'}",
            f"- 開頭：{(en.get('extract') or '')[:700]}",
            f"- 分類標籤：{', '.join((en.get('categories') or [])[:8]) or '（無）'}",
            "",
        ]
    else:
        lines += ["## 來源一：英文維基百科", "- 查無對應條目", ""]

    if wt:
        lines += [
            "## 來源二：英文維基 infobox",
            f"- Hornbostel–Sachs：{' / '.join(wt.get('hs_raw') or []) or '（無）'}",
            f"- 起源／地區欄位：{' / '.join(wt.get('origin_raw') or []) or '（無）'}",
            f"- 別名欄位：{' / '.join(wt.get('names_raw') or []) or '（無）'}",
            "",
        ]
    if wd.get("hs") or wd.get("instance_of"):
        lines += [
            "## 來源三：Wikidata",
            f"- P1762 Hornbostel–Sachs：{' / '.join(wd.get('hs') or []) or '（無）'}",
            f"- P31 類型：{' / '.join((wd.get('instance_of') or [])[:4]) or '（無）'}",
            f"- 中文標籤：{' / '.join(str(v) for k, v in (wd.get('labels') or {}).items() if k.startswith('zh')) or '（無）'}",
            "",
        ]
    if zh:
        lines += ["## 來源四：中文維基百科"]
        for t, text in zh.items():
            lines.append(f"- {t}：{(text or '')[:600] or '（無內容）'}")
        lines.append("")

    if src.get("en", {}).get("text"):
        lines += [
            "## 來源五：英文維基全文摘錄（節錄）",
            src["en"]["text"][:2500],
            "",
        ]

    lines += [
        "## 任務",
        "根據以上證據，輸出 JSON 裁決。若現有欄位與證據衝突，以證據為準；"
        "若證據本身互相衝突或不足，填「不確定」。",
    ]
    return "\n".join(lines)


_client = None
_client_lock = threading.Lock()


def get_client() -> anthropic.Anthropic:
    global _client
    with _client_lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def parse_json(text: str) -> dict | None:
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        # tolerate trailing commas
        try:
            return json.loads(re.sub(r",\s*([}\]])", r"\1", text[start:end + 1]))
        except json.JSONDecodeError:
            return None


def judge(slug: str, persona: str, prompt: str, retries: int = 3) -> dict:
    client = get_client()
    system = SYSTEM.format(persona=PERSONAS[persona], families="、".join(FAMILIES))
    for attempt in range(retries):
        try:
            # The proxy model reasons before answering; a small budget is spent
            # entirely on thinking and returns zero text.
            resp = client.messages.create(
                model=MODEL, max_tokens=4000, temperature=0,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if hasattr(b, "text"))
            data = parse_json(text)
            if data is not None:
                data["_persona"] = persona
                return data
            if resp.stop_reason == "max_tokens":
                continue  # retry rather than accept a truncated verdict
            time.sleep(0.6)
        except Exception as exc:  # noqa: BLE001 — proxy errors vary
            msg = str(exc)
            if "rate" in msg.lower() or "429" in msg:
                time.sleep(4.0 * (attempt + 1))
            else:
                time.sleep(1.5 * (attempt + 1))
    return {"_persona": persona, "_error": "no valid JSON"}


def majority(votes: list[dict], key: str) -> str:
    vals = [v.get(key) for v in votes if isinstance(v.get(key), str)]
    vals = [v for v in vals if v and v not in ("", "不確定")]
    if not vals:
        return "不確定"
    counts: dict[str, int] = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    best, n = max(counts.items(), key=lambda kv: kv[1])
    # a bare 2/3 majority is enough; 1/3 is not
    return best if n >= 2 else "不確定"


def resolve(slug: str, votes: list[dict], ev: dict) -> dict:
    fam = majority(votes, "family")
    confs = [v.get("confidence") for v in votes if isinstance(v.get("confidence"), (int, float))]
    name_votes = [v for v in votes if v.get("name_ok") == "wrong"]
    region_votes = [v for v in votes if v.get("region_ok") == "wrong"]
    dups = [v.get("duplicate_of") for v in votes if v.get("duplicate_of")]
    en_fixes = [v.get("correct_enwiki") for v in votes if v.get("correct_enwiki")]
    claims = []
    for v in votes:
        for c in (v.get("wrong_claims") or [])[:3]:
            if c and c not in claims:
                claims.append(c)
    return {
        "slug": slug,
        "title_original": ev.get("title_original", ""),
        "title_zh": ev.get("title_zh", ""),
        "current_family": ev.get("current", {}).get("sound_hs", ""),
        "family": fam,
        "hs": majority(votes, "hs"),
        "name": ("wrong" if len(name_votes) >= 2 else majority(votes, "name_ok")),
        "name_fix": majority([v for v in votes if v.get("name_fix")], "name_fix"),
        "region": ("wrong" if len(region_votes) >= 2 else majority(votes, "region_ok")),
        "region_fix": majority([v for v in votes if v.get("region_fix")], "region_fix"),
        "duplicate_of": dups[0] if len(dups) >= 2 else "",
        "enwiki_fix": en_fixes[0] if len(en_fixes) >= 2 else "",
        "enwiki_fix_verified": False,   # set by verify_enwiki_fixes.py
        "wrong_claims": claims[:4],
        "confidence": round(sum(confs) / len(confs), 2) if confs else 0.0,
        "votes": votes,
    }


def process(slug: str, refresh: bool) -> bool:
    out_path = OUT_DIR / f"{slug}.json"
    if out_path.exists() and not refresh:
        return True
    ev_wrap = build_evidence(slug)
    ev, src = ev_wrap["ev"], ev_wrap["src"]
    prompt = render_prompt(slug, ev, src)
    votes = [judge(slug, persona, prompt) for persona in PERSONAS]
    good = [v for v in votes if "_error" not in v]
    if len(good) < 2:
        return False
    result = resolve(slug, good, ev)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = sorted(p.stem for p in VERIFY_DIR.glob("*.json") if not p.name.startswith("_"))
        if not args.refresh:
            slugs = [s for s in slugs if not (OUT_DIR / f"{s}.json").exists()]
    if args.limit:
        slugs = slugs[:args.limit]
    if not slugs:
        print("nothing to do")
        return

    print(f"adjudicating {len(slugs)} instruments x3 personas, {args.workers} workers ...",
          flush=True)
    done = 0
    failed = []
    lock = threading.Lock()

    def run(s: str) -> None:
        nonlocal done
        ok = process(s, args.refresh)
        with lock:
            done += 1
            if not ok:
                failed.append(s)
            if done % 20 == 0:
                print(f"  {done}/{len(slugs)} (failed {len(failed)})", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(run, slugs))
    print(f"done: {len(slugs) - len(failed)}/{len(slugs)} adjudicated"
          + (f"; failed: {', '.join(failed[:10])}" if failed else ""))


if __name__ == "__main__":
    main()
