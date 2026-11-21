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
    ctx.globalAlpha = clipAlpha(c, t);
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

// ---------------- 濾鏡、調色、轉場 ----------------
// 濾鏡是 CSS filter 字串（canvas 2D 支援），強度用「原圖／濾鏡圖」疊合比例做
export const FILTERS = [
  { id: 'none', name: '原圖', css: '' },
  { id: 'bw', name: '黑白', css: 'grayscale(1)' },
  { id: 'warm', name: '暖陽', css: 'sepia(.25) saturate(1.2) brightness(1.05) hue-rotate(-8deg)' },
  { id: 'cool', name: '冷調', css: 'saturate(1.1) hue-rotate(12deg) brightness(.98) contrast(1.05)' },
  { id: 'film', name: '電影', css: 'contrast(1.18) saturate(.9) sepia(.12) brightness(.96)' },
  { id: 'vintage', name: '復古', css: 'sepia(.55) saturate(.85) contrast(.95) brightness(1.05)' },
  { id: 'soft', name: '淡化', css: 'contrast(.85) brightness(1.08) saturate(.8)' },
  { id: 'vivid', name: '鮮豔', css: 'saturate(1.55) contrast(1.1)' },
  { id: 'night', name: '夜景', css: 'brightness(.82) contrast(1.12) saturate(1.25) hue-rotate(6deg)' },
  { id: 'duotone', name: '單色', css: 'grayscale(1) sepia(.35) saturate(1.6) hue-rotate(-18deg)' },
];

export const TRANSITIONS = [
  { id: 'dissolve', name: '疊化' },
  { id: 'black', name: '黑場' },
  { id: 'white', name: '白閃' },
  { id: 'left', name: '左滑' },
  { id: 'right', name: '右滑' },
  { id: 'up', name: '上滑' },
  { id: 'down', name: '下滑' },
  { id: 'push', name: '推移' },
  { id: 'zoom', name: '縮放' },
  { id: 'blur', name: '模糊' },
  { id: 'circle', name: '圓形' },
];

// 調色參數：全部 -100～100，0 是原樣
export const COLOR_KEYS = [
  { k: 'b', name: '亮度' }, { k: 'c', name: '對比' }, { k: 's', name: '飽和' },
  { k: 't', name: '色溫' }, { k: 'h', name: '色調' }, { k: 'v', name: '暗角' }, { k: 'f', name: '褪色' },
];

export const clipColor = c => (c.color ||= { b: 0, c: 0, s: 0, t: 0, h: 0, v: 0, f: 0 });
export const filterCss = id => (FILTERS.find(f => f.id === id) || FILTERS[0]).css;

function clipCss(c) {
  const col = c.color || {};
  const parts = [];
  const f = filterCss(c.filter || 'none');
  if (f) parts.push(f);
  if (col.b) parts.push(`brightness(${1 + col.b / 100})`);
  if (col.c) parts.push(`contrast(${1 + col.c / 100})`);
  if (col.s) parts.push(`saturate(${1 + col.s / 100})`);
  return parts.join(' ');
}

// 色溫／色調／暗角／褪色：畫完之後再疊一層半透明色
function colorOverlays(g, c, W, H) {
  const col = c.color || {};
  if (col.t) {
    g.save(); g.globalCompositeOperation = 'overlay';
    g.fillStyle = col.t > 0 ? `rgba(255,150,60,${col.t / 260})` : `rgba(60,150,255,${-col.t / 260})`;
    g.fillRect(0, 0, W, H); g.restore();
  }
  if (col.h) {
    g.save(); g.globalCompositeOperation = 'overlay';
    g.fillStyle = col.h > 0 ? `rgba(255,60,200,${col.h / 300})` : `rgba(60,255,140,${-col.h / 300})`;
    g.fillRect(0, 0, W, H); g.restore();
  }
  if (col.f) {
    g.save(); g.fillStyle = `rgba(255,255,255,${col.f / 220})`; g.fillRect(0, 0, W, H); g.restore();
  }
  if (col.v) {
    const a = Math.min(0.9, col.v / 110);
    const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, `rgba(0,0,0,${a})`);
    g.save(); g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
  }
}

// 片段在 t 時刻的來源秒數（含轉場時借用前後素材）
export function sourceAt(c, t) {
  const rec = media.get(c.mediaId);
  const v = (c.offset || 0) + (t - clipStart(c));
  return Math.max(0, rec?.dur ? Math.min(v, rec.dur - 0.02) : v);
}

// 淡入淡出（秒）：回傳 0～1 的可見度
export function clipAlpha(c, t) {
  const s = clipStart(c), d = clipDur(c);
  const fin = c.fadeIn || 0, fout = c.fadeOut || 0;
  let a = 1;
  if (fin > 0) a = Math.min(a, (t - s) / fin);
  if (fout > 0) a = Math.min(a, (s + d - t) / fout);
  return Math.max(0, Math.min(1, a));
}

// 兩個離屏畫布重複使用，避免每格都新建
const tmp = new Map();
function tmpCanvas(key, W, H) {
  const cur = tmp.get(key);
  if (cur && cur.width === W && cur.height === H) return cur;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  tmp.set(key, cv);
  return cv;
}

// 把一個片段的畫面（含濾鏡、調色）畫到離屏畫布
async function frameCanvas(key, c, t, W, H, seek) {
  const cv = tmpCanvas(key, W, H);
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  const rec = await ensureMedia(c.mediaId);
  if (!rec.ready) {
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.font = FONT(Math.max(12, H * 0.03), true); g.textAlign = 'center';
    g.fillText(rec.missing ? `找不到影片素材：${c.name}` : `載入中：${c.name}`, W / 2, H / 2);
    return cv;
  }
  const src = sourceAt(c, t);
  if (seek) await seekTo(rec.el, src);
  const f = filterCss(c.filter || 'none');
  if (f && (c.filterAmt ?? 1) >= 0.999) {
    g.save(); g.filter = f; drawContain(g, rec.el, W, H); g.restore();
  } else if (f) {
    // 強度不滿 100%：濾鏡版疊在原圖上
    const on = tmpCanvas(key + '-f', W, H), og = on.getContext('2d');
    og.setTransform(1, 0, 0, 1, 0, 0); og.filter = 'none'; og.clearRect(0, 0, W, H);
    og.save(); og.filter = f; drawContain(og, rec.el, W, H); og.restore();
    drawContain(g, rec.el, W, H);
    g.save(); g.globalAlpha = Math.max(0, Math.min(1, c.filterAmt ?? 1)); g.drawImage(on, 0, 0); g.restore();
  } else {
    drawContain(g, rec.el, W, H);
  }
  colorOverlays(g, c, W, H);
  return cv;
}

// 把兩張畫布依轉場類型疊起來（預覽、輸出、縮圖共用）
export function blendCanvases(ctx, W, H, A, B, type, p) {
  ctx.save();
  if (type === 'dissolve') {
    ctx.drawImage(A, 0, 0); ctx.globalAlpha = p; ctx.drawImage(B, 0, 0);
  } else if (type === 'black' || type === 'white') {
    const col = type === 'black' ? '#000' : '#fff';
    if (p < 0.5) { ctx.drawImage(A, 0, 0); ctx.globalAlpha = p * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
    else { ctx.drawImage(B, 0, 0); ctx.globalAlpha = (1 - p) * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
  } else if (type === 'blur') {
    const px = Math.sin(p * Math.PI) * Math.max(4, W / 90);
    ctx.drawImage(A, 0, 0);
    ctx.globalAlpha = p; ctx.filter = `blur(${px}px)`; ctx.drawImage(B, 0, 0); ctx.filter = 'none';
  } else if (type === 'left' || type === 'right' || type === 'up' || type === 'down') {
    // 新畫面從相反方向滑進來，舊畫面同時被推走（或讓開）
    const e = 1 - Math.pow(1 - p, 3);                     // ease-out
    const ax = type === 'left' ? -e * W : type === 'right' ? e * W : 0;
    const ay = type === 'up' ? -e * H : type === 'down' ? e * H : 0;
    const bx = type === 'left' ? (1 - e) * W : type === 'right' ? -(1 - e) * W : 0;
    const by = type === 'up' ? (1 - e) * H : type === 'down' ? -(1 - e) * H : 0;
    ctx.drawImage(A, ax, ay);
    ctx.drawImage(B, bx, by);
  } else if (type === 'push') {
    ctx.drawImage(A, -p * W, 0);
    ctx.drawImage(B, (1 - p) * W, 0);
  } else if (type === 'zoom') {
    ctx.drawImage(A, 0, 0);
    const s = 1 + 0.35 * (1 - p);
    ctx.globalAlpha = Math.min(1, p * 1.15);
    ctx.drawImage(B, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
  } else if (type === 'circle') {
    ctx.drawImage(A, 0, 0);
    const r = Math.hypot(W, H) / 2 * p;
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(B, 0, 0); ctx.restore();
  } else {
    ctx.drawImage(A, 0, 0); ctx.globalAlpha = p; ctx.drawImage(B, 0, 0);
  }
  ctx.restore();
}

// 轉場需要兩個片段的畫面：先各自畫到離屏，再交給 blendCanvases
async function blendTransition(ctx, W, H, a, b, t, p, seek) {
  const A = await frameCanvas('A', a, t, W, H, seek);
  const B = await frameCanvas('B', b, t, W, H, seek);
  blendCanvases(ctx, W, H, A, B, a.trans?.type || 'dissolve', p);
}

// 給面板做縮圖用：片段在 t 時刻（相對於片段起點）的一格
export async function stillCanvas(clip, W, H, { filterId, at = 0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rec = await ensureMedia(clip.mediaId);
  if (!rec.ready) return cv;
  await seekTo(rec.el, sourceAt(clip, clipStart(clip) + at));
  const f = filterId ? filterCss(filterId) : filterCss(clip.filter || 'none');
  g.save(); if (f) g.filter = f;
  drawContain(g, rec.el, W, H);
  g.restore();
  return cv;
}

// 轉場縮圖：兩格疊在轉場中間（p = 0.5）
export async function transitionCanvas(a, b, type, W, H) {
  const A = await stillCanvas(a, W, H, { at: Math.max(0, clipDur(a) - 0.3) });
  const B = await stillCanvas(b, W, H, { at: 0.1 });
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  blendCanvases(cv.getContext('2d'), W, H, A, B, type, 0.5);
  return cv;
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
    const cs = [...tr.clips].sort((x, y) => clipStart(x) - clipStart(y));
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], next = cs[i + 1];
      const s = clipStart(c), e = s + clipDur(c);
      // 轉場：橫跨兩個片段的交界
      if (c.trans?.type && next && Math.abs(clipStart(next) - e) < 0.25) {
        const D = Math.max(0.1, Math.min(c.trans.dur || 0.6, clipDur(c), clipDur(next)));
        const j = clipStart(next), half = D / 2;
        if (t >= j - half && t < j + half) {
          await blendTransition(ctx, W, H, c, next, t, (t - (j - half)) / D, seek);
          i++;                       // 下一個片段已經畫進轉場裡，不要再畫一次
          continue;
        }
      }
      if (t < s || t >= e) continue;
      const frame = await frameCanvas('A', c, t, W, H, seek);
      const a = clipAlpha(c, t);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(frame, 0, 0);
      ctx.restore();
      // 淡出色：黑以外的顏色用疊色做，黑就直接靠背景
      const fc = c.fadeColor || '#000000';
      if (a < 1 && !/^#0{6}$/i.test(fc)) {
        ctx.save(); ctx.globalAlpha = 1 - a; ctx.fillStyle = fc; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
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
