// 專輯母帶（批次）：讀取檔頭 → 解碼（維持原取樣率）→ 母帶（每首一鍵最佳化／套用目前設定／不處理）
// → 專輯響度（各自到目標／保留歌曲之間的相對大小）→ 去頭尾靜音、淡入淡出 → 以原本的格式與位元率重新編碼
import { buildMastering, ensureWorklet, autoMaster, defaultMastering } from './mastering.js';
import { analyze, TARGETS } from './loudness.js';
import { encodeWav } from './util.js';
import { encodeFlac, encodeMp3 } from './encoders.js';

// ---------------- 檔頭解析 ----------------
const MP3_KBPS = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],   // MPEG1 Layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],      // MPEG2/2.5 Layer III
};
const MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function parseMp3(b) {
  let i = 0;
  // ID3v2
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
  const frames = []; let first = null, vbrFrames = 0;
  const lim = Math.min(b.length - 4, i + 4 * 1024 * 1024);
  while (i < lim && frames.length < 400) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1, ch = b[i + 3] >> 6;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const kbps = MP3_KBPS[ver === 3 ? 1 : 2][bri], sr = MP3_SR[ver][sri];
    const len = Math.floor((ver === 3 ? 144 : 72) * kbps * 1000 / sr) + pad;
    if (len < 24) { i++; continue; }
    if (!first) {
      first = { sr, ch: ch === 3 ? 1 : 2, kbps, ver };
      // Xing / Info / VBRI 標頭（VBR 或 LAME 的 CBR 標記）
      const side = ver === 3 ? (ch === 3 ? 17 : 32) : (ch === 3 ? 9 : 17);
      const tag = String.fromCharCode(...b.subarray(i + 4 + side, i + 8 + side));
      if (tag === 'Xing') first.vbr = true;
      if (tag === 'Xing' || tag === 'Info') { const fl = b[i + 7 + side + 4]; if (fl & 1) vbrFrames = (b[i + 12 + side] << 24 | b[i + 13 + side] << 16 | b[i + 14 + side] << 8 | b[i + 15 + side]) >>> 0; i += len; continue; }
      if (String.fromCharCode(...b.subarray(i + 36, i + 40)) === 'VBRI') first.vbr = true;
    }
    frames.push(kbps);
    i += len;
  }
  if (!first) return null;
  const vbr = first.vbr || new Set(frames).size > 1;
  const avg = frames.length ? frames.reduce((s, x) => s + x, 0) / frames.length : first.kbps;
  return { format: 'mp3', sampleRate: first.sr, channels: first.ch, kbps: vbr ? Math.round(avg) : frames[0] || first.kbps, vbr, frames: vbrFrames };
}

function parseWav(b, dv) {
  if (String.fromCharCode(...b.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...b.subarray(8, 12)) !== 'WAVE') return null;
  let o = 12;
  while (o + 8 <= b.length) {
    const id = String.fromCharCode(...b.subarray(o, o + 4)), sz = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      let tag = dv.getUint16(o + 8, true);
      const ch = dv.getUint16(o + 10, true), sr = dv.getUint32(o + 12, true), bits = dv.getUint16(o + 22, true);
      if (tag === 0xfffe && sz >= 40) tag = dv.getUint16(o + 32, true);   // WAVE_FORMAT_EXTENSIBLE
      return { format: 'wav', sampleRate: sr, channels: ch, bitDepth: bits, float: tag === 3 };
    }
    o += 8 + sz + (sz & 1);
  }
  return null;
}

function parseFlac(b) {
  if (String.fromCharCode(...b.subarray(0, 4)) !== 'fLaC') return null;
  // 第一個 metadata block 一定是 STREAMINFO：sr 20 bits、ch 3 bits、bps 5 bits，從 offset 18 開始
  const p = 8 + 10;
  const sr = (b[p] << 12) | (b[p + 1] << 4) | (b[p + 2] >> 4);
  const ch = ((b[p + 2] >> 1) & 7) + 1;
  const bits = (((b[p + 2] & 1) << 4) | (b[p + 3] >> 4)) + 1;
  return { format: 'flac', sampleRate: sr, channels: ch, bitDepth: bits };
}

// OGG / M4A / AAC 等：瀏覽器可以解碼，但這裡沒有編碼器 → 輸出改成 FLAC（無損，不會比原檔差）
export async function probe(file) {
  const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const dv = new DataView(head.buffer);
  const info = parseWav(head, dv) || parseFlac(head) || parseMp3(head);
  if (info) return info;
  const ext = (file.name.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
  // ogg：從第一個 Vorbis/Opus 標頭讀取樣率
  if (String.fromCharCode(...head.subarray(0, 4)) === 'OggS') {
    const s = String.fromCharCode(...head.subarray(28, 36));
    if (s.startsWith('\x01vorbis')) return { format: 'ogg', sampleRate: dv.getUint32(40, true), channels: head[39], kbps: Math.round(dv.getInt32(48, true) / 1000) || null };
    if (s === 'OpusHead') return { format: 'opus', sampleRate: 48000, channels: head[37] };
  }
  return { format: ext || 'unknown', sampleRate: 0, channels: 0 };
}

export function describeInfo(i) {
  if (!i || !i.sampleRate) return '格式不明';
  const sr = (i.sampleRate / 1000).toFixed(i.sampleRate % 1000 ? 1 : 0) + ' kHz';
  const ch = i.channels === 1 ? '單聲道' : '立體聲';
  if (i.format === 'mp3') return `MP3 ${i.kbps} kbps${i.vbr ? '（VBR 平均）' : ''} · ${sr} · ${ch}`;
  if (i.format === 'wav') return `WAV ${i.float ? '32-bit float' : i.bitDepth + '-bit'} · ${sr} · ${ch}`;
  if (i.format === 'flac') return `FLAC ${i.bitDepth}-bit · ${sr} · ${ch}`;
  return `${i.format.toUpperCase()}${i.kbps ? ' ' + i.kbps + ' kbps' : ''} · ${sr} · ${ch}`;
}

// 輸出格式：跟原檔一樣。MP3 對到 lamejs 支援的位元率；沒有編碼器的格式（ogg、m4a…）改成 FLAC 24-bit
const LAME_KBPS = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
export function outputFormat(info) {
  if (info.format === 'mp3' && [32000, 44100, 48000].includes(info.sampleRate)) {
    const k = LAME_KBPS.reduce((a, b) => (Math.abs(b - info.kbps) < Math.abs(a - info.kbps) ? b : a), 320);
    return { format: 'mp3', kbps: k, sampleRate: info.sampleRate, ext: 'mp3', note: info.vbr ? `原檔是 VBR（平均 ${info.kbps} kbps），輸出為 CBR ${k} kbps` : '' };
  }
  if (info.format === 'mp3') return { format: 'flac', bitDepth: 16, sampleRate: info.sampleRate, ext: 'flac', note: 'MP3 編碼器不支援這個取樣率，改輸出 FLAC' };
  if (info.format === 'wav') return { format: 'wav', bitDepth: info.float ? 32 : Math.min(32, info.bitDepth <= 16 ? 16 : info.bitDepth <= 24 ? 24 : 32), sampleRate: info.sampleRate, ext: 'wav', note: '' };
  if (info.format === 'flac') return { format: 'flac', bitDepth: info.bitDepth <= 16 ? 16 : 24, sampleRate: info.sampleRate, ext: 'flac', note: '' };
  return { format: 'flac', bitDepth: 24, sampleRate: info.sampleRate || 48000, ext: 'flac', note: `瀏覽器沒有 ${info.format.toUpperCase()} 編碼器，改輸出 FLAC（無損）` };
}

// ---------------- 解碼（維持原取樣率）----------------
export async function decodeFile(file, sampleRate) {
  const sr = sampleRate || 48000;
  let ctx;
  try { ctx = new OfflineAudioContext(2, 1, sr); } catch (_) { ctx = new OfflineAudioContext(2, 1, 48000); }
  return ctx.decodeAudioData(await file.arrayBuffer());
}

// ---------------- 處理 ----------------
// 用指定的母帶設定把一段音訊算一次（跟 engine.render 的母帶段相同：5 ms limiter 延遲會裁掉）
export async function renderMastered(buf, m) {
  const sr = buf.sampleRate, lat = m.on && m.limiter?.on ? Math.max(1, Math.round(sr * 0.005)) : 0;
  const oc = new OfflineAudioContext(2, buf.length + lat, sr);
  await ensureWorklet(oc);
  const src = oc.createBufferSource(); src.buffer = buf;
  const ms = buildMastering(oc, m);
  src.connect(ms.input); ms.output.connect(oc.destination);
  src.start();
  const out = await oc.startRendering();
  if (!lat) return out;
  const fixed = new AudioBuffer({ numberOfChannels: 2, length: buf.length, sampleRate: sr });
  for (let c = 0; c < 2; c++) fixed.copyToChannel(out.getChannelData(c).subarray(lat, lat + buf.length), c);
  return fixed;
}

// 取最大聲的一段（以 1 秒 RMS 找，前後各取一半）；歌比 sec 短就整首
export function excerpt(buf, sec) {
  const sr = buf.sampleRate, len = Math.round(sec * sr);
  if (buf.length <= len * 1.2) return buf;
  const d = buf.getChannelData(0), win = sr, e = [];
  for (let i = 0; i + win <= buf.length; i += win) { let s = 0; for (let k = i; k < i + win; k += 8) s += d[k] * d[k]; e.push(s); }
  const n = Math.round(sec);
  let best = 0, bi = 0, run = 0;
  for (let i = 0; i < e.length; i++) { run += e[i]; if (i >= n) run -= e[i - n]; if (i >= n - 1 && run > best) { best = run; bi = i - n + 1; } }
  const st = Math.min(buf.length - len, bi * win);
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: len, sampleRate: sr });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(st, st + len), c);
  return out;
}

// 找頭尾靜音（低於 thrDb 的部分），回傳 [開始樣本, 結束樣本)
export function findSilence(buf, thrDb = -60, keepMs = 30) {
  const th = Math.pow(10, thrDb / 20), n = buf.length, ch = [];
  for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
  const loud = i => ch.some(d => Math.abs(d[i]) > th);
  let a = 0; while (a < n && !loud(a)) a++;
  let z = n - 1; while (z > a && !loud(z)) z--;
  const keep = Math.round(buf.sampleRate * keepMs / 1000);
  return [Math.max(0, a - keep), Math.min(n, z + 1 + keep)];
}

// 淡入淡出曲線：t 0→1
const CURVES = {
  linear: t => t,
  equal: t => Math.sin(t * Math.PI / 2),          // 等功率（聽感最自然）
  exp: t => t * t,                                  // 指數（淡出時先慢後快 → 尾巴比較乾淨）
  scurve: t => 0.5 - 0.5 * Math.cos(Math.PI * t),  // S 曲線
};
export const FADE_CURVES = [['equal', '等功率（推薦）'], ['linear', '線性'], ['exp', '指數'], ['scurve', 'S 曲線']];

export function applyEdits(buf, o) {
  let [a, z] = o.trim ? findSilence(buf, o.trimDb ?? -60) : [0, buf.length];
  if (z <= a) [a, z] = [0, buf.length];
  const n = z - a, sr = buf.sampleRate;
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: n, sampleRate: sr });
  const fi = Math.min(n, Math.round((o.fadeIn || 0) * sr)), fo = Math.min(n, Math.round((o.fadeOut || 0) * sr));
  const cIn = CURVES[o.curveIn || 'equal'] || CURVES.equal, cOut = CURVES[o.curveOut || 'equal'] || CURVES.equal;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c).slice(a, z);
    for (let i = 0; i < fi; i++) d[i] *= cIn(i / fi);
    for (let i = 0; i < fo; i++) d[n - 1 - i] *= cOut(i / fo);
    out.copyToChannel(d, c);
  }
  return out;
}

function scale(buf, g) {
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
}

// 母帶輸出一律是立體聲；原檔是單聲道就混回單聲道（維持聲道數）
function toChannels(buf, nCh) {
  if (nCh !== 1 || buf.numberOfChannels === 1) return buf;
  const out = new AudioBuffer({ numberOfChannels: 1, length: buf.length, sampleRate: buf.sampleRate });
  const L = buf.getChannelData(0), R = buf.getChannelData(1), m = new Float32Array(buf.length);
  for (let i = 0; i < m.length; i++) m[i] = (L[i] + R[i]) * 0.5;
  out.copyToChannel(m, 0);
  return out;
}

function dither(buf, bits) {
  if (bits >= 32) return;
  const lsb = 1 / Math.pow(2, bits - 1);
  let s = 0x2468ace;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] += (rnd() - rnd()) * lsb; }
}

export async function encodeLike(buf, fmt, onProgress) {
  if (fmt.format === 'mp3') return encodeMp3(buf, fmt.kbps, onProgress);
  if (fmt.bitDepth < 32) dither(buf, fmt.bitDepth);
  if (fmt.format === 'flac') return encodeFlac(buf, fmt.bitDepth, onProgress);
  return encodeWav(buf, fmt.bitDepth);
}

/**
 * 處理整張專輯
 * songs: [{ file, info, buf(已解碼), fadeIn?, fadeOut?（覆寫全域設定） }]
 * opts: { mode: 'auto'|'current'|'none', current (母帶設定), target, album: 'each'|'album',
 *         keepGap (%), fadeIn, fadeOut, curveIn, curveOut, trim, trimDb, firstNoFadeIn }
 * onSong(i, stage, data)
 * 回傳 [{ buf(最終), mastering, before, after, fmt }]
 */
export async function processAlbum(songs, opts, onSong = () => {}) {
  const T = TARGETS.find(t => t.id === opts.target) || TARGETS[0];
  const res = [];
  // 1) 每首母帶
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    if (opts.cancelled && opts.cancelled()) throw new Error('已取消');
    onSong(i, 'analyze');
    const before = analyze(s.buf);
    let m = null, out = s.buf;
    if (opts.mode === 'auto') {
      // 一鍵最佳化要反覆算 6～7 次：只用最大聲的 60 秒找設定，最後整首算一次（20 首歌也不會等太久）
      const ex = excerpt(s.buf, 60);
      const r = await autoMaster(mm => renderMastered(ex, mm), { ...defaultMastering(), ...(opts.current || {}) }, T.id, t => onSong(i, 'step', t));
      m = r.mastering;
      onSong(i, 'step', '整首套用…');
      out = await renderMastered(s.buf, m);
      // 片段跟整首的響度可能差一點：再補一次 limiter gain（最多 ±3 dB）
      const a = analyze(out).integrated;
      if (isFinite(a) && Math.abs(T.lufs - a) > 0.4) {
        m = { ...m, limiter: { ...m.limiter, gain: Math.max(-12, Math.min(18, m.limiter.gain + Math.max(-3, Math.min(3, T.lufs - a)))) } };
        out = await renderMastered(s.buf, m);
      }
    } else if (opts.mode === 'current') {
      m = { ...opts.current, on: true };
      onSong(i, 'step', '套用母帶設定…');
      out = await renderMastered(s.buf, m);
    } else {
      // 不做母帶：複製一份（後面會修改）
      out = new AudioBuffer({ numberOfChannels: s.buf.numberOfChannels, length: s.buf.length, sampleRate: s.buf.sampleRate });
      for (let c = 0; c < s.buf.numberOfChannels; c++) out.copyToChannel(s.buf.getChannelData(c), c);
    }
    res.push({ buf: out, mastering: m, before, after: analyze(out), fmt: outputFormat(s.info) });
    onSong(i, 'mastered', res[i]);
  }
  // 2) 專輯響度：保留歌曲之間原本的相對大小。
  //    以「原始最大聲那首」對齊目標，其他歌依原始差距跟著降；只往下調（不會超過 limiter 上限）
  if (opts.album === 'album' && opts.mode !== 'none') {
    const loud = songs.map(s => analyze(s.buf).integrated);
    const ref = Math.max(...loud.filter(isFinite));
    res.forEach((r, i) => {
      if (!isFinite(loud[i]) || !isFinite(r.after.integrated)) return;
      // 原本比最大聲那首小 d LU → 現在小 d × keep（預設保留 35%：抒情歌還是比較小聲，但不會小到要調音量）
      const keep = Math.max(0, Math.min(1, (opts.keepGap ?? 35) / 100));
      const want = T.lufs - (ref - loud[i]) * keep;
      const g = want - r.after.integrated;
      if (g < -0.05) { scale(r.buf, Math.pow(10, g / 20)); r.albumGain = g; r.after = analyze(r.buf); }
    });
  }
  // 3) 去頭尾靜音、淡入淡出、聲道數
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i], r = res[i];
    const fi = s.fadeIn ?? (opts.firstNoFadeIn && i === 0 ? 0 : opts.fadeIn);
    const fo = s.fadeOut ?? opts.fadeOut;
    r.buf = toChannels(applyEdits(r.buf, { trim: opts.trim, trimDb: opts.trimDb, fadeIn: fi, fadeOut: fo, curveIn: opts.curveIn, curveOut: opts.curveOut }), s.info.channels || 2);
    r.final = analyze(r.buf);
    onSong(i, 'done', r);
  }
  return res;
}
