// 內建鋼琴：每個鍵實際彈出來的音高（不上線）
import { parseSF2, sf2Voice, regionsFor } from './js/sf2.js';
const SR = 44100;
const url = new URLSearchParams(location.search).get('sf') || '../assets/daw-bank/builtin-piano.sf2';
(async () => {
  const sf = parseSF2(await (await fetch(url)).arrayBuffer()); sf.id = 'p';
  const keys = []; for (let k = 21; k <= 108; k++) keys.push(k);
  const vels = [40, 100];
  const gap = 1.6;
  const notes = []; for (const k of keys) for (const v of vels) notes.push([k, v]);
  const oc = new OfflineAudioContext(1, Math.ceil(notes.length * gap * SR + SR), SR);
  notes.forEach(([k, v], i) => sf2Voice(oc, oc.destination, sf, 0, k, v, i * gap).release(i * gap + 1.4));
  const d = (await oc.startRendering()).getChannelData(0);
  const segs = notes.map(([k, v], i) => {
    const a = Math.floor((i * gap + 0.25) * SR);
    const reg = regionsFor(sf, 0, k, v)[0];
    return { k, v, s: Array.from(d.subarray(a, a + Math.floor(1.0 * SR)), x => Math.round(x * 32767)),
      reg: reg && { sample: sf.samples[reg.sampleIdx].name, root: sf.samples[reg.sampleIdx].pitch, rate: reg.playbackRate } };
  });
  await fetch('/__RESULT__', { method: 'POST', body: JSON.stringify({ sr: SR, segs }) });
})();
