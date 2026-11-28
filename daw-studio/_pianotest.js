// 平台鋼琴的量測（不上線）：每個音 × 三種力度各算一次，原始樣本傳回 scripts/daw_shots/piano_check.py 分析
import { scheduleNote } from './js/synth.js';
import { ensureZYWorklet } from './js/zy-synth.js';

const SR = 44100;
const q = new URLSearchParams(location.search);
const ID = 'zy:' + (q.get('id') || 'pno.grand');
const NOTES = (q.get('notes') || '24,36,48,60,72,84,96').split(',').map(Number);
const VELS = (q.get('vels') || '30,80,120').split(',').map(Number);
const DUR = Number(q.get('dur') || 8);
const HOLD = Number(q.get('hold') || 6);

async function render(n, v, hold = HOLD) {
  const oc = new OfflineAudioContext(1, Math.ceil(DUR * SR), SR);
  await ensureZYWorklet(oc);
  const g = oc.createGain(); g.connect(oc.destination);
  scheduleNote(oc, g, ID, n, v, 0, hold);
  await new Promise(r => setTimeout(r, 40));
  const buf = await oc.startRendering();
  // 16-bit 轉成 base64 傳回去，比 JSON 數字陣列小很多
  const d = buf.getChannelData(0);
  const i16 = new Int16Array(d.length);
  for (let i = 0; i < d.length; i++) i16[i] = Math.max(-32767, Math.min(32767, Math.round(d[i] * 32767)));
  const u8 = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

(async () => {
  const out = [];
  for (const n of NOTES) for (const v of VELS) out.push({ n, v, pcm: await render(n, v) });
  // 制音器另外算：按 1.5 秒就放開
  const dmp = [];
  for (const n of NOTES) dmp.push({ n, pcm: await render(n, 80, 1.5) });
  await fetch('/__RESULT__', { method: 'POST', body: JSON.stringify({ sr: SR, id: ID, hold: HOLD, items: out, damp: dmp, errors: (globalThis.__zyErrors || []).filter(e => !/^PNO/.test(e)).slice(0, 5) }) });
  document.title = 'done';
})();
