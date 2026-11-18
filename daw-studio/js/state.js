// 專案資料模型 + 事件 + 復原堆疊
// 音訊資料（AudioBuffer）不放進 JSON，另存在 buffers Map，以 bufferId 參照。
import { uid, TRACK_COLORS } from './util.js';
import { defaultMastering } from './mastering.js';

export const MAX_TRACKS = 32;
export const DEFAULT_TRACKS = 16;

// 片段時間單位：
//  - 音訊片段：start / duration / offset 以「秒」為單位（音訊本身是秒）
//  - MIDI 片段：startBeat / lengthBeats，notes[] 內 { p:音高, t:起點拍, d:長度拍, v:力度 }（相對於片段起點）
//    MIDI 用拍數儲存，改 BPM 時音符會跟著小節走；engine 會換算成秒。
export function newTrack(index, kind = 'audio') {
  const t = {
    id: uid('trk'),
    kind,
    name: `${kind === 'audio' ? '音訊' : 'MIDI'} ${index + 1}`,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    arm: false,
    monitor: false,
    inserts: [],             // 插入效果器 [{ id, type, on, params }]
    sends: [-60, -60],       // 送到 Bus A / Bus B 的量（dB，-60 = 關），post-fader
    auto: {},                // 自動化：{ volume: { on, points:[{t:拍, v}] }, pan: …, send0: …, send1: … }
    clips: [],
  };
  if (kind === 'midi') t.instrument = 'piano';
  return t;
}

// 兩條 Send 匯流排：預設 A = 殘響、B = 延遲（100% 濕）
export function defaultBuses() {
  return [
    { name: 'Bus A 殘響', volumeDb: 0, mute: false, inserts: [{ id: 'busA_verb', type: 'reverb', on: true, params: { size: 2.4, predelay: 20, damp: 6500, mix: 100 } }] },
    { name: 'Bus B 延遲', volumeDb: 0, mute: false, inserts: [{ id: 'busB_delay', type: 'delay', on: true, params: { time: 0.75, feedback: 35, tone: 4500, pingpong: 1, mix: 100 } }] },
  ];
}

// 前 12 軌音訊、後 4 軌 MIDI（預先選好常用音色）
const DEFAULT_MIDI = [['piano', '鋼琴'], ['strings', '弦樂'], ['bass', '貝斯'], ['drums', '鼓組']];

export function newProject() {
  const tracks = [];
  for (let i = 0; i < DEFAULT_TRACKS - DEFAULT_MIDI.length; i++) tracks.push(newTrack(i));
  DEFAULT_MIDI.forEach(([inst, name], k) => {
    const t = newTrack(tracks.length, 'midi');
    t.instrument = inst; t.name = name;
    tracks.push(t);
  });
  return {
    version: 4,
    buses: defaultBuses(),
    masterInserts: [],
    mastering: defaultMastering(),
    name: '未命名專案',
    bpm: 120,
    sigNum: 4,
    sigDen: 4,
    masterDb: 0,
    loop: { on: false, start: 0, end: 8 },
    metronome: false,
    countIn: false,
    snap: true,
    tracks,
  };
}

class Store extends EventTarget {
  constructor() {
    super();
    this.project = newProject();
    this.buffers = new Map();      // bufferId -> AudioBuffer
    this.bufferMeta = new Map();   // bufferId -> { name, peaks }
    this.selection = { trackId: null, clipIds: new Set() };
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, e => fn(e.detail)); }

  // 修改前呼叫：把目前狀態推進復原堆疊
  checkpoint() {
    this.undoStack.push(JSON.stringify(this.project));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop());
    this.changed('structure');
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    this.changed('structure');
    return true;
  }

  // kind: 'structure'（軌道/片段增減）| 'mix'（音量等參數）| 'transport'
  changed(kind = 'structure', detail = {}) {
    this.dirty = true;
    this.emit('change', { kind, ...detail });
  }

  replaceProject(project, buffers, meta) {
    this.project = project;
    this.buffers = buffers;
    this.bufferMeta = meta;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.selection = { trackId: project.tracks[0]?.id ?? null, clipIds: new Set() };
    this.dirty = false;
    this.changed('structure');
  }

  track(id) { return this.project.tracks.find(t => t.id === id); }

  findClip(clipId) {
    for (const t of this.project.tracks) {
      const c = t.clips.find(c => c.id === clipId);
      if (c) return { track: t, clip: c };
    }
    return null;
  }

  addTrack(kind = 'audio') {
    if (this.project.tracks.length >= MAX_TRACKS) return null;
    this.checkpoint();
    const t = newTrack(this.project.tracks.length, kind);
    this.project.tracks.push(t);
    this.changed('structure');
    return t;
  }

  removeTrack(id) {
    const i = this.project.tracks.findIndex(t => t.id === id);
    if (i < 0) return;
    this.checkpoint();
    this.project.tracks.splice(i, 1);
    if (this.selection.trackId === id) this.selection.trackId = this.project.tracks[0]?.id ?? null;
    this.changed('structure');
  }

  // 片段結尾（秒）
  projectEnd() {
    let end = 0;
    for (const t of this.project.tracks) for (const c of t.clips) end = Math.max(end, clipStart(c) + clipDur(c));
    return end;
  }

  // 刪掉沒有任何片段參照的音訊（存檔前清理）
  usedBufferIds() {
    const s = new Set();
    for (const t of this.project.tracks) for (const c of t.clips) if (c.bufferId) s.add(c.bufferId);
    return s;
  }
}

export const store = new Store();

// 正在錄 MIDI 的片段 id（執行期狀態，不存進專案）
export const recordingClips = new Set();

// ---- 拍 ↔ 秒（以目前 BPM 換算）----
export const spb = () => 60 / store.project.bpm;
export const isMidiClip = c => Array.isArray(c.notes);
// 統一以秒取得片段起點/長度，讓編排視窗不必分兩套邏輯
export const clipStart = c => (isMidiClip(c) ? c.startBeat * spb() : c.start);
export const clipDur = c => (isMidiClip(c) ? c.lengthBeats * spb() : c.duration);
export function setClipStart(c, sec) {
  if (isMidiClip(c)) c.startBeat = Math.max(0, sec / spb()); else c.start = Math.max(0, sec);
}

export function newMidiClip(startBeat, lengthBeats, notes = []) {
  return { id: uid('clip'), name: 'MIDI 片段', startBeat, lengthBeats, notes };
}

// 舊版（version 1）專案沒有 MIDI 欄位，補齊即可
export function migrateProject(p) {
  for (const t of p.tracks) {
    if (t.kind === 'midi' && !t.instrument) t.instrument = 'piano';
    if (!Array.isArray(t.inserts)) t.inserts = [];
    if (!Array.isArray(t.sends)) t.sends = [-60, -60];
  }
  if (!Array.isArray(p.buses)) p.buses = defaultBuses();
  if (!Array.isArray(p.masterInserts)) p.masterInserts = [];
  if (!p.mastering) p.mastering = defaultMastering();
  for (const t of p.tracks) if (!t.auto) t.auto = {};
  p.version = 4;
  return p;
}
