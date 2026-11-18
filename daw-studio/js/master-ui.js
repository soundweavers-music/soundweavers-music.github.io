// 母帶面板：處理鏈控制、即時響度表、一鍵最佳化
import { store } from './state.js';
import { engine } from './engine.js';
import { TARGETS, LiveLoudness, analyze } from './loudness.js';
import { autoMaster, defaultMastering } from './mastering.js';
import { toast } from './util.js';

const $ = id => document.getElementById(id);
const fmtL = v => (isFinite(v) ? v.toFixed(1) : '—');
let live = null, open = false, raf = 0, lastAnalysis = null;

const CTRL = [
  ['eq', 'hpf', '低切', 10, 120, 1, 'Hz'],
  ['eq', 'low', '低頻', -6, 6, 0.1, 'dB'],
  ['eq', 'mid', '中頻', -6, 6, 0.1, 'dB'],
  ['eq', 'high', '高頻', -6, 6, 0.1, 'dB'],
  ['glue', 'threshold', '門檻', -40, 0, 0.5, 'dB'],
  ['glue', 'ratio', '比例', 1, 8, 0.1, ':1'],
  ['glue', 'makeup', '補償', 0, 12, 0.1, 'dB'],
  [null, 'width', '立體寬度', 0, 2, 0.01, '%'],
  ['limiter', 'gain', '推大', -6, 18, 0.1, 'dB'],
  ['limiter', 'ceiling', '上限', -6, 0, 0.1, 'dBTP'],
  ['limiter', 'release', '釋放', 20, 800, 1, 'ms'],
];

function M() { if (!store.project.mastering) store.project.mastering = defaultMastering(); return store.project.mastering; }
const get = (sec, k) => (sec ? M()[sec][k] : M()[k]);
const set = (sec, k, v) => { if (sec) M()[sec][k] = v; else M()[k] = v; };
const fmtV = (v, u) => (u === '%' ? `${Math.round(v * 100)}%` : u === ':1' ? `${v.toFixed(1)}:1` : `${v > 0 && u === 'dB' ? '+' : ''}${(Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1))} ${u}`);

export function initMasterUi() {
  const root = $('masterPanel');
  root.innerHTML = `
    <div class="mp-head">
      <strong>母帶處理</strong>
      <label class="mp-switch"><input type="checkbox" id="mpOn"> 啟用</label>
      <div class="spacer"></div>
      <select id="mpTarget">${TARGETS.map(t => `<option value="${t.id}">${t.name}　${t.lufs} LUFS</option>`).join('')}</select>
      <button class="tbtn primary" id="mpAuto" title="分析整首，自動設定 EQ、壓縮與 Limiter">✨ 一鍵最佳化</button>
      <button class="tbtn ghost" id="mpAnalyze" title="離線分析目前的成品響度">分析</button>
      <button class="tbtn ghost" id="mpReset" title="還原母帶設定">重設</button>
      <button class="tbtn ghost" id="mpClose">✕</button>
    </div>
    <div class="mp-body">
      <div class="mp-meters">
        <div class="mp-lufs"><span class="lbl">短期</span><b id="mpS">—</b><span class="u">LUFS</span></div>
        <div class="mp-lufs"><span class="lbl">整合</span><b id="mpI">—</b><span class="u">LUFS</span></div>
        <div class="mp-lufs small"><span class="lbl">瞬間</span><b id="mpM">—</b></div>
        <div class="mp-lufs small"><span class="lbl">Limiter</span><b id="mpGR">0.0</b><span class="u">dB</span></div>
        <div class="mp-bar"><div class="mp-target" id="mpTgtMark"></div><div class="mp-fill" id="mpFill"></div></div>
        <button class="tbtn ghost" id="mpResetMeter" style="height:20px;font-size:10px">重設整合值</button>
        <div class="mp-report" id="mpReport">播放時顯示即時響度；按「分析」可以得到整首的精確數值。</div>
      </div>
      <div class="mp-chain" id="mpChain"></div>
    </div>`;
  $('mpOn').onchange = e => { store.checkpoint(); M().on = e.target.checked; store.changed('fx'); renderChain(); };
  $('mpTarget').onchange = e => { M().target = e.target.value; store.dirty = true; drawTargetMark(); };
  $('mpAuto').onclick = runAuto;
  $('mpAnalyze').onclick = runAnalyze;
  $('mpReset').onclick = () => { if (!confirm('把母帶設定還原成預設值？')) return; store.checkpoint(); store.project.mastering = defaultMastering(); store.changed('fx'); render(); };
  $('mpClose').onclick = () => toggleMaster(false);
  $('mpResetMeter').onclick = () => live && live.reset();
  store.on('change', ({ kind }) => { if (open && kind !== 'mix') render(); });
  store.on('transport', ({ playing }) => { if (playing && live && engine.currentTime() < 0.05) live.reset(); });
}

export function toggleMaster(force) {
  open = force ?? !open;
  $('masterPanel').classList.toggle('hidden', !open);
  $('btnMaster')?.classList.toggle('on', open);
  if (open) { render(); loop(); } else cancelAnimationFrame(raf);
  store.emit('panel', { name: open ? 'master' : null });
}
export const masterOpen = () => open;

function render() {
  $('mpOn').checked = M().on;
  $('mpTarget').value = M().target || 'stream';
  renderChain(); drawTargetMark();
}

function renderChain() {
  const box = $('mpChain');
  const m = M();
  const groups = [['eq', '色調 EQ'], ['glue', '黏合壓縮'], [null, '立體聲'], ['limiter', 'Limiter']];
  box.innerHTML = '';
  for (const [sec, title] of groups) {
    const g = document.createElement('div');
    g.className = 'mp-group' + (m.on ? '' : ' off');
    const canToggle = sec === 'glue' || sec === 'limiter';
    g.innerHTML = `<div class="mp-gh">${canToggle ? `<input type="checkbox" ${m[sec].on ? 'checked' : ''}>` : ''}<span>${title}</span></div>`;
    if (canToggle) g.querySelector('input').onchange = e => { store.checkpoint(); m[sec].on = e.target.checked; store.changed('fx'); };
    for (const [s, k, label, min, max, step, unit] of CTRL.filter(c => c[0] === sec)) {
      const row = document.createElement('label');
      row.className = 'fx-row';
      row.innerHTML = `<span class="fx-lbl">${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="fx-val"></span>`;
      const inp = row.querySelector('input'), val = row.querySelector('.fx-val');
      inp.value = get(s, k); val.textContent = fmtV(get(s, k), unit);
      inp.addEventListener('pointerdown', () => store.checkpoint());
      inp.addEventListener('keydown', e => e.stopPropagation());
      inp.addEventListener('input', () => { set(s, k, Number(inp.value)); val.textContent = fmtV(Number(inp.value), unit); store.dirty = true; engine.mastering?.set(M()); });
      inp.addEventListener('change', () => store.changed('fx'));
      g.appendChild(row);
    }
    box.appendChild(g);
  }
}

function drawTargetMark() {
  const T = TARGETS.find(t => t.id === (M().target || 'stream'));
  $('mpTgtMark').style.left = lufsPos(T.lufs) * 100 + '%';
  $('mpTgtMark').title = `目標 ${T.lufs} LUFS`;
}
const lufsPos = v => Math.max(0, Math.min(1, (v + 36) / 36));   // -36 ~ 0 LUFS

function loop() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!open) return;
    if (engine.ctx && engine.masterMeter) {
      if (!live) live = new LiveLoudness(engine.ctx, engine.masterMeter.aL, engine.masterMeter.aR);
      const r = live.tick(engine.playing);
      $('mpS').textContent = fmtL(r.s); $('mpI').textContent = fmtL(r.i); $('mpM').textContent = fmtL(r.m);
      $('mpFill').style.width = (isFinite(r.s) ? lufsPos(r.s) : 0) * 100 + '%';
      const T = TARGETS.find(t => t.id === (M().target || 'stream'));
      $('mpFill').className = 'mp-fill' + (isFinite(r.s) && r.s > T.lufs + 1 ? ' hot' : '');
      if (engine.mastering && engine.playing) $('mpGR').textContent = engine.mastering.gr().toFixed(1);
    }
    raf = requestAnimationFrame(step);
  };
  step();
}

function report(a, T, extra = '') {
  const diff = a.integrated - T.lufs;
  const ok = Math.abs(diff) < 1 && a.truePeakDb <= T.tp + 0.2;
  $('mpReport').innerHTML = `
    <div class="mp-res ${ok ? 'good' : 'warn'}">
      <div><span>整合響度</span><b>${fmtL(a.integrated)} LUFS</b><em>${isFinite(diff) ? (diff > 0 ? '+' : '') + diff.toFixed(1) + ' LU' : ''}</em></div>
      <div><span>True Peak</span><b>${a.truePeakDb.toFixed(1)} dBTP</b><em>上限 ${T.tp}</em></div>
      <div><span>響度範圍 LRA</span><b>${a.lra.toFixed(1)} LU</b></div>
      <div><span>最大短期</span><b>${fmtL(a.maxShortTerm)} LUFS</b></div>
    </div>${extra}`;
}

async function runAnalyze() {
  if (store.projectEnd() <= 0) return toast('專案裡沒有任何片段', 'warn');
  busy('分析中…');
  try {
    const b = await engine.render({ tail: 0 });
    const a = analyze(b);
    lastAnalysis = a;
    report(a, TARGETS.find(t => t.id === (M().target || 'stream')), M().on ? '' : '<p class="note">母帶處理目前關閉，這是原始混音的數值。</p>');
  } catch (e) { toast('分析失敗：' + e.message, 'error'); }
  finally { busy(null); }
}

async function runAuto() {
  if (store.projectEnd() <= 0) return toast('專案裡沒有任何片段', 'warn');
  const tgt = $('mpTarget').value;
  busy('分析混音…');
  try {
    const res = await autoMaster(m => engine.render({ tail: 0, mastering: m }), M(), tgt, t => busy(t));
    store.checkpoint();
    store.project.mastering = res.mastering;
    store.changed('fx');
    render();
    const w = res.warnings.length ? `<ul class="mp-warn">${res.warnings.map(x => `<li>${x}</li>`).join('')}</ul>` : '';
    report(res.after, res.target, `<p class="note">原始混音 ${fmtL(res.before.integrated)} LUFS / ${res.before.truePeakDb.toFixed(1)} dBTP → 已套用。可以用 Ctrl+Z 復原。</p>${w}`);
    toast(`母帶完成：${fmtL(res.after.integrated)} LUFS`);
  } catch (e) { toast('最佳化失敗：' + e.message, 'error'); console.error(e); }
  finally { busy(null); }
}

function busy(t) { store.emit('busy', t ? { text: t } : null); }
