/* 指版頁的發聲介面：刷弦、單弦、點格子、循環分解。
 *
 * 這支只做「什麼時候該響」，音源在 pluck.js。
 *
 * 三種觸發方式
 *   1. 點指板上的音點 → 那個音
 *   2. 點最左邊的弦名 → 空弦
 *   3. 刷弦鈕 → 由低到高依序撥（選了和弦就刷那個和弦的按法）
 * 循環
 *   每種樂器有自己的常用型（吉他 T1213121、53231323…，烏克麗麗 4321…），
 *   選了和弦就用那組按法當音源，沒選就彈空弦。
 */
(function () {
  'use strict';
  if (!window.Pluck) return;

  var LS_BPM = 'fretboard_play_bpm';
  var LS_VOL = 'fretboard_play_vol';
  var LS_PAT = 'fretboard_play_pattern';

  var bpm = parseInt(localStorage.getItem(LS_BPM) || '80', 10) || 80;
  var vol = localStorage.getItem(LS_VOL);
  vol = vol == null ? 0.8 : parseFloat(vol);
  var lastSpec = null;
  var looping = false;

  // ── 和弦音高 ────────────────────────────────────────────────
  // 回傳長度 = 弦數的陣列，-1 表示那條弦不發聲（索引 0 = 最高音弦）
  function voicingMidis() {
    var inst = INSTRUMENTS_DATA[state.instrument];
    var ts = inst && inst.tunings[state.tuning];
    if (!ts) return [];
    var tm = parseTuning(ts);
    var spec = lastSpec;
    if (spec) {
      var q = (typeof effQ === 'function') ? effQ(spec.q) : spec.q;
      var shape = getChordShape(state.instrument, state.tuning, spec.root, q, spec.bass);
      if (shape && shape.frets) {
        return shape.frets.map(function (f, i) { return f >= 0 ? tm[i] + f : -1; });
      }
    }
    return tm.map(function (m) { return m; });   // 沒選和弦 → 空弦
  }

  function soundingList() {
    return voicingMidis().filter(function (m) { return m >= 0; });
  }

  // token：'T' = 最低音弦；'1'..'6' = 從最高音數下來的第幾弦
  function midiForToken(token) {
    var v = voicingMidis();
    var sound = [];
    for (var i = v.length - 1; i >= 0; i--) if (v[i] >= 0) sound.push(v[i]);  // 低 → 高
    if (!sound.length) return null;
    if (token === 'T') return sound[0];
    if (token === 'H') return sound[sound.length - 1];
    var idx = parseInt(token, 10);
    if (isNaN(idx)) return null;
    var k = sound.length - idx;                 // 第 1 弦 = 最高的那條
    if (k < 0) k = 0;
    if (k >= sound.length) k = sound.length - 1;
    return sound[k];
  }

  // ── 常用型 ─────────────────────────────────────────────────
  function patternsFor(name, n) {
    var s = String(name || '');
    var P = [];
    if (/guitar|吉他/i.test(s) && n >= 6) {
      P.push({ id: 't1213121', label: 'T1213121（民謠分解）',
               steps: ['T', '1', '2', '1', '3', '1', '2', '1'] });
      P.push({ id: '53231323', label: '53231323（經典分解）',
               steps: ['5', '3', '2', '3', '1', '3', '2', '3'] });
      P.push({ id: '43231323', label: '43231323',
               steps: ['4', '3', '2', '3', '1', '3', '2', '3'] });
      P.push({ id: 'bass-alt', label: '低音交替 T-3-T-2',
               steps: ['T', '3', 'T', '2', 'T', '3', 'T', '2'] });
      P.push({ id: 'strum8', label: '8 分刷弦 ↓ ↓↑ ↑ ↓↑', strum: ['D', 'D', 'U', 'U', 'D', 'U'] });
      P.push({ id: 'strum16', label: '16 分刷弦 ↓↓↑ ↓↓↑ ↓↓↑',
               strum: ['D', 'D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D', 'D', 'U'] });
    } else if (/ukulele|烏克/i.test(s)) {
      P.push({ id: 'u4321', label: '4321-321（烏克分解）', steps: ['4', '3', '2', '1', '3', '2', '1'] });
      P.push({ id: 'u4323', label: '4-3-2-3', steps: ['4', '3', '2', '3', '4', '3', '2', '3'] });
      P.push({ id: 'island', label: 'Island 刷法 ↓ ↓↑ ↑ ↓↑', strum: ['D', 'D', 'U', 'U', 'D', 'U'] });
      P.push({ id: 'u-chuck', label: '刷＋切音 ↓ ↓✕ ↑ ✕', strum: ['D', 'D', 'X', 'U', 'X'] });
    } else if (/mandolin|曼陀林|bouzouki|布祖/i.test(s)) {
      P.push({ id: 'trem', label: '輪指（1-2 交替）', steps: ['1', '2', '1', '2', '1', '2', '1', '2'] });
      P.push({ id: 'trem-down', label: '輪指＋低音', steps: ['T', '1', '2', '1', '2', '1', '2', '1'] });
      P.push({ id: 'chop', label: 'Chop 刷法 ↓ ✕ ↓ ✕', strum: ['D', 'X', 'D', 'X'] });
    } else if (/banjo|班卓/i.test(s)) {
      P.push({ id: 'roll', label: 'Roll 5-3-1-2', steps: ['5', '3', '1', '2', '5', '3', '1', '2'] });
      P.push({ id: 'roll2', label: 'Roll 5-1-3-2', steps: ['5', '1', '3', '2', '5', '1', '3', '2'] });
    } else if (/bass|貝斯/i.test(s)) {
      P.push({ id: 'b-root5', label: '根音－五度（T-H-T-H）', steps: ['T', 'H', 'T', 'H'] });
      P.push({ id: 'b-walk', label: '根音循環 T-T-H', steps: ['T', 'T', 'H', 'T'] });
    } else {
      P.push({ id: 'arp-up', label: '分解（低 → 高）', steps: ['T', '2', '3', '4', 'H'] });
      P.push({ id: 'arp-box', label: '循環分解（低 ⇄ 高）', steps: ['T', '2', '3', '2', 'T', '2', '3', '2'] });
    }
    return P;
  }

  // ── 介面 ───────────────────────────────────────────────────
  var bar = null, sel = null, btnLoop = null, bpmInput = null;

  function buildBar() {
    var anchor = document.querySelector('.fretboard-container');
    if (!anchor) return;
    var wrap = document.createElement('div');
    wrap.className = 'pb-bar';
    wrap.innerHTML =
      '<div class="pb-row">' +
        '<button class="pb-btn pb-main" id="pb-strum">▶ 刷弦</button>' +
        '<button class="pb-btn" id="pb-loop">🔁 循環</button>' +
        '<select id="pb-pattern" class="pb-select"></select>' +
        '<label class="pb-field">BPM <input id="pb-bpm" type="number" min="40" max="200" step="1" value="' + bpm + '"></label>' +
        '<label class="pb-field">音量 <input id="pb-vol" type="range" min="0" max="1" step="0.02" value="' + vol + '"></label>' +
        '<span class="pb-hint">點弦或格子也會發聲</span>' +
      '</div>';
    anchor.insertAdjacentElement('beforebegin', wrap);
    bar = wrap;
    sel = wrap.querySelector('#pb-pattern');
    btnLoop = wrap.querySelector('#pb-loop');
    bpmInput = wrap.querySelector('#pb-bpm');

    wrap.querySelector('#pb-strum').addEventListener('click', function () {
      Pluck.ensure();
      doStrum('down');
    });
    btnLoop.addEventListener('click', function () { looping ? stop() : start(); });

    sel.addEventListener('change', function () {
      localStorage.setItem(LS_PAT, sel.value);
      if (looping) { stop(); start(); }
    });
    bpmInput.addEventListener('change', function () {
      bpm = Math.max(40, Math.min(200, parseInt(this.value, 10) || 80));
      this.value = bpm;
      localStorage.setItem(LS_BPM, String(bpm));
      if (looping) { stop(); start(); }
    });
    wrap.querySelector('#pb-vol').addEventListener('input', function () {
      vol = parseFloat(this.value);
      Pluck.setVolume(vol);
      localStorage.setItem(LS_VOL, String(vol));
    });

    Pluck.setVolume(vol);
    refreshPatterns();
  }

  function currentPatterns() {
    var inst = INSTRUMENTS_DATA[state.instrument];
    var ts = inst && inst.tunings[state.tuning];
    var n = ts ? ts.length : 6;
    return patternsFor(inst ? inst.name : '', n);
  }

  function refreshPatterns() {
    if (!sel) return;
    var list = currentPatterns();
    var keep = localStorage.getItem(LS_PAT);
    sel.innerHTML = list.map(function (p) {
      return '<option value="' + p.id + '">' + p.label + '</option>';
    }).join('');
    if (keep && list.some(function (p) { return p.id === keep; })) sel.value = keep;
  }

  function selectedPattern() {
    var list = currentPatterns();
    return list.filter(function (p) { return p.id === sel.value; })[0] || list[0];
  }

  function tone() {
    var inst = INSTRUMENTS_DATA[state.instrument];
    return Pluck.toneFor(inst ? inst.name : '');
  }

  function doStrum(dir) {
    var list = soundingList();
    if (!list.length) return;
    Pluck.strum(list, { dir: dir || 'down', gap: 0.02, tone: tone() });
  }

  function start() {
    var p = selectedPattern();
    if (!p) return;
    looping = true;
    btnLoop.classList.add('playing');
    btnLoop.textContent = '⏹ 停止';
    Pluck.ensure();
    if (p.strum) {
      // 刷法：每個格子 = 八分音符，'X' = 切音（短促、悶掉）
      var seq = p.strum.map(function (c) { return c; });   // 佔位，實際由計時器推
      var idx = 0;
      var beatMs = 60000 / bpm;
      var timer = setInterval(function () {
        var c = seq[idx % seq.length];
        var list = soundingList();
        if (c === 'D') Pluck.strum(list, { dir: 'down', gap: 0.016, tone: tone() });
        else if (c === 'U') {
          var up = list.slice(Math.max(0, Math.floor(list.length / 2)));
          Pluck.strum(up, { dir: 'up', gap: 0.014, gain: 0.85, tone: tone() });
        } else if (c === 'X') {
          var low = list.slice(0, Math.max(1, Math.ceil(list.length / 2)));
          Pluck.strum(low, { dir: 'down', gap: 0.01, gain: 0.5, tone: tone() });
        }
        idx++;
      }, beatMs / 2);
      bar._timer = timer;
    } else {
      Pluck.startLoop(p.steps, { bpm: bpm, tone: tone(), getMidi: midiForToken });
    }
  }

  function stop() {
    looping = false;
    btnLoop.classList.remove('playing');
    btnLoop.textContent = '🔁 循環';
    Pluck.stopLoop();
    if (bar && bar._timer) { clearInterval(bar._timer); bar._timer = null; }
  }

  // ── 點指板 ─────────────────────────────────────────────────
  var W = 800, H = 320, mL = 80, mR = 30, mT = 40, mB = 40;

  function playAt(evt) {
    var svg = document.getElementById('fretboard-svg');
    if (!svg) return;
    var inst = INSTRUMENTS_DATA[state.instrument];
    var ts = inst && inst.tunings[state.tuning];
    if (!ts) return;
    var tm = parseTuning(ts), n = tm.length, fc = state.fretCount;
    var rect = svg.getBoundingClientRect();
    var x = (evt.clientX - rect.left) / rect.width * W;
    var y = (evt.clientY - rect.top) / rect.height * H;
    var fW = (W - mL - mR) / fc;
    var sS = Math.min((H - mT - mB) / (n - 1 || 1), n > 6 ? 28 : (H - mT - mB) / (n - 1 || 1));
    var adjT = (H - sS * (n - 1)) / 2;
    var row = Math.round((y - adjT) / sS);
    if (row < 0 || row >= n) return;
    var s = state.lefty ? row : n - 1 - row;          // 回到資料索引（0 = 最高音弦）
    var fret = 0;
    if (x >= mL) {
      fret = Math.floor((x - mL) / fW) + 1;
      if (fret < 1 || fret > fc) return;
    } else if (x < mL - 26) {
      return;                                          // 太左邊（弦名以外）不處理
    }
    Pluck.ensure();
    Pluck.note(tm[s] + fret, { tone: tone() });
    flash(svg, x, y);
  }

  function flash(svg, x, y) {
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 14);
    c.setAttribute('fill', 'rgba(196,149,106,.45)');
    c.style.pointerEvents = 'none';
    svg.appendChild(c);
    setTimeout(function () { c.remove(); }, 260);
  }

  // 和弦卡上的 ▶ 也改用同一套音源
  function hookChordPlay() {
    if (typeof window.playChordFromSpec !== 'function') return;
    var orig = window.playChordFromSpec;
    window.playChordFromSpec = function (spec) {
      lastSpec = spec;
      var list = soundingList();
      if (!list.length) return orig ? orig(spec) : null;
      Pluck.ensure();
      Pluck.strum(list, { gap: 0.022, tone: tone() });
      return null;
    };
  }

  function init() {
    buildBar();
    hookChordPlay();
    var svg = document.getElementById('fretboard-svg');
    if (svg) svg.addEventListener('click', playAt);
    // 換樂器／調弦時更新循環型
    var instSel = document.getElementById('instrument-select');
    if (instSel) instSel.addEventListener('change', function () { setTimeout(refreshPatterns, 0); });
    document.querySelectorAll('.tuning-item').forEach(function (el) {
      el.addEventListener('click', function () { setTimeout(refreshPatterns, 0); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
