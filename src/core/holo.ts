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
  abs,
  min,
  fwidth,
  mx_noise_float,
  hash,
  color,
} from 'three/tsl';
import type { CardArt } from './art';
import { cardLayers } from './cardMaterial';
import { CARD } from './cardModel';
import { noiseTexel, saturate3, thinFilm, thinFilmLUT, voronoi, type N } from './tsl';
import { pokeFaceColor, pokeFx } from './pokeHolo/face';

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
  /** reflet de rareté « Pokébox » (choix du 07/11, core/pokeHolo) — faux pour les photos (Bébous, KCDQ) */
  poke?: boolean;
  /** illustration détourée (sinon : splash / couverture → le 6★ place ses reflets autour du point focal) */
  cut?: boolean;
}

/**
 * Plafonds d'effet partagés par TOUTES les faces holo (retours live 02, §7 : « on ne reconnaît plus le design ni les
 * couleurs d'origine »). L'effet est porté par le cadre, le liseré, une bande de bordure et les paillettes ; sur
 * l'illustration (fenêtre du cadre : fond + sujet) le foil ne remplace jamais plus de `image` de la couleur d'origine
 * (avant : jusqu'à 70 % en visionneuse, 90 % à l'ouverture, sur tout le fond dès épique). Uniforms uniques → changer
 * une valeur agit sur toutes les cartes sans recompiler. `setHoloReduced` (option « Effets réduits ») les baisse.
 */
export const HOLO_LIMITS = {
  // (retours 06/11 : « réduire les effets sur les cartes, les bleues / rouges c'est trop ») : plafonds baissés
  // (retours live 6, C6 « zéro effet sur les cartes, l'image clean ») : plus aucun foil sur l'illustration ni de
  // paillettes / éclats ; seul le cadre garde la couleur de sa rareté (code couleur, 6★ arc-en-ciel)
  full: { image: 0, border: 0.72, glint: 0 },
  reduced: { image: 0, border: 0.55, glint: 0 },
} as const;
export const holoFx = {
  /** part maximale de couleur remplacée par le foil sur l'illustration (0..1) */
  image: uniform(HOLO_LIMITS.full.image),
  /** intensité du foil du cadre / de la bordure (0..1) */
  border: uniform(HOLO_LIMITS.full.border),
  /** intensité des paillettes et des éclats émissifs (0..1) */
  glint: uniform(HOLO_LIMITS.full.glint),
};
let holoReduced = false;
/** Option « Effets réduits » (core/fxPref.ts) : plafonds abaissés pour toutes les faces holo, à chaud. */
export function setHoloReduced(on: boolean) {
  holoReduced = on;
  const L = on ? HOLO_LIMITS.reduced : HOLO_LIMITS.full;
  holoFx.image.value = L.image;
  holoFx.border.value = L.border;
  holoFx.glint.value = L.glint;
  pokeFx.k.value = on ? 0.5 : 1;
}
export const isHoloReduced = () => holoReduced;

/**
 * Bande de bordure (bord de la carte → liseré intérieur) : présente à TOUS les paliers (retours live 02, §12 : code
 * couleur des raretés, la commune aussi a sa bordure).
 */
const BORDER_FOIL = [1, 1, 1, 1, 1, 1];
/**
 * Code couleur des raretés (retours live 02, §12) pour la bordure et le cadre : 1★ GRIS · 2★ VERT · 3★ BLEU · 4★ ROUGE
 * · 5★ DORÉ (teintes de src/core/rarity.ts) ; 6★ (et secrète) : ARC-EN-CIEL — la couche mince irisée, réservée à elles.
 */
const RIM_HEX = ['#a39d91', '#6f9a74', '#4c7cc2', '#c23a52', '#e0a63a'];
/** Largeur de la bande de bordure (unités carte : 0.02 ≈ 2 mm, juste au-delà du liseré du gabarit Pleine illustration). */
const BORDER_W = 0.02;

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
  // reflet de rareté (core/pokeHolo) : apparaît avec le holo pendant la révélation (strength 0,1 → 0,7+), plein en
  // visionneuse ; `cut` en uniform → un seul shader par palier, carte détourée ou non
  const cutU = uniform(opts.cut === false ? 0 : 1);
  const faceColor = opts.poke === false ? L.color : pokeFaceColor(art, L, tier, U.strength.sub(0.1).div(0.6), cutU);
  // (retours 06/11) le fond d'illustration ne s'irise plus dès l'épique (4★) : à partir de la légendaire, et moins
  const winFoil = L.window.mul(L.subject.a.oneMinus()).mul(opts.windowFoil ?? (tier >= 4 ? 0.7 : 0));
  const subjFoil = L.window.mul(L.subject.a).mul(L.fx.g).mul(opts.subjectFoil ?? (tier >= 5 ? 0.8 : 0));
  // ── zones : cadre (opaque) + bande de bordure = effet plein ; illustration = effet plafonné (holoFx.image)
  const cuv = uv().sub(0.5).mul(vec2(CARD.w, CARD.h));
  const cq = abs(cuv).sub(vec2(CARD.w / 2 - CARD.r, CARD.h / 2 - CARD.r));
  const edgeDist = length(max(cq, 0)).add(min(max(cq.x, cq.y), 0)).sub(CARD.r).negate(); // 0 au bord, > 0 vers l'intérieur
  // (retours 07/11) gabarit « Pleine illustration » : plus de bande de bordure métallique — l'image va jusqu'au bord
  const rimK = art.designId === 'full-art' ? 0 : BORDER_FOIL[Math.min(5, Math.max(0, tier))];
  const rim = smoothstep(float(BORDER_W), float(BORDER_W * 0.55), edgeDist).mul(rimK);
  const frameFoil = clamp(L.masks.r.mul(L.window.oneMinus()).add(rim), 0, 1).mul(holoFx.border);
  const inner = rim.oneMinus();
  const imageFoil = clamp(winFoil.add(subjFoil), 0, 1).mul(inner);
  const foil = clamp(frameFoil.add(imageFoil.mul(holoFx.image)), 0, 1);
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
  const lumGate = smoothstep(0.04, 0.5, luminance(L.color));
  // cadre / bordure : comme avant (bordure visible même sur un bord sombre d'illustration)
  const metalFrame = frameFoil.mul(mix(lumGate, float(1), rim.mul(0.6))).mul(mix(float(0.55), float(1), L.window)).mul(U.strength);
  // illustration : jamais plus de holoFx.image de la couleur d'origine remplacée, quelle que soit la force du holo
  // (sujet — personnage, visage — encore plus préservé que le fond : 60 % du plafond)
  const metalImage = min(winFoil.mul(inner).mul(lumGate).mul(U.strength), holoFx.image).add(min(subjFoil.mul(inner).mul(lumGate).mul(U.strength), holoFx.image.mul(0.6)));
  const metal = max(metalFrame, metalImage);
  const foilCol = mix(vec3(0.92), film, 0.85).mul(mix(vec3(1), pow(L.color, vec3(0.5)), 0.55)).mul(1.15);
  // cadre + bordure : couleur de la rareté (reflet métallique dans sa teinte) ; arc-en-ciel irisé pour 6★ / secrète
  const rainbow = tier >= 5;
  const frameCol = rainbow ? foilCol : color(RIM_HEX[Math.max(0, tier)]).mul(luminance(film).mul(0.5).add(0.72));
  // la bordure reste lisible même quand le holo est au plus bas (carte encore « éteinte » pendant l'ouverture)
  const frameMix = max(metalFrame, rim.mul(0.92).mul(holoFx.border.mul(0.4).add(0.6)));
  const m = new MeshPhysicalNodeMaterial();
  m.colorNode = mix(mix(faceColor, foilCol, metalImage), frameCol, frameMix);
  // métal au tiers sur l'illustration : un reflet par-dessus l'image, pas une image assombrie qui reflète le studio
  m.metalnessNode = max(frameMix.mul(rainbow ? 1 : 0.75), metalImage.mul(0.35));
  m.roughnessNode = mix(mix(float(0.6), float(0.34), L.window), float(0.22).add(h1.mul(0.06)), metal);
  m.normalNode = bumpMap(L.masks.g, float(0.6), normalMap(vec4(nTS.mul(0.5).add(0.5), 1).xyz));
  // (retours live 6, C6) vernis presque mat : plus de reflet du décor qui passe sur l'image
  m.clearcoatNode = float(0.08);
  m.clearcoatRoughnessNode = float(0.5);
  const Lobj = normalize(modelWorldMatrixInverse.mul(vec4(U.lightDir, 0)).xyz);
  const glint = pow(max(dot(reflect(V.negate(), nFlake), Lobj), 0), 80).mul(disk).mul(metal).mul(U.glint).mul(holoFx.glint);
  m.emissiveNode = (rainbow ? film : frameCol).mul(glint).mul(3.5).add(L.subject.rgb.mul(L.fx.r).mul(L.subject.a).mul(L.window).mul(0.5)).add(film.mul(foil).mul(U.extraEmissive));
  return { material: m, layers: L, uniforms: U, film, foil, cut: cutU };
}
