"""配音剪輯的數學驗證：把 dubbing-studio/_selftest.html 複製進建置產物，用無頭 Chrome 跑。

流程
----
1. 先建置（python scripts/build_static_site.py），確保 outputs/ 裡有 /tools/dubbing/。
2. 把 _selftest.html 複製到 outputs/.../tools/dubbing/。
3. 起一個伺服器服務 outputs/，用 --dump-dom 讀 <pre id="out"> 的結果。

用法
----
    python scripts/daw_shots/dub_check.py
"""
import functools
import html
import http.server
import pathlib
import re
import shutil
import socketserver
import subprocess
import sys
import threading

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = BASE / "outputs" / "world-instruments-static"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8797
GIF = bytes.fromhex(
    "47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b"
)
READY = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(OUT), **kw)

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/__SLOW__"):
            READY.wait(240)
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
    page = OUT / "tools" / "dubbing" / "index.html"
    if not page.exists():
        print("找不到建置產物，先跑 python scripts/build_static_site.py")
        return 2
    test_page = OUT / "tools" / "dubbing" / "_selftest.html"
    shutil.copy2(BASE / "dubbing-studio" / "_selftest.html", test_page)

    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        proc = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--mute-audio",
             # 假麥克風：讓「瀏覽器錄音」那幾項真的跑得起來（不必有裝置、不會跳權限視窗）
             "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
             "--autoplay-policy=no-user-gesture-required",
             "--dump-dom", f"http://127.0.0.1:{PORT}/tools/dubbing/_selftest.html"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240,
        )
    finally:
        srv.shutdown()
        # 測試頁只是本機用的，不要留在建置產物裡（audit_links 會把它當成壞連結）
        try:
            test_page.unlink()
        except OSError:
            pass

    dom = proc.stdout or ""
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    if not m:
        print("找不到測試輸出，Chrome 的 stderr：")
        print((proc.stderr or "")[-2000:])
        return 2
    body = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    print(body)
    fails = len(re.findall(r"^FAIL", body, re.M))
    print()
    print(f"失敗 {fails} 項" if fails else "全部通過")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
