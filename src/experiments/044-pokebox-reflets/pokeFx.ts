import { abs, atan, clamp, cos, dFdx, dFdy, dot, float, floor, fract, length, max, min, mix, normalize, sin, smoothstep, step, texture, vec2, vec3 } from 'three/tsl';
import type { Texture } from 'three/webgpu';
import type { N } from '../../core/tsl';
import type { PokeTextures } from './pokeTex';

/**
 * PORTAGE TSL DES 12 REFLETS DE POKÉBOX (pokebox.lopatkin.net, 07/11) — eux-mêmes un portage GLSL de la célèbre
 * feuille CSS « pokemon-cards-css » (calques en modes de fusion empilés).
 *
 * COMMENT ÇA MARCHE (ce qu'on a compris en lisant leurs shaders) :
 *  1. Une seule « lumière » : `pointer` = l'endroit où l'ŒIL se projette sur le plan de la carte (UV 0..1, calculé
 *     chaque image depuis la position de la caméra dans le repère de la carte — chez eux la tête est suivie à la
 *     webcam). `bg` = 0,37 + pointer × 0,26 : la même chose en amplitude réduite, pour les dégradés qui « glissent ».
 *  2. Deux masques PAR CARTE : `mask` (où est le foil holo, en niveaux de gris qui SUIVENT LA MATIÈRE de
 *     l'illustration — c'est ça qui fait « imprimé » et pas « peint dessus ») et `foil` (la gravure / etch : motif en
 *     relief, dont on dérive les éclats par dérivées écran).
 *  3. Chaque rareté empile 3 à 8 calques : arc-en-ciel « sunpillar » (6 pastels) qui défile avec `bg`, barres
 *     diagonales dont l'angle suit la rotation, reflet radial centré sur `pointer`, paillettes de texture, puis un
 *     réglage luminosité / contraste / saturation de la zone. Tout en modes de fusion Photoshop (overlay, color-dodge,
 *     soft-light, hard-light, screen…) calculés en espace écran (sRGB).
 * Les valeurs (angles, densités, couleurs HSL…) sont celles de leur configuration réglée à la main.
 */

export interface PokeIn {
  uv: N;
  /** couleur de la carte, sRGB 0..1 */
  base: N;
  mask: N;
  foil: N;
  hasFoil: boolean;
  pointer: N;
  bg: N;
  /** distance du pointeur au centre (0..1) */
  pfc: N;
  /** rotation Y de la carte (degrés) */
  rotX: N;
  time: N;
  /** intensité globale (holoIntensity, 0,75 chez eux) */
  op: N;
  T: PokeTextures;
  /**
   * Carte de placement tirée de l'illustration (effets « placés ») : `decor` = décor arrière hors sujet et hors texte,
   * `struct` = structure de l'image (bords, motifs — 0 sur les aplats), `equip` = « équipement » du sujet (zones
   * détaillées ou brillantes du personnage : armure, objets, accessoires).
   */
  place?: { decor: N; struct: N; equip: N };
}
export interface PokeOut {
  color: N;
  /** zone où l'original appliquait son réglage final (il sortait plus tôt ailleurs) ; 1 = toute la carte */
  area: N;
}

// ───────────────────────────────────────────── modes de fusion et réglages (identiques au GLSL)
const V1 = () => vec3(1);
const LUM = vec3(0.2126, 0.7152, 0.0722);
const lum = (c: N): N => dot(c, LUM);
export const B = {
  dodge: (a: N, b: N): N => min(a.div(max(V1().sub(b), 0.001)), V1()),
  overlay: (a: N, b: N): N => mix(a.mul(b).mul(2), V1().sub(V1().sub(a).mul(V1().sub(b)).mul(2)), step(float(0.5), a)),
  soft: (a: N, b: N): N => V1().sub(b.mul(2)).mul(a).mul(a).add(b.mul(2).mul(a)),
  hard: (a: N, b: N): N => B.overlay(b, a),
  screen: (a: N, b: N): N => V1().sub(V1().sub(a).mul(V1().sub(b))),
  excl: (a: N, b: N): N => a.add(b).sub(a.mul(b).mul(2)),
  plus: (a: N, b: N): N => min(a.add(b), V1()),
  lumi: (a: N, b: N): N => a.add(lum(b).sub(lum(a))),
  lighten: (a: N, b: N): N => max(a, b),
  hue: (a: N, b: N): N => mix(a, b, 0.5),
  burn: (a: N, b: N): N => V1().sub(min(V1().sub(a).div(max(b, 0.001)), V1())),
};
const bright = (c: N, k: number | N): N => c.mul(k);
const contrast = (c: N, k: number | N): N => c.sub(0.5).mul(k).add(0.5);
const sat = (c: N, s: number | N): N => mix(vec3(lum(c)), c, s);
const c01 = (c: N): N => clamp(c, 0, 1);
const inv = (x: N): N => float(1).sub(x);
const deg = Math.PI / 180;
const dirv = (a: number) => vec2(Math.cos(a * deg), Math.sin(a * deg));

/** Dégradé « sunpillar » : 6 pastels en boucle (interpolation linéaire exacte, sans branchement). */
const SUN: Array<[number, number, number]> = [[1, 0.46, 0.46], [1, 0.9, 0.38], [0.58, 1, 0.38], [0.52, 1, 0.92], [0.48, 0.53, 1], [0.74, 0.46, 1]];
export function sun(t: N): N {
  const f = fract(t).mul(6);
  let c: N = vec3(0);
  for (let k = 0; k <= 6; k++) c = c.add(vec3(...SUN[k % 6]).mul(max(inv(abs(f.sub(k))), 0)));
  return c;
}
/** HSL → RGB (paramètres constants : calculé côté CPU). */
function hsl(h: number, s: number, l: number): N {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return vec3(t[0] + m, t[1] + m, t[2] + m);
}
const tile = (tex: Texture, u: N, s: number): N => texture(tex, u.mul(s));
const IRI = 1024 / 300;

interface ShineCfg { density: number; off: number; width: number; intensity: number; hue: number; ms: number; ml: number; bs: number; bl: number }
function computeShine(rainbow: N, barCoord: N, bgY: N, c: ShineCfg, glitter: N, spot: N, ptrB: N, k: number, s: number): N {
  const barT = fract(barCoord.add(bgY.mul(c.off)).mul(c.density));
  const barInt = smoothstep(0, 0.028 * c.width, barT).mul(inv(smoothstep(0.035 * c.width, 0.063 * c.width, barT)));
  const barCol = mix(hsl(c.hue, c.ms, c.ml), hsl(c.hue, c.bs, c.bl), barInt.mul(c.intensity));
  let r: N = B.hard(rainbow, barCol);
  r = r.mul(glitter.mul(0.3).add(0.5)).mul(spot.mul(0.5).add(0.5)).mul(ptrB);
  return c01(sat(contrast(r, k), s));
}
/** Paillettes « métalliques » centrées sur le pointeur (ultra / arc-en-ciel / téra). */
function metallicSparkle(p: PokeIn, radius: number, k: number, shift: number, rbK: number, br: number, intensity: number): N {
  const sd = length(p.uv.sub(p.pointer));
  const spot = inv(smoothstep(0, radius, sd)).pow(2);
  const sf = contrast(vec3(p.foil), k);
  const ph = atan(p.pointer.y.sub(p.uv.y), p.pointer.x.sub(p.uv.x)).div(Math.PI).mul(Math.PI * shift);
  const rb = vec3(sin(ph).mul(0.5).add(0.5), sin(ph.add(2.094)).mul(0.5).add(0.5), sin(ph.add(4.189)).mul(0.5).add(0.5));
  return c01(bright(B.screen(sf, rb.mul(rbK)), br)).mul(spot).mul(intensity);
}
/** Voronoï 3×3 déroulé : identifiant de la cellule la plus proche (mosaïques téra / Master Ball). */
function voronoiId(p: N): N {
  const cell = floor(p), fr = fract(p);
  let best: N = float(10), id: N = float(0);
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const nb = vec2(i, j);
      const cc = cell.add(nb);
      const h = fract(sin(vec2(dot(cc, vec2(127.1, 311.7)), dot(cc, vec2(269.5, 183.3)))).mul(43758.5453));
      const df = nb.add(h).sub(fr);
      const d = dot(df, df);
      id = mix(id, dot(cc, vec2(7, 157)), step(d, best));
      best = min(best, d);
    }
  return fract(sin(id.mul(127.1)).mul(43758.5453));
}
const glareRadial = (sd: N, a: number, b: number, k: number, br = 0.6, s = 0): N => c01(sat(contrast(bright(mix(vec3(a), vec3(b), smoothstep(0.1, 0.7, sd)), br), k), s));

// ───────────────────────────────────────────── les 12 effets
function regularHolo(p: PokeIn): PokeOut {
  const { uv, base, mask, pointer, bg, op } = p;
  const sd = length(uv.sub(pointer));
  const rT = dot(uv.sub(0.5), dirv(10)).mul(2.5).add(inv(bg.x).sub(0.5).mul(0.5)).add(inv(bg.y).sub(0.5).mul(0.5));
  let shine: N = c01(sat(contrast(bright(sun(rT), 1.5), 3), 0.75));
  const a1 = bg.x.sub(0.5).mul(180).sub(bg.y.sub(0.5).mul(90)).mul(0.25 * deg);
  const bars = (a: N, sgn: number) => {
    const t = fract(dot(uv, vec2(cos(a), sin(a))).add(bg.y.mul(1.2 * sgn)).mul(0.4));
    return vec3(0.7).mul(smoothstep(0.25, 0.325, t).mul(inv(smoothstep(0.35, 0.375, t))));
  };
  shine = shine.mul(V1().sub(B.screen(bars(a1, 1), bars(a1.negate(), -1)).mul(0.5)));
  let sg: N = mix(vec3(0.9), vec3(0.78), smoothstep(0, 0.25, sd));
  sg = c01(contrast(mix(sg, vec3(0.35), smoothstep(0.25, 0.9, sd)), 3));
  const mg = mix(mix(vec3(0.8), vec3(0.65), smoothstep(0, 0.1, sd)), vec3(0), smoothstep(0.1, 0.2, sd));
  let ga: N = mix(vec3(0.95, 1, 1), vec3(0.39), smoothstep(0, 0.05, sd));
  ga = c01(contrast(bright(mix(ga, vec3(0.82, 0.91, 0.97), smoothstep(0.05, 0.55, sd)), 0.6), 3));
  const k = mask.mul(op);
  let r: N = mix(base, B.overlay(base, shine), k);
  r = mix(r, B.lumi(r, sg), k.mul(0.5));
  r = mix(r, B.overlay(r, mg), k.mul(0.8));
  r = mix(r, B.overlay(r, ga), k.mul(0.6));
  return { color: r, area: mask };
}

function reverseHolo(p: PokeIn): PokeOut {
  const { uv, base, mask, foil, pointer, op } = p;
  const area = max(mask, foil);
  const sd = length(pointer.sub(uv));
  const spec = inv(smoothstep(0, 0.75, sd)).pow(1.25);
  const glow = inv(smoothstep(0, 1.5, sd)).pow(1.25).mul(0.5);
  const tot = spec.add(glow);
  const metal = c01(vec3(0.76, 0.54, 0.59).mul(tot.mul(5).add(0.1)));
  let r: N = mix(base, B.overlay(base, metal), area.mul(op).mul(tot.mul(0.6).add(0.4)));
  if (p.hasFoil) r = mix(r, B.overlay(r, metal), mask.mul(op).mul(tot).mul(5).mul(step(0.01, mask)).mul(step(0.01, foil)));
  return { color: sat(contrast(bright(r, 0.8), 1.7), 1), area };
}

function flatsilverReverse(p: PokeIn): PokeOut {
  const { uv, base, mask, foil, pointer, bg, op, T } = p;
  const area = max(mask, foil);
  const sd = length(pointer.sub(uv));
  const spot = inv(smoothstep(0, 1.05, sd)).pow(1.5);
  const tiltDir = bg.sub(0.5);
  const rT = uv.x.mul(0.6).add(float(0.5).sub(bg.x).mul(0.9)).add(float(0.5).sub(pointer.x).mul(0.45)).add(float(0.5).sub(bg.y).mul(0.27));
  const rainbow = c01(sat(sun(rT), 0.5));
  const grain = texture(T.grain, uv.mul(1.2)).r;
  const gg = vec2(dFdx(grain), dFdy(grain));
  const grainCatch = dot(normalize(gg.add(0.001)), normalize(tiltDir.add(0.001))).mul(0.5).add(0.5).mul(clamp(length(gg).mul(80), 0, 1));
  const es = mask.mul(op);
  let r: N = mix(base, sat(contrast(bright(base, 0.6), 0.9), 3), es);
  r = r.add(grain.mul(es));
  let reveal: N = spot.mul(0.7 * 2.55).add(0.3).mul(0.75);
  if (p.hasFoil) reveal = reveal.mul(mix(float(1), grainCatch.add(0.5), step(0.5, foil)));
  r = mix(r, B.overlay(r, rainbow), es.mul(reveal));
  if (p.hasFoil) {
    const fg = vec2(dFdx(foil), dFdy(foil));
    const emb = dot(normalize(fg.add(0.001)), normalize(tiltDir.add(0.001))).mul(0.5).add(0.5).mul(clamp(length(fg).mul(50), 0, 1));
    r = r.add(emb.mul(foil).mul(op).mul(1.2));
    r = mix(r, B.overlay(r, rainbow), foil.mul(op).mul(spot).mul(2.55 * 0.5));
  }
  return { color: r, area };
}

function illustrationRare(p: PokeIn): PokeOut {
  const { uv, base, mask, pointer, bg, op, pfc, time, T } = p;
  const glitter = texture(T.glitter, uv.mul(2)).r;
  const ptrB = pfc.mul(0.4).add(0.5);
  const sd = length(uv.sub(pointer));
  const spot = float(0.75).sub(smoothstep(0.1, 0.7, sd));
  const bc = dot(uv, dirv(132));
  const rT = uv.y.mul(0.5).add(float(0.5).sub(bg.y).mul(3.5)).add(sin(time.mul(0.3)).mul(0.05)).add(4 / 6);
  const s1 = computeShine(sun(rT), bc, bg.y, { density: 2.6, off: -0.7, width: 5.4, intensity: 20, hue: 231, ms: 0.33, ml: 0.6, bs: 0.38, bl: 0.71 }, glitter, spot, ptrB, 1.5, 0.8);
  const s2 = computeShine(sun(rT), bc, bg.y, { density: 1.8, off: 0.85, width: 3.95, intensity: 10.35, hue: 248, ms: 0.17, ml: 0.43, bs: 0.19, bl: 0.83 }, glitter, spot, ptrB, 1.5, 0.8);
  const glare = c01(bright(mix(V1(), vec3(0), smoothstep(0, 0.85, sd)), 0.9));
  const glare2 = c01(contrast(bright(mix(V1(), vec3(0), smoothstep(0.05, 0.85, sd)), 0.475), 1.2));
  const k = mask.mul(op);
  let r: N = mix(base, B.dodge(base, s1), k);
  r = mix(r, B.soft(r, s2), k);
  r = mix(r, B.overlay(r, glare), k.mul(0.9 * 0.8));
  r = mix(r, B.screen(r, glare2), k.mul(pfc));
  return { color: r, area: float(1) };
}

function specialIllustrationRare(p: PokeIn): PokeOut {
  const { uv, base, mask, foil, pointer, bg, op, pfc, T } = p;
  const sd = length(uv.sub(pointer));
  const irid = c01(contrast(sat(sun(uv.y.mul(1.1).add(bg.y.sub(0.5).mul(2.3))), 0.8), 0.95));
  const glitter = c01(sat(contrast(tile(T.iri9, uv, IRI).rgb, 2.3), 0));
  const sh = 3 / 1024;
  const gB = c01(sat(contrast(tile(T.iri8, uv.add(pointer.mul(sh)), IRI).rgb, 1.8), 2));
  const gA = c01(sat(contrast(tile(T.iri7, uv.sub(pointer.mul(sh)), IRI).rgb, 1.2), 2));
  const glare = c01(contrast(mix(vec3(3), vec3(0.85), smoothstep(0, 1.3, sd).add(smoothstep(0.3, 1.8, sd))), 0.8));
  const k = mask.mul(op);
  let r: N = mix(base, B.overlay(base, vec3(0.85)), k.mul(0.3));
  r = mix(r, B.overlay(r, vec3(0)), k.mul(0.2)); // « shine before » : luminosité 0 dans leur réglage
  r = mix(r, B.soft(r, irid), k.mul(0.75));
  r = mix(r, B.plus(r, glitter), mask.mul(op.mul(pfc.mul(0.5).add(1))).mul(0.8));
  r = mix(r, B.overlay(r, gB), k.mul(pointer.y).mul(0.9));
  r = mix(r, B.overlay(r, gA), k.mul(inv(pointer.y)));
  r = mix(r, r.mul(glare), k.mul(0.2));
  if (p.hasFoil) {
    r = mix(r, B.overlay(r, V1()), foil.mul(op).mul(0.4).mul(step(0.01, mask)));
    // gravure : éclats colorés qui s'allument quand la pente du relief fait face à l'inclinaison
    const em = smoothstep(0.5, 0.9, foil);
    const eg = vec2(dFdx(foil), dFdy(foil));
    const td = bg.sub(0.5);
    const tm = length(td).mul(2);
    const ca = dot(normalize(eg.add(0.001)), normalize(td.add(0.001)));
    const gs = clamp(length(eg).mul(80), 0, 1);
    const band1 = max(sin(ca.mul(Math.PI).add(tm.mul(0.1 * 25))), 0).pow(4).mul(gs);
    const sp1 = c01(sat(contrast(tile(T.iri1, uv, 4.5).rgb, 2.5), 2));
    r = r.add(sun(foil.mul(3).add(uv.y.mul(1.5)).add(float(0.5).sub(bg.y).mul(3))).mul(sp1).mul(band1).mul(em).mul(0.4).mul(op));
    const band2 = max(sin(ca.negate().mul(Math.PI).add(tm.mul(0.05 * 25))), 0).pow(4).mul(gs);
    const sp2 = c01(sat(contrast(tile(T.iri2, uv, 6).rgb, 2.5), 2));
    r = r.add(sun(foil.mul(3).add(uv.x.mul(1.5)).add(float(0.5).sub(bg.x).mul(3))).mul(sp2).mul(band2).mul(em).mul(0.4).mul(op));
  }
  return { color: contrast(bright(r, op.mul(0.2).add(0.95)), 0.95), area: max(mask, foil) };
}

function doubleRare(p: PokeIn): PokeOut {
  const { uv, base, mask, pointer, bg, op, pfc, time, T } = p;
  const sd = length(uv.sub(pointer));
  const spot = inv(smoothstep(0, 0.8, sd));
  let gr: N = sun(uv.y.mul(10).add(float(0.5).sub(bg.y).mul(3.5)).add(sin(time.mul(0.3)).mul(0.05)));
  const gbt = fract(dot(uv, dirv(128.5)).add(float(0.5).sub(bg.x).mul(1.65)).add(bg.y.mul(0.5)).mul(4));
  const gbi = smoothstep(0, 0.7, gbt).mul(inv(smoothstep(0.28, 0.55, gbt)));
  gr = B.hard(gr, mix(vec3(0.055, 0.082, 0.18), vec3(0.45, 0.76, 0.76), gbi)).mul(spot.mul(0.5).add(0.5));
  const tr = smoothstep(0, 0.13, abs(bg.y.sub(0.5)));
  const d1 = texture(T.dank1, uv.div(1.4)).rgb.mul(tr);
  const d2 = texture(T.dank2, uv.div(1.2)).rgb.mul(tr);
  const glitter = c01(sat(contrast(bright(B.lighten(B.hue(gr, d1), d2), 2), 0.5), 0.75));
  const grain = texture(T.value, uv.mul(200).add(time.mul(0.1)).div(256)).r;
  const bt = fract(dot(uv, dirv(133)).add(bg.x).add(bg.y).mul(3));
  const bars = mix(vec3(0.055, 0.071, 0.129), vec3(0.45, 0.76, 0.76), smoothstep(0, 0.028, bt).mul(inv(smoothstep(0.035, 0.042, bt))));
  const rd = mix(mix(vec3(0.1), vec3(0.15), smoothstep(0, 0.12, sd)), vec3(0.25), smoothstep(0.12, 1.2, sd));
  let shine: N = B.screen(vec3(grain.mul(0.2)), sun(uv.y.mul(3.5).add(bg.y)));
  shine = c01(sat(contrast(B.hard(B.hue(shine, bars), rd), 1.5), 2));
  const g1 = c01(contrast(bright(mix(mix(vec3(0.4), vec3(0.54), smoothstep(0, 0.63, sd)), vec3(0.3), smoothstep(0.63, 1.5, sd)), 1.5), 2));
  const g2 = c01(contrast(mix(mix(vec3(0.9), vec3(0.2), smoothstep(0, 0.1, sd)), vec3(0), smoothstep(0.1, 0.6, sd)), 1.4));
  const k = mask.mul(op);
  let r: N = mix(base, B.hard(base, glitter), k);
  r = mix(r, B.lighten(r, shine), k);
  r = mix(r, B.burn(r, g1), mask.mul(op).mul(pfc.add(0.2)));
  r = mix(r, B.lighten(r, g2), mask.mul(op).mul(pfc).mul(0.66));
  return { color: r, area: float(1) };
}

function ultraLike(p: PokeIn, ultra: boolean): PokeOut {
  const { uv, base, mask, foil, pointer, bg, op, rotX, T } = p;
  const sd = length(uv.sub(pointer));
  const es = mask.mul(op);
  const gl = c01(sat(contrast(tile(T.iri7, uv, IRI).rgb, 1.8), 2.5));
  let r: N;
  if (ultra) {
    const bt = fract(dot(uv, dirv(128.5)).add(float(0.5).sub(bg.x).mul(0.9)).add(bg.y.mul(1.1)).mul(2.5));
    const bi = smoothstep(0.18, 0.51, bt).mul(inv(smoothstep(0.18, 0.8, bt)));
    const diag = mix(vec3(0.055, 0.082, 0.18), vec3(0.45, 0.76, 0.76), bi);
    const ang = rotX.sub(99).mul(0.65 * deg);
    const lg = (off: N) => {
      const t = fract(dot(uv.sub(0.5), vec2(cos(ang), sin(ang))).add(0.5).add(off).div(3));
      return vec3(max(inv(abs(t.sub(0.3)).div(0.06)), 0).mul(0.2));
    };
    const after = c01(contrast(bright(B.excl(lg(bg.y.mul(0.45)), lg(bg.y.mul(1.2))), 0.2), 0.15)).mul(mask);
    let sb: N = sat(contrast(bright(base, 1.2), 1.65), 3.3);
    sb = mix(sb, B.overlay(sb, vec3(0.33)), es);
    r = mix(base, B.hard(sb, after), es.mul(op));
    r = mix(r, B.hard(r, diag), es.mul(op));
    r = mix(r, B.plus(r, metallicSparkle(p, 1, 2.4, 5, 0.3, 3, 0.35)), foil.mul(es));
  } else {
    const sb = sat(contrast(base, 1.5), 1.1);
    r = mix(base, mix(sb, B.overlay(sb, vec3(0.4951)), es), step(0.01, mask));
    r = mix(r, B.plus(r, metallicSparkle(p, 0.7, 0.6, 3.8, 0.3, 3, 1.35)), foil.mul(es));
  }
  r = mix(r, B.screen(r, gl), es.mul(0.33));
  r = mix(r, r.mul(glareRadial(sd, 0.8, 0.5, ultra ? 0.8 : 2.35, 1)), es);
  r = mix(r, B.overlay(r, vec3(0.725)), foil.mul(es));
  const adj = ultra ? sat(contrast(bright(r, 1.6), 0.8), 0.8) : bright(r, 0.95);
  return { color: adj, area: mask };
}

/** Éclats de gravure « téra » (2 couches : l'une avec l'inclinaison verticale, l'autre horizontale). */
function teraSparkles(p: PokeIn, r: N, i1: number, i2: number): N {
  const { uv, mask, bg, op, T } = p;
  const s1 = texture(T.glitter, uv.mul(2.5)).r;
  const rev1 = smoothstep(0, 1, clamp(abs(bg.y.sub(0.5)).mul(7.7), 0, 1));
  r = r.add(sun(uv.y.mul(1.8).add(uv.x.mul(0.3)).add(float(0.5).sub(bg.y).mul(1.7))).mul(s1).mul(rev1).mul(mask).mul(i1).mul(op).mul(smoothstep(0.68, 0.72, mask)));
  const s2 = smoothstep(0.45, 0.85, texture(T.noise, uv.mul(1.3)).r);
  const rev2 = smoothstep(0, 1, clamp(abs(bg.x.sub(0.5)).mul(7.7), 0, 1));
  r = r.add(sun(uv.x.mul(1.8).add(uv.y.mul(0.3)).add(float(0.5).sub(bg.x).mul(1.7))).mul(s2).mul(rev2).mul(mask).mul(i2).mul(op).mul(smoothstep(0.88, 0.92, mask)));
  return r;
}
function tera(p: PokeIn, mosaic: boolean): PokeOut {
  const { uv, base, mask, foil, pointer, bg, op } = p;
  let r: N = base;
  if (p.hasFoil) r = mix(r, vec3(foil), foil.mul(0.5).mul(op).mul(0.3));
  const sd = length(uv.sub(pointer));
  const holoMask = smoothstep(0.48, 0.58, mask);
  let rT: N = dot(uv, dirv(133)).mul(1.8).add(float(0.5).sub(bg.y).mul(1.7)).add(float(0.5).sub(pointer.y).mul(0.5));
  let rb: N;
  if (mosaic) {
    const eff = inv(smoothstep(0.8, 1, mask)).mul(0.7).mul(smoothstep(-0.05, 0.05, foil));
    rT = mix(rT, rT.add(voronoiId(uv.mul(20)).mul(6)), eff);
    rb = c01(sun(rT));
  } else rb = sun(rT);
  rb = rb.mul(float(0.75).sub(smoothstep(0.1, 0.7, sd)).mul(0.5).add(0.5));
  r = mix(r, B.overlay(r, rb), holoMask.mul(mosaic ? 0.65 : 0.8).mul(op));
  r = teraSparkles(p, r, mosaic ? 0.35 : 0.8, mosaic ? 0.3 : 0.95);
  if (p.hasFoil) r = mix(r, B.plus(r, metallicSparkle(p, mosaic ? 2.3 : 1, mosaic ? 2.6 : 1.2, 3.3, 0.5, 1, mosaic ? 0.15 : 0.2)), foil.mul(op));
  // réglage final appliqué À TOUTE LA CARTE dans l'original (pas de sortie anticipée chez les téra)
  return { color: mosaic ? sat(contrast(bright(r, 0.9), 1.45), 0.8) : sat(contrast(bright(r, 0.95), 1.45), 0.95), area: float(1) };
}

/** Gravure tamponnée (Master Ball, shiny) : le relief assombrit en inclinaison, un arc-en-ciel dans les creux. */
function stamp(p: PokeIn, r: N, opacity: number, holo: number, reveal: N): N {
  const { uv, foil, pointer, bg, op } = p;
  r = r.mul(mix(V1(), vec3(foil), reveal.mul(opacity).mul(op)));
  if (holo > 0) {
    const sd = length(uv.sub(pointer));
    const sT = uv.y.mul(0.1).add(uv.x.mul(0.5)).add(float(0.5).sub(bg.y).mul(1.4)).add(float(0.5).sub(pointer.y).mul(0.5));
    const sr = sun(sT).mul(float(0.75).sub(smoothstep(0.1, 0.7, sd)).add(0.5));
    const em = inv(foil).mul(inv(smoothstep(0.25, 0.35, foil)));
    r = mix(r, B.screen(r, sr), em.mul(holo).mul(op).mul(reveal));
  }
  return r;
}
function masterBall(p: PokeIn): PokeOut {
  const { uv, base, mask, foil, pointer, bg, op, time, T } = p;
  const fp = c01(foil.pow(1 / 1.1));
  let r: N = base;
  let rT: N = uv.y.mul(0.6).add(float(0.5).sub(bg.y).mul(1.4)).add(sin(time.mul(0.3)).mul(0.5));
  const eff = inv(smoothstep(0.8, 1, mask)).mul(smoothstep(0.25, 0.35, fp)).mul(0.9);
  rT = mix(rT, rT.add(voronoiId(uv.mul(17)).mul(6)), eff);
  r = mix(r, B.overlay(r, c01(contrast(sat(sun(rT), 0.2), 1.15))), mask.mul(op).mul(0.85));
  const sp = (s: number) => mix(texture(T.glitter, uv.mul(s)).r, smoothstep(0.45, 0.85, texture(T.noise, uv.mul(s)).r), 0.75);
  r = r.add(sp(2.5).mul(smoothstep(0.07, 0.37, abs(bg.y.sub(0.5)).mul(2))).mul(fp).mul(0.6).mul(op));
  r = r.add(sp(2).mul(smoothstep(0.1, 0.4, abs(bg.x.sub(0.5)).mul(2))).mul(fp).mul(0.8).mul(op));
  const sd = length(uv.sub(pointer));
  r = mix(r, B.overlay(r, glareRadial(sd, 0.6, 0.3, 1.55)), fp.mul(op));
  r = contrast(bright(r, 1.1), 1.05);
  if (p.hasFoil) r = stamp(p, r, 0.75, 0.6, smoothstep(0.1, 0.5, max(abs(bg.y.sub(0.5)), abs(bg.x.sub(0.5))).mul(2)));
  return { color: r, area: max(mask, foil) };
}
function shinyRare(p: PokeIn): PokeOut {
  const { uv, base, mask, foil, pointer, bg, op, pfc, time, T } = p;
  const glitter = texture(T.glitter, uv.mul(2)).r;
  const fp = c01(foil.pow(1 / 0.8));
  let r: N = mix(base, base.add(fp), op.mul(0.25 * 0.2));
  const ptrB = pfc.mul(0.4).add(0.5);
  const sd = length(uv.sub(pointer));
  const spot = float(0.75).sub(smoothstep(0.1, 0.7, sd));
  const bc = dot(uv, dirv(133));
  const rT = uv.y.mul(0.1).add(float(0.5).sub(bg.y).mul(3.5)).add(sin(time.mul(0.3)).mul(0.05)).add(4 / 6);
  const g5 = smoothstep(0.45, 0.55, mask);
  const s1 = computeShine(sun(rT), bc, bg.y, { density: 2.5, off: 0.25, width: 10, intensity: 12.1, hue: 195, ms: 0.15, ml: 0.19, bs: 0, bl: 0.58 }, glitter, spot, ptrB, 2.5, 0.3);
  r = mix(r, B.dodge(r, s1), mask.mul(op).mul(g5));
  const s2 = computeShine(sun(rT), bc, bg.y, { density: 2.1, off: -0.55, width: 8.1, intensity: 16.6, hue: 226, ms: 0, ml: 0.12, bs: 0.06, bl: 0.49 }, glitter, spot, ptrB, 2.5, 0.3);
  r = mix(r, B.soft(r, s2), mask.mul(op).mul(0.6).mul(g5));
  // métal brossé révélé par l'inclinaison dans les zones les plus claires du masque
  const mm = smoothstep(0.85, 0.95, mask);
  const reveal = smoothstep(0.05, 1, max(abs(bg.x.sub(0.5)), abs(bg.y.sub(0.5))).mul(2 * 2.5));
  const amt = reveal.mul(mm).mul(op);
  r = sat(r, mix(float(1), float(0.8), amt));
  r = mix(r, B.screen(r, vec3(texture(T.noise, uv.mul(3.6)).r)), amt.mul(1.4));
  r = mix(r, B.overlay(r, glareRadial(sd, 0.6, 0.3, 1.55)), fp.mul(op).mul(0.65));
  r = contrast(r, 1.2);
  if (p.hasFoil) r = stamp(p, r, 0.65, 0, float(1));
  return { color: r, area: max(mask, foil) };
}

/** Révélation dorée (leur transition d'apparition) : balayage or de bas en haut, puis l'or se fracture. */
export function goldSweep(uv: N, base: N, prog: N, time: N, T: PokeTextures): N {
  const sweepT = clamp(prog.mul(2), 0, 1);
  const gold = mix(vec3(1, 0.84, 0.3), sun(uv.y.mul(2).add(time.mul(0.5))), 0.35).add(sin(uv.x.mul(40).add(time.mul(3))).mul(0.08));
  const gc = mix(base, B.overlay(base, gold), 0.65);
  let sr: N = mix(gc, base, smoothstep(sweepT.sub(0.02), sweepT, uv.y));
  sr = sr.add(vec3(1, 0.95, 0.7).mul(inv(smoothstep(0, 0.03, abs(uv.y.sub(sweepT)))).mul(sweepT).mul(0.8)));
  const fT = clamp(prog.sub(0.5).mul(2), 0, 1);
  const nv = texture(T.noise, uv.mul(3)).r;
  const spark = vec3(1, 0.92, 0.6).mul(inv(smoothstep(0, 0.04, abs(nv.sub(fT)))).mul(fT)).mul(sin(time.mul(15).add(nv.mul(20))).mul(0.5).add(0.5));
  return mix(sr, mix(base, sr, step(fT, nv)).add(spark), step(0.001, fT));
}


/** Rotation 2D (évite que deux couches répétées tombent sur la même grille). */
const rotUV = (u: N, a: number): N => vec2(u.x.mul(Math.cos(a)).sub(u.y.mul(Math.sin(a))), u.x.mul(Math.sin(a)).add(u.y.mul(Math.cos(a))));

/**
 * 6★ — « Double rare » RETRAVAILLÉ (retour de Tom, 07/11 : « plus subtil, pas partout mais à des endroits stratégiques —
 * décor arrière, équipement —, le reflet général est bien mais tout est très répétitif, comme une texture non
 * seamless »). Même famille que l'original, mais :
 *  - chaque couche a SA place : confettis sur le décor qui a de la structure (pas sur les aplats), par plaques ;
 *    éclats arc-en-ciel sur l'équipement du sujet ; voile arc-en-ciel limité au décor ; reflet général conservé, adouci ;
 *  - plus de répétition visible : 2,5 bandes au lieu de 10, bandes et barres tordues par un champ basse fréquence,
 *    confettis de deux échelles tournées mélangés par ce même champ (aucune grille commune).
 */
function doubleRarePlaced(p: PokeIn): PokeOut {
  const { uv, base, mask, pointer, bg, op, pfc, time, T } = p;
  const pl = p.place ?? { decor: mask, struct: float(1), equip: float(0) };
  const sd = length(uv.sub(pointer));
  const spot = inv(smoothstep(0, 0.8, sd));
  // champ basse fréquence (2 lectures à échelles non entières et tournées) : plaques, distorsions
  const lf = texture(T.noise, rotUV(uv, 0.37).mul(0.83).add(0.13)).r.mul(0.6).add(texture(T.noise, rotUV(uv, -1.1).mul(1.91).add(0.71)).r.mul(0.4));
  const warp = lf.sub(0.48).mul(0.4);
  // voile arc-en-ciel + barres : peu de bandes, tordues
  let gr: N = sun(uv.y.mul(2.6).add(warp.mul(2)).add(float(0.5).sub(bg.y).mul(3.5)).add(sin(time.mul(0.3)).mul(0.05)));
  const gbt = fract(dot(uv, dirv(128.5)).add(warp).add(float(0.5).sub(bg.x).mul(1.65)).add(bg.y.mul(0.5)).mul(2.2));
  const gbi = smoothstep(0, 0.7, gbt).mul(inv(smoothstep(0.28, 0.55, gbt)));
  gr = B.hard(gr, mix(vec3(0.055, 0.082, 0.18), vec3(0.45, 0.76, 0.76), gbi)).mul(spot.mul(0.5).add(0.5));
  // confettis : deux échelles tournées, mélangées par le champ — révélés par l'inclinaison (verticale OU horizontale)
  const tr = smoothstep(0, 0.13, max(abs(bg.y.sub(0.5)), abs(bg.x.sub(0.5)).mul(0.8)));
  const c1 = texture(T.dank1, rotUV(uv, 0.6).mul(0.83).add(vec2(0.31, 0.17))).rgb;
  const c2 = texture(T.dank2, rotUV(uv, -0.9).mul(1.37).add(vec2(0.5, 0.9))).rgb;
  const conf = mix(c1, c2, smoothstep(0.35, 0.65, lf)).mul(tr);
  // placement : décor structuré, par plaques (jamais 100 % de la surface)
  const patches = smoothstep(0.36, 0.6, lf).mul(0.75).add(0.25);
  const decorK = pl.decor.mul(mix(float(0.35), float(1), pl.struct)).mul(patches);
  // voile irisé NEUTRE (ne fait que tourner la teinte autour du gris : pas de dominante, pas d'assombrissement)
  const chroma = vec3(0.5).add(gr.sub(lum(gr)).mul(0.9));
  let r: N = mix(base, B.hard(base, chroma), decorK.mul(op).mul(0.6));
  // confettis : éclats vifs posés par-dessus (screen), seulement là où le décor a de la structure
  const confB = c01(sat(conf.mul(2.4), 1.3));
  r = mix(r, B.screen(r, confB), decorK.mul(op));
  // voile + barres fines (lighten) : décor seulement, à moitié
  const bt = fract(dot(uv, dirv(133)).add(warp.mul(0.7)).add(bg.x).add(bg.y).mul(2.3));
  const bars = mix(vec3(0.055, 0.071, 0.129), vec3(0.45, 0.76, 0.76), smoothstep(0, 0.028, bt).mul(inv(smoothstep(0.035, 0.042, bt))));
  const grain = texture(T.value, uv.mul(173).add(time.mul(0.1)).div(256)).r;
  let shine: N = B.screen(vec3(grain.mul(0.2)), sun(uv.y.mul(2.1).add(warp).add(bg.y)));
  const rd = mix(mix(vec3(0.1), vec3(0.15), smoothstep(0, 0.12, sd)), vec3(0.25), smoothstep(0.12, 1.2, sd));
  shine = c01(sat(contrast(B.hard(B.hue(shine, bars), rd), 1.5), 2));
  r = mix(r, B.lighten(r, shine), pl.decor.mul(patches).mul(op).mul(0.5));
  // équipement : reflet métallique irisé + éclats qui suivent l'œil (pas de confettis sur le personnage)
  const eq = pl.equip.mul(mask.max(0.6));
  const ph = atan(pointer.y.sub(uv.y), pointer.x.sub(uv.x)).mul(3.3);
  const rb = vec3(sin(ph).mul(0.5).add(0.5), sin(ph.add(2.094)).mul(0.5).add(0.5), sin(ph.add(4.189)).mul(0.5).add(0.5));
  const sheen = sun(dot(uv, dirv(60)).mul(1.4).add(float(0.5).sub(bg.x).mul(2.2)).add(warp));
  r = mix(r, B.overlay(r, sheen), eq.mul(op).mul(spot.mul(0.6).add(0.4)).mul(0.45));
  const sp = texture(T.glitter, rotUV(uv, 0.3).mul(2.3)).r.mul(tr);
  r = r.add(rb.mul(sp).mul(eq).mul(spot.pow(1.5)).mul(op).mul(0.9));
  // reflet général (conservé, adouci)
  const g1 = c01(contrast(bright(mix(mix(vec3(0.4), vec3(0.54), smoothstep(0, 0.63, sd)), vec3(0.3), smoothstep(0.63, 1.5, sd)), 1.5), 2));
  const g2 = c01(contrast(mix(mix(vec3(0.9), vec3(0.2), smoothstep(0, 0.1, sd)), vec3(0), smoothstep(0.1, 0.6, sd)), 1.4));
  r = mix(r, B.burn(r, g1), mask.mul(op).mul(pfc.add(0.2)).mul(0.45));
  r = mix(r, B.lighten(r, g2), mask.mul(op).mul(pfc).mul(0.5));
  return { color: r, area: float(1) };
}

// ───────────────────────────────────────────── catalogue
export type Zone = 'fond' | 'cadre' | 'carte' | 'sujet';
export interface PokeFxDef {
  id: string;
  /** nom pour la visio */
  name: string;
  /** rareté Pokémon d'origine */
  pkmn: string;
  /** ce qu'on voit, en une phrase */
  look: string;
  zone: Zone;
  /** gravure (etch) : utilisée par l'original pour cette rareté */
  etch: boolean;
  fn: (p: PokeIn) => PokeOut;
}
export const POKE_FX: PokeFxDef[] = [
  { id: 'regular-holo', name: 'Holo classique', pkmn: 'Holo Rare', look: 'Arc-en-ciel pastel + deux faisceaux de barres croisées dans l’illustration, reflet blanc sous l’œil.', zone: 'fond', etch: false, fn: regularHolo },
  { id: 'reverse-holo', name: 'Reverse (métal rosé)', pkmn: 'Reverse Holo', look: 'Le décor devient métal rosé sous un spot qui suit l’œil ; l’illustration reste mate.', zone: 'cadre', etch: false, fn: reverseHolo },
  { id: 'flatsilver-reverse', name: 'Argent mat', pkmn: 'Flat Silver Reverse', look: 'Décor argent satiné, grain métallique qui accroche la lumière, arc-en-ciel discret.', zone: 'cadre', etch: false, fn: flatsilverReverse },
  { id: 'illustration-rare', name: 'Illustration rare', pkmn: 'Illustration Rare', look: 'Toute la carte : deux trames de barres bleutées en color-dodge, paillettes, halo sous l’œil.', zone: 'carte', etch: true, fn: illustrationRare },
  { id: 'special-illustration-rare', name: 'Illustration spéciale', pkmn: 'Special Illustration Rare', look: 'Voile irisé + moucheté de paillettes en 3 couches décalées (parallaxe) + éclats dans le relief gravé.', zone: 'carte', etch: true, fn: specialIllustrationRare },
  { id: 'double-rare', name: 'Double rare (confettis)', pkmn: 'Double Rare', look: 'Confettis colorés qui apparaissent en inclinant, barres fines, grain, assombri loin de l’œil.', zone: 'carte', etch: false, fn: doubleRare },
  { id: 'ultra-rare', name: 'Ultra rare', pkmn: 'Ultra Rare (Full Art)', look: 'Couleurs poussées, rayures diagonales sombres/cyan qui tournent avec la carte, étincelles dans la gravure.', zone: 'carte', etch: true, fn: (p) => ultraLike(p, true) },
  { id: 'rainbow-rare', name: 'Arc-en-ciel (paillettes)', pkmn: 'Rainbow / Hyper Rare', look: 'Base contrastée, poussière de paillettes, étincelles dont la couleur tourne autour du point regardé.', zone: 'carte', etch: true, fn: (p) => ultraLike(p, false) },
  { id: 'shiny-rare', name: 'Shiny (métal)', pkmn: 'Shiny Rare', look: 'Barres acier froides, métal brossé qui se révèle en inclinant, gravure tamponnée.', zone: 'carte', etch: true, fn: shinyRare },
  { id: 'tera-rainbow-rare', name: 'Téra arc-en-ciel', pkmn: 'Tera Rainbow Rare', look: 'Arc-en-ciel oblique saturé, éclats verticaux / horizontaux selon le sens d’inclinaison.', zone: 'carte', etch: true, fn: (p) => tera(p, false) },
  { id: 'tera-shiny-rare', name: 'Téra mosaïque', pkmn: 'Tera Shiny Rare', look: 'L’arc-en-ciel éclate en facettes de cristal (Voronoï) : chaque facette a sa teinte.', zone: 'carte', etch: true, fn: (p) => tera(p, true) },
  { id: 'double-rare-placed', name: '6★ Double rare placé', pkmn: 'Double Rare (retravaillé)', look: 'Confettis seulement sur le décor structuré, par plaques ; éclats irisés sur l’équipement du sujet ; plus de motif répété.', zone: 'carte', etch: false, fn: doubleRarePlaced },
  { id: 'master-ball', name: 'Master Ball (mosaïque gravée)', pkmn: 'Master Ball Reverse', look: 'Mosaïque désaturée qui défile, double paillettes, motif gravé qui s’assombrit et s’irise en inclinant.', zone: 'carte', etch: true, fn: masterBall },
];
export const POKE_BY_ID = Object.fromEntries(POKE_FX.map((d) => [d.id, d])) as Record<string, PokeFxDef>;
