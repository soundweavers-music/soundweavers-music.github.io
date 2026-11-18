// 共用小工具：dB 換算、時間格式、WAV 編碼、id、波形峰值
export const dbToGain = db => (db <= -60 ? 0 : Math.pow(10, db / 20));
export const gainToDb = g => (g <= 0.000001 ? -Infinity : 20 * Math.log10(g));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let _seq = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

export const TRACK_COLORS = [
  '#4f9dff', '#35c9a5', '#f5b83d', '#f06b6b', '#a78bfa', '#5ad1e8', '#f78fc3', '#9bd35a',
  '#ff9f5a', '#6c8cff', '#3fd88a', '#e8d35a', '#ff6b9a', '#b58bff', '#59c3ff', '#c6e05a',
];

export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

// 秒 → 小節.拍.十六分.tick（以 4 分音符為一拍，譜號分母目前固定 4）
export function fmtBars(sec, bpm, sigNum) {
  const beatLen = 60 / bpm;
  const beats = Math.max(0, sec / beatLen);
  const bar = Math.floor(beats / sigNum) + 1;
  const beat = Math.floor(beats % sigNum) + 1;
  const frac = beats - Math.floor(beats);
  const div = Math.floor(frac * 4) + 1;
  const tick = Math.floor((frac * 4 - Math.floor(frac * 4)) * 240) + 1;
  return `${String(bar).padStart(3, ' ')} ${beat} ${div} ${String(tick).padStart(3, ' ')}`;
}

export function fmtDb(db) {
  if (!isFinite(db) || db <= -60) return '-∞';
  return (db > 0 ? '+' : '') + db.toFixed(1);
}

// AudioBuffer → WAV（PCM 16/24 或 IEEE float 32）
export function encodeWav(buffer, bitDepth = 24) {
  const nCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bps = bitDepth / 8;
  const dataSize = len * nCh * bps;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  v.setUint16(22, nCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nCh * bps, true); v.setUint16(32, nCh * bps, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data'); v.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      let s = chans[c][i];
      if (bitDepth === 32) { v.setFloat32(o, s, true); o += 4; continue; }
      s = clamp(s, -1, 1);
      if (bitDepth === 16) {
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      } else {
        const x = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(o, x & 0xff); v.setUint8(o + 1, (x >> 8) & 0xff); v.setUint8(o + 2, (x >> 16) & 0xff); o += 3;
      }
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

// 每 256 個 sample 取一組 min/max，畫波形用
export function computePeaks(buffer, block = 256) {
  const n = Math.ceil(buffer.length / block);
  const min = new Float32Array(n), max = new Float32Array(n);
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  for (let b = 0; b < n; b++) {
    let lo = 1, hi = -1;
    const end = Math.min(buffer.length, (b + 1) * block);
    for (let i = b * block; i < end; i++) {
      for (const ch of chans) { const s = ch[i]; if (s < lo) lo = s; if (s > hi) hi = s; }
    }
    min[b] = lo; max[b] = hi;
  }
  return { min, max, block };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function toast(msg, kind = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
