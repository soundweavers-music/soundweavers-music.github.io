// 影像面板（CapCut 式）：選到影片或文字片段時，下方出現分頁——
// 濾鏡 / 調色 / 轉場 / 淡入淡出。縮圖都用片段自己的畫面即時算出來。
import { store, clipStart, clipDur } from './state.js';
import {
  FILTERS, TRANSITIONS, COLOR_KEYS, isVideoClip, isTextClip, clipColor, filterCss,
  stillCanvas, transitionCanvas, refreshPreview, videoSettings,
} from './video.js';
import { engine } from './engine.js';
import { toast } from './util.js';

const $ = id => document.getElementById(id);
let panel = null, body = null, tab = 'filter', shownClipId = null;

export function selectedVisualClip() {
  for (const id of store.selection.clipIds) {
    const f = store.findClip(id);
    if (f && (isVideoClip(f.clip) || isTextClip(f.clip))) return f;
  }
  // 只選了軌道（沒選片段）：拿播放頭下那一段，沒有就用第一段
  const tr = store.track(store.selection.trackId);
  if (tr && (tr.kind === 'video' || tr.kind === 'text' || tr.kind === 'sub') && tr.clips.length) {
    const t = engine.currentTime();
    const c = tr.clips.find(c => t >= clipStart(c) && t < clipStart(c) + clipDur(c)) || tr.clips[0];
    return { track: tr, clip: c };
  }
  return null;
}

export const videoPanelOpen = () => !!panel && !panel.classList.contains('hidden');

export function initVideoPanel() {
  if (panel) return;
  panel = document.createElement('section');
  panel.className = 'vid-panel hidden';
  panel.id = 'vidPanel';
  panel.innerHTML = `
    <div class="vp-head">
      <div class="vp-tabs">
        <button data-tab="filter">濾鏡</button>
        <button data-tab="color">調色</button>
        <button data-tab="trans">轉場</button>
        <button data-tab="fade">淡入淡出</button>
      </div>
      <span class="vp-name" id="vpName"></span>
      <span class="spacer"></span>
      <button class="tbtn ghost" id="vpPrev" title="開啟／關閉預覽視窗">預覽</button>
      <button class="tbtn ghost" id="vpClose" title="關閉">✕</button>
    </div>
    <div class="vp-body"></div>`;
  $('main').appendChild(panel);          // 右側第三欄（CapCut 式屬性面板）
  body = panel.querySelector('.vp-body');
  panel.querySelectorAll('.vp-tabs button').forEach(b => {
    b.onclick = () => { tab = b.dataset.tab; render(); };
  });
  panel.querySelector('#vpClose').onclick = () => toggleVideoPanel(false);
  panel.querySelector('#vpPrev').onclick = () => store.emit('toggle-preview', {});
  store.on('change', () => { if (videoPanelOpen()) render(true); });
  store.on('select', () => { if (videoPanelOpen()) render(); });
}

export function toggleVideoPanel(on = !videoPanelOpen()) {
  initVideoPanel();
  // 先讓其他下方面板收起來，再開自己
  panel.classList.toggle('hidden', !on);
  $('main').classList.toggle('has-vid', !!on);
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  if (on) {
    const f = selectedVisualClip();
    shownClipId = f?.clip.id || null;
    render();
  }
}

// 開面板並切到某個分頁（雙擊片段、右鍵選單用）
export function openVideoPanel(tabId) {
  if (tabId) tab = tabId;
  toggleVideoPanel(true);
}

// ---------------- 畫面 ----------------
function render(quiet = false) {
  if (!videoPanelOpen()) return;
  const f = selectedVisualClip();
  const nameEl = panel.querySelector('#vpName');
  panel.querySelectorAll('.vp-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (!f) {
    nameEl.textContent = '選一段影片或文字';
    body.innerHTML = '<p class="vp-hint">在時間軸上點一段影片或文字片段，就可以在這裡上濾鏡、調色、加轉場與淡入淡出。</p>';
    return;
  }
  const { clip, track } = f;
  nameEl.textContent = `${clip.name || (isTextClip(clip) ? clip.text : '片段')}　${fmt(clipDur(clip))}`;
  if (quiet) { syncValues(clip); return; }
  body.innerHTML = '';
  if (tab === 'filter') renderFilter(clip);
  else if (tab === 'color') renderColor(clip);
  else if (tab === 'trans') renderTrans(clip, track);
  else renderFade(clip, track);
}

const fmt = s => `${s.toFixed(2)} 秒`;

function row(label, child, valueEl) {
  const r = document.createElement('label');
  r.className = 'vp-row';
  r.innerHTML = `<span class="vp-lbl">${label}</span>`;
  r.appendChild(child);
  if (valueEl) r.appendChild(valueEl);
  return r;
}

function slider({ min, max, step, value, onInput, onDone, fmtValue }) {
  const wrap = document.createElement('span');
  wrap.className = 'vp-slider';
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
  const out = document.createElement('span');
  out.className = 'vp-val';
  const show = () => { out.textContent = fmtValue(Number(inp.value)); };
  show();
  inp.addEventListener('pointerdown', () => store.checkpoint());
  inp.addEventListener('keydown', e => e.stopPropagation());
  inp.addEventListener('input', () => { show(); onInput(Number(inp.value)); refreshPreview(true); });
  inp.addEventListener('change', () => { show(); onDone?.(); store.changed('structure'); refreshPreview(true); });
  wrap.appendChild(inp); wrap.appendChild(out);
  wrap._input = inp;
  wrap._show = show;
  return wrap;
}

// ---------- 濾鏡 ----------
function renderFilter(clip) {
  const grid = document.createElement('div');
  grid.className = 'vp-cards';
  const cur = clip.filter || 'none';
  FILTERS.forEach(f => {
    const card = document.createElement('button');
    card.className = 'vp-card' + (cur === f.id ? ' on' : '');
    card.innerHTML = `<span class="vp-thumb"><i>…</i></span><b>${f.name}</b>`;
    card.onclick = () => {
      store.checkpoint(); clip.filter = f.id;
      store.changed('structure'); refreshPreview(true); render();
    };
    grid.appendChild(card);
    if (isVideoClip(clip)) {
      stillCanvas(clip, 128, 72, { filterId: f.id, at: 0.3 }).then(cv => {
        const slot = card.querySelector('.vp-thumb');
        if (!slot) return;
        slot.innerHTML = ''; slot.appendChild(cv);
      });
    }
  });
  body.appendChild(grid);
  const amt = clip.filterAmt ?? 1;
  const s = slider({
    min: 0, max: 100, step: 1, value: Math.round(amt * 100),
    onInput: v => { clip.filterAmt = v / 100; },
    fmtValue: v => `${v}%`,
  });
  body.appendChild(row('強度', s));
}

// ---------- 調色 ----------
function renderColor(clip) {
  const col = clipColor(clip);
  COLOR_KEYS.forEach(({ k, name }) => {
    const s = slider({
      min: -100, max: 100, step: 1, value: col[k] || 0,
      onInput: v => { clip.color[k] = v; },
      fmtValue: v => (v > 0 ? `+${v}` : String(v)),
    });
    body.appendChild(row(name, s));
  });
  const bar = document.createElement('div');
  bar.className = 'vp-actions';
  const reset = document.createElement('button');
  reset.className = 'tbtn';
  reset.textContent = '全部重設';
  reset.onclick = () => {
    store.checkpoint();
    COLOR_KEYS.forEach(({ k }) => { clip.color[k] = 0; });
    store.changed('structure'); refreshPreview(true); render();
  };
  bar.appendChild(reset);
  body.appendChild(bar);
}

// ---------- 轉場 ----------
function junctionOf(clip, track) {
  const cs = [...track.clips].sort((a, b) => clipStart(a) - clipStart(b));
  const i = cs.indexOf(clip);
  const next = cs[i + 1];
  if (next && isVideoClip(next) && Math.abs(clipStart(next) - (clipStart(clip) + clipDur(clip))) < 0.25) {
    return { from: clip, to: next, mine: true };
  }
  const prev = cs[i - 1];
  if (prev && isVideoClip(prev) && Math.abs(clipStart(clip) - (clipStart(prev) + clipDur(prev))) < 0.25) {
    return { from: prev, to: clip, mine: false };
  }
  return null;
}

function renderTrans(clip, track) {
  const j = isVideoClip(clip) ? junctionOf(clip, track) : null;
  if (!j) {
    body.innerHTML = '<p class="vp-hint">轉場要接在兩段相鄰的影片之間：把兩段影片排在一起（中間不留空隙），再回來這裡選轉場。</p>';
    return;
  }
  const src = j.from;                       // 轉場記在前一段上
  const cur = src.trans?.type || 'none';
  const grid = document.createElement('div');
  grid.className = 'vp-cards';
  const none = document.createElement('button');
  none.className = 'vp-card' + (cur === 'none' ? ' on' : '');
  none.innerHTML = '<span class="vp-thumb"><i>無</i></span><b>不加</b>';
  none.onclick = () => {
    store.checkpoint(); delete src.trans;
    store.changed('structure'); refreshPreview(true); render();
  };
  grid.appendChild(none);
  TRANSITIONS.forEach(t => {
    const card = document.createElement('button');
    card.className = 'vp-card' + (cur === t.id ? ' on' : '');
    card.innerHTML = `<span class="vp-thumb"><i>…</i></span><b>${t.name}</b>`;
    card.onclick = () => {
      store.checkpoint();
      src.trans = { type: t.id, dur: src.trans?.dur || 0.6 };
      store.changed('structure'); refreshPreview(true); render();
    };
    grid.appendChild(card);
    transitionCanvas(j.from, j.to, t.id, 128, 72).then(cv => {
      const slot = card.querySelector('.vp-thumb');
      if (!slot) return;
      slot.innerHTML = ''; slot.appendChild(cv);
    });
  });
  body.appendChild(grid);
  const s = slider({
    min: 0.2, max: 2, step: 0.1, value: src.trans?.dur || 0.6,
    onInput: v => { src.trans = { type: src.trans?.type || 'dissolve', dur: v }; },
    fmtValue: v => `${v.toFixed(1)} 秒`,
  });
  if (cur === 'none') s.querySelector('input').disabled = true;
  body.appendChild(row('時長', s));
}

// ---------- 淡入淡出 ----------
function renderFade(clip, track) {
  const mk = (key, label) => slider({
    min: 0, max: 5, step: 0.1, value: clip[key] || 0,
    onInput: v => { clip[key] = v; },
    fmtValue: v => (v ? `${v.toFixed(1)} 秒` : '關'),
  });
  body.appendChild(row('淡入', mk('fadeIn', '淡入')));
  body.appendChild(row('淡出', mk('fadeOut', '淡出')));
  if (isVideoClip(clip)) {
    const sel = document.createElement('select');
    [['#000000', '黑'], ['#ffffff', '白'], ['#f2e8db', '米白']].forEach(([v, n]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = n; sel.appendChild(o);
    });
    sel.value = clip.fadeColor || '#000000';
    sel.onchange = () => {
      store.checkpoint(); clip.fadeColor = sel.value;
      store.changed('structure'); refreshPreview(true);
    };
    body.appendChild(row('淡出色', sel));
  }
  const hint = document.createElement('p');
  hint.className = 'vp-hint';
  hint.textContent = isTextClip(clip)
    ? '文字與字幕的淡入淡出是透明度的變化，會在預覽與輸出時生效。'
    : '淡入淡出是畫面的透明度變化：淡出到黑就是畫面慢慢變暗。聲音的淡入淡出請在時間軸上拉片段兩端的小把手。';
  body.appendChild(hint);
}

// 面板開著時，undo 或拖曳滑桿後只更新數值，不要重新長縮圖
function syncValues(clip) {
  if (panel.querySelector('.vp-cards')) return;
  const rows = [...body.querySelectorAll('.vp-row')];
  if (tab === 'color') {
    COLOR_KEYS.forEach(({ k }, i) => {
      const inp = rows[i]?.querySelector('input');
      if (!inp) return;
      inp.value = (clip.color || {})[k] || 0;
      inp.dispatchEvent(new Event('input'));
    });
  }
}

// 點到影片／文字軌或片段：右側面板預設打開；選到別的軌就收起來
store.on('select', () => {
  const f = selectedVisualClip();
  if (f && !videoPanelOpen()) { toggleVideoPanel(true); return; }
  if (!f && videoPanelOpen()) { toggleVideoPanel(false); return; }
  if (!videoPanelOpen()) return;
  const id = f?.clip.id || null;
  if (id === shownClipId) return;
  shownClipId = id;
  render();
});
