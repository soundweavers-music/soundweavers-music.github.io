#!/usr/bin/env python3
"""Adversarial fact-check of content/digitalmusic/*.md（錄音後製 30 堂）。

三個人審同一篇，但各自帶著不同的敵意：

  · 錄音師／聲學：訊號鏈、相位、取樣、房間聲學的物理描述是否正確
  · 混音師／母帶：參數範圍、流程順序、平台規格是否是實務上的通行說法
  · 嚴格查核員：沒有來源卻精確到小數點的數字、行銷語、模糊保證

三人一律被要求「找出錯誤」，不是確認正確。結果寫進
work/factcheck-digitalmusic/<file>.json，不會改動 content/；
要不要改由人（或 apply_digitalmusic_fixes.py）決定。

用法：
  python scripts/factcheck_digitalmusic.py [--files a.md,b.md] [--workers 6] [--force]
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
OUT_DIR = BASE_DIR / "work" / "factcheck-digitalmusic"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

ANGLES = {
    "engineer": """你是錄音師與聲學工程師，任務是**找出寫錯的物理與訊號鏈描述**，不是讚美。

針對給定的課程章節，只報告「有問題」的地方：
1. 訊號鏈的順序或角色寫反了嗎？（例如把 AD 與 DA 顛倒、把前級說成輸出級）
2. 電平、動態範圍、dBFS/dBu 的用法對嗎？−18 dBFS 的慣例、headroom 的說法是否被寫成絕對定律？
3. 取樣率、Nyquist、位元深度、量化誤差、dither 的關係說對了嗎？
4. 相位、梳狀濾波、駐波、3:1 規則的描述是否正確？頻率與波長的換算合理嗎？
5. 近接效應、指向性、延遲（buffer × 取樣率）的數字算得對嗎？

無法確認的標 uncertain，不要說它對。寧可多報，不要漏報。""",

    "mixer": """你是混音與母帶工程師，任務是**找出實務上講不通的建議**。

針對給定的課程章節，只報告「有問題」的地方：
1. 參數範圍（ratio、attack、release、EQ 頻段、分頻點）是否偏離通行實務？
2. 處理順序是否會造成實務上的問題（例如 de-ess 擺錯位置、comping 前先做音量自動化）？
3. 平台規格（Spotify／Apple Music／YouTube 的 LUFS 與 True Peak）是否過時或寫錯？
4. 有沒有把「一種做法」寫成「唯一做法」，或把特定曲風的選擇寫成通則？
5. 有沒有可以在五分鐘內被工作現場推翻的斷言？

標 uncertain 的項目要寫出你不確定的理由。""",

    "skeptic": """你是嚴格的技術查核員，唯一的任務是找出**不該被寫出來的內容**。

逐句掃描，報告以下任一情況：
1. 具體數字（頻率、dB、毫秒、百分比、價格、年分）——精確到需要來源，而章節沒有來源。
2. 具體產品名、型號、品牌、歌曲、藝人。
3. 「據說」「一般認為」「絕對」「保證」「一定要」這類沒有條件的斷言。
4. 行銷語（完美、極致、神器、震撼、靈魂）。
5. 過度概括：把少數情況寫成通則。
6. 任何你認為可能是模型憑印象編出來的細節。

每一項給出：原文片段（20 字內）、問題類型、判斷是 fabricated / overstated / unsupported 哪一種。""",
}

SYSTEM_TEMPLATE = """{angle}

輸出格式：嚴格的 JSON，不要有其他文字。
{{
  "verdict": "ok" | "issues",
  "issues": [
    {{
      "quote": "原文片段，20 字以內",
      "section": "章節標題（取 H2 的開頭幾個字）",
      "kind": "wrong|fabricated|overstated|unsupported|vague",
      "why": "一句話說明問題（繁體中文）",
      "fix": "建議怎麼改（繁體中文；若只是刪掉就寫「刪除」）"
    }}
  ]
}}

規則：
- 沒有問題就回 verdict "ok" 與空的 issues。不要為了湊數報措辭偏好。
- 每個 issue 都必須指向原文真正的片段，不要自行改寫引文。
- 最多 12 個 issue，優先報最嚴重的。"""


_client = None
_lock = threading.Lock()


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def review(angle: str, title: str, body: str) -> list[dict]:
    prompt = f"章節標題：{title}\n\n以下是章節全文（Markdown）：\n\n{body}"
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=8000, temperature=0.2,
            # 這個代理上無上限的 thinking 會吃掉整個 max_tokens，什麼都不回。
            thinking={"type": "enabled", "budget_tokens": 2500},
            system=SYSTEM_TEMPLATE.format(angle=ANGLES[angle]),
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        text = text.strip()
        if not text:
            raise ValueError(f"模型沒有回傳文字區塊（stop_reason={resp.stop_reason}）")
        if text.startswith("```"):
            text = text.split("```")[1]
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        return data.get("issues", [])
    except Exception as exc:  # noqa: BLE001 - 一個角度失敗不能讓整批停擺
        return [{"quote": "", "section": "", "kind": "error",
                 "why": f"{angle} 審查失敗：{exc}", "fix": ""}]


def check_file(path: Path, force: bool) -> dict:
    dest = OUT_DIR / f"{path.stem}.json"
    if dest.exists() and not force:
        return json.loads(dest.read_text(encoding="utf-8"))
    text = path.read_text(encoding="utf-8")
    title = text.strip().split("\n")[0].lstrip("# ").strip()
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda a: review(a, title, text), ANGLES))
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
        paths = sorted(CONTENT_DIR.glob("digitalmusic*.md"),
                       key=lambda p: int("".join(c for c in p.stem if c.isdigit()) or 0))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda p: check_file(p, args.force), paths))

    fatal_total = 0
    for r in results:
        kinds = [i["kind"] for a in r["by_angle"].values() for i in a]
        fatal = sum(1 for k in kinds if k in {"wrong", "fabricated"})
        errored = sum(1 for k in kinds if k == "error")
        fatal_total += fatal
        mark = "XX" if errored else "!!" if fatal else ".." if kinds else "OK"
        print(f"{mark} {r['file']:<26} issues={r['issue_count']:>2} fatal={fatal}")

    print(f"\n{len(results)} 章；{fatal_total} 個可能是事實錯誤的項目。"
          f"詳細內容：{OUT_DIR.relative_to(BASE_DIR)}")
    errored = sum(1 for r in results for a in r["by_angle"].values()
                  for i in a if i["kind"] == "error")
    if errored:
        print(f"⚠ {errored} 個審查角度失敗（kind=error），這些章節未經完整審查。")
    return 1 if errored else 0


if __name__ == "__main__":
    raise SystemExit(main())
