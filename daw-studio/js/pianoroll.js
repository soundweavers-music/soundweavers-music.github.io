// 鋼琴捲簾：編輯單一 MIDI 片段
//  工具（參考 Logic Pro）：指標、鉛筆、橡皮擦、剪刀、膠水、靜音筆、力度筆
//  編輯：新增／移動／改長度／框選／複製貼上／切開／合併／連音／靜音
//  功能：量化（強度、Swing、連長度）、人性化、力度（設定／加減／漸強漸弱）、
//        移調與對齊音階、長度工具、反轉／倒影／速度加倍減半、選取工具
//  檢視：顏色依據、音符標籤、音高列高度、水平縮放、跟隨播放頭、時間尺拖曳播放頭
import { store, isMidiClip, spb, clipStart } from './state.js';
import { engine, pedalSpans } from './engine.js';
import { PRESETS, DRUM_NAMES, noteName } from './synth.js';
import { toast } from './util.js';
import { cssVar } from './theme.js';

const KEYS_W = 64, VEL_H = 64, PED_H = 22, RULER_H = 18, LOW = 0, HIGH = 127;
const BLACK = new Set([1, 3, 6, 8, 10]);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = n => (Math.random() * 2 - 1) * n;

// 對齊音階用的音階表（相對於主音的半音）
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  penta: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
};
const SCALE_NAMES = [['major', '大調'], ['minor', '自然小調'], ['harmonic', '和聲小調'], ['penta', '五聲音階'], ['blues', '藍調音階']];
const PC = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// 介面字串集中放成單行字串：scripts/daw_i18n_extract.py 只掃得到這種寫法
const UI = {
  title: '鋼琴捲簾',
  tPointer: '指標：選取、移動、拖右緣改長度；Shift 多選、Alt 拖曳複製（1）',
  tPencil: '鉛筆：點空白新增音符、拖曳決定長度（2）',
  tEraser: '橡皮擦：點或拖過音符就刪除（3）',
  tScissors: '剪刀：點在音符上，從那個位置切開（4）',
  tGlue: '膠水：選取同音高的音符後合併成一顆長音（5）',
  tMute: '靜音筆：點音符開關靜音（6）',
  tVelocity: '力度筆：上下拖曳改力度（7）',
  fx: '量化、人性化、力度、移調、長度、反轉…',
  grid: '格線：新音符與拖曳要對齊的拍長',
  snap: '對齊格線（拖曳時按住 Alt 暫時不對齊）',
  vel: '新音符的力度；也可以拖下方的力度條',
  up: '升半音；Shift 升八度（↑）',
  down: '降半音；Shift 降八度（↓）',
  split: '在播放頭的位置切開音符（Ctrl+T）',
  join: '把選取的同音高音符合併成一顆（Ctrl+J）',
  prevClip: '上一個 MIDI 片段',
  nextClip: '下一個 MIDI 片段',
  follow: '播放時畫面自動跟著播放頭',
  zoomH: '水平縮放（Ctrl＋滾輪）',
  lGrid: '格線', lSnap: '對齊', lVel: '力度', lColor: '顏色', lLabel: '標籤',
  cTrack: '軌道', cVel: '力度', cPitch: '音高',
  nName: '音名', nVel: '力度', nLen: '長度', nNone: '不顯示',
  mQuantize: '量化', mStrength: '強度', mSwing: 'Swing（擺動）', mQLen: '長度一起量化',
  mQApply: '量化選取（沒選就全部）',
  mHuman: '人性化（打散）', mPos: '位置', mLen: '長度', mVelHum: '力度',
  mHumApply: '打散選取（沒選就全部）',
  mVel: '力度', mVelSet: '設為', mVelAdd: '加', mVelSub: '減', mCresc: '漸強', mDecresc: '漸弱',
  mTranspose: '移調', mSemi: '半音', mApply: '套用', mScale: '對齊音階', mKey: '調',
  mLenTools: '長度', mLenGrid: '設為格線', mLenLegato: '連音（接到下一個音）', mLenDouble: '×2', mLenHalf: '÷2',
  mTime: '時間與音高', mReverse: '反轉', mInvert: '倒影', mDouble: '速度 ×2', mHalf: '速度 ÷2',
  mSelect: '選取', mSelAll: '全選', mSelPitch: '同音高', mSelInv: '反轉選取',
  mView: '檢視', mRowH: '音高列高度',
  cDel: '刪除', cSplit: '從這裡切開', cJoin: '合併選取', cMute: '靜音／取消靜音',
  cCopy: '複製', cPaste: '貼在這裡', cSelPitch: '選取同音高', cSelAll: '全選', cSelNone: '取消選取',
  cQuant: '對齊格線', cVelSet: '力度設為',
};

const PREF = 'zhiyin-daw-pianoroll';

const pr = {
  clipId: null,
  pxPerBeat: 80,
  rowH: 12,
  grid: 0.25,
  sel: new Set(),        // 選取音符（物件參照）
  notesRef: null,        // 上一次看到的 notes 陣列，用來在復原後接回選取
  lastLen: 1,            // 新音符的預設長度
  tool: 'pointer',
  snap: true,
  color: 'track',        // track | vel | pitch
  label: 'name',         // name | vel | len | none
  follow: true,
  clipboard: null,       // { at, notes: [{ p, t, d, v, m }] }
  scaleRoot: 0,
  scaleType: 'major',
  menuOpen: false,
  erasing: null,       // 橡皮擦拖曳中、準備刪掉的音符（只影響畫法）
  // 功能選單上次用的數值（每次開選單都重建節點，所以自己記）
  menu: { strength: 100, swing: 50, withLen: false, pos: 10, len: 10, humVel: 10, velNum: 100, semi: 0 },
};

let root, body, keysCv, gridCv, rulerCv, velCv, pedCv, wrap, info;
let marquee = null;

// ---------------- 啟動 ----------------
export function initPianoRoll() {
  loadPrefs();
  root = $('pianoroll');
  root.innerHTML = `
    <div class="pr-bar">
      <strong id="prTitle">${UI.title}</strong>
      <span class="pr-info" id="prInfo"></span>
      <div class="spacer"></div>
      <div class="pr-tools" id="prTools">
        <button type="button" data-tool="pointer" title="${UI.tPointer}">↖</button>
        <button type="button" data-tool="pencil" title="${UI.tPencil}">✎</button>
        <button type="button" data-tool="eraser" title="${UI.tEraser}">⌫</button>
        <button type="button" data-tool="scissors" title="${UI.tScissors}">✂</button>
        <button type="button" data-tool="glue" title="${UI.tGlue}">⇥⇤</button>
        <button type="button" data-tool="mute" title="${UI.tMute}">◑</button>
        <button type="button" data-tool="velocity" title="${UI.tVelocity}">▮</button>
      </div>
      <button type="button" class="tbtn" id="prFx" title="${UI.fx}">功能 ▾</button>
      <button type="button" class="tbtn ghost" id="prClose" title="關閉 (Esc)">✕</button>
    </div>
    <div class="pr-bar pr-bar2">
      <label>${UI.lGrid} <select id="prGrid">
        <option value="1">1/4</option><option value="0.5">1/8</option><option value="0.25" selected>1/16</option>
        <option value="0.125">1/32</option><option value="0.0625">1/64</option>
        <option value="0.3333333333">1/8 三連音</option><option value="0.1666666667">1/16 三連音</option>
        <option value="0.0833333333">1/32 三連音</option>
      </select></label>
      <label class="pr-chk"><input type="checkbox" id="prSnap" checked title="${UI.snap}"> ${UI.lSnap}</label>
      <label>${UI.lVel} <input type="number" id="prVel" min="1" max="127" value="100" style="width:50px" title="${UI.vel}"></label>
      <button type="button" class="tbtn" id="prUp" title="${UI.up}">↑</button>
      <button type="button" class="tbtn" id="prDown" title="${UI.down}">↓</button>
      <button type="button" class="tbtn" id="prSplit" title="${UI.split}">切開</button>
      <button type="button" class="tbtn" id="prJoin" title="${UI.join}">合併</button>
      <div class="spacer"></div>
      <button type="button" class="tbtn ghost" id="prClipPrev" title="${UI.prevClip}">‹</button>
      <button type="button" class="tbtn ghost" id="prClipNext" title="${UI.nextClip}">›</button>
      <button type="button" class="tbtn ghost" id="prFollow" title="${UI.follow}">跟隨</button>
      <button type="button" class="tbtn" id="prZoomOut" title="${UI.zoomH}">−</button>
      <button type="button" class="tbtn" id="prZoomIn" title="${UI.zoomH}">＋</button>
    </div>
    <div class="pr-body" id="prBody">
      <canvas id="prRuler"></canvas>
      <canvas id="prKeys"></canvas>
      <div class="pr-scroll" id="prScroll"><div class="pr-inner" id="prInner"></div></div>
      <canvas id="prGridCv"></canvas>
    </div>
    <div class="pr-vel"><div class="pr-vel-lbl">${UI.lVel}</div><canvas id="prVelCv"></canvas></div>
    <div class="pr-ped"><div class="pr-vel-lbl" title="延音踏板（CC64）：點空白新增一段、拖兩端改長度、右鍵刪除">踏板</div><canvas id="prPedCv"></canvas></div>
`;

  body = $('prBody'); keysCv = $('prKeys'); gridCv = $('prGridCv'); rulerCv = $('prRuler');
  velCv = $('prVelCv'); pedCv = $('prPedCv'); wrap = $('prScroll'); info = $('prInfo');

  bindBar();
  bindRuler();
  bindVelocityLane();
  bindPedalLane();

  new ResizeObserver(() => layout()).observe(root);
  wrap.tabIndex = 0;   // 讓捲簾可以取得焦點：按過之後鍵盤快捷鍵就歸它，點別的地方就還回去
  document.addEventListener('pointerdown', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (pr.menuOpen && !t.closest('#prMenu, #prFx')) closeMenu();
    if ($('prCtx') && !t.closest('#prCtx')) closeCtx();
  }, true);
  window.addEventListener('resize', () => closeMenu());

  store.on('change', ({ kind }) => {
    if (!pr.clipId) return;
    if (!store.findClip(pr.clipId)) { close(); return; }
    if (kind === 'structure' || kind === 'mix') layout();
  });
  store.on('open-piano-roll', ({ clipId }) => open(clipId));
  store.on('midi-rec', ({ clipId }) => { if (clipId === pr.clipId) layout(); });
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (!p) return;
    for (const k of ['pxPerBeat', 'rowH', 'grid', 'tool', 'snap', 'color', 'label', 'follow', 'scaleRoot', 'scaleType']) {
      if (p[k] !== undefined) pr[k] = p[k];
    }
  } catch (_) { /* 壞掉就用預設 */ }
}
let prefTimer = 0;
function savePrefs() {
  clearTimeout(prefTimer);
  prefTimer = setTimeout(() => {
    try {
      const p = {};
      for (const k of ['pxPerBeat', 'rowH', 'grid', 'tool', 'snap', 'color', 'label', 'follow', 'scaleRoot', 'scaleType']) p[k] = pr[k];
      localStorage.setItem(PREF, JSON.stringify(p));
    } catch (_) { /* 無痕模式 */ }
  }, 300);
}

export const isOpen = () => !!pr.clipId && !root.classList.contains('hidden');

// 目前的片段；順便處理「復原／重做換掉 notes 陣列之後，選取要接回來」
function cur() {
  const f = pr.clipId && store.findClip(pr.clipId);
  if (!f || !isMidiClip(f.clip)) return null;
  const notes = f.clip.notes;
  if (pr.notesRef !== notes) {
    const old = pr.notesRef || [];
    pr.sel = new Set([...pr.sel].map(n => old.indexOf(n)).filter(i => i >= 0 && i < notes.length).map(i => notes[i]));
    pr.notesRef = notes;
  }
  return f;
}

export function open(clipId) {
  const f = store.findClip(clipId);
  if (!f || !isMidiClip(f.clip)) return;
  pr.clipId = clipId;
  pr.sel = new Set();
  pr.notesRef = f.clip.notes;
  store.selection.trackId = f.track.id;
  store.selection.clipIds = new Set([clipId]);
  store.emit('select', {});
  store.emit('panel', { name: 'pianoroll' });
  root.classList.remove('hidden');
  syncTools();
  requestAnimationFrame(() => {
    layout();
    // 第一次打開：捲到音符所在的音域（沒有音符就捲到 C4）
    const notes = f.clip.notes;
    const center = notes.length ? notes.reduce((s, n) => s + n.p, 0) / notes.length : 60;
    wrap.scrollTop = Math.max(0, (HIGH - center) * pr.rowH - wrap.clientHeight / 2);
    wrap.scrollLeft = 0;
    draw();
  });
}

export function close() {
  if (wrap) { try { wrap.blur(); } catch (_) { /* noop */ } }
  pr.clipId = null;
  root.classList.add('hidden');
  closeMenu(); closeCtx();
  store.emit('panel', { name: null });
}

function layout() {
  const f = cur();
  if (!f || root.classList.contains('hidden')) return;
  const inner = $('prInner');
  const beats = Math.max(f.clip.lengthBeats + store.project.sigNum * 4, 16);
  inner.style.width = (beats * pr.pxPerBeat) + 'px';
  inner.style.height = ((HIGH - LOW + 1) * pr.rowH) + 'px';
  const P = PRESETS[f.track.instrument];
  $('prTitle').textContent = `${f.track.name} — ${f.clip.name}`;
  $('prTitle').style.color = f.track.color;
  info.textContent = infoText(f);
  info.title = `${P ? P.name : ''}`;
  syncTools();
  draw();
}

function infoText(f) {
  const sel = [...pr.sel];
  const P = PRESETS[f.track.instrument];
  const n = f.clip.notes.filter(x => !x.m).length;
  const mute = f.clip.notes.length - n;
  if (sel.length) {
    const ps = sel.map(x => x.p), vs = sel.map(x => x.v), ds = sel.map(x => x.d);
    return `選取 ${sel.length}／${f.clip.notes.length}・${noteName(Math.min(...ps))}–${noteName(Math.max(...ps))}・力度 ${Math.min(...vs)}–${Math.max(...vs)}・長度 ${Math.min(...ds).toFixed(2)}–${Math.max(...ds).toFixed(2)} 拍`;
  }
  return `${P ? P.name : ''}・${n} 個音符${mute ? `・${mute} 個靜音` : ''}・${fmtLen(f.clip.lengthBeats)}`;
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

const yOf = p => (HIGH - p) * pr.rowH;
const pOf = y => clamp(HIGH - Math.floor(y / pr.rowH), LOW, HIGH);
const xOf = beat => beat * pr.pxPerBeat;
const bOf = x => x / pr.pxPerBeat;
const snapB = (b, on = pr.snap) => (on ? Math.round(b / pr.grid) * pr.grid : b);
const floorB = b => Math.floor(b / pr.grid + 1e-6) * pr.grid;

const scaleMask = () => {
  const set = new Set((SCALES[pr.scaleType] || SCALES.major).map(x => (x + pr.scaleRoot) % 12));
  let m = 0;
  for (const pc of set) m |= 1 << pc;
  return m;
};

function shade(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${gg},${b},${a})`;
}

function noteFill(n, track) {
  if (pr.color === 'vel') { const v = n.v / 127; return `hsl(${210 - 190 * v} 78% ${40 + 22 * v}%)`; }
  if (pr.color === 'pitch') return `hsl(${(n.p % 12) * 30} 68% 52%)`;
  const a = 0.45 + 0.55 * n.v / 127;
  return shade(track.color, a);
}

// ---------------- 繪製 ----------------
export function draw() {
  const f = cur();
  if (!f || root.classList.contains('hidden')) return;
  const { clip, track } = f;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const sx = wrap.scrollLeft, sy = wrap.scrollTop;
  const drums = PRESETS[track.instrument]?.drum;
  const rowH = pr.rowH;
  const mask = scaleMask();

  // 播放時跟著播放頭
  const ph = engine.currentTime() / spb() - clip.startBeat;
  if (pr.follow && engine.playing) {
    const px = xOf(ph) - sx;
    if (px < 4 || px > W - 4) wrap.scrollLeft = Math.max(0, xOf(ph) - W * 0.12);
  }

  drawRuler(body.clientWidth, sx);
  drawKeys(H, sy, drums, mask);
  const g = drawGrid(W, H, sx, sy, drums, mask, clip, track);

  // ---- 音符 ----
  g.textBaseline = 'middle';
  for (const note of clip.notes) {
    const x = xOf(note.t) - sx, w = Math.max(3, xOf(note.d) - 1), y = yOf(note.p) - sy;
    if (x + w < 0 || x > W || y + rowH < 0 || y > H) continue;
    const sel = pr.sel.has(note);
    const muted = !!note.m;
    g.globalAlpha = pr.erasing && pr.erasing.has(note) ? 0.18 : muted ? 0.34 : note.t >= clip.lengthBeats ? 0.35 : 1;
    g.fillStyle = sel ? cssVar('--cv-sel') : noteFill(note, track);
    g.fillRect(x, y + 1, w, Math.max(2, rowH - 2));
    g.strokeStyle = muted ? cssVar('--cv-sel') : sel ? track.color : 'rgba(0,0,0,.55)';
    g.setLineDash(muted ? [3, 2] : []);
    g.strokeRect(x + 0.5, y + 1.5, Math.max(1, w - 1), Math.max(1, rowH - 3));
    g.setLineDash([]);
    if (pr.label !== 'none' && w > 22 && rowH >= 9) {
      const txt = pr.label === 'vel' ? String(Math.round(note.v))
        : pr.label === 'len' ? (note.d >= 1 ? note.d.toFixed(0) : note.d.toFixed(2))
          : drums && DRUM_NAMES[note.p] ? DRUM_NAMES[note.p] : noteName(note.p);
      g.fillStyle = sel ? cssVar('--cv-sel-tx') : 'rgba(0,0,0,.72)';
      g.font = `${Math.min(10, rowH - 2)}px ui-monospace, Consolas`;
      g.fillText(txt, x + 3, y + rowH / 2);
    }
    g.globalAlpha = 1;
  }

  // 播放頭（片段內）
  const phx = xOf(ph) - sx;
  if (phx >= 0 && phx <= W) { g.fillStyle = cssVar('--playhead'); g.fillRect(phx, 0, 1, H); }

  if (marquee) {
    g.strokeStyle = '#4f9dff'; g.fillStyle = 'rgba(79,157,255,.12)';
    g.fillRect(marquee.x - sx, marquee.y - sy, marquee.w, marquee.h);
    g.strokeRect(marquee.x - sx + .5, marquee.y - sy + .5, marquee.w, marquee.h);
  }
  if (pr.tool === 'pencil' && pencilGhost && pencilGhost.beat >= 0) {
    g.fillStyle = 'rgba(120,170,255,.22)';
    const gx = xOf(pencilGhost.beat) - sx, gy = yOf(pencilGhost.p) - sy;
    if (gx > -200 && gx < W + 200) g.fillRect(gx, gy + 1, Math.max(3, xOf(pencilGhost.d) - 1), Math.max(2, rowH - 2));
  }

  drawVelocityLane(f, sx);
  drawPedalLane(f, sx);
  info.textContent = infoText(f);
}

let pencilGhost = null;

function drawRuler(W, sx) {
  const g = setup(rulerCv, W, RULER_H);
  g.fillStyle = cssVar('--bg2'); g.fillRect(0, 0, W, RULER_H);
  g.fillStyle = cssVar('--line'); g.fillRect(0, RULER_H - 1, W, 1);
  const n = store.project.sigNum;
  const barPx = n * pr.pxPerBeat;
  // 小節太密就每 2、4、8… 小節標一次
  let step = 1;
  while (barPx * step < 34) step *= 2;
  g.font = '10px ui-monospace, Consolas'; g.textBaseline = 'middle';
  const fromBar = Math.floor(bOf(sx) / n) - 1, toBar = Math.ceil(bOf(sx + W) / n) + 1;
  for (let b = Math.max(0, fromBar); b <= toBar; b++) {
    if (b % step) continue;
    const x = Math.round(KEYS_W + xOf(b * n) - sx) + 0.5;
    if (x < KEYS_W - 6) continue;
    if (x > W) break;
    g.fillStyle = cssVar('--pr-bar'); g.fillRect(x, 4, 1, RULER_H - 4);
    g.fillStyle = cssVar('--pr-num'); g.fillText(String(b + 1), x + 3, RULER_H / 2);
  }
  // 播放頭三角
  const f = cur();
  if (f) {
    const x = KEYS_W + xOf(engine.currentTime() / spb() - f.clip.startBeat) - sx;
    if (x >= KEYS_W && x <= W) {
      g.fillStyle = cssVar('--playhead');
      g.beginPath(); g.moveTo(x - 4, RULER_H - 8); g.lineTo(x + 4, RULER_H - 8); g.lineTo(x, RULER_H - 1); g.closePath(); g.fill();
    }
  }
}

function drawKeys(H, sy, drums, mask) {
  const k = setup(keysCv, KEYS_W, H);
  k.fillStyle = cssVar('--pr-keys-bg'); k.fillRect(0, 0, KEYS_W, H);
  k.font = '9.5px ui-monospace, Consolas, monospace'; k.textBaseline = 'middle';
  for (let p = pOf(sy + H); p <= Math.min(HIGH, pOf(sy) + 1); p++) {
    const y = yOf(p) - sy;
    const black = BLACK.has(p % 12);
    k.fillStyle = drums ? (DRUM_NAMES[p] ? '#d9dbe0' : '#9a9da5') : black ? '#25272c' : '#d9dbe0';
    k.fillRect(0, y, KEYS_W - 1, Math.max(1, pr.rowH - 1));
    if (drums && DRUM_NAMES[p]) { k.fillStyle = '#111'; k.fillText(DRUM_NAMES[p], 3, y + pr.rowH / 2); }
    else if (!drums && p % 12 === 0) { k.fillStyle = '#333'; k.fillText(noteName(p), KEYS_W - 26, y + pr.rowH / 2); }
    // 音階內的音在琴鍵上做一個小記號（對齊音階時一眼看出要往哪裡靠）
    if ((mask >> (((p % 12) + 12) % 12)) & 1) {
      k.fillStyle = cssVar('--accent');
      k.fillRect(KEYS_W - 3, y + 2, 2, Math.max(1, pr.rowH - 4));
    }
  }
}

function drawGrid(W, H, sx, sy, drums, mask, clip, track) {
  const g = setup(gridCv, W, H);
  for (let p = pOf(sy + H); p <= Math.min(HIGH, pOf(sy) + 1); p++) {
    const y = yOf(p) - sy;
    const inKey = (mask >> (((p % 12) + 12) % 12)) & 1;
    g.fillStyle = drums ? (DRUM_NAMES[p] ? cssVar('--pr-row-d') : cssVar('--pr-row-d2'))
      : BLACK.has(p % 12) ? cssVar('--pr-row-b') : cssVar('--pr-row-w');
    g.fillRect(0, y, W, pr.rowH);
    if (!drums && !inKey) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, y, W, pr.rowH); }
    if (p % 12 === 0) { g.fillStyle = cssVar('--pr-oct'); g.fillRect(0, y + pr.rowH - 1, W, 1); }
  }
  const n = store.project.sigNum;
  const b0 = Math.floor(bOf(sx) / pr.grid) * pr.grid, b1 = bOf(sx + W);
  for (let b = b0; b <= b1; b += pr.grid) {
    const x = Math.round(xOf(b) - sx) + 0.5;
    const isBar = Math.abs(b / n - Math.round(b / n)) < 1e-6;
    const isBeat = Math.abs(b - Math.round(b)) < 1e-6;
    g.strokeStyle = isBar ? cssVar('--pr-bar') : isBeat ? cssVar('--pr-beat') : cssVar('--pr-sub');
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  // 片段範圍之外變暗
  const endX = xOf(clip.lengthBeats) - sx;
  if (endX < W) {
    g.fillStyle = cssVar('--pr-dim'); g.fillRect(Math.max(0, endX), 0, W, H);
    g.fillStyle = track.color; g.fillRect(endX - 1, 0, 2, H);
  }
  return g;
}

function drawVelocityLane(f, sx) {
  const { clip, track } = f;
  const vw = Math.max(10, velCv.parentElement.clientWidth - KEYS_W);
  const v = setup(velCv, vw, VEL_H);
  v.fillStyle = cssVar('--pr-vel-bg'); v.fillRect(0, 0, vw, VEL_H);
  v.strokeStyle = cssVar('--pr-vel-mid'); v.beginPath(); v.moveTo(0, VEL_H / 2 + .5); v.lineTo(vw, VEL_H / 2 + .5); v.stroke();
  for (const note of clip.notes) {
    const x = xOf(note.t) - sx;
    if (x < -4 || x > vw) continue;
    const h = (note.v / 127) * (VEL_H - 6);
    v.fillStyle = note.m ? 'rgba(150,150,150,.55)' : pr.sel.has(note) ? cssVar('--cv-sel') : track.color;
    v.fillRect(x, VEL_H - h, 3, h);
    v.beginPath(); v.arc(x + 1.5, VEL_H - h, 3, 0, Math.PI * 2); v.fill();
  }
}

function drawPedalLane(f, sx) {
  const { clip, track } = f;
  const pw = Math.max(10, pedCv.parentElement.clientWidth - KEYS_W);
  const pg = setup(pedCv, pw, PED_H);
  pg.fillStyle = cssVar('--pr-ped-bg'); pg.fillRect(0, 0, pw, PED_H);
  for (const [a, z] of pedalSpans(clip)) {
    const x0 = xOf(a) - sx, x1 = xOf(Math.min(z, clip.lengthBeats)) - sx;
    if (x1 < 0 || x0 > pw) continue;
    const grad = pg.createLinearGradient(0, 0, 0, PED_H);
    grad.addColorStop(0, track.color); grad.addColorStop(1, shade(track.color, 0.45));
    pg.fillStyle = grad;
    pg.fillRect(x0, 4, Math.max(2, x1 - x0), PED_H - 8);
    pg.fillStyle = cssVar('--cv-sel');
    pg.fillRect(x0, 4, 2, PED_H - 8); pg.fillRect(x1 - 2, 4, 2, PED_H - 8);
    if (x1 - x0 > 40) { pg.fillStyle = 'rgba(0,0,0,.65)'; pg.font = '10px sans-serif'; pg.fillText('Ped.', x0 + 5, PED_H - 7); }
  }
}

// ---------------- 座標與命中 ----------------
function local(e) {
  const r = wrap.getBoundingClientRect();
  return { x: e.clientX - r.left + wrap.scrollLeft, y: e.clientY - r.top + wrap.scrollTop };
}

function hitAt(x, y) {
  const f = cur(); if (!f) return null;
  const p = pOf(y), b = bOf(x);
  const notes = f.clip.notes;
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.p !== p || b < n.t - 1e-6 || b > n.t + n.d + 1e-6) continue;
    const right = xOf(n.t + n.d) - x;
    return { note: n, edge: right < Math.min(9, Math.max(4, xOf(n.d) / 3)) ? 'r' : 'm' };
  }
  return null;
}


// ---------------- 工具列 ----------------
function bindBar() {
  $('prTools').addEventListener('click', e => {
    const b = e.target.closest('button[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  $('prFx').onclick = () => { pr.menuOpen ? closeMenu() : openMenu(); };
  $('prGrid').onchange = e => { pr.grid = Number(e.target.value); savePrefs(); draw(); };
  $('prSnap').onchange = e => { pr.snap = e.target.checked; savePrefs(); };
  $('prUp').onclick = e => transpose(e.shiftKey ? 12 : 1);
  $('prDown').onclick = e => transpose(e.shiftKey ? -12 : -1);
  $('prVel').onchange = e => setVelocity(Number(e.target.value));
  $('prSplit').onclick = splitAtPlayhead;
  $('prJoin').onclick = joinSelected;
  $('prZoomIn').onclick = () => zoomH(1.4);
  $('prZoomOut').onclick = () => zoomH(1 / 1.4);
  $('prClipPrev').onclick = () => stepClip(-1);
  $('prClipNext').onclick = () => stepClip(1);
  $('prFollow').onclick = () => { pr.follow = !pr.follow; savePrefs(); syncTools(); };
  $('prClose').onclick = close;
  $('prVel').addEventListener('keydown', e => e.stopPropagation());

  wrap.addEventListener('scroll', () => draw());
  wrap.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomH(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left);
    } else if (e.shiftKey) {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomV(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientY - r.top);
    }
  }, { passive: false });
  wrap.addEventListener('pointerdown', onGridDown);
  wrap.addEventListener('contextmenu', e => {
    e.preventDefault();
    openContext(e);
  });
  wrap.addEventListener('pointermove', onHover);
  wrap.addEventListener('pointerleave', () => { pencilGhost = null; });
  keysCv.addEventListener('pointerdown', onKeysDown);
  velCv.addEventListener('pointerdown', onVelDown);
}

let toolBtns = [];
function syncTools() {
  if (!root) return;
  toolBtns = [...root.querySelectorAll('#prTools button')];
  for (const b of toolBtns) b.classList.toggle('on', b.dataset.tool === pr.tool);
  $('prSnap').checked = !!pr.snap;
  $('prGrid').value = String(pr.grid);
  $('prFollow').classList.toggle('on', pr.follow);
}

function setTool(t) {
  pr.tool = t; savePrefs(); syncTools(); draw();
}

function cursorFor(tool, hit) {
  if (tool === 'eraser') return 'cell';
  if (tool === 'scissors') return 'crosshair';
  if (tool === 'glue') return hit ? 'copy' : 'default';
  if (tool === 'mute') return 'pointer';
  if (tool === 'velocity') return 'ns-resize';
  if (tool === 'pencil') return 'crosshair';
  return hit ? (hit.edge === 'r' ? 'ew-resize' : 'grab') : 'crosshair';
}

function onHover(e) {
  if (e.buttons) return;
  const { x, y } = local(e);
  const hit = hitAt(x, y);
  wrap.style.cursor = cursorFor(pr.tool, hit);
  // 鉛筆：跟著游標預覽新音符會放在哪裡
  if (pr.tool === 'pencil' && !hit && pr.clipId) {
    const beat = Math.max(0, floorB(bOf(x)));
    const p = pOf(y);
    if (pencilGhost && pencilGhost.beat === beat && pencilGhost.p === p && pencilGhost.d === pr.lastLen) return;
    pencilGhost = { p, beat, d: pr.lastLen };
    draw();
  } else if (pencilGhost) { pencilGhost = null; draw(); }
}

function zoomH(k, atX) {
  const anchor = atX == null ? wrap.clientWidth / 2 : atX;
  const b = bOf(wrap.scrollLeft + anchor);
  pr.pxPerBeat = clamp(pr.pxPerBeat * k, 12, 480);
  savePrefs();
  layout();
  wrap.scrollLeft = Math.max(0, xOf(b) - anchor);
  draw();
}

function zoomV(k, atY) {
  const anchor = atY == null ? wrap.clientHeight / 2 : atY;
  const p = pOf(wrap.scrollTop + anchor);
  const old = pr.rowH;
  pr.rowH = clamp(Math.round(old * k), 6, 28);
  if (pr.rowH === old) return;
  savePrefs();
  layout();
  wrap.scrollTop = Math.max(0, yOf(p + 1) - anchor);
  draw();
}

function stepClip(dir) {
  const all = [];
  for (const t of store.project.tracks) for (const c of t.clips) if (isMidiClip(c)) all.push(c.id);
  if (!all.length) return;
  const i = all.indexOf(pr.clipId);
  const next = all[(i + dir + all.length) % all.length];
  open(next);
}

// ---------------- 時間尺 ----------------
function bindRuler() {
  rulerCv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const f = cur(); if (!f) return;
    try { rulerCv.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件或已放開的指標 */ }
    const r = body.getBoundingClientRect();
    const seek = ev => {
      const x = Math.max(0, ev.clientX - r.left - KEYS_W + wrap.scrollLeft);
      engine.seek((f.clip.startBeat + bOf(x)) * spb());
    };
    seek(e);
    const mv = ev => seek(ev);
    const up = () => { rulerCv.removeEventListener('pointermove', mv); rulerCv.removeEventListener('pointerup', up); };
    rulerCv.addEventListener('pointermove', mv); rulerCv.addEventListener('pointerup', up);
  });
  rulerCv.style.cursor = 'pointer';
}

// ---------------- 主格線：依工具分派 ----------------
function onGridDown(e) {
  if (e.button !== 0) return;
  const f = cur(); if (!f) return;
  e.preventDefault();
  try { wrap.focus({ preventScroll: true }); } catch (_) { /* 舊瀏覽器沒有 preventScroll */ }
  try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件或已放開的指標 */ }
  if (pencilGhost) { pencilGhost = null; }
  const start = local(e);
  const hit = hitAt(start.x, start.y);
  if (pr.menuOpen) closeMenu();

  switch (pr.tool) {
    case 'eraser': return dragDelete(e, start);
    case 'scissors': return dragSplit(e, start, hit);
    case 'mute': return dragMute(e, hit);
    case 'velocity': return dragVelocityPen(e, start, hit);
    case 'glue': {
      if (!hit) { toast('用膠水點其中一顆音符（同音高、有選取就整組合併）', 'warn'); return; }
      if (!pr.sel.has(hit.note)) pr.sel = new Set([hit.note]);
      joinSelected();
      return;
    }
    default: break;
  }

  // 指標／鉛筆
  if (!hit) {
    if (pr.tool === 'pointer') return startMarquee(e, start);
    // 鉛筆：新增音符並直接拖長度
    store.checkpoint();
    const t = Math.max(0, floorB(bOf(start.x)));
    const note = { p: pOf(start.y), t, d: pr.lastLen, v: clamp(Number($('prVel').value) || 100, 1, 127) };
    f.clip.notes.push(note);
    pr.notesRef = f.clip.notes;
    if (t + note.d > f.clip.lengthBeats) growClip(f.clip);
    pr.sel = new Set([note]);
    engine.audition(f.track.id, note.p, note.v);
    return dragNotes(e, start, [note], 'r', note);
  }

  selectOrDrag(e, f, hit, start);
}

// 選取與拖曳（指標／鉛筆都走這裡）
function selectOrDrag(e, f, hit, start) {
  const { clip } = f;
  if (e.shiftKey) {
    pr.sel.has(hit.note) ? pr.sel.delete(hit.note) : pr.sel.add(hit.note);
    draw();
    return;
  }
  if (!pr.sel.has(hit.note)) pr.sel = new Set([hit.note]);
  engine.audition(f.track.id, hit.note.p, hit.note.v);
  store.checkpoint();
  // Alt 拖曳：複製
  let notes = [...pr.sel];
  let anchor = hit.note;
  if (e.altKey) {
    const copies = notes.map(n => ({ ...n }));
    clip.notes.push(...copies);
    pr.notesRef = clip.notes;
    anchor = copies[notes.indexOf(hit.note)] || copies[0];
    pr.sel = new Set(copies);
    notes = copies;
  }
  dragNotes(e, start, notes, hit.edge, anchor);
}

function dragNotes(e, start, notes, mode, anchor) {
  const f = cur(); if (!f) return;
  const { clip, track } = f;
  const orig = notes.map(n => ({ n, t: n.t, p: n.p, d: n.d }));
  const a0 = orig.find(o => o.n === anchor) || orig[0];
  const minT = Math.min(...orig.map(o => o.t));
  let lastP = a0.n.p;
  const move = ev => {
    const { x, y } = local(ev);
    const on = pr.snap && !ev.altKey;
    const db = bOf(x - start.x);
    if (mode === 'r') {
      for (const o of orig) o.n.d = Math.max(pr.grid / 2, snapB(o.d + db, on) || pr.grid);
      pr.lastLen = Math.max(pr.grid / 2, snapB(a0.d + db, on) || pr.grid);
    } else {
      // 以「被抓住的那顆音符」對齊格線
      const nt = snapB(a0.t + db, on);
      const dt = Math.max(-minT, nt - a0.t);
      const dp = pOf(y) - pOf(start.y);
      const lo = Math.min(...orig.map(o => o.p)), hi = Math.max(...orig.map(o => o.p));
      const dpc = clamp(dp, LOW - lo, HIGH - hi);
      for (const o of orig) { o.n.t = o.t + dt; o.n.p = o.p + dpc; }
      if (a0.n.p !== lastP) { lastP = a0.n.p; engine.audition(track.id, a0.n.p, a0.n.v, 0.2); }
    }
    draw();
  };
  const up = () => {
    wrap.removeEventListener('pointermove', move);
    wrap.removeEventListener('pointerup', up);
    growClip(clip);
    store.changed('structure');
  };
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

function startMarquee(e, start) {
  const f = cur(); if (!f) return;
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
  const up = () => {
    marquee = null;
    wrap.removeEventListener('pointermove', move);
    wrap.removeEventListener('pointerup', up);
    draw();
  };
  if (!e.shiftKey) { pr.sel = new Set(); draw(); }
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

// 橡皮擦：點或拖過就刪（只留一個還原點）
function dragDelete(e, start) {
  const f = cur(); if (!f) return;
  const kill = new Set();
  pr.erasing = kill;
  const hit = hitAt(start.x, start.y);
  let begun = false;
  const eat = (x, y) => {
    const h = hitAt(x, y);
    if (!h || kill.has(h.note)) return false;
    if (!begun) { store.checkpoint(); begun = true; }
    kill.add(h.note);
    return true;
  };
  if (hit) eat(start.x, start.y);
  const move = ev => { const { x, y } = local(ev); if (eat(x, y)) draw(); };
  const up = () => {
    wrap.removeEventListener('pointermove', move);
    wrap.removeEventListener('pointerup', up);
    pr.erasing = null;
    if (!kill.size) { draw(); return; }
    f.clip.notes = f.clip.notes.filter(n => !kill.has(n));
    pr.notesRef = f.clip.notes;
    pr.sel = new Set([...pr.sel].filter(n => !kill.has(n)));
    store.changed('structure');
    toast(`已刪除 ${kill.size} 個音符`);
  };
  if (kill.size) draw();
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

// 剪刀：在點到的位置切開；拖過其他音符也會切
function dragSplit(e, start, hit) {
  const f = cur(); if (!f) return;
  const done = new Set();
  let checkpointed = false;
  const cut = (x, y) => {
    const h = hitAt(x, y);
    if (!h || done.has(h.note)) return false;
    const beat = snapB(bOf(x));
    const n = h.note;
    if (beat <= n.t + 1e-4 || beat >= n.t + n.d - 1e-4) return false;
    if (!checkpointed) { store.checkpoint(); checkpointed = true; }
    done.add(n);
    const copy = { ...n, t: beat, d: n.t + n.d - beat };
    n.d = beat - n.t;
    f.clip.notes.push(copy);
    return true;
  };
  if (cut(start.x, start.y)) { growClip(f.clip); pr.notesRef = f.clip.notes; draw(); }
  const move = ev => { const { x, y } = local(ev); if (cut(x, y)) { pr.notesRef = f.clip.notes; draw(); } };
  const up = () => {
    wrap.removeEventListener('pointermove', move);
    wrap.removeEventListener('pointerup', up);
    if (!done.size) return;
    growClip(f.clip);
    store.changed('structure');
    toast(`已切開 ${done.size} 個音符`);
  };
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

// 靜音筆
function dragMute(e, hit) {
  if (!hit) return;
  const f = cur(); if (!f) return;
  const target = pr.sel.has(hit.note) && pr.sel.size > 1 ? [...pr.sel] : [hit.note];
  store.checkpoint();
  const on = !target[0].m;
  for (const n of target) { if (on) n.m = 1; else delete n.m; }
  store.changed('structure');
  toast(on ? `已靜音 ${target.length} 個音符` : `已取消靜音 ${target.length} 個音符`);
}

// 力度筆：上下拖曳改力度
function dragVelocityPen(e, start, hit) {
  if (!hit) return;
  const f = cur(); if (!f) return;
  const target = pr.sel.has(hit.note) && pr.sel.size > 1 ? [...pr.sel] : [hit.note];
  store.checkpoint();
  const orig = target.map(n => n.v);
  const y0 = e.clientY;
  const move = ev => {
    const dv = Math.round((y0 - ev.clientY) * 1.4);
    target.forEach((n, i) => { n.v = clamp(orig[i] + dv, 1, 127); });
    $('prVel').value = target[0].v;
    draw();
  };
  const up = () => {
    wrap.removeEventListener('pointermove', move);
    wrap.removeEventListener('pointerup', up);
    store.changed('structure');
  };
  engine.audition(f.track.id, hit.note.p, hit.note.v, 0.25);
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', up);
}

// 點琴鍵：試聽＋選取這個音高的所有音符
function onKeysDown(e) {
  const f = cur(); if (!f) return;
  const r = keysCv.getBoundingClientRect();
  const p = pOf(e.clientY - r.top + wrap.scrollTop);
  engine.noteOn(f.track.id, p, 100);
  const up = () => { engine.noteOff(f.track.id, p); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointerup', up);
  const same = f.clip.notes.filter(n => n.p === p);
  if (e.shiftKey || e.ctrlKey || e.metaKey) for (const n of same) pr.sel.add(n);
  else pr.sel = new Set(same);
  draw();
}

// ---------------- 力度條 ----------------
function velFromY(clientY, top) {
  return clamp(Math.round((1 - (clientY - top) / VEL_H) * 127 * 1.04), 1, 127);
}

function bindVelocityLane() {
  velCv.addEventListener('pointermove', e => { if (!e.buttons) velCv.style.cursor = 'ns-resize'; });
}

function onVelDown(e) {
  const f = cur(); if (!f) return;
  try { velCv.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件 */ }
  const r = velCv.getBoundingClientRect();
  const x0 = e.clientX - r.left + wrap.scrollLeft;
  const near = f.clip.notes.filter(n => Math.abs(xOf(n.t) - x0) < 7);
  const useSel = pr.sel.size && near.some(n => pr.sel.has(n));
  const target = useSel ? [...pr.sel] : near;
  if (!target.length) return;
  store.checkpoint();
  const orig = target.map(n => n.v);
  const v0 = velFromY(e.clientY, r.top);
  const apply = ev => {
    const vel = velFromY(ev.clientY, r.top);
    if (ev.shiftKey) target.forEach((n, i) => { n.v = clamp(Math.round(orig[i] + (vel - v0)), 1, 127); });
    else target.forEach(n => { n.v = vel; });
    $('prVel').value = vel;
    draw();
  };
  apply(e);
  const up = () => {
    velCv.removeEventListener('pointermove', apply);
    velCv.removeEventListener('pointerup', up);
    store.changed('structure');
  };
  velCv.addEventListener('pointermove', apply);
  velCv.addEventListener('pointerup', up);
}

// ---------------- 踏板列 ----------------
function setSpans(clip, spans) {
  spans = spans.filter(([a, z]) => z - a > 1e-3).sort((x, y) => x[0] - y[0]);
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

function bindPedalLane() {
  pedCv.addEventListener('pointerdown', onPedDown);
  pedCv.addEventListener('contextmenu', onPedContext);
  pedCv.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const h = pedHit(e);
    pedCv.style.cursor = h ? (h.edge ? 'ew-resize' : 'grab') : 'copy';
  });
}

function onPedDown(e) {
  if (e.button !== 0) return;
  const f = cur(); if (!f) return;
  try { pedCv.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件 */ }
  const r = pedCv.getBoundingClientRect();
  const toB = cx => Math.max(0, Math.min(f.clip.lengthBeats, snapB(bOf(cx - r.left + wrap.scrollLeft), !e.altKey)));
  store.checkpoint();
  let h = pedHit(e);
  let spans = h ? h.spans : pedalSpans(f.clip);
  if (!h) {
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
  const up = () => {
    pedCv.removeEventListener('pointermove', move);
    pedCv.removeEventListener('pointerup', up);
    store.changed('structure');
  };
  pedCv.addEventListener('pointermove', move);
  pedCv.addEventListener('pointerup', up);
  setSpans(f.clip, spans);
  draw();
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

// ---------------- 右鍵選單 ----------------
function closeCtx() { const el = $('prCtx'); if (el) el.remove(); }

function menuFill(el, items) {
  el.innerHTML = '';
  for (const it of items) {
    if (it === '-') { const s = document.createElement('div'); s.className = 'pr-ctx-sep'; el.appendChild(s); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pr-ctx-i';
    b.textContent = it.label;
    if (it.disabled) b.disabled = true;
    b.onclick = () => { closeCtx(); closeMenu(); it.action(); };
    el.appendChild(b);
  }
}

// 選單每次都重新建立一個節點：同一個 fixed 節點從 display:none 變回可見時，
// 無頭 Chrome 常常整塊不重畫（真人瀏覽器也可能踩到同類的合成層問題），換新節點最保險。
function placeMenu(el, x, y) {
  el.style.left = Math.round(Math.max(8, Math.min(x, innerWidth - el.offsetWidth - 8))) + 'px';
  el.style.top = Math.round(Math.max(8, Math.min(y, innerHeight - el.offsetHeight - 8))) + 'px';
}

function openContext(e) {
  const f = cur(); if (!f) return;
  const { x, y } = local(e);
  const hit = hitAt(x, y);
  if (hit && !pr.sel.has(hit.note)) { pr.sel = new Set([hit.note]); draw(); }
  const items = [];
  if (hit) {
    const beat = snapB(bOf(x));
    const n = hit.note;
    items.push({ label: UI.cSplit, action: () => splitNoteAt(n, beat) });
    items.push({ label: UI.cJoin, action: joinSelected, disabled: pr.sel.size < 2 });
    items.push({ label: n.m ? '取消靜音' : UI.cMute, action: () => { store.checkpoint(); if (n.m) delete n.m; else n.m = 1; store.changed('structure'); } });
    items.push('-');
    items.push({ label: UI.cQuant, action: () => { store.checkpoint(); quantizeNotes([n], 1, 50, false); store.changed('structure'); } });
    items.push({ label: `${UI.cVelSet} 100`, action: () => { store.checkpoint(); for (const k of pr.sel) k.v = 100; store.changed('structure'); } });
    items.push('-');
    items.push({ label: UI.cSelPitch, action: () => { pr.sel = new Set(f.clip.notes.filter(k => k.p === n.p)); draw(); } });
    items.push({ label: UI.cCopy, action: () => copyNotes(false) });
    items.push({ label: UI.cDel, action: () => deleteNotes() });
  } else {
    items.push({ label: UI.cPaste, action: () => pasteNotes(), disabled: !pr.clipboard });
    items.push({ label: UI.cSelAll, action: selectAllNotes });
    items.push({ label: UI.cSelNone, action: () => { pr.sel = new Set(); draw(); } });
  }
  closeCtx();
  const el = document.createElement('div');
  el.id = 'prCtx';
  el.className = 'pr-ctx';
  menuFill(el, items);
  document.body.appendChild(el);
  placeMenu(el, e.clientX, e.clientY);
}

// ---------------- 功能選單 ----------------
function closeMenu() {
  pr.menuOpen = false;
  const el = $('prMenu');
  if (el) el.remove();
}

function openMenu() {
  if (pr.menuOpen) { closeMenu(); return; }
  const el = renderFxMenu();
  const b = $('prFx').getBoundingClientRect();
  pr.menuOpen = true;
  placeMenu(el, b.left, b.bottom + 4);
}

function renderFxMenu() {
  const keyOpts = PC.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  const scaleOpts = SCALE_NAMES.map(([id, n]) => `<option value="${id}">${n}</option>`).join('');
  const el = document.createElement('div');
  el.id = 'prMenu';
  el.className = 'pr-menu';
  el.innerHTML = `
    <div class="pr-msec">
      <h5>${UI.mQuantize}</h5>
      <label class="pr-mrow">${UI.mStrength} <input type="range" id="qzStrength" min="0" max="100" value="100"><b id="qzStrengthV">100%</b></label>
      <label class="pr-mrow">${UI.mSwing} <input type="range" id="qzSwing" min="50" max="75" value="50"><b id="qzSwingV">50%</b></label>
      <label class="pr-mchk"><input type="checkbox" id="qzLen"> ${UI.mQLen}</label>
      <button type="button" class="tbtn pr-mbtn" id="qzApply">${UI.mQApply}</button>
    </div>
    <div class="pr-msec">
      <h5>${UI.mHuman}</h5>
      <div class="pr-mrow3">
        <label>${UI.mPos} <input type="number" id="humPos" value="10" min="0" max="100" style="width:44px">%</label>
        <label>${UI.mLen} <input type="number" id="humLen" value="10" min="0" max="100" style="width:44px">%</label>
        <label>${UI.mVelHum} <input type="number" id="humVel" value="10" min="0" max="60" style="width:44px">±</label>
      </div>
      <button type="button" class="tbtn pr-mbtn" id="humApply">${UI.mHumApply}</button>
    </div>
    <div class="pr-msec">
      <h5>${UI.mVel}</h5>
      <div class="pr-mrow3">
        <input type="number" id="velNum" value="100" min="1" max="127" style="width:48px">
        <button type="button" class="tbtn" id="velSet">${UI.mVelSet}</button>
        <button type="button" class="tbtn" id="velAdd">${UI.mVelAdd}</button>
        <button type="button" class="tbtn" id="velSub">${UI.mVelSub}</button>
      </div>
      <div class="pr-mrow3">
        <button type="button" class="tbtn" id="velCresc">${UI.mCresc}</button>
        <button type="button" class="tbtn" id="velDecresc">${UI.mDecresc}</button>
      </div>
    </div>
    <div class="pr-msec">
      <h5>${UI.mTranspose}</h5>
      <div class="pr-mrow3">
        <input type="number" id="trSemi" value="0" min="-48" max="48" style="width:48px">
        <button type="button" class="tbtn" id="trApply">${UI.mApply}</button>
        <button type="button" class="tbtn" id="trOctUp">＋12</button>
        <button type="button" class="tbtn" id="trOctDown">−12</button>
      </div>
      <div class="pr-mrow3">
        <select id="scaleRoot">${keyOpts}</select>
        <select id="scaleType">${scaleOpts}</select>
        <button type="button" class="tbtn" id="scaleApply">${UI.mScale}</button>
      </div>
    </div>
    <div class="pr-msec">
      <h5>${UI.mLenTools}</h5>
      <div class="pr-mrow3">
        <button type="button" class="tbtn" id="lenGrid">${UI.mLenGrid}</button>
        <button type="button" class="tbtn" id="lenLegato">${UI.mLenLegato}</button>
      </div>
      <div class="pr-mrow3">
        <button type="button" class="tbtn" id="lenDouble">${UI.mLenDouble}</button>
        <button type="button" class="tbtn" id="lenHalf">${UI.mLenHalf}</button>
      </div>
    </div>
    <div class="pr-msec">
      <h5>${UI.mTime}</h5>
      <div class="pr-mrow3">
        <button type="button" class="tbtn" id="txReverse">${UI.mReverse}</button>
        <button type="button" class="tbtn" id="txInvert">${UI.mInvert}</button>
      </div>
      <div class="pr-mrow3">
        <button type="button" class="tbtn" id="txDouble">${UI.mDouble}</button>
        <button type="button" class="tbtn" id="txHalf">${UI.mHalf}</button>
      </div>
    </div>
    <div class="pr-msec">
      <h5>${UI.mSelect}</h5>
      <div class="pr-mrow3">
        <button type="button" class="tbtn" id="selAll">${UI.mSelAll}</button>
        <button type="button" class="tbtn" id="selPitch">${UI.mSelPitch}</button>
        <button type="button" class="tbtn" id="selInv">${UI.mSelInv}</button>
      </div>
    </div>
    <div class="pr-msec">
      <h5>${UI.mView}</h5>
      <div class="pr-mrow3">
        <label>${UI.lColor} <select id="viewColor">
          <option value="track">${UI.cTrack}</option><option value="vel">${UI.cVel}</option><option value="pitch">${UI.cPitch}</option>
        </select></label>
        <label>${UI.lLabel} <select id="viewLabel">
          <option value="name">${UI.nName}</option><option value="vel">${UI.nVel}</option>
          <option value="len">${UI.nLen}</option><option value="none">${UI.nNone}</option>
        </select></label>
      </div>
      <label class="pr-mrow">${UI.mRowH} <input type="range" id="viewRowH" min="6" max="28" value="12"><b id="viewRowHV">12</b></label>
    </div>`;

  document.body.appendChild(el);   // 先掛上去：下面的 $() 與寬高量測都要它在文件裡
  $('qzStrength').oninput = e => { pr.menu.strength = +e.target.value; $('qzStrengthV').textContent = e.target.value + '%'; };
  $('qzSwing').oninput = e => { pr.menu.swing = +e.target.value; $('qzSwingV').textContent = e.target.value + '%'; };
  $('qzLen').onchange = e => { pr.menu.withLen = e.target.checked; };
  $('humPos').oninput = e => { pr.menu.pos = +e.target.value; };
  $('humLen').oninput = e => { pr.menu.len = +e.target.value; };
  $('humVel').oninput = e => { pr.menu.humVel = +e.target.value; };
  $('velNum').oninput = e => { pr.menu.velNum = +e.target.value; };
  $('trSemi').oninput = e => { pr.menu.semi = +e.target.value; };
  $('qzApply').onclick = () => applyQuantize();
  $('humApply').onclick = () => applyHumanize();
  $('velSet').onclick = () => velocityOp(Number($('velNum').value), 'set');
  $('velAdd').onclick = () => velocityOp(Math.abs(Number($('velNum').value)) || 10, 'add');
  $('velSub').onclick = () => velocityOp(-(Math.abs(Number($('velNum').value)) || 10), 'add');
  $('velCresc').onclick = () => velocityRamp(true);
  $('velDecresc').onclick = () => velocityRamp(false);
  $('trApply').onclick = () => transpose(Number($('trSemi').value) || 0);
  $('trOctUp').onclick = () => transpose(12);
  $('trOctDown').onclick = () => transpose(-12);
  $('scaleApply').onclick = () => {
    pr.scaleRoot = Number($('scaleRoot').value) || 0;
    pr.scaleType = $('scaleType').value;
    savePrefs();
    quantizeToScale();
  };
  $('lenGrid').onclick = () => { edit(ns => { for (const n of ns) n.d = Math.max(pr.grid / 2, pr.grid); }, '長度已設為格線'); };
  $('lenLegato').onclick = legato;
  $('lenDouble').onclick = () => { edit(ns => { for (const n of ns) n.d = Math.min(64, n.d * 2); }, '長度 ×2'); };
  $('lenHalf').onclick = () => { edit(ns => { for (const n of ns) n.d = Math.max(pr.grid / 2, n.d / 2); }, '長度 ÷2'); };
  $('txReverse').onclick = reverseNotes;
  $('txInvert').onclick = invertPitch;
  $('txDouble').onclick = () => timeScale(0.5, '速度 ×2');
  $('txHalf').onclick = () => timeScale(2, '速度 ÷2');
  $('selAll').onclick = () => { selectAllNotes(); closeMenu(); };
  $('selPitch').onclick = selectSamePitch;
  $('selInv').onclick = () => {
    const f = cur(); if (!f) return;
    const keep = new Set(pr.sel);
    pr.sel = new Set(f.clip.notes.filter(n => !keep.has(n)));
    draw();
  };
  $('viewColor').onchange = e => { pr.color = e.target.value; savePrefs(); draw(); };
  $('viewLabel').onchange = e => { pr.label = e.target.value; savePrefs(); draw(); };
  $('viewRowH').oninput = e => {
    pr.rowH = Number(e.target.value);
    $('viewRowHV').textContent = String(pr.rowH);
    savePrefs(); layout();
  };
  // 選單裡的輸入框不要讓全域快捷鍵吃掉
  el.addEventListener('keydown', e => e.stopPropagation());
  el.addEventListener('pointerdown', e => e.stopPropagation());
  // 上次用過的值（關掉再開還在）
  const M = pr.menu;
  $('qzStrength').value = M.strength; $('qzStrengthV').textContent = M.strength + '%';
  $('qzSwing').value = M.swing; $('qzSwingV').textContent = M.swing + '%';
  $('qzLen').checked = M.withLen;
  $('humPos').value = M.pos; $('humLen').value = M.len; $('humVel').value = M.humVel;
  $('velNum').value = M.velNum;
  $('trSemi').value = M.semi;
  $('scaleRoot').value = String(pr.scaleRoot);
  $('scaleType').value = pr.scaleType;
  $('viewColor').value = pr.color;
  $('viewLabel').value = pr.label;
  $('viewRowH').value = String(pr.rowH);
  $('viewRowHV').textContent = String(pr.rowH);
  return el;
}

// ---------------- 編輯動作 ----------------
function targets() {
  const f = cur(); if (!f) return [];
  return pr.sel.size ? [...pr.sel] : f.clip.notes;
}

function growClip(clip) {
  const maxEnd = Math.max(0, ...clip.notes.map(n => n.t + n.d));
  if (maxEnd > clip.lengthBeats) clip.lengthBeats = Math.ceil(maxEnd / store.project.sigNum) * store.project.sigNum;
}

// 包一次還原點 + 重畫 + 提示；fn 拿到的是「要處理的音符」
function edit(fn, msg, all = false) {
  const f = cur(); if (!f) return 0;
  const ns = all ? f.clip.notes : targets();
  if (!ns.length) return 0;
  store.checkpoint();
  fn(ns, f);
  growClip(f.clip);
  pr.notesRef = f.clip.notes;
  store.changed('structure');
  if (msg) toast(`${msg}（${ns.length} 個音符）`);
  return ns.length;
}

// 量化：strength 0–1、swing 50–75（延後每個格子裡的第二下）
function quantizeNotes(ns, strength, swing, withLen) {
  for (const n of ns) {
    const t = quantTarget(n.t, pr.grid, swing);
    n.t = Math.max(0, n.t + (t - n.t) * strength);
    if (withLen) {
      const end = quantTarget(n.t + n.d, pr.grid, swing);
      const q = Math.max(pr.grid / 2, end - n.t);
      n.d = n.d + (q - n.d) * strength;
    }
  }
}

function quantTarget(t, grid, swing) {
  const g = Math.max(1e-6, grid);
  const i = Math.round(t / g);
  // Swing：奇數格往後延，50 = 正拍、66.7 約等於三連音
  const off = i % 2 ? (swing - 50) / 50 * g : 0;
  return Math.max(0, i * g + off);
}

function applyQuantize() {
  const strength = Number($('qzStrength').value) / 100;
  const swing = Number($('qzSwing').value);
  const withLen = $('qzLen').checked;
  edit(ns => quantizeNotes(ns, strength, swing, withLen), '已量化');
  closeMenu();
}

// 快速量化：Q 或工具列
export function quantize() {
  const f = cur(); if (!f) return;
  const ns = targets();
  if (!ns.length) return;
  store.checkpoint();
  quantizeNotes(ns, 1, 50, false);
  growClip(f.clip);
  store.changed('structure');
  toast(`已量化 ${ns.length} 個音符`);
}

function applyHumanize() {
  const pos = Number($('humPos').value) / 100;
  const len = Number($('humLen').value) / 100;
  const vel = Number($('humVel').value);
  edit(ns => {
    for (const n of ns) {
      n.t = Math.max(0, n.t + rnd(pos * pr.grid));
      n.d = Math.max(pr.grid / 2, n.d + rnd(len * pr.grid));
      n.v = clamp(Math.round(n.v + rnd(vel)), 1, 127);
    }
  }, '已打散');
  closeMenu();
}

function velocityOp(value, mode) {
  edit(ns => {
    for (const n of ns) n.v = clamp(mode === 'set' ? value : n.v + value, 1, 127);
  }, mode === 'set' ? `力度設為 ${value}` : `力度 ${value > 0 ? '+' : ''}${value}`);
}

function velocityRamp(up) {
  const f = cur(); if (!f) return;
  const ns = targets().slice().sort((a, b) => a.t - b.t);
  if (ns.length < 2) { toast('至少要選兩個音符才畫得出漸強／漸弱', 'warn'); return; }
  store.checkpoint();
  const vs = ns.map(n => n.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = Math.max(1, ns.length - 1);
  ns.forEach((n, i) => {
    const k = i / span;
    n.v = Math.round(up ? lo + (hi - lo) * k : hi - (hi - lo) * k);
  });
  store.changed('structure');
  toast(up ? '已做出漸強' : '已做出漸弱');
  closeMenu();
}

export function legato() {
  const f = cur(); if (!f) return;
  const ns = targets().slice();
  if (ns.length < 1) return;
  store.checkpoint();
  const byPitch = new Map();
  for (const n of ns) { if (!byPitch.has(n.p)) byPitch.set(n.p, []); byPitch.get(n.p).push(n); }
  for (const list of byPitch.values()) {
    list.sort((a, b) => a.t - b.t);
    for (let i = 0; i + 1 < list.length; i++) {
      const gap = list[i + 1].t - list[i].t;
      if (gap > 0) list[i].d = gap;
    }
  }
  growClip(f.clip);
  store.changed('structure');
  toast(`已連音 ${ns.length} 個音符`);
  closeMenu();
}

function reverseNotes() {
  edit(ns => {
    const a0 = Math.min(...ns.map(n => n.t)), a1 = Math.max(...ns.map(n => n.t + n.d));
    for (const n of ns) n.t = a0 + (a1 - (n.t + n.d));
  }, '已反轉');
}

function invertPitch() {
  edit(ns => {
    const ps = ns.map(n => n.p);
    const pivot = (Math.min(...ps) + Math.max(...ps)) / 2;
    for (const n of ns) n.p = clamp(Math.round(2 * pivot - n.p), LOW, HIGH);
  }, '已倒影');
}

function timeScale(k, msg) {
  edit(ns => {
    const a0 = Math.min(...ns.map(n => n.t));
    for (const n of ns) { n.t = Math.max(0, a0 + (n.t - a0) * k); n.d = Math.max(pr.grid / 2, n.d * k); }
  }, msg);
}

export function transpose(semi) {
  if (!semi) return;
  edit(ns => { for (const n of ns) n.p = clamp(n.p + semi, LOW, HIGH); });
}

function quantizeToScale() {
  const set = new Set((SCALES[pr.scaleType] || SCALES.major).map(x => (x + pr.scaleRoot) % 12));
  edit(ns => {
    for (const n of ns) {
      let best = n.p, bd = 99;
      for (let k = n.p - 6; k <= n.p + 6; k++) {
        if (!set.has(((k % 12) + 12) % 12)) continue;
        const d = Math.abs(k - n.p);
        if (d < bd) { bd = d; best = k; }
      }
      n.p = clamp(best, LOW, HIGH);
    }
  }, '已對齊音階');
  closeMenu();
}

function setVelocity(v) {
  const ns = [...pr.sel];
  if (!ns.length) return;
  store.checkpoint();
  for (const n of ns) n.v = clamp(v, 1, 127);
  store.changed('structure');
}

export function deleteNotes(list = [...pr.sel]) {
  const f = cur(); if (!f || !list.length) return false;
  store.checkpoint();
  const kill = new Set(list);
  f.clip.notes = f.clip.notes.filter(n => !kill.has(n));
  pr.notesRef = f.clip.notes;
  pr.sel = new Set();
  store.changed('structure');
  return true;
}

export function selectAllNotes() {
  const f = cur(); if (!f) return;
  pr.sel = new Set(f.clip.notes);
  draw();
}

export function selectSamePitch() {
  const f = cur(); if (!f || !pr.sel.size) { toast('先選一顆音符', 'warn'); return; }
  const ps = new Set([...pr.sel].map(n => n.p));
  pr.sel = new Set(f.clip.notes.filter(n => ps.has(n.p)));
  draw();
  closeMenu();
}

function splitNoteAt(note, beat) {
  const f = cur(); if (!f) return;
  if (beat <= note.t + 1e-4 || beat >= note.t + note.d - 1e-4) { toast('切的位置要在音符裡面', 'warn'); return; }
  store.checkpoint();
  const copy = { ...note, t: beat, d: note.t + note.d - beat };
  note.d = beat - note.t;
  f.clip.notes.push(copy);
  pr.notesRef = f.clip.notes;
  growClip(f.clip);
  store.changed('structure');
}

export function splitAtPlayhead() {
  const f = cur(); if (!f) return;
  const t = engine.currentTime() / spb() - f.clip.startBeat;
  const pool = pr.sel.size ? [...pr.sel] : f.clip.notes;
  const ns = pool.filter(n => t > n.t + 1e-3 && t < n.t + n.d - 1e-3);
  if (!ns.length) { toast('把播放頭移到要切開的音符上（或用剪刀工具直接點音符）', 'warn'); return; }
  store.checkpoint();
  const add = [];
  for (const n of ns) { const copy = { ...n, t, d: n.t + n.d - t }; n.d = t - n.t; add.push(copy); }
  f.clip.notes.push(...add);
  pr.notesRef = f.clip.notes;
  pr.sel = new Set(ns.concat(add));
  growClip(f.clip);
  store.changed('structure');
  toast(`已把 ${ns.length} 個音符切開`);
}

export function joinSelected() {
  const f = cur(); if (!f || pr.sel.size < 2) { toast('先選取同一個音高的兩顆以上音符', 'warn'); return; }
  const byPitch = new Map();
  for (const n of [...pr.sel]) { if (!byPitch.has(n.p)) byPitch.set(n.p, []); byPitch.get(n.p).push(n); }
  const groups = [...byPitch.values()].filter(g => g.length > 1);
  if (!groups.length) { toast('合併需要同一個音高的音符', 'warn'); return; }
  store.checkpoint();
  let merged = 0;
  for (const list of groups) {
    list.sort((a, b) => a.t - b.t);
    const first = list[0];
    const end = Math.max(...list.map(n => n.t + n.d));
    const kill = new Set(list.slice(1));
    f.clip.notes = f.clip.notes.filter(n => !kill.has(n));
    first.d = end - first.t;
    merged += kill.size;
  }
  pr.notesRef = f.clip.notes;
  pr.sel = new Set([...pr.sel].filter(n => f.clip.notes.includes(n)));
  growClip(f.clip);
  store.changed('structure');
  toast(`已合併 ${merged} 顆音符`);
  closeMenu();
}

export function copyNotes(cut) {
  const f = cur();
  if (!f || !pr.sel.size) { toast('先選取音符', 'warn'); return false; }
  const ns = [...pr.sel].sort((a, b) => a.t - b.t);
  const at = Math.min(...ns.map(n => n.t));
  const notes = ns.map(n => ({ p: n.p, t: n.t - at, d: n.d, v: n.v }));
  pr.clipboard = { at, notes };
  if (cut) deleteNotes(ns);
  toast(`${cut ? '已剪下' : '已複製'} ${ns.length} 個音符`);
  return true;
}

export function pasteNotes() {
  const f = cur(); const cb = pr.clipboard;
  if (!f || !cb) return false;
  store.checkpoint();
  const ph = engine.currentTime() / spb() - f.clip.startBeat;
  const at = ph >= 0 && ph <= f.clip.lengthBeats ? snapB(ph) : cb.at;
  const added = cb.notes.map(o => ({ ...o, t: Math.max(0, at + o.t) }));
  f.clip.notes.push(...added);
  pr.notesRef = f.clip.notes;
  pr.sel = new Set(added);
  growClip(f.clip);
  store.changed('structure');
  toast(`已貼上 ${added.length} 個音符`);
  return true;
}

export function duplicateNotes() {
  const f = cur(); if (!f || !pr.sel.size) return false;
  const ns = [...pr.sel];
  const a0 = Math.min(...ns.map(n => n.t)), a1 = Math.max(...ns.map(n => n.t + n.d));
  store.checkpoint();
  const copies = ns.map(n => ({ ...n, t: n.t + (a1 - a0) }));
  f.clip.notes.push(...copies);
  pr.notesRef = f.clip.notes;
  pr.sel = new Set(copies);
  growClip(f.clip);
  store.changed('structure');
  toast(`已重複 ${copies.length} 個音符`);
  return true;
}

export function toggleMuteSelected() {
  if (!pr.sel.size) return false;
  store.checkpoint();
  const ns = [...pr.sel];
  const on = !ns.every(n => n.m);
  for (const n of ns) { if (on) n.m = 1; else delete n.m; }
  store.changed('structure');
  toast(on ? `已靜音 ${ns.length} 個音符` : `已取消靜音 ${ns.length} 個音符`);
  return true;
}

// ---------------- 鍵盤 ----------------
export function handleKey(e) {
  if (!isOpen() || root.classList.contains('hidden')) return false;
  if (e.target && e.target.closest && e.target.closest('input, select, textarea')) return false;
  if (!(root.matches(':hover') || root.contains(document.activeElement))) return false;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  const run = fn => { e.preventDefault(); fn(); return true; };

  if (k === 'escape') {
    if ($('prCtx') || pr.menuOpen) { closeCtx(); closeMenu(); return true; }
    if (pr.sel.size) { pr.sel = new Set(); draw(); return true; }
    close(); return true;
  }
  // 工具：1–7
  if (!mod && /^[1-7]$/.test(e.key)) { setTool(['pointer', 'pencil', 'eraser', 'scissors', 'glue', 'mute', 'velocity'][+e.key - 1]); return true; }

  if (k === 'delete' || k === 'backspace') return run(() => deleteNotes());
  if (mod && k === 'a') return run(selectAllNotes);
  if (mod && k === 'c') return run(() => copyNotes(false));
  if (mod && k === 'x') return run(() => copyNotes(true));
  if (mod && k === 'v') return run(pasteNotes);
  if (mod && k === 'd') return run(duplicateNotes);
  if (mod && k === 'm') return run(toggleMuteSelected);
  if (mod && k === 'j') return run(joinSelected);
  if (mod && k === 't') return run(splitAtPlayhead);
  if (!mod && k === 'q') return run(quantize);
  if (!mod && k === 'l') return run(legato);
  if (!mod && k === 'f') return run(fitView);
  if (!mod && k === 'arrowup') return run(() => transpose(e.shiftKey ? 12 : 1));
  if (!mod && k === 'arrowdown') return run(() => transpose(e.shiftKey ? -12 : -1));
  if (!mod && (k === 'arrowleft' || k === 'arrowright')) {
    return run(() => {
      const ns = [...pr.sel]; if (!ns.length) return;
      store.checkpoint();
      const d = (k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? store.project.sigNum : pr.grid);
      for (const n of ns) n.t = Math.max(0, n.t + d);
      store.changed('structure');
    });
  }
  return false;
}

// 把畫面捲到看得到全部音符
function fitView() {
  const f = cur(); if (!f) return;
  const notes = f.clip.notes;
  if (!notes.length) return;
  const lo = Math.min(...notes.map(n => n.p)), hi = Math.max(...notes.map(n => n.p));
  const c = (lo + hi) / 2;
  wrap.scrollTop = Math.max(0, yOf(c) - wrap.clientHeight / 2);
  const end = Math.max(...notes.map(n => n.t + n.d));
  const span = Math.max(4, end - Math.min(...notes.map(n => n.t)) + 2);
  pr.pxPerBeat = clamp(wrap.clientWidth / span, 12, 480);
  savePrefs(); layout();
  wrap.scrollLeft = Math.max(0, xOf(Math.min(...notes.map(n => n.t))) - 20);
  draw();
}

// ---------------- 每幀 ----------------
export function tick() { if (isOpen() && engine.playing) draw(); }

export function currentClipId() { return pr.clipId; }
export const clipStartSec = () => { const f = cur(); return f ? clipStart(f.clip) : 0; };
