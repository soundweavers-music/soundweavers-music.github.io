// 即時「烘焙」音色：按下音符時才算出波形，存成 AudioBuffer 之後重複使用。
// 不讀任何外部檔案、不需要下載，所以離線也能用。
//
// 為什麼比原本的諧波表好聽：真實樂器的泛音會各自衰減（高頻先消失）、
// 撥弦有擊弦瞬間的寬頻雜訊、鋼琴兩三條弦之間會微微失諧而「打拍」。
// 這些都是「隨時間變化」的東西，固定諧波表做不出來。

const SR_MIN = 22050;
const cache = new Map();
const MAX_CACHE = 160;

function key(kind, midi, vel, sr) {
  return kind + ':' + midi + ':' + Math.round(vel * 4) + ':' + sr;
}

function chance(seed) {           // 可重現的偽亂數，同一個音每次烘焙結果一樣
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── 撥弦：Karplus-Strong 加琴身共鳴 ──────────────────────────
function bakePluck(sr, freq, seconds, vel, bright) {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const N = Math.max(2, Math.round(sr / freq));
  const line = new Float32Array(N);
  const rnd = chance(Math.round(freq * 1000));

  // 激發：低通過的噪音（越亮＝撥得越靠近琴橋）
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const w = rnd() * 2 - 1;
    lp += (w - lp) * bright;
    line[i] = lp;
  }
  // 撥弦位置造成的梳狀濾波：讓某些泛音特別強
  const pick = Math.max(1, Math.round(N * 0.18));
  for (let i = N - 1; i >= pick; i--) line[i] -= line[i - pick] * 0.75;

  const damp = 0.996 - 0.06 * (1 - vel) - Math.min(0.02, freq / 40000);
  let idx = 0;
  // 琴身：兩個簡單的共振，讓聲音有「木頭」
  // 琴身：一顆二階共振，讓聲音有「木頭」而不是純弦
  const r1 = 0.995, th1 = 2 * Math.PI * Math.min(1400, freq * 4.2) / sr;
  const c1 = 2 * r1 * Math.cos(th1), c2 = -r1 * r1, a0 = 1 - c1 - c2;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % N];
    line[idx] = damp * 0.5 * (cur + nxt);       // 平均 + 衰減＝高頻先消
    const y = a0 * cur + c1 * y1 + c2 * y2;
    y2 = y1; y1 = y;
    out[i] = cur * 0.85 + y * 0.5;
    idx = (idx + 1) % N;
  }
  return out;
}

// ── 鋼琴：加法合成，泛音各自衰減、兩條弦微微失諧 ──────────────
function bakePiano(sr, freq, seconds, vel) {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const B = 0.0004 * Math.pow(freq / 261.63, 1.2);      // 非諧和性：越高越明顯
  const bright = 0.55 + 0.45 * vel;                       // 力度決定亮度
  const detune = 1 + 0.0007;                              // 第二條弦
  for (let k = 1; k <= 16; k++) {
    const f0 = k * freq * Math.sqrt(1 + B * k * k);
    if (f0 > sr * 0.45) break;
    const amp = Math.pow(k, -1.5) * bright * (k <= 2 ? 1 : 0.9);
    const tau = (2.6 / (1 + 0.55 * (k - 1))) * (0.7 + 0.6 * vel);
    // 用遞迴式產生正弦（sin(nw) = 2cos(w)·sin((n-1)w) − sin((n-2)w)）：
    // 每樣本只要兩次乘法，比 Math.sin 快一個數量級，否則第一個音會卡 0.4 秒
    const w = 2 * Math.PI * f0 / sr;
    const w2 = 2 * Math.PI * f0 * detune / sr;
    const step = Math.exp(-1 / (tau * sr));
    const c1 = 2 * Math.cos(w), c2 = 2 * Math.cos(w2);
    let env = amp;
    let s1a = Math.sin(k * 0.7 - w), s2a = Math.sin(k * 0.7 - 2 * w);
    let s1b = Math.sin(k * 0.7 + 1.1 - w2), s2b = Math.sin(k * 0.7 + 1.1 - 2 * w2);
    for (let i = 0; i < n; i++) {
      const ya = c1 * s1a - s2a;
      const yb = c2 * s1b - s2b;
      out[i] += env * (ya + 0.8 * yb);
      s2a = s1a; s1a = ya;
      s2b = s1b; s1b = yb;
      env *= step;
    }
  }
  // 打擊瞬間的「咚」
  const rnd = chance(Math.round(freq));
  for (let i = 0; i < Math.min(n, sr * 0.02); i++) {
    out[i] += (rnd() * 2 - 1) * 0.12 * vel * Math.exp(-i / (sr * 0.004));
  }
  return out;
}

/**
 * 取得（或烘焙）一個音。回傳 { buffer, duration }。
 * kind: 'pluck' | 'piano'
 */
export function bakedBuffer(ctx, kind, freq, vel, opts) {
  opts = opts || {};
  const sr = ctx.sampleRate;
  const k = key(kind, Math.round(freq * 10), vel, sr);
  let entry = cache.get(k);
  if (entry) return entry;

  const seconds = kind === 'piano' ? 4.2 : 2.6;
  let data;
  if (kind === 'piano') data = bakePiano(sr, freq, seconds, vel);
  else data = bakePluck(sr, freq, seconds, vel, opts.bright || 0.5);

  // 頭尾修一下，避免爆音
  const fade = Math.min(data.length, Math.floor(sr * 0.004));
  for (let i = 0; i < fade; i++) data[i] *= i / fade;
  const tail = Math.min(data.length, Math.floor(sr * 0.05));
  for (let i = 0; i < tail; i++) data[data.length - 1 - i] *= i / tail;

  let peak = 1e-6;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const g = (kind === 'piano' ? 0.75 : 0.85) / peak;
  for (let i = 0; i < data.length; i++) data[i] *= g;

  const buffer = ctx.createBuffer(1, data.length, sr);
  buffer.copyToChannel(data, 0);
  entry = { buffer: buffer, duration: seconds };
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(k, entry);
  return entry;
}

/** 把烘焙好的音接到輸出：回傳跟 synth.js 其他音色一樣的 voice 介面 */
export function bakedVoice(ctx, dest, preset, midi, vel, when) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  if (!isFinite(freq) || freq < 20 || freq > 8000) return null;
  const got = bakedBuffer(ctx, preset.bake, freq, vel, preset.bakeOpts);
  const src = ctx.createBufferSource();
  src.buffer = got.buffer;
  const g = ctx.createGain();
  const peak = 0.9 * (preset.gain || 1) * (0.35 + 0.65 * vel);
  const t0 = Math.max(when || 0, ctx.currentTime + 0.001);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  src.connect(g).connect(dest);
  src.start(t0);
  const end = t0 + got.duration;
  let stopped = false;
  return {
    release(at) {
      if (stopped) return;
      const t = Math.max(at || ctx.currentTime, ctx.currentTime);
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (preset.release || 0.25));
      try { src.stop(t + (preset.release || 0.25) + 0.02); } catch (e) { /* 已停 */ }
      stopped = true;
    },
    end: end,
  };
}
