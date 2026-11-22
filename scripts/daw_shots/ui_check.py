"""介面巡檢：把 DAW 的每個面板、對話框、每一種效果器都開一次，收集 JS 錯誤。

做法
----
daw-studio/_shot.js 是最後會把 `__errors` POST 回伺服器；本腳本開一個小伺服器
（順便壓住那張「慢速圖」讓 Chrome 不要提早結束），收到 POST 之後再關掉 Chrome。
這樣不必猜載入時機，也不會漏掉後面才發生的錯誤。

用法
----
    python scripts/daw_shots/ui_check.py            # 全部走一遍（約 40 秒）
    python scripts/daw_shots/ui_check.py featuretest # 換一個 harness 動作
"""
import functools
import http.server
import json
import pathlib
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8793
GIF = bytes.fromhex(
    "47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b"
)

DONE = threading.Event()
PAYLOAD = {}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE), **kw)

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/__SLOW__"):
            DONE.wait(240)
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(GIF)))
            self.end_headers()
            try:
                self.wfile.write(GIF)
            except Exception:
                pass
            return
        return super().do_GET()

    def do_POST(self):  # noqa: N802
        ln = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(ln) if ln else b"{}"
        try:
            PAYLOAD.update(json.loads(body))
        except Exception:
            PAYLOAD["_raw"] = body.decode("utf-8", "replace")
        DONE.set()
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


def main():
    act = sys.argv[1] if len(sys.argv) > 1 else "tour"
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="daw-uicheck-")
    url = f"http://127.0.0.1:{PORT}/daw-studio/_shot.html?demo=1&do={act}"
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--mute-audio",
         "--autoplay-policy=no-user-gesture-required", f"--user-data-dir={profile}", url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        DONE.wait(240)
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except Exception:
            proc.kill()
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)

    errs = (PAYLOAD.get("__errors") or [[]])[0]
    shot = (PAYLOAD.get("__shotErr") or [[""]])[0][0] if PAYLOAD.get("__shotErr") else ""
    if not PAYLOAD:
        print("沒有收到巡檢結果（頁面沒有跑完？）")
        return 2
    print(f"巡檢：{shot or '—'}")
    if not errs:
        print("沒有任何錯誤")
        return 0
    print(f"共 {len(errs)} 個錯誤：")
    for e in errs:
        print("  " + str(e))
    return 1


if __name__ == "__main__":
    sys.exit(main())
