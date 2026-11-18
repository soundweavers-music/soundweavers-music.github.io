// 效果器：全部用 Web Audio 原生節點組成，即時播放與離線輸出共用。
// 每個效果器實例：{ input, output, set(params), dispose(), meter? }
// 專案裡存的是 { id, type, on, params }，engine 依這份描述建節點。
import { uid } from './util.js';

// 參數描述：給檢閱器自動產生旋鈕/滑桿
export const FX_TYPES = {
  eq: {
    name: 'EQ 等化器', short: 'EQ',
    params: {
      lowGain: { label: '低頻', min: -18, max: 18, step: 0.5, def: 0, unit: 'dB' },
      lowFreq: { label: '低頻點', min: 40, max: 400, step: 1, def: 100, unit: 'Hz', log: true },
      midGain: { label: '中頻', min: -18, max: 18, step: 0.5, def: 0, unit: 'dB' },
      midFreq: { label: '中頻點', min: 200, max: 6000, step: 1, def: 1000, unit: 'Hz', log: true },
      midQ: { label: '中頻 Q', min: 0.3, max: 8, step: 0.05, def: 1 },
      highGain: { label: '高頻', min: -18, max: 18, step: 0.5, def: 0, unit: 'dB' },
      highFreq: { label: '高頻點', min: 2000, max: 16000, step: 10, def: 8000, unit: 'Hz', log: true },
      hpf: { label: '低切', min: 20, max: 500, step: 1, def: 20, unit: 'Hz', log: true },
    },
  },
  comp: {
    name: 'Compressor 壓縮器', short: 'Comp',
    params: {
      threshold: { label: '門檻', min: -60, max: 0, step: 0.5, def: -18, unit: 'dB' },
      ratio: { label: '比例', min: 1, max: 20, step: 0.1, def: 4, unit: ':1' },
      attack: { label: '起音', min: 0.1, max: 200, step: 0.1, def: 10, unit: 'ms', log: true },
      release: { label: '釋音', min: 10, max: 1000, step: 1, def: 150, unit: 'ms', log: true },
      knee: { label: '膝部', min: 0, max: 30, step: 1, def: 6, unit: 'dB' },
      makeup: { label: '補償增益', min: 0, max: 24, step: 0.5, def: 0, unit: 'dB' },
    },
  },
  reverb: {
    name: 'Reverb 殘響', short: 'Verb',
    params: {
      size: { label: '空間', min: 0.2, max: 8, step: 0.1, def: 2.2, unit: '秒' },
      predelay: { label: '預延遲', min: 0, max: 120, step: 1, def: 15, unit: 'ms' },
      damp: { label: '高頻衰減', min: 1000, max: 16000, step: 100, def: 7000, unit: 'Hz', log: true },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 25, unit: '%' },
    },
  },
  delay: {
    name: 'Delay 延遲', short: 'Delay',
    params: {
      time: { label: '時間', min: 0.03125, max: 2, step: 0.03125, def: 0.5, unit: '拍', sync: true },
      feedback: { label: '回授', min: 0, max: 90, step: 1, def: 35, unit: '%' },
      tone: { label: '音色', min: 800, max: 16000, step: 100, def: 5000, unit: 'Hz', log: true },
      pingpong: { label: '左右彈跳', min: 0, max: 1, step: 1, def: 0, toggle: true },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 25, unit: '%' },
    },
  },
  chorus: {
    name: 'Chorus 合唱', short: 'Chorus',
    params: {
      rate: { label: '速度', min: 0.05, max: 5, step: 0.05, def: 0.8, unit: 'Hz' },
      depth: { label: '深度', min: 0, max: 10, step: 0.1, def: 3, unit: 'ms' },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 40, unit: '%' },
    },
  },
  drive: {
    name: 'Distortion 失真', short: 'Drive',
    params: {
      drive: { label: '驅動', min: 0, max: 40, step: 0.5, def: 12, unit: 'dB' },
      tone: { label: '音色', min: 500, max: 12000, step: 100, def: 4000, unit: 'Hz', log: true },
      output: { label: '輸出', min: -24, max: 6, step: 0.5, def: -6, unit: 'dB' },
      mix: { label: '濕度', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    },
  },
  gate: {
    name: 'Noise Gate 噪音閘', short: 'Gate',
    params: {
      threshold: { label: '門檻', min: -80, max: -10, step: 0.5, def: -50, unit: 'dB' },
      release: { label: '釋放', min: 10, max: 500, step: 1, def: 80, unit: 'ms' },
    },
  },
};
export const FX_ORDER = ['eq', 'comp', 'reverb', 'delay', 'chorus', 'drive', 'gate'];
export const MAX_INSERTS = 4;

export function newFx(type) {
  const T = FX_TYPES[type];
  const params = {};
  for (const [k, d] of Object.entries(T.params)) params[k] = d.def;
  return { id: uid('fx'), type, on: true, params };
}

const dbg = db => Math.pow(10, db / 20);

// 用程式產生殘響的脈衝響應：指數衰減的立體聲雜訊，高頻衰減得比較快
const irCache = new WeakMap();
function impulse(ctx, seconds, damp) {
  let m = irCache.get(ctx);
  if (!m) { m = new Map(); irCache.set(ctx, m); }
  const key = seconds.toFixed(2) + '|' + Math.round(damp / 100);
  if (m.has(key)) return m.get(key);
  const sr = ctx.sampleRate, len = Math.max(1, Math.round(sr * seconds));
  const b = ctx.createBuffer(2, len, sr);
  // 一階低通係數：damp 越低，尾巴越暗
  const a = Math.exp(-2 * Math.PI * damp / sr);
  let seed = 22222;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = seed / 2147483648 - 1;
      const t = i / len;
      // 越後面越暗：混合原始雜訊與低通雜訊
      lp = lp * a + n * (1 - a);
      const tone = n * (1 - t) + lp * t * 2.5;
      d[i] = tone * Math.pow(1 - t, 2.2) * Math.exp(-3 * t);
    }
    // 開頭 5ms 淡入，避免爆點
    const fi = Math.min(len, Math.round(sr * 0.005));
    for (let i = 0; i < fi; i++) d[i] *= i / fi;
  }
  m.set(key, b);
  return b;
}

function distortionCurve(amount) {
  const n = 2048, c = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

// 濕/乾混合：in → dry → out；in → wet chain → wetGain → out
function wetDry(ctx) {
  const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  return { input, output, dry, wet, setMix(pct) { const m = pct / 100; dry.gain.value = Math.cos(m * Math.PI / 2); wet.gain.value = Math.sin(m * Math.PI / 2); } };
}

// bpm：Delay 同步用
export function buildFx(ctx, desc, bpm = 120) {
  const P = desc.params;
  let fx;
  switch (desc.type) {
    case 'eq': {
      const input = ctx.createGain();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.707;
      const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf';
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking';
      const hi = ctx.createBiquadFilter(); hi.type = 'highshelf';
      input.connect(hp).connect(lo).connect(mid).connect(hi);
      fx = {
        input, output: hi, nodes: [hp, lo, mid, hi],
        set(p) {
          hp.frequency.value = p.hpf; lo.frequency.value = p.lowFreq; lo.gain.value = p.lowGain;
          mid.frequency.value = p.midFreq; mid.gain.value = p.midGain; mid.Q.value = p.midQ;
          hi.frequency.value = p.highFreq; hi.gain.value = p.highGain;
        },
        // 給檢閱器畫頻率響應
        response(freqs) {
          const mag = new Float32Array(freqs.length), tmp = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
          mag.fill(1);
          for (const f of [hp, lo, mid, hi]) { f.getFrequencyResponse(freqs, tmp, ph); for (let i = 0; i < mag.length; i++) mag[i] *= tmp[i]; }
          return mag;
        },
      };
      break;
    }
    case 'comp': {
      const input = ctx.createGain();
      const c = ctx.createDynamicsCompressor();
      const mk = ctx.createGain();
      input.connect(c).connect(mk);
      fx = {
        input, output: mk, comp: c,
        set(p) {
          c.threshold.value = p.threshold; c.ratio.value = p.ratio; c.knee.value = p.knee;
          c.attack.value = p.attack / 1000; c.release.value = p.release / 1000;
          // 瀏覽器的 DynamicsCompressor（Chrome/Firefox/Safari 同一份 WebKit 實作）會自動加補償增益：
          //   makeup = (0 dBFS 輸入時的衰減量) × 0.6
          // 這裡把它扣回來，讓「補償增益」完全由使用者控制，壓縮器不會偷偷把聲音變大。
          const autoMakeupDb = 0.6 * (-p.threshold) * (1 - 1 / p.ratio);
          mk.gain.value = dbg(p.makeup - autoMakeupDb);
        },
        reduction: () => c.reduction,
      };
      break;
    }
    case 'reverb': {
      const wd = wetDry(ctx);
      const pre = ctx.createDelay(0.2);
      const conv = ctx.createConvolver();
      wd.input.connect(pre).connect(conv).connect(wd.wet);
      let lastKey = '';
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          pre.delayTime.value = p.predelay / 1000;
          const k = p.size + '|' + p.damp;
          if (k !== lastKey) { conv.buffer = impulse(ctx, p.size, p.damp); lastKey = k; }
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'delay': {
      const wd = wetDry(ctx);
      const dl = ctx.createDelay(4), dr = ctx.createDelay(4);
      const fb = ctx.createGain(), tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
      const merger = ctx.createChannelMerger(2);
      const mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
      // 一般模式：in → dl → tone → fb → dl；乒乓：L → R → L 交叉回授
      wd.input.connect(mono);
      let mode = -1;
      const wire = pp => {
        [mono, dl, dr, tone, fb, merger].forEach(n => { try { n.disconnect(); } catch (_) { /* noop */ } });
        mono.connect(dl);
        dl.connect(tone);
        if (pp) {
          tone.connect(dr); dr.connect(fb); fb.connect(dl);
          dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
        } else {
          tone.connect(fb); fb.connect(dl);
          dl.connect(merger, 0, 0); dl.connect(merger, 0, 1);
        }
        merger.connect(wd.wet);
      };
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          const pp = p.pingpong ? 1 : 0;
          if (pp !== mode) { wire(pp); mode = pp; }
          const sec = Math.min(4, p.time * 60 / bpm);
          dl.delayTime.value = sec; dr.delayTime.value = sec;
          fb.gain.value = Math.min(0.92, p.feedback / 100);
          tone.frequency.value = p.tone;
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'chorus': {
      const wd = wetDry(ctx);
      const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
      const dL = ctx.createDelay(0.05), dR = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator(), gL = ctx.createGain(), gR = ctx.createGain();
      // 左右 LFO 反相，製造寬度
      const inv = ctx.createGain(); inv.gain.value = -1;
      lfo.connect(gL).connect(dL.delayTime);
      lfo.connect(inv).connect(gR).connect(dR.delayTime);
      wd.input.connect(split);
      split.connect(dL, 0); split.connect(dR, 1 % 2);
      dL.connect(merge, 0, 0); dR.connect(merge, 0, 1);
      merge.connect(wd.wet);
      lfo.start();
      fx = {
        input: wd.input, output: wd.output, osc: [lfo],
        set(p) {
          lfo.frequency.value = p.rate;
          const base = 0.012, dep = p.depth / 1000;
          dL.delayTime.value = base; dR.delayTime.value = base;
          gL.gain.value = dep; gR.gain.value = dep;
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'drive': {
      const wd = wetDry(ctx);
      const pre = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), post = ctx.createGain();
      lp.type = 'lowpass'; sh.oversample = '4x';
      wd.input.connect(pre).connect(sh).connect(lp).connect(post).connect(wd.wet);
      let lastD = null;
      fx = {
        input: wd.input, output: wd.output,
        set(p) {
          pre.gain.value = dbg(p.drive / 2);
          if (p.drive !== lastD) { sh.curve = distortionCurve(dbg(p.drive) - 1 + 0.5); lastD = p.drive; }
          lp.frequency.value = p.tone; post.gain.value = dbg(p.output);
          wd.setMix(p.mix);
        },
      };
      break;
    }
    case 'gate': {
      // 用 AudioWorklet 太重；這裡用 Analyser 量電平 + 主執行緒控制增益。
      // 離線輸出時沒有主執行緒迴圈，改用「門檻以下大幅壓縮」的 expander 近似（DynamicsCompressor 做不到向下擴展，
      // 所以離線時 gate 以 bypass 處理並在介面註明）。
      const input = ctx.createGain(), out = ctx.createGain();
      input.connect(out);
      const an = ctx.createAnalyser(); an.fftSize = 512;
      input.connect(an);
      const buf = new Float32Array(512);
      let params = P, timer = null, open = true;
      const live = typeof ctx.startRendering !== 'function';
      if (live) {
        timer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let pk = 0; for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
          const db = 20 * Math.log10(pk + 1e-9);
          const want = db > params.threshold;
          if (want !== open) {
            open = want;
            out.gain.setTargetAtTime(open ? 1 : 0.0001, ctx.currentTime, open ? 0.002 : params.release / 4000);
          }
        }, 10);
      }
      fx = {
        input, output: out, offlineBypass: !live,
        set(p) { params = p; },
        dispose() { clearInterval(timer); },
      };
      break;
    }
    default: {
      const g = ctx.createGain();
      fx = { input: g, output: g, set() {} };
    }
  }
  fx.set(P);
  const baseDispose = fx.dispose;
  fx.dispose = () => {
    baseDispose && baseDispose();
    (fx.osc || []).forEach(o => { try { o.stop(); } catch (_) { /* noop */ } });
    try { fx.input.disconnect(); fx.output.disconnect(); } catch (_) { /* noop */ }
  };
  return fx;
}

// 把一串效果器描述接成一條鏈：input → [fx...] → output；關閉的效果器直接跳過
export function buildChain(ctx, list, bpm) {
  const input = ctx.createGain(), output = ctx.createGain();
  const live = [];
  let prev = input;
  for (const d of list || []) {
    if (!d.on) continue;
    const fx = buildFx(ctx, d, bpm);
    fx.desc = d;
    prev.connect(fx.input);
    prev = fx.output;
    live.push(fx);
  }
  prev.connect(output);
  return {
    input, output, fx: live,
    dispose() { live.forEach(f => f.dispose()); try { input.disconnect(); output.disconnect(); } catch (_) { /* noop */ } },
  };
}

// 描述的「形狀」（有哪些效果器、開關狀態）：形狀變了要重建鏈，只有參數變就直接 set
export const chainShape = list => (list || []).map(d => d.id + (d.on ? '+' : '-')).join(',');

export function fmtParam(def, v, bpm) {
  if (def.toggle) return v ? '開' : '關';
  if (def.sync) {
    const names = { 0.03125: '1/128', 0.0625: '1/64', 0.125: '1/32', 0.25: '1/16', 0.5: '1/8', 0.75: '1/8.', 1: '1/4', 1.5: '1/4.', 2: '1/2' };
    return (names[v] || `${v} 拍`) + (bpm ? ` · ${Math.round(v * 60000 / bpm)}ms` : '');
  }
  if (def.unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`;
  const s = Math.abs(v) >= 100 || def.step >= 1 ? Math.round(v) : v.toFixed(def.step < 0.1 ? 2 : 1);
  return `${s}${def.unit ? (def.unit.startsWith(':') ? def.unit : ' ' + def.unit) : ''}`;
}
