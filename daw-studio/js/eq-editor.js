// 8 段 EQ 圖形編輯器
//  - 背景：即時頻譜（處理前淡灰、處理後彩色填色），對數頻率軸
//  - 每段一個彩色節點：左右拖 = 頻率、上下拖 = 增益、滾輪 = Q、雙擊 = 開／關
//  - 曲線：整體響應用漸層粗線＋半透明填色，選中的那段另外畫自己的彩色曲線
//  - 下方：選中頻段的類型／頻率／增益／Q 數值欄
import { store } from './state.js';
import { engine } from './engine.js';
import { EQ_BAND_TYPES, EQ_BAND_COLORS, buildFx, migrateEqParams } from './effects.js';
import { cssVar, ink } from './theme.js';

const FMIN = 20, FMAX = 20000, DBR = 18;   // 顯示範圍：±18 dB
const xOfF = (f, W) => Math.log(f / FMIN) / Math.log(FMAX / FMIN) * W;
const fOfX = (x, W) => FMIN * Math.pow(FMAX / FMIN, x / W);
const yOfDb = (db, H) => H / 2 - db / DBR * (H / 2 - 10);
const dbOfY = (y, H) => (H / 2 - y) / (H / 2 - 10) * DBR;
const fmtF = f => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${Math.round(f)} Hz`);
const fmtShort = f => (f >= 1000 ? `${+(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);

export function eqEditor(owner, desc, onChange) {
  const P = desc.params;
  if (!Array.isArray(P.bands)) Object.assign(P, migrateEqParams(P));
  const root = document.createElement('div');
  root.className = 'eqx';
  root.innerHTML = `
    <canvas class="eqx-cv"></canvas>
    <div class="eqx-bands"></div>
    <div class="eqx-detail"></div>`;
  const cv = root.querySelector('canvas');
  const bandsBox = root.querySelector('.eqx-bands');
  const detail = root.querySelector('.eqx-detail');
  let sel = P.bands.findIndex(b => b.on && b.gain !== 0);
  if (sel < 0) sel = 3;
  let drag = null, hover = -1, raf = 0, alive = true;
  // 沒有啟動引擎時，用離線 context 算響應
  let preview = null;
  const inst = () => (engine.ctx && engine.fxInstance(owner, desc.id)) || (preview ||= buildFx(new OfflineAudioContext(1, 128, 48000), desc));

  const changed = (live = true) => {
    if (preview) preview.set(P);
    onChange(live);
    renderBands(); renderDetail();
  };

  // ---------- 頻段按鈕列 ----------
  function renderBands() {
    bandsBox.innerHTML = '';
    P.bands.forEach((b, i) => {
      const t = EQ_BAND_TYPES[b.type];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'eqx-band' + (i === sel ? ' sel' : '') + (b.on ? '' : ' off');
      el.style.setProperty('--c', EQ_BAND_COLORS[i]);
      el.innerHTML = `<i></i><b>${i + 1}</b><span>${t.label}</span><em>${fmtShort(b.freq)}${t.gain ? ` · ${b.gain > 0 ? '+' : ''}${b.gain.toFixed(1)}` : ''}</em>`;
      el.title = '點一下選取；雙擊開／關這一段';
      el.onclick = () => { sel = i; renderBands(); renderDetail(); };
      el.ondblclick = () => { store.checkpoint(); b.on = !b.on; changed(false); };
      bandsBox.appendChild(el);
    });
  }

  // ---------- 選中頻段的數值 ----------
  function renderDetail() {
    const b = P.bands[sel];
    const t = EQ_BAND_TYPES[b.type];
    detail.innerHTML = `
      <label class="eqx-on"><input type="checkbox" ${b.on ? 'checked' : ''}> 第 ${sel + 1} 段</label>
      <label>類型 <select>${Object.entries(EQ_BAND_TYPES).map(([k, v]) => `<option value="${k}"${k === b.type ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label>頻率 <input type="number" data-k="freq" min="20" max="20000" step="1" value="${Math.round(b.freq)}"> Hz</label>
      <label${t.gain ? '' : ' class="dim"'}>增益 <input type="number" data-k="gain" min="-${DBR}" max="${DBR}" step="0.1" value="${b.gain.toFixed(1)}" ${t.gain ? '' : 'disabled'}> dB</label>
      <label>Q <input type="number" data-k="q" min="0.1" max="18" step="0.05" value="${(+b.q).toFixed(2)}"></label>
      ${t.slope ? `<label>陡度 <select data-k="slope"><option value="12"${(b.slope || 12) < 24 ? ' selected' : ''}>12 dB/oct</option><option value="24"${(b.slope || 12) >= 24 ? ' selected' : ''}>24 dB/oct</option></select></label>` : ''}
      <label class="eqx-out">輸出 <input type="number" data-k="output" min="-18" max="18" step="0.1" value="${(P.output || 0).toFixed(1)}"> dB</label>`;
    detail.querySelector('.eqx-on input').onchange = e => { store.checkpoint(); b.on = e.target.checked; changed(false); };
    detail.querySelector('select').onchange = e => {
      store.checkpoint(); b.type = e.target.value; b.on = true;
      if (!EQ_BAND_TYPES[b.type].gain) b.gain = 0;
      changed(false);
    };
    detail.querySelectorAll('input[type=number],select[data-k]').forEach(inp => {
      inp.addEventListener('keydown', e => e.stopPropagation());
      inp.addEventListener('change', () => {
        store.checkpoint();
        const k = inp.dataset.k, v = Number(inp.value);
        if (k === 'output') P.output = Math.max(-18, Math.min(18, v));
        else if (k === 'freq') b.freq = Math.max(20, Math.min(20000, v));
        else if (k === 'gain') b.gain = Math.max(-DBR, Math.min(DBR, v));
        else if (k === 'q') b.q = Math.max(0.1, Math.min(18, v));
        else if (k === 'slope') b.slope = v;
        b.on = k === 'output' ? b.on : true;
        changed(false);
      });
    });
  }

  // ---------- 繪圖 ----------
  const N = 320;
  let freqs = null, W = 0, H = 0;
  function size() {
    const dpr = devicePixelRatio || 1;
    W = cv.clientWidth || 520; H = cv.clientHeight || 220;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    freqs = new Float32Array(N);
    for (let i = 0; i < N; i++) freqs[i] = fOfX(i / (N - 1) * W, W);
    return dpr;
  }
  const specBuf = { a: null, b: null };
  function spectrum(g, analyser, fill, stroke) {
    if (!analyser) return;
    const n = analyser.frequencyBinCount;
    if (!specBuf[fill] || specBuf[fill].length !== n) specBuf[fill] = new Float32Array(n);
    const d = specBuf[fill];
    analyser.getFloatFrequencyData(d);
    const sr = analyser.context.sampleRate, binHz = sr / 2 / n;
    g.beginPath(); g.moveTo(0, H);
    // 每個像素欄取該頻率範圍的最大值，低頻不會鋸齒
    let x = 0;
    for (let px = 0; px <= W; px += 2) {
      const f0 = fOfX(px, W), f1 = fOfX(px + 2, W);
      let i0 = Math.floor(f0 / binHz), i1 = Math.max(i0 + 1, Math.ceil(f1 / binHz));
      let m = -200; for (let k = i0; k < i1 && k < n; k++) if (d[k] > m) m = d[k];
      // -90 dBFS ~ 0 dBFS 映到畫面高度；頻譜斜率補償 +3 dB/oct（看起來比較平，跟大部分 EQ 外掛一致）
      const tilt = 3 * Math.log2(Math.max(20, f0) / 1000);
      const v = Math.max(0, Math.min(1, (m + tilt + 90) / 90));
      g.lineTo(px, H - v * H * 0.92);
      x = px;
    }
    g.lineTo(x, H); g.closePath();
    g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  function draw() {
    if (!alive) return;
    const dpr = size();
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, cssVar('--cv-bg-a')); bg.addColorStop(1, cssVar('--cv-bg-b'));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const fx = inst();
    const live = engine.ctx && engine.playing && fx.analyser && fx.analyser.context === engine.ctx;
    // 頻譜：處理前（灰）、處理後（藍綠漸層）
    if (live) {
      spectrum(g, fx.preAnalyser, 'rgba(160,170,190,.10)', 'rgba(160,170,190,.25)');
      const sg = g.createLinearGradient(0, 0, W, 0);
      sg.addColorStop(0, 'rgba(255,107,107,.22)'); sg.addColorStop(0.35, 'rgba(245,211,61,.18)');
      sg.addColorStop(0.65, 'rgba(53,201,165,.20)'); sg.addColorStop(1, 'rgba(79,157,255,.24)');
      spectrum(g, fx.analyser, sg, null);
    }
    // 格線
    g.font = '10px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
    for (const f of [30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000]) {
      const x = Math.round(xOfF(f, W)) + 0.5;
      const major = [100, 1000, 10000].includes(f);
      g.strokeStyle = major ? ink(.10) : ink(.045);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      if ([50, 100, 200, 500, 1000, 2000, 5000, 10000].includes(f)) { g.fillStyle = ink(.35); g.fillText(f >= 1000 ? `${f / 1000}k` : f, x + 3, H - 13); }
    }
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = Math.round(yOfDb(db, H)) + 0.5;
      g.strokeStyle = db === 0 ? ink(.18) : ink(.05);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      g.fillStyle = ink(.3); g.fillText((db > 0 ? '+' : '') + db, 4, y + 2);
    }
    // 選中頻段的彩色小曲線（半透明填色到 0 dB 線）
    const c = EQ_BAND_COLORS[sel];
    if (P.bands[sel].on && fx.bandResponse) {
      const m = fx.bandResponse(sel, freqs);
      g.beginPath();
      for (let i = 0; i < N; i++) { const y = yOfDb(Math.max(-DBR - 6, 20 * Math.log10(Math.max(1e-6, m[i]))), H); i ? g.lineTo(i / (N - 1) * W, y) : g.moveTo(0, y); }
      g.lineTo(W, yOfDb(0, H)); g.lineTo(0, yOfDb(0, H)); g.closePath();
      g.fillStyle = c + '33'; g.fill();
    }
    // 整體曲線：漸層線（每段顏色依頻率位置排列）＋ 光暈
    const m = fx.response(freqs);
    const path = new Path2D();
    for (let i = 0; i < N; i++) {
      const db = 20 * Math.log10(Math.max(1e-6, m[i]));
      const y = yOfDb(Math.max(-DBR - 6, Math.min(DBR + 6, db)), H);
      i ? path.lineTo(i / (N - 1) * W, y) : path.moveTo(0, y);
    }
    const lg = g.createLinearGradient(0, 0, W, 0);
    // 依每段的頻率位置放色標，曲線顏色會跟著節點移動
    const stops = P.bands.map((b, i) => [Math.min(1, Math.max(0, xOfF(b.freq, W) / W)), EQ_BAND_COLORS[i]]).sort((a, b) => a[0] - b[0]);
    for (const [pos, col] of stops) lg.addColorStop(pos, col);
    const fillPath = new Path2D(path); fillPath.lineTo(W, yOfDb(0, H)); fillPath.lineTo(0, yOfDb(0, H)); fillPath.closePath();
    g.globalAlpha = desc.on ? 0.16 : 0.06; g.fillStyle = lg; g.fill(fillPath); g.globalAlpha = 1;
    g.shadowColor = ink(.35); g.shadowBlur = desc.on ? 8 : 0;
    g.strokeStyle = desc.on ? lg : '#666'; g.lineWidth = 2.5; g.stroke(path);
    g.shadowBlur = 0;
    // 節點
    P.bands.forEach((b, i) => {
      const t = EQ_BAND_TYPES[b.type];
      const x = xOfF(b.freq, W);
      const y = t.gain ? yOfDb(b.gain, H) : yOfDb(0, H);
      const r = i === sel ? 8 : i === hover ? 7 : 6;
      g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2);
      g.fillStyle = b.on ? EQ_BAND_COLORS[i] + '30' : 'transparent'; g.fill();
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = b.on ? EQ_BAND_COLORS[i] : cssVar('--cv-node-off'); g.fill();
      g.lineWidth = i === sel ? 2.5 : 1.5; g.strokeStyle = b.on ? '#fff' : EQ_BAND_COLORS[i]; g.stroke();
      g.fillStyle = b.on ? '#0b0c0f' : EQ_BAND_COLORS[i]; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), x, y + 0.5);
      g.textAlign = 'left'; g.textBaseline = 'top';
    });
    // 拖曳中的數值提示
    const tipI = drag ? drag.i : hover;
    if (tipI >= 0) {
      const b = P.bands[tipI], t = EQ_BAND_TYPES[b.type];
      const txt = `${tipI + 1} ${t.label}  ${fmtF(b.freq)}${t.gain ? `  ${b.gain > 0 ? '+' : ''}${b.gain.toFixed(1)} dB` : ''}  Q ${(+b.q).toFixed(2)}`;
      g.font = '11px ui-monospace, Consolas, monospace';
      const tw = g.measureText(txt).width + 12;
      const x = Math.min(W - tw - 4, Math.max(4, xOfF(b.freq, W) - tw / 2));
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x, 6, tw, 18);
      g.fillStyle = EQ_BAND_COLORS[tipI]; g.fillText(txt, x + 6, 9);
    }
    raf = requestAnimationFrame(draw);
  }

  // ---------- 拖曳 ----------
  function hit(ev) {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = -1, bd = 14;
    P.bands.forEach((b, i) => {
      const bx = xOfF(b.freq, W), by = EQ_BAND_TYPES[b.type].gain ? yOfDb(b.gain, H) : yOfDb(0, H);
      const d = Math.hypot(bx - x, by - y);
      if (d < bd) { bd = d; best = i; }
    });
    return { i: best, x, y };
  }
  cv.addEventListener('pointerdown', ev => {
    const h = hit(ev);
    if (h.i < 0) {
      // 點空白：把最近的「關閉中」或增益為 0 的段移過來，方便直接畫
      const f = fOfX(h.x, W);
      let pick = P.bands.findIndex(b => !b.on && b.type === 'peaking');
      if (pick < 0) {
        let bestD = Infinity;
        P.bands.forEach((b, i) => { if (EQ_BAND_TYPES[b.type].gain) { const d = Math.abs(Math.log(b.freq / f)); if (d < bestD) { bestD = d; pick = i; } } });
      }
      if (pick < 0) return;
      store.checkpoint();
      const b = P.bands[pick];
      b.on = true; b.freq = f; b.gain = Math.round(dbOfY(h.y, H) * 10) / 10;
      sel = pick; changed(true);
      h.i = pick;
    } else { store.checkpoint(); sel = h.i; renderBands(); renderDetail(); }
    const b = P.bands[h.i];
    drag = { i: h.i, x0: ev.clientX, y0: ev.clientY, f0: b.freq, g0: b.gain };
    b.on = true;
    cv.setPointerCapture(ev.pointerId);
  });
  cv.addEventListener('pointermove', ev => {
    if (!drag) { const h = hit(ev); if (h.i !== hover) { hover = h.i; cv.style.cursor = h.i >= 0 ? 'grab' : 'crosshair'; } return; }
    const b = P.bands[drag.i];
    const fine = ev.shiftKey ? 0.25 : 1;
    const dx = (ev.clientX - drag.x0) * fine, dy = (ev.clientY - drag.y0) * fine;
    b.freq = Math.max(20, Math.min(20000, drag.f0 * Math.pow(FMAX / FMIN, dx / W)));
    if (EQ_BAND_TYPES[b.type].gain) b.gain = Math.round(Math.max(-DBR, Math.min(DBR, drag.g0 - dy / ((H / 2 - 10) / DBR))) * 10) / 10;
    changed(true);
  });
  cv.addEventListener('pointerup', () => { if (drag) { drag = null; onChange(false); } });
  cv.addEventListener('wheel', ev => {
    const h = hit(ev);
    const i = h.i >= 0 ? h.i : sel;
    ev.preventDefault();
    const b = P.bands[i];
    b.q = Math.max(0.1, Math.min(18, b.q * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
    sel = i; b.on = true;
    changed(true);
    clearTimeout(cv._wt); cv._wt = setTimeout(() => onChange(false), 300);
  }, { passive: false });
  cv.addEventListener('dblclick', ev => {
    const h = hit(ev);
    if (h.i < 0) return;
    store.checkpoint();
    const b = P.bands[h.i];
    // 雙擊節點：增益歸零（若已是 0 就關閉）
    if (EQ_BAND_TYPES[b.type].gain && b.gain !== 0) b.gain = 0; else b.on = !b.on;
    changed(false);
  });
  cv.addEventListener('pointerleave', () => { hover = -1; });

  renderBands(); renderDetail();
  requestAnimationFrame(draw);
  root._dispose = () => { alive = false; cancelAnimationFrame(raf); };
  root._refresh = () => { if (preview) preview.set(P); renderBands(); renderDetail(); };
  return root;
}
