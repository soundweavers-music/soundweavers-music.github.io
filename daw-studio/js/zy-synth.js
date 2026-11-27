// 織音合成器 — 主執行緒這一側的介面
//
// 音色資料在 zy-patches.js，DSP 在 zy-worklet.js。這裡負責：
//   ‧ 載入 worklet（每個 AudioContext 一次；離線輸出也要載入，輸出檔才會跟播放一致）
//   ‧ 每條軌一個 AudioWorkletNode（節點數固定，複音全在 worklet 裡）
//   ‧ 把「音色巨集」（檢閱器上的旋鈕）套進音色參數
import { ZY_PATCHES } from './zy-patches.js';

const loaded = new WeakMap();     // ctx → Promise
const nodes = new WeakMap();      // dest(GainNode) → { node, sent:Set }

export const ZY_IDS = new Set(ZY_PATCHES.map(p => 'zy:' + p.id));
const BY_ID = new Map(ZY_PATCHES.map(p => [p.id, p]));

export const isZY = id => typeof id === 'string' && id.startsWith('zy:');

// 載入模組；同一條路徑只會載入一次（AudioWorklet 會自己快取）
export function ensureZYWorklet(ctx) {
  let pr = loaded.get(ctx);
  if (pr) return pr;
  pr = ctx.audioWorklet.addModule(new URL('./zy-worklet.js', import.meta.url))
    .then(() => { ctx.__zyReady = true; })
    .catch(e => { loaded.delete(ctx); throw e; });
  loaded.set(ctx, pr);
  return pr;
}

function getNode(ctx, dest) {
  let e = nodes.get(dest);
  if (e) return e;
  const node = new AudioWorkletNode(ctx, 'zy-synth', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
  });
  node.connect(dest);
  // 音訊執行緒的錯誤不會自動冒出來，這裡接回來，除錯才看得到
  node.port.onmessage = ev => {
    const d = ev.data || {};
    if (d.t === 'err') {
      console.error('[織音合成器]', d.msg);
      (globalThis.__zyErrors = globalThis.__zyErrors || []).push(d.msg);
    } else if (d.t === 'dbg') {
      (globalThis.__zyErrors = globalThis.__zyErrors || []).push('dbg ' + JSON.stringify(d));
    }
  };
  e = { node, sent: new Set() };
  nodes.set(dest, e);
  return e;
}

// 音色巨集：檢閱器上的八個旋鈕（-1 … +1，0 ＝ 照音色原本的設定）
export const MACROS = [
  { k: 'bright', name: '亮度', tip: '濾波器截止頻率（往右更亮、往左更悶）' },
  { k: 'res', name: '共振', tip: '濾波器共振：越多越有「哇」的電子味' },
  { k: 'atk', name: '起音', tip: '音頭的快慢（往右更軟、往左更硬）' },
  { k: 'rel', name: '釋音', tip: '放開琴鍵後的尾巴長度' },
  { k: 'thick', name: '厚度', tip: '齊奏的失諧量：越厚越寬、越像多人合奏' },
  { k: 'bite', name: '咬合', tip: '濾波器包絡深度：越多越有「啪」的起音' },
  { k: 'grit', name: '顆粒', tip: '軟削波驅動：越多越粗、越有類比味' },
  { k: 'fine', name: '微調', tip: '整體音準微調（±50 音分）' },
];

const macroKey = m => (m ? MACROS.map(x => Math.round((m[x.k] || 0) * 100)).join(',') : '0');

// 把巨集套進音色（回傳新物件，不動原始音色）
function applyMacros(p, m) {
  if (!m) return p;
  const g = k => (m[k] || 0);
  const bright = g('bright'), res = g('res'), atk = g('atk'), rel = g('rel');
  const thick = g('thick'), bite = g('bite'), grit = g('grit'), fine = g('fine');
  if (!bright && !res && !atk && !rel && !thick && !bite && !grit && !fine) return p;
  const out = Object.assign({}, p);
  if (bright) { out.flt = Object.assign({}, p.flt, { f: p.flt.f * Math.pow(2, 2 * bright) }); }
  if (res) out.flt = Object.assign({}, out.flt || p.flt, { q: Math.max(0.4, (out.flt || p.flt).q * (1 + 1.8 * res)) });
  if (bite) out.flt = Object.assign({}, out.flt || p.flt, { env: (out.flt || p.flt).env * (1 + bite) });
  if (atk) {
    out.amp = Object.assign({}, p.amp, { a: p.amp.a * Math.pow(2, 3 * atk) });
    out.flt = Object.assign({}, out.flt || p.flt, { a: (out.flt || p.flt).a * Math.pow(2, 2.5 * atk) });
  }
  if (rel) out.amp = Object.assign({}, out.amp || p.amp, { r: (out.amp || p.amp).r * Math.pow(2, 3 * rel) });
  if (thick) out.osc = p.osc.map(o => Object.assign({}, o, {
    spread: Math.max(o.spread || 0, 6) * (1 + 2 * thick),
    uni: thick > 0 ? Math.max(o.uni || 1, 2) : (o.uni || 1),
  }));
  if (grit) out.drive = Math.max(0, (p.drive || 0) + grit * 0.35);
  if (fine) out.osc = (out.osc || p.osc).map(o => Object.assign({}, o, { cents: (o.cents || 0) + fine * 50 }));
  return out;
}

// 產生要送進 worklet 的音色（含巨集），並以「id + 巨集」當快取鍵
const cache = new Map();
function patchFor(patchId, synth) {
  const src = BY_ID.get(patchId);
  if (!src) return null;
  const key = patchId + '|' + macroKey(synth);
  let p = cache.get(key);
  if (!p) {
    p = Object.assign({}, applyMacros(src, synth));
    p.id = 'zy:' + key;
    cache.set(key, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }
  return p;
}

// 音色的釋音尾巴（離線輸出要多算這麼久）
export function zyTail(patchId, synth) {
  const p = patchFor(patchId, synth);
  if (!p) return 1.5;
  if (p.drum) return 3.5;
  let t = Math.max(p.amp.r * 1.6, 0);
  if (!p.amp.s) t = Math.max(t, p.amp.d * 1.6 + p.amp.r);
  if (p.str && p.str.lvl) t = Math.max(t, Math.min(8, p.str.decay * 1.2));
  if (p.noise) t = Math.max(t, (p.noise.d || 0) + (p.noise.r || 0));
  return Math.min(10, t + 0.15);
}

let seq = 1;

// 起音；回傳 voice（跟 synth.js 的介面一致：release(t) / kill(t) / end）
// 回傳 null 代表 worklet 還沒好，呼叫端可以退回內建音色
export function zyVoice(ctx, dest, patchId, midi, vel, when, synth) {
  if (!ctx || !ctx.__zyReady) return null;
  const p = patchFor(patchId, synth);
  if (!p) return null;
  const e = getNode(ctx, dest);
  if (!e.sent.has(p.id)) { e.node.port.postMessage({ t: 'patch', p }); e.sent.add(p.id); }
  const id = seq++;
  const at = Math.max(when, ctx.currentTime);
  e.node.port.postMessage({ t: 'on', id, pid: p.id, n: midi, v: Math.max(1, Math.min(127, Math.round(vel))), at });

  const tail = zyTail(patchId, synth);
  const voice = {
    end: p.amp.s > 0 ? Infinity : at + tail,
    released: false,
    release(t) {
      if (voice.released) return;
      voice.released = true;
      e.node.port.postMessage({ t: 'off', id, at: Math.max(t, at) });
      voice.end = Math.max(t, at) + tail;
    },
    kill() {
      e.node.port.postMessage({ t: 'kill', id });
      voice.end = ctx.currentTime;
    },
  };
  return voice;
}

// 全部消音（換音色、停止播放時保險用）
export function zyPanic(ctx, dest) {
  const e = dest ? nodes.get(dest) : null;
  if (e) e.node.port.postMessage({ t: 'panic' });
}
