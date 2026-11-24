export type OfflineRestCacheEntry = {
  key: string;
  userId: string;
  url: string;
  body: string;
  headers: [string, string][];
  savedAt: number;
};

const DATABASE_NAME = 'campussync-offline-rest-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'responses';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES_PER_USER = 200;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline cache.'));
  });
}

function makeKey(userId: string, url: string) {
  return userId + ':' + url;
}

export async function getOfflineRestResponse(
  userId: string,
  url: string,
): Promise<OfflineRestCacheEntry | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(makeKey(userId, url));
      request.onsuccess = () => {
        const entry = request.result as OfflineRestCacheEntry | undefined;
        if (!entry || Date.now() - entry.savedAt > MAX_AGE_MS) {
          resolve(null);
          return;
        }
        resolve(entry);
      };
      request.onerror = () => reject(request.error || new Error('Could not read offline cache.'));
    });
  } finally {
    database.close();
  }
}

export async function putOfflineRestResponse(entry: Omit<OfflineRestCacheEntry, 'key'>): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        ...entry,
        key: makeKey(entry.userId, entry.url),
      } satisfies OfflineRestCacheEntry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save offline cache.'));
      transaction.onabort = () => reject(transaction.error || new Error('Offline cache write was aborted.'));
    });

    // Keep the local cache bounded and remove entries older than two weeks.
    const rows = await new Promise<OfflineRestCacheEntry[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []) as OfflineRestCacheEntry[]);
      request.onerror = () => reject(request.error || new Error('Could not inspect offline cache.'));
    });
    const userRows = rows
      .filter((row) => row.userId === entry.userId)
      .sort((a, b) => b.savedAt - a.savedAt);
    const removeKeys = userRows
      .filter((row, index) => Date.now() - row.savedAt > MAX_AGE_MS || index >= MAX_ENTRIES_PER_USER)
      .map((row) => row.key);
    if (removeKeys.length) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        removeKeys.forEach((key) => store.delete(key));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Could not prune offline cache.'));
      });
    }
  } finally {
    database.close();
  }
}
