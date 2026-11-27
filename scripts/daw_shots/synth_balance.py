"""用實測結果把每個音色的音量校正到同一個基準。

讀 work/zytest.json（synth_check.py --json 的輸出），算出每個音色該乘多少，
寫進 daw-studio/js/zy-gain.js。zy-patches.js 會把它乘進 gain。

目標：單音峰值 ≈ -10 dBFS、整段 RMS ≈ -22 dBFS，取兩者中比較保守的那個。
這樣和弦疊起來不會破，音色之間的音量也接近。

用法
----
    python scripts/daw_shots/synth_check.py --json
    python scripts/daw_shots/synth_balance.py
"""
import json
import math
import pathlib
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
SRC = BASE / "work" / "zytest.json"
OUT = BASE / "daw-studio" / "js" / "zy-gain.js"

PEAK_TARGET = -10.0
RMS_TARGET = -22.0


def main():
    if not SRC.exists():
        print("找不到 work/zytest.json，先跑 synth_check.py --json")
        return 1
    data = json.loads(SRC.read_text(encoding="utf-8"))
    rows = [r for r in data["results"] if r.get("peak") is not None]
    if not rows:
        print("沒有量到資料")
        return 1

    # 現有的校正值（量測是在「已經套用過」的狀態下做的，所以要用乘的）
    prev = {}
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            if "':" in line:
                k, v = line.strip().split("':")
                try:
                    prev[k.strip(" '\"")] = float(v.strip(" ,}"))
                except ValueError:
                    pass

    lines = []
    for r in rows:
        peak = r["peak"]
        rms = r.get("all", r["a"])
        # 峰值優先（避免破音），但太小聲的音色也拉上來
        d_peak = PEAK_TARGET - peak
        d_rms = RMS_TARGET - rms
        d = min(d_peak, d_rms)
        g = math.pow(10, d / 20) * prev.get(r["id"], 1.0)
        g = max(0.08, min(4.0, g))
        lines.append((r["id"], round(g, 3), peak, rms, d))

    body = "\n".join(f"  '{i}': {g}," for i, g, *_ in lines)
    OUT.write_text(
        "// 由 scripts/daw_shots/synth_balance.py 產生：每個音色的音量校正係數。\n"
        "// 不要手改；重新量測請先跑 synth_check.py --json，再跑 synth_balance.py。\n"
        "export const ZY_GAIN = {\n" + body + "\n};\n",
        encoding="utf-8",
    )

    ds = sorted(x[4] for x in lines)
    print(f"{len(lines)} 個音色，調整 {ds[0]:+.1f} … {ds[-1]:+.1f} dB（中位數 {ds[len(ds) // 2]:+.1f}）")
    worst = sorted(lines, key=lambda x: x[4])[:6]
    for i, g, p, r_, d in worst:
        print(f"  最小 {i:20s} 峰值 {p:6.1f} RMS {r_:6.1f} → {g:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
