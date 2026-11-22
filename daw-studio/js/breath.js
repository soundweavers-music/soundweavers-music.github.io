// 呼吸聲偵測：找出人聲裡的「吸氣／換氣」——有聲音、但不是樂音的短區段。
// 特徵：能量比歌聲小 8–35 dB、頻譜平坦度高（雜訊感）、持續 60–800 ms。
// 只做分析，不動音訊：結果交給 breath-ui 變成音量的自動化。
import { clamp } from './util.js';

// ---------- 小工具 ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = clamp((a.length - 1) * p, 0, a.length - 1);
  const lo = Math.floor(i), hi = Math.min(a.length - 1, lo + 1);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};

// 分析一個 AudioBuffer 的 [offset, offset+dur) 區段
// opts.sens：0（保守，只抓很明顯的）～1（積極）
// 回傳 [{ start, end, relDb }]（start/end 是 buffer 內的秒數）
export function analyzeBreaths(buf, offset = 0, dur = null, opts = {}) {
  const sr = buf.sampleRate;
  const total = buf.length / sr;
  const t0 = clamp(offset, 0, total);
  const t1 = clamp(offset + (dur ?? total), t0, total);
  const n0 = Math.floor(t0 * sr), n1 = Math.floor(t1 * sr);
  if (n1 - n0 < sr * 0.1) return [];

  const N = 2048;                                   // 46 ms 視窗
  const hop = Math.max(128, Math.round(sr * 0.01)); // 10 ms
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const k0 = Math.max(1, Math.round(150 * N / sr));
  const k1 = Math.min(N / 2 - 1, Math.round(8000 * N / sr));

  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;

  // 第一遍：只算能量（很快）。先知道歌聲與底噪的水平，才知道哪些格子值得做 FFT。
  const frames = [];   // { c: 中心秒數, rmsDb, flat, p }
  for (let p = n0; p + N <= n1; p += hop) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = (ch0[p + i] + ch1[p + i]) * 0.5;
      sum += v * v;
    }
    frames.push({ c: (p + N / 2) / sr, rmsDb: 20 * Math.log10(Math.sqrt(sum / N) + 1e-9), flat: 0, p });
  }
  if (frames.length < 5) return [];

  const rs = frames.map(f => f.rmsDb);
  const vocal = percentile(rs, 0.85);        // 歌聲的水平
  const floor = percentile(rs, 0.10);        // 底噪
  const sens = clamp(opts.sens ?? 0.5, 0, 1);
  const flatThr = 0.30 - 0.18 * sens;       // 越積極，平坦度門檻越低
  const maxRel = -(9 - 5 * sens);           // 至少要比歌聲小 9～4 dB
  const loDb = Math.max(floor + 6, vocal - 42);
  const hiDb = vocal + maxRel;

  // 第二遍：只在「有可能」的格子算頻譜平坦度（長時間的人聲才不會卡住介面）
  for (const f of frames) {
    if (f.rmsDb < loDb || f.rmsDb > hiDb) continue;
    for (let i = 0; i < N; i++) { re[i] = (ch0[f.p + i] + ch1[f.p + i]) * 0.5 * win[i]; im[i] = 0; }
    fft(re, im);
    let logSum = 0, specSum = 0, cnt = 0;
    for (let k = k0; k <= k1; k++) {
      const pw = re[k] * re[k] + im[k] * im[k] + 1e-12;
      logSum += Math.log(pw); specSum += pw; cnt++;
    }
    f.flat = cnt ? Math.exp(logSum / cnt) / (specSum / cnt) : 0;
  }

  const flags = frames.map(f => f.flat > flatThr && f.rmsDb >= loDb && f.rmsDb <= hiDb);

  // 分組（允許中間斷 30 ms），再合併距離 < 120 ms 的兩組
  const groups = [];
  let cur = null;
  frames.forEach((f, i) => {
    if (!flags[i]) return;
    if (cur && i - cur.last <= 3) { cur.last = i; return; }
    cur = { first: i, last: i };
    groups.push(cur);
  });
  const spans = [];
  for (const g of groups) {
    const start = frames[g.first].c - 0.023, end = frames[g.last].c + 0.023;
    if (end - start < 0.05 || end - start > 0.9) continue;   // 太短＝子音、太長＝不是呼吸
    let sum = 0;
    for (let i = g.first; i <= g.last; i++) sum += frames[i].rmsDb;
    const relDb = sum / (g.last - g.first + 1) - vocal;
    spans.push({ start: Math.max(t0, start), end: Math.min(t1, end), relDb });
  }
  spans.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < 0.12) {
      last.end = Math.max(last.end, s.end);
      last.relDb = Math.min(last.relDb, s.relDb);
    } else merged.push({ ...s });
  }
  return merged;
}

// 片段 → 專案時間（秒）
export function regionsToProject(clip, regions) {
  return regions.map(r => ({
    start: clip.start + (r.start - clip.offset),
    end: clip.start + (r.end - clip.offset),
    relDb: r.relDb,
  }));
}
