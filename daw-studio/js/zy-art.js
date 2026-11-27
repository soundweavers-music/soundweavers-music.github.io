// 織音合成器 — 音色示意圖
//
// zyArt(id) 回傳一段 SVG 字串（viewBox 0 0 160 100，不帶寬高，由 CSS 決定大小）。
// 純字串產生，不碰 DOM、不用外部檔、不用 style 屬性（站台 CSP 會擋 inline style），
// 全部用 fill／stroke 等呈現屬性。底色是深色卡片（#1b1c20），所以外形用亮一點的實色，
// 輪廓用深色描邊。
//
// 結構：基本圖元 → 小圖示（錄音帶、閃電、星光…）→ 各家族畫法（撥弦、擦弦、箏、管、銅管、
// 鍵盤、敲擊條、鐘、合成器、Pad、音效、人聲、鼓）→ 最後一張「音色 id → 畫法＋參數」對照表。
// 同一件真實樂器的不同音色共用一張底圖，再加一個小標記區分（徽章、塗裝、錄音帶…）。

// ── 調色盤 ───────────────────────────────────────────────
const C = {
  ol: '#0d0d10',        // 輪廓
  spruce: '#e6bd78',    // 雲杉面板
  spruceD: '#c99a52',
  maple: '#c27a38',     // 楓木側板
  mapleD: '#8e4f1e',
  burst: '#5a2a12',     // 漸層外圈（日落色）
  rose: '#4a2616',      // 玫瑰木指板
  ebony: '#1f1a18',
  ivory: '#f3ecda',
  key: '#f6f3ea',
  black: '#18181a',
  piano: '#232326',
  brass: '#e0b040',
  brassL: '#f2d27a',
  brassD: '#a67b1c',
  silver: '#cfd4dc',
  silverL: '#eef1f5',
  silverD: '#8b939f',
  bamboo: '#dcc47e',
  bambooD: '#a88f45',
  skin: '#efe4c8',      // 鼓皮／羊皮
  snake: '#5f6040',     // 蟒皮
  snakeL: '#8a8a5e',
  red: '#c0392b',
  redD: '#8a2219',
  gold: '#e8c14a',
  string: '#f1ead6',
  wood: '#9a5b2c',
  woodL: '#c98a4e',
  woodD: '#5e3518',
  kiri: '#c8925a',      // 桐木
  bronze: '#b8833a',
  bronzeD: '#7c5524',
  copper: '#c8743e',
  steel: '#b9c2cc',
  plastic: '#2c2e33',
  panel: '#3a3d44',
  led: '#ff5a3c',
  screen: '#9fe0b8',
  tolex: '#26262a',
  hand: '#e8b894',
};

// ── 基本圖元 ─────────────────────────────────────────────
const f1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
function at(a) {
  let s = '';
  for (const k in a) {
    const v = a[k];
    if (v === null || v === undefined || v === false) continue;
    s += ` ${k}="${f1(v)}"`;
  }
  return s;
}
const el = (tag, a) => `<${tag}${at(a)}/>`;
const OL = (w = 1.5, c = C.ol) => ({ stroke: c, 'stroke-width': w, 'stroke-linejoin': 'round' });
const R = (x, y, w, h, fill, o) => el('rect', { x, y, width: w, height: h, fill, ...o });
const RR = (x, y, w, h, r, fill, o) => el('rect', { x, y, width: w, height: h, rx: r, fill, ...o });
const E = (cx, cy, rx, ry, fill, o) => el('ellipse', { cx, cy, rx, ry, fill, ...o });
const Ci = (cx, cy, r, fill, o) => el('circle', { cx, cy, r, fill, ...o });
const Pa = (d, fill, o) => el('path', { d, fill, ...o });
const Po = (pts, fill, o) => el('polygon', { points: pts, fill, ...o });
const PL = (pts, stroke, w = 1.5, o) => el('polyline', { points: pts, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...o });
const L = (x1, y1, x2, y2, stroke, w = 1.5, o) => el('line', { x1, y1, x2, y2, stroke, 'stroke-width': w, 'stroke-linecap': 'round', ...o });
const SP = (d, stroke, w = 1.5, o) => el('path', { d, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...o });
const G = (tr, s) => `<g transform="${tr}">${s}</g>`;
const GO = (op, s) => `<g opacity="${op}">${s}</g>`;
const T = (x, y, s, fill, size = 9, o) =>
  `<text${at({ x, y, fill, 'font-family': 'sans-serif', 'font-size': size, 'font-weight': 700, 'text-anchor': 'middle', ...o })}>${s}</text>`;

// 多個形狀合成一個外形：先全部畫粗描邊，再全部填色，接縫就不會露出內線
function blob(shapes, fill, w = 1.6, edge = C.ol) {
  let s = '';
  for (const f of shapes) s += f({ fill: edge, stroke: edge, 'stroke-width': w * 2, 'stroke-linejoin': 'round' });
  for (const f of shapes) s += f({ fill });
  return s;
}
const range = n => Array.from({ length: n }, (_, i) => i);
const lerp = (a, b, t) => a + (b - a) * t;

// 鍵盤：從 C 開始的白鍵，按八度排黑鍵
function keys(x, y, w, h, n, o = {}) {
  const wc = o.white || C.key, bc = o.black || C.black, kw = w / n;
  let s = R(x, y, w, h, wc, OL(1.2));
  for (let i = 1; i < n; i++) s += L(x + i * kw, y, x + i * kw, y + h, C.ol, 0.6);
  for (let i = 0; i < n - 1; i++) {
    const p = (i + (o.start || 0)) % 7;
    if (p === 2 || p === 6) continue;
    s += R(x + (i + 1) * kw - kw * 0.32, y, kw * 0.64, h * (o.bh || 0.6), bc);
  }
  return s;
}

// ── 小圖示（變化標記）────────────────────────────────────
// 右上角徽章
function badge(txt, bg = C.gold, fg = C.ol, x = 140, y = 11) {
  const w = Math.max(16, txt.length * 6.2 + 6);
  return RR(x - w / 2, y - 7, w, 14, 3, bg, OL(1)) + T(x, y + 3.3, txt, fg, 9);
}
function cassette(x, y, s = 1) {
  return G(`translate(${x} ${y}) scale(${s})`,
    RR(-16, -10, 32, 20, 2, '#3b3f46', OL(1.2)) + R(-12, -7, 24, 6, '#e9d27a') +
    RR(-10, 0, 20, 7, 3, '#15161a') + Ci(-5.5, 3.5, 2.4, C.silverL) + Ci(5.5, 3.5, 2.4, C.silverL));
}
function bolt(x, y, s = 1, c = '#ffd23a') {
  return G(`translate(${x} ${y}) scale(${s})`, Po('2,-11 -6,2 -1,2 -3,11 6,-2 1,-2 3,-11', c, OL(1)));
}
function sparkle(x, y, r, c = '#fff6c8') {
  const q = r * 0.22;
  return Pa(`M${x} ${y - r}Q${x + q} ${y - q} ${x + r} ${y}Q${x + q} ${y + q} ${x} ${y + r}Q${x - q} ${y + q} ${x - r} ${y}Q${x - q} ${y - q} ${x} ${y - r}Z`, c);
}
function note(x, y, s = 1, c = C.ivory) {
  return G(`translate(${x} ${y}) scale(${s})`,
    E(0, 0, 4, 3, c, { transform: 'rotate(-20)' }) + L(3.6, -1, 3.6, -15, c, 1.6) + SP('M3.6 -15 q5 3 5 8', c, 1.6));
}
function bellIcon(x, y, s = 1, c = C.brass) {
  return G(`translate(${x} ${y}) scale(${s})`,
    Pa('M-9 6 C-8 -2 -7 -9 0 -10 C7 -9 8 -2 9 6 L11 8 L-11 8 Z', c, OL(1.2)) + Ci(0, 10, 2.4, c, OL(1)) + L(0, -10, 0, -13, C.ol, 1.6));
}
function lips(x, y, s = 1, open = 'a') {
  // open：'a' 大開、'o' 圓、'm' 閉口、'w' 吹氣小孔
  let inner = '';
  if (open === 'a') inner = E(0, 1, 9, 6, '#3a0f12') + R(-6, -4, 12, 2.4, C.ivory);
  if (open === 'o') inner = E(0, 0, 4.5, 5, '#3a0f12');
  if (open === 'w') inner = E(0, 0, 2.2, 1.8, '#3a0f12');
  const outer = open === 'm'
    ? Pa('M-13 0 C-8 -6 -3 -5 0 -3 C3 -5 8 -6 13 0 C8 7 -8 7 -13 0 Z', '#d8505a', OL(1.2)) + SP('M-12 0 C-6 2 6 2 12 0', '#7a1f28', 1.4)
    : open === 'a'
      ? E(0, 1, 13, 10, '#d8505a', OL(1.2))
      : E(0, 0, open === 'w' ? 7 : 9, open === 'w' ? 6 : 9, '#d8505a', OL(1.2));
  return G(`translate(${x} ${y}) scale(${s})`, outer + inner);
}
function moon(x, y, r, c = '#e9e4ff') {
  return Pa(`M${x} ${y - r}A${r} ${r} 0 1 0 ${x + r} ${y + r * 0.2}A${r * 0.8} ${r * 0.8} 0 1 1 ${x} ${y - r}Z`, c);
}
function snowflake(x, y, r, c = '#d8f3ff', w = 2) {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, cx = Math.cos(a), sy = Math.sin(a);
    s += L(x, y, x + cx * r, y + sy * r, c, w);
    const bx = x + cx * r * 0.6, by = y + sy * r * 0.6;
    for (const d of [-0.7, 0.7]) {
      const b = a + d;
      s += L(bx, by, bx + Math.cos(b) * r * 0.32, by + Math.sin(b) * r * 0.32, c, w * 0.8);
    }
  }
  return s;
}
// 波形小圖：kind = saw/sqr/pulse/sin/tri/super/detune/sync/fm/noise/pluck
function wave(kind, x, y, w, h, c = C.screen, sw = 2) {
  const p = [], n = 3, cw = w / n, top = y - h / 2, bot = y + h / 2;
  if (kind === 'saw' || kind === 'super' || kind === 'detune') {
    const draw = (dx, dy) => {
      const q = [];
      for (let i = 0; i < n; i++) q.push(`${x + i * cw + dx},${bot + dy}`, `${x + (i + 1) * cw + dx},${top + dy}`, `${x + (i + 1) * cw + dx},${bot + dy}`);
      return PL(q.join(' '), c, sw);
    };
    if (kind === 'saw') return draw(0, 0);
    if (kind === 'detune') return draw(0, 0) + GO(0.6, draw(cw * 0.25, 0));
    return GO(0.45, draw(-cw * 0.3, -2)) + GO(0.7, draw(cw * 0.15, 1.5)) + draw(0, 0);
  }
  if (kind === 'sqr' || kind === 'pulse') {
    const duty = kind === 'sqr' ? 0.5 : 0.22;
    p.push(`${x},${bot}`);
    for (let i = 0; i < n; i++) {
      const a = x + i * cw, b = a + cw * duty;
      p.push(`${a},${bot}`, `${a},${top}`, `${b},${top}`, `${b},${bot}`, `${a + cw},${bot}`);
    }
    return PL(p.join(' '), c, sw);
  }
  if (kind === 'tri') {
    for (let i = 0; i <= n * 2; i++) p.push(`${x + i * cw / 2},${i % 2 ? top : bot}`);
    return PL(p.join(' '), c, sw);
  }
  if (kind === 'sync') {
    for (let i = 0; i < n; i++) {
      const a = x + i * cw;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        p.push(`${a + t * cw},${y - Math.sin(t * Math.PI * 3.3) * h / 2}`);
      }
    }
    return PL(p.join(' '), c, sw);
  }
  if (kind === 'noise') {
    for (let i = 0; i <= 18; i++) p.push(`${x + (i * w) / 18},${y + (((i * 7919) % 11) / 10 - 0.5) * h}`);
    return PL(p.join(' '), c, sw * 0.8);
  }
  if (kind === 'pluck') {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      p.push(`${x + t * w},${y - Math.sin(t * Math.PI * 10) * Math.exp(-t * 4) * h / 2}`);
    }
    return PL(p.join(' '), c, sw);
  }
  // sin / fm
  const cyc = kind === 'fm' ? 2 : 2.5;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, ph = t * Math.PI * 2 * cyc;
    const v = kind === 'fm' ? Math.sin(ph + 2.2 * Math.sin(ph * 3)) : Math.sin(ph);
    p.push(`${x + t * w},${y - v * h / 2}`);
  }
  return PL(p.join(' '), c, sw);
}
// 柔和的層疊波浪（Pad 底圖）
function softWaves(c1, c2, c3) {
  let s = '';
  const band = (y0, amp, ph, col, op) => {
    let d = `M0 100 L0 ${y0}`;
    for (let i = 0; i <= 16; i++) {
      const x = i * 10, y = y0 + Math.sin(i * 0.55 + ph) * amp;
      d += ` L${x} ${f1(y)}`;
    }
    return GO(op, Pa(d + ' L160 100 Z', col));
  };
  s += band(46, 8, 0, c1, 0.55) + band(60, 7, 2, c2, 0.7) + band(74, 6, 4, c3, 0.9);
  return s;
}

// 左右（上下）對稱的外形：只寫上半邊，下半邊自動鏡射
// segs：['M',x,y] 起點，接 ['C',x1,y1,x2,y2,x,y]／['Q',x1,y1,x,y]／['L',x,y]
function symPath(segs) {
  const pt = [];
  let d = `M${f1(segs[0][1])} ${f1(segs[0][2])}`;
  let cur = [segs[0][1], segs[0][2]];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    d += s[0] + s.slice(1).map(f1).join(' ');
    pt.push({ s, from: cur });
    cur = s.slice(-2);
  }
  if (Math.abs(cur[1]) > 0.01) d += `L${f1(cur[0])} ${f1(-cur[1])}`;
  for (let i = pt.length - 1; i >= 0; i--) {
    const { s, from } = pt[i], fy = [from[0], -from[1]];
    if (s[0] === 'C') d += `C${f1(s[3])} ${f1(-s[4])} ${f1(s[1])} ${f1(-s[2])} ${f1(fy[0])} ${f1(fy[1])}`;
    else if (s[0] === 'Q') d += `Q${f1(s[1])} ${f1(-s[2])} ${f1(fy[0])} ${f1(fy[1])}`;
    else d += `L${f1(fy[0])} ${f1(fy[1])}`;
  }
  return d + 'Z';
}

// ══ 撥弦樂器（橫放：琴身在左、琴頭在右，弦的中心線 y=50）══════════════
// 指板＋琴格：x0 接琴身那端、x1 上弦枕；琴格依十二平均律從弦枕往琴橋 bx 排
function fretboard(x0, x1, w0, w1, fill, o = {}) {
  let s = Po(`${x0},${50 - w0} ${x1},${50 - w1} ${x1},${50 + w1} ${x0},${50 + w0}`, fill, OL(1.4));
  const scale = x1 - o.bx;
  if (o.frets) {
    for (let k = 1; k <= o.frets; k++) {
      const x = x1 - scale * (1 - Math.pow(2, -k / 12));
      if (x < x0 + 1) break;
      const w = lerp(w1, w0, (x1 - x) / (x1 - x0));
      s += L(x, 50 - w, x, 50 + w, o.fc || C.silver, o.fw || 1.1, { 'stroke-linecap': 'butt' });
    }
  }
  if (o.dots) for (const k of o.dots) {
    const x = x1 - scale * (1 - Math.pow(2, -(k - 0.5) / 12));
    if (x > x0) s += Ci(x, 50, 1.2, C.ivory);
  }
  return s;
}
// 弦：從琴橋 (bx, ±hb) 拉到弦枕 (nx, ±hn)；pairs=true 時兩兩成對（複弦）
function strings(n, bx, nx, hb, hn, o = {}) {
  let s = '';
  const c = o.c || C.string, w = o.w || 0.8;
  for (let i = 0; i < n; i++) {
    let t = n === 1 ? 0.5 : i / (n - 1);
    if (o.pairs) {
      const g = Math.floor(i / 2), ng = n / 2, k = i % 2;
      t = (ng === 1 ? 0.5 : g / (ng - 1)) + (k ? 0.04 : -0.04);
      t = Math.min(1, Math.max(0, t));
    }
    s += L(bx, 50 - hb + 2 * hb * t, nx, 50 - hn + 2 * hn * t, c, w, { 'stroke-linecap': 'butt' });
  }
  return s;
}
// 琴頭：paddle 平板（兩側弦鈕）、slot 古典鏤空、inline 一字排（電吉他／電貝斯）
function headstock(type, x, o = {}) {
  const fill = o.fill || C.rose, peg = o.peg || C.silver, n = o.n || 6;
  if (type === 'paddle' || type === 'slot') {
    let s = Pa(`M${x} 45 L${x + 20} 43 Q${x + 23} 50 ${x + 20} 57 L${x} 55 Z`, fill, OL(1.4));
    if (type === 'slot') s += RR(x + 4, 46.3, 13, 2.4, 1, C.ol) + RR(x + 4, 51.3, 13, 2.4, 1, C.ol);
    const per = Math.ceil(n / 2);
    for (let i = 0; i < per; i++) {
      const px = x + 4 + (i * 13) / Math.max(1, per - 1);
      s += RR(px - 1.6, 38.5, 3.2, 4.5, 1, peg, OL(0.9)) + RR(px - 1.6, 57, 3.2, 4.5, 1, peg, OL(0.9));
    }
    return s;
  }
  // inline
  let s = Pa(`M${x} 45.5 L${x + 4} 42 Q${x + 12} 37 ${x + 22} 35 Q${x + 28} 34.5 ${x + 27} 40 L${x + 22} 46 Q${x + 12} 52 ${x + 4} 54.5 L${x} 54.5 Z`, fill, OL(1.4));
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), px = x + 5 + t * 18;
    s += Ci(px, 44.5 - t * 6.5, o.big ? 2.2 : 1.6, peg, OL(0.8));
  }
  return s;
}
// 吉他外形（區域座標，0 在腰部附近）
const GTR_BODY = symPath([['M', -40, 0], ['C', -40, -16, -32, -26, -20, -26], ['C', -10, -26, -6, -17, 0, -17],
  ['C', 6, -17, 10, -21, 18, -21], ['C', 30, -21, 38, -14, 38, 0]]);
const JUMBO_BODY = symPath([['M', -40, 0], ['C', -40, -20, -32, -30, -19, -30], ['C', -8, -30, -5, -22, 1, -22],
  ['C', 7, -22, 10, -25, 19, -25], ['C', 31, -25, 38, -15, 38, 0]]);

function guitar(o = {}) {
  const top = o.top || C.spruce, edge = o.edge || C.maple;
  const body = o.jumbo ? JUMBO_BODY : GTR_BODY;
  let s = G('translate(48 50)', Pa(body, edge, OL(1.6)) + G('scale(0.93)', Pa(body, top)) +
    (o.burst ? G('scale(0.88)', Pa(body, 'none', { stroke: o.burst, 'stroke-width': 6, opacity: 0.8 })) : ''));
  if (o.guard) s += Pa('M70 56 Q80 62 77 70 Q68 74 60 66 Z', o.guard);
  s += Ci(62, 50, 8, C.ol) + Ci(62, 50, 9.8, 'none', { stroke: o.ros || C.mapleD, 'stroke-width': 1.4 });
  s += RR(22, 41, 7, 18, 1.5, o.nylon ? C.rose : C.ebony, OL(1));
  s += fretboard(84, 136, 5.4, 4.6, o.board || C.rose, { frets: 19, bx: 27, dots: o.nylon ? null : [3, 5, 7, 9] });
  s += headstock(o.nylon ? 'slot' : 'paddle', 136, { fill: o.head || C.rose, n: o.twelve ? 12 : 6, peg: o.nylon ? C.ivory : C.silver });
  s += strings(o.twelve ? 12 : 6, 26, 137, 5, 3.8, { pairs: o.twelve, c: o.nylon ? '#f3e3c0' : C.string, w: o.twelve ? 0.6 : 0.8 });
  return s;
}
// 實心電吉他（雙切角）
const EG_BODY = symPath([['M', -38, 0], ['C', -38, -16, -30, -24, -18, -24], ['C', -8, -24, -4, -18, 4, -18],
  ['C', 10, -18, 14, -26, 24, -25], ['C', 29, -24, 27, -17, 22, -12], ['C', 19, -9, 22, -6.5, 28, -6.5]]);
function eguitar(o = {}) {
  const fin = o.fin || '#b8322a';
  let s = '';
  if (o.vshape) {
    s += Po('80,44 22,16 12,24 48,46 48,54 12,76 22,84 80,56', fin, OL(1.6));
  } else {
    s += G('translate(50 50)', Pa(EG_BODY, fin, OL(1.6)) +
      (o.burst ? G('scale(0.9)', Pa(EG_BODY, 'none', { stroke: o.burst, 'stroke-width': 6, opacity: 0.9 })) : ''));
    s += Pa('M46 57 Q54 70 66 68 Q76 66 78 56 L78 44 Q68 40 58 44 Z', o.guard || C.ivory, OL(0.8));
  }
  const pu = o.bass ? [[44, 7]] : o.hum ? [[36, 8], [58, 8]] : [[36, 6], [47, 6], [58, 6]];
  for (const [x, w] of pu) s += RR(x - w / 2, 43, w, 14, 1.5, o.puc || C.black, OL(0.9));
  s += R(24, 42, 5, 16, C.silver, OL(0.9));
  if (!o.vshape) s += Ci(36, 66, 2.4, C.silver, OL(0.8)) + Ci(45, 69, 2.4, C.silver, OL(0.8));
  const nx = o.bass ? 140 : 134;
  s += fretboard(78, nx, 5, 4.2, o.board || C.rose, { frets: o.fretless ? 0 : 22, bx: 26, dots: o.fretless ? null : [3, 5, 7, 9, 12] });
  if (o.fretless) {
    const sc = nx - 26;
    for (let k = 1; k < 16; k++) {
      const x = nx - sc * (1 - Math.pow(2, -k / 12));
      if (x > 79) s += L(x, 46, x, 54, '#e8d8b0', 0.6, { opacity: 0.55 });
    }
  }
  s += headstock('inline', nx, { fill: o.head || '#c98a4e', n: o.bass ? 4 : 6, big: o.bass });
  s += strings(o.bass ? 4 : 6, 26, nx + 1, o.bass ? 4 : 4.4, o.bass ? 3.2 : 3.6, { w: o.bass ? 1.1 : 0.75 });
  return s;
}
// 爵士空心吉他：大琴身、f 孔、拉弦板
function jazzGuitar() {
  let s = G('translate(48 50)', Pa(JUMBO_BODY, C.burst, OL(1.6)) + G('scale(0.85)', Pa(JUMBO_BODY, '#d9892c')));
  for (const y of [34, 66]) s += SP(`M48 ${y} C54 ${y - 4} 60 ${y + 4} 68 ${y}`, C.ol, 2) + Ci(47, y, 1.6, C.ol) + Ci(69, y, 1.6, C.ol);
  s += RR(40, 43, 8, 14, 1.5, C.black, OL(0.9)) + Pa('M8 46 L20 44 L20 56 L8 54 Z', C.gold, OL(1)) + RR(26, 42, 5, 16, 1, C.ebony);
  s += Pa('M70 60 Q80 66 77 74 Q69 74 63 66 Z', '#2a1a12');
  s += fretboard(84, 136, 5.4, 4.6, C.ebony, { frets: 19, bx: 28, dots: [3, 5, 7, 9] });
  s += headstock('paddle', 136, { fill: C.ebony, peg: C.gold });
  s += strings(6, 14, 137, 4.6, 3.8);
  return s;
}
// 共振吉他：金屬共鳴盤
function resoGuitar() {
  let s = G('translate(48 50)', Pa(GTR_BODY, C.silverD, OL(1.6)) + G('scale(0.92)', Pa(GTR_BODY, C.silver)));
  s += Ci(34, 50, 17, C.silverL, OL(1.2));
  for (let a = 0; a < 8; a++) {
    const r = (a * Math.PI) / 4;
    s += L(34 + Math.cos(r) * 7, 50 + Math.sin(r) * 7, 34 + Math.cos(r) * 15, 50 + Math.sin(r) * 15, C.silverD, 1.1);
  }
  s += Ci(34, 50, 5, C.silverD, OL(1));
  s += E(66, 38, 4, 2.5, C.ol) + E(66, 62, 4, 2.5, C.ol);
  s += fretboard(84, 136, 5.4, 4.6, C.rose, { frets: 19, bx: 34, dots: [3, 5, 7, 9] });
  s += headstock('slot', 136, { fill: C.rose });
  s += strings(6, 14, 137, 4, 3.8);
  return s;
}
// 斑鳩琴：圓形鼓面、框箍、第五弦弦鈕在指板中段
function banjo() {
  let s = Ci(42, 50, 33, C.silverD, OL(1.6)) + Ci(42, 50, 29, C.skin, OL(1));
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    s += Ci(42 + Math.cos(a) * 31, 50 + Math.sin(a) * 31, 1.1, C.silverL);
  }
  s += Pa('M10 46 L24 47 L24 53 L10 54 Z', C.silver, OL(1)) + R(30, 44, 3, 12, C.woodL, OL(0.8));
  s += fretboard(72, 140, 4.6, 4.2, C.rose, { frets: 22, bx: 31, dots: [5, 7, 10, 12] });
  s += RR(103, 39, 3, 5, 1, C.silver, OL(0.8));
  s += headstock('paddle', 140, { fill: C.rose, n: 4 });
  s += strings(4, 24, 141, 3.6, 3.2) + L(24, 46, 104, 45.6, C.string, 0.8);
  return s;
}
// 曼陀林：淚滴形琴身、橢圓音孔、四組複弦
function mandolin() {
  const body = symPath([['M', -36, 0], ['C', -36, -20, -20, -26, -6, -24], ['C', 10, -22, 24, -12, 34, -5]]);
  let s = G('translate(46 50)', Pa(body, C.burst, OL(1.6)) + G('translate(-2 0) scale(0.86)', Pa(body, '#d27b2c')));
  s += E(58, 50, 5, 7.5, C.ol) + RR(24, 43, 5, 14, 1, C.ebony) + Pa('M10 46 L20 46 L20 54 L10 54 Z', C.silver, OL(1));
  s += fretboard(80, 130, 4.6, 4.2, C.rose, { frets: 20, bx: 26, dots: [5, 7, 10] });
  s += headstock('paddle', 130, { fill: C.ebony, n: 8 });
  s += strings(8, 14, 131, 3.6, 3.2, { pairs: true, w: 0.55 });
  return s;
}
// 烏克麗麗：小吉他、四弦
function ukulele() {
  let s = G('translate(56 50) scale(0.8)', Pa(GTR_BODY, C.mapleD, OL(2)) + G('scale(0.93)', Pa(GTR_BODY, '#d79a5a')));
  s += Ci(68, 50, 6.5, C.ol) + RR(37, 44, 6, 12, 1.5, C.rose, OL(1));
  s += fretboard(86, 128, 4.8, 4.2, C.rose, { frets: 15, bx: 40, dots: [5, 7, 10] });
  s += headstock('paddle', 128, { fill: C.woodD, n: 4 });
  s += strings(4, 40, 129, 3.6, 3.2, { w: 0.9 });
  return s;
}
// 恰朗哥：小型、十弦五組（傳統以犰狳殼為背）
function charango() {
  let s = G('translate(54 50) scale(0.78 0.82)', Pa(GTR_BODY, '#6d3c1c', OL(2)) + G('scale(0.92)', Pa(GTR_BODY, '#e3b36c')));
  s += Ci(66, 50, 5.5, C.ol) + Ci(66, 50, 7.5, 'none', { stroke: C.red, 'stroke-width': 1.5 });
  s += RR(36, 43, 5, 14, 1, C.rose, OL(1));
  s += fretboard(84, 130, 5, 4.6, C.rose, { frets: 16, bx: 38 });
  s += headstock('paddle', 130, { fill: '#6d3c1c', n: 10 });
  s += strings(10, 38, 131, 4.2, 3.8, { pairs: true, w: 0.5 });
  return s;
}
// 布祖基：圓背、長頸有琴格、四組複弦
function bouzouki() {
  const body = symPath([['M', -30, 0], ['C', -30, -19, -18, -25, -4, -24], ['C', 12, -23, 22, -14, 30, -5]]);
  let s = G('translate(38 50)', Pa(body, C.woodD, OL(1.6)) + G('scale(0.88)', Pa(body, C.spruce)));
  s += Ci(46, 50, 6, C.ol) + Ci(46, 50, 8, 'none', { stroke: C.red, 'stroke-width': 1.3 }) + RR(18, 44, 4, 12, 1, C.ebony);
  s += Pa('M6 46 L14 46 L14 54 L6 54 Z', C.silver, OL(1));
  s += fretboard(66, 140, 4.2, 3.8, C.rose, { frets: 24, bx: 20, dots: [5, 7, 10, 12] });
  s += headstock('paddle', 140, { fill: C.woodD, n: 8 });
  s += strings(8, 10, 141, 3.2, 3, { pairs: true, w: 0.5 });
  return s;
}
// 巴拉萊卡：三角形琴身、三弦
function balalaika() {
  let s = Po('8,14 8,86 80,53 80,47', C.mapleD, OL(1.6)) + Po('11,19 11,81 74,52 74,48', '#e7c27e');
  s += Ci(46, 50, 5, C.ol) + Ci(46, 50, 6.8, 'none', { stroke: C.woodD, 'stroke-width': 1.3 });
  s += RR(22, 45, 3, 10, 1, C.ebony);
  s += fretboard(78, 136, 3.8, 3.4, C.rose, { frets: 16, bx: 23 });
  s += Pa('M136 46 L152 43 Q156 50 152 57 L136 54 Z', C.mapleD, OL(1.4));
  for (const x of [141, 147]) s += RR(x - 1.5, 38.5, 3, 4.5, 1, C.silver, OL(0.8));
  s += RR(144, 57, 3, 4.5, 1, C.silver, OL(0.8));
  s += strings(3, 23, 137, 3, 2.6);
  return s;
}

// ══ 提琴家族（區域座標：琴身長 60，x 正方向朝琴頭）═════════════════════
const VLN_BODY = symPath([['M', -30, 0], ['C', -30, -12, -26, -17, -18, -17], ['C', -12, -17, -9, -15, -7, -12.5],
  ['L', -6, -10], ['C', -2, -8.2, 2, -8.2, 6, -10], ['L', 7, -12], ['C', 9, -14.5, 12, -15, 17, -15], ['C', 25, -15, 30, -11, 30, 0]]);
// 低音提琴：斜肩、上半身窄
const DB_BODY = symPath([['M', -30, 0], ['C', -30, -13, -25, -18, -17, -18], ['C', -11, -18, -8, -16, -6.5, -13],
  ['L', -5.5, -10.5], ['C', -2, -8.5, 2, -8.5, 5.5, -10], ['L', 6.5, -12], ['C', 10, -13.5, 14, -12.5, 22, -8.5], ['C', 27, -6, 30, -4, 30, 0]]);

// 一把提琴；o.bass 用低音提琴外形與機械弦鈕，o.endpin 畫尾柱，o.mute 加弱音器
function fiddle(o = {}) {
  const body = o.bass ? DB_BODY : VLN_BODY;
  let s = '';
  if (o.endpin) s += L(-30, 0, -44, 0, C.silverD, 2.2);
  s += Pa(body, o.wood || '#b5531f', OL(1.6)) + G('scale(0.94)', Pa(body, 'none', { stroke: '#7a3212', 'stroke-width': 1.6 }));
  // f 孔
  for (const sy of [-1, 1]) s += SP(`M-9 ${sy * 7.2} C-4 ${sy * 5} 2 ${sy * 9} 6 ${sy * 7}`, C.ol, 1.6);
  // 指板、琴頸、弦軸箱、琴頭渦卷
  s += Po('-2,-3.4 30,-2.6 52,-2.2 52,2.2 30,2.6 -2,3.4', C.ebony, OL(1));
  s += R(52, -3, 9, 6, o.wood || '#b5531f', OL(1.2));
  if (o.bass) {
    s += R(54, -6.5, 2.4, 3.5, C.brass, OL(0.6)) + R(58, -6.5, 2.4, 3.5, C.brass, OL(0.6)) +
      R(54, 3, 2.4, 3.5, C.brass, OL(0.6)) + R(58, 3, 2.4, 3.5, C.brass, OL(0.6));
  } else {
    s += E(54.5, -5, 1.6, 2.4, C.ebony) + E(58.5, -5, 1.6, 2.4, C.ebony) + E(54.5, 5, 1.6, 2.4, C.ebony) + E(58.5, 5, 1.6, 2.4, C.ebony);
  }
  s += Ci(63.5, 0, 4, o.wood || '#b5531f', OL(1.2)) + SP('M63.5 -2 a2 2 0 1 1 -0.1 0', C.ol, 1);
  // 拉弦板、琴橋
  s += Po('-29,-2 -12,-3.4 -12,3.4 -29,2', C.ebony, OL(0.8));
  s += R(-7.5, -5.5, 2.2, 11, C.spruce, OL(0.6));
  s += G('translate(0 -50)', strings(4, -12, 52, 2.6, 1.6, { w: 0.55 }));
  if (o.mute) s += R(-11, -4, 3, 8, C.black, OL(0.6));
  return s;
}
// 琴弓（區域座標：從 0 到 len）
function bow(len, o = {}) {
  return L(0, 0, len, 0, '#f4eedc', 1.1) + SP(`M0 -3 Q${len / 2} -5 ${len} -3`, C.woodD, 2) +
    R(-3, -4.5, 6, 4, C.ebony, OL(0.7)) + L(len, -3, len, 0, C.woodD, 1.6);
}
function violin(scale, o = {}) {
  // 橫放、琴頭朝右上，弓在下面
  const sc = scale || 1;
  return G(`translate(74 46) rotate(-14) scale(${sc})`, fiddle(o)) +
    G(`translate(18 ${o.bowY || 84}) rotate(-8)`, bow(124));
}
function cello(o = {}) {
  // 直立、尾柱著地
  const sc = o.bass ? 1.3 : 1.18;
  return G(`translate(62 ${o.bass ? 54 : 58}) rotate(-90) scale(${sc})`, fiddle({ endpin: true, bass: o.bass, wood: o.bass ? '#8a3e17' : '#a8481a' })) +
    G(`translate(92 ${o.bass ? 60 : 66}) rotate(-32)`, bow(62));
}

// ══ 中國擦弦：二胡／高胡（直立）═════════════════════════════════════
function huqin(o = {}) {
  const x = 80;
  let s = '';
  // 琴桿
  s += RR(x - 2, 6, 4, 82, 3, C.woodD, OL(1.3));
  // 兩根弦軸（朝同一側）
  s += RR(x + 1, 14, 14, 3.4, 1.6, C.woodD, OL(1)) + RR(x + 1, 24, 14, 3.4, 1.6, C.woodD, OL(1));
  s += Ci(x + 16, 15.7, 2.4, C.ivory, OL(0.8)) + Ci(x + 16, 25.7, 2.4, C.ivory, OL(0.8));
  // 琴頭
  s += Pa(`M${x - 2.5} 6 Q${x} 1 ${x + 3.5} 4 L${x + 2} 7 Z`, C.woodD, OL(1));
  // 琴筒
  if (o.round) {
    s += RR(x - 9, 74, 30, 16, 3, C.wood, OL(1.4)) + E(x - 9, 82, 4.5, 8.5, C.snake, OL(1.4));
  } else {
    s += Po(`${x - 9},73 ${x + 22},73 ${x + 25},77 ${x + 25},87 ${x + 22},91 ${x - 9},91`, C.wood, OL(1.4));
    s += L(x - 9, 77, x + 25, 77, C.woodD, 1) + L(x - 9, 87, x + 25, 87, C.woodD, 1);
    s += Po(`${x - 9},73 ${x - 5},76 ${x - 5},88 ${x - 9},91 ${x - 13},88 ${x - 13},76`, C.snake, OL(1.4));
    for (const [a, b] of [[-11, 79], [-7, 82], [-11, 85], [-8, 77.5], [-8, 87]]) s += E(x + a, b, 1.3, 1, C.snakeL);
  }
  // 千斤、兩條弦、琴碼
  s += L(x - 6, 12, x - 6, 84, C.string, 0.7) + L(x - 4, 12, x - 4, 84, C.string, 0.7);
  s += L(x - 7.5, 40, x - 1, 40, '#d83a2a', 1.8);
  s += R(x - 7, 82, 4, 3, C.spruce, OL(0.5));
  // 弓（馬尾夾在兩弦之間）
  s += SP(`M${x - 60} 63 Q${x - 5} 58 ${x + 58} 66`, C.bamboo, 2.2) + L(x - 60, 66, x + 58, 69, '#f4eedc', 1.2);
  s += L(x - 60, 63, x - 60, 66, C.bambooD, 1.6) + L(x + 58, 66, x + 58, 69, C.bambooD, 1.6);
  if (o.small) s = G('translate(80 50) scale(0.86) translate(-80 -50)', s);
  return s;
}

// ══ 亞洲／世界撥弦（直立樂器一律稍微斜放，填滿 160×100）═══════════════
// 琵琶：梨形琴身、四相（頸上）＋多品（延伸到琴身）、曲項琴頭、四弦
function pipa() {
  let s = '';
  const body = symPath([['M', -44, 0], ['C', -44, -22, -24, -30, -6, -28], ['C', 12, -26, 24, -12, 30, -5]]);
  s = G('translate(-4 0)', Pa(symPathAt(body, 48, 50), C.woodL, OL(1.6)) + Pa(symPathAt(body, 48, 50, 0.9), '#d9a463'));
  // 覆手（琴橋）、品
  let t = RR(14, 42, 6, 16, 1.5, C.woodD, OL(1));
  for (const x of [52, 58, 63, 67.5, 71.5]) t += R(x, 46.4, 1.6, 7.2, C.bamboo, OL(0.5));
  // 頸與相
  t += Po('76,46 116,46.6 116,53.4 76,54', C.woodL, OL(1.4));
  for (const x of [80, 89, 98, 107]) t += R(x, 45, 3.4, 10, C.bamboo, OL(0.8));
  // 曲項（往後彎）與四軸
  t += Pa('M116 46.6 L120 45.6 Q134 44 142 36 L146 39 Q138 49 120 54.4 L116 53.4 Z', C.woodL, OL(1.4));
  for (const [x, y] of [[124, 44], [133, 40.5]]) t += RR(x - 1.5, y - 10, 3, 8, 1.2, C.woodD, OL(0.8));
  for (const [x, y] of [[127, 51], [136, 46.5]]) t += RR(x - 1.5, y + 1, 3, 8, 1.2, C.woodD, OL(0.8));
  t += Pa('M142 36 Q148 32 150 36 Q148 40 146 39 Z', C.woodD, OL(1));
  t += strings(4, 17, 117, 4.6, 2.6, { w: 0.6 });
  return G('rotate(-10 80 50)', s + t);
}
// 把 symPath（以 0 為中心）平移／縮放到 (cx, cy)
function symPathAt(d, cx, cy, k = 1) {
  return d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, a, b) => `${f1(cx + a * k)} ${f1(cy + b * k)}`);
}
// 三味線：方形蒙皮琴身、細長無品頸、撥子（撥）
function shamisen() {
  let s = Pa('M10 30 Q8 50 10 70 L44 70 Q46 50 44 30 Z', C.woodD, OL(1.6));
  s += Pa('M13 33 Q11.5 50 13 67 L41 67 Q42.5 50 41 33 Z', C.ivory, OL(0.8));
  s += Po('44,47.6 136,48.4 136,51.6 44,52.4', '#3b2414', OL(1.3));
  s += Pa('M136 47.6 L152 46 Q155 50 152 54 L136 52.4 Z', '#3b2414', OL(1.3));
  for (const x of [140, 146]) s += RR(x - 1.4, 39, 2.8, 7, 1, C.ivory, OL(0.8));
  s += RR(147 - 1.4, 54, 2.8, 7, 1, C.ivory, OL(0.8));
  s += R(20, 46, 2.5, 8, C.ivory, OL(0.6)) + strings(3, 12, 137, 2.2, 1.6, { w: 0.6 }).replace(/stroke="#f1ead6"/g, 'stroke="#f7e9b8"');
  // 撥
  s += Po('34,74 50,76 60,96 22,96', C.ivory, OL(1.3)) + R(33, 74, 4, 6, C.woodD);
  return s;
}
// 西塔琴：大葫蘆共鳴箱、寬長頸、弧形金屬品、上方第二葫蘆、側面弦軸
function sitar(o = {}) {
  let s = '';
  s += E(30, 54, 26, 24, C.woodL, OL(1.6)) + E(30, 54, 21, 19, '#e2b66d');
  for (let i = 0; i < 8; i++) s += Ci(30 + Math.cos(i * 0.785) * 15, 54 + Math.sin(i * 0.785) * 13, 1.2, C.woodD);
  s += Po('48,44.5 148,46 148,54 48,55.5', C.woodD, OL(1.4));
  if (!o.nofret) for (let i = 0; i < 18; i++) {
    const x = 60 + i * 4.8;
    s += SP(`M${x} 45.5 Q${x + 1.6} 50 ${x} 54.5`, C.silverL, 1.1);
  }
  if (o.upper !== false) s += E(118, 66, 9, 8, C.woodL, OL(1.3)) + L(118, 55, 118, 58, C.ol, 1.4);
  // 側面弦軸（頂部與側面各幾支）
  for (const x of [128, 136, 144]) s += RR(x - 1.4, 38, 2.8, 7, 1, C.ebony, OL(0.8));
  for (const x of [132, 140]) s += RR(x - 1.4, 55, 2.8, 7, 1, C.ebony, OL(0.8));
  if (!o.nofret) for (const x of [80, 92, 104]) s += Ci(x, 57, 1.5, C.ivory, OL(0.6));
  s += R(14, 47, 4, 12, C.ivory, OL(0.8));
  s += strings(o.nofret ? 4 : 5, 16, 148, 3, 2.8, { w: 0.6 });
  return s;
}
// 薩羅德：無品、金屬指板、蒙皮共鳴腹、短而寬
function sarod() {
  let s = Pa('M8 50 C8 28 34 26 48 36 L60 42 L60 58 L48 64 C34 74 8 72 8 50 Z', C.woodD, OL(1.6));
  s += E(26, 50, 15, 15, C.skin, OL(1.2)) + R(22, 45, 3, 10, C.ivory, OL(0.6));
  s += Po('58,43 128,46 128,54 58,57', C.silverL, OL(1.4));
  s += Pa('M128 45 L146 43 Q152 50 146 57 L128 55 Z', C.woodD, OL(1.4));
  for (const x of [134, 142]) s += RR(x - 1.4, 36, 2.8, 7, 1, C.ebony, OL(0.8)) + RR(x - 1.4, 57, 2.8, 7, 1, C.ebony, OL(0.8));
  s += E(108, 64, 7, 6, C.silver, OL(1.1)) + L(108, 56, 108, 58, C.ol, 1.2);
  s += strings(4, 23, 129, 3, 2.8, { w: 0.6 });
  return s;
}
// 烏德琴：大梨形圓背、無品短頸、曲項琴頭、三個花窗
function oud() {
  const body = symPath([['M', -40, 0], ['C', -40, -24, -22, -32, -4, -30], ['C', 14, -28, 26, -14, 34, -5]]);
  let s = Pa(symPathAt(body, 50, 50), C.woodD, OL(1.6)) + Pa(symPathAt(body, 50, 50, 0.92), '#e0b878');
  s += Ci(48, 50, 6.5, C.woodD, OL(0.8)) + Ci(62, 42, 3.4, C.woodD, OL(0.6)) + Ci(62, 58, 3.4, C.woodD, OL(0.6));
  for (const [cx, cy, r] of [[48, 50, 4.5], [62, 42, 2], [62, 58, 2]]) s += Ci(cx, cy, r, 'none', { stroke: '#e0b878', 'stroke-width': 0.8 });
  s += RR(22, 43, 5, 14, 1.5, C.ebony, OL(0.8));
  s += Po('84,45 118,46 118,54 84,55', C.ebony, OL(1.4));
  // 往後折的弦軸箱（斜向下）
  s += Pa('M118 46 L122 45 L150 66 L145 70 L118 54 Z', C.woodD, OL(1.4));
  for (let i = 0; i < 5; i++) {
    const x = 126 + i * 5, y = 50 + i * 3.6;
    s += RR(x - 1.3, y - 9, 2.6, 6, 1, C.ebony, OL(0.7));
  }
  s += strings(10, 26, 119, 4.4, 3.6, { pairs: true, w: 0.5 });
  return s;
}

// 坦布拉：大葫蘆、長而直的頸、無品、四弦、頂端弦軸
function tanpura() {
  let s = E(34, 52, 28, 26, '#a86a32', OL(1.6)) + E(34, 52, 23, 21, '#e7c07a');
  s += SP('M14 40 Q34 30 54 40', C.woodD, 1.2) + SP('M14 64 Q34 74 54 64', C.woodD, 1.2);
  s += Po('56,45 150,46.5 150,53.5 56,55', '#a86a32', OL(1.4));
  for (const x of [138, 146]) s += RR(x - 1.5, 38, 3, 8, 1, C.ebony, OL(0.8)) + RR(x - 1.5, 54, 3, 8, 1, C.ebony, OL(0.8));
  s += R(20, 45, 4, 10, C.ivory, OL(0.8));
  s += strings(4, 22, 150, 3.4, 2.6, { w: 0.7 });
  return s;
}

// ══ 箏類（長板，略斜放；雁柱斜排成一線）══════════════════════════════
// o：n 弦數、wood 面板色、end 尾端樣式、color 雁柱色
function zither(o = {}) {
  const n = o.n || 21, top = 30, bot = 72, x0 = 10, x1 = 150;
  let s = '';
  // 側板（厚度）＋拱形面板
  s += Pa(`M${x0} ${top + 6} Q80 ${top - 6} ${x1} ${top + 6} L${x1} ${bot + 8} L${x0} ${bot + 8} Z`, o.side || C.woodD, OL(1.6));
  s += Pa(`M${x0} ${top + 6} Q80 ${top - 6} ${x1} ${top + 6} L${x1} ${bot} Q80 ${bot - 8} ${x0} ${bot} Z`, o.wood || C.kiri, OL(1.4));
  // 前後岳山
  s += L(x0 + 10, top + 4, x0 + 10, bot - 1, o.bridge || C.ivory, 2.2) + L(x1 - 10, top + 4, x1 - 10, bot - 1, o.bridge || C.ivory, 2.2);
  // 弦與雁柱
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, y = lerp(top + 5, bot - 3, t) - Math.sin(t * Math.PI) * 0 ;
    s += L(x0 + 10, y, x1 - 10, y, C.string, 0.5, { 'stroke-linecap': 'butt' });
    // 低音弦在上、雁柱沿對角線
    const bx = lerp(x0 + 52, x1 - 28, t) + (i % 2 ? 3 : 0);
    s += Po(`${bx - 2},${y + 2} ${bx},${y - 1.6} ${bx + 2},${y + 2}`, o.color || C.ivory, OL(0.5));
  }
  // 尾端
  if (o.end === 'ridge') {
    // 伽倻琴：尾端羊耳頭
    s += Pa(`M${x0} ${top + 6} L${x0 - 6} ${top + 10} L${x0 - 6} ${bot + 4} L${x0} ${bot + 8} Z`, o.side || C.woodD, OL(1.2));
    s += Pa(`M${x1} ${top + 6} Q${x1 + 8} ${(top + bot) / 2} ${x1} ${bot + 8}`, o.side || C.woodD, OL(1.2));
  }
  if (o.tassel) s += L(x1 - 4, bot + 8, x1 - 4, bot + 18, C.red, 2.4) + L(x1, bot + 8, x1 + 2, bot + 18, C.red, 2.4);
  if (o.deco) s += R(x0 + 2, top + 8, 4, bot - top - 8, o.deco);
  if (o.side2) s += Pa(`M${x0} ${bot + 3} L${x1} ${bot + 3}`, 'none', { stroke: o.side2, 'stroke-width': 2 });
  return s;
}

// 揚琴：梯形木箱、兩排山口（琴碼）、兩支竹製琴竹
function yangqin(o = {}) {
  let s = Po('34,26 126,26 154,80 6,80', o.side || C.woodD, OL(1.6));
  s += Po('37,29 123,29 149,76 11,76', o.top || '#d8a465', OL(1));
  for (let i = 0; i < 14; i++) {
    const y = 32 + i * 3.2, t = (y - 26) / 54;
    s += L(lerp(36, 9, t), y, lerp(124, 151, t), y, C.silverL, 0.5);
  }
  for (let i = 0; i < 7; i++) {
    const y = 33 + i * 6.4;
    s += R(56 - i * 1.5, y - 1.2, 3, 3, C.ivory, OL(0.5)) + R(98 + i * 1.5, y - 1.2, 3, 3, C.ivory, OL(0.5));
  }
  s += Ci(80, 70, 4, C.woodD, OL(0.8));
  // 琴竹
  s += L(40, 94, 108, 58, C.bamboo, 1.8) + L(58, 97, 122, 62, C.bamboo, 1.8);
  s += E(108, 58, 3, 1.6, C.red, { transform: 'rotate(-28 108 58)' }) + E(122, 62, 3, 1.6, C.red, { transform: 'rotate(-28 122 62)' });
  return s;
}
// 西洋揚琴（hammered dulcimer）：較淺的梯形、兩條長斜琴碼、木槌
function dulcimer() {
  let s = Po('40,20 120,20 156,82 4,82', '#6b3a1a', OL(1.6)) + Po('43,23 117,23 151,78 9,78', '#e3bd7f', OL(1));
  for (let i = 0; i < 16; i++) {
    const y = 26 + i * 3.2, t = (y - 20) / 62;
    s += L(lerp(42, 7, t), y, lerp(118, 153, t), y, C.silverL, 0.5);
  }
  s += L(54, 25, 44, 76, C.ivory, 2.4) + L(104, 25, 116, 76, C.ivory, 2.4);
  s += Ci(80, 48, 6, '#6b3a1a', OL(0.8)) + Ci(60, 64, 4, '#6b3a1a', OL(0.6)) + Ci(100, 64, 4, '#6b3a1a', OL(0.6));
  s += L(54, 96, 104, 72, C.woodL, 1.8) + L(70, 98, 118, 76, C.woodL, 1.8);
  s += E(104, 72, 3, 2, C.ivory, OL(0.6)) + E(118, 76, 3, 2, C.ivory, OL(0.6));
  return s;
}
// 豎琴：三角框、彎曲琴頸、共鳴箱斜下、立柱
function harp() {
  let s = '';
  // 立柱（左）
  s += RR(36, 18, 6, 74, 2.5, C.gold, OL(1.4));
  s += RR(30, 88, 20, 6, 2, C.gold, OL(1.2)) + Ci(39, 15, 5, C.gold, OL(1.2));
  // 共鳴箱：從立柱底部斜向右上
  s += Po('44,90 56,90 124,28 116,24', C.woodL, OL(1.6)) + L(50, 89, 120, 26, C.woodD, 1.2);
  // 琴頸：S 形
  s += Pa('M38 12 C60 6 80 30 100 22 C112 16 118 14 126 20 L122 28 C114 22 108 26 98 31 C78 40 58 18 42 22 Z', C.gold, OL(1.4));
  // 弦：從頸到共鳴箱
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const xb = lerp(52, 118, t), yb = lerp(87, 27, t);
    const xt = lerp(46, 120, t), yt = 22 + Math.sin(t * Math.PI * 1.1) * -6 + t * 2;
    const tx = xb - 0, ty = Math.min(yt + 6, yb - 2);
    s += L(xb, yb, tx, ty, i % 7 === 0 ? C.red : C.string, 0.7);
  }
  return s;
}

// ══ 拇指琴／卡林巴 ═══════════════════════════════════════════════
function kalimba(o = {}) {
  let s = '';
  if (o.mbira) {
    // 姆比拉：木板（常放在葫蘆共鳴器裡）、兩排鐵片、瓶蓋響片
    s += E(80, 58, 62, 36, '#8a5a2e', OL(1.6)) + E(80, 58, 56, 31, '#b07a40');
    s += RR(40, 22, 80, 66, 4, '#d8a965', OL(1.4));
    for (let i = 0; i < 11; i++) {
      const x = 46 + i * 6.8, len = 30 + Math.abs(i - 5) * 3;
      s += RR(x - 1.6, 30, 3.2, len, 1.5, C.steel, OL(0.7));
    }
    for (let i = 0; i < 7; i++) {
      const x = 56 + i * 8, len = 22 + Math.abs(i - 3) * 3;
      s += RR(x - 1.4, 26, 2.8, len, 1.4, C.silverL, OL(0.6));
    }
    s += R(42, 36, 76, 3, C.silverD, OL(0.7));
    for (const x of [44, 52, 108, 116]) s += Ci(x, 80, 3, C.brass, OL(0.8));
    return s;
  }
  s += RR(36, 18, 88, 70, 10, o.wood || C.woodL, OL(1.6)) + Ci(80, 74, 7, C.woodD, OL(1));
  s += R(40, 38, 80, 4, C.silverD, OL(0.8)) + R(40, 30, 80, 3, C.silverD, OL(0.8));
  for (let i = 0; i < 17; i++) {
    const d = Math.abs(i - 8), x = 42.5 + i * 4.6, len = 40 - d * 2.6;
    s += RR(x - 1.6, 24, 3.2, len, 1.5, C.silverL, OL(0.6));
  }
  return s;
}

// ══ 吹管樂器 ═════════════════════════════════════════════════════
// 橫笛（長笛／短笛）：x0..x1 管身，吹口在左
function flute(o = {}) {
  const x0 = o.x0 ?? 6, x1 = o.x1 ?? 154, y = 50, h = o.h || 4;
  let s = RR(x0, y - h, x1 - x0, 2 * h, h, o.c || C.silver, OL(1.4));
  s += L(x0 + 3, y - h + 1.2, x1 - 3, y - h + 1.2, C.silverL, 1, { opacity: 0.9 });
  // 管段接縫、吹口板
  for (const x of o.joints || [x0 + 34, x1 - 26]) s += R(x - 1.5, y - h - 0.6, 3, 2 * h + 1.2, o.dark || C.silverD);
  s += E(x0 + 16, y - h + 0.5, 4, 2, o.dark || C.silverD, OL(0.8)) + E(x0 + 16, y - h + 0.5, 1.5, 0.9, C.ol);
  // 鍵（Boehm 系統的圓形按鍵＋連桿）
  const nk = o.keys || 12, ks = x0 + 46, ke = x1 - 34;
  s += L(ks, y + h - 1, ke, y + h - 1, o.dark || C.silverD, 1);
  for (let i = 0; i < nk; i++) s += Ci(lerp(ks, ke, i / (nk - 1)), y, h * 0.62, o.key || C.silverL, OL(0.7));
  return s;
}
// 竹笛：竹管、竹節纏線、吹孔、膜孔、六個指孔
function dizi(o = {}) {
  const x0 = 6, x1 = 154, y = 50, h = 4.6;
  let s = RR(x0, y - h, x1 - x0, 2 * h, 3, o.c || C.bamboo, OL(1.4));
  s += L(x0 + 3, y - h + 1.4, x1 - 3, y - h + 1.4, '#efdc9e', 1);
  for (const x of [14, 48, 100, 146]) s += R(x - 2, y - h - 0.4, 4, 2 * h + 0.8, o.bind || C.ebony);
  // 吹孔
  s += E(30, y, 2.4, 1.8, C.ol);
  if (o.membrane !== false) s += E(40, y, 2.8, 2, '#f2f0e6', OL(0.8)); // 笛膜
  for (let i = 0; i < 6; i++) s += Ci(60 + i * 7.6, y, 1.6, C.ol);
  s += Ci(112, y, 1.2, C.ol) + Ci(122, y, 1.2, C.ol);
  if (o.tassel) s += L(150, y + h, 152, y + 22, C.red, 2.2) + Ci(151, y + h + 2, 2, C.red);
  return s;
}
// 直吹管（直笛、尺八、奈伊、卡瓦爾）：斜放，吹口在左上
function endFlute(o = {}) {
  const len = o.len || 150, h = o.h || 5;
  let s = '';
  const body = o.body || C.bamboo;
  if (o.kind === 'recorder') {
    s += Pa(`M0 ${-h - 1} L${len - 12} ${-h + 0.5} L${len} ${-h - 2.5} L${len} ${h + 2.5} L${len - 12} ${h - 0.5} L0 ${h + 1} Q-8 ${h} -10 0 Q-8 ${-h} 0 ${-h - 1} Z`, body, OL(1.4));
    s += R(10, -1.8, 5, 3.6, C.ol) + L(0, -h - 1, 0, h + 1, C.woodD, 1.6) + L(len - 26, -h + 0.3, len - 26, h - 0.3, C.woodD, 1.4);
  } else {
    s += RR(0, -h, len, 2 * h, o.kind === 'shaku' ? 1 : h, body, OL(1.4));
    s += L(2, -h + 1.4, len - 2, -h + 1.4, o.hl || '#efdc9e', 1);
  }
  if (o.kind === 'shaku') {
    // 斜切的歌口與牛角嵌片、根部竹根略粗
    s += Po(`0,${-h} 6,${-h} 2,${h}`, C.ivory, OL(0.8));
    s += Pa(`M${len - 14} ${-h} Q${len + 4} ${-h - 3} ${len + 4} 0 Q${len + 4} ${h + 3} ${len - 14} ${h} Z`, body, OL(1.4));
    for (const x of [len - 10, len - 5]) s += L(x, -h - 1, x, h + 1, o.node || C.bambooD, 1.4);
  }
  if (o.nodes) for (const x of o.nodes) s += L(x, -h, x, h, o.node || C.bambooD, 1.4);
  if (o.bind) for (const x of o.bind) s += R(x - 1.6, -h - 0.4, 3.2, 2 * h + 0.8, o.bindC || C.ebony);
  for (const x of o.holes || []) s += Ci(x, 0, 1.7, C.ol);
  return G(`translate(${o.x ?? 12} ${o.y ?? 22}) rotate(${o.rot ?? 21})`, s);
}
// 排笛：一排由長到短的管子、綁帶
function panflute() {
  let s = '';
  const n = 12;
  for (let i = 0; i < n; i++) {
    const x = 26 + i * 9.2, h = 72 - i * 4.4;
    s += RR(x, 14, 8.2, h, 3.5, i % 2 ? C.bamboo : '#e7d290', OL(1.2)) + E(x + 4.1, 15.5, 2.6, 1.3, C.ol);
  }
  s += R(22, 34, 118, 6, C.red, OL(1)) + R(22, 44, 118, 2, '#e8c14a');
  return s;
}
// 陶笛：甘薯形、吹嘴、指孔
function ocarina() {
  let s = Pa('M24 56 C18 30 70 24 104 30 C132 35 146 46 146 56 C146 72 118 82 84 80 C54 78 28 74 24 56 Z', '#c87850', OL(1.6));
  s += Pa('M110 34 L140 26 L146 34 L128 44 Z', '#c87850', OL(1.4)) + R(130, 31, 6, 4, C.ol, { transform: 'rotate(-18 133 33)' });
  s += SP('M40 46 C60 38 90 36 116 42', '#e2a07a', 2.4);
  for (const [x, y, r] of [[48, 56, 3.2], [62, 52, 3.4], [76, 50, 3.4], [90, 50, 3.2], [58, 68, 2.4], [74, 68, 2.8], [92, 66, 2.6], [106, 56, 2.2]]) s += Ci(x, y, r, C.ol);
  return s;
}

// 直吹簧管（單簧管、雙簧管）：斜放，吹嘴在左上、喇叭口在右下
function reedPipe(o = {}) {
  const len = o.len || 128, h = o.h || 4.2, bell = o.bell || 9, body = o.c || C.ebony;
  let s = '';
  // 吹嘴／簧片
  if (o.kind === 'oboe') s += Po(`-12,-1.6 0,-2.4 0,2.4 -12,1.6`, '#d8b070', OL(0.8)) + R(-3, -2.8, 3, 5.6, C.silver, OL(0.6));
  else s += Pa(`M-14 -2 L0 ${-h + 0.6} L0 ${h - 0.6} L-14 2 Q-16 0 -14 -2 Z`, C.black, OL(1)) + R(-4, -h, 3, 2 * h, C.silver, OL(0.6));
  s += Pa(`M0 ${-h} L${len - 18} ${-h} Q${len - 6} ${-h} ${len} ${-bell} L${len} ${bell} Q${len - 6} ${h} ${len - 18} ${h} L0 ${h} Z`, body, OL(1.4));
  for (const x of o.rings || [26, 64, len - 20]) s += R(x - 1.2, -h - 0.4, 2.4, 2 * h + 0.8, C.silver);
  // 鍵與音孔
  for (let i = 0; i < 7; i++) s += Ci(14 + i * 12, 0, 1.8, C.silverL, OL(0.6));
  s += L(10, h - 0.8, len - 24, h - 0.8, C.silver, 1.1) + L(30, -h + 0.8, 90, -h + 0.8, C.silver, 0.9);
  return G(`translate(${o.x ?? 22} ${o.y ?? 20}) rotate(${o.rot ?? 24})`, s);
}
// 低音單簧管：直立長管、彎頸、往上翻的金屬喇叭
function bassClarinet() {
  let s = RR(66, 14, 14, 66, 3, C.ebony, OL(1.5));
  for (const y of [28, 52]) s += R(65.4, y, 15.2, 2.4, C.silver);
  for (let i = 0; i < 6; i++) s += Ci(73, 20 + i * 9.6, 2.2, C.silverL, OL(0.6));
  s += L(78, 18, 78, 76, C.silver, 1.2);
  // 彎頸＋吹嘴
  s += SP('M73 14 C73 4 60 2 50 10', C.silver, 4.2) + SP('M73 14 C73 4 60 2 50 10', C.silverL, 1.4);
  s += Pa('M50 10 L38 16 L40 19 L52 13 Z', C.black, OL(1));
  // 底部 U 形轉彎＋上翻喇叭
  s += Pa('M66 78 C66 96 98 96 98 80 L98 70 Q98 62 104 56 L118 56 Q110 64 110 72 L110 80 C110 104 66 104 66 80 Z', C.silver, OL(1.5));
  s += E(111, 56, 7.5, 2.4, C.silverD, OL(1.2));
  return s;
}
// 低音管：雙管並排（長管＋短管）、長 bocal 吹管
function bassoon() {
  let s = RR(70, 6, 13, 90, 4, '#9c4a1d', OL(1.5)) + RR(83, 26, 9, 70, 3, '#9c4a1d', OL(1.5));
  s += R(69.4, 6, 14.2, 4, C.ivory, OL(0.8)) + RR(68, 80, 26, 16, 5, '#9c4a1d', OL(1.5)) + R(68, 82, 26, 3, C.silver);
  s += R(69.4, 46, 14.2, 2.4, C.silver) + R(82.4, 46, 10.2, 2.4, C.silver);
  for (let i = 0; i < 5; i++) s += Ci(76.5, 54 + i * 5, 1.6, C.silverL, OL(0.5));
  s += L(79, 20, 79, 76, C.silver, 1) + L(88, 32, 88, 76, C.silver, 1);
  // bocal（彎管＋雙簧）
  s += SP('M88 30 C88 22 66 18 52 26', C.silver, 2.4) + Po('52,26 42,28 42,31 52,28', '#d8b070', OL(0.7));
  return s;
}
// 薩克斯風：直立、彎頸、往上翻的喇叭口
// kind: alto / tenor（頸部有弧） / bari（頸部繞一圈）
function sax(kind = 'alto') {
  const k = kind === 'alto' ? 0.86 : kind === 'tenor' ? 0.96 : 1.04;
  let s = '';
  const body = `M66 22 L76 22 L82 66 C84 82 90 88 98 88 C106 88 110 80 110 70 L110 52 Q110 46 104 40 L128 40 Q122 46 122 52 L122 70 C122 92 108 100 96 100 C78 100 70 88 68 70 Z`;
  s += Pa(body, C.brass, OL(1.6)) + SP('M70 26 L74 64 C76 84 86 94 96 94', C.brassL, 1.6);
  s += E(116, 40, 12, 3.4, C.brassD, OL(1.4)) + E(116, 40, 8, 2, '#6d4e10');
  // 按鍵
  for (let i = 0; i < 6; i++) s += Ci(73 + i * 1.2, 30 + i * 7.4, 2.9, C.brassL, OL(0.7));
  for (let i = 0; i < 3; i++) s += Ci(103, 76 - i * 9, 2.6, C.brassL, OL(0.7));
  s += L(80, 30, 84, 70, C.brassD, 1.1);
  // 頸管＋吹嘴
  if (kind === 'bari') {
    s += SP('M71 22 C70 6 92 4 92 16 C92 26 74 26 68 14 C64 8 54 6 44 12', C.brass, 4.2) +
      SP('M71 22 C70 6 92 4 92 16 C92 26 74 26 68 14 C64 8 54 6 44 12', C.brassL, 1);
    s += Pa('M44 12 L34 18 L36 21 L46 15 Z', C.black, OL(1));
  } else if (kind === 'tenor') {
    s += SP('M71 22 C70 10 60 4 46 10', C.brass, 4) + SP('M71 22 C70 10 60 4 46 10', C.brassL, 1);
    s += Pa('M46 10 L34 15 L36 18 L47 13 Z', C.black, OL(1));
  } else {
    s += SP('M71 22 C70 14 62 10 50 14', C.brass, 3.6) + SP('M71 22 C70 14 62 10 50 14', C.brassL, 1);
    s += Pa('M50 14 L39 18 L41 21 L51 17 Z', C.black, OL(1));
  }
  return G(`translate(80 52) scale(${k}) translate(-82 -54)`, s);
}

// ══ 銅管 ═══════════════════════════════════════════════════════
// 喇叭口：從 (x, y) 往右張開，半徑 r
function bellR(x, y, len, r0, r, c = C.brass) {
  return Pa(`M${x} ${y - r0} Q${x + len * 0.75} ${y - r0} ${x + len} ${y - r} L${x + len} ${y + r} Q${x + len * 0.75} ${y + r0} ${x} ${y + r0} Z`, c, OL(1.4)) +
    E(x + len, y, 2.6, r, C.brassD, OL(1.2));
}
function trumpet(o = {}) {
  let s = '';
  // 主管彎迴（外框），三個活塞
  s += SP('M36 40 L94 40', C.brass, 4.6) + SP('M36 60 L102 60 C112 60 112 40 102 40', C.brass, 4.6);
  s += SP('M36 40 C24 40 24 60 36 60', C.brass, 4.6);
  s += SP('M36 40 L94 40 M36 60 L102 60', C.brassL, 1);
  s += bellR(94, 40, 60, 2.4, 15, o.c);
  // 活塞
  for (const x of [62, 71, 80]) s += R(x - 3, 30, 6, 34, C.brass, OL(1.2)) + RR(x - 4, 24, 8, 6, 2, C.silverL, OL(1)) + R(x - 3, 52, 6, 3, C.brassD);
  // 吹嘴管
  s += SP('M60 50 L14 50', C.brass, 3.2) + Pa('M14 46 L6 47.5 L6 52.5 L14 54 Z', C.silver, OL(1));
  if (o.mute) s += Pa('M152 40 Q140 30 128 40 Q140 50 152 40 Z', '#5a3a22', OL(1.2)) + E(152, 40, 3, 6, '#3a2614', OL(1));
  return s;
}
function trombone() {
  let s = '';
  // 伸縮管（兩條長平行管＋U 形）與喇叭
  s += SP('M8 58 L118 58 C128 58 128 68 118 68 L60 68', C.brass, 3.4) + SP('M8 58 L118 58', C.brassL, 0.9);
  s += SP('M30 48 L118 48', C.brass, 3.2);
  s += R(64, 54, 6, 18, C.brassD, OL(1)) + R(36, 44, 5, 18, C.brassD, OL(1));
  s += SP('M60 68 L22 68 C12 68 12 48 22 48 L30 48', C.brass, 3.4);
  // 喇叭朝左
  s += Pa('M70 46 Q40 45 18 30 L18 66 Q40 51 70 50 Z', C.brass, OL(1.4)).replace('M70 46', 'M118 46');
  s = '';
  s += SP('M30 62 L132 62 C142 62 142 74 132 74 L36 74', C.brass, 3.4) + SP('M30 62 L132 62', C.brassL, 0.9);
  s += Pa('M98 38 Q56 37 28 22 L28 56 Q56 41 98 42 Z', C.brass, OL(1.4)) + E(28, 39, 3, 17, C.brassD, OL(1.2));
  s += SP('M98 40 C112 40 112 62 100 62', C.brass, 3.4);
  s += L(120, 56, 120, 80, C.brassD, 2.4) + L(62, 34, 62, 66, C.brassD, 2);
  s += Pa('M36 70 L28 71.5 L28 76.5 L36 78 Z', C.silver, OL(1));
  return s;
}
function frenchHorn() {
  let s = Ci(72, 52, 30, 'none', { stroke: C.ol, 'stroke-width': 7.5 }) + Ci(72, 52, 30, 'none', { stroke: C.brass, 'stroke-width': 4.5 });
  s += Ci(72, 52, 21, 'none', { stroke: C.ol, 'stroke-width': 6.5 }) + Ci(72, 52, 21, 'none', { stroke: C.brass, 'stroke-width': 3.6 });
  s += Ci(72, 52, 12, 'none', { stroke: C.ol, 'stroke-width': 5.5 }) + Ci(72, 52, 12, 'none', { stroke: C.brassL, 'stroke-width': 2.6 });
  // 旋轉閥
  for (const [x, y] of [[60, 40], [68, 36], [76, 34]]) s += Ci(x, y, 3.8, C.silverL, OL(1.1));
  // 大喇叭口朝右下
  s += Pa('M96 66 Q118 74 128 96 L156 82 Q132 74 102 56 Z', C.brass, OL(1.4)) + E(142, 89, 15.5, 4, C.brassD, OL(1.2), {}).replace('/>', ` transform="rotate(-27 142 89)"/>`);
  s += SP('M48 36 L22 22', C.brass, 3) + Pa('M22 22 L14 18 L12 22 L20 26 Z', C.silver, OL(1));
  return s;
}
function tuba() {
  let s = '';
  // 直立大管身、大喇叭朝上
  s += Pa('M58 90 C44 90 40 78 44 64 L52 30 Q50 18 34 10 L104 10 Q88 18 86 30 L92 64 C96 78 92 90 78 90 Z', C.brass, OL(1.6));
  s += E(69, 10, 35, 5, C.brassD, OL(1.4)) + E(69, 10, 26, 3, '#6d4e10');
  s += SP('M54 34 L48 64 C46 76 50 84 58 86', C.brassL, 1.8);
  // 側面盤管＋活塞
  s += SP('M90 56 C110 56 118 70 112 82 C106 92 90 90 86 80', C.brass, 4.2) + SP('M90 56 C110 56 118 70 112 82', C.brassL, 1);
  for (const y of [46, 54, 62, 70]) s += R(96, y, 18, 5.6, C.silverL, OL(1));
  s += SP('M60 60 C42 60 30 54 26 46', C.brass, 3) + Pa('M26 46 L20 40 L17 43 L23 49 Z', C.silver, OL(1));
  return s;
}
// 口哨：嘟起的嘴唇＋音符
function whistle(o = {}) {
  return lips(46, 50, 1.9, 'w') + SP('M76 50 q8 -6 16 0 t16 0 t16 0', o.c || C.ivory, 2.4) + note(128, 44, 1.3, C.gold) + note(112, 30, 0.9, C.gold);
}
// 風笛：氣袋（格紋布）、三支持續音管、吹管、指管
function bagpipe() {
  let s = '';
  // 三支直立持續音管（含頂端小喇叭與流蘇繩）
  for (const [x, top, w] of [[68, 4, 4.6], [84, 16, 3.8], [100, 24, 3.8]]) {
    s += R(x - w / 2, top, w, 54 - top, '#5e3518', OL(1.2));
    s += R(x - w / 2 - 1, top + 6, w + 2, 3, C.ivory) + R(x - w / 2 - 1, top + 24, w + 2, 3, C.ivory);
    s += Pa(`M${x - w / 2 - 2} ${top} L${x + w / 2 + 2} ${top} L${x + w / 2} ${top + 5} L${x - w / 2} ${top + 5} Z`, C.ivory, OL(1));
  }
  s += SP('M68 30 Q86 46 100 40', C.red, 1.8);
  // 氣袋
  s += Pa('M40 50 C40 34 66 32 92 44 C114 54 112 76 90 78 C62 80 40 72 40 50 Z', '#2f5a3a', OL(1.6));
  for (const x of [52, 66, 80, 94]) s += L(x, 38, x - 6, 78, '#c43a2e', 1.4, { opacity: 0.8 });
  for (const y of [48, 60, 70]) s += L(42, y, 108, y + 4, '#e8c14a', 1, { opacity: 0.7 });
  // 吹管（左上）
  s += L(48, 44, 22, 26, C.ol, 5.6) + L(48, 44, 22, 26, '#5e3518', 3.4) + R(18, 21, 6, 6, C.ivory, OL(0.8));
  // 指管（往下）
  s += Pa('M58 74 L54 96 L66 96 L64 74 Z', '#5e3518', OL(1.2));
  for (let i = 0; i < 4; i++) s += Ci(60 - i * 0.4, 79 + i * 4, 1.1, C.ivory);
  return s;
}
// 迪吉里杜管：長木管、白蟻蛀空的自然外形、原住民點畫紋
function didgeridoo() {
  let s = Pa('M6 44 Q50 40 100 41 Q130 40 154 34 L154 66 Q130 60 100 59 Q50 60 6 56 Z', '#9a4f22', OL(1.6));
  s += E(6, 50, 3, 6, '#4a2410', OL(1.2)) + E(154, 50, 4, 16, '#3a1a0a', OL(1.4));
  for (let i = 0; i < 11; i++) {
    const x = 20 + i * 12;
    s += Ci(x, 46, 1.4, '#f3e3b0') + Ci(x + 6, 54, 1.4, '#e8c14a') + Ci(x + 3, 50, 1, '#f3e3b0');
  }
  s += SP('M30 50 Q50 44 70 50 T110 50', '#f3e3b0', 1.4);
  return s;
}
// 口琴：銀色蓋板、一排吹孔
function harmonica() {
  let s = RR(16, 32, 128, 36, 4, C.woodD, OL(1.6));
  s += Pa('M14 30 L146 30 L146 44 L14 44 Z', C.silver, OL(1.4)) + Pa('M14 56 L146 56 L146 70 L14 70 Z', C.silver, OL(1.4));
  s += L(18, 34, 142, 34, C.silverL, 1.2) + L(18, 60, 142, 60, C.silverL, 1.2);
  for (let i = 0; i < 10; i++) s += RR(22 + i * 12, 46, 8, 8, 1.2, C.ol);
  for (let i = 0; i < 10; i++) s += T(26 + i * 12, 41.5, String(i + 1), C.silverD, 5);
  return s;
}
// 嗩吶：圓錐木管、銅製碗形大喇叭、銅芯子＋小哨片、氣牌（圓盤）
function suona() {
  let s = '';
  s += Pa('M30 45.6 L96 42 L96 58 L30 54.4 Z', '#7a3a18', OL(1.5));
  for (let i = 0; i < 7; i++) s += Ci(40 + i * 8, 50, 1.6, C.ol);
  s += R(93, 41, 4, 18, C.brass, OL(1));
  s += Pa('M96 44 Q130 42 154 18 L154 82 Q130 58 96 56 Z', C.brass, OL(1.6)) + E(154, 50, 4, 32, C.brassD, OL(1.4));
  s += SP('M100 46 Q126 44 146 26', C.brassL, 1.4);
  // 芯子、氣牌、哨片
  s += R(14, 48, 16, 4, C.brass, OL(1)) + E(20, 50, 1.6, 7, C.brass, OL(1)) + Po('4,47.6 14,48.6 14,51.4 4,52.4', '#e0c890', OL(0.8));
  return s;
}
// 笙：碗形笙斗（斗子）、吹嘴、一圈長短不一的竹管、金屬箍
function sheng() {
  let s = '';
  const lens = [52, 60, 70, 78, 70, 82, 74, 64, 76, 66, 58, 50, 44];
  const n = lens.length;
  for (let i = 0; i < n; i++) {
    const x = 46 + i * 5.6, top = 74 - lens[i];
    s += RR(x, top, 5, 68 - top, 2, i % 2 ? C.bamboo : '#e6d08c', OL(1));
    s += L(x + 1, top + 4, x + 4, top + 4, C.bambooD, 1);
  }
  s += R(43, 48, 77, 3.4, C.silver, OL(0.9)) + R(43, 30, 77, 2.4, C.silver, OL(0.7));
  // 笙斗
  s += Pa('M42 66 L122 66 Q124 88 82 90 Q40 88 42 66 Z', C.silver, OL(1.5)) + E(82, 66, 40, 4, C.silverL, OL(1.2));
  for (let i = 0; i < 5; i++) s += Ci(58 + i * 12, 78, 1.6, C.silverD);
  // 吹嘴
  s += Pa('M120 76 L148 72 L148 80 L120 82 Z', C.silver, OL(1.3)) + E(148, 76, 2, 4, C.silverD, OL(1));
  return s;
}

// ══ 鍵盤樂器 ═════════════════════════════════════════════════════
// 平台鋼琴（俯視，琴蓋打開）：彎曲側板、琴弦區、鍵盤在下
function grandPiano(o = {}) {
  const c = o.c || C.piano;
  let s = '';
  // 琴身俯視（鍵盤在左邊，尾端在右）
  s += Pa('M16 22 L16 80 L150 80 C156 80 158 74 156 66 C150 48 124 50 104 38 C86 28 74 22 56 22 Z', c, OL(1.6));
  // 響板與琴弦
  s += Pa('M30 26 L30 76 L146 76 C150 76 151 72 150 68 C144 54 122 54 102 42 C86 32 72 26 56 26 Z', o.board || '#c8954c');
  for (let i = 0; i < 12; i++) {
    const y = 30 + i * 3.8;
    s += L(32, y, lerp(70, 148, i / 11), y + (i > 6 ? 0 : 0), C.brassL, 0.6);
  }
  // 鐵骨架（金色）
  s += Pa('M30 26 L56 26 C72 26 86 32 102 42 L96 46 C82 38 70 32 56 31 L36 31 L36 74 L30 76 Z', C.gold, { opacity: 0.85 });
  s += Ci(60, 50, 3, C.gold) + Ci(90, 60, 3, C.gold) + Ci(120, 68, 3, C.gold);
  // 鍵盤
  s += R(4, 22, 12, 58, C.ol, OL(1.2));
  for (let i = 0; i < 14; i++) s += R(5, 23.2 + i * 4, 10, 3.4, C.key);
  for (const i of [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]) s += R(5, 25.6 + i * 4, 6, 2.4, C.black);
  if (o.felt) s += R(26, 26, 5, 50, '#c06a3a', OL(0.8));
  return s;
}
// 直立鋼琴（正面）
function uprightPiano(o = {}) {
  const c = o.c || '#4a2a18';
  let s = R(26, 12, 108, 72, c, OL(1.6)) + R(22, 10, 116, 6, c, OL(1.4));
  s += R(36, 20, 88, 30, o.panel || '#5c3620', OL(1)) + R(70, 24, 20, 8, C.ivory, OL(0.6));
  if (o.candle) s += Ci(48, 26, 2, C.gold) + Ci(112, 26, 2, C.gold);
  s += R(22, 54, 116, 6, c, OL(1.3));
  s += keys(26, 60, 108, 13, 18);
  s += R(26, 73, 108, 4, c, OL(1));
  s += R(30, 84, 6, 12, c, OL(1.2)) + R(124, 84, 6, 12, c, OL(1.2));
  for (const x of [72, 80, 88]) s += R(x - 1.5, 88, 3, 6, C.gold, OL(0.6));
  return s;
}
// 玩具鋼琴：小型、彩色、短腳
function toyPiano() {
  let s = Pa('M20 30 L140 30 L140 66 L20 66 Z', '#e0503a', OL(1.6)) + Pa('M30 18 L130 18 L140 30 L20 30 Z', '#f07b5a', OL(1.4));
  s += keys(28, 48, 104, 18, 12) + Ci(80, 38, 5, '#ffd23a', OL(1));
  for (const x of [56, 104]) s += Ci(x, 38, 3, '#5ac8fa', OL(0.8));
  s += R(28, 66, 8, 22, '#f0a03a', OL(1.3)) + R(124, 66, 8, 22, '#f0a03a', OL(1.3));
  return s;
}
// 舞台型鍵盤（電鋼琴／合成器共用）：o.top 上蓋顏色、o.panel 控制面板內容
function stageKeys(o = {}) {
  let s = '';
  const y0 = o.y0 ?? 30, h = o.h ?? 44;
  if (o.legs) s += L(30, y0 + h, 22, 96, C.silverD, 3) + L(130, y0 + h, 138, 96, C.silverD, 3);
  s += RR(8, y0, 144, h, 4, o.case || C.tolex, OL(1.6));
  s += R(10, y0 + 2, 140, o.lid ?? 14, o.top || C.black);
  s += keys(14, y0 + (o.lid ?? 14) + 4, 132, h - (o.lid ?? 14) - 8, o.nkeys || 21, { white: o.white, black: o.black });
  if (o.cheeks) s += R(8, y0, 6, h, o.cheeks, OL(1.2)) + R(146, y0, 6, h, o.cheeks, OL(1.2));
  return s;
}
// Rhodes 型：黑色上蓋、銀色名條、四支腳
function rhodes(o = {}) {
  let s = stageKeys({ legs: true, y0: 32, h: 40, lid: 16, top: o.top || C.black, case: o.case || C.tolex });
  s += R(52, 37, 56, 6, C.silver, OL(0.7));
  for (let i = 0; i < 3; i++) s += Ci(20 + i * 8, 40, 2, C.silverD, OL(0.6));
  return s;
}
// Wurlitzer 型：圓弧蓋、奶油／粉色外殼
function wurli(o = {}) {
  let s = L(34, 70, 26, 96, C.silverD, 3) + L(126, 70, 134, 96, C.silverD, 3);
  s += Pa('M10 46 Q10 24 32 24 L128 24 Q150 24 150 46 L150 72 L10 72 Z', o.c || '#e8d8b8', OL(1.6));
  s += keys(16, 50, 128, 18, 20);
  s += Ci(132, 36, 3, C.ol) + Ci(122, 36, 3, C.ol) + R(28, 32, 40, 3, C.silver);
  return s;
}
// Clavinet：木紋外殼、楔形、蓋子上有拾音器滑桿
function clavinet(o = {}) {
  let s = L(30, 68, 24, 96, C.silverD, 3) + L(130, 68, 136, 96, C.silverD, 3);
  s += Po('8,30 152,30 152,72 8,72', o.c || '#6b3a1a', OL(1.6)) + R(10, 32, 140, 14, C.black);
  for (let i = 0; i < 4; i++) s += RR(18 + i * 10, 36, 6, 6, 1, i % 2 ? C.red : C.silverL, OL(0.6));
  s += R(76, 37, 60, 3, C.silver);
  s += keys(12, 50, 136, 18, 22);
  return s;
}
// 大鍵琴：俯視、斜角琴身、兩排鍵盤（黑白顛倒：下鍵黑、上鍵白）
function harpsichord() {
  let s = Pa('M12 18 L12 82 L150 82 L150 74 Q120 60 70 34 Q52 22 40 18 Z', '#2f4a3a', OL(1.6));
  s += Pa('M30 22 L30 78 L146 78 L146 76 Q118 62 68 38 Q52 26 40 22 Z', '#e8c98a');
  for (let i = 0; i < 10; i++) s += L(32, 26 + i * 5.2, lerp(62, 144, i / 9), 26 + i * 5.2, C.brassL, 0.6);
  s += SP('M40 24 Q70 46 140 76', C.woodD, 2);
  s += Pa('M60 40 C70 46 76 56 74 66', 'none', { stroke: '#b86a2a', 'stroke-width': 1.2 }) + Ci(84, 60, 6, 'none', { stroke: '#b86a2a', 'stroke-width': 1.2 });
  // 兩排鍵盤（左側，直立排）
  s += R(2, 18, 10, 64, C.ol, OL(1.2)) + R(13, 18, 8, 64, C.ol, OL(1));
  for (let i = 0; i < 14; i++) s += R(3, 19.2 + i * 4.5, 8, 3.8, C.ebony) + R(14, 19.2 + i * 4.5, 6, 3.8, C.ebony);
  for (const i of [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]) s += R(3, 21.8 + i * 4.5, 5, 2.6, C.ivory) + R(14, 21.8 + i * 4.5, 4, 2.6, C.ivory);
  return s;
}
// 鋼片琴：直立櫃、小鍵盤、雙腳踏
function celesta() {
  let s = R(22, 14, 116, 46, '#6a3c20', OL(1.6)) + R(18, 10, 124, 6, '#6a3c20', OL(1.4));
  s += R(34, 20, 92, 30, '#3a2010', OL(1));
  for (let i = 0; i < 8; i++) s += RR(40 + i * 10.6, 24 + (i % 2) * 2, 7, 22 - (i % 2) * 4, 1, C.silverL, OL(0.6));
  s += keys(28, 60, 104, 12, 14);
  s += R(22, 72, 116, 4, '#6a3c20', OL(1));
  s += Pa('M30 76 L26 96 L34 96 L38 76 Z', '#6a3c20', OL(1.2)) + Pa('M130 76 L134 96 L126 96 L122 76 Z', '#6a3c20', OL(1.2));
  s += R(70, 90, 20, 4, C.gold, OL(0.8));
  return s;
}
// 音輪風琴：木櫃、上下兩層鍵盤、拉桿（drawbars）、旋轉喇叭箱
function tonewheel(o = {}) {
  let s = '';
  s += R(18, 20, 108, 76, o.wood || '#7a4520', OL(1.6));
  s += R(14, 18, 116, 5, o.wood || '#7a4520', OL(1.3));
  s += R(24, 24, 96, 12, '#2a1a10');
  const cols = ['#7a3a1a', '#7a3a1a', '#f3ecda', '#f3ecda', '#18181a', '#f3ecda', '#18181a', '#18181a', '#f3ecda'];
  for (let i = 0; i < 9; i++) s += R(30 + i * 5, 24, 3.4, 8 + (i * 37 % 5) * 2, cols[i], OL(0.6));
  for (let i = 0; i < 9; i++) s += R(82 + i * 4, 24, 2.8, 6 + (i * 53 % 4) * 2, cols[i], OL(0.5));
  s += keys(22, 38, 100, 10, 17, { bh: 0.62 }) + keys(22, 50, 100, 10, 17, { bh: 0.62 });
  s += R(22, 62, 100, 4, '#2a1a10');
  // 腳踏鍵盤
  s += R(30, 88, 84, 6, C.ol);
  for (let i = 0; i < 9; i++) s += R(32 + i * 9.2, 89, 7, 4, C.key);
  // 旋轉喇叭箱
  if (o.leslie !== false) {
    s += R(132, 40, 24, 56, o.wood || '#7a4520', OL(1.5)) + R(135, 44, 18, 14, '#1a1210');
    for (let i = 0; i < 3; i++) s += L(136, 47 + i * 4, 152, 47 + i * 4, '#c8a070', 1);
    s += R(135, 66, 18, 24, '#1a1210') + Ci(144, 78, 7, '#3a2a20', OL(0.8));
  }
  if (o.badge) s += badge(o.badge, o.badgeC || C.gold, C.ol, 144, 24);
  return s;
}
// 教堂管風琴：一排錫管（中間最高）、木框、鍵台
function pipeOrgan(o = {}) {
  let s = R(10, 50, 140, 48, '#5a3018', OL(1.6));
  const n = 15;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - 7), h = 68 - d * 6 + (d % 2) * 4, x = 14 + i * 8.9;
    const top = 70 - h;
    s += R(x, top, 7, h, o.c || C.silver, OL(1)) + L(x + 1.8, top + 3, x + 1.8, top + h - 4, C.silverL, 1);
    s += Po(`${x},${top + h - 10} ${x + 7},${top + h - 10} ${x + 3.5},${top + h - 5}`, C.ol);
    if (o.flue) s += E(x + 3.5, top + h - 12, 2.2, 1.2, C.ol);
  }
  s += R(10, 70, 140, 4, C.gold, OL(1));
  s += keys(34, 78, 92, 7, 14) + keys(34, 86, 92, 7, 14);
  if (o.full) s += R(16, 78, 14, 16, '#3a2010') + range(6).map(i => Ci(19 + (i % 2) * 8, 81 + Math.floor(i / 2) * 5, 1.8, i % 3 ? C.ivory : C.red)).join('') +
    R(130, 78, 14, 16, '#3a2010') + range(6).map(i => Ci(133 + (i % 2) * 8, 81 + Math.floor(i / 2) * 5, 1.8, i % 3 ? C.ivory : C.red)).join('');
  return s;
}
// 簧風琴／腳踏簧風琴：雕花木櫃、拉鈕（stops）、兩塊腳踏板
function reedOrgan(o = {}) {
  let s = Pa('M20 10 L140 10 L140 16 L132 16 L132 46 L28 46 L28 16 L20 16 Z', '#6a3518', OL(1.5));
  s += R(46, 18, 68, 22, '#4a2410', OL(0.8)) + Ci(80, 29, 7, '#8a4a22', OL(0.8));
  for (let i = 0; i < 8; i++) s += Ci(36 + i * 12.6, 50, 2.4, C.ivory, OL(0.7));
  s += R(20, 46, 120, 50, '#6a3518', OL(1.6)) + keys(26, 54, 108, 12, 17);
  if (o.pedals !== false) {
    s += Po('48,80 74,80 72,94 46,94', '#2a1a10', OL(1.2)) + Po('86,80 112,80 114,94 88,94', '#2a1a10', OL(1.2));
    s += L(50, 85, 70, 85, '#c8a070', 1) + L(90, 85, 110, 85, '#c8a070', 1);
  } else s += R(30, 74, 100, 18, '#4a2410', OL(0.8));
  return s;
}
// 印度簧風琴（harmonium）：手壓風箱在後、桌上型小木箱
function harmonium() {
  let s = R(14, 22, 132, 16, '#6a3518', OL(1.4));
  for (let i = 0; i < 6; i++) s += Po(`${14},${24 + i * 2.6} ${146},${24 + i * 2.6} ${146},${25.4 + i * 2.6} ${14},${25.4 + i * 2.6}`, '#3a1e0e');
  s += R(14, 38, 132, 44, '#9a5a2a', OL(1.6)) + keys(22, 42, 116, 16, 17);
  for (let i = 0; i < 7; i++) s += Ci(30 + i * 16.6, 70, 3, C.ivory, OL(0.8));
  return s;
}
// 汽笛琴：馬戲團汽笛管（銅）一排、紅色車箱
function calliope() {
  let s = R(14, 54, 132, 36, '#b8322a', OL(1.6)) + R(14, 54, 132, 6, C.gold, OL(1));
  for (let i = 0; i < 12; i++) {
    const x = 20 + i * 10.6, h = 26 + (i % 3) * 6 + (i > 5 ? 6 : 0);
    s += R(x, 54 - h, 7, h, C.brass, OL(1)) + E(x + 3.5, 54 - h, 3.5, 1.4, C.brassD, OL(0.7)) + R(x - 0.6, 46, 8.2, 3, C.brassD);
  }
  for (let i = 0; i < 6; i++) s += Ci(28 + i * 21, 72, 4, C.gold, OL(1));
  s += Ci(36, 92, 6, C.ol) + Ci(124, 92, 6, C.ol) + Ci(36, 92, 2.5, C.gold) + Ci(124, 92, 2.5, C.gold);
  for (let i = 0; i < 4; i++) s += E(30 + i * 12, 14 - i * 3, 6 - i, 4 - i * 0.6, '#e8e8ee', { opacity: 0.7 });
  return s;
}
// 手風琴：右手鋼琴鍵、中間風箱、左手貝斯鈕
function accordion(o = {}) {
  let s = '';
  s += RR(14, 16, 34, 70, 3, o.c || '#b8222a', OL(1.6)) + RR(112, 16, 34, 70, 3, o.c || '#b8222a', OL(1.6));
  // 風箱
  for (let i = 0; i < 10; i++) {
    const x = 48 + i * 6.4;
    s += Po(`${x},18 ${x + 3.2},14 ${x + 6.4},18 ${x + 6.4},84 ${x + 3.2},88 ${x},84`, i % 2 ? '#2a2a30' : '#3a3a42', OL(0.8));
  }
  for (let i = 0; i <= 10; i++) s += L(48 + i * 6.4, 18, 48 + i * 6.4, 84, C.silverL, 0.8);
  // 鍵盤（直立）
  s += R(16, 20, 14, 62, C.ol);
  for (let i = 0; i < 12; i++) s += R(17, 21 + i * 5.1, 12, 4.3, C.key);
  for (const i of [0, 1, 3, 4, 5, 7, 8, 10]) s += R(17, 24 + i * 5.1, 7, 3, C.black);
  s += R(32, 22, 12, 58, '#d8d0c0', OL(0.6));
  if (o.grille) for (let i = 0; i < 5; i++) s += L(34, 30 + i * 10, 42, 30 + i * 10, C.gold, 1.4);
  // 貝斯鈕
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) s += Ci(120 + c * 6.4, 26 + r * 9.6 + c * 1.6, 2.1, C.ivory, OL(0.6));
  s += R(124, 86, 12, 6, C.ol);
  return s;
}
// 班多鈕：方形兩端、兩邊都是圓鈕（沒有鋼琴鍵）、木框
function bandoneon() {
  let s = '';
  s += R(12, 20, 38, 62, '#1c1c20', OL(1.6)) + R(110, 20, 38, 62, '#1c1c20', OL(1.6));
  s += R(15, 23, 32, 56, '#3a2a1c') + R(113, 23, 32, 56, '#3a2a1c');
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 6.7;
    s += Po(`${x},22 ${x + 3.35},18 ${x + 6.7},22 ${x + 6.7},80 ${x + 3.35},84 ${x},80`, i % 2 ? '#2a2a30' : '#3a3a42', OL(0.8));
  }
  for (let i = 0; i <= 9; i++) s += L(50 + i * 6.7, 22, 50 + i * 6.7, 80, C.silverL, 0.8);
  for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) {
    s += Ci(20 + c * 7.4 + (r % 2) * 3.7, 28 + r * 7.5, 2.2, C.ivory, OL(0.5));
    s += Ci(118 + c * 7.4 + (r % 2) * 3.7, 28 + r * 7.5, 2.2, C.ivory, OL(0.5));
  }
  s += R(14, 46, 4, 12, C.silver) + R(142, 46, 4, 12, C.silver);
  return s;
}

// ══ 敲擊條（鐘琴、木琴、馬林巴、顫音琴）══════════════════════════════
// 斜視角排列的音條，左長右短；o.res 共鳴管、o.motor 顫音琴轉盤、o.frame 架子顏色
function bars(o = {}) {
  const n = o.n || 12, x0 = 12, x1 = 148, w = (x1 - x0) / n;
  let s = '';
  if (o.legs) s += L(22, 70, 18, 96, C.ol, 3.4) + L(138, 66, 142, 96, C.ol, 3.4) + L(22, 70, 18, 96, o.legs, 2) + L(138, 66, 142, 96, o.legs, 2);
  if (o.res) for (let i = 0; i < n; i++) {
    const x = x0 + i * w + w * 0.2, h = 44 - i * 2.4;
    s += R(x, 54, w * 0.6, h, o.res, OL(1));
  }
  s += R(x0 - 2, 28, x1 - x0 + 4, 4, o.frame || C.woodD, OL(1)) + R(x0 - 2, 56, x1 - x0 + 4, 4, o.frame || C.woodD, OL(1));
  for (let i = 0; i < n; i++) {
    const len = 46 - i * 1.7, x = x0 + i * w + 1, y = 44 - len / 2;
    s += RR(x, y, w - 2, len, 1.2, o.bar || C.woodL, OL(1.1));
    s += L(x + 1.6, y + 2, x + 1.6, y + len - 2, o.hl || '#e8b880', 1, { opacity: 0.8 });
    s += Ci(x + (w - 2) / 2, y + 4, 0.9, C.ol) + Ci(x + (w - 2) / 2, y + len - 4, 0.9, C.ol);
  }
  if (o.motor) for (let i = 0; i < n; i += 2) s += Ci(x0 + i * w + w / 2, 66, 2.4, C.silverL, OL(0.7));
  if (o.motor) s += L(x0, 66, x1, 66, C.silverD, 1.2);
  // 琴槌
  const m = o.mallet || C.red;
  s += L(96, 90, 120, 66, C.bamboo, 1.8) + Ci(120, 66, 3.6, m, OL(1));
  s += L(108, 96, 134, 72, C.bamboo, 1.8) + Ci(134, 72, 3.6, m, OL(1));
  return s;
}
// 管鐘：架子上一排長管
function tubular() {
  let s = R(14, 8, 132, 6, '#4a4a52', OL(1.3)) + L(18, 14, 18, 96, '#4a4a52', 3) + L(142, 14, 142, 96, '#4a4a52', 3);
  for (let i = 0; i < 9; i++) {
    const x = 28 + i * 12.4, h = 78 - i * 3.4;
    s += L(x + 3, 14, x + 3, 18, C.ol, 1) + R(x, 18, 6, h, C.silver, OL(1.1)) + R(x - 0.6, 18, 7.2, 4, C.brass, OL(0.6));
    s += L(x + 1.6, 23, x + 1.6, 16 + h, C.silverL, 1);
  }
  s += L(104, 96, 128, 70, C.woodL, 2) + RR(124, 64, 10, 7, 2, C.woodD, OL(1, C.ol), {}).replace('/>', ' transform="rotate(-45 129 67)"/>');
  return s;
}
// 教堂鐘：典型西洋鐘形（肩、腰、外張的唇）＋鐘舌
function churchBell() {
  let s = R(62, 4, 36, 6, C.woodD, OL(1.2)) + R(76, 10, 8, 6, C.bronzeD, OL(1));
  s += Pa('M80 14 C64 14 58 24 58 40 C58 58 54 70 40 80 L120 80 C106 70 102 58 102 40 C102 24 96 14 80 14 Z', C.bronze, OL(1.6));
  s += E(80, 80, 40, 6, C.bronzeD, OL(1.4)) + SP('M66 26 C64 40 64 56 52 72', '#dcae62', 2.4);
  s += L(60, 66, 100, 66, C.bronzeD, 1.6) + L(58, 36, 102, 36, C.bronzeD, 1.2);
  s += L(80, 80, 80, 88, C.ol, 2) + Ci(80, 91, 4.4, C.bronzeD, OL(1.2));
  return s;
}
// 梵鐘（日式寺鐘）：圓筒形、乳（凸點）、撞座、吊龍頭、撞木
function templeBell() {
  let s = R(30, 4, 100, 5, C.woodD, OL(1.2));
  s += Pa('M70 10 Q80 4 90 10 L88 16 L72 16 Z', C.bronzeD, OL(1.2));
  s += Pa('M58 16 Q80 12 102 16 L106 84 Q80 90 54 84 Z', '#5e6e5a', OL(1.6));
  s += L(56, 40, 104, 40, '#3a4638', 1.6) + L(55, 66, 105, 66, '#3a4638', 1.6) + L(80, 16, 80, 40, '#3a4638', 1.4);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    s += Ci(62 + c * 5, 22 + r * 5.5, 1.7, '#8fa08a', OL(0.5));
    s += Ci(88 + c * 5, 22 + r * 5.5, 1.7, '#8fa08a', OL(0.5));
  }
  s += Ci(80, 74, 5, '#8fa08a', OL(1)) + Ci(80, 74, 2.4, '#3a4638');
  // 撞木
  s += L(110, 4, 116, 68, C.ol, 1) + L(150, 4, 146, 68, C.ol, 1);
  s += RR(108, 66, 46, 10, 5, C.woodL, OL(1.4));
  return s;
}
// 鑼：大銅盤、中央凸臍、吊架、鑼槌
function gong(o = {}) {
  let s = R(14, 6, 132, 6, '#7a2a1a', OL(1.3)) + L(20, 12, 20, 96, '#7a2a1a', 3.6) + L(140, 12, 140, 96, '#7a2a1a', 3.6);
  s += L(62, 12, 68, 20, C.ol, 1.2) + L(98, 12, 92, 20, C.ol, 1.2);
  s += Ci(80, 54, 36, C.bronze, OL(1.6)) + Ci(80, 54, 31, 'none', { stroke: C.bronzeD, 'stroke-width': 1.6 });
  for (const r of [10, 18, 24]) s += Ci(80, 54, r, 'none', { stroke: '#d8a858', 'stroke-width': 0.8, opacity: 0.7 });
  if (o.boss !== false) s += Ci(80, 54, 7, '#d8a858', OL(1.2));
  s += L(118, 96, 132, 70, C.woodL, 2.4) + Ci(132, 68, 6, '#c03a2a', OL(1.2));
  return s;
}
// 風鈴：圓頂、垂掛長短金屬管、風擋片
function windChime() {
  let s = Pa('M40 20 Q80 4 120 20 L120 24 L40 24 Z', C.woodL, OL(1.4)) + L(80, 4, 80, 12, C.ol, 1.4) + Ci(80, 4, 2, 'none', OL(1.2));
  const xs = [46, 58, 70, 90, 102, 114], hs = [52, 44, 60, 56, 40, 48];
  for (let i = 0; i < 6; i++) {
    s += L(xs[i], 24, xs[i], 30, C.ol, 0.8);
    s += RR(xs[i] - 2.6, 30, 5.2, hs[i], 2, C.silver, OL(1)) + L(xs[i] - 1, 32, xs[i] - 1, 28 + hs[i], C.silverL, 0.8);
  }
  s += L(80, 24, 80, 56, C.ol, 0.8) + Ci(80, 58, 5, C.woodL, OL(1)) + L(80, 63, 80, 78, C.ol, 0.8);
  s += Po('72,78 88,78 84,96 76,96', C.red, OL(1.2));
  return s;
}
// 阿哥哥鈴：兩個大小不同的錐形鈴，以彎曲的鐵桿相連
function agogo() {
  let s = SP('M52 86 C52 98 110 98 110 86', C.silverD, 3.4);
  s += Pa('M36 18 L48 86 Q52 90 56 86 L68 18 Z', C.silver, OL(1.6)) + E(52, 18, 16, 4.4, C.silverD, OL(1.2)) + E(52, 18, 11, 2.6, '#5a6068');
  s += Pa('M96 34 L106 86 Q110 90 114 86 L124 34 Z', C.silver, OL(1.6)) + E(110, 34, 14, 3.8, C.silverD, OL(1.2)) + E(110, 34, 9.5, 2.2, '#5a6068');
  s += SP('M42 26 L50 80', C.silverL, 1.6) + SP('M101 40 L108 80', C.silverL, 1.4);
  s += L(128, 8, 144, 40, C.woodL, 2.4);
  return s;
}
// 手碟：兩片鋼殼合成的「飛碟」、中央 Ding、一圈音區凹槽
function handpan(o = {}) {
  let s = E(80, 60, 66, 22, '#3a3e44', OL(1.6)) + E(80, 54, 64, 30, o.c || '#6a7078', OL(1.6));
  s += E(80, 50, 11, 6.5, '#555b62', OL(1.2)) + E(80, 49, 5, 2.8, '#7f868e');
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (i / 8) * 2 + 0.2, x = 80 + Math.cos(a) * 42, y = 55 + Math.sin(a) * 18;
    s += E(x, y, 9, 4.6, '#555b62', OL(1)) + E(x, y - 0.6, 4, 2, '#7f868e');
  }
  s += SP('M26 46 Q80 22 134 46', '#9aa2aa', 1.4, { opacity: 0.8 });
  return s;
}
// 鋼鼓：油桶改造、凹面上用槌敲的音區（花瓣狀）、側面桶身
function steelPan(o = {}) {
  let s = R(26, 50, 108, 40, o.body || '#c8322a', OL(1.6)) + E(80, 90, 54, 8, o.body || '#c8322a', OL(1.4));
  s += L(26, 66, 134, 66, '#8a1a12', 1.4) + L(26, 78, 134, 78, '#8a1a12', 1.4);
  s += E(80, 50, 54, 22, C.silverD, OL(1.6)) + E(80, 51, 48, 18, C.silver);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, x = 80 + Math.cos(a) * 34, y = 51 + Math.sin(a) * 12;
    s += E(x, y, 8, 4, C.silverL, OL(0.8));
  }
  s += E(80, 51, 10, 4.5, C.silverL, OL(0.8)) + E(70, 50, 3, 1.4, C.silverL);
  s += L(110, 94, 132, 26, C.woodL, 1.6) + Ci(132, 24, 3.6, '#e8e0c8', OL(0.8));
  return s;
}
// 甘美朗：bonang（一排銅鑼鍋放在木架繩上）＋槌
function gamelan() {
  let s = Po('8,62 152,62 146,90 14,90', '#9a2a1a', OL(1.6)) + R(8, 56, 144, 7, C.gold, OL(1.2));
  for (const x of [26, 134]) s += R(x, 90, 6, 8, '#9a2a1a', OL(1));
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 20;
    s += E(x, 56, 9, 4, C.bronzeD, OL(1.2)) + Pa(`M${x - 8} 56 Q${x - 8} 42 ${x} 42 Q${x + 8} 42 ${x + 8} 56 Z`, C.bronze, OL(1.3));
    s += Ci(x, 42, 3.4, '#dcae62', OL(1)) + SP(`M${x - 5} 52 Q${x - 5} 46 ${x - 2} 45`, '#dcae62', 1.2);
  }
  s += L(52, 28, 86, 14, C.woodL, 1.8) + RR(46, 25, 10, 6, 3, '#c8322a', OL(1));
  s += L(98, 30, 128, 14, C.woodL, 1.8) + RR(92, 27, 10, 6, 3, '#c8322a', OL(1));
  return s;
}
// 玻璃琴：橫軸串著一排由大到小的玻璃碗
function glassHarmonica() {
  let s = R(10, 70, 140, 10, C.woodD, OL(1.4)) + R(14, 80, 6, 16, C.woodD, OL(1)) + R(140, 80, 6, 16, C.woodD, OL(1));
  s += L(10, 46, 150, 46, C.silverD, 2.4);
  for (let i = 0; i < 11; i++) {
    const x = 20 + i * 11.6, r = 18 - i * 1.1;
    s += E(x, 46, 5, r, '#bfe6f0', { opacity: 0.55, stroke: '#e6fbff', 'stroke-width': 1.2 });
    s += E(x - 1.4, 46, 1.2, r - 2, '#ffffff', { opacity: i % 2 ? 0.4 : 0.6 });
    if (i % 3 === 1) s += E(x, 46, 5, r, 'none', { stroke: C.gold, 'stroke-width': 1, opacity: 0.8, 'stroke-dasharray': '2 2' });
  }
  s += Pa('M120 66 Q128 70 136 64 L140 72 Q128 80 116 74 Z', C.hand, OL(1));
  return s;
}
// 音樂盒：打開的木盒、銅滾筒（凸針）、鋼梳、手搖柄
function musicBox() {
  let s = Po('18,30 142,30 152,18 28,18', '#c48a50', OL(1.4));
  s += R(18, 30, 124, 52, '#8a4a22', OL(1.6)) + R(24, 36, 112, 40, '#3a1c0e');
  s += R(38, 42, 58, 16, C.brass, OL(1.2));
  for (let i = 0; i < 26; i++) s += Ci(41 + (i * 2.2) % 54, 45 + ((i * 7) % 10), 0.8, C.brassD);
  s += R(36, 58, 62, 4, C.silverD, OL(0.8));
  for (let i = 0; i < 14; i++) s += R(38 + i * 4.3, 60, 2.6, 12 - i * 0.4, C.silverL, OL(0.4));
  s += Ci(116, 56, 9, C.gold, OL(1.2)) + Ci(116, 56, 3, C.brassD);
  s += L(142, 50, 152, 50, C.silver, 2) + L(152, 50, 152, 40, C.silver, 2) + Ci(152, 38, 2.6, C.ebony, OL(0.8));
  s += note(104, 14, 0.8, C.gold) + note(124, 8, 0.6, C.gold);
  return s;
}

// ══ 合成器（電子音色的象徵圖）═══════════════════════════════════════
// 類比單音合成器：木頭側板、旋鈕面板、螢幕顯示波形、短鍵盤
// o.wave 波形種類、o.body 面板色、o.screen 波形色、o.knobs 旋鈕色
function synthBox(o = {}) {
  let s = '';
  const body = o.body || '#2c2e33';
  s += RR(8, 22, 144, 62, 4, o.cheek || C.woodL, OL(1.6));
  s += R(14, 22, 132, 62, body, OL(1));
  // 螢幕
  s += RR(20, 28, 58, 24, 3, '#0c1612', OL(1.1)) + wave(o.wave || 'saw', 25, 40, 48, 14, o.screen || C.screen, 2);
  // 旋鈕
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = 88 + c * 15, y = 33 + r * 13;
    s += Ci(x, y, 4.6, o.knobs ? o.knobs[(r * 4 + c) % o.knobs.length] : C.silverD, OL(1)) + L(x, y, x + 2.6 * Math.cos(c + r), y - 3.4, C.ol, 1.2);
  }
  s += keys(18, 60, 124, 21, 15);
  if (o.badge) s += badge(o.badge, o.badgeC || C.gold, C.ol, o.bx || 136, 13);
  if (o.extra) s += o.extra;
  return s;
}
// 303 型低音機：銀色小盒、旋鈕一排、迷你鍵盤按鈕
function box303(o = {}) {
  let s = RR(10, 22, 140, 60, 3, C.silver, OL(1.6)) + R(10, 22, 140, 6, '#3a3d44');
  for (let i = 0; i < 6; i++) {
    const x = 22 + i * 18;
    s += Ci(x, 40, 5.4, C.black, OL(1)) + L(x, 40, x + 3, 36, C.silverL, 1.2);
  }
  s += Ci(136, 40, 5.4, C.black, OL(1));
  // 13 顆按鈕鍵盤（白／黑）
  for (let i = 0; i < 8; i++) s += RR(22 + i * 14, 62, 11, 12, 1.5, C.ivory, OL(0.9));
  for (const i of [0, 1, 3, 4, 5]) s += RR(29 + i * 14, 52, 9, 8, 1.5, C.black, OL(0.8));
  s += Ci(136, 58, 3, C.led, OL(0.6)) + Ci(136, 68, 3, '#3a3d44', OL(0.6));
  s += RR(118, 70, 12, 6, 1, o.accent || '#f0a03a', OL(0.6));
  if (o.wave) s += RR(112, 52, 34, 0, 0, 'none');
  return s;
}
// 模組合成器：機櫃、模組、跳線
function modular(o = {}) {
  let s = RR(8, 8, 144, 84, 3, '#3a2414', OL(1.6)) + R(14, 14, 132, 72, '#1e1f24');
  const mods = [[14, 22], [36, 16], [52, 28], [80, 18], [98, 22], [120, 26]];
  for (const [x, w] of mods) {
    s += R(x, 14, w, 72, '#d8d8d2', OL(0.8));
    s += Ci(x + w / 2, 26, Math.min(5, w / 3), C.black, OL(0.8));
    if (w > 18) s += Ci(x + w / 2, 42, 4, C.black, OL(0.8));
    for (let j = 0; j < 2; j++) s += Ci(x + w / 2, 62 + j * 10, 2, '#555', OL(0.6));
  }
  s += SP('M25 62 C30 92 60 92 64 72', '#e04a3a', 2) + SP('M44 72 C54 98 100 96 110 62', '#3a9ae0', 2) + SP('M90 72 C96 88 126 86 133 62', '#f0c030', 2);
  if (o.badge) s += badge(o.badge);
  return s;
}
// 掌機（8-bit）：螢幕上的像素方波、十字鍵、AB 鈕（通用造型、無商標）
function handheld() {
  let s = RR(42, 4, 76, 92, 6, '#c9c7bd', OL(1.6)) + RR(50, 12, 60, 40, 3, '#4a4d58', OL(1));
  s += R(56, 17, 48, 30, '#a8bc4a');
  // 像素方波
  for (let i = 0; i < 6; i++) {
    const hi = i % 2 === 0;
    s += R(58 + i * 7.5, hi ? 24 : 36, 7.5, 3, '#2a3a1a');
    s += R(58 + (i + 1) * 7.5 - 1.5, 24, 3, 15, '#2a3a1a');
  }
  s += R(58, 42, 4, 3, '#2a3a1a') + R(64, 42, 4, 3, '#2a3a1a');
  s += R(54, 64, 18, 6, '#2a2a30') + R(60, 58, 6, 18, '#2a2a30');
  s += Ci(96, 70, 5, '#a02a4a', OL(1)) + Ci(108, 64, 5, '#a02a4a', OL(1));
  s += RR(68, 84, 10, 3, 1.5, '#7a7a80') + RR(82, 84, 10, 3, 1.5, '#7a7a80');
  return s;
}
// 波形大圖示（給純主奏用）
function waveIcon(kind, o = {}) {
  let s = RR(10, 14, 140, 72, 8, o.bg || '#20242c', OL(1.6, o.edge || '#4a5262'));
  for (let i = 1; i < 6; i++) s += L(10 + i * 23.3, 18, 10 + i * 23.3, 82, '#2e3440', 1);
  for (let i = 1; i < 4; i++) s += L(14, 14 + i * 18, 146, 14 + i * 18, '#2e3440', 1);
  s += wave(kind, 22, 50, 116, 44, o.c || C.screen, 3.2);
  if (o.badge) s += badge(o.badge, o.badgeC || C.gold, C.ol, 132, 24);
  if (o.extra) s += o.extra;
  return s;
}

// ══ Pad：層疊柔和的波浪＋代表名稱的小圖案 ════════════════════════════
function pad(c, motif) {
  return RR(4, 6, 152, 88, 10, c[0], OL(1.4, '#3a3e48')) +
    `<g clip-path="none">${softWaves(c[1], c[2], c[3])}</g>` + (motif || '');
}
const PADC = {
  warm: ['#3a1c14', '#f0a060', '#e0703a', '#b8422a'],
  cold: ['#142034', '#7ac8f0', '#4a90d0', '#2a5aa0'],
  dark: ['#0e0c18', '#4a3a7a', '#332a5a', '#1e1838'],
  green: ['#10241e', '#7ae0b0', '#3aa880', '#1e6a50'],
  pink: ['#2a1426', '#f0a0d0', '#c060a0', '#80306a'],
  gold: ['#2a2010', '#f4d47a', '#d8a83a', '#9a7020'],
  grey: ['#1c1e22', '#a0a6b0', '#70767f', '#4a4f57'],
  violet: ['#1c1430', '#b8a0f0', '#7a60d0', '#4a3a90'],
};

// ══ 音效 ═══════════════════════════════════════════════════════
function fxFrame(c, inner) {
  return RR(4, 6, 152, 88, 10, c, OL(1.4, '#3a3e48')) + inner;
}
// 心電圖
function ecg(c = '#ff4a5a') {
  return PL('10,56 44,56 52,56 58,38 64,72 70,22 78,82 84,56 110,56 116,48 122,56 150,56', c, 3);
}

// ══ 人聲 ═══════════════════════════════════════════════════════
// 歌者上半身（剪影＋張口）
function singer(x, y, s = 1, o = {}) {
  const c = o.c || '#e8b894', robe = o.robe || '#7a2a3a';
  let g = Pa('M-20 40 C-20 18 -12 12 0 12 C12 12 20 18 20 40 Z', robe, OL(1.4));
  if (o.collar !== false) g += Po('-8,14 0,24 8,14', C.ivory, OL(0.8));
  g += Ci(0, 0, 11, c, OL(1.4));
  g += Pa('M-11 -2 C-12 -14 12 -14 11 -2 C8 -8 -8 -8 -11 -2 Z', o.hair || '#3a2414');
  const mouth = o.mouth || 'o';
  if (mouth === 'o') g += E(0, 5, 2.4, 3, '#5a1a20');
  else if (mouth === 'a') g += E(0, 5, 3.6, 3.4, '#5a1a20');
  else g += L(-3, 5, 3, 5, '#5a1a20', 1.4);
  g += Ci(-4, -1, 1.1, C.ol) + Ci(4, -1, 1.1, C.ol);
  return G(`translate(${x} ${y}) scale(${s})`, g);
}
function choir(o = {}) {
  let s = '';
  const back = o.back || [[34, 30], [62, 26], [90, 26], [118, 30]];
  const front = o.front || [[20, 54], [48, 50], [80, 48], [112, 50], [140, 54]];
  for (const [x, y] of back) s += singer(x, y, 0.92, { robe: o.robe2 || '#4a2a5a', mouth: o.mouth, hair: o.hair });
  for (const [x, y] of front) s += singer(x, y, 1, { robe: o.robe || '#7a2a3a', mouth: o.mouth, hair: o.hair });
  return s;
}

// ══ 鼓 ════════════════════════════════════════════════════════
function acousticKit(o = {}) {
  let s = '';
  // 大鼓
  s += Ci(80, 70, 24, o.shell || '#b8322a', OL(1.6)) + Ci(80, 70, 19, C.skin, OL(1)) + Ci(80, 70, 6, o.shell || '#b8322a', { opacity: 0.6 });
  // 中鼓兩顆
  s += E(64, 40, 11, 8, o.shell || '#b8322a', OL(1.4)) + E(64, 37, 11, 4.5, C.skin, OL(1));
  s += E(96, 40, 11, 8, o.shell || '#b8322a', OL(1.4)) + E(96, 37, 11, 4.5, C.skin, OL(1));
  // 小鼓
  s += R(28, 58, 24, 10, C.silver, OL(1.4)) + E(40, 58, 12, 4, C.skin, OL(1)) + L(40, 68, 38, 94, C.silverD, 1.6);
  // 落地鼓
  s += R(108, 60, 26, 26, o.shell || '#b8322a', OL(1.4)) + E(121, 60, 13, 4.5, C.skin, OL(1)) + L(110, 86, 108, 96, C.silverD, 1.6) + L(132, 86, 134, 96, C.silverD, 1.6);
  // 腳踏鈸、碎音鈸
  s += L(16, 40, 16, 94, C.silverD, 1.6) + E(16, 40, 13, 2.6, C.brass, OL(1.1)) + E(16, 44, 13, 2.6, C.brass, OL(1.1));
  s += L(136, 22, 140, 94, C.silverD, 1.6) + E(136, 22, 18, 3.4, C.brass, OL(1.2), {}).replace('/>', ' transform="rotate(-10 136 22)"/>');
  s += L(40, 18, 46, 40, C.silverD, 1.4) + E(40, 18, 15, 3, C.brass, OL(1.2), {}).replace('/>', ' transform="rotate(8 40 18)"/>');
  // 鼓棒
  s += L(56, 4, 76, 30, C.woodL, 2.2) + L(104, 4, 86, 30, C.woodL, 2.2);
  return s;
}
// 鼓機：o.c 面板色、o.step 16 步鍵顏色、o.pads 方形打擊墊
function drumMachine(o = {}) {
  let s = RR(8, 16, 144, 70, 3, o.c || '#d8d4c8', OL(1.6));
  s += R(8, 16, 144, 10, o.strip || '#3a3d44');
  for (let i = 0; i < (o.screen ? 6 : 9); i++) s += Ci(18 + i * 15, 38, 4.2, o.knob || C.black, OL(0.9)) + L(18 + i * 15, 38, 20 + i * 15, 34.6, C.silverL, 1);
  // 16 步鍵（每四顆換色）
  const cols = o.step || ['#e04a2a', '#f08a2a', '#f0d03a', '#f4f0e0'];
  for (let i = 0; i < 16; i++) s += RR(12 + i * 8.6, 62, 6.8, 12, 1.2, cols[Math.floor(i / 4)], OL(0.8));
  for (let i = 0; i < 16; i += 3) s += Ci(15.4 + i * 8.6, 56, 1.4, C.led);
  if (o.screen) s += RR(110, 30, 36, 16, 2, '#0c1612', OL(1)) + T(128, 42, o.screen, C.led, 10);
  return s;
}

// ══ 其他小零件 ═══════════════════════════════════════════════════
// 喇叭單體（低頻貝斯）
function speaker(o = {}) {
  let s = RR(30, 6, 100, 88, 6, '#26262a', OL(1.6));
  s += Ci(80, 54, 34, '#3a3a40', OL(1.4)) + Ci(80, 54, 27, '#1a1a1e', OL(1)) + Ci(80, 54, 10, '#4a4a52', OL(1.2));
  s += Ci(80, 16, 5, '#3a3a40', OL(1)) + Ci(80, 16, 2, '#1a1a1e');
  for (const r of [42, 50]) s += SP(`M${80 + r * 0.6} ${54 - r * 0.8} A${r} ${r} 0 0 1 ${80 + r * 0.6} ${54 + r * 0.8}`, o.c || C.screen, 2, { opacity: r === 42 ? 0.9 : 0.5 });
  if (o.badge) s += badge(o.badge, o.badgeC || C.led, C.ol, 46, 16);
  return s;
}
// 取樣機：4×4 打擊墊
function sampler(o = {}) {
  let s = RR(14, 8, 132, 84, 4, '#3a3d44', OL(1.6)) + RR(22, 14, 50, 18, 2, '#0c1612', OL(1)) + wave('noise', 26, 23, 42, 10, C.screen, 1.6);
  for (let i = 0; i < 4; i++) s += Ci(86 + i * 14, 23, 4.4, C.black, OL(0.9));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += RR(24 + c * 19, 38 + r * 13, 16, 11, 2, (r + c) % 5 === 0 ? '#f08a2a' : '#9a9ea8', OL(0.9));
  if (o.extra) s += o.extra;
  return s;
}
// 往右上的箭頭
function arrow(x1, y1, x2, y2, c, w = 4) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = w * 3;
  return L(x1, y1, x2 - Math.cos(a) * h * 0.6, y2 - Math.sin(a) * h * 0.6, c, w) +
    Po(`${x2},${y2} ${x2 - Math.cos(a - 0.5) * h},${y2 - Math.sin(a - 0.5) * h} ${x2 - Math.cos(a + 0.5) * h},${y2 - Math.sin(a + 0.5) * h}`, c);
}
function burst(x, y, r1, r2, n, c, o = {}) {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2, r = i % 2 ? r2 : r1;
    p.push(`${f1(x + Math.cos(a) * r)},${f1(y + Math.sin(a) * r)}`);
  }
  return Po(p.join(' '), c, o);
}
function planet(x, y, r, c = '#e0a05a') {
  return Ci(x, y, r, c, OL(1.4)) + SP(`M${x - r * 1.7} ${y + r * 0.3} Q${x} ${y + r * 0.9} ${x + r * 1.7} ${y - r * 0.3}`, '#f4e0b0', 2.4) +
    E(x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.2, '#ffffff', { opacity: 0.25 });
}
function stars(list, c = '#fff6c8') { return list.map(([x, y, r]) => sparkle(x, y, r, c)).join(''); }
function heart(x, y, s, c = '#ff4a5a') {
  return G(`translate(${x} ${y}) scale(${s})`, Pa('M0 6 C-10 -2 -10 -10 -4 -10 C-1 -10 0 -7 0 -6 C0 -7 1 -10 4 -10 C10 -10 10 -2 0 6 Z', c, OL(0.8)));
}
function drop(x, y, s, c = '#6ac8f0') {
  return G(`translate(${x} ${y}) scale(${s})`, Pa('M0 -14 C6 -4 9 0 9 5 A9 9 0 0 1 -9 5 C-9 0 -6 -4 0 -14 Z', c, OL(1)) + E(-3, 4, 2, 3, '#e6f8ff', { opacity: 0.8 }));
}
function swirl(c, w = 2.4) {
  return SP('M14 36 C50 24 80 44 110 32 C130 24 140 30 132 40 C126 46 116 40 120 34', c, w) +
    SP('M20 58 C56 48 90 66 124 54 C144 48 150 58 142 64', c, w) + SP('M30 78 C60 70 90 84 118 76', c, w, { opacity: 0.6 });
}
function film() {
  let s = R(20, 26, 120, 48, '#1a1a1e', OL(1.4));
  for (let i = 0; i < 12; i++) s += R(24 + i * 10, 29, 5, 4, '#e8e0d0') + R(24 + i * 10, 67, 5, 4, '#e8e0d0');
  for (let i = 0; i < 3; i++) s += R(28 + i * 36, 36, 32, 28, '#4a6a8a', OL(0.8));
  return s;
}
function mountain(c1 = '#5a4a8a', c2 = '#8a7ac0') {
  return Po('4,94 46,38 70,64 98,26 156,94', c1, OL(1.2)) + Po('86,44 98,26 110,44 104,40 98,46 92,40', '#f4f0ff');
}
// 把一張圖縮小放到指定位置（變化標記用）
const mini = (x, y, k, svg) => G(`translate(${x} ${y}) scale(${k})`, svg);
// 提琴：可選擇不畫弓、畫震音／斷奏記號
function violinV(o = {}) {
  const sc = o.scale || 1;
  let s = G(`translate(74 46) rotate(-14) scale(${sc})`, fiddle({ wood: o.wood, mute: o.mute }));
  if (o.bow !== false) s += G(`translate(18 84) rotate(-8)`, bow(124));
  if (o.pizz) s += Pa('M26 74 C32 64 44 64 48 72 L46 82 C40 86 30 84 26 74 Z', C.hand, OL(1.2)) + SP('M48 70 Q56 64 60 56', C.hand, 3);
  return s;
}
const zig = (x, y, w, c = '#ffd23a') => PL(range(9).map(i => `${x + i * w / 8},${y + (i % 2 ? -5 : 5)}`).join(' '), c, 2.2);

// ══ 音色 id → 畫法 ═══════════════════════════════════════════════
const SALMON = '#e8706a';
const ART = {
  // 鋼琴
  'pno.grand': () => grandPiano(),
  'pno.concert': () => grandPiano() + Po('118,0 142,0 160,56 100,56', '#fff6c8', { opacity: 0.18 }) + stars([[148, 12, 5]]),
  'pno.bright': () => grandPiano({ board: '#e0b060' }) + stars([[138, 16, 7], [122, 8, 4], [152, 30, 3.5]]),
  'pno.upright': () => uprightPiano(),
  'pno.felt': () => uprightPiano({ c: '#2a2a2e', panel: '#3a3a40' }) + R(26, 56, 108, 5, '#c85a3a', OL(1)) + L(30, 58.5, 130, 58.5, '#e88a5a', 1, { 'stroke-dasharray': '2 2' }),
  'pno.honky': () => uprightPiano({ candle: true, c: '#6a3a1a', panel: '#8a5428' }) + G('rotate(-12 140 20)', note(140, 26, 1, C.gold)) + G('rotate(14 18 30)', note(16, 30, 0.9, C.gold)),
  'pno.lofi': () => uprightPiano({ c: '#4a3a30' }) + cassette(130, 82, 1),
  'pno.toy': () => toyPiano(),
  'pno.crystal': () => grandPiano({ c: '#8ec8e0', board: '#d8f0fa' }) + stars([[140, 14, 6, ], [24, 92, 4]], '#ffffff'),
  'pno.fm': () => stageKeys({ y0: 30, h: 46, lid: 18, top: '#3a2e28' }) + RR(20, 35, 46, 12, 2, '#0c1612') + wave('fm', 24, 41, 38, 8, C.screen, 1.6) + badge('FM', '#5ac8fa'),
  'pno.pad': () => G('translate(0 6) scale(0.9)', grandPiano()) + G('translate(98 4) rotate(30) scale(0.55)', fiddle({})),
  'pno.prep': () => grandPiano() + [52, 64, 76, 88, 100].map((x, i) => Ci(x, 33 + i * 5.6, 2.2, C.silverL, OL(0.9))).join('') + R(96, 58, 4, 8, '#e04a2a', OL(0.8)) + R(70, 54, 8, 3, '#f0d03a', OL(0.8)),
  // 電鋼琴
  'ep.rhodes': () => rhodes(),
  'ep.rhodes79': () => rhodes({ case: '#3a2a22' }) + badge('79', C.silverL),
  'ep.bright': () => rhodes() + stars([[140, 16, 7], [124, 8, 4]]),
  'ep.wurli': () => wurli(),
  'ep.wurli2': () => wurli({ c: '#c8423a' }) + bolt(142, 14, 1.1),
  'ep.dx': () => stageKeys({ y0: 26, h: 50, lid: 20, top: '#4a3a32', case: '#3a2e28' }) + RR(18, 31, 40, 10, 1.5, '#1a3a2a') + wave('fm', 21, 36, 34, 6, C.screen, 1.4) +
    range(8).map(i => RR(66 + i * 9.6, 32, 7, 8, 1, i % 2 ? '#5ac8a0' : '#e88a6a', OL(0.6))).join(''),
  'ep.tine': () => stageKeys({ y0: 44, h: 36, lid: 6, top: C.black, legs: true }) + R(10, 18, 140, 26, '#1e1e22', OL(1.4)) +
    range(22).map(i => L(16 + i * 6.2, 22, 16 + i * 6.2, 40 - (i % 3) * 3, C.silverL, 1.4)).join('') + R(12, 36, 136, 4, C.gold, OL(0.7)),
  'ep.bell': () => rhodes() + bellIcon(138, 16, 1.1, C.gold),
  'ep.soft': () => stageKeys({ y0: 28, h: 48, lid: 18, top: '#4a3e5a', case: '#3a3248' }) + RR(20, 33, 46, 12, 2, '#0c1612') + wave('sin', 24, 39, 38, 8, '#b8a0f0', 1.6) + GO(0.8, Ci(130, 38, 8, '#e8d8ff')),
  'ep.bark': () => rhodes() + PL('122,8 128,18 134,6 140,20 146,4 152,18', '#ff8a3a', 2.6),
  'ep.phase': () => rhodes() + Ci(138, 18, 10, 'none', { stroke: '#5ac8fa', 'stroke-width': 2 }) + Ci(138, 18, 5, 'none', { stroke: '#b8a0f0', 'stroke-width': 2 }) + arrow(130, 8, 146, 10, '#5ac8fa', 1.8),
  'ep.clav': () => clavinet(),
  'ep.clavfunk': () => clavinet({ c: '#3a2a1e' }) + note(144, 18, 1, C.gold) + note(130, 12, 0.7, C.gold),
  'ep.harpsi': () => harpsichord(),
  'ep.harpsi8': () => harpsichord() + badge('8′', C.ivory),
  'ep.celesta': () => celesta(),
  'ep.toy': () => stageKeys({ y0: 34, h: 40, lid: 14, top: '#f07b5a', case: '#e0503a', nkeys: 14, legs: false }) + Ci(30, 41, 4, '#ffd23a', OL(0.8)) + Ci(42, 41, 4, '#5ac8fa', OL(0.8)) + Ci(54, 41, 4, '#7ae0a0', OL(0.8)),
  'ep.choir': () => G('translate(0 8)', rhodes()) + singer(136, 14, 0.62, { robe: '#7a2a3a', mouth: 'a' }),
  // 風琴
  'org.tonewheel': () => tonewheel(),
  'org.jazz': () => tonewheel({ wood: '#5a3018' }) + note(144, 18, 1.1, C.gold),
  'org.rock': () => tonewheel({ wood: '#2a2a2e' }) + bolt(144, 18, 1.2),
  'org.gospel': () => tonewheel({ wood: '#8a5428' }) + G('translate(134 6)', Pa('M4 22 L2 6 Q4 2 6 6 L7 14 L8 4 Q10 0 12 4 L12 22 Z', C.hand, OL(1))) + stars([[152, 8, 4]]),
  'org.church': () => pipeOrgan(),
  'org.pipeflute': () => pipeOrgan({ flue: true, c: '#c8954c' }),
  'org.full': () => pipeOrgan({ full: true, c: '#e0c060' }),
  'org.reed': () => reedOrgan({ pedals: false }),
  'org.pump': () => reedOrgan(),
  'org.accordion': () => accordion(),
  'org.musette': () => accordion({ c: '#2a5a9a', grille: true }),
  'org.harmonium': () => harmonium(),
  'org.perc': () => tonewheel({ wood: '#6a3a1a' }) + burst(144, 18, 11, 5, 8, '#ffd23a', OL(1)),
  'org.calliope': () => calliope(),
  // 打擊鍵盤
  'bel.glock': () => bars({ n: 14, bar: C.silver, hl: C.silverL, frame: '#3a3d44', mallet: '#f0e0c0' }),
  'bel.musicbox': () => musicBox(),
  'bel.tubular': () => tubular(),
  'bel.church': () => churchBell(),
  'bel.gong': () => gong(),
  'bel.chime': () => windChime(),
  'bel.steel': () => steelPan(),
  'bel.marimba': () => bars({ n: 11, bar: '#7a3a1e', hl: '#a85a32', frame: '#2a1a10', res: C.brass, legs: C.silverD, mallet: '#6a5aa0' }),
  'bel.xylo': () => bars({ n: 13, bar: '#d8a060', hl: '#f0c88a', frame: '#5a3018', legs: C.silverD, mallet: '#e8e0c8' }),
  'bel.vibes': () => bars({ n: 11, bar: '#b8bec8', hl: '#e8ecf2', frame: '#2a2a30', res: '#c8ccd4', motor: true, legs: C.silverD, mallet: '#3a5aa0' }),
  'bel.kalimba': () => kalimba(),
  'bel.handpan': () => handpan(),
  'bel.glass': () => glassHarmonica(),
  'bel.bellfm': () => waveIcon('fm', { c: '#ffd23a' }) + bellIcon(132, 30, 1.2, C.gold) + badge('FM', '#5ac8fa', C.ol, 28, 24),
  'bel.temple': () => templeBell(),
  'bel.agogo': () => agogo(),
  // 吉他
  'gtr.nylon': () => guitar({ nylon: true, top: '#e8c690', edge: '#8a4a22' }),
  'gtr.steel': () => guitar({ guard: '#2a1a12', burst: C.burst }),
  'gtr.twelve': () => guitar({ twelve: true, top: '#e8c690', guard: '#2a1a12' }),
  'gtr.jumbo': () => guitar({ jumbo: true, burst: '#3a1a0a', guard: '#2a1a12', top: '#e0a050' }),
  'gtr.electric': () => eguitar({ fin: '#3a7ac0', guard: C.ivory }),
  'gtr.jazz': () => jazzGuitar(),
  'gtr.mute': () => eguitar({ fin: '#e8d8b0', guard: '#2a2a2e' }) + Pa('M14 36 C10 50 14 64 24 66 L34 64 L34 36 C28 30 18 30 14 36 Z', C.hand, OL(1.2)),
  'gtr.funk': () => eguitar({ fin: '#e8d8b0', guard: '#c8423a' }) + note(146, 18, 1, C.gold) + note(132, 12, 0.7, C.gold),
  'gtr.dist': () => eguitar({ fin: '#1e1e22', hum: true, guard: '#2a2a2e', puc: '#c8ccd4', head: '#1e1e22' }) + bolt(146, 16, 1.2),
  'gtr.heavy': () => eguitar({ vshape: true, fin: '#1e1e22', hum: true, head: '#1e1e22', board: C.ebony, puc: '#c8ccd4' }) + bolt(146, 16, 1.2, '#ff5a3c'),
  'gtr.harm': () => guitar({ guard: '#2a1a12', burst: C.burst }) + sparkle(102, 38, 7) + sparkle(116, 32, 4),
  'gtr.banjo': () => banjo(),
  'gtr.mandolin': () => mandolin(),
  'gtr.ukulele': () => ukulele(),
  'gtr.harp': () => harp(),
  'gtr.dulcimer': () => dulcimer(),
  'gtr.reso': () => resoGuitar(),
  'gtr.lofi': () => guitar({ top: '#d8b880', edge: '#7a5a3a' }) + cassette(136, 82, 1),
  // 貝斯
  'bas.finger': () => eguitar({ bass: true, fin: '#c8422a', burst: '#3a1a0a', guard: '#2a1a12' }),
  'bas.pick': () => eguitar({ bass: true, fin: '#1e1e22', guard: C.ivory, head: '#1e1e22' }) + Pa('M140 6 Q152 6 152 14 Q150 22 144 26 Q136 20 136 12 Q136 6 140 6 Z', '#f0a03a', OL(1)),
  'bas.slap': () => eguitar({ bass: true, fin: '#3a9a6a', guard: C.ivory }) + burst(142, 16, 11, 5, 8, '#ffd23a', OL(1)),
  'bas.fretless': () => eguitar({ bass: true, fretless: true, fin: '#c8954c', guard: '#2a1a12', board: C.ebony }),
  'bas.sub': () => speaker({ c: '#7a6ae0' }),
  'bas.synth': () => synthBox({ wave: 'saw', screen: '#7ac8f0', badge: 'BASS', badgeC: '#7ac8f0' }),
  'bas.acid': () => box303(),
  'bas.fm': () => synthBox({ wave: 'fm', body: '#3a2e28', cheek: '#4a3a32', badge: 'FM', badgeC: '#5ac8fa' }),
  'bas.reese': () => waveIcon('detune', { c: '#7a9af0', bg: '#14182a' }),
  'bas.growl': () => waveIcon('sync', { c: '#ff6a3a', bg: '#2a1410' }) + Po('112,18 118,30 124,18 130,30 136,18 142,30 146,18', '#f4f0e0', OL(0.8)),
  'bas.upright': () => cello({ bass: true }),
  'bas.upright2': () => G('translate(62 54) rotate(-90) scale(1.3)', fiddle({ endpin: true, bass: true, wood: '#8a3e17' })) +
    Pa('M86 52 C92 44 104 44 108 52 L106 62 C100 66 90 64 86 52 Z', C.hand, OL(1.2)) + SP('M86 50 Q80 46 76 46', C.hand, 3),
  'bas.perc': () => eguitar({ bass: true, fin: '#e8d8b0', guard: '#2a2a2e' }) + burst(28, 50, 10, 4, 7, '#ffd23a', OL(1)),
  'bas.pluck': () => waveIcon('pluck', { c: '#7ae0b0', badge: 'BASS', badgeC: '#7ae0b0' }),
  'bas.dist': () => eguitar({ bass: true, fin: '#1e1e22', guard: '#c8423a', head: '#1e1e22' }) + bolt(146, 16, 1.2),
  'bas.moog': () => modular(),
  'bas.808': () => speaker({ c: '#f08a2a', badge: '808', badgeC: '#f08a2a' }),
  'bas.old': () => eguitar({ bass: true, fin: '#e8d0a0', burst: '#7a4a1a', guard: '#5a2a12', head: '#c98a4e' }) + cassette(136, 84, 0.8),
};

// 弦樂合奏：小提琴＋中提琴＋大提琴並排（前小後大）
function section(o = {}) {
  let s = G('translate(118 52) rotate(-90) scale(0.95)', fiddle({ endpin: true, wood: '#9a4218' }));
  s += G('translate(70 52) rotate(-78) scale(0.72)', fiddle({ wood: o.wood || '#b5531f' }));
  s += G('translate(32 56) rotate(-66) scale(0.62)', fiddle({ wood: '#c8682a' }));
  if (o.bows !== false) s += G('translate(10 92) rotate(-24)', bow(70)) + G('translate(84 96) rotate(-30)', bow(70));
  return s;
}
Object.assign(ART, {
  // 弦樂
  'str.ensemble': () => section(),
  'str.solo': () => violin(1.25),
  'str.viola': () => G('translate(74 46) rotate(-14) scale(1.42)', fiddle({ wood: '#8e3f16' })) + G('translate(16 90) rotate(-8)', bow(128)),
  'str.cello': () => cello(),
  'str.bass': () => cello({ bass: true }),
  'str.pizz': () => violinV({ scale: 1.25, bow: false, pizz: true }) + note(140, 18, 1, C.gold),
  'str.trem': () => section() + zig(112, 12, 40),
  'str.spicc': () => section() + [118, 132, 146].map(x => Ci(x, 12, 2.6, '#ffd23a') + L(x, 12, x, -0, C.ivory, 0)).join('') + SP('M114 20 L150 20', '#ffd23a', 1.6),
  'str.octave': () => section() + T(136, 18, '8va', '#ffd23a', 12),
  'str.pad': () => pad(PADC.warm, GO(0.9, section({ bows: false }))),
  'str.chamber': () => G('translate(100 52) rotate(-90) scale(0.95)', fiddle({ endpin: true, wood: '#9a4218' })) + G('translate(48 54) rotate(-72) scale(0.7)', fiddle({ wood: '#b5531f' })) +
    R(126, 64, 20, 3, C.woodD, OL(1)) + L(130, 67, 128, 94, C.woodD, 2) + L(142, 67, 144, 94, C.woodD, 2) + L(136, 30, 136, 64, C.silverD, 1.6) + Po('124,26 148,26 146,40 126,40', C.ivory, OL(1)),
  'str.sul': () => violin(1.25) + sparkle(56, 20, 7, '#c8f0ff') + sparkle(42, 30, 4, '#c8f0ff'),
  'str.epic': () => section({ wood: '#9a3a18' }) + Po('0,0 30,0 60,56 0,30', '#fff6c8', { opacity: 0.14 }) + burst(140, 16, 10, 5, 8, '#ffd23a', OL(1)),
  'str.trem2': () => violin(1.25) + zig(112, 12, 40),
  'str.choir': () => G('translate(-10 10) scale(0.85)', section({ bows: false })) + singer(136, 22, 0.75, { mouth: 'a' }),
  'str.mute': () => violinV({ scale: 1.25, mute: true }) + T(140, 18, 'con sord.', '#b8bec8', 8),
  // 木管與銅管
  'wnd.flute': () => flute(),
  'wnd.picc': () => flute({ x0: 30, x1: 130, h: 3.4, keys: 9, joints: [56, 110] }) + badge('PICC', C.silverL),
  'wnd.recorder': () => endFlute({ kind: 'recorder', body: '#d8a868', len: 140, h: 5, holes: [40, 52, 64, 76, 88, 100, 112] }),
  'wnd.pan': () => panflute(),
  'wnd.ocarina': () => ocarina(),
  'wnd.clarinet': () => reedPipe({ len: 140 }),
  'wnd.clarbass': () => bassClarinet(),
  'wnd.oboe': () => reedPipe({ kind: 'oboe', len: 136, h: 3.4, bell: 6.5, c: '#2a1a14' }),
  'wnd.bassoon': () => bassoon(),
  'wnd.saxalto': () => sax('alto'),
  'wnd.saxtenor': () => sax('tenor'),
  'wnd.saxbari': () => sax('bari'),
  'wnd.trumpet': () => trumpet(),
  'wnd.trombone': () => trombone(),
  'wnd.horn': () => frenchHorn(),
  'wnd.tuba': () => tuba(),
  'wnd.brass': () => G('translate(-8 18) scale(0.7)', trumpet()) + G('translate(56 -2) scale(0.62)', frenchHorn()) + G('translate(30 40) scale(0.62)', trombone()),
  'wnd.brasssoft': () => G('translate(-8 18) scale(0.7)', trumpet()) + G('translate(56 -2) scale(0.62)', frenchHorn()) + T(140, 92, 'p', '#b8bec8', 16, { 'font-style': 'italic', 'font-family': 'serif' }),
  'wnd.mute': () => trumpet({ mute: true }),
  'wnd.whistle': () => whistle(),
  'wnd.bagpipe': () => bagpipe(),
  'wnd.didgeridoo': () => didgeridoo(),
  'wnd.shaku': () => endFlute({ kind: 'shaku', len: 140, h: 5.6, body: '#c8a45a', node: '#8a6a2a', nodes: [36, 70, 104], holes: [56, 66, 76, 86] }),
  'wnd.harmonica': () => harmonica(),
  // 民族
  'eth.erhu': () => huqin(),
  'eth.gaohu': () => huqin({ round: true, small: true }),
  'eth.pipa': () => pipa(),
  'eth.guzheng': () => zither({ n: 21, wood: '#c8925a', side: '#5a2a12', tassel: true, deco: '#8a2a1a' }),
  'eth.dizi': () => dizi({ tassel: true }),
  'eth.suona': () => suona(),
  'eth.sheng': () => sheng(),
  'eth.yangqin': () => yangqin(),
  'eth.koto': () => zither({ n: 13, wood: '#d8ab70', side: '#3a2414', color: C.ivory, bridge: '#a8b070', side2: '#c8a040' }),
  'eth.shamisen': () => shamisen(),
  'eth.sitar': () => sitar(),
  'eth.sarod': () => sarod(),
  'eth.tanpura': () => tanpura(),
  'eth.oud': () => oud(),
  'eth.bouzouki': () => bouzouki(),
  'eth.balalaika': () => balalaika(),
  'eth.mbira': () => kalimba({ mbira: true }),
  'eth.gamelan': () => gamelan(),
  'eth.gayageum': () => zither({ n: 12, wood: '#d8b070', side: '#6a3a1a', end: 'ridge', color: '#e8d8b8' }),
  'eth.ney': () => endFlute({ len: 146, h: 4.4, body: '#c8a868', node: '#8a6a2a', nodes: [20, 40, 60, 80, 100, 120], holes: [70, 80, 90, 100, 110, 120], x: 8, y: 26, rot: 18 }) +
    G('translate(8 26) rotate(18)', R(-5, -5, 6, 10, C.silver, OL(1))),
  'eth.kaval': () => endFlute({ len: 146, h: 5, body: '#6a3a1a', hl: '#9a5a2a', bind: [8, 50, 96, 140], bindC: '#d8c8a0', holes: [60, 70, 80, 90, 100, 110, 120], x: 8, y: 26, rot: 18 }),
  'eth.bandoneon': () => bandoneon(),
  'eth.charango': () => charango(),
  'eth.steeldrum': () => steelPan({ body: '#e8c83a' }),
  // 人聲
  'cho.aah': () => choir({ mouth: 'a' }),
  'cho.ooh': () => choir({ mouth: 'o', robe: '#2a4a7a', robe2: '#1e3a5a' }),
  'cho.choir': () => choir({ mouth: 'a', back: [[22, 24], [48, 22], [74, 20], [100, 20], [126, 22], [150, 24]], front: [[10, 52], [36, 50], [62, 48], [88, 48], [114, 50], [140, 52]] }),
  'cho.doo': () => lips(56, 50, 2.2, 'o') + T(122, 58, 'doo', '#f4f0e0', 22),
  'cho.whisper': () => singer(44, 40, 1.6, { mouth: 'm' }) + GO(0.7, SP('M70 40 Q90 32 110 42 T150 38', '#c8e0f0', 2)) + GO(0.45, SP('M72 52 Q96 46 118 56 T152 52', '#c8e0f0', 2)) + GO(0.3, SP('M74 30 Q94 22 116 30', '#c8e0f0', 2)),
  'cho.vocal': () => singer(36, 38, 1.5, { mouth: 'a', robe: '#2a3a5a' }) + RR(72, 26, 80, 44, 4, '#0c1612', OL(1.2)) + range(14).map(i => R(78 + i * 5.2, 48 - ((i * 7) % 9) * 2, 3, 4 + ((i * 7) % 9) * 4, '#5ac8fa')).join(''),
  'cho.boys': () => choir({ mouth: 'o', robe: '#e8e8f0', robe2: '#c8323a', hair: '#8a5a2a' }),
  'cho.mm': () => lips(48, 50, 2.2, 'm') + T(116, 58, 'mmm', '#f4f0e0', 20) + note(140, 26, 0.9, C.gold),
  'cho.vowel': () => fxFrame('#14182a', ['A', 'E', 'I', 'O', 'U'].map((v, i) => T(22 + i * 29, 46, v, i % 2 ? '#5ac8fa' : '#b8a0f0', 20)).join('') + wave('sin', 16, 72, 128, 14, '#7ae0b0', 2)),
  'cho.pad': () => pad(PADC.pink, singer(80, 32, 1.2, { mouth: 'o', robe: '#80306a' })),
  // 主奏
  'led.saw': () => synthBox({ wave: 'saw' }),
  'led.supersaw': () => synthBox({ wave: 'super', screen: '#7ae0ff', badge: '×7', badgeC: '#7ae0ff' }),
  'led.square': () => synthBox({ wave: 'sqr', screen: '#ffd23a' }),
  'led.pulse': () => synthBox({ wave: 'pulse', screen: '#ffa04a' }),
  'led.303': () => box303({ accent: '#ff5a3c' }) + badge('ACID', '#c8f03a'),
  'led.fm': () => synthBox({ wave: 'fm', body: '#3a2e28', cheek: '#4a3a32', screen: '#5ac8fa', badge: 'FM', badgeC: '#5ac8fa' }),
  'led.chip': () => handheld(),
  'led.hoover': () => waveIcon('super', { c: '#c8a0ff', bg: '#1a1430' }) + Pa('M108 64 Q120 50 132 64 Q120 80 108 64 Z', 'none', { stroke: '#c8a0ff', 'stroke-width': 0 }) + SP('M100 80 L120 62 L140 80', '#ff6aa0', 2.4),
  'led.sync': () => waveIcon('sync', { c: '#ff8a3a' }),
  'led.detune': () => waveIcon('detune', { c: '#7ae0b0' }),
  'led.solo': () => synthBox({ wave: 'saw', body: '#2a2a30', knobs: ['#e04a2a', '#f0d03a', '#3a9ae0', C.silverD] }) + L(150, 60, 156, 30, C.silverD, 3) + Ci(156, 28, 3, C.black),
  'led.warm': () => synthBox({ wave: 'tri', screen: '#ffb070', cheek: '#9a5a2a' }),
  'led.bright': () => synthBox({ wave: 'saw', screen: '#fff6a0' }) + stars([[148, 12, 7], [134, 6, 4]]),
  'led.pluck': () => synthBox({ wave: 'pluck', screen: '#7ae0b0' }),
  'led.brass': () => synthBox({ wave: 'saw', screen: '#ffd23a' }) + G('translate(96 -10) scale(0.42)', trumpet()),
  'led.whistle': () => waveIcon('sin', { c: '#c8f0ff' }) + lips(132, 28, 0.8, 'w'),
  'led.bell': () => synthBox({ wave: 'fm', screen: '#ffd23a' }) + bellIcon(146, 12, 0.9, C.gold),
  'led.organ': () => synthBox({ wave: 'sqr', screen: '#7ae0b0' }) + range(5).map(i => R(118 + i * 6, 4, 3.6, 10 + (i % 3) * 3, ['#7a3a1a', C.ivory, C.black][i % 3], OL(0.6))).join(''),
  'led.tech': () => waveIcon('sqr', { c: '#5affd0', bg: '#0c1a1a' }) + range(5).map(i => Ci(26 + i * 8, 76, 2, i < 3 ? '#5affd0' : '#2a4a44')).join(''),
  'led.dark': () => synthBox({ wave: 'saw', body: '#151418', cheek: '#2a2a30', screen: '#a04aff' }) + moon(148, 14, 8),
  'led.flute': () => synthBox({ wave: 'sin', screen: '#c8f0ff' }) + G('translate(102 -32) scale(0.36)', flute()),
  'led.fifth': () => synthBox({ wave: 'saw' }) + badge('1+5', C.gold),
});

Object.assign(ART, {
  // Pad
  'pad.warm': () => pad(PADC.warm, Ci(80, 30, 12, '#ffd08a', { opacity: 0.9 }) + Ci(80, 30, 18, '#ffd08a', { opacity: 0.25 })),
  'pad.strings': () => pad(PADC.warm, G('translate(80 40) rotate(-60) scale(0.9) translate(-74 -46)', G('translate(74 46) rotate(-14)', fiddle({})))),
  'pad.glass': () => pad(PADC.cold, Pa('M64 14 L96 14 L92 40 Q80 48 68 40 Z', '#d8f4ff', { opacity: 0.55, stroke: '#ffffff', 'stroke-width': 1.6 }) + L(80, 46, 80, 62, '#ffffff', 1.6) + L(70, 62, 90, 62, '#ffffff', 1.8) + sparkle(102, 18, 5, '#ffffff')),
  'pad.choir': () => pad(PADC.violet, singer(56, 28, 0.9, { mouth: 'o', robe: '#4a3a90' }) + singer(80, 24, 0.9, { mouth: 'o', robe: '#4a3a90' }) + singer(104, 28, 0.9, { mouth: 'o', robe: '#4a3a90' })),
  'pad.dark': () => pad(PADC.dark, moon(84, 28, 13, '#c8c0f0') + stars([[40, 20, 3], [124, 18, 2.6], [110, 34, 2]], '#c8c0f0')),
  'pad.shimmer': () => pad(PADC.gold, stars([[52, 26, 9], [86, 18, 6], [110, 32, 10], [72, 40, 4], [130, 16, 4]], '#fff6c8')),
  'pad.evolve': () => pad(PADC.green, SP('M30 36 C50 10 76 10 80 30 C84 48 104 48 110 30 C114 18 128 16 134 26', '#e8fff4', 2.6) + arrow(122, 34, 140, 22, '#e8fff4', 2.4)),
  'pad.halo': () => pad(PADC.gold, E(80, 26, 30, 9, 'none', { stroke: '#fff6c8', 'stroke-width': 4 }) + E(80, 26, 30, 9, 'none', { stroke: '#ffffff', 'stroke-width': 1.4 }) + E(80, 26, 38, 13, '#fff6c8', { opacity: 0.18 })),
  'pad.analog': () => pad(PADC.warm, G('translate(40 8) scale(0.5)', synthBox({ wave: 'saw' }))),
  'pad.digi': () => pad(PADC.cold, range(28).map(i => R(28 + (i % 14) * 7.4, 14 + Math.floor(i / 14) * 8 + ((i * 5) % 3) * 4, 6, 6, i % 3 ? '#7ac8f0' : '#d8f4ff', { opacity: 0.85 })).join('')),
  'pad.drone': () => pad(PADC.grey, L(20, 26, 140, 26, '#e8ecf2', 4) + L(20, 34, 140, 34, '#e8ecf2', 1.4, { opacity: 0.6 }) + T(80, 20, '∞', '#e8ecf2', 16)),
  'pad.sweep': () => pad(PADC.violet, SP('M18 40 Q60 40 80 20 Q90 10 100 22 Q120 44 144 40', '#ffffff', 2.6) + arrow(24, 16, 136, 16, '#e8d8ff', 2.4)),
  'pad.wind': () => pad(PADC.cold, SP('M20 20 H96 C110 20 112 6 102 6 C94 6 94 14 98 16', '#e8f8ff', 3) + SP('M30 32 H120 C134 32 136 46 126 46 C118 46 118 38 122 36', '#e8f8ff', 3) + SP('M16 42 H70', '#e8f8ff', 3)),
  'pad.ice': () => pad(PADC.cold, snowflake(80, 28, 18, '#e8f8ff', 2.4) + snowflake(128, 20, 8, '#e8f8ff', 1.6) + snowflake(34, 24, 8, '#e8f8ff', 1.6)),
  'pad.soft': () => pad(PADC.pink, E(60, 26, 18, 10, '#ffffff', { opacity: 0.85 }) + E(80, 20, 18, 12, '#ffffff', { opacity: 0.85 }) + E(100, 26, 18, 10, '#ffffff', { opacity: 0.85 }) + R(52, 26, 56, 10, '#ffffff', { opacity: 0.85 })),
  'pad.big': () => pad(PADC.violet, mountain('#3a2a6a', '#6a5aa0')),
  'pad.motion': () => pad(PADC.green, Ci(80, 28, 16, 'none', { stroke: '#e8fff4', 'stroke-width': 2.6, 'stroke-dasharray': '8 5' }) + arrow(94, 18, 98, 26, '#e8fff4', 2.4) + Ci(80, 28, 4, '#e8fff4')),
  'pad.cinema': () => pad(PADC.dark, G('translate(16 -14) scale(0.8)', film())),
  'pad.vox': () => pad(PADC.pink, lips(80, 28, 1.5, 'a')),
  'pad.pulse': () => pad(PADC.warm, range(7).map(i => R(28 + i * 16, 30 - (i % 2 ? 14 : 6), 8, i % 2 ? 26 : 14, '#ffe0b0', { opacity: 0.9 })).join('')),
  'pad.noise': () => pad(PADC.grey, range(70).map(i => Ci(16 + (i * 37) % 128, 10 + (i * 53) % 38, 1 + (i % 3) * 0.6, '#e8ecf2', { opacity: 0.4 + (i % 4) * 0.15 })).join('')),
  'pad.space': () => pad(PADC.dark, planet(84, 28, 12) + stars([[34, 16, 3], [130, 14, 3.4], [116, 40, 2], [48, 38, 2]], '#ffffff')),
  // 音效
  'fx.riser': () => fxFrame('#1a1430', SP('M14 84 Q100 80 140 20', '#b8a0ff', 3) + arrow(120, 40, 142, 16, '#ff6aa0', 4) + range(5).map(i => L(30 + i * 20, 88, 30 + i * 20, 84 - i * 10, '#b8a0ff', 2, { opacity: 0.5 })).join('')),
  'fx.down': () => fxFrame('#101a2a', SP('M14 16 Q60 20 140 82', '#7ac8f0', 3) + arrow(118, 64, 144, 84, '#5affd0', 4)),
  'fx.impact': () => fxFrame('#2a1010', burst(80, 50, 38, 16, 12, '#ffb03a', OL(1.4)) + burst(80, 50, 22, 10, 10, '#fff6a0') + range(6).map(i => L(80 + Math.cos(i) * 42, 50 + Math.sin(i) * 36, 80 + Math.cos(i) * 52, 50 + Math.sin(i) * 42, '#ffb03a', 2.4)).join('')),
  'fx.laser': () => fxFrame('#0c1018', L(20, 78, 148, 22, '#ff3a5a', 7, { opacity: 0.4 }) + L(20, 78, 148, 22, '#ff8aa0', 3) + L(20, 78, 148, 22, '#ffffff', 1) + burst(148, 22, 10, 4, 6, '#ffffff') +
    Po('8,72 24,64 30,76 20,90', '#8a92a0', OL(1.2))),
  'fx.sweep': () => fxFrame('#18142a', SP('M14 70 Q46 70 60 40 Q70 18 80 40 Q94 70 146 70', '#c8a0ff', 3) + arrow(40, 86, 120, 86, '#ff6aa0', 2.4)),
  'fx.noise': () => fxFrame('#1c1e22', range(26).map(i => L(14 + i * 5, 50 - ((i * 37) % 17 + 6) * 1.6, 14 + i * 5, 50 + ((i * 53) % 17 + 6) * 1.6, '#c8ccd4', 2.6)).join('')),
  'fx.wind': () => fxFrame('#101e2a', SP('M14 32 H96 C114 32 116 14 102 14 C92 14 92 24 98 26', '#e8f8ff', 3.4) + SP('M24 52 H126 C144 52 146 72 132 72 C122 72 122 62 128 60', '#e8f8ff', 3.4) + SP('M12 70 H82', '#e8f8ff', 3.4) + GO(0.6, SP('M20 84 H60', '#e8f8ff', 2.4))),
  'fx.sci': () => fxFrame('#0c1018', E(80, 52, 48, 12, '#8a92a0', OL(1.4)) + Pa('M56 48 Q60 26 80 24 Q100 26 104 48 Z', '#7ae0ff', { opacity: 0.6, stroke: '#e8f8ff', 'stroke-width': 1.4 }) +
    range(5).map(i => Ci(48 + i * 16, 54, 2.4, i % 2 ? '#ffd23a' : '#5affd0')).join('') + Po('70,64 90,64 104,94 56,94', '#5affd0', { opacity: 0.25 })),
  'fx.bell': () => fxFrame('#1a1810', bellIcon(80, 46, 2.6, C.gold) + range(3).map(i => SP(`M${108 + i * 9} ${30 - i * 2} Q${114 + i * 9} 46 ${108 + i * 9} ${62 + i * 2}`, '#fff6a0', 2, { opacity: 0.8 - i * 0.2 })).join('')),
  'fx.drop': () => fxFrame('#0c1a2a', drop(80, 36, 1.6) + E(80, 78, 30, 6, 'none', { stroke: '#6ac8f0', 'stroke-width': 2 }) + E(80, 78, 46, 10, 'none', { stroke: '#6ac8f0', 'stroke-width': 1.6, opacity: 0.6 })),
  'fx.reverse': () => fxFrame('#1a1430', GO(0.9, wave('pluck', 30, 50, 100, 40, '#b8a0ff', 2.6).replace(/points="([^"]+)"/, (m, p) => `points="${p.split(' ').map(q => { const [x, y] = q.split(','); return `${f1(160 - x)},${y}`; }).join(' ')}"`)) + arrow(120, 84, 40, 84, '#ff6aa0', 3)),
  'fx.metal': () => fxFrame('#1c1e22', Po('40,20 120,30 112,80 30,70', C.silver, OL(1.6)) + L(50, 30, 104, 38, C.silverL, 2) + range(4).map(i => Ci(42 + (i % 2) * 64, 28 + Math.floor(i / 2) * 42, 2.4, C.silverD, OL(0.8))).join('') + burst(118, 26, 12, 5, 8, '#fff6a0')),
  'fx.heart': () => fxFrame('#1a0e12', ecg() + heart(124, 30, 1.6)),
  'fx.space': () => fxFrame('#0a0c18', planet(60, 50, 18, '#7a9af0') + Ci(120, 28, 6, '#e0a05a', OL(1)) + stars([[24, 20, 3.4], [140, 70, 3], [100, 80, 2.4], [130, 50, 2]], '#ffffff')),
  // 鼓
  'drm.ac': () => acousticKit(),
  'drm.808': () => drumMachine({ screen: '808' }),
  'drm.909': () => drumMachine({ c: '#b8bcc4', strip: '#e04a2a', step: ['#f4f0e0', '#f4f0e0', '#f4f0e0', '#f4f0e0'], knob: '#3a3d44', screen: '909' }),
  'drm.lofi': () => sampler({ extra: cassette(126, 80, 0.8) }),
});

// 不在表裡的 id 用通用圖：鍵盤＋音符
function fallback() {
  return stageKeys({ y0: 40, h: 40, lid: 10 }) + note(80, 30, 1.4, C.gold);
}
export function hasArt(id) { return Object.prototype.hasOwnProperty.call(ART, id); }
export function zyArt(id) {
  const f = ART[id];
  let body;
  try { body = f ? f() : fallback(); } catch (e) { console.error("zyArt", id, e); body = fallback(); }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" role="img" aria-hidden="true">${body}</svg>`;
}
