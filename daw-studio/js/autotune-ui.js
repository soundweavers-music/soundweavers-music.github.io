// Auto Tune 面板：調音表、即時音高曲線、音階鍵盤、旋鈕、預設值、偵測調性
import { store } from './state.js';
import { engine } from './engine.js';
import { TUNE_SCALES, TUNE_RANGES, NOTE_NAMES_ZH, scaleMask } from './effects.js';
import { detectKeyFromTrack } from './keydetect.js';
import { toast } from './util.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const noteOf = m => NOTE_NAMES_ZH[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

// 修正速度的刻度：0~400 ms，左邊機械、右邊自然
const RETUNE_LABEL = ms => (ms <= 5 ? '機械（T-Pain）' : ms <= 25 ? '快速' : ms <= 70 ? '自然' : ms <= 150 ? '柔和' : '非常柔和');

export const TUNE_PRESETS = [
  { name: '自然修音（推薦）', p: { retune: 45, amount: 100, vibrato: 70 }, tip: '幾乎聽不出處理痕跡，保留歌手原本的顫音與滑音。' },
  { name: '輕微修正', p: { retune: 90, amount: 60, vibrato: 85 }, tip: '只把偏得比較多的音拉回來一點。' },
  { name: '流行（緊）', p: { retune: 18, amount: 100, vibrato: 40 }, tip: '現代流行歌常見的乾淨、準確感。' },
  { name: '機械音（T-Pain）', p: { retune: 0, amount: 100, vibrato: 0 }, tip: '音高瞬間跳到音階音，經典的電子人聲效果。' },
  { name: '慢歌／抒情', p: { retune: 120, amount: 100, vibrato: 90 }, tip: '長音慢慢被拉準，保留情感的起伏。' },
  { name: '饒舌／說唱', p: { retune: 30, amount: 70, vibrato: 30 }, tip: '說唱段落不要修太多，只讓旋律句準一點。' },
];

let raf = 0;

export function tuneEditor(owner, desc, onChange) {
  const P = desc.params;
  const root = document.createElement('div');
  root.className = 'atx';
  root.innerHTML = `
    <div class="atx-top">
      <div class="atx-tuner"><canvas class="atx-meter"></canvas>
        <div class="atx-note"><b>—</b><span>—</span></div></div>
      <div class="atx-graph"><canvas class="atx-cv"></canvas><div class="atx-hint">播放或開啟輸入監聽（I）時顯示即時音高</div></div>
    </div>
    <div class="atx-mid">
      <div class="atx-keysel">
        <label>主音 <select class="atx-key">${NOTE_NAMES_ZH.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
        <label>音階 <select class="atx-scale">${TUNE_SCALES.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}</select></label>
        <button type="button" class="tbtn atx-detect" title="分析這一軌（或整首）的音，推測調性">🔍 偵測調性</button>
        <label>音域 <select class="atx-range">${TUNE_RANGES.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}</select></label>
      </div>
      <div class="atx-piano"></div>
    </div>
    <div class="atx-knobs"></div>
    <div class="atx-pre"></div>`;
  const $ = s => root.querySelector(s);

  // ---------- 音階 ----------
  const keySel = $('.atx-key'), scaleSel = $('.atx-scale'), rangeSel = $('.atx-range');
  keySel.value = P.key; scaleSel.value = P.scale; rangeSel.value = P.range;
  for (const el of [keySel, scaleSel, rangeSel]) el.addEventListener('keydown', e => e.stopPropagation());
  const applyScale = () => {
    const m = scaleMask(P.key, P.scale);
    if (m !== null) P.mask = m;
  };
  keySel.onchange = () => { store.checkpoint(); P.key = +keySel.value; if (P.scale === 9) P.scale = 0, scaleSel.value = 0; applyScale(); changed(); };
  scaleSel.onchange = () => { store.checkpoint(); P.scale = +scaleSel.value; applyScale(); changed(); };
  rangeSel.onchange = () => { store.checkpoint(); P.range = +rangeSel.value; changed(); };

  const piano = $('.atx-piano');
  function renderPiano() {
    piano.innerHTML = '';
    // 白鍵一排、黑鍵疊在上面
    const whites = [0, 2, 4, 5, 7, 9, 11], blacks = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
    const mk = (pc, cls, left) => {
      const b = document.createElement('button');
      b.type = 'button';
      const on = (P.mask >> pc) & 1;
      b.className = `atx-k ${cls}${on ? ' on' : ''}${pc === P.key ? ' root' : ''}`;
      if (left !== undefined) b.style.left = `calc(${(left + 1) / 7 * 100}% - 4.6%)`;
      b.innerHTML = `<span>${NOTE_NAMES_ZH[pc]}</span>`;
      b.title = `${NOTE_NAMES_ZH[pc]}：${on ? '會被修到這個音（點一下排除）' : '不使用（點一下加入）'}`;
      b.onclick = () => {
        store.checkpoint();
        P.mask ^= 1 << pc;
        if (!P.mask) P.mask = 1 << pc;   // 至少保留一個音
        // 改成跟預設音階不同 → 變成「自訂」
        if (scaleMask(P.key, P.scale) !== P.mask) { P.scale = 9; scaleSel.value = 9; }
        changed();
      };
      return b;
    };
    whites.forEach(pc => piano.appendChild(mk(pc, 'w')));
    blacks.forEach(([pc, at]) => piano.appendChild(mk(pc, 'b', at)));
  }

  // ---------- 偵測調性 ----------
  $('.atx-detect').onclick = async () => {
    const btn = $('.atx-detect');
    btn.disabled = true; btn.textContent = '分析中…';
    try {
      const r = await detectKeyFromTrack(owner);
      if (!r) { toast('這一軌沒有足夠的音可以判斷調性', 'warn'); return; }
      store.checkpoint();
      P.key = r.key; P.scale = r.minor ? 1 : 0; applyScale();
      keySel.value = P.key; scaleSel.value = P.scale;
      changed();
      toast(`推測為 ${NOTE_NAMES_ZH[r.key]} ${r.minor ? '小調' : '大調'}（信心 ${Math.round(r.confidence * 100)}%）${r.alt ? `；也可能是 ${r.alt}` : ''}`);
    } catch (e) { toast('偵測失敗：' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '🔍 偵測調性'; }
  };

  // ---------- 旋鈕 ----------
  const knobsBox = $('.atx-knobs');
  const knobs = [
    { k: 'retune', label: '修正速度', min: 0, max: 400, fmt: v => `${Math.round(v)} ms`, sub: RETUNE_LABEL, curve: 2 },
    { k: 'amount', label: '修正強度', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 95 ? '完全' : v >= 50 ? '大部分' : '輕微') },
    { k: 'vibrato', label: '保留顫音', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 70 ? '保留原味' : v >= 30 ? '部分保留' : '拉平') },
    { k: 'mix', label: '濕度', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 99 ? '' : '混入原聲') },
  ];
  const kEls = {};
  for (const K of knobs) {
    const w = document.createElement('div');
    w.className = 'atx-knob';
    w.innerHTML = `<canvas></canvas><b>${K.label}</b><span class="v"></span><em></em>`;
    const cv = w.querySelector('canvas');
    // curve：對數感的刻度（修正速度小數值區細一點）
    const toT = v => Math.pow((v - K.min) / (K.max - K.min), 1 / (K.curve || 1));
    const fromT = t => K.min + Math.pow(Math.max(0, Math.min(1, t)), K.curve || 1) * (K.max - K.min);
    const draw = () => {
      const v = P[K.k], t = toT(v), dpr = devicePixelRatio || 1, S = 74;
      cv.width = S * dpr; cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = S / 2, R = 28, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      g.lineCap = 'round';
      g.lineWidth = 6; g.strokeStyle = '#25272d'; g.beginPath(); g.arc(c, c, R, a0, a1); g.stroke();
      const grad = g.createLinearGradient(0, S, S, 0);
      grad.addColorStop(0, '#35c9a5'); grad.addColorStop(0.5, '#4f9dff'); grad.addColorStop(1, '#b58bff');
      g.strokeStyle = grad; g.shadowColor = 'rgba(79,157,255,.6)'; g.shadowBlur = 8;
      g.beginPath(); g.arc(c, c, R, a0, a0 + (a1 - a0) * t); g.stroke(); g.shadowBlur = 0;
      const ang = a0 + (a1 - a0) * t;
      g.fillStyle = '#2f3238'; g.beginPath(); g.arc(c, c, 19, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(c + Math.cos(ang) * 8, c + Math.sin(ang) * 8); g.lineTo(c + Math.cos(ang) * 17, c + Math.sin(ang) * 17); g.stroke();
      w.querySelector('.v').textContent = K.fmt(v);
      w.querySelector('em').textContent = K.sub ? K.sub(v) : '';
    };
    kEls[K.k] = draw;
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); store.checkpoint(); cv.setPointerCapture(e.pointerId);
      const y0 = e.clientY, t0 = toT(P[K.k]);
      const mv = ev => { P[K.k] = Math.round(fromT(t0 + (y0 - ev.clientY) / (ev.shiftKey ? 600 : 160))); draw(); live(); };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); changed(); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); P[K.k] = Math.round(fromT(toT(P[K.k]) + (e.deltaY < 0 ? 0.03 : -0.03))); draw(); live(); clearTimeout(cv._t); cv._t = setTimeout(changed, 250); }, { passive: false });
    cv.addEventListener('dblclick', () => { store.checkpoint(); P[K.k] = { retune: 40, amount: 100, vibrato: 60, mix: 100 }[K.k]; draw(); changed(); });
    knobsBox.appendChild(w);
  }

  // ---------- 預設值 ----------
  const pre = $('.atx-pre');
  pre.innerHTML = TUNE_PRESETS.map((x, i) => `<button type="button" data-i="${i}" title="${x.tip}">${x.name}</button>`).join('');
  pre.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    store.checkpoint();
    Object.assign(P, TUNE_PRESETS[+b.dataset.i].p);
    Object.values(kEls).forEach(f => f()); changed();
    toast(TUNE_PRESETS[+b.dataset.i].tip);
  };

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { onChange(false); renderPiano(); }

  // ---------- 即時顯示 ----------
  const hist = [];                    // { t, v, mi, out, tgt }
  let last = null, unsub = null, attachedTo = null;
  const attach = () => {
    const inst = engine.ctx && engine.fxInstance(owner, desc.id);
    if (inst === attachedTo) return;
    if (unsub) unsub();
    attachedTo = inst; unsub = null;
    if (inst && inst.onPitch) unsub = inst.onPitch(d => { d._at = performance.now(); last = d; hist.push(d); if (hist.length > 600) hist.shift(); });
  };
  const meter = $('.atx-meter'), cv = $('.atx-cv'), noteEl = $('.atx-note'), hint = $('.atx-hint');
  let needle = 0;
  function frame() {
    if (!root.isConnected) { if (unsub) unsub(); return; }
    attach();
    const dpr = devicePixelRatio || 1;
    // 調音表
    {
      const W = meter.clientWidth || 200, H = meter.clientHeight || 120;
      meter.width = W * dpr; meter.height = H * dpr;
      const g = meter.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = W / 2, cy = H - 14, R = Math.min(W / 2 - 12, H - 26);
      const A = Math.PI * 0.32;
      // 刻度：±50 cent
      for (let c = -50; c <= 50; c += 5) {
        const a = -Math.PI / 2 + c / 50 * A, big = c % 25 === 0;
        g.strokeStyle = c === 0 ? '#3fd88a' : big ? '#6b6f78' : '#3a3d44';
        g.lineWidth = c === 0 ? 3 : big ? 2 : 1;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - (big ? 14 : 8)), cy + Math.sin(a) * (R - (big ? 14 : 8))); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
      }
      g.fillStyle = '#6b6f78'; g.font = '9px ui-monospace'; g.textAlign = 'center';
      for (const c of [-50, -25, 25, 50]) { const a = -Math.PI / 2 + c / 50 * A; g.fillText((c > 0 ? '+' : '') + c, cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9) + 3); }
      const voiced = last && last.v && performance.now() - (last._at || 0) < 400;
      const cents = voiced ? (last.mi - last.tgt) * 100 : 0;
      needle += ((voiced ? Math.max(-50, Math.min(50, cents)) : 0) - needle) * 0.25;
      const a = -Math.PI / 2 + needle / 50 * A;
      const col = Math.abs(needle) < 8 ? '#3fd88a' : Math.abs(needle) < 25 ? '#f5d33d' : '#ff6b6b';
      // 指針光暈
      g.shadowColor = col; g.shadowBlur = voiced ? 12 : 0;
      g.strokeStyle = voiced ? col : '#4a4d55'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); g.stroke();
      g.shadowBlur = 0; g.fillStyle = '#e9eaee'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
      noteEl.querySelector('b').textContent = voiced ? noteOf(last.tgt) : '—';
      noteEl.querySelector('b').style.color = voiced ? col : '';
      noteEl.querySelector('span').textContent = voiced ? `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cent → 修正到 ${noteOf(last.tgt)}` : (engine.playing ? '（無聲／子音）' : '等待聲音…');
    }
    // 音高曲線
    {
      const W = cv.clientWidth || 400, H = cv.clientHeight || 120;
      cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12141a'); bg.addColorStop(1, '#0a0b0e');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const now = engine.ctx ? engine.ctx.currentTime : 0, span = 4;
      const vis = hist.filter(h => h.t > now - span);
      const voicedPts = vis.filter(h => h.v);
      hint.style.display = voicedPts.length ? 'none' : '';
      // 縱軸：最近的音高中心 ±7 半音
      let center = voicedPts.length ? voicedPts.reduce((s, h) => s + h.tgt, 0) / voicedPts.length : 60;
      center = Math.round(center);
      root._center = root._center === undefined ? center : root._center + (center - root._center) * 0.05;
      const c0 = root._center, rng = 7;
      const yOf = m => H / 2 - (m - c0) / rng * (H / 2 - 6);
      for (let m = Math.floor(c0 - rng); m <= Math.ceil(c0 + rng); m++) {
        const pc = ((m % 12) + 12) % 12, inKey = (P.mask >> pc) & 1, y = Math.round(yOf(m)) + 0.5;
        g.strokeStyle = inKey ? (pc === P.key ? 'rgba(63,216,138,.35)' : 'rgba(255,255,255,.12)') : 'rgba(255,255,255,.03)';
        g.lineWidth = inKey ? 1 : 1;
        g.beginPath(); g.moveTo(34, y); g.lineTo(W, y); g.stroke();
        if (inKey) { g.fillStyle = pc === P.key ? '#3fd88a' : '#7d818b'; g.font = '9px ui-monospace'; g.textAlign = 'left'; g.fillText(noteOf(m), 4, y + 3); }
      }
      const xOf = t => 34 + (t - (now - span)) / span * (W - 34);
      const line = (key, style, width, glow) => {
        g.beginPath(); let pen = false;
        for (const h of vis) {
          if (!h.v) { pen = false; continue; }
          const x = xOf(h.t), y = yOf(h[key]);
          pen ? g.lineTo(x, y) : g.moveTo(x, y); pen = true;
        }
        g.strokeStyle = style; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
        g.shadowColor = glow || 'transparent'; g.shadowBlur = glow ? 10 : 0;
        g.stroke(); g.shadowBlur = 0;
      };
      line('mi', 'rgba(180,186,200,.55)', 1.5);                   // 原本唱的
      const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, '#35c9a5'); lg.addColorStop(0.6, '#4f9dff'); lg.addColorStop(1, '#f78fc3');
      line('out', lg, 2.6, 'rgba(79,157,255,.8)');               // 修正後
      // 現在位置
      g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(W - 1, 0, 1, H);
      g.font = '10px sans-serif'; g.textAlign = 'right';
      g.fillStyle = 'rgba(180,186,200,.8)'; g.fillText('— 原聲', W - 70, 12);
      g.fillStyle = '#4f9dff'; g.fillText('— 修正後', W - 8, 12);
    }
    raf = requestAnimationFrame(frame);
  }
  renderPiano();
  Object.values(kEls).forEach(f => f());
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  root._dispose = () => { cancelAnimationFrame(raf); if (unsub) unsub(); };
  root._refresh = () => { keySel.value = P.key; scaleSel.value = P.scale; rangeSel.value = P.range; renderPiano(); Object.values(kEls).forEach(f => f()); };
  return root;
}
