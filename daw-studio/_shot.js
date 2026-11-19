import { newFx } from './js/effects.js';
// 課程截圖用：照 ?do= 的指令把介面操作到指定狀態，好了才通知伺服器放行截圖
const P = new URLSearchParams(location.search);
const acts = (P.get('do') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
const EVALS = [];
const waitFor = async function (fn, ms) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > (ms || 10000)) return false; await sleep(60); }
  return true;
};
await waitFor(function () { return !!window.__daw; });
await waitFor(function () { return document.querySelectorAll('#lanes .clip-row, #lanes canvas, .clip').length > 0; }, 3000);
await sleep(500);
for (const a of acts) {
  const parts = a.split(':');
  const key = parts[0], arg = parts.slice(1);
  try {
    if (key === 'click') document.getElementById(arg[0]) && document.getElementById(arg[0]).click();
    else if (key === 'dlg') { const d = document.getElementById(arg[0]); if (d && d.showModal) d.showModal(); }
    else if (key === 'track') {        // 選第 N 條軌道（0 起算）
      const heads = document.querySelectorAll('#headersInner .track-head');
      const h = heads[Number(arg[0] || 0)];
      if (h) h.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      if (h) h.click();
    }
    else if (key === 'fx') {
      const slots = document.querySelectorAll('#inspector .fx-slot');
      const i = Number(arg[0] || 0);
      if (slots[i]) slots[i].click();
    }
    else if (key === 'clicktext') {
      const re = new RegExp(arg.join(':'));
      const el = Array.from(document.querySelectorAll('#inspector .fx-slot, .track-head, button'))
        .find(function (e) { return re.test(e.textContent); });
      if (el) el.click();
    }
    else if (key === 'fx2') {          // 暫時掛一個效果器並打開它的面板
      const t = window.__daw.store.project.tracks[Number(arg[1] || 0)];
      const fx = newFx(arg[0]);        // 預設參數才不會顯示 NaN
      t.inserts.push(fx);
      window.__daw.store.changed('fx');
      window.__daw.openFxPanel(t.id, fx.id);
    }
    else if (key === 'wait') await sleep(Number(arg[0]));
    else if (key === 'eval') { const js = decodeURIComponent(arg.join(':')); (0, eval)(js); EVALS.push(js); }
  } catch (e) { console.warn('shot action failed', a, e); }
  await sleep(420);
}
await sleep(350);
// 介面重繪會把捲動位置歸零，量座標前再套一次
for (const js of EVALS) { try { (0, eval)(js); } catch (e) {} }
await sleep(200);
// 把畫面元素的位置回報給截圖腳本，標註框才不會用寫死的座標
try {
  const sels = (P.get('rects') || '').split('|').filter(Boolean);
  const out = {};
  out.__viewport = [[window.innerWidth, window.innerHeight,
                     document.documentElement.scrollHeight, document.body.clientHeight]];
  for (const sel of sels) {
    out[sel] = Array.from(document.querySelectorAll(sel)).slice(0, 8).map(function (el) {
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    });
  }
  await fetch('/__RECTS__', { method: 'POST', body: JSON.stringify(out) });
} catch (e) { console.warn('rects failed', e); }
document.documentElement.setAttribute('data-shot-ready', '1');
fetch('/__READY__').catch(function () {});
