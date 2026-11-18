// 錄音用 AudioWorklet：把輸入的 PCM 以 4096 sample 一批送回主執行緒
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.size = 4096;
    this.reset(2);
    this.startAt = Infinity;
    this.port.onmessage = e => {
      // { start: ctx 秒數 }：到那一刻才開始收音，第一個 block 從精確的 sample 切入
      if (e.data && typeof e.data.start === 'number') { this.startAt = e.data.start; this.on = false; }
      else if (e.data === 'stop') { this.flush(); this.on = false; this.startAt = Infinity; this.port.postMessage({ done: true }); }
    };
  }
  reset(n) {
    this.nCh = n;
    this.bufs = Array.from({ length: n }, () => new Float32Array(this.size));
    this.fill = 0;
  }
  flush() {
    if (!this.fill) return;
    this.port.postMessage({ chunk: this.bufs.map(b => b.slice(0, this.fill)) });
    this.reset(this.nCh);
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const n = inp[0].length;
    let i = 0;
    if (!this.on) {
      // currentTime / sampleRate 是 AudioWorkletGlobalScope 的全域變數
      const blockEnd = currentTime + n / sampleRate;
      if (blockEnd <= this.startAt) return true;
      this.on = true;
      i = Math.max(0, Math.min(n, Math.round((this.startAt - currentTime) * sampleRate)));
    }
    if (inp.length !== this.nCh) { this.flush(); this.reset(inp.length); }
    while (i < n) {
      const k = Math.min(n - i, this.size - this.fill);
      for (let c = 0; c < this.nCh; c++) this.bufs[c].set(inp[c].subarray(i, i + k), this.fill);
      this.fill += k; i += k;
      if (this.fill === this.size) this.flush();
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
