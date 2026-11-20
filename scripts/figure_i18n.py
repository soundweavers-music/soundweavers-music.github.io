#!/usr/bin/env python3
"""圖的英文版：把 SVG 裡的 <text> 換成英文，輸出 assets/<course>/en/。

一套流程給所有課程用（樂理、吉他、烏克麗麗、人聲、錄音後製…），因為每張圖的
做法都一樣：中文圖先產生好，再逐字串換掉。字串表是「中文原文 → 英文」，
沒收錄的字串會原樣保留中文並列出來，所以覆蓋率是可以檢查的，不用靠眼睛看整張圖。

三個步驟
--------
    python scripts/figure_i18n.py extract guitar
        掃 assets/guitar/*.svg，把要翻的中文字串寫成 work/figure_strings/guitar/<圖>.json
        已經有英文版的圖（assets/guitar/en/）會自動配對先填好。

    （翻譯 work/figure_strings/guitar/*.json 裡的值）

    python scripts/figure_i18n.py merge guitar
        合併成 scripts/figure_strings/guitar.py；沒翻的會列出來（離開碼 1）。

    python scripts/figure_i18n.py generate guitar
        產生 assets/guitar/en/*.svg 並檢查有沒有漏翻。

    python scripts/figure_i18n.py status            # 每套課程還剩幾條
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS = BASE_DIR / "assets"
WORK = BASE_DIR / "work" / "figure_strings"
STRINGS = BASE_DIR / "scripts" / "figure_strings"

TEXT_RE = re.compile(r"(<text\b[^>]*>)(.*?)(</text>)", re.S)
TSPAN_RE = re.compile(r"(<tspan\b[^>]*>)(.*?)(</tspan>)", re.S)
# aria-label 這類給螢幕讀器用的字串：畫面上看不到，但一樣是中文
ATTR_RE = re.compile(r'(aria-label|title|desc)="([^"]*)"')
# <title> 是元素不是屬性，另一個 pattern 才抓得到
TITLE_RE = re.compile(r"(<title>)(.*?)(</title>)", re.S)
CJK = re.compile(r"[一-鿿]")

HEADER = '''"""%s 圖的中文 → 英文字串表。

由 scripts/figure_i18n.py merge %s 從 work/figure_strings/%s/*.json 產生，
不要手改這一份（改 JSON 再合併）。

**一張圖一個字典**，不是全部混在一起：同一個中文字在不同圖上意思不一樣
（歌詞格子裡的「長」是歌詞的一個音節，別張圖的「長」可能是「長音」），
扁平的表會讓後 merge 的那張蓋掉前一張。
"""
from __future__ import annotations

EN: dict[str, dict[str, str]] = {
'''


def load_en(course: str) -> dict[str, dict[str, str]]:
    path = STRINGS / ("%s.py" % course)
    if not path.exists():
        return {}
    sys.path.insert(0, str(STRINGS))
    try:
        mod = __import__("%s" % course)
        return {k: dict(v) for k, v in mod.EN.items()}
    except Exception:
        return {}
    finally:
        sys.path.pop(0)


def flat(en: dict[str, dict[str, str]]) -> dict[str, str]:
    """所有圖的字串併成一個平面表（只拿來算「還缺幾條」的統計）。"""
    out: dict[str, str] = {}
    for d in en.values():
        out.update(d)
    return out


def _key(rel: Path) -> str:
    """圖的鍵：相對路徑去掉 .svg，一律用 /（Windows 會給反斜線）。"""
    return str(rel.with_suffix("")).replace("\\", "/")


def _texts(svg: str) -> list[str]:
    """一個 SVG 裡所有 <text> 的中文內容（含 tspan），依出現順序、去重。"""
    out: list[str] = []

    def take(txt: str) -> None:
        raw = html.unescape(txt).strip()
        if raw and CJK.search(raw) and raw not in out:
            out.append(raw)

    for m in TEXT_RE.finditer(svg):
        inner = m.group(2)
        if "<tspan" in inner:
            for t in TSPAN_RE.finditer(inner):
                take(t.group(2))
        else:
            take(inner)
    # aria-label 也要翻，不然讀屏使用者聽到的是中文
    for m in ATTR_RE.finditer(svg):
        take(m.group(2))
    for m in TITLE_RE.finditer(svg):
        take(m.group(2))
    return out


def _swap(inner: str, en: dict[str, str], missing: list[str]) -> str:
    def conv(raw_txt: str) -> str | None:
        raw = html.unescape(raw_txt).strip()
        if not raw or not CJK.search(raw):
            return None
        val = en.get(raw)
        if val is None:
            missing.append(raw)
            return None
        lead = raw_txt[:len(raw_txt) - len(raw_txt.lstrip())]
        trail = raw_txt[len(raw_txt.rstrip()):]
        return lead + html.escape(val) + trail

    if "<tspan" in inner:
        return TSPAN_RE.sub(
            lambda m: m.group(1) + (conv(m.group(2)) or m.group(2)) + m.group(3), inner)
    new = conv(inner)
    return inner if new is None else new


def translate_svg(svg: str, en: dict[str, str]) -> tuple[str, list[str]]:
    """換掉 <text> 的內容，也換 aria-label 這類給螢幕讀器用的屬性。

    只換 <text> 會留下中文的 aria-label——畫面上看不到，但讀屏使用者會聽到中文，
    而且「這張圖還有沒有中文」的檢查會一直亮紅燈。
    """
    missing: list[str] = []
    out = TEXT_RE.sub(
        lambda m: m.group(1) + _swap(m.group(2), en, missing) + m.group(3), svg)

    def attr(m):
        raw = html.unescape(m.group(2)).strip()
        if not raw or not CJK.search(raw):
            return m.group(0)
        val = en.get(raw)
        if val is None:
            missing.append(raw)
            return m.group(0)
        return '%s="%s"' % (m.group(1), html.escape(val, quote=True))

    out = ATTR_RE.sub(attr, out)
    out = TITLE_RE.sub(
        lambda m: m.group(1) + _swap(m.group(2), en, missing) + m.group(3), out)
    return out, missing


def _pair(src_dir: Path, rel: str, zh_svg: str) -> dict[str, str]:
    """已經有英文版的圖：位置對位置配對（同一個檔案換字，結點順序一致）。"""
    en_path = src_dir / "en" / rel
    if not en_path.exists():
        return {}
    zh_nodes = [m.group(2) for m in TEXT_RE.finditer(zh_svg)]
    en_nodes = [m.group(2) for m in TEXT_RE.finditer(en_path.read_text(encoding="utf-8"))]
    if len(zh_nodes) != len(en_nodes):
        return {}
    pairs = {}
    for zh, e in zip(zh_nodes, en_nodes):
        a, b = html.unescape(zh).strip(), html.unescape(e).strip()
        if a and CJK.search(a) and b and not CJK.search(b):
            pairs[a] = b
    return pairs


def cmd_extract(course: str) -> int:
    src_dir = ASSETS / course
    out = WORK / course
    out.mkdir(parents=True, exist_ok=True)
    have = load_en(course)
    total = todo = 0
    for path in sorted(src_dir.rglob("*.svg")):
        rel = path.relative_to(src_dir)
        if rel.parts[0] == "en":
            continue
        svg = path.read_text(encoding="utf-8")
        keys = _texts(svg)
        if not keys:
            continue
        seeded = {**have.get(_key(rel), {}),
                  **_pair(src_dir, str(rel), svg)}
        payload = {k: seeded.get(k, "") for k in keys}
        jf = out / rel.with_suffix(".json")
        jf.parent.mkdir(parents=True, exist_ok=True)
        # 已經翻好的值不能蓋掉：extract 只要補新字串，不是重來一次
        if jf.exists():
            try:
                again = json.loads(jf.read_text(encoding="utf-8"))
            except Exception:
                again = {}
            seeded = {**{k: v for k, v in again.items() if v}, **seeded}
        jf.write_text(
            json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        total += len(keys)
        todo += sum(1 for v in payload.values() if not v)
    print("%s：寫出 %d 個 JSON 到 %s" % (course, len(list(out.rglob("*.json"))),
                                        out.relative_to(BASE_DIR)))
    print("字串 %d 條，待翻 %d 條。" % (total, todo))
    return 0


def cmd_merge(course: str) -> int:
    src = WORK / course
    if not src.exists():
        print("%s：還沒有 %s，先跑 extract。" % (course, src.relative_to(BASE_DIR)))
        return 1
    merged: dict[str, dict[str, str]] = {}
    blank: list[str] = []
    for path in sorted(src.rglob("*.json")):
        fig = _key(path.relative_to(src))
        for zh, val in json.loads(path.read_text(encoding="utf-8")).items():
            val = (val or "").strip()
            if not val:
                blank.append("%s: %s" % (fig, zh))
            else:
                merged.setdefault(fig, {})[zh] = val
    STRINGS.mkdir(parents=True, exist_ok=True)
    chunks = []
    for fig in sorted(merged):
        rows = "\n".join(
            "        %s: %s," % (json.dumps(k, ensure_ascii=False),
                                json.dumps(v, ensure_ascii=False))
            for k, v in sorted(merged[fig].items()))
        chunks.append("    %s: {\n%s\n    }," % (json.dumps(fig, ensure_ascii=False), rows))
    dst = STRINGS / ("%s.py" % course)
    dst.write_text(HEADER % (course, course, course) + "\n".join(chunks) + "\n}\n",
                   encoding="utf-8")
    n = sum(len(v) for v in merged.values())
    print("%s：寫出 %s，%d 張圖 %d 條。" % (course, dst.relative_to(BASE_DIR), len(merged), n))
    if blank:
        print("還沒翻 %d 條：" % len(blank))
        for b in blank[:40]:
            print("  " + b)
        if len(blank) > 40:
            print("  …還有 %d 條" % (len(blank) - 40))
        return 1
    return 0


def cmd_generate(course: str) -> int:
    src_dir = ASSETS / course
    dst_dir = src_dir / "en"
    dst_dir.mkdir(parents=True, exist_ok=True)
    en = load_en(course)
    total = 0
    missing_all: dict[str, list[str]] = {}
    for path in sorted(src_dir.rglob("*.svg")):
        rel = path.relative_to(src_dir)
        if rel.parts[0] == "en":
            continue
        out, missing = translate_svg(path.read_text(encoding="utf-8"),
                                     en.get(_key(rel), {}))
        target = dst_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(out, encoding="utf-8")
        total += 1
        if missing:
            missing_all[path.name] = sorted(set(missing))
    print("%s：產生 %d 張英文圖 → %s" % (course, total, dst_dir.relative_to(BASE_DIR)))
    if missing_all:
        n = sum(len(v) for v in missing_all.values())
        print("還有 %d 條字串沒翻（原樣保留中文）：" % n)
        for k, v in list(missing_all.items())[:20]:
            print("  %s: %s" % (k, "、".join(v)))
        return 1
    print("全部字串都有英文版。")
    return 0


def cmd_status() -> int:
    rows = []
    for src_dir in sorted(ASSETS.iterdir()):
        if not src_dir.is_dir() or src_dir.name in {"vendor", "brand", "instruments"}:
            continue
        svgs = [p for p in src_dir.rglob("*.svg") if p.relative_to(src_dir).parts[0] != "en"]
        if not svgs:
            continue
        en = load_en(src_dir.name)
        need = left = 0
        for p in svgs:
            keys = _texts(p.read_text(encoding="utf-8"))
            have_fig = en.get(_key(p.relative_to(src_dir)), {})
            need += len(keys)
            left += len([k for k in keys if k not in have_fig])
        rows.append((src_dir.name, len(svgs), need, left))
    for name, n_svg, n_str, left in rows:
        print("  %-14s %3d 張圖  %4d 條字串  待翻 %4d" % (name, n_svg, n_str, left))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("action", choices=["extract", "merge", "generate", "status"])
    ap.add_argument("course", nargs="?", default="")
    a = ap.parse_args()
    if a.action == "status":
        return cmd_status()
    if not a.course:
        ap.error("要指定課程，例如 guitar")
    return {"extract": cmd_extract, "merge": cmd_merge,
            "generate": cmd_generate}[a.action](a.course)


if __name__ == "__main__":
    sys.exit(main())
