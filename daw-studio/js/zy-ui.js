// 織音合成器介面：音色瀏覽器（分類／搜尋／試聽）與音色巨集旋鈕。
// 音色本身在 zy-patches.js，聲音在 zy-worklet.js；這裡只負責選跟調。
import { store } from './state.js';
import { engine } from './engine.js';
import { scheduleNote, PRESETS } from './synth.js';
import { ZY_PATCHES, ZY_CATS } from './zy-patches.js';
import { MACROS } from './zy-synth.js';
import { isEN } from './i18n.js';
import { toast } from './util.js';

const $ = id => document.getElementById(id);
const nm = p => (isEN() && p.nameEn ? p.nameEn : p.name);

let curTrack = null;     // 目前正在挑音色的軌道
let curCat = ZY_CATS[0];
let query = '';
let picked = null;       // 目前反白的音色 id

// 把一個音色套到軌道上（軌道名稱還是預設名時，跟著換）
export function applyPatch(trackId, id) {
  const t = store.track(trackId);
  const p = ZY_PATCHES.find(x => x.id === id);
  if (!t || !p) return;
  store.checkpoint();
  t.instrument = 'zy:' + id;
  // 軌道名稱還是預設名或某個音色名時，跟著換成新音色
  const isAuto = /^MIDI \d+$/.test(t.name) || !t.name
    || Object.values(PRESETS).some(x => x.name === t.name || x.nameEn === t.name);
  if (isAuto) t.name = nm(p);
  if (!t.synth) t.synth = {};
  store.changed('structure');
  store.dirty = true;
}

// 試聽：直接走引擎這條軌的 strip，不動軌道原本的音色
async function audition(trackId, id) {
  const t = store.track(trackId);
  await engine.ensure();
  const strip = engine.strips.get(trackId);
  if (!t || !strip) return;
  const p = ZY_PATCHES.find(x => x.id === id);
  const seq = p && p.drum ? [36, 42, 38, 46] : [60, 64, 67, 72];
  const gap = p && p.drum ? 0.16 : 0.14;
  seq.forEach((m, i) => {
    scheduleNote(engine.ctx, strip.input, 'zy:' + id, m, 100, engine.ctx.currentTime + 0.02 + i * gap,
      p && p.drum ? 0.12 : 0.45, { synth: t.synth });
  });
}

// ---------------- 音色瀏覽器 ----------------
export function openSynthPicker(trackId) {
  const dlg = $('dlgSynth');
  if (!dlg) return;
  curTrack = trackId;
  const t = store.track(trackId);
  picked = t && t.instrument && t.instrument.startsWith('zy:') ? t.instrument.slice(3) : null;
  renderCats();
  renderList();
  dlg.showModal();
}

function renderCats() {
  const box = $('zyCats');
  box.innerHTML = ZY_CATS.map(c => {
    const n = ZY_PATCHES.filter(p => p.cat === c).length;
    return `<button type="button" data-c="${c}" class="${c === curCat ? 'on' : ''}">${c}<i>${n}</i></button>`;
  }).join('');
  box.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    curCat = b.dataset.c;
    renderCats(); renderList();
  };
}

function renderList() {
  const box = $('zyList');
  const q = query.trim().toLowerCase();
  const rows = ZY_PATCHES.filter(p => (!q && p.cat === curCat) || (q && (
    nm(p).toLowerCase().includes(q) || (p.name || '').includes(q)
    || p.id.includes(q) || (p.nameEn || '').toLowerCase().includes(q) || p.cat.includes(q))));
  if (!rows.length) { box.innerHTML = '<p class="zy-empty">找不到符合的音色</p>'; return; }
  box.innerHTML = rows.map(p => `<button type="button" class="zy-item${p.id === picked ? ' on' : ''}" data-i="${p.id}">
      <b>${nm(p)}</b><span>${isEN() ? p.name : (p.nameEn || '')}</span><em>${p.drum ? 'GM 鼓位' : p.cat}</em>
    </button>`).join('');
  box.onclick = e => {
    const b = e.target.closest('.zy-item');
    if (!b) return;
    picked = b.dataset.i;
    box.querySelectorAll('.zy-item').forEach(x => x.classList.toggle('on', x.dataset.i === picked));
    audition(curTrack, picked);
    $('zyUse').textContent = `套用「${nm(ZY_PATCHES.find(p => p.id === picked))}」`;
  };
}

export function initZYUI() {
  const dlg = $('dlgSynth');
  if (!dlg) return;
  $('zyCount').textContent = ZY_PATCHES.length;
  // 給截圖／自動測試用的入口（沒有指定軌道就用第一條 MIDI 軌）
  globalThis.__zyOpen = id => openSynthPicker(id || (store.project.tracks.find(t => t.kind === 'midi') || {}).id);
  const search = $('zySearch');
  search.addEventListener('input', () => { query = search.value; renderList(); });
  search.addEventListener('keydown', e => e.stopPropagation());
  $('zyUse').onclick = e => {
    if (!picked) { toast('先選一個音色', 'warn'); e.preventDefault(); return; }
    applyPatch(curTrack, picked);
    toast(`音色改成「${nm(ZY_PATCHES.find(p => p.id === picked))}」`);
  };
  $('zyTry').onclick = () => { if (picked) audition(curTrack, picked); };
  dlg.addEventListener('close', () => { curTrack = null; query = ''; search.value = ''; });
}

// ---------------- 音色巨集（檢閱器上的旋鈕） ----------------
// 只有織音合成器的音色才有；數值 -1 … +1，0 = 照音色原本的設定。
export function macrosSection(t) {
  const sec = document.createElement('div');
  sec.className = 'sec zy-macros';
  const M = t.synth || {};
  sec.innerHTML = `<h4 style="margin-top:0">音色調整<button type="button" class="zy-reset" title="全部回到原廠設定">重設</button></h4>
    <p class="note zy-hint" style="margin:0 0 4px">0 = 原廠設定。拖曳旋鈕改變這個音色的亮度、起音、厚度…</p>
    <div class="zy-grid">${MACROS.map(m => `
      <label title="${m.tip}"><span>${m.name}</span>
        <input type="range" min="-100" max="100" step="1" value="${Math.round((M[m.k] || 0) * 100)}" data-k="${m.k}">
        <output>${Math.round((M[m.k] || 0) * 100)}</output>
      </label>`).join('')}</div>`;
  const set = (k, v) => {
    const t2 = store.track(t.id);
    if (!t2) return;
    if (!t2.synth) t2.synth = {};
    if (Math.abs(v) < 0.005) delete t2.synth[k]; else t2.synth[k] = v;
    if (!Object.keys(t2.synth).length) delete t2.synth;
    store.dirty = true;
  };
  sec.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      set(inp.dataset.k, Number(inp.value) / 100);
      inp.nextElementSibling.textContent = inp.value;
    });
    // 放開才試聽，拖動時不要一直發聲
    inp.addEventListener('change', () => audition(t.id, t.instrument.slice(3)));
  });
  sec.querySelector('.zy-reset').onclick = () => {
    const t2 = store.track(t.id);
    if (t2) { delete t2.synth; store.dirty = true; }
    sec.querySelectorAll('input').forEach(inp => { inp.value = 0; inp.nextElementSibling.textContent = '0'; });
    toast('音色調整已回到原廠設定');
  };
  return sec;
}
