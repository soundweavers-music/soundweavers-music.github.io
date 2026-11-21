#!/usr/bin/env python3
"""把翻譯 agent 交回來的批次檔併回 content/en/_pages/。

agent 拿到的是一份整合過的 JSON（`work/batches/batch_NN_in.json`）：

    {"instruments__enanga": {"介紹": "", "聆聽示範": "", …}, …}

交回來的檔案形狀一樣，值填成英文。這裡只補「目前還是空」的欄位，
已經有英文的一律不動，所以重跑、分批跑都不會蓋掉別人的成果。

    python scripts/merge_page_batch.py work/batches/batch_11_out.json
"""
from __future__ import annotations

import json
import pathlib
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent
PAGES = BASE / "content" / "en" / "_pages"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    filled = pages = 0
    for path in map(pathlib.Path, sys.argv[1:]):
        data = json.loads(path.read_text(encoding="utf-8"))
        for key, table in data.items():
            target = PAGES / (key + ".json")
            if not target.exists():
                print("  ! 沒有這一頁：", key)
                continue
            cur = json.loads(target.read_text(encoding="utf-8"))
            changed = 0
            for zh, en in table.items():
                if zh in cur and not cur[zh] and isinstance(en, str) and en.strip():
                    cur[zh] = en.strip()
                    changed += 1
            if changed:
                target.write_text(
                    json.dumps(cur, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                    encoding="utf-8")
                filled += changed
                pages += 1
        print("  %s：併入 %d 頁" % (path.name, pages))
    print("合計補上 %d 條、%d 頁。" % (filled, pages))
    return 0


if __name__ == "__main__":
    sys.exit(main())
