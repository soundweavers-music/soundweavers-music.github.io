// 編排視窗的座標換算與縮放狀態
import { store } from './state.js';

export const view = {
  pxPerBeat: 40,
  trackH: 64,
  minPxPerBeat: 4,
  maxPxPerBeat: 640,
};

export const beatSec = () => 60 / store.project.bpm;
export const pxPerSec = () => view.pxPerBeat / beatSec();
export const secToPx = s => s * pxPerSec();
export const pxToSec = px => px / pxPerSec();

// 依縮放決定格線單位（秒）：太擠就用小節，夠寬就細分到 1/16
export function gridStep() {
  const b = beatSec();
  const p = view.pxPerBeat;
  if (p >= 160) return b / 4;
  if (p >= 70) return b / 2;
  if (p >= 18) return b;
  return b * store.project.sigNum;
}

export function snap(sec, force = false) {
  if (!store.project.snap && !force) return sec;
  const g = gridStep();
  return Math.round(sec / g) * g;
}

export function setZoom(pxPerBeat) {
  view.pxPerBeat = Math.min(view.maxPxPerBeat, Math.max(view.minPxPerBeat, pxPerBeat));
  store.emit('zoom', {});
}
