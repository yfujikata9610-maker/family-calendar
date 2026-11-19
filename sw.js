// 家族カレンダー Service Worker
// 役割: ①アプリ本体を端末に保存して即起動 ②通知の受信 ③アイコンのバッジ
// ※ アプリを更新したら CACHE の番号を上げる
const CACHE = 'futari-cal-v2';
const BADGE = 'famcal-badge'; // バッジ件数の保存場所（アプリ更新でも消さない）
const ASSETS = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './vendor/supabase-2.45.4.min.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== BADGE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 同じサイト内のファイルは「保存済みの版をすぐ返し、裏で最新版を取得して保存」。
// 更新は次に開いたときに反映される。Supabaseへの通信はここを通らない。
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/badge-count')) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request)
      .then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })
      .catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await c.match('./index.html')) || Response.error();
  }));
});

async function bumpBadge() {
  const c = await caches.open(BADGE);
  const r = await c.match('./badge-count');
  const n = (r ? parseInt(await r.text(), 10) || 0 : 0) + 1;
  await c.put('./badge-count', new Response(String(n)));
  return n;
}

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    if (data.badge) {
      try {
        const n = await bumpBadge();
        if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
      } catch (err) { /* バッジ非対応でも通知は出す */ }
    }
    await self.registration.showNotification(data.title || '家族カレンダー', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: data.tag,
      data: { url: data.url || './' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(e.notification.data && e.notification.data.url || './');
    })
  );
});
