"""載入進度面板的檢查：慢速網路下開 DAW，看面板有沒有出現、進度有沒有在走、會不會超過 100%，
第二次開（同一個瀏覽器設定檔）是不是直接從這台電腦讀、不再下載。

用 Chrome DevTools Protocol（--remote-debugging-port）控制：限速、截圖、讀 window.__dawLoading。

    python scripts/daw_shots/loading_check.py
輸出 work/daw-shots/loading-*.png
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT, DBG = 8797, 9333
SHOTS = BASE / "work" / "daw-shots"
COUNT = {"sf2": 0}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE), **kw)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.split("?")[0].endswith(".sf2"):
            COUNT["sf2"] += 1
        return super().do_GET()


def cdp():
    import websocket   # websocket-client
    for _ in range(50):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json"))
            page = next(t for t in tabs if t["type"] == "page")
            return websocket.create_connection(page["webSocketDebuggerUrl"], timeout=60)
        except Exception:
            time.sleep(0.2)
    raise SystemExit("連不上 Chrome DevTools")


class Tab:
    def __init__(self, ws):
        self.ws, self.n = ws, 0

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n:
                return m.get("result", {})

    def js(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        return r.get("result", {}).get("value")

    def shot(self, name):
        import base64
        d = self.call("Page.captureScreenshot", format="png")["data"]
        (SHOTS / name).write_bytes(base64.b64decode(d))


def visit(profile, label, throttle):
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
                          f"--remote-debugging-port={DBG}", f"--user-data-dir={profile}", "--window-size=1400,900",
                          "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        tab = Tab(cdp())
        tab.call("Network.enable")
        if throttle:
            # 約 2 MB/s：13 MB 的鋼琴要 6～7 秒，看得到進度在走
            tab.call("Network.emulateNetworkConditions", offline=False, latency=40,
                     downloadThroughput=2_000_000, uploadThroughput=500_000)
        COUNT["sf2"] = 0
        tab.call("Page.navigate", url=f"http://127.0.0.1:{PORT}/daw-studio/index.html")
        samples, shot_done, t0 = [], False, time.time()
        while time.time() - t0 < 90:
            time.sleep(0.25)
            st = tab.js("JSON.stringify((window.__dawLoading && window.__dawLoading.list()) || null)")
            vis = tab.js("!!document.querySelector('#loadPanel.on')")
            jobs = json.loads(st) if st and st != "null" else []
            samples.append((round(time.time() - t0, 2), vis, jobs))
            running = [j for j in jobs if j["state"] == "run"]
            if running and not shot_done and any((j.get("frac") or 0) > 0.25 for j in running):
                tab.shot(f"loading-{label}.png")
                shot_done = True
            if samples and len(samples) > 8 and not running and jobs == [] and time.time() - t0 > 6:
                break
        return samples, COUNT["sf2"], shot_done
    finally:
        p.terminate()
        time.sleep(0.5)


def summarize(label, samples, nsf2, shot):
    print(f"\n== {label} ==  下載 .sf2 次數：{nsf2}，截圖：{'有' if shot else '沒有（太快或沒出現）'}")
    seen = {}
    over = []
    for t, vis, jobs in samples:
        for j in jobs:
            k = j["label"]
            seen.setdefault(k, []).append((t, j["state"], j.get("frac"), j["stepText"], j.get("detail")))
            if (j.get("frac") or 0) > 1.0001:
                over.append((k, t, j["frac"]))
    for k, rows in seen.items():
        fr = [r[2] for r in rows if r[2] is not None]
        steps = []
        for r in rows:
            if not steps or steps[-1] != r[3]:
                steps.append(r[3])
        print(f"  {k}: {' → '.join(steps)}；進度 {min(fr or [0]):.0%}–{max(fr or [0]):.0%}；最後 {rows[-1][1]} @{rows[-1][0]}s；"
              f"例：{next((r[4] for r in rows if r[4]), '')}")
    vis_any = any(v for _, v, _ in samples)
    print(f"  面板出現過：{vis_any}；超過 100%：{over or '沒有'}；最後面板還開著：{samples[-1][1] if samples else None}")
    return vis_any, over


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix="dawload")
    a = visit(prof, "first", True)
    v1, o1 = summarize("第一次開（慢速網路）", *a)
    b = visit(prof, "second", True)
    v2, o2 = summarize("第二次開（同一台電腦）", *b)
    srv.shutdown()
    ok = v1 and not o1 and b[1] == 0
    print("\n結果：", "OK" if ok else "有問題", f"（第二次下載 sf2 {b[1]} 次，應該是 0）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
