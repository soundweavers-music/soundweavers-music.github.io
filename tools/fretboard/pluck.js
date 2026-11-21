/* 撥弦音源：Karplus-Strong。
 *
 * 為什麼不用取樣檔：19 種樂器 × 十幾格 × 多種調弦，取樣會變成幾百 MB，
 * 而且第一次點下去還要等網路。Karplus-Strong 是一行迴圈的物理模型——
 * 一段雜訊在一條延遲線上反覆取平均，聽起來就是一隻撥弦的手，
 * 記憶體只要一個 AudioBuffer，離線也能用。
 *
 * 對外：
 *   Pluck.note(midi, {when, gain, tone})        單音
 *   Pluck.strum(midis, {dir:'down'|'up', gap})  刷弦（由低到高／由高到低）
 *   Pluck.setVolume(v)                          0..1
 *   Pluck.toneFor(instrumentName)               依樂器挑音色
 *   Pluck.startLoop(steps, opts) / stopLoop()   循環分解
 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, comp = null;
  var cache = {};            // 音色+midi → AudioBuffer
  var volume = 0.8;

  // 每種樂器的「手感」：衰減、亮度（雜訊低通）、起音、長度
  var TONES = {
    guitar:   { decay: 0.9965, bright: 0.45, len: 3.0, gain: 0.55 },
    acoustic: { decay: 0.9970, bright: 0.35, len: 3.0, gain: 0.55 },
    ukulele:  { decay: 0.9930, bright: 0.62, len: 2.0, gain: 0.52 },
    mandolin: { decay: 0.9905, bright: 0.72, len: 1.8, gain: 0.50 },
    banjo:    { decay: 0.9890, bright: 0.85, len: 1.6, gain: 0.50 },
    bass:     { decay: 0.9980, bright: 0.22, len: 3.4, gain: 0.60 },
    guitarron:{ decay: 0.9975, bright: 0.25, len: 3.2, gain: 0.60 },
    sitar:    { decay: 0.9940, bright: 0.80, len: 2.6, gain: 0.50 },
    pipa:     { decay: 0.9915, bright: 0.70, len: 2.0, gain: 0.50 },
    default:  { decay: 0.9955, bright: 0.50, len: 2.6, gain: 0.52 }
  };

  function toneFor(name) {
    var n = String(name || '').toLowerCase();
    if (n.indexOf('bass') >= 0 || n.indexOf('貝斯') >= 0) return TONES.bass;
    if (n.indexOf('ukulele') >= 0 || n.indexOf('烏克') >= 0) return TONES.ukulele;
    if (n.indexOf('mandolin') >= 0 || n.indexOf('曼陀林') >= 0) return TONES.mandolin;
    if (n.indexOf('banjo') >= 0 || n.indexOf('班卓') >= 0) return TONES.banjo;
    if (n.indexOf('sitar') >= 0 || n.indexOf('西塔') >= 0) return TONES.sitar;
    if (n.indexOf('pipa') >= 0 || n.indexOf('琵琶') >= 0) return TONES.pipa;
    if (n.indexOf('guitarron') >= 0 || n.indexOf('吉他隆') >= 0) return TONES.guitarron;
    if (n.indexOf('classical') >= 0 || n.indexOf('古典') >= 0) return TONES.acoustic;
    if (n.indexOf('guitar') >= 0 || n.indexOf('吉他') >= 0) return TONES.guitar;
    return TONES.default;
  }

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  var LOWPASS = [];   // 依亮度先算好的一極低通係數
  for (var i = 0; i <= 20; i++) LOWPASS.push(1 - (1 - i / 20) * 0.95);

  function renderBuffer(midi, tone) {
    var key = midi + ':' + tone.decay + ':' + tone.bright;
    if (cache[key]) return cache[key];
    var sr = ctx.sampleRate;
    var freq = 440 * Math.pow(2, (midi - 69) / 12);
    var n = Math.max(2, Math.round(sr / freq));
    var len = Math.floor(sr * tone.len);
    var buf = ctx.createBuffer(1, len, sr);
    var out = buf.getChannelData(0);
    var line = new Float32Array(n);
    var a = Math.max(0.05, Math.min(1, 1 - tone.bright));   // 雜訊低通：亮 = 少濾
    var prev = 0;
    for (var j = 0; j < n; j++) {
      var w = Math.random() * 2 - 1;
      prev = a * prev + (1 - a) * w;
      line[j] = prev;
    }
    var idx = 0, peak = 0;
    for (var k = 0; k < len; k++) {
      var cur = line[idx];
      var nxt = line[(idx + 1) % n];
      var v = tone.decay * 0.5 * (cur + nxt);
      line[idx] = v;
      out[k] = cur;
      idx = (idx + 1) % n;
      if (Math.abs(cur) > peak) peak = Math.abs(cur);
    }
    // 正規化 + 尾巴淡出，避免爆音
    var norm = peak > 0 ? 0.9 / peak : 1;
    var fade = Math.floor(len * 0.12);
    for (var m = 0; m < len; m++) {
      out[m] *= norm;
      if (m > len - fade) out[m] *= (len - m) / fade;
    }
    cache[key] = buf;
    return buf;
  }

  function note(midi, opts) {
    opts = opts || {};
    if (!ensure()) return;
    if (midi == null || isNaN(midi)) return;
    var tone = opts.tone || TONES.default;
    var when = Math.max(ctx.currentTime, opts.when || ctx.currentTime);
    var src = ctx.createBufferSource();
    src.buffer = renderBuffer(midi, tone);
    var g = ctx.createGain();
    g.gain.value = (opts.gain == null ? 1 : opts.gain) * (tone.gain || 0.5);
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = Math.max(60, 440 * Math.pow(2, (midi - 69) / 12) * 0.6);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(when);
    src.stop(when + tone.len + 0.05);
    return src;
  }

  function strum(midis, opts) {
    opts = opts || {};
    var list = (midis || []).slice();
    if (opts.dir === 'up') list.reverse();
    var gap = opts.gap == null ? 0.018 : opts.gap;     // 每條弦差 18ms，聽起來像手指掃過去
    var t0 = (ctx ? Math.max(ctx.currentTime, opts.when || 0) : 0);
    for (var i = 0; i < list.length; i++) {
      note(list[i], {
        when: t0 + i * gap,
        gain: (opts.gain == null ? 1 : opts.gain) * (0.75 + 0.25 * (i / Math.max(1, list.length - 1))),
        tone: opts.tone
      });
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }

  // ── 循環分解 ───────────────────────────────────────────────
  var loopTimer = null, loopState = null;

  function stopLoop() {
    loopState = null;
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
  }

  /**
   * steps: 陣列，每格是 { token, beats } 或字串 token
   * opts: { bpm, tokens: {getMidi(token) -> midi|null}, strumUp: [], onStep(i) }
   */
  function startLoop(steps, opts) {
    opts = opts || {};
    stopLoop();
    if (!ensure() || !steps || !steps.length) return;
    var bpm = Math.max(30, Math.min(240, opts.bpm || 80));
    var beatMs = 60000 / bpm;
    var seq = [];
    var total = 0;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var beats = (typeof s === 'object' && s.beats) ? s.beats : 0.5;
      seq.push({ token: (typeof s === 'object' ? s.token : s), at: total });
      total += beats;
    }
    var lenBeats = total;
    var t0 = ctx.currentTime + 0.12;
    loopState = { seq: seq, lenBeats: lenBeats };

    function schedule(fromBar) {
      if (!loopState) return;
      var barStart = ctx.currentTime + fromBar * (lenBeats * beatMs / 1000);
      for (var k = 0; k < seq.length; k++) {
        var at = barStart + (seq[k].at * beatMs / 1000);
        (function (step, when, i) {
          var midi = opts.getMidi ? opts.getMidi(step.token) : null;
          if (midi != null) note(midi, { when: when, tone: opts.tone, gain: 0.95 });
          if (opts.onStep) setTimeout(function () { opts.onStep(i); }, Math.max(0, (when - ctx.currentTime) * 1000));
        })(seq[k], at, k);
      }
    }
    schedule(0);
    var period = lenBeats * beatMs;
    var next = 1;
    loopTimer = setInterval(function () {
      if (!loopState) return;
      // 用實際時間校正，避免 setInterval 漂移
      var elapsedBeats = (ctx.currentTime - t0) / (beatMs / 1000);
      while ((next * lenBeats) - elapsedBeats < 0.25) {
        schedule(next);
        next += 1;
      }
    }, Math.max(30, period / 2));
  }

  window.Pluck = {
    ensure: ensure, note: note, strum: strum, setVolume: setVolume,
    toneFor: toneFor, startLoop: startLoop, stopLoop: stopLoop,
    isLooping: function () { return !!loopState; }
  };
})();
