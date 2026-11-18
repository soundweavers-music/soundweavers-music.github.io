// MIDI 輸入：Web MIDI 實體鍵盤 + 電腦鍵盤彈奏（Caps Lock 模式）
// 彈奏的聲音送到「選取的 MIDI 軌」（或第一條待命的 MIDI 軌）。
// 錄音時把音符寫進新的 MIDI 片段。
import { store, spb, newMidiClip } from './state.js';
import { engine } from './engine.js';
import { toast } from './util.js';

const state = {
  access: null,
  inputs: [],
  typing: false,          // 電腦鍵盤彈奏模式
  octave: 4,              // 電腦鍵盤的 C 對應 C4
  velocity: 100,
  held: new Map(),        // midi -> { trackId, startPos }
  sustain: false,
  sustained: new Set(),
  recording: null,        // { trackId, clip, origin }
  lastActivity: 0,
};

export const midiState = state;

export function targetTrack() {
  const p = store.project;
  const armed = p.tracks.find(t => t.kind === 'midi' && t.arm);
  if (armed) return armed;
  const sel = store.track(store.selection.trackId);
  return sel && sel.kind === 'midi' ? sel : null;
}

// ---------------- 音符進出 ----------------
export function noteOn(midi, vel = state.velocity) {
  const t = targetTrack();
  if (!t) return;
  state.lastActivity = performance.now();
  if (state.held.has(midi)) noteOff(midi, true);
  engine.noteOn(t.id, midi, vel);
  state.held.set(midi, { trackId: t.id, vel, startPos: engine.currentTime() });
  store.emit('midi-activity', { midi, on: true });
}

export function noteOff(midi, force = false) {
  const h = state.held.get(midi);
  if (!h) return;
  if (state.sustain && !force) { state.sustained.add(midi); return; }
  engine.noteOff(h.trackId, midi);
  state.held.delete(midi);
  if (state.recording && state.recording.trackId === h.trackId) commitNote(midi, h);
  store.emit('midi-activity', { midi, on: false });
}

function setSustain(on) {
  state.sustain = on;
  if (!on) { for (const m of state.sustained) noteOff(m, true); state.sustained.clear(); }
}

function commitNote(midi, h) {
  const r = state.recording;
  const b = spb();
  const endPos = engine.currentTime();
  const t = h.startPos / b - r.clip.startBeat;
  const d = Math.max(1 / 32, (endPos - h.startPos) / b);
  if (t + d <= 0) return;
  r.clip.notes.push({ p: midi, t: Math.max(0, t), d: t < 0 ? d + t : d, v: h.vel });
  const end = t + d;
  if (end > r.clip.lengthBeats) r.clip.lengthBeats = Math.ceil(end / store.project.sigNum) * store.project.sigNum;
  store.changed('structure');
}

// ---------------- 錄 MIDI ----------------
// recorder.js 在按下錄音時呼叫；回傳 true 表示有 MIDI 軌在待命
export function startMidiRecording(fromSec) {
  const t = store.project.tracks.find(x => x.kind === 'midi' && x.arm);
  if (!t) return false;
  store.checkpoint();
  const bar = store.project.sigNum;
  const startBeat = Math.floor(fromSec / spb() / bar + 1e-6) * bar;
  const clip = newMidiClip(startBeat, bar);
  clip.name = '錄音';
  t.clips.push(clip);
  state.recording = { trackId: t.id, clip };
  store.changed('structure');
  return true;
}

export function stopMidiRecording() {
  const r = state.recording;
  if (!r) return;
  for (const m of [...state.held.keys()]) noteOff(m, true);
  state.recording = null;
  const t = store.track(r.trackId);
  if (t && !r.clip.notes.length) {
    t.clips = t.clips.filter(c => c !== r.clip);
    toast('MIDI 錄音期間沒有彈任何音，已捨棄', 'warn');
  } else if (t) {
    // 去掉片段開頭多餘的空白小節不做，維持與小節線對齊
    toast(`已錄下 ${r.clip.notes.length} 個音符`);
  }
  store.changed('structure');
}

export const isMidiRecording = () => !!state.recording;

// ---------------- Web MIDI ----------------
export async function initWebMidi() {
  if (!navigator.requestMIDIAccess) return { supported: false };
  try {
    state.access = await navigator.requestMIDIAccess({ sysex: false });
  } catch (e) {
    return { supported: true, denied: true, error: e.message };
  }
  const bind = () => {
    state.inputs = [...state.access.inputs.values()];
    for (const inp of state.inputs) inp.onmidimessage = onMessage;
    store.emit('midi-devices', { inputs: state.inputs.map(i => i.name) });
  };
  state.access.onstatechange = bind;
  bind();
  return { supported: true, inputs: state.inputs.map(i => i.name) };
}

function onMessage(ev) {
  const [st, a, b] = ev.data;
  const type = st & 0xf0;
  if (type === 0x90 && b > 0) noteOn(a, b);
  else if (type === 0x80 || (type === 0x90 && b === 0)) noteOff(a);
  else if (type === 0xb0 && a === 64) setSustain(b >= 64);
  else if (type === 0xb0 && (a === 123 || a === 120)) allOff();
}

export function allOff() {
  for (const m of [...state.held.keys()]) noteOff(m, true);
  state.sustained.clear();
  engine.allNotesOff();
}

// ---------------- 電腦鍵盤彈奏 ----------------
// 白鍵 A S D F G H J K L ;，黑鍵 W E   T Y U   O P；Z/X 換八度，C/V 調力度
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };

export function setTyping(on) {
  state.typing = on;
  if (!on) allOff();
  store.emit('typing', { on });
}

export function handleTypingKey(e, down) {
  if (!state.typing || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (down && k === 'z') { state.octave = Math.max(0, state.octave - 1); allOff(); toast(`鍵盤八度：C${state.octave}`); return true; }
  if (down && k === 'x') { state.octave = Math.min(8, state.octave + 1); allOff(); toast(`鍵盤八度：C${state.octave}`); return true; }
  if (down && k === 'c') { state.velocity = Math.max(10, state.velocity - 15); toast(`力度 ${state.velocity}`); return true; }
  if (down && k === 'v') { state.velocity = Math.min(127, state.velocity + 15); toast(`力度 ${state.velocity}`); return true; }
  if (!(k in KEYMAP)) return false;
  if (e.repeat) return true;
  const midi = (state.octave + 1) * 12 + KEYMAP[k];
  if (down) {
    if (!targetTrack()) { toast('先選一條 MIDI 軌才能彈', 'warn'); return true; }
    noteOn(midi);
  } else noteOff(midi);
  return true;
}

window.addEventListener('blur', () => { if (state.held.size) allOff(); });
