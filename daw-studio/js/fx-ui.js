// 效果器介面：插入槽清單、效果器參數面板、Send 旋鈕、Bus 設定
// owner：軌道 id、'bus0' / 'bus1'、'master'
import { store } from './state.js';
import { engine } from './engine.js';
import { FX_TYPES, FX_ORDER, MAX_INSERTS, newFx, fmtParam } from './effects.js';
import { presetsFor } from './fx-presets.js';
import { eqEditor } from './eq-editor.js';
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
  if (panel?._eq?._dispose) panel._eq._dispose();
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
  const presets = presetsFor(d.type);
  panel = document.createElement('div');
  panel.className = 'fx-panel' + (d.type === 'eq' ? ' wide' : '');
  panel.innerHTML = `
    <div class="fx-head"><span class="fx-title">${T.name}</span><span class="fx-owner"></span>
      <button class="tbtn ghost fx-onoff">${d.on ? '啟用中' : '已停用'}</button><button class="tbtn ghost fx-x" title="關閉 (Esc)">✕</button></div>
    ${presets.length ? `<div class="fx-presets"><select class="fx-pre"><option value="">預設值…</option>${
      [...new Set(presets.map(x => x.group))].map(g => `<optgroup label="${g}">${presets.map((x, i) => x.group === g ? `<option value="${i}">${x.name}</option>` : '').join('')}</optgroup>`).join('')
    }</select><span class="fx-tip"></span></div>` : ''}
    <div class="fx-custom"></div>
    <canvas class="fx-viz" height="90"></canvas>
    <div class="fx-params"></div>
    ${d.type === 'gate' ? '<p class="fx-note">噪音閘只在即時播放與錄音監聽時作用；輸出檔案時會略過（瀏覽器的離線算圖沒有辦法做門檻開關）。</p>' : ''}
    ${d.type === 'eq' ? '<p class="fx-note">拖曳圓點：左右改頻率、上下改增益；滾輪改 Q；雙擊歸零或開關。按住 Shift 微調。播放時背景顯示即時頻譜（灰 = 處理前、彩色 = 處理後）。</p>' : ''}
    ${d.type === 'deess' ? '<p class="fx-note">打開「只聽齒音」，邊播放邊調「齒音頻率」，找到最刺耳的位置後再關掉。衰減量通常 3–8 dB 就夠，壓太多會像大舌頭。</p>' : ''}`;
  panel.querySelector('.fx-owner').textContent = ownerName(owner) || '';
  document.body.appendChild(panel);
  if (keepPos) Object.assign(panel.style, keepPos);
  else {
    const w = d.type === 'eq' ? 640 : 420;
    panel.style.left = Math.max(10, innerWidth / 2 - w / 2) + 'px';
    panel.style.top = Math.max(60, innerHeight / 2 - (d.type === 'eq' ? 280 : 220)) + 'px';
  }
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
  // 預設值
  const pre = panel.querySelector('.fx-pre');
  if (pre) {
    pre.addEventListener('keydown', e => e.stopPropagation());
    pre.onchange = () => {
      const x = presets[Number(pre.value)];
      if (!x) return;
      store.checkpoint();
      d.params = structuredClone(x.params);
      d.on = true;
      store.changed('fx');
      openFxPanel(owner, fxId);
      const p2 = panel.querySelector('.fx-pre'); if (p2) p2.value = pre.value;
      const tip = panel.querySelector('.fx-tip'); if (tip) tip.textContent = x.tip || '';
    };
  }

  const box = panel.querySelector('.fx-params');
  if (T.custom === 'eq') {
    const ed = eqEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  for (const [k, def] of Object.entries(T.params)) {
    if (T.custom === 'eq') break;   // EQ 的輸出增益在編輯器裡
    const row = document.createElement('label');
    row.className = 'fx-row';
    if (def.choices) {
      row.innerHTML = `<span class="fx-lbl">${def.label}</span><select>${def.choices.map((c, i) => `<option value="${i}"${i === d.params[k] ? ' selected' : ''}>${c}</option>`).join('')}</select><span class="fx-val"></span>`;
      const sel = row.querySelector('select');
      sel.addEventListener('keydown', e => e.stopPropagation());
      sel.onchange = () => { store.checkpoint(); d.params[k] = Number(sel.value); store.changed('fx'); };
      box.appendChild(row);
      continue;
    }
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
  if (d.type === 'comp' || d.type === 'deess') drawLoop(cv, owner, d);
  else cv.style.display = 'none';
}

// 壓縮器／去齒音：左邊轉移曲線（輸入 → 輸出），右邊增益衰減的歷史波形
function drawLoop(cv, owner, d) {
  const dpr = devicePixelRatio || 1;
  const W = cv.clientWidth || 400, H = 110;
  cv.style.height = H + 'px';
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hist = new Float32Array(Math.max(60, Math.floor(W - 130)));
  let hi = 0, grHold = 0;
  const frame = () => {
    if (!panel || panelFx !== d.id) return;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12141a'); bg.addColorStop(1, '#0a0b0e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const inst = engine.ctx && engine.fxInstance(owner, d.id);
    const P = d.params;
    const gr = inst?.reduction ? -inst.reduction() : 0;
    grHold = Math.max(gr, grHold * 0.88);
    hist[hi = (hi + 1) % hist.length] = gr;
    // 轉移曲線（只對壓縮器）
    const S = H - 16, X0 = 10, Y0 = 8;
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(X0 + .5, Y0 + .5, S, S);
    g.beginPath(); g.moveTo(X0, Y0 + S); g.lineTo(X0 + S, Y0); g.strokeStyle = 'rgba(255,255,255,.08)'; g.stroke();
    if (d.type === 'comp') {
      g.beginPath();
      for (let i = 0; i <= S; i++) {
        const inDb = -60 + i / S * 60;
        const k = P.knee / 2;
        let outDb = inDb;
        if (inDb > P.threshold + k) outDb = P.threshold + (inDb - P.threshold) / P.ratio;
        else if (inDb > P.threshold - k && k > 0) { const x = inDb - P.threshold + k; outDb = inDb + (1 / P.ratio - 1) * x * x / (4 * k); }
        outDb += P.makeup;
        const y = Y0 + S - (outDb + 60) / 60 * S;
        i ? g.lineTo(X0 + i, Math.max(Y0, y)) : g.moveTo(X0, y);
      }
      const cg = g.createLinearGradient(X0, 0, X0 + S, 0); cg.addColorStop(0, '#35c9a5'); cg.addColorStop(1, '#f5b83d');
      g.strokeStyle = cg; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
      const tx = X0 + (P.threshold + 60) / 60 * S;
      g.setLineDash([3, 3]); g.strokeStyle = 'rgba(245,184,61,.5)'; g.beginPath(); g.moveTo(tx, Y0); g.lineTo(tx, Y0 + S); g.stroke(); g.setLineDash([]);
    } else {
      // 去齒音：左邊畫偵測頻段的位置（對數頻率軸 1k–16k）
      g.fillStyle = '#7d818b'; g.font = '10px sans-serif'; g.fillText('偵測頻段', X0 + 6, Y0 + 14);
      const fx2 = f => X0 + Math.log(f / 1000) / Math.log(16) * S;
      const lo = P.freq / Math.pow(2, P.range / 2), hi2 = P.freq * Math.pow(2, P.range / 2);
      const bandG = g.createLinearGradient(fx2(lo), 0, fx2(hi2), 0); bandG.addColorStop(0, 'rgba(245,184,61,0)'); bandG.addColorStop(0.5, 'rgba(245,184,61,.55)'); bandG.addColorStop(1, 'rgba(245,184,61,0)');
      g.fillStyle = bandG; g.fillRect(fx2(lo), Y0 + 20, fx2(hi2) - fx2(lo), S - 34);
      g.fillStyle = '#f5b83d'; g.font = '11px ui-monospace'; g.fillText(`${(P.freq / 1000).toFixed(1)}k`, Math.max(X0 + 2, fx2(P.freq) - 12), Y0 + S - 4);
      g.fillStyle = 'rgba(255,255,255,.3)'; g.font = '9px ui-monospace';
      for (const [f, l] of [[2000, '2k'], [4000, '4k'], [8000, '8k']]) g.fillText(l, fx2(f) - 6, Y0 + S - 16);
    }
    // 衰減量歷史（紅色由上往下）
    const hx = X0 + S + 16, hw = W - hx - 10;
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(hx, Y0, hw, S);
    const grad = g.createLinearGradient(0, Y0, 0, Y0 + S); grad.addColorStop(0, 'rgba(255,107,107,.85)'); grad.addColorStop(1, 'rgba(255,107,107,.2)');
    g.fillStyle = grad;
    const n = hist.length;
    for (let i = 0; i < n; i++) {
      const v = hist[(hi + 1 + i) % n];
      if (v <= 0.05) continue;
      const x = hx + i / n * hw;
      g.fillRect(x, Y0, Math.max(1, hw / n), Math.min(S, v / 18 * S));
    }
    for (const db of [3, 6, 12]) { const y = Y0 + db / 18 * S; g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(hx, y); g.lineTo(hx + hw, y); g.stroke(); g.fillStyle = 'rgba(255,255,255,.3)'; g.font = '9px ui-monospace'; g.fillText(`-${db}`, hx + hw - 18, y - 2); }
    g.fillStyle = '#e9eaee'; g.font = '13px ui-monospace, Consolas';
    g.fillText(grHold < 0.05 ? '0.0 dB' : `−${grHold.toFixed(1)} dB`, hx + 6, Y0 + 16);
    if (!engine.playing) { g.fillStyle = '#7d818b'; g.font = '10px sans-serif'; g.fillText('播放時顯示即時衰減量', hx + 6, Y0 + S - 6); }
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
    const d = list.find(x => x.id === panelFx);
    // 參數物件被換掉了（undo、套用預設值）：要重開；否則 EQ 只刷新數值，不重建畫布
    if (panel._eq && panel._params === d.params && panel._on === d.on) { panel._eq._refresh(); return; }
    // 拖曳中的 change 事件不要把 slider 換掉
    if (!panel.matches(':active')) openFxPanel(panelOwner, panelFx);
  }
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && panel) closeFxPanel(); });
