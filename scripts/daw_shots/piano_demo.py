"""鋼琴試聽：把 daw-studio/_pianodemo.js 的樂句算成 wav（新舊版本 A/B 用）。

    python scripts/daw_shots/piano_demo.py [音色 id] [輸出檔] [repo 根目錄]
"""
import base64
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8795


def main():
    pid = sys.argv[1] if len(sys.argv) > 1 else "pno.grand"   # 或 sf=../assets/daw-bank/builtin-piano.sf2
    out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "work/piano/demo.wav")
    root = pathlib.Path(sys.argv[3] if len(sys.argv) > 3 else pathlib.Path(__file__).resolve().parent.parent.parent)
    done, res = threading.Event(), {}

    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

        def log_message(self, *a):
            pass

        def do_POST(self):
            res["d"] = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            self.send_response(204)
            self.end_headers()
            done.set()

    (root / "daw-studio" / "_pianodemo.html").write_text(
        '<!doctype html><meta charset="utf-8"><script type="module" src="_pianodemo.js"></script>', encoding="utf-8")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
                          f"--user-data-dir={tempfile.mkdtemp()}",
                          f"http://127.0.0.1:{PORT}/daw-studio/_pianodemo.html?" + (pid if pid.startswith("sf=") else f"id={pid}")],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(300)
    p.terminate()
    srv.shutdown()
    if not ok:
        raise SystemExit("沒有收到結果")
    d = json.loads(res["d"])
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(d["sr"])
        w.writeframes(base64.b64decode(d["pcm"]))
    print(out, '原始大小：', {k: round(v, 1) for k, v in d.get('raw', {}).items()})


if __name__ == "__main__":
    main()
