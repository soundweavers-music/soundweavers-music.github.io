import { newFx } from './js/effects.js';
import { toggleArranger } from './js/arranger-ui.js';
import { exportAudio } from './js/exporter.js';
import { engine } from './js/engine.js';
// 課程截圖用：照 ?do= 的指令把介面操作到指定狀態，好了才通知伺服器放行截圖
const P = new URLSearchParams(location.search);
const acts = (P.get('do') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// ── 邊界巡檢：軌道上限、縮放極值、空專案 ─────────────────────────
async function runLimitTest() {
  const E = window.__ERRS, D = window.__daw, st = D.store;
  const log = [];
  const push = function (m) { log.push(m); window.__shotErr = log.join(' ｜ '); };

  // 1) 加到上限
  let added = 0, guard = 0;
  while (st.addTrack('audio') && guard++ < 100) added++;
  push('加到上限：新增 ' + added + ' 條，現在 ' + st.project.tracks.length + ' 條');
  if (st.project.tracks.length > 32) push('!! 超過 MAX_TRACKS');
  const nullTry = st.addTrack('midi');
  if (nullTry) push('!! 已達上限卻還能新增');

  // 2) 全部復原
  for (let i = 0; i < added + 2; i++) st.undo();
  push('復原後 ' + st.project.tracks.length + ' 條');

  // 3) 縮放極值
  for (const z of [0, 1, 4, 640, 5000, -5]) {
    D.view.pxPerBeat = z;
    st.emit('zoom', {});
    await sleep(120);
    const lanesEl = document.getElementById('lanesInner');
    const w = lanesEl ? lanesEl.getBoundingClientRect().width : -1;
    if (!isFinite(w) || w <= 0) push('!! 縮放 ' + z + ' 時寬度是 ' + w);
  }
  D.view.pxPerBeat = 40;
  st.emit('zoom', {});

  // 4) 空專案：全部刪掉再復原
  const n = st.project.tracks.length;
  for (let i = 0; i < n; i++) st.removeTrack(st.project.tracks[0].id);
  push('刪光後 ' + st.project.tracks.length + ' 條，selection=' + st.selection.trackId);
  D.renderInspector(); D.renderArrange();
  await sleep(200);
  for (let i = 0; i < n; i++) st.undo();
  push('復原後 ' + st.project.tracks.length + ' 條');
  D.renderInspector(); D.renderArrange();
  await sleep(200);
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
    else if (key === 'limittest') await runLimitTest();
    else if (key === 'dragtest') await runDragTest();
    else if (key === 'exporttest') await runExportTest();
    else if (key === 'undotest') await runUndoTest();
    else if (key === 'selftest') { setTimeout(function () { throw new Error('collector-selftest'); }, 0); await sleep(400); }
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
