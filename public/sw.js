/* CampusSync offline shell + Web Push service worker. Served at /sw.js. */
const SHELL_CACHE = 'campussync-shell-v1';
const ASSET_CACHE = 'campussync-assets-v1';
const CORE_URLS = [
  '/site.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/illustrations/error-offline.svg',
];

async function cacheShellDocument() {
  try {
    const response = await fetch('/', { cache: 'reload' });
    const cacheControl = response.headers.get('cache-control') || '';
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('text/html') ||
      /private|no-store/i.test(cacheControl) ||
      response.headers.has('set-cookie')
    ) return;

    const shellCache = await caches.open(SHELL_CACHE);
    await shellCache.put('/', response.clone()).catch(() => undefined);

    // The HTML contains the initial route's hashed Next.js scripts and styles.
    // Pre-cache them now so the first offline launch does not depend on a reload.
    const html = await response.text();
    const assetPaths = Array.from(html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g))
      .map((match) => match[1])
      .filter((path) => path.startsWith('/_next/static/'));
    const assets = await caches.open(ASSET_CACHE);
    await Promise.allSettled(assetPaths.map(async (path) => {
      try {
        const assetResponse = await fetch(path, { cache: 'reload' });
        if (assetResponse.ok && assetResponse.type === 'basic') {
          await assets.put(path, assetResponse.clone()).catch(() => undefined);
        }
      } catch {
        // Lazy-loaded assets can be cached the first time they are used online.
      }
    }));
  } catch {
    // Keep installation successful even when the app is installed while offline.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await cacheShellDocument();
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(CORE_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        const cacheControl = response.headers.get('cache-control') || '';
        if (response.ok && !/private|no-store/i.test(cacheControl) && !response.headers.has('set-cookie')) {
          await cache.put(url, response.clone()).catch(() => undefined);
        }
      } catch {
        // A single optional asset must not prevent the worker from installing.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('campussync-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache private API responses, auth flows, or Next.js server-component data.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/_next/image')
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cacheControl = response.headers.get('cache-control') || '';
        if (
          response.ok &&
          response.headers.get('content-type')?.includes('text/html') &&
          !/private|no-store/i.test(cacheControl) &&
          !response.headers.has('set-cookie')
        ) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(request, response.clone()).catch(() => undefined);
          if (url.pathname === '/') await cache.put('/', response.clone()).catch(() => undefined);
        }
        return response;
      } catch {
        return (await caches.match(request)) ||
          (await caches.match(url.pathname + url.search)) ||
          (await caches.match('/'));
      }
    })());
    return;
  }

  const isNextStatic = url.pathname.startsWith('/_next/static/');
  const isPublicAsset =
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    request.destination === 'manifest' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/branding/') ||
    url.pathname.startsWith('/illustrations/') ||
    url.pathname.startsWith('/animated/') ||
    url.pathname.startsWith('/club-icons/') ||
    url.pathname.startsWith('/rank-badges/') ||
    url.pathname.startsWith('/rank-icons/') ||
    url.pathname.startsWith('/status-icons/') ||
    url.pathname.startsWith('/data/');

  if (!isNextStatic && !isPublicAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});

/* Existing Web Push behavior */
self.addEventListener('push', (event) => {
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

  const safeUrl = typeof payload.url === 'string' && payload.url.startsWith('/')
    ? payload.url
    : '/';

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
      timestamp: Date.now(),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requested = event.notification.data?.url || '/';
  const targetUrl = new URL(requested, self.location.origin);
  if (targetUrl.origin !== self.location.origin) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const sameOriginWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOriginWindow) {
        if ('navigate' in sameOriginWindow) sameOriginWindow.navigate(targetUrl.href);
        return sameOriginWindow.focus();
      }
      return self.clients.openWindow(targetUrl.href);
    })
  );
});
