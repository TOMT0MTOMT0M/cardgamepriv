import { ensureCardImages } from '../core/art';
import { cardById } from '../core/cardData';
import { catalogEntry, type CatalogEntry } from '../core/sets/themes';
import { thumbUrl } from './ui';

/**
 * Préchargement des images.
 *  - Miniatures (grilles) : WebP de ~12 Ko, chargées par lots en tâche de fond quand le navigateur est inactif : la
 *    première page de la collection (les plus rares possédées), puis la page affichée par la grille — pas plus.
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

/** ordre de la vue « Cartes » (la plus rare en haut) : c'est elle qui s'ouvre en premier dans la collection */
const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
/** au plus une page de la vue Cartes (collection.ts : 60 par page) */
const OWNED_CAP = 60;
/** économie de données activée, ou réseau 2G : on ne précharge rien d'avance (le chargement paresseux suffit) */
function saveData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c?.saveData || /2g/.test(c?.effectiveType ?? '');
}

/**
 * Miniatures des cartes possédées, en priorité — mais seulement ce qui sera affiché bientôt (audit PERF2-04) : la
 * première page de la vue « Cartes » (les 60 plus rares, Bébous possédés compris), pas toute la collection à chaque
 * session (556 cartes ≈ 6,7 Mo ; 3 000 ≈ 36 Mo sur forfait mobile). Les pages suivantes sont demandées par la grille
 * elle-même (`preloadThumbs(page, true)`) et le reste par `loading="lazy"`.
 */
export function preloadOwned(cardIds: Iterable<string>) {
  if (saveData()) return;
  const seen = new Set<string>();
  const all: CatalogEntry[] = [];
  for (const id of cardIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = catalogEntry(id);
    if (e) all.push(e);
  }
  all.sort((a, b) => (RANK[b.rarity] ?? 0) - (RANK[a.rarity] ?? 0));
  const list: CatalogEntry[] = [];
  const secrets: string[] = [];
  for (const e of all.slice(0, OWNED_CAP)) {
    if (e.rarity === 'secret') {
      // Bébou POSSÉDÉ : preloadThumbs les ignore (secrets non possédés), on l'ajoute à la main
      const u = thumbUrl(e);
      if (!done.has(u)) (done.add(u), secrets.push(u));
    } else list.push(e);
  }
  preloadThumbs(list, true);
  if (secrets.length) (queue.unshift(...secrets), void pump());
}

/** Illustrations pleine définition des cartes d'un pack (avant même que le joueur ait fini d'ouvrir). */
export function preloadArt(cardIds: string[]): Promise<unknown> {
  return ensureCardImages(cardIds.map((id) => cardById(id)));
}
