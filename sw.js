const CACHE = 'quiet-focus-v31';
const ASSETS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-152.png',
  './icons/apple-touch-icon-167.png',
  './apple-touch-icon.png',
  './icons/quiet-hero.png',
  './icons/quiet-mood-focused.png',
  './icons/quiet-mood-thinking.png',
  './icons/quiet-mood-encouraging.png',
  './icons/quiet-mood-celebrating.png',
  './icons/quiet-mood-reminder.png',
  './icons/quiet-mood-rest.png'
];

const NETWORK_FIRST = [
  './index.html',
  './privacy.html',
  './terms.html',
  './contact.html',
  './live-demo.html',
  './index.html',
  './config.js',
  './auth-captcha.js',
  './supabase-sessions.js',
  './supabase-assignments.js',
  './assignment-scan.js',
  './quiet-reminder-copy.js',
  './mascot-hybrid.js',
  './mascot-hybrid.css',
  './push-notifications.js',
  './sw.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-152.png',
  './icons/apple-touch-icon-167.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isNetworkFirst(url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const file = path.slice(path.lastIndexOf('/') + 1) || 'index.html';
  return NETWORK_FIRST.some((entry) => entry.endsWith(file));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
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
