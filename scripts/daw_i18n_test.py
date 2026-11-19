#!/usr/bin/env python3
"""驗證 i18n.js 的翻譯規則：字典每一條鍵都要翻出來，RULES 每一條都要真的生效。

樣本由 i18n.js 自己提供（dictKeys()／ruleSamples()），所以在 i18n-dict.js 或
RULES 新增東西，這個測試就自動涵蓋——不會出現手寫清單跟字典分岔。

檢查兩件事：
  1. 字典：譯出來的結果要等於字典的值（比對時忽略結尾補的空格）
  2. 規則：帶了 sample 的規則，吃進 sample 之後輸出必須跟原文不同
     （代表規則真的有對到；只驗「有翻到」，不寫死英文，改譯法不會誤判）

用法：
  python scripts/daw_i18n_test.py
  python scripts/daw_i18n_test.py --chrome "C:/.../chrome.exe"
"""
from __future__ import annotations

import html as htmllib
import io
import json
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
PAGE = "/scripts/daw_i18n_test.html"
DICT = BASE / "daw-studio" / "js" / "i18n-dict.js"

CHROME_CANDIDATES = [
    __import__("os").environ.get("DAW_CHROME", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def find_chrome(override: str | None) -> str:
    for c in [override or ""] + CHROME_CANDIDATES:
        if c and Path(c).exists():
            return c
    raise SystemExit("找不到 Chrome，請用 --chrome 指定路徑（或設環境變數 DAW_CHROME）")


def load_dict() -> dict[str, str]:
    src = DICT.read_text(encoding="utf-8")
    return json.loads(src[src.find("{"): src.rfind("}") + 1])


def norm(s: str) -> str:
    # translateText 會在結尾的 : ；之後補一個空格，比對時兩邊都去掉
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    args = sys.argv[1:]
    chrome = None
    for i, a in enumerate(args):
        if a == "--chrome" and i + 1 < len(args):
            chrome = args[i + 1]
    exe = find_chrome(chrome)

    httpd = ThreadingHTTPServer(("127.0.0.1", 0),
                                lambda *a, **k: Quiet(*a, directory=str(BASE), **k))
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}{PAGE}"

    with tempfile.TemporaryDirectory() as profile:
        proc = subprocess.run(
            [exe, "--headless", "--disable-gpu", "--no-proxy-server",
             f"--user-data-dir={profile}", "--virtual-time-budget=20000",
             "--dump-dom", url], capture_output=True)
        html = proc.stdout.decode("utf-8", "replace")
    httpd.shutdown()

    m = re.search(r'<pre id="out">(.*?)</pre>', html, re.S)
    if not m:
        print("沒有收到結果：頁面載入失敗（先確認 http 伺服器與 i18n.js 正常）")
        return 1
    # --dump-dom 會把 <pre> 裡的 & < > 轉成 HTML 實體，先還原再解析
    data = json.loads(htmllib.unescape(m.group(1)))
    if "error" in data:
        print("頁面回報錯誤：", data["error"])
        return 1

    EN = load_dict()
    fails: list[str] = []

    for src, out in data["dict"]:
        want = EN.get(src)
        if want is None:
            fails.append(f"[字典] 找不到鍵：{src!r}")
        elif norm(out) != norm(want):
            fails.append(f"[字典] {src!r}\n        得到 {out!r}\n        應為 {want!r}")

    fired = 0
    for src, out in data["rules"]:
        if norm(out) == norm(src):
            fails.append(f"[規則] 沒有生效：{src!r}（規則的 sample 對不到自己？）")
        else:
            fired += 1

    print(f"字典 {len(data['dict'])} 條、規則樣本 {len(data['rules'])} 條"
          f"（生效 {fired}），失敗 {len(fails)} 條")
    for f in fails[:40]:
        print("  ✗", f)
    if fails:
        return 1
    print("全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
