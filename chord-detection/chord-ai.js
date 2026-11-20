// AI 精準模式：BTC 和弦辨識模型（Park et al., ISMIR 2019, MIT 授權）在瀏覽器裡跑
// 流程：音訊 → 22050 Hz 單聲道 → 逐八度降頻的 CQT（144 bins、24 bins/octave、hop 2048）
//       → log → 正規化 → 每 108 格一段丟進 ONNX → 每格 170 類機率 → 依拍平均 → 給 Viterbi 當發射分數
// 全部在使用者的電腦上算，模型檔放在本站（assets/chord-ai/），不連任何外部伺服器。
(function () {
  'use strict';
  const SR = 22050, HOP = 2048, NB = 144, BPO = 24, NOCT = 6, T = 108;
  const FMIN = 32.70319566257483;     // C1
  const MEAN = -2.2279878897355596, STD = 1.7191329394436938;
  const MODEL_URL = new URL('../assets/chord-ai/btc_large.onnx', document.baseURI).href;
  // BTC 的 14 種性質 → 頁面裡的名稱（sus 不給：見 foldQualities）
  const BTC_Q = ['m', 'maj', 'dim', 'aug', 'm6', '6', 'm7', 'mM7', 'maj7', '7', 'dim7', 'm7b5', 'sus2', 'sus4'];

  // 降頻 2 倍：先做 63 點低通 FIR（Hann 窗 sinc，截止 0.45），再每兩點取一點
  const LP = (() => {
    const N = 63, h = new Float32Array(N), fc = 0.225; let s = 0;
    for (let i = 0; i < N; i++) {
      const m = i - (N - 1) / 2;
      const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
      h[i] = sinc * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); s += h[i];
    }
    for (let i = 0; i < N; i++) h[i] /= s;
    return h;
  })();
  function decimate2(x) {
    const N = LP.length, half = (N - 1) >> 1, out = new Float32Array(Math.ceil(x.length / 2));
    for (let o = 0; o < out.length; o++) {
      const c = o * 2; let s = 0;
      for (let k = 0; k < N; k++) { const i = c + k - half; if (i >= 0 && i < x.length) s += LP[k] * x[i]; }
      out[o] = s;
    }
    return out;
  }

  function resampleTo(buffer, rate) {
    const n0 = buffer.length, ch = buffer.numberOfChannels;
    const L = buffer.getChannelData(0), R = ch > 1 ? buffer.getChannelData(1) : null;
    const ratio = buffer.sampleRate / rate, n = Math.floor(n0 / ratio), out = new Float32Array(n);
    // 先單聲道化，再用 4 點三次內插（降頻前不先低通的話，44.1k→22.05k 會有一點混疊；
    // 對和弦辨識影響很小，但用三次內插比線性好）
    for (let i = 0; i < n; i++) {
      const p = i * ratio, i1 = Math.floor(p), f = p - i1;
      const g = k => { k = Math.min(n0 - 1, Math.max(0, k)); return R ? (L[k] + R[k]) * 0.5 : L[k]; };
      const y0 = g(i1 - 1), y1 = g(i1), y2 = g(i1 + 1), y3 = g(i1 + 2);
      out[i] = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
    }
    return out;
  }

  // ---------- CQT ----------
  // 逐八度：最高八度在 22050 Hz 算，往下每個八度先 2 倍降頻、hop 也減半。
  // 因為降頻，每個八度的核長度都一樣短（約 190–380 點），而且只需要 hop 位置的輸出（每秒約 11 格），
  // 所以直接在時域做內積就好（不用 FFT 卷積）：4 分鐘的歌約 3 億次乘加，一兩秒算完。
  async function cqt(x, onProgress) {
    const Q = 1 / (Math.pow(2, 1 / BPO) - 1);
    const nfr = 1 + Math.floor(x.length / HOP);
    const out = new Float32Array(nfr * NB);
    let y = x, curSr = SR, curHop = HOP;
    for (let o = NOCT - 1; o >= 0; o--) {
      for (let b = 0; b < BPO; b++) {
        const k = o * BPO + b, f = FMIN * Math.pow(2, k / BPO);
        const L = Math.ceil(Q * curSr / f), L0 = Math.ceil(Q * SR / f);
        const kr = new Float32Array(L), ki = new Float32Array(L);
        let s = 0;
        for (let i = 0; i < L; i++) {
          const n = i - (L - 1) / 2, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / L);
          const a = 2 * Math.PI * f * n / curSr;
          kr[i] = w * Math.cos(a); ki[i] = w * Math.sin(a); s += w;      // |w·e^{ia}| = w
        }
        const scale = Math.sqrt(L0) / s;
        const half = (L - 1) >> 1, ny = y.length;
        for (let fi = 0; fi < nfr; fi++) {
          const c = Math.min(fi * curHop, ny - 1) - half;   // 核中心對準輸出點
          let re = 0, im = 0;
          if (c >= 0 && c + L <= ny) {
            for (let i = 0; i < L; i++) { const v = y[c + i]; re += v * kr[i]; im += v * ki[i]; }
          } else {
            for (let i = 0; i < L; i++) { const j = c + i; if (j < 0 || j >= ny) continue; const v = y[j]; re += v * kr[i]; im += v * ki[i]; }
          }
          out[fi * NB + k] = Math.sqrt(re * re + im * im) * scale;
        }
      }
      if (onProgress) onProgress((NOCT - o) / NOCT);
      await new Promise(r => setTimeout(r));
      if (o > 0) { y = decimate2(y); curSr /= 2; curHop = curHop >> 1; }
    }
    return { data: out, frames: nfr };
  }

  // ---------- 模型 ----------
  let session = null, loading = null;
  async function ensureModel(ensureOrt, onProgress) {
    if (session) return session;
    if (loading) return loading;
    loading = (async () => {
      const ort = await ensureOrt();
      // 自己 fetch 才能顯示下載進度；瀏覽器 HTTP 快取會留著，第二次幾乎不用等
      const res = await fetch(MODEL_URL);
      if (!res.ok) throw new Error('下載 AI 模型失敗（HTTP ' + res.status + '）');
      const total = +res.headers.get('Content-Length') || 13068673;
      const reader = res.body.getReader(); const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        chunks.push(value); got += value.length;
        if (onProgress) onProgress(Math.min(1, got / total));
      }
      const buf = new Uint8Array(got); let p = 0;
      for (const c of chunks) { buf.set(c, p); p += c.length; }
      session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
      return session;
    })();
    try { return await loading; } catch (e) { loading = null; throw e; }
  }

  // 回傳每格 170 類的機率（Float32Array frames×170）與每秒格數
  async function framewiseProbs(buffer, ensureOrt, hooks) {
    hooks = hooks || {};
    const sess = await ensureModel(ensureOrt, hooks.download);
    const x = resampleTo(buffer, SR);
    const { data, frames } = await cqt(x, hooks.cqt);
    // log、正規化
    for (let i = 0; i < data.length; i++) data[i] = (Math.log(data[i] + 1e-6) - MEAN) / STD;
    const ort = window.ort;
    const C = 170, probs = new Float32Array(frames * C);
    const nseg = Math.ceil(frames / T);
    for (let s = 0; s < nseg; s++) {
      const inp = new Float32Array(T * NB);
      const n = Math.min(T, frames - s * T);
      inp.set(data.subarray(s * T * NB, (s * T + n) * NB));
      const out = await sess.run({ cqt: new ort.Tensor('float32', inp, [1, T, NB]) });
      const lg = out.logits.data;
      for (let t = 0; t < n; t++) {
        let mx = -Infinity;
        for (let c = 0; c < C; c++) mx = Math.max(mx, lg[t * C + c]);
        let sum = 0;
        for (let c = 0; c < C; c++) { const e = Math.exp(lg[t * C + c] - mx); probs[(s * T + t) * C + c] = e; sum += e; }
        for (let c = 0; c < C; c++) probs[(s * T + t) * C + c] /= sum;
      }
      if (hooks.infer) hooks.infer((s + 1) / nseg);
      if (s % 4 === 3) await new Promise(r => setTimeout(r));
    }
    return { probs, frames, fps: SR / HOP };
  }

  // 每一拍：把落在拍內的格子機率平均 → 依頁面的性質名稱整理成候選
  // sus2／sus4 不偵測（使用者要求）：它們的機率併到同根的大三和弦
  function beatCandidates(fp, beats, duration, topN) {
    const { probs, frames, fps } = fp, C = 170;
    const obs = [];
    for (let i = 0; i < beats.length; i++) {
      const t0 = beats[i], t1 = i + 1 < beats.length ? beats[i + 1] : Math.min(duration, t0 + 0.5);
      let f0 = Math.floor(t0 * fps), f1 = Math.max(f0 + 1, Math.ceil(t1 * fps));
      f0 = Math.min(frames - 1, Math.max(0, f0)); f1 = Math.min(frames, f1);
      const acc = new Float32Array(C);
      for (let f = f0; f < f1; f++) for (let c = 0; c < C; c++) acc[c] += probs[f * C + c];
      const n = Math.max(1, f1 - f0);
      const merged = new Map();
      for (let c = 0; c < 168; c++) {
        let q = BTC_Q[c % 14];
        const root = Math.floor(c / 14);
        if (q === 'sus2' || q === 'sus4') q = 'maj';
        if (q === 'mM7') q = 'm';
        const k = root + ':' + q;
        merged.set(k, (merged.get(k) || 0) + acc[c] / n);
      }
      const noChord = (acc[169] + acc[168]) / n;
      const list = [];
      for (const [k, p] of merged) { const [r, q] = k.split(':'); list.push({ root: +r, quality: q, p }); }
      list.sort((a, b) => b.p - a.p);
      obs.push({ list: list.slice(0, topN || 8), noChord });
    }
    return obs;
  }

  window.ChordAI = { framewiseProbs, beatCandidates, ensureModel, MODEL_URL };
})();
