// 人聲和聲：高品質預先運算（離線，不支援即時監聽）
// 與即時版（harmony-worklet.js）最大的差別：先把整段主唱分析完，再決定和聲，所以可以看「前後文」。
//
// 1) 音高：5 ms 一格、全取樣率 YIN（CMNDF）。每格保留數個候選週期，
//    候選成本 = τ、2τ、3τ 的 CMNDF 平均（真正的週期在倍數處也是低點；共振峰造成的「諧波週期」不是）；
//    是較短候選整數倍的（低八度）直接去掉。再用 Viterbi 找整段最平順的路徑（八度跳動成本很高），
//    加上最短有聲／無聲長度。→ 不會在某個母音突然抓錯八度（即時版的主要問題）。
// 2) 音高標記：沿著平順的音高曲線每個週期放一個，再對齊到低通訊號的波峰（±20% 週期內），不會重複或跳過。
// 3) 主唱音符：80 ms 中位數去掉顫音，對到音階／和弦音並有遲滯，太短的經過音併入下一個音。
// 4) 和聲音高曲線（每格）：和聲音 + 保留顫音 × 主唱的顫音 + (1 − 和聲音準) × 主唱唱歪的量；換音時平滑滑過去。
// 5) 重建：TD-PSOLA。合成標記依和聲週期排列，每個 grain 從相鄰兩個分析標記內插取出（避免重複／跳過造成的粗糙聲），
//    窗 = 兩個分析週期的 Hann。無聲段落以固定間距通過並壓小。最後每個聲部的音量對齊主唱。
//
// 實測（合成歌手，含顫音、滑音、氣音、唱歪；見 work/harm_hq/）：
//   即時版：中位誤差 18 cent、31% 的時間落在錯的音上；高品質版：中位 6 cent、錯音 2%（多在換音的瞬間）

const FR = 0.005;

// ---------------- FFT（radix-2，實數用複數算）----------------
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// 二階 Butterworth 低通，前後各跑一次（零相位）
function lowpass(x, sr, fc) {
  const w = Math.tan(Math.PI * fc / sr), w2 = w * w, k = Math.SQRT2 * w, a0 = 1 + k + w2;
  const b0 = w2 / a0, b1 = 2 * b0, b2 = b0, a1 = 2 * (w2 - 1) / a0, a2 = (1 - k + w2) / a0;
  const run = (src, dst, rev) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const n = src.length;
    for (let s = 0; s < n; s++) {
      const i = rev ? n - 1 - s : s, xv = src[i];
      const y = b0 * xv + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xv; y2 = y1; y1 = y; dst[i] = y;
    }
  };
  const t = new Float32Array(x.length), y = new Float32Array(x.length);
  run(x, t, false); run(t, y, true);
  return y;
}

// ---------------- 1) 音高分析 ----------------
function yinCandidates(x, sr, fmin, fmax, hop, onProgress) {
  const tmax = Math.floor(sr / fmin) + 2, tmin = Math.max(2, Math.floor(sr / fmax));
  const W = Math.floor(tmax * 1.15);
  const n = x.length, nfr = 1 + Math.floor(n / hop);
  const L = W + tmax;
  let nfft = 1; while (nfft < L) nfft <<= 1;
  const aRe = new Float64Array(nfft), aIm = new Float64Array(nfft), sRe = new Float64Array(nfft), sIm = new Float64Array(nfft);
  const seg = new Float64Array(L), cs = new Float64Array(L + 1), cm = new Float64Array(tmax), d = new Float64Array(tmax);
  const cands = new Array(nfr), rms = new Float32Array(nfr);
  const off = W >> 1;
  for (let f = 0; f < nfr; f++) {
    const st = f * hop - off;
    for (let i = 0; i < L; i++) { const j = st + i; seg[i] = j >= 0 && j < n ? x[j] : 0; }
    let e0 = 0; for (let i = 0; i < W; i++) e0 += seg[i] * seg[i];
    rms[f] = Math.sqrt(e0 / W);
    if (rms[f] < 1e-4) { cands[f] = []; continue; }
    cs[0] = 0; for (let i = 0; i < L; i++) cs[i + 1] = cs[i] + seg[i] * seg[i];
    // r(τ) = Σ a[j]·seg[j+τ]：FFT 互相關
    aRe.fill(0); aIm.fill(0); sRe.fill(0); sIm.fill(0);
    for (let i = 0; i < W; i++) aRe[i] = seg[i];
    for (let i = 0; i < L; i++) sRe[i] = seg[i];
    fft(aRe, aIm, false); fft(sRe, sIm, false);
    for (let i = 0; i < nfft; i++) {   // conj(A)·S
      const r = aRe[i] * sRe[i] + aIm[i] * sIm[i], im = aRe[i] * sIm[i] - aIm[i] * sRe[i];
      aRe[i] = r; aIm[i] = im;
    }
    fft(aRe, aIm, true);
    d[0] = 0; cm[0] = 1;
    let cum = 0;
    for (let t = 1; t < tmax; t++) {
      d[t] = e0 + (cs[t + W] - cs[t]) - 2 * aRe[t];
      cum += d[t];
      cm[t] = cum > 1e-12 ? d[t] * t / cum : 1;
    }
    const out = [];
    for (let t = tmin + 1; t < tmax - 2; t++) {
      if (cm[t] < cm[t - 1] && cm[t] <= cm[t + 1] && cm[t] < 0.6) {
        const A = cm[t - 1], B = cm[t], C = cm[t + 1], den = A - 2 * B + C;
        out.push([t + (Math.abs(den) > 1e-12 ? 0.5 * (A - C) / den : 0), B]);
      }
    }
    if (!out.length) { cands[f] = []; continue; }
    const at = tt => {
      const k = Math.round(tt);
      if (k < 2 || k >= tmax - 1) return null;
      let m = Infinity; for (let q = Math.max(1, k - 2); q <= Math.min(tmax - 2, k + 2); q++) if (cm[q] < m) m = cm[q];
      return m;
    };
    for (const z of out) {
      let s = z[1], c = 1;
      for (const mlt of [2, 3]) { const v = at(z[0] * mlt); if (v !== null) { s += v; c++; } }
      z[1] = s / c;
    }
    out.sort((a, b) => a[0] - b[0]);
    const keep = [];
    for (const z of out) {
      if (keep.some(k => { const r = z[0] / k[0], rr = Math.round(r); return rr >= 2 && Math.abs(r - rr) < 0.03 && k[1] < z[1] + 0.03; })) continue;
      keep.push(z);
    }
    keep.sort((a, b) => a[1] - b[1]);
    cands[f] = keep.slice(0, 4);
    if (onProgress && f % 400 === 0) onProgress(f / nfr);
  }
  return cands;
}

function viterbi(cands) {
  const nfr = cands.length, UNV = 0.42;
  const states = cands.map(cs => [[0, UNV], ...cs]);
  let cost = states[0].map(s => s[1]);
  const back = new Array(nfr);
  for (let i = 1; i < nfr; i++) {
    const prev = states[i - 1], cur = states[i], nc = new Float64Array(cur.length), bk = new Int8Array(cur.length);
    for (let j = 0; j < cur.length; j++) {
      const tj = cur[j][0];
      let best = 1e9, bi = 0;
      for (let k = 0; k < prev.length; k++) {
        const tk = prev[k][0];
        let tr;
        if (!tj || !tk) tr = (!tj) !== (!tk) ? 0.15 : 0;
        else { const cents = Math.abs(1200 * Math.log2(tj / tk)); tr = (cents / 100) ** 2 * 0.02 + (cents > 700 ? 2 : 0); }
        const v = cost[k] + tr;
        if (v < best) { best = v; bi = k; }
      }
      nc[j] = best + cur[j][1]; bk[j] = bi;
    }
    cost = nc; back[i] = bk;
  }
  let j = 0; for (let k = 1; k < cost.length; k++) if (cost[k] < cost[j]) j = k;
  const T = new Float64Array(nfr);
  for (let i = nfr - 1; i >= 0; i--) { T[i] = states[i][j][0]; if (i > 0) j = back[i][j]; }
  const voiced = new Uint8Array(nfr); for (let i = 0; i < nfr; i++) voiced[i] = T[i] > 0 ? 1 : 0;
  const runs = () => { const r = []; let i = 0; while (i < nfr) { let k = i; while (k < nfr && voiced[k] === voiced[i]) k++; r.push([i, k, voiced[i]]); i = k; } return r; };
  for (const [a, b, v] of runs()) if (v && (b - a) * FR < 0.04) for (let i = a; i < b; i++) voiced[i] = 0;
  for (const [a, b, v] of runs()) if (!v && a > 0 && b < nfr && (b - a) * FR < 0.025) {
    for (let i = a; i < b; i++) { voiced[i] = 1; T[i] = T[a - 1] + (T[b] - T[a - 1]) * (i - a + 1) / (b - a + 1); }
  }
  for (let i = 0; i < nfr; i++) if (!voiced[i]) T[i] = 0;
  return { T, voiced };
}

// 主唱分析（可以快取：同一段錄音換設定時不必重算）
export function analyzeLead(x, sr, opts = {}, onProgress) {
  const fmin = opts.fmin || 70, fmax = opts.fmax || 1000, hop = Math.round(FR * sr);
  const cands = yinCandidates(x, sr, fmin, fmax, hop, p => onProgress && onProgress(p * 0.85));
  const { T, voiced } = viterbi(cands);
  const nfr = T.length, midi = new Float32Array(nfr);
  for (let i = 0; i < nfr; i++) midi[i] = voiced[i] ? 69 + 12 * Math.log2(sr / T[i] / 440) : 0;
  // 音高標記
  const lp = lowpass(x, sr, 900), n = x.length, Pu = 0.005 * sr;
  const marks = [], periods = [];
  let t = 0;
  while (t < n - 1) {
    const fi = Math.min(nfr - 1, Math.floor(t / hop));
    if (voiced[fi]) {
      const P = sr / (440 * Math.pow(2, (midi[fi] - 69) / 12));
      const a = Math.max(0, Math.floor(t - 0.2 * P)), b = Math.min(n, Math.floor(t + 0.2 * P + 1));
      let tt = t;
      if (b > a + 2) { let bi = a, bv = -Infinity; for (let k = a; k < b; k++) if (lp[k] > bv) { bv = lp[k]; bi = k; } tt = bi; }
      if (marks.length && tt <= marks[marks.length - 1] + 0.5 * P) tt = marks[marks.length - 1] + P;
      marks.push(tt); periods.push(P); t = tt + P;
    } else { marks.push(t); periods.push(Pu); t += Pu; }
  }
  onProgress && onProgress(1);
  return { sr, hop, midi, voiced, marks: Float64Array.from(marks), periods: Float32Array.from(periods), n };
}

// ---------------- 3) 主唱音符 ----------------
const okMask = (mask, k) => (mask >> (((k % 12) + 12) % 12)) & 1;
function segmentNotes(A, maskAt, hyst = 0.35, minLen = 0.06) {
  const { midi, voiced } = A, nfr = midi.length, k = Math.max(1, Math.round(0.08 / FR));
  const sm = new Float32Array(nfr), note = new Int16Array(nfr), buf = [];
  for (let i = 0; i < nfr; i++) {
    if (!voiced[i]) continue;
    buf.length = 0;
    for (let j = Math.max(0, i - k); j < Math.min(nfr, i + k + 1); j++) if (voiced[j]) buf.push(midi[j]);
    buf.sort((a, b) => a - b); sm[i] = buf[buf.length >> 1];
  }
  let cur = 0;
  for (let i = 0; i < nfr; i++) {
    if (!voiced[i]) { cur = 0; continue; }
    const mask = maskAt(i), m = sm[i];
    let s = Math.round(m), bd = 99;
    if (mask) for (let p = Math.floor(m) - 7; p <= Math.ceil(m) + 7; p++) if (okMask(mask, p) && Math.abs(p - m) < bd) { bd = Math.abs(p - m); s = p; }
    if (cur && s !== cur && Math.abs(m - cur) - Math.abs(m - s) < hyst) s = cur;
    cur = s; note[i] = s;
  }
  for (let i = 0; i < nfr;) {
    if (!note[i]) { i++; continue; }
    let j = i; while (j < nfr && note[j] === note[i]) j++;
    if ((j - i) * FR < minLen && j < nfr && note[j]) for (let q = i; q < j; q++) note[q] = note[j];
    i = j;
  }
  return { note, sm };
}

function stepScale(q, n, mask) {
  if (!mask) return q + Math.round(n * 12 / 7);
  let k = q, left = Math.abs(n), d = n > 0 ? 1 : -1, g = 0;
  while (left > 0 && g++ < 40) { k += d; if (okMask(mask, k)) left--; }
  return k;
}
function chordTone(q, n, pcs) {
  const nom = n * 12 / 7, d = n > 0 ? 1 : -1;
  let best = q + Math.round(nom), bd = 99;
  for (let s = 1; s <= 14; s++) { const k = q + d * s; if (!okMask(pcs, k)) continue; if (Math.abs(s - Math.abs(nom)) < bd) { bd = Math.abs(s - Math.abs(nom)); best = k; } }
  return best;
}
function targetNote(q, n, mask, pcs) {
  if (n === 0) return q;
  if (Math.abs(n) === 7) return q + (n > 0 ? 12 : -12);
  if (Math.abs(n) === 14) return q + (n > 0 ? 24 : -24);
  return pcs ? chordTone(q, n, pcs) : stepScale(q, n, mask);
}
const find = (list, pos) => { if (!list) return null; for (const x of list) if (pos >= x.s && pos < x.e) return x; return null; };
function curveAt(pts, pos) {
  if (!pts || !pts.length) return 1;
  if (pos <= pts[0].s) return pts[0].v;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (pos <= b.s) return b.s > a.s ? a.v + (b.v - a.v) * (pos - a.s) / (b.s - a.s) : b.v; }
  return pts[pts.length - 1].v;
}

// ---------------- 5) TD-PSOLA ----------------
function psola(x, A, tgt, gainAt, delay = 0) {
  const { sr, hop, voiced, marks, periods } = A, n = x.length, nfr = voiced.length;
  const y = new Float32Array(n), ws = new Float32Array(n);
  if (!marks.length) return y;
  const frame = t => Math.min(nfr - 1, Math.max(0, Math.floor(t / hop)));
  let ts = marks[0], j = 0;
  const grab = (m, k) => { const p = m + k, i = Math.floor(p), f = p - i; if (i < 0 || i >= n - 1) return 0; return x[i] + (x[i + 1] - x[i]) * f; };
  while (ts < n - 1) {
    const fi = frame(ts), v = voiced[fi] && tgt[fi] > 0;
    while (j < marks.length - 2 && marks[j + 1] <= ts) j++;
    const m0 = marks[j], m1 = marks[j + 1];
    const frac = m1 > m0 ? Math.min(1, Math.max(0, (ts - m0) / (m1 - m0))) : 0;
    const Pa = periods[j] * (1 - frac) + periods[j + 1] * frac;
    const Ps = v ? sr / (440 * Math.pow(2, (tgt[fi] - 69) / 12)) : Pa;
    const g = (v ? 1 : 0.18) * gainAt(fi);
    const H = Math.floor(Math.min(Pa, 0.02 * sr));
    const o = Math.round(ts) + delay;
    for (let k = -H; k <= H; k++) {
      const oi = o + k; if (oi < 0 || oi >= n) continue;
      const w = 0.5 + 0.5 * Math.cos(Math.PI * k / (H + 1));
      const s = v ? grab(m0, k) * (1 - frac) + grab(m1, k) * frac : grab(ts, k);
      y[oi] += g * w * s; ws[oi] += w;
    }
    ts += v ? Ps : Pa;
  }
  for (let i = 0; i < n; i++) y[i] /= Math.sqrt(Math.max(ws[i], 1));
  return y;
}

/**
 * 算一段主唱的和聲。
 * chans：主唱的聲道（Float32Array[]，會先混成單聲道）；sr：取樣率
 * cfg：harmConfig() 的結果（秒、線性）；opts：{ voices: [0,1,…], t0: 這段音訊第 0 個樣本的專案秒數, analysis?: 快取, vibKeep: 0~1 }
 * 回傳 { voices: { [v]: [L, R] }, analysis }
 */
export function renderHarmony(chans, sr, cfg, opts = {}, onProgress) {
  const n = chans[0].length, x = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) x[i] += c[i] / chans.length;
  const A = opts.analysis || analyzeLead(x, sr, { fmin: cfg.fmin, fmax: cfg.fmax }, p => onProgress && onProgress(p * 0.6));
  const nfr = A.midi.length, t0 = opts.t0 || 0, posOf = i => t0 + i * FR;
  const vibKeep = opts.vibKeep ?? 1, tight = cfg.tight ?? 1;
  const chordAt = i => (cfg.source === 1 ? find(cfg.chords, posOf(i)) : null);
  const { note, sm } = segmentNotes(A, i => { const c = chordAt(i); return c ? 0 : cfg.mask; });
  const out = {};
  const list = opts.voices || cfg.voices.map((v, i) => i).filter(i => cfg.voices[i].on);
  list.forEach((v, vi) => {
    const vc = cfg.voices[v];
    const tgt = new Float32Array(nfr), gain = new Float32Array(nfr);
    const hum = cfg.humanize || 0;
    const cents = [4, -5, 7, -3][v] * hum / 100, rate = [0.23, 0.31, 0.17, 0.27][v];
    for (let i = 0; i < nfr; i++) {
      const pos = posOf(i);
      let nn = null;
      if (cfg.secMode) { const s = find(cfg.sections, pos); nn = s ? s.iv[v] : null; } else if (vc.on) nn = vc.n;
      gain[i] = nn === null || nn === undefined ? 0 : vc.g * curveAt(cfg.curves[v], pos);
      if (!A.voiced[i] || !note[i] || nn === null || nn === undefined) continue;
      const ch = chordAt(i);
      const h = targetNote(note[i], nn, ch ? 0 : cfg.mask, ch ? ch.pcs : 0);
      const devVib = A.midi[i] - sm[i], devTune = sm[i] - note[i];
      const drift = hum * 0.05 * Math.sin(2 * Math.PI * rate * pos + v * 1.7) + cents;
      tgt[i] = h + vibKeep * devVib + (1 - tight) * devTune + drift;
    }
    // 換音：主唱在兩個音之間滑過去時，和聲跟著「平行」滑（音程不變），不是等主唱到了才跳過去。
    // 音程曲線 = 和聲音 − 主唱音，平滑 glide 毫秒；滑音中（主唱離音符中心超過半音、或換音前後 60 ms）用 主唱實際音高 + 音程
    const glide = Math.max(0.005, (cfg.glide ?? 30) / 1000);
    const iv = new Float32Array(nfr), slide = new Uint8Array(nfr);
    for (let i = 0; i < nfr; i++) if (tgt[i]) iv[i] = tgt[i] - vibKeep * (A.midi[i] - sm[i]) - (1 - tight) * (sm[i] - note[i]) - note[i];
    {
      const a = 1 - Math.exp(-FR / glide);
      let prev = null;
      for (let i = 0; i < nfr; i++) { if (!tgt[i]) { prev = null; continue; } prev = prev === null ? iv[i] : prev + (iv[i] - prev) * a; iv[i] = prev; }
      const W = Math.round(0.06 / FR);
      for (let i = 1; i < nfr; i++) if (note[i] && note[i - 1] && note[i] !== note[i - 1]) for (let q = Math.max(0, i - W); q < Math.min(nfr, i + W); q++) slide[q] = 1;
      for (let i = 0; i < nfr; i++) if (tgt[i] && Math.abs(A.midi[i] - note[i]) > 0.6) slide[i] = 1;
    }
    for (let i = 0; i < nfr; i++) {
      if (!tgt[i]) continue;
      tgt[i] = slide[i] ? A.midi[i] + iv[i] : note[i] + iv[i] + vibKeep * (A.midi[i] - sm[i]) + (1 - tight) * (sm[i] - note[i]);
    }
    // 音量平滑（段落與曲線切換不要爆音）
    for (let i = 1; i < nfr; i++) gain[i] = gain[i - 1] + (gain[i] - gain[i - 1]) * 0.35;
    const delay = Math.round(hum * [9, 15, 21, 12][v] * 0.001 * sr);
    // 先以「有唱的地方 = 1」算出和聲，對齊主唱音量後，再乘上聲部音量／段落／曲線
    const sing = i => (gain[i] > 1e-4 ? 1 : 0);
    let y = psola(x, A, tgt, sing, delay);
    let eY = 0, eX = 0;
    for (let i = 0; i < n; i += 2) {
      const fi = Math.min(nfr - 1, Math.floor(i / A.hop));
      if (!A.voiced[fi] || !tgt[fi]) continue;
      eY += y[i] * y[i]; eX += x[i] * x[i];
    }
    const k = eY > 1e-9 ? Math.min(4, Math.sqrt(eX / eY)) : 1;
    for (let i = 0; i < n; i++) { const fi = Math.min(nfr - 1, Math.floor(i / A.hop)); y[i] *= k * gain[fi]; }
    // 聲像（等功率）
    const pan = Math.max(-1, Math.min(1, (vc.pan || 0) * (cfg.width ?? 0.7))), ang = (pan + 1) * Math.PI / 4;
    const L = new Float32Array(n), R = new Float32Array(n), gl = Math.cos(ang), gr = Math.sin(ang);
    for (let i = 0; i < n; i++) { L[i] = y[i] * gl; R[i] = y[i] * gr; }
    out[v] = [L, R];
    onProgress && onProgress(0.6 + 0.4 * (vi + 1) / list.length);
  });
  return { voices: out, analysis: A };
}
