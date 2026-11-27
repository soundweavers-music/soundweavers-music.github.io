// 兩個跟時間有關的工具：
//   1. 速度（時間伸縮）：把一段 wave 變快／變慢，可選「保持音高」或「跟著變調」
//   2. 人聲對齊：拿另一軌的音訊、MIDI 或節拍當參考，自動抓偏移量，再手動微調偏移與比例
// 兩者都會重新算一份音訊、換掉片段（原音訊留在 undo 裡），不會破壞原始檔。
import { store, spb, clipStart, setClipStart, clipDur, isMidiClip } from './state.js';
import { uid, computePeaks, toast } from './util.js';

let panel = null;

// ── 共用的 DSP ────────────────────────────────────────────
// WSOLA：時間伸縮但不變調（factor = 輸出長度 / 輸入長度）
export function wsola(input, factor) {
  if (!input.length || Math.abs(factor - 1) < 0.005) return input.slice();
  const frame = 1024, hopA = frame / 2, hopS = hopA / factor, search = 192;
  const outLen = Math.max(1, Math.round(input.length * factor));
  const win = new Float32Array(frame);
  for (let k = 0; k < frame; k++) win[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / frame);
  const out = new Float32Array(outLen + frame), norm = new Float32Array(outLen + frame);
  let outPos = 0, refPos = 0;
  while (outPos + frame < outLen) {
    let best = 0, bestCorr = -Infinity;
    for (let off = -search; off <= search; off += 8) {
      const p = refPos + off;
      if (p < 0 || p + hopA >= input.length) continue;
      let corr = 0;
      for (let t = 0; t < hopA; t += 4) corr += input[p + t] * input[refPos + t];
      if (corr > bestCorr) { bestCorr = corr; best = off; }
    }
    const src = Math.max(0, Math.min(input.length - frame - 1, refPos + best));
    for (let q = 0; q < frame; q++) {
      const v = (src + q < input.length ? input[src + q] : 0) * win[q];
      out[outPos + q] += v;
      norm[outPos + q] += win[q];
    }
    outPos += hopA;
    refPos = Math.round(outPos / factor);
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 0.001 ? out[i] / norm[i] : 0;
  return res;
}

// 直接改取樣率（速度與音高一起變）
function resampleTo(input, factor) {
  const outLen = Math.max(1, Math.round(input.length * factor));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const t = i / factor, i0 = Math.floor(t), fr = t - i0;
    const a = input[Math.min(i0, input.length - 1)] || 0;
    const b = input[Math.min(i0 + 1, input.length - 1)] || 0;
    out[i] = a + (b - a) * fr;
  }
  return out;
}

// 音量的包絡（對齊用）：每 10 ms 一格
export function envelope(chans, sr, hopSec = 0.01) {
  const hop = Math.max(1, Math.round(sr * hopSec));
  const n = Math.floor(chans[0].length / hop) || 1;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const ch of chans) {
      for (let k = i * hop; k < Math.min((i + 1) * hop, ch.length); k++) sum += ch[k] * ch[k];
    }
    env[i] = Math.sqrt(sum / hop);
  }
  // 去掉直流、稍微平滑，互相關才穩
  for (let i = 1; i < n - 1; i++) env[i] = (env[i - 1] + env[i] * 2 + env[i + 1]) / 4;
  let mx = 0;
  for (let i = 0; i < n; i++) if (env[i] > mx) mx = env[i];
  if (mx > 0) for (let i = 0; i < n; i++) env[i] /= mx;
  return { env, hopSec };
}

// 兩段包絡互相關，找出「動 vocal 多少秒會最對齊」
export function bestOffset(ref, tgt, maxSec = 3) {
  const R = ref.env, T = tgt.env;                 // { env, hopSec }
  const n = Math.min(R.length, T.length);
  const maxLag = Math.min(Math.floor(maxSec / ref.hopSec), Math.max(1, Math.floor(n / 2)));
  let bestLag = 0, bestScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0, e1 = 0, e2 = 0;
    for (let i = Math.max(0, lag); i < Math.min(n, n + lag); i++) {
      const a = R[i], b = T[i - lag];
      dot += a * b; e1 += a * a; e2 += b * b;
    }
    const score = dot / Math.sqrt(e1 * e2 + 1e-9);
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  return { seconds: bestLag * ref.hopSec, score: bestScore };
}

// 片段實際用到的那一段（前後各留 50 ms）
function sliceOfClip(buf, clip) {
  const sr = buf.sampleRate, pad = Math.round(sr * 0.05);
  const s0 = Math.max(0, Math.floor((clip.offset || 0) * sr) - pad);
  const s1 = Math.min(buf.length, Math.ceil(((clip.offset || 0) + clip.duration) * sr) + pad);
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c).slice(s0, s1));
  return { chans, sr, s0, newOffset: (clip.offset || 0) - s0 / sr };
}

function makeBuffer(chans, sr) {
  const out = new AudioBuffer({ numberOfChannels: chans.length, length: chans[0].length, sampleRate: sr });
  chans.forEach((d, c) => out.copyToChannel(d, c));
  return out;
}

// 換掉片段的音訊（原音訊留在 undo 裡）
function swapBuffer(clip, chans, sr, newOffset, tag, nameOf) {
  const out = makeBuffer(chans, sr);
  const id = uid('buf');
  store.buffers.set(id, out);
  store.bufferMeta.set(id, { name: `${(nameOf || clip.name).replace(/\.wav$/i, '')} (${tag}).wav`, peaks: computePeaks(out) });
  clip.bufferId = id;
  clip.offset = Math.max(0, newOffset);
  return out;
}

// ── 面板外殼 ──────────────────────────────────────────────
function shell(title, owner, width = 620) {
  closePanel();
  const el = document.createElement('div');
  el.className = 'stx-panel';
  el.style.width = width + 'px';
  el.innerHTML = `
    <div class="stx-head"><span class="stx-title"></span><span class="stx-owner"></span>
      <button class="tbtn ghost stx-x" title="關閉 (Esc)">✕</button></div>
    <div class="stx-body"></div>`;
  el.querySelector('.stx-title').textContent = title;
  el.querySelector('.stx-owner').textContent = owner;
  document.body.appendChild(el);
  panel = el;
  el.style.left = '0px'; el.style.top = '0px';
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, innerWidth / 2 - r.width / 2)) + 'px';
    el.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, (innerHeight - r.height) / 2)) + 'px';
  });
  el.querySelector('.stx-x').onclick = closePanel;
  makeDraggable(el, el.querySelector('.stx-head'));
  return el;
}

function makeDraggable(el, handle) {
  let dx = 0, dy = 0, on = false;
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    on = true; dx = e.clientX - el.offsetLeft; dy = e.clientY - el.offsetTop;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (!on) return;
    el.style.left = Math.max(0, Math.min(innerWidth - el.offsetWidth, e.clientX - dx)) + 'px';
    el.style.top = Math.max(0, Math.min(innerHeight - el.offsetHeight, e.clientY - dy)) + 'px';
  });
  handle.addEventListener('pointerup', () => { on = false; });
}

function onKey(e) {
  if (e.key === 'Escape') { closePanel(); e.stopPropagation(); }
}
document.addEventListener('keydown', onKey);

export function closePanel() {
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = null;
}

// 畫一條波形（給兩個面板共用）
function drawWave(g, chans, w, h, color, from = 0, to = 1) {
  const ch = chans[0];
  const n = ch.length;
  const i0 = Math.floor(n * from), i1 = Math.floor(n * to);
  const span = Math.max(1, i1 - i0), per = span / w;
  g.fillStyle = color;
  g.strokeStyle = color;
  const mid = h / 2;
  for (let x = 0; x < w; x++) {
    let lo = 0, hi = 0;
    const a = i0 + Math.floor(x * per), b = Math.min(i1, a + Math.ceil(per));
    for (let k = a; k < b; k++) {
      const v = ch[k] || 0;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    g.fillRect(x, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
  }
}

// ═════════════ ① 速度（時間伸縮） ═════════════
export function openStretchPanel(clipId) {
  const found = store.findClip(clipId);
  if (!found || found.clip.notes || !found.clip.bufferId) { toast('請選一個音訊片段', 'warn'); return; }
  const { track, clip } = found;
  const src = store.buffers.get(clip.bufferId);
  if (!src) { toast('找不到這個片段的音訊', 'error'); return; }

  const part = sliceOfClip(src, clip);
  const ref = envelope(part.chans, part.sr);
  const state = { rate: 1, keepPitch: true };
  const origDur = part.chans[0].length / part.sr;

  const el = shell('速度（時間伸縮）', `${track.name}／${clip.name}`);
  el.querySelector('.stx-body').innerHTML = `
    <canvas class="stx-cv" height="150"></canvas>
    <div class="stx-row">
      <label class="stx-lab">速度 <b class="stx-rate">100%</b></label>
      <input class="stx-slider" type="range" min="50" max="200" step="1" value="100">
    </div>
    <div class="stx-row stx-presets">
      <button class="tbtn ghost" data-r="50">50%</button>
      <button class="tbtn ghost" data-r="75">75%</button>
      <button class="tbtn ghost" data-r="100">100%</button>
      <button class="tbtn ghost" data-r="150">150%</button>
      <button class="tbtn ghost" data-r="200">200%</button>
    </div>
    <div class="stx-row">
      <label><input type="radio" name="stxMode" value="keep" checked> 保持音高（WSOLA）</label>
      <label><input type="radio" name="stxMode" value="pitch"> 跟著變調（像轉盤）</label>
    </div>
    <p class="stx-note">長度 <b class="stx-len"></b>　→　<b class="stx-len2"></b>　（會換成新的音訊，Ctrl+Z 可復原）</p>
    <div class="stx-actions"><button class="tbtn stx-apply">套用</button><button class="tbtn ghost stx-cancel">取消</button></div>`;

  const cv = el.querySelector('.stx-cv');
  const slider = el.querySelector('.stx-slider');
  const $ = s => el.querySelector(s);

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 150;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // 上：原始；下：伸縮後的長度（用同一段波形，示意最後會變多長）
    const half = h / 2 - 6;
    // 上：原始（藍）；下：伸縮後的長度示意（橘）
    drawWave(g, part.chans, w, half, 'rgba(120,180,255,.85)', 0, 1);
    const shown = Math.max(0.02, Math.min(1, 1 / state.rate));
    g.save();
    g.translate(0, h / 2 + 2);
    drawWave(g, part.chans, Math.round(w * shown), half, 'rgba(255,190,90,.9)', 0, 1);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.font = '11px system-ui'; g.fillText('原始', 8, 14); g.fillText(`${Math.round(state.rate * 100)}%`, 8, h / 2 + 16);
  }

  function sync() {
    $('.stx-rate').textContent = Math.round(state.rate * 100) + '%';
    $('.stx-len').textContent = origDur.toFixed(2) + ' 秒';
    $('.stx-len2').textContent = (origDur / state.rate).toFixed(2) + ' 秒';
    draw();
  }

  slider.oninput = () => { state.rate = +slider.value / 100; sync(); };
  el.querySelectorAll('.stx-presets .tbtn').forEach(b => {
    b.onclick = () => { state.rate = +b.dataset.r / 100; slider.value = b.dataset.r; sync(); };
  });
  el.querySelectorAll('input[name=stxMode]').forEach(r => {
    r.onchange = () => { state.keepPitch = el.querySelector('input[name=stxMode]:checked').value === 'keep'; };
  });
  $('.stx-cancel').onclick = closePanel;
  $('.stx-apply').onclick = () => {
    if (Math.abs(state.rate - 1) < 0.01) { closePanel(); return; }
    const factor = 1 / state.rate;               // 輸出長度 / 輸入長度
    store.emit('busy', { text: '正在伸縮音訊…' });
    setTimeout(() => {
      const out = part.chans.map(ch => (state.keepPitch ? wsola(ch, factor) : resampleTo(ch, factor)));
      store.checkpoint();
      swapBuffer(clip, out, part.sr, part.newOffset, `×${state.rate.toFixed(2)}`, clip.name);
      clip.duration = out[0].length / part.sr;
      clip.name = clip.name.replace(/\s*［[^］]*］$/, '') + ` ［×${state.rate.toFixed(2)}］`;
      store.emit('busy', null);
      store.changed('structure');
      toast(`已把「${clip.name}」調成 ${Math.round(state.rate * 100)}%（Ctrl+Z 可復原）`);
      closePanel();
    }, 30);
  };
  sync();
  requestAnimationFrame(draw);
}

// ═════════════ ② 人聲對齊 ═════════════
export function openAlignPanel(clipId) {
  const found = store.findClip(clipId);
  if (!found || found.clip.notes || !found.clip.bufferId) { toast('請先選一個要對齊的音訊片段', 'warn'); return; }
  const { track, clip } = found;
  const src = store.buffers.get(clip.bufferId);
  if (!src) { toast('找不到這個片段的音訊', 'error'); return; }
  const part = sliceOfClip(src, clip);
  const vocalEnv = envelope(part.chans, part.sr);

  // 可選的參考：其他軌的音訊片段、MIDI 片段、節拍格線
  const refs = [];
  for (const t of store.project.tracks) {
    for (const c of t.clips) {
      if (c.id === clip.id) continue;
      if (c.notes) refs.push({ kind: 'midi', track: t, clip: c, label: `MIDI：${t.name}／${c.name}` });
      else if (c.bufferId) refs.push({ kind: 'audio', track: t, clip: c, label: `音訊：${t.name}／${c.name}` });
    }
  }
  refs.push({ kind: 'beat', label: '節拍格線（專案 BPM）' });

  const el = shell('人聲對齊', `${track.name}／${clip.name}`, 720);
  el.querySelector('.stx-body').innerHTML = `
    <div class="stx-row">
      <label class="stx-lab">參考</label>
      <select class="stx-ref"></select>
    </div>
    <canvas class="stx-cv" height="180"></canvas>
    <div class="stx-row">
      <label class="stx-lab">偏移 <b class="stx-off">0 ms</b></label>
      <input class="stx-offr" type="range" min="-3000" max="3000" step="1" value="0">
    </div>
    <div class="stx-row">
      <label class="stx-lab">比例 <b class="stx-ratio">100%</b></label>
      <input class="stx-ratr" type="range" min="90" max="110" step="0.1" value="100">
    </div>
    <p class="stx-note">先按「自動對齊」抓大致位置，再用滑桿微調。<b>偏移</b>只移動片段；<b>比例</b>會伸縮音訊長度（保持音高）。</p>
    <div class="stx-actions">
      <button class="tbtn ghost stx-detect">自動對齊</button>
      <button class="tbtn stx-apply">套用</button>
      <button class="tbtn ghost stx-cancel">取消</button>
    </div>`;

  const sel = el.querySelector('.stx-ref');
  refs.forEach((r, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = r.label;
    sel.appendChild(o);
  });
  const cv = el.querySelector('.stx-cv');
  const offR = el.querySelector('.stx-offr'), ratR = el.querySelector('.stx-ratr');
  const $ = s => el.querySelector(s);
  const state = { off: 0, ratio: 1, refIdx: 0, refEnv: null };

  // 參考的包絡（音訊用波形、MIDI 用音符起點、節拍用每拍打點）
  function refEnvelope() {
    const r = refs[state.refIdx];
    if (!r) return null;
    if (r.kind === 'beat') {
      const n = Math.ceil(Math.max(8, store.projectEnd()) / vocalEnv.hopSec);
      const env = new Float32Array(n);
      const beat = spb();
      for (let b = 0; b * beat < n * vocalEnv.hopSec; b++) {
        const i = Math.round(b * beat / vocalEnv.hopSec);
        if (i < n) env[i] = 1;
      }
      return { env, hopSec: vocalEnv.hopSec };
    }
    if (r.kind === 'midi') {
      const n = Math.ceil((clipDur(r.clip) + 4) / vocalEnv.hopSec) + 1;
      const env = new Float32Array(n);
      for (const nt of r.clip.notes) {
        const t = (nt.t * 60 / store.project.bpm);
        const i = Math.round(t / vocalEnv.hopSec);
        if (i >= 0 && i < n) env[i] = 1;
      }
      return { env, hopSec: vocalEnv.hopSec };
    }
    const buf = store.buffers.get(r.clip.bufferId);
    if (!buf) return null;
    const p = sliceOfClip(buf, r.clip);
    return envelope(p.chans, p.sr);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 180;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const rowH = h / 2 - 8;
    // 上：參考；下：人聲（依偏移與比例畫）
    const R = state.refEnv;
    if (R) {
      g.fillStyle = 'rgba(150,160,180,.8)';
      const n = R.env.length;
      for (let x = 0; x < w; x++) {
        const v = R.env[Math.min(n - 1, Math.floor(x / w * n))] || 0;
        g.fillRect(x, rowH - v * rowH, 1, Math.max(1, v * rowH));
      }
    }
    g.fillStyle = 'rgba(255,190,90,.9)';
    const vn = vocalEnv.env.length;
    const shiftPx = (state.off / 1000) / vocalEnv.hopSec / vn * w;
    for (let x = 0; x < w; x++) {
      const src2 = (x - shiftPx) / state.ratio;
      if (src2 < 0 || src2 >= w) continue;
      const v = vocalEnv.env[Math.min(vn - 1, Math.floor(src2 / w * vn))] || 0;
      g.fillRect(x, h - v * rowH, 1, Math.max(1, v * rowH));
    }
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.font = '11px system-ui';
    g.fillText('參考', 8, 14); g.fillText('人聲', 8, h / 2 + 14);
    g.fillStyle = 'rgba(255,120,120,.9)';
    if (Math.abs(shiftPx) > 0.5) { g.fillRect(shiftPx, 0, 1, h); }
  }

  function sync() {
    $('.stx-off').textContent = Math.round(state.off) + ' ms';
    $('.stx-ratio').textContent = (state.ratio * 100).toFixed(1) + '%';
    draw();
  }

  sel.onchange = () => { state.refIdx = +sel.value; state.refEnv = refEnvelope(); draw(); };
  offR.oninput = () => { state.off = +offR.value; sync(); };
  ratR.oninput = () => { state.ratio = +ratR.value / 100; sync(); };
  $('.stx-detect').onclick = () => {
    if (!state.refEnv) { toast('這個參考沒有可以對齊的內容', 'warn'); return; }
    const r = bestOffset(state.refEnv, vocalEnv);
    state.off = Math.max(-3000, Math.min(3000, Math.round(r.seconds * 1000)));
    offR.value = state.off;
    sync();
    toast(`自動對齊：${state.off} ms（相似度 ${r.score.toFixed(2)}）`);
  };
  $('.stx-cancel').onclick = closePanel;
  $('.stx-apply').onclick = () => {
    const trim = state.ratio !== 1;
    store.checkpoint();
    if (trim) {
      const out = part.chans.map(ch => wsola(ch, state.ratio));
      swapBuffer(clip, out, part.sr, part.newOffset, `對齊×${state.ratio.toFixed(3)}`, clip.name);
      clip.duration = out[0].length / part.sr;
    }
    setClipStart(clip, Math.max(0, clipStart(clip) + state.off / 1000));
    store.changed('structure');
    toast(`已對齊：偏移 ${state.off} ms${trim ? `、比例 ${(state.ratio * 100).toFixed(1)}%` : ''}（Ctrl+Z 可復原）`);
    closePanel();
  };

  state.refEnv = refEnvelope();
  sync();
  requestAnimationFrame(draw);
}
