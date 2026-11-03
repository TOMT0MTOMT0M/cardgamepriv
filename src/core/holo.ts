import { MeshPhysicalNodeMaterial, Vector3 } from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  luminance,
  max,
  mix,
  modelWorldMatrixInverse,
  mx_fractal_noise_float,
  normalMap,
  normalize,
  pow,
  reflect,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  bumpMap,
  sin,
  length,
  fwidth,
  mx_noise_float,
  hash,
} from 'three/tsl';
import type { CardArt } from './art';
import { cardLayers } from './cardMaterial';
import { CARD } from './cardModel';
import { noiseTexel, saturate3, thinFilm, thinFilmLUT, voronoi, type N } from './tsl';

/**
 * Matériau holo réutilisable (version condensée de 001) : couche mince spectrale, grain de foil,
 * paillettes, masques par tier. `strength` est un uniform → on peut faire "apparaître" le foil.
 */
export interface HoloOptions {
  pattern?: 'cracked' | 'nebula' | 'linear' | 'radial';
  aoFromFrame?: boolean;
  /** foil sur le fond de l'illustration (défaut 1 dès épique). Les photos réelles le baissent : un visage ne se recouvre pas d'arc-en-ciel. */
  windowFoil?: number;
  /** foil sur le sujet (défaut 0.8 en mythique). */
  subjectFoil?: number;
  /**
   * Variante téléphone, même aspect : couche mince lue dans une table (1 lecture au lieu de 12 cosinus), bruits du
   * grain de foil cuits dans une texture répétable (au lieu de 3 Perlin 3D), nébuleuse en 2 octaves au lieu de 4, et
   * pas de paillettes (voronoï 3×3) pour les communes / peu communes (tier ≤ 1, presque sans foil).
   */
  lite?: boolean;
}

export function createHoloMaterial(art: CardArt, tier: number, opts: HoloOptions = {}) {
  const U = {
    strength: uniform(0.75),
    thickness: uniform(420),
    amplitude: uniform(280),
    diffraction: uniform(0.4),
    glint: uniform(1),
    lightDir: uniform(new Vector3(-0.5, 0.7, 0.6).normalize()),
    extraEmissive: uniform(0),
  };
  const L = cardLayers(art, { bg: 0.03, subject: 0.014, fg: -0.003 }, undefined, { aoFromFrame: opts.aoFromFrame });
  const winFoil = L.window.mul(L.subject.a.oneMinus()).mul(opts.windowFoil ?? (tier >= 3 ? 1 : 0));
  const subjFoil = L.window.mul(L.subject.a).mul(L.fx.g).mul(opts.subjectFoil ?? (tier >= 5 ? 0.8 : 0));
  const foil = clamp(L.masks.r.mul(L.window.oneMinus()).add(winFoil).add(subjFoil), 0, 1);
  // ── micro-relief du foil : bruit continu (plus de cellules carrées), effacé quand il devient plus petit qu'un pixel
  const fuv = uv().mul(vec2(CARD.w, CARD.h)); // unités carte (1 = 10 cm)
  const P = fuv.mul(170); // grain ≈ 0.6 mm
  const fp = max(fwidth(P.x), fwidth(P.y));
  const aa = float(1).sub(smoothstep(0.3, 0.9, fp)); // 0 quand le grain < ~1.5 px → pas de scintillement
  const lite = !!opts.lite;
  const nP: N = lite ? noiseTexel(P) : null;
  const n1 = lite ? nP.x : mx_noise_float(vec3(P, 1.3)), n2 = lite ? nP.y : mx_noise_float(vec3(P, 7.9));
  const nTS = normalize(vec3(vec2(n1, n2).mul(0.1).mul(aa).mul(foil), 1));
  // ── paillettes : disques ronds anti-crénelés, orientation propre, disparaissent si trop petites à l'écran
  let disk: N = float(0);
  let nFlake: N = vec3(0, 0, 1);
  if (!(lite && tier <= 1)) {
    const FQ = fuv.mul(95);
    const vo = voronoi(FQ, float(0.9)) as N;
    const fq = max(fwidth(FQ.x), fwidth(FQ.y));
    const rad = float(0.3);
    const edge = fwidth(vo.x).mul(1.2).add(0.02);
    disk = smoothstep(rad.add(edge), rad.sub(edge), vo.x).mul(smoothstep(0.55, 0.58, vo.z)).mul(float(1).sub(smoothstep(0.25, 0.5, fq)));
    nFlake = normalize(vec3(hash(vo.z.mul(91.7)).sub(0.5).mul(0.6), hash(vo.z.mul(37.3)).sub(0.5).mul(0.6), 1));
  }
  const h1 = n1.mul(0.5).add(0.5);
  const h3 = lite ? (noiseTexel(fuv.mul(30).add(17.3)) as N).z : mx_noise_float(vec3(fuv.mul(30), 3.7));
  const q = uv().sub(0.5).mul(vec2(CARD.w, CARD.h)).mul(10);
  // même escalade que 001 : linéaire → radial (épique) → craquelé (légendaire) → nébuleuse (mythique)
  const pattern = opts.pattern ?? (tier >= 5 ? 'nebula' : tier >= 4 ? 'cracked' : tier >= 3 ? 'radial' : 'linear');
  const pat =
    pattern === 'nebula'
      ? mx_fractal_noise_float(vec3(q.mul(0.35), 1.7), lite ? 2 : 4).mul(0.9).add(0.5)
      : pattern === 'radial'
        ? sin(length(q.sub(vec2(0, 0.6))).mul(3.4)).mul(0.5).add(0.5)
        : pattern === 'cracked'
        ? (voronoi(q.mul(1.3), float(0.9)) as N).z
        : q.dot(vec2(0.8, 0.6)).mul(2.2).sin().mul(0.5).add(0.5);
  const V = L.view;
  const d = U.thickness.add(pat.sub(0.5).mul(U.amplitude)).add(h3.mul(9)).add(dot(V.xy, vec2(0.7, 0.7)).mul(U.diffraction).mul(900));
  const cosI = max(dot(nTS, V), 0.05);
  const film = saturate3(lite ? thinFilmLUT(d, cosI) : thinFilm(d, cosI, 1.45, 0.95), 1.05);
  const metal = foil.mul(smoothstep(0.04, 0.5, luminance(L.color))).mul(mix(float(0.55), float(1), L.window)).mul(U.strength);
  const foilCol = mix(vec3(0.92), film, 0.85).mul(mix(vec3(1), pow(L.color, vec3(0.5)), 0.55)).mul(1.15);
  const m = new MeshPhysicalNodeMaterial();
  m.colorNode = mix(L.color, foilCol, metal);
  m.metalnessNode = metal;
  m.roughnessNode = mix(mix(float(0.6), float(0.34), L.window), float(0.22).add(h1.mul(0.06)), metal);
  m.normalNode = bumpMap(L.masks.g, float(0.6), normalMap(vec4(nTS.mul(0.5).add(0.5), 1).xyz));
  m.clearcoatNode = float(0.35);
  m.clearcoatRoughnessNode = float(0.18);
  const Lobj = normalize(modelWorldMatrixInverse.mul(vec4(U.lightDir, 0)).xyz);
  const glint = pow(max(dot(reflect(V.negate(), nFlake), Lobj), 0), 80).mul(disk).mul(metal).mul(U.glint);
  m.emissiveNode = film.mul(glint).mul(3.5).add(L.subject.rgb.mul(L.fx.r).mul(L.subject.a).mul(L.window).mul(0.5)).add(film.mul(foil).mul(U.extraEmissive));
  return { material: m, layers: L, uniforms: U, film, foil };
}
