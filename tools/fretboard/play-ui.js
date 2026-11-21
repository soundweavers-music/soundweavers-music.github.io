/* 指版頁的發聲介面。
 *
 * 音源在 pluck.js，這支只決定「什麼時候該響、響哪一個音」。
 *
 * 三個地方會發聲
 *   1. 上面的指版：點格子 → 那個音；點弦名 → 空弦
 *   2. 下面的和弦圖表：點某一條弦 → 那個和弦在該弦上的音；點圖的空白處 → 刷這個和弦
 *   3. 循環：跟著「你最後碰的那張和弦圖」跑，換和弦圖就換和弦
 *
 * 手指記號（T/i/m/a）與弦號（1–6）是兩套不同的寫法：
 *   53231323 是弦號；T1213121 是手指——1=食指(第3弦)、2=中指(第2弦)、3=無名指(第1弦)。
 *   這兩套混用是「聽起來音高不對」最常見的原因。
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

  var currentMidis = [];      // 最後碰的那張和弦圖（低 → 高）
  var currentLabel = '';
  var looping = false;
  var bar = null, sel = null, btnLoop = null, bpmInput = null;

  function tone() {
    var inst = INSTRUMENTS_DATA[state.instrument];
    return Pluck.toneFor(inst ? inst.name : '');
  }

  // ── 指版上的音高 ────────────────────────────────────────────
  function tuningMidis() {
    var inst = INSTRUMENTS_DATA[state.instrument];
    var ts = inst && inst.tunings[state.tuning];
    return ts ? parseTuning(ts) : [];
  }

  // 空弦（低 → 高），沒有選和弦時循環用它
  function openMidis() {
    return tuningMidis().filter(function (m) { return m >= 0; }).slice().reverse();
  }

  // ── 循環型 ─────────────────────────────────────────────────
  // 每一格 = 一個八分音符；'-' 是空拍，'X' 是切音
  function patternsFor(name, n) {
    var s = String(name || '');
    var P = [];
    if (/guitar|吉他/i.test(s) && n >= 6) {
      P.push({ id: 't1213121', label: 'T1213121（民謠分解）',
               steps: ['T', 'i', 'm', 'i', 'a', 'i', 'm', 'i'] });
      P.push({ id: '53231323', label: '53231323（經典分解）',
               steps: ['5', '3', '2', '3', '1', '3', '2', '3'] });
      P.push({ id: '43231323', label: '43231323',
               steps: ['4', '3', '2', '3', '1', '3', '2', '3'] });
      P.push({ id: 'bass-alt', label: '低音交替 T-3-T-2',
               steps: ['T', '3', 'T', '2', 'T', '3', 'T', '2'] });
      P.push({ id: 'strum8', label: '8 分刷弦 ↓ ↓↑ ↑ ↓↑',
               strum: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'] });
      P.push({ id: 'strum16', label: '16 分刷弦 ↓ ↓↑ ↑ ↓↑ ×2',
               strum: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U',
                       'D', '-', 'D', 'U', '-', 'U', 'D', 'U'] });
    } else if (/ukulele|烏克/i.test(s)) {
      P.push({ id: 'u4321', label: '4321（烏克分解）', steps: ['4', '3', '2', '1', '2', '3', '2', '1'] });
      P.push({ id: 'u4323', label: '4-3-2-3', steps: ['4', '3', '2', '3', '4', '3', '2', '3'] });
      P.push({ id: 'island', label: 'Island 刷法 ↓ ↓↑ ↑ ↓↑',
               strum: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'] });
      P.push({ id: 'u-chuck', label: '刷＋切音 ↓ - X - U - X -',
               strum: ['D', '-', 'X', '-', 'U', '-', 'X', '-'] });
    } else if (/mandolin|曼陀林|bouzouki|布祖/i.test(s)) {
      P.push({ id: 'trem', label: '輪指（1-2 交替）', steps: ['1', '2', '1', '2', '1', '2', '1', '2'] });
      P.push({ id: 'trem-down', label: '輪指＋低音', steps: ['T', '1', '2', '1', '2', '1', '2', '1'] });
      P.push({ id: 'chop', label: 'Chop 刷法 ↓ - X - ↓ - X -',
               strum: ['D', '-', 'X', '-', 'D', '-', 'X', '-'] });
    } else if (/banjo|班卓/i.test(s)) {
      P.push({ id: 'roll', label: 'Roll 5-3-1-2', steps: ['5', '3', '1', '2', '5', '3', '1', '2'] });
      P.push({ id: 'roll2', label: 'Roll 5-1-3-2', steps: ['5', '1', '3', '2', '5', '1', '3', '2'] });
    } else if (/bass|貝斯/i.test(s)) {
      P.push({ id: 'b-root5', label: '根音－五度（T-H-T-H）', steps: ['T', 'H', 'T', 'H'] });
      P.push({ id: 'b-walk', label: '根音循環 T-T-H', steps: ['T', 'T', 'H', 'T'] });
    } else {
      P.push({ id: 'arp-up', label: '分解（低 → 高）', steps: ['T', 'i', 'm', 'a', 'H'] });
      P.push({ id: 'arp-box', label: '循環分解（低 ⇄ 高）', steps: ['T', 'i', 'm', 'i', 'T', 'i', 'm', 'i'] });
    }
    return P;
  }

  // token → 實際音高（用目前這張和弦圖的按法）
  function midiForToken(token) {
    var list = currentMidis.length ? currentMidis : openMidis();
    if (!list.length) return null;
    if (token === 'T') return list[0];                       // 低音弦
    if (token === 'H') return list[list.length - 1];         // 最高音弦
    var s = String(token);
    var FINGER = { i: 3, m: 2, a: 1, p: 1 };                 // 手指 → 第幾弦
    var num = FINGER[s] || parseInt(s, 10);
    if (!num || isNaN(num)) return null;
    var k = list.length - num;                               // 第 1 弦 = 最高
    if (k < 0) k = 0;
    if (k >= list.length) k = list.length - 1;
    return list[k];
  }

  // ── 介面 ───────────────────────────────────────────────────
  function buildBar() {
    var tabs = document.querySelector('.cc-tabs');
    if (!tabs) return;
    var wrap = document.createElement('div');
    wrap.className = 'pb-bar';
    wrap.innerHTML =
      '<div class="pb-row">' +
        '<button class="pb-btn pb-main" id="pb-strum">▶ 刷弦</button>' +
        '<button class="pb-btn" id="pb-loop">🔁 循環</button>' +
        '<select id="pb-pattern" class="pb-select"></select>' +
        '<label class="pb-field">BPM <input id="pb-bpm" type="number" min="40" max="200" step="1" value="' + bpm + '"></label>' +
        '<label class="pb-field">音量 <input id="pb-vol" type="range" min="0" max="1" step="0.02" value="' + vol + '"></label>' +
        '<span class="pb-hint" id="pb-what">點下面任一張和弦圖的弦就會發聲</span>' +
      '</div>';
    tabs.insertAdjacentElement('beforebegin', wrap);
    bar = wrap;
    sel = wrap.querySelector('#pb-pattern');
    btnLoop = wrap.querySelector('#pb-loop');
    bpmInput = wrap.querySelector('#pb-bpm');

    wrap.querySelector('#pb-strum').addEventListener('click', function () {
      Pluck.ensure();
      var list = currentMidis.length ? currentMidis : openMidis();
      Pluck.strum(list, { gap: 0.02, tone: tone() });
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

  function refreshPatterns() {
    if (!sel) return;
    var inst = INSTRUMENTS_DATA[state.instrument];
    var ts = inst && inst.tunings[state.tuning];
    var list = patternsFor(inst ? inst.name : '', ts ? ts.length : 6);
    var keep = localStorage.getItem(LS_PAT);
    sel.innerHTML = list.map(function (p) {
      return '<option value="' + p.id + '">' + p.label + '</option>';
    }).join('');
    if (keep && list.some(function (p) { return p.id === keep; })) sel.value = keep;
  }

  function selectedPattern() {
    var inst = INSTRUMENTS_DATA[state.instrument];
    var ts = inst && inst.tunings[state.tuning];
    var list = patternsFor(inst ? inst.name : '', ts ? ts.length : 6);
    return list.filter(function (p) { return p.id === sel.value; })[0] || list[0];
  }

  function setCurrent(midis, label) {
    currentMidis = (midis || []).filter(function (m) { return m >= 0; });
    if (label) {
      currentLabel = label;
      var what = document.getElementById('pb-what');
      if (what) what.textContent = '循環／刷弦套用在：' + label;
    }
  }

  function start() {
    var p = selectedPattern();
    if (!p) return;
    looping = true;
    btnLoop.classList.add('playing');
    btnLoop.textContent = '⏹ 停止';
    Pluck.ensure();
    if (p.strum) {
      var steps = p.strum;
      var i = 0;
      var beatMs = 60000 / bpm;
      bar._timer = setInterval(function () {
        var c = steps[i % steps.length];
        var list = currentMidis.length ? currentMidis : openMidis();
        if (c === 'D') Pluck.strum(list, { gap: 0.016, tone: tone() });
        else if (c === 'U') {
          var up = list.slice(Math.max(0, Math.floor(list.length / 2)));
          Pluck.strum(up, { dir: 'up', gap: 0.014, gain: 0.85, tone: tone() });
        } else if (c === 'X') {
          var low = list.slice(0, Math.max(1, Math.ceil(list.length / 2)));
          Pluck.strum(low, { gap: 0.01, gain: 0.45, tone: tone() });
        }
        i++;
      }, beatMs / 2);
    } else {
      Pluck.startLoop(p.steps, { bpm: bpm, tone: tone(), getMidi: midiForToken });
    }
  }

  function stop() {
    looping = false;
    if (btnLoop) {
      btnLoop.classList.remove('playing');
      btnLoop.textContent = '🔁 循環';
    }
    Pluck.stopLoop();
    if (bar && bar._timer) { clearInterval(bar._timer); bar._timer = null; }
  }

  // ── 點指板（上面的音位圖）──────────────────────────────────
  var W = 800, H = 320, mL = 80, mR = 30, mT = 40, mB = 40;

  function playAtFretboard(evt) {
    var svg = document.getElementById('fretboard-svg');
    if (!svg) return;
    var tm = tuningMidis(), n = tm.length, fc = state.fretCount;
    if (!n) return;
    var rect = svg.getBoundingClientRect();
    var x = (evt.clientX - rect.left) / rect.width * W;
    var y = (evt.clientY - rect.top) / rect.height * H;
    var fW = (W - mL - mR) / fc;
    var sS = Math.min((H - mT - mB) / (n - 1 || 1), n > 6 ? 28 : (H - mT - mB) / (n - 1 || 1));
    var adjT = (H - sS * (n - 1)) / 2;
    var row = Math.round((y - adjT) / sS);
    if (row < 0 || row >= n) return;
    var s = state.lefty ? row : n - 1 - row;
    var fret = 0;
    if (x >= mL) {
      fret = Math.floor((x - mL) / fW) + 1;
      if (fret < 1 || fret > fc) return;
    } else if (x < mL - 26) {
      return;
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

  // ── 點和弦圖 ───────────────────────────────────────────────
  // 圖上的每一條弦都有一個透明 hit 區塊（data-midi），
  // 點它聽那一條；點圖的空白處則刷整組。
  function midisOf(svg) {
    var hits = [].slice.call(svg.querySelectorAll('[data-midi]'));
    var pairs = hits.map(function (el) {
      return { s: parseInt(el.getAttribute('data-string'), 10) || 0,
               m: parseInt(el.getAttribute('data-midi'), 10) };
    }).filter(function (p) { return p.m >= 0; });
    pairs.sort(function (a, b) { return b.s - a.s; });   // 弦號大 = 低音，先排
    return pairs.map(function (p) { return p.m; });
  }

  function onChartClick(evt) {
    var svg = evt.target.closest ? evt.target.closest('svg') : null;
    if (!svg) return;
    var box = svg.closest('.chord-diagram-box') || svg.parentElement;
    var label = '';
    if (box) {
      var cap = box.querySelector('.alt-cap, .chord-diagram-caption, figcaption');
      if (cap) label = cap.textContent.trim();
      if (!label) {
        var nameEl = box.querySelector('.cc-name');
        if (nameEl) label = nameEl.textContent.trim();
      }
    }
    var list = midisOf(svg);
    if (!list.length) return;
    Pluck.ensure();
    var hit = evt.target.closest('[data-midi]');
    if (hit) {
      var m = parseInt(hit.getAttribute('data-midi'), 10);
      if (m >= 0) Pluck.note(m, { tone: tone() });
      setCurrent(list, label);
      return;
    }
    setCurrent(list, label);
    Pluck.strum(list, { gap: 0.02, tone: tone() });
  }

  // 和弦卡上的 ▶ 也走同一條路（原本是一個 oscillator 的單音）
  function hookChordPlay() {
    if (typeof window.playChordFromSpec !== 'function') return;
    var orig = window.playChordFromSpec;
    window.playChordFromSpec = function (spec) {
      var tm = tuningMidis();
      if (!tm.length) return orig ? orig(spec) : null;
      var q = (typeof effQ === 'function') ? effQ(spec.q) : spec.q;
      var shape = getChordShape(state.instrument, state.tuning, spec.root, q, spec.bass);
      var list = [];
      if (shape && shape.frets) {
        list = shape.frets.map(function (f, i) { return f >= 0 ? tm[i] + f : -1; })
                          .filter(function (m) { return m >= 0; }).reverse();
      }
      if (!list.length) return orig ? orig(spec) : null;
      Pluck.ensure();
      setCurrent(list, '');
      Pluck.strum(list, { gap: 0.022, tone: tone() });
      return null;
    };
  }

  function init() {
    buildBar();
    hookChordPlay();
    var svg = document.getElementById('fretboard-svg');
    if (svg) svg.addEventListener('click', playAtFretboard);
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var area = t.closest('.common-chord-grid, #common-chord-grid, #preset-chord-grid, #chord-detail, #preset-chord-detail, #common-chord-detail, .chord-diagram-box');
      if (area) onChartClick(e);
    });
    var instSel = document.getElementById('instrument-select');
    if (instSel) instSel.addEventListener('change', function () { setTimeout(refreshPatterns, 0); });
    document.querySelectorAll('.tuning-item').forEach(function (el) {
      el.addEventListener('click', function () { setTimeout(refreshPatterns, 0); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
