// AI 配和弦：從主旋律推出和弦進行（第二步）
// 作法：旋律 → 每一格（1 小節或半小節）的音名權重 → 推調性 → 隱藏式馬可夫模型（HMM）＋ Viterbi 找最可能的和弦路徑
//   - 發射分數：旋律音落在和弦音上加分（根、三、五）；調內的經過音小扣分；調外音大扣分；正拍、長音權重較大
//   - 轉移分數：偏好華語流行常見的走法（I–V–vi–IV、IV–V–iii–vi、vi–IV–V–I、ii–V–I、III–vi 副屬和弦…）
//   - 位置分數：開頭與結尾偏好主和弦；每 4 小節樂句的最後一格偏好 V（半終止）或 I
//   - 三種「口味」各跑一次 Viterbi，給使用者挑：流行抒情、王道進行（七和弦色彩）、簡單三和弦
// 一律在「關係大調」的框架下算（小調歌 = 同一組和弦、主和弦換成 vi），流行歌的小調大多也是這樣寫的
import { store, isMidiClip } from './state.js';
import { keyFromHistogram } from './keydetect.js';
import { detectNotes } from './note-detect.js';
import { ROOTS, chordName, chordPcs } from './chords.js';

const MAJ_SCALE = [0, 2, 4, 5, 7, 9, 11];

// 和弦狀態（以大調主音 = 0）：deg 是給轉移表用的名字
const STATES = [
  { deg: 'I', r: 0, q: 'maj', cost: 0 },
  { deg: 'ii', r: 2, q: 'min', cost: -0.25 },
  { deg: 'iii', r: 4, q: 'min', cost: -0.35 },
  { deg: 'IV', r: 5, q: 'maj', cost: 0 },
  { deg: 'V', r: 7, q: 'maj', cost: 0 },
  { deg: 'vi', r: 9, q: 'min', cost: 0 },
  { deg: 'vii', r: 11, q: 'dim', cost: -2.4 },
  { deg: 'II', r: 2, q: 'maj', cost: -1.1 },     // V/V
  { deg: 'III', r: 4, q: 'maj', cost: -0.9 },    // V/vi（華語副歌很常見）
  { deg: 'I7', r: 0, q: '7', cost: -1.3 },       // V/IV
  { deg: 'iv', r: 5, q: 'min', cost: -1.3 },     // 借用小調 iv
  { deg: 'bVII', r: 10, q: 'maj', cost: -1.3 },
  { deg: 'Vsus', r: 7, q: 'sus4', cost: -1.0 },
];
const IV = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], 7: [0, 4, 7, 10], sus4: [0, 5, 7] };

// 常見走法加分（沒列到的轉移 = DEFAULT）
const MOVES = {
  'I>V': 0.6, 'I>vi': 0.5, 'I>IV': 0.45, 'I>iii': 0.3, 'I>ii': 0.2, 'I>I7': 0.4, 'I>Vsus': 0.2,
  'ii>V': 0.7, 'ii>iii': 0.25, 'ii>Vsus': 0.5, 'ii>I': 0.1, 'ii>IV': 0.1,
  'iii>vi': 0.65, 'iii>IV': 0.55, 'iii>ii': 0.2,
  'IV>V': 0.65, 'IV>I': 0.35, 'IV>iii': 0.5, 'IV>ii': 0.15, 'IV>iv': 0.45, 'IV>vi': 0.2, 'IV>Vsus': 0.45,
  'V>vi': 0.6, 'V>I': 0.65, 'V>IV': 0.2, 'V>iii': 0.3,
  'vi>IV': 0.6, 'vi>iii': 0.45, 'vi>ii': 0.4, 'vi>V': 0.3, 'vi>I': 0.15,
  'vii>iii': 0.3, 'vii>I': 0.2,
  'II>V': 0.6, 'II>Vsus': 0.5, 'II>IV': 0.1,
  'III>vi': 0.75, 'III>IV': 0.2,
  'I7>IV': 0.7,
  'iv>I': 0.55, 'iv>V': 0.2,
  'bVII>I': 0.45, 'bVII>IV': 0.3,
  'Vsus>V': 0.6, 'Vsus>I': 0.45, 'Vsus>vi': 0.3,
};
const DEFAULT = -0.55;

// 口味：可以用哪些和弦、轉移加分、要不要上七和弦色彩
const FLAVORS = [
  { id: 'pop', name: '流行抒情', desc: '最常見的走法（I–V–vi–IV、vi–IV–V–I），偶爾用副屬和弦', allow: null, extra: {}, stay: [-0.25, 0.25], color: false },
  {
    id: 'royal', name: '王道進行・七和弦', desc: '偏好 IV–V–iii–vi 與卡農進行，旋律碰到七音就加上七和弦，聽起來比較「J-pop／華語副歌」', allow: null, color: true,
    extra: { 'IV>V': 0.5, 'V>iii': 0.6, 'iii>vi': 0.4, 'vi>V': 0.25, 'vi>ii': 0.2, 'III>vi': 0.2, 'I>V': 0.2, 'V>vi': 0.2 }, stay: [-0.4, 0.15],
  },
  { id: 'simple', name: '簡單三和弦', desc: '只用 I、IV、V、vi（加 ii），和弦換得比較少，適合新手彈唱', allow: new Set(['I', 'ii', 'IV', 'V', 'vi']), extra: {}, stay: [0.15, 0.5], color: false },
];

// ---------------- 旋律 ----------------
// 回傳 [{ t, d, p, v }]（t、d 以拍計，整首的絕對位置）
export function melodyOf(trackId) {
  const t = store.track(trackId); if (!t) return [];
  const spbSec = 60 / store.project.bpm, out = [];
  for (const c of t.clips) {
    if (isMidiClip(c)) {
      for (const n of c.notes) if (n.t >= 0 && n.t < c.lengthBeats) out.push({ t: c.startBeat + n.t, d: Math.min(n.d, c.lengthBeats - n.t), p: n.p, v: n.v || 90 });
    } else {
      const b = store.buffers.get(c.bufferId); if (!b) continue;
      for (const n of detectNotes(b, c.offset, c.duration)) {
        if (n.conf < 0.3) continue;
        out.push({ t: (c.start + n.s) / spbSec, d: (n.e - n.s) / spbSec, p: Math.round(n.midi), v: 90 });
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  // 和弦軌用的旋律：同一時間有好幾個音（MIDI 軌彈了和弦）就只留最高的（主旋律通常在最上面）
  const mel = [];
  for (const n of out) {
    const last = mel[mel.length - 1];
    if (last && Math.abs(n.t - last.t) < 0.06) { if (n.p > last.p) mel[mel.length - 1] = n; continue; }
    mel.push(n);
  }
  return mel;
}

// 旋律的調性（音長加權的音名分布 → Krumhansl）
export function melodyKey(mel) {
  const h = new Array(12).fill(0);
  for (const n of mel) h[((n.p % 12) + 12) % 12] += Math.min(2, n.d) + 0.1;
  return keyFromHistogram(h);
}

// 每一格的音名權重：正拍上的音與長音比較重要
function slotWeights(mel, slot, nSlots, bpb, origin) {
  const W = Array.from({ length: nSlots }, () => new Float64Array(12));
  for (const n of mel) {
    const s = n.t - origin, e = s + n.d;
    for (let k = Math.max(0, Math.floor(s / slot)); k < nSlots && k * slot < e; k++) {
      const a = Math.max(s, k * slot), b = Math.min(e, (k + 1) * slot);
      if (b <= a) continue;
      let w = b - a;
      const onDown = Math.abs(a - k * slot) < 0.12 && a === s;                  // 這一格的第一拍就落下
      const strong = Math.abs((s % 1)) < 0.12 && Math.round(s) % 2 === 0;    // 第 1、3 拍
      if (onDown) w *= 2.2; else if (a === s && strong) w *= 1.4;
      W[k][((n.p % 12) + 12) % 12] += w;
    }
  }
  return W;
}

function emission(w, st, key) {
  let tot = 0; for (let i = 0; i < 12; i++) tot += w[i];
  if (tot < 1e-6) return 0;   // 沒有旋律：交給轉移與位置決定
  const root = (key + st.r) % 12, ivs = IV[st.q];
  let s = 0;
  for (let pc = 0; pc < 12; pc++) {
    if (!w[pc]) continue;
    const rel = (pc - root + 12) % 12, k = ivs.indexOf(rel);
    let v;
    if (k === 0) v = 1;
    else if (k === 1) v = 0.95;
    else if (k >= 2) v = 0.8;
    else if (rel === 2) v = -0.12;                      // 九音：流行歌常常停在這裡
    else if (MAJ_SCALE.includes((pc - key + 12) % 12)) v = rel === 1 || rel === 6 ? -0.75 : -0.4;   // 小二度、三全音特別不協和
    else v = -0.9;
    s += w[pc] * v;
  }
  return 4.2 * s / tot;
}

// 位置分數：第幾小節、是不是樂句的最後一格
function position(st, bar, sub, isFirst, isLast, minor) {
  const tonic = minor ? 'vi' : 'I';
  let s = 0;
  if (isFirst) s += st.deg === tonic ? 0.9 : st.deg === 'IV' || st.deg === 'vi' || st.deg === 'I' ? 0.3 : -0.3;
  if (isLast) s += st.deg === tonic ? 1.2 : st.deg === 'I' ? 0.5 : -0.4;
  const inPhrase = bar % 4;
  if (!isFirst && inPhrase === 0 && sub === 0) s += st.deg === tonic || st.deg === 'IV' || st.deg === 'I' ? 0.25 : 0;
  if (!isLast && inPhrase === 3 && sub === 1) s += st.deg === 'V' || st.deg === 'Vsus' ? 0.25 : 0;
  if (!isLast && bar % 8 === 7 && sub === 0) s += st.deg === 'V' || st.deg === 'Vsus' || st.deg === 'IV' ? 0.2 : 0;
  return s;
}

function viterbi(W, key, minor, flavor, perBar, avoid = null, pen = 0.75) {
  const states = STATES.filter(s => !flavor.allow || flavor.allow.has(s.deg));
  const n = W.length, S = states.length;
  const score = Array.from({ length: n }, () => new Float64Array(S));
  const back = Array.from({ length: n }, () => new Int16Array(S));
  const trans = (a, b, sub) => {
    if (a === b) return sub === 1 ? flavor.stay[1] : flavor.stay[0];
    const k = states[a].deg + '>' + states[b].deg;
    return (MOVES[k] ?? DEFAULT) + (flavor.extra[k] || 0);
  };
  for (let i = 0; i < n; i++) {
    const bar = Math.floor(i / perBar), sub = perBar === 2 ? i % 2 : 0;
    for (let b = 0; b < S; b++) {
      let loc = emission(W[i], states[b], key) + states[b].cost + position(states[b], bar, sub, i === 0, i === n - 1, minor);
      // 多樣性：跟前面已經給過的版本同一格同一個和弦就扣分，逼出「另一種」配法（但貼合很好的地方還是會保留）
      if (avoid) for (const prev of avoid) if (prev[i] === states[b].deg) loc -= pen;
      if (i === 0) { score[i][b] = loc; continue; }
      let best = -Infinity, arg = 0;
      for (let a = 0; a < S; a++) {
        const v = score[i - 1][a] + trans(a, b, sub);
        if (v > best) { best = v; arg = a; }
      }
      score[i][b] = best + loc; back[i][b] = arg;
    }
  }
  let arg = 0;
  for (let b = 1; b < S; b++) if (score[n - 1][b] > score[n - 1][arg]) arg = b;
  const total = score[n - 1][arg];
  const path = new Array(n);
  for (let i = n - 1; i >= 0; i--) { path[i] = states[arg]; arg = back[i][arg]; }
  return { path, total };
}

// 七和弦色彩：旋律在這一格停在七音（或屬和弦的四音）就換成七和弦
function colorize(st, w, key) {
  let tot = 0; for (let i = 0; i < 12; i++) tot += w[i];
  if (tot < 1e-6) return st.q;
  const root = (key + st.r) % 12, at = iv => w[(root + iv) % 12] / tot;
  if (st.q === 'maj' && (st.deg === 'I' || st.deg === 'IV') && at(11) > 0.18) return 'maj7';
  if (st.q === 'min' && at(10) > 0.15) return 'm7';
  if (st.deg === 'V' && at(10) > 0.12) return '7';
  if (st.deg === 'V' && at(5) > 0.25 && at(4) < 0.05) return 'sus4';
  if (st.q === 'min' && st.deg === 'ii' && at(10) > 0.08) return 'm7';
  return st.q;
}

// 旋律在和弦音上的比例（給使用者看的「貼合度」）
function fitOf(chords, mel) {
  let on = 0, all = 0, j = 0;
  for (const n of mel) {
    while (j < chords.length - 1 && chords[j].t + chords[j].d <= n.t) j++;
    const c = chords[j]; if (!c || n.t < c.t || n.t >= c.t + c.d) continue;
    const w = Math.min(2, n.d);
    all += w;
    if (chordPcs(c) & (1 << (((n.p % 12) + 12) % 12))) on += w;
  }
  return all ? on / all : 0;
}

// 主函式：回傳 { key: { key, minor }, options: [{ id, name, desc, chords, fit }], range: [startBeat, endBeat] }
// opts: { perBar: 1 | 2, key: null | { key, minor } }
export function suggestChords(mel, opts = {}) {
  const p = store.project, bpb = p.sigNum || 4;
  if (!mel.length) return null;
  const k = opts.key || melodyKey(mel);
  if (!k) return null;
  const major = k.minor ? (k.key + 3) % 12 : k.key;
  const perBar = opts.perBar === 2 ? 2 : 1, slot = bpb / perBar;
  const firstBar = Math.floor(mel[0].t / bpb + 1e-6);
  const endBeat = Math.max(...mel.map(n => n.t + n.d));
  const lastBar = Math.max(firstBar + 1, Math.ceil(endBeat / bpb - 0.25));   // 最後一個音只碰到下一小節一點點：不多算一小節
  const origin = firstBar * bpb, nSlots = (lastBar - firstBar) * perBar;
  const W = slotWeights(mel, slot, nSlots, bpb, origin);
  const toChords = (path, fl) => {
    const chords = [];
    path.forEach((st, i) => {
      const root = (major + st.r) % 12, q = fl.color ? colorize(st, W[i], major) : st.q;
      const last = chords[chords.length - 1];
      if (last && last.root === root && last.q === q) last.d += slot;
      else chords.push({ t: origin + i * slot, d: slot, root, q });
    });
    return chords;
  };
  // 每一格的「和弦名稱」序列：拿來算兩個版本差多少
  const labelsOf = (path, fl) => path.map((st, i) => st.deg + (fl.color ? colorize(st, W[i], major) : st.q));
  const diff = (A, B) => A.reduce((n, x, i) => n + (x !== B[i]), 0) / A.length;
  const options = [], given = [];
  let bestFit = 0;
  const tryFlavor = (fl, minDiff, maxDrop) => {
    let path = viterbi(W, major, k.minor, fl, perBar).path;
    let lab = labelsOf(path, fl), chords = toChords(path, fl), fit = fitOf(chords, mel);
    if (given.length) {
      // 跟前面的版本太像（旋律很明確時常發生）：逐步加重「不要跟前面一樣」的懲罰，
      // 取第一個差異 ≥ 20% 而且貼合度掉不超過 12% 的；都不行就不提供這個版本
      const ok = () => given.every(g => diff(lab, g) >= minDiff) && fit >= bestFit - maxDrop;
      for (const pen of [0.2, 0.35, 0.5, 0.75, 1, 1.4, 2]) {
        if (ok()) break;
        path = viterbi(W, major, k.minor, fl, perBar, given.map(g => g.map(x => x.replace(/(maj7|m7|maj|min|dim|sus4|7)$/, ''))), pen).path;
        lab = labelsOf(path, fl); chords = toChords(path, fl); fit = fitOf(chords, mel);
      }
      if (!ok()) return;
    }
    given.push(lab);
    bestFit = Math.max(bestFit, fit);
    options.push({ id: fl.id, name: fl.name, desc: fl.desc, chords, fit });
  };
  for (const fl of FLAVORS) tryFlavor(fl, 0.2, 0.12);
  // 旋律很明確時其他版本都太像或太不貼：放寬條件補到至少 2 個
  for (const fl of FLAVORS) if (options.length < 2 && !options.some(o => o.id === fl.id)) tryFlavor(fl, 0.12, 0.22);
  options.sort((a, b) => FLAVORS.findIndex(f => f.id === a.id) - FLAVORS.findIndex(f => f.id === b.id));
  return { key: { key: k.key, minor: k.minor }, options, range: [origin, lastBar * bpb] };
}

export const keyName = k => (k ? `${ROOTS[k.key]} ${k.minor ? '小調' : '大調'}` : '—');
export const progressionText = (chords, max = 16) => chords.slice(0, max).map(chordName).join(' – ') + (chords.length > max ? ' …' : '');
export { FLAVORS };
