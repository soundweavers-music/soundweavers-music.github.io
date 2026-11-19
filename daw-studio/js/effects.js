// 效果器：全部用 Web Audio 原生節點組成，即時播放與離線輸出共用。
// 每個效果器實例：{ input, output, set(params), dispose(), meter? }
// 專案裡存的是 { id, type, on, params }，engine 依這份描述建節點。
import { uid } from './util.js';

// 參數描述：給檢閱器自動產生旋鈕/滑桿
// ---------- 8 段參數 EQ ----------
// params = { bands: [{ on, type, freq, gain, q } × 8], output }
export const EQ_BAND_TYPES = {
  highpass: { label: '低切', gain: false, slope: true },
  lowshelf: { label: '低架', gain: true },
  peaking: { label: '峰值', gain: true },
  notch: { label: '陷波', gain: false },
  highshelf: { label: '高架', gain: true },
  lowpass: { label: '高切', gain: false, slope: true },
};
// 每段的預設：頻段分佈接近一般硬體 EQ，預設全部 0 dB（只有低切/高切預設關閉）
export const EQ_DEFAULT_BANDS = [
  { on: false, type: 'highpass', freq: 40, gain: 0, q: 0.71 },
  { on: true, type: 'lowshelf', freq: 100, gain: 0, q: 0.71 },
  { on: true, type: 'peaking', freq: 250, gain: 0, q: 1 },
  { on: true, type: 'peaking', freq: 700, gain: 0, q: 1 },
  { on: true, type: 'peaking', freq: 2000, gain: 0, q: 1 },
  { on: true, type: 'peaking', freq: 5000, gain: 0, q: 1 },
  { on: true, type: 'highshelf', freq: 10000, gain: 0, q: 0.71 },
  { on: false, type: 'lowpass', freq: 18000, gain: 0, q: 0.71 },
];
export const EQ_BAND_COLORS = ['#ff6b6b', '#ff9f5a', '#f5d33d', '#9bd35a', '#35c9a5', '#4f9dff', '#a78bfa', '#f78fc3'];

// 舊版 3 段 EQ（lowGain/midGain/...）轉成 8 段
export function migrateEqParams(p) {
  if (p && Array.isArray(p.bands)) return p;
  const b = EQ_DEFAULT_BANDS.map(x => ({ ...x }));
  if (p) {
    if (p.hpf > 21) { b[0].on = true; b[0].freq = p.hpf; }
    b[1].freq = p.lowFreq ?? 100; b[1].gain = p.lowGain ?? 0;
    b[3].freq = p.midFreq ?? 1000; b[3].gain = p.midGain ?? 0; b[3].q = p.midQ ?? 1;
    b[6].freq = p.highFreq ?? 8000; b[6].gain = p.highGain ?? 0;
  }
  return { bands: b, output: 0 };
}

export const FX_TYPES = {
  eq: {
    name: 'EQ 等化器（8 段）', short: 'EQ', custom: 'eq',
    params: {
      output: { label: '輸出', min: -18, max: 18, step: 0.1, def: 0, unit: 'dB' },
    },
  },
  deess: {
    name: 'De-esser 去齒音', short: 'DeEss',
    params: {
      freq: { label: '齒音頻率', min: 3000, max: 12000, step: 50, def: 6500, unit: 'Hz', log: true },
      range: { label: '頻寬', min: 0.5, max: 2.5, step: 0.1, def: 1.2, unit: '八度' },
      threshold: { label: '門檻', min: -50, max: 0, step: 0.5, def: -28, unit: 'dB' },
      amount: { label: '最多壓', min: 0, max: 18, step: 0.5, def: 8, unit: 'dB' },
      listen: { label: '只聽齒音', min: 0, max: 1, step: 1, def: 0, toggle: true },
    },
  },
  tune: {
    name: 'Auto Tune 人聲修音', short: 'Tune', custom: 'tune',
    params: {
      key: { label: '主音', min: 0, max: 11, step: 1, def: 0 },
      scale: { label: '音階', min: 0, max: 9, step: 1, def: 0 },
      mask: { label: '音階遮罩', min: 0, max: 4095, step: 1, def: 2741 },
      retune: { label: '修正速度', min: 0, max: 400, step: 1, def: 40, unit: 'ms' },
      amount: { label: '修正強度', min: 0, max: 100, step: 1, def: 100, unit: '%' },
      vibrato: { label: '保留顫音', min: 0, max: 100, step: 1, def: 60, unit: '%' },
      range: { label: '音域', min: 0, max: 3, step: 1, def: 0 },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    },
  },
  pitch: {
    name: 'Pitch 即時移調（和聲／效果用）', short: 'Pitch',
    params: {
      semitones: { label: '半音', min: -24, max: 24, step: 1, def: 0, unit: '半音' },
      cents: { label: '微調', min: -100, max: 100, step: 1, def: 0, unit: 'cent' },
      window: { label: '顆粒大小', min: 20, max: 200, step: 1, def: 60, unit: 'ms' },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    },
  },
  sat: {
    name: 'Saturation 飽和度', short: 'Sat',
    params: {
      mode: { label: '特性', min: 0, max: 3, step: 1, def: 0, choices: ['磁帶', '真空管', '電晶體', '硬削波'] },
      drive: { label: '驅動', min: 0, max: 30, step: 0.5, def: 6, unit: 'dB' },
      tone: { label: '高頻', min: -12, max: 12, step: 0.5, def: 0, unit: 'dB' },
      output: { label: '輸出', min: -24, max: 6, step: 0.5, def: 0, unit: 'dB' },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    },
  },
  comp: {
    name: 'Compressor 壓縮器', short: 'Comp',
    params: {
      threshold: { label: '門檻', min: -60, max: 0, step: 0.5, def: -18, unit: 'dB' },
      ratio: { label: '比例', min: 1, max: 20, step: 0.1, def: 4, unit: ':1' },
      attack: { label: '起音', min: 0.1, max: 200, step: 0.1, def: 10, unit: 'ms', log: true },
      release: { label: '釋音', min: 10, max: 1000, step: 1, def: 150, unit: 'ms', log: true },
      knee: { label: '膝部', min: 0, max: 30, step: 1, def: 6, unit: 'dB' },
      makeup: { label: '補償增益', min: 0, max: 24, step: 0.5, def: 0, unit: 'dB' },
    },
  },
  reverb: {
    name: 'Reverb 殘響', short: 'Verb',
    params: {
      size: { label: '空間', min: 0.2, max: 8, step: 0.1, def: 2.2, unit: '秒' },
      predelay: { label: '預延遲', min: 0, max: 120, step: 1, def: 15, unit: 'ms' },
      damp: { label: '高頻衰減', min: 1000, max: 16000, step: 100, def: 7000, unit: 'Hz', log: true },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 25, unit: '%' },
    },
  },
  delay: {
    name: 'Delay 延遲', short: 'Delay',
    params: {
      time: { label: '時間', min: 0.03125, max: 2, step: 0.03125, def: 0.5, unit: '拍', sync: true },
      feedback: { label: '回授', min: 0, max: 90, step: 1, def: 35, unit: '%' },
      tone: { label: '音色', min: 800, max: 16000, step: 100, def: 5000, unit: 'Hz', log: true },
      pingpong: { label: '左右彈跳', min: 0, max: 1, step: 1, def: 0, toggle: true },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 25, unit: '%' },
    },
  },
  chorus: {
    name: 'Chorus 合唱', short: 'Chorus',
    params: {
      rate: { label: '速度', min: 0.05, max: 5, step: 0.05, def: 0.8, unit: 'Hz' },
      depth: { label: '深度', min: 0, max: 10, step: 0.1, def: 3, unit: 'ms' },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 40, unit: '%' },
    },
  },
  drive: {
    name: 'Distortion 失真', short: 'Drive',
    params: {
      drive: { label: '驅動', min: 0, max: 40, step: 0.5, def: 12, unit: 'dB' },
      tone: { label: '音色', min: 500, max: 12000, step: 100, def: 4000, unit: 'Hz', log: true },
      output: { label: '輸出', min: -24, max: 6, step: 0.5, def: -6, unit: 'dB' },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    },
  },
  gate: {
    name: 'Noise Gate 噪音閘', short: 'Gate',
    params: {
      threshold: { label: '門檻', min: -80, max: -10, step: 0.5, def: -50, unit: 'dB' },
      release: { label: '釋放', min: 10, max: 500, step: 1, def: 80, unit: 'ms' },
    },
  },
};
export const FX_ORDER = ['tune', 'eq', 'comp', 'deess', 'sat', 'pitch', 'reverb', 'delay', 'chorus', 'drive', 'gate'];
export const MAX_INSERTS = 6;

export function newFx(type) {
  const T = FX_TYPES[type];
  const params = {};
  for (const [k, d] of Object.entries(T.params)) params[k] = d.def;
  if (type === 'eq') params.bands = EQ_DEFAULT_BANDS.map(b => ({ ...b }));
  return { id: uid('fx'), type, on: true, params };
}

// 把飽和度曲線依特性產生（輸入 -1..1）
function satCurve(mode, drive) {
  const n = 4096, c = new Float32Array(n);
  const k = Math.pow(10, drive / 20);
  for (let i = 0; i < n; i++) {
    const x = (i * 2 / (n - 1) - 1) * k;
    let y;
    switch (mode) {
      case 0: { const b = 0.35; y = Math.tanh(x + b) - Math.tanh(b); break; }                           // 磁帶：柔和，偏壓帶來輕微偶次諧波（直流由後面的高通移除）
      case 1: y = x >= 0 ? 1 - Math.exp(-x) : -(1 - Math.exp(x * 1.4)) / 1.4 * 1.2; break;             // 真空管：正負半波不對稱
      case 2: y = x / Math.pow(1 + Math.pow(Math.abs(x), 2.5), 1 / 2.5); break;                          // 電晶體：比較硬的膝部
      default: y = Math.max(-1, Math.min(1, x));                                                         // 硬削波
    }
    c[i] = y;
  }
  // 正規化：讓 0 dBFS 輸入的輸出峰值接近 1，增益補償交給 output
  let pk = 0; for (const v of c) pk = Math.max(pk, Math.abs(v));
  if (pk > 0) for (let i = 0; i < n; i++) c[i] /= pk;
  return c;
}

const dbg = db => Math.pow(10, db / 20);

// 用程式產生殘響的脈衝響應：指數衰減的立體聲雜訊，高頻衰減得比較快
const irCache = new WeakMap();
function impulse(ctx, seconds, damp) {
  let m = irCache.get(ctx);
  if (!m) { m = new Map(); irCache.set(ctx, m); }
  const key = seconds.toFixed(2) + '|' + Math.round(damp / 100);
  if (m.has(key)) return m.get(key);
  const sr = ctx.sampleRate, len = Math.max(1, Math.round(sr * seconds));
  const b = ctx.createBuffer(2, len, sr);
  // 一階低通係數：damp 越低，尾巴越暗
  const a = Math.exp(-2 * Math.PI * damp / sr);
  let seed = 22222;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = seed / 2147483648 - 1;
      const t = i / len;
      // 越後面越暗：混合原始雜訊與低通雜訊
      lp = lp * a + n * (1 - a);
      const tone = n * (1 - t) + lp * t * 2.5;
      d[i] = tone * Math.pow(1 - t, 2.2) * Math.exp(-3 * t);
    }
    // 開頭 5ms 淡入，避免爆點
    const fi = Math.min(len, Math.round(sr * 0.005));
    for (let i = 0; i < fi; i++) d[i] *= i / fi;
  }
  m.set(key, b);
  return b;
}

function distortionCurve(amount) {
  const n = 2048, c = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

// 濕/乾混合：in → dry → out；in → wet chain → wetGain → out
function wetDry(ctx) {
  const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  return { input, output, dry, wet, setMix(pct) { const m = pct / 100; dry.gain.value = Math.cos(m * Math.PI / 2); wet.gain.value = Math.sin(m * Math.PI / 2); } };
}

// bpm：Delay 同步用
export function buildFx(ctx, desc, bpm = 120) {
  const P = desc.params;
  let fx;
  switch (desc.type) {
    case 'eq': {
      // 8 段串接；每段都建好，關閉的段用「直通」參數（peaking 0 dB），切換時不必重接線
      if (!Array.isArray(P.bands)) Object.assign(P, migrateEqParams(P));
      const input = ctx.createGain(), out = ctx.createGain();
      const filters = P.bands.map(() => ctx.createBiquadFilter());
      // 低切／高切可以 24 dB/oct：每段多串一個同參數的濾波器
      const second = P.bands.map(() => ctx.createBiquadFilter());
      let prev = input;
      filters.forEach((f, i) => { prev.connect(f); f.connect(second[i]); prev = second[i]; });
      prev.connect(out);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.75;
      out.connect(analyser);
      const pre = ctx.createAnalyser(); pre.fftSize = 4096; pre.smoothingTimeConstant = 0.75;
      input.connect(pre);
      const applyBand = (f, f2, b) => {
        const nyq = ctx.sampleRate / 2 * 0.98;
        const freq = Math.min(nyq, Math.max(10, b.freq));
        if (!b.on) { f.type = 'peaking'; f.gain.value = 0; f2.type = 'peaking'; f2.gain.value = 0; f.frequency.value = 1000; f2.frequency.value = 1000; return; }
        f.type = b.type; f.frequency.value = freq; f.Q.value = Math.max(0.1, b.q || 0.71); f.gain.value = b.gain || 0;
        // 低切／高切的「陡度」：slope 24 就多串一個；其他類型第二個濾波器維持直通
        if ((b.type === 'highpass' || b.type === 'lowpass') && (b.slope || 12) >= 24) {
          f2.type = b.type; f2.frequency.value = freq; f2.Q.value = f.Q.value;
        } else { f2.type = 'peaking'; f2.gain.value = 0; f2.frequency.value = 1000; }
      };
      fx = {
        input, output: out, analyser, preAnalyser: pre, filters,
        set(p) {
          if (!Array.isArray(p.bands)) Object.assign(p, migrateEqParams(p));
          p.bands.forEach((b, i) => applyBand(filters[i], second[i], b));
          out.gain.value = dbg(p.output || 0);
        },
        // 整體頻率響應（含輸出增益）
        response(freqs) {
          const mag = new Float32Array(freqs.length).fill(dbg(P.output || 0));
          const tmp = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
          for (const f of [...filters, ...second]) { f.getFrequencyResponse(freqs, tmp, ph); for (let i = 0; i < mag.length; i++) mag[i] *= tmp[i]; }
          return mag;
        },
        // 單一段的響應（畫每段的彩色小曲線）
        bandResponse(i, freqs) {
          const mag = new Float32Array(freqs.length).fill(1);
          const tmp = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
          for (const f of [filters[i], second[i]]) { f.getFrequencyResponse(freqs, tmp, ph); for (let k = 0; k < mag.length; k++) mag[k] *= tmp[k]; }
          return mag;
        },
      };
      break;
    }
    case 'deess': {
      // 動態 EQ 式去齒音（相位乾淨，不會像「分頻相減」那樣在其他頻段留下梳狀失真）：
      //   主訊號 → peaking 濾波器（中心 = 齒音頻率）→ out
      //   偵測鏈：帶通 → 整流 |x| → 低通平滑（≈ 包絡）→ 對照曲線轉成「要壓幾 dB」→ 接到 peaking.gain
      // 全部是音訊節點，即時播放與離線輸出結果一樣。
      const input = ctx.createGain(), out = ctx.createGain();
      const cut = ctx.createBiquadFilter(); cut.type = 'peaking'; cut.gain.value = 0;
      input.connect(cut).connect(out);
      const det1 = ctx.createBiquadFilter(), det2 = ctx.createBiquadFilter();
      det1.type = 'highpass'; det2.type = 'lowpass';
      const rect = ctx.createWaveShaper();
      { const n = 2049, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = Math.abs(i * 2 / (n - 1) - 1); rect.curve = c; }
      // 包絡平滑：兩級一階低通 ≈ attack/release 約 2 ms / 40 ms 的折衷
      const env1 = ctx.createBiquadFilter(), env2 = ctx.createBiquadFilter();
      env1.type = env2.type = 'lowpass'; env1.frequency.value = 60; env2.frequency.value = 60; env1.Q.value = env2.Q.value = 0.5;
      // 包絡（線性振幅 0..1）→ 衰減 dB（0 .. -amount）
      const map = ctx.createWaveShaper();
      const toGain = ctx.createGain(); toGain.gain.value = 1;
      input.connect(det1).connect(det2).connect(rect).connect(env1).connect(env2).connect(map).connect(toGain).connect(cut.gain);
      // 監聽：只輸出偵測頻段（讓使用者聽到齒音在哪）
      const listenBp = ctx.createBiquadFilter(); listenBp.type = 'bandpass';
      const listenG = ctx.createGain(); listenG.gain.value = 0;
      const mainG = ctx.createGain();
      cut.disconnect(); input.connect(cut); cut.connect(mainG).connect(out);
      input.connect(listenBp).connect(listenG).connect(out);
      let lastKey = '', grProbe = null;
      // 讀取目前衰減量（給介面顯示）：在包絡後面掛一個 analyser
      if (typeof ctx.startRendering !== 'function') { grProbe = ctx.createAnalyser(); grProbe.fftSize = 256; toGain.connect(grProbe); }
      const probeBuf = new Float32Array(256);
      fx = {
        input, output: out,
        set(p) {
          const lo = p.freq / Math.pow(2, p.range / 2), hi = p.freq * Math.pow(2, p.range / 2);
          det1.frequency.value = lo; det2.frequency.value = hi;
          cut.frequency.value = p.freq;
          // peaking 的 Q 依頻寬（八度）換算
          const bw = Math.pow(2, p.range);
          cut.Q.value = Math.sqrt(bw) / (bw - 1);
          listenBp.frequency.value = p.freq; listenBp.Q.value = cut.Q.value;
          const key = p.threshold + '|' + p.amount;
          if (key !== lastKey) {
            // 包絡經整流 + 低通後約為峰值的 0.64 倍（正弦平均值）；門檻用 dBFS 峰值表示
            const n = 1025, c = new Float32Array(n);
            const th = Math.pow(10, p.threshold / 20) * 0.64;
            for (let i = 0; i < n; i++) {
              const e = Math.abs(i * 2 / (n - 1) - 1);       // WaveShaper 輸入域 -1..1，包絡只會是正的
              if (e <= th) { c[i] = 0; continue; }
              // 超過門檻幾 dB → 以 3:1 的比例換成衰減，上限 amount
              const over = 20 * Math.log10(e / th);
              c[i] = -Math.min(p.amount, over * (2 / 3));
            }
            map.curve = c; lastKey = key;
          }
          mainG.gain.value = p.listen ? 0 : 1;
          listenG.gain.value = p.listen ? 1 : 0;
        },
        reduction() {
          if (!grProbe) return 0;
          grProbe.getFloatTimeDomainData(probeBuf);
          let m = 0; for (const v of probeBuf) if (v < m) m = v;
          return m;     // 負值 dB
        },
      };
      break;
    }
    case 'tune': {
      const wd = wetDry(ctx);
      let node = null;
      const live = typeof ctx.startRendering !== 'function';
      try {
        node = new AudioWorkletNode(ctx, 'zy-autotune', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { report: live } });
        wd.input.connect(node).connect(wd.wet);
      } catch (_) { wd.input.connect(wd.wet); }
      // 乾聲延遲同樣 32 ms，濕度不到 100% 時才不會有梳狀濾波
      const dryDelay = ctx.createDelay(0.1); dryDelay.delayTime.value = AUTOTUNE_LATENCY;
      wd.input.disconnect(wd.dry); wd.input.connect(dryDelay).connect(wd.dry);
      const listeners = new Set();
      if (node) node.port.onmessage = e => { for (const fn of listeners) fn(e.data); };
      fx = {
        input: wd.input, output: wd.output, worklet: node, latency: AUTOTUNE_LATENCY,
        onPitch(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set(p) {
          if (node) {
            const R = TUNE_RANGES[p.range | 0] || TUNE_RANGES[0];
            const set = (k, v) => node.parameters.get(k).setValueAtTime(v, 0);
            set('mask', p.mask); set('retune', p.retune); set('amount', p.amount / 100); set('vibrato', p.vibrato / 100);
            set('fmin', R.fmin); set('fmax', R.fmax);
          }
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'pitch': {
      const wd = wetDry(ctx);
      let node = null;
      try {
        node = new AudioWorkletNode(ctx, 'zy-pitch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        wd.input.connect(node).connect(wd.wet);
      } catch (_) {
        // worklet 還沒載入（理論上 engine 會先載好）：先直通，不讓整條鏈壞掉
        wd.input.connect(wd.wet);
      }
      // 乾聲也要延遲同樣的時間，否則濕度不是 100% 時會有梳狀濾波
      const dryDelay = ctx.createDelay(0.5);
      wd.input.disconnect(wd.dry); wd.input.connect(dryDelay).connect(wd.dry);
      fx = {
        input: wd.input, output: wd.output, worklet: node,
        set(p) {
          if (node) {
            node.parameters.get('semitones').value = p.semitones;
            node.parameters.get('cents').value = p.cents;
            node.parameters.get('window').value = p.window / 1000;
          }
          dryDelay.delayTime.value = p.window / 2000;
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'sat': {
      const wd = wetDry(ctx);
      const pre = ctx.createGain(), sh = ctx.createWaveShaper(), post = ctx.createGain();
      const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 4500;
      // 去直流：真空管模式的不對稱曲線會產生直流偏移
      const dc = ctx.createBiquadFilter(); dc.type = 'highpass'; dc.frequency.value = 12;
      sh.oversample = '4x';
      wd.input.connect(pre).connect(sh).connect(dc).connect(hs).connect(post).connect(wd.wet);
      let last = '';
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          const key = p.mode + '|' + p.drive;
          if (key !== last) { sh.curve = satCurve(p.mode | 0, p.drive); last = key; }
          // 驅動越大，輸出自動往下補，讓切換時音量接近（再由 output 微調）
          post.gain.value = dbg(p.output - p.drive * 0.35);
          hs.gain.value = p.tone;
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'comp': {
      const input = ctx.createGain();
      const c = ctx.createDynamicsCompressor();
      const mk = ctx.createGain();
      input.connect(c).connect(mk);
      fx = {
        input, output: mk, comp: c,
        set(p) {
          c.threshold.value = p.threshold; c.ratio.value = p.ratio; c.knee.value = p.knee;
          c.attack.value = p.attack / 1000; c.release.value = p.release / 1000;
          // 瀏覽器的 DynamicsCompressor（Chrome/Firefox/Safari 同一份 WebKit 實作）會自動加補償增益：
          //   makeup = (0 dBFS 輸入時的衰減量) × 0.6
          // 這裡把它扣回來，讓「補償增益」完全由使用者控制，壓縮器不會偷偷把聲音變大。
          const autoMakeupDb = 0.6 * (-p.threshold) * (1 - 1 / p.ratio);
          mk.gain.value = dbg(p.makeup - autoMakeupDb);
        },
        reduction: () => c.reduction,
      };
      break;
    }
    case 'reverb': {
      const wd = wetDry(ctx);
      const pre = ctx.createDelay(0.2);
      const conv = ctx.createConvolver();
      wd.input.connect(pre).connect(conv).connect(wd.wet);
      let lastKey = '';
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          pre.delayTime.value = p.predelay / 1000;
          const k = p.size + '|' + p.damp;
          if (k !== lastKey) { conv.buffer = impulse(ctx, p.size, p.damp); lastKey = k; }
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'delay': {
      const wd = wetDry(ctx);
      const dl = ctx.createDelay(4), dr = ctx.createDelay(4);
      const fb = ctx.createGain(), tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
      const merger = ctx.createChannelMerger(2);
      const mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
      // 一般模式：in → dl → tone → fb → dl；乒乓：L → R → L 交叉回授
      wd.input.connect(mono);
      let mode = -1;
      const wire = pp => {
        [mono, dl, dr, tone, fb, merger].forEach(n => { try { n.disconnect(); } catch (_) { /* noop */ } });
        mono.connect(dl);
        dl.connect(tone);
        if (pp) {
          tone.connect(dr); dr.connect(fb); fb.connect(dl);
          dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
        } else {
          tone.connect(fb); fb.connect(dl);
          dl.connect(merger, 0, 0); dl.connect(merger, 0, 1);
        }
        merger.connect(wd.wet);
      };
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          const pp = p.pingpong ? 1 : 0;
          if (pp !== mode) { wire(pp); mode = pp; }
          const sec = Math.min(4, p.time * 60 / bpm);
          dl.delayTime.value = sec; dr.delayTime.value = sec;
          fb.gain.value = Math.min(0.92, p.feedback / 100);
          tone.frequency.value = p.tone;
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'chorus': {
      const wd = wetDry(ctx);
      const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
      const dL = ctx.createDelay(0.05), dR = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator(), gL = ctx.createGain(), gR = ctx.createGain();
      // 左右 LFO 反相，製造寬度
      const inv = ctx.createGain(); inv.gain.value = -1;
      lfo.connect(gL).connect(dL.delayTime);
      lfo.connect(inv).connect(gR).connect(dR.delayTime);
      wd.input.connect(split);
      split.connect(dL, 0); split.connect(dR, 1 % 2);
      dL.connect(merge, 0, 0); dR.connect(merge, 0, 1);
      merge.connect(wd.wet);
      lfo.start();
      fx = {
        input: wd.input, output: wd.output, osc: [lfo],
        set(p) {
          lfo.frequency.value = p.rate;
          const base = 0.012, dep = p.depth / 1000;
          dL.delayTime.value = base; dR.delayTime.value = base;
          gL.gain.value = dep; gR.gain.value = dep;
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'drive': {
      const wd = wetDry(ctx);
      const pre = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), post = ctx.createGain();
      lp.type = 'lowpass'; sh.oversample = '4x';
      wd.input.connect(pre).connect(sh).connect(lp).connect(post).connect(wd.wet);
      let lastD = null;
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          pre.gain.value = dbg(p.drive / 2);
          if (p.drive !== lastD) { sh.curve = distortionCurve(dbg(p.drive) - 1 + 0.5); lastD = p.drive; }
          lp.frequency.value = p.tone; post.gain.value = dbg(p.output);
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'gate': {
      // 用 AudioWorklet 太重；這裡用 Analyser 量電平 + 主執行緒控制增益。
      // 離線輸出時沒有主執行緒迴圈，改用「門檻以下大幅壓縮」的 expander 近似（DynamicsCompressor 做不到向下擴展，
      // 所以離線時 gate 以 bypass 處理並在介面註明）。
      const input = ctx.createGain(), out = ctx.createGain();
      input.connect(out);
      const an = ctx.createAnalyser(); an.fftSize = 512;
      input.connect(an);
      const buf = new Float32Array(512);
      let params = P, timer = null, open = true;
      const live = typeof ctx.startRendering !== 'function';
      if (live) {
        timer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let pk = 0; for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
          const db = 20 * Math.log10(pk + 1e-9);
          const want = db > params.threshold;
          if (want !== open) {
            open = want;
            out.gain.setTargetAtTime(open ? 1 : 0.0001, ctx.currentTime, open ? 0.002 : params.release / 4000);
          }
        }, 10);
      }
      fx = {
        input, output: out, offlineBypass: !live,
        set(p) { params = p; },
        dispose() { clearInterval(timer); },
      };
      break;
    }
    default: {
      const g = ctx.createGain();
      fx = { input: g, output: g, set() {} };
    }
  }
  fx.set(P);
  const baseDispose = fx.dispose;
  fx.dispose = () => {
    baseDispose && baseDispose();
    (fx.osc || []).forEach(o => { try { o.stop(); } catch (_) { /* noop */ } });
    try { fx.input.disconnect(); fx.output.disconnect(); } catch (_) { /* noop */ }
  };
  return fx;
}

// 需要 AudioWorklet 的效果器：建鏈前先載入模組（每個 context 一次）
const fxWorklets = new WeakMap();
export function ensureFxWorklets(ctx) {
  if (!fxWorklets.has(ctx)) fxWorklets.set(ctx, Promise.all([
    ctx.audioWorklet.addModule(new URL('./pitch-worklet.js', import.meta.url)),
    ctx.audioWorklet.addModule(new URL('./autotune-worklet.js', import.meta.url)),
  ]));
  return fxWorklets.get(ctx);
}

// ---------- Auto Tune 共用定義 ----------
export const AUTOTUNE_LATENCY = 0.032;
export const NOTE_NAMES_ZH = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// 音階：以主音為 0 的半音集合
export const TUNE_SCALES = [
  { name: '大調', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: '自然小調', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: '和聲小調', steps: [0, 2, 3, 5, 7, 8, 11] },
  { name: '大調五聲', steps: [0, 2, 4, 7, 9] },
  { name: '小調五聲', steps: [0, 3, 5, 7, 10] },
  { name: '藍調', steps: [0, 3, 5, 6, 7, 10] },
  { name: '多利安', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: '米索利地安', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: '半音階（全部 12 音）', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { name: '自訂', steps: null },
];
export const TUNE_RANGES = [
  { name: '一般人聲', fmin: 70, fmax: 1000 },
  { name: '男低音', fmin: 55, fmax: 450 },
  { name: '女高音', fmin: 140, fmax: 1300 },
  { name: '樂器（寬）', fmin: 50, fmax: 1500 },
];
export function scaleMask(key, scaleIdx) {
  const S = TUNE_SCALES[scaleIdx];
  if (!S || !S.steps) return null;
  let m = 0; for (const st of S.steps) m |= 1 << ((key + st) % 12);
  return m;
}

// 把一串效果器描述接成一條鏈：input → [fx...] → output；關閉的效果器直接跳過
export function buildChain(ctx, list, bpm) {
  const input = ctx.createGain(), output = ctx.createGain();
  const live = [];
  let prev = input;
  for (const d of list || []) {
    if (!d.on) continue;
    const fx = buildFx(ctx, d, bpm);
    fx.desc = d;
    prev.connect(fx.input);
    prev = fx.output;
    live.push(fx);
  }
  prev.connect(output);
  return {
    input, output, fx: live,
    dispose() { live.forEach(f => f.dispose()); try { input.disconnect(); output.disconnect(); } catch (_) { /* noop */ } },
  };
}

// 描述的「形狀」（有哪些效果器、開關狀態）：形狀變了要重建鏈，只有參數變就直接 set
export const chainShape = list => (list || []).map(d => d.id + (d.on ? '+' : '-')).join(',');

export function fmtParam(def, v, bpm) {
  if (def.toggle) return v ? '開' : '關';
  if (def.sync) {
    const names = { 0.03125: '1/128', 0.0625: '1/64', 0.125: '1/32', 0.25: '1/16', 0.5: '1/8', 0.75: '1/8.', 1: '1/4', 1.5: '1/4.', 2: '1/2' };
    return (names[v] || `${v} 拍`) + (bpm ? ` · ${Math.round(v * 60000 / bpm)}ms` : '');
  }
  if (def.unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`;
  const s = Math.abs(v) >= 100 || def.step >= 1 ? Math.round(v) : v.toFixed(def.step < 0.1 ? 2 : 1);
  return `${s}${def.unit ? (def.unit.startsWith(':') ? def.unit : ' ' + def.unit) : ''}`;
}
