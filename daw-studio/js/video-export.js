// 輸出 MP4：聲音先用離線算圖混好（跟輸出音檔完全同一條鏈），影像逐格畫到 canvas，
// 再用瀏覽器的 WebCodecs 編成 H.264 + AAC，最後自己封裝成 MP4。全部在本機完成。
import { store } from './state.js';
import { engine } from './engine.js';
import { buildMp4 } from './mp4-writer.js';
import { composeFrame, videoSettings } from './video.js';
import { downloadBlob, toast } from './util.js';

const safe = s => (s || '未命名').replace(/[\\/:*?"<>|]/g, '_');

// AAC：先問瀏覽器支不支援，再把整段聲音切塊送進去
async function encodeAac(buf, bitrate = 192000) {
  const sr = buf.sampleRate, ch = Math.min(2, buf.numberOfChannels);
  const cfg = { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate };
  const sup = await AudioEncoder.isConfigSupported(cfg).catch(() => ({ supported: false }));
  if (!sup.supported) throw new Error('這個瀏覽器沒有 AAC 編碼器，請改用 Chrome 或 Edge');
  const chunks = [];
  let asc = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description && !asc) asc = new Uint8Array(meta.decoderConfig.description);
      const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
      chunks.push({ data: d, duration: 1024 });
    },
    error: e => { throw e; },
  });
  enc.configure(sup.config || cfg);
  const N = 4800;                                   // 100 ms 一塊
  const src = [];
  for (let c = 0; c < ch; c++) src.push(buf.getChannelData(c));
  for (let off = 0; off < buf.length; off += N) {
    const n = Math.min(N, buf.length - off);
    if (ch === 1) {
      // 單聲道：複製成兩聲道，AAC-LC 比較通用
      const d = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { d[i] = src[0][off + i]; d[n + i] = src[0][off + i]; }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / sr * 1e6), data: d });
      enc.encode(ad); ad.close();
    } else {
      const d = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { d[i] = src[0][off + i]; d[n + i] = src[1][off + i]; }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / sr * 1e6), data: d });
      enc.encode(ad); ad.close();
    }
    if (enc.encodeQueueSize > 12) await new Promise(r => setTimeout(r, 0));
  }
  await enc.flush();
  if (!asc) {
    // 沒有給 AudioSpecificConfig 就自己組（AAC-LC、 stereo）
    const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350].indexOf(sr);
    const f = idx < 0 ? 3 : idx;
    asc = Uint8Array.of((2 << 3) | (f >> 1), ((f & 1) << 7) | (2 << 3));
  }
  return { sampleRate: sr, channels: 2, asc, bitrate, samples: chunks, actualChannels: ch };
}

function pickCodec(W, H, fps) {
  const px = W * H * fps;
  if (px > 1920 * 1080 * 31) return 'avc1.640033';       // 4K 左右
  if (px > 1280 * 720 * 31) return 'avc1.640028';        // 1080p
  return 'avc1.4d0028';                                  // 720p 以下
}

// opts: { range, width, height, fps }
export async function exportVideoMp4(opts = {}) {
  await engine.ensure();
  const p = store.project, vs = videoSettings();
  const W = Math.round(opts.width || vs.w), H = Math.round(opts.height || vs.h), fps = opts.fps || vs.fps || 30;
  const end = store.projectEnd();
  const range = opts.range === 'loop' && p.loop.end > p.loop.start
    ? { start: p.loop.start, end: p.loop.end } : { start: 0, end };
  if (range.end - range.start < 0.05) throw new Error('專案裡沒有任何片段可以輸出');

  // 1) 聲音（跟輸出 WAV 同一條混音鏈）
  store.emit('export-progress', { text: '混音算圖中…', frac: 0 });
  const audioBuf = await engine.render({
    start: range.start, end: range.end, sampleRate: 48000,
    onProgress: f => store.emit('export-progress', { text: '混音算圖中…', frac: f * 0.35 }),
  });
  store.emit('export-progress', { text: '聲音編碼中（AAC）…', frac: 0.35 });
  const audio = await encodeAac(audioBuf, opts.bitrate || 192000);

  // 2) 影像
  const codec = pickCodec(W, H, fps);
  const bitrate = Math.round(W * H * fps * 0.09);        // 約 0.09 bit/pixel
  const sup = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate, framerate: fps })
    .catch(() => ({ supported: false }));
  if (!sup.supported) throw new Error('這個瀏覽器沒有 H.264 編碼器，請改用 Chrome 或 Edge（Safari 舊版不支援）');

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { alpha: false });
  const frames = Math.max(1, Math.round((range.end - range.start) * fps));
  const samples = [];
  let avcC = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description && !avcC) avcC = new Uint8Array(meta.decoderConfig.description);
      const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
      samples.push({ data: d, key: chunk.type === 'key' });
    },
    error: e => { console.error(e); },
  });
  enc.configure({ codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' });

  for (let i = 0; i < frames; i++) {
    const t = range.start + i / fps;
    await composeFrame(ctx, W, H, t, { seek: true });
    const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    if (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 0));
    if (i % 5 === 0) {
      store.emit('export-progress', { text: `影像算圖與編碼 ${i + 1}/${frames} 格…`, frac: 0.4 + 0.55 * (i + 1) / frames });
    }
  }
  await enc.flush();
  if (!avcC) throw new Error('編碼器沒有給 avcC，無法封裝 MP4');

  // 3) 封裝
  store.emit('export-progress', { text: '封裝 MP4…', frac: 0.97 });
  const bytes = buildMp4({ width: W, height: H, fps, videoSamples: samples, avcC, audio });
  const blob = new Blob([bytes], { type: 'video/mp4' });
  if (opts.download !== false) downloadBlob(blob, `${safe(p.name)}.mp4`);
  store.emit('export-progress', { done: true });
  if (opts.download !== false) toast(`已輸出 MP4（${W}×${H}・${fps}fps・${(bytes.length / 1048576).toFixed(1)} MB）`);
  return blob;
}
