// 效果器視覺圖：每一個效果器都有自己的圖，風格跟 EQ／殘響／立體聲寬度一致
// （深色漸層底、彩色漸層線、等寬字座標）。圖是從「參數」算出來的，所以不播放也會動；
// 播放時另外接一顆 analyser 顯示即時電平。
import { engine } from './engine.js';
import { satCurve, distortionCurve } from './effects.js';

const C = {
  teal: '#35c9a5', blue: '#4f9dff', gold: '#f5b83d', red: '#ff6b6b',
  purple: '#a78bfa', pink: '#f78fc3', green: '#9bd35a', orange: '#ff9f5a',
};
const FMIN = 20, FMAX = 20000;
const LOGF = Math.log(FMAX / FMIN);
const xOf = (f, x0, w) => x0 + Math.log(Math.max(FMIN, f) / FMIN) / LOGF * w;
const fOf = (x, x0, w) => FMIN * Math.exp((x - x0) / w * LOGF);
const HEIGHTS = {
  comp: 124, deess: 124, limiter: 112, gate: 124, transient: 118,
  sat: 122, drive: 118, exciter: 120, bitcrush: 122, ringmod: 120,
  delay: 112, stereodelay: 122, chorus: 118, flanger: 124, phaser: 124,
  tremolo: 120, autofilter: 122, pitch: 110, utility: 104,
};

// ---------- 畫布小工具 ----------
function scene(g, W, H) {
  // 固定深色底：這是「儀表」不是文件，跟殘響／立體聲寬度面板一致；
  // 也避免淺色主題下白字看不見（cssVar('--cv-bg-*') 在淺色主題是近白色）。
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#12141a');
  bg.addColorStop(1, '#0a0b0e');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
}
function text(g, s, x, y, col = 'rgba(255,255,255,.38)', font = '10px ui-monospace, Consolas, monospace') {
  g.fillStyle = col; g.font = font; g.fillText(s, x, y);
}
function line(g, x0, y0, x1, y1, col = 'rgba(255,255,255,.07)', w = 1) {
  g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
function freqGrid(g, x0, y0, w, h, labels = true) {
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const x = Math.round(xOf(f, x0, w)) + .5;
    line(g, x, y0, x, y0 + h, f === 1000 ? 'rgba(255,255,255,.11)' : 'rgba(255,255,255,.05)');
    if (labels && [100, 1000, 10000].includes(f)) text(g, f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, y0 + h - 3);
  }
  for (let i = 1; i < 4; i++) line(g, x0, y0 + h * i / 4, x0 + w, y0 + h * i / 4, 'rgba(255,255,255,.045)');
}
function polyline(g, pts, col, w = 2, fill = null) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (fill) { const f = new Path2D(p); f.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.fillStyle = fill; g.fill(f); }
  g.strokeStyle = col; g.lineWidth = w; g.stroke(p);
}
function lerp(a, b, t) { return a + (b - a) * t; }
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// 曲線陣列（-1..1）內插
function curveAt(arr, x) {
  const n = arr.length, i = Math.round((x * .5 + .5) * (n - 1));
  return arr[Math.max(0, Math.min(n - 1, i))];
}
function harmonics(fn, amp = .6, n = 9) {
  const M = 512, out = new Float64Array(n + 1);
  for (let i = 0; i < M; i++) {
    const ph = 2 * Math.PI * i / M, v = fn(amp * Math.sin(ph));
    for (let k = 1; k <= n; k++) out[k] += v * Math.sin(k * ph);
  }
  for (let k = 1; k <= n; k++) out[k] = Math.abs(out[k] * 2 / M);
  return out;
}
function hbar(g, x, y, w, h, v, max, col) {
  const hh = Math.max(1, h * Math.min(1, v / max));
  g.fillStyle = col; g.fillRect(x, y + h - hh, w, hh);
}

export function fxVisual(owner, desc, type) {
  const root = document.createElement('div');
  root.className = 'fxvis fxvis-' + type;
  const cv = document.createElement('canvas');
  cv.className = 'fxvis-cv';
  cv.style.height = (HEIGHTS[type] || 118) + 'px';
  root.appendChild(cv);
  const g = cv.getContext('2d');
  const born = performance.now();
  let raf = 0, W = 0, H = 0;

  // ---- 即時分析（播放時才有）----
  const live = { an: null, ctx: null, node: null, buf: null };
  function analyser() {
    const ctx = engine.ctx;
    if (!ctx || !engine.playing) return null;
    const inst = engine.fxInstance(owner, desc.id);
    if (!inst || !inst.output) return null;
    if (!live.an || live.ctx !== ctx) {
      live.an = ctx.createAnalyser(); live.an.fftSize = 2048;
      live.ctx = ctx; live.node = null; live.buf = new Float32Array(1024);
    }
    if (live.node !== inst.output) {
      try { if (live.node) live.node.disconnect(live.an); } catch (_) { /* noop */ }
      try { inst.output.connect(live.an); } catch (_) { /* noop */ }
      live.node = inst.output;
    }
    live.an.getFloatTimeDomainData(live.buf);
    let pk = 0; for (const v of live.buf) pk = Math.max(pk, Math.abs(v));
    return { an: live.an, peak: pk, buf: live.buf };
  }

  // 每個效果器畫的東西
  const PAINT = {
    // ── 動態：轉移曲線 ＋ 衰減量歷史 ──
    comp(g, W, H, P, env) {
      const cvw = Math.min(W - 96, 230), cvh = H - 30, x0 = 14, y0 = 14;
      transferGrid(g, x0, y0, cvw, cvh);
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const inDb = -60 + i / 100 * 60;
        const k = (P.knee ?? 6) / 2;
        let out = inDb;
        if (inDb > P.threshold + k) out = P.threshold + (inDb - P.threshold) / P.ratio;
        else if (k > 0 && inDb > P.threshold - k) {
          const xx = inDb - P.threshold + k;
          out = inDb + (1 / P.ratio - 1) * xx * xx / (4 * k);
        }
        pts.push([x0 + i / 100 * cvw, y0 + cvh - clamp01((out + 60) / 60) * cvh]);
      }
      polyline(g, pts, C.teal, 2.2);
      thresholdMark(g, x0, y0, cvw, cvh, P.threshold);
      grHistory(g, x0 + cvw + 18, y0, W - (x0 + cvw + 18) - 12, cvh, env.gr, 18, C.red);
      text(g, `−${P.ratio.toFixed(1)}:1`, x0 + 4, y0 + 11, C.teal);
    },
    limiter(g, W, H, P, env) {
      const cvw = Math.min(W - 96, 230), cvh = H - 30, x0 = 14, y0 = 14;
      transferGrid(g, x0, y0, cvw, cvh);
      const ceil = P.ceiling ?? -.3;
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const inDb = -60 + i / 100 * 60;
        const out = Math.min(inDb + (P.gain ?? 0), ceil);
        pts.push([x0 + i / 100 * cvw, y0 + cvh - clamp01((out + 60) / 60) * cvh]);
      }
      polyline(g, pts, C.gold, 2.2);
      const cy = y0 + cvh - clamp01((ceil + 60) / 60) * cvh;
      g.setLineDash([4, 4]); line(g, x0, cy, x0 + cvw, cy, 'rgba(255,107,107,.6)', 1); g.setLineDash([]);
      text(g, `上限 ${ceil.toFixed(1)} dBTP`, x0 + 4, cy - 5, C.red);
      grHistory(g, x0 + cvw + 18, y0, W - (x0 + cvw + 18) - 12, cvh, env.gr, 12, C.gold);
      text(g, `+${(P.gain ?? 0).toFixed(1)} dB`, x0 + 4, y0 + 11, C.gold);
    },
    gate(g, W, H, P, env) {
      const cvw = Math.min(W - 96, 240), cvh = H - 30, x0 = 14, y0 = 14;
      transferGrid(g, x0, y0, cvw, cvh, 80);
      const th = P.threshold ?? -50, ratio = P.ratio ?? 20, range = P.range ?? 60;
      const slope = ratio >= 19.5 ? 1 : 1 - 1 / ratio;
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const inDb = -80 + i / 120 * 80;
        const red = inDb >= th ? 0 : Math.max(-range, (inDb - th) * slope);
        pts.push([x0 + i / 120 * cvw, y0 + cvh - clamp01((inDb + red + 80) / 80) * cvh]);
      }
      polyline(g, pts, ratio >= 19.5 ? C.blue : C.purple, 2.2);
      thresholdMark(g, x0, y0, cvw, cvh, th, 80);
      text(g, `${ratio.toFixed(1)}:1`, x0 + 4, y0 + 11, C.purple);
      text(g, `最大 −${Math.round(range)} dB`, x0 + 4, y0 + cvh - 3, 'rgba(255,255,255,.4)');
      grHistory(g, x0 + cvw + 18, y0, W - (x0 + cvw + 18) - 12, cvh, env.gr, 40, C.purple);
    },
    transient(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 88, h = H - 34;
      // 一次鼓擊的包絡：起音段（快）＋延音段（慢）
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      const at = P.attack, su = P.sustain;
      const envPts = [], gainPts = [];
      for (let i = 0; i <= 160; i++) {
        const t = i / 160;
        const base = t < .08 ? t / .08 : Math.exp(-(t - .08) * 5.2);
        const tr = t < .08 ? 1 : Math.exp(-(t - .08) * 16);     // 「起音感」指標
        const gDb = at * tr + su * (1 - tr);
        envPts.push([x0 + t * w, y0 + h - base * (h - 10)]);
        gainPts.push([x0 + t * w, y0 + h / 2 - gDb / 12 * (h / 2 - 8)]);
      }
      polyline(g, envPts, C.blue, 2.2);
      g.globalAlpha = .35;
      polyline(g, gainPts, at >= 0 ? C.teal : C.red, 1.8);
      g.globalAlpha = 1;
      line(g, x0, y0 + h / 2, x0 + w, y0 + h / 2, 'rgba(255,255,255,.14)');
      text(g, '起音', x0 + 3, y0 + 11, C.teal);
      text(g, '延音', x0 + w * .55, y0 + 11, C.blue);
      // 右邊：兩根 dB 條
      const bx = x0 + w + 16, bh = h - 16, mid = y0 + bh / 2;
      text(g, '起音', bx, y0 + 8, C.teal);
      hbar(g, bx, y0 + 12, 16, bh / 2 - 16, Math.abs(at), 12, at >= 0 ? C.teal : C.red);
      text(g, `${at > 0 ? '+' : ''}${at.toFixed(1)}`, bx, mid + 22, 'rgba(255,255,255,.6)');
      text(g, '延音', bx, mid + 40, C.blue);
      hbar(g, bx, mid + 44, 16, bh / 2 - 16, Math.abs(su), 12, su >= 0 ? C.blue : C.red);
      text(g, `${su > 0 ? '+' : ''}${su.toFixed(1)}`, bx, y0 + bh + 4, 'rgba(255,255,255,.6)');
    },
    deess(g, W, H, P, env) {
      const cvw = Math.min(W - 96, 230), cvh = H - 30, x0 = 14, y0 = 14;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, cvw, cvh);
      const lo = P.freq / Math.pow(2, P.range / 2), hi = P.freq * Math.pow(2, P.range / 2);
      const bx0 = xOf(lo, x0, cvw), bx1 = xOf(hi, x0, cvw);
      const grad = g.createLinearGradient(bx0, 0, bx1, 0);
      grad.addColorStop(0, 'rgba(245,184,61,0)'); grad.addColorStop(.5, 'rgba(245,184,61,.5)'); grad.addColorStop(1, 'rgba(245,184,61,0)');
      g.fillStyle = grad; g.fillRect(bx0, y0 + 16, bx1 - bx0, cvh - 24);
      freqGrid(g, x0, y0, cvw, cvh);
      text(g, `${(P.freq / 1000).toFixed(1)} kHz`, x0 + 4, y0 + 11, C.gold);
      grHistory(g, x0 + cvw + 18, y0, W - (x0 + cvw + 18) - 12, cvh, env.gr, (P.amount ?? 8), C.red);
    },

    // ── 破音／音色：轉移曲線 ＋ 泛音柱 ──
    sat(g, W, H, P) {
      const cvw = Math.min(W * .46, 210), cvh = H - 30, x0 = 14, y0 = 14;
      transferSquare(g, x0, y0, cvw, cvh);
      const curve = satCurve(P.mode | 0, P.drive ?? 6);
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const x = -1 + i / 50;
        pts.push([x0 + (x + 1) / 2 * cvw, y0 + cvh / 2 - curveAt(curve, x) * cvh / 2]);
      }
      polyline(g, pts, [C.gold, C.orange, C.purple, C.red][P.mode | 0] || C.gold, 2.4);
      text(g, ['磁帶', '真空管', '電晶體', '硬削波'][P.mode | 0] || '', x0 + 4, y0 + 11, C.gold);
      harmonicsChart(g, x0 + cvw + 24, y0, W - (x0 + cvw + 24) - 14, cvh, harmonics(x => curveAt(curve, x), .6));
    },
    drive(g, W, H, P) {
      const cvw = Math.min(W * .46, 210), cvh = H - 30, x0 = 14, y0 = 14;
      transferSquare(g, x0, y0, cvw, cvh);
      const curve = distortionCurve(Math.pow(10, (P.drive ?? 12) / 20));
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const x = -1 + i / 50;
        pts.push([x0 + (x + 1) / 2 * cvw, y0 + cvh / 2 - curveAt(curve, x) / .9 * cvh / 2]);
      }
      polyline(g, pts, C.red, 2.4);
      text(g, `推入 +${(P.drive ?? 12).toFixed(0)} dB`, x0 + 4, y0 + 11, C.red);
      harmonicsChart(g, x0 + cvw + 24, y0, W - (x0 + cvw + 24) - 14, cvh, harmonics(x => curveAt(curve, x), .55));
    },
    exciter(g, W, H, P) {
      const x0 = 14, y0 = 12, w = W - 28, h = H - 32;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      freqGrid(g, x0, y0, w, h);
      const f0 = P.freq ?? 3000, m = (P.mix ?? 40) / 100, dr = (P.drive ?? 9) / 24;
      // 乾聲：平線；濕聲：分頻點以上一顆顆泛音（越高越密、越小）
      line(g, x0, y0 + h * .78, x0 + w, y0 + h * .78, 'rgba(255,255,255,.28)', 1.5);
      const px = xOf(f0, x0, w);
      g.fillStyle = 'rgba(245,184,61,.10)'; g.fillRect(px, y0, x0 + w - px, h);
      for (let k = 2; k <= 26; k++) {
        const f = f0 * k / 4;
        if (f > 19000) break;
        const x = xOf(f, x0, w);
        const amp = Math.pow(.82, k) * (0.35 + dr) * m;
        g.fillStyle = `rgba(245,184,61,${.25 + .6 * Math.min(1, amp * 2)})`;
        const bh = Math.max(1.5, amp * h * .95);
        g.fillRect(x - 1, y0 + h * .78 - bh, 2, bh);
      }
      text(g, `分頻 ${(f0 / 1000).toFixed(1)} kHz`, x0 + 3, y0 + 11, C.gold);
      text(g, '乾聲', x0 + w - 30, y0 + h * .78 + 12, 'rgba(255,255,255,.4)');
    },
    bitcrush(g, W, H, P) {
      const cvw = Math.min(W * .44, 200), cvh = H - 30, x0 = 14, y0 = 14;
      transferSquare(g, x0, y0, cvw, cvh);
      const bits = Math.max(1, P.bits | 0), lv = Math.pow(2, bits - 1);
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const x = -1 + i / 50;
        const y = Math.round(x * lv) / lv;
        pts.push([x0 + (x + 1) / 2 * cvw, y0 + cvh / 2 - y * cvh / 2]);
      }
      polyline(g, pts, C.purple, 2);
      text(g, `${bits} bit`, x0 + 4, y0 + 11, C.purple);
      // 右邊：正弦波被量化＋取樣保持的樣子
      const x1 = x0 + cvw + 24, w1 = W - x1 - 14, h1 = cvh;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x1, y0, w1, h1);
      const N = Math.max(8, Math.min(64, Math.round(w1 / (2 * 48000 / Math.max(500, P.rate ?? 12000)) * 3)));
      const raw = [], q = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = Math.sin(t * Math.PI * 4);
        raw.push([x1 + t * w1, y0 + h1 / 2 - x * h1 * .38]);
      }
      // 取樣保持：水平一段、垂直一跳（階梯），看得出「取樣率降低」長什麼樣
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        const x = Math.sin(t0 * Math.PI * 4);
        const y = y0 + h1 / 2 - (Math.round(x * lv) / lv) * h1 * .38;
        q.push([x1 + t0 * w1, y], [x1 + t1 * w1, y]);
      }
      polyline(g, raw, 'rgba(255,255,255,.22)', 1);
      polyline(g, q, C.purple, 2);
      text(g, `${(P.rate ?? 12000).toFixed(0)} Hz`, x1 + 4, y0 + 11, C.purple);
    },
    ringmod(g, W, H, P) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      const d = (P.depth ?? 100) / 100;
      const fc = (P.freq ?? 220) / 1000, in1 = [], car = [], out = [];
      for (let i = 0; i <= 240; i++) {
        const t = i / 240;
        const a = Math.sin(t * Math.PI * 2);           // 輸入 1 Hz
        const c = Math.sin(t * Math.PI * 2 * 5);       // 載波（示意）
        const y = a * (1 - d + d * c);
        in1.push([x0 + t * w, y0 + h * .28 - a * h * .18]);
        car.push([x0 + t * w, y0 + h * .55 - c * h * .12]);
        out.push([x0 + t * w, y0 + h * .82 - y * h * .16]);
      }
      polyline(g, in1, 'rgba(79,157,255,.55)', 1.4);
      polyline(g, car, 'rgba(255,255,255,.25)', 1.2);
      polyline(g, out, C.pink, 2.2);
      text(g, '輸入', x0 + 3, y0 + h * .28 - h * .2 + 2, 'rgba(79,157,255,.8)');
      text(g, `載波 ${P.freq ?? 220} Hz`, x0 + 3, y0 + h * .55 - h * .13, 'rgba(255,255,255,.45)');
      text(g, '相乘結果', x0 + 3, y0 + h * .82 - h * .18, C.pink);
    },

    // ── 延遲：一次次變小的回音 ──
    delay(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      const pp = !!P.pingpong;
      taps(g, x0, y0, w, h, [P.time, P.time], P.feedback ?? 35, pp, '拍');
      text(g, pp ? '左右彈跳' : '單聲道回音', x0 + 3, y0 + 11, C.blue);
    },
    stereodelay(g, W, H, P) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      taps(g, x0, y0, w, h, [P.timeL, P.timeR], P.feedback ?? 30, true, '拍', (P.cross ?? 0) / 100);
      text(g, `L ${P.timeL} 拍・R ${P.timeR} 拍`, x0 + 3, y0 + 11, C.blue);
    },

    // ── 調變：梳狀／陷波響應 ──
    chorus(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      freqGrid(g, x0, y0, w, h);
      const m = (P.mix ?? 40) / 100, base = .012, dep = (P.depth ?? 3) / 1000;
      const ph = env.t * (P.rate ?? .8) * 2 * Math.PI;
      for (const [col, off] of [[C.teal, 0], [C.blue, Math.PI]]) {
        const d = base + dep * Math.sin(ph + off);
        const pts = [];
        for (let i = 0; i <= 120; i++) {
          const f = fOf(x0 + i / 120 * w, x0, w), om = 2 * Math.PI * f * d;
          const mag = Math.hypot(1 + m * Math.cos(om), m * Math.sin(om));
          pts.push([x0 + i / 120 * w, y0 + h - clamp01(mag / 2) * h * .9 - 4]);
        }
        polyline(g, pts, col, 1.8);
      }
      text(g, '梳狀濾波（左右差半個週期）', x0 + 3, y0 + 11, C.teal);
    },
    flanger(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      freqGrid(g, x0, y0, w, h);
      const m = Math.min(1, (P.mix ?? 50) / 100), centre = (P.delay ?? 2.5) / 1000;
      const swing = centre * .9 * (P.depth ?? 60) / 100;
      const fb = (P.feedback ?? 35) / 100;
      const ph = env.t * (P.rate ?? .3) * 2 * Math.PI;
      for (const [col, off] of [[C.teal, 0], [C.blue, Math.PI]]) {
        const d = centre + swing * Math.sin(ph + off);
        const pts = [];
        for (let i = 0; i <= 160; i++) {
          const f = fOf(x0 + i / 160 * w, x0, w), om = 2 * Math.PI * f * d;
          // 回授的梳狀：1 / (1 − fb·e^{−jωd})，再與乾聲相加
          const den = Math.hypot(1 - fb * Math.cos(om), fb * Math.sin(om));
          const hw = den < 1e-4 ? 12 : 1 / den;
          const mag = Math.hypot(1 + m * hw * Math.cos(-om), m * hw * Math.sin(-om));
          pts.push([x0 + i / 160 * w, y0 + h - clamp01(mag / 4) * h * .9 - 3]);
        }
        polyline(g, pts, col, 1.8);
      }
      text(g, '梳狀濾波（回授越強、峰越尖）', x0 + 3, y0 + 11, C.teal);
    },
    phaser(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      freqGrid(g, x0, y0, w, h);
      const n = [4, 6, 8][P.stages | 0] || 6, f0 = P.freq ?? 600;
      const swing = (P.depth ?? 70) / 100 * 3;
      const ph = env.t * (P.rate ?? .4) * 2 * Math.PI;
      for (const [col, off] of [[C.purple, 0], [C.pink, Math.PI]]) {
        const fc = f0 * Math.pow(2, swing * Math.sin(ph + off));
        const pts = [];
        for (let i = 0; i <= 160; i++) {
          const f = fOf(x0 + i / 160 * w, x0, w);
          // 二階全通：相位 = −2·atan(...)；串 n 階 → n 倍的相位旋轉
          const T = Math.tan(Math.PI * Math.min(f, 20000) / (2 * fc * Math.sqrt(2)));
          const th = n * -2 * Math.atan(T);
          const m = (P.mix ?? 50) / 100;
          const mag = Math.hypot(1 + m * Math.cos(th), m * Math.sin(th));
          pts.push([x0 + i / 160 * w, y0 + h - clamp01(mag / 2) * h * .9 - 3]);
        }
        polyline(g, pts, col, 1.8);
      }
      text(g, `${n} 階全通`, x0 + 3, y0 + 11, C.purple);
    },
    tremolo(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      const d = (P.depth ?? 50) / 100, rate = P.rate ?? 4.5, shape = P.shape | 0;
      const wave = t => {
        const ph = (t * rate) % 1;
        if (shape === 1) return 1 - 4 * Math.abs(ph - .5);           // 三角
        if (shape === 2) return ph < .5 ? 1 : -1;                     // 方波
        return Math.sin(ph * 2 * Math.PI);
      };
      const pts = [];
      for (let i = 0; i <= 300; i++) {
        const t = i / 300 * .6;
        const gain = 1 - d / 2 + d / 2 * wave(t);
        pts.push([x0 + i / 300 * w, y0 + h - clamp01(gain) * (h - 6) - 3]);
      }
      polyline(g, pts, C.orange, 2.2);
      line(g, x0, y0 + h - 3, x0 + w, y0 + h - 3, 'rgba(255,255,255,.14)');
      const now = (env.t * rate) % 1;
      const gx = x0 + (now / (rate * .6)) % 1 * w;
      g.fillStyle = 'rgba(245,184,61,.9)'; g.beginPath(); g.arc(gx, y0 + 8, 3, 0, 7); g.fill();
      text(g, `${rate.toFixed(1)} Hz・深度 ${Math.round(d * 100)}%`, x0 + 3, y0 + 11, C.orange);
      text(g, P.stereo === 1 ? '左右反相（Auto-Pan）' : P.stereo === 2 ? '左右差 90°' : '單聲道', x0 + 3, y0 + h - 6, 'rgba(255,255,255,.45)');
    },
    autofilter(g, W, H, P, env) {
      const x0 = 14, y0 = 14, w = W - 28, h = H - 34;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      freqGrid(g, x0, y0, w, h);
      const f0 = P.freq ?? 800, q = P.q ?? 6, type = ['lowpass', 'highpass', 'bandpass'][P.type | 0];
      const swing = (P.depth ?? 60) / 100 * 3;
      const ph = env.t * (P.rate ?? 1.5) * 2 * Math.PI;
      const pts = [], ghost = [];
      for (let i = 0; i <= 160; i++) {
        const f = fOf(x0 + i / 160 * w, x0, w);
        const fc = f0 * Math.pow(2, swing * Math.sin(ph));
        const r = f / Math.max(1, fc);
        let mag;
        if (type === 'highpass') mag = r * r / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
        else if (type === 'bandpass') mag = (r / q) / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
        else mag = 1 / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
        const db = 20 * Math.log10(Math.max(1e-4, mag));
        pts.push([x0 + i / 160 * w, y0 + h - clamp01((db + 36) / 48) * h]);
      }
      // 掃描範圍的殘影
      for (const s of [-1, 1]) {
        for (let i = 0; i <= 80; i++) {
          const f = fOf(x0 + i / 80 * w, x0, w);
          const fc = f0 * Math.pow(2, swing * s), r = f / Math.max(1, fc);
          const mag = type === 'highpass' ? r * r / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2))
            : type === 'bandpass' ? (r / q) / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2))
              : 1 / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
          ghost.push([x0 + i / 80 * w, y0 + h - clamp01((20 * Math.log10(Math.max(1e-4, mag)) + 36) / 48) * h]);
        }
      }
      g.globalAlpha = .22; polyline(g, ghost, C.teal, 1); g.globalAlpha = 1;
      polyline(g, pts, C.green, 2.2);
      text(g, `Q ${q.toFixed(1)}・±${(swing).toFixed(1)} 八度`, x0 + 3, y0 + 11, C.green);
    },

    // ── 移調：音高階梯 ──
    pitch(g, W, H, P) {
      const x0 = 16, y0 = 18, w = W - 32, h = H - 40;
      const semis = (P.semitones ?? 0) + (P.cents ?? 0) / 100;
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
      const yBase = y0 + h * .62;
      line(g, x0, yBase, x0 + w, yBase, 'rgba(255,255,255,.35)', 1.4);
      text(g, '原音', x0 + 2, yBase + 12, 'rgba(255,255,255,.5)');
      const yShift = yBase - semis / 12 * (h * .42);
      line(g, x0, yShift, x0 + w, yShift, C.purple, 2);
      text(g, `${semis >= 0 ? '+' : ''}${semis.toFixed(2)} 半音`, x0 + 2, yShift - 6, C.purple);
      // 半音刻度
      for (let s = -24; s <= 24; s += 12) {
        const yy = yBase - s / 12 * (h * .42);
        if (yy < y0 - 2 || yy > y0 + h + 2) continue;
        line(g, x0 + w - 26, yy, x0 + w, yy, 'rgba(255,255,255,.16)');
        text(g, `${s > 0 ? '+' : ''}${s}`, x0 + w - 24, yy - 2, 'rgba(255,255,255,.4)');
      }
      // 顆粒大小（時間軸上的小格子）
      const gw = Math.max(6, Math.min(w * .6, (P.window ?? 60) / 200 * w));
      for (let x = 0; x < w; x += gw) {
        g.fillStyle = 'rgba(79,157,255,.14)'; g.fillRect(x0 + x, y0, Math.min(gw - 2, w - x), 6);
      }
      text(g, `顆粒 ${(P.window ?? 60).toFixed(0)} ms`, x0 + w - 92, y0 + 16, 'rgba(79,157,255,.8)');
    },

    // ── 工具：電平與相位 ──
    utility(g, W, H, P, env) {
      const x0 = 16, y0 = 14, w = W - 32, h = H - 30;
      const lv = [env.l || 0, env.r || 0];
      const playing = engine.playing;
      for (let c = 0; c < 2; c++) {
        const bx = x0 + c * (w / 2 + 6), bw = w / 2 - 6;
        g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(bx, y0, bw, h);
        // 刻度：−60 / −30 / −12 / 0 dB
        for (const dbv of [-60, -30, -12, 0]) {
          const y = y0 + h - (dbv + 60) / 60 * h;
          line(g, bx, y, bx + bw, y, dbv === 0 ? 'rgba(255,107,107,.35)' : 'rgba(255,255,255,.07)');
        }
        const db = 20 * Math.log10(Math.max(1e-5, lv[c]));
        const v = clamp01((db + 60) / 60);
        if (v > 0.002) {
          const grd = g.createLinearGradient(0, y0 + h, 0, y0);
          grd.addColorStop(0, C.teal); grd.addColorStop(.72, C.gold); grd.addColorStop(1, C.red);
          g.fillStyle = grd; g.fillRect(bx + 2, y0 + h - 2 - v * (h - 4), bw - 4, v * (h - 4));
        }
        text(g, c ? 'R' : 'L', bx + 4, y0 + 12, 'rgba(255,255,255,.6)');
        const ph = P.phase | 0;
        const inv = c === 0 ? (ph === 1 || ph === 3) : (ph === 2 || ph === 3);
        if (inv) text(g, 'Ø 反相', bx + bw - 40, y0 + 12, C.red);
      }
      if (!playing) text(g, '播放時顯示左右電平', x0 + 4, y0 + h / 2 + 4, 'rgba(255,255,255,.35)');
      text(g, `${(P.gain ?? 0) > 0 ? '+' : ''}${(P.gain ?? 0).toFixed(1)} dB`, x0, y0 + h + 14, 'rgba(255,255,255,.6)');
      const pan = (P.pan ?? 0) / 100;
      text(g, pan === 0 ? '中央' : pan < 0 ? `左 ${Math.round(-pan * 100)}%` : `右 ${Math.round(pan * 100)}%`, x0 + 74, y0 + h + 14, 'rgba(255,255,255,.45)');
      if (P.mono) text(g, '單聲道', x0 + 160, y0 + h + 14, C.purple);
    },
  };

  // ---- 共用小圖 ----
  function transferGrid(g, x0, y0, w, h, range = 60) {
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
    for (let i = 1; i < 4; i++) {
      line(g, x0, y0 + h * i / 4, x0 + w, y0 + h * i / 4, 'rgba(255,255,255,.05)');
      line(g, x0 + w * i / 4, y0, x0 + w * i / 4, y0 + h, 'rgba(255,255,255,.05)');
    }
    g.setLineDash([3, 4]); line(g, x0, y0 + h, x0 + w, y0, 'rgba(255,255,255,.16)'); g.setLineDash([]);
    text(g, `−${range}`, x0 + 2, y0 + h - 4);
    text(g, '0 dB', x0 + w - 26, y0 + h - 4);
  }
  function transferSquare(g, x0, y0, w, h) {
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
    g.setLineDash([3, 4]); line(g, x0, y0 + h, x0 + w, y0, 'rgba(255,255,255,.16)'); g.setLineDash([]);
    line(g, x0 + w / 2, y0, x0 + w / 2, y0 + h, 'rgba(255,255,255,.08)');
    line(g, x0, y0 + h / 2, x0 + w, y0 + h / 2, 'rgba(255,255,255,.08)');
    text(g, '輸入 →', x0 + 3, y0 + h - 3);
  }
  function thresholdMark(g, x0, y0, w, h, th, range = 60) {
    const tx = x0 + (th + range) / range * w;
    g.setLineDash([3, 3]); line(g, tx, y0, tx, y0 + h, 'rgba(245,184,61,.55)'); g.setLineDash([]);
    text(g, `${th}`, tx + 3, y0 + 10, 'rgba(245,184,61,.8)');
  }
  function grHistory(g, x0, y0, w, h, gr, max, col) {
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
    const v = Math.max(0, gr || 0);
    const grd = g.createLinearGradient(0, y0, 0, y0 + h);
    grd.addColorStop(0, col); grd.addColorStop(1, col + '22');
    g.fillStyle = grd;
    g.fillRect(x0 + 2, y0 + 2, w - 4, Math.min(h - 4, v / max * (h - 4)));
    text(g, v < .05 ? '0.0 dB' : `−${v.toFixed(1)} dB`, x0 + 3, y0 + h + 12, 'rgba(255,255,255,.55)');
    text(g, '衰減量', x0 + 3, y0 + 10, 'rgba(255,255,255,.3)');
  }
  function harmonicsChart(g, x0, y0, w, h, hh) {
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
    let mx = .001; for (let k = 1; k < hh.length; k++) mx = Math.max(mx, hh[k]);
    const bw = w / (hh.length - 1);
    for (let k = 1; k < hh.length; k++) {
      hbar(g, x0 + (k - 1) * bw + 2, y0 + 4, bw - 4, h - 16, hh[k], mx, k === 1 ? C.teal : C.gold);
      if (k <= 4) text(g, `${k}`, x0 + (k - 1) * bw + bw / 2 - 3, y0 + h - 4, 'rgba(255,255,255,.35)');
    }
    text(g, '泛音', x0 + w - 24, y0 + 11, 'rgba(255,255,255,.3)');
  }
  function taps(g, x0, y0, w, h, times, fbPct, stereo, unit, cross = 0) {
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x0, y0, w, h);
    line(g, x0 + 6, y0 + h - 6, x0 + w - 6, y0 + h - 6, 'rgba(255,255,255,.18)');
    const tMax = Math.max(...times) * 4 || 1;
    const fb = Math.min(.92, fbPct / 100);
    const N = 10;
    for (let n = 0; n < N; n++) {
      const tn = (n + 1) * times[n % 2];
      if (tn > tMax) break;
      const x = x0 + 6 + Math.min(1, tn / tMax) * (w - 12);
      const amp = Math.pow(fb, n) * (n === 0 ? 1 : 1);
      const bh = Math.max(2, amp * (h - 18));
      const col = stereo ? (n % 2 ? C.pink : C.blue) : C.blue;
      g.fillStyle = col; g.globalAlpha = .85;
      g.fillRect(x - 1.5, y0 + h - 6 - bh, 3, bh);
      g.globalAlpha = 1;
      text(g, `${n + 1}`, x - 2, y0 + h - 9 - bh, 'rgba(255,255,255,.35)');
    }
    text(g, `回授 ${Math.round(fbPct)}%${cross ? `・交叉 ${Math.round(cross * 100)}%` : ''}`, x0 + 4, y0 + 11, 'rgba(255,255,255,.45)');
  }

  // 立體聲電平（Utility 的左右表）：接一對 analyser 到效果器輸出
  const pair = { split: null, anL: null, anR: null, ctx: null, node: null, bl: new Float32Array(512), br: new Float32Array(512) };
  function stereoAnalyser() {
    const ctx = engine.ctx;
    if (!ctx || !engine.playing) return null;
    const inst = engine.fxInstance(owner, desc.id);
    if (!inst || !inst.output) return null;
    if (!pair.anL || pair.ctx !== ctx) {
      pair.anL = ctx.createAnalyser(); pair.anR = ctx.createAnalyser();
      pair.anL.fftSize = pair.anR.fftSize = 1024;
      pair.split = ctx.createChannelSplitter(2);
      pair.split.connect(pair.anL, 0); pair.split.connect(pair.anR, 1);
      pair.ctx = ctx; pair.node = null;
    }
    if (pair.node !== inst.output) {
      try { if (pair.node) pair.node.disconnect(pair.split); } catch (_) { /* noop */ }
      try { inst.output.connect(pair.split); } catch (_) { /* noop */ }
      pair.node = inst.output;
    }
    pair.anL.getFloatTimeDomainData(pair.bl);
    pair.anR.getFloatTimeDomainData(pair.br);
    let a = 0, b = 0;
    for (const v of pair.bl) a = Math.max(a, Math.abs(v));
    for (const v of pair.br) b = Math.max(b, Math.abs(v));
    return { l: a, r: b };
  }

  // ---- 主迴圈 ----
  const frame = () => {
    if (!root.isConnected) return;
    const dpr = devicePixelRatio || 1;
    const w = cv.clientWidth || 360, h = cv.clientHeight || 118;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h;
    scene(g, W, H);
    const P = desc.params || {};
    const inst = engine.ctx && engine.fxInstance(owner, desc.id);
    const ana = analyser();
    const env = {
      t: (performance.now() - born) / 1000,
      // reduction() 各家回傳的正負號不一致（壓縮器是負、limiter/gate 是正），一律取絕對值
      gr: inst && inst.reduction ? Math.abs(inst.reduction()) : 0,
      l: ana ? ana.peak : 0, r: ana ? ana.peak : 0,
    };
    // Utility 的立體聲表要分左右：另外接一對 analyser
    if (type === 'utility') {
      const pair = stereoAnalyser();
      if (pair) { env.l = pair.l; env.r = pair.r; }
    }
    const paint = PAINT[type];
    if (paint) paint(g, W, H, P, env);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  root._dispose = () => {
    cancelAnimationFrame(raf);
    try { if (live.node && live.an) live.node.disconnect(live.an); } catch (_) { /* noop */ }
    try { if (pair.node && pair.split) pair.node.disconnect(pair.split); } catch (_) { /* noop */ }
  };
  // 參數被換掉（undo／套預設）時只要重新接線，不用整個重建
  root._refresh = () => {
    try { if (live.node && live.an) live.node.disconnect(live.an); } catch (_) { /* noop */ }
    try { if (pair.node && pair.split) pair.node.disconnect(pair.split); } catch (_) { /* noop */ }
    live.node = null; pair.node = null;
  };
  return root;
}
