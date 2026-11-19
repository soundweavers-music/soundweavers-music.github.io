import { store } from './js/state.js';
import { compose } from './js/ai-compose.js';
import { chordPcs, chordName } from './js/chords.js';
import { generate } from './js/ai-arrange.js';
import { toggleAI, _ai } from './js/ai-ui.js';
const out = { runs: [] };
try {
  let strongOk = 0, strong = 0, steps = 0, ivs = 0, big = 0, tritone = 0, endTonic = 0, inScale = 0, total = 0;
  const forms = ['short', 'std', 'full'];
  for (let i = 0; i < 60; i++) {
    const key = i % 12, minor = i % 3 === 2;
    const r = compose({ key, minor, form: forms[i % 3], register: (i % 3) - 1, variation: (i % 5) / 4, startBar: 4, progSeed: 100 + i, melSeed: 900 + i });
    const major = minor ? (key + 3) % 12 : key, sc = [0,2,4,5,7,9,11];
    const m = r.melody;
    for (let j = 0; j < m.length; j++) {
      const n = m[j]; total++;
      if (sc.includes(((n.p - major) % 12 + 12) % 12)) inScale++;
      const c = r.chords.find(x => n.t >= x.t && n.t < x.t + x.d);
      const isStrong = Math.abs(n.t % 2) < 1e-6 || n.d >= 0.9;
      if (isStrong) { strong++; if (chordPcs(c) & (1 << (n.p % 12))) strongOk++; }
      if (j) { const a = Math.abs(n.p - m[j-1].p); ivs++; if (a <= 2) steps++; if (a > 7) big++; if (a === 6) tritone++; }
    }
    if (((m[m.length-1].p - key) % 12 + 12) % 12 === 0) endTonic++;
    if (i < 4) out.runs.push({ key, minor, form: forms[i%3], secs: r.sections.map(s => s.type + ':' + s.prog).join(' | '), chords: r.chords.slice(0, 12).map(chordName).join(' '), mel: m.slice(0, 16).map(n => n.p).join(' '), range: [Math.min(...m.map(n=>n.p)), Math.max(...m.map(n=>n.p))], plan: r.plan.map(x=>x.sec+':'+x.bars).join(' ') });
  }
  out.stats = { strongOnChordTone: (strongOk/strong).toFixed(3), stepwise: (steps/ivs).toFixed(3), leapsOver5th: (big/ivs).toFixed(3), tritones: tritone, inScale: (inScale/total).toFixed(3), endOnTonic: endTonic + '/60' };
  // UI：寫入專案 + 接一鍵編曲
  toggleAI(true);
  document.querySelector('[data-tab="compose"]').click();
  _ai.runCompose(11, 22);
  const p = store.project;
  out.applied = { chords: p.chords.length, key: p.chordKey, bpm: p.bpm, tracks: p.tracks.map(t => t.name + ':' + t.clips.length + ':' + (t.clips[0]?.notes?.length || 0)).join(', ') };
  _ai.runCompose(11, 23);   // 只換旋律：不要多一條軌
  out.reapply = p.tracks.filter(t => t.aiMelody).map(t => t.clips.length).join(',');
  document.querySelector('.aic-next').click();
  out.planAfter = _ai.plan.map(x => x.sec + ':' + x.bars).join(' ');
  _ai.runGenerate(true);
  out.arr = p.tracks.map(t => t.name + ':' + t.clips.length).join(', ');
  document.querySelector('[data-tab="compose"]').click();
} catch (e) { out.err = e.stack; }
fetch('/__RESULT__?' + encodeURIComponent(JSON.stringify(out)));
