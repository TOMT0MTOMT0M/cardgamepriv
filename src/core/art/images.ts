import type { CardData, CardPalette } from '../cardData';

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
const ready = new Map<string, CardImage>();
const errors = new Map<string, string>();

/** Image prête (ou null si pas encore chargée / en échec). */
export function cardImage(url: string | undefined): CardImage | null {
  return url ? (ready.get(url) ?? null) : null;
}

export interface LoadOptions {
  /** détourer le fond blanc opaque (défaut : oui ; non pour les photos réelles, cf. `CardData.photo`) */
  key?: boolean;
}

export function loadCardImage(url: string, opts: LoadOptions = {}): Promise<CardImage> {
  let p = pending.get(url);
  if (!p) {
    p = (async () => {
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
  const urls = [...new Set(cards.map((c) => c.image).filter((u): u is string => !!u))];
  const noKey = new Set(cards.filter((c) => (c.photo || c.cover) && c.image).map((c) => c.image as string));
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

/** Blanc « de fond » : les scans de fond sont à 255 pile, le blanc des corps est rarement au-dessus de 247. */
const WHITE = 248;
/** Seuil bas du fondu de bord (anticrénelage mêlé au blanc). */
const EDGE_LO = 170;

function processImage(url: string, img: HTMLImageElement, allowKey = true): CardImage {
  const w = img.naturalWidth, h = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const g = src.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;

  // fond blanc opaque ? (majorité du pourtour blanc pur)
  let border = 0, white = 0;
  const visit = (i: number) => {
    border++;
    const o = i * 4;
    if (d[o + 3] > 250 && Math.min(d[o], d[o + 1], d[o + 2]) >= WHITE) white++;
  };
  for (let x = 0; x < w; x++) (visit(x), visit((h - 1) * w + x));
  for (let y = 1; y < h - 1; y++) (visit(y * w), visit(y * w + w - 1));
  const keyed = allowKey && white / border > 0.5;
  const removed = keyed ? keyWhite(d, w, h) : 0;
  if (keyed) g.putImageData(id, 0, 0);

  // recadrage sur le contenu
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) (x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1);
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d')!.drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);

  const { hue, chroma, body } = dominant(d, w, h);
  return {
    url,
    canvas,
    srcW: w,
    srcH: h,
    keyed,
    keyedRatio: removed / (w * h),
    lowRes: Math.max(w, h) < 256,
    opaque: clear / (w * h) < 0.01,
    hue,
    chroma,
    palette: paletteFrom(hue, chroma, body),
  };
}

/** Détourage du blanc : remplissage 4-connexe depuis le pourtour + trous fermés assez grands. Renvoie le nb de pixels retirés. */
function keyWhite(d: Uint8ClampedArray, w: number, h: number): number {
  const n = w * h;
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    cand[i] = d[o + 3] > 0 && d[o] >= WHITE && d[o + 1] >= WHITE && d[o + 2] >= WHITE ? 1 : 0;
  }
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  const flood = (seeds: number[], mark: Uint8Array, out?: number[]) => {
    let head = 0, tail = 0;
    for (const s of seeds) if (cand[s] && !mark[s]) (mark[s] = 1, (queue[tail++] = s));
    while (head < tail) {
      const i = queue[head++];
      out?.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && cand[i - 1] && !mark[i - 1]) (mark[i - 1] = 1, (queue[tail++] = i - 1));
      if (x < w - 1 && cand[i + 1] && !mark[i + 1]) (mark[i + 1] = 1, (queue[tail++] = i + 1));
      if (y > 0 && cand[i - w] && !mark[i - w]) (mark[i - w] = 1, (queue[tail++] = i - w));
      if (y < h - 1 && cand[i + w] && !mark[i + w]) (mark[i + w] = 1, (queue[tail++] = i + w));
    }
  };
  const seeds: number[] = [];
  for (let x = 0; x < w; x++) seeds.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) seeds.push(y * w, y * w + w - 1);
  flood(seeds, bg);
  // trous fermés (fond visible entre une queue et le corps, etc.) : composantes blanches non reliées au bord,
  // retirées si assez grandes — les petits reflets (yeux, éclats) restent.
  const minHole = Math.max(40, Math.round(n * 0.0018));
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!cand[i] || bg[i] || seen[i]) continue;
    const comp: number[] = [];
    flood([i], seen, comp);
    if (comp.length >= minHole) for (const k of comp) bg[k] = 1;
  }
  let removed = 0;
  for (let i = 0; i < n; i++) if (bg[i]) (d[i * 4 + 3] = 0, removed++);
  // bord : l'anticrénelage mélangé au blanc devient de la transparence (couleur « dé-blanchie »)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) continue;
      if (!((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]))) continue;
      const o = i * 4;
      const mn = Math.min(d[o], d[o + 1], d[o + 2]);
      let a = 1 - Math.min(1, Math.max(0, (mn - EDGE_LO) / (255 - EDGE_LO)));
      if (a >= 1) continue;
      a = Math.max(a, 0.05);
      for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, (d[o + c] - 255 * (1 - a)) / a));
      d[o + 3] = Math.round(d[o + 3] * a);
    }
  return removed;
}

/** Teinte dominante pondérée par saturation × luminosité (histogramme 36 cases lissé). */
function dominant(d: Uint8ClampedArray, w: number, h: number) {
  const bins = new Float64Array(36);
  const acc = Array.from({ length: 36 }, () => [0, 0, 0, 0]);
  let wSum = 0, cSum = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const o = (y * w + x) * 4;
      if (d[o + 3] < 200) continue;
      const r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const c = mx - mn;
      n++;
      cSum += c;
      if (c < 0.08 || mx < 0.15) continue;
      let hh = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
      hh = (hh * 60 + 360) % 360;
      const wt = c * mx;
      const k = Math.floor(hh / 10) % 36;
      bins[k] += wt;
      const a = acc[k];
      a[0] += r * wt;
      a[1] += g * wt;
      a[2] += b * wt;
      a[3] += wt;
      wSum += wt;
    }
  let best = 0, bestV = -1;
  for (let k = 0; k < 36; k++) {
    const v = bins[(k + 35) % 36] * 0.5 + bins[k] + bins[(k + 1) % 36] * 0.5;
    if (v > bestV) (bestV = v, (best = k));
  }
  let r = 0, g = 0, b = 0, ww = 0;
  for (const k of [(best + 35) % 36, best, (best + 1) % 36]) {
    const a = acc[k];
    r += a[0];
    g += a[1];
    b += a[2];
    ww += a[3];
  }
  const body = ww > 0 ? toHex(r / ww, g / ww, b / ww) : '#c8c2b4';
  const hue = ww > 0 ? rgbHue(r / ww, g / ww, b / ww) : 40;
  // chroma « perçue » : part colorée de l'illustration
  const chroma = n ? Math.min(1, (wSum / n) * 2.2 + (cSum / n) * 0.6) : 0;
  return { hue, chroma, body };
}

function rgbHue(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c === 0) return 40;
  const hh = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return (hh * 60 + 360) % 360;
}

function toHex(r: number, g: number, b: number) {
  const f = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

function hsl(hDeg: number, s: number, l: number) {
  const hh = ((hDeg % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const t = (x: number) => {
    x = (x + 1) % 1;
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 0.5 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
  };
  return toHex(t(hh + 1 / 3), t(hh), t(hh - 1 / 3));
}

/**
 * Palette de carte depuis la teinte dominante. Fond sombre teinté (le dessin, clair et cerné, ressort),
 * halo clair de la même teinte. Les jaunes sombres virant au kaki, le fond des jaunes glisse vers l'ambre.
 */
export function paletteFrom(hue: number, chroma: number, body: string): CardPalette {
  const k = Math.max(0.18, Math.min(1, chroma * 1.5));
  const yellow = hue > 38 && hue < 75;
  const skyHue = yellow ? hue - 22 : hue;
  return {
    paper: hsl(hue, 0.08 + 0.18 * k, 0.9),
    ink: hsl(skyHue, 0.1 + 0.2 * k, 0.11),
    sky: hsl(skyHue, 0.12 + (yellow ? 0.42 : 0.32) * k, yellow ? 0.2 : 0.17),
    haze: hsl(skyHue, 0.14 + 0.36 * k, 0.42),
    body,
    glow: hsl(hue, 0.35 + 0.55 * k, 0.8),
  };
}
