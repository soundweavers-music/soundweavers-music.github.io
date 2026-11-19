// 專輯母帶面板：加入多首歌 → 設定（母帶方式、目標響度、專輯模式、淡入淡出、去靜音）→ 批次處理 → 試聽 → 下載
import { store } from './state.js';
import { TARGETS } from './loudness.js';
import { defaultMastering } from './mastering.js';
import { probe, describeInfo, outputFormat, decodeFile, processAlbum, encodeLike, FADE_CURVES } from './album.js';
import { downloadBlob, toast } from './util.js';

const KEY = 'zhiyin-daw-album';
const fmtL = v => (isFinite(v) ? v.toFixed(1) : '—');
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');

let root = null, songs = [], results = null, running = false, cancel = false;
let player = null;   // { ctx, src, idx, which }

const defaults = () => ({ mode: 'auto', target: 'stream', album: 'album', keepGap: 35, fadeIn: 0.5, fadeOut: 3, curveIn: 'equal', curveOut: 'equal', trim: true, trimDb: -60, firstNoFadeIn: false, numbering: true, zip: true });
let S = defaults();
try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { /* noop */ }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

function build() {
  root = document.createElement('div');
  root.className = 'alb hidden';
  root.innerHTML = `
  <div class="alb-win">
    <div class="alb-head"><strong>專輯母帶</strong><span class="alb-sub">一次處理整張專輯：母帶、統一響度、淡入淡出，以原本的格式與位元率輸出</span>
      <div class="spacer"></div><button type="button" class="tbtn ghost alb-x" title="關閉">✕</button></div>
    <div class="alb-body">
      <section class="alb-list">
        <div class="alb-drop"><b>把歌曲拖到這裡</b>（WAV、FLAC、MP3、OGG、M4A，可以一次多首）<button type="button" class="tbtn alb-add">加入檔案…</button>
          <button type="button" class="tbtn ghost alb-clear">清空</button></div>
        <div class="alb-rows"></div>
        <p class="note alb-sum"></p>
      </section>
      <section class="alb-set">
        <h4>母帶</h4>
        <div class="seg alb-mode">
          <label><input type="radio" name="am" value="auto">每首一鍵最佳化</label>
          <label><input type="radio" name="am" value="current">套用目前專案的母帶設定</label>
          <label><input type="radio" name="am" value="none">不處理（只做淡入淡出）</label>
        </div>
        <label class="f">目標響度 <select class="alb-target">${TARGETS.map(t => `<option value="${t.id}">${t.name}　${t.lufs} LUFS / ${t.tp} dBTP</option>`).join('')}</select></label>
        <div class="seg alb-album">
          <label title="最大聲的那首到目標響度，其他歌保留原本跟它的差距（抒情歌仍然比較小聲）"><input type="radio" name="aa" value="album">專輯模式：保留歌曲之間的大小差異</label>
          <label title="每一首都推到目標響度"><input type="radio" name="aa" value="each">每首都到目標響度</label>
        </div>
        <label class="alb-keep" title="原本最安靜的歌比最大聲的小 12 LU、保留 35% → 處理後小約 4 LU">保留差距 <input type="range" class="alb-kg" min="0" max="100" step="5"><b></b></label>
        <h4>淡入淡出</h4>
        <div class="alb-fade">
          <label>淡入 <input type="number" class="alb-fi" min="0" max="30" step="0.1"> 秒</label>
          <select class="alb-ci">${FADE_CURVES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
          <label>淡出 <input type="number" class="alb-fo" min="0" max="60" step="0.1"> 秒</label>
          <select class="alb-co">${FADE_CURVES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        </div>
        <div class="alb-quick">淡出快速選：${[0, 1, 2, 3, 5, 8, 10].map(v => `<button type="button" data-fo="${v}">${v ? v + ' 秒' : '不淡出'}</button>`).join('')}</div>
        <label class="alb-chk"><input type="checkbox" class="alb-trim"> 去掉頭尾的靜音（低於 <input type="number" class="alb-tdb" min="-90" max="-30" step="1"> dB）</label>
        <label class="alb-chk"><input type="checkbox" class="alb-first"> 第一首不淡入</label>
        <p class="note">每首歌也可以在左邊清單個別設定淡入／淡出（留空 = 用這裡的設定）。</p>
        <h4>輸出</h4>
        <p class="note">每首都以<b>原本的格式</b>輸出：取樣率、位元深度、MP3 位元率、聲道數都跟原檔一樣。16／24-bit 會加上 dither。瀏覽器沒有編碼器的格式（OGG、M4A）改輸出 FLAC（無損）。</p>
        <label class="alb-chk"><input type="checkbox" class="alb-num"> 檔名加上曲序（01_、02_…）</label>
        <label class="alb-chk"><input type="checkbox" class="alb-zip"> 打包成一個 ZIP 下載</label>
        <div class="alb-go"><button type="button" class="tbtn primary alb-run">▶ 開始處理</button><button type="button" class="tbtn ghost alb-stop" hidden>取消</button>
          <button type="button" class="tbtn alb-dl" hidden>⬇ 下載全部</button></div>
        <div class="alb-prog" hidden><div class="ai-bar"><i></i></div><p class="note alb-st"></p></div>
      </section>
    </div>
  </div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  $('.alb-x').onclick = () => toggleAlbum(false);
  root.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' && !running) toggleAlbum(false); });
  // 加入檔案
  const pick = document.createElement('input'); pick.type = 'file'; pick.multiple = true; pick.accept = 'audio/*,.wav,.flac,.mp3,.ogg,.m4a,.aac,.opus';
  pick.onchange = () => { addFiles([...pick.files]); pick.value = ''; };
  $('.alb-add').onclick = () => pick.click();
  $('.alb-clear').onclick = () => { if (running) return; stop(); songs = []; results = null; renderRows(); };
  const drop = $('.alb-list');
  drop.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('over'); });
  drop.addEventListener('drop', e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  // 設定
  const bindRadio = (name, key) => root.querySelectorAll(`[name=${name}]`).forEach(r => { r.checked = S[key] === r.value; r.onchange = () => { S[key] = r.value; save(); stale(); }; });
  bindRadio('am', 'mode'); bindRadio('aa', 'album');
  const bindVal = (sel, key, num) => { const el = $(sel); const isChk = el.type === 'checkbox'; isChk ? (el.checked = !!S[key]) : (el.value = S[key]); el.onchange = () => { S[key] = isChk ? el.checked : num ? Math.max(+el.min, Math.min(+el.max, +el.value || 0)) : el.value; if (!isChk) el.value = S[key]; save(); stale(); }; };
  bindVal('.alb-target', 'target'); bindVal('.alb-fi', 'fadeIn', 1); bindVal('.alb-fo', 'fadeOut', 1); bindVal('.alb-ci', 'curveIn'); bindVal('.alb-co', 'curveOut');
  bindVal('.alb-trim', 'trim'); bindVal('.alb-tdb', 'trimDb', 1); bindVal('.alb-first', 'firstNoFadeIn'); bindVal('.alb-num', 'numbering'); bindVal('.alb-zip', 'zip');
  const kg = $('.alb-kg'), kgv = $('.alb-keep b'), kgShow = () => { kgv.textContent = `${S.keepGap}%`; $('.alb-keep').classList.toggle('off', S.album !== 'album'); };
  kg.value = S.keepGap; kgShow();
  kg.oninput = () => { S.keepGap = +kg.value; kgShow(); };
  kg.onchange = () => { save(); stale(); };
  root.querySelectorAll('[name=aa]').forEach(r => r.addEventListener('change', kgShow));
  $('.alb-quick').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.fadeOut = +b.dataset.fo; $('.alb-fo').value = S.fadeOut; save(); stale(); };
  $('.alb-run').onclick = run;
  $('.alb-stop').onclick = () => { cancel = true; $('.alb-st').textContent = '取消中（這一首算完就停）…'; };
  $('.alb-dl').onclick = downloadAll;
}

// 設定改了：之前的結果就不算數
function stale() { if (results && !running) { results = null; renderRows(); } }

async function addFiles(files) {
  const aud = files.filter(f => /^audio\//.test(f.type) || /\.(wav|flac|mp3|ogg|m4a|aac|opus|aif|aiff)$/i.test(f.name));
  if (!aud.length) { toast('沒有可以讀取的音訊檔', 'warn'); return; }
  aud.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));
  results = null;
  for (const f of aud) {
    const s = { file: f, name: f.name.replace(/\.[^.]+$/, ''), info: null, buf: null, err: '', fadeIn: null, fadeOut: null };
    songs.push(s);
    renderRows();
    try {
      s.info = await probe(f);
      s.buf = await decodeFile(f, s.info.sampleRate);
      if (!s.info.sampleRate) { s.info.sampleRate = s.buf.sampleRate; s.info.channels = s.buf.numberOfChannels; }
      if (s.buf.sampleRate !== s.info.sampleRate) s.info.sampleRate = s.buf.sampleRate;
    } catch (e) { s.err = '無法讀取：' + (e.message || e); }
    renderRows();
  }
}

function renderRows() {
  if (!root) return;
  const box = root.querySelector('.alb-rows');
  box.innerHTML = '';
  if (!songs.length) box.innerHTML = '<p class="alb-empty">還沒有歌曲。可以一次選很多首，依檔名排序；拖曳 ⠿ 調整曲序。</p>';
  songs.forEach((s, i) => {
    const r = results?.[i];
    const row = document.createElement('div');
    row.className = 'alb-row' + (s.err ? ' err' : '') + (s._state ? ' ' + s._state : '');
    row.draggable = !running;
    const fmt = s.info && outputFormat(s.info);
    row.innerHTML = `
      <span class="grip" title="拖曳調整曲序">⠿</span><b class="no">${String(i + 1).padStart(2, '0')}</b>
      <div class="meta"><input class="nm" value="${s.name.replace(/"/g, '&quot;')}" title="輸出檔名">
        <span class="inf">${s.err || (s.buf ? `${fmtT(s.buf.duration)} · ${describeInfo(s.info)}${fmt?.note ? ` · <em>${fmt.note}</em>` : ''}` : '讀取中…')}</span>
        <span class="res">${s._msg || (r ? `${fmtL(r.before.integrated)} → <b>${fmtL(r.final.integrated)} LUFS</b> · ${r.final.truePeakDb.toFixed(1)} dBTP${r.albumGain ? ` · 專輯調整 ${r.albumGain.toFixed(1)} dB` : ''}` : '')}</span></div>
      <label class="ov" title="這首的淡入秒數（空白 = 用右邊的設定）">入<input type="number" class="ofi" min="0" max="30" step="0.1" placeholder="${S.fadeIn}" value="${s.fadeIn ?? ''}"></label>
      <label class="ov" title="這首的淡出秒數（空白 = 用右邊的設定）">出<input type="number" class="ofo" min="0" max="60" step="0.1" placeholder="${S.fadeOut}" value="${s.fadeOut ?? ''}"></label>
      <span class="pl">${r ? '<button type="button" class="tbtn ghost pa" title="試聽原檔">原</button><button type="button" class="tbtn ghost pb" title="試聽處理後">後</button><button type="button" class="tbtn ghost dl1" title="下載這一首">⬇</button>' : ''}</span>
      <button type="button" class="tbtn ghost rm" title="移除">✕</button>`;
    row.querySelector('.nm').onchange = e => { s.name = e.target.value.trim() || s.name; };
    const ov = (cls, key) => { row.querySelector(cls).onchange = e => { s[key] = e.target.value === '' ? null : Math.max(0, +e.target.value); stale(); }; };
    ov('.ofi', 'fadeIn'); ov('.ofo', 'fadeOut');
    row.querySelector('.rm').onclick = () => { if (running) return; stop(); songs.splice(i, 1); if (results) results.splice(i, 1); renderRows(); };
    row.querySelector('.pa')?.addEventListener('click', () => play(i, 'a'));
    row.querySelector('.pb')?.addEventListener('click', () => play(i, 'b'));
    row.querySelector('.dl1')?.addEventListener('click', () => downloadOne(i));
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-alb', String(i)); row.classList.add('drag'); });
    row.addEventListener('dragend', () => row.classList.remove('drag'));
    row.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-alb')) { e.preventDefault(); row.classList.add('tgt'); } });
    row.addEventListener('dragleave', () => row.classList.remove('tgt'));
    row.addEventListener('drop', e => {
      const from = e.dataTransfer.getData('text/x-alb'); if (from === '') return;
      e.preventDefault(); e.stopPropagation();
      const f = +from; if (f === i) return;
      songs.splice(i, 0, songs.splice(f, 1)[0]);
      if (results) results.splice(i, 0, results.splice(f, 1)[0]);
      // 專輯模式跟曲序無關，但「第一首不淡入」有關
      if (S.firstNoFadeIn && (f === 0 || i === 0)) results = null;
      renderRows();
    });
    box.appendChild(row);
  });
  const ok = songs.filter(s => s.buf);
  const tot = ok.reduce((a, s) => a + s.buf.duration, 0);
  root.querySelector('.alb-sum').textContent = songs.length ? `${songs.length} 首 · 共 ${fmtT(tot)}${songs.some(s => s.err) ? ' · 有檔案讀不到，處理時會略過' : ''}` : '';
  root.querySelector('.alb-dl').hidden = !results || running;
}

async function run() {
  const list = songs.filter(s => s.buf && !s.err);
  if (!list.length) { toast('先加入歌曲', 'warn'); return; }
  if (songs.some(s => !s.buf && !s.err)) { toast('還有歌曲在讀取中，請稍等', 'warn'); return; }
  songs = songs.filter(s => s.buf && !s.err);
  stop();
  running = true; cancel = false; results = null;
  const $ = s => root.querySelector(s);
  $('.alb-run').disabled = true; $('.alb-stop').hidden = false; $('.alb-prog').hidden = false; $('.alb-dl').hidden = true;
  songs.forEach(s => { s._state = ''; s._msg = ''; });
  renderRows();
  const bar = $('.alb-prog i'), st = $('.alb-st');
  const t0 = performance.now();
  const n = songs.length;
  try {
    const current = store.project.mastering || defaultMastering();
    const res = await processAlbum(songs, { ...S, current, cancelled: () => cancel }, (i, stage, data) => {
      const s = songs[i];
      if (stage === 'analyze') { s._state = 'work'; s._msg = '分析中…'; }
      else if (stage === 'step') s._msg = data;
      else if (stage === 'mastered') { s._msg = `母帶完成 ${fmtL(data.after.integrated)} LUFS`; }
      else if (stage === 'done') { s._state = 'ok'; s._msg = ''; }
      // 母帶佔 90%，淡入淡出 10%
      const done = stage === 'done' ? 0.9 + 0.1 * (i + 1) / n : (i + (stage === 'mastered' ? 1 : 0.3)) / n * 0.9;
      bar.style.width = (done * 100).toFixed(1) + '%';
      const el = (performance.now() - t0) / 1000;
      st.textContent = `${stage === 'done' ? '收尾' : '母帶'}：第 ${i + 1} / ${n} 首「${s.name}」· ${Math.round(el)} 秒`;
      renderRows();
    });
    results = res;
    bar.style.width = '100%';
    const T = TARGETS.find(t => t.id === S.target);
    const loud = res.map(r => r.final.integrated).filter(isFinite);
    st.textContent = `完成 ${n} 首，用了 ${Math.round((performance.now() - t0) / 1000)} 秒。響度 ${fmtL(Math.min(...loud))} ～ ${fmtL(Math.max(...loud))} LUFS（目標 ${T.lufs}）。可以先試聽，再下載。`;
  } catch (e) {
    st.textContent = e.message === '已取消' ? '已取消。' : '處理失敗：' + e.message;
    if (e.message !== '已取消') console.error(e);
    songs.forEach(s => { if (s._state === 'work') { s._state = ''; s._msg = ''; } });
  } finally {
    running = false;
    $('.alb-run').disabled = false; $('.alb-stop').hidden = true;
    renderRows();
  }
}

function fileName(i) {
  const s = songs[i], ext = results[i].fmt.ext;
  return `${S.numbering ? String(i + 1).padStart(2, '0') + '_' : ''}${safe(s.name)}.${ext}`;
}

async function encodeAt(i, label) {
  const r = results[i];
  // 編碼前複製（dither 會改到資料，試聽與重複下載都要用原本的）
  const b = new AudioBuffer({ numberOfChannels: r.buf.numberOfChannels, length: r.buf.length, sampleRate: r.buf.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) b.copyToChannel(r.buf.getChannelData(c), c);
  return encodeLike(b, r.fmt, p => { root.querySelector('.alb-st').textContent = `${label}編碼 ${Math.round(p * 100)}%`; });
}

async function downloadOne(i) {
  try { downloadBlob(await encodeAt(i, ''), fileName(i)); root.querySelector('.alb-st').textContent = `已下載 ${fileName(i)}`; }
  catch (e) { toast('編碼失敗：' + e.message, 'error'); }
}

async function downloadAll() {
  if (!results) return;
  const btn = root.querySelector('.alb-dl'); btn.disabled = true;
  try {
    if (S.zip && window.JSZip) {
      const zip = new window.JSZip();
      for (let i = 0; i < results.length; i++) zip.file(fileName(i), await encodeAt(i, `${i + 1}/${results.length}「${songs[i].name}」`));
      root.querySelector('.alb-st').textContent = '打包中…';
      downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${safe(store.project.name || '專輯')}_mastered.zip`);
    } else {
      for (let i = 0; i < results.length; i++) { downloadBlob(await encodeAt(i, `${i + 1}/${results.length} `), fileName(i)); await new Promise(r => setTimeout(r, 400)); }
    }
    root.querySelector('.alb-st').textContent = `已下載 ${results.length} 首。`;
  } catch (e) { toast('輸出失敗：' + e.message, 'error'); }
  finally { btn.disabled = false; }
}

// ---------- 試聽 ----------
function stop() {
  if (player) { try { player.src.stop(); } catch (_) { /* noop */ } player.ctx.close(); player = null; }
  root?.querySelectorAll('.alb-row .on').forEach(b => b.classList.remove('on'));
}
function play(i, which) {
  const same = player && player.idx === i && player.which === which;
  stop();
  if (same) return;
  const buf = which === 'a' ? songs[i].buf : results[i].buf;
  const ctx = new AudioContext({ sampleRate: buf.sampleRate });
  const src = ctx.createBufferSource(); src.buffer = buf;
  // 從後段開始比較容易聽出淡出；原檔與處理後都從同一個位置播（處理後少了頭的靜音，位置不完全一樣）
  src.connect(ctx.destination); src.start();
  src.onended = () => { if (player && player.src === src) stop(); };
  player = { ctx, src, idx: i, which };
  root.querySelectorAll('.alb-row')[i]?.querySelector(which === 'a' ? '.pa' : '.pb')?.classList.add('on');
}

export function toggleAlbum(force) {
  if (!root) build();
  const open = force ?? root.classList.contains('hidden');
  if (!open && running) { toast('處理中，請先等它完成或按「取消」', 'warn'); return; }
  root.classList.toggle('hidden', !open);
  if (!open) stop();
  else renderRows();
}
