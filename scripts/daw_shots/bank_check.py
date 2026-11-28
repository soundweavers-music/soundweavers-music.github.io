"""內建鋼琴 sf2 的檢查：力度曲線（層與層之間不能跳）、每個鍵都有聲音、尾音長度。

    python scripts/daw_shots/bank_check.py [sf2 相對於 daw-studio/ 的路徑]
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8796


def main():
    sf = sys.argv[1] if len(sys.argv) > 1 else "../assets/daw-bank/builtin-piano.sf2"
    done, res = threading.Event(), {}

    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(BASE), **kw)

        def log_message(self, *a):
            pass

        def do_POST(self):
            res["d"] = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            self.send_response(204)
            self.end_headers()
            done.set()

    (BASE / "daw-studio" / "_banktest.html").write_text(
        '<!doctype html><meta charset="utf-8"><script type="module" src="_banktest.js"></script>', encoding="utf-8")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
                          f"--user-data-dir={tempfile.mkdtemp()}",
                          f"http://127.0.0.1:{PORT}/daw-studio/_banktest.html?sf={sf}"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(900)
    p.terminate()
    srv.shutdown()
    if not ok:
        raise SystemExit("沒有收到結果")
    r = json.loads(res["d"])
    print(f"{r['bytes'] / 1e6:.1f} MB、{r['samples']} 個取樣")
    print("沒聲音的鍵：", r["silent"] or "無")
    print("尾音（掉到 -40 dB 的秒數）：", r["tails"])
    worst = 0
    for key, pts in r["curve"].items():
        jumps = [(pts[i][0], round(pts[i][1] - pts[i - 1][1], 1)) for i in range(1, len(pts))]
        down = [j for j in jumps if j[1] < -0.5]          # 力度變大、聲音反而變小
        big = max(jumps, key=lambda j: abs(j[1]))
        worst = max(worst, abs(big[1]))
        print(f"  key {key}: v4 {pts[0][1]} dB → v127 {pts[-1][1]} dB，最大跳動 {big[1]:+} dB @v{big[0]}"
              + (f"，變小的地方 {down}" if down else ""))
    print(f"層與層之間最大跳動 {worst:.1f} dB（每 4 個力度一格；> 3 dB 聽得出來）")


if __name__ == "__main__":
    main()
