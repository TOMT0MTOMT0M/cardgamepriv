/**
 * FROISSÉ DES SACHETS — calculs PURS (aucun DOM, aucun three.js) : partagés par core/pack.ts (géométrie, repli sur le
 * thread principal) et par core/packWorker.ts (le worker qui peint les cartes de plis et le nom moulé hors du thread
 * principal — mesure sur vrais téléphones du 07/11 : 1 à 1,4 s de gel par booster sur un Android 4 Go).
 * Code déplacé tel quel depuis pack.ts : mêmes nombres, mêmes pixels.
 */
export const PACK = { w: 0.897, h: 1.357, bulge: 0.028, crimp: 0.0863 };
/** toile du visuel d'un sachet */
export const PW = 640, PH = Math.round((640 * PACK.h) / PACK.w);

/** fondu d'un pli vers ses bouts (t = position le long du pli, 0..1) : débuts et fins progressifs */
export function creaseEnds(t: number, a: number, b: number): number {
  const e = Math.min(1, t * a, (1 - t) * b);
  return e * e * (3 - 2 * e);
}
/** profil (géométrie) d'un grand pli : cloche douce, effacée aux bouts */
export function creaseRidge(d: number, w: number, t: number): number {
  const k = Math.max(0, 1 - Math.abs(d) / w);
  return k * k * (3 - 2 * k) * creaseEnds(t, 5, 3.5);
}

export function lcg(seed: number) {
  let a = seed >>> 0 || 1;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * (07/11, retours de Tom : « des bosses / creases aléatoires pour ne pas avoir un côté répétitif quand on change de
 * booster ») chaque sachet a SON froissé : une graine par booster tire ses grands plis (positions, longueurs, courbure),
 * ses bosses molles, son ondulation et sa mosaïque de facettes. Même matière, jamais le même sachet.
 */
export interface CreaseCrease { x0: number; y0: number; x1: number; y1: number; amp: number; w: number; bend?: number }
export interface CreaseLook {
  seed: number;
  creases: CreaseCrease[];
  dents: Array<{ x: number; y: number; r: number; amp: number; sx: number }>;
  waves: Array<{ dx: number; dy: number; f: number; amp: number; ph: number }>;
  bg: [number, number, number, number];
}
export function creaseLook(seed: number): CreaseLook {
  const r = lcg(seed * 7919 + 17);
  const between = (a: number, b: number) => a + (b - a) * r();
  // 2 ou 3 grands plis : le premier part d'un coin (là où le film se tend), les autres traversent en biais
  const creases: CreaseCrease[] = [];
  const corner = Math.floor(r() * 4);
  const cx = corner & 1 ? 0.92 : 0.08, cy = corner & 2 ? 0.88 : 0.12;
  creases.push({ x0: cx, y0: cy, x1: between(0.38, 0.62), y1: between(0.4, 0.62), amp: between(0.8, 1.05), w: between(0.16, 0.22), bend: between(-0.045, 0.045) });
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI, l = between(0.35, 0.7), mx = between(0.25, 0.75), my = between(0.25, 0.75);
    creases.push({ x0: mx - Math.cos(a) * l * 0.5, y0: my - Math.sin(a) * l * 0.5, x1: mx + Math.cos(a) * l * 0.5, y1: my + Math.sin(a) * l * 0.5, amp: between(0.3, 0.75), w: between(0.14, 0.26), bend: between(-0.05, 0.05) });
  }
  // bosses molles (le film a été appuyé du doigt, une carte un peu de travers…), étirées dans un sens au hasard
  const dents = Array.from({ length: 3 + Math.floor(r() * 3) }, () => ({ x: between(0.12, 0.88), y: between(0.14, 0.86), r: between(0.05, 0.12), amp: between(-0.09, 0.07), sx: between(0.6, 1.6) }));
  const waves = Array.from({ length: 5 }, (_, i) => {
    const a = r() * Math.PI * 2;
    return { dx: Math.cos(a), dy: Math.sin(a), f: (3 + i * 2.3 + r()) * Math.PI * 2, amp: (0.05 / (1 + i * 0.7)) * FACET.wave, ph: r() * Math.PI * 2 };
  });
  return { seed, creases, dents, waves, bg: [between(2.6, 3.6), between(1.2, 2), between(-2.8, -1.8), between(2.4, 3.4)] };
}
export function creaseHeight(L: CreaseLook, x: number, y: number, ax: number, y0s: number, y1s: number): number {
  if (y < y0s || y > y1s) return 0;
  let h = 0;
  // ondulation de fond : deux grandes vagues obliques, à peine perceptibles dans le reflet
  h += 0.025 * Math.sin(x * L.bg[0] + y * L.bg[1] + L.seed) + 0.018 * Math.sin(x * L.bg[2] + y * L.bg[3] + 2.1 + L.seed * 0.7);
  // GRANDS PLIS : le film se courbe (sommet arrondi, profil en cloche) — des pentes douces, larges ; la hauteur suit la
  // largeur (pente constante le long du pli : il s'effile en une ligne, sans « pilule » au bout)
  for (const c of L.creases) {
    const q = creaseSigned(c, x, y, ax);
    const taper = 0.5 + 0.5 * Math.sin(Math.PI * q.t);
    const ww = c.w * (q.s > 0 ? 0.8 : 1.15) * taper;
    const k = Math.max(0, 1 - q.d / ww);
    h += 0.28 * c.amp * taper * k * k * (3 - 2 * k) * creaseEnds(q.t, 5, 3.5);
  }
  // bosses molles
  for (const d of L.dents) {
    const dx = ((x - d.x) * ax) / (d.r * d.sx), dy = (y - d.y) / (d.r / d.sx);
    const q = dx * dx + dy * dy;
    if (q < 9) h += d.amp * Math.exp(-q * 1.4);
  }
  // tension près des soudures : léger creux le long de la soudure (le film y est tiré)
  const ds = Math.min(y - y0s, y1s - y);
  h -= 0.08 * Math.exp(-ds / 0.03);
  return h;
}
/** distance SIGNÉE au pli courbé (arc : flèche `bend` au milieu), arête arrondie sur ~1 px */
const CREASE_AA = 1.6 / PH; // (≈ 1,2 px de la carte de plis, à ¾ de définition)
export function creaseSigned(c: CreaseCrease, x: number, y: number, ax: number) {
  const dx = (c.x1 - c.x0) * ax, dy = c.y1 - c.y0, l = Math.hypot(dx, dy) || 1;
  const px = (x - c.x0) * ax, py = y - c.y0;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (l * l)));
  // perpendiculaire signée, moins la courbure de l'arc à cette position (parabole 4t(1−t))
  const s = (px * dy - py * dx) / l - (c.bend ?? 0) * 4 * t * (1 - t);
  // (distance perpendiculaire seulement : au-delà des bouts le pli est déjà effacé — une distance « en capsule »
  // dessinait des anneaux de reflet au bout de chaque pli)
  const d = Math.sqrt(s * s + CREASE_AA * CREASE_AA) - CREASE_AA;
  return { s, d, t };
}
/**
 * (07/11 soir, 2e passe — retours de Tom : « on dirait des trous », « je veux juste un effet réaliste ») FROISSÉ RÉEL d'un
 * film métallisé : le film a été froissé puis lissé par les cartes dedans — il garde une MOSAÏQUE DE FACETTES presque
 * planes, chacune très légèrement inclinée, séparées par des arêtes fines (les plis). Les facettes voisines suivent une
 * surface ondulée commune (champ lisse échantillonné au centre de chaque facette) + un petit écart propre à chacune :
 * des plis partout mais faibles (1 à 3°), jamais de « trou » ni de « bâton ». Cellules étirées en biais (le film se
 * froisse en longueur), plus calmes au centre (les cartes le tiennent), plus marquées vers les bords et les soudures.
 * Calculé en pentes (flottants) et ajouté à la normale : aucune marche, aucun crénelage (fondu de 1,2 px sur les arêtes).
 */
const FACET = { cell: 0.075, stretch: 1.6, ang: 0.35, jitter: 0.004, wave: 0.55, calm: 0.15, aa: 2, facet: 0.3 };
function facetHash(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** champ lisse de pentes (5 vagues de directions variées) : la forme d'ensemble du film */
function facetField(L: CreaseLook, X: number, Y: number): [number, number] {
  let gx = 0, gy = 0;
  for (const w of L.waves) {
    const c = Math.cos((X * w.dx + Y * w.dy) * w.f + w.ph) * w.amp;
    gx += c * w.dx;
    gy += c * w.dy;
  }
  return [gx, gy];
}
/** pente de la facette sous le point (X, Y en unités de hauteur), fondue avec la voisine sur l'arête */
function facetSlope(L: CreaseLook, X: number, Y: number, H: number): [number, number] {
  const S = L.seed * 131;
  const ca = Math.cos(FACET.ang), sa = Math.sin(FACET.ang);
  // espace des cellules : tourné, étiré en travers (les facettes sont allongées dans la direction `ang`)
  const qx = X * ca + Y * sa, qy = (-X * sa + Y * ca) * FACET.stretch;
  const c = FACET.cell;
  const gi = Math.floor(qx / c), gj = Math.floor(qy / c);
  let d1 = 9, d2 = 9, i1 = 0, j1 = 0, i2 = 0, j2 = 0;
  for (let oj = -1; oj <= 1; oj++)
    for (let oi = -1; oi <= 1; oi++) {
      const i = gi + oi, j = gj + oj;
      const px = (i + facetHash(i, j, 1 + S)) * c, py = (j + facetHash(i, j, 2 + S)) * c;
      const d = Math.hypot(qx - px, qy - py);
      if (d < d1) {
        d2 = d1; i2 = i1; j2 = j1;
        d1 = d; i1 = i; j1 = j;
      } else if (d < d2) {
        d2 = d; i2 = i; j2 = j;
      }
    }
  const slopeOf = (i: number, j: number): [number, number] => {
    // centre de la cellule, ramené en coordonnées de toile, pour le champ lisse commun
    const px = (i + facetHash(i, j, 1 + S)) * c, py = ((j + facetHash(i, j, 2 + S)) * c) / FACET.stretch;
    const [fx, fy] = facetField(L, px * ca - py * sa, px * sa + py * ca);
    const a = facetHash(i, j, 3 + S) * Math.PI * 2;
    // écart propre à la facette (≈ gaussien : somme de deux tirages)
    const m = (facetHash(i, j, 4 + S) + facetHash(i, j, 5 + S) - 1) * FACET.jitter * 1.7;
    return [fx + Math.cos(a) * m, fy + Math.sin(a) * m];
  };
  const a = slopeOf(i1, j1), b = slopeOf(i2, j2);
  const w = 0.5 + 0.5 * Math.min(1, (d2 - d1) / ((2 * FACET.aa) / H));
  // (07/11, retours de Tom : « trop cabossé, beaucoup de faces visibles ») surtout la surface LISSE ondulée, et seulement
  // 30 % de l'écart dû aux facettes : les arêtes restent, en lignes fines, sans mosaïque
  const [cx, cy] = facetField(L, X, Y);
  const fx = a[0] * w + b[0] * (1 - w), fy = a[1] * w + b[1] * (1 - w);
  return [cx + (fx - cx) * FACET.facet, cy + (fy - cy) * FACET.facet];
}

/** taille des cartes de plis (une PAR booster désormais : ¾ de la toile du visuel, la normale est lisse — mémoire) */
export const CRW = Math.round(PW * 0.75), CRH = Math.round(PH * 0.75);
export function creaseMapData(ch: number, seed: number): { h: Uint8ClampedArray; n: Uint8ClampedArray } {
  const W = CRW, H = CRH;
  const L = creaseLook(seed);
  const ax = PACK.w / PACK.h;
  const y0s = ch / PH, y1s = 1 - ch / PH;
  // hauteurs en flottants (une rangée de marge de chaque côté pour les différences centrées)
  const hf = new Float32Array((W + 2) * (H + 2));
  for (let j = -1; j <= H; j++) {
    const y = (j + 0.5) / H;
    for (let i = -1; i <= W; i++) hf[(j + 1) * (W + 2) + (i + 1)] = creaseHeight(L, (i + 0.5) / W, y, ax, y0s, y1s);
  }
  const ih = { data: new Uint8ClampedArray(W * H * 4) }, inn = { data: new Uint8ClampedArray(W * H * 4) };
  // pente → normale : hauteur 1 ≈ 127/255 de la carte de hauteur ; NRM_K règle la force du relief : pentes douces (≈ 7° sur un grand pli, ≈ 30° sur l'arête d'un pli net) — un film d'aluminium plié, pas des bosses
  const NRM_K = 45 * (PH / H); // (même pente quelle que soit la définition de la carte)
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = (j + 1) * (W + 2) + (i + 1);
      const h = hf[k];
      const o = (j * W + i) * 4;
      const v = Math.max(0, Math.min(255, Math.round(128 + h * 127)));
      ih.data[o] = ih.data[o + 1] = ih.data[o + 2] = v;
      ih.data[o + 3] = 255;
      // espace tangent : +x = droite (u), +y = HAUT (v) — la toile descend, d'où le signe de dy
      const dhx = (hf[k + 1] - hf[k - 1]) * 0.5 * 0.5;
      const dhy = (hf[k - (W + 2)] - hf[k + (W + 2)]) * 0.5 * 0.5;
      let nx = -dhx * NRM_K, ny = -dhy * NRM_K;
      // facettes du froissé, plus calmes au centre du sachet, absentes sur les soudures
      const y = (j + 0.5) / H;
      if (y > y0s && y < y1s) {
        const u = (i + 0.5) / W;
        const edge = Math.min(Math.min(u, 1 - u) / 0.5, Math.min(y - y0s, y1s - y) / 0.42);
        const dens = FACET.calm + (1 - FACET.calm) * Math.pow(Math.max(0, 1 - edge), 1.6);
        const [fx, fy] = facetSlope(L, u * ax, y, H);
        nx += fx * dens;
        ny -= fy * dens; // (toile vers le bas → espace tangent vers le haut)
      }
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      inn.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      inn.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      inn.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      inn.data[o + 3] = 255;
    }
  return { h: ih.data, n: inn.data };
}
