// Minimal service worker — required by Chrome/Edge for "Install App" eligibility.
// Intentionally does no caching so chat data (via Netlify functions/Firebase) always
// stays live and network-first.

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
    // No-op passthrough: let the browser handle every request normally.
});
