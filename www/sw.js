// 앱 파일을 기기에 저장해 두고 인터넷 없이 열리게 한다. 파일을 고치면 VERSION 숫자를 올릴 것.
// 같은 주소(예: 아이디.github.io)의 다른 앱과 저장 공간을 나눠 쓰므로 이름에 PREFIX를 붙인다.
const PREFIX = 'chuguidae-';
const VERSION = PREFIX + 'v8';
const FILES = [
  './', 'index.html', 'css/style.css',
  'js/vendor/xlsx.full.min.js', 'js/native.js', 'js/db.js', 'js/excel.js', 'js/app.js',
  'guide.html', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

// 브라우저의 임시 캐시를 거치지 않고 항상 새 파일을 받아 저장한다
const precache = () => caches.open(VERSION).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))));

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    // 저장해 둔 파일이 없다 = 저장 공간이 지워졌다는 뜻이므로 전체를 다시 받아 둔다
    e.waitUntil(precache().catch(() => {}));
    return res;
  })());
});
