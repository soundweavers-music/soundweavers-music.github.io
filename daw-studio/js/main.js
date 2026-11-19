// 進入點：控制列、快捷鍵、檢閱器、對話框、自動暫存、每幀更新
import { store, newProject } from './state.js';
import { engine } from './engine.js';
import { recorder } from './recorder.js';
import { initArrange, render as renderArrange, updatePlayhead, followPlayhead, deleteSelected, splitSelected,
  duplicateSelected, selectAll, nudgeSelected, consumeImportAt, toggleTrackFlag } from './arrange.js';
import { initMixer, showMixer, tickMeters, stripFor, relayoutFaders } from './mixer.js';
import { saveProject, pickAndOpenProject, openProjectFile, autosave, readAutosave, restoreAutosave,
  clearAutosave, importAudioFiles, resetHandle, canSaveInPlace } from './project-io.js';
import { exportAudio } from './exporter.js';
import { view, setZoom, beatSec, snap } from './view.js';
import { fmtTime, fmtBars, toast } from './util.js';
import { isMidiClip, clipStart, clipDur } from './state.js';
import { initPianoRoll, open as openPianoRoll, close as closePianoRoll, isOpen as pianoOpen, handleKey as pianoKey, tick as pianoTick } from './pianoroll.js';
import { initMidiUi, instrumentSection, midiStatusSection, exportMidi } from './midi-ui.js';
import { handleTypingKey, setTyping, midiState, allOff as midiAllOff, setTranspose } from './midi-input.js';
import { addMidiClipAt } from './arrange.js';
import { initBankUi, sfSection } from './bank-ui.js';
import { insertsSection, sendSection, closeFxPanel } from './fx-ui.js';
import { initMasterUi, toggleMaster, masterOpen } from './master-ui.js';
import { toggleAlbum } from './album-ui.js';
import { initAutomationUi, tickAutomation } from './automation-ui.js';
import { showMenu } from './menu.js';
import { pitchShiftClips } from './pitch-render.js';
import { THEMES, setTheme, currentTheme } from './theme.js';
import { draw as drawPianoRoll } from './pianoroll.js';

const $ = id => document.getElementById(id);

function supported() {
  return !!(window.AudioContext || window.webkitAudioContext) && 'OfflineAudioContext' in window && 'indexedDB' in window;
}

// ---------------- 控制列 ----------------
function syncTopbar() {
  const p = store.project;
  $('projName').value = p.name;
  $('bpm').value = p.bpm;
  $('sig').value = `${p.sigNum}/${p.sigDen}`;
  $('btnCycle').classList.toggle('on', p.loop.on);
  $('btnMetro').classList.toggle('on', p.metronome);
  $('btnCountIn').classList.toggle('on', p.countIn);
  $('btnSnap').classList.toggle('on', p.snap);
  $('btnPlay').classList.toggle('on', engine.playing);
  $('btnRec').classList.toggle('on', recorder.recording);
  document.title = `${store.dirty ? '● ' : ''}${p.name} — 織音線上編曲製作`;
}

async function togglePlay() {
  if (recorder.recording) return recorder.stop();
  if (engine.playing) engine.stop();
  else await engine.play();
}

async function toggleRec() {
  if (recorder.recording) return recorder.stop();
  try { await recorder.start(); }
  catch (e) { toast('無法開始錄音：' + e.message, 'error'); }
}

function stopAll() {
  if (recorder.recording) { recorder.stop(); return; }
  if (engine.playing) engine.stop();
  else engine.seek(store.project.loop.on ? store.project.loop.start : 0);   // 停止中再按一次：回到開頭
}

function moveBars(n) {
  const bar = beatSec() * store.project.sigNum;
  const cur = engine.currentTime();
  const target = n > 0 ? (Math.floor(cur / bar + 1e-6) + n) * bar : (Math.ceil(cur / bar - 1e-6) + n) * bar;
  engine.seek(Math.max(0, target));
}

function bindTopbar() {
  $('btnPlay').onclick = togglePlay;
  $('btnStop').onclick = stopAll;
  $('btnRec').onclick = toggleRec;
  $('btnHome').onclick = () => engine.seek(0);
  $('btnRew').onclick = () => moveBars(-1);
  $('btnFwd').onclick = () => moveBars(1);
  $('btnCycle').onclick = () => {
    const L = store.project.loop;
    store.checkpoint();
    // 第一次開循環但沒設過範圍：用選取片段或前 4 小節
    if (!L.on && L.end <= L.start) { L.start = 0; L.end = beatSec() * store.project.sigNum * 4; }
    L.on = !L.on;
    store.changed('transport');
  };
  $('btnMetro').onclick = () => { store.project.metronome = !store.project.metronome; store.changed('transport'); };
  $('btnCountIn').onclick = () => { store.project.countIn = !store.project.countIn; store.changed('transport'); };
  $('btnSnap').onclick = () => { store.project.snap = !store.project.snap; store.changed('transport'); };

  $('projName').addEventListener('change', e => {
    store.checkpoint(); store.project.name = e.target.value.trim() || '未命名專案'; store.changed('transport');
  });
  $('bpm').addEventListener('change', e => {
    const v = Math.round(Math.min(300, Math.max(30, Number(e.target.value) || 120)));
    if (v === store.project.bpm) { e.target.value = v; return; }
    store.checkpoint();
    const k = store.project.bpm / v;
    store.project.bpm = v;
    // MIDI 片段以拍數儲存，自動跟著小節走。
    // 音訊片段「起點」換算到同一個小節位置（音訊本身不做時間伸縮，所以長度不變）。
    for (const t of store.project.tracks) for (const c of t.clips) if (!isMidiClip(c)) c.start *= k;
    const L = store.project.loop; L.start *= k; L.end *= k;
    engine.seek(engine.currentTime() * k);
    store.changed('structure');
  });
  $('sig').addEventListener('change', e => {
    const [n, d] = e.target.value.split('/').map(Number);
    store.checkpoint(); store.project.sigNum = n; store.project.sigDen = d; store.changed('structure');
  });
  for (const id of ['projName', 'bpm']) $(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });

  $('btnNew').onclick = async () => {
    if (store.dirty && !confirm('目前的專案還沒存檔，確定要開新專案？')) return;
    engine.stop(); engine.seek(0);
    resetHandle();
    store.replaceProject(newProject(), new Map(), new Map());
    await clearAutosave();
  };
  $('btnOpen').onclick = () => {
    if (store.dirty && !confirm('目前的專案還沒存檔，確定要開啟其他專案？')) return;
    pickAndOpenProject().catch(e => toast('開啟失敗：' + e.message, 'error'));
  };
  $('btnSave').onclick = () => saveProject(false).catch(e => toast('儲存失敗：' + e.message, 'error'));
  $('btnSave').title = canSaveInPlace() ? '儲存到你電腦上的專案檔 (Ctrl+S；Ctrl+Shift+S 另存新檔)' : '下載專案檔 (Ctrl+S)';
  $('btnImport').onclick = () => $('fileAudio').click();
  $('fileAudio').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const at = consumeImportAt() || { trackId: store.selection.trackId, at: snap(engine.currentTime()) };
    busy(`正在讀取 ${files.length} 個音檔…`);
    try { await importAudioFiles(files, at.trackId, at.at); } finally { busy(null); }
  });

  $('btnAddTrack').onclick = () => { if (!store.addTrack('audio')) toast('最多 32 軌', 'warn'); };
  $('btnAddMidi').onclick = () => {
    const t = store.addTrack('midi');
    if (!t) return toast('最多 32 軌', 'warn');
    store.selection.trackId = t.id; store.emit('select', {});
  };
  $('btnPiano').onclick = togglePiano;
  $('btnZoomIn').onclick = () => setZoom(view.pxPerBeat * 1.4);
  $('btnZoomOut').onclick = () => setZoom(view.pxPerBeat / 1.4);
  $('btnMixer').onclick = toggleMixer;
  $('btnInspector').onclick = toggleInspector;
  $('btnExport').onclick = openExport;
}

// 下方面板一次只顯示一個：混音台或鋼琴捲簾
function toggleMixer() {
  const on = $('mixer').classList.contains('hidden');
  if (on) store.emit('panel', { name: 'mixer' });
  showMixer(on);
  $('btnMixer').classList.toggle('on', on);
  localStorage.setItem('daw.mixer', on ? '1' : '0');
  requestAnimationFrame(() => renderArrange());
}

function togglePiano() {
  if (pianoOpen()) { closePianoRoll(); return; }
  // 要編輯哪個片段：選取的 MIDI 片段 → 選取軌在播放頭下的片段 → 選取軌第一個片段 → 新建一個
  const sel = [...store.selection.clipIds].map(id => store.findClip(id)).find(f => f && isMidiClip(f.clip));
  if (sel) return openPianoRoll(sel.clip.id);
  const t = store.track(store.selection.trackId);
  if (!t || t.kind !== 'midi') { toast('先選一條 MIDI 軌或 MIDI 片段', 'warn'); return; }
  const pos = engine.currentTime();
  const c = t.clips.find(c => pos >= clipStart(c) && pos < clipStart(c) + clipDur(c)) || t.clips[0] || addMidiClipAt(t, pos);
  if (c) openPianoRoll(c.id);
}

function toggleInspector() {
  const m = $('main');
  m.classList.toggle('no-inspector');
  const on = !m.classList.contains('no-inspector');
  $('btnInspector').classList.toggle('on', on);
  localStorage.setItem('daw.inspector', on ? '1' : '0');
  if (on) renderInspector();
  requestAnimationFrame(() => renderArrange());
}

// ---------------- 檢閱器 ----------------
function renderInspector() {
  const box = $('inspector');
  if ($('main').classList.contains('no-inspector')) return;
  const t = store.track(store.selection.trackId);
  box.innerHTML = '';
  if (!t) { box.innerHTML = '<h4>檢閱器</h4><p style="color:var(--tx2)">選一條軌道</p>'; return; }
  const sel = [...store.selection.clipIds].map(id => store.findClip(id)).filter(Boolean);
  const h = document.createElement('div');
  h.innerHTML = `<h4>軌道</h4>`;
  const sec = document.createElement('div'); sec.className = 'sec';
  sec.innerHTML = `
    <div class="row"><input type="text" id="insName" maxlength="40"></div>
    <div class="row"><span>類型</span><span>${t.kind === 'audio' ? '音訊' : 'MIDI'}</span></div>
    <div class="row"><span>片段</span><span>${t.clips.length} 個</span></div>
    <div class="row"><span>顏色</span><input type="color" id="insColor" value="${t.color}" style="width:40px;height:20px;border:0;background:none;padding:0"></div>`;
  h.appendChild(sec);
  box.appendChild(h);
  const nm = sec.querySelector('#insName');
  nm.value = t.name;
  nm.addEventListener('keydown', e => e.stopPropagation());
  nm.addEventListener('change', () => { store.checkpoint(); t.name = nm.value.trim() || t.name; store.changed('structure'); });
  sec.querySelector('#insColor').addEventListener('change', e => { store.checkpoint(); t.color = e.target.value; store.changed('structure'); });
  if (t.kind === 'midi') { box.appendChild(instrumentSection(t)); box.appendChild(sfSection(t)); box.appendChild(midiStatusSection()); }
  box.appendChild(insertsSection(t.id));
  box.appendChild(sendSection(t));

  if (sel.length === 1 && isMidiClip(sel[0].clip)) {
    const { clip } = sel[0];
    const cs = document.createElement('div'); cs.className = 'sec';
    cs.innerHTML = `<h4 style="margin-top:0">MIDI 片段</h4>
      <div class="row"><input type="text" id="insClip" maxlength="60"></div>
      <div class="row"><span>起點</span><span>第 ${(clip.startBeat / store.project.sigNum + 1).toFixed(2).replace(/\.00$/, '')} 小節</span></div>
      <div class="row"><span>長度 拍</span><input type="number" id="insLen" step="1" min="0.25" style="width:64px"></div>
      <div class="row"><span>音符</span><span>${clip.notes.length} 個</span></div>
      <div class="row"><button class="tbtn" id="insOpenPR" style="width:100%;height:24px">打開鋼琴捲簾</button></div>`;
    box.appendChild(cs);
    const nmc = cs.querySelector('#insClip'); nmc.value = clip.name;
    nmc.addEventListener('keydown', e => e.stopPropagation());
    nmc.addEventListener('change', () => { store.checkpoint(); clip.name = nmc.value || clip.name; store.changed('structure'); });
    const ln = cs.querySelector('#insLen'); ln.value = +clip.lengthBeats.toFixed(3);
    ln.addEventListener('keydown', e => e.stopPropagation());
    ln.addEventListener('change', () => { store.checkpoint(); clip.lengthBeats = Math.max(0.25, Number(ln.value) || clip.lengthBeats); store.changed('structure'); });
    cs.querySelector('#insOpenPR').onclick = () => openPianoRoll(clip.id);
  } else if (sel.length === 1) {
    const { clip } = sel[0];
    const cs = document.createElement('div'); cs.className = 'sec';
    cs.innerHTML = `<h4 style="margin-top:0">片段</h4>
      <div class="row"><input type="text" id="insClip" maxlength="60"></div>
      <div class="row"><span>起點</span><span>${fmtTime(clip.start)}</span></div>
      <div class="row"><span>長度</span><span>${clip.duration.toFixed(3)} 秒</span></div>
      <div class="row"><span>音量 dB</span><input type="number" id="insGain" step="0.5" min="-30" max="24" style="width:64px"></div>
      <div class="row"><span>淡入 ms</span><input type="number" id="insFi" step="10" min="0" style="width:64px"></div>
      <div class="row"><span>淡出 ms</span><input type="number" id="insFo" step="10" min="0" style="width:64px"></div>`;
    box.appendChild(cs);
    const f = (id, v, apply) => {
      const el = cs.querySelector(id); el.value = v;
      el.addEventListener('keydown', e => e.stopPropagation());
      el.addEventListener('change', () => { store.checkpoint(); apply(el.value); store.changed('structure'); });
    };
    f('#insClip', clip.name, v => { clip.name = v || clip.name; });
    f('#insGain', clip.gainDb || 0, v => { clip.gainDb = Math.max(-30, Math.min(24, Number(v) || 0)); });
    f('#insFi', Math.round((clip.fadeIn || 0) * 1000), v => { clip.fadeIn = Math.max(0, Math.min(clip.duration - (clip.fadeOut || 0), Number(v) / 1000 || 0)); });
    f('#insFo', Math.round((clip.fadeOut || 0) * 1000), v => { clip.fadeOut = Math.max(0, Math.min(clip.duration - (clip.fadeIn || 0), Number(v) / 1000 || 0)); });
  } else if (sel.length > 1) {
    const cs = document.createElement('div'); cs.className = 'sec';
    cs.innerHTML = `<h4 style="margin-top:0">片段</h4><p style="color:var(--tx1);margin:0">已選 ${sel.length} 個片段</p>`;
    box.appendChild(cs);
  }
  const ss = document.createElement('div'); ss.className = 'sec strip-wrap';
  ss.style.height = '400px';
  ss.appendChild(stripFor(t));
  box.appendChild(ss);
  const ms = document.createElement('div'); ms.className = 'sec strip-wrap';
  ms.style.height = '380px';
  ms.appendChild(stripFor(null));
  box.appendChild(ms);
  requestAnimationFrame(relayoutFaders);
}

// ---------------- 輸出 ----------------
function openExport() {
  const d = $('dlgExport');
  const end = store.projectEnd();
  const L = store.project.loop;
  $('exportNote').innerHTML = end > 0
    ? `專案長度 <b>${fmtTime(end)}</b>${L.end > L.start ? `，循環區間 ${fmtTime(L.start)}–${fmtTime(L.end)}` : ''}。輸出會依目前的靜音／獨奏狀態混音；分軌輸出則每一軌各自一個檔案，不受獨奏影響。<br>節拍器聲音不會被輸出。`
    : '專案裡還沒有任何片段。';
  d.querySelector('[name=sampleRate]').value = String(engine.ctx ? engine.sampleRate : 48000);
  if (!d.querySelector(`[name=sampleRate] option[value="${engine.sampleRate}"]`)) d.querySelector('[name=sampleRate]').value = '48000';
  const M = store.project.mastering;
  if (M?.on) $('exportNote').insertAdjacentHTML('beforeend', '<br><b>母帶處理已開啟</b>，整首混音會套用母帶鏈。');
  // 格式切換：MP3 顯示位元率、FLAC 不能 32-bit
  const fmt = d.querySelector('[name=format]');
  const syncFmt = () => {
    const f = fmt.value;
    $('fBitDepth').hidden = f === 'mp3' || f === 'mid';
    $('fBitrate').hidden = f !== 'mp3';
    const bd = d.querySelector('[name=bitDepth]');
    bd.querySelector('option[value="32"]').disabled = f === 'flac';
    if (f === 'flac' && bd.value === '32') bd.value = '24';
    d.querySelector('[name=sampleRate] option[value="96000"]').disabled = f === 'mp3';
    if (f === 'mp3' && d.querySelector('[name=sampleRate]').value === '96000') d.querySelector('[name=sampleRate]').value = '48000';
  };
  fmt.onchange = syncFmt; syncFmt();
  d.showModal();
  d.onclose = async () => {
    if (d.returnValue !== 'ok') return;
    const fd = new FormData(d.querySelector('form'));
    if (fd.get('format') === 'mid') { exportMidi(); return; }
    busy('輸出中…');
    try {
      await exportAudio({
        mode: fd.get('mode'), range: fd.get('range'), format: fd.get('format'),
        bitDepth: Number(fd.get('bitDepth')), kbps: Number(fd.get('kbps')), sampleRate: Number(fd.get('sampleRate')),
        normalize: fd.get('normalize') === 'on', stemMaster: fd.get('stemMaster') === 'on',
      });
    } catch (e) { toast('輸出失敗：' + e.message, 'error'); console.error(e); }
    finally { busy(null); }
  };
}

function busy(text) {
  $('busy').classList.toggle('show', !!text);
  if (text) $('busyText').textContent = text;
}

// ---------------- 快捷鍵 ----------------
function bindKeys() {
  window.addEventListener('keyup', e => {
    if (e.target.closest('input,select,textarea') && e.target.type !== 'range') return;
    if (handleTypingKey(e, false)) e.preventDefault();
  });
  window.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea') && e.target.type !== 'range') return;
    if (document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const run = fn => { e.preventDefault(); fn(); };
    // Caps Lock 切換電腦鍵盤彈奏；彈奏模式下字母鍵都拿來彈琴（空白鍵、方向鍵等照常）
    if (e.key === 'CapsLock') { setTyping(!midiState.typing); return; }
    if (mod && k === 'k') return run(() => setTyping(!midiState.typing));
    if (handleTypingKey(e, true)) { e.preventDefault(); return; }
    if (pianoKey(e)) { e.preventDefault(); return; }
    // [ ]：MIDI 輸入移調（Shift = 八度）。e.code 不受 Shift 影響（Shift+[ 會變成 {）
    if (!mod && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault();
      setTranspose(midiState.transpose + (e.code === 'BracketRight' ? 1 : -1) * (e.shiftKey ? 12 : 1));
      return;
    }
    if (mod) {
      if (k === 's') return run(() => saveProject(e.shiftKey).catch(err => toast(err.message, 'error')));
      if (k === 'o') return run(() => $('btnOpen').click());
      if (k === 'i') return run(() => $('btnImport').click());
      if (k === 'e') return run(openExport);
      if (k === 'z') return run(() => (e.shiftKey ? store.redo() : store.undo()) || toast(e.shiftKey ? '沒有可以重做的動作' : '沒有可以復原的動作'));
      if (k === 'y') return run(() => store.redo());
      if (k === 't') return run(() => splitSelected(engine.currentTime()));
      if (k === 'd') return run(duplicateSelected);
      if (k === 'a') return run(selectAll);
      return;
    }
    switch (e.key) {
      case ' ': return run(togglePlay);
      case 'Enter': return run(() => engine.seek(0));
      case 'Delete': case 'Backspace': return run(deleteSelected);
      case ',': return run(() => moveBars(-1));
      case '.': return run(() => moveBars(1));
      case '=': case '+': return run(() => setZoom(view.pxPerBeat * 1.4));
      case '-': return run(() => setZoom(view.pxPerBeat / 1.4));
      case 'ArrowLeft': if (nudgeSelected(-1)) e.preventDefault(); return;
      case 'ArrowRight': if (nudgeSelected(1)) e.preventDefault(); return;
      case 'ArrowUp': case 'ArrowDown': {
        const ts = store.project.tracks;
        const i = ts.findIndex(t => t.id === store.selection.trackId);
        const n = ts[Math.max(0, Math.min(ts.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)))];
        if (n) { e.preventDefault(); store.selection.trackId = n.id; store.emit('select', {}); }
        return;
      }
      case 'Escape': store.selection.clipIds.clear(); store.emit('select', {}); return;
    }
    const t = store.track(store.selection.trackId);
    if (k === 'r') return run(toggleRec);
    if (k === 'c') return run(() => $('btnCycle').click());
    if (k === 'k') return run(() => $('btnMetro').click());
    if (k === 'g') return run(() => $('btnSnap').click());
    if (k === 'x') return run(toggleMixer);
    if (k === 'p') return run(togglePiano);
    if (e.shiftKey && k === 'm') return run(() => toggleMaster());
    if (k === 'a' && !e.shiftKey) return run(() => store.emit('toggle-automation', {}));
    if (k === 'i') return run(toggleInspector);
    if (t && k === 'm') return run(() => toggleTrackFlag(t, 'mute'));
    if (t && k === 's') return run(() => toggleTrackFlag(t, 'solo'));
  });
}

// ---------------- 狀態列／輸入裝置 ----------------
async function refreshInputs() {
  const sel = $('inputSel');
  try {
    const list = await recorder.listInputs();
    const cur = recorder.deviceId;
    sel.innerHTML = '<option value="">預設麥克風</option>' + list.filter(d => d.deviceId && d.deviceId !== 'default')
      .map((d, i) => `<option value="${d.deviceId}">${(d.label || `輸入裝置 ${i + 1}`).replace(/[<>&"]/g, '')}</option>`).join('');
    sel.value = list.some(d => d.deviceId === cur) ? cur : '';
  } catch (_) { /* 尚未授權 */ }
}

function updateStatus() {
  const c = engine.ctx;
  if (!c) return;
  $('stEngine').textContent = `音訊引擎：${c.sampleRate / 1000} kHz・${c.state === 'running' ? '執行中' : '暫停'}`;
  if (recorder.stream) {
    const ms = Math.round(recorder.totalLatency() * 1000);
    $('stLatency').innerHTML = `錄音延遲補償 ${ms} ms <a href="#" id="latLink" style="color:var(--accent)">校正</a>`;
    $('latLink').onclick = ev => { ev.preventDefault(); openLatency(); };
  }
}

function openLatency() {
  const d = $('dlgSettings');
  d.querySelector('[name=latency]').value = recorder.latencyMs;
  d.showModal();
  d.onclose = () => {
    if (d.returnValue !== 'ok') return;
    recorder.latencyMs = Number(d.querySelector('[name=latency]').value) || 0;
    localStorage.setItem('daw.latencyMs', String(recorder.latencyMs));
    updateStatus();
  };
}

// ---------------- 每幀 ----------------
function frame() {
  const pos = engine.currentTime();
  const p = store.project;
  $('lcdTime').textContent = fmtTime(pos);
  $('lcdBars').textContent = fmtBars(pos, p.bpm, p.sigNum);
  updatePlayhead(pos);
  if (engine.playing) followPlayhead(pos);
  pianoTick();
  tickAutomation();
  const lv = tickMeters();
  if (lv && engine.playing) {
    document.querySelectorAll('.thead').forEach(el => {
      const v = lv.get(el.dataset.id) || engine.trackMeter(el.dataset.id);
      const pk = Math.max(v[0], v[1]);
      const pos01 = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(pk, 1e-6)) + 60) / 66));
      el.querySelector('.tmeter i').style.transform = `scaleY(${pos01})`;
    });
  } else if (!engine.playing && frame._wasPlaying) {
    document.querySelectorAll('.tmeter i').forEach(i => { i.style.transform = 'scaleY(0)'; });
  }
  frame._wasPlaying = engine.playing;
  if (recorder.inputMeter) {
    const [l, r] = recorder.inputLevels();
    const v = Math.max(l, r);
    $('inMeter').style.width = (Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-6)) + 60) / 60)) * 100) + '%';
  }
  requestAnimationFrame(frame);
}

// ---------------- 自動暫存 ----------------
let saveTimer = null;
function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!recorder.recording) autosave(); }, 1500);
}

async function maybeRestore() {
  const cur = await readAutosave();
  if (!cur || !cur.project?.tracks?.some(t => t.clips.length)) return;
  const d = $('dlgRestore');
  const when = new Date(cur.savedAt).toLocaleString('zh-TW');
  $('restoreNote').innerHTML = `瀏覽器裡還留著「<b>${cur.project.name.replace(/[<>&]/g, '')}</b>」的暫存（${when}）。<br>暫存只在這台電腦的這個瀏覽器裡；清除瀏覽資料就會消失，重要的專案請另外按「儲存」存成檔案。`;
  d.showModal();
  await new Promise(r => { d.onclose = r; });
  if (d.returnValue === 'restore') {
    busy('正在還原…');
    try { await engine.ensure().catch(() => {}); await restoreAutosave(); toast('已還原上次的進度'); }
    catch (e) { toast('還原失敗：' + e.message, 'error'); }
    finally { busy(null); }
  } else await clearAutosave();
}

let loopSig = '';

// ---------------- 啟動 ----------------
async function boot() {
  if (!supported()) { $('unsupported').style.display = 'flex'; return; }
  store.selection.trackId = store.project.tracks[0].id;
  initArrange();
  initMixer();
  initPianoRoll();
  initMidiUi();
  initBankUi();
  initMasterUi();
  initAutomationUi();
  // 下方面板（混音台／鋼琴捲簾／母帶）一次只開一個
  store.on('panel', ({ name }) => {
    if (name && name !== 'mixer' && !$('mixer').classList.contains('hidden')) { showMixer(false); $('btnMixer').classList.remove('on'); }
    if (name && name !== 'pianoroll' && pianoOpen()) closePianoRoll();
    if (name && name !== 'master' && masterOpen()) toggleMaster(false);
    $('btnPiano').classList.toggle('on', name === 'pianoroll' || pianoOpen());
    requestAnimationFrame(() => renderArrange());
  });
  $('btnMaster').onclick = () => toggleMaster();
$('btnAlbum').onclick = () => toggleAlbum();
  // 片段升降音對話框
  store.on('open-pitch', ({ clipIds }) => {
    const d = $('dlgPitch');
    const semis = d.querySelector('[name=semis]'), cents = d.querySelector('[name=cents]');
    semis.value = 0; cents.value = 0;
    const q = $('pitchQuick');
    // 上排降、下排升，由小到大；常用的 ±1～±3 放中間
    const rows = [[-12, -7, -5, -4, -3, -2, -1], [1, 2, 3, 4, 5, 7, 12]];
    q.innerHTML = rows.map(r => r.map(v => `<button type="button" data-v="${v}" class="${v < 0 ? 'dn' : 'up'}">${v > 0 ? '+' : '−'}${Math.abs(v)}${Math.abs(v) === 12 ? '<small> 八度</small>' : ''}</button>`).join('')).join('');
    const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = () => {
      const v = Number(semis.value) + Number(cents.value) / 100;
      q.querySelectorAll('button').forEach(b => b.classList.toggle('sel', Number(b.dataset.v) === Number(semis.value) && !Number(cents.value)));
      $('pitchNote').textContent = !v ? '選一個要升或降的量' : `${v > 0 ? '升' : '降'} ${Math.abs(v)} 個半音${Number.isInteger(v) && Math.abs(v) <= 11 ? `：例如原本 C 調 → ${NAMES[((0 + v) % 12 + 12) % 12]} 調` : ''}${Math.abs(v) === 12 ? '（一個八度）' : ''}`;
    };
    q.onclick = e => { const b = e.target.closest('button'); if (b) { semis.value = b.dataset.v; cents.value = 0; note(); } };
    semis.oninput = cents.oninput = note;
    [semis, cents].forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    note();
    d.showModal();
    semis.focus(); semis.select();
    d.onclose = () => {
      if (d.returnValue !== 'ok') return;
      const s2 = Math.max(-24, Math.min(24, Math.round(Number(semis.value) || 0)));
      const c2 = Math.max(-100, Math.min(100, Math.round(Number(cents.value) || 0)));
      if (s2 || c2) pitchShiftClips(clipIds, s2, c2);
    };
  });
  // 窄螢幕收起來的按鈕
  $('btnMore').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 2, [
      { label: '匯入 MIDI…', action: () => $('btnImportMidi').click() },
      { label: '音色庫（SoundFont）…', action: () => $('btnBanks').click() },
      { label: '專輯母帶（批次）…', action: () => toggleAlbum(true) },
      '-',
      { label: '錄音延遲校正…', action: openLatency },
      { label: '配色主題…', action: () => $('btnTheme').click() },
    ]);
  };
  // 配色主題：選單列出三種，目前的打勾；切換後重畫靜態的 canvas（其他 canvas 每幀都會重畫）
  $('btnTheme').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect(), cur = currentTheme();
    showMenu(r.left, r.bottom + 2, THEMES.map(t => ({ label: (t.id === cur ? '✓ ' : '　 ') + t.name, action: () => setTheme(t.id) })));
  };
  window.addEventListener('daw-theme', () => {
    renderArrange();
    if (pianoOpen()) drawPianoRoll();
    document.querySelectorAll('.atx, .hmx').forEach(el => el._refresh && el._refresh());
  });
  bindTopbar();
  bindKeys();
  syncTopbar();
  if (localStorage.getItem('daw.mixer') === '1') { showMixer(true); $('btnMixer').classList.add('on'); }
  if (localStorage.getItem('daw.inspector') === '0') $('main').classList.add('no-inspector');
  else $('btnInspector').classList.add('on');
  renderInspector();

  store.on('change', ({ kind }) => {
    syncTopbar();
    if (kind !== 'mix') renderInspector();
    // 循環範圍或開關變了才重新排程（切節拍器等不需要，避免聲音斷一下）
    const L = store.project.loop, sig = `${L.on}|${L.start}|${L.end}`;
    if (kind === 'transport' && engine.playing && !recorder.recording && sig !== loopSig) engine.restartAt(engine.currentTime());
    loopSig = sig;
    scheduleAutosave();
  });
  store.on('mixlive', () => { syncTopbar(); scheduleAutosave(); });
  store.on('select', renderInspector);
  store.on('transport', () => { syncTopbar(); updateStatus(); });
  store.on('record', () => syncTopbar());
  store.on('busy', d => busy(d && d.text));
  store.on('transport', ({ playing }) => { if (!playing) midiAllOff(); });
  store.on('export-progress', d => { if (!d.done) busy(d.text); });
  store.on('saved', syncTopbar);
  store.on('autosaved', d => {
    $('saveInfo').textContent = d.error ? '暫存失敗' : `已暫存 ${new Date(d.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
    $('saveInfo').title = d.error || '專案自動暫存在這個瀏覽器（IndexedDB），不會上傳';
  });
  store.on('input-ready', () => { refreshInputs(); updateStatus(); });
  store.on('open-project-file', ({ file }) => {
    if (store.dirty && !confirm('目前的專案還沒存檔，確定要開啟其他專案？')) return;
    busy('正在開啟專案…');
    openProjectFile(file).catch(e => toast('開啟失敗：' + e.message, 'error')).finally(() => busy(null));
  });
  $('inputSel').addEventListener('change', e => recorder.setDevice(e.target.value).catch(err => toast(err.message, 'error')));
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshInputs);

  window.addEventListener('beforeunload', e => { if (store.dirty) { e.preventDefault(); e.returnValue = ''; } });
  // 第一次點擊任何地方時啟動音訊引擎（瀏覽器規定要使用者互動）
  window.addEventListener('pointerdown', function once() {
    engine.ensure().then(updateStatus);
    window.removeEventListener('pointerdown', once, true);
  }, true);

  requestAnimationFrame(frame);
  await maybeRestore();
}

boot();
