'use strict';
const PREFIX = 'food-jar-';
const CACHE = PREFIX + 'v6-roomy-jar-1';
const CORE = ['./', './index.html', './styles.css', './app.js', './config.js', './cloud.js', './storage.js', './vendor/matter.min.js', './jar-physics.js', './celebration.js', './manifest.webmanifest'];
const OPTIONAL = ['./assets/icon-192.png', './assets/icon-512.png'];
const absolute = path => new URL(path, self.registration.scope).href;
const STATIC = new Set([...CORE, ...OPTIONAL].map(absolute));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Essential failures preserve the previous worker; optional icons cannot abort install.
    await cache.addAll(CORE.map(path => new Request(absolute(path), {cache: 'reload'})));
    await Promise.allSettled(OPTIONAL.map(path => cache.add(absolute(path))));
    // Wait for open tabs to close to avoid mixing app versions.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('authorization')) return;
  const url = new URL(request.url);
  // Never cache API replies, signed private images, or callback query strings.
  if (url.origin !== self.location.origin || url.search || !STATIC.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Missing scripts/images must never receive HTML as a fallback.
    return fetch(request);
  })());
});
