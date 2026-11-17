#!/usr/bin/env python3
"""Adversarial fact-check of content/ensembles/*.md.

Every ensemble entry is read by three reviewers with different instructions, each
told to REFUTE rather than confirm. Their job is to pull out every checkable
claim and say whether it is (a) true, (b) wrong, or (c) cannot be verified — and
specifically to catch the failure modes this section invites:

  · invented numbers, dates, names, works, instruments that don't exist there
  · a "difference" section that is actually vague admiration
  · a mechanism described backwards (e.g. who leads, who keeps time)
  · regional lumping — treating a whole continent as one tradition

Their verdicts go to work/factcheck-ensembles/<file>.json. Nothing is written to
content/ — a human (or apply_ensemble_fixes.py) decides what to change.

Usage:
  python scripts/factcheck_ensembles.py [--files a.md,b.md] [--workers 6] [--force]
"""
from __future__ import annotations

import argparse
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "ensembles"
OUT_DIR = BASE_DIR / "work" / "factcheck-ensembles"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

# Three independent angles. Each is told to refute; the value is in the overlap.
ANGLES = {
    "area": """你是研究該地區傳統音樂的民族音樂學者，任務是**找出錯誤**，不是讚美。

針對給定的條目，逐項檢查下列問題，只報告「有問題」的地方：
1. 樂器名稱、所屬文化、地區是否對得上？（例如把某樂器放到沒有它的地區）
2. 樂團的領導方式、誰負責時間、誰負責旋律，描述是否**反了**？
3. 是否把整個大洲或文化圈當成一個統一傳統？（安地斯、巴爾幹、西非、東南亞都很容易犯）
4. 音律、調音、微分音的說法是否正確？
5. 場合（儀式／劇場／咖啡館／街頭）的歸屬是否正確？

如果某句你無法確認，標為 uncertain，**不要**說它對。寧可多報，不要漏報。""",

    "ensemble": """你是職業合奏演奏者與編曲者，任務是**找出講不通的分工描述**。

針對給定的條目，只報告「有問題」的地方：
1. 「編制與分工」表格裡的角色分配，在實際演奏上成立嗎？有沒有把某樂器的工作寫錯？
2. 「聲音如何運作」描述的機制（誰聽誰、如何變速、如何轉段）是否說得通？
3. 有沒有把一個編制的特徵，錯套到另一個編制上？
4. 「與相鄰編制的差別」所指出的差異，是不是只是空話（「各有特色」）或講錯？
5. 有沒有可以在現場被立刻推翻的斷言（例如「沒有指揮」但其實有）？

標為 uncertain 的項目要說明你不確定的理由。""",

    "skeptic": """你是嚴格的百科事實查核員。唯一的任務是找出**不該被寫出來**的內容。

逐句掃描，報告以下任一情況：
1. 具體數字（人數、年份、弦數、音域）——它精確到需要來源，而條目沒有來源。
2. 具體人名、團名、曲名、專輯名、獎項。
3. 「據說」「一般認為」「自古以來」這類沒有根據的修飾。
4. 行銷語（獨特魅力、天籟、完美融合、令人陶醉）。
5. 過度概括：把少數情況寫成通則，或把通則寫成絕對。
6. 任何你認為可能是模型編出來的細節。

對每一項給出：原文片段（20 字內）、問題類型、你判斷是 fabricated / overstated / unsupported 哪一種。""",
}

SYSTEM_TEMPLATE = """{angle}

輸出格式：嚴格的 JSON，不要有其他文字。
{{
  "verdict": "ok" | "issues",
  "issues": [
    {{
      "quote": "原文片段，20 字以內",
      "section": "一句話定位|編制與分工|聲音如何運作|場合與曲目|與相鄰編制的差別|聆聽入口|常見誤解",
      "kind": "wrong|fabricated|overstated|unsupported|vague",
      "why": "一句話說明問題（繁體中文）",
      "fix": "建議怎麼改（繁體中文，若只是刪掉就寫「刪除」）"
    }}
  ]
}}

規則：
- 沒有問題就回 verdict "ok" 與空的 issues。**不要**為了湊數而報無關緊要的措辭偏好。
- 每個 issue 都必須指向原文真正的片段，不要自行改寫引文。
- 最多 12 個 issue，優先報最嚴重的。"""


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))


_client = None
_lock = threading.Lock()


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = get_client()
    return _client


def review(angle: str, title: str, body: str) -> list[dict]:
    prompt = f"條目標題：{title}\n\n以下是條目全文（Markdown）：\n\n{body}"
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=8000, temperature=0.2,
            # Bound the thinking budget: unbounded thinking can eat the whole
            # max_tokens on this proxy and return no text block at all.
            thinking={"type": "enabled", "budget_tokens": 2500},
            system=SYSTEM_TEMPLATE.format(angle=ANGLES[angle]),
            messages=[{"role": "user", "content": prompt}],
        )
        # The proxy can return a thinking block first; take the first text block.
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        text = text.strip()
        if not text:
            raise ValueError(f"模型沒有回傳文字區塊（stop_reason={resp.stop_reason}，"
                             "通常是思考階段吃掉 token 預算）")
        if text.startswith("```"):
            text = text.split("```")[1]
            text = text[text.find("{"):]
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        return data.get("issues", [])
    except Exception as exc:  # noqa: BLE001 - one angle failing must not kill the run
        return [{"quote": "", "section": "", "kind": "error",
                 "why": f"{angle} 審查失敗：{exc}", "fix": ""}]


def check_file(path: Path, force: bool) -> dict:
    dest = OUT_DIR / f"{path.stem}.json"
    if dest.exists() and not force:
        return json.loads(dest.read_text(encoding="utf-8"))
    text = path.read_text(encoding="utf-8")
    _, fm, body = text.split("---", 2)
    title = ""
    for line in fm.splitlines():
        if line.startswith("title:"):
            title = line.split(":", 1)[1].strip()
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda a: review(a, title, body), ANGLES))
    data = {
        "file": path.name,
        "title": title,
        "by_angle": {a: r for a, r in zip(ANGLES, results)},
        "issue_count": sum(len(r) for r in results),
    }
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", help="comma-separated file names; default all")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.files:
        paths = [CONTENT_DIR / f.strip() for f in args.files.split(",")]
    else:
        paths = sorted(CONTENT_DIR.glob("b*-*.md"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda p: check_file(p, args.force), paths))

    real = 0
    for r in results:
        kinds = [i["kind"] for a in r["by_angle"].values() for i in a]
        fatal = sum(1 for k in kinds if k in {"wrong", "fabricated"})
        errored = sum(1 for k in kinds if k == "error")
        real += fatal
        if errored:
            mark = "XX"   # an angle never produced a verdict: not a pass
        elif fatal:
            mark = "!!"
        elif kinds:
            mark = ".."
        else:
            mark = "OK"
        print(f"{mark} {r['file']:<34} issues={r['issue_count']:>2} fatal={fatal}")

    print(f"\n{len(results)} 篇；{real} 個可能是事實錯誤的項目。"
          f"詳細內容：{OUT_DIR.relative_to(BASE_DIR)}")
    errored = sum(1 for r in results for a in r["by_angle"].values()
                  for i in a if i["kind"] == "error")
    if errored:
        print(f"⚠ {errored} 個審查角度失敗（見 issue kind=error），這些條目未經完整審查。")
    return 1 if errored else 0


if __name__ == "__main__":
    raise SystemExit(main())
