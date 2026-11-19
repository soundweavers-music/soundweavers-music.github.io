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

// spec（可省略）：{ bars, notes:[{ t:拍, d:拍, midi, vowel?, cons? }] }
// 省略時用原本的 Am–F–C–G 五聲旋律；卡農示範曲會傳自己的旋律進來。
export function makeVocalBuffer(bpm, spec) {
  const BARS = spec && spec.bars ? spec.bars : 8;
  const beat = 60 / bpm, len = Math.floor(SR * beat * 4 * BARS);
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: SR });
  const d = b.getChannelData(0);

  const notes = [];
  if (spec && Array.isArray(spec.notes) && spec.notes.length) {
    // 指定的旋律（例如卡農的低音動機）：無詞哼唱，只用母音
    spec.notes.forEach((m, idx) => notes.push({
      t: m.t * beat,
      d: m.d * beat,
      f: 440 * Math.pow(2, (m.midi - 69) / 12),
      vowel: m.vowel || 'aoeiu'[idx % 5],
      cons: m.cons || '',
    }));
  } else {
    // Am – F – C – G，每個和弦兩小節；旋律用五聲音階
    const scale = [220, 261.63, 293.66, 329.63, 392, 440];
    for (let bar = 0; bar < BARS; bar++) {
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
  for (let bar = 2; bar < BARS; bar += 2) {         // 兩小節吸一次氣
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

// ── 卡農示範曲（弦樂版）────────────────────────────────────
// 和聲與低音取自 Pachelbel《Canon in D》（約 1680，已進入公有領域）：
//   D – A – Bm – F#m – G – D – G – A
// 編曲手法也是「卡農」本來的樣子：同一段動機由兩個聲部先後模仿（相差兩小節、
// 相差八度），上面再疊一層八度齊奏與 Pad。24 小節、三個段落。
// 全部由程式產生，沒有轉錄任何受保護的編曲、歌詞或錄音，可自由使用。
export const DEMO_PROG = [
  [2, 'maj'], [9, 'maj'], [11, 'min'], [6, 'min'],
  [7, 'maj'], [2, 'maj'], [7, 'maj'], [9, 'maj'],
];
const GROUND = [50, 45, 47, 42, 43, 50, 43, 45];   // 卡農的固定低音 D3 A2 B2 F#2 G2 D3 G2 A2
const ivsOf = q => (q === 'min' ? [0, 3, 7] : [0, 4, 7]);
const BARS = 24;
const LEN = BARS * 4;
const chordAtBar = bar => DEMO_PROG[bar % 8];
const groundOf = bar => GROUND[bar % 8];
// 三個段落：A 室內樂、B 加入低音與第二聲部、C 全奏
const sectionOf = bar => (bar < 8 ? 'A' : bar < 16 ? 'B' : 'C');

function buildCanon() {
  const vln1 = [], vln2 = [], piano = [], epiano = [], bass = [], drums = [], pad = [];

  for (let bar = 0; bar < BARS; bar++) {
    const b0 = bar * 4;
    const [root, q] = chordAtBar(bar);
    const iv = ivsOf(q);
    const gr = groundOf(bar);
    const sec = sectionOf(bar);

    // 第一聲部（小提琴）：第 5 小節進來；C 段加八度齊奏
    if (bar >= 4) {
      const p = gr + 24;
      const v = sec === 'A' ? 58 : sec === 'B' ? 68 : 80;
      vln1.push({ p, t: hurry(b0, 0.01), d: 3.92, v: hum(v, 3) });
      if (sec === 'C') vln1.push({ p: p + 12, t: hurry(b0 + 0.03, 0.01), d: 3.9, v: hum(v - 12, 3) });
    }
    // 第二聲部（中提琴）：晚兩小節、低八度 —— 這就是「卡農」的模仿
    if (bar >= 6) {
      const p = gr + 12;
      const v = sec === 'A' ? 50 : sec === 'B' ? 60 : 72;
      vln2.push({ p, t: hurry(b0 + 0.02, 0.012), d: 3.92, v: hum(v, 3) });
    }

    // 鋼琴：分解和弦。A/B 段八分音符，C 段十六分音符
    const tones = chordNotes(root, iv, 4);
    const pattern = sec === 'C' ? [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1, 0, 2, 3, 1] : [0, 1, 2, 1, 3, 1, 2, 1];
    const step = 4 / pattern.length;
    pattern.forEach((k, i) => {
      const n = k === 0 ? gr + 12 : tones[(k - 1) % 3] + (k === 3 ? 12 : 0);
      piano.push({ p: n, t: hurry(b0 + i * step, 0.008), d: step * 1.6, v: hum(sec === 'A' ? 52 : sec === 'B' ? 58 : 64, 4) });
    });

    // 電鋼琴：A 段的長音和聲
    if (sec === 'A') chordNotes(root, iv, 4).forEach((n, i) => epiano.push({ p: n, t: b0 + i * 0.02, d: 3.7, v: hum(46, 3) }));

    // 低音提琴：跟固定低音（B、C 段）
    if (bar >= 8) {
      bass.push({ p: gr, t: hurry(b0), d: 1.7, v: hum(sec === 'C' ? 98 : 92) });
      bass.push({ p: gr + 7, t: hurry(b0 + 2), d: 0.6, v: hum(80) });
      if (sec === 'C') bass.push({ p: gr + 12, t: hurry(b0 + 3), d: 0.45, v: hum(86) });
    }

    // 鼓：B 段輕輕進來，C 段才滿
    if (bar >= 8) {
      const heavy = sec === 'C';
      drums.push({ p: 36, t: b0, d: 0.2, v: hum(heavy ? 108 : 92) });
      drums.push({ p: 36, t: b0 + 2, d: 0.2, v: hum(heavy ? 102 : 88) });
      drums.push({ p: 38, t: b0 + 1, d: 0.2, v: hum(heavy ? 104 : 86) });
      drums.push({ p: 38, t: b0 + 3, d: 0.2, v: hum(heavy ? 100 : 84) });
      const hats = heavy ? 16 : 8;
      for (let k = 0; k < hats; k++) drums.push({ p: heavy ? 42 : 44, t: b0 + k * (4 / hats), d: 0.12, v: hum(k % 2 ? 58 : 72, 5) });
      if (bar === 15 || bar === 23) {
        for (let k = 0; k < 8; k++) drums.push({ p: 38, t: b0 + 2 + k * 0.25, d: 0.1, v: hum(68 + k * 7, 4) });
      }
      if (bar === 16 || bar === 23) drums.push({ p: 49, t: b0 + 3.75, d: 0.3, v: 106 });
    }

    // Pad：C 段鋪一層，把全奏撐滿
    if (sec === 'C') chordNotes(root, iv, 4).forEach((n, i) => pad.push({ p: n, t: b0 + i * 0.03, d: 3.9, v: hum(52, 3) }));
  }
  return { vln1, vln2, piano, epiano, bass, drums, pad };
}

export function seedDemo() {
  const p = store.project;
  p.name = '示範：卡農（D 大調・弦樂）';
  p.bpm = 96; p.sigNum = 4; p.sigDen = 4;
  p.tracks.length = 0;
  store.buffers.clear(); store.bufferMeta.clear();

  const parts = buildCanon();
  const add = (name, color, inst, notes, vol) => {
    const t = midiTrack(p.tracks.length, name, color, inst, notes, vol);
    p.tracks.push(t);
    return t;
  };

  const vln1 = add('小提琴 1（主旋律）', '#f78fc3', 'strings', parts.vln1, -7);
  add('小提琴 2（模仿）', '#b58bff', 'strings', parts.vln2, -11);
  add('鋼琴', '#4f9dff', 'piano', parts.piano, -10);
  add('電鋼琴', '#35c9a5', 'epiano', parts.epiano, -16);
  const bass = add('低音提琴', '#9bd35a', 'fbass', parts.bass, -7);
  const drums = add('鼓組', '#ff8a5c', 'drums', parts.drums, -10);
  add('Pad', '#4f9dff', 'pad', parts.pad, -18);

  // 弦樂主旋律：整首慢慢推上來，最後兩小節收掉（自動化示範）
  vln1.auto.volume = {
    on: true,
    points: [
      { t: 16, v: -22 }, { t: 24, v: -10 }, { t: 32, v: -7 },
      { t: 64, v: -5 }, { t: 88, v: -5 }, { t: 96, v: -26 },
    ],
  };

  // 弦樂主旋律：先修音準，再 EQ 修掉刺耳高頻（修音不是只能用在人聲）
  const tune = newFx('tune');
  tune.params.key = 2; tune.params.scale = 0; tune.params.retune = 55; tune.params.amount = 70; tune.params.vibrato = 80;
  vln1.inserts.push(tune);
  const eq = newFx('eq');
  eq.params.bands[0].on = true; eq.params.bands[0].freq = 180;
  eq.params.bands[5].gain = -1.5; eq.params.bands[6].gain = 1;
  vln1.inserts.push(eq);
  vln1.sends = [-13, -60];
  p.tracks.find(t => t.name === '小提琴 2（模仿）').sends = [-16, -60];
  p.tracks.find(t => t.name === 'Pad').sends = [-14, -60];

  const drumComp = newFx('comp');
  drumComp.params.threshold = -20; drumComp.params.ratio = 3; drumComp.params.attack = 15;
  drumComp.params.release = 140; drumComp.params.makeup = 2;
  drums.inserts.push(drumComp);
  const bassComp = newFx('comp');
  bassComp.params.threshold = -22; bassComp.params.ratio = 3.5; bassComp.params.attack = 10;
  bassComp.params.release = 150; bassComp.params.makeup = 3;
  bass.inserts.push(bassComp);

  // ── 和弦軌：卡農進行 ──────────────────────────────────────
  p.chords = [];
  for (let bar = 0; bar < BARS; bar++) {
    const [root, q] = chordAtBar(bar);
    p.chords.push({ t: bar * 4, d: 4, root, q });
  }
  p.chordKey = { key: 2, minor: false };
  p.chordView = 1;
  p.showChords = true;

  p.mastering.on = true;
  p.masterDb = 0;
  p.masterInserts = [];

  store.selection.trackId = vln1.id;
  store.selection.clipIds = new Set();
  store.dirty = false;
  store.changed('structure');
}
