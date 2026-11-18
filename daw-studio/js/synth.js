// 內建合成音色：全部用 Web Audio 節點即時合成，不需要下載任何音色檔。
// 即時播放（AudioContext）與離線輸出（OfflineAudioContext）共用同一套 voice。
//
// 對外 API：
//   PRESETS / PRESET_GROUPS     音色清單
//   startVoice(ctx, dest, presetId, midi, vel, when) → voice（voice.release(t)、voice.end）
//   scheduleNote(ctx, dest, presetId, midi, vel, when, dur)  一次排好起訖

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// 依諧波振幅建 PeriodicWave，每個 ctx 快取一次
const waveCache = new WeakMap();
function wave(ctx, key, harmonics) {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  if (!m.has(key)) {
    const real = new Float32Array(harmonics.length + 1), imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((a, i) => { imag[i + 1] = a; });
    m.set(key, ctx.createPeriodicWave(real, imag));
  }
  return m.get(key);
}
const HARM = {
  piano: [1, 0.55, 0.32, 0.22, 0.12, 0.09, 0.05, 0.04, 0.02, 0.015],
  epiano: [1, 0.12, 0.25, 0.03, 0.06, 0.01],
  organ: [1, 0.8, 0.0, 0.6, 0.0, 0.4, 0.0, 0.5, 0, 0, 0, 0.25, 0, 0, 0, 0.2],
  bell: [1, 0, 0, 0.5, 0, 0, 0.35, 0, 0, 0, 0.2],
  marimba: [1, 0, 0, 0.25, 0, 0, 0, 0, 0, 0.08],
};

// 每個音色：osc 列表、濾波器、振幅 ADSR、濾波器包絡
// osc.type 可為 sine/square/sawtooth/triangle 或 HARM 的名稱；ratio = 頻率倍數；detune = cents
export const PRESETS = {
  piano:   { name: '平台鋼琴', group: '鍵盤', osc: [{ type: 'piano', gain: 0.6 }, { type: 'sine', ratio: 2, detune: 3, gain: 0.12 }],
             filter: { type: 'lowpass', freq: 1800, q: 0.7, env: 4200, key: 0.6 }, amp: { a: 0.002, d: 1.6, s: 0.0, r: 0.35 }, fenv: { a: 0.001, d: 0.7, s: 0.15, r: 0.3 }, keyDecay: true, hammer: true },
  epiano:  { name: '電鋼琴', group: '鍵盤', osc: [{ type: 'epiano', gain: 0.55 }, { type: 'sine', ratio: 14, gain: 0.04, decay: 0.08 }],
             filter: { type: 'lowpass', freq: 2600, q: 0.5, env: 1800, key: 0.4 }, amp: { a: 0.002, d: 2.2, s: 0.18, r: 0.4 }, fenv: { a: 0.001, d: 0.4, s: 0.3, r: 0.3 }, keyDecay: true, trem: { rate: 4.5, depth: 0.12 } },
  organ:   { name: '管風琴', group: '鍵盤', osc: [{ type: 'organ', gain: 0.35 }, { type: 'organ', detune: 6, gain: 0.2 }],
             filter: { type: 'lowpass', freq: 5000, q: 0.3 }, amp: { a: 0.01, d: 0.1, s: 1, r: 0.08 }, trem: { rate: 6.2, depth: 0.08 } },
  strings: { name: '弦樂合奏', group: '弦樂', osc: [{ type: 'sawtooth', gain: 0.16 }, { type: 'sawtooth', detune: 9, gain: 0.16 }, { type: 'sawtooth', detune: -11, gain: 0.16 }],
             filter: { type: 'lowpass', freq: 1400, q: 0.6, env: 900, key: 0.5 }, amp: { a: 0.28, d: 0.4, s: 0.85, r: 0.6 }, fenv: { a: 0.4, d: 0.8, s: 0.6, r: 0.6 }, vib: { rate: 5.2, depth: 6, delay: 0.3 } },
  pizz:    { name: '弦樂撥奏', group: '弦樂', osc: [{ type: 'sawtooth', gain: 0.3 }, { type: 'triangle', ratio: 1, gain: 0.3 }],
             filter: { type: 'lowpass', freq: 600, q: 1.5, env: 3000, key: 0.6 }, amp: { a: 0.002, d: 0.35, s: 0, r: 0.15 }, fenv: { a: 0.001, d: 0.12, s: 0.05, r: 0.1 } },
  pad:     { name: '溫暖 Pad', group: '合成器', osc: [{ type: 'sawtooth', gain: 0.12 }, { type: 'sawtooth', detune: 14, gain: 0.12 }, { type: 'triangle', ratio: 0.5, gain: 0.2 }],
             filter: { type: 'lowpass', freq: 700, q: 1.2, env: 1200, key: 0.3 }, amp: { a: 0.8, d: 1.0, s: 0.8, r: 1.6 }, fenv: { a: 1.2, d: 2, s: 0.4, r: 1.5 } },
  lead:    { name: '方波 Lead', group: '合成器', osc: [{ type: 'square', gain: 0.18 }, { type: 'sawtooth', detune: 7, gain: 0.12 }],
             filter: { type: 'lowpass', freq: 1600, q: 3, env: 3000, key: 0.5 }, amp: { a: 0.005, d: 0.2, s: 0.75, r: 0.12 }, fenv: { a: 0.001, d: 0.25, s: 0.3, r: 0.15 }, vib: { rate: 5.5, depth: 10, delay: 0.25 }, glideMono: false },
  pluck:   { name: '合成撥弦', group: '合成器', osc: [{ type: 'sawtooth', gain: 0.25 }, { type: 'square', ratio: 2, gain: 0.06 }],
             filter: { type: 'lowpass', freq: 400, q: 4, env: 5000, key: 0.5 }, amp: { a: 0.001, d: 0.5, s: 0, r: 0.2 }, fenv: { a: 0.001, d: 0.18, s: 0, r: 0.15 } },
  bass:    { name: '合成貝斯', group: '貝斯', osc: [{ type: 'sawtooth', gain: 0.3 }, { type: 'square', ratio: 0.5, gain: 0.25 }],
             filter: { type: 'lowpass', freq: 260, q: 5, env: 1400, key: 0.2 }, amp: { a: 0.003, d: 0.3, s: 0.7, r: 0.08 }, fenv: { a: 0.001, d: 0.22, s: 0.15, r: 0.1 } },
  fbass:   { name: '指彈電貝斯', group: '貝斯', osc: [{ type: 'triangle', gain: 0.55 }, { type: 'sine', ratio: 2, gain: 0.12 }, { type: 'sawtooth', gain: 0.06 }],
             filter: { type: 'lowpass', freq: 500, q: 0.9, env: 900, key: 0.3 }, amp: { a: 0.004, d: 1.4, s: 0.25, r: 0.1 }, fenv: { a: 0.001, d: 0.15, s: 0.2, r: 0.1 } },
  bells:   { name: '鐘琴', group: '打擊', osc: [{ type: 'bell', gain: 0.4 }, { type: 'sine', ratio: 3.01, gain: 0.12, decay: 0.6 }],
             filter: { type: 'highpass', freq: 200, q: 0.5 }, amp: { a: 0.001, d: 2.4, s: 0, r: 1.2 }, keyDecay: true },
  marimba: { name: '木琴', group: '打擊', osc: [{ type: 'marimba', gain: 0.6 }, { type: 'sine', ratio: 4, gain: 0.1, decay: 0.05 }],
             filter: { type: 'lowpass', freq: 3500, q: 0.4 }, amp: { a: 0.001, d: 0.55, s: 0, r: 0.2 }, keyDecay: true },
  drums:   { name: '鼓組（GM 鼓位）', group: '鼓', drum: true },
};
export const PRESET_GROUPS = ['鍵盤', '弦樂', '合成器', '貝斯', '打擊', '鼓'];
export const DEFAULT_PRESET = 'piano';

// GM 鼓位名稱（鋼琴捲簾左側顯示）
export const DRUM_NAMES = {
  35: '大鼓 2', 36: '大鼓', 37: '鼓框', 38: '小鼓', 39: '拍手', 40: '小鼓 2', 41: '落地鼓 低', 42: '閉合鈸',
  43: '落地鼓 高', 44: '踏鈸', 45: '中鼓 低', 46: '開放鈸', 47: '中鼓', 48: '高中鼓', 49: '強音鈸', 50: '高鼓',
  51: '疊音鈸', 53: '鈸心', 54: '鈴鼓', 56: '牛鈴', 57: '強音鈸 2', 59: '疊音鈸 2',
};

// 噪音 buffer（每個 ctx 一份）
const noiseCache = new WeakMap();
function noise(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    noiseCache.set(ctx, b);
  }
  return b;
}

function envADSR(param, t, peak, a, d, s, floor = 0) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  const sus = floor + (peak - floor) * s;
  // s=0：衰減到靜音（打擊式音色）；用 setTargetAtTime 比較像自然衰減
  param.setTargetAtTime(Math.max(sus, 0.00001), t + a, Math.max(0.005, d / 4));
  return sus;
}

function releaseParam(param, t, r, floor = 0) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else { param.cancelScheduledValues(t); }
  param.setTargetAtTime(floor, t, Math.max(0.005, r / 4));
}

// ---------------- 旋律音色 ----------------
function melodicVoice(ctx, dest, P, midi, vel, when) {
  const f0 = midiHz(midi);
  const v = Math.pow(vel / 127, 1.4);
  const out = ctx.createGain();
  out.gain.value = 0;
  const filt = ctx.createBiquadFilter();
  filt.type = P.filter?.type || 'lowpass';
  filt.Q.value = P.filter?.q ?? 0.7;
  const key = P.filter?.key ?? 0;
  const baseF = (P.filter?.freq ?? 8000) * Math.pow(f0 / 261.6, key);
  filt.frequency.value = Math.min(ctx.sampleRate / 2.2, baseF);
  filt.connect(out);
  out.connect(dest);
  const nodes = [];
  // 高音區衰減較快（鋼琴、鐘琴）
  const dScale = P.keyDecay ? Math.max(0.25, Math.pow(2, -(midi - 60) / 24)) : 1;
  for (const o of P.osc) {
    const osc = ctx.createOscillator();
    if (HARM[o.type]) osc.setPeriodicWave(wave(ctx, o.type, HARM[o.type]));
    else osc.type = o.type;
    osc.frequency.value = f0 * (o.ratio || 1);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.value = o.gain;
    if (o.decay) { g.gain.setValueAtTime(o.gain, when); g.gain.setTargetAtTime(0, when, o.decay); }
    osc.connect(g).connect(filt);
    osc.start(when);
    nodes.push(osc);
    if (P.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = P.vib.rate;
      lg.gain.setValueAtTime(0, when);
      lg.gain.linearRampToValueAtTime(P.vib.depth, when + (P.vib.delay || 0) + 0.3);
      lfo.connect(lg).connect(osc.detune);
      lfo.start(when); nodes.push(lfo);
    }
  }
  if (P.hammer) {
    // 擊槌噪音：很短的帶通噪音，讓鋼琴有「敲」的起音
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f0 * 6); bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25 * v, when); ng.gain.setTargetAtTime(0, when, 0.012);
    n.connect(bp).connect(ng).connect(out);
    n.start(when); n.stop(when + 0.15);
  }
  let trem = null;
  if (P.trem) {
    trem = ctx.createGain();
    out.disconnect(); out.connect(trem).connect(dest);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = P.trem.rate; lg.gain.value = P.trem.depth;
    trem.gain.value = 1 - P.trem.depth;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(when); nodes.push(lfo);
  }
  const A = P.amp;
  envADSR(out.gain, when, v, A.a, A.d * dScale, A.s);
  if (P.fenv && P.filter?.env) {
    const peak = Math.min(ctx.sampleRate / 2.2, baseF + P.filter.env * (0.4 + 0.6 * v));
    envADSR(filt.frequency, when, peak, P.fenv.a, P.fenv.d * dScale, P.fenv.s, filt.frequency.value);
  }
  const voice = {
    end: Infinity,
    release(t) {
      t = Math.max(t, when + 0.005);
      releaseParam(out.gain, t, A.r);
      if (P.fenv && P.filter?.env) releaseParam(filt.frequency, t, P.fenv.r, filt.frequency.value);
      const stopAt = t + A.r * 1.6 + 0.05;
      for (const n of nodes) { try { n.stop(stopAt); } catch (_) { /* 已停 */ } }
      voice.end = stopAt;
      nodes[0].onended = () => { try { (trem || out).disconnect(); } catch (_) { /* noop */ } };
    },
    // 立即靜音（停止播放時用）
    kill(t) {
      if (out.gain.cancelAndHoldAtTime) out.gain.cancelAndHoldAtTime(t); else out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.008);
      for (const n of nodes) { try { n.stop(t + 0.05); } catch (_) { /* noop */ } }
    },
  };
  // 打擊式音色（s=0）沒有 release 也會自己結束
  if (A.s === 0) {
    const natural = when + A.a + A.d * dScale * 1.6 + 0.1;
    for (const n of nodes) n.stop(natural);
    voice.end = natural;
  }
  return voice;
}

// ---------------- 鼓組 ----------------
function drumVoice(ctx, dest, midi, vel, when) {
  const v = Math.pow(vel / 127, 1.2);
  const out = ctx.createGain(); out.gain.value = v; out.connect(dest);
  const stopAll = [];
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; stopAll.push(o); return o; };
  const nz = () => { const n = ctx.createBufferSource(); n.buffer = noise(ctx); stopAll.push(n); return n; };
  const env = (g, a, d, peak = 1) => { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(peak, when + a); g.gain.setTargetAtTime(0, when + a, d); };
  let len = 0.5;
  const kind = [35, 36].includes(midi) ? 'kick' : [38, 40].includes(midi) ? 'snare' : midi === 37 ? 'rim' : midi === 39 ? 'clap'
    : [42, 44].includes(midi) ? 'hatc' : midi === 46 ? 'hato' : [49, 57, 55, 52].includes(midi) ? 'crash' : [51, 59, 53].includes(midi) ? 'ride'
    : [41, 43, 45, 47, 48, 50].includes(midi) ? 'tom' : midi === 54 ? 'tamb' : midi === 56 ? 'cow' : 'hatc';
  if (kind === 'kick') {
    const o = osc('sine', 150); const g = ctx.createGain();
    o.frequency.setValueAtTime(160, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    env(g, 0.002, 0.12, 1.2); o.connect(g).connect(out);
    const c = nz(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const cg = ctx.createGain();
    env(cg, 0.001, 0.006, 0.4); c.connect(hp).connect(cg).connect(out);
    len = 0.6;
  } else if (kind === 'snare' || kind === 'rim') {
    const o = osc('triangle', kind === 'rim' ? 420 : 190); const g = ctx.createGain();
    o.frequency.setValueAtTime(kind === 'rim' ? 480 : 240, when); o.frequency.exponentialRampToValueAtTime(kind === 'rim' ? 380 : 160, when + 0.05);
    env(g, 0.001, kind === 'rim' ? 0.015 : 0.05, 0.7); o.connect(g).connect(out);
    if (kind === 'snare') {
      const n = nz(); const bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1200; const ng = ctx.createGain();
      env(ng, 0.001, 0.07, 0.8); n.connect(bp).connect(ng).connect(out);
    }
    len = 0.4;
  } else if (kind === 'clap') {
    const n = nz(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.5; const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    for (const k of [0, 0.012, 0.024]) { g.gain.setValueAtTime(0.9, when + k); g.gain.setTargetAtTime(0.05, when + k + 0.001, 0.004); }
    g.gain.setValueAtTime(0.7, when + 0.036); g.gain.setTargetAtTime(0, when + 0.037, 0.06);
    n.connect(bp).connect(g).connect(out); len = 0.4;
  } else if (kind === 'hatc' || kind === 'hato' || kind === 'tamb') {
    const n = nz(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = kind === 'tamb' ? 6000 : 7000;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 10000; bp.gain.value = 6;
    const g = ctx.createGain(); const d = kind === 'hato' ? 0.18 : kind === 'tamb' ? 0.06 : midi === 44 ? 0.02 : 0.03;
    env(g, 0.001, d, 0.6); n.connect(hp).connect(bp).connect(g).connect(out); len = d * 8;
  } else if (kind === 'crash' || kind === 'ride') {
    const n = nz(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = kind === 'ride' ? 5000 : 3500;
    const g = ctx.createGain(); const d = kind === 'ride' ? 0.35 : 0.7;
    env(g, 0.001, d, kind === 'ride' ? 0.3 : 0.55); n.connect(hp).connect(g).connect(out);
    if (kind === 'ride') { const o = osc('square', 5400); const og = ctx.createGain(); env(og, 0.001, 0.25, 0.03); o.connect(og).connect(out); }
    len = d * 6;
  } else if (kind === 'tom') {
    const base = { 41: 70, 43: 85, 45: 100, 47: 120, 48: 145, 50: 170 }[midi] || 110;
    const o = osc('sine', base); const g = ctx.createGain();
    o.frequency.setValueAtTime(base * 1.6, when); o.frequency.exponentialRampToValueAtTime(base, when + 0.08);
    env(g, 0.002, 0.15, 1); o.connect(g).connect(out); len = 0.8;
  } else if (kind === 'cow') {
    const a = osc('square', 560), b = osc('square', 845); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; const g = ctx.createGain();
    env(g, 0.001, 0.08, 0.35); a.connect(bp); b.connect(bp); bp.connect(g).connect(out); len = 0.5;
  }
  for (const n of stopAll) { n.start(when); n.stop(when + len); }
  return { end: when + len, release() { /* 鼓不需要 note-off */ }, kill(t) { out.gain.setTargetAtTime(0, t, 0.005); } };
}

// SoundFont 音色由 soundbank.js 註冊進來（避免循環 import）
let sfHook = null;
export function setSoundFontHook(h) { sfHook = h; }

export function startVoice(ctx, dest, presetId, midi, vel, when) {
  if (sfHook && typeof presetId === 'string' && presetId.startsWith('sf:')) {
    const v = sfHook.voice(ctx, dest, presetId, midi, vel, when);
    if (v) return v;
    // 音色庫還沒載入：鼓組用內建鼓，其他用鋼琴代打，至少聽得到
    presetId = sfHook.isDrums(presetId) ? 'drums' : DEFAULT_PRESET;
  }
  const P = PRESETS[presetId] || PRESETS[DEFAULT_PRESET];
  return P.drum ? drumVoice(ctx, dest, midi, vel, when) : melodicVoice(ctx, dest, P, midi, vel, when);
}

export function scheduleNote(ctx, dest, presetId, midi, vel, when, dur) {
  const v = startVoice(ctx, dest, presetId, midi, vel, when);
  v.release(when + Math.max(0.01, dur));
  return v;
}

// 音色的釋音尾巴長度（離線輸出要多算這麼久）
export function releaseTail(presetId) {
  if (sfHook && typeof presetId === 'string' && presetId.startsWith('sf:')) return sfHook.tail(presetId) ?? 1.5;
  const P = PRESETS[presetId];
  if (!P || P.drum) return 1.2;
  return Math.max(P.amp.r * 1.6, P.amp.s === 0 ? P.amp.d * 1.6 : 0) + 0.1;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
