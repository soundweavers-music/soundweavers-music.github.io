// 呼吸聲面板：偵測結果 → 勾選 → 變成音量的自動化（不是真的重新算音訊）
// 右鍵軌道或片段「去除呼吸聲…」會打開這個面板。
import { store, spb } from './state.js';
import { engine as eng } from './engine.js';
import { analyzeBreaths } from './breath.js';
import { lane, valueAt } from './automation.js';
import { setAutoView } from './automation-ui.js';
import { toast } from './util.js';

let panel = null;

const audioClipsOf = t => (t.clips || []).filter(c => c.bufferId && !c.notes);
const clipSec = c => ({ start: c.start, dur: c.duration, off: c.offset || 0 });

export function openBreathPanel(trackId, clipId = null) {
  const t = store.track(trackId);
  if (!t) return;
  const clips = clipId ? [store.findClip(clipId)?.clip].filter(Boolean) : audioClipsOf(t);
  if (!clips.length) { toast('這一軌沒有可以分析的音訊片段', 'warn'); return; }
  closeBreathPanel();
  const state = { clips, items: [], sens: 0.5, mode: 'remove', db: 12, hover: -1 };

  const el = document.createElement('div');
  el.className = 'brx-panel';
  el.innerHTML = `
    <div class="brx-head"><span class="brx-title">呼吸聲</span><span class="brx-owner"></span>
      <button class="tbtn ghost brx-x" title="關閉 (Esc)">✕</button></div>
    <canvas class="brx-cv"></canvas>
    <div class="brx-list"></div>
    <div class="brx-opts">
      <label class="brx-sens">靈敏度 <input type="range" min="0" max="100" step="1"></label>
      <button class="tbtn ghost brx-again">重新偵測</button>
    </div>
    <div class="brx-mode">
      <label><input type="radio" name="brxMode" value="remove" checked> 去除（靜音）</label>
      <label><input type="radio" name="brxMode" value="reduce"> 降低 <input type="range" class="brx-db" min="3" max="40" step="1" value="12"> <b class="brx-dbv">12 dB</b></label>
    </div>
    <p class="brx-note">只會寫入這一軌的<b>音量自動化</b>（不是重新算音訊），套用後會打開自動化檢視，波形上就看得到凹下去的地方。</p>
    <div class="brx-actions"><button class="tbtn brx-apply">套用</button><button class="tbtn ghost brx-cancel">取消</button></div>`;
  el.querySelector('.brx-owner').textContent = t.name + (clipId ? '／1 個片段' : `／${clips.length} 個片段`);
  document.body.appendChild(el);
  panel = { el, trackId };
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(innerWidth - 560, innerWidth / 2 - 280)) + 'px';
  el.style.top = Math.max(8, (innerHeight - r.height) / 2) + 'px';

  const $ = s => el.querySelector(s);
  const cv = $('.brx-cv');
  const sens = $('.brx-sens input');
  sens.value = state.sens * 100;

  // ---------- 偵測 ----------
  function detect() {
    state.items = [];
    for (const c of state.clips) {
      const buf = store.buffers.get(c.bufferId);
      if (!buf) continue;
      const regs = analyzeBreaths(buf, c.offset || 0, c.duration, { sens: state.sens });
      for (const g of regs) {
        state.items.push({
          clipId: c.id,
          start: c.start + (g.start - (c.offset || 0)),
          end: c.start + (g.end - (c.offset || 0)),
          relDb: g.relDb,
          on: true,
        });
      }
    }
    state.items.sort((a, b) => a.start - b.start);
    renderList();
    draw();
  }

  function renderList() {
    const box = $('.brx-list');
    box.innerHTML = '';
    if (!state.items.length) {
      box.innerHTML = '<p class="brx-empty">沒有找到呼吸聲。可以把「靈敏度」往右拉一點再試一次。</p>';
      return;
    }
    state.items.forEach((it, i) => {
      const row = document.createElement('label');
      row.className = 'brx-item' + (it.on ? '' : ' off');
      const len = it.end - it.start;
      row.innerHTML = `<input type="checkbox" ${it.on ? 'checked' : ''}>
        <b>${fmtSec(it.start)}</b><span>${len.toFixed(2)} 秒</span><em>約 ${Math.round(it.relDb)} dB（相對歌聲）</em>`;
      row.querySelector('input').onchange = e => { it.on = e.target.checked; row.classList.toggle('off', !it.on); draw(); };
      row.addEventListener('pointerenter', () => { state.hover = i; draw(); });
      row.addEventListener('pointerleave', () => { if (state.hover === i) { state.hover = -1; draw(); } });
      box.appendChild(row);
    });
    const on = state.items.filter(x => x.on).length;
    $('.brx-apply').textContent = `套用（${on} 段）`;
  }

  // ---------- 波形預覽 ----------
  let raf = 0;
  panel.raf = () => raf;
  function draw() {
    if (!el.isConnected) return;
    const dpr = devicePixelRatio || 1;
    const W = cv.clientWidth || 520, H = cv.clientHeight || 120;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#12141a'); bg.addColorStop(1, '#0a0b0e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const t0 = Math.min(...state.clips.map(c => c.start));
    const t1 = Math.max(...state.clips.map(c => c.start + c.duration));
    const span = Math.max(0.1, t1 - t0);
    const xOf = sec => (sec - t0) / span * W;
    // 每個片段的包絡
    for (const c of state.clips) {
      const buf = store.buffers.get(c.bufferId);
      const left = xOf(c.start), w = Math.max(2, xOf(c.start + c.duration) - left);
      g.fillStyle = t.color + '22'; g.fillRect(left, 0, w, H);
      if (!buf) continue;
      const d = buf.getChannelData(0);
      const sr = buf.sampleRate;
      const cols = Math.max(1, Math.round(w));
      g.strokeStyle = t.color + 'cc'; g.lineWidth = 1;
      const base = H / 2;
      for (let i = 0; i < cols; i++) {
        const from = (c.offset || 0) + (i / cols) * c.duration;
        const to = (c.offset || 0) + ((i + 1) / cols) * c.duration;
        let pk = 0;
        const a = Math.floor(from * sr), b = Math.min(d.length, Math.ceil(to * sr));
        for (let k = a; k < b; k += 3) { const v = Math.abs(d[k]); if (v > pk) pk = v; }
        const hh = Math.min(H / 2 - 2, pk * (H / 2 - 4) * 1.8);
        g.beginPath(); g.moveTo(left + i + .5, base - hh); g.lineTo(left + i + .5, base + hh); g.stroke();
      }
    }
    // 呼吸段
    state.items.forEach((it, i) => {
      const x = xOf(it.start), w = Math.max(2, xOf(it.end) - x);
      const hot = it.on;
      g.fillStyle = hot ? (state.hover === i ? 'rgba(255,255,255,.35)' : 'rgba(255,107,107,.28)') : 'rgba(255,255,255,.08)';
      g.fillRect(x, 0, w, H);
      g.strokeStyle = hot ? '#ff6b6b' : 'rgba(255,255,255,.25)';
      g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.moveTo(x + w - .5, 0); g.lineTo(x + w - .5, H); g.stroke();
      if (w > 34) {
        g.fillStyle = hot ? '#ffb3b3' : 'rgba(255,255,255,.45)';
        g.font = '9px ui-monospace'; g.fillText(`${Math.round(it.relDb)}dB`, x + 3, 10);
      }
    });
    g.fillStyle = 'rgba(255,255,255,.4)'; g.font = '10px ui-monospace';
    g.fillText(`${fmtSec(t0)} → ${fmtSec(t1)}`, 6, H - 6);
    raf = requestAnimationFrame(draw);
  }

  // ---------- 套用 ----------
  $('.brx-apply').onclick = () => {
    const sel = state.items.filter(x => x.on);
    if (!sel.length) { toast('沒有勾選任何一段', 'warn'); return; }
    const L = lane(t, 'volume');
    const orig = L.points.slice();
    const baseAt = beat => { const v = valueAt(orig, beat); return v == null ? (t.volumeDb ?? 0) : v; };
    const b = spb();
    const fadeSec = 0.02;
    const adds = [];
    if (!orig.length) adds.push({ t: 0, v: t.volumeDb ?? 0 });
    const cuts = sel.map(r => [r.start / b, r.end / b]);
    for (const r of sel) {
      const s = r.start / b, e = r.end / b;
      const fade = Math.min(fadeSec, (e - s) * 0.3) / b;
      const base = baseAt(Math.max(0, s - fade));
      const target = Math.max(-60, state.mode === 'remove' ? -60 : base - state.db);
      adds.push(
        { t: Math.max(0, s - fade), v: base },
        { t: s, v: target },
        { t: e, v: target },
        { t: Math.min(e + fade, e + 0.05 / b), v: base },
      );
    }
    // 先把要處理的區間裡原本的點拿掉（重複套用時才不會疊成一團）
    const keep = orig.filter(p => !cuts.some(([s, e]) => p.t > s - 0.001 && p.t < e + 0.001));
    const all = keep.concat(adds).sort((x, y) => x.t - y.t);
    // 同一個時間點只留最後一個
    const dedup = [];
    for (const p of all) { if (dedup.length && Math.abs(dedup[dedup.length - 1].t - p.t) < 1e-6) dedup[dedup.length - 1] = p; else dedup.push(p); }
    store.checkpoint();
    L.points = dedup;
    L.on = true;
    t.autoParam = 'volume';
    store.changed('mix');
    setAutoView(true);
    if (eng.playing) eng.restartAt(eng.currentTime());
    toast(`已把 ${sel.length} 段呼吸聲寫進「${t.name}」的音量自動化（Ctrl+Z 可復原）`);
    closeBreathPanel();
  };
  $('.brx-cancel').onclick = closeBreathPanel;
  $('.brx-x').onclick = closeBreathPanel;
  $('.brx-again').onclick = () => { state.sens = Number(sens.value) / 100; detect(); };
  // 拖靈敏度不要每一格都重算（分析是一整段音訊的 FFT）
  let sensTimer = 0;
  sens.addEventListener('input', () => {
    clearTimeout(sensTimer);
    sensTimer = setTimeout(() => { state.sens = Number(sens.value) / 100; detect(); }, 220);
  });
  el.querySelectorAll('input[name=brxMode]').forEach(r => {
    r.onchange = () => {
      state.mode = el.querySelector('input[name=brxMode]:checked').value;
      $('.brx-db').disabled = state.mode === 'remove';
    };
  });
  $('.brx-db').oninput = e => { state.db = Number(e.target.value); $('.brx-dbv').textContent = `${state.db} dB`; };
  $('.brx-db').disabled = true;

  // 拖曳標題列移動
  const head = $('.brx-head');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const rr = el.getBoundingClientRect(), x0 = e.clientX - rr.left, y0 = e.clientY - rr.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { el.style.left = Math.max(0, ev.clientX - x0) + 'px'; el.style.top = Math.max(0, ev.clientY - y0) + 'px'; };
    const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
  });

  detect();
  requestAnimationFrame(draw);
}

export function closeBreathPanel() {
  if (panel) {
    try { cancelAnimationFrame(panel.raf && panel.raf()); } catch (_) { /* noop */ }
    if (panel.el) panel.el.remove();
  }
  panel = null;
}

const fmtSec = s => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
};
