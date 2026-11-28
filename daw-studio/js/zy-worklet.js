// 織音合成器（ZY Synth）— 逐樣本 DSP 核心與 AudioWorklet 處理器
//
// 為什麼要寫 Worklet：這幾種「讓音色像真的樂器」的演算法，用一般 Web Audio 節點做不出來
// （或做得不像），而且每個音都靠節點堆疊會爆掉節點數。這裡用的都是硬體／軟體合成器
// 實際在跑的作法：
//   ‧ 帶限波表振盪器：鋸齒／方波／脈衝／三角／自訂諧波各準備 9 層波表（每層諧波數減半），
//     依音高挑一層，高音自動少算諧波，不會有數位別名雜訊（PPG／Waldorf 那一派）。
//   ‧ 零延遲狀態變數濾波器（TPT SVF, Zavalishin）：截止頻率可逐樣本掃、共振不會爆；
//     串兩級＝24 dB/oct，就是 Moog／Juno 四極低通的味道。
//   ‧ FM（載波＋調變器，比例與指數包絡）：DX7 那一派，電鋼琴、鐘琴、銅管的金屬感靠它。
//   ‧ Karplus-Strong 撥弦模型：延遲線＋一階低通＋回授，鋼琴、吉他、箏、豎琴、撥弦貝斯
//     是真的「弦在震動」，不是取樣也不是硬湊的鋸齒。
//   ‧ 共振峰（formant）：三段帶通並聯，做出 a／e／i／o／u 母音；合唱、嗩吶、薩克斯風靠它。
//   ‧ 鼓：鼓皮（正弦掉音）＋雜訊（濾波）＋金屬（六個方波），三種單元組合出整組鼓。
//
// 訊息協定（主執行緒 → 這裡）：
//   { t:'patch', p }           註冊音色（一條軌第一次用到時送一次）
//   { t:'on', id, pid, n, v, at }   起音；at = AudioContext 時間（秒）；n = MIDI 音高
//   { t:'off', id, at, fast }       放音
//   { t:'kill', id } { t:'panic' }  立即消音
// 一個 node 負責一整條軌的複音：節點數固定，不隨音符數增加。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 整體輸出補償：單音目標峰值約 -9 dBFS，留給和弦與效果器的餘裕
const OUT = 3.2;

// ────────────────────────────── 波表 ──────────────────────────────
const SIZE = 1024, LEVELS = 9, HMAX = 64;
const waveCache = new Map();

// 各波形的諧波振幅（n 從 1 開始）
function harmAmp(w, n, spec) {
  switch (w) {
    case 'saw': return 1 / n;
    case 'sqr': return (n & 1) ? 1 / n : 0;
    case 'tri': return (n & 1) ? ((((n - 1) >> 1) & 1) ? -1 : 1) / (n * n) : 0;
    case 'pls': return Math.sin(Math.PI * n * (spec.pw || 0.5)) / n;   // 脈衝：pw = 工作週期
    case 'harm': return (spec.harm && spec.harm[n - 1]) || 0;          // 自訂諧波列（加法合成）
    case 'sin': default: return n === 1 ? 1 : 0;
  }
}

function buildWave(spec) {
  const levels = [];
  for (let L = 0; L < LEVELS; L++) {
    const H = Math.max(1, HMAX >> L);
    const tab = new Float32Array(SIZE + 1);
    for (let n = 1; n <= H; n++) {
      const amp = harmAmp(spec.w, n, spec);
      if (!amp) continue;
      // 用旋轉遞推算 sin(2πni/SIZE)：比每個樣本呼叫 Math.sin 快一個量級
      const step = (2 * Math.PI * n) / SIZE;
      const cs = Math.cos(step), sn = Math.sin(step);
      let c = 1, s = 0;
      for (let i = 0; i < SIZE; i++) {
        tab[i] += amp * s;
        const nc = c * cs - s * sn;
        s = s * cs + c * sn;
        c = nc;
      }
    }
    let peak = 0;
    for (let i = 0; i < SIZE; i++) { const a = tab[i] < 0 ? -tab[i] : tab[i]; if (a > peak) peak = a; }
    if (peak > 1e-6) for (let i = 0; i < SIZE; i++) tab[i] /= peak;
    tab[SIZE] = tab[0];
    levels.push(tab);
  }
  return levels;
}

function wave(spec) {
  let w = waveCache.get(spec.key);
  if (!w) { w = buildWave(spec); waveCache.set(spec.key, w); }
  return w;
}

// 依基頻挑波表層級（諧波數上限）
function levelFor(f0, sr) {
  const allowed = (0.45 * sr) / Math.max(8, f0);
  if (allowed >= HMAX) return 0;
  return clamp(Math.ceil(Math.log2(HMAX / allowed)), 0, LEVELS - 1);
}

// ────────────────────────────── 包絡 ──────────────────────────────
// 0 待機 / 1 起音（線性）/ 2 衰減（指數趨向 sustain）/ 3 放音（指數趨 0）/ 4 結束
class Env {
  constructor() { this.v = 0; this.st = 4; }
  setup(a, d, s, r, sr, dScale) {
    const k = dScale || 1;
    this.incA = a > 0.0006 ? 1 / (a * sr) : 1;
    this.kD = 1 - Math.exp(-3 / Math.max(1, d * k * sr));
    this.s = clamp(s, 0, 1);
    this.kR = 1 - Math.exp(-3 / Math.max(1, r * sr));
  }
  // 起音短到不到一個樣本時直接從 1 開始（以前從 0 進衰減段，會被當成「已經結束」）
  on() { if (this.incA >= 1) { this.v = 1; this.st = 2; } else { this.v = 0; this.st = 1; } }
  off(fast, sr) {
    if (this.st === 4) return;
    if (fast) this.kR = 1 - Math.exp(-3 / (0.012 * (sr || 48000)));
    this.st = 3;
  }
  tick() {
    switch (this.st) {
      case 1: this.v += this.incA; if (this.v >= 1) { this.v = 1; this.st = 2; } break;
      case 2: this.v += (this.s - this.v) * this.kD; if (this.v < 0.0004) { this.v = 0; this.st = 4; } break;
      case 3: this.v -= this.v * this.kR; if (this.v < 0.0003) { this.v = 0; this.st = 4; } break;
      case 4: return 0;
    }
    return this.v;
  }
}

// ───────────────── 零延遲狀態變數濾波器（TPT SVF）─────────────────
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.a1 = 1; this.a2 = 0; this.a3 = 0; this.k = 1; this.low = 0; this.band = 0; this.high = 0; }
  set(fc, q, sr) {
    fc = clamp(fc, 12, sr * 0.45);
    const g = Math.tan(Math.PI * fc / sr);
    const k = 1 / clamp(q, 0.35, 24);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2; this.band = v1; this.high = x - this.k * v1 - v2;
    return v2;
  }
}

// ────────────────────────────── 雜訊 ──────────────────────────────
function makeNoise(seed) {
  let s = seed >>> 0 || 22222;
  let b0 = 0, b1 = 0, b2 = 0;
  return {
    white() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1; },
    pink() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const w = s / 0x3fffffff - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      return (b0 + b1 + b2 + w * 0.1848) * 0.23;
    },
  };
}

// ───────────────────── 模態合成（真實樂器的分音表）─────────────────────
// 鐘、木琴、鋼琴弦的泛音都「不是」整數倍：每個分音有自己的頻率比、音量與衰減。
// 這裡每個分音是一個「會衰減的旋轉向量」（每樣本 4 個乘法），比查表正弦便宜又精準。
//   list: [[頻率比, 音量, 衰減秒數(t60), 起音秒數?], …]
//   n/B/tilt/pos/d/dk：自動產生弦的分音（B＝弦的不諧和係數，pos＝擊弦位置）
//   beat: [[音分, 音量, 衰減倍率], …]  同一音的其他弦（鋼琴 2–3 根弦）→ 拍音、雙段衰減
//   vt：力度越小，高分音越弱（彈越輕越暗）
function buildModes(M, f0, vk, kd, sr, midi) {
  const list = [];
  if (M.n) {
    const B = (M.B || 0) * Math.pow(2, ((midi - 60) / 12) * (M.Bk ?? 0.9));
    // fmax：分音一直加到這個頻率為止（低音弦的分音多、高音少，跟真的一樣）
    const n = M.fmax ? clamp(Math.floor(M.fmax / f0), 1, M.n) : M.n;
    for (let k = 1; k <= n; k++) {
      const r = k * Math.sqrt(1 + B * k * k);
      let g = Math.pow(k, -(M.tilt ?? 1));
      if (M.pos) g *= Math.abs(Math.sin(Math.PI * k * M.pos)) + 0.03;
      list.push([r, g, (M.d ?? 3) / (1 + (M.dk ?? 0.3) * (k - 1)), 0]);
    }
  }
  if (M.list) for (const e of M.list) list.push([e[0], e[1], e[2], e[3] || 0]);
  const all = [[0, 1, 1]].concat(M.beat || []), one = [[0, 1, 1]];
  const beatN = M.beatN ?? 99;           // 只有前幾個分音加拍音（省 CPU，高分音的拍音也聽不出來）
  const soft = 1 - vk;
  const out = [];
  let e2 = 0, idx = 0;
  for (const [r, g0, d0, a] of list) {
    const gv = g0 * Math.pow(Math.max(1, r), -(M.vt || 0) * soft * 2);
    const strings = idx++ < beatN ? all : one;
    for (const [cents, sg, sd] of strings) {
      const f = f0 * r * Math.pow(2, cents / 1200);
      if (f > sr * 0.44 || f < 12) continue;
      // 高音的分音衰減比較快（空氣阻尼隨頻率上升）
      const t60 = Math.max(0.01, d0 * sd * kd);
      const g = gv * sg;
      e2 += g * g;
      // 起始相位錯開（黃金角）：所有分音同相起跑會在第一個週期疊出很大的尖峰
      const ph0 = out.length * 2.39996;
      out.push({ f, g, ge: a > 0 ? 0 : g, rr: Math.pow(0.001, 1 / (t60 * sr)), atk: a * sr, re: Math.cos(ph0), im: Math.sin(ph0), w: 2 * Math.PI * f / sr, cw: 1, sw: 0 });
    }
  }
  const norm = (M.lvl ?? 0.5) / Math.max(1e-6, Math.sqrt(e2));
  for (const m of out) { m.g *= norm; m.ge *= norm; m.cw = Math.cos(m.w); m.sw = Math.sin(m.w); }
  return out;
}

// ─────────────────── 演奏會平台鋼琴（以 Steinway D274 的文獻量測值為準）───────────────────
// 每一個數字都有出處，改之前先看 daw-studio/PIANO-NOTES.md。
//
//   ‧ 不諧和係數 B（Conklin 1996, JASA 100(3)：Steinway D 實測）：
//       中音 C4 ≈ 3.8e-4；往高音每八度約 ×2.9（弦越短越粗越硬）；
//       低音因為纏銅線的低音弦，反而在 C2 附近降到 ≈ 1.2e-4，再往最低音又升一點
//       → 對數座標下是 U 形，這裡用分段內插。
//   ‧ 擊弦點：琴弦長度的 1/7～1/9（Steinway 設計值，低音 1/8、高音漸短到 1/12）
//     → 第 n 個分音的激發量乘 |sin(nπ·pos)|，所以第 8 分音附近有個「洞」。
//   ‧ 槌子（Hall 1987；Stulov 1995）：毛氈的剛度隨壓縮量上升（F ∝ y^p，p≈2.3～3.5）。
//     結果是頻譜的「拐點」隨力度上升：pp 時 ~1 kHz 以上很快沒了、ff 時延到 4～5 kHz。
//     槌子接觸時間 ~4 ms（低音、pp）到 ~0.7 ms（高音、ff）→ 分音 n 的激發
//     ≈ 1 / (1 + (n·f0·Tc)^q)，Tc 是接觸時間。
//   ‧ 雙段衰減（Weinreich 1977, JASA 62；Askenfelt 1990）：三根弦耦合 → 垂直極化
//     的同相模態把能量很快交給琴橋（快段），之後剩下互相抵銷的模態慢慢衰減（慢段）。
//     C4 的實測：快段 t60 ≈ 2～3 s，慢段 ≈ 15～25 s；高音 C7 縮短到 ~1 s／~3 s。
//     另外水平極化的模態不太耦合到琴橋，衰減更慢、比較小聲。
//   ‧ 弦之間的微失諧：調音師刻意留 ~0.3～1 音分 → 拍音與「歌唱」的尾音。
//   ‧ 縱波分音（Conklin 1999, JASA 105(1)）：低音弦被敲時伸縮，產生一組不在泛音列
//     上的「縱波」頻率，是低音金屬味的來源。約在 f ≈ 14～20 倍基頻（C2 以下才明顯）。
//   ‧ 共鳴板（Giordano 1998, Suzuki 1986）：模態很密，低於 ~200 Hz 的地方較稀疏，
//     整體在 ~300 Hz–1 kHz 最有效率，~2.5 kHz 以上逐漸下降。用一組固定共振當 body。
//   ‧ 起音雜音：槌柄＋鍵盤底的「咚」(~80–250 Hz)、槌子撞弦的高頻，力度越大越明顯。
//   ‧ 制音器：放開琴鍵時，毛氈碰弦 → 高分音先被吃掉、再整體收掉（約 0.1～0.4 s）；
//     A6 以上本來就沒有制音器。
const PIANO_B = [[21, 2.3e-4], [28, 1.4e-4], [36, 1.2e-4], [43, 1.6e-4], [48, 2.1e-4],
  [55, 2.9e-4], [60, 3.8e-4], [67, 7.0e-4], [72, 1.1e-3], [79, 2.4e-3], [84, 3.9e-3],
  [91, 8.5e-3], [96, 1.4e-2], [108, 4.0e-2]];
function pianoB(midi) {
  const T = PIANO_B;
  if (midi <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (midi <= T[i][0]) {
      const [m0, b0] = T[i - 1], [m1, b1] = T[i];
      const t = (midi - m0) / (m1 - m0);
      return Math.exp(Math.log(b0) + (Math.log(b1) - Math.log(b0)) * t);
    }
  }
  return T[T.length - 1][1];
}
// 各音區的「t60（秒）」：快段／慢段（Askenfelt & Jansson；Bank 2000 量測整理）
const PIANO_T60 = [[21, 9, 45], [36, 6, 32], [48, 4.2, 24], [60, 2.8, 18], [72, 1.7, 10],
  [84, 0.9, 4.5], [96, 0.45, 1.8], [108, 0.2, 0.7]];
function pianoT60(midi) {
  const T = PIANO_T60;
  if (midi <= T[0][0]) return [T[0][1], T[0][2]];
  for (let i = 1; i < T.length; i++) {
    if (midi <= T[i][0]) {
      const a = T[i - 1], b = T[i];
      const t = (midi - a[0]) / (b[0] - a[0]);
      return [Math.exp(Math.log(a[1]) + Math.log(b[1] / a[1]) * t), Math.exp(Math.log(a[2]) + Math.log(b[2] / a[2]) * t)];
    }
  }
  const z = T[T.length - 1]; return [z[1], z[2]];
}
// 每個音幾根弦：A0–約 B0 一根、C1–約 F♯2 兩根、其餘三根（Steinway D）
const pianoStrings = midi => (midi < 24 ? 1 : midi < 43 ? 2 : 3);

// 產生一個鋼琴音的分音（回傳給 Voice 用的 modes 陣列）
//   P.piano = { bright, hard, unison, long, lvl, hammerPos, felt, ... } 都是 0～1 的「個性」調整，
//   預設 = 文獻上的 Steinway D。
function buildPiano(P, midi, vel, sr, voiceSeed) {
  const Q = P.piano || {};
  const f0 = 440 * Math.pow(2, (midi - 69 + (P.tune || 0) / 100) / 12);
  const v = clamp(vel / 127, 0.02, 1);
  const B = pianoB(midi) * (Q.Bmul ?? 1);
  const [tFast, tSlow] = pianoT60(midi);
  const tl = Q.long ?? 1;
  // 擊弦位置：低音 1/8，往高音縮短到 1/12（Steinway 的 strike line）
  const pos = (Q.pos ?? 1) * (midi < 60 ? 1 / 8 : 1 / (8 + 4 * clamp((midi - 60) / 40, 0, 1)));
  // 槌子接觸時間：低音、輕彈長；高音、重彈短（Askenfelt & Jansson 1991 的量測曲線）
  const felt = Q.felt ?? 1;               // >1 = 毛氈更軟（felt piano）
  // Askenfelt & Jansson 1991：中音 C4 接觸時間 pp ≈ 4 ms、mf ≈ 2 ms、ff ≈ 0.8 ms（約 ∝ v^-0.8）
  const tc = felt * 0.0021 * Math.pow(2, -(midi - 60) / (midi > 60 ? 34 : 26)) * Math.pow(v / 0.63, -(midi > 60 ? 0.95 : 0.8)) * (Q.hard ? 1 / (1 + Q.hard) : 1);
  // 拐點之後的斜率：pp 很陡（毛氈軟、像低通）、ff 變緩（毛氈被壓硬、高頻保留）
  const q = 3.2 - 1.6 * Math.pow(v, 1.3) * (Q.bright ?? 1);
  const nStr = Q.strings ?? pianoStrings(midi);
  // 弦的失諧（音分）：調音師留的 ±0.3～1 音分；unison 越大越像沒調好的老琴
  const un = (Q.unison ?? 1) * (0.35 + 0.5 * clamp((midi - 30) / 60, 0, 1));
  const detune = nStr === 1 ? [0] : nStr === 2 ? [-un, un] : [-un, un * 0.25, un * 1.1];
  const fmax = Math.min(sr * 0.44, 18000);
  const nMax = clamp(Math.floor(fmax / f0), 1, midi < 40 ? 70 : midi < 60 ? 50 : 32);
  const out = [];
  let e2 = 0;
  const rnd = makeNoise(voiceSeed);
  for (let k = 1; k <= nMax; k++) {
    const r = k * Math.sqrt(1 + B * k * k);
    const fk = f0 * r;
    if (fk > fmax) break;
    // 激發：擊弦位置的梳狀 × 槌子的低通（拐點 1/tc）× 弦本身 1/k
    let g = Math.abs(Math.sin(Math.PI * k * pos)) + 0.02;
    // 槌子的低通：拐點 1/tc 之後以 q 的斜率下降，但不會真的「沒有」——
    // 毛氈的表層總是硬的，pp 也還有一點點高分音（約 -45～-60 dB），不是靜音
    const hx = fk * tc * 1.8;
    g *= Math.max(1 / (1 + Math.pow(hx, Math.max(1.1, q))), 0.004 / (1 + hx * hx * 0.25));
    g *= 1 / Math.pow(k, 0.55);
    // 共鳴板的效率：太低（<~120 Hz）的分音輻射差，所以低音的基音本來就弱
    g *= fk < 120 ? Math.pow(fk / 120, 0.9) : 1;
    if (g < 2e-5) continue;
    // 分音 k 的衰減：頻率越高越快（空氣與弦內阻尼 ∝ f 與 f²）
    const damp = 1 + 0.00018 * fk + 2.5e-8 * fk * fk;
    const tf = tFast * tl / damp, ts = tSlow * tl / Math.pow(damp, 0.45);
    for (let s = 0; s < nStr; s++) {
      const cents = detune[s] + (rnd.white() * 0.12);
      const f = fk * Math.pow(2, cents / 1200);
      // 每根弦：快段（垂直、耦合到琴橋）＋慢段（剩下的、水平極化）
      // 慢段的比例：弦越多越大（三根弦的反相模態）；Weinreich 的量測約 -12～-20 dB
      // Weinreich：餘音（aftersound）比起音低約 15～25 dB → 振幅 ~6～18%；
      // 高音弦的耦合比較強，餘音比例更小
      const slowAmt = (nStr === 1 ? 0.05 : 0.11) * (Q.ring ?? 1) * clamp(1.25 - (midi - 48) / 80, 0.45, 1.25);
      const gs = g / nStr;
      out.push(mode(f, gs * (1 - slowAmt), tf, sr, out.length));
      out.push(mode(f * (1 + 0.00004 * (s + 1)), gs * slowAmt, ts, sr, out.length));
      e2 += gs * gs;
    }
  }
  // 縱波分音（低音的金屬「噹」）：Conklin 量到大約在 f0 的 14～20 倍附近，與基音無整數關係
  if (midi < 48 && (Q.longit ?? 1) > 0) {
    const fl = f0 * (17.3 - (midi - 21) * 0.12);
    const gl = 0.035 * (Q.longit ?? 1) * v * v;
    for (const m of [1, 2]) {
      if (fl * m > fmax) break;
      out.push(mode(fl * m, gl / m, 0.35 * tl, sr, out.length));
      e2 += (gl / m) * (gl / m) * 0.1;
    }
  }
  const norm = (Q.lvl ?? 0.42) / Math.max(1e-6, Math.sqrt(e2));
  for (const m of out) { m.g *= norm; m.ge = m.g; }
  return { modes: out, f0, tc };
}
function mode(f, g, t60, sr, i) {
  const ph0 = i * 2.39996;
  const w = 2 * Math.PI * f / sr;
  return { f, g, ge: g, rr: Math.pow(0.001, 1 / (Math.max(0.01, t60) * sr)), atk: 0,
    re: Math.cos(ph0), im: Math.sin(ph0), w, cw: Math.cos(w), sw: Math.sin(w) };
}

// ─────────────────── 撥弦／擊弦：數位波導（Karplus-Strong 改良版）───────────────────
// 改良的地方：
//   ‧ 分數延遲（4 點 Lagrange 內插）：音準準到音分以下，而且可以推弦、揉弦
//   ‧ 撥弦位置：激發訊號扣掉延遲 pos 個週期的自己 → 靠近琴橋薄而亮、靠近中段圓
//   ‧ 衰減以「每個週期」計算，t60 才是真的秒數
//   ‧ buzz：琴橋上的「沙聲」（西塔琴 jawari、三味線 sawari），弦碰到平面琴橋時的削波
class PluckString {
  constructor(s, f, vk, kd, sr, seed) {
    this.sr = sr;
    this.f = f;
    const period = sr / f;
    this.L = Math.ceil(period * 1.7) + 8;
    this.buf = new Float32Array(this.L);
    this.w = 0;
    const bright = clamp((s.bright ?? 0.5) + (s.vb ?? 0.3) * (vk - 0.75), 0, 1);
    const N = Math.max(4, Math.round(period));
    const exc = new Float32Array(N);
    const nz = makeNoise(seed);
    let prev = 0;
    const lp = 0.015 + bright * bright * 0.9;
    for (let i = 0; i < N; i++) { prev += (nz.white() - prev) * lp; exc[i] = prev; }
    if (s.pos) {
      const P = Math.max(1, Math.round(N * s.pos));
      for (let i = N - 1; i >= P; i--) exc[i] -= exc[i - P];
    }
    let m = 0; for (let i = 0; i < N; i++) m += exc[i]; m /= N;
    let e = 0; for (let i = 0; i < N; i++) { exc[i] -= m; e += exc[i] * exc[i]; }
    const k = 0.5 / Math.sqrt(e / N + 1e-12);
    for (let i = 0; i < N; i++) exc[i] *= k;
    this.exc = exc; this.ei = 0;
    // 迴路低通：h 越大高音掉越快（尼龍、羊腸弦）；h 越小越「響」（鋼弦、金屬）
    this.h = clamp(0.5 - 0.46 * (s.ring ?? bright), 0.02, 0.5);
    const t60 = Math.max(0.05, (s.decay ?? 2) * kd);
    this.damp = Math.pow(0.001, 1 / (t60 * f));
    this.prev = 0;
    this.buzz = s.buzz || 0;
    this.pk = 0;
    this.setPitch(1);
  }
  setPitch(mul) {
    let D = this.sr / (this.f * mul) - this.h;
    D = clamp(D, 2.5, this.L - 4);
    this.D = D;
    const ip = Math.floor(D);
    const fr = D - ip;          // 讀取位置 = w - D：整數部分往回 ip、再往回 fr
    // 往回 D 個樣本 = 位置 (w-ip-1) 與 (w-ip) 之間、距 (w-ip-1) 為 t = 1-fr
    const t = 1 - fr;
    this.ip = ip;
    this.c0 = -t * (t - 1) * (t - 2) / 6;
    this.c1 = (t + 1) * (t - 1) * (t - 2) / 2;
    this.c2 = -(t + 1) * t * (t - 2) / 2;
    this.c3 = (t + 1) * t * (t - 1) / 6;
  }
  tick() {
    const b = this.buf, L = this.L;
    // x1 = 位置 w-ip-1，x2 = w-ip；x0 = w-ip-2，x3 = w-ip+1
    let i1 = this.w - this.ip - 1; if (i1 < 0) i1 += L;
    const i0 = i1 === 0 ? L - 1 : i1 - 1;
    const i2 = i1 + 1 === L ? 0 : i1 + 1;
    const i3 = i2 + 1 === L ? 0 : i2 + 1;
    const cur = this.c0 * b[i0] + this.c1 * b[i1] + this.c2 * b[i2] + this.c3 * b[i3];
    let v = this.damp * ((1 - this.h) * cur + this.h * this.prev);
    this.prev = cur;
    if (this.buzz) {
      const a = v < 0 ? -v : v;
      this.pk = a > this.pk ? a : this.pk * 0.9997;
      const thr = this.pk * (1 - 0.75 * this.buzz);
      if (a > thr) v = (v < 0 ? -1 : 1) * (thr + (a - thr) * 0.35);
    }
    if (this.ei < this.exc.length) v += this.exc[this.ei++];
    b[this.w] = v;
    this.w++; if (this.w >= L) this.w = 0;
    return v;
  }
}

// 母音共振峰表（Csound 合唱共振峰表）：[頻率, 頻寬, 音量 dB] × 5
const VOWELS = {
  bass: {
    a: [[600, 60, 0], [1040, 70, -7], [2250, 110, -9], [2450, 120, -9], [2750, 130, -20]],
    e: [[400, 40, 0], [1620, 80, -12], [2400, 100, -9], [2800, 120, -12], [3100, 120, -18]],
    i: [[250, 60, 0], [1750, 90, -30], [2600, 100, -16], [3050, 120, -22], [3340, 120, -28]],
    o: [[400, 40, 0], [750, 80, -11], [2400, 100, -21], [2600, 120, -20], [2900, 120, -40]],
    u: [[350, 40, 0], [600, 80, -20], [2400, 100, -32], [2675, 120, -28], [2950, 120, -36]],
  },
  tenor: {
    a: [[650, 80, 0], [1080, 90, -6], [2650, 120, -7], [2900, 130, -8], [3250, 140, -22]],
    e: [[400, 70, 0], [1700, 80, -14], [2600, 100, -12], [3200, 120, -14], [3580, 120, -20]],
    i: [[290, 40, 0], [1870, 90, -15], [2800, 100, -18], [3250, 120, -20], [3540, 120, -30]],
    o: [[400, 40, 0], [800, 80, -10], [2600, 100, -12], [2800, 120, -12], [3000, 120, -26]],
    u: [[350, 40, 0], [600, 60, -20], [2700, 100, -17], [2900, 120, -14], [3300, 120, -26]],
  },
  alto: {
    a: [[800, 80, 0], [1150, 90, -4], [2800, 120, -20], [3500, 130, -36], [4950, 140, -60]],
    e: [[400, 60, 0], [1600, 80, -24], [2700, 120, -30], [3300, 150, -35], [4950, 200, -60]],
    i: [[350, 50, 0], [1700, 100, -20], [2700, 120, -30], [3700, 150, -36], [4950, 200, -60]],
    o: [[450, 70, 0], [800, 80, -9], [2830, 100, -16], [3500, 130, -28], [4950, 135, -55]],
    u: [[325, 50, 0], [700, 60, -12], [2530, 170, -30], [3500, 180, -40], [4950, 200, -64]],
  },
  sop: {
    a: [[800, 80, 0], [1150, 90, -6], [2900, 120, -32], [3900, 130, -20], [4950, 140, -50]],
    e: [[350, 60, 0], [2000, 100, -20], [2800, 120, -15], [3600, 150, -40], [4950, 200, -56]],
    i: [[270, 60, 0], [2140, 90, -12], [2950, 100, -26], [3900, 120, -26], [4950, 120, -44]],
    o: [[450, 40, 0], [800, 80, -11], [2830, 100, -22], [3800, 120, -22], [4950, 120, -50]],
    u: [[325, 50, 0], [700, 60, -16], [2700, 170, -35], [3800, 180, -40], [4950, 200, -60]],
  },
};

// ────────────────────────────── 單音 ──────────────────────────────
class Voice {
  constructor(P, midi, vel, sr) {
    this.P = P;
    this.sr = sr;
    this.midi = midi;
    this.dead = false;
    this.released = false;
    this.life = 0;          // 已經過的樣本數
    this.ctl = 0;

    const f0 = 440 * Math.pow(2, (midi - 69 + (P.tune || 0) / 100) / 12);
    this.f0 = f0;
    this.vk = Math.pow(vel / 127, P.vcurve ?? 1);
    this.kd = P.kdecay ? clamp(Math.pow(2, -(midi - 60) / 30), 0.25, 3) : 1;

    this.amp = new Env();
    this.amp.setup(P.amp.a, P.amp.d, P.amp.s, P.amp.r, sr, this.kd);
    this.flt = new Env();
    const fe = P.flt;
    this.flt.setup(fe.a ?? 0.004, fe.d ?? 0.6, fe.s ?? 0.2, fe.r ?? 0.4, sr, this.kd);

    // 振盪層
    this.layers = [];
    for (const o of P.osc || []) {
      const uni = clamp(o.uni || 1, 1, 5);
      const ph = new Float64Array(uni), base = new Float64Array(uni), inc = new Float64Array(uni);
      const gl = new Float64Array(uni), gr = new Float64Array(uni);
      const spread = o.spread || 0;
      for (let k = 0; k < uni; k++) {
        const d = uni === 1 ? 0 : (k / (uni - 1) - 0.5) * 2;      // -1 … +1
        const cents = (o.cents || 0) + d * spread;
        // 硬同步：從振盪器的頻率是「基頻 × sync」，每次主振盪器繞回原點就被歸零
        // hz：固定頻率（風笛的持續低音管不跟著指法走）
        const f = o.hz ? o.hz * Math.pow(2, cents / 1200) : o.sync
          ? f0 * o.sync * Math.pow(2, cents / 1200)
          : f0 * Math.pow(2, (o.oct || 0) + (o.semi || 0) / 12 + cents / 1200);
        inc[k] = (f * SIZE) / sr;
        base[k] = inc[k];
        ph[k] = ((o.phase || 0) + k * 0.371) % 1 * SIZE;
        const pan = clamp((o.pan || 0) + d * (o.wide || 0), -1, 1);
        gl[k] = Math.cos((pan + 1) * Math.PI / 4);
        gr[k] = Math.sin((pan + 1) * Math.PI / 4);
      }
      // 脈寬調變（PWM）：幾個固定寬度的波表之間交叉淡入，比即時算新波表便宜
      const PWMS = [0.5, 0.35, 0.2, 0.1];
      const lvl = o.hz ? levelFor(o.hz, sr) : o.sync ? levelFor(f0 * o.sync, sr)
        : levelFor(f0 * Math.pow(2, (o.oct || 0) + (o.semi || 0) / 12), sr);
      const pwmTabs = o.pwm ? PWMS.map(pw => wave({ w: 'pls', key: 'pls|' + pw, pw })[lvl]) : null;
      const g = (o.lvl ?? 0.5) * (o.key ? Math.pow(f0 / 261.6, o.key) : 1)
        * (o.vel ? (1 - o.vel) + o.vel * this.vk : 1) / Math.sqrt(uni);
      this.layers.push({
        tab: pwmTabs ? pwmTabs[0] : wave(o.wave)[lvl],
        tab2: null, pwmTabs, fixed: !!o.hz,
        ph, base, inc, gl, gr, gain: g,
        sync: o.sync ? { base: (f0 * SIZE) / sr, ph: 0 } : null,
        fm: o.fm ? {
          ratio: o.fm.ratio || 1, cur: (o.fm.idx || 0) * (o.fm.vel ? (1 - o.fm.vel) + o.fm.vel * this.vk * 1.3 : 1),
          k: 1 - Math.exp(-3 / Math.max(0.001, (o.fm.d ?? 0.4) * sr * this.kd)),
          ph: 0, inc: (f0 * (o.fm.ratio || 1)) / sr, fb: o.fm.fb || 0, last: 0,
          floor: o.fm.floor || 0,
        } : null,
        dec: o.decay ? 1 - Math.exp(-3 / Math.max(0.001, o.decay * sr * this.kd)) : 0,
        decV: 1,
        atk: o.attack || 0,
      });
    }

    // 副振盪（低八度）
    this.sub = null;
    if (P.sub && P.sub.lvl) {
      const s = P.sub;
      const spec = { key: 's:' + (s.wave || 'sin'), w: s.wave || 'sin' };
      this.sub = {
        tab: wave(spec)[levelFor(f0 * Math.pow(2, s.oct || -1), sr)],
        ph: 0, base: (f0 * Math.pow(2, s.oct ?? -1) * SIZE) / sr, inc: 0, gain: s.lvl,
      };
      this.sub.inc = this.sub.base;
    }

    // 撥弦物理模型（數位波導）；course = 同一音的其他弦（音分），十二弦、曼陀林、西塔琴共鳴弦
    this.strs = null;
    if (P.str && P.str.lvl) {
      const s = P.str;
      const set = [[0, 1]].concat(s.course || []);
      this.strs = set.map(([c, g], i) => {
        const w = new PluckString(s, f0 * Math.pow(2, c / 1200), this.vk, this.kd, sr, (midi * 7919 + 13 + i * 104729) >>> 0);
        w.g = g;
        return w;
      });
      this.strGain = s.lvl / Math.sqrt(set.reduce((a, x) => a + x[1] * x[1], 0));
    }

    // 模態合成（分音表）
    this.modes = P.modes ? buildModes(P.modes, f0, this.vk, this.kd, sr, midi) : null;
    this.modeGain = 1;
    // 平台鋼琴：專用的物理參數模型（見 buildPiano）
    this.piano = null;
    if (P.piano) {
      const pz = buildPiano(P, midi, vel, sr, (midi * 7349 + vel * 31 + 11) >>> 0);
      this.modes = pz.modes;
      const Q = P.piano;
      // 起音雜音：琴鍵撞到底（keybed，~120 Hz 的悶「咚」）＋槌子撞弦（寬頻、很短），力度越大越明顯
      const vv = vel / 127;
      this.piano = {
        thump: new SVF(), knock: new SVF(), nz: makeNoise((midi * 92821 + 5) >>> 0),
        tg: (Q.thump ?? 1) * 0.06 * vv * vv, kg: (Q.knock ?? 1) * 0.05 * Math.pow(vv, 2.2),
        tk: Math.pow(0.001, 1 / (0.05 * sr)), kk: Math.pow(0.001, 1 / (0.012 * sr)), te: 1, ke: 1,
        // 制音器：A6（midi 93）以上沒有制音器 → 放開也會一直響
        damped: midi < 93 && !Q.noDamper, rel: 0, relRate: 0, hiCut: 1,
      };
      this.piano.thump.set(110 + midi * 0.6, 1.2, sr);
      this.piano.knock.set(Math.min(sr * 0.4, 2200 + midi * 40), 0.8, sr);
    }

    // 琴身／管身共鳴：固定頻率（不跟音高走）→ 每種樂器自己的「聲音指紋」
    //   body: [[頻率, Q, 增益 dB], …]；帶通的中心增益是 Q，所以除掉，中心點才剛好是指定的 dB
    this.body = (P.body || []).map(([f, q, db]) => { const s = new SVF(); s.set(f, q, sr); return { s, g: (Math.pow(10, db / 20) - 1) / q }; });

    // 慢速隨機飄移（人在拉弓、吹氣，音高與音量不可能完全不動）
    // post：削波之後的低通（音箱喇叭），破音吉他少了它會很刺
    this.post = P.post ? new SVF() : null;
    if (this.post) this.post.set(P.post, 0.75, sr);
    this.post2 = P.post ? new SVF() : null;
    if (this.post2) this.post2.set(P.post, 0.6, sr);
    this.jit = P.jit ? { c: P.jit, a: (P.jitA ?? P.jit * 0.02), v: 0, t: 0, src: makeNoise((midi * 6151 + 3) >>> 0) } : null;
    // 只有「自己會衰減」的聲源（撥弦、分音）時，聲音掉到聽不到就提早結束，不用等放開琴鍵
    this.selfDecay = !(P.osc && P.osc.length) && !(P.sub && P.sub.lvl) && !!(this.strs || this.modes || this.piano)
      && !(P.noise && P.noise.lvl && (P.noise.s || 0) > 0);
    this.blkPk = 0;

    // 雜訊（吹氣、擊槌、拉弓）
    this.noise = null;
    if (P.noise && P.noise.lvl) {
      const z = P.noise;
      const nv = {
        src: makeNoise((midi * 104729 + 7) >>> 0), pink: !!z.pink,
        env: new Env(), gain: z.lvl * ((1 - (z.vel || 0)) + (z.vel || 0) * this.vk),
        hp: z.hp ? new SVF() : null, lp: z.lp ? new SVF() : null, bp: z.bp ? new SVF() : null,
      };
      nv.env.setup(z.a ?? 0.001, z.d ?? 0.08, z.s ?? 0, z.r ?? 0.05, sr, this.kd);
      nv.env.on();
      if (nv.hp) nv.hp.set(z.hp, 0.7, sr);
      if (nv.lp) nv.lp.set(z.lp, 0.7, sr);
      // kt：氣音的中心頻率跟著音高（吹管樂器的氣聲是被管子「染色」過的）
      if (nv.bp) nv.bp.set(z.kt ? clamp(f0 * z.kt, 200, 12000) : z.bp, z.q || 1.4, sr);
      this.noise = nv;
    }

    // 共振峰（母音）
    this.frm = null;
    if (P.frm && P.frm.lvl) {
      // 五個共振峰、各自的頻寬與音量；聲部（bass…sop）沒指定就依音高自動挑
      const vc = P.frm.voice || (midi < 50 ? 'bass' : midi < 58 ? 'tenor' : midi < 66 ? 'alto' : 'sop');
      const T = VOWELS[vc] || VOWELS.alto;
      const v1 = T[P.frm.v || 'a'] || T.a, v2 = T[P.frm.v2 || P.frm.v || 'a'] || v1;
      const m = clamp(P.frm.morph ?? 0, 0, 1);
      const sh = P.frm.shift || 1;            // 整體移動（童聲、小號弱音器）
      const qm = (P.frm.q || 8) / 8;
      this.frm = { stages: [], g: [], gain: P.frm.lvl };
      for (let k = 0; k < 5; k++) {
        const f = (v1[k][0] + (v2[k][0] - v1[k][0]) * m) * sh;
        const bw = v1[k][1] + (v2[k][1] - v1[k][1]) * m;
        const db = v1[k][2] + (v2[k][2] - v1[k][2]) * m;
        if (f > sr * 0.44) continue;
        const q = clamp((f / bw) * qm, 0.8, 30);
        const s = new SVF(); s.set(f, q, sr);
        this.frm.stages.push(s);
        this.frm.g.push(Math.pow(10, db / 20) * 6 / q);    // 帶通中心增益是 Q，除掉才不會窄的特別大聲
      }
    }

    // 濾波器（slope 2 ＝ 串兩級＝ 24 dB/oct）
    const f = P.flt;
    this.fType = f.type || 'lp';
    this.f1 = new SVF();
    this.f2 = f.slope === 2 ? new SVF() : null;
    this.fBase = f.f ?? 1200;
    this.fKey = f.key ?? 0;
    this.fQ = f.q ?? 0.7;
    this.fEnvAmt = f.env ?? 0;
    // 力度 → 亮度（八度）：彈越用力越亮，真樂器幾乎都是這樣
    this.fBase *= Math.pow(2, (f.vel ?? 0) * (this.vk - 0.7));
    this.f1.set(this.fBase, this.fQ, sr);
    if (this.f2) this.f2.set(this.fBase, 0.55, sr);

    // 音高包絡（銅管滑音、鼓的掉音）
    this.pEnv = P.penv ? {
      cur: P.penv.amt || 0,
      k: 1 - Math.exp(-3 / Math.max(0.001, (P.penv.d ?? 0.08) * sr)),
    } : null;

    // LFO
    this.lfos = (P.lfo || []).map(l => ({
      ph: 0, inc: Math.max(0.001, l.rate) / sr, depth: l.depth || 0, to: l.to || 'pitch',
      shape: l.shape || 'sin', delay: l.delay || 0,
    }));

    this.gain = P.gain ?? 0.7;
    this.pan = P.pan || 0;
    this.drive = P.drive || 0;
    this.ampMod = 1;
    this.panMod = 0;
    this.cutMod = 0;
    this.pitchMul = 1;

    this.amp.on();
    this.flt.on();
    this.updateCtl();
  }

  // 控制率（每 16 個樣本一次）：LFO、音高包絡、頻率倍率、濾波器係數、PWM
  updateCtl() {
    const sr = this.sr;
    let pm = 1, am = 1, cm = 0, panm = 0, pwv = 0, sm = 1;
    for (const l of this.lfos) {
      l.ph += l.inc * 16;
      if (l.ph >= 1) l.ph -= Math.floor(l.ph);
      const raw = l.shape === 'tri' ? 1 - 4 * Math.abs(l.ph - 0.5)
        : l.shape === 'sqr' ? (l.ph < 0.5 ? 1 : -1)
          : Math.sin(2 * Math.PI * l.ph);
      const ramp = l.delay > 0 ? clamp((this.life / sr - l.delay) / 0.3, 0, 1) : 1;
      const v = raw * l.depth * ramp;
      if (l.to === 'pitch') pm *= Math.pow(2, v / 12);
      else if (l.to === 'cutoff') cm += v;
      else if (l.to === 'amp') am *= 1 + v * 0.5;
      else if (l.to === 'pan') panm += v;
      else if (l.to === 'pw') pwv += v;
      else if (l.to === 'sync') sm *= Math.pow(2, v * 2);    // 硬同步的比例掃頻（±2 個八度）
    }
    // PWM：把 LFO 的 -1…+1 映射到「寬 → 窄」的四張波表之間
    this.pwPos = clamp(0.5 - pwv * 0.5, 0, 1);
    const ppos = this.pwPos * 2.999;
    this.pwmI = Math.min(2, Math.floor(ppos));
    this.pwmMix = ppos - this.pwmI;
    if (this.pEnv) {
      this.pEnv.cur -= this.pEnv.cur * this.pEnv.k * 16;
      pm *= Math.pow(2, this.pEnv.cur / 1200);
    }
    if (this.jit) {
      // 每 ~40 ms 換一個隨機目標、平滑地靠過去：音高 ±c 音分、音量 ±a
      const J = this.jit;
      if (--J.t <= 0) { J.t = Math.round(sr * 0.04 / 16); J.tg = J.src.white(); }
      J.v += ((J.tg || 0) - J.v) * 0.08;
      pm *= Math.pow(2, J.v * J.c / 1200);
      am *= 1 + J.v * J.a;
    }
    this.pitchMul = pm;
    this.ampMod = am;
    this.panMod = panm;
    this.cutMod = cm;
    for (const l of this.layers) {
      // 硬同步層：掃頻改的是「從振盪器」的頻率，主振盪器（音高）不動 → 音色掃、音高不跑
      const mul = l.fixed ? 1 : l.sync ? pm * sm : pm;
      for (let u = 0; u < l.ph.length; u++) l.inc[u] = l.base[u] * mul;
      if (l.pwmTabs) { l.tab = l.pwmTabs[this.pwmI]; l.tab2 = l.pwmTabs[this.pwmI + 1]; }
    }
    if (this.sub) this.sub.inc = this.sub.base * pm;
    if (this.strs && pm !== this.lastPm) { for (const s of this.strs) s.setPitch(pm); this.lastPm = pm; }

    const fk = this.fKey ? Math.pow(2, ((this.midi - 60) / 12) * this.fKey) : 1;
    const fe = this.flt.v;
    const oct = this.fEnvAmt * fe * fe + cm;
    const fc = this.fBase * fk * Math.pow(2, oct);
    this.f1.set(fc, this.fQ, sr);
    if (this.f2) this.f2.set(fc, 0.55, sr);
  }

  off(fast) {
    if (this.released) return;
    this.released = true;
    if (this.piano && !fast) {
      // 制音器：高分音先被毛氈吃掉（0.05～0.1 s）、低分音較慢（0.2～0.4 s）
      if (!this.piano.damped) return;      // 最高音區沒有制音器：讓弦自然衰減
      const sr = this.sr;
      for (const m of this.modes) {
        const t = clamp(0.38 * Math.pow(m.f / 200, -0.45), 0.04, 0.5);
        m.rr = Math.min(m.rr, Math.pow(0.001, 1 / (t * sr)));
      }
      // 制音器碰弦的那一下「嘶」
      this.piano.ke = 0.25; this.piano.kg *= 0.5;
      this.amp.off(false, sr);
      this.amp.kR = 1 - Math.exp(-3 / (0.6 * sr));    // 包絡只做保險，聲音的收尾交給分音
      return;
    }
    this.amp.off(fast, this.sr);
    this.flt.off(fast, this.sr);
    if (this.noise) this.noise.env.off(fast, this.sr);
  }

  // 把 [from, from+n) 的樣本「相加」到左右聲道
  render(L, R, from, n) {
    if (this.dead || from >= n) return;
    const LAY = this.layers, NL = LAY.length;
    const sub = this.sub, strs = this.strs, nz = this.noise, frm = this.frm;
    const modes = this.modes, body = this.body, NB = body.length;
    const sr = this.sr;
    const panL = Math.cos((this.pan + 1) * Math.PI / 4) * 1.414;
    const panR = Math.sin((this.pan + 1) * Math.PI / 4) * 1.414;
    for (let i = from; i < n; i++) {
      if (--this.ctl <= 0) { this.ctl = 16; this.updateCtl(); }
      this.life++;

      const a = this.amp.tick();
      if (this.amp.st === 4) { this.dead = true; return; }
      this.flt.tick();

      // ── 振盪層（含 FM、硬同步、PWM 與齊奏）
      let x = 0, xr = 0;
      for (let k = 0; k < NL; k++) {
        const l = LAY[k];
        const ph = l.ph, inc = l.inc, gl = l.gl, gr = l.gr;
        let modv = 0;
        if (l.fm) {
          // 調變器頻率 = 載波（音符）頻率 × ratio（之前誤寫成 ratio Hz，FM 等於沒作用）
          l.fm.ph += l.fm.inc * this.pitchMul; if (l.fm.ph >= 1) l.fm.ph -= Math.floor(l.fm.ph);
          l.fm.cur -= (l.fm.cur - l.fm.floor) * l.fm.k;
          // fb：調變器自我回授（DX7 的 feedback）→ 鋸齒味、銅管的「嗡」
          const mo = Math.sin(2 * Math.PI * l.fm.ph + l.fm.last * l.fm.fb);
          l.fm.last = mo;
          modv = mo * l.fm.cur * SIZE * 0.159;
        }
        // 硬同步：主振盪器（音符基頻）每次繞回原點，從振盪器相位歸零
        let reset = false;
        if (l.sync) {
          l.sync.ph += l.sync.base * this.pitchMul;
          if (l.sync.ph >= SIZE) { l.sync.ph -= SIZE; reset = true; }
        }
        const tab = l.tab, tab2 = l.tab2, mixB = this.pwmMix;
        let lv = l.gain;
        if (l.dec) { l.decV -= l.decV * l.dec; lv *= l.decV; }
        if (l.atk > 0) { const t = (this.life / sr) / l.atk; if (t < 1) lv *= t; }
        if (ph.length === 1) {
          if (reset) ph[0] = 0;
          let q = ph[0] + modv; q -= Math.floor(q / SIZE) * SIZE;
          const idx = q | 0, fr = q - idx;
          let v = tab[idx] + (tab[idx + 1] - tab[idx]) * fr;
          if (tab2) v += ((tab2[idx] + (tab2[idx + 1] - tab2[idx]) * fr) - v) * mixB;
          ph[0] += inc[0]; if (ph[0] >= SIZE) ph[0] -= SIZE;
          x += v * lv; xr += v * lv;
        } else {
          for (let u = 0; u < ph.length; u++) {
            if (reset) ph[u] = 0;
            let q = ph[u] + modv; q -= Math.floor(q / SIZE) * SIZE;
            const idx = q | 0, fr = q - idx;
            let v = tab[idx] + (tab[idx + 1] - tab[idx]) * fr;
            if (tab2) v += ((tab2[idx] + (tab2[idx + 1] - tab2[idx]) * fr) - v) * mixB;
            ph[u] += inc[u]; if (ph[u] >= SIZE) ph[u] -= SIZE;
            x += v * gl[u] * lv; xr += v * gr[u] * lv;
          }
        }
      }

      // ── 副振盪
      if (sub) {
        const idx = sub.ph | 0;
        const v = sub.tab[idx] + (sub.tab[idx + 1] - sub.tab[idx]) * (sub.ph - idx);
        sub.ph += sub.inc; if (sub.ph >= SIZE) sub.ph -= SIZE;
        x += v * sub.gain; xr += v * sub.gain;
      }

      // ── 撥弦模型（波導）
      if (strs) {
        let sv = 0;
        for (let k = 0; k < strs.length; k++) sv += strs[k].tick() * strs[k].g;
        sv *= this.strGain;
        x += sv; xr += sv;
      }

      // ── 模態合成：每個分音是一個會衰減的旋轉向量
      if (modes) {
        let mv = 0;
        const life = this.life;
        for (let k = 0; k < modes.length; k++) {
          const m = modes[k];
          const re = m.re * m.cw - m.im * m.sw;
          m.im = (m.re * m.sw + m.im * m.cw) * m.rr;
          m.re = re * m.rr;
          if (m.atk > 0 && life < m.atk) { m.ge = m.g * (life / m.atk); }
          else m.ge = m.g;
          mv += m.im * m.ge;
        }
        // 每 4096 個樣本把向量長度拉回來（避免浮點誤差累積），順便丟掉已經聽不到的分音
        if ((life & 4095) === 0) {
          // 每個分音自己記「應該剩多少」（amp × rr^4096），制音器中途改 rr 也不會算錯
          for (const m of modes) {
            const want = (m.amp ?? 1) * Math.pow(m.rr, 4096);
            m.amp = want;
            const r = Math.hypot(m.re, m.im); if (r > 0) { const t = want / r; m.re *= t; m.im *= t; }
            m.alive = want * m.g > 1e-5;
          }
          this.modes = modes.filter(m => m.alive);
        }
        mv *= this.modeGain;
        x += mv; xr += mv;
      }
      if (this.piano) {
        const Pz = this.piano;
        if (Pz.te > 1e-4 || Pz.ke > 1e-4) {
          const w = Pz.nz.white();
          Pz.thump.tick(w); Pz.knock.tick(w);
          const z = Pz.thump.band * Pz.te * Pz.tg + Pz.knock.band * Pz.ke * Pz.kg;
          Pz.te *= Pz.tk; Pz.ke *= Pz.kk;
          x += z; xr += z;
        }
      }

      // ── 雜訊
      if (nz) {
        const e = nz.env.tick();
        if (e > 0) {
          let w = nz.pink ? nz.src.pink() : nz.src.white();
          if (nz.hp) { nz.hp.tick(w); w = nz.hp.high; }
          if (nz.lp) { nz.lp.tick(w); w = nz.lp.low; }
          if (nz.bp) { nz.bp.tick(w); w = nz.bp.band; }
          x += w * e * nz.gain; xr += w * e * nz.gain;
        }
      }

      // ── 濾波
      const f1 = this.f1;
      f1.tick(x);
      let y = this.fType === 'hp' ? f1.high : this.fType === 'bp' ? f1.band
        : this.fType === 'nt' ? f1.low - f1.high : f1.low;
      if (this.f2) { this.f2.tick(y); y = this.f2.low; }

      // ── 琴身／管身共鳴（固定頻率的帶通並聯，加回原訊號）
      if (NB) {
        let bv = 0;
        for (let k = 0; k < NB; k++) { const B = body[k]; B.s.tick(y); bv += B.s.band * B.g; }
        y += bv;
      }
      let yr = y;

      // ── 共振峰並聯（母音）
      if (frm) {
        let fxv = 0;
        const S = frm.stages;
        for (let k = 0; k < S.length; k++) { S[k].tick(x); fxv += S[k].band * frm.g[k]; }
        y = y * (1 - frm.gain) + fxv * frm.gain;
        yr = y;
      }

      // ── 驅動（軟削波）
      if (this.drive > 0) {
        const d = 1 + this.drive * 6, td = Math.tanh(d);
        y = td > 0.001 ? Math.tanh(y * d) / td : y;
        yr = y;
      }
      if (this.post) { this.post.tick(y); this.post2.tick(this.post.low); y = yr = this.post2.low; }

      const g = a * this.vk * this.gain * this.ampMod * OUT;
      if (this.selfDecay) {
        const av = y < 0 ? -y * g : y * g;
        if (av > this.blkPk) this.blkPk = av;
        if ((this.life & 4095) === 0) {
          if (this.life > sr * 0.3 && this.blkPk < 2e-5) { this.dead = true; return; }
          this.blkPk = 0;
        }
      }
      const pn = clamp(this.pan + this.panMod, -1, 1);
      L[i] += y * g * (pn === this.pan ? panL : Math.cos((pn + 1) * Math.PI / 4) * 1.414);
      R[i] += yr * g * (pn === this.pan ? panR : Math.sin((pn + 1) * Math.PI / 4) * 1.414);
    }
  }
}

// ────────────────────────────── 鼓 ──────────────────────────────
// 三種發聲單元：鼓皮（正弦掉音）、雜訊（濾波）、金屬（六個方波）。
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

class DrumVoice {
  constructor(P, midi, vel, sr) {
    this.sr = sr;
    this.dead = false;
    this.released = true;      // 鼓不吃 note-off
    this.t = 0;
    const v = Math.pow(vel / 127, 1.1);
    const def = DRUM_DEF(P.kit, midi);
    this.gain = (def.gain ?? 0.9) * v * (P.gain ?? 0.75);
    this.pan = def.pan || 0;
    this.len = def.len || 0.6;

    this.memb = (def.memb || []).map(m => {
      const env = new Env();
      env.setup(m.a ?? 0.001, m.d, 0, m.d, sr);
      env.on();
      return { f: m.f, f1: m.f1 ?? m.f, d: m.d, g: m.g ?? 1, ph: 0, env };
    });
    this.nz = (def.noise || []).map(nd => {
      const env = new Env();
      env.setup(nd.a ?? 0.001, nd.d, 0, nd.d, sr);
      env.on();
      const o = { env, g: nd.g ?? 1, src: makeNoise((midi * 31337 + 5) >>> 0), pink: !!nd.pink };
      if (nd.hp) { o.hp = new SVF(); o.hp.set(nd.hp, 0.7, sr); }
      if (nd.bp) { o.bp = new SVF(); o.bp.set(nd.bp, 1.1, sr); }
      if (nd.lp) { o.lp = new SVF(); o.lp.set(nd.lp, 0.7, sr); }
      return o;
    });
    const md = def.metal;
    if (md) {
      const env = new Env();
      env.setup(0.001, md.d, 0, md.d, sr);
      env.on();
      this.metal = {
        ph: new Float64Array(METAL.length), env, f: (md.f || 40) / 40,
        g: md.g ?? 0.5, hp: new SVF(), bp: new SVF(),
      };
      this.metal.hp.set(md.hpf || 6000, 0.7, sr);
      this.metal.bp.set(md.bpf || 9000, 0.8, sr);
    } else this.metal = null;
  }

  off() { /* 鼓不受放音影響 */ }

  render(L, R, from, n) {
    if (this.dead || from >= n) return;
    const sr = this.sr;
    const pl = Math.cos((this.pan + 1) * Math.PI / 4) * 1.414;
    const pr = Math.sin((this.pan + 1) * Math.PI / 4) * 1.414;
    for (let i = from; i < n; i++) {
      this.t += 1 / sr;
      let x = 0;
      for (const m of this.memb) {
        const e = m.env.tick();
        if (e <= 0) continue;
        const f = m.f1 + (m.f - m.f1) * Math.exp(-this.t / Math.max(0.0008, m.d * 0.35));
        m.ph += f / sr; if (m.ph >= 1) m.ph -= 1;
        x += Math.sin(2 * Math.PI * m.ph) * e * m.g;
      }
      for (const s of this.nz) {
        const e = s.env.tick();
        if (e <= 0) continue;
        let w = s.pink ? s.src.pink() : s.src.white();
        if (s.hp) { s.hp.tick(w); w = s.hp.high; }
        if (s.bp) { s.bp.tick(w); w = s.bp.band; }
        if (s.lp) { s.lp.tick(w); w = s.lp.low; }
        x += w * e * s.g;
      }
      if (this.metal) {
        const M = this.metal;
        const e = M.env.tick();
        if (e > 0) {
          let m = 0;
          for (let k = 0; k < METAL.length; k++) {
            M.ph[k] += (METAL[k] * M.f) / sr;
            if (M.ph[k] >= 1) M.ph[k] -= 1;
            m += M.ph[k] < 0.5 ? 1 : -1;
          }
          M.hp.tick(m * 0.16); M.bp.tick(M.hp.high);
          x += M.bp.band * e * M.g;
        }
      }
      const g = this.gain * OUT;
      L[i] += x * g * pl;
      R[i] += x * g * pr;
    }
    let live = false;
    if (this.metal && this.metal.env.st !== 4) live = true;
    for (const s of this.nz) if (s.env.st !== 4) live = true;
    for (const m of this.memb) if (m.env.st !== 4) live = true;
    if (!live && this.t > 0.05) this.dead = true;
    if (this.t > 8) this.dead = true;
  }
}

// GM 鼓位 → 合成參數（三套鼓：acoustic／808／909）
function DRUM_DEF(kit, midi) {
  const base = DRUM_CORE(kit === 'lofi' ? 'ac' : kit, midi);
  if (kit !== 'lofi') return base;
  // 低保真鼓組：整套偏低、衰減短一點，聽起來像舊取樣機
  const out = JSON.parse(JSON.stringify(base));
  (out.memb || []).forEach(m => { m.f *= 0.82; m.f1 = (m.f1 || m.f) * 0.82; m.d *= 0.7; });
  (out.noise || []).forEach(n => { n.d *= 0.65; if (n.bp) n.bp *= 0.75; if (n.hp) n.hp *= 0.8; if (n.lp) n.lp *= 0.7; });
  if (out.metal) { out.metal.d *= 0.55; out.metal.hpf *= 0.75; out.metal.bpf *= 0.8; }
  out.len = (out.len || 0.6) * 0.8;
  return out;
}

function DRUM_CORE(kit, midi) {
  const is808 = kit === 808 || kit === '808';
  const is909 = kit === 909 || kit === '909';
  const memb = (f, f1, d, g) => ({ f, f1, d, g });
  const nz = o => Object.assign({ d: 0.1, g: 0.6 }, o);
  const metal = o => Object.assign({ f: 40, d: 0.1, g: 0.5, hpf: 6000, bpf: 9000 }, o);
  if (midi <= 36) {
    if (is808) return { memb: [memb(112, 42, 0.85, 1.0)], noise: [nz({ d: 0.012, g: 0.16, lp: 3000 })], len: 1.4, gain: 1.0 };
    if (is909) return { memb: [memb(155, 50, 0.35, 1.0)], noise: [nz({ d: 0.02, g: 0.3, lp: 4000 })], len: 0.8 };
    return { memb: [memb(120, 48, 0.28, 1.0)], noise: [nz({ d: 0.012, g: 0.35, hp: 1800 })], len: 0.7 };
  }
  if (midi === 37) return { memb: [memb(420, 330, 0.03, 0.6)], noise: [nz({ d: 0.02, g: 0.4, bp: 2600 })], len: 0.25 };
  if (midi === 38 || midi === 40) {
    if (is808) return { memb: [memb(230, 180, 0.18, 0.5)], noise: [nz({ d: 0.2, g: 0.9, hp: 900, bp: 2400 })], len: 0.6 };
    if (is909) return { memb: [memb(290, 210, 0.12, 0.4)], noise: [nz({ d: 0.16, g: 1.0, hp: 1200, bp: 3200 })], len: 0.5 };
    return { memb: [memb(200, 170, 0.14, 0.55)], noise: [nz({ d: 0.22, g: 0.95, hp: 1100, bp: 2500 })], len: 0.6 };
  }
  if (midi === 39) return { noise: [nz({ d: 0.13, g: 1.0, bp: 1600 }), nz({ d: 0.02, g: 0.7, bp: 2600 })], len: 0.4 };
  if (midi === 41 || midi === 43 || midi === 45 || midi === 47 || midi === 48 || midi === 50) {
    const base = { 41: 82, 43: 98, 45: 116, 47: 140, 48: 168, 50: 196 }[midi] || 120;
    return { memb: [memb(base * 1.5, base, 0.35, 0.9)], noise: [nz({ d: 0.03, g: 0.2, hp: 2500 })], len: 0.8 };
  }
  if (midi === 42) {
    if (is808) return { metal: [metal({ f: 40, d: 0.06, g: 0.5, hpf: 8000, bpf: 10000 })], len: 0.25 };
    return { metal: [metal({ f: 40, d: 0.05, g: 0.55, hpf: 7500, bpf: 9500 })], noise: [nz({ d: 0.03, g: 0.3, hp: 8000 })], len: 0.2 };
  }
  if (midi === 44) return { metal: [metal({ f: 40, d: 0.035, g: 0.35, hpf: 8000, bpf: 10000 })], len: 0.15 };
  if (midi === 46) return { metal: [metal({ f: 40, d: is808 ? 0.5 : 0.32, g: 0.45, hpf: 7000, bpf: 9000 })], noise: [nz({ d: 0.2, g: 0.25, hp: 7000 })], len: 1.4 };
  if (midi === 49 || midi === 57 || midi === 52 || midi === 55) {
    return { metal: [metal({ f: 55, d: midi === 49 ? 1.6 : 0.9, g: 0.5, hpf: 4000, bpf: 7000 })], noise: [nz({ d: 1.2, g: 0.4, hp: 3500 })], len: 3.2 };
  }
  if (midi === 51 || midi === 59 || midi === 53) {
    if (midi === 53) return { metal: [metal({ f: 60, d: 0.5, g: 0.4, hpf: 5000, bpf: 8000 })], memb: [memb(820, 800, 0.1, 0.15)], len: 1.6 };
    return { metal: [metal({ f: 45, d: 0.45, g: 0.4, hpf: 5500, bpf: 8200 })], noise: [nz({ d: 0.3, g: 0.25, hp: 5000 })], len: 1.6 };
  }
  if (midi === 54) return { metal: [metal({ f: 80, d: 0.12, g: 0.3, hpf: 8000, bpf: 11000 })], noise: [nz({ d: 0.08, g: 0.5, hp: 6000 })], len: 0.4 };
  if (midi === 56) return { memb: [memb(560, 550, 0.12, 0.5), memb(845, 830, 0.1, 0.35)], noise: [nz({ d: 0.02, g: 0.2, bp: 1200 })], len: 0.5 };
  return { memb: [memb(180, 160, 0.12, 0.5)], noise: [nz({ d: 0.1, g: 0.4, bp: 2400 })], len: 0.4 };
}

// ────────────────────────────── 處理器 ──────────────────────────────
const MAX_VOICES = 64;

class ZYProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.patches = new Map();
    this.voices = [];            // { v, id, delay }
    this.byId = new Map();
    this.queue = [];
    this.port.onmessage = e => {
      try { this.msg(e.data); }
      catch (err) { this.port.postMessage({ t: 'err', msg: String(err && err.message || err) }); }
    };
  }

  msg(m) {
    if (!m) return;
    if (m.t === 'patch') { if (m.p) this.patches.set(m.p.id, m.p); return; }
    if (m.t === 'panic') {
      for (const v of this.voices) v.v.dead = true;
      this.voices.length = 0; this.byId.clear(); this.queue.length = 0; return;
    }
    if (m.t === 'kill') { const v = this.byId.get(m.id); if (v) { v.v.off(true); this.byId.delete(m.id); } return; }
    if (m.t === 'on' || m.t === 'off') {
      if (m.p) this.patches.set(m.p.id, m.p);
      this.queue.push(m);
      if (this.queue.length > 512) this.queue.splice(0, this.queue.length - 512);
    }
  }

  start(m) {
    const p = this.patches.get(m.pid);
    if (!p) { this.port.postMessage({ t: 'err', msg: 'no patch for ' + m.pid }); return; }
    if (this.voices.length >= MAX_VOICES) {
      let idx = this.voices.findIndex(v => v.v.released);
      if (idx < 0) idx = 0;
      const old = this.voices[idx];
      old.v.dead = true;
      this.voices.splice(idx, 1);
      if (this.byId.get(old.id) === old) this.byId.delete(old.id);
    }
    const v = p.drum ? new DrumVoice(p, m.n, m.v, this.sr) : new Voice(p, m.n, m.v, this.sr);
    const entry = { v, id: m.id, delay: m.delay || 0 };
    this.voices.push(entry);
    this.byId.set(m.id, entry);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out.length > 1 ? out[1] : out[0];
    const n = L.length;

    if (this.queue.length) {
      this.queue.sort((a, b) => a.at - b.at);
      const keep = [];
      for (const m of this.queue) {
        const off = (m.at - currentTime) * this.sr;
        if (off >= n) { keep.push(m); continue; }
        try {
          if (m.t === 'on') { m.delay = off < 0 ? 0 : Math.round(off); this.start(m); }
          else { const v = this.byId.get(m.id); if (v) { v.v.off(!!m.fast); this.byId.delete(m.id); } }
        } catch (err) {
          this.port.postMessage({ t: 'err', msg: 'start: ' + String(err && err.stack || err).slice(0, 300) });
        }
      }
      this.queue = keep;
    }

    for (const e of this.voices) {
      if (e.v.dead) continue;
      try { e.v.render(L, R, e.delay, n); } catch (err) {
        e.v.dead = true;
        this.port.postMessage({ t: 'err', msg: 'render: ' + String(err && err.stack || err).slice(0, 200) });
      }
      e.delay = 0;
    }
    if (this.voices.length) {
      let w = 0;
      for (const e of this.voices) if (!e.v.dead) this.voices[w++] = e;
      this.voices.length = w;
    }
    return true;
  }
}

registerProcessor('zy-synth', ZYProcessor);
