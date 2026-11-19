// 人聲和聲（Harmony）AudioWorklet：從一條主唱即時產生 1～4 部和聲
//
// 1) 音高偵測：與人聲修音相同（低通 → 降頻 → YIN → 原取樣率細部搜尋），全部聲部共用一次。
// 2) 每個聲部決定目標音：
//    - 依調性：主唱的音先對到最近的音階音 q，再沿音階走 n 級（n = 2 是三度、4 是五度…）
//    - 依和弦：在目前和弦的組成音裡，找方向相同、距離最接近「n 級」的那個音（三度 → 上一個和弦音）
//    - 同度／八度固定 0 / ±12 半音
//    「和聲音準」100% = 和聲完全落在目標音；調低則保留主唱原本的音準起伏。
// 3) 重建：每個聲部各跑一次 TD-PSOLA（共用分析標記），共振峰保留，所以和聲聽起來仍是同一個人。
//    無聲／子音段落以恆等重疊相加通過，並把和聲壓小（不然子音會被疊成好幾倍）。
// 4) 時間軸：engine 告訴 worklet「ctx 時刻 c 對應專案第 p 秒」，worklet 自己換算目前位置，
//    依位置查段落（哪些聲部、幾度）、和弦、音量曲線。離線輸出時同一份資料由 processorOptions 帶入。
// 延遲 L = 32 ms（與人聲修音相同），engine 做延遲補償；主唱也在這裡延遲 L，與和聲對齊。

const SR = sampleRate;

class Harmony extends AudioWorkletProcessor {
  constructor(opt) {
    super();
    const po = (opt && opt.processorOptions) || {};
    this.report = !!po.report;
    this.cfg = po.cfg || null;
    this.segs = po.segs || [];
    this.port.onmessage = e => {
      if (e.data.cfg) this.cfg = e.data.cfg;
      if (e.data.segs) this.segs = e.data.segs;
    };
    this.L = Math.round(0.032 * SR);
    this.N = 1 << 14; this.M = this.N - 1;
    this.inb = [new Float32Array(this.N), new Float32Array(this.N)];
    this.mono = new Float32Array(this.N);
    this.n = 0;
    this.D = Math.max(1, Math.round(SR / 12000));
    this.fsd = SR / this.D;
    this.DN = 2048; this.dec = new Float32Array(this.DN); this.dn = 0; this.dc = 0;
    this.scr = new Float32Array(1024); this.dfn = new Float32Array(512); this.cm = new Float32Array(512);
    const fc = 0.38 * this.fsd / 2, w0 = 2 * Math.PI * Math.min(fc, SR * 0.45) / SR;
    const mk = Q => { const al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al; return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 }; };
    this.lp = [mk(0.5412), mk(1.3066)];
    this.Pu = Math.round(0.004 * SR);
    this.Pin = this.Pu; this.voiced = false;
    this.marks = new Float64Array(256); this.mi = 1; this.lastMark = 0;
    this.h3 = [0, 0, 0]; this.q = -1; this.lastMidi = 0;
    // 每個聲部的狀態
    this.V = [0, 1, 2, 3].map(i => ({
      ola: new Float32Array(this.N), ws: new Float32Array(this.N),
      next: this.L, shift: 0, env: 0, comp: 1, gl: 0.7, gr: 0.7, tgt: 0, active: false,
      // 人性化：每個聲部固定的小偏差（cent、ms）與慢速飄移
      cents: [4, -5, 7, -3][i], dms: [9, 15, 21, 12][i], rate: [0.23, 0.31, 0.17, 0.27][i], ph: i * 1.7,
    }));
    this.leadG = 1; this.blk = 0;
  }

  biq(s, x) { const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2; s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y; return y; }

  // 與 autotune-worklet.js 相同的 YIN；回傳 Hz，無聲回傳 0
  detect(fmin, fmax) {
    const fsd = this.fsd;
    const tmin = Math.max(2, Math.floor(fsd / fmax)), tmax = Math.min(480, Math.ceil(fsd / fmin));
    const W = tmax, len = W + tmax + 2;
    if (this.dn < len) return 0;
    const x = this.scr, DM = this.DN - 1;
    for (let i = 0; i < len; i++) x[i] = this.dec[(this.dn - len + i) & DM];
    let e = 0; for (let i = 0; i < W; i++) { const v = x[tmax + i] || 0; e += v * v; }
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
      return SR / tr;
    }
    return SR / tf;
  }

  static ok(mask, k) { return (mask >> (((k % 12) + 12) % 12)) & 1; }

  // 主唱的音 → 最近的允許音（有遲滯）
  quantize(m, mask) {
    let best = Math.round(m), bd = 99;
    if (mask) {
      for (let k = Math.floor(m) - 7; k <= Math.ceil(m) + 7; k++) if (Harmony.ok(mask, k)) { const d = Math.abs(k - m); if (d < bd) { bd = d; best = k; } }
    } else bd = Math.abs(best - m);
    const cur = this.q;
    if (cur >= 0 && cur !== best && (!mask || Harmony.ok(mask, cur)) && Math.abs(m - cur) - bd < 0.15) return cur;
    this.q = best;
    return best;
  }

  // 沿音階走 n 級
  static stepScale(q, n, mask) {
    if (!mask) return q + Math.round(n * 12 / 7);
    let k = q, left = Math.abs(n), dir = n > 0 ? 1 : -1, guard = 0;
    while (left > 0 && guard++ < 40) { k += dir; if (Harmony.ok(mask, k)) left--; }
    return k;
  }

  // 在和弦音裡找：方向與 n 相同、距離最接近 n 級（n × 12/7 半音）的音
  static chordTone(q, n, pcs) {
    const nom = n * 12 / 7, dir = n > 0 ? 1 : -1;
    let best = q + Math.round(nom), bd = 99;
    for (let d = 1; d <= 14; d++) {
      const k = q + dir * d;
      if (!(pcs >> (((k % 12) + 12) % 12) & 1)) continue;
      const dd = Math.abs(d - Math.abs(nom));
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  }

  target(q, n, cfg, chordPcs) {
    if (n === 0) return q;
    if (n === 7 || n === -7) return q + (n > 0 ? 12 : -12);
    if (n === 14 || n === -14) return q + (n > 0 ? 24 : -24);
    if (chordPcs) return Harmony.chordTone(q, n, chordPcs);
    return Harmony.stepScale(q, n, cfg.mask);
  }

  // 目前專案位置（秒）；沒在播放 → NaN
  position(T) {
    const segs = this.segs, off = this.cfg ? this.cfg.off || 0 : 0;
    let s = null;
    for (const g of segs) if (g.c - off <= T + 1e-6 && (!s || g.c > s.c)) s = g;
    if (!s) return NaN;
    const pos = s.p + (T - s.c) + off;
    return pos;
  }

  static find(list, pos) {
    if (!list || !(pos === pos)) return null;
    for (const x of list) if (pos >= x.s && pos < x.e) return x;
    return null;
  }

  static curveAt(pts, pos) {
    if (!pts || !pts.length || !(pos === pos)) return 1;
    if (pos <= pts[0].s) return pts[0].v;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (pos <= b.s) return b.s > a.s ? a.v + (b.v - a.v) * (pos - a.s) / (b.s - a.s) : b.v;
    }
    return pts[pts.length - 1].v;
  }

  addGrain(V, m, s, H) {
    const s0 = Math.round(s), M = this.M, iH = Math.PI / H, H0 = Math.floor(H), X = this.mono;
    for (let k = -H0; k <= H0; k++) {
      const w = 0.5 + 0.5 * Math.cos(k * iH);
      const p = m + k, i = Math.floor(p), f = p - i;
      const o = (s0 + k) & M, a = X[i & M];
      V.ola[o] += w * (a + (X[(i + 1) & M] - a) * f);
      V.ws[o] += w;
    }
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!out.length) return true;
    const cfg = this.cfg;
    const len = out[0].length, nIn = inp ? inp.length : 0, M = this.M, L = this.L;
    const D = this.D, DM = this.DN - 1, V = this.V;
    const o0 = out[0], o1 = out.length > 1 ? out[1] : null;
    const leadTarget = cfg ? cfg.lead : 1;
    const lg0 = this.leadG, lg1 = leadTarget;
    for (let i = 0; i < len; i++) {
      const idx = this.n & M;
      const x0 = nIn ? inp[0][i] : 0, x1 = nIn > 1 ? inp[1][i] : x0;
      this.inb[0][idx] = x0; this.inb[1][idx] = x1;
      const m = (x0 + x1) * 0.5; this.mono[idx] = m;
      const y = this.biq(this.lp[1], this.biq(this.lp[0], m));
      if (++this.dc >= D) { this.dc = 0; this.dec[this.dn & DM] = y; this.dn++; }
      // 主唱：延遲 L
      const di = (this.n - L) & M, lg = lg0 + (lg1 - lg0) * (i / len);
      let l = this.inb[0][di] * lg, r = this.inb[1][di] * lg;
      for (let v = 0; v < 4; v++) {
        const S = V[v], w = S.ws[idx];
        if (w > 1e-6) {
          // 重疊的 grain 只有波峰對齊、其餘部分不同相 → 以 √(窗總和) 正規化（實測各音程音量最平均）；
          // 往下移調 grain 之間有空隙 → 不放大（否則空隙被拉平，聲音變粗糙），改由 S.comp 補回
          const s = S.ola[idx] * S.comp / Math.sqrt(Math.max(w, 1));
          l += s * S.gl; r += s * S.gr;
        }
        S.ola[idx] = 0; S.ws[idx] = 0;
      }
      o0[i] = l; if (o1) o1[i] = r;
      this.n++;
    }
    this.leadG = leadTarget;
    if (!cfg) return true;

    // ---- 分析 ----
    const f = this.detect(cfg.fmin, cfg.fmax);
    const blkSec = len / SR;
    let q = 0, mi = 0;
    if (f > 0) {
      const raw = 69 + 12 * Math.log2(f / 440);
      if (!this.voiced) { this.h3 = [raw, raw, raw]; this.q = -1; }
      this.h3.shift(); this.h3.push(raw);
      const s3 = this.h3.slice().sort((a, b) => a - b);
      mi = s3[1];
      this.Pin = SR / (440 * Math.pow(2, (mi - 69) / 12));
      this.voiced = true;
    } else {
      this.voiced = false;
      this.Pin = this.Pu;
    }
    const Pin = this.Pin;
    // 分析標記：有聲時對齊到每個週期的波峰（聲門脈衝附近），重疊的 grain 才會同相相加；
    // 沒對齊的話，往上移調時相鄰 grain 互相抵消，音量會掉 3～7 dB
    const X = this.mono;
    while (this.lastMark + Pin <= this.n - Pin) {
      let mk = this.lastMark + Pin;
      if (this.voiced) {
        const r = Math.floor(Pin * 0.3), c = Math.round(mk);
        let bi = c, bv = -Infinity;
        for (let k = c - r; k <= c + r; k++) { const v = X[k & M]; if (v > bv) { bv = v; bi = k; } }
        mk = bi;
      }
      if (mk <= this.lastMark + Pin * 0.5) mk = this.lastMark + Pin * 0.5;
      this.lastMark = mk;
      this.marks[this.mi & 255] = mk; this.mi++;
    }

    // ---- 時間軸：段落、和弦、曲線 ----
    const pos = this.position(currentTime);
    const sec = Harmony.find(cfg.sections, pos);
    const ch = cfg.source === 1 ? Harmony.find(cfg.chords, pos) : null;
    const chordPcs = ch ? ch.pcs : 0;
    // 依和弦時，主唱對到半音（不受調性限制，避免和弦外音被硬拉）
    if (this.voiced) {
      const qmask = chordPcs ? 0 : cfg.mask;
      q = this.quantize(mi, qmask);
      this.lastMidi = mi;
    }
    const hum = cfg.humanize, tight = cfg.tight;
    const gA = 1 - Math.exp(-blkSec / 0.006), gR = 1 - Math.exp(-blkSec / 0.06);
    const glideA = cfg.glide <= 0.5 ? 1 : 1 - Math.exp(-blkSec * 1000 / cfg.glide);
    const report = this.report && (++this.blk % 6 === 0);
    const notes = report ? [0, 0, 0, 0] : null;

    for (let v = 0; v < 4; v++) {
      const S = V[v], vc = cfg.voices[v];
      // 段落模式：播放中只在段落裡唱、聲部與音程由段落決定；停止時（例如邊唱邊監聽）用基本設定
      let n = null;
      if (cfg.secMode && pos === pos) n = sec ? sec.iv[v] : null;
      else if (vc && vc.on) n = vc.n;
      const on = !!vc && n !== null && n !== undefined;
      // 音量：聲部音量 × 和聲總音量 × 曲線；子音時壓小
      let want = 0;
      if (on) {
        want = vc.g * cfg.hgain * Harmony.curveAt(cfg.curves[v], pos);
        if (!this.voiced) want *= 0.18;
      }
      S.env += (want - S.env) * (want > S.env ? gA : gR);
      // 聲像（等功率）
      const pan = Math.max(-1, Math.min(1, (vc ? vc.pan : 0) * cfg.width));
      const a = (pan + 1) * Math.PI / 4;
      S.gl = Math.cos(a) * S.env; S.gr = Math.sin(a) * S.env;
      if (S.env < 1e-4 && !on) { S.active = false; continue; }
      S.active = true;
      // 目標移調量
      let st = 0;
      if (this.voiced && on) {
        const t = this.target(q, n, cfg, chordPcs);
        st = (t - q) + tight * (q - mi);
        S.tgt = t;
        if (notes) notes[v] = t;
      }
      st = Math.max(-25, Math.min(25, st));
      if (!this.voiced) S.shift = st;
      else S.shift += (st - S.shift) * glideA;
      S.ph += blkSec * S.rate * 2 * Math.PI;
      const drift = hum * (S.cents + 5 * Math.sin(S.ph)) / 100;
      const r = this.voiced ? Math.pow(2, (S.shift + drift) / 12) : 1;
      // 往下移調：每秒的聲門脈衝變少、能量變小 → 補 √(1/r)（最多 +6 dB）
      S.comp = r < 1 ? Math.min(2, 1 / Math.sqrt(r)) : 1;
      const Pout = Pin / r;
      const dly = Math.round(hum * S.dms * 0.001 * SR);
      // ---- 合成 ----
      // grain 半寬 = 原本的一個週期（標準 TD-PSOLA）。若用 max(Pin, Pout)，往下移調時 grain 會包含好幾個原週期，
      // 疊回去仍是原本的音高（下八度會量到原音）
      const H = Math.max(32, Math.min(Pin, L - Pin - 130));
      if (S.next < this.n + H) S.next = this.n + H;
      let guard = 0;
      while (S.next <= this.n + L - Pin && guard++ < 64) {
        const s = S.next, aPos = s - L;
        let bm = this.lastMark, bd = Infinity;
        const lim = this.n - H;
        for (let k = 0; k < Math.min(this.mi, 256); k++) {
          const mk = this.marks[(this.mi - 1 - k) & 255];
          if (mk > lim) continue;
          const dd = Math.abs(mk - aPos);
          if (dd < bd) { bd = dd; bm = mk; } else if (mk < aPos) break;
        }
        if (bm > lim) bm = lim;
        this.addGrain(S, bm, s + dly, H);
        S.next += Pout;
      }
    }

    if (report) {
      this.port.postMessage({ t: currentTime, v: this.voiced ? 1 : 0, mi: this.voiced ? this.lastMidi : 0, q: this.voiced ? q : 0, notes, pos, chord: ch ? ch.name : '', sec: sec ? sec.i : -1 });
    }
    return true;
  }
}
registerProcessor('zy-harmony', Harmony);
