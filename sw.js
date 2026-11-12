const CACHE = 'vantage-training-console-v14-3';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './db.js', './seed.js',
  './readiness.js', './ftms-bluetooth.js', './historical-import.js', './exercise-catalogue.js', './programs.js', './workout-history.js', './strength-integrity.js', './evidence-integrity.js', './xlsx-import.js', './vitals-markdown.js', './workout-markdown.js', './nutrition-markdown.js', './liss-markdown.js', './recovery-markdown.js', './zip-pack.js',
  './bloodwork-markdown.js', './ocr-engine.js', './metrics-engine.js', './strength-analysis.js', './VANTAGE_BLOODWORK_THREAD_PROMPT.md', './VANTAGE_STRENGTH_COACH_PROMPT.md', './VANTAGE_LISS_COACH_PROMPT.md', './VANTAGE_RECOVERY_COACH_PROMPT.md',
  './manifest.webmanifest', './icons/vantage-icon-192-v133.png', './icons/vantage-icon-512-v133.png', './icons/vantage-app-icon-dark.svg', './icons/vantage-full-logo.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('Offline asset unavailable');
      })
  );
});
