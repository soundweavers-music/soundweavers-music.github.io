// 偵測調性：把音高（12 個音名）的時間加權分布，跟 Krumhansl–Schmuckler 的大調／小調剖面做相關
// 來源依序：這一軌的 MIDI 音符 → 這一軌的音訊（YIN 逐段偵測）→ 整首其他 MIDI 軌
import { store, isMidiClip } from './state.js';

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function corr(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db + 1e-12);
}

export function keyFromHistogram(h) {
  if (h.reduce((s, v) => s + v, 0) <= 0) return null;
  const res = [];
  for (let k = 0; k < 12; k++) {
    const rot = i => h[(i + k) % 12];
    const hh = Array.from({ length: 12 }, (_, i) => rot(i));
    res.push({ key: k, minor: false, r: corr(hh, MAJOR) });
    res.push({ key: k, minor: true, r: corr(hh, MINOR) });
  }
  res.sort((a, b) => b.r - a.r);
  const [b1, b2] = res;
  return { key: b1.key, minor: b1.minor, confidence: Math.max(0, Math.min(1, (b1.r - b2.r) * 4 + b1.r * 0.5)),
    alt: `${NAMES[b2.key]} ${b2.minor ? '小調' : '大調'}` };
}

// 音訊：每 40 ms 跑一次簡化 YIN（降頻到 ~11 kHz），以音量加權累計到 12 個音名
export function histogramFromAudio(buf, start = 0, dur = Infinity) {
  const sr = buf.sampleRate, D = Math.max(1, Math.round(sr / 11025)), fs = sr / D;
  const ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const s0 = Math.floor(start * sr), s1 = Math.min(buf.length, Math.floor((start + Math.min(dur, 240)) * sr));   // 最多分析 4 分鐘
  const n = Math.floor((s1 - s0) / D);
  const x = new Float32Array(n);
  // 簡單低通（三點平均）後降頻
  for (let i = 0; i < n; i++) { const j = s0 + i * D; x[i] = (ch0[j] + ch1[j]) * 0.5; }
  const h = new Array(12).fill(0);
  const hop = Math.round(fs * 0.04), tmax = Math.ceil(fs / 70), tmin = Math.floor(fs / 1000), W = tmax;
  const d = new Float32Array(tmax + 1);
  for (let p = 0; p + W + tmax < n; p += hop) {
    let e = 0; for (let i = 0; i < W; i++) e += x[p + i] * x[p + i];
    const rms = Math.sqrt(e / W); if (rms < 0.01) continue;
    let run = 0, best = -1;
    for (let t = 1; t <= tmax; t++) {
      let s = 0; for (let j = 0; j < W; j += 2) { const df = x[p + j] - x[p + j + t]; s += df * df; }
      run += s; d[t] = run > 0 ? s * t / run : 1;
      if (best < 0 && t >= tmin && t > 2 && d[t - 1] < 0.15 && d[t - 1] <= d[t]) best = t - 1;
    }
    if (best < 0) continue;
    const midi = 69 + 12 * Math.log2(fs / best / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    h[pc] += rms;
  }
  return h;
}

export function histogramFromMidi(clips) {
  const h = new Array(12).fill(0);
  for (const c of clips) for (const n of c.notes) if (n.t < c.lengthBeats) h[n.p % 12] += Math.min(n.d, c.lengthBeats - n.t) * (n.v / 127);
  return h;
}

export async function detectKeyFromTrack(trackId) {
  const p = store.project;
  const t = store.track(trackId);
  const sum = (a, b) => a.map((v, i) => v + b[i]);
  let h = new Array(12).fill(0);
  if (t) {
    const midi = t.clips.filter(isMidiClip);
    if (midi.length) h = sum(h, histogramFromMidi(midi));
    for (const c of t.clips) {
      if (isMidiClip(c)) continue;
      const b = store.buffers.get(c.bufferId);
      if (b) h = sum(h, histogramFromAudio(b, c.offset, c.duration));
      await new Promise(r => setTimeout(r));   // 讓畫面有機會更新
    }
  }
  // 這一軌資訊不夠（例如還沒錄音）→ 參考整首的 MIDI 軌（和弦、貝斯通常最能決定調性）
  if (h.reduce((s, v) => s + v, 0) < 1e-3) {
    const all = p.tracks.filter(x => x.kind === 'midi').flatMap(x => x.clips.filter(isMidiClip));
    h = histogramFromMidi(all);
  }
  return keyFromHistogram(h);
}
