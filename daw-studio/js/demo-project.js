// 示範專案：給課程截圖與第一次打開的人一個「有東西可以看」的專案
// 全部用程式產生（不讀任何外部檔案），所以可以離線跑
import { store, newTrack, newMidiClip } from './state.js';
import { newFx } from './effects.js';
import { computePeaks, uid } from './util.js';

const SR = 48000;

// ── 示範人聲 ────────────────────────────────────────────────
// 源－濾波（source-filter）合成：聲門脈衝當激發源，串四顆共振峰濾波器當聲道，
// 再加上子音、換氣、顫音與滑音。聽起來像有人在唱，但它是 100% 由程式算出來的
// （示範專案不讀任何外部檔案，才可能離線跑）。
//
// 想要「真的」人聲，只能自己錄一段——把 demo 換成 AI 歌聲會多幾 MB 的檔案，
// 而且授權要另外處理。
const VOWELS = {
  a: { f: [730, 1090, 2440, 3400], bw: [90, 110, 170, 240], g: 1.0 },
  e: { f: [530, 1840, 2480, 3500], bw: [80, 110, 170, 230], g: 0.93 },
  i: { f: [270, 2290, 3010, 3600], bw: [70, 130, 190, 240], g: 0.84 },
  o: { f: [570, 840, 2410, 3300], bw: [85, 100, 170, 230], g: 0.95 },
  u: { f: [300, 870, 2240, 3300], bw: [75, 95, 170, 230], g: 0.80 },
};

// 二階共振器：r 決定頻寬、theta 決定中心頻率
function formantCoef(F, BW) {
  const r = Math.exp(-Math.PI * BW / SR);
  const th = 2 * Math.PI * F / SR;
  const b1 = 2 * r * Math.cos(th);
  const b2 = -r * r;
  return { a0: 1 - b1 - b2, b1, b2 };
}

export function makeVocalBuffer(bpm) {
  const beat = 60 / bpm, len = Math.floor(SR * beat * 4 * 8);
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: SR });
  const d = b.getChannelData(0);

  // Am – F – C – G，每個和弦兩小節；旋律用五聲音階
  const scale = [220, 261.63, 293.66, 329.63, 392, 440];
  const notes = [];
  for (let bar = 0; bar < 8; bar++) {
    for (let k = 0; k < 4; k++) {
      const idx = bar * 4 + k;
      notes.push({
        t: (bar * 4 + k + (k === 2 ? 0.5 : 0)) * beat,
        d: (k === 3 ? 1.4 : 0.9) * beat,
        f: scale[(bar * 2 + k * 3) % scale.length],
        vowel: 'aeoiuaoe'[idx % 8],
        cons: ['m', '', 's', 't', 'n', '', 'sh', 'k'][idx % 8],
      });
    }
  }
  // 故意唱高 30 音分：修音單元需要「有東西可修」
  const detune = Math.pow(2, 30 / 1200);
  notes.forEach((n, i) => {
    n.f0 = n.f * detune;
    const prev = notes[i - 1];
    n.prev = prev && n.t - (prev.t + prev.d) < 0.02 ? prev.f0 : n.f0;   // 連著唱才滑音
  });

  // ── 子音與換氣排程 ──────────────────────────────────────
  const CONS_DUR = { m: 0.08, n: 0.075, s: 0.09, sh: 0.095, t: 0.03, k: 0.035 };
  const events = [];
  for (const n of notes) {
    if (!n.cons) continue;
    events.push({ t: Math.max(0, n.t - CONS_DUR[n.cons]), dur: CONS_DUR[n.cons], kind: n.cons });
  }
  for (let bar = 2; bar < 8; bar += 2) {           // 兩小節吸一次氣
    const t = bar * 4 * beat - 0.2;
    if (t > 0) events.push({ t, dur: 0.22, kind: 'breath' });
  }

  // ── 歌聲（源－濾波）────────────────────────────────────
  const st = [0, 1, 2, 3].map(() => ({ a0: 0.1, b1: 0, b2: 0, y1: 0, y2: 0 }));
  const cur = VOWELS.a.f.slice();
  const CTRL = 64;                                // 每 64 樣本（1.3 ms）更新一次濾波器
  let ph = 0, prevFlow = 0, peak = 0;
  const To = 0.42;                                 // 聲門開相位

  notes.forEach((n, ni) => {
    const i0 = Math.floor(n.t * SR);
    const i1 = Math.min(len, Math.floor((n.t + n.d) * SR));
    const tv = VOWELS[n.vowel];
    for (let i = i0; i < i1; i++) {
      const local = (i - i0) / SR;
      const remain = (i1 - i) / SR;

      // 滑音（換音 60 ms）＋顫音（進音 150 ms 後才開始）＋起音時音高略低
      const glide = Math.min(1, local / 0.06);
      let f0 = n.prev + (n.f0 - n.prev) * glide;
      f0 *= 1 + 0.0104 * Math.min(1, Math.max(0, (local - 0.15) / 0.25))
                * Math.sin(2 * Math.PI * 5.3 * (i / SR) + ni * 0.7);
      f0 *= 1 - 0.012 * Math.exp(-local / 0.05);

      ph += f0 / SR * 2 * Math.PI;
      while (ph > 2 * Math.PI) ph -= 2 * Math.PI;

      // Rosenberg 聲門波形，取微分得到 -6 dB/oct 的頻譜斜率
      const p = ph / (2 * Math.PI);
      const flow = p < To ? 0.5 * (1 - Math.cos(Math.PI * p / To)) : 0;
      let x = (flow - prevFlow) * 18;
      prevFlow = flow;

      // 聲帶抖動與氣息噪音
      x *= 1 + 0.004 * (Math.random() - 0.5);
      x += (Math.random() - 0.5) * Math.abs(x) * 0.45;

      // 音量包絡：起音 30 ms、收音 90 ms
      const atk = Math.min(1, local / 0.03);
      const rel = Math.min(1, remain / 0.09);
      x *= atk * atk * (3 - 2 * atk) * Math.min(1, rel * 1.4) * tv.g;

      if ((i - i0) % CTRL === 0) {          // 母音過渡：40 ms 內滑到下一個母音
        for (let k = 0; k < 4; k++) {
          cur[k] += (tv.f[k] - cur[k]) * 0.25;
          const c = formantCoef(cur[k], tv.bw[k]);
          st[k].a0 = c.a0; st[k].b1 = c.b1; st[k].b2 = c.b2;
        }
      }
      for (let k = 0; k < 4; k++) {
        const y = st[k].a0 * x + st[k].b1 * st[k].y1 + st[k].b2 * st[k].y2;
        st[k].y2 = st[k].y1; st[k].y1 = y;
        x = y;
      }
      d[i] += x;
      const a = Math.abs(x);
      if (a > peak) peak = a;
    }
  });

  // ── 子音與換氣（獨立成形，不經過共振峰）───────────────
  for (const ev of events) {
    const i0 = Math.max(0, Math.floor(ev.t * SR));
    const count = Math.floor(ev.dur * SR);
    let lp = 0, lp2 = 0, phN = 0;
    for (let j = 0; j < count; j++) {
      const idx = i0 + j;
      if (idx >= len) break;
      const p = j / count;
      const w = Math.random() * 2 - 1;
      let v = 0;
      if (ev.kind === 's') {                       // 齒音：高頻噪音
        lp += (w - lp) * 0.6;
        v = (w - lp) * Math.sin(Math.PI * Math.min(1, p * 1.2)) * 5.5;
      } else if (ev.kind === 'sh') {               // 捲舌音：中間頻段
        lp += (w - lp) * 0.30; lp2 += (lp - lp2) * 0.30;
        v = (lp - lp2) * Math.sin(Math.PI * Math.min(1, p * 1.15)) * 13;
      } else if (ev.kind === 't' || ev.kind === 'k') {
        const e = Math.exp(-p * 9);
        lp += (w - lp) * 0.5;
        v = (w - lp) * e * (ev.kind === 'k' ? 1.4 : 1.6);
      } else if (ev.kind === 'breath') {           // 吸氣
        lp += (w - lp) * 0.22;
        v = lp * Math.sin(Math.PI * p) * 6;
      } else {                                     // m / n：低頻鼻音
        phN += (ev.kind === 'm' ? 132 : 168) / SR * 2 * Math.PI;
        const buzz = Math.sin(phN) + 0.35 * Math.sin(2 * phN);
        lp += (buzz - lp) * 0.10;
        v = lp * Math.sin(Math.PI * p) * 0.5;
      }
      d[idx] += v;
    }
  }

  // ── 正規化到約 -6 dBFS（含子音，避免削波）───────────────
  let fin = peak;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(d[i]);
    if (a > fin) fin = a;
  }
  const k = fin > 1e-6 ? 0.55 / fin : 1;
  for (let i = 0; i < len; i++) d[i] *= k;
  return b;
}

function midiTrack(index, name, color, inst, notes, vol, lenBeats = LEN) {
  const t = newTrack(index, 'midi');
  t.name = name; t.color = color; t.instrument = inst; t.volumeDb = vol ?? 0;
  const clip = newMidiClip(0, lenBeats, notes);
  clip.name = name;
  t.clips.push(clip);
  return t;
}

const chordNotes = (root, ivs, oct = 4) => ivs.map(iv => 12 * oct + ((root + iv) % 12));
// 人性化：力度與時間都加一點誤差，這是「MIDI 聽起來像人」最基本的一步
const hum = (v, amt = 6) => Math.max(1, Math.min(127, Math.round(v + (Math.random() * 2 - 1) * amt)));
const hurry = (t, amt = 0.02) => Math.max(0, t + (Math.random() * 2 - 1) * amt);

// ── 編曲骨架 ────────────────────────────────────────────────
// 16 小節、92 BPM、C 大調。和弦是 Am–F–C–G（vi–IV–I–V，俗稱「小室進行」），
// 這是華語與日本流行歌最常見的進行之一。旋律、節奏與配器全部原創、由程式產生，
// 沒有引用任何現有歌曲，所以可以自由使用與授權。
//
//   前奏 1–4：電鋼琴分解和弦 + 弦樂 pad
//   主歌 5–8：鼓與貝斯進來，鋼琴補和聲
//   副歌 9–12：加吉他刷弦、合成器主旋律，鼓變 16 分音符
//   尾奏 13–16：抽掉貝斯，只留鋼琴與弦樂
export const DEMO_PROG = [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']];
const chordAtBeat = beat => DEMO_PROG[Math.floor(beat / 8) % 4];
const ivsOf = q => (q === 'min' ? [0, 3, 7] : [0, 4, 7]);
const BARS = 16;
const LEN = BARS * 4;

function buildDemo() {
  const piano = [], epiano = [], guitar = [], bass = [], drums = [], strings = [], lead = [];

  for (let bar = 0; bar < BARS; bar++) {
    const b0 = bar * 4;
    const [root, q] = chordAtBeat(b0);
    const iv = ivsOf(q);
    const chorus = bar >= 8 && bar < 12;

    // 鋼琴：每小節一次塊狀和弦（擺在中央 C 附近，聲部才不會跳）
    const pv = chordNotes(root, iv, 3).map(n => (n < 48 ? n + 12 : n));
    if (bar >= 4) {
      pv.forEach((n, i) => piano.push({ p: n, t: hurry(b0 + 0.01 * i), d: 3.6, v: hum(chorus ? 82 : 72) }));
    }
    if (bar >= 12) pv.forEach(n => piano.push({ p: n + 12, t: hurry(b0 + 2), d: 1.8, v: hum(58) }));

    // 電鋼琴：八分音符分解（前奏的主角）
    const seq = [0, 1, 2, 1, 0, 2, 1, 2];
    seq.forEach((k, i) => {
      const n = chordNotes(root, iv, 4)[k % 3] + (i === 7 ? 12 : 0);
      epiano.push({ p: n, t: hurry(b0 + i * 0.5, 0.015), d: 0.45, v: hum(bar < 4 ? 62 : 54, 5) });
    });

    // 吉他：副歌刷弦（每兩拍一下，弦之間錯開幾毫秒）
    if (chorus) {
      for (let k = 0; k < 2; k++) {
        chordNotes(root, iv, 3).concat([root + 48]).forEach((n, i) => {
          const p = n < 45 ? n + 12 : n;
          guitar.push({ p, t: hurry(b0 + k * 2 + i * 0.035, 0.01), d: 1.2, v: hum(k === 0 ? 74 : 66) });
        });
      }
    }

    // 貝斯：根音在 1、八度在 2.5、五度在 3.5（流行歌最常見的走法）
    if (bar >= 4 && bar < 12) {
      const r = 36 + root;
      bass.push({ p: r, t: hurry(b0), d: 1.3, v: hum(96) });
      bass.push({ p: r + 12, t: hurry(b0 + 1.5), d: 0.5, v: hum(80) });
      bass.push({ p: r + 7, t: hurry(b0 + 2.5), d: 0.6, v: hum(86) });
      bass.push({ p: r, t: hurry(b0 + 3.5), d: 0.4, v: hum(78) });
    }

    // 鼓：主歌 8 分音符 hi-hat、副歌 16 分；第 8、12 小節打過門
    if (bar >= 4) {
      drums.push({ p: 36, t: b0, d: 0.2, v: hum(112) });
      drums.push({ p: 36, t: b0 + 2, d: 0.2, v: hum(106) });
      drums.push({ p: 38, t: b0 + 1, d: 0.2, v: hum(104) });
      drums.push({ p: 38, t: b0 + 3, d: 0.2, v: hum(102) });
      if (bar >= 12) drums.push({ p: 36, t: b0 + 2.5, d: 0.2, v: hum(92) });
      const hats = chorus ? 16 : 8;
      for (let k = 0; k < hats; k++) {
        drums.push({ p: 42, t: b0 + k * (4 / hats), d: 0.12, v: hum(k % 2 ? 62 : 76, 5) });
      }
      if (bar === 7 || bar === 11) {
        for (let k = 0; k < 8; k++) drums.push({ p: 38, t: b0 + 2 + k * 0.25, d: 0.1, v: hum(70 + k * 6, 4) });
      }
      if (bar === 11) drums.push({ p: 49, t: b0 + 3.75, d: 0.3, v: 108 });   // 副歌結束的鈸
    }

    // 弦樂：前奏與副歌的長音 pad
    if (bar < 4 || chorus) {
      chordNotes(root, iv, 4).forEach((n, i) => strings.push({ p: n, t: b0 + i * 0.02, d: 3.9, v: hum(bar < 4 ? 52 : 62, 4) }));
    }

    // 合成器主旋律：副歌用長音補高音，把副歌撐起來
    if (chorus) {
      const top = chordNotes(root, iv, 5)[0];
      lead.push({ p: top, t: b0, d: 1.8, v: hum(74) });
      lead.push({ p: top + 7, t: b0 + 2, d: 1.6, v: hum(68) });
    }
  }
  return { piano, epiano, guitar, bass, drums, strings, lead };
}

export function seedDemo() {
  const p = store.project;
  p.name = '示範：夜裡的車窗';
  p.bpm = 92; p.sigNum = 4; p.sigDen = 4;
  p.tracks.length = 0;
  store.buffers.clear(); store.bufferMeta.clear();

  // ── 主唱：兩次錄音（第二次是另一版 Take，副歌換過去）─────────
  const vocal = newTrack(0, 'audio');
  vocal.name = '主唱'; vocal.color = '#f78fc3';
  for (const [i, atBeat] of [[0, 0], [1, 32]]) {
    const buf = makeVocalBuffer(p.bpm);
    const bid = uid('buf');
    store.buffers.set(bid, buf);
    store.bufferMeta.set(bid, { name: `主唱 take${i + 1}.wav`, peaks: computePeaks(buf) });
    vocal.clips.push({
      id: uid('clip'), bufferId: bid, name: `主唱 take${i + 1}`,
      start: atBeat * 60 / p.bpm, duration: buf.duration, offset: 0,
      gainDb: 0, fadeIn: 0.01, fadeOut: 0.9,
    });
  }
  const tune = newFx('tune'); tune.params.key = 0; tune.params.scale = 1; tune.params.retune = 45;
  const eq = newFx('eq'); eq.params.bands[0].on = true; eq.params.bands[0].freq = 90;
  const comp = newFx('comp'); comp.params.threshold = -20; comp.params.ratio = 3; comp.params.makeup = 3;
  vocal.inserts.push(tune, eq, comp);
  vocal.sends = [-14, -60];
  p.tracks.push(vocal);

  // ── 樂器軌（經典流行編制）──────────────────────────────────
  const parts = buildDemo();
  const add = (name, color, inst, notes, vol) => p.tracks.push(midiTrack(p.tracks.length, name, color, inst, notes, vol));
  add('鋼琴', '#4f9dff', 'piano', parts.piano, -8);
  add('電鋼琴', '#35c9a5', 'epiano', parts.epiano, -12);
  add('吉他', '#f5b83d', 'aguitar', parts.guitar, -11);
  add('貝斯', '#9bd35a', 'fbass', parts.bass, -6);
  add('鼓組', '#ff8a5c', 'drums', parts.drums, -7);
  add('弦樂', '#b58bff', 'strings', parts.strings, -14);
  add('合成器', '#f78fc3', 'lead', parts.lead, -13);

  // 鼓與貝斯掛一點壓縮：流行歌「黏」起來的關鍵
  const drumTrack = p.tracks.find(t => t.name === '鼓組');
  const drumComp = newFx('comp');
  drumComp.params.threshold = -18; drumComp.params.ratio = 3; drumComp.params.attack = 12;
  drumComp.params.release = 120; drumComp.params.makeup = 2.5;
  drumTrack.inserts.push(drumComp);
  const bassTrack = p.tracks.find(t => t.name === '貝斯');
  const bassComp = newFx('comp');
  bassComp.params.threshold = -22; bassComp.params.ratio = 3.5; bassComp.params.attack = 8;
  bassComp.params.release = 140; bassComp.params.makeup = 3;
  bassTrack.inserts.push(bassComp);
  p.tracks.find(t => t.name === '弦樂').sends = [-11, -60];

  // ── 和弦軌：小室進行 vi–IV–I–V ─────────────────────────────
  p.chords = [];
  for (let i = 0; i < BARS / 2; i++) {
    const [root, q] = DEMO_PROG[i % 4];
    p.chords.push({ t: i * 8, d: 8, root, q });
  }
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
