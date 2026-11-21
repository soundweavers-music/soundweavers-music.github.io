// 影片檔存在瀏覽器的 IndexedDB（跟專案分開放）：專案只記 mediaId，不把影片塞進 JSON。
// 單獨一個資料庫，避免跟專案自動暫存的版本號互相牽扯。
const DB = 'zhiyin-daw-media', ST = 'media', VER = 1;

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function putMedia(id, rec) {
  const db = await open();
  await reqP(db.transaction([ST], 'readwrite').objectStore(ST).put(rec, id));
  db.close();
  return id;
}

export async function getMedia(id) {
  if (!id) return null;
  const db = await open();
  const rec = await reqP(db.transaction([ST], 'readonly').objectStore(ST).get(id));
  db.close();
  // File / Blob 可以直接丟給 URL.createObjectURL
  return rec || null;
}

export async function deleteMedia(id) {
  const db = await open();
  await reqP(db.transaction([ST], 'readwrite').objectStore(ST).delete(id));
  db.close();
}

export async function allMediaKeys() {
  const db = await open();
  const keys = await reqP(db.transaction([ST], 'readonly').objectStore(ST).getAllKeys());
  db.close();
  return keys;
}
