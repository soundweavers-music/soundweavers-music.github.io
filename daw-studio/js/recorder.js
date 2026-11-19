// 錄音：getUserMedia → AudioWorklet 收 PCM → 依延遲補償對齊 → 產生片段放到「錄音待命」的軌道
import { store } from './state.js';
import { engine } from './engine.js';
import { uid, computePeaks, toast } from './util.js';
import { startMidiRecording, stopMidiRecording } from './midi-input.js';

class Recorder {
  constructor() {
    this.stream = null;
    this.node = null;
    this.src = null;
    this.monitorGain = null;
    this.recording = false;
    this.chunks = [];
    this.deviceId = localStorage.getItem('daw.inputDevice') || '';
    this.latencyMs = Number(localStorage.getItem('daw.latencyMs') || 0);   // 使用者手動校正值
    this.inputMeter = null;
  }

  async listInputs() {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter(d => d.kind === 'audioinput');
  }

  async openInput() {
    const ctx = await engine.ensure();
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('這個瀏覽器不支援錄音');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: { ideal: 2 },
      },
    });
    if (!this._workletLoaded) {
      await ctx.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
      this._workletLoaded = true;
    }
    this.src = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'capture-processor', { numberOfInputs: 1, numberOfOutputs: 0 });
    this.src.connect(this.node);
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    this.src.connect(an);
    this.inputMeter = { aL: an, aR: an, buf: new Float32Array(1024), hold: [0, 0], peakDb: -Infinity };
    // 輸入監聽：接到「開了 I 的那一軌」的 strip 輸入 → 會經過那一軌的效果器（例如人聲修音）、推桿與聲像，
    // 跟最後錄進去、播出來的聲音一樣。錄進去的仍然是乾淨的原聲。
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = 0;
    this.src.connect(this.monitorGain);
    this.routeMonitor();
    // 軌道增刪、I 切換、strip 重建 → 重新決定監聽要送到哪一軌（engine 的監聽先註冊，strip 已更新）
    if (!this._routeSub) { this._routeSub = true; store.on('change', () => this.routeMonitor()); }
    this.node.port.onmessage = e => {
      if (e.data.chunk) this.chunks.push(e.data.chunk);
      else if (e.data.done && this._onDone) this._onDone();
    };
    this.setMonitor(store.project.tracks.some(t => t.arm && t.monitor));
  }

  closeInput() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    try { this.src.disconnect(); } catch (_) { /* noop */ }
    try { this.monitorGain.disconnect(); } catch (_) { /* noop */ }
    this.stream = null; this.src = null; this.node = null; this.inputMeter = null;
    this.monitorGain = null; this._monDest = null;
  }

  async setDevice(id) {
    this.deviceId = id;
    localStorage.setItem('daw.inputDevice', id);
    if (this.stream) { this.closeInput(); await this.openInput(); }
  }

  // 監聽送到哪一軌：第一條開了 I 的音訊軌；沒有就直接到輸出
  routeMonitor() {
    if (!this.monitorGain) return;
    const t = store.project.tracks.find(x => x.kind === 'audio' && x.monitor);
    const strip = t && engine.strips.get(t.id);
    const dest = strip ? strip.input : engine.ctx.destination;
    if (this._monDest === dest) return;
    try { this.monitorGain.disconnect(); } catch (_) { /* noop */ }
    this.monitorGain.connect(dest);
    this._monDest = dest;
  }

  setMonitor(on) {
    if (!this.monitorGain) return;
    this.routeMonitor();
    this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, engine.ctx.currentTime, 0.02);
  }

  inputLevels() { return this.inputMeter ? engine.readMeter(this.inputMeter) : [0, 0]; }

  // 瀏覽器回報的往返延遲 + 使用者校正值
  totalLatency() {
    const c = engine.ctx;
    let s = (c.baseLatency || 0) + (c.outputLatency || 0);
    const set = this.stream?.getAudioTracks()[0]?.getSettings?.();
    if (set && typeof set.latency === 'number') s += set.latency;
    return s + this.latencyMs / 1000;
  }

  async start() {
    const armed = store.project.tracks.filter(t => t.arm && t.kind === 'audio');
    const midiArmed = store.project.tracks.some(t => t.arm && t.kind === 'midi');
    if (!armed.length && !midiArmed) { toast('請先按下某一軌的 R（錄音待命）', 'warn'); return false; }
    this.audioRec = armed.length > 0;
    if (this.audioRec) await this.openInput(); else await engine.ensure();
    const p = store.project;
    let from = engine.currentTime();
    if (engine.playing) engine.stop();
    // 預備拍：往前退一小節，錄音仍從原位置開始
    const bar = (60 / p.bpm) * p.sigNum;
    const preroll = p.countIn ? bar : 0;
    const playFrom = Math.max(0, from - preroll);
    this.recFrom = from;
    this.armedIds = armed.map(t => t.id);
    this.chunks = [];
    this.recording = true;
    // 預備拍期間一定要有節拍聲；結束後回到使用者原本的設定
    this.metroWas = p.metronome;
    if (preroll > 0) p.metronome = true;
    await engine.play(playFrom, { ignoreLoop: true });
    // 錄音起點對齊：worklet 在 ctx 時間到達「專案 from 秒」那一刻、精確到 sample 開始收音
    const startCtx = engine.startCtxTime + (from - playFrom);
    if (this.audioRec) this.node.port.postMessage({ start: startCtx });
    // MIDI：預備拍期間彈的音也收（片段從小節線開始，音符時間用播放位置計算）
    if (midiArmed) startMidiRecording(from);
    // 預備拍結束後節拍器回到原本設定（只影響聲音，時間不需要精準）
    this._startTimer = setTimeout(() => { p.metronome = this.metroWas; },
      Math.max(0, (startCtx - engine.ctx.currentTime) * 1000));
    store.emit('record', { recording: true });
    return true;
  }

  async stop() {
    if (!this.recording) return;
    this.recording = false;
    clearTimeout(this._startTimer);
    store.project.metronome = this.metroWas;
    // MIDI 要在 engine.stop() 之前收尾，未放開的音符才能用正確的播放位置當結尾
    stopMidiRecording();
    if (this.audioRec) {
      const done = new Promise(r => { this._onDone = r; });
      this.node.port.postMessage('stop');
      await Promise.race([done, new Promise(r => setTimeout(r, 500))]);
    }
    engine.stop();
    engine.ignoreLoop = false;
    store.emit('record', { recording: false });
    if (this.audioRec) this._commit();
  }

  _commit() {
    const chunks = this.chunks; this.chunks = [];
    const total = chunks.reduce((n, c) => n + c[0].length, 0);
    const sr = engine.ctx.sampleRate;
    // 延遲補償：丟掉開頭的延遲樣本，讓錄音對齊節拍
    const drop = Math.min(total, Math.round(this.totalLatency() * sr));
    const len = total - drop;
    if (len < sr * 0.05) { toast('錄音太短，已捨棄', 'warn'); return; }
    const nCh = chunks[0].length;
    const buf = new AudioBuffer({ numberOfChannels: Math.max(1, nCh), length: len, sampleRate: sr });
    for (let c = 0; c < nCh; c++) {
      const out = buf.getChannelData(c);
      let w = 0, skip = drop;
      for (const ch of chunks) {
        let d = ch[c];
        if (skip > 0) { const k = Math.min(skip, d.length); d = d.subarray(k); skip -= k; }
        out.set(d, w); w += d.length;
      }
    }
    store.checkpoint();
    const takeNo = (this._take = (this._take || 0) + 1);
    for (const id of this.armedIds) {
      const t = store.track(id);
      if (!t) continue;
      const bufferId = uid('buf');
      store.buffers.set(bufferId, buf);
      store.bufferMeta.set(bufferId, { name: `${t.name} 錄音 ${takeNo}.wav`, peaks: computePeaks(buf) });
      // 新錄音覆蓋同時段的舊片段（裁掉重疊部分）
      punchIn(t, this.recFrom, this.recFrom + buf.duration);
      t.clips.push({
        id: uid('clip'), bufferId, name: `錄音 ${takeNo}`,
        start: this.recFrom, offset: 0, duration: buf.duration,
        gainDb: 0, fadeIn: 0.005, fadeOut: 0.005,
      });
    }
    store.changed('structure');
    toast(`已錄下 ${buf.duration.toFixed(1)} 秒`);
  }
}

// 把 [a,b) 區間從軌道既有片段中挖掉
export function punchIn(track, a, b) {
  const out = [];
  for (const c of track.clips) {
    const s = c.start, e = c.start + c.duration;
    if (e <= a || s >= b) { out.push(c); continue; }
    if (s < a) out.push({ ...c, duration: a - s, fadeOut: Math.min(c.fadeOut || 0, a - s) });
    if (e > b) out.push({ ...c, id: uid('clip'), start: b, offset: c.offset + (b - s), duration: e - b, fadeIn: Math.min(c.fadeIn || 0, e - b) });
  }
  track.clips = out;
}

export const recorder = new Recorder();
