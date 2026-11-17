#!/usr/bin/env python3
"""Multi-source verification of the vocal course and research columns.

Unlike the instruments pipeline, this content makes claims about anatomy,
acoustics and named researchers, and none of it is backed by a cached source.
So each claim has to be checked against the live web.

Two modes:

  chapters   — the 50 teaching chapters. Extract the concrete, checkable claims
               (muscle actions, air direction, register behaviour, mic physics,
               numbers) and have three differently-framed reviewers judge each
               one against current voice-science consensus.
  research   — the three long research columns. These NAME people, labs, papers
               and findings. For every named entity the reviewer must determine
               whether the work exists, is attributed correctly, and whether the
               specific finding attributed to it is supported.

Reviewers are told to refute. Output goes to work/verify-vocal/<file>.json.
Nothing under content/ is modified.

Usage:
  python scripts/verify_vocal_content.py --mode chapters [--files a.md,b.md]
  python scripts/verify_vocal_content.py --mode research
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
CONTENT = BASE_DIR / "content" / "vocal"
OUT = BASE_DIR / "work" / "verify-vocal"
MODEL = os.environ.get("REWRITE_MODEL", "fast")

CHAPTER_SYSTEM = """你是流行歌唱教學與嗓音科學的審查者。任務是**找出錯誤**，不是評論寫作風格。

針對給定的教學章節，逐項檢查內容是否與目前嗓音科學與聲樂教學的共識相符：
1. 肌肉作用：甲杓肌（TA）收縮使聲帶變厚變短、音變低；環甲肌（CT）使聲帶拉長變薄、音變高。有沒有寫反？
2. 呼吸：橫膈膜收縮時下降，胸腔擴張使空氣進入；腹部外凸是結果，不是「用肚子把橫膈膜推下去」。
3. 音區用語：胸聲、頭聲、混聲、假聲、氣泡音、咽音的描述是否合理？有沒有把某個音區說成萬能或絕對？
4. 物理：麥克風近接效應、壓縮、雙軌疊錄、共鳴與共振峰的說明是否正確？
5. 數字：任何百分比、Hz、dB、秒數、音域，是否過度精確、沒有依據、或明顯錯誤？
6. 引用：有沒有編造的歌手名、曲名、研究、儀器？

只報告「有問題」的句子。每一項要能指出原文片段，並說明正確說法。
若你不確定某項，標 uncertain，不要說它對。

輸出嚴格 JSON：
{{"issues":[{{"quote":"原文片段（30字內）","kind":"wrong|unsupported|overstated|uncertain","why":"一句話說明（繁體中文）","correct":"正確說法或應刪除（繁體中文）"}}]}}
沒有問題回 {{"issues":[]}}。最多 10 項，優先報最嚴重的。"""

RESEARCH_SYSTEM = """你是學術查核員。這是一篇中文研究專欄，裡面引用了具體的人名、實驗室、
論文與研究發現，但**沒有附上參考文獻**。你的任務是找出「無法證實或張冠李戴」的內容。

對文中每一個可查證的斷言，用你的知識判斷：
1. 這個人物／實驗室／機構是否存在，任職與研究領域是否對得上？
2. 這個具體發現（數字、實驗結果、術語）是否真的出自這個人或這個研究？
3. 專有名詞（共振峰、慣性抗、非線性聲源濾波耦合、SVP、Three Bears Passage 等）
   是否使用正確？
4. 有沒有把「常見說法」寫成「某人的研究發現」？

只報告有問題的項目。分級：
- fabricated：人物、機構或研究不存在，或明顯是編的。
- misattributed：研究存在，但被歸給錯的人，或內容與原作者的主張不符。
- unsupported：具體的數字或發現沒有來源可對應。
- uncertain：你無法確認，但看起來可疑。

輸出嚴格 JSON：
{{"issues":[{{"quote":"原文片段（30字內）","kind":"fabricated|misattributed|unsupported|uncertain","why":"一句話說明（繁體中文）","correct":"建議怎麼改（刪除、改成一般說法、或補上正確歸屬）"}}]}}
沒有問題回 {{"issues":[]}}。最多 10 項，優先報最嚴重的。"""

ANGLES = {
    "voice-science": "以嗓音醫學與聲樂教學的臨床共識審查：只要與解剖、氣流、肌肉作用、音區行為有關的錯誤都要指出。",
    "acoustics": "以聲學與錄音工程的專業審查：共鳴、共振峰、近接效應、壓縮、疊錄、頻率的描述是否正確。",
    "skeptic": "以嚴格查核員的身分審查：任何具體數字、人名、研究、術語，只要無法證實就標記出來；寧可多報。",
}


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))


_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = get_client()
    return _client


def review(angle: str, title: str, body: str, system: str) -> list[dict]:
    prompt = (f"審查角度：{ANGLES[angle]}\n\n"
              f"以下是要審查的內容（中文）：\n\n{body[:24000]}")
    try:
        resp = client().messages.create(
            model=MODEL, max_tokens=9000, temperature=0.15,
            thinking={"type": "enabled", "budget_tokens": 2500},
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "").strip()
        if not text:
            raise ValueError(f"沒有文字區塊（stop={resp.stop_reason}）")
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        return data.get("issues", [])
    except Exception as exc:  # noqa: BLE001
        return [{"quote": "", "kind": "error", "why": f"{angle} 審查失敗：{exc}", "correct": ""}]


def check(path: Path, system: str, force: bool) -> dict:
    dest = OUT / f"{path.stem}.json"
    if dest.exists() and not force:
        return json.loads(dest.read_text(encoding="utf-8"))
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    title = lines[0].lstrip("# ").strip()
    body = "\n".join(lines[1:])
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda a: review(a, title, body, system), ANGLES))
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
    ap.add_argument("--mode", choices=["chapters", "research"], required=True)
    ap.add_argument("--files")
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.mode == "chapters":
        system = CHAPTER_SYSTEM
        paths = ([CONTENT / f.strip() for f in args.files.split(",")] if args.files
                 else sorted(CONTENT.glob("vocal_ch*.md"),
                             key=lambda p: int(re.search(r"\d+", p.name).group())))
    else:
        system = RESEARCH_SYSTEM
        paths = [p for p in CONTENT.glob("*.md")
                 if not p.name.startswith(("vocal_ch", "_"))
                 and p.name != "議題.md"]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda p: check(p, system, args.force), paths))

    fatals = 0
    for r in results:
        kinds = [i["kind"] for a in r["by_angle"].values() for i in a]
        bad = sum(1 for k in kinds if k in {"wrong", "fabricated", "misattributed"})
        err = sum(1 for k in kinds if k == "error")
        fatals += bad
        mark = "XX" if err else ("!!" if bad else "..")
        print(f"{mark} {r['file']:<34} issues={r['issue_count']:>2} serious={bad}")
    print(f"\n{len(results)} 份；{fatals} 個嚴重問題。明細：{OUT.relative_to(BASE_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
