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

// ── 漸層（每次呼叫 zyArt 都重新編號，id 全頁唯一）────────────────
// 同一張圖裡相同參數的漸層只產生一次；不同張圖用遞增計數器區分
let DEFS = [], GCACHE = new Map(), UID = 0;
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
// 混色：t=0 原色、t=1 目標色
function mix(c, to, t) {
  const a = hex(c), b = hex(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const lit = (c, t = 0.3) => mix(c, '#ffffff', t);
const dim = (c, t = 0.3) => mix(c, '#000000', t);
// stops：[[位置0–1, 顏色, 不透明度?], …]；dir：[x1,y1,x2,y2]（0–1，物件外框座標）
function grad(stops, dir = [0, 0, 0, 1], radial = false) {
  const key = (radial ? 'r' : 'l') + dir.join(',') + stops.map(s => s.join(':')).join('|');
  if (GCACHE.has(key)) return GCACHE.get(key);
  const id = 'zg' + (++UID).toString(36);
  const st = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
  DEFS.push(radial
    ? `<radialGradient id="${id}" cx="${dir[0]}" cy="${dir[1]}" r="${dir[2]}" fx="${dir[0]}" fy="${dir[1]}">${st}</radialGradient>`
    : `<linearGradient id="${id}" x1="${dir[0]}" y1="${dir[1]}" x2="${dir[2]}" y2="${dir[3]}">${st}</linearGradient>`);
  const url = `url(#${id})`;
  GCACHE.set(key, url);
  return url;
}
// 圓柱／曲面明暗：亮面→本色→暗面（v 上下、h 左右）
function shV(c, k = 1) { return grad([[0, lit(c, 0.32 * k)], [0.45, c], [1, dim(c, 0.38 * k)]]); }
function shH(c, k = 1) { return grad([[0, lit(c, 0.3 * k)], [0.5, c], [1, dim(c, 0.4 * k)]], [0, 0, 1, 0]); }
// 金屬管：兩側暗、中偏上有一條亮帶
function tubeV(c) { return grad([[0, dim(c, 0.35)], [0.3, lit(c, 0.45)], [0.55, c], [1, dim(c, 0.45)]]); }
function tubeH(c) { return grad([[0, dim(c, 0.35)], [0.3, lit(c, 0.45)], [0.55, c], [1, dim(c, 0.45)]], [0, 0, 1, 0]); }
// 球面：左上亮點
function shR(c, k = 1) { return grad([[0, lit(c, 0.45 * k)], [0.55, c], [1, dim(c, 0.4 * k)]], [0.35, 0.3, 0.75], true); }
// 面板（木面板中央亮、邊緣暗，像日落色漸層）
function burstR(c, edge) { return grad([[0, lit(c, 0.18)], [0.55, c], [0.85, mix(c, edge, 0.6)], [1, edge]], [0.5, 0.5, 0.6], true); }
// 木紋：在指定區域畫幾條低對比的弧線
function grain(x, y, w, h, c, n = 5, op = 0.25) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const yy = y + (h * (i + 0.5)) / n, a = ((i * 37) % 7) - 3;
    s += SP(`M${x} ${yy} C${x + w * 0.3} ${yy + a} ${x + w * 0.6} ${yy - a} ${x + w} ${yy + a * 0.5}`, c, 0.5, { opacity: op });
  }
  return s;
}

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
// 自動材質：凡是帶「標準輪廓」（OL 預設黑邊）且是純色填色的形狀，自動換成同色系的
// 亮面→暗面漸層，輪廓改成填色的深色版，讓整張圖有 2～3 階明暗而不是卡通黑邊。
// 形狀若要保持平塗，傳 flat: true。
let AUTO = true;
function el(tag, a) {
  if (a.flat) { a = { ...a }; delete a.flat; }
  else if (AUTO && a.stroke === C.ol && typeof a.fill === 'string' && /^#[0-9a-f]{6}$/i.test(a.fill)) {
    const c = a.fill;
    a = { ...a, stroke: dim(c, 0.62) };
    if (tag === 'circle' || tag === 'ellipse') a.fill = shR(c, 0.8);
    else if (tag === 'rect' && +a.height > +a.width * 1.6) a.fill = shH(c, 0.8);
    else if (tag === 'rect') a.fill = shV(c, 0.8);
    else a.fill = grad([[0, lit(c, 0.22)], [0.5, c], [1, dim(c, 0.3)]], [0.1, 0, 0.6, 1]);
  }
  return `<${tag}${at(a)}/>`;
}
const OL = (w = 1.5, c = C.ol) => ({ stroke: c, 'stroke-width': w, 'stroke-linejoin': 'round' });
const R = (x, y, w, h, fill, o) => el('rect', { x, y, width: w, height: h, fill, ...o });
const RR = (x, y, w, h, r, fill, o) => el('rect', { x, y, width: w, height: h, rx: r, fill, ...o });
const E = (cx, cy, rx, ry, fill, o) => el('ellipse', { cx, cy, rx, ry, fill, ...o });
const Ci = (cx, cy, r, fill, o) => el('circle', { cx, cy, r, fill, ...o });
const Pa = (d, fill, o) => el('path', { d, fill, ...o });
const Po = (pts, fill, o) => el('polygon', { points: pts, fill, ...o });
const PL = (pts, stroke, w = 1.5, o) => el('polyline', { points: pts, fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...o });
// 線段；筆觸若是漸層（url），水平／垂直線的外框高度為 0 會畫不出來，改成旋轉過的細長矩形
function L(x1, y1, x2, y2, stroke, w = 1.5, o) {
  if (typeof stroke === 'string' && stroke.startsWith('url(')) {
    const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 57.2958;
    return `<rect${at({ x: 0, y: -w / 2, width: len, height: w, rx: w / 2, fill: stroke, transform: `translate(${f1(x1)} ${f1(y1)}) rotate(${f1(ang)})`, ...(o || {}) })}/>`;
  }
  return el('line', { x1, y1, x2, y2, stroke, 'stroke-width': w, 'stroke-linecap': 'round', ...o });
}
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
  let s = R(x, y, w, h, dim(wc, 0.45), { flat: true });
  s += R(x, y, w, h - Math.min(1.6, h * 0.1), grad([[0, dim(wc, 0.08)], [0.7, wc], [1, lit(wc, 0.4)]]), { flat: true });
  for (let i = 1; i < n; i++) s += L(x + i * kw, y, x + i * kw, y + h, dim(wc, 0.5), Math.min(0.5, kw * 0.12), { 'stroke-linecap': 'butt' });
  for (let i = 0; i < n - 1; i++) {
    const p = (i + (o.start || 0)) % 7;
    if (p === 2 || p === 6) continue;
    const bx = x + (i + 1) * kw - kw * 0.31, bw = kw * 0.62, bh = h * (o.bh || 0.6);
    s += R(bx + 0.3, y, bw, bh + 0.5, '#000000', { flat: true, opacity: 0.4 });
    s += R(bx, y, bw, bh, grad([[0, lit(bc, 0.12)], [0.75, bc], [1, lit(bc, 0.35)]]), { flat: true });
    s += R(bx + bw * 0.2, y + bh * 0.1, bw * 0.25, bh * 0.75, '#ffffff', { flat: true, opacity: 0.12 });
  }
  if (o.felt !== false) s += R(x, y - 0.8, w, 0.8, '#8a1e1e', { flat: true });
  return s + R(x, y, w, h, 'none', { stroke: '#000000', 'stroke-width': 0.6 });
}

// ── 小圖示（變化標記）────────────────────────────────────
// 右上角徽章
function badge(txt, bg = C.gold, fg = C.ol, x = 140, y = 11) {
  const w = Math.max(16, txt.length * 6.2 + 6);
  return RR(x - w / 2, y - 6.4, w, 14, 3, '#000000', { flat: true, opacity: 0.45 }) + RR(x - w / 2, y - 7, w, 14, 3, grad([[0, lit(bg, 0.35)], [1, dim(bg, 0.2)]]), OL(0.5, dim(bg, 0.5))) + T(x, y + 3.3, txt, fg, 9);
}
function cassette(x, y, s = 1) {
  let g = RR(-16, -10, 32, 20, 2, grad([[0, '#5a5e68'], [1, '#22242a']]), OL(0.5, '#0a0a0c'));
  g += R(-13, -8, 26, 7, grad([[0, '#f4e090'], [1, '#c8a840']]), { flat: true }) + L(-11, -5.6, 8, -5.6, '#6a5a20', 0.4) + L(-11, -3.4, 4, -3.4, '#6a5a20', 0.4);
  g += RR(-10, 0, 20, 7, 3, '#0a0a0c', { flat: true });
  for (const cx of [-5.5, 5.5]) g += Ci(cx, 3.5, 2.6, grad([[0, '#ffffff'], [1, '#8a909a']], [0.3, 0.2, 0.7, 1]), { flat: true }) + Ci(cx, 3.5, 1, '#0a0a0c', { flat: true });
  g += Po('-12,10 12,10 10,7.6 -10,7.6', '#3a3e46', { flat: true });
  return G(`translate(${x} ${y}) scale(${s})`, g);
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
  let s = Po(`${x0},${50 - w0} ${x1},${50 - w1} ${x1},${50 + w1} ${x0},${50 + w0}`, shV(fill, 0.9), OL(0.9, dim(fill, 0.6)));
  s += L(x0, 50 - w0 + 0.5, x1, 50 - w1 + 0.5, lit(fill, 0.35), 0.5, { opacity: 0.8 });
  const scale = x1 - o.bx;
  if (o.frets) {
    for (let k = 1; k <= o.frets; k++) {
      const x = x1 - scale * (1 - Math.pow(2, -k / 12));
      if (x < x0 + 1) break;
      const w = lerp(w1, w0, (x1 - x) / (x1 - x0));
      s += L(x, 50 - w, x, 50 + w, o.fc || '#d8dce2', o.fw || 0.8, { 'stroke-linecap': 'butt' });
      s += L(x + 0.5, 50 - w, x + 0.5, 50 + w, '#000000', 0.4, { opacity: 0.35, 'stroke-linecap': 'butt' });
    }
  }
  if (o.dots) for (const k of o.dots) {
    const x = x1 - scale * (1 - Math.pow(2, -(k - 0.5) / 12));
    if (x > x0) s += Ci(x, 50, 0.95, '#efe8d8', { flat: true });
  }
  s += R(x1 - 1.2, 50 - w1 - 0.2, 1.4, 2 * w1 + 0.4, o.nut || C.ivory, { flat: true });
  return s;
}
// 弦：從琴橋 (bx, ±hb) 拉到弦枕 (nx, ±hn)；pairs=true 時兩兩成對（複弦）
function strings(n, bx, nx, hb, hn, o = {}) {
  let s = '';
  const c = o.c || C.string, w = o.w || 0.7;
  for (let i = 0; i < n; i++) {
    let t = n === 1 ? 0.5 : i / (n - 1);
    if (o.pairs) {
      const g = Math.floor(i / 2), ng = n / 2, k = i % 2;
      t = (ng === 1 ? 0.5 : g / (ng - 1)) + (k ? 0.04 : -0.04);
      t = Math.min(1, Math.max(0, t));
    }
    const ww = o.pairs ? w : w * (1.25 - 0.5 * t);
    const y1 = 50 - hb + 2 * hb * t, y2 = 50 - hn + 2 * hn * t;
    s += L(bx, y1 + 0.6, nx, y2 + 0.6, '#000000', ww, { opacity: 0.25, 'stroke-linecap': 'butt' });
    s += L(bx, y1, nx, y2, c, ww, { 'stroke-linecap': 'butt' });
  }
  return s;
}
// 琴頭：paddle 平板（兩側弦鈕）、slot 古典鏤空、inline 一字排（電吉他／電貝斯）
function headstock(type, x, o = {}) {
  const fill = o.fill || C.rose, peg = o.peg || C.silver, n = o.n || 6;
  if (type === 'paddle' || type === 'slot') {
    let s = Pa(`M${x} 45 L${x + 20} 43 Q${x + 23} 50 ${x + 20} 57 L${x} 55 Z`, fill, OL(1.2));
    s += SP(`M${x + 1} 45.6 L${x + 19.6} 43.8`, lit(fill, 0.35), 0.6, { opacity: 0.7 });
    if (type === 'slot') {
      s += RR(x + 4, 46.3, 13, 2.4, 1, '#0c0a08', { flat: true }) + RR(x + 4, 51.3, 13, 2.4, 1, '#0c0a08', { flat: true });
      for (let i = 0; i < 3; i++) s += Ci(x + 6 + i * 4.5, 47.5, 0.8, C.ivory, { flat: true }) + Ci(x + 6 + i * 4.5, 52.5, 0.8, C.ivory, { flat: true });
    }
    const per = Math.ceil(n / 2);
    for (let i = 0; i < per; i++) {
      const px = x + 4 + (i * 13) / Math.max(1, per - 1);
      s += tuner(px, 43.6, true, peg) + tuner(px, 56.4, false, peg);
      if (type !== 'slot') s += Ci(px, 46 + 0.2, 0.7, '#d8dce2', { flat: true }) + Ci(px, 54, 0.7, '#d8dce2', { flat: true });
    }
    return s;
  }
  // inline
  let s = Pa(`M${x} 45.5 L${x + 4} 42 Q${x + 12} 37 ${x + 22} 35 Q${x + 28} 34.5 ${x + 27} 40 L${x + 22} 46 Q${x + 12} 52 ${x + 4} 54.5 L${x} 54.5 Z`, fill, OL(1.2));
  s += SP(`M${x + 4} 42.6 Q${x + 12} 38 ${x + 22} 36`, lit(fill, 0.4), 0.6, { opacity: 0.7 });
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), px = x + 5 + t * 18, py = 44.5 - t * 6.5;
    s += Ci(px, py, o.big ? 1.6 : 1.2, '#d8dce2', OL(0.4, '#5a606a'));
    s += RR(px - (o.big ? 1.7 : 1.4), py - (o.big ? 6.6 : 5.4), o.big ? 3.4 : 2.8, o.big ? 3.6 : 3, 1, peg, OL(0.5, dim(peg, 0.55)));
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
  // 側板厚度（往下偏移的暗色外形）＋面板＋包邊
  let s = G('translate(49 51.5)', Pa(body, dim(edge, 0.35), { flat: true }));
  s += G('translate(48 50)', Pa(body, edge, OL(1.2, dim(edge, 0.6))) + G('scale(0.95)', Pa(body, o.burst ? burstR(top, o.burst) : grad([[0, lit(top, 0.18)], [0.6, top], [1, dim(top, 0.18)]], [0.3, 0.3, 0.8], true))) +
    G('scale(0.965)', Pa(body, 'none', { stroke: '#f2e8d0', 'stroke-width': 0.6, opacity: 0.85 })));
  // 面板木紋（雲杉直紋沿弦方向）
  s += G('translate(48 50) scale(0.92)', range(7).map(i => L(-34, -14 + i * 4.7, 34, -14 + i * 4.7 + ((i * 7) % 3 - 1) * 0.4, dim(top, 0.25), 0.4, { opacity: 0.35 })).join(''));
  if (o.guard) s += Pa('M70 56 Q80 62 77 70 Q68 74 60 66 Z', o.guard, { opacity: 0.92 });
  s += rosette(62, 50, 7.4, o.ros || C.mapleD);
  s += acBridge(21, 41, 59, o.nylon ? C.rose : C.ebony, o.nylon ? 0 : 6);
  if (o.nylon) for (let i = 0; i < 6; i++) s += L(22, 42.5 + i * 3, 25, 42.5 + i * 3, '#f3e3c0', 0.6);
  s += fretboard(84, 136, 5.4, 4.6, o.board || C.rose, { frets: 19, bx: 27, dots: o.nylon ? null : [3, 5, 7, 9] });
  s += headstock(o.nylon ? 'slot' : 'paddle', 136, { fill: o.head || C.rose, n: o.twelve ? 12 : 6, peg: o.nylon ? C.ivory : C.silver });
  s += strings(o.twelve ? 12 : 6, 26, 137, 5, 3.8, { pairs: o.twelve, c: o.nylon ? '#f3e3c0' : '#e8e4dc', w: o.twelve ? 0.5 : 0.7 });
  return s;
}
// 實心電吉他（雙切角）
const EG_BODY = symPath([['M', -38, 0], ['C', -38, -16, -30, -24, -18, -24], ['C', -8, -24, -4, -18, 4, -18],
  ['C', 10, -18, 14, -26, 24, -25], ['C', 29, -24, 27, -17, 22, -12], ['C', 19, -9, 22, -6.5, 28, -6.5]]);
function eguitar(o = {}) {
  const fin = o.fin || '#b8322a';
  let s = '';
  if (o.vshape) {
    s += Po('81,45.5 23,17.5 13,25.5 49,47.5 49,55.5 13,77.5 23,85.5 81,57.5', dim(fin, 0.5), { flat: true });
    s += Po('80,44 22,16 12,24 48,46 48,54 12,76 22,84 80,56', fin, OL(1.2));
    s += PL('22,17.5 78,44.5', '#ffffff', 0.7, { opacity: 0.35 });
  } else {
    s += G('translate(51 51.5)', Pa(EG_BODY, dim(fin, 0.5), { flat: true }));
    s += G('translate(50 50)', Pa(EG_BODY, o.burst ? burstR(fin, o.burst) : fin, o.burst ? OL(1.2, dim(o.burst, 0.4)) : OL(1.2)) +
      G('scale(0.97)', Pa(EG_BODY, 'none', { stroke: '#ffffff', 'stroke-width': 0.6, opacity: 0.25 })));
    // 護板（含螺絲）
    s += Pa('M46 57 Q54 70 66 68 Q76 66 78 56 L78 44 Q68 40 58 44 Z', o.guard || C.ivory, OL(0.6, '#000000'));
    for (const [x, y] of [[50, 59], [62, 66], [74, 62], [74, 46], [60, 44.5]]) s += Ci(x, y, 0.55, '#a0a6ae', { flat: true });
  }
  const pu = o.bass ? [[44, 7]] : o.hum ? [[36, 8], [58, 8]] : [[36, 6], [47, 6], [58, 6]];
  for (const [x, w] of pu) s += pickup(x, w, o.hum || o.bass, o.puc || C.black);
  // 琴橋（含六個弦鞍）、旋鈕、切換開關
  s += R(22, 41.5, 7, 17, tubeH('#c8ccd4'), OL(0.6, '#5a606a'));
  for (let k = 0; k < (o.bass ? 4 : 6); k++) s += R(24.5, 43 + k * (14 / (o.bass ? 3.6 : 5.4)), 2.6, 1.4, '#8a909a', { flat: true });
  if (!o.vshape) {
    for (const [x, y] of [[36, 66], [45, 69], [54, 70]]) s += Ci(x, y, 2.4, '#d8dce2', OL(0.6, '#4a4e56')) + Ci(x - 0.6, y - 0.6, 0.8, '#ffffff', { flat: true, opacity: 0.7 });
    if (!o.bass) s += L(66, 31, 69, 28, '#d8dce2', 1.2) + Ci(69, 28, 1, C.black, { flat: true });
  } else s += Ci(40, 62, 2.2, '#d8dce2', OL(0.6, '#4a4e56')) + Ci(30, 66, 2.2, '#d8dce2', OL(0.6, '#4a4e56'));
  const nx = o.bass ? 132 : 130;
  s += fretboard(78, nx, 5, 4.2, o.board || C.rose, { frets: o.fretless ? 0 : 22, bx: 26, dots: o.fretless ? null : [3, 5, 7, 9, 12] });
  if (o.fretless) {
    const sc = nx - 26;
    for (let k = 1; k < 16; k++) {
      const x = nx - sc * (1 - Math.pow(2, -k / 12));
      if (x > 79) s += L(x, 46, x, 54, '#e8d8b0', 0.4, { opacity: 0.5 });
    }
  }
  s += headstock('inline', nx, { fill: o.head || '#c98a4e', n: o.bass ? 4 : 6, big: o.bass });
  s += strings(o.bass ? 4 : 6, 26, nx + 1, o.bass ? 4 : 4.4, o.bass ? 3.2 : 3.6, { w: o.bass ? 1 : 0.65, c: '#e0e2e6' });
  return s;
}
// 爵士空心吉他：大琴身、f 孔、拉弦板
function jazzGuitar() {
  let s = G('translate(49 51.5)', Pa(JUMBO_BODY, '#2a1208', { flat: true }));
  s += G('translate(48 50)', Pa(JUMBO_BODY, burstR('#e8a040', '#3a1606'), OL(1.2, '#1a0a04')) + G('scale(0.965)', Pa(JUMBO_BODY, 'none', { stroke: '#f2e8d0', 'stroke-width': 0.7 })));
  for (const y of [33, 67]) {
    const d = y < 50 ? 1 : -1;
    s += SP(`M47 ${y} C53 ${y - 3 * d} 61 ${y + 3 * d} 69 ${y}`, '#120804', 1.8) + Ci(46.5, y, 1.5, '#120804', { flat: true }) + Ci(69.5, y, 1.5, '#120804', { flat: true });
    s += L(57, y - 1.6, 57, y + 1.6, '#120804', 0.8);
  }
  s += pickup(41, 8, true, '#1a1a1e') + pickup(76, 8, true, '#1a1a1e');
  s += Pa('M4 47 L18 44.5 L18 55.5 L4 53 Z', grad([[0, '#fff2b0'], [0.5, C.gold], [1, C.brassD]]), OL(0.7, '#6a4a10'));
  s += RR(27, 42, 4, 16, 1, '#3a1a0a', OL(0.6, '#000000')) + R(28.2, 42.5, 1.4, 15, '#d8c8a0', { flat: true });
  s += Pa('M78 58 Q90 64 87 74 Q78 75 70 68 Z', '#1e1008', { opacity: 0.92 });
  for (const [x, y] of [[54, 70], [62, 73]]) s += Ci(x, y, 2.4, C.gold, OL(0.5, '#6a4a10'));
  s += fretboard(86, 136, 5.4, 4.6, C.ebony, { frets: 19, bx: 29, dots: [3, 5, 7, 9] });
  s += headstock('paddle', 136, { fill: C.ebony, peg: C.gold });
  s += strings(6, 12, 137, 4.6, 3.8, { c: '#e8d8a8', w: 0.65 });
  return s;
}
// 共振吉他：金屬共鳴盤
function resoGuitar() {
  let s = G('translate(49 51.5)', Pa(GTR_BODY, '#4a4e56', { flat: true }));
  s += G('translate(48 50)', Pa(GTR_BODY, grad([[0, '#f4f6f8'], [0.35, '#b8bec8'], [0.6, '#e6eaee'], [1, '#7a808a']], [0, 0, 0.4, 1]), OL(1.2, '#3a3e46')));
  s += Ci(34, 50, 17, grad([[0, '#ffffff'], [0.5, '#c8ccd4'], [1, '#8a909a']], [0.3, 0.3, 0.8], true), OL(0.8, '#4a4e56'));
  for (let a = 0; a < 12; a++) {
    const r = (a * Math.PI) / 6;
    s += Pa(`M${34 + Math.cos(r) * 7} ${50 + Math.sin(r) * 7} L${34 + Math.cos(r + 0.18) * 15} ${50 + Math.sin(r + 0.18) * 15} L${34 + Math.cos(r - 0.12) * 15} ${50 + Math.sin(r - 0.12) * 15} Z`, '#2a2e34', { opacity: 0.7 });
  }
  s += Ci(34, 50, 6, tubeV('#c8ccd4'), OL(0.6, '#4a4e56')) + R(31, 42, 2.6, 16, '#3a2a1a', { flat: true });
  for (const y of [37, 63]) {
    s += E(68, y, 5, 3, '#1a1a1e', OL(0.5, '#4a4e56'));
    for (let k = -2; k <= 2; k++) s += L(65 + k, y - 2.4, 71 + k, y + 2.4, '#8a909a', 0.3);
  }
  s += fretboard(84, 136, 5.4, 4.6, C.rose, { frets: 19, bx: 32, dots: [3, 5, 7, 9] });
  s += headstock('slot', 136, { fill: C.rose });
  s += strings(6, 14, 137, 4, 3.8, { c: '#e0e2e6' }) + Pa('M8 46 L16 45 L16 55 L8 54 Z', tubeV('#c8ccd4'), OL(0.6, '#4a4e56'));
  return s;
}
// 斑鳩琴：圓形鼓面、框箍、第五弦弦鈕在指板中段
function banjo() {
  let s = Ci(42.6, 51.4, 33, '#2a2e34', { flat: true });
  s += Ci(42, 50, 33, grad([[0, '#f4f6f8'], [0.5, '#9aa0aa'], [1, '#5a606a']], [0.3, 0.2, 0.7, 1]), OL(0.8, '#2a2e34'));
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    s += L(42 + Math.cos(a) * 29.5, 50 + Math.sin(a) * 29.5, 42 + Math.cos(a) * 32.4, 50 + Math.sin(a) * 32.4, '#e8ecf0', 1.1);
  }
  s += Ci(42, 50, 28.6, grad([[0, '#fbf7ee'], [0.7, '#ece2cc'], [1, '#c8b898']], [0.4, 0.4, 0.7], true), OL(0.5, '#8a7a60'));
  s += Ci(42, 50, 28.6, 'none', { stroke: '#c8ccd4', 'stroke-width': 1 });
  s += Pa('M8 46 L23 47.4 L23 52.6 L8 54 Z', tubeV('#c8ccd4'), OL(0.6, '#4a4e56')) + L(10, 50, 22, 50, '#8a909a', 0.5);
  s += R(30, 44, 2.6, 12, '#d8b070', OL(0.5, '#6a4a20'));
  s += fretboard(72, 140, 4.6, 4.2, C.rose, { frets: 22, bx: 31, dots: [5, 7, 10, 12] });
  s += tuner(104, 44.8, true, C.ivory) + Ci(104, 45.6, 0.7, C.ivory, { flat: true });
  s += headstock('paddle', 140, { fill: C.rose, n: 4, peg: C.ivory });
  s += strings(4, 22, 141, 3.6, 3.2, { c: '#e0e2e6', w: 0.6 }) + L(22, 46.2, 104, 45.6, '#e0e2e6', 0.5);
  return s;
}
// 曼陀林：淚滴形琴身、橢圓音孔、四組複弦
function mandolin() {
  const body = symPath([['M', -36, 0], ['C', -36, -20, -20, -26, -6, -24], ['C', 10, -22, 24, -12, 34, -5]]);
  let s = G('translate(47 51.5)', Pa(body, '#2a1006', { flat: true }));
  s += G('translate(46 50)', Pa(body, burstR('#e8962c', '#3a1406'), OL(1.2, '#1a0804')) + G('scale(0.965)', Pa(body, 'none', { stroke: '#f2e8d0', 'stroke-width': 0.6 })));
  s += E(58, 50, 5, 7.5, '#0a0604') + E(58, 50, 6.8, 9.3, 'none', { stroke: '#f2e8d0', 'stroke-width': 0.6 }) + E(58, 50, 7.8, 10.3, 'none', { stroke: '#2a1006', 'stroke-width': 0.9 });
  s += Pa('M72 60 Q80 64 78 70 Q72 70 68 64 Z', '#1e0e06', { opacity: 0.9 });
  s += RR(26, 43, 3.6, 14, 1, '#3a1a0a', OL(0.5, '#000000')) + R(27, 43.5, 1.2, 13, '#d8c8a0', { flat: true });
  s += Pa('M8 46 L20 45.2 L20 54.8 L8 54 Z', tubeV('#c8ccd4'), OL(0.6, '#4a4e56'));
  s += fretboard(80, 130, 4.6, 4.2, C.rose, { frets: 20, bx: 26, dots: [5, 7, 10] });
  s += headstock('paddle', 130, { fill: C.ebony, n: 8, peg: C.ivory });
  s += strings(8, 16, 131, 3.6, 3.2, { pairs: true, w: 0.45, c: '#e0e2e6' });
  return s;
}
// 烏克麗麗：小吉他、四弦
function ukulele() {
  let s = G('translate(57 51.2) scale(0.8)', Pa(GTR_BODY, '#5a3010', { flat: true }));
  s += G('translate(56 50) scale(0.8)', Pa(GTR_BODY, C.mapleD, OL(1.4, '#3a1a08')) + G('scale(0.95)', Pa(GTR_BODY, grad([[0, '#f0c088'], [0.6, '#d8985a'], [1, '#b87a3a']], [0.3, 0.3, 0.8], true))) +
    range(7).map(i => L(-36, -18 + i * 6, 36, -18 + i * 6 + (i % 3 - 1) * 0.5, '#8a5a2a', 0.4, { opacity: 0.4 })).join(''));
  s += rosette(68, 50, 5.6, '#6a3a1a');
  s += RR(36, 44, 7, 12, 1.5, C.rose, OL(0.6, '#1a0a04')) + L(41, 45, 41, 55, C.ivory, 0.9);
  s += fretboard(86, 128, 4.8, 4.2, C.rose, { frets: 15, bx: 40, dots: [5, 7, 10] });
  s += headstock('paddle', 128, { fill: C.woodD, n: 4, peg: C.ivory });
  s += strings(4, 38, 129, 3.4, 3.2, { w: 0.75, c: '#f0e8d8' });
  return s;
}
// 恰朗哥：小型、十弦五組（傳統以犰狳殼為背）
function charango() {
  let s = G('translate(55 51.2) scale(0.78 0.82)', Pa(GTR_BODY, '#3a1a08', { flat: true }));
  s += G('translate(54 50) scale(0.78 0.82)', Pa(GTR_BODY, '#6d3c1c', OL(1.4, '#2a1006')) + G('scale(0.95)', Pa(GTR_BODY, grad([[0, '#f8d498'], [0.6, '#e3b36c'], [1, '#b88440']], [0.3, 0.3, 0.8], true))));
  s += rosette(66, 50, 4.8, C.red);
  s += acBridge(34, 43, 57, C.rose, 0);
  s += fretboard(84, 130, 5, 4.6, C.rose, { frets: 16, bx: 38 });
  s += headstock('paddle', 130, { fill: '#6d3c1c', n: 10, peg: C.ivory });
  s += strings(10, 37, 131, 4.2, 3.8, { pairs: true, w: 0.42, c: '#f0e8d8' });
  return s;
}
// 布祖基：圓背、長頸有琴格、四組複弦
function bouzouki() {
  const body = symPath([['M', -30, 0], ['C', -30, -19, -18, -25, -4, -24], ['C', 12, -23, 22, -14, 30, -5]]);
  let s = G('translate(39 51.5)', Pa(body, '#2a1006', { flat: true }));
  s += G('translate(38 50)', Pa(body, C.woodD, OL(1.2, '#1a0804')) + G('scale(0.92)', Pa(body, grad([[0, '#f8dca0'], [0.6, C.spruce], [1, '#c09050']], [0.3, 0.3, 0.8], true))));
  s += G('translate(38 50) scale(0.92)', range(8).map(i => L(-26, -18 + i * 5, 28, -18 + i * 5, '#a07838', 0.4, { opacity: 0.35 })).join(''));
  s += rosette(46, 50, 5.2, C.red) + RR(18, 44, 3.6, 12, 1, '#3a1a0a', OL(0.5, '#000000')) + R(19, 44.5, 1.2, 11, '#d8c8a0', { flat: true });
  s += Pa('M58 58 Q64 62 62 68 Q56 68 53 62 Z', '#1e0e06', { opacity: 0.85 });
  s += Pa('M5 46 L14 45.4 L14 54.6 L5 54 Z', tubeV('#c8ccd4'), OL(0.6, '#4a4e56'));
  s += fretboard(66, 140, 4.2, 3.8, C.rose, { frets: 24, bx: 20, dots: [5, 7, 10, 12] });
  s += headstock('paddle', 140, { fill: C.woodD, n: 8 });
  s += strings(8, 9, 141, 3.2, 3, { pairs: true, w: 0.42, c: '#e0e2e6' });
  return s;
}
// 巴拉萊卡：三角形琴身、三弦
function balalaika() {
  let s = Po('9,15.5 9,87.5 81,54.5 81,48.5', '#3a1a08', { flat: true });
  s += Po('8,14 8,86 80,53 80,47', C.mapleD, OL(1.2, '#2a1006'));
  s += Po('10.5,18 10.5,82 76,52 76,48', grad([[0, '#f8dca0'], [0.6, '#e7c27e'], [1, '#c09050']], [0.2, 0.3, 0.8], true));
  s += L(10.5, 50, 76, 50, '#b08a50', 0.4, { opacity: 0.6 }) + L(10.5, 34, 76, 49, '#b08a50', 0.4, { opacity: 0.5 }) + L(10.5, 66, 76, 51, '#b08a50', 0.4, { opacity: 0.5 });
  s += rosette(46, 50, 4, C.woodD);
  s += RR(21, 45, 2.6, 10, 1, '#3a1a0a', OL(0.5, '#000000')) + R(8, 47.5, 4, 5, tubeV('#c8ccd4'), { flat: true });
  s += fretboard(78, 136, 3.8, 3.4, C.rose, { frets: 16, bx: 23 });
  s += Pa('M136 46 L152 43 Q156 50 152 57 L136 54 Z', C.mapleD, OL(1.2));
  for (const x of [141, 147]) s += tuner(x, 44.4, true, C.ivory);
  s += tuner(144, 55.6, false, C.ivory);
  s += strings(3, 10, 137, 3, 2.6, { w: 0.6, c: '#e0e2e6' });
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
  const body = o.bass ? DB_BODY : VLN_BODY, wood = o.wood || '#b5531f';
  let s = '';
  if (o.endpin) s += L(-30, 0, -44, 0, tubeV('#9aa0aa'), 1.8) + R(-32, -1.6, 3, 3.2, C.ebony, { flat: true });
  s += G('translate(0.8 1)', Pa(body, dim(wood, 0.6), { flat: true }));
  s += Pa(body, grad([[0, lit(wood, 0.35)], [0.45, wood], [0.85, dim(wood, 0.35)], [1, dim(wood, 0.55)]], [0.45, 0.4, 0.62], true), OL(1, dim(wood, 0.7)));
  s += G('scale(0.95)', Pa(body, 'none', { stroke: '#1a0a04', 'stroke-width': 0.5, opacity: 0.75 }));
  s += G('scale(0.92)', Pa(body, 'none', { stroke: lit(wood, 0.4), 'stroke-width': 0.4, opacity: 0.4 }));
  // f 孔
  for (const sy of [-1, 1]) {
    s += SP(`M-9 ${sy * 7.4} C-4 ${sy * 5.2} 2 ${sy * 9.2} 6 ${sy * 7}`, '#120602', 1.1);
    s += Ci(-9.4, sy * 7.5, 0.9, '#120602', { flat: true }) + Ci(6.4, sy * 6.9, 0.9, '#120602', { flat: true });
    s += L(-1.6, sy * 6.4, -1.2, sy * 8.4, '#120602', 0.5);
  }
  // 高光
  s += E(-16, -6, 7, 2.4, '#ffffff', { opacity: 0.16, transform: 'rotate(-8 -16 -6)' }) + E(16, -5, 5, 1.8, '#ffffff', { opacity: 0.13 });
  // 指板（烏木）
  s += Po('-2,-3.2 30,-2.5 52,-2.1 52,2.1 30,2.5 -2,3.2', shV('#2a2420', 1.2), OL(0.6, '#000000'));
  // 琴頸、弦軸箱、渦卷
  s += Po('30,-2.4 52,-2.4 52,2.4 30,2.4', dim(wood, 0.2), { flat: true, opacity: 0 });
  s += R(52, -3, 9, 6, shV(wood), OL(0.8, dim(wood, 0.6))) + R(53, -1.6, 7, 3.2, '#140804', { flat: true });
  if (o.bass) {
    for (const x of [54, 58]) s += R(x, -7, 2.4, 4, tubeH(C.brass), OL(0.4, C.brassD)) + R(x, 3, 2.4, 4, tubeH(C.brass), OL(0.4, C.brassD)) + Ci(x + 1.2, -7.6, 1.4, C.brass, { flat: true }) + Ci(x + 1.2, 7.6, 1.4, C.brass, { flat: true });
  } else {
    for (const x of [54.5, 58.5]) s += E(x, -5, 1.6, 2.4, shR('#2a2420'), { flat: true }) + E(x, 5, 1.6, 2.4, shR('#2a2420'), { flat: true }) + Ci(x, -5, 0.4, C.ivory, { flat: true }) + Ci(x, 5, 0.4, C.ivory, { flat: true });
  }
  s += Ci(63.5, 0, 4, shR(wood), OL(0.8, dim(wood, 0.6))) + SP('M63.5 -2.6 a2.6 2.6 0 1 1 -2.4 1.8 a1.4 1.4 0 1 1 2.4 0.4', dim(wood, 0.6), 0.6);
  // 繫弦板（烏木＋微調器）、琴橋（楓木，略呈拱形）
  s += Pa('M-29 -1.8 C-24 -2.6 -16 -3.6 -12 -3.4 L-12 3.4 C-16 3.6 -24 2.6 -29 1.8 Z', shV('#2a2420', 1.2), OL(0.5, '#000000'));
  if (!o.bass) s += Ci(-14.5, -1.8, 0.6, '#c8ccd4', { flat: true }) + Ci(-14.5, 1.8, 0.6, '#c8ccd4', { flat: true });
  s += Pa('M-7.6 -5.8 L-5.2 -5.4 L-5.4 5.4 L-7.6 5.8 Q-6.8 0 -7.6 -5.8 Z', '#e8c890', OL(0.4, '#8a6a3a'));
  s += G('translate(0 -50)', strings(4, -12, 52, 2.6, 1.6, { w: 0.42, c: '#e8e2d6' }));
  if (o.mute) s += RR(-11.4, -4, 3.2, 8, 1, shH('#2a2a2e'), OL(0.4, '#000000'));
  return s;
}
// 琴弓（區域座標：從 0 到 len）
function bow(len, o = {}) {
  return L(1, 0, len, 0, '#f4eedc', 0.9) + SP(`M0 -3.4 Q${len / 2} -4.8 ${len} -2.6`, grad([[0, '#8a4a20'], [0.5, '#6a3416'], [1, '#4a220c']], [0, 0, 1, 0]), 1.6) +
    R(-3.2, -4.8, 6.4, 4.6, shV('#1e1a18'), OL(0.5, '#000000')) + Ci(0, -2.5, 0.9, '#e8f0f4', { flat: true }) + R(-4.6, -4.8, 1.4, 4.4, tubeH('#c8ccd4'), { flat: true }) +
    Pa(`M${len - 0.6} -3 L${len + 1.2} -3.4 L${len + 1} 0.6 L${len - 0.6} 0.4 Z`, C.ivory, OL(0.4, '#8a8070'));
}
function violin(scale, o = {}) {
  const sc = scale || 1;
  return G(`translate(72 48) rotate(-14) scale(${sc})`, fiddle(o)) + G(`translate(18 ${o.bowY || 86}) rotate(-8)`, bow(124));
}
function cello(o = {}) {
  // 直立、尾柱著地；整把（尾柱到渦卷）約 112 單位，縮放後放進 100 高的畫面
  const sc = o.bass ? 0.86 : 0.8;
  return G(`translate(66 ${o.bass ? 60 : 58}) rotate(-90) scale(${sc})`, fiddle({ endpin: true, bass: o.bass, wood: o.bass ? '#8a3e17' : '#a8481a' }).replace(/scale\(/g, 'scale(')) +
    G(`translate(92 ${o.bass ? 74 : 72}) rotate(-38)`, bow(o.bass ? 58 : 64));
}

// ══ 中國擦弦：二胡／高胡（直立）═════════════════════════════════════
function huqin(o = {}) {
  const x = 80, rose = '#4a1e14';
  let s = '';
  // 琴托（底座）
  s += RR(x - 1, 90, 7, 6, 1.5, shV(rose), OL(0.6, '#1a0804'));
  // 琴桿
  s += R(x - 1.8, 8, 3.6, 82, grad([[0, lit(rose, 0.4)], [0.4, rose], [1, dim(rose, 0.5)]], [0, 0, 1, 0]), OL(0.6, '#1a0804'));
  // 琴頭：彎曲的龍首／如意狀
  s += Pa(`M${x - 1.8} 8 C${x - 2.4} 4 ${x} 1 ${x + 3.4} 2.4 C${x + 5} 3.4 ${x + 4} 6 ${x + 1.8} 6.4 L${x + 1.8} 8 Z`, shR(rose), OL(0.6, '#1a0804'));
  // 兩根弦軸（朝同一側，上軸接內弦、下軸接外弦）
  for (const y of [15, 25]) {
    s += Pa(`M${x + 1.8} ${y} L${x + 14} ${y - 0.6} Q${x + 15.6} ${y + 1.6} ${x + 14} ${y + 3.8} L${x + 1.8} ${y + 3.2} Z`, shV(rose), OL(0.5, '#1a0804'));
    s += Ci(x + 15.4, y + 1.6, 2.2, shR(C.ivory), OL(0.4, '#8a8070')) + L(x - 3, y + 1.6, x + 1.8, y + 1.6, '#1a0804', 0.8);
  }
  // 千斤（絲線）
  s += L(x - 7, 40, x - 1.4, 40, '#c83a2a', 1.6) + L(x - 7, 41, x - 1.4, 41, '#e8a050', 0.5);
  // 琴筒
  if (o.round) {
    s += RR(x - 9, 74, 28, 15, 2.6, grad([[0, '#8a3a20'], [0.4, '#5a1e10'], [1, '#2a0a04']]), OL(0.6, '#1a0804'));
    for (const yy of [77, 86]) s += L(x - 9, yy, x + 19, yy, '#c88a5a', 0.5, { opacity: 0.6 });
    s += E(x - 9, 81.5, 4.6, 7.5, grad([[0, '#9a9a70'], [0.6, C.snake], [1, '#3a3a24']], [0.3, 0.3, 0.8], true), OL(0.6, '#2a2a18'));
  } else {
    const B = [[x - 9, 73], [x + 21, 73], [x + 24, 77], [x + 24, 87], [x + 21, 91], [x - 9, 91]];
    s += Po(B.map(p => p.join(',')).join(' '), grad([[0, '#8a3a20'], [0.35, '#6a2614'], [0.65, '#4a160a'], [1, '#2a0a04']]), OL(0.6, '#1a0804'));
    s += L(x - 9, 77, x + 24, 77, '#b0703a', 0.6, { opacity: 0.7 }) + L(x - 9, 87, x + 24, 87, '#2a0a04', 0.8);
    s += L(x + 21, 73, x + 21, 91, '#2a0a04', 0.5, { opacity: 0.6 });
    // 後口雕花音窗
    for (const yy of [79, 82, 85]) s += R(x + 22, yy - 0.6, 1.4, 1.2, '#1a0804', { flat: true });
    // 前口：蟒皮（鱗片紋）
    s += Po(`${x - 9},73 ${x - 5},76 ${x - 5},88 ${x - 9},91 ${x - 13},88 ${x - 13},76`, grad([[0, '#9a9a70'], [0.5, C.snake], [1, '#34341e']], [0, 0, 1, 1]), OL(0.6, '#24241a'));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
      const xx = x - 12 + c * 2.6 + (r % 2) * 1.3, yy = 76 + r * 2.4;
      if (xx < x - 5.4) s += E(xx, yy, 1.1, 0.8, r % 3 ? '#b8b88a' : '#2e2e1a', { opacity: 0.7 });
    }
  }
  // 兩條弦（從琴軸經千斤到琴筒上的琴碼）、琴碼
  s += L(x - 4.8, 16.6, x - 4.8, 82, '#e8e2d6', 0.5) + L(x - 3.4, 26.6, x - 3.4, 82, '#e8e2d6', 0.6);
  s += L(x - 4.8, 16.6, x - 1.8, 16.6, '#e8e2d6', 0.4) + L(x - 3.4, 26.6, x - 1.8, 26.6, '#e8e2d6', 0.4);
  s += R(x - 6.4, 81.4, 3.6, 2.6, '#e8c890', OL(0.3, '#6a4a20'));
  // 弓：竹桿（有節）＋馬尾，夾在兩弦之間
  s += SP(`M${x - 62} 63 Q${x - 5} 58.5 ${x + 60} 66`, grad([[0, '#e8d090'], [0.5, '#c8a860'], [1, '#a88840']], [0, 0, 1, 0]), 1.8);
  for (const t of [0.2, 0.45, 0.7]) s += Ci(lerp(x - 62, x + 60, t), lerp(63, 66, t) - 3.2 + Math.abs(t - 0.5) * 2.5, 0.9, '#a88840', { flat: true });
  s += L(x - 61, 66, x + 59, 69, '#f4eedc', 1);
  s += L(x - 62, 63, x - 62, 66.4, C.bambooD, 1.4) + L(x + 60, 66, x + 60, 69.4, C.bambooD, 1.4);
  if (o.small) s = G('translate(80 50) scale(0.86) translate(-80 -50)', s);
  return s;
}

// ══ 亞洲／世界撥弦（直立樂器一律稍微斜放，填滿 160×100）═══════════════
// 琵琶：梨形琴身、四相（頸上）＋多品（延伸到琴身）、曲項琴頭、四弦
function pipa() {
  const body = symPath([['M', -44, 0], ['C', -44, -22, -24, -30, -6, -28], ['C', 12, -26, 24, -12, 30, -5]]);
  let s = G('translate(-3 1.6)', Pa(symPathAt(body, 48, 50), '#3a1a08', { flat: true }));
  s += G('translate(-4 0)', Pa(symPathAt(body, 48, 50), '#6a3a1a', OL(1, '#2a1006')) +
    Pa(symPathAt(body, 48, 50, 0.93), grad([[0, '#f0cc90'], [0.6, '#d8a868'], [1, '#a87840']], [0.4, 0.4, 0.7], true)) +
    range(8).map(i => L(10, 30 + i * 5.6, 76, 30 + i * 5.6 + (i % 3 - 1) * 0.6, '#a07838', 0.4, { opacity: 0.35 })).join(''));
  // 覆手（琴橋）
  let t = Pa('M12 42 Q10 50 12 58 L20 58 Q22 50 20 42 Z', shV('#4a2010'), OL(0.6, '#1a0804')) + L(18, 43, 18, 57, '#d8c8a0', 0.8);
  // 品（竹製，越往下越密）
  for (const x of [52, 57.5, 62.5, 67, 71]) t += R(x, 46.2, 1.6, 7.6, shH('#e8d090'), OL(0.3, '#8a6a30'));
  // 頸與相（牛角／象牙色）
  t += Po('74,45.6 116,46.6 116,53.4 74,54.4', shV('#6a3a1a'), OL(0.8, '#2a1006'));
  for (const x of [78, 87, 96.5, 106]) t += Pa(`M${x} 54.8 L${x} 46.4 Q${x + 1.8} 44 ${x + 3.6} 46.4 L${x + 3.6} 54.8 Z`, shH('#f0e4c8'), OL(0.4, '#8a8070'));
  // 山口、曲項（往後彎）與四軸
  t += R(115, 46.2, 1.6, 7.6, C.ivory, { flat: true });
  t += Pa('M116 46.6 L120 45.6 Q134 44 142 36 L146 39 Q138 49 120 54.4 L116 53.4 Z', shV('#6a3a1a'), OL(0.8, '#2a1006'));
  for (const [x, y] of [[124, 44], [133, 40.5]]) t += Pa(`M${x - 1.4} ${y - 1} L${x - 1.8} ${y - 10} Q${x} ${y - 11.6} ${x + 1.8} ${y - 10} L${x + 1.4} ${y - 1} Z`, shH('#3a1a0a'), OL(0.4, '#000000'));
  for (const [x, y] of [[127, 51], [136, 46.5]]) t += Pa(`M${x - 1.4} ${y + 1} L${x - 1.8} ${y + 10} Q${x} ${y + 11.6} ${x + 1.8} ${y + 10} L${x + 1.4} ${y + 1} Z`, shH('#3a1a0a'), OL(0.4, '#000000'));
  t += Pa('M142 36 Q148 31 151 35 Q150 40 146 39 Z', shR('#4a2010'), OL(0.6, '#1a0804'));
  t += strings(4, 18, 117, 4.4, 2.6, { w: 0.5, c: '#f0e8d8' });
  return G('rotate(-10 80 50)', s + t);
}
// 把 symPath（以 0 為中心）平移／縮放到 (cx, cy)
function symPathAt(d, cx, cy, k = 1) {
  return d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, a, b) => `${f1(cx + a * k)} ${f1(cy + b * k)}`);
}
// 三味線：方形蒙皮琴身、細長無品頸、撥子（撥）
function shamisen() {
  let s = Pa('M11 31.6 Q9 51.6 11 71.6 L45 71.6 Q47 51.6 45 31.6 Z', '#1a0a04', { flat: true });
  s += Pa('M10 30 Q8 50 10 70 L44 70 Q46 50 44 30 Z', shH('#4a2010'), OL(0.8, '#1a0804'));
  s += Pa('M12.6 32.6 Q11.2 50 12.6 67.4 L41.4 67.4 Q42.8 50 41.4 32.6 Z', grad([[0, '#fdfaf2'], [0.7, '#efe6d2'], [1, '#d8ccb0']], [0.4, 0.4, 0.75], true), OL(0.4, '#a89878'));
  // 撥皮（擋撥片的半月皮）
  s += Pa('M28 33 Q40 36 41 48 L41 33 Z', '#d8ccb0', { opacity: 0.8 });
  s += Po('44,47.6 136,48.4 136,51.6 44,52.4', shV('#3b1a10'), OL(0.6, '#000000'));
  s += Pa('M136 47.6 L152 46 Q155 50 152 54 L136 52.4 Z', shV('#3b1a10'), OL(0.6, '#000000'));
  for (const x of [140, 146]) s += Pa(`M${x - 1.2} 47 L${x - 1.6} 39 Q${x} 37.6 ${x + 1.6} 39 L${x + 1.2} 47 Z`, shH(C.ivory), OL(0.4, '#8a8070'));
  s += Pa(`M${145.8} 53 L${145.4} 61 Q${147} 62.4 ${148.6} 61 L${148.2} 53 Z`, shH(C.ivory), OL(0.4, '#8a8070'));
  s += R(20, 46.4, 2.4, 7.2, shH('#f0e4c8'), OL(0.3, '#8a8070')) + R(9, 48, 3, 4, '#c8323a', { flat: true });
  s += strings(3, 11, 137, 2, 1.5, { w: 0.5, c: '#f7e9b8' });
  // 撥（銀杏葉形，象牙／玳瑁）
  s += Po('34,76 48,77.4 60,97 22,97', grad([[0, '#fdfaf2'], [0.6, '#efe6d2'], [1, '#c8bca0']], [0, 0, 1, 1]), OL(0.6, '#8a8070')) + Po('34,76 48,77.4 47,82 35,81', shH('#6a3a1a'), { flat: true });
  return s;
}
// 西塔琴：大葫蘆共鳴箱、寬長頸、弧形金屬品、上方第二葫蘆、側面弦軸
function sitar(o = {}) {
  let s = E(31, 55.6, 26, 24, '#2a1006', { flat: true });
  s += E(30, 54, 26, 24, grad([[0, '#e8a860'], [0.5, '#a86a32'], [1, '#4a2410']], [0.3, 0.3, 0.8], true), OL(0.8, '#2a1006'));
  s += E(30, 54, 21, 19, grad([[0, '#fbe0a8'], [0.6, '#e2b66d'], [1, '#b8884a']], [0.4, 0.4, 0.7], true), OL(0.4, '#6a3a1a'));
  // 花紋鑲嵌（一圈小花瓣）
  for (let i = 0; i < 12; i++) {
    const a = i * 0.5236;
    s += E(30 + Math.cos(a) * 16, 54 + Math.sin(a) * 14, 1.4, 0.8, '#f8f0e0', { opacity: 0.85, transform: `rotate(${f1(a * 57.3)} ${f1(30 + Math.cos(a) * 16)} ${f1(54 + Math.sin(a) * 14)})` });
  }
  s += Po('46,44.4 148,46 148,54 46,55.6', shV('#5a2a10'), OL(0.7, '#1a0804'));
  // 頸側共鳴弦的小弦軸
  if (!o.nofret) for (let i = 0; i < 9; i++) s += Ci(66 + i * 8, 57.4, 0.9, C.ivory, OL(0.3, '#8a8070'));
  if (!o.nofret) for (let i = 0; i < 18; i++) {
    const x = 58 + i * 4.9;
    s += SP(`M${x} 45.2 Q${x + 1.8} 50 ${x} 54.8`, '#e8ecf0', 0.9) + SP(`M${x + 0.6} 45.2 Q${x + 2.4} 50 ${x + 0.6} 54.8`, '#3a3e44', 0.4);
  }
  if (o.upper !== false) s += L(118, 55, 118, 58, '#1a0804', 1) + E(118, 66, 9, 8, grad([[0, '#e8a860'], [0.5, '#a86a32'], [1, '#4a2410']], [0.3, 0.3, 0.8], true), OL(0.7, '#2a1006'));
  for (const x of [128, 136, 144]) s += Pa(`M${x - 1.2} 46 L${x - 1.6} 37.6 Q${x} 36 ${x + 1.6} 37.6 L${x + 1.2} 46 Z`, shH('#3a1a0a'), OL(0.4, '#000000')) + Ci(x, 37.4, 1.3, C.ivory, { flat: true });
  for (const x of [132, 140]) s += Pa(`M${x - 1.2} 54 L${x - 1.6} 62.4 Q${x} 64 ${x + 1.6} 62.4 L${x + 1.2} 54 Z`, shH('#3a1a0a'), OL(0.4, '#000000')) + Ci(x, 62.6, 1.3, C.ivory, { flat: true });
  // 主琴橋（駱駝骨，寬平）
  s += Pa('M12 45.6 L19 45.6 L20 54.4 L11 54.4 Z', shV('#f4ead6'), OL(0.4, '#8a8070'));
  s += strings(o.nofret ? 4 : 6, 16, 148, 3.2, 2.8, { w: 0.45, c: '#e8e4dc' });
  return s;
}
// 薩羅德：無品、金屬指板、蒙皮共鳴腹、短而寬
function sarod() {
  let s = Pa('M9 51.6 C9 29.6 35 27.6 49 37.6 L61 43.6 L61 59.6 L49 65.6 C35 75.6 9 73.6 9 51.6 Z', '#1a0804', { flat: true });
  s += Pa('M8 50 C8 28 34 26 48 36 L60 42 L60 58 L48 64 C34 74 8 72 8 50 Z', grad([[0, '#a85a2a'], [0.5, '#6a3416'], [1, '#2a1006']], [0.2, 0, 0.6, 1]), OL(0.8, '#1a0804'));
  s += E(26, 50, 15, 15, grad([[0, '#fdfaf2'], [0.7, '#efe2c8'], [1, '#c8b898']], [0.4, 0.4, 0.7], true), OL(0.5, '#8a7a60'));
  s += Pa('M21 45 L28 45 L28.6 55 L20.4 55 Z', shV('#f4ead6'), OL(0.4, '#8a8070'));
  s += Po('58,43 128,46 128,54 58,57', grad([[0, '#ffffff'], [0.4, '#c8ccd4'], [1, '#6a707a']]), OL(0.6, '#3a3e46'));
  s += L(60, 44.4, 126, 47, '#ffffff', 0.4, { opacity: 0.8 });
  s += Pa('M128 45 L146 43 Q152 50 146 57 L128 55 Z', shV('#5a2a10'), OL(0.7, '#1a0804'));
  for (const x of [134, 142]) s += Pa(`M${x - 1.2} 45 L${x - 1.6} 36.6 Q${x} 35 ${x + 1.6} 36.6 L${x + 1.2} 45 Z`, shH('#3a1a0a'), OL(0.4, '#000000')) + Pa(`M${x - 1.2} 55 L${x - 1.6} 63.4 Q${x} 65 ${x + 1.6} 63.4 L${x + 1.2} 55 Z`, shH('#3a1a0a'), OL(0.4, '#000000'));
  s += L(108, 56, 108, 58, '#1a0804', 1) + E(108, 64, 7, 6, grad([[0, '#ffffff'], [0.5, '#b8bec8'], [1, '#5a606a']], [0.3, 0.3, 0.8], true), OL(0.6, '#3a3e46'));
  s += strings(4, 23, 129, 3, 2.8, { w: 0.5, c: '#e8e4dc' });
  for (let i = 0; i < 8; i++) s += Ci(70 + i * 7, 57.6, 0.7, C.ivory, { flat: true });
  return s;
}
// 烏德琴：大梨形圓背、無品短頸、曲項琴頭、三個花窗
function oud() {
  const body = symPath([['M', -40, 0], ['C', -40, -24, -22, -32, -4, -30], ['C', 14, -28, 26, -14, 34, -5]]);
  let s = Pa(symPathAt(body, 51, 51.6), '#1a0804', { flat: true });
  s += Pa(symPathAt(body, 50, 50), grad([[0, '#6a3416'], [0.5, '#4a2410'], [1, '#2a1006']]), OL(0.8, '#1a0804'));
  // 圓背拼條在邊緣露出（條紋）
  for (let i = 0; i < 9; i++) s += Pa(symPathAt(body, 50, 50, 0.985 - i * 0.004), 'none', { stroke: i % 2 ? '#c88a4a' : '#3a1a08', 'stroke-width': 0.35, opacity: 0.6 });
  s += Pa(symPathAt(body, 50, 50, 0.93), grad([[0, '#fbe4b0'], [0.6, '#e0b878'], [1, '#b08048']], [0.4, 0.4, 0.75], true));
  s += Pa(symPathAt(body, 50, 50, 0.95), 'none', { stroke: '#2a1006', 'stroke-width': 0.6 });
  // 三個音孔（大的在中央，兩個小的在上下）＋花窗紋
  for (const [cx, cy, r] of [[48, 50, 6.2], [63, 41, 3.2], [63, 59, 3.2]]) {
    s += Ci(cx, cy, r, '#1a0a04', { flat: true }) + Ci(cx, cy, r + 1.2, 'none', { stroke: '#4a2410', 'stroke-width': 0.8 });
    for (let k = 0; k < 6; k++) { const a = k * 1.047; s += L(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, '#d8b070', 0.5); }
    s += Ci(cx, cy, r * 0.5, 'none', { stroke: '#d8b070', 'stroke-width': 0.5 });
  }
  // 撥片護板（琴身下方深色區）、琴橋（下繫式）
  s += Pa('M64 46 Q80 48 80 50 Q80 52 64 54 Z', '#3a1a08', { opacity: 0.75 });
  s += RR(22, 43, 4, 14, 1.5, shV('#2a1a10'), OL(0.5, '#000000'));
  s += Po('84,45 118,46 118,54 84,55', shV('#2a2420', 1.2), OL(0.6, '#000000'));
  // 往後折的弦軸箱（斜向下）＋十二支弦軸（兩側）
  s += Pa('M118 46 L122 45 L150 66 L145 70 L118 54 Z', grad([[0, '#8a4a20'], [1, '#3a1a08']], [0, 0, 1, 1]), OL(0.7, '#1a0804'));
  for (let i = 0; i < 6; i++) {
    const x = 124 + i * 4.4, y = 48 + i * 3.4;
    s += Pa(`M${x - 0.9} ${y - 1} L${x - 1.2} ${y - 7.4} Q${x} ${y - 8.6} ${x + 1.2} ${y - 7.4} L${x + 0.9} ${y - 1} Z`, shH('#2a1a10'), OL(0.3, '#000000'));
  }
  s += strings(10, 25, 119, 4.4, 3.6, { pairs: true, w: 0.45, c: '#f0e8d8' });
  return s;
}

// 坦布拉：大葫蘆、長而直的頸、無品、四弦、頂端弦軸
function tanpura() {
  let s = E(35, 53.6, 28, 26, '#1a0804', { flat: true });
  s += E(34, 52, 28, 26, grad([[0, '#e8a860'], [0.5, '#a86a32'], [1, '#4a2410']], [0.3, 0.3, 0.8], true), OL(0.8, '#2a1006'));
  s += E(34, 52, 23, 21, grad([[0, '#fbe0a8'], [0.6, '#e7c07a'], [1, '#b8884a']], [0.4, 0.4, 0.7], true), OL(0.4, '#6a3a1a'));
  s += SP('M14 40 Q34 30 54 40', '#8a5228', 0.8, { opacity: 0.8 }) + SP('M14 64 Q34 74 54 64', '#8a5228', 0.8, { opacity: 0.8 });
  for (let i = 0; i < 10; i++) s += Ci(18 + i * 3.6, 37.5 - Math.sin(i / 9 * Math.PI) * 3.6, 0.6, '#f8f0e0', { flat: true });
  s += Po('56,45 150,46.5 150,53.5 56,55', grad([[0, '#d89850'], [0.5, '#a86a32'], [1, '#5a3010']]), OL(0.7, '#2a1006'));
  s += L(58, 46, 148, 47.4, '#f0c080', 0.4, { opacity: 0.7 });
  for (const x of [138, 146]) s += Pa(`M${x - 1.2} 46.6 L${x - 1.6} 38 Q${x} 36.4 ${x + 1.6} 38 L${x + 1.2} 46.6 Z`, shH('#2a1a10'), OL(0.4, '#000000')) + Pa(`M${x - 1.2} 53.4 L${x - 1.6} 62 Q${x} 63.6 ${x + 1.6} 62 L${x + 1.2} 53.4 Z`, shH('#2a1a10'), OL(0.4, '#000000'));
  s += Pa('M18 45.6 L25 45.6 L26 54.4 L17 54.4 Z', shV('#f4ead6'), OL(0.4, '#8a8070'));
  for (let i = 0; i < 4; i++) s += Ci(36, 47.4 + i * 1.8, 0.7, '#e8d8a8', { flat: true });
  s += strings(4, 21, 150, 3.2, 2.6, { w: 0.55, c: '#e8e4dc' });
  return s;
}

// ══ 箏類（長板，略斜放；雁柱斜排成一線）══════════════════════════════
// o：n 弦數、wood 面板色、end 尾端樣式、color 雁柱色
function zither(o = {}) {
  const n = o.n || 21, top = 30, bot = 72, x0 = 10, x1 = 150, wood = o.wood || C.kiri, side = o.side || C.woodD;
  let s = '';
  s += Pa(`M${x0} ${top + 6} Q80 ${top - 6} ${x1} ${top + 6} L${x1} ${bot + 8} L${x0} ${bot + 8} Z`, grad([[0, lit(side, 0.2)], [1, dim(side, 0.4)]]), OL(0.8, dim(side, 0.6)));
  s += L(x0, bot + 5, x1, bot + 5, lit(side, 0.3), 0.5, { opacity: 0.6 });
  s += Pa(`M${x0} ${top + 6} Q80 ${top - 6} ${x1} ${top + 6} L${x1} ${bot} Q80 ${bot - 8} ${x0} ${bot} Z`, grad([[0, lit(wood, 0.25)], [0.5, wood], [1, dim(wood, 0.25)]]), OL(0.7, dim(wood, 0.6)));
  // 桐木木紋
  s += range(6).map(i => SP(`M${x0 + 2} ${top + 10 + i * 6.4} Q80 ${top - 2 + i * 6.4} ${x1 - 2} ${top + 10 + i * 6.4}`, dim(wood, 0.3), 0.4, { opacity: 0.35 })).join('');
  // 前後岳山
  const br = o.bridge || C.ivory;
  s += R(x0 + 8.6, top + 3.6, 2.6, bot - top - 4, shH(br), OL(0.3, dim(br, 0.5))) + R(x1 - 11.2, top + 3.6, 2.6, bot - top - 4, shH(br), OL(0.3, dim(br, 0.5)));
  // 弦與雁柱
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, y = lerp(top + 5, bot - 3, t);
    s += L(x0 + 10, y + 0.5, x1 - 10, y + 0.5, '#000000', 0.4, { opacity: 0.25 });
    s += L(x0 + 10, y, x1 - 10, y, '#f4eedc', 0.45, { 'stroke-linecap': 'butt' });
    s += L(x1 - 10, y, x1 - 4, y + 0.6, '#f4eedc', 0.4, { opacity: 0.7 });
    const bx = lerp(x0 + 52, x1 - 28, t) + (i % 2 ? 3 : 0), c = o.color || C.ivory;
    s += Pa(`M${bx - 2.4} ${y + 2.4} L${bx - 0.4} ${y - 1} L${bx + 0.4} ${y - 1} L${bx + 2.4} ${y + 2.4} L${bx + 1.4} ${y + 2.4} L${bx} ${y + 0.4} L${bx - 1.4} ${y + 2.4} Z`, shH(c), OL(0.3, dim(c, 0.5)));
  }
  if (o.end === 'ridge') {
    // 伽倻琴：尾端羊耳頭（彎曲的尾）＋前端弦繩
    s += Pa(`M${x0} ${top + 6} L${x0 - 6} ${top + 10} L${x0 - 6} ${bot + 4} L${x0} ${bot + 8} Z`, shH(side), OL(0.6, dim(side, 0.6)));
    s += Pa(`M${x1} ${top + 6} C${x1 + 8} ${top + 12} ${x1 + 8} ${bot} ${x1} ${bot + 8}`, shH(side), OL(0.6, dim(side, 0.6)));
    for (let i = 0; i < n; i++) s += L(x1 - 4, lerp(top + 5, bot - 3, (i + 0.5) / n), x1 + 2, lerp(top + 14, bot + 6, (i + 0.5) / n), '#e8dcc0', 0.5, { opacity: 0.8 });
  }
  if (o.tassel) s += L(x1 - 4, bot + 8, x1 - 4, bot + 18, '#c83a2a', 2) + L(x1, bot + 8, x1 + 2, bot + 18, '#a82a1a', 2) + Ci(x1 - 2, bot + 8.6, 1.6, C.gold, { flat: true });
  if (o.deco) s += R(x0 + 1.6, top + 8, 4.6, bot - top - 8, shH(o.deco), { flat: true }) + range(5).map(i => Ci(x0 + 3.9, top + 12 + i * 7, 1, C.gold, { flat: true })).join('');
  if (o.side2) s += L(x0, bot + 3, x1, bot + 3, o.side2, 1.4);
  return s;
}

// 揚琴：梯形木箱、兩排山口（琴碼）、兩支竹製琴竹
function yangqin(o = {}) {
  let s = Po('34,28 126,28 155,83 5,83', '#000000', { flat: true, opacity: 0.45 });
  s += Po('34,26 126,26 154,80 6,80', grad([[0, '#8a4a1a'], [1, '#3a1606']]), OL(0.6, '#1a0602'));
  s += Po('37,29 123,29 149,76 11,76', grad([[0, '#f0c890'], [0.6, o.top || '#d8a465'], [1, '#a87440']]), OL(0.4, '#5a3010'));
  s += Po('6,80 154,80 152,84 8,84', grad([[0, '#5a2a0a'], [1, '#1a0602']]), { flat: true });
  for (let i = 0; i < 14; i++) {
    const y = 32 + i * 3.2, t = (y - 26) / 54;
    s += L(lerp(36, 9, t), y + 0.4, lerp(124, 151, t), y + 0.4, '#000000', 0.4, { opacity: 0.3 }) + L(lerp(36, 9, t), y, lerp(124, 151, t), y, '#eef0f4', 0.45);
  }
  for (let i = 0; i < 7; i++) {
    const y = 33 + i * 6.4;
    s += R(56 - i * 1.5, y - 1.2, 3, 3, shV('#f4ecd8'), OL(0.3, '#6a5a40')) + R(98 + i * 1.5, y - 1.2, 3, 3, shV('#f4ecd8'), OL(0.3, '#6a5a40'));
  }
  s += Ci(80, 70, 4, '#2a1406', { flat: true }) + Ci(80, 70, 5.2, 'none', { stroke: '#8a5a2a', 'stroke-width': 0.8 });
  for (const x of [22, 138]) s += Ci(x, 77.6, 0.9, '#e8ecf0', { flat: true });
  // 琴竹（竹桿＋頭端包膠）
  s += L(40, 94, 108, 58, tubeV('#e8d090'), 1.6) + L(58, 97, 122, 62, tubeV('#e8d090'), 1.6);
  s += `<ellipse${at({ cx: 108, cy: 58, rx: 3, ry: 1.6, fill: shR('#c83a2a'), transform: 'rotate(-28 108 58)' })}/>` + `<ellipse${at({ cx: 122, cy: 62, rx: 3, ry: 1.6, fill: shR('#c83a2a'), transform: 'rotate(-28 122 62)' })}/>`;
  return s;
}
// 西洋揚琴（hammered dulcimer）：較淺的梯形、兩條長斜琴碼、木槌
function dulcimer() {
  let s = Po('40,22 120,22 157,85 5,85', '#000000', { flat: true, opacity: 0.45 });
  s += Po('40,20 120,20 156,82 4,82', grad([[0, '#8a4a1a'], [1, '#3a1606']]), OL(0.6, '#1a0602'));
  s += Po('43,23 117,23 151,78 9,78', grad([[0, '#f4d498'], [0.6, '#e3bd7f'], [1, '#b08048']]), OL(0.4, '#5a3010'));
  s += Po('4,82 156,82 154,86 6,86', grad([[0, '#5a2a0a'], [1, '#1a0602']]), { flat: true });
  for (let i = 0; i < 16; i++) {
    const y = 26 + i * 3.2, t = (y - 20) / 62;
    s += L(lerp(42, 7, t), y + 0.4, lerp(118, 153, t), y + 0.4, '#000000', 0.35, { opacity: 0.3 }) + L(lerp(42, 7, t), y, lerp(118, 153, t), y, '#eef0f4', 0.4);
  }
  for (const [x1, x2] of [[54, 44], [104, 116]]) {
    s += L(x1, 25, x2, 76, '#000000', 3, { opacity: 0.35 }) + L(x1, 24, x2, 75, grad([[0, '#fbf4e0'], [1, '#c8b890']], [0, 0, 1, 0]), 2.2);
    for (let k = 0; k < 8; k++) s += Ci(lerp(x1, x2, (k + 0.5) / 8), lerp(24, 75, (k + 0.5) / 8), 0.6, '#8a7a5a', { flat: true });
  }
  for (const [x, y, r] of [[80, 48, 6], [60, 64, 4], [100, 64, 4]]) {
    s += Ci(x, y, r, '#2a1406', { flat: true }) + Ci(x, y, r + 1.4, 'none', { stroke: '#6a3a1a', 'stroke-width': 1 });
    for (let k = 0; k < 6; k++) { const a = k * 1.047; s += L(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, '#c89858', 0.5); }
  }
  s += L(54, 96, 104, 72, tubeV('#c89058'), 1.6) + L(70, 98, 118, 76, tubeV('#c89058'), 1.6);
  for (const [x, y] of [[104, 72], [118, 76]]) s += `<ellipse${at({ cx: x, cy: y, rx: 3.2, ry: 2, fill: shR('#f4ead0'), stroke: '#8a7a5a', 'stroke-width': 0.4, transform: `rotate(-26 ${x} ${y})` })}/>`;
  return s;
}
// 豎琴：三角框、彎曲琴頸、共鳴箱斜下、立柱
function harp() {
  const gold = grad([[0, '#fff2b0'], [0.4, '#e8c14a'], [1, '#8a6410']], [0, 0, 1, 0]);
  let s = '';
  // 底座與踏板
  s += Pa('M28 88 L64 88 L62 96 L30 96 Z', grad([[0, '#e8c14a'], [1, '#6a4a10']]), OL(0.5, '#4a3008'));
  for (let i = 0; i < 4; i++) s += R(32 + i * 7, 94, 4, 1.6, '#c8ccd4', { flat: true });
  // 共鳴箱：從底座斜上到琴頸右端；箱面有明暗與響孔
  s += Pa('M44 90 L58 90 L126 30 L117 24 Z', grad([[0, '#e8b070'], [0.5, '#b8783a'], [1, '#5a3010']], [0, 0, 1, 0]), OL(0.6, '#2a1406'));
  s += L(51, 89, 121, 27, '#f0c890', 0.6, { opacity: 0.8 });
  for (const [x, y] of [[70, 70], [88, 54], [104, 40]]) s += `<ellipse${at({ cx: x, cy: y, rx: 2.4, ry: 1.2, fill: '#1a0a04', transform: `rotate(-41 ${x} ${y})` })}/>`;
  // 立柱（左）
  s += RR(35, 18, 7, 72, 3, gold, OL(0.5, '#5a4008'));
  for (const y of [30, 50, 70]) s += R(34.6, y, 7.8, 1.4, '#fff2b0', { flat: true, opacity: 0.7 });
  s += Pa('M32 18 Q38.5 6 45 18 Z', gold, OL(0.5, '#5a4008')) + Ci(38.5, 11, 3.2, shR('#e8c14a'), OL(0.4, '#5a4008'));
  // 琴頸：S 形
  s += Pa('M38 12 C60 6 80 30 100 22 C112 16 118 14 128 20 L124 28 C114 22 108 26 98 31 C78 40 58 18 42 22 Z', gold, OL(0.6, '#5a4008'));
  s += SP('M42 15 C60 10 80 33 100 25 C110 20 116 18 125 22', '#fff6c8', 0.6, { opacity: 0.8 });
  // 調音軸（頸上一排小點）
  const neckY = t => 22 + Math.sin(t * Math.PI * 1.1) * -6 + t * 4;
  for (let i = 0; i < 16; i++) s += Ci(lerp(46, 120, i / 15), neckY(i / 15) - 1, 0.6, '#5a4008', { flat: true });
  // 弦
  for (let i = 0; i < 16; i++) {
    const t = i / 15, xb = lerp(52, 120, t), yb = lerp(87, 27, t), ty = Math.min(neckY(t) + 2, yb - 2);
    const c = i % 7 === 0 ? '#d83a2a' : i % 7 === 3 ? '#3a6ad8' : '#f4eedc';
    s += L(xb, yb, xb, ty, c, 0.6);
  }
  return s;
}

// ══ 拇指琴／卡林巴 ═══════════════════════════════════════════════
function kalimba(o = {}) {
  let s = '';
  if (o.mbira) {
    // 姆比拉：葫蘆共鳴器（deze）、木板（gwariva）、兩排鐵片、瓶蓋響片
    s += E(81, 60, 62, 36, '#000000', { flat: true, opacity: 0.4 });
    s += E(80, 58, 62, 36, grad([[0, '#c88a4a'], [0.5, '#8a5a2e'], [1, '#3a2008']], [0.35, 0.3, 0.75], true), OL(0.6, '#2a1404'));
    s += E(80, 58, 56, 31, grad([[0, '#3a2008'], [1, '#6a4020']], [0.5, 0.5, 0.6], true), { flat: true });
    s += RR(40, 22, 80, 66, 4, grad([[0, '#f0c888'], [0.5, '#d8a965'], [1, '#9a6a30']], [0, 0, 1, 1]), OL(0.6, '#5a3a10'));
    s += grain(42, 64, 76, 22, '#8a5a2a', 4, 0.4);
    for (let i = 0; i < 11; i++) {
      const x = 46 + i * 6.8, len = 30 + Math.abs(i - 5) * 3;
      s += RR(x - 1.6, 30, 3.2, len, 1.5, tubeH('#9aa0aa'), OL(0.3, '#3a3e46'));
    }
    for (let i = 0; i < 7; i++) {
      const x = 56 + i * 8, len = 22 + Math.abs(i - 3) * 3;
      s += RR(x - 1.4, 26, 2.8, len, 1.4, tubeH('#c8ccd4'), OL(0.3, '#3a3e46'));
    }
    s += R(42, 36, 76, 3, tubeV('#6a707a'), OL(0.3, '#2a2e34'));
    for (const x of [44, 52, 108, 116]) s += Ci(x, 80, 3, grad([[0, '#fff0b0'], [1, C.brassD]], [0.3, 0.2, 0.7, 1]), OL(0.4, '#5a3a10')) + Ci(x, 80, 1, '#5a3a10', { flat: true });
    return s;
  }
  const w = o.wood || C.woodL;
  s += RR(37, 20, 88, 70, 10, '#000000', { flat: true, opacity: 0.45 });
  s += RR(36, 18, 88, 70, 10, grad([[0, lit(w, 0.3)], [0.5, w], [1, dim(w, 0.4)]], [0, 0, 1, 1]), OL(0.6, dim(w, 0.65)));
  s += grain(40, 50, 80, 36, dim(w, 0.4), 5, 0.4);
  s += Ci(80, 74, 7, '#1a0a04', { flat: true }) + Ci(80, 74, 8, 'none', { stroke: dim(w, 0.4), 'stroke-width': 1 });
  s += R(40, 30, 80, 3, tubeV('#9aa0aa'), OL(0.3, '#3a3e46')) + R(40, 38, 80, 4, tubeV('#c8ccd4'), OL(0.3, '#3a3e46'));
  for (let i = 0; i < 17; i++) {
    const d = Math.abs(i - 8), x = 42.5 + i * 4.6, len = 40 - d * 2.6;
    s += RR(x - 1.6, 24, 3.2, len, 1.5, tubeH('#e8ecf0'), OL(0.3, '#4a4e56'));
    if (i % 2 === 0) s += Ci(x, 24 + len - 3, 0.5, '#4a4e56', { flat: true });
  }
  for (const x of [48, 80, 112]) s += Ci(x, 40, 0.9, '#4a4e56', { flat: true });
  return s;
}

// ══ 吹管樂器 ═════════════════════════════════════════════════════
// 橫笛（長笛／短笛）：x0..x1 管身，吹口在左
function flute(o = {}) {
  const x0 = o.x0 ?? 6, x1 = o.x1 ?? 154, y = 50, h = o.h || 4;
  let s = RR(x0, y - h + 0.8, x1 - x0, 2 * h, h, '#000000', { flat: true, opacity: 0.45 });
  s += RR(x0, y - h, x1 - x0, 2 * h, h, tubeV('#c8ccd4'), OL(0.6, '#3a3e46'));
  for (const x of o.joints || [x0 + 34, x1 - 26]) s += R(x - 1.4, y - h - 0.5, 2.8, 2 * h + 1, tubeV('#e8ecf0'), OL(0.3, '#4a4e56'));
  // 吹口板
  s += Pa(`M${x0 + 10} ${y - h} Q${x0 + 16} ${y - h - 3} ${x0 + 22} ${y - h} Z`, tubeV('#e8ecf0'), OL(0.4, '#4a4e56')) + E(x0 + 16, y - h + 0.6, 2.4, 1.2, '#1a1a1e', { flat: true });
  // 按鍵與連桿
  const nk = o.keys || 12, ks = x0 + 46, ke = x1 - 34, kr = h * 0.62;
  s += L(ks - 4, y + h - 0.6, ke + 4, y + h - 0.6, tubeV('#9aa0aa'), 0.9);
  for (let i = 0; i < nk; i++) {
    const kx = lerp(ks, ke, i / (nk - 1));
    s += Ci(kx + 0.3, y + 0.5, kr, '#3a3e46', { flat: true, opacity: 0.6 }) + Ci(kx, y, kr, grad([[0, '#ffffff'], [0.6, '#c8ccd4'], [1, '#7a808a']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#4a4e56'));
    if (i % 3 !== 2 && !o.picc) s += Ci(kx, y, kr * 0.35, '#2a2e34', { flat: true });
    s += L(kx, y + kr * 0.8, kx, y + h - 0.6, '#9aa0aa', 0.4);
  }
  // 尾管鍵
  s += RR(x1 - 20, y - 1.6, 10, 3.2, 1.6, tubeV('#e8ecf0'), OL(0.3, '#4a4e56'));
  return s;
}
// 竹笛：竹管、竹節纏線、吹孔、膜孔、六個指孔
function dizi(o = {}) {
  const x0 = 6, x1 = 154, y = 50, h = 4.6, c = o.c || C.bamboo;
  let s = RR(x0, y - h + 0.8, x1 - x0, 2 * h, 3, '#000000', { flat: true, opacity: 0.45 });
  s += RR(x0, y - h, x1 - x0, 2 * h, 3, tubeV(c), OL(0.6, dim(c, 0.6)));
  // 竹纖維紋
  for (let i = 0; i < 3; i++) s += L(x0 + 4, y - 2 + i * 2, x1 - 4, y - 2 + i * 2 + 0.3, dim(c, 0.3), 0.3, { opacity: 0.4 });
  // 纏線（多圈細線）
  for (const x of [14, 48, 100, 146]) for (let k = -2; k <= 2; k++) s += L(x + k * 0.8, y - h - 0.2, x + k * 0.8, y + h + 0.2, o.bind || '#2a1a14', 0.6);
  s += E(30, y, 2.4, 1.8, '#1a1008', { flat: true }) + E(30, y - 0.6, 2, 0.8, '#000000', { flat: true, opacity: 0.5 });
  if (o.membrane !== false) s += E(40, y, 2.8, 2, grad([[0, '#ffffff'], [1, '#d8d4c4']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#8a8070')) + L(38.4, y - 0.6, 41.6, y + 0.6, '#c8c4b4', 0.3);
  for (let i = 0; i < 6; i++) s += Ci(60 + i * 7.6, y, 1.6, '#1a1008', { flat: true }) + Ci(60 + i * 7.6, y - 0.5, 1, '#000000', { flat: true, opacity: 0.6 });
  s += Ci(112, y, 1.2, '#1a1008', { flat: true }) + Ci(122, y, 1.2, '#1a1008', { flat: true });
  if (o.tassel) s += SP(`M150 ${y + h} C151 ${y + 12} 149 ${y + 18} 152 ${y + 26}`, '#c83a2a', 1.6) + SP(`M151 ${y + h} C153 ${y + 12} 152 ${y + 18} 155 ${y + 24}`, '#a82a1a', 1.4) + Ci(151, y + h + 2.4, 2, shR('#e8c14a'), { flat: true });
  return s;
}
// 直吹管（直笛、尺八、奈伊、卡瓦爾）：斜放，吹口在左上
function endFlute(o = {}) {
  const len = o.len || 150, h = o.h || 5;
  let s = '';
  const body = o.body || C.bamboo;
  const fill = grad([[0, lit(body, 0.35)], [0.35, body], [1, dim(body, 0.45)]]);
  if (o.kind === 'recorder') {
    s += Pa(`M0 ${-h - 1} L${len - 12} ${-h + 0.5} L${len} ${-h - 2.5} L${len} ${h + 2.5} L${len - 12} ${h - 0.5} L0 ${h + 1} Q-8 ${h} -10 0 Q-8 ${-h} 0 ${-h - 1} Z`, fill, OL(0.6, dim(body, 0.6)));
    s += R(10, -1.8, 5, 3.6, '#1a1008', { flat: true }) + Po('10,-1.8 15,-1.8 13,0 10,0', '#4a2a10', { flat: true });
    for (const x of [0, len - 26]) s += L(x, -h - 0.6, x, h + 0.6, dim(body, 0.5), 1.2) + L(x + 1.2, -h, x + 1.2, h, lit(body, 0.4), 0.5);
    s += grain(16, -h + 1, len - 30, 2 * h - 2, dim(body, 0.4), 3, 0.3);
  } else {
    s += RR(0, -h, len, 2 * h, o.kind === 'shaku' ? 1 : h, fill, OL(0.6, dim(body, 0.6)));
    s += L(2, -h + 1.2, len - 2, -h + 1.2, lit(body, 0.55), 0.6, { opacity: 0.7 });
  }
  if (o.kind === 'shaku') {
    // 斜切的歌口與牛角嵌片、根部竹根略粗
    s += Po(`0,${-h} 6,${-h} 2,${h}`, grad([[0, '#fdfaf2'], [1, '#c8bca0']]), OL(0.4, '#8a8070'));
    s += Pa(`M${len - 14} ${-h} Q${len + 4} ${-h - 3} ${len + 4} 0 Q${len + 4} ${h + 3} ${len - 14} ${h} Z`, fill, OL(0.6, dim(body, 0.6)));
    for (const x of [len - 10, len - 5, len - 1]) s += L(x, -h - 1.2, x, h + 1.2, o.node || C.bambooD, 0.8);
    for (let k = 0; k < 6; k++) s += Ci(len - 4 + (k % 3) * 2, -2 + Math.floor(k / 3) * 4, 0.5, dim(body, 0.5), { flat: true });
  }
  if (o.nodes) for (const x of o.nodes) s += L(x, -h, x, h, o.node || C.bambooD, 1) + L(x + 1, -h + 0.4, x + 1, h - 0.4, lit(body, 0.3), 0.4);
  if (o.bind) for (const x of o.bind) for (let k = -1; k <= 1; k++) s += L(x + k * 1, -h - 0.4, x + k * 1, h + 0.4, o.bindC || C.ebony, 0.7);
  for (const x of o.holes || []) s += Ci(x, 0, 1.6, '#1a1008', { flat: true }) + Ci(x, -0.5, 1, '#000000', { flat: true, opacity: 0.6 });
  return G(`translate(${o.x ?? 12} ${o.y ?? 22}) rotate(${o.rot ?? 21})`, s);
}
// 排笛：一排由長到短的管子、綁帶
function panflute() {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const x = 26 + i * 9.2, h = 72 - i * 4.4, c = i % 2 ? C.bamboo : '#e7d290';
    s += RR(x, 14, 8.2, h, 3.5, tubeH(c), OL(0.6, dim(c, 0.6))) + E(x + 4.1, 15.5, 2.8, 1.4, '#1a1008', { flat: true });
    s += L(x + 4.1, 24, x + 4.1, 12 + h, lit(c, 0.3), 0.4, { opacity: 0.5 });
  }
  s += R(22, 34, 118, 6, grad([[0, '#e8504a'], [1, '#8a1a12']]), OL(0.4, '#5a0a08')) + R(22, 36.4, 118, 1.2, '#f0d070', { flat: true });
  s += R(22, 54, 92, 4, grad([[0, '#e8504a'], [1, '#8a1a12']]), OL(0.4, '#5a0a08'));
  return s;
}
// 陶笛：甘薯形、吹嘴、指孔
function ocarina() {
  let s = Pa('M25 58 C19 32 71 26 105 32 C133 37 147 48 147 58 C147 74 119 84 85 82 C55 80 29 76 25 58 Z', '#000000', { flat: true, opacity: 0.45 });
  s += Pa('M24 56 C18 30 70 24 104 30 C132 35 146 46 146 56 C146 72 118 82 84 80 C54 78 28 74 24 56 Z', grad([[0, '#f0a878'], [0.45, '#c87850'], [1, '#6a3420']], [0.3, 0, 0.6, 1]), OL(0.7, '#4a2010'));
  s += Pa('M110 34 L140 26 L146 34 L128 44 Z', grad([[0, '#e89a6a'], [1, '#8a4a2a']]), OL(0.6, '#4a2010')) + Pa('M131 30.6 L137 28.6 L138 32.4 L132 34.4 Z', '#1a0804', { flat: true });
  s += SP('M40 44 C60 36 90 34 116 40', '#f8c8a0', 1.6, { opacity: 0.6 });
  for (const [x, y, r] of [[48, 56, 3.2], [62, 52, 3.4], [76, 50, 3.4], [90, 50, 3.2], [58, 68, 2.4], [74, 68, 2.8], [92, 66, 2.6], [106, 56, 2.2]])
    s += Ci(x, y, r + 0.6, '#f0a878', { flat: true, opacity: 0.5 }) + Ci(x, y, r, '#2a0e04', { flat: true });
  return s;
}

// 直吹簧管（單簧管、雙簧管）：斜放，吹嘴在左上、喇叭口在右下
function reedPipe(o = {}) {
  const len = o.len || 128, h = o.h || 4.2, bell = o.bell || 9, body = o.c || '#1e1a18';
  let s = '';
  if (o.kind === 'oboe') s += Po('-12,-1.4 0,-2.2 0,2.2 -12,1.4', grad([[0, '#e8c890'], [1, '#a8884a']]), OL(0.3, '#6a5020')) + R(-3, -2.8, 3, 5.6, tubeV('#c8ccd4'), { flat: true }) + R(-13, -1.6, 2, 3.2, '#c8a060', { flat: true });
  else s += Pa(`M-14 -2 L0 ${-h + 0.6} L0 ${h - 0.6} L-14 2 Q-16 0 -14 -2 Z`, grad([[0, '#4a4a4e'], [1, '#0a0a0c']]), OL(0.4, '#000000')) + R(-7, -h + 0.4, 3.4, 2 * h - 0.8, tubeV('#c8ccd4'), { flat: true }) + L(-13.4, 1.6, -4, 2.8, '#d8b870', 0.8);
  s += Pa(`M0 ${-h} L${len - 18} ${-h} Q${len - 6} ${-h} ${len} ${-bell} L${len} ${bell} Q${len - 6} ${h} ${len - 18} ${h} L0 ${h} Z`, grad([[0, lit(body, 0.35)], [0.3, lit(body, 0.12)], [0.6, body], [1, '#000000']]), OL(0.5, '#000000'));
  s += L(2, -h + 1, len - 18, -h + 1, '#ffffff', 0.4, { opacity: 0.3 });
  for (const x of o.rings || [26, 64, len - 20]) s += R(x - 1.2, -h - 0.4, 2.4, 2 * h + 0.8, tubeV('#e8ecf0'), OL(0.3, '#4a4e56'));

  for (let i = 0; i < 7; i++) {
    const x = 14 + i * 12;
    s += Ci(x, 0, 2, grad([[0, '#ffffff'], [1, '#7a808a']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#4a4e56')) + Ci(x, 0, 0.9, '#000000', { flat: true });
  }
  s += L(10, h - 0.8, len - 24, h - 0.8, tubeV('#c8ccd4'), 0.9) + L(30, -h + 0.8, 90, -h + 0.8, tubeV('#c8ccd4'), 0.7);
  for (const x of [20, 44, 68, 92]) s += L(x, h - 0.8, x + 4, 1.6, '#c8ccd4', 0.5);
  return G(`translate(${o.x ?? 22} ${o.y ?? 20}) rotate(${o.rot ?? 24})`, s);
}
// 低音單簧管：直立長管、彎頸、往上翻的金屬喇叭
function bassClarinet() {
  let s = RR(66, 14, 14, 66, 3, grad([[0, '#4a4440'], [0.35, '#2a2420'], [1, '#000000']], [0, 0, 1, 0]), OL(0.5, '#000000'));
  for (const y of [28, 52]) s += R(65.4, y, 15.2, 2.4, tubeH('#e8ecf0'), OL(0.3, '#4a4e56'));
  for (let i = 0; i < 6; i++) s += Ci(73, 20 + i * 9.6, 2.4, grad([[0, '#ffffff'], [1, '#7a808a']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#4a4e56')) + Ci(73, 20 + i * 9.6, 1, '#000000', { flat: true });
  s += L(78, 18, 78, 76, tubeH('#c8ccd4'), 1);
  s += pipe('M73 14 C73 4 60 2 50 10', 3, '#c8ccd4');
  s += Pa('M50 10 L38 16 L40 19 L52 13 Z', grad([[0, '#4a4a4e'], [1, '#0a0a0c']]), OL(0.4, '#000000'));
  s += Pa('M66 78 C66 96 98 96 98 80 L98 70 Q98 62 104 56 L118 56 Q110 64 110 72 L110 80 C110 104 66 104 66 80 Z', grad([[0, '#ffffff'], [0.4, '#c8ccd4'], [1, '#5a606a']], [0, 0, 1, 0]), OL(0.6, '#3a3e46'));
  s += E(111, 56, 7.5, 2.4, grad([[0, '#3a3e46'], [1, '#c8ccd4']]), OL(0.6, '#e8ecf0'));
  return s;
}
// 低音管：雙管並排（長管＋短管）、長 bocal 吹管
function bassoon() {
  const w = '#9c4a1d', f = grad([[0, '#d8844a'], [0.35, w], [1, '#3a1406']], [0, 0, 1, 0]);
  let s = RR(70, 6, 13, 90, 4, f, OL(0.5, '#2a0a02')) + RR(83, 26, 9, 70, 3, f, OL(0.5, '#2a0a02'));
  s += R(69.4, 6, 14.2, 4, shV('#f4ecd8'), OL(0.3, '#8a8070')) + RR(68, 80, 26, 16, 5, f, OL(0.5, '#2a0a02')) + R(68, 82, 26, 3, tubeV('#e8ecf0'), { flat: true });
  s += R(69.4, 46, 14.2, 2.4, tubeV('#e8ecf0'), { flat: true }) + R(82.4, 46, 10.2, 2.4, tubeV('#e8ecf0'), { flat: true });
  s += grain(71, 12, 11, 32, '#5a2008', 3, 0.4);
  for (let i = 0; i < 5; i++) s += Ci(76.5, 54 + i * 5, 1.6, grad([[0, '#ffffff'], [1, '#7a808a']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#4a4e56'));
  s += L(79, 20, 79, 76, tubeH('#c8ccd4'), 0.9) + L(88, 32, 88, 76, tubeH('#c8ccd4'), 0.9);
  for (const y of [30, 40, 60, 70]) s += L(79, y, 88, y + 2, '#c8ccd4', 0.5);
  s += pipe('M88 30 C88 22 66 18 52 26', 1.6, '#c8ccd4') + Po('52,26 42,28 42,31 52,28', grad([[0, '#e8c890'], [1, '#a8884a']]), OL(0.3, '#6a5020'));
  return s;
}
// 薩克斯風：直立、彎頸、往上翻的喇叭口
// kind: alto / tenor（頸部有弧） / bari（頸部繞一圈）
function sax(kind = 'alto') {
  const k = kind === 'alto' ? 0.86 : kind === 'tenor' ? 0.96 : 1.04, c = C.brass;
  let s = '';
  const body = 'M66 22 L76 22 L82 66 C84 82 90 88 98 88 C106 88 110 80 110 70 L110 52 Q110 46 104 40 L128 40 Q122 46 122 52 L122 70 C122 92 108 100 96 100 C78 100 70 88 68 70 Z';
  s += Pa(body, grad([[0, lit(c, 0.45)], [0.35, c], [0.75, dim(c, 0.2)], [1, dim(c, 0.5)]], [0, 0, 1, 0.3]), OL(0.8, C.brassD));
  s += SP('M69 26 L73 64 C75 84 86 95 96 95', lit(c, 0.7), 1.2, { opacity: 0.9 });
  // 喇叭口
  s += E(116, 40, 12, 3.4, grad([[0, lit(c, 0.3)], [1, dim(c, 0.3)]]), OL(0.8, lit(c, 0.3))) + E(116, 40.4, 8.6, 2, grad([[0, '#3a2a08'], [1, '#8a6a20']]), { flat: true });
  s += SP('M100 54 Q104 50 108 50', dim(c, 0.4), 0.5);
  // 主連桿與按鍵
  s += L(79.6, 28, 84, 70, tubeH(lit(c, 0.2)), 1);
  for (let i = 0; i < 6; i++) {
    const x = 73.2 + i * 1.25, y = 30 + i * 7.2;
    s += Ci(x + 0.3, y + 0.4, 3.3, dim(c, 0.4), { flat: true }) + Ci(x, y, 3, grad([[0, lit(c, 0.5)], [1, dim(c, 0.3)]], [0.3, 0.2, 0.7, 1]), OL(0.4, C.brassD));
    if (i === 1 || i === 2 || i === 4) s += Ci(x, y, 1.5, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), { flat: true });
    s += L(x + 2.6, y, 80 + i * 0.8, y + 0.4, dim(c, 0.3), 0.5);
  }
  for (let i = 0; i < 3; i++) s += Ci(103, 76 - i * 8.5, 2.6, grad([[0, lit(c, 0.5)], [1, dim(c, 0.3)]], [0.3, 0.2, 0.7, 1]), OL(0.4, C.brassD));
  s += SP('M96 84 Q104 86 108 80', dim(c, 0.35), 1.2) + Ci(90, 94, 1.4, lit(c, 0.3), { flat: true });
  // 頸管＋吹嘴（黑色硬橡膠）＋束圈
  const neck = kind === 'bari' ? 'M71 22 C70 6 92 4 92 16 C92 26 74 26 68 14 C64 8 54 6 44 12'
    : kind === 'tenor' ? 'M71 22 C70 10 60 4 46 10' : 'M71 22 C70 14 62 10 50 14';
  s += pipe(neck, kind === 'alto' ? 2.6 : 3, c);
  const [mx, my] = kind === 'bari' ? [44, 12] : kind === 'tenor' ? [46, 10] : [50, 14];
  s += G(`translate(${mx} ${my}) rotate(${kind === 'alto' ? 20 : 24})`, Pa('M0 -2 L-12 -1.2 Q-14 0 -12 1.4 L0 2.2 Z', grad([[0, '#4a4a4e'], [1, '#0a0a0c']]), OL(0.4, '#000000')) + R(-4, -2.4, 2.4, 4.8, tubeH('#c8ccd4'), { flat: true }));
  return G(`translate(80 52) scale(${k}) translate(-82 -54)`, s);
}

// ══ 銅管 ═══════════════════════════════════════════════════════
// 喇叭口：從 (x, y) 往右張開，半徑 r
function bellR(x, y, len, r0, r, c = C.brass) {
  return Pa(`M${x} ${y - r0} Q${x + len * 0.75} ${y - r0} ${x + len} ${y - r} L${x + len} ${y + r} Q${x + len * 0.75} ${y + r0} ${x} ${y + r0} Z`,
    grad([[0, lit(c, 0.5)], [0.35, c], [0.7, dim(c, 0.2)], [1, dim(c, 0.5)]]), OL(0.7, dim(c, 0.6))) +
    SP(`M${x + 2} ${y - r0 + 0.6} Q${x + len * 0.75} ${y - r0 + 0.6} ${x + len - 1} ${y - r + 1.2}`, lit(c, 0.7), 0.8, { opacity: 0.8 }) +
    E(x + len, y, 2.8, r, grad([[0, dim(c, 0.6)], [0.6, dim(c, 0.3)], [1, lit(c, 0.3)]], [0, 0, 1, 0]), OL(0.8, lit(c, 0.3)));
}
function trumpet(o = {}) {
  const c = o.c || C.brass;
  let s = '';
  // 調音滑管（後方 U 形）、主管、第三活塞滑管
  s += pipe('M60 60 L38 60 C26 60 26 42 38 42 L58 42', 3.4, c) + pipe('M84 60 L104 60 C112 60 112 50 104 50 L86 50', 2.6, c) + pipe('M70 68 L70 72 L82 72 L82 66', 2, c);
  s += pipe('M86 42 L96 42', 3.4, c);
  s += bellR(94, 42, 60, 2.2, 15, c);
  for (const x of [64, 73, 82]) s += valve(x, 34, 64, c);
  // 吹口管與吹嘴、指環、水鍵
  s += pipe('M60 52 L18 52', 2.4, c) + Pa('M18 49.6 L8 50.8 Q5 52 8 53.2 L18 54.4 Z', grad([[0, '#ffffff'], [0.5, '#c8ccd4'], [1, '#6a707a']]), OL(0.4, '#3a3e46')) + E(6, 52, 1.4, 3, shR('#c8ccd4'), { flat: true });
  s += SP('M90 42 Q92 36 96 38', dim(c, 0.4), 0.8) + Ci(34, 60, 1.2, '#c8ccd4', { flat: true });
  if (o.mute) s += Pa('M153 42 Q140 31 128 42 Q140 53 153 42 Z', grad([[0, '#a07850'], [0.5, '#6a4a2a'], [1, '#3a2614']]), OL(0.6, '#2a1a0a')) + E(153, 42, 2.4, 6, shR('#3a2614'), { flat: true }) + RR(124, 40, 6, 4, 1.2, '#e8d0a0', { flat: true });
  return s;
}
function trombone() {
  let s = '';
  s += pipe('M30 62 L132 62 C142 62 142 74 132 74 L36 74', 2.6) + R(118, 59, 3, 18, tubeH('#c8ccd4'), { flat: true }) + R(124, 57, 2.4, 6, tubeH(C.brass), { flat: true });
  s += Pa('M98 37.4 Q56 36.6 28 22 L28 56 Q56 41.4 98 42.6 Z', grad([[0, lit(C.brass, 0.5)], [0.4, C.brass], [1, dim(C.brass, 0.4)]]), OL(0.7, C.brassD));
  s += SP('M96 38.4 Q56 37.6 30 24', lit(C.brass, 0.7), 0.7, { opacity: 0.8 });
  s += E(28, 39, 3, 17, grad([[0, lit(C.brass, 0.3)], [0.4, dim(C.brass, 0.3)], [1, dim(C.brass, 0.6)]], [1, 0, 0, 0]), OL(0.8, lit(C.brass, 0.3)));
  s += pipe('M98 40 C112 40 112 62 100 62', 2.6);
  s += L(62, 38, 62, 64, tubeH('#c8ccd4'), 1.6) + L(46, 39, 46, 60, tubeH('#c8ccd4'), 1);
  s += pipe('M30 74 L22 74', 2) + Pa('M22 71.6 L14 72.8 Q11 74 14 75.2 L22 76.4 Z', grad([[0, '#ffffff'], [1, '#6a707a']]), OL(0.4, '#3a3e46'));
  return s;
}
function frenchHorn() {
  let s = '';
  for (const [r, w] of [[30, 4.2], [21.5, 3.4], [13, 2.6]]) s += Ci(72, 52, r, 'none', { stroke: dim(C.brass, 0.55), 'stroke-width': w + 1.2 }) + Ci(72, 52, r, 'none', { stroke: C.brass, 'stroke-width': w }) +
    SP(`M${72 - r * 0.86} ${52 - r * 0.5} A${r} ${r} 0 0 1 ${72 + r * 0.5} ${52 - r * 0.86}`, lit(C.brass, 0.6), w * 0.35);
  // 旋轉閥（帶十字形頂蓋）＋拉桿
  for (const [x, y] of [[57, 41], [64, 36.6], [72, 34.2], [80, 34.6]]) s += Ci(x, y, 3.6, grad([[0, '#ffffff'], [0.5, '#c8ccd4'], [1, '#6a707a']], [0.3, 0.2, 0.7, 1]), OL(0.5, '#3a3e46')) + L(x - 1.6, y, x + 1.6, y, '#6a707a', 0.5) + L(x, y - 1.6, x, y + 1.6, '#6a707a', 0.5);
  s += pipe('M55 30 L80 26', 1, '#c8ccd4');
  s += Pa('M96 66 Q118 74 128 96 L156 82 Q132 74 102 56 Z', grad([[0, lit(C.brass, 0.5)], [0.4, C.brass], [1, dim(C.brass, 0.4)]], [0, 0, 1, 1]), OL(0.7, C.brassD));
  s += `<ellipse${at({ cx: 142, cy: 89, rx: 15.5, ry: 4, fill: grad([[0, dim(C.brass, 0.6)], [1, lit(C.brass, 0.2)]]), stroke: lit(C.brass, 0.3), 'stroke-width': 0.8, transform: 'rotate(-27 142 89)' })}/>`;
  s += pipe('M48 36 L22 22', 2.2) + Pa('M22 22 L14 18 L12 22 L20 26 Z', grad([[0, '#ffffff'], [1, '#6a707a']]), OL(0.4, '#3a3e46'));
  return s;
}
function tuba() {
  let s = '';
  s += Pa('M58 90 C44 90 40 78 44 64 L52 30 Q50 18 34 10 L104 10 Q88 18 86 30 L92 64 C96 78 92 90 78 90 Z', grad([[0, lit(C.brass, 0.45)], [0.35, C.brass], [0.7, dim(C.brass, 0.15)], [1, dim(C.brass, 0.5)]], [0, 0, 1, 0]), OL(0.8, C.brassD));
  s += SP('M54 34 L48 64 C46 76 50 84 58 86', lit(C.brass, 0.7), 1.4, { opacity: 0.85 });
  s += E(69, 10, 35, 5, grad([[0, lit(C.brass, 0.3)], [1, dim(C.brass, 0.4)]]), OL(0.8, lit(C.brass, 0.3))) + E(69, 10.6, 27, 3, grad([[0, '#3a2a08'], [1, '#8a6a20']]), { flat: true });
  s += L(46, 76, 92, 76, dim(C.brass, 0.4), 0.6, { opacity: 0.6 });
  s += pipe('M90 56 C110 56 118 70 112 82 C106 92 90 90 86 80', 3.4);
  for (const y of [44, 52, 60, 68]) s += R(94, y, 20, 5.6, tubeV(C.brass), OL(0.4, C.brassD)) + RR(113, y + 0.6, 4, 4.4, 1, grad([[0, '#ffffff'], [1, '#c8c0b0']]), OL(0.3, '#8a8070'));
  s += pipe('M60 60 C42 60 30 54 26 46', 2.4) + Pa('M26 46 L20 40 L17 43 L23 49 Z', grad([[0, '#ffffff'], [1, '#6a707a']]), OL(0.4, '#3a3e46'));
  return s;
}
// 口哨：嘟起的嘴唇＋音符
function whistle(o = {}) {
  return lips(46, 50, 1.9, 'w') + SP('M76 50 q8 -6 16 0 t16 0 t16 0', o.c || C.ivory, 2.4) + note(128, 44, 1.3, C.gold) + note(112, 30, 0.9, C.gold);
}
// 風笛：氣袋（格紋布）、三支持續音管、吹管、指管
function bagpipe() {
  let s = '';
  const wood = '#3a1a0c', tw = grad([[0, '#7a4a2a'], [0.4, wood], [1, '#0a0402']], [0, 0, 1, 0]);
  for (const [x, top, w] of [[68, 4, 4.4], [84, 16, 3.6], [100, 24, 3.6]]) {
    s += R(x - w / 2, top, w, 52 - top, tw, OL(0.4, '#000000'));
    for (const yy of [top + 7, top + 18, top + 26]) s += R(x - w / 2 - 0.8, yy, w + 1.6, 2.2, shV('#f4ecd8'), OL(0.2, '#8a8070'));
    s += Pa(`M${x - w / 2 - 2} ${top} L${x + w / 2 + 2} ${top} L${x + w / 2 + 0.4} ${top + 5} L${x - w / 2 - 0.4} ${top + 5} Z`, shV('#f4ecd8'), OL(0.3, '#8a8070'));
  }
  s += SP('M68 30 Q86 48 100 40', '#c83a2a', 1.2) + Ci(80, 42, 1.6, shR('#e8c14a'), { flat: true });
  // 氣袋：深綠格紋
  const bag = 'M40 50 C40 34 66 32 92 44 C114 54 112 76 90 78 C62 80 40 72 40 50 Z';
  s += Pa(bag, grad([[0, '#4a7a5a'], [0.5, '#2a5a3a'], [1, '#0e2a18']], [0.2, 0, 0.7, 1]), OL(0.7, '#0a1a10'));
  for (const x of [50, 58, 66, 74, 82, 90, 98]) s += L(x, 36, x - 6, 80, '#0e2a18', 2.2, { opacity: 0.5 });
  for (const y of [44, 52, 60, 68, 76]) s += L(40, y, 110, y + 4, '#0e2a18', 2.2, { opacity: 0.5 });
  for (const x of [54, 70, 86]) s += L(x, 36, x - 6, 80, '#c83a2a', 0.6, { opacity: 0.8 });
  for (const y of [48, 64]) s += L(40, y, 110, y + 4, '#e8c14a', 0.5, { opacity: 0.8 });
  s += Pa(bag, 'none', { stroke: '#e8c14a', 'stroke-width': 0.4, opacity: 0.5 });
  s += Pa('M44 42 C54 36 70 36 84 40', 'none', { stroke: '#ffffff', 'stroke-width': 1.2, opacity: 0.2 });
  // 吹管（左上）＋指管（往下，有指孔）
  s += L(48, 44, 22, 26, '#000000', 4.6) + L(48, 44, 22, 26, '#4a2a14', 3.2) + L(36, 35.5, 39, 37.6, '#f4ecd8', 3.2);
  s += Pa('M17 21.4 L22 19.6 L25 25.6 L20 27.4 Z', shV('#f4ecd8'), OL(0.3, '#8a8070'));
  s += Pa('M58 74 L54 96 L66 96 L64 74 Z', grad([[0, '#7a4a2a'], [0.4, wood], [1, '#0a0402']], [0, 0, 1, 0]), OL(0.4, '#000000')) + R(56.6, 74, 8.4, 2.2, shV('#f4ecd8'), { flat: true });
  for (let i = 0; i < 4; i++) s += Ci(60 - i * 0.4, 80 + i * 3.8, 0.9, '#000000', { flat: true });
  s += Pa('M54 96 L66 96 L67 99 L53 99 Z', shV('#f4ecd8'), { flat: true });
  return s;
}
// 迪吉里杜管：長木管、白蟻蛀空的自然外形、原住民點畫紋
function didgeridoo() {
  const f = grad([[0, '#e08a4a'], [0.35, '#a85a28'], [0.8, '#5a2a0e'], [1, '#2a1004']]);
  let s = Pa('M7 45.6 Q51 41.6 101 42.6 Q131 41.6 155 35.6 L155 67.6 Q131 61.6 101 60.6 Q51 61.6 7 57.6 Z', '#000000', { flat: true, opacity: 0.4 });
  s += Pa('M6 44 Q50 40 100 41 Q130 40 154 34 L154 66 Q130 60 100 59 Q50 60 6 56 Z', f, OL(0.6, '#2a1004'));
  s += E(6, 50, 3, 6, grad([[0, '#2a1a0a'], [1, '#6a4a1a']]), OL(0.5, '#1a0a04')) + E(6, 50, 2, 4.4, '#0a0402', { flat: true });
  s += E(154, 50, 4, 16, grad([[0, '#6a3a1a'], [1, '#1a0804']], [1, 0, 0, 0]), OL(0.6, '#2a1004')) + E(154.6, 50, 2.6, 13, '#0a0402', { flat: true });
  // 點畫紋：白、赭黃、黑三色
  for (let i = 0; i < 12; i++) {
    const x = 18 + i * 11.4;
    s += Ci(x, 45.6, 1.1, '#f4ecd0', { flat: true }) + Ci(x + 5.7, 54.4, 1.1, '#e8b84a', { flat: true }) + Ci(x + 2.8, 50, 0.8, '#1a0804', { flat: true });
  }
  s += SP('M24 50 Q44 44 64 50 T104 50 T140 48', '#f4ecd0', 1.1) + SP('M24 51.6 Q44 45.6 64 51.6 T104 51.6 T140 49.6', '#1a0804', 0.5);
  s += L(10, 43.4, 150, 36, '#ffffff', 0.8, { opacity: 0.25 });
  return s;
}
// 口琴：銀色蓋板、一排吹孔
function harmonica() {
  let s = RR(16, 34, 128, 32, 3, '#000000', { flat: true, opacity: 0.5 });
  s += RR(16, 32, 128, 36, 3, grad([[0, '#a06a3a'], [1, '#4a2a10']]), OL(0.5, '#2a1406'));
  const plate = grad([[0, '#ffffff'], [0.25, '#c8ccd4'], [0.5, '#eef0f4'], [0.8, '#9aa0aa'], [1, '#6a707a']]);
  s += Pa('M12 29 L148 29 L146 45 L14 45 Z', plate, OL(0.5, '#3a3e46')) + Pa('M14 55 L146 55 L148 71 L12 71 Z', plate, OL(0.5, '#3a3e46'));
  for (let i = 0; i < 6; i++) s += L(16, 31 + i * 2.2, 144, 31 + i * 2.2, '#ffffff', 0.3, { opacity: 0.35 });
  for (const x of [20, 140]) s += Ci(x, 37, 1, shR('#c8ccd4'), OL(0.3, '#3a3e46')) + Ci(x, 63, 1, shR('#c8ccd4'), OL(0.3, '#3a3e46'));
  for (let i = 0; i < 10; i++) s += RR(22 + i * 12, 46, 8, 8, 1.2, '#0a0604', { flat: true }) + R(22 + i * 12, 46, 8, 1.6, '#000000', { flat: true, opacity: 0.6 });
  for (let i = 0; i < 10; i++) s += T(26 + i * 12, 42, String(i + 1), '#4a4e56', 5);
  return s;
}
// 嗩吶：圓錐木管、銅製碗形大喇叭、銅芯子＋小哨片、氣牌（圓盤）
function suona() {
  let s = Pa('M30 45.6 L96 42 L96 58 L30 54.4 Z', grad([[0, '#a85a2a'], [0.35, '#6a2e10'], [1, '#1a0602']]), OL(0.5, '#1a0602'));
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 8;
    s += R(x - 2.6, 44.6 - i * 0.2, 0.8, 10.8 + i * 0.4, '#c8a050', { flat: true, opacity: 0.6 }) + Ci(x, 50, 1.6, '#0a0402', { flat: true });
  }
  s += R(93, 41, 4, 18, tubeH(C.brass), OL(0.4, C.brassD));
  s += Pa('M96 44 Q130 42 154 18 L154 82 Q130 58 96 56 Z', grad([[0, lit(C.brass, 0.55)], [0.4, C.brass], [1, dim(C.brass, 0.5)]]), OL(0.7, C.brassD));
  s += SP('M100 45 Q126 43 148 22', lit(C.brass, 0.75), 1, { opacity: 0.85 });
  s += E(154, 50, 4, 32, grad([[0, dim(C.brass, 0.6)], [0.6, dim(C.brass, 0.3)], [1, lit(C.brass, 0.3)]], [0, 0, 1, 0]), OL(0.8, lit(C.brass, 0.3)));
  // 芯子、氣牌、哨片
  s += R(14, 48, 16, 4, tubeV(C.brass), OL(0.3, C.brassD)) + E(20, 50, 1.6, 7, shR(C.brass), OL(0.4, C.brassD));
  s += Po('3,47.4 14,48.6 14,51.4 3,52.6', grad([[0, '#f0d8a0'], [1, '#a88848']]), OL(0.3, '#6a5020')) + L(6, 48, 6, 52, '#8a6a30', 0.4);
  return s;
}
// 笙：碗形笙斗（斗子）、吹嘴、一圈長短不一的竹管、金屬箍
function sheng() {
  let s = '';
  const lens = [50, 58, 68, 76, 66, 80, 72, 62, 74, 64, 56, 48, 42];
  for (let i = 0; i < lens.length; i++) {
    const x = 46 + i * 5.6, top = 74 - lens[i], c = i % 2 ? C.bamboo : '#e6d08c';
    s += RR(x, top, 5, 68 - top, 2, tubeH(c), OL(0.5, dim(c, 0.6)));
    s += L(x + 0.6, top + 4, x + 4.4, top + 4, dim(c, 0.5), 0.8) + E(x + 2.5, top + 0.8, 2, 0.8, '#3a2a10', { flat: true });
    if (i % 3 === 1) s += Ci(x + 2.5, 60, 0.8, '#1a1008', { flat: true });
  }
  s += R(43, 48, 77, 3.4, tubeV('#e8ecf0'), OL(0.4, '#4a4e56')) + R(43, 30, 77, 2.4, tubeV('#e8ecf0'), OL(0.4, '#4a4e56'));
  // 笙斗（白銅）＋雕花
  s += Pa('M42 66 L122 66 Q124 88 82 90 Q40 88 42 66 Z', grad([[0, '#ffffff'], [0.3, '#c8ccd4'], [0.6, '#e8ecf0'], [1, '#6a707a']], [0, 0, 1, 0]), OL(0.6, '#3a3e46'));
  s += E(82, 66, 40, 4, grad([[0, '#e8ecf0'], [1, '#8a909a']]), OL(0.5, '#4a4e56'));
  s += SP('M50 74 Q82 82 114 74', '#8a909a', 0.6) + SP('M56 80 Q82 86 108 80', '#8a909a', 0.5);
  for (let i = 0; i < 5; i++) s += Ci(58 + i * 12, 77, 1.4, '#5a606a', { flat: true });
  s += Pa('M120 76 L148 72 L148 80 L120 82 Z', tubeV('#c8ccd4'), OL(0.5, '#3a3e46')) + E(148, 76, 2, 4, grad([[0, '#2a2e34'], [1, '#8a909a']]), OL(0.4, '#3a3e46'));
  return s;
}

// ══ 鍵盤樂器 ═════════════════════════════════════════════════════
// 平台鋼琴（俯視，琴蓋打開）：彎曲側板、琴弦區、鍵盤在下
function grandPiano(o = {}) {
  const c = o.c || '#16161a', board = o.board || '#c8954c';
  // 俯視外形在 (0..120, 0..44) 的局部座標，再用 skew 壓成斜視
  const rim = 'M0 0 L0 44 L118 44 C124 44 126 38 124 32 C118 18 96 18 78 10 C64 4 52 0 36 0 Z';
  let s = '';
  // 腿與踏板（在琴身下方）
  for (const [x, h] of [[24, 30], [120, 24], [70, 16]]) s += Pa(`M${x} 64 L${x + 4} 64 L${x + 3.4} ${64 + h} L${x + 0.6} ${64 + h} Z`, shH(lit(c, 0.15)), OL(0.5, '#000000')) + R(x - 0.6, 64 + h - 1, 5.2, 1.6, C.gold, { flat: true });
  s += Pa('M36 70 L44 70 L44 88 L36 88 Z', shH(lit(c, 0.15)), { flat: true }) + R(35, 88, 10, 2, C.gold, { flat: true });
  // 側板（厚度）
  s += G('translate(14 46) scale(1 0.5)', Pa(rim, c, { flat: true }));
  s += Pa('M14 68 L14 76 L132 76 C138 76 140 72 139 68 Z', grad([[0, lit(c, 0.22)], [0.5, c], [1, dim(c, 0.5)]]), { flat: true });
  // 響板與鐵骨架、琴弦
  let top = Pa(rim, lit(c, 0.1), OL(1, '#000000'));
  top += G('translate(3 3) scale(0.95)', Pa(rim, grad([[0, lit(board, 0.25)], [1, dim(board, 0.15)]], [0, 0, 1, 1]), { flat: true }));
  top += G('translate(4 4) scale(0.93)', Pa('M0 0 L36 0 C52 0 64 4 78 10 L72 14 C58 8 48 5 34 5 L6 5 L6 40 L0 40 Z', grad([[0, '#f4d878'], [0.5, C.gold], [1, '#a8822a']], [0, 0, 1, 1]), { flat: true }));
  for (let i = 0; i < 14; i++) top += L(8, 7 + i * 2.6, lerp(40, 118, i / 13), 7 + i * 2.6, '#f0e4c0', 0.35, { opacity: 0.85 });
  for (const [x, y] of [[40, 16], [70, 26], [100, 34]]) top += Ci(x, y, 2.6, grad([[0, '#f4d878'], [1, '#a8822a']]), { flat: true });
  s += G('translate(14 46) scale(1 0.5)', top);
  // 琴蓋：沿直邊（上緣）掀起，頂桿撐著
  s += L(70, 50, 80, 22, tubeH('#3a3a40'), 1);
  s += Pa('M14 46 L50 46 C66 46 78 40 92 32 C110 22 134 22 138 10 C138 6 132 6 126 8 L44 8 L14 30 Z', grad([[0, '#4a4a54'], [0.3, c], [0.8, '#000000'], [1, '#2a2a30']], [0, 0, 1, 1]), OL(0.7, '#000000'));
  s += SP('M18 32 L46 12 L124 11', '#ffffff', 0.6, { opacity: 0.35 });
  // 鍵盤（前方）＋鍵盤蓋側板
  s += Po('8,46 16,46 16,70 8,70', shH(c), { flat: true });
  s += G('translate(16 64) skewX(-40) scale(1 0.42)', keys(0, 0, 36, 14, 14, { felt: false }));
  s += Po('14,64 66,64 64,67 12,67', '#0c0c10', { flat: true });
  if (o.felt) s += R(18, 61, 46, 2, '#c06a3a', { flat: true });
  return s;
}
// 直立鋼琴（正面）
function uprightPiano(o = {}) {
  const c = o.c || '#4a2a18';
  let s = R(26, 12, 108, 72, grad([[0, lit(c, 0.25)], [0.5, c], [1, dim(c, 0.3)]], [0, 0, 1, 0]), OL(0.8, dim(c, 0.7)));
  s += R(22, 9, 116, 5, shV(lit(c, 0.1)), OL(0.6, dim(c, 0.7)));
  s += R(34, 18, 92, 32, shV(o.panel || lit(c, 0.12)), OL(0.6, dim(c, 0.6)));
  s += R(38, 22, 84, 24, 'none', { stroke: lit(c, 0.3), 'stroke-width': 0.6, opacity: 0.7 });
  s += grain(38, 22, 84, 24, dim(c, 0.4), 5, 0.35);
  // 譜架與樂譜
  s += R(62, 36, 36, 3, shV(dim(c, 0.2)), { flat: true }) + Po('66,24 94,24 95,36 65,36', '#f4f0e6', OL(0.4, '#8a8070'));
  for (let i = 0; i < 4; i++) s += L(68, 27 + i * 2.4, 92, 27 + i * 2.4, '#8a8070', 0.3);
  if (o.candle) for (const x of [44, 116]) s += R(x - 1, 22, 2, 7, '#f4f0e0', { flat: true }) + E(x, 20.6, 1.2, 2, '#ffd23a', { flat: true }) + R(x - 3, 29, 6, 1.4, C.gold, { flat: true });
  s += R(22, 52, 116, 7, shV(lit(c, 0.1)), OL(0.6, dim(c, 0.7)));
  s += keys(26, 59, 108, 13, 22);
  s += R(26, 72, 108, 12, shV(c), OL(0.6, dim(c, 0.7))) + grain(30, 74, 100, 8, dim(c, 0.4), 3, 0.3);
  s += R(28, 84, 7, 12, shH(c), OL(0.6, dim(c, 0.7))) + R(125, 84, 7, 12, shH(c), OL(0.6, dim(c, 0.7)));
  for (const x of [72, 80, 88]) s += RR(x - 1.6, 89, 3.2, 6, 1.2, grad([[0, '#fff2b0'], [1, C.brassD]], [0, 0, 1, 0]), { flat: true });
  return s;
}
// 玩具鋼琴：小型、彩色、短腳
function toyPiano() {
  let s = Pa('M20 30 L140 30 L140 66 L20 66 Z', grad([[0, '#f07b5a'], [0.5, '#e0503a'], [1, '#8a2010']]), OL(0.6, '#5a1006'));
  s += Pa('M30 18 L130 18 L140 30 L20 30 Z', grad([[0, '#f8a080'], [1, '#e0603a']]), OL(0.5, '#5a1006'));
  s += R(26, 46, 108, 21, '#2a0a04', { flat: true }) + keys(28, 48, 104, 18, 12, { felt: false });
  s += Ci(80, 38, 5, shR('#ffd23a'), OL(0.4, '#8a6a10'));
  for (const x of [56, 104]) s += Ci(x, 38, 3, shR('#5ac8fa'), OL(0.4, '#1a5a7a'));
  for (const x of [28, 124]) s += RR(x, 66, 8, 22, 3, grad([[0, '#f8c060'], [0.5, '#f0a03a'], [1, '#a86010']], [0, 0, 1, 0]), OL(0.5, '#5a3008'));
  return s;
}
// 舞台型鍵盤（電鋼琴／合成器共用）：o.top 上蓋顏色、o.panel 控制面板內容
function stageKeys(o = {}) {
  let s = '';
  const y0 = o.y0 ?? 30, h = o.h ?? 44, lid = o.lid ?? 14, cs = o.case || C.tolex;
  if (o.legs) s += L(30, y0 + h, 22, 96, tubeH('#8a909a'), 2.4) + L(130, y0 + h, 138, 96, tubeH('#8a909a'), 2.4);
  s += RR(8, y0 + 1.6, 144, h, 4, '#000000', { flat: true, opacity: 0.5 });
  s += RR(8, y0, 144, h, 4, grad([[0, lit(cs, 0.18)], [0.4, cs], [1, dim(cs, 0.4)]]), OL(0.8, '#000000'));
  s += RR(10, y0 + 2, 140, lid, 2, grad([[0, lit(o.top || C.black, 0.15)], [1, dim(o.top || C.black, 0.3)]]), { flat: true });
  s += L(12, y0 + 2.6, 148, y0 + 2.6, '#ffffff', 0.4, { opacity: 0.25 });
  s += R(12, y0 + lid + 3, 136, h - lid - 6, '#0a0a0c', { flat: true });
  s += keys(14, y0 + lid + 4, 132, h - lid - 8, o.nkeys || 21, { white: o.white, black: o.black, felt: false });
  if (o.cheeks) s += R(8, y0, 6, h, shH(o.cheeks), OL(0.6, '#000000')) + R(146, y0, 6, h, shH(o.cheeks), OL(0.6, '#000000'));
  return s;
}
// Rhodes 型：黑色上蓋、銀色名條、四支腳
function rhodes(o = {}) {
  let s = stageKeys({ legs: true, y0: 32, h: 40, lid: 16, top: o.top || '#1a1a1e', case: o.case || '#2a2a2e' });
  s += RR(52, 37, 56, 6, 1, grad([[0, '#ffffff'], [0.5, '#c8ccd4'], [1, '#7a808a']]), OL(0.4, '#4a4e56'));
  s += L(56, 40, 104, 40, '#5a606a', 0.4);
  for (let i = 0; i < 3; i++) s += Ci(20 + i * 8, 40, 2.2, grad([[0, '#ffffff'], [1, '#6a707a']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#2a2e34'));
  s += L(10, 48.8, 150, 48.8, '#c8ccd4', 0.6, { opacity: 0.7 });
  return s;
}
// Wurlitzer 型：圓弧蓋、奶油／粉色外殼
function wurli(o = {}) {
  const c = o.c || '#e8d8b8';
  let s = L(34, 70, 26, 96, tubeH('#8a909a'), 2.4) + L(126, 70, 134, 96, tubeH('#8a909a'), 2.4);
  s += Pa('M10 46 Q10 24 32 24 L128 24 Q150 24 150 46 L150 72 L10 72 Z', grad([[0, lit(c, 0.35)], [0.45, c], [1, dim(c, 0.35)]]), OL(0.8, dim(c, 0.6)));
  s += SP('M14 44 Q14 28 32 28 L128 28', '#ffffff', 0.8, { opacity: 0.5 });
  s += R(14, 48, 132, 22, '#0a0a0c', { flat: true });
  s += keys(16, 50, 128, 18, 20, { felt: false });
  for (const x of [122, 132]) s += Ci(x, 36, 3, grad([[0, '#4a4a4a'], [1, '#000000']], [0.3, 0.2, 0.7, 1]), { flat: true }) + L(x, 36, x + 1.6, 34, '#ffffff', 0.6);
  s += RR(28, 32, 40, 3, 1, grad([[0, '#ffffff'], [1, '#8a909a']]), { flat: true });
  return s;
}
// Clavinet：木紋外殼、楔形、蓋子上有拾音器滑桿
function clavinet(o = {}) {
  const c = o.c || '#6b3a1a';
  let s = L(30, 68, 24, 96, tubeH('#8a909a'), 2.4) + L(130, 68, 136, 96, tubeH('#8a909a'), 2.4);
  s += Po('8,30 152,30 152,72 8,72', grad([[0, lit(c, 0.25)], [0.5, c], [1, dim(c, 0.35)]]), OL(0.8, dim(c, 0.7)));
  s += grain(10, 60, 140, 10, dim(c, 0.4), 3, 0.4);
  s += R(10, 32, 140, 14, shV('#1a1a1e'), { flat: true });
  for (let i = 0; i < 4; i++) s += RR(18 + i * 10, 35.6, 6, 6.8, 1, shV(i % 2 ? '#c83a2a' : '#e8ecf0'), OL(0.4, '#000000'));
  s += R(76, 37.4, 60, 2.6, grad([[0, '#ffffff'], [1, '#6a707a']]), { flat: true }) + RR(98, 35.4, 5, 6.6, 1, shV('#2a2a2e'), { flat: true });
  s += R(11, 48, 138, 21, '#0a0a0c', { flat: true }) + keys(12, 50, 136, 18, 22, { felt: false });
  return s;
}
// 大鍵琴：俯視、斜角琴身、兩排鍵盤（黑白顛倒：下鍵黑、上鍵白）
function harpsichord() {
  let s = Pa('M13 19.6 L13 83.6 L151 83.6 L151 75.6 Q121 61.6 71 35.6 Q53 23.6 41 19.6 Z', '#0a140e', { flat: true });
  s += Pa('M12 18 L12 82 L150 82 L150 74 Q120 60 70 34 Q52 22 40 18 Z', grad([[0, '#4a6a54'], [0.5, '#2f4a3a'], [1, '#1a2a20']], [0, 0, 1, 1]), OL(0.8, '#0a140e'));
  s += Pa('M14.6 20.6 L14.6 79.4 L147.4 79.4 L147.4 75.6 Q119 62 69 36.4 Q52 24.6 40 20.6 Z', 'none', { stroke: C.gold, 'stroke-width': 0.8 });
  s += Pa('M30 22 L30 78 L146 78 L146 76 Q118 62 68 38 Q52 26 40 22 Z', grad([[0, '#f8e4b0'], [1, '#d8b070']], [0, 0, 1, 1]), { flat: true });
  for (let i = 0; i < 12; i++) s += L(32, 25 + i * 4.4, lerp(58, 144, i / 11), 25 + i * 4.4, '#a88850', 0.35);
  s += SP('M40 24 Q70 46 140 76', grad([[0, '#8a5a2a'], [1, '#4a2a10']], [0, 0, 1, 1]), 1.6);
  // 響板上的玫瑰花窗與彩繪花
  s += Ci(84, 60, 5.6, 'none', { stroke: C.gold, 'stroke-width': 1 }) + Ci(84, 60, 3.6, 'none', { stroke: '#8a5a2a', 'stroke-width': 0.6 });
  for (const [x, y, cc] of [[56, 44, '#c84a5a'], [104, 70, '#4a7ac8'], [70, 70, '#c8a04a']]) s += Ci(x, y, 2, cc, { flat: true, opacity: 0.8 }) + Ci(x + 2.4, y - 1, 1.2, '#5a9a5a', { flat: true, opacity: 0.8 });
  // 兩排鍵盤（左側，直立排）：下鍵黑檀、升降鍵骨白
  s += R(2, 18, 10, 64, '#0a0806', { flat: true }) + R(13, 18, 8, 64, '#0a0806', { flat: true });
  for (let i = 0; i < 14; i++) s += R(3, 19.2 + i * 4.5, 8, 3.8, shH('#2a221c'), { flat: true }) + R(14, 19.2 + i * 4.5, 6, 3.8, shH('#2a221c'), { flat: true });
  for (const i of [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]) s += R(3, 21.8 + i * 4.5, 5, 2.6, shV('#f4ecd8'), { flat: true }) + R(14, 21.8 + i * 4.5, 4, 2.6, shV('#f4ecd8'), { flat: true });
  return s;
}
// 鋼片琴：直立櫃、小鍵盤、雙腳踏
function celesta() {
  const w = '#6a3c20', wf = grad([[0, lit(w, 0.25)], [0.5, w], [1, dim(w, 0.45)]], [0, 0, 1, 0]);
  let s = R(22, 14, 116, 46, wf, OL(0.6, '#1a0804')) + R(18, 10, 124, 6, shV(lit(w, 0.1)), OL(0.5, '#1a0804'));
  s += R(34, 20, 92, 30, '#1a0c06', { flat: true });
  for (let i = 0; i < 8; i++) s += RR(40 + i * 10.6, 24 + (i % 2) * 2, 7, 22 - (i % 2) * 4, 1, tubeH('#c8ccd4'), OL(0.3, '#3a3e46'));
  s += R(34, 20, 92, 30, 'none', { stroke: '#c8a050', 'stroke-width': 0.8 });
  s += R(24, 58, 112, 15, '#0a0604', { flat: true }) + keys(28, 60, 104, 12, 14, { felt: false });
  s += R(22, 72, 116, 4, shV(w), OL(0.4, '#1a0804'));
  s += Pa('M30 76 L26 96 L34 96 L38 76 Z', wf, OL(0.5, '#1a0804')) + Pa('M130 76 L134 96 L126 96 L122 76 Z', wf, OL(0.5, '#1a0804'));
  s += R(70, 90, 20, 4, grad([[0, '#fff0a0'], [1, '#7a5a10']]), OL(0.4, '#4a3008'));
  return s;
}
// 音輪風琴：木櫃、上下兩層鍵盤、拉桿（drawbars）、旋轉喇叭箱
function tonewheel(o = {}) {
  const w = o.wood || '#7a4520', wf = grad([[0, lit(w, 0.25)], [0.5, w], [1, dim(w, 0.4)]], [0, 0, 1, 0]);
  let s = R(18, 20, 108, 76, wf, OL(0.6, dim(w, 0.7))) + grain(22, 66, 100, 26, dim(w, 0.4), 6, 0.35);
  s += R(14, 17, 116, 6, shV(lit(w, 0.1)), OL(0.5, dim(w, 0.7)));
  s += R(16, 20, 5, 76, shH(dim(w, 0.15)), { flat: true }) + R(123, 20, 5, 76, shH(dim(w, 0.15)), { flat: true });
  s += R(24, 24, 96, 12, '#1a0e08', { flat: true });
  const cols = ['#7a3a1a', '#7a3a1a', '#f3ecda', '#f3ecda', '#18181a', '#f3ecda', '#18181a', '#18181a', '#f3ecda'];
  for (let i = 0; i < 9; i++) { const h = 6 + (i * 37 % 5) * 1.6; s += R(28 + i * 5, 24, 3.4, h, shH(cols[i]), OL(0.3, '#000000')) + R(27.6 + i * 5, 23 + h, 4.2, 2, shV(cols[i]), { flat: true }); }
  for (let i = 0; i < 9; i++) { const h = 5 + (i * 53 % 4) * 1.6; s += R(80 + i * 4.2, 24, 2.8, h, shH(cols[i]), OL(0.3, '#000000')) + R(79.6 + i * 4.2, 23 + h, 3.6, 1.8, shV(cols[i]), { flat: true }); }
  for (let i = 0; i < 3; i++) s += R(73, 25 + i * 3.4, 4, 2.6, shV(i ? '#18181a' : '#f3ecda'), { flat: true });
  s += keys(22, 38, 100, 10, 17, { bh: 0.62, felt: false }) + R(22, 48, 100, 2, '#0a0604', { flat: true }) + keys(22, 50, 100, 10, 17, { bh: 0.62, felt: false });
  s += R(22, 60, 100, 4, shV('#2a1a10'), { flat: true });
  s += R(80, 78, 12, 8, shV('#1a1a1e'), OL(0.4, '#000000'));
  s += R(28, 88, 88, 6, '#0a0604', { flat: true });
  for (let i = 0; i < 9; i++) s += R(30 + i * 9.6, 89, 7.4, 4, shV('#f4f0e6'), { flat: true });
  for (const i of [0, 2, 4, 6]) s += R(35 + i * 9.6, 89, 4, 3, shV('#1a1a1e'), { flat: true });
  if (o.leslie !== false) {
    s += R(132, 40, 24, 56, wf, OL(0.6, dim(w, 0.7))) + R(130, 38, 28, 4, shV(lit(w, 0.1)), OL(0.4, dim(w, 0.7)));
    s += R(135, 44, 18, 14, '#120a06', { flat: true });
    for (let i = 0; i < 5; i++) s += L(135.5, 45.4 + i * 2.6, 152.5, 45.4 + i * 2.6, '#c8a070', 0.8);
    s += R(135, 64, 18, 26, '#120a06', { flat: true }) + Ci(144, 77, 7.4, grad([[0, '#5a4a40'], [1, '#1a1210']], [0.4, 0.4, 0.7], true), { flat: true });
    for (let i = 0; i < 6; i++) s += L(136, 66 + i * 4.4, 152, 66 + i * 4.4, '#3a2a20', 0.4);
  }
  if (o.badge) s += badge(o.badge, o.badgeC || C.gold, C.ol, 144, 24);
  return s;
}
// 教堂管風琴：一排錫管（中間最高）、木框、鍵台
function pipeOrgan(o = {}) {
  const w = '#5a3018', wf = grad([[0, lit(w, 0.25)], [0.5, w], [1, dim(w, 0.4)]], [0, 0, 1, 0]);
  let s = R(10, 50, 140, 48, wf, OL(0.6, '#1a0804'));
  s += Pa('M10 50 L10 26 L18 18 L18 50 Z', wf, OL(0.5, '#1a0804')) + Pa('M150 50 L150 26 L142 18 L142 50 Z', wf, OL(0.5, '#1a0804'));
  const n = 15, metal = o.c || C.silver;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - 7), h = 66 - d * 6 + (d % 2) * 4, x = 14 + i * 8.9, top = 70 - h, mouth = top + h - 12;
    s += R(x, top, 7, h - 6, tubeH(metal), OL(0.4, dim(metal, 0.6)));
    s += Po(`${x},${top + h - 6} ${x + 7},${top + h - 6} ${x + 4.4},${top + h} ${x + 2.6},${top + h}`, tubeH(metal), OL(0.3, dim(metal, 0.6)));
    s += Pa(`M${x + 1.2} ${mouth} L${x + 5.8} ${mouth} L${x + 5.4} ${mouth + 2.4} Q${x + 3.5} ${mouth + 3.6} ${x + 1.6} ${mouth + 2.4} Z`, '#1a1a1e', { flat: true });
    s += Pa(`M${x + 1.2} ${mouth - 3} L${x + 3.5} ${mouth - 0.4} L${x + 5.8} ${mouth - 3}`, 'none', { stroke: dim(metal, 0.5), 'stroke-width': 0.4 });
    if (o.flue) s += E(x + 3.5, top + 1, 3.5, 1, '#1a1a1e', { flat: true });
  }
  s += R(10, 70, 140, 4, grad([[0, '#fff0a0'], [0.5, C.gold], [1, '#7a5a10']]), OL(0.4, '#4a3008'));
  s += R(30, 76, 100, 18, '#140a04', { flat: true });
  s += keys(34, 77, 92, 7.4, 14, { felt: false }) + keys(34, 86, 92, 7.4, 14, { felt: false });
  const stops = (x0) => range(6).map(i => Ci(x0 + (i % 2) * 8, 80 + Math.floor(i / 2) * 5, 1.8, grad([[0, '#ffffff'], [1, i % 3 ? '#c8c0b0' : '#c83a2a']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#4a4038'))).join('');
  s += R(14, 76, 14, 18, '#2a1408', { flat: true }) + R(132, 76, 14, 18, '#2a1408', { flat: true });
  if (o.full) s += stops(17) + stops(135);
  else s += range(3).map(i => Ci(21, 80 + i * 5, 1.6, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), { flat: true }) + Ci(139, 80 + i * 5, 1.6, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), { flat: true })).join('');
  return s;
}
// 簧風琴／腳踏簧風琴：雕花木櫃、拉鈕（stops）、兩塊腳踏板
function reedOrgan(o = {}) {
  const w = '#6a3518', wf = grad([[0, lit(w, 0.25)], [0.5, w], [1, dim(w, 0.45)]], [0, 0, 1, 0]);
  let s = Pa('M20 10 L140 10 L140 16 L132 16 L132 46 L28 46 L28 16 L20 16 Z', wf, OL(0.6, '#1a0804'));
  s += Pa('M60 10 Q80 0 100 10 Z', wf, OL(0.5, '#1a0804')) + Ci(80, 6.6, 2, shR(C.gold), { flat: true });
  s += R(46, 18, 68, 22, grad([[0, '#2a1408'], [1, '#4a2410']]), OL(0.5, '#1a0804'));
  s += E(80, 29, 9, 8, grad([[0, '#c8d8e0'], [1, '#4a5a68']], [0, 0, 1, 1]), OL(0.6, C.gold));
  for (const x of [52, 108]) s += SP(`M${x} 22 q-3 7 0 14`, '#a86a3a', 0.8);
  for (let i = 0; i < 8; i++) {
    const x = 36 + i * 12.6;
    s += R(x - 0.6, 47, 1.2, 3, '#e8dcc0', { flat: true }) + Ci(x, 50.4, 2.4, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#6a6050'));
  }
  s += R(20, 46, 120, 50, wf, OL(0.6, '#1a0804')) + grain(24, 72, 112, 22, '#3a1a08', 5, 0.35);
  s += R(24, 53, 112, 14, '#0a0604', { flat: true }) + keys(26, 54, 108, 12, 17, { felt: false });
  if (o.pedals !== false) {
    for (const [a, b] of [[46, 74], [86, 114]]) {
      s += Po(`${a + 2},80 ${b - 2},80 ${b},94 ${a},94`, grad([[0, '#3a1a0a'], [1, '#0a0402']]), OL(0.4, '#000000'));
      s += Po(`${a + 4},82 ${b - 4},82 ${b - 2.4},92 ${a + 2.4},92`, grad([[0, '#8a2a2a'], [1, '#4a0a0a']]), { flat: true });
      for (let k = 0; k < 4; k++) s += L(a + 5, 84 + k * 2.2, b - 5, 84 + k * 2.2, '#c8a050', 0.4, { opacity: 0.6 });
    }
  } else s += R(30, 74, 100, 18, grad([[0, '#4a2410'], [1, '#2a1408']]), OL(0.4, '#1a0804')) + R(34, 77, 92, 12, 'none', { stroke: '#a86a3a', 'stroke-width': 0.6 });
  return s;
}
// 印度簧風琴（harmonium）：手壓風箱在後、桌上型小木箱
function harmonium() {
  let s = R(14, 20, 132, 18, grad([[0, '#5a3018'], [1, '#2a1006']]), OL(0.5, '#1a0804'));
  for (let i = 0; i < 7; i++) s += Po(`14,${21 + i * 2.4} 146,${21 + i * 2.4} 146,${22.6 + i * 2.4} 14,${22.6 + i * 2.4}`, i % 2 ? '#1a0a04' : '#4a2410', { flat: true });
  s += R(14, 20, 4, 18, tubeH('#c8a050'), { flat: true }) + R(142, 20, 4, 18, tubeH('#c8a050'), { flat: true });
  s += R(14, 38, 132, 44, grad([[0, '#c88a4a'], [0.5, '#9a5a2a'], [1, '#4a2410']]), OL(0.6, '#2a1006')) + grain(18, 64, 124, 16, '#5a2a10', 4, 0.4);
  s += R(20, 41, 120, 19, '#0a0604', { flat: true }) + keys(22, 42, 116, 16, 17, { felt: false });
  for (let i = 0; i < 7; i++) s += Ci(30 + i * 16.6, 71, 3, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#6a6050')) + Ci(30 + i * 16.6, 71, 1, '#8a8070', { flat: true });
  s += R(16, 82, 128, 2, '#1a0804', { flat: true });
  return s;
}
// 汽笛琴：馬戲團汽笛管（銅）一排、紅色車箱
function calliope() {
  let s = R(14, 54, 132, 36, grad([[0, '#e04a3a'], [0.5, '#b8322a'], [1, '#5a0a04']]), OL(0.6, '#3a0402'));
  s += R(14, 54, 132, 6, grad([[0, '#fff0a0'], [0.5, C.gold], [1, '#7a5a10']]), OL(0.4, '#4a3008')) + R(14, 86, 132, 3, grad([[0, '#fff0a0'], [1, '#7a5a10']]), { flat: true });
  for (let i = 0; i < 12; i++) {
    const x = 20 + i * 10.6, h = 26 + (i % 3) * 6 + (i > 5 ? 6 : 0);
    s += R(x, 54 - h, 7, h, tubeH(C.brass), OL(0.4, C.brassD));
    s += Pa(`M${x - 0.6} ${54 - h} Q${x + 3.5} ${54 - h - 4} ${x + 7.6} ${54 - h} Z`, tubeH(C.brass), OL(0.3, C.brassD)) + Ci(x + 3.5, 54 - h - 3, 0.9, shR(C.brass), { flat: true });
    s += R(x + 1, 54 - h + 4, 5, 2, '#2a1a04', { flat: true }) + R(x - 0.6, 46, 8.2, 3, tubeH(lit(C.brass, 0.2)), OL(0.2, C.brassD));
  }
  for (let i = 0; i < 6; i++) s += Ci(28 + i * 21, 72, 4.4, grad([[0, '#fff0a0'], [1, '#7a5a10']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#4a3008')) + SP(`M${24 + i * 21} 72 q4 -6 8 0`, '#5a0a04', 0.8);
  for (const x of [36, 124]) s += Ci(x, 92, 6.4, grad([[0, '#4a3a30'], [1, '#0a0604']], [0.4, 0.4, 0.7], true), OL(0.5, '#000000')) + Ci(x, 92, 2.6, shR(C.gold), { flat: true }) +
    range(6).map(k => L(x, 92, x + Math.cos(k * 1.047) * 5.6, 92 + Math.sin(k * 1.047) * 5.6, '#c8a050', 0.6)).join('');
  for (let i = 0; i < 4; i++) s += Ci(30 + i * 12, 14 - i * 3, 6 - i, '#e8e8ee', { opacity: 0.5 - i * 0.08 });
  return s;
}
// 手風琴：右手鋼琴鍵、中間風箱、左手貝斯鈕
function accordion(o = {}) {
  const c = o.c || '#b8222a', shell = grad([[0, lit(c, 0.4)], [0.35, c], [1, dim(c, 0.5)]], [0, 0, 1, 1]);
  let s = RR(14, 16, 34, 70, 3, shell, OL(0.6, dim(c, 0.7))) + RR(112, 16, 34, 70, 3, shell, OL(0.6, dim(c, 0.7)));
  for (let i = 0; i < 10; i++) {
    const x = 48 + i * 6.4;
    s += Po(`${x},18 ${x + 3.2},14 ${x + 6.4},18 ${x + 6.4},84 ${x + 3.2},88 ${x},84`, grad([[0, i % 2 ? '#3a3a42' : '#5a5a64'], [1, '#14141a']], [0, 0, 1, 0]), OL(0.4, '#000000'));
    s += L(x + 3.2, 14, x + 3.2, 88, i % 2 ? '#000000' : '#6a6a74', 0.4);
  }
  for (let i = 0; i <= 10; i++) s += R(47 + i * 6.4, 15, 2, 4, tubeH('#e8ecf0'), { flat: true }) + R(47 + i * 6.4, 83, 2, 4, tubeH('#e8ecf0'), { flat: true });
  s += R(16, 20, 14, 62, '#0a0a0c', { flat: true });
  for (let i = 0; i < 12; i++) s += R(17, 21 + i * 5.1, 12, 4.3, grad([[0, '#ffffff'], [1, '#d8d4c8']], [0, 0, 1, 0]), { flat: true });
  for (const i of [0, 1, 3, 4, 5, 7, 8, 10]) s += R(17, 24 + i * 5.1, 7, 3, grad([[0, '#4a4a4e'], [1, '#0a0a0c']], [0, 0, 1, 0]), { flat: true });
  s += R(32, 22, 12, 58, grad([[0, '#f4f0e6'], [1, '#a8a498']], [0, 0, 1, 0]), OL(0.4, '#6a6658'));
  for (let i = 0; i < 9; i++) s += L(34, 26 + i * 6.2, 42, 26 + i * 6.2, o.grille ? C.gold : '#6a6658', 0.8);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) s += Ci(120 + k * 6.4, 26 + r * 9.6 + k * 1.6, 2.1, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#6a6050'));
  s += RR(118, 86, 24, 4, 1, shV('#2a2a2e'), { flat: true });
  return s;
}
// 班多鈕：方形兩端、兩邊都是圓鈕（沒有鋼琴鍵）、木框
function bandoneon() {
  const shell = grad([[0, '#3a3a40'], [0.4, '#1c1c20'], [1, '#000000']], [0, 0, 1, 1]);
  let s = R(12, 20, 38, 62, shell, OL(0.6, '#000000')) + R(110, 20, 38, 62, shell, OL(0.6, '#000000'));
  s += R(15, 23, 32, 56, grad([[0, '#5a3a20'], [1, '#2a1a0c']]), { flat: true }) + R(113, 23, 32, 56, grad([[0, '#5a3a20'], [1, '#2a1a0c']]), { flat: true });
  for (const x of [15, 113]) s += R(x, 23, 32, 56, 'none', { stroke: '#e8e0d0', 'stroke-width': 0.5, opacity: 0.7 });
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 6.7;
    s += Po(`${x},22 ${x + 3.35},18 ${x + 6.7},22 ${x + 6.7},80 ${x + 3.35},84 ${x},80`, grad([[0, i % 2 ? '#3a3a42' : '#5a5a64'], [1, '#14141a']], [0, 0, 1, 0]), OL(0.4, '#000000'));
  }
  for (let i = 0; i <= 9; i++) s += R(49 + i * 6.7, 19, 2, 4, tubeH('#e8ecf0'), { flat: true }) + R(49 + i * 6.7, 79, 2, 4, tubeH('#e8ecf0'), { flat: true });
  for (let r = 0; r < 7; r++) for (let k = 0; k < 4; k++) {
    s += Ci(20 + k * 7.4 + (r % 2) * 3.7, 28 + r * 7.5, 2.2, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#6a6050'));
    s += Ci(118 + k * 7.4 + (r % 2) * 3.7, 28 + r * 7.5, 2.2, grad([[0, '#ffffff'], [1, '#c8c0b0']], [0.3, 0.2, 0.7, 1]), OL(0.3, '#6a6050'));
  }
  s += R(13, 44, 3, 14, shH('#6a4a2a'), { flat: true }) + R(144, 44, 3, 14, shH('#6a4a2a'), { flat: true });
  return s;
}

// ══ 敲擊條（鐘琴、木琴、馬林巴、顫音琴）══════════════════════════════
// 斜視角排列的音條，左長右短；o.res 共鳴管、o.motor 顫音琴轉盤、o.frame 架子顏色
function bars(o = {}) {
  const n = o.n || 12, x0 = 12, x1 = 148, w = (x1 - x0) / n, bar = o.bar || C.woodL, metal = o.metal;
  let s = '';
  if (o.legs) for (const [a, b] of [[22, 18], [138, 142]]) s += L(a, 66, b, 96, tubeH(o.legs), 2.4) + RR(b - 4, 94, 8, 3, 1.2, '#1a1a1e', { flat: true });
  if (o.res) for (let i = 0; i < n; i++) {
    const x = x0 + i * w + w * 0.2, h = 44 - i * 2.4;
    s += R(x, 54, w * 0.6, h, tubeH(o.res), OL(0.4, dim(o.res, 0.6))) + E(x + w * 0.3, 54 + h, w * 0.3, 1, dim(o.res, 0.4), { flat: true });
  }
  const fr = o.frame || C.woodD;
  s += R(x0 - 2, 28, x1 - x0 + 4, 4, shV(fr), OL(0.4, dim(fr, 0.6))) + R(x0 - 2, 56, x1 - x0 + 4, 4, shV(fr), OL(0.4, dim(fr, 0.6)));
  s += L(x0 - 2, 31, x1 + 2, 31, '#e8dcc0', 0.5, { opacity: 0.6 }) + L(x0 - 2, 57, x1 + 2, 57, '#e8dcc0', 0.5, { opacity: 0.6 });
  for (let i = 0; i < n; i++) {
    const len = 46 - i * 1.7, x = x0 + i * w + 1, y = 44 - len / 2, bw = w - 2;
    s += RR(x + 0.6, y + 1.2, bw, len, 1.2, '#000000', { flat: true, opacity: 0.5 });
    s += RR(x, y, bw, len, 1.2, metal ? tubeH(bar) : grad([[0, lit(bar, 0.3)], [0.5, bar], [1, dim(bar, 0.35)]], [0, 0, 1, 0]), OL(0.4, dim(bar, 0.65)));
    if (!metal) s += grain(x + 0.6, y + 2, bw - 1.2, len - 4, dim(bar, 0.4), 2, 0.4);
    // 中段挖弧（馬林巴、木琴音條底部的調音弧，從側面看是較薄的中段）
    if (o.arch) s += R(x + 0.6, y + len * 0.3, bw - 1.2, len * 0.4, '#000000', { flat: true, opacity: 0.12 });
    s += Ci(x + bw / 2, y + 4, 0.8, '#0a0604', { flat: true }) + Ci(x + bw / 2, y + len - 4, 0.8, '#0a0604', { flat: true });
  }
  s += L(x0, 31.2, x1, 31.2, '#c8a870', 0.4) + L(x0, 56.6, x1, 56.6, '#c8a870', 0.4);
  if (o.motor) {
    s += L(x0, 66, x1, 66, tubeV('#9aa0aa'), 1.2);
    for (let i = 0; i < n; i += 2) s += E(x0 + i * w + w / 2, 66, 2.6, 1.2, grad([[0, '#ffffff'], [1, '#6a707a']]), OL(0.3, '#3a3e46'));
    s += R(x1 - 4, 62, 8, 8, shV('#3a3e46'), OL(0.4, '#000000'));
  }
  // 琴槌（藤桿＋毛線頭）
  const m = o.mallet || C.red;
  s += L(96, 90, 120, 66, tubeV('#e8d090'), 1.4) + Ci(120, 66, 3.6, shR(m), OL(0.4, dim(m, 0.6)));
  s += L(108, 96, 134, 72, tubeV('#e8d090'), 1.4) + Ci(134, 72, 3.6, shR(m), OL(0.4, dim(m, 0.6)));
  return s;
}
// 管鐘：架子上一排長管
function tubular() {
  let s = R(14, 8, 132, 5, tubeV('#5a5e68'), OL(0.4, '#1a1c20')) + L(18, 13, 18, 92, tubeH('#5a5e68'), 3) + L(142, 13, 142, 92, tubeH('#5a5e68'), 3);
  s += R(12, 92, 14, 3, '#1a1c20', { flat: true }) + R(134, 92, 14, 3, '#1a1c20', { flat: true }) + R(70, 90, 20, 3, shV('#3a3e46'), { flat: true });
  for (let i = 0; i < 9; i++) {
    const x = 28 + i * 12.4, h = 76 - i * 3.4;
    s += L(x + 1, 13, x + 3, 18, '#c8a870', 0.5) + L(x + 5, 13, x + 3, 18, '#c8a870', 0.5);
    s += R(x, 18, 6, h, tubeH('#c8ccd4'), OL(0.3, '#3a3e46')) + R(x - 0.6, 18, 7.2, 4.4, tubeH(C.brass), OL(0.3, C.brassD)) + E(x + 3, 18 + h, 3, 0.8, '#3a3e46', { flat: true });
  }
  s += L(104, 96, 126, 72, tubeH('#c89058'), 1.8) + `<rect${at({ x: 122, y: 63, width: 12, height: 8, rx: 2.4, fill: shV('#6a4a2a'), stroke: '#2a1a0a', 'stroke-width': 0.4, transform: 'rotate(-45 128 67)' })}/>`;
  return s;
}
// 教堂鐘：典型西洋鐘形（肩、腰、外張的唇）＋鐘舌
function churchBell() {
  let s = R(52, 3, 56, 7, grad([[0, '#8a5a2a'], [1, '#3a1a08']]), OL(0.5, '#1a0804')) + R(56, 5, 48, 1, '#c8a070', { flat: true, opacity: 0.6 });
  for (const x of [54, 106]) s += Ci(x, 6.5, 1.4, '#c8ccd4', { flat: true });
  s += R(75, 10, 10, 6, shH(C.bronzeD), OL(0.4, '#3a2008'));
  const body = 'M80 14 C64 14 58 24 58 40 C58 58 54 70 40 80 L120 80 C106 70 102 58 102 40 C102 24 96 14 80 14 Z';
  s += Pa(body, grad([[0, '#f0c070'], [0.3, C.bronze], [0.7, '#7a5020'], [1, '#3a2008']], [0, 0, 1, 0]), OL(0.6, '#2a1404'));
  s += SP('M66 24 C63 40 63 56 50 72', '#ffe0a0', 2, { opacity: 0.55 });
  for (const [y, xx] of [[30, 21.6], [36, 22], [64, 27], [70, 31]]) s += L(80 - xx, y, 80 + xx, y, '#5a3a10', 0.7) + L(80 - xx, y + 0.8, 80 + xx, y + 0.8, '#f8d890', 0.3, { opacity: 0.6 });
  for (let k = 0; k < 7; k++) s += R(64 + k * 5, 31.6, 2.6, 3, '#5a3a10', { flat: true, opacity: 0.7 });
  s += E(80, 80, 40, 6, grad([[0, '#3a2008'], [0.5, '#7a5020'], [1, '#f0c070']], [0, 0, 1, 0]), OL(0.6, '#2a1404')) + E(80, 80.6, 33, 4, '#1a0c04', { flat: true });
  s += L(80, 76, 80, 88, tubeH('#3a3e46'), 1.6) + Ci(80, 91, 4.4, shR('#4a4e56'), OL(0.4, '#1a1c20'));
  return s;
}
// 梵鐘（日式寺鐘）：圓筒形、乳（凸點）、撞座、吊龍頭、撞木
function templeBell() {
  const br = grad([[0, '#8ea08a'], [0.35, '#5e6e5a'], [0.75, '#3a4638'], [1, '#1e261c']], [0, 0, 1, 0]);
  let s = R(26, 2, 108, 5, shV('#5a3418'), OL(0.4, '#1a0804'));
  s += Pa('M70 10 Q72 4 78 6 Q80 2 82 6 Q88 4 90 10 L88 16 L72 16 Z', shV('#4a5848'), OL(0.4, '#1a2018'));
  s += Pa('M58 16 Q80 12 102 16 L106 84 Q80 90 54 84 Z', br, OL(0.6, '#141a12'));
  s += Pa('M54 84 Q80 90 106 84 L106 86 Q80 92 54 86 Z', '#141a12', { flat: true });
  // 袈裟襷
  for (const y of [22, 40, 66, 78]) s += SP(`M${56.4 - (y - 16) * 0.06} ${y} Q80 ${y - 2} ${103.6 + (y - 16) * 0.06} ${y}`, '#2a3428', 1);
  s += L(80, 16, 80, 40, '#2a3428', 1) + L(80, 66, 80, 84, '#2a3428', 1);
  // 乳（凸點）
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    s += Ci(62.6 + c * 5, 25 + r * 5, 1.6, grad([[0, '#b8c8b0'], [1, '#3a4638']], [0.3, 0.2, 0.7, 1]), { flat: true });
    s += Ci(87.4 + c * 5, 25 + r * 5, 1.6, grad([[0, '#b8c8b0'], [1, '#3a4638']], [0.3, 0.2, 0.7, 1]), { flat: true });
  }
  // 撞座（蓮花）
  s += Ci(80, 72, 5.4, grad([[0, '#b8c8b0'], [1, '#3a4638']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#1e261c'));
  for (let k = 0; k < 8; k++) { const a = k * 0.785; s += E(80 + Math.cos(a) * 3, 72 + Math.sin(a) * 3, 1.2, 0.7, '#3a4638', { flat: true, transform: `rotate(${f1(a * 57.3)} ${f1(80 + Math.cos(a) * 3)} ${f1(72 + Math.sin(a) * 3)})` }); }
  s += E(66, 50, 3, 22, '#ffffff', { opacity: 0.1 });
  // 撞木（以繩吊起）
  s += L(112, 7, 116, 66, '#c8a870', 0.7) + L(148, 7, 146, 66, '#c8a870', 0.7);
  s += RR(108, 65, 46, 10, 5, grad([[0, '#e8c088'], [0.5, '#b8844a'], [1, '#6a4a20']]), OL(0.5, '#3a2008')) + E(108.6, 70, 2, 4.6, '#d8b078', { flat: true });
  for (const x of [118, 144]) s += L(x, 65, x, 75, '#6a4a20', 0.5);
  return s;
}
// 鑼：大銅盤、中央凸臍、吊架、鑼槌
function gong(o = {}) {
  const frame = grad([[0, '#a83a2a'], [0.5, '#7a2a1a'], [1, '#3a0a04']], [0, 0, 1, 0]);
  let s = R(14, 6, 132, 6, shV('#7a2a1a'), OL(0.4, '#2a0a04')) + R(18, 12, 4, 84, frame, OL(0.4, '#2a0a04')) + R(138, 12, 4, 84, frame, OL(0.4, '#2a0a04'));
  for (const x of [14, 146]) s += Ci(x, 9, 3, shR(C.gold), OL(0.3, C.brassD));
  s += L(62, 12, 68, 20, '#c83a2a', 0.9) + L(98, 12, 92, 20, '#c83a2a', 0.9);
  s += Ci(81, 55.6, 36, '#000000', { flat: true, opacity: 0.45 });
  s += Ci(80, 54, 36, grad([[0, '#f0c070'], [0.4, C.bronze], [0.85, '#7a5020'], [1, '#4a3010']], [0.4, 0.35, 0.7], true), OL(0.6, '#3a2008'));
  s += Ci(80, 54, 32, 'none', { stroke: '#5a3a10', 'stroke-width': 1 }) + Ci(80, 54, 31, 'none', { stroke: '#f8d890', 'stroke-width': 0.5, opacity: 0.7 });
  for (let r = 6; r < 30; r += 2.6) s += Ci(80, 54, r, 'none', { stroke: r % 5.2 < 2.6 ? '#f8d890' : '#6a4410', 'stroke-width': 0.4, opacity: 0.4 });
  if (o.boss !== false) s += Ci(80, 54, 7, grad([[0, '#fff0b0'], [0.5, '#d8a858'], [1, '#7a5020']], [0.35, 0.3, 0.7], true), OL(0.5, '#5a3a10'));
  s += E(68, 40, 10, 4, '#ffffff', { opacity: 0.18, transform: 'rotate(-35 68 40)' });
  s += L(118, 96, 132, 72, tubeH('#c89058'), 2) + Ci(133, 69, 6, shR('#c83a2a'), OL(0.5, '#5a0a04'));
  return s;
}
// 風鈴：圓頂、垂掛長短金屬管、風擋片
function windChime() {
  let s = Pa('M40 20 Q80 4 120 20 L120 25 L40 25 Z', grad([[0, '#e8b070'], [1, '#7a4a20']]), OL(0.5, '#3a1a08')) + R(40, 23, 80, 2, '#3a1a08', { flat: true, opacity: 0.5 });
  s += L(80, 2, 80, 11, '#c8a870', 0.7) + Ci(80, 3, 2, 'none', { stroke: '#c8ccd4', 'stroke-width': 1 });
  const xs = [46, 58, 70, 90, 102, 114], hs = [52, 44, 60, 56, 40, 48];
  for (let i = 0; i < 6; i++) {
    s += L(xs[i], 25, xs[i], 30, '#c8a870', 0.5);
    s += Pa(`M${xs[i] - 2.6} 30 L${xs[i] + 2.6} 30 L${xs[i] + 2.6} ${29 + hs[i]} L${xs[i] - 2.6} ${31 + hs[i]} Z`, tubeH('#c8ccd4'), OL(0.3, '#3a3e46'));
    s += Ci(xs[i], 33, 0.6, '#3a3e46', { flat: true });
  }
  s += L(80, 25, 80, 54, '#c8a870', 0.5) + Ci(80, 57, 5, grad([[0, '#e8b070'], [1, '#7a4a20']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#3a1a08')) + L(80, 62, 80, 78, '#c8a870', 0.5);
  s += Po('72,78 88,78 84,96 76,96', grad([[0, '#e04a3a'], [1, '#7a1a10']]), OL(0.4, '#3a0402'));
  return s;
}
// 阿哥哥鈴：兩個大小不同的錐形鈴，以彎曲的鐵桿相連
function agogo() {
  const m = grad([[0, '#ffffff'], [0.3, '#c8ccd4'], [0.6, '#e8ecf0'], [1, '#5a606a']], [0, 0, 1, 0]);
  let s = pipe('M52 86 C52 98 110 98 110 86', 2.6, '#9aa0aa');
  s += Pa('M36 18 L48 86 Q52 90 56 86 L68 18 Z', m, OL(0.5, '#2a2e34')) + E(52, 18, 16, 4.4, grad([[0, '#c8ccd4'], [1, '#5a606a']]), OL(0.5, '#2a2e34')) + E(52, 18.4, 11.6, 2.8, '#1a1c20', { flat: true });
  s += Pa('M96 34 L106 86 Q110 90 114 86 L124 34 Z', m, OL(0.5, '#2a2e34')) + E(110, 34, 14, 3.8, grad([[0, '#c8ccd4'], [1, '#5a606a']]), OL(0.5, '#2a2e34')) + E(110, 34.4, 10, 2.4, '#1a1c20', { flat: true });
  s += L(128, 8, 144, 40, tubeH('#c89058'), 2.2);
  return s;
}
// 手碟：兩片鋼殼合成的「飛碟」、中央 Ding、一圈音區凹槽
function handpan(o = {}) {
  const c = o.c || '#5a6068';
  let s = E(80, 64, 66, 20, '#000000', { flat: true, opacity: 0.45 });
  s += E(80, 60, 66, 22, grad([[0, '#4a5058'], [1, '#14161a']]), OL(0.5, '#0a0a0c'));
  s += L(14, 60, 146, 60, '#8a909a', 0.5, { opacity: 0.6 });
  s += E(80, 54, 64, 30, grad([[0, lit(c, 0.45)], [0.5, c], [1, dim(c, 0.5)]], [0.45, 0.3, 0.75], true), OL(0.6, '#1a1c20'));
  s += SP('M22 44 Q80 18 138 44', '#d8dce2', 1.2, { opacity: 0.45 });
  const dimple = (x, y, rx, ry) => E(x, y, rx, ry, grad([[0, dim(c, 0.45)], [0.6, dim(c, 0.15)], [1, lit(c, 0.35)]], [0, 0, 0.4, 1]), OL(0.3, dim(c, 0.6))) + E(x - rx * 0.2, y - ry * 0.25, rx * 0.45, ry * 0.35, lit(c, 0.25), { flat: true, opacity: 0.6 });
  s += dimple(80, 50, 11, 6.5);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (i / 8) * 2 + 0.2;
    s += dimple(80 + Math.cos(a) * 42, 55 + Math.sin(a) * 18, 8.6, 4.4);
  }
  return s;
}
// 鋼鼓：油桶改造、凹面上用槌敲的音區（花瓣狀）、側面桶身
function steelPan(o = {}) {
  const body = o.body || '#c8322a';
  let s = E(81, 92, 54, 8, '#000000', { flat: true, opacity: 0.4 });
  s += R(26, 50, 108, 40, grad([[0, dim(body, 0.4)], [0.25, lit(body, 0.3)], [0.55, body], [1, dim(body, 0.55)]], [0, 0, 1, 0]), OL(0.6, dim(body, 0.7)));
  s += E(80, 90, 54, 8, grad([[0, dim(body, 0.4)], [0.3, lit(body, 0.2)], [1, dim(body, 0.6)]], [0, 0, 1, 0]), OL(0.6, dim(body, 0.7)));
  for (const y of [66, 78]) s += SP(`M26 ${y} Q80 ${y + 6} 134 ${y}`, dim(body, 0.5), 1.2) + SP(`M26 ${y - 1.2} Q80 ${y + 4.8} 134 ${y - 1.2}`, lit(body, 0.4), 0.5);
  s += E(80, 50, 54, 22, grad([[0, '#eef0f4'], [0.5, '#9aa0aa'], [1, '#4a4e56']], [0, 0, 1, 1]), OL(0.6, '#2a2e34'));
  s += E(80, 51.6, 48, 18, grad([[0, '#5a606a'], [0.5, '#a8aeb8'], [1, '#e8ecf0']], [0.5, 0.2, 0.8], true), { flat: true });
  const note = (x, y, rx, ry) => E(x, y, rx, ry, grad([[0, '#ffffff'], [0.6, '#c8ccd4'], [1, '#7a808a']], [0.35, 0.3, 0.7], true), OL(0.4, '#4a4e56')) + E(x, y, rx * 0.5, ry * 0.45, 'none', { stroke: '#7a808a', 'stroke-width': 0.3 });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; s += note(80 + Math.cos(a) * 34, 51 + Math.sin(a) * 12, 7.6, 3.8); }
  s += note(80, 51, 10, 4.5);
  s += L(110, 94, 132, 26, tubeH('#c89058'), 1.4) + Ci(132, 24, 3.6, shR('#e8e0c8'), OL(0.4, '#6a6050'));
  return s;
}
// 甘美朗：bonang（一排銅鑼鍋放在木架繩上）＋槌
function gamelan() {
  let s = Po('8,62 152,62 146,90 14,90', grad([[0, '#c83a2a'], [0.5, '#9a2a1a'], [1, '#4a0a04']]), OL(0.6, '#2a0402'));
  s += R(8, 56, 144, 7, grad([[0, '#fff0a0'], [0.5, C.gold], [1, '#8a6a10']]), OL(0.5, '#5a4008'));
  for (let i = 0; i < 9; i++) s += SP(`M${20 + i * 15} 70 q4 -4 8 0 q4 4 8 0`, '#e8c14a', 0.8, { opacity: 0.8 });
  s += L(14, 80, 146, 80, '#e8c14a', 0.6, { opacity: 0.6 });
  for (const x of [26, 128]) s += R(x, 90, 6, 8, shH('#9a2a1a'), OL(0.4, '#2a0402'));
  s += L(8, 55, 152, 55, '#c8a870', 0.8);
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 20;
    s += E(x, 56, 9, 3.6, grad([[0, '#5a3a10'], [1, '#2a1a04']]), { flat: true });
    s += Pa(`M${x - 8.6} 56 Q${x - 8.6} 43 ${x} 43 Q${x + 8.6} 43 ${x + 8.6} 56 Z`, grad([[0, '#f0c070'], [0.4, C.bronze], [1, '#5a3a10']], [0, 0, 1, 0.6]), OL(0.5, '#3a2008'));
    s += E(x, 47.6, 6.6, 2, 'none', { stroke: '#f8d890', 'stroke-width': 0.4, opacity: 0.7 });
    s += Ci(x, 42.6, 3.4, grad([[0, '#fff0b0'], [0.5, '#d8a858'], [1, '#6a4410']], [0.35, 0.3, 0.7], true), OL(0.4, '#3a2008'));
  }
  for (const [x1, y1, x2, y2] of [[52, 28, 86, 14], [98, 30, 128, 14]]) s += L(x1, y1, x2, y2, tubeH('#c89058'), 1.4) + `<ellipse${at({ cx: x1 - 2, cy: y1 + 1, rx: 5.4, ry: 3, fill: shR('#c83a2a'), transform: `rotate(-22 ${x1 - 2} ${y1 + 1})` })}/>`;
  return s;
}
// 玻璃琴：橫軸串著一排由大到小的玻璃碗
function glassHarmonica() {
  let s = R(10, 66, 140, 14, grad([[0, '#a86a3a'], [0.5, '#6a3a18'], [1, '#2a1006']]), OL(0.6, '#1a0804'));
  s += grain(12, 68, 136, 10, '#3a1a08', 3, 0.4);
  for (const x of [14, 140]) s += R(x, 80, 6, 16, shH('#6a3a18'), OL(0.4, '#1a0804'));
  s += L(10, 46, 150, 46, tubeV('#8a909a'), 2);
  for (let i = 0; i < 11; i++) {
    const x = 20 + i * 11.6, r = 18 - i * 1.1;
    s += E(x, 46, 5, r, grad([[0, '#e8fbff', 0.75], [0.5, '#a8d8e8', 0.45], [1, '#6aa8c0', 0.7]], [0, 0, 1, 0]), { stroke: '#f0fcff', 'stroke-width': 0.8 });
    s += E(x - 1.6, 46, 1, r - 2.4, '#ffffff', { opacity: 0.7 });
    if (i % 3 === 1) s += E(x + 0.4, 46, 5, r, 'none', { stroke: C.gold, 'stroke-width': 0.7, opacity: 0.85 });
  }
  return s;
}
// 音樂盒：打開的木盒、銅滾筒（凸針）、鋼梳、手搖柄
function musicBox() {
  let s = Po('18,30 142,30 152,18 28,18', grad([[0, '#e8b070'], [1, '#a8682a']]), OL(0.5, '#4a2008'));
  s += Po('40,26 128,26 134,21 46,21', 'none', { stroke: '#f8e0b0', 'stroke-width': 0.6 }) + Ci(87, 23.5, 2, '#f8e0b0', { flat: true, opacity: 0.8 });
  s += R(18, 30, 124, 52, grad([[0, '#a85a2a'], [0.5, '#8a4a22'], [1, '#3a1a08']]), OL(0.6, '#2a1006')) + grain(20, 70, 120, 10, '#3a1a08', 2, 0.4);
  s += R(24, 36, 112, 40, grad([[0, '#1a0c06'], [1, '#3a1c0e']]), { flat: true });
  s += R(38, 42, 58, 16, tubeV(C.brass), OL(0.4, C.brassD));
  for (let i = 0; i < 30; i++) s += Ci(40 + (i * 2.1) % 55, 44.4 + ((i * 7) % 11), 0.55, '#fff0b0', { flat: true });
  s += E(38, 50, 1.4, 8, shR(C.brassD), { flat: true }) + E(96, 50, 1.4, 8, shR(C.brassD), { flat: true });
  s += R(36, 58, 62, 4, tubeV('#9aa0aa'), OL(0.3, '#3a3e46'));
  for (let i = 0; i < 16; i++) s += R(38 + i * 3.8, 61, 2.4, 12 - i * 0.35, tubeH('#e8ecf0'), OL(0.2, '#4a4e56'));
  s += Ci(116, 56, 9, grad([[0, '#fff0b0'], [0.6, C.gold], [1, '#7a5a10']], [0.35, 0.3, 0.7], true), OL(0.5, '#4a3008')) + Ci(116, 56, 3, shR(C.brassD), { flat: true });
  s += L(142, 50, 152, 50, tubeV('#c8ccd4'), 1.6) + L(152, 50, 152, 40, tubeH('#c8ccd4'), 1.6) + RR(149.4, 32, 5.2, 8, 2, shH('#2a1a10'), OL(0.3, '#000000'));
  s += note(104, 14, 0.8, C.gold) + note(124, 8, 0.6, C.gold);
  return s;
}

// ══ 合成器（電子音色的象徵圖）═══════════════════════════════════════
// 類比單音合成器：木頭側板、旋鈕面板、螢幕顯示波形、短鍵盤
// o.wave 波形種類、o.body 面板色、o.screen 波形色、o.knobs 旋鈕色
function synthBox(o = {}) {
  const body = o.body || '#2c2e33', cheek = o.cheek || C.woodL;
  let s = RR(9, 24, 144, 62, 4, '#000000', { flat: true, opacity: 0.5 });
  s += RR(8, 22, 144, 62, 4, grad([[0, lit(cheek, 0.3)], [0.5, cheek], [1, dim(cheek, 0.4)]], [0, 0, 1, 0]), OL(0.6, dim(cheek, 0.7)));
  s += grain(9, 24, 5, 58, dim(cheek, 0.4), 3, 0.4) + grain(146, 24, 5, 58, dim(cheek, 0.4), 3, 0.4);
  s += R(14, 22, 132, 36, grad([[0, lit(body, 0.18)], [1, dim(body, 0.25)]]), OL(0.4, '#000000'));
  s += L(14, 22.6, 146, 22.6, '#ffffff', 0.4, { opacity: 0.25 }) + L(82, 26, 82, 56, '#000000', 0.5, { opacity: 0.6 });
  s += RR(19, 27, 60, 26, 3, '#3a3e46', { flat: true }) + RR(20, 28, 58, 24, 2.4, grad([[0, '#0a1a14'], [1, '#04100a']]), { flat: true });
  for (let i = 1; i < 4; i++) s += L(20 + i * 14.5, 28, 20 + i * 14.5, 52, '#1a3a2a', 0.3) + L(20, 28 + i * 6, 78, 28 + i * 6, '#1a3a2a', 0.3);
  s += GO(0.35, wave(o.wave || 'saw', 25, 40, 48, 14, o.screen || C.screen, 4)) + wave(o.wave || 'saw', 25, 40, 48, 14, o.screen || C.screen, 1.6);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = 90 + c * 14.5, y = 32 + r * 13;
    s += knob(x, y, 4, o.knobs ? o.knobs[(r * 4 + c) % o.knobs.length] : '#1e1e22', -1.2 + (r * 4 + c) * 0.45);
  }
  s += R(14, 58, 132, 26, '#0a0a0c', { flat: true });
  s += RR(17, 62, 5, 18, 2, grad([[0, '#2a2a2e'], [0.5, '#5a5a60'], [1, '#2a2a2e']], [0, 0, 1, 0]), OL(0.3, '#000000')) + RR(24, 62, 5, 18, 2, grad([[0, '#2a2a2e'], [0.5, '#5a5a60'], [1, '#2a2a2e']], [0, 0, 1, 0]), OL(0.3, '#000000'));
  s += L(17.6, 70, 21.4, 70, '#ffffff', 0.6) + keys(32, 60, 112, 22, 14, { felt: false });
  if (o.badge) s += badge(o.badge, o.badgeC || C.gold, C.ol, o.bx || 136, 13);
  if (o.extra) s += o.extra;
  return s;
}
// 303 型低音機：銀色小盒、旋鈕一排、迷你鍵盤按鈕
function box303(o = {}) {
  let s = RR(11, 24, 140, 60, 3, '#000000', { flat: true, opacity: 0.5 });
  s += RR(10, 22, 140, 60, 3, grad([[0, '#f4f6f8'], [0.4, '#c8ccd4'], [1, '#7a808a']]), OL(0.6, '#2a2e34'));
  for (let i = 0; i < 12; i++) s += L(12, 30 + i * 4.2, 148, 30 + i * 4.2, '#ffffff', 0.3, { opacity: 0.25 });
  s += R(10, 22, 140, 6, grad([[0, '#4a4e56'], [1, '#1a1c20']]), { flat: true });
  for (let i = 0; i < 6; i++) s += knob(22 + i * 18, 40, 5, '#1e1e22', -1.4 + i * 0.5) + L(22 + i * 18 - 6, 48, 22 + i * 18 + 6, 48, '#3a3e46', 0.3);
  s += knob(136, 40, 5, '#1e1e22', 0.6);
  for (let i = 0; i < 8; i++) s += RR(22 + i * 14, 62, 11, 12, 1.5, grad([[0, '#ffffff'], [1, '#d8d4c8']]), OL(0.4, '#5a5a5a'));
  for (const i of [0, 1, 3, 4, 5]) s += RR(29 + i * 14, 52, 9, 8, 1.5, grad([[0, '#4a4a4e'], [1, '#0a0a0c']]), OL(0.4, '#000000'));
  for (let i = 0; i < 8; i++) s += Ci(27.5 + i * 14, 77, 0.9, i % 3 ? '#4a1a10' : C.led, { flat: true });
  s += Ci(136, 58, 3, shR(C.led), OL(0.3, '#4a1a10')) + Ci(136, 68, 3, shR('#3a3d44'), OL(0.3, '#000000'));
  s += RR(118, 70, 12, 6, 1, shV(o.accent || '#f0a03a'), OL(0.3, '#6a3a10'));
  return s;
}
// 模組合成器：機櫃、模組、跳線
function modular(o = {}) {
  let s = RR(8, 8, 144, 84, 3, grad([[0, '#8a5a2a'], [0.5, '#5a3418'], [1, '#2a1406']], [0, 0, 1, 0]), OL(0.6, '#1a0804'));
  s += R(14, 13, 132, 74, '#0e0e12', { flat: true }) + R(14, 13, 132, 2, tubeV('#9aa0aa'), { flat: true }) + R(14, 85, 132, 2, tubeV('#9aa0aa'), { flat: true });
  const mods = [[14, 22], [36, 16], [52, 28], [80, 18], [98, 22], [120, 26]];
  for (const [x, w] of mods) {
    s += R(x + 0.3, 15, w - 0.6, 70, grad([[0, '#f0f0ec'], [1, '#b8b8b2']]), OL(0.3, '#4a4a4a'));
    s += Ci(x + 2, 17, 0.6, '#6a6a6a', { flat: true }) + Ci(x + w - 2, 83, 0.6, '#6a6a6a', { flat: true });
    s += knob(x + w / 2, 27, Math.min(5, w / 3.2), '#1e1e22', (x % 7) * 0.4 - 1.2);
    if (w > 18) s += knob(x + w / 2, 43, 3.6, '#1e1e22', 0.8);
    else s += R(x + w / 2 - 0.8, 36, 1.6, 14, '#2a2a2e', { flat: true }) + R(x + w / 2 - 2.4, 42, 4.8, 2.6, '#c8c8c8', OL(0.3, '#4a4a4a'));
    s += Ci(x + w / 2 + 3, 54, 0.9, x % 3 ? '#ff5a3c' : '#5aff8a', { flat: true });
    for (let j = 0; j < 2; j++) s += Ci(x + w / 2, 62 + j * 10, 2.2, grad([[0, '#ffffff'], [1, '#6a707a']], [0.3, 0.2, 0.7, 1]), { flat: true }) + Ci(x + w / 2, 62 + j * 10, 1.1, '#0a0a0c', { flat: true });
  }
  const cable = (d, c) => SP(d, dim(c, 0.4), 2.6) + SP(d, c, 1.8) + SP(d, lit(c, 0.4), 0.5, { opacity: 0.8 });
  s += cable('M25 62 C30 94 60 94 66 72', '#e04a3a') + cable('M44 72 C54 100 100 98 109 62', '#3a9ae0') + cable('M89 72 C96 90 126 88 133 62', '#f0c030');
  if (o.badge) s += badge(o.badge);
  return s;
}
// 掌機（8-bit）：螢幕上的像素方波、十字鍵、AB 鈕（通用造型、無商標）
function handheld() {
  let s = RR(43, 6, 76, 92, 6, '#000000', { flat: true, opacity: 0.5 });
  s += Pa('M42 10 Q42 4 48 4 L112 4 Q118 4 118 10 L118 84 Q118 96 100 96 L48 96 Q42 96 42 90 Z', grad([[0, '#e8e6dc'], [0.5, '#c9c7bd'], [1, '#8a887e']], [0, 0, 1, 1]), OL(0.6, '#4a4840'));
  s += RR(50, 12, 60, 40, 3, grad([[0, '#5a5d68'], [1, '#34363e']]), OL(0.4, '#1a1a1e'));
  s += Ci(54, 26, 1, '#c83a3a', { flat: true }) + R(56, 17, 48, 30, '#9ab040', { flat: true });
  for (let i = 0; i < 6; i++) {
    const hi = i % 2 === 0;
    s += R(58 + i * 7.5, hi ? 24 : 36, 7.5, 3, '#2a3a1a', { flat: true }) + R(58 + (i + 1) * 7.5 - 1.5, 24, 3, 15, '#2a3a1a', { flat: true });
  }
  s += R(58, 42, 4, 3, '#2a3a1a', { flat: true }) + R(64, 42, 4, 3, '#2a3a1a', { flat: true }) + Po('56,17 76,17 56,32', '#ffffff', { opacity: 0.12 });
  s += R(54, 64, 18, 6, grad([[0, '#4a4a50'], [1, '#14141a']]), OL(0.4, '#000000')) + R(60, 58, 6, 18, grad([[0, '#4a4a50'], [1, '#14141a']], [0, 0, 1, 0]), OL(0.4, '#000000'));
  s += Ci(63, 67, 1.6, '#2a2a30', { flat: true });
  for (const [x, y] of [[96, 70], [108, 64]]) s += Ci(x, y, 5, grad([[0, '#d84a6a'], [1, '#6a1a2a']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#3a0a14'));
  s += Pa('M66 82 L76 85 L75 87.4 L65 84.4 Z', '#7a7a80', { flat: true }) + Pa('M80 82 L90 85 L89 87.4 L79 84.4 Z', '#7a7a80', { flat: true });
  for (let i = 0; i < 5; i++) s += L(98 + i * 3, 80 + i * 0.6, 103 + i * 3, 90, '#6a685e', 1);
  return s;
}
// 波形大圖示（給純主奏用）
function waveIcon(kind, o = {}) {
  const bg = o.bg || '#20242c';
  let s = RR(11, 16, 140, 72, 8, '#000000', { flat: true, opacity: 0.5 });
  s += RR(10, 14, 140, 72, 8, grad([[0, '#5a606a'], [1, '#1a1c20']]), OL(0.6, '#0a0a0c'));
  s += RR(15, 19, 130, 62, 5, grad([[0, lit(bg, 0.1)], [1, dim(bg, 0.4)]]), { flat: true });
  for (let i = 1; i < 6; i++) s += L(15 + i * 21.7, 20, 15 + i * 21.7, 80, lit(bg, 0.12), 0.5);
  for (let i = 1; i < 4; i++) s += L(16, 19 + i * 15.5, 144, 19 + i * 15.5, lit(bg, 0.12), 0.5);
  s += L(16, 50, 144, 50, lit(bg, 0.2), 0.7);
  s += GO(0.3, wave(kind, 22, 50, 116, 44, o.c || C.screen, 7)) + wave(kind, 22, 50, 116, 44, o.c || C.screen, 2.4) + wave(kind, 22, 50, 116, 44, '#ffffff', 0.6);
  s += Pa('M15 24 Q15 19 20 19 L80 19 Q50 30 15 46 Z', '#ffffff', { opacity: 0.06 });
  if (o.badge) s += badge(o.badge, o.badgeC || C.gold, C.ol, 132, 24);
  if (o.extra) s += o.extra;
  return s;
}

// ══ Pad：層疊柔和的波浪＋代表名稱的小圖案 ════════════════════════════
function pad(c, motif) {
  const frame = `<rect x="4" y="6" width="152" height="88" rx="10"/>`;
  return RR(4, 6, 152, 88, 10, grad([[0, lit(c[0], 0.12)], [1, dim(c[0], 0.3)]]), OL(0.8, '#3a3e48')) +
    clip(frame, softWaves(c[1], c[2], c[3]) + E(80, 30, 60, 26, grad([[0, '#ffffff', 0.18], [1, '#ffffff', 0]], [0.5, 0.5, 0.5], true), { flat: true }) + (motif || '')) +
    RR(4, 6, 152, 88, 10, 'none', { stroke: '#ffffff', 'stroke-width': 0.6, opacity: 0.12 });
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
  const frame = `<rect x="4" y="6" width="152" height="88" rx="10"/>`;
  return RR(4, 6, 152, 88, 10, grad([[0, lit(c, 0.12)], [1, dim(c, 0.35)]]), OL(0.8, '#3a3e48')) + clip(frame, inner) +
    RR(4, 6, 152, 88, 10, 'none', { stroke: '#ffffff', 'stroke-width': 0.6, opacity: 0.12 });
}
// 心電圖
function ecg(c = '#ff4a5a') {
  return PL('10,56 44,56 52,56 58,38 64,72 70,22 78,82 84,56 110,56 116,48 122,56 150,56', c, 3);
}

// ══ 人聲 ═══════════════════════════════════════════════════════
// 歌者上半身（剪影＋張口）
function singer(x, y, s = 1, o = {}) {
  const kid = o.kind === 'kid', i = o.i || 0;
  const skin = o.skin || SKINS[i % SKINS.length], hair = o.hair || HAIRS[(i * 3 + 1) % HAIRS.length];
  const robe = o.robe || '#6a2234';
  const sw = kid ? 8.2 : 11;          // 半肩寬：成人約 2.7 個頭寬，兒童約 2 個
  const hr = kid ? 4.4 : 3.9, hy = kid ? 5.4 : 5.2;
  let g = '';
  // 長髮（畫在頭後）
  if (o.long) g += Pa(`M${-hr - 0.6} 4 C${-hr - 1.4} 9 ${-hr - 1.6} 13 ${-hr - 0.4} 16 L${hr + 0.4} 16 C${hr + 1.6} 13 ${hr + 1.4} 9 ${hr + 0.6} 4 Z`, dim(hair, 0.1));
  // 身體
  const body = `M${-sw} 60 L${-sw} ${kid ? 19 : 18.5} C${-sw} 14.5 ${-sw * 0.62} 12.6 -2.6 12.2 L2.6 12.2 C${sw * 0.62} 12.6 ${sw} 14.5 ${sw} ${kid ? 19 : 18.5} L${sw} 60 Z`;
  // 脖子
  g += R(-1.7, 8.5, 3.4, 4.6, dim(skin, 0.22));
  if (o.kind === 'tux') {
    g += Pa(body, shH('#26262c'), OL(0.8, '#0a0a0c'));
    g += Po('-2.8,12.2 2.8,12.2 0,23', '#f2f0ea') + L(0, 15, 0, 23, '#d0ccc4', 0.4);
    g += Po('-2.8,12.2 -5.6,13.4 -1.2,24 0,23', '#1a1a1e') + Po('2.8,12.2 5.6,13.4 1.2,24 0,23', '#1a1a1e');
    g += Po('-2,13 0,13.8 2,13 2,14.8 0,14 -2,14.8', '#0a0a0c');
  } else if (kid) {
    // 紅色長袍、白色罩袍（較寬、下襬有褶）、白色襞襟
    g += Pa(body, shH('#a8222a'), OL(0.8, '#3a0a0e'));
    g += Pa(`M${-sw + 0.6} 60 L${-sw + 0.4} 19.5 C${-sw + 0.4} 15.8 -4 14 0 14 C4 14 ${sw - 0.4} 15.8 ${sw - 0.4} 19.5 L${sw - 0.6} 60 Z`, shH('#f4f2ee', 0.6));
    for (const xx of [-4, 0, 4]) g += L(xx, 18, xx * 1.3, 60, '#cfcac0', 0.5);
    g += E(0, 12.8, 4.6, 1.8, '#ffffff', OL(0.5, '#bdb8ae'));
    for (let k = -3; k <= 3; k++) g += L(k * 1.2, 11.5, k * 1.4, 14.2, '#cfcac0', 0.35);
  } else {
    // 合唱長袍：V 領、白色內領、兩條披肩垂到胸前
    const stole = o.stole || '#e8d6a0';
    g += Pa(body, shH(robe), OL(0.8, dim(robe, 0.6)));
    g += Po('-2.8,12.2 2.8,12.2 0,18', '#f2f0ea');
    g += Po(`-3.4,12.3 -1.6,12.3 -0.9,60 -3.3,31`, shH(stole, 0.6)) + Po(`3.4,12.3 1.6,12.3 0.9,60 3.3,31`, shH(stole, 0.6));
    g += SP(`M${-sw * 0.7} 20 Q${-sw * 0.6} 26 ${-sw * 0.65} 60`, dim(robe, 0.35), 0.5) + SP(`M${sw * 0.7} 20 Q${sw * 0.6} 26 ${sw * 0.65} 60`, dim(robe, 0.35), 0.5);
  }
  // 頭：側光（左亮右暗）＋下巴陰影
  g += E(0, hy, hr, hy, grad([[0, lit(skin, 0.18)], [0.55, skin], [1, dim(skin, 0.28)]], [0.15, 0.2, 1, 0.8]));
  g += Pa(`M${hr * 0.35} ${hy - hy * 0.95} A${hr} ${hy} 0 0 1 ${hr * 0.35} ${hy + hy * 0.95} A${hr * 0.75} ${hy} 0 0 0 ${hr * 0.35} ${hy - hy * 0.95} Z`, dim(skin, 0.3), { opacity: 0.45 });
  g += E(-hr - 0.1, hy + 0.6, 0.7, 1.2, dim(skin, 0.1)) + E(hr + 0.1, hy + 0.6, 0.7, 1.2, dim(skin, 0.25));
  // 頭髮
  const hs = o.hs ?? i % 3;
  if (hs === 0) g += Pa(`M${-hr - 0.2} ${hy} C${-hr - 0.6} ${-0.8} ${hr + 0.6} ${-0.8} ${hr + 0.2} ${hy} C${hr - 0.6} ${hy - 2.6} ${hr * 0.2} ${hy - 3.4} ${-hr * 0.4} ${hy - 3} C${-hr + 0.2} ${hy - 2.4} ${-hr + 0.1} ${hy - 1} ${-hr - 0.2} ${hy} Z`, shR(hair, 0.6));
  else if (hs === 1) g += Pa(`M${-hr - 0.4} ${hy + 1.5} C${-hr - 1} ${-1} ${hr + 1} ${-1} ${hr + 0.4} ${hy + 1.5} C${hr} ${hy - 1} ${hr - 1} ${hy - 2.6} ${hr * 0.3} ${hy - 3.6} C${-hr * 0.2} ${hy - 2.2} ${-hr + 0.3} ${hy - 1.6} ${-hr - 0.4} ${hy + 1.5} Z`, shR(hair, 0.6));
  else g += Pa(`M${-hr - 0.1} ${hy - 0.5} C${-hr - 0.2} ${-0.4} ${hr + 0.2} ${-0.4} ${hr + 0.1} ${hy - 0.5} C${hr - 1} ${hy - 2.2} ${-hr + 1} ${hy - 2.2} ${-hr - 0.1} ${hy - 0.5} Z`, shR(hair, 0.6));
  // 樂譜夾（雙手持在胸前）
  if (o.folder) {
    g += Po('-6.2,23.5 6.2,23.5 6.8,29.5 -6.8,29.5', shV('#2a1418'), OL(0.4, '#000000')) + L(-5.8, 24.1, 5.8, 24.1, '#c8a860', 0.4);
    g += E(-6.6, 27.6, 1.3, 1.7, dim(skin, 0.1)) + E(6.6, 27.6, 1.3, 1.7, dim(skin, 0.2));
  }
  return G(`translate(${x} ${y}) scale(${s})`, g);
}
function choir(o = {}) {
  const rows = o.rows || [[12, 1.3, 5, 18, 31], [38, 1.55, 4, 33, 31]];
  let s = o.bg === false ? '' : choirBg(o.light);
  rows.forEach(([y, k, n, x0, dx], r) => {
    let row = '';
    for (let j = 0; j < n; j++) {
      const i = r * 7 + j * 2 + (o.seed || 0);
      row += singer(x0 + j * dx, y, k, { kind: o.kind, robe: o.robe, stole: o.stole, i, long: o.kind !== 'kid' && i % 3 === 1, folder: r === rows.length - 1 && o.folder !== false });
    }
    s += r < rows.length - 1 ? GO(0.78 + r * 0.08, row) : row;
  });
  return s;
}

// ══ 鼓 ════════════════════════════════════════════════════════
function acousticKit(o = {}) {
  const sh = o.shell || '#b8322a';
  let s = '';
  // 架子
  for (const [x1, y1, x2, y2] of [[16, 42, 16, 94], [40, 20, 46, 44], [136, 24, 140, 94], [40, 68, 38, 94]]) s += L(x1, y1, x2, y2, tubeH('#9aa0aa'), 1.2);
  s += L(10, 94, 22, 94, '#5a606a', 1) + L(132, 94, 148, 94, '#5a606a', 1);
  // 大鼓（正面）
  s += Ci(80, 70, 24, grad([[0, lit(sh, 0.3)], [0.6, sh], [1, dim(sh, 0.6)]], [0.35, 0.3, 0.75], true), { flat: true });
  s += Ci(80, 70, 24, 'none', { stroke: '#e8ecf0', 'stroke-width': 1.6 }) + Ci(80, 70, 20.6, grad([[0, '#fbf8f0'], [0.75, '#e8e0cc'], [1, '#a89c80']], [0.4, 0.35, 0.7], true), { flat: true });
  for (let k = 0; k < 10; k++) { const a = k * 0.628; s += Ci(80 + Math.cos(a) * 22.6, 70 + Math.sin(a) * 22.6, 0.9, '#e8ecf0', { flat: true }); }
  s += Ci(80, 70, 6, sh, { flat: true, opacity: 0.35 }) + Ci(80, 70, 4, '#0a0a0c', { flat: true, opacity: 0.6 });
  // 通通鼓與落地鼓、小鼓
  s += drum(64, 34, 11, 9, sh, { lugs: 5, tilt: 0.42 }) + drum(96, 34, 11, 9, sh, { lugs: 5, tilt: 0.42 });
  s += drum(121, 58, 13, 26, sh, { lugs: 5, tilt: 0.35 }) + L(110, 84, 108, 96, tubeH('#9aa0aa'), 1) + L(132, 84, 134, 96, tubeH('#9aa0aa'), 1);
  s += drum(40, 58, 12, 9, '#c8ccd4', { lugs: 6, tilt: 0.33 });
  // 鈸
  s += cymbal(16, 40, 13) + cymbal(16, 44, 13) + cymbal(136, 22, 18, -10) + cymbal(40, 18, 15, 8);
  // 鼓棒
  for (const [x1, y1, x2, y2] of [[56, 4, 76, 30], [104, 4, 86, 30]]) s += L(x1, y1, x2, y2, tubeV('#e8c890'), 1.8) + Ci(x2, y2, 1.2, '#f4ead0', { flat: true });
  return s;
}
// 鼓機：o.c 面板色、o.step 16 步鍵顏色、o.pads 方形打擊墊
function drumMachine(o = {}) {
  const c = o.c || '#d8d4c8';
  let s = RR(9, 18, 144, 70, 3, '#000000', { flat: true, opacity: 0.5 });
  s += RR(8, 16, 144, 70, 3, grad([[0, lit(c, 0.3)], [0.5, c], [1, dim(c, 0.35)]]), OL(0.6, dim(c, 0.65)));
  s += R(8, 16, 144, 10, grad([[0, lit(o.strip || '#3a3d44', 0.2)], [1, dim(o.strip || '#3a3d44', 0.3)]]), { flat: true });
  s += L(8, 26, 152, 26, '#000000', 0.5, { opacity: 0.4 });
  for (let i = 0; i < 8; i++) s += L(12 + i * 18, 18.4, 24 + i * 18, 18.4, '#ffffff', 0.4, { opacity: 0.3 });
  const nk = o.screen ? 6 : 9;
  for (let i = 0; i < nk; i++) s += knob(18 + i * 15, 38, 4, o.knob || '#1e1e22', -1.2 + i * 0.4) + L(14 + i * 15, 46, 22 + i * 15, 46, dim(c, 0.4), 0.4);
  const cols = o.step || ['#e04a2a', '#f08a2a', '#f0d03a', '#f4f0e0'];
  for (let i = 0; i < 16; i++) {
    const cc = cols[Math.floor(i / 4)];
    s += RR(12 + i * 8.6, 62.6, 6.8, 12, 1.2, '#000000', { flat: true, opacity: 0.4 }) + RR(12 + i * 8.6, 62, 6.8, 12, 1.2, grad([[0, lit(cc, 0.3)], [1, dim(cc, 0.25)]]), OL(0.3, dim(cc, 0.6)));
    s += Ci(15.4 + i * 8.6, 56, 1.1, i % 4 === 0 ? C.led : '#5a1a10', { flat: true });
  }
  for (let i = 0; i < 4; i++) s += L(10 + i * 34.4, 78, 40 + i * 34.4, 78, dim(c, 0.4), 0.5);
  if (o.screen) s += RR(108, 29, 38, 18, 2, '#3a3e46', { flat: true }) + RR(109, 30, 36, 16, 2, grad([[0, '#1a0604'], [1, '#0a0202']]), { flat: true }) + T(127, 42, o.screen, C.led, 11) + Po('110,31 126,31 110,40', '#ffffff', { opacity: 0.08 });
  return s;
}

// ══ 其他小零件 ═══════════════════════════════════════════════════
// 喇叭單體（低頻貝斯）
function speaker(o = {}) {
  let s = RR(31, 8, 100, 88, 6, '#000000', { flat: true, opacity: 0.5 });
  s += RR(30, 6, 100, 88, 6, grad([[0, '#3a3a40'], [0.5, '#26262a'], [1, '#121214']]), OL(0.6, '#000000'));
  for (const [x, y] of [[36, 12], [124, 12], [36, 88], [124, 88]]) s += Ci(x, y, 1.1, shR('#8a909a'), { flat: true });
  s += Ci(80, 54, 34, grad([[0, '#5a5a62'], [1, '#1a1a1e']], [0, 0, 1, 1]), OL(0.6, '#000000'));
  s += Ci(80, 54, 30, grad([[0, '#3a3a40'], [1, '#0a0a0c']], [0.4, 0.4, 0.7], true), { flat: true });
  s += Ci(80, 54, 26, grad([[0, '#2a2a30'], [0.7, '#141418'], [1, '#3a3a40']], [0.5, 0.5, 0.55], true), { flat: true });
  for (const r of [12, 18, 23]) s += Ci(80, 54, r, 'none', { stroke: '#3a3a42', 'stroke-width': 0.4 });
  s += Ci(80, 54, 9, grad([[0, '#8a8a92'], [0.6, '#4a4a52'], [1, '#2a2a30']], [0.35, 0.3, 0.7], true), { flat: true });
  s += Ci(80, 16, 5, '#0a0a0c', { flat: true }) + Ci(80, 16, 5.6, 'none', { stroke: '#4a4a52', 'stroke-width': 0.8 });
  for (const r of [42, 50]) s += SP(`M${80 + r * 0.6} ${54 - r * 0.8} A${r} ${r} 0 0 1 ${80 + r * 0.6} ${54 + r * 0.8}`, o.c || C.screen, 1.6, { opacity: r === 42 ? 0.9 : 0.5 });
  if (o.badge) s += badge(o.badge, o.badgeC || C.led, C.ol, 46, 16);
  return s;
}
// 取樣機：4×4 打擊墊
function sampler(o = {}) {
  let s = RR(15, 10, 132, 84, 4, '#000000', { flat: true, opacity: 0.5 });
  s += RR(14, 8, 132, 84, 4, grad([[0, '#5a5e68'], [0.5, '#3a3d44'], [1, '#1e2026']]), OL(0.6, '#0a0a0c'));
  s += RR(21, 13, 52, 20, 2, '#1a1c20', { flat: true }) + RR(22, 14, 50, 18, 2, grad([[0, '#0a1a14'], [1, '#04100a']]), { flat: true }) + wave('noise', 26, 23, 42, 10, C.screen, 1.2);
  for (let i = 0; i < 4; i++) s += knob(86 + i * 14, 23, 4.2, '#1e1e22', -1 + i * 0.6);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const lit1 = (r + c) % 5 === 0, cc = lit1 ? '#f08a2a' : '#9a9ea8';
    s += RR(24 + c * 19, 38.6 + r * 13, 16, 11, 2, '#000000', { flat: true, opacity: 0.5 }) + RR(24 + c * 19, 38 + r * 13, 16, 11, 2, grad([[0, lit(cc, 0.3)], [1, dim(cc, 0.3)]]), OL(0.3, dim(cc, 0.6)));
    if (lit1) s += RR(24 + c * 19, 38 + r * 13, 16, 11, 2, '#ffc080', { flat: true, opacity: 0.25 });
  }
  for (let i = 0; i < 3; i++) s += RR(104, 42 + i * 10, 34, 6, 1, grad([[0, '#6a6e78'], [1, '#2a2c32']]), OL(0.3, '#0a0a0c'));
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
  let s = G(`translate(72 48) rotate(-14) scale(${sc})`, fiddle({ wood: o.wood, mute: o.mute }));
  if (o.bow !== false) s += G(`translate(18 86) rotate(-8)`, bow(124));
  return s;
}
const zig = (x, y, w, c = '#ffd23a') => PL(range(9).map(i => `${x + i * w / 8},${y + (i % 2 ? -5 : 5)}`).join(' '), c, 2.2);

function choirBg(c = '#f4e6c0') {
  return Pa('M58 0 L102 0 L150 100 L10 100 Z', grad([[0, c, 0.22], [1, c, 0]]));
}

function profile(x, y, s = 1, o = {}) {
  const m = o.mouth || 'm';
  const mouth = {
    m: 'L53 46.6 C54.2 47.4 54 48.6 52.6 49 L53.2 50.6 C53.6 52.6 52.4 54.2 51 54.4',
    a: 'L53.4 46 C54.6 46.6 54.4 47.6 53 48 L47.6 49.4 L51.6 53.6 C52.6 54.4 52.6 55.6 51.6 56.4',
    o: 'L54.6 46.6 C56.2 47.4 56 48.6 54.2 49.2 L51.4 49.8 L54 51.2 C55.4 52.2 55 53.6 53 54.2',
    w: 'L55.8 46.8 C57.6 47.4 57.6 48.4 56.4 48.8 L55.4 49 L56.4 49.4 C57.6 50 57.4 51.4 55.2 52 L52.2 53.6',
  }[m];
  const chinY = m === 'a' ? 3 : 0;
  const d = `M17 74 C16 66 12 60 6 54 C-1.5 38 -1 20 8 10 C16 2 30 -1 39 3.5 C46.5 7.5 50.5 15 50.5 23 L51.4 28 C51.6 30.5 50.6 31.6 50.4 33 L56.2 41 C57 42.6 55.6 44 52.6 44.2 ${mouth} C${52 - chinY * 0.3} ${57.5 + chinY} ${50.5} ${60.6 + chinY} 45 ${61 + chinY} C40.5 ${61.4 + chinY} 38.5 ${62.5 + chinY} 37 ${65 + chinY * 0.5} C35.6 67.5 35.4 71 35.6 74 Z`;
  const c = o.c || '#e8c2a4';
  let g = Pa(d, grad([[0, lit(c, 0.25)], [0.6, c], [1, dim(c, 0.3)]], [1, 0, 0, 1]));
  // 頭髮：蓋住頭頂與後腦
  const hair = o.hair || '#2a1c14';
  g += Pa('M-0.6 40 C-2 24 2 10 10 5 C18 0 30 -1.5 39 3 C45 6 48.6 11 49.6 16 C44 12 36 11.4 30 13 C26 18 24 24 22 30 C18 34 14 36 12 44 C8 46 4 44 2 50 C0.8 46.6 -0.2 43.4 -0.6 40 Z', shR(hair, 0.7));
  if (o.long) g += Pa('M1 44 C-3 56 -1 66 4 74 L18 74 C14 66 13 58 14 48 Z', dim(hair, 0.05));
  // 耳朵、下顎陰影、臉部邊緣的輪廓光
  g += Pa('M25 32 C21 31 20 36 21.5 40 C23 43.5 26 43 26.5 40 Z', dim(c, 0.12), OL(0.4, dim(c, 0.35)));
  g += SP('M37 65 C42 60.5 47 60.6 51 56', dim(c, 0.35), 0.8, { opacity: 0.6 });
  g += SP('M50.5 23 L51.4 28 M50.4 33 L56.2 41', lit(c, 0.6), 0.9, { opacity: 0.8 });
  return G(`translate(${x} ${y}) scale(${s})`, g);
}

function voiceWaves(x, y, n = 3, c = '#f4e6c0', r0 = 8, gap = 7) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const r = r0 + i * gap;
    s += SP(`M${x + r * 0.55} ${y - r * 0.83} A${r} ${r} 0 0 1 ${x + r * 0.55} ${y + r * 0.83}`, c, 1.8 - i * 0.3, { opacity: 0.9 - i * 0.22 });
  }
  return s;
}

function microphone(x, y, s = 1) {
  let g = RR(-5, -14, 10, 15, 5, tubeH('#9aa0aa'));
  for (let k = 0; k < 4; k++) g += L(-4.6, -11 + k * 3, 4.6, -11 + k * 3, '#5a606a', 0.5);
  g += R(-3, 1, 6, 4, shH('#2a2a30')) + SP('M-7 -4 C-7 6 7 6 7 -4', '#6a707a', 1.2) + L(0, 5, 0, 34, tubeH('#5a606a'), 2);
  return G(`translate(${x} ${y}) scale(${s})`, g);
}

const SKINS = ['#e9bf9c', '#d9a57e', '#c48a62', '#f0cdb0', '#a8724e'];
const HAIRS = ['#2a1c14', '#4a3020', '#6a4a2a', '#1a1614', '#8a6a44', '#3a2a22'];
function tuner(x, y, up, peg, big) {
  const d = up ? -1 : 1, L1 = big ? 4.5 : 3.6;
  return R(x - 0.7, Math.min(y, y + d * 2), 1.4, 2, tubeH('#c8ccd4'), { flat: true }) +
    RR(x - (big ? 2.2 : 1.7), up ? y - 2 - L1 : y + 2, big ? 4.4 : 3.4, L1, 1.2, peg, OL(0.6, dim(peg, 0.55)));
}

function acBridge(x, top, bot, c = C.ebony, pins = 6) {
  let s = Pa(`M${x} ${top} Q${x - 2} ${top - 2} ${x - 2.5} ${top + 2} L${x - 2.5} ${bot - 2} Q${x - 2} ${bot + 2} ${x} ${bot} L${x + 6} ${bot} Q${x + 8} ${bot + 2} ${x + 8.5} ${bot - 2} L${x + 8.5} ${top + 2} Q${x + 8} ${top - 2} ${x + 6} ${top} Z`, c, OL(0.8));
  s += L(x + 5.2, top + 1.2, x + 5.2, bot - 1.2, C.ivory, 1);
  for (let i = 0; i < pins; i++) s += Ci(x + 2, lerp(top + 2.2, bot - 2.2, i / Math.max(1, pins - 1)), 0.6, C.ivory, { flat: true });
  return s;
}

function rosette(x, y, r, c = C.mapleD) {
  return Ci(x, y, r + 2.6, 'none', { stroke: c, 'stroke-width': 1.4 }) + Ci(x, y, r + 1.4, 'none', { stroke: '#f0e4c8', 'stroke-width': 0.5 }) +
    Ci(x, y, r + 3.7, 'none', { stroke: '#2a1a10', 'stroke-width': 0.5 }) + Ci(x, y, r, grad([[0, '#000000'], [0.8, '#1a100a'], [1, '#3a2614']], [0.5, 0.45, 0.6], true));
}

function pickup(x, w, hum, c) {
  let s = RR(x - w / 2, 42.6, w, 14.8, 1.5, c, OL(0.6, '#000000'));
  if (hum) {
    s += L(x, 43, x, 57, dim(c, 0.4), 0.5);
    for (let k = 0; k < 6; k++) s += Ci(x - w / 4, 44.6 + k * 2.15, 0.55, '#c8ccd4', { flat: true }) + Ci(x + w / 4, 44.6 + k * 2.15, 0.55, '#c8ccd4', { flat: true });
  } else for (let k = 0; k < 6; k++) s += Ci(x, 44.6 + k * 2.15, 0.55, '#c8ccd4', { flat: true });
  return s;
}

function hand(x, y, s = 1, pose = 'pluck', c = '#e0b090') {
  let g;
  if (pose === 'pluck') {
    g = Pa('M0 0 C-2 -4 2 -7 6 -6 L14 -4 C16 -3.6 16 -1.6 14 -1.4 L8 -1.6 L13 0 C15 0.6 14.6 2.6 12.6 2.4 L7 1.6 L11 3.6 C12.6 4.4 11.6 6.4 10 5.8 L4 4.4 C1 4.4 -1 3 0 0 Z', grad([[0, lit(c, 0.2)], [1, dim(c, 0.25)]]), OL(0.6, dim(c, 0.5)));
    g += SP('M8 -1.6 L4 -2 M7 1.6 L3.6 1.2', dim(c, 0.4), 0.5) + Pa('M0 0 C-6 -2 -10 2 -12 8 L-4 10 C-2 6 0 4 0 0 Z', shH('#3a4a6a'), OL(0.5, '#1a2030'));
  } else {
    g = Pa('M0 -10 C6 -12 12 -10 14 -6 L16 6 C16 10 12 12 8 11 L0 9 C-4 6 -4 -6 0 -10 Z', grad([[0, lit(c, 0.2)], [1, dim(c, 0.25)]], [0, 0, 1, 0]), OL(0.6, dim(c, 0.5)));
    g += SP('M10 -8 L12 8 M6 -9 L7 9', dim(c, 0.35), 0.5) + Pa('M0 -10 C-6 -8 -10 -4 -12 2 L-12 8 L-2 8 C-3 2 -2 -4 0 -10 Z', shH('#2a2a30'), OL(0.5, '#000000'));
  }
  return G(`translate(${x} ${y}) scale(${s})`, g);
}

function mark(txt, x = 136, y = 14, c = '#f4e6c0') {
  const w = txt.length * 5.6 + 10;
  return RR(x - w / 2, y - 8, w, 15, 7.5, '#000000', { opacity: 0.45 }) + RR(x - w / 2, y - 8, w, 15, 7.5, 'none', { stroke: c, 'stroke-width': 0.8, opacity: 0.8 }) +
    T(x, y + 3.4, txt, c, 9, { 'font-style': 'italic', 'font-family': 'serif' });
}

function pipe(d, w, c = C.brass) {
  return SP(d, dim(c, 0.55), w + 1.2) + SP(d, c, w) + SP(d, lit(c, 0.55), w * 0.32, { opacity: 0.9, transform: `translate(0 ${f1(-w * 0.22)})` });
}

function valve(x, top, bot, c = C.brass) {
  return R(x - 3, top, 6, bot - top, tubeH(c), OL(0.5, dim(c, 0.6))) + R(x - 3.4, top + 2, 6.8, 1.6, tubeH(lit(c, 0.2)), { flat: true }) +
    R(x - 1, top - 6, 2, 6, tubeH('#c8ccd4'), { flat: true }) + RR(x - 3.6, top - 8.4, 7.2, 3, 1.4, grad([[0, '#ffffff'], [1, '#c8c0b0']]), OL(0.4, '#8a8070')) +
    RR(x - 3.4, bot - 0.6, 6.8, 3.2, 1, tubeH(lit(c, 0.1)), OL(0.4, dim(c, 0.6)));
}

function knob(x, y, r, c = '#1e1e22', a = -0.6) {
  return Ci(x + 0.4, y + 0.6, r + 0.6, '#000000', { flat: true, opacity: 0.5 }) + Ci(x, y, r + 0.6, grad([[0, '#e8ecf0'], [1, '#5a606a']], [0.3, 0.2, 0.7, 1]), { flat: true }) +
    Ci(x, y, r, grad([[0, lit(c, 0.35)], [0.6, c], [1, dim(c, 0.5)]], [0.35, 0.3, 0.7], true), { flat: true }) +
    L(x, y, x + Math.sin(a) * r * 0.85, y - Math.cos(a) * r * 0.85, '#ffffff', Math.max(0.6, r * 0.22)) + Ci(x - r * 0.35, y - r * 0.4, r * 0.25, '#ffffff', { flat: true, opacity: 0.35 });
}

function drum(cx, cy, rx, h, shell, o = {}) {
  const ry = rx * (o.tilt ?? 0.32);
  let s = R(cx - rx, cy, rx * 2, h, grad([[0, dim(shell, 0.45)], [0.25, lit(shell, 0.35)], [0.5, shell], [1, dim(shell, 0.6)]], [0, 0, 1, 0]), { flat: true });
  s += E(cx, cy + h, rx, ry, grad([[0, dim(shell, 0.4)], [0.3, shell], [1, dim(shell, 0.6)]], [0, 0, 1, 0]), { flat: true });
  for (let k = 0; k < (o.lugs || 6); k++) {
    const t = (k + 0.5) / (o.lugs || 6), x = cx - rx + t * rx * 2;
    s += L(x, cy + 1, x, cy + h - 1, tubeH('#c8ccd4'), 0.7) + RR(x - 1, cy + h * 0.35, 2, h * 0.3, 0.8, tubeH('#e8ecf0'), { flat: true });
  }
  s += R(cx - rx - 0.5, cy + h - 1.2, rx * 2 + 1, 1.6, tubeV('#c8ccd4'), { flat: true });
  s += E(cx, cy, rx + 0.6, ry + 0.4, grad([[0, '#ffffff'], [1, '#6a707a']]), { flat: true });
  s += E(cx, cy, rx - 0.4, ry - 0.4, grad([[0, '#fbf8f0'], [0.7, '#e8e0cc'], [1, '#b8ac90']], [0.4, 0.35, 0.7], true), { flat: true });
  return s;
}

function cymbal(cx, cy, rx, rot = 0) {
  return `<g transform="rotate(${rot} ${cx} ${cy})">` + E(cx, cy, rx, rx * 0.16, grad([[0, '#fff0a0'], [0.4, '#d8a840'], [0.8, '#8a6420'], [1, '#4a3410']], [0, 0, 1, 0]), OL(0.4, '#3a2808')) +
    E(cx, cy - 0.3, rx * 0.6, rx * 0.08, 'none', { stroke: '#fff0b0', 'stroke-width': 0.4, opacity: 0.7 }) + E(cx, cy - 0.6, rx * 0.15, rx * 0.06, shR('#c89030'), { flat: true }) + '</g>';
}

function clip(shape, inner) {
  const id = 'zc' + (++UID).toString(36);
  DEFS.push(`<clipPath id="${id}">${shape}</clipPath>`);
  return `<g clip-path="url(#${id})">${inner}</g>`;
}

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
  'pno.pad': () => G('translate(-4 0) scale(0.92)', grandPiano()) + G('translate(136 56) rotate(-60) scale(0.62)', fiddle({})),
  'pno.prep': () => grandPiano() + [[44, 51], [58, 53.4], [72, 55.6], [86, 57.6], [100, 59.4]].map(([x, y]) => Ci(x, y, 1.5, grad([[0, '#ffffff'], [1, '#6a707a']], [0.3, 0.2, 0.7, 1]), OL(0.4, '#2a2e34'))).join('') +
    R(64, 56, 7, 2, '#e04a2a', OL(0.3, '#6a1a10')) + R(92, 59, 3, 3, '#f0d03a', OL(0.3, '#6a5a10')) + mark('prep.', 136, 86),
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
  'ep.choir': () => G('translate(0 10)', rhodes()) + GO(0.95, profile(126, 2, 0.34, { mouth: 'a', c: '#e2b894', hair: '#3a2416' })) + voiceWaves(145, 19, 2, '#f4e6c0', 3, 3),
  // 風琴
  'org.tonewheel': () => tonewheel(),
  'org.jazz': () => tonewheel({ wood: '#5a3018' }) + note(144, 18, 1.1, C.gold),
  'org.rock': () => tonewheel({ wood: '#2a2a2e' }) + bolt(144, 18, 1.2),
  'org.gospel': () => tonewheel({ wood: '#8a5428' }) + singer(144, 2, 0.6, { robe: '#5a2a7a', stole: '#f0d070', i: 4 }),
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
  'bel.glock': () => bars({ n: 14, metal: true, bar: C.silver, hl: C.silverL, frame: '#3a3d44', mallet: '#f0e0c0' }),
  'bel.musicbox': () => musicBox(),
  'bel.tubular': () => tubular(),
  'bel.church': () => churchBell(),
  'bel.gong': () => gong(),
  'bel.chime': () => windChime(),
  'bel.steel': () => steelPan(),
  'bel.marimba': () => bars({ n: 11, arch: true, bar: '#7a3a1e', hl: '#a85a32', frame: '#2a1a10', res: C.brass, legs: C.silverD, mallet: '#6a5aa0' }),
  'bel.xylo': () => bars({ n: 13, bar: '#d8a060', hl: '#f0c88a', frame: '#5a3018', legs: C.silverD, mallet: '#e8e0c8' }),
  'bel.vibes': () => bars({ n: 11, metal: true, bar: '#b8bec8', hl: '#e8ecf2', frame: '#2a2a30', res: '#c8ccd4', motor: true, legs: C.silverD, mallet: '#3a5aa0' }),
  'bel.kalimba': () => kalimba(),
  'bel.handpan': () => handpan(),
  'bel.glass': () => glassHarmonica(),
  'bel.bellfm': () => waveIcon('fm', { c: '#ffd23a' }) + G('translate(132 32) scale(1.5)', Pa('M-9 6 C-8 -2 -7 -9 0 -10 C7 -9 8 -2 9 6 L11 8 L-11 8 Z', grad([[0, '#fff0a0'], [0.5, C.gold], [1, '#7a5a10']], [0, 0, 1, 0]), OL(0.5, '#4a3008')) + Ci(0, 10, 2.2, shR(C.gold), { flat: true })) + badge('FM', '#5ac8fa', C.ol, 28, 24),
  'bel.temple': () => templeBell(),
  'bel.agogo': () => agogo(),
  // 吉他
  'gtr.nylon': () => guitar({ nylon: true, top: '#e8c690', edge: '#8a4a22' }),
  'gtr.steel': () => guitar({ guard: '#2a1a12', burst: C.burst }),
  'gtr.twelve': () => guitar({ twelve: true, top: '#e8c690', guard: '#2a1a12' }),
  'gtr.jumbo': () => guitar({ jumbo: true, burst: '#3a1a0a', guard: '#2a1a12', top: '#e0a050' }),
  'gtr.electric': () => eguitar({ fin: '#3a7ac0', guard: C.ivory }),
  'gtr.jazz': () => jazzGuitar(),
  'gtr.mute': () => eguitar({ fin: '#e8d8b0', guard: '#2a2a2e' }) + Pa('M18 38 L32 38 L32 62 L18 62 Z', '#000000', { opacity: 0.35 }) + mark('P.M.', 40, 14),
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
  'bas.upright2': () => G('translate(66 60) rotate(-90) scale(0.86)', fiddle({ endpin: true, bass: true, wood: '#8a3e17' })) + mark('pizz.', 118, 30),
  'bas.perc': () => eguitar({ bass: true, fin: '#e8d8b0', guard: '#2a2a2e' }) + burst(28, 50, 10, 4, 7, '#ffd23a', OL(1)),
  'bas.pluck': () => waveIcon('pluck', { c: '#7ae0b0', badge: 'BASS', badgeC: '#7ae0b0' }),
  'bas.dist': () => eguitar({ bass: true, fin: '#1e1e22', guard: '#c8423a', head: '#1e1e22' }) + bolt(146, 16, 1.2),
  'bas.moog': () => modular(),
  'bas.808': () => speaker({ c: '#f08a2a', badge: '808', badgeC: '#f08a2a' }),
  'bas.old': () => eguitar({ bass: true, fin: '#e8d0a0', burst: '#7a4a1a', guard: '#5a2a12', head: '#c98a4e' }) + cassette(136, 84, 0.8),
};

// 弦樂合奏：小提琴＋中提琴＋大提琴並排（前小後大）
function section(o = {}) {
  let s = G('translate(118 58) rotate(-90) scale(0.78)', fiddle({ endpin: true, wood: '#9a4218' }));
  s += G('translate(72 54) rotate(-74) scale(0.62)', fiddle({ wood: o.wood || '#b5531f' }));
  s += G('translate(32 58) rotate(-62) scale(0.54)', fiddle({ wood: '#c8682a' }));
  if (o.bows !== false) s += G('translate(8 92) rotate(-24)', bow(70)) + G('translate(84 96) rotate(-30)', bow(70));
  return s;
}
Object.assign(ART, {
  // 弦樂
  'str.ensemble': () => section(),
  'str.solo': () => violin(1.2),
  'str.viola': () => G('translate(70 48) rotate(-14) scale(1.3)', fiddle({ wood: '#8e3f16' })) + G('translate(16 90) rotate(-8)', bow(126)) + mark('viola', 30, 14),
  'str.cello': () => cello(),
  'str.bass': () => cello({ bass: true }),
  'str.pizz': () => violinV({ scale: 1.2, bow: false }) + mark('pizz.', 36, 16),
  'str.trem': () => section() + zig(112, 12, 40),
  'str.spicc': () => section() + [118, 132, 146].map(x => Ci(x, 12, 2.6, '#ffd23a') + L(x, 12, x, -0, C.ivory, 0)).join('') + SP('M114 20 L150 20', '#ffd23a', 1.6),
  'str.octave': () => section() + T(136, 18, '8va', '#ffd23a', 12),
  'str.pad': () => pad(PADC.warm, GO(0.9, section({ bows: false }))),
  'str.chamber': () => G('translate(100 58) rotate(-90) scale(0.78)', fiddle({ endpin: true, wood: '#9a4218' })) + G('translate(50 56) rotate(-72) scale(0.62)', fiddle({ wood: '#b5531f' })) +
    R(126, 64, 20, 3, shV(C.woodD), OL(0.6, '#1a0804')) + L(130, 67, 128, 94, C.woodD, 2) + L(142, 67, 144, 94, C.woodD, 2) + L(136, 30, 136, 64, tubeH('#8a909a'), 1.6) + Po('124,26 148,26 146,40 126,40', '#f4f0e6', OL(0.6, '#8a8070')) +
    range(4).map(i => L(127, 29 + i * 2.6, 145, 29 + i * 2.6, '#8a8070', 0.3)).join(''),
  'str.sul': () => violin(1.2) + mark('sul pont.', 36, 14, '#c8f0ff'),
  'str.epic': () => section({ wood: '#9a3a18' }) + Po('0,0 30,0 60,56 0,30', '#fff6c8', { opacity: 0.14 }) + burst(140, 16, 10, 5, 8, '#ffd23a', OL(1)),
  'str.trem2': () => violin(1.2) + mark('trem.', 36, 14),
  'str.choir': () => G('translate(-14 10) scale(0.85)', section({ bows: false })) + singer(130, 14, 1.25, { robe: '#6a2234', i: 1, long: true, folder: true }),
  'str.mute': () => violinV({ scale: 1.2, mute: true }) + mark('con sord.', 38, 14, '#b8bec8'),
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
  'wnd.whistle': () => profile(14, 14, 1.1, { mouth: 'w', c: '#e2b894', hair: '#4a3020' }) + SP('M80 66 q7 -6 14 0 t14 0 t14 0', '#f4e6c0', 2) + note(132, 44, 1.2, C.gold) + note(146, 26, 0.85, C.gold),
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
  'cho.aah': () => choir({ robe: '#6a2234', stole: '#e8d6a0' }),
  'cho.ooh': () => choir({ kind: 'tux', seed: 3, light: '#c8d8f0' }),
  'cho.choir': () => choir({ robe: '#3a2a5a', stole: '#e8d6a0', rows: [[6, 1.0, 7, 10, 23.3], [26, 1.15, 6, 21, 23.6], [48, 1.35, 5, 18, 31]] }),
  'cho.doo': () => profile(18, 14, 1.1, { mouth: 'o', c: '#e2b894', hair: '#3a2416' }) + voiceWaves(80, 68, 3, '#f4e6c0', 8, 9) + T(130, 50, 'doo', '#f4e6c0', 16, { 'font-style': 'italic' }),
  'cho.whisper': () => profile(18, 14, 1.1, { mouth: 'w', c: '#d8b8a0', hair: '#6a4a2a', long: true }) +
    GO(0.75, SP('M82 66 C96 60 108 70 122 64 C134 58 142 64 152 60', '#c8e0f0', 1.4)) + GO(0.5, SP('M84 72 C98 70 112 78 126 74 C136 71 144 74 152 72', '#c8e0f0', 1.2)) +
    range(14).map(i => Ci(86 + (i * 47) % 64, 54 + (i * 29) % 26, 0.6 + (i % 3) * 0.35, '#e8f4ff', { opacity: 0.35 + (i % 4) * 0.15 })).join(''),
  'cho.vocal': () => profile(6, 14, 1.1, { mouth: 'a', c: '#b8c8e8', hair: '#2a3450' }) + microphone(76, 66, 0.9) +
    RR(92, 30, 62, 42, 3, '#0c1218', OL(1, '#3a4658')) + range(13).map(i => { const h = 4 + ((i * 7) % 9) * 3.2; return RR(96 + i * 4.4, 51 - h / 2, 2.6, h, 1.2, i % 4 ? '#5ac8fa' : '#b8a0f0'); }).join(''),
  'cho.boys': () => choir({ kind: 'kid', rows: [[16, 1.4, 5, 18, 31], [42, 1.6, 4, 33, 31]], light: '#f8f0d8' }),
  'cho.mm': () => profile(18, 14, 1.1, { mouth: 'm', c: '#e2b894', hair: '#1a1614', long: true }) +
    SP('M80 58 q6 -5 12 0 t12 0 t12 0 t12 0 t12 0', '#f4e6c0', 1.8) + GO(0.5, SP('M80 66 q6 -4 12 0 t12 0 t12 0 t12 0', '#f4e6c0', 1.4)) + note(138, 36, 1, C.gold),
  'cho.vowel': () => fxFrame('#14182a', ['A', 'E', 'I', 'O', 'U'].map((v, i) => T(22 + i * 29, 46, v, i % 2 ? '#5ac8fa' : '#b8a0f0', 20)).join('') + wave('sin', 16, 72, 128, 14, '#7ae0b0', 2)),
  'cho.pad': () => pad(PADC.pink, GO(0.95, choir({ bg: false, robe: '#80306a', stole: '#f0c8e0', folder: false, rows: [[12, 0.85, 5, 38, 21], [24, 0.95, 4, 48, 21]] }))),
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
  'led.whistle': () => waveIcon('sin', { c: '#c8f0ff' }) + GO(0.95, profile(118, 18, 0.42, { mouth: 'w', c: '#c8d8f0', hair: '#2a3450' })),
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
  'pad.glass': () => pad(PADC.cold, Pa('M64 12 L96 12 L92 38 Q80 48 68 38 Z', grad([[0, '#ffffff', 0.7], [0.5, '#c8f0ff', 0.35], [1, '#ffffff', 0.6]], [0, 0, 1, 0]), { stroke: '#ffffff', 'stroke-width': 1 }) +
    Pa('M70 26 L90 26 L88 37 Q80 43 72 37 Z', '#7ac8f0', { opacity: 0.45 }) + L(80, 46, 80, 60, '#ffffff', 1.2) + E(80, 61, 9, 1.8, '#ffffff', { opacity: 0.8 }) + L(68, 14, 71, 34, '#ffffff', 1, { opacity: 0.7 }) + sparkle(102, 16, 5, '#ffffff')),
  'pad.choir': () => pad(PADC.violet, GO(0.95, choir({ bg: false, robe: '#3a2a7a', stole: '#d8c8ff', folder: false, rows: [[12, 0.85, 5, 38, 21], [24, 0.95, 4, 48, 21]] }))),
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
  'pad.soft': () => pad(PADC.pink, GO(0.92, Pa('M52 38 C44 38 42 28 50 26 C50 16 62 14 66 20 C70 10 88 10 90 20 C96 14 108 18 106 26 C114 26 116 38 106 38 Z', grad([[0, '#ffffff'], [1, '#f0c8e0']]), { flat: true })) + SP('M54 36 C70 38 92 38 104 36', '#d8a0c8', 0.8, { opacity: 0.6 })),
  'pad.big': () => pad(PADC.violet, mountain('#3a2a6a', '#6a5aa0')),
  'pad.motion': () => pad(PADC.green, Ci(80, 28, 16, 'none', { stroke: '#e8fff4', 'stroke-width': 2.6, 'stroke-dasharray': '8 5' }) + arrow(94, 18, 98, 26, '#e8fff4', 2.4) + Ci(80, 28, 4, '#e8fff4')),
  'pad.cinema': () => pad(PADC.dark, G('translate(16 -14) scale(0.8)', film())),
  'pad.vox': () => pad(PADC.pink, profile(52, 8, 0.6, { mouth: 'a', c: '#f0c0d8', hair: '#80306a' }) + voiceWaves(90, 37, 3, '#ffffff', 5, 6)),
  'pad.pulse': () => pad(PADC.warm, range(7).map(i => { const h = i % 2 ? 26 : 14; return RR(28 + i * 16, 30 - h / 2, 8, h, 4, grad([[0, '#fff4d8'], [1, '#f0a060']]), { flat: true }) + RR(26 + i * 16, 28 - h / 2, 12, h + 4, 6, '#ffe0b0', { flat: true, opacity: 0.2 }); }).join('')),
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
  DEFS = []; GCACHE = new Map();
  try { body = f ? f() : fallback(); } catch (e) { console.error('zyArt', id, e); DEFS = []; GCACHE = new Map(); body = fallback(); }
  const defs = DEFS.length ? `<defs>${DEFS.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" role="img" aria-hidden="true">${defs}${body}</svg>`;
}
