// 升降音（Pitch Shift）AudioWorklet：長度不變、只改音高
// 方法：雙讀取頭的延遲線（delay-line / granular）
//   寫入頭照常前進；兩個讀取頭以 ratio 倍速讀取，彼此相差半個視窗，
//   每個讀取頭在視窗邊界跳回時用 Hann 交叉淡入淡出，接縫聽不到喀啦聲。
//   ratio = 2^(半音/12)；>1 升調、<1 降調。
// 延遲約 = 視窗長度（預設 60 ms）。
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'semitones', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'cents', defaultValue: 0, minValue: -100, maxValue: 100, automationRate: 'k-rate' },
      { name: 'window', defaultValue: 0.06, minValue: 0.02, maxValue: 0.2, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.size = 1 << 15;            // 環形緩衝 32768（@48k ≈ 0.68 秒，夠 200 ms 視窗 × 2 倍速）
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    this.phase = 0;                 // 0..1，第一個讀取頭在視窗中的位置
  }
  read(b, pos) {
    const n = this.size;
    let i = Math.floor(pos); const f = pos - i;
    i = ((i % n) + n) % n;
    return b[i] + (b[(i + 1) % n] - b[i]) * f;   // 線性內插
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const nCh = out.length, len = out[0].length;
    const ratio = Math.pow(2, (params.semitones[0] + params.cents[0] / 100) / 12);
    const win = Math.max(64, Math.round(params.window[0] * sampleRate));
    // 不移調：直接通過（省 CPU，也不會有延遲線的音色變化）——但要保持同樣的延遲，切換時才不會跳
    const bypass = Math.abs(ratio - 1) < 1e-6;
    // 讀取頭相對寫入頭的延遲：ratio>1 讀得比寫得快，延遲從 win 往 0 縮；ratio<1 從 0 往 win 長
    const step = (1 - ratio) / win;   // 每個樣本 phase 前進量
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        const x = inp[c] ? inp[c][i] : (inp[0] ? inp[0][i] : 0);
        this.buf[Math.min(c, 1)][this.w] = x;
      }
      let p1 = this.phase, p2 = (this.phase + 0.5) % 1;
      // phase 0..1 對應延遲 0..win；Hann 權重讓兩個讀取頭的和恆為 1
      const g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p1), g2 = 1 - g1;
      const d1 = p1 * win, d2 = p2 * win;
      for (let c = 0; c < nCh; c++) {
        const b = this.buf[Math.min(c, 1)];
        if (bypass) { out[c][i] = this.read(b, this.w - win / 2); continue; }
        out[c][i] = this.read(b, this.w - d1) * g1 + this.read(b, this.w - d2) * g2;
      }
      this.w = (this.w + 1) % this.size;
      this.phase += step;
      this.phase -= Math.floor(this.phase);
    }
    return true;
  }
}
registerProcessor('zy-pitch', PitchShift);
