// 內建鋼琴 sf2 的檢查（不上線）：力度 1–127 的音量曲線（層與層接得順不順）、每個鍵都有聲音、尾音長度
// 一次離線算圖排很多個音（各隔開一段），比每個音開一個 OfflineAudioContext 快很多。
import { parseSF2, sf2Voice } from './js/sf2.js';

const SR = 44100;
const url = new URLSearchParams(location.search).get('sf') || '../assets/daw-bank/builtin-piano.sf2';

// 依序在 t = i*gap 起音、各按 hold 秒；回傳每個音在自己那一格裡的峰值（dB）
async function batch(sf, notes, gap, hold) {
  const dur = notes.length * gap + 0.5;
  const oc = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  notes.forEach(([key, vel], i) => {
    const v = sf2Voice(oc, oc.destination, sf, 0, key, vel, i * gap);
    v.release(i * gap + hold);
  });
  const d = (await oc.startRendering()).getChannelData(0);
  return notes.map((_, i) => {
    const a = Math.floor(i * gap * SR), b = Math.floor((i * gap + Math.min(hold, gap * 0.8)) * SR);
    let pk = 0; for (let j = a; j < b; j++) pk = Math.max(pk, Math.abs(d[j]));
    return 20 * Math.log10(pk + 1e-9);
  });
}

async function tailOf(sf, key) {
  // 按住 12 秒，看多久掉到峰值 -40 dB（真鋼琴：低音 > 10 s、中音 ~5–8 s、高音 1–3 s）
  const dur = 12;
  const oc = new OfflineAudioContext(1, dur * SR, SR);
  sf2Voice(oc, oc.destination, sf, 0, key, 90, 0);
  const d = (await oc.startRendering()).getChannelData(0);
  const hop = 2205;
  let pk = 0; const env = [];
  for (let s = 0; s + hop < d.length; s += hop) { let m = 0; for (let i = s; i < s + hop; i++) m = Math.max(m, Math.abs(d[i])); env.push(m); pk = Math.max(pk, m); }
  const i = env.findIndex((v, j) => j > 2 && v < pk * 0.01);
  return i < 0 ? dur : i * hop / SR;
}

(async () => {
  const t0 = performance.now();
  const ab = await (await fetch(url)).arrayBuffer();
  const sf = parseSF2(ab);
  sf.id = 'chk';
  const curve = {};
  const vels = []; for (let v = 4; v <= 127; v += 4) vels.push(v);
  for (const key of [33, 48, 60, 72, 84]) {
    const pk = await batch(sf, vels.map(v => [key, v]), 0.35, 0.3);
    curve[key] = vels.map((v, i) => [v, Math.round(pk[i] * 10) / 10]);
  }
  const keys = []; for (let k = 21; k <= 108; k++) keys.push([k, 100]);
  const kp = await batch(sf, keys, 0.25, 0.2);
  const silent = keys.filter((_, i) => kp[i] < -60).map(k => k[0]);
  const tails = {};
  for (const k of [21, 33, 48, 60, 72, 84, 96, 108]) tails[k] = Math.round(await tailOf(sf, k) * 10) / 10;
  const r = { bytes: ab.byteLength, presets: sf.presets.length, samples: sf.samples.length, curve, silent, tails,
    ms: Math.round(performance.now() - t0) };
  await fetch('/__RESULT__', { method: 'POST', body: JSON.stringify(r) });
})();
