// 智慧混音視窗：① 問偏好 → ② 分析每一軌 → ③ 看方案、套用、A/B
// 樣式沿用智慧編曲的 .aiw 系列，不再另外長一套 CSS。
import { store } from './state.js';
import { toast } from './util.js';
import { analyzeProject, makePlan, applyPlan, setSmartMixEnabled, DEFAULT_PREFS } from './smartmix.js';

const KEY = 'zhiyin-daw-smartmix';
const GENRE = [
  ['ballad', '抒情'], ['pop', '流行'], ['rock', '搖滾'], ['hiphop', '嘻哈'],
  ['folk', '民謠'], ['electronic', '電子'], ['other', '不指定'],
];
let P = { ...DEFAULT_PREFS };
try { P = { ...P, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { /* noop */ }
const save = () => localStorage.setItem(KEY, JSON.stringify(P));

let root = null, open = false, tab = 'ask', items = null, plan = null, applied = false;
const $ = s => root.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function slider(name, label, hint) {
  return `<label class="f smx-slide"><span>${label}</span>
    <input type="range" min="0" max="100" step="1" data-p="${name}" value="${Math.round(P[name] * 100)}">
    <em data-v="${name}">${Math.round(P[name] * 100)}</em><small>${hint}</small></label>`;
}

function build() {
  root = document.createElement('div');
  root.className = 'aiw hidden';
  root.innerHTML = `
  <div class="aiw-win smx-win" role="dialog" aria-label="智慧混音">
    <div class="aiw-head"><b>智慧混音</b><span class="aiw-sub">先問你幾個偏好，再分析每一軌的頻譜、噪聲與呼吸聲，算出整組設定——全部在這台電腦上算</span>
      <div class="spacer"></div><button type="button" class="tbtn ghost aiw-x" title="關閉">✕</button></div>
    <div class="aiw-tabs">
      <button type="button" data-tab="ask">① 你的偏好</button>
      <button type="button" data-tab="scan">② 分析</button>
      <button type="button" data-tab="plan">③ 方案與套用</button>
    </div>

    <section class="aiw-pane" data-pane="ask">
      <p class="note">沒有標準答案，選「聽起來像你想要的」就好。這些答案只影響這台電腦上的計算，不會上傳。</p>
      <div class="smx-grid">
        <label class="f">曲風 <select data-p="genre">${GENRE.map(([v, n]) => `<option value="${v}"${P.genre === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f">聆聽裝置 <select data-p="device">
          <option value="headphones"${P.device === 'headphones' ? ' selected' : ''}>耳機</option>
          <option value="speakers"${P.device === 'speakers' ? ' selected' : ''}>喇叭</option>
          <option value="phone"${P.device === 'phone' ? ' selected' : ''}>手機外放</option></select></label>
        <label class="f">目標響度 <select data-p="target">
          <option value="-14"${P.target === -14 ? ' selected' : ''}>串流 −14 LUFS</option>
          <option value="-11"${P.target === -11 ? ' selected' : ''}>YouTube 大聲一點 −11</option>
          <option value="-9"${P.target === -9 ? ' selected' : ''}>很兇 −9</option>
          <option value="-16"${P.target === -16 ? ' selected' : ''}>保留動態 −16</option></select></label>
      </div>
      <div class="smx-sliders">
        ${slider('vocal', '人聲的位置', '左：樂器為主　右：人聲貼在耳邊')}
        ${slider('bright', '亮度', '左：溫暖厚實　右：明亮清脆')}
        ${slider('low', '低頻份量', '左：乾淨　右：厚實')}
        ${slider('dynamics', '動態', '左：平均大聲　右：保留起伏')}
        ${slider('space', '空間感', '左：乾　右：大空間')}
        ${slider('cleanup', '清理雜音與呼吸', '左：保留原貌　右：全部壓掉')}
        ${slider('tune', '人聲修音', '0 = 不動；越高越貼音準')}
      </div>
      <div class="aiw-row aiw-acts">
        <span class="note smx-sum"></span>
        <div class="spacer"></div>
        <button type="button" class="tbtn primary smx-scan">開始分析 →</button>
      </div>
    </section>

    <section class="aiw-pane" data-pane="scan" hidden>
      <p class="note">只分析有音訊的軌道。數字是這一段錄音實際量到的，不是猜的。</p>
      <div class="smx-cards"></div>
      <div class="aiw-row aiw-acts">
        <button type="button" class="tbtn smx-rescan">重新分析</button>
        <div class="spacer"></div>
        <button type="button" class="tbtn primary smx-make">產生方案 →</button>
      </div>
    </section>

    <section class="aiw-pane" data-pane="plan" hidden>
      <p class="note">方案會新增效果器、調整音量與 Send，並把人聲的呼吸聲寫成音量自動化。套用之後可以 Ctrl+Z 復原，也可以按 A/B 比較。</p>
      <div class="smx-plan"></div>
      <div class="aiw-row aiw-acts">
        <button type="button" class="tbtn smx-ab" disabled>A/B 比較</button>
        <button type="button" class="tbtn smx-undo" disabled>復原</button>
        <div class="spacer"></div>
        <button type="button" class="tbtn primary smx-apply">套用這套設定</button>
      </div>
    </section>
  </div>`;

  const win = root.querySelector('.aiw-win');
  root.addEventListener('click', e => { if (e.target === root) toggleSmartMix(false); });
  win.querySelector('.aiw-x').addEventListener('click', () => toggleSmartMix(false));
  root.querySelectorAll('.aiw-tabs button').forEach(b => {
    b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
  });

  // 偏好控制
  root.querySelectorAll('[data-p]').forEach(el => {
    el.addEventListener('input', () => {
      const k = el.dataset.p;
      if (el.tagName === 'SELECT') P[k] = k === 'target' ? Number(el.value) : el.value;
      else { P[k] = Number(el.value) / 100; el.closest('.smx-slide').querySelector('[data-v]').textContent = el.value; }
      save(); summary();
    });
  });
  $('.smx-scan').addEventListener('click', () => runAnalyze());
  $('.smx-rescan').addEventListener('click', () => runAnalyze());
  $('.smx-make').addEventListener('click', () => runPlan());
  $('.smx-apply').addEventListener('click', () => doApply());
  $('.smx-ab').addEventListener('click', e => {
    const on = e.currentTarget.dataset.on !== '1';
    e.currentTarget.dataset.on = on ? '1' : '0';
    setSmartMixEnabled(on);
    e.currentTarget.textContent = on ? 'A/B 比較（目前：有套用）' : 'A/B 比較（目前：原始）';
  });
  $('.smx-undo').addEventListener('click', () => {
    if (store.undo()) { toast('已復原智慧混音的設定'); applied = false; $('.smx-undo').disabled = true; }
  });

  document.body.appendChild(root);
  summary();
}

function summary() {
  if (!root) return;
  const pos = P.vocal < .34 ? '樂器為主' : P.vocal > .66 ? '人聲很前面' : '人聲與伴奏平衡';
  const s = $('.smx-sum');
  if (s) s.textContent = `${pos}・${P.bright > .6 ? '明亮' : P.bright < .4 ? '溫暖' : '中性'}・清理 ${Math.round(P.cleanup * 100)}%`;
}

const DB = v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
const bandName = { sub: '超低', low: '低頻', lowmid: '低中', mid: '中頻', himid: '中高', presence: '咬字', sib: '齒音', air: '空氣' };

function cards() {
  if (!items?.length) { $('.smx-cards').innerHTML = '<p class="note">這份專案裡沒有可分析的音訊軌。</p>'; return; }
  $('.smx-cards').innerHTML = items.map(it => {
    const f = it.feats;
    const top = Object.entries(f.bands).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k, v]) => bandName[k]).join('、');
    return `<div class="smx-card">
      <div class="smx-card-h"><b>${esc(it.name)}</b><span class="smx-kind ${it.kind}">${
        { vocal: '人聲', instrument: '樂器', bass: '低音', drums: '節奏' }[it.kind]}</span></div>
      <div class="smx-nums">
        <span>響度 <b>${Math.round(f.lufs)}</b> LUFS</span>
        <span>峰值 <b>${f.peakDb.toFixed(1)}</b> dB</span>
        <span>動態 <b>${f.crestDb.toFixed(1)}</b> dB</span>
        <span>噪聲 <b>${Math.round(f.noiseDb)}</b> dB</span>
        <span>呼吸 <b>${f.breath.length}</b> 次</span>
      </div>
      <div class="smx-sub">能量集中在 ${top}；${f.stereo < .3 ? '接近單聲道' : f.stereo > .8 ? '左右幾乎相同' : '立體感正常'}</div>
    </div>`;
  }).join('');
}

function planView() {
  if (!plan) return;
  const rows = plan.tracks.map(t => `
    <div class="smx-line"><b>${esc(t.name)}</b>
      <span class="smx-tag">${t.kind === 'vocal' ? '人聲' : t.kind === 'bass' ? '低音' : t.kind === 'drums' ? '節奏' : '樂器'}</span>
      <span>音量 ${DB(t.gainDb)}</span>
      <span>殘響 Send ${t.sends[0] <= -59 ? '關' : DB(t.sends[0])}</span>
      <span class="smx-chain">${t.chain.map(([type]) => type).join(' → ')}</span>
    </div>`).join('');
  $('.smx-plan').innerHTML = `<div class="smx-lines">${rows}</div>
    <ul class="smx-notes">${plan.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    ${plan.breathCount ? `<p class="note">偵測到 ${plan.breathCount} 段呼吸聲，套用時會寫成音量自動化（可逐點修改）。</p>` : ''}`;
}

async function runAnalyze() {
  if (!root) return;
  const btn = $('.smx-scan');
  btn.disabled = true; btn.textContent = '分析中…';
  tab = 'scan'; render();
  await new Promise(r => setTimeout(r, 30));       // 讓畫面先換過去
  try {
    items = analyzeProject();
    cards();
  } catch (err) {
    console.error(err);
    $('.smx-cards').innerHTML = `<p class="note">分析失敗：${esc(err.message || err)}</p>`;
  }
  btn.disabled = false; btn.textContent = '開始分析 →';
  tab = 'scan'; render();
}

function runPlan() {
  if (!items?.length) { toast('先分析一次'); return; }
  plan = makePlan(P, items);
  planView();
  tab = 'plan'; render();
}

function doApply() {
  if (!plan) return;
  applyPlan(plan, { breath: P.cleanup > 0.3 });
  applied = true;
  toast('智慧混音已套用：效果器、音量、Send 與呼吸聲自動化都寫進專案了');
  $('.smx-undo').disabled = false;
  const ab = $('.smx-ab');
  ab.disabled = false; ab.dataset.on = '1'; ab.textContent = 'A/B 比較（目前：有套用）';
}

function render() {
  if (!root) return;
  root.querySelectorAll('.aiw-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  root.querySelectorAll('.aiw-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
  if (tab === 'scan') cards();
  if (tab === 'plan') planView();
  summary();
}

export function toggleSmartMix(force) {
  if (!root) build();
  open = force ?? !open;
  root.classList.toggle('hidden', !open);
  if (open) render();
}

export const smartMixOpen = () => open;
export const _smartmixUI = { get items() { return items; }, get plan() { return plan; }, runAnalyze, runPlan, doApply, prefs: P };

document.getElementById('btnSmartMix')?.addEventListener('click', () => toggleSmartMix());
// 直接連 #smartmix 就把視窗打開（方便分享與自動測試）
if (location.hash.includes('smartmix')) setTimeout(() => toggleSmartMix(true), 0);
