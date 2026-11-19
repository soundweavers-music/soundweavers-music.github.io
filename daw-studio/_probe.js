
const send = m => fetch('/__RESULT__', { method: 'POST', body: String(m) }).catch(() => {});
try {
  const { parseSF2, regionsFor } = await import('/outputs/world-instruments-static/tools/daw/js/sf2.js');
  const out = [];
  for (const f of ['builtin-piano', 'builtin-strings']) {
    try {
      const ab = await (await fetch(`/outputs/world-instruments-static/assets/daw-bank/${f}.sf2`)).arrayBuffer();
      const sf = parseSF2(ab);
      const r = [60, 72, 48].map(k => regionsFor(sf, 0, k, 100).length);
      const sm = sf.samples[0];
      out.push(`${f}: presets=${sf.presets.length} insts=${sf.instruments.length} samples=${sf.samples.length} regions=${r} s0=${sm && sm.start}-${sm && sm.end} pitch=${sm && sm.pitch}`);
    } catch (e) { out.push(`${f}: ERR ${e.message}`); }
  }
  send(out.join('
'));
} catch (e) { send('MODULE ERR ' + (e && e.message)); }
