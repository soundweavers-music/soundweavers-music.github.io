#!/usr/bin/env python3
"""把 work/daw-strings.json 翻成英文，輸出 daw-studio/js/i18n-dict.js。

介面字串很多（近千條），所以：
  - 每批 40 條送一次，結果累積在 work/daw-i18n-cache.json（可中斷續跑）
  - 只輸出「有翻譯」的條目，執行期查不到就顯示原文（不會出現空白）

用法：
  python scripts/daw_i18n_translate.py
  python scripts/daw_i18n_translate.py --rebuild   # 只從 cache 重建 js 檔
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
SRC = BASE / "work" / "daw-strings.json"
CACHE = BASE / "work" / "daw-i18n-cache.json"
OUT = BASE / "daw-studio" / "js" / "i18n-dict.js"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

SYSTEM = """你是專業的軟體在地化翻譯。把「繁體中文」的 DAW（數位音樂工作站）介面字串翻成自然、簡潔的英文（美式）。

規則：
1. 只輸出 JSON 物件：{"原文": "英文"}，不要其他文字。
2. 保留技術術語：EQ, LUFS, dB, dBFS, MIDI, USB, BPM, Hz, kHz, attack, release, threshold, ratio, reverb, delay, chorus, compressor, limiter, master, bus, send, pan, mono, stereo, take, snap, loop。
3. 保留原文裡的佔位符與符號（例如 {n}、%、→、×），不要翻譯程式碼或檔名（.zyproj、.sf2、.mid）。
4. 按鈕用祈使或名詞（"New project"、"Export"）；標籤用名詞（"Volume"、"Pan"）；說明句用完整的英文句子。
5. 語氣跟原本一樣：給初學者的教學語氣，不要行銷詞。
6. 若某條沒有適合的英文（例如只有標點或狀聲詞），照原樣回傳。"""

_lock = threading.Lock()
_client = None


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def translate(batch: list[str]) -> dict[str, str]:
    payload = json.dumps(batch, ensure_ascii=False, indent=0)
    for attempt in range(3):
        try:
            resp = client().messages.create(
                model=MODEL, max_tokens=8000, temperature=0.1,
                # 這個 proxy 沒給 thinking 預算時，長提示會把 token 全花在思考、回傳空字串
                thinking={"type": "enabled", "budget_tokens": 1500},
                system=SYSTEM,
                messages=[{"role": "user", "content": payload}],
            )
            text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "").strip()
            if text.startswith("```"):
                text = text.split("```")[1]
            data = json.loads(text[text.find("{"): text.rfind("}") + 1])
            return {k: v for k, v in data.items() if isinstance(v, str) and v.strip()}
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                print("  批次失敗：", exc, file=sys.stderr)
            time.sleep(1 + attempt)
    return {}


def main() -> int:
    if "--rebuild" not in sys.argv:
        strings = json.loads(SRC.read_text(encoding="utf-8"))
        cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
        todo = [s for s in strings if s not in cache]
        print(f"共 {len(strings)} 條，已完成 {len(cache)}，待翻 {len(todo)}")
        batches = [todo[i:i + 25] for i in range(0, len(todo), 25)]
        done = 0
        with ThreadPoolExecutor(max_workers=4) as pool:
            for i, res in enumerate(pool.map(translate, batches)):
                cache.update(res)
                done += len(res)
                print(f"  批次 {i + 1}/{len(batches)}：+{len(res)}（累計 {done}）", flush=True)
                CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    body = json.dumps(cache, ensure_ascii=False, indent=1)
    OUT.write_text(
        "// 由 scripts/daw_i18n_translate.py 產生，請不要手改（要修翻譯請改 work/daw-i18n-cache.json 再 --rebuild）\n"
        "export const EN = " + body + ";\n",
        encoding="utf-8")
    print(f"{len(cache)} 條翻譯 → {OUT.relative_to(BASE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
