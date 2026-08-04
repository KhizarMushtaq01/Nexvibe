const DB_NAME = 'nexvibe-e2e';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity'); // single row, key 'self'
      }
      if (!db.objectStoreNames.contains('oneTimePreKeys')) {
        db.createObjectStore('oneTimePreKeys', { keyPath: 'keyId' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions'); // keyed by conversationId
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx(storeName, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  }));
}

export function getLocalIdentity() {
  return runTx('identity', 'readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.get('self');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }).then(wrapped => wrapped);
}

export function saveLocalIdentity(identity) {
  return runTx('identity', 'readwrite', store => store.put(identity, 'self'));
}

export function getUnusedOneTimePreKeys() {
  return runTx('oneTimePreKeys', 'readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }).then(rows => rows);
}

export function saveOneTimePreKeys(keys) {
  return runTx('oneTimePreKeys', 'readwrite', store => {
    keys.forEach(k => store.put(k));
  });
}

export function consumeOneTimePreKey(keyId) {
  return runTx('oneTimePreKeys', 'readwrite', store => store.delete(keyId));
}

export function getSession(conversationId) {
  return runTx('sessions', 'readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.get(conversationId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }).then(session => session);
}

export function saveSession(conversationId, session) {
  return runTx('sessions', 'readwrite', store => store.put(session, conversationId));
}
