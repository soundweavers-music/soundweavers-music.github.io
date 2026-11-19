// MIDI 輸入：Web MIDI 實體鍵盤 + 電腦鍵盤彈奏（Caps Lock 模式）
// 彈奏的聲音送到「選取的 MIDI 軌」（或第一條待命的 MIDI 軌）。
// 錄音時把音符寫進新的 MIDI 片段。
import { store, spb, newMidiClip, recordingClips } from './state.js';
import { engine } from './engine.js';
import { toast } from './util.js';

const state = {
  access: null,
  inputs: [],
  typing: false,          // 電腦鍵盤彈奏模式
  octave: 4,              // 電腦鍵盤的 C 對應 C4
  velocity: 100,
  held: new Map(),        // 按下的鍵 -> { trackId, midi(移調後), vel, startPos }
  transpose: Number(localStorage.getItem('daw.midiTranspose') || 0),   // 輸入移調（半音）
  sustain: false,
  sustained: new Set(),
  recording: null,        // { trackId, clip, origin }
  lastActivity: 0,
};

export const midiState = state;

// 自動伴奏（或其他功能）可以攔截輸入：hook.note(on, midi, vel) 回傳 true = 這個音被吃掉、不發聲
// hook.message(ev) 回傳 true = 這個 MIDI 訊息已處理（MIDI Learn 對應的按鈕）
const hooks = new Set();
export function addInputHook(h) { hooks.add(h); return () => hooks.delete(h); }
const hookNote = (on, key, vel) => { let eat = false; for (const h of hooks) if (h.note && h.note(on, key, vel)) eat = true; return eat; };

// 允許的 MIDI 輸入（空 = 全部）；存在 localStorage，設定視窗可逐台開關
function loadEnabled() {
  try { const v = JSON.parse(localStorage.getItem('daw.midiInputs') || 'null'); return Array.isArray(v) ? new Set(v) : null; } catch (_) { return null; }
}
state.enabled = loadEnabled();
state.midiOn = localStorage.getItem('daw.midiOn') !== '0';

function applyInputHandlers() {
  for (const inp of state.inputs || []) {
    const ok = state.midiOn && (!state.enabled || state.enabled.has(inp.id));
    inp.onmidimessage = ok ? handleMidiMessage : null;
  }
}

export function setMidiEnabled(on) {
  state.midiOn = !!on;
  localStorage.setItem('daw.midiOn', on ? '1' : '0');
  applyInputHandlers();
}

export function setEnabledInputs(ids) {
  state.enabled = Array.isArray(ids) ? new Set(ids) : null;
  localStorage.setItem('daw.midiInputs', JSON.stringify(ids ?? null));
  applyInputHandlers();
}

export function midiInputs() { return (state.inputs || []).map(i => ({ id: i.id, name: i.name })); }

// 沒有待命／選取的 MIDI 軌時，可以由其他模組（自動伴奏）提供預設的旋律軌
let fallbackTrack = null;
export function setFallbackTrack(fn) { fallbackTrack = fn; }
export function targetTrack() {
  const p = store.project;
  const armed = p.tracks.find(t => t.kind === 'midi' && t.arm);
  if (armed) return armed;
  const sel = store.track(store.selection.trackId);
  if (sel && sel.kind === 'midi') return sel;
  return fallbackTrack ? fallbackTrack() : null;
}

// ---------------- 音符進出 ----------------
// 輸入移調：鍵盤按下的音 + transpose（半音），寫進片段與發聲的都是移調後的音
// key = 實際按下的鍵；held 以 key 為索引，移調途中改值也能正確放開
export function noteOn(key, vel = state.velocity) {
  if (hookNote(true, key, vel)) { state.eaten = state.eaten || new Set(); state.eaten.add(key); store.emit('midi-activity', { midi: key, on: true, eaten: true }); return; }
  const t = targetTrack();
  if (!t) return;
  state.lastActivity = performance.now();
  // 同一個鍵再按一次（例如踏板踩住時重彈）：先把舊的音收掉
  if (state.held.has(key)) { state.sustained.delete(key); releaseKey(key); }
  const midi = Math.max(0, Math.min(127, key + state.transpose));
  engine.noteOn(t.id, midi, vel);
  state.held.set(key, { trackId: t.id, midi, vel, startPos: engine.currentTime() });
  store.emit('midi-activity', { midi, on: true });
}

export function noteOff(key, force = false) {
  if (state.eaten?.has(key)) { state.eaten.delete(key); hookNote(false, key, 0); store.emit('midi-activity', { midi: key, on: false, eaten: true }); return; }
  const h = state.held.get(key);
  if (!h) return;
  // 錄音：音符長度 = 手實際按住的長度（跟專業 DAW 一樣），踏板另外記成 CC64 事件
  if (!h.written && state.recording && state.recording.trackId === h.trackId) { commitNote(h); h.written = true; }
  // 踏板踩住：手放開了但聲音要繼續，等踏板放開才真正停止發聲
  if (state.sustain && !force) { state.sustained.add(key); return; }
  state.sustained.delete(key);
  releaseKey(key);
}

function releaseKey(key) {
  const h = state.held.get(key);
  if (!h) return;
  engine.noteOff(h.trackId, h.midi);
  state.held.delete(key);
  // 停止錄音時還按著的鍵：在這裡補寫
  if (!h.written && state.recording && state.recording.trackId === h.trackId) commitNote(h);
  store.emit('midi-activity', { midi: h.midi, on: false });
}

function setSustain(on) {
  if (state.sustain === on) return;     // 踏板會連續送很多個 CC64（半踩），狀態沒變就不處理
  state.sustain = on;
  if (state.recording) recordPedal(on);
  if (!on) {
    const list = [...state.sustained];
    state.sustained.clear();
    for (const k of list) releaseKey(k);
  }
  store.emit('midi-pedal', { on });
}

function recordPedal(on) {
  const r = state.recording;
  const t = engine.currentTime() / spb() - r.clip.startBeat;
  if (!r.clip.pedal) r.clip.pedal = [];
  r.clip.pedal.push({ t: Math.max(0, t), on });
  store.dirty = true;
  scheduleRecRedraw();
}

// 寫入錄音中的片段。
// 注意：這裡「不能」觸發 store.changed('structure')——那會讓 engine 重新排程整個播放，
// 踏板放開時一次結束十幾個音就會重排十幾次，聽起來像一堆亂跳的音符。
// 改送 'midi-rec'，只讓畫面重畫；錄音中的片段 engine 也不會播放（避免重複發聲）。
function commitNote(h) {
  const r = state.recording;
  const b = spb();
  const endPos = engine.currentTime();
  const t = h.startPos / b - r.clip.startBeat;
  const d = Math.max(1 / 32, (endPos - h.startPos) / b);
  if (t + d <= 0) return;
  r.clip.notes.push({ p: h.midi, t: Math.max(0, t), d: t < 0 ? d + t : d, v: h.vel });
  const end = t + d;
  if (end > r.clip.lengthBeats) r.clip.lengthBeats = Math.ceil(end / store.project.sigNum) * store.project.sigNum;
  store.dirty = true;
  scheduleRecRedraw();
}

let recRedraw = 0;
function scheduleRecRedraw() {
  if (recRedraw) return;
  recRedraw = requestAnimationFrame(() => { recRedraw = 0; store.emit('midi-rec', { clipId: state.recording?.clip.id }); });
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
  recordingClips.add(clip.id);    // engine 不排程這個片段（不放進專案資料，undo／存檔不會帶到）
  t.clips.push(clip);
  state.recording = { trackId: t.id, clip };
  if (state.sustain) clip.pedal = [{ t: Math.max(0, fromSec / spb() - startBeat), on: true }];
  store.changed('structure');
  return true;
}

export function stopMidiRecording() {
  const r = state.recording;
  if (!r) return;
  // 停止時：還按著的鍵以現在位置結束；踏板還踩著就補一個「放開」，播放時才不會一路延音到底
  for (const [k, h] of state.held) if (!h.written) { commitNote(h); h.written = true; }
  if (state.sustain) recordPedal(false);
  state.recording = null;
  recordingClips.delete(r.clip.id);
  // 停止錄音不切斷正在延音的聲音（使用者可能還踩著踏板）
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
    applyInputHandlers();
    store.emit('midi-devices', { inputs: state.inputs.map(i => i.name) });
  };
  state.access.onstatechange = bind;
  bind();
  return { supported: true, inputs: state.inputs.map(i => i.name) };
}

export function handleMidiMessage(ev) {
  for (const h of hooks) if (h.message && h.message(ev.data)) return;
  const [st, a, b] = ev.data;
  const type = st & 0xf0;
  if (type === 0x90 && b > 0) noteOn(a, b);
  else if (type === 0x80 || (type === 0x90 && b === 0)) noteOff(a);
  else if (type === 0xb0 && a === 64) setSustain(b >= 64);
  else if (type === 0xb0 && (a === 123 || a === 120)) allOff();
}

export function allOff() {
  state.sustained.clear();
  for (const k of [...state.held.keys()]) releaseKey(k);
  state.sustain = false;
  engine.allNotesOff();
}

// 輸入移調：-24 ~ +24 半音。改值時先放掉所有音，避免同一個鍵放開時找不到對應的音
export function setTranspose(n) {
  n = Math.max(-24, Math.min(24, Math.round(n)));
  if (n === state.transpose) return;
  allOff();
  state.transpose = n;
  localStorage.setItem('daw.midiTranspose', String(n));
  store.emit('midi-transpose', { value: n });
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
    if (!targetTrack() && !hooks.size) { toast('先選一條 MIDI 軌才能彈', 'warn'); return true; }
    noteOn(midi);
  } else noteOff(midi);
  return true;
}

window.addEventListener('blur', () => { if (state.held.size) allOff(); });
