// AI 人聲分離（Demucs）：模型管理（使用者自己下載 → 選檔 → 核對 SHA-256 → 存在 IndexedDB）與分離
// 網頁本身不下載模型：使用者點連結在瀏覽器下載，再把檔案交給網頁。
export const DEMUCS_MODEL = {
  name: 'htdemucs_embedded.onnx',
  url: 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx',
  page: 'https://huggingface.co/timcsy/demucs-web-onnx',
  bytes: 180534758,
  sha256: 'e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077',
  license: 'Demucs v4 (htdemucs)：MIT，Meta Platforms；ONNX 轉換：demucs-web（MIT）',
};

const DB = 'zhiyin-daw-models', STORE = 'models', KEY = 'htdemucs';
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(q && q.result); };
    t.onerror = () => { db.close(); rej(t.error); };
    t.onabort = () => { db.close(); rej(t.error || new Error('儲存空間不足')); };
  });
}

let cached = null;   // ArrayBuffer（這次開頁面已經讀過）
export async function modelInfo() {
  try {
    const m = await tx('readonly', s => s.get(KEY + ':meta'));
    return m || null;
  } catch (_) { return null; }
}
async function loadModel() {
  if (cached) return cached;
  const b = await tx('readonly', s => s.get(KEY));
  if (!(b instanceof ArrayBuffer)) throw new Error('還沒有安裝 AI 模型');
  cached = b;
  return b;
}
export async function removeModel() {
  cached = null;
  await tx('readwrite', s => { s.delete(KEY); s.delete(KEY + ':meta'); });
  if (worker) { worker.terminate(); worker = null; }
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// 使用者選的檔案 → 核對 → 存起來
export async function installModelFile(file, onStatus = () => {}) {
  if (!/\.onnx$/i.test(file.name)) throw new Error(`「${file.name}」不是 .onnx 模型檔`);
  if (file.size !== DEMUCS_MODEL.bytes) {
    throw new Error(`檔案大小不對（${(file.size / 1048576).toFixed(1)} MB，應該是 ${(DEMUCS_MODEL.bytes / 1048576).toFixed(1)} MB）。可能還沒下載完，或下載到別的檔案。`);
  }
  onStatus('讀取檔案…');
  const buf = await file.arrayBuffer();
  onStatus('核對檔案（SHA-256）…');
  const h = hex(await crypto.subtle.digest('SHA-256', buf));
  if (h !== DEMUCS_MODEL.sha256) throw new Error('檔案內容核對失敗（SHA-256 不符），請重新下載。');
  onStatus('存到瀏覽器…');
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await tx('readwrite', s => { s.put(buf, KEY); s.put({ name: file.name, bytes: buf.byteLength, sha256: h, at: Date.now() }, KEY + ':meta'); });
  cached = buf;
  return true;
}

// ---------- 分離 ----------
let worker = null;
function vendorBase() {
  // 原始碼在 /daw-studio/、成品在 /tools/daw/：從 jszip 的 <script> 推出 assets/vendor/ 位置
  const z = document.querySelector('script[src*="vendor/jszip"]');
  const base = z ? z.src.replace(/jszip\.min\.js.*$/, '') : new URL('../../assets/vendor/', import.meta.url).href;
  return base + 'ort-webgpu/';
}

// 轉成 44.1 kHz 立體聲（模型訓練的格式）
async function to44k(buf) {
  const SR = 44100;
  const n = Math.ceil(buf.length * SR / buf.sampleRate);
  let L, R;
  if (buf.sampleRate === SR) {
    L = buf.getChannelData(0).slice(); R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
  } else {
    const oc = new OfflineAudioContext(2, n, SR);
    const src = oc.createBufferSource(); src.buffer = buf;
    if (buf.numberOfChannels === 1) { const sp = oc.createChannelMerger(2); src.connect(sp, 0, 0); src.connect(sp, 0, 1); sp.connect(oc.destination); }
    else src.connect(oc.destination);
    src.start();
    const r = await oc.startRendering();
    L = r.getChannelData(0).slice(); R = r.getChannelData(1).slice();
  }
  return { L, R, n: L.length };
}

// opts: { prefer: 'auto' | 'cpu', stems: bool }
// 回傳 { vocal, inst, stems?: { drums, bass, other }, backend, ms }，全部是 44.1 kHz 的 AudioBuffer
export async function separateBufferAI(buf, opts = {}, onProgress = () => {}, onStatus = () => {}) {
  const model = await loadModel();
  onStatus('準備音訊…');
  const { L, R, n } = await to44k(buf);
  if (!worker) worker = new Worker(new URL('./demucs-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = e => {
      const d = e.data;
      if (d.type === 'progress') onProgress(d.progress, d.seg, d.total);
      else if (d.type === 'status') onStatus(d.text);
      else if (d.type === 'backend') onStatus(d.backend === 'webgpu' ? '以顯示卡（WebGPU）分離中…' : '以 CPU 分離中（比較慢）…');
      else if (d.type === 'error') reject(new Error(d.message));
      else if (d.type === 'done') {
        const mk = ch => { const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: d.sr }); b.copyToChannel(ch[0], 0); b.copyToChannel(ch[1], 1); return b; };
        resolve({ vocal: mk(d.vocal), inst: mk(d.inst), stems: d.stems && { drums: mk(d.stems.drums), bass: mk(d.stems.bass), other: mk(d.stems.other) }, backend: d.backend, ms: d.ms });
      }
    };
    worker.onerror = err => { worker = null; reject(new Error('AI 分離失敗：' + (err.message || '背景執行緒錯誤（可能是記憶體不足）'))); };
    // 模型 buffer 用複製的（不轉移），之後還能重複使用
    worker.postMessage({ type: 'separate', vendor: vendorBase(), model, prefer: opts.prefer || 'auto', stems: !!opts.stems, L: L.buffer, R: R.buffer }, [L.buffer, R.buffer]);
  });
}

// 預估時間（秒）：每 7.8 秒音訊一段，段落重疊 25%
export function estimateSegments(sec) { const seg = 343980 / 44100, stride = seg * 0.75; return Math.max(1, Math.ceil(Math.max(0, sec - seg) / stride) + 1); }
