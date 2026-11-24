export type OfflineFlashcard = {
  id: string;
  term: string;
  definition: string;
  hint?: string;
  example?: string;
  term_image_url?: string;
  definition_image_url?: string;
  sort_order?: number;
};

export type OfflineProgress = {
  user_id: string;
  card_id: string;
  set_id: string;
  status: "new" | "learning" | "known" | "review";
  correct_count: number;
  incorrect_count: number;
  consecutive_correct: number;
  interval_days: number;
  ease_factor: number;
  next_review_at: string;
  last_reviewed_at: string;
  updated_at: string;
};

export type OfflineSetSnapshot = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  subject: string;
  accent_color: string;
  updated_at: string;
  cards: OfflineFlashcard[];
  progress: OfflineProgress[];
  saved_at: string;
};

export type PendingFlashcardSession = {
  session: Record<string, unknown>;
  answers: Array<Record<string, unknown>>;
  user_id: string;
  queued_at: string;
};

const DB_NAME = "campussync-flashcards";
const DB_VERSION = 1;
const SETS_STORE = "offline_sets";
const PROGRESS_STORE = "pending_progress";
const SESSIONS_STORE = "pending_sessions";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("このブラウザーでは端末内保存を利用できません。"));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SETS_STORE)) db.createObjectStore(SETS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) db.createObjectStore(PROGRESS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("端末内データベースを開けませんでした。"));
  });
  return databasePromise;
}

async function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = makeRequest(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("端末内データの読み書きに失敗しました。"));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("端末内データの保存に失敗しました。"));
    transaction.onabort = () => reject(transaction.error || new Error("端末内データの保存が中断されました。"));
  });
}

export async function saveFlashcardSetOffline(
  snapshot: Omit<OfflineSetSnapshot, "saved_at">,
): Promise<void> {
  const record: OfflineSetSnapshot = { ...snapshot, saved_at: new Date().toISOString() };
  await runRequest(SETS_STORE, "readwrite", store => store.put(record));
}

export async function getOfflineFlashcardSets(userId: string): Promise<OfflineSetSnapshot[]> {
  const records = await runRequest<OfflineSetSnapshot[]>(SETS_STORE, "readonly", store => store.getAll());
  return (records || []).filter(record => record.user_id === userId)
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export async function removeFlashcardSetOffline(setId: string): Promise<void> {
  await runRequest(SETS_STORE, "readwrite", store => store.delete(setId));
}

export async function queueFlashcardProgress(progress: OfflineProgress): Promise<void> {
  const record = { ...progress, id: progress.user_id + ":" + progress.card_id };
  await runRequest(PROGRESS_STORE, "readwrite", store => store.put(record));
}

export async function queueFlashcardSession(
  session: PendingFlashcardSession,
): Promise<void> {
  const record = { ...session, id: String(session.session.id || "") };
  if (!record.id) throw new Error("学習セッションIDがありません。");
  await runRequest(SESSIONS_STORE, "readwrite", store => store.put(record));
}

export async function getPendingFlashcardProgress(userId: string): Promise<OfflineProgress[]> {
  const records = await runRequest<Array<OfflineProgress & { id: string }>>(
    PROGRESS_STORE, "readonly", store => store.getAll(),
  );
  return (records || []).filter(record => record.user_id === userId)
    .map(({ id: _id, ...record }) => record);
}

export async function getPendingFlashcardSessions(userId: string): Promise<PendingFlashcardSession[]> {
  const records = await runRequest<Array<PendingFlashcardSession & { id: string }>>(
    SESSIONS_STORE, "readonly", store => store.getAll(),
  );
  return (records || []).filter(record => record.user_id === userId)
    .map(({ id: _id, ...record }) => record);
}

export async function clearPendingFlashcardProgress(userId: string, cardIds: string[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROGRESS_STORE, "readwrite");
    const store = transaction.objectStore(PROGRESS_STORE);
    for (const cardId of cardIds) store.delete(userId + ":" + cardId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("同期済み進捗の整理に失敗しました。"));
    transaction.onabort = () => reject(transaction.error || new Error("進捗整理が中断されました。"));
  });
}

export async function clearPendingFlashcardSessions(sessionIds: string[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SESSIONS_STORE, "readwrite");
    const store = transaction.objectStore(SESSIONS_STORE);
    for (const id of sessionIds) store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("同期済み履歴の整理に失敗しました。"));
    transaction.onabort = () => reject(transaction.error || new Error("履歴整理が中断されました。"));
  });
}
