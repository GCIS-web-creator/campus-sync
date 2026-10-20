/* CampusSync Web Push service worker. Served at /sw.js (root scope). */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'CampusSync',
    body: '新しい通知があります。',
    url: '/',
    tag: 'campussync-notification',
  };

  if (event.data) {
    try {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'CampusSync', {
      body: payload.body || '新しい通知があります。',
      icon: '/favicon.ico',
      tag: payload.tag || 'campussync-notification',
      data: { url: payload.url || '/' },
      // 無音を強制せず、通知音はOS・ブラウザーの標準設定に任せる。
      silent: false,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const sameOriginWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOriginWindow) {
        if ('navigate' in sameOriginWindow) sameOriginWindow.navigate(targetUrl);
        return sameOriginWindow.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
