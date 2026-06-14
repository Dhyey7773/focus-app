const CACHE = 'quiet-focus-v65';

const ASSETS = [
  './live-demo.html',
  './index.html',
  './sitemap.xml',
  './robots.txt',
  './quietfocus2026indexnow.txt',
  './config.js',
  './auth-captcha.js',
  './supabase-sessions.js',
  './supabase-assignments.js',
  './assignment-scan.js',
  './lms-import.js',
  './stay-ahead-planning.js',
  './quiet-reminder-copy.js',
  './mascot-hybrid.js',
  './mascot-hybrid.css',
  './push-notifications.js',
  './sw-update.js',
  './manifest.webmanifest',
  './contact.html',
  './about-quiet.html',
  './privacy.html',
  './terms.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-152.png',
  './icons/apple-touch-icon-167.png',
  './apple-touch-icon.png',
  './icons/quiet-3quarter.png',
  './icons/quiet-hero.png',
  './icons/quiet-mood-focused.png',
  './icons/quiet-mood-thinking.png',
  './icons/quiet-mood-encouraging.png',
  './icons/quiet-mood-celebrating.png',
  './icons/quiet-mood-reminder.png',
  './icons/quiet-mood-rest.png'
];

const NETWORK_FIRST = new Set([
  'index.html',
  'live-demo.html',
  'contact.html',
  'about-quiet.html',
  'privacy.html',
  'terms.html',
  'config.js',
  'auth-captcha.js',
  'supabase-sessions.js',
  'supabase-assignments.js',
  'assignment-scan.js',
  'lms-import.js',
  'stay-ahead-planning.js',
  'quiet-reminder-copy.js',
  'mascot-hybrid.js',
  'mascot-hybrid.css',
  'push-notifications.js',
  'sw-update.js',
  'manifest.webmanifest',
  'sw.js'
]);

function fileName(url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  return path.slice(path.lastIndexOf('/') + 1) || 'index.html';
}

function isAppShell(url) {
  return NETWORK_FIRST.has(fileName(url));
}

function isCriticalScript(url) {
  return /\.js(\?|$)/i.test(url.pathname + url.search) &&
    /(?:^|[?&])v=\d+/i.test(url.search || "");
}

async function putCache(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      await putCache(request, response);
      return response;
    }
  } catch {
    /* offline */
  }
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      putCache(request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;
  return cache.match(request);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await putCache(request, response);
    return response;
  } catch {
    return cached;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'QF_CACHE_READY', version: CACHE });
        });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isAppShell(url)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  if (isCriticalScript(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Quiet Focus', body: 'Assignment reminder', url: './live-demo.html?page=assignments' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) { /* use defaults */ }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Quiet Focus', {
      body: payload.body || 'You have an assignment due soon.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'quiet-focus-reminder',
      data: { url: payload.url || './live-demo.html?page=assignments' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || './live-demo.html?page=assignments';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
