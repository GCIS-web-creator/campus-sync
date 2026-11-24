export type OfflineMaterialRecord<T> = {
  key: string;
  userId: string;
  materialId: string;
  material: T;
  blob: Blob;
  savedAt: number;
};

const DATABASE_NAME = 'campussync-offline-library';
const DATABASE_VERSION = 1;
const STORE_NAME = 'materials';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('このブラウザーは端末内保存に対応していません。'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('端末内ストレージを開けませんでした。'));
    request.onblocked = () => reject(new Error('端末内ストレージが別のタブで使用中です。'));
  });
}

function makeKey(userId: string, materialId: string) {
  return userId + ':' + materialId;
}

export async function saveOfflineMaterial<T>(
  userId: string,
  materialId: string,
  material: T,
  blob: Blob,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        key: makeKey(userId, materialId),
        userId,
        materialId,
        material,
        blob,
        savedAt: Date.now(),
      } satisfies OfflineMaterialRecord<T>);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('資料を端末に保存できませんでした。'));
      transaction.onabort = () => reject(transaction.error || new Error('資料の保存が中断されました。'));
    });
  } finally {
    database.close();
  }
}

export async function getOfflineMaterial<T>(
  userId: string,
  materialId: string,
): Promise<OfflineMaterialRecord<T> | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(makeKey(userId, materialId));
      request.onsuccess = () => resolve((request.result as OfflineMaterialRecord<T> | undefined) || null);
      request.onerror = () => reject(request.error || new Error('保存済み資料を読み込めませんでした。'));
    });
  } finally {
    database.close();
  }
}

export async function listOfflineMaterials<T>(
  userId: string,
): Promise<OfflineMaterialRecord<T>[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const rows = (request.result || []) as OfflineMaterialRecord<T>[];
        resolve(rows.filter((row) => row.userId === userId).sort((a, b) => b.savedAt - a.savedAt));
      };
      request.onerror = () => reject(request.error || new Error('保存済み資料の一覧を読み込めませんでした。'));
    });
  } finally {
    database.close();
  }
}

export async function removeOfflineMaterial(userId: string, materialId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(makeKey(userId, materialId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('保存済み資料を削除できませんでした。'));
      transaction.onabort = () => reject(transaction.error || new Error('資料の削除が中断されました。'));
    });
  } finally {
    database.close();
  }
}
