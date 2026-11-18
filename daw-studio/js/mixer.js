// 混音台：每軌一條 channel strip（Pan 旋鈕、推桿、立體聲電平表、峰值、M/S/R）＋ Master
// 也提供 stripFor() 給檢閱器重複使用。
import { store } from './state.js';
import { engine } from './engine.js';
import { fmtDb, clamp } from './util.js';
import { toggleTrackFlag, selectTrack } from './arrange.js';
import { insertSlots } from './fx-ui.js';

const FADER_MAX = 6, FADER_MIN = -60;
// 推桿位置 0..1 ↔ dB：分段線性查表，0 dB 附近刻度較細，接近實體混音台
const TABLE = [[0, FADER_MIN], [0.1, -40], [0.25, -24], [0.45, -12], [0.62, -6], [0.8, 0], [1, FADER_MAX]];
function lerpTable(x, from, to) {
  for (let i = 1; i < TABLE.length; i++) {
    const a = TABLE[i - 1], b = TABLE[i];
    if (x <= b[from]) return a[to] + (x - a[from]) / (b[from] - a[from]) * (b[to] - a[to]);
  }
  return TABLE[TABLE.length - 1][to];
}
const posToDb = p => (p <= 0 ? -Infinity : lerpTable(Math.min(1, p), 0, 1));
const dbToPos = db => (!isFinite(db) || db <= FADER_MIN ? 0 : lerpTable(Math.min(FADER_MAX, db), 1, 0));
const meterPos = lin => {
  const db = 20 * Math.log10(Math.max(lin, 1e-6));
  return clamp((db + 60) / 66, 0, 1);    // -60..+6 dB
};

let root;
const meters = [];   // { id, els:[iL,iR], peakEl, kind:'track'|'master' }

export function initMixer() {
  root = document.getElementById('mixer');
  store.on('change', ({ kind }) => { if (kind === 'structure' || kind === 'mix' || kind === 'fx') render(); });
  // 軌道標頭的音量滑桿在動：重建混音台（混音台本身沒有在拖曳時才做）
  store.on('mixlive', ({ from }) => { if (from !== 'mixer' && !dragging) render(); });
  store.on('select', () => root.querySelectorAll('.strip[data-id]').forEach(s => s.classList.toggle('sel', s.dataset.id === store.selection.trackId)));
  render();
}

function knob(value, min, max, onChange, onReset, fmt) {
  const k = document.createElement('div');
  k.className = 'knob';
  const set = v => { k.style.setProperty('--rot', ((v - min) / (max - min) * 270 - 135) + 'deg'); k.title = fmt(v); };
  set(value);
  k.addEventListener('pointerdown', e => {
    e.preventDefault();
    store.checkpoint();
    const y0 = e.clientY, v0 = value;
    k.setPointerCapture(e.pointerId);
    const mv = ev => { value = clamp(v0 + (y0 - ev.clientY) / (ev.shiftKey ? 600 : 150) * (max - min), min, max); set(value); onChange(value); };
    const up = () => { k.removeEventListener('pointermove', mv); k.removeEventListener('pointerup', up); };
    k.addEventListener('pointermove', mv); k.addEventListener('pointerup', up);
  });
  k.addEventListener('dblclick', () => { store.checkpoint(); value = onReset(); set(value); });
  return k;
}

function fader(db, onChange) {
  const f = document.createElement('div');
  f.className = 'fader';
  f.innerHTML = '<div class="track"></div><div class="unity"></div><div class="cap"></div>';
  const cap = f.querySelector('.cap'), unity = f.querySelector('.unity');
  let H = 0;
  const place = () => {
    H = f.clientHeight - 12;
    if (H <= 0) return;
    cap.style.top = (6 + (1 - dbToPos(db)) * H) + 'px';
    unity.style.top = (6 + (1 - dbToPos(0)) * H) + 'px';
  };
  requestAnimationFrame(place);
  f.addEventListener('pointerdown', e => {
    e.preventDefault();
    store.checkpoint();
    f.setPointerCapture(e.pointerId);
    const r = f.getBoundingClientRect();
    const onCap = e.target === cap;
    const y0 = e.clientY, p0 = dbToPos(db);
    const apply = ev => {
      let p = onCap ? p0 + (y0 - ev.clientY) / (H * (ev.shiftKey ? 4 : 1)) : 1 - (ev.clientY - r.top - 6) / H;
      p = clamp(p, 0, 1);
      db = posToDb(p);
      if (!isFinite(db)) db = FADER_MIN - 1;
      db = Math.round(db * 10) / 10;
      place(); onChange(db);
    };
    if (!onCap) apply(e);
    const up = () => { f.removeEventListener('pointermove', apply); f.removeEventListener('pointerup', up); };
    f.addEventListener('pointermove', apply); f.addEventListener('pointerup', up);
  });
  f.addEventListener('dblclick', () => { store.checkpoint(); db = 0; place(); onChange(0); });
  f._place = place;
  return f;
}

function vmeter() {
  const m = document.createElement('div');
  m.className = 'vmeter';
  m.innerHTML = '<span><i></i></span><span><i></i></span>';
  return m;
}

// 單條 strip；track = null 代表 Master
// busIndex：混音台裡的 Bus 推桿
export function busStrip(i) {
  const bd = store.project.buses[i];
  const s = document.createElement('div');
  s.className = 'strip bus';
  s.appendChild(insertSlots('bus' + i, true));
  const sp = document.createElement('div'); sp.className = 'val'; sp.textContent = 'AUX'; s.appendChild(sp);
  const val = document.createElement('div'); val.className = 'val'; val.textContent = fmtDb(bd.volumeDb);
  const box = document.createElement('div'); box.className = 'faderbox';
  const fd = fader(bd.volumeDb, db => { bd.volumeDb = db; val.textContent = fmtDb(db); store.dirty = true; store.emit('fx-live', {}); });
  const vm = vmeter();
  box.appendChild(fd); box.appendChild(vm);
  s.appendChild(val); s.appendChild(box);
  const peak = document.createElement('div'); peak.className = 'peak'; peak.textContent = '';
  s.appendChild(peak);
  const btns = document.createElement('div'); btns.className = 'btns';
  const m = document.createElement('button'); m.className = 'mini m' + (bd.mute ? ' on' : ''); m.textContent = 'M';
  m.onclick = () => { store.checkpoint(); bd.mute = !bd.mute; store.changed('fx'); };
  btns.appendChild(m); s.appendChild(btns);
  const nm = document.createElement('div'); nm.className = 'sname'; nm.textContent = bd.name; nm.style.background = '#7c8aa5';
  s.appendChild(nm);
  const [iL, iR] = vm.querySelectorAll('i');
  meters.push({ id: 'bus' + i, els: [iL, iR], peakEl: peak, node: s });
  return s;
}

export function stripFor(track) {
  const p = store.project;
  const s = document.createElement('div');
  const isMaster = !track;
  s.className = 'strip' + (isMaster ? ' master' : '') + (!isMaster && track.id === store.selection.trackId ? ' sel' : '');
  if (!isMaster) s.dataset.id = track.id;

  // 插入效果器槽
  s.appendChild(insertSlots(isMaster ? 'master' : track.id, true));
  // Send 小旋鈕
  if (!isMaster) {
    const sends = document.createElement('div');
    sends.className = 'sends';
    (p.buses || []).forEach((b, i) => {
      const fmt = v => `${b.name.replace(/^Bus /, '')}：${v <= -60 ? '關' : fmtDb(v) + ' dB'}`;
      const k = knob(track.sends[i], -60, 6, v => { track.sends[i] = Math.round(v * 2) / 2; k.classList.toggle('active', track.sends[i] > -60); store.dirty = true; engine.applyMix(); },
        () => { track.sends[i] = track.sends[i] > -60 ? -60 : -12; engine.applyMix(); return track.sends[i]; }, fmt);
      k.classList.add('mini-knob');
      k.classList.toggle('active', track.sends[i] > -60);
      const lab = document.createElement('span'); lab.textContent = 'AB'[i];
      const w = document.createElement('div'); w.className = 'send'; w.appendChild(k); w.appendChild(lab);
      sends.appendChild(w);
    });
    s.appendChild(sends);
  }

  const val = document.createElement('div'); val.className = 'val';
  if (!isMaster) {
    const panFmt = v => (Math.abs(v) < 0.01 ? '置中' : v < 0 ? `左 ${Math.round(-v * 64)}` : `右 ${Math.round(v * 64)}`);
    const pv = document.createElement('div'); pv.className = 'val'; pv.textContent = panFmt(track.pan);
    s.appendChild(knob(track.pan, -1, 1,
      v => { track.pan = Math.round(v * 64) / 64; pv.textContent = panFmt(track.pan); store.dirty = true; engine.applyMix(); },
      () => { track.pan = 0; pv.textContent = panFmt(0); engine.applyMix(); return 0; }, panFmt));
    s.appendChild(pv);
  } else {
    const sp = document.createElement('div'); sp.style.height = '34px'; s.appendChild(sp);
    const sp2 = document.createElement('div'); sp2.className = 'val'; sp2.textContent = 'MASTER'; s.appendChild(sp2);
  }

  const db0 = isMaster ? p.masterDb : track.volumeDb;
  val.textContent = fmtDb(db0);
  const box = document.createElement('div'); box.className = 'faderbox';
  const fd = fader(db0, db => {
    if (isMaster) p.masterDb = db; else track.volumeDb = db;
    val.textContent = fmtDb(db);
    store.dirty = true;
    engine.applyMix();
    store.emit('mixlive', { from: 'mixer' });
  });
  const vm = vmeter();
  box.appendChild(fd); box.appendChild(vm);
  s.appendChild(val);
  s.appendChild(box);

  const peak = document.createElement('div');
  peak.className = 'peak'; peak.textContent = '-∞'; peak.title = '峰值（點一下重設）';
  peak.addEventListener('click', () => engine.resetPeaks());
  s.appendChild(peak);

  if (!isMaster) {
    const btns = document.createElement('div'); btns.className = 'btns';
    for (const [act, label, cls] of [['mute', 'M', 'm'], ['solo', 'S', 's'], ['arm', 'R', 'r']]) {
      const b = document.createElement('button');
      b.className = `mini ${cls}` + (track[act] ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', e => toggleTrackFlag(track, act, e.altKey));
      btns.appendChild(b);
    }
    s.appendChild(btns);
  }
  const nm = document.createElement('div');
  nm.className = 'sname';
  nm.textContent = isMaster ? '立體聲輸出' : track.name;
  nm.style.background = isMaster ? '#9aa0ab' : track.color;
  s.appendChild(nm);
  if (!isMaster) s.addEventListener('pointerdown', () => selectTrack(track.id));

  const [iL, iR] = vm.querySelectorAll('i');
  meters.push({ id: isMaster ? null : track.id, els: [iL, iR], peakEl: peak, node: s });
  s._fader = fd;
  return s;
}

function render() {
  if (!root || root.classList.contains('hidden')) { pruneMeters(); return; }
  // 拖曳推桿時不要整個重建（會中斷拖曳）
  if (root.contains(document.activeElement) && dragging) return;
  const keep = root.scrollLeft;
  root.innerHTML = '';
  pruneMeters();
  for (const t of store.project.tracks) root.appendChild(stripFor(t));
  const gap = document.createElement('div'); gap.style.flex = '1 0 8px'; root.appendChild(gap);
  (store.project.buses || []).forEach((_, i) => root.appendChild(busStrip(i)));
  root.appendChild(stripFor(null));
  root.scrollLeft = keep;
}
let dragging = false;
window.addEventListener('pointerdown', e => { if (e.target.closest?.('.fader,.knob')) dragging = true; }, true);
window.addEventListener('pointerup', () => { dragging = false; }, true);

function pruneMeters() {
  for (let i = meters.length - 1; i >= 0; i--) if (!meters[i].node.isConnected) meters.splice(i, 1);
}

export function showMixer(on) {
  root.classList.toggle('hidden', !on);
  if (on) render();
}

export function relayoutFaders() {
  document.querySelectorAll('.fader').forEach(f => f._place && f._place());
}

// 每一幀由 main.js 呼叫
export function tickMeters() {
  if (!engine.ctx) return;
  const seen = new Map();
  for (const m of meters) {
    if (!m.node.isConnected) continue;
    let lv = seen.get(m.id);
    if (!lv) {
      lv = !m.id ? engine.masterLevels() : String(m.id).startsWith('bus') ? engine.busMeter(Number(m.id.slice(3))) : engine.trackMeter(m.id);
      seen.set(m.id, lv);
    }
    m.els[0].style.clipPath = `inset(${(1 - meterPos(lv[0])) * 100}% 0 0 0)`;
    m.els[1].style.clipPath = `inset(${(1 - meterPos(lv[1])) * 100}% 0 0 0)`;
    const strip = !m.id ? engine.masterMeter : String(m.id).startsWith('bus') ? engine.buses?.[Number(m.id.slice(3))]?.meter : engine.strips.get(m.id)?.meter;
    const pk = strip ? strip.peakDb : -Infinity;
    m.peakEl.textContent = fmtDb(pk);
    m.peakEl.classList.toggle('clip-red', pk > 0);
  }
  return seen;
}
