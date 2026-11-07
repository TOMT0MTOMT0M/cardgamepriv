import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three/webgpu';

/**
 * Textures « matière » des reflets Pokébox, GÉNÉRÉES (on ne reprend pas les fichiers du site) mais calibrées sur leurs
 * statistiques (moyenne, écart-type, centiles mesurés le 07/11) :
 *  - `glitter` : étoiles à 4 branches éparses sur noir (paillettes)              — glitter.png
 *  - `iri7/8/9`: moucheté sombre à points colorés (moy. 0,25, σ 0,20)            — iri-7/8/9 (300² répétées)
 *  - `iri1/2`  : moucheté clair pastel (moy. 0,85, σ 0,07)                       — iri-1/2
 *  - `noise`   : bruit gris (moy. 0,48, σ 0,16)                                   — noise-base
 *  - `grain`   : grain fin sombre et clairsemé (moy. 0,05)                        — grain (argent mat)
 *  - `value`   : bruit blanc filtré : bruit de valeur pour le grain du « double rare »
 *  - `dank1/2` : confettis colorés épars sur noir (moy. 0,09, p99 ≈ 1)            — birthday-holo-dank (double rare)
 * Toutes en valeurs brutes (NoColorSpace) : le shader d'origine travaille en espace écran (sRGB), nous aussi.
 */
export interface PokeTextures {
  glitter: DataTexture;
  iri7: DataTexture;
  iri8: DataTexture;
  iri9: DataTexture;
  iri1: DataTexture;
  iri2: DataTexture;
  noise: DataTexture;
  grain: DataTexture;
  value: DataTexture;
  dank1: DataTexture;
  dank2: DataTexture;
  list: DataTexture[];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function hue2rgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}
function make(n: number, fill: (d: Float32Array) => void): DataTexture {
  const f = new Float32Array(n * n * 4);
  fill(f);
  const u = new Uint8Array(n * n * 4);
  for (let i = 0; i < u.length; i++) u[i] = Math.round(c01(f[i]) * 255);
  for (let i = 3; i < u.length; i += 4) u[i] = 255;
  const t = new DataTexture(u, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  return t;
}
/** Tampon de taille n (périodique) : dépose une étoile / un point. */
function splat(d: Float32Array, n: number, x: number, y: number, rgb: [number, number, number], r: number, star: boolean) {
  const R = Math.ceil(r * (star ? 3 : 1.5));
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const ax = Math.abs(i + 0.5 - (x % 1)) / r, ay = Math.abs(j + 0.5 - (y % 1)) / r;
      const k = star ? Math.max(0, 1 - (Math.pow(ax, 0.55) + Math.pow(ay, 0.55)) * 0.9) : Math.exp(-(ax * ax + ay * ay) * 2);
      if (k <= 0.002) continue;
      const px = (((Math.floor(x) + i) % n) + n) % n, py = (((Math.floor(y) + j) % n) + n) % n;
      const o = (py * n + px) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = Math.max(d[o + c], rgb[c] * k);
    }
}

export function createPokeTextures(): PokeTextures {
  // paillettes : étoiles à 4 branches (canal R = éclat), couleurs pour la lecture RGB
  const glitter = make(512, (d) => {
    const r = rng(11);
    for (let k = 0; k < 900; k++) {
      const b = 0.35 + 0.65 * r() ** 0.6;
      const [cr, cg, cb] = hue2rgb(r(), 0.35, b);
      splat(d, 512, r() * 512, r() * 512, [Math.max(cr, b * 0.8), cg, cb], 1 + r() * 2.2, true);
    }
  });
  // moucheté sombre : la plupart des pixels gris foncé, quelques points colorés vifs (iri-7/8/9)
  const speckle = (seed: number, tint: number) =>
    make(256, (d) => {
      const r = rng(seed);
      for (let i = 0; i < 256 * 256; i++) {
        const v = 0.08 + 0.32 * r() ** 1.6;
        const g = r();
        const lit = g > 0.93 ? 0.5 + 0.5 * r() : 0;
        const [cr, cg, cb] = hue2rgb((r() + tint) % 1, 0.75, lit);
        d[i * 4] = v + cr;
        d[i * 4 + 1] = v + cg;
        d[i * 4 + 2] = v + cb + 0.02;
      }
    });
  // moucheté clair pastel (iri-1/2)
  const pastel = (seed: number) =>
    make(256, (d) => {
      const r = rng(seed);
      for (let i = 0; i < 256 * 256; i++) {
        const v = 0.86 + (r() - 0.5) * 0.22;
        const [cr, cg, cb] = hue2rgb(r(), 0.18, 1);
        d[i * 4] = v * (0.88 + cr * 0.12) - 0.04;
        d[i * 4 + 1] = v * (0.9 + cg * 0.12) - 0.01;
        d[i * 4 + 2] = v * (0.94 + cb * 0.1) + 0.04;
      }
    });
  // bruit gris : blanc lissé (2 octaves) centré 0,48
  const noise = make(256, (d) => {
    const r = rng(23);
    const w = new Float32Array(256 * 256).map(() => r());
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        let s = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += w[((y + j + 256) % 256) * 256 + ((x + i + 256) % 256)] * (i || j ? 1 : 2);
        const v = 0.48 + (s / 10 - 0.5) * 1.7 + (w[y * 256 + x] - 0.5) * 0.25;
        d.fill(v, (y * 256 + x) * 4, (y * 256 + x) * 4 + 3);
      }
  });
  const grain = make(256, (d) => {
    const r = rng(31);
    for (let i = 0; i < 256 * 256; i++) d.fill(0.28 * r() ** 3.2, i * 4, i * 4 + 3);
  });
  const value = make(256, (d) => {
    const r = rng(41);
    for (let i = 0; i < 256 * 256; i++) d.fill(r(), i * 4, i * 4 + 3);
  });
  value.minFilter = LinearFilter;
  value.generateMipmaps = false;
  // confettis : traits courts et points saturés épars sur noir (double rare)
  const confetti = (seed: number) =>
    make(512, (d) => {
      const r = rng(seed);
      for (let i = 0; i < 512 * 512; i++) d.fill(0.035 + r() * 0.03, i * 4, i * 4 + 3);
      for (let k = 0; k < 1400; k++) {
        const x = r() * 512, y = r() * 512, a = r() * Math.PI, len = 2 + r() * 7;
        const col = hue2rgb(r(), 0.8, 0.7 + 0.3 * r());
        for (let s = 0; s <= len; s++) splat(d, 512, x + Math.cos(a) * s, y + Math.sin(a) * s, col, 0.9, false);
      }
    });
  const t = {
    glitter,
    iri7: speckle(71, 0.0),
    iri8: speckle(83, 0.33),
    iri9: speckle(97, 0.66),
    iri1: pastel(101),
    iri2: pastel(113),
    noise,
    grain,
    value,
    dank1: confetti(127),
    dank2: confetti(131),
  };
  return { ...t, list: Object.values(t) };
}
