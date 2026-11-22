// 自動化編輯：按 A 或「自動化」按鈕切換顯示。
// 每條軌道疊一層 SVG：點空白新增點、拖曳移動、雙擊或右鍵刪除；Shift 拖曳 = 不對齊格線。
// 軌道標頭會多一列：參數選單（音量／聲像／Send A／Send B）＋ 開關（讀取自動化）。
import { store, spb } from './state.js';
import { engine } from './engine.js';
import { view, secToPx, pxToSec, snap } from './view.js';
import { AUTO_PARAMS, lane, addPoint, removePoint, valueAt } from './automation.js';
import { toast } from './util.js';

const $ = id => document.getElementById(id);
let on = false;

export const autoViewOn = () => on;

export function initAutomationUi() {
  const btn = $('btnAuto');
  if (btn) btn.onclick = toggle;
  store.on('toggle-automation', toggle);
  // 編排視窗的 change/zoom 處理器先註冊（會重建 lane DOM），這裡排在下一幀再疊上曲線
  const later = () => on && requestAnimationFrame(decorate);
  store.on('change', later);
  store.on('zoom', later);
  store.on('select', later);
}

// 給其他功能用（例如「去除呼吸聲」寫完自動化後直接把檢視打開）
export function setAutoView(v) {
  if (!!v !== on) toggle();
}

function toggle() {
  on = !on;
  $('btnAuto')?.classList.toggle('on', on);
  document.getElementById('lanesInner').classList.toggle('auto-view', on);
  // 軌道加高，容納標頭的參數選單與曲線編輯空間
  view.trackH = on ? 84 : 64;
  document.documentElement.style.setProperty('--track-h', view.trackH + 'px');
  store.emit('zoom', {});   // 讓編排視窗用新高度重畫（zoom 事件會觸發 render，之後 decorate）
  if (on) toast('自動化：點曲線新增控制點、拖曳移動、雙擊刪除；Shift 拖曳不對齊格線');
  else clear();
}

function clear() {
  document.querySelectorAll('.auto-ov, .auto-hrow').forEach(n => n.remove());
}

// 依參數把值換成 0..1 的高度位置（dB 參數用比較好操作的曲線：-60 dB 放在底部，0 dB 在約 80% 高）
function toY(def, v, h) {
  let t;
  if (def.min === -60) t = v <= -60 ? 0 : Math.pow((v + 60) / 66, 2.2);
  else t = (v - def.min) / (def.max - def.min);
  return h - 4 - t * (h - 8);
}
function fromY(def, y, h) {
  const t = Math.max(0, Math.min(1, (h - 4 - y) / (h - 8)));
  if (def.min === -60) return Math.round((t <= 0.001 ? -60 : Math.pow(t, 1 / 2.2) * 66 - 60) * 10) / 10;
  return Math.round((def.min + t * (def.max - def.min)) * 100) / 100;
}

function decorate() {
  clear();
  const p = store.project;
  const b = spb();
  for (const t of p.tracks) {
    const laneEl = document.querySelector(`.lane[data-id="${t.id}"]`);
    const head = document.querySelector(`.thead[data-id="${t.id}"]`);
    if (!laneEl) continue;
    const param = t.autoParam || 'volume';
    const def = AUTO_PARAMS[param];
    const L = lane(t, param);
    // ---- 標頭：參數選單 + 讀取開關 ----
    if (head) {
      const row = document.createElement('div');
      row.className = 'auto-hrow';
      row.innerHTML = `<select title="要自動化的參數">${Object.entries(AUTO_PARAMS).map(([k, d]) => `<option value="${k}"${k === param ? ' selected' : ''}>${d.label}${t.auto?.[k]?.points?.length ? ' •' : ''}</option>`).join('')}</select>
        <button class="mini auto-r ${L.on ? 'on' : ''}" title="讀取自動化（關閉時用推桿的固定值）">R</button>`;
      const sel = row.querySelector('select');
      sel.addEventListener('keydown', e => e.stopPropagation());
      sel.addEventListener('pointerdown', e => e.stopPropagation());
      sel.onchange = () => { t.autoParam = sel.value; decorate(); };
      row.querySelector('button').onclick = e => { e.stopPropagation(); store.checkpoint(); L.on = !L.on; store.changed('mix'); engine.playing && engine.restartAt(engine.currentTime()); decorate(); };
      head.querySelector('.body').appendChild(row);
    }
    // ---- 曲線 ----
    // 每軌可以有自己的高度（拖標頭下緣），要用「這一軌」的高度，曲線才會跟著拉長
    const h = Math.max(32, Math.round(t.h || view.trackH));
    const w = laneEl.parentElement.offsetWidth;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'auto-ov' + (L.on ? '' : ' off'));
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    const pts = L.points;
    const staticV = param === 'volume' ? t.volumeDb : param === 'pan' ? t.pan : t.sends[Number(param.slice(4))];
    const xy = q => [secToPx(q.t * b), toY(def, q.v, h)];
    let d = '';
    if (pts.length) {
      const [x0, y0] = xy(pts[0]);
      d = `M0 ${y0} L${x0} ${y0}`;
      for (const q of pts) { const [x, y] = xy(q); d += ` L${x} ${y}`; }
      d += ` L${w} ${xy(pts[pts.length - 1])[1]}`;
    } else {
      const y = toY(def, staticV, h);
      d = `M0 ${y} L${w} ${y}`;
    }
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d); path.setAttribute('class', 'auto-line' + (pts.length ? '' : ' flat'));
    path.style.stroke = t.color;
    svg.appendChild(path);
    for (const q of pts) {
      const [x, y] = xy(q);
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4.5);
      c.setAttribute('class', 'auto-pt');
      c.style.fill = t.color;
      c._pt = q;
      const tip = document.createElementNS(svgNS, 'title'); tip.textContent = `${def.label} ${def.fmt(q.v)}`;
      c.appendChild(tip);
      svg.appendChild(c);
    }
    const lab = document.createElementNS(svgNS, 'text');
    lab.setAttribute('x', 6 + laneEl.parentElement.parentElement.scrollLeft); lab.setAttribute('y', 12); lab.setAttribute('class', 'auto-lab');
    // 只有「已有自動化」或「選取中」的軌道顯示文字，避免 16 軌全是說明
    const sel = t.id === store.selection.trackId;
    if (pts.length || sel) {
      lab.textContent = `${def.label}${pts.length && !L.on ? '（未讀取，按標頭的 R 開啟）' : ''}${pts.length ? '' : '：在這一軌點一下開始畫'}`;
      svg.appendChild(lab);
    }
    bind(svg, t, param, def, L, h);
    laneEl.appendChild(svg);
  }
}

// 控制點旁邊顯示「這個點是多少 dB」的小標籤（原生 tooltip 太慢，而且拖曳時看不到）
const SVGNS = 'http://www.w3.org/2000/svg';
function tipNode(svg) {
  let g = svg.querySelector('.auto-tip');
  if (!g) {
    g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'auto-tip');
    const rect = document.createElementNS(SVGNS, 'rect');
    rect.setAttribute('rx', '3');
    const text = document.createElementNS(SVGNS, 'text');
    g.appendChild(rect); g.appendChild(text);
    svg.appendChild(g);
  }
  return g;
}
function showTip(svg, pt, def, h) {
  if (!pt) return hideTip(svg);
  const g = tipNode(svg);
  const x = secToPx(pt.t * spb()), y = toY(def, pt.v, h);
  const txt = def.fmt(pt.v);
  const tw = Math.max(40, txt.length * 6.6 + 12);
  const tx = Math.max(2, Math.min(Number(svg.getAttribute('width')) - tw - 2, x - tw / 2));
  const ty = y > 26 ? y - 26 : y + 8;
  const rect = g.querySelector('rect'), text = g.querySelector('text');
  rect.setAttribute('x', tx); rect.setAttribute('y', ty);
  rect.setAttribute('width', tw); rect.setAttribute('height', 17);
  text.setAttribute('x', tx + 6); text.setAttribute('y', ty + 12);
  text.textContent = txt;
  g.style.display = '';
}
function hideTip(svg) { const g = svg.querySelector('.auto-tip'); if (g) g.style.display = 'none'; }

function bind(svg, t, param, def, L, h) {
  const b = spb();
  const local = e => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  // 滑過控制點：顯示數值
  svg.addEventListener('pointermove', e => {
    if (svg._dragging) return;
    const pt = e.target._pt;
    if (pt) { svg.style.cursor = 'grab'; showTip(svg, pt, def, h); }
    else { if (e.target.tagName !== 'rect' && e.target.tagName !== 'text') svg.style.cursor = 'crosshair'; hideTip(svg); }
  });
  svg.addEventListener('pointerleave', () => hideTip(svg));
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    store.selection.trackId = t.id;
    svg.setPointerCapture(e.pointerId);
    store.checkpoint();
    let pt = e.target._pt;
    if (!pt) {
      const { x, y } = local(e);
      const beat = (e.shiftKey ? pxToSec(x) : snap(pxToSec(x))) / b;
      // 第一個點：連同起點一起建，曲線從頭就有值
      if (!L.points.length) {
        const sv = param === 'volume' ? t.volumeDb : param === 'pan' ? t.pan : t.sends[Number(param.slice(4))];
        if (beat > 0) addPoint(L, 0, sv);
      }
      pt = addPoint(L, beat, fromY(def, y, h));
      if (!L.on) { L.on = true; toast(`已開啟「${t.name}」的${def.label}自動化`); }
    }
    svg._dragging = true;
    showTip(svg, pt, def, h);
    const move = ev => {
      const { x, y } = local(ev);
      pt.t = Math.max(0, (ev.shiftKey ? pxToSec(x) : snap(pxToSec(x))) / b);
      pt.v = fromY(def, y, h);
      L.points.sort((a, z) => a.t - z.t);
      redrawOne(svg, t, def, L, h);
      showTip(svg, pt, def, h);
    };
    const up = () => {
      svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up);
      svg._dragging = false;
      store.changed('mix');
      if (engine.playing) engine.restartAt(engine.currentTime());
      decorate();
    };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up);
  });
  const del = e => {
    const pt = e.target._pt;
    if (!pt) return;
    e.preventDefault(); e.stopPropagation();
    store.checkpoint(); removePoint(L, pt); store.changed('mix');
    if (engine.playing) engine.restartAt(engine.currentTime());
    decorate();
  };
  svg.addEventListener('dblclick', del);
  svg.addEventListener('contextmenu', e => { if (e.target._pt) del(e); else e.stopPropagation(); });
}

// 拖曳時只更新這一條的線與點（不整個重建）
function redrawOne(svg, t, def, L, h) {
  const b = spb(), w = Number(svg.getAttribute('width'));
  const xy = q => [secToPx(q.t * b), toY(def, q.v, h)];
  const pts = L.points;
  let d = '';
  const [x0, y0] = xy(pts[0]);
  d = `M0 ${y0} L${x0} ${y0}`;
  for (const q of pts) { const [x, y] = xy(q); d += ` L${x} ${y}`; }
  d += ` L${w} ${xy(pts[pts.length - 1])[1]}`;
  svg.querySelector('path').setAttribute('d', d);
  svg.querySelector('path').classList.remove('flat');
  const circles = [...svg.querySelectorAll('circle')];
  // 點的數量沒變（拖曳中），直接搬位置
  if (circles.length === pts.length) circles.forEach(c => { const [x, y] = xy(c._pt); c.setAttribute('cx', x); c.setAttribute('cy', y); });
  else {
    circles.forEach(c => c.remove());
    for (const q of pts) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const [x, y] = xy(q); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4.5);
      c.setAttribute('class', 'auto-pt'); c.style.fill = t.color; c._pt = q;
      svg.appendChild(c);
    }
  }
}

// 每幀：播放中讓有自動化的推桿跟著動（混音台與標頭的音量滑桿）
export function tickAutomation() {
  if (!engine.playing) return;
  for (const t of store.project.tracks) {
    const v = engine.autoValue(t, 'volume');
    if (v === null) continue;
    const vol = document.querySelector(`.thead[data-id="${t.id}"] .vol`);
    if (vol && document.activeElement !== vol) vol.value = v;
  }
}
export { valueAt };
