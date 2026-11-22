// 音訊引擎：每軌一條 channel strip（gain → pan → meter → master），
// 播放時依片段排程 AudioBufferSourceNode。離線輸出用同一套 buildStrip。
import { store, isMidiClip, spb, recordingClips } from './state.js';
import { dbToGain } from './util.js';
import { startVoice, scheduleNote, releaseTail } from './synth.js';
import { buildChain, chainShape, ensureFxWorklets, fxLatency, WORKLET_FX } from './effects.js';
import { ensureWorklet, buildMastering, defaultMastering } from './mastering.js';
import { isActive, schedule as autoSchedule, AUTO_PARAMS, valueAt as valueAtBeat } from './automation.js';

const LOOKAHEAD = 0.12;   // 節拍器排程預看秒數
const MIDI_AHEAD = 0.25;  // MIDI 音符排程預看秒數（不一次排完，長曲子也不會建出上萬個節點）

// 踏板事件 [{t,on}] → 踩下的區段 [[開始拍, 結束拍], …]（片段內相對拍數）
export function pedalSpans(clip) {
  const ev = (clip.pedal || []).slice().sort((a, z) => a.t - z.t);
  const spans = [];
  let down = null;
  for (const e of ev) {
    if (e.on && down === null) down = e.t;
    else if (!e.on && down !== null) { spans.push([down, e.t]); down = null; }
  }
  if (down !== null) spans.push([down, clip.lengthBeats]);
  return spans;
}

// 套用踏板：音符在踏板踩著時放開 → 一直響到踏板放開；同一個音在延音中重彈 → 前一個在重彈時結束
export function sustainedEnd(clip, notes, spans) {
  if (!spans.length) return notes.map(n => n.t + n.d);
  const end = notes.map(n => {
    const off = n.t + n.d;
    const sp = spans.find(([a, z]) => off >= a && off < z);
    return sp ? sp[1] : off;
  });
  // 同音重彈：不能讓兩個一樣的音重疊（鋼琴的同一根弦會被重新擊打）
  const byPitch = new Map();
  notes.forEach((n, i) => { if (!byPitch.has(n.p)) byPitch.set(n.p, []); byPitch.get(n.p).push(i); });
  for (const idx of byPitch.values()) {
    idx.sort((a, z) => notes[a].t - notes[z].t);
    for (let k = 0; k + 1 < idx.length; k++) {
      const i = idx[k], j = idx[k + 1];
      if (end[i] > notes[j].t) end[i] = Math.max(notes[i].t + notes[i].d, notes[j].t);
    }
  }
  return end;
}

// 把 MIDI 片段攤平成「專案秒數」的音符：{ s, e, p, v }，已裁掉片段結尾之後的部分；踏板延音已套用
export function midiEvents(clip, transpose = 0) {
  const b = spb(), c0 = clip.startBeat, len = clip.lengthBeats;
  // 靜音的音符（note.m）不發聲，但留在專案裡
  const notes = clip.notes.filter(n => n.t < len && n.t >= 0 && !n.m);
  const ends = sustainedEnd(clip, notes, pedalSpans(clip));
  const out = [];
  notes.forEach((n, i) => {
    const e = Math.min(ends[i], len);
    out.push({ s: (c0 + n.t) * b, e: (c0 + e) * b, p: n.p + transpose, v: n.v });
  });
  return out.sort((a, z) => a.s - z.s);
}

// 軌道上啟用中、有固定延遲的效果器（人聲修音、Harmony 各 32 ms）的延遲總和
export function trackLatency(t) {
  let L = 0;
  for (const d of t.inserts || []) L += fxLatency(d);
  return L;
}

function anySolo(project) { return project.tracks.some(t => t.solo); }
function audible(track, project) {
  if (track.mute) return false;
  return anySolo(project) ? track.solo : true;
}

function makeMeter(ctx, node, size = 1024) {
  const split = ctx.createChannelSplitter(2);
  const aL = ctx.createAnalyser(), aR = ctx.createAnalyser();
  aL.fftSize = aR.fftSize = size;
  node.connect(split);
  split.connect(aL, 0); split.connect(aR, 1);
  return { aL, aR, buf: new Float32Array(size), hold: [0, 0], peakDb: -Infinity };
}

// 建立一條 strip：input → [插入效果器] → fader → pan → dest（＋ post-fader send 到各 bus）
// ctx 可以是 AudioContext 或 OfflineAudioContext
function buildStrip(ctx, dest, withMeter, track, busInputs = [], bpm = 120) {
  const input = ctx.createGain();
  const fader = ctx.createGain();
  const pan = ctx.createStereoPanner();
  const mute = ctx.createGain();
  const strip = { input, fader, pan, mute, meter: null, chain: null, shape: '', sends: [] };
  strip.chain = buildChain(ctx, track?.inserts, bpm);
  strip.shape = chainShape(track?.inserts);
  input.connect(strip.chain.input);
  strip.chain.output.connect(fader).connect(pan).connect(mute);
  if (withMeter) strip.meter = makeMeter(ctx, mute);
  mute.connect(dest);
  busInputs.forEach((bin, i) => {
    const g = ctx.createGain();
    g.gain.value = dbToGain(track?.sends?.[i] ?? -60);
    mute.connect(g).connect(bin);
    strip.sends.push(g);
  });
  return strip;
}

// 插入效果器的形狀（數量/順序/開關）變了：只重建效果器鏈，不動 fader/pan/send
function rebuildChain(ctx, strip, list, bpm) {
  try { strip.input.disconnect(); } catch (_) { /* noop */ }
  strip.chain.dispose();
  strip.chain = buildChain(ctx, list, bpm);
  strip.shape = chainShape(list);
  strip.input.connect(strip.chain.input);
  strip.chain.output.connect(strip.fader);
}

// 參數變了：直接 set，不重建（拖旋鈕時不會斷音）
function updateChainParams(strip, list, bpm) {
  for (const fx of strip.chain.fx) {
    const d = list.find(x => x.id === fx.desc.id);
    if (d) fx.set(d.params, bpm);
  }
}

// mute/solo 用另一個 gain（strip.mute），自動化寫在 fader 上，兩者互不干擾
// playing = true 時，有自動化的參數由 scheduleAutomation 控制，這裡不覆寫
function applyStrip(strip, track, project, t = 0, playing = false) {
  strip.mute.gain.setTargetAtTime(audible(track, project) ? 1 : 0, t, 0.01);
  if (!(playing && isActive(track, 'volume'))) strip.fader.gain.setTargetAtTime(dbToGain(track.volumeDb), t, 0.01);
  if (!(playing && isActive(track, 'pan'))) strip.pan.pan.setTargetAtTime(track.pan, t, 0.01);
  strip.sends.forEach((s, i) => {
    if (!(playing && isActive(track, 'send' + i))) s.gain.setTargetAtTime(dbToGain(track.sends?.[i] ?? -60), t, 0.01);
  });
}

// 把軌道的自動化曲線排進這條 strip 的 AudioParam
function scheduleAutomation(strip, track, when, fromSec, untilSec) {
  const map = { volume: strip.fader.gain, pan: strip.pan.pan, send0: strip.sends[0]?.gain, send1: strip.sends[1]?.gain };
  for (const [k, param] of Object.entries(map)) {
    if (!param || !isActive(track, k)) continue;
    autoSchedule(param, track.auto[k].points, AUTO_PARAMS[k], when, fromSec, untilSec);
  }
}

// 把一個片段排進 ctx：when = ctx 時間軸上「專案 0 秒」對應的時刻；from = 從專案第幾秒開始播
function scheduleClip(ctx, clip, buffer, dest, when, from, until = Infinity) {
  if (isMidiClip(clip)) return null;   // MIDI 由排程器另外處理
  const clipEnd = Math.min(clip.start + clip.duration, until);
  if (clipEnd <= from || !buffer) return null;
  const startAt = Math.max(clip.start, from);
  const offset = clip.offset + (startAt - clip.start);
  const dur = clipEnd - startAt;
  if (dur <= 0 || offset >= buffer.duration) return null;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const env = ctx.createGain();
  src.connect(env).connect(dest);

  const base = dbToGain(clip.gainDb || 0);
  const t0 = when + (startAt - from);
  const p = env.gain;
  const fi = clip.fadeIn || 0, fo = clip.fadeOut || 0;
  // 淡入淡出：以片段內相對時間計算
  const rel0 = startAt - clip.start;
  const lvl = r => {
    let k = 1;
    if (fi > 0 && r < fi) k = Math.min(k, r / fi);
    if (fo > 0 && r > clip.duration - fo) k = Math.min(k, (clip.duration - r) / fo);
    return base * Math.max(0, k);
  };
  p.setValueAtTime(lvl(rel0), t0);
  if (fi > 0 && rel0 < fi) p.linearRampToValueAtTime(base, t0 + (fi - rel0));
  if (fo > 0) {
    const foStart = clip.duration - fo;
    if (rel0 < foStart) p.setValueAtTime(base, t0 + (foStart - rel0));
    p.linearRampToValueAtTime(0, t0 + (clip.duration - rel0));
  }
  src.start(t0, offset, dur);
  src._endCtx = t0 + dur;
  return src;
}

class Engine {
  constructor() {
    this.ctx = null;
    this.strips = new Map();   // trackId -> strip
    this.sources = [];
    this.playing = false;
    this.startCtxTime = 0;     // ctx 時間
    this.startPos = 0;         // 專案秒數
    this.position = 0;
    this.metroNext = 0;
    this.metroTimer = null;
    this.segments = [];        // MIDI 排程區段：{ ctxStart, posStart, posEnd, cursor, events }
    this.voices = new Set();   // 正在發聲的合成器 voice（停止時要全部消音）
    this.live = new Map();     // 即時彈奏（鍵盤/試聽）的 voice：key -> voice
    this.transport = [];       // Harmony 用的「ctx 時刻 ↔ 專案秒數」對照
  }

  async ensure() {
    if (!this.ctx) {
      // 延遲模式（設定選單）在建立時決定，之後要改得重新載入頁面
      const hint = localStorage.getItem('daw.latencyHint') || 'interactive';
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: hint });
      const outId = localStorage.getItem('daw.outputId');
      if (outId && this.ctx.setSinkId) this.ctx.setSinkId(outId).catch(() => {});
      const c = this.ctx;
      // master：sum → [master 插入效果器] → post → [母帶鏈] → master fader → 輸出
      this.masterSum = c.createGain();
      this.masterPost = c.createGain();
      this.master = c.createGain();
      this.masterChain = buildChain(c, store.project.masterInserts, store.project.bpm);
      this.masterShape = chainShape(store.project.masterInserts);
      this.masterSum.connect(this.masterChain.input);
      this.masterChain.output.connect(this.masterPost);
      this.masterPost.connect(this.master);   // 母帶 worklet 載入前先直通
      this.master.connect(c.destination);
      this.masterMeter = makeMeter(c, this.master, 2048);
      this.mastering = null;
      ensureWorklet(c).then(() => {
        this.mastering = buildMastering(c, store.project.mastering || defaultMastering());
        try { this.masterPost.disconnect(); } catch (_) { /* noop */ }
        this.masterPost.connect(this.mastering.input);
        this.mastering.output.connect(this.master);
        store.emit('mastering-ready', {});
      }).catch(e => console.warn('mastering worklet failed', e));
      this.buses = [];
      this.metroBus = c.createGain();
      this.metroBus.gain.value = 0.6;
      this.metroBus.connect(c.destination);   // 節拍器不進 master，不會被輸出
      this.syncStrips();
      // 升降音等需要 AudioWorklet 的效果器：載入完成後，把用到它們的鏈重建一次（載入前先直通）
      ensureFxWorklets(c).then(() => { this.fxReady = true; this.rebuildWorkletChains(); })
        .catch(e => console.warn('fx worklet failed', e));
      store.on('change', ({ kind }) => {
        if (kind === 'structure') this.syncStrips();
        else if (kind === 'mix') this.applyMix();
        else if (kind === 'fx') this.syncFx();
      });
      // 拖旋鈕時的即時更新：只 set 參數，不觸發 change（不重建介面）
      store.on('fx-live', () => this.syncFx());
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }

  // 切換輸出裝置（Chrome 支援 AudioContext.setSinkId）
  async setOutputDevice(id) {
    if (!this.ctx) return;
    if (typeof this.ctx.setSinkId !== 'function') throw new Error('這個瀏覽器不支援在播放中切換輸出裝置');
    await this.ctx.setSinkId(id || '');
  }

  // 目前的輸出裝置
  outputDeviceId() {
    try { return this.ctx?.sinkId || ''; } catch (_) { return ''; }
  }

  // bus：input → [效果器] → fader → master
  _syncBuses() {
    const c = this.ctx, p = store.project;
    const list = p.buses || [];
    // 數量變了就全部重建（只有開新專案/讀檔會發生）
    if (this.buses.length !== list.length) {
      for (const b of this.buses) { b.chain.dispose(); try { b.fader.disconnect(); } catch (_) { /* noop */ } }
      this.buses = list.map(bd => {
        const input = c.createGain(), fader = c.createGain();
        const chain = buildChain(c, bd.inserts, p.bpm);
        input.connect(chain.input); chain.output.connect(fader); fader.connect(this.masterSum);
        const meter = makeMeter(c, fader);
        return { input, fader, chain, shape: chainShape(bd.inserts), meter };
      });
      // bus 換了：所有 strip 的 send 要重接
      for (const s of this.strips.values()) { try { s.mute.disconnect(); } catch (_) { /* noop */ } }
      this.strips.clear();
    }
    list.forEach((bd, i) => {
      const b = this.buses[i];
      const shape = chainShape(bd.inserts);
      if (shape !== b.shape) {
        try { b.input.disconnect(); } catch (_) { /* noop */ }
        b.chain.dispose();
        b.chain = buildChain(c, bd.inserts, p.bpm); b.shape = shape;
        b.input.connect(b.chain.input); b.chain.output.connect(b.fader);
      } else updateChainParams(b, bd.inserts, p.bpm);
      b.fader.gain.setTargetAtTime(bd.mute ? 0 : dbToGain(bd.volumeDb), c.currentTime, 0.01);
    });
  }

  _syncMasterChain() {
    const p = store.project, shape = chainShape(p.masterInserts);
    if (shape !== this.masterShape) {
      try { this.masterSum.disconnect(); } catch (_) { /* noop */ }
      this.masterChain.dispose();
      this.masterChain = buildChain(this.ctx, p.masterInserts, p.bpm);
      this.masterShape = shape;
      this.masterSum.connect(this.masterChain.input);
      this.masterChain.output.connect(this.masterPost);
    } else updateChainParams({ chain: this.masterChain }, p.masterInserts || [], p.bpm);
    if (this.mastering && p.mastering) this.mastering.set(p.mastering);
  }

  syncStrips() {
    if (!this.ctx) return;
    const p = store.project;
    this._syncBuses();
    this._syncMasterChain();
    const ids = new Set(p.tracks.map(t => t.id));
    for (const [id, s] of this.strips) {
      if (!ids.has(id)) { s.mute.disconnect(); s.chain.dispose(); this.strips.delete(id); }
    }
    const busIn = this.buses.map(b => b.input);
    for (const t of p.tracks) {
      // 文字／字幕軌沒有聲音；影片軌有（影片檔裡的音軌會解出來放進混音）
      if (t.kind === 'text' || t.kind === 'sub') continue;
      const s = this.strips.get(t.id);
      if (!s) this.strips.set(t.id, buildStrip(this.ctx, this.masterSum, true, t, busIn, p.bpm));
      else if (chainShape(t.inserts) !== s.shape) rebuildChain(this.ctx, s, t.inserts, p.bpm);
      else updateChainParams(s, t.inserts || [], p.bpm);
    }
    this.applyMix();
    // 播放中改了片段：從目前位置重新排程
    if (this.playing) this.restartAt(this.currentTime());
  }

  // 效果器變動：重建形狀變了的鏈、其餘只更新參數；不重新排程播放
  syncFx() {
    if (!this.ctx) return;
    const p = store.project;
    this._syncBuses();
    this._syncMasterChain();
    for (const t of p.tracks) {
      const s = this.strips.get(t.id);
      if (!s) continue;
      if (chainShape(t.inserts) !== s.shape) rebuildChain(this.ctx, s, t.inserts, p.bpm);
      else updateChainParams(s, t.inserts || [], p.bpm);
    }
    this.applyMix();
  }

  // 播放中某軌某參數的目前值（給推桿/旋鈕跟著自動化動）
  autoValue(track, param) {
    if (!this.playing || !isActive(track, param)) return null;
    return valueAtBeat(track.auto[param].points, this.currentTime() / spb());
  }

  rebuildWorkletChains() {
    const p = store.project;
    const uses = list => (list || []).some(d => d.on && WORKLET_FX.has(d.type));
    for (const t of p.tracks) { const s = this.strips.get(t.id); if (s && uses(t.inserts)) rebuildChain(this.ctx, s, t.inserts, p.bpm); }
    (p.buses || []).forEach((bd, i) => { if (uses(bd.inserts)) this.buses[i].shape = ''; });
    if (uses(p.masterInserts)) this.masterShape = '';
    this.syncFx();
  }

  // 給介面讀取：某個效果器的即時狀態（壓縮量、EQ 曲線）
  fxInstance(owner, fxId) {
    let chain = null;
    if (owner === 'master') chain = this.masterChain;
    else if (typeof owner === 'string' && owner.startsWith('bus')) chain = this.buses[Number(owner.slice(3))]?.chain;
    else chain = this.strips.get(owner)?.chain;
    return chain?.fx.find(f => f.desc.id === fxId) || null;
  }

  busMeter(i) { const b = this.buses?.[i]; return b ? this.readMeter(b.meter) : [0, 0]; }

  applyMix() {
    if (!this.ctx) return;
    const p = store.project;
    for (const t of p.tracks) {
      const s = this.strips.get(t.id);
      if (s) applyStrip(s, t, p, this.ctx.currentTime, this.playing);
    }
    this.master.gain.setTargetAtTime(dbToGain(p.masterDb), this.ctx.currentTime, 0.01);
  }

  loopActive(from) {
    const L = store.project.loop;
    return !this.ignoreLoop && L.on && L.end - L.start > 0.05 && from < L.end;
  }

  currentTime() {
    if (!this.playing) return this.position;
    const now = this.ctx.currentTime;
    // 下一輪循環已經排好但還沒開始：仍然用上一輪的起點計算
    if (now < this.startCtxTime && this.prevCtxTime !== undefined) return Math.max(0, this.prevPos + (now - this.prevCtxTime));
    return Math.max(0, this.startPos + (now - this.startCtxTime));
  }

  // when：ctx 上「from 秒」要開始播的時刻（省略 = 30ms 後）
  _scheduleAll(from, when) {
    const c = this.ctx, p = store.project;
    const fresh = when === undefined;
    if (fresh) { when = c.currentTime + 0.03; this.prevCtxTime = undefined; }
    else { this.prevCtxTime = this.startCtxTime; this.prevPos = this.startPos; }
    this.startCtxTime = when;
    this.startPos = from;
    const L = p.loop;
    const useLoop = this.loopActive(from);
    const until = useLoop ? L.end : Infinity;
    const events = [];
    for (const t of p.tracks) {
      const strip = this.strips.get(t.id);
      if (!strip) continue;
      // 文字／字幕軌沒有聲音；影片軌排它解出來的音軌（clip.bufferId）
      if (t.kind === 'text' || t.kind === 'sub') continue;
      scheduleAutomation(strip, t, when, from, until);
      // 延遲補償：這一軌的效果器會晚 lat 秒出聲 → 素材提早 lat 秒送進去，出來剛好對齊其他軌
      const lat = trackLatency(t);
      const w2 = Math.max(c.currentTime, when - lat);
      const f2 = from + (w2 - (when - lat));     // 開頭來不及提早的那一小段直接略過
      for (const clip of t.clips) {
        if (isMidiClip(clip)) {
          // 正在錄的片段不播放：彈的聲音已經即時發出來了，再播一次會變成兩個音
          if (recordingClips.has(clip.id)) continue;
          // 只收從 from 之後才開始的音符（不從音符中間起音）
          for (const ev of midiEvents(clip, t.transpose || 0)) if (ev.s >= f2 - 1e-6 && ev.s < until) events.push({ ...ev, s: ev.s - lat, e: ev.e - lat, track: t, strip });
          continue;
        }
        const buf = store.buffers.get(clip.bufferId);
        if (!buf) continue;                       // 影片片段沒有音軌（或還在解碼）就只當畫面
        const s = scheduleClip(c, clip, buf, strip.input, w2, f2, until);
        if (s) this.sources.push(s);
      }
    }
    events.sort((a, z) => a.s - z.s);
    if (fresh) this.segments = [];
    this.segments.push({ ctxStart: when, posStart: from, posEnd: until, i: 0, events });
    // Harmony：告訴 worklet「ctx 時刻 when 對應專案第 from 秒」，它才知道現在在哪個段落／和弦
    this._setTransport(fresh ? [{ c: when, p: from }] : [...this.transport.slice(-2), { c: when, p: from }]);
    this._midiTick();
    // 循環：在結束前 150ms 先把下一輪排在「剛好 L.end 那一刻」，接縫是 sample 精準的
    clearTimeout(this.loopTimer);
    if (useLoop) {
      const loopEndCtx = when + (L.end - from);
      this.loopEndCtx = loopEndCtx;
      const ms = (loopEndCtx - c.currentTime - 0.15) * 1000;
      this.loopTimer = setTimeout(() => {
        if (!this.playing) return;
        this.sources = this.sources.filter(s => s._endCtx === undefined || s._endCtx > this.ctx.currentTime);
        this._scheduleAll(L.start, loopEndCtx);
      }, Math.max(0, ms));
    } else this.loopEndCtx = undefined;
    // 循環接續時節拍器自己會跳回去，不要重設
    if (fresh) {
      this.metroNext = this._nextBeatTime(from);
      this.metroNextCtx = when + (this.metroNext - from);
    }
  }

  // 把播放時間對照表送給所有 Harmony 效果器（新建的效果器從 ctx._zyTransport 取得）
  _setTransport(list) {
    this.transport = list;
    this.ctx._zyTransport = list;
    const chains = [...[...this.strips.values()].map(s => s.chain), ...this.buses.map(b => b.chain), this.masterChain];
    for (const ch of chains) for (const fx of ch?.fx || []) if (fx.setTransport) fx.setTransport(list);
  }

  _stopSources() {
    for (const s of this.sources) { try { s.stop(); } catch (_) { /* 已停止 */ } }
    this.sources = [];
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.kill(t);
    this.voices.clear();
    this.segments = [];
  }

  // 每 25ms 把接下來 MIDI_AHEAD 秒內的音符排進去
  _midiTick() {
    if (!this.playing || !this.segments.length) return;
    const ctxNow = this.ctx.currentTime, horizon = ctxNow + MIDI_AHEAD;
    for (const seg of this.segments) {
      const ev = seg.events;
      while (seg.i < ev.length) {
        const e = ev[seg.i];
        const at = seg.ctxStart + (e.s - seg.posStart);
        if (at > horizon) break;
        seg.i++;
        if (at < ctxNow - 0.02) continue;   // 已經錯過（分頁在背景）就跳過
        const endPos = Math.min(e.e, seg.posEnd);
        const v = scheduleNote(this.ctx, e.strip.input, e.track.instrument, e.p, e.v, Math.max(at, ctxNow), endPos - e.s);
        this.voices.add(v);
      }
    }
    // 清理：已排完而且時間已過的區段、已結束的 voice
    this.segments = this.segments.filter(s => s.i < s.events.length || s.ctxStart + (s.posEnd - s.posStart) > ctxNow);
    for (const v of this.voices) if (v.end < ctxNow) this.voices.delete(v);
  }

  // ---- 即時彈奏（MIDI 鍵盤、鋼琴捲簾試聽）----
  async noteOn(trackId, midi, vel = 100) {
    await this.ensure();
    const t = store.track(trackId), strip = this.strips.get(trackId);
    if (!t || !strip) return;
    const key = trackId + ':' + midi;
    this.live.get(key)?.release(this.ctx.currentTime);
    this.live.set(key, startVoice(this.ctx, strip.input, t.instrument || 'piano',
      Math.max(0, Math.min(127, midi + (t.transpose || 0))), vel, this.ctx.currentTime));
  }

  noteOff(trackId, midi) {
    const key = trackId + ':' + midi;
    const v = this.live.get(key);
    if (v && this.ctx) { v.release(this.ctx.currentTime); this.live.delete(key); }
  }

  allNotesOff() {
    if (!this.ctx) return;
    for (const v of this.live.values()) v.release(this.ctx.currentTime);
    this.live.clear();
  }

  // 試聽一個短音（點鋼琴捲簾時）
  async audition(trackId, midi, vel = 100, dur = 0.35) {
    await this.ensure();
    const t = store.track(trackId), strip = this.strips.get(trackId);
    if (t && strip) scheduleNote(this.ctx, strip.input, t.instrument || 'piano',
      Math.max(0, Math.min(127, midi + (t.transpose || 0))), vel, this.ctx.currentTime + 0.005, dur);
  }

  async play(from = this.position, opts = {}) {
    await this.ensure();
    if (this.playing) return;
    this.ignoreLoop = !!opts.ignoreLoop;   // 錄音時不循環
    this.playing = true;
    this._scheduleAll(from);
    this._startMetro();
    store.emit('transport', { playing: true });
  }

  restartAt(pos) {
    this._stopSources();
    clearTimeout(this.loopTimer);
    this._scheduleAll(pos);   // 不帶 when = 全新起點，會清掉 prevCtxTime 與節拍器狀態
  }

  stop() {
    if (!this.playing) return;
    this.position = this.currentTime();
    this.playing = false;
    this._stopSources();
    this._setTransport([]);
    clearTimeout(this.loopTimer);
    clearInterval(this.metroTimer);
    // 自動化排程清掉，推桿回到靜態值
    const now = this.ctx.currentTime;
    for (const s of this.strips.values()) for (const prm of [s.fader.gain, s.pan.pan, ...s.sends.map(x => x.gain)]) prm.cancelScheduledValues(now);
    this.applyMix();
    store.emit('transport', { playing: false });
  }

  seek(pos) {
    pos = Math.max(0, pos);
    this.position = pos;
    if (this.playing) this.restartAt(pos);
    store.emit('seek', { pos });
  }

  // ---- 節拍器 ----
  _nextBeatTime(from) {
    const beat = 60 / store.project.bpm;
    return Math.ceil(from / beat - 1e-6) * beat;
  }

  _startMetro() {
    clearInterval(this.metroTimer);
    this.metroTimer = setInterval(() => this._metroTick(), 25);
  }

  // 以 ctx 時間推進；遇到循環終點就跳回 L.start 之後的第一拍
  _metroTick() {
    if (!this.playing) return;
    this._midiTick();
    const p = store.project, beat = 60 / p.bpm, L = p.loop;
    const ctxNow = this.ctx.currentTime;
    if (this.metroNextCtx < ctxNow - 0.05) {   // 落後太多（分頁在背景）：重新對齊
      const pos = this.currentTime();
      this.metroNext = this._nextBeatTime(pos);
      this.metroNextCtx = ctxNow + (this.metroNext - pos);
    }
    while (this.metroNextCtx < ctxNow + LOOKAHEAD) {
      if (this.loopEndCtx !== undefined && this.metroNext >= L.end - 1e-6) {
        const nb = this._nextBeatTime(L.start);
        this.metroNextCtx = this.metroNextCtx - (this.metroNext - L.end) + (nb - L.start);
        this.metroNext = nb;
        continue;
      }
      const idx = Math.round(this.metroNext / beat);
      if (p.metronome && this.metroNextCtx >= ctxNow) this.click(this.metroNextCtx, idx % p.sigNum === 0);
      this.metroNext += beat;
      this.metroNextCtx += beat;
    }
  }

  click(at, accent) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g).connect(this.metroBus);
    o.start(at); o.stop(at + 0.08);
  }

  // ---- 電平表 ----
  readMeter(m) {
    const out = [];
    for (const [i, a] of [m.aL, m.aR].entries()) {
      a.getFloatTimeDomainData(m.buf);
      let pk = 0;
      for (let k = 0; k < m.buf.length; k++) { const v = Math.abs(m.buf[k]); if (v > pk) pk = v; }
      m.hold[i] = Math.max(pk, m.hold[i] * 0.94);   // 緩降
      out.push(m.hold[i]);
    }
    const db = 20 * Math.log10(Math.max(out[0], out[1], 1e-6));
    if (db > m.peakDb) m.peakDb = db;
    return out;
  }

  trackMeter(id) { const s = this.strips.get(id); return s && s.meter ? this.readMeter(s.meter) : [0, 0]; }
  masterLevels() { return this.masterMeter ? this.readMeter(this.masterMeter) : [0, 0]; }
  resetPeaks() {
    for (const s of this.strips.values()) if (s.meter) s.meter.peakDb = -Infinity;
    if (this.masterMeter) this.masterMeter.peakDb = -Infinity;
  }

  // ---- 離線輸出 ----
  // opts: { start, end, sampleRate, trackIds(null=全部依 mute/solo), masterGainDb }
  async render(opts = {}) {
    const p = store.project;
    const start = opts.start ?? 0;
    const end = opts.end ?? Math.max(store.projectEnd(), 1);
    const sr = opts.sampleRate ?? this.sampleRate;
    // 有 MIDI 軌時，尾巴要留到最長的釋音結束
    let tail = opts.tail ?? 0.5;
    const only = opts.trackIds ? new Set(opts.trackIds) : null;
    const useMasterFx = opts.masterFx !== false;
    const useBuses = opts.buses !== false;
    // 尾巴長度：MIDI 釋音、殘響、延遲回授（tail 明確給 0 就不加，例如輸出循環區間）
    if (opts.tail === undefined || opts.tail > 0) {
      for (const t of p.tracks) if (t.kind === 'midi' && t.clips.length) tail = Math.max(tail, releaseTail(t.instrument));
      let fxTail = 0;
      const scan = list => (list || []).forEach(d => {
        if (!d.on) return;
        if (d.type === 'reverb') fxTail = Math.max(fxTail, d.params.size + d.params.predelay / 1000);
        if (d.type === 'delay') {
          const fb = Math.max(0.01, Math.min(0.92, d.params.feedback / 100));
          fxTail = Math.max(fxTail, (d.params.time * 60 / p.bpm) * (Math.log(0.001) / Math.log(fb) + 1));
        }
      });
      p.tracks.forEach(t => scan(t.inserts));
      if (useBuses) (p.buses || []).forEach(b => { if (!b.mute) scan(b.inserts); });
      if (useMasterFx) scan(p.masterInserts);
      tail = Math.max(tail, Math.min(12, fxTail));
    }
    const len0 = Math.ceil((end - start + tail) * sr);
    const M0 = opts.mastering ?? p.mastering;
    // 母帶 limiter 有 5 ms look-ahead；母帶插入槽上的 Limiter 也一樣。
    // 兩者都會讓整個混音晚一點出來，多算這段、最後從開頭裁掉，輸出的時間軸才會對齊。
    const mstInsertLat = useMasterFx
      ? (p.masterInserts || []).reduce((a, d) => a + fxLatency(d), 0)
      : 0;
    const mLimLat = opts.masterFx !== false && M0 && M0.on && M0.limiter?.on ? 0.005 : 0;
    const latComp = Math.max(0, Math.round(sr * (mstInsertLat + mLimLat)));
    const oc = new OfflineAudioContext(2, len0 + latComp, sr);
    oc._zyTransport = [{ c: 0, p: start }];   // 離線：ctx 0 秒（輸出端）= 專案 start 秒
    await ensureFxWorklets(oc);
    // 與即時播放相同的訊號路徑：tracks → (buses) → master 插入效果器 → master fader
    const master = oc.createGain();
    master.gain.value = dbToGain(opts.masterGainDb ?? p.masterDb);
    master.connect(oc.destination);
    const mChain = buildChain(oc, useMasterFx ? p.masterInserts : [], p.bpm);
    // 母帶鏈：opts.mastering 可以覆寫（一鍵最佳化要試不同設定），masterFx:false 時不套
    const M = opts.mastering ?? p.mastering;
    if (useMasterFx && M && M.on) {
      await ensureWorklet(oc);
      const mst = buildMastering(oc, M);
      mChain.output.connect(mst.input);
      mst.output.connect(master);
    } else mChain.output.connect(master);
    const sum = mChain.input;
    // 分軌輸出（stems）預設也帶著各自的 send 效果，聽起來跟混音裡一樣
    const busIn = useBuses ? (p.buses || []).map(bd => {
      const input = oc.createGain(), fader = oc.createGain();
      const chain = buildChain(oc, bd.inserts, p.bpm);
      input.connect(chain.input); chain.output.connect(fader); fader.connect(sum);
      fader.gain.value = bd.mute ? 0 : dbToGain(bd.volumeDb);
      return input;
    }) : [];
    for (const t of p.tracks) {
      if (only ? !only.has(t.id) : !audible(t, p)) continue;
      const strip = buildStrip(oc, sum, false, t, busIn, p.bpm);
      // 分軌輸出時不受 solo/mute 影響
      strip.fader.gain.value = dbToGain(t.volumeDb);
      strip.pan.pan.value = t.pan;
      scheduleAutomation(strip, t, 0, start, end);
      const lat = trackLatency(t);
      for (const clip of t.clips) {
        if (isMidiClip(clip)) {
          for (const e of midiEvents(clip, t.transpose || 0)) {
            if (e.s < start + lat - 1e-6 || e.s >= end) continue;
            scheduleNote(oc, strip.input, t.instrument, e.p, e.v, e.s - start - lat, Math.min(e.e, end) - e.s);
          }
        } else {
          // 專案時間 x 要在 ctx 的 (x − start − lat) 送進效果器，出來時剛好在 (x − start)。
          // 以 from = start + lat 對應 ctx 0；start ~ start+lat 這一小段（lat 秒）來不及提早，略過。
          scheduleClip(oc, clip, store.buffers.get(clip.bufferId), strip.input, 0, start + lat, end);
        }
      }
    }
    if (typeof opts.onProgress === 'function' && end > start) {
      const dur = end - start;
      const steps = Math.max(2, Math.min(240, Math.ceil(dur / 2)));
      for (let i = 1; i < steps; i++) {
        const at = (dur * i) / steps;
        oc.suspend(at).then(() => { try { opts.onProgress(i / steps); } catch (_) {} return oc.resume(); }).catch(() => {});
      }
    }
    const out = await oc.startRendering();
    // limiter 有 5ms look-ahead 延遲：把開頭這段裁掉，輸出檔才會跟時間軸對齊
    if (latComp) {
      const lat = latComp;
      const n = out.length - lat;
      const fixed = new AudioBuffer({ numberOfChannels: out.numberOfChannels, length: n, sampleRate: sr });
      for (let c = 0; c < out.numberOfChannels; c++) fixed.copyToChannel(out.getChannelData(c).subarray(lat), c);
      return fixed;
    }
    return out;
  }
}

export const engine = new Engine();
