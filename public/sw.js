/* Service worker du jeu (V2).
   1. NOTIFICATIONS PUSH : reçoit la notification même jeu fermé, l'affiche, et un toucher ouvre la bonne page.
   2. JEU INSTALLÉ SUR L'APPAREIL (fluidité, lot 1) : sert depuis Cache Storage ce que la page y a rangé
      (src/game/bundle.ts, d'après /precache.json) → démarrage sans réseau, même hors connexion, et qui résiste au
      ménage du cache HTTP (iPhone). Règles, volontairement étroites :
      - /assets/* (noms à empreinte, immuables) et médias du manifeste (/fx, /audio, /icons) : cache d'abord ;
        (/assets/* est de plus déclaré en ROUTE STATIQUE à l'install — Chrome / Edge 123+ : le navigateur lit le cache
        lui-même, sans réveiller ni solliciter ce fichier ; entrée absente → réseau, vérifié sur Chrome 153. Le
        remplissage de ce cache pour /assets/* est alors fait par la page (bundle.ts), pas par ce fichier. Rien d'autre
        n'est routé : /art et /bake sont rangés par ce fichier, /fx /audio /icons se revalident par la page) ;
      - /art/*?v=… (images versionnées, immuables) : cache d'abord, gardées au fil de l'usage (plafonnées) →
        moins d'appels à la fonction R2, jamais plus ; celles de « Tout télécharger » (bebou-garde-v1) d'abord ;
      - /models/* (Merveilles 3D, palier 3 du manifeste) : cache d'abord ;
      - /bake/*?v=… (déchirure simulée, versionnée) : cache d'abord ;
      - la page /jeu/ : RÉSEAU d'abord (3 s max), copie locale en repli → un patch est vu tout de suite ; la requête
        réseau part pendant le réveil de ce fichier (Navigation Preload : `preloadResponse`, une seule requête) ;
      - /version.json, /precache.json, /sw.js, le labo, les requêtes partielles (Range) et tout le reste : jamais touchés
        (les autres PAGES, labo compris, ne font que reprendre la réponse du préchargement de navigation, sans rien garder).
      Une réponse n'est rangée que si elle est correcte (200, même origine, pas une page HTML à la place d'un fichier).
      Le ménage ne touche que les caches de ce fichier : ceux de la page (bebou-cartes-*, bebou-plis, bebou-nom-moule) restent. */
const APP = 'bebou-app-v1';
const ART = 'bebou-art-v1';
// (audit 12/11, décision 9 / A2-03) plafond en POIDS : ce cache range les miniatures (≈ 12 Ko) ET les illustrations en
// pleine définition (jusqu'à plusieurs centaines de Ko) ; 1 800 entrées pouvaient donc peser 25 Mo comme plusieurs
// centaines. 150 Mo au plus, et jamais plus de 15 % de la place que le navigateur accorde au site ; le nombre
// d'entrées ne sert plus que de garde-fou.
const ART_MAX_BYTES = 150 * 1024 * 1024;
const ART_MAX = 8000;
const ART_GUESS = 60 * 1024; // (entrée rangée avant ce changement, sans poids noté)
const KEEP = 'bebou-garde-v1'; // (V2) illustrations téléchargées pour jouer hors connexion (src/game/offline.ts)
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
    if (name === ART) void stashArt(req.url, res.clone());
    else void stash(name, req.url, res.clone());
  }
  return res;
}

/** (V2) « Tout télécharger » (src/game/offline.ts) range les illustrations de la collection dans KEEP, jamais élagué :
 *  servies de là d'abord, sinon le cache ordinaire (plafonné). */
async function keepThen(name, req) {
  const hit = await caches.open(KEEP).then((c) => c.match(req.url)).catch(() => undefined);
  return hit || cacheFirst(name, req);
}

/** Illustration rangée avec son poids en en-tête (`x-bytes`) : le ménage additionne sans relire les fichiers. */
async function stashArt(key, res) {
  try {
    const blob = await res.blob();
    const headers = new Headers(res.headers);
    headers.set('x-bytes', String(blob.size));
    headers.delete('content-encoding'); // (le corps rangé est déjà décodé)
    headers.set('content-length', String(blob.size));
    await stash(ART, key, new Response(blob, { status: 200, headers }));
  } catch {
    /* tant pis : servie par le réseau */
  }
  void trimArt();
}

let trimming = false;
let sinceTrim = 0;
async function trimArt() {
  if (trimming || ++sinceTrim < 60) return;
  trimming = true;
  sinceTrim = 0;
  try {
    const cache = await caches.open(ART);
    // (les plus anciennes d'abord : keys() et matchAll() rendent l'ordre d'insertion ; matchAll ne lit que les en-têtes)
    const [keys, all] = await Promise.all([cache.keys(), cache.matchAll()]);
    const bytes = all.map((r) => +(r.headers.get('x-bytes') || r.headers.get('content-length') || 0) || ART_GUESS);
    let total = bytes.reduce((a, b) => a + b, 0);
    let max = ART_MAX_BYTES;
    try {
      const est = await self.navigator.storage.estimate();
      if (est && est.quota) max = Math.min(max, est.quota * 0.15);
    } catch {
      /* pas d'estimation : plafond fixe */
    }
    const n = Math.min(keys.length, bytes.length);
    for (let i = 0; i < n && (total > max || keys.length - i > ART_MAX); i++) {
      await cache.delete(keys[i]);
      total -= bytes[i];
    }
  } catch {
    /* tant pis */
  }
  trimming = false;
}

async function pageNetworkFirst(req, preload) {
  // (preload : requête réseau déjà partie pendant le réveil du service worker — Navigation Preload ; `undefined` s'il
  // n'y en a pas. On la consomme au lieu d'en refaire une : une seule requête. Elle ne s'annule pas : le délai de 3 s
  // se fait donc par une course, et le signal ne sert qu'à la requête que nous aurions lancée nous-mêmes.)
  const ctl = new AbortController();
  const net = Promise.resolve(preload)
    .catch(() => undefined)
    .then((pre) => pre || fetch(req, { signal: ctl.signal }));
  net.catch(() => {}); // (si le délai l'emporte, l'échec tardif n'est pas une erreur non gérée)
  const have = await caches.open(APP).then((c) => c.match(PAGE)).catch(() => undefined);
  // (pas de copie locale : rien à servir en repli → le réseau, sans délai imposé, comme sans service worker)
  let timer;
  try {
    const res = await (have
      ? Promise.race([net, new Promise((_, no) => (timer = setTimeout(() => (ctl.abort(), no(new Error('lent'))), 3000)))])
      : net);
    clearTimeout(timer);
    // (la copie locale de la page est rangée par bundle.ts, APRÈS les fichiers qu'elle nomme : rangée ici dès la
    // navigation, elle pouvait, après un patch, pointer hors connexion vers des fichiers pas encore installés)
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (have) return have;
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
    if (p === 'jeu/' || p === 'jeu/index.html') e.respondWith(pageNetworkFirst(req, e.preloadResponse));
    // (le préchargement de navigation vaut pour TOUTE page du site : sans réponse de notre part, le navigateur referait
    // la requête → les autres pages — le labo… — la reprennent telle quelle, sans rien en garder)
    else e.respondWith(Promise.resolve(e.preloadResponse).then((pre) => pre || fetch(req)));
    return;
  }
  if (p.startsWith('assets/') || p.startsWith('fx/') || p.startsWith('audio/') || p.startsWith('icons/') || p.startsWith('models/')) e.respondWith(cacheFirst(APP, req));
  else if (p.startsWith('art/') && url.searchParams.has('v')) e.respondWith(keepThen(ART, req));
  // (10/11) déchirure simulée : enregistrements versionnés (?v=, core/tearBake.ts BAKE_REV), ~1,2 Mo chacun
  else if (p.startsWith('bake/') && url.searchParams.has('v')) e.respondWith(cacheFirst(APP, req));
});

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Route statique (Chrome / Edge 123+) : /assets/* (noms à empreinte, immuables) lu dans le cache par le navigateur
  // lui-même. Entrée absente → réseau ; une erreur ici (navigateur sans la fonction, règle refusée) ne gêne rien :
  // le gestionnaire `fetch` ci-dessus reste la voie de repli.
  if (typeof e.addRoutes === 'function') {
    e.waitUntil(
      Promise.resolve()
        .then(() => e.addRoutes({ condition: { urlPattern: new URL('assets/*', SCOPE).href, requestMethod: 'get' }, source: { cacheName: APP } }))
        .catch(() => {}),
    );
  }
});
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => /^bebou-(app|art)-/.test(k) && k !== APP && k !== ART).map((k) => caches.delete(k))))
      .catch(() => {})
      .then(() => self.registration.navigationPreload?.enable().catch(() => {}))
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
      icon: new URL('icons/booster-192.png', base).href,
      badge: new URL('icons/booster-192.png', base).href,
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
