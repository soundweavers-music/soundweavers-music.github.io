// 和弦：名稱與組成音、從參考軌自動抓和弦（MIDI 或音訊）、人聲和聲的自動編排
import { store, isMidiClip } from './state.js';
import { keyFromHistogram, histogramFromMidi, histogramFromAudio } from './keydetect.js';

export const ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// 性質：顯示用字尾、組成音（以根音為 0）、比對時每個音的權重
export const QUALITIES = [
  { id: 'maj', suf: '', label: '大三', iv: [0, 4, 7], w: [1, 0.85, 0.8] },
  { id: 'min', suf: 'm', label: '小三', iv: [0, 3, 7], w: [1, 0.85, 0.8] },
  { id: '7', suf: '7', label: '屬七', iv: [0, 4, 7, 10], w: [1, 0.8, 0.7, 0.6] },
  { id: 'maj7', suf: 'maj7', label: '大七', iv: [0, 4, 7, 11], w: [1, 0.8, 0.7, 0.6] },
  { id: 'm7', suf: 'm7', label: '小七', iv: [0, 3, 7, 10], w: [1, 0.8, 0.7, 0.6] },
  { id: 'dim', suf: 'dim', label: '減三', iv: [0, 3, 6], w: [1, 0.85, 0.8] },
  { id: 'aug', suf: 'aug', label: '增三', iv: [0, 4, 8], w: [1, 0.85, 0.8] },
  { id: 'sus2', suf: 'sus2', label: '掛二', iv: [0, 2, 7], w: [1, 0.8, 0.8] },
  { id: 'sus4', suf: 'sus4', label: '掛四', iv: [0, 5, 7], w: [1, 0.8, 0.8] },
];
const QI = Object.fromEntries(QUALITIES.map((q, i) => [q.id, i]));
export const chordName = c => ROOTS[c.root] + (QUALITIES[QI[c.q]]?.suf ?? '');
export function chordPcs(c) {
  const Q = QUALITIES[QI[c.q]] || QUALITIES[0];
  let m = 0; for (const s of Q.iv) m |= 1 << ((c.root + s) % 12);
  return m;
}

// 調內的三和弦（自動抓和弦時給一點偏好；手動新增和弦時當預設）
export function diatonicChord(key, minor, degree) {
  const steps = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const r = steps[degree % 7], third = (steps[(degree + 2) % 7] - r + 12) % 12, fifth = (steps[(degree + 4) % 7] - r + 12) % 12;
  const q = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : (fifth === 6 ? 'dim' : 'min');
  return { root: (key + r) % 12, q };
}

// ---------- 色度（12 個音名的能量）----------
function fftMag(re, im) {
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

// 音訊片段 → 每個時間格的色度（chroma[slot][12]）與低音色度（bass[slot][12]）
function audioChroma(clip, buf, slotSec, nSlots, chroma, bass) {
  const sr = buf.sampleRate, N = sr > 60000 ? 16384 : 8192, hop = N / 2;
  const ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  // 每個 FFT bin 對應的音名（只取 55 Hz～2 kHz；低音另外累計 40～250 Hz）
  const pcOf = new Int8Array(N / 2).fill(-1), isBass = new Uint8Array(N / 2);
  for (let k = 1; k < N / 2; k++) {
    const f = k * sr / N;
    if (f < 40 || f > 2000) continue;
    const m = 69 + 12 * Math.log2(f / 440);
    if (Math.abs(m - Math.round(m)) > 0.4) continue;   // 落在兩個半音中間的 bin 不算
    pcOf[k] = ((Math.round(m) % 12) + 12) % 12;
    if (f < 250) isBass[k] = 1;
  }
  const s0 = Math.floor(clip.offset * sr), s1 = Math.min(buf.length, Math.floor((clip.offset + clip.duration) * sr));
  const re = new Float32Array(N), im = new Float32Array(N);
  const mags = new Float64Array(N / 2);
  for (let p = s0; p + N <= s1; p += hop) {
    for (let i = 0; i < N; i++) { re[i] = (ch0[p + i] + ch1[p + i]) * 0.5 * win[i]; im[i] = 0; }
    fftMag(re, im);
    const tSec = clip.start + (p + N / 2 - s0) / sr;
    const slot = Math.floor(tSec / slotSec);
    if (slot < 0 || slot >= nSlots) continue;
    const c = chroma[slot], b = bass[slot];
    for (let k = 1; k < N / 2; k++) mags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    // 諧波抑制：A3 的第三次泛音剛好是 E5，不處理的話「A+C+E 的泛音」會被讀成 Am
    for (let k = 2; k < N / 2 - 8; k++) {
      const m = mags[k];
      if (m < 1e-4) continue;
      for (const [mult, amt] of [[3, 0.55], [5, 0.32]]) {
        const tgt = Math.round(k * mult);
        if (tgt >= N / 2 - 1) continue;
        for (let d = -2; d <= 2; d++) {
          const kk = tgt + d;
          if (kk > 0 && kk < N / 2) mags[kk] = Math.max(0, mags[kk] - m * amt / (1 + Math.abs(d)));
        }
      }
    }
    for (let k = 1; k < N / 2; k++) {
      const pc = pcOf[k]; if (pc < 0) continue;
      const v = Math.sqrt(mags[k]);        // 壓縮動態，讓弱的和弦音也算得到
      if (isBass[k]) b[pc] += v; else c[pc] += v;
    }
  }
}

function midiChroma(track, slotBeats, nSlots, chroma, bass) {
  for (const c of track.clips.filter(isMidiClip)) {
    for (const n of c.notes) {
      if (n.t >= c.lengthBeats) continue;
      const a = c.startBeat + n.t, z = c.startBeat + Math.min(n.t + n.d, c.lengthBeats);
      for (let s = Math.max(0, Math.floor(a / slotBeats)); s < nSlots && s * slotBeats < z; s++) {
        const ov = Math.min(z, (s + 1) * slotBeats) - Math.max(a, s * slotBeats);
        if (ov <= 0) continue;
        const w = ov * (0.4 + n.v / 127);
        chroma[s][n.p % 12] += w;
        // 低音：每格最低的音另外記
        if (!bass[s]._low || n.p < bass[s]._low.p) bass[s]._low = { p: n.p, w };
      }
    }
  }
  for (const b of bass) if (b._low) { b[b._low.p % 12] += b._low.w * 2; delete b._low; }
}

// 除錯用：印出每一格的 12 個音名能量（測試與調參數時很方便）
export async function debugChroma(trackId, resolution = 1) {
  const p = store.project, t = store.track(trackId);
  const spbSec = 60 / p.bpm;
  let endBeat = 0;
  for (const c of t.clips) endBeat = Math.max(endBeat, isMidiClip(c) ? c.startBeat + c.lengthBeats : (c.start + c.duration) / spbSec);
  const nSlots = Math.ceil(endBeat / resolution);
  const chroma = Array.from({ length: nSlots }, () => new Float64Array(12));
  const bass = Array.from({ length: nSlots }, () => new Float64Array(12));
  if (t.kind === 'midi') midiChroma(t, resolution, nSlots, chroma, bass);
  else for (const c of t.clips.filter(x => !isMidiClip(x))) { const b = store.buffers.get(c.bufferId); if (b) audioChroma(c, b, resolution * spbSec, nSlots, chroma, bass); }
  return Array.from(chroma, row => Array.from(row, v => +v.toFixed(1)));
}

// 從參考軌抓和弦。resolution：每幾拍判斷一次（1 = 每拍、2 = 半小節、4 = 一小節）
// 回傳 { chords: [{ t, d, root, q }]（拍）, key }
export async function detectChords(trackId, resolution = 2, onProgress) {
  const p = store.project, t = store.track(trackId);
  if (!t) return { chords: [], key: null };
  const spbSec = 60 / p.bpm;
  let endBeat = 0;
  for (const c of t.clips) endBeat = Math.max(endBeat, isMidiClip(c) ? c.startBeat + c.lengthBeats : (c.start + c.duration) / spbSec);
  const nSlots = Math.ceil(endBeat / resolution);
  if (!nSlots) return { chords: [], key: null };
  const chroma = Array.from({ length: nSlots }, () => new Float64Array(12));
  const bass = Array.from({ length: nSlots }, () => new Float64Array(12));
  if (t.kind === 'midi') midiChroma(t, resolution, nSlots, chroma, bass);
  else {
    const clips = t.clips.filter(c => !isMidiClip(c));
    for (let i = 0; i < clips.length; i++) {
      const b = store.buffers.get(clips[i].bufferId);
      if (b) audioChroma(clips[i], b, resolution * spbSec, nSlots, chroma, bass);
      onProgress && onProgress((i + 1) / clips.length);
      await new Promise(r => setTimeout(r));
    }
  }
  // 調性：整首的色度合起來
  const total = new Array(12).fill(0);
  for (const c of chroma) for (let i = 0; i < 12; i++) total[i] += c[i];
  const key = keyFromHistogram(total);
  const diat = new Set();
  if (key) for (let d = 0; d < 7; d++) { const c = diatonicChord(key.key, key.minor, d); diat.add(c.root * 16 + QI[c.q]); }
  // 候選和弦：12 個根音 × 常用性質（增三、掛二不自動判斷，誤判率高）
  const cands = [];
  for (let r = 0; r < 12; r++) for (const qid of ['maj', 'min', '7', 'maj7', 'm7', 'dim', 'sus4']) cands.push({ root: r, q: qid });
  const tmpl = cands.map(c => {
    const Q = QUALITIES[QI[c.q]], v = new Float64Array(12);
    Q.iv.forEach((s, i) => { v[(c.root + s) % 12] = Q.w[i]; });
    const nrm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return { v, nrm, prior: (diat.has(c.root * 16 + QI[c.q]) ? 0.06 : 0) - (Q.iv.length > 3 ? 0.035 : 0) - (c.q === 'dim' || c.q === 'sus4' ? 0.03 : 0) };
  });
  // 每格分數
  const energy = chroma.map(c => c.reduce((s, x) => s + x, 0));
  const eRef = energy.slice().sort((a, b) => a - b)[Math.floor(nSlots * 0.8)] || 1;
  // 時間平滑：把前後格的色度也混一點進來，單格的誤判就不會變成一個和弦
  const smooth = chroma.map((c, s) => {
    const a = chroma[Math.max(0, s - 1)], b = chroma[Math.min(nSlots - 1, s + 1)];
    const out = new Float64Array(12);
    const w = t.kind === 'midi' ? 0.28 : 0.14;   // 音訊平滑少一點，短和弦才不會被前後吃掉
    for (let i = 0; i < 12; i++) out[i] = c[i] * (1 - 2 * w) + a[i] * w + b[i] * w;
    return out;
  });
  // 調性信心：推測很確定時，調內和弦的加分才拉高
  const keyConf = key ? Math.max(0, Math.min(1, key.confidence ?? 0.5)) : 0;
  const S = smooth.map((c, s) => {
    const nrm = Math.sqrt(c.reduce((a, x) => a + x * x, 0)) || 1;
    const bm = Math.max(...bass[s]) || 1;
    return tmpl.map((T, k) => {
      let dot = 0; for (let i = 0; i < 12; i++) dot += c[i] * T.v[i];
      const dia = diat.has(cands[k].root * 16 + QI[cands[k].q]) ? 0.03 + 0.09 * keyConf : 0;
      return dot / (nrm * T.nrm) + T.prior + dia + 0.14 * bass[s][cands[k].root] / bm;
    });
  });
  // Viterbi：換和弦要付代價。換根音比換性質貴 -> 不會在 Am 和 A 之間亂跳
  const K = cands.length;
  // 分數尺度因情況而異（MIDI 很乾淨、音訊很糊），懲罰跟著分數的分布走
  let lo = Infinity, hi = -Infinity;
  for (const row of S) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const spread = Math.max(0.05, hi - lo);
  // 音訊的色度比較糊，換和弦的懲罰要小一點，否則短和弦會被前一個吃掉
  const SW_ROOT = t.kind === 'midi' ? Math.min(0.09, Math.max(0.03, spread * 0.06)) : 0.02;
  const SW_Q = SW_ROOT * 0.45;
  const rootOf = k => cands[k].root;
  let prev = S[0].slice(); const back = [];
  for (let s = 1; s < nSlots; s++) {
    const quiet = energy[s] < eRef * 0.08;
    let bi = 0; for (let k = 1; k < K; k++) if (prev[k] > prev[bi]) bi = k;
    const cur = new Float64Array(K), bk = new Int16Array(K);
    for (let k = 0; k < K; k++) {
      const stay = prev[k];
      const jump = prev[bi] - (rootOf(bi) === rootOf(k) ? SW_Q : SW_ROOT);
      if (stay >= jump) { cur[k] = stay; bk[k] = k; } else { cur[k] = jump; bk[k] = bi; }
      cur[k] += quiet ? 0 : S[s][k];     // 幾乎無聲的格子：延續前一個和弦
    }
    back.push(bk); prev = cur;
  }
  let k = 0; for (let i = 1; i < K; i++) if (prev[i] > prev[k]) k = i;
  const path = new Array(nSlots); path[nSlots - 1] = k;
  for (let s = nSlots - 1; s > 0; s--) { k = back[s - 1][k]; path[s - 1] = k; }
  // 開頭若是無聲，用第一個有聲的和弦
  const chords = [];
  let firstLoud = energy.findIndex(e => e >= eRef * 0.08); if (firstLoud < 0) firstLoud = 0;
  for (let s = firstLoud; s < nSlots; s++) {
    const c = cands[path[s]], last = chords[chords.length - 1];
    if (last && last.root === c.root && last.q === c.q) last.d += resolution;
    else chords.push({ t: s * resolution, d: resolution, root: c.root, q: c.q });
  }
  // ---- 收尾：逐段用「沒有平滑」的原始色度重新評估 ----
  // Viterbi 為了穩定會把短和弦併進前一個，這裡用實際能量再確認：
  //   1) 整段重新挑一次候選（只有明顯更好才改）
  //   2) 長段切一半再挑一次，兩半偏好不同就切開（音訊最常見的「少一個和弦」）
  const idOf = (r, q) => r * 16 + QI[q];
  const bestFor = (a, z) => {
    const sum = new Float64Array(12), bsum = new Float64Array(12);
    for (let s2 = a; s2 < z; s2++) { for (let i = 0; i < 12; i++) { sum[i] += chroma[s2][i]; bsum[i] += bass[s2][i]; } }
    return { sum, bsum, nrm: Math.sqrt(sum.reduce((x, y) => x + y * y, 0)) || 1, bm: Math.max(...bsum) || 1 };
  };
  const scoreK = (k, F) => {
    const T = tmpl[k], cd = cands[k];
    let dot = 0; for (let i = 0; i < 12; i++) dot += F.sum[i] * T.v[i];
    const dia = diat.has(idOf(cd.root, cd.q)) ? 0.03 + 0.09 * keyConf : 0;
    return dot / (F.nrm * T.nrm) + T.prior + dia + 0.14 * F.bsum[cd.root] / F.bm;
  };
  const pickBest = (a, z) => {
    const F = bestFor(a, z);
    let bk = 0, bs = -1e9;
    for (let k = 0; k < cands.length; k++) { const sc = scoreK(k, F); if (sc > bs) { bs = sc; bk = k; } }
    return { k: bk, sc: bs, F };
  };
  const refined = [];
  for (const c of chords) {
    const a = Math.max(0, Math.round(c.t / resolution)), z = Math.min(nSlots, Math.round((c.t + c.d) / resolution));
    if (z <= a) { refined.push(c); continue; }
    const cur = idOf(c.root, c.q);
    if (z - a >= 2) {
      // 掃過每一個可能的切點，找出「切開之後兩段各自最像什麼」總分最高的位置
      const whole = pickBest(a, z);
      const curIdx = cands.findIndex(x => idOf(x.root, x.q) === cur);
      const base = curIdx >= 0 ? scoreK(curIdx, whole.F) : -1e9;
      let bk = -1, bs = base + 0.015;
      for (let k = a + 1; k < z; k++) {
        const l = pickBest(a, k), r2 = pickBest(k, z);
        const sc = (l.sc * (k - a) + r2.sc * (z - k)) / (z - a);
        if (sc > bs) { bs = sc; bk = k; }
      }
      if (bk > 0) {
        const l = pickBest(a, bk), r2 = pickBest(bk, z);
        refined.push({ t: a * resolution, d: (bk - a) * resolution, root: cands[l.k].root, q: cands[l.k].q });
        refined.push({ t: bk * resolution, d: (z - bk) * resolution, root: cands[r2.k].root, q: cands[r2.k].q });
        continue;
      }
    }
    const p = pickBest(a, z);
    const sameIdx = cands.findIndex(x => idOf(x.root, x.q) === cur);
    const curSc = sameIdx >= 0 ? scoreK(sameIdx, p.F) : -1e9;
    refined.push(p.sc > curSc + 0.02
      ? { t: c.t, d: c.d, root: cands[p.k].root, q: cands[p.k].q }
      : c);
  }
  chords.length = 0; chords.push(...refined);
  // 七和弦／掛留：看第七音、第四音的實際能量，比模板更可靠
  for (const c of chords) {
    const a = Math.max(0, Math.round(c.t / resolution)), z = Math.min(nSlots, Math.round((c.t + c.d) / resolution));
    const F = bestFor(a, z);
    const e = i => F.sum[(c.root + i) % 12];
    const base = Math.max(1e-9, e(0));
    const has = (iv, th = 0.30) => e(iv) > base * th;
    const minorOK = has(3) && !has(4);
    if (has(10) && minorOK) c.q = 'm7';
    else if (has(11) && has(4)) c.q = 'maj7';
    else if (has(10) && has(4)) c.q = '7';
    else if (has(5) && !has(4) && !has(3)) c.q = 'sus4';
    else if (has(6) && has(3)) c.q = 'dim';
  }
  // 相鄰且完全一樣的和弦合併
  const merged = [];
  for (const c of chords) {
    const last = merged[merged.length - 1];
    if (last && last.root === c.root && last.q === c.q && Math.abs(last.t + last.d - c.t) < 1e-6) last.d += c.d;
    else merged.push({ ...c });
  }
  return { chords: merged, key };
}

// ---------- 自動編排 ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// 編排樣板（音階級數：2 = 三度、3 = 四度、4 = 五度、5 = 六度、7 = 八度；負數 = 往下）
const TIERS = [
  [[2], [-3], [4], [-2], [5]],
  [[2, 4], [2, -3], [-2, 2], [2, 5], [4, -3], [2, -7]],
  [[2, 4, -3], [2, 4, 7], [-2, 2, 4], [2, 5, -3], [2, 4, -7]],
  [[2, 4, -3, -7], [2, 4, 7, -3], [2, 5, -2, -7], [-2, 2, 4, 7]],
];
export const INTERVAL_CHOICES = [
  { n: 7, label: '上八度' }, { n: 5, label: '上六度' }, { n: 4, label: '上五度' }, { n: 3, label: '上四度' }, { n: 2, label: '上三度' },
  { n: 0, label: '同度（雙重人聲）' },
  { n: -2, label: '下三度' }, { n: -3, label: '下四度' }, { n: -4, label: '下五度' }, { n: -5, label: '下六度' }, { n: -7, label: '下八度' },
];
export const intervalLabel = n => INTERVAL_CHOICES.find(x => x.n === n)?.label ?? `${n}`;

// 每小節的人聲音量（這一軌的音訊）；沒有音訊 → null
function barEnergy(track, beatsPerBar, nBars) {
  const spbSec = 60 / store.project.bpm, barSec = beatsPerBar * spbSec;
  const e = new Float64Array(nBars); let any = false;
  for (const c of track.clips) {
    if (isMidiClip(c)) continue;
    const b = store.buffers.get(c.bufferId); if (!b) continue;
    const sr = b.sampleRate, d = b.getChannelData(0), step = 64;
    const s0 = Math.floor(c.offset * sr), s1 = Math.min(b.length, Math.floor((c.offset + c.duration) * sr));
    for (let i = s0; i < s1; i += step) {
      const bar = Math.floor((c.start + (i - s0) / sr) / barSec);
      if (bar >= 0 && bar < nBars) { e[bar] += d[i] * d[i]; any = true; }
    }
  }
  if (!any) return null;
  const n = barSec * 44100 / 64;
  return Array.from(e, x => Math.sqrt(x / n));
}

// 回傳 { sections, curves, voices }；sections 以拍為單位，iv[4]（null = 這段不唱）
export function autoArrange(trackId, params, seed = Date.now()) {
  const p = store.project, t = store.track(trackId), R = rng(seed);
  const bpb = p.sigNum || 4, spbSec = 60 / p.bpm;
  let endBeat = store.projectEnd() / spbSec;
  for (const c of params.chords || []) endBeat = Math.max(endBeat, c.t + c.d);
  const nBars = Math.max(4, Math.ceil(endBeat / bpb));
  const E = t ? barEnergy(t, bpb, nBars) : null;
  // 樂句：連續有聲的小節；中間空 1 小節以上就斷開。沒有音訊時每 4 小節一句
  let phrases = [];
  if (E) {
    const act = E.filter(x => x > 0).sort((a, b) => a - b);
    const th = (act[Math.floor(act.length / 2)] || 0) * 0.2;
    let a = -1;
    for (let i = 0; i <= nBars; i++) {
      const on = i < nBars && E[i] > th;
      if (on && a < 0) a = i;
      if (!on && a >= 0) { phrases.push([a, i]); a = -1; }
    }
    // 太長的樂句（> 8 小節）切成 4 小節一段，讓和聲有變化
    phrases = phrases.flatMap(([a, z]) => { const out = []; for (let s = a; s < z; s += z - a > 8 ? 4 : z - a) out.push([s, Math.min(z, s + (z - a > 8 ? 4 : z - a))]); return out; });
  } else {
    for (let s = 0; s < nBars; s += 4) phrases.push([s, Math.min(nBars, s + 4)]);
  }
  if (!phrases.length) return null;
  // 越大聲的樂句給越多聲部；沒有音訊時依位置（越後面越多）
  const score = phrases.map(([a, z], i) => E ? E.slice(a, z).reduce((s, x) => s + x, 0) / (z - a) : i / phrases.length + R() * 0.3);
  const rank = score.map((s, i) => [s, i]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const tierOf = new Array(phrases.length);
  rank.forEach((pi, r) => {
    const q = r / Math.max(1, phrases.length - 1);
    tierOf[pi] = q < 0.3 ? 0 : q < 0.6 ? 1 : q < 0.85 ? 2 : 3;
  });
  // 同一層的樂句盡量用同一種和聲（聽起來比較有段落感），偶爾換一種
  const pick = tier => TIERS[tier][Math.floor(R() * TIERS[tier].length)];
  const byTier = [0, 1, 2, 3].map(pick);
  const sections = phrases.map(([a, z], i) => {
    let ivs = R() < 0.25 ? pick(tierOf[i]) : byTier[tierOf[i]];
    const iv = [null, null, null, null];
    ivs.forEach((n, k) => { iv[k] = n; });
    return { t: a * bpb, d: (z - a) * bpb, iv, tier: tierOf[i] };
  });
  // 音量曲線：多聲部的段落和聲稍大，每段開頭有一點漸強
  const curves = [[], [], [], []];
  for (const s of sections) {
    const lvl = [0.8, 0.9, 1, 1.1][s.tier];
    for (let v = 0; v < 4; v++) {
      if (s.iv[v] === null) continue;
      const jit = 0.92 + R() * 0.16;
      curves[v].push({ t: s.t, v: +(lvl * jit * 0.75).toFixed(2) }, { t: s.t + Math.min(2, s.d / 2), v: +(lvl * jit).toFixed(2) }, { t: s.t + s.d - 0.01, v: +(lvl * jit).toFixed(2) });
    }
  }
  sections.forEach(s => delete s.tier);
  return { sections, curves };
}
