const DB = 'rutinas-db';
let dbp;
function open() {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['config','logs']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export const getItem = (s, k) => tx(s, 'readonly', o => o.get(k));
export const setItem = (s, k, v) => tx(s, 'readwrite', o => o.put(v, k));
export const getAll  = (s) => tx(s, 'readonly', o => o.getAll());