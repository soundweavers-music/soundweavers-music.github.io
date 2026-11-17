#!/usr/bin/env python3
"""Second pass: adjudicate the fact-check findings so only real errors survive.

The first pass (factcheck_ensembles.py) is deliberately over-eager — three
reviewers told to refute will also report stylistic objections and claims that
are actually fine. Applying 175 raw findings would damage good text.

This pass gives every finding to a fresh skeptic with the finding and the
surrounding passage, and asks one question: **is the original text wrong?**
  CONFIRMED  the text states something false → needs a fix
  DISPUTED   reasonable people disagree, or it is a matter of framing
  REFUTED    the reviewer was mistaken; the text is right

Only CONFIRMED items are written to work/factcheck-ensembles/fixes.json, which
apply_ensemble_fixes.py then applies.

Usage:
  python scripts/adjudicate_ensembles.py [--files a.md,b.md] [--workers 6] [--force]
"""
from __future__ import annotations

import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).resolve().parent.parent
FC_DIR = BASE_DIR / "work" / "factcheck-ensembles"
CONTENT_DIR = BASE_DIR / "content" / "ensembles"
FIX_FILE = FC_DIR / "fixes.json"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

SYSTEM = """你是資深編輯，負責裁決前一輪查核員提出的問題。

你會看到：條目的一段原文、以及某位查核員對其中一句的指控。
你的工作不是重寫條目，是判斷**指控是否成立**。

判斷標準：
- CONFIRMED：原文明確寫錯了。事實錯誤、機制描述反了、把樂器放錯地區、
  編造了不存在的人名曲名或精確數字、把模糊推測寫成確定。
- DISPUTED：學界或實務上有不同說法；或是用詞偏好、詳略取捨的問題；
  原文本來就寫得比較寬鬆但不算錯。
- REFUTED：查核員搞錯了，原文是對的。

嚴格要求：
- 預設懷疑查核員。三人成虎，這一輪的價值就在於把誤報擋下來。
- 若指控是「這需要來源」但條目本身就是通識層級的內容（例如「弦樂四重奏有四個人」），
  判 DISPUTED 或 REFUTED，不要 CONFIRMED。
- 只有在你能明確指出「正確答案是什麼」時，才判 CONFIRMED，並在 correct 欄寫出正確內容。
- 措辭建議、想加更多例子、覺得可以寫得更詳細 —— 一律 DISPUTED。

只輸出 JSON：
{
  "verdict": "CONFIRMED" | "DISPUTED" | "REFUTED",
  "correct": "若 CONFIRMED，正確的說法是什麼（繁體中文，可直接取代錯誤句）；否則空字串",
  "reason": "一句話（繁體中文）"
}"""


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))


_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = get_client()
    return _client


def context_for(body: str, quote: str, width: int = 400) -> str:
    """The paragraph containing the quote, so the judge sees it in context."""
    if not quote:
        return body[:width]
    idx = body.find(quote)
    if idx < 0:
        # The quote may have been lightly paraphrased; fall back to a key phrase.
        key = quote[:8]
        idx = body.find(key)
    if idx < 0:
        return ""
    start = max(0, idx - width // 2)
    return body[start: idx + len(quote) + width // 2]


def judge(title: str, context: str, finding: dict) -> dict:
    prompt = (f"條目：{title}\n\n原文段落：\n{context}\n\n"
              f"查核員的指控：\n"
              f"- 引文：{finding.get('quote', '')}\n"
              f"- 類型：{finding.get('kind', '')}\n"
              f"- 理由：{finding.get('why', '')}\n"
              f"- 建議：{finding.get('fix', '')}\n\n"
              f"這段原文真的錯了嗎？")
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=6000, temperature=0.1,
            thinking={"type": "enabled", "budget_tokens": 2000},
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        text = text.strip()
        if not text:
            raise ValueError(f"沒有文字區塊（stop={resp.stop_reason}）")
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        return {"verdict": data.get("verdict", "DISPUTED"),
                "correct": data.get("correct", ""),
                "reason": data.get("reason", "")}
    except Exception as exc:  # noqa: BLE001
        return {"verdict": "ERROR", "correct": "", "reason": str(exc)[:200]}


def adjudicate_file(path: Path, force: bool) -> dict | None:
    fc_path = FC_DIR / f"{path.stem}.json"
    if not fc_path.exists():
        return None
    fc = json.loads(fc_path.read_text(encoding="utf-8"))
    body = path.read_text(encoding="utf-8").split("---", 2)[2]

    findings = []
    for angle, issues in fc["by_angle"].items():
        for issue in issues:
            if issue.get("kind") == "error":
                continue
            findings.append({**issue, "angle": angle})
    if not findings:
        return None

    def run(f: dict) -> dict:
        ctx = context_for(body, f.get("quote", ""))
        if not ctx:
            return {**f, "verdict": "UNLOCATABLE", "correct": "", "reason": "引文在原文中找不到"}
        return {**f, **judge(fc.get("title", ""), ctx, f)}

    with ThreadPoolExecutor(max_workers=6) as pool:
        judged = list(pool.map(run, findings))

    return {
        "file": path.name,
        "title": fc.get("title", ""),
        "judged": judged,
        "confirmed": sum(1 for j in judged if j["verdict"] == "CONFIRMED"),
        "errors": sum(1 for j in judged if j["verdict"] == "ERROR"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--files")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    paths = ([CONTENT_DIR / f.strip() for f in args.files.split(",")]
             if args.files else sorted(CONTENT_DIR.glob("b*-*.md")))

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = [r for r in pool.map(lambda p: adjudicate_file(p, args.force), paths) if r]

    (FC_DIR / "adjudicated.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

    fixes, total_c, total_e = [], 0, 0
    for r in results:
        confirmed = [j for j in r["judged"] if j["verdict"] == "CONFIRMED"]
        total_c += len(confirmed)
        total_e += r["errors"]
        print(f"{'!!' if confirmed else 'ok'} {r['file']:<34} "
              f"confirmed={len(confirmed):>2}/{len(r['judged'])}")
        for j in confirmed:
            fixes.append({
                "file": r["file"], "quote": j.get("quote", ""),
                "wrong": j.get("why", ""), "correct": j.get("correct", ""),
                "reason": j.get("reason", ""), "angle": j.get("angle", ""),
            })

    FIX_FILE.write_text(json.dumps(fixes, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{total_c} 個確認為錯誤；{total_e} 個裁決失敗。"
          f"待修正清單：{FIX_FILE.relative_to(BASE_DIR)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
