#!/usr/bin/env python3
"""Independent fact-check of *applied* article text against cached sources.

Different question from adjudication: not "what family is it" but "does every
concrete claim in the published text appear in the source?" A checker reads
the six sections and the source text and returns the claims it cannot trace,
with severity. Runs on the text now in content/, so it catches anything that
slipped through rewrite validation.

Output: work/factcheck/<slug>.json. Resumable.

Usage: python scripts/factcheck_rewrites.py [--limit N] [--slugs a,b] [--workers 12]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

BASE_DIR = Path(__file__).resolve().parent.parent
CONTENT_DIR = BASE_DIR / "content" / "instruments"
SRC_DIR = BASE_DIR / "work" / "verify" / "source"
OUT_DIR = BASE_DIR / "work" / "factcheck"
MODEL = os.environ.get("FACTCHECK_MODEL", "fast")
SECTIONS = ["介紹", "聆聽示範", "歷史背景", "音色描述", "樂器材質", "教學"]

SYSTEM = """你是事實查核員。使用者會給你一篇樂器條目與其來源全文，以及該樂器已確證的
分類事實。你的工作是找出條目中「來源無法支持」的具體斷言。

重要：
- 只標出有實質內容的具體斷言（人名、曲名、年份、數字、地名、材質、機構、獎項、
  具體作品）。空泛描述（「音色明亮」）不列入。
- 若來源完全沒提到某個說法，就是無法支持，標為 unsupported。
- 若來源提到但條目寫錯（年份錯、人名錯、張冠李戴），標為 contradicted。
- 不要因為你自己覺得某說法可能對就放行；只看來源有沒有。
- 以「※本段來源不足，待補考：」開頭的段落是編者已知並標記的缺口，
  不要列入 issues；它後面的文字若只是陳述分類與地區等已確證事實即可。
- 沒有問題就回空陣列。

只輸出 JSON：
{"issues": [{"section": "<段落名>", "claim": "<條目原文片段>", "verdict": "unsupported|contradicted", "why": "<來源有無提及>"}],
 "score": <0-100 整體可信度>}"""


_client = None
_lock = threading.Lock()


def client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            _client = anthropic.Anthropic(
                api_key=os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def article_text(slug: str) -> dict[str, str]:
    text = (CONTENT_DIR / f"{slug}.md").read_text(encoding="utf-8")
    out = {}
    for name in SECTIONS:
        m = re.search(rf"^## {re.escape(name)}[ \t]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
        if m:
            out[name] = m.group(1).strip()
    return out


def parse_json(text: str) -> dict | None:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e <= s:
        return None
    try:
        return json.loads(text[s:e + 1])
    except json.JSONDecodeError:
        return None


def check(slug: str) -> dict | None:
    src_path = SRC_DIR / f"{slug}.json"
    if not src_path.exists():
        return None
    src = json.loads(src_path.read_text(encoding="utf-8"))
    en = (src.get("en") or {}).get("text") or ""
    zh = (src.get("zh") or {}).get("text") or ""
    if not (en or zh):
        return {"slug": slug, "status": "no_source"}
    sections = article_text(slug)
    adj_path = BASE_DIR / "work" / "adjudicate" / f"{slug}.json"
    adj = json.loads(adj_path.read_text(encoding="utf-8")) if adj_path.exists() else {}

    body = "\n\n".join(f"## {k}\n{v}" for k, v in sections.items())
    prompt = (
        f"樂器：{slug}\n"
        f"已確證分類：{adj.get('family', '')} {adj.get('hs', '')}\n\n"
        f"## 待查條目\n{body[:3500]}\n\n"
        f"## 來源（英文）\n{en[:7000]}\n\n"
        + (f"## 來源（中文）\n{zh[:3500]}\n\n" if zh else "")
        + "請輸出 JSON。"
    )
    last_err = ""
    for attempt in range(3):
        try:
            resp = client().messages.create(
                model=MODEL, max_tokens=14000, temperature=0, system=SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if hasattr(b, "text"))
            if not text.strip():
                last_err = 'empty response'
                continue
            data = parse_json(text)
            if data is not None:
                issues = [i for i in data.get("issues", []) if isinstance(i, dict)]
                return {"slug": slug, "status": "ok", "score": data.get("score"),
                        "issues": issues[:12]}
            last_err = "no json"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)[:100]
            time.sleep(2.0 * (attempt + 1))
    return {"slug": slug, "status": "error", "error": last_err}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        slugs = sorted(p.stem for p in CONTENT_DIR.glob("*.md"))
        if not args.refresh:
            slugs = [s for s in slugs if not (OUT_DIR / f"{s}.json").exists()]
    if args.limit:
        slugs = slugs[:args.limit]
    if not slugs:
        print("nothing to do")
        return

    print(f"fact-checking {len(slugs)} instruments, {args.workers} workers ...", flush=True)
    done = 0
    stats = {"ok": 0, "no_source": 0, "error": 0}
    lock = threading.Lock()

    def run(s: str) -> None:
        nonlocal done
        res = check(s)
        if res:
            (OUT_DIR / f"{s}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1),
                                               encoding="utf-8")
            with lock:
                stats[res["status"]] = stats.get(res["status"], 0) + 1
        with lock:
            done += 1
            if done % 40 == 0:
                print(f"  {done}/{len(slugs)} {stats}", flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(run, slugs))
    print(f"done: {stats}")


if __name__ == "__main__":
    main()
