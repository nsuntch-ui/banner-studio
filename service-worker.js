const cachePrefix = "banner-studio-shell-";
const cacheName = cachePrefix + "321dbc0b4e05";
const assetPaths = ["./","./font.js?v=81ff6526cd90","./device.js?v=9feb03d8e02d","./editor.js?v=00c513e0a18a","./styles.css?v=970b2ed70d41","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
const scope = self.registration.scope;
const appUrl = new URL("./", scope).href;
const indexUrl = new URL("index.html", scope).href;
const appAssets = new Set(assetPaths.map(path => new URL(path, scope).href));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(assetPaths.map(path => new Request(new URL(path, scope), { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const page = url.origin + url.pathname;
  const isShell = request.mode === "navigate" && (page === appUrl || page === indexUrl);
  if (!isShell && !appAssets.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(isShell ? appUrl : request);
    return cached ?? fetch(request);
  })());
});
