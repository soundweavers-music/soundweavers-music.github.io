// 人聲修音的音符編輯器（獨立視窗，可拉大、全螢幕）
// 左邊鋼琴鍵、上面時間尺、背景是人聲波形與原始音高曲線；音符可以拖曳、改長度、切開、框選多個一起移動。
// 資料：desc.params.notes = [{ s, e, midi, orig, amt }]（專案秒數）；改動經 onChange 通知 effects 送進 worklet。
import { store, isMidiClip } from './state.js';
import { engine } from './engine.js';
import { detectNotes } from './note-detect.js';
import { NOTE_NAMES_ZH } from './effects.js';
import { cssVar, ink } from './theme.js';
import { toast } from './util.js';

const noteOf = m => NOTE_NAMES_ZH[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
const BLACK = new Set([1, 3, 6, 8, 10]);
const open = new Map();   // fx id → 視窗
const KEY_W = 46, RULER_H = 22;
const SIZE_KEY = 'zhiyin-daw-noteed-size';

export function openNoteEditor(owner, desc, onChange) {
  if (open.has(desc.id)) { const w = open.get(desc.id); w.style.zIndex = ++zTop; return w; }
  return build(owner, desc, onChange);
}
export function closeNoteEditor(id) { const w = open.get(id); if (w) w._close(); }
let zTop = 400;

function build(owner, desc, onChange) {
  const P = desc.params;
  const notes = () => (P.notes || (P.notes = []));
  const win = document.createElement('div');
  win.className = 'nted';
  win.style.zIndex = ++zTop;
  win.innerHTML = `
    <div class="nted-head">
      <b>音符編輯</b><span class="nted-trk"></span>
      <div class="nted-tools">
        <button type="button" class="tbtn nted-analyze" title="分析這一軌的音訊，切成一顆一顆的音符（會取代目前的音符）">分析這一軌</button>
        <span class="sep"></span>
        <button type="button" class="tbtn ghost nted-snap" title="選取的音符對齊到音階（沒選 = 全部）">對齊音階</button>
        <button type="button" class="tbtn ghost nted-reset" title="選取的音符回到原本唱的音高（沒選 = 全部）">回到原音</button>
        <button type="button" class="tbtn ghost nted-split" title="在播放頭的位置切開選取的音符（或在音符上雙擊）">切開</button>
        <button type="button" class="tbtn ghost nted-del" title="刪除選取的音符（Delete）">刪除</button>
        <span class="sep"></span>
        <label class="nted-on" title="關掉：暫時不用手動音符，回到依音階自動修正"><input type="checkbox"> 套用手動音符</label>
        <span class="sep"></span>
        <button type="button" class="tbtn ghost nted-fit" title="縮放到看得到全部音符（F）">全部</button>
        <button type="button" class="tbtn ghost nted-zo" title="縮小（Ctrl + 滾輪）">－</button>
        <button type="button" class="tbtn ghost nted-zi" title="放大（Ctrl + 滾輪）">＋</button>
        <button type="button" class="tbtn ghost nted-follow" title="播放時畫面跟著播放頭">跟隨</button>
      </div>
      <div class="spacer"></div>
      <button type="button" class="tbtn ghost nted-max" title="最大化／還原">▢</button>
      <button type="button" class="tbtn ghost nted-x" title="關閉 (Esc)">✕</button>
    </div>
    <div class="nted-body"><canvas class="nted-cv" tabindex="0"></canvas></div>
    <div class="nted-foot">
      <span class="nted-sel">沒有選取</span>
      <label>音高 <input type="number" class="nted-pitch" step="0.1" title="選取音符相對原音的移調（半音）"> 半音</label>
      <label>修正強度 <input type="range" class="nted-amt" min="0" max="100" step="1"><b class="nted-amtv"></b></label>
      <span class="nted-hint">拖曳音符移動　拖左右邊緣改長度　空白處拖曳框選　雙擊切開　↑↓ 半音（Shift 10 cent）　Delete 刪除　滾輪捲動、Ctrl+滾輪縮放時間、Alt+滾輪縮放音高　點時間尺跳到該處</span>
    </div>
    <div class="nted-grip" title="拖曳改變大小"></div>`;
  document.body.appendChild(win);
  const $ = s => win.querySelector(s);
  const cv = $('.nted-cv'), body = $('.nted-body');
  $('.nted-trk').textContent = store.track(owner)?.name || '';
  open.set(desc.id, win);

  // ---- 位置與大小（記住上次）----
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
    if (s) Object.assign(win.style, { left: s.l + 'px', top: s.t + 'px', width: s.w + 'px', height: s.h + 'px' });
  } catch (_) { /* noop */ }
  if (!win.style.width) Object.assign(win.style, { width: Math.min(innerWidth - 40, 1100) + 'px', height: Math.min(innerHeight - 60, 560) + 'px', left: Math.max(20, (innerWidth - Math.min(innerWidth - 40, 1100)) / 2) + 'px', top: '40px' });
  const remember = () => { const r = win.getBoundingClientRect(); if (!win.classList.contains('max')) localStorage.setItem(SIZE_KEY, JSON.stringify({ l: r.left, t: r.top, w: r.width, h: r.height })); };
  win.addEventListener('pointerdown', () => { win.style.zIndex = ++zTop; }, true);
  const head = $('.nted-head');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, label') || win.classList.contains('max')) return;
    const r = win.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { win.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - x0)) + 'px'; win.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - y0)) + 'px'; };
    const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); remember(); };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
  });
  head.addEventListener('dblclick', e => { if (!e.target.closest('button, input, label')) toggleMax(); });
  const grip = $('.nted-grip');
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    const r = win.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    const mv = ev => { win.style.width = Math.max(560, r.width + ev.clientX - x0) + 'px'; win.style.height = Math.max(320, r.height + ev.clientY - y0) + 'px'; draw(); };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); remember(); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  const toggleMax = () => { win.classList.toggle('max'); $('.nted-max').textContent = win.classList.contains('max') ? '❐' : '▢'; requestAnimationFrame(draw); };
  $('.nted-max').onclick = toggleMax;

  // ---- 檢視範圍 ----
  const V = { t0: 0, t1: 10, lo: 48, hi: 76 };   // 秒、MIDI
  let follow = true;
  const W = () => body.clientWidth, H = () => body.clientHeight;
  const xOf = t => KEY_W + (t - V.t0) / (V.t1 - V.t0) * (W() - KEY_W);
  const tOf = x => V.t0 + (x - KEY_W) / (W() - KEY_W) * (V.t1 - V.t0);
  const rowH = () => (H() - RULER_H) / (V.hi - V.lo);
  const yOf = m => RULER_H + (V.hi - m) * rowH();
  const mOf = y => V.hi - (y - RULER_H) / rowH();
  const clipRange = () => {
    const t = store.track(owner); let a = Infinity, z = 0;
    for (const c of t?.clips || []) if (!isMidiClip(c)) { a = Math.min(a, c.start); z = Math.max(z, c.start + c.duration); }
    return isFinite(a) ? [a, z] : [0, 10];
  };
  const fit = () => {
    const all = notes();
    let [t0, t1] = all.length ? [Math.min(...all.map(n => n.s)), Math.max(...all.map(n => n.e))] : clipRange();
    const pad = (t1 - t0) * 0.03 + 0.2;
    t0 = Math.max(0, t0 - pad); t1 += pad;
    let lo = 52, hi = 76;
    if (all.length) { lo = Math.min(...all.map(n => Math.min(n.midi, n.orig ?? n.midi))) - 3; hi = Math.max(...all.map(n => Math.max(n.midi, n.orig ?? n.midi))) + 3; }
    if (hi - lo < 12) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
    Object.assign(V, { t0, t1: Math.max(t1, t0 + 1), lo: Math.floor(lo), hi: Math.ceil(hi) });
  };
  const zoomT = (k, at) => {
    const c = at ?? (V.t0 + V.t1) / 2, span = Math.max(0.25, Math.min(1200, (V.t1 - V.t0) * k));
    const f = (c - V.t0) / (V.t1 - V.t0);
    V.t0 = Math.max(0, c - span * f); V.t1 = V.t0 + span;
  };
  const zoomP = (k, at) => {
    const c = at ?? (V.lo + V.hi) / 2, span = Math.max(6, Math.min(72, (V.hi - V.lo) * k));
    const f = (c - V.lo) / (V.hi - V.lo);
    V.lo = Math.max(12, c - span * f); V.hi = Math.min(120, V.lo + span);
  };
  $('.nted-fit').onclick = () => { fit(); draw(); };
  $('.nted-zi').onclick = () => { zoomT(0.6); draw(); };
  $('.nted-zo').onclick = () => { zoomT(1.6); draw(); };
  const fb = $('.nted-follow');
  const syncFollow = () => fb.classList.toggle('on', follow);
  fb.onclick = () => { follow = !follow; syncFollow(); };
  syncFollow();

  // ---- 波形與原始音高曲線（背景）----
  let bgCache = null;   // { key, pitch: [{t, m}], peaks: [{t, v}] }
  const buildBg = () => {
    const t = store.track(owner);
    const key = (t?.clips || []).map(c => c.id + c.start + c.offset + c.duration).join('|');
    if (bgCache && bgCache.key === key) return bgCache;
    const pitch = [], peaks = [];
    for (const c of t?.clips || []) {
      if (isMidiClip(c)) continue;
      const b = store.buffers.get(c.bufferId); if (!b) continue;
      const d = b.getChannelData(0), sr = b.sampleRate, step = Math.round(sr * 0.01);
      const s0 = Math.floor(c.offset * sr), s1 = Math.min(b.length, Math.floor((c.offset + c.duration) * sr));
      for (let i = s0; i < s1; i += step) { let m = 0; for (let k = i; k < Math.min(s1, i + step); k += 4) m = Math.max(m, Math.abs(d[k])); peaks.push({ t: c.start + (i - s0) / sr, v: m }); }
      // 原始音高：用 detectNotes 的格子太粗，這裡直接用它的偵測結果畫成段落即可
      for (const n of detectNotes(b, c.offset, Math.min(c.duration, 600))) pitch.push({ s: c.start + n.s, e: c.start + n.e, m: n.midi });
    }
    bgCache = { key, pitch, peaks };
    return bgCache;
  };

  // ---- 選取 ----
  let sel = new Set(), marquee = null, hover = null;
  const selected = () => [...sel].map(i => notes()[i]).filter(Boolean);

  // ---- 繪製 ----
  function draw() {
    if (!win.isConnected) return;
    const dpr = devicePixelRatio || 1, w = W(), h = H();
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = cssVar('--cv-bg-b'); g.fillRect(0, 0, w, h);
    const rh = rowH();
    // 列：音階內的音比較亮
    for (let m = Math.floor(V.lo); m <= Math.ceil(V.hi); m++) {
      const y = yOf(m + 0.5), pc = ((m % 12) + 12) % 12, inKey = (P.mask >> pc) & 1;
      g.fillStyle = BLACK.has(pc) ? (inKey ? ink(.035) : 'rgba(0,0,0,.22)') : (inKey ? ink(.085) : ink(.04));
      g.fillRect(KEY_W, y, w - KEY_W, rh);
      if (pc === 0) { g.fillStyle = ink(.16); g.fillRect(KEY_W, y + rh - 1, w - KEY_W, 1); }
    }
    // 時間格線
    const span = V.t1 - V.t0, px = (w - KEY_W) / span;
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
    const st = steps.find(s => s * px > 70) || 120;
    for (let t = Math.ceil(V.t0 / st) * st; t <= V.t1; t += st) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = ink(.07); g.beginPath(); g.moveTo(x, RULER_H); g.lineTo(x, h); g.stroke();
    }
    // 波形
    const bg = buildBg();
    g.fillStyle = ink(.07);
    const mid = RULER_H + (h - RULER_H) / 2, amp = (h - RULER_H) * 0.45;
    for (const p of bg.peaks) {
      if (p.t < V.t0 || p.t > V.t1) continue;
      const x = xOf(p.t), v = p.v * amp;
      g.fillRect(x, mid - v, Math.max(1, px * 0.01), v * 2);
    }
    // 原本唱的音（細線）
    g.strokeStyle = `rgba(${cssVar('--cv-orig')},.45)`; g.lineWidth = 1.5;
    for (const p of bg.pitch) {
      if (p.e < V.t0 || p.s > V.t1) continue;
      g.beginPath(); g.moveTo(xOf(p.s), yOf(p.m)); g.lineTo(xOf(p.e), yOf(p.m)); g.stroke();
    }
    // 音符
    const all = notes();
    g.font = '11px ui-monospace, Consolas'; g.textBaseline = 'middle';
    all.forEach((n, i) => {
      if (n.e < V.t0 || n.s > V.t1) return;
      const x = xOf(n.s), x2 = xOf(n.e), y = yOf(n.midi), hh = Math.max(8, rh * 0.86);
      const moved = n.orig != null && Math.abs(n.midi - n.orig) > 0.05, on = sel.has(i), amt = n.amt ?? 1;
      // 原音位置 → 新音高的連線
      if (moved) {
        g.strokeStyle = 'rgba(247,143,195,.5)'; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x + 3, yOf(n.orig)); g.lineTo(x + 3, y); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(247,143,195,.18)'; g.fillRect(x, yOf(n.orig) - hh / 2, x2 - x, hh);
      }
      g.globalAlpha = 0.35 + 0.65 * amt;
      g.fillStyle = on ? '#ffd36b' : moved ? '#f78fc3' : '#4f9dff';
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y - hh / 2, Math.max(3, x2 - x), hh, Math.min(5, (x2 - x) / 2)); else g.rect(x, y - hh / 2, Math.max(3, x2 - x), hh);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = on ? '#fff' : 'rgba(0,0,0,.35)'; g.lineWidth = on ? 1.5 : 1; g.stroke();
      if (x2 - x > 34 && hh >= 10) {
        g.fillStyle = '#0b0c0f'; g.textAlign = 'left';
        const cents = moved ? ` ${n.midi - n.orig > 0 ? '+' : ''}${(n.midi - n.orig).toFixed(1)}` : '';
        g.fillText(noteOf(n.midi) + cents, x + 5, y + 0.5);
      }
      if (hover && hover.i === i && hover.edge) { g.fillStyle = '#fff'; g.fillRect(hover.edge < 0 ? x : x2 - 3, y - hh / 2, 3, hh); }
    });
    // 框選
    if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      g.fillStyle = 'rgba(79,157,255,.12)'; g.strokeStyle = 'rgba(79,157,255,.8)';
      g.fillRect(x, y, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0));
      g.strokeRect(x + .5, y + .5, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0));
    }
    // 鋼琴鍵
    g.fillStyle = cssVar('--cv-bg-a'); g.fillRect(0, RULER_H, KEY_W, h - RULER_H);
    for (let m = Math.floor(V.lo); m <= Math.ceil(V.hi); m++) {
      const y = yOf(m + 0.5), pc = ((m % 12) + 12) % 12;
      g.fillStyle = BLACK.has(pc) ? '#1c1d22' : '#d8dae0';
      g.fillRect(0, y + 0.5, KEY_W - 2, rh - 1);
      if ((P.mask >> pc) & 1) { g.fillStyle = pc === P.key ? '#3fd88a' : 'rgba(63,216,138,.55)'; g.fillRect(KEY_W - 5, y + 1, 3, rh - 2); }
      if (rh >= 9 && (pc === 0 || rh >= 13)) { g.fillStyle = BLACK.has(pc) ? '#aaa' : '#333'; g.font = `${Math.min(10, rh - 2)}px ui-monospace`; g.textAlign = 'left'; g.fillText(noteOf(m), 3, y + rh / 2); }
    }
    // 時間尺
    g.fillStyle = cssVar('--cv-bg-a'); g.fillRect(0, 0, w, RULER_H);
    g.fillStyle = ink(.12); g.fillRect(0, RULER_H - 1, w, 1);
    g.fillStyle = cssVar('--cv-tx2'); g.font = '10px ui-monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (let t = Math.ceil(V.t0 / st) * st; t <= V.t1; t += st) {
      const x = xOf(t);
      const lbl = t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(st < 1 ? 1 : 0).padStart(st < 1 ? 4 : 2, '0')}` : `${st < 1 ? t.toFixed(st < 0.5 ? 2 : 1) : t.toFixed(0)}s`;
      g.fillRect(x, RULER_H - 6, 1, 5); g.fillText(lbl, x + 3, 14);
    }
    // 播放頭
    const pos = engine.currentTime();
    if (pos >= V.t0 && pos <= V.t1) { g.fillStyle = '#ff4d4d'; g.fillRect(Math.round(xOf(pos)), 0, 1.5, h); }
    if (!all.length) {
      g.fillStyle = cssVar('--cv-tx2'); g.font = '13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('按上方「分析這一軌」，把錄音切成一顆一顆的音符', KEY_W + (w - KEY_W) / 2, RULER_H + (h - RULER_H) / 2);
    }
    syncFoot();
  }

  // ---- 命中測試 ----
  const hit = (x, y) => {
    const all = notes(), hh = Math.max(8, rowH() * 0.86);
    for (let i = all.length - 1; i >= 0; i--) {
      const n = all[i], x1 = xOf(n.s), x2 = xOf(n.e), ny = yOf(n.midi);
      if (Math.abs(y - ny) > hh / 2 + 1 || x < x1 - 3 || x > x2 + 3) continue;
      const ew = Math.min(7, (x2 - x1) / 3);
      return { i, edge: x <= x1 + ew ? -1 : x >= x2 - ew ? 1 : 0 };
    }
    return null;
  };

  // ---- 滑鼠 ----
  cv.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    hover = y > RULER_H && x > KEY_W ? hit(x, y) : null;
    cv.style.cursor = y < RULER_H ? 'pointer' : hover ? (hover.edge ? 'ew-resize' : 'grab') : x < KEY_W ? 'default' : 'crosshair';
  });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('pointerdown', e => {
    cv.focus();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (y < RULER_H) { engine.seek(Math.max(0, tOf(x))); return; }
    if (x < KEY_W || e.button !== 0) return;
    const h = hit(x, y);
    cv.setPointerCapture(e.pointerId);
    if (!h) {
      if (!e.shiftKey) sel.clear();
      marquee = { x0: x, y0: y, x1: x, y1: y, base: new Set(sel) };
      const mv = ev => {
        marquee.x1 = ev.clientX - r.left; marquee.y1 = ev.clientY - r.top;
        const a = tOf(Math.min(marquee.x0, marquee.x1)), z = tOf(Math.max(marquee.x0, marquee.x1));
        const hi = mOf(Math.min(marquee.y0, marquee.y1)), lo = mOf(Math.max(marquee.y0, marquee.y1));
        sel = new Set(marquee.base);
        notes().forEach((n, i) => { if (n.e > a && n.s < z && n.midi > lo - 0.5 && n.midi < hi + 0.5) sel.add(i); });
      };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); marquee = null; };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
      return;
    }
    if (e.shiftKey) { sel.has(h.i) ? sel.delete(h.i) : sel.add(h.i); return; }
    if (!sel.has(h.i)) sel = new Set([h.i]);
    store.checkpoint();
    const list = selected().map(n => ({ n, s: n.s, e: n.e, m: n.midi }));
    const x0 = x, y0 = y;
    let moved = false;
    cv.style.cursor = h.edge ? 'ew-resize' : 'grabbing';
    const mv = ev => {
      const dt = (ev.clientX - r.left - x0) / (W() - KEY_W) * (V.t1 - V.t0);
      const dm = -(ev.clientY - r.top - y0) / rowH();
      if (Math.abs(ev.clientX - r.left - x0) + Math.abs(ev.clientY - r.top - y0) > 2) moved = true;
      for (const o of list) {
        if (h.edge < 0) o.n.s = Math.min(o.e - 0.03, Math.max(0, o.s + dt));
        else if (h.edge > 0) o.n.e = Math.max(o.s + 0.03, o.e + dt);
        else {
          o.n.s = Math.max(0, o.s + dt); o.n.e = o.n.s + (o.e - o.s);
          // 預設一次移動整個半音（保留原本的 cent 偏差）；按住 Alt 自由移動（0.1 半音）
          o.n.midi = Math.round((o.m + (ev.altKey ? dm : Math.round(dm))) * 10) / 10;
        }
      }
      live();
    };
    const up = () => {
      cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up);
      if (moved) { resort(); changed(); } else store.undoStack.pop();   // 沒有真的動到：取消剛剛的還原點
    };
    cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
  });
  // 雙擊：在該位置切開
  cv.addEventListener('dblclick', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const h = hit(x, y); if (!h) return;
    splitAt(h.i, tOf(x));
  });
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    if (!sel.has(h.i)) sel = new Set([h.i]);
    del();
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    if (e.ctrlKey || e.metaKey) zoomT(k, tOf(x));
    else if (e.altKey) zoomP(k, mOf(y));
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const d = (e.deltaX || e.deltaY) / (W() - KEY_W) * (V.t1 - V.t0); V.t0 = Math.max(0, V.t0 + d); V.t1 = V.t0 + (V.t1 - (V.t0 - d)); }
    else { const d = e.deltaY / rowH() / 3; const sp = V.hi - V.lo; V.lo = Math.max(12, Math.min(120 - sp, V.lo - d)); V.hi = V.lo + sp; }
    follow = false; syncFollow();
  }, { passive: false });

  // ---- 鍵盤 ----
  cv.addEventListener('keydown', e => {
    e.stopPropagation();
    const k = e.key;
    if (k === 'Delete' || k === 'Backspace') { del(); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { nudge((k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 1)); e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { shift((k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01)); e.preventDefault(); }
    else if ((k === 'a' || k === 'A') && (e.ctrlKey || e.metaKey)) { sel = new Set(notes().map((_, i) => i)); e.preventDefault(); }
    else if ((k === 'z' || k === 'Z') && (e.ctrlKey || e.metaKey)) { e.shiftKey ? store.redo() : store.undo(); e.preventDefault(); }
    else if (k === 'f' || k === 'F') { fit(); }
    else if (k === ' ') { engine.playing ? engine.stop() : engine.play(); e.preventDefault(); }
    else if (k === 'Escape') { if (sel.size) sel.clear(); else win._close(); }
  });

  // ---- 動作 ----
  const resort = () => {
    const keep = new Set(selected());
    notes().sort((a, b) => a.s - b.s);
    sel = new Set(notes().map((n, i) => (keep.has(n) ? i : -1)).filter(i => i >= 0));
  };
  const targets = () => (sel.size ? selected() : notes());
  function nudge(d) { const l = selected(); if (!l.length) return; store.checkpoint(); l.forEach(n => { n.midi = Math.round((n.midi + d) * 10) / 10; }); changed(); }
  function shift(d) { const l = selected(); if (!l.length) return; store.checkpoint(); l.forEach(n => { n.s = Math.max(0, n.s + d); n.e += d; }); resort(); changed(); }
  function del() {
    if (!sel.size) return;
    store.checkpoint();
    const rm = new Set(selected());
    P.notes = notes().filter(n => !rm.has(n)); sel.clear(); changed();
  }
  function splitAt(i, t) {
    const n = notes()[i]; if (!n || t <= n.s + 0.03 || t >= n.e - 0.03) return;
    store.checkpoint();
    notes().splice(i + 1, 0, { ...n, s: t }); n.e = t;
    sel = new Set([i, i + 1]); changed();
  }
  $('.nted-split').onclick = () => {
    const t = engine.currentTime();
    const i = notes().findIndex((n, k) => (sel.size ? sel.has(k) : true) && t > n.s && t < n.e);
    if (i < 0) { toast('把播放頭移到要切開的音符上（或直接在音符上雙擊）', 'warn'); return; }
    splitAt(i, t);
  };
  $('.nted-del').onclick = del;
  $('.nted-snap').onclick = () => {
    const l = targets(); if (!l.length) return;
    store.checkpoint();
    for (const n of l) {
      let best = Math.round(n.midi), bd = 99;
      for (let k = Math.floor(n.midi) - 6; k <= Math.ceil(n.midi) + 6; k++) if ((P.mask >> (((k % 12) + 12) % 12)) & 1) { const d = Math.abs(k - n.midi); if (d < bd) { bd = d; best = k; } }
      n.midi = best;
    }
    changed(); toast(`已把 ${l.length} 個音對齊到音階`);
  };
  $('.nted-reset').onclick = () => {
    const l = targets(); if (!l.length) return;
    store.checkpoint(); l.forEach(n => { if (n.orig != null) n.midi = n.orig; n.amt = 1; }); changed();
  };
  const onChk = $('.nted-on input');
  onChk.checked = P.notesOn !== false;
  onChk.onchange = () => { store.checkpoint(); P.notesOn = onChk.checked; changed(); };

  $('.nted-analyze').onclick = async () => {
    const t = store.track(owner);
    if (!t || !t.clips?.some(c => !isMidiClip(c))) { toast('這一軌沒有音訊片段可以分析', 'warn'); return; }
    if (notes().length && !confirm('重新分析會取代目前編輯過的音符，確定嗎？（可以 Ctrl+Z 復原）')) return;
    const btn = $('.nted-analyze'); btn.disabled = true; btn.textContent = '分析中…';
    try {
      const out = [];
      for (const c of t.clips) {
        if (isMidiClip(c)) continue;
        const b = store.buffers.get(c.bufferId); if (!b) continue;
        for (const n of detectNotes(b, c.offset, Math.min(c.duration, 600))) {
          const s = c.start + n.s, e = c.start + n.e;
          if (e > c.start + c.duration + 0.001) continue;
          const midi = Math.round(n.midi * 10) / 10;
          out.push({ s, e, midi, orig: midi, amt: 1 });
        }
        await new Promise(r => setTimeout(r));
      }
      out.sort((a, b) => a.s - b.s);
      store.checkpoint();
      P.notes = out; P.notesOn = true; onChk.checked = true; sel.clear(); bgCache = null;
      changed(); fit();
      toast(out.length ? `找到 ${out.length} 個音` : '沒有抓到清楚的音，換一段或先確認錄音音量');
    } catch (err) { toast('分析失敗：' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '分析這一軌'; }
  };

  // ---- 底部：選取音符的數值 ----
  const pitchInp = $('.nted-pitch'), amtInp = $('.nted-amt'), amtV = $('.nted-amtv'), selInfo = $('.nted-sel');
  [pitchInp, amtInp].forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));
  let lastFoot = '';
  function syncFoot() {
    const l = selected();
    const sig = l.map(n => n.midi + ':' + (n.amt ?? 1)).join(',') + '|' + notes().length;
    if (sig === lastFoot) return;
    lastFoot = sig;
    pitchInp.disabled = amtInp.disabled = !l.length;
    if (!l.length) { selInfo.textContent = `${notes().length} 個音 · 沒有選取`; pitchInp.value = ''; amtV.textContent = ''; return; }
    const d = l.map(n => n.midi - (n.orig ?? n.midi)), same = d.every(v => Math.abs(v - d[0]) < 0.01);
    selInfo.textContent = l.length === 1 ? `選取 ${noteOf(l[0].midi)}（原本 ${noteOf(l[0].orig ?? l[0].midi)}）· ${(l[0].e - l[0].s).toFixed(2)} 秒` : `選取 ${l.length} 個音`;
    if (document.activeElement !== pitchInp) pitchInp.value = same ? d[0].toFixed(1) : '';
    const a = Math.round((l[0].amt ?? 1) * 100);
    if (document.activeElement !== amtInp) amtInp.value = a;
    amtV.textContent = a + '%';
  }
  pitchInp.addEventListener('change', () => {
    const l = selected(); if (!l.length || pitchInp.value === '') return;
    store.checkpoint(); const d = +pitchInp.value;
    l.forEach(n => { n.midi = Math.round(((n.orig ?? n.midi) + d) * 10) / 10; }); changed();
  });
  amtInp.addEventListener('pointerdown', () => store.checkpoint());
  amtInp.addEventListener('input', () => { selected().forEach(n => { n.amt = +amtInp.value / 100; }); amtV.textContent = amtInp.value + '%'; live(); });
  amtInp.addEventListener('change', () => changed());

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { lastFoot = ''; onChange(false); }

  // undo/redo 會換掉 params 物件：重新抓
  let alive = true;
  const onStore = ({ kind }) => {
    if (!alive || (kind !== 'structure' && kind !== 'fx')) return;
    const list = store.track(owner)?.inserts;
    const d = list?.find(x => x.id === desc.id);
    if (!d) { win._close(); return; }
    if (d.params !== P) { const r = { l: win.style.left, t: win.style.top, w: win.style.width, h: win.style.height, max: win.classList.contains('max') }; win._close(); const w2 = openNoteEditor(owner, d, onChange); Object.assign(w2.style, { left: r.l, top: r.t, width: r.w, height: r.h }); if (r.max) w2.classList.add('max'); }
  };
  store.on('change', onStore);

  // ---- 動畫：播放頭、跟隨 ----
  let raf = 0;
  const loop = () => {
    if (!win.isConnected) return;
    if (engine.playing && follow) {
      const pos = engine.currentTime(), span = V.t1 - V.t0;
      if (pos > V.t1 - span * 0.1 || pos < V.t0) { V.t0 = Math.max(0, pos - span * 0.1); V.t1 = V.t0 + span; }
    }
    draw();
    raf = requestAnimationFrame(loop);
  };
  win._close = () => {
    alive = false;
    cancelAnimationFrame(raf); remember(); win.remove(); open.delete(desc.id);
  };
  $('.nted-x').onclick = () => win._close();
  fit();
  raf = requestAnimationFrame(loop);
  setTimeout(() => cv.focus(), 0);
  return win;
}
