/* NGF FINCORP service worker.
   Purpose: make the site installable and open fast. It stores only the app's own unchanging files (scripts,
   styles, icons). It NEVER stores anything from /api or any signed-in data: customer and payment information
   always comes live from the server. If the phone is offline, a plain "You are offline" page is shown. */
const VERSION = 'ngf-v1'
const STATIC_CACHE = `${VERSION}-static`
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/ngflogo.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return                       // other sites: untouched
  if (url.pathname.startsWith('/api/') || req.headers.has('authorization')) return   // live data: never cached

  // Pages: always ask the network first; if there is no connection show the offline page
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }

  // The app's own files (hashed, never change) and icons: keep a copy so they open instantly
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/ngflogo.png') {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(STATIC_CACHE).then(c => c.put(req, copy)) }
        return res
      }))
    )
  }
})

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
