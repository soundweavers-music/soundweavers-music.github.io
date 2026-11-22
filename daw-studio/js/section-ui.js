// 段落軌：主歌、導歌、副歌…標在時間軸上，智慧編曲照著它編
// 段落存成「拍」：[{ t, d, sec }]，sec 是 arranger-styles.js 的段落 id（verse1、chorus1…）
// 來源有三個：自己點、② 一鍵編曲的「自動排段落」、③ 智慧創作與匯入 .zychords.json
import { store } from './state.js';
import { SECTIONS } from './arranger-styles.js';
import { showMenu } from './menu.js';
import { t } from './i18n.js';
import { toast } from './util.js';

export const sectionsOf = () => (store.project.sections || (store.project.sections = []));
export const SEC_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s]));
export const secName = id => SEC_BY_ID[id]?.name ?? id;
// 段落軌是畫在 canvas 上的，畫的時候就要翻好（DOM 的翻譯掃不到 canvas）
export const secShort = id => t(SEC_BY_ID[id]?.short ?? String(id));
export const secColor = id => SEC_BY_ID[id]?.color ?? '#8b95a8';

export function sectionLaneHeight() { return store.project.showSections ? 26 : 0; }

// ---------------- 顯示 ----------------
export function drawSectionLane(g, W, y0, h, sx, pxPerBeat) {
  if (!store.project.showSections) return;
  g.save();
  const css = getComputedStyle(document.documentElement);
  const txCol = (css.getPropertyValue('--cv-ruler-tx') || '#f7e3b8').trim() || '#f7e3b8';
  g.fillStyle = 'rgba(128,128,128,.10)';
  g.fillRect(0, y0, W, h);
  const list = sectionsOf();
  if (!list.length) {
    g.globalAlpha = 0.55;
    g.fillStyle = txCol;
    g.font = '11px sans-serif'; g.textAlign = 'left';
    g.fillText('段落軌：點一下新增段落（前奏、主歌、副歌、尾奏…）', 8, y0 + h / 2 + 4);
    g.globalAlpha = 1;
    g.restore();
    return;
  }
  for (const s of list) {
    const x = s.t * pxPerBeat - sx, w = s.d * pxPerBeat;
    if (x + w < 0 || x > W) continue;
    const col = secColor(s.sec);
    const on = store.project.secSel === s.t + ':' + s.sec;
    const rgb = hexRgb(col);
    g.fillStyle = `rgba(${rgb},${on ? 0.42 : 0.22})`;
    g.fillRect(x + 1, y0 + 3, Math.max(1, w - 2), h - 6);
    g.fillStyle = `rgba(${rgb},.95)`;
    g.fillRect(x + 1, y0 + 3, Math.min(3, Math.max(1, w - 2)), h - 6);
    g.strokeStyle = `rgba(${rgb},${on ? 0.95 : 0.55})`;
    g.lineWidth = 1;
    g.strokeRect(x + 1.5, y0 + 3.5, Math.max(1, w - 3), h - 7);
    if (w > 26) {
      g.fillStyle = txCol;
      g.font = '600 11px ui-monospace, monospace';
      g.textAlign = 'left';
      g.fillText(secShort(s.sec), x + 7, y0 + h / 2 + 4);
    }
  }
  g.restore();
}

const hexRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '139,149,168';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

// 畫布座標 → 段落索引（沒有就 -1）
export function sectionAt(x, sx, pxPerBeat) {
  const beat = (x + sx) / pxPerBeat;
  const list = sectionsOf();
  for (let i = 0; i < list.length; i++) if (beat >= list[i].t && beat < list[i].t + list[i].d) return i;
  return -1;
}

export function sectionAtBeat(beat) {
  for (const s of sectionsOf()) if (beat >= s.t && beat < s.t + s.d) return s;
  return null;
}

export function toggleSectionLane(on) {
  const p = store.project;
  p.showSections = on === undefined ? !p.showSections : !!on;
  store.emit('sections', {});
  store.changed('structure');
}

// ---------------- 編輯 ----------------
const touched = () => { store.changed('structure'); store.emit('sections', {}); };

// 依起點長度新增一段；和前後段落接得剛剛好（不重疊、不留縫）
export function addSection(beat, sec, d) {
  const p = store.project, bpb = p.sigNum || 4;
  const list = sectionsOf();
  const step = 0.25;
  let t = Math.max(0, Math.round(beat / step) * step);
  const prev = list.filter(s => s.t <= t + 1e-6).sort((a, b) => b.t - a.t)[0];
  if (prev && prev.t + prev.d > t + 1e-6) t = prev.t + prev.d;   // 不蓋掉前一段
  const next = list.filter(s => s.t > t + 1e-6).sort((a, b) => a.t - b.t)[0];
  const end = next ? next.t : Math.ceil((t + 1e-6) / bpb) * bpb;
  const c = { t, d: d || Math.max(step, end - t), sec };
  list.push(c);
  list.sort((a, b) => a.t - b.t);
  return c;
}

export function clearSections() {
  if (!sectionsOf().length) return false;
  store.checkpoint();
  store.project.sections = [];
  touched();
  return true;
}

// 把一段段落表（[{ sec, bar, bars }]，小節為單位）寫進段落軌，整條取代
export function writePlanToSections(plan, bpb, snap = true) {
  const p = store.project, bar = bpb || p.sigNum || 4;
  const list = [];
  for (const s of plan) {
    const bars = s.bars || 0;
    if (!bars) continue;                      // 尾奏 bars 0 ＝讓風格自己決定長度，段落軌上不標
    if (!SEC_BY_ID[s.sec]) continue;
    list.push({ t: (s.bar ?? 0) * bar, d: bars * bar, sec: s.sec });
  }
  list.sort((a, b) => a.t - b.t);
  if (snap) store.checkpoint();
  p.sections = list;
  p.showSections = true;
  touched();
  return list.length;
}

// 匯入用：容忍各種寫法（id、名稱、簡寫、大小寫）
const SEC_ALIAS = (() => {
  const map = {};
  for (const s of SECTIONS) {
    map[s.id] = s.id;
    map[s.short] = s.id;
    map[s.name] = s.id;
  }
  Object.assign(map, {
    主歌: 'verse1', 主歌1: 'verse1', 主歌A: 'verse1', verse: 'verse1', a: 'verse1', verseA: 'verse1',
    主歌2: 'verse2', 主歌B: 'verse2', verseB: 'verse2', b: 'verse2',
    導歌: 'pre', 預副歌: 'pre', prechorus: 'pre', 'pre-chorus': 'pre',
    副歌: 'chorus1', 副歌1: 'chorus1', chorus: 'chorus1', hook: 'chorus1', refrain: 'chorus1',
    副歌2: 'chorus2',
    橋段: 'bridge', 間奏: 'bridge', 過門: 'bridge', interlude: 'bridge', solo: 'bridge',
    停頓: 'break', break: 'break', stop: 'break',
    前奏: 'intro', intro: 'intro', introduction: 'intro',
    尾奏: 'ending', outro: 'ending', ending: 'ending',
  });
  return map;
})();
export function normSec(v) {
  if (!v) return null;
  const raw = String(v).trim();
  if (SEC_BY_ID[raw]) return raw;
  return SEC_ALIAS[raw] || SEC_ALIAS[raw.toLowerCase()] || null;
}

// ---------------- 點段落軌跳出的選單 ----------------
export function openSectionMenu(clientX, clientY, xLocal, sx, pxPerBeat) {
  const p = store.project;
  const beat = Math.max(0, (xLocal + sx) / pxPerBeat);
  const i = sectionAt(xLocal, sx, pxPerBeat);
  const bpb = p.sigNum || 4;
  const list = sectionsOf();

  const items = [];
  if (i >= 0) {
    const c = list[i];
    items.push({ label: `目前：${secName(c.sec)}`, disabled: true });
    for (const s of SECTIONS) {
      if (s.id === c.sec) continue;
      items.push({
        label: `改成 ${s.name}`,
        action: () => { store.checkpoint(); c.sec = s.id; touched(); },
      });
    }
    items.push('-');
    items.push({
      label: '切成兩半',
      action: () => {
        if (c.d < bpb * 2) return toast('這一段不到兩小節，不用再切', 'warn');
        // 盡量切在整條小節線上
        const half = Math.round(c.d / bpb / 2) * bpb || c.d / 2;
        if (half <= 0 || half >= c.d) return toast('這一段太短，不能再切', 'warn');
        store.checkpoint();
        list.splice(i + 1, 0, { t: c.t + half, d: c.d - half, sec: c.sec });
        c.d = half;
        list.sort((a, b) => a.t - b.t);
        touched();
      },
    });
    items.push({
      label: '合併下一段',
      disabled: i >= list.length - 1,
      action: () => {
        const n = list[i + 1];
        if (!n) return;
        store.checkpoint();
        c.d = Math.max(c.d, n.t + n.d - c.t);
        list.splice(i + 1, 1);
        touched();
      },
    });
    items.push('-');
    items.push({
      label: '刪除這一段', danger: true,
      action: () => { store.checkpoint(); list.splice(i, 1); touched(); },
    });
    items.push('-');
  } else {
    const bar = Math.floor(beat / bpb) + 1;
    items.push({ label: `在第 ${bar} 小節新增段落`, disabled: true });
  }
  for (const s of SECTIONS) {
    items.push({
      label: i >= 0 ? `新增 ${s.name}（從這裡開始）` : s.name,
      action: () => {
        store.checkpoint();
        addSection(beat, s.id);
        store.project.showSections = true;
        touched();
      },
    });
  }
  showMenu(clientX, clientY, items);
}
