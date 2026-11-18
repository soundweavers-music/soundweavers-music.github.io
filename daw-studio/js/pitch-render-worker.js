// 片段升降音（離線、高品質）：WSOLA 時間伸縮 + 重新取樣
//   1) WSOLA 把音訊拉長 ratio 倍（音高不變）：每個 grain 都在「理想位置 ± 容許範圍」內，
//      找跟上一個 grain 自然延續最相似的波形起點，grain 之間相位對齊，沒有梳狀顫音。
//   2) 以 ratio 倍速重新取樣（4 點三次內插）→ 長度回到原本、音高變成 ratio 倍。
// 兩個聲道用同一組 grain 位置（以左右相加的訊號找相似度），立體聲像不會漂移。
self.onmessage = e => {
  const { chans, sr, semitones = 0, cents = 0 } = e.data;
  const ratio = Math.pow(2, (semitones + cents / 100) / 12);
  const n = chans[0].length;
  if (Math.abs(ratio - 1) < 1e-6) { self.postMessage({ done: true, chans: chans.map(c => c.slice()) }); return; }
  // grain 50 ms、容許 ±12 ms；大幅移調時 grain 稍微加大，低頻比較穩
  const G = Math.round(sr * (Math.abs(semitones) > 7 ? 0.06 : 0.05)), H = G >> 1, tol = Math.round(sr * 0.012);
  const win = new Float32Array(G);
  for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / G);
  // 用左右平均找相似度
  const mono = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) mono[i] += c[i] / chans.length;
  // 前後各補 G 的 0，讓開頭與結尾也有完整 grain
  const pad = G + tol;
  const get = (arr, i) => (i >= 0 && i < n ? arr[i] : 0);
  const stretchLen = Math.ceil(n * ratio) + G * 2;
  const st = chans.map(() => new Float32Array(stretchLen));
  let inPos = -H / ratio, prev = -1, outT = -H, lastReport = 0;
  // 正規化：Hann 50% 重疊的總和 = 1
  while (outT < stretchLen - G) {
    const ideal = Math.round(inPos);
    let best = ideal;
    if (prev !== -1) {
      const nat = prev + H;
      let bc = -Infinity;
      // 粗搜（步進 4）+ 細搜（步進 1），計算量約為全搜的 1/3
      const score = c => { let s = 0; for (let k = 0; k < H; k += 4) s += get(mono, c + k) * get(mono, nat + k); return s; };
      for (let c = ideal - tol; c <= ideal + tol; c += 4) { const s = score(c); if (s > bc) { bc = s; best = c; } }
      const b0 = best;
      for (let c = b0 - 3; c <= b0 + 3; c++) { const s = score(c); if (s > bc) { bc = s; best = c; } }
    }
    for (let ch = 0; ch < chans.length; ch++) {
      const src = chans[ch], dst = st[ch];
      for (let k = 0; k < G; k++) { const o = outT + k; if (o >= 0 && o < stretchLen) dst[o] += get(src, best + k) * win[k]; }
    }
    prev = best; outT += H; inPos += H / ratio;
    if (outT - lastReport > sr * 2) { lastReport = outT; self.postMessage({ progress: 0.85 * outT / stretchLen }); }
    if (inPos > n + pad) break;
  }
  // 重新取樣：輸出第 i 個樣本 = 伸縮訊號的第 i×ratio 個位置（三次內插）
  const out = chans.map(() => new Float32Array(n));
  for (let ch = 0; ch < chans.length; ch++) {
    const y = st[ch], o = out[ch];
    for (let i = 0; i < n; i++) {
      const p = i * ratio, j = Math.floor(p), f = p - j;
      const y0 = y[j - 1] || 0, y1 = y[j] || 0, y2 = y[j + 1] || 0, y3 = y[j + 2] || 0;
      const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3, b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c = -0.5 * y0 + 0.5 * y2;
      o[i] = ((a * f + b) * f + c) * f + y1;
    }
  }
  self.postMessage({ progress: 1 });
  self.postMessage({ done: true, chans: out }, out.map(c => c.buffer));
};
