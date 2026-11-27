// 自動伴奏電子琴面板：LCD、段落按鈕、啟動／同步／過門、聲部混音、可以用滑鼠彈的鍵盤、MIDI Learn
import { store } from './state.js';
import { engine } from './engine.js';
import { arranger, chordLabel, PARTS, SECTIONS, STYLES } from './arranger.js';
import { PRESETS, PRESET_GROUPS, instName } from './synth.js';
import { listBanks, sfInstrumentId } from './soundbank.js';
import { addInputHook, noteOn as kbOn, noteOff as kbOff, midiState, setFallbackTrack } from './midi-input.js';
import { toast } from './util.js';
import { toggleAI } from './ai-ui.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const NN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const nn = m => NN[m % 12] + (Math.floor(m / 12) - 1);
// GM 對應：載入 SoundFont 時自動挑
const GM = { drums: { bank: 128, prog: 0 }, bass: { prog: 33 }, keys: { prog: 0 }, guitar: { prog: 25 }, strings: { prog: 48 }, arp: { prog: 4 } };

// 可以對應的動作（MIDI Learn 與電腦鍵盤）
const ACTIONS = [
  { id: 'start', name: '啟動／停止', key: 'Enter' },
  { id: 'sync', name: '同步啟動', key: 'Backspace' },
  { id: 'fill', name: '過門', key: '\\' },
  ...SECTIONS.map(s => ({ id: 'sec:' + s.id, name: s.name, key: s.key })),
  { id: 'tempo-', name: '速度 −', key: '-' },
  { id: 'tempo+', name: '速度 ＋', key: '=' },
  ...PARTS.map(p => ({ id: 'part:' + p.id, name: `${p.name} 開／關`, key: '' })),
];
const LEARN_KEY = 'arr.learn';
let learn = {};   // actionId -> { t: 'note'|'cc', ch, n }
try { learn = JSON.parse(localStorage.getItem(LEARN_KEY) || '{}'); } catch (_) { learn = {}; }
const saveLearn = () => localStorage.setItem(LEARN_KEY, JSON.stringify(learn));

let root = null, open = false, learning = null, raf = 0, kbHeld = new Set(), taps = [];

function doAction(id) {
  if (id === 'start') arranger.toggle();
  else if (id === 'sync') { arranger.syncStart = !arranger.syncStart; arranger.ensureTracks(); arranger.emit({ kind: 'sync' }); }
  else if (id === 'fill') arranger.go(arranger.section);
  else if (id === 'tempo-') arranger.setTempo(arranger.tempo - 2);
  else if (id === 'tempo+') arranger.setTempo(arranger.tempo + 2);
  else if (id.startsWith('sec:')) { const s = id.slice(4); arranger.running || arranger.syncStart ? arranger.go(s) : arranger.start(s); }
  else if (id.startsWith('part:')) { const p = id.slice(5); arranger.partOn[p] = !arranger.partOn[p]; arranger.emit({ kind: 'part' }); }
}

// MIDI：先看有沒有對應到按鈕（或正在學習），再把音交給伴奏
addInputHook({
  message(d) {
    const [st, a, b] = d, type = st & 0xf0, ch = st & 15;
    const isOn = type === 0x90 && b > 0, isCC = type === 0xb0 && b >= 64;
    if (!isOn && !isCC && !(type === 0x80 || (type === 0x90 && b === 0) || type === 0xb0)) return false;
    const sig = { t: type === 0xb0 ? 'cc' : 'note', ch, n: a };
    if (learning && (isOn || isCC)) {
      for (const k of Object.keys(learn)) if (learn[k].t === sig.t && learn[k].n === sig.n && learn[k].ch === sig.ch) delete learn[k];
      learn[learning] = sig; saveLearn();
      toast(`「${ACTIONS.find(x => x.id === learning).name}」已對應到 ${sig.t === 'cc' ? 'CC ' + a : nn(a)}（ch ${ch + 1}）`);
      learning = null; renderLearn(); return true;
    }
    const hit = Object.entries(learn).find(([, v]) => v.t === sig.t && v.n === a && v.ch === ch);
    if (!hit) return false;
    if (isOn || isCC) doAction(hit[0]);
    return true;   // 對應到的鍵：不當作音符
  },
  note(on, key) {
    if (!open || !arranger.enabled) return false;
    return on ? arranger.keyDown(key) : arranger.keyUp(key);
  },
});

// 右手旋律：沒有選 MIDI 軌時，彈在「伴奏-鋼琴」軌（面板開著才生效）
setFallbackTrack(() => (open ? arranger.track('keys') : null));

function build() {
  root = document.createElement('div');
  root.className = 'arr hidden';
  root.innerHTML = `
  <div class="arr-win">
    <div class="arr-head"><b>自動伴奏電子琴</b><span class="arr-sub">左手按和弦、右手彈旋律；段落按鈕切換前奏、主歌、副歌、過門</span>
      <div class="spacer"></div>
      <label class="arr-en"><input type="checkbox" checked> 伴奏接管左手</label>
      <button type="button" class="tbtn ghost arr-aibtn" title="依和弦軌把整首直接編成 MIDI">✦ 智慧整首編曲</button>
      <button type="button" class="tbtn ghost arr-learnbtn">MIDI 鍵位設定</button>
      <button type="button" class="tbtn ghost arr-max" title="最大化">▢</button>
      <button type="button" class="tbtn ghost arr-x" title="關閉">✕</button></div>
    <div class="arr-top">
      <div class="arr-lcd">
        <div class="l1"><span class="sty"></span><span class="bar"></span></div>
        <div class="l2"><b class="chord">—</b><span class="sec"></span></div>
        <div class="l3"><span class="tempo"></span><span class="beat"><i></i><i></i><i></i><i></i></span><span class="st"></span></div>
      </div>
      <div class="arr-ctl">
        <div class="arr-trans">
          <button type="button" class="arr-big start" data-a="start" title="啟動／停止（Enter）">▶ START</button>
          <button type="button" class="arr-big sync" data-a="sync" title="同步啟動：左手按下第一個和弦時才開始（Backspace）">SYNC</button>
          <button type="button" class="arr-big fill" data-a="fill" title="在這一小節最後打過門（\\）">FILL</button>
          <button type="button" class="arr-big rec" title="把伴奏錄成 MIDI 片段">● REC</button>
        </div>
        <div class="arr-tempo">
          <button type="button" class="tbtn ghost" data-a="tempo-">−</button>
          <input type="number" class="arr-bpm" min="30" max="240">
          <button type="button" class="tbtn ghost" data-a="tempo+">＋</button>
          <button type="button" class="tbtn ghost arr-tap" title="連續點按設定速度">TAP</button>
          <button type="button" class="tbtn ghost arr-reset" title="回到這個風格的建議速度">風格速度</button>
          <button type="button" class="tbtn ghost arr-proj" title="把專案速度設成伴奏速度（要錄進 DAW 時對齊小節線）">同步專案速度</button>
        </div>
        <div class="arr-opt">
          <label>和弦辨識 <select class="arr-mode"><option value="single">單指（C=單鍵、Cm=加左邊黑鍵、C7=加白鍵）</option><option value="fingered">多指（照和弦按法）</option><option value="full">整個鍵盤（雙手都認和弦）</option></select></label>
          <label>分割點 <select class="arr-split"></select></label>
          <label class="chk"><input type="checkbox" class="arr-memory"> 放開仍保持和弦</label>
          <label class="chk"><input type="checkbox" class="arr-autofill"> 換段落時自動過門</label>
          <label class="arr-level" title="伴奏整體力度。聲部全開時若聽到破音，往左調">伴奏音量 <input type="range" class="arr-lvl" min="30" max="100" step="1"><b class="arr-lvlv"></b></label>
        </div>
      </div>
    </div>
    <div class="arr-styles"></div>
    <div class="arr-secs"></div>
    <div class="arr-parts"></div>
    <div class="arr-kbwrap"><div class="arr-kb"></div></div>
    <div class="arr-learn" hidden></div>
    <p class="arr-note">電腦鍵盤：按 Caps Lock 開啟「鍵盤彈奏」後，A S D F… 是琴鍵（Z／X 換八度）；數字 1–9 切換段落、Enter 啟動／停止、\\ 過門、− ＝ 調速度。伴奏的六個聲部是專案裡的「伴奏-」MIDI 軌，可以在混音台調音量、加效果，也能換成 SoundFont 音色。</p>
  </div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  $('.arr-x').onclick = () => toggleArranger(false);
  $('.arr-max').onclick = () => root.classList.toggle('max');
  root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => doAction(b.dataset.a)));
  const en = $('.arr-en input');
  arranger.enabled = true;
  en.onchange = () => { arranger.enabled = en.checked; if (!en.checked) arranger.left.clear(); };
  $('.arr-big.rec').onclick = () => { arranger.rec ? arranger.stopRecording() : arranger.startRecording(); };
  // 速度
  const bpm = $('.arr-bpm');
  bpm.addEventListener('keydown', e => e.stopPropagation());
  bpm.onchange = () => arranger.setTempo(+bpm.value);
  $('.arr-tap').onclick = () => {
    const now = performance.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 3) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); arranger.setTempo(60000 / d); }
  };
  $('.arr-reset').onclick = () => arranger.setTempo(arranger.style.bpm);
  $('.arr-proj').onclick = () => { store.checkpoint(); store.project.bpm = arranger.tempo; store.changed('structure'); toast(`專案速度改為 ${arranger.tempo} BPM`); };
  // 選項
  const mode = $('.arr-mode'), split = $('.arr-split');
  for (let m = 36; m <= 72; m++) split.insertAdjacentHTML('beforeend', `<option value="${m}">${nn(m)} 以下</option>`);
  mode.value = arranger.mode; split.value = arranger.split;
  [mode, split].forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));
  mode.onchange = () => { arranger.setOpt('mode', mode.value); renderKb(); };
  split.onchange = () => { arranger.setOpt('split', +split.value); renderKb(); };
  const mem = $('.arr-memory'), af = $('.arr-autofill');
  mem.checked = arranger.memory; af.checked = arranger.autoFill;
  mem.onchange = () => arranger.setOpt('memory', mem.checked);
  af.onchange = () => arranger.setOpt('autoFill', af.checked);
  // 風格
  const sb = $('.arr-styles');
  sb.innerHTML = STYLES.map(s => `<button type="button" data-s="${s.id}" title="${s.desc}"><b>${s.name}</b><span>${s.bpm} BPM · ${s.sig === 3 ? '6/8' : '4/4'}</span></button>`).join('');
  sb.onclick = e => { const b = e.target.closest('button'); if (!b) return; arranger.setStyle(b.dataset.s); };
  // 段落
  $('.arr-secs').innerHTML = SECTIONS.map(s => `<button type="button" data-sec="${s.id}" class="${s.kind || ''}"><i></i><b>${s.name}</b><kbd>${s.key}</kbd></button>`).join('');
  $('.arr-secs').onclick = e => { const b = e.target.closest('button'); if (b) doAction('sec:' + b.dataset.sec); };
  $('.arr-aibtn').onclick = () => { toggleArranger(false); toggleAI(true); };
  $('.arr-learnbtn').onclick = () => { const l = $('.arr-learn'); l.hidden = !l.hidden; renderLearn(); };
  renderParts();
  bindLevel(); renderKb();
  arranger.on(() => sync());
  store.on('banks', () => open && renderParts());
  store.on('change', ({ kind }) => { if (open && kind === 'structure') renderParts(); });
  store.on('midi-activity', ({ midi, on }) => { if (!open) return; const k = root.querySelector(`.arr-kb [data-m="${midi}"]`); if (k) k.classList.toggle('down', on); });
  // 鍵盤快捷鍵（面板開著才有作用；鍵盤彈奏模式的字母鍵照常彈琴）
  window.addEventListener('keydown', e => {
    if (!open || e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = ACTIONS.find(x => x.key && x.key === e.key);
    if (!a) return;
    if (midiState.typing && /^[a-z;]$/i.test(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) doAction(a.id);
  }, true);
}

function bindLevel() {
  const inp = root.querySelector('.arr-lvl'), val = root.querySelector('.arr-lvlv');
  if (!inp) return;
  const show = () => { inp.value = Math.round((arranger.level || 0.72) * 100); val.textContent = inp.value + '%'; };
  show();
  inp.addEventListener('input', () => { arranger.setLevel(Number(inp.value) / 100); val.textContent = inp.value + '%'; });
  inp.addEventListener('change', () => toast('伴奏音量 ' + inp.value + '%（聲部全開時若破音，往左調）'));
}

function renderParts() {
  const box = root.querySelector('.arr-parts');
  arranger.ensureTracks();
  const banks = listBanks().filter(b => b.status === 'ready');
  box.innerHTML = '';
  for (const p of PARTS) {
    const t = arranger.track(p.id);
    const row = document.createElement('div');
    row.className = 'arr-part' + (arranger.partOn[p.id] ? '' : ' off');
    row.style.setProperty('--pc', p.color);
    const opts = PRESET_GROUPS.map(g => `<optgroup label="${g}">${Object.entries(PRESETS).filter(([, P]) => P.group === g).map(([id]) => `<option value="${id}">${instName(id)}</option>`).join('')}</optgroup>`).join('')
      + banks.map(b => `<optgroup label="SoundFont：${b.name}">${(b.presets || []).filter(x => (p.id === 'drums') === x.drums).slice(0, 200).map(x => `<option value="${sfInstrumentId(b.id, x.idx)}">${x.program + 1}. ${x.name}</option>`).join('')}</optgroup>`).join('');
    row.innerHTML = `<button type="button" class="pw" title="開／關這個聲部">${arranger.partOn[p.id] ? '●' : '○'}</button><b>${p.name}</b>
      <select class="inst">${opts}</select>
      <input type="range" class="vol" min="-40" max="6" step="0.5" title="音量"><span class="db"></span>
      <button type="button" class="tbtn ghost gm" title="改用 SoundFont 的對應 GM 音色" ${banks.length ? '' : 'hidden'}>GM</button>`;
    const sel = row.querySelector('.inst'), vol = row.querySelector('.vol'), db = row.querySelector('.db');
    if (t) { sel.value = t.instrument; vol.value = t.volumeDb; db.textContent = `${t.volumeDb.toFixed(1)} dB`; }
    sel.addEventListener('keydown', e => e.stopPropagation());
    sel.onchange = () => { if (!t) return; store.checkpoint(); t.instrument = sel.value; store.changed('structure'); arranger.preview(p.id, p.id === 'drums' ? 38 : 60); };
    vol.addEventListener('input', () => { if (!t) return; t.volumeDb = +vol.value; db.textContent = `${t.volumeDb.toFixed(1)} dB`; engine.applyMix(); store.dirty = true; });
    vol.addEventListener('change', () => store.changed('mix'));
    row.querySelector('.pw').onclick = () => doAction('part:' + p.id);
    row.querySelector('.gm').onclick = () => {
      if (!t) return;
      const want = GM[p.id];
      for (const b of banks) {
        const x = b.presets.find(q => (want.bank ? q.bank === 128 : q.bank === 0) && q.program === want.prog) || (want.bank ? b.presets.find(q => q.drums) : null);
        if (x) { store.checkpoint(); t.instrument = sfInstrumentId(b.id, x.idx); store.changed('structure'); toast(`${p.name} → ${x.name}`); return; }
      }
      toast('音色庫裡找不到對應的 GM 音色', 'warn');
    };
    box.appendChild(row);
  }
}

function renderKb() {
  const kb = root.querySelector('.arr-kb');
  const lo = 36, hi = 96;   // 61 鍵 C2–C7
  kb.innerHTML = '';
  let wi = 0;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const ww = 100 / whites.length;
  for (let m = lo; m <= hi; m++) {
    const k = document.createElement('div');
    const black = BLACK.has(m % 12);
    k.className = 'k ' + (black ? 'b' : 'w') + (arranger.mode !== 'full' && m <= arranger.split ? ' left' : '');
    k.dataset.m = m;
    if (black) k.style.left = `calc(${wi * ww}% - ${ww * 0.32}%)`, k.style.width = ww * 0.64 + '%';
    else { k.style.left = wi * ww + '%'; k.style.width = ww + '%'; wi++; }
    if (m % 12 === 0 && !black) k.innerHTML = `<span>${nn(m)}</span>`;
    kb.appendChild(k);
  }
  // 滑鼠：按下發聲、拖曳滑過去換音
  let down = null;
  const press = m => { if (down === m) return; release(); down = m; kbHeld.add(m); kbOn(m, 100); };
  const release = () => { if (down != null) { kbOff(down, true); kbHeld.delete(down); down = null; } };
  kb.onpointerdown = e => { const k = e.target.closest('.k'); if (!k) return; e.preventDefault(); kb.setPointerCapture?.(e.pointerId); press(+k.dataset.m); };
  kb.onpointermove = e => { if (down == null) return; const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.arr-kb .k'); if (el) press(+el.dataset.m); };
  kb.onpointerup = kb.onpointercancel = () => release();
}

function renderLearn() {
  const box = root.querySelector('.arr-learn');
  if (box.hidden) return;
  const fmt = v => (v ? `${v.t === 'cc' ? 'CC ' + v.n : nn(v.n)} · ch${v.ch + 1}` : '—');
  box.innerHTML = `<div class="arr-lh"><b>MIDI 鍵位設定</b><span>按「學習」後，在 MIDI 鍵盤上按一個鍵（或推一個推桿／踏板），就把它對應到這個功能。對應到的鍵不會發出聲音。</span>
    <button type="button" class="tbtn ghost clr">全部清除</button>
    <button type="button" class="tbtn ghost pre" title="用 C1～A1（最低的幾個鍵）當段落、啟動與過門，適合 88 鍵">快速設定：最低音區當按鈕</button></div>
    <div class="arr-lgrid">${ACTIONS.map(a => `<div class="arr-lrow${learning === a.id ? ' on' : ''}"><span>${a.name}</span><code>${fmt(learn[a.id])}</code>${a.key ? `<kbd>${a.key}</kbd>` : '<kbd></kbd>'}<button type="button" class="tbtn ghost" data-l="${a.id}">${learning === a.id ? '等待輸入…' : '學習'}</button><button type="button" class="tbtn ghost" data-x="${a.id}" ${learn[a.id] ? '' : 'disabled'}>✕</button></div>`).join('')}</div>`;
  box.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { learning = learning === b.dataset.l ? null : b.dataset.l; renderLearn(); });
  box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { delete learn[b.dataset.x]; saveLearn(); renderLearn(); });
  box.querySelector('.clr').onclick = () => { learn = {}; saveLearn(); renderLearn(); };
  box.querySelector('.pre').onclick = () => {
    const ids = ['sec:intro', 'sec:verse1', 'sec:verse2', 'sec:pre', 'sec:chorus1', 'sec:chorus2', 'sec:bridge', 'sec:ending', 'fill', 'start'];
    learn = {}; ids.forEach((id, i) => { learn[id] = { t: 'note', ch: 0, n: 24 + i }; });
    saveLearn(); renderLearn(); toast('C1 起依序是：前奏、主歌 A、主歌 B、導歌、副歌 1、副歌 2、間奏、尾奏、過門、啟動');
  };
}

function sync() {
  if (!root) return;
  const A = arranger, $ = s => root.querySelector(s);
  const S = A.style;
  $('.sty').textContent = S.name;
  $('.chord').textContent = chordLabel(A.barChord || A.chord);
  const sec = SECTIONS.find(s => s.id === A.section);
  const pend = A.pending && SECTIONS.find(s => s.id === A.pending);
  $('.sec').textContent = (sec ? sec.name : '') + (pend ? ` → ${pend.name}` : '') + (A.running && A.isFill ? '  ·  FILL' : '');
  $('.tempo').textContent = `♩ = ${A.tempo}`;
  $('.st').textContent = A.rec ? '● 錄音中' : A.running ? '演奏中' : A.syncStart ? '同步待命：按下和弦就開始' : '停止';
  if (document.activeElement !== $('.arr-bpm')) $('.arr-bpm').value = A.tempo;
  root.querySelector('.start').classList.toggle('on', A.running);
  root.querySelector('.start').textContent = A.running ? '■ STOP' : '▶ START';
  root.querySelector('.sync').classList.toggle('on', A.syncStart);
  root.querySelector('.rec').classList.toggle('on', !!A.rec);
  root.querySelectorAll('.arr-styles button').forEach(b => b.classList.toggle('on', b.dataset.s === A.styleId));
  root.querySelectorAll('.arr-secs button').forEach(b => {
    b.classList.toggle('on', b.dataset.sec === A.section && (A.running || !A.pending));
    b.classList.toggle('next', b.dataset.sec === A.pending);
    b.classList.toggle('na', !S.sections[b.dataset.sec]);
  });
  root.querySelectorAll('.arr-part').forEach((r, i) => { const on = A.partOn[PARTS[i].id]; r.classList.toggle('off', !on); r.querySelector('.pw').textContent = on ? '●' : '○'; });
  root.querySelectorAll('.arr-kb .k.chord').forEach(k => k.classList.remove('chord'));
  for (const m of A.left) root.querySelector(`.arr-kb [data-m="${m}"]`)?.classList.add('chord');
}

function frame() {
  if (!open) return;
  const A = arranger, $ = s => root.querySelector(s);
  if (A.running && engine.ctx) {
    const barLen = A.barLen(), el = engine.ctx.currentTime - A.barStart;
    const beat = Math.floor(((el % barLen) + barLen) % barLen / (barLen / A.sig));
    $('.bar').textContent = `小節 ${A.bar + 1}`;
    root.querySelectorAll('.beat i').forEach((i, k) => { i.style.display = k < A.sig ? '' : 'none'; i.classList.toggle('on', k === beat); });
  } else { $('.bar').textContent = ''; root.querySelectorAll('.beat i').forEach(i => i.classList.remove('on')); }
  raf = requestAnimationFrame(frame);
}

export function toggleArranger(force) {
  if (!root) build();
  open = force ?? !open;
  root.classList.toggle('hidden', !open);
  if (open) { arranger.ensureTracks(); renderParts(); sync(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); engine.ensure(); }
  else { cancelAnimationFrame(raf); learning = null; }
}
export const arrangerOpen = () => open;
