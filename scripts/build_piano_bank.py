"""從 Salamander Grand Piano（Yamaha C5，Alexander Holm，CC BY 3.0）做 DAW 內建鋼琴 sf2。

舊版（2026-11-19，7.3 MB）為了小：每 4 個半音一個取樣、最多 3 層力度、每個取樣只留 3.6 秒再設循環點
→ 移調幅度大（±2 半音，音色被拉扁）、力度變化少、尾音是「循環」出來的（假）。
這一版：
  ‧ 每 3 個半音一個取樣（Salamander 原本就是這個密度）→ 最多移調 ±1.5 半音
  ‧ 4 層力度（從原本 16 層挑 v3／v7／v11／v15，範圍照原作者的 SFZ）
  ‧ 不循環：每個取樣保留真的衰減，剪在 -50 dB（低音最長 10 秒、高音短一點），最後 60 ms 淡出
  ‧ 立體聲縮成單聲道（左右平均）：內建播放器每個 voice 一個 buffer，單聲道省一半記憶體
  ‧ 每層的音量照錄音原本的大小（力度越大越大聲），播放器的 vel² 只做層內的微調

用法
----
    python scripts/build_piano_bank.py <Salamander 解壓後的資料夾> [輸出 sf2] [播放音量 dB]
    （音量：用 piano_demo.py 量新舊版同一段樂句的 RMS，差多少填多少。2026-11-28：RMS 對齊要 +11.0，但輸出峰值會比舊版高 3 dB（新取樣保留真的起音），
    所以改成「峰值對齊舊版」的 +7.9——平均小聲約 3 dB，但不會比以前更容易破音）
資料夾裡要有 SalamanderGrandPianoV3.sfz 與 44.1kHz16bit/*.wav。
"""
import pathlib
import re
import struct
import sys
import wave

import numpy as np

# 從 16 層裡挑 4 層。實測（C2／C4／C6，16 層）：音量一路升 18～25 dB，亮度（頻譜重心）
# 中音只升 ~28%、高音 ~65%，而且高音在 v8→v9 跳一階；v1 在低音特別小聲（離群）。
# 所以平均挑 v3／v7／v11／v15。每層負責的 MIDI 力度範圍，照 Salamander 原作者在 SFZ 裡
# 分給「這層和它代表的那幾層」的範圍算（不是平均切）。
PICK = [3, 7, 11, 15]
TRIM_DB = -50    # 收尾：-50 dB 以下在混音裡會被殘響與其他聲部蓋掉，剪掉省一半大小
SR = 44100


def vel_ranges(regions):
    """每一層在 SFZ 裡的力度上限（hivel），用中音那一組；回傳挑出來的 4 層各自負責 [lo, hi]。"""
    hi_of = {}
    for (fn, layer), r in regions.items():
        if len(r) > 3 and r[3] is not None:
            hi_of.setdefault(layer, r[3])
    hi_of = {k: (127 if v is None else v) for k, v in hi_of.items()}
    out, lo = [], 1
    for i, layer in enumerate(PICK):
        # 這層代表「它到下一個被挑的層之間」的那幾層：上限取下一層的前一層的 hivel
        last = PICK[i + 1] - 1 if i + 1 < len(PICK) else 16
        hi = 127 if i + 1 == len(PICK) else hi_of.get(last, 127)
        out.append((layer, lo, hi))
        lo = hi + 1
    return out


def read_sfz(sfz):
    """回傳 {(sample 檔, 力度層): (lokey, hikey, pitch_keycenter, hivel)}（只取主取樣，不含 release／harmonics）。"""
    txt = sfz.read_text(encoding="utf-8", errors="replace")
    out = {}
    cur = {}
    for line in txt.splitlines():
        line = line.split("//")[0].strip()
        if not line:
            continue
        if line.startswith("<"):
            cur = {}
        for k, v in re.findall(r"(\w+)=(\S+)", line):
            cur[k] = v
        if "sample" in cur and "lokey" in cur and "hikey" in cur:
            m = re.search(r"([A-G]#?)(\d)v(\d+)\.wav$", cur["sample"].replace("\\", "/"))
            if m:
                out[(cur["sample"].replace("\\", "/"), int(m.group(3)))] = (
                    int(cur["lokey"]), int(cur["hikey"]), int(cur["pitch_keycenter"]) if "pitch_keycenter" in cur else None,
                    int(cur["hivel"]) if "hivel" in cur else None)
    return out


NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def midi_of(name):
    m = re.match(r"([A-G]#?)(\d)", name)
    return NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1)


def load(path):
    with wave.open(str(path)) as w:
        assert w.getframerate() == SR and w.getsampwidth() == 2, path
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(axis=1)
    return x


def trim(x, midi):
    """剪掉開頭的靜音、在 TRIM_DB 處收尾（再淡出 60 ms）。回傳 float32。"""
    a = np.abs(x)
    pk = a.max() + 1e-9
    i0 = int(np.argmax(a > pk * 10 ** (-50 / 20)))
    i0 = max(0, i0 - 32)
    # 包絡（20 ms 窗的最大值）找 -60 dB 的位置
    win = 882
    n = len(x) // win
    env = a[: n * win].reshape(n, win).max(axis=1)
    below = np.where(env < pk * 10 ** (TRIM_DB / 20))[0]
    below = below[below > (i0 // win) + 10]
    end = (below[0] + 1) * win if len(below) else len(x)
    cap = int(SR * (10.0 if midi < 48 else 7.0 if midi < 72 else 4.5))
    end = min(end, i0 + cap)
    y = x[i0:end].copy()
    f = min(len(y), int(0.06 * SR))
    y[-f:] *= np.linspace(1, 0, f) ** 2
    return y


# ---------------- 寫 sf2 ----------------
def chunk(cid, data):
    pad = b"\0" if len(data) & 1 else b""
    return cid + struct.pack("<I", len(data)) + data + pad


def lst(kind, body):
    return chunk(b"LIST", kind + body)


def zstr(s, n):
    b = s.encode("ascii", "replace")[: n - 1]
    return b + b"\0" * (n - len(b))


def gen(op, val=None, lo=None, hi=None):
    if lo is not None:
        return struct.pack("<HBB", op, lo, hi)
    return struct.pack("<Hh", op, val)


def write_sf2(out, samples, zones, gain_db=0.0):
    """samples: [(name, int16 array, root, correction)]；zones: [(lokey, hikey, lovel, hivel, sample_idx, atten_cb)]"""
    smpl = bytearray()
    shdr = bytearray()
    for name, pcm, root, corr in samples:
        start = len(smpl) // 2
        smpl += pcm.astype("<i2").tobytes()
        end = len(smpl) // 2
        smpl += b"\0" * 92   # 每個 sample 後面規定要 46 個零樣本
        shdr += zstr(name, 20) + struct.pack("<IIIIIBbHH", start, end, start, end, SR, root, corr, 0, 1)
    shdr += zstr("EOS", 20) + struct.pack("<IIIIIBbHH", 0, 0, 0, 0, 0, 0, 0, 0, 0)

    # instrument：一個 instrument、每個 zone 一個 (key, vel) 區塊
    igen = bytearray()
    ibag = bytearray()
    n = 0
    for lo, hi, vlo, vhi, si, att in zones:
        ibag += struct.pack("<HH", n, 0)
        g = [gen(43, lo=lo, hi=hi), gen(44, lo=vlo, hi=vhi),
             gen(48, att),                     # initialAttenuation（centibel）
             gen(38, round(1200 * np.log2(0.35))),   # releaseVolEnv：放開後 0.35 秒（制音器）
             gen(54, 0),                       # sampleModes：不循環
             gen(53, si)]                      # sampleID 一定在最後
        igen += b"".join(g)
        n += len(g)
    ibag += struct.pack("<HH", n, 0)
    igen += struct.pack("<HH", 0, 0)
    inst = zstr("Salamander Grand", 20) + struct.pack("<H", 0) + zstr("EOI", 20) + struct.pack("<H", len(zones))

    # preset：GM 0（Acoustic Grand Piano），一個 zone 指到上面的 instrument
    pgen = gen(41, 0) + struct.pack("<HH", 0, 0)
    pbag = struct.pack("<HH", 0, 0) + struct.pack("<HH", 1, 0)
    phdr = zstr("Salamander Grand Piano", 20) + struct.pack("<HHHIII", 0, 0, 0, 0, 0, 0) \
        + zstr("EOP", 20) + struct.pack("<HHHIII", 0, 0, 1, 0, 0, 0)
    pmod = b"\0" * 10
    imod = b"\0" * 10

    info = lst(b"INFO", chunk(b"ifil", struct.pack("<HH", 2, 1)) + chunk(b"isng", b"EMU8000\0")
               + chunk(b"INAM", b"Salamander Grand Piano\0")
               + chunk(b"ICOP", b"Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0\0")
               + chunk(b"ICMT", (f"Yamaha C5. 30 roots x 4 velocity layers, unlooped natural decay. "
                                 f"gain={gain_db:+.1f}dB. Built by build_piano_bank.py").encode("ascii") + b"\0"))
    sdta = lst(b"sdta", chunk(b"smpl", bytes(smpl)))
    pdta = lst(b"pdta", chunk(b"phdr", phdr) + chunk(b"pbag", pbag) + chunk(b"pmod", pmod) + chunk(b"pgen", pgen)
               + chunk(b"inst", inst) + chunk(b"ibag", bytes(ibag)) + chunk(b"imod", imod) + chunk(b"igen", bytes(igen))
               + chunk(b"shdr", bytes(shdr)))
    body = b"sfbk" + info + sdta + pdta
    pathlib.Path(out).write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)


def main():
    src = pathlib.Path(sys.argv[1])
    # 第三個參數：播放音量（dB），讓整體大小跟舊版一樣（舊專案的鋼琴才不會突然變小聲）
    gain_db = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    out = sys.argv[2] if len(sys.argv) > 2 else str(pathlib.Path(__file__).resolve().parent.parent / "assets" / "daw-bank" / "builtin-piano.sf2")
    sfz = next(src.rglob("*.sfz"))
    regions = read_sfz(sfz)
    if not regions:
        raise SystemExit("SFZ 裡沒讀到取樣區塊")
    wavdir = sfz.parent
    # 每個根音的 key 範圍（同一個根音在各力度層相同）
    # 根音一律用檔名的音名算（C4 = 60），不信 SFZ 的 pitch_keycenter：
    # 原作者的 SFZ 只有 C4 那一組沒寫 pitch_keycenter（SFZ 規範預設 60，所以原版沒事），
    # 2026-11-28 第一版拿 lokey（59）頂替 → 中央 C 附近三個鍵整整高半音。
    roots = {}
    for (fn, layer), (lo, hi, kc, _hv) in regions.items():
        name = pathlib.Path(fn).stem.split("v")[0]
        root = midi_of(name)
        if kc is not None and kc != root:
            print(f"  注意：{name} 的 SFZ pitch_keycenter={kc}，跟檔名的 {root} 不一樣，用檔名的")
        if not (lo <= root <= hi):
            raise SystemExit(f"{name} 的根音 {root} 不在它負責的鍵範圍 {lo}–{hi} 裡，SFZ 跟檔名對不上")
        roots[name] = (lo, hi, root)
    names = sorted(roots, key=midi_of)
    # 再檢查一次：每個鍵都剛好由一個根音負責、根音彼此不重複
    covered = sorted(k for n in names for k in range(roots[n][0], roots[n][1] + 1))
    if covered != list(range(covered[0], covered[-1] + 1)):
        raise SystemExit(f"鍵的範圍有洞或重疊：{covered}")
    print(f"{len(names)} 個根音：{names[0]}–{names[-1]}")

    layers = vel_ranges(regions)
    print("力度層：", ", ".join(f"v{l} → {lo}–{hi}" for l, lo, hi in layers))
    samples, zones = [], []
    # 每層的音量：用錄音原本的峰值，跨層保留大小差異；最大聲那層 = 0 dB
    peaks = {}
    cache = {}
    for name in names:
        for layer, _lo, _hi in layers:
            p = wavdir / "44.1khz16bit" / f"{name}v{layer}.wav"
            if not p.exists():
                p = next(wavdir.rglob(f"{name}v{layer}.wav"))
            x = load(p)
            cache[(name, layer)] = x
            peaks[(name, layer)] = float(np.abs(x).max())
    ref = max(peaks.values())
    total = 0
    # 每個取樣先正規化到滿格（16-bit 解析度最好），音量改用 initialAttenuation（只能「減」）還原。
    # 播放器最後還會乘 vel²（sf2.js）。要讓層與層「接得上」：在交界的力度 b，
    #   下面那層 @b 的音量 = 上面那層 @b+1 的音量
    # 從最上面那層（保留錄音原本的大小）往下一層一層推。
    # 舊版的錯：用層的中點補 vel²，而且 max(0, …) 把「要放大」的負值直接砍掉 → 小聲的層更小聲。
    plan = []          # (name, layer, vlo, vhi, gain_db)；gain_db 是相對「正規化到滿格」要乘多少
    for name in names:
        # 同一個根音，挑出來的層要「越來越大聲」（原始錄音有少數倒過來的，例如 C6 v5 比 v4 小）
        pk_seq = [peaks[(name, l)] for l, _a, _b in layers]
        if any(b < a for a, b in zip(pk_seq, pk_seq[1:])):
            print(f"  注意：{name} 挑出來的層音量沒有一路變大：", [round(20 * np.log10(p), 1) for p in pk_seq])
        g = [0.0] * len(layers)
        top = len(layers) - 1
        g[top] = 20 * np.log10(peaks[(name, layers[top][0])] / ref)     # 最大聲那層＝錄音原本的大小
        for i in range(top - 1, -1, -1):
            b = layers[i][2]                                             # 交界：這層的最大力度
            vg = lambda v: 40 * np.log10(v / 127)                        # vel² 的 dB
            # 下層 @b ＝ 上層 @b+1
            g[i] = g[i + 1] + vg(b + 1) - vg(b)
        # 這樣整體的大小聲只由 vel² 決定（v4→v127 約 30 dB，跟真鋼琴 pp→ff 的 25～35 dB 相當）；
        # 各層錄音本身的大小差被抵掉，但「音色」差（輕彈暗、重彈亮）保留在取樣裡。
        for (layer, vlo, vhi), gd in zip(layers, g):
            plan.append((name, layer, vlo, vhi, gd))
    # 鍵盤上相鄰音的音量拉平：原始錄音每個音的錄音電平不一樣（例如 C4 比旁邊的 A3、C5 大 6 dB），
    # 當旋律彈會有一個音特別跳出來。保留「低音大、高音小」的自然斜率（用平滑曲線），
    # 只把每個根音拉向那條曲線。量的是起音後 0.3 秒的 RMS（耳朵聽到的大小），不是峰值。
    lv = {}
    for name in names:
        x = cache[(name, layers[-1][0])]
        i = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.03))
        s = x[i: i + int(0.3 * SR)]
        lv[name] = 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-12)
    ms = np.array([midi_of(n) for n in names], float)
    ys = np.array([lv[n] for n in names])
    smooth = np.polyval(np.polyfit(ms, ys, 2), ms)          # 二次曲線：低音到高音的自然斜率
    fix = {n: float(np.clip(smooth[k] - ys[k], -9, 9)) for k, n in enumerate(names)}
    big = sorted(((round(v, 1), n) for n, v in fix.items()), key=lambda t: -abs(t[0]))[:5]
    print("相鄰音拉平（最大的幾個，dB）：", big)
    plan = [(n, l, a, b, gd + fix[n]) for n, l, a, b, gd in plan]
    gmax = max(p[4] for p in plan)
    for name, layer, vlo, vhi, gd in plan:
        lo, hi, kc = roots[name]
        x = trim(cache[(name, layer)], kc)
        pk = np.abs(x).max() + 1e-9
        pcm = np.clip(np.round(x / pk * 32000), -32767, 32767).astype(np.int16)
        att_cb = int(round((gmax - gd) * 10))       # 最大聲的區塊 = 0，其餘相對減
        samples.append((f"{name}v{layer}", pcm, kc, 0))
        zones.append((lo, hi, vlo, vhi, len(samples) - 1, att_cb))
        total += len(pcm)
    write_sf2(out, samples, zones, gain_db)
    size = pathlib.Path(out).stat().st_size
    print(f"{len(samples)} 個取樣、{total / SR / 60:.1f} 分鐘音訊 → {out}（{size / 1e6:.1f} MB）")


if __name__ == "__main__":
    main()
