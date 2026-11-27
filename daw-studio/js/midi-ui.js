// MIDI 相關的介面接線：.mid 匯入／匯出、檢閱器音色選單、Web MIDI 狀態燈、電腦鍵盤彈奏開關
import { store, newTrack, newMidiClip, isMidiClip, MAX_TRACKS } from './state.js';
import { engine } from './engine.js';
import { PRESETS, PRESET_GROUPS, instName } from './synth.js';
import { openSynthPicker, macrosSection } from './zy-ui.js';
import { parseMidi, writeMidi, presetForProgram, PROGRAM_FOR_PRESET } from './midifile.js';
import { initWebMidi, midiState, setTyping, targetTrack, setTranspose } from './midi-input.js';
import { downloadBlob, toast } from './util.js';

const $ = id => document.getElementById(id);

// ---------------- 匯入 .mid ----------------
export async function importMidiFile(file, opts = {}) {
  let data;
  try { data = parseMidi(await file.arrayBuffer()); }
  catch (e) { toast('讀不了這個 MIDI 檔：' + e.message, 'error'); return; }
  if (!data.tracks.length) { toast('這個 MIDI 檔裡沒有音符', 'warn'); return; }
  const p = store.project;
  store.checkpoint();
  const empty = !p.tracks.some(t => t.clips.length);
  // 專案還是空的：採用 MIDI 檔的速度與拍號
  if (empty) {
    p.bpm = Math.round(Math.min(300, Math.max(30, data.bpm)));
    if ([2, 3, 4, 5, 6, 7].includes(data.sig.num) && data.sig.den === 4) p.sigNum = data.sig.num;
  }
  const startBeat = opts.atBeat ?? 0;
  const base = file.name.replace(/\.(mid|midi)$/i, '');
  let added = 0, skipped = 0;
  for (const [i, tr] of data.tracks.entries()) {
    // 先用空的 MIDI 軌，不夠再新增
    let t = p.tracks.find(x => x.kind === 'midi' && !x.clips.length && !x._usedByImport);
    if (!t) {
      if (p.tracks.length >= MAX_TRACKS) { skipped++; continue; }
      t = newTrack(p.tracks.length, 'midi');
      p.tracks.push(t);
    }
    t._usedByImport = true;
    t.instrument = presetForProgram(tr.program, tr.drums);
    t.name = (tr.name || (tr.drums ? '鼓組' : `${base} ${i + 1}`)).slice(0, 24);
    const last = Math.max(...tr.notes.map(n => n.t + n.d));
    const len = Math.max(p.sigNum, Math.ceil(last / p.sigNum) * p.sigNum);
    const c = newMidiClip(startBeat, len, tr.notes.map(n => ({ ...n })));
    if (tr.pedal && tr.pedal.length) c.pedal = tr.pedal.map(e => ({ ...e }));
    c.name = base;
    t.clips.push(c);
    added++;
  }
  for (const t of p.tracks) delete t._usedByImport;
  store.changed('structure');
  let msg = `已匯入 ${added} 軌 MIDI`;
  if (empty) msg += `，速度設為 ${p.bpm} BPM`;
  if (data.tempoChanges > 1) msg += '（檔案內有變速，只採用第一個速度）';
  if (skipped) msg += `，${skipped} 軌超過 ${MAX_TRACKS} 軌上限沒有匯入`;
  toast(msg, skipped || data.tempoChanges > 1 ? 'warn' : 'info');
}

// ---------------- 匯出 .mid ----------------
// clipIds 有給：只匯出那些片段；否則匯出所有 MIDI 軌（依 mute/solo）
export function exportMidi(clipIds = null) {
  const p = store.project;
  const solo = p.tracks.some(t => t.solo);
  const only = clipIds ? new Set(clipIds) : null;
  const tracks = [];
  let ch = 0;
  for (const t of p.tracks) {
    if (t.kind !== 'midi') continue;
    if (!only && (t.mute || (solo && !t.solo))) continue;
    const notes = [], pedal = [];
    for (const c of t.clips) {
      if (!isMidiClip(c) || (only && !only.has(c.id))) continue;
      for (const n of c.notes) {
        if (n.t >= c.lengthBeats || n.m) continue;   // 靜音的音符不匯出
        notes.push({ p: n.p, t: c.startBeat + n.t, d: Math.min(n.d, c.lengthBeats - n.t), v: n.v });
      }
      // 踏板：片段範圍內的事件；片段結尾還踩著就補一個放開
      let down = false;
      for (const e of (c.pedal || []).slice().sort((a, z) => a.t - z.t)) {
        if (e.t > c.lengthBeats) break;
        pedal.push({ t: c.startBeat + e.t, on: e.on }); down = e.on;
      }
      if (down) pedal.push({ t: c.startBeat + c.lengthBeats, on: false });
    }
    if (!notes.length) continue;
    const drums = PRESETS[t.instrument]?.drum;
    let channel = drums ? 9 : ch++;
    if (channel === 9 && !drums) channel = ch++;
    if (channel > 15) channel = 15;
    tracks.push({ name: t.name, channel, program: PRESETS[t.instrument]?.gm ?? PROGRAM_FOR_PRESET[t.instrument] ?? 0, notes, pedal });
  }
  if (!tracks.length) { toast('沒有可匯出的 MIDI 音符', 'warn'); return false; }
  const blob = writeMidi({ bpm: p.bpm, sigNum: p.sigNum, sigDen: p.sigDen, tracks });
  downloadBlob(blob, `${(p.name || '專案').replace(/[\\/:*?"<>|]/g, '_')}.mid`);
  toast(`已匯出 ${tracks.length} 軌 MIDI`);
  return true;
}

// ---------------- 檢閱器：音色選單 ----------------
export function instrumentSection(t) {
  const sec = document.createElement('div');
  sec.className = 'sec';
  const opts = PRESET_GROUPS.map(g => `<optgroup label="${g}">${
    Object.entries(PRESETS).filter(([, P]) => P.group === g)
      .map(([id]) => `<option value="${id}">${instName(id)}</option>`).join('')
  }</optgroup>`).join('');
  sec.innerHTML = `<h4 style="margin-top:0">音色</h4>
    <div class="row"><select class="inst-sel">${opts}</select></div>
    <div class="row"><button class="tbtn primary" data-a="browse" style="width:100%;height:26px">🎹 瀏覽織音合成器音色</button></div>
    <div class="row"><button class="tbtn" data-a="try" style="width:100%;height:24px">試聽</button></div>
    <p class="midi-status">織音合成器的音色都在這台電腦上即時算出來，不用下載。想要取樣樂器，可以在下方載入 SoundFont 音色庫。</p>`;
  const sel = sec.querySelector('select');
  if (!PRESETS[t.instrument]) sel.insertAdjacentHTML('afterbegin', '<option value="" disabled>（正在使用 SoundFont 音色）</option>');
  sel.value = PRESETS[t.instrument] ? t.instrument : '';
  sel.addEventListener('keydown', e => e.stopPropagation());
  sel.addEventListener('change', () => {
    store.checkpoint();
    t.instrument = sel.value;
    // 軌道名稱還是預設名或音色名時，跟著換
    const oldNames = new Set(Object.keys(PRESETS).map(id => instName(id)));
    if (/^MIDI \d+$/.test(t.name) || oldNames.has(t.name)) t.name = instName(sel.value);
    store.changed('structure');
    engine.audition(t.id, PRESETS[sel.value].drum ? 38 : 60, 100, 0.5);
  });
  sec.querySelector('[data-a=browse]').onclick = () => openSynthPicker(t.id);
  sec.querySelector('[data-a=try]').onclick = () => {
    const P = PRESETS[t.instrument] || { drum: /:128:|drum/i.test(t.instrument) };
    const seq = P.drum ? [36, 42, 38, 42, 36, 36, 38, 46] : [60, 64, 67, 72];
    seq.forEach((m, i) => setTimeout(() => engine.audition(t.id, m, 100, P.drum ? 0.1 : 0.3), i * (P.drum ? 160 : 220)));
  };
  return sec;
}

export function midiStatusSection() {
  const sec = document.createElement('div');
  sec.className = 'sec';
  const devs = midiState.inputs.map(i => i.name);
  const tgt = targetTrack();
  sec.innerHTML = `<h4 style="margin-top:0">MIDI 輸入</h4>
    <p class="midi-status">${
      !navigator.requestMIDIAccess ? '這個瀏覽器不支援 Web MIDI（Safari、Firefox 部分版本）。可以改用電腦鍵盤彈奏。'
        : devs.length ? `已連接：<b>${devs.map(n => n.replace(/[<>&]/g, '')).join('、')}</b>` : '沒有偵測到 MIDI 鍵盤（插上後會自動出現）'
    }<br>彈奏目標：<b>${tgt ? tgt.name.replace(/[<>&]/g, '') : '（選一條 MIDI 軌）'}</b><br>輸入移調：<b>${midiState.transpose === 0 ? '不移調' : (midiState.transpose > 0 ? '+' : '') + midiState.transpose + ' 半音'}</b>（上方 − ＋ 或 [ ]）<br>電腦鍵盤彈奏：<b>${midiState.typing ? '開啟' : '關閉'}</b>（Caps Lock）</p>`;
  return sec;
}

// ---------------- 啟動 ----------------
export function initMidiUi() {
  $('btnImportMidi').onclick = () => { pendingImport = null; $('fileMidi').click(); };
  $('fileMidi').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const at = pendingImport; pendingImport = null;
    await importMidiFile(f, at ? { atBeat: at.atBeat } : {});
  });
  store.on('import-midi', ({ at }) => {
    pendingImport = { atBeat: Math.floor(at / (60 / store.project.bpm) / store.project.sigNum + 1e-6) * store.project.sigNum };
    $('fileMidi').click();
  });
  store.on('export-midi', ({ clipIds }) => exportMidi(clipIds));
  store.on('drop-midi', ({ file, at }) => {
    const bar = store.project.sigNum;
    importMidiFile(file, { atBeat: Math.floor(at / (60 / store.project.bpm) / bar + 1e-6) * bar });
  });

  $('btnTyping').onclick = () => setTyping(!midiState.typing);
  // 輸入移調
  const showTr = () => {
    const n = midiState.transpose;
    $('trVal').textContent = n === 0 ? '0' : (n > 0 ? '+' : '') + n;
    $('trVal').title = n === 0 ? '不移調' : `${n > 0 ? '升' : '降'} ${Math.abs(n)} 個半音${Math.abs(n) % 12 === 0 ? `（${Math.abs(n) / 12} 個八度）` : ''}`;
    $('midiTr').classList.toggle('on', n !== 0);
  };
  $('trUp').onclick = e => setTranspose(midiState.transpose + (e.shiftKey ? 12 : 1));
  $('trDown').onclick = e => setTranspose(midiState.transpose - (e.shiftKey ? 12 : 1));
  $('trVal').ondblclick = () => setTranspose(0);
  store.on('midi-transpose', ({ value }) => {
    showTr();
    toast(value === 0 ? 'MIDI 輸入：不移調' : `MIDI 輸入移調 ${value > 0 ? '+' : ''}${value} 半音`);
  });
  showTr();
  store.on('midi-pedal', ({ on }) => $('midiPed').classList.toggle('on', on));
  store.on('typing', ({ on }) => {
    $('btnTyping').classList.toggle('on', on);
    toast(on ? '電腦鍵盤彈奏：開啟（A S D F… 白鍵、W E T Y U 黑鍵、Z/X 換八度）' : '電腦鍵盤彈奏：關閉');
  });

  // MIDI 燈號：有訊號就閃一下；有裝置時外框亮
  let ledTimer;
  store.on('midi-activity', ({ on }) => {
    const led = $('midiLed');
    if (on) { led.classList.add('on'); clearTimeout(ledTimer); ledTimer = setTimeout(() => led.classList.remove('on'), 120); }
  });
  store.on('midi-devices', ({ inputs }) => {
    const led = $('midiLed');
    led.classList.toggle('dev', inputs.length > 0);
    led.title = inputs.length ? `MIDI 輸入：${inputs.join('、')}` : 'MIDI 輸入：沒有裝置';
    store.emit('select', {});   // 讓檢閱器更新裝置清單
  });
  // Web MIDI 權限：第一次互動後才要求，避免一打開頁面就跳權限視窗
  window.addEventListener('pointerdown', function once() {
    window.removeEventListener('pointerdown', once, true);
    initWebMidi().then(r => {
      if (r.denied) toast('MIDI 鍵盤權限被拒絕，可以改用電腦鍵盤彈奏', 'warn');
    });
  }, true);
}
let pendingImport = null;
