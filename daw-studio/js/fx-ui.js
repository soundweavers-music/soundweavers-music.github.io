// 效果器介面：插入槽清單、效果器參數面板、Send 旋鈕、Bus 設定
// owner：軌道 id、'bus0' / 'bus1'、'master'
import { store } from './state.js';
import { engine } from './engine.js';
import { FX_TYPES, FX_CATS, MAX_INSERTS, newFx, fillFxParams, fmtParam } from './effects.js';
import { presetsFor } from './fx-presets.js';
import { eqEditor } from './eq-editor.js';
import { tuneEditor } from './autotune-ui.js';
import { harmEditor } from './harmony-ui.js';
import { widthEditor } from './width-ui.js';
import { reverbEditor } from './reverb-ui.js';
import { mbcompEditor } from './mbcomp-ui.js';
import { showMenu, showMenuCols } from './menu.js';
import { fxIcon } from './fx-icons.js';
import { fxVisual } from './fx-visual.js';
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
    s.dataset.fxid = d.id;
    s.innerHTML = `<button class="fx-pow" title="開／關">${d.on ? '●' : '○'}</button>${fxIcon(d.type)}<span class="fx-name">${FX_TYPES[d.type].short}</span>`;
    s.title = `${FX_TYPES[d.type].name}（點一下編輯、上下拖曳調整順序、右鍵更多）`;
    s.querySelector('.fx-pow').addEventListener('click', e => {
      e.stopPropagation();
      store.checkpoint(); d.on = !d.on; store.changed('fx');
    });
    bindSlotDrag(owner, box, s, d);
    s.addEventListener('click', () => { if (!suppressSlotClick) openFxPanel(owner, d.id); });
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
      const pick = type => () => {
        store.checkpoint();
        const fx = newFx(type);
        list.push(fx);
        store.changed('fx');
        openFxPanel(owner, fx.id);
      };
      // 24 種效果器分成好幾欄，選單才不會長到要捲
      const rows = FX_CATS.reduce((a, c) => a + c.types.length + 1, 0);
      const per = Math.ceil(rows / 3);
      const cols = [[]];
      let n = 0;
      for (const cat of FX_CATS) {
        if (n >= per && cols.length < 3) { cols.push([]); n = 0; }
        cols[cols.length - 1].push({ header: cat.name });
        n++;
        for (const type of cat.types) {
          cols[cols.length - 1].push({ label: FX_TYPES[type].name, icon: fxIcon(type), indent: true, action: pick(type) });
          n++;
        }
      }
      showMenuCols(r.left, r.bottom + 2, cols);
      e.stopPropagation();
    });
    box.appendChild(add);
  }
  return box;
}

// 插入槽上下拖曳＝調整效果器順序（訊號會照這個順序處理）
// 拖曳中只搬 DOM，放開才改資料，避免每次移動都重畫整個清單
let suppressSlotClick = false;

function bindSlotDrag(owner, box, el, d) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.fx-pow')) return;
    const y0 = e.clientY;
    let moved = false, snapshot = null;
    const slots = () => [...box.querySelectorAll('.fx-slot:not(.add)')].filter(x => x !== el);
    const onMove = ev => {
      if (!moved && Math.abs(ev.clientY - y0) < 4) return;
      if (!moved) { moved = true; snapshot = JSON.stringify(store.project); el.classList.add('dragging'); }
      const target = slots().find(x => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      const add = box.querySelector('.fx-slot.add');
      if (target) {
        if (el.nextElementSibling !== target) box.insertBefore(el, target);
      } else if (el.nextElementSibling !== add) {
        if (add) box.insertBefore(el, add); else box.appendChild(el);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.classList.remove('dragging');
      if (!moved) return;
      // 拖完會接著跳出 click，不要順手把面板打開
      suppressSlotClick = true;
      setTimeout(() => { suppressSlotClick = false; }, 0);
      const order = [...box.querySelectorAll('.fx-slot:not(.add)')].map(x => x.dataset.fxid);
      const list = ownerList(owner) || [];
      if (order.length !== list.length || order.every((id, i) => list[i]?.id === id)) return;
      store.undoStack.push(snapshot); store.redoStack.length = 0; store.dirty = true;
      const byId = new Map(list.map(x => [x.id, x]));
      list.length = 0;
      for (const id of order) { const x = byId.get(id); if (x) list.push(x); }
      store.changed('fx');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// ---------------- 參數面板（浮動視窗，可以同時開很多個）----------------
// fxId -> 面板元素（_owner、_fx、_raf、_eq）
const panels = new Map();
let zTop = 120;

function closeFxPanelIf(id) { if (panels.has(id)) closeFxPanel(id); }
// 不帶 id：關掉最上面那個（Esc）；'all'：全部關掉
export function closeFxPanel(id) {
  if (id === 'all') { [...panels.keys()].forEach(k => closeFxPanel(k)); return; }
  if (id === undefined) {
    let top = null;
    for (const p of panels.values()) if (!top || (+p.style.zIndex || 0) > (+top.style.zIndex || 0)) top = p;
    if (!top) return;
    id = top._fx;
  }
  const panel = panels.get(id);
  if (!panel) return;
  if (panel._eq?._dispose) panel._eq._dispose();
  cancelAnimationFrame(panel._raf);
  panel.remove();
  panels.delete(id);
}
const raise = p => { p.style.zIndex = ++zTop; };

export function openFxPanel(owner, fxId) {
  const list = ownerList(owner);
  const d = list?.find(x => x.id === fxId);
  if (!d) return;
  fillFxParams(d);          // 舊專案的效果器可能少了新參數，補齊才不會出現 NaN

  const old = panels.get(fxId);
  const keepPos = old && { left: old.style.left, top: old.style.top, width: old.style.width, height: old.style.height };
  if (old) closeFxPanel(fxId);
  const T = FX_TYPES[d.type];
  const presets = presetsFor(d.type);
  const panel = document.createElement('div');
  panel._owner = owner; panel._fx = fxId;
  panels.set(fxId, panel);
  raise(panel);
  panel.addEventListener('pointerdown', () => raise(panel), true);
  const wide = d.type === 'eq' || d.type === 'tune' || d.type === 'harm' || d.type === 'reverb' || d.type === 'width' || d.type === 'mbcomp';
  panel.className = 'fx-panel' + (wide ? ' wide' : T.custom ? '' : ' vis')
    + (d.type === 'tune' ? ' tune' : d.type === 'harm' ? ' harm' : d.type === 'reverb' ? ' reverb' : d.type === 'width' ? ' width' : d.type === 'mbcomp' ? ' mb' : '');
  panel.innerHTML = `
    <div class="fx-head"><span class="fx-title">${T.name}</span><span class="fx-owner"></span>
      <button class="tbtn ghost fx-onoff">${d.on ? '啟用中' : '已停用'}</button><button class="tbtn ghost fx-x" title="關閉 (Esc)">✕</button></div>
    ${presets.length ? `<div class="fx-presets"><select class="fx-pre"><option value="">預設值…</option>${
      [...new Set(presets.map(x => x.group))].map(g => `<optgroup label="${g}">${presets.map((x, i) => x.group === g ? `<option value="${i}">${x.name}</option>` : '').join('')}</optgroup>`).join('')
    }</select><span class="fx-tip"></span></div>` : ''}
    <div class="fx-custom"></div>
    <div class="fx-params"></div>
    ${d.type === 'gate' ? '<p class="fx-note">門檻以下會衰減：擴展比 20:1 等於是硬閘（安靜時幾乎全關）。輸出檔案時也有效。想找門檻就先把「最大衰減」調小一點，聽得見門檻在哪裡再調回去。</p>' : ''}
    ${d.type === 'eq' ? '<p class="fx-note">拖曳圓點：左右改頻率、上下改增益；滾輪改 Q；雙擊歸零或開關。按住 Shift 微調。播放時背景顯示即時頻譜（灰 = 處理前、彩色 = 處理後）。</p>' : ''}
    ${d.type === 'limiter' ? '<p class="fx-note">5 ms 的預看延遲：增益在峰值<b>還沒到</b>之前就降下來，所以不會削波。放在軌道上會自動補償這段延遲；放在匯流排或母帶上則是整個混音一起晚 5 ms（並聯混音時要注意相位）。上限建議 −1 dBTP，串流平台會再轉檔。</p>' : ''}
    ${d.type === 'transient' ? '<p class="fx-note">「起音」只改變每個音<b>開頭</b>的力道（鼓的敲擊感、吉他的撥弦），「延音」改變之後的尾巴。兩個都是 ±12 dB，往負的方向就是收掉。</p>' : ''}
    ${d.type === 'mbcomp' ? '<p class="fx-note">三個頻段各自壓縮：低頻穩住、中頻收一點、高頻只擋峰值。分頻點直接拖曳上面的圓點；三條曲線相加是平的（Linkwitz-Riley 4 階），所以分頻點不會凹陷。每一段右邊的數字是即時衰減量。</p>' : ''}
    ${d.type === 'flanger' ? '<p class="fx-note">短延遲（0.5–10 ms）被 LFO 來回掃動，與原聲相加形成會移動的梳狀濾波。回授可以負值（−）讓梳狀的高峰換位置。</p>' : ''}
    ${d.type === 'phaser' ? '<p class="fx-note">一串全通濾波器讓相位隨頻率旋轉，與原聲相加就會出現幾個凹洞（不是梳狀，凹洞少而寬）。階數越多凹洞越多，回授越多凹洞越深。</p>' : ''}
    ${d.type === 'tremolo' ? '<p class="fx-note">音量週期性的變大變小。立體模式選「左右反相」就變成 Auto-Pan（聲音在左右之間擺）；「左右差 90°」聽起來像繞著頭轉。</p>' : ''}
    ${d.type === 'autofilter' ? '<p class="fx-note">濾波器的頻率被 LFO 掃動，是電子音樂最常用的動態濾波。共振（Q）拉高會出現「啾」的哨音，注意它會讓某個頻率變大很多。</p>' : ''}
    ${d.type === 'bitcrush' ? '<p class="fx-note">位元深度降低 → 階梯狀的量化雜訊；取樣率降低 → 高頻的「金屬碎屑」感。兩者合起來是 80 年代取樣器與 Lo-fi 的味道。</p>' : ''}
    ${d.type === 'ringmod' ? '<p class="fx-note">把輸入乘上一個正弦波，產生「鐘聲、機器人」的聲音。深度 100% 時原本的音高會消失，只剩和音與差音；深度低一點則保留原聲。</p>' : ''}
    ${d.type === 'exciter' ? '<p class="fx-note">只在高頻加上新的泛音，低頻完全沒有動（濕度 100% 也不會吃掉低頻）。適合人聲、弦樂與已經很滿的混音。</p>' : ''}
    ${d.type === 'stereodelay' ? '<p class="fx-note">左右各一條延遲，時間分開設定就會有「左邊先、右邊後」的立體回音；交叉回授會讓回音在左右之間彈。</p>' : ''}
    ${d.type === 'utility' ? '<p class="fx-note">純粹的整理工具：增益、聲像、相位反轉、單聲道化。單聲道化常用在檢查混音（MONO 按鈕聽起來還平衡嗎）。</p>' : ''}
    ${d.type === 'tune' ? `<p class="fx-note">修音延遲約 ${d.params.live ? 16 : 32} ms，播放與輸出時會自動補償、跟伴奏對齊。錄音時開啟這一軌的 <b>I（輸入監聽）</b>可以邊唱邊聽修正後的聲音；錄進去的仍是原聲，之後隨時能改設定。建議放在效果器第一格（EQ、壓縮之前）。<br><b>現場演出</b>請開「現場低延遲」（16 ms，最低音域到 100 Hz）；<b>音符編輯</b>可以針對單一個音指定音高、長度與強度。</p>` : ''}
    ${d.type === 'width' ? '<p class="fx-note">單聲道來源（木吉他、貝斯、單支麥克風的人聲）選 <b>Haas 延遲</b> 或 <b>相位去相關</b>，它會自己生出側向訊號；已經是立體聲的素材可以選 <b>M-S 擴大</b>。低頻保持在中央，單聲道監聽時寬度會消失、不會反相，所以車上音響與手機喇叭都安全。</p>' : ''}
    ${d.type === 'reverb' ? '<p class="fx-note">左邊是空間剖面（音源、聽者、第一次反射），右邊是衰減曲線：綠色是低頻、藍色是高頻，兩條分開就是「高頻衰減」在做的事。放在 <b>Bus</b> 上、濕度 100% 可以讓好幾軌共用同一個空間，比每軌各掛一個省電腦資源。</p>' : ''}
    ${d.type === 'harm' ? '<p class="fx-note">和聲只適合<b>單一旋律</b>的人聲（獨唱、清唱），延遲約 32 ms，播放與輸出時自動補償。<b>依和弦</b>時和聲只會落在和弦音上，最不容易唱到「不和諧」的音；<b>段落模式</b>開啟後，只有在時間軸上的段落裡才有和聲。這個效果器自己會輸出主唱，不要再另外加濕度。</p>' : ''}
    ${d.type === 'pitch' ? '<p class="fx-note">即時移調適合做和聲、雙重人聲、八度疊加等效果，音準會有輕微顫動。<b>要把整段伴奏或人聲轉調</b>，請在片段上按右鍵選「升降音…」，用高品質演算法重新計算，音準準確。</p>' : ''}
    ${d.type === 'deess' ? '<p class="fx-note">打開「只聽齒音」，邊播放邊調「齒音頻率」，找到最刺耳的位置後再關掉。衰減量通常 3–8 dB 就夠，壓太多會像大舌頭。</p>' : ''}`;
  panel.querySelector('.fx-owner').textContent = ownerName(owner) || '';
  document.body.appendChild(panel);
  // 可以拉大：右下角的把手；大小依效果器類型記住
  const grip = document.createElement('div');
  grip.className = 'fx-grip'; grip.title = '拖曳改變視窗大小（雙擊還原）';
  panel.appendChild(grip);
  const SZ = 'zhiyin-daw-fxsize:' + d.type;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SZ) || 'null'); } catch (_) { return null; } })();
  if (saved && !keepPos) Object.assign(panel.style, { width: saved.w + 'px', height: saved.h + 'px' });
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); try { grip.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    const r = panel.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    panel.classList.add('sized');
    const mv = ev => {
      panel.style.width = Math.max(360, Math.min(innerWidth - r.left - 4, r.width + ev.clientX - x0)) + 'px';
      panel.style.height = Math.max(240, Math.min(innerHeight - r.top - 4, r.height + ev.clientY - y0)) + 'px';
      panel.dispatchEvent(new Event('fx-resize'));
    };
    const up = () => {
      grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up);
      const rr = panel.getBoundingClientRect();
      localStorage.setItem(SZ, JSON.stringify({ w: Math.round(rr.width), h: Math.round(rr.height) }));
      panel._eq?._refresh?.();
    };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { localStorage.removeItem(SZ); panel.style.width = ''; panel.style.height = ''; panel.classList.remove('sized'); panel._eq?._refresh?.(); });
  if (saved && !keepPos) panel.classList.add('sized');
  if (keepPos) { Object.assign(panel.style, keepPos); if (keepPos.height) panel.classList.add('sized'); }
  else {
    const w = d.type === 'eq' ? 640 : d.type === 'tune' ? 720 : d.type === 'harm' ? 780 : d.type === 'reverb' ? 620 : d.type === 'width' ? 600 : d.type === 'mbcomp' ? 660 : T.custom ? 420 : 488;
    // 新開的面板錯開一點，不要整個疊在前一個上面
    const n = panels.size - 1, off = (n % 8) * 28;
    panel.style.left = Math.max(10, Math.min(innerWidth - w - 10, innerWidth / 2 - w / 2 + off)) + 'px';
    panel.style.top = Math.max(10, innerHeight / 2 - (d.type === 'eq' ? 280 : d.type === 'tune' ? 340 : d.type === 'harm' ? 380 : d.type === 'reverb' ? 300 : d.type === 'width' ? 260 : 220) + off) + 'px';
  }
  panel.querySelector('.fx-x').onclick = () => closeFxPanel(fxId);
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
      const np = panels.get(fxId);
      const p2 = np?.querySelector('.fx-pre'); if (p2) p2.value = pre.value;
      const tip = np?.querySelector('.fx-tip'); if (tip) tip.textContent = x.tip || '';
    };
  }

  const box = panel.querySelector('.fx-params');
  if (T.custom === 'tune') {
    const ed = tuneEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  if (T.custom === 'harm') {
    const ed = harmEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  if (T.custom === 'eq') {
    const ed = eqEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  if (T.custom === 'width') {
    const ed = widthEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  if (T.custom === 'reverb') {
    const ed = reverbEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  if (T.custom === 'mbcomp') {
    const ed = mbcompEditor(owner, d, live => { store.dirty = true; if (live) store.emit('fx-live', {}); else store.changed('fx'); });
    panel.querySelector('.fx-custom').appendChild(ed);
    panel._eq = ed;
    panel._params = d.params; panel._on = d.on;
  }
  for (const [k, def] of Object.entries(T.params)) {
    if (T.custom) break;   // EQ、人聲修音用自己的編輯器
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
  // 圖表：EQ／修音／和聲／殘響／寬度有自己的編輯器，其餘都在這裡加一張參數驅動的視覺圖
  if (!T.custom) {
    const vis = fxVisual(owner, d, d.type);
    panel.querySelector('.fx-custom').appendChild(vis);
    panel._eq = vis; panel._params = d.params; panel._on = d.on;
  }
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
  for (const panel of [...panels.values()]) {
    const owner = panel._owner, id = panel._fx;
    const list = ownerList(owner);
    const d = list && list.find(x => x.id === id);
    if (!d) { closeFxPanel(id); continue; }
    if (kind !== 'structure' && kind !== 'fx') continue;
    // 參數物件被換掉了（undo、套用預設值）：要重開；否則自訂編輯器只刷新數值，不重建畫布
    if (panel._eq && panel._params === d.params && panel._on === d.on) { panel._eq._refresh(); continue; }
    // 拖曳中的 change 事件不要把 slider 換掉
    if (!panel.matches(':active')) openFxPanel(owner, id);
    else if (panel._eq) panel._params = d.params;
  }
});
// Esc：關掉最上面那個面板（游標在輸入框時不處理）
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !panels.size || e.target.closest?.('input, select, textarea')) return;
  closeFxPanel();
});
