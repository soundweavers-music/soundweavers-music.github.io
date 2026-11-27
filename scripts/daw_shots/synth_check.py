"""織音合成器的音色自動檢查。

把 daw-studio/_zytest.html 放進 http 伺服器，用無頭 Chrome 跑一遍，
每一個音色都離線算一次，量峰值、音量、音高、亮度、NaN，再把表格印出來。

用法
----
    python scripts/daw_shots/synth_check.py            # 全部
    python scripts/daw_shots/synth_check.py --json     # 原始資料（給其他腳本吃）
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8791

DONE = threading.Event()
RESULT = {"data": None}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE), **kw)

    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path == "/__RESULT__":
            n = int(self.headers.get("Content-Length") or 0)
            RESULT["data"] = self.rfile.read(n).decode("utf-8")
            self.send_response(204)
            self.end_headers()
            DONE.set()
        else:
            self.send_error(404)


def main():
    json_out = "--json" in sys.argv
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    profile = tempfile.mkdtemp(prefix="zychk")
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--mute-audio",
        "--autoplay-policy=no-user-gesture-required",
        "--no-first-run", "--no-default-browser-check",
        f"--user-data-dir={profile}",
        f"http://127.0.0.1:{PORT}/daw-studio/_zytest.html",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = DONE.wait(timeout=900)
    proc.terminate()
    srv.shutdown()
    if not ok or not RESULT["data"]:
        print("沒有收到結果：Chrome 沒跑起來或頁面出錯（開 daw-studio/_zytest.html 看 console）")
        return 1

    data = json.loads(RESULT["data"])
    rows = data["results"]
    if json_out:
        # 給其他腳本吃的原始資料；ASCII 轉義，避免 Windows 主控台編碼問題
        out = BASE / "work" / "zytest.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, ensure_ascii=True), encoding="utf-8")
        print(f"wrote {out}")
        return 0

    print(f"{len(rows)} patches, {data['ms'] / 1000:.1f}s\n")
    lv = data.get("live")
    if lv and "error" not in lv:
        print("live playback: ctx %s, track meter %.3f / %.3f, master %.3f\n"
              % (lv.get("state"), lv["meter"][0], lv["meter"][1], max(lv["master"])))
        if lv.get("kb"):
            print("virtual piano (startVoice): held %.3f, 1.5s after release %.3f\n" % (lv["kb"]["held"], lv["kb"]["after"]))
    elif lv:
        print("live playback FAILED:", lv["error"])
    if data.get("project"):
        print("export path:", json.dumps(data["project"], ensure_ascii=True) + "\n")
    if data.get("errors"):
        print("-- worklet errors --")
        for e in data["errors"]:
            print("  " + e)
        print()
    import math
    bad = []
    for r in rows:
        if r.get("error"):
            bad.append(f"{r['id']:22s} ERROR {r['error']}")
            continue
        flags = []
        if r["bad"]:
            flags.append(f"NaN x{r['bad']}")
        if r["peak"] > -0.2:
            flags.append("clipping")
        if r["peak"] < -40:
            flags.append("too quiet")
        if r.get("all", r["a"]) < -50 and not r["drum"]:
            flags.append("silent")
        if r["tail"] > -45 and r["tail"] > r["b"] + 3:
            flags.append("tail never decays")
        if not r["drum"] and r["f"] and r["cat"] != "效果":
            # 低八度／高八度是刻意的（副振盪、泛音層），只抓「不是八度」的走音
            cents = 1200 * math.log2(r["f"] / 261.63)
            rem = cents - 1200 * round(cents / 1200)
            if abs(rem) > 60:
                flags.append(f"pitch {r['f']:.1f}Hz ({cents:+.0f} cents)")
        if abs(r["dc"]) > 0.02:
            flags.append("DC offset")
        if flags:
            bad.append(f"{r['id']:22s} {', '.join(flags)}")

    # 同類音色如果長得太像，代表「幾百種」其實是同一種。
    # 比較的是「相對於自己平均音量的頻譜形狀」，才不會被整體音量影響。
    def shape(r):
        b = r["bands"]
        m = sum(b) / len(b)
        return [x - m for x in b]

    def dist(a, b):
        sa, sb = shape(a), shape(b)
        # 頻譜形狀（dB）＋ 衰減長度（1 秒差 ≈ 1.5 dB），才不會把「一樣亮但一長一短」當成同一個
        return sum(abs(x - y) for x, y in zip(sa, sb)) / len(sa) + 1.5 * abs(a.get("dec", 0) - b.get("dec", 0))

    similar = []
    for i, a in enumerate(rows):
        for b in rows[i + 1:]:
            if a.get("bands") and b.get("bands") and a["cat"] == b["cat"]:
                d = dist(a, b)
                if d < 2.5:
                    similar.append((d, f"{a['id']} ~ {b['id']} (avg {d:.2f} dB apart)"))
    similar.sort()

    print("-- problems --")
    print("\n".join(bad) if bad else "(none)")
    print(f"\n-- near-identical pairs in a category ({len(similar)}) --")
    print("\n".join(s[1] for s in similar[:30]) if similar else "(none)")

    print("\n-- every patch --")
    print(f"{'id':22s}{'peak':>7s}{'attack':>7s}{'mid':>7s}{'tail':>7s}{'pitch':>8s}{'centroid':>9s}")
    for r in rows:
        if r.get("error"):
            continue
        print(f"{r['id']:22s}{r['peak']:7.1f}{r['a']:7.1f}{r['b']:7.1f}{r['tail']:7.1f}"
              f"{r['f']:8.1f}{r['cen']:7.0f}")
    return 0 if not bad else 0


if __name__ == "__main__":
    sys.exit(main())
