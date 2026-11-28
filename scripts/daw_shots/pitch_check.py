"""內建鋼琴每個鍵實際彈出來的音高（音分偏差），以及用的是哪個取樣。

    python scripts/daw_shots/pitch_check.py [sf2 相對於 daw-studio/ 的路徑]
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8799
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def run(sf):
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

    (BASE / "daw-studio" / "_pitchtest.html").write_text(
        '<!doctype html><meta charset="utf-8"><script type="module" src="_pitchtest.js"></script>', encoding="utf-8")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
                          f"--user-data-dir={tempfile.mkdtemp()}",
                          f"http://127.0.0.1:{PORT}/daw-studio/_pitchtest.html?sf={sf}"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(600)
    p.terminate()
    srv.shutdown()
    (BASE / "daw-studio" / "_pitchtest.html").unlink(missing_ok=True)
    if not ok:
        raise SystemExit("沒有收到結果")
    return json.loads(res["d"])


def pitch(x, sr, fe):
    """第 2～4 分音（考慮不諧和、取中位數）換算的基音；低音的基音本身很弱，量不準。"""
    N = 1 << 20
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)), N))
    hz = sr / N
    est = []
    for k in (2, 3, 4):
        lo, hi = int(k * fe * 0.94 / hz), int(k * fe * 1.06 / hz)
        i = lo + int(np.argmax(S[lo:hi]))
        est.append(i * hz / k)
    return float(np.median(est)), S, hz


def main():
    sf = sys.argv[1] if len(sys.argv) > 1 else "../assets/daw-bank/builtin-piano.sf2"
    d = run(sf)
    sr = d["sr"]
    rows = {}
    for s in d["segs"]:
        x = np.array(s["s"], float)
        fe = 440 * 2 ** ((s["k"] - 69) / 12)
        f, _, _ = pitch(x, sr, fe)
        cents = 1200 * np.log2(f / fe)
        rows.setdefault(s["k"], []).append((s["v"], cents, s["reg"]))
    bad = []
    for k in sorted(rows):
        name = f"{NAMES[k % 12]}{k // 12 - 1}"
        cs = [c for _, c, _ in rows[k]]
        regs = sorted({f"{r['sample']}(root {r['root']})" for _, _, r in rows[k] if r})
        flag = " <-- " if max(abs(c) for c in cs) > 15 else ""
        if flag:
            bad.append(name)
        print(f"{name:4s} midi {k}: " + " ".join(f"v{v}:{c:+5.0f}c" for v, c, _ in rows[k]) + f"  {', '.join(regs)}{flag}")
    print("\n偏差超過 15 音分的鍵：", bad or "無")


if __name__ == "__main__":
    main()
