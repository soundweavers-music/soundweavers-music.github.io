
import { bakedBuffer } from './js/bake.js';
import { PRESETS, PRESET_GROUPS } from './js/synth.js';
const out = document.getElementById('out');
try {
  const fake = { sampleRate: 44100, createBuffer: (c, n, sr) => ({ copyToChannel(d) { window.__d = d; window.__sr = sr; }, length: n }) };
  const rows = [];
  for (const [kind, freq] of [['piano', 261.63], ['piano', 440], ['pluck', 82.41], ['pluck', 330]]) {
    const t0 = performance.now();
    const got = bakedBuffer(fake, kind, freq, 0.8, { bright: 0.4 });
    const ms = Math.round(performance.now() - t0);
    const d = window.__d;
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); sum += d[i] * d[i]; }
    // 用自相關驗證基頻（只取 0.2 秒、降頻 4 倍）
    const step = 4, len = Math.min(22050, Math.floor(d.length / step));
    const x = new Float32Array(len);
    for (let i = 0; i < len; i++) x[i] = d[i * step];
    const sr2 = 44100 / step, want = Math.round(sr2 / freq);
    let best = 0, bestV = -1e9;
    for (let lag = Math.max(4, want - 8); lag <= want + 8; lag++) {
      let s2 = 0;
      for (let i = 0; i < len - lag; i++) s2 += x[i] * x[i + lag];
      if (s2 > bestV) { bestV = s2; best = lag; }
    }
    rows.push(`${kind} ${freq}Hz: ${(d.length / 44100).toFixed(2)}s peak=${peak.toFixed(2)} rms=${Math.sqrt(sum / d.length).toFixed(3)} lag=${best}/${want} ${ms}ms`);
  }
  out.textContent = rows.join('\n') + '\ngroups=' + PRESET_GROUPS.join(',') + '\nbakePresets=' + Object.keys(PRESETS).filter(k => PRESETS[k].bake).join(',');
} catch (e) { out.textContent = 'THREW ' + (e && e.stack || e); }
