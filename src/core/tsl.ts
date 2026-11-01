/**
 * Petits outils TSL partagés : hash 2D, voronoï avec identifiant de cellule,
 * interférence de couche mince spectrale, rotation 2D, courbes.
 */
import { Fn, Loop, cos, dot, float, floor, fract, hash, length, min, mix, sin, vec2, vec3, sqrt, max, clamp, luminance } from 'three/tsl';

/**
 * Les typings TSL de @types/three sont paramétrés par type de composante (Node<'vec3'>…) :
 * pour les helpers génériques on assume un type lâche.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type N = any;

/** hash 2D → [0,1) (PCG via hash()). */
export const hash2 = (p: N, salt = 0): N => hash(floor(p.x).add(floor(p.y).mul(7919.0)).add(salt * 104729 + 13));

/** Hash continu sur des coordonnées flottantes déjà entières (cellules). */
export const hashCell = (cell: N, salt = 0): N => hash(cell.x.add(cell.y.mul(7919.0)).add(salt * 104729 + 13));

export const rot2 = (p: N, a: N | number): N => {
  const c = cos(a), s = sin(a);
  return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
};

/**
 * Voronoï 2D (F1, F2, id). id ∈ [0,1) stable par cellule.
 * Retourne vec3(f1, f2, id). `jitter` 0..1.
 */
export const voronoi = Fn(([p, jitter]: [N, N]) => {
  const ip = floor(p);
  const fp = fract(p);
  const f1 = float(8.0).toVar();
  const f2 = float(8.0).toVar();
  const id = float(0.0).toVar();
  // une seule instruction Loop à deux paramètres → variables i (externe) et j (interne) distinctes
  Loop(
    { start: -1, end: 2, type: 'int', condition: '<' },
    { start: -1, end: 2, type: 'int', condition: '<' },
    ({ i, j }: { i: N; j: N }) => {
      const g = vec2(float(i), float(j));
      const c = ip.add(g);
      const o = vec2(hashCell(c, 1), hashCell(c, 2)).mul(jitter).add(float(0.5).mul(float(1).sub(jitter)));
      const d = length(g.add(o).sub(fp));
      const isNew = d.lessThan(f1);
      f2.assign(mix(min(f2, d), f1, float(isNew)));
      id.assign(mix(id, hashCell(c, 3), float(isNew)));
      f1.assign(min(f1, d));
    },
  );
  return vec3(f1, f2, id);
});

/** Fonctions colorimétriques CIE 1931 (fit de Wyman et al. 2013) → poids sRGB linéaires. */
function cieGauss(x: number, mu: number, s1: number, s2: number) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
function cmf(l: number): [number, number, number] {
  const X = 1.056 * cieGauss(l, 599.8, 37.9, 31.0) + 0.362 * cieGauss(l, 442.0, 16.0, 26.7) - 0.065 * cieGauss(l, 501.1, 20.4, 26.2);
  const Y = 0.821 * cieGauss(l, 568.8, 46.9, 40.5) + 0.286 * cieGauss(l, 530.9, 16.3, 31.1);
  const Z = 1.217 * cieGauss(l, 437.0, 11.8, 36.0) + 0.681 * cieGauss(l, 459.0, 26.0, 13.8);
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
}

export const SPECTRUM = (() => {
  const N = 12;
  const samples: Array<{ l: number; w: [number, number, number] }> = [];
  const sum = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const l = 400 + ((i + 0.5) / N) * 300;
    const w = cmf(l);
    samples.push({ l, w });
    sum[0] += w[0];
    sum[1] += w[1];
    sum[2] += w[2];
  }
  samples.forEach((s) => (s.w = [s.w[0] / sum[0], s.w[1] / sum[1], s.w[2] / sum[2]]));
  return samples;
})();

/**
 * Interférence de couche mince (deux ondes) intégrée sur 12 longueurs d'onde.
 * @param thicknessNm épaisseur du film (nm)
 * @param cosI cos de l'angle d'incidence (N·V)
 * @param ior indice du film
 * @param contrast 0..1 — visibilité des franges
 */
export function thinFilm(thicknessNm: N, cosI: N, ior: N | number, contrast: N | number = 1): N {
  const n = typeof ior === 'number' ? float(ior) : ior;
  const sinT2 = float(1).sub(cosI.mul(cosI)).div(n.mul(n));
  const cosT = sqrt(max(float(1).sub(sinT2), 0.0));
  const opd = thicknessNm.mul(n).mul(cosT).mul(2.0);
  let acc: N = vec3(0, 0, 0);
  for (const s of SPECTRUM) {
    const phase = opd.mul((2 * Math.PI) / s.l).add(Math.PI);
    const r = float(0.5).add(cos(phase).mul(0.5).mul(contrast));
    acc = acc.add(vec3(s.w[0], s.w[1], s.w[2]).mul(r));
  }
  return clamp(acc, 0.0, 1.5);
}

/** Saturation autour de la luminance. */
export const saturate3 = (c: N, k: N | number): N => mix(vec3(luminance(c)), c, k);

/** Lumière douce type "softbox" (pour les reflets calculés à la main). */
export const softSpec = (r: N, l: N, power: number): N => max(dot(r, l), 0).pow(power);
