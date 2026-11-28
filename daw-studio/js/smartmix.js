// 智慧混音：分析每一軌的聲音特徵，依使用者的偏好算出整組混音方案。
//
// 分成三段，UI 只負責問問題與顯示：
//   analyzeProject()  把每一軌的音訊併成一份、算頻譜／響度／噪聲／呼吸聲
//   makePlan(prefs)   偏好 ＋ 分析結果 → 每一軌的插入效果器、音量、Send、自動化
//   applyPlan(plan)   寫回專案（可復原；套用過的項目會標 smartmix，重跑會先清掉）
//
// 全部在本機算：只讀記憶體裡的 AudioBuffer，不做任何連線。
import { store } from './state.js';
import { newFx, EQ_DEFAULT_BANDS } from './effects.js';
import { analyzeBreaths } from './breath.js';
import { analyze as analyzeLoudness } from './loudness.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const db = v => 20 * Math.log10(Math.max(1e-6, v));

// ── FFT（跟 breath.js 同一個寫法，這裡只需要大小）────────────────
function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const BANDS = [
  ['sub', 20, 60], ['low', 60, 120], ['lowmid', 120, 400], ['mid', 400, 1000],
  ['himid', 1000, 3000], ['presence', 3000, 6000], ['sib', 6000, 10000], ['air', 10000, 16000],
];

// ── 把一軌的音訊併成一份（上限 maxSec 秒）──────────────────────
export function collectTrackAudio(track, maxSec = 90) {
  const clips = (track.clips || []).filter(c => c.bufferId && store.buffers.has(c.bufferId));
  if (!clips.length) return null;
  const first = store.buffers.get(clips[0].bufferId);
  const sr = first.sampleRate;
  let end = 0;
  for (const c of clips) end = Math.max(end, c.start + c.duration);
  const dur = Math.min(maxSec, end);
  if (dur < 1) return null;
  const len = Math.max(1, Math.round(dur * sr));
  const nCh = Math.min(2, Math.max(...clips.map(c => store.buffers.get(c.bufferId).numberOfChannels)));
  // 直接建 AudioBuffer，不要每個軌都開一個 OfflineAudioContext（開太多會卡）
  const out = new AudioBuffer({ length: len, numberOfChannels: nCh, sampleRate: sr });
  for (const c of clips) {
    const src = store.buffers.get(c.bufferId);
    const from = Math.max(0, c.offset || 0);
    const to = Math.min(src.duration, from + c.duration);
    if (to <= from) continue;
    const at = Math.round(c.start * sr);
    const n = Math.min(Math.round((to - from) * sr), len - at);
    if (n <= 0) continue;
    for (let ch = 0; ch < nCh; ch++) {
      const s = src.getChannelData(Math.min(ch, src.numberOfChannels - 1));
      out.copyToChannel(s.subarray(Math.round(from * sr), Math.round(from * sr) + n), ch, at);
    }
  }
  return out;
}

// ── 特徵：響度、頻譜、噪聲、呼吸聲、立體寬度 ───────────────────
export function analyzeBuffer(buf) {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  let sum = 0, peak = 0, corr = 0, eL = 0, eR = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i], r = R ? R[i] : l;
    sum += (l * l + r * r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    if (R) { corr += l * r; eL += l * l; eR += r * r; }
  }
  const rms = Math.sqrt(sum / Math.max(1, L.length));
  const loud = (() => { try { return analyzeLoudness(buf); } catch (_) { return null; } })();

  // 逐格頻譜
  const win = 2048, hop = 1024, hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / win);
  const bandPow = Object.fromEntries(BANDS.map(([k]) => [k, 0]));
  const frames = [];
  let total = 0, flatSum = 0, centSum = 0, nFrames = 0;
  const re = new Float32Array(win), im = new Float32Array(win);
  for (let st = 0; st + win <= L.length; st += hop) {
    let fsum = 0;
    for (let i = 0; i < win; i++) { re[i] = L[st + i] * hann[i]; im[i] = 0; fsum += re[i] * re[i]; }
    const fdb = db(Math.sqrt(fsum / win));
    frames.push(fdb);
    if (fdb < -80) continue;
    fftMag(re, im);
    let arith = 0, logSum = 0, cent = 0, cnt = 0;
    for (let k = 1; k < win / 2; k++) {
      const f = k * sr / win;
      if (f < 20 || f > 16000) continue;
      const p = re[k] * re[k] + im[k] * im[k];
      arith += p; logSum += Math.log(p + 1e-20); cent += f * p; cnt++;
      for (const [key, lo, hi] of BANDS) if (f >= lo && f < hi) { bandPow[key] += p; break; }
    }
    if (!cnt) continue;
    total += arith;
    flatSum += Math.exp(logSum / cnt) / (arith / cnt + 1e-20);
    centSum += cent / (arith + 1e-20);
    nFrames++;
  }
  const bands = {};
  for (const [k] of BANDS) bands[k] = total > 0 ? 10 * Math.log10(bandPow[k] / total + 1e-9) : -60;
  frames.sort((a, b) => a - b);
  const pct = p => frames.length ? frames[clamp(Math.floor(frames.length * p), 0, frames.length - 1)] : -90;
  const noiseDb = pct(0.1), loudDb = pct(0.95);
  const silent = frames.filter(v => v < loudDb - 30).length / Math.max(1, frames.length);

  let breath = [];
  try {
    const mono = new AudioBuffer({ length: L.length, sampleRate: sr, numberOfChannels: 1 });
    mono.copyToChannel(L, 0);
    breath = analyzeBreaths(mono, 0, L.length / sr, { sens: 0.55 });
  } catch (_) { /* 分析失敗就當作沒有呼吸聲 */ }

  return {
    seconds: L.length / sr,
    lufs: loud?.integrated ?? db(rms),
    peakDb: db(peak),
    rmsDb: db(rms),
    crestDb: db(peak) - db(rms),
    lra: loud?.lra ?? 0,
    bands,
    flatness: flatSum / Math.max(1, nFrames),
    centroid: centSum / Math.max(1, nFrames),
    noiseDb,
    snrDb: loudDb - noiseDb,
    silent,
    breath,
    stereo: R ? corr / Math.sqrt(Math.max(1e-9, eL * eR)) : 1,
    channels: buf.numberOfChannels,
  };
}

// ── 猜這一軌是什麼（名稱優先，其次看頻譜長相）──────────────────
export function classify(track, f) {
  const n = (track.name || '').toLowerCase();
  if (/主唱|人聲|vocal|vox|vo\d|唱|vocal/.test(n)) return 'vocal';
  if (/和聲|choir|harm|backing/.test(n)) return 'vocal';
  if (/bass|低音|貝斯|808|sub/.test(n)) return 'bass';
  if (/鼓|drum|kick|snare|perc|beat|打擊/.test(n)) return 'drums';
  if (/吉他|guitar|gt|piano|鋼琴|keys|鍵盤|弦|pad|合成/.test(n)) return 'instrument';
  if (!f) return 'instrument';
  const low = f.bands.sub + f.bands.low;
  if (low > -6 && f.centroid < 400) return 'bass';
  if (f.crestDb > 13 && f.flatness > 0.12) return 'drums';
  if (f.breath.length >= 3 && f.bands.mid > -18) return 'vocal';
  return 'instrument';
}

export function analyzeProject() {
  const out = [];
  for (const t of store.project.tracks) {
    if (!['audio', 'midi', 'video'].includes(t.kind)) continue;
    if (t.kind !== 'audio') continue;                  // v1 只分析音訊軌（MIDI 由音色決定，沒有頻譜可量）
    const buf = collectTrackAudio(t);
    if (!buf) continue;
    const feats = analyzeBuffer(buf);
    out.push({ id: t.id, name: t.name, kind: classify(t, feats), feats });
  }
  return out;
}

// ── 偏好 → 方案 ───────────────────────────────────────────────
export const DEFAULT_PREFS = {
  genre: 'pop',       // ballad | pop | rock | hiphop | folk | electronic | other
  vocal: 0.6,         // 0 = 樂器為主、1 = 人聲貼在耳邊
  bright: 0.5,        // 0 = 溫暖、1 = 明亮
  low: 0.5,           // 0 = 乾淨、1 = 厚
  dynamics: 0.5,      // 0 = 平均大聲、1 = 保留起伏
  space: 0.4,         // 0 = 乾、1 = 大空間
  cleanup: 0.6,       // 0 = 保留呼吸、1 = 全部壓掉
  tune: 0.35,         // 人聲修音強度
  device: 'headphones', // phone | headphones | speakers
  target: -14,        // LUFS
};

const GENRES = {
  ballad: { comp: 0.85, verb: 0.25, bright: -0.1, low: 0.05 },
  pop: { comp: 1, verb: 0, bright: 0, low: 0 },
  rock: { comp: 0.8, verb: -0.1, bright: 0.12, low: 0.1 },
  hiphop: { comp: 0.9, verb: -0.15, bright: 0.05, low: 0.25 },
  folk: { comp: 1.15, verb: 0.1, bright: -0.05, low: -0.05 },
  electronic: { comp: 0.9, verb: 0.05, bright: 0.15, low: 0.2 },
  other: { comp: 1, verb: 0, bright: 0, low: 0 },
};

function eqBands(edits) {
  const bands = EQ_DEFAULT_BANDS.map(b => ({ ...b }));
  for (const [i, e] of Object.entries(edits)) Object.assign(bands[i], e);
  return bands;
}

function vocalChain(p, f, plan) {
  const g = GENRES[p.genre] || GENRES.other;
  const clean = p.cleanup;
  const hp = 70 + 45 * clean;
  const lowmid = f ? clamp(-(f.bands.lowmid - f.bands.mid - 2), -3.5, 0) : -1.5;
  const presence = 1 + 1.6 * p.vocal + g.bright;
  const air = -0.5 + 2.4 * p.bright + g.bright;
  const sibIdx = f ? clamp((f.bands.sib + f.bands.presence) - (f.bands.mid - 6), 0, 12) : 4;
  const ratio = clamp(2.2 + 2.2 * (1 - p.dynamics) * g.comp, 1.6, 6);
  const thr = f ? clamp(f.lufs - 10 - 3 * (1 - p.dynamics), -38, -10) : -22;
  const chain = [
    ['eq', { bands: eqBands({
      0: { on: true, freq: Math.round(hp) },
      1: { on: true, freq: 110, gain: -(0.5 + 1.5 * clean) },
      2: { on: true, freq: 300, gain: lowmid, q: 1.1 },
      4: { on: true, freq: 3000, gain: presence, q: 0.9 },
      6: { on: true, freq: 12000, gain: air },
    }) }],
    ['deess', { freq: 6500, range: 1.3, threshold: -30 + sibIdx, amount: clamp(3 + sibIdx, 3, 11) }],
    ['comp', { threshold: Math.round(thr * 2) / 2, ratio: +ratio.toFixed(1), attack: 12, release: 130, knee: 8, makeup: 0 }],
  ];
  if (p.tune > 0.05) {
    chain.push(['tune', { amount: Math.round(40 + 60 * p.tune), retune: 55 - 30 * p.tune, vibrato: 70, mix: 100 }]);
  }
  if (clean > 0.35 && f) {
    chain.unshift(['gate', {
      threshold: clamp(Math.round(f.noiseDb + 6), -60, -24), ratio: 4,
      attack: 4, hold: 60, release: 200, range: -30,
    }]);
  }
  plan.notes.push(`人聲：低切 ${Math.round(hp)} Hz、300 Hz ${lowmid.toFixed(1)} dB、3 kHz +${presence.toFixed(1)} dB，壓縮 ${ratio.toFixed(1)}:1`);
  return chain;
}

function instrumentChain(p, f) {
  const g = GENRES[p.genre] || GENRES.other;
  const hp = 90 + 40 * p.cleanup;
  const mud = f ? clamp(-(f.bands.lowmid - f.bands.mid), -3, 0) : -1;
  return [
    ['eq', { bands: eqBands({
      0: { on: true, freq: Math.round(hp) },
      2: { on: true, freq: 280, gain: +mud.toFixed(1), q: 1 },
      4: { on: true, freq: 2500, gain: (-1 + 2 * p.vocal) * 0.6, q: 1 },
      6: { on: true, freq: 12000, gain: -0.5 + 1.5 * p.bright },
    }) }],
    ['comp', { threshold: f ? Math.round(f.lufs - 12) : -24, ratio: clamp(1.5 + (1 - p.dynamics) * 2, 1.5, 3.5),
      attack: 25, release: 200, knee: 10, makeup: 0 }],
  ];
}

function bassChain(p) {
  return [
    ['eq', { bands: eqBands({
      0: { on: true, freq: 28 },
      2: { on: true, freq: 260, gain: -2, q: 1 },
      6: { on: true, freq: 8000, gain: -3 },
    }) }],
    ['comp', { threshold: -24, ratio: 3, attack: 20, release: 160, knee: 8, makeup: 0 }],
  ];
}

function drumsChain(p) {
  return [
    ['eq', { bands: eqBands({
      0: { on: true, freq: 35 },
      2: { on: true, freq: 350, gain: -1.5, q: 1 },
      4: { on: true, freq: 3000, gain: 1 + p.bright, q: 1 },
    }) }],
    ['comp', { threshold: -20, ratio: 3.2, attack: 8, release: 110, knee: 6, makeup: 0 }],
    ['transient', { attack: 2, sustain: 0, output: 0 }],
  ];
}

export function makePlan(prefs, items) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const g = GENRES[p.genre] || GENRES.other;
  const plan = { tracks: [], master: null, notes: [], breathCount: 0 };
  const hasVocal = items.some(i => i.kind === 'vocal');
  const bus = p.space + g.verb;

  for (const it of items) {
    const f = it.feats;
    let chain, gain, sendA = -60, sendB = -60;
    if (it.kind === 'vocal') {
      chain = vocalChain(p, f, plan);
      gain = 0;
      sendA = clamp(-20 + 10 * bus + 3 * (1 - p.vocal), -24, -8);
      sendB = clamp(-26 + 6 * bus, -30, -18);
      if (p.cleanup > 0.3 && f?.breath?.length) plan.breathCount += f.breath.length;
    } else if (it.kind === 'bass') {
      chain = bassChain(p);
      gain = -2 - 2 * (1 - p.low);
    } else if (it.kind === 'drums') {
      chain = drumsChain(p);
      gain = -3.5 - 2 * (1 - p.dynamics);
    } else {
      chain = instrumentChain(p, f);
      gain = -4.5 - 2.2 * p.vocal + 1.2 * (1 - p.low);
      if (it.kind === 'instrument' && /pad|弦|synth|合成/i.test(it.name)) {
        sendA = clamp(-22 + 8 * bus, -26, -12);
      }
    }
    // 手機外放：切掉 60 Hz 以下、少一點高頻齒音
    if (p.device === 'phone') {
      for (const [type, params] of chain) if (type === 'eq' && params.bands) {
        params.bands[0] = { ...params.bands[0], on: true, freq: Math.max(params.bands[0].freq || 0, 60) };
        params.bands[6] = { ...params.bands[6], gain: (params.bands[6].gain || 0) - 1 };
      }
      gain -= 0.5;
    }
    plan.tracks.push({ id: it.id, name: it.name, kind: it.kind, gainDb: +gain.toFixed(1),
      sends: [sendA, sendB], chain, feats: f });
  }

  // 整體音量：用「人聲 + 伴奏」的估計值對到目標響度
  const vocal = plan.tracks.find(t => t.kind === 'vocal');
  const bed = plan.tracks.filter(t => t.kind !== 'vocal');
  const bedLufs = bed.length ? bed.reduce((a, t) => a + (t.feats?.lufs ?? -20) + t.gainDb, 0) / bed.length : -20;
  const est = vocal ? Math.max(vocal.feats?.lufs ?? -20, bedLufs + 2) : bedLufs;
  const masterGain = clamp(p.target - est, -12, 12);
  plan.master = { limiter: { gain: +masterGain.toFixed(1), ceiling: -1, release: 120 } };
  plan.notes.unshift(`預估整體 ${Math.round(est)} LUFS → 母帶增益 ${masterGain > 0 ? '+' : ''}${masterGain.toFixed(1)} dB（目標 ${p.target} LUFS）`);
  if (p.device === 'phone') plan.notes.push('手機外放：低頻會聽不見，混音以中頻清楚為優先');
  if (hasVocal && p.vocal > 0.7) plan.notes.push('人聲偏前面：伴奏自動讓了約 3 dB，必要時再把副歌推回來');
  return plan;
}

// ── 套用：寫回專案（可 Ctrl+Z 復原）──────────────────────────
export function applyPlan(plan, { breath = true } = {}) {
  store.checkpoint();
  const touched = [];
  for (const pt of plan.tracks) {
    const t = store.track(pt.id);
    if (!t) continue;
    t.inserts = (t.inserts || []).filter(d => !d.smartmix);
    for (const [type, params] of pt.chain) {
      const fx = newFx(type);
      Object.assign(fx.params, params);
      fx.smartmix = true;
      t.inserts.push(fx);
    }
    t.volumeDb = pt.gainDb;
    t.sends = [...pt.sends];
    // 呼吸聲：把人聲的呼吸段壓低（寫成音量自動化，之後可以逐點改）
    if (breath && t.auto && pt.feats?.breath?.length && pt.kind === 'vocal') {
      const bpm = store.project.bpm || 120;
      const pts = (t.auto.volume?.points || []).filter(p2 => !p2.smartmix);
      for (const b of pt.feats.breath) {
        const a = b.start * bpm / 60, z = b.end * bpm / 60;
        pts.push({ t: +a.toFixed(2), v: pt.gainDb - 14, smartmix: true });
        pts.push({ t: +z.toFixed(2), v: pt.gainDb, smartmix: true });
      }
      pts.sort((x, y) => x.t - y.t);
      t.auto.volume = { on: true, show: true, points: pts };
    }
    touched.push(t.id);
  }
  // 母帶 limiter：只留一顆（重跑不會疊）
  const m = store.project.masterInserts;
  for (let i = m.length - 1; i >= 0; i--) if (m[i].smartmix) m.splice(i, 1);
  if (plan.master?.limiter) {
    const lim = newFx('limiter');
    Object.assign(lim.params, plan.master.limiter);
    lim.smartmix = true;
    m.push(lim);
  }
  store.changed('mix');
  return touched;
}

// A/B：把智慧混音產生的效果器整組開或關
export function setSmartMixEnabled(on) {
  const all = [...store.project.tracks, ...store.project.buses, { inserts: store.project.masterInserts }];
  let n = 0;
  for (const o of all) for (const d of o.inserts || []) if (d.smartmix) { d.on = !!on; n++; }
  store.changed('fx');
  return n;
}

export const _sm = { analyzeBuffer, makePlan, applyPlan, classify, collectTrackAudio };
