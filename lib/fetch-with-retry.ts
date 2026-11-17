export type FetchRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  retryServerErrors?: boolean;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase();
  const safeToRetry = method === 'GET' || method === 'HEAD';
  const attempts = safeToRetry ? Math.max(1, Math.min(3, Math.floor(options.attempts || 2))) : 1;
  const baseDelayMs = Math.max(100, Math.min(1500, options.baseDelayMs || 300));
  const timeoutMs = Math.max(1_000, Math.min(30_000, Math.floor(options.timeoutMs || 12_000)));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (init.signal?.aborted) {
      throw new DOMException('The request was aborted.', 'AbortError');
    }
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
      const response = await fetch(input, {
        ...init,
        signal,
        cache: init.cache || 'no-store',
      });
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 ||
        (Boolean(options.retryServerErrors ?? true) && response.status >= 500);
      if (!safeToRetry || !retryable || attempt === attempts - 1) return response;
      if (response.body) await response.body.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (!safeToRetry || init.signal?.aborted || attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('ネットワーク接続を確認できませんでした。');
}
