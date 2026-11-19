// 自動伴奏引擎（電子琴的 Style 功能）
// - 左手（分割點以下）認和弦，右手彈旋律；整個鍵盤模式則用全部按下的音認和弦
// - 和弦辨識：單指（Yamaha Single Finger）、多指（Fingered）、全鍵盤
// - 排程：以 AudioContext 時間預看 0.15 秒，一次排一個 16 分音符格；和弦改變時，還沒開始的音照新和弦算
// - 段落：Intro → 主歌 A … 尾奏；切換時在小節線生效，「自動過門」開啟時最後一小節的鼓換成過門
// - 每個聲部送到自己的 MIDI 軌（伴奏-鼓、伴奏-貝斯…），可以在混音台調音量與效果；錄音時寫成 MIDI 片段
import { store, newTrack, newMidiClip, MAX_TRACKS, recordingClips } from './state.js';
import { engine } from './engine.js';
import { scheduleNote, startVoice } from './synth.js';
import { PARTS, SECTIONS, STYLES, styleById, romanToChord } from './arranger-styles.js';
import { toast } from './util.js';

const AHEAD = 0.15, TICK = 25;
// 和弦性質 → 組成音（以根音 = 0）
export const CHORD_TONES = {
  maj: [0, 4, 7], min: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], '7sus4': [0, 5, 7, 10], mM7: [0, 3, 7, 11], 9: [0, 4, 7, 10, 14],
};
const SUFFIX = { maj: '', min: 'm', 7: '7', maj7: 'maj7', m7: 'm7', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4', 6: '6', m6: 'm6', add9: 'add9', m7b5: 'm7♭5', dim7: 'dim7', '7sus4': '7sus4', mM7: 'mM7', 9: '9' };
const ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const chordLabel = c => (c ? ROOTS[c.root] + (SUFFIX[c.q] ?? '') + (c.bass != null && c.bass !== c.root ? '/' + ROOTS[c.bass] : '') : '—');

// ---------------- 和弦辨識 ----------------
// 多指：試每個音為根音，跟範本比對（全中、沒有多餘音的優先；最低音是根音再加分；其他最低音 → 轉位／分割和弦）
const TEMPLATES = Object.entries(CHORD_TONES).filter(([q]) => q !== '9' && q !== 'add9').map(([q, iv]) => ({ q, set: new Set(iv.map(x => x % 12)) }));
export function recognize(notes, mode = 'fingered') {
  if (!notes.length) return null;
  const sorted = [...notes].sort((a, b) => a - b), low = sorted[0];
  if (mode === 'single') {
    // 單指：最低（最右邊的那個「主鍵」）是根音；左邊再按黑鍵 = 小調、白鍵 = 七和弦、黑+白 = 小七
    const root = sorted[sorted.length - 1] % 12;
    const below = sorted.slice(0, -1);
    const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
    const b = below.some(isBlack), w = below.some(n => !isBlack(n));
    return { root, q: b && w ? 'm7' : b ? 'min' : w ? '7' : 'maj' };
  }
  const pcs = new Set(sorted.map(n => n % 12));
  if (pcs.size === 1) return { root: low % 12, q: 'maj', bass: null, single: true };
  if (pcs.size === 2) {
    // 兩個音：五度 → 強力和弦（當大三和弦），大三／小三度 → 大／小和弦
    const [a, b] = [...pcs]; const d = (b - a + 12) % 12;
    const r = d === 7 || d === 3 || d === 4 ? a : d === 5 || d === 9 || d === 8 ? b : low % 12;
    const dd = (([...pcs].find(x => x !== r)) - r + 12) % 12;
    return { root: r, q: dd === 3 ? 'min' : 'maj' };
  }
  let best = null;
  for (let r = 0; r < 12; r++) {
    if (!pcs.has(r)) continue;
    for (const T of TEMPLATES) {
      let hit = 0, extra = 0;
      for (const p of pcs) (T.set.has((p - r + 12) % 12) ? hit++ : extra++);
      const miss = T.set.size - hit;
      // 五音可以省略
      const missOk = miss === 1 && !pcs.has((r + 7) % 12) && T.set.has(7) ? 0.4 : miss;
      const score = hit * 2 - extra * 3 - missOk * 2.5 + (low % 12 === r ? 0.8 : 0) - T.set.size * 0.05;
      if (!best || score > best.score) best = { root: r, q: T.q, score };
    }
  }
  if (!best || best.score < 2) return { root: low % 12, q: 'maj' };
  return { root: best.root, q: best.q, bass: low % 12 !== best.root ? low % 12 : null };
}

// ---------------- 編排工具 ----------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function tones(chord) { return (CHORD_TONES[chord.q] || CHORD_TONES.maj).map(x => x % 12); }
// 在 [lo, hi] 範圍內，選一組最接近上一組的 voicing（聲部進行）
function voiceLead(chord, prev, lo, hi, count) {
  const t = tones(chord), cands = [];
  // 每個轉位都試，第一個音落在 lo..lo+12
  for (let inv = 0; inv < t.length; inv++) {
    const order = t.slice(inv).concat(t.slice(0, inv));
    for (let base = lo; base < lo + 12; base++) {
      if ((base % 12) !== (chord.root + order[0]) % 12) continue;
      const v = []; let cur = base;
      for (let i = 0; i < Math.max(count, order.length); i++) {
        const pc = (chord.root + order[i % order.length]) % 12;
        while (cur % 12 !== pc) cur++;
        v.push(cur); cur++;
      }
      if (v[v.length - 1] <= hi) cands.push(v.slice(0, count));
    }
  }
  if (!cands.length) return [chord.root + lo - (lo % 12) + 12];
  if (!prev || !prev.length) return cands.sort((a, b) => Math.abs(a[0] - (lo + 7)) - Math.abs(b[0] - (lo + 7)))[0];
  const center = prev.reduce((s, x) => s + x, 0) / prev.length;
  return cands.sort((a, b) => Math.abs(a.reduce((s, x) => s + x, 0) / a.length - center) - Math.abs(b.reduce((s, x) => s + x, 0) / b.length - center))[0];
}
// 吉他：六弦的「開放把位」近似（E2–E4 之間，由低到高排）
function guitarVoicing(chord) {
  const t = tones(chord), out = [];
  const bassRoot = 40 + ((chord.bass ?? chord.root) - 4 + 12) % 12;   // E2 起最近的根音
  out.push(bassRoot);
  let cur = bassRoot + 1;
  // 依序疊上 五、根、三、五、根（典型開放和弦形狀）；七和弦把最上面換成七音
  const want = [t[2] ?? 7, 0, t[1] ?? 4, t[2] ?? 7, t[3] ?? 0];
  for (const iv of want) { const pc = (chord.root + iv) % 12; while (cur % 12 !== pc) cur++; out.push(cur); cur++; }
  return out.slice(0, 6);
}

// ---------------- 引擎 ----------------
class Arranger {
  constructor() {
    this.styleId = localStorage.getItem('arr.style') || 'cballad';
    this.mode = localStorage.getItem('arr.mode') || 'fingered';   // single | fingered | full
    this.split = Number(localStorage.getItem('arr.split') || 54);  // 這個音以下 = 左手（F#3）
    this.autoFill = localStorage.getItem('arr.fill') !== '0';
    this.memory = localStorage.getItem('arr.memory') !== '0';     // 左手放開和弦還繼續
    // 伴奏音量：聲部很多（鋼琴 5 個音＋吉他 6 條弦＋貝斯＋鼓）時，原廠力度加起來很容易破 0 dBFS
    this.level = Number(localStorage.getItem('arr.level') || 0.72);
    this.syncStart = false;
    this.running = false;
    this.section = 'intro';
    this.pending = null;          // 下一小節要切換到的段落
    this.chord = null;            // { root, q, bass }
    this.left = new Set();        // 左手按著的音
    this.partOn = Object.fromEntries(PARTS.map(p => [p.id, true]));
    this.bpm = styleById(this.styleId).bpm;   // 伴奏速度（可以跟專案不同；DAW 播放時建議設成一樣）
    this.bar = 0; this.barStart = 0; this.nextStep = 0; this.timer = null;
    this.prevVoicing = {};
    this.voices = new Set();
    this.listeners = new Set();
    this.rec = null;              // 錄音中：{ origin, clips: {partId: clip}, startCtx }
    this.introBar = 0;
  }
  get style() { return styleById(this.styleId); }
  get sig() { return this.style.sig || 4; }
  get tempo() { return this.bpm || store.project.bpm; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev = {}) { for (const fn of this.listeners) fn({ ...ev, state: this }); }

  setStyle(id) {
    this.styleId = id; localStorage.setItem('arr.style', id);
    const s = this.style;
    if (!this.running) this.bpm = s.bpm;   // 停止時換風格：用這個風格的建議速度
    store.emit('arranger-style', { bpm: s.bpm });
    this.emit({ kind: 'style' });
  }
  setOpt(k, v) {
    this[k] = v;
    localStorage.setItem('arr.' + ({ mode: 'mode', split: 'split', autoFill: 'fill', memory: 'memory' }[k] || k), typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    this.emit({ kind: 'opt' });
  }
  setLevel(v) { this.level = Math.max(0.3, Math.min(1, Number(v) || 0.72)); localStorage.setItem('arr.level', String(this.level)); this.emit({ kind: 'opt' }); }

  // ---- 軌道 ----
  ensureTracks() {
    const p = store.project, ids = {};
    let added = 0;
    for (const part of PARTS) {
      let t = p.tracks.find(x => x.arrPart === part.id);
      if (!t) {
        if (p.tracks.length >= MAX_TRACKS) continue;
        if (!added) store.checkpoint();   // 第一次加伴奏軌：可以 Ctrl+Z 拿掉
        t = newTrack(p.tracks.length, 'midi');
        t.name = '伴奏-' + part.name; t.instrument = part.def; t.arrPart = part.id; t.volumeDb = part.defVol; t.color = part.color;
        p.tracks.push(t); added++;
      }
      ids[part.id] = t.id;
    }
    if (added) store.changed('structure');
    this.trackIds = ids;
    return ids;
  }
  track(partId) { return store.track(this.trackIds?.[partId]); }

  // ---- 鍵盤輸入（midi-input 轉進來）：回傳 true = 這個音被伴奏吃掉（左手不發聲）----
  keyDown(n) {
    const lefty = this.mode === 'full' || n <= this.split;
    if (!lefty) return false;
    this.left.add(n);
    const c = recognize([...this.left], this.mode === 'single' ? 'single' : 'fingered');
    if (c) this.setChord(c);
    if (this.syncStart && !this.running) this.start();
    return this.mode !== 'full';   // 整個鍵盤模式：照常發聲
  }
  keyUp(n) {
    if (!this.left.has(n)) return this.mode !== 'full' && n <= this.split;
    this.left.delete(n);
    if (!this.memory && !this.left.size) this.setChord(null);
    else if (this.left.size) { const c = recognize([...this.left], this.mode === 'single' ? 'single' : 'fingered'); if (c) this.setChord(c); }
    return this.mode !== 'full';
  }
  setChord(c) {
    const same = c && this.chord && c.root === this.chord.root && c.q === this.chord.q && c.bass === this.chord.bass;
    if (same) return;
    this.chord = c;
    // 和弦改變：還沒結束的長音（弦樂、Pad）立刻收掉，下一格開始用新和弦
    if (this.running) this.cutHeld();
    this.emit({ kind: 'chord' });
  }

  // ---- 控制 ----
  async start(section) {
    await engine.ensure();
    this.ensureTracks();
    if (this.running) { if (section) this.go(section); return; }
    if (!this.chord) this.chord = { root: 0, q: 'maj' };
    this.running = true; this.syncStart = false;
    this.section = section || this.section || 'intro';
    if (this.style.sections[this.section]?.bars) this.introBar = 0;
    const ctx = engine.ctx;
    // DAW 在播放：對齊到下一個小節線
    const spbSec = 60 / this.tempo;
    if (engine.playing) {
      const pos = engine.currentTime(), barSec = spbSec * this.sig;
      const next = Math.ceil(pos / barSec - 1e-6) * barSec;
      this.barStart = ctx.currentTime + (next - pos);
    } else this.barStart = ctx.currentTime + 0.06;
    this.bar = 0; this.nextStep = 0; this.pending = null; this.prevVoicing = {}; this.keyRoot = null;
    this.beginBar();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK);
    this.tick();
    this.emit({ kind: 'start' });
  }
  stop(immediate = false) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    const t = engine.ctx ? engine.ctx.currentTime : 0;
    for (const v of this.voices) immediate ? v.kill?.(t) : v.release?.(t);
    this.voices.clear();
    this.pending = null;
    this.emit({ kind: 'stop' });
  }
  toggle() { this.running ? this.stop() : this.start(); }
  // 切換段落：在下一個小節線生效（尾奏、Break 也一樣）
  go(id) {
    if (!this.style.sections[id]) return;
    if (!this.running) { this.section = id; this.emit({ kind: 'section' }); return; }
    if (id === this.section && !this.style.sections[id].bars) { this.isFill = true; this.emit({ kind: 'section' }); return; }   // 按同一段 = 這一小節打過門
    this.pending = id;
    // 小節中間按：這一小節剩下的部分就打過門（跟實體電子琴一樣）
    if (this.autoFill && !this.cur?.chords) this.isFill = true;
    this.emit({ kind: 'section' });
  }
  setTempo(bpm) { this.bpm = clamp(Math.round(bpm), 30, 240); this.emit({ kind: 'tempo' }); }

  cutHeld() {
    const t = engine.ctx.currentTime + 0.01;
    for (const v of this.voices) if (v._hold && v.end > t) { v.release(t); v._hold = false; }
  }

  // ---- 排程 ----
  barLen() { return this.sig * 60 / this.tempo; }
  beginBar() {
    const S = this.style.sections[this.section];
    this.cur = S;
    // Intro / Ending：照自己的和弦進行；其他段落：用左手的和弦
    this.barChord = null;
    if (S.chords) {
      // 前奏／尾奏以「歌曲的調」為 I：前奏用開始時按的和弦；尾奏用前奏記下的調（沒有就用目前和弦）
      if (this.introBar === 0 && (this.section === 'intro' || this.keyRoot == null)) this.keyRoot = (this.chord || { root: 0 }).root;
      const rn = this.introBar < S.chords.length ? S.chords[this.introBar] : (S.lastChord || 'I');
      this.barChord = romanToChord(rn, this.keyRoot);
    }
    // 這一小節要不要打過門：自動過門 + 下一小節要換段落；或使用者按了同一段（fillNext）；或 Intro 最後一小節
    const lastIntro = S.chords && this.introBar === S.chords.length - 1 && S.endFill;
    this.isFill = !!((this.autoFill && this.pending && this.pending !== this.section) || this.fillNext || lastIntro);
    this.fillNext = false;
    this.emit({ kind: 'bar' });
  }
  endBar() {
    const S = this.style.sections[this.section];
    this.bar++;
    this.barStart += this.barLen();
    this.nextStep = 0;
    if (S.chords) {
      this.introBar++;
      // Intro 跑完 → 主歌 A；Ending 跑完（含最後的和弦小節）→ 停
      if (this.section === 'ending' && this.introBar > S.chords.length) { this.finishAt = this.barStart; this.stopAfterBar(); return false; }
      if (this.section === 'intro' && this.introBar >= S.chords.length && !this.pending) this.pending = 'verse1';
    }
    if (this.section === 'break' && !this.pending) this.pending = this.prevSection || 'verse1';
    if (this.pending) {
      if (this.pending !== 'break') this.prevSection = this.pending;
      else this.prevSection = this.section;
      this.section = this.pending; this.pending = null;
      this.introBar = 0;
    }
    this.beginBar();
    return true;
  }
  stopAfterBar() {
    // 尾奏最後一個和弦：已經排在上一小節的最後；等聲音自然結束後再停
    const t = (this.finishAt - engine.ctx.currentTime) * 1000 + 50;
    clearInterval(this.timer);
    setTimeout(() => { this.running = false; this.section = 'intro'; this.emit({ kind: 'stop' }); }, Math.max(0, t));
  }

  tick() {
    if (!this.running) return;
    const ctx = engine.ctx, horizon = ctx.currentTime + AHEAD;
    const steps = this.sig * 4, stepSec = this.barLen() / steps;
    let guard = 0;
    while (this.running && guard++ < 64) {
      if (this.nextStep >= steps) { if (!this.endBar()) return; continue; }
      const t = this.barStart + this.nextStep * stepSec;
      if (t > horizon) break;
      this.playStep(this.nextStep, stepSec, Math.max(t, ctx.currentTime));
      this.nextStep++;
    }
    for (const v of this.voices) if (v.end < ctx.currentTime - 0.5) this.voices.delete(v);
  }

  // 一個 16 分音符格：每個聲部找 t 落在這一格的事件
  playStep(step, stepSec, when) {
    const S = this.cur; if (!S) return;
    const chord = this.barChord || this.chord;
    if (!chord) return;
    const beat0 = step / 4, beat1 = (step + 1) / 4;
    const spbSec = 60 / this.tempo;
    // Ending：最後的「I」小節只打一個長音
    const finalBar = S.chords && this.introBar >= S.chords.length;
    for (const part of PARTS) {
      if (!this.partOn[part.id]) continue;
      let pat = S.parts[part.id];
      if (part.id === 'drums' && this.isFill && S.fill) {
        // 過門：最後 2 拍（抒情）或整小節（build）換成過門鼓
        const half = this.sig * 0.5;
        pat = (S.parts.drums || []).filter(e => e.t < half).concat(S.fill.filter(e => e.t >= half));
      }
      if (finalBar) pat = part.id === 'drums' ? [{ t: 0, d: 1, v: 110, n: 49 }, { t: 0, d: 1, v: 100, n: 36 }] : [{ t: 0, d: this.sig * 0.95, r: part.id === 'bass' ? 'R' : 'C', v: 92 }];
      if (!pat) continue;
      for (const e of pat) {
        if (e.t < beat0 - 1e-6 || e.t >= beat1 - 1e-6) continue;
        const at = when + (e.t - beat0) * spbSec, dur = e.d * spbSec;
        this.emitPart(part.id, e, chord, at, dur);
      }
    }
  }

  emitPart(pid, e, chord, at, dur) {
    const tr = this.track(pid); if (!tr) return;
    const strip = engine.strips.get(tr.id); if (!strip) return;
    const notes = this.pitches(pid, e, chord);
    const hold = pid === 'strings' || dur > 1.5;
    notes.forEach((n, i) => {
      // 吉他刷弦：每條弦錯開幾毫秒（↓ 由低到高、↑ 由高到低）
      const strum = pid === 'guitar' && (e.r === 'D' || e.r === 'U') ? (e.r === 'D' ? i : notes.length - 1 - i) * 0.012 : 0;
      // 力度留 headroom：滿載時（吉他 6 弦＋鋼琴 5 音）也不會把總和推破 0 dBFS
      const vel = clamp(Math.round(e.v * (pid === 'guitar' && e.r === 'U' ? 0.85 : 1) * this.dyn() * this.level), 1, 104);
      const p = clamp(n + (tr.transpose || 0), 0, 127);
      const v = scheduleNote(engine.ctx, strip.input, tr.instrument || 'piano', p, vel, at + strum, Math.max(0.03, dur - strum));
      v._hold = hold;
      this.voices.add(v);
      if (this.rec) this.recordNote(pid, p, vel, at + strum, dur - strum);
    });
  }
  dyn() { return this.section === 'chorus2' ? 1.0 : this.section === 'verse1' ? 0.9 : 0.96; }

  pitches(pid, e, chord) {
    if (pid === 'drums') return [e.n];
    const T = tones(chord), root = chord.root;
    const bassPc = chord.bass ?? root;
    if (pid === 'bass') {
      const R = 36 + ((bassPc - 0 + 12) % 12);   // C2..B2
      const r = R > 43 ? R - 12 : R;             // 低於 G2 的範圍
      const fifth = r + 7, third = r + (T.includes(3) ? 3 : 4);
      if (e.r === 'R') return [r];
      if (e.r === '5') return [fifth > 50 ? fifth - 12 : fifth];
      if (e.r === '3') return [third];
      if (e.r === '8') return [r + 12];
      // 經過音：下一拍通常回到根音或換和弦，用根音下方半音（流行抒情最常見的走法）
      if (e.r === 'A') return [r - 1 < 28 ? r + 11 : r - 1];
      return [r];
    }
    if (pid === 'guitar') {
      const g = guitarVoicing(chord);
      if (e.r === 'D' || e.r === 'U') return e.r === 'U' ? g.slice(2) : g;
      if (e.r === 'PW') return [g[0], g[0] + 7, g[0] + 12];
      if (e.r === 'H') return g.slice(3);
      if (/^P\d$/.test(e.r)) return [g[Math.min(g.length - 1, Number(e.r[1]) - 1)]];
      return g;
    }
    if (pid === 'keys' || pid === 'strings') {
      const lo = pid === 'keys' ? 52 : 55, hi = pid === 'keys' ? 72 : 79;
      const count = Math.max(3, Math.min(4, T.length));
      const v = voiceLead(chord, this.prevVoicing[pid], lo, hi, count);
      this.prevVoicing[pid] = v;
      if (e.r === 'L') return [root + 36 + (root + 36 < 40 ? 12 : 0), v[0]];
      if (e.r === 'H') return v.slice(1);
      if (/^\d$/.test(e.r)) return [v[(Number(e.r) - 1) % v.length]];
      // 鋼琴左手加根音低八度，比較飽滿
      return pid === 'keys' ? [root + 36 + (root + 36 < 40 ? 12 : 0), ...v] : v;
    }
    if (pid === 'arp') {
      const base = 60 + ((root - 0 + 12) % 12) - (root > 7 ? 12 : 0);
      const ladder = [];
      for (let o = 0; o < 3; o++) for (const iv of T) ladder.push(base + iv + o * 12);
      ladder.sort((a, b) => a - b);
      const k = clamp(Number(e.r) - 1, 0, ladder.length - 1);
      return [ladder[k]];
    }
    return [];
  }

  // ---- 錄成 MIDI 片段 ----
  async startRecording() {
    this.ensureTracks();
    store.checkpoint();
    const p = store.project;
    // 錄進時間軸：伴奏速度要跟專案一樣，小節線才對得上
    if (this.tempo !== p.bpm) { p.bpm = this.tempo; store.changed('structure'); toast(`專案速度改為 ${p.bpm} BPM，跟伴奏一致`); }
    const spbSec = 60 / p.bpm;
    // 從播放頭所在的小節開始：DAW 沒在播放就一起開始播
    if (!engine.playing) {
      const barSec = spbSec * this.sig;
      engine.seek(Math.floor(engine.currentTime() / barSec + 1e-6) * barSec);
      await engine.play();
      if (this.running) this.stop(true);
    }
    const originPos = engine.currentTime();
    const startBeat = Math.floor(originPos / spbSec / this.sig) * this.sig;
    const clips = {};
    for (const part of PARTS) {
      const t = this.track(part.id); if (!t) continue;
      const c = newMidiClip(startBeat, this.sig);
      c.name = '自動伴奏';
      recordingClips.add(c.id);   // 錄音中不給 DAW 播放（伴奏本身已經在發聲）
      t.clips.push(c); clips[part.id] = c;
    }
    // ctx 時間 ↔ 專案位置：DAW 播放中用 engine 的對照；沒播放就以按下錄音的那一刻為 originPos
    this.rec = { clips, ctx0: engine.ctx.currentTime, pos0: originPos, startBeat };
    store.changed('structure');
    this.emit({ kind: 'rec' });
    // 伴奏還沒開始：對齊下一個小節線開始（start 會依 DAW 位置對齊）
    if (!this.running && !this.syncStart) this.start();
  }
  recordNote(pid, p, v, at, dur) {
    const r = this.rec, c = r.clips[pid]; if (!c) return;
    const spbSec = 60 / store.project.bpm;
    const pos = engine.playing ? engine.currentTime() + (at - engine.ctx.currentTime) : r.pos0 + (at - r.ctx0);
    const t = pos / spbSec - c.startBeat;
    if (t < 0) return;
    c.notes.push({ p, t, d: Math.max(1 / 32, dur / spbSec), v });
    if (t + dur / spbSec > c.lengthBeats) c.lengthBeats = Math.ceil((t + dur / spbSec) / this.sig) * this.sig;
    store.dirty = true;
  }
  stopRecording() {
    const r = this.rec; if (!r) return;
    this.rec = null;
    let n = 0;
    for (const [pid, c] of Object.entries(r.clips)) {
      recordingClips.delete(c.id);
      const t = this.track(pid);
      if (!c.notes.length) { if (t) t.clips = t.clips.filter(x => x !== c); }
      else n += c.notes.length;
    }
    store.changed('structure');
    toast(n ? `自動伴奏已錄成 MIDI（${n} 個音），可以在鋼琴捲簾裡修改` : '錄音期間沒有產生伴奏');
    this.emit({ kind: 'rec' });
  }

  // 試聽一個和弦（UI 用）
  preview(partId, midi) {
    const tr = this.track(partId); const strip = tr && engine.strips.get(tr.id);
    if (strip) startVoice(engine.ctx, strip.input, tr.instrument, midi, 90, engine.ctx.currentTime).release(engine.ctx.currentTime + 0.4);
  }
}

export const arranger = new Arranger();
export { PARTS, SECTIONS, STYLES };
