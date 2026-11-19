// 示範專案：給課程截圖與第一次打開的人一個「有東西可以看」的專案
// 全部用程式產生（不讀任何外部檔案），所以可以離線跑
import { store, newTrack, newMidiClip } from './state.js';
import { newFx } from './effects.js';
import { computePeaks, uid } from './util.js';

const SR = 48000;

// 8 小節的人聲錯覺：帶顫音的滑音旋律，加上換氣與子音的雜訊
function makeVocalBuffer(bpm) {
  const beat = 60 / bpm, len = Math.floor(SR * beat * 4 * 8);
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: SR });
  const d = b.getChannelData(0);
  // Am – F – C – G，每個和弦兩小節；旋律用五聲音階
  const scale = [220, 261.63, 293.66, 329.63, 392, 440];
  const notes = [];
  for (let bar = 0; bar < 8; bar++) {
    const n = 4;
    for (let k = 0; k < n; k++) {
      const startBeat = bar * 4 + k + (k === 2 ? 0.5 : 0);
      const durBeat = k === 3 ? 1.4 : 0.9;
      notes.push({ t: startBeat * beat, d: durBeat * beat, f: scale[(bar * 2 + k * 3) % scale.length] });
    }
  }
  let ph = 0;
  for (const n of notes) {
    const i0 = Math.floor(n.t * SR), i1 = Math.min(len, Math.floor((n.t + n.d) * SR));
    const f0 = n.f * Math.pow(2, 30 / 1200);        // 故意唱高 30 音分：修音單元需要「有東西可修」
    for (let i = i0; i < i1; i++) {
      const tt = (i - i0) / SR;
      const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.4 * tt) * Math.min(1, tt * 3);
      const env = Math.min(1, tt / 0.03) * Math.min(1, (i1 - i) / (SR * 0.08));
      ph += 2 * Math.PI * f0 * vib / SR;
      d[i] += 0.22 * env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph));
    }
    // 換氣：短促的雜訊
    const g0 = Math.max(0, i0 - Math.floor(SR * 0.06)), g1 = i0;
    for (let i = g0; i < g1; i++) d[i] += 0.02 * (Math.random() * 2 - 1) * ((i - g0) / (g1 - g0));
  }
  return b;
}

function midiTrack(index, name, color, inst, notes, vol) {
  const t = newTrack(index, 'midi');
  t.name = name; t.color = color; t.instrument = inst; t.volumeDb = vol ?? 0;
  const clip = newMidiClip(0, 32, notes);
  clip.name = name;
  t.clips.push(clip);
  return t;
}

const chordNotes = (root, ivs, oct = 4) => ivs.map(iv => 12 * oct + ((root + iv) % 12));

export function seedDemo() {
  const p = store.project;
  p.name = '示範：夜裡的車窗';
  p.bpm = 92; p.sigNum = 4; p.sigDen = 4;
  p.tracks.length = 0;
  store.buffers.clear(); store.bufferMeta.clear();

  // 主唱（音訊）
  const vocal = newTrack(0, 'audio');
  vocal.name = '主唱'; vocal.color = '#f78fc3';
  const buf = makeVocalBuffer(p.bpm);
  const bid = uid('buf');
  store.buffers.set(bid, buf);
  store.bufferMeta.set(bid, { name: '主唱 take1.wav', peaks: computePeaks(buf) });
  vocal.clips.push({ id: uid('clip'), bufferId: bid, name: '主唱 take1', start: 0, duration: buf.duration, offset: 0, gainDb: 0, fadeIn: 0, fadeOut: 0.8 });
  const tune = newFx('tune'); tune.params.key = 0; tune.params.scale = 1; tune.params.retune = 45;
  const eq = newFx('eq'); eq.params.bands[0].on = true; eq.params.bands[0].freq = 90;
  const comp = newFx('comp'); comp.params.threshold = -20; comp.params.ratio = 3; comp.params.makeup = 3;
  vocal.inserts.push(tune, eq, comp);
  vocal.sends = [-14, -60];
  p.tracks.push(vocal);

  // 鋼琴（MIDI）
  const prog = [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']];
  const pianoNotes = [];
  prog.forEach(([root, q], i) => {
    const iv = q === 'min' ? [0, 3, 7] : [0, 4, 7];
    for (let r = 0; r < 2; r++) {
      const t0 = (i * 8 + r * 4);
      for (const n of chordNotes(root, iv, 4)) pianoNotes.push({ p: n, t: t0, d: 3.5, v: 88 });
      pianoNotes.push({ p: 12 * 3 + root, t: t0, d: 1.5, v: 74 });
    }
  });
  p.tracks.push(midiTrack(1, '鋼琴', '#4f9dff', 'piano', pianoNotes, -6));

  // 貝斯
  const bassNotes = [];
  prog.forEach(([root], i) => {
    for (let k = 0; k < 8; k++) bassNotes.push({ p: 36 + root, t: i * 8 + k, d: 0.8, v: 96 });
  });
  p.tracks.push(midiTrack(2, '貝斯', '#9bd35a', 'fbass', bassNotes, -5));

  // 鼓
  const drumNotes = [];
  for (let bar = 0; bar < 8; bar++) for (let k = 0; k < 4; k++) {
    drumNotes.push({ p: k % 2 === 0 ? 36 : 38, t: bar * 4 + k, d: 0.25, v: k % 2 === 0 ? 110 : 96 });
    drumNotes.push({ p: 42, t: bar * 4 + k + 0.5, d: 0.25, v: 80 });
  }
  p.tracks.push(midiTrack(3, '鼓組', '#ff8a5c', 'drums', drumNotes, -6));

  // 和弦軌
  p.chords = prog.map(([root, q], i) => ({ t: i * 8, d: 8, root, q }));
  p.chordKey = { key: 0, minor: false };
  p.chordView = 1;
  p.showChords = true;

  // 母帶：開著，目標串流平台
  p.mastering.on = true;
  p.masterDb = 0;
  p.masterInserts = [];

  store.selection.trackId = vocal.id;
  store.selection.clipIds = new Set();
  store.dirty = false;
  store.changed('structure');
}
