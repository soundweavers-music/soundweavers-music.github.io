#!/usr/bin/env python3
"""Adversarial verification of the ukulele course (content/ukulele/*.md).

Same shape as ``verify_vocal_content.py``: every chapter is read by three
differently-framed reviewers whose job is to *refute*, not to praise. The
content makes checkable claims about the instrument (tuning, string order,
scale length, fret counts), about technique (barre, chunk, tremolo, harmonics,
percussive playing) and about named songs/players, so those are the things the
reviewers hunt for.

Output goes to work/verify-ukulele/<file>.json. Nothing under content/ is
modified — fixing is a separate, reviewed step.

Usage:
  python scripts/verify_ukulele_content.py [--files 1.md,2.md] [--workers 5] [--force]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT = BASE_DIR / "content" / "ukulele"
OUT = BASE_DIR / "work" / "verify-ukulele"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

SYSTEM = """你是烏克麗麗教學與樂器知識的審查者。任務是**找出錯誤**，不是評論寫作風格。

逐項檢查（只報有問題的句子，每項要引用原文片段並給出正確說法）：

1. 定弦與弦序：標準調音是 G-C-E-A（第 4 弦 G、第 3 弦 C、第 2 弦 E、第 1 弦 A）。
   High-G 是第 4 弦比第 3 弦高八度；Low-G 才是低音 G。Baritone 是 D-G-B-E。
   有沒有把弦序、音名或高低八度寫反？
2. 尺寸與規格：Soprano 21 吋／Concert 23 吋／Tenor 26 吋／Baritone 30 吋；
   有效弦長約 330／380／430／480 mm。吋與公分的換算、琴格數是否合理？
3. 和弦：C、Am、F、G7 等指法描述是否正確？封閉和弦（如 Bb、F）的按法、
   把位與「夾到第幾格」是否說得通？
4. 技巧：切音（chunk）、輪指（tremolo）、自然泛音（第 12／7／5 格）、
   打板、悶音、錘音勾音滑音的敘述是否符合實際發聲方式？
5. 樂理：順階和弦、移調夾（Capo）算法、拍號（4/4、3/4、6/8）是否正確？
   有沒有把「夾 Capo 幾格等於升幾個半音」寫錯？
6. 具體數字與引用：任何百分比、Hz、mm、吋、價格、曲名、歌手、品牌型號，
   只要無法證實或明顯過度精確，標記出來。不要因為「聽起來合理」就放過。

若你不確定，標 uncertain，不要說它對。

輸出嚴格 JSON：
{{"issues":[{{"quote":"原文片段（30字內）","kind":"wrong|unsupported|overstated|uncertain","why":"一句話說明（繁體中文）","correct":"正確說法或應刪除（繁體中文）"}}]}}
沒有問題回 {{"issues":[]}}。最多 10 項，優先報最嚴重的。"""

ANGLES = {
    "instrument": "以樂器構造與演奏物理審查：定弦、弦序、尺寸、構造、發聲方式；只要與實際彈起來不一樣就要指出。",
    "theory": "以樂理與和弦教學審查：順階和弦、級數、移調、拍號、節奏記譜是否正確、是否會誤導初學者。",
    "skeptic": "以嚴格查核員的身分審查：任何具體數字、價格、曲名、人名、器材型號，只要無法證實就標記；寧可多報。",
}


_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(
            api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def review(angle: str, body: str) -> list[dict]:
    prompt = (f"審查角度：{ANGLES[angle]}\n\n"
              f"以下是要審查的內容（中文）：\n\n{body[:24000]}")
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=9000, temperature=0.15,
            thinking={"type": "enabled", "budget_tokens": 2500},
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "").strip()
        if not text:
            raise ValueError(f"沒有文字區塊（stop={resp.stop_reason}）")
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        return data.get("issues", [])
    except Exception as exc:  # noqa: BLE001
        return [{"quote": "", "kind": "error", "why": f"{angle} 審查失敗：{exc}", "correct": ""}]


def check(path: Path, force: bool) -> dict:
    dest = OUT / f"{path.stem}.json"
    if dest.exists() and not force:
        return json.loads(dest.read_text(encoding="utf-8"))
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    title = lines[0].lstrip("# ").strip()
    body = "\n".join(lines[1:])
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda a: review(a, body), ANGLES))
    data = {
        "file": path.name,
        "title": title,
        "by_angle": dict(zip(ANGLES, results)),
        "issue_count": sum(len(r) for r in results),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--files")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    paths = ([CONTENT / f.strip() for f in args.files.split(",")] if args.files
             else sorted([p for p in CONTENT.glob("*.md") if not p.name.startswith("_")],
                         key=lambda p: (0, 0) if p.stem == "前言" else
                         (1, int(re.search(r"\d+", p.name).group())) if re.search(r"\d+", p.name) else (2, 0)))

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda p: check(p, args.force), paths))

    fatals = 0
    for r in results:
        kinds = [i["kind"] for a in r["by_angle"].values() for i in a]
        bad = sum(1 for k in kinds if k in {"wrong", "fabricated", "misattributed"})
        err = sum(1 for k in kinds if k == "error")
        fatals += bad
        mark = "XX" if err else ("!!" if bad else "..")
        print(f"{mark} {r['file']:14s} {r['issue_count']:3d} 項  {r['title'][:40]}")
    print(f"\n合計 {len(results)} 篇，嚴重錯誤 {fatals} 項，結果在 {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
