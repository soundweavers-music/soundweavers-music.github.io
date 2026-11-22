"""列出 work/daw-strings.json 裡還沒翻成英文的介面字串（唯讀，不呼叫 API）。

用法：python scripts/daw_i18n_missing.py [--write work/missing.json]
"""
import json
import pathlib
import re
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent
SRC = BASE / "work" / "daw-strings.json"
DICT = BASE / "daw-studio" / "js" / "i18n-dict.js"


def main():
    strings = json.loads(SRC.read_text(encoding="utf-8"))
    text = DICT.read_text(encoding="utf-8")
    keys = set(m.group(1) for m in re.finditer(r'^\s*"((?:[^"\\]|\\.)*)":', text, re.M))
    missing = [s for s in strings if s not in keys]
    if "--write" in sys.argv:
        out = BASE / "work" / "i18n-missing.json"
        out.write_text(json.dumps(missing, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(missing)} 條 → {out}")
        return 0
    print(f"{len(strings)} 條字串，缺少 {len(missing)} 條翻譯")
    for s in missing:
        print("  " + s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
