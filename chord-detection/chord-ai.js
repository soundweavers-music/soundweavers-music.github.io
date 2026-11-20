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

  // 回傳頁面用的格式：{ times, midi（-1 = 沒有旋律）, nFrames }
  async function melodyFrames(buffer, ensureOrt, segs, hooks) {
    hooks = hooks || {};
    const sess = await ensureF0(ensureOrt);
    const ort = window.ort;
    const cv = await centerVocal(buffer, hooks.separate);
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
    return { times, midi: foldOctaves(times, midi, 4.0), nFrames: n };
  }

  window.ChordAI = { framewiseProbs, beatCandidates, ensureModel, MODEL_URL, melodyFrames };
})();
