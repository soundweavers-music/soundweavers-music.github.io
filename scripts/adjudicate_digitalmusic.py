#!/usr/bin/env python3
"""第二輪：把 factcheck_digitalmusic.py 的發現逐條判定真偽。

第一輪是「三位審查者，一律先懷疑」。它會過度舉報——同一個句子三個人各報一次，
措辭偏好也會被當成問題。所以第二輪請一位裁判，預設立場是「懷疑審查者」，
對每一條給 CONFIRMED / DISPUTED / REFUTED：

  CONFIRMED  原文真的錯、或真的沒有根據      → 應該改
  DISPUTED   兩種說法都成立，或取決於情境    → 不改，或加條件
  REFUTED    審查者自己搞錯                  → 不改

輸出 work/factcheck-digitalmusic/adjudicated.json。

用法：
  python scripts/adjudicate_digitalmusic.py [--workers 4] [--file digitalmusic4.md]
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "digitalmusic"
IN_DIR = BASE_DIR / "work" / "factcheck-digitalmusic"
OUT_FILE = IN_DIR / "adjudicated.json"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

JUDGE = """你是混音與錄音工程的資深審稿人。三位審查者對這份教材提出了問題，
你的任務是逐條判斷哪些是真的問題。預設立場是**懷疑審查者**：

· 如果原文的說法是通行實務或常見慣例（即使不是唯一做法），判 DISPUTED；
· 如果審查者要求的精確度超出這份教材的層級（例如要求每個數字附論文），判 REFUTED；
· 只有在「照著做會出錯」「事實明顯寫反」「數字算錯」時才判 CONFIRMED。

輸出嚴格 JSON，不要其他文字：
{{
  "items": [
    {{
      "id": 3,
      "verdict": "CONFIRMED|DISPUTED|REFUTED",
      "reason": "一句話說明（繁體中文）",
      "fix": "若 CONFIRMED，給可直接替換原文的寫法；否則留空字串"
    }}
  ]
}}"""

_client = None
_lock = threading.Lock()


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def judge_one(path: Path, record: dict) -> dict:
    body = path.read_text(encoding="utf-8")
    items = []
    for angle, issues in record["by_angle"].items():
        for it in issues:
            if it.get("kind") == "error":
                continue
            items.append({
                "id": len(items) + 1,
                "angle": angle,
                "quote": it.get("quote", ""),
                "section": it.get("section", ""),
                "kind": it.get("kind", ""),
                "why": it.get("why", ""),
                "fix": it.get("fix", ""),
            })
    if not items:
        return {"file": path.name, "items": [], "confirmed": []}
    payload = json.dumps(items, ensure_ascii=False, indent=1)
    prompt = f"章節全文：\n\n{body}\n\n---\n\n審查者的發現（JSON）：\n{payload}"
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=8000, temperature=0.1,
            thinking={"type": "enabled", "budget_tokens": 2500},
            system=JUDGE,
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type") == "text"), "").strip()
        if text.startswith("```"):
            text = text.split("```")[1]
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        by_id = {i["id"]: i for i in items}
        for v in data.get("items", []):
            src = by_id.get(v.get("id"))
            if src:
                src["verdict"] = v.get("verdict")
                src["reason"] = v.get("reason", "")
                src["judge_fix"] = v.get("fix", "")
    except Exception as exc:  # noqa: BLE001
        for it in items:
            it["verdict"] = "ERROR"
            it["reason"] = f"裁判失敗：{exc}"
    confirmed = [i for i in items if i.get("verdict") == "CONFIRMED"]
    return {"file": path.name, "items": items, "confirmed": confirmed}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="只判某一章，例如 digitalmusic4.md")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    files = sorted(IN_DIR.glob("digitalmusic*.json"))
    if args.file:
        files = [f for f in files if f.name == args.file]
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda f: judge_one(CONTENT_DIR / f.name.replace(".json", ".md"),
                                                    json.loads(f.read_text(encoding="utf-8"))), files))

    OUT_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    total_conf = 0
    for r in results:
        n = len(r["confirmed"])
        total_conf += n
        print(f"{'!!' if n else '  '} {r['file']:<26} 採信 {n:>2} / {len(r['items']):>2}")
    print(f"\n合計 {total_conf} 條判定為真。明細：{OUT_FILE.relative_to(BASE_DIR)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
