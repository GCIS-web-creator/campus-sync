export type OfflineMaterialRecord<T extends { id: string }> = {
  key: string;
  userId: string;
  metadata: T;
  blob: Blob;
  savedAt: string;
};

const DB_NAME = 'campussync-offline-v1';
const STORE_NAME = 'materials';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('このブラウザーでは端末保存を利用できません。'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('端末保存領域を開けませんでした。'));
    request.onblocked = () => reject(new Error('別のCampusSyncタブが端末保存領域を使用中です。'));
  });
}

export async function listOfflineMaterials<T extends { id: string }>(userId: string): Promise<OfflineMaterialRecord<T>[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
      request.onsuccess = () => {
        const records = (request.result || []) as OfflineMaterialRecord<T>[];
        records.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        resolve(records);
      };
      request.onerror = () => reject(request.error || new Error('端末保存資料を読み込めませんでした。'));
    });
  } finally {
    database.close();
  }
}

export async function getOfflineMaterial<T extends { id: string }>(userId: string, materialId: string): Promise<OfflineMaterialRecord<T> | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(userId + ':' + materialId);
      request.onsuccess = () => resolve((request.result as OfflineMaterialRecord<T> | undefined) || null);
      request.onerror = () => reject(request.error || new Error('端末保存資料を読み込めませんでした。'));
    });
  } finally {
    database.close();
  }
}

export async function saveOfflineMaterial<T extends { id: string }>(userId: string, metadata: T, blob: Blob): Promise<void> {
  if (!userId || !metadata.id || !blob.size) throw new Error('保存する資料の情報が正しくありません。');
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    const available = typeof estimate.quota === 'number' && typeof estimate.usage === 'number'
      ? Math.max(0, estimate.quota - estimate.usage)
      : null;
    if (available !== null && blob.size > available * 0.85) {
      throw new Error('端末の空き容量が不足しています。不要なオフライン資料を削除してください。');
    }
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        key: userId + ':' + metadata.id,
        userId,
        metadata,
        blob,
        savedAt: new Date().toISOString(),
      } satisfies OfflineMaterialRecord<T>);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('端末に資料を保存できませんでした。'));
      transaction.onabort = () => reject(transaction.error || new Error('端末への保存が中断されました。'));
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('端末の保存容量が不足しています。不要なオフライン資料を削除してください。');
    }
    throw error;
  } finally {
    database.close();
  }
}

export async function removeOfflineMaterial(userId: string, materialId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(userId + ':' + materialId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('端末保存資料を削除できませんでした。'));
      transaction.onabort = () => reject(transaction.error || new Error('端末保存資料の削除が中断されました。'));
    });
  } finally {
    database.close();
  }
}

export async function clearOfflineMaterialsForUser(userId: string): Promise<void> {
  if (!userId || typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.index('userId').openKeyCursor(IDBKeyRange.only(userId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('ログアウト時の端末データ削除に失敗しました。'));
      transaction.onabort = () => reject(transaction.error || new Error('端末データの削除が中断されました。'));
    });
  } finally {
    database.close();
  }
}
