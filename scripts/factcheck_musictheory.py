#!/usr/bin/env python3
"""樂理課程的對抗審查：多引擎 × 多角度，每章找出真正的錯誤。

沿用 scripts/factcheck_ensembles.py 的形狀，差別在於這裡跑**兩個模型**：
`fast` 與 `expert` 各審一次，再從四個角度（事實／數字／教學／記譜）找錯。
兩顆引擎都報同一處，通常就是真的錯；只有一顆報的，再人工判斷。

    python scripts/factcheck_musictheory.py                 # 全部 40 章
    python scripts/factcheck_musictheory.py --new-only      # 只跑新寫的 20 章
    python scripts/factcheck_musictheory.py --only 6        # 只跑 musictheory6
    python scripts/factcheck_musictheory.py --chapter 三和弦

結果寫到 work/theory-factcheck/<檔名>.json（同一份會累積所有引擎與角度）。
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

# 章節標題含 emoji，cp950 主控台會直接炸掉，所以先換成 UTF-8。
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = BASE_DIR / "content" / "musictheory"
OUT_DIR = BASE_DIR / "work" / "theory-factcheck"

# 兩顆引擎：fast 便宜、expert 較強。這個 proxy 只吃短名（見 api_constraints）。
MODELS = [os.environ.get("FAST_MODEL", "fast"), os.environ.get("EXPERT_MODEL", "expert")]

# 40 章擴編後新寫（或整章改寫）的章節；重排時舊章只改了編號，沒有重新查證
NEW_CHAPTERS = {2, 11, *range(16, 34), 40}

ANGLES = {
    "fact": "事實正確性：定義、分類、歷史歸屬、人名與書名。與通行說法不符就報。",
    "number": "數字與單位：頻率、音分、半音數、拍數、年份、音域。逐一核對。",
    "teaching": "會不會教錯：比喻或簡化是否會讓讀者形成錯誤觀念，而不只是不精確。",
    "notation": "記譜與和弦標記：和弦符號（Cmaj7／Cm7♭5）、級數大小寫、調號升降順序、"
                "轉位數字、拍號寫法，是否與通行慣例一致。",
}

SYSTEM_TEMPLATE = """你是一位嚴格但公平的樂理與音樂聲學審查者，正在檢查一份給初學者的線上課程。

這一輪請只從「{angle}」的角度審查。

只回報真正的錯誤或會誤導讀者的說法。以下不算問題，不要報：
- 為了給初學者而做的合理簡化（只要不至於造成誤解）
- 語氣、排版、用字偏好
- 「可以補充更多」這類建議

輸出 JSON：
{{
  "issues": [
    {{
      "quote": "原文片段（必須與原文逐字相同，30 字以內）",
      "why": "為什麼這裡有問題（一句話）",
      "fix": "建議改成什麼（具體，不要寫「建議修正」）",
      "severity": "high|medium|low"
    }}
  ]
}}

規則：
- 沒有問題就回空的 issues，不要為了湊數而報。
- quote 必須是原文真正的片段。
- 最多 8 個 issue，優先報最嚴重的。"""

_client = None
_lock = threading.Lock()


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(
            api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def review(model: str, angle: str, title: str, body: str) -> list[dict]:
    prompt = f"章節標題：{title}\n\n以下是這一章的全文（Markdown）：\n\n{body[:16000]}"
    try:
        # thinking 預算一定要自己指定、而且不能大：expert 後端若沿用預設值，
        # 會把 max_tokens 全部花在思考上，回傳空字串；實測 1500 最穩、約 10 秒／次。
        for attempt in range(2):
            try:
                resp = client().messages.create(
                    model=model, max_tokens=8000, temperature=0.2,
                    thinking={"type": "enabled", "budget_tokens": 1500},
                    system=SYSTEM_TEMPLATE.format(angle=ANGLES[angle]),
                    messages=[{"role": "user", "content": prompt}],
                )
                break
            except Exception:            # noqa: BLE001  代理偶爾 timeout，重試一次
                if attempt == 1:
                    raise
        text = "".join(getattr(b, "text", "") for b in resp.content
                       if getattr(b, "type", "") == "text").strip()
        if not text:
            raise ValueError("模型沒有回傳文字區塊（thinking 用光 token？）")
        if text.startswith("```"):
            text = text.split("```")[1]
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        out = data.get("issues", [])
        for it in out:
            it["angle"] = angle
            it["model"] = model
        return out
    except Exception as exc:  # noqa: BLE001
        return [{"quote": "", "why": f"{model}/{angle} 審查失敗：{exc}", "fix": "",
                 "severity": "error", "angle": angle, "model": model}]


def split_chapters(text: str) -> list[tuple[int, str, str]]:
    """用 `## 第 N 章` 切章；回傳 (章號, 標題, 內文)。"""
    parts = re.split(r"(?m)^##\s+", text)
    out = []
    for p in parts[1:]:
        head, _, body = p.partition("\n")
        head = re.sub(r"[*#]", "", head).strip()
        m = re.search(r"第\s*(\d+)\s*章", head)
        if not m:
            continue
        out.append((int(m.group(1)), head, body.strip()))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=str, default=None, help="只跑某個檔（例如 6）")
    ap.add_argument("--chapter", type=str, default=None, help="只跑標題含這個字串的章")
    ap.add_argument("--new-only", action="store_true", help="只跑 40 章擴編時新寫的章")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC_DIR.glob("musictheory*.md"))
    if args.only:
        files = [f for f in files if f.stem == f"musictheory{args.only}"]
    if not files:
        print("沒有符合的檔案")
        return 1

    total = 0
    for path in files:
        chapters = split_chapters(path.read_text(encoding="utf-8"))
        if args.chapter:
            chapters = [c for c in chapters if args.chapter in c[1]]
        if args.new_only:
            chapters = [c for c in chapters if c[0] in NEW_CHAPTERS]
        if not chapters:
            continue

        results, errors = [], 0
        for num, title, body in chapters:
            jobs = [(m, a) for m in MODELS for a in ANGLES]
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                batches = list(pool.map(lambda j: review(j[0], j[1], title, body), jobs))
            issues = [it for batch in batches for it in batch]
            errors += sum(1 for it in issues if it.get("severity") == "error")
            for it in issues:
                it["chapter"] = title
                it["chapter_num"] = num
            # 同一處錯誤可能被兩顆引擎都抓到：用 quote 去重，但保留是哪幾顆引擎
            seen: dict[str, dict] = {}
            for it in issues:
                if it.get("severity") == "error":
                    continue
                key = re.sub(r"\s+", "", it.get("quote", ""))[:24]
                if key in seen:
                    seen[key].setdefault("also", []).append("%s/%s" % (it["model"], it["angle"]))
                else:
                    seen[key] = it
            merged = sorted(seen.values(),
                            key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(x.get("severity"), 3))
            results.append({"chapter": title, "chapter_num": num, "issues": merged})
            with _lock:
                print("  第 %2d 章 %-28s %d 個問題（%s）" % (
                    num, title.split("：")[-1][:26], len(merged),
                    ", ".join("%s×%d" % (m, sum(1 for it in merged if it["model"] == m))
                              for m in MODELS)), flush=True)
            total += len(merged)

        dest = OUT_DIR / f"{path.stem}.json"
        dest.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print("%s → %s（累計 %d）" % (path.name, dest.relative_to(BASE_DIR), total), flush=True)
        if errors:
            print("  注意：有 %d 個審查呼叫失敗" % errors)

    print("\n總計 %d 個問題" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
