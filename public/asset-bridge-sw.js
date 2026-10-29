let assetMapPromise;

function loadAssetMap() {
  if (!assetMapPromise) {
    assetMapPromise = fetch("/asset-url-map.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .catch(() => ({}));
  }
  return assetMapPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname === "/asset-url-map.json") return;

  event.respondWith((async () => {
    const map = await loadAssetMap();
    let pathname = requestUrl.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {}
    const target = map[pathname];
    if (!target) return fetch(event.request);

    const destination = new URL(target);
    destination.search = requestUrl.search;
    destination.hash = requestUrl.hash;
    return Response.redirect(destination.toString(), 302);
  })());
});
