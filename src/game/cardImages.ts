import { ensureCardFonts, gameDesignId, generateCardArtAsync, releaseCardImage } from '../core/art';
import { FONT_VERSION } from '../core/fonts';
import { canvasToBlob, loadCardImage } from '../core/art/images';
import { cardById } from '../core/cardData';
import type { RarityId } from '../core/rarity';
import { catalogEntry, hasArt, isWonderId, numberingSize, subthemeById, thumbPath, wonderCapturePath } from '../core/sets/themes';
import { siteUrl } from '../core/siteRoot';


/**
 * Vraies cartes en 2D pour les grilles (collection, récap d'ouverture, échanges) : le MÊME gabarit que la carte 3D
 * (« Pleine illustration », ou le sceau des Bébous), peint en petit à partir de la miniature WebP de l'illustration.
 *  - paresseux : une tuile n'est peinte que lorsqu'elle entre à l'écran (IntersectionObserver) ;
 *  - étalé : une carte à la fois, pendant que le navigateur est libre (≈ 5–15 ms chacune) → le défilement reste fluide ;
 *  - en cache : en mémoire pour la session, et dans le Cache Storage du navigateur pour les visites suivantes.
 * Tant que la vraie carte n'est pas prête, la tuile garde son aperçu (illustration + étoiles).
 */
/**
 * (audit 06/11) la taille suit l'écran : une tuile fait 112–150 px CSS → jusqu'à 342 px physiques en DPR 3 ; peinte à
 * 276 px elle était agrandie ×1,22 (floue). 0,36 = 276 px (DPR ≤ 2, réduite = nette) · 0,45 (DPR 2,6) · 0,5 = 384 px
 * (DPR 3). Entre dans la clé du cache.
 */
// (retours Hugo 10/11) tuiles de collection plus grandes (~170 px au lieu de 120) : définition peinte en rapport
const SCALE = Math.max(0.36, Math.min(0.5, Math.ceil(((170 * Math.min(3, Math.max(1, window.devicePixelRatio || 1))) / 768) * 20) / 20));
/**
 * Cache persistant (Cache Storage du navigateur) : une carte peinte une fois s'affiche instantanément aux visites
 * suivantes. ⚠️ Changer ce numéro quand le gabarit des cartes change (fullart.ts, bebou.ts, polices…) : les anciennes
 * images sont alors jetées. La clé contient aussi le nom, le numéro et la taille du sous-thème (« 025 / 1025 »).
 */
const CACHE = 'bebou-cartes-v12'; // v12 (10/11, retours Hugo) : 5★ toujours en pleine illustration, tuiles plus grandes · v11 (08/11) : visages recadrés (art/faceFocus.json) · v10 (07/11) : 6★ toujours en pleine illustration · v9 (retours live 6) : adresses d'images versionnées (?v=, clé = adresse de la miniature), même gabarit que la 3D (Merveilles), Suisse pour toutes les photos non portrait, zéro effet, sans emblème · v8 (07/11 soir) : full-art sans bordure, Suisse paysage sans filets (numéro noir, étoiles 6★ en alu) · v7 (07/11) : cartes horizontales au gabarit Suisse (labo 035) · v6 (06/11 soir) : vignette « mini » (nom, étoiles, numéro), textes ≥ 30 px, Inter · v5 (06/11) : gabarit Paysage, familles inversées · v4 (05/11) : famille / sous-famille / artiste imprimés, polices Bold Frame — toutes les cartes repeintes
// (bug du « placeholder fantôme » : une carte peinte en design typographique avant d'avoir son illustration restait
// figée ainsi dans le cache du joueur, même après l'ajout de l'image)
/**
 * Cartes déjà peintes : clé → URL `blob:` (≈ 15–25 Ko chacune). Cache BORNÉ (audit PERF1-01) : au-delà de DONE_MAX,
 * les plus anciennes non affichées sont oubliées (URL révoquée) ; elles reviennent du Cache Storage si on y repasse.
 */
const done = new Map<string, string>();
const DONE_MAX = matchMedia('(pointer: coarse)').matches ? 240 : 600;
/** lu = remis en fin de file (le plus récent) */
function recall(key: string): string | undefined {
  const url = done.get(key);
  if (url !== undefined) (done.delete(key), done.set(key, url));
  return url;
}
function remember(key: string, url: string) {
  done.delete(key);
  done.set(key, url);
  if (done.size <= DONE_MAX) return;
  // URLs encore affichées (tuiles, cases des contrats…) : on les garde (une URL révoquée ne se recharge plus)
  const shown = new Set([...document.querySelectorAll<HTMLImageElement>('img[src^="blob:"]')].map((i) => i.getAttribute('src')));
  for (const [k, u] of done) {
    if (done.size <= DONE_MAX) break;
    if (shown.has(u)) continue;
    done.delete(k);
    URL.revokeObjectURL(u);
  }
}
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
  const st = subthemeById(e.subthemeId);
  const size = st ? numberingSize(st) : 0;
  // l'illustration ACTUELLE fait partie de la clé : quand une carte reçoit (ou change d')image, l'ancienne version peinte
  // n'est plus jamais servie — la carte est repeinte depuis la fiche du catalogue
  // (retours live 6, B2) l'ADRESSE versionnée de la miniature (`?v=`) : une image remplacée = une autre clé
  return `${location.origin}/__cartes/${encodeURIComponent(`${key}|${e.num}/${size}|${e.name}|${isWonderId(id) ? wonderCapturePath(id) : hasArt(e) ? thumbPath(e) : ''}|${e.art ?? ''}|${SCALE}|${FONT_VERSION}`)}`;
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

/** peintures en cours par miniature source (on ne la libère que quand plus personne ne s'en sert) */
const painting = new Map<string, number>();
async function paint(key: string): Promise<string | null> {
  const [id, rarity] = key.split('|') as [string, RarityId];
  const e = catalogEntry(id);
  if (!e) return null;
  // (retours live 04) Merveille : la capture statique de son design 3D est déjà la carte entière (cadre compris) — pas de
  // peinture ; repli sur la carte peinte si la capture manque
  if (isWonderId(id)) {
    try {
      const r = await fetch(siteUrl(wonderCapturePath(id)));
      if (r.ok) {
        const blob = await r.blob();
        void toCache(key, blob);
        return URL.createObjectURL(blob);
      }
    } catch {
      /* réseau : on peint la carte comme avant */
    }
  }
  const cd = cardById(id);
  // (carte Jeux vidéo sans illustration : rien à télécharger, le design typographique est peint directement)
  const thumb = hasArt(e) ? siteUrl(thumbPath(e)) : undefined;
  if (thumb) painting.set(thumb, (painting.get(thumb) ?? 0) + 1);
  try {
    return await paintWith(key, id, rarity, cd, thumb);
  } finally {
    if (thumb) {
      const n = (painting.get(thumb) ?? 1) - 1;
      if (n > 0) painting.set(thumb, n);
      else {
        painting.delete(thumb);
        // la carte 2D est faite (blob) : la toile de la miniature détourée est rendue tout de suite (lot E, PERF1-01)
        releaseCardImage(thumb);
      }
    }
  }
}
const idleYield = () => new Promise<void>((r) => idle(() => r()));
const tileStats = new Map<string, { n: number; bytes: number }>();
/** Formats des tuiles peintes depuis le démarrage (pour le rapport ?diag) : « image/webp ×42 (18 Ko en moyenne) ». */
export function tileFormats(): string {
  if (!tileStats.size) return 'aucune tuile peinte';
  return [...tileStats].map(([t, f]) => `${t || 'type inconnu'} ×${f.n} (${Math.round(f.bytes / f.n / 1024)} Ko en moyenne)`).join(', ');
}
async function paintWith(key: string, id: string, rarity: RarityId, cd: ReturnType<typeof cardById>, thumb: string | undefined): Promise<string | null> {
  // téléchargement (en parallèle des autres), puis la peinture elle-même quand le navigateur est libre
  await Promise.all([ensureCardFonts(), thumb ? loadCardImage(thumb, { key: !(cd.photo || cd.cover) }).catch(() => undefined) : undefined]);
  await new Promise<void>((r) => idle(() => r()));
  // (retours live 6, B2) même gabarit que la carte 3D de la vue détail (gameDesignId), plus jamais un gabarit à part
  const design = gameDesignId(cd);
  // (mesure 07/11 : tâches de 316 ms sur Android) peinture découpée en étapes, la main rendue entre chacune
  const art = await generateCardArtAsync(thumb ? { ...cd, image: thumb } : cd, rarity, { scale: SCALE, flatOnly: true, mini: true, ...(design ? { design } : {}) }, idleYield);
  const blob = await canvasToBlob(art.canvases.flat, 'image/webp', 0.86);
  // (audit 12/11, décision 3 / E3-07) format RÉELLEMENT rendu : un navigateur qui n'encode pas le WebP rend du PNG,
  // bien plus lourd — noté pour le rapport ?diag avant de décider d'un repli JPEG
  if (blob) {
    const f = tileStats.get(blob.type) ?? { n: 0, bytes: 0 };
    f.n++;
    f.bytes += blob.size;
    tileStats.set(blob.type, f);
  }
  art.dispose();
  // la mémoire d'un canvas n'est rendue qu'au ramasse-miettes… sauf si on le vide (iOS plafonne le total : PERF1-01)
  for (const c of Object.values(art.canvases)) {
    c.width = 0;
    c.height = 0;
  }
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
  const show = () => {
    // (11/11) carte horizontale (KCDQ Teto) : montrée entière, couchée dans la tuile, au lieu d'être rognée
    img.classList.toggle('land', img.naturalWidth > img.naturalHeight);
    tile.classList.add('real-on', ...(instant ? ['real-now'] : []));
    // (audit 06/11) l'aperçu (dégradé + miniature filtrée + méta) ne sert plus : retiré du DOM après le fondu
    // (≈ 10 nœuds et un calque `drop-shadow` de moins par tuile)
    setTimeout(() => {
      if (tile.isConnected && tile.classList.contains('real-on')) tile.querySelectorAll(':scope > .art, :scope > .meta').forEach((n) => n.remove());
    }, instant ? 0 : 500);
  };
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
      const hit = recall(key);
      if (hit) {
        alive.forEach((t) => apply(t, hit));
        continue;
      }
      if (!alive.length) continue;
      try {
        const url = (await fromCache(key)) ?? (await paint(key));
        if (url) {
          remember(key, url);
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
  const url = recall(key);
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
  const hit = recall(key);
  if (hit) return hit;
  try {
    const url = (await fromCache(key)) ?? (await paint(key));
    if (url) remember(key, url);
    return url;
  } catch {
    return null;
  }
}

/** Vraie carte déjà peinte (en mémoire), ou null : pour des vignettes qui n'attendent pas (cases des contrats…). */
export const paintedCard = (cardId: string, rarity: string): string | null => recall(`${cardId}|${rarity}`) ?? null;

let io: IntersectionObserver | null = null;
/** Demande la vraie carte d'une tuile dès qu'elle approche de l'écran. */
export function observeRealCard(tile: HTMLElement) {
  const key = tile.dataset.real;
  const hit = key ? recall(key) : undefined;
  if (hit) return apply(tile, hit, true);
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
