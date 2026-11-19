// 殘響面板：左邊畫空間剖面（音源、聽者、早期反射），右邊畫衰減曲線（低頻／高頻兩條）
// 圖是從參數即時算出來的，不是抓音訊，所以調旋鈕時圖會跟著動。
import { store } from './state.js';

const SPACES = [
  { name: '房間', sub: '近、密、乾淨' },
  { name: '大廳', sub: '慢慢堆起來的尾巴' },
  { name: '板式', sub: '沒有離散反射、亮' },
  { name: '教堂', sub: '最長、最稀疏' },
  { name: '彈簧', sub: '金屬共振' },
  { name: '閘門', sub: '80 年代鼓' },
];
// 跟 effects.js 的 SPACES 對應（畫圖用的近似值）
const PROFILE = [
  { attack: 0.004, bright: 1.0, er: 5 },
  { attack: 0.018, bright: 0.85, er: 5 },
  { attack: 0.001, bright: 1.3, er: 0 },
  { attack: 0.032, bright: 0.7, er: 3 },
  { attack: 0.002, bright: 1.15, er: 2 },
  { attack: 0.002, bright: 1.0, er: 2, gate: 0.35 },
];

export function reverbEditor(owner, desc, onChange) {
  const P = desc.params;
  // 舊專案的殘響沒有這幾個參數：先補預設值，旋鈕才不會是空的
  Object.assign(P, { space: 1, er: 35, mod: 20, width: 100, ...P });
  const root = document.createElement('div');
  root.className = 'rvx';
  root.innerHTML = `
    <div class="rvx-spaces">${SPACES.map((s, i) => `<button type="button" data-i="${i}" class="${P.space === i ? 'on' : ''}"><b>${s.name}</b><span>${s.sub}</span></button>`).join('')}</div>
    <div class="rvx-viz"><canvas class="rvx-cv"></canvas></div>
    <div class="rvx-params"></div>`;
  const $ = s => root.querySelector(s);

  const rows = [
    { k: 'size', label: '尾巴長度', min: 0.2, max: 8, step: 0.1, fmt: v => `${v.toFixed(1)} 秒` },
    { k: 'predelay', label: '預延遲', min: 0, max: 120, step: 1, fmt: v => `${Math.round(v)} ms` },
    { k: 'damp', label: '高頻衰減', min: 1000, max: 16000, step: 100, log: true, fmt: v => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v} Hz`) },
    { k: 'er', label: '早期反射', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%` },
    { k: 'mod', label: '調變', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%` },
    { k: 'width', label: '立體寬度', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%` },
    { k: 'mix', label: '濕度', min: 0, max: 100, step: 1, fmt: v => (v >= 100 ? '100%（Send 用）' : `${Math.round(v)}%`) },
  ];
  const box = $('.rvx-params'), refreshers = [];
  for (const R of rows) {
    const row = document.createElement('label');
    row.className = 'fx-row';
    row.innerHTML = `<span class="fx-lbl">${R.label}</span><input type="range" min="0" max="1000" step="1"><span class="fx-val"></span>`;
    const inp = row.querySelector('input'), val = row.querySelector('.fx-val');
    const toPos = v => (R.log ? Math.log(v / R.min) / Math.log(R.max / R.min) : (v - R.min) / (R.max - R.min));
    const fromPos = t => {
      const v = R.log ? R.min * Math.pow(R.max / R.min, t) : R.min + t * (R.max - R.min);
      return Math.max(R.min, Math.min(R.max, +((Math.round(v / R.step) * R.step).toFixed(4))));
    };
    const show = () => { val.textContent = R.fmt(P[R.k]); };
    inp.value = Math.round(toPos(P[R.k]) * 1000); show();
    inp.addEventListener('pointerdown', () => store.checkpoint());
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('input', () => { P[R.k] = fromPos(inp.value / 1000); show(); live(); });
    inp.addEventListener('change', () => changed());
    inp.addEventListener('dblclick', () => { store.checkpoint(); P[R.k] = { size: 2.2, predelay: 15, damp: 7000, er: 35, mod: 20, width: 100, mix: 25 }[R.k]; inp.value = Math.round(toPos(P[R.k]) * 1000); show(); changed(); });
    box.appendChild(row);
    refreshers.push(() => { inp.value = Math.round(toPos(P[R.k]) * 1000); show(); });
  }

  root.querySelector('.rvx-spaces').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    store.checkpoint(); P.space = +b.dataset.i;
    [...root.querySelectorAll('.rvx-spaces button')].forEach((x, i) => x.classList.toggle('on', i === P.space));
    changed();
  };

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { onChange(false); }

  // ---------- 圖 ----------
  const cv = $('.rvx-cv');
  const draw = () => {
    if (!root.isConnected) { return; }
    const dpr = devicePixelRatio || 1;
    const W = cv.clientWidth || 460, H = cv.clientHeight || 170;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12141a'); bg.addColorStop(1, '#0a0b0e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const prof = PROFILE[P.space | 0] || PROFILE[1];
    const size = P.size;

    // ---- 左半：空間剖面 ----
    const rw = W * 0.46;
    const roomW = rw * (0.42 + Math.min(1, size / 8) * 0.5);
    const roomH = (H - 46) * (0.45 + Math.min(1, size / 8) * 0.5);
    const rx = (rw - roomW) / 2, ry = (H - roomH) / 2 + 2;
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5;
    g.strokeRect(rx, ry, roomW, roomH);
    // 牆面的反射強度（er）
    g.strokeStyle = `rgba(79,157,255,${0.08 + (P.er / 100) * 0.25})`;
    g.lineWidth = 3; g.strokeRect(rx, ry, roomW, roomH);

    const sx = rx + roomW * 0.28, sy = ry + roomH * 0.62;   // 音源
    const lx = rx + roomW * 0.68, ly = ry + roomH * 0.42;   // 聽者
    // 第一次反射（鏡像法）
    const taps = [[rx, sy, 1], [rx + roomW, sy, 1], [sx, ry, 1], [sx, ry + roomH, 1]];
    const nER = prof.er;
    for (let i = 0; i < nER; i++) {
      const [wx, wy] = taps[i % taps.length];
      g.strokeStyle = `rgba(245,184,61,${0.10 + (P.er / 100) * 0.30})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(wx, wy); g.lineTo(lx, ly); g.stroke();
    }
    // 直達音
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(lx, ly); g.stroke();
    // 點
    g.fillStyle = '#35c9a5'; g.beginPath(); g.arc(sx, sy, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4f9dff'; g.beginPath(); g.arc(lx, ly, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '9px ui-monospace';
    g.fillText('音源', sx - 10, sy + 16); g.fillText('聽者', lx - 10, ly + 16);

    // 預延遲：在兩點之間畫一段虛線刻度
    const pdPx = Math.min(roomW * 0.3, P.predelay / 120 * roomW * 0.3);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(sx, sy - 10); g.lineTo(sx + pdPx, sy - 10); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '9px ui-monospace';
    g.fillText(`預延遲 ${Math.round(P.predelay)} ms`, sx, sy - 18);
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillText(`${SPACES[P.space | 0].name}・尾巴 ${size.toFixed(1)} s`, rx, ry - 8);

    // ---- 右半：衰減曲線 ----
    const x0 = W * 0.54, x1 = W - 12, y0 = 26, y1 = H - 26;
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = y0 + (y1 - y0) * i / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    const env = t => {                                   // t：0..1 的尾巴比例
      const sec = t * size;
      let v = Math.pow(1 - t, 2.2) * Math.exp(-3 * t);
      v *= Math.min(1, sec / Math.max(1e-4, prof.attack));
      if (prof.gate) v *= t < prof.gate ? 1 : Math.max(0, 1 - (t - prof.gate) / 0.02);
      if (P.space === 4) v *= 1 + 0.35 * Math.cos(2 * Math.PI * 2400 * sec) * Math.exp(-2 * t);
      return Math.max(0, v);
    };
    const curve = (yOf, col) => {
      g.beginPath();
      for (let i = 0; i <= 200; i++) {
        const t = i / 200, x = x0 + (x1 - x0) * t, y = yOf(env(t));
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    };
    const yOf = v => y1 - Math.min(1, v) * (y1 - y0);
    // 低頻：原始曲線；高頻：依 damp 衰減得更快
    curve(yOf, 'rgba(53,201,165,.9)');
    const hfK = 1 + (16000 - P.damp) / 6000;
    curve(v => yOf(Math.pow(v, hfK)), 'rgba(79,157,255,.75)');

    // 閘門切點
    if (prof.gate) {
      const gx = x0 + (x1 - x0) * prof.gate;
      g.strokeStyle = 'rgba(255,107,107,.7)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(gx, y0); g.lineTo(gx, y1); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,107,107,.8)'; g.font = '9px ui-monospace'; g.fillText('切點', gx + 3, y0 + 10);
    }
    // 圖例與座標
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '9px ui-monospace';
    g.fillText('音量', x0 - 2, y0 - 8); g.fillText('0', x0, y1 + 12); g.fillText(`${size.toFixed(1)} s`, x1 - 26, y1 + 12);
    g.fillStyle = 'rgba(53,201,165,.85)'; g.fillText('低頻', x1 - 62, y0 - 8);
    g.fillStyle = 'rgba(79,157,255,.85)'; g.fillText('高頻', x1 - 26, y0 - 8);
    // 調變：畫出尾巴的「飄動」提示
    if (P.mod > 1) {
      g.strokeStyle = `rgba(255,255,255,${0.05 + P.mod / 400})`; g.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        for (let i = 0; i <= 200; i++) {
          const t = i / 200, x = x0 + (x1 - x0) * t, y = yOf(env(t) * 0.92) + Math.sin(t * 26 + k) * 2.5;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    }
  };
  let lastSig = '';
  // 視窗大小也會影響畫布，一起納入簽章，才不會第一次畫在 0 寬上
  const sig = () => [P.space, P.size, P.predelay, P.damp, P.er, P.mod, P.width, cv.clientWidth, cv.clientHeight].join('|');
  const drawIfNeeded = () => { const s = sig(); if (s === lastSig) return; lastSig = s; draw(); };
  drawIfNeeded();
  let t = 0;
  const tick = () => { if (!root.isConnected) return; drawIfNeeded(); t = requestAnimationFrame(tick); };
  t = requestAnimationFrame(tick);
  root._dispose = () => cancelAnimationFrame(t);
  root._refresh = () => {
    refreshers.forEach(f => f());
    [...root.querySelectorAll('.rvx-spaces button')].forEach((x, i) => x.classList.toggle('on', i === P.space));
  };
  return root;
}
