import { BUILD_ID } from '../core/canal';
import { siteUrl } from '../core/siteRoot';

/**
 * LE JEU INSTALLÉ SUR L'APPAREIL (V2 fluidité, lot 1) — comme le téléchargement de premier lancement d'un jeu mobile.
 *
 * Le build écrit `/precache.json` (vite.config.ts) : chaque fichier du jeu, sa taille, son palier.
 *   palier 0 = socle (déjà téléchargé par la page elle-même quand on arrive ici : le ranger ne coûte aucun octet) ;
 *   palier 1 = le reste du jeu (pages, scènes 6★, polices) ; palier 2 = médias lourds des scènes spéciales.
 * Ce module range ces fichiers dans Cache Storage (`bebou-app-v1`), que le service worker (public/sw.js) sert ensuite
 * AVANT le réseau : démarrages suivants sans téléchargement, jeu qui s'ouvre hors connexion, plus de re-téléchargement
 * quand le téléphone vide son cache HTTP.
 *
 * Coût serveur : en baisse. Un fichier n'est demandé qu'une fois par appareil et par version (noms à empreinte) ;
 * après un patch seuls les fichiers CHANGÉS sont repris, les fichiers disparus sont effacés. Tout vient de Cloudflare
 * Pages (fichiers statiques) : rien ne passe par Convex ni par la fonction R2.
 *
 * Reprise après coupure : rien à faire — à chaque lancement on ne télécharge que ce qui manque.
 * Stockage refusé, plein, navigation privée, vieux navigateur : on s'arrête sans bruit, le jeu marche comme avant.
 */
const APP = 'bebou-app-v1';
const ID_KEY = 'bebou.bundle.id';

type Entry = readonly [file: string, size: number, tier: number];
export interface BundleState {
  /** rien à faire ici (dev, navigateur sans service worker / Cache Storage, stockage refusé) */
  off: boolean;
  total: number;
  done: number;
  /** tout le manifeste est sur l'appareil */
  complete: boolean;
}
const state: BundleState = { off: false, total: 0, done: 0, complete: false };
export const bundleState = (): Readonly<BundleState> => state;

const idle = (ms = 2000) => new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: ms }) : setTimeout(r, 200)));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let started = false;
/** À appeler une fois la boutique affichée. `busy` : une animation est en cours (ouverture de booster) → on patiente. */
export function installBundle(busy: () => boolean = () => false): void {
  if (started || import.meta.env.DEV) return;
  started = true;
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    state.off = true;
    return;
  }
  // (même fichier et même portée que les notifications : un seul service worker — game/notif.ts)
  navigator.serviceWorker.register(siteUrl('sw.js'), { scope: siteUrl('') }).catch(() => undefined);
  void run(busy).catch(() => {
    state.off = true;
  });
}

async function run(busy: () => boolean) {
  const res = await fetch(`${siteUrl('precache.json')}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return;
  const man = (await res.json()) as { id: string; files: Entry[] };
  if (!man?.id || !Array.isArray(man.files)) return;
  // un patch est sorti et cette page tourne encore sur l'ancienne version : on ne touche à rien (effacer « ce qui
  // n'est plus dans le manifeste » scierait les fichiers dont elle a besoin) — la page rechargée fera le travail
  if (man.id !== BUILD_ID) return;
  const cache = await caches.open(APP);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const abs = (f: string) => new URL(siteUrl(f)).href;
  let lastId = '';
  try {
    lastId = localStorage.getItem(ID_KEY) ?? '';
  } catch {
    /* stockage indisponible */
  }
  const patched = lastId !== man.id;
  const wanted = new Set(man.files.map(([f]) => abs(f)));
  // différentiel : ce qui n'est plus dans le manifeste s'en va (anciennes versions des fichiers à empreinte)
  for (const url of have) if (!wanted.has(url)) void cache.delete(url);

  // économie de données / 2G : le socle seulement ; stockage presque plein : pas les médias lourds
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  let maxTier = conn?.saveData || /2g/.test(conn?.effectiveType ?? '') ? 0 : 2;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.quota - (est.usage ?? 0) < 40e6) maxTier = Math.min(maxTier, 1);
  } catch {
    /* pas d'estimation : on tente */
  }
  // (un fichier sans empreinte — hors /assets/ — peut avoir changé à un patch : revalidé une fois par version)
  const hashed = (f: string) => f.startsWith('assets/');
  // (… y compris ceux d'un palier qu'on ne télécharge plus ici : une copie déjà rangée ne doit pas rester périmée)
  const todo = man.files.filter(([f, , t]) => (t <= maxTier && !have.has(abs(f))) || (patched && !hashed(f) && (t <= maxTier || have.has(abs(f)))));
  state.total = man.files.reduce((n, f) => n + (f[2] <= maxTier ? f[1] : 0), 0);
  state.done = state.total - todo.reduce((n, f) => n + f[1], 0);

  // que le navigateur ne vide pas ce cache tout seul (accordé sans question par Chrome / Safari selon l'usage du site)
  void navigator.storage?.persist?.().catch(() => undefined);

  let stop = false;
  const one = async ([f, size, tier]: Entry) => {
    if (stop) return;
    if (tier > 0) {
      // jamais pendant une ouverture ni onglet caché ; et seulement quand le fil principal respire
      while (busy() || document.visibilityState === 'hidden') await wait(600);
      await idle();
    }
    try {
      // palier 0 et fichiers à empreinte : le cache HTTP répond s'il les a (aucun octet) ; sinon un seul téléchargement
      // (la page : demandée sous son adresse de navigation `jeu/` — une réponse redirigée ne peut pas servir de page)
      const page = f === 'jeu/index.html';
      const r = await fetch(page ? abs('jeu/') : abs(f), hashed(f) || page ? undefined : { cache: 'no-cache' });
      const html = /text\/html/.test(r.headers.get('content-type') ?? '');
      if (!r.ok || r.status !== 200 || r.redirected || html !== page) return;
      await cache.put(abs(f), r);
      state.done += size;
    } catch (e) {
      // quota : inutile d'insister ; réseau coupé : on reprendra au prochain lancement
      if ((e as Error)?.name === 'QuotaExceededError' || !navigator.onLine) stop = true;
    }
  };
  // palier par palier, 3 fichiers de front (le socle d'un trait : il est déjà dans le cache HTTP)
  for (const tier of [0, 1, 2]) {
    const queue = todo.filter((f) => f[2] === tier);
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) await one(f);
    }));
    if (stop) return;
  }
  state.complete = maxTier === 2 && state.done >= state.total;
  try {
    localStorage.setItem(ID_KEY, man.id);
  } catch {
    /* stockage indisponible */
  }
}
