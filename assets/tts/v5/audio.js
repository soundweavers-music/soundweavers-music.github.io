/* 音訊前處理：對齊 GPT_SoVITS 的 mel_spectrogram_torch / spectrogram_torch
 *
 * 重點：n_fft=1280 不是 2 的次方（= 2^8 × 5），所以 FFT 要用 Bluestein
 *       （用 2 的次方的 FFT 包一層），2048 則直接 radix-2。
 */
(function (root) {
  "use strict";

  // ── radix-2 FFT（原地） ─────────────────────────────
  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (inverse ? 1 : -1);
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  // ── Bluestein：任意長度 DFT ─────────────────────────
  function dft(xr, xi) {
    const n = xr.length;
    const outR = new Float64Array(n), outI = new Float64Array(n);
    // 如果長度是 2 的次方，直接 FFT
    if ((n & (n - 1)) === 0) {
      const r = Float64Array.from(xr), i = Float64Array.from(xi);
      fft(r, i, false);
      return [r, i];
    }
    let m = 1; while (m < 2 * n - 1) m <<= 1;
    const ar = new Float64Array(m), ai = new Float64Array(m);
    const br = new Float64Array(m), bi = new Float64Array(m);
    const wr = new Float64Array(n), wi = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      // w = exp(-i π k² / n)
      const ang = -Math.PI * k * k / n;
      wr[k] = Math.cos(ang); wi[k] = Math.sin(ang);
      ar[k] = xr[k] * wr[k] - xi[k] * wi[k];
      ai[k] = xr[k] * wi[k] + xi[k] * wr[k];
      br[k] = Math.cos(-ang); bi[k] = Math.sin(-ang);
      if (k) { br[m - k] = br[k]; bi[m - k] = bi[k]; }
    }
    fft(ar, ai, false); fft(br, bi, false);
    for (let k = 0; k < m; k++) {
      const r = ar[k] * br[k] - ai[k] * bi[k];
      const i2 = ar[k] * bi[k] + ai[k] * br[k];
      ar[k] = r; ai[k] = i2;
    }
    fft(ar, ai, true);
    for (let k = 0; k < n; k++) {
      outR[k] = ar[k] * wr[k] - ai[k] * wi[k];
      outI[k] = ar[k] * wi[k] + ai[k] * wr[k];
    }
    return [outR, outI];
  }

  function hann(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
    return w;
  }

  // ── STFT 振幅（reflect 補邊，對齊 torch.stft center=False） ──
  function stftMag(y, nFft, hop, win) {
    const pad = (nFft - hop) >> 1;
    const n = y.length + 2 * pad;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let j = i - pad;
      if (j < 0) j = -j;                       // reflect
      if (j >= y.length) j = 2 * y.length - 2 - j;
      x[i] = y[Math.max(0, Math.min(y.length - 1, j))];
    }
    const frames = Math.floor((n - nFft) / hop) + 1;
    const bins = (nFft >> 1) + 1;
    const out = new Float32Array(bins * frames);
    const w = win || hann(nFft);
    for (let f = 0; f < frames; f++) {
      const re = new Float64Array(nFft), im = new Float64Array(nFft);
      for (let i = 0; i < nFft; i++) re[i] = x[f * hop + i] * w[i];
      const [R, I] = dft(re, im);
      for (let b = 0; b < bins; b++) out[b * frames + f] = Math.hypot(R[b], I[b]);
      // torch 的複數轉振幅等同 sqrt(re²+im²)
    }
    return { data: out, bins: bins, frames: frames };
  }

  // ── mel（librosa 濾波器組，log 壓縮） ────────────────
  function melSpectrogram(y, basis, nMels, bins) {
    const s = stftMag(y, 1280, 320);
    const out = new Float32Array(nMels * s.frames);
    for (let m = 0; m < nMels; m++) {
      for (let f = 0; f < s.frames; f++) {
        let acc = 0;
        for (let b = 0; b < bins; b++) acc += basis[m * bins + b] * s.data[b * s.frames + f];
        out[m * s.frames + f] = Math.log(Math.max(acc, 1e-5));    // dynamic_range_compression
      }
    }
    return { data: out, dims: [1, nMels, s.frames] };
  }

  function normSpec(x) {          // (x - (-12)) / 14 * 2 - 1
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = (x[i] + 12) / 14 * 2 - 1;
    return out;
  }

  function resample(y, srFrom, srTo) {
    if (srFrom === srTo) return y;
    const n = Math.round(y.length * srTo / srFrom);
    const out = new Float32Array(n), ratio = srFrom / srTo;
    for (let i = 0; i < n; i++) {
      const t = i * ratio, i0 = Math.floor(t), fr = t - i0;
      const a = y[Math.min(i0, y.length - 1)], b = y[Math.min(i0 + 1, y.length - 1)];
      out[i] = a + (b - a) * fr;
    }
    return out;
  }

  // ── fp16 ↔ fp32 ────────────────────────────────────
  // onnxruntime-web 的 float16 tensor 就是 Uint16Array 的位元；模型吐 fp16 時
  // 拿到的值是「半精度位元」不是數字，要自己轉回來，不然 0.5 會變成 15360。
  function toF16(a) {
    var out = new Uint16Array(a.length);
    for (var i = 0; i < a.length; i++) {
      var x = a[i], sign = x < 0 ? 0x8000 : 0;
      x = Math.abs(x);
      if (x === 0) { out[i] = sign; continue; }
      if (!isFinite(x)) { out[i] = sign | 0x7c00; continue; }
      var e = Math.floor(Math.log(x) / Math.LN2);
      if (e < -14) { var sub = Math.round(x / Math.pow(2, -24)); out[i] = sign | (sub >= 1024 ? 0x0400 : sub); continue; }
      if (e > 15) { out[i] = sign | 0x7c00; continue; }
      var m = Math.round((x / Math.pow(2, e) - 1) * 1024);
      if (m === 1024) { m = 0; e++; }
      out[i] = sign | ((e + 15) << 10) | m;
    }
    return out;
  }

  var POW2 = new Float32Array(32);
  for (var pe = 0; pe < 32; pe++) POW2[pe] = Math.pow(2, pe - 15);

  function fromF16(u) {
    var out = new Float32Array(u.length);
    for (var i = 0; i < u.length; i++) {
      var h = u[i], s = (h & 0x8000) ? -1 : 1, ex = (h >> 10) & 0x1f, m = h & 0x3ff;
      if (ex === 0) out[i] = s * m * 5.960464477539063e-8;          // 次正規 / ±0
      else if (ex === 31) out[i] = m ? NaN : s * Infinity;           // Inf / NaN
      else out[i] = s * (1 + m / 1024) * POW2[ex];
    }
    return out;
  }

  // onnxruntime-web 對 float16 有兩種表示，兩個都要吃：
  //   新版（Chrome 有 Float16Array）：tensor.data 是 Float16Array，值是數字
  //   舊版：tensor.data 是 Uint16Array，值是半精度位元
  function isF16(a) {
    if (!a) return false;
    if (a.constructor === Uint16Array) return true;
    return typeof Float16Array !== "undefined" && a instanceof Float16Array;
  }

  // 任何一種 float16 表示 → Uint16Array 位元（丟給 ORT 當 float16 輸入用這個）
  function bits16(a) {
    if (a.constructor === Uint16Array) return a;
    if (typeof Float16Array !== "undefined" && a instanceof Float16Array) {
      return new Uint16Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
    }
    return toF16(a);
  }

  // 任何一種 float16 表示 → Float32Array 數字
  function toF32(a) {
    if (a.constructor === Float32Array) return a;
    if (typeof Float16Array !== "undefined" && a instanceof Float16Array) return Float32Array.from(a);
    if (a.constructor === Uint16Array) return fromF16(a);
    return Float32Array.from(a);
  }

  root.V5Audio = {
    fft: fft, dft: dft, stftMag: stftMag, melSpectrogram: melSpectrogram,
    normSpec: normSpec, resample: resample, hann: hann,
    toF16: toF16, fromF16: fromF16, isF16: isF16, bits16: bits16, toF32: toF32,
  };
})(typeof window !== "undefined" ? window : globalThis);
