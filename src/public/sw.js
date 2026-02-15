const CACHE_NAME = 'retrotube-v1';
const ASSETS = [
    '/',
    '/style.css',
    '/css/lite-yt-embed.css',
    '/js/lite-yt-embed.js',
    '/icon-192.png',
    '/icon-512.png'
];

// Install: Cache core assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate: Clean up old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch: simple Network-First strategy for HTML, Cache-First for static
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Static assets: Cache First
    if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg)$/)) {
        e.respondWith(
            caches.match(e.request).then((cached) => {
                return cached || fetch(e.request);
            })
        );
        return;
    }

    // HTML / API: Network First, fallback to cache (if any)
    e.respondWith(
        fetch(e.request)
            .catch(() => caches.match(e.request))
    );
});
