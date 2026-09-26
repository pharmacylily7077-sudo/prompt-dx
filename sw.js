/**
 * Service Worker 自爆・完全キャッシュ消去スクリプト
 * 端末に残った古いキャッシュとService Workerを完全削除して直ちに解除します
 */
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        console.log('[SW] Nuking cache:', k);
        return caches.delete(k);
      }));
    }).then(function() {
      return self.registration.unregister();
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll();
    }).then(function(clients) {
      clients.forEach(function(client) {
        if (client.navigate) {
          client.navigate(client.url);
        }
      });
    })
  );
});
