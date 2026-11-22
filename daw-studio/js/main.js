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
import { importChordFile } from './chord-import.js';
import { exportVideoMp4 } from './video-export.js';
import { importVideoFiles, addTextClip, toggleVideoPreview, initVideoPreview, videoSettings } from './video.js';
import { initVideoPanel, toggleVideoPanel, openVideoPanel, videoPanelOpen } from './video-ui.js';
import { view, setZoom, beatSec, snap } from './view.js';
import { fmtTime, fmtBars, toast, uid } from './util.js';
import { isMidiClip, clipStart, clipDur } from './state.js';
import { initPianoRoll, open as openPianoRoll, close as closePianoRoll, isOpen as pianoOpen, handleKey as pianoKey, tick as pianoTick } from './pianoroll.js';
import { initMidiUi, instrumentSection, midiStatusSection, exportMidi } from './midi-ui.js';
import { handleTypingKey, setTyping, midiState, allOff as midiAllOff, setTranspose, midiInputs, setEnabledInputs, setMidiEnabled, initWebMidi } from './midi-input.js';
import { addMidiClipAt } from './arrange.js';
import { initBankUi, sfSection } from './bank-ui.js';
import { insertsSection, sendSection, closeFxPanel, openFxPanel } from './fx-ui.js';
import { loadBuiltinBank, findProgram, sfInstrumentId } from './soundbank.js';
import { initMasterUi, toggleMaster, masterOpen } from './master-ui.js';
import { toggleAlbum } from './album-ui.js';
import { toggleArranger } from './arranger-ui.js';
import { initAutomationUi, tickAutomation } from './automation-ui.js';
import { openBreathPanel } from './breath-ui.js';
import { showMenu, showMenuCols } from './menu.js';
import { toggleChordLane, detectAndApply, applyChordsToHarmony, applyChordsToTune, clearChords, chordsOf, chordKeyOf, chordLabel, VIEW_NAMES } from './chord-ui.js';
import { toggleSectionLane, clearSections, sectionsOf, secName } from './section-ui.js';
import { LiveLoudness, TARGETS } from './loudness.js';
import { pitchShiftClips } from './pitch-render.js';
import { THEMES, setTheme, currentTheme } from './theme.js';
import { draw as drawPianoRoll } from './pianoroll.js';
import { seedDemo } from './demo-project.js';
import { translateDom, setLang, langPref, isEN } from './i18n.js';

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
  document.title = `${store.dirty ? '● ' : ''}${p.name} — 織音AI線上編曲製作`;
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

// 檔案動作：選單與快捷鍵共用
async function fileNew() {
  if (store.dirty && !confirm('目前的專案還沒存檔，確定要開新專案？')) return;
  engine.stop(); engine.seek(0);
  resetHandle();
  store.replaceProject(newProject(), new Map(), new Map());
  await clearAutosave();
}
function fileOpen() {
  if (store.dirty && !confirm('目前的專案還沒存檔，確定要開啟其他專案？')) return;
  pickAndOpenProject().catch(e => toast('開啟失敗：' + e.message, 'error'));
}
const fileSave = () => saveProject(false).catch(e => toast('儲存失敗：' + e.message, 'error'));

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

  // 檔案選單：新增／開啟／儲存／匯入集中在一個按鈕
  $('btnFile').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 2, [
      { label: '新專案', key: 'Ctrl+N', action: fileNew },
      { label: '開啟專案…', key: 'Ctrl+O', action: fileOpen },
      '-',
      { label: canSaveInPlace() ? '儲存（覆寫目前的檔案）' : '儲存到電腦（下載 .zyproj）', key: 'Ctrl+S', action: fileSave },
      { label: '另存新檔…', key: 'Ctrl+Shift+S', action: () => saveProject(true).catch(err => toast('儲存失敗：' + err.message, 'error')) },
      '-',
      { label: '匯入音檔…（也可以選分軌 .zip）', key: 'Ctrl+I', action: () => $('fileAudio').click() },
      { label: '匯入 MIDI…', action: () => $('fileMidi').click() },
      { label: '匯入和弦（來自「自動抓和弦」）…', action: () => $('fileChords').click() },
      '-',
      { label: '專案會自動暫存到這個瀏覽器', disabled: true },
    ]);
  };
  bindEditMenu();
  $('btnImport').onclick = () => $('fileAudio').click();
  $('fileAudio').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const at = consumeImportAt() || { trackId: store.selection.trackId, at: snap(engine.currentTime()) };
    busy(`正在讀取 ${files.length} 個音檔…`);
    try { await importAudioFiles(files, at.trackId, at.at); } finally { busy(null); }
  });
  // 自動抓和弦工具匯出的 .zychords.json → 直接變成和弦軌
  $('fileChords').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await importChordFile(f); } catch (err) { toast('和弦匯入失敗：' + err.message, 'error'); }
  });

  $('btnAddTrack').onclick = () => { if (!store.addTrack('audio')) toast('最多 32 軌', 'warn'); };
  $('btnAddMidi').onclick = () => {
    const t = store.addTrack('midi');
    if (!t) return toast('最多 32 軌', 'warn');
    store.selection.trackId = t.id; store.emit('select', {});
  };
  // 影片／文字／字幕
  const addVisualTrack = kind => {
    const t = store.addTrack(kind);
    if (!t) { toast('最多 32 軌', 'warn'); return null; }
    store.selection.trackId = t.id; store.emit('select', {});
    toggleVideoPreview(true);
    return t;
  };
  $('btnAddVisual').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = snap(engine.currentTime());
    showMenu(r.left, r.bottom + 2, [
      { label: '匯入影片…（MP4 / WebM）', action: () => $('fileVideo').click() },
      { label: '新增文字軌', action: () => { const t = addVisualTrack('text'); if (t) addTextClip(t, at, '文字'); } },
      { label: '新增字幕軌', action: () => { const t = addVisualTrack('sub'); if (t) addTextClip(t, at, '字幕文字'); } },
    ]);
  };
  $('btnPreview').onclick = () => toggleVideoPreview();
  $('btnKeys').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    showShortcuts(Math.max(8, r.right - 300), r.bottom + 2);
  };
  // 預覽視窗上的「影像編輯」按鈕／右鍵選單都走這裡
  store.on('toggle-preview', () => toggleVideoPreview());
  store.on('open-video-panel', ({ tab: tb }) => openVideoPanel(tb));
  $('fileVideo').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const at = consumeImportAt() || { trackId: store.selection.trackId, at: snap(engine.currentTime()) };
    busy(`正在讀取 ${files.length} 個影片…`);
    try {
      await importVideoFiles(files, at.trackId, at.at);
      toggleVideoPreview(true);
    } finally { busy(null); }
  });
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
    <div class="row"><span>類型</span><span>${({ audio: '音訊', midi: 'MIDI', video: '影片', text: '文字', sub: '字幕' })[t.kind] || '音訊'}</span></div>
    <div class="row"><span>片段</span><span>${t.clips.length} 個</span></div>
    <div class="row"><span>顏色</span><input type="color" id="insColor" value="${t.color}" style="width:40px;height:20px;border:0;background:none;padding:0"></div>`;
  h.appendChild(sec);
  box.appendChild(h);
  const nm = sec.querySelector('#insName');
  nm.value = t.name;
  nm.addEventListener('keydown', e => e.stopPropagation());
  nm.addEventListener('change', () => { store.checkpoint(); t.name = nm.value.trim() || t.name; store.changed('structure'); });
  sec.querySelector('#insColor').addEventListener('change', e => { store.checkpoint(); t.color = e.target.value; store.changed('structure'); });
  if (t.kind === 'midi') { box.appendChild(instrumentSection(t)); box.appendChild(sfSection(t)); box.appendChild(midiStatusSection()); box.appendChild(inputVelSection(t)); box.appendChild(transposeSection(t)); }
  // 影片／文字／字幕軌只有畫面，沒有音訊處理
  if (t.kind === 'video' || t.kind === 'text' || t.kind === 'sub') {
    const vs = videoSettings();
    const vsec = document.createElement('div'); vsec.className = 'sec';
    vsec.innerHTML = `<h4 style="margin-top:0">畫面</h4>
      <div class="row"><span>畫布</span><span>${vs.w}×${vs.h}・${vs.fps} fps</span></div>
      <p class="midi-status">這一軌只出現在畫面上：不進混音、輸出音檔時會被略過。按 <b>預覽</b>（V）可以看合成結果，文字可以用滑鼠在預覽畫面上拖曳。</p>`;
    box.appendChild(vsec);
    return;
  }
  box.appendChild(chordSection(t));
  box.appendChild(sectionSection());
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
  // 格式切換：MP3 顯示位元率、FLAC 不能 32-bit、MP4 用影片預覽的畫布設定
  const fmt = d.querySelector('[name=format]');
  const baseNote = $('exportNote').innerHTML;
  const vs = videoSettings();
  const videoNote = `<br><b>影片</b>：${vs.w}×${vs.h}、${vs.fps} fps（在預覽視窗下方可以改），聲音 48 kHz AAC。`
    + '有影片的段落會逐格算圖，比輸出音檔慢很多。';
  const syncFmt = () => {
    const f = fmt.value;
    $('fBitDepth').hidden = f === 'mp3' || f === 'mid' || f === 'mp4';
    $('fBitrate').hidden = f !== 'mp3';
    $('fSampleRate').hidden = f === 'mp4';
    $('exportNote').innerHTML = baseNote + (f === 'mp4' ? videoNote : '');
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
    if (fd.get('format') === 'mp4') {
      busy('輸出影片…', 0);
      try {
        await exportVideoMp4({ range: fd.get('range'), width: vs.w, height: vs.h, fps: vs.fps });
      } catch (e) { toast('影片輸出失敗：' + e.message, 'error'); console.error(e); }
      finally { busy(null); }
      return;
    }
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

let _busyStart = 0, _busyFrac = 0;
function busy(text, frac) {
  $('busy').classList.toggle('show', !!text);
  if (!text) { _busyStart = 0; $('busyBar').hidden = true; $('busyEta').textContent = ''; return; }
  $('busyText').textContent = text;
  const bar = $('busyBar'), fill = $('busyFill'), eta = $('busyEta');
  if (frac === undefined || frac === null) { bar.hidden = true; eta.textContent = ''; return; }
  if (!_busyStart) _busyStart = performance.now();
  _busyFrac = Math.max(0, Math.min(1, frac));
  bar.hidden = false;
  fill.style.width = (_busyFrac * 100).toFixed(1) + '%';
  const el = (performance.now() - _busyStart) / 1000;
  if (_busyFrac > 0.03) {
    const total = el / _busyFrac;
    const left = Math.max(0, total - el);
    eta.textContent = `已用 ${el.toFixed(0)} 秒　剩約 ${left < 1 ? '不到 1' : left.toFixed(0)} 秒　${(_busyFrac * 100).toFixed(0)}%`;
  } else {
    eta.textContent = `已用 ${el.toFixed(0)} 秒　${(_busyFrac * 100).toFixed(0)}%`;
  }
}

// ---------------- 快捷鍵 ----------------
// ── 編輯：剪貼簿與動作（選單與快捷鍵共用）：復原／剪下／複製／貼上／刪除／全選 ──────────────
// 剪貼簿放在模組層級：複製的是片段的深拷貝，貼上時重新給 id 與位置
let clipClipboard = [];
const selectedClips = () => [...store.selection.clipIds].map(id => store.findClip(id)).filter(Boolean);
const copySelected = () => {
  const sel = selectedClips();
  if (!sel.length) { toast('先選取片段', 'warn'); return false; }
  clipClipboard = sel.map(({ track, clip }) => ({ trackId: track.id, clip: structuredClone(clip) }));
  toast(`已複製 ${clipClipboard.length} 個片段`);
  return true;
};
const pasteClips = () => {
  if (!clipClipboard.length) { toast('剪貼簿是空的', 'warn'); return; }
  const at = snap(engine.currentTime());
  const first = Math.min(...clipClipboard.map(x => clipStart(x.clip)));
  store.checkpoint();
  const ids = [];
  for (const item of clipClipboard) {
    const track = store.track(item.trackId) || store.track(store.selection.trackId);
    if (!track) continue;
    const c = structuredClone(item.clip);
    c.id = uid('clip');
    const shift = at - first;
    if (isMidiClip(c)) c.startBeat = Math.max(0, c.startBeat + shift);
    else c.start = Math.max(0, c.start + shift);
    track.clips.push(c);
    ids.push(c.id);
  }
  store.selection.clipIds = new Set(ids);
  store.changed('structure');
  store.emit('select', {});
  toast(`已貼上 ${ids.length} 個片段`);
};
const cutSelected = () => { if (copySelected()) deleteSelected(); };
const selectAllClips = () => {
  const t = store.track(store.selection.trackId);
  const list = (t ? [t] : store.project.tracks).flatMap(x => x.clips.map(c => c.id));
  store.selection.clipIds = new Set(list);
  store.emit('select', {});
  toast(`已選取 ${list.length} 個片段`);
};
// 快捷鍵一覽：導覽列上的「快捷鍵」按鈕打開（選單右邊會顯示按鍵）
// 整份有 40 條，一欄會比螢幕還高，所以排成兩欄（依分組平均分配）
export function showShortcuts(x, y) {
  const groups = [];
  let items = [];
  const add = (label, key, hint) => items.push({ label: hint ? `${label}　${hint}` : label, key });
  const sep = () => { if (items.length) { groups.push(items); items = []; } };
  add('播放／停止', '空白');
  add('回到開頭', 'Enter');
  add('前／後一小節', ', .');
  add('錄音', 'R');
  sep();
  add('復原', 'Ctrl+Z');
  add('重做', 'Ctrl+Shift+Z');
  add('剪下', 'Ctrl+X');
  add('複製', 'Ctrl+C');
  add('貼上', 'Ctrl+V');
  add('刪除', 'Del');
  add('選擇全部', 'Ctrl+A');
  add('複製一份片段', 'Ctrl+D');
  add('在播放頭切開', 'Ctrl+T');
  add('微調選取片段', '← →');
  sep();
  add('新專案', 'Ctrl+N');
  add('開啟專案', 'Ctrl+O');
  add('儲存', 'Ctrl+S');
  add('另存新檔', 'Ctrl+Shift+S');
  add('匯入音檔', 'Ctrl+I');
  add('輸出', 'Ctrl+E');
  sep();
  add('節拍器', 'K');
  add('循環區間', 'C');
  add('對齊格線', 'G');
  add('自動化曲線', 'A');
  add('和弦軌', 'H');
  add('段落軌', 'J');
  add('檢閱器', 'I');
  add('混音台', 'X');
  add('鋼琴捲簾', 'P');
  add('母帶', 'Shift+M');
  add('預覽畫面', 'V');
  sep();
  add('這一軌靜音', 'M');
  add('這一軌獨奏', 'S');
  add('換選取軌道', '↑ ↓');
  sep();
  add('MIDI 移調（Shift＝八度）', '[ ]');
  add('電腦鍵盤彈奏', 'Caps Lock');
  add('電腦鍵盤彈奏', 'Ctrl+K');
  add('縮小／放大', '- =');
  add('取消選取／關閉面板', 'Esc');
  sep();
  // 分兩欄：把每個分組依序塞進「目前比較短」的那一欄
  const cols = [[], []];
  const rows = c => c.filter(x => x !== '-').length;
  for (const g of groups) {
    const i = rows(cols[0]) <= rows(cols[1]) ? 0 : 1;
    if (cols[i].length) cols[i].push('-');
    cols[i].push(...g);
  }
  showMenuCols(x, y, cols);
}

function bindEditMenu() {
  $('btnEdit').onclick = e => {
  const r = e.currentTarget.getBoundingClientRect();
  const n = store.selection.clipIds.size;
  showMenu(r.left, r.bottom + 2, [
    { label: '復原', key: 'Ctrl+Z', action: () => store.undo() },
    { label: '重複', key: 'Ctrl+Shift+Z', action: () => store.redo() },
    '-',
    { label: '剪下', key: 'Ctrl+X', disabled: !n, action: cutSelected },
    { label: '複製', key: 'Ctrl+C', disabled: !n, action: copySelected },
    { label: '貼上', key: 'Ctrl+V', disabled: !clipClipboard.length, action: pasteClips },
    '-',
    { label: '刪除', key: 'Del', disabled: !n, action: () => deleteSelected() },
    { label: '選擇全部', key: 'Ctrl+A', action: selectAllClips },
  ]);
};
}

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
      if (k === 'n') return run(fileNew);
      if (k === 's') return run(() => saveProject(e.shiftKey).catch(err => toast(err.message, 'error')));
      if (k === 'o') return run(fileOpen);
      if (k === 'i') return run(() => $('btnImport').click());
      if (k === 'e') return run(openExport);
      if (k === 'z') return run(() => (e.shiftKey ? store.redo() : store.undo()) || toast(e.shiftKey ? '沒有可以重做的動作' : '沒有可以復原的動作'));
      if (k === 'y') return run(() => store.redo());
      if (k === 't') return run(() => splitSelected(engine.currentTime()));
      if (k === 'd') return run(duplicateSelected);
      if (k === 'a') return run(selectAllClips);
      if (k === 'c') return run(copySelected);
      if (k === 'x') return run(cutSelected);
      if (k === 'v') return run(pasteClips);
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
    if (k === 'v') return run(() => toggleVideoPreview());
    if (e.shiftKey && k === 'm') return run(() => toggleMaster());
    if (k === 'a' && !e.shiftKey) return run(() => store.emit('toggle-automation', {}));
    if (k === 'h') return run(() => $('btnChords').click());
    if (k === 'j') return run(() => $('btnSections').click());
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

// 這一軌的移調（MIDI 軌）
function inputVelSection(t) {
  const sec = document.createElement('div'); sec.className = 'sec';
  sec.innerHTML = `<h4 style="margin-top:0">輸入力度 <span style="color:var(--tx2);font-weight:400">（相對）</span></h4>
    <div class="row"><span>偏移</span><input type="range" min="-80" max="80" step="1" id="insVel" style="flex:1"><b id="insVelVal" style="min-width:52px;text-align:right">±0</b></div>
    <div class="row vel-presets">
      <button class="tbtn" data-v="-20">輕 −20</button>
      <button class="tbtn" data-v="0">還原</button>
      <button class="tbtn" data-v="20">重 ＋20</button>
    </div>
    <p class="note">跟 Logic 的 Velocity 一樣是「加減」：彈小力還是小力、彈大力還是大力，只是整體往輕或往重推。錄音與即時試聽都套用。</p>`;
  const r = sec.querySelector('#insVel'), v = sec.querySelector('#insVelVal');
  const show = () => {
    const n = Math.round(t.inputVel || 0);
    v.textContent = (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
    r.value = n;
  };
  show();
  r.addEventListener('input', () => {
    const n = +r.value;
    v.textContent = (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  });
  r.addEventListener('change', () => { store.checkpoint(); t.inputVel = +r.value; show(); store.changed('structure'); });
  r.addEventListener('keydown', e => e.stopPropagation());
  sec.querySelectorAll('.vel-presets .tbtn').forEach(b => {
    b.onclick = () => { store.checkpoint(); t.inputVel = +b.dataset.v; show(); store.changed('structure'); };
  });
  return sec;
}

function transposeSection(t) {
  const sec = document.createElement('div'); sec.className = 'sec';
  sec.innerHTML = `<h4 style="margin-top:0">這一軌移調 <span style="color:var(--tx2);font-weight:400">（播放時）</span></h4>
    <div class="row tr-row">
      <button class="tbtn" data-d="-12" title="降一個八度">−8度</button>
      <button class="tbtn" data-d="-1">−</button>
      <b class="tr-val">0</b>
      <button class="tbtn" data-d="1">＋</button>
      <button class="tbtn" data-d="12" title="升一個八度">＋8度</button>
    </div>
    <p class="note">只影響播放與即時彈奏，音符本身不變；要改寫音符請用鋼琴捲簾或片段升降音。</p>`;
  const val = sec.querySelector('.tr-val');
  const show = () => { val.textContent = (t.transpose > 0 ? '+' : '') + (t.transpose || 0); };
  show();
  sec.querySelectorAll('button[data-d]').forEach(b => {
    b.onclick = () => {
      store.checkpoint();
      t.transpose = Math.max(-24, Math.min(24, (t.transpose || 0) + Number(b.dataset.d)));
      show(); store.changed('structure');
    };
  });
  sec.querySelector('.tr-val').ondblclick = () => { store.checkpoint(); t.transpose = 0; show(); store.changed('structure'); };
  return sec;
}

// 和弦軌（任何軌都可以當參考）
function chordSection(t) {
  const sec = document.createElement('div'); sec.className = 'sec';
  const list = chordsOf();
  const key = chordKeyOf();
  const ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  sec.innerHTML = `<h4 style="margin-top:0">和弦軌</h4>
    <div class="row"><span>已抓</span><span>${list.length ? list.length + ' 個和弦' : '—'}${key ? `　（${ROOTS[key.key]} ${key.minor ? '小調' : '大調'}）` : ''}</span></div>
    <div class="row"><span>顯示</span><select class="ch-view">${VIEW_NAMES.map((n, i) => `<option value="${i}"${(store.project.chordView || 0) === i ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="row"><span>解析度</span><select class="ch-res"><option value="0.5">每半拍</option><option value="1">每一拍</option><option value="2">每兩拍</option><option value="4">每小節</option></select></div>
    <div class="row"><button class="tbtn ch-detect" style="width:100%;height:24px">偵測這條軌的和弦</button></div>
    <div class="row"><button class="tbtn ch-show" style="width:100%;height:24px">${store.project.showChords ? '隱藏和弦軌' : '顯示和弦軌'}</button></div>
    <div class="row"><button class="tbtn" style="flex:1;height:24px" data-apply="harm">套用到和聲</button><button class="tbtn" style="flex:1;height:24px" data-apply="tune">套用到修音</button></div>
    <p class="note">「偵測」會分析這一軌（MIDI 軌最準），抓出每拍的和弦並推測調性。點尺規下方的和弦可以改和弦、換根音、切開或刪除。</p>`;
  const sel = sec.querySelector('.ch-view');
  sel.addEventListener('keydown', e => e.stopPropagation());
  sel.onchange = () => { store.checkpoint(); store.project.chordView = +sel.value; store.changed('structure'); store.emit('chords', {}); };
  const det = sec.querySelector('.ch-detect');
  const res = sec.querySelector('.ch-res');
  res.addEventListener('keydown', e => e.stopPropagation());
  res.value = String(store.project.chordRes || 1);
  res.onchange = () => { store.project.chordRes = +res.value; store.dirty = true; };
  det.onclick = async () => {
    det.disabled = true; det.textContent = '分析中…';
    try { await detectAndApply(t.id, +(res.value) || 1); } finally { det.disabled = false; det.textContent = '偵測這條軌的和弦'; }
  };
  sec.querySelector('.ch-show').onclick = () => { toggleChordLane(); renderArrange(); renderInspector(); };
  sec.querySelector('[data-apply=harm]').onclick = () => applyChordsToHarmony(store.selection.trackId);
  sec.querySelector('[data-apply=tune]').onclick = () => applyChordsToTune(store.selection.trackId);
  return sec;
}

// 段落軌：主歌／副歌的標記，智慧編曲會照著它排段落
function sectionSection() {
  const sec = document.createElement('div'); sec.className = 'sec';
  const list = sectionsOf();
  const names = [...new Set(list.map(s => secName(s.sec)))];
  sec.innerHTML = `<h4 style="margin-top:0">段落軌</h4>
    <div class="row"><span>已標</span><span>${list.length ? list.length + ' 段' : '—'}</span></div>
    ${names.length ? `<div class="row"><span></span><span style="font-size:11px">${names.join('、')}</span></div>` : ''}
    <div class="row"><button class="tbtn sec-show" style="width:100%;height:24px">${store.project.showSections ? '隱藏段落軌' : '顯示段落軌'}</button></div>
    <div class="row"><button class="tbtn sec-clear" style="width:100%;height:24px"${list.length ? '' : ' disabled'}>清除段落</button></div>
    <p class="note">點尺規下方的段落軌新增或改段落（前奏、主歌、導歌、副歌、尾奏…）。② 一鍵編曲會照著段落軌編；沒有段落軌時可以按它的「自動排段落」依和弦樣式排好並寫回來。</p>`;
  sec.querySelector('.sec-show').onclick = () => { toggleSectionLane(); renderArrange(); renderInspector(); };
  sec.querySelector('.sec-clear').onclick = () => {
    if (clearSections()) toast('已清除段落軌（Ctrl+Z 可以復原）');
  };
  return sec;
}

// 裝置設定（音效卡、緩衝區、MIDI）
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
async function openDevices(focus) {
  const d = $('dlgDevices');
  const inSel = d.querySelector('[name=devIn]');
  const outSel = d.querySelector('[name=devOut]');
  const latSel = d.querySelector('[name=lat]');
  const midiOn = d.querySelector('[name=midiOn]');
  const list = d.querySelector('#devMidi');
  latSel.value = localStorage.getItem('daw.latencyHint') || 'interactive';
  midiOn.checked = midiState.midiOn !== false;
  // 錄音輸入
  inSel.innerHTML = '<option value="">預設麥克風</option>';
  try {
    const ins = (await recorder.listInputs()).filter(x => x.deviceId && x.deviceId !== 'default');
    ins.forEach((dev, i) => inSel.insertAdjacentHTML('beforeend', `<option value="${dev.deviceId}">${esc(dev.label || '輸入裝置 ' + (i + 1))}</option>`));
    inSel.value = recorder.deviceId || '';
  } catch (_) { /* 尚未授權 */ }
  // 播放輸出
  outSel.innerHTML = '<option value="">系統預設</option>';
  const canSink = !!(engine.ctx && typeof engine.ctx.setSinkId === 'function') || typeof AudioContext.prototype.setSinkId === 'function';
  try {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'audiooutput');
    outs.forEach((dev, i) => outSel.insertAdjacentHTML('beforeend', `<option value="${dev.deviceId}">${esc(dev.label || '輸出裝置 ' + (i + 1))}</option>`));
    outSel.value = localStorage.getItem('daw.outputId') || '';
  } catch (_) { /* noop */ }
  outSel.disabled = !canSink;
  // MIDI
  try { await initWebMidi(); } catch (_) { /* noop */ }
  const inputs = midiInputs();
  list.innerHTML = inputs.length
    ? inputs.map(x => `<label><input type="checkbox" value="${x.id}"${(!midiState.enabled || midiState.enabled.has(x.id)) ? ' checked' : ''}> ${esc(x.name || '未命名裝置')}</label>`).join('')
    : '<span class="empty">沒有偵測到 MIDI 鍵盤（仍然可以用電腦鍵盤彈奏：Caps Lock）</span>';

  d.showModal();
  // 從「MIDI 設定」進來：捲到 MIDI 那一段
  if (focus === 'midi') d.querySelector('.dev-h')?.scrollIntoView({ block: 'start' });
  d.onclose = async () => {
    if (d.returnValue !== 'ok') return;
    localStorage.setItem('daw.latencyHint', latSel.value);
    const outId = outSel.value;
    localStorage.setItem('daw.outputId', outId);
    if (engine.ctx && typeof engine.ctx.setSinkId === 'function') {
      try { await engine.setOutputDevice(outId); } catch (err) { toast('切換輸出裝置失敗：' + err.message, 'error'); }
    }
    try { await recorder.setDevice(inSel.value); } catch (err) { toast(err.message, 'error'); }
    setMidiEnabled(midiOn.checked);
    const ids = [...list.querySelectorAll('input:checked')].map(x => x.value);
    setEnabledInputs(ids.length === inputs.length ? null : ids);
    toast(latSel.value === (localStorage.getItem('daw.latencyHint') || 'interactive')
      ? '設定已套用（緩衝區在下次開啟音訊引擎時生效）' : '設定已套用');
  };
}

// ---------------- 每幀 ----------------
let tbLive = null;
function tickTopMaster() {
  const el = $('tbLUFS'); if (!el) return;
  if (!(engine.ctx && engine.masterMeter)) return;
  if (!tbLive) tbLive = new LiveLoudness(engine.ctx, engine.masterMeter.aL, engine.masterMeter.aR);
  const r = tbLive.tick(engine.playing);
  $('tbLUFS').textContent = isFinite(r.i) ? r.i.toFixed(1) : '—';
  const lv = engine.masterLevels();
  const pk = lv && isFinite(lv[0]) ? Math.max(lv[0], lv[1]) : 0;
  $('tbMaster').title = `母帶：整合 ${isFinite(r.i) ? r.i.toFixed(1) : '—'} LUFS・峰值 ${pk > 1e-6 ? (20 * Math.log10(pk)).toFixed(1) : '—'} dB（點一下打開母帶視窗）`;
  $('tbGR').textContent = engine.mastering && engine.playing ? engine.mastering.gr().toFixed(1) : '0.0';
  const M = store.project.mastering || {};
  const T = TARGETS.find(x => x.id === (M.target || 'stream')) || TARGETS[0];
  $('tbTarget').textContent = `${T.lufs} LUFS`;
  $('tbLUFS').classList.toggle('hot', isFinite(r.i) && r.i > T.lufs + 1);
  $('tbMaster').classList.toggle('on', !!(M && M.on));
}

function frame() {
  const pos = engine.currentTime();
  const p = store.project;
  $('lcdTime').textContent = fmtTime(pos);
  tickTopMaster();
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
  initVideoPreview();
  initVideoPanel();
  // 下方面板（混音台／鋼琴捲簾／母帶）一次只開一個
  store.on('panel', ({ name }) => {
    if (name && name !== 'mixer' && !$('mixer').classList.contains('hidden')) { showMixer(false); $('btnMixer').classList.remove('on'); }
    if (name && name !== 'pianoroll' && pianoOpen()) closePianoRoll();
    if (name && name !== 'master' && masterOpen()) toggleMaster(false);
    if (name && name !== 'vidpanel' && videoPanelOpen()) toggleVideoPanel(false);
    $('btnPiano').classList.toggle('on', name === 'pianoroll' || pianoOpen());
    requestAnimationFrame(() => renderArrange());
  });
  $('btnMaster').onclick = () => toggleMaster();
  $('btnAlbum').onclick = () => toggleAlbum();
$('btnArranger').onclick = () => toggleArranger();
  // 和弦軌：顯示切換（狀態列／檢閱器會跟著更新）
  $('btnChords').classList.toggle('on', !!store.project.showChords);
  $('btnChords').onclick = () => { toggleChordLane(); $('btnChords').classList.toggle('on', !!store.project.showChords); renderArrange(); };
  store.on('chords', () => {
    $('btnChords').classList.toggle('on', !!store.project.showChords);
    requestAnimationFrame(() => { renderArrange(); renderInspector(); });
  });
  // 段落軌：顯示切換（智慧編曲會照著段落軌編）
  $('btnSections').classList.toggle('on', !!store.project.showSections);
  $('btnSections').onclick = () => { toggleSectionLane(); $('btnSections').classList.toggle('on', !!store.project.showSections); renderArrange(); };
  store.on('sections', () => {
    $('btnSections').classList.toggle('on', !!store.project.showSections);
    requestAnimationFrame(() => { renderArrange(); renderInspector(); });
  });
  // 頂部母帶狀態列：點一下打開母帶視窗
  $('tbMaster').onclick = () => toggleMaster();
  // 裝置設定

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
  // 設定選單：裝置、MIDI、延遲、音色庫、配色（配色直接列在選單裡，目前的打勾）
  $('btnSettings').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect(), cur = currentTheme();
    const nBanks = ($('bankBadge')?.textContent || '').trim();
    showMenu(r.left, r.bottom + 2, [
      { label: '音訊裝置（麥克風輸入、播放輸出、緩衝區）…', action: () => openDevices() },
      { label: 'MIDI 設定（輸入裝置）…', action: () => openDevices('midi') },
      { label: '錄音延遲校正…', action: openLatency },
      '-',
      { label: `音色庫（SoundFont）…${nBanks ? `　已載入 ${nBanks} 個` : ''}`, action: () => $('btnBanks').click() },
      '-',
      { label: '語言 Language', disabled: true },
      { label: (langPref() === 'auto' ? '✓ ' : '　 ') + '自動（非中文語系用英文）', action: () => setLang('auto') },
      { label: (langPref() === 'zh' ? '✓ ' : '　 ') + '中文', action: () => setLang('zh') },
      { label: (langPref() === 'en' ? '✓ ' : '　 ') + 'English', action: () => setLang('en') },
      '-',
      { label: '配色', disabled: true },
      ...THEMES.map(t => ({
        label: (t.id === cur ? '✓ ' : '　 ') + (isEN() ? t.en : t.name),
        swatch: t.sw,
        action: () => setTheme(t.id),
      })),
    ]);
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
  store.on('export-progress', d => { if (!d.done) busy(d.text, d.frac); });
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
  translateDom();          // 非中文語系：整個介面換成英文

  // 除錯／課程截圖用的鉤子（不會影響正常操作）
  window.__daw = { store, engine, view, toggleMixer, togglePiano, toggleMaster, toggleArranger, renderInspector, renderArrange, openPianoRoll, openFxPanel, openBreathPanel };

  // 站上內建的音色庫：背景抓，抓完把示範專案的鋼琴與貝斯換成 GM 音色。
  // 抓不到就維持原本的合成音色，不影響任何功能。
  // 站上的音色庫：鋼琴單獨一份（Salamander 抽稀），其餘靠 GM。
  // 兩份都背景抓，抓不到就維持原本的合成音色，不影響任何功能。
  const pianoLink = document.getElementById('builtinPiano');
  const stringsLink = document.getElementById('builtinStrings');
  const bankLink = document.getElementById('builtinBank');
  const GM = { drums: [0, 0, 128], bass: [33, 0], keys: [0, 0], guitar: [25, 0], strings: [48, 0], arp: [4, 0] };
  (async () => {
    const ids = [];
    for (const [link, label] of [[pianoLink, 'Salamander Piano'], [stringsLink, 'Sonatina Strings'], [bankLink, 'GeneralUser GS']]) {
      if (!link || !link.href) continue;
      try { ids.push(await loadBuiltinBank(link.href, label)); } catch (e) { /* 抓不到就跳過 */ }
    }
    if (!ids.length) return;
    const map = {};
    for (const [part, spec] of Object.entries(GM)) {
      for (const bankId of ids) {                       // 鋼琴庫優先，找不到再找 GM
        const idx = spec.length === 3 ? findProgram(bankId, spec[1], 128) : findProgram(bankId, spec[0], spec[1] || 0);
        if (idx >= 0) { map[part] = sfInstrumentId(bankId, idx); break; }
      }
    }
    window.__dawArrangerInst = map;
    for (const t of store.project.tracks) if (t.arrPart && map[t.arrPart]) t.instrument = map[t.arrPart];
    for (const t of store.project.tracks) {
      if (t.kind !== 'midi' || t.arrPart) continue;
      if (t.name === '鋼琴' && map.keys) t.instrument = map.keys;
      if (t.name === '貝斯' && map.bass) t.instrument = map.bass;
    }
    renderInspector(); renderArrange();
  })();

  // ?demo=1：載入示範專案（課程截圖與第一次試用）。不會覆蓋使用者已存的專案
  if (new URLSearchParams(location.search).has('demo')) {
    try {
      seedDemo();
      renderArrange();
      renderInspector();
      syncTopbar();
    } catch (e) { console.warn('demo failed', e); }
  } else {
    await maybeRestore();
  }
}

boot();
