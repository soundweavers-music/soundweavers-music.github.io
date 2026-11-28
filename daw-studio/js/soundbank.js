// 音色庫管理：使用者自己下載 .sf2，從電腦選取後解析並存進 IndexedDB（只存在這台電腦）。
// 網頁只負責讀取與顯示狀態，不會下載任何東西。
// 軌道的 instrument 欄位：內建音色用 'piano' 這種 id；SoundFont 用 'sf:<bankId>:<presetIdx>'。
import { parseSF2, sf2Voice, maxRelease } from './sf2.js';
import { store } from './state.js';
import { toast } from './util.js';
import { setSoundFontHook } from './synth.js';
import { loading, fetchWithProgress, bytesText } from './loading.js';

const DB = 'zhiyin-daw-banks', VER = 1;
const banks = new Map();   // id -> { id, name, size, presets, sf(解析後), status }

// 推薦音色庫：下載連結於 2026-11-18 逐一確認可直接下載（HTTP 200、大小相符）。
// 點連結是一般的頁面跳轉／下載，不受本頁 connect-src 'none' 限制；網頁本身仍然不連網。
// file：下載後的檔名，用來在「下載」資料夾裡自動找到它。
export const RECOMMENDED = [
  { id: 'generaluser', name: 'GeneralUser GS', file: 'GeneralUser-GS.sf2', bytes: 32319396, size: '31 MB',
    note: '完整 GM 128 種樂器＋鼓組，體積小、音質平衡，可自由使用。最推薦先用這個。',
    url: 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2',
    home: 'https://github.com/mrbumpy409/GeneralUser-GS', license: 'GeneralUser GS License（可自由使用、可商用）' },
  { id: 'fluidr3', name: 'FluidR3_GM', file: 'FluidR3_GM.sf2', bytes: 148398306, size: '142 MB',
    note: '經典的開源 GM 音色庫，鋼琴與弦樂比較飽滿。',
    url: 'https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2',
    home: 'https://github.com/pianobooster/fluid-soundfont', license: 'MIT' },
  { id: 'musescore', name: 'MuseScore_General', file: 'MuseScore_General.sf2', bytes: 215614036, size: '206 MB',
    note: 'MuseScore 內建的音色庫，樂器種類最齊全，檔案也最大。',
    url: 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2',
    home: 'https://musescore.org/en/handbook/3/soundfonts-and-sfz-files', license: 'MIT' },
];

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => r.result.createObjectStore('banks');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (db, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction('banks', mode);
  let out; const r = fn(t.objectStore('banks'));
  if (r) r.onsuccess = () => { out = r.result; };
  t.oncomplete = () => res(out);
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error || new Error('儲存空間不足或被瀏覽器拒絕'));
});

const emit = () => store.emit('banks', { banks: listBanks() });

export function listBanks() {
  return [...banks.values()].map(b => ({ id: b.id, name: b.name, size: b.size, status: b.status, presetCount: b.presets?.length || 0, error: b.error }));
}
export const getBank = id => banks.get(id);

function presetList(sf) {
  return sf.presets.map((p, i) => ({ idx: i, name: p.name, bank: p.bank, program: p.preset, drums: p.bank === 128 }));
}

function makeId(name, size) { return (name + '_' + size).replace(/[^\w.-]+/g, '_').slice(0, 60); }

// 從使用者選的檔案載入
// version：內建音色庫的版本（banks.json 的內容雜湊），跟資料一起存，下次開頁面拿來比
export async function addBankFile(file, version) {
  if (!/\.sf2$/i.test(file.name)) {
    if (/\.sf3$/i.test(file.name)) throw new Error('.sf3 是壓縮格式，目前不支援，請下載同一套音色庫的 .sf2 版本');
    throw new Error('請選擇 .sf2 檔案');
  }
  const id = makeId(file.name.replace(/\.sf2$/i, ''), file.size);
  const entry = { id, name: file.name.replace(/\.sf2$/i, ''), size: file.size, status: 'loading', version: version || '' };
  banks.set(id, entry); emit();
  try {
    const ab = await file.arrayBuffer();
    const sf = parseSF2(ab);
    sf.id = id;
    entry.sf = sf; entry.presets = presetList(sf); entry.status = 'ready';
    if (sf.name && sf.name !== '未命名音色庫') entry.title = sf.name;
    emit();
    // 存進 IndexedDB，下次開頁面不用重選；空間不夠就只在這次使用
    try {
      const db = await idb();
      await tx(db, 'readwrite', s => s.put({ id, name: entry.name, size: file.size, version: entry.version, data: ab, savedAt: Date.now() }, id));
      db.close();
      entry.persisted = true;
    } catch (e) {
      entry.persisted = false;
      toast('音色庫可以用，但瀏覽器空間不足，沒辦法記住；下次要重新選檔案', 'warn');
    }
    emit();
    return entry;
  } catch (e) {
    entry.status = 'error'; entry.error = e.message; emit();
    throw e;
  }
}

// 開頁時：列出 IndexedDB 裡的音色庫，並在背景解析
/**
 * 站上內建的音色庫：第一次用到才抓（不擋開頁），抓完走跟手動選檔一樣的路徑，
 * 所以一樣會存進 IndexedDB，第二次開啟直接從快取還原。
 */
// banks.json：{ "builtin-piano.sf2": { "size": 位元組數, "sha": 內容雜湊前 16 碼 }, … }
// 抓不到就回 {}（＝有存的就用存的）。舊格式（只有數字）也看得懂。
// 為什麼要雜湊：修正走音的那一版跟壞掉的那一版「大小一模一樣」，只比大小的話已經下載過的人永遠拿不到修正。
let manifest = null;
async function bankInfo(url) {
  try {
    if (!manifest) {
      const u = new URL('banks.json', new URL(url, location.href));
      const r = await fetch(u, { cache: 'no-cache' });
      manifest = r.ok ? await r.json() : {};
    }
  } catch (e) { manifest = {}; }
  const name = new URL(url, location.href).pathname.split('/').pop();
  const m = manifest[name];
  return typeof m === 'number' ? { size: m, sha: '' } : { size: Number(m && m.size) || 0, sha: (m && m.sha) || '' };
}

// 進度面板上的名字（使用者看得懂的那種）
const NICE = { 'Salamander Piano': '內建鋼琴', 'Sonatina Strings': '內建弦樂', 'GeneralUser GS': '內建音色庫（GM）' };
const niceName = n => NICE[Object.keys(NICE).find(k => (n || '').startsWith(k))] || n;

// job：外面先登記好的進度項目（排隊中），沒給就自己開一個
export async function loadBuiltinBank(url, label, job0) {
  await restoreBanks().catch(() => {});
  // 這份檔案真正多大（banks.json，建置時產生）：跟瀏覽器裡存的那份一樣大＝同一版，直接用。
  // 不能問伺服器：GitHub Pages 用 gzip 傳 .sf2，回應裡的大小都是壓縮後的。
  // （以前這裡把同名的「全部」刪掉再重抓，等於每次開頁面都重新下載一次）
  const { size, sha } = await bankInfo(url);
  const same = [...banks.values()].filter(b => (b.name || '').startsWith(label));
  // 同一版＝大小一樣、而且（清單有雜湊的話）雜湊也一樣；清單抓不到就沿用已存的
  const keep = same.find(b => b.status === 'ready' && (!size || b.size === size) && (!sha || b.version === sha));
  // 舊版（大小不同）才清掉：音色庫的 id 是「檔名 + 大小」，不清的話清單裡會新舊兩份
  for (const b of same) {
    if (b === keep) continue;
    banks.delete(b.id);
    try {
      const db = await idb();
      await tx(db, 'readwrite', s2 => s2.delete(b.id));
      db.close();
    } catch (e) { /* 快取刪不掉就算了，至少清單裡不會重複 */ }
  }
  if (same.length > (keep ? 1 : 0)) emit();
  if (keep) { keep.builtin = true; if (job0) job0.done('這台電腦已經有了'); return keep.id; }   // 已存的是最新版

  const job = job0 || loading.begin(niceName(label), '下載中');
  job.step('下載中', 0);
  let ab;
  try {
    // 有雜湊就把它放進網址：瀏覽器的 HTTP 快取裡如果還留著舊版，不會被拿出來用
    ab = await fetchWithProgress(sha ? url + (url.includes('?') ? '&' : '?') + 'v=' + sha : url, job, { cache: sha ? 'default' : 'force-cache' }, size);
  } catch (e) {
    job.fail('下載失敗，先用合成音色');
    throw e;
  }
  job.step('解開音色中');
  // 讓面板先畫出「解開中」再開始（解析會佔住主執行緒一下）
  await new Promise(r => setTimeout(r, 30));
  const file = new File([ab], (label || 'builtin') + '.sf2', { type: 'application/octet-stream' });
  const before = new Set(banks.keys());
  let id;
  try { id = await addBankFile(file, sha); } catch (e) { job.fail('檔案讀不出來'); throw e; }
  job.done('好了');
  const added = [...banks.keys()].find(k => !before.has(k)) || id;
  const entry = banks.get(added);
  if (entry) entry.builtin = true;
  return added;
}

/** 在音色庫裡找 GM program 對應的 preset 索引 */
export function findProgram(bankId, program, bank) {
  const b = banks.get(bankId);
  if (!b || !b.presets) return -1;
  const want = bank === undefined ? 0 : bank;
  return b.presets.findIndex(pr => (pr.program ?? -1) === program && (pr.bank ?? 0) === want);
}

// 開頁時的還原只跑一次；內建音色庫要等它跑完，才知道「這台電腦已經有了、不用再下載」
let restoring = null;
export { niceName };
export function restoreBanks() { return restoring || (restoring = restoreBanksOnce()); }

async function restoreBanksOnce() {
  let db;
  try { db = await idb(); } catch (_) { return; }
  const keys = await tx(db, 'readonly', s => s.getAllKeys());
  for (const id of keys || []) {
    if (banks.has(id)) continue;
    banks.set(id, { id, name: id, size: 0, status: 'loading', persisted: true });
  }
  emit();
  for (const id of keys || []) {
    const job = loading.begin(niceName(id.replace(/_\d+$/, '').replace(/_/g, ' ')), '從這台電腦讀出來');
    try {
      const rec = await tx(db, 'readonly', s => s.get(id));
      const e = banks.get(id);
      e.name = rec.name; e.size = rec.size; e.version = rec.version || '';
      job.step('解開音色中');
      job.progress(null, bytesText(rec.size));
      await new Promise(r => setTimeout(r, 30));
      const sf = parseSF2(rec.data);
      sf.id = id;
      e.sf = sf; e.presets = presetList(sf); e.status = 'ready';
      job.done();
    } catch (err) {
      const e = banks.get(id); e.status = 'error'; e.error = err.message;
      job.fail('讀不出來');
    }
    emit();
  }
  db.close();
  // 專案裡參照到的音色庫都就緒了：通知重建（讓播放用上 SoundFont）
  store.emit('banks-ready', {});
}

export async function removeBank(id) {
  banks.delete(id);
  try { const db = await idb(); await tx(db, 'readwrite', s => s.delete(id)); db.close(); } catch (_) { /* noop */ }
  emit();
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage || 0, quota: e.quota || 0 };
}

// ---- 給 engine / synth 用 ----
export function parseInstrument(inst) {
  if (typeof inst !== 'string' || !inst.startsWith('sf:')) return null;
  const i = inst.lastIndexOf(':');
  return { bankId: inst.slice(3, i), presetIdx: Number(inst.slice(i + 1)) };
}

export function sfInstrumentId(bankId, presetIdx) { return `sf:${bankId}:${presetIdx}`; }

// 回傳 null 代表音色庫還沒就緒（呼叫端改用內建音色代打）
export function sfVoice(ctx, dest, inst, key, vel, when) {
  const ref = parseInstrument(inst);
  if (!ref) return null;
  const b = banks.get(ref.bankId);
  if (!b || b.status !== 'ready') return null;
  return sf2Voice(ctx, dest, b.sf, ref.presetIdx, key, vel, when);
}

export function sfTail(inst) {
  const ref = parseInstrument(inst);
  const b = ref && banks.get(ref.bankId);
  return b && b.status === 'ready' ? maxRelease(b.sf, ref.presetIdx) : null;
}

export function sfLabel(inst) {
  const ref = parseInstrument(inst);
  if (!ref) return null;
  const b = banks.get(ref.bankId);
  const p = b?.presets?.[ref.presetIdx];
  return { bank: b ? b.name : ref.bankId, preset: p ? p.name : `#${ref.presetIdx}`, ready: b?.status === 'ready', drums: !!p?.drums };
}

setSoundFontHook({
  voice: sfVoice,
  tail: sfTail,
  isDrums: inst => !!sfLabel(inst)?.drums || /:128:/.test(inst),
});
