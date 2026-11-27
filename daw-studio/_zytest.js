// 織音合成器的自動檢查（不上線；檔名開頭底線，建置時會跳過）
//
// 每一個音色都在 OfflineAudioContext 裡彈一次，量出：峰值、各段音量、音高準不準、
// 亮度（頻譜重心）、有沒有 NaN、尾巴收乾淨了沒。結果用 POST 傳回 scripts/daw_shots/synth_check.py。
import { scheduleNote } from './js/synth.js';
import { ensureZYWorklet } from './js/zy-synth.js';
import { ZY_PATCHES } from './js/zy-patches.js';

const SR = 44100;
const DUR = 2.4;
const OUT = document.getElementById('out');

function rms(buf, a, b) {
  const d = buf.getChannelData(0), e = buf.getChannelData(1);
  let s = 0; const n0 = Math.floor(a * SR), n1 = Math.min(Math.floor(b * SR), d.length);
  for (let i = n0; i < n1; i++) s += (d[i] * d[i] + e[i] * e[i]) * 0.5;
  return Math.sqrt(s / Math.max(1, n1 - n0));
}

function peakOf(buf) {
  let pk = 0, bad = 0, dc = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      const a = v < 0 ? -v : v;
      if (a > pk) pk = a;
      dc += v;
    }
  }
  return { peak: pk, bad, dc: dc / (buf.length * buf.numberOfChannels) };
}

// 基準音高：取一段聲音做自相關
function pitchOf(buf, at = 0.25, span = 0.18) {
  const d = buf.getChannelData(0);
  const n0 = Math.floor(at * SR), n = Math.floor(span * SR);
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += d[n0 + i];
  mean /= n;
  for (let i = 0; i < n; i++) x[i] = d[n0 + i] - mean;
  const lo = Math.floor(SR / 1200), hi = Math.floor(SR / 50);
  const norm = [];
  let best = 0;
  for (let lag = lo; lag < hi; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i + lag < n; i++) { s += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; }
    const r = s / Math.sqrt(e1 * e2 + 1e-12);
    norm.push(r);
    if (r > best) best = r;
  }
  if (best < 0.3) return { f: 0, conf: best };
  // 取「第一個接近最大值的局部極大」＝真正的週期（避免挑到 2 倍週期、低八度）
  for (let i = 1; i + 1 < norm.length; i++) {
    if (norm[i] >= best * 0.9 && norm[i] >= norm[i - 1] && norm[i] >= norm[i + 1]) return { f: SR / (lo + i), conf: norm[i] };
  }
  return { f: SR / (lo + norm.indexOf(best)), conf: best };
}

// 頻譜：4096 點 FFT，把能量加進 24 個對數頻帶（60 Hz 起，每格 1/3 八度）
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// 衰減時間：從最大聲掉 20 dB 要多久（秒），用來分辨「一樣亮但一個長一個短」
function decayTime(buf) {
  const step = Math.floor(0.05 * SR);
  let pk = 0, tPk = 0;
  const lv = [];
  for (let s = 0; s + step < buf.length; s += step) { const r = rms(buf, s / SR, (s + step) / SR); lv.push(r); if (r > pk) { pk = r; tPk = s / SR; } }
  const thr = pk * 0.1;
  for (let i = Math.floor(tPk / 0.05); i < lv.length; i++) if (lv[i] < thr) return i * 0.05 - tPk;
  return lv.length * 0.05 - tPk;
}

const NFFT = 4096;
function spectrum(buf, at = 0.1) {
  const d = buf.getChannelData(0);
  const n0 = Math.floor(at * SR);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  for (let i = 0; i < NFFT; i++) re[i] = (d[n0 + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT));
  fft(re, im);
  const pow = new Float64Array(NFFT / 2);
  for (let i = 0; i < NFFT / 2; i++) pow[i] = re[i] * re[i] + im[i] * im[i];
  const binHz = SR / NFFT;
  const out = [];
  let total = 0, cen = 0;
  for (const p of pow) { total += p; cen += p; }
  cen = 0;
  let all = 0;
  for (let i = 1; i < NFFT / 2; i++) { all += pow[i]; cen += pow[i] * i * binHz; }
  const centroid = all > 0 ? cen / all : 0;
  for (let b = 0; b < 24; b++) {
    const f0 = 60 * Math.pow(2, b / 3), f1 = 60 * Math.pow(2, (b + 1) / 3);
    let s = 0;
    for (let i = Math.max(1, Math.floor(f0 / binHz)); i < Math.min(NFFT / 2, Math.ceil(f1 / binHz)); i++) s += pow[i];
    out.push(Math.round(10 * Math.log10(s / (all + 1e-20) + 1e-9) * 10) / 10);   // 佔總能量的比例（dB）
  }
  return { bands: out, centroid: Math.round(centroid) };
}

async function renderOne(p) {
  const oc = new OfflineAudioContext(2, Math.ceil(DUR * SR), SR);
  await ensureZYWorklet(oc);
  if (!oc.__zyReady) throw new Error('worklet 沒載入');
  const dest = oc.createGain();
  dest.gain.value = 1;
  dest.connect(oc.destination);
  const id = 'zy:' + p.id;
  if (p.drum) {
    [[36, 0], [38, 0.5], [42, 0.9], [46, 1.3]].forEach(([k, t]) => scheduleNote(oc, dest, id, k, 110, t, 0.3));
  } else {
    scheduleNote(oc, dest, id, 60, 100, 0, 1.5);
  }
  await new Promise(r => setTimeout(r, 30));   // 讓 worklet 先把訊息收進去（離線環境不會自動讓路）
  const buf = await oc.startRendering();
  const pk = peakOf(buf);
  if (window.__zyRaw && window.__zyRaw.length < 3) {
    const d = buf.getChannelData(0);
    window.__zyRaw.push({ id: p.id, s: Array.from(d.slice(4410, 4410 + 4096), v => Math.round(v * 1e5) / 1e5) });
  }
  const pitch = p.drum ? { f: 0, conf: 0 } : pitchOf(buf);
  const spec = spectrum(buf);
  return {
    id: p.id, cat: p.cat, name: p.name, drum: !!p.drum,
    peak: Math.round(20 * Math.log10(pk.peak + 1e-9) * 10) / 10,
    bad: pk.bad, dc: Math.round(pk.dc * 10000) / 10000,
    a: Math.round(20 * Math.log10(rms(buf, 0.02, 0.2) + 1e-9) * 10) / 10,
    all: Math.round(20 * Math.log10(rms(buf, 0.02, 2.0) + 1e-9) * 10) / 10,
    b: Math.round(20 * Math.log10(rms(buf, 0.5, 0.7) + 1e-9) * 10) / 10,
    tail: Math.round(20 * Math.log10(rms(buf, 2.1, 2.35) + 1e-9) * 10) / 10,
    f: Math.round(pitch.f * 10) / 10, conf: Math.round(pitch.conf * 100) / 100,
    cen: Math.round(spec.centroid),
    cen2: Math.round(spectrum(buf, 0.75).centroid),   // 後段的亮度：PWM／濾波掃頻會不一樣
    dec: Math.round(decayTime(buf) * 100) / 100,
    bands: spec.bands,
  };
}

// 第二階段：走真正的輸出流程（engine.render）——這才是使用者按「輸出」時跑的路徑，
// 也才能驗證 worklet 的訊息在離線算圖前有送到。
async function renderProject() {
  const { store, newProject } = await import('./js/state.js');
  const { engine } = await import('./js/engine.js');
  const p = newProject();
  const midi = p.tracks.filter(t => t.kind === 'midi');
  const cases = [
    { inst: 'zy:str.ensemble', notes: [60, 64, 67], macro: null },
    { inst: 'zy:pad.warm', notes: [48, 55], macro: { bright: 0.3 } },
    { inst: 'zy:drm.ac', notes: [36, 38, 42], macro: null },
    { inst: 'piano', notes: [60, 64], macro: null },          // 舊版內建音色（回歸測試）
  ];
  const out = [];
  for (const c of cases) {
    const t = midi[0];
    t.instrument = c.inst;
    if (c.macro) t.synth = c.macro; else delete t.synth;
    t.clips = [{
      id: 'c1', name: 'x', startBeat: 0, lengthBeats: 4,
      notes: c.notes.map((n, i) => ({ p: n, t: i * 0.5, d: 1, v: 100 })),
    }];
    p.tracks.forEach(x => { x.mute = x !== t; });
    store.replaceProject(JSON.parse(JSON.stringify(p)), new Map(), new Map());
    try {
      const buf = await engine.render({ start: 0, end: 2, sampleRate: SR });
      out.push({ inst: c.inst, peak: Math.round(20 * Math.log10(peakOf(buf).peak + 1e-9) * 10) / 10, bad: peakOf(buf).bad });
    } catch (e) {
      out.push({ inst: c.inst, error: String(e && e.message || e) });
    }
  }
  return out;
}

// 第三階段：真正的即時播放（AudioContext + 每軌的 worklet node + 電平表）
async function liveTest() {
  const { store, newProject } = await import('./js/state.js');
  const { engine } = await import('./js/engine.js');
  const p = newProject();
  const t = p.tracks.find(x => x.kind === 'midi');
  t.instrument = 'zy:str.ensemble';
  t.clips = [{
    id: 'c', name: 'x', startBeat: 0, lengthBeats: 8,
    notes: [60, 64, 67].map(n => ({ p: n, t: 0, d: 6, v: 110 })),
  }];
  p.loop = { on: false, start: 0, end: 8 };
  p.tracks.forEach(x => { x.mute = x !== t; });
  store.replaceProject(JSON.parse(JSON.stringify(p)), new Map(), new Map());
  await engine.play(0);
  await new Promise(r => setTimeout(r, 800));
  const meter = engine.trackMeter(t.id);
  const master = engine.masterLevels();
  const state = engine.ctx ? engine.ctx.state : 'none';
  engine.stop();
  return { meter, master, state };
}

(async () => {
  window.__zyRaw = [];
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < ZY_PATCHES.length; i++) {
    const p = ZY_PATCHES[i];
    try {
      results.push(await renderOne(p));
    } catch (e) {
      results.push({ id: p.id, cat: p.cat, name: p.name, error: String(e && e.message || e) });
    }
    if (i % 10 === 0) OUT.textContent = `跑測試中… ${i}/${ZY_PATCHES.length}`;
  }
  let project = [];
  try { project = await renderProject(); } catch (e) { project = [{ error: String(e && e.message || e) }]; }
  let live = null;
  try { live = await liveTest(); } catch (e) { live = { error: String(e && e.message || e) }; }
  const payload = JSON.stringify({
    ms: Math.round(performance.now() - t0), results, project, live,
    errors: (globalThis.__zyErrors || []).filter(e => !/^dbg/.test(e)).slice(0, 14),
    raw: window.__zyRaw,
  });
  OUT.textContent = '完成';
  try { await fetch('/__RESULT__', { method: 'POST', body: payload }); }
  catch (e) { document.title = 'ERR ' + e.message; }
})();
