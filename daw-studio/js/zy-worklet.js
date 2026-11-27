// 織音合成器（ZY Synth）— 逐樣本 DSP 核心與 AudioWorklet 處理器
//
// 為什麼要寫 Worklet：這幾種「讓音色像真的樂器」的演算法，用一般 Web Audio 節點做不出來
// （或做得不像），而且每個音都靠節點堆疊會爆掉節點數。這裡用的都是硬體／軟體合成器
// 實際在跑的作法：
//   ‧ 帶限波表振盪器：鋸齒／方波／脈衝／三角／自訂諧波各準備 9 層波表（每層諧波數減半），
//     依音高挑一層，高音自動少算諧波，不會有數位別名雜訊（PPG／Waldorf 那一派）。
//   ‧ 零延遲狀態變數濾波器（TPT SVF, Zavalishin）：截止頻率可逐樣本掃、共振不會爆；
//     串兩級＝24 dB/oct，就是 Moog／Juno 四極低通的味道。
//   ‧ FM（載波＋調變器，比例與指數包絡）：DX7 那一派，電鋼琴、鐘琴、銅管的金屬感靠它。
//   ‧ Karplus-Strong 撥弦模型：延遲線＋一階低通＋回授，鋼琴、吉他、箏、豎琴、撥弦貝斯
//     是真的「弦在震動」，不是取樣也不是硬湊的鋸齒。
//   ‧ 共振峰（formant）：三段帶通並聯，做出 a／e／i／o／u 母音；合唱、嗩吶、薩克斯風靠它。
//   ‧ 鼓：鼓皮（正弦掉音）＋雜訊（濾波）＋金屬（六個方波），三種單元組合出整組鼓。
//
// 訊息協定（主執行緒 → 這裡）：
//   { t:'patch', p }           註冊音色（一條軌第一次用到時送一次）
//   { t:'on', id, pid, n, v, at }   起音；at = AudioContext 時間（秒）；n = MIDI 音高
//   { t:'off', id, at, fast }       放音
//   { t:'kill', id } { t:'panic' }  立即消音
// 一個 node 負責一整條軌的複音：節點數固定，不隨音符數增加。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 整體輸出補償：單音目標峰值約 -9 dBFS，留給和弦與效果器的餘裕
const OUT = 3.2;

// ────────────────────────────── 波表 ──────────────────────────────
const SIZE = 1024, LEVELS = 9, HMAX = 64;
const waveCache = new Map();

// 各波形的諧波振幅（n 從 1 開始）
function harmAmp(w, n, spec) {
  switch (w) {
    case 'saw': return 1 / n;
    case 'sqr': return (n & 1) ? 1 / n : 0;
    case 'tri': return (n & 1) ? ((((n - 1) >> 1) & 1) ? -1 : 1) / (n * n) : 0;
    case 'pls': return Math.sin(Math.PI * n * (spec.pw || 0.5)) / n;   // 脈衝：pw = 工作週期
    case 'harm': return (spec.harm && spec.harm[n - 1]) || 0;          // 自訂諧波列（加法合成）
    case 'sin': default: return n === 1 ? 1 : 0;
  }
}

function buildWave(spec) {
  const levels = [];
  for (let L = 0; L < LEVELS; L++) {
    const H = Math.max(1, HMAX >> L);
    const tab = new Float32Array(SIZE + 1);
    for (let n = 1; n <= H; n++) {
      const amp = harmAmp(spec.w, n, spec);
      if (!amp) continue;
      // 用旋轉遞推算 sin(2πni/SIZE)：比每個樣本呼叫 Math.sin 快一個量級
      const step = (2 * Math.PI * n) / SIZE;
      const cs = Math.cos(step), sn = Math.sin(step);
      let c = 1, s = 0;
      for (let i = 0; i < SIZE; i++) {
        tab[i] += amp * s;
        const nc = c * cs - s * sn;
        s = s * cs + c * sn;
        c = nc;
      }
    }
    let peak = 0;
    for (let i = 0; i < SIZE; i++) { const a = tab[i] < 0 ? -tab[i] : tab[i]; if (a > peak) peak = a; }
    if (peak > 1e-6) for (let i = 0; i < SIZE; i++) tab[i] /= peak;
    tab[SIZE] = tab[0];
    levels.push(tab);
  }
  return levels;
}

function wave(spec) {
  let w = waveCache.get(spec.key);
  if (!w) { w = buildWave(spec); waveCache.set(spec.key, w); }
  return w;
}

// 依基頻挑波表層級（諧波數上限）
function levelFor(f0, sr) {
  const allowed = (0.45 * sr) / Math.max(8, f0);
  if (allowed >= HMAX) return 0;
  return clamp(Math.ceil(Math.log2(HMAX / allowed)), 0, LEVELS - 1);
}

// ────────────────────────────── 包絡 ──────────────────────────────
// 0 待機 / 1 起音（線性）/ 2 衰減（指數趨向 sustain）/ 3 放音（指數趨 0）/ 4 結束
class Env {
  constructor() { this.v = 0; this.st = 4; }
  setup(a, d, s, r, sr, dScale) {
    const k = dScale || 1;
    this.incA = a > 0.0006 ? 1 / (a * sr) : 1;
    this.kD = 1 - Math.exp(-3 / Math.max(1, d * k * sr));
    this.s = clamp(s, 0, 1);
    this.kR = 1 - Math.exp(-3 / Math.max(1, r * sr));
  }
  on() { this.v = 0; this.st = this.incA >= 1 ? 2 : 1; }
  off(fast, sr) {
    if (this.st === 4) return;
    if (fast) this.kR = 1 - Math.exp(-3 / (0.012 * (sr || 48000)));
    this.st = 3;
  }
  tick() {
    switch (this.st) {
      case 1: this.v += this.incA; if (this.v >= 1) { this.v = 1; this.st = 2; } break;
      case 2: this.v += (this.s - this.v) * this.kD; if (this.v < 0.0004) { this.v = 0; this.st = 4; } break;
      case 3: this.v -= this.v * this.kR; if (this.v < 0.0003) { this.v = 0; this.st = 4; } break;
      case 4: return 0;
    }
    return this.v;
  }
}

// ───────────────── 零延遲狀態變數濾波器（TPT SVF）─────────────────
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.a1 = 1; this.a2 = 0; this.a3 = 0; this.k = 1; this.low = 0; this.band = 0; this.high = 0; }
  set(fc, q, sr) {
    fc = clamp(fc, 12, sr * 0.45);
    const g = Math.tan(Math.PI * fc / sr);
    const k = 1 / clamp(q, 0.35, 24);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2; this.band = v1; this.high = x - this.k * v1 - v2;
    return v2;
  }
}

// ────────────────────────────── 雜訊 ──────────────────────────────
function makeNoise(seed) {
  let s = seed >>> 0 || 22222;
  let b0 = 0, b1 = 0, b2 = 0;
  return {
    white() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1; },
    pink() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const w = s / 0x3fffffff - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      return (b0 + b1 + b2 + w * 0.1848) * 0.23;
    },
  };
}

// ────────────────────────────── 單音 ──────────────────────────────
class Voice {
  constructor(P, midi, vel, sr) {
    this.P = P;
    this.sr = sr;
    this.midi = midi;
    this.dead = false;
    this.released = false;
    this.life = 0;          // 已經過的樣本數
    this.ctl = 0;

    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    this.f0 = f0;
    this.vk = Math.pow(vel / 127, P.vcurve ?? 1);
    this.kd = P.kdecay ? clamp(Math.pow(2, -(midi - 60) / 30), 0.25, 3) : 1;

    this.amp = new Env();
    this.amp.setup(P.amp.a, P.amp.d, P.amp.s, P.amp.r, sr, this.kd);
    this.flt = new Env();
    const fe = P.flt;
    this.flt.setup(fe.a ?? 0.004, fe.d ?? 0.6, fe.s ?? 0.2, fe.r ?? 0.4, sr, this.kd);

    // 振盪層
    this.layers = [];
    for (const o of P.osc || []) {
      const uni = clamp(o.uni || 1, 1, 5);
      const ph = new Float64Array(uni), base = new Float64Array(uni), inc = new Float64Array(uni);
      const gl = new Float64Array(uni), gr = new Float64Array(uni);
      const spread = o.spread || 0;
      for (let k = 0; k < uni; k++) {
        const d = uni === 1 ? 0 : (k / (uni - 1) - 0.5) * 2;      // -1 … +1
        const cents = (o.cents || 0) + d * spread;
        // 硬同步：從振盪器的頻率是「基頻 × sync」，每次主振盪器繞回原點就被歸零
        const f = o.sync
          ? f0 * o.sync * Math.pow(2, cents / 1200)
          : f0 * Math.pow(2, (o.oct || 0) + (o.semi || 0) / 12 + cents / 1200);
        inc[k] = (f * SIZE) / sr;
        base[k] = inc[k];
        ph[k] = ((o.phase || 0) + k * 0.371) % 1 * SIZE;
        const pan = clamp((o.pan || 0) + d * (o.wide || 0), -1, 1);
        gl[k] = Math.cos((pan + 1) * Math.PI / 4);
        gr[k] = Math.sin((pan + 1) * Math.PI / 4);
      }
      // 脈寬調變（PWM）：幾個固定寬度的波表之間交叉淡入，比即時算新波表便宜
      const PWMS = [0.5, 0.35, 0.2, 0.1];
      const lvl = o.sync ? levelFor(f0 * o.sync, sr) : levelFor(f0, sr);
      const pwmTabs = o.pwm ? PWMS.map(pw => wave({ w: 'pls', key: 'pls|' + pw, pw })[lvl]) : null;
      const g = (o.lvl ?? 0.5) * (o.key ? Math.pow(f0 / 261.6, o.key) : 1)
        * (o.vel ? (1 - o.vel) + o.vel * this.vk : 1) / Math.sqrt(uni);
      this.layers.push({
        tab: pwmTabs ? pwmTabs[0] : wave(o.wave)[lvl],
        tab2: null, pwmTabs,
        ph, base, inc, gl, gr, gain: g,
        sync: o.sync ? { base: (f0 * SIZE) / sr, ph: 0 } : null,
        fm: o.fm ? {
          ratio: o.fm.ratio || 1, cur: o.fm.idx || 0,
          k: 1 - Math.exp(-3 / Math.max(0.001, (o.fm.d ?? 0.4) * sr * this.kd)),
          ph: 0, amt: (o.fm.idx || 0) * SIZE * 0.16,
        } : null,
        dec: o.decay ? 1 - Math.exp(-3 / Math.max(0.001, o.decay * sr * this.kd)) : 0,
        decV: 1,
        atk: o.attack || 0,
      });
    }

    // 副振盪（低八度）
    this.sub = null;
    if (P.sub && P.sub.lvl) {
      const s = P.sub;
      const spec = { key: 's:' + (s.wave || 'sin'), w: s.wave || 'sin' };
      this.sub = {
        tab: wave(spec)[levelFor(f0 * Math.pow(2, s.oct || -1), sr)],
        ph: 0, base: (f0 * Math.pow(2, s.oct ?? -1) * SIZE) / sr, inc: 0, gain: s.lvl,
      };
      this.sub.inc = this.sub.base;
    }

    // 撥弦物理模型（Karplus-Strong）
    this.str = null;
    if (P.str && P.str.lvl) {
      const s = P.str;
      const n = clamp(Math.round(sr / f0 - 0.5), 2, 6000);
      const buf = new Float32Array(n);
      const nz = makeNoise((midi * 7919 + 13) >>> 0);
      const bright = clamp(s.bright ?? 0.5, 0, 1);
      let prev = 0;
      const lp = 0.03 + bright * 0.85;
      for (let i = 0; i < n; i++) { prev += (nz.white() - prev) * lp; buf[i] = prev * (1 - (i / n) * 0.5); }
      const t60 = Math.max(0.05, (s.decay ?? 2) * this.kd);
      this.str = {
        buf, n, i: 0,
        damp: Math.pow(0.001, 1 / (t60 * sr)),
        bright: 0.35 + bright * 0.6,
        gain: s.lvl * this.vk,
      };
    }

    // 雜訊（吹氣、擊槌、拉弓）
    this.noise = null;
    if (P.noise && P.noise.lvl) {
      const z = P.noise;
      const nv = {
        src: makeNoise((midi * 104729 + 7) >>> 0), pink: !!z.pink,
        env: new Env(), gain: z.lvl * ((1 - (z.vel || 0)) + (z.vel || 0) * this.vk),
        hp: z.hp ? new SVF() : null, lp: z.lp ? new SVF() : null, bp: z.bp ? new SVF() : null,
      };
      nv.env.setup(z.a ?? 0.001, z.d ?? 0.08, z.s ?? 0, z.r ?? 0.05, sr, this.kd);
      nv.env.on();
      if (nv.hp) nv.hp.set(z.hp, 0.7, sr);
      if (nv.lp) nv.lp.set(z.lp, 0.7, sr);
      if (nv.bp) nv.bp.set(z.bp, z.q || 1.4, sr);
      this.noise = nv;
    }

    // 共振峰（母音）
    this.frm = null;
    if (P.frm && P.frm.lvl) {
      const V = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240] };
      const v1 = V[P.frm.v || 'a'] || V.a, v2 = V[P.frm.v2 || P.frm.v || 'a'] || v1;
      const m = clamp(P.frm.morph ?? 0, 0, 1);
      const q = P.frm.q || 8;
      this.frm = {
        stages: [new SVF(), new SVF(), new SVF()],
        g: [1, 0.55, 0.3], gain: P.frm.lvl,
      };
      this.frm.stages.forEach((s, i) => s.set(v1[i] + (v2[i] - v1[i]) * m, q, sr));
    }

    // 濾波器（slope 2 ＝ 串兩級＝ 24 dB/oct）
    const f = P.flt;
    this.fType = f.type || 'lp';
    this.f1 = new SVF();
    this.f2 = f.slope === 2 ? new SVF() : null;
    this.fBase = f.f ?? 1200;
    this.fKey = f.key ?? 0;
    this.fQ = f.q ?? 0.7;
    this.fEnvAmt = f.env ?? 0;
    this.f1.set(this.fBase, this.fQ, sr);
    if (this.f2) this.f2.set(this.fBase, 0.55, sr);

    // 音高包絡（銅管滑音、鼓的掉音）
    this.pEnv = P.penv ? {
      cur: P.penv.amt || 0,
      k: 1 - Math.exp(-3 / Math.max(0.001, (P.penv.d ?? 0.08) * sr)),
    } : null;

    // LFO
    this.lfos = (P.lfo || []).map(l => ({
      ph: 0, inc: Math.max(0.001, l.rate) / sr, depth: l.depth || 0, to: l.to || 'pitch',
      shape: l.shape || 'sin', delay: l.delay || 0,
    }));

    this.gain = P.gain ?? 0.7;
    this.pan = P.pan || 0;
    this.drive = P.drive || 0;
    this.ampMod = 1;
    this.panMod = 0;
    this.cutMod = 0;
    this.pitchMul = 1;

    this.amp.on();
    this.flt.on();
    this.updateCtl();
  }

  // 控制率（每 16 個樣本一次）：LFO、音高包絡、頻率倍率、濾波器係數、PWM
  updateCtl() {
    const sr = this.sr;
    let pm = 1, am = 1, cm = 0, panm = 0, pwv = 0, sm = 1;
    for (const l of this.lfos) {
      l.ph += l.inc * 16;
      if (l.ph >= 1) l.ph -= Math.floor(l.ph);
      const raw = l.shape === 'tri' ? 1 - 4 * Math.abs(l.ph - 0.5)
        : l.shape === 'sqr' ? (l.ph < 0.5 ? 1 : -1)
          : Math.sin(2 * Math.PI * l.ph);
      const ramp = l.delay > 0 ? clamp((this.life / sr - l.delay) / 0.3, 0, 1) : 1;
      const v = raw * l.depth * ramp;
      if (l.to === 'pitch') pm *= Math.pow(2, v / 12);
      else if (l.to === 'cutoff') cm += v;
      else if (l.to === 'amp') am *= 1 + v * 0.5;
      else if (l.to === 'pan') panm += v;
      else if (l.to === 'pw') pwv += v;
      else if (l.to === 'sync') sm *= Math.pow(2, v * 2);    // 硬同步的比例掃頻（±2 個八度）
    }
    // PWM：把 LFO 的 -1…+1 映射到「寬 → 窄」的四張波表之間
    this.pwPos = clamp(0.5 - pwv * 0.5, 0, 1);
    const ppos = this.pwPos * 2.999;
    this.pwmI = Math.min(2, Math.floor(ppos));
    this.pwmMix = ppos - this.pwmI;
    if (this.pEnv) {
      this.pEnv.cur -= this.pEnv.cur * this.pEnv.k * 16;
      pm *= Math.pow(2, this.pEnv.cur / 1200);
    }
    this.pitchMul = pm;
    this.ampMod = am;
    this.panMod = panm;
    this.cutMod = cm;
    for (const l of this.layers) {
      // 硬同步層：掃頻改的是「從振盪器」的頻率，主振盪器（音高）不動 → 音色掃、音高不跑
      const mul = l.sync ? pm * sm : pm;
      for (let u = 0; u < l.ph.length; u++) l.inc[u] = l.base[u] * mul;
      if (l.pwmTabs) { l.tab = l.pwmTabs[this.pwmI]; l.tab2 = l.pwmTabs[this.pwmI + 1]; }
    }
    if (this.sub) this.sub.inc = this.sub.base * pm;

    const fk = this.fKey ? Math.pow(2, ((this.midi - 60) / 12) * this.fKey) : 1;
    const fe = this.flt.v;
    const oct = this.fEnvAmt * fe * fe + cm;
    const fc = this.fBase * fk * Math.pow(2, oct);
    this.f1.set(fc, this.fQ, sr);
    if (this.f2) this.f2.set(fc, 0.55, sr);
  }

  off(fast) {
    if (this.released) return;
    this.released = true;
    this.amp.off(fast, this.sr);
    this.flt.off(fast, this.sr);
    if (this.noise) this.noise.env.off(fast, this.sr);
  }

  // 把 [from, from+n) 的樣本「相加」到左右聲道
  render(L, R, from, n) {
    if (this.dead || from >= n) return;
    const LAY = this.layers, NL = LAY.length;
    const sub = this.sub, strs = this.str, nz = this.noise, frm = this.frm;
    const sr = this.sr;
    const panL = Math.cos((this.pan + 1) * Math.PI / 4) * 1.414;
    const panR = Math.sin((this.pan + 1) * Math.PI / 4) * 1.414;
    for (let i = from; i < n; i++) {
      if (--this.ctl <= 0) { this.ctl = 16; this.updateCtl(); }
      this.life++;

      const a = this.amp.tick();
      if (this.amp.st === 4) { this.dead = true; return; }
      this.flt.tick();

      // ── 振盪層（含 FM、硬同步、PWM 與齊奏）
      let x = 0, xr = 0;
      for (let k = 0; k < NL; k++) {
        const l = LAY[k];
        const ph = l.ph, inc = l.inc, gl = l.gl, gr = l.gr;
        let modv = 0;
        if (l.fm) {
          l.fm.ph += l.fm.ratio / sr; if (l.fm.ph >= 1) l.fm.ph -= 1;
          l.fm.cur -= l.fm.cur * l.fm.k;
          modv = Math.sin(2 * Math.PI * l.fm.ph) * l.fm.cur * SIZE * 0.16;
        }
        // 硬同步：主振盪器（音符基頻）每次繞回原點，從振盪器相位歸零
        let reset = false;
        if (l.sync) {
          l.sync.ph += l.sync.base * this.pitchMul;
          if (l.sync.ph >= SIZE) { l.sync.ph -= SIZE; reset = true; }
        }
        const tab = l.tab, tab2 = l.tab2, mixB = this.pwmMix;
        let lv = l.gain;
        if (l.dec) { l.decV -= l.decV * l.dec; lv *= l.decV; }
        if (l.atk > 0) { const t = (this.life / sr) / l.atk; if (t < 1) lv *= t; }
        if (ph.length === 1) {
          if (reset) ph[0] = 0;
          let q = ph[0] + modv; q -= Math.floor(q / SIZE) * SIZE;
          const idx = q | 0, fr = q - idx;
          let v = tab[idx] + (tab[idx + 1] - tab[idx]) * fr;
          if (tab2) v += ((tab2[idx] + (tab2[idx + 1] - tab2[idx]) * fr) - v) * mixB;
          ph[0] += inc[0]; if (ph[0] >= SIZE) ph[0] -= SIZE;
          x += v * lv; xr += v * lv;
        } else {
          for (let u = 0; u < ph.length; u++) {
            if (reset) ph[u] = 0;
            let q = ph[u] + modv; q -= Math.floor(q / SIZE) * SIZE;
            const idx = q | 0, fr = q - idx;
            let v = tab[idx] + (tab[idx + 1] - tab[idx]) * fr;
            if (tab2) v += ((tab2[idx] + (tab2[idx + 1] - tab2[idx]) * fr) - v) * mixB;
            ph[u] += inc[u]; if (ph[u] >= SIZE) ph[u] -= SIZE;
            x += v * gl[u] * lv; xr += v * gr[u] * lv;
          }
        }
      }

      // ── 副振盪
      if (sub) {
        const idx = sub.ph | 0;
        const v = sub.tab[idx] + (sub.tab[idx + 1] - sub.tab[idx]) * (sub.ph - idx);
        sub.ph += sub.inc; if (sub.ph >= SIZE) sub.ph -= SIZE;
        x += v * sub.gain; xr += v * sub.gain;
      }

      // ── 撥弦模型：延遲線＋低通＋回授
      if (strs) {
        const b = strs.buf, N = strs.n;
        const cur = b[strs.i];
        const pv = b[strs.i === 0 ? N - 1 : strs.i - 1];
        b[strs.i] = strs.damp * ((cur + pv) * 0.5 * strs.bright + cur * (1 - strs.bright));
        strs.i++; if (strs.i >= N) strs.i = 0;
        x += cur * strs.gain; xr += cur * strs.gain;
      }

      // ── 雜訊
      if (nz) {
        const e = nz.env.tick();
        if (e > 0) {
          let w = nz.pink ? nz.src.pink() : nz.src.white();
          if (nz.hp) { nz.hp.tick(w); w = nz.hp.high; }
          if (nz.lp) { nz.lp.tick(w); w = nz.lp.low; }
          if (nz.bp) { nz.bp.tick(w); w = nz.bp.band; }
          x += w * e * nz.gain; xr += w * e * nz.gain;
        }
      }

      // ── 濾波
      const f1 = this.f1;
      f1.tick(x);
      let y = this.fType === 'hp' ? f1.high : this.fType === 'bp' ? f1.band
        : this.fType === 'nt' ? f1.low - f1.high : f1.low;
      if (this.f2) { this.f2.tick(y); y = this.f2.low; }
      let yr = y;

      // ── 共振峰並聯（母音）
      if (frm) {
        let fxv = 0;
        for (let k = 0; k < 3; k++) { frm.stages[k].tick(x); fxv += frm.stages[k].band * frm.g[k]; }
        y = y * (1 - frm.gain) + fxv * frm.gain;
        yr = y;
      }

      // ── 驅動（軟削波）
      if (this.drive > 0) {
        const d = 1 + this.drive * 6, td = Math.tanh(d);
        y = td > 0.001 ? Math.tanh(y * d) / td : y;
        yr = y;
      }

      const g = a * this.vk * this.gain * this.ampMod * OUT;
      const pn = clamp(this.pan + this.panMod, -1, 1);
      L[i] += y * g * (pn === this.pan ? panL : Math.cos((pn + 1) * Math.PI / 4) * 1.414);
      R[i] += yr * g * (pn === this.pan ? panR : Math.sin((pn + 1) * Math.PI / 4) * 1.414);
    }
  }
}

// ────────────────────────────── 鼓 ──────────────────────────────
// 三種發聲單元：鼓皮（正弦掉音）、雜訊（濾波）、金屬（六個方波）。
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

class DrumVoice {
  constructor(P, midi, vel, sr) {
    this.sr = sr;
    this.dead = false;
    this.released = true;      // 鼓不吃 note-off
    this.t = 0;
    const v = Math.pow(vel / 127, 1.1);
    const def = DRUM_DEF(P.kit, midi);
    this.gain = (def.gain ?? 0.9) * v * (P.gain ?? 0.75);
    this.pan = def.pan || 0;
    this.len = def.len || 0.6;

    this.memb = (def.memb || []).map(m => {
      const env = new Env();
      env.setup(m.a ?? 0.001, m.d, 0, m.d, sr);
      env.on();
      return { f: m.f, f1: m.f1 ?? m.f, d: m.d, g: m.g ?? 1, ph: 0, env };
    });
    this.nz = (def.noise || []).map(nd => {
      const env = new Env();
      env.setup(nd.a ?? 0.001, nd.d, 0, nd.d, sr);
      env.on();
      const o = { env, g: nd.g ?? 1, src: makeNoise((midi * 31337 + 5) >>> 0), pink: !!nd.pink };
      if (nd.hp) { o.hp = new SVF(); o.hp.set(nd.hp, 0.7, sr); }
      if (nd.bp) { o.bp = new SVF(); o.bp.set(nd.bp, 1.1, sr); }
      if (nd.lp) { o.lp = new SVF(); o.lp.set(nd.lp, 0.7, sr); }
      return o;
    });
    const md = def.metal;
    if (md) {
      const env = new Env();
      env.setup(0.001, md.d, 0, md.d, sr);
      env.on();
      this.metal = {
        ph: new Float64Array(METAL.length), env, f: (md.f || 40) / 40,
        g: md.g ?? 0.5, hp: new SVF(), bp: new SVF(),
      };
      this.metal.hp.set(md.hpf || 6000, 0.7, sr);
      this.metal.bp.set(md.bpf || 9000, 0.8, sr);
    } else this.metal = null;
  }

  off() { /* 鼓不受放音影響 */ }

  render(L, R, from, n) {
    if (this.dead || from >= n) return;
    const sr = this.sr;
    const pl = Math.cos((this.pan + 1) * Math.PI / 4) * 1.414;
    const pr = Math.sin((this.pan + 1) * Math.PI / 4) * 1.414;
    for (let i = from; i < n; i++) {
      this.t += 1 / sr;
      let x = 0;
      for (const m of this.memb) {
        const e = m.env.tick();
        if (e <= 0) continue;
        const f = m.f1 + (m.f - m.f1) * Math.exp(-this.t / Math.max(0.0008, m.d * 0.35));
        m.ph += f / sr; if (m.ph >= 1) m.ph -= 1;
        x += Math.sin(2 * Math.PI * m.ph) * e * m.g;
      }
      for (const s of this.nz) {
        const e = s.env.tick();
        if (e <= 0) continue;
        let w = s.pink ? s.src.pink() : s.src.white();
        if (s.hp) { s.hp.tick(w); w = s.hp.high; }
        if (s.bp) { s.bp.tick(w); w = s.bp.band; }
        if (s.lp) { s.lp.tick(w); w = s.lp.low; }
        x += w * e * s.g;
      }
      if (this.metal) {
        const M = this.metal;
        const e = M.env.tick();
        if (e > 0) {
          let m = 0;
          for (let k = 0; k < METAL.length; k++) {
            M.ph[k] += (METAL[k] * M.f) / sr;
            if (M.ph[k] >= 1) M.ph[k] -= 1;
            m += M.ph[k] < 0.5 ? 1 : -1;
          }
          M.hp.tick(m * 0.16); M.bp.tick(M.hp.high);
          x += M.bp.band * e * M.g;
        }
      }
      const g = this.gain * OUT;
      L[i] += x * g * pl;
      R[i] += x * g * pr;
    }
    let live = false;
    if (this.metal && this.metal.env.st !== 4) live = true;
    for (const s of this.nz) if (s.env.st !== 4) live = true;
    for (const m of this.memb) if (m.env.st !== 4) live = true;
    if (!live && this.t > 0.05) this.dead = true;
    if (this.t > 8) this.dead = true;
  }
}

// GM 鼓位 → 合成參數（三套鼓：acoustic／808／909）
function DRUM_DEF(kit, midi) {
  const base = DRUM_CORE(kit === 'lofi' ? 'ac' : kit, midi);
  if (kit !== 'lofi') return base;
  // 低保真鼓組：整套偏低、衰減短一點，聽起來像舊取樣機
  const out = JSON.parse(JSON.stringify(base));
  (out.memb || []).forEach(m => { m.f *= 0.82; m.f1 = (m.f1 || m.f) * 0.82; m.d *= 0.7; });
  (out.noise || []).forEach(n => { n.d *= 0.65; if (n.bp) n.bp *= 0.75; if (n.hp) n.hp *= 0.8; if (n.lp) n.lp *= 0.7; });
  if (out.metal) { out.metal.d *= 0.55; out.metal.hpf *= 0.75; out.metal.bpf *= 0.8; }
  out.len = (out.len || 0.6) * 0.8;
  return out;
}

function DRUM_CORE(kit, midi) {
  const is808 = kit === 808 || kit === '808';
  const is909 = kit === 909 || kit === '909';
  const memb = (f, f1, d, g) => ({ f, f1, d, g });
  const nz = o => Object.assign({ d: 0.1, g: 0.6 }, o);
  const metal = o => Object.assign({ f: 40, d: 0.1, g: 0.5, hpf: 6000, bpf: 9000 }, o);
  if (midi <= 36) {
    if (is808) return { memb: [memb(112, 42, 0.85, 1.0)], noise: [nz({ d: 0.012, g: 0.16, lp: 3000 })], len: 1.4, gain: 1.0 };
    if (is909) return { memb: [memb(155, 50, 0.35, 1.0)], noise: [nz({ d: 0.02, g: 0.3, lp: 4000 })], len: 0.8 };
    return { memb: [memb(120, 48, 0.28, 1.0)], noise: [nz({ d: 0.012, g: 0.35, hp: 1800 })], len: 0.7 };
  }
  if (midi === 37) return { memb: [memb(420, 330, 0.03, 0.6)], noise: [nz({ d: 0.02, g: 0.4, bp: 2600 })], len: 0.25 };
  if (midi === 38 || midi === 40) {
    if (is808) return { memb: [memb(230, 180, 0.18, 0.5)], noise: [nz({ d: 0.2, g: 0.9, hp: 900, bp: 2400 })], len: 0.6 };
    if (is909) return { memb: [memb(290, 210, 0.12, 0.4)], noise: [nz({ d: 0.16, g: 1.0, hp: 1200, bp: 3200 })], len: 0.5 };
    return { memb: [memb(200, 170, 0.14, 0.55)], noise: [nz({ d: 0.22, g: 0.95, hp: 1100, bp: 2500 })], len: 0.6 };
  }
  if (midi === 39) return { noise: [nz({ d: 0.13, g: 1.0, bp: 1600 }), nz({ d: 0.02, g: 0.7, bp: 2600 })], len: 0.4 };
  if (midi === 41 || midi === 43 || midi === 45 || midi === 47 || midi === 48 || midi === 50) {
    const base = { 41: 82, 43: 98, 45: 116, 47: 140, 48: 168, 50: 196 }[midi] || 120;
    return { memb: [memb(base * 1.5, base, 0.35, 0.9)], noise: [nz({ d: 0.03, g: 0.2, hp: 2500 })], len: 0.8 };
  }
  if (midi === 42) {
    if (is808) return { metal: [metal({ f: 40, d: 0.06, g: 0.5, hpf: 8000, bpf: 10000 })], len: 0.25 };
    return { metal: [metal({ f: 40, d: 0.05, g: 0.55, hpf: 7500, bpf: 9500 })], noise: [nz({ d: 0.03, g: 0.3, hp: 8000 })], len: 0.2 };
  }
  if (midi === 44) return { metal: [metal({ f: 40, d: 0.035, g: 0.35, hpf: 8000, bpf: 10000 })], len: 0.15 };
  if (midi === 46) return { metal: [metal({ f: 40, d: is808 ? 0.5 : 0.32, g: 0.45, hpf: 7000, bpf: 9000 })], noise: [nz({ d: 0.2, g: 0.25, hp: 7000 })], len: 1.4 };
  if (midi === 49 || midi === 57 || midi === 52 || midi === 55) {
    return { metal: [metal({ f: 55, d: midi === 49 ? 1.6 : 0.9, g: 0.5, hpf: 4000, bpf: 7000 })], noise: [nz({ d: 1.2, g: 0.4, hp: 3500 })], len: 3.2 };
  }
  if (midi === 51 || midi === 59 || midi === 53) {
    if (midi === 53) return { metal: [metal({ f: 60, d: 0.5, g: 0.4, hpf: 5000, bpf: 8000 })], memb: [memb(820, 800, 0.1, 0.15)], len: 1.6 };
    return { metal: [metal({ f: 45, d: 0.45, g: 0.4, hpf: 5500, bpf: 8200 })], noise: [nz({ d: 0.3, g: 0.25, hp: 5000 })], len: 1.6 };
  }
  if (midi === 54) return { metal: [metal({ f: 80, d: 0.12, g: 0.3, hpf: 8000, bpf: 11000 })], noise: [nz({ d: 0.08, g: 0.5, hp: 6000 })], len: 0.4 };
  if (midi === 56) return { memb: [memb(560, 550, 0.12, 0.5), memb(845, 830, 0.1, 0.35)], noise: [nz({ d: 0.02, g: 0.2, bp: 1200 })], len: 0.5 };
  return { memb: [memb(180, 160, 0.12, 0.5)], noise: [nz({ d: 0.1, g: 0.4, bp: 2400 })], len: 0.4 };
}

// ────────────────────────────── 處理器 ──────────────────────────────
const MAX_VOICES = 64;

class ZYProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.patches = new Map();
    this.voices = [];            // { v, id, delay }
    this.byId = new Map();
    this.queue = [];
    this.port.onmessage = e => {
      try { this.msg(e.data); }
      catch (err) { this.port.postMessage({ t: 'err', msg: String(err && err.message || err) }); }
    };
  }

  msg(m) {
    if (!m) return;
    if (m.t === 'patch') { if (m.p) this.patches.set(m.p.id, m.p); return; }
    if (m.t === 'panic') {
      for (const v of this.voices) v.v.dead = true;
      this.voices.length = 0; this.byId.clear(); this.queue.length = 0; return;
    }
    if (m.t === 'kill') { const v = this.byId.get(m.id); if (v) { v.v.off(true); this.byId.delete(m.id); } return; }
    if (m.t === 'on' || m.t === 'off') {
      if (m.p) this.patches.set(m.p.id, m.p);
      this.queue.push(m);
      if (this.queue.length > 512) this.queue.splice(0, this.queue.length - 512);
    }
  }

  start(m) {
    const p = this.patches.get(m.pid);
    if (!p) { this.port.postMessage({ t: 'err', msg: 'no patch for ' + m.pid }); return; }
    if (this.voices.length >= MAX_VOICES) {
      let idx = this.voices.findIndex(v => v.v.released);
      if (idx < 0) idx = 0;
      const old = this.voices[idx];
      old.v.dead = true;
      this.voices.splice(idx, 1);
      if (this.byId.get(old.id) === old) this.byId.delete(old.id);
    }
    const v = p.drum ? new DrumVoice(p, m.n, m.v, this.sr) : new Voice(p, m.n, m.v, this.sr);
    const entry = { v, id: m.id, delay: m.delay || 0 };
    this.voices.push(entry);
    this.byId.set(m.id, entry);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out.length > 1 ? out[1] : out[0];
    const n = L.length;

    if (this.queue.length) {
      this.queue.sort((a, b) => a.at - b.at);
      const keep = [];
      for (const m of this.queue) {
        const off = (m.at - currentTime) * this.sr;
        if (off >= n) { keep.push(m); continue; }
        try {
          if (m.t === 'on') { m.delay = off < 0 ? 0 : Math.round(off); this.start(m); }
          else { const v = this.byId.get(m.id); if (v) { v.v.off(!!m.fast); this.byId.delete(m.id); } }
        } catch (err) {
          this.port.postMessage({ t: 'err', msg: 'start: ' + String(err && err.stack || err).slice(0, 300) });
        }
      }
      this.queue = keep;
    }

    for (const e of this.voices) {
      if (e.v.dead) continue;
      try { e.v.render(L, R, e.delay, n); } catch (err) {
        e.v.dead = true;
        this.port.postMessage({ t: 'err', msg: 'render: ' + String(err && err.stack || err).slice(0, 200) });
      }
      e.delay = 0;
    }
    if (this.voices.length) {
      let w = 0;
      for (const e of this.voices) if (!e.v.dead) this.voices[w++] = e;
      this.voices.length = w;
    }
    return true;
  }
}

registerProcessor('zy-synth', ZYProcessor);
