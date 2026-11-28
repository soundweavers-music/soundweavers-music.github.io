// 鋼琴試聽片段（不上線）：同一段樂句給新舊版本各算一次，方便 A/B 比較
import { scheduleNote } from './js/synth.js';
import { ensureZYWorklet } from './js/zy-synth.js';
import { parseSF2, sf2Voice } from './js/sf2.js';

const SR = 44100;
const Q = new URLSearchParams(location.search);
const ID = 'zy:' + (Q.get('id') || 'pno.grand');
const SF = Q.get('sf');   // 給了 sf=… 就用那份 sf2 的第一個 preset 彈
// [拍, 音, 力度, 長度(拍)]，♩ = 84
const BEAT = 60 / 84;
const NOTES = [];
const add = (b, ns, v, d) => ns.forEach(n => NOTES.push([b, n, v, d]));
// 1) 中音區和弦 pp → mf → ff（聽力度與亮度）
add(0, [48, 55, 60, 64], 28, 1.8); add(2, [48, 55, 60, 64], 70, 1.8); add(4, [48, 55, 60, 64], 118, 3.5);
// 2) 從低音到高音的琶音（聽各音區的不諧和與衰減）
[24, 31, 36, 43, 48, 55, 60, 67, 72, 79, 84, 91, 96].forEach((n, i) => NOTES.push([8.5 + i * 0.35, n, 80, 0.3]));
// 3) 低音單音 ff 長放（聽雙段衰減、縱波的金屬聲）
add(14, [24, 36], 115, 5);
// 4) 抒情的旋律（右手）＋分解和弦（左手）
const mel = [[20, 76, 72, 1], [21, 74, 64, 0.5], [21.5, 72, 60, 0.5], [22, 71, 70, 1.5], [23.5, 72, 58, 0.5], [24, 74, 76, 2]];
mel.forEach(([b, n, v, d]) => NOTES.push([b, n, v, d]));
[[20, 45], [20.5, 52], [21, 57], [21.5, 60], [22, 43], [22.5, 50], [23, 55], [23.5, 59], [24, 41], [24.5, 48], [25, 53], [25.5, 57]]
  .forEach(([b, n]) => NOTES.push([b, n, 50, 0.9]));
// 5) 斷奏（聽制音器）
[60, 64, 67, 72, 67, 64, 60].forEach((n, i) => NOTES.push([27.5 + i * 0.25, n, 90, 0.12]));

(async () => {
  const dur = 31 * BEAT + 3;
  const oc = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  await ensureZYWorklet(oc);
  const g = oc.createGain(); g.connect(oc.destination);
  if (SF) {
    const sf = parseSF2(await (await fetch(SF)).arrayBuffer()); sf.id = 'demo';
    for (const [b, n, v, d] of NOTES) sf2Voice(oc, g, sf, 0, n, v, b * BEAT).release((b + d) * BEAT);
  } else for (const [b, n, v, d] of NOTES) scheduleNote(oc, g, ID, n, v, b * BEAT, d * BEAT);
  await new Promise(r => setTimeout(r, 80));
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  let ss = 0; for (let i = 0; i < L.length; i++) ss += L[i] * L[i];
  const raw = { peakDb: 20 * Math.log10(pk + 1e-12), rmsDb: 10 * Math.log10(ss / L.length + 1e-24) };   // 正規化之前的大小
  const k = Q.get('raw') ? 1 : 0.89 / Math.max(pk, 1e-6);    // 統一到 -1 dBFS 峰值，新舊版才公平比
  const i16 = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { i16[2 * i] = L[i] * k * 32767; i16[2 * i + 1] = R[i] * k * 32767; }
  const u8 = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  await fetch('/__RESULT__', { method: 'POST', body: JSON.stringify({ sr: SR, pcm: btoa(s), raw }) });
})();
