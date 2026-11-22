// 自動伴奏的「風格」資料：每個風格 × 每個段落（Intro / A / B / Pre / Chorus1 / Chorus2 / Bridge / Ending / Fill…）
// 定義六個聲部的節奏型。參考高階編曲琴（Yamaha Genos／Korg Pa 系列）的結構：
//   Main A–D（主歌／副歌強度遞增）、Fill（下一小節切換段落時打的過門）、Intro / Ending（有自己的和弦進行）、Break。
// 這裡依華語流行歌的編制改名：Intro、主歌 A、主歌 B（第二段）、導歌（Pre-chorus）、副歌 1、副歌 2（加強）、間奏／橋段、尾奏。
//
// 時間單位一律是「拍」（四分音符 = 1），pattern 長度 = 一小節（4 或 3 拍；6/8 風格用 6 個八分音 = 3 拍）。
// 和聲聲部的音高不寫死，用「角色」描述，引擎依目前和弦換算：
//   bass：'R' 根音、'5' 五音、'3' 三音、'8' 高八度根音、'A' 往下一個和弦的經過音（approach）
//   和弦：'C' 整個和弦（依 voicing）、'L' 低三個音、'H' 高三個音、'1'..'4' 第幾個和弦音（由低到高）
//   琶音：'1'..'8' 和弦音序號（跨八度向上展開）
// 鼓用 GM 鼓位：36 大鼓、38 小鼓、37 鼓框、39 拍手、42 閉合鈸、44 踏鈸、46 開放鈸、49 強音鈸、51 疊音鈸、
//   45/47/48/50 中鼓、41/43 落地鼓、54 鈴鼓、56 牛鈴

export const PARTS = [
  { id: 'drums', name: '鼓', def: 'drums', defVol: -4, color: '#ff8a5c' },
  { id: 'bass', name: '貝斯', def: 'fbass', defVol: -3, color: '#9bd35a' },
  { id: 'keys', name: '鋼琴', def: 'piano', defVol: -6, color: '#4f9dff' },
  { id: 'guitar', name: '吉他', def: 'aguitar', defVol: -7, color: '#f5b83d' },
  { id: 'strings', name: '弦樂', def: 'strings', defVol: -11, color: '#b58bff' },
  { id: 'arp', name: '琶音', def: 'epiano', defVol: -10, color: '#35c9a5' },
];

// short：段落軌上顯示的短名；color：段落軌的顏色
export const SECTIONS = [
  { id: 'intro', name: 'Intro 前奏', short: '前奏', key: '1', kind: 'intro', color: '#8b95a8' },
  { id: 'verse1', name: '主歌 A', short: '主歌 A', key: '2', color: '#4f9dff' },
  { id: 'verse2', name: '主歌 B', short: '主歌 B', key: '3', color: '#3a7fd0' },
  { id: 'pre', name: '導歌 Pre', short: '導歌', key: '4', color: '#35c9a5' },
  { id: 'chorus1', name: '副歌 1', short: '副歌 1', key: '5', color: '#f5b83d' },
  { id: 'chorus2', name: '副歌 2', short: '副歌 2', key: '6', color: '#ff8a5c' },
  { id: 'bridge', name: '間奏／橋段', short: '間奏', key: '7', color: '#b58bff' },
  { id: 'break', name: 'Break 停頓', short: '停頓', key: '8', kind: 'break', color: '#ff6f7d' },
  { id: 'ending', name: 'Ending 尾奏', short: '尾奏', key: '9', kind: 'ending', color: '#8b95a8' },
];

// 速記：把「x...x...」這種字串轉成事件（每個字元 = 一個 16 分音符格；x=強、o=中、.=休止、- 延長上一個）
// 回傳 [{ t, d, v }]，t/d 以拍計
function grid(str, steps = 16, beats = 4) {
  const out = [], step = beats / steps, s = str.replace(/\s|\|/g, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === 'x' || c === 'X' || c === 'o' || c === 'g') {
      let d = step; while (s[i + 1 + Math.round(d / step - 1)] === '-') d += step;
      out.push({ t: i * step, d, v: c === 'X' ? 118 : c === 'x' ? 100 : c === 'o' ? 78 : 52 });
    }
  }
  return out;
}
const drum = (map, steps = 16, beats = 4) => Object.entries(map).flatMap(([n, s]) => grid(s, steps, beats).map(e => ({ ...e, n: +n })));
// 帶角色的事件：[[t, d, role, vel?], …]
const ev = list => list.map(([t, d, r, v = 96]) => ({ t, d, r, v }));

// ---------------- 常用片段 ----------------
const D = {
  // 抒情：踏鈸 8 分、大鼓 1 / 3&、鼓框 2 / 4
  balladSoft: drum({ 36: 'x.......x.o.....', 37: '....x.......x...', 42: 'o.o.o.o.o.o.o.o.' }),
  ballad: drum({ 36: 'x.......x.o.....', 38: '....x.......x...', 42: 'o.o.o.o.o.o.o.o.' }),
  balladBig: drum({ 36: 'x.......x.o...o.', 38: '....X.......X...', 51: 'o.o.o.o.o.o.o.o.', 49: 'x...............' }),
  pop8: drum({ 36: 'x.....o.x.o.....', 38: '....x.......x...', 42: 'o.ooo.ooo.ooo.oo' }),
  pop8Open: drum({ 36: 'x.....o.x.o...o.', 38: '....X.......X...', 46: 'o.o.o.o.o.o.o.o.', 49: 'x...............' }),
  rock8: drum({ 36: 'x.....x.x.......', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' }),
  rock8Big: drum({ 36: 'x.....x.x.x.....', 38: '....X.......X...', 51: 'x.x.x.x.x.x.x.x.', 49: 'x...............' }),
  rnb: drum({ 36: 'x......x..x.....', 38: '....x.......x...', 42: 'ooxoooxoooxoooxo' }),
  rnbBig: drum({ 36: 'x......x..x...o.', 38: '....X.......X..g', 42: 'oxoxoxoxoxoxoxox', 39: '....x.......x...' }),
  folk: drum({ 36: 'x.......x.......', 37: '....x.......x...', 54: '..o...o...o...o.' }),
  folkBig: drum({ 36: 'x.....o.x.o.....', 38: '....x.......x...', 54: 'o.o.o.o.o.o.o.o.' }),
  // 6/8（3 拍 = 6 個八分音；12 格 = 16 分音）
  waltz: drum({ 36: 'x...........', 37: '......x.....', 42: 'o.o.o.o.o.o.' }, 12, 3),
  waltzBig: drum({ 36: 'x.....o.....', 38: '......X.....', 51: 'o.o.o.o.o.o.', 49: 'x...........' }, 12, 3),
};
// 過門（最後一小節換成這個）
const FILL = {
  soft: drum({ 36: 'x.......x.......', 37: '....x...........', 45: '........o.o.....', 47: '............o.o.', 42: 'o.o.o.o.........' }),
  tom: drum({ 36: 'x...............', 38: '....x.....oo....', 50: '........x.......', 47: '..........x.....', 45: '............x.x.', 43: '..............x.', 42: 'o.o.o.o.........' }),
  snare: drum({ 36: 'x.......x.......', 38: '....x...xxoxxxXX', 42: 'o.o.o.o.........' }),
  build: drum({ 36: 'x...x...x...x...', 38: 'x.x.x.x.xxxxXXXX', 49: '................' }),
  rnb: drum({ 36: 'x......x........', 38: '....x...o.o.xoxX', 42: 'oxoxoxox........', 39: '............x...' }),
  waltz: drum({ 36: 'x...........', 38: '......x.x.xx', 45: '........x...', 43: '..........x.' }, 12, 3),
  stop: drum({ 36: 'x...............', 49: 'X...............', 38: 'X...............' }),
};

// 貝斯
const B = {
  whole: ev([[0, 3.8, 'R', 96]]),
  half: ev([[0, 1.9, 'R', 100], [2, 1.9, '5', 88]]),
  balladRun: ev([[0, 1.5, 'R', 100], [1.5, 0.5, 'R', 80], [2, 1.5, '5', 90], [3.5, 0.5, 'A', 80]]),
  pop: ev([[0, 0.9, 'R', 104], [1.5, 0.45, 'R', 82], [2, 0.9, '5', 96], [3, 0.45, '8', 84], [3.5, 0.45, 'A', 84]]),
  rock: ev([[0, 0.45, 'R', 104], [0.5, 0.45, 'R', 84], [1, 0.45, 'R', 92], [1.5, 0.45, 'R', 84], [2, 0.45, 'R', 100], [2.5, 0.45, 'R', 84], [3, 0.45, '5', 90], [3.5, 0.45, 'A', 86]]),
  rnb: ev([[0, 0.7, 'R', 104], [0.75, 0.2, 'R', 70], [1.75, 0.25, '8', 80], [2, 0.7, '5', 96], [3, 0.4, '3', 84], [3.5, 0.45, 'A', 84]]),
  folk: ev([[0, 1.4, 'R', 100], [1.5, 0.45, '5', 84], [2, 1.4, '5', 92], [3.5, 0.45, 'A', 84]]),
  waltz: ev([[0, 1.4, 'R', 100], [1.5, 1.4, '5', 86]]),
  waltzRun: ev([[0, 1.4, 'R', 100], [1.5, 0.45, '5', 86], [2, 0.45, '8', 80], [2.5, 0.45, 'A', 82]]),
};

// 鋼琴（和弦）
const K = {
  pad: ev([[0, 3.9, 'C', 70]]),
  half: ev([[0, 1.9, 'C', 78], [2, 1.9, 'C', 70]]),
  ballad8: ev([[0, 0.5, 'L', 72], [0.5, 0.5, 'H', 60], [1, 0.5, 'L', 62], [1.5, 0.5, 'H', 60], [2, 0.5, 'L', 68], [2.5, 0.5, 'H', 58], [3, 0.5, 'L', 60], [3.5, 0.5, 'H', 58]]),
  pop: ev([[0, 1.4, 'C', 84], [1.5, 0.45, 'C', 66], [2, 0.9, 'C', 78], [3, 0.4, 'C', 66], [3.5, 0.45, 'C', 72]]),
  rock: ev([[0, 0.45, 'C', 88], [0.5, 0.45, 'C', 70], [1, 0.45, 'C', 80], [1.5, 0.45, 'C', 70], [2, 0.45, 'C', 84], [2.5, 0.45, 'C', 70], [3, 0.45, 'C', 80], [3.5, 0.45, 'C', 70]]),
  rnb: ev([[0, 0.7, 'C', 80], [1.75, 0.2, 'H', 64], [2, 0.7, 'C', 74], [3.25, 0.2, 'H', 60], [3.5, 0.45, 'C', 70]]),
  waltz: ev([[0, 0.45, 'L', 72], [0.5, 0.45, 'H', 58], [1, 0.45, 'H', 56], [1.5, 0.45, 'L', 66], [2, 0.45, 'H', 56], [2.5, 0.45, 'H', 54]]),
};
// 吉他：刷弦（'S↓' 'S↑'）與分散和弦（'P1'.. 第幾弦）
const G = {
  strum: ev([[0, 0.9, 'D', 92], [1, 0.45, 'D', 72], [1.5, 0.45, 'U', 66], [2.5, 0.45, 'U', 70], [3, 0.45, 'D', 80], [3.5, 0.45, 'U', 66]]),   // 經典民謠刷法 ↓ ↓↑ ↑↓↑
  strumSoft: ev([[0, 1.9, 'D', 78], [2, 1.9, 'D', 66]]),
  strum16: ev([[0, 0.24, 'D', 92], [0.5, 0.24, 'U', 60], [0.75, 0.24, 'D', 66], [1, 0.24, 'D', 84], [1.5, 0.24, 'U', 64], [2, 0.24, 'D', 88], [2.5, 0.24, 'U', 62], [2.75, 0.24, 'U', 58], [3, 0.24, 'D', 82], [3.5, 0.24, 'U', 64]]),
  pick: ev([[0, 0.5, 'P1', 84], [0.5, 0.5, 'P3', 64], [1, 0.5, 'P4', 66], [1.5, 0.5, 'P5', 62], [2, 0.5, 'P2', 76], [2.5, 0.5, 'P3', 62], [3, 0.5, 'P4', 64], [3.5, 0.5, 'P5', 60]]),
  rockPower: ev([[0, 0.45, 'PW', 96], [0.5, 0.45, 'PW', 76], [1, 0.45, 'PW', 84], [1.5, 0.45, 'PW', 76], [2, 0.45, 'PW', 92], [2.5, 0.45, 'PW', 76], [3, 0.45, 'PW', 84], [3.5, 0.45, 'PW', 78]]),
  rnbChop: ev([[1, 0.2, 'H', 78], [3, 0.2, 'H', 78], [3.75, 0.15, 'H', 60]]),
  waltzPick: ev([[0, 0.5, 'P1', 84], [0.5, 0.5, 'P3', 62], [1, 0.5, 'P4', 64], [1.5, 0.5, 'P5', 66], [2, 0.5, 'P4', 60], [2.5, 0.5, 'P3', 58]]),
};
// 弦樂（長音鋪底）
const S = {
  pad: ev([[0, 4, 'C', 64]]),
  padHi: ev([[0, 4, 'H', 72]]),
  swell: ev([[0, 2, 'C', 56], [2, 2, 'H', 70]]),
  waltz: ev([[0, 3, 'C', 62]]),
};
// 琶音（16 分音符向上、8 分音符抒情）
const A = {
  up8: ev([[0, 0.5, '1', 70], [0.5, 0.5, '2', 58], [1, 0.5, '3', 62], [1.5, 0.5, '4', 58], [2, 0.5, '5', 66], [2.5, 0.5, '4', 56], [3, 0.5, '3', 60], [3.5, 0.5, '2', 56]]),
  up16: ev(Array.from({ length: 16 }, (_, i) => [i * 0.25, 0.25, String([1, 2, 3, 4, 5, 4, 3, 2][i % 8]), i % 4 === 0 ? 72 : 56])),
  sparkle: ev([[0, 0.5, '5', 62], [0.75, 0.5, '6', 54], [1.5, 0.5, '7', 58], [2.5, 0.5, '6', 52], [3, 0.5, '8', 60]]),
  waltz: ev([[0, 0.5, '1', 66], [0.5, 0.5, '3', 54], [1, 0.5, '5', 58], [1.5, 0.5, '6', 54], [2, 0.5, '5', 52], [2.5, 0.5, '3', 50]]),
};

// 一個段落：{ parts: { drums, bass, keys, guitar, strings, arp }, fill: 過門鼓, chords?: Intro/Ending 用的和弦進行（級數）, bars? }
//   chords：以目前和弦為 I，例如 ['I', 'IV', 'V', 'I']；每個小節一個（Intro / Ending 照著跑，不看左手）
// 每個聲部可以是 null（這段不出聲）

// 級數 → 和弦（以目前的和弦根音為 I；小寫 = 小三和弦，例如 vi、ii、iii）
const DEG = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
export function romanToChord(rn, root) {
  const flat = rn.startsWith('b'), core = rn.replace(/^b/, '').replace(/7$/, '');
  const base = DEG[core.toUpperCase()] ?? 0;
  const minor = core === core.toLowerCase();
  const seventh = rn.endsWith('7');
  return { root: (root + base - (flat ? 1 : 0) + 12) % 12, q: seventh ? (minor ? 'm7' : '7') : minor ? 'min' : 'maj' };
}

const mk = (o) => o;

export const STYLES = [
  {
    id: 'cballad', name: '華語抒情（8 分鋼琴）', bpm: 72, sig: 4, desc: '慢板抒情歌：主歌鋼琴分解、副歌加鼓與弦樂鋪滿，副歌 2 吉他刷弦。',
    sections: {
      intro: mk({ bars: 4, chords: ['I', 'V', 'vi', 'IV'], parts: { keys: K.ballad8, arp: A.sparkle, strings: S.pad }, fill: FILL.soft, endFill: true }),
      verse1: mk({ parts: { keys: K.ballad8, bass: B.whole, drums: null, strings: null }, fill: FILL.soft }),
      verse2: mk({ parts: { keys: K.ballad8, bass: B.half, drums: D.balladSoft, guitar: G.pick }, fill: FILL.soft }),
      pre: mk({ parts: { keys: K.half, bass: B.half, drums: D.balladSoft, strings: S.swell, arp: A.up8 }, fill: FILL.build }),
      chorus1: mk({ parts: { keys: K.pop, bass: B.balladRun, drums: D.ballad, strings: S.pad, guitar: G.strumSoft }, fill: FILL.tom }),
      chorus2: mk({ parts: { keys: K.pop, bass: B.balladRun, drums: D.balladBig, strings: S.padHi, guitar: G.strum, arp: A.up16 }, fill: FILL.tom }),
      bridge: mk({ parts: { keys: K.half, bass: B.half, drums: D.ballad, strings: S.padHi, arp: A.up8 }, fill: FILL.build }),
      break: mk({ parts: { drums: FILL.stop, bass: ev([[0, 0.5, 'R', 100]]), keys: ev([[0, 0.5, 'C', 96]]), strings: ev([[0, 1, 'C', 80]]) } }),
      ending: mk({ bars: 4, chords: ['IV', 'V', 'iii', 'vi'], lastChord: 'I', parts: { keys: K.ballad8, strings: S.pad, bass: B.whole, arp: A.sparkle } }),
    },
  },
  {
    id: 'cpop', name: '華語流行（中板 8 Beat）', bpm: 92, sig: 4, desc: '中板流行歌：主歌簡單、副歌開放鈸與 16 分刷弦，標準的「四大天王」到現代流行編曲。',
    sections: {
      intro: mk({ bars: 4, chords: ['vi', 'IV', 'I', 'V'], parts: { keys: K.pop, drums: D.pop8, bass: B.pop, arp: A.up16 }, fill: FILL.tom, endFill: true }),
      verse1: mk({ parts: { keys: K.half, bass: B.half, drums: D.balladSoft, guitar: G.pick }, fill: FILL.soft }),
      verse2: mk({ parts: { keys: K.pop, bass: B.pop, drums: D.pop8, guitar: G.pick }, fill: FILL.snare }),
      pre: mk({ parts: { keys: K.pop, bass: B.pop, drums: D.pop8, strings: S.swell, guitar: G.strumSoft }, fill: FILL.build }),
      chorus1: mk({ parts: { keys: K.pop, bass: B.pop, drums: D.pop8Open, strings: S.pad, guitar: G.strum16 }, fill: FILL.tom }),
      chorus2: mk({ parts: { keys: K.pop, bass: B.pop, drums: D.pop8Open, strings: S.padHi, guitar: G.strum16, arp: A.up16 }, fill: FILL.tom }),
      bridge: mk({ parts: { keys: K.half, bass: B.half, drums: D.ballad, strings: S.padHi, arp: A.up8 }, fill: FILL.build }),
      break: mk({ parts: { drums: FILL.stop, bass: ev([[0, 0.5, 'R', 100]]), keys: ev([[0, 0.5, 'C', 100]]), guitar: ev([[0, 0.5, 'D', 100]]) } }),
      ending: mk({ bars: 4, chords: ['IV', 'V', 'IV', 'V'], lastChord: 'I', parts: { keys: K.half, strings: S.pad, bass: B.half, drums: D.ballad, guitar: G.strumSoft } }),
    },
  },
  {
    id: 'folk', name: '校園民謠（木吉他）', bpm: 96, sig: 4, desc: '木吉他刷弦為主，鈴鼓與鼓框，適合民謠、Coffee shop、自彈自唱。',
    sections: {
      intro: mk({ bars: 2, chords: ['I', 'V'], parts: { guitar: G.pick }, fill: FILL.soft, endFill: false }),
      verse1: mk({ parts: { guitar: G.pick, bass: B.whole }, fill: FILL.soft }),
      verse2: mk({ parts: { guitar: G.strum, bass: B.folk, drums: D.folk }, fill: FILL.soft }),
      pre: mk({ parts: { guitar: G.strum, bass: B.folk, drums: D.folk, keys: K.pad }, fill: FILL.snare }),
      chorus1: mk({ parts: { guitar: G.strum, bass: B.folk, drums: D.folkBig, keys: K.half, strings: S.pad }, fill: FILL.tom }),
      chorus2: mk({ parts: { guitar: G.strum16, bass: B.pop, drums: D.folkBig, keys: K.pop, strings: S.padHi }, fill: FILL.tom }),
      bridge: mk({ parts: { guitar: G.pick, bass: B.half, keys: K.pad, arp: A.up8 }, fill: FILL.soft }),
      break: mk({ parts: { guitar: ev([[0, 0.5, 'D', 104]]), bass: ev([[0, 0.5, 'R', 100]]), drums: FILL.stop } }),
      ending: mk({ bars: 2, chords: ['IV', 'V'], lastChord: 'I', parts: { guitar: G.strumSoft, bass: B.whole } }),
    },
  },
  {
    id: 'rock', name: '流行搖滾（8 Beat Rock）', bpm: 128, sig: 4, desc: '樂團感：八分音貝斯、強力和弦，副歌開疊音鈸。',
    sections: {
      intro: mk({ bars: 4, chords: ['I', 'bVII', 'IV', 'I'], parts: { guitar: G.rockPower, bass: B.rock, drums: D.rock8 }, fill: FILL.snare, endFill: true }),
      verse1: mk({ parts: { guitar: G.rnbChop, bass: B.rock, drums: D.rock8 }, fill: FILL.snare }),
      verse2: mk({ parts: { guitar: G.rockPower, bass: B.rock, drums: D.rock8, keys: K.pad }, fill: FILL.snare }),
      pre: mk({ parts: { guitar: G.rockPower, bass: B.rock, drums: D.rock8, keys: K.half, strings: S.swell }, fill: FILL.build }),
      chorus1: mk({ parts: { guitar: G.rockPower, bass: B.rock, drums: D.rock8Big, keys: K.rock, strings: S.pad }, fill: FILL.tom }),
      chorus2: mk({ parts: { guitar: G.rockPower, bass: B.rock, drums: D.rock8Big, keys: K.rock, strings: S.padHi, arp: A.up16 }, fill: FILL.tom }),
      bridge: mk({ parts: { guitar: G.strumSoft, bass: B.half, drums: D.pop8, keys: K.half, strings: S.padHi }, fill: FILL.build }),
      break: mk({ parts: { drums: FILL.stop, guitar: ev([[0, 1, 'PW', 110]]), bass: ev([[0, 1, 'R', 110]]) } }),
      ending: mk({ bars: 2, chords: ['IV', 'V'], lastChord: 'I', parts: { guitar: G.rockPower, bass: B.rock, drums: D.rock8Big } }),
    },
  },
  {
    id: 'rnb', name: 'R&B／靈魂樂（Soul）', bpm: 84, sig: 4, desc: '切分貝斯、鼓框與拍手，電鋼琴和弦，副歌加弦樂。',
    sections: {
      intro: mk({ bars: 4, chords: ['IV', 'iii', 'ii', 'V'], parts: { keys: K.rnb, arp: A.sparkle }, fill: FILL.rnb, endFill: true }),
      verse1: mk({ parts: { keys: K.rnb, bass: B.rnb, drums: D.rnb }, fill: FILL.rnb }),
      verse2: mk({ parts: { keys: K.rnb, bass: B.rnb, drums: D.rnb, guitar: G.rnbChop }, fill: FILL.rnb }),
      pre: mk({ parts: { keys: K.rnb, bass: B.rnb, drums: D.rnb, strings: S.swell, guitar: G.rnbChop }, fill: FILL.build }),
      chorus1: mk({ parts: { keys: K.rnb, bass: B.rnb, drums: D.rnbBig, strings: S.pad, guitar: G.rnbChop }, fill: FILL.rnb }),
      chorus2: mk({ parts: { keys: K.rnb, bass: B.rnb, drums: D.rnbBig, strings: S.padHi, guitar: G.rnbChop, arp: A.up16 }, fill: FILL.rnb }),
      bridge: mk({ parts: { keys: K.pad, bass: B.half, drums: D.balladSoft, strings: S.padHi, arp: A.up8 }, fill: FILL.build }),
      break: mk({ parts: { drums: FILL.stop, keys: ev([[0, 0.5, 'C', 100]]), bass: ev([[0, 0.5, 'R', 100]]) } }),
      ending: mk({ bars: 4, chords: ['IV', 'iii', 'ii', 'V'], lastChord: 'I', parts: { keys: K.rnb, strings: S.pad, bass: B.half } }),
    },
  },
  {
    id: 'waltz', name: '6/8 抒情（搖擺慢歌）', bpm: 60, sig: 3, desc: '6/8 拍抒情：八分音分解和弦與三連音感的鼓，副歌加弦樂。（一小節記為 3 拍）',
    sections: {
      intro: mk({ bars: 2, chords: ['I', 'IV'], parts: { keys: K.waltz, arp: A.waltz }, fill: FILL.waltz, endFill: false }),
      verse1: mk({ parts: { keys: K.waltz, bass: B.waltz }, fill: FILL.waltz }),
      verse2: mk({ parts: { keys: K.waltz, bass: B.waltz, drums: D.waltz, guitar: G.waltzPick }, fill: FILL.waltz }),
      pre: mk({ parts: { keys: K.waltz, bass: B.waltzRun, drums: D.waltz, strings: S.waltz }, fill: FILL.waltz }),
      chorus1: mk({ parts: { keys: K.waltz, bass: B.waltzRun, drums: D.waltzBig, strings: S.waltz, guitar: G.waltzPick }, fill: FILL.waltz }),
      chorus2: mk({ parts: { keys: K.waltz, bass: B.waltzRun, drums: D.waltzBig, strings: S.waltz, guitar: G.waltzPick, arp: A.waltz }, fill: FILL.waltz }),
      bridge: mk({ parts: { keys: K.waltz, bass: B.waltz, strings: S.waltz, arp: A.waltz }, fill: FILL.waltz }),
      break: mk({ parts: { keys: ev([[0, 0.5, 'C', 100]]), bass: ev([[0, 0.5, 'R', 100]]), drums: drum({ 36: 'x...........', 49: 'X...........' }, 12, 3) } }),
      ending: mk({ bars: 2, chords: ['IV', 'V'], lastChord: 'I', parts: { keys: K.waltz, strings: S.waltz, bass: B.waltz } }),
    },
  },
];
export const styleById = id => STYLES.find(s => s.id === id) || STYLES[0];
