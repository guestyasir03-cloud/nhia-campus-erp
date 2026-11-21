const CACHE_NAME = 'nhia-erp-offline-v1';
const DB_NAME = 'nhia-offline-sync-db';
const STORE_NAME = 'pending-requests';

// --- IndexedDB Helpers (Zero-Lag Native Storage) ---
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToQueue(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Background Sync Replay ---
async function syncPendingRequests() {
  const items = await getAllQueued();
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await removeFromQueue(item.id);
      }
    } catch {
      // Still offline; stop and retry next time
      break;
    }
  }
}

// --- Service Worker Lifecycle ---
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// --- Fetch Interception (Offline Open + Offline Entry) ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request.url.startsWith('http')) return;

  const isSupabaseRest = request.url.includes('supabase.co/rest/v1/');

  // 1. Supabase Write Operations (POST / PATCH / PUT / DELETE)
  if (isSupabaseRest && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request.clone());
        } catch {
          const headers = {};
          request.headers.forEach((val, key) => {
            headers[key] = val;
          });
          const body = await request.clone().text();

          await saveToQueue({
            url: request.url,
            method: request.method,
            headers,
            body,
            timestamp: Date.now()
          });

          if ('sync' in self.registration) {
            try {
              await self.registration.sync.register('sync-supabase-queue');
            } catch {}
          }

          return new Response(JSON.stringify([{ _offlineQueued: true }]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Offline-Queued': 'true'
            }
          });
        }
      })()
    );
    return;
  }

  // 2. App Files & Supabase GET Data (Network-First, Offline Cache Fallback)
  if (request.method === 'GET') {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(request);
          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return (await caches.match('/index.html')) || (await caches.match('/'));
          }
          return new Response('Offline', { status: 503 });
        }
      })()
    );
  }
});

// --- Auto-Sync Even When App Is Closed (Android / Desktop) ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-supabase-queue') {
    event.waitUntil(syncPendingRequests());
  }
});

// --- Manual / Reconnect Sync Trigger (iOS & Desktop fallback) ---
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_NOW') {
    event.waitUntil(syncPendingRequests());
  }
});