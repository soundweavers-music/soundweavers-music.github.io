// 本機測試：把示範人聲算出來、存成 wav 傳回伺服器，方便用 numpy 檢查頻譜
import { makeVocalBuffer } from './js/demo-project.js';

const out = document.getElementById('out');
try {
  const t0 = performance.now();
  const buf = makeVocalBuffer(92);
  const ms = Math.round(performance.now() - t0);
  const d = buf.getChannelData(0);

  // 16-bit PCM 單聲道 WAV
  const n = d.length;
  const ab = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * 2, true);
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, d[i]));
    dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  fetch('/__WAV__', { method: 'POST', body: ab }).then(() => {
    out.textContent = 'OK ' + JSON.stringify({
      seconds: +(n / buf.sampleRate).toFixed(2),
      ms, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4),
    });
  }).catch(e => { out.textContent = 'POST FAILED ' + e; });
} catch (e) {
  out.textContent = 'THREW ' + (e && e.stack || e);
}
