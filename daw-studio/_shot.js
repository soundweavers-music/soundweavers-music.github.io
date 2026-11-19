import { newFx } from './js/effects.js';
import { toggleArranger } from './js/arranger-ui.js';
import { exportAudio } from './js/exporter.js';
import { engine } from './js/engine.js';
import { detectAndApply } from './js/chord-ui.js';
import { importAudioFiles } from './js/project-io.js';
// 課程截圖用：照 ?do= 的指令把介面操作到指定狀態，好了才通知伺服器放行截圖
const P = new URLSearchParams(location.search);
const acts = (P.get('do') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// ── 設定對話框：只改輸出裝置時，提示訊息對不對 ──────────────────
async function runToastTest() {
  const log = [];
  const push = function (m) { log.push(m); window.__shotErr = log.join(' ｜ '); };
  localStorage.setItem('daw.latencyHint', 'interactive');
  document.getElementById('btnSettings').click();
  await sleep(400);
  // 關掉選單再開裝置對話框
  document.body.click();
  await sleep(200);
  const d = document.getElementById('dlgDevices');
  if (!d) { push('找不到裝置對話框'); return; }
  d.showModal();
  await sleep(300);
  const lat = d.querySelector('[name=lat]');
  push('對話框開啟時 lat=' + (lat ? lat.value : 'N/A'));
  if (lat) lat.value = 'interactive';          // 沒有改延遲，只按確定
  const toastEl = document.getElementById('toast');
  const seen = [];
  const mo = new MutationObserver(function () {
    const s = (toastEl.textContent || '').trim();
    if (s && seen.indexOf(s) < 0) seen.push(s);
  });
  if (toastEl) mo.observe(toastEl, { childList: true, characterData: true, subtree: true, attributes: true });
  d.returnValue = 'ok';
  d.close();
  await sleep(3000);
  if (mo) mo.disconnect();
  push('按下確定後跳出的提示：' + (seen.length ? JSON.stringify(seen) : '(沒有抓到)'));
}

// ── 監聽器外漏巡檢：面板開關十次，看 store 上的監聽會不會越疊越多 ──
async function runLeakTest() {
  const E = window.__ERRS, D = window.__daw, st = D.store;
  const log = [];
  const push = function (m) { log.push(m); window.__shotErr = log.join(' ｜ '); };
  const added = {}, removed = {};
  const oa = EventTarget.prototype.addEventListener;
  const orm = EventTarget.prototype.removeEventListener;
  const track = function (self, type, fn, o) {
    if (self === st) {
      added[type] = (added[type] || 0) + 1;
      if (window.__onStore) window.__onStore[type] = (window.__onStore[type] || 0) + 1;
    }
  };
  EventTarget.prototype.addEventListener = function (type, fn, o) { track(this, type); return oa.call(this, type, fn, o); };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    if (this === st) removed[type] = (removed[type] || 0) + 1;
    return orm.call(this, type, fn, o);
  };
  window.__onStore = {};
  const base = Object.assign({}, window.__onStore);

  const cycle = async function (fn, times) {
    for (let i = 0; i < times; i++) { await fn(); await sleep(80); }
  };
  const N = 30;
  await cycle(function () { document.getElementById('btnMixer').click(); }, N);
  await cycle(function () { document.getElementById('btnMaster').click(); }, N);
  await cycle(function () { D.toggleArranger(true); D.toggleArranger(false); }, N / 2);
  const midiClip = st.project.tracks.reduce(function (a, x) { return a || (x.clips || []).find(function (c) { return c.notes; }); }, null);
  if (midiClip) await cycle(function () { D.openPianoRoll(midiClip.id); }, 20);

  const diff = {};
  for (const k in window.__onStore) {
    const d = window.__onStore[k] - (base[k] || 0);
    if (d) diff[k] = d;
  }
  push(N + ' 次開關後新增在 store 上的監聽：' + (Object.keys(diff).length ? JSON.stringify(diff) : '沒有'));
  push('移除：' + (Object.keys(removed).length ? JSON.stringify(removed) : '沒有'));
  EventTarget.prototype.addEventListener = oa;
  EventTarget.prototype.removeEventListener = orm;
  push('完成');
}

// ── 功能巡檢：抓和弦、升降音、母帶最佳化 ────────────────────────
async function runFeatureTest() {
  const E = window.__ERRS, D = window.__daw, st = D.store;
  const log = [];
  const push = function (m) { log.push(m); window.__shotErr = log.join(' ｜ '); };
  const timed = async function (label, ms, fn) {
    const t0 = Date.now();
    const out = await Promise.race([
      Promise.resolve().then(fn).then(function (v) { return 'ok(' + v + ')'; },
                                    function (e) { return 'reject: ' + e.message; }),
      sleep(ms).then(function () { return 'TIMEOUT'; }),
    ]);
    push(label + ' => ' + out + ' ' + (Math.round((Date.now() - t0) / 100) / 10) + 's');
    return out;
  };

  // 1) 抓和弦（會分析整條軌的音高分布）
  const midiTrack = st.project.tracks.find(function (x) { return x.kind === 'midi' && x.clips.length; });
  if (midiTrack) {
    await timed('抓和弦', 40000, function () {
      return detectAndApply(midiTrack.id, 1).then(function (r) { return r ? r.chords.length + ' 個' : 'null'; });
    });
    push('　抓到 ' + (st.project.chords || []).length + ' 個和弦，調性=' +
         JSON.stringify(st.project.chordKey));
  } else push('沒有 MIDI 軌可測');

  // 2) 匯入一個自己生的 WAV（示範專案沒有音訊軌，這條路平常沒被走過）
  const makeWav = function (sec, sr) {
    const n = Math.floor(sec * sr), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = function (o, s) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 16384, true);
    return new File([b], 'probe.wav', { type: 'audio/wav' });
  };
  const before = st.project.tracks.length;
  await timed('匯入 WAV', 20000, function () {
    return importAudioFiles([makeWav(1.5, 44100)], null, 0).then(function () {
      const at = st.project.tracks.filter(function (x) { return x.kind === 'audio'; });
      return '音訊軌 ' + at.length + ' 條、片段 ' + at.reduce(function (a, x) { return a + x.clips.length; }, 0);
    });
  });
  push('　軌道 ' + before + ' → ' + st.project.tracks.length);

  // 3) 片段升降音（會重算整個 buffer）
  const clip = st.project.tracks.reduce(function (a, x) {
    return a || x.clips.find(function (c) { return c.bufferId; });
  }, null);
  if (clip) {
    await timed('升降音 +2 半音', 40000, function () {
      return new Promise(function (res) {
        st.emit('open-pitch', { clipIds: [clip.id] });
        setTimeout(function () {
          const d = document.getElementById('dlgPitch');
          if (!d || !d.open) { res('沒有開對話框'); return; }
          d.querySelector('[name=semis]').value = '2';
          d.returnValue = 'ok';
          d.close();
          setTimeout(function () { res('已送出'); }, 2500);
        }, 250);
      });
    });
  } else push('沒有音訊片段可測升降音');

  push('完成');
}

// ── 邊界巡檢：加軌道的成本、縮放極值 ───────────────────────────
async function runLimitTest() {
  const E = window.__ERRS, D = window.__daw, st = D.store;
  const log = [];
  const push = function (m) { log.push(m); window.__shotErr = log.join(' ｜ '); };
  const t0 = Date.now();
  let added = 0;
  for (let i = 0; i < 10 && st.addTrack('audio'); i++) added++;
  const t10 = Date.now() - t0;
  push('前 10 條：' + (t10 / Math.max(added, 1)).toFixed(0) + ' ms/條');
  const t1 = Date.now();
  let added2 = 0;
  for (let i = 0; i < 10 && st.addTrack('audio'); i++) added2++;
  const t20 = Date.now() - t1;
  push('第 11–20 條：' + (t20 / Math.max(added2, 1)).toFixed(0) + ' ms/條，共 ' + st.project.tracks.length + ' 條');
  if (t20 / Math.max(added2, 1) > 4 * (t10 / Math.max(added, 1)) + 20) push('!! 加軌道越後面越慢');
  const t2 = Date.now();
  for (let i = 0; i < added + added2; i++) st.undo();
  push('復原 ' + (added + added2) + ' 次：' + (Date.now() - t2) + ' ms，剩 ' + st.project.tracks.length + ' 條');
  // 全部刪掉再復原（使用者真的會這樣做）
  const n = st.project.tracks.length;
  const t3 = Date.now();
  for (let i = 0; i < n; i++) st.removeTrack(st.project.tracks[0].id);
  push('刪光 ' + n + ' 條：' + (Date.now() - t3) + ' ms，剩 ' + st.project.tracks.length +
       ' 條，selection=' + st.selection.trackId);
  const t4 = Date.now();
  D.renderInspector(); D.renderArrange();
  push('空專案重繪：' + (Date.now() - t4) + ' ms');
  const t5 = Date.now();
  for (let i = 0; i < n; i++) st.undo();
  push('全部復原：' + (Date.now() - t5) + ' ms，剩 ' + st.project.tracks.length + ' 條');
  const t6 = Date.now();
  D.renderInspector(); D.renderArrange();
  push('復原後重繪：' + (Date.now() - t6) + ' ms');
  push('完成');
}

// ── 拖曳巡檢

// ── 拖曳巡檢：片段的像素→拍換算對不對 ──────────────────────────
async function runDragTest() {
  const E = window.__ERRS, D = window.__daw, st = D.store;
  const V = D.view;
  const log = [];
  const push = function (m) { log.push(m); window.__shotErr = log.join(' ｜ '); };
  const clipOf = function () {
    for (const tr of st.project.tracks) for (const c of tr.clips) if (c.notes || c.bufferId) return { tr: tr, c: c };
    return null;
  };
  const first = clipOf();
  if (!first) { push('沒有片段可以拖'); return; }
  const el = document.querySelector('.clip');
  if (!el) { push('找不到 .clip 元素'); return; }
  const r = el.getBoundingClientRect();
  const startOf = function (c) { return c.notes ? c.startBeat : c.start; };
  const before = startOf(first.c);
  const px = 120;
  const beatSec = 60 / st.project.bpm;
  const expectBeat = px * beatSec / V.pxPerBeat / beatSec;   // = px / pxPerBeat
  const x0 = r.left + 30, y0 = r.top + r.height / 2;
  const pd = function (type, x, y, on) {
    (on || el).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
      pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: x, clientY: y, pointerType: 'mouse' }));
  };
  pd('pointerdown', x0, y0);
  await sleep(60);
  pd('pointermove', x0 + px / 2, y0, window);
  await sleep(60);
  pd('pointermove', x0 + px, y0, window);
  await sleep(60);
  pd('pointerup', x0 + px, y0, window);
  await sleep(400);
  const after = startOf(first.c);
  const moved = first.c.notes ? (after - before) : (after - before) / beatSec;
  push('drag ' + px + 'px → 移動 ' + moved.toFixed(2) + ' 拍（預期 ' + expectBeat.toFixed(2) +
       '，snap=' + st.project.snap + '）');
  if (Math.abs(moved) < 1e-6) push('!! 片段完全沒有移動');
  else if (Math.abs(moved - expectBeat) > 1.01) push('!! 移動量與預期差太多');
}

// ── 輸出巡檢

// ── 輸出巡檢：離線算圖會不會卡住 ────────────────────────────────
async function runExportTest() {
  const E = window.__ERRS;
  const LOG = [];
  const post = function (msg) {
    LOG.push(msg);
    const all = LOG.join(' ｜ ');
    window.__shotErr = all;
    fetch('/__RECTS__', { method: 'POST',
      body: JSON.stringify({ __errors: [E], __shotErr: [[all]] }) }).catch(function () {});
  };
  const timed = async function (label, ms, fn) {
    const t0 = Date.now();
    const out = await Promise.race([
      Promise.resolve().then(fn).then(function (v) { return 'ok ' + v; },
                                    function (e) { return 'reject: ' + e.message; }),
      sleep(ms).then(function () { return 'TIMEOUT'; }),
    ]);
    post(label + ' => ' + out + ' (' + Math.round((Date.now() - t0) / 100) / 10 + 's)');
    return String(out).indexOf('ok') === 0;
  };
  await timed('ensure', 10000, function () { return engine.ensure(); });
  const full = window.__daw.store.projectEnd();
  post('projectEnd = ' + full.toFixed(1) + 's');
  await timed('render 4s', 20000, function () { return engine.render({ start: 0, end: 4, tail: 0.2 }).then(function (b) { return b.length; }); });
  await timed('render 4s no-masterfx', 20000, function () { return engine.render({ start: 0, end: 4, tail: 0.2, masterFx: false, mastering: { on: false } }).then(function (b) { return b.length; }); });
  const pj = window.__daw.store.project;
  const savedIns = pj.tracks.map(function (x) { return x.inserts; });
  pj.tracks.forEach(function (x) { x.inserts = []; });
  await timed('render 4s no-inserts', 20000, function () { return engine.render({ start: 0, end: 4, tail: 0.2, masterFx: false, mastering: { on: false } }).then(function (b) { return b.length; }); });
  pj.tracks.forEach(function (x, i) { x.inserts = savedIns[i]; });
  await timed('foreground 4s (即時播放)', 20000, async function () {
    const t1 = Date.now();
    await new Promise(function (r) { setTimeout(r, 4000); });
    return 'waited ' + (Date.now() - t1);
  });
  post('done');
}

// ── 互動巡檢：每一個會改專案的操作做完都要能復原 ────────────────────
async function runUndoTest() {
  const E = window.__ERRS;
  const D = window.__daw, st = D.store;
  const snap = function () { return JSON.stringify(st.project); };
  const names = function (s) { try { return JSON.parse(s).tracks.map(function (x) { return x.id; }); } catch (e) { return []; } };
  const check = function (label, ok, extra) {
    if (!ok) E.push('UNDO-FAIL ' + label + (extra ? ' — ' + extra : ''));
  };

  // 1) 新增軌道 → 復原
  const a = snap();
  st.addTrack('audio');
  check('addTrack 沒有改變專案', snap() !== a);
  st.undo();
  check('addTrack 之後 undo 回不到原狀', snap() === a, 'tracks=' + names(snap()).length + ' vs ' + names(a).length);
  st.redo();
  check('addTrack 之後 redo 沒有回來', snap() !== a);
  st.undo();

  // 2) 刪除軌道 → 復原
  const before = st.project.tracks.length;
  st.removeTrack(st.project.tracks[0].id);
  check('removeTrack 沒有改變專案', st.project.tracks.length === before - 1);
  st.undo();
  check('removeTrack 之後 undo 回不到原狀', st.project.tracks.length === before,
        'tracks=' + st.project.tracks.length + ' 應該是 ' + before);

  // 3) 連續兩次操作，兩次復原
  const b = snap();
  st.addTrack('audio'); st.addTrack('midi');
  st.undo(); st.undo();
  check('兩次 addTrack 之後兩次 undo 回不到原狀', snap() === b);

  // 4) 復原到極限不應該爆
  for (let i = 0; i < 120; i++) st.undo();
  check('連按 120 次復原之後專案變空', st.project.tracks.length > 0);
  for (let i = 0; i < 120; i++) st.redo();
  check('連按 120 次重做之後專案變空', st.project.tracks.length > 0);

  // 5) 復原之後 selection 還指著存在的軌道嗎
  const sel = st.selection.trackId;
  check('selection 指向不存在的軌道', sel === null || !!st.track(sel), 'trackId=' + sel);
  window.__shotErr = 'undo-test done';
}

// ── 全介面巡檢：把每個面板／對話框／效果器都開一次，收集錯誤 ──────────
async function runTour(limit) {
  const E = window.__ERRS;
  const D = window.__daw;
  const tracks = D.store.project.tracks;
  const midiClip = tracks.reduce(function (a, x) {
    return a || (x.clips || []).find(function (c) { return c.notes; });
  }, null);
  const click = function (id) {
    const el = document.getElementById(id);
    if (!el) { E.push('missing element #' + id); return; }
    el.click();
  };
  const closeDlg = function (id) {
    const d = document.getElementById(id);
    if (d && d.open) d.close();
  };
  const S = [];
  const add = function (name, fn) { S.push([name, fn]); };

  add('panel-mixer', function () { click('btnMixer'); });
  add('panel-mixer-close', function () { click('btnMixer'); });
  add('panel-master', function () { click('btnMaster'); });
  add('panel-master-close', function () { click('btnMaster'); });
  add('panel-arranger', function () { D.toggleArranger(true); });
  add('panel-arranger-close', function () { D.toggleArranger(false); });
  add('panel-album', function () { click('btnAlbum'); });
  add('panel-album-close', function () { click('btnAlbum'); });
  add('panel-piano', function () { if (midiClip) D.openPianoRoll(midiClip.id); });
  add('panel-piano-close', function () { if (midiClip) D.openPianoRoll(midiClip.id); });
  add('panel-inspector', function () { click('btnInspector'); });
  add('panel-inspector-back', function () { click('btnInspector'); });
  add('dlg-export', function () { click('btnExport'); });
  add('dlg-export-close', function () { closeDlg('dlgExport'); });
  add('dlg-banks', function () { click('btnBanks'); });
  add('dlg-banks-close', function () { closeDlg('dlgBanks'); });
  add('dlg-settings', function () { click('btnSettings'); });
  add('dlg-settings-close', function () { closeDlg('dlgSettings'); });
  add('dlg-devices', function () { click('btnLearn'); });
  add('dlg-devices-close', function () { closeDlg('dlgDevices'); });
  add('dlg-file', function () { click('btnFile'); });
  add('dlg-file-close', function () {
    document.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); });
  });
  add('toggle-auto', function () { click('btnAuto'); });
  add('toggle-auto-off', function () { click('btnAuto'); });
  add('toggle-chords', function () { click('btnChords'); });
  add('toggle-chords-off', function () { click('btnChords'); });
  add('toggle-metro', function () { click('btnMetro'); });
  add('toggle-snap', function () { click('btnSnap'); });
  add('toggle-typing', function () { click('btnTyping'); });
  add('zoom', function () { click('btnZoomIn'); click('btnZoomIn'); click('btnZoomOut'); });
  add('fx-slots', function () {
    document.querySelectorAll('#inspector .fx-slot').forEach(function (s) { s.click(); });
  });
  add('fx-drag-close', function () {
    document.querySelectorAll('.fx-panel .fx-x').forEach(function (b) { b.click(); });
  });
  add('fx-open-all-types', function () {
    const D2 = window.__daw;
    const tr = D2.store.project.tracks[0];
    if (!tr) return;
    ['eq', 'comp', 'tune', 'reverb', 'harm'].forEach(function (kind, i) {
      try { D2.openFxPanel(tr.id, tr.inserts && tr.inserts[i] ? tr.inserts[i].id : null); } catch (e) {}
    });
  });
  add('track-add', function () { click('btnAddTrack'); });
  add('track-add-midi', function () { click('btnAddMidi'); });
  add('play', function () { click('btnPlay'); });
  add('play-stop', function () { click('btnStop'); });
  add('select-tracks', function () {
    document.querySelectorAll('#headersInner .thead').forEach(function (h) {
      h.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
  });

  const n = limit > 0 ? Math.min(limit, S.length) : S.length;
  for (let i = 0; i < n; i++) {
    const name = S[i][0], fn = S[i][1], n0 = E.length;
    try { await fn(); } catch (e) {
      E.push('THROW ' + name + ': ' + ((e && (e.stack || e.message)) || String(e)));
    }
    await sleep(300);
    for (let k = n0; k < E.length; k++) E[k] = '[' + name + '] ' + E[k];
  }
  window.__shotErr = 'tour steps=' + n + '/' + S.length;
}


const LATE = [];
const waitFor = async function (fn, ms) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > (ms || 10000)) return false; await sleep(60); }
  return true;
};
await waitFor(function () { return !!window.__daw; });
await waitFor(function () { return document.querySelectorAll('#lanes .clip-row, #lanes canvas, .clip').length > 0; }, 15000);
await waitFor(function () { return document.querySelectorAll('#headersInner .thead').length > 0; }, 15000);
await sleep(700);
for (const a of acts) {
  const parts = a.split(':');
  const key = parts[0], arg = parts.slice(1);
  try {
    if (key === 'tour') await runTour(Number(arg[0] || 0));
    else if (key === 'toasttest') await runToastTest();
    else if (key === 'leaktest') await runLeakTest();
    else if (key === 'featuretest') await runFeatureTest();
    else if (key === 'limittest') await runLimitTest();
    else if (key === 'dragtest') await runDragTest();
    else if (key === 'exporttest') await runExportTest();
    else if (key === 'undotest') await runUndoTest();
    else if (key === 'selftest') { console.warn('probe-warn'); setTimeout(function () { throw new Error('collector-selftest'); }, 0); await sleep(400); }
    else if (key === 'click') document.getElementById(arg[0]) && document.getElementById(arg[0]).click();
    else if (key === 'dlg') { const d = document.getElementById(arg[0]); if (d && d.showModal) d.showModal(); }
    else if (key === 'track') {        // 選第 N 條軌道（0 起算）
      const heads = document.querySelectorAll('#headersInner .track-head');
      const h = heads[Number(arg[0] || 0)];
      if (h) h.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      if (h) h.click();
    }
    else if (key === 'fx') {
      const slots = document.querySelectorAll('#inspector .fx-slot');
      const i = Number(arg[0] || 0);
      if (slots[i]) slots[i].click();
    }
    else if (key === 'clicktext') {
      const re = new RegExp(arg.join(':'));
      const el = Array.from(document.querySelectorAll('#inspector .fx-slot, .track-head, button'))
        .find(function (e) { return re.test(e.textContent); });
      if (el) el.click();
    }
    else if (key === 'fx2') {          // 暫時掛一個效果器並打開它的面板
      const t = window.__daw.store.project.tracks[Number(arg[1] || 0)];
      const fx = newFx(arg[0]);        // 預設參數才不會顯示 NaN
      t.inserts.push(fx);
      window.__daw.store.changed('fx');
      window.__daw.openFxPanel(t.id, fx.id);
    }
    else if (key === 'wait') await sleep(Number(arg[0]));
    else if (key === 'eval') { const js = decodeURIComponent(arg.join(':'));
      const fn = function () { (0, eval)(js); }; fn(); LATE.push(fn); }
    else if (key === 'piano') {
      const tr = window.__daw.store.project.tracks;
      const cl = tr.reduce(function (a, x) { return a || (x.clips || []).find(function (c) { return c.notes; }); }, null);
      if (cl) window.__daw.openPianoRoll(cl.id); }
    else if (key === 'arr') toggleArranger(arg[0] === 'off' ? false : true);
    else if (key === 'lclick') { const id = arg[0];
      LATE.push(function () { const el = document.getElementById(id); if (el) el.click(); }); }
    else if (key === 'scroll') { const sel = arg[0], px = Number(arg[1] || 0);
      const fn2 = function () { const el = document.querySelector(sel); if (el) el.scrollTop = px; };
      fn2(); LATE.push(fn2); }
  } catch (e) { window.__shotErr = (window.__shotErr || '') + a + ' => ' + (e.stack || e.message) + ' || ';
    console.warn('shot action failed', a, e); }
  await sleep(420);
}
await sleep(350);
// 介面重繪會把捲動位置歸零，量座標前再套一次
for (const fn of LATE) { try { fn(); } catch (e) {} }
await sleep(200);
// 把畫面元素的位置回報給截圖腳本，標註框才不會用寫死的座標
try {
  const sels = (P.get('rects') || '').split('|').filter(Boolean);
  const out = {};
  out.__errors = [window.__ERRS || []];
  out.__shotErr = [[window.__shotErr || '']];
  out.__viewport = [[window.innerWidth, window.innerHeight,
                     document.documentElement.scrollHeight, document.body.clientHeight]];
  for (const sel of sels) {
    out[sel] = Array.from(document.querySelectorAll(sel)).slice(0, 8).map(function (el) {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    });
  }
  await fetch('/__RECTS__', { method: 'POST', body: JSON.stringify(out) });
} catch (e) { console.warn('rects failed', e); }
document.documentElement.setAttribute('data-shot-ready', '1');
fetch('/__READY__').catch(function () {});
