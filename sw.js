/**
 * 外車・高級車販売 資金統制・不正根絶システム — Service Worker
 * 
 * キャッシュ戦略:
 * - UI資産（HTML/CSS/JS/画像）: Cache First → ネットワークフォールバック
 * - GAS同期（POST）: Network Only（キャッシュ対象外）
 * - バージョン管理: CACHE_VERSION を更新すると古いキャッシュを自動削除
 */

var CACHE_VERSION = 'dealer-dx-v1';
var PRECACHE_URLS = [
  './',
  './dealer.html',
  './index.html',
  './css/dealer.css',
  './css/style.css',
  './js/dealer-contract.js',
  './js/dealer-expense.js',
  './js/dealer-loan.js',
  './js/dealer-audit.js',
  './js/dealer-supreme.js',
  './js/dealer-sync.js',
  './js/dealer-fortify.js',
  './js/dealer-app.js',
  './img/app-icon-192.png',
  './img/app-icon-512.png',
  './img/app-icon.jpg',
  './manifest.json'
];

// インストール: プリキャッシュ
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// アクティベーション: 古いキャッシュの削除
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_VERSION;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// フェッチ: Cache First（POST/GAS同期を除く）
self.addEventListener('fetch', function(event) {
  // POST リクエスト（GAS同期等）はキャッシュしない
  if (event.request.method !== 'GET') {
    return;
  }

  // Google Apps Script / 外部APIへのリクエストはネットワークオンリー
  if (event.request.url.indexOf('script.google.com') !== -1 ||
      event.request.url.indexOf('googleapis.com') !== -1) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        // キャッシュヒット → バックグラウンドで最新版を取得して更新
        event.waitUntil(
          fetch(event.request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_VERSION).then(function(cache) {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(function() {
            // ネットワーク失敗は無視（キャッシュで動作継続）
          })
        );
        return cachedResponse;
      }

      // キャッシュミス → ネットワーク取得してキャッシュ保存
      return fetch(event.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_VERSION).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function() {
        // オフライン＋キャッシュなし → フォールバック
        if (event.request.destination === 'document') {
          return caches.match('./dealer.html');
        }
      });
    })
  );
});
