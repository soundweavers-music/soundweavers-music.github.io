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

  // =================== 簡譜旋律：中央聲道遮罩 → SwiftF0（MIT，135 KB）→ 八度校正 ===================
  // 測試（work/chord_bench/songs_mel，8 首立體聲、493 個旋律音）：
  //   舊做法（中央聲道＋諧波加總）簡譜數字對 64%；直接把混音丟 SwiftF0 75%；遮罩後再丟 SwiftF0 98%。
  //   兩者互補：遮罩拿掉左右擺位的伴奏，SwiftF0 不會像諧波加總那樣抓到高八度、五度或貝斯。
  const F0_URL = new URL('../assets/chord-ai/swiftf0.onnx', document.baseURI).href;
  const F0_SR = 16000, F0_HOP = 256, F0_WIN = 1875, F0_LEFT = 11, F0_AHEAD = 10;
  let f0Session = null, f0Loading = null;

  async function ensureF0(ensureOrt) {
    if (f0Session) return f0Session;
    if (!f0Loading) f0Loading = (async () => {
      const ort = await ensureOrt();
      const res = await fetch(F0_URL);
      if (!res.ok) throw new Error('下載旋律模型失敗（HTTP ' + res.status + '）');
      f0Session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ['wasm'] });
      return f0Session;
    })();
    try { return await f0Loading; } catch (e) { f0Loading = null; throw e; }
  }

  // 實數 FFT（radix-2）
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

  // 中央聲道遮罩：主唱通常擺在正中央、伴奏分左右。每個頻率格算「左右有多相等」(0–1)，
  // 8 次方後當增益，只留中間的聲音；再拿掉 160 Hz 以下（貝斯、大鼓）與 5 kHz 以上（鈸）。單聲道檔案原樣回傳。
  async function centerVocal(buffer, onProgress) {
    const sr = buffer.sampleRate, n = buffer.length;
    const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    if (!R) return { x: L, sr };
    const N = 2048, H = 512, win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const y = new Float32Array(n), wsum = new Float32Array(n);
    const reL = new Float32Array(N), imL = new Float32Array(N), reR = new Float32Array(N), imR = new Float32Array(N);
    const lo = Math.round(160 * N / sr), hi = Math.round(5000 * N / sr);
    let k = 0;
    for (let off = 0; off + N < n; off += H, k++) {
      for (let i = 0; i < N; i++) { reL[i] = L[off + i] * win[i]; imL[i] = 0; reR[i] = R[off + i] * win[i]; imR[i] = 0; }
      fft(reL, imL, false); fft(reR, imR, false);
      for (let b = 0; b < N; b++) {
        const bb = Math.min(b, N - b);
        if (bb < lo || bb > hi) { reL[b] = 0; imL[b] = 0; continue; }
        const l2 = reL[b] * reL[b] + imL[b] * imL[b], r2 = reR[b] * reR[b] + imR[b] * imR[b];
        const mr = (reL[b] + reR[b]) * 0.5, mi = (imL[b] + imR[b]) * 0.5, m2 = mr * mr + mi * mi;
        let g = Math.min(1, m2 / (0.5 * (l2 + r2) + 1e-12));
        g = g * g; g = g * g; g = g * g;              // 8 次方
        reL[b] = mr * g; imL[b] = mi * g;
      }
      fft(reL, imL, true);
      for (let i = 0; i < N; i++) { y[off + i] += reL[i] * win[i]; wsum[off + i] += win[i] * win[i]; }
      if ((k & 511) === 0) { if (onProgress) onProgress(off / n); await new Promise(r => setTimeout(r)); }
    }
    for (let i = 0; i < n; i++) y[i] = wsum[i] > 1e-6 ? y[i] / wsum[i] : 0;
    return { x: y, sr };
  }

  // 任意取樣率 → 16 kHz（先做簡單低通再線性內插；人聲音高用這樣就夠）
  function to16k(x, sr) {
    const ratio = sr / F0_SR, n = Math.floor(x.length / ratio), out = new Float32Array(n);
    const taps = Math.max(1, Math.round(ratio));       // 盒型低通，長度≈降頻倍數
    for (let i = 0; i < n; i++) {
      const c = Math.floor(i * ratio); let s = 0, m = 0;
      for (let k = 0; k < taps; k++) { const j = c + k; if (j < x.length) { s += x[j]; m++; } }
      out[i] = m ? s / m : 0;
    }
    return out;
  }

  // 前後 win 秒內的音高中位數當參考，把離它超過 6 個半音的音折回最近的八度，再夾到 G3–C6
  function foldOctaves(times, midi, win) {
    const n = midi.length, idx = [];
    for (let i = 0; i < n; i++) if (midi[i] >= 0) idx.push(i);
    const out = Int16Array.from(midi);
    let a = 0, b = 0;
    for (const i of idx) {
      const t = times[i];
      while (a < idx.length && times[idx[a]] < t - win / 2) a++;
      while (b < idx.length && times[idx[b]] <= t + win / 2) b++;
      const seg = []; for (let k = a; k < b; k++) seg.push(midi[idx[k]]);
      seg.sort((p, q) => p - q);
      const med = seg[seg.length >> 1];
      let m = midi[i];
      while (m - med > 6) m -= 12;
      while (med - m > 6) m += 12;
      while (m < 55) m += 12;
      while (m > 84) m -= 12;
      out[i] = m;
    }
    return out;
  }

  // ===== AI 分離主唱：Spleeter 2stems（Deezer，MIT；ONNX 轉檔來自 sherpa-onnx）=====
  // 44.1 kHz、STFT 4096 點 hop 1024 Hann → 前 1024 個頻率格（0–11 kHz）的幅度 → 兩個模型各估一份「人聲／伴奏」幅度
  // → 人聲遮罩 = v² / (v² + a²) → 乘回原本的頻譜 → iSTFT。每次餵 512 格（約 12 秒），記憶體才不會爆。
  // 為什麼要它：中央聲道遮罩會把「擺在正中間的樂器」（鋼琴、鐘琴、主奏）也留下來。真實歌曲測試裡，
  // 前奏／間奏有 45–73% 的格子被當成旋律，歌詞就被拖進間奏；Spleeter 在前奏／間奏是 0%，主歌反而多抓到 7%。
  const SPL_URLS = ['spleeter_vocals.onnx', 'spleeter_accomp.onnx'].map(f => new URL('../assets/chord-ai/' + f, document.baseURI).href);
  const SPL_SR = 44100, SPL_N = 4096, SPL_H = 1024, SPL_BINS = 1024, SPL_T = 512;
  let splSessions = null, splLoading = null;

  async function ensureSpleeter(ensureOrt, onProgress) {
    if (splSessions) return splSessions;
    if (!splLoading) splLoading = (async () => {
      const ort = await ensureOrt();
      const out = [];
      for (let k = 0; k < SPL_URLS.length; k++) {
        const res = await fetch(SPL_URLS[k]);
        if (!res.ok) throw new Error('下載人聲分離模型失敗（HTTP ' + res.status + '）');
        out.push(await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ['wasm'] }));
        if (onProgress) onProgress((k + 1) / SPL_URLS.length);
      }
      splSessions = out;
      return out;
    })();
    try { return await splLoading; } catch (e) { splLoading = null; throw e; }
  }

  function resampleLinear(x, from, to) {
    if (from === to) return x;
    const n = Math.floor(x.length * to / from), out = new Float32Array(n), r = from / to;
    for (let i = 0; i < n; i++) {
      const p = i * r, a = Math.floor(p), f = p - a;
      out[i] = (x[a] || 0) * (1 - f) + (x[a + 1] || 0) * f;
    }
    return out;
  }

  // 回傳單聲道主唱（44.1 kHz）。hooks.progress(0..1)
  async function spleeterVocal(buffer, ensureOrt, onProgress) {
    const [sv, sa] = await ensureSpleeter(ensureOrt);
    const ort = window.ort;
    const chs = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chs.push(resampleLinear(buffer.getChannelData(c), buffer.sampleRate, SPL_SR));
    if (chs.length === 1) chs.push(chs[0]);
    const len = chs[0].length, nFr = Math.max(1, 1 + Math.floor((len - SPL_N) / SPL_H));
    const win = new Float32Array(SPL_N);
    for (let i = 0; i < SPL_N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SPL_N);
    // 只存前 1024 格的複數頻譜（其餘頻率本來就會被丟掉：人聲遮罩外 = 0）
    const RE = [new Float32Array(nFr * SPL_BINS), new Float32Array(nFr * SPL_BINS)];
    const IM = [new Float32Array(nFr * SPL_BINS), new Float32Array(nFr * SPL_BINS)];
    const re = new Float32Array(SPL_N), im = new Float32Array(SPL_N);
    for (let c = 0; c < 2; c++) {
      const x = chs[c];
      for (let f = 0; f < nFr; f++) {
        const off = f * SPL_H;
        for (let i = 0; i < SPL_N; i++) { re[i] = (x[off + i] || 0) * win[i]; im[i] = 0; }
        fft(re, im, false);
        RE[c].set(re.subarray(0, SPL_BINS), f * SPL_BINS); IM[c].set(im.subarray(0, SPL_BINS), f * SPL_BINS);
        if ((f & 1023) === 0) { if (onProgress) onProgress(0.15 * (c + f / nFr) / 2); await new Promise(r => setTimeout(r)); }
      }
    }
    const nBlk = Math.ceil(nFr / SPL_T), mask = [new Float32Array(nFr * SPL_BINS), new Float32Array(nFr * SPL_BINS)];
    const X = new Float32Array(2 * SPL_T * SPL_BINS);
    for (let b = 0; b < nBlk; b++) {
      X.fill(0);
      const f0 = b * SPL_T, f1 = Math.min(nFr, f0 + SPL_T);
      for (let c = 0; c < 2; c++) for (let f = f0; f < f1; f++) {
        const o = f * SPL_BINS, d = c * SPL_T * SPL_BINS + (f - f0) * SPL_BINS;
        for (let k = 0; k < SPL_BINS; k++) X[d + k] = Math.hypot(RE[c][o + k], IM[c][o + k]);
      }
      const feed = { x: new ort.Tensor('float32', X, [2, 1, SPL_T, SPL_BINS]) };
      const v = (await sv.run(feed)).y.data, a = (await sa.run(feed)).y.data;
      for (let c = 0; c < 2; c++) for (let f = f0; f < f1; f++) {
        const o = f * SPL_BINS, d = c * SPL_T * SPL_BINS + (f - f0) * SPL_BINS;
        for (let k = 0; k < SPL_BINS; k++) {
          const vv = v[d + k] * v[d + k], aa = a[d + k] * a[d + k];
          mask[c][o + k] = (vv + 5e-11) / (vv + aa + 1e-10);
        }
      }
      if (onProgress) onProgress(0.15 + 0.75 * (b + 1) / nBlk);
      await new Promise(r => setTimeout(r));
    }
    // iSTFT（兩聲道平均成單聲道；頻譜線性，所以先平均再反轉換＝反轉換後平均）
    const y = new Float32Array(len), ws = new Float32Array(len);
    for (let f = 0; f < nFr; f++) {
      re.fill(0); im.fill(0);
      const o = f * SPL_BINS;
      for (let k = 0; k < SPL_BINS; k++) {
        re[k] = 0.5 * (RE[0][o + k] * mask[0][o + k] + RE[1][o + k] * mask[1][o + k]);
        im[k] = 0.5 * (IM[0][o + k] * mask[0][o + k] + IM[1][o + k] * mask[1][o + k]);
      }
      for (let k = 1; k < SPL_BINS; k++) { re[SPL_N - k] = re[k]; im[SPL_N - k] = -im[k]; }   // 共軛對稱 → 實數輸出
      fft(re, im, true);
      const off = f * SPL_H;
      for (let i = 0; i < SPL_N && off + i < len; i++) { y[off + i] += re[i] * win[i]; ws[off + i] += win[i] * win[i]; }
      if ((f & 1023) === 0) { if (onProgress) onProgress(0.9 + 0.1 * f / nFr); await new Promise(r => setTimeout(r)); }
    }
    for (let i = 0; i < len; i++) y[i] = ws[i] > 1e-6 ? y[i] / ws[i] : 0;
    return { x: y, sr: SPL_SR };
  }

  // 回傳頁面用的格式：{ times, midi（-1 = 沒有旋律）, nFrames, rise, riseHop, engine }
  // hooks.useSpleeter：要不要先用 AI 分離主唱（下載 38 MB）；失敗或聽起來不像有人聲（合成音色、純演奏）就退回中央聲道遮罩。
  async function melodyFrames(buffer, ensureOrt, segs, hooks) {
    hooks = hooks || {};
    const sess = await ensureF0(ensureOrt);
    const ort = window.ort;
    let cv = null, sepEngine = 'center';
    if (hooks.useSpleeter) {
      try {
        const sp = await spleeterVocal(buffer, ensureOrt, hooks.separate);
        // 分離後幾乎沒聲音（例：電子合成的「人聲」、純演奏曲）→ Spleeter 不認得，用回中央遮罩
        let es = 0, em = 0;
        const L = buffer.getChannelData(0);
        for (let i = 0; i < sp.x.length; i += 7) es += sp.x[i] * sp.x[i];
        for (let i = 0; i < L.length; i += 7) em += L[i] * L[i];
        const ratio = Math.sqrt((es / Math.ceil(sp.x.length / 7)) / (em / Math.ceil(L.length / 7) + 1e-12));
        if (ratio >= 0.15) { cv = sp; sepEngine = 'spleeter'; }
        else console.info('AI 分離後人聲太小（' + ratio.toFixed(2) + '），改用中央聲道');
      } catch (e) {
        console.warn('AI 分離主唱失敗，改用中央聲道', e);
      }
    }
    if (!cv) cv = await centerVocal(buffer, hooks.separate);
    const x = to16k(cv.x, cv.sr);
    const n = Math.max(1, Math.floor(x.length / F0_HOP));
    const pitch = new Float32Array(n), conf = new Float32Array(n);
    const fmin = new ort.Tensor('float32', new Float32Array([110]), []);
    const fmax = new ort.Tensor('float32', new Float32Array([1000]), []);
    for (let s = 0; s < n; s += F0_WIN) {
      const e = Math.min(s + F0_WIN, n), l = Math.max(0, s - F0_LEFT);
      const w = e < n ? x.subarray(l * F0_HOP, (e + F0_AHEAD) * F0_HOP) : x.subarray(l * F0_HOP);
      const out = await sess.run({ audio: new ort.Tensor('float32', Float32Array.from(w), [1, w.length]), fmin, fmax });
      const p = out.pitch.data, c = out.confidence.data;
      for (let f = s; f < e; f++) { pitch[f] = Number(p[f - l]); conf[f] = c[f - l]; }
      if (hooks.track) hooks.track(e / n);
      await new Promise(r => setTimeout(r));
    }
    const times = new Float32Array(n), midi = new Int16Array(n).fill(-1);
    for (let f = 0; f < n; f++) {
      times[f] = f * F0_HOP / F0_SR;
      if (conf[f] >= 0.5 && pitch[f] > 0) midi[f] = Math.round(69 + 12 * Math.log2(pitch[f] / 440));
      // 有人聲模型給的「哪裡在唱」區段就再篩一次（沒有就全部保留）
      if (midi[f] >= 0 && segs && segs.length) {
        let inside = false;
        for (const sg of segs) if (times[f] >= sg[0] && times[f] <= sg[1]) { inside = true; break; }
        if (!inside) midi[f] = -1;
      }
    }
    const rise = vocalRise(cv.x, cv.sr);
    return { times, midi: foldOctaves(times, midi, 4.0), nFrames: n, rise, riseHop: RISE_HOP, sepEngine };
  }

  // ===== 歌詞對齊（LRC 一個字對到一個唱出來的音）=====
  // 分離後主唱的響度，每 10 ms 一格；rise＝跟 30 ms 前比上升了幾 dB。
  // 同一個音高連唱兩個字（例如「等 等」）音高曲線是一條直線，只有響度會「掉下去再衝上來」，靠這個切開。
  const RISE_HOP = 0.01;
  function vocalRise(x, sr) {
    const h = Math.max(1, Math.round(sr * RISE_HOP)), n = Math.floor(x.length / h);
    const db = new Float32Array(n), rise = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = i * h, e = k + h; k < e; k++) s += x[k] * x[k];
      db[i] = 20 * Math.log10(Math.sqrt(s / h + 1e-12) + 1e-9);
    }
    for (let i = 0; i < n; i++) rise[i] = Math.max(0, db[i] - db[Math.max(0, i - 3)]);
    return rise;
  }

  // 平滑過的逐格音高 → 音符（同音高連續就合併；斷掉 > 0.05 秒或換音高就切；短於 0.08 秒丟掉）
  function notesFromFrames(times, midi) {
    const dt = times.length > 1 ? times[1] - times[0] : 0.016, out = [];
    let cur = null;
    for (let f = 0; f < times.length; f++) {
      const ti = times[f], mi = midi[f];
      if (mi < 0) { if (cur && ti - cur.end > 0.05) { out.push(cur); cur = null; } continue; }
      if (cur && mi === cur.midi && ti - cur.end <= 0.05 + dt) cur.end = ti + dt;
      else { if (cur) out.push(cur); cur = { start: ti, end: ti + dt, midi: mi }; }
    }
    if (cur) out.push(cur);
    return out.filter(n => n.end - n.start >= 0.08);
  }

  // 長音裡響度往上衝 ≥ 6 dB 的地方切開（兩段各至少 0.12 秒）
  function splitAtOnsets(notes, rise) {
    if (!rise || !rise.length) return notes;
    const out = [];
    for (const nt of notes) {
      const a = nt.start, b = nt.end, i0 = Math.floor(a / RISE_HOP), i1 = Math.min(Math.floor(b / RISE_HOP), rise.length) - 1;
      const pts = [a]; let last = a;
      for (let i = i0 + 1; i < i1; i++) {
        const t = i * RISE_HOP;
        if (rise[i] >= 6 && rise[i] >= rise[i - 1] && rise[i] >= rise[i + 1] && t - last >= 0.12 && b - t >= 0.12) { pts.push(t); last = t; }
      }
      pts.push(b);
      for (let q = 0; q + 1 < pts.length; q++) out.push({ start: pts[q], end: pts[q + 1], midi: nt.midi });
    }
    return out;
  }

  // 整首一起排（動態規劃）：每個字依序挑一個「起點音」，一個字唱到下一個字的起點為止，
  // 中間多出來的音當拖腔。偏好字唱得久一點（短的多半是滑音），一個字吃太多音要付代價；
  // 每行第一個字要靠近 LRC 時間（手打 LRC 常差 ±0.3 秒，所以是軟性的）。
  // 行跟行的分界由音樂決定，不會因為 LRC 早了半秒就把上一行最後一個字搶過來。
  // 跟 LRC 交叉比對：
  //   - LRC 有、但那段時間幾乎沒有唱的音（標題、「詞／曲」、口白）→ 整行略過，不硬塞音符
  //   - LRC 的空白時間碼（[02:27.96] 後面沒字）＝上一行唱完、間奏開始 → 上一行的字不能拖進間奏，
  //     下一行的行首字可以整段跨過間奏（間奏裡零星的雜音不算拖腔）
  // 測試：合成 8 首 475 字（LRC ±0.35 秒）字的時間對 34.5% → 58%、字底下的音對 73% → 81%；
  //       真實歌曲（叮叮噹！聖誕來了，40 行）每行起點都在 LRC ±0.4 秒內，重複的副歌音高一致。
  const W_DUR = 0.3, W_K = 0.3, W_LINE = 1.5, LINE_WIN = 0.9, MAXK = 6, BREAK_GAP = 3.0;
  function alignLyrics(frames, rise, lines, ends) {
    const notes = splitAtOnsets(notesFromFrames(frames.times, frames.midi), rise);
    const M = notes.length;
    ends = ends || [];
    // 1) 交叉比對：每行在它的時間範圍內有沒有足夠的音（≥ 字數的一半）
    const keep = lines.map((ln, i) => {
      const n = Array.from(ln.text).filter(ch => !/\s/.test(ch)).length;
      const t1 = ends[i] != null ? ends[i] : (i + 1 < lines.length ? lines[i + 1].time : ln.time + 8);
      let have = 0;
      for (const nt of notes) if (nt.start >= ln.time - LINE_WIN && nt.start < t1 + 0.5) have++;
      return n > 0 && have >= Math.max(1, n >> 1);
    });
    const chars = [];
    let prevKept = -1;
    lines.forEach((ln, li) => {
      if (!keep[li]) return;
      const cs = Array.from(ln.text).filter(ch => !/\s/.test(ch));
      const end = ends[li] != null ? ends[li] : Infinity;
      const brk = prevKept >= 0 && ends[prevKept] != null && ln.time - ends[prevKept] >= BREAK_GAP;
      cs.forEach((_, q) => chars.push({ li, first: q === 0, lt: ln.time, end, brk: brk && q === 0 }));
      prevKept = li;
    });
    const N = chars.length;
    if (!N || M < N) return null;
    const INF = 1e18, cum = new Float64Array(M + 1);
    for (let j = 0; j < M; j++) cum[j + 1] = cum[j] + notes[j].end - notes[j].start;
    const node = (c, j) => {
      if (notes[j].start > chars[c].end + 0.5) return INF;      // 不能拖進 LRC 標示的間奏
      if (!chars[c].first) return 0;
      const d = Math.abs(notes[j].start - chars[c].lt);
      return W_LINE * d / 0.35 + (d > LINE_WIN ? 8 : 0);
    };
    const dp = new Float64Array(N * M).fill(INF), bk = new Int32Array(N * M).fill(-1);
    for (let j = 0; j <= M - N; j++) dp[j] = node(0, j);
    for (let c = 1; c < N; c++) {
      const row = c * M, prow = (c - 1) * M, brk = chars[c].brk;
      for (let j = c; j < M - (N - 1 - c); j++) {
        const nv = node(c, j);
        if (nv >= INF) continue;
        let best = INF, bj = -1;
        for (let p = brk ? c - 1 : Math.max(c - 1, j - MAXK); p < j; p++) {
          const d0 = dp[prow + p];
          if (d0 >= INF) continue;
          const k = Math.min(j - p, MAXK);       // 跨間奏時，上一個字最多算吃 MAXK 個音
          const v = d0 - W_DUR * Math.log(Math.max(0.05, cum[p + k] - cum[p])) + W_K * (k - 1);
          if (v < best) { best = v; bj = p; }
        }
        if (bj >= 0) { dp[row + j] = best + nv; bk[row + j] = bj; }
      }
    }
    let jb = -1, bv = INF;
    for (let j = N - 1; j < M; j++) {
      const d0 = dp[(N - 1) * M + j];
      if (d0 >= INF) continue;
      const v = d0 - W_DUR * Math.log(Math.max(0.05, notes[j].end - notes[j].start));
      if (v < bv) { bv = v; jb = j; }
    }
    if (jb < 0) return null;
    const starts = new Array(N);
    for (let c = N - 1, j = jb; c >= 0; c--) { starts[c] = j; j = bk[c * M + j]; }
    const out = lines.map(() => null);
    for (let c = 0; c < N; c++) {
      const j = starts[c];
      let e = c + 1 < N ? starts[c + 1] : Math.min(M, j + 2);
      e = Math.min(e, j + MAXK);
      // 字的音高＝它唱的那幾個音裡加起來最長的（避開字頭的滑音）
      const acc = new Map(); let midi = notes[j].midi, best = 0;
      for (let q = j; q < e; q++) {
        const v = (acc.get(notes[q].midi) || 0) + notes[q].end - notes[q].start;
        acc.set(notes[q].midi, v);
        if (v > best) { best = v; midi = notes[q].midi; }
      }
      // 字的結束：連續唱下去的音（中間空 ≥ 0.3 秒就當作已經換氣／間奏）
      let end = notes[j].end;
      for (let q = j + 1; q < e && notes[q].start - end < 0.3; q++) end = notes[q].end;
      if (c + 1 < N) end = Math.min(end, notes[starts[c + 1]].start);
      const li = chars[c].li;
      if (!out[li]) out[li] = [];
      out[li].push({ t: notes[j].start, end, midi });
    }
    return out;            // 每行一個陣列；沒唱的行是 null
  }

  window.ChordAI = { framewiseProbs, beatCandidates, ensureModel, MODEL_URL, melodyFrames, alignLyrics, ensureSpleeter };
})();
