// 影片／文字／字幕軌：影片檔存在 IndexedDB，畫面在預覽視窗即時合成，輸出時再逐格算圖。
// 三種軌道都只是「畫面上的東西」：不進混音、不影響音訊輸出。
import { store, clipStart, clipDur, spb } from './state.js';
import { engine } from './engine.js';
import { uid, toast } from './util.js';
import { putMedia, getMedia } from './media-store.js';

export const NON_AUDIO_KINDS = new Set(['video', 'text', 'sub']);
export const isVideoClip = c => !!c.mediaId;
export const isTextClip = c => typeof c.text === 'string';

export function videoSettings() {
  const p = store.project;
  if (!p.video) p.video = { w: 1280, h: 720, fps: 30, bg: '#000000' };
  return p.video;
}

// ---------------- 素材 ----------------
const media = new Map();      // mediaId -> { el, url, ready, dur, missing, error }
export function mediaRec(id) {
  let r = media.get(id);
  if (r) return r;
  const el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto';
  r = { el, ready: false, url: null };
  media.set(id, r);
  r.promise = getMedia(id).then(m => {
    if (!m) { r.missing = true; return r; }
    r.name = m.name;
    r.url = URL.createObjectURL(m.blob);
    el.src = r.url;
    return new Promise(res => {
      el.onloadeddata = () => {
        r.ready = true; r.dur = el.duration || 0; r.w = el.videoWidth; r.h = el.videoHeight;
        dirty = true;              // 素材載入完成 → 預覽重畫一次
        res(r);
      };
      el.onerror = () => { r.error = true; res(r); };
      setTimeout(() => res(r), 8000);
    });
  });
  return r;
}
export const ensureMedia = async id => { const r = mediaRec(id); await r.promise; return r; };
// 已經載入過的素材長度（還沒載入就回 undefined）
export const mediaDuration = id => media.get(id)?.dur;
export function forgetMedia(id) {
  const r = media.get(id);
  if (!r) return;
  try { r.el.pause(); } catch (_) { /* noop */ }
  if (r.url) URL.revokeObjectURL(r.url);
  media.delete(id);
}

function seekTo(el, t) {
  return new Promise(res => {
    const target = Math.max(0, t);
    if (el.readyState >= 2 && Math.abs(el.currentTime - target) < 0.002) return res();
    let done = false;
    const fin = () => { if (done) return; done = true; el.removeEventListener('seeked', fin); res(); };
    el.addEventListener('seeked', fin);
    try { el.currentTime = target; } catch (_) { fin(); }
    setTimeout(fin, 4000);
  });
}

// 等比放到畫布中央（留黑邊）
function drawContain(ctx, src, W, H) {
  const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
  if (!sw || !sh) return;
  const k = Math.min(W / sw, H / sh);
  const w = sw * k, h = sh * k;
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

// ---------------- 文字與字幕 ----------------
let measureCv = null;
const measureCtx = () => (measureCv ||= document.createElement('canvas')).getContext('2d');

const FONT = (size, bold) => `${bold ? '700 ' : '500 '}${size}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif`;

export function textLayout(ctx, c, W, H) {
  const size = Math.max(9, (c.size ?? 0.062) * H);
  ctx.font = FONT(size, c.bold);
  const lines = String(c.text ?? '').split('\n');
  const lh = size * 1.32;
  const w = Math.max(4, ...lines.map(l => ctx.measureText(l).width));
  const h = lh * lines.length;
  return { size, lh, lines, w, h, cx: (c.x ?? 0.5) * W, cy: (c.y ?? 0.86) * H };
}

// 畫面上看得到的文字（含位置），給繪製與滑鼠拖曳共用
export function activeTexts(t, W, H) {
  const out = [];
  for (const tr of store.project.tracks) {
    if (tr.kind !== 'text' && tr.kind !== 'sub') continue;
    if (tr.mute) continue;
    for (const c of tr.clips) {
      if (t < clipStart(c) || t >= clipStart(c) + clipDur(c)) continue;
      const L = textLayout(measureCtx(), c, W, H);
      out.push({ clip: c, track: tr, ...L });
    }
  }
  return out;
}

export function drawTexts(ctx, W, H, t) {
  for (const it of activeTexts(t, W, H)) {
    const c = it.clip;
    ctx.save();
    ctx.font = FONT(it.size, c.bold);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const top = it.cy - it.h / 2;
    if (c.bg) {
      const pad = it.size * 0.34;
      ctx.fillStyle = c.bgColor || 'rgba(0,0,0,.55)';
      const r = Math.min(it.size * 0.35, 10);
      const bx = it.cx - it.w / 2 - pad, by = top - pad * 0.5, bw = it.w + pad * 2, bh = it.h + pad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, r); else ctx.rect(bx, by, bw, bh);
      ctx.fill();
    }
    ctx.fillStyle = c.color || '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = c.bg ? 0 : it.size * 0.12;
    it.lines.forEach((ln, i) => ctx.fillText(ln, it.cx, top + it.lh * (i + 0.5)));
    ctx.restore();
  }
}

// ---------------- 合成 ----------------
// seek=true：輸出用，每一格都把影片定位到正確時間；false：預覽播放用，影片由播放同步處理
export async function composeFrame(ctx, W, H, t, { seek = true } = {}) {
  const p = store.project, vs = videoSettings();
  ctx.save();
  ctx.fillStyle = vs.bg || '#000';
  ctx.fillRect(0, 0, W, H);
  for (const tr of p.tracks) {
    if (tr.kind !== 'video' || tr.mute) continue;
    for (const c of tr.clips) {
      const s = clipStart(c), d = clipDur(c);
      if (t < s || t >= s + d) continue;
      const rec = await ensureMedia(c.mediaId);
      if (!rec.ready) {
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = FONT(Math.max(12, H * 0.03), true); ctx.textAlign = 'center';
        ctx.fillText(rec.missing ? `找不到影片素材：${c.name}` : `載入中：${c.name}`, W / 2, H / 2);
        continue;
      }
      const src = Math.max(0, (c.offset || 0) + (t - s));
      if (seek) await seekTo(rec.el, src);
      drawContain(ctx, rec.el, W, H);
    }
  }
  ctx.restore();
  drawTexts(ctx, W, H, t);
}

// 播放時讓影片元件跟上播放頭（不每格 seek，只修正漂移）
export function syncVideos(t) {
  const playing = engine.playing;
  for (const tr of store.project.tracks) {
    if (tr.kind !== 'video') continue;
    for (const c of tr.clips) {
      const rec = media.get(c.mediaId);
      if (!rec || !rec.ready) continue;
      const s = clipStart(c), d = clipDur(c);
      const on = !tr.mute && t >= s && t < s + d;
      const el = rec.el;
      if (!on) { if (!el.paused) el.pause(); continue; }
      const target = Math.max(0, (c.offset || 0) + (t - s));
      if (playing) {
        if (el.paused) { el.currentTime = target; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - target) > 0.22) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
      }
    }
  }
}

// ---------------- 匯入影片 ----------------
const stripExt = n => String(n || '').replace(/\.[^.]+$/, '');

export async function importVideoFiles(files, trackId, at) {
  let t = store.track(trackId);
  if (!t || t.kind !== 'video') t = store.project.tracks.find(x => x.kind === 'video' && !x.clips.length);
  if (!t) {
    t = store.addTrack('video');
    if (!t) { toast('最多 32 軌', 'warn'); return; }
  }
  store.checkpoint();
  let pos = Math.max(0, at || 0);
  for (const f of files) {
    if (!/^video\//.test(f.type) && !/\.(mp4|m4v|webm|mov|ogv)$/i.test(f.name)) {
      toast(`${f.name} 不是瀏覽器可以直接播放的影片格式（建議 MP4 / WebM）`, 'error');
      continue;
    }
    const id = uid('media');
    await putMedia(id, { name: f.name, type: f.type, blob: f });
    const rec = await ensureMedia(id);
    if (!rec.ready) { toast(`讀不到 ${f.name}（這個影片格式瀏覽器解不開）`, 'error'); continue; }
    const dur = Math.max(0.1, rec.dur || 0);
    t.clips.push({ id: uid('clip'), mediaId: id, name: stripExt(f.name), start: pos, duration: dur, offset: 0, gainDb: 0 });
    if (t.clips.length === 1 && /^影片 \d+$/.test(t.name)) t.name = stripExt(f.name).slice(0, 20);
    pos += dur;
  }
  if (t.h === undefined) t.h = Math.max(64, t.h || 0) || 74;
  store.changed('structure');
}

// ---------------- 文字與字幕片段 ----------------
export function addTextClip(track, at, text) {
  const t = track || store.project.tracks.find(x => x.kind === 'text' || x.kind === 'sub');
  if (!t) return null;
  store.checkpoint();
  const bar = spb() * (store.project.sigNum || 4);
  const c = {
    id: uid('clip'),
    text: text ?? (t.kind === 'sub' ? '字幕文字' : '文字'),
    start: Math.max(0, at || 0), duration: bar * 2,
    x: 0.5, y: t.kind === 'sub' ? 0.88 : 0.2,
    size: t.kind === 'sub' ? 0.055 : 0.07,
    color: '#ffffff', bold: t.kind !== 'sub', bg: t.kind === 'sub',
  };
  t.clips.push(c);
  store.changed('structure');
  return c;
}

export function editTextClip(clip) {
  const v = prompt('要顯示的文字（可以用 Enter 換行）', clip.text || '');
  if (v === null) return;
  store.checkpoint();
  clip.text = v;
  store.changed('structure');
  refreshPreview(true);
}

// ---------------- 預覽視窗 ----------------
let panel = null, canvas = null, ctx = null, raf = 0, lastT = -1, dirty = true, dragText = null;
const POS = 'zhiyin-daw-videopreview';

export function previewOpen() { return !!panel && !panel.classList.contains('hidden'); }

export function initVideoPreview() {
  if (panel) return panel;
  panel = document.createElement('section');
  panel.className = 'vid-win hidden';
  panel.innerHTML = `
    <header>
      <span class="vtitle">預覽</span>
      <span class="vtime" id="vidTime">0.00 s</span>
      <button class="tbtn ghost" id="vidFit" title="預覽大小">適合</button>
      <button class="tbtn ghost" id="vidClose" title="關閉 (V)">✕</button>
    </header>
    <div class="vstage"><canvas id="vidCanvas"></canvas></div>
    <footer>
      <label>畫布 <select id="vidRes">
        <option value="1280x720">1280×720</option><option value="1920x1080">1920×1080</option>
        <option value="1080x1920">1080×1920（直式）</option><option value="720x1280">720×1280（直式）</option>
      </select></label>
      <label>格率 <select id="vidFps"><option>24</option><option>25</option><option selected>30</option><option>60</option></select></label>
      <span class="vhint">在畫面上拖曳文字可以調整位置</span>
    </footer>
    <div class="vid-grip" id="vidGrip"></div>`;
  document.body.appendChild(panel);
  canvas = panel.querySelector('#vidCanvas');
  ctx = canvas.getContext('2d');

  const vs = videoSettings();
  panel.querySelector('#vidRes').value = `${vs.w}x${vs.h}`;
  if (!panel.querySelector('#vidRes').value) panel.querySelector('#vidRes').value = '1280x720';
  panel.querySelector('#vidFps').value = String(vs.fps || 30);

  panel.querySelector('#vidRes').onchange = e => {
    const [w, h] = e.target.value.split('x').map(Number);
    store.checkpoint(); Object.assign(videoSettings(), { w, h });
    store.changed('structure'); refreshPreview(true);
  };
  panel.querySelector('#vidFps').onchange = e => {
    store.checkpoint(); videoSettings().fps = Number(e.target.value);
    store.changed('structure');
  };
  panel.querySelector('#vidClose').onclick = () => toggleVideoPreview(false);
  panel.querySelector('#vidFit').onclick = () => { panel.style.width = ''; panel.classList.remove('sized'); };

  // 拖曳視窗 + 記住位置
  const head = panel.querySelector('header');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { panel.style.left = Math.max(0, ev.clientX - dx) + 'px'; panel.style.top = Math.max(0, ev.clientY - dy) + 'px'; };
    const up = () => {
      head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up);
      try { localStorage.setItem(POS, JSON.stringify({ left: panel.style.left, top: panel.style.top, width: panel.style.width })); } catch (_) { /* noop */ }
    };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
  });
  try {
    const s = JSON.parse(localStorage.getItem(POS) || 'null');
    if (s) { panel.style.left = s.left; panel.style.top = s.top; if (s.width) { panel.style.width = s.width; panel.classList.add('sized'); } }
  } catch (_) { /* noop */ }

  // 在畫面上拖曳文字／字幕
  canvas.addEventListener('pointerdown', e => {
    const t = engine.currentTime();
    const [W, H] = canvasSize();
    const pos = canvasPoint(e, W, H);
    const items = activeTexts(t, W, H).reverse();
    const hit = items.find(it => {
      const pad = it.size * 0.4;
      return Math.abs(pos.x - it.cx) <= it.w / 2 + pad && Math.abs(pos.y - it.cy) <= it.h / 2 + pad;
    });
    if (!hit) return;
    store.checkpoint();
    dragText = { clip: hit.clip, dx: pos.x - hit.cx, dy: pos.y - hit.cy };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    const [W, H] = canvasSize();
    if (!dragText) {
      const pos = canvasPoint(e, W, H);
      const over = activeTexts(engine.currentTime(), W, H).some(it => {
        const pad = it.size * 0.4;
        return Math.abs(pos.x - it.cx) <= it.w / 2 + pad && Math.abs(pos.y - it.cy) <= it.h / 2 + pad;
      });
      canvas.style.cursor = over ? 'grab' : 'default';
      return;
    }
    const pos = canvasPoint(e, W, H);
    dragText.clip.x = Math.min(1, Math.max(0, (pos.x - dragText.dx) / W));
    dragText.clip.y = Math.min(1, Math.max(0, (pos.y - dragText.dy) / H));
    dirty = true;
  });
  const endDrag = () => { if (dragText) { dragText = null; canvas.style.cursor = 'default'; store.changed('structure'); } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // 拉的把手
  const grip = panel.querySelector('#vidGrip');
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const r = panel.getBoundingClientRect();
    grip.setPointerCapture(e.pointerId);
    panel.classList.add('sized');
    const mv = ev => { panel.style.width = Math.max(260, Math.min(innerWidth - r.left - 8, r.width + ev.clientX - e.clientX)) + 'px'; };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });

  store.on('change', () => { dirty = true; });
  store.on('select', () => { dirty = true; });
  return panel;
}

function canvasSize() {
  const vs = videoSettings();
  return [vs.w, vs.h];
}

function canvasPoint(e, W, H) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

// 縮圖用的代表格：抓第一格（MediaRecorder 錄出來的 WebM 沒辦法隨便 seek，第一格一定拿得到）
export function firstFrameCanvas(rec) {
  const v = rec.el, w = v.videoWidth || 160, h = v.videoHeight || 90;
  const cv = document.createElement('canvas');
  const k = Math.min(1, 240 / w);
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  try { cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); } catch (_) { return null; }
  return cv;
}

export function toggleVideoPreview(on = !previewOpen()) {
  initVideoPreview();
  panel.classList.toggle('hidden', !on);
  if (on) {
    refreshPreview(true);
    if (!raf) raf = requestAnimationFrame(tick);
  }
}

export function refreshPreview(force = false) {
  if (!previewOpen()) return;
  const vs = videoSettings();
  if (canvas.width !== vs.w || canvas.height !== vs.h) { canvas.width = vs.w; canvas.height = vs.h; }
  dirty = true;
  if (force) lastT = -1;
}

let drawing = false;
function tick() {
  raf = 0;
  if (!previewOpen()) return;
  const t = engine.currentTime();
  syncVideos(t);
  if (dirty || Math.abs(t - lastT) > 0.004) {
    dirty = false; lastT = t;
    drawLive(t);
  }
  raf = requestAnimationFrame(tick);
}

async function drawLive(t) {
  if (drawing) return;
  drawing = true;
  try {
    // 暫停時逐格定位（畫質正確），播放中交給 syncVideos 保持流暢
    await composeFrame(ctx, canvas.width, canvas.height, t, { seek: !engine.playing });
    const el = panel.querySelector('#vidTime');
    if (el) el.textContent = `${t.toFixed(2)} s`;
  } catch (e) { console.warn('preview', e); }
  drawing = false;
}
