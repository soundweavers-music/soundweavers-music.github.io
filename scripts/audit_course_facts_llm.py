#!/usr/bin/env python3
"""用模型把吉他／烏克麗麗課程「一章一章」核對事實。

和弦與按法有專門的 audit_course_chords*.py；這支負責其餘會寫錯的內容：
調弦與弦序、尺寸規格、封閉與技巧、樂理（順階、移調夾、拍號）、具體數字與
曲名／歌手。每章一次呼叫，只回報「確定有錯或無法證實」的句子。

結果寫到 work/audit/course-facts-llm.json，人工複核後再改內容（腳本不改檔）。

    python scripts/audit_course_facts_llm.py
    python scripts/audit_course_facts_llm.py --folder ukulele --files 2.md,12.md
"""
from __future__ import annotations

import io
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "work" / "audit" / "course-facts-llm.json"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

FACTS = {
    "guitar": """標準調弦 EADGBE（第 6 弦 E2 到第 1 弦 E4），弦長約 650 mm（25.5 吋），
19–21 格。移調夾夾 N 格＝實際音高升 N 個半音（指法不變）。六線譜最上面一條線是第 1 弦（最細）。
常用和弦：C x32010、G 320003、D xx0232、A x02220、E 022100、Am x02210、Em 022000、
Dm xx0231、F 133211 或 xx3211、Bm x24432。""",
    "ukulele": """標準 High-G GCEA：第 4 弦 G4、第 3 弦 C4、第 2 弦 E4、第 1 弦 A4
（High-G 的第 4 弦比第 3 弦高 7 個半音，不是八度；Low-G 才是低音 G）。
尺寸：Soprano 21 吋／Concert 23 吋／Tenor 26 吋／Baritone 30 吋，有效弦長約
330／380／430／480 mm。常用和弦：C 0003、Am 2000、F 2010、G 0232、G7 0212、
Dm 2210、Em 0432、Bb 3211、Bm 4222。四線譜最上面一條線是第 1 弦。""",
}

SYSTEM = """你是音樂教材的事實審查員。逐句檢查這一章有沒有**會誤導初學者的事實錯誤**。

只回報下列幾種：
1. 樂器事實：調弦、弦序、弦長、尺寸、琴格數、構造（寫反、寫錯單位、過度精確）
2. 樂理：順階和弦、級數、移調夾算法、拍號、節奏記譜
3. 技巧描述：封閉、切音、泛音、打板、錘音勾音滑音等，實際發聲方式寫錯
4. 具體數字／曲名／歌手／器材，明顯錯誤或無法證實

不要挑剔文風、不要建議改寫、不要回報「可以補充」。句子沒錯就不要列。
不確定的一律不要列（寧缺勿濫）。

輸出 JSON：{"issues":[{"quote":"原文 30 字內","why":"錯在哪（一句話）","fix":"正確說法"}]}
沒問題回 {"issues":[]}，最多 8 項。"""

_lock = threading.Lock()
_client = None


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def review(item: tuple[str, str, str]) -> list[dict]:
    folder, name, body = item
    facts = FACTS[folder]
    prompt = f"樂器背景：{facts}\n\n檔案：{folder}/{name}\n\n{body[:6000]}"
    for attempt in range(3):
        try:
            resp = client().messages.create(
                model=MODEL, max_tokens=3000, temperature=0,
                thinking={"type": "enabled", "budget_tokens": 1200},
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = next((b.text for b in resp.content if getattr(b, "type") == "text"), "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
            data = json.loads(text[text.find("{"): text.rfind("}") + 1])
            issues = data.get("issues", [])
            for it in issues:
                it["file"] = f"{folder}/{name}"
            return issues
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                print("  失敗：", folder, name, exc, file=sys.stderr)
            time.sleep(1 + attempt)
    return []


def main() -> int:
    folders, only = [], None
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--folder" and i + 1 < len(args):
            folders = [args[i + 1]]
        if a == "--files" and i + 1 < len(args):
            only = set(args[i + 1].split(","))
    folders = folders or ["guitar", "ukulele"]

    items = []
    for folder in folders:
        for path in sorted((BASE / "content" / folder).glob("*.md")):
            if only and path.name not in only:
                continue
            if path.name.startswith(("code_artifact", "目錄")):
                continue
            items.append((folder, path.name, path.read_text(encoding="utf-8")))

    print(f"要複核 {len(items)} 章")
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, issues in enumerate(pool.map(review, items)):
            print(f"  {items[i][0]}/{items[i][1]}：{len(issues)} 個疑點", flush=True)
            results += issues

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(results)} 個疑點 → {OUT.relative_to(BASE)}")
    for it in results:
        print(f"\n[{it['file']}] {it['why']}")
        print("  原文：", it["quote"][:90])
        print("  建議：", it["fix"][:90])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
