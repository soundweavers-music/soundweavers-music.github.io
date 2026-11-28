"""平台鋼琴對照 Steinway D 文獻量測值的檢查。

用無頭 Chrome 跑 daw-studio/_pianotest.html，把每個音 × 力度的樣本傳回來，
量出跟文獻可以直接比的數字，逐項印「目標範圍」與「實測」：

  B        不諧和係數：用偵測到的分音頻率擬合 f_k = k·f0·√(1+B·k²)
           目標：Conklin 1996（Steinway D）——C4 ≈ 3～5e-4、C2 ≈ 1～2e-4、C6 ≈ 2～5e-3
  t60      基音那一帶的衰減：前 0.5 秒（快段）與 3 秒後（慢段）的斜率換成 t60
           目標：Askenfelt & Jansson；Bank 2000——C4 快 1.5～4 s、慢 12～30 s；
                 雙段衰減＝慢段至少是快段的 3 倍
  亮度     ff 的第 2～5 分音（相對基音）比 pp 強多少 dB（Askenfelt & Jansson 1991；Hall 1987）
           目標：C2～C5 ≥ 12 dB、其他 ≥ 8 dB
  第 8 分音 擊弦點 1/8 → 第 8 分音比第 7、9 分音弱（梳狀凹口）
  制音器   放開後 0.5 秒的音量比放開前掉多少 dB；目標 ≥ 30 dB（A6 以下）

用法
----
    python scripts/daw_shots/piano_check.py                  # pno.grand
    python scripts/daw_shots/piano_check.py pno.upright
輸出 work/piano/<id>-<音>-<力度>.wav（可以直接聽）
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

import numpy as np

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8793
DONE = threading.Event()
RESULT = {}

# 文獻目標（midi: (B 下限, B 上限, 快段 t60 範圍, 慢段 t60 範圍)）
TARGET = {
    24: ((1.2e-4, 4e-4), (4, 14), (20, 70)),
    36: ((0.8e-4, 2.2e-4), (3, 10), (15, 50)),
    48: ((1.4e-4, 3.2e-4), (2.5, 7), (12, 40)),
    60: ((3.0e-4, 5.0e-4), (1.5, 4.5), (10, 30)),
    72: ((0.8e-3, 1.6e-3), (0.9, 3), (5, 16)),
    84: ((2.5e-3, 5.5e-3), (0.5, 1.6), (2, 8)),
}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE), **kw)

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        RESULT["data"] = self.rfile.read(n).decode("utf-8")
        self.send_response(204)
        self.end_headers()
        DONE.set()


def run(pid):
    (BASE / "daw-studio" / "_pianotest.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>piano</title><script type="module" src="_pianotest.js"></script>',
        encoding="utf-8")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prof = tempfile.mkdtemp(prefix="pno")
    proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
                             f"--user-data-dir={prof}",
                             f"http://127.0.0.1:{PORT}/daw-studio/_pianotest.html?id={pid}&dur=12&hold=10"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = DONE.wait(600)
    proc.terminate()
    srv.shutdown()
    if not ok:
        raise SystemExit("沒有收到結果（開 daw-studio/_pianotest.html 看 console）")
    return json.loads(RESULT["data"])


def partials(x, sr, f0, t0=0.05, span=1.0, nmax=40):
    """在 [t0, t0+span] 找每個分音的實際頻率與振幅（拋物線內插峰值）。"""
    seg = x[int(t0 * sr): int((t0 + span) * sr)]
    N = 1 << int(np.ceil(np.log2(len(seg) * 4)))
    win = np.hanning(len(seg))
    S = np.abs(np.fft.rfft(seg * win, N))
    hz = sr / N
    out = []
    Bguess = 3e-4
    for k in range(1, nmax + 1):
        fe = k * f0 * np.sqrt(1 + Bguess * k * k)
        if fe > sr * 0.4:
            break
        lo, hi = int(fe * (1 - 0.035) / hz), int(fe * (1 + 0.035) / hz) + 1
        if hi <= lo + 2:
            continue
        i = lo + int(np.argmax(S[lo:hi]))
        a, b, c = S[i - 1], S[i], S[i + 1]
        d = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
        f = (i + d) * hz
        out.append((k, f, b))
        if len(out) >= 4:   # 用目前的點更新 B 的猜測，追得到高分音
            ks = np.array([o[0] for o in out], float)
            fs = np.array([o[1] for o in out], float)
            y = (fs / (ks * f0)) ** 2 - 1
            Bguess = max(1e-5, float(np.sum(y * ks ** 2) / np.sum(ks ** 4)))
    return out


def fitB(ps, f0):
    """最小平方擬合 (f_k / k)² = f0'² (1 + B k²)，f0' 一起擬合（真的基頻會偏一點）。"""
    if len(ps) < 5:
        return float("nan")
    ks = np.array([p[0] for p in ps], float)
    fs = np.array([p[1] for p in ps], float)
    amp = np.array([p[2] for p in ps], float)
    keep = amp > amp.max() * 1e-3
    ks, fs = ks[keep], fs[keep]
    A = np.vstack([np.ones_like(ks), ks ** 2]).T
    c, *_ = np.linalg.lstsq(A, (fs / ks) ** 2, rcond=None)
    return float(c[1] / c[0])


def band_env(x, sr, f, B=3e-4, nk=6, bw=0.04, hop=0.02):
    """前 nk 個分音（各 ±4%）的能量總和包絡（dB）。
    只看基音會被三根弦的拍音干擾（一下大一下小），斜率量不準；加總幾個分音就平均掉了。"""
    n = int(0.1 * sr)
    h = int(hop * sr)
    win = np.hanning(n)
    hz = sr / n
    out = []
    for s in range(0, len(x) - n, h):
        S = np.abs(np.fft.rfft(x[s:s + n] * win)) ** 2
        e = 0.0
        for k in range(1, nk + 1):
            fk = k * f * np.sqrt(1 + B * k * k)
            if fk > sr * 0.4:
                break
            lo, hi = int(fk * (1 - bw) / hz), int(fk * (1 + bw) / hz) + 2
            e += np.sum(S[lo:hi])
        out.append(10 * np.log10(e + 1e-24))
    return np.array(out), hop


def t60_from(env, hop, a, b):
    i0, i1 = int(a / hop), int(b / hop)
    seg = env[i0:i1]
    if len(seg) < 4:
        return float("nan")
    t = np.arange(len(seg)) * hop
    slope = np.polyfit(t, seg, 1)[0]     # dB / s
    return float(-60 / slope) if slope < -1e-3 else float("inf")


def centroid_ratio(x, sr, f0):
    seg = x[int(0.01 * sr): int(0.25 * sr)]
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    hz = sr / len(seg)
    fr = np.arange(len(S)) * hz
    m = fr > f0 * 0.5
    return float(np.sum(S[m] * fr[m]) / (np.sum(S[m]) + 1e-20) / f0)


def upper_level(x, sr, f0, B, ks=(2, 3, 4, 5)):
    """第 2～5 分音相對於基音的平均 dB（Askenfelt & Jansson 用的「頻譜斜率」量法）。"""
    seg = x[int(0.01 * sr): int(0.2 * sr)]
    N = 65536
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), N))
    hz = sr / N
    def pk(f):
        i = int(f / hz)
        w = max(3, int(f * 0.01 / hz))
        return 20 * np.log10(S[max(0, i - w): i + w].max() + 1e-12)
    a0 = pk(f0 * np.sqrt(1 + B))
    return float(np.mean([pk(k * f0 * np.sqrt(1 + B * k * k)) - a0 for k in ks]))


def save_wav(path, x, sr):
    y = np.clip(x / max(1e-9, np.max(np.abs(x))) * 0.8, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((y * 32767).astype("<i2").tobytes())


def ok(v, lo, hi):
    return "OK " if lo <= v <= hi else "-- "


def main():
    pid = sys.argv[1] if len(sys.argv) > 1 else "pno.grand"
    data = run(pid)
    sr, hold = data["sr"], data["hold"]
    if data.get("errors"):
        print("worklet errors:", *data["errors"], sep="\n  ")
    outdir = BASE / "work" / "piano"
    outdir.mkdir(parents=True, exist_ok=True)
    rows = {}
    for it in data["items"]:
        x = np.frombuffer(base64.b64decode(it["pcm"]), dtype="<i2").astype(float) / 32767
        rows[(it["n"], it["v"])] = x
        save_wav(outdir / f"{pid}-{it['n']}-{it['v']}.wav", x, sr)

    drows = {it["n"]: np.frombuffer(base64.b64decode(it["pcm"]), dtype="<i2").astype(float) / 32767 for it in data.get("damp", [])}
    notes = sorted({k[0] for k in rows})
    vels = sorted({k[1] for k in rows})
    vm = vels[len(vels) // 2]
    fails = 0
    print(f"{pid}: 對照 Steinway D 文獻值（{len(rows)} 個音，wav 在 work/piano/）\n")
    print(f"{'音':>4} {'B 實測':>9} {'目標':>17}  {'快段t60':>7} {'目標':>9}  {'慢段t60':>7} {'目標':>9}  {'ff 比 pp 亮(dB)':>12}  {'第8分音凹口':>9}  {'制音器':>7}")
    for n in notes:
        if n not in TARGET:
            continue   # C7 以上：基音下面只剩 3～4 個分音，B 與衰減都量不準，文獻也沒有可比的細表
        f0 = 440 * 2 ** ((n - 69) / 12)
        x = rows[(n, vm)]
        ps = partials(x, sr, f0, span=1.0 if n < 72 else 0.4)
        B = fitB(ps, f0)
        env, hop = band_env(x, sr, f0, B if B == B else 3e-4)
        # 快段／慢段的量測窗依音區調整（高音整體很短）
        fa, fb = (0.08, 0.6) if n < 72 else (0.05, 0.3) if n < 90 else (0.03, 0.25)
        sa, sb = (2.5, hold - 0.2) if n < 84 else (1.0, 3.0) if n < 90 else (0.6, 2.4)
        tf = t60_from(env, hop, fa, fb)
        ts = t60_from(env, hop, sa, sb)
        # 力度→音色：ff 的第 2～5 分音比 pp 強多少 dB（文獻：中音區約 15～25 dB、高音區略少）
        Bv = B if B == B else 3e-4
        bright = upper_level(rows[(n, vels[-1])], sr, f0, Bv) - upper_level(rows[(n, vels[0])], sr, f0, Bv)
        amps = {p[0]: p[2] for p in ps}
        dip = (20 * np.log10(amps.get(8, 0) + 1e-12) - 10 * np.log10((amps.get(7, 1e-12) * amps.get(9, 1e-12)) + 1e-24)) if 9 in amps else float("nan")
        # 制音器：按 1.5 秒放開的那一次，比「放開前」與「放開後 0.5 秒」
        de, _ = band_env(drows[n], sr, f0, B if B == B else 3e-4) if n in drows else (env, hop)
        i_rel, i_aft = int(1.4 / hop), int(2.0 / hop)
        damp = min(80.0, de[i_rel] - de[min(i_aft, len(de) - 1)])   # 掉到數位靜音就記 80 dB
        T = TARGET.get(n)
        line = f"{n:4d} {B:9.2e} "
        if T:
            (b0, b1), (f_lo, f_hi), (s_lo, s_hi) = T
            line += f"{ok(B, b0, b1)}{b0:.1e}–{b1:.1e}  {tf:7.2f} {ok(tf, f_lo, f_hi)}{f_lo:g}–{f_hi:g}  {ts:7.1f} {ok(ts, s_lo, s_hi)}{s_lo:g}–{s_hi:g}"
            fails += sum(not (lo <= v <= hi) for v, lo, hi in [(B, b0, b1), (tf, f_lo, f_hi), (ts, s_lo, s_hi)])
        bt = 12 if 36 <= n <= 72 else 8
        line += f"  {bright:9.1f} {ok(bright, bt, 40)}"
        # 擊弦點 1/8 只用在低音到中音（C5 以上擊弦點往琴橋移，凹口跑到更高的分音）
        if n <= 60:
            line += f"  {dip:7.1f}dB {ok(dip, -99, -3)}"
            fails += not (dip <= -3)
        else:
            line += f"  {'—':>9}   "
        if n < 93:
            line += f"  {damp:5.1f}dB {ok(damp, 30, 999)}"
            fails += not (damp >= 30)
        fails += not (bt <= bright <= 40)
        print(line)
    print(f"\n不符合文獻範圍的項目：{fails}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
