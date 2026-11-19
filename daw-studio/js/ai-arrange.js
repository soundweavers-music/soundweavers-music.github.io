// AI 編曲（第一步）：依和弦軌＋段落，用自動伴奏的風格把整首歌直接編成 MIDI 片段
// - 跟電子琴共用同一套風格資料（arranger-styles.js）與音高換算（arranger.pitches），所以聽起來一樣，只是一次寫成整首
// - 段落表：一列 = 一段（幾小節、哪個段落、強度）；換段落的前一小節自動打過門，新段落第一拍加強音鈸
// - 「變化」：同一組設定換一個種子就會換過門、經過音、Voicing 與力度起伏；種子存在片段上，可以重現
// - 寫進「伴奏-鼓／貝斯…」軌（沒有就建立），舊的 AI 編曲片段會被取代；整個動作可以 Ctrl+Z 復原
import { store, newMidiClip } from './state.js';
import { arranger, PARTS } from './arranger.js';
import { styleById, romanToChord } from './arranger-styles.js';
import { chordsOf, chordKeyOf } from './chord-ui.js';
import { chordPcs } from './chords.js';
import { keyFromHistogram } from './keydetect.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------------- 段落規劃 ----------------
// 和弦軌涵蓋的小節範圍
export function chordRange() {
  const list = chordsOf(), bpb = store.project.sigNum || 4;
  if (!list.length) return null;
  const a = Math.min(...list.map(c => c.t)), z = Math.max(...list.map(c => c.t + c.d));
  return [Math.floor(a / bpb + 1e-6), Math.ceil(z / bpb - 1e-6)];
}

// 一個 4 小節區塊的和弦「指紋」（拿來找重複的段落 → 副歌）
function blockSig(bar, n, bpb) {
  const out = [];
  for (let b = bar; b < bar + n; b++) for (let h = 0; h < 2; h++) {
    const beat = (b + h * 0.5) * bpb + 0.01;
    const c = chordsOf().find(x => beat >= x.t && beat < x.t + x.d);
    out.push(c ? c.root * 32 + (chordPcs(c) & 31) : -1);
  }
  return out.join(',');
}

// 自動排段落：以 4 小節為一塊；重複最多次、而且出現在後半的和弦樣式當副歌，副歌前一塊當導歌
// 回傳 [{ sec, bars, int }]（int：-1 弱、0 正常、1 強）
export function autoPlan(range, { intro = true, ending = true } = {}) {
  const bpb = store.project.sigNum || 4;
  const plan = [];
  if (!range) return plan;
  const [a, z] = range, n = z - a;
  if (intro && a >= 2) plan.push({ sec: 'intro', bars: Math.min(4, a), int: 0, pre: true });
  // 華語流行歌的樂段多半是 8 小節：先用 8 小節切，有重複的樣式就用它；沒有再改用 4 小節
  const cut = size => { const L = []; for (let b = a; b < z; b += size) L.push({ bar: b, bars: Math.min(size, z - b), sig: blockSig(b, Math.min(size, z - b), bpb) }); return L; };
  let blocks = n >= 16 ? cut(8) : [];
  if (!blocks.length || new Set(blocks.map(x => x.sig)).size === blocks.length) blocks = cut(4);
  // 每種樣式出現幾次、平均位置
  const stats = new Map();
  blocks.forEach((bk, i) => { const s = stats.get(bk.sig) || { n: 0, pos: 0 }; s.n++; s.pos += i / Math.max(1, blocks.length - 1); stats.set(bk.sig, s); });
  let chorusSig = null, best = -1;
  for (const [sig, s] of stats) {
    const score = s.n * 2 + s.pos / s.n * 1.5;
    if (s.n >= 2 && score > best) { best = score; chorusSig = sig; }
  }
  const labels = blocks.map(bk => (bk.sig === chorusSig ? 'chorus' : null));
  if (!chorusSig) {
    // 沒有重複：照典型華語流行歌的比例（前 40% 主歌、接著導歌、後面副歌）
    blocks.forEach((_, i) => { const q = i / blocks.length; labels[i] = q < 0.4 ? 'verse' : q < 0.55 ? 'pre' : 'chorus'; });
  } else {
    for (let i = 0; i < blocks.length; i++) {
      if (labels[i]) continue;
      // 導歌：只在 4 小節一塊時判斷（8 小節一塊時，副歌前面那塊就是主歌）
      labels[i] = blocks[i].bars <= 4 && labels[i + 1] === 'chorus' && i > 0 && labels[i - 1] !== 'pre' ? 'pre' : 'verse';
    }
  }
  // 主歌：第一輪 verse1、後面 verse2；副歌：第一輪 chorus1、最後一輪 chorus2；副歌之間夾的非副歌（又不是主歌樣式）→ 橋段
  let round = 0, prev = null;
  const verseSig = blocks.find((_, i) => labels[i] === 'verse')?.sig;
  const lastChorus = labels.lastIndexOf('chorus');
  const firstChorusEnd = (() => { let i = labels.indexOf('chorus'); while (i >= 0 && labels[i + 1] === 'chorus') i++; return i; })();
  blocks.forEach((bk, i) => {
    let sec;
    const L = labels[i];
    if (prev && prev.startsWith('chorus') && L !== 'chorus') round++;
    if (L === 'chorus') {
      let j = i; while (j < blocks.length && labels[j] === 'chorus') j++;
      sec = j - 1 === lastChorus && i > firstChorusEnd ? 'chorus2' : 'chorus1';
    } else if (L === 'pre') sec = 'pre';
    else if (i > firstChorusEnd && firstChorusEnd >= 0 && bk.sig !== verseSig && labels[i + 1] !== 'pre' && labels[i + 1] !== 'chorus' && i < lastChorus) sec = 'bridge';
    else sec = round > 0 ? 'verse2' : 'verse1';
    prev = sec;
    const last = plan[plan.length - 1];
    if (last && last.sec === sec && !last.pre) last.bars += bk.bars;
    else plan.push({ sec, bars: bk.bars, int: 0 });
  });
  if (ending) plan.push({ sec: 'ending', bars: 0, int: 0, post: true });   // bars 0 = 用風格自己的長度
  return plan;
}

// ---------------- 產生 ----------------
// 歌曲的調：和弦軌有記就用；沒有就從和弦組成音推
function songKey() {
  const k = chordKeyOf();
  if (k) return k;
  const h = new Array(12).fill(0);
  for (const c of chordsOf()) for (let pc = 0; pc < 12; pc++) if (chordPcs(c) & (1 << pc)) h[pc] += c.d * (pc === c.root ? 1.5 : 1);
  return keyFromHistogram(h) || { key: 0, minor: false };
}

// 下一個和弦的經過音（往下一個根音以半音或全音走過去）
function approach(next, cur, R) {
  const tgt = 36 + ((next.bass ?? next.root) % 12), r0 = 36 + ((cur.bass ?? cur.root) % 12);
  const t = tgt > 43 ? tgt - 12 : tgt, c = r0 > 43 ? r0 - 12 : r0;
  if (t === c) return R() < 0.5 ? t + 7 - 12 * (t + 7 > 50) : t - 1;
  const up = t > c;
  const pick = R();
  if (pick < 0.55) return up ? t - 1 : t + 1;         // 半音趨近
  if (pick < 0.8) return up ? t - 2 : t + 2;          // 全音
  return c + 7 > 50 ? c - 5 : c + 7;                   // 五音
}

/**
 * @param {object} o
 *   styleId、plan（autoPlan 的格式）、variation 0..1、seed、parts：{ drums: true, … }、level 0.5..1
 * @returns {{ clips: Object<string, {notes, startBeat, lengthBeats}>, bars: number, startBar: number, sections: Array }}
 */
export function generate(o) {
  const p = store.project, style = styleById(o.styleId), bpb = style.sig || 4;
  const range = chordRange();
  if (!range) return null;
  const R = rng(o.seed || 1), V = clamp(o.variation ?? 0.5, 0, 1), level = o.level ?? 0.8;
  const key = songKey();
  const majorRoot = key.minor ? (key.key + 3) % 12 : key.key;
  const spbSec = 60 / p.bpm;
  // 把段落表攤成小節：前奏放在和弦軌前面、尾奏接在後面
  const plan = o.plan.filter(s => style.sections[s.sec]);
  const preBars = plan.filter(s => s.pre).reduce((n, s) => n + s.bars, 0);
  let bar = range[0] - preBars;
  if (bar < 0) bar = 0;
  const startBar = bar;
  const bars = [];
  for (const s of plan) {
    const S = style.sections[s.sec];
    const nb = s.bars || (S.chords ? S.chords.length + (s.sec === 'ending' ? 1 : 0) : 4);
    for (let i = 0; i < nb; i++) bars.push({ bar: bar + i, sec: s.sec, S, idx: i, n: nb, int: s.int || 0 });
    bar += nb;
  }
  const chordAt = beat => {
    for (const c of chordsOf()) if (beat >= c.t - 1e-6 && beat < c.t + c.d - 1e-6) return c;
    return null;
  };
  const chordsInBar = b => {
    // 這一小節的和弦：有和弦軌就照和弦軌；前奏／尾奏（和弦軌外）照風格的級數
    const B = bars[b], t0 = B.bar * bpb, out = [];
    if (B.S.chords && (B.sec === 'ending' || !chordAt(t0 + 0.01))) {
      let rn = B.idx < B.S.chords.length ? B.S.chords[B.idx] : (B.S.lastChord || 'I');
      if (key.minor && B.idx >= B.S.chords.length) rn = 'vi';   // 小調歌：最後停在主和弦（vi）
      out.push({ t: t0, d: bpb, c: romanToChord(rn, majorRoot) });
      return out;
    }
    for (let k = 0; k < bpb * 4; k++) {
      const c = chordAt(t0 + k / 4 + 0.001);
      const last = out[out.length - 1];
      if (!c) { if (last) last.d += 0.25; continue; }
      if (last && last.c === c) last.d += 0.25;
      else out.push({ t: t0 + k / 4, d: 0.25, c });
    }
    if (!out.length) {
      // 和弦軌中間的空白小節：延用前一個和弦
      const prev = [...chordsOf()].filter(c => c.t < t0).pop() || chordsOf()[0];
      out.push({ t: t0, d: bpb, c: prev });
    }
    if (out[0].t > t0) { out[0].d += out[0].t - t0; out[0].t = t0; }
    return out;
  };
  const barChords = bars.map((_, i) => chordsInBar(i));
  const chordFor = (b, beat) => {
    const L = barChords[b];
    for (const x of L) if (beat >= x.t - 1e-6 && beat < x.t + x.d - 1e-6) return x;
    return L[L.length - 1];
  };
  const nextChordAfter = (b, beat) => {
    for (let k = b; k < bars.length; k++) for (const x of barChords[k]) if (x.t > beat + 1e-6) return x.c;
    return chordFor(b, beat).c;
  };

  const ctx = { prevVoicing: {} };   // arranger.pitches 用的 voice leading 狀態（跟電子琴分開）
  const out = Object.fromEntries(PARTS.map(pt => [pt.id, []]));
  const arpShift = Math.floor(R() * 3);   // 琶音起點（變化）
  for (let b = 0; b < bars.length; b++) {
    const B = bars[b], S = B.S, t0 = B.bar * bpb;
    const nextB = bars[b + 1];
    const changing = nextB && nextB.sec !== B.sec;
    const lastIntro = S.chords && B.sec !== 'ending' && B.idx === B.n - 1 && S.endFill;
    // 過門：換段落前一小節；同一段落裡每 8 小節（變化越大越常）也打一個短過門
    const fullFill = (changing && nextB.sec !== 'ending') || lastIntro;
    const midFill = !fullFill && nextB && !changing && (B.idx + 1) % 8 === 0 && R() < 0.35 + V * 0.5;
    const finalBar = B.sec === 'ending' && S.chords && B.idx >= S.chords.length;
    const crash = b > 0 && bars[b - 1].sec !== B.sec && B.sec !== 'break' && B.sec !== 'ending' && S.parts.drums;
    const humV = 4 + V * 10, humT = V * 0.012;
    const intMul = B.int < 0 ? 0.86 : B.int > 0 ? 1.08 : 1;
    const secDyn = B.sec === 'chorus2' ? 1.0 : B.sec === 'verse1' ? 0.9 : 0.96;
    for (const part of PARTS) {
      if (o.parts && !o.parts[part.id]) continue;
      if (B.int < 0 && (part.id === 'guitar' || part.id === 'arp') && B.sec !== 'intro') continue;   // 弱：拿掉吉他與琶音
      let pat = S.parts[part.id];
      if (!pat && B.int > 0 && part.id === 'strings' && !S.chords && B.sec !== 'break') pat = [{ t: 0, d: bpb, r: 'C', v: 60 }];   // 強：加弦樂鋪底
      if (part.id === 'drums' && S.fill && (fullFill || midFill)) {
        const half = bpb * (fullFill && (B.sec === 'pre' || V > 0.6 && R() < 0.4) ? 0 : midFill ? 0.75 : 0.5);
        pat = (S.parts.drums || []).filter(e => e.t < half).concat(S.fill.filter(e => e.t >= half));
      }
      if (finalBar) pat = part.id === 'drums' ? [{ t: 0, d: 1, v: 110, n: 49 }, { t: 0, d: 1, v: 100, n: 36 }] : [{ t: 0, d: bpb * 0.95, r: part.id === 'bass' ? 'R' : 'C', v: 92 }];
      if (!pat) continue;
      let events = pat;
      if (part.id === 'drums') {
        events = pat.slice();
        if (crash && !finalBar) events = events.filter(e => !(e.t === 0 && (e.n === 42 || e.n === 46 || e.n === 51))).concat([{ t: 0, d: 1, v: 108, n: 49 }]);
        // 變化：偶爾加鬼音小鼓、最後一個 8 分音的踏鈸換成開放鈸
        if (!fullFill && !finalBar && pat.some(e => e.n === 38)) {
          if (R() < V * 0.35) events.push({ t: bpb - 0.25, d: 0.25, v: 46, n: 38 });
          if (R() < V * 0.3) events.push({ t: 1.75, d: 0.25, v: 40, n: 38 });
        }
        if (!fullFill && !finalBar && R() < V * 0.25) events = events.map(e => (e.n === 42 && Math.abs(e.t - (bpb - 0.5)) < 1e-6 ? { ...e, n: 46 } : e));
      }
      for (const e of events) {
        if (e.t >= bpb - 1e-6) continue;
        const beat = t0 + e.t;
        const seg = chordFor(b, beat), chord = seg.c;
        // 和弦換了：長音收在換和弦的地方
        let d = e.d;
        if (part.id !== 'drums') d = Math.min(d, seg.t + seg.d - beat);
        if (d <= 0.02) continue;
        let ps;
        if (part.id === 'bass' && e.r === 'A') ps = [approach(nextChordAfter(b, beat), chord, R)];
        else if (part.id === 'bass' && e.r === '8' && R() < V * 0.4) ps = arranger.pitches.call(ctx, 'bass', { ...e, r: R() < 0.5 ? '5' : 'R' }, chord);
        else if (part.id === 'arp' && /^\d$/.test(e.r)) ps = arranger.pitches.call(ctx, 'arp', { ...e, r: String(Number(e.r) + arpShift) }, chord);
        else ps = arranger.pitches.call(ctx, part.id, e, chord);
        // 變化：鋼琴偶爾換一個轉位（清掉聲部進行的記憶 → 回到中間音域重新選）
        if ((part.id === 'keys' || part.id === 'strings') && e.t === 0 && R() < V * 0.12) ctx.prevVoicing[part.id] = null;
        ps.forEach((n, i) => {
          const strum = part.id === 'guitar' && (e.r === 'D' || e.r === 'U') ? (e.r === 'D' ? i : ps.length - 1 - i) * 0.012 / spbSec : 0;
          const jitter = part.id === 'drums' && e.n === 36 ? 0 : (R() * 2 - 1) * humT;
          const vel = clamp(Math.round((e.v * (part.id === 'guitar' && e.r === 'U' ? 0.85 : 1) + (R() * 2 - 1) * humV) * secDyn * intMul * level), 1, 110);
          out[part.id].push({ p: clamp(n, 0, 127), t: Math.max(0, beat + strum + jitter), d: Math.max(1 / 32, d - strum), v: vel });
        });
      }
    }
  }
  const lenBeats = bars.length * bpb;
  const clips = {};
  for (const [pid, notes] of Object.entries(out)) {
    if (!notes.length) continue;
    clips[pid] = { startBeat: startBar * bpb, lengthBeats: lenBeats, notes: notes.map(n => ({ ...n, t: n.t - startBar * bpb })) };
  }
  return { clips, bars: bars.length, startBar, key, sections: bars.map(x => x.sec) };
}

// 寫進專案：取代舊的 AI 編曲片段
export function applyArrangement(res, meta = {}) {
  if (!res) return 0;
  store.checkpoint();
  const ids = arranger.ensureTracks();
  let n = 0;
  for (const part of PARTS) {
    const t = store.track(ids[part.id]); if (!t) continue;
    t.clips = t.clips.filter(c => !c.aiArr);
    const c = res.clips[part.id]; if (!c) continue;
    const clip = newMidiClip(c.startBeat, c.lengthBeats, c.notes);
    clip.name = 'AI 編曲 ' + (meta.styleName || '');
    clip.aiArr = { seed: meta.seed, style: meta.styleId };
    t.clips.push(clip);
    n += c.notes.length;
  }
  store.changed('structure');
  return n;
}

// 移除 AI 編曲片段
export function removeArrangement() {
  let any = false;
  for (const t of store.project.tracks) if (t.clips.some(c => c.aiArr)) any = true;
  if (!any) return false;
  store.checkpoint();
  for (const t of store.project.tracks) t.clips = t.clips.filter(c => !c.aiArr);
  store.changed('structure');
  return true;
}
