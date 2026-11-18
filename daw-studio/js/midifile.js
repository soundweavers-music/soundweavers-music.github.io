// Standard MIDI File 讀寫（format 0 / 1），只處理編曲需要的事件：
// note on/off、tempo、拍號、program change、軌道名稱；其他事件略過。

// ---------- 讀取 ----------
export function parseMidi(arrayBuffer) {
  const d = new DataView(arrayBuffer);
  let o = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(o + i)); o += n; return s; };
  const u32 = () => { const v = d.getUint32(o); o += 4; return v; };
  const u16 = () => { const v = d.getUint16(o); o += 2; return v; };
  const u8 = () => d.getUint8(o++);
  const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

  if (str(4) !== 'MThd') throw new Error('不是 MIDI 檔（缺少 MThd 標頭）');
  const hlen = u32();
  const format = u16(), ntrk = u16(), div = u16();
  o += hlen - 6;
  if (div & 0x8000) throw new Error('不支援 SMPTE 時間格式的 MIDI 檔');
  const ppq = div;

  const tempos = [];   // { tick, uspq }
  let sig = null;
  const tracks = [];
  for (let ti = 0; ti < ntrk && o < d.byteLength; ti++) {
    const id = str(4), len = u32(), end = o + len;
    if (id !== 'MTrk') { o = end; continue; }
    let tick = 0, status = 0;
    const open = new Map();    // (ch<<8|pitch) -> [{tick, vel}]
    const tr = { name: '', notes: [], channel: null, program: null };
    const dec = new TextDecoder();
    while (o < end) {
      tick += vlq();
      let b = u8();
      if (b === 0xff) {
        const type = u8(), l = vlq();
        if (type === 0x51 && l === 3) tempos.push({ tick, uspq: (d.getUint8(o) << 16) | (d.getUint8(o + 1) << 8) | d.getUint8(o + 2) });
        else if (type === 0x58 && l >= 2 && !sig) sig = { num: d.getUint8(o), den: Math.pow(2, d.getUint8(o + 1)) };
        else if (type === 0x03 && !tr.name) tr.name = dec.decode(new Uint8Array(arrayBuffer, o, l)).replace(/\0/g, '').trim();
        o += l;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) { o += vlq(); continue; }
      if (b & 0x80) status = b; else o--;   // running status
      const type = status & 0xf0, ch = status & 0x0f;
      if (type === 0x90 || type === 0x80) {
        const p = u8(), v = u8();
        const key = (ch << 8) | p;
        if (type === 0x90 && v > 0) {
          if (!open.has(key)) open.set(key, []);
          open.get(key).push({ tick, vel: v });
          if (tr.channel === null) tr.channel = ch;
        } else {
          const st = open.get(key);
          const on = st && st.shift();
          if (on) tr.notes.push({ p, on: on.tick, off: tick, v: on.vel, ch });
        }
      } else if (type === 0xc0) { const prg = u8(); if (tr.program === null) tr.program = prg; }
      else if (type === 0xd0) o += 1;
      else o += 2;   // 0xA0 0xB0 0xE0
    }
    // 沒收到 note-off 的音符，以軌道結尾收掉
    for (const [key, st] of open) for (const on of st) tr.notes.push({ p: key & 0xff, on: on.tick, off: tick, v: on.vel, ch: key >> 8 });
    o = end;
    if (tr.notes.length) tracks.push(tr);
  }
  tempos.sort((a, b) => a.tick - b.tick);
  // 拍 = tick / ppq（以四分音符為一拍，跟本程式一致）
  const toBeat = t => t / ppq;
  const out = tracks.map(tr => ({
    name: tr.name,
    channel: tr.channel,
    program: tr.program,
    drums: tr.channel === 9,
    notes: tr.notes.map(n => ({ p: n.p, t: toBeat(n.on), d: Math.max(1 / 64, toBeat(n.off - n.on)), v: n.v }))
      .sort((a, b) => a.t - b.t),
  }));
  return {
    format, ppq,
    bpm: tempos.length ? Math.round(60000000 / tempos[0].uspq * 100) / 100 : 120,
    tempoChanges: tempos.length,
    sig: sig || { num: 4, den: 4 },
    tracks: out,
  };
}

// GM program（0–127）→ 內建音色
export function presetForProgram(prog, drums) {
  if (drums) return 'drums';
  if (prog == null) return 'piano';
  if (prog <= 3) return 'piano';
  if (prog <= 5) return 'epiano';
  if (prog <= 7) return 'piano';
  if (prog <= 10) return 'bells';
  if (prog <= 15) return 'marimba';
  if (prog <= 23) return 'organ';
  if (prog <= 31) return 'pluck';          // 吉他
  if (prog <= 39) return prog <= 33 ? 'fbass' : 'bass';
  if (prog === 45) return 'pizz';
  if (prog <= 51) return 'strings';
  if (prog <= 55) return 'pad';            // 合唱
  if (prog <= 79) return 'lead';           // 銅管、木管
  if (prog <= 87) return 'lead';
  if (prog <= 95) return 'pad';
  if (prog <= 103) return 'pad';
  if (prog <= 111) return 'pluck';
  if (prog <= 119) return 'marimba';
  return 'pad';
}

// ---------- 寫出 ----------
// tracks: [{ name, channel, program, notes:[{p,t,d,v}] }]（t/d 以拍為單位）
export function writeMidi({ bpm, sigNum = 4, sigDen = 4, tracks, ppq = 480 }) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const u32 = v => push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const u16 = v => push((v >>> 8) & 255, v & 255);
  const vlq = v => {
    const st = [v & 0x7f];
    while ((v >>= 7)) st.unshift((v & 0x7f) | 0x80);
    return st;
  };
  const chunk = (id, body) => { for (const c of id) push(c.charCodeAt(0)); u32(body.length); bytes.push(...body); };
  const text = s => [...new TextEncoder().encode(s)];

  // 標頭：format 1，第 0 軌放 tempo/拍號
  push(...'MThd'.split('').map(c => c.charCodeAt(0))); u32(6); u16(1); u16(tracks.length + 1); u16(ppq);
  const uspq = Math.round(60000000 / bpm);
  const t0 = [
    0, 0xff, 0x51, 3, (uspq >> 16) & 255, (uspq >> 8) & 255, uspq & 255,
    0, 0xff, 0x58, 4, sigNum, Math.round(Math.log2(sigDen)), 24, 8,
    0, 0xff, 0x2f, 0,
  ];
  chunk('MTrk', t0);

  for (const tr of tracks) {
    const ch = tr.channel ?? 0;
    const ev = [];
    for (const n of tr.notes) {
      const on = Math.round(n.t * ppq), off = Math.max(on + 1, Math.round((n.t + n.d) * ppq));
      ev.push({ tick: on, b: [0x90 | ch, n.p, Math.max(1, Math.min(127, Math.round(n.v)))], o: 1 });
      ev.push({ tick: off, b: [0x80 | ch, n.p, 0], o: 0 });
    }
    // 同一 tick：先 note-off 再 note-on，避免同音連續時被提早關掉
    ev.sort((a, b) => a.tick - b.tick || a.o - b.o);
    const body = [];
    const nm = text(tr.name || 'Track');
    body.push(0, 0xff, 0x03, ...vlq(nm.length), ...nm);
    if (tr.program != null && ch !== 9) body.push(0, 0xc0 | ch, tr.program & 0x7f);
    let last = 0;
    for (const e of ev) { body.push(...vlq(e.tick - last), ...e.b); last = e.tick; }
    body.push(0, 0xff, 0x2f, 0);
    chunk('MTrk', body);
  }
  return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
}

// 內建音色 → GM program（匯出時寫進去，讓其他軟體選到接近的音色）
export const PROGRAM_FOR_PRESET = {
  piano: 0, epiano: 4, organ: 19, strings: 48, pizz: 45, pad: 89, lead: 80, pluck: 25, bass: 38, fbass: 33, bells: 9, marimba: 12, drums: 0,
};
