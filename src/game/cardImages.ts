import { ensureCardFonts, generateCardArt } from '../core/art';
import { loadCardImage } from '../core/art/images';
import { cardById } from '../core/cardData';
import type { RarityId } from '../core/rarity';
import { catalogEntry, hasArt, subthemeById, thumbPath } from '../core/sets/themes';
import { siteUrl } from '../core/siteRoot';

/**
 * Vraies cartes en 2D pour les grilles (collection, récap d'ouverture, échanges) : le MÊME gabarit que la carte 3D
 * (« Pleine illustration », ou le sceau des Bébous), peint en petit à partir de la miniature WebP de l'illustration.
 *  - paresseux : une tuile n'est peinte que lorsqu'elle entre à l'écran (IntersectionObserver) ;
 *  - étalé : une carte à la fois, pendant que le navigateur est libre (≈ 5–15 ms chacune) → le défilement reste fluide ;
 *  - en cache : en mémoire pour la session, et dans le Cache Storage du navigateur pour les visites suivantes.
 * Tant que la vraie carte n'est pas prête, la tuile garde son aperçu (illustration + étoiles).
 */
const SCALE = 0.36; // 276 × 386 px : net dans une tuile de ~130 px en DPR 2–3
/**
 * Cache persistant (Cache Storage du navigateur) : une carte peinte une fois s'affiche instantanément aux visites
 * suivantes. ⚠️ Changer ce numéro quand le gabarit des cartes change (fullart.ts, bebou.ts, polices…) : les anciennes
 * images sont alors jetées. La clé contient aussi le nom, le numéro et la taille du sous-thème (« 025 / 1025 »).
 */
const CACHE = 'bebou-cartes-v1';
const done = new Map<string, string>();
const waiting = new Map<string, Set<HTMLElement>>();
const queue: string[] = [];
let workers = 0;
const MAX_WORKERS = 2; // l'un télécharge la miniature pendant que l'autre peint

type Deadline = { timeRemaining(): number; didTimeout: boolean };
const idle = (cb: (d: Deadline) => void) =>
  'requestIdleCallback' in window
    ? (window as unknown as { requestIdleCallback: (f: (d: Deadline) => void, o?: object) => void }).requestIdleCallback(cb, { timeout: 1000 })
    : setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: false }), 16);

const hasCache = typeof caches !== 'undefined' && window.isSecureContext;
let cacheP: Promise<Cache | null> | null = null;
function cacheStore(): Promise<Cache | null> {
  if (!hasCache) return Promise.resolve(null);
  return (cacheP ??= (async () => {
    try {
      // ménage : les caches d'un ancien gabarit
      for (const k of await caches.keys()) if (k.startsWith('bebou-cartes-') && k !== CACHE) void caches.delete(k);
      return await caches.open(CACHE);
    } catch {
      return null;
    }
  })());
}
function cacheUrl(key: string): string | null {
  const [id] = key.split('|');
  const e = catalogEntry(id);
  if (!e) return null;
  const size = subthemeById(e.subthemeId)?.cards.length ?? 0;
  return `${location.origin}/__cartes/${encodeURIComponent(`${key}|${e.num}/${size}|${e.name}|${SCALE}`)}`;
}
async function fromCache(key: string): Promise<string | null> {
  const url = cacheUrl(key);
  const c = url && (await cacheStore());
  if (!c || !url) return null;
  try {
    const r = await c.match(url);
    return r ? URL.createObjectURL(await r.blob()) : null;
  } catch {
    return null;
  }
}
async function toCache(key: string, blob: Blob) {
  const url = cacheUrl(key);
  const c = url && (await cacheStore());
  if (!c || !url) return;
  try {
    await c.put(url, new Response(blob, { headers: { 'content-type': 'image/webp' } }));
  } catch {
    /* quota plein : tant pis, on repeindra */
  }
}

async function paint(key: string): Promise<string | null> {
  const [id, rarity] = key.split('|') as [string, RarityId];
  const e = catalogEntry(id);
  if (!e) return null;
  const cd = cardById(id);
  // (carte Jeux vidéo sans illustration : rien à télécharger, le design typographique est peint directement)
  const thumb = hasArt(e) ? siteUrl(thumbPath(e)) : undefined;
  // téléchargement (en parallèle des autres), puis la peinture elle-même quand le navigateur est libre
  await Promise.all([ensureCardFonts(), thumb ? loadCardImage(thumb, { key: !(cd.photo || cd.cover) }).catch(() => undefined) : undefined]);
  await new Promise<void>((r) => idle(() => r()));
  const art = generateCardArt(thumb ? { ...cd, image: thumb } : cd, rarity, { scale: SCALE, flatOnly: true, ...(cd.set === 'bebous' ? {} : { design: 'full-art' }) });
  const blob = await new Promise<Blob | null>((r) => art.canvases.flat.toBlob(r, 'image/webp', 0.86));
  art.dispose();
  if (!blob) return null;
  void toCache(key, blob);
  return URL.createObjectURL(blob);
}

/**
 * Pose la vraie carte sur la tuile. `instant` : image déjà en mémoire (grille redessinée après un filtre, un clic…) →
 * affichée tout de suite, sans fondu (sinon toute la grille clignoterait à chaque changement).
 */
function apply(tile: HTMLElement, url: string, instant = false) {
  let img = tile.querySelector<HTMLImageElement>('img.real');
  if (!img) {
    img = document.createElement('img');
    img.className = 'real';
    img.alt = '';
    img.decoding = 'async';
    tile.prepend(img);
  }
  if (img.src === url) return;
  // la carte ne remplace l'aperçu qu'une fois son image décodée : jamais de tuile vide, même une fraction de seconde
  const show = () => tile.classList.add('real-on', ...(instant ? ['real-now'] : []));
  img.onload = show;
  img.src = url;
  if (img.complete && img.naturalWidth) show();
}

async function work() {
  workers++;
  try {
    while (queue.length) {
      const key = queue.shift()!;
      const tiles = waiting.get(key);
      waiting.delete(key);
      // tuiles sorties du DOM entre-temps (on a changé d'onglet) : inutile de peindre
      const alive = [...(tiles ?? [])].filter((t) => t.isConnected);
      if (done.has(key)) {
        alive.forEach((t) => apply(t, done.get(key)!));
        continue;
      }
      if (!alive.length) continue;
      try {
        const url = (await fromCache(key)) ?? (await paint(key));
        if (url) {
          done.set(key, url);
          // des tuiles ont pu demander la même carte pendant ce temps
          for (const t of [...alive, ...(waiting.get(key) ?? [])]) if (t.isConnected) apply(t, url);
          waiting.delete(key);
        }
      } catch (err) {
        console.warn('[cartes 2D]', key, err);
      }
    }
  } finally {
    workers--;
  }
}

function want(tile: HTMLElement) {
  const key = tile.dataset.real;
  if (!key) return;
  const url = done.get(key);
  if (url) return apply(tile, url, true);
  let set = waiting.get(key);
  if (!set) {
    waiting.set(key, (set = new Set()));
    queue.push(key);
  }
  set.add(tile);
  while (workers < MAX_WORKERS && queue.length) void work();
}

/**
 * Vraie carte en 2D (URL d'image), en l'attendant si besoin : mémoire → Cache Storage → peinture. Pour la scène de
 * recyclage des contrats, qui pose les cartes brûlées en 3D (la plupart sont déjà peintes : elles étaient dans la grille).
 */
export async function realCardUrl(cardId: string, rarity: string): Promise<string | null> {
  const key = `${cardId}|${rarity}`;
  const hit = done.get(key);
  if (hit) return hit;
  try {
    const url = (await fromCache(key)) ?? (await paint(key));
    if (url) done.set(key, url);
    return url;
  } catch {
    return null;
  }
}

/** Vraie carte déjà peinte (en mémoire), ou null : pour des vignettes qui n'attendent pas (cases des contrats…). */
export const paintedCard = (cardId: string, rarity: string): string | null => done.get(`${cardId}|${rarity}`) ?? null;

let io: IntersectionObserver | null = null;
/** Demande la vraie carte d'une tuile dès qu'elle approche de l'écran. */
export function observeRealCard(tile: HTMLElement) {
  const key = tile.dataset.real;
  if (key && done.has(key)) return apply(tile, done.get(key)!, true);
  io ??= new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io!.unobserve(en.target);
        want(en.target as HTMLElement);
      }
    },
    { rootMargin: '300px 0px' },
  );
  io.observe(tile);
}
