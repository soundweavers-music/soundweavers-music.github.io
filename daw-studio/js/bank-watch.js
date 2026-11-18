// 「下載完自動載入」：使用者授權一次「下載」資料夾（File System Access API，Chrome / Edge），
// 之後只要切回這個分頁，就掃描資料夾裡新的 .sf2 並自動載入。
// 這只是在本機讀檔，沒有任何網路連線；資料夾授權（handle）存在 IndexedDB。
// 不支援的瀏覽器（Firefox / Safari）會退回「拖放或手動選檔」。
import { addBankFile, listBanks, RECOMMENDED } from './soundbank.js';
import { store } from './state.js';
import { toast } from './util.js';

export const canWatch = () => 'showDirectoryPicker' in window;

const DB = 'zhiyin-daw-banks-watch', KEY = 'downloads';
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function kv(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction('kv', mode); const q = fn(t.objectStore('kv'));
    t.oncomplete = () => { db.close(); res(q?.result); }; t.onerror = () => rej(t.error);
  });
}

let dir = null;          // FileSystemDirectoryHandle
let waiting = new Set(); // 使用者按過「下載」、還沒載入的檔名
let scanning = false;
const seen = new Map();  // 檔名 -> 上次看到的大小（下載中的檔案大小會變）

export const watchState = () => ({ dir: dir ? dir.name : null, waiting: [...waiting] });

export async function restoreWatch() {
  if (!canWatch()) return;
  try { dir = (await kv('readonly', s => s.get(KEY))) || null; } catch (_) { dir = null; }
  emit();
}

function emit() { store.emit('bank-watch', watchState()); }

async function permission(ask) {
  if (!dir) return false;
  const opt = { mode: 'read' };
  if ((await dir.queryPermission(opt)) === 'granted') return true;
  if (!ask) return false;
  return (await dir.requestPermission(opt)) === 'granted';
}

// 選擇資料夾（要在使用者點擊時呼叫）
export async function pickFolder() {
  try {
    dir = await window.showDirectoryPicker({ id: 'zhiyin-sf2', mode: 'read', startIn: 'downloads' });
  } catch (e) { if (e.name === 'AbortError') return false; throw e; }
  await kv('readwrite', s => s.put(dir, KEY));
  emit();
  await scan(true);
  return true;
}

export async function forgetFolder() {
  dir = null; waiting.clear();
  await kv('readwrite', s => s.delete(KEY));
  emit();
}

// 點了某個音色庫的下載連結：記下來，切回分頁時優先找它
export function expect(file) { waiting.add(file); emit(); }

const loadedNames = () => new Set(listBanks().map(b => b.name.toLowerCase()));

// ask：沒有權限時是否跳出授權（只能在使用者點擊時為 true）
export async function scan(ask = false) {
  if (!dir || scanning) return 0;
  if (!(await permission(ask))) { store.emit('bank-watch-need-permission', {}); return 0; }
  scanning = true;
  let n = 0;
  try {
    const have = loadedNames();
    const known = new Map(RECOMMENDED.map(r => [r.file.toLowerCase(), r]));
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !/\.sf2$/i.test(name)) continue;
      const base = name.replace(/\.sf2$/i, '').toLowerCase();
      // 瀏覽器重複下載會變成「GeneralUser-GS (1).sf2」：去掉括號編號再比對
      const norm = base.replace(/\s*\(\d+\)$/, '');
      if (have.has(base) || have.has(norm)) { waiting.delete(name); continue; }
      // 只自動載入「推薦清單裡的」或「使用者剛按過下載的」，避免把下載資料夾裡無關的大檔全讀進來
      const rec = known.get(norm + '.sf2');
      const expected = [...waiting].some(w => w.toLowerCase() === norm + '.sf2');
      if (!rec && !expected) continue;
      const f = await h.getFile();
      // 下載中：Chrome 會先存成 .crdownload，完成才改名；保險起見再確認大小不再變動
      if (rec && rec.bytes && f.size !== rec.bytes) {
        if (seen.get(name) !== f.size) { seen.set(name, f.size); setTimeout(() => scan(false), 3000); }
        continue;
      }
      toast(`在下載資料夾找到 ${name}，自動載入中…`);
      try {
        const e = await addBankFile(f);
        toast(`已自動載入「${e.name}」：${e.presets.length} 個音色`);
        n++;
      } catch (err) { toast(`${name}：${err.message}`, 'error'); }
      waiting.delete(rec ? rec.file : name);
    }
  } finally { scanning = false; emit(); }
  return n;
}

// 切回分頁時掃描（下載通常在別的分頁或下載列完成）
export function startWatching() {
  const tick = () => { if (dir && document.visibilityState === 'visible') scan(false); };
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);
  // 有等待中的檔案時，每 4 秒看一次（下載完成時不一定會觸發 focus）
  setInterval(() => { if (dir && waiting.size) scan(false); }, 4000);
}
