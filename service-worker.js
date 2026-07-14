// Tiny Timber Production PWA Service Worker
// Cache-first for static assets, network-first for Firestore, offline fallback to shop.html.

const CACHE_VERSION = 'v4';
const STATIC_CACHE = `tiny-timber-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tiny-timber-runtime-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = 'shop.html';

const PRECACHE_URLS = [
    'index.html',
    'shop.html',
    'admin.html',
    'manifest.webmanifest',
    'images/icons/icon-192.png',
    'images/icons/icon-512.png',
    'images/icons/icon-512-maskable.png',
    'images/icons/apple-touch-icon.png',
    'images/products/dream-big.jpg',
    'images/products/be-kind.jpg',
    'images/products/smile.jpg',
    'images/products/panda.jpg',
    'images/products/cat.jpg',
    'images/products/flower.jpg'
];

self.addEventListener('install', (event) => {
    // Intentionally does NOT call self.skipWaiting() here: an update must stay in the
    // "waiting" state so the page can show the "New version available" prompt and let
    // the user choose "Update Now" (which sends SKIP_WAITING) vs "Later".
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => Promise.all(
                PRECACHE_URLS.map((url) =>
                    // cache:'reload' bypasses the browser HTTP cache so a fresh copy is
                    // fetched from the network at install time, never a stale cached one.
                    cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
                        console.warn('[SW] Precache failed for', url, err);
                    })
                )
            ))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Lets the page trigger activation of a waiting worker (used by the "Update Now" button).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

function isFirestoreRequest(url) {
    return url.hostname.includes('firestore.googleapis.com')
        || url.hostname.includes('firebaseio.com')
        || (url.hostname.includes('googleapis.com') && url.pathname.includes('firestore'));
}

function isCloudinaryRequest(url) {
    return url.hostname.includes('res.cloudinary.com') || url.hostname.includes('api.cloudinary.com');
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Page navigations: network-first, offline fallback to the cached shop.
    // Fetches request.url (a plain string) rather than re-fetching the original
    // navigation Request object, which can spuriously fail inside a service
    // worker fetch handler in some browsers and would otherwise cause this
    // handler to fall through to the generic offline fallback even when the
    // network is actually available.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request.url, { credentials: 'same-origin', cache: 'no-store' });
                const cache = await caches.open(RUNTIME_CACHE);
                cache.put(request, response.clone());
                return response;
            } catch (err) {
                console.warn('[SW] Navigation fetch failed for', request.url, err);
                const cachedPage = await caches.match(request, { ignoreSearch: true });
                if (cachedPage) return cachedPage;
                const fallback = await caches.match(OFFLINE_FALLBACK_URL);
                if (fallback) return fallback;
                return new Response('Offline', { status: 503, statusText: 'Offline' });
            }
        })());
        return;
    }

    // Firestore: network first so data stays live, cached copy only as a last resort
    if (isFirestoreRequest(url)) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Cloudinary product images: cache first, network fallback
    if (isCloudinaryRequest(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Everything else same-origin (HTML/icons/local product images) + fonts: cache first
    event.respondWith(cacheFirst(request));
});
