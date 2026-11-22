"""效果器數學驗證：用無頭 Chrome 跑 daw-studio/_fxtest.html，把每一項檢查印出來。

為什麼要這樣跑
--------------
效果器一半以上是 Web Audio 節點（BiquadFilter、Convolver、AudioWorklet…），
只有真的在瀏覽器裡算一次離線算圖，才知道參數與數學式子對不對。
_fxtest.html 裡每一項都是「送一個已知訊號進去 → 量輸出」；
本腳本起一個小伺服器、用 --dump-dom 把結果抓回來解析。

用法
----
    python scripts/daw_shots/fx_check.py
"""
import functools
import html
import http.server
import pathlib
import re
import socketserver
import subprocess
import sys
import threading

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8791
PAGE = "/daw-studio/_fxtest.html"

READY = threading.Event()
GIF = bytes.fromhex(
    "47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b"
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE), **kw)

    def do_GET(self):  # noqa: N802
        if self.path == "/__SLOW__":
            READY.wait(180)
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(GIF)))
            self.end_headers()
            self.wfile.write(GIF)
            return
        if self.path == "/__READY__":
            READY.set()
            self.send_response(204)
            self.end_headers()
            return
        return super().do_GET()

    def log_message(self, *args):
        pass


def main():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        proc = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--mute-audio",
             "--dump-dom", f"http://127.0.0.1:{PORT}{PAGE}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240,
        )
    finally:
        srv.shutdown()

    dom = proc.stdout or ""
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    if not m:
        print("找不到測試輸出，Chrome 的 stderr：")
        print(proc.stderr[-3000:])
        return 2
    body = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    print(body)
    fails = len(re.findall(r"^FAIL", body, re.M))
    print()
    print(f"失敗 {fails} 項" if fails else "全部通過")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
