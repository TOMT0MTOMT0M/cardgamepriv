import type { TearBakeHeader } from './tearBakeFormat';

/**
 * (27/11, Retroussé) INTERPOLATION d'un enregistrement entre deux images — fonction PURE (ni DOM, ni three.js) : la même
 * sert au contrôle sous Node (scripts/bake-tear/check.mts) et au lecteur du jeu (core/tearBake.ts).
 *
 *  - Déchirure (pas de `fold`) et phase de sortie : linéaire, comme `TearBakePlayer.setFrame`.
 *  - Phase pilotée du Retroussé : DANS LE REPÈRE DE LA CHARNIÈRE. Dans un pli roulé, un sommet du pli tourne autour de
 *    la charnière pendant qu'elle avance : entre deux images, une interpolation linéaire le ferait passer en corde (à
 *    l'intérieur du pli). La forme, elle, ne fait que se décaler avec la charnière : au-dessus de la charnière, la
 *    position d'un sommet de y de repos y_j est celle qu'avait, à l'image f0, le point de y de repos y_j − δ (δ = yF(p)
 *    − yF(f0), interpolé entre les rangées de la même colonne), décalée de (0, δ, 0) ; on mêle ce calcul fait depuis f0
 *    et depuis f1. Sous la charnière (face posée sur les cartes) : linéaire, avec un fondu de `HINGE_FADE` rangée juste sous
 *    la charnière ; près du bord des lèvres, quand la rangée cherchée sort de la grille : repli linéaire (fondu sur 2
 *    rangées).
 */
export interface BakeInterpSource {
  header: TearBakeHeader;
  rest: Float32Array;
  /** (position − repos) / q, absolues, [image][sommet × 3] */
  frames: Int16Array;
}

/** largeur (en rangées) du fondu entre repère fixe (face) et repère de la charnière (pli, revers), sous la charnière */
const HINGE_FADE = 1;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** y de la charnière à l'image réelle f (phase pilotée), NaN sans charnière ou hors de la phase pilotée */
export function foldAt(h: TearBakeHeader, f: number): number {
  const yF = h.fold?.yF;
  if (!yF || f < 0 || f > h.nTear - 1) return NaN;
  const f0 = Math.min(h.nTear - 2, Math.floor(f)), k = f - f0;
  return yF[f0] + (yF[f0 + 1] - yF[f0]) * k;
}

/**
 * Positions (repos + écart) de TOUS les sommets à l'image réelle `f` (0 … nTear + nExit − 1, fractionnaire) dans `out`
 * (verts × 3). `mode` = 'linear' force l'interpolation linéaire (comparaison).
 */
export function bakeFrame(src: BakeInterpSource, f: number, out: Float32Array, mode: 'auto' | 'linear' = 'auto'): void {
  const h = src.header, n = h.verts, rest = src.rest, fr = src.frames;
  const F = h.nTear + h.nExit;
  f = Math.min(F - 1, Math.max(0, f));
  const f0 = Math.floor(f), f1 = Math.min(F - 1, f0 + 1), k = f - f0;
  const o0 = f0 * n * 3, o1 = f1 * n * 3;
  for (const s of h.sheets) {
    const q = s.part === 'body' ? h.q : h.qStrip;
    const a = s.base * 3, b = (s.base + s.ny * h.nx) * 3;
    for (let i = a; i < b; i++) out[i] = rest[i] + (fr[o0 + i] + (fr[o1 + i] - fr[o0 + i]) * k) * q;
  }
  const fold = h.fold;
  if (mode === 'linear' || !fold || k < 1e-6 || f1 > h.nTear - 1) return;
  const yFp = foldAt(h, f), d0 = yFp - fold.yF[f0], d1 = yFp - fold.yF[f1];
  const nx = h.nx, q = h.q, n3 = nx * 3, k0 = 1 - k;
  const S = arcTable(src);
  const yF0 = fold.yF[f0], yF1 = fold.yF[f1];
  // décalage en y du repère de la charnière, mêlé entre f0 et f1 (le même pour tous les sommets)
  const dY = d0 * k0 + d1 * k;
  // (27/11) boucle SANS fermeture ni allocation : appelée à chaque image du geste (10 530 sommets). Mêmes calculs, dans
  // le même ordre, que la version à fonctions locales (résultat identique au bit près, vérifié sur les 2 cuissons).
  for (const s of h.sheets) {
    if (s.part !== 'body') continue;
    const ys = s.ys, ny = s.ny, y0 = ys[0], base = s.base;
    const dy = (ys[ny - 1] - y0) / (ny - 1);
    // rangée fractionnaire (y de repos) de la charnière à p, f0, f1 : la même pour toutes les colonnes
    const tp = Math.min(ny - 1, Math.max(0, (yFp - y0) / dy));
    const tA = Math.min(ny - 1, Math.max(0, (yF0 - y0) / dy));
    const tB = Math.min(ny - 1, Math.max(0, (yF1 - y0) / dy));
    const jP = Math.min(ny - 2, Math.floor(tp)), uP = tp - jP;
    const jA = Math.min(ny - 2, Math.floor(tA)), uA = tA - jA;
    const jB = Math.min(ny - 2, Math.floor(tB)), uB = tB - jB;
    // (les rangées sous le fondu sont déjà linéaires)
    const jMin = Math.max(0, Math.floor(tp - HINGE_FADE) - 1);
    // la face (sous la charnière) est immobile dans le repère FIXE : la décaler avec la charnière la ferait glisser sur
    // son propre bombé (crans, coins). Fondu sur une rangée, là où le pli commence tangent à la face. Poids par rangée.
    if (WH.length < ny) WH = new Float64Array(ny);
    for (let j = jMin; j < ny; j++) WH[j] = sstep(-dy * HINGE_FADE, 0, ys[j] - yFp);
    for (let i = 0; i < nx; i++) {
      const So = base + i; // S est rangé comme les sommets : S[base + j·nx + i]
      // la charnière dans cette colonne : longueur d'arc et z de repos à p, f0, f1 (le pli se translate avec elle)
      const sP = S[So + jP * nx] + (S[So + (jP + 1) * nx] - S[So + jP * nx]) * uP;
      const sA = S[So + jA * nx] + (S[So + (jA + 1) * nx] - S[So + jA * nx]) * uA;
      const sB = S[So + jB * nx] + (S[So + (jB + 1) * nx] - S[So + jB * nx]) * uB;
      const zP = (So + jP * nx) * 3 + 2, zA = (So + jA * nx) * 3 + 2, zB = (So + jB * nx) * 3 + 2;
      const zp = rest[zP] + (rest[zP + n3] - rest[zP]) * uP;
      const dz0 = zp - (rest[zA] + (rest[zA + n3] - rest[zA]) * uA);
      const dz1 = zp - (rest[zB] + (rest[zB + n3] - rest[zB]) * uB);
      const dZ = dz0 * k0 + dz1 * k;
      // recherche INCRÉMENTALE de la rangée de même longueur d'arc : les longueurs demandées croissent avec j, on repart
      // de la dernière rangée trouvée (une par image source) — O(ny) par colonne au lieu de O(ny²)
      let hA = 1, hB = 1;
      for (let j = jMin; j < ny; j++) {
        const wH = WH[j];
        if (wH <= 0) continue;
        // même longueur d'arc au-delà de la charnière, à l'image f0 et à l'image f1
        const a = S[So + j * nx] - sP;
        const t0 = rowOfS(S, So, nx, ny, sA + a, hA);
        hA = hint;
        const t1 = rowOfS(S, So, nx, ny, sB + a, hB);
        hB = hint;
        if (t0 < 0 || t1 < 0) continue;
        const w = wH * Math.min(sstep(0, 2, ny - 1 - t0), sstep(0, 2, ny - 1 - t1));
        if (w <= 0) continue;
        const jA0 = Math.min(ny - 2, Math.floor(t0)), u0 = t0 - jA0;
        const jA1 = Math.min(ny - 2, Math.floor(t1)), u1 = t1 - jA1;
        const v = (So + j * nx) * 3;
        const a0 = (So + jA0 * nx) * 3, b0 = a0 + n3;
        const a1 = (So + jA1 * nx) * 3, b1 = a1 + n3;
        // x
        let p0 = rest[a0] + fr[o0 + a0] * q, q0 = rest[b0] + fr[o0 + b0] * q;
        let p1 = rest[a1] + fr[o1 + a1] * q, q1 = rest[b1] + fr[o1 + b1] * q;
        let A = (p0 + (q0 - p0) * u0) * k0 + (p1 + (q1 - p1) * u1) * k;
        out[v] += (A - out[v]) * w;
        // y (+ le décalage de la charnière)
        p0 = rest[a0 + 1] + fr[o0 + a0 + 1] * q, q0 = rest[b0 + 1] + fr[o0 + b0 + 1] * q;
        p1 = rest[a1 + 1] + fr[o1 + a1 + 1] * q, q1 = rest[b1 + 1] + fr[o1 + b1 + 1] * q;
        A = (p0 + (q0 - p0) * u0) * k0 + (p1 + (q1 - p1) * u1) * k + dY;
        out[v + 1] += (A - out[v + 1]) * w;
        // z (+ le décalage du z de repos de la charnière)
        p0 = rest[a0 + 2] + fr[o0 + a0 + 2] * q, q0 = rest[b0 + 2] + fr[o0 + b0 + 2] * q;
        p1 = rest[a1 + 2] + fr[o1 + a1 + 2] * q, q1 = rest[b1 + 2] + fr[o1 + b1 + 2] * q;
        A = (p0 + (q0 - p0) * u0) * k0 + (p1 + (q1 - p1) * u1) * k + dZ;
        out[v + 2] += (A - out[v + 2]) * w;
      }
    }
  }
}

/** poids du fondu par rangée (tampon réutilisé d'un appel à l'autre) */
let WH = new Float64Array(128);
/** sortie de `rowOfS` : la rangée où la recherche s'est arrêtée (point de départ de la suivante) */
let hint = 1;
/**
 * Rangée fractionnaire de longueur d'arc `a` dans la colonne `So` (−1 : avant le premier sommet ; `ny` : au-delà du
 * bord), en repartant de la rangée `j`. Écrit `hint`.
 */
function rowOfS(S: Float32Array, So: number, nx: number, ny: number, a: number, j: number): number {
  hint = j;
  if (a <= S[So]) return a < S[So] - 1e-9 ? -1 : 0;
  while (j > 1 && S[So + (j - 1) * nx] >= a) j--;
  while (j < ny && S[So + j * nx] < a) j++;
  hint = j;
  if (j >= ny) return ny; // au-delà du bord
  const sa = S[So + (j - 1) * nx], sb = S[So + j * nx];
  return j - 1 + (a - sa) / Math.max(1e-12, sb - sa);
}

/** longueur d'arc de repos le long de chaque colonne, rangée comme les sommets (calculée une fois par enregistrement) */
const ARC = new WeakMap<Float32Array, Float32Array>();
function arcTable(src: BakeInterpSource): Float32Array {
  let S = ARC.get(src.rest);
  if (S) return S;
  const h = src.header, R = src.rest, nx = h.nx;
  S = new Float32Array(h.verts);
  for (const s of h.sheets)
    for (let i = 0; i < nx; i++)
      for (let j = 1; j < s.ny; j++) {
        const a = (s.base + (j - 1) * nx + i) * 3, b = a + nx * 3;
        S[s.base + j * nx + i] = S[s.base + (j - 1) * nx + i] + Math.hypot(R[b] - R[a], R[b + 1] - R[a + 1], R[b + 2] - R[a + 2]);
      }
  ARC.set(src.rest, S);
  return S;
}
