/* Service worker du jeu (V2) : NOTIFICATIONS PUSH seulement — aucun cache ici (la sonde /version.json et les
   mises à jour restent celles du jeu). Reçoit la notification même jeu fermé, l'affiche, et un toucher ouvre la bonne page. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = { title: 'Bébou', body: '', url: '#/', tag: 'bebou' };
  try {
    d = { ...d, ...e.data.json() };
  } catch {
    if (e.data) d.body = e.data.text();
  }
  const base = new URL(self.registration.scope);
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      renotify: true,
      icon: new URL('icons/icon-192.png', base).href,
      badge: new URL('icons/icon-192.png', base).href,
      data: { url: new URL('jeu/' + (d.url || '#/'), base).href },
      vibrate: [40, 30, 40],
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || new URL('jeu/', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.includes('/jeu')) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/* abonnement renouvelé par le navigateur : la page le réenregistrera au prochain lancement (notif.ts) */
self.addEventListener('pushsubscriptionchange', () => {});
