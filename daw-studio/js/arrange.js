// 編排視窗：尺規、格線、軌道標頭、片段（移動／修剪／淡入淡出／框選）、拖放匯入
import { store, isMidiClip, clipStart, clipDur, setClipStart, newMidiClip, spb } from './state.js';
import { PRESETS } from './synth.js';
import { sfLabel } from './soundbank.js';
import { separateClip } from './separate.js';
import { openAiSeparate } from './demucs-ui.js';
import { engine } from './engine.js';
import { recorder } from './recorder.js';
import { importAudioFiles } from './project-io.js';
import { view, secToPx, pxToSec, snap, gridStep, beatSec, setZoom } from './view.js';
import { uid, toast, TRACK_COLORS } from './util.js';
import { chordLaneHeight, drawChordLane, openChordMenu } from './chord-ui.js';
import { sectionLaneHeight, drawSectionLane, openSectionMenu } from './section-ui.js';
import { showMenu } from './menu.js';
import { cssVar } from './theme.js';
import { isVideoClip, isTextClip, ensureMedia, mediaDuration, firstFrameCanvas, addTextClip, editTextClip, toggleVideoPreview, TRANSITIONS } from './video.js';

const $ = id => document.getElementById(id);
let lanes, lanesInner, headersInner, ruler, rulerWrap, grid, loopbar, playhead, phCap;
let vw = 0, vh = 0;

export function initArrange() {
  lanes = $('lanes'); lanesInner = $('lanesInner'); headersInner = $('headersInner');
  ruler = $('ruler'); rulerWrap = $('rulerWrap'); loopbar = $('loopbar');
  playhead = $('playhead'); phCap = $('phCap');

  // 格線 canvas 放在捲動容器後面，不隨內容捲動
  const wrap = document.createElement('div');
  wrap.className = 'lanes-wrap';
  wrap.style.cssText = 'position:relative;min-height:0;min-width:0;overflow:hidden';
  lanes.parentNode.insertBefore(wrap, lanes);
  grid = document.createElement('canvas');
  grid.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  wrap.appendChild(grid);
  wrap.appendChild(lanes);
  lanes.style.cssText = 'position:absolute;inset:0;overflow:auto';

  new ResizeObserver(() => { measure(); drawAll(); }).observe(wrap);
  lanes.addEventListener('scroll', () => {
    headersInner.style.transform = `translateY(${-lanes.scrollTop}px)`;
    scheduleDraw();
  });
  // 標頭區的滾輪轉給 lanes
  $('headers').addEventListener('wheel', e => { lanes.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
  lanes.addEventListener('wheel', onWheel, { passive: false });
  rulerWrap.addEventListener('wheel', onWheel, { passive: false });

  rulerWrap.addEventListener('pointerdown', onRulerDown);
  loopbar.addEventListener('pointerdown', onLoopbarDown);
  lanesInner.addEventListener('pointerdown', onLanesDown);
  lanesInner.addEventListener('contextmenu', onLanesContext);
  lanesInner.addEventListener('dblclick', onLanesDbl);
  headersInner.addEventListener('contextmenu', onHeaderContext);
  setupDrop();

  store.on('change', ({ kind }) => { if (kind === 'structure') render(); else renderHeaders(); });
  // 錄 MIDI 中：只重畫正在錄的那個片段（寬度與音符預覽），不重建整個編排視窗
  store.on('midi-rec', ({ clipId }) => {
    const f = clipId && store.findClip(clipId);
    const old = f && lanesInner.querySelector(`.clip[data-id="${clipId}"]`);
    if (!old) return;
    old.replaceWith(clipEl(f.track, f.clip));
    drawWaveforms();
  });
  store.on('zoom', () => render());
  // 混音台推桿在動：只同步標頭滑桿的數值
  store.on('mixlive', ({ from }) => {
    if (from === 'header') return;
    headersInner.querySelectorAll('.thead').forEach(el => {
      const t = store.track(el.dataset.id);
      if (t) el.querySelector('.vol').value = t.volumeDb;
    });
  });
  store.on('select', () => { renderSelection(); });
  render();
}

function measure() {
  vw = lanes.clientWidth; vh = lanes.clientHeight;
}

// ---------------- 整體繪製 ----------------
function contentWidth() {
  const end = Math.max(store.projectEnd(), engine.currentTime()) + beatSec() * store.project.sigNum * 16;
  return Math.max(vw + 200, secToPx(end));
}

const trackH = t => Math.max(32, Math.round(t && t.h ? t.h : view.trackH));
const topOf = i => store.project.tracks.slice(0, i).reduce((a, t) => a + trackH(t), 0);
const totalH = () => store.project.tracks.reduce((a, t) => a + trackH(t), 0);
const indexAtY = y => {
  let acc = 0;
  const ts = store.project.tracks;
  for (let i = 0; i < ts.length; i++) { const h = trackH(ts[i]); if (y < acc + h) return i; acc += h; }
  return Math.max(0, ts.length - 1);
};
// 拖曳片段時看游標落在哪一軌，換算成「移動了幾軌」（每軌高度不一定相同，不能拿固定高度除）
function trackDelta(items, clientY, lanesTop) {
  const n = store.project.tracks.length;
  const minTi = Math.min(...items.map(i => i.ti)), maxTi = Math.max(...items.map(i => i.ti));
  const to = indexAtY(clientY - lanesTop);
  return Math.max(-minTi, Math.min(n - 1 - maxTi, to - items[0].ti));
}

export function render() {
  measure();
  const ar = document.getElementById('arrange');
  // 尺規 = 34px 的小節尺 + 段落軌 + 和弦軌
  if (ar) ar.style.setProperty('--ruler-h', (34 + sectionLaneHeight() + chordLaneHeight()) + 'px');
  const p = store.project;
  const h = totalH();
  lanesInner.style.width = contentWidth() + 'px';
  lanesInner.style.height = Math.max(h, vh) + 'px';
  renderHeaders();
  renderLanes();
  $('emptyHint').style.display = p.tracks.some(t => t.clips.length) ? 'none' : '';
  drawAll();
}

let drawPending = false;
function scheduleDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => { drawPending = false; drawAll(); });
}

function drawAll() {
  drawRuler(); drawGrid(); drawWaveforms(); placeLoopbar(); updatePlayhead(engine.currentTime());
}

function setupCanvas(c, w, h) {
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

function drawRuler() {
  const w = rulerWrap.clientWidth, h = rulerWrap.clientHeight;
  const g = setupCanvas(ruler, w, h);
  const p = store.project, sx = lanes.scrollLeft;
  const beat = beatSec(), bar = beat * p.sigNum;
  const barPx = secToPx(bar);
  // 小節數字每隔幾小節標一次，避免擠在一起
  let every = 1;
  while (barPx * every < 44) every *= 2;
  const first = Math.floor(pxToSec(sx) / bar);
  const last = Math.ceil(pxToSec(sx + w) / bar);
  const secH = sectionLaneHeight();
  const chordH = chordLaneHeight();
  const rulerH = h - secH - chordH;
  g.font = '11px ui-monospace, Consolas, monospace';
  g.textBaseline = 'middle';
  for (let b = first; b <= last; b++) {
    const x = Math.round(secToPx(b * bar) - sx) + 0.5;
    const major = b % every === 0;
    g.strokeStyle = major ? cssVar('--cv-ruler-major') : cssVar('--cv-ruler-minor');
    g.beginPath(); g.moveTo(x, major ? 14 : 24); g.lineTo(x, rulerH); g.stroke();
    if (major) { g.fillStyle = cssVar('--cv-ruler-tx'); g.fillText(String(b + 1), x + 4, 23); }
    if (barPx / p.sigNum >= 12) {
      g.strokeStyle = cssVar('--cv-ruler-beat');
      for (let k = 1; k < p.sigNum; k++) {
        const bx = Math.round(x + secToPx(k * beat)) + 0.5;
        g.beginPath(); g.moveTo(bx, 28); g.lineTo(bx, rulerH); g.stroke();
      }
    }
  }
  // 段落軌、和弦軌（尺規下半部；段落在上、和弦在下）
  if (secH) drawSectionLane(g, w, rulerH, secH, sx, view.pxPerBeat);
  if (chordH) drawChordLane(g, w, rulerH + secH, chordH, sx, view.pxPerBeat);
}

// '#rrggbb' → 'r,g,b'（給 canvas 的 rgba 字串用）
const hexRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

function drawGrid() {
  const w = lanes.clientWidth, h = lanes.clientHeight;
  const g = setupCanvas(grid, w, h);
  const p = store.project, sx = lanes.scrollLeft, sy = lanes.scrollTop;
  // 選取軌底色
  p.tracks.forEach((t, i) => {
    const th = trackH(t);
    const y = topOf(i) - sy;
    if (y > h || y + th < 0) return;
    const sel = t.id === store.selection.trackId;
    g.fillStyle = sel ? cssVar('--cv-trk-sel') : (i % 2 ? cssVar('--cv-trk-a') : cssVar('--cv-trk-b'));
    g.fillRect(0, y, w, th);
    // 再用這一軌的顏色薄薄染一層，整排看起來不會一片灰
    const rgb = hexRgb(t.color);
    if (rgb) {
      g.fillStyle = `rgba(${rgb},${sel ? 0.13 : 0.055})`;
      g.fillRect(0, y, w, th);
    }
  });
  const step = gridStep(), bar = beatSec() * p.sigNum;
  const first = Math.floor(pxToSec(sx) / step), last = Math.ceil(pxToSec(sx + w) / step);
  for (let k = first; k <= last; k++) {
    const t = k * step;
    const x = Math.round(secToPx(t) - sx) + 0.5;
    const isBar = Math.abs(t / bar - Math.round(t / bar)) < 1e-6;
    g.strokeStyle = isBar ? cssVar('--cv-grid-bar') : cssVar('--cv-grid-sub');
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }
  // 循環區間
  if (p.loop.on) {
    g.fillStyle = 'rgba(245,184,61,.05)';
    const a = secToPx(p.loop.start) - sx, b = secToPx(p.loop.end) - sx;
    g.fillRect(a, 0, b - a, h);
  }
}

function placeLoopbar() {
  const L = store.project.loop, sx = lanes.scrollLeft;
  loopbar.style.left = (secToPx(L.start) - sx) + 'px';
  loopbar.style.width = Math.max(4, secToPx(L.end - L.start)) + 'px';
  loopbar.classList.toggle('off', !L.on);
}

export function updatePlayhead(pos) {
  if (!playhead) return;
  const x = secToPx(pos);
  playhead.style.left = x + 'px';
  phCap.style.left = (x - lanes.scrollLeft) + 'px';
}

// 播放時讓視窗跟著播放頭捲動
export function followPlayhead(pos) {
  const x = secToPx(pos);
  if (x > lanes.scrollLeft + vw - 40) lanes.scrollLeft = x - 60;
  else if (x < lanes.scrollLeft) lanes.scrollLeft = Math.max(0, x - 60);
  if (secToPx(pos) > lanesInner.offsetWidth - vw) lanesInner.style.width = contentWidth() + 'px';
}

// ---------------- 軌道標頭 ----------------
export function renderHeaders() {
  const p = store.project;
  headersInner.innerHTML = '';
  p.tracks.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'thead' + (t.id === store.selection.trackId ? ' sel' : '');
    el.style.height = trackH(t) + 'px';
    el.dataset.id = t.id;
    el.style.setProperty('--trk', t.color);        // 標頭與選取色都用這一軌的顏色
    const noAudio = t.kind === 'text' || t.kind === 'sub';      // 文字／字幕軌沒有聲音
    const isVideo = t.kind === 'video';
    const kindMark = t.kind === 'midi' ? '♪' : isVideo ? '▶' : t.kind === 'text' ? 'T' : t.kind === 'sub' ? '字' : '∿';
    el.innerHTML = `
      <div class="color" style="background:${t.color}"></div>
      <div class="num">${i + 1}<br><span class="kind ${t.kind}">${kindMark}</span></div>
      <div class="body">
        <div class="nrow"><input class="name" value="" maxlength="40" aria-label="軌道名稱">${t.kind === 'midi' ? instLabel(t) : ''}</div>
        <div class="ctrls">
          <button class="mini m ${t.mute ? 'on' : ''}" data-act="mute" title="${noAudio ? '隱藏這一軌' : '靜音'}">M</button>
          ${noAudio ? '' : `<button class="mini s ${t.solo ? 'on' : ''}" data-act="solo" title="獨奏">S</button>`}
          ${(t.kind === 'audio' || t.kind === 'midi') ? `<button class="mini r ${t.arm ? 'on' : ''}" data-act="arm" title="${t.kind === 'midi' ? '錄音待命（MIDI 鍵盤）' : '錄音待命'}">R</button>` : ''}
          ${t.kind === 'audio' ? `<button class="mini i ${t.monitor ? 'on' : ''}" data-act="monitor" title="輸入監聽（請戴耳機）">I</button>` : ''}
          ${isVideo ? `<button class="mini e ${t.hidden ? 'on' : ''}" data-act="hidden" title="隱藏畫面（聲音照樣播放）">眼</button>` : ''}
          ${noAudio ? '' : `<input class="vol" type="range" min="-60" max="6" step="0.1" value="${t.volumeDb}" title="音量 ${t.volumeDb.toFixed(1)} dB">`}
        </div>
      </div>
      <div class="tmeter"><i></i></div>`;
    const name = el.querySelector('.name');
    name.value = t.name;
    name.addEventListener('change', () => { store.checkpoint(); t.name = name.value.trim() || t.name; store.changed('mix'); });
    name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); });
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('input,button')) return;
      selectTrack(t.id);
      // 上下拖曳標頭＝調換軌道順序
      const startY = e.clientY, from = p.tracks.indexOf(t);
      let moved = false, to = from;
      const onMove = ev => {
        if (!moved && Math.abs(ev.clientY - startY) < 6) return;
        moved = true;
        el.classList.add('dragging');
        const box = headersInner.getBoundingClientRect();
        to = Math.max(0, Math.min(p.tracks.length - 1, indexAtY(ev.clientY - box.top)));
        el.style.transform = `translateY(${topOf(to) - topOf(from)}px)`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        el.classList.remove('dragging');
        el.style.transform = '';
        if (!moved || to === from) return;
        store.checkpoint();
        const [mv] = store.project.tracks.splice(from, 1);
        store.project.tracks.splice(to, 0, mv);
        store.changed('structure');
        toast(`第 ${from + 1} 軌移到第 ${to + 1}`);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      toggleTrackFlag(t, b.dataset.act, e.altKey);
    }));
    // 影片／文字／字幕軌沒有音量滑桿
    const vol = el.querySelector('.vol');
    if (vol) {
      vol.addEventListener('pointerdown', () => store.checkpoint());
      // 拖曳中不重建標頭，否則滑桿會被換掉、拖曳中斷
      vol.addEventListener('input', () => {
        t.volumeDb = Number(vol.value); vol.title = `音量 ${t.volumeDb.toFixed(1)} dB`;
        store.dirty = true; engine.applyMix(); store.emit('mixlive', { from: 'header' });
      });
      vol.addEventListener('dblclick', () => { store.checkpoint(); t.volumeDb = 0; store.changed('mix'); });
    }
    // 底部把手：上下拖曳調整這一軌的高度（雙擊還原）
    const grip = document.createElement('div');
    grip.className = 'hresize';
    grip.title = '拖曳調整軌道高度（雙擊還原）';
    grip.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const y0 = e.clientY, h0 = trackH(t);
      store.checkpoint();
      // 每個 pointermove 都重建整個排列區會卡，改成一個影格最多重排一次
      let raf = 0;
      const reflow = () => { raf = 0; store.changed('structure'); };
      const move = ev => {
        t.h = Math.max(32, Math.min(240, Math.round(h0 + ev.clientY - y0)));
        if (!raf) raf = requestAnimationFrame(reflow);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        store.changed('structure');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', e => { e.stopPropagation(); store.checkpoint(); delete t.h; store.changed('structure'); });
    el.appendChild(grip);
    headersInner.appendChild(el);
  });
}

function instLabel(t) {
  const sf = sfLabel(t.instrument);
  const esc = s => String(s).replace(/[<>&"]/g, '');
  if (sf) return `<span class="inst sf${sf.ready ? '' : ' missing'}" title="SoundFont：${esc(sf.bank)}${sf.ready ? '' : '（尚未載入，用內建音色代替）'}">${esc(sf.preset)}</span>`;
  return `<span class="inst" title="音色（在檢閱器更換）">${PRESETS[t.instrument]?.name || ''}</span>`;
}

export function toggleTrackFlag(t, flag, exclusive = false) {
  store.checkpoint();
  if (exclusive) {
    const v = !t[flag];
    store.project.tracks.forEach(x => { x[flag] = false; });
    t[flag] = v;
  } else t[flag] = !t[flag];
  // 麥克風只有音訊軌需要；MIDI 軌待命時改由鍵盤輸入
  if (flag === 'arm' || flag === 'monitor') {
    const needInput = store.project.tracks.some(x => x.kind === 'audio' && (x.arm || x.monitor));
    if (needInput) recorder.openInput().then(() => {
      recorder.setMonitor(store.project.tracks.some(x => x.monitor));
      store.emit('input-ready', {});
    }).catch(err => toast('無法使用麥克風：' + err.message, 'error'));
    else recorder.setMonitor(false);
  }
  store.changed('mix');
}

export function selectTrack(id) {
  if (store.selection.trackId === id) return;
  store.selection.trackId = id;
  store.emit('select', {});
}

function renderSelection() {
  headersInner.querySelectorAll('.thead').forEach(el => el.classList.toggle('sel', el.dataset.id === store.selection.trackId));
  lanesInner.querySelectorAll('.clip').forEach(el => el.classList.toggle('sel', store.selection.clipIds.has(el.dataset.id)));
  drawGrid();
}

function onHeaderContext(e) {
  const el = e.target.closest('.thead');
  if (!el) return;
  e.preventDefault();
  const t = store.track(el.dataset.id);
  selectTrack(t.id);
  showMenu(e.clientX, e.clientY, [
    { label: '新增音訊軌', action: () => store.addTrack('audio') || toast('最多 32 軌', 'warn') },
    { label: '新增 MIDI 軌', action: () => store.addTrack('midi') || toast('最多 32 軌', 'warn') },
    ...(t.kind === 'midi' ? [{ label: '在播放頭新增 4 小節 MIDI 片段', action: () => addMidiClipAt(t, engine.currentTime()) }] : []),
    { label: '換一個顏色', action: () => {
      store.checkpoint();
      const i = TRACK_COLORS.indexOf(t.color);
      t.color = TRACK_COLORS[(i + 1) % TRACK_COLORS.length];
      store.changed('structure');
    } },
    { label: '清空這一軌的片段', disabled: !t.clips.length, action: () => { store.checkpoint(); t.clips = []; store.changed('structure'); } },
    '-',
    { label: '刪除軌道', danger: true, disabled: store.project.tracks.length <= 1, action: () => store.removeTrack(t.id) },
  ]);
}

// ---------------- 片段 ----------------
function renderLanes() {
  lanesInner.querySelectorAll('.lane').forEach(n => n.remove());
  const frag = document.createDocumentFragment();
  store.project.tracks.forEach((t, i) => {
    const lane = document.createElement('div');
    lane.className = 'lane';
    lane.dataset.id = t.id;
    lane.style.cssText = `position:absolute;left:0;right:0;top:${topOf(i)}px;height:${trackH(t)}px`;
    for (const c of t.clips) lane.appendChild(clipEl(t, c));
    frag.appendChild(lane);
  });
  lanesInner.insertBefore(frag, playhead);
}

function clipEl(t, c) {
  const el = document.createElement('div');
  el.className = 'clip' + (store.selection.clipIds.has(c.id) ? ' sel' : '');
  el.dataset.id = c.id;
  const left = secToPx(clipStart(c)), w = Math.max(3, secToPx(clipDur(c)));
  el.style.left = left + 'px'; el.style.width = w + 'px';
  el.style.background = `linear-gradient(${t.color}, ${t.color}) top/100% 15px no-repeat, ${t.color}33`;
  el.style.borderColor = t.color;
  const name = document.createElement('div');
  name.className = 'cname';
  name.textContent = c.name + ((c.gainDb || 0) !== 0 ? `  ${c.gainDb > 0 ? '+' : ''}${c.gainDb.toFixed(1)} dB` : '');
  el.appendChild(name);
  const cv = document.createElement('canvas');
  el.appendChild(cv);
  if (isMidiClip(c)) {
    el.classList.add('midi');
    el.title = '雙擊打開鋼琴捲簾';
    el.insertAdjacentHTML('beforeend', `<div class="edge l" data-h="trimL"></div><div class="edge r" data-h="trimR"></div>`);
    return el;
  }
  // 影片片段：縮圖用影片本身畫（非同步），淡入淡出對畫面沒有意義所以不畫
  if (isVideoClip(c)) {
    el.classList.add('vclip');
    el.title = '影片片段：雙擊打開影像編輯，拖曳邊緣可以裁切';
    el.dataset.thumb = c.id;
    const hv = trackH(t) - 4;
    const fi = secToPx(c.fadeIn || 0), fo = secToPx(c.fadeOut || 0);
    if (fi > 1 || fo > 1) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'fades');
      svg.setAttribute('width', w); svg.setAttribute('height', hv);
      let d = '';
      if (fi > 1) d += `M0 ${hv} L${fi} 0 L0 0 Z `;
      if (fo > 1) d += `M${w} ${hv} L${w - fo} 0 L${w} 0 Z`;
      svg.innerHTML = `<path d="${d}" style="fill:var(--clip-fade-bg);stroke:var(--clip-fade)" stroke-width="1"/>`;
      el.appendChild(svg);
    }
    el.insertAdjacentHTML('beforeend',
      `<div class="edge l" data-h="trimL"></div><div class="edge r" data-h="trimR"></div>
       <div class="fade" data-h="fadeIn" style="left:${Math.max(5, fi)}px" title="畫面淡入"></div>
       <div class="fade" data-h="fadeOut" style="left:${Math.min(w - 5, w - fo)}px" title="畫面淡出"></div>`);
    if (c.trans?.type) {
      const nm = (TRANSITIONS.find(x => x.id === c.trans.type) || {}).name || '轉場';
      el.insertAdjacentHTML('beforeend', `<div class="trans-mark" title="轉場：${nm}">⇄</div>`);
    }
    queueVideoThumb(c, el);
    return el;
  }
  // 文字／字幕片段：直接顯示文字內容
  if (isTextClip(c)) {
    el.classList.add('tclip');
    cv.remove();
    name.textContent = (c.text || '（空白）').replace(/\n/g, ' ⏎ ');
    el.title = '雙擊編輯文字';
    el.insertAdjacentHTML('beforeend', `<div class="edge l" data-h="trimL"></div><div class="edge r" data-h="trimR"></div>`);
    return el;
  }
  // 淡入淡出曲線
  const h = trackH(t) - 4;
  const fi = secToPx(c.fadeIn || 0), fo = secToPx(c.fadeOut || 0);
  if (fi > 1 || fo > 1) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fades');
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    let d = '';
    if (fi > 1) d += `M0 ${h} L${fi} 0 L0 0 Z `;
    if (fo > 1) d += `M${w} ${h} L${w - fo} 0 L${w} 0 Z`;
    svg.innerHTML = `<path d="${d}" style="fill:var(--clip-fade-bg);stroke:var(--clip-fade)" stroke-width="1"/>`;
    el.appendChild(svg);
  }
  el.insertAdjacentHTML('beforeend',
    `<div class="edge l" data-h="trimL"></div><div class="edge r" data-h="trimR"></div>
     <div class="fade" data-h="fadeIn" style="left:${Math.max(5, fi)}px" title="淡入"></div>
     <div class="fade" data-h="fadeOut" style="left:${Math.min(w - 5, w - fo)}px" title="淡出"></div>`);
  return el;
}

// 只畫畫面內看得到的那段波形，放大時也不會超過 canvas 尺寸上限
function drawWaveforms() {
  const sx = lanes.scrollLeft, sy = lanes.scrollTop;
  const dpr = window.devicePixelRatio || 1;
  store.project.tracks.forEach((t, i) => {
    const h = trackH(t) - 4 - 15;
    const y = topOf(i);
    const offscreen = y > sy + vh || y + trackH(t) < sy;
    for (const c of t.clips) {
      const el = lanesInner.querySelector(`.clip[data-id="${c.id}"]`);
      if (!el) continue;
      const cv = el.querySelector('canvas');
      if (!cv) continue;                                // 文字片段的方塊沒有畫布
      if (isVideoClip(c)) continue;                     // 影片縮圖由 pumpThumbs 負責，這裡完全不要動它
      const left = secToPx(clipStart(c)), w = secToPx(clipDur(c));
      const a = Math.max(left, sx - 50), b = Math.min(left + w, sx + vw + 50);
      if (offscreen || b <= a) { cv.style.display = 'none'; continue; }
      cv.style.display = '';
      const cw = Math.ceil(b - a);
      cv.style.left = (a - left) + 'px';
      cv.width = cw * dpr; cv.height = h * dpr;
      cv.style.width = cw + 'px'; cv.style.height = h + 'px';
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (isMidiClip(c)) { drawMidiPreview(g, c, a - left, cw, h); continue; }
      if (isTextClip(c)) { cv.style.display = 'none'; continue; }
      const meta = store.bufferMeta.get(c.bufferId);
      const buf = store.buffers.get(c.bufferId);
      if (!meta || !buf) continue;
      const { min, max, block } = meta.peaks;
      const sr = buf.sampleRate;
      const gain = Math.pow(10, (c.gainDb || 0) / 20);
      g.fillStyle = cssVar('--cv-wave');
      const mid = h / 2;
      for (let x = 0; x < cw; x++) {
        const t0 = c.offset + pxToSec(a - left + x);
        const t1 = t0 + pxToSec(1);
        let i0 = Math.floor(t0 * sr / block), i1 = Math.max(i0 + 1, Math.ceil(t1 * sr / block));
        let lo = 0, hi = 0;
        for (let k = i0; k < i1 && k < min.length; k++) { if (min[k] < lo) lo = min[k]; if (max[k] > hi) hi = max[k]; }
        lo *= gain; hi *= gain;
        const y0 = mid - Math.min(1, hi) * mid, y1 = mid - Math.max(-1, lo) * mid;
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
      }
    }
  });
}

// 影片片段縮圖：每個素材只抓一格（快取起來），再沿著片段寬度重複貼
const thumbs = new Map();     // mediaId -> Promise<canvas|null>
function thumbFor(mediaId) {
  let p = thumbs.get(mediaId);
  if (p) return p;
  p = (async () => {
    const rec = await ensureMedia(mediaId);
    if (!rec.ready) return null;
    return firstFrameCanvas(rec);
  })();
  thumbs.set(mediaId, p);
  return p;
}

const thumbQueue = [];
let thumbBusy = false;
function queueVideoThumb(c, el) {
  thumbQueue.push({ c, el });
  pumpThumbs();
}
async function pumpThumbs() {
  if (thumbBusy) return;
  thumbBusy = true;
  while (thumbQueue.length) {
    const { c, el } = thumbQueue.shift();
    const cs = thumbFor(c.mediaId);
    cs.then(img => {
      if (!img || !el.isConnected) return;
      const cv = el.querySelector('canvas');
      if (!cv) return;
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight - 16);
      const dpr = window.devicePixelRatio || 1;
      cv.style.display = ''; cv.style.left = '0px';
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 0.9;
      const tw = Math.max(24, h * (img.width / img.height));
      for (let x = 0; x < w; x += tw) g.drawImage(img, x, 0, tw, h);
      g.globalAlpha = 1;
    });
  }
  thumbBusy = false;
}

// MIDI 片段裡的小型音符預覽：音高範圍自動縮放到片段高度
function drawMidiPreview(g, c, x0, cw, h) {
  const notes = c.notes.filter(n => n.t < c.lengthBeats);
  if (!notes.length) {
    g.fillStyle = cssVar('--cv-empty'); g.font = '10px sans-serif';
    if (x0 < 4) g.fillText('（空的，雙擊編輯）', 6 - x0, h / 2 + 3);
    return;
  }
  let lo = 127, hi = 0;
  for (const n of notes) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
  lo -= 2; hi += 2;
  const rows = Math.max(12, hi - lo + 1);
  const rh = Math.max(1.5, Math.min(5, (h - 4) / rows));
  const pxb = secToPx(spb());
  g.fillStyle = cssVar('--cv-midi');
  for (const n of notes) {
    const x = n.t * pxb - x0, w = Math.max(1.5, Math.min(n.d, c.lengthBeats - n.t) * pxb - 1);
    if (x + w < 0 || x > cw) continue;
    const y = 2 + (h - 4 - rh) * (1 - (n.p - lo) / (rows - 1 || 1));
    g.globalAlpha = 0.45 + 0.55 * (n.v / 127);
    g.fillRect(x, y, w, rh);
  }
  g.globalAlpha = 1;
}

// 踏板事件往前移 delta 拍：移到 0 以前的事件合併成「在 0 拍時的狀態」
function shiftPedal(pedal, delta) {
  const ev = pedal.slice().sort((a, z) => a.t - z.t);
  let state = false;
  const out = [];
  for (const e of ev) {
    const t = e.t - delta;
    if (t <= 0) { state = e.on; continue; }
    out.push({ t, on: e.on });
  }
  if (state) out.unshift({ t: 0, on: true });
  return out;
}

export function addMidiClipAt(track, sec) {
  if (track.kind !== 'midi') return null;
  const bar = store.project.sigNum;
  const startBeat = Math.floor(sec / spb() / bar + 1e-6) * bar;
  store.checkpoint();
  const c = newMidiClip(startBeat, bar * 4);
  track.clips.push(c);
  store.selection.trackId = track.id;
  store.selection.clipIds = new Set([c.id]);
  store.changed('structure');
  return c;
}

// ---------------- 互動 ----------------
function laneAt(clientY) {
  const r = lanesInner.getBoundingClientRect();
  const i = indexAtY(clientY - r.top);
  return store.project.tracks[Math.max(0, Math.min(store.project.tracks.length - 1, i))];
}
const xToSec = clientX => pxToSec(clientX - lanesInner.getBoundingClientRect().left);

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const anchorSec = xToSec(e.clientX);
    const before = e.clientX - lanes.getBoundingClientRect().left;
    setZoom(view.pxPerBeat * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    lanes.scrollLeft = secToPx(anchorSec) - before;
  } else if (e.currentTarget === rulerWrap || e.shiftKey) {
    e.preventDefault();
    lanes.scrollLeft += e.deltaY || e.deltaX;
  }
}

function drag(e, onMove, onUp) {
  const target = e.currentTarget;
  target.setPointerCapture?.(e.pointerId);
  const move = ev => onMove(ev);
  const up = ev => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onUp && onUp(ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onRulerDown(e) {
  if (e.button !== 0 || e.target === loopbar) return;
  const r = rulerWrap.getBoundingClientRect();
  const toSec = cx => Math.max(0, pxToSec(cx - r.left + lanes.scrollLeft));
  if (e.clientY - r.top < 13) {
    // 上緣：拉出新的循環區間
    const a = snap(toSec(e.clientX), true);
    const L = store.project.loop;
    store.checkpoint();
    drag(e, ev => {
      const b = snap(toSec(ev.clientX), true);
      L.start = Math.min(a, b); L.end = Math.max(a, b); L.on = L.end > L.start;
      placeLoopbar(); drawGrid();
    }, () => store.changed('transport'));
    return;
  }
  // 段落軌／和弦軌：點在格子上 → 編輯；點空白處 → 在那一點新增
  // （xLocal 是相對於尺規左邊的像素，尺規只畫可視範圍，要加上捲動量才對得上「拍」）
  const secH = sectionLaneHeight(), chordH = chordLaneHeight();
  const yIn = e.clientY - r.top, xLocal = e.clientX - r.left;
  if (secH && yIn > r.height - secH - chordH && yIn <= r.height - chordH) {
    openSectionMenu(e.clientX, e.clientY, xLocal, lanes.scrollLeft, view.pxPerBeat);
    return;
  }
  if (chordH && yIn > r.height - chordH) {
    openChordMenu(e.clientX, e.clientY, xLocal, lanes.scrollLeft, view.pxPerBeat);
    return;
  }
  const seekTo = cx => engine.seek(snap(toSec(cx)));
  seekTo(e.clientX);
  drag(e, ev => seekTo(ev.clientX));
}

function onLoopbarDown(e) {
  e.stopPropagation();
  const L = store.project.loop;
  const r = loopbar.getBoundingClientRect();
  const edge = e.clientX - r.left < 6 ? 'l' : r.right - e.clientX < 6 ? 'r' : 'm';
  const x0 = e.clientX, s0 = L.start, e0 = L.end;
  let moved = false;
  store.checkpoint();
  drag(e, ev => {
    moved = true;
    const d = pxToSec(ev.clientX - x0);
    if (edge === 'm') { const ns = Math.max(0, snap(s0 + d, true)); L.start = ns; L.end = ns + (e0 - s0); }
    else if (edge === 'l') L.start = Math.min(L.end - 0.01, Math.max(0, snap(s0 + d, true)));
    else L.end = Math.max(L.start + 0.01, snap(e0 + d, true));
    placeLoopbar(); drawGrid();
  }, () => {
    if (!moved) L.on = !L.on;   // 單擊切換開關
    store.changed('transport');
  });
}

function onLanesDown(e) {
  if (e.button !== 0) return;
  const clipNode = e.target.closest('.clip');
  if (!clipNode) return startMarquee(e);
  const id = clipNode.dataset.id;
  const found = store.findClip(id);
  if (!found) return;
  const sel = store.selection.clipIds;
  if (e.shiftKey || e.metaKey || e.ctrlKey) { sel.has(id) ? sel.delete(id) : sel.add(id); }
  else if (!sel.has(id)) { sel.clear(); sel.add(id); }
  store.selection.trackId = found.track.id;
  store.emit('select', {});
  const handle = e.target.dataset.h;
  if (handle) return startEdit(e, found, handle);
  startMove(e);
}

// 這一軌收不收這種片段（拖曳換軌時檢查）
function canPlace(track, clip) {
  const k = track.kind;
  if (isMidiClip(clip)) return k === 'midi';
  if (isVideoClip(clip)) return k === 'video';
  if (isTextClip(clip)) return k === 'text' || k === 'sub';
  return k === 'audio';
}

function startMove(e) {
  const x0 = e.clientX, y0 = e.clientY;
  const tracks = store.project.tracks;
  const items = [...store.selection.clipIds].map(id => store.findClip(id)).filter(Boolean)
    .map(({ track, clip }) => ({ clip, ti: tracks.indexOf(track), start: clipStart(clip) }));
  const earliest = Math.min(...items.map(i => i.start));
  const copy = e.altKey;
  const lanesTop = lanesInner.getBoundingClientRect().top;
  let moved = false, snapshot = null;
  drag(e, ev => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (!moved) { moved = true; snapshot = JSON.stringify(store.project); }
    // 以最早的片段對齊格線，其他片段維持相對位置
    let d = pxToSec(dx);
    d = snap(earliest + d) - earliest;
    if (earliest + d < 0) d = -earliest;
    const dt = trackDelta(items, ev.clientY, lanesTop);
    const ref = items[0].ti, dyPx = topOf(ref + dt) - topOf(ref);
    for (const it of items) {
      const el = lanesInner.querySelector(`.clip[data-id="${it.clip.id}"]`);
      el.style.left = secToPx(it.start + d) + 'px';
      el.style.transform = `translateY(${dyPx}px)`;
      el.style.opacity = copy ? .7 : 1;
    }
    items.d = d; items.dt = dt;
  }, () => {
    if (!moved) return;
    store.undoStack.push(snapshot); store.redoStack.length = 0;
    const d = items.d || 0;
    const minTi = Math.min(...items.map(i => i.ti)), maxTi = Math.max(...items.map(i => i.ti));
    let dt = Math.max(-minTi, Math.min(tracks.length - 1 - maxTi, items.dt || 0));
    // 不同類型的片段不能互換軌道；有任何一個放不進去就只做水平移動
    if (dt && items.some(it => !canPlace(tracks[it.ti + dt], it.clip))) {
      dt = 0;
      toast('音訊、MIDI、影片、文字的片段不能放到不同類型的軌道', 'warn');
    }
    const newSel = new Set();
    for (const it of items) {
      const from = tracks[it.ti], to = tracks[it.ti + dt];
      let c = it.clip;
      if (copy) { c = structuredClone(c); c.id = uid('clip'); }
      else from.clips.splice(from.clips.indexOf(c), 1);
      setClipStart(c, it.start + d);
      to.clips.push(c);
      newSel.add(c.id);
    }
    store.selection.clipIds = newSel;
    store.changed('structure');
  });
}

// MIDI 片段修剪：只改片段範圍（拍數），音符本身不動；左邊修剪時音符相對位置要跟著位移
function startMidiTrim(e, clip, handle) {
  const x0 = e.clientX;
  const o = structuredClone(clip);
  const b = spb();
  const minBeats = 0.25;
  store.checkpoint();
  drag(e, ev => {
    const dBeats = pxToSec(ev.clientX - x0) / b;
    if (handle === 'trimR') {
      const end = snap((o.startBeat + o.lengthBeats + dBeats) * b) / b;
      clip.lengthBeats = Math.max(minBeats, end - o.startBeat);
    } else {
      let ns = snap((o.startBeat + dBeats) * b) / b;
      ns = Math.max(0, Math.min(o.startBeat + o.lengthBeats - minBeats, ns));
      const delta = ns - o.startBeat;
      clip.startBeat = ns; clip.lengthBeats = o.lengthBeats - delta;
      clip.notes = o.notes.map(n => ({ ...n, t: n.t - delta })).filter(n => n.t + n.d > 0)
        .map(n => (n.t < 0 ? { ...n, d: n.d + n.t, t: 0 } : n));
      if (o.pedal) clip.pedal = shiftPedal(o.pedal, delta);
    }
    const old = lanesInner.querySelector(`.clip[data-id="${clip.id}"]`);
    old.replaceWith(clipEl(store.findClip(clip.id).track, clip));
    drawWaveforms();
  }, () => store.changed('structure'));
}

function startEdit(e, { clip }, handle) {
  if (isMidiClip(clip)) return startMidiTrim(e, clip, handle);
  const x0 = e.clientX;
  const o = { ...clip };
  const buf = store.buffers.get(clip.bufferId);
  // 影片片段可以往兩邊拉回原始長度，其他（找不到音訊的）只能縮短
  const srcLen = buf ? buf.duration : (isVideoClip(clip) ? (mediaDuration(clip.mediaId) ?? clip.offset + clip.duration) : clip.offset + clip.duration);
  const min = 0.01;
  store.checkpoint();
  drag(e, ev => {
    const d = pxToSec(ev.clientX - x0);
    if (handle === 'trimL') {
      let ns = snap(o.start + d);
      ns = Math.max(o.start - o.offset, Math.min(o.start + o.duration - min, ns), 0);
      const delta = ns - o.start;
      clip.start = ns; clip.offset = o.offset + delta; clip.duration = o.duration - delta;
      clip.fadeIn = Math.min(o.fadeIn || 0, clip.duration);
    } else if (handle === 'trimR') {
      let ne = snap(o.start + o.duration + d);
      ne = Math.max(o.start + min, Math.min(o.start + (srcLen - o.offset), ne));
      clip.duration = ne - o.start;
      clip.fadeOut = Math.min(o.fadeOut || 0, clip.duration);
    } else if (handle === 'fadeIn') {
      clip.fadeIn = Math.max(0, Math.min(clip.duration - (clip.fadeOut || 0), (o.fadeIn || 0) + d));
    } else if (handle === 'fadeOut') {
      clip.fadeOut = Math.max(0, Math.min(clip.duration - (clip.fadeIn || 0), (o.fadeOut || 0) - d));
    }
    // 只重畫這個片段
    const old = lanesInner.querySelector(`.clip[data-id="${clip.id}"]`);
    const track = store.findClip(clip.id).track;
    const nu = clipEl(track, clip);
    old.replaceWith(nu);
    drawWaveforms();
  }, () => store.changed('structure'));
}

function startMarquee(e) {
  const r0 = lanesInner.getBoundingClientRect();
  const x0 = e.clientX - r0.left, y0 = e.clientY - r0.top;
  const t = laneAt(e.clientY);
  if (t) store.selection.trackId = t.id;
  if (!e.shiftKey) store.selection.clipIds.clear();
  store.emit('select', {});
  const box = document.createElement('div');
  box.className = 'marquee';
  let moved = false;
  drag(e, ev => {
    const r = lanesInner.getBoundingClientRect();
    const x1 = ev.clientX - r.left, y1 = ev.clientY - r.top;
    if (!moved && Math.abs(x1 - x0) + Math.abs(y1 - y0) < 4) return;
    if (!moved) { moved = true; lanesInner.appendChild(box); }
    const L = Math.min(x0, x1), T = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
    Object.assign(box.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
    const s0 = pxToSec(L), s1 = pxToSec(L + W);
    const ti0 = indexAtY(T), ti1 = indexAtY(T + H);
    store.selection.clipIds.clear();
    store.project.tracks.forEach((tr, i) => {
      if (i < ti0 || i > ti1) return;
      for (const c of tr.clips) if (clipStart(c) < s1 && clipStart(c) + clipDur(c) > s0) store.selection.clipIds.add(c.id);
    });
    renderSelection();
  }, () => {
    box.remove();
    // 單擊空白處：把播放頭移過去（停止中才移，避免播放時亂跳）
    if (!moved && !engine.playing) engine.seek(snap(Math.max(0, xToSec(e.clientX))));
  });
}

function onLanesDbl(e) {
  const clipNode = e.target.closest('.clip');
  if (clipNode) {
    const f = store.findClip(clipNode.dataset.id);
    if (!f) return;
    if (isMidiClip(f.clip)) store.emit('open-piano-roll', { clipId: f.clip.id });
    else if (isTextClip(f.clip)) { store.emit('open-video-panel', {}); }
    else if (isVideoClip(f.clip)) { toggleVideoPreview(true); store.emit('open-video-panel', {}); }
    return;
  }
  const t = laneAt(e.clientY);
  if (!t) return;
  selectTrack(t.id);
  // MIDI 軌雙擊：建立新的空白片段並打開鋼琴捲簾
  if (t.kind === 'midi') {
    const c = addMidiClipAt(t, Math.max(0, xToSec(e.clientX)));
    if (c) store.emit('open-piano-roll', { clipId: c.id });
    return;
  }
  // 文字／字幕軌雙擊：新增一段文字
  if (t.kind === 'text' || t.kind === 'sub') { addTextClip(t, snap(Math.max(0, xToSec(e.clientX)))); return; }
  // 影片軌雙擊：選影片檔
  if (t.kind === 'video') {
    importAt = { trackId: t.id, at: snap(Math.max(0, xToSec(e.clientX))) };
    $('fileVideo').click();
    return;
  }
  importAt = { trackId: t.id, at: snap(Math.max(0, xToSec(e.clientX))) };
  $('fileAudio').click();
}
export let importAt = null;
export const consumeImportAt = () => { const v = importAt; importAt = null; return v; };

function onLanesContext(e) {
  e.preventDefault();
  const clipNode = e.target.closest('.clip');
  const at = Math.max(0, xToSec(e.clientX));
  if (clipNode) {
    const id = clipNode.dataset.id;
    if (!store.selection.clipIds.has(id)) { store.selection.clipIds = new Set([id]); store.emit('select', {}); }
    const n = store.selection.clipIds.size;
    const found = store.findClip(id).clip;
    const midi = isMidiClip(found);
    const visual = isVideoClip(found) || isTextClip(found);
    showMenu(e.clientX, e.clientY, [
      ...(visual ? [
        { label: '影像編輯…（濾鏡／調色／轉場／淡入淡出）', action: () => store.emit('open-video-panel', {}) },
        { label: isTextClip(found) ? '編輯文字…' : '看預覽', action: () => (isTextClip(found) ? editTextClip(found) : toggleVideoPreview(true)) },
        '-'] : []),
      ...(midi ? [{ label: '打開鋼琴捲簾', action: () => store.emit('open-piano-roll', { clipId: id }) },
        { label: '匯出成 .mid', action: () => store.emit('export-midi', { clipIds: [...store.selection.clipIds] }) }, '-'] : []),
      { label: '在播放頭切開', key: 'Ctrl+T', action: () => splitSelected(engine.currentTime()) },
      { label: '在這裡切開', action: () => splitSelected(snap(at)) },
      { label: '複製一份接在後面', key: 'Ctrl+D', action: duplicateSelected },
      ...(midi ? [] : [
        { label: n > 1 ? `升降音（${n} 個片段）…` : '升降音…', action: () => store.emit('open-pitch', { clipIds: [...store.selection.clipIds] }) },
        { label: '分離人聲／伴奏（簡易版）', disabled: n > 1, action: () => separateClip(id) },
        { label: 'AI 分離人聲／伴奏（Demucs）…', disabled: n > 1, action: () => openAiSeparate(id) },
        '-',
        { label: '片段音量 +1 dB', action: () => nudgeGain(1) },
        { label: '片段音量 −1 dB', action: () => nudgeGain(-1) },
        { label: '移除淡入淡出', action: () => { store.checkpoint(); eachSel(c => { c.fadeIn = 0; c.fadeOut = 0; }); store.changed('structure'); } },
      ]),
      '-',
      { label: n > 1 ? `刪除 ${n} 個片段` : '刪除片段', key: 'Del', danger: true, action: deleteSelected },
    ]);
  } else {
    const t = laneAt(e.clientY);
    showMenu(e.clientX, e.clientY, [
      t.kind === 'midi'
        ? { label: '在這裡新增 MIDI 片段', action: () => addMidiClipAt(t, at) }
        : { label: '在這裡匯入音檔…', action: () => { importAt = { trackId: t.id, at: snap(at) }; $('fileAudio').click(); } },
      { label: '匯入 .mid 檔…', action: () => store.emit('import-midi', { trackId: t.id, at: snap(at) }) },
      { label: '把播放頭移到這裡', action: () => engine.seek(snap(at)) },
      { label: '全選片段', key: 'Ctrl+A', action: selectAll },
    ]);
  }
}

// ---------------- 編輯指令（快捷鍵也會用到） ----------------
function eachSel(fn) {
  for (const id of store.selection.clipIds) { const f = store.findClip(id); if (f) fn(f.clip, f.track); }
}

export function deleteSelected() {
  if (!store.selection.clipIds.size) return;
  store.checkpoint();
  for (const t of store.project.tracks) t.clips = t.clips.filter(c => !store.selection.clipIds.has(c.id));
  store.selection.clipIds.clear();
  store.changed('structure');
}

export function splitSelected(at) {
  let targets = [...store.selection.clipIds].map(id => store.findClip(id)).filter(Boolean);
  // 沒選片段：切開選取軌上播放頭位置的片段
  if (!targets.length) {
    const t = store.track(store.selection.trackId);
    if (t) targets = t.clips.filter(c => at > clipStart(c) && at < clipStart(c) + clipDur(c)).map(clip => ({ track: t, clip }));
  }
  targets = targets.filter(({ clip }) => at > clipStart(clip) + 0.001 && at < clipStart(clip) + clipDur(clip) - 0.001);
  if (!targets.length) { toast('播放頭沒有落在片段上', 'warn'); return; }
  store.checkpoint();
  const newSel = new Set();
  for (const { track, clip } of targets) {
    if (isMidiClip(clip)) {
      // MIDI：跨越切點的音符留在左半（截短），右半從切點後的音符開始
      const cut = at / spb() - clip.startBeat;
      const right = { ...newMidiClip(clip.startBeat + cut, clip.lengthBeats - cut), name: clip.name,
        notes: clip.notes.filter(n => n.t >= cut).map(n => ({ ...n, t: n.t - cut })) };
      if (clip.pedal) {
        right.pedal = shiftPedal(clip.pedal, cut);
        // 左半：切點後的事件丟掉；切點時還踩著就在切點放開
        const keep = clip.pedal.filter(e => e.t < cut);
        if (keep.length && keep[keep.length - 1].on) keep.push({ t: cut, on: false });
        clip.pedal = keep;
      }
      clip.notes = clip.notes.filter(n => n.t < cut).map(n => ({ ...n, d: Math.min(n.d, cut - n.t) }));
      clip.lengthBeats = cut;
      track.clips.push(right); newSel.add(right.id);
      continue;
    }
    const left = at - clip.start;
    const right = { ...clip, id: uid('clip'), start: at, offset: clip.offset + left, duration: clip.duration - left, fadeIn: 0 };
    clip.duration = left; clip.fadeOut = 0;
    track.clips.push(right);
    newSel.add(right.id);
  }
  store.selection.clipIds = newSel;
  store.changed('structure');
}

export function duplicateSelected() {
  const items = [...store.selection.clipIds].map(id => store.findClip(id)).filter(Boolean);
  if (!items.length) return;
  store.checkpoint();
  const s = Math.min(...items.map(i => clipStart(i.clip)));
  const e = Math.max(...items.map(i => clipStart(i.clip) + clipDur(i.clip)));
  // 複製後對齊到下一個小節線
  const bar = beatSec() * store.project.sigNum;
  const shift = Math.ceil((e - s) / bar - 1e-6) * bar || (e - s);
  const newSel = new Set();
  for (const { track, clip } of items) {
    const c = structuredClone(clip);
    c.id = uid('clip');
    setClipStart(c, clipStart(clip) + shift);
    track.clips.push(c); newSel.add(c.id);
  }
  store.selection.clipIds = newSel;
  store.changed('structure');
}

export function selectAll() {
  store.selection.clipIds = new Set(store.project.tracks.flatMap(t => t.clips.map(c => c.id)));
  store.emit('select', {});
}

function nudgeGain(d) {
  store.checkpoint();
  eachSel(c => { c.gainDb = Math.max(-30, Math.min(24, (c.gainDb || 0) + d)); });
  store.changed('structure');
}

export function nudgeSelected(dir) {
  if (!store.selection.clipIds.size) return false;
  store.checkpoint();
  const g = gridStep();
  eachSel(c => setClipStart(c, clipStart(c) + dir * g));
  store.changed('structure');
  return true;
}

// ---------------- 拖放匯入 ----------------
function setupDrop() {
  let last = null;
  const clear = () => { if (last) last.classList.remove('drop'); last = null; };
  lanes.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const t = laneAt(e.clientY);
    const el = lanesInner.querySelector(`.lane[data-id="${t.id}"]`);
    if (el !== last) { clear(); last = el; el && el.classList.add('drop'); }
  });
  lanes.addEventListener('dragleave', e => { if (!lanes.contains(e.relatedTarget)) clear(); });
  lanes.addEventListener('drop', async e => {
    e.preventDefault(); clear();
    const files = [...e.dataTransfer.files];
    const proj = files.find(f => /\.(zyproj)$/i.test(f.name));
    if (proj) { store.emit('open-project-file', { file: proj }); return; }
    const mid = files.find(f => /\.(mid|midi)$/i.test(f.name));
    if (mid) { store.emit('drop-midi', { file: mid, at: snap(Math.max(0, xToSec(e.clientX))) }); return; }
    const audio = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|flac|ogg|m4a|aac|aif|aiff|opus|webm)$/i.test(f.name));
    if (!audio.length) { toast('這不是可以讀取的音檔', 'warn'); return; }
    const t = laneAt(e.clientY);
    store.emit('busy', { text: `正在讀取 ${audio.length} 個音檔…` });
    try { await importAudioFiles(audio, t.id, snap(Math.max(0, xToSec(e.clientX)))); }
    finally { store.emit('busy', null); }
  });
}
