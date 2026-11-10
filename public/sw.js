/* Service worker du jeu (V2).
   1. NOTIFICATIONS PUSH : reçoit la notification même jeu fermé, l'affiche, et un toucher ouvre la bonne page.
   2. JEU INSTALLÉ SUR L'APPAREIL (fluidité, lot 1) : sert depuis Cache Storage ce que la page y a rangé
      (src/game/bundle.ts, d'après /precache.json) → démarrage sans réseau, même hors connexion, et qui résiste au
      ménage du cache HTTP (iPhone). Règles, volontairement étroites :
      - /assets/* (noms à empreinte, immuables) et médias du manifeste (/fx, /audio, /icons) : cache d'abord ;
      - /art/*?v=… (images versionnées, immuables) : cache d'abord, gardées au fil de l'usage (plafonnées) →
        moins d'appels à la fonction R2, jamais plus ;
      - la page /jeu/ : RÉSEAU d'abord (3 s max), copie locale en repli → un patch est vu tout de suite ;
      - /version.json, /precache.json, /sw.js, le labo, les requêtes partielles (Range) et tout le reste : jamais touchés.
      Une réponse n'est rangée que si elle est correcte (200, même origine, pas une page HTML à la place d'un fichier).
      Le ménage ne touche que les caches de ce fichier : ceux de la page (bebou-cartes-*, bebou-plis, bebou-nom-moule) restent. */
const APP = 'bebou-app-v1';
const ART = 'bebou-art-v1';
const ART_MAX = 1800; // (≈ 12 Ko la miniature : ~25 Mo au plus)
const SCOPE = new URL(self.registration.scope);
const PAGE = new URL('jeu/index.html', SCOPE).href;

const storable = (res, html) => res && res.ok && res.status === 200 && res.type === 'basic' && /text\/html/.test(res.headers.get('content-type') || '') === html;
const stash = (name, key, res) =>
  caches
    .open(name)
    .then((c) => c.put(key, res))
    .catch(() => {}); // (quota plein, stockage refusé : on continue sur le réseau)

async function cacheFirst(name, req) {
  const cache = await caches.open(name);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res, false)) {
    void stash(name, req.url, res.clone());
    if (name === ART) void trimArt();
  }
  return res;
}

let trimming = false;
let sinceTrim = 0;
async function trimArt() {
  if (trimming || ++sinceTrim < 60) return;
  trimming = true;
  sinceTrim = 0;
  try {
    const cache = await caches.open(ART);
    const keys = await cache.keys();
    // (les plus anciennes d'abord : keys() rend l'ordre d'insertion)
    for (let i = 0; i < keys.length - ART_MAX; i++) await cache.delete(keys[i]);
  } catch {
    /* tant pis */
  }
  trimming = false;
}

async function pageNetworkFirst(req) {
  // (pas de copie locale : rien à servir en repli → le réseau, sans délai imposé, comme sans service worker)
  const have = await caches.open(APP).then((c) => c.match(PAGE)).catch(() => undefined);
  if (!have) {
    const res = await fetch(req);
    if (storable(res, true)) void stash(APP, PAGE, res.clone());
    return res;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  try {
    const res = await fetch(req, { signal: ctl.signal });
    clearTimeout(timer);
    if (storable(res, true)) void stash(APP, PAGE, res.clone());
    return res;
  } catch (e) {
    clearTimeout(timer);
    const hit = await caches.open(APP).then((c) => c.match(PAGE));
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // (une revalidation demandée par la page — bundle.ts après un patch — va au réseau, pas à notre copie)
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const nav = req.mode === 'navigate';
  if (!nav && (req.cache === 'no-cache' || req.cache === 'reload' || req.cache === 'no-store')) return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const p = url.pathname.slice(SCOPE.pathname.length);
  if (nav) {
    if (p === 'jeu/' || p === 'jeu/index.html') e.respondWith(pageNetworkFirst(req));
    return;
  }
  if (p.startsWith('assets/') || p.startsWith('fx/') || p.startsWith('audio/') || p.startsWith('icons/')) e.respondWith(cacheFirst(APP, req));
  else if (p.startsWith('art/') && url.searchParams.has('v')) e.respondWith(cacheFirst(ART, req));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => /^bebou-(app|art)-/.test(k) && k !== APP && k !== ART).map((k) => caches.delete(k))))
      .catch(() => {})
      .then(() => self.clients.claim()),
  ),
);

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
