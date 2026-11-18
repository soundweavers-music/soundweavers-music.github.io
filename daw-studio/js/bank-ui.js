// 音色庫對話框 + 檢閱器的 SoundFont 選單
import { store } from './state.js';
import { engine } from './engine.js';
import { addBankFile, removeBank, listBanks, getBank, restoreBanks, storageEstimate, RECOMMENDED, sfInstrumentId, parseInstrument, sfLabel } from './soundbank.js';
import { toast } from './util.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const mb = n => (n / 1048576).toFixed(n > 104857600 ? 0 : 1) + ' MB';

async function loadFiles(files) {
  for (const f of files) {
    toast(`讀取 ${f.name}…`);
    try {
      const e = await addBankFile(f);
      toast(`已載入「${e.name}」：${e.presets.length} 個音色`);
    } catch (err) { toast(`${f.name}：${err.message}`, 'error'); }
  }
}

function renderList() {
  const box = $('bankList');
  if (!box) return;
  const list = listBanks();
  box.innerHTML = list.length ? '' : '<p class="note">還沒有載入任何音色庫。沒有音色庫也可以用內建的 12 種合成音色。</p>';
  for (const b of list) {
    const row = document.createElement('div');
    row.className = 'bank-row';
    const st = b.status === 'ready' ? `<span class="ok">● 可使用</span>・${b.presetCount} 個音色`
      : b.status === 'loading' ? '<span class="wait">● 讀取中…</span>'
      : `<span class="err">● 錯誤</span>・${esc(b.error || '')}`;
    row.innerHTML = `<div><strong>${esc(b.name)}</strong><div class="note">${st}${b.size ? '・' + mb(b.size) : ''}</div></div>
      <button type="button" class="tbtn ghost" title="從這個瀏覽器移除">移除</button>`;
    row.querySelector('button').onclick = async () => {
      const used = store.project.tracks.filter(t => parseInstrument(t.instrument)?.bankId === b.id).length;
      if (used && !confirm(`有 ${used} 條軌道正在使用「${b.name}」，移除後會改用內建音色代替。確定移除？`)) return;
      await removeBank(b.id);
    };
    box.appendChild(row);
  }
  storageEstimate().then(e => {
    if (e && $('bankStorage')) $('bankStorage').textContent = `這個網站目前用了 ${mb(e.used)}，瀏覽器允許約 ${mb(e.quota)}。`;
  });
  const ready = list.filter(b => b.status === 'ready').length;
  const badge = $('bankBadge');
  if (badge) { badge.textContent = ready ? String(ready) : ''; badge.style.display = ready ? '' : 'none'; }
}

export function openBanks() {
  renderList();
  $('dlgBanks').showModal();
}

export function initBankUi() {
  $('bankRec').innerHTML = RECOMMENDED.map(r => `<div class="bank-row rec"><div><strong>${esc(r.name)}</strong> <span class="note">${esc(r.size)}</span>
    <div class="note">${esc(r.note)}</div><div class="note">下載：${esc(r.site)}</div></div></div>`).join('');
  $('btnBanks').onclick = openBanks;
  $('bankPick').onclick = () => $('fileSf2').click();
  $('fileSf2').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; loadFiles(f); });
  const drop = $('bankDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); loadFiles([...e.dataTransfer.files]); });
  store.on('banks', renderList);
  // 音色庫讀好之後，讓檢閱器、軌道標頭顯示正確名稱
  store.on('banks-ready', () => store.changed('fx'));
  store.on('banks', () => { const ins = $('inspector'); if (ins && !ins.contains(document.activeElement)) store.emit('select', {}); });
  restoreBanks().then(renderList);
  // 整個視窗拖進 .sf2 也接受
  window.addEventListener('drop', e => {
    const f = [...(e.dataTransfer?.files || [])].filter(x => /\.sf2$/i.test(x.name));
    if (f.length && !e.defaultPrevented) { e.preventDefault(); loadFiles(f); }
  });
  window.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) e.preventDefault(); });
}

// 檢閱器：SoundFont 選單（接在內建音色下面）
export function sfSection(t) {
  const banks = listBanks().filter(b => b.status === 'ready');
  const sec = document.createElement('div');
  sec.className = 'sec';
  const cur = parseInstrument(t.instrument);
  const lbl = sfLabel(t.instrument);
  sec.innerHTML = `<h4 style="margin-top:0">SoundFont 音色</h4>`;
  if (!banks.length) {
    sec.insertAdjacentHTML('beforeend', `<p class="midi-status">${lbl && !lbl.ready
      ? `這條軌道使用「<b>${esc(lbl.bank)}</b>」的音色，但這台電腦還沒有載入它（目前用內建音色代替）。`
      : '還沒有載入音色庫。'}</p><button type="button" class="tbtn" style="width:100%;height:24px">管理音色庫…</button>`);
    sec.querySelector('button').onclick = openBanks;
    return sec;
  }
  const bankSel = document.createElement('select');
  bankSel.className = 'inst-sel';
  bankSel.innerHTML = '<option value="">（不使用，改用上面的內建音色）</option>' + banks.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  bankSel.value = cur && getBank(cur.bankId) ? cur.bankId : '';
  const preSel = document.createElement('select');
  preSel.className = 'inst-sel';
  const filter = document.createElement('input');
  filter.type = 'text'; filter.placeholder = '搜尋音色名稱…';
  const fill = () => {
    const b = getBank(bankSel.value);
    preSel.disabled = !b; filter.disabled = !b;
    if (!b) { preSel.innerHTML = ''; return; }
    const q = filter.value.trim().toLowerCase();
    const items = b.presets.filter(p => !q || p.name.toLowerCase().includes(q));
    // 依 bank 分組：一般樂器、鼓組（bank 128）、其他變化音色
    const groups = [['樂器', items.filter(p => p.bank === 0)], ['鼓組', items.filter(p => p.drums)], ['其他', items.filter(p => p.bank !== 0 && !p.drums)]];
    preSel.innerHTML = groups.filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${g}">${
      l.map(p => `<option value="${p.idx}">${String(p.program + 1).padStart(3, '0')} ${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
    if (cur && cur.bankId === b.id) preSel.value = String(cur.presetIdx);
  };
  fill();
  const apply = () => {
    const b = getBank(bankSel.value);
    if (!b || preSel.value === '') return;
    store.checkpoint();
    t.instrument = sfInstrumentId(b.id, Number(preSel.value));
    const p = b.presets[Number(preSel.value)];
    if (/^MIDI \d+$/.test(t.name) || t._autoName) { t.name = p.name.slice(0, 24); t._autoName = true; }
    store.changed('structure');
    engine.audition(t.id, p.drums ? 38 : 60, 100, 0.6);
  };
  bankSel.addEventListener('change', () => {
    fill();
    if (!bankSel.value) {
      // 改回內建音色
      if (parseInstrument(t.instrument)) { store.checkpoint(); t.instrument = 'piano'; store.changed('structure'); }
    } else apply();
  });
  preSel.addEventListener('change', apply);
  for (const el of [bankSel, preSel, filter]) el.addEventListener('keydown', e => e.stopPropagation());
  filter.addEventListener('input', fill);
  for (const el of [bankSel, filter, preSel]) { const r = document.createElement('div'); r.className = 'row'; r.appendChild(el); sec.appendChild(r); }
  if (lbl && !lbl.ready) sec.insertAdjacentHTML('beforeend', `<p class="midi-status">「${esc(lbl.bank)}」還沒有載入，目前用內建音色代替。</p>`);
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'tbtn ghost'; more.textContent = '管理音色庫…'; more.style.cssText = 'width:100%;height:22px;margin-top:4px';
  more.onclick = openBanks;
  sec.appendChild(more);
  return sec;
}
