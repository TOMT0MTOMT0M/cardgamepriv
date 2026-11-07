/**
 * NOM DU PACK THERMOFORMÉ (retours de Tom, 07/11) : plus d'encre noire plaquée sur le sachet — les lettres sont EN
 * RELIEF dans le film d'aluminium, comme moulées à chaud (épaules arrondies, même matière, même teinte), et les petits
 * REFLETS dessinés dans la police Matcha World (traits et points clairs sur les arrondis) sont, eux, CREUSÉS dans ce
 * relief au lieu d'être imprimés.
 *
 * Dans la police, ces reflets sont des TROUS fins à l'intérieur des lettres (comme les contre-formes de « O », « A »,
 * « P »… mais minces) : on rastérise le texte, on repère les trous fermés, et on les trie par épaisseur — un trou dont
 * le cercle inscrit est petit est un reflet (rainure), un trou large est une contre-forme (fond du sachet, plat).
 *
 * Sortie : une carte de hauteurs (px) que `pack.ts` change en NORMALES mêlées à celles des plis du sachet (le reflet
 * du métal glisse sur les épaules des lettres et accroche dans les rainures), plus un léger ombrage de cavité.
 * Ce module ne touche pas au DOM (testable hors navigateur) : la rastérisation est faite par l'appelant.
 */

/** Réglages du moulage, en fraction de la taille de police (px). */
export const LABEL_RELIEF = {
  /** sur-échantillonnage de la rastérisation (les reflets font ~2,5 % de la taille de police) */
  ss: 2,
  /** rayon de l'épaule arrondie (le film épouse le moule sur cette largeur) */
  shoulder: 0.05,
  /** hauteur du plateau, en fraction du rayon d’épaule (0,7 → mur à ≈ 40°, plateau net) */
  height: 0.7,
  /** cercle inscrit maximal d'un trou pour être un REFLET (sinon : contre-forme) */
  highlightMax: 0.04,
  /** profondeur des rainures des reflets, en fraction du plateau */
  groove: 0.7,
};

/**
 * Distance EUCLIDIENNE exacte (Felzenszwalb & Huttenlocher) au plus proche pixel où `seed` est vrai. Une distance
 * chanfreinée faisait des facettes (octogones) : sur un métal brillant, chaque facette devenait un trait de reflet.
 */
function chamfer(seed: (k: number) => boolean, w: number, h: number): Float32Array {
  const INF = 1e12;
  const g = new Float64Array(w * h);
  for (let k = 0; k < w * h; k++) g[k] = seed(k) ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), dd = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const pass = (len: number, get: (i: number) => number, set: (i: number, x: number) => void) => {
    for (let i = 0; i < len; i++) f[i] = get(i);
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s2 = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s2 <= z[k]) {
        k--;
        s2 = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s2;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      dd[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
    for (let i = 0; i < len; i++) set(i, dd[i]);
  };
  for (let x = 0; x < w; x++) pass(h, (i) => g[i * w + x], (i, val) => (g[i * w + x] = val));
  for (let y = 0; y < h; y++) pass(w, (i) => g[y * w + i], (i, val) => (g[y * w + i] = val));
  const d = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) d[k] = Math.sqrt(g[k]);
  return d;
}

/** flou boîte séparable (rayon r), sur place */
function boxBlur(a: Float32Array, w: number, h: number, r: number) {
  if (r < 1) return;
  const tmp = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      a[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

export interface ReliefMap {
  /** hauteurs en px (de la toile finale, après réduction du sur-échantillonnage) */
  h: Float32Array;
  w: number;
  hgt: number;
  /** hauteur du plateau des lettres (px) */
  top: number;
  /** nombre de reflets creusés / de contre-formes laissées à plat (contrôle) */
  highlights: number;
  counters: number;
}

/**
 * Carte de hauteurs du nom moulé, depuis la couverture (alpha 0..255) du texte rastérisé à `ss` × la taille finale.
 * `fontPx` = taille de police à la définition FINALE (px de la toile du sachet).
 */
export function reliefFromCoverage(alpha: Uint8ClampedArray | Uint8Array, W: number, H: number, fontPx: number, o = LABEL_RELIEF): ReliefMap {
  const ss = o.ss;
  const fpx = fontPx * ss;
  const n = W * H;
  const ink = new Uint8Array(n);
  for (let k = 0; k < n; k++) ink[k] = alpha[k] >= 128 ? 1 : 0;
  // 1) le dehors : tout le non-encré joint au bord
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const push = (k: number) => {
    if (!ink[k] && !outside[k]) {
      outside[k] = 1;
      stack.push(k);
    }
  };
  for (let x = 0; x < W; x++) push(x), push((H - 1) * W + x);
  for (let y = 0; y < H; y++) push(y * W), push(y * W + W - 1);
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % W, y = (k / W) | 0;
    if (x > 0) push(k - 1);
    if (x < W - 1) push(k + 1);
    if (y > 0) push(k - W);
    if (y < H - 1) push(k + W);
  }
  // 2) trous fermés : composantes, triées par cercle inscrit (distance à l'encre)
  const dInk = chamfer((k) => ink[k] === 1, W, H);
  const comp = new Int32Array(n).fill(-1);
  const isHighlight: boolean[] = [];
  let counters = 0;
  for (let k0 = 0; k0 < n; k0++) {
    if (ink[k0] || outside[k0] || comp[k0] >= 0) continue;
    const id = isHighlight.length;
    let maxD = 0;
    const list = [k0];
    comp[k0] = id;
    for (let i = 0; i < list.length; i++) {
      const k = list[i];
      if (dInk[k] > maxD) maxD = dInk[k];
      const x = k % W, y = (k / W) | 0;
      for (const q of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1])
        if (q >= 0 && !ink[q] && !outside[q] && comp[q] < 0) {
          comp[q] = id;
          list.push(q);
        }
    }
    const hl = maxD < o.highlightMax * fpx;
    isHighlight.push(hl);
    if (!hl) counters++;
  }
  // 3) corps de la lettre = encre + reflets (le reflet est DANS la lettre) ; épaule arrondie depuis le bord
  const body = (k: number) => ink[k] === 1 || (comp[k] >= 0 && isHighlight[comp[k]]);
  // distance SIGNÉE au bord de la lettre (+ dedans, − dehors), corrigée au sous-pixel par la couverture
  const dIn = chamfer((k) => !body(k), W, H);
  const dOut = chamfer((k) => body(k), W, H);
  const sd = new Float32Array(n);
  for (let k = 0; k < n; k++) sd[k] = body(k) ? dIn[k] - 0.5 : 0.5 - dOut[k] + (outside[k] ? alpha[k] / 255 : 0);
  // le bord rastérisé fait des marches d'un pixel : sans lissage, chaque marche devient une ride en travers de
  // l'épaule (des stries de reflet). Distance lissée (≈ 1 px final) : le bord reste à sa place.
  boxBlur(sd, W, H, Math.max(1, Math.round(0.8 * ss)));
  boxBlur(sd, W, H, Math.max(1, Math.round(0.8 * ss)));
  const R = o.shoulder * fpx;
  const top = o.height * R;
  const F = 0.3 * R; // congé au pied : le film se détache du fond en douceur (pas d'arête vive)
  const hs = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (sd[k] <= -F) continue;
    const s = Math.min(1, (sd[k] + F) / (R + F));
    let v = top * s * s * (3 - 2 * s); // congé en bas, épaule arrondie en haut
    // reflet : rainure creusée dans le plateau, fond arrondi (plus profonde au milieu du trait)
    if (!ink[k] && comp[k] >= 0 && isHighlight[comp[k]]) v -= top * o.groove * Math.min(1, 0.55 + dInk[k] / Math.max(1, 0.5 * o.highlightMax * fpx));
    hs[k] = v;
  }
  // 4) le moulage adoucit tout (≈ 0,6 px final) puis retour à la définition de la toile
  boxBlur(hs, W, H, Math.max(1, Math.round(0.6 * ss)));
  const w = Math.floor(W / ss), hgt = Math.floor(H / ss);
  const h = new Float32Array(w * hgt);
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) s += hs[(y * ss + j) * W + x * ss + i];
      h[y * w + x] = s / (ss * ss) / ss; // px de la toile finale
    }
  return { h, w, hgt, top: top / ss, highlights: isHighlight.length - counters, counters };
}

/**
 * Mêle le relief à une carte de normales (RGBA 8 bits, espace tangent +y = haut, comme celle des plis) sur la zone
 * (x0, y0, w × h) : pentes additionnées (« whiteout »). Renvoie aussi l'ombrage de cavité (1 = rien, < 1 = au pied des
 * lettres et au fond des rainures), à multiplier sur la couleur.
 */
export function blendReliefNormals(nrm: Uint8ClampedArray, NW: number, r: ReliefMap, x0: number, y0: number, strength = 1): Float32Array {
  const { h, w, hgt, top } = r;
  const at = (x: number, y: number) => h[Math.min(hgt - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  // cavité : hauteur moyenne du voisinage au-dessus de la hauteur du point (creux entourés de relief)
  const blur = new Float32Array(h);
  boxBlur(blur, w, hgt, 3);
  const ao = new Float32Array(w * hgt);
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      ao[k] = 1 - Math.min(0.14, Math.max(0, blur[k] - h[k]) / Math.max(1e-6, top) * 0.35);
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * 0.5 * strength; // toile vers le bas → tangent vers le haut
      if (dx === 0 && dy === 0) continue;
      const X = x0 + x, Y = y0 + y;
      const o = (Y * NW + X) * 4;
      if (X < 0 || Y < 0 || X >= NW || o + 2 >= nrm.length) continue;
      const bx = nrm[o] / 127.5 - 1, by = nrm[o + 1] / 127.5 - 1, bz = Math.max(0.05, nrm[o + 2] / 127.5 - 1);
      // pentes : celles des plis (x/z) + celles du relief
      let nx = bx / bz - dx, ny = by / bz - dy;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      // tramage ± ½ niveau : sans lui, les pentes douces des épaules se rangent en paliers 8 bits (des stries de reflet)
      const t = (((X * 73856093) ^ (Y * 19349663)) >>> 0) / 4294967296 - 0.5;
      nrm[o] = Math.round((nx * 0.5 + 0.5) * 255 + t);
      nrm[o + 1] = Math.round((ny * 0.5 + 0.5) * 255 - t);
      nrm[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    }
  return ao;
}
