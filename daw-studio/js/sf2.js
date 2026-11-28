// SoundFont 2 (.sf2) 解析與播放。
// 只依賴 Web Audio：把 16-bit PCM 轉成 AudioBuffer，依 preset → instrument → sample 的 zone 規則
// 找出每個 (音高, 力度) 要播哪些 sample、用什麼音高倍率、包絡與音量。
//
// 不支援：.sf3（Vorbis 壓縮）、調變器（modulators）、濾波器包絡、LFO —— 這些對大多數 GM 音色庫影響不大。

const GEN = {
  startAddrsOffset: 0, endAddrsOffset: 1, startloopAddrsOffset: 2, endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4, pan: 17, endAddrsCoarseOffset: 12,
  attackVolEnv: 34, holdVolEnv: 35, decayVolEnv: 36, sustainVolEnv: 37, releaseVolEnv: 38,
  instrument: 41, keyRange: 43, velRange: 44, startloopAddrsCoarseOffset: 45,
  initialAttenuation: 48, endloopAddrsCoarseOffset: 50, coarseTune: 51, fineTune: 52,
  sampleID: 53, sampleModes: 54, scaleTuning: 56, exclusiveClass: 57, overridingRootKey: 58,
  initialFilterFc: 8,
};

// ---------------- 解析 ----------------
export function parseSF2(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const u8 = new Uint8Array(arrayBuffer);
  const fourcc = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  const cstr = (o, n) => { let s = ''; for (let i = 0; i < n && u8[o + i]; i++) s += String.fromCharCode(u8[o + i]); return s.trim(); };

  if (fourcc(0) !== 'RIFF') throw new Error('不是 RIFF 檔案');
  const form = fourcc(8);
  if (form !== 'sfbk') throw new Error('不是 SoundFont 檔（缺少 sfbk）');

  const chunks = {};
  let info = {};
  // 走過三個 LIST：INFO / sdta / pdta
  let o = 12;
  while (o + 8 <= dv.byteLength) {
    const id = fourcc(o), size = dv.getUint32(o + 4, true);
    if (id === 'LIST') {
      const type = fourcc(o + 8);
      let p = o + 12; const end = o + 8 + size;
      while (p + 8 <= end) {
        const cid = fourcc(p), csz = dv.getUint32(p + 4, true);
        if (type === 'INFO' && (cid === 'INAM' || cid === 'ICOP' || cid === 'ieng' || cid === 'ifil' || cid === 'ICMT')) {
          info[cid] = cid === 'ifil' ? `${dv.getUint16(p + 8, true)}.${dv.getUint16(p + 10, true)}` : cstr(p + 8, csz);
        } else chunks[cid] = { off: p + 8, size: csz };
        p += 8 + csz + (csz & 1);
      }
    }
    o += 8 + size + (size & 1);
  }
  if (!chunks.smpl) {
    if (info.ifil && info.ifil.startsWith('3')) throw new Error('這是 .sf3（壓縮格式），請改用 .sf2 版本');
    throw new Error('檔案裡找不到音訊資料（smpl）');
  }
  if (info.ifil && info.ifil.startsWith('3')) throw new Error('這是 .sf3（壓縮格式），請改用 .sf2 版本');
  const need = ['phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr'];
  for (const n of need) if (!chunks[n]) throw new Error(`SoundFont 結構不完整（缺少 ${n}）`);

  const rec = (name, size, fn) => { const c = chunks[name]; const out = []; for (let i = 0; i < c.size / size; i++) out.push(fn(c.off + i * size)); return out; };
  const phdr = rec('phdr', 38, b => ({ name: cstr(b, 20), preset: dv.getUint16(b + 20, true), bank: dv.getUint16(b + 22, true), bag: dv.getUint16(b + 24, true) }));
  const pbag = rec('pbag', 4, b => dv.getUint16(b, true));
  const gen = b => ({ op: dv.getUint16(b, true), lo: u8[b + 2], hi: u8[b + 3], s: dv.getInt16(b + 2, true), u: dv.getUint16(b + 2, true) });
  const pgen = rec('pgen', 4, gen);
  const inst = rec('inst', 22, b => ({ name: cstr(b, 20), bag: dv.getUint16(b + 20, true) }));
  const ibag = rec('ibag', 4, b => dv.getUint16(b, true));
  const igen = rec('igen', 4, gen);
  const shdr = rec('shdr', 46, b => ({
    name: cstr(b, 20), start: dv.getUint32(b + 20, true), end: dv.getUint32(b + 24, true),
    loopStart: dv.getUint32(b + 28, true), loopEnd: dv.getUint32(b + 32, true), rate: dv.getUint32(b + 36, true),
    pitch: u8[b + 40], correction: dv.getInt8(b + 41), link: dv.getUint16(b + 42, true), type: dv.getUint16(b + 44, true),
  }));

  // zone：一個 bag 範圍內的 generator 集合
  const zonesOf = (bagIdx, bagEnd, bags, gens) => {
    const zones = [];
    for (let z = bagIdx; z < bagEnd; z++) {
      const g0 = bags[z], g1 = bags[z + 1] ?? gens.length;
      const g = {};
      for (let k = g0; k < g1; k++) {
        const x = gens[k];
        if (x.op === GEN.keyRange || x.op === GEN.velRange) g[x.op] = [x.lo, x.hi];
        else if (x.op === GEN.instrument || x.op === GEN.sampleID || x.op === GEN.sampleModes) g[x.op] = x.u;
        else g[x.op] = x.s;
      }
      zones.push(g);
    }
    return zones;
  };

  const instruments = inst.slice(0, -1).map((ins, i) => {
    const zones = zonesOf(ins.bag, inst[i + 1].bag, ibag, igen);
    // 第一個 zone 沒有 sampleID：global zone，套到其他 zone 當預設
    let global = {};
    if (zones.length && zones[0][GEN.sampleID] === undefined) global = zones.shift();
    return { name: ins.name, zones: zones.filter(z => z[GEN.sampleID] !== undefined).map(z => ({ ...global, ...z })) };
  });

  const presets = phdr.slice(0, -1).map((ph, i) => {
    const zones = zonesOf(ph.bag, phdr[i + 1].bag, pbag, pgen);
    let global = {};
    if (zones.length && zones[0][GEN.instrument] === undefined) global = zones.shift();
    return { name: ph.name, bank: ph.bank, preset: ph.preset, zones: zones.filter(z => z[GEN.instrument] !== undefined).map(z => ({ global, z })) };
  }).sort((a, b) => a.bank - b.bank || a.preset - b.preset);

  const smpl = new Int16Array(arrayBuffer, chunks.smpl.off, Math.floor(chunks.smpl.size / 2));
  // 播放音量：ICMT 裡寫「gain=+11.0dB」就整份放大（SF2 的衰減只能減、不能加，
  // 取樣又已經正規化到滿格，所以要大聲只能靠播放端；本站自己做的音色庫才會寫這個）
  const gm = /\bgain=([+-]?\d+(?:\.\d+)?)dB\b/.exec(info.ICMT || '');
  const gainDb = gm ? Math.max(-24, Math.min(24, Number(gm[1]))) : 0;
  return {
    gain: Math.pow(10, gainDb / 20),
    name: info.INAM || '未命名音色庫', copyright: info.ICOP || '', version: info.ifil || '',
    presets, instruments, samples: shdr.slice(0, -1), smpl,
  };
}

// ---------------- 取出某個 (preset, key, vel) 要播的區域 ----------------
const inRange = (r, v) => !r || (v >= r[0] && v <= r[1]);
const tc = v => (v === undefined ? undefined : Math.pow(2, v / 1200));   // timecents → 秒

export function regionsFor(sf, presetIdx, key, vel) {
  const P = sf.presets[presetIdx];
  if (!P) return [];
  const out = [];
  for (const { global, z } of P.zones) {
    const pz = { ...global, ...z };
    if (!inRange(pz[GEN.keyRange], key) || !inRange(pz[GEN.velRange], vel)) continue;
    const ins = sf.instruments[pz[GEN.instrument]];
    if (!ins) continue;
    for (const iz of ins.zones) {
      if (!inRange(iz[GEN.keyRange], key) || !inRange(iz[GEN.velRange], vel)) continue;
      // instrument generator 是絕對值；preset generator 是加在上面的相對值
      const g = k => (iz[k] ?? 0) + (pz[k] ?? 0);
      const s = sf.samples[iz[GEN.sampleID]];
      if (!s) continue;
      const root = iz[GEN.overridingRootKey] >= 0 && iz[GEN.overridingRootKey] !== undefined ? iz[GEN.overridingRootKey] : s.pitch;
      const scale = (iz[GEN.scaleTuning] ?? 100) / 100;
      const cents = (key - root) * 100 * scale + g(GEN.coarseTune) * 100 + g(GEN.fineTune) + s.correction;
      const off = k => (iz[k] ?? 0);
      const start = s.start + off(GEN.startAddrsOffset) + off(GEN.startAddrsCoarseOffset) * 32768;
      const end = s.end + off(GEN.endAddrsOffset) + off(GEN.endAddrsCoarseOffset) * 32768;
      const ls = s.loopStart + off(GEN.startloopAddrsOffset) + off(GEN.startloopAddrsCoarseOffset) * 32768;
      const le = s.loopEnd + off(GEN.endloopAddrsOffset) + off(GEN.endloopAddrsCoarseOffset) * 32768;
      const mode = iz[GEN.sampleModes] ?? 0;
      const env = (k, def) => {
        const ins0 = iz[k], pre = pz[k];
        if (ins0 === undefined && pre === undefined) return def;
        return tc((ins0 ?? Math.round(1200 * Math.log2(def))) + (pre ?? 0));
      };
      out.push({
        sampleIdx: iz[GEN.sampleID], rate: s.rate, start, end, loopStart: ls, loopEnd: le,
        loop: mode === 1 || mode === 3, playbackRate: Math.pow(2, cents / 1200),
        attenuation: Math.max(0, g(GEN.initialAttenuation)) / 10,   // centibel → dB
        pan: Math.max(-1, Math.min(1, g(GEN.pan) / 500)),
        attack: env(GEN.attackVolEnv, 0.001), hold: env(GEN.holdVolEnv, 0.001), decay: env(GEN.decayVolEnv, 0.001),
        sustainDb: Math.max(0, g(GEN.sustainVolEnv)) / 10,
        release: Math.min(8, env(GEN.releaseVolEnv, 0.001)),
        exclusive: iz[GEN.exclusiveClass] || 0,
      });
    }
  }
  return out;
}

// ---------------- AudioBuffer 快取（每個 ctx、每個 sample 各一份）----------------
const bufCache = new WeakMap();
function sampleBuffer(ctx, sf, r) {
  let m = bufCache.get(ctx);
  if (!m) { m = new Map(); bufCache.set(ctx, m); }
  const key = sf.id + ':' + r.sampleIdx + ':' + r.start + ':' + r.end;
  let b = m.get(key);
  if (!b) {
    const len = Math.max(1, r.end - r.start);
    // Web Audio 最低取樣率 3000 Hz；SF2 的 sample 有時更低，就用 3000 並靠 playbackRate 補
    const rate = Math.max(3000, Math.min(384000, r.rate));
    b = ctx.createBuffer(1, len, rate);
    const d = b.getChannelData(0);
    const src = sf.smpl;
    for (let i = 0; i < len; i++) d[i] = (src[r.start + i] || 0) / 32768;
    b._rateFix = r.rate / rate;
    m.set(key, b);
  }
  return b;
}

const dbg = db => Math.pow(10, -db / 20);

// 播放一個音：回傳和 synth.js 相同介面的 voice（release / kill / end）
export function sf2Voice(ctx, dest, sf, presetIdx, key, vel, when) {
  const regs = regionsFor(sf, presetIdx, key, vel);
  if (!regs.length) return { end: when, release() {}, kill() {} };
  const parts = [];
  const vgain = Math.pow(vel / 127, 2);
  for (const r of regs) {
    const buf = sampleBuffer(ctx, sf, r);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = r.playbackRate * (buf._rateFix || 1);
    if (r.loop && r.loopEnd > r.loopStart) {
      src.loop = true;
      src.loopStart = (r.loopStart - r.start) / buf.sampleRate;
      src.loopEnd = (r.loopEnd - r.start) / buf.sampleRate;
    }
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = r.pan;
    src.connect(g).connect(pan).connect(dest);
    const peak = vgain * dbg(r.attenuation) * 0.8 * (sf.gain || 1);
    const sus = peak * dbg(r.sustainDb);
    const p = g.gain;
    p.setValueAtTime(0, when);
    p.linearRampToValueAtTime(peak, when + r.attack);
    p.setValueAtTime(peak, when + r.attack + r.hold);
    p.setTargetAtTime(sus, when + r.attack + r.hold, Math.max(0.005, r.decay / 5));
    src.start(when);
    // 不循環的 sample 播完就自己停
    if (!src.loop) src.stop(when + buf.duration / src.playbackRate.value + 0.01);
    parts.push({ src, g, r });
  }
  const voice = {
    end: regs.every(r => !r.loop) ? when + Math.max(...parts.map(x => x.src.buffer.duration / x.src.playbackRate.value)) : Infinity,
    release(t) {
      t = Math.max(t, when + 0.005);
      let last = t;
      for (const { src, g, r } of parts) {
        if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t); else g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0, t, Math.max(0.005, r.release / 5));
        const stop = t + r.release + 0.05;
        try { src.stop(stop); } catch (_) { /* 已經有排停止 */ }
        last = Math.max(last, stop);
      }
      voice.end = Math.min(voice.end, last);
    },
    kill(t) {
      for (const { src, g } of parts) {
        if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t); else g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0, t, 0.008);
        try { src.stop(t + 0.05); } catch (_) { /* noop */ }
      }
    },
  };
  return voice;
}

export function maxRelease(sf, presetIdx) {
  // 抽樣幾個音高估計最長釋音（離線輸出時要預留尾巴）
  let m = 0.3;
  for (const k of [36, 60, 84]) for (const r of regionsFor(sf, presetIdx, k, 100)) m = Math.max(m, r.release);
  return Math.min(8, m) + 0.1;
}
