// 片段升降音（高品質、離線）：音訊片段右鍵 → 升降音
// 產生一份新的音訊取代原片段（原音訊保留在 undo 裡），長度不變、音高準確。
import { store } from './state.js';
import { uid, computePeaks, toast } from './util.js';

let worker = null;
const getWorker = () => (worker ||= new Worker(new URL('./pitch-render-worker.js', import.meta.url)));

export function pitchShiftBuffer(buf, semitones, cents = 0, onProgress) {
  return new Promise((resolve, reject) => {
    const chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c).slice());
    const w = getWorker();
    w.onmessage = e => {
      if (e.data.progress !== undefined) { onProgress && onProgress(e.data.progress); return; }
      if (e.data.done) {
        const out = new AudioBuffer({ numberOfChannels: chans.length, length: buf.length, sampleRate: buf.sampleRate });
        e.data.chans.forEach((d, c) => out.copyToChannel(d, c));
        resolve(out);
      }
    };
    w.onerror = err => { worker = null; reject(new Error('升降音失敗：' + (err.message || '背景運算錯誤'))); };
    w.postMessage({ chans, sr: buf.sampleRate, semitones, cents }, chans.map(c => c.buffer));
  });
}

// clipIds：一次處理多個片段（例如整首伴奏切成好幾段）
export async function pitchShiftClips(clipIds, semitones, cents = 0) {
  const items = clipIds.map(id => store.findClip(id)).filter(f => f && !f.clip.notes);
  if (!items.length) return;
  if (!semitones && !cents) return;
  // 先全部算好，再一次寫入（中途失敗不會留下一半改過的專案）
  const results = [];
  for (const [k, { clip }] of items.entries()) {
    const src = store.buffers.get(clip.bufferId);
    if (!src) continue;
    // 只處理片段實際用到的那一段（前後多留 50 ms，避免邊界的 grain 不完整）
    const sr = src.sampleRate, pad = Math.round(sr * 0.05);
    const s0 = Math.max(0, Math.floor(clip.offset * sr) - pad);
    const s1 = Math.min(src.length, Math.ceil((clip.offset + clip.duration) * sr) + pad);
    const part = new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: s1 - s0, sampleRate: sr });
    for (let c = 0; c < src.numberOfChannels; c++) part.copyToChannel(src.getChannelData(c).subarray(s0, s1), c);
    const label = items.length > 1 ? `（${k + 1}/${items.length}）` : '';
    store.emit('busy', { text: `升降音${label}… 0%` });
    try {
      const out = await pitchShiftBuffer(part, semitones, cents, p => store.emit('busy', { text: `升降音${label}… ${Math.round(p * 100)}%` }));
      results.push({ clip, out, newOffset: clip.offset - s0 / sr });
    } catch (e) { store.emit('busy', null); toast(e.message, 'error'); return; }
  }
  store.emit('busy', null);
  store.checkpoint();
  const tag = `${semitones > 0 ? '+' : ''}${semitones}${cents ? ` ${cents > 0 ? '+' : ''}${cents}c` : ''}`;
  for (const { clip, out, newOffset } of results) {
    const id = uid('buf');
    const oldName = store.bufferMeta.get(clip.bufferId)?.name || clip.name;
    store.buffers.set(id, out);
    store.bufferMeta.set(id, { name: `${oldName.replace(/\.wav$/i, '')} (${tag}).wav`, peaks: computePeaks(out) });
    clip.bufferId = id;
    clip.offset = newOffset;
    // 片段名稱：已經移過調就換掉標記，不要一直疊加
    const prevShift = clip.pitch || 0;
    clip.pitch = prevShift + semitones + cents / 100;
    const total = Math.round(clip.pitch * 100) / 100;
    clip.name = clip.name.replace(/\s*［[^］]*］$/, '') + (total ? ` ［${total > 0 ? '+' : ''}${total}］` : '');
  }
  store.changed('structure');
  toast(`已${semitones >= 0 && cents >= 0 ? '升' : '降'}調 ${tag}${results.length > 1 ? `（${results.length} 個片段）` : ''}。可以 Ctrl+Z 復原`);
}
