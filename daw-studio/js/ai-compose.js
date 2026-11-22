// 智慧創作（第三步）：從零寫一首歌的骨架——和弦進行＋主旋律
// - 和弦：從華語流行最常見的進行（卡農、1-5-6-4、4-5-3-6 王道、6-4-1-5…）挑出主歌／導歌／副歌／橋段，組成曲式
//   同一種段落重複時用同一組和弦；最後一輪副歌收在主和弦
// - 旋律走「安全」路線（好唱、不會怪）：
//   ・正拍與長音一定落在和弦音；弱拍可以用經過音，但要用級進接近
//   ・以五聲音階為主（4、7 級音少用）、多級進、跳進之後反向級進
//   ・節奏用 1 小節的動機重複（a b a c），第二句重複第一句或依和弦根音做模進——好記
//   ・每一句是拱形起伏；主歌音域低、副歌高 3～5 度；句尾落在穩定音，整首最後落在主音
// 全部用種子亂數，同一組種子 = 同一首，可以只換旋律或只換和弦
import { store, newTrack, newMidiClip, MAX_TRACKS } from './state.js';
import { romanToChord } from './arranger-styles.js';
import { chordPcs } from './chords.js';
import { rng } from './ai-arrange.js';
import { writePlanToSections } from './section-ui.js';

// ---------------- 和弦進行庫（級數以大調為準；小調歌 = 關係大調，主和弦是 vi）----------------
const PROG = {
  major: {
    verse: [
      { n: '卡農進行', c: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'] },
      { n: '1-5-6-4', c: ['I', 'V', 'vi', 'IV'] },
      { n: '1-6-4-5', c: ['I', 'vi', 'IV', 'V'] },
      { n: '1-3-4-5', c: ['I', 'iii', 'IV', 'V'] },
      { n: '1-3-6-4', c: ['I', 'iii', 'vi', 'IV'] },
      { n: '6-4-1-5', c: ['vi', 'IV', 'I', 'V'] },
      { n: '1-5-4-5', c: ['I', 'V', 'IV', 'V'] },
    ],
    pre: [
      { n: '4-5-3-6', c: ['IV', 'V', 'iii', 'vi'] },
      { n: '2-3-4-5', c: ['ii', 'iii', 'IV', 'V'] },
      { n: '4-3-2-5', c: ['IV', 'iii', 'ii', 'V'] },
      { n: '6-3-4-5', c: ['vi', 'iii', 'IV', 'V'] },
      { n: '4-5-4-5', c: ['IV', 'V', 'IV', 'V'] },
    ],
    chorus: [
      { n: '4-5-3-6 王道進行', c: ['IV', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'I'] },
      { n: '1-5-6-4', c: ['I', 'V', 'vi', 'IV'] },
      { n: '卡農進行', c: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'] },
      { n: '1-5-6-3-4-5（副屬）', c: ['I', 'V', 'vi', 'III', 'IV', 'V', 'I', 'I'] },
      { n: '6-4-5-1', c: ['vi', 'IV', 'V', 'I'] },
      { n: '4-5-6-1', c: ['IV', 'V', 'vi', 'I'] },
    ],
    bridge: [
      { n: '6-4-5-1', c: ['vi', 'IV', 'V', 'I'] },
      { n: '2-5-3-6', c: ['ii', 'V', 'iii', 'vi'] },
      { n: '4-4m-1', c: ['IV', 'iv', 'I', 'I'] },
      { n: '6-5-4-5', c: ['vi', 'V', 'IV', 'V'] },
    ],
  },
  minor: {
    verse: [
      { n: '6-4-5-6', c: ['vi', 'IV', 'V', 'vi'] },
      { n: '6-4-1-5', c: ['vi', 'IV', 'I', 'V'] },
      { n: '6-5-4-5', c: ['vi', 'V', 'IV', 'V'] },
      { n: '6-3-4-5', c: ['vi', 'iii', 'IV', 'V'] },
      { n: '6-2-5-6', c: ['vi', 'ii', 'V', 'vi'] },
    ],
    pre: [
      { n: '4-5-3-6', c: ['IV', 'V', 'iii', 'vi'] },
      { n: '2-3-4-5', c: ['ii', 'iii', 'IV', 'V'] },
      { n: '4-5-4-3', c: ['IV', 'V', 'IV', 'III'] },
    ],
    chorus: [
      { n: '4-5-3-6 王道進行', c: ['IV', 'V', 'iii', 'vi'] },
      { n: '6-4-1-5', c: ['vi', 'IV', 'I', 'V'] },
      { n: '4-5-6-6', c: ['IV', 'V', 'vi', 'vi'] },
      { n: '6-4-5-3', c: ['vi', 'IV', 'V', 'III'] },
    ],
    bridge: [
      { n: '4-5-1-6', c: ['IV', 'V', 'I', 'vi'] },
      { n: '2-5-1-1', c: ['ii', 'V', 'I', 'I'] },
    ],
  },
};

export const FORMS = [
  { id: 'short', name: '短版：主歌＋副歌（16 小節）', secs: [['verse', 8], ['chorus', 8]] },
  { id: 'std', name: '標準：主歌－導歌－副歌 ×2（40 小節）', secs: [['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8]] },
  { id: 'full', name: '完整：再加橋段與最後副歌（52 小節）', secs: [['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['bridge', 4], ['chorus', 8]] },
];
export const SEC_LABEL = { verse: '主歌', pre: '導歌', chorus: '副歌', bridge: '橋段' };

// ---------------- 節奏動機（1 小節，4/4；[起點拍, 長度]）----------------
const RHY_BUSY = [
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
  [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
  [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
  [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
  [[0, 0.5], [0.5, 1], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
  [[1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5]],
];
const RHY_END = [
  [[0, 1], [1, 1], [2, 2]],
  [[0, 0.5], [0.5, 0.5], [1, 2.5]],
  [[0, 1.5], [1.5, 0.5], [2, 1.5]],
  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 2]],
  [[0, 3]],
];
const RHY_LONG = [   // 副歌：長音多一點，比較好「放」
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0, 1], [1, 0.5], [1.5, 2]],
  [[0, 2], [2, 1], [3, 1]],
];

const SCALE = [0, 2, 4, 5, 7, 9, 11];

// ---------------- 使用者自己寫的和弦進行 ----------------
// 一個記號 = 一小節；用「+」把兩個和弦放進同一小節（各半小節）。分隔可以用空白、逗號、「-」或「|」
// 三種寫法都可以混用：
//   數字（首調）：1 5 6m 4、2m7 5 1、b7、4m、3M（大三）——沒寫性質就用調內和弦
//   級數：I V vi IV、ii7 V7 I、bVII、III
//   音名：C G Am F、F#m7、Bb、Eb/G（斜線後面的低音先忽略）
// 小調歌照華語簡譜的習慣以關係大調為準：6m 是主和弦（A 小調 = 6m 4 5 1 → Am F G C）
const DIAT_Q = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ROMAN_N = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
const accidental = a => (a === 'b' || a === '♭' ? -1 : a === '#' || a === '♯' ? 1 : 0);
// 性質字尾 → 和弦性質；base：'min' | 'maj' | null（null = 照調內）；看不懂回傳 undefined
function quality(x, base) {
  if (x === '') return base;
  if (/^(maj7|M7|Δ7?|△7?)$/.test(x)) return 'maj7';
  if (/^(m7|min7|-7)$/.test(x)) return 'm7';
  if (x === '7') return base === 'min' ? 'm7' : '7';
  if (/^(m|min|-)$/.test(x)) return 'min';
  if (/^(M|maj)$/.test(x)) return 'maj';
  if (/^(dim|°|o)$/.test(x)) return 'dim';
  if (x === 'aug' || x === '+5') return 'aug';
  if (/^sus4?$/.test(x)) return 'sus4';
  if (x === 'sus2') return 'sus2';
  if (/^(add9|9|2|add2)$/.test(x)) return base === 'min' ? 'min' : base || 'maj';   // 色彩音先當三和弦
  return undefined;
}
function parseChord(tok, major) {
  tok = tok.replace(/\/.*$/, '');
  let m = tok.match(/^([b#♭♯]?)([1-7])(.*)$/);
  if (m) {
    const deg = Number(m[2]) - 1, root = (major + SCALE[deg] + accidental(m[1]) + 12) % 12;
    let q = quality(m[3], null);
    if (q === undefined) return null;
    if (q === null) q = m[1] ? 'maj' : DIAT_Q[deg];
    if (q === '7' && !m[1] && DIAT_Q[deg] === 'min') q = 'm7';   // 2 7 → 2m7（調內）
    return { root, q };
  }
  m = tok.match(/^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (m) {
    const deg = ROMAN_N[m[2].toLowerCase()], lower = m[2] === m[2].toLowerCase();
    const root = (major + SCALE[deg] + accidental(m[1]) + 12) % 12;
    if (lower && /^(°|o|dim)$/.test(m[3])) return { root, q: 'dim' };
    const q = quality(m[3], lower ? 'min' : 'maj');
    return q ? { root, q } : null;
  }
  m = tok.match(/^([A-G])([b#♭♯]?)(.*)$/);
  if (m) {
    const q = quality(m[3], 'maj');
    return q ? { root: (LETTER[m[1]] + accidental(m[2]) + 12) % 12, q } : null;
  }
  return null;
}
// 回傳 { bars: [[{root,q}], …], bad: [看不懂的記號] }
export function parseProgression(text, key, minor) {
  const major = minor ? (key + 3) % 12 : key;
  const bars = [], bad = [];
  const toks = String(text || '').replace(/[，、｜]/g, ',').replace(/＋/g, '+')
    .split(/[\s,|]+/).flatMap(t => t.split(/(?<=[0-9A-Za-z#♯♭°])-(?=[b#♭♯]?[0-9A-GIViv])/)).map(t => t.trim()).filter(Boolean);
  for (const t of toks) {
    const bar = [];
    for (const x of t.split('+').filter(Boolean).slice(0, 2)) { const c = parseChord(x, major); if (c) bar.push(c); else bad.push(x); }
    if (bar.length) bars.push(bar);
  }
  return { bars, bad };
}

// 給介面用：每種段落可以選的進行（這種段落常用的放前面，其他段落的也可以拿來用）
export function progressionChoices(type, minor) {
  const lib = PROG[minor ? 'minor' : 'major'], seen = new Set(), own = [], other = [];
  for (const [t, list] of Object.entries(lib)) for (const x of list) {
    const id = x.n + '@' + x.c.join(' ');
    if (seen.has(id)) continue;
    seen.add(id);
    (t === type ? own : other).push({ id, name: x.n, rns: x.c });
  }
  return { own, other };
}

function expand(tpl, bars) {
  const out = [];
  for (let i = 0; i < bars; i++) out.push(tpl[i % tpl.length]);
  return out;
}

/**
 * o: { key: 0..11, minor, bpm, form, register: -1|0|1, variation 0..1, startBar, progSeed, melSeed, intro, ending }
 */
export function compose(o) {
  const minor = !!o.minor, key = ((o.key % 12) + 12) % 12;
  const major = minor ? (key + 3) % 12 : key;
  const lib = PROG[minor ? 'minor' : 'major'];
  const form = FORMS.find(f => f.id === o.form) || FORMS[1];
  const RP = rng(o.progSeed || 1), RM = rng(o.melSeed || 1);
  const V = Math.max(0, Math.min(1, o.variation ?? 0.5));
  const bpb = 4, startBar = o.startBar ?? 4;
  const tonicRn = minor ? 'vi' : 'I';
  const pick = (arr, R) => arr[Math.floor(R() * arr.length)];

  // 每一種段落挑一組進行（同種段落重複時沿用）
  // o.progs[段落] = { kind: 'lib', id } | { kind: 'custom', text }；沒指定 = 隨機
  const user = o.progs || {}, chosen = {};
  const allLib = Object.values(lib).flat();
  for (const [s] of form.secs) {
    if (chosen[s]) continue;
    const u = user[s];
    if (u && u.kind === 'custom') {
      const r = parseProgression(u.text, key, minor);
      if (r.bars.length) { chosen[s] = { n: '自訂', bars: r.bars, custom: true }; continue; }
    }
    if (u && u.kind === 'lib') {
      const x = allLib.find(y => y.n + '@' + y.c.join(' ') === u.id);
      if (x) { chosen[s] = { ...x, locked: true }; continue; }
    }
    chosen[s] = pick(lib[s], RP);
  }
  // 隨機挑的：導歌不要跟副歌同一組；主歌跟副歌也盡量不同（使用者指定的不動）
  const free = x => x && !x.locked && !x.custom;
  if (free(chosen.pre) && chosen.chorus && chosen.pre.n === chosen.chorus.n) chosen.pre = lib.pre.find(x => x.n !== chosen.chorus.n) || chosen.pre;
  if (free(chosen.verse) && chosen.verse.n === chosen.chorus?.n) chosen.verse = lib.verse.find(x => x.n !== chosen.chorus.n) || chosen.verse;

  // 攤開成每小節的級數
  const sections = [];
  let bar = startBar;
  const lastChorus = form.secs.map(x => x[0]).lastIndexOf('chorus');
  form.secs.forEach(([s, n0], i) => {
    const ch = chosen[s];
    let barList;
    if (ch.custom) {
      // 自己寫的：照寫的走、不自動改結尾；寫得比段落長就把段落拉長（湊成 4 的倍數）
      barList = expand(ch.bars, Math.max(n0, Math.ceil(ch.bars.length / 4) * 4));
    } else {
      const n = n0, rns = expand(ch.c, n);
      // 結尾自動修正（導歌停在 V、最後副歌 V → 主和弦）只用在隨機挑的；使用者指定的照原樣
      if (!ch.locked) {
        if (s === 'pre' && !['V', 'IV', 'III'].includes(rns[n - 1])) rns[n - 1] = 'V';
        if (i === lastChorus || i === form.secs.length - 1) {
          if (rns[n - 2] !== 'V' && rns[n - 2] !== 'IV') rns[n - 2] = 'V';
          rns[n - 1] = tonicRn;
        }
      }
      barList = rns.map(rn => [romanToChord(rn, major)]);
    }
    const round = form.secs.slice(0, i).filter(x => x[0] === s).length;
    sections.push({ type: s, bar, bars: barList.length, barChords: barList, prog: ch.n, custom: !!ch.custom, locked: !!ch.locked, round, last: i === lastChorus });
    bar += barList.length;
  });
  const endBar = bar;
  const chords = [];
  for (const S of sections) S.barChords.forEach((list, k) => {
    const len = list.length > 1 ? bpb / 2 : bpb;
    list.forEach((c, j) => {
      const t = (S.bar + k) * bpb + j * len;
      const last = chords[chords.length - 1];
      if (last && last.root === c.root && last.q === c.q && Math.abs(last.t + last.d - t) < 1e-6) last.d += len;
      else chords.push({ t, d: len, root: c.root, q: c.q });
    });
  });

  // ---------------- 旋律 ----------------
  const tonicPc = minor ? key : major;
  let tonicMidi = 60 + tonicPc; if (tonicMidi > 66) tonicMidi -= 12;
  tonicMidi += (o.register || 0) * 3;
  const RANGE = { verse: [-5, 9], pre: [-3, 11], chorus: [0, 14], bridge: [-2, 12] };
  const inScale = p => SCALE.includes(((p - major) % 12 + 12) % 12);
  const degOf = p => SCALE.indexOf(((p - major) % 12 + 12) % 12);   // 0..6（大調級數）
  const chordAt = beat => chords.find(x => beat >= x.t - 1e-6 && beat < x.t + x.d - 1e-6) || chords[chords.length - 1];
  const chordOfBar = b => chordAt(b * bpb);
  const isCT = (p, c) => !!(chordPcs(c) & (1 << (((p % 12) + 12) % 12)));

  const melody = [];
  const memo = {};   // 同一種段落第二輪：直接沿用
  let prev = null, prevLeap = 0;
  const pickNote = ({ c, strong, target, lo, hi, endKind, R }) => {
    let best = null, bestCost = Infinity;
    for (let p = lo; p <= hi; p++) {
      if (!inScale(p)) continue;
      const ct = isCT(p, c), d = degOf(p);
      let cost = 0;
      if (strong && !ct) cost += 6;
      if (!strong && !ct) cost += 0.35;
      if (d === 3 || d === 6) cost += ct ? 0.25 : 0.7;   // 4、7 級音（五聲音階以外）少用
      if (prev != null) {
        const i = p - prev, a = Math.abs(i);
        cost += a === 0 ? 0.55 : a <= 2 ? 0 : a <= 4 ? 0.45 : a === 5 ? 1.1 : a === 7 ? 1.7 : 3.5 + (a - 7) * 0.6;
        if (!ct && a > 2) cost += 1.6;                         // 經過音一定用級進
        if (Math.abs(prevLeap) > 4 && Math.sign(i) === Math.sign(prevLeap)) cost += 1.4;   // 大跳之後反向
        if (a === 6 || a === 10 || a === 11) cost += 3;       // 三全音、七度不跳
      }
      cost += 0.13 * Math.abs(p - target);
      if (endKind === 'tonic' && ((p - tonicPc) % 12 + 12) % 12 !== 0) cost += 8;
      if (endKind === 'stable' && !ct) cost += 8;
      if (endKind === 'half' && ((p - tonicPc) % 12 + 12) % 12 === 0) cost += 0.8;   // 半終止：先不要回到主音
      cost += RM() * (0.25 + V * 0.9);
      if (cost < bestCost) { bestCost = cost; best = p; }
    }
    return best;
  };

  for (const S of sections) {
    const [r0, r1] = RANGE[S.type];
    const lo = Math.max(52, tonicMidi + r0), hi = Math.min(84, tonicMidi + r1);
    if (memo[S.type] && S.round > 0) {
      // 第二輪同一段：旋律一樣（真正的歌是換歌詞），最後一輪副歌的結尾照新和弦修正
      const src = memo[S.type];
      for (const n of src.notes) {
        const c = chordAt(S.bar * bpb + n.t);
        let p = n.p;
        if (n.strong && !isCT(p, c)) {
          let bestP = p, bd = 99;
          for (let q = p - 4; q <= p + 4; q++) if (inScale(q) && isCT(q, c) && Math.abs(q - p) < bd) { bd = Math.abs(q - p); bestP = q; }
          p = bestP;
        }
        melody.push({ p, t: S.bar * bpb + n.t, d: n.d, v: n.v });
      }
      if (S.last) {
        // 最後一個音：主音
        const lastN = melody[melody.length - 1];
        let bestP = lastN.p, bd = 99;
        for (let q = lastN.p - 6; q <= lastN.p + 6; q++) if (((q - tonicPc) % 12 + 12) % 12 === 0 && Math.abs(q - lastN.p) < bd) { bd = Math.abs(q - lastN.p); bestP = q; }
        lastN.p = bestP;
      }
      prev = melody[melody.length - 1]?.p ?? prev;
      continue;
    }
    // 節奏：a b a c ｜ a b e d
    const busy = S.type === 'chorus' && RM() < 0.55 ? RHY_LONG.concat(RHY_BUSY.slice(0, 3)) : RHY_BUSY;
    const a = pick(busy, RM), b = RM() < 0.5 ? pick(RHY_BUSY, RM) : pick(RHY_END, RM), e = pick(busy, RM);
    const c1 = pick(RHY_END, RM), d1 = pick(RHY_END.filter(x => x[x.length - 1][1] >= 2), RM);
    const rhythm = S.bars <= 4 ? [a, e, a, c1] : [a, b, a, c1, a, b, e, d1];
    const local = [];
    const barPitches = [];
    for (let k = 0; k < S.bars; k++) {
      const phrasePos = (k % 4 + 0.5) / 4;                   // 句子裡的位置 0..1：拱形
      const span = hi - lo;
      const lift = S.type === 'chorus' && k % 4 === 0 ? 0.1 : 0;
      const target = lo + span * (0.3 + lift) + span * 0.38 * Math.sin(Math.PI * phrasePos) - (k >= 4 && S.bars === 8 ? span * 0.05 : 0);
      // 段落可能被自訂進行拉長到 12、16 小節：節奏每 8 小節循環，最後一小節用長音收
      const pat = S.bars > 4 && k === S.bars - 1 ? d1 : rhythm[k % rhythm.length];
      // 重複：每 8 小節的第 5、6 小節沿用第 1、2 小節的音（和弦不同時，強拍修正到最近的和弦音）
      const copyFrom = S.bars >= 8 && (k % 8 === 4 || k % 8 === 5) && pat === rhythm[(k - 4) % rhythm.length] ? barPitches[k - 4] : null;
      // 模進：第 3 小節依和弦根音的級數差移動第 1 小節的音
      const seqFrom = k % 8 === 2 && RM() < 0.55 ? barPitches[k - 2] : null;
      const ps = [];
      pat.forEach(([t0, d], j) => {
        const c = chordAt((S.bar + k) * bpb + t0);   // 一小節兩個和弦時，後半拍用第二個
        const strong = t0 === 0 || t0 === 2 || d >= 1;
        const lastOfBar = j === pat.length - 1;
        let endKind = null;
        if (lastOfBar && (k % 4 === 3 || k === S.bars - 1)) endKind = k === S.bars - 1 ? (S.type === 'chorus' || S.last ? 'tonic' : 'stable') : 'half';
        let p = null;
        const src = copyFrom || seqFrom;
        if (src && src[j] != null && !endKind) {
          p = src[j];
          if (seqFrom) {
            const d2 = degOf(chordOfBar(S.bar + k).root), d0 = degOf(chordOfBar(S.bar + k - 2).root), shift = d2 - d0;
            const dg = degOf(p);
            if (dg >= 0 && d2 >= 0 && d0 >= 0) { const nd = dg + shift; p = p - SCALE[dg] + SCALE[((nd % 7) + 7) % 7] + 12 * Math.floor(nd / 7); }
            if (p > hi) p -= 12; if (p < lo) p += 12;
          }
          if (strong && !isCT(p, c)) {
            let bestP = p, bd = 99;
            for (let q = p - 4; q <= p + 4; q++) if (q >= lo && q <= hi && inScale(q) && isCT(q, c) && Math.abs(q - p) < bd) { bd = Math.abs(q - p); bestP = q; }
            p = bestP;
          }
          if (!inScale(p) || p < lo || p > hi) p = null;
        }
        if (p == null) p = pickNote({ c, strong, target, lo, hi, endKind, R: RM });
        prevLeap = prev != null ? p - prev : 0;
        prev = p;
        ps.push(p);
        const v = Math.round((strong ? 92 : 80) + (RM() * 2 - 1) * 6);
        local.push({ p, t: k * bpb + t0, d: Math.max(0.2, d * 0.94), v, strong });
      });
      barPitches.push(ps);
    }
    memo[S.type] = { notes: local };
    for (const n of local) melody.push({ p: n.p, t: S.bar * bpb + n.t, d: n.d, v: n.v });
  }

  // 自動伴奏用的段落表（帶絕對小節編號，段落軌與 generate() 都照這個對位）
  const plan = [];
  if (o.intro !== false && startBar >= 2) plan.push({ sec: 'intro', bars: Math.min(4, startBar), bar: 0, int: 0, pre: true });
  let vRound = 0;
  for (const S of sections) {
    let sec = S.type === 'verse' ? (vRound++ ? 'verse2' : 'verse1') : S.type === 'pre' ? 'pre' : S.type === 'bridge' ? 'bridge' : S.last ? 'chorus2' : 'chorus1';
    plan.push({ sec, bars: S.bars, bar: S.bar, int: S.type === 'verse' && S.round === 0 ? -1 : 0 });
  }
  if (o.ending !== false) plan.push({ sec: 'ending', bars: 0, bar: endBar, int: 0, post: true });

  return { key: { key, minor }, chords, melody, sections, plan, startBar, endBar };
}

// 寫進專案：和弦軌（取代這個範圍）＋「智慧主旋律」軌（取代上一次的 AI 旋律）
export function applyComposition(res, { bpm, instrument = 'lead' } = {}) {
  const p = store.project, bpb = p.sigNum || 4;
  if (bpb !== 4) return { err: '智慧創作目前只支援 4/4 拍，請先把拍號改成 4/4' };
  store.checkpoint();
  if (bpm) p.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
  const a = res.startBar * bpb, z = res.endBar * bpb;
  p.chords = (p.chords || []).filter(c => c.t + c.d <= a + 1e-6 || c.t >= z - 1e-6).concat(res.chords.map(c => ({ ...c }))).sort((x, y) => x.t - y.t);
  p.chordKey = { ...res.key };
  p.showChords = true;
  // 曲式也寫進段落軌，② 一鍵編曲就會照著這些段落配伴奏
  // （尾奏的 bars 0 是「用風格自己的長度」，段落軌上給它 4 小節）
  writePlanToSections(res.plan.map(s => (s.bars ? s : { ...s, bars: 4 })), bpb, false);
  let t = p.tracks.find(x => x.aiMelody);
  if (!t) {
    if (p.tracks.length >= MAX_TRACKS) return { err: '軌道已滿，刪掉一條再試' };
    t = newTrack(p.tracks.length, 'midi');
    t.name = '智慧主旋律'; t.aiMelody = true; t.color = '#ff6fa3'; t.volumeDb = -4;
    p.tracks.push(t);
  }
  t.instrument = instrument;
  t.clips = t.clips.filter(c => !c.aiComp);
  const clip = newMidiClip(a, z - a, res.melody.map(n => ({ ...n, t: n.t - a })));
  clip.name = '智慧創作旋律';
  clip.aiComp = true;
  t.clips.push(clip);
  store.changed('structure');
  store.emit('chords', {});
  return { track: t, notes: res.melody.length };
}
