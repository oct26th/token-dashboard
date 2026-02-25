// NERV Token Dashboard - Service Worker
// Version: 1.0.0 | Codename: EVA-SW

const CACHE_NAME = 'nerv-token-dashboard-v1';
const STATIC_CACHE = 'nerv-static-v1';
const DYNAMIC_CACHE = 'nerv-dynamic-v1';

// 需要預先緩存的核心資源
const PRECACHE_URLS = [
  '/dashboard-pwa/index.html',
  '/dashboard-pwa/manifest.json',
  '/dashboard-pwa/icons/icon-192x192.png',
  '/dashboard-pwa/icons/icon-512x512.png',
  '/dashboard-pwa/offline.html'
];

// ============================================
// 安裝事件：預快取核心資源
// ============================================
self.addEventListener('install', (event) => {
  console.log('[NERV-SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[NERV-SW] Pre-caching core assets');
      // 逐一緩存，允許部分失敗
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(err => {
          console.warn(`[NERV-SW] Failed to cache ${url}:`, err);
        }))
      );
    }).then(() => {
      console.log('[NERV-SW] Installation complete. Sync rate: NORMAL');
      return self.skipWaiting();
    })
  );
});

// ============================================
// 激活事件：清理舊版緩存
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[NERV-SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => {
            console.log(`[NERV-SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[NERV-SW] Activation complete. Taking control of all clients.');
      return self.clients.claim();
    })
  );
});

// ============================================
// Fetch 事件：緩存優先策略（核心頁面）
// 網路優先策略（動態 API 數據）
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只處理 GET 請求
  if (request.method !== 'GET') return;

  // API 請求：網路優先，失敗才用緩存
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // 靜態資源：緩存優先，失敗才用網路
  event.respondWith(cacheFirstStrategy(request));
});

// 緩存優先策略
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log(`[NERV-SW] Cache hit: ${request.url}`);
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn(`[NERV-SW] Network failed for: ${request.url}`);
    // 返回離線頁面
    const offlinePage = await caches.match('/dashboard-pwa/offline.html');
    return offlinePage || new Response('<h1>離線模式 - NERV 系統暫時無法連線</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// 網路優先策略（API 數據）
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn(`[NERV-SW] API network failed, serving from cache: ${request.url}`);
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({
      error: 'offline',
      message: 'NERV 系統離線中，顯示緩存數據'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ============================================
// 背景同步事件（未來擴充用）
// ============================================
self.addEventListener('sync', (event) => {
  console.log('[NERV-SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-token-data') {
    event.waitUntil(syncTokenData());
  }

  if (event.tag === 'sync-budget-alerts') {
    event.waitUntil(syncBudgetAlerts());
  }
});

async function syncTokenData() {
  console.log('[NERV-SW] Syncing token usage data in background...');
  // TODO: 背景同步 Token 消耗數據到後端
  // 實作時可在此加入 IndexedDB 讀取 + fetch POST 邏輯
}

async function syncBudgetAlerts() {
  console.log('[NERV-SW] Syncing budget alerts in background...');
  // TODO: 背景同步預算告警設定
}

// ============================================
// Push 通知事件（未來擴充用）
// ============================================
self.addEventListener('push', (event) => {
  console.log('[NERV-SW] Push notification received');

  const data = event.data ? event.data.json() : {
    title: 'NERV Token Alert',
    body: '系統通知',
    icon: '/dashboard-pwa/icons/icon-192x192.png'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/dashboard-pwa/icons/icon-192x192.png',
      badge: '/dashboard-pwa/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/dashboard-pwa/index.html' },
      actions: [
        { action: 'view', title: '查看詳情' },
        { action: 'dismiss', title: '關閉' }
      ]
    })
  );
});

// 通知點擊事件
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/dashboard-pwa/index.html';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          const existingClient = clientList.find(c => c.url.includes('dashboard-pwa'));
          if (existingClient) {
            return existingClient.focus();
          }
          return clients.openWindow(urlToOpen);
        })
    );
  }
});

console.log('[NERV-SW] Service Worker loaded. AT Field: ACTIVE');
