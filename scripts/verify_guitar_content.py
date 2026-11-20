#!/usr/bin/env python3
"""流行吉他課程的對抗審查（content/guitar/*.md）。

跟 verify_ukulele_content.py 同一個形狀：每一章由三個不同角度的審查者讀，
任務是**反駁**，不是稱讚。課程會對吉他這件樂器（調弦、弦序、指板音名、
尺寸、格數）、技巧（封閉、錘音勾音滑音、切音、泛音、打板、刷奏）與具名
歌曲／歌手做可查核的陳述，審查者專找這些地方。

結果寫到 work/verify-guitar/<file>.json；不會改動 content/ 裡的檔案。

    python scripts/verify_guitar_content.py
    python scripts/verify_guitar_content.py --files 5.md,16.md --force
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
CONTENT = BASE_DIR / "content" / "guitar"
OUT = BASE_DIR / "work" / "verify-guitar"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

SYSTEM = """你是流行吉他教學課程的審查者。任務是**找出錯誤**，不是評論寫作風格。

逐項檢查（只報有問題的句子，每項要引用原文片段並給出正確說法）：

1. 調弦與弦序：標準調弦 E-A-D-G-B-E（第 6 弦最粗最低 E2，第 1 弦最細最高 E4），
   6→1 弦的音名、弦號、粗細有沒有寫反？移調夾（Capo）夾 N 格＝實際音高升 N 個半音。
2. 指板音名：每條弦每個格的音名對不對（例如 D 弦第 1 格是 D♯/E♭、第 3 格才是 F）。
3. 規格：有效弦長約 650 mm（25.5 吋）、19–21 格；吋／公分換算是否合理。
4. 和弦：開放和弦按法（C x32010、G 320003、D xx0232、A x02220、E 022100、
   Am x02210、Em 022000、Dm xx0231）、封閉 F／Bm 的把位、斜線和弦的低音、
   組成音與級數標示是否正確。
5. 技巧：錘音（Hammer-on `H`，低→高）、勾音（Pull-off `P`，高→低）、滑音（`S`）、
   切音、自然泛音（第 12／7／5 格）、打板、刷奏型與拍點，敘述是否符合實際發聲。
6. 樂理：順階和弦、級數、Capo 算法、拍號（4/4、3/4、6/8）與 Shuffle 三連音。
7. 具體數字與引用：百分比、Hz、mm、吋、價格、曲名、歌手、器材型號，無法證實
   或明顯過度精確就標記。不要因為「聽起來合理」就放過。

若不確定，標 uncertain，不要說它對。

輸出嚴格 JSON：
{{"issues":[{{"quote":"原文片段（30字內）","kind":"wrong|unsupported|overstated|uncertain","why":"一句話說明（繁體中文）","correct":"正確說法或應刪除（繁體中文）"}}]}}
沒有問題回 {{"issues":[]}}。最多 10 項，優先報最嚴重的。"""

ANGLES = {
    "instrument": "以樂器構造與演奏物理審查：調弦、弦序、指板音名、尺寸、構造、發聲方式；只要與實際彈起來不一樣就要指出。",
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
              f"以下是課程其中一章的完整內容，請逐段找錯：\n\n{body[:8000]}")
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=4000, temperature=0,
            thinking={"type": "enabled", "budget_tokens": 1500},
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type") == "text"), "").strip()
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
