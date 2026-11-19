// 高品質和聲的背景執行緒：分析主唱、算出每個聲部（不會卡住畫面）
import { analyzeLead, renderHarmony } from './harmony-hq.js';

const cache = new Map();   // key -> analysis（同一段錄音換設定時不必重新分析）

self.onmessage = e => {
  const d = e.data;
  try {
    if (d.type === 'render') {
      const chans = d.chans.map(b => new Float32Array(b));
      let A = d.key ? cache.get(d.key) : null;
      const onP = p => self.postMessage({ type: 'progress', id: d.id, p });
      if (!A) {
        const n = chans[0].length, x = new Float32Array(n);
        for (const c of chans) for (let i = 0; i < n; i++) x[i] += c[i] / chans.length;
        A = analyzeLead(x, d.sr, { fmin: d.cfg.fmin, fmax: d.cfg.fmax }, p => onP(p * 0.6));
        if (d.key) { cache.set(d.key, A); if (cache.size > 24) cache.delete(cache.keys().next().value); }
      }
      const r = renderHarmony(chans, d.sr, d.cfg, { voices: d.voices, t0: d.t0, analysis: A, vibKeep: d.vibKeep }, p => onP(0.6 + 0.4 * Math.max(0, (p - 0.6) / 0.4)));
      const out = {}, tr = [];
      for (const [v, [L, R]] of Object.entries(r.voices)) { out[v] = [L.buffer, R.buffer]; tr.push(L.buffer, R.buffer); }
      // 給介面畫主唱音高（每 10 ms 一點）
      const midi = new Float32Array(Math.ceil(A.midi.length / 2));
      for (let i = 0; i < midi.length; i++) midi[i] = A.voiced[i * 2] ? A.midi[i * 2] : 0;
      self.postMessage({ type: 'done', id: d.id, voices: out, midi: midi.buffer }, [...tr, midi.buffer]);
    } else if (d.type === 'clear') cache.clear();
  } catch (err) {
    self.postMessage({ type: 'error', id: d.id, message: String(err && err.message || err) });
  }
};
