"""效果器圖表總覽截圖：daw-studio/_fxgallery.html → work/daw-shots/raw/fx-gallery.png

把每一種效果器的視覺圖排成一頁，用來一次檢查「每個效果器都有圖、而且畫得對」。
"""
import functools
import http.server
import pathlib
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
out = BASE / "work" / "daw-shots" / "raw" / "fx-gallery.png"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8795
GIF = bytes.fromhex(
    "47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b"
)
READY = threading.Event()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE), **kw)

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/__SLOW__"):
            READY.wait(60)
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
    out.parent.mkdir(parents=True, exist_ok=True)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="daw-fxg-")
    try:
        proc = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--window-size=1600,1500", "--hide-scrollbars",
             f"--user-data-dir={profile}", f"--screenshot={out}",
             f"http://127.0.0.1:{PORT}/daw-studio/_fxgallery.html"],
            capture_output=True, text=True, timeout=120,
        )
    finally:
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    print(("✓ " if out.exists() else "✗ ") + str(out))
    return 0 if out.exists() else 1


if __name__ == "__main__":
    sys.exit(main())
