// 多頻段壓縮面板：
//  - 上：三條頻段的頻率響應（低／中／高），分頻點可以直接拖曳；三條相加是平的（Linkwitz-Riley 4 階）
//  - 下：每一段自己的門檻／比例／補償，右邊即時顯示衰減量
//  - 底部：共用的起音／釋放與輸出
import { store } from './state.js';
import { engine } from './engine.js';

const C = { low: '#4f9dff', mid: '#35c9a5', high: '#f5b83d' };
const FMIN = 20, FMAX = 20000, LOGF = Math.log(FMAX / FMIN);
const xOf = (f, x0, w) => x0 + Math.log(Math.max(FMIN, Math.min(FMAX, f)) / FMIN) / LOGF * w;
const fOf = (x, x0, w) => FMIN * Math.exp((x - x0) / w * LOGF);
const bandMag = (band, f, f1, f2) => {
  const r1 = f / Math.max(1, f1), r2 = f / Math.max(1, f2);
  const lp1 = 1 / (1 + r1 * r1 * r1 * r1), hp1 = 1 - lp1;
  const lp2 = 1 / (1 + r2 * r2 * r2 * r2), hp2 = 1 - lp2;
  if (band === 'low') return lp1;
  if (band === 'mid') return hp1 * lp2;
  return hp2;
};

export function mbcompEditor(owner, desc, onChange) {
  const P = desc.params;
  const root = document.createElement('div');
  root.className = 'mbx';
  root.innerHTML = `
    <canvas class="mbx-cv" height="190"></canvas>
    <div class="mbx-bands"></div>
    <div class="mbx-foot"></div>`;
  const $ = s => root.querySelector(s);
  const cv = $('.mbx-cv');

  // ---------- 三條頻段控制 ----------
  const BANDS = [
    { key: 'low', name: '低頻', col: C.low },
    { key: 'mid', name: '中頻', col: C.mid },
    { key: 'high', name: '高頻', col: C.high },
  ];
  const meters = {};
  const rows = [];
  for (const b of BANDS) {
    const col = document.createElement('div');
    col.className = 'mbx-band';
    col.style.setProperty('--c', b.col);
    col.innerHTML = `<h5>${b.name}<b class="mbx-gr">0.0</b></h5>`;
    rows.push({ b, col });
    $('.mbx-bands').appendChild(col);
  }
  const DEF = {
    thr: { label: '門檻', min: -60, max: 0, step: 0.5, unit: 'dB' },
    ratio: { label: '比例', min: 1, max: 20, step: 0.1, unit: ':1' },
    gain: { label: '補償', min: -12, max: 12, step: 0.5, unit: 'dB' },
  };
  const refresh = [];
  for (const { b, col } of rows) {
    for (const [k, d] of Object.entries(DEF)) {
      const pk = b.key + (k === 'thr' ? 'Thr' : k === 'ratio' ? 'Ratio' : 'Gain');
      const row = document.createElement('label');
      row.className = 'fx-row';
      row.innerHTML = `<span class="fx-lbl">${d.label}</span><input type="range" min="0" max="1000" step="1"><span class="fx-val"></span>`;
      const inp = row.querySelector('input'), val = row.querySelector('.fx-val');
      const toPos = v => (v - d.min) / (d.max - d.min);
      const fromPos = t => Math.round((d.min + t * (d.max - d.min)) / d.step) * d.step;
      const fmt = v => (k === 'ratio' ? `${v.toFixed(1)}:1` : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`);
      const show = () => { val.textContent = fmt(P[pk]); inp.value = Math.round(toPos(P[pk]) * 1000); };
      show();
      inp.addEventListener('pointerdown', () => store.checkpoint());
      inp.addEventListener('keydown', e => e.stopPropagation());
      inp.addEventListener('input', () => { P[pk] = fromPos(inp.value / 1000); val.textContent = fmt(P[pk]); live(); });
      inp.addEventListener('change', () => changed());
      inp.addEventListener('dblclick', () => {
        store.checkpoint();
        P[pk] = { thr: -20, ratio: 3, gain: 0 }[k];
        show(); changed();
      });
      col.appendChild(row);
      refresh.push(show);
    }
    meters[b.key] = col.querySelector('.mbx-gr');
  }

  // ---------- 共用參數 ----------
  const FOOT = [
    { k: 'attack', label: '起音', min: 0.1, max: 100, step: 0.1, log: true, fmt: v => `${v.toFixed(1)} ms` },
    { k: 'release', label: '釋放', min: 10, max: 1000, step: 1, log: true, fmt: v => `${Math.round(v)} ms` },
    { k: 'output', label: '輸出', min: -18, max: 18, step: 0.5, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  ];
  for (const R of FOOT) {
    const row = document.createElement('label');
    row.className = 'fx-row';
    row.innerHTML = `<span class="fx-lbl">${R.label}</span><input type="range" min="0" max="1000" step="1"><span class="fx-val"></span>`;
    const inp = row.querySelector('input'), val = row.querySelector('.fx-val');
    const toPos = v => (R.log ? Math.log(v / R.min) / Math.log(R.max / R.min) : (v - R.min) / (R.max - R.min));
    const fromPos = t => {
      const v = R.log ? R.min * Math.pow(R.max / R.min, t) : R.min + t * (R.max - R.min);
      return Math.max(R.min, Math.min(R.max, Math.round(v / R.step) * R.step));
    };
    const show = () => { val.textContent = R.fmt(P[R.k]); inp.value = Math.round(toPos(P[R.k]) * 1000); };
    show();
    inp.addEventListener('pointerdown', () => store.checkpoint());
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('input', () => { P[R.k] = fromPos(inp.value / 1000); val.textContent = R.fmt(P[R.k]); live(); });
    inp.addEventListener('change', () => changed());
    inp.addEventListener('dblclick', () => {
      store.checkpoint();
      P[R.k] = { attack: 8, release: 150, output: 0 }[R.k];
      show(); changed();
    });
    $('.mbx-foot').appendChild(row);
    refresh.push(show);
  }

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { onChange(false); }

  // ---------- 響應圖 + 分頻點拖曳 ----------
  let drag = null, hover = null;
  // 滑鼠 → 畫布座標（畫布左邊留 34 px 給 dB 刻度）
  const localX = clientX => {
    const r = cv.getBoundingClientRect();
    return (clientX - r.left) / Math.max(1, r.width) * cv.clientWidth;
  };
  const grab = clientX => {            // 回傳滑鼠附近的把手：'x1' | 'x2' | null
    const W = cv.clientWidth, x0 = 34, gw = Math.max(1, W - x0 - 12);
    const px = localX(clientX);
    const d1 = Math.abs(px - xOf(P.x1, x0, gw)), d2 = Math.abs(px - xOf(P.x2, x0, gw));
    return d1 < 14 && d1 <= d2 ? 'x1' : d2 < 14 ? 'x2' : null;
  };
  cv.addEventListener('pointerdown', e => {
    drag = grab(e.clientX);
    if (!drag) return;
    store.checkpoint();
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) {
      hover = grab(e.clientX);
      cv.style.cursor = hover ? 'ew-resize' : 'default';
      return;
    }
    const W = cv.clientWidth, x0 = 34, gw = Math.max(1, W - x0 - 12);
    const f = Math.round(fOf(localX(e.clientX), x0, gw));
    if (drag === 'x1') P.x1 = Math.max(40, Math.min(400, Math.min(f, P.x2 / 2)));
    else P.x2 = Math.max(1000, Math.min(12000, Math.max(f, P.x1 * 2)));
    refresh.forEach(fn => fn());
    live();
  });
  cv.addEventListener('pointerup', () => { if (drag) { drag = null; onChange(false); } });

  // ---------- 每幀畫圖 ----------
  let raf = 0;
  const draw = () => {
    if (!root.isConnected) return;
    const dpr = devicePixelRatio || 1;
    const W = cv.clientWidth || 560, H = cv.clientHeight || 190;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#12141a'); bg.addColorStop(1, '#0a0b0e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const x0 = 34, gw = W - x0 - 12, y0 = 16, gh = H - 30;
    const yDb = db => y0 + gh - (Math.max(-24, Math.min(12, db)) + 24) / 36 * gh;
    // 格線
    g.font = '10px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = Math.round(xOf(f, x0, gw)) + .5;
      g.strokeStyle = f === 1000 ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)';
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + gh); g.stroke();
      if ([100, 1000, 10000].includes(f)) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, y0 + gh - 12); }
    }
    for (const db of [12, 6, 0, -6, -12, -24]) {
      const y = Math.round(yDb(db)) + .5;
      g.strokeStyle = db === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.045)';
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + gw, y); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.3)'; g.fillText(`${db > 0 ? '+' : ''}${db}`, 4, y - 5);
    }
    // 三條頻段曲線（填色）+ 相加的響應（虛線）
    const N = 200;
    for (const b of BANDS) {
      const pts = [], fill = [];
      for (let i = 0; i <= N; i++) {
        const f = fOf(x0 + i / N * gw, x0, gw);
        const db = 20 * Math.log10(Math.max(1e-6, bandMag(b.key, f, P.x1, P.x2)));
        const x = x0 + i / N * gw, y = yDb(db);
        pts.push([x, y]); fill.push([x, y]);
      }
      g.beginPath();
      fill.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.lineTo(x0 + gw, y0 + gh); g.lineTo(x0, y0 + gh); g.closePath();
      g.fillStyle = C[b.key] + '18'; g.fill();
      g.strokeStyle = C[b.key]; g.lineWidth = 2;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    }
    // 分頻點把手
    for (const [k, col] of [['x1', C.low], ['x2', C.high]]) {
      const x = xOf(P[k], x0, gw);
      g.strokeStyle = col + 'aa'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + gh); g.stroke(); g.setLineDash([]);
      g.fillStyle = (drag === k || hover === k) ? '#fff' : col;
      g.beginPath(); g.arc(x, y0 - 4, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '10px ui-monospace';
      g.fillText(k === 'x1' ? `${Math.round(P.x1)} Hz` : `${(P.x2 / 1000).toFixed(1)} kHz`, Math.min(x0 + gw - 46, x + 6), y0 + 2);
    }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px ui-monospace';
    g.fillText('拖曳圓點改分頻點', x0 + 4, 2);
    // 即時衰減量
    const inst = engine.ctx && engine.fxInstance(owner, desc.id);
    if (inst && inst.bands) {
      for (const b of BANDS) {
        const red = inst.bands[b.key]?.comp?.reduction ?? 0;
        const el = meters[b.key];
        if (el) el.textContent = red < -0.05 ? `${red.toFixed(1)}` : '0.0';
      }
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  root._dispose = () => cancelAnimationFrame(raf);
  root._refresh = () => refresh.forEach(fn => fn());
  return root;
}
