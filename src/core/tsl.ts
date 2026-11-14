/**
 * Petits outils TSL partagés : hash 2D, voronoï avec identifiant de cellule,
 * interférence de couche mince spectrale, rotation 2D, courbes.
 */
import { NOISE_PERIOD, NOISE_SIZE, burnNoiseValues, noisePixels } from './noiseData';
import { Fn, Loop, cos, dot, float, floor, fract, hash, length, min, mix, sin, vec2, vec3, sqrt, max, clamp, luminance, texture } from 'three/tsl';
import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three/webgpu';

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

/**
 * Normale tangente depuis une hauteur procédurale (différences finies dans l'espace `p`).
 * À brancher via `normalMap(encodeNormal(n))` — marche sans attribut tangent (repère par dérivées).
 */
export function normalFromHeight(h: (p: N) => N, p: N, eps: number, strength: N | number): N {
  const h0 = h(p);
  const hx = h(p.add(vec2(eps, 0)));
  const hy = h(p.add(vec2(0, eps)));
  return vec3(h0.sub(hx).mul(strength).div(eps), h0.sub(hy).mul(strength).div(eps), 1).normalize();
}

export const encodeNormal = (n: N): N => n.mul(0.5).add(0.5);

// ───────────────────────────────────────────── tables cuites (variante « lite » des faces, téléphone)
/** Plage d'épaisseur couverte par la table de couche mince (nm) : la face holo reste dans [0, ~1 050]. */
export const FILM_LUT_MAX = 1600;
let filmLut: DataTexture | null = null;
/**
 * `thinFilm(d, cosI, 1.45, 0.95)` précalculée : 512 épaisseurs × 16 incidences (RGBA 16 bits). Une lecture au lieu de
 * 12 cosinus par pixel ; même formule, même pondération spectrale → même couleur (interpolation bilinéaire, ≥ 45
 * texels par frange). L'épaisseur négative donne la même couleur (cosinus pair) : on lit |d|.
 */
export function filmLUT(): DataTexture {
  if (filmLut) return filmLut;
  const W = 512, H = 16, ior = 1.45, contrast = 0.95;
  const data = new Uint16Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const cosI = 0.05 + (j / (H - 1)) * 0.95;
    const sinT2 = (1 - cosI * cosI) / (ior * ior);
    const cosT = Math.sqrt(Math.max(1 - sinT2, 0));
    for (let i = 0; i < W; i++) {
      const d = (i / (W - 1)) * FILM_LUT_MAX;
      const opd = d * ior * cosT * 2;
      let r = 0, g = 0, b = 0;
      for (const s of SPECTRUM) {
        const k = 0.5 + Math.cos(opd * ((2 * Math.PI) / s.l) + Math.PI) * 0.5 * contrast;
        r += s.w[0] * k;
        g += s.w[1] * k;
        b += s.w[2] * k;
      }
      const o = (j * W + i) * 4;
      data[o] = DataUtils.toHalfFloat(Math.min(1.5, Math.max(0, r)));
      data[o + 1] = DataUtils.toHalfFloat(Math.min(1.5, Math.max(0, g)));
      data[o + 2] = DataUtils.toHalfFloat(Math.min(1.5, Math.max(0, b)));
      data[o + 3] = DataUtils.toHalfFloat(1);
    }
  }
  const t = new DataTexture(data, W, H, RGBAFormat, HalfFloatType);
  t.magFilter = t.minFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return (filmLut = t);
}

/** Lecture de la table : équivalent de `thinFilm(d, cosI, 1.45, 0.95)`. */
export const thinFilmLUT = (thicknessNm: N, cosI: N): N =>
  // (coordonnées ramenées aux centres des texels : texel i ↔ épaisseur i / 511 × MAX, incidence j ↔ 0,05 + j / 15 × 0,95)
  texture(filmLUT(), vec2(thicknessNm.abs().div(FILM_LUT_MAX).mul(511 / 512).add(0.5 / 512), cosI.sub(0.05).div(0.95).mul(15 / 16).add(0.5 / 16))).rgb;

export { NOISE_PERIOD };
let noiseTex: DataTexture | null = null;
/**
 * Bruit de gradient 2D **répétable** (période 64 cellules, 8 texels par cellule), 3 tirages indépendants en R, G, B
 * (≈ [-1, 1] codé sur [0, 1]). Remplace `mx_noise_float` (Perlin 3D, ~50 instructions) par une lecture de texture.
 * Lire avec `noiseTexel(p)` : p en unités de bruit, comme l'argument de `mx_noise_float`.
 */
export function noiseTexture(): DataTexture {
  return (noiseTex ??= wrapNoise(noisePixels()));
}
function wrapNoise(data: Uint8Array): DataTexture {
  const t = new DataTexture(data, NOISE_SIZE, NOISE_SIZE, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

let noiseReady: Promise<void> | null = null;
/**
 * (audit 12/11, S06 / E2-01) PIXELS DU BRUIT CALCULÉS DANS UN WORKER, pour le jeu : 68 ms sur PC au profil du démarrage,
 * sur le fil principal, pendant le montage de la vitrine. À appeler tôt (main.ts) ; la texture existe tout de suite
 * (noire), la promesse se résout quand ses pixels sont là — le montage de la vitrine l'attend avant sa première image.
 * Pas de worker, worker en échec ou muet : calcul sur le fil principal, comme avant. Sans cet appel (labo) : rien ne change.
 */
export function preloadNoise(): Promise<void> {
  if (noiseReady) return noiseReady;
  if (noiseTex || typeof Worker === 'undefined') return (noiseReady = Promise.resolve(void noiseTexture()));
  const t = (noiseTex = wrapNoise(new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)));
  return (noiseReady = new Promise<void>((done) => {
    let filled = false;
    let w: Worker | null = null;
    let guard = 0;
    const fill = (d: Uint8Array) => {
      clearTimeout(guard);
      w?.terminate();
      w = null;
      if (filled) return;
      filled = true;
      (t.image.data as Uint8Array).set(d);
      t.needsUpdate = true;
      done();
    };
    const local = () => void (filled || fill(noisePixels()));
    try {
      w = new Worker(new URL('./noise.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Uint8Array>) => fill(e.data);
      w.onerror = w.onmessageerror = local;
      w.postMessage(0);
      guard = window.setTimeout(local, 5000);
    } catch {
      local();
    }
  }));
}

/**
 * (audit 12/11, S06 / E2-01) Valeurs du bruit de brûlure du sachet, calculées dans un worker (repli : fil principal).
 */
export function burnNoise(W: number, H: number, packW: number, packH: number): Promise<Float64Array> {
  return new Promise<Float64Array>((done) => {
    let settled = false;
    let w: Worker | null = null;
    let guard = 0;
    const finish = (d: Float64Array) => {
      clearTimeout(guard);
      w?.terminate();
      w = null;
      if (settled) return;
      settled = true;
      done(d);
    };
    const local = () => void (settled || finish(burnNoiseValues(W, H, packW, packH)));
    try {
      if (typeof Worker === 'undefined') return local();
      w = new Worker(new URL('./noise.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Float64Array>) => finish(e.data);
      w.onerror = w.onmessageerror = local;
      w.postMessage({ burn: [W, H, packW, packH] });
      guard = window.setTimeout(local, 5000);
    } catch {
      local();
    }
  });
}

/** Bruit cuit en `p` (unités de bruit) → vec3 de 3 tirages indépendants dans ≈ [-1, 1]. */
export const noiseTexel = (p: N): N => texture(noiseTexture(), p.div(NOISE_PERIOD)).rgb.mul(2).sub(1);

/**
 * Équivalent cuit de `mx_fractal_noise_float(vec3(p, z), octaves)` (lacunarité 2, atténuation 0,5, sans normalisation) :
 * une lecture du bruit répétable par octave au lieu d'un Perlin 3D. Décalage par octave → octaves décorrélées.
 */
export const fbmTexel = (p: N, octaves: number): N => {
  let v: N = float(0);
  let amp = 1, f = 1;
  for (let o = 0; o < octaves; o++) {
    v = v.add((noiseTexel(p.mul(f).add(vec2(o * 17.31, o * 9.73))) as N).x.mul(amp));
    f *= 2;
    amp *= 0.5;
  }
  return v;
};
