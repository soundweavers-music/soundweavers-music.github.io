// 人聲修音面板：調音表、即時音高曲線、音階鍵盤、旋鈕、預設值、偵測調性
import { store } from './state.js';
import { engine } from './engine.js';
import { TUNE_SCALES, TUNE_RANGES, NOTE_NAMES_ZH, scaleMask } from './effects.js';
import { detectKeyFromTrack } from './keydetect.js';
import { toast } from './util.js';
import { openNoteEditor } from './note-editor.js';
import { addInputHook } from './midi-input.js';
import { cssVar, ink } from './theme.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const noteOf = m => NOTE_NAMES_ZH[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

// i18n 抽取器只掃得到「單行引號字串」，所以新字串集中在這裡再插進樣板
const UI = { tuneable: '可修音', mode: '工作模式', corr: '修正量' };

// 修正速度的刻度：0~400 ms，左邊機械、右邊自然
const RETUNE_LABEL = ms => (ms <= 5 ? '機械（T-Pain）' : ms <= 25 ? '快速' : ms <= 70 ? '自然' : ms <= 150 ? '柔和' : '非常柔和');

export const TUNE_PRESETS = [
  { name: '自然修音（推薦）', p: { retune: 45, amount: 100, vibrato: 70, humanize: 35, flex: 25 }, tip: '幾乎聽不出處理痕跡：保留顫音、長音留一點自然漂移，接近準的音不硬拉。' },
  { name: '輕微修正', p: { retune: 90, amount: 60, vibrato: 85, humanize: 45, flex: 45 }, tip: '只把偏得比較多的音拉回來一點，表情幾乎原封不動。' },
  { name: '流行（緊）', p: { retune: 18, amount: 100, vibrato: 40, humanize: 0, flex: 0 }, tip: '現代流行歌常見的乾淨、準確感。' },
  { name: '機械音（T-Pain）', p: { retune: 0, amount: 100, vibrato: 0, humanize: 0, flex: 0 }, tip: '音高瞬間跳到音階音，經典的電子人聲效果。' },
  { name: '慢歌／抒情', p: { retune: 120, amount: 100, vibrato: 90, humanize: 55, flex: 40 }, tip: '長音慢慢被拉準，保留情感的起伏。' },
  { name: '饒舌／說唱', p: { retune: 30, amount: 70, vibrato: 30, humanize: 25, flex: 60 }, tip: '說唱段落不要修太多，只讓旋律句準一點。' },
  { name: '現場演出（低延遲）', p: { live: 1, retune: 8, amount: 100, vibrato: 25, humanize: 0, flex: 0, mix: 100 }, tip: '16 ms 延遲，邊唱邊聽幾乎沒有回音感；最低音域到 100 Hz。' },
];

export function tuneEditor(owner, desc, onChange) {
  let raf = 0;   // 每個面板自己一個（可以同時開好幾個修音面板）
  const P = desc.params;
  const root = document.createElement('div');
  root.className = 'atx';
  root.innerHTML = `
    <div class="atx-top">
      <div class="atx-tuner">
        <canvas class="atx-meter"></canvas>
        <div class="atx-note"><b>—</b><span>—</span></div>
        <div class="atx-corr">
          <div class="atx-corrhead"><span>${UI.corr}</span><em>±0 cent</em></div>
          <canvas class="atx-corrbar"></canvas>
        </div>
      </div>
      <div class="atx-graph">
        <canvas class="atx-cv"></canvas>
        <div class="atx-hint">播放或開啟輸入監聽（I）時顯示即時音高</div>
        <div class="atx-legend"><i class="atx-lo"></i>原聲<i class="atx-lc"></i>修正後<i class="atx-lt"></i>目標音</div>
      </div>
    </div>
    <div class="atx-mid">
      <div class="atx-keysel">
        <label>主音 <select class="atx-key">${NOTE_NAMES_ZH.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
        <label>音階 <select class="atx-scale">${TUNE_SCALES.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}</select></label>
        <label title="整把樂器不是以 440 Hz 調音時，改這裡（415–466）">參考 A4 <input type="number" class="atx-refp" min="415" max="466" step="1" value="440"> Hz</label>
        <label>音域 <select class="atx-range">${TUNE_RANGES.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}</select></label>
        <button type="button" class="tbtn atx-detect" title="分析這一軌（或整首）的音，推測調性">🔍 偵測調性</button>
      </div>
      <div class="atx-piano"></div>
      <div class="atx-chips">
        <span class="atx-chip"><b>${UI.tuneable}</b><i class="atx-c-notes">—</i></span>
        <span class="atx-chip"><b>${UI.mode}</b><i class="atx-c-mode">標準</i></span>
        <span class="atx-chip"><b>MIDI 控制</b><i class="atx-c-midi">關</i></span>
      </div>
    </div>
    <div class="atx-knobs"></div>
    <div class="atx-live">
      <button type="button" class="atx-livebtn"></button>
      <button type="button" class="atx-midibtn" title="開啟後，用 MIDI 鍵盤彈一個音就能把它加進／移出可修音的音（不會發出聲音）">MIDI 控制：關</button>
      <span class="atx-livehint"></span>
    </div>
    <div class="atx-notes">
      <div class="atx-nhead">
        <b>音符編輯</b>
        <span class="atx-ninfo"></span>
        <button type="button" class="tbtn primary atx-nopen" title="在大視窗裡一顆一顆調整音高、長度（可以拉大、最大化）">🎼 開啟音符編輯器</button>
      </div>
      <canvas class="atx-ncv" title="點一下開啟音符編輯器"></canvas>
    </div>
    <div class="atx-pre"></div>`;
  const $ = s => root.querySelector(s);

  // ---------- 音階 ----------
  const keySel = $('.atx-key'), scaleSel = $('.atx-scale'), rangeSel = $('.atx-range'), refInp = $('.atx-refp');
  keySel.value = P.key; scaleSel.value = P.scale; rangeSel.value = P.range;
  refInp.value = P.refp || 440;
  for (const el of [keySel, scaleSel, rangeSel, refInp]) el.addEventListener('keydown', e => e.stopPropagation());
  const applyScale = () => {
    const m = scaleMask(P.key, P.scale);
    if (m !== null) P.mask = m;
  };
  keySel.onchange = () => { store.checkpoint(); P.key = +keySel.value; if (P.scale === 9) P.scale = 0, scaleSel.value = 0; applyScale(); changed(); };
  scaleSel.onchange = () => { store.checkpoint(); P.scale = +scaleSel.value; applyScale(); changed(); };
  rangeSel.onchange = () => { store.checkpoint(); P.range = +rangeSel.value; changed(); };
  refInp.onchange = () => {
    const v = Math.max(415, Math.min(466, Math.round(+refInp.value || 440)));
    store.checkpoint(); P.refp = v; refInp.value = v; changed();
  };

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

  // ---------- 狀態列 ----------
  const chipNotes = $('.atx-c-notes'), chipMode = $('.atx-c-mode'), chipMidi = $('.atx-c-midi');
  const maskCount = () => { let n = 0; for (let i = 0; i < 12; i++) if ((P.mask >> i) & 1) n++; return n; };
  function syncChips() {
    chipNotes.textContent = `${maskCount()} / 12 音`;
    chipMode.textContent = P.live ? '現場 16 ms' : '標準 32 ms';
    chipMidi.textContent = midiOn ? '開' : '關';
  }

  // ---------- MIDI 控制：用 MIDI 鍵盤點音符加入／排除可修音的音 ----------
  let midiOn = false, unhook = null;
  const midiBtn = $('.atx-midibtn');
  const toggleMidi = on => {
    midiOn = on;
    if (unhook) { unhook(); unhook = null; }
    if (on) {
      unhook = addInputHook({
        // 回傳 true = 這個音被吃掉（不會發聲、也不會錄進去）
        note(down, key) {
          if (!down) return true;
          const pc = ((key % 12) + 12) % 12;
          store.checkpoint();
          P.mask ^= 1 << pc;
          if (!P.mask) P.mask = 1 << pc;
          if (scaleMask(P.key, P.scale) !== P.mask) { P.scale = 9; scaleSel.value = 9; }
          renderPiano(); changed();
          toast(`${NOTE_NAMES_ZH[pc]}：${(P.mask >> pc) & 1 ? '加入' : '排除'}可修音的音`);
          return true;
        },
      });
    }
    midiBtn.textContent = on ? 'MIDI 控制：開' : 'MIDI 控制：關';
    midiBtn.classList.toggle('on', on);
    syncChips();
  };
  midiBtn.onclick = () => toggleMidi(!midiOn);

  // ---------- 旋鈕 ----------
  const knobsBox = $('.atx-knobs');
  const knobs = [
    { k: 'retune', label: '修正速度', min: 0, max: 400, fmt: v => `${Math.round(v)} ms`, sub: RETUNE_LABEL, curve: 2 },
    { k: 'amount', label: '修正強度', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 95 ? '完全' : v >= 50 ? '大部分' : '輕微') },
    { k: 'vibrato', label: '保留顫音', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 70 ? '保留原味' : v >= 30 ? '部分保留' : '拉平') },
    { k: 'humanize', label: '人性化', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 60 ? '很自然' : v >= 25 ? '一點漂移' : '關') },
    { k: 'flex', label: '彈性修音', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 60 ? '接近準就不拉' : v >= 25 ? '小幅讓步' : '硬拉') },
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
      g.lineWidth = 6; g.strokeStyle = cssVar('--cv-knob-track'); g.beginPath(); g.arc(c, c, R, a0, a1); g.stroke();
      const grad = g.createLinearGradient(0, S, S, 0);
      grad.addColorStop(0, '#35c9a5'); grad.addColorStop(0.5, '#4f9dff'); grad.addColorStop(1, '#b58bff');
      g.strokeStyle = grad; g.shadowColor = 'rgba(79,157,255,.6)'; g.shadowBlur = 8;
      g.beginPath(); g.arc(c, c, R, a0, a0 + (a1 - a0) * t); g.stroke(); g.shadowBlur = 0;
      const ang = a0 + (a1 - a0) * t;
      g.fillStyle = cssVar('--cv-knob-cap'); g.beginPath(); g.arc(c, c, 19, 0, Math.PI * 2); g.fill();
      g.strokeStyle = cssVar('--cv-knob-mark'); g.lineWidth = 2.5; g.beginPath(); g.moveTo(c + Math.cos(ang) * 8, c + Math.sin(ang) * 8); g.lineTo(c + Math.cos(ang) * 17, c + Math.sin(ang) * 17); g.stroke();
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
    cv.addEventListener('dblclick', () => { store.checkpoint(); P[K.k] = { retune: 40, amount: 100, vibrato: 60, humanize: 0, flex: 0, mix: 100 }[K.k]; draw(); changed(); });
    knobsBox.appendChild(w);
  }

  // ---------- 預設值 ----------
  const pre = $('.atx-pre');
  pre.innerHTML = TUNE_PRESETS.map((x, i) => `<button type="button" data-i="${i}" title="${x.tip}">${x.name}</button>`).join('');
  pre.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    store.checkpoint();
    Object.assign(P, TUNE_PRESETS[+b.dataset.i].p);
    refInp.value = P.refp || 440;
    Object.values(kEls).forEach(f => f()); syncLive(); changed();
    toast(TUNE_PRESETS[+b.dataset.i].tip);
  };

  // ---------- 現場低延遲 ----------
  const liveBtn = $('.atx-livebtn'), liveHint = $('.atx-livehint');
  const syncLive = () => {
    const on = !!P.live;
    liveBtn.textContent = on ? '現場低延遲：開' : '現場低延遲：關';
    liveBtn.classList.toggle('on', on);
    liveHint.textContent = on
      ? '延遲 16 ms（標準 32 ms），適合邊唱邊聽；最低音域到 100 Hz。'
      : '標準 32 ms：音域完整、修正品質最好。';
    syncChips();
  };
  liveBtn.onclick = () => {
    store.checkpoint(); P.live = P.live ? 0 : 1; syncLive(); changed();
    toast(P.live ? '現場模式：延遲 16 ms，最低音域到 100 Hz' : '回到標準模式：延遲 32 ms');
  };
  syncLive();

  // ---------- 音符編輯：這裡只放縮圖與按鈕，編輯在獨立視窗 ----------
  const ncv = $('.atx-ncv'), ninfo = $('.atx-ninfo');
  const notes = () => P.notes || [];
  const openEd = () => openNoteEditor(owner, desc, onChange);
  $('.atx-nopen').onclick = openEd;
  ncv.addEventListener('click', openEd);
  const drawNotes = () => {
    if (!ncv.isConnected) return;
    const dpr = devicePixelRatio || 1, W = ncv.clientWidth || 660, H = ncv.clientHeight || 54;
    ncv.width = W * dpr; ncv.height = H * dpr;
    const g = ncv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = cssVar('--cv-bg-b'); g.fillRect(0, 0, W, H);
    const all = notes();
    const edited = all.filter(n => n.orig != null && Math.abs(n.midi - n.orig) > 0.05).length;
    ninfo.textContent = all.length ? `${all.length} 個音，${edited} 個手動改過${P.notesOn === false ? '（目前停用）' : ''}` : '還沒有分析';
    if (!all.length) {
      g.fillStyle = cssVar('--cv-tx2'); g.font = '11px sans-serif'; g.textAlign = 'center';
      g.fillText('開啟音符編輯器後按「分析這一軌」，就能一顆一顆調整音高', W / 2, H / 2 + 4); return;
    }
    const t0 = all[0].s, t1 = Math.max(...all.map(n => n.e)), lo = Math.min(...all.map(n => n.midi)) - 1, hi = Math.max(...all.map(n => n.midi)) + 1;
    const x = t => 4 + (t - t0) / Math.max(0.1, t1 - t0) * (W - 8), y = m => H - 4 - (m - lo) / Math.max(1, hi - lo) * (H - 8);
    for (const n of all) {
      g.fillStyle = n.orig != null && Math.abs(n.midi - n.orig) > 0.05 ? '#f78fc3' : 'rgba(79,157,255,.8)';
      g.fillRect(x(n.s), y(n.midi) - 1.5, Math.max(1, x(n.e) - x(n.s)), 3);
    }
    if (engine.playing) { const p = engine.currentTime(); if (p > t0 && p < t1) { g.fillStyle = '#ff4d4d'; g.fillRect(x(p), 0, 1, H); } }
  };
  const syncSel = () => {};

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { onChange(false); renderPiano(); syncChips(); }

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
  const corr = $('.atx-corrbar'), corrEm = $('.atx-corr em');
  let needle = 0;
  function frame() {
    if (!root.isConnected) { if (unsub) unsub(); return; }
    attach();
    const dpr = devicePixelRatio || 1;
    // 調音錶：三段色帶（準／接近／偏）＋指針
    {
      const W = meter.clientWidth || 220, H = meter.clientHeight || 132;
      meter.width = W * dpr; meter.height = H * dpr;
      const g = meter.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H - 16, R = Math.min(W / 2 - 14, H - 30);
      const A = Math.PI * 0.36;
      const ang = c => -Math.PI / 2 + c / 50 * A;
      // 色帶：±8 cent 綠、±25 黃、之外紅
      const zones = [[-50, -25, '#ff6b6b'], [-25, -8, '#f5d33d'], [-8, 8, '#3fd88a'], [8, 25, '#f5d33d'], [25, 50, '#ff6b6b']];
      for (const [a0, a1, col] of zones) {
        g.strokeStyle = col; g.globalAlpha = 0.5; g.lineWidth = 7; g.lineCap = 'butt';
        g.beginPath(); g.arc(cx, cy, R - 5, ang(a0), ang(a1)); g.stroke();
      }
      g.globalAlpha = 1;
      for (let c = -50; c <= 50; c += 5) {
        const a = ang(c), big = c % 25 === 0;
        g.strokeStyle = c === 0 ? cssVar('--cv-tick2') : cssVar('--cv-tick');
        g.lineWidth = c === 0 ? 2 : 1;
        const r0 = R - (big ? 17 : 12);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
      }
      g.fillStyle = cssVar('--cv-tick2'); g.font = '9px ui-monospace'; g.textAlign = 'center';
      for (const c of [-50, -25, 25, 50]) { const a = ang(c); g.fillText((c > 0 ? '+' : '') + c, cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10) + 3); }
      const voiced = last && last.v && performance.now() - (last._at || 0) < 400;
      const cents = voiced ? (last.mi - last.tgt) * 100 : 0;
      needle += ((voiced ? Math.max(-50, Math.min(50, cents)) : 0) - needle) * 0.25;
      const a = ang(needle);
      const col = Math.abs(needle) < 8 ? '#3fd88a' : Math.abs(needle) < 25 ? '#f5d33d' : '#ff6b6b';
      g.shadowColor = col; g.shadowBlur = voiced ? 14 : 0;
      g.strokeStyle = voiced ? col : cssVar('--cv-needle-off'); g.lineWidth = 3.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 11), cy + Math.sin(a) * (R - 11)); g.stroke();
      g.shadowBlur = 0; g.fillStyle = cssVar('--cv-tx'); g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
      noteEl.querySelector('b').textContent = voiced ? noteOf(last.tgt) : '—';
      noteEl.querySelector('b').style.color = voiced ? col : '';
      noteEl.querySelector('span').textContent = voiced ? `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cent → 修正到 ${noteOf(last.tgt)}` : (engine.playing ? '（無聲／子音）' : '等待聲音…');
    }
    // 修正量錶：實際把音高拉了多少（輸入 → 輸出）
    if (corr && corr.isConnected) {
      const W = corr.clientWidth || 220, H = corr.clientHeight || 24;
      corr.width = W * dpr; corr.height = H * dpr;
      const g = corr.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const mid = W / 2;
      g.fillStyle = ink(.07); g.fillRect(0, H / 2 - 4, W, 8);
      for (const f of [0.25, 0.75]) { g.fillStyle = ink(.12); g.fillRect(Math.round(W * f), H / 2 - 6, 1, 12); }
      g.fillStyle = ink(.3); g.fillRect(mid, H / 2 - 7, 1, 14);
      const voiced = last && last.v && performance.now() - (last._at || 0) < 400;
      const shift = voiced ? (last.out - last.mi) * 100 : 0;
      const k = Math.max(-50, Math.min(50, shift)) / 50;
      const col = shift >= 0 ? '#4f9dff' : '#f78fc3';
      const x1 = mid + k * (W / 2 - 3);
      g.fillStyle = col;
      g.fillRect(Math.min(mid, x1), H / 2 - 4, Math.abs(x1 - mid), 8);
      g.beginPath(); g.arc(x1, H / 2, 4, 0, Math.PI * 2); g.fill();
      corrEm.textContent = voiced ? `${shift > 0 ? '+' : ''}${shift.toFixed(0)} cent` : '±0 cent';
    }
    // 音高曲線
    {
      const W = cv.clientWidth || 400, H = cv.clientHeight || 120;
      cv.width = W * dpr; cv.height = H * dpr;
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, cssVar('--cv-bg-a')); bg.addColorStop(1, cssVar('--cv-bg-b'));
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
        g.strokeStyle = inKey ? (pc === P.key ? 'rgba(63,216,138,.35)' : ink(.12)) : ink(.03);
        g.lineWidth = inKey ? 1 : 1;
        g.beginPath(); g.moveTo(34, y); g.lineTo(W, y); g.stroke();
        if (inKey) { g.fillStyle = pc === P.key ? cssVar('--cv-good') : cssVar('--cv-tx2'); g.font = '9px ui-monospace'; g.textAlign = 'left'; g.fillText(noteOf(m), 4, y + 3); }
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
      // 修正後曲線下的漸層，走勢看得更清楚
      const area = g.createLinearGradient(0, 0, 0, H);
      area.addColorStop(0, 'rgba(79,157,255,.20)'); area.addColorStop(1, 'rgba(79,157,255,0)');
      g.beginPath(); let pen0 = false, xf0 = 0, xf1 = 0;
      for (const h of vis) {
        if (!h.v) { pen0 = false; continue; }
        const x = xOf(h.t), y = yOf(h.out);
        if (!pen0) { g.moveTo(x, y); xf0 = x; pen0 = true; } else g.lineTo(x, y);
        xf1 = x;
      }
      if (pen0) { g.lineTo(xf1, H); g.lineTo(xf0, H); g.closePath(); g.fillStyle = area; g.fill(); }
      line('mi', `rgba(${cssVar('--cv-orig')},.55)`, 1.5);                   // 原本唱的
      const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, '#35c9a5'); lg.addColorStop(0.6, '#4f9dff'); lg.addColorStop(1, '#f78fc3');
      line('out', lg, 2.6, 'rgba(79,157,255,.8)');               // 修正後
      // 目標音高：綠色虛線
      if (last && last.v && performance.now() - (last._at || 0) < 900) {
        const yt = Math.round(yOf(last.tgt)) + 0.5;
        g.strokeStyle = 'rgba(63,216,138,.45)'; g.setLineDash([5, 5]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(34, yt); g.lineTo(W, yt); g.stroke(); g.setLineDash([]);
      }
      // 現在位置
      g.fillStyle = ink(.15); g.fillRect(W - 1, 0, 1, H);
    }
    drawNotes();
    raf = requestAnimationFrame(frame);
  }
  renderPiano();
  Object.values(kEls).forEach(f => f());
  syncSel();
  raf = requestAnimationFrame(frame);
  root._dispose = () => { cancelAnimationFrame(raf); if (unsub) unsub(); if (unhook) unhook(); };
  root._openNotes = openEd;
  root._refresh = () => {
    keySel.value = P.key; scaleSel.value = P.scale; rangeSel.value = P.range;
    refInp.value = P.refp || 440;
    renderPiano(); Object.values(kEls).forEach(f => f()); syncLive(); syncSel(); syncChips();
  };
  return root;
}
