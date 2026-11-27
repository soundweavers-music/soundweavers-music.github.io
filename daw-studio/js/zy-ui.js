// 織音合成器介面：音色瀏覽器（分類／搜尋／試聽）與音色巨集旋鈕。
// 音色本身在 zy-patches.js，聲音在 zy-worklet.js；這裡只負責選跟調。
import { store } from './state.js';
import { engine } from './engine.js';
import { scheduleNote, startVoice, PRESETS } from './synth.js';
import { ZY_PATCHES, ZY_CATS } from './zy-patches.js';
import { zyArt } from './zy-art.js';
import { MACROS } from './zy-synth.js';
import { isEN, t, registerTerms } from './i18n.js';
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
  renderPreview();
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
      <i class="zy-art">${zyArt(p.id)}</i><b>${nm(p)}</b><span>${isEN() ? p.name : (p.nameEn || '')}</span><em>${p.drum ? 'GM 鼓位' : p.cat}</em>
    </button>`).join('');
  box.onclick = e => {
    const b = e.target.closest('.zy-item');
    if (!b) return;
    picked = b.dataset.i;
    box.querySelectorAll('.zy-item').forEach(x => x.classList.toggle('on', x.dataset.i === picked));
    audition(curTrack, picked);
    $('zyUse').textContent = `套用「${nm(ZY_PATCHES.find(p => p.id === picked))}」`;
    renderPreview();
  };
}

// 新介面文字的英文（字典是腳本產生的，這幾條是這個模組自己帶的）
const TERMS = {
  '虛擬鋼琴': 'Virtual piano',
  '點琴鍵下方比較大聲；電腦鍵盤 A–; 白鍵、W E T Y U O P 黑鍵': 'Click lower on a key to play louder · computer keys A–; white, W E T Y U O P black',
  '低八度（Z）': 'Octave down (Z)', '高八度（X）': 'Octave up (X)',
  '點一個音色試聽，再用下面的虛擬鋼琴彈彈看。': 'Click an instrument to hear it, then play it on the piano below.',
  '先在上面點一個音色': 'Pick an instrument above first',
  '鼓皮（掉音的正弦）＋濾波雜訊＋金屬方波，依 GM 鼓位即時合成。': 'Drum heads (pitch-dropping sines) + filtered noise + metallic squares, synthesised per GM drum key.',
  '分音表合成：照真實樂器的泛音比例與各自的衰減': 'modal synthesis: the real instrument’s partial ratios, each with its own decay',
  '多根弦微微不同音 → 拍音': 'several slightly detuned strings → beating',
  '波導弦＋琴橋的沙聲': 'waveguide string + buzzing bridge',
  '波導撥弦（真的弦在震動）': 'waveguide string (a modelled vibrating string)',
  '複弦': 'double courses', 'FM 調變': 'FM', '硬同步': 'hard sync', '多聲部齊奏': 'unison voices',
  '五段共振峰（母音）': 'five-formant vowels', '琴身／管身共鳴': 'body / bore resonances',
  '跟著音高走的氣音': 'pitch-tracking breath noise', '類比削波': 'analogue-style saturation',
  '波表振盪器＋濾波器': 'wavetable oscillators + filter',
};
registerTerms(TERMS);

// 這個音色是怎麼「發聲」的（也讓人知道為什麼每個音色聽起來不一樣）
function howItSounds(p) {
  const s = howItSoundsZh(p);
  if (!isEN()) return s;
  if (TERMS[s]) return t(s);
  const parts = s.replace(/。$/, '').split('、').map(t);
  const out = parts.join(', ') + '.';
  return out.charAt(0).toUpperCase() + out.slice(1);
}
function howItSoundsZh(p) {
  if (p.drum) return '鼓皮（掉音的正弦）＋濾波雜訊＋金屬方波，依 GM 鼓位即時合成。';
  const parts = [];
  if (p.modes) parts.push('分音表合成：照真實樂器的泛音比例與各自的衰減');
  if (p.modes && p.modes.beat && p.modes.beat.length) parts.push('多根弦微微不同音 → 拍音');
  if (p.str) parts.push(p.str.buzz ? '波導弦＋琴橋的沙聲' : '波導撥弦（真的弦在震動）');
  if (p.str && p.str.course) parts.push('複弦');
  if ((p.osc || []).some(o => o.fm)) parts.push('FM 調變');
  if ((p.osc || []).some(o => o.sync)) parts.push('硬同步');
  if ((p.osc || []).some(o => (o.uni || 1) > 1)) parts.push('多聲部齊奏');
  if (p.frm) parts.push('五段共振峰（母音）');
  if (p.body && p.body.length) parts.push('琴身／管身共鳴');
  if (p.noise && p.noise.kt) parts.push('跟著音高走的氣音');
  if (p.drive > 0.3) parts.push('類比削波');
  if (!parts.length) parts.push('波表振盪器＋濾波器');
  return parts.join('、') + '。';
}

function renderPreview() {
  const box = $('zyPrev');
  if (!box) return;
  const p = ZY_PATCHES.find(x => x.id === picked);
  if (!p) { box.innerHTML = `<p>${t('點一個音色試聽，再用下面的虛擬鋼琴彈彈看。')}</p>`; return; }
  box.innerHTML = `<div class="zy-prev-art">${zyArt(p.id)}</div>
    <b>${nm(p)}</b><span>${isEN() ? p.name : (p.nameEn || '')} · ${t(p.cat)}</span>
    <p>${howItSounds(p)}</p>`;
}

// ---------------- 虛擬鋼琴（彈目前反白的音色） ----------------
const KB = { lo: 48, n: 25, held: new Map(), down: false };
const KEYS = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);

function renderKb() {
  const box = $('zyKb');
  if (!box) return;
  const whites = [];
  for (let m = KB.lo; m < KB.lo + KB.n; m++) if (!isBlack(m)) whites.push(m);
  const W = 100 / whites.length;
  let html = '';
  whites.forEach((m, i) => {
    html += `<div class="w" data-m="${m}" style="left:${i * W}%;width:${W}%">${m % 12 === 0 ? `<i>C${m / 12 - 1}</i>` : ''}</div>`;
  });
  for (let m = KB.lo; m < KB.lo + KB.n; m++) {
    if (!isBlack(m)) continue;
    const i = whites.indexOf(m - 1);
    html += `<div class="k" data-m="${m}" style="left:${(i + 1) * W - W * 0.31}%;width:${W * 0.62}%"></div>`;
  }
  box.innerHTML = `<div class="zy-kb-in">${html}</div>`;
  $('zyOct').textContent = `C${KB.lo / 12 - 1}–C${(KB.lo + KB.n - 1) / 12 - 1}`;
}

// 琴鍵先亮（不等音訊引擎），聲音等引擎好了再出；如果引擎還沒好之前就放開了，就不發聲
async function kbOn(m, vel, src) {
  if (!picked || !curTrack) return;
  kbOff(m);
  const h = { v: null, src, off: false };
  KB.held.set(m, h);
  $('zyKb')?.querySelector(`[data-m="${m}"]`)?.classList.add('on');
  await engine.ensure();
  const t = store.track(curTrack), strip = engine.strips.get(curTrack);
  if (!t || !strip || h.off || KB.held.get(m) !== h) return;
  h.v = startVoice(engine.ctx, strip.input, 'zy:' + picked, m, vel, engine.ctx.currentTime, { synth: t.synth });
}
function kbOff(m) {
  const h = KB.held.get(m);
  if (h) h.off = true;
  if (h && h.v && engine.ctx) h.v.release(engine.ctx.currentTime);
  KB.held.delete(m);
  $('zyKb')?.querySelector(`[data-m="${m}"]`)?.classList.remove('on');
}
function kbAllOff() { for (const m of [...KB.held.keys()]) kbOff(m); KB.down = false; }

// 點在琴鍵越下面越大聲（手指下得越深越重）
function velAt(el, e) {
  const r = el.getBoundingClientRect();
  return Math.round(40 + 87 * Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
}

function initKb() {
  const box = $('zyKb');
  if (!box) return;
  renderKb();
  box.addEventListener('pointerdown', e => {
    const k = e.target.closest('[data-m]');
    if (!k) return;
    if (!picked) { toast(t('先在上面點一個音色'), 'warn'); return; }
    e.preventDefault();
    KB.down = true;
    kbOn(Number(k.dataset.m), velAt(k, e), 'mouse');
  });
  // 按住拖過去＝刮奏
  box.addEventListener('pointerover', e => {
    if (!KB.down) return;
    const k = e.target.closest('[data-m]');
    if (!k) return;
    const m = Number(k.dataset.m);
    if (KB.held.has(m)) return;
    for (const [hm, h] of KB.held) if (h.src === 'mouse') kbOff(hm);
    kbOn(m, velAt(k, e), 'mouse');
  });
  const up = () => { if (!KB.down) return; KB.down = false; for (const [m, h] of [...KB.held]) if (h.src === 'mouse') kbOff(m); };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  const shift = d => { kbAllOff(); KB.lo = Math.max(12, Math.min(96, KB.lo + d * 12)); renderKb(); };
  $('zyOctDn').onclick = () => shift(-1);
  $('zyOctUp').onclick = () => shift(1);

  // 電腦鍵盤：對話框開著才接（在搜尋框打字時不接）
  const dlg = $('dlgSynth');
  dlg.addEventListener('keydown', e => {
    if (e.target && e.target.id === 'zySearch') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'x') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) shift(k === 'z' ? -1 : 1); return; }
    if (!(k in KEYS)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (!picked) { toast(t('先在上面點一個音色'), 'warn'); return; }
    kbOn(KB.lo + KEYS[k], 100, 'key:' + k);
  });
  dlg.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (!(k in KEYS)) return;
    e.stopPropagation();
    const m = KB.lo + KEYS[k];
    if (KB.held.get(m)?.src === 'key:' + k) kbOff(m);
  });
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
  initKb();
  dlg.addEventListener('close', () => { kbAllOff(); curTrack = null; query = ''; search.value = ''; });
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
