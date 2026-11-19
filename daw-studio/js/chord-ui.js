// 和弦軌：自動偵測、顯示（音名／級數／首調）、逐格編輯，並套用到 Auto Tune 與 Harmony
// 和弦存成「拍」：[{ t, d, root, q }]，跟隨 BPM 移動；project.chordKey = { key, minor }
import { store, isMidiClip } from './state.js';
import { detectChords, ROOTS, QUALITIES, chordName, chordPcs, diatonicChord } from './chords.js';
import { showMenu } from './menu.js';
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
  g.fillStyle = 'rgba(255,255,255,.035)';
  g.fillRect(0, y0, W, h);
  const list = chordsOf();
  if (!list.length) {
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.font = '11px sans-serif'; g.textAlign = 'left';
    g.fillText('和弦軌：在檢閱器按「偵測這條軌的和弦」，或直接在和弦軌上點兩下新增', 8, y0 + h / 2 + 4);
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
      g.fillStyle = '#f7e3b8';
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

// 和弦軌要不要佔用上方空間（調整 --ruler-h，讓尺規變高）
export function applyLaneLayout() {
  const el = document.getElementById('arrange');
  if (el) el.style.setProperty('--ruler-h', store.project.showChords ? '64px' : '34px');
}

export function toggleChordLane(on) {
  const p = store.project;
  p.showChords = on === undefined ? !p.showChords : !!on;
  applyLaneLayout();
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
export function openChordMenu(x, y, sx, pxPerBeat, atBeat = null) {
  const p = store.project;
  const i = atBeat === null ? chordAt(x, sx, pxPerBeat) : chordsOf().findIndex(c => Math.abs(c.t - atBeat) < 1e-6);
  const key = chordKeyOf();
  const beat = atBeat !== null ? atBeat : (x + sx) / pxPerBeat;
  const bar = p.sigNum || 4;
  const start = Math.floor(beat / bar) * bar;

  const setQ = (root, q) => {
    store.checkpoint();
    const list = chordsOf();
    if (i >= 0) { list[i].root = root; list[i].q = q; }
    else {
      // 新增：佔到目前位置之後的第一個和弦或小節線
      const next = list.find(c => c.t > start);
      const d = Math.max(1, Math.min(bar, (next ? next.t : start + bar) - start));
      list.push({ t: start, d, root, q });
      list.sort((a, b) => a.t - b.t);
    }
    store.changed('structure');
    store.emit('chords', {});
  };

  const items = [];
  if (i >= 0) {
    const c = chordsOf()[i];
    items.push({ label: `目前：${chordName(c)}`, disabled: true });
    // 同根音換性質
    for (const q of ['maj', 'min', '7', 'maj7', 'm7', 'sus4', 'dim']) {
      if (q === c.q) continue;
      items.push({ label: `改成 ${ROOTS[c.root]}${QUALITIES[QI[q]].suf}`, action: () => setQ(c.root, q) });
    }
    items.push('-');
  } else {
    items.push({ label: `在這裡新增和弦（第 ${Math.floor(start / bar) + 1} 小節）`, disabled: true });
  }
  // 調內和弦（有調性時最常用）
  if (key) {
    for (let d = 0; d < 7; d++) {
      const c = diatonicChord(key.key, key.minor, d);
      items.push({ label: `${chordLabel(c, 2)}　${chordName(c)}`, action: () => setQ(c.root, c.q) });
    }
    items.push('-');
  }
  // 12 個根音的大三／小三（兩層）
  const rootIdx = i >= 0 ? chordsOf()[i].root : 0;
  items.push({
    label: '換根音…',
    action: () => showMenu(x, y + 24, ROOTS.map((r, k) => ({
      label: r, action: () => setQ(k, i >= 0 ? chordsOf()[i].q : (key && key.minor ? 'min' : 'maj')),
    }))),
  });
  if (i >= 0) {
    items.push({
      label: '切成兩半',
      action: () => {
        const c = chordsOf()[i];
        if (c.d < 2) return toast('這個和弦太短，不能再切', 'warn');
        store.checkpoint();
        const half = Math.round(c.d / 2);
        chordsOf().splice(i + 1, 0, { t: c.t + half, d: c.d - half, root: c.root, q: c.q });
        c.d = half;
        store.changed('structure'); store.emit('chords', {});
      },
    });
    items.push({
      label: '合併下一個',
      disabled: i >= chordsOf().length - 1,
      action: () => {
        const list = chordsOf(); const c = list[i], n = list[i + 1];
        if (!n) return;
        store.checkpoint();
        c.d = n.t + n.d - c.t;
        list.splice(i + 1, 1);
        store.changed('structure'); store.emit('chords', {});
      },
    });
    items.push('-');
    items.push({
      label: '刪除這個和弦', danger: true,
      action: () => { store.checkpoint(); chordsOf().splice(i, 1); store.changed('structure'); store.emit('chords', {}); },
    });
  }
  showMenu(x, y, items);
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
  if (!targets.length) return toast('這一首還沒有 Auto Tune 效果器', 'warn');
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
