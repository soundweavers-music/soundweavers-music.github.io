#!/usr/bin/env python3
"""檢查網站上出現的和弦資料是不是真的對（組成音、必備音、簡單把位）。

會檢查四份來源：
  1. scripts/_chord_library.js      —— 指板工具與和弦頁用的資料庫
  2. scripts/build_guitar_figures.py —— 吉他課程的和弦圖
  3. scripts/make_ukulele_diagrams.py —— 烏克麗麗課程的和弦圖
  4. content/chord/*.md             —— 產生出來的和弦指法表（發音欄要對得起按格）

每條資料都會重新算「這幾格按下去會響哪些音」，再跟和弦應有的音比對：
  - 出現不屬於這個和弦的音 → 錯（例如 C#m 裡出現 C）
  - 少了定義音 → 錯（例如半減七和弦少了 b5，就只是 m7）

用法：
  python scripts/verify_chord_data.py          # 只列出問題，有問題回傳 1
  python scripts/verify_chord_data.py --all    # 連「簡單把位」檢查也列出來
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
LIB = BASE / "scripts" / "_chord_library.js"

NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
ROOT_PC = {"C": 0, "C#": 1, "C♯": 1, "Db": 1, "D": 2, "D#": 3, "D♯": 3, "Eb": 3, "E♭": 3,
           "E": 4, "F": 5, "F#": 6, "F♯": 6, "Gb": 6, "G": 7, "G#": 8, "G♯": 8,
           "Ab": 8, "A♭": 8, "A": 9, "A#": 10, "A♯": 10, "Bb": 10, "B♭": 10, "B": 11}

# 每個品質「可以有」的音（用來抓外音）
QUAL = {
    "maj": {0, 4, 7}, "m": {0, 3, 7}, "7": {0, 4, 7, 10}, "maj7": {0, 4, 7, 11},
    "m7": {0, 3, 7, 10}, "aug": {0, 4, 8}, "dim": {0, 3, 6}, "dim7": {0, 3, 6, 9},
    "m7b5": {0, 3, 6, 10}, "6": {0, 4, 7, 9}, "m6": {0, 3, 7, 9},
    "9": {0, 4, 7, 10, 2}, "sus2": {0, 2, 7}, "sus4": {0, 5, 7}, "add9": {0, 4, 7, 2},
}
# 每個品質「必須有」的音（5 音在七和弦上可以省；9 和弦常省略根音）
ESSENTIAL = {
    "maj": {0, 4, 7}, "m": {0, 3, 7}, "7": {0, 4, 10}, "maj7": {0, 4, 11},
    "m7": {0, 3, 10}, "aug": {0, 4, 8}, "dim": {0, 3, 6}, "dim7": {0, 3, 6, 9},
    "m7b5": {0, 3, 6, 10}, "6": {0, 4, 9}, "m6": {0, 3, 9},
    "9": {4, 10, 2}, "sus2": {0, 2, 7}, "sus4": {0, 5, 7}, "add9": {0, 4, 2},
}

# 各樂器調弦（由低音弦到高音弦的 MIDI 音高）
TUNING = {
    0: ("吉他", [40, 45, 50, 55, 59, 64]),
    2: ("烏克麗麗", [67, 60, 64, 69]),
    3: ("班卓琴", [67, 50, 55, 59, 62]),
    4: ("曼陀林", [55, 62, 69, 76]),
}

# 這幾個和弦是初學者最先學的，把位要簡單：不用封閉、按弦不超過 3 根
# F 與 C7 本來就需要封閉／第四根手指，不算「應該簡單」
SIMPLE = {(0, "maj"): "C G D A E", (0, "m"): "Am Em Dm", (0, "7"): "D7 E7 G7"}
SIMPLE_UKE = {(2, "maj"): "C F G A", (2, "m"): "Am Dm", (2, "7"): "C7 G7"}


def pcs(frets, base, high_first=False):
    """把「按格陣列」換成會響的音級集合。

    base 由低音弦排到高音弦；high_first=True 表示 frets 是「第 1 弦在前」
    （函式庫的慣例），課程用的和弦圖則是由低音弦排起。
    """
    out = set()
    n = len(frets)
    for i, f in enumerate(frets):
        if f is None or f < 0:
            continue
        midi = base[n - 1 - i] + f if high_first else base[i] + f
        out.add(midi % 12)
    return out


def name_pcs(name: str):
    m = re.match(r"^([A-G][#♯b♭]?)", name)
    if not m:
        return None, None
    root = ROOT_PC.get(m.group(1))
    qual = name[m.end():]
    qual = qual.replace("（三指）", "").replace("（半封閉）", "").strip()
    qual = {"": "maj", "m": "m", "7": "7", "maj7": "maj7", "m7": "m7", "6": "6",
            "m6": "m6", "dim": "dim", "dim7": "dim7", "m7b5": "m7b5", "sus2": "sus2",
            "sus4": "sus4", "add9": "add9", "aug": "aug", "9": "9"}.get(qual, qual)
    return root, qual


def check(where, name, frets, base, problems, high_first=False):
    root, qual = name_pcs(name)
    if root is None or qual not in QUAL:
        return
    sounds = pcs(frets, base, high_first)
    want = {(root + i) % 12 for i in QUAL[qual]}
    need = {(root + i) % 12 for i in ESSENTIAL[qual]}
    extra = sounds - want
    missing = need - sounds
    if extra:
        problems.append(f"{where} {name}: 出現和弦外的音 "
                        f"{sorted(NOTE[p] for p in extra)}（按格 {frets}）")
    if missing:
        problems.append(f"{where} {name}: 少了必備音 "
                        f"{sorted(NOTE[p] for p in missing)}（按格 {frets}）")


def check_library(problems) -> int:
    src = LIB.read_text(encoding="utf-8")
    lib = json.loads(src[src.find("{"): src.rfind("}") + 1])
    n = 0
    for inst_s, by_tuning in lib.items():
        inst = int(inst_s)
        if inst not in TUNING:
            continue
        base = TUNING[inst][1]
        for _tuning, table in by_tuning.items():
            for key, entry in table.items():
                root_s, qual = key.split(":")
                name = NOTE[int(root_s)] + ("" if qual == "maj" else qual)
                check(f"[函式庫 {TUNING[inst][0]}]", name, entry["frets"], base, problems, high_first=True)
                n += 1
    return n


def check_guitar_course(problems) -> int:
    import build_guitar_figures as g
    base = TUNING[0][1]
    n = 0
    for name, (frets, _fingers) in g.CHORDS.items():
        if "/" in name:
            name = name.split("/")[0]
        check("[吉他課程]", name, frets, base, problems)
        n += 1
    return n


def check_ukulele_course(problems) -> int:
    import make_ukulele_diagrams as u
    base = TUNING[2][1]
    n = 0
    for _key, (_title, _sub, chords, _note) in u.CHORD_BLOCKS.items():
        for name, frets, _desc in chords:
            check("[烏克麗麗課程]", name, frets, base, problems)
            n += 1
    return n


def check_markdown(problems) -> int:
    """和弦指法表裡的「發音」欄必須跟「按格」對得起來。"""
    n = 0
    headers = {"guitar": ("吉他", TUNING[0][1], ["E4", "B3", "G3", "D3", "A2", "E2"]),
               "ukulele": ("烏克麗麗", TUNING[2][1], ["A4", "E4", "C4", "g4"])}
    for fname_en, (fname, base, strings) in headers.items():
        path = BASE / "content" / "chord" / f"{fname_en}.md"
        if not path.exists():
            continue
        cur = None
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^### (.+?)（", line)
            if m:
                cur = m.group(1)
                continue
            if not line.startswith("| 第") or cur is None:
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4:
                continue
            idx = int(re.search(r"第(\d)弦", cells[0]).group(1)) - 1
            sound = cells[3]
            frets = re.search(r"第(\d+)格", cells[1])
            n += 1
            if "空弦" in cells[1]:
                pc = base[len(base) - 1 - idx] % 12 if True else None
            elif frets:
                pc = (base[len(base) - 1 - idx] + int(frets.group(1))) % 12
            else:
                continue
            written = ROOT_PC.get(sound.strip().replace("♭", "♭"))
            if written is None:
                written = ROOT_PC.get(sound.strip())
            if written != pc:
                problems.append(f"[指法表 {fname}] {cur} 第{idx + 1}弦："
                                f"寫「{sound}」但按格算出來是 {NOTE[pc]}")
    return n


def check_simple(problems) -> None:
    """初學和弦優先給簡單把位：按弦 ≤3 根、不是封閉。"""
    src = LIB.read_text(encoding="utf-8")
    lib = json.loads(src[src.find("{"): src.rfind("}") + 1])
    for inst, table in ((0, SIMPLE), (2, SIMPLE_UKE)):
        data = next(iter(lib[str(inst)].values()))
        for (i, qual), names in table.items():
            for name in names.split():
                root, q = name_pcs(name)
                entry = data.get(f"{root}:{q}")
                if not entry:
                    continue
                pressed = [f for f in entry["frets"] if f > 0]
                if len(pressed) > 3 or entry.get("barre"):
                    problems.append(f"[簡單把位 {TUNING[inst][0]}] {name} 拿到 "
                                    f"{entry['frets']}（按 {len(pressed)} 根、"
                                    f"封閉 {bool(entry.get('barre'))}）")


def main() -> int:
    problems: list[str] = []
    n_lib = check_library(problems)
    n_g = check_guitar_course(problems)
    n_u = check_ukulele_course(problems)
    n_md = check_markdown(problems)
    check_simple(problems)
    print(f"檢查：函式庫 {n_lib} 條、吉他課程 {n_g} 條、烏克麗麗課程 {n_u} 條、"
          f"指法表 {n_md} 列")
    if problems:
        print(f"發現 {len(problems)} 個問題：")
        for p in problems[:60]:
            print("  ✗", p)
        return 1
    print("全部正確")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
