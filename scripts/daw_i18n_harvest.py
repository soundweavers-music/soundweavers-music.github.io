#!/usr/bin/env python3
"""執行期盤點 DAW 介面字串（給 daw_i18n_extract.py 併進字典來源）。

靜態掃描（HTML/JS 的字串）抓不到「執行期才組出來的」文案：樣板字串、編號＋
名稱、拆在 <b> 之間的一句話。這支腳本開一個本機 HTTP 伺服器，用 headless
Chrome 載入 scripts/daw_i18n_harvest.html，讓它把整個介面點過一遍（選單、
對話框、智慧編曲三個分頁、每一條軌道），收集還看得到的中文，寫進
work/harvest-strings.json。

用法：
  python scripts/daw_i18n_harvest.py                     # 示範專案
  python scripts/daw_i18n_harvest.py --src /daw-studio/index.html
  python scripts/daw_i18n_harvest.py --chrome "C:/.../chrome.exe"

之後跑：
  python scripts/daw_i18n_extract.py       # 靜態 + 這份盤點 → work/daw-strings.json
  python scripts/daw_i18n_translate.py     # 只翻新的（有 cache）
"""
from __future__ import annotations

import html as htmllib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "work" / "harvest-strings.json"
PAGE = "/scripts/daw_i18n_harvest.html"

CHROME_CANDIDATES = [
    os.environ.get("DAW_CHROME", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):  # 不要洗版
        pass


def chrome() -> str:
    for c in CHROME_CANDIDATES:
        if c and Path(c).exists():
            return c
    raise SystemExit("找不到 Chrome，請用 --chrome 指定路徑（或設環境變數 DAW_CHROME）")


def main() -> int:
    src = "/daw-studio/index.html?demo=1"
    exe = None
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--src" and i + 1 < len(args):
            src = args[i + 1]
        if a == "--chrome" and i + 1 < len(args):
            exe = args[i + 1]
    exe = exe or chrome()

    httpd = ThreadingHTTPServer(("127.0.0.1", 0),
                                lambda *a, **k: Quiet(*a, directory=str(BASE), **k))
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}{PAGE}?src={urllib.parse.quote(src, safe='')}"
    print(f"開啟 {url}")

    with tempfile.TemporaryDirectory() as profile:
        proc = subprocess.run(
            [exe, "--headless", "--disable-gpu", "--no-proxy-server",
             f"--user-data-dir={profile}", "--window-size=1500,900",
             "--virtual-time-budget=100000", "--dump-dom", url],
            capture_output=True)
        html = proc.stdout.decode("utf-8", "replace")
    httpd.shutdown()

    m = re.search(r'<pre id="harvest">(.*?)</pre>', html, re.S)
    if not m:
        raise SystemExit("沒有收到結果：頁面可能載入失敗（先確認 /daw-studio/ 可以在本機開）")
    # --dump-dom 會把 & < > 轉成 HTML 實體（例如 R&amp;B），先還原
    found = {htmllib.unescape(s) for s in json.loads(m.group(1))}

    old = set(json.loads(OUT.read_text(encoding="utf-8"))) if OUT.exists() else set()
    new = sorted(found - old)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(sorted(old | found), ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"盤點 {len(found)} 條，其中 {len(new)} 條是新的 → {OUT.relative_to(BASE)}")
    for s in new:
        print("  ", s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
