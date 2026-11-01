import { MeshPhysicalNodeMaterial, Vector3 } from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  floor,
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
} from 'three/tsl';
import type { CardArt } from './art';
import { cardLayers } from './cardMaterial';
import { CARD } from './cardModel';
import { hashCell, saturate3, thinFilm, voronoi, type N } from './tsl';

/**
 * Matériau holo réutilisable (version condensée de 001) : couche mince spectrale, grain de foil,
 * paillettes, masques par tier. `strength` est un uniform → on peut faire "apparaître" le foil.
 */
export function createHoloMaterial(art: CardArt, tier: number, opts: { pattern?: 'cracked' | 'nebula' | 'linear' } = {}) {
  const U = {
    strength: uniform(0.75),
    thickness: uniform(420),
    amplitude: uniform(280),
    diffraction: uniform(0.4),
    glint: uniform(1),
    lightDir: uniform(new Vector3(-0.5, 0.7, 0.6).normalize()),
    extraEmissive: uniform(0),
  };
  const L = cardLayers(art, { bg: 0.03, subject: 0.014, fg: -0.003 });
  const winFoil = L.window.mul(L.subject.a.oneMinus()).mul(tier >= 3 ? 1 : 0);
  const subjFoil = L.window.mul(L.subject.a).mul(L.fx.g).mul(tier >= 5 ? 0.8 : 0);
  const foil = clamp(L.masks.r.mul(L.window.oneMinus()).add(winFoil).add(subjFoil), 0, 1);
  const cell = floor(uv().mul(vec2(170, 237)));
  const h1 = hashCell(cell, 11), h2 = hashCell(cell, 12), h3 = hashCell(cell, 13);
  const nTS = normalize(vec3(vec2(h1.sub(0.5), h2.sub(0.5)).mul(0.16).mul(foil), 1));
  const q = uv().sub(0.5).mul(vec2(CARD.w, CARD.h)).mul(10);
  const pattern = opts.pattern ?? (tier >= 5 ? 'nebula' : tier >= 4 ? 'cracked' : 'linear');
  const pat =
    pattern === 'nebula'
      ? mx_fractal_noise_float(vec3(q.mul(0.35), 1.7), 4).mul(0.9).add(0.5)
      : pattern === 'cracked'
        ? (voronoi(q.mul(1.3), float(0.9)) as N).z
        : q.dot(vec2(0.8, 0.6)).mul(2.2).sin().mul(0.5).add(0.5);
  const V = L.view;
  const d = U.thickness.add(pat.sub(0.5).mul(U.amplitude)).add(h3.sub(0.5).mul(14)).add(dot(V.xy, vec2(0.7, 0.7)).mul(U.diffraction).mul(900));
  const film = saturate3(thinFilm(d, max(dot(nTS, V), 0.05), 1.45, 0.95), 1.05);
  const metal = foil.mul(smoothstep(0.04, 0.5, luminance(L.color))).mul(mix(float(0.55), float(1), L.window)).mul(U.strength);
  const foilCol = mix(vec3(0.92), film, 0.85).mul(mix(vec3(1), pow(L.color, vec3(0.5)), 0.55)).mul(1.15);
  const m = new MeshPhysicalNodeMaterial();
  m.colorNode = mix(L.color, foilCol, metal);
  m.metalnessNode = metal;
  m.roughnessNode = mix(mix(float(0.6), float(0.34), L.window), float(0.24).add(h1.mul(0.08)), metal);
  m.normalNode = bumpMap(L.masks.g, float(0.6), normalMap(vec4(nTS.mul(0.5).add(0.5), 1).xyz));
  m.clearcoatNode = float(0.35);
  m.clearcoatRoughnessNode = float(0.18);
  const Lobj = normalize(modelWorldMatrixInverse.mul(vec4(U.lightDir, 0)).xyz);
  const glint = pow(max(dot(reflect(V.negate(), nTS), Lobj), 0), 220).mul(smoothstep(0.9, 0.99, h2)).mul(metal).mul(U.glint);
  m.emissiveNode = film.mul(glint).mul(6).add(L.subject.rgb.mul(L.fx.r).mul(L.subject.a).mul(L.window).mul(0.5)).add(film.mul(foil).mul(U.extraEmissive));
  return { material: m, layers: L, uniforms: U, film, foil };
}
