// 母帶 Limiter（AudioWorklet）
//  - Look-ahead 延遲 5 ms：增益在峰值到達「之前」就降下來，不會削波
//  - 偵測端用 4 倍超取樣估計 intersample peak（true peak）
//  - 起音：look-ahead 時間內以「滑動最小值」平滑達到需要的衰減；釋放：指數回升（可調）
//  - 參數：gain（輸入增益 dB）、ceiling（輸出上限 dBTP）、release（ms）
class Limiter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gain', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'ceiling', defaultValue: -1, minValue: -12, maxValue: 0, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 120, minValue: 5, maxValue: 2000, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.la = Math.max(1, Math.round(sampleRate * 0.005));
    this.bufs = [new Float32Array(this.la), new Float32Array(this.la)];
    this.w = 0;
    this.env = 1;                     // 目前增益
    // 滑動視窗：最近 la 個樣本「需要的增益」的最小值（單調佇列）
    this.qv = new Float32Array(this.la * 2 + 8); this.qi = new Int32Array(this.la * 2 + 8);
    this.qh = 0; this.qt = 0; this.n = 0;
    // 平滑器：把階梯狀的目標增益在 la 時間內線性化
    this.smooth = 1;
    // 超取樣用的前幾個樣本
    this.hist = [new Float32Array(4), new Float32Array(4)];
    this.grMax = 0;
    this.port.onmessage = e => { if (e.data === 'gr') { this.port.postMessage({ gr: this.grMax }); this.grMax = 0; } };
    this.frames = 0;
  }
  // 4 點三次內插估計相鄰樣本之間的峰值（便宜的 true-peak 近似，誤差 < 0.3 dB）
  tp(h, x) {
    h[0] = h[1]; h[1] = h[2]; h[2] = h[3]; h[3] = x;
    let pk = Math.abs(h[2]);
    const y0 = h[0], y1 = h[1], y2 = h[2], y3 = h[3];
    for (const t of [0.25, 0.5, 0.75]) {
      const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
      const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
      const c = -0.5 * y0 + 0.5 * y2;
      const v = Math.abs(((a * t + b) * t + c) * t + y1);
      if (v > pk) pk = v;
    }
    return pk;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const nCh = out.length, len = out[0].length;
    const g = Math.pow(10, params.gain[0] / 20);
    const ceil = Math.pow(10, params.ceiling[0] / 20);
    const rel = Math.exp(-1 / (sampleRate * params.release[0] / 1000));
    const att = 1 / this.la;
    for (let i = 0; i < len; i++) {
      // 偵測：輸入 × gain 後的 true peak
      let pk = 0;
      for (let c = 0; c < Math.min(2, nCh); c++) {
        const x = (inp[c] ? inp[c][i] : (inp[0] ? inp[0][i] : 0)) * g;
        const v = this.tp(this.hist[c], x);
        if (v > pk) pk = v;
      }
      const need = pk > ceil ? ceil / pk : 1;
      // 單調佇列維持視窗最小值
      const idx = this.n++;
      while (this.qt > this.qh && this.qv[(this.qt - 1) % this.qv.length] >= need) this.qt--;
      this.qv[this.qt % this.qv.length] = need; this.qi[this.qt % this.qi.length] = idx; this.qt++;
      while (this.qi[this.qh % this.qi.length] <= idx - this.la) this.qh++;
      const target = this.qv[this.qh % this.qv.length];
      // 往下：在 look-ahead 時間內線性降到 target；往上：指數釋放
      if (target < this.smooth) this.smooth = Math.max(target, this.smooth - att);
      else this.smooth = target + (this.smooth - target) * rel;
      // 輸出延遲 la 個樣本的訊號
      const r = this.w;
      for (let c = 0; c < nCh; c++) {
        const x = (inp[c] ? inp[c][i] : (inp[0] ? inp[0][i] : 0)) * g;
        const b = this.bufs[Math.min(c, 1)];
        const delayed = b[r];
        b[r] = x;
        let y = delayed * this.smooth;
        // 安全網：硬性截斷（理論上不會觸發）
        if (y > ceil) y = ceil; else if (y < -ceil) y = -ceil;
        out[c][i] = y;
      }
      this.w = (r + 1) % this.la;
      const gr = -20 * Math.log10(this.smooth);
      if (gr > this.grMax) this.grMax = gr;
    }
    return true;
  }
}
registerProcessor('zy-limiter', Limiter);

// Stereo width（M/S）：width 0 = 單聲道、1 = 原樣、2 = 加寬
class Width extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'width', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' }]; }
  process(inputs, outputs, params) {
    const i = inputs[0], o = outputs[0];
    if (!o.length || !i.length) return true;
    const w = params.width[0];
    const L = i[0], R = i[1] || i[0];
    for (let k = 0; k < o[0].length; k++) {
      const m = (L[k] + R[k]) * 0.5, s = (L[k] - R[k]) * 0.5 * w;
      o[0][k] = m + s; if (o[1]) o[1][k] = m - s;
    }
    return true;
  }
}
registerProcessor('zy-width', Width);
