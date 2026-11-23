"""從 MeloTTS（sherpa-onnx vits-melo-tts-zh_en）的 lexicon 抽出「拼音音節 → 音素」對照表，
寫成網站用的 assets/tts/zh-syllables.json。

為什麼要這張表
--------------
MeloTTS 的輸入是音素序列（zh、ong…）加上每個音素的聲調，不是漢字也不是整音節。
音節→音素的拆法就藏在這顆模型的 lexicon.txt 裡（中 → zh ong），抽出來之後瀏覽器端只要
用 pinyin-pro 拿到「zhong4」，就能查表變成 token id，不需要把 6.5 MB 的 lexicon 帶進網站。

需要本機有模型包（不是 repo 的一部分）：
    work/models/tts/vits-melo-tts-zh_en/{tokens.txt,lexicon.txt}
（`python scripts/upload_ai_model.py` 下載的那個 tar.bz2 解開就有）

用法：
    python scripts/build_tts_assets.py
"""
from __future__ import annotations

import json
import pathlib
import re
from collections import Counter

from pypinyin import Style, pinyin

BASE = pathlib.Path(__file__).resolve().parent.parent
MODEL_DIR = BASE / "work" / "models" / "tts" / "vits-melo-tts-zh_en"
OUT = BASE / "assets" / "tts" / "zh-syllables.json"

INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g",
            "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"]
# 中文標點 → 模型認得的標點音素（MeloTTS 的寫法）
PUNC = {"，": ",", "。": ".", "！": "!", "？": "?", "、": ",", "；": ",", "：": ",",
        "…": "…", "—": "-", "「": ",", "」": ",", "（": ",", "）": ",",
        ",": ",", ".": ".", "!": "!", "?": "?", ";": ",", ":": ","}


def split_syllable(syl: str) -> list[str]:
    for ini in INITIALS:
        if syl.startswith(ini) and len(syl) > len(ini):
            return [ini, syl[len(ini):]]
    return [syl]


def main() -> int:
    tok_path, lex_path = MODEL_DIR / "tokens.txt", MODEL_DIR / "lexicon.txt"
    if not tok_path.exists():
        raise SystemExit(f"找不到 {tok_path}（先解開模型包）")

    tokens = {}
    for line in tok_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            sym, idx = line.rsplit(" ", 1)
            tokens[sym] = int(idx)

    # 單字讀音（每個漢字一組音素 + 聲調）
    votes: dict[str, Counter] = {}
    for line in lex_path.read_text(encoding="utf-8").splitlines():
        f = line.split(" ")
        if len(f) < 5 or len(f[0]) != 1 or not ("一" <= f[0] <= "鿿"):
            continue
        rest, n = f[1:], (len(f) - 1) // 2
        phones = tuple(rest[:n])
        py = pinyin(f[0], style=Style.NORMAL, heteronym=False, v_to_u=False, errors="ignore")
        if not py or not py[0]:
            continue
        votes.setdefault(py[0][0], Counter())[phones] += 1

    syllables, conflicts = {}, 0
    for syl, counter in sorted(votes.items()):
        phones, count = counter.most_common(1)[0]
        if len(counter) > 1:
            conflicts += 1
        if all(p in tokens for p in phones):
            syllables[syl] = list(phones)
        else:  # lexicon 裡拼法不認得，退回用初始音／韻母拼
            alt = split_syllable(syl)
            if all(p in tokens for p in alt):
                syllables[syl] = alt

    # 補上 lexicon 沒有的音節（用拆法兜底，讓每個音節都查得到）
    for ini in INITIALS:
        for fin in list(tokens):
            if fin in INITIALS:
                continue
            syl = ini + fin
            if syl not in syllables and all(p in tokens for p in (ini, fin)):
                syllables.setdefault(syl, [ini, fin])

    data = {
        "_comment": "MeloTTS zh（vits-melo-tts-zh_en）的拼音音節→音素表；由 scripts/build_tts_assets.py 產生",
        "sampleRate": 44100,
        "tokens": tokens,
        "syllables": syllables,
        "punc": PUNC,
        "special": {"2": ["EE", "er"], "嗯": ["en"]},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(syllables)} 個音節、{len(tokens)} 個音素、{conflicts} 個音節有多種拆法"
          f" → {OUT.relative_to(BASE)}（{OUT.stat().st_size/1024:.0f} KB）")
    missing = [s for s in ("zhong", "ni", "er", "lv", "yuan", "wu", "yi") if s not in syllables]
    if missing:
        print("！少了常見音節：", missing)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
