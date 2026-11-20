#!/usr/bin/env python3
"""用模型複核吉他／烏克麗麗課程裡「和弦與按法」的敘述。

機械檢查（audit_course_chords.py）只看規則抓得到的；這支把每章跟和弦有關的
句子抽出來，請模型逐句檢查：

  - 按法描述（第 N 弦第 M 格、手指）跟該和弦的組成音對不對
  - 和弦名稱、組成音、級數、調性關係有沒有寫錯
  - 進行標示的調對不對（例如標「G 大調」卻出現 F 自然音）

只回報「確定是錯」的句子，並且要求寫出為什麼錯；結果寫到
work/audit/course-chords-llm.json，人工複核後再改內容。

    python scripts/audit_course_chords_llm.py
    python scripts/audit_course_chords_llm.py --folder ukulele
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "work" / "audit" / "course-chords-llm.json"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

TUNING_TEXT = {
    "guitar": "標準調弦 EADGBE：第 6 弦 E2、第 5 弦 A2、第 4 弦 D3、第 3 弦 G3、第 2 弦 B3、第 1 弦 E4。"
              "常用開放和弦：C x32010、G 320003、D xx0232、A x02220、E 022100、"
              "Am x02210、Em 022000、Dm xx0231、F xx3211 或 133211、Bm x24432、"
              "C7 x32310、G7 320001、Am7 x02010、Em7 020000、Cmaj7 x32000、Dm7 xx0211、Cadd9 x32030。",
    "ukulele": "標準 High-G GCEA：第 4 弦 G4、第 3 弦 C4、第 2 弦 E4、第 1 弦 A4。"
               "常用和弦：C 0003、G 0232、D 2220、A 2100、E 1402、F 2010、"
               "Am 2000、Em 0432、Dm 2210、Bb 3211、Bm 4222、Cm 0333、F#m 2120、"
               "C7 0001、G7 0212、Am7 0000、Em7 0202、Cmaj7 0002。"
               "（寫法一律「第 4 弦在前」，例如 2120 代表 g=2、C=1、E=2、A=0）",
}

SYSTEM = """你是嚴格的音樂教材審查者，檢查吉他／烏克麗麗的和弦與按法敘述。

判斷標準（只回報**確定錯誤**，不確定就不要列）：
1. 按法：句子說「第 X 弦第 Y 格」，換算出來的音必須是該和弦的組成音之一；
   手指編號要合理（食指 1、中指 2、無名指 3、小指 4）。
2. 和弦名稱與組成音：例如 Em = E G B、F#m = F# A C#、Bb = Bb D F、Cadd9 = C E G D。
3. 調性與順階：標「X 大調」時，順階和弦必須是 I ii iii IV V vi vii°；
   借用和弦（borrowed）若句子有說明就不算錯。
4. 級數標示：1-5-6-4 之類要跟列出的和弦對得起來。
5. 移調夾（Capo）：夾 N 格 = 升 N 個半音（唱名調升高，指法調不變）。

不要挑剔用詞、語氣、排版。只回報會讓初學者按錯或觀念錯的句子。

輸出 JSON 陣列，每項：
{"file": "guitar/10.md", "line": "原始句子（可截短）", "problem": "錯在哪（一句話）", "fix": "建議改法"}
沒有問題就輸出 []。"""

_lock = threading.Lock()
_client = None


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


CHORDISH = re.compile(r"(?<![A-Za-z0-9])[A-G][♯♭#b]?(?:m|maj7|m7|7|dim|sus4|sus2|add9|6)?(?![A-Za-z0-9])")


def excerpts(folder: str) -> list[tuple[str, str]]:
    """每個檔案的「和弦相關句子」打包成一段，一次送一份。"""
    out = []
    for path in sorted((BASE / "content" / folder).glob("*.md")):
        lines = path.read_text(encoding="utf-8").splitlines()
        keep = []
        for line in lines:
            has_chord = len(CHORDISH.findall(line)) >= 1
            fingering = re.search(r"第\s*\d\s*弦", line) and re.search(r"第\s*\d+\s*格|空弦", line)
            if has_chord and (len(CHORDISH.findall(line)) >= 2 or fingering) and re.search(r"和弦|按|格|調|級", line):
                keep.append(line.strip()[:220])
        if keep:
            out.append((f"{folder}/{path.name}", "\n".join(keep)))
    return out


def review(chunk: tuple[str, str]) -> list[dict]:
    fname, body = chunk
    tuning = TUNING_TEXT["ukulele" if "ukulele" in fname else "guitar"]
    prompt = f"{tuning}\n\n檔案：{fname}\n以下是要檢查的句子：\n{body}"
    for attempt in range(3):
        try:
            resp = client().messages.create(
                model=MODEL, max_tokens=4000, temperature=0,
                thinking={"type": "enabled", "budget_tokens": 1200},
                system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
            data = json.loads(text[text.find("["): text.rfind("]") + 1])
            return [d for d in data if isinstance(d, dict)]
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                print("  失敗：", fname, exc, file=sys.stderr)
            time.sleep(1 + attempt)
    return []


def main() -> int:
    folder = None
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--folder" and i + 1 < len(args):
            folder = args[i + 1]
    chunks = []
    for f in (["guitar", "ukulele"] if not folder else [folder]):
        chunks += excerpts(f)
    print(f"共 {len(chunks)} 個檔案要複核")
    issues = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, res in enumerate(pool.map(review, chunks)):
            print(f"  {chunks[i][0]}：{len(res)} 個疑點", flush=True)
            issues += res

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(issues, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(issues)} 個疑點 → {OUT.relative_to(BASE)}")
    for it in issues:
        print(f"\n[{it.get('file')}] {it.get('problem')}")
        print("  句子：", str(it.get("line"))[:120])
        print("  建議：", it.get("fix"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
