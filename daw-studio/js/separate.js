// 人聲／伴奏分離（簡易版）：把選取的音訊片段拆成「人聲」「伴奏」兩條新軌道
import { store, newTrack, MAX_TRACKS } from './state.js';
import { uid, computePeaks, toast } from './util.js';

let worker = null;
function getWorker() {
  if (!worker) worker = new Worker(new URL('./separate-worker.js', import.meta.url));
  return worker;
}

// 單純的離線分離（測試也用這個）
export function separateBuffer(buf, opts = {}, onProgress) {
  return new Promise((resolve, reject) => {
    if (buf.numberOfChannels < 2) { reject(new Error('這是單聲道音檔，沒有左右差異可以分離')); return; }
    const L = buf.getChannelData(0).slice(), R = buf.getChannelData(1).slice();
    // 左右幾乎完全一樣（假立體聲）也分不出來
    let diff = 0, tot = 0;
    for (let i = 0; i < L.length; i += 64) { diff += Math.abs(L[i] - R[i]); tot += Math.abs(L[i]) + Math.abs(R[i]); }
    if (tot > 0 && diff / tot < 0.002) { reject(new Error('左右聲道完全相同（單聲道轉成的立體聲），沒辦法分離')); return; }
    const w = getWorker();
    w.onmessage = e => {
      if (e.data.progress !== undefined) { onProgress && onProgress(e.data.progress); return; }
      if (e.data.done) {
        const mk = chans => {
          const b = new AudioBuffer({ numberOfChannels: 2, length: buf.length, sampleRate: buf.sampleRate });
          chans.forEach((d, c) => b.copyToChannel(d, c));
          return b;
        };
        resolve({ vocal: mk(e.data.vocal), inst: mk(e.data.inst) });
      }
    };
    w.onerror = err => { reject(new Error('分離失敗：' + (err.message || '背景運算錯誤'))); worker = null; };
    w.postMessage({ L, R, sr: buf.sampleRate, strength: opts.strength ?? 0.5, lowCut: opts.lowCut ?? 120, highCut: opts.highCut ?? 8000 }, [L.buffer, R.buffer]);
  });
}

// 從編排視窗呼叫：clipId 是音訊片段
export async function separateClip(clipId, opts = {}) {
  const found = store.findClip(clipId);
  if (!found || found.clip.notes) return;
  const { track, clip } = found;
  const src = store.buffers.get(clip.bufferId);
  if (!src) return;
  const p = store.project;
  if (p.tracks.length + 2 > MAX_TRACKS) { toast(`軌道已經 ${p.tracks.length} 條，最多 ${MAX_TRACKS} 條，請先刪掉不用的軌道`, 'warn'); return; }
  // 只處理片段實際用到的那一段
  const sr = src.sampleRate;
  const s0 = Math.max(0, Math.floor(clip.offset * sr));
  const n = Math.min(src.length - s0, Math.ceil(clip.duration * sr));
  const part = new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: n, sampleRate: sr });
  for (let c = 0; c < src.numberOfChannels; c++) part.copyToChannel(src.getChannelData(c).subarray(s0, s0 + n), c);
  store.emit('busy', { text: '分離人聲與伴奏… 0%' });
  let res;
  try {
    res = await separateBuffer(part, opts, pr => store.emit('busy', { text: `分離人聲與伴奏… ${Math.round(pr * 100)}%` }));
  } catch (e) { store.emit('busy', null); toast(e.message, 'error'); return; }
  store.emit('busy', null);
  store.checkpoint();
  const idx = p.tracks.indexOf(track);
  const mkTrack = (name, buf, color, i) => {
    const t = newTrack(p.tracks.length, 'audio');
    t.name = name; t.color = color;
    const id = uid('buf');
    store.buffers.set(id, buf);
    store.bufferMeta.set(id, { name: `${name}.wav`, peaks: computePeaks(buf) });
    t.clips.push({ id: uid('clip'), bufferId: id, name, start: clip.start, offset: 0, duration: buf.duration,
      gainDb: clip.gainDb || 0, fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0 });
    p.tracks.splice(idx + 1 + i, 0, t);
    return t;
  };
  const base = clip.name.replace(/\s*(人聲|伴奏)$/, '');
  const v = mkTrack(`${base} 人聲`, res.vocal, '#f78fc3', 0);
  mkTrack(`${base} 伴奏`, res.inst, '#5ad1e8', 1);
  // 原片段保留但靜音（整軌靜音會誤傷同軌其他片段，所以只把這個片段的音量拉到底）
  clip.gainDb = -60;
  clip.name = clip.name.endsWith('（已分離）') ? clip.name : clip.name + '（已分離）';
  store.selection.trackId = v.id;
  store.selection.clipIds = new Set([v.clips[0].id]);
  store.changed('structure');
  toast('已分離成「人聲」與「伴奏」兩軌；原片段保留並靜音（音量 -60 dB），可以 Ctrl+Z 復原');
}
