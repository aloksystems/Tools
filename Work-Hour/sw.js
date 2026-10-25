var CACHE = "wh-v1";

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll([".", "index.html", "styles.css", "script.js", "manifest.json", "icon.svg"]);
    })
  );
});

self.addEventListener("fetch", function (e) {
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (res) {
        return caches.open(CACHE).then(function (c) {
          if (e.request.url.startsWith(self.location.origin)) {
            c.put(e.request, res.clone());
          }
          return res;
        });
      });
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
});
