// 人聲／伴奏分離（簡易版，Web Worker）
// 原理：主唱通常混在正中央（左右聲道幾乎相同）、伴奏分布在左右。
//   對每個 STFT 時頻格計算「中央度」：|L+R|² 相對於 |L|²+|R|² 的比例，以及左右的相位一致性。
//   中央度高、又落在人聲頻率範圍（約 100 Hz–8 kHz）的格子歸給人聲，其餘歸給伴奏。
//   遮罩用軟性（0..1）並在時間與頻率上平滑，減少「水聲」雜訊；人聲＋伴奏 ≈ 原曲（重建誤差很小）。
// 限制：低頻（貝斯、大鼓）也常在中央，所以 120 Hz 以下一律歸伴奏；單聲道錄音無法分離。

// ---- radix-2 FFT（原地，實數輸入用複數陣列）----
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

self.onmessage = e => {
  const { L, R, sr, strength = 0.5, lowCut = 120, highCut = 8000 } = e.data;
  const N = 4096, H = 1024;                 // 窗長 ~85 ms @48k，75% 重疊
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);   // Hann
  // Hann 75% 重疊、分析與合成都乘窗 → 合成時要除以 Σwin²（= 1.5）
  const norm = 1 / 1.5;
  const len = L.length;
  const frames = Math.ceil((len + N) / H);
  const outV = [new Float32Array(len + N * 2), new Float32Array(len + N * 2)];
  const half = N / 2 + 1;
  const binHz = sr / N;
  // 頻率權重：人聲範圍內為 1，邊界用 1/3 八度平滑過渡
  const fw = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    const f = k * binHz;
    const lo = f <= 0 ? 0 : Math.min(1, Math.max(0, Math.log2(f / lowCut) * 3 + 0.5));
    const hi = Math.min(1, Math.max(0, Math.log2(highCut / Math.max(1, f)) * 3 + 0.5));
    fw[k] = lo * hi;
  }
  // 時間平滑：上一幀的遮罩
  let prevMask = new Float32Array(half);
  const lr = new Float32Array(N), li = new Float32Array(N), rr = new Float32Array(N), ri = new Float32Array(N);
  const mask = new Float32Array(half);
  // strength 0..1 → 中央度門檻（越強越嚴格只留很正中央的聲音）的指數
  const exp = 1 + strength * 5;
  let lastReport = 0;
  for (let f = 0; f < frames; f++) {
    const start = f * H - N;      // 前面補 N 個 0，讓第一個樣本也被完整重疊覆蓋
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      const w = win[i];
      lr[i] = idx >= 0 && idx < len ? L[idx] * w : 0; li[i] = 0;
      rr[i] = idx >= 0 && idx < len ? R[idx] * w : 0; ri[i] = 0;
    }
    fft(lr, li, false); fft(rr, ri, false);
    for (let k = 0; k < half; k++) {
      const a = lr[k], b = li[k], c = rr[k], d = ri[k];
      const pL = a * a + b * b, pR = c * c + d * d;
      const sr2 = (a + c) * (a + c) + (b + d) * (b + d);       // |L+R|²
      const tot = 2 * (pL + pR) + 1e-20;
      // 中央度：L、R 完全相同時 = 1；完全反相或只在一邊時趨近 0 / 0.5
      let cen = sr2 / tot;
      // 0.5（只在一邊）以下視為完全不是中央
      cen = Math.max(0, (cen - 0.5) * 2);
      let m = Math.pow(cen, exp) * fw[k];
      // 時間平滑（attack 快、release 慢一點），減少閃爍
      const p = prevMask[k];
      m = m > p ? p * 0.3 + m * 0.7 : p * 0.6 + m * 0.4;
      mask[k] = m;
    }
    // 頻率方向平滑（3 點）
    for (let k = 1; k < half - 1; k++) prevMask[k] = (mask[k - 1] + 2 * mask[k] + mask[k + 1]) / 4;
    prevMask[0] = mask[0]; prevMask[half - 1] = mask[half - 1];
    // 人聲 = 遮罩 × 中央訊號（(L+R)/2 放到兩邊）；伴奏 = 原曲 − 人聲，保證兩者相加等於原曲
    const vr = new Float32Array(N), vi = new Float32Array(N);
    for (let k = 0; k < half; k++) {
      const m = prevMask[k];
      vr[k] = (lr[k] + rr[k]) * 0.5 * m; vi[k] = (li[k] + ri[k]) * 0.5 * m;
      if (k > 0 && k < N / 2) { vr[N - k] = vr[k]; vi[N - k] = -vi[k]; }
    }
    fft(vr, vi, true);
    const base = start + N;   // 輸出陣列有 N 的前置位移
    for (let i = 0; i < N; i++) {
      const w = win[i] * norm;
      const v = vr[i] * w;
      outV[0][base + i] += v; outV[1][base + i] += v;
    }
    if (f - lastReport >= 40) { lastReport = f; self.postMessage({ progress: f / frames }); }
  }
  // 裁切回原長度，伴奏 = 原曲 − 人聲（逐樣本，沒有額外的 STFT 誤差）
  const V0 = outV[0].subarray(N, N + len), V1 = outV[1].subarray(N, N + len);
  const vL = new Float32Array(V0), vR = new Float32Array(V1);
  const aL = new Float32Array(len), aR = new Float32Array(len);
  for (let i = 0; i < len; i++) { aL[i] = L[i] - vL[i]; aR[i] = R[i] - vR[i]; }
  self.postMessage({ done: true, vocal: [vL, vR], inst: [aL, aR] }, [vL.buffer, vR.buffer, aL.buffer, aR.buffer]);
};
