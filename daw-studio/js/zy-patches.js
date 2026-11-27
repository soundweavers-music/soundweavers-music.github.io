// 織音合成器 — 音色資料
//
// 這裡只放「參數」，聲音由 zy-worklet.js 逐樣本算出來。每一族有自己的預設值（TPL），
// 單一音色只寫跟家族不一樣的地方，所以一條通常只有一兩行。
//
// 參數：
//   amp   {a,d,s,r}               振幅包絡（秒／0–1）      vcurve 力度曲線    kdecay 高音衰減
//   flt   {type,f,q,key,env,...}  濾波器：f 截止頻率、key 跟音高連動、env 包絡深度（八度）、slope 1|2
//   osc[] {w,lvl,oct,semi,cents,uni,spread,pan,wide,fm{ratio,idx,d},decay,attack,key,vel,phase,pw,harm}
//   sub   {wave,oct,lvl}          副振盪                    str {lvl,bright,decay} 撥弦物理模型
//   noise {lvl,pink,hp,lp,bp,q,a,d,s,r,vel}                 frm {v,v2,morph,q,lvl} 共振峰（母音）
//   lfo[] {to,rate,depth,delay,shape}                       penv {amt,d} 音高包絡（音分）
//   drive 軟削波    gain 輸出音量    pan 立體聲位置    kit 鼓組型號
//   modes {n,B,tilt,pos,d,dk,vt,list,beat,lvl}             分音表（鋼琴弦、鐘、木琴）
//   str  {bright,ring,pos,decay,buzz,course}                波導弦（撥弦位置、琴橋沙聲、複弦）
//   body [[頻率,Q,dB],…] 琴身共鳴   jit 隨機飄移（音分）   post 削波後的喇叭低通   tune 整體音分
//
// 波形 w：'saw' 鋸齒、'sqr' 方波、'tri' 三角、'sin' 正弦、'pls' 脈衝（pw）、'harm' 自訂諧波

import { ZY_GAIN } from './zy-gain.js';
import { registerTerms } from './i18n.js';

const BASE = {
  amp: { a: 0.006, d: 0.8, s: 0.55, r: 0.35 },
  flt: { type: 'lp', f: 6000, q: 0.7, key: 0, env: 0, a: 0.006, d: 0.6, s: 0.35, r: 0.4, slope: 1 },
  osc: [], lfo: [], vcurve: 1, kdecay: 0, gain: 0.75, pan: 0, drive: 0,
};

// 家族預設
//
// 新版的重點：真樂器不再是「鋸齒波＋濾波器」，而是用它真正的發聲原理——
//   鋼琴＝分音表（弦的不諧和泛音＋2～3 根弦的拍音），撥弦＝波導（撥弦位置、琴身共鳴），
//   鐘／木琴＝實測分音比例，弓弦＝鋸齒（亥姆霍茲運動）＋各自的琴身共鳴峰，
//   管樂＝各自的諧波比例＋跟著音高走的氣音＋管身共鳴。
// body: [[頻率, Q, dB], …] 是「聲音指紋」：小提琴、中提琴、大提琴的差別主要就在這裡。
const TPL = {
  piano: {
    amp: { a: 0.001, d: 6, s: 1, r: 0.38 }, vcurve: 1.5, kdecay: 1, gain: 0.85,
    flt: { type: 'lp', f: 7500, q: 0.5, key: 0.35, env: 0, vel: 1.0 },
    modes: { n: 26, B: 0.00038, Bk: 1.0, tilt: 0.8, pos: 0.12, d: 6.5, dk: 0.3, vt: 0.8, lvl: 0.3,
      beat: [[1.4, 0.9, 0.42], [-0.8, 0.55, 0.85]] },
    noise: { lvl: 0.05, lp: 900, d: 0.016, vel: 0.8 },
    body: [[110, 2, 2.5], [260, 1.6, 2], [820, 1.2, 1.5]],
  },
  ep: {
    amp: { a: 0.002, d: 3.0, s: 0.0, r: 0.35 }, vcurve: 1.3, kdecay: 0.8, gain: 0.7,
    flt: { type: 'lp', f: 5200, q: 0.45, key: 0.3, env: 0.3, a: 0.002, d: 0.5, s: 0.4, r: 0.4, vel: 0.8 },
    // Rhodes：主音（1:1 FM，力度越大越「咬」）＋音叉的金屬敲擊聲（1:14 FM，很快消失）
    osc: [{ w: 'sin', lvl: 0.5, fm: { ratio: 1, idx: 1.5, d: 0.7, vel: 0.9, floor: 0.12 } },
      { w: 'sin', lvl: 0.14, fm: { ratio: 14, idx: 1.1, d: 0.05, vel: 1 }, decay: 0.35 }],
    drive: 0.05,
  },
  org: {
    amp: { a: 0.006, d: 0.05, s: 1, r: 0.07 }, vcurve: 0.3, gain: 0.62,
    flt: { type: 'lp', f: 9000, q: 0.35, key: 0, env: 0, a: 0.01, d: 0.1, s: 1, r: 0.1 },
    osc: [{ w: 'harm', harm: [1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1, 0.06], lvl: 0.5 }],
  },
  bel: {
    amp: { a: 0.001, d: 6, s: 1, r: 0.9 }, vcurve: 1.2, kdecay: 0.8, gain: 0.7,
    flt: { type: 'lp', f: 12000, q: 0.4, key: 0, env: 0, vel: 0.8 },
    osc: [],
  },
  gtr: {
    amp: { a: 0.001, d: 6, s: 1, r: 0.25 }, vcurve: 1.2, kdecay: 1, gain: 0.8,
    flt: { type: 'lp', f: 6500, q: 0.5, key: 0.3, env: 0, vel: 1.0 },
    osc: [],
    str: { lvl: 0.6, bright: 0.7, ring: 0.7, pos: 0.15, decay: 3.0 },
    noise: { lvl: 0.06, hp: 2500, d: 0.008, vel: 0.6 },
  },
  bas: {
    amp: { a: 0.004, d: 0.5, s: 0.55, r: 0.1 }, vcurve: 1.1, gain: 0.8,
    flt: { type: 'lp', f: 900, q: 1.2, key: 0.3, env: 1.6, a: 0.002, d: 0.25, s: 0.15, r: 0.15 },
    osc: [{ w: 'saw', lvl: 0.4 }],
    sub: { wave: 'sin', oct: -1, lvl: 0.32 },
  },
  // 電貝斯／低音提琴：真的弦（波導），不是鋸齒
  ebs: {
    amp: { a: 0.001, d: 6, s: 1, r: 0.09 }, vcurve: 1.1, kdecay: 0.6, gain: 0.85,
    flt: { type: 'lp', f: 2400, q: 0.7, key: 0.2, env: 0, vel: 0.8 },
    osc: [],
    str: { lvl: 0.6, bright: 0.55, ring: 0.55, pos: 0.2, decay: 3.2 },
  },
  str: {
    amp: { a: 0.09, d: 0.4, s: 0.92, r: 0.32 }, vcurve: 0.9, gain: 0.5,
    flt: { type: 'lp', f: 5500, q: 0.5, key: 0.15, env: 0.4, a: 0.12, d: 0.6, s: 0.75, r: 0.4, vel: 1.2 },
    osc: [{ w: 'saw', lvl: 0.34 }],
    noise: { lvl: 0.035, hp: 2200, a: 0.03, d: 0.25, s: 0.45, r: 0.12, vel: 0.5 },
    lfo: [{ to: 'pitch', rate: 5.6, depth: 0.13, delay: 0.32 }],
    jit: 3,
    // 小提琴：空氣腔 A0≈275、主體 B1−/B1+≈460/550、琴橋丘 2.5 kHz
    body: [[275, 5, 7], [460, 6, 5], [550, 6, 6], [1150, 3, -3], [2600, 2, 7]],
  },
  wnd: {
    amp: { a: 0.045, d: 0.15, s: 0.92, r: 0.12 }, vcurve: 0.9, gain: 0.6,
    flt: { type: 'lp', f: 5000, q: 0.5, key: 0.25, env: 0.4, a: 0.04, d: 0.2, s: 0.8, r: 0.15, vel: 1.4 },
    osc: [{ w: 'sqr', lvl: 0.35 }],
    lfo: [{ to: 'pitch', rate: 5.3, depth: 0.07, delay: 0.35 }],
    jit: 2.5,
  },
  brs: {
    amp: { a: 0.035, d: 0.2, s: 0.88, r: 0.12 }, vcurve: 1.1, gain: 0.52,
    // 銅管：越大聲越亮（濾波器跟力度走）、起音有「唇的震動先到」的濾波掃開
    flt: { type: 'lp', f: 1400, q: 0.7, key: 0.55, env: 1.8, a: 0.025, d: 0.25, s: 0.55, r: 0.15, vel: 2.2 },
    osc: [{ w: 'saw', lvl: 0.34 }],
    lfo: [{ to: 'pitch', rate: 5.2, depth: 0.06, delay: 0.4 }],
    penv: { amt: -35, d: 0.045 },
    jit: 2,
    drive: 0.1,
  },
  eth: {
    amp: { a: 0.001, d: 6, s: 1, r: 0.3 }, vcurve: 1.1, kdecay: 1, gain: 0.75,
    flt: { type: 'lp', f: 6000, q: 0.5, key: 0.3, env: 0, vel: 1.0 },
    osc: [],
    str: { lvl: 0.6, bright: 0.75, ring: 0.7, pos: 0.12, decay: 2.5 },
  },
  cho: {
    amp: { a: 0.16, d: 0.4, s: 0.92, r: 0.5 }, vcurve: 0.85, gain: 0.5,
    flt: { type: 'lp', f: 6000, q: 0.5, key: 0, env: 0 },
    osc: [{ w: 'saw', lvl: 0.34, uni: 3, spread: 12, wide: 0.6 }],
    noise: { lvl: 0.04, hp: 3000, a: 0.1, d: 0.4, s: 0.6, r: 0.3 },
    frm: { v: 'a', q: 8, lvl: 0.92 },
    lfo: [{ to: 'pitch', rate: 5.0, depth: 0.1, delay: 0.4 }],
    jit: 4,
  },
  led: {
    amp: { a: 0.005, d: 0.25, s: 0.8, r: 0.12 }, vcurve: 0.9, gain: 0.55,
    flt: { type: 'lp', f: 2400, q: 1.6, key: 0.4, env: 2.0, a: 0.002, d: 0.3, s: 0.3, r: 0.15 },
    osc: [{ w: 'saw', lvl: 0.34, uni: 2, spread: 8 }],
  },
  pad: {
    amp: { a: 0.6, d: 1.2, s: 0.8, r: 1.4 }, vcurve: 0.8, gain: 0.42,
    flt: { type: 'lp', f: 1500, q: 0.9, key: 0.3, env: 0.9, a: 1.0, d: 2.0, s: 0.5, r: 1.2 },
    osc: [{ w: 'saw', lvl: 0.3, uni: 3, spread: 14, wide: 0.7 }],
  },
  fx: {
    amp: { a: 0.01, d: 1.5, s: 0.25, r: 0.8 }, vcurve: 0.9, gain: 0.5,
    flt: { type: 'lp', f: 3000, q: 1.0, key: 0.2, env: 2.0, a: 0.2, d: 1.2, s: 0.2, r: 0.8 },
    osc: [{ w: 'saw', lvl: 0.3 }],
  },
};

// 音輪風琴的拉桿（drawbar）：16′ 5⅓′ 8′ 4′ 2⅔′ 2′ 1⅗′ 1⅓′ 1′，每根 0–8。
// 以低八度為基準的諧波：1、3、2、4、6、8、10、12、16 → 用低八度的自訂諧波列一次算好。
function drawbars(s) {
  const H = [1, 3, 2, 4, 6, 8, 10, 12, 16];
  const harm = new Array(16).fill(0);
  [...s].forEach((c, i) => { const v = Number(c); if (v) harm[H[i] - 1] = Math.pow(10, (v - 8) * 3 / 20); });
  return { w: 'harm', harm, oct: -1, lvl: 0.5 };
}
// Leslie 旋轉喇叭：高音號角轉得快（音高＋音量＋左右），fast＝快轉
const leslie = fast => fast
  ? [{ to: 'pitch', rate: 6.6, depth: 0.05 }, { to: 'amp', rate: 6.6, depth: 0.35 }, { to: 'pan', rate: 6.6, depth: 0.55 }]
  : [{ to: 'pitch', rate: 0.8, depth: 0.04 }, { to: 'amp', rate: 0.8, depth: 0.22 }, { to: 'pan', rate: 0.8, depth: 0.5 }];
const CLICK = { lvl: 0.1, hp: 3000, d: 0.006 };    // 音輪風琴的按鍵接點聲

// 深層合併（物件遞迴、陣列整個換掉）
function dm(base, over) {
  if (over === undefined) return JSON.parse(JSON.stringify(base));
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over;
  const out = {};
  for (const k in base) out[k] = base[k];
  for (const k in over) {
    const b = base[k], v = over[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) ? dm(b, v) : v;
  }
  return out;
}

const LIST = [];

// 建一個音色：家族模板 + 差異
function P(id, cat, name, en, gm, tpl, over) {
  LIST.push({ id, cat, name, nameEn: en, gm, tpl, over });
}
// 同上，但整組自訂（沒有家族模板）
function PX(id, cat, name, en, gm, over) {
  LIST.push({ id, cat, name, nameEn: en, gm, tpl: null, over });
}

// 常用的琴身共鳴（[頻率, Q, dB]）
const BODY = {
  violin: [[275, 5, 7], [460, 6, 5], [550, 6, 6], [1150, 3, -3], [2600, 2, 7]],
  viola: [[230, 5, 9], [380, 6, 6], [450, 6, 6], [800, 3, -5], [1700, 3, 4]],
  cello: [[100, 5, 7], [180, 6, 6], [225, 6, 8], [420, 4, 5], [1100, 3, 3]],
  dbass: [[62, 4, 6], [110, 5, 6], [135, 5, 5], [900, 2, -2], [1300, 2, 3]],
  steel: [[105, 4, 5], [220, 3, 4], [400, 2, 2], [2500, 1.5, 3]],
  nylon: [[98, 3, 6], [195, 3, 4], [390, 2, 2], [3000, 1.5, -3]],
};

// ────────────────────────────── 鋼琴 ──────────────────────────────
// 分音表：弦的不諧和係數 B（越短越硬的弦越大）、擊弦點在 1/8（第 8 分音幾乎消失），
// 每個音 2～3 根弦微微不同音 → 拍音與「先快後慢」的雙段衰減。彈越輕高分音越少。
P('pno.grand', '鋼琴', '平台鋼琴', 'Grand Piano', 0, 'piano', {});
P('pno.concert', '鋼琴', '演奏廳鋼琴', 'Concert Grand', 0, 'piano', {
  modes: { n: 32, d: 8.5, B: 0.0003, tilt: 0.75, lvl: 0.3 },
  body: [[90, 2, 3], [220, 1.6, 2.5], [700, 1.2, 1.5], [2800, 1.5, 1.5]],
});
P('pno.bright', '鋼琴', '明亮平台鋼琴', 'Bright Grand', 1, 'piano', {
  modes: { tilt: 0.55, vt: 0.45, pos: 0.1 }, flt: { f: 12000 }, noise: { lvl: 0.06, lp: 2500 },
  body: [[110, 2, 1.5], [3000, 1.4, 4]],
});
P('pno.upright', '鋼琴', '直立鋼琴', 'Upright Piano', 0, 'piano', {
  modes: { B: 0.0009, d: 4.2, tilt: 0.85, beat: [[2.6, 0.9, 0.4], [-1.6, 0.6, 0.8]] },
  body: [[180, 2.5, 4], [480, 2, 3], [1300, 2, -2]], noise: { lvl: 0.08, lp: 1200 },
});
P('pno.felt', '鋼琴', '毛氈鋼琴', 'Felt Piano', 0, 'piano', {
  // 槌子包了一層厚毛氈：高分音幾乎沒有、只剩溫溫的「咚」
  modes: { tilt: 1.6, vt: 1.2, d: 5, pos: 0.16 }, flt: { f: 1700, key: 0.5, vel: 0.6 },
  noise: { lvl: 0.12, lp: 500, d: 0.035, vel: 0.5 }, amp: { r: 0.6 },
});
P('pno.honky', '鋼琴', '走音酒吧鋼琴', 'Honky Tonk', 3, 'piano', {
  modes: { B: 0.0008, d: 4, beat: [[17, 1, 0.9], [-13, 0.85, 0.8]] }, body: [[200, 2.5, 4], [520, 2, 3]],
});
P('pno.lofi', '鋼琴', '錄音帶鋼琴', 'Lo-fi Piano', 0, 'piano', {
  modes: { tilt: 1.1, d: 5 }, post: 3200, drive: 0.12, jit: 7, jitA: 0.01,
  lfo: [{ to: 'pitch', rate: 0.55, depth: 0.09 }], amp: { r: 0.5 },
});
P('pno.toy', '鋼琴', '玩具鋼琴', 'Toy Piano', 8, 'piano', {
  // 玩具鋼琴敲的是一根根金屬棒（懸臂樑）：分音 1 : 6.27 : 17.5，叮叮的
  modes: { n: 0, list: [[1, 1, 1.3], [6.27, 0.5, 0.35], [17.55, 0.18, 0.08]], beat: [], vt: 0.4, lvl: 0.5 },
  flt: { f: 12000, key: 0 }, noise: { lvl: 0.18, hp: 3000, d: 0.008 }, body: [[700, 3, 5]], kdecay: 0.6,
});
P('pno.crystal', '鋼琴', '水晶鋼琴', 'Crystal Piano', 0, 'piano', {
  modes: { tilt: 0.7 }, osc: [{ w: 'sin', lvl: 0.3, oct: 2, decay: 2.6, fm: { ratio: 3.5, idx: 0.6, d: 0.6 } }, { w: 'sin', lvl: 0.16, oct: 3, cents: 5, decay: 1.6 }],
});
P('pno.fm', '鋼琴', 'FM 鋼琴', 'FM Piano', 2, 'piano', {
  modes: undefined, amp: { a: 0.001, d: 2.8, s: 0, r: 0.4 }, body: [],
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 2.2, d: 0.6, vel: 1 } }, { w: 'sin', lvl: 0.16, fm: { ratio: 3, idx: 1.4, d: 0.2 }, decay: 0.6 }],
});
P('pno.pad', '鋼琴', '鋼琴＋弦樂', 'Piano & Strings', 0, 'piano', {
  osc: [{ w: 'saw', lvl: 0.08, uni: 3, spread: 9, attack: 0.5, wide: 0.6 }], amp: { r: 0.8 },
  lfo: [{ to: 'pitch', rate: 5, depth: 0.04, delay: 0.5 }],
});
P('pno.prep', '鋼琴', '預置鋼琴', 'Prepared Piano', 0, 'piano', {
  // 弦上夾了螺絲、橡皮：分音嚴重不諧和、衰減很快，帶金屬噠噠聲
  modes: { n: 12, B: 0.02, d: 1.2, dk: 0.8, list: [[1.37, 0.5, 0.6], [2.13, 0.4, 0.4], [3.71, 0.3, 0.25]] },
  noise: { lvl: 0.18, bp: 2200, q: 3, d: 0.06 }, body: [[300, 3, 3]],
});

// ────────────────────────── 電鋼琴／大鍵琴 ──────────────────────────
P('ep.rhodes', '電鋼琴', '電鋼琴 Rhodes', 'Rhodes E.Piano', 4, 'ep', {
  lfo: [{ to: 'amp', rate: 4.6, depth: 0.18 }, { to: 'pan', rate: 4.6, depth: 0.35 }],
});
P('ep.rhodes79', '電鋼琴', 'Rhodes 1979', 'Rhodes 1979', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.55, fm: { ratio: 1, idx: 0.9, d: 0.9, vel: 1.2, floor: 0.05 } },
    { w: 'sin', lvl: 0.08, fm: { ratio: 14, idx: 0.6, d: 0.04 }, decay: 0.25 }],
  flt: { f: 1500 }, amp: { d: 3.6 }, drive: 0.25, lfo: [{ to: 'amp', rate: 3.2, depth: 0.3 }, { to: 'pan', rate: 3.2, depth: 0.6 }],
});
P('ep.bright', '電鋼琴', '明亮電鋼琴', 'Bright E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 2.8, d: 0.4, vel: 1, floor: 0.3 } },
    { w: 'sin', lvl: 0.22, fm: { ratio: 14, idx: 2.0, d: 0.06, vel: 1 }, decay: 0.5 }],
  flt: { f: 9000 },
});
P('ep.wurli', '電鋼琴', 'Wurlitzer 電鋼琴', 'Wurlitzer', 4, 'ep', {
  // Wurlitzer 是簧片＋靜電拾音：奇次泛音多、力度大會「吼」（拾音器的非線性）
  osc: [{ w: 'harm', harm: [1, 0.12, 0.45, 0.06, 0.2, 0.03, 0.08], lvl: 0.45, decay: 2.6 },
    { w: 'sin', lvl: 0.2, fm: { ratio: 2, idx: 1.4, d: 0.15, vel: 1 }, decay: 0.4 }],
  flt: { f: 4200, vel: 1.4 }, drive: 0.32, amp: { d: 3.2, r: 0.18 }, body: [[1000, 1.5, 3]],
  lfo: [{ to: 'amp', rate: 5.5, depth: 0.2 }],
});
P('ep.wurli2', '電鋼琴', '破音 Wurlitzer', 'Dirty Wurlitzer', 4, 'ep', {
  osc: [{ w: 'harm', harm: [1, 0.15, 0.55, 0.08, 0.3, 0.05, 0.12], lvl: 0.5, decay: 2.4 },
    { w: 'sin', lvl: 0.24, fm: { ratio: 2, idx: 1.8, d: 0.2, vel: 1 }, decay: 0.4 }],
  flt: { f: 3400, vel: 1.6 }, drive: 0.7, post: 3800, amp: { d: 2.8, r: 0.16 },
});
P('ep.dx', '電鋼琴', 'DX7 電鋼琴', 'DX7 E.Piano', 5, 'ep', {
  // DX7 經典 E.PIANO 1：兩組載波，一組 1:1 溫暖、一組 1:14 打擊金屬聲，左右微失諧
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 1.2, d: 1.2, vel: 1, floor: 0.2 }, pan: -0.3 },
    { w: 'sin', lvl: 0.42, cents: 3, fm: { ratio: 1, idx: 1.2, d: 1.2, vel: 1, floor: 0.2 }, pan: 0.3 },
    { w: 'sin', lvl: 0.2, fm: { ratio: 14, idx: 2.6, d: 0.04, vel: 1 }, decay: 0.15 }],
  flt: { f: 11000 }, drive: 0, amp: { d: 4 },
});
P('ep.tine', '電鋼琴', '鐵片電鋼琴', 'Tine E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.48, fm: { ratio: 1, idx: 1.2, d: 1.2, vel: 0.8, floor: 0.2 } },
    { w: 'sin', lvl: 0.24, oct: 2, decay: 0.8 }, { w: 'sin', lvl: 0.16, fm: { ratio: 9, idx: 2.4, d: 0.05 }, decay: 0.2 }],
  amp: { d: 4.2, r: 0.5 },
});
P('ep.bell', '電鋼琴', '鐘聲電鋼琴', 'Bell E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.36, fm: { ratio: 1, idx: 0.8, d: 1.0 } }, { w: 'sin', lvl: 0.3, fm: { ratio: 3.5, idx: 3.0, d: 1.0, vel: 1 } }],
  amp: { a: 0.001, d: 4.4, s: 0, r: 1.2 }, flt: { f: 9000 },
});
P('ep.soft', '電鋼琴', '柔和 FM 電鋼琴', 'Soft FM E.Piano', 4, 'ep', {
  flt: { f: 1800, vel: 0.4 }, amp: { a: 0.02, d: 3.4, s: 0.15, r: 0.6 },
  osc: [{ w: 'sin', lvl: 0.55, fm: { ratio: 1, idx: 0.5, d: 1.2, floor: 0.1 } }, { w: 'tri', lvl: 0.1, oct: -1 }],
});
P('ep.bark', '電鋼琴', '咬音電鋼琴', 'Bark E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.5, fm: { ratio: 1, idx: 3.6, d: 0.25, vel: 1.2, floor: 0.4 } },
    { w: 'sin', lvl: 0.14, fm: { ratio: 14, idx: 1.4, d: 0.05 }, decay: 0.3 }],
  drive: 0.4, flt: { f: 4400 }, post: 5000,
});
P('ep.phase', '電鋼琴', '相位電鋼琴', 'Phase E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.34, fm: { ratio: 1, idx: 1.6, d: 0.7, floor: 0.2 } }, { w: 'sin', lvl: 0.3, cents: 9, fm: { ratio: 1, idx: 1.6, d: 0.7, floor: 0.2 } }],
  flt: { f: 3200, type: 'nt', q: 0.9 }, lfo: [{ to: 'cutoff', rate: 0.35, depth: 1.6 }, { to: 'pan', rate: 0.45, depth: 0.4 }],
});
P('ep.clav', '電鋼琴', 'Clavinet', 'Clavinet', 7, 'ep', {
  // Clavinet：皮頭小槌把弦壓在金屬砧上，拾音器靠近琴橋 → 很薄、很亮、很短
  osc: [], str: { lvl: 0.6, bright: 1, ring: 0.95, pos: 0.04, decay: 1.6 }, amp: { a: 0.001, d: 6, s: 1, r: 0.06 },
  flt: { f: 5200, q: 1.2, key: 0.3, env: 0, vel: 1.2 }, body: [[1400, 2, 4]], drive: 0.15, gain: 0.7,
});
P('ep.clavfunk', '電鋼琴', '放克 Clav', 'Funk Clav', 7, 'ep', {
  osc: [], str: { lvl: 0.6, bright: 1, ring: 0.95, pos: 0.03, decay: 0.9 }, amp: { a: 0.001, d: 6, s: 1, r: 0.05 },
  flt: { f: 700, q: 4.5, key: 0.2, env: 3.2, a: 0.001, d: 0.16, s: 0.2, r: 0.1, vel: 1 }, drive: 0.3, gain: 0.66,
});
P('ep.harpsi', '電鋼琴', '大鍵琴', 'Harpsichord', 6, 'ep', {
  // 鳥羽撥片撥弦、兩排 8′ 弦微失諧＋一排 4′（高八度）
  osc: [], str: { lvl: 0.6, bright: 0.95, ring: 0.92, pos: 0.09, decay: 4.5, course: [[3, 0.8], [1200, 0.45]] },
  amp: { a: 0.001, d: 6, s: 1, r: 0.18 }, flt: { f: 9000, key: 0, env: 0, vel: 0 }, vcurve: 0.5, kdecay: 1,
  noise: { lvl: 0.08, hp: 4000, d: 0.006 }, body: [[180, 2, 4], [800, 2, 3], [2500, 2, 3]], gain: 0.72,
});
P('ep.harpsi8', '電鋼琴', '大鍵琴 8′', 'Harpsichord 8\'', 6, 'ep', {
  osc: [], str: { lvl: 0.6, bright: 0.85, ring: 0.85, pos: 0.13, decay: 4 }, amp: { a: 0.001, d: 6, s: 1, r: 0.2 },
  flt: { f: 7000, key: 0, env: 0, vel: 0 }, vcurve: 0.5, kdecay: 1, noise: { lvl: 0.06, hp: 4000, d: 0.006 },
  body: [[180, 2, 4], [800, 2, 3]], gain: 0.72,
});
P('ep.celesta', '電鋼琴', '鋼片琴', 'Celesta', 8, 'ep', {
  // 鋼片＋木製共鳴箱：幾乎是純音，起音有一點點敲擊的高分音
  osc: [], modes: { list: [[1, 1, 2.4], [2.76, 0.12, 0.25], [5.4, 0.06, 0.08], [4.0, 0.08, 0.5]], lvl: 0.5 },
  amp: { a: 0.001, d: 6, s: 1, r: 0.5 }, flt: { f: 9000, key: 0, env: 0 }, noise: { lvl: 0.05, lp: 1500, d: 0.012 },
  body: [[600, 2, 3]],
});
P('ep.toy', '電鋼琴', '玩具電鋼琴', 'Toy E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 2, idx: 2.4, d: 0.3, floor: 0.3 } }], flt: { f: 4200, q: 0.8 },
  amp: { a: 0.001, d: 1.2, s: 0, r: 0.3 }, post: 4000, drive: 0.1,
});
P('ep.choir', '電鋼琴', '電鋼琴＋人聲', 'E.Piano & Vox', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 1.6, d: 0.7, floor: 0.15 } }, { w: 'saw', lvl: 0.12, uni: 2, spread: 12, attack: 0.6 }],
  frm: { v: 'o', q: 8, lvl: 0.35 }, amp: { d: 3.4, s: 0.25, r: 0.7 },
});

// ────────────────────────── 風琴／簧片 ──────────────────────────
P('org.tonewheel', '風琴', '音輪風琴', 'Tonewheel Organ', 16, 'org', {
  osc: [drawbars('888000000')], noise: CLICK, lfo: leslie(false), drive: 0.08,
});
P('org.jazz', '風琴', '爵士風琴', 'Jazz Organ', 17, 'org', {
  // 爵士經典：888000000 ＋ 三次打擊泛音（2⅔′ 很快消失）
  osc: [drawbars('888000000'), { w: 'sin', lvl: 0.3, oct: 1, semi: 7, decay: 0.28 }], noise: CLICK,
  lfo: leslie(false), drive: 0.12,
});
P('org.rock', '風琴', '搖滾風琴', 'Rock Organ', 18, 'org', {
  osc: [drawbars('888888888')], noise: CLICK, lfo: leslie(true), drive: 0.55, post: 5500, gain: 0.55,
});
P('org.gospel', '風琴', '福音風琴', 'Gospel Organ', 16, 'org', {
  osc: [drawbars('888600008')], noise: CLICK, lfo: leslie(true), drive: 0.22,
});
P('org.church', '風琴', '管風琴', 'Church Organ', 19, 'org', {
  // 主管（Principal 8′＋4′）：起音的「噗」（chiff）＋管子的諧波
  osc: [{ w: 'harm', harm: [1, 0.55, 0.28, 0.32, 0.12, 0.14, 0.05, 0.08], lvl: 0.5 }, { w: 'harm', harm: [1, 0.3, 0.1], oct: 1, lvl: 0.25 }],
  amp: { a: 0.07, r: 0.35 }, flt: { f: 7000 }, noise: { lvl: 0.1, bp: 1, kt: 3, q: 2, a: 0.01, d: 0.06, s: 0.08, r: 0.2 },
  body: [[200, 1, 2]], gain: 0.6,
});
P('org.pipeflute', '風琴', '管風琴笛音', 'Pipe Flute Stop', 19, 'org', {
  // 閉管長笛（Gedackt）：偶次泛音很弱
  osc: [{ w: 'harm', harm: [1, 0.04, 0.22, 0.02, 0.06], lvl: 0.55 }],
  amp: { a: 0.05, r: 0.2 }, noise: { lvl: 0.14, bp: 1, kt: 2, q: 2.5, a: 0.008, d: 0.05, s: 0.12, r: 0.1 }, flt: { f: 5000 },
});
P('org.full', '風琴', '管風琴全奏', 'Full Organ', 19, 'org', {
  // 全開：16′＋8′＋4′＋2⅔′＋2′＋混合音栓＋簧管
  osc: [{ w: 'harm', harm: [1, 0.5, 0.35, 0.3, 0.2, 0.2, 0.1, 0.12], lvl: 0.4, oct: -1 }, { w: 'saw', lvl: 0.16 },
    { w: 'harm', harm: [1, 0.4, 0.3], lvl: 0.2, oct: 1 }, { w: 'sin', lvl: 0.12, oct: 1, semi: 7 }, { w: 'sin', lvl: 0.1, oct: 2 }],
  amp: { a: 0.08, r: 0.6 }, flt: { f: 6500 }, noise: { lvl: 0.06, bp: 1, kt: 3, q: 2, d: 0.06 }, gain: 0.5,
});
P('org.reed', '風琴', '簧風琴', 'Reed Organ', 20, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.8, 0.7, 0.55, 0.45, 0.35, 0.3, 0.22, 0.18, 0.12], lvl: 0.45 }],
  amp: { a: 0.04, r: 0.12 }, flt: { f: 3600 }, body: [[700, 2, 4], [1800, 2, 3]],
});
P('org.pump', '風琴', '腳踏簧風琴', 'Pump Organ', 20, 'org', {
  // 腳踩風箱：風壓不穩 → 音量微微起伏、帶氣聲
  osc: [{ w: 'harm', harm: [1, 0.6, 0.6, 0.35, 0.3, 0.18, 0.12], lvl: 0.45 }], noise: { lvl: 0.06, bp: 900, q: 1, a: 0.05, d: 0.2, s: 0.5 },
  amp: { a: 0.07, r: 0.2 }, flt: { f: 2600 }, lfo: [{ to: 'amp', rate: 0.9, depth: 0.25 }], body: [[500, 2, 4]],
});
P('org.accordion', '風琴', '手風琴', 'Accordion', 21, 'org', {
  // 一個鍵兩片簧片，故意調差幾音分 → 典型的「嗡嗡」拍音
  osc: [{ w: 'harm', harm: [1, 0.85, 0.65, 0.5, 0.42, 0.3, 0.25, 0.18, 0.12], lvl: 0.36 },
    { w: 'harm', harm: [1, 0.85, 0.65, 0.5, 0.42, 0.3, 0.25, 0.18, 0.12], lvl: 0.32, cents: 12 }],
  amp: { a: 0.03, d: 0.08, s: 1, r: 0.1 }, vcurve: 0.8, flt: { f: 4200, vel: 1 }, body: [[1200, 2, 4], [2600, 2, 3]], jit: 1.5,
});
P('org.musette', '風琴', '法式手風琴', 'French Musette', 21, 'org', {
  // 三片簧片：一片準、一片偏高、一片偏低 → 很濕的 musette 顫音
  osc: [{ w: 'harm', harm: [1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18], lvl: 0.3 },
    { w: 'harm', harm: [1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18], lvl: 0.27, cents: 22 },
    { w: 'harm', harm: [1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18], lvl: 0.27, cents: -20 }],
  amp: { a: 0.03, d: 0.08, s: 1, r: 0.12 }, vcurve: 0.8, flt: { f: 4400, vel: 1 }, body: [[1200, 2, 3]],
});
P('org.harmonium', '風琴', '簧片風琴', 'Harmonium', 20, 'org', {
  // 印度手風琴（harmonium）：單手打風、鼻音很重
  osc: [{ w: 'harm', harm: [1, 0.9, 0.85, 0.6, 0.5, 0.45, 0.3, 0.25], lvl: 0.42 }, { w: 'harm', harm: [1, 0.5, 0.3], oct: -1, lvl: 0.2 }],
  noise: { lvl: 0.05, bp: 1100, q: 1, a: 0.05, d: 0.3, s: 0.6 }, amp: { a: 0.06, r: 0.15 }, flt: { f: 3800 },
  body: [[900, 3, 6], [2200, 3, 4]], lfo: [{ to: 'amp', rate: 1.4, depth: 0.15 }],
});
P('org.perc', '風琴', '風琴打音', 'Percussive Organ', 17, 'org', {
  osc: [drawbars('800000000'), { w: 'sin', lvl: 0.34, oct: 1, decay: 0.22 }], noise: CLICK, lfo: leslie(false),
});
P('org.calliope', '風琴', '汽笛琴', 'Calliope', 82, 'org', {
  // 汽笛琴：蒸汽吹開放的哨管，氣聲很多、顫音很大
  osc: [{ w: 'harm', harm: [1, 0.3, 0.12, 0.05], lvl: 0.45 }], noise: { lvl: 0.16, bp: 1, kt: 2, q: 1.6, a: 0.02, d: 0.1, s: 0.6 },
  amp: { a: 0.03, r: 0.1 }, flt: { f: 5000 }, lfo: [{ to: 'pitch', rate: 6.2, depth: 0.18, delay: 0.1 }], jit: 6,
});

// ────────────────────────── 鐘琴／打擊鍵盤 ──────────────────────────
// 分音比例都是實測值：自由振動的金屬棒 1 : 2.756 : 5.404 : 8.933，
// 調過音的木琴片（馬林巴 1 : 3.9 : 9.2、高音木琴 1 : 3 : 6）……
P('bel.glock', '打擊鍵盤', '鐘琴', 'Glockenspiel', 9, 'bel', {
  modes: { list: [[1, 1, 3.2], [2.756, 0.32, 1.1], [5.404, 0.16, 0.45], [8.933, 0.06, 0.2]], vt: 0.5, lvl: 0.5 },
  noise: { lvl: 0.1, hp: 4000, d: 0.006 },
});
P('bel.musicbox', '打擊鍵盤', '音樂盒', 'Music Box', 10, 'bel', {
  // 鋼梳齒＝懸臂樑：1 : 6.27 : 17.55，撥一下就「叮」
  modes: { list: [[1, 1, 2.6], [6.27, 0.22, 0.45], [17.55, 0.06, 0.1]], lvl: 0.5 },
  noise: { lvl: 0.08, hp: 5000, d: 0.004 }, body: [[900, 3, 5], [2400, 3, 3]],
});
P('bel.tubular', '打擊鍵盤', '管鐘', 'Tubular Bells', 14, 'bel', {
  // 聽到的音高其實是第 4、5、6 模態（比例約 2 : 3 : 4）的「虛擬基音」
  modes: { list: [[1, 1, 6], [1.5, 0.55, 4.5], [2.0, 0.5, 4], [2.74, 0.3, 3], [3.6, 0.18, 2], [0.61, 0.06, 3]], beat: [[3, 0.5, 1]], lvl: 0.5 },
  noise: { lvl: 0.06, hp: 2000, d: 0.01 }, amp: { r: 2 },
});
P('bel.church', '打擊鍵盤', '教堂鐘', 'Church Bell', 14, 'bel', {
  // 西洋鐘的五個分音：hum（低八度）、prime、小三度 tierce、五度 quint、nominal
  modes: { list: [[0.5, 0.45, 9], [1, 1, 6], [1.2, 0.6, 4], [1.5, 0.3, 3], [2, 0.6, 2.5], [2.5, 0.25, 1.6], [3, 0.2, 1.2], [4, 0.12, 0.8]], beat: [[4, 0.6, 1]], lvl: 0.5 },
  noise: { lvl: 0.1, bp: 2500, q: 1, d: 0.02 }, amp: { r: 3.5 }, kdecay: 0.4, gain: 0.62,
});
P('bel.gong', '打擊鍵盤', '鑼', 'Gong', 14, 'bel', {
  // 大鑼：上百個分音緩慢湧出（起音慢的高分音）＋低沉的主音
  modes: { list: [[1, 1, 8], [1.52, 0.5, 6, 0.05], [2.03, 0.4, 5, 0.12], [2.61, 0.35, 4, 0.25], [3.17, 0.3, 3, 0.35], [3.89, 0.25, 2.6, 0.5], [4.63, 0.2, 2, 0.6], [5.4, 0.18, 1.6, 0.7], [6.3, 0.12, 1.2, 0.8]], beat: [[9, 0.6, 1]], lvl: 0.5 },
  noise: { lvl: 0.06, lp: 400, d: 0.08 }, amp: { r: 4 }, kdecay: 0.3, gain: 0.55,
});
P('bel.chime', '打擊鍵盤', '風鈴', 'Wind Chime', 112, 'bel', {
  modes: { list: [[1, 1, 4], [2.756, 0.45, 2.4], [5.404, 0.22, 1.2], [8.933, 0.1, 0.6]], beat: [[7, 0.5, 1]], lvl: 0.5 },
  noise: { lvl: 0.05, hp: 6000, d: 0.004 }, amp: { r: 2 }, kdecay: 0.4,
});
P('bel.steel', '打擊鍵盤', '鋼鼓', 'Steel Drum', 114, 'bel', {
  // 鋼鼓的每個音區都調成 1 : 2 : 3（八度＋十二度），敲擊點硬 → 起音很亮
  modes: { list: [[1, 1, 1.4], [2.0, 0.7, 0.9], [3.0, 0.35, 0.5], [4.02, 0.15, 0.25]], vt: 0.8, lvl: 0.5 },
  noise: { lvl: 0.1, bp: 3000, q: 1, d: 0.01 }, body: [[700, 1.5, 3]], penv: { amt: 12, d: 0.03 },
});
P('bel.marimba', '打擊鍵盤', '木琴', 'Marimba', 12, 'bel', {
  // 紅木琴片＋下方的共鳴管（加強基音、延長）
  modes: { list: [[1, 1, 1.3], [3.93, 0.22, 0.28], [9.2, 0.05, 0.08]], vt: 0.8, lvl: 0.5 },
  noise: { lvl: 0.12, lp: 700, d: 0.012, vel: 0.6 }, kdecay: 1.2,
});
P('bel.xylo', '打擊鍵盤', '木琴（高音）', 'Xylophone', 13, 'bel', {
  modes: { list: [[1, 1, 0.55], [3.0, 0.45, 0.3], [6.0, 0.15, 0.12], [10.1, 0.05, 0.05]], vt: 0.5, lvl: 0.5 },
  noise: { lvl: 0.18, hp: 2500, d: 0.008 }, kdecay: 1.2,
});
P('bel.vibes', '打擊鍵盤', '顫音琴', 'Vibraphone', 11, 'bel', {
  // 鋁片 1 : 4 : 10 ＋ 共鳴管上的旋轉碟片（馬達）造成的音量顫動
  modes: { list: [[1, 1, 5], [4.0, 0.16, 1.4], [10.0, 0.04, 0.4]], vt: 0.6, lvl: 0.5 },
  noise: { lvl: 0.05, lp: 1500, d: 0.01 }, lfo: [{ to: 'amp', rate: 5.2, depth: 0.55 }], amp: { r: 1.4 }, kdecay: 0.6,
});
P('bel.kalimba', '打擊鍵盤', '卡林巴', 'Kalimba', 108, 'bel', {
  modes: { list: [[1, 1, 2.2], [5.9, 0.18, 0.3], [2.0, 0.05, 1.5]], lvl: 0.5 },
  noise: { lvl: 0.12, bp: 1200, q: 1, d: 0.01 }, body: [[320, 3, 6], [900, 2, 2]], kdecay: 1,
});
P('bel.handpan', '打擊鍵盤', '手碟', 'Handpan', 108, 'bel', {
  // 每個音區調成 基音 : 八度 : 複合五度，用手指拍，起音軟
  modes: { list: [[1, 1, 4, 0.004], [2, 0.5, 2.8, 0.004], [3, 0.25, 1.8, 0.004], [0.5, 0.06, 2]], beat: [[2, 0.4, 1]], vt: 1, lvl: 0.5 },
  noise: { lvl: 0.12, lp: 300, d: 0.03 }, body: [[180, 3, 4]], amp: { r: 1.6 }, kdecay: 0.6,
});
P('bel.glass', '打擊鍵盤', '玻璃琴', 'Glass Armonica', 8, 'bel', {
  // 濕手指摩擦旋轉的玻璃碗：持續、幾乎純音、帶一點「嗡」
  modes: undefined, osc: [{ w: 'harm', harm: [1, 0.04, 0.08, 0.02], lvl: 0.5 }, { w: 'sin', lvl: 0.06, semi: 0, oct: 1, cents: 14 }],
  amp: { a: 0.25, d: 0.5, s: 0.9, r: 0.9 }, noise: { lvl: 0.02, bp: 1, kt: 4, q: 4, a: 0.2, d: 0.5, s: 0.7 }, jit: 2, jitA: 0.04,
});
P('bel.bellfm', '打擊鍵盤', 'FM 鐘', 'FM Bell', 9, 'bel', {
  modes: undefined, osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 3.5, idx: 4, d: 1.4, vel: 1 } }],
  amp: { a: 0.001, d: 3, s: 0, r: 1.4 }, kdecay: 0.6,
});
P('bel.temple', '打擊鍵盤', '寺廟鐘', 'Temple Bell', 14, 'bel', {
  // 東方梵鐘：用木槌撞，聲音很低、「嗡——」拖很長、拍音明顯
  modes: { list: [[1, 1, 12], [1.55, 0.3, 6], [2.3, 0.45, 5], [2.9, 0.25, 3.5], [4.1, 0.15, 2.2], [5.3, 0.08, 1.4]], beat: [[3.5, 0.9, 1]], lvl: 0.5 },
  noise: { lvl: 0.14, lp: 500, d: 0.05 }, amp: { r: 5 }, kdecay: 0.3, gain: 0.62,
});
P('bel.agogo', '打擊鍵盤', '阿哥哥鈴', 'Agogo Bells', 113, 'bel', {
  modes: { list: [[1, 1, 0.8], [1.47, 0.6, 0.5], [2.09, 0.4, 0.35], [2.56, 0.3, 0.25], [3.7, 0.15, 0.15]], lvl: 0.5 },
  noise: { lvl: 0.12, hp: 2000, d: 0.006 },
});

// ────────────────────────────── 吉他 ──────────────────────────────
// 波導弦：bright 撥得多亮、ring 弦本身多「響」（鋼弦高，尼龍低）、pos 撥弦位置、body 琴身
P('gtr.nylon', '吉他', '古典吉他（尼龍弦）', 'Nylon Guitar', 24, 'gtr', {
  str: { bright: 0.45, ring: 0.3, pos: 0.18, decay: 3.2 }, body: BODY.nylon,
  noise: { lvl: 0.04, lp: 1200, d: 0.01 },
});
P('gtr.steel', '吉他', '民謠吉他（鋼弦）', 'Steel Guitar', 25, 'gtr', { body: BODY.steel });
P('gtr.twelve', '吉他', '十二弦吉他', '12-String Guitar', 25, 'gtr', {
  // 每組兩根弦：一根高八度、一根同音微失諧 → 閃亮、像合唱
  str: { bright: 0.85, ring: 0.8, decay: 4.5, course: [[1200, 0.6], [4, 0.8]] }, body: BODY.steel,
});
P('gtr.jumbo', '吉他', '大型鋼弦吉他', 'Jumbo Acoustic', 25, 'gtr', {
  str: { bright: 0.65, ring: 0.75, pos: 0.16, decay: 5 }, body: [[88, 4, 8], [180, 3, 6], [360, 2, 2], [2400, 1.5, 2]],
});
P('gtr.electric', '吉他', '清音電吉他', 'Clean Electric', 27, 'gtr', {
  // 實心琴身＝沒有共鳴箱；拾音器（線圈＋電容）在 3–4 kHz 有一個共振峰
  str: { bright: 0.6, ring: 0.9, pos: 0.1, decay: 6 }, noise: undefined,
  body: [[3400, 2.4, 6]], flt: { f: 5200, key: 0 }, kdecay: 0.7,
});
P('gtr.jazz', '吉他', '爵士吉他', 'Jazz Guitar', 26, 'gtr', {
  // 琴頸拾音器（靠近弦中段）＋粗的平滑弦＋旋鈕關小
  str: { bright: 0.4, ring: 0.7, pos: 0.28, decay: 4.5 }, flt: { f: 1500, key: 0.2 }, body: [[220, 3, 3], [1300, 2, 2]],
  noise: undefined,
});
P('gtr.mute', '吉他', '悶音吉他', 'Muted Guitar', 28, 'gtr', {
  // 右手掌側壓在琴橋上：高音被吃掉、衰減極快
  str: { bright: 0.55, ring: 0.1, pos: 0.12, decay: 0.28 }, flt: { f: 3200 }, body: [[3000, 2.4, 4]], noise: { lvl: 0.06 },
});
P('gtr.funk', '吉他', '放克刷弦', 'Funk Guitar', 28, 'gtr', {
  str: { bright: 0.95, ring: 0.7, pos: 0.06, decay: 1.2 }, flt: { f: 900, q: 3, env: 2.6, a: 0.001, d: 0.2, s: 0.3, r: 0.1, key: 0.2 },
  body: [[3600, 2.4, 5]], noise: { lvl: 0.1 }, amp: { r: 0.08 },
});
P('gtr.dist', '吉他', '破音吉他', 'Distorted Guitar', 30, 'gtr', {
  // 真的弦＋強力削波＋音箱（削波後再過喇叭的低通，才不會刺耳）
  str: { bright: 0.7, ring: 0.9, pos: 0.08, decay: 8 }, drive: 0.85, post: 4600, noise: undefined,
  body: [[110, 1.2, 4], [800, 1.4, -4], [2100, 1.6, 5]], flt: { f: 7000, key: 0 }, kdecay: 0.5, gain: 0.5,
});
P('gtr.heavy', '吉他', '重金屬吉他', 'Heavy Guitar', 30, 'gtr', {
  // 強力和弦：根音＋五度一起撥
  str: { bright: 0.8, ring: 0.9, pos: 0.07, decay: 8, course: [[702, 0.85]] }, drive: 1, post: 3600, noise: undefined,
  body: [[95, 1.2, 6], [650, 1.4, -6], [1900, 1.6, 5]], flt: { f: 6000, key: 0 }, kdecay: 0.4, gain: 0.45,
});
P('gtr.harm', '吉他', '泛音吉他', 'Harmonic Guitar', 31, 'gtr', {
  // 自然泛音：輕觸 12 品，只剩偶數分音 → 像鐘一樣透明
  str: undefined, modes: { list: [[1, 1, 3.5], [2, 0.18, 2], [3, 0.08, 1.2], [4, 0.04, 0.8]], lvl: 0.5 },
  body: BODY.steel, noise: { lvl: 0.04, hp: 3000, d: 0.006 },
});
P('gtr.banjo', '吉他', '斑鳩琴', 'Banjo', 105, 'gtr', {
  // 琴身是一面鼓：鼓皮的共振很尖，聲音乾、亮、短
  str: { bright: 0.95, ring: 0.85, pos: 0.07, decay: 1.8 }, body: [[380, 5, 8], [1450, 3, 4], [3200, 2, 6]],
  noise: { lvl: 0.1, hp: 3000, d: 0.006 },
});
P('gtr.mandolin', '吉他', '曼陀林', 'Mandolin', 105, 'gtr', {
  str: { bright: 0.92, ring: 0.85, pos: 0.09, decay: 1.8, course: [[5, 1]] }, body: [[200, 4, 5], [650, 3, 4], [2100, 2, 4]],
  noise: { lvl: 0.1, hp: 3500, d: 0.006 },
});
P('gtr.ukulele', '吉他', '烏克麗麗', 'Ukulele', 105, 'gtr', {
  str: { bright: 0.55, ring: 0.35, pos: 0.2, decay: 1.8 }, body: [[260, 4, 7], [500, 3, 4], [2000, 2, 2]],
  noise: { lvl: 0.05, lp: 1500, d: 0.008 },
});
P('gtr.harp', '吉他', '豎琴', 'Concert Harp', 46, 'gtr', {
  // 在弦的中段撥 → 偶次泛音少，聲音圓；共鳴板大、尾音長
  str: { bright: 0.5, ring: 0.55, pos: 0.48, decay: 6 }, body: [[150, 2, 4], [420, 2, 2]], noise: undefined,
  amp: { r: 0.9 }, kdecay: 1.2,
});
P('gtr.dulcimer', '吉他', '揚琴', 'Hammered Dulcimer', 15, 'gtr', {
  // 西洋揚琴：木槌敲一組 2～3 根弦
  str: { bright: 0.85, ring: 0.85, pos: 0.12, decay: 4.5, course: [[3, 1], [-3, 0.9]] }, body: [[240, 3, 4], [900, 2, 3]],
  noise: { lvl: 0.1, lp: 1500, d: 0.01 }, amp: { r: 0.7 },
});
P('gtr.reso', '吉他', '共振吉他', 'Resonator Guitar', 25, 'gtr', {
  // 金屬錐盆取代木頭面板：鼻音、金屬味
  str: { bright: 0.9, ring: 0.95, pos: 0.1, decay: 3.5 }, body: [[820, 6, 9], [1650, 5, 6], [3300, 3, 4]], drive: 0.08,
});
P('gtr.lofi', '吉他', '錄音帶吉他', 'Lo-fi Guitar', 25, 'gtr', {
  str: { bright: 0.55, ring: 0.6, decay: 3 }, body: BODY.steel, post: 2600, drive: 0.15,
  lfo: [{ to: 'pitch', rate: 0.6, depth: 0.08 }], jit: 6, jitA: 0.01,
});

// ────────────────────────────── 貝斯 ──────────────────────────────
P('bas.finger', '貝斯', '指彈電貝斯', 'Finger Bass', 33, 'ebs', {
  str: { bright: 0.5, ring: 0.55, pos: 0.22, decay: 3.4 }, body: [[110, 1.5, 3], [800, 2, 2]],
});
P('bas.pick', '貝斯', '匹克貝斯', 'Pick Bass', 34, 'ebs', {
  str: { bright: 0.85, ring: 0.7, pos: 0.1, decay: 3 }, flt: { f: 4200 }, noise: { lvl: 0.08, hp: 2500, d: 0.006 },
  body: [[90, 1.5, 3], [1600, 2, 4]],
});
P('bas.slap', '貝斯', '擊弦貝斯', 'Slap Bass', 36, 'ebs', {
  // 拇指打弦、弦打在琴格上：很亮的「啪」＋挖掉中頻（slap 的經典 EQ）
  str: { bright: 1, ring: 0.9, pos: 0.05, decay: 2.2 }, flt: { f: 8000 }, noise: { lvl: 0.18, bp: 2600, q: 1, d: 0.012 },
  body: [[80, 1.5, 5], [500, 1.2, -6], [2600, 1.6, 6]],
});
P('bas.fretless', '貝斯', '無琴格貝斯', 'Fretless Bass', 35, 'ebs', {
  // 沒有琴格：手指壓在指板上 → 很有「哇」的鼻音（mwah）
  str: { bright: 0.55, ring: 0.85, pos: 0.15, decay: 4.2 }, body: [[700, 3, 5], [1400, 3, 2]],
  lfo: [{ to: 'pitch', rate: 4.8, depth: 0.1, delay: 0.35 }],
});
P('bas.sub', '貝斯', '低頻貝斯', 'Sub Bass', 38, 'bas', {
  osc: [{ w: 'sin', lvl: 0.5 }], sub: { wave: 'sin', oct: -1, lvl: 0.4 }, flt: { f: 400, env: 0.4 }, amp: { a: 0.006, d: 1.4, s: 0.8, r: 0.15 },
});
P('bas.synth', '貝斯', '合成貝斯', 'Synth Bass', 38, 'bas', {});
P('bas.acid', '貝斯', '303 貝斯', 'Acid 303', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.42 }], sub: { lvl: 0 }, flt: { f: 320, q: 6.0, env: 3.6, a: 0.001, d: 0.22, s: 0.05, slope: 2 },
  amp: { a: 0.002, d: 0.4, s: 0.5, r: 0.08 }, drive: 0.2,
});
P('bas.fm', '貝斯', 'FM 貝斯', 'FM Bass', 39, 'bas', {
  osc: [{ w: 'sin', lvl: 0.44, fm: { ratio: 1, idx: 3.4, d: 0.2, floor: 0.6, fb: 0.4 } }], sub: { lvl: 0.16 },
  flt: { f: 3400, q: 0.8, env: 1.0, d: 0.22 }, amp: { a: 0.003, d: 0.8, s: 0.5, r: 0.1 },
});
P('bas.reese', '貝斯', '里斯貝斯', 'Reese Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 18 }], sub: { lvl: 0.34 },
  flt: { f: 420, q: 1.6, env: 0.6 }, amp: { a: 0.02, d: 1.0, s: 0.85, r: 0.15 }, drive: 0.15,
});
P('bas.growl', '貝斯', '咆哮貝斯', 'Growl Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.32, uni: 2, spread: 8 }], sub: { lvl: 0.3 },
  flt: { f: 520, q: 3.4, env: 2.0, d: 0.4 }, drive: 0.45, lfo: [{ to: 'cutoff', rate: 6.5, depth: 0.8 }],
  frm: { v: 'o', v2: 'a', morph: 0.5, voice: 'bass', q: 8, lvl: 0.4 },
});
P('bas.upright', '貝斯', '低音提琴', 'Upright Bass', 32, 'ebs', {
  // 腸弦、手指在弦中段撥：圓、悶、短，大琴身共鳴＋手指打到指板的「咚」
  str: { bright: 0.42, ring: 0.3, pos: 0.26, decay: 1.8 }, body: BODY.dbass, flt: { f: 1400 },
  noise: { lvl: 0.1, lp: 300, d: 0.03 },
});
P('bas.upright2', '貝斯', '撥奏低音提琴', 'Pizzicato Bass', 45, 'ebs', {
  str: { bright: 0.5, ring: 0.4, pos: 0.2, decay: 1.1 }, body: BODY.dbass, flt: { f: 2200 },
  noise: { lvl: 0.06, lp: 400, d: 0.02 },
});
P('bas.perc', '貝斯', '打擊貝斯', 'Percussive Bass', 37, 'bas', {
  osc: [{ w: 'tri', lvl: 0.4 }], flt: { f: 700, q: 2.0, env: 2.6, d: 0.12 }, amp: { a: 0.001, d: 0.35, s: 0.1, r: 0.08 },
  penv: { amt: 300, d: 0.05 },
});
P('bas.pluck', '貝斯', '撥弦合成貝斯', 'Pluck Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.36 }, { w: 'sqr', lvl: 0.16, oct: 1, decay: 0.15 }],
  flt: { f: 380, q: 3.0, env: 3.2, d: 0.16 }, amp: { a: 0.001, d: 0.6, s: 0.25, r: 0.1 },
});
P('bas.dist', '貝斯', '破音貝斯', 'Distorted Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.36 }, { w: 'sqr', lvl: 0.18 }], drive: 0.7, post: 3000,
  flt: { f: 900, q: 1.4, env: 1.8, d: 0.3 }, amp: { a: 0.002, d: 0.6, s: 0.6, r: 0.1 },
});
P('bas.moog', '貝斯', 'Moog 貝斯', 'Moog Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.32 }, { w: 'sqr', lvl: 0.22, cents: -6 }],
  flt: { f: 300, q: 4.0, env: 2.8, d: 0.3, slope: 2 }, amp: { a: 0.003, d: 0.8, s: 0.55, r: 0.1 }, drive: 0.1,
});
P('bas.808', '貝斯', '808 低音', '808 Sub', 38, 'bas', {
  osc: [{ w: 'sin', lvl: 0.6 }], sub: { lvl: 0.35 }, flt: { f: 300, env: 0.5 },
  amp: { a: 0.004, d: 2.2, s: 0.3, r: 0.3 }, penv: { amt: 120, d: 0.035 }, gain: 0.9, drive: 0.15,
});
P('bas.old', '貝斯', '老電貝斯', 'Vintage Bass', 33, 'ebs', {
  // 平滑弦＋琴橋下塞海綿（60 年代 Motown 的悶「噗」）
  str: { bright: 0.35, ring: 0.15, pos: 0.25, decay: 0.8 }, flt: { f: 1200 }, body: [[120, 1.5, 4]], drive: 0.1,
});

// ────────────────────────────── 弦樂 ──────────────────────────────
// 拉弓＝亥姆霍茲運動（近似鋸齒）＋弓毛的沙沙聲；四把琴的差別主要在琴身共鳴的位置。
P('str.ensemble', '弦樂', '弦樂合奏', 'String Ensemble', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 5, spread: 11, wide: 0.7 }], amp: { a: 0.22, r: 0.55 },
  lfo: [{ to: 'pitch', rate: 5.2, depth: 0.05, delay: 0.4 }], flt: { f: 4400 }, gain: 0.5,
});
P('str.solo', '弦樂', '獨奏小提琴', 'Solo Violin', 40, 'str', { body: BODY.violin, flt: { f: 7000, key: 0.1 }, noise: { lvl: 0.05, hp: 3500 } });
P('str.viola', '弦樂', '中提琴', 'Viola', 41, 'str', {
  body: BODY.viola, flt: { f: 3000 }, noise: { lvl: 0.03, hp: 1800 }, lfo: [{ to: 'pitch', rate: 5.3, depth: 0.12, delay: 0.35 }],
});
P('str.cello', '弦樂', '大提琴', 'Cello', 42, 'str', {
  body: BODY.cello, flt: { f: 1900 }, amp: { a: 0.11, r: 0.4 }, noise: { lvl: 0.025, hp: 1100 },
  lfo: [{ to: 'pitch', rate: 5.0, depth: 0.12, delay: 0.38 }],
});
P('str.bass', '弦樂', '低音提琴（弓奏）', 'Contrabass', 43, 'str', {
  body: BODY.dbass, flt: { f: 1100, key: 0 }, amp: { a: 0.16, r: 0.45 }, noise: { hp: 700, lvl: 0.06 }, drive: 0.06,
  lfo: [{ to: 'pitch', rate: 4.6, depth: 0.08, delay: 0.45 }],
});
P('str.pizz', '弦樂', '撥奏弦樂', 'Pizzicato Strings', 45, 'gtr', {
  // 一整組撥奏：幾把琴各差一點點音準與時間
  str: { bright: 0.55, ring: 0.45, pos: 0.25, decay: 0.9, course: [[6, 0.8], [-7, 0.7]] }, body: BODY.violin,
  noise: undefined, amp: { r: 0.3 },
});
P('str.trem', '弦樂', '震音弦樂', 'Tremolo Strings', 44, 'str', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 4, spread: 10, wide: 0.7 }], lfo: [{ to: 'amp', rate: 13, depth: 0.7, shape: 'tri' }, { to: 'cutoff', rate: 13, depth: 0.3, shape: 'tri' }],
  amp: { a: 0.06, r: 0.3 }, noise: { lvl: 0.06, a: 0.01, s: 0.7 },
});
P('str.spicc', '弦樂', '斷奏弦樂', 'Spiccato Strings', 44, 'str', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 4, spread: 10, wide: 0.7 }], amp: { a: 0.006, d: 0.16, s: 0, r: 0.12 }, lfo: [],
  flt: { f: 2600, env: 1.6, a: 0.002, d: 0.08, s: 0.2 }, noise: { lvl: 0.1, a: 0.001, d: 0.05, s: 0 },
});
P('str.octave', '弦樂', '八度弦樂', 'Octave Strings', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.22, uni: 4, spread: 10, wide: 0.6 }, { w: 'saw', lvl: 0.24, oct: 1, uni: 3, spread: 9, wide: 0.6 }],
  amp: { a: 0.2, r: 0.5 }, flt: { f: 7000 },
});
P('str.pad', '弦樂', '弦樂鋪底', 'String Pad', 49, 'str', {
  amp: { a: 0.6, d: 1.0, s: 0.9, r: 1.6 }, flt: { f: 2400, env: 0.8, a: 0.8, s: 0.6 }, gain: 0.44,
  osc: [{ w: 'saw', lvl: 0.28, uni: 5, spread: 16, wide: 0.8 }], noise: undefined, lfo: [], jit: 0,
  body: [[300, 1, 3]],
});
P('str.chamber', '弦樂', '室內弦樂', 'Chamber Strings', 48, 'str', {
  // 小編制：三把琴、各有各的揉弦
  osc: [{ w: 'saw', lvl: 0.24, cents: -5, pan: -0.5 }, { w: 'saw', lvl: 0.24, cents: 4, pan: 0.5 }, { w: 'saw', lvl: 0.2, cents: 1 }],
  amp: { a: 0.13, r: 0.42 }, lfo: [{ to: 'pitch', rate: 5.5, depth: 0.1, delay: 0.3 }],
});
P('str.sul', '弦樂', '泛音弦樂', 'Sul Ponticello', 44, 'str', {
  // 靠近琴橋拉：基音很弱、高泛音很強，像玻璃
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 9 }], flt: { type: 'hp', f: 900, key: 0.6, q: 0.7, env: 0 },
  amp: { a: 0.2, r: 0.5 }, noise: { lvl: 0.1, hp: 4000, s: 0.8 }, body: [[2600, 2, 8], [4800, 2, 6]],
  lfo: [{ to: 'amp', rate: 7, depth: 0.15 }],
});
P('str.epic', '弦樂', '史詩弦樂', 'Epic Strings', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 5, spread: 12, wide: 0.8 }, { w: 'saw', lvl: 0.14, oct: -1, uni: 3, spread: 8 }],
  flt: { f: 3000, vel: 1.8 }, amp: { a: 0.25, s: 0.9, r: 0.8 }, gain: 0.46, body: BODY.cello.concat([[2600, 2, 4]]),
});
P('str.trem2', '弦樂', '顫弓', 'Bowed Tremolo', 44, 'str', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 3, spread: 9 }], lfo: [{ to: 'amp', rate: 8, depth: 0.55 }, { to: 'cutoff', rate: 2.5, depth: 0.6 }],
  noise: { lvl: 0.08, s: 0.8 }, body: BODY.viola,
});
P('str.choir', '弦樂', '弦樂合唱', 'String Choir', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 4, spread: 14, wide: 0.7 }], frm: { v: 'a', v2: 'o', morph: 0.4, q: 8, lvl: 0.45 },
  amp: { a: 0.3, r: 0.6 }, body: [], noise: undefined,
});
P('str.mute', '弦樂', '弱音弦樂', 'Muted Strings', 44, 'str', {
  // 弱音器夾在琴橋上：琴橋丘被壓掉 → 柔、悶、遠
  osc: [{ w: 'saw', lvl: 0.3, uni: 3, spread: 8 }], flt: { f: 1800, vel: 0.6 },
  amp: { a: 0.16, r: 0.45 }, body: [[275, 5, 6], [500, 5, 5], [2600, 2, -8]],
});

// ────────────────────────── 管樂／簧片／銅管 ──────────────────────────
// 吹管：harm 是那支管子的諧波比例；noise.kt = 氣音中心頻率是音高的幾倍（跟著音高走）
P('wnd.flute', '管樂', '長笛', 'Flute', 73, 'wnd', {
  osc: [{ w: 'harm', harm: [1, 0.32, 0.12, 0.05, 0.02], lvl: 0.48 }],
  noise: { lvl: 0.09, bp: 1, kt: 2, q: 1.6, a: 0.02, d: 0.06, s: 0.45, r: 0.08, vel: 0.4 },
  flt: { f: 6000, vel: 1.6 }, amp: { a: 0.06, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.08, delay: 0.3 }, { to: 'amp', rate: 5.0, depth: 0.12, delay: 0.3 }],
});
P('wnd.picc', '管樂', '短笛', 'Piccolo', 72, 'wnd', {
  osc: [{ w: 'harm', harm: [1, 0.18, 0.05], lvl: 0.5 }], noise: { lvl: 0.08, bp: 1, kt: 2.5, q: 2, a: 0.015, d: 0.05, s: 0.4 },
  flt: { f: 9000 }, amp: { a: 0.04, r: 0.1 }, lfo: [{ to: 'pitch', rate: 5.8, depth: 0.07, delay: 0.25 }],
});
P('wnd.recorder', '管樂', '直笛', 'Recorder', 74, 'wnd', {
  // 木頭直笛：比長笛更「純」、起音有明顯的「嘟」（chiff）
  osc: [{ w: 'harm', harm: [1, 0.1, 0.18, 0.03, 0.06], lvl: 0.5 }], noise: { lvl: 0.12, bp: 1, kt: 3, q: 1.4, a: 0.005, d: 0.035, s: 0.18 },
  flt: { f: 5000, vel: 0.6 }, amp: { a: 0.025, r: 0.08 }, lfo: [], jit: 1.5,
});
P('wnd.pan', '管樂', '排笛', 'Pan Flute', 75, 'wnd', {
  // 閉管：只有奇次泛音；氣聲很多、起音像「噗」
  osc: [{ w: 'harm', harm: [1, 0, 0.12, 0, 0.04], lvl: 0.48 }], noise: { lvl: 0.18, bp: 1, kt: 1.5, q: 1.2, a: 0.01, d: 0.07, s: 0.4 },
  flt: { f: 4500 }, amp: { a: 0.07, r: 0.18 }, lfo: [{ to: 'pitch', rate: 4.6, depth: 0.12, delay: 0.3 }], penv: { amt: -30, d: 0.05 },
});
P('wnd.ocarina', '管樂', '陶笛', 'Ocarina', 79, 'wnd', {
  // 亥姆霍茲共鳴器：幾乎是純正弦
  osc: [{ w: 'harm', harm: [1, 0.05, 0.02], lvl: 0.52 }], noise: { lvl: 0.07, bp: 1, kt: 2, q: 2, a: 0.02, d: 0.06, s: 0.35 },
  flt: { f: 4000 }, amp: { a: 0.05, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.2, depth: 0.07, delay: 0.3 }],
});
P('wnd.clarinet', '管樂', '單簧管', 'Clarinet', 71, 'wnd', {
  // 圓柱管＋單簧片：低音區幾乎只有奇次泛音（空洞、木頭味）
  osc: [{ w: 'harm', harm: [1, 0.04, 0.55, 0.03, 0.32, 0.03, 0.18, 0.04, 0.1, 0.05, 0.06], lvl: 0.45 }],
  flt: { f: 2600, vel: 1.6, key: 0.4 }, noise: { lvl: 0.035, bp: 1, kt: 3, q: 1.5, a: 0.02, d: 0.06, s: 0.4 },
  amp: { a: 0.035, r: 0.1 }, lfo: [], jit: 1.5, body: [[1500, 2, 3]],
});
P('wnd.clarbass', '管樂', '低音單簧管', 'Bass Clarinet', 71, 'wnd', {
  osc: [{ w: 'harm', harm: [1, 0.05, 0.7, 0.04, 0.5, 0.05, 0.32, 0.06, 0.2, 0.06, 0.12], lvl: 0.45 }],
  flt: { f: 1600, vel: 1.4 }, noise: { lvl: 0.05, bp: 1, kt: 3, q: 1.3, a: 0.03, d: 0.08, s: 0.4 },
  amp: { a: 0.05, r: 0.14 }, lfo: [], jit: 1.5, body: [[600, 2, 3]],
});
P('wnd.oboe', '管樂', '雙簧管', 'Oboe', 68, 'wnd', {
  // 圓錐管＋雙簧片：基音弱、1–1.5 kHz 的共振峰很強 → 尖、帶鼻音
  osc: [{ w: 'saw', lvl: 0.36 }], flt: { f: 4200, vel: 1.2, key: 0.2 },
  body: [[1150, 5, 13], [2900, 4, 6], [300, 1, -6]], noise: { lvl: 0.025, bp: 1, kt: 4, q: 2, d: 0.05, s: 0.3 },
  amp: { a: 0.03, r: 0.1 }, lfo: [{ to: 'pitch', rate: 5.2, depth: 0.08, delay: 0.3 }],
});
P('wnd.bassoon', '管樂', '低音管', 'Bassoon', 70, 'wnd', {
  osc: [{ w: 'saw', lvl: 0.38 }], flt: { f: 2200, vel: 1.2, key: 0.2 }, body: [[480, 5, 12], [1200, 4, 5], [100, 1, -6]],
  noise: { lvl: 0.025, bp: 1, kt: 4, q: 2, d: 0.05, s: 0.3 }, amp: { a: 0.04, r: 0.12 },
  lfo: [{ to: 'pitch', rate: 4.8, depth: 0.06, delay: 0.35 }],
});
P('wnd.saxalto', '管樂', '中音薩克斯風', 'Alto Sax', 65, 'wnd', {
  // 圓錐銅管＋單簧片：所有諧波都有、越吹越亮、會「破」
  osc: [{ w: 'saw', lvl: 0.36 }], flt: { f: 2400, q: 0.7, vel: 2.4, env: 1.0, a: 0.02, d: 0.2, s: 0.6, key: 0.3 },
  body: [[700, 3, 5], [1600, 3, 6], [3000, 2, 3]], drive: 0.25,
  noise: { lvl: 0.05, bp: 1, kt: 3, q: 1.2, a: 0.01, d: 0.06, s: 0.4 },
  amp: { a: 0.035, r: 0.1 }, lfo: [{ to: 'pitch', rate: 5.4, depth: 0.12, delay: 0.35 }], penv: { amt: -25, d: 0.06 },
});
P('wnd.saxtenor', '管樂', '次中音薩克斯風', 'Tenor Sax', 66, 'wnd', {
  osc: [{ w: 'saw', lvl: 0.36 }], flt: { f: 1800, q: 0.7, vel: 2.4, env: 1.0, a: 0.02, d: 0.2, s: 0.6, key: 0.3 },
  body: [[500, 3, 5], [1200, 3, 6], [2400, 2, 3]], drive: 0.35,
  noise: { lvl: 0.07, bp: 1, kt: 3, q: 1.1, a: 0.01, d: 0.06, s: 0.5 },
  amp: { a: 0.04, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.13, delay: 0.35 }], penv: { amt: -30, d: 0.06 },
});
P('wnd.saxbari', '管樂', '上低音薩克斯風', 'Baritone Sax', 67, 'wnd', {
  osc: [{ w: 'saw', lvl: 0.38 }], flt: { f: 1200, q: 0.7, vel: 2.2, env: 1.0, a: 0.02, d: 0.2, s: 0.6, key: 0.3 },
  body: [[350, 3, 5], [900, 3, 6], [1900, 2, 3]], drive: 0.4,
  noise: { lvl: 0.07, bp: 1, kt: 3, q: 1.1, a: 0.01, d: 0.06, s: 0.5 },
  amp: { a: 0.045, r: 0.14 }, lfo: [{ to: 'pitch', rate: 4.6, depth: 0.1, delay: 0.35 }],
});
P('wnd.trumpet', '管樂', '小號', 'Trumpet', 56, 'brs', {
  flt: { f: 1500, key: 0.6, vel: 2.4 }, body: [[1200, 2, 5], [2500, 2, 3]], amp: { a: 0.028, r: 0.1 },
});
P('wnd.trombone', '管樂', '長號', 'Trombone', 57, 'brs', {
  flt: { f: 900, key: 0.6, vel: 2.4 }, body: [[550, 2, 5], [1300, 2, 3]], amp: { a: 0.045, r: 0.14 }, penv: { amt: -50, d: 0.06 },
});
P('wnd.horn', '管樂', '法國號', 'French Horn', 60, 'brs', {
  // 朝後吹、手塞在喇叭口裡：圓、暗、遠
  osc: [{ w: 'saw', lvl: 0.3 }, { w: 'tri', lvl: 0.18 }], flt: { f: 700, key: 0.5, vel: 1.8, env: 1.2, a: 0.06 },
  body: [[340, 2, 5], [3000, 2, -6]], amp: { a: 0.08, r: 0.25 }, drive: 0.05, penv: { amt: -20, d: 0.08 },
});
P('wnd.tuba', '管樂', '低音號', 'Tuba', 58, 'brs', {
  osc: [{ w: 'saw', lvl: 0.3 }, { w: 'sin', lvl: 0.2 }], flt: { f: 420, key: 0.5, vel: 1.8 },
  body: [[230, 2, 5]], amp: { a: 0.05, r: 0.16 }, drive: 0.12, lfo: [],
});
P('wnd.brass', '管樂', '銅管合奏', 'Brass Section', 61, 'brs', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 8, wide: 0.6 }, { w: 'saw', lvl: 0.14, oct: -1, uni: 2, spread: 6 }],
  flt: { f: 1300, vel: 2.4 }, drive: 0.2, amp: { a: 0.05, r: 0.16 }, gain: 0.5, body: [[1000, 1.5, 4]],
});
P('wnd.brasssoft', '管樂', '柔和銅管', 'Soft Brass', 62, 'brs', {
  osc: [{ w: 'saw', lvl: 0.28, uni: 3, spread: 8, wide: 0.5 }, { w: 'tri', lvl: 0.12 }], flt: { f: 700, env: 1.0, a: 0.1, s: 0.7, vel: 1.4 },
  amp: { a: 0.12, r: 0.3 }, drive: 0.03,
});
P('wnd.mute', '管樂', '弱音小號', 'Muted Trumpet', 59, 'brs', {
  // 哈蒙弱音器：低頻全被擋掉、留下 1.5～2 kHz 的鼻音（爵士小號）
  flt: { f: 2600, key: 0.4, vel: 1.4 }, body: [[1700, 6, 12], [3800, 4, 6], [300, 1, -12]], amp: { a: 0.02, r: 0.08 },
  lfo: [{ to: 'pitch', rate: 5.6, depth: 0.07, delay: 0.35 }],
});
P('wnd.whistle', '管樂', '口哨', 'Whistle', 78, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.5 }], noise: { lvl: 0.06, bp: 1, kt: 1, q: 4, a: 0.03, d: 0.08, s: 0.5 },
  flt: { f: 8000 }, amp: { a: 0.05, r: 0.1 }, lfo: [{ to: 'pitch', rate: 6.0, depth: 0.16, delay: 0.25 }], penv: { amt: -60, d: 0.05 }, jit: 5,
});
P('wnd.bagpipe', '管樂', '風笛', 'Bagpipe', 109, 'wnd', {
  // 蘇格蘭風笛：吟唱管（指法）＋兩支固定音高的持續低音管（A2、A3），音量不能控制
  osc: [{ w: 'saw', lvl: 0.3 }, { w: 'saw', lvl: 0.16, hz: 110 }, { w: 'saw', lvl: 0.12, hz: 220.6 }],
  flt: { f: 4200, vel: 0, key: 0 }, body: [[1300, 4, 9], [2600, 3, 6]], vcurve: 0, amp: { a: 0.03, d: 0.1, s: 1, r: 0.08 },
  drive: 0.15, noise: undefined, lfo: [], jit: 1,
});
P('wnd.didgeridoo', '管樂', '迪吉里杜管', 'Didgeridoo', 116, 'wnd', {
  osc: [{ w: 'saw', lvl: 0.34 }], frm: { v: 'u', v2: 'a', morph: 0.3, voice: 'bass', q: 10, lvl: 0.7 },
  flt: { f: 1400, q: 1.2, env: 0 }, lfo: [{ to: 'cutoff', rate: 2.6, depth: 0.9 }, { to: 'amp', rate: 1.3, depth: 0.25 }],
  noise: { lvl: 0.06, bp: 500, q: 1.0, a: 0.02, d: 0.2, s: 0.5 }, amp: { a: 0.08, r: 0.25 }, drive: 0.2, jit: 2,
});
P('wnd.shaku', '管樂', '尺八', 'Shakuhachi', 77, 'wnd', {
  // 尺八：氣聲非常多（息音）、會「搖」（meri/kari 的音高起伏）
  osc: [{ w: 'harm', harm: [1, 0.25, 0.1, 0.04], lvl: 0.44 }], noise: { lvl: 0.22, bp: 1, kt: 2, q: 1.1, a: 0.04, d: 0.12, s: 0.55, vel: 0.6 },
  flt: { f: 4200, vel: 1.4 }, amp: { a: 0.08, r: 0.22 }, lfo: [{ to: 'pitch', rate: 4.2, depth: 0.16, delay: 0.4 }], penv: { amt: -40, d: 0.12 }, jit: 4,
});
P('wnd.harmonica', '管樂', '口琴', 'Harmonica', 22, 'wnd', {
  // 自由簧片：方波似的、嘴巴形狀當共振峰
  osc: [{ w: 'harm', harm: [1, 0.7, 0.75, 0.4, 0.5, 0.25, 0.3, 0.15], lvl: 0.42 }], frm: { v: 'e', v2: 'a', morph: 0.4, voice: 'alto', q: 6, lvl: 0.35 },
  flt: { f: 3400, vel: 1.6 }, body: [[1800, 3, 4]], amp: { a: 0.03, r: 0.08 }, lfo: [{ to: 'amp', rate: 5.4, depth: 0.2, delay: 0.3 }], jit: 2,
});

// ────────────────────────── 民族樂器 ──────────────────────────
P('eth.erhu', '民族', '二胡', 'Erhu', 110, 'str', {
  // 二胡：蟒皮琴筒（小而緊 → 中高頻很強的鼻音）、弓毛夾在兩弦之間、揉弦又深又慢
  body: [[800, 4, 9], [1600, 3, 5], [3300, 2, 4], [200, 1, -8]], flt: { f: 5000, key: 0.1 },
  noise: { lvl: 0.05, hp: 2000 }, lfo: [{ to: 'pitch', rate: 5.6, depth: 0.28, delay: 0.3 }], penv: { amt: -60, d: 0.08 }, jit: 4,
});
P('eth.gaohu', '民族', '高胡', 'Gaohu', 110, 'str', {
  body: [[1150, 4, 9], [2300, 3, 6], [4200, 2, 4], [300, 1, -10]], flt: { f: 6500 },
  lfo: [{ to: 'pitch', rate: 6.4, depth: 0.22, delay: 0.25 }], penv: { amt: -50, d: 0.06 },
});
P('eth.pipa', '民族', '琵琶', 'Pipa', 107, 'eth', {
  // 用假指甲彈、梨形木面板：很亮、顆粒清楚、衰減快
  str: { bright: 0.92, ring: 0.8, pos: 0.08, decay: 1.8, vb: 0.4 }, body: [[350, 3, 6], [900, 3, 4], [2600, 2, 4]],
  noise: { lvl: 0.1, hp: 3000, d: 0.006 },
});
P('eth.guzheng', '民族', '古箏', 'Guzheng', 107, 'eth', {
  // 鋼芯尼龍弦、大面桐木面板：尾音長，右手撥完左手按弦 → 揉弦
  str: { bright: 0.8, ring: 0.8, pos: 0.13, decay: 5 }, body: [[150, 3, 5], [450, 2, 4], [1800, 2, 2]],
  lfo: [{ to: 'pitch', rate: 5.2, depth: 0.12, delay: 0.45 }], noise: { lvl: 0.07, hp: 3000, d: 0.006 }, amp: { r: 0.6 },
});
P('eth.dizi', '民族', '笛子', 'Dizi', 72, 'wnd', {
  // 笛子的「笛膜」：竹膜跟著振動，加出一圈亮亮的、嗡嗡的高頻
  osc: [{ w: 'harm', harm: [1, 0.45, 0.25, 0.12, 0.08, 0.04], lvl: 0.46 }],
  noise: { lvl: 0.1, bp: 1, kt: 2, q: 1.5, a: 0.01, d: 0.05, s: 0.45 }, body: [[3000, 3, 6], [5000, 4, 5]],
  flt: { f: 8000, vel: 1.6 }, amp: { a: 0.03, r: 0.08 }, lfo: [{ to: 'pitch', rate: 6.0, depth: 0.12, delay: 0.25 }], jit: 2,
});
P('eth.suona', '民族', '嗩吶', 'Suona', 111, 'wnd', {
  // 小哨片＋圓錐木管＋銅碗：非常亮、非常大聲、帶刺
  osc: [{ w: 'saw', lvl: 0.4 }], flt: { f: 5200, q: 0.8, vel: 1.4, key: 0.2 },
  body: [[1300, 3, 8], [2600, 3, 8], [4200, 2, 5], [300, 1, -8]], drive: 0.5, post: 7000,
  noise: { lvl: 0.04, bp: 1, kt: 4, q: 1.5, d: 0.05, s: 0.3 },
  amp: { a: 0.02, r: 0.08 }, lfo: [{ to: 'pitch', rate: 6.4, depth: 0.16, delay: 0.2 }], penv: { amt: -80, d: 0.05 }, jit: 4,
});
P('eth.sheng', '民族', '笙', 'Sheng', 109, 'wnd', {
  // 笙：銅簧片＋竹管，傳統上一次吹出主音和五度、八度（「和」）
  osc: [{ w: 'harm', harm: [1, 0.6, 0.5, 0.3, 0.25, 0.15, 0.1], lvl: 0.36 }, { w: 'harm', harm: [1, 0.4, 0.2], lvl: 0.2, semi: 7 },
    { w: 'harm', harm: [1, 0.3], lvl: 0.14, oct: 1 }], body: [[1100, 3, 5], [2400, 3, 3]],
  noise: { lvl: 0.04, bp: 1, kt: 3, q: 2, d: 0.05, s: 0.3 }, amp: { a: 0.045, r: 0.12 }, lfo: [], vcurve: 0.6,
});
P('eth.yangqin', '民族', '揚琴', 'Yangqin', 15, 'eth', {
  // 竹籤琴竹（頭上包橡皮）敲一組 3～5 根弦
  str: { bright: 0.85, ring: 0.85, pos: 0.12, decay: 4, course: [[4, 1], [-3, 0.9], [7, 0.6]] },
  body: [[200, 3, 4], [700, 2, 3], [2400, 2, 3]], noise: { lvl: 0.1, lp: 2500, d: 0.008 }, amp: { r: 0.5 },
});
P('eth.koto', '民族', '日本箏', 'Koto', 107, 'eth', {
  // 絲弦（現在多為聚酯）＋象牙指甲：比古箏乾、尾音短、起音更「咔」
  str: { bright: 0.85, ring: 0.6, pos: 0.07, decay: 2.8 }, body: [[180, 3, 5], [600, 3, 3], [2200, 2, 3]],
  noise: { lvl: 0.1, hp: 2500, d: 0.008 }, lfo: [{ to: 'pitch', rate: 4.8, depth: 0.08, delay: 0.5 }],
});
P('eth.shamisen', '民族', '三味線', 'Shamisen', 107, 'eth', {
  // 貓皮／狗皮面＋大撥子打到皮面，第一弦碰到「さわり」→ 嗡嗡的沙聲
  str: { bright: 0.95, ring: 0.75, pos: 0.06, decay: 1.4, buzz: 0.45 }, body: [[420, 5, 8], [1600, 3, 5]],
  noise: { lvl: 0.25, bp: 900, q: 1.5, d: 0.02 },
});
P('eth.sitar', '民族', '西塔琴', 'Sitar', 104, 'eth', {
  // 弧形平面琴橋（jawari）讓弦一直「嗡」；下方十幾根共鳴弦跟著響
  str: { bright: 0.95, ring: 0.92, pos: 0.07, decay: 6, buzz: 0.8, course: [[1200, 0.25], [702, 0.18], [-1200, 0.15]] },
  body: [[200, 2, 4], [900, 2, 3], [3200, 2, 5]], lfo: [{ to: 'pitch', rate: 4.6, depth: 0.1, delay: 0.5 }], amp: { r: 0.8 },
});
P('eth.sarod', '民族', '薩羅德', 'Sarod', 104, 'eth', {
  // 金屬指板（沒有琴格）＋羊皮面：可以滑音、聲音厚而圓
  str: { bright: 0.75, ring: 0.85, pos: 0.12, decay: 4.5, course: [[1200, 0.15]] }, body: [[300, 4, 7], [1100, 3, 4]],
  lfo: [{ to: 'pitch', rate: 5, depth: 0.08, delay: 0.4 }], penv: { amt: -80, d: 0.12 },
});
P('eth.tanpura', '民族', '坦布拉', 'Tanpura', 104, 'eth', {
  // 沒有旋律、只負責「嗡」：jawari 開很大，加上絲線（juari）讓泛音一波一波湧出
  str: { bright: 0.75, ring: 0.95, pos: 0.18, decay: 10, buzz: 0.95, course: [[0, 0.7], [2, 0.6]] },
  body: [[180, 2, 4], [1600, 2, 4]], amp: { r: 2.5 }, kdecay: 0.4,
});
P('eth.oud', '民族', '烏德琴', 'Oud', 105, 'eth', {
  // 沒有琴格、大圓背：溫暖低沉，撥片（risha）彈
  str: { bright: 0.6, ring: 0.6, pos: 0.12, decay: 2.8, course: [[3, 0.9]] }, body: [[120, 3, 7], [280, 3, 4], [1200, 2, 2]],
  noise: { lvl: 0.06, hp: 2500, d: 0.006 },
});
P('eth.bouzouki', '民族', '布祖基琴', 'Bouzouki', 105, 'eth', {
  str: { bright: 0.92, ring: 0.9, pos: 0.08, decay: 3.4, course: [[1200, 0.55], [4, 0.7]] }, body: [[220, 3, 5], [800, 3, 3], [2600, 2, 4]],
  noise: { lvl: 0.08, hp: 3500, d: 0.005 },
});
P('eth.balalaika', '民族', '巴拉萊卡', 'Balalaika', 105, 'eth', {
  // 三角形琴身、用手指刷弦（輪撥）
  str: { bright: 0.9, ring: 0.7, pos: 0.09, decay: 1.8, course: [[3, 0.9]] }, body: [[330, 4, 6], [1300, 3, 4]],
  lfo: [{ to: 'amp', rate: 11, depth: 0.25 }], noise: { lvl: 0.07, hp: 3000, d: 0.005 },
});
P('eth.mbira', '民族', '拇指琴', 'Mbira', 108, 'eth', {
  // 金屬鍵上纏了瓶蓋／貝殼：每次撥都帶「沙沙」聲（buzz）
  str: undefined, modes: { list: [[1, 1, 2.4], [5.9, 0.16, 0.3], [2.0, 0.08, 1.2]], lvl: 0.5 },
  noise: { lvl: 0.12, bp: 3500, q: 1, a: 0.002, d: 0.3, s: 0, vel: 0.5 }, body: [[260, 3, 5], [800, 2, 2]],
});
P('eth.gamelan', '民族', '甘美朗', 'Gamelan', 112, 'eth', {
  // 青銅銅片（gender／saron）：成對的樂器故意調差一點 → 「ombak」波浪般的拍音
  str: undefined, modes: { list: [[1, 1, 3.5], [2.39, 0.4, 1.6], [4.12, 0.2, 0.7], [6.0, 0.06, 0.3]], beat: [[18, 0.9, 1]], lvl: 0.5 },
  noise: { lvl: 0.1, lp: 1200, d: 0.012 }, amp: { r: 1.2 }, kdecay: 0.6,
});
P('eth.gayageum', '民族', '伽倻琴', 'Gayageum', 107, 'eth', {
  // 絲弦、用指肚彈：比古箏溫柔、暗；按弦造成很深的揉弦（農弦）
  str: { bright: 0.5, ring: 0.45, pos: 0.15, decay: 3.4 }, body: [[140, 3, 6], [400, 3, 4], [1200, 2, 2]],
  lfo: [{ to: 'pitch', rate: 4.4, depth: 0.25, delay: 0.4 }], noise: { lvl: 0.05, lp: 1500, d: 0.01 },
});
P('eth.ney', '民族', '奈伊笛', 'Ney', 75, 'wnd', {
  // 蘆葦斜吹：氣聲比音還多
  osc: [{ w: 'harm', harm: [1, 0.3, 0.12, 0.05], lvl: 0.4 }], noise: { lvl: 0.28, bp: 1, kt: 2, q: 1, a: 0.05, d: 0.15, s: 0.6, vel: 0.5 },
  flt: { f: 4000 }, amp: { a: 0.09, r: 0.25 }, lfo: [{ to: 'pitch', rate: 4.4, depth: 0.14, delay: 0.4 }], jit: 4,
});
P('eth.kaval', '民族', '卡瓦爾笛', 'Kaval', 76, 'wnd', {
  // 巴爾幹的端吹長笛：低音區有一層「kaba」的沙啞
  osc: [{ w: 'harm', harm: [1, 0.35, 0.3, 0.1, 0.08], lvl: 0.44 }], noise: { lvl: 0.2, bp: 1, kt: 2, q: 1.2, a: 0.04, d: 0.12, s: 0.5 },
  flt: { f: 4400 }, amp: { a: 0.07, r: 0.2 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.1, delay: 0.3 }], drive: 0.1,
});
P('eth.bandoneon', '民族', '班多鈕手風琴', 'Bandoneon', 23, 'org', {
  // 探戈的班多鈕：兩片簧片相差八度（不是微失諧），所以比手風琴「乾淨」、更憂鬱
  osc: [{ w: 'harm', harm: [1, 0.7, 0.55, 0.4, 0.3, 0.2, 0.15], lvl: 0.38 }, { w: 'harm', harm: [1, 0.5, 0.3, 0.15], lvl: 0.24, oct: 1, cents: 2 }],
  flt: { f: 3200, vel: 1.4 }, body: [[900, 3, 4], [2000, 2, 3]], amp: { a: 0.05, d: 0.3, s: 0.92, r: 0.14 }, vcurve: 0.9, drive: 0.08, jit: 1.5,
});
P('eth.charango', '民族', '恰朗哥吉他', 'Charango', 105, 'eth', {
  // 犰狳殼琴身、十根弦五組：很高、很亮、刷弦
  str: { bright: 0.95, ring: 0.75, pos: 0.1, decay: 1.4, course: [[1200, 0.5], [5, 0.8]] }, body: [[420, 4, 6], [1600, 3, 4]],
  noise: { lvl: 0.1, hp: 4000, d: 0.005 },
});
P('eth.steeldrum', '民族', '加勒比鋼鼓', 'Caribbean Steel Pan', 114, 'bel', {
  // 千里達的高音鋼鼓（tenor pan）：比打擊鍵盤那一個用更軟的棒子、更圓、更長
  modes: { list: [[1, 1, 2], [2.0, 0.55, 1.2], [3.0, 0.2, 0.6], [1.5, 0.05, 0.8]], vt: 1, lvl: 0.5 },
  noise: { lvl: 0.08, lp: 1500, d: 0.01 }, body: [[500, 2, 3]], amp: { r: 0.6 }, penv: { amt: 8, d: 0.03 },
});

// ────────────────────────── 合唱／人聲 ──────────────────────────
// 母音用五個共振峰（男低音到女高音各一套，依音高自動挑），合唱是多人齊唱（uni）
P('cho.aah', '人聲', '人聲 Aah', 'Choir Aah', 52, 'cho', {});
P('cho.ooh', '人聲', '人聲 Ooh', 'Choir Ooh', 53, 'cho', {
  frm: { v: 'u', v2: 'o', morph: 0.4 }, amp: { a: 0.2, r: 0.55 },
});
P('cho.choir', '人聲', '合唱團', 'Full Choir', 52, 'cho', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 5, spread: 18, wide: 0.9 }], frm: { v: 'a', v2: 'o', morph: 0.25 },
  amp: { a: 0.22, r: 0.7 }, gain: 0.46, noise: { lvl: 0.06 },
});
P('cho.doo', '人聲', '人聲 Doo', 'Voice Doo', 53, 'cho', {
  // 一個人唱 doo：d 的起音、u 的母音，沒有合唱齊奏
  osc: [{ w: 'saw', lvl: 0.36 }], frm: { v: 'u', v2: 'o', morph: 0.2 }, amp: { a: 0.025, d: 0.3, s: 0.75, r: 0.25 },
  noise: { lvl: 0.06, lp: 600, a: 0.001, d: 0.02, s: 0 }, lfo: [{ to: 'pitch', rate: 5.4, depth: 0.12, delay: 0.3 }],
});
P('cho.whisper', '人聲', '氣聲', 'Breathy Voice', 54, 'cho', {
  osc: [{ w: 'saw', lvl: 0.12, uni: 2, spread: 10 }], noise: { lvl: 0.3, a: 0.1, d: 0.4, s: 0.9, r: 0.4, hp: 300 },
  frm: { v: 'a', v2: 'e', morph: 0.3, lvl: 1 }, amp: { a: 0.18, r: 0.5 },
});
P('cho.vocal', '人聲', '合成人聲', 'Synth Vox', 85, 'cho', {
  osc: [{ w: 'pls', pw: 0.3, lvl: 0.32, uni: 2, spread: 8 }], frm: { v: 'e', v2: 'a', morph: 0.5, q: 12, lvl: 0.8 },
  lfo: [{ to: 'pitch', rate: 5.5, depth: 0.12, delay: 0.2 }], amp: { a: 0.08, r: 0.4 }, noise: undefined, jit: 0,
});
P('cho.boys', '人聲', '童聲合唱', 'Boys Choir', 52, 'cho', {
  // 男童：比女高音的共振峰更高（聲道短）、幾乎不揉音、很純
  osc: [{ w: 'saw', lvl: 0.24, uni: 4, spread: 9, wide: 0.6 }, { w: 'sin', lvl: 0.14 }], frm: { v: 'u', v2: 'o', morph: 0.3, voice: 'sop', shift: 1.15 },
  flt: { f: 4500 }, amp: { a: 0.16, r: 0.5 }, lfo: [{ to: 'pitch', rate: 5, depth: 0.04, delay: 0.5 }],
});
P('cho.mm', '人聲', '哼唱', 'Humming', 53, 'cho', {
  // 閉著嘴：鼻腔共鳴（250 Hz）、高頻幾乎沒有
  osc: [{ w: 'saw', lvl: 0.3, uni: 3, spread: 10 }], frm: undefined, flt: { f: 900, key: 0.4 }, body: [[260, 3, 8], [2200, 2, -10]],
  amp: { a: 0.18, r: 0.5 }, gain: 0.55, noise: undefined,
});
P('cho.vowel', '人聲', '母音合成', 'Vowel Synth', 85, 'cho', {
  osc: [{ w: 'saw', lvl: 0.32, uni: 2, spread: 8 }], frm: { v: 'a', v2: 'i', morph: 0.5, q: 14, lvl: 1 },
  lfo: [{ to: 'cutoff', rate: 2.4, depth: 0.4 }], amp: { a: 0.08, r: 0.35 }, noise: undefined, jit: 0,
});
P('cho.pad', '人聲', '人聲鋪底', 'Vox Pad', 54, 'cho', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 5, spread: 20, wide: 0.9 }], frm: { v: 'a', v2: 'u', morph: 0.35, lvl: 0.75 },
  amp: { a: 0.7, d: 1.2, s: 0.9, r: 1.6 }, gain: 0.42, flt: { f: 2600 }, lfo: [{ to: 'cutoff', rate: 0.25, depth: 0.8 }],
});

// ────────────────────────── 合成主奏 ──────────────────────────
P('led.saw', '主奏', '鋸齒主奏', 'Saw Lead', 81, 'led', {});
P('led.supersaw', '主奏', '超級鋸齒', 'Supersaw', 81, 'led', {
  osc: [{ w: 'saw', lvl: 0.2, uni: 5, spread: 24, wide: 0.9 }, { w: 'saw', lvl: 0.12, oct: 1, uni: 3, spread: 16 }],
  flt: { f: 3200, q: 1.2, env: 1.4 }, gain: 0.5,
});
P('led.square', '主奏', '方波主奏', 'Square Lead', 80, 'led', {
  osc: [{ w: 'pls', pw: 0.5, pwm: 1, lvl: 0.32 }], flt: { f: 2200, q: 1.4, env: 1.8 },
  lfo: [{ to: 'pw', rate: 0.28, depth: 0.7 }],
});
P('led.pulse', '主奏', '脈衝主奏', 'Pulse Lead', 80, 'led', {
  // PWM：脈寬由 LFO 慢慢掃，聲音會像chorus 一樣「呼吸」
  osc: [{ w: 'pls', pw: 0.5, pwm: 1, lvl: 0.34 }, { w: 'pls', pw: 0.5, pwm: 1, lvl: 0.12, cents: 9 }],
  flt: { f: 2600, q: 2.0, env: 2.2 }, lfo: [{ to: 'pw', rate: 0.65, depth: 0.9 }],
});
P('led.303', '主奏', '303 主奏', 'Acid Lead', 87, 'led', {
  osc: [{ w: 'saw', lvl: 0.38 }], flt: { f: 600, q: 6.5, env: 3.4, a: 0.001, d: 0.2, s: 0.1 }, drive: 0.3,
});
P('led.fm', '主奏', 'FM 主奏', 'FM Lead', 82, 'led', {
  osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 1.5, idx: 2.4, d: 0.4 } }, { w: 'sin', lvl: 0.16, oct: 1 }], flt: { f: 4200 },
});
P('led.chip', '主奏', '8-bit 主奏', 'Chiptune Lead', 80, 'led', {
  osc: [{ w: 'pls', pw: 0.5, lvl: 0.3 }, { w: 'sqr', lvl: 0.14, oct: 1 }], flt: { type: 'lp', f: 9000, q: 0.5, env: 0 },
  amp: { a: 0.001, d: 0.2, s: 0.8, r: 0.05 }, vcurve: 0.6,
});
P('led.hoover', '主奏', '胡佛主奏', 'Hoover Lead', 87, 'led', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 3, spread: 30 }, { w: 'pls', pw: 0.5, pwm: 1, lvl: 0.2, cents: -14 }],
  flt: { f: 2000, q: 3.0, env: 2.4 }, drive: 0.3,
  lfo: [{ to: 'pitch', rate: 6, depth: 0.2 }, { to: 'pw', rate: 0.9, depth: 0.8 }],
});
P('led.sync', '主奏', '硬同步主奏', 'Sync Lead', 82, 'led', {
  // 從振盪器頻率＝基頻 × 3.77，每當基頻繞回原點就被歸零；
  // LFO 再慢慢推「比例」→ 經典硬同步的掃頻（音高不動、音色掃）
  osc: [{ w: 'saw', lvl: 0.34, sync: 3.77 }],
  flt: { f: 1600, q: 2.4, key: 0.2, env: 2.4, a: 0.002, d: 0.35, s: 0.3 }, drive: 0.18,
  lfo: [{ to: 'sync', rate: 0.45, depth: 0.35 }],
});
P('led.detune', '主奏', '失諧主奏', 'Detune Lead', 81, 'led', {
  osc: [{ w: 'saw', lvl: 0.22, uni: 4, spread: 28, wide: 0.8 }], flt: { f: 2600, q: 1.2, env: 1.6 },
});
P('led.solo', '主奏', '獨奏合成器', 'Solo Synth', 81, 'led', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 12 }], flt: { f: 1800, q: 2.2, env: 2.4 },
  lfo: [{ to: 'pitch', rate: 5.8, depth: 0.16, delay: 0.25 }],
});
P('led.warm', '主奏', '溫暖主奏', 'Warm Lead', 82, 'led', {
  osc: [{ w: 'tri', lvl: 0.3 }, { w: 'saw', lvl: 0.16, uni: 2, spread: 10 }], flt: { f: 1600, q: 0.9, env: 1.2 },
});
P('led.bright', '主奏', '明亮主奏', 'Bright Lead', 81, 'led', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 10 }], flt: { f: 5200, q: 1.8, env: 1.4 },
});
P('led.pluck', '主奏', '撥弦主奏', 'Pluck Lead', 84, 'led', {
  amp: { a: 0.001, d: 0.4, s: 0, r: 0.2 }, flt: { f: 700, q: 4.0, env: 4.0, a: 0.001, d: 0.18, s: 0.05 },
  osc: [{ w: 'saw', lvl: 0.34 }],
});
P('led.brass', '主奏', '合成銅管', 'Synth Brass', 62, 'led', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 10 }], flt: { f: 1200, q: 1.4, env: 3.0, a: 0.04, d: 0.3, s: 0.5 },
  drive: 0.2, amp: { a: 0.04, r: 0.16 },
});
P('led.whistle', '主奏', '口哨合成', 'Synth Whistle', 78, 'led', {
  osc: [{ w: 'sin', lvl: 0.44 }], flt: { f: 5000 }, lfo: [{ to: 'pitch', rate: 6.5, depth: 0.2, delay: 0.15 }],
});
P('led.bell', '主奏', '鐘聲主奏', 'Bell Lead', 82, 'led', {
  osc: [{ w: 'sin', lvl: 0.34, fm: { ratio: 3.5, idx: 2.6, d: 1.0 } }], flt: { f: 6000 },
  amp: { a: 0.002, d: 1.4, s: 0.2, r: 0.6 },
});
P('led.organ', '主奏', '合成風琴主奏', 'Synth Organ Lead', 81, 'led', {
  osc: [{ w: 'harm', harm: [1, 0.8, 0.5, 0.4, 0.3, 0.2], lvl: 0.36, uni: 2, spread: 6 }], amp: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
});
P('led.tech', '主奏', '科技主奏', 'Tech Lead', 87, 'led', {
  osc: [{ w: 'pls', pw: 0.15, lvl: 0.3 }, { w: 'saw', lvl: 0.18, oct: 1 }], flt: { f: 3000, q: 3.0, env: 2.0 },
  lfo: [{ to: 'cutoff', rate: 8, depth: 1.2 }], drive: 0.15,
});
P('led.dark', '主奏', '黑暗主奏', 'Dark Lead', 81, 'led', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 14 }], flt: { f: 900, q: 2.4, env: 1.6 }, drive: 0.2,
});
P('led.flute', '主奏', '合成笛', 'Synth Flute', 79, 'led', {
  osc: [{ w: 'sin', lvl: 0.4 }, { w: 'tri', lvl: 0.14 }], noise: { lvl: 0.14, bp: 3000, q: 1.6, d: 0.08, s: 0.15 },
  flt: { f: 3600 }, amp: { a: 0.05, r: 0.14 }, lfo: [{ to: 'pitch', rate: 5.4, depth: 0.1, delay: 0.25 }],
});
P('led.fifth', '主奏', '五度主奏', 'Fifth Lead', 81, 'led', {
  osc: [{ w: 'saw', lvl: 0.28 }, { w: 'saw', lvl: 0.2, semi: 7 }], flt: { f: 2400, q: 1.6, env: 1.8 },
});

// ────────────────────────── 合成鋪底 ──────────────────────────
P('pad.warm', '鋪底', '溫暖 Pad', 'Warm Pad', 89, 'pad', {});
P('pad.strings', '鋪底', '弦樂 Pad', 'String Pad', 88, 'pad', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 4, spread: 16, wide: 0.8 }], flt: { f: 2000, q: 0.7, env: 1.0 },
});
P('pad.glass', '鋪底', '玻璃 Pad', 'Glass Pad', 92, 'pad', {
  osc: [{ w: 'sin', lvl: 0.24, oct: 1 }, { w: 'sin', lvl: 0.18, oct: 2, cents: 6 }, { w: 'saw', lvl: 0.14, uni: 2, spread: 12 }],
  flt: { f: 4600, q: 0.6 }, amp: { a: 0.9, r: 1.8 },
});
P('pad.choir', '鋪底', '合唱 Pad', 'Choir Pad', 91, 'pad', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 3, spread: 14 }], frm: { v: 'a', v2: 'o', morph: 0.4, q: 6, lvl: 0.5 },
  flt: { f: 2200 }, amp: { a: 0.8, r: 1.6 },
});
P('pad.dark', '鋪底', '黑暗 Pad', 'Dark Pad', 90, 'pad', {
  osc: [{ w: 'saw', lvl: 0.28, uni: 3, spread: 10 }], flt: { f: 700, q: 1.2, env: 0.6 },
  amp: { a: 1.0, r: 2.0 },
});
P('pad.shimmer', '鋪底', '微光 Pad', 'Shimmer Pad', 92, 'pad', {
  osc: [{ w: 'saw', lvl: 0.2, uni: 3, spread: 18, wide: 0.9 }, { w: 'sin', lvl: 0.12, oct: 2, cents: 9 }],
  flt: { f: 3000, q: 0.7 }, lfo: [{ to: 'cutoff', rate: 0.4, depth: 1.6 }], amp: { a: 0.9, r: 2.0 },
});
P('pad.evolve', '鋪底', '演變 Pad', 'Evolving Pad', 93, 'pad', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 4, spread: 20 }], flt: { f: 1200, q: 1.4, env: 2.0, a: 2.0, d: 3.0, s: 0.6 },
  lfo: [{ to: 'cutoff', rate: 0.22, depth: 2.0 }], amp: { a: 1.2, r: 2.4 },
});
P('pad.halo', '鋪底', '光環 Pad', 'Halo Pad', 94, 'pad', {
  osc: [{ w: 'sin', lvl: 0.3 }, { w: 'sin', lvl: 0.16, oct: 1, cents: 5 }, { w: 'saw', lvl: 0.1, uni: 2, spread: 20 }],
  flt: { f: 2600 }, frm: { v: 'a', q: 5, lvl: 0.3 }, amp: { a: 1.1, r: 2.2 },
});
P('pad.analog', '鋪底', '類比 Pad', 'Analog Pad', 89, 'pad', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 8 }], flt: { f: 900, q: 2.2, env: 1.2 },
  lfo: [{ to: 'cutoff', rate: 0.3, depth: 0.8 }],
});
P('pad.digi', '鋪底', '數位 Pad', 'Digital Pad', 90, 'pad', {
  osc: [{ w: 'pls', pw: 0.25, lvl: 0.22, uni: 2, spread: 14 }, { w: 'sqr', lvl: 0.10, cents: -8 }],
  flt: { f: 2400, q: 1.6, env: 1.4 },
});
P('pad.drone', '鋪底', '持續低音', 'Drone', 91, 'pad', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 3, spread: 6 }, { w: 'sin', lvl: 0.2, oct: -1 }],
  flt: { f: 600, q: 1.0 }, amp: { a: 1.6, d: 2.0, s: 0.95, r: 3.0 },
});
P('pad.sweep', '鋪底', '掃頻 Pad', 'Sweep Pad', 93, 'pad', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 16 }], flt: { f: 500, q: 2.4, env: 3.4, a: 2.2, d: 3.0, s: 0.7 },
  amp: { a: 0.8, r: 1.6 },
});
P('pad.wind', '鋪底', '風聲 Pad', 'Wind Pad', 94, 'pad', {
  osc: [{ w: 'saw', lvl: 0.16, uni: 2, spread: 22 }], noise: { lvl: 0.34, bp: 1200, q: 0.6, a: 0.8, d: 1.2, s: 0.9, r: 1.6 },
  flt: { f: 1400, q: 0.8 }, lfo: [{ to: 'cutoff', rate: 0.18, depth: 1.4 }], amp: { a: 1.0, r: 1.8 },
});
P('pad.ice', '鋪底', '冰晶 Pad', 'Ice Pad', 92, 'pad', {
  osc: [{ w: 'sin', lvl: 0.2, oct: 1 }, { w: 'tri', lvl: 0.16, oct: 2, cents: 7 }, { w: 'saw', lvl: 0.12, uni: 2, spread: 18 }],
  flt: { f: 5200 }, amp: { a: 0.7, r: 2.2 },
});
P('pad.soft', '鋪底', '輕柔 Pad', 'Soft Pad', 89, 'pad', {
  osc: [{ w: 'tri', lvl: 0.26, uni: 3, spread: 12 }], flt: { f: 1100, q: 0.6 }, amp: { a: 1.0, r: 1.8 },
});
P('pad.big', '鋪底', '巨大 Pad', 'Epic Pad', 91, 'pad', {
  osc: [{ w: 'saw', lvl: 0.22, uni: 5, spread: 22, wide: 0.9 }, { w: 'saw', lvl: 0.12, oct: -1, uni: 2, spread: 10 }],
  flt: { f: 1800, q: 0.8, env: 1.4 }, amp: { a: 0.7, r: 2.0 }, gain: 0.4,
});
P('pad.motion', '鋪底', '動態 Pad', 'Motion Pad', 93, 'pad', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 3, spread: 16 }], flt: { f: 1400, q: 1.4, env: 1.6 },
  lfo: [{ to: 'cutoff', rate: 1.2, depth: 1.8 }, { to: 'pan', rate: 0.5, depth: 0.6 }],
});
P('pad.cinema', '鋪底', '電影 Pad', 'Cinematic Pad', 94, 'pad', {
  osc: [{ w: 'saw', lvl: 0.2, uni: 4, spread: 18 }, { w: 'tri', lvl: 0.16, oct: -1 }],
  flt: { f: 1600, q: 0.6, env: 1.2, a: 1.4 }, amp: { a: 1.4, r: 2.6 }, gain: 0.42,
});
P('pad.vox', '鋪底', '人聲 Pad', 'Vox Pad', 91, 'pad', {
  osc: [{ w: 'saw', lvl: 0.22, uni: 3, spread: 14 }], frm: { v: 'o', v2: 'a', morph: 0.35, q: 7, lvl: 0.45 },
  amp: { a: 0.8, r: 1.6 }, flt: { f: 2400 },
});
P('pad.pulse', '鋪底', '脈動 Pad', 'Pulse Pad', 90, 'pad', {
  osc: [{ w: 'pls', pw: 0.5, pwm: 1, lvl: 0.24, uni: 2, spread: 10 }], flt: { f: 1800, q: 1.4 },
  lfo: [{ to: 'amp', rate: 3.2, depth: 0.4 }, { to: 'pw', rate: 0.22, depth: 0.9 }], amp: { a: 0.6, r: 1.4 },
});
P('pad.noise', '鋪底', '噪聲 Pad', 'Noise Pad', 94, 'pad', {
  osc: [{ w: 'saw', lvl: 0.12, uni: 2, spread: 20 }], noise: { lvl: 0.5, pink: 1, bp: 2400, q: 0.6, a: 0.5, d: 1.0, s: 0.9, r: 1.4 },
  flt: { f: 3000, q: 0.6 }, amp: { a: 0.8, r: 1.8 },
});
P('pad.space', '鋪底', '太空 Pad', 'Space Pad', 94, 'pad', {
  osc: [{ w: 'sin', lvl: 0.24, oct: 1, cents: 4 }, { w: 'saw', lvl: 0.14, uni: 3, spread: 24 }],
  flt: { f: 2200, q: 1.0 }, lfo: [{ to: 'pitch', rate: 0.12, depth: 0.4 }], amp: { a: 1.2, r: 2.8 },
});

// ────────────────────────── 效果 ──────────────────────────
P('fx.riser', '效果', '上升音效', 'Riser', 119, 'fx', {
  osc: [{ w: 'saw', lvl: 0.2, uni: 2, spread: 20 }], noise: { lvl: 0.4, bp: 2000, q: 0.8, a: 1.2, d: 1.5, s: 1, r: 0.6 },
  flt: { f: 400, q: 2.0, env: 4.0, a: 2.0, d: 2.0, s: 1 }, amp: { a: 1.5, d: 2.0, s: 0.8, r: 1.0 }, penv: { amt: -200, d: 2.0 },
});
P('fx.down', '效果', '下降音效', 'Downlifter', 119, 'fx', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 2, spread: 16 }], flt: { f: 3000, q: 1.4, env: 3.0, a: 0.1, d: 1.5, s: 0.2 },
  penv: { amt: 400, d: 0.6 }, amp: { a: 0.01, d: 1.2, s: 0.3, r: 0.8 },
});
P('fx.impact', '效果', '撞擊', 'Impact', 119, 'fx', {
  osc: [{ w: 'sin', lvl: 0.5 }], noise: { lvl: 0.6, pink: 1, lp: 2000, d: 0.6 }, penv: { amt: 900, d: 0.12 },
  amp: { a: 0.001, d: 0.9, s: 0, r: 0.8 }, flt: { f: 1200 }, gain: 0.8,
});
P('fx.laser', '效果', '雷射', 'Laser', 119, 'fx', {
  osc: [{ w: 'sqr', lvl: 0.3 }], penv: { amt: 1600, d: 0.1 }, amp: { a: 0.001, d: 0.25, s: 0, r: 0.1 }, flt: { f: 6000 },
});
P('fx.sweep', '效果', '掃頻', 'Sweep', 119, 'fx', {
  noise: { lvl: 0.5, bp: 1000, q: 3.0, a: 0.6, d: 1.2, s: 0.6, r: 0.8 }, osc: [],
  flt: { f: 500, q: 3.0, env: 4.0, a: 1.2, d: 1.0, s: 1 }, amp: { a: 0.4, d: 1.0, s: 0.7, r: 0.8 },
});
P('fx.noise', '效果', '噪音', 'Noise', 119, 'fx', {
  noise: { lvl: 0.6, a: 0.01, d: 0.5, s: 0.7, r: 0.3 }, osc: [], flt: { f: 8000, q: 0.6 },
  amp: { a: 0.01, d: 0.3, s: 0.8, r: 0.3 },
});
P('fx.wind', '效果', '風聲', 'Wind', 119, 'fx', {
  noise: { lvl: 0.6, pink: 1, bp: 900, q: 0.5, a: 1.0, d: 1.0, s: 0.9, r: 1.2 }, osc: [],
  lfo: [{ to: 'cutoff', rate: 0.15, depth: 2.0 }], flt: { f: 1200, q: 0.7 }, amp: { a: 1.0, r: 1.4 },
});
P('fx.sci', '效果', '科幻', 'Sci-Fi', 119, 'fx', {
  osc: [{ w: 'pls', pw: 0.2, lvl: 0.26, fm: { ratio: 2.5, idx: 3.0, d: 1.0 } }],
  lfo: [{ to: 'pitch', rate: 7, depth: 1.2 }], flt: { f: 3200, q: 2.0 }, amp: { a: 0.01, d: 0.6, s: 0.4, r: 0.4 },
});
P('fx.bell', '效果', '鐘聲 FX', 'Bell FX', 119, 'fx', {
  osc: [{ w: 'sin', lvl: 0.3, fm: { ratio: 4.7, idx: 4.0, d: 2.0 } }], amp: { a: 0.001, d: 2.6, s: 0, r: 1.6 },
  flt: { f: 6000 },
});
P('fx.drop', '效果', '落水', 'Water Drop', 119, 'fx', {
  osc: [{ w: 'sin', lvl: 0.4 }], penv: { amt: 700, d: 0.09 }, amp: { a: 0.001, d: 0.4, s: 0, r: 0.2 },
  flt: { f: 4200, env: 1.0, d: 0.2 },
});
P('fx.reverse', '效果', '倒轉', 'Reverse', 119, 'fx', {
  noise: { lvl: 0.4, bp: 3000, q: 1.2, a: 1.4, d: 0.4, s: 0.8, r: 0.2 }, osc: [{ w: 'saw', lvl: 0.16, attack: 1.6, decay: 0.2 }],
  amp: { a: 1.6, d: 0.4, s: 0.6, r: 0.3 }, flt: { f: 3000, env: 1.6, a: 1.4, s: 0.8 },
});
P('fx.metal', '效果', '金屬', 'Metal', 119, 'fx', {
  osc: [{ w: 'sin', lvl: 0.3, fm: { ratio: 4.13, idx: 6.0, d: 0.6 } }, { w: 'sin', lvl: 0.2, fm: { ratio: 7.3, idx: 4.0, d: 0.4 } }],
  flt: { f: 8500, q: 1.4 }, amp: { a: 0.001, d: 1.0, s: 0.1, r: 0.6 }, noise: { lvl: 0.2, hp: 5000, d: 0.08 },
});
P('fx.heart', '效果', '心跳', 'Heartbeat', 119, 'fx', {
  osc: [{ w: 'sin', lvl: 0.6 }], penv: { amt: -600, d: 0.06 }, flt: { f: 300 },
  amp: { a: 0.002, d: 0.18, s: 0, r: 0.12 }, lfo: [], gain: 0.9,
});
P('fx.space', '效果', '太空', 'Space', 119, 'fx', {
  osc: [{ w: 'saw', lvl: 0.16, uni: 3, spread: 30 }], noise: { lvl: 0.3, pink: 1, bp: 600, q: 0.6, a: 1.0, d: 1.5, s: 0.8, r: 1.5 },
  flt: { f: 900, q: 1.4 }, lfo: [{ to: 'cutoff', rate: 0.2, depth: 1.8 }], amp: { a: 0.8, r: 2.0 },
});

// ────────────────────────── 鼓組 ──────────────────────────
// 鼓音色只要指定 kit：真正的鼓聲由 worklet 依 GM 鼓位即時合成。
PX('drm.ac', '鼓', '原聲鼓組', 'Acoustic Kit', 0, { drum: true, kit: 'ac', gain: 0.9 });
PX('drm.808', '鼓', '808 鼓組', '808 Kit', 0, { drum: true, kit: 808, gain: 0.95 });
PX('drm.909', '鼓', '909 鼓組', '909 Kit', 0, { drum: true, kit: 909, gain: 0.9 });
PX('drm.lofi', '鼓', '低保真鼓組', 'Lo-fi Kit', 0, { drum: true, kit: 'lofi', gain: 0.8, vcurve: 1.4 });

// ────────────────────────────── 組裝／匯出 ──────────────────────────────

// 波形 → 波表鍵（同一種波形、寬度、諧波列共用一份表）
function waveOf(o) {
  const w = o.w || 'sin';
  let key = w;
  if (w === 'pls') key += '|' + (o.pw || 0.5);
  if (w === 'harm') key += '|' + (o.harm || []).join(',');
  return { w, key, pw: o.pw, harm: o.harm };
}

function resolve(def) {
  const base = def.tpl ? TPL[def.tpl] : {};
  const p = dm(BASE, base);
  const merged = dm(p, def.over || {});
  merged.id = def.id;
  merged.name = def.name;
  merged.nameEn = def.nameEn;
  merged.cat = def.cat;
  merged.gm = def.gm ?? 0;
  // 實測音量校正（synth_balance.py 產生），讓每個音色聽起來差不多大聲
  merged.gain = (merged.gain ?? 0.75) * (ZY_GAIN[def.id] ?? 1);
  delete merged.tpl;
  merged.osc = (merged.osc || []).filter(Boolean).map(o => {
    const out = Object.assign({}, o);
    out.wave = waveOf(o);
    delete out.w;
    return out;
  });
  if (merged.sub) merged.sub = Object.assign({ wave: 'sin', oct: -1, lvl: 0 }, merged.sub);
  return merged;
}

export const ZY_PATCHES = LIST.map(resolve);
export const ZY_CATS = [...new Set(ZY_PATCHES.map(p => p.cat))];

// 音色名稱的英文對照：介面切成英文時，選單與清單直接顯示英文名
registerTerms(Object.fromEntries(ZY_PATCHES.filter(p => p.nameEn).map(p => [p.name, p.nameEn])));

// 給介面用：某一族的音色
export function patchesIn(cat) { return ZY_PATCHES.filter(p => p.cat === cat); }
export const GM_OF = new Map(ZY_PATCHES.map(p => [p.id, p.gm]));

