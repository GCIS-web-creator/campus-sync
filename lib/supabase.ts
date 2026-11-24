import { createClient } from '@supabase/supabase-js';
import { getOfflineRestResponse, putOfflineRestResponse } from '@/lib/offline-rest-cache';

/**
 * Keep Supabase reads available when a previously used device temporarily loses
 * its connection. Only successful REST GET responses are cached, per signed-in
 * user. Auth, Storage, Functions, writes, and Next.js API routes are never cached.
 */
function getJwtSubject(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    const token = authorization.slice(7);
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const claims = JSON.parse(decoded) as { sub?: unknown; role?: unknown };
    if (claims.role === 'anon' || typeof claims.sub !== 'string') return null;
    return claims.sub;
  } catch {
    return null;
  }
}

async function offlineAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return fetch(input, init);

  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const requestUrl = request?.url || String(input);
  const method = (init?.method || request?.method || 'GET').toUpperCase();
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return fetch(input, init);
  }

  const headers = new Headers(init?.headers || request?.headers);
  const userId = getJwtSubject(headers.get('authorization'));
  const isCacheableRead = method === 'GET' && url.pathname.includes('/rest/v1/') && Boolean(userId);
  if (!isCacheableRead || !userId) return fetch(input, init);

  try {
    const response = await fetch(input, init);
    if (response.ok && response.status === 200) {
      const cacheControl = response.headers.get('cache-control') || '';
      if (!/no-store/i.test(cacheControl)) {
        const body = await response.clone().text();
        if (body.length <= 2_000_000) {
          const cacheHeaders: [string, string][] = [];
          const contentType = response.headers.get('content-type');
          if (contentType) cacheHeaders.push(['content-type', contentType]);
          await putOfflineRestResponse({
            userId,
            url: url.href,
            body,
            headers: cacheHeaders,
            savedAt: Date.now(),
          }).catch((error) => console.warn('CampusSync offline data cache skipped:', error));
        }
      }
    }
    window.dispatchEvent(new Event('campussync:network-online'));
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    window.dispatchEvent(new Event('campussync:network-offline'));

    const cached = await getOfflineRestResponse(userId, url.href).catch(() => null);
    if (cached) {
      const cachedHeaders = new Headers(cached.headers);
      cachedHeaders.set('X-CampusSync-Offline-Cache', '1');
      return new Response(cached.body, {
        status: 200,
        statusText: 'OK',
        headers: cachedHeaders,
      });
    }
    throw error;
  }
}

/**
 * Avoid failing Next.js build-time module evaluation when Vercel preview
 * deployments do not have the public Supabase variables configured.
 */
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const supabaseUrl = configuredUrl || 'https://missing-supabase-config.supabase.co';
const supabasePublishableKey = configuredPublishableKey || 'missing-supabase-publishable-key';

if (typeof window !== 'undefined' && (!configuredUrl || !configuredPublishableKey)) {
  console.error(
    'CampusSync: Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: offlineAwareFetch },
});
