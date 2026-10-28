// ============================================================
//  Service Worker — hace que la app cargue al instante y se
//  pueda instalar en el celu.
//
//  Estrategia:
//   • El "cascarón" de la app (HTML/CSS/JS/íconos) se cachea y
//     se sirve desde el celu: carga instantánea, sin trabarse.
//   • Las llamadas a Supabase (los datos) SIEMPRE van a la red:
//     nunca se cachean, así ves plata siempre al día. Si no hay
//     internet, la app abre igual y avisa que estás sin conexión.
// ============================================================

const CACHE = "contable-gular-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/db.js",
  "./js/auth.js",
  "./js/intro.js",
  "./js/space.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./assets/img/isomenu.svg",
  "./assets/img/isomenu-top.svg",
  "./assets/img/isomenu-tail.svg",
  "./assets/img/app-icon.svg",
  "./assets/img/app-icon-maskable.svg",
  "./assets/fonts/sahlia.otf",
  "./assets/fonts/satoshi.woff2",
  "./assets/fonts/satoshi-italic.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejamos GET del mismo origen (el cascarón).
  // Todo lo de Supabase (otro dominio) pasa de largo -> siempre en vivo.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Guardamos en caché lo nuevo del propio sitio
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html")); // fallback offline
    })
  );
});
