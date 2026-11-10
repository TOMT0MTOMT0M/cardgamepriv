import type { CardData, CardPalette } from '../cardData';
import { ctx2d, onCanvasPressure, releaseCanvas } from './canvas';
import { analyzePixels, paletteFrom } from './imageProc';
import type { ImageJob, ProcessDone } from './imageWorker';

export { paletteFrom };

/**
 * Illustrations bitmap des cartes (`subject: 'image'`).
 *
 * Au chargement, chaque image est :
 *  1. détourée si son fond est blanc opaque (remplissage depuis les bords + trous fermés de fond blanc,
 *     bord adouci et « décontaminé » du blanc) — les sources 160×142 du set Pokémon arrivent ainsi ;
 *  2. recadrée sur son contenu (bbox alpha) ;
 *  3. analysée pour en tirer une palette (teinte dominante → ciel, halo, papier, encre).
 *
 * La génération des calques (generateCardArt) est synchrone : appeler `ensureCardImages` avant
 * (le shell précharge le set actif, `cardArtFor` le fait pour sa carte).
 */
export interface CardImage {
  url: string;
  /** illustration détourée et recadrée sur son contenu */
  canvas: HTMLCanvasElement;
  srcW: number;
  srcH: number;
  /** fond blanc opaque retiré à la volée */
  keyed: boolean;
  /** part des pixels retirés (fond + trous) */
  keyedRatio: number;
  /** source de petite taille (plus grand côté < 256 px) : sera agrandie, donc douce */
  lowRes: boolean;
  /** image pleine (quasi aucun pixel transparent) : photo classique, à cadrer plutôt qu'à faire flotter */
  opaque: boolean;
  /** teinte dominante (degrés) et chroma moyenne (0..1) */
  hue: number;
  chroma: number;
  palette: CardPalette;
}

export interface ImageReport {
  total: number;
  ok: number;
  failed: Array<{ url: string; error: string }>;
  keyed: number;
  lowRes: number;
  ms: number;
}

const pending = new Map<string, Promise<CardImage>>();
/** Illustrations prêtes, de la plus ancienne à la plus récemment utilisée (ordre d'insertion de la Map = LRU). */
const ready = new Map<string, CardImage>();
const errors = new Map<string, string>();

/**
 * Bornes mémoire (réglées par le jeu, cf. `configureArt`) : le labo garde tout (planche 038 = tout le set) ;
 * le jeu borne le cache en octets (chaque illustration = sa toile, + 2 silhouettes de même taille si on les garde :
 * tout était gardé à vie avant) et la taille traitée.
 */
export const imageLimits = { bytes: Infinity, maxSide: 2048, keepSilhouettes: true };
/** Toujours gardées, quel que soit le budget : les plus récentes (les 5 cartes d'un pack + la visionneuse). */
const MIN_KEEP = 6;
const releasers = new Set<(c: HTMLCanvasElement) => void>();

export function setImageLimits(o: { bytes?: number; maxSide?: number; keepSilhouettes?: boolean }): void {
  if (o.bytes != null) imageLimits.bytes = Math.max(4e6, o.bytes);
  if (o.maxSide != null) imageLimits.maxSide = Math.max(256, o.maxSide);
  if (o.keepSilhouettes != null) imageLimits.keepSilhouettes = o.keepSilhouettes;
  trimImageCache();
}

/** Appelé à l'éviction d'une illustration (les silhouettes de imageSubject.ts s'y libèrent). */
export function onImageEvicted(fn: (c: HTMLCanvasElement) => void): void {
  releasers.add(fn);
}

const cost = (im: CardImage) => im.canvas.width * im.canvas.height * 4 * (imageLimits.keepSilhouettes ? 3 : 1);

/**
 * Retire les illustrations les moins récemment utilisées tant que le cache dépasse le budget (`keep` = nombre maximal
 * d'entrées, 0 = tout vider en cas de manque de mémoire). Leurs toiles sont vidées tout de suite.
 */
export function trimImageCache(keep = Infinity): void {
  let total = 0;
  for (const im of ready.values()) total += cost(im);
  while (ready.size > 0 && (ready.size > keep || (total > imageLimits.bytes && ready.size > MIN_KEEP))) {
    const [url, im] = ready.entries().next().value as [string, CardImage];
    total -= cost(im);
    ready.delete(url);
    pending.delete(url); // on pourra la recharger (le navigateur la garde en cache HTTP)
    releasers.forEach((fn) => fn(im.canvas));
    releaseCanvas(im.canvas);
  }
}
/** Oublie une illustration dont on n'a plus besoin (miniature déjà peinte et mise en cache) : toile rendue tout de suite. */
export function releaseCardImage(url: string): void {
  const im = ready.get(url);
  if (!im) return;
  ready.delete(url);
  pending.delete(url);
  releasers.forEach((fn) => fn(im.canvas));
  releaseCanvas(im.canvas);
}

// mémoire des canvas saturée (iOS) : on ne garde que la plus récente (celle qu'on est peut-être en train de peindre)
onCanvasPressure(() => trimImageCache(1));

/** Image prête (ou null si pas encore chargée / en échec). */
export function cardImage(url: string | undefined): CardImage | null {
  if (!url) return null;
  const im = ready.get(url);
  if (!im) return null;
  // utilisée : passe en tête du LRU
  ready.delete(url);
  ready.set(url, im);
  return im;
}

export interface LoadOptions {
  /** détourer le fond blanc opaque (défaut : oui ; non pour les photos réelles, cf. `CardData.photo`) */
  key?: boolean;
}

export function loadCardImage(url: string, opts: LoadOptions = {}): Promise<CardImage> {
  let p = pending.get(url);
  if (!p) {
    p = (async () => {
      // (peinture des cartes) décodage + détourage + palette dans un worker : rien de lourd sur le fil principal ;
      // navigateur sans worker / OffscreenCanvas / createImageBitmap, ou échec → exactement le chemin d'avant
      const off = await loadOffThread(url, opts.key ?? true);
      if (off) {
        ready.set(url, off);
        trimImageCache();
        errors.delete(url);
        return off;
      }
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      try {
        await img.decode();
      } catch {
        // decode() échoue parfois sans raison quand beaucoup d'images arrivent en même temps : on se rabat sur le
        // chargement classique avant de déclarer l'image illisible
        await new Promise<void>((res, rej) => {
          if (img.complete) return img.naturalWidth > 0 ? res() : rej(new Error(`illustration introuvable ou illisible : ${url}`));
          img.onload = () => res();
          img.onerror = () => rej(new Error(`illustration introuvable ou illisible : ${url}`));
        });
      }
      const out = processImage(url, img, opts.key ?? true);
      ready.set(url, out);
      trimImageCache();
      errors.delete(url);
      return out;
    })();
    p.catch((e) => {
      errors.set(url, String((e as Error)?.message ?? e));
      pending.delete(url); // on pourra réessayer
    });
    pending.set(url, p);
  }
  return p;
}

/** Charge (en parallèle, limité) toutes les illustrations des cartes données. Ne rejette jamais. */
export async function ensureCardImages(cards: readonly CardData[], onProgress?: (done: number, total: number) => void): Promise<ImageReport> {
  const t0 = performance.now();
  // (double face) la seconde illustration se charge avec la première
  const urls = [...new Set(cards.flatMap((c) => [c.image, c.image2]).filter((u): u is string => !!u))];
  const noKey = new Set(cards.filter((c) => c.photo || c.cover).flatMap((c) => [c.image, c.image2]).filter((u): u is string => !!u));
  const todo = urls.filter((u) => !ready.has(u));
  let done = urls.length - todo.length;
  onProgress?.(done, urls.length);
  const queue = todo.slice();
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      try {
        await loadCardImage(u, { key: !noKey.has(u) });
      } catch {
        /* consigné dans errors */
      }
      onProgress?.(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, todo.length) }, worker));
  const okList = urls.map((u) => ready.get(u)).filter((x): x is CardImage => !!x);
  const failed = urls.filter((u) => !ready.has(u)).map((url) => ({ url, error: errors.get(url) ?? 'inconnu' }));
  if (failed.length) console.warn(`[art] ${failed.length} illustration(s) en échec`, failed);
  const report: ImageReport = {
    total: urls.length,
    ok: okList.length,
    failed,
    keyed: okList.filter((x) => x.keyed).length,
    lowRes: okList.filter((x) => x.lowRes).length,
    ms: Math.round(performance.now() - t0),
  };
  if (urls.length) lastReport = report;
  return report;
}

let lastReport: ImageReport | null = null;
// crochet de test (scripts/verify.cjs) — le shell n'est pas modifié
(globalThis as unknown as { __cardImages: unknown }).__cardImages = { report: () => lastReport, status: () => imageStatus() };

/** État de toutes les illustrations chargées (pour la planche de contrôle et les tests). */
export function imageStatus() {
  return {
    loaded: [...ready.values()].map(({ url, srcW, srcH, keyed, keyedRatio, lowRes, hue, chroma }) => ({ url, srcW, srcH, keyed, keyedRatio: +keyedRatio.toFixed(3), lowRes, hue: Math.round(hue), chroma: +chroma.toFixed(2) })),
    failed: [...errors.entries()].map(([url, error]) => ({ url, error })),
  };
}

// ───────────────────────────────────────────────── traitement

// ───────────────────────────────────────────────── traitement

function processImage(url: string, img: HTMLImageElement, allowKey = true): CardImage {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  // plafond : la carte n'affiche jamais plus de ~1 000 px d'illustration → inutile de détourer / analyser une photo de
  // 2 000 px en JS sur le thread principal (sources de 960 px : inchangées)
  const k = Math.min(1, imageLimits.maxSide / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const g = ctx2d(src, { willReadFrequently: true });
  if (k < 1) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
  } else g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h);
  // détourage (sur place), recadrage, teinte : calculs partagés avec le worker (imageProc.ts)
  const a = analyzePixels(id.data, w, h, allowKey);
  if (a.keyed) g.putImageData(id, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = a.cw;
  canvas.height = a.ch;
  ctx2d(canvas).drawImage(src, a.x0, a.y0, a.cw, a.ch, 0, 0, a.cw, a.ch);
  releaseCanvas(src); // toile de travail (getImageData) : sa mémoire est rendue tout de suite
  return imageFrom(url, canvas, nw, nh, w, h, a);
}

function imageFrom(url: string, canvas: HTMLCanvasElement, nw: number, nh: number, w: number, h: number, a: ReturnType<typeof analyzePixels>): CardImage {
  return {
    url,
    canvas,
    srcW: nw,
    srcH: nh,
    keyed: a.keyed,
    keyedRatio: a.removed / (w * h),
    lowRes: Math.max(nw, nh) < 256,
    opaque: a.clear / (w * h) < 0.01,
    hue: a.hue,
    chroma: a.chroma,
    palette: paletteFrom(a.hue, a.chroma, a.body),
  };
}

// ───────────────────────────────────────────────── worker (hors du fil principal)

/**
 * Un seul worker, créé à la 1re demande. `null` = indisponible (pas de Worker / OffscreenCanvas 2D / createImageBitmap,
 * sonde échouée, erreur du worker) : tout se fait alors comme avant sur le fil principal.
 */
interface OffThread {
  /** null = le worker n'a pas pu (image trop grande, erreur…) : l'appelant se replie */
  process(blob: Blob, allowKey: boolean): Promise<ProcessDone | null>;
  /** null = pas de WebP en worker, ou échec : l'appelant se replie */
  encode(bitmap: ImageBitmap, type: string, quality: number): Promise<Blob | null>;
  webp: boolean;
}
type JobBody = ImageJob extends infer J ? (J extends { id: number } ? Omit<J, 'id'> : never) : never;
let offP: Promise<OffThread | null> | null = null;
function offThread(): Promise<OffThread | null> {
  return (offP ??= (async () => {
    // bouton de secours (mesure / diagnostic) : localStorage['bebou.noImgWorker'] = '1'
    try {
      if (localStorage.getItem('bebou.noImgWorker') === '1') return null;
    } catch {
      /* stockage refusé : on continue */
    }
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return null;
    let w: Worker;
    try {
      w = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      return null;
    }
    let seq = 0;
    const waiting = new Map<number, (r: Record<string, unknown> | null) => void>();
    const failAll = () => {
      waiting.forEach((f) => f(null));
      waiting.clear();
    };
    w.onmessage = (e: MessageEvent<{ id: number } & Record<string, unknown>>) => {
      const f = waiting.get(e.data.id);
      if (!f) return;
      waiting.delete(e.data.id);
      f(e.data);
    };
    let dead = false;
    w.onerror = () => {
      dead = true;
      failAll();
      w.terminate();
    };
    const call = (job: JobBody, transfer: Transferable[] = [], ms = 20000) =>
      new Promise<Record<string, unknown> | null>((res) => {
        if (dead) return res(null);
        const id = ++seq;
        const timer = setTimeout(() => (waiting.delete(id), res(null)), ms);
        waiting.set(id, (r) => (clearTimeout(timer), res(r)));
        try {
          w.postMessage({ ...job, id }, transfer);
        } catch {
          clearTimeout(timer);
          waiting.delete(id);
          res(null);
        }
      });
    const pr = await call({ kind: 'probe' }, [], 8000);
    if (!pr?.ok) {
      dead = true;
      w.terminate();
      return null;
    }
    return {
      webp: !!pr.webp,
      async process(blob, allowKey) {
        const r = await call({ kind: 'process', blob, maxSide: imageLimits.maxSide, allowKey });
        return r?.ok ? (r as unknown as ProcessDone) : null;
      },
      async encode(bitmap, type, quality) {
        const r = await call({ kind: 'encode', bitmap, type, quality }, [bitmap]);
        return r?.ok ? ((r.blob as Blob | null) ?? null) : null;
      },
    };
  })());
}

/** Illustration décodée / détourée / analysée dans le worker, ou null (→ chemin d'avant, sur le fil principal). */
async function loadOffThread(url: string, allowKey: boolean): Promise<CardImage | null> {
  const w = await offThread();
  if (!w) return null;
  let blob: Blob;
  try {
    const r = await fetch(url);
    if (!r.ok) return null; // introuvable : le chemin d'avant produit l'erreur habituelle
    blob = await r.blob();
  } catch {
    return null;
  }
  const r = await w.process(blob, allowKey);
  if (!r) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = r.cw;
    canvas.height = r.ch;
    ctx2d(canvas).drawImage(r.bitmap, 0, 0);
    return imageFrom(url, canvas, r.nw, r.nh, r.nw, r.nh, r);
  } finally {
    r.bitmap.close();
  }
}

/**
 * Carte peinte (toile) → blob. L'encodage (et la rastérisation que `toBlob` déclenche sur le fil principal) se fait dans
 * le worker quand il sait encoder ce format ; sinon `toBlob`, comme avant.
 */
export async function canvasToBlob(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  const w = await offThread();
  if (w?.webp && type === 'image/webp') {
    try {
      const bitmap = await createImageBitmap(c);
      const blob = await w.encode(bitmap, type, quality);
      if (blob) return blob;
    } catch {
      /* repli ci-dessous */
    }
  }
  return new Promise<Blob | null>((r) => c.toBlob(r, type, quality));
}
