// 自動化：每軌的 volume / pan / send0 / send1 曲線
// 資料：track.auto[param] = { on, show, points: [{ t: 拍, v: 值 }] }（依 t 排序）
// 值的單位：volume = dB（-60~+6）、pan = -1~1、send = dB（-60~+6）
// 播放：在 engine 排程時把曲線轉成 AudioParam 的 linearRamp；離線輸出同一套。
import { spb } from './state.js';
import { dbToGain } from './util.js';

export const AUTO_PARAMS = {
  volume: { label: '音量', min: -60, max: 6, def: 0, fmt: v => (v <= -60 ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`), toParam: dbToGain },
  pan: { label: '聲像', min: -1, max: 1, def: 0, fmt: v => (Math.abs(v) < 0.01 ? '置中' : v < 0 ? `左 ${Math.round(-v * 64)}` : `右 ${Math.round(v * 64)}`), toParam: v => v },
  send0: { label: 'Send A', min: -60, max: 6, def: -60, fmt: v => (v <= -60 ? '關' : `${v.toFixed(1)} dB`), toParam: dbToGain },
  send1: { label: 'Send B', min: -60, max: 6, def: -60, fmt: v => (v <= -60 ? '關' : `${v.toFixed(1)} dB`), toParam: dbToGain },
};

export function lane(track, param) {
  if (!track.auto) track.auto = {};
  if (!track.auto[param]) track.auto[param] = { on: false, points: [] };
  return track.auto[param];
}

export const isActive = (track, param) => !!(track.auto?.[param]?.on && track.auto[param].points.length);

// 某個時間點（拍）的值：線性內插；第一點之前 / 最後一點之後維持端點值
export function valueAt(points, beat) {
  if (!points.length) return null;
  if (beat <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (beat >= last.t) return last.v;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (points[m].t <= beat) lo = m; else hi = m; }
  const a = points[lo], b = points[hi];
  return a.v + (b.v - a.v) * (beat - a.t) / (b.t - a.t || 1);
}

// 把自動化排進 AudioParam。when = ctx 上「專案 fromSec 秒」對應的時刻；
// 只排 fromSec 之後的點；until = 循環終點（秒）
// dB 參數用 linearRamp 在 gain 域會聽起來不線性，所以把每段切成小段（每 50ms 一點）在 dB 域內插
export function schedule(param, points, def, when, fromSec, untilSec = Infinity) {
  const b = spb();
  const fromBeat = fromSec / b, untilBeat = untilSec / b;
  const v0 = valueAt(points, fromBeat);
  param.cancelScheduledValues(0);
  param.setValueAtTime(def.toParam(v0), when);
  const isDb = def.min === -60;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.t <= fromBeat) continue;
    if (p.t > untilBeat) {
      // 循環終點：排到終點那一刻的內插值就停
      const vEnd = valueAt(points, untilBeat);
      param.linearRampToValueAtTime(def.toParam(vEnd), when + (untilSec - fromSec));
      break;
    }
    const prevT = Math.max(fromBeat, i ? points[i - 1].t : fromBeat);
    const prevV = valueAt(points, prevT);
    if (isDb && Math.abs(p.v - prevV) > 3) {
      const steps = Math.min(64, Math.ceil((p.t - prevT) * b / 0.05));
      for (let k = 1; k <= steps; k++) {
        const t = prevT + (p.t - prevT) * k / steps;
        param.linearRampToValueAtTime(def.toParam(prevV + (p.v - prevV) * k / steps), when + (t * b - fromSec));
      }
    } else param.linearRampToValueAtTime(def.toParam(p.v), when + (p.t * b - fromSec));
  }
}

// 編輯小工具
export function addPoint(l, t, v) {
  const p = { t: Math.max(0, t), v };
  l.points.push(p);
  l.points.sort((a, b) => a.t - b.t);
  return p;
}
export function removePoint(l, p) { l.points = l.points.filter(x => x !== p); }
