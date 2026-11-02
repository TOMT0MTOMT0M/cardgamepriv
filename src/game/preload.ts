import { ensureCardImages } from '../core/art';
import { cardById } from '../core/cardData';
import { catalogEntry, type CatalogEntry } from '../core/sets/themes';
import { thumbUrl } from './ui';

/**
 * Préchargement des images.
 *  - Miniatures (grilles) : WebP de ~12 Ko, chargées par lots en tâche de fond quand le navigateur est inactif, en
 *    commençant par les cartes que le joueur possède → la collection s'affiche pleine, sans trous.
 *  - Illustrations pleine définition (3D) : celles des 5 cartes d'un pack sont chargées dès que le pack est tiré,
 *    pendant que le joueur brûle l'emballage (cf. scenes/opening.ts), puis gardées en cache (détourage + palette).
 * Le cache HTTP (public/_headers) fait le reste aux visites suivantes.
 */
const done = new Set<string>();
const queue: string[] = [];
let running = false;

const idle = (cb: () => void) =>
  'requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void, o?: object) => void }).requestIdleCallback(cb, { timeout: 800 }) : setTimeout(cb, 60);

function loadOne(url: string): Promise<void> {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => res();
    img.src = url;
  });
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const batch = queue.splice(0, 12);
    await Promise.all(batch.map(loadOne));
    await new Promise<void>((r) => idle(r));
  }
  running = false;
}

/** Ajoute des miniatures à précharger (priorité = en tête de file). */
export function preloadThumbs(entries: Iterable<CatalogEntry | undefined>, priority = false) {
  const urls: string[] = [];
  for (const e of entries) {
    if (!e || e.rarity === 'secret') continue; // les Bébous non possédés restent secrets (jamais chargés en avance)
    const u = thumbUrl(e);
    if (done.has(u)) continue;
    done.add(u);
    urls.push(u);
  }
  if (priority) queue.unshift(...urls);
  else queue.push(...urls);
  void pump();
}

/** Miniatures des cartes possédées (y compris Bébous possédés), en priorité. */
export function preloadOwned(cardIds: Iterable<string>) {
  const list: CatalogEntry[] = [];
  for (const id of cardIds) {
    const e = catalogEntry(id);
    if (!e) continue;
    if (e.rarity === 'secret') {
      const u = thumbUrl(e);
      if (!done.has(u)) (done.add(u), queue.unshift(u));
    } else list.push(e);
  }
  preloadThumbs(list, true);
}

/** Illustrations pleine définition des cartes d'un pack (avant même que le joueur ait fini d'ouvrir). */
export function preloadArt(cardIds: string[]): Promise<unknown> {
  return ensureCardImages(cardIds.map((id) => cardById(id)));
}
