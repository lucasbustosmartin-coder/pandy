/**
 * Outbox de órdenes offline (Fase 2) y snapshots de lectura (Fase 3 PWA).
 * Migración automática de la cola desde localStorage (clave legada en main.js).
 */

const DB_NAME = 'pandi_offline';
const DB_VERSION = 2;
const STORE_ORDENES = 'ordenes_queue';
const STORE_READ_SNAPSHOTS = 'read_snapshots';

export function openPandiOfflineDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('idb open'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ORDENES)) {
        db.createObjectStore(STORE_ORDENES, { keyPath: 'localId' });
      }
      if (!db.objectStoreNames.contains(STORE_READ_SNAPSHOTS)) {
        db.createObjectStore(STORE_READ_SNAPSHOTS, { keyPath: 'key' });
      }
    };
  });
}

export async function idbOrdenesQueueGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDENES, 'readonly');
    const st = tx.objectStore(STORE_ORDENES);
    const r = st.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function idbOrdenesQueueReplaceAll(db, items) {
  const arr = Array.isArray(items) ? items : [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDENES, 'readwrite');
    const st = tx.objectStore(STORE_ORDENES);
    st.clear();
    for (const it of arr) {
      if (it && it.localId) st.put(it);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('idb abort'));
  });
}

export function readLegacyOrdenesQueueFromLocalStorage(queueKey) {
  try {
    const s = localStorage.getItem(queueKey);
    if (!s) return [];
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function normalizeQueueItemForIdb(item) {
  if (!item || typeof item !== 'object') return null;
  const copy = { ...item };
  if (!copy.localId) {
    copy.localId = `mig-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
  if (copy.attempts == null || typeof copy.attempts !== 'number') copy.attempts = 0;
  if (copy.syncState !== 'error' && copy.syncState !== 'pending') {
    copy.syncState = 'pending';
  }
  return copy;
}

/** @param {IDBDatabase} db */
export async function idbReadSnapshotGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_READ_SNAPSHOTS, 'readonly');
    const r = tx.objectStore(STORE_READ_SNAPSHOTS).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {{ key: string, savedAt: string, [k: string]: unknown }} record
 */
export async function idbReadSnapshotPut(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_READ_SNAPSHOTS, 'readwrite');
    tx.objectStore(STORE_READ_SNAPSHOTS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('idb snapshot abort'));
  });
}

/** @param {IDBDatabase} db */
export async function idbReadSnapshotDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_READ_SNAPSHOTS, 'readwrite');
    tx.objectStore(STORE_READ_SNAPSHOTS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('idb snapshot delete abort'));
  });
}

/**
 * Lista claves en read_snapshots cuyo key empieza con prefix (p. ej. pending por orden).
 * @param {IDBDatabase} db
 * @param {string} prefix
 */
export async function idbReadSnapshotKeysByPrefix(db, prefix) {
  const pre = String(prefix || '');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_READ_SNAPSHOTS, 'readonly');
    const st = tx.objectStore(STORE_READ_SNAPSHOTS);
    const req = st.openCursor();
    const keys = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) {
        resolve(keys);
        return;
      }
      const k = cur.key;
      if (typeof k === 'string' && k.startsWith(pre)) keys.push(k);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
