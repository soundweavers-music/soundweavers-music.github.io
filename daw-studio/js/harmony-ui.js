// Harmony 人聲和聲面板
//   上：聲部卡片（1～4 部，各自音程／音量／左右）＋ 快速部數 ＋ 預設值
//   中：和聲依據（調性 或 和弦；和弦可從參考軌自動抓、之後再編輯）
//   下：時間軸（和弦列、段落列、4 條聲部音量曲線），可以「自動編排」再手動微調
import { store, isMidiClip } from './state.js';
import { engine } from './engine.js';
import { TUNE_SCALES, TUNE_RANGES, NOTE_NAMES_ZH, scaleMask, harmDefaults } from './effects.js';
import { detectKeyFromTrack } from './keydetect.js';
import { ROOTS, QUALITIES, chordName, detectChords, autoArrange, diatonicChord, INTERVAL_CHOICES, intervalLabel } from './chords.js';
import { toast } from './util.js';

export const VOICE_COLORS = ['#35c9a5', '#f5b83d', '#b58bff', '#f78fc3'];
const noteOf = m => NOTE_NAMES_ZH[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

// 預設值：只改聲部（不動和弦、段落）
export const HARM_PRESETS = [
  { name: '上三度', v: [[2, 0, -0.3]], tip: '最常見的和聲：主旋律上方三度。' },
  { name: '三度＋五度', v: [[2, 0, -0.6], [4, -2, 0.6]], tip: '飽滿的三部和聲（主唱＋上三度＋上五度）。' },
  { name: '上下三度', v: [[2, 0, -0.6], [-3, -1, 0.6]], tip: '把主唱包在中間，聽起來很「合唱團」。' },
  { name: '雙重人聲', v: [[0, -3, -0.8], [0, -3, 0.8]], tip: '兩個同度、各自有點不準的聲部，讓主唱變厚變寬。' },
  { name: '高低八度', v: [[7, -6, -0.4], [-7, -4, 0.4]], tip: '八度疊加，副歌常用。' },
  { name: '流行合唱（4 部）', v: [[2, 0, -0.5], [4, -2, 0.5], [-3, -2, -0.9], [-7, -5, 0.9]], tip: '四部全開，適合副歌最高點。' },
];

export function harmEditor(owner, desc, onChange) {
  const P = desc.params;
  Object.entries(harmDefaults()).forEach(([k, v]) => { if (P[k] === undefined) P[k] = v; });
  const root = document.createElement('div');
  root.className = 'hmx';
  root.innerHTML = `
    <div class="hmx-count"><span>和聲部數</span>${[1, 2, 3, 4].map(n => `<button type="button" data-n="${n}">${n} 部</button>`).join('')}
      <span class="hmx-sp"></span><div class="hmx-pre"></div></div>
    <div class="hmx-voices"></div>
    <div class="hmx-src">
      <div class="hmx-tabs"><button type="button" data-s="0">依調性</button><button type="button" data-s="1">依和弦</button></div>
      <div class="hmx-src0">
        <label>主音 <select class="hmx-key">${NOTE_NAMES_ZH.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
        <label>音階 <select class="hmx-scale">${TUNE_SCALES.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}</select></label>
        <button type="button" class="tbtn hmx-detect">🔍 偵測調性</button>
      </div>
      <div class="hmx-src1">
        <label>參考伴奏 <select class="hmx-ref"></select></label>
        <label>每 <select class="hmx-res"><option value="1">1 拍</option><option value="2" selected>2 拍</option><option value="4">1 小節</option></select> 判斷一次</label>
        <button type="button" class="tbtn hmx-grab">🎹 抓和弦</button>
        <button type="button" class="tbtn ghost hmx-fromkey" title="依目前調性，每小節放一個一級和弦，再自己改">用調性填滿</button>
      </div>
      <label class="hmx-rng">音域 <select class="hmx-range">${TUNE_RANGES.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}</select></label>
    </div>
    <div class="hmx-tl-head">
      <label class="hmx-secmode"><input type="checkbox"> 段落模式（依小節切換和聲）</label>
      <button type="button" class="tbtn hmx-auto" title="依人聲的樂句與音量，自動分配每段的和聲與音量曲線；可以按很多次換不同版本">🎲 自動編排</button>
      <button type="button" class="tbtn ghost hmx-clear">清除段落與曲線</button>
      <span class="hmx-now"></span>
    </div>
    <div class="hmx-tlwrap"><canvas class="hmx-tl"></canvas></div>
    <div class="hmx-sel"></div>
    <div class="hmx-bottom">
      <div class="hmx-knobs"></div>
      <div class="hmx-graph"><canvas class="hmx-cv"></canvas><div class="hmx-hint">播放或開啟輸入監聽（I）時顯示主唱與和聲的音高</div></div>
    </div>`;
  const $ = s => root.querySelector(s);
  root.querySelectorAll('select').forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));

  function live() { store.dirty = true; store.emit('fx-live', {}); }
  function changed() { onChange(false); refresh(); }
  const cp = () => store.checkpoint();

  // ---------- 部數、預設值 ----------
  const countBox = $('.hmx-count');
  countBox.addEventListener('click', e => {
    const b = e.target.closest('button[data-n]'); if (!b) return;
    cp(); const n = +b.dataset.n;
    P.voices.forEach((v, i) => { v.on = i < n; });
    changed();
  });
  const pre = $('.hmx-pre');
  pre.innerHTML = HARM_PRESETS.map((x, i) => `<button type="button" data-i="${i}" title="${x.tip}">${x.name}</button>`).join('');
  pre.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const X = HARM_PRESETS[+b.dataset.i];
    cp();
    P.voices.forEach((v, i) => { const s = X.v[i]; v.on = !!s; if (s) { v.n = s[0]; v.g = s[1]; v.pan = s[2]; } });
    changed(); toast(X.tip);
  });

  // ---------- 聲部卡片 ----------
  const vbox = $('.hmx-voices');
  function renderVoices() {
    vbox.innerHTML = '';
    P.voices.forEach((v, i) => {
      const c = document.createElement('div');
      c.className = 'hmx-v' + (v.on ? ' on' : '');
      c.style.setProperty('--vc', VOICE_COLORS[i]);
      c.innerHTML = `
        <div class="hmx-vh"><button type="button" class="hmx-vpow">${v.on ? '●' : '○'}</button><b>第 ${i + 1} 部</b><span class="hmx-vnote"></span></div>
        <select class="hmx-viv">${INTERVAL_CHOICES.map(x => `<option value="${x.n}"${x.n === v.n ? ' selected' : ''}>${x.label}</option>`).join('')}</select>
        <label><span>音量</span><input type="range" class="hmx-vg" min="-30" max="6" step="0.5" value="${v.g}"><em class="g"></em></label>
        <label><span>左右</span><input type="range" class="hmx-vp" min="-100" max="100" step="1" value="${Math.round(v.pan * 100)}"><em class="p"></em></label>`;
      const show = () => {
        c.querySelector('em.g').textContent = `${v.g > 0 ? '+' : ''}${v.g.toFixed(1)} dB`;
        const pn = Math.round(v.pan * 100);
        c.querySelector('em.p').textContent = pn === 0 ? '中' : pn < 0 ? `左 ${-pn}` : `右 ${pn}`;
      };
      show();
      c.querySelector('.hmx-vpow').onclick = () => { cp(); v.on = !v.on; changed(); };
      const sel = c.querySelector('.hmx-viv');
      sel.addEventListener('keydown', e => e.stopPropagation());
      sel.onchange = () => { cp(); v.n = +sel.value; changed(); };
      for (const [cls, key, k] of [['.hmx-vg', 'g', 1], ['.hmx-vp', 'pan', 100]]) {
        const inp = c.querySelector(cls);
        inp.addEventListener('pointerdown', cp);
        inp.addEventListener('keydown', e => e.stopPropagation());
        inp.addEventListener('input', () => { v[key] = +inp.value / k; show(); live(); });
        inp.addEventListener('change', () => onChange(false));
        inp.addEventListener('dblclick', () => { cp(); v[key] = 0; inp.value = 0; show(); onChange(false); });
      }
      vbox.appendChild(c);
    });
    const n = P.voices.filter(v => v.on).length;
    countBox.querySelectorAll('button[data-n]').forEach(b => b.classList.toggle('sel', +b.dataset.n === n));
  }

  // ---------- 和聲依據 ----------
  const keySel = $('.hmx-key'), scaleSel = $('.hmx-scale'), rangeSel = $('.hmx-range'), refSel = $('.hmx-ref'), resSel = $('.hmx-res');
  const tabs = $('.hmx-tabs');
  tabs.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cp(); P.source = +b.dataset.s; changed(); });
  const applyScale = () => { const m = scaleMask(P.key, P.scale); if (m !== null) P.mask = m; };
  keySel.onchange = () => { cp(); P.key = +keySel.value; if (P.scale === 9) P.scale = 0; applyScale(); changed(); };
  scaleSel.onchange = () => { cp(); P.scale = +scaleSel.value; applyScale(); changed(); };
  rangeSel.onchange = () => { cp(); P.range = +rangeSel.value; changed(); };
  $('.hmx-detect').onclick = async () => {
    const btn = $('.hmx-detect'); btn.disabled = true; btn.textContent = '分析中…';
    try {
      const r = await detectKeyFromTrack(owner);
      if (!r) { toast('這一軌沒有足夠的音可以判斷調性', 'warn'); return; }
      cp(); P.key = r.key; P.scale = r.minor ? 1 : 0; applyScale(); changed();
      toast(`推測為 ${NOTE_NAMES_ZH[r.key]} ${r.minor ? '小調' : '大調'}（信心 ${Math.round(r.confidence * 100)}%）${r.alt ? `；也可能是 ${r.alt}` : ''}`);
    } catch (e) { toast('偵測失敗：' + e.message, 'error'); } finally { btn.disabled = false; btn.textContent = '🔍 偵測調性'; }
  };
  function renderRefs() {
    const tracks = store.project.tracks.filter(t => t.id !== owner && t.clips.length);
    if (P.chordTrack && !tracks.find(t => t.id === P.chordTrack)) P.chordTrack = null;
    if (!P.chordTrack) {
      // 預設挑：有 MIDI 和弦的軌（鋼琴、吉他…）優先，其次是音訊伴奏
      const pick = tracks.find(t => t.kind === 'midi' && t.clips.some(c => isMidiClip(c) && c.notes.length) && !/鼓|drum/i.test(t.name + t.instrument)) || tracks.find(t => t.kind === 'audio');
      if (pick) P.chordTrack = pick.id;
    }
    refSel.innerHTML = tracks.length ? tracks.map(t => `<option value="${t.id}">${t.name}${t.kind === 'midi' ? '（MIDI）' : ''}</option>`).join('') : '<option value="">（沒有其他有內容的軌）</option>';
    refSel.value = P.chordTrack || '';
  }
  refSel.onchange = () => { P.chordTrack = refSel.value || null; store.dirty = true; };
  $('.hmx-grab').onclick = async () => {
    const id = refSel.value;
    if (!id) { toast('先選一條有和弦的伴奏軌（MIDI 或音訊）', 'warn'); return; }
    const btn = $('.hmx-grab'); btn.disabled = true; btn.textContent = '分析中…';
    try {
      const r = await detectChords(id, +resSel.value, f => { btn.textContent = `分析中 ${Math.round(f * 100)}%`; });
      if (!r.chords.length) { toast('參考軌裡找不到和弦', 'warn'); return; }
      cp();
      P.chords = r.chords; P.source = 1; P.chordTrack = id;
      if (r.key) { P.key = r.key.key; P.scale = r.key.minor ? 1 : 0; applyScale(); }
      changed();
      toast(`抓到 ${r.chords.length} 個和弦${r.key ? `，調性推測 ${NOTE_NAMES_ZH[r.key.key]} ${r.key.minor ? '小調' : '大調'}` : ''}。點時間軸上的和弦可以修改。`);
    } catch (e) { toast('抓和弦失敗：' + e.message, 'error'); } finally { btn.disabled = false; btn.textContent = '🎹 抓和弦'; }
  };
  $('.hmx-fromkey').onclick = () => {
    cp();
    const bpb = store.project.sigNum || 4, n = Math.ceil(totalBeats() / bpb);
    const minor = P.scale === 1 || P.scale === 2;
    P.chords = Array.from({ length: n }, (_, i) => ({ t: i * bpb, d: bpb, ...diatonicChord(P.key, minor, 0) }));
    P.source = 1; changed();
  };

  // ---------- 段落、自動編排 ----------
  const secChk = $('.hmx-secmode input');
  secChk.onchange = () => { cp(); P.secMode = secChk.checked ? 1 : 0; changed(); };
  $('.hmx-auto').onclick = () => {
    const r = autoArrange(owner, P);
    if (!r) { toast('這一軌還沒有可以分析的人聲', 'warn'); return; }
    cp();
    P.sections = r.sections; P.curves = r.curves; P.secMode = 1;
    // 段落用到的聲部要開著
    P.voices.forEach((v, i) => { if (r.sections.some(s => s.iv[i] !== null)) v.on = true; });
    sel = null; changed();
    toast(`分成 ${r.sections.length} 段，越大聲的樂句和聲越多。不滿意可以再按一次，或直接拖拉修改。`);
  };
  $('.hmx-clear').onclick = () => { cp(); P.sections = []; P.curves = [[], [], [], []]; P.secMode = 0; sel = null; changed(); };

  // ---------- 時間軸 ----------
  const tl = $('.hmx-tl'), wrap = $('.hmx-tlwrap'), selBox = $('.hmx-sel');
  const ROW = { ruler: 18, chord: 26, sec: 62, curve: 22 };
  const Y = { chord: ROW.ruler, sec: ROW.ruler + ROW.chord, curve: ROW.ruler + ROW.chord + ROW.sec };
  const TLH = Y.curve + ROW.curve * 4 + 2, LBL = 54;
  let sel = null;          // { kind: 'chord'|'sec', i }
  let ppb = 10;            // 每拍幾 px
  const bpb = () => store.project.sigNum || 4;
  function totalBeats() {
    const s = 60 / store.project.bpm;
    let e = Math.max(16 * bpb(), store.projectEnd() / s);
    for (const c of P.chords) e = Math.max(e, c.t + c.d);
    for (const c of P.sections) e = Math.max(e, c.t + c.d);
    return Math.ceil(e / bpb() + 1) * bpb();
  }
  const xOf = b => LBL + b * ppb, bOf = x => (x - LBL) / ppb;
  const curveY = (v, k) => Y.curve + ROW.curve * k + ROW.curve - 3 - Math.min(1.5, v) / 1.5 * (ROW.curve - 6);
  const curveV = (y, k) => Math.max(0, Math.min(1.5, (Y.curve + ROW.curve * k + ROW.curve - 3 - y) / (ROW.curve - 6) * 1.5));

  function drawTl() {
    const W0 = wrap.clientWidth || 680, TB = totalBeats();
    ppb = Math.max(6, (W0 - LBL - 4) / TB);
    const W = Math.ceil(LBL + TB * ppb + 4), dpr = devicePixelRatio || 1;
    tl.width = W * dpr; tl.height = TLH * dpr; tl.style.width = W + 'px'; tl.style.height = TLH + 'px';
    const g = tl.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#111216'; g.fillRect(0, 0, W, TLH);
    // 小節格線
    g.font = '9px ui-monospace, Consolas'; g.textAlign = 'left';
    for (let b = 0; b <= TB; b++) {
      const x = Math.round(xOf(b)) + 0.5, bar = b % bpb() === 0;
      g.strokeStyle = bar ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)';
      g.beginPath(); g.moveTo(x, bar ? 0 : ROW.ruler); g.lineTo(x, TLH); g.stroke();
      if (bar && (b / bpb()) % (ppb * bpb() < 24 ? 4 : ppb * bpb() < 40 ? 2 : 1) === 0) { g.fillStyle = '#7d818b'; g.fillText(String(b / bpb() + 1), x + 3, 12); }
    }
    // 列標題
    g.fillStyle = '#17181c'; g.fillRect(0, 0, LBL, TLH);
    g.fillStyle = '#9aa0ab'; g.font = '10px sans-serif';
    g.fillText('小節', 6, 12); g.fillText('和弦', 6, Y.chord + 16); g.fillText('段落', 6, Y.sec + 16);
    if (!P.secMode) { g.fillStyle = '#5c616b'; g.fillText('（未啟用）', 4, Y.sec + 30); }
    for (let k = 0; k < 4; k++) { g.fillStyle = VOICE_COLORS[k]; g.fillText(`第${k + 1}部`, 6, Y.curve + ROW.curve * k + 14); }
    // 和弦
    const srcChord = P.source === 1;
    P.chords.forEach((c, i) => {
      const x0 = xOf(c.t), x1 = xOf(c.t + c.d), s = sel && sel.kind === 'chord' && sel.i === i;
      g.fillStyle = s ? 'rgba(79,157,255,.45)' : srcChord ? (i % 2 ? 'rgba(79,157,255,.18)' : 'rgba(79,157,255,.26)') : 'rgba(255,255,255,.07)';
      g.fillRect(x0 + 1, Y.chord + 2, x1 - x0 - 2, ROW.chord - 4);
      if (s) { g.strokeStyle = '#8fc4ff'; g.strokeRect(x0 + 1.5, Y.chord + 2.5, x1 - x0 - 3, ROW.chord - 5); }
      g.fillStyle = srcChord ? '#e9eaee' : '#7d818b'; g.font = '600 11px ui-monospace, Consolas';
      const name = chordName(c);
      if (g.measureText(name).width < x1 - x0 - 4) g.fillText(name, x0 + 4, Y.chord + 17);
    });
    if (!P.chords.length) { g.fillStyle = '#5c616b'; g.font = '10px sans-serif'; g.fillText(srcChord ? '按「抓和弦」從伴奏軌自動抓，或在這一列拖曳新增' : '（依調性時不使用和弦）', LBL + 8, Y.chord + 17); }
    // 段落
    P.sections.forEach((s, i) => {
      const x0 = xOf(s.t), x1 = xOf(s.t + s.d), on = sel && sel.kind === 'sec' && sel.i === i;
      g.globalAlpha = P.secMode ? 1 : 0.4;
      g.fillStyle = on ? '#2b3446' : '#1f232c'; g.fillRect(x0 + 1, Y.sec + 2, x1 - x0 - 2, ROW.sec - 4);
      g.strokeStyle = on ? '#8fc4ff' : '#3a404c'; g.strokeRect(x0 + 1.5, Y.sec + 2.5, x1 - x0 - 3, ROW.sec - 5);
      // 每個聲部一條色帶 + 音程
      const bh = (ROW.sec - 8) / 4;
      for (let k = 0; k < 4; k++) {
        const n = s.iv[k]; if (n === null || n === undefined) continue;
        g.fillStyle = VOICE_COLORS[k]; g.globalAlpha = (P.secMode ? 1 : 0.4) * 0.85;
        g.fillRect(x0 + 3, Y.sec + 4 + k * bh, Math.max(2, x1 - x0 - 6), bh - 1);
        g.globalAlpha = P.secMode ? 1 : 0.4;
        if (x1 - x0 > 46) { g.fillStyle = '#0b0c0f'; g.font = '600 10px sans-serif'; g.fillText(intervalLabel(n), x0 + 6, Y.sec + 4 + k * bh + bh - 3); }
      }
      g.globalAlpha = 1;
    });
    if (!P.sections.length) { g.fillStyle = '#5c616b'; g.font = '10px sans-serif'; g.fillText('按「自動編排」，或在這一列拖曳框出小節範圍', LBL + 8, Y.sec + 34); }
    // 音量曲線
    for (let k = 0; k < 4; k++) {
      const pts = (P.curves[k] || []).slice().sort((a, b) => a.t - b.t), y0 = Y.curve + ROW.curve * k;
      g.fillStyle = k % 2 ? 'rgba(255,255,255,.015)' : 'rgba(255,255,255,.03)'; g.fillRect(LBL, y0, W - LBL, ROW.curve);
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(LBL, curveY(1, k)); g.lineTo(W, curveY(1, k)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = VOICE_COLORS[k]; g.lineWidth = 1.5; g.globalAlpha = P.voices[k].on ? 1 : 0.35;
      g.beginPath();
      if (!pts.length) { g.moveTo(LBL, curveY(1, k)); g.lineTo(W, curveY(1, k)); }
      else {
        g.moveTo(LBL, curveY(pts[0].v, k));
        for (const pt of pts) g.lineTo(xOf(pt.t), curveY(pt.v, k));
        g.lineTo(W, curveY(pts[pts.length - 1].v, k));
      }
      g.stroke();
      g.fillStyle = VOICE_COLORS[k];
      for (const pt of pts) { g.beginPath(); g.arc(xOf(pt.t), curveY(pt.v, k), 2.6, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1; g.lineWidth = 1;
    }
    // 播放位置
    const pos = engine.currentTime() / (60 / store.project.bpm);
    const px = xOf(pos);
    g.fillStyle = '#ff4d4d'; g.fillRect(Math.round(px), 0, 1.5, TLH);
  }

  // 點擊／拖曳
  function hit(x, y) {
    const b = bOf(x);
    if (y < Y.chord) return { kind: 'ruler' };
    if (y < Y.sec) {
      for (let i = 0; i < P.chords.length; i++) {
        const c = P.chords[i];
        if (Math.abs(x - xOf(c.t + c.d)) < 5) return { kind: 'chord', i, edge: 1 };
        if (b >= c.t && b < c.t + c.d) return { kind: 'chord', i };
      }
      return { kind: 'chord-empty' };
    }
    if (y < Y.curve) {
      for (let i = 0; i < P.sections.length; i++) {
        const s = P.sections[i];
        if (Math.abs(x - xOf(s.t)) < 5) return { kind: 'sec', i, edge: 0 };
        if (Math.abs(x - xOf(s.t + s.d)) < 5) return { kind: 'sec', i, edge: 1 };
        if (b >= s.t && b < s.t + s.d) return { kind: 'sec', i };
      }
      return { kind: 'sec-empty' };
    }
    const k = Math.min(3, Math.floor((y - Y.curve) / ROW.curve));
    const pts = P.curves[k] || [];
    const j = pts.findIndex(pt => Math.abs(xOf(pt.t) - x) < 6 && Math.abs(curveY(pt.v, k) - y) < 6);
    return { kind: 'curve', k, j };
  }
  const snapB = (b, q) => Math.max(0, Math.round(b / q) * q);
  tl.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const r = tl.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    tl.style.cursor = h.edge !== undefined ? 'ew-resize' : h.kind === 'curve' ? (h.j >= 0 ? 'grab' : 'crosshair') : h.kind.endsWith('empty') ? 'copy' : 'pointer';
  });
  tl.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = tl.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    if (h.kind === 'curve' && h.j >= 0) { cp(); P.curves[h.k].splice(h.j, 1); changed(); }
  });
  tl.addEventListener('dblclick', e => {
    const r = tl.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    if (h.kind === 'curve' && h.j >= 0) { cp(); P.curves[h.k].splice(h.j, 1); changed(); }
  });
  tl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = tl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const h = hit(x, y), b0 = bOf(x);
    if (h.kind === 'ruler') { engine.seek(Math.max(0, b0) * 60 / store.project.bpm); return; }
    tl.setPointerCapture(e.pointerId);
    let moved = false, drag = null;
    const fine = ev => (ev.shiftKey ? 0.25 : 1);
    if (h.kind === 'chord' || h.kind === 'sec') {
      sel = { kind: h.kind, i: h.i };
      if (h.edge !== undefined) { cp(); drag = { ...h }; }
    } else if (h.kind === 'chord-empty') {
      cp();
      const t = snapB(Math.floor(b0), 1), prevC = P.chords.filter(c => c.t <= t).pop();
      const c = { t, d: 1, ...(prevC ? { root: prevC.root, q: prevC.q } : diatonicChord(P.key, P.scale === 1, 0)) };
      P.chords.push(c); P.chords.sort((a, z) => a.t - z.t);
      drag = { kind: 'chord', i: P.chords.indexOf(c), edge: 1, fresh: true }; sel = { kind: 'chord', i: drag.i };
    } else if (h.kind === 'sec-empty') {
      cp();
      const s = { t: snapB(Math.floor(b0 / bpb()) * bpb(), bpb()), d: bpb(), iv: P.voices.map(v => (v.on ? v.n : null)) };
      if (s.iv.every(v => v === null)) s.iv[0] = 2;
      P.sections.push(s); P.sections.sort((a, z) => a.t - z.t);
      drag = { kind: 'sec', i: P.sections.indexOf(s), edge: 1, fresh: true }; sel = { kind: 'sec', i: drag.i };
      if (!P.secMode) P.secMode = 1;
    } else if (h.kind === 'curve') {
      cp();
      const pts = P.curves[h.k] || (P.curves[h.k] = []);
      let j = h.j;
      if (j < 0) { pts.push({ t: +Math.max(0, b0).toFixed(3), v: +curveV(y, h.k).toFixed(2) }); j = pts.length - 1; }
      drag = { kind: 'curve', k: h.k, pt: pts[j] };
    }
    drawTl(); renderSel();
    const mv = ev => {
      if (!drag) return;
      moved = true;
      const xx = ev.clientX - r.left, yy = ev.clientY - r.top, b = bOf(xx);
      if (drag.kind === 'chord') {
        const c = P.chords[drag.i], next = P.chords[drag.i + 1];
        const q = fine(ev), e2 = Math.max(c.t + q, snapB(b, q));
        c.d = (next ? Math.min(e2, next.t) : e2) - c.t;
      } else if (drag.kind === 'sec') {
        const s = P.sections[drag.i], prevS = P.sections[drag.i - 1], next = P.sections[drag.i + 1], q = bpb();
        if (drag.edge === 1) { const e2 = Math.max(s.t + q, snapB(b, q)); s.d = (next ? Math.min(e2, next.t) : e2) - s.t; }
        else { const end = s.t + s.d, t2 = Math.min(end - q, Math.max(prevS ? prevS.t + prevS.d : 0, snapB(b, q))); s.t = t2; s.d = end - t2; }
      } else if (drag.kind === 'curve') {
        drag.pt.t = +Math.max(0, b).toFixed(3); drag.pt.v = +curveV(yy, drag.k).toFixed(2);
      }
      drawTl(); live();
    };
    const up = () => {
      tl.removeEventListener('pointermove', mv); tl.removeEventListener('pointerup', up);
      if (drag) changed(); else { drawTl(); renderSel(); }
    };
    tl.addEventListener('pointermove', mv); tl.addEventListener('pointerup', up);
  });

  // 選取的和弦／段落：下方編輯列
  function renderSel() {
    selBox.innerHTML = '';
    if (!sel) { selBox.innerHTML = '<span class="hmx-tip">點和弦或段落可以修改；拖曳右邊界改長度。曲線：點一下加點、拖曳移動、右鍵或雙擊刪除（按住 Shift 拖和弦邊界可以細到 1/4 拍）。</span>'; return; }
    if (sel.kind === 'chord') {
      const c = P.chords[sel.i]; if (!c) { sel = null; return renderSel(); }
      selBox.innerHTML = `<b>和弦</b>
        <select class="r">${ROOTS.map((n, i) => `<option value="${i}"${i === c.root ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <select class="q">${QUALITIES.map(q => `<option value="${q.id}"${q.id === c.q ? ' selected' : ''}>${q.label}${q.suf ? `（${q.suf}）` : ''}</option>`).join('')}</select>
        <span class="hmx-tip">第 ${Math.floor(c.t / bpb()) + 1} 小節第 ${(c.t % bpb()) + 1} 拍，${c.d} 拍</span>
        <button type="button" class="tbtn ghost split">從中間切開</button>
        <button type="button" class="tbtn ghost merge">併入下一個</button>
        <button type="button" class="tbtn ghost del">刪除</button>`;
      const r = selBox.querySelector('.r'), q = selBox.querySelector('.q');
      [r, q].forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));
      r.onchange = () => { cp(); c.root = +r.value; changed(); };
      q.onchange = () => { cp(); c.q = q.value; changed(); };
      selBox.querySelector('.split').onclick = () => {
        if (c.d < 0.5) return;
        cp(); const h = Math.max(0.25, Math.round(c.d / 2 * 4) / 4);
        P.chords.splice(sel.i + 1, 0, { t: c.t + h, d: c.d - h, root: c.root, q: c.q }); c.d = h; changed();
      };
      selBox.querySelector('.merge').onclick = () => {
        const n = P.chords[sel.i + 1]; if (!n) return;
        cp(); c.d = n.t + n.d - c.t; P.chords.splice(sel.i + 1, 1); changed();
      };
      selBox.querySelector('.del').onclick = () => { cp(); P.chords.splice(sel.i, 1); sel = null; changed(); };
    } else {
      const s = P.sections[sel.i]; if (!s) { sel = null; return renderSel(); }
      const opts = n => `<option value="x"${n === null ? ' selected' : ''}>不唱</option>` + INTERVAL_CHOICES.map(x => `<option value="${x.n}"${x.n === n ? ' selected' : ''}>${x.label}</option>`).join('');
      selBox.innerHTML = `<b>段落</b><span class="hmx-tip">第 ${s.t / bpb() + 1}～${(s.t + s.d) / bpb()} 小節</span>
        ${s.iv.map((n, k) => `<label style="--vc:${VOICE_COLORS[k]}"><i></i><select data-k="${k}">${opts(n)}</select></label>`).join('')}
        <button type="button" class="tbtn ghost del">刪除段落</button>`;
      selBox.querySelectorAll('select').forEach(el => {
        el.addEventListener('keydown', e => e.stopPropagation());
        el.onchange = () => {
          cp(); const k = +el.dataset.k;
          s.iv[k] = el.value === 'x' ? null : +el.value;
          if (s.iv[k] !== null) P.voices[k].on = true;
          changed();
        };
      });
      selBox.querySelector('.del').onclick = () => { cp(); P.sections.splice(sel.i, 1); sel = null; changed(); };
    }
  }

  // ---------- 旋鈕 ----------
  const knobsBox = $('.hmx-knobs');
  const dbFmt = v => (v <= -60 ? '關' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`);
  const knobs = [
    { k: 'lead', label: '主唱', min: -60, max: 6, step: 0.5, def: 0, fmt: dbFmt, curve: 0.5 },
    { k: 'hgain', label: '和聲', min: -60, max: 6, step: 0.5, def: -4, fmt: dbFmt, curve: 0.5 },
    { k: 'width', label: '寬度', min: 0, max: 100, step: 1, def: 70, fmt: v => `${Math.round(v)}%` },
    { k: 'tight', label: '和聲音準', min: 0, max: 100, step: 1, def: 85, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 90 ? '完全對齊' : v >= 50 ? '自然' : '跟著主唱飄') },
    { k: 'humanize', label: '人性化', min: 0, max: 100, step: 1, def: 50, fmt: v => `${Math.round(v)}%`, sub: v => (v >= 60 ? '像不同人在唱' : v >= 20 ? '輕微' : '機械') },
    { k: 'glide', label: '滑音', min: 0, max: 200, step: 1, def: 30, fmt: v => `${Math.round(v)} ms` },
  ];
  const kEls = {};
  for (const K of knobs) {
    const w = document.createElement('div');
    w.className = 'atx-knob';
    w.innerHTML = `<canvas></canvas><b>${K.label}</b><span class="v"></span><em></em>`;
    const cv = w.querySelector('canvas');
    const cu = K.curve || 1;
    const toT = v => Math.pow((v - K.min) / (K.max - K.min), 1 / cu);
    const fromT = t => { const v = K.min + Math.pow(Math.max(0, Math.min(1, t)), cu) * (K.max - K.min); return Math.round(v / K.step) * K.step; };
    const draw = () => {
      const v = P[K.k], t = toT(v), dpr = devicePixelRatio || 1, S = 58;
      cv.width = S * dpr; cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = S / 2, R = 22, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      g.lineCap = 'round'; g.lineWidth = 5; g.strokeStyle = '#25272d'; g.beginPath(); g.arc(c, c, R, a0, a1); g.stroke();
      const grad = g.createLinearGradient(0, S, S, 0); grad.addColorStop(0, '#35c9a5'); grad.addColorStop(0.5, '#f5b83d'); grad.addColorStop(1, '#f78fc3');
      g.strokeStyle = grad; g.beginPath(); g.arc(c, c, R, a0, a0 + (a1 - a0) * t); g.stroke();
      const ang = a0 + (a1 - a0) * t;
      g.fillStyle = '#2f3238'; g.beginPath(); g.arc(c, c, 15, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(c + Math.cos(ang) * 6, c + Math.sin(ang) * 6); g.lineTo(c + Math.cos(ang) * 13, c + Math.sin(ang) * 13); g.stroke();
      w.querySelector('.v').textContent = K.fmt(v);
      w.querySelector('em').textContent = K.sub ? K.sub(v) : '';
    };
    kEls[K.k] = draw;
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); cp(); cv.setPointerCapture(e.pointerId);
      const y0 = e.clientY, t0 = toT(P[K.k]);
      const mv = ev => { P[K.k] = fromT(t0 + (y0 - ev.clientY) / (ev.shiftKey ? 600 : 160)); draw(); live(); };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); onChange(false); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); P[K.k] = fromT(toT(P[K.k]) + (e.deltaY < 0 ? 0.03 : -0.03)); draw(); live(); clearTimeout(cv._t); cv._t = setTimeout(() => onChange(false), 250); }, { passive: false });
    cv.addEventListener('dblclick', () => { cp(); P[K.k] = K.def; draw(); onChange(false); });
    knobsBox.appendChild(w);
  }

  // ---------- 即時音高 ----------
  const hist = [];
  let last = null, unsub = null, attachedTo = null, raf = 0;
  const attach = () => {
    const inst = engine.ctx && engine.fxInstance(owner, desc.id);
    if (inst === attachedTo) return;
    if (unsub) unsub();
    attachedTo = inst; unsub = null;
    if (inst && inst.onPitch) unsub = inst.onPitch(d => { d._at = performance.now(); last = d; hist.push(d); if (hist.length > 600) hist.shift(); });
  };
  const cv = $('.hmx-cv'), hint = $('.hmx-hint'), nowEl = $('.hmx-now');
  let lastTlDraw = 0;
  function frame() {
    if (!root.isConnected) { if (unsub) unsub(); return; }
    attach();
    const dpr = devicePixelRatio || 1;
    const W = cv.clientWidth || 300, H = cv.clientHeight || 120;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0e0f13'; g.fillRect(0, 0, W, H);
    const now = engine.ctx ? engine.ctx.currentTime : 0, span = 4;
    const vis = hist.filter(h => h.t > now - span), vp = vis.filter(h => h.v);
    hint.style.display = vp.length ? 'none' : '';
    let center = vp.length ? vp.reduce((s, h) => s + h.q, 0) / vp.length : 60;
    root._c = root._c === undefined ? center : root._c + (center - root._c) * 0.05;
    const c0 = root._c, rng = 14;
    const yOf = m => H / 2 - (m - c0) / rng * (H / 2 - 6);
    for (let m = Math.floor(c0 - rng); m <= Math.ceil(c0 + rng); m++) {
      const pc = ((m % 12) + 12) % 12;
      if (pc !== 0 && pc !== 7) continue;
      const y = Math.round(yOf(m)) + 0.5;
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(30, y); g.lineTo(W, y); g.stroke();
      g.fillStyle = '#5c616b'; g.font = '9px ui-monospace'; g.fillText(noteOf(m), 2, y + 3);
    }
    const xOfT = t => 30 + (t - (now - span)) / span * (W - 30);
    const line = (get, style, width) => {
      g.beginPath(); let pen = false;
      for (const h of vis) {
        const m = h.v ? get(h) : 0;
        if (!m) { pen = false; continue; }
        const x = xOfT(h.t), y = yOf(m);
        pen ? g.lineTo(x, y) : g.moveTo(x, y); pen = true;
      }
      g.strokeStyle = style; g.lineWidth = width; g.lineJoin = 'round'; g.stroke();
    };
    for (let k = 0; k < 4; k++) line(h => h.notes && h.notes[k], VOICE_COLORS[k], 2.2);
    line(h => h.mi, 'rgba(233,234,238,.85)', 1.6);
    g.font = '10px sans-serif'; g.fillStyle = '#e9eaee'; g.fillText('— 主唱', W - 52, 12);
    // 目前和弦、段落
    const fresh = last && performance.now() - (last._at || 0) < 400;
    if (fresh && engine.playing) {
      const pos = engine.currentTime() / (60 / store.project.bpm);
      const ch = P.source === 1 ? P.chords.find(c => pos >= c.t && pos < c.t + c.d) : null;
      const sc = P.secMode ? P.sections.findIndex(s => pos >= s.t && pos < s.t + s.d) : -1;
      nowEl.textContent = `${ch ? '和弦 ' + chordName(ch) : P.source === 1 ? '（沒有和弦）' : '依調性 ' + NOTE_NAMES_ZH[P.key]}${P.secMode ? ` · ${sc >= 0 ? `段落 ${sc + 1}` : '段落外（不唱）'}` : ''}`;
    } else nowEl.textContent = '';
    // 時間軸的播放線：播放中每 50 ms 重畫
    if (engine.playing && performance.now() - lastTlDraw > 50) { lastTlDraw = performance.now(); drawTl(); }
    raf = requestAnimationFrame(frame);
  }

  function refresh() {
    renderVoices();
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('sel', +b.dataset.s === (P.source | 0)));
    $('.hmx-src0').style.display = P.source === 1 ? 'none' : '';
    $('.hmx-src1').style.display = P.source === 1 ? '' : 'none';
    keySel.value = P.key; scaleSel.value = P.scale; rangeSel.value = P.range;
    secChk.checked = !!P.secMode;
    renderRefs();
    Object.values(kEls).forEach(f => f());
    drawTl(); renderSel();
  }
  refresh();
  requestAnimationFrame(() => drawTl());   // 第一次量到寬度
  raf = requestAnimationFrame(frame);
  root._dispose = () => { cancelAnimationFrame(raf); if (unsub) unsub(); };
  root._refresh = refresh;
  return root;
}
