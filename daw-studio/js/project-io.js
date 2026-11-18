// 專案存讀：
//  - 專案檔 .zyproj = zip（project.json + audio/<bufferId>.wav），完全在本機
//  - Chrome/Edge 用 File System Access 直接覆寫同一個檔案；其他瀏覽器改成下載
//  - IndexedDB 自動暫存，關掉分頁再開可以還原
import { store, migrateProject } from './state.js';
import { engine } from './engine.js';
import { encodeWav, computePeaks, downloadBlob, toast, uid } from './util.js';

const EXT = '.zyproj';
let fileHandle = null;

export const canSaveInPlace = () => 'showSaveFilePicker' in window;

async function packProject() {
  const zip = new window.JSZip();
  const used = store.usedBufferIds();
  const audio = {};
  for (const id of used) {
    const buf = store.buffers.get(id);
    if (!buf) continue;
    zip.file(`audio/${id}.wav`, encodeWav(buf, 32));   // 32-bit float，無損
    audio[id] = { name: store.bufferMeta.get(id)?.name || id };
  }
  const doc = { app: 'zhiyin-daw', ...store.project, audio };
  zip.file('project.json', JSON.stringify(doc, null, 1));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function saveProject(saveAs = false) {
  toast('正在儲存…');
  const blob = await packProject();
  const fname = (store.project.name || '專案').replace(/[\\/:*?"<>|]/g, '_') + EXT;
  if (canSaveInPlace()) {
    try {
      if (!fileHandle || saveAs) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: fname,
          types: [{ description: '織音專案', accept: { 'application/zip': [EXT] } }],
        });
      }
      const w = await fileHandle.createWritable();
      await w.write(blob); await w.close();
      store.dirty = false;
      toast(`已存到你的電腦：${fileHandle.name}`);
      store.emit('saved', {});
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn(e);
    }
  }
  downloadBlob(blob, fname);
  store.dirty = false;
  toast('已下載專案檔');
  store.emit('saved', {});
}

async function decodeWav(ctx, arrayBuf) {
  return ctx.decodeAudioData(arrayBuf);
}

export async function openProjectFile(file, handle = null) {
  const ctx = await engine.ensure();
  const zip = await window.JSZip.loadAsync(file);
  const pj = zip.file('project.json');
  if (!pj) throw new Error('不是織音專案檔（找不到 project.json）');
  const doc = JSON.parse(await pj.async('string'));
  const buffers = new Map(), meta = new Map();
  for (const [id, info] of Object.entries(doc.audio || {})) {
    const f = zip.file(`audio/${id}.wav`);
    if (!f) continue;
    const buf = await decodeWav(ctx, await f.async('arraybuffer'));
    buffers.set(id, buf);
    meta.set(id, { name: info.name, peaks: computePeaks(buf) });
  }
  delete doc.audio; delete doc.app;
  migrateProject(doc);
  engine.stop(); engine.seek(0);
  store.replaceProject(doc, buffers, meta);
  fileHandle = handle;
  toast(`已開啟：${doc.name}`);
}

export async function pickAndOpenProject() {
  if ('showOpenFilePicker' in window) {
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: '織音專案', accept: { 'application/zip': [EXT, '.zip'] } }],
      });
      await openProjectFile(await h.getFile(), h);
      return;
    } catch (e) { if (e.name === 'AbortError') return; throw e; }
  }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = `${EXT},.zip`;
  inp.onchange = () => inp.files[0] && openProjectFile(inp.files[0]).catch(err => toast(err.message, 'error'));
  inp.click();
}

export function resetHandle() { fileHandle = null; }

// ---------- IndexedDB 自動暫存 ----------
const DB = 'zhiyin-daw', VER = 1;
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('buffers')) db.createObjectStore('buffers');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (db, names, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(names, mode);
  const out = fn(t);
  t.oncomplete = () => res(out);
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error);
});
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const savedBufferIds = new Set();

export async function autosave() {
  try {
    const db = await idb();
    const used = store.usedBufferIds();
    // 先寫新出現的音訊，再寫專案，再清掉沒用到的
    for (const id of used) {
      if (savedBufferIds.has(id)) continue;
      const b = store.buffers.get(id);
      if (!b) continue;
      const chans = [];
      for (let c = 0; c < b.numberOfChannels; c++) chans.push(b.getChannelData(c).slice());
      await tx(db, ['buffers'], 'readwrite', t => t.objectStore('buffers').put(
        { sr: b.sampleRate, chans, name: store.bufferMeta.get(id)?.name }, id));
      savedBufferIds.add(id);
    }
    await tx(db, ['kv'], 'readwrite', t => t.objectStore('kv').put(
      { project: store.project, savedAt: Date.now() }, 'current'));
    // tx 以 reqP 的 promise resolve，await 會自動攤平
    const all = await tx(db, ['buffers'], 'readonly', t => reqP(t.objectStore('buffers').getAllKeys()));
    const stale = all.filter(k => !used.has(k));
    if (stale.length) {
      await tx(db, ['buffers'], 'readwrite', t => { for (const k of stale) t.objectStore('buffers').delete(k); });
      stale.forEach(k => savedBufferIds.delete(k));
    }
    db.close();
    store.emit('autosaved', { at: Date.now() });
  } catch (e) {
    console.warn('autosave failed', e);
    store.emit('autosaved', { error: e.message });
  }
}

export async function readAutosave() {
  try {
    const db = await idb();
    const cur = await tx(db, ['kv'], 'readonly', t => reqP(t.objectStore('kv').get('current')));
    db.close();
    return cur;
  } catch (_) { return null; }
}

export async function restoreAutosave() {
  const db = await idb();
  const cur = await tx(db, ['kv'], 'readonly', t => reqP(t.objectStore('kv').get('current')));
  if (!cur) { db.close(); return false; }
  const project = cur.project;
  const buffers = new Map(), meta = new Map();
  const ids = new Set();
  for (const t of project.tracks) for (const c of t.clips) if (c.bufferId) ids.add(c.bufferId);
  for (const id of ids) {
    const rec = await tx(db, ['buffers'], 'readonly', t => reqP(t.objectStore('buffers').get(id)));
    if (!rec) continue;
    const buf = new AudioBuffer({ numberOfChannels: rec.chans.length, length: rec.chans[0].length, sampleRate: rec.sr });
    rec.chans.forEach((d, c) => buf.copyToChannel(d, c));
    buffers.set(id, buf);
    meta.set(id, { name: rec.name || id, peaks: computePeaks(buf) });
    savedBufferIds.add(id);
  }
  db.close();
  store.replaceProject(migrateProject(project), buffers, meta);
  return true;
}

export async function clearAutosave() {
  try {
    const db = await idb();
    await tx(db, ['kv', 'buffers'], 'readwrite', t => { t.objectStore('kv').clear(); t.objectStore('buffers').clear(); });
    savedBufferIds.clear();
    db.close();
  } catch (_) { /* noop */ }
}

// 本機音檔匯入（拖放或檔案選擇）
export async function importAudioFiles(files, trackId, at) {
  const ctx = await engine.ensure();
  const audioTracks = () => store.project.tracks.filter(x => x.kind === 'audio');
  let t = store.track(trackId);
  // 目標是 MIDI 軌：改放到第一條空的音訊軌；沒有就新增一條
  if (!t || t.kind !== 'audio') t = audioTracks().find(x => !x.clips.length) || audioTracks()[0];
  if (!t) { t = store.addTrack('audio'); if (!t) { toast('沒有音訊軌可以放', 'error'); return; } }
  store.checkpoint();
  let idx = store.project.tracks.indexOf(t);
  for (const f of files) {
    try {
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const bufferId = uid('buf');
      store.buffers.set(bufferId, buf);
      store.bufferMeta.set(bufferId, { name: f.name, peaks: computePeaks(buf) });
      t.clips.push({
        id: uid('clip'), bufferId, name: f.name.replace(/\.[^.]+$/, ''),
        start: Math.max(0, at), offset: 0, duration: buf.duration, gainDb: 0, fadeIn: 0, fadeOut: 0,
      });
      if (t.clips.length === 1 && /^音訊 \d+$/.test(t.name)) t.name = f.name.replace(/\.[^.]+$/, '').slice(0, 24);
      // 多個檔案：往下一軌放
      // 多個檔案：往下一條音訊軌放（跳過 MIDI 軌）
      do { idx++; } while (store.project.tracks[idx] && store.project.tracks[idx].kind !== 'audio');
      if (files.length > 1 && store.project.tracks[idx]) t = store.project.tracks[idx];
    } catch (e) {
      toast(`無法解碼 ${f.name}（瀏覽器不支援這個格式）`, 'error');
    }
  }
  store.changed('structure');
}
