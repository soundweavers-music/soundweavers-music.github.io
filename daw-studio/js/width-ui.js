// 立體聲寬度面板：向量示波器（goniometer）＋寬度／相關度表＋參數
// 這個效果器的重點是「單聲道來源也能變立體」：Haas 延遲與相位去相關會自己生出側向訊號，
// 左右相反相加，所以單聲道監聽時會完全消失（不會有相位問題）。
import { store } from './state.js';
import { engine } from './engine.js';

export function widthEditor(owner, desc, onChange) {
  const P = desc.params;
  const root = document.createElement('div');
  root.className = 'wfx';
  root.innerHTML = `
    <div class="wfx-top">
      <div class="wfx-scope-wrap"><canvas class="wfx-scope"></canvas>
        <div class="wfx-badge mono">單聲道</div></div>
      <div class="wfx-meters">
        <div class="wfx-m"><span>立體寬度</span><b class="wfx-w">—</b><div class="wfx-bar"><i></i></div></div>
        <div class="wfx-m"><span>左右相關</span><b class="wfx-c">—</b><div class="wfx-bar corr"><i></i></div></div>
        <p class="wfx-hint">相關度 +1 代表左右完全相同（單聲道），接近 0 是很寬的立體聲，負值代表左右反相。</p>
      </div>
    </div>
    <div class="wfx-params"></div>`;
  const $ = s => root.querySelector(s);
  const box = $('.wfx-params');

  const rows = [
    { k: 'width', label: '寬度', min: 0, max: 200, fmt: v => `${Math.round(v)}%`, sub: v => (v === 0 ? '單聲道' : v < 60 ? '溫和' : v < 130 ? '自然' : '很寬') },
    { k: 'delay', label: 'Haas 延遲', min: 2, max: 40, fmt: v => `${v.toFixed(1)} ms`, sub: v => (v < 12 ? '幾乎像雙軌' : v < 25 ? '自然的空間感' : '聽得出兩支麥克風'), hide: p => p.mode === 1 || p.mode === 2 },
    { k: 'bass', label: '低頻保持單聲道', min: 20, max: 400, fmt: v => `${Math.round(v)} Hz`, sub: () => '以下留在中央' },
    { k: 'tone', label: '側向高頻', min: -12, max: 12, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`, sub: () => '讓寬度聽起來更亮或更悶' },
    { k: 'mix', label: '濕度', min: 0, max: 100, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 100 ? '全濕' : '混入原聲') },
  ];
  const refresh = [];
  for (const R of rows) {
    const row = document.createElement('label');
    row.className = 'fx-row';
    row.innerHTML = `<span class="fx-lbl">${R.label}</span><input type="range" min="0" max="1000" step="1"><span class="fx-val"></span><em class="wfx-sub"></em>`;
    const inp = row.querySelector('input'), val = row.querySelector('.fx-val'), em = row.querySelector('em');
    const toPos = v => (v - R.min) / (R.max - R.min);
    const fromPos = t => Math.round((R.min + t * (R.max - R.min)) / 0.5) * 0.5;
    const show = () => {
      val.textContent = R.fmt(P[R.k]);
      em.textContent = R.sub ? R.sub(P[R.k], P) : '';
      row.style.display = R.hide && R.hide(P) ? 'none' : '';
    };
    inp.value = Math.round(toPos(P[R.k]) * 1000);
    show();
    inp.addEventListener('pointerdown', () => store.checkpoint());
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('input', () => { P[R.k] = fromPos(inp.value / 1000); show(); live(); });
    inp.addEventListener('change', () => changed());
    inp.addEventListener('dblclick', () => { store.checkpoint(); P[R.k] = { width: 100, delay: 14, bass: 120, tone: 0, mix: 100 }[R.k]; inp.value = Math.round(toPos(P[R.k]) * 1000); show(); changed(); });
    box.appendChild(row);
    refresh.push(show);
  }

  // 方式：會影響延遲那條要不要顯示
  const modeRow = document.createElement('label');
  modeRow.className = 'fx-row';
  modeRow.innerHTML = `<span class="fx-lbl">方式</span><select class="wfx-mode">${
    ['Haas 延遲（單聲道 → 立體）', '相位去相關（單聲道 → 立體）', 'M-S 擴大（既有立體聲）', '全部混用']
      .map((t, i) => `<option value="${i}"${P.mode === i ? ' selected' : ''}>${t}</option>`).join('')}</select><span class="fx-val"></span>`;
  const sel = modeRow.querySelector('select');
  sel.addEventListener('keydown', e => e.stopPropagation());
  sel.onchange = () => { store.checkpoint(); P.mode = +sel.value; refresh.forEach(f => f()); changed(); };
  box.prepend(modeRow);

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { onChange(false); }

  // ---------- 示波器 ----------
  const cv = $('.wfx-scope'), badge = $('.wfx-badge'), wEl = $('.wfx-w'), cEl = $('.wfx-c');
  const barW = root.querySelector('.wfx-bar > i'), barC = root.querySelector('.wfx-bar.corr > i');
  let raf = 0;
  const persist = new Float32Array(240 * 2).fill(0);   // 殘影點（x,y）
  let pi = 0;
  let sW = 0, sC = 1;
  const frame = () => {
    if (!root.isConnected) return;
    const dpr = devicePixelRatio || 1;
    const W = cv.clientWidth || 300, H = cv.clientHeight || 180;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12141a'); bg.addColorStop(1, '#0a0b0e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    // 菱形框：上＝L、右＝R、左＝-L、下＝-R
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R); g.lineTo(cx - R, cy); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();      // 單聲道＝垂直線
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();      // 反相＝水平線
    g.setLineDash([2, 4]); g.strokeStyle = 'rgba(255,255,255,.05)';
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.font = '9px ui-monospace';
    g.fillText('L', cx - 4, cy - R + 10); g.fillText('R', cx + R - 10, cy + 3);

    const inst = engine.ctx && engine.fxInstance(owner, desc.id);
    const v = inst && inst.vectors ? inst.vectors() : null;
    if (v) {
      const n = v.l.length;
      const step = Math.max(1, Math.floor(n / 380));
      let sumLR = 0, sumL2 = 0, sumR2 = 0, k = 0;
      const pts = [];
      for (let i = 0; i < n; i += step) {
        const l = v.l[i], r = v.r[i];
        // 45° 旋轉：x 軸 = L+R（單聲道在中線）、y 軸 = L−R
        pts.push([l + r, l - r]);
        sumLR += l * r; sumL2 += l * l; sumR2 += r * r; k++;
      }
      // 相關度
      const den = Math.sqrt(sumL2 * sumR2);
      const corr = den > 1e-9 ? sumLR / den : 1;
      sC += (corr - sC) * 0.15;
      // 寬度：side/mid 的能量比，換成 0..200%
      let midE = 0, sideE = 0;
      for (const [m, s] of pts) { midE += m * m; sideE += s * s; }
      const widthPct = midE > 1e-9 ? Math.min(200, Math.sqrt(sideE / midE) * 100) : 0;
      sW += (widthPct - sW) * 0.15;
      wEl.textContent = `${Math.round(sW)}%`;
      cEl.textContent = sC >= 0 ? `+${sC.toFixed(2)}` : sC.toFixed(2);
      barW.style.width = Math.min(100, sW / 2) + '%';
      barC.style.left = `${(sC + 1) / 2 * 100}%`;
      const isMono = sC > 0.985 && sW < 12;
      badge.textContent = isMono ? '單聲道' : sC < 0.15 ? '寬立體' : '立體';
      badge.className = 'wfx-badge ' + (isMono ? 'mono' : sC < 0.15 ? 'wide' : 'stereo');
      // 畫殘影
      g.fillStyle = 'rgba(53,201,165,.55)';
      for (const [m, s] of pts) {
        if (!isFinite(m) || !isFinite(s)) continue;
        const x = cx + Math.max(-1, Math.min(1, m)) * R * 0.72;
        const y = cy + Math.max(-1, Math.min(1, s)) * R * 0.72;
        g.fillRect(x, y, 1.3, 1.3);
        const pi2 = (pi++ % 240) * 2;
        persist[pi2] = x; persist[pi2 + 1] = y;
      }
      g.fillStyle = 'rgba(79,157,255,.25)';
      for (let i = 0; i < 240; i++) g.fillRect(persist[i * 2], persist[i * 2 + 1], 1, 1);
    } else {
      g.fillStyle = '#7d818b'; g.font = '11px sans-serif';
      g.fillText('播放時顯示立體聲向量圖', cx - 66, cy + 4);
      badge.textContent = '—'; badge.className = 'wfx-badge';
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  root._dispose = () => cancelAnimationFrame(raf);
  root._refresh = () => { refresh.forEach(f => f()); sel.value = P.mode; };
  return root;
}
