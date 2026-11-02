/**
 * Décors des 14 Merveilles : relief, sol, eau, bassin, crête lointaine, végétation et accessoires.
 *
 * - **Relief partagé CPU ↔ GPU** : un bruit de valeur « hash sans sinus » (Dave Hoskins) écrit deux fois, en TSL et en JS,
 *   avec les mêmes constantes → on sait, côté JS, à quelle hauteur poser un palmier ou un bateau sur le relief que le
 *   GPU dessine (les écarts float32 / float64 sont de l'ordre du millimètre, absorbés en enfonçant un peu les pieds).
 * - **Sol** : couleur selon l'altitude ET la pente (pente calculée dans le vertex shader par différences finies, passée en
 *   varying) → herbe / sable sur le plat, roche sur les versants, neige en haut ; rides de sable pour les dunes.
 * - **Eau** : profondeur réelle (relief sous l'eau) → lagon clair au bord, bleu profond au large ; scintillement.
 * - **Accessoires** : modèles CC0 / CC-BY (Quaternius, Poly by Google — crédits dans CREDITS.md) dispersés en
 *   `InstancedMesh` (un draw call par matériau et par espèce) selon une recette par merveille : anneau, secteur, pente
 *   max, zones interdites (monument, couloir de vue entre la vitre et le monument).
 */
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import {
  Fn,
  abs,
  atan,
  color,
  cos,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  time,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { siteUrl } from './siteRoot';
import type { N } from './tsl';

export const Y0 = -0.75;
export const WATER_Y = Y0 - 0.02;
export const WORLD_R = 46;
/** centre du monument (repère diorama) */
export const MON = { x: 0, z: -3.8 };

export type TerrainType = 'dunes' | 'marble' | 'mountains' | 'water' | 'canyon';
export type PropKind = 'palm' | 'cypress' | 'acacia' | 'tree' | 'pine' | 'rocks' | 'olive' | 'sailboat' | 'camel' | 'bush';

export interface PropRecipe {
  kind: PropKind;
  count: number;
  /** distance au centre du monument [min, max] */
  ring: [number, number];
  /** secteur angulaire (rad, 0 = vers la vitre (+z), sens trigo vu de dessus) ; défaut : tout le tour */
  arc?: [number, number];
  /** hauteur [min, max] (unités diorama) */
  size: [number, number];
  /** sur l'eau (bateaux) au lieu du sol */
  water?: boolean;
  /** pente max acceptée (dh/dx) */
  slope?: number;
  /** autorise le couloir de vue (entre la vitre et le monument) : accessoires de premier plan sur les côtés */
  front?: boolean;
  /** graine de dispersion */
  seed?: number;
  /** teinte multipliée */
  tint?: string;
}

export interface EnvSpec {
  terrain: TerrainType;
  /** rayon du plateau plat autour du monument */
  plateau: number;
  /** amplitude du relief (1 = défaut) */
  relief?: number;
  /** couleurs du sol : plat / altitude / roche ; défaut tiré de l'atmosphère */
  colors?: { low: string; high: string; rock: string; snow?: string };
  /** bassin rectangulaire (Taj Mahal) : [x, z, largeur, longueur] */
  pool?: [number, number, number, number];
  /** couloir de vue dégagé (demi-largeur) */
  corridor?: number;
  props: PropRecipe[];
}

const SAND = { low: '#d9a866', high: '#e8c48a', rock: '#a77a4c' };
const MED = { low: '#8b8a52', high: '#a39a64', rock: '#8f8270' };
const GREEN = { low: '#4f6b34', high: '#3e5a2c', rock: '#6f6a5e', snow: '#e8edf2' };
const JUNGLE = { low: '#3d5a28', high: '#2f4a22', rock: '#5f5b4e' };

/** Recettes de décor par carte. */
export const WONDER_ENVS: Record<string, EnvSpec> = {
  'mrv-grande-pyramide-de-kheops': {
    terrain: 'dunes', plateau: 6.5, colors: SAND,
    props: [
      { kind: 'camel', count: 4, ring: [3.2, 5.5], arc: [0.6, 1.4], size: [0.13, 0.16], front: true, seed: 3 },
      { kind: 'rocks', count: 10, ring: [4, 14], size: [0.15, 0.4], seed: 5, tint: '#d8b080' },
      { kind: 'palm', count: 6, ring: [9, 16], arc: [-2.2, -1.2], size: [0.35, 0.5], seed: 9 },
    ],
  },
  'mrv-jardins-suspendus-de-babylone': {
    terrain: 'dunes', plateau: 5.5, relief: 0.5, colors: { low: '#c9a46c', high: '#d8b67e', rock: '#a07c52' },
    props: [
      { kind: 'palm', count: 40, ring: [3.4, 14], size: [1.0, 1.6], seed: 11, front: true },
      { kind: 'bush', count: 14, ring: [3.2, 8], size: [0.25, 0.4], seed: 12, tint: '#9fb070' },
      { kind: 'camel', count: 2, ring: [4, 6], arc: [0.5, 1.2], size: [0.22, 0.26], front: true, seed: 13 },
    ],
  },
  'mrv-statue-de-zeus-a-olympie': {
    terrain: 'marble', plateau: 5.2, colors: MED,
    props: [
      { kind: 'olive', count: 18, ring: [4.2, 12], size: [0.7, 1.1], seed: 21, front: true },
      { kind: 'cypress', count: 10, ring: [5, 14], arc: [-2.6, 2.6], size: [1.4, 2.2], seed: 22 },
      { kind: 'rocks', count: 6, ring: [4, 9], size: [0.15, 0.3], seed: 23 },
    ],
  },
  'mrv-temple-d-artemis-a-ephese': {
    terrain: 'marble', plateau: 5.5, colors: { low: '#7f8752', high: '#929a62', rock: '#8a8170' },
    props: [
      { kind: 'cypress', count: 12, ring: [4.5, 13], size: [1.0, 1.7], seed: 31, front: true },
      { kind: 'olive', count: 12, ring: [5, 14], size: [0.6, 0.9], seed: 32 },
      { kind: 'bush', count: 16, ring: [3.6, 9], size: [0.2, 0.35], seed: 33 },
    ],
  },
  'mrv-mausolee-d-halicarnasse': {
    terrain: 'water', plateau: 5.5, colors: MED,
    props: [
      { kind: 'cypress', count: 10, ring: [4.3, 9], arc: [-2.8, 2.8], size: [0.9, 1.4], seed: 41, front: true },
      { kind: 'olive', count: 8, ring: [4.5, 8], size: [0.5, 0.8], seed: 42 },
      { kind: 'sailboat', count: 6, ring: [9, 22], size: [0.5, 0.8], water: true, seed: 43 },
    ],
  },
  'mrv-colosse-de-rhodes': {
    terrain: 'water', plateau: 3.4, colors: MED,
    props: [
      { kind: 'sailboat', count: 9, ring: [4.5, 20], size: [0.7, 1.2], water: true, seed: 51, front: true },
      { kind: 'rocks', count: 8, ring: [2.4, 4], size: [0.2, 0.4], seed: 52 },
    ],
  },
  'mrv-phare-d-alexandrie': {
    terrain: 'water', plateau: 3.8, colors: SAND,
    props: [
      { kind: 'sailboat', count: 8, ring: [5, 20], size: [0.35, 0.55], water: true, seed: 61, front: true },
      { kind: 'palm', count: 6, ring: [2.6, 3.6], size: [0.5, 0.7], seed: 62 },
      { kind: 'rocks', count: 8, ring: [2.8, 4.2], size: [0.2, 0.45], seed: 63 },
    ],
  },
  'mrv-grande-muraille-de-chine': {
    terrain: 'mountains', plateau: 5.8, relief: 1.1, colors: GREEN,
    props: [
      { kind: 'tree', count: 40, ring: [4.5, 18], size: [0.5, 0.9], slope: 1.6, seed: 71, front: true, tint: '#c8d6a0' },
      { kind: 'pine', count: 18, ring: [6, 20], size: [0.7, 1.1], slope: 1.6, seed: 72 },
    ],
  },
  'mrv-petra-khazneh': {
    terrain: 'canyon', plateau: 3.2, colors: { low: '#c58466', high: '#b26c51', rock: '#9c5640' },
    corridor: 1.2,
    props: [
      { kind: 'rocks', count: 14, ring: [2, 7], size: [0.18, 0.45], seed: 81, tint: '#d79a7a', front: true },
      { kind: 'camel', count: 2, ring: [2.4, 3.2], arc: [0.3, 0.9], size: [0.3, 0.34], seed: 82, front: true },
      { kind: 'bush', count: 6, ring: [2.5, 6], size: [0.15, 0.25], seed: 83, tint: '#a0a070' },
    ],
  },
  'mrv-christ-redempteur-rio': {
    terrain: 'water', plateau: 3.0, colors: JUNGLE,
    props: [
      { kind: 'tree', count: 22, ring: [2.0, 3.6], size: [0.6, 0.95], seed: 91, front: true },
      { kind: 'palm', count: 10, ring: [6, 18], size: [0.5, 0.8], seed: 92 },
      { kind: 'sailboat', count: 5, ring: [6, 20], size: [0.3, 0.5], water: true, seed: 93 },
    ],
  },
  'mrv-machu-picchu': {
    terrain: 'mountains', plateau: 5.0, relief: 1.35, colors: JUNGLE,
    props: [
      { kind: 'tree', count: 46, ring: [4.6, 18], size: [0.22, 0.4], slope: 2.2, seed: 101, front: true },
      { kind: 'bush', count: 20, ring: [4.2, 9], size: [0.12, 0.2], slope: 2.2, seed: 102 },
    ],
  },
  'mrv-chichen-itza': {
    terrain: 'marble', plateau: 4.6, relief: 0.35, colors: JUNGLE,
    props: [
      { kind: 'tree', count: 110, ring: [3.9, 18], size: [1.2, 2.0], seed: 111, front: true },
      { kind: 'palm', count: 10, ring: [4.6, 12], size: [1.2, 1.7], seed: 112 },
      { kind: 'bush', count: 18, ring: [4, 8], size: [0.3, 0.5], seed: 113 },
    ],
  },
  'mrv-colisee-de-rome': {
    terrain: 'marble', plateau: 5.5, relief: 0.6, colors: MED,
    props: [
      { kind: 'acacia', count: 22, ring: [4.4, 13], size: [0.55, 0.8], seed: 121, front: true, tint: '#b8c890' },
      { kind: 'cypress', count: 10, ring: [5, 13], size: [0.6, 0.9], seed: 122 },
      { kind: 'rocks', count: 6, ring: [3.8, 6], size: [0.12, 0.25], seed: 123, tint: '#e0c8a8' },
    ],
  },
  'mrv-taj-mahal': {
    terrain: 'marble', plateau: 6.5, relief: 0.4, colors: { low: '#5f7a3c', high: '#6d8644', rock: '#8c8276' },
    pool: [0, -1.6, 0.42, 2.0],
    props: [
      // allées de cyprès le long du bassin (placées à la main, voir `rows`)
      { kind: 'bush', count: 16, ring: [4.2, 9], size: [0.12, 0.2], seed: 131 },
      { kind: 'tree', count: 18, ring: [6, 15], size: [0.3, 0.45], seed: 132 },
    ],
  },
};

/** Allées plantées à la main (en plus des recettes) : [espèce, x, z, taille]. */
const ROWS: Record<string, Array<[PropKind, number, number, number]>> = {
  'mrv-taj-mahal': [-1, 1].flatMap((sx) => Array.from({ length: 5 }, (_, i) => ['cypress', sx * 0.62, -0.75 - i * 0.48, 0.42] as [PropKind, number, number, number])),
};

// ───────────────────────────────────────────── bruit de valeur partagé (TSL ↔ JS)
const fr = (x: number) => x - Math.floor(x);
function hashJS(x: number, y: number): number {
  let p0 = fr(x * 0.1031), p1 = fr(y * 0.1031), p2 = fr(x * 0.1031);
  const d = p0 * (p1 + 33.33) + p1 * (p2 + 33.33) + p2 * (p0 + 33.33);
  p0 += d; p1 += d; p2 += d;
  return fr((p0 + p1) * p2);
}
function vnoiseJS(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hashJS(ix, iy), b = hashJS(ix + 1, iy), c = hashJS(ix, iy + 1), d = hashJS(ix + 1, iy + 1);
  return ((a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy) * 2 - 1;
}
function fbmJS(x: number, y: number, oct: number): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoiseJS(x * f + i * 17.3, y * f - i * 9.1);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

const hashT = (p: N): N => {
  let p3: N = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  p3 = p3.add(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
};
const vnoiseT = Fn(([p]: [N]) => {
  const i: N = floor(p), f: N = fract(p);
  const u: N = f.mul(f).mul(float(3).sub(f.mul(2)));
  const a = hashT(i), b = hashT(i.add(vec2(1, 0))), c = hashT(i.add(vec2(0, 1))), d = hashT(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y).mul(2).sub(1);
});
function fbmT(p: N, oct: number): N {
  let s: N = float(0);
  let a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s = s.add(vnoiseT(p.mul(f).add(vec2(i * 17.3, -i * 9.1))).mul(a));
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s.div(n);
}

// ───────────────────────────────────────────── relief (mêmes formules des deux côtés)
interface Ops {
  fbm(x: N, y: N, oct: number): N;
  abs(v: N): N;
  max(a: N, b: N | number): N;
  ss(e0: number, e1: number, v: N): N;
  sin(v: N): N;
  len(x: N, y: N): N;
  add(a: N, b: N | number): N;
  mul(a: N, b: N | number): N;
  sub(a: N, b: N | number): N;
  mix(a: N, b: N, t: N): N;
  c(v: number): N;
}
const JS: Ops = {
  fbm: (x, y, o) => fbmJS(x, y, o),
  abs: Math.abs,
  max: (a, b) => Math.max(a, b),
  ss: (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); },
  sin: Math.sin,
  len: (x, y) => Math.hypot(x, y),
  add: (a, b) => a + b,
  mul: (a, b) => a * b,
  sub: (a, b) => a - b,
  mix: (a, b, t) => a + (b - a) * t,
  c: (v) => v,
};
const GPU: Ops = {
  fbm: (x, y, o) => fbmT(vec2(x, y), o),
  abs: (v) => abs(v),
  max: (a, b) => max(a, b),
  ss: (e0, e1, v) => smoothstep(e0, e1, v),
  sin: (v) => sin(v),
  len: (x, y) => length(vec2(x, y)),
  add: (a, b) => a.add(b),
  mul: (a, b) => a.mul(b),
  sub: (a, b) => a.sub(b),
  mix: (a, b, t) => mix(a, b, t),
  c: (v) => float(v),
};

/** Hauteur du sol au point (x, z) du repère diorama. */
function heightGeneric(o: Ops, env: EnvSpec, x: N, z: N): N {
  const R = env.relief ?? 1;
  const dM = o.len(o.sub(x, MON.x), o.sub(z, MON.z));
  const near = o.ss(env.plateau, env.plateau + 2.8, dM); // plateau plat autour du monument
  // relief seulement derrière la vitre ou loin : la caméra orbite au-dessus d'un sol plat
  const behind = o.ss(0.0, -2.0, z);
  const far = o.ss(24, 30, o.len(x, z));
  const mask = o.max(behind, far);
  const n = o.fbm(o.mul(x, 0.22), o.mul(z, 0.22), 5);
  const n2 = o.fbm(o.mul(x, 0.9), o.mul(z, 0.9), 3);
  let h: N;
  switch (env.terrain) {
    case 'dunes': {
      const ridge = o.abs(o.sin(o.add(o.mul(x, 0.55), o.mul(n, 3.2))));
      h = o.mul(o.add(o.mul(ridge, 0.55), o.mul(n2, 0.06)), near);
      h = o.add(h, o.mul(far, o.mul(o.abs(n), 2.2)));
      break;
    }
    case 'mountains':
      h = o.add(o.mul(o.add(o.mul(o.abs(n), 3.6), o.mul(o.abs(n2), 0.35)), near), o.mul(far, o.mul(o.abs(n), 6)));
      break;
    case 'water':
      return o.add(o.c(Y0), o.sub(o.mul(o.mul(o.add(o.mul(n, 2.4), 0.35), o.ss(env.plateau + 0.6, env.plateau + 4.5, dM)), mask), o.mul(o.ss(env.plateau - 0.4, env.plateau + 0.8, dM), 0.55)));
    case 'canyon':
      h = o.add(o.add(o.mul(o.ss(1.3, 3.2, o.abs(x)), 3.6), o.mul(n2, 0.12)), o.mul(o.mul(o.abs(n), 0.6), near));
      h = o.add(h, o.mul(far, o.mul(o.abs(n), 3)));
      break;
    default:
      h = o.add(o.mul(o.mul(o.max(n, 0), 1.6), near), o.mul(n2, 0.03));
      h = o.add(h, o.mul(far, o.mul(o.abs(n), 2.4)));
  }
  return o.add(o.c(Y0), o.mul(o.mul(h, mask), R));
}

export const heightAt = (env: EnvSpec, x: number, z: number): number => heightGeneric(JS, env, x, z) as number;
const heightT = (env: EnvSpec, x: N, z: N): N => heightGeneric(GPU, env, x, z);

// ───────────────────────────────────────────── maillages
/** Disque à rayons non uniformes (dense au centre), dans le plan xz. */
export function radialDisc(radius: number, theta: number, rings: number, y = 0): BufferGeometry {
  const geo = new RingGeometry(0.02, 1, theta, rings);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yy = pos.getY(i);
    const r = Math.hypot(x, yy);
    const k = (Math.pow(r, 2.2) * radius) / Math.max(r, 1e-6);
    pos.setXY(i, x * k, yy * k);
  }
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  geo.computeBoundingSphere();
  return geo;
}

interface AtmLike {
  ground: string;
  fog: string;
  top: string;
  horizon: string;
  sun: string;
}

function groundColors(env: EnvSpec, atm: AtmLike) {
  return env.colors ?? { low: atm.ground, high: atm.ground, rock: '#6f665a' };
}

function buildGround(env: EnvSpec, atm: AtmLike, quality: 'high' | 'mobile', mats: Material[]): Mesh {
  const p = positionLocal;
  const y = heightT(env, p.x, p.z);
  // pente par différences finies (dans le vertex shader) → varying
  const e = 0.12;
  const hx = heightT(env, p.x.add(e), p.z), hz = heightT(env, p.x, p.z.add(e));
  const slope: N = varying(length(vec2(hx.sub(y), hz.sub(y))).div(e), 'vSlope');
  const alt: N = varying(y, 'vAlt');
  const xz: N = varying(p.xz, 'vXZ');
  const C = groundColors(env, atm);
  const detail = fbmT(xz.mul(2.7), 3).mul(0.5).add(0.5);
  let col: N = mix(color(C.low), color(C.high), smoothstep(Y0 + 0.2, Y0 + 2.2, alt).mul(0.8).add(detail.mul(0.35)));
  col = mix(col, color(C.rock), smoothstep(0.55, 1.15, slope));
  if (env.terrain === 'dunes') {
    // rides de sable, perpendiculaires au vent
    const rip = sin(xz.x.mul(9).add(xz.y.mul(3)).add(fbmT(xz.mul(0.8), 2).mul(6))).mul(0.5).add(0.5);
    col = col.mul(rip.mul(0.08).add(0.94));
  }
  if (C.snow) col = mix(col, color(C.snow), smoothstep(Y0 + 3.6, Y0 + 4.6, alt).mul(smoothstep(1.4, 0.6, slope)));
  if (env.terrain === 'water') col = mix(mix(color('#d8c49a'), col, 0.25), col, smoothstep(WATER_Y + 0.02, WATER_Y + 0.35, alt)); // plages
  col = col.mul(detail.mul(0.18).add(0.9));
  const m = new MeshStandardNodeMaterial({ flatShading: true });
  m.colorNode = col;
  m.roughnessNode = float(0.95);
  m.metalnessNode = float(0);
  m.positionNode = vec3(p.x, y, p.z);
  mats.push(m);
  return new Mesh(radialDisc(WORLD_R + 1, quality === 'mobile' ? 140 : 220, quality === 'mobile' ? 48 : 80), m);
}

function buildWater(env: EnvSpec, atm: AtmLike, quality: 'high' | 'mobile', mats: Material[]): Mesh {
  const p = positionLocal;
  const depth: N = varying(float(WATER_Y).sub(heightT(env, p.x, p.z)), 'vDepth');
  const xz: N = varying(p.xz, 'vWXZ');
  const shallow = color('#3fb6b0'), deep = mix(color('#0a2a44'), color(atm.horizon), 0.18);
  let col: N = mix(shallow, deep, smoothstep(0.0, 0.6, depth));
  // écume au bord
  col = mix(color('#f4f1e6'), col, smoothstep(0.0, 0.05, depth));
  const sparkle = pow(fbmT(xz.mul(3.5).add(vec2(time.mul(0.25), time.mul(-0.18))), 2).mul(0.5).add(0.5), 6).mul(1.4);
  const m = new MeshStandardNodeMaterial({ flatShading: true });
  const wave = sin(p.x.mul(3.1).add(time.mul(1.3))).mul(0.012).add(sin(p.z.mul(2.3).sub(time.mul(0.9)).add(p.x)).mul(0.009));
  m.positionNode = vec3(p.x, p.y.add(wave), p.z);
  m.colorNode = col;
  m.roughnessNode = float(0.12);
  m.metalnessNode = float(0.15);
  m.emissiveNode = color(atm.sun).mul(sparkle.mul(0.35)).add(color(atm.horizon).mul(0.05));
  mats.push(m);
  return new Mesh(radialDisc(WORLD_R + 1, quality === 'mobile' ? 90 : 170, quality === 'mobile' ? 26 : 44, WATER_Y), m);
}

/** Bassin miroir rectangulaire (Taj Mahal) avec sa margelle. */
function buildPool(env: EnvSpec, atm: AtmLike, mats: Material[]): Group {
  const [x, z, w, l] = env.pool!;
  const g = new Group();
  const water = new MeshStandardNodeMaterial();
  water.colorNode = mix(color('#123a4f'), color(atm.horizon), 0.25);
  water.roughnessNode = float(0.03);
  water.metalnessNode = float(0.6);
  water.emissiveNode = color(atm.top).mul(0.12);
  const rim = new MeshStandardNodeMaterial();
  rim.colorNode = color('#e8e1d4');
  rim.roughnessNode = float(0.6);
  mats.push(water, rim);
  const y = heightAt(env, x, z) + 0.02;
  const pw = new Mesh(new PlaneGeometry(w, l), water);
  pw.rotation.x = -Math.PI / 2;
  pw.position.set(x, y + 0.01, z);
  const border = new Mesh(new PlaneGeometry(w + 0.5, l + 0.5), rim);
  border.rotation.x = -Math.PI / 2;
  border.position.set(x, y, z);
  g.add(border, pw);
  return g;
}

/** Ligne de crêtes lointaine (ferme le monde, brume propre). */
function buildRidge(env: EnvSpec, atm: AtmLike, mats: Material[]): Mesh {
  const H: Record<TerrainType, number> = { mountains: 12, canyon: 7, dunes: 2.4, marble: 3.6, water: 1.6 };
  const geo = new CylinderGeometry(WORLD_R, WORLD_R, 1, 256, 1, true);
  geo.translate(0, 0.5, 0);
  const m = new MeshBasicNodeMaterial({ fog: false, side: DoubleSide });
  const p: N = positionLocal;
  const a = atan(p.z, p.x);
  const ring = vec2(cos(a).mul(3.2), sin(a).mul(3.2));
  const n1 = fbmT(ring, 5).mul(0.5).add(0.5);
  const n2 = fbmT(ring.mul(3.1).add(9), 3).mul(0.5).add(0.5);
  const crest = n1.mul(0.75).add(n2.mul(0.35)).mul(H[env.terrain] * (env.relief ?? 1)).add(0.3);
  m.positionNode = vec3(p.x, float(Y0 - 0.4).add(p.y.mul(crest.add(0.4))), p.z);
  const C = groundColors(env, atm);
  const tint = mix(color(atm.fog), mix(color(C.high), color(atm.top), 0.45), 0.55);
  m.colorNode = mix(color(atm.fog), tint, smoothstep(0.0, 0.85, p.y).mul(0.65));
  mats.push(m);
  const mesh = new Mesh(geo, m);
  mesh.frustumCulled = false;
  return mesh;
}

// ───────────────────────────────────────────── accessoires (InstancedMesh)
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const propCache = new Map<PropKind, Promise<Array<{ geo: BufferGeometry; mat: Material; local: Matrix4 }> | null>>();

function loadProp(kind: PropKind) {
  let p = propCache.get(kind);
  if (!p) {
    p = loader
      .loadAsync(siteUrl(`models/merveilles/props/${kind}.glb`))
      .then((g) => {
        g.scene.updateMatrixWorld(true);
        const out: Array<{ geo: BufferGeometry; mat: Material; local: Matrix4 }> = [];
        g.scene.traverse((o: Object3D) => {
          if (o instanceof Mesh) out.push({ geo: o.geometry, mat: o.material as Material, local: o.matrixWorld.clone() });
        });
        return out;
      })
      .catch((e) => {
        console.warn(`[merveilles] accessoire ${kind} indisponible`, e);
        return null;
      });
    propCache.set(kind, p);
  }
  return p;
}

export function preloadEnv(cardId: string): Promise<unknown> {
  const env = WONDER_ENVS[cardId];
  if (!env) return Promise.resolve();
  const kinds = new Set<PropKind>([...env.props.map((r) => r.kind), ...(ROWS[cardId] ?? []).map((r) => r[0])]);
  return Promise.all([...kinds].map(loadProp));
}

/** PRNG déterministe (mulberry32) : même décor à chaque ouverture de la même carte. */
function rng(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Placement {
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
  tilt: number;
}

function scatter(env: EnvSpec, r: PropRecipe): Placement[] {
  const rand = rng(r.seed ?? 1);
  const out: Placement[] = [];
  const corridor = env.corridor ?? 1.6;
  for (let tries = 0; out.length < r.count && tries < r.count * 40; tries++) {
    const a = r.arc ? r.arc[0] + rand() * (r.arc[1] - r.arc[0]) : rand() * Math.PI * 2;
    const d = r.ring[0] + Math.sqrt(rand()) * (r.ring[1] - r.ring[0]);
    const x = MON.x + Math.sin(a) * d, z = MON.z + Math.cos(a) * d;
    if (Math.hypot(x, z) > WORLD_R - 3) continue;
    // couloir de vue : entre la vitre et le monument, rien (sauf accessoires de premier plan, et seulement sur les côtés)
    if (z > MON.z && Math.abs(x) < corridor + (r.front ? 0 : 1.2)) continue;
    if (!r.front && z > -2.2) continue;
    if (z > -0.4) continue; // jamais contre la vitre
    const h = heightAt(env, x, z);
    if (r.water) {
      if (h > WATER_Y - 0.15) continue; // assez de fond
    } else {
      if (env.terrain === 'water' && h < WATER_Y + 0.03) continue; // pas dans l'eau
      if (env.pool && Math.abs(x - env.pool[0]) < env.pool[2] / 2 + 0.5 && Math.abs(z - env.pool[1]) < env.pool[3] / 2 + 0.5) continue;
      const e = 0.15;
      const sl = Math.hypot(heightAt(env, x + e, z) - h, heightAt(env, x, z + e) - h) / e;
      if (sl > (r.slope ?? 0.9)) continue;
    }
    // pas trop serrés entre eux
    const s = r.size[0] + rand() * (r.size[1] - r.size[0]);
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < Math.max(o.s, s) * 0.35)) continue;
    out.push({ x, y: r.water ? WATER_Y : h - 0.04 * s, z, s, ry: rand() * Math.PI * 2, tilt: r.water ? 0 : (rand() - 0.5) * 0.08 });
  }
  return out;
}

async function buildProps(cardId: string, env: EnvSpec, group: Group, isDisposed: () => boolean) {
  const lists = new Map<PropKind, Array<Placement & { tint?: string }>>();
  for (const r of env.props) {
    const arr = lists.get(r.kind) ?? [];
    arr.push(...scatter(env, r).map((p) => ({ ...p, tint: r.tint })));
    lists.set(r.kind, arr);
  }
  for (const [kind, x, z, s] of ROWS[cardId] ?? []) {
    const arr = lists.get(kind) ?? [];
    arr.push({ x, z, y: heightAt(env, x, z) - 0.03, s, ry: (x * 7 + z * 3) % 6.28, tilt: 0 });
    lists.set(kind, arr);
  }
  const M = new Matrix4(), q = new Quaternion(), v = new Vector3(), sc = new Vector3(), ax = new Vector3(1, 0, 0);
  for (const [kind, places] of lists) {
    const parts = await loadProp(kind);
    if (!parts || isDisposed() || !places.length) continue;
    for (const part of parts) {
      const im = new InstancedMesh(part.geo, part.mat, places.length);
      places.forEach((p, i) => {
        q.setFromAxisAngle(ax, p.tilt).multiply(new Quaternion().setFromAxisAngle(v.set(0, 1, 0), p.ry));
        M.compose(v.set(p.x, p.y, p.z), q, sc.setScalar(p.s)).multiply(part.local);
        im.setMatrixAt(i, M);
        if (p.tint) im.setColorAt(i, new Color(p.tint));
      });
      // teintes : si une partie des instances est teintée, les autres doivent être blanches (sinon noires)
      if (places.some((p) => p.tint)) places.forEach((p, i) => !p.tint && im.setColorAt(i, new Color('#ffffff')));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.userData.sharedModel = true; // géométrie / matériau du cache : jamais libérés par l'instance
      group.add(im);
    }
  }
}

/**
 * Construit le décor d'une merveille. Les accessoires arrivent en asynchrone (préchargés par `preloadEnv`, donc en
 * pratique immédiatement) ; `dispose()` libère sol, eau, crête (les accessoires sont partagés).
 */
export function buildEnvironment(cardId: string, atm: AtmLike & { terrainType: TerrainType }, quality: 'high' | 'mobile') {
  const env: EnvSpec = WONDER_ENVS[cardId] ?? { terrain: atm.terrainType, plateau: 2.3, props: [] };
  const mats: Material[] = [];
  const group = new Group();
  const ground = buildGround(env, atm, quality, mats);
  group.add(ground, buildRidge(env, atm, mats));
  if (env.terrain === 'water') group.add(buildWater(env, atm, quality, mats));
  if (env.pool) group.add(buildPool(env, atm, mats));
  let disposed = false;
  void buildProps(cardId, env, group, () => disposed);
  return {
    group,
    env,
    dispose() {
      disposed = true;
      for (const m of mats) m.dispose();
      group.traverse((o) => {
        if (o.userData.sharedModel) return;
        if (o instanceof Mesh) o.geometry.dispose();
      });
    },
  };
}

void normalize;
