// 母帶處理鏈（master 推桿之前，固定順序）：
//   Tone EQ → Glue Compressor → Stereo Width → Limiter（look-ahead、true-peak）
// 專案資料：project.mastering = { on, eq:{low,mid,high,hpf}, glue:{on,threshold,ratio,attack,release,makeup},
//                                width, limiter:{on,gain,ceiling,release}, target }
// 一鍵最佳化：離線算出未處理混音 → 量 LUFS → 設定 limiter gain / glue → 再算一次驗證 → 微調
import { analyze, TARGETS } from './loudness.js';

export function defaultMastering() {
  return {
    on: false,
    eq: { low: 0, mid: 0, high: 0, hpf: 25 },
    glue: { on: true, threshold: -18, ratio: 2, attack: 30, release: 200, makeup: 0 },
    width: 1,
    limiter: { on: true, gain: 0, ceiling: -1, release: 120 },
    target: 'stream',
  };
}

const loaded = new WeakSet();
export async function ensureWorklet(ctx) {
  if (loaded.has(ctx)) return;
  await ctx.audioWorklet.addModule(new URL('./limiter-worklet.js', import.meta.url));
  loaded.add(ctx);
}

const dbg = db => Math.pow(10, db / 20);

// 建立母帶鏈節點；回傳 { input, output, set(m), gr() }
export function buildMastering(ctx, m) {
  const input = ctx.createGain(), output = ctx.createGain();
  // Web Audio 的高通把 Q 當成 dB：0.7071 線性 = −3.01 dB（Butterworth，沒有共振凸起）
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = -3.01;
  const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 120;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1500; mid.Q.value = 0.7;
  const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 9000;
  const comp = ctx.createDynamicsCompressor();
  const mk = ctx.createGain();
  const bypassComp = ctx.createGain();
  const width = new AudioWorkletNode(ctx, 'zy-width', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  const lim = new AudioWorkletNode(ctx, 'zy-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  const limBypass = ctx.createGain();
  // 主路徑
  input.connect(hp).connect(lo).connect(mid).connect(hi);
  hi.connect(comp).connect(mk);
  hi.connect(bypassComp);
  const pre = ctx.createGain();     // 壓縮器之後的匯流點
  mk.connect(pre); bypassComp.connect(pre);
  pre.connect(width);
  width.connect(lim).connect(output);
  width.connect(limBypass).connect(output);
  let gr = 0;
  lim.port.onmessage = e => { if (e.data.gr !== undefined) gr = e.data.gr; };
  const node = {
    input, output, lim, comp,
    set(M) {
      const on = M.on;
      hp.frequency.value = on ? M.eq.hpf : 10;
      lo.gain.value = on ? M.eq.low : 0; mid.gain.value = on ? M.eq.mid : 0; hi.gain.value = on ? M.eq.high : 0;
      const gOn = on && M.glue.on;
      comp.threshold.value = M.glue.threshold; comp.ratio.value = M.glue.ratio; comp.knee.value = 6;
      comp.attack.value = M.glue.attack / 1000; comp.release.value = M.glue.release / 1000;
      // 扣掉 DynamicsCompressor 自動補償（見 effects.js 說明）
      const auto = 0.6 * (-M.glue.threshold) * (1 - 1 / M.glue.ratio);
      mk.gain.value = gOn ? dbg(M.glue.makeup - auto) : 0;
      bypassComp.gain.value = gOn ? 0 : 1;
      width.parameters.get('width').value = on ? M.width : 1;
      const lOn = on && M.limiter.on;
      lim.parameters.get('gain').value = M.limiter.gain;
      lim.parameters.get('ceiling').value = M.limiter.ceiling;
      lim.parameters.get('release').value = M.limiter.release;
      // limiter 關閉時走旁路；但為了避免兩條路相位差（limiter 有 5ms 延遲），切換時整條換
      try { width.disconnect(); } catch (_) { /* noop */ }
      width.connect(lOn ? lim : limBypass);
    },
    gr() { lim.port.postMessage('gr'); return gr; },
    compGr: () => -comp.reduction,
  };
  node.set(m);
  return node;
}

// ---------------- 一鍵最佳化 ----------------
// renderFn(masteringOverride) → Promise<AudioBuffer>：用指定的母帶設定離線算圖
export async function autoMaster(renderFn, m, targetId, onStep = () => {}) {
  const T = TARGETS.find(t => t.id === targetId) || TARGETS[0];
  onStep('分析混音…');
  // 1) 未經母帶處理的混音
  const raw = await renderFn({ ...m, on: false });
  const a0 = analyze(raw);
  if (!isFinite(a0.integrated)) throw new Error('混音是無聲的，沒辦法分析');
  // 2) 依動態範圍決定 glue 壓縮強度：PLR（峰值響度比）越大，越需要壓
  const plr = a0.truePeakDb - a0.integrated;
  const glue = { on: true, threshold: Math.round(Math.max(-30, Math.min(-8, a0.integrated + 6))), ratio: plr > 18 ? 3 : plr > 13 ? 2 : 1.5,
    attack: 30, release: 200, makeup: 0 };
  // 3) 頻譜傾斜：粗估低頻/高頻能量，做溫和修正（最多 ±2 dB）
  const tilt = spectralTilt(raw);
  const eq = { hpf: 25, low: clamp(-tilt.lowExcess * 0.5, -2, 2), mid: 0, high: clamp(-tilt.highExcess * 0.5, -2, 2) };
  let next = { ...m, on: true, eq, glue, width: m.width ?? 1, limiter: { on: true, gain: 0, ceiling: T.tp, release: 120 }, target: T.id };
  // 4) 混音離目標太遠（> 8 LU）：limiter 一次推太多會把聲音壓扁，
  //    先用 glue 的補償增益把整體拉上來一部分（壓縮器在前、增益在後，動態比較自然）
  const gap = T.lufs - a0.integrated;
  if (gap > 8) {
    const pre = Math.min(gap - 8, 12);
    next.glue = { ...next.glue, threshold: Math.max(-36, next.glue.threshold - pre / 2), ratio: Math.min(4, next.glue.ratio + 1), makeup: +pre.toFixed(1) };
  }
  // 5) 第一次：不加 limiter gain，量 glue/EQ 之後的響度
  onStep('套用壓縮與 EQ…');
  const b1 = await renderFn(next);
  const a1 = analyze(b1);
  let gain = T.lufs - a1.integrated;
  // 6) 迭代：limiter 壓得越多，每加 1 dB 實際只會大聲不到 1 LU，所以用割線法逼近
  let a = a1, prevGain = 0, prevL = a1.integrated;
  for (let k = 0; k < 4; k++) {
    next = { ...next, limiter: { ...next.limiter, gain: clamp(+gain.toFixed(2), -12, 18) } };
    onStep(`調整響度（第 ${k + 1} 次）…`);
    const b = await renderFn(next);
    a = analyze(b);
    const err = T.lufs - a.integrated;
    if (Math.abs(err) < 0.3 || next.limiter.gain >= 18) break;
    const slope = (a.integrated - prevL) / ((next.limiter.gain - prevGain) || 1);
    prevGain = next.limiter.gain; prevL = a.integrated;
    gain = next.limiter.gain + err / clamp(slope, 0.2, 1.2);
  }
  return { mastering: next, before: a0, after: a, target: T, warnings: warn(a, T, next) };
}

function warn(a, T, m) {
  const w = [];
  if (m.limiter.gain > 10) w.push(`Limiter 推了 ${m.limiter.gain.toFixed(1)} dB，聲音可能變扁、失去動態。建議先把混音本身做大聲一點（例如提高主要軌道的推桿）。`);
  if (a.truePeakDb > T.tp + 0.2) w.push(`True Peak ${a.truePeakDb.toFixed(1)} dBTP 略高於目標 ${T.tp} dBTP。`);
  if (Math.abs(a.integrated - T.lufs) > 1) w.push(`響度離目標還差 ${(T.lufs - a.integrated).toFixed(1)} LU；混音的動態範圍可能太大或太小。`);
  return w;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 用簡單的一階濾波比較低（<150Hz）、中、高（>6kHz）頻能量，跟「一般流行混音」的經驗值比
function spectralTilt(buf) {
  const sr = buf.sampleRate, d = buf.getChannelData(0);
  const aL = Math.exp(-2 * Math.PI * 150 / sr), aH = Math.exp(-2 * Math.PI * 6000 / sr);
  let lp = 0, lpH = 0, eL = 0, eH = 0, eT = 0;
  const step = Math.max(1, Math.floor(d.length / (sr * 60)));   // 太長就抽樣
  for (let i = 0; i < d.length; i += step) {
    const x = d[i];
    lp = lp * aL + x * (1 - aL);
    lpH = lpH * aH + x * (1 - aH);
    const h = x - lpH;
    eL += lp * lp; eH += h * h; eT += x * x;
  }
  const db = v => 10 * Math.log10(Math.max(v, 1e-12));
  // 經驗參考值：低頻約佔 -4 dB、高頻約 -16 dB（相對全頻能量）
  return { lowExcess: db(eL / eT) + 4, highExcess: db(eH / eT) + 16 };
}
