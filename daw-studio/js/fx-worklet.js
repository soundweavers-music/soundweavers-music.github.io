// 插入效果器的 AudioWorklet：噪音閘／向下擴展、瞬態塑形、位元破壞
//  - 這些效果需要「逐樣本」處理（包絡跟隨、取樣保持），用一般節點做不出來。
//  - 離線輸出（OfflineAudioContext）也會載入這個模組，所以輸出檔案與即時播放結果一致。
//  - 增益衰減量會回報給介面畫圖；離線時多送幾則訊息沒有影響。

// ────────────────────────────── 噪音閘 / 向下擴展 ──────────────────────────────
// 偵測：取左右聲道峰值的最大值 → 一階包絡跟隨（attack / release 各自一個時間常數）
// 判斷：envDb 低於門檻時，低幾 dB 就衰減「幾 dB × (1 − 1/ratio)」。
//       ratio = 20 當成硬閘（低 1 dB 就衰減 1 dB，最多衰減 range dB）。
class Gate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'ratio', defaultValue: 20, minValue: 1, maxValue: 20, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 1, minValue: 0.05, maxValue: 100, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 40, minValue: 0, maxValue: 500, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 120, minValue: 1, maxValue: 3000, automationRate: 'k-rate' },
      { name: 'range', defaultValue: 60, minValue: 0, maxValue: 120, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0;
    this.gainDb = 0;
    this.holdLeft = 0;
    this.grMax = 0;
    this.frames = 0;
  }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const nCh = out.length, len = out[0].length;
    const th = p.threshold[0], ratio = p.ratio[0], range = p.range[0];
    const kA = Math.exp(-1 / Math.max(1, sampleRate * p.attack[0] / 1000));
    const kR = Math.exp(-1 / Math.max(1, sampleRate * p.release[0] / 1000));
    const holdN = Math.round(p.hold[0] / 1000 * sampleRate);
    // ratio ≥ 19.5 視為硬閘；否則衰減比例 = 1 − 1/ratio
    const slope = ratio >= 19.5 ? 1 : 1 - 1 / ratio;
    for (let i = 0; i < len; i++) {
      let peak = 0;
      for (let c = 0; c < nCh; c++) {
        // 單聲道輸入時，第二聲道沿用第一聲道（不能當成 0，否則右邊會變靜音）
        const x = inp.length ? inp[Math.min(c, inp.length - 1)][i] : 0;
        const a = x < 0 ? -x : x;
        if (a > peak) peak = a;
      }
      this.env = peak > this.env
        ? kA * this.env + (1 - kA) * peak
        : kR * this.env + (1 - kR) * peak;
      const envDb = 20 * Math.log10(this.env + 1e-9);
      let targetDb = 0;
      if (envDb < th) {
        targetDb = Math.max(-range, (envDb - th) * slope);
      }
      // 保持：目標變高（要開）時重新計時；要關的時候先等 hold 結束
      if (targetDb > this.gainDb + 1e-6) {
        this.gainDb = targetDb;
        this.holdLeft = holdN;
      } else if (this.holdLeft > 0) {
        this.holdLeft--;
      } else {
        this.gainDb = targetDb;
      }
      const g = Math.pow(10, this.gainDb / 20);
      for (let c = 0; c < nCh; c++) {
        out[c][i] = (inp.length ? inp[Math.min(c, inp.length - 1)][i] : 0) * g;
      }
      const gr = -this.gainDb;
      if (gr > this.grMax) this.grMax = gr;
    }
    if ((this.frames++ & 7) === 0) { this.port.postMessage({ gr: this.grMax }); this.grMax = 0; }
    return true;
  }
}
registerProcessor('zy-gate', Gate);

// ────────────────────────────── 瞬態塑形 ──────────────────────────────
// 兩個包絡：快的（2 ms / 50 ms）與慢的（30 ms / 250 ms）。
// 起音瞬間 fast ≫ slow → t 接近 1，套用「起音」增益；穩定段 fast ≈ slow → t ≈ 0，套用「延音」增益。
class Transient extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack', defaultValue: 4, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'output', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.fast = 0; this.slow = 0;
    this.fkA = Math.exp(-1 / (sampleRate * 0.002)); this.fkR = Math.exp(-1 / (sampleRate * 0.050));
    this.skA = Math.exp(-1 / (sampleRate * 0.030)); this.skR = Math.exp(-1 / (sampleRate * 0.250));
  }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const nCh = out.length, len = out[0].length;
    const aDb = p.attack[0], sDb = p.sustain[0], oDb = p.output[0];
    for (let i = 0; i < len; i++) {
      let peak = 0;
      for (let c = 0; c < nCh; c++) {
        const x = inp.length ? inp[Math.min(c, inp.length - 1)][i] : 0;
        const a = x < 0 ? -x : x;
        if (a > peak) peak = a;
      }
      this.fast = peak > this.fast ? this.fkA * this.fast + (1 - this.fkA) * peak
        : this.fkR * this.fast + (1 - this.fkR) * peak;
      this.slow = peak > this.slow ? this.skA * this.slow + (1 - this.skA) * peak
        : this.skR * this.slow + (1 - this.skR) * peak;
      // t：0 = 穩定段、1 = 起音瞬間
      let t = (this.fast - this.slow) / (this.slow + 1e-3);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const gainDb = aDb * t + sDb * (1 - t) + oDb;
      const g = Math.pow(10, gainDb / 20);
      for (let c = 0; c < nCh; c++) out[c][i] = (inp.length ? inp[Math.min(c, inp.length - 1)][i] : 0) * g;
    }
    return true;
  }
}
registerProcessor('zy-transient', Transient);

// ────────────────────────────── 位元破壞 ──────────────────────────────
// bits：量化位元（2..16）；rate：取樣保持的取樣率（Hz）。
// 量化：step = 2 / (2^bits)，四捨五入回 step 的整數倍 → 偶數階梯（對稱、沒有直流偏移）。
class Bitcrush extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'rate', defaultValue: 12000, minValue: 500, maxValue: 48000, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.count = 0; this.held = [0, 0]; }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const nCh = out.length, len = out[0].length;
    const bits = Math.max(1, Math.min(16, p.bits[0]));
    // 幾位元 → 每邊 2^(bits−1) 階（0 dBFS 對應 1.0）
    const levels = Math.pow(2, bits - 1);
    const step = 1 / levels;
    const hold = Math.max(1, Math.round(sampleRate / Math.max(500, p.rate[0])));
    for (let i = 0; i < len; i++) {
      if (this.count <= 0) {
        for (let c = 0; c < nCh; c++) {
          const x = inp.length ? inp[Math.min(c, inp.length - 1)][i] : 0;
          const cl = x < -1 ? -1 : x > 1 ? 1 : x;
          this.held[c] = Math.round(cl / step) * step;
        }
        this.count = hold;
      }
      this.count--;
      for (let c = 0; c < nCh; c++) out[c][i] = this.held[c] ?? 0;
    }
    return true;
  }
}
registerProcessor('zy-bitcrush', Bitcrush);
