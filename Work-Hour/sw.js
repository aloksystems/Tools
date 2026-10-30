var CACHE = "wh-v3";

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll([".", "index.html", "styles.css", "script.js", "manifest.json", "icon.svg"]);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async function () {
    try {
      var res = await fetch(e.request);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      }
      return res;
    } catch (err) {
      var cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      if (e.request.mode === "navigate") {
        var fallback = await caches.match("index.html");
        if (fallback) return fallback;
      }
      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k.startsWith("wh-") && k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});
