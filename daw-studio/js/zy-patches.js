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
const TPL = {
  piano: {
    amp: { a: 0.002, d: 2.4, s: 0, r: 0.35 }, vcurve: 1.25, kdecay: 1, gain: 0.85,
    flt: { type: 'lp', f: 3200, q: 0.5, key: 0.55, env: 1.1, a: 0.001, d: 0.45, s: 0.18, r: 0.35 },
    str: { lvl: 0.55, bright: 0.72, decay: 2.2 },
    noise: { lvl: 0.1, hp: 1800, d: 0.018, vel: 0.7 },
  },
  ep: {
    amp: { a: 0.003, d: 2.0, s: 0.12, r: 0.4 }, vcurve: 1.2, kdecay: 0.8, gain: 0.7,
    flt: { type: 'lp', f: 3400, q: 0.45, key: 0.3, env: 0.5, a: 0.002, d: 0.5, s: 0.25, r: 0.4 },
    osc: [{ w: 'sin', lvl: 0.5, fm: { ratio: 1, idx: 2.1, d: 0.55 } }],
  },
  org: {
    amp: { a: 0.008, d: 0.05, s: 1, r: 0.09 }, vcurve: 0.6, gain: 0.62,
    flt: { type: 'lp', f: 7000, q: 0.35, key: 0.15, env: 0, a: 0.01, d: 0.1, s: 1, r: 0.1 },
    osc: [{ w: 'harm', harm: [1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1, 0.06], lvl: 0.5 }],
  },
  bel: {
    amp: { a: 0.001, d: 1.6, s: 0, r: 0.9 }, vcurve: 1.1, kdecay: 1, gain: 0.7,
    flt: { type: 'lp', f: 6000, q: 0.4, key: 0.4, env: 0.4, a: 0.001, d: 0.3, s: 0.1, r: 0.4 },
    osc: [{ w: 'sin', lvl: 0.5, fm: { ratio: 3.5, idx: 3.2, d: 0.8 } }],
  },
  gtr: {
    amp: { a: 0.002, d: 1.6, s: 0, r: 0.3 }, vcurve: 1.2, kdecay: 1, gain: 0.8,
    flt: { type: 'lp', f: 3400, q: 0.6, key: 0.5, env: 1.0, a: 0.001, d: 0.35, s: 0.15, r: 0.3 },
    str: { lvl: 0.6, bright: 0.75, decay: 1.9 },
    noise: { lvl: 0.1, hp: 2500, d: 0.014, vel: 0.6 },
  },
  bas: {
    amp: { a: 0.004, d: 0.5, s: 0.55, r: 0.1 }, vcurve: 1.1, gain: 0.8,
    flt: { type: 'lp', f: 900, q: 1.2, key: 0.3, env: 1.6, a: 0.002, d: 0.25, s: 0.15, r: 0.15 },
    osc: [{ w: 'saw', lvl: 0.4 }],
    sub: { wave: 'sin', oct: -1, lvl: 0.32 },
  },
  str: {
    amp: { a: 0.2, d: 0.5, s: 0.85, r: 0.42 }, vcurve: 0.9, gain: 0.5,
    flt: { type: 'lp', f: 2400, q: 0.6, key: 0.35, env: 0.8, a: 0.25, d: 0.6, s: 0.55, r: 0.5 },
    osc: [{ w: 'saw', lvl: 0.34, uni: 3, spread: 9, wide: 0.5 }],
    lfo: [{ to: 'pitch', rate: 5.2, depth: 0.09, delay: 0.35 }],
  },
  wnd: {
    amp: { a: 0.045, d: 0.15, s: 0.9, r: 0.12 }, vcurve: 0.9, gain: 0.6,
    flt: { type: 'lp', f: 2800, q: 0.7, key: 0.3, env: 0.6, a: 0.05, d: 0.2, s: 0.7, r: 0.15 },
    osc: [{ w: 'sqr', lvl: 0.35 }],
    lfo: [{ to: 'pitch', rate: 5.5, depth: 0.07, delay: 0.3 }],
  },
  brs: {
    amp: { a: 0.035, d: 0.2, s: 0.85, r: 0.12 }, vcurve: 1.1, gain: 0.52,
    flt: { type: 'lp', f: 1600, q: 0.9, key: 0.3, env: 2.2, a: 0.03, d: 0.25, s: 0.45, r: 0.15 },
    osc: [{ w: 'saw', lvl: 0.32, uni: 2, spread: 6 }],
    lfo: [{ to: 'pitch', rate: 5.2, depth: 0.06, delay: 0.35 }],
    drive: 0.12,
  },
  eth: {
    amp: { a: 0.02, d: 1.4, s: 0.3, r: 0.35 }, vcurve: 1.1, gain: 0.7,
    flt: { type: 'lp', f: 2800, q: 0.7, key: 0.35, env: 0.9, a: 0.01, d: 0.4, s: 0.3, r: 0.35 },
    osc: [{ w: 'saw', lvl: 0.32 }],
  },
  cho: {
    amp: { a: 0.16, d: 0.4, s: 0.9, r: 0.5 }, vcurve: 0.85, gain: 0.5,
    flt: { type: 'lp', f: 2600, q: 0.6, key: 0.2, env: 0.5, a: 0.15, d: 0.4, s: 0.6, r: 0.5 },
    osc: [{ w: 'saw', lvl: 0.34, uni: 3, spread: 12, wide: 0.6 }],
    frm: { v: 'a', v2: 'o', morph: 0.2, q: 7, lvl: 0.55 },
    lfo: [{ to: 'pitch', rate: 4.6, depth: 0.1, delay: 0.4 }],
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

// ────────────────────────────── 鋼琴 ──────────────────────────────
P('pno.grand', '鋼琴', '平台鋼琴', 'Grand Piano', 0, 'piano', {});
P('pno.concert', '鋼琴', '演奏廳鋼琴', 'Concert Grand', 0, 'piano', { amp: { d: 3.2 }, flt: { f: 4200 }, str: { decay: 3.0, bright: 0.8 } });
P('pno.bright', '鋼琴', '明亮平台鋼琴', 'Bright Grand', 1, 'piano', { flt: { f: 5600, q: 0.4 }, str: { bright: 0.92, decay: 2.0 }, noise: { lvl: 0.14 } });
P('pno.upright', '鋼琴', '直立鋼琴', 'Upright Piano', 0, 'piano', { flt: { f: 2100, q: 0.6 }, str: { decay: 1.7, bright: 0.6 }, noise: { lvl: 0.16, hp: 1200 } });
P('pno.felt', '鋼琴', '毛氈鋼琴', 'Felt Piano', 0, 'piano', { flt: { f: 950, q: 0.45 }, amp: { d: 1.9 }, str: { bright: 0.4, decay: 1.8 }, noise: { lvl: 0.22, hp: 900 } });
P('pno.honky', '鋼琴', '走音酒吧鋼琴', 'Honky Tonk', 0, 'piano', {
  flt: { f: 2600 }, osc: [{ w: 'tri', lvl: 0.12, cents: 26, decay: 1.2 }, { w: 'tri', lvl: 0.1, cents: -24, decay: 1.0 }],
});
P('pno.lofi', '鋼琴', '錄音帶鋼琴', 'Lo-fi Piano', 0, 'piano', { flt: { f: 1500, q: 0.5 }, drive: 0.12, amp: { r: 0.5 }, str: { bright: 0.5 } });
P('pno.toy', '鋼琴', '玩具鋼琴', 'Toy Piano', 13, 'piano', {
  amp: { d: 0.9 }, kdecay: 1, flt: { f: 5200, key: 0.6 }, str: { bright: 0.95, decay: 0.7, lvl: 0.5 },
  osc: [{ w: 'sin', lvl: 0.22, oct: 1, decay: 0.5 }], noise: { lvl: 0.3, hp: 3500, d: 0.01 },
});
P('pno.crystal', '鋼琴', '水晶鋼琴', 'Crystal Piano', 8, 'piano', {
  flt: { f: 5000 }, str: { bright: 0.9, decay: 2.6 },
  osc: [{ w: 'sin', lvl: 0.16, oct: 2, decay: 1.8 }, { w: 'sin', lvl: 0.1, oct: 3, detune: 0, cents: 7, decay: 1.2 }],
});
P('pno.fm', '鋼琴', 'FM 鋼琴', 'FM Piano', 0, 'piano', {
  str: { lvl: 0.3 }, flt: { f: 3800 },
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 1.7, d: 0.7 } }, { w: 'sin', lvl: 0.12, fm: { ratio: 14, idx: 0.9, d: 0.1 } }],
});
P('pno.pad', '鋼琴', '鋼琴＋弦樂', 'Piano & Strings', 0, 'piano', {
  osc: [{ w: 'saw', lvl: 0.1, uni: 2, spread: 8, attack: 0.35 }], amp: { r: 0.6 },
});
P('pno.prep', '鋼琴', '預置鋼琴', 'Prepared Piano', 0, 'piano', {
  flt: { f: 2400, q: 2.2 }, noise: { lvl: 0.3, bp: 1800, d: 0.12 }, str: { bright: 0.9, decay: 1.4 },
  osc: [{ w: 'sin', lvl: 0.18, cents: 44, decay: 0.9 }],
});

// ────────────────────────── 電鋼琴／大鍵琴 ──────────────────────────
P('ep.rhodes', '電鋼琴', '電鋼琴 Rhodes', 'Rhodes E.Piano', 4, 'ep', {});
P('ep.rhodes79', '電鋼琴', 'Rhodes 1979', 'Rhodes 1979', 4, 'ep', {
  flt: { f: 1400, q: 0.55 }, osc: [{ w: 'sin', lvl: 0.5, fm: { ratio: 1, idx: 0.9, d: 0.9 } }],
  amp: { d: 1.1, s: 0.06, r: 0.3 }, drive: 0.06,
});
P('ep.bright', '電鋼琴', '明亮電鋼琴', 'Bright E.Piano', 4, 'ep', {
  flt: { f: 7800, q: 0.4 }, osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 1, idx: 3.2, d: 0.35 } },
    { w: 'sin', lvl: 0.22, oct: 2, fm: { ratio: 14, idx: 2.2, d: 0.08 } }, { w: 'tri', lvl: 0.08, oct: 1 }],
});
P('ep.wurli', '電鋼琴', 'Wurlitzer 電鋼琴', 'Wurlitzer', 4, 'ep', {
  osc: [{ w: 'pls', pw: 0.32, lvl: 0.4 }, { w: 'sin', lvl: 0.22, oct: 1, fm: { ratio: 2, idx: 1.2, d: 0.18 } }],
  flt: { f: 2900, q: 0.6 }, drive: 0.1, amp: { d: 1.8 },
});
P('ep.wurli2', '電鋼琴', '破音 Wurlitzer', 'Dirty Wurlitzer', 4, 'ep', {
  osc: [{ w: 'pls', pw: 0.3, lvl: 0.42, fm: { ratio: 2, idx: 1.0, d: 0.2 } }],
  flt: { f: 2400, q: 0.8 }, drive: 0.24, amp: { d: 1.5 },
});
P('ep.dx', '電鋼琴', 'DX7 電鋼琴', 'DX7 E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.46, fm: { ratio: 1, idx: 3.0, d: 0.6 } }, { w: 'sin', lvl: 0.14, oct: 2, fm: { ratio: 7, idx: 1.4, d: 0.25 } }],
  flt: { f: 4200, q: 0.4 }, amp: { a: 0.002, d: 2.6, s: 0.05, r: 0.5 },
});
P('ep.tine', '電鋼琴', '鐵片電鋼琴', 'Tine E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 1.4, d: 0.9 } }, { w: 'sin', lvl: 0.26, oct: 2, fm: { ratio: 9, idx: 2.4, d: 0.05 } }],
  flt: { f: 2400, q: 0.6 }, amp: { d: 2.8, s: 0.08, r: 0.6 },
});
P('ep.bell', '電鋼琴', '鐘聲電鋼琴', 'Bell E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.34, fm: { ratio: 1, idx: 0.8, d: 1.0 } }, { w: 'sin', lvl: 0.34, oct: 2, fm: { ratio: 3.51, idx: 3.2, d: 1.4 } }],
  amp: { a: 0.001, d: 3.4, s: 0, r: 1.2 }, flt: { f: 6200, q: 0.4 },
});
P('ep.soft', '電鋼琴', '柔和 FM 電鋼琴', 'Soft FM E.Piano', 4, 'ep', {
  flt: { f: 1100, q: 0.4 }, amp: { a: 0.06, d: 1.4, s: 0.2, r: 0.6 },
  osc: [{ w: 'sin', lvl: 0.5, fm: { ratio: 1, idx: 0.7, d: 1.2 } }, { w: 'tri', lvl: 0.1, oct: -1 }],
});
P('ep.bark', '電鋼琴', '咬音電鋼琴', 'Bark E.Piano', 4, 'ep', {
  flt: { f: 2600, q: 1.1, env: 2.4, d: 0.3 }, drive: 0.12, osc: [{ w: 'sin', lvl: 0.46, fm: { ratio: 1, idx: 2.7, d: 0.3 } }],
});
P('ep.phase', '電鋼琴', '相位電鋼琴', 'Phase E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.34, fm: { ratio: 1, idx: 1.8, d: 0.6 } }, { w: 'sin', lvl: 0.3, cents: 17, fm: { ratio: 1.004, idx: 1.8, d: 0.6 } }],
  flt: { f: 2600 }, amp: { a: 0.02, d: 2.6, r: 0.6 }, lfo: [{ to: 'pan', rate: 0.45, depth: 0.7 }, { to: 'amp', rate: 0.45, depth: 0.25 }],
});
P('ep.clav', '電鋼琴', 'Clavinet', 'Clavinet', 7, 'ep', {
  osc: [{ w: 'pls', pw: 0.18, lvl: 0.44 }], flt: { f: 2200, q: 2.4, env: 3.0, a: 0.001, d: 0.18, s: 0.08 },
  amp: { a: 0.001, d: 0.7, s: 0, r: 0.12 }, kdecay: 0.7, drive: 0.1, gain: 0.62,
});
P('ep.clavfunk', '電鋼琴', '放克 Clav', 'Funk Clav', 7, 'ep', {
  osc: [{ w: 'pls', pw: 0.14, lvl: 0.46 }], flt: { f: 1500, q: 3.2, env: 3.6, a: 0.001, d: 0.12, s: 0.05 },
  amp: { a: 0.001, d: 0.5, s: 0, r: 0.1 }, drive: 0.18, gain: 0.6,
});
P('ep.harpsi', '電鋼琴', '大鍵琴', 'Harpsichord', 6, 'ep', {
  str: { lvl: 0.6, bright: 0.95, decay: 0.9 }, amp: { a: 0.001, d: 0.9, s: 0, r: 0.15 }, kdecay: 1,
  flt: { f: 5200, q: 0.5, env: 1.4, d: 0.2 }, noise: { lvl: 0.14, hp: 3000, d: 0.012 }, gain: 0.72,
});
P('ep.harpsi8', '電鋼琴', '大鍵琴 8′', 'Harpsichord 8\'', 6, 'ep', {
  str: { lvl: 0.55, bright: 0.8, decay: 1.2 }, amp: { a: 0.001, d: 1.2, s: 0, r: 0.2 },
  flt: { f: 3200, q: 0.6, env: 1.0, d: 0.3 }, osc: [{ w: 'saw', lvl: 0.1, decay: 0.5 }], gain: 0.7,
});
P('ep.celesta', '電鋼琴', '鋼片琴', 'Celesta', 8, 'ep', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 3.03, idx: 2.4, d: 0.5 } }, { w: 'sin', lvl: 0.18, oct: 1, fm: { ratio: 1, idx: 1.2, d: 0.3 } }],
  amp: { a: 0.001, d: 1.8, s: 0, r: 0.7 }, kdecay: 1, flt: { f: 6500 },
});
P('ep.toy', '電鋼琴', '玩具電鋼琴', 'Toy E.Piano', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 2, idx: 2.6, d: 0.3 } }], flt: { f: 4200, q: 0.8 },
  amp: { a: 0.001, d: 1.0, s: 0, r: 0.3 },
});
P('ep.choir', '電鋼琴', '電鋼琴＋人聲', 'E.Piano & Vox', 4, 'ep', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1, idx: 1.8, d: 0.6 } }, { w: 'saw', lvl: 0.1, uni: 2, spread: 12, attack: 0.5 }],
  frm: { v: 'a', lvl: 0.3, q: 6 }, amp: { d: 2.4, r: 0.6 },
});

// ────────────────────────── 風琴／簧片 ──────────────────────────
P('org.tonewheel', '風琴', '音輪風琴', 'Tonewheel Organ', 16, 'org', {});
P('org.jazz', '風琴', '爵士風琴', 'Jazz Organ', 16, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.85, 0.55, 0.4, 0.5, 0.2, 0.3, 0.15], lvl: 0.5, uni: 2, spread: 3 }],
  noise: { lvl: 0.16, hp: 4000, d: 0.008 }, amp: { r: 0.12 }, drive: 0.1,
});
P('org.rock', '風琴', '搖滾風琴', 'Rock Organ', 16, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.9, 0.7, 0.55, 0.4, 0.3, 0.2, 0.15, 0.1], lvl: 0.5, uni: 3, spread: 5 }],
  drive: 0.3, flt: { f: 5200 }, amp: { r: 0.1 },
});
P('org.gospel', '風琴', '福音風琴', 'Gospel Organ', 16, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.95, 0.8, 0.6, 0.5, 0.35, 0.25, 0.2, 0.12], lvl: 0.5, uni: 2, spread: 4 }],
  drive: 0.16, amp: { a: 0.02, r: 0.16 },
});
P('org.church', '風琴', '管風琴', 'Church Organ', 19, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.08, 0.06], lvl: 0.55 }],
  amp: { a: 0.06, r: 0.2 }, flt: { f: 5200, q: 0.4 }, gain: 0.6,
});
P('org.pipeflute', '風琴', '管風琴笛音', 'Pipe Flute Stop', 19, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.3, 0.12, 0.05, 0.02], lvl: 0.55 }],
  amp: { a: 0.04, r: 0.14 }, noise: { lvl: 0.1, bp: 2200, q: 2, d: 0.06 }, flt: { f: 3600 },
});
P('org.full', '風琴', '管風琴全奏', 'Full Organ', 19, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.9, 0.75, 0.65, 0.55, 0.45, 0.38, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08], lvl: 0.5, uni: 2, spread: 4 }],
  amp: { a: 0.05, r: 0.25 }, drive: 0.08, gain: 0.55,
});
P('org.reed', '風琴', '簧風琴', 'Reed Organ', 20, 'org', {
  osc: [{ w: 'pls', pw: 0.3, lvl: 0.4, uni: 2, spread: 6 }], frm: { v: 'o', q: 6, lvl: 0.35 },
  amp: { a: 0.03, d: 0.1, s: 1, r: 0.14 }, flt: { f: 3400 },
});
P('org.pump', '風琴', '腳踏簧風琴', 'Pump Organ', 20, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.5, 0.6, 0.2, 0.3, 0.1], lvl: 0.5 }], noise: { lvl: 0.08, bp: 1200, q: 1.2, d: 0.1 },
  amp: { a: 0.05, r: 0.2 }, flt: { f: 2600 }, gain: 0.6,
});
P('org.accordion', '風琴', '手風琴', 'Accordion', 21, 'org', {
  osc: [{ w: 'pls', pw: 0.42, lvl: 0.34 }, { w: 'pls', pw: 0.42, lvl: 0.3, cents: 9 }],
  amp: { a: 0.02, d: 0.08, s: 1, r: 0.12 }, flt: { f: 3800, q: 0.5 }, frm: { v: 'e', lvl: 0.25, q: 5 },
});
P('org.musette', '風琴', '法式手風琴', 'French Musette', 21, 'org', {
  osc: [{ w: 'pls', pw: 0.4, lvl: 0.28 }, { w: 'pls', pw: 0.4, lvl: 0.26, cents: 14 }, { w: 'pls', pw: 0.4, lvl: 0.26, cents: -13 }],
  amp: { a: 0.02, d: 0.08, s: 1, r: 0.14 }, flt: { f: 3600 }, frm: { v: 'e', lvl: 0.22, q: 5 },
});
P('org.harmonium', '風琴', '簧片風琴', 'Harmonium', 20, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.45, 0.35, 0.2, 0.15], lvl: 0.5, uni: 2, spread: 5 }],
  noise: { lvl: 0.1, bp: 900, q: 1.0, d: 0.12, s: 0.2 }, amp: { a: 0.06, r: 0.18 }, flt: { f: 2400 },
});
P('org.perc', '風琴', '風琴打音', 'Percussive Organ', 16, 'org', {
  osc: [{ w: 'harm', harm: [1, 0.6, 0.4, 0.5, 0.2], lvl: 0.4 }, { w: 'sin', lvl: 0.28, oct: 2, decay: 0.35 }],
});
P('org.calliope', '風琴', '汽笛琴', 'Calliope', 19, 'org', {
  osc: [{ w: 'pls', pw: 0.5, lvl: 0.36 }, { w: 'saw', lvl: 0.12 }], noise: { lvl: 0.14, bp: 1600, q: 1.6, d: 0.05 },
  amp: { a: 0.03, r: 0.1 }, flt: { f: 4200 }, lfo: [{ to: 'pitch', rate: 5.8, depth: 0.06, delay: 0.2 }],
});

// ────────────────────────── 鐘琴／打擊鍵盤 ──────────────────────────
P('bel.glock', '打擊鍵盤', '鐘琴', 'Glockenspiel', 9, 'bel', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 5.4, idx: 3.4, d: 1.0 } }, { w: 'sin', lvl: 0.2, oct: 1 }],
  flt: { f: 9000 }, amp: { d: 1.4, r: 1.0 }, kdecay: 1,
});
P('bel.musicbox', '打擊鍵盤', '音樂盒', 'Music Box', 10, 'bel', {
  osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 7.1, idx: 2.0, d: 0.4 } }, { w: 'sin', lvl: 0.14, oct: 2, decay: 1.2 }],
  flt: { f: 7000 }, amp: { d: 1.3, r: 0.6 }, noise: { lvl: 0.08, hp: 5000, d: 0.01 },
});
P('bel.tubular', '打擊鍵盤', '管鐘', 'Tubular Bells', 14, 'bel', {
  osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 2.76, idx: 2.0, d: 2.0 } }, { w: 'sin', lvl: 0.22, fm: { ratio: 5.4, idx: 1.2, d: 1.4 } }],
  flt: { f: 5200 }, amp: { d: 3.4, r: 2.0 }, kdecay: 0.6,
});
P('bel.church', '打擊鍵盤', '教堂鐘', 'Church Bell', 14, 'bel', {
  osc: [{ w: 'sin', lvl: 0.36, fm: { ratio: 0.5, idx: 2.6, d: 2.6 } }, { w: 'sin', lvl: 0.26, fm: { ratio: 1.183, idx: 2.0, d: 3.0 } }, { w: 'sin', lvl: 0.16, fm: { ratio: 2.51, idx: 1.6, d: 2.2 } }],
  flt: { f: 2600, q: 0.5 }, amp: { a: 0.015, d: 4.2, s: 0, r: 3.4 }, kdecay: 0.5, gain: 0.6,
});
P('bel.gong', '打擊鍵盤', '鑼', 'Gong', 14, 'bel', {
  osc: [{ w: 'sin', lvl: 0.3, fm: { ratio: 1.41, idx: 2.4, d: 3.0 } }, { w: 'sin', lvl: 0.2, fm: { ratio: 2.83, idx: 1.8, d: 3.4 } }, { w: 'sin', lvl: 0.12, fm: { ratio: 4.1, idx: 1.2, d: 2.6 } }],
  flt: { f: 2800, q: 0.8 }, amp: { a: 0.04, d: 4.0, r: 3.5 }, noise: { lvl: 0.16, bp: 2400, d: 0.4 }, gain: 0.55,
});
P('bel.chime', '打擊鍵盤', '風鈴', 'Wind Chime', 112, 'bel', {
  osc: [{ w: 'sin', lvl: 0.36, fm: { ratio: 6.3, idx: 1.6, d: 0.8 } }, { w: 'sin', lvl: 0.16, oct: 1, cents: 11 }],
  flt: { f: 9000 }, amp: { a: 0.002, d: 1.8, r: 1.4 }, kdecay: 0.4,
});
P('bel.steel', '打擊鍵盤', '鋼鼓', 'Steel Drum', 114, 'bel', {
  osc: [{ w: 'sin', lvl: 0.34, fm: { ratio: 1.0, idx: 1.2, d: 0.35 } }, { w: 'sin', lvl: 0.24, fm: { ratio: 2.01, idx: 3.4, d: 0.18 } }],
  flt: { f: 7600, env: 2.2, d: 0.14 }, amp: { a: 0.001, d: 0.8, s: 0, r: 0.35 },
  noise: { lvl: 0.18, bp: 4200, d: 0.015 },
});
P('bel.marimba', '打擊鍵盤', '木琴', 'Marimba', 12, 'bel', {
  osc: [{ w: 'sin', lvl: 0.5 }, { w: 'sin', lvl: 0.16, oct: 2, decay: 0.25 }, { w: 'sin', lvl: 0.08, oct: 3, cents: 24, decay: 0.12 }],
  flt: { f: 4200, env: 1.2, d: 0.15 }, amp: { a: 0.001, d: 0.6, r: 0.25 }, noise: { lvl: 0.12, bp: 1800, d: 0.012 }, kdecay: 1,
});
P('bel.xylo', '打擊鍵盤', '木琴（高音）', 'Xylophone', 11, 'bel', {
  osc: [{ w: 'sin', lvl: 0.44 }, { w: 'sin', lvl: 0.2, oct: 2, decay: 0.3 }, { w: 'sin', lvl: 0.1, oct: 3, cents: 38, decay: 0.1 }],
  flt: { f: 8000 }, amp: { a: 0.001, d: 0.45, r: 0.2 }, noise: { lvl: 0.16, hp: 3000, d: 0.01 }, kdecay: 1,
});
P('bel.vibes', '打擊鍵盤', '顫音琴', 'Vibraphone', 11, 'bel', {
  osc: [{ w: 'sin', lvl: 0.5 }, { w: 'sin', lvl: 0.16, oct: 2, decay: 1.4 }],
  flt: { f: 5200 }, amp: { a: 0.002, d: 2.6, r: 1.4 }, lfo: [{ to: 'amp', rate: 5.0, depth: 0.35 }], kdecay: 0.5,
});
P('bel.kalimba', '打擊鍵盤', '卡林巴', 'Kalimba', 108, 'bel', {
  osc: [{ w: 'sin', lvl: 0.46 }, { w: 'sin', lvl: 0.22, oct: 1, cents: 8 }, { w: 'sin', lvl: 0.1, oct: 2, cents: 33, decay: 0.3 }],
  flt: { f: 4600, env: 1.0, d: 0.2 }, amp: { a: 0.001, d: 1.0, r: 0.4 }, noise: { lvl: 0.14, bp: 2600, d: 0.01 }, kdecay: 1,
});
P('bel.handpan', '打擊鍵盤', '手碟', 'Handpan', 108, 'bel', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 1.0, idx: 0.7, d: 2.2 } }, { w: 'sin', lvl: 0.2, fm: { ratio: 2.0, idx: 1.0, d: 1.8 } }, { w: 'sin', lvl: 0.12, fm: { ratio: 3.02, idx: 0.7, d: 1.4 } }],
  flt: { f: 3600, env: 0.8, d: 0.4 }, amp: { a: 0.004, d: 3.0, r: 1.6 }, noise: { lvl: 0.1, bp: 1000, d: 0.02 }, kdecay: 0.7,
});
P('bel.glass', '打擊鍵盤', '玻璃琴', 'Glass Armonica', 8, 'bel', {
  osc: [{ w: 'sin', lvl: 0.42, fm: { ratio: 4.03, idx: 1.2, d: 1.4 } }, { w: 'sin', lvl: 0.16, cents: 5 }],
  flt: { f: 8000 }, amp: { a: 0.05, d: 2.2, r: 1.6 }, gain: 0.6,
});
P('bel.bellfm', '打擊鍵盤', 'FM 鐘', 'FM Bell', 9, 'bel', {
  osc: [{ w: 'sin', lvl: 0.4, fm: { ratio: 3.5, idx: 5.0, d: 1.2 } }],
  flt: { f: 7500 }, amp: { a: 0.001, d: 2.2, r: 1.4 }, kdecay: 0.6,
});
P('bel.temple', '打擊鍵盤', '寺廟鐘', 'Temple Bell', 14, 'bel', {
  osc: [{ w: 'sin', lvl: 0.36, fm: { ratio: 1.41, idx: 3.4, d: 1.4 } }, { w: 'sin', lvl: 0.2, fm: { ratio: 2.83, idx: 2.4, d: 0.9 } }],
  flt: { f: 2200, q: 0.9 }, amp: { a: 0.002, d: 1.6, s: 0, r: 1.2 }, noise: { lvl: 0.14, bp: 1600, d: 0.2 }, gain: 0.62,
});
P('bel.agogo', '打擊鍵盤', '阿哥哥鈴', 'Agogo Bells', 113, 'bel', {
  osc: [{ w: 'sqr', lvl: 0.2 }, { w: 'sin', lvl: 0.34, fm: { ratio: 1.5, idx: 1.6, d: 0.3 } }],
  flt: { f: 5600, env: 1.2, d: 0.15 }, amp: { a: 0.001, d: 0.7, r: 0.25 },
});

// ────────────────────────────── 吉他 ──────────────────────────────
P('gtr.nylon', '吉他', '古典吉他（尼龍弦）', 'Nylon Guitar', 24, 'gtr', {
  flt: { f: 2300, q: 0.45, env: 1.6, d: 0.2 }, str: { bright: 0.55, decay: 1.6 },
  noise: { lvl: 0.2, bp: 1100, d: 0.025 }, gain: 0.78,
});
P('gtr.steel', '吉他', '民謠吉他（鋼弦）', 'Steel Guitar', 25, 'gtr', {});
P('gtr.twelve', '吉他', '十二弦吉他', '12-String Guitar', 25, 'gtr', {
  osc: [{ w: 'saw', lvl: 0.1, cents: 12, decay: 1.6 }, { w: 'saw', lvl: 0.08, cents: -10, decay: 1.4 }],
  str: { bright: 0.85, decay: 2.2 }, flt: { f: 4200 },
});
P('gtr.jumbo', '吉他', '大型鋼弦吉他', 'Jumbo Acoustic', 25, 'gtr', {
  flt: { f: 2800, q: 0.5 }, str: { bright: 0.6, decay: 2.6 }, amp: { d: 2.2 }, gain: 0.8,
});
P('gtr.electric', '吉他', '清音電吉他', 'Clean Electric', 27, 'gtr', {
  flt: { f: 3600, q: 0.8 }, str: { bright: 0.7, decay: 2.6 }, amp: { d: 2.6, s: 0.1, r: 0.3 }, drive: 0.08,
});
P('gtr.jazz', '吉他', '爵士吉他', 'Jazz Guitar', 26, 'gtr', {
  flt: { f: 1150, q: 0.9 }, str: { bright: 0.3, decay: 2.4 }, amp: { a: 0.004, d: 2.2, r: 0.45 },
  frm: { v: 'o', q: 5, lvl: 0.3 }, noise: { lvl: 0.06, bp: 800, d: 0.02 }, gain: 0.76,
});
P('gtr.mute', '吉他', '悶音吉他', 'Muted Guitar', 29, 'gtr', {
  amp: { a: 0.001, d: 0.35, s: 0, r: 0.1 }, str: { bright: 0.6, decay: 0.4 }, flt: { f: 2200 }, noise: { lvl: 0.16, bp: 2400, d: 0.01 },
});
P('gtr.funk', '吉他', '放克刷弦', 'Funk Guitar', 28, 'gtr', {
  amp: { a: 0.001, d: 0.5, s: 0, r: 0.1 }, str: { bright: 0.9, decay: 0.6 },
  flt: { f: 3200, q: 2.0, env: 2.4, a: 0.001, d: 0.16, s: 0.05 },
});
P('gtr.dist', '吉他', '破音吉他', 'Distorted Guitar', 30, 'gtr', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 5 }, { w: 'sqr', lvl: 0.16 }],
  amp: { a: 0.003, d: 0.8, s: 0.7, r: 0.15 }, flt: { f: 2200, q: 1.2, env: 1.6, d: 0.25, s: 0.6 },
  drive: 0.55, str: undefined, noise: undefined, gain: 0.5,
});
P('gtr.heavy', '吉他', '重金屬吉他', 'Heavy Guitar', 30, 'gtr', {
  osc: [{ w: 'saw', lvl: 0.32, uni: 3, spread: 7 }, { w: 'sqr', lvl: 0.2, cents: -12 }],
  amp: { a: 0.002, d: 0.6, s: 0.8, r: 0.12 }, flt: { f: 1600, q: 1.4, env: 1.2, d: 0.3, s: 0.7 },
  drive: 0.75, str: undefined, noise: undefined, gain: 0.45,
});
P('gtr.harm', '吉他', '泛音吉他', 'Harmonic Guitar', 31, 'gtr', {
  osc: [{ w: 'sin', lvl: 0.36, oct: 1 }, { w: 'sin', lvl: 0.16, oct: 2, cents: 6 }],
  str: { lvl: 0.3, bright: 0.95, decay: 2.2 }, flt: { f: 6500 }, amp: { d: 2.4 }, noise: undefined,
});
P('gtr.banjo', '吉他', '斑鳩琴', 'Banjo', 105, 'gtr', {
  str: { lvl: 0.62, bright: 0.98, decay: 1.2 }, flt: { f: 5600, q: 1.2 }, amp: { d: 1.0, r: 0.2 }, noise: { lvl: 0.14, bp: 3200, d: 0.01 },
});
P('gtr.mandolin', '吉他', '曼陀林', 'Mandolin', 105, 'gtr', {
  osc: [{ w: 'saw', lvl: 0.12, cents: 9, decay: 0.9 }, { w: 'saw', lvl: 0.1, cents: -9, decay: 0.9 }],
  str: { bright: 0.95, decay: 1.0 }, flt: { f: 5200, env: 1.2, d: 0.2 }, amp: { d: 1.0, r: 0.2 },
});
P('gtr.ukulele', '吉他', '烏克麗麗', 'Ukulele', 105, 'gtr', {
  flt: { f: 3200, q: 0.6 }, str: { bright: 0.8, decay: 1.1 }, amp: { d: 1.1, r: 0.25 }, gain: 0.72,
});
P('gtr.harp', '吉他', '豎琴', 'Concert Harp', 46, 'gtr', {
  str: { lvl: 0.6, bright: 0.62, decay: 3.2 }, flt: { f: 2800, q: 0.4 }, amp: { a: 0.003, d: 3.0, r: 1.2 }, noise: { lvl: 0.08, bp: 1600, d: 0.02 }, gain: 0.75,
});
P('gtr.dulcimer', '吉他', '揚琴', 'Hammered Dulcimer', 15, 'gtr', {
  str: { lvl: 0.6, bright: 0.85, decay: 2.4 }, flt: { f: 4200 }, amp: { a: 0.001, d: 2.4, r: 0.8 },
  noise: { lvl: 0.14, bp: 2600, d: 0.012 },
});
P('gtr.reso', '吉他', '共振吉他', 'Resonator Guitar', 25, 'gtr', {
  osc: [{ w: 'sin', lvl: 0.24, fm: { ratio: 2.4, idx: 1.0, d: 0.5 } }], str: { bright: 0.9, decay: 1.8 },
  flt: { f: 3600, q: 1.4 }, frm: { v: 'o', q: 9, lvl: 0.3 },
});
P('gtr.lofi', '吉他', '錄音帶吉他', 'Lo-fi Guitar', 25, 'gtr', {
  flt: { f: 1300, q: 0.5 }, str: { bright: 0.35, decay: 1.6 }, drive: 0.1, amp: { r: 0.4 },
});

// ────────────────────────────── 貝斯 ──────────────────────────────
P('bas.finger', '貝斯', '指彈電貝斯', 'Finger Bass', 33, 'bas', {
  flt: { f: 800, q: 0.9, env: 1.2 }, osc: [{ w: 'saw', lvl: 0.34 }, { w: 'tri', lvl: 0.16 }], amp: { d: 0.9, s: 0.35, r: 0.12 },
});
P('bas.pick', '貝斯', '匹克貝斯', 'Pick Bass', 34, 'bas', {
  flt: { f: 1100, q: 1.0, env: 1.6 }, noise: { lvl: 0.08, bp: 2200, d: 0.008 }, amp: { d: 0.7, s: 0.4 },
});
P('bas.slap', '貝斯', '擊弦貝斯', 'Slap Bass', 36, 'bas', {
  flt: { f: 700, q: 2.0, env: 3.2, d: 0.18 }, noise: { lvl: 0.2, bp: 3000, d: 0.02 },
  osc: [{ w: 'saw', lvl: 0.36 }, { w: 'sqr', lvl: 0.14, oct: 1 }], amp: { a: 0.001, d: 0.5, s: 0.3, r: 0.1 },
});
P('bas.fretless', '貝斯', '無琴格貝斯', 'Fretless Bass', 35, 'bas', {
  flt: { f: 600, q: 0.8, env: 1.0 }, osc: [{ w: 'saw', lvl: 0.32 }], lfo: [{ to: 'pitch', rate: 5.0, depth: 0.12, delay: 0.1 }],
  amp: { a: 0.01, d: 1.2, s: 0.5, r: 0.2 },
});
P('bas.sub', '貝斯', '低頻貝斯', 'Sub Bass', 38, 'bas', {
  osc: [{ w: 'sin', lvl: 0.5 }], sub: { wave: 'sin', oct: -1, lvl: 0.4 }, flt: { f: 400, env: 0.4 }, amp: { a: 0.006, d: 1.4, s: 0.8, r: 0.15 },
});
P('bas.synth', '貝斯', '合成貝斯', 'Synth Bass', 38, 'bas', {});
P('bas.acid', '貝斯', '303 貝斯', 'Acid 303', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.42 }], sub: { lvl: 0 }, flt: { f: 320, q: 6.0, env: 3.6, a: 0.001, d: 0.22, s: 0.05 },
  amp: { a: 0.002, d: 0.4, s: 0.5, r: 0.08 }, drive: 0.2,
});
P('bas.fm', '貝斯', 'FM 貝斯', 'FM Bass', 38, 'bas', {
  osc: [{ w: 'sin', lvl: 0.44, fm: { ratio: 1.41, idx: 3.4, d: 0.2 } }], sub: { lvl: 0.16 },
  flt: { f: 2400, q: 0.8, env: 2.0, d: 0.22 }, amp: { a: 0.003, d: 0.8, s: 0.5, r: 0.1 },
});
P('bas.reese', '貝斯', '里斯貝斯', 'Reese Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 18 }], sub: { lvl: 0.34 },
  flt: { f: 420, q: 1.6, env: 0.6 }, amp: { a: 0.02, d: 1.0, s: 0.85, r: 0.15 }, drive: 0.15,
});
P('bas.growl', '貝斯', '咆哮貝斯', 'Growl Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.32, uni: 2, spread: 8 }], sub: { lvl: 0.3 },
  flt: { f: 520, q: 3.4, env: 2.0, d: 0.4 }, drive: 0.45, lfo: [{ to: 'cutoff', rate: 6.5, depth: 0.8 }],
});
P('bas.upright', '貝斯', '低音提琴', 'Upright Bass', 32, 'bas', {
  str: { lvl: 0.5, bright: 0.35, decay: 1.4 }, osc: [{ w: 'tri', lvl: 0.1 }], sub: { lvl: 0.2 },
  flt: { f: 700, q: 0.6, env: 1.0 }, amp: { a: 0.01, d: 1.2, s: 0.25, r: 0.2 }, noise: { lvl: 0.14, bp: 1600, d: 0.02 },
});
P('bas.upright2', '貝斯', '撥奏低音提琴', 'Pizzicato Bass', 32, 'bas', {
  str: { lvl: 0.62, bright: 0.5, decay: 0.9 }, osc: [], flt: { f: 900, q: 0.8, env: 1.4, d: 0.15 },
  amp: { a: 0.002, d: 0.9, s: 0.05, r: 0.15 }, sub: { lvl: 0.16 }, noise: { lvl: 0.12, bp: 1200, d: 0.02 },
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
  osc: [{ w: 'saw', lvl: 0.36 }, { w: 'sqr', lvl: 0.18 }], drive: 0.5,
  flt: { f: 900, q: 1.4, env: 1.8, d: 0.3 }, amp: { a: 0.002, d: 0.6, s: 0.6, r: 0.1 },
});
P('bas.moog', '貝斯', 'Moog 貝斯', 'Moog Bass', 38, 'bas', {
  osc: [{ w: 'saw', lvl: 0.32 }, { w: 'sqr', lvl: 0.22, cents: -6 }],
  flt: { f: 300, q: 4.0, env: 2.8, d: 0.3 }, amp: { a: 0.003, d: 0.8, s: 0.55, r: 0.1 },
});
P('bas.808', '貝斯', '808 低音', '808 Sub', 38, 'bas', {
  osc: [{ w: 'sin', lvl: 0.6 }], sub: { lvl: 0.35 }, flt: { f: 300, env: 0.5 },
  amp: { a: 0.004, d: 2.2, s: 0.3, r: 0.3 }, penv: { amt: 120, d: 0.035 }, gain: 0.9,
});
P('bas.old', '貝斯', '老電貝斯', 'Vintage Bass', 33, 'bas', {
  flt: { f: 650, q: 0.7, env: 0.9 }, osc: [{ w: 'tri', lvl: 0.34 }, { w: 'saw', lvl: 0.14 }],
  amp: { a: 0.005, d: 0.9, s: 0.4, r: 0.12 }, drive: 0.08,
});

// ────────────────────────────── 弦樂 ──────────────────────────────
P('str.ensemble', '弦樂', '弦樂合奏', 'String Ensemble', 48, 'str', {});
P('str.solo', '弦樂', '獨奏小提琴', 'Solo Violin', 40, 'str', {
  osc: [{ w: 'saw', lvl: 0.36, uni: 1, spread: 0 }], flt: { f: 3000, q: 0.8, env: 1.2 },
  noise: { lvl: 0.1, bp: 3400, q: 2, d: 0.08, s: 0.1 }, frm: { v: 'o', q: 6, lvl: 0.3 },
  lfo: [{ to: 'pitch', rate: 5.6, depth: 0.13, delay: 0.25 }], amp: { a: 0.09, r: 0.3 },
});
P('str.viola', '弦樂', '中提琴', 'Viola', 41, 'str', {
  osc: [{ w: 'saw', lvl: 0.34, uni: 1 }], flt: { f: 2200, q: 0.7, env: 1.0 },
  frm: { v: 'o', q: 5, lvl: 0.28 }, amp: { a: 0.1, r: 0.32 }, lfo: [{ to: 'pitch', rate: 5.2, depth: 0.11, delay: 0.3 }],
});
P('str.cello', '弦樂', '大提琴', 'Cello', 42, 'str', {
  osc: [{ w: 'saw', lvl: 0.36, uni: 2, spread: 4 }], flt: { f: 1600, q: 0.7, env: 1.1 },
  frm: { v: 'o', q: 5, lvl: 0.26 }, amp: { a: 0.11, r: 0.35 }, noise: { lvl: 0.08, bp: 1200, q: 2, d: 0.1, s: 0.08 },
});
P('str.bass', '弦樂', '低音提琴（弓奏）', 'Contrabass', 43, 'str', {
  osc: [{ w: 'saw', lvl: 0.34, uni: 2, spread: 5 }], flt: { f: 900, q: 0.7, env: 0.9 },
  amp: { a: 0.13, r: 0.36 }, noise: { lvl: 0.09, bp: 700, q: 1.6, d: 0.1, s: 0.08 },
});
P('str.pizz', '弦樂', '撥奏弦樂', 'Pizzicato Strings', 45, 'str', {
  amp: { a: 0.002, d: 0.45, s: 0, r: 0.2 }, lfo: [], osc: [{ w: 'saw', lvl: 0.34, uni: 2, spread: 6 }],
  flt: { f: 1800, q: 1.2, env: 2.6, a: 0.001, d: 0.14, s: 0.05 }, noise: { lvl: 0.12, bp: 2200, d: 0.02 },
});
P('str.trem', '弦樂', '震音弦樂', 'Tremolo Strings', 44, 'str', {
  osc: [{ w: 'saw', lvl: 0.32, uni: 3, spread: 10 }], lfo: [{ to: 'amp', rate: 9, depth: 0.8 }, { to: 'pitch', rate: 5.2, depth: 0.08, delay: 0.3 }],
  amp: { a: 0.12, r: 0.3 },
});
P('str.spicc', '弦樂', '斷奏弦樂', 'Spiccato Strings', 44, 'str', {
  amp: { a: 0.004, d: 0.22, s: 0, r: 0.1 }, lfo: [], flt: { f: 2600, q: 0.8, env: 1.4, d: 0.12 },
  noise: { lvl: 0.12, bp: 2400, d: 0.02 },
});
P('str.octave', '弦樂', '八度弦樂', 'Octave Strings', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 10 }, { w: 'saw', lvl: 0.16, oct: 1, uni: 2, spread: 8 }],
});
P('str.pad', '弦樂', '弦樂鋪底', 'String Pad', 49, 'str', {
  amp: { a: 0.6, d: 1.0, s: 0.9, r: 1.6 }, flt: { f: 1400, q: 0.6, env: 1.2, a: 0.8, s: 0.6 }, gain: 0.44,
  osc: [{ w: 'saw', lvl: 0.28, uni: 4, spread: 16, wide: 0.8 }],
});
P('str.chamber', '弦樂', '室內弦樂', 'Chamber Strings', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 6 }], flt: { f: 3200, q: 0.5, env: 0.6 }, amp: { a: 0.14, r: 0.34 },
});
P('str.sul', '弦樂', '泛音弦樂', 'Sul Ponticello', 44, 'str', {
  flt: { f: 5200, q: 1.6, env: 1.0 }, osc: [{ w: 'saw', lvl: 0.26, uni: 2, spread: 8 }],
  amp: { a: 0.18, r: 0.5 }, noise: { lvl: 0.12, bp: 5200, q: 2, d: 0.15, s: 0.1 },
});
P('str.epic', '弦樂', '史詩弦樂', 'Epic Strings', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 4, spread: 12, wide: 0.6 }, { w: 'saw', lvl: 0.12, oct: -1, uni: 2, spread: 8 }],
  flt: { f: 2200, q: 0.7, env: 1.0 }, amp: { a: 0.25, s: 0.9, r: 0.7 }, gain: 0.46,
});
P('str.trem2', '弦樂', '顫弓', 'Bowed Tremolo', 44, 'str', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 3, spread: 9 }], lfo: [{ to: 'amp', rate: 6, depth: 0.6 }, { to: 'cutoff', rate: 3, depth: 0.5 }],
  noise: { lvl: 0.1, bp: 2600, q: 2, d: 0.2, s: 0.15 },
});
P('str.choir', '弦樂', '弦樂合唱', 'String Choir', 48, 'str', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 14 }], frm: { v: 'a', v2: 'o', morph: 0.4, q: 6, lvl: 0.4 },
  amp: { a: 0.3, r: 0.6 }, flt: { f: 2600 },
});
P('str.mute', '弦樂', '弱音弦樂', 'Muted Strings', 44, 'str', {
  flt: { f: 1500, q: 0.6, env: 0.6 }, osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 8 }],
  amp: { a: 0.16, r: 0.4 }, noise: { lvl: 0.1, bp: 1600, q: 1.5, d: 0.1, s: 0.1 },
});

// ────────────────────────── 管樂／簧片／銅管 ──────────────────────────
P('wnd.flute', '管樂', '長笛', 'Flute', 73, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.42 }, { w: 'tri', lvl: 0.12 }], noise: { lvl: 0.2, bp: 3200, q: 1.4, a: 0.02, d: 0.1, s: 0.25, r: 0.1 },
  flt: { f: 3600, env: 0.6 }, amp: { a: 0.05, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.4, depth: 0.08, delay: 0.25 }],
});
P('wnd.picc', '管樂', '短笛', 'Piccolo', 72, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.4 }, { w: 'tri', lvl: 0.16, oct: 1 }], noise: { lvl: 0.18, bp: 5000, q: 1.6, d: 0.08, s: 0.2 },
  flt: { f: 6500 }, amp: { a: 0.04, r: 0.1 }, lfo: [{ to: 'pitch', rate: 5.8, depth: 0.07, delay: 0.2 }],
});
P('wnd.recorder', '管樂', '直笛', 'Recorder', 74, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.44 }, { w: 'sqr', lvl: 0.08 }], noise: { lvl: 0.22, bp: 2600, q: 1.2, a: 0.02, d: 0.09, s: 0.2 },
  flt: { f: 3000 }, amp: { a: 0.03, r: 0.1 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.06, delay: 0.2 }],
});
P('wnd.pan', '管樂', '排笛', 'Pan Flute', 75, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.4 }, { w: 'tri', lvl: 0.14, cents: 4 }], noise: { lvl: 0.26, bp: 1800, q: 1.0, a: 0.04, d: 0.15, s: 0.3 },
  flt: { f: 2400 }, amp: { a: 0.08, r: 0.16 }, lfo: [{ to: 'pitch', rate: 4.6, depth: 0.1, delay: 0.3 }],
});
P('wnd.ocarina', '管樂', '陶笛', 'Ocarina', 79, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.46 }, { w: 'tri', lvl: 0.1 }], noise: { lvl: 0.14, bp: 2200, q: 1.4, d: 0.1, s: 0.15 },
  flt: { f: 2800 }, amp: { a: 0.05, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.2, depth: 0.07, delay: 0.25 }],
});
P('wnd.clarinet', '管樂', '單簧管', 'Clarinet', 71, 'wnd', {
  osc: [{ w: 'sqr', lvl: 0.34 }], flt: { f: 2200, q: 1.0, env: 1.2 }, frm: { v: 'u', q: 7, lvl: 0.3 },
  noise: { lvl: 0.12, bp: 2400, q: 2, d: 0.05, s: 0.1 }, amp: { a: 0.04, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.07, delay: 0.3 }],
});
P('wnd.clarbass', '管樂', '低音單簧管', 'Bass Clarinet', 71, 'wnd', {
  osc: [{ w: 'sqr', lvl: 0.34 }], flt: { f: 1200, q: 1.0, env: 1.0 }, frm: { v: 'u', q: 6, lvl: 0.35 },
  amp: { a: 0.06, r: 0.16 }, noise: { lvl: 0.1, bp: 1400, q: 1.8, d: 0.05, s: 0.1 },
});
P('wnd.oboe', '管樂', '雙簧管', 'Oboe', 68, 'wnd', {
  osc: [{ w: 'harm', harm: [1, 0.1, 0.7, 0.05, 0.45, 0.03, 0.3], lvl: 0.4 }], frm: { v: 'i', q: 9, lvl: 0.35 },
  noise: { lvl: 0.1, bp: 3600, q: 2.2, d: 0.04, s: 0.08 }, flt: { f: 3400, env: 0.8 }, amp: { a: 0.03, r: 0.12 },
});
P('wnd.bassoon', '管樂', '低音管', 'Bassoon', 70, 'wnd', {
  osc: [{ w: 'harm', harm: [1, 0.6, 0.2, 0.35, 0.1, 0.2], lvl: 0.4 }], frm: { v: 'o', q: 6, lvl: 0.3 },
  flt: { f: 1600, env: 1.0 }, noise: { lvl: 0.1, bp: 1200, q: 1.8, d: 0.05, s: 0.1 }, amp: { a: 0.04, r: 0.14 },
});
P('wnd.saxalto', '管樂', '中音薩克斯風', 'Alto Sax', 65, 'wnd', {
  osc: [{ w: 'pls', pw: 0.35, lvl: 0.36 }], frm: { v: 'e', q: 7, lvl: 0.38 },
  flt: { f: 2600, q: 0.9, env: 1.4 }, noise: { lvl: 0.16, bp: 2800, q: 1.6, a: 0.01, d: 0.08, s: 0.2 },
  amp: { a: 0.035, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.4, depth: 0.1, delay: 0.3 }],
});
P('wnd.saxtenor', '管樂', '次中音薩克斯風', 'Tenor Sax', 66, 'wnd', {
  osc: [{ w: 'pls', pw: 0.3, lvl: 0.36 }], frm: { v: 'o', q: 6, lvl: 0.38 },
  flt: { f: 1900, q: 0.9, env: 1.4 }, noise: { lvl: 0.18, bp: 2000, q: 1.5, a: 0.01, d: 0.08, s: 0.2 },
  amp: { a: 0.045, r: 0.14 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.1, delay: 0.3 }],
});
P('wnd.saxbari', '管樂', '上低音薩克斯風', 'Baritone Sax', 67, 'wnd', {
  osc: [{ w: 'pls', pw: 0.28, lvl: 0.38 }], frm: { v: 'o', q: 5, lvl: 0.4 },
  flt: { f: 1200, q: 0.9, env: 1.2 }, noise: { lvl: 0.18, bp: 1400, q: 1.4, d: 0.08, s: 0.2 },
  amp: { a: 0.05, r: 0.16 }, lfo: [{ to: 'pitch', rate: 4.6, depth: 0.09, delay: 0.3 }],
});
P('wnd.trumpet', '管樂', '小號', 'Trumpet', 56, 'brs', {
  osc: [{ w: 'saw', lvl: 0.34, uni: 2, spread: 4 }], flt: { f: 1400, q: 1.1, env: 2.6, a: 0.02, d: 0.2, s: 0.4 },
  penv: { amt: 20, d: 0.05 }, amp: { a: 0.03, r: 0.12 }, lfo: [{ to: 'pitch', rate: 5.6, depth: 0.08, delay: 0.3 }],
});
P('wnd.trombone', '管樂', '長號', 'Trombone', 57, 'brs', {
  osc: [{ w: 'saw', lvl: 0.34, uni: 2, spread: 5 }], flt: { f: 1100, q: 1.0, env: 2.4, d: 0.25, s: 0.5 },
  amp: { a: 0.04, r: 0.14 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.09, delay: 0.35 }],
});
P('wnd.horn', '管樂', '法國號', 'French Horn', 60, 'brs', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 7 }], flt: { f: 900, q: 0.8, env: 1.8, a: 0.06, d: 0.3, s: 0.55 },
  amp: { a: 0.09, r: 0.2 }, drive: 0.06, lfo: [{ to: 'pitch', rate: 4.8, depth: 0.07, delay: 0.4 }],
});
P('wnd.tuba', '管樂', '低音號', 'Tuba', 58, 'brs', {
  osc: [{ w: 'saw', lvl: 0.34 }], flt: { f: 600, q: 0.9, env: 1.8, d: 0.3, s: 0.5 },
  amp: { a: 0.05, r: 0.16 }, drive: 0.1, lfo: [],
});
P('wnd.brass', '管樂', '銅管合奏', 'Brass Section', 61, 'brs', {
  osc: [{ w: 'saw', lvl: 0.28, uni: 3, spread: 8 }, { w: 'saw', lvl: 0.14, oct: 1, uni: 2, spread: 6 }],
  flt: { f: 1500, q: 0.9, env: 2.6, d: 0.3, s: 0.5 }, drive: 0.2, amp: { a: 0.05, r: 0.16 }, gain: 0.5,
});
P('wnd.brasssoft', '管樂', '柔和銅管', 'Soft Brass', 62, 'brs', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 8 }], flt: { f: 1000, q: 0.6, env: 1.4, a: 0.1, s: 0.6 },
  amp: { a: 0.12, r: 0.25 }, drive: 0.05,
});
P('wnd.mute', '管樂', '弱音小號', 'Muted Trumpet', 59, 'brs', {
  osc: [{ w: 'saw', lvl: 0.3 }], frm: { v: 'e', q: 10, lvl: 0.45 }, flt: { f: 2200, q: 1.6, env: 1.6 },
  amp: { a: 0.02, r: 0.1 }, penv: { amt: 30, d: 0.04 },
});
P('wnd.whistle', '管樂', '口哨', 'Whistle', 78, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.5 }], noise: { lvl: 0.18, bp: 2400, q: 3, a: 0.03, d: 0.08, s: 0.2 },
  flt: { f: 4200 }, amp: { a: 0.06, r: 0.12 }, lfo: [{ to: 'pitch', rate: 6.0, depth: 0.14, delay: 0.3 }],
});
P('wnd.bagpipe', '管樂', '風笛', 'Bagpipe', 109, 'wnd', {
  osc: [{ w: 'sqr', lvl: 0.28 }, { w: 'sqr', lvl: 0.2, oct: -1 }, { w: 'sqr', lvl: 0.14, cents: 8 }],
  flt: { f: 2600, q: 1.2, env: 0.6 }, amp: { a: 0.05, d: 0.1, s: 1, r: 0.14 }, noise: { lvl: 0.16, bp: 1800, q: 1.2, d: 0.06, s: 0.2 },
  lfo: [],
});
P('wnd.didgeridoo', '管樂', '迪吉里杜管', 'Didgeridoo', 116, 'wnd', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 6 }], frm: { v: 'u', q: 5, lvl: 0.5 },
  flt: { f: 700, q: 1.6, env: 0.8 }, lfo: [{ to: 'cutoff', rate: 3.2, depth: 0.9 }],
  noise: { lvl: 0.2, bp: 700, q: 1.0, a: 0.02, d: 0.2, s: 0.3 }, amp: { a: 0.08, r: 0.25 }, drive: 0.14,
});
P('wnd.shaku', '管樂', '尺八', 'Shakuhachi', 77, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.4 }, { w: 'tri', lvl: 0.1 }], noise: { lvl: 0.3, bp: 2600, q: 1.2, a: 0.03, d: 0.12, s: 0.35 },
  flt: { f: 2400, env: 0.8 }, amp: { a: 0.06, r: 0.2 }, lfo: [{ to: 'pitch', rate: 4.4, depth: 0.12, delay: 0.35 }],
});
P('wnd.harmonica', '管樂', '口琴', 'Harmonica', 22, 'wnd', {
  osc: [{ w: 'pls', pw: 0.4, lvl: 0.34 }], frm: { v: 'i', q: 8, lvl: 0.35 },
  flt: { f: 3000, env: 1.0 }, noise: { lvl: 0.12, bp: 2600, q: 1.6, d: 0.05, s: 0.12 },
  amp: { a: 0.03, r: 0.1 }, lfo: [{ to: 'pitch', rate: 5.6, depth: 0.08, delay: 0.25 }],
});

// ────────────────────────── 民族樂器 ──────────────────────────
P('eth.erhu', '民族', '二胡', 'Erhu', 110, 'eth', {
  osc: [{ w: 'saw', lvl: 0.3 }], frm: { v: 'o', q: 8, lvl: 0.4 }, flt: { f: 2200, q: 0.9, env: 1.2 },
  noise: { lvl: 0.14, bp: 2800, q: 2, d: 0.06, s: 0.1 }, amp: { a: 0.07, r: 0.25 },
  lfo: [{ to: 'pitch', rate: 5.8, depth: 0.2, delay: 0.3 }],
});
P('eth.gaohu', '民族', '高胡', 'Gaohu', 110, 'eth', {
  osc: [{ w: 'saw', lvl: 0.3 }], frm: { v: 'e', q: 9, lvl: 0.4 }, flt: { f: 3200, q: 0.9, env: 1.2 },
  amp: { a: 0.05, r: 0.2 }, lfo: [{ to: 'pitch', rate: 6.2, depth: 0.18, delay: 0.25 }],
});
P('eth.pipa', '民族', '琵琶', 'Pipa', 107, 'eth', {
  str: { lvl: 0.58, bright: 0.85, decay: 1.3 }, flt: { f: 3800, q: 1.0, env: 1.6, d: 0.2 },
  amp: { a: 0.001, d: 1.2, s: 0, r: 0.3 }, noise: { lvl: 0.14, bp: 2800, d: 0.01 }, osc: [],
});
P('eth.guzheng', '民族', '古箏', 'Guzheng', 107, 'eth', {
  str: { lvl: 0.6, bright: 0.78, decay: 2.4 }, flt: { f: 3200, q: 0.8, env: 1.2 },
  amp: { a: 0.002, d: 2.0, s: 0, r: 0.5 }, noise: { lvl: 0.12, bp: 2400, d: 0.012 }, osc: [],
});
P('eth.dizi', '民族', '笛子', 'Dizi', 72, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.42 }, { w: 'tri', lvl: 0.1 }], noise: { lvl: 0.28, bp: 3600, q: 1.4, a: 0.01, d: 0.1, s: 0.25 },
  flt: { f: 4200 }, amp: { a: 0.03, r: 0.1 }, lfo: [{ to: 'pitch', rate: 6.0, depth: 0.1, delay: 0.2 }],
});
P('eth.suona', '民族', '嗩吶', 'Suona', 111, 'wnd', {
  osc: [{ w: 'saw', lvl: 0.32 }, { w: 'pls', pw: 0.3, lvl: 0.2 }], frm: { v: 'e', q: 8, lvl: 0.4 },
  flt: { f: 3000, q: 1.4, env: 2.0 }, drive: 0.25, noise: { lvl: 0.12, bp: 3200, d: 0.04, s: 0.1 },
  amp: { a: 0.02, r: 0.12 }, lfo: [{ to: 'pitch', rate: 6.4, depth: 0.12, delay: 0.2 }],
});
P('eth.sheng', '民族', '笙', 'Sheng', 109, 'wnd', {
  osc: [{ w: 'harm', harm: [1, 0.5, 0.4, 0.2, 0.3, 0.1], lvl: 0.4 }, { w: 'pls', pw: 0.5, lvl: 0.12, cents: 6 }],
  frm: { v: 'o', q: 6, lvl: 0.3 }, noise: { lvl: 0.16, bp: 1800, q: 1.4, d: 0.06, s: 0.2 },
  amp: { a: 0.04, r: 0.14 }, lfo: [],
});
P('eth.yangqin', '民族', '揚琴', 'Yangqin', 15, 'eth', {
  str: { lvl: 0.6, bright: 0.9, decay: 1.8 }, flt: { f: 4600, env: 1.2 },
  amp: { a: 0.001, d: 1.4, s: 0, r: 0.4 }, noise: { lvl: 0.14, bp: 3200, d: 0.01 }, osc: [],
});
P('eth.koto', '民族', '日本箏', 'Koto', 107, 'eth', {
  str: { lvl: 0.58, bright: 0.72, decay: 2.2 }, flt: { f: 2800, q: 0.9, env: 1.0 },
  amp: { a: 0.001, d: 2.0, s: 0, r: 0.45 }, noise: { lvl: 0.1, bp: 2000, d: 0.01 }, osc: [],
});
P('eth.shamisen', '民族', '三味線', 'Shamisen', 107, 'eth', {
  str: { lvl: 0.6, bright: 0.92, decay: 1.1 }, flt: { f: 4200, q: 1.4, env: 1.4 },
  amp: { a: 0.001, d: 1.0, s: 0, r: 0.25 }, noise: { lvl: 0.16, bp: 3600, d: 0.012 }, osc: [],
});
P('eth.sitar', '民族', '西塔琴', 'Sitar', 104, 'eth', {
  str: { lvl: 0.55, bright: 0.95, decay: 2.6 }, flt: { f: 5200, q: 2.0, env: 1.2 },
  osc: [{ w: 'saw', lvl: 0.1, cents: 12, decay: 0.8 }], amp: { a: 0.002, d: 2.2, s: 0, r: 0.6 },
  noise: { lvl: 0.1, bp: 4200, d: 0.01 },
});
P('eth.sarod', '民族', '薩羅德', 'Sarod', 104, 'eth', {
  str: { lvl: 0.5, bright: 0.8, decay: 2.4 }, osc: [{ w: 'saw', lvl: 0.16 }], frm: { v: 'o', q: 7, lvl: 0.3 },
  flt: { f: 3400, q: 1.2, env: 1.0 }, amp: { a: 0.004, d: 1.8, s: 0.15, r: 0.5 },
});
P('eth.tanpura', '民族', '坦布拉', 'Tanpura', 104, 'eth', {
  str: { lvl: 0.6, bright: 0.6, decay: 4.0 }, flt: { f: 2200, q: 0.8 }, amp: { a: 0.005, d: 3.4, s: 0.2, r: 1.2 },
  osc: [],
});
P('eth.oud', '民族', '烏德琴', 'Oud', 105, 'eth', {
  str: { lvl: 0.55, bright: 0.5, decay: 1.8 }, flt: { f: 2400, q: 0.8, env: 1.0 },
  amp: { a: 0.002, d: 1.6, s: 0, r: 0.4 }, noise: { lvl: 0.12, bp: 1600, d: 0.012 }, osc: [],
});
P('eth.bouzouki', '民族', '布祖基琴', 'Bouzouki', 105, 'eth', {
  str: { lvl: 0.58, bright: 0.9, decay: 1.6 }, osc: [{ w: 'saw', lvl: 0.1, cents: 10, decay: 1.0 }],
  flt: { f: 4200, q: 1.2 }, amp: { a: 0.001, d: 1.4, s: 0, r: 0.35 },
});
P('eth.balalaika', '民族', '巴拉萊卡', 'Balalaika', 105, 'eth', {
  str: { lvl: 0.6, bright: 0.95, decay: 1.2 }, flt: { f: 5200, q: 1.0 },
  amp: { a: 0.001, d: 1.0, s: 0, r: 0.3 }, osc: [],
});
P('eth.mbira', '民族', '拇指琴', 'Mbira', 108, 'eth', {
  osc: [{ w: 'sin', lvl: 0.44 }, { w: 'sin', lvl: 0.18, oct: 2, cents: 22, decay: 0.5 }],
  flt: { f: 4600, env: 1.0, d: 0.2 }, amp: { a: 0.001, d: 1.2, s: 0, r: 0.4 },
  noise: { lvl: 0.18, bp: 3000, d: 0.012 }, kdecay: 1,
});
P('eth.gamelan', '民族', '甘美朗', 'Gamelan', 112, 'eth', {
  osc: [{ w: 'sin', lvl: 0.34, cents: -22, fm: { ratio: 1.0, idx: 0.9, d: 1.2 } },
    { w: 'sin', lvl: 0.3, cents: 24, fm: { ratio: 2.7, idx: 1.2, d: 1.6 } }],
  flt: { f: 3600, q: 0.7 }, amp: { a: 0.003, d: 2.6, s: 0.05, r: 1.2 },
  noise: { lvl: 0.12, bp: 1800, d: 0.01 }, lfo: [{ to: 'amp', rate: 3.0, depth: 0.15 }], kdecay: 0.6,
});
P('eth.gayageum', '民族', '伽倻琴', 'Gayageum', 107, 'eth', {
  str: { lvl: 0.58, bright: 0.55, decay: 3.6 }, flt: { f: 1700, q: 1.1, env: 0.8 },
  amp: { a: 0.004, d: 3.2, s: 0.1, r: 1.0 }, noise: { lvl: 0.1, bp: 1300, d: 0.012 },
  lfo: [{ to: 'pitch', rate: 5.4, depth: 0.16, delay: 0.35 }], osc: [],
});
P('eth.ney', '民族', '奈伊笛', 'Ney', 75, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.4 }, { w: 'tri', lvl: 0.1 }], noise: { lvl: 0.3, bp: 2200, q: 1.2, a: 0.04, d: 0.12, s: 0.3 },
  flt: { f: 2200, env: 0.8 }, amp: { a: 0.07, r: 0.2 }, lfo: [{ to: 'pitch', rate: 4.4, depth: 0.12, delay: 0.35 }],
});
P('eth.kaval', '民族', '卡瓦爾笛', 'Kaval', 76, 'wnd', {
  osc: [{ w: 'sin', lvl: 0.42 }, { w: 'sqr', lvl: 0.06 }], noise: { lvl: 0.24, bp: 2600, q: 1.4, a: 0.03, d: 0.1, s: 0.28 },
  flt: { f: 2600 }, amp: { a: 0.06, r: 0.18 }, lfo: [{ to: 'pitch', rate: 5.0, depth: 0.1, delay: 0.3 }],
});
P('eth.bandoneon', '民族', '班多鈕手風琴', 'Bandoneon', 24, 'eth', {
  osc: [{ w: 'pls', pw: 0.28, lvl: 0.34, uni: 2, spread: 7 }], frm: { v: 'o', q: 7, lvl: 0.3 },
  flt: { f: 2600, q: 0.9, env: 0.8 }, amp: { a: 0.02, d: 0.3, s: 0.9, r: 0.16 }, drive: 0.1,
});
P('eth.charango', '民族', '恰朗哥吉他', 'Charango', 105, 'eth', {
  str: { lvl: 0.6, bright: 0.98, decay: 0.6 }, flt: { f: 6200, q: 1.6 },
  amp: { a: 0.001, d: 0.55, s: 0, r: 0.15 }, noise: { lvl: 0.18, bp: 4200, d: 0.008 }, osc: [],
});
P('eth.steeldrum', '民族', '加勒比鋼鼓', 'Caribbean Steel Pan', 114, 'eth', {
  osc: [{ w: 'sin', lvl: 0.36, fm: { ratio: 1.0, idx: 1.4, d: 0.5 } }, { w: 'sin', lvl: 0.2, fm: { ratio: 2.0, idx: 2.4, d: 0.3 } }],
  flt: { f: 6200, env: 1.4, d: 0.18 }, amp: { a: 0.001, d: 1.2, r: 0.5 }, noise: { lvl: 0.12, bp: 3400, d: 0.015 },
});

// ────────────────────────── 合唱／人聲 ──────────────────────────
P('cho.aah', '人聲', '人聲 Aah', 'Choir Aah', 52, 'cho', {});
P('cho.ooh', '人聲', '人聲 Ooh', 'Choir Ooh', 53, 'cho', {
  frm: { v: 'o', v2: 'u', morph: 0.4, q: 8, lvl: 0.6 }, flt: { f: 1800 }, amp: { a: 0.2, r: 0.55 },
});
P('cho.choir', '人聲', '合唱團', 'Full Choir', 52, 'cho', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 4, spread: 16, wide: 0.8 }], frm: { v: 'a', v2: 'e', morph: 0.35, q: 6, lvl: 0.5 },
  amp: { a: 0.22, r: 0.6 }, gain: 0.46,
});
P('cho.doo', '人聲', '人聲 Doo', 'Voice Doo', 53, 'cho', {
  frm: { v: 'o', q: 7, lvl: 0.55 }, amp: { a: 0.03, d: 0.4, s: 0.7, r: 0.3 }, flt: { f: 2200 },
});
P('cho.whisper', '人聲', '氣聲', 'Breathy Voice', 54, 'cho', {
  noise: { lvl: 0.5, bp: 2600, q: 1.2, a: 0.1, d: 0.4, s: 0.8, r: 0.4 }, lfo: [], osc: [{ w: 'saw', lvl: 0.14, uni: 2, spread: 14 }],
  frm: { v: 'a', q: 6, lvl: 0.4 }, amp: { a: 0.2, r: 0.5 },
});
P('cho.vocal', '人聲', '合成人聲', 'Synth Vox', 85, 'cho', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 3, spread: 12 }], frm: { v: 'e', v2: 'a', morph: 0.4, q: 9, lvl: 0.55 },
  lfo: [{ to: 'pitch', rate: 5.5, depth: 0.12, delay: 0.2 }], amp: { a: 0.12, r: 0.4 },
});
P('cho.boys', '人聲', '童聲合唱', 'Boys Choir', 52, 'cho', {
  osc: [{ w: 'saw', lvl: 0.26, uni: 3, spread: 10 }], frm: { v: 'i', v2: 'e', morph: 0.3, q: 8, lvl: 0.5 },
  flt: { f: 3200 }, amp: { a: 0.16, r: 0.45 },
});
P('cho.mm', '人聲', '哼唱', 'Humming', 53, 'cho', {
  frm: { v: 'u', q: 9, lvl: 0.65 }, flt: { f: 1200 }, amp: { a: 0.18, r: 0.5 }, gain: 0.55,
});
P('cho.vowel', '人聲', '母音合成', 'Vowel Synth', 85, 'cho', {
  osc: [{ w: 'saw', lvl: 0.3, uni: 2, spread: 8 }], frm: { v: 'a', v2: 'o', morph: 0.5, q: 12, lvl: 0.7 },
  lfo: [{ to: 'cutoff', rate: 2.4, depth: 0.4 }], amp: { a: 0.1, r: 0.35 },
});
P('cho.pad', '人聲', '人聲鋪底', 'Vox Pad', 54, 'cho', {
  osc: [{ w: 'saw', lvl: 0.24, uni: 4, spread: 18, wide: 0.8 }], frm: { v: 'a', v2: 'u', morph: 0.3, q: 6, lvl: 0.45 },
  amp: { a: 0.7, d: 1.2, s: 0.9, r: 1.6 }, flt: { f: 2000 }, gain: 0.42,
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

