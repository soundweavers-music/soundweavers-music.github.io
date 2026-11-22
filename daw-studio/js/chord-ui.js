// 和弦軌：自動偵測、顯示（音名／級數／首調）、逐格編輯，並套用到人聲修音與 Harmony
// 和弦存成「拍」：[{ t, d, root, q }]，跟隨 BPM 移動；project.chordKey = { key, minor }
import { store, isMidiClip } from './state.js';
import { detectChords, ROOTS, QUALITIES, chordName, chordPcs, diatonicChord } from './chords.js';
import { toast } from './util.js';
import { scaleMask } from './effects.js';

const QI = Object.fromEntries(QUALITIES.map((q, i) => [q.id, i]));
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SOLFA = ['1', '2', '3', '4', '5', '6', '7'];
const VIEW_NAMES = ['音名', '級數', '首調（簡譜）'];

export const chordsOf = () => (store.project.chords || (store.project.chords = []));
export const chordKeyOf = () => store.project.chordKey || null;

// 一個和弦在目前顯示模式下要寫成什麼
export function chordLabel(c, view = store.project.chordView || 0, key = chordKeyOf()) {
  const name = chordName(c);
  if (!view || !key) return name;
  const steps = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const deg = ((c.root - key.key) % 12 + 12) % 12;
  const i = steps.indexOf(deg);
  const q = QUALITIES[QI[c.q]] || QUALITIES[0];
  const minorish = c.q === 'min' || c.q === 'm7' || c.q === 'dim';
  if (i < 0) return view === 1 ? `♭/♯${name}` : `${name}（調外）`;
  if (view === 1) {
    let s = ROMAN[i];
    if (minorish) s = s.toLowerCase();
    if (c.q === '7') s += '7';
    else if (c.q === 'maj7') s += 'M7';
    else if (c.q === 'dim') s += '°';
    else if (c.q === 'sus4') s += 'sus4';
    else if (c.q === 'sus2') s += 'sus2';
    return s;
  }
  // 首調：數字簡譜，加上和弦性質
  const n = SOLFA[i];
  const suf = c.q === 'maj' ? '' : c.q === 'min' ? 'm' : c.q === '7' ? '⁷' : c.q === 'maj7' ? 'M7' : q.suf;
  return `${n}${suf}`;
}

// ---------------- 顯示 ----------------
export function chordLaneHeight() { return store.project.showChords ? 30 : 0; }

export function drawChordLane(g, W, y0, h, sx, pxPerBeat) {
  const p = store.project;
  if (!p.showChords) return;
  g.save();
  // 跟著主題走：淺色介面不能再用白字／白底
  const css = getComputedStyle(document.documentElement);
  const txCol = (css.getPropertyValue('--cv-ruler-tx') || '#f7e3b8').trim() || '#f7e3b8';
  g.fillStyle = 'rgba(128,128,128,.10)';
  g.fillRect(0, y0, W, h);
  const list = chordsOf();
  if (!list.length) {
    g.globalAlpha = 0.55;
    g.fillStyle = txCol;
    g.font = '11px sans-serif'; g.textAlign = 'left';
    g.fillText('和弦軌：點一下空白處新增和弦，點和弦可以換根音與性質', 8, y0 + h / 2 + 4);
    g.globalAlpha = 1;
  }
  for (const c of list) {
    const x = c.t * pxPerBeat - sx, w = c.d * pxPerBeat;
    if (x + w < 0 || x > W) continue;
    const sel = p.chordSel === c.t + ':' + c.root + ':' + c.q;
    g.fillStyle = sel ? 'rgba(245,184,61,.34)' : 'rgba(245,184,61,.16)';
    g.fillRect(x + 1, y0 + 3, Math.max(1, w - 2), h - 6);
    g.strokeStyle = sel ? 'rgba(245,184,61,.9)' : 'rgba(245,184,61,.4)';
    g.lineWidth = 1;
    g.strokeRect(x + 1.5, y0 + 3.5, Math.max(1, w - 3), h - 7);
    if (w > 22) {
      g.fillStyle = txCol;
      g.font = '600 12px ui-monospace, monospace';
      g.textAlign = 'left';
      g.fillText(chordLabel(c), x + 5, y0 + h / 2 + 4);
    }
  }
  g.restore();
}

// 畫布座標 → 和弦索引（沒有就 -1）
export function chordAt(x, sx, pxPerBeat) {
  const beat = (x + sx) / pxPerBeat;
  const list = chordsOf();
  for (let i = 0; i < list.length; i++) if (beat >= list[i].t && beat < list[i].t + list[i].d) return i;
  return -1;
}

// 尺規的高度（--ruler-h）由 arrange.js 依「段落軌＋和弦軌」一起算，這裡只切開關
export function toggleChordLane(on) {
  const p = store.project;
  p.showChords = on === undefined ? !p.showChords : !!on;
  store.emit('chords', {});
  store.changed('structure');
}

// ---------------- 偵測 ----------------
function referenceTrack() {
  const sel = store.track(store.selection.trackId);
  if (sel && sel.clips.length) return sel;
  const withClips = store.project.tracks.filter(t => t.clips.length);
  // 優先找 MIDI（乾淨、準），再找音訊
  return withClips.find(t => t.kind === 'midi') || withClips[0] || null;
}

export async function detectAndApply(trackId, resolution = 1) {
  const t = trackId ? store.track(trackId) : referenceTrack();
  if (!t) { toast('這一軌沒有片段可以分析', 'warn'); return null; }
  const r = await detectChords(t.id, resolution);
  if (!r.chords.length) { toast('沒有抓到和弦，換一條軌試試（MIDI 軌通常最準）', 'warn'); return null; }
  store.checkpoint();
  store.project.chords = r.chords;
  store.project.chordKey = r.key ? { key: r.key.key, minor: r.key.minor } : null;
  store.project.showChords = true;
  store.changed('structure');
  store.emit('chords', {});
  const kn = r.key ? `${ROOTS[r.key.key]} ${r.key.minor ? '小調' : '大調'}` : '無法判斷調性';
  toast(`抓到 ${r.chords.length} 個和弦（參考：${t.name}；推測 ${kn}）`);
  return r;
}

// ---------------- 編輯 ----------------
// 點和弦軌跳出的小面板：12 個根音 × 9 種性質，加上這一調的七個級數。
// 面板開著時可以一直點（換根音、換性質），整個面板的改動算一次復原。
let panel = null, panelSnap = false, panelTarget = null, panelBeat = 0;
let panelRoot = 0, panelQ = 'maj';

const closeChordPanel = () => {
  if (!panel) return;
  panel.remove(); panel = null; panelTarget = null;
  window.removeEventListener('pointerdown', outsidePanel, true);
  window.removeEventListener('keydown', escPanel, true);
};
const outsidePanel = e => { if (panel && !panel.contains(e.target)) closeChordPanel(); };
const escPanel = e => { if (e.key === 'Escape') { e.stopPropagation(); closeChordPanel(); } };

const barOfBeat = beat => Math.floor(beat / (store.project.sigNum || 4)) + 1;

// 在點到的位置塞一個新和弦：長度到「下一個和弦」或「這一小節結束」
function addChordAt(beat, root, q) {
  const p = store.project, bpb = p.sigNum || 4;
  const list = chordsOf();
  const step = 0.25;
  let t = Math.max(0, Math.round(beat / step) * step);
  const prev = list.filter(c => c.t < t - 1e-6).sort((a, b) => b.t - a.t)[0];
  if (prev && prev.t + prev.d > t) {                 // 點在既有和弦的尾巴上：切給新和弦
    prev.d = Math.max(step, t - prev.t);
  }
  const next = list.filter(c => c.t > t + 1e-6).sort((a, b) => a.t - b.t)[0];
  const end = next ? next.t : Math.ceil((t + 1e-6) / bpb) * bpb;
  const c = { t, d: Math.max(step, end - t), root, q };
  list.push(c);
  list.sort((a, b) => a.t - b.t);
  return c;
}

function paintPanel() {
  if (!panel) return;
  const c = panelTarget;
  panel.querySelector('.cp-name').textContent = chordName(c || { root: panelRoot, q: panelQ });
  panel.querySelector('.cp-pos').textContent = c
    ? `第 ${barOfBeat(c.t)} 小節`
    : `在第 ${barOfBeat(panelBeat)} 小節新增`;
  const root = c ? c.root : panelRoot, q = c ? c.q : panelQ;
  panel.querySelectorAll('.cp-roots [data-root]').forEach(b => b.classList.toggle('on', +b.dataset.root === root));
  panel.querySelectorAll('.cp-quals [data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === q));
  const kind = QUALITIES[QI[q]]?.label || q;
  panel.querySelector('.cp-hint').textContent = c ? `根音 ${ROOTS[root]}・${kind}` : `會新增 ${ROOTS[root]}${QUALITIES[QI[q]].suf}（${kind}）`;
  const only = panel.querySelector('.cp-only');
  if (only) only.hidden = !c;
}

function commitChord(root, q) {
  if (!panelSnap) { store.checkpoint(); panelSnap = true; }
  if (panelTarget) { panelTarget.root = root; panelTarget.q = q; }
  else { panelTarget = addChordAt(panelBeat, root, q); }
  chordsOf().sort((a, b) => a.t - b.t);
  store.changed('structure');
  store.emit('chords', {});
  paintPanel();
}

// x / y 是畫面上的座標（面板位置）；xLocal 是相對於尺規左邊的像素
export function openChordMenu(x, y, xLocal, sx, pxPerBeat) {
  closeChordPanel();
  const p = store.project;
  const key = chordKeyOf();
  const beat = Math.max(0, (xLocal + sx) / pxPerBeat);
  const i = chordAt(xLocal, sx, pxPerBeat);
  panelSnap = false;
  panelBeat = beat;
  panelTarget = i >= 0 ? chordsOf()[i] : null;
  if (panelTarget) { panelRoot = panelTarget.root; panelQ = panelTarget.q; }
  else {
    // 新增：預設是這一調的主和弦（沒有調性就用 C 大三）
    const d = key ? diatonicChord(key.key, key.minor, 0) : { root: 0, q: 'maj' };
    panelRoot = d.root; panelQ = d.q;
  }

  panel = document.createElement('div');
  panel.className = 'chord-panel';
  const degRow = key ? `<div class="cp-lbl">這一調的級數</div>
    <div class="cp-grid cp-degs">${Array.from({ length: 7 }, (_, d) => {
      const c = diatonicChord(key.key, key.minor, d);
      return `<button type="button" data-deg="${d}" data-root="${c.root}" data-q="${c.q}" title="${chordName(c)}"><b>${chordLabel(c, 2)}</b><span>${chordName(c)}</span></button>`;
    }).join('')}</div>` : '';
  panel.innerHTML = `
    <div class="cp-head"><b class="cp-name">—</b><span class="cp-pos"></span><button type="button" class="cp-x" title="關閉">✕</button></div>
    ${degRow}
    <div class="cp-lbl">根音</div>
    <div class="cp-grid cp-roots">${ROOTS.map((r, k) => `<button type="button" data-root="${k}">${r}</button>`).join('')}</div>
    <div class="cp-lbl">性質</div>
    <div class="cp-grid cp-quals">${QUALITIES.map(q => `<button type="button" data-q="${q.id}" title="${q.label}">${q.suf || 'maj'}</button>`).join('')}</div>
    <div class="cp-hint note"></div>
    <div class="cp-acts cp-only">
      <button type="button" data-a="split">切一半</button>
      <button type="button" data-a="merge">合併下一個</button>
      <button type="button" data-a="del" class="danger">刪除</button>
    </div>`;
  document.body.appendChild(panel);
  // 位置：夾在視窗裡
  const r = panel.getBoundingClientRect();
  panel.style.left = Math.max(4, Math.min(x - 12, innerWidth - r.width - 4)) + 'px';
  panel.style.top = Math.max(4, Math.min(y + 14, innerHeight - r.height - 4)) + 'px';

  // 有和弦在手上 = 直接改；還沒有 = 先記下選擇，第一次點就順便把和弦建出來
  panel.querySelectorAll('.cp-roots [data-root]').forEach(b => {
    b.onclick = () => {
      const root = +b.dataset.root;
      if (panelTarget) commitChord(root, panelTarget.q);
      else { panelRoot = root; commitChord(root, panelQ); }
    };
  });
  panel.querySelectorAll('.cp-quals [data-q]').forEach(b => {
    b.onclick = () => {
      if (panelTarget) commitChord(panelTarget.root, b.dataset.q);
      else { panelQ = b.dataset.q; commitChord(panelRoot, panelQ); }
    };
  });
  panel.querySelectorAll('.cp-degs [data-deg]').forEach(b => {
    b.onclick = () => commitChord(+b.dataset.root, b.dataset.q);
  });
  panel.querySelector('.cp-x').onclick = () => closeChordPanel();
  const acts = panel.querySelector('.cp-acts');
  acts.querySelector('[data-a=split]').onclick = () => {
    const c = panelTarget; if (!c) return;
    if (c.d < 1) return toast('這個和弦太短，不能再切', 'warn');
    store.checkpoint();
    const half = Math.round(c.d / 2 * 2) / 2;
    chordsOf().splice(chordsOf().indexOf(c) + 1, 0, { t: c.t + half, d: c.d - half, root: c.root, q: c.q });
    c.d = half;
    chordsOf().sort((a, b) => a.t - b.t);
    panelSnap = true;
    store.changed('structure'); store.emit('chords', {});
    paintPanel();
  };
  acts.querySelector('[data-a=merge]').onclick = () => {
    const c = panelTarget; if (!c) return;
    const list = chordsOf(), n = list[list.indexOf(c) + 1];
    if (!n) return toast('後面沒有和弦可以合併', 'warn');
    store.checkpoint();
    c.d = n.t + n.d - c.t;
    list.splice(list.indexOf(n), 1);
    panelSnap = true;
    store.changed('structure'); store.emit('chords', {});
    paintPanel();
  };
  acts.querySelector('[data-a=del]').onclick = () => {
    const c = panelTarget; if (!c) return;
    store.checkpoint();
    const list = chordsOf();
    list.splice(list.indexOf(c), 1);
    store.changed('structure'); store.emit('chords', {});
    closeChordPanel();
  };
  window.addEventListener('pointerdown', outsidePanel, true);
  window.addEventListener('keydown', escPanel, true);
  paintPanel();
}

// ---------------- 套用到效果器 ----------------
function fxListOf(trackId) {
  const t = store.track(trackId);
  return t ? t.inserts || [] : [];
}

// 和聲：把整條和弦軌塞進 Harmony，並切成「依和弦」
export function applyChordsToHarmony(trackId) {
  const list = chordsOf();
  if (!list.length) return toast('先抓或新增和弦', 'warn');
  const targets = [];
  const t = store.track(trackId);
  for (const d of (t?.inserts || [])) if (d.type === 'harm') targets.push(d);
  if (!targets.length) for (const tr of store.project.tracks) for (const d of tr.inserts || []) if (d.type === 'harm') targets.push(d);
  if (!targets.length) return toast('這一首還沒有 Harmony 效果器，先加一個', 'warn');
  store.checkpoint();
  for (const d of targets) {
    d.params.source = 1;             // 依和弦
    d.params.chords = list.map(c => ({ t: c.t, d: c.d, root: c.root, q: c.q }));
    d.params.chordTrack = trackId || null;
  }
  store.changed('fx');
  toast(`已把 ${list.length} 個和弦套用到和聲效果器`);
}

// 修音：用推測的調性設定主音與音階（大調／小調）
export function applyChordsToTune(trackId) {
  const key = chordKeyOf();
  if (!key) return toast('還沒有調性資訊，先按「偵測這條軌的和弦」', 'warn');
  const targets = [];
  const t = store.track(trackId);
  for (const d of (t?.inserts || [])) if (d.type === 'tune') targets.push(d);
  if (!targets.length) for (const tr of store.project.tracks) for (const d of tr.inserts || []) if (d.type === 'tune') targets.push(d);
  if (!targets.length) return toast('這一首還沒有人聲修音效果器', 'warn');
  store.checkpoint();
  for (const d of targets) {
    d.params.key = key.key;
    d.params.scale = key.minor ? 1 : 0;
    const m = scaleMask(d.params.key, d.params.scale);
    if (m !== null) d.params.mask = m;
  }
  store.changed('fx');
  toast(`已把修音調性設成 ${ROOTS[key.key]} ${key.minor ? '小調' : '大調'}`);
}

// 清除
export function clearChords() {
  store.checkpoint();
  store.project.chords = [];
  store.project.chordKey = null;
  store.changed('structure');
  store.emit('chords', {});
}

// 目前游標位置的和弦（給狀態列／其他面板查詢）
export function chordAtBeat(beat) {
  for (const c of chordsOf()) if (beat >= c.t && beat < c.t + c.d) return c;
  return null;
}

export { VIEW_NAMES };
