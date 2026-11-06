/* CampusSync Web Push service worker. Served at /sw.js (root scope). */
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
      // 通知音・バイブレーションはOSとブラウザーの設定に任せる。
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
