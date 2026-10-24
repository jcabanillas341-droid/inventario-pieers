// PIEERS PRO Service Worker — v2 (v27.29): abre al instante desde la memoria del celular
// y descarga la versión nueva por detrás. Avisa a la app cuando hay una versión nueva.
const CACHE = 'pieers-pro-v2';
const APP = ['/inventario-pieers/', '/inventario-pieers/index.html'];
const CDN = /(^https:\/\/(cdn\.sheetjs\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\/)/;

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).catch(() => {}));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
    self.clients.claim();
});

async function avisarNueva() {
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => c.postMessage({ tipo: 'nueva-version' }));
}

// La app (index.html): primero lo guardado (instantáneo); por detrás se baja la nueva.
async function paginaApp(req) {
    const cache = await caches.open(CACHE);
    const key = '/inventario-pieers/index.html';
    const guardada = await cache.match(key);
    const copiaVieja = guardada ? guardada.clone() : null;   // se clona ANTES de entregarla
    const red = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(async resp => {
        if (resp && resp.ok && resp.type === 'basic') {
            const nuevo = await resp.clone().text();
            const viejo = copiaVieja ? await copiaVieja.text() : null;
            await cache.put(key, resp.clone());
            if (viejo !== null && viejo !== nuevo) avisarNueva();
        }
        return resp;
    }).catch(() => null);
    if (guardada) return guardada;
    return (await red) || new Response('Sin conexión', { status: 503 });
}

// Librerías (Excel, fuentes): de la memoria si ya están; si no, se descargan y se guardan.
async function libreria(req) {
    const cache = await caches.open(CACHE);
    const g = await cache.match(req);
    if (g) return g;
    const resp = await fetch(req);
    if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
    return resp;
}

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;                       // Firebase (PUT/PATCH...) pasa directo
    const url = req.url;
    if (req.mode === 'navigate' || /\/inventario-pieers\/(index\.html)?(\?.*)?$/.test(new URL(url).pathname + new URL(url).search)) {
        if (new URL(url).origin === self.location.origin) { e.respondWith(paginaApp(req)); return; }
    }
    if (CDN.test(url)) { e.respondWith(libreria(req)); return; }
    // Todo lo demás (nube Firebase, EventSource, etc.) va directo a internet, sin caché
});
