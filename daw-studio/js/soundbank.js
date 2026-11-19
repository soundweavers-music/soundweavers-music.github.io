// 音色庫管理：使用者自己下載 .sf2，從電腦選取後解析並存進 IndexedDB（只存在這台電腦）。
// 網頁只負責讀取與顯示狀態，不會下載任何東西。
// 軌道的 instrument 欄位：內建音色用 'piano' 這種 id；SoundFont 用 'sf:<bankId>:<presetIdx>'。
import { parseSF2, sf2Voice, maxRelease } from './sf2.js';
import { store } from './state.js';
import { toast } from './util.js';
import { setSoundFontHook } from './synth.js';

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
export async function addBankFile(file) {
  if (!/\.sf2$/i.test(file.name)) {
    if (/\.sf3$/i.test(file.name)) throw new Error('.sf3 是壓縮格式，目前不支援，請下載同一套音色庫的 .sf2 版本');
    throw new Error('請選擇 .sf2 檔案');
  }
  const id = makeId(file.name.replace(/\.sf2$/i, ''), file.size);
  const entry = { id, name: file.name.replace(/\.sf2$/i, ''), size: file.size, status: 'loading' };
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
      await tx(db, 'readwrite', s => s.put({ id, name: entry.name, size: file.size, data: ab, savedAt: Date.now() }, id));
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
export async function loadBuiltinBank(url, label) {
  for (const b of banks.values()) {
    if (b.builtin && b.status === 'ready') return b.id;
  }
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const ab = await res.arrayBuffer();
  const file = new File([ab], (label || 'builtin') + '.sf2', { type: 'application/octet-stream' });
  const before = new Set(banks.keys());
  const id = await addBankFile(file);
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

export async function restoreBanks() {
  let db;
  try { db = await idb(); } catch (_) { return; }
  const keys = await tx(db, 'readonly', s => s.getAllKeys());
  for (const id of keys || []) {
    if (banks.has(id)) continue;
    banks.set(id, { id, name: id, size: 0, status: 'loading', persisted: true });
  }
  emit();
  for (const id of keys || []) {
    try {
      const rec = await tx(db, 'readonly', s => s.get(id));
      const e = banks.get(id);
      e.name = rec.name; e.size = rec.size;
      const sf = parseSF2(rec.data);
      sf.id = id;
      e.sf = sf; e.presets = presetList(sf); e.status = 'ready';
    } catch (err) {
      const e = banks.get(id); e.status = 'error'; e.error = err.message;
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
