// 輸出：整首混音或分軌（stems）；WAV / FLAC / MP3。全部在瀏覽器裡算圖與編碼。
import { store } from './state.js';
import { engine } from './engine.js';
import { encodeWav, downloadBlob, toast } from './util.js';
import { encodeFlac, encodeMp3 } from './encoders.js';
import { analyze } from './loudness.js';

const safe = s => (s || '未命名').replace(/[\\/:*?"<>|]/g, '_');

function peakDb(buf) {
  let pk = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; }
  }
  return 20 * Math.log10(Math.max(pk, 1e-9));
}

function normalize(buf, targetDb) {
  const g = Math.pow(10, (targetDb - peakDb(buf)) / 20);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

// 降到 16/24-bit 時加 TPDF dither，避免安靜段落出現量化失真
function dither(buf, bits) {
  if (bits >= 32) return;
  const lsb = 1 / Math.pow(2, bits - 1);
  let s = 0x1234567;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] += (rnd() - rnd()) * lsb;
  }
}

const EXT = { wav: 'wav', flac: 'flac', mp3: 'mp3' };

async function encode(buf, opts, label) {
  const progress = p => store.emit('export-progress', { text: `${label}編碼 ${Math.round(p * 100)}%` });
  if (opts.format === 'mp3') return encodeMp3(buf, opts.kbps, progress);
  const bits = opts.format === 'flac' ? Math.min(24, opts.bitDepth) : opts.bitDepth;
  if (opts.format === 'flac' || bits < 32) dither(buf, bits);
  if (opts.format === 'flac') return encodeFlac(buf, bits, progress);
  return encodeWav(buf, bits);
}

// opts: { mode, range, format, bitDepth, kbps, sampleRate, normalize, stemMaster }
export async function exportAudio(opts) {
  await engine.ensure();
  const p = store.project;
  const end = store.projectEnd();
  if (end <= 0) { toast('專案裡沒有任何片段可以輸出', 'warn'); return; }
  if (opts.format === 'mp3' && ![44100, 48000].includes(opts.sampleRate)) {
    toast('MP3 只支援 44.1 / 48 kHz，已改用 48 kHz', 'warn');
    opts.sampleRate = 48000;
  }
  const range = opts.range === 'loop' && p.loop.end > p.loop.start
    ? { start: p.loop.start, end: p.loop.end, tail: 0 }
    : { start: 0, end };
  const common = { ...range, sampleRate: opts.sampleRate };
  const base = safe(p.name), ext = EXT[opts.format] || 'wav';

  if (opts.mode === 'stems') {
    const tracks = p.tracks.filter(t => t.clips.length && !t.mute);
    if (!tracks.length) { toast('沒有可輸出的軌道', 'warn'); return; }
    const zip = new window.JSZip();
    for (const [i, t] of tracks.entries()) {
      store.emit('export-progress', { text: `分軌 ${i + 1}/${tracks.length}：${t.name}` });
      const buf = await engine.render({ ...common, trackIds: [t.id], masterFx: !!opts.stemMaster });
      zip.file(`${String(i + 1).padStart(2, '0')}_${safe(t.name)}.${ext}`, await encode(buf, opts, `分軌 ${i + 1}：`));
    }
    store.emit('export-progress', { text: '壓縮中…' });
    downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${base}_stems.zip`);
    toast(`已輸出 ${tracks.length} 個分軌`);
  } else {
    store.emit('export-progress', { text: '混音算圖中…' });
    const buf = await engine.render(common);
    const pk = peakDb(buf);
    if (opts.normalize) normalize(buf, -1);
    // 輸出前量一次響度，顯示在完成訊息
    let msg = '';
    try { const a = analyze(buf); msg = `${isFinite(a.integrated) ? a.integrated.toFixed(1) : '—'} LUFS / ${a.truePeakDb.toFixed(1)} dBTP`; } catch (_) { /* 很長的檔案略過 */ }
    downloadBlob(await encode(buf, opts, ''), `${base}.${ext}`);
    if (!opts.normalize && pk > 0) toast(`注意：輸出峰值 ${pk.toFixed(1)} dBFS，已經破音。建議開啟母帶 Limiter`, 'warn');
    else toast(`輸出完成（${msg}），檔案已下載到你的電腦`);
  }
  store.emit('export-progress', { done: true });
}
