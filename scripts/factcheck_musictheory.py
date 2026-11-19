#!/usr/bin/env python3
"""樂理課程的對抗審查：把每一章丟給模型，從三個角度找錯。

沿用 scripts/factcheck_ensembles.py 的做法，但對象是 content/musictheory/*.md，
一章一章審，結果寫到 work/theory-factcheck/<檔名>.json。

用法：
    python scripts/factcheck_musictheory.py            # 全部
    python scripts/factcheck_musictheory.py --only 1   # 只跑 musictheory1
    python scripts/factcheck_musictheory.py --chapter "第 3 章"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = BASE_DIR / "content" / "musictheory"
OUT_DIR = BASE_DIR / "work" / "theory-factcheck"
MODEL = os.environ.get("REWRITE_MODEL", "fast")   # 這個 proxy 只吃短名，見其他 factcheck 腳本

ANGLES = {
    "fact": "事實正確性：定義、歷史歸屬、分類法、人名書名。只要與通行說法不符就報。",
    "number": "數字與單位：頻率、音域、拍速、比例、年份。逐一核對是否與通行資料一致。",
    "teaching": "會不會教錯：比喻或簡化是否會讓讀者形成錯誤觀念，而不只是不精確。",
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


def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))


def review_chapter(angle: str, title: str, body: str) -> list[dict]:
    prompt = f"章節標題：{title}\n\n以下是這一章的全文（Markdown）：\n\n{body}"
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=6000, temperature=0.2,
            thinking={"type": "enabled", "budget_tokens": 2000},
            system=SYSTEM_TEMPLATE.format(angle=ANGLES[angle]),
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
        text = text.strip()
        if not text:
            raise ValueError("模型沒有回傳文字區塊")
        if text.startswith("```"):
            text = text.split("```")[1]
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        issues = data.get("issues", [])
        for it in issues:
            it["angle"] = angle
        return issues
    except Exception as exc:  # noqa: BLE001
        return [{"quote": "", "why": f"{angle} 審查失敗：{exc}", "fix": "",
                 "severity": "error", "angle": angle}]


def split_chapters(text: str) -> list[tuple[str, str]]:
    """用 `## ` 切章；開頭到第一個 ## 之間算前言。"""
    parts = re.split(r"(?m)^##\s+", text)
    out = []
    head = parts[0].strip()
    if head:
        out.append(("（前言）", head))
    for p in parts[1:]:
        lines = p.split("\n", 1)
        title = re.sub(r"[*#]", "", lines[0]).strip()
        body = lines[1] if len(lines) > 1 else ""
        out.append((title, body))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=str, default=None, help="只跑某個檔（例如 1）")
    ap.add_argument("--chapter", type=str, default=None, help="只跑標題含這個字串的章")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC_DIR.glob("musictheory*.md"))
    if args.only:
        files = [f for f in files if f.stem == f"musictheory{args.only}"]
    if not files:
        print("沒有符合的檔案")
        return 1

    total_issues = 0
    for path in files:
        chapters = split_chapters(path.read_text(encoding="utf-8"))
        if args.chapter:
            chapters = [c for c in chapters if args.chapter in c[0]]
        results = []
        for title, body in chapters:
            if len(body) < 200:
                continue
            issues = []
            for angle in ANGLES:
                issues.extend(review_chapter(angle, title, body))
            for it in issues:
                it["chapter"] = title
            results.append({"chapter": title, "issues": issues})
            print("  %-40s %d 個問題" % (title[:38], len(issues)), flush=True)
            total_issues += len(issues)

        dest = OUT_DIR / f"{path.stem}.json"
        dest.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print("%s → %s（%d 個問題）" % (path.name, dest.relative_to(BASE_DIR), total_issues), flush=True)

    print("\n總計 %d 個問題" % total_issues)
    return 0


if __name__ == "__main__":
    sys.exit(main())
