export type FetchRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  retryServerErrors?: boolean;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return fetch(input, init);
  }
  const attempts = Math.max(1, Math.min(3, Math.floor(options.attempts || 2)));
  const baseDelayMs = Math.max(100, Math.min(1500, options.baseDelayMs || 300));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, { ...init, cache: init.cache || 'no-store' });
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 ||
        (Boolean(options.retryServerErrors ?? true) && response.status >= 500);
      if (!retryable || attempt === attempts - 1) return response;
      if (response.body) await response.body.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('ネットワーク接続を確認できませんでした。');
}
