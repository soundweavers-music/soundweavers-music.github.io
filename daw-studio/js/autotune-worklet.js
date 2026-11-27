// 人聲修音（音高校正）AudioWorklet
//
// 1) 音高偵測：輸入先低通、降頻到約 12 kHz，每個 128 樣本區塊跑一次 YIN（累積平均正規化差分函數）
//    → 粗估週期，再回到原取樣率在附近做細部搜尋 + 拋物線內插，得到精確週期。
//    能量太低或週期性不足 → 判為無聲／子音，不修正。
// 2) 目標音：偵測音高（MIDI 浮點數）→ 依調性遮罩找最近的音階音；有遲滯，不會在兩個音之間來回跳。
//    「保留顫音」：用慢速低通得到中心音高，只修中心、保留原本的顫動。
//    「修正速度」：移調量以一階平滑趨近目標（0 ms = 瞬間跳到，機械音效果）。
// 3) 重建：TD-PSOLA（以基本週期為單位的重疊相加）。每個合成標記取最近的分析標記、
//    以 Hann 窗切下兩個週期長的 grain，依新週期間距疊加 → 音高改變、共振峰（音色）保留、長度不變。
//    無聲段落以固定間距做恆等重疊相加（原音直通）。輸出除以窗函數總和，音量不變。
// 延遲 L = 32 ms（固定），由 engine 做延遲補償。

class AutoTune extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mask', defaultValue: 4095, minValue: 0, maxValue: 4095, automationRate: 'k-rate' },   // 允許的音高類別（位元 0 = C）
      { name: 'retune', defaultValue: 40, minValue: 0, maxValue: 1000, automationRate: 'k-rate' },   // ms
      { name: 'amount', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'vibrato', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // 人性化：長音的中心音高跟得慢一點，再加一點極慢的漂移，避免整顆音鎖死在音階上
      { name: 'humanize', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // 彈性修音（Flex-Tune）：已經很接近目標音時不要硬拉，保留演唱表情
      { name: 'flex', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // 參考音高：A4 的頻率（415–466 Hz），整把樂器不是 440 時用
      { name: 'refp', defaultValue: 440, minValue: 415, maxValue: 466, automationRate: 'k-rate' },
      { name: 'fmin', defaultValue: 70, minValue: 50, maxValue: 400, automationRate: 'k-rate' },
      { name: 'fmax', defaultValue: 1000, minValue: 200, maxValue: 1500, automationRate: 'k-rate' },
    ];
  }

  constructor(opt) {
    super();
    const sr = sampleRate;
    const po = (opt && opt.processorOptions) || {};
    this.report = !!po.report;
    // 現場模式用 16 ms；一般模式 32 ms。太短的話重疊相加沒有空間，所以下限 8 ms。
    this.L = Math.round(Math.max(0.008, Math.min(0.064, po.latency || 0.032)) * sr);
    // 時間軸對照（ctx 時刻 ↔ 專案秒數）與手動編輯的音符
    this.segs = (po.segs || []).slice();
    this.notes = [];
    this.ni = 0;
    this.port.onmessage = e => {
      const d = e.data || {};
      if (d.segs) this.segs = d.segs;
      if (d.notes) { this.notes = d.notes.slice().sort((a, b) => a.s - b.s); this.ni = 0; }
    };
    this.N = 1 << 14; this.M = this.N - 1;
    this.inb = [new Float32Array(this.N), new Float32Array(this.N)];
    this.mono = new Float32Array(this.N);
    this.ola = [new Float32Array(this.N), new Float32Array(this.N)];
    this.ws = new Float32Array(this.N);
    this.n = 0;
    // 偵測用降頻
    this.D = Math.max(1, Math.round(sr / 12000));
    this.fsd = sr / this.D;
    this.DN = 2048; this.dec = new Float32Array(this.DN); this.dn = 0; this.dc = 0;
    this.scr = new Float32Array(1024); this.dfn = new Float32Array(512); this.cm = new Float32Array(512);
    // 兩級 Butterworth 低通（fc ≈ 0.38 × 降頻後取樣率）
    const fc = 0.38 * this.fsd / 2 * 2 * 0.5, w0 = 2 * Math.PI * Math.min(fc, sr * 0.45) / sr;
    const mk = Q => { const al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al; return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 }; };
    this.lp = [mk(0.5412), mk(1.3066)];
    // 狀態
    this.Pu = Math.round(0.004 * sr);     // 無聲時的固定間距
    this.Pin = this.Pu; this.voiced = false;
    this.marks = new Float64Array(256); this.mi = 0; this.lastMark = 0;
    this.marks[0] = 0; this.mi = 1;
    this.nextSynth = this.L;
    this.shift = 0; this.cur = -1; this.center = 0; this.h3 = [0, 0, 0];
    this.blk = 0;
    this.lastF = 0; this.lastMidi = 0;
  }

  biq(s, x) { const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2; s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y; return y; }

  // 回傳基本頻率（Hz），無聲回傳 0
  detect(fmin, fmax) {
    const fsd = this.fsd;
    const tmin = Math.max(2, Math.floor(fsd / fmax)), tmax = Math.min(480, Math.ceil(fsd / fmin));
    const W = tmax, len = W + tmax + 2;
    if (this.dn < len) return 0;
    const x = this.scr, DM = this.DN - 1;
    for (let i = 0; i < len; i++) x[i] = this.dec[(this.dn - len + i) & DM];
    let e = 0; for (let i = 0; i < W; i++) { const v = x[tmax + 2 + i - 2] || 0; e += v * v; }
    if (Math.sqrt(e / W) < 0.004) return 0;
    const d = this.dfn, cm = this.cm;
    let run = 0; cm[0] = 1;
    for (let tau = 1; tau <= tmax; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const df = x[j] - x[j + tau]; s += df * df; }
      d[tau] = s; run += s;
      cm[tau] = run > 0 ? s * tau / run : 1;
    }
    let best = -1;
    for (let tau = tmin; tau <= tmax; tau++) {
      if (cm[tau] < 0.15) { while (tau + 1 <= tmax && cm[tau + 1] < cm[tau]) tau++; best = tau; break; }
    }
    if (best < 0) {
      let mv = 1e9;
      for (let tau = tmin; tau <= tmax; tau++) if (cm[tau] < mv) { mv = cm[tau]; best = tau; }
      if (mv > 0.3) return 0;
    }
    let t = best;
    if (best > 1 && best < tmax) {
      const a = cm[best - 1], b = cm[best], c = cm[best + 1], den = a - 2 * b + c;
      if (Math.abs(den) > 1e-12) t = best + 0.5 * (a - c) / den;
    }
    // 原取樣率細部搜尋
    const D = this.D, tf = t * D;
    if (D > 1) {
      const k0 = Math.max(4, Math.floor(tf - D - 1)), k1 = Math.ceil(tf + D + 1);
      const Wf = Math.min(4000, Math.round(tf * 2));
      const base = this.n - Wf - k1 - 1, X = this.mono, M = this.M;
      let bk = -1, bv = Infinity; const vals = [];
      for (let k = k0; k <= k1; k++) {
        let s = 0;
        for (let j = 0; j < Wf; j += 2) { const df = X[(base + j) & M] - X[(base + j + k) & M]; s += df * df; }
        vals.push(s);
        if (s < bv) { bv = s; bk = k; }
      }
      const i = bk - k0;
      let tr = bk;
      if (i > 0 && i < vals.length - 1) { const a = vals[i - 1], b = vals[i], c = vals[i + 1], den = a - 2 * b + c; if (Math.abs(den) > 1e-12) tr = bk + 0.5 * (a - c) / den; }
      return sampleRate / tr;
    }
    return sampleRate / tf;
  }

  allowed(mask, k) { return (mask >> (((k % 12) + 12) % 12)) & 1; }

  // 音符內部的音高曲線：cv = [{t: 0–1, c: cents}]（已排序），回傳這個位置的 cents 偏移
  curveCents(cv, proj, note) {
    const x = Math.max(0, Math.min(1, (proj - note.s) / Math.max(1e-6, note.e - note.s)));
    if (cv.length === 1) return cv[0].c;
    let i = 0;
    while (i < cv.length - 1 && cv[i + 1].t <= x) i++;
    const a = cv[i], b = cv[i + 1];
    if (!b) return a.c;
    const span = b.t - a.t;
    const w = span > 1e-9 ? Math.max(0, Math.min(1, (x - a.t) / span)) : 0;
    return a.c + (b.c - a.c) * w;
  }

  // ctx 時刻 → 專案秒數（用 engine 送來的對照表；找不到就回 null）
  projectOf(c) {
    const S = this.segs;
    if (!S || !S.length) return null;
    if (c < S[0].c - 0.25) return null;
    let best = S[0];
    for (const s of S) { if (s.c <= c) best = s; else break; }
    return best.p + (c - best.c);
  }

  // 目前位置有沒有手動編輯的音符（跨區段/倒退播放都能處理）
  noteAt(proj) {
    const N = this.notes;
    if (!N || !N.length || proj == null) return null;
    let i = this.ni;
    if (i > N.length) i = 0;
    while (i > 0 && i - 1 < N.length && N[i - 1].s > proj) i--;
    while (i < N.length && N[i].e <= proj) i++;
    while (i > 0 && N[i - 1].s <= proj && N[i - 1].e > proj) i--;
    this.ni = i;
    const n = N[i];
    return n && n.s <= proj && proj < n.e ? n : null;
  }

  nearest(m, mask) {
    if (!mask) return m;
    let best = -1, bd = 99;
    for (let k = Math.floor(m) - 7; k <= Math.ceil(m) + 7; k++) {
      if (this.allowed(mask, k)) { const d = Math.abs(k - m); if (d < bd) { bd = d; best = k; } }
    }
    const cur = this.cur;
    // 遲滯：新音必須明顯比目前的音更近才切換
    if (cur >= 0 && cur !== best && this.allowed(mask, cur) && Math.abs(m - cur) - bd < 0.12) return cur;
    this.cur = best;
    return best;
  }

  addGrain(m, s, H) {
    const s0 = Math.round(s), M = this.M, iH = Math.PI / H;
    const H0 = Math.floor(H);
    for (let k = -H0; k <= H0; k++) {
      const w = 0.5 + 0.5 * Math.cos(k * iH);
      const p = m + k, i = Math.floor(p), f = p - i;
      const o = (s0 + k) & M, a = i & M, b = (i + 1) & M;
      const in0 = this.inb[0], in1 = this.inb[1];
      this.ola[0][o] += w * (in0[a] + (in0[b] - in0[a]) * f);
      this.ola[1][o] += w * (in1[a] + (in1[b] - in1[a]) * f);
      this.ws[o] += w;
    }
  }

  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const len = out[0].length, nIn = inp ? inp.length : 0, M = this.M, sr = sampleRate;
    const D = this.D, DM = this.DN - 1;
    for (let i = 0; i < len; i++) {
      const idx = this.n & M;
      const x0 = nIn ? inp[0][i] : 0, x1 = nIn > 1 ? inp[1][i] : x0;
      this.inb[0][idx] = x0; this.inb[1][idx] = x1;
      const m = (x0 + x1) * 0.5; this.mono[idx] = m;
      const y = this.biq(this.lp[1], this.biq(this.lp[0], m));
      if (++this.dc >= D) { this.dc = 0; this.dec[this.dn & DM] = y; this.dn++; }
      const w = this.ws[idx];
      const g = w > 1e-6 ? 1 / Math.max(w, 0.3) : 0;
      out[0][i] = this.ola[0][idx] * g;
      if (out.length > 1) out[1][i] = this.ola[1][idx] * g;
      this.ola[0][idx] = 0; this.ola[1][idx] = 0; this.ws[idx] = 0;
      this.n++;
    }

    // ---- 分析 ----
    // 現場模式窗變短：最低音域要跟著提高，否則一顆 grain 放不進去
    const fminEff = Math.max(params.fmin[0], this.L <= Math.round(0.02 * sr) ? 100 : 50);
    const f = this.detect(fminEff, params.fmax[0]);
    const blkSec = len / sr;
    const mask = Math.round(params.mask[0]);
    const refp = params.refp[0] || 440;
    if (f > 0) {
      const raw = 69 + 12 * Math.log2(f / refp);
      if (!this.voiced) { this.h3 = [raw, raw, raw]; this.center = raw; this.shift = 0; this.cur = -1; }
      this.h3.shift(); this.h3.push(raw);
      const s3 = this.h3.slice().sort((a, b) => a - b);
      const mi = s3[1];
      const hum = params.humanize[0];
      // 換音（跳超過顫音幅度）時中心直接跟上，否則慢速中心會落後，造成換音瞬間修過頭
      if (Math.abs(mi - this.center) > 0.8) this.center = mi;
      else this.center += (mi - this.center) * (1 - Math.exp(-blkSec / (0.12 + 0.45 * hum)));
      const vib = params.vibrato[0];
      let ref = mi + vib * (this.center - mi);
      if (hum > 0) {
        // 人性化：極慢的隨機漂移（最多 ±12 cent），讓長音不會被鎖死在音階正中央。
        // 係數 115 是照「一階低通隨機漫步」推的：衰減 0.992 時要這麼大的擾動，穩態標準差才會到 0.7。
        this.hw = (this.hw || 0) * (1 - Math.min(0.5, blkSec * 3)) + (Math.random() - 0.5) * blkSec * 115;
        this.hw = Math.max(-1, Math.min(1, this.hw));
        ref += this.hw * hum * 0.12;
      }
      // 手動編輯過這一段 → 直接以編輯的音高為目標（不受音階遮罩與遲滯影響）
      // 輸入訊號比輸出早 L 秒進來，所以要查「輸入所在」的專案位置
      const proj = this.projectOf(currentTime);
      const at = proj == null ? null : proj + this.L / sr;
      const note = at == null ? null : this.noteAt(at);
      // 換音符時記下進入時間與上一個目標音（滑音要從這裡滑過去）
      if (note !== this.curNote) {
        this.prevTgt = this.lastTgt === undefined ? null : this.lastTgt;
        this.curNote = note; this.noteT = at;
      }
      let tgt, amt;
      if (note) {
        tgt = note.midi;
        // 音高曲線：音符內部的起伏（手繪的）；平直化的音忽略曲線
        const cv = !note.flat && note.curve;
        if (cv && cv.length && at != null) tgt = note.midi + this.curveCents(cv, at, note) / 100;
        // 平直化（Make Curve）：完全修正、而且不受顫音影響 → 整顆音拉成平的
        amt = note.flat ? 1 : params.amount[0] * Math.max(0, Math.min(1, note.amt ?? 1));
        const sl = note.slide || 0;
        if (sl > 0 && this.prevTgt != null && at != null) {
          const w = Math.max(0, Math.min(1, (at - this.noteT) / sl));
          tgt = this.prevTgt + (note.midi - this.prevTgt) * w;
        }
        if (note.flat) ref = mi;
      } else {
        tgt = this.nearest(ref, mask);
        const flex = params.flex[0];
        let fs = 1;
        if (flex > 0) {
          // 彈性修音：離目標音越近，修得越少（0 = 完全不理，1 = ±50 cent 內不硬拉）
          const w = flex * 0.5;
          const k = Math.min(1, Math.abs(ref - tgt) / w);
          fs = k * k * (3 - 2 * k);
        }
        amt = params.amount[0] * fs;
      }
      let st = (tgt - ref) * amt;
      st = Math.max(-12, Math.min(12, st));
      const rt = params.retune[0];
      const a = rt <= 0.5 ? 1 : 1 - Math.exp(-blkSec * 1000 / rt);
      this.shift += (st - this.shift) * a;
      this.Pin = sr / Math.pow(2, (mi - 69) / 12) / refp;
      this.voiced = true;
      this.lastMidi = mi; this.lastTgt = tgt;
    } else {
      this.voiced = false;
      this.shift = 0;
      this.Pin = this.Pu;
    }
    const Pin = this.Pin;
    const r = this.voiced ? Math.pow(2, this.shift / 12) : 1;
    const Pout = Pin / r;

    // ---- 分析標記：每個週期一個 ----
    while (this.lastMark + Pin <= this.n - Pin) {
      this.lastMark += Pin;
      this.marks[this.mi & 255] = this.lastMark; this.mi++;
    }
    // ---- 合成 ----
    let H = Math.max(Pin, Pout);
    H = Math.max(32, Math.min(H, this.L - Pin - 130));
    if (this.nextSynth < this.n + H) this.nextSynth = this.n + H;
    let guard = 0;
    while (this.nextSynth <= this.n + this.L - Pin && guard++ < 64) {
      const s = this.nextSynth, a = s - this.L;
      // 找最接近 a、且整個 grain 已經寫入的分析標記
      let bm = this.lastMark, bd = Infinity;
      const lim = this.n - H;
      for (let k = 0; k < Math.min(this.mi, 256); k++) {
        const mk = this.marks[(this.mi - 1 - k) & 255];
        if (mk > lim) continue;
        const dd = Math.abs(mk - a);
        if (dd < bd) { bd = dd; bm = mk; } else if (mk < a) break;
      }
      if (bm > lim) bm = lim;
      this.addGrain(bm, s, H);
      this.nextSynth += Pout;
    }

    // ---- 回報給介面 ----
    if (this.report && (++this.blk % 6 === 0)) {
      this.port.postMessage({
        t: currentTime, v: this.voiced ? 1 : 0,
        mi: this.voiced ? this.lastMidi : 0,
        tgt: this.voiced ? this.lastTgt : 0,
        out: this.voiced ? this.lastMidi + this.shift : 0,
      });
    }
    return true;
  }
}
registerProcessor('zy-autotune', AutoTune);
