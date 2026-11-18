// 效果器介面：插入槽清單、效果器參數面板、Send 旋鈕、Bus 設定
// owner：軌道 id、'bus0' / 'bus1'、'master'
import { store } from './state.js';
import { engine } from './engine.js';
import { FX_TYPES, FX_ORDER, MAX_INSERTS, newFx, fmtParam, buildFx } from './effects.js';
import { showMenu } from './menu.js';
import { toast, fmtDb } from './util.js';

const $ = id => document.getElementById(id);

export function ownerList(owner) {
  const p = store.project;
  if (owner === 'master') return p.masterInserts;
  if (typeof owner === 'string' && owner.startsWith('bus')) return p.buses[Number(owner.slice(3))]?.inserts;
  return store.track(owner)?.inserts;
}

function ownerName(owner) {
  if (owner === 'master') return '立體聲輸出';
  if (owner.startsWith?.('bus')) return store.project.buses[Number(owner.slice(3))]?.name;
  return store.track(owner)?.name;
}

// 插入槽清單（檢閱器與混音台共用）。compact：混音台用的小尺寸
export function insertSlots(owner, compact = false) {
  const list = ownerList(owner) || [];
  const box = document.createElement('div');
  box.className = 'fx-slots' + (compact ? ' compact' : '');
  list.forEach((d, i) => {
    const s = document.createElement('div');
    s.className = 'fx-slot' + (d.on ? '' : ' off');
    s.innerHTML = `<button class="fx-pow" title="開／關">${d.on ? '●' : '○'}</button><span class="fx-name">${FX_TYPES[d.type].short}</span>`;
    s.title = `${FX_TYPES[d.type].name}（點一下編輯、右鍵更多）`;
    s.querySelector('.fx-pow').addEventListener('click', e => {
      e.stopPropagation();
      store.checkpoint(); d.on = !d.on; store.changed('fx');
    });
    s.addEventListener('click', () => openFxPanel(owner, d.id));
    s.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      showMenu(e.clientX, e.clientY, [
        { label: '編輯參數', action: () => openFxPanel(owner, d.id) },
        { label: d.on ? '停用（bypass）' : '啟用', action: () => { store.checkpoint(); d.on = !d.on; store.changed('fx'); } },
        { label: '往前移', disabled: i === 0, action: () => { store.checkpoint(); list.splice(i - 1, 0, list.splice(i, 1)[0]); store.changed('fx'); } },
        { label: '往後移', disabled: i === list.length - 1, action: () => { store.checkpoint(); list.splice(i + 1, 0, list.splice(i, 1)[0]); store.changed('fx'); } },
        { label: '重設為預設值', action: () => { store.checkpoint(); d.params = newFx(d.type).params; store.changed('fx'); } },
        '-',
        { label: '移除', danger: true, action: () => { store.checkpoint(); list.splice(i, 1); store.changed('fx'); closeFxPanelIf(d.id); } },
      ]);
    });
    box.appendChild(s);
  });
  if (list.length < MAX_INSERTS) {
    const add = document.createElement('button');
    add.className = 'fx-slot add';
    add.textContent = compact ? '＋' : '＋ 效果器';
    add.title = '新增插入效果器';
    add.addEventListener('click', e => {
      const r = add.getBoundingClientRect();
      showMenu(r.left, r.bottom + 2, FX_ORDER.map(type => ({
        label: FX_TYPES[type].name,
        action: () => {
          store.checkpoint();
          const fx = newFx(type);
          list.push(fx);
          store.changed('fx');
          openFxPanel(owner, fx.id);
        },
      })));
      e.stopPropagation();
    });
    box.appendChild(add);
  }
  return box;
}

// ---------------- 參數面板（浮動視窗）----------------
let panel = null, panelOwner = null, panelFx = null, raf = 0;

function closeFxPanelIf(id) { if (panelFx === id) closeFxPanel(); }
export function closeFxPanel() {
  if (panel) panel.remove();
  panel = null; panelOwner = null; panelFx = null;
  cancelAnimationFrame(raf);
}

export function openFxPanel(owner, fxId) {
  const list = ownerList(owner);
  const d = list?.find(x => x.id === fxId);
  if (!d) return;
  const keepPos = panel && { left: panel.style.left, top: panel.style.top };
  closeFxPanel();
  panelOwner = owner; panelFx = fxId;
  const T = FX_TYPES[d.type];
  panel = document.createElement('div');
  panel.className = 'fx-panel';
  panel.innerHTML = `
    <div class="fx-head"><span class="fx-title">${T.name}</span><span class="fx-owner"></span>
      <button class="tbtn ghost fx-onoff">${d.on ? '啟用中' : '已停用'}</button><button class="tbtn ghost fx-x" title="關閉">✕</button></div>
    <canvas class="fx-viz" height="90"></canvas>
    <div class="fx-params"></div>
    ${d.type === 'gate' ? '<p class="fx-note">噪音閘只在即時播放與錄音監聽時作用；輸出檔案時會略過（瀏覽器的離線算圖沒有辦法做門檻開關）。</p>' : ''}`;
  panel.querySelector('.fx-owner').textContent = ownerName(owner) || '';
  document.body.appendChild(panel);
  if (keepPos) Object.assign(panel.style, keepPos);
  else { panel.style.left = Math.max(10, innerWidth / 2 - 210) + 'px'; panel.style.top = Math.max(70, innerHeight / 2 - 220) + 'px'; }
  panel.querySelector('.fx-x').onclick = closeFxPanel;
  panel.querySelector('.fx-onoff').onclick = () => { store.checkpoint(); d.on = !d.on; store.changed('fx'); openFxPanel(owner, fxId); };
  // 拖曳標題列移動視窗
  const head = panel.querySelector('.fx-head');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { panel.style.left = Math.max(0, ev.clientX - x0) + 'px'; panel.style.top = Math.max(0, ev.clientY - y0) + 'px'; };
    const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
  });

  const box = panel.querySelector('.fx-params');
  for (const [k, def] of Object.entries(T.params)) {
    const row = document.createElement('label');
    row.className = 'fx-row';
    const toPos = v => (def.log ? Math.log(v / def.min) / Math.log(def.max / def.min) : (v - def.min) / (def.max - def.min));
    const fromPos = t => {
      let v = def.log ? def.min * Math.pow(def.max / def.min, t) : def.min + t * (def.max - def.min);
      v = Math.round(v / def.step) * def.step;
      return Math.max(def.min, Math.min(def.max, +v.toFixed(5)));
    };
    row.innerHTML = `<span class="fx-lbl">${def.label}</span><input type="range" min="0" max="1000" step="1"><span class="fx-val"></span>`;
    const inp = row.querySelector('input'), val = row.querySelector('.fx-val');
    const show = () => { val.textContent = fmtParam(def, d.params[k], store.project.bpm); };
    inp.value = Math.round(toPos(d.params[k]) * 1000);
    show();
    if (def.toggle) inp.max = 1, inp.step = 1, inp.value = d.params[k];
    inp.addEventListener('pointerdown', () => store.checkpoint());
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('input', () => {
      d.params[k] = def.toggle ? Number(inp.value) : fromPos(inp.value / 1000);
      show();
      store.dirty = true;
      store.emit('fx-live', {});
    });
    inp.addEventListener('change', () => store.changed('fx'));
    inp.addEventListener('dblclick', () => { store.checkpoint(); d.params[k] = def.def; inp.value = def.toggle ? def.def : Math.round(toPos(def.def) * 1000); show(); store.changed('fx'); });
    box.appendChild(row);
  }
  const cv = panel.querySelector('.fx-viz');
  if (d.type === 'eq' || d.type === 'comp') drawLoop(cv, owner, d);
  else cv.style.display = 'none';
}

// EQ 曲線／壓縮器 GR 表
function drawLoop(cv, owner, d) {
  const dpr = devicePixelRatio || 1;
  const W = cv.clientWidth || 400, H = 90;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const freqs = new Float32Array(200);
  for (let i = 0; i < 200; i++) freqs[i] = 20 * Math.pow(1000, i / 199);
  let grHold = 0;
  let previewCtx = null, previewEq = null;
  const frame = () => {
    if (!panel || panelFx !== d.id) return;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, H);
    let inst = engine.ctx && engine.fxInstance(owner, d.id);
    // 引擎還沒啟動（或效果器停用中）：用一個離線 context 建一份同參數的 EQ 來算頻率響應
    if (d.type === 'eq' && !inst) {
      if (!previewCtx) previewCtx = new OfflineAudioContext(1, 128, 48000);
      if (!previewEq) previewEq = buildFx(previewCtx, d);
      previewEq.set(d.params);
      inst = previewEq;
    }
    if (d.type === 'eq') {
      g.strokeStyle = '#2a2c31';
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = Math.log(f / 20) / Math.log(1000) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (const db of [-12, 0, 12]) { const y = H / 2 - db / 36 * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.fillStyle = '#7d818b'; g.font = '9px sans-serif';
      for (const [f, s] of [[100, '100'], [1000, '1k'], [10000, '10k']]) g.fillText(s, Math.log(f / 20) / Math.log(1000) * W + 2, H - 3);
      if (inst?.response) {
        const mag = inst.response(freqs);
        g.beginPath();
        for (let i = 0; i < 200; i++) {
          const db = 20 * Math.log10(Math.max(1e-6, mag[i]));
          const x = i / 199 * W, y = H / 2 - Math.max(-18, Math.min(18, db)) / 36 * H;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.strokeStyle = d.on ? '#4f9dff' : '#555'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
        g.lineTo(W, H / 2); g.lineTo(0, H / 2); g.closePath(); g.fillStyle = d.on ? 'rgba(79,157,255,.15)' : 'rgba(90,90,90,.1)'; g.fill();
      } else { g.fillStyle = '#7d818b'; g.fillText('按播放後顯示頻率響應', 10, 20); }
    } else {
      // 壓縮量：上方的紅條（0 ~ -24 dB）＋ 轉移曲線
      const gr = inst?.reduction ? -inst.reduction() : 0;
      grHold = Math.max(gr, grHold * 0.9);
      const x0 = W - 120;
      g.strokeStyle = '#2a2c31'; g.strokeRect(10.5, 10.5, 80, 70);
      const P = d.params;
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const inDb = -60 + i / 80 * 60;
        let outDb = inDb;
        if (inDb > P.threshold) outDb = P.threshold + (inDb - P.threshold) / P.ratio;
        outDb += P.makeup;
        const y = 80 - (outDb + 60) / 60 * 70;
        i ? g.lineTo(10 + i, Math.max(10, y)) : g.moveTo(10, y);
      }
      g.strokeStyle = '#f5b83d'; g.stroke();
      g.fillStyle = '#7d818b'; g.font = '10px sans-serif';
      g.fillText('增益衰減', x0 - 60, 24);
      g.fillStyle = '#16171a'; g.fillRect(x0, 14, 110, 12);
      g.fillStyle = '#ff6b6b'; g.fillRect(x0, 14, Math.min(110, grHold / 24 * 110), 12);
      g.fillStyle = '#e9eaee'; g.font = '12px ui-monospace, Consolas';
      g.fillText(`-${grHold.toFixed(1)} dB`, x0, 50);
      if (!inst) { g.fillStyle = '#7d818b'; g.font = '10px sans-serif'; g.fillText('播放時顯示即時壓縮量', x0 - 60, 74); }
    }
    raf = requestAnimationFrame(frame);
  };
  frame();
}

// ---------------- Send 旋鈕（檢閱器）----------------
export function sendSection(t) {
  const sec = document.createElement('div');
  sec.className = 'sec';
  sec.innerHTML = '<h4 style="margin-top:0">Send（送到匯流排）</h4>';
  store.project.buses.forEach((b, i) => {
    const row = document.createElement('label');
    row.className = 'fx-row';
    row.innerHTML = `<span class="fx-lbl" title="${b.name}">${b.name.replace(/^Bus /, '')}</span><input type="range" min="-60" max="6" step="0.5"><span class="fx-val"></span>`;
    const inp = row.querySelector('input'), val = row.querySelector('.fx-val');
    inp.value = t.sends[i];
    const show = () => { val.textContent = t.sends[i] <= -60 ? '關' : fmtDb(t.sends[i]); };
    show();
    inp.addEventListener('pointerdown', () => store.checkpoint());
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('input', () => { t.sends[i] = Number(inp.value); show(); store.dirty = true; engine.applyMix(); });
    inp.addEventListener('change', () => store.changed('mix'));
    inp.addEventListener('dblclick', () => { store.checkpoint(); t.sends[i] = t.sends[i] > -60 ? -60 : -12; inp.value = t.sends[i]; show(); store.changed('mix'); });
    sec.appendChild(row);
  });
  const hint = document.createElement('p');
  hint.className = 'midi-status';
  hint.textContent = '雙擊滑桿：開／關。多軌共用同一個殘響，聽起來在同一個空間，也比每軌各掛一個省電腦資源。';
  sec.appendChild(hint);
  return sec;
}

export function insertsSection(owner, title = '插入效果器') {
  const sec = document.createElement('div');
  sec.className = 'sec';
  sec.innerHTML = `<h4 style="margin-top:0">${title}</h4>`;
  sec.appendChild(insertSlots(owner));
  return sec;
}

// 效果器變動時，若面板開著就重畫（例如 undo）
store.on('change', ({ kind }) => {
  if (!panel) return;
  const list = ownerList(panelOwner);
  if (!list || !list.find(x => x.id === panelFx)) { closeFxPanel(); return; }
  if (kind === 'structure' || kind === 'fx') {
    // 只在形狀/啟用狀態改變時重開；拖曳中的 change 事件不要把 slider 換掉
    if (!panel.matches(':active')) openFxPanel(panelOwner, panelFx);
  }
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && panel) closeFxPanel(); });
