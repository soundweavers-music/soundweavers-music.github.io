// 響度量測：ITU-R BS.1770-4 / EBU R128
//  - K-weighting：高架濾波（+4 dB @ 1.5 kHz 以上）＋ RLB 高通（約 38 Hz）
//  - Momentary（400 ms）、Short-term（3 s）、Integrated（含 -70 LUFS 絕對門檻與 -10 LU 相對門檻）
//  - True Peak：4 倍超取樣（48 tap 多相 FIR）
//  - LRA（響度範圍）：short-term 的 10%~95% 百分位差
// 離線分析整首用 analyze()；即時表用 LoudnessMeter（AudioWorklet 以外的主執行緒版本，吃 Analyser 資料）。

// 依取樣率算出 K-weighting 兩段 biquad 係數（BS.1770 附錄給的是 48 kHz 係數，這裡用原始類比原型重新推導）
export function kWeightCoeffs(fs) {
  // 第一段：高架（pre-filter）
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = {
    b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
  };
  // 第二段：RLB 高通
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q1 + K * K;
  const s2 = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q1 + K * K) / a0] };
  return [s1, s2];
}

function biquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// 4 倍超取樣 true peak：windowed-sinc 低通 FIR，多相實作
const TP_TAPS = 48;
let tpPhases = null;
function tpFilter() {
  if (tpPhases) return tpPhases;
  const L = 4, N = TP_TAPS * L;
  const h = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const m = n - (N - 1) / 2;
    const sinc = m === 0 ? 1 : Math.sin(Math.PI * m / L) / (Math.PI * m / L);
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * n / (N - 1));   // Blackman
    h[n] = sinc * w;
  }
  tpPhases = [];
  for (let p = 0; p < L; p++) { const ph = new Float64Array(TP_TAPS); for (let k = 0; k < TP_TAPS; k++) ph[k] = h[k * L + p]; tpPhases.push(ph); }
  return tpPhases;
}

export function truePeak(ch) {
  const ph = tpFilter();
  let peak = 0;
  for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
  // 只在接近峰值的區段做超取樣，速度快很多（取樣點峰值 < 0.5 倍時，intersample 峰值不可能超過現有峰值）
  const thr = peak * 0.5;
  for (let i = TP_TAPS; i < ch.length; i++) {
    if (Math.abs(ch[i]) < thr && Math.abs(ch[i - 1]) < thr) continue;
    for (let p = 1; p < 4; p++) {
      const f = ph[p];
      let s = 0;
      for (let k = 0; k < TP_TAPS; k++) s += f[k] * ch[i - k];
      const v = Math.abs(s);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

const lufs = ms => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));

// 整首分析。buffer：AudioBuffer（1 或 2 聲道）
export function analyze(buffer) {
  const fs = buffer.sampleRate;
  const [s1, s2] = kWeightCoeffs(fs);
  const chans = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chans.push(biquad(biquad(buffer.getChannelData(c), s1), s2));
  // 單聲道視為兩個聲道都有（BS.1770 的聲道權重 L=R=1）
  const nCh = chans.length;
  const block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const msBlocks = [];
  for (let st = 0; st + block <= buffer.length; st += hop) {
    let sum = 0;
    for (const ch of chans) { let s = 0; for (let i = st; i < st + block; i++) s += ch[i] * ch[i]; sum += s / block; }
    if (nCh === 1) sum *= 2;
    msBlocks.push(sum);
  }
  // Integrated
  const abs = msBlocks.filter(m => lufs(m) > -70);
  let integrated = -Infinity;
  if (abs.length) {
    const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const gated = abs.filter(m => lufs(m) > rel);
    if (gated.length) integrated = lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }
  // Short-term（3 s 視窗，每 100 ms）→ LRA
  const stBlock = Math.round(3 * fs);
  const st = [];
  // 用前綴和加速
  const pre = chans.map(ch => { const p = new Float64Array(ch.length + 1); for (let i = 0; i < ch.length; i++) p[i + 1] = p[i] + ch[i] * ch[i]; return p; });
  for (let s = 0; s + stBlock <= buffer.length; s += hop) {
    let sum = 0;
    for (const p of pre) sum += (p[s + stBlock] - p[s]) / stBlock;
    if (nCh === 1) sum *= 2;
    st.push(lufs(sum));
  }
  let lra = 0, maxST = -Infinity;
  const stAbs = st.filter(v => v > -70);
  if (stAbs.length) {
    maxST = Math.max(...stAbs);
    const relG = lufs(stAbs.map(v => Math.pow(10, (v + 0.691) / 10)).reduce((a, b) => a + b, 0) / stAbs.length) - 20;
    const g = stAbs.filter(v => v > relG).sort((a, b) => a - b);
    if (g.length > 1) lra = g[Math.floor(g.length * 0.95) - 1 >= 0 ? Math.floor(g.length * 0.95) - 1 : 0] - g[Math.floor(g.length * 0.1)];
  }
  const maxM = msBlocks.length ? Math.max(...msBlocks.map(lufs)) : -Infinity;
  let tp = 0, sp = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    tp = Math.max(tp, truePeak(d));
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > sp) sp = v; }
  }
  const db = v => 20 * Math.log10(Math.max(v, 1e-9));
  return { integrated, lra: Math.max(0, lra), maxMomentary: maxM, maxShortTerm: maxST, truePeakDb: db(tp), samplePeakDb: db(sp) };
}

// ---------------- 即時響度表 ----------------
// 用一個 ScriptProcessor 替代品：在 master 後面接 AudioWorklet 會更準，但為了相容與簡單，
// 這裡以 AnalyserNode 每幀取 time-domain 資料，自己做 K-weighting（濾波器狀態跨幀保留）。
// fftSize 取 2048、每幀約 16 ms，會漏掉部分樣本；Momentary/Short-term 是滑動平均，影響很小。
// 準確數值（給輸出用）一律以 analyze() 的離線結果為準。
export class LiveLoudness {
  constructor(ctx, aL, aR) {
    this.ctx = ctx; this.aL = aL; this.aR = aR;
    const [s1, s2] = kWeightCoeffs(ctx.sampleRate);
    this.f = [s1, s2];
    this.st = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
    this.bufL = new Float32Array(aL.fftSize); this.bufR = new Float32Array(aR.fftSize);
    this.hist = [];      // [{ t, ms }]：每幀的均方
    this.intSum = 0; this.intN = 0; this.blocks = [];
    this.lastT = 0;
  }
  reset() { this.hist = []; this.blocks = []; this.st = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]; this.lastBlockT = 0; }
  _filt(x, s) {
    const [f1, f2] = this.f;
    let [x1, x2, y1, y2, u1, u2, z1, z2] = s;
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      const v = f1.b[0] * x[i] + f1.b[1] * x1 + f1.b[2] * x2 - f1.a[1] * y1 - f1.a[2] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      const w = f2.b[0] * v + f2.b[1] * u1 + f2.b[2] * u2 - f2.a[1] * z1 - f2.a[2] * z2;
      u2 = u1; u1 = v; z2 = z1; z1 = w;
      sum += w * w;
    }
    s.splice(0, 8, x1, x2, y1, y2, u1, u2, z1, z2);
    return sum / x.length;
  }
  // 每幀呼叫一次；回傳 { m, s, i }（LUFS）
  tick(active) {
    const now = this.ctx.currentTime;
    if (!active) return this.read(now);
    this.aL.getFloatTimeDomainData(this.bufL);
    this.aR.getFloatTimeDomainData(this.bufR);
    const ms = this._filt(this.bufL, this.st[0]) + this._filt(this.bufR, this.st[1]);
    this.hist.push({ t: now, ms });
    while (this.hist.length && this.hist[0].t < now - 3) this.hist.shift();
    // 每 100ms 收一個 400ms 區塊，算 integrated
    if (!this.lastBlockT || now - this.lastBlockT >= 0.1) {
      this.lastBlockT = now;
      const m = this._avg(now, 0.4);
      if (m > 0) this.blocks.push(m);
    }
    return this.read(now);
  }
  _avg(now, win) {
    let s = 0, n = 0;
    for (const h of this.hist) if (h.t >= now - win) { s += h.ms; n++; }
    return n ? s / n : 0;
  }
  read(now = this.ctx.currentTime) {
    const abs = this.blocks.filter(m => lufs(m) > -70);
    let i = -Infinity;
    if (abs.length) {
      const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
      const g = abs.filter(m => lufs(m) > rel);
      if (g.length) i = lufs(g.reduce((a, b) => a + b, 0) / g.length);
    }
    const m = this._avg(now, 0.4), s = this._avg(now, 3);
    return { m: m > 0 ? lufs(m) : -Infinity, s: s > 0 ? lufs(s) : -Infinity, i };
  }
}

export const TARGETS = [
  { id: 'stream', name: '串流平台（Spotify / YouTube）', lufs: -14, tp: -1 },
  { id: 'apple', name: 'Apple Music', lufs: -16, tp: -1 },
  { id: 'podcast', name: 'Podcast／人聲節目', lufs: -16, tp: -1.5 },
  { id: 'loud', name: 'CD／俱樂部（大聲）', lufs: -9, tp: -0.3 },
  { id: 'broadcast', name: '廣播電視（EBU R128）', lufs: -23, tp: -1 },
];
