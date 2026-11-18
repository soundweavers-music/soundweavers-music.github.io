// 鋼琴捲簾：編輯單一 MIDI 片段
//  - 左側琴鍵（點一下試聽；鼓組軌顯示 GM 鼓位名稱）
//  - 主格線：點空白新增音符、拖曳移動、拖右緣改長度、Shift 多選、框選、右鍵/Del 刪除
//  - 下方力度條：拖曳調整選取音符力度
//  - 工具列：格線、量化、移調、力度、刪除
import { store, isMidiClip, spb, clipStart } from './state.js';
import { pedalSpans } from './engine.js';
import { engine } from './engine.js';
import { PRESETS, DRUM_NAMES, noteName } from './synth.js';
import { toast } from './util.js';

const KEYS_W = 64, ROW_H = 12, VEL_H = 64, LOW = 0, HIGH = 127;
const BLACK = new Set([1, 3, 6, 8, 10]);
const $ = id => document.getElementById(id);

const pr = {
  clipId: null,
  pxPerBeat: 80,
  grid: 0.25,          // 拍；0.25 = 16 分音符
  sel: new Set(),      // 選取的音符索引（以物件參照，避免索引變動）
  lastLen: 1,          // 新音符預設長度（沿用最後一次編輯的長度）
  scrollY: null,
};

let root, keysCv, gridCv, velCv, pedCv, wrap, info;
const PED_H = 22;

export function initPianoRoll() {
  root = $('pianoroll');
  root.innerHTML = `
    <div class="pr-bar">
      <strong id="prTitle">鋼琴捲簾</strong>
      <span class="pr-info" id="prInfo"></span>
      <div class="spacer"></div>
      <label>格線 <select id="prGrid">
        <option value="1">1/4</option><option value="0.5">1/8</option><option value="0.25" selected>1/16</option>
        <option value="0.125">1/32</option><option value="0.3333333333">1/8 三連音</option><option value="0.1666666667">1/16 三連音</option>
      </select></label>
      <button class="tbtn" id="prQuant" title="把選取的音符（沒選就是全部）對齊格線 (Q)">量化</button>
      <button class="tbtn" id="prUp" title="選取音符升半音（Shift：升八度）">↑</button>
      <button class="tbtn" id="prDown" title="選取音符降半音（Shift：降八度）">↓</button>
      <label>力度 <input type="number" id="prVel" min="1" max="127" value="100" style="width:52px"></label>
      <button class="tbtn" id="prZoomOut">−</button><button class="tbtn" id="prZoomIn">＋</button>
      <button class="tbtn ghost" id="prClose" title="關閉 (Esc)">✕</button>
    </div>
    <div class="pr-body" id="prBody">
      <canvas id="prKeys"></canvas>
      <div class="pr-scroll" id="prScroll"><div class="pr-inner" id="prInner"></div></div>
      <canvas id="prGridCv"></canvas>
    </div>
    <div class="pr-vel"><div class="pr-vel-lbl">力度</div><canvas id="prVelCv"></canvas></div>
    <div class="pr-ped"><div class="pr-vel-lbl" title="延音踏板（CC64）：點空白新增一段、拖兩端改長度、右鍵刪除">踏板</div><canvas id="prPedCv"></canvas></div>`;
  keysCv = $('prKeys'); gridCv = $('prGridCv'); velCv = $('prVelCv'); wrap = $('prScroll'); info = $('prInfo');
  pedCv = $('prPedCv');
  pedCv.addEventListener('pointerdown', onPedDown);
  pedCv.addEventListener('contextmenu', onPedContext);
  pedCv.addEventListener('pointermove', e => { if (!e.buttons) { const h = pedHit(e); pedCv.style.cursor = h ? (h.edge ? 'ew-resize' : 'grab') : 'copy'; } });

  $('prGrid').onchange = e => { pr.grid = Number(e.target.value); draw(); };
  $('prQuant').onclick = quantize;
  $('prUp').onclick = e => transpose(e.shiftKey ? 12 : 1);
  $('prDown').onclick = e => transpose(e.shiftKey ? -12 : -1);
  $('prVel').onchange = e => setVelocity(Number(e.target.value));
  $('prZoomIn').onclick = () => { pr.pxPerBeat = Math.min(400, pr.pxPerBeat * 1.4); layout(); };
  $('prZoomOut').onclick = () => { pr.pxPerBeat = Math.max(16, pr.pxPerBeat / 1.4); layout(); };
  $('prClose').onclick = close;
  $('prVel').addEventListener('keydown', e => e.stopPropagation());

  wrap.addEventListener('scroll', draw);
  wrap.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      pr.pxPerBeat = Math.max(16, Math.min(400, pr.pxPerBeat * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      layout();
    }
  }, { passive: false });
  wrap.addEventListener('pointerdown', onGridDown);
  wrap.addEventListener('contextmenu', e => { e.preventDefault(); const hit = hitNote(e); if (hit) deleteNotes([hit.note]); });
  wrap.addEventListener('pointermove', onHover);
  keysCv.addEventListener('pointerdown', onKeysDown);
  velCv.addEventListener('pointerdown', onVelDown);
  new ResizeObserver(() => layout()).observe(root);

  store.on('change', ({ kind }) => {
    if (!pr.clipId) return;
    if (!store.findClip(pr.clipId)) { close(); return; }
    if (kind === 'structure' || kind === 'mix') layout();
  });
  store.on('open-piano-roll', ({ clipId }) => open(clipId));
  store.on('midi-rec', ({ clipId }) => { if (clipId === pr.clipId) layout(); });
}

export const isOpen = () => !!pr.clipId && !root.classList.contains('hidden');

function cur() {
  const f = pr.clipId && store.findClip(pr.clipId);
  return f && isMidiClip(f.clip) ? f : null;
}

export function open(clipId) {
  const f = store.findClip(clipId);
  if (!f || !isMidiClip(f.clip)) return;
  pr.clipId = clipId;
  pr.sel = new Set();
  store.selection.trackId = f.track.id;
  store.selection.clipIds = new Set([clipId]);
  store.emit('select', {});
  store.emit('panel', { name: 'pianoroll' });
  root.classList.remove('hidden');
  requestAnimationFrame(() => {
    layout();
    // 第一次打開：捲到音符所在的音域（沒有音符就捲到 C4）
    const notes = f.clip.notes;
    const center = notes.length ? notes.reduce((s, n) => s + n.p, 0) / notes.length : 60;
    wrap.scrollTop = Math.max(0, (HIGH - center) * ROW_H - wrap.clientHeight / 2);
    wrap.scrollLeft = 0;
    draw();
  });
}

export function close() {
  pr.clipId = null;
  root.classList.add('hidden');
  store.emit('panel', { name: null });
}

function layout() {
  const f = cur();
  if (!f || root.classList.contains('hidden')) return;
  const inner = $('prInner');
  const beats = Math.max(f.clip.lengthBeats + store.project.sigNum * 4, 16);
  inner.style.width = (beats * pr.pxPerBeat) + 'px';
  inner.style.height = ((HIGH - LOW + 1) * ROW_H) + 'px';
  const P = PRESETS[f.track.instrument];
  $('prTitle').textContent = `${f.track.name} — ${f.clip.name}`;
  $('prTitle').style.color = f.track.color;
  info.textContent = `${P ? P.name : ''}・${f.clip.notes.length} 個音符・${fmtLen(f.clip.lengthBeats)}`;
  draw();
}

const fmtLen = beats => {
  const n = store.project.sigNum, bars = Math.floor(beats / n), rest = +(beats - bars * n).toFixed(2);
  return rest ? `${bars} 小節 ${rest} 拍` : `${bars} 小節`;
};

function setup(c, w, h) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

const yOf = p => (HIGH - p) * ROW_H;
const pOf = y => Math.max(LOW, Math.min(HIGH, HIGH - Math.floor(y / ROW_H)));
const xOf = beat => beat * pr.pxPerBeat;
const bOf = x => x / pr.pxPerBeat;
const snapB = (b, force) => (force === false ? b : Math.round(b / pr.grid) * pr.grid);
const floorB = b => Math.floor(b / pr.grid + 1e-6) * pr.grid;

export function draw() {
  const f = cur();
  if (!f || root.classList.contains('hidden')) return;
  const { clip, track } = f;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const sx = wrap.scrollLeft, sy = wrap.scrollTop;
  const drums = PRESETS[track.instrument]?.drum;

  // ---- 琴鍵 ----
  const k = setup(keysCv, KEYS_W, H);
  k.fillStyle = '#1b1c20'; k.fillRect(0, 0, KEYS_W, H);
  k.font = '9.5px ui-monospace, Consolas, monospace'; k.textBaseline = 'middle';
  for (let p = pOf(sy + H) ; p <= Math.min(HIGH, pOf(sy) + 1); p++) {
    const y = yOf(p) - sy;
    const black = BLACK.has(p % 12);
    k.fillStyle = drums ? (DRUM_NAMES[p] ? '#d9dbe0' : '#9a9da5') : black ? '#25272c' : '#d9dbe0';
    k.fillRect(0, y, KEYS_W - 1, ROW_H - 1);
    if (drums && DRUM_NAMES[p]) { k.fillStyle = '#111'; k.fillText(DRUM_NAMES[p], 4, y + ROW_H / 2); }
    else if (!drums && p % 12 === 0) { k.fillStyle = '#333'; k.fillText(noteName(p), KEYS_W - 26, y + ROW_H / 2); }
  }

  // ---- 格線 ----
  const g = setup(gridCv, W, H);
  for (let p = pOf(sy + H); p <= Math.min(HIGH, pOf(sy) + 1); p++) {
    const y = yOf(p) - sy;
    g.fillStyle = drums ? (DRUM_NAMES[p] ? '#202227' : '#18191c') : BLACK.has(p % 12) ? '#1a1b1f' : '#212328';
    g.fillRect(0, y, W, ROW_H);
    if (p % 12 === 0) { g.fillStyle = '#2f3238'; g.fillRect(0, y + ROW_H - 1, W, 1); }
  }
  const n = store.project.sigNum;
  const b0 = Math.floor(bOf(sx) / pr.grid) * pr.grid, b1 = bOf(sx + W);
  for (let b = b0; b <= b1; b += pr.grid) {
    const x = Math.round(xOf(b) - sx) + 0.5;
    const isBar = Math.abs(b / n - Math.round(b / n)) < 1e-6;
    const isBeat = Math.abs(b - Math.round(b)) < 1e-6;
    g.strokeStyle = isBar ? '#4a4d55' : isBeat ? '#33363d' : '#26282d';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    if (isBar && b >= 0) { g.fillStyle = '#8a8e97'; g.font = '10px ui-monospace, Consolas'; g.fillText(String(Math.round(b / n) + 1), x + 3, 10); }
  }
  // 片段範圍之外變暗
  const endX = xOf(clip.lengthBeats) - sx;
  if (endX < W) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(Math.max(0, endX), 0, W, H); g.fillStyle = track.color; g.fillRect(endX - 1, 0, 2, H); }

  // ---- 音符 ----
  for (const note of clip.notes) {
    const x = xOf(note.t) - sx, w = Math.max(3, xOf(note.d) - 1), y = yOf(note.p) - sy;
    if (x + w < 0 || x > W || y + ROW_H < 0 || y > H) continue;
    const sel = pr.sel.has(note);
    const a = 0.45 + 0.55 * note.v / 127;
    g.globalAlpha = note.t >= clip.lengthBeats ? 0.3 : 1;
    g.fillStyle = sel ? '#ffffff' : shade(track.color, a);
    g.fillRect(x, y + 1, w, ROW_H - 2);
    g.strokeStyle = sel ? track.color : 'rgba(0,0,0,.6)';
    g.strokeRect(x + 0.5, y + 1.5, w - 1, ROW_H - 3);
    if (w > 28 && !drums) { g.fillStyle = sel ? '#111' : 'rgba(0,0,0,.7)'; g.font = '9px ui-monospace, Consolas'; g.fillText(noteName(note.p), x + 3, y + ROW_H - 3); }
  }
  g.globalAlpha = 1;
  // 播放頭
  const ph = engine.currentTime() / spb() - clip.startBeat;
  const phx = xOf(ph) - sx;
  if (phx >= 0 && phx <= W) { g.fillStyle = '#fff'; g.fillRect(phx, 0, 1, H); }
  if (marquee) { g.strokeStyle = '#4f9dff'; g.fillStyle = 'rgba(79,157,255,.12)'; const m = marquee; g.fillRect(m.x - sx, m.y - sy, m.w, m.h); g.strokeRect(m.x - sx + .5, m.y - sy + .5, m.w, m.h); }

  // ---- 力度條 ----
  const vw = velCv.parentElement.clientWidth - KEYS_W;
  const v = setup(velCv, Math.max(10, vw), VEL_H);
  v.fillStyle = '#16171a'; v.fillRect(0, 0, vw, VEL_H);
  v.strokeStyle = '#2a2c31'; v.beginPath(); v.moveTo(0, VEL_H / 2 + .5); v.lineTo(vw, VEL_H / 2 + .5); v.stroke();
  for (const note of clip.notes) {
    const x = xOf(note.t) - sx;
    if (x < -4 || x > vw) continue;
    const h = (note.v / 127) * (VEL_H - 6);
    v.fillStyle = pr.sel.has(note) ? '#fff' : track.color;
    v.fillRect(x, VEL_H - h, 3, h);
    v.beginPath(); v.arc(x + 1.5, VEL_H - h, 3, 0, Math.PI * 2); v.fill();
  }

  // ---- 踏板列 ----
  const pw = Math.max(10, vw);
  const pg = setup(pedCv, pw, PED_H);
  pg.fillStyle = '#131417'; pg.fillRect(0, 0, pw, PED_H);
  for (const [a, z] of pedalSpans(clip)) {
    const x0 = xOf(a) - sx, x1 = xOf(Math.min(z, clip.lengthBeats)) - sx;
    if (x1 < 0 || x0 > pw) continue;
    const grad = pg.createLinearGradient(0, 0, 0, PED_H);
    grad.addColorStop(0, track.color); grad.addColorStop(1, shade(track.color, 0.45));
    pg.fillStyle = grad;
    pg.fillRect(x0, 4, Math.max(2, x1 - x0), PED_H - 8);
    pg.fillStyle = '#fff';
    pg.fillRect(x0, 4, 2, PED_H - 8); pg.fillRect(x1 - 2, 4, 2, PED_H - 8);
    if (x1 - x0 > 40) { pg.fillStyle = 'rgba(0,0,0,.65)'; pg.font = '10px sans-serif'; pg.fillText('Ped.', x0 + 5, PED_H - 7); }
  }
}

function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${gg},${b},${a})`;
}

// ---------------- 互動 ----------------
let marquee = null;

function local(e) {
  const r = wrap.getBoundingClientRect();
  return { x: e.clientX - r.left + wrap.scrollLeft, y: e.clientY - r.top + wrap.scrollTop };
}

function hitNote(e) {
  const f = cur(); if (!f) return null;
  const { x, y } = local(e);
  const p = pOf(y), b = bOf(x);
  // 後畫的在上面：倒序找
  for (let i = f.clip.notes.length - 1; i >= 0; i--) {
    const n = f.clip.notes[i];
    if (n.p === p && b >= n.t && b <= n.t + n.d) {
      const right = xOf(n.t + n.d) - x;
      return { note: n, edge: right < Math.min(8, xOf(n.d) / 3) ? 'r' : 'm' };
    }
  }
  return null;
}

function onHover(e) {
  if (e.buttons) return;
  const h = hitNote(e);
  wrap.style.cursor = h ? (h.edge === 'r' ? 'ew-resize' : 'grab') : 'crosshair';
}

function onGridDown(e) {
  if (e.button !== 0) return;
  const f = cur(); if (!f) return;
  e.preventDefault();
  wrap.setPointerCapture(e.pointerId);
  const { clip, track } = f;
  const start = local(e);
  const hit = hitNote(e);

  if (!hit) {
    if (e.shiftKey || e.altKey) return startMarquee(e, start);
    // 點空白：新增音符
    store.checkpoint();
    const t = floorB(bOf(start.x));
    if (t < 0) return;
    const note = { p: pOf(start.y), t, d: pr.lastLen, v: Number($('prVel').value) || 100 };
    clip.notes.push(note);
    if (t + note.d > clip.lengthBeats) clip.lengthBeats = Math.ceil((t + note.d) / store.project.sigNum) * store.project.sigNum;
    pr.sel = new Set([note]);
    engine.audition(track.id, note.p, note.v);
    // 新增後可以直接拖曳拉長
    return dragNotes(e, start, [note], 'r', true);
  }
  if (e.shiftKey) { pr.sel.has(hit.note) ? pr.sel.delete(hit.note) : pr.sel.add(hit.note); draw(); return; }
  if (!pr.sel.has(hit.note)) pr.sel = new Set([hit.note]);
  engine.audition(track.id, hit.note.p, hit.note.v);
  store.checkpoint();
  // Alt 拖曳：複製
  let notes = [...pr.sel];
  if (e.altKey) {
    notes = notes.map(n => ({ ...n }));
    clip.notes.push(...notes);
    pr.sel = new Set(notes);
  }
  dragNotes(e, start, notes, hit.edge, false, hit.note);
}

function dragNotes(e, start, notes, mode, isNew, anchor = notes[0]) {
  const f = cur(); const { clip, track } = f;
  const orig = notes.map(n => ({ n, t: n.t, p: n.p, d: n.d }));
  const a0 = orig.find(o => o.n === anchor) || orig[0];
  let lastP = anchor.p;
  const move = ev => {
    const { x, y } = local(ev);
    const db = bOf(x - start.x);
    if (mode === 'r') {
      for (const o of orig) o.n.d = Math.max(pr.grid / 2, snapB(o.d + db, !ev.altKey) || pr.grid);
      pr.lastLen = anchor.d;
    } else {
      // 以「被抓住的那顆音符」對齊格線
      const nt = snapB(a0.t + db, !ev.altKey);
      const dt = Math.max(-Math.min(...orig.map(o => o.t)), nt - a0.t);
      const dp = pOf(y) - pOf(start.y);
      const lo = Math.min(...orig.map(o => o.p)), hi = Math.max(...orig.map(o => o.p));
      const dpc = Math.max(LOW - lo, Math.min(HIGH - hi, dp));
      for (const o of orig) { o.n.t = o.t + dt; o.n.p = o.p + dpc; }
      if (anchor.p !== lastP) { lastP = anchor.p; engine.audition(track.id, anchor.p, anchor.v, 0.2); }
    }
    draw();
  };
  const up = () => {
    wrap.removeEventListener('pointermove', move);
    wrap.removeEventListener('pointerup', up);
    const maxEnd = Math.max(...clip.notes.map(n => n.t + n.d), 0);
    if (maxEnd > clip.lengthBeats) clip.lengthBeats = Math.ceil(maxEnd / store.project.sigNum) * store.project.sigNum;
    if (mode === 'm' && !isNew) pr.lastLen = anchor.d;
    store.changed('structure');
  };
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

function startMarquee(e, start) {
  const f = cur();
  const base = e.shiftKey ? new Set(pr.sel) : new Set();
  const move = ev => {
    const { x, y } = local(ev);
    marquee = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
    const b0 = bOf(marquee.x), b1 = bOf(marquee.x + marquee.w);
    const pHi = pOf(marquee.y), pLo = pOf(marquee.y + marquee.h);
    pr.sel = new Set(base);
    for (const n of f.clip.notes) if (n.p >= pLo && n.p <= pHi && n.t < b1 && n.t + n.d > b0) pr.sel.add(n);
    draw();
  };
  const up = () => { marquee = null; wrap.removeEventListener('pointermove', move); wrap.removeEventListener('pointerup', up); draw(); };
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

function onKeysDown(e) {
  const f = cur(); if (!f) return;
  const r = keysCv.getBoundingClientRect();
  const p = pOf(e.clientY - r.top + wrap.scrollTop);
  engine.noteOn(f.track.id, p, 100);
  const up = () => { engine.noteOff(f.track.id, p); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointerup', up);
  // 點琴鍵同時選取該音高的所有音符（方便整排調力度/刪除）
  if (e.shiftKey) { pr.sel = new Set(f.clip.notes.filter(n => n.p === p)); draw(); }
}

function onVelDown(e) {
  const f = cur(); if (!f) return;
  velCv.setPointerCapture(e.pointerId);
  store.checkpoint();
  const r = velCv.getBoundingClientRect();
  const apply = ev => {
    const x = ev.clientX - r.left + wrap.scrollLeft;
    const vel = Math.max(1, Math.min(127, Math.round((1 - (ev.clientY - r.top) / VEL_H) * 127 * 1.05)));
    // 有選取：調整選取的全部（維持相對差異的話太複雜，這裡直接設定成同一值）；
    // 沒選取：調整游標附近的音符
    const near = f.clip.notes.filter(n => Math.abs(xOf(n.t) - x) < 6);
    const targets = pr.sel.size && near.some(n => pr.sel.has(n)) ? [...pr.sel] : near;
    for (const n of targets) n.v = vel;
    $('prVel').value = vel;
    draw();
  };
  apply(e);
  const up = () => { velCv.removeEventListener('pointermove', apply); velCv.removeEventListener('pointerup', up); store.changed('structure'); };
  velCv.addEventListener('pointermove', apply);
  velCv.addEventListener('pointerup', up);
}

// ---------------- 踏板列編輯 ----------------
// 內部用「區段」編輯，存回去時轉成 on/off 事件
function setSpans(clip, spans) {
  spans = spans.filter(([a, z]) => z - a > 1e-3).sort((x, y) => x[0] - y[0]);
  // 合併重疊
  const m = [];
  for (const sp of spans) { const last = m[m.length - 1]; if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]); else m.push([...sp]); }
  clip.pedal = m.flatMap(([a, z]) => [{ t: Math.max(0, a), on: true }, { t: z, on: false }]);
  if (!clip.pedal.length) delete clip.pedal;
}
function pedHit(e) {
  const f = cur(); if (!f) return null;
  const r = pedCv.getBoundingClientRect();
  const x = e.clientX - r.left + wrap.scrollLeft;
  const spans = pedalSpans(f.clip);
  for (let i = 0; i < spans.length; i++) {
    const [a, z] = spans[i], xa = xOf(a), xz = xOf(z);
    if (Math.abs(x - xa) < 6) return { i, edge: 'a', spans };
    if (Math.abs(x - xz) < 6) return { i, edge: 'z', spans };
    if (x > xa && x < xz) return { i, edge: null, spans };
  }
  return null;
}
function onPedDown(e) {
  if (e.button !== 0) return;
  const f = cur(); if (!f) return;
  pedCv.setPointerCapture(e.pointerId);
  const r = pedCv.getBoundingClientRect();
  const toB = cx => Math.max(0, Math.min(f.clip.lengthBeats, snapB(bOf(cx - r.left + wrap.scrollLeft), !e.altKey)));
  store.checkpoint();
  let h = pedHit(e);
  let spans = h ? h.spans : pedalSpans(f.clip);
  if (!h) {
    // 點空白：從這裡新增一小節長的踏板
    const a = floorB(bOf(e.clientX - r.left + wrap.scrollLeft));
    spans.push([a, Math.min(f.clip.lengthBeats, a + store.project.sigNum)]);
    spans.sort((x, y) => x[0] - y[0]);
    h = { i: spans.findIndex(sp => sp[0] === a), edge: 'z', spans };
  }
  const orig = spans.map(s2 => [...s2]);
  const b0 = toB(e.clientX);
  const move = ev => {
    const b = toB(ev.clientX);
    const s2 = orig.map(x => [...x]);
    const sp = s2[h.i];
    if (h.edge === 'a') sp[0] = Math.min(b, sp[1] - pr.grid);
    else if (h.edge === 'z') sp[1] = Math.max(b, sp[0] + pr.grid);
    else { const d = b - b0; const len = sp[1] - sp[0]; sp[0] = Math.max(0, Math.min(f.clip.lengthBeats - len, orig[h.i][0] + d)); sp[1] = sp[0] + len; }
    setSpans(f.clip, s2);
    draw();
  };
  const up = () => { pedCv.removeEventListener('pointermove', move); pedCv.removeEventListener('pointerup', up); store.changed('structure'); };
  pedCv.addEventListener('pointermove', move); pedCv.addEventListener('pointerup', up);
  setSpans(f.clip, spans); draw();
}
function onPedContext(e) {
  e.preventDefault();
  const f = cur(); const h = pedHit(e);
  if (!f || !h) return;
  store.checkpoint();
  h.spans.splice(h.i, 1);
  setSpans(f.clip, h.spans);
  store.changed('structure');
}

// ---------------- 編輯指令 ----------------
function targets() {
  const f = cur(); if (!f) return [];
  return pr.sel.size ? [...pr.sel] : f.clip.notes;
}

export function quantize() {
  const f = cur(); if (!f) return;
  const ns = targets();
  if (!ns.length) return;
  store.checkpoint();
  for (const n of ns) {
    const t = Math.round(n.t / pr.grid) * pr.grid;
    const e = Math.max(t + pr.grid / 2, Math.round((n.t + n.d) / pr.grid) * pr.grid);
    n.t = Math.max(0, t); n.d = Math.max(pr.grid, e - t);
  }
  store.changed('structure');
  toast(`已量化 ${ns.length} 個音符`);
}

export function transpose(semi) {
  const ns = targets();
  if (!ns.length) return;
  store.checkpoint();
  for (const n of ns) n.p = Math.max(LOW, Math.min(HIGH, n.p + semi));
  store.changed('structure');
}

function setVelocity(v) {
  const ns = [...pr.sel];
  if (!ns.length) return;
  store.checkpoint();
  for (const n of ns) n.v = Math.max(1, Math.min(127, v));
  store.changed('structure');
}

export function deleteNotes(list = [...pr.sel]) {
  const f = cur(); if (!f || !list.length) return false;
  store.checkpoint();
  const kill = new Set(list);
  f.clip.notes = f.clip.notes.filter(n => !kill.has(n));
  pr.sel = new Set();
  store.changed('structure');
  return true;
}

export function selectAllNotes() {
  const f = cur(); if (!f) return;
  pr.sel = new Set(f.clip.notes);
  draw();
}

// 快捷鍵：鋼琴捲簾打開而且滑鼠在它上面時才攔截
export function handleKey(e) {
  if (!isOpen() || !root.matches(':hover')) return false;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === 'delete' || k === 'backspace') { deleteNotes(); return true; }
  if (mod && k === 'a') { selectAllNotes(); return true; }
  if (!mod && k === 'q') { quantize(); return true; }
  if (k === 'arrowup') { transpose(e.shiftKey ? 12 : 1); return true; }
  if (k === 'arrowdown') { transpose(e.shiftKey ? -12 : -1); return true; }
  if (k === 'arrowleft' || k === 'arrowright') {
    const ns = [...pr.sel]; if (!ns.length) return true;
    store.checkpoint();
    const d = (k === 'arrowleft' ? -1 : 1) * pr.grid;
    for (const n of ns) n.t = Math.max(0, n.t + d);
    store.changed('structure');
    return true;
  }
  if (k === 'escape') { if (pr.sel.size) { pr.sel = new Set(); draw(); } else close(); return true; }
  return false;
}

// 給每幀更新播放頭用
export function tick() { if (isOpen() && engine.playing) draw(); }

// 錄 MIDI 時讓捲簾跟著看到新音符
export function currentClipId() { return pr.clipId; }
export const clipStartSec = () => { const f = cur(); return f ? clipStart(f.clip) : 0; };
