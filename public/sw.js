/* CampusSync PWA service worker: push notifications + offline app/data cache. */
const SHELL_CACHE = 'campussync-shell-v3';
const STATIC_CACHE = 'campussync-static-v3';
const PUBLIC_DATA_CACHE = 'campussync-public-data-v2';
const USER_DATA_CACHE_PREFIX = 'campussync-user-data-v2-';
const MAX_DATA_CACHE_ENTRIES = 180;
const MAX_JSON_CACHE_BYTES = 5 * 1024 * 1024;

const PUBLIC_API_PATHS = new Set([
  '/api/weather/forecast',
  '/api/class-timetable',
  '/api/school-countdowns',
  '/api/school-schedule',
]);

const NEVER_CACHE_PATHS = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/hiadmin(?:\/|$)/,
  /^\/api\/teacher(?:\/|$)/,
  /^\/api\/line(?:-|\/|$)/,
  /^\/api\/push(?:\/|$)/,
  /^\/api\/earthquakes(?:\/|$)/,
  /^\/api\/weather\/jma-alerts(?:\/|$)/,
  /^\/api\/materials\/(?:file|merge|submissions)(?:\/|$)/,
  /^\/api\/notifications\/read(?:\/|$)/,
  /^\/api\/student-login-handoff(?:\/|$)/,
];

function getJwtSubject(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].split('.');
  if (token.length < 2) return null;
  try {
    const base64 = token[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof payload.sub === 'string' && payload.sub.length > 5 ? payload.sub : null;
  } catch {
    return null;
  }
}

function makeCacheKey(url, userId) {
  const keyUrl = new URL(url.toString());
  if (userId) keyUrl.searchParams.set('__campussync_user', userId);
  return new Request(keyUrl.toString(), { method: 'GET' });
}

function isCacheableApiRequest(request, url) {
  if (request.method !== 'GET' || request.headers.has('x-admin-password')) return null;
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    if (NEVER_CACHE_PATHS.some(pattern => pattern.test(url.pathname))) return null;
    const userId = getJwtSubject(request);
    if (PUBLIC_API_PATHS.has(url.pathname)) {
      return { cacheName: userId ? USER_DATA_CACHE_PREFIX + userId : PUBLIC_DATA_CACHE, userId };
    }
    if (userId) return { cacheName: USER_DATA_CACHE_PREFIX + userId, userId };
    return null;
  }
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) {
    const userId = getJwtSubject(request);
    if (!userId) return null;
    return { cacheName: USER_DATA_CACHE_PREFIX + userId, userId };
  }
  return null;
}

async function putLimited(cache, key, response) {
  if (!response || response.status !== 200) return;
  const contentType = response.headers.get('content-type') || '';
  if (!/application\/(?:[\w.+-]*\+)?json|application\/json/i.test(contentType)) return;
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_JSON_CACHE_BYTES) return;
  try {
    const body = await response.clone().arrayBuffer();
    if (body.byteLength > MAX_JSON_CACHE_BYTES) return;
    const headers = new Headers({ 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
    await cache.put(key, new Response(body, { status: 200, headers }));
    const keys = await cache.keys();
    if (keys.length > MAX_DATA_CACHE_ENTRIES) {
      for (const oldKey of keys.slice(0, keys.length - MAX_DATA_CACHE_ENTRIES)) await cache.delete(oldKey);
    }
  } catch {
    // Storage pressure must never interrupt normal browsing.
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.add('/').catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      const managed = name.startsWith('campussync-shell-')
        || name.startsWith('campussync-static-')
        || name.startsWith('campussync-public-data-');
      return managed && ![SHELL_CACHE, STATIC_CACHE, PUBLIC_DATA_CACHE].includes(name)
        ? caches.delete(name)
        : Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'CLEAR_USER_CACHE' && typeof data.userId === 'string' && /^[0-9a-f-]{20,}$/i.test(data.userId)) {
    event.waitUntil(caches.delete(USER_DATA_CACHE_PREFIX + data.userId));
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/hiadmin')) return;
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === '/') await cache.put(request, response.clone());
        return response;
      } catch {
        return await cache.match(request) || await cache.match('/') || new Response(
          '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CampusSync オフライン</title><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:2rem"><h1>オフラインモード</h1><p>保存済みの画面・データを表示できませんでした。インターネットに接続してCampusSyncを開き直してください。</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  if (url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/')
    || /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|svg|ico)$/i.test(url.pathname)
  )) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok) void cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || await network || new Response('', { status: 504 });
    })());
    return;
  }

  const apiCache = isCacheableApiRequest(request, url);
  if (apiCache) {
    event.respondWith((async () => {
      const cache = await caches.open(apiCache.cacheName);
      const key = makeCacheKey(url, apiCache.userId);
      try {
        const response = await fetch(request);
        if (response.ok) await putLimited(cache, key, response);
        return response;
      } catch {
        const cached = await cache.match(key);
        return cached || new Response(JSON.stringify({
          success: false,
          offline: true,
          message: 'オフラインです。このデータは端末に保存されていません。',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    })());
  }
});

/* Existing CampusSync push notification handlers. */
self.addEventListener('push', event => {
  let payload = {
    title: 'CampusSync',
    body: '新しい通知があります。',
    url: '/',
    tag: 'campussync-notification',
    priority: 'normal',
  };
  if (event.data) {
    try {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }
  const safeUrl = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  event.waitUntil(
    self.registration.showNotification(payload.title || 'CampusSync', {
      body: payload.body || '新しい通知があります。',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'campussync-notification',
      data: { url: safeUrl, category: payload.category || 'general' },
      silent: false,
      renotify: false,
      requireInteraction: payload.requireInteraction === true || payload.priority === 'urgent',
      ...(payload.priority === 'urgent' ? { vibrate: [260, 120, 260, 120, 520] } : {}),
      timestamp: Date.now(),
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data?.url || '/';
  const targetUrl = new URL(requested, self.location.origin);
  if (targetUrl.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const sameOriginWindow = windows.find(client => new URL(client.url).origin === self.location.origin);
      if (sameOriginWindow) {
        if ('navigate' in sameOriginWindow) sameOriginWindow.navigate(targetUrl.href);
        return sameOriginWindow.focus();
      }
      return self.clients.openWindow(targetUrl.href);
    })
  );
});
