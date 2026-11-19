// 高品質和聲：把主唱軌的每個片段（經過 Harmony 前面的效果器，例如人聲修音）送去背景運算，
// 結果寫成新的音訊軌「<主唱> 和聲 N（高品質）」，跟主唱片段對齊。
import { store, newTrack, MAX_TRACKS } from './state.js';
import { buildChain, harmConfig, fxLatency } from './effects.js';
import { ensureFxWorklets } from './effects.js';
import { uid, computePeaks } from './util.js';

let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./harmony-hq-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      const d = e.data, p = pending.get(d.id); if (!p) return;
      if (d.type === 'progress') p.onProgress && p.onProgress(d.p);
      else if (d.type === 'done') { pending.delete(d.id); p.resolve(d); }
      else if (d.type === 'error') { pending.delete(d.id); p.reject(new Error(d.message)); }
    };
    worker.onerror = e => { for (const p of pending.values()) p.reject(new Error(e.message || '背景運算錯誤')); pending.clear(); worker = null; };
  }
  return worker;
}
function call(msg, transfer, onProgress) {
  const id = ++seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); getWorker().postMessage({ ...msg, id }, transfer); });
}

// 這個 Harmony 前面的效果器（例如人聲修音）先套上去：離線算出片段實際送進 Harmony 的聲音
async function preFx(track, desc, clip, buf) {
  const before = [];
  for (const d of track.inserts || []) { if (d.id === desc.id) break; if (d.on) before.push(d); }
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(clip.offset * sr)), n = Math.min(buf.length - s0, Math.ceil(clip.duration * sr));
  const nc = Math.min(2, buf.numberOfChannels);
  if (!before.length) {
    const chans = []; for (let c = 0; c < nc; c++) chans.push(buf.getChannelData(c).slice(s0, s0 + n));
    return chans;
  }
  const lat = before.reduce((a, d) => a + fxLatency(d), 0), L = Math.round(lat * sr);
  const oc = new OfflineAudioContext(2, n + L, sr);
  await ensureFxWorklets(oc);
  const src = oc.createBufferSource(); src.buffer = buf;
  const chain = buildChain(oc, before, store.project.bpm);
  src.connect(chain.input); chain.output.connect(oc.destination);
  src.start(0, clip.offset, clip.duration);
  const r = await oc.startRendering();
  return [r.getChannelData(0).slice(L, L + n), r.getChannelData(1).slice(L, L + n)];
}

const hqName = (lead, v) => `${lead.name} 和聲 ${v + 1}（高品質）`;
export const hqTracksOf = desc => store.project.tracks.filter(t => t.hqOf === desc.id);

// 參數的「指紋」：有改到會影響結果的設定 → 需要重新運算
export function hqSignature(track, desc) {
  const p = desc.params;
  const clips = track.clips.filter(c => !c.notes).map(c => [c.bufferId, c.start, c.offset, c.duration, c.gainDb || 0].join(':'));
  const before = (track.inserts || []).slice(0, track.inserts.indexOf(desc)).filter(d => d.on).map(d => d.type + JSON.stringify(d.params));
  return JSON.stringify([p.source, p.mask, p.range, p.tight, p.humanize, p.glide, p.width, p.vibKeep, p.secMode, p.voices, p.chords, p.sections, p.curves, store.project.bpm, clips, before]);
}

/**
 * 算出高品質和聲並寫進專案。onProgress(0..1, 文字)
 */
export async function renderHq(trackId, desc, onProgress = () => {}) {
  const track = store.track(trackId);
  if (!track) throw new Error('找不到主唱軌');
  const clips = track.clips.filter(c => !c.notes && store.buffers.get(c.bufferId));
  if (!clips.length) throw new Error('這一軌沒有錄音片段可以處理');
  const P = desc.params, bpm = store.project.bpm;
  const cfgFull = harmConfig({ ...P, hq: 0 }, bpm, 0);
  const voices = cfgFull.voices.map((v, i) => i).filter(i => cfgFull.voices[i].on || (P.secMode && (P.sections || []).some(s => s.iv[i] !== null && s.iv[i] !== undefined)));
  if (!voices.length) throw new Error('沒有開啟任何和聲聲部');
  // 每個聲部算出每個片段
  const results = voices.map(() => []);
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci], buf = store.buffers.get(clip.bufferId);
    onProgress(ci / clips.length, `準備第 ${ci + 1}／${clips.length} 段…`);
    const chans = await preFx(track, desc, clip, buf);
    // 片段音量也要算進去（主唱在混音時會被乘上這個），和聲才會一樣大聲
    const g = Math.pow(10, (clip.gainDb || 0) / 20);
    if (g !== 1) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
    const key = [clip.bufferId, clip.offset, clip.duration, clip.gainDb || 0, (track.inserts || []).slice(0, track.inserts.indexOf(desc)).filter(d => d.on).map(d => d.type + JSON.stringify(d.params)).join('|'), cfgFull.fmin, cfgFull.fmax].join('#');
    const cfg = { ...cfgFull, voices: cfgFull.voices.map(v => ({ ...v, on: true })) };
    const r = await call({ type: 'render', chans: chans.map(c => c.buffer), sr: buf.sampleRate, cfg, voices, t0: clip.start, key, vibKeep: (P.vibKeep ?? 100) / 100 },
      chans.map(c => c.buffer), p => onProgress((ci + p) / clips.length, `第 ${ci + 1}／${clips.length} 段：${p < 0.6 ? '分析主唱音高' : '產生和聲'} ${Math.round(p * 100)}%`));
    voices.forEach((v, k) => {
      const [L, R] = r.voices[v].map(b => new Float32Array(b));
      const ab = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: buf.sampleRate });
      ab.copyToChannel(L, 0); ab.copyToChannel(R, 1);
      results[k].push({ clip, buf: ab });
    });
  }
  // 寫進專案：每個聲部一條音訊軌（已經有就換掉片段）
  store.checkpoint();
  const p = store.project;
  const old = hqTracksOf(desc);
  const idx = p.tracks.indexOf(track);
  const colors = ['#35c9a5', '#f5b83d', '#b58bff', '#f78fc3'];
  voices.forEach((v, k) => {
    let t = old.find(x => x.hqVoice === v);
    if (!t) {
      if (p.tracks.length >= MAX_TRACKS) return;
      t = newTrack(p.tracks.length, 'audio');
      t.hqOf = desc.id; t.hqVoice = v; t.color = colors[v];
      p.tracks.splice(idx + 1 + k, 0, t);
    }
    t.name = hqName(track, v);
    t.clips = results[k].map(({ clip, buf }) => {
      const id = uid('buf');
      store.buffers.set(id, buf);
      store.bufferMeta.set(id, { name: `${t.name}.wav`, peaks: computePeaks(buf) });
      return { id: uid('clip'), bufferId: id, name: t.name, start: clip.start, offset: 0, duration: buf.duration, gainDb: 0, fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0 };
    });
    // 和聲軌跟主唱一樣的 send（殘響等），推桿用 Harmony 的「和聲」音量
    t.sends = [...(track.sends || [-60, -60])];
    t.volumeDb = P.hgain <= -60 ? -60 : P.hgain;
  });
  // 不再需要的聲部軌（使用者關掉的聲部）
  p.tracks = p.tracks.filter(t => !(t.hqOf === desc.id && !voices.includes(t.hqVoice)));
  desc.params.hqSig = hqSignature(track, desc);
  desc.params.hq = 1;
  store.changed('structure');
  onProgress(1, '完成');
  return voices.length;
}

export function removeHq(desc) {
  const p = store.project, n = hqTracksOf(desc).length;
  if (!n) return 0;
  store.checkpoint();
  p.tracks = p.tracks.filter(t => t.hqOf !== desc.id);
  delete desc.params.hqSig;
  store.changed('structure');
  return n;
}
