// AI 人聲分離對話框：安裝模型（使用者自己下載）→ 選處理器 → 分離成新軌道
import { store, newTrack, MAX_TRACKS } from './state.js';
import { uid, computePeaks, toast } from './util.js';
import { DEMUCS_MODEL, modelInfo, installModelFile, removeModel, separateBufferAI, estimateSegments } from './demucs.js';

let dlg = null, busy = false;
const MB = b => (b / 1048576).toFixed(0) + ' MB';

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'wide ai-sep';
  dlg.innerHTML = `
  <form method="dialog">
    <header>AI 人聲分離（Demucs）<span style="color:var(--tx2);font-weight:400">模型在你的電腦上執行</span></header>
    <div class="dbody">
      <div class="ai-model"></div>
      <div class="ai-opts">
        <div class="f">處理器
          <div class="seg"><label><input type="radio" name="prefer" value="auto" checked>顯示卡優先（WebGPU）</label><label><input type="radio" name="prefer" value="cpu">只用 CPU</label></div>
        </div>
        <label class="ai-chk"><input type="checkbox" name="stems"> 另外分出鼓、貝斯、其他樂器（共 4 軌 + 伴奏）</label>
        <p class="note ai-est"></p>
      </div>
      <div class="ai-run" hidden><div class="ai-bar"><i></i></div><p class="note ai-st"></p></div>
      <p class="note">這是選用功能：<b>不用模型時完全不會下載任何東西</b>，右鍵選單的「簡易版」照常可用。模型由 Meta 的 Demucs v4（htdemucs，MIT 授權）轉換而來，比簡易版乾淨很多，副歌、和聲、置中的樂器都分得開；代價是要先下載 ${MB(DEMUCS_MODEL.bytes)}，而且運算很重：實測只用 CPU 約是<b>音樂長度的 15～20 倍</b>（3 分鐘的歌約 45～60 分鐘），用 WebGPU 會快一些，實際速度要看顯示卡。分離時請不要關閉分頁。</p>
    </div>
    <footer><button type="button" class="tbtn ghost ai-cancel">關閉</button><button type="button" class="tbtn primary ai-go">開始分離</button></footer>
  </form>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.ai-cancel').onclick = () => { if (!busy) dlg.close(); };
  dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dlg.addEventListener('keydown', e => e.stopPropagation());
}

async function renderModel() {
  const box = dlg.querySelector('.ai-model');
  const info = await modelInfo();
  if (info) {
    box.innerHTML = `<div class="ai-ok">✅ 已安裝模型 <b>${info.name}</b>（${MB(info.bytes)}，SHA-256 核對通過）<button type="button" class="tbtn ghost ai-rm">移除模型</button></div>`;
    box.querySelector('.ai-rm').onclick = async () => {
      if (!confirm('要從瀏覽器移除 AI 模型嗎？之後要用需要重新選檔。')) return;
      await removeModel(); renderModel(); toast('已移除 AI 模型');
    };
  } else {
    box.innerHTML = `
      <h4 class="bank-h">① 下載模型檔（${MB(DEMUCS_MODEL.bytes)}，只需要一次）</h4>
      <p class="note">點下面的連結，瀏覽器會把 <b>${DEMUCS_MODEL.name}</b> 存到「下載」資料夾。下載由你的瀏覽器直接向 Hugging Face 進行，這個網頁不會參與、也不會收到你的任何檔案。</p>
      <p><a class="tbtn" href="${DEMUCS_MODEL.url}" target="_blank" rel="noopener" download>⬇ 下載 ${DEMUCS_MODEL.name}</a>
         <a class="ai-src" href="${DEMUCS_MODEL.page}" target="_blank" rel="noopener">模型頁面</a></p>
      <h4 class="bank-h">② 下載完成後，選擇這個檔案</h4>
      <div class="bank-drop ai-drop"><strong>把 .onnx 拖到這裡</strong>　<button type="button" class="tbtn ai-pick">選擇檔案…</button>
        <p class="note">會核對檔案大小與 SHA-256，確定是正確的模型才使用，然後存在這個瀏覽器（IndexedDB），下次不用再選。授權：${DEMUCS_MODEL.license}。</p></div>
      <p class="note ai-inst"></p>`;
    const pick = document.createElement('input'); pick.type = 'file'; pick.accept = '.onnx';
    const st = box.querySelector('.ai-inst');
    const install = async f => {
      if (!f) return;
      try { await installModelFile(f, t => { st.textContent = t; }); toast('AI 模型安裝完成'); renderModel(); }
      catch (e) { st.textContent = ''; toast(e.message, 'error'); }
    };
    box.querySelector('.ai-pick').onclick = () => pick.click();
    pick.onchange = () => install(pick.files[0]);
    const drop = box.querySelector('.ai-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); install(e.dataTransfer.files[0]); });
  }
  dlg.querySelector('.ai-go').disabled = !info;
  dlg.querySelector('.ai-opts').classList.toggle('soon', !info);
}

export async function openAiSeparate(clipId) {
  const found = store.findClip(clipId);
  if (!found || found.clip.notes) return;
  if (!dlg) build();
  const { clip } = found;
  const segs = estimateSegments(clip.duration);
  const hasGpu = 'gpu' in navigator;
  dlg.querySelector('.ai-est').innerHTML = `這個片段 ${clip.duration.toFixed(1)} 秒，要算 ${segs} 段。${hasGpu ? '' : '<b>這個瀏覽器不支援 WebGPU，只能用 CPU（會很慢）。</b>建議用新版 Chrome 或 Edge。'}`;
  dlg.querySelector('.ai-run').hidden = true;
  await renderModel();
  dlg.querySelector('.ai-go').onclick = () => run(clipId);
  dlg.showModal();
}

async function run(clipId) {
  const found = store.findClip(clipId);
  if (!found) return;
  const { track, clip } = found;
  const p = store.project;
  const stems = dlg.querySelector('[name=stems]').checked;
  const need = stems ? 5 : 2;
  if (p.tracks.length + need > MAX_TRACKS) { toast(`軌道已經 ${p.tracks.length} 條，最多 ${MAX_TRACKS} 條，請先刪掉不用的軌道`, 'warn'); return; }
  const src = store.buffers.get(clip.bufferId);
  if (!src) return;
  const sr = src.sampleRate, s0 = Math.max(0, Math.floor(clip.offset * sr)), n = Math.min(src.length - s0, Math.ceil(clip.duration * sr));
  const part = new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: n, sampleRate: sr });
  for (let c = 0; c < src.numberOfChannels; c++) part.copyToChannel(src.getChannelData(c).subarray(s0, s0 + n), c);
  const runBox = dlg.querySelector('.ai-run'), bar = runBox.querySelector('i'), st = runBox.querySelector('.ai-st');
  const go = dlg.querySelector('.ai-go'), cancel = dlg.querySelector('.ai-cancel');
  runBox.hidden = false; go.disabled = true; cancel.disabled = true; busy = true;
  bar.style.width = '0%';
  const t0 = performance.now();
  let res;
  try {
    res = await separateBufferAI(part, { prefer: dlg.querySelector('[name=prefer]:checked').value, stems },
      (pr, seg, total) => {
        bar.style.width = (pr * 100).toFixed(1) + '%';
        const el = (performance.now() - t0) / 1000, eta = pr > 0 ? el / pr - el : 0;
        st.textContent = `第 ${seg} / ${total} 段 · 已經 ${Math.round(el)} 秒${pr > 0 && pr < 1 ? `，大約還要 ${Math.round(eta)} 秒` : ''}`;
      },
      t => { st.textContent = t; });
  } catch (e) {
    busy = false; go.disabled = false; cancel.disabled = false;
    st.textContent = '';
    toast(e.message, 'error');
    return;
  }
  busy = false; go.disabled = false; cancel.disabled = false;
  // 加入新軌道
  store.checkpoint();
  const idx = p.tracks.indexOf(track);
  let k = 0;
  const mkTrack = (name, buf, color) => {
    const t = newTrack(p.tracks.length, 'audio');
    t.name = name; t.color = color;
    const id = uid('buf');
    store.buffers.set(id, buf);
    store.bufferMeta.set(id, { name: `${name}.wav`, peaks: computePeaks(buf) });
    t.clips.push({ id: uid('clip'), bufferId: id, name, start: clip.start, offset: 0, duration: Math.min(buf.duration, clip.duration),
      gainDb: clip.gainDb || 0, fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0 });
    p.tracks.splice(idx + 1 + k++, 0, t);
    return t;
  };
  const base = clip.name.replace(/\s*(人聲|伴奏)$/, '').replace(/（已分離）$/, '');
  const v = mkTrack(`${base} 人聲（AI）`, res.vocal, '#f78fc3');
  mkTrack(`${base} 伴奏（AI）`, res.inst, '#5ad1e8');
  if (res.stems) {
    mkTrack(`${base} 鼓（AI）`, res.stems.drums, '#f5b83d');
    mkTrack(`${base} 貝斯（AI）`, res.stems.bass, '#9bd35a');
    mkTrack(`${base} 其他（AI）`, res.stems.other, '#a78bfa');
  }
  clip.gainDb = -60;
  if (!clip.name.endsWith('（已分離）')) clip.name += '（已分離）';
  store.selection.trackId = v.id;
  store.selection.clipIds = new Set([v.clips[0].id]);
  store.changed('structure');
  dlg.close();
  toast(`AI 分離完成（${res.backend === 'webgpu' ? '顯示卡' : 'CPU'}，${Math.round(res.ms / 1000)} 秒）。原片段保留並靜音，可以 Ctrl+Z 復原。`);
}
