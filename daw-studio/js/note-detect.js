// 把一段音訊切成「一顆一顆的音符」，給人聲修音的音符編輯器用。
// 作法是精簡版 YIN：降頻到約 11 kHz、每 10 ms 取一格音高，再依音高穩定度合併成音符。
// 只用來當「編輯的起點」，不是分析報告：唱得含糊的地方它會切得比較粗，那是正常的。

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const midiName = m => NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

export function detectNotes(buf, startSec = 0, durSec = Infinity, opts = {}) {
  const sr = buf.sampleRate;
  const fmin = opts.fmin ?? 70, fmax = opts.fmax ?? 1100;
  const gate = opts.gate ?? 0.0075;          // 低於這個 RMS 當作沒聲音
  const s0 = Math.floor(startSec * sr);
  const s1 = Math.min(buf.length, Math.floor((startSec + Math.min(durSec, 600)) * sr));
  if (s1 - s0 < sr * 0.1) return [];
  const ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;

  // 降頻（先做一階低通，避免鋸齒）
  const D = Math.max(1, Math.round(sr / 11025)), fs = sr / D;
  const n = Math.floor((s1 - s0) / D);
  const x = new Float32Array(n);
  let lp = 0;
  const a = 0.45;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < D; k++) { const v = (ch0[s0 + i * D + k] + ch1[s0 + i * D + k]) * 0.5 || 0; lp = lp * a + v * (1 - a); }
    x[i] = lp;
  }

  const hop = Math.max(1, Math.round(fs * 0.02));
  const tmin = Math.max(2, Math.floor(fs / fmax));
  const tmax = Math.min(Math.floor(fs / fmin), 512);
  const W = tmax;
  const d = new Float32Array(tmax + 1), cm = new Float32Array(tmax + 1);
  const frames = [];
  for (let p = 0; p + W + tmax < n; p += hop) {
    let e = 0;
    for (let i = 0; i < W; i++) e += x[p + i] * x[p + i];
    const rms = Math.sqrt(e / W);
    if (rms < gate) { frames.push({ t: (p * D) / sr, midi: 0, conf: 1, rms }); continue; }
    let run = 0, best = -1;
    for (let tau = 1; tau <= tmax; tau++) {
      let s = 0;
      for (let j = 0; j < W; j += 2) { const df = x[p + j] - x[p + j + tau]; s += df * df; }
      run += s;
      d[tau] = run > 0 ? s * tau / run : 1;
      if (best < 0 && tau >= tmin && tau > 2 && d[tau - 1] < 0.16 && d[tau - 1] <= d[tau]) best = tau - 1;
    }
    if (best < 0) { frames.push({ t: (p * D) / sr, midi: 0, conf: 1, rms }); continue; }
    let tau = best;
    if (best > 1 && best < tmax) {
      const A = d[best - 1], B = d[best], C = d[best + 1], den = A - 2 * B + C;
      if (Math.abs(den) > 1e-12) tau = best + 0.5 * (A - C) / den;
    }
    const f = fs / tau;
    frames.push({ t: (p * D) / sr, midi: 69 + 12 * Math.log2(f / 440), conf: d[best], rms });
  }

  // 合併成音符：音高連續、能量連續就視為同一顆
  const notes = [];
  let cur = null;
  const push = () => {
    if (cur && cur.e - cur.s >= 0.06) {
      const mid = cur.vals.slice().sort((a, b) => a - b)[Math.floor(cur.vals.length / 2)];
      notes.push({ s: cur.s, e: cur.e, midi: Math.round(mid * 10) / 10, amt: 1, conf: 1 - cur.conf / cur.n });
    }
    cur = null;
  };
  for (const fr of frames) {
    const ok = fr.midi > 0 && fr.conf < 0.35;
    if (!ok) { if (cur && fr.t - cur.e > 0.04) push(); continue; }
    if (cur && Math.abs(fr.midi - cur.last) < 0.75 && fr.t - cur.e < 0.07) {
      cur.e = fr.t + 0.02; cur.last = fr.midi; cur.vals.push(fr.midi); cur.conf += fr.conf; cur.n++;
    } else {
      push();
      cur = { s: fr.t, e: fr.t + 0.01, last: fr.midi, vals: [fr.midi], conf: fr.conf, n: 1 };
    }
  }
  push();
  return notes;
}
