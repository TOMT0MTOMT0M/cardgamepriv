import { AdditiveBlending, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sprite, SpriteNodeMaterial, type Object3D } from 'three/webgpu';
import {
  abs,
  atan,
  clamp,
  dot,
  exp,
  float,
  fract,
  hash,
  instanceIndex,
  length,
  max,
  min,
  mix,
  select,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { RarityId } from '../../core/rarity';
import type { CardArt } from '../../core/art';
import { CARD } from '../../core/cardModel';
import { viewDirObject } from '../../core/cardMaterial';
import type { N } from '../../core/tsl';
import {
  alive,
  cellFlash,
  contour,
  dirOf,
  emboss,
  flickAge,
  flickPulse,
  glare,
  hueRotate,
  innerSDF,
  innerUV,
  iris,
  luminance,
  noise,
  printGuard,
  rot2,
  sat,
  screen,
  softbox,
  sparkle,
  strength,
  strip,
  type CardGeo,
  type FxCtx,
  type LayerOpts,
  type Q,
} from './kit';
import type { Inputs } from './kit';
import type { FxTextures } from './textures';

/**
 * RÉVISION DU 05/11 — les 35 effets sont pensés AVEC la carte du jeu (design full-art : illustration bord à bord,
 * liseré intérieur, voile sombre qui porte le nom, étoiles en haut à gauche ; Bébous : photo pleine, double filet,
 * sceau). Chaque effet sait où il agit : la marge, le liseré, le texte, les étoiles, la plaque du nom, le fond de
 * l'illustration, le CONTOUR du sujet, le sujet lui-même (bridé), ou hors de la carte.
 * Inspirations (jamais des copies) : Pokémon EV (Illustration Rare et son texturage qui suit le dessin, Hyper Rare
 * or), Lorcana (Enchanted : le foil épouse le trait), One Piece (Manga Rare), Magic (etched, textured, surge foil),
 * Yu-Gi-Oh (Ghost, Starlight, Quarter Century), Marvel Snap (frame break, split, encre), TCG Pocket (immersives).
 * Technologies conservées : langage de rotation (inertie, chemin cumulé, coup de poignet, torsion), garde d'impression,
 * « quasi nul de face », éclat par cellule, ombres par mip, plan hors cadre, fond d'écran partiel, interior mapping,
 * sprites sans état, budget de particules, vitrine hors-axe.
 */

export interface FxOut {
  color: N;
  emissive?: N;
}

/** Ce qu'un effet peut demander à l'expérience (objets en plus de la carte, illustrations supplémentaires). */
export interface FxEnv {
  q: Q;
  tex: FxTextures;
  I: Inputs;
  art: CardArt;
  geo: CardGeo;
  /** photo pleine (pas de sujet détouré) */
  photo: boolean;
  /** horloge des nœuds (même base que `time` et `I.flick`) */
  now(): number;
  /** illustrations de la même carte, autres palettes */
  makeViews(n: number): Promise<CardArt[]>;
  bag: { add<T extends { dispose(): void }>(o: T): T };
}

export interface FxDef {
  num: number;
  tier: RarityId;
  name: string;
  /** principe visuel */
  idea: string;
  /** d'où vient l'idée (TCG actuels) et ce qui la rend nôtre */
  inspi: string;
  /** techniques */
  tech: string;
  /** coût estimé : lectures de texture en plus · instructions (estimation, à mesurer) */
  cost: string;
  /** version « effets réduits » / Low */
  reduced: string;
  /** pourquoi l'illustration reste lisible */
  readable: string;
  /** intensité du bloom (0 = pas de bloom) */
  bloom?: number;
  /** effet « de remplacement » (négatif, ombres, verre, pièce) : le gain global ne s'y applique pas */
  gainless?: boolean;
  /** la face avant est translucide : dessinée après les opaques (le fond d'écran copié contient tout le reste) */
  transparentFront?: boolean;
  layers?: (q: Q, art: CardArt, I: Inputs, photo: boolean, geo: CardGeo) => LayerOpts;
  prepare?: (env: FxEnv) => Promise<Record<string, unknown>>;
  build(c: FxCtx): FxOut;
  /** objets ajoutés à la carte (particules, plans) */
  attach?(env: FxEnv, card: Object3D, extra: Record<string, unknown>): void;
}

const lightDir = (c: FxCtx) => c.I.light.sub(c.uv).normalize();
const isLow = (c: FxCtx) => c.q === 'low';
/** direction de la lampe virtuelle dans le plan de la carte (orientation + inertie) */
const Ldir = (c: FxCtx, lagK = 0.5): N => dirOf(c.I.tilt.add(c.I.lag.mul(lagK)).add(vec2(0.0001, 0.0002)));
/** angle autour du centre de la carte, 0..1 (paramètre du pourtour) */
const perim = (c: FxCtx): N => {
  const d = c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h));
  return atan(d.y, d.x).div(Math.PI * 2).add(0.5);
};
/** UV centrés sur le point focal du sujet, en unités carte (isotropes) */
const aroundFocus = (c: FxCtx): N => c.uv.sub(c.focus).mul(vec2(CARD.w, CARD.h));

// ═══════════════════════════════════════════════════════════ 1★ COMMUNE — la carte elle-même : marge, liseré, étoiles
const COMMON: FxDef[] = [
  {
    num: 1,
    tier: 'common',
    name: 'Reflet de vitrine',
    idea: 'Comme une carte rangée sous verre : le reflet d’une fenêtre glisse sur toute la carte, traîne un peu et s’étire quand on tourne vite. Il n’existe presque pas de face.',
    inspi: 'les toploaders et vitrines de collection ; à nous : le reflet a de l’inertie et se déforme avec la vitesse de rotation',
    tech: 'rectangle arrondi doux (SDF) centré sur la lumière + inertie, étiré le long de la vitesse angulaire ; garde d’impression (les noirs restent noirs) ; quasi nul au repos',
    cost: '0 T · ~18 ALU',
    reduced: 'reflet fixe, sans suivi',
    readable: 'additif ≤ 8 %, absent dans les noirs, moitié moins sur le sujet',
    build(c) {
      if (isLow(c)) return { color: c.L.color.add(vec3(glare(c, 0.34, vec2(0.32, 0.78)).mul(0.07).mul(c.subj.mul(0.5).oneMinus()))) };
      const box = softbox(c, c.I.light.add(c.I.lag.mul(vec2(0.45, 0.4))), [0.15, 0.21]);
      const k = alive(c, 0.35).mul(printGuard(c.L.color)).mul(c.subj.mul(0.5).oneMinus());
      return { color: c.L.color.add(vec3(box.mul(0.085).mul(k))) };
    },
  },
  {
    num: 2,
    tier: 'common',
    name: 'Marge d’argent',
    idea: 'La marge entre le bord et le liseré devient une bande d’argent satiné, à travers laquelle l’illustration transparaît ; un éclat la parcourt tant que la carte tourne.',
    inspi: 'les bordures argent des cartes Magic « borderless » ; à nous : l’éclat avance avec le chemin de rotation et s’arrête avec la main',
    tech: 'zone = marge (SDF du liseré du design) ; argent multiplicatif (l’art reste visible) ; éclat périodique dont la phase = rotation cumulée ; le côté tourné vers la lumière s’allume',
    cost: '0 T · ~16 ALU',
    reduced: 'argent statique',
    readable: 'marge uniquement ; l’illustration reste lisible au travers',
    build(c) {
      const silver = vec3(0.8, 0.82, 0.86);
      if (isLow(c)) return { color: mix(c.L.color, c.L.color.mul(0.35).add(silver.mul(0.55)), c.margin.mul(0.6)) };
      const t = c.I.tilt;
      const wave = sin(perim(c).mul(Math.PI * 12).sub(c.I.phase.mul(2.2)).sub(t.x.mul(3))).mul(0.5).add(0.5);
      const sheen = smoothstep(c.I.energy.mul(-0.3).add(0.6), float(1), wave);
      const side = clamp(dot(dirOf(c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h))), Ldir(c)), 0, 1).mul(strength(t));
      const metal = c.L.color.mul(0.35).add(silver.mul(sheen.mul(0.55).add(0.5).add(side.mul(0.35))));
      return { color: mix(c.L.color, metal, c.margin.mul(0.65)) };
    },
  },
  {
    num: 3,
    tier: 'common',
    name: 'Carton du voile',
    idea: 'Les voiles sombres qui portent le nom et les étoiles ont la fibre d’un carton noir : invisible de face, elle apparaît en lumière rasante.',
    inspi: 'le grain des cartes « textured » de Magic ; à nous : la texture n’est que sur les voiles du design, et seulement quand on penche',
    tech: 'bruit précalculé en relief (2 lectures décalées vers la lumière) ; amplitude et longueur d’ombre ∝ inclinaison ; zone = voiles + marge',
    cost: '2 T · ~12 ALU',
    reduced: 'désactivé',
    readable: 'voiles uniquement, ±8 % de luminance, le texte n’est pas touché',
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      const p = c.uv.mul(vec2(34 * CARD.w, 34 * CARD.h));
      const graze = strength(c.I.tilt).pow(1.5);
      const sh = emboss(c.tex.noise, p, lightDir(c), graze.mul(0.8).add(0.18), 'r', graze.mul(0.012).add(0.006));
      const fiber = noise(c, p.mul(2.3)).a.sub(0.5).mul(graze.mul(0.05).add(0.015));
      const zone = c.veil.add(c.margin.mul(0.4)).mul(c.ink.oneMinus());
      return { color: c.L.color.mul(sh.add(fiber).mul(zone).add(1)) };
    },
  },
  {
    num: 4,
    tier: 'common',
    name: 'Trait du liseré',
    idea: 'Au toucher, ou d’un coup de poignet, un trait de lumière part du coin qui « mène » et fait le tour de la carte EN SUIVANT le liseré du design.',
    inspi: 'les animations d’obtention de Marvel Snap ; à nous : le trait épouse le vrai liseré et part du côté de la rotation',
    tech: 'angle autour du centre (atan) comparé à une tête qui avance ; zone = bande du liseré (SDF) ; deux têtes opposées au coup de poignet',
    cost: '0 T · ~16 ALU, à la demande',
    reduced: 'au toucher seulement',
    readable: 'liseré, ponctuel',
    build(c) {
      const th = perim(c);
      const run = (age: N, start: N | number = 0, spd = 0.6, dur = 1.65) => {
        const head = fract(float(start).add(age.mul(spd)));
        let dd: N = fract(th.sub(head).add(0.5)).sub(0.5);
        if (spd < 0) dd = dd.negate();
        const on = step(float(0), age).mul(step(age, float(dur)));
        return smoothstep(float(0.025), float(0), abs(dd)).add(smoothstep(float(-0.18), float(0), dd).mul(step(dd, float(0))).mul(0.35)).mul(on);
      };
      const tap = run(time.sub(c.I.tap));
      const auto = isLow(c) ? float(0) : run(time.mod(6.5).sub(0.5));
      const fd = c.I.flickDir;
      const start = atan(fd.y.mul(CARD.h), fd.x.mul(CARD.w)).div(Math.PI * 2).add(0.5);
      const fa = flickAge(c);
      const fl = isLow(c) ? float(0) : max(run(fa, start, 0.55, 0.92), run(fa, start, -0.55, 0.92));
      const zone = max(smoothstep(float(0.009), float(0.002), abs(c.innerD)), c.margin.mul(0.18));
      const light = max(max(tap, auto), fl).mul(zone);
      const col = mix(vec3(1), c.accent, 0.4);
      return { color: c.L.color.add(col.mul(light.mul(0.95))), emissive: col.mul(light).mul(0.4) };
    },
  },
  {
    num: 5,
    tier: 'common',
    name: 'Étoiles frappées',
    idea: 'Les étoiles de rareté sont frappées comme une médaille : chacune a sa facette et s’allume à SON angle, une par une, quand on fait tourner la carte.',
    inspi: 'les symboles de rareté métallisés des cartes japonaises ; à nous : chaque étoile est une facette indépendante (index d’étoile du design)',
    tech: 'masque B du design = index d’étoile ; facette par étoile (hash de l’index) → éclat quand l’orientation passe par son angle ; relief de l’alpha du cadre',
    cost: '1 T (zone minuscule) · ~16 ALU',
    reduced: 'étoiles plates, éclat selon l’inclinaison seule',
    readable: 'les étoiles seulement',
    build(c) {
      const nrm = vec2(hash(c.starIdx.mul(12.9).add(1)), hash(c.starIdx.mul(78.2).add(5))).mul(2).sub(1);
      // + un coup de poignet allume toutes les étoiles d'un coup, puis elles s'éteignent une à une (par index)
      const burst = isLow(c) ? float(0) : flickPulse(c, 0.9).mul(smoothstep(float(0.9), float(0.2), flickAge(c).mul(1.6).sub(c.starIdx.mul(0.12))));
      const flash = isLow(c) ? smoothstep(float(0.4), float(0.9), length(c.I.tilt)).mul(0.5) : max(cellFlash(c, nrm, 0.8, 1), burst);
      const e = isLow(c) ? float(0) : emboss(c.art.frame, c.uv, lightDir(c), 2.4, 'a', 0.0026);
      const gold = mix(vec3(1, 0.88, 0.6), c.tint, 0.35);
      const lit = c.L.color.add(gold.mul(max(e, 0).mul(0.7).add(flash.mul(0.65)))).sub(vec3(max(e.negate(), 0).mul(0.3)));
      return { color: mix(c.L.color, lit, c.stars), emissive: gold.mul(flash.mul(c.stars).mul(0.7)) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 2★ PEU COMMUNE — le texte, le liseré, le contour du sujet
const UNCOMMON: FxDef[] = [
  {
    num: 6,
    tier: 'uncommon',
    name: 'Vernis sélectif',
    idea: 'Tout ce qui est imprimé sur l’illustration — nom, univers, numéro, étoiles, liseré — reçoit un vernis brillant : une bande de lumière passe dessus quand on incline, le reste reste mat.',
    inspi: 'le vernis UV sélectif des cartes premium (One Piece, Lorcana) ; à nous : la bande est le reflet d’une vraie lampe en bande, avec inertie',
    tech: 'zone = encre du design (alpha × luminance du calque cadre) ; reflet de lampe en bande (gaussienne) dont la position suit l’orientation + inertie ; quasi nul de face',
    cost: '0 T · ~14 ALU',
    reduced: 'gloss figé',
    readable: 'texte et liseré uniquement',
    build(c) {
      const zone = c.ink;
      if (isLow(c)) return { color: c.L.color.add(vec3(0.07).mul(zone)) };
      const o = c.I.tilt.add(c.I.lag.mul(0.6));
      const pos = float(0.5).add(o.y.mul(0.6)).add(o.x.mul(0.25));
      const band = strip(c, [0.3, 0.95], pos, c.I.energy.mul(0.06).add(0.07));
      const gloss = band.mul(0.6).mul(alive(c, 0.3)).add(0.05);
      return { color: c.L.color.add(mix(vec3(1), c.accent, 0.25).mul(gloss.mul(zone))) };
    },
  },
  {
    num: 7,
    tier: 'uncommon',
    name: 'Liseré de métal',
    idea: 'Le liseré intérieur devient un filet de métal à la couleur de la rareté : un éclat y court dans le sens de la rotation et le côté tourné vers la lumière brille.',
    inspi: 'les filets dorés des Special Illustration Rare ; à nous : l’éclat avance avec le chemin cumulé et la bande s’élargit en traînée si on tourne vite',
    tech: 'bande du liseré (SDF du design, plus large que le trait imprimé) ; métal = teinte × (0,6 + éclat) ; éclat périodique sur le pourtour (phase = rotation cumulée) ; lumière directionnelle',
    cost: '0 T · ~18 ALU',
    reduced: 'filet coloré fixe',
    readable: 'liseré uniquement',
    build(c) {
      const band = smoothstep(float(0.007), float(0.0015), abs(c.innerD));
      const metalC = mix(c.tint, vec3(1), 0.25);
      if (isLow(c)) return { color: mix(c.L.color, metalC.mul(0.85), band.mul(0.8)) };
      const w = c.I.energy.mul(0.08).add(0.035);
      const head = fract(c.I.phase.mul(0.12).add(c.I.tilt.x.mul(0.15)));
      const dd = abs(fract(perim(c).sub(head).add(0.5)).sub(0.5));
      const run = smoothstep(w, float(0), dd).add(smoothstep(w, float(0), abs(dd.sub(0.5))).mul(0.6));
      const side = clamp(dot(dirOf(c.uv.sub(0.5)), Ldir(c)), 0, 1).mul(strength(c.I.tilt));
      const lit = metalC.mul(float(0.6).add(side.mul(0.5))).add(vec3(run.mul(0.6)));
      return { color: mix(c.L.color, lit, band.mul(0.9)), emissive: metalC.mul(run.mul(band)).mul(0.35) };
    },
  },
  {
    num: 8,
    tier: 'uncommon',
    name: 'Contre-jour',
    idea: 'Le personnage est éclairé de côté : un fin liseré de lumière court sur SA silhouette, du côté où l’on penche la carte, comme un rim light de studio. Sur une photo, ce sont les contours de la photo qui s’allument.',
    inspi: 'les portraits « rim light » des cartes illustrées ; à nous : la lumière suit l’orientation réelle de la carte, et la silhouette vient du détourage',
    tech: 'gradient de l’alpha du sujet dans un mip flouté (3 lectures) → normale de la silhouette ; liseré intérieur = bande × (n · lumière)^1,5 ; photo : gradient de luminance',
    cost: '3 T · ~20 ALU',
    reduced: 'liseré fixe venant d’en haut',
    readable: 'un trait de lumière sur le bord du sujet, jamais sur son intérieur',
    build(c) {
      const k = contour(c, 2, 0.006);
      const L = isLow(c) ? vec2(0.3, 0.95) : Ldir(c);
      const facing = max(dot(k.n, L), 0).pow(1.5);
      const edgeIn = c.photo ? k.band : k.band.mul(k.inside);
      const rim = edgeIn.mul(facing).mul(isLow(c) ? float(0.6) : strength(c.I.tilt).mul(0.7).add(0.3));
      const warm = mix(vec3(1, 0.95, 0.85), c.accent, 0.25);
      return { color: c.L.color.add(warm.mul(rim.mul(0.9))), emissive: warm.mul(rim).mul(0.3) };
    },
  },
  {
    num: 9,
    tier: 'uncommon',
    name: 'Plaque brossée',
    idea: 'Le voile du bas, qui porte le nom, devient une plaque de métal sombre brossée : un reflet étiré la parcourt de haut en bas quand on incline. Le nom reste net par-dessus.',
    inspi: 'les plaques nominatives des cartes de collection premium ; à nous : le métal n’existe que sous le nom, et le reflet a de l’inertie',
    tech: 'zone = voile du bas (alpha du cadre sans l’encre) ; brossage = bruit étiré horizontalement (1 lecture) ; reflet anisotrope (gaussienne sur v) piloté par l’inclinaison + inertie',
    cost: '1 T · ~14 ALU',
    reduced: 'brossage statique',
    readable: 'plaque uniquement, le texte n’est pas touché',
    build(c) {
      const zone = c.veil.mul(smoothstep(float(0.42), float(0.3), c.uv.y));
      const n = noise(c, c.uv.mul(vec2(1.1, 80))).r;
      const y0 = isLow(c) ? float(0.2) : float(0.18).sub(c.I.tilt.y.add(c.I.lag.y.mul(0.6)).mul(0.14));
      const hl = exp(c.uv.y.sub(y0).mul(16).pow(2).negate());
      const metal = c.L.color.mul(n.mul(0.45).add(0.8)).add(mix(vec3(0.75), c.tint, 0.3).mul(hl.mul(n.add(0.35)).mul(0.5)));
      return { color: mix(c.L.color, metal, zone) };
    },
  },
  {
    num: 10,
    tier: 'uncommon',
    name: 'Nom en creux',
    idea: 'Le nom est gravé en creux dans la plaque : en lumière rasante, l’ombre des lettres s’allonge et l’or au fond des sillons s’allume.',
    inspi: 'les noms embossés des cartes « foil-etched » de Magic ; à nous : la profondeur du creux dépend de l’angle réel',
    tech: 'relief = masque G du design (le nom flouté) ; 2 lectures décalées vers la lumière, décalage ∝ inclinaison ; dorure des sillons ∝ lumière rasante',
    cost: '2 T · ~10 ALU',
    reduced: 'plat',
    readable: 'améliore la lecture du nom',
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      const tl = strength(c.I.tilt);
      const e = clamp(emboss(c.art.masks, c.uv, lightDir(c).negate(), tl.mul(3).add(2.5), 'g', tl.mul(0.003).add(0.0012)), -0.35, 0.6);
      const groove = smoothstep(float(0.15), float(0.6), c.relief);
      return { color: c.L.color.mul(e.add(1)).add(vec3(1, 0.85, 0.55).mul(groove.mul(tl.mul(0.25).add(0.05)))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 3★ RARE — le fond de l'illustration s'anime, le sujet reste intact
const RARE: FxDef[] = [
  {
    num: 11,
    tier: 'rare',
    name: 'Encre à variation optique',
    idea: 'L’encre des billets de banque : le FOND de l’illustration bascule entre deux couleurs selon l’angle, et une barre lumineuse roule dessus. Le personnage, le nom et les voiles ne bougent pas.',
    inspi: 'les encres OVI et la « rolling bar » de l’euro ; à nous : appliquées seulement au fond détouré, avec inertie',
    tech: 'teinte multiplicative (luminance conservée) entre la couleur de la rareté et sa complémentaire, k = projection de l’orientation ; barre = lampe en bande ; garde d’impression',
    cost: '0 T · ~24 ALU',
    reduced: 'teinte fixe à mi-chemin, sans barre',
    readable: 'sujet, texte et voiles intacts ; luminance du fond conservée',
    build(c) {
      const A = c.tint, B = hueRotate(c.tint, float(2.6));
      if (isLow(c)) return { color: iris(c.L.color, mix(A, B, 0.5), c.fond.mul(0.4), 0.04) };
      const o = c.I.tilt.add(c.I.lag.mul(0.5));
      const k = smoothstep(float(-0.75), float(0.75), dot(o, vec2(0.8, 0.6)));
      const tinted = iris(c.L.color, mix(A, B, k), c.fond.mul(0.5), 0.06);
      const bar = strip(c, [0.9, 0.35], float(0.5).add(o.x.mul(0.6)).add(o.y.mul(0.2)), c.I.energy.mul(0.05).add(0.07));
      return { color: tinted.add(mix(vec3(1), A, 0.2).mul(bar.mul(0.3).mul(c.fond).mul(printGuard(c.L.color)).mul(alive(c, 0.4)))) };
    },
  },
  {
    num: 12,
    tier: 'rare',
    name: 'Halo topographique',
    idea: 'Autour du personnage, des lignes de niveau gravées épousent SA silhouette, comme sur une carte d’état-major : elles s’allument du côté de la lumière et ondulent vers l’extérieur quand on tourne.',
    inspi: 'le texturage des Illustration Rare de Pokémon, qui suit le dessin ; à nous : les lignes sont calculées depuis la silhouette du sujet (distance floue), jamais dessinées à la main',
    tech: 'champ « distance au sujet » = alpha du sujet sur 3 mips (2, 4, 6) ; lignes = fract(champ × N − chemin cumulé) ; éclairage = normale de la silhouette (mip 4) · lumière ; photo : lignes de niveau de la luminance',
    cost: '4 T · ~26 ALU',
    reduced: 'lignes fixes, sans éclairage',
    readable: 'fond uniquement, jamais sur le sujet ; lignes fines additives',
    build(c) {
      let f: N, gate: N;
      if (c.photo) {
        f = luminance(texture(c.art.bg, c.L.bgUV).level(float(4)).rgb);
        gate = c.fond;
      } else {
        const a2 = texture(c.art.subject, c.L.sjUV).level(float(2)).a;
        const a4 = texture(c.art.subject, c.L.sjUV).level(float(4)).a;
        const a6 = texture(c.art.subject, c.L.sjUV).level(float(6)).a;
        f = a2.mul(0.4).add(a4.mul(0.35)).add(a6.mul(0.25));
        gate = c.fond.mul(smoothstep(float(0.015), float(0.08), f)).mul(c.L.subject.a.oneMinus());
      }
      const run = isLow(c) ? float(0) : c.I.phase.mul(0.35).add(c.I.tilt.x.mul(0.3));
      const t = fract(f.mul(16).sub(run));
      const line = smoothstep(float(0.14), float(0.02), min(t, t.oneMinus()));
      const k = contour(c, 4, 0.012);
      const lit = isLow(c) ? float(0.6) : max(dot(k.n, Ldir(c)), 0).mul(strength(c.I.tilt).mul(0.8).add(0.2)).add(0.25);
      const col = mix(vec3(1), c.tint, 0.45);
      const add = col.mul(line.mul(gate).mul(lit).mul(0.42).mul(printGuard(c.L.color)));
      return { color: c.L.color.add(add), emissive: add.mul(0.3) };
    },
  },
  {
    num: 13,
    tier: 'rare',
    name: 'Kintsugi',
    idea: 'Le décor derrière le personnage est une céramique recollée à l’or : chaque veine s’allume à SON angle quand on tourne la carte, et les veines s’arrêtent au bord du personnage.',
    inspi: 'les « cracked ice » des cartes Panini/Topps, réinterprétés en art japonais ; à nous : une facette par tesson, veines masquées par la silhouette',
    tech: 'Voronoï PRÉCALCULÉ (arêtes = veines) ; facette par cellule (hash) → éclat quand l’orientation passe par son angle ; laque douce (boîte à lumière) sur les tessons',
    cost: '2 T · ~20 ALU',
    reduced: 'veines d’or sans éclat',
    readable: 'fond uniquement ; les tessons gardent l’illustration',
    build(c) {
      const cell = texture(c.tex.cells, c.uv.mul(vec2(2.1 * CARD.w / 0.63, 2.1 * CARD.h / 0.63)));
      const id = cell.r;
      const vein = smoothstep(float(0.06), float(0.0), cell.g).mul(noise(c, c.uv.mul(9)).a.mul(0.5).add(0.6));
      const gold = vec3(1, 0.78, 0.36);
      if (isLow(c)) return { color: mix(c.L.color, gold.mul(0.9), vein.mul(c.fond).mul(0.7)) };
      const nrm = vec2(hash(id.mul(91.3)), hash(id.mul(47.1).add(3))).mul(2).sub(1);
      const flash = cellFlash(c, nrm, 0.8);
      const lacq = softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.12, 0.18]).mul(0.05).mul(printGuard(c.L.color));
      const base = c.L.color.add(vec3(lacq).mul(c.fond));
      const col = mix(base, gold.mul(flash.mul(1.1).add(0.75)), vein.mul(c.fond).mul(0.85));
      return { color: col, emissive: gold.mul(vein.mul(flash).mul(c.fond)).mul(0.6) };
    },
  },
  {
    num: 14,
    tier: 'rare',
    name: 'Cadran soleil',
    idea: 'Le fond est un cadran de montre brossé « soleil » CENTRÉ SUR LE PERSONNAGE : une barre de lumière tourne autour de lui en suivant l’inclinaison et la torsion.',
    inspi: 'les fonds « sunburst » de certaines Illustration Rare ; à nous : le centre est le point focal du sujet donné par le design, la barre suit la torsion du téléphone',
    tech: 'brossage radial autour du point focal ; reflet anisotrope = (1 − |rayon · lumière|)^p ; grain lu le long de l’angle (1 lecture) ; torsion = gyroscope α / molette',
    cost: '1 T · ~20 ALU',
    reduced: 'brossage statique',
    readable: 'fond uniquement, multiplicatif + reflet plafonné',
    build(c) {
      const p = aroundFocus(c);
      const r = length(p);
      const ang = atan(p.y, p.x);
      const grain = noise(c, vec2(ang.mul(14).add(0.5), 0.23)).r;
      const brushed = c.L.color.mul(grain.mul(0.22).add(0.89));
      if (isLow(c)) return { color: mix(c.L.color, brushed, c.fond) };
      const Ld = rot2(Ldir(c, 0.6), c.I.twist.negate());
      const an = float(1).sub(abs(dot(dirOf(p), Ld))).pow(7);
      const bar = an.mul(strength(c.I.tilt, 0.7).mul(0.75).add(0.25)).mul(smoothstep(float(0.02), float(0.1), r));
      const metal = brushed.add(mix(vec3(1), c.accent, 0.35).mul(bar.mul(grain.add(0.4)).mul(0.5)).mul(printGuard(c.L.color)));
      return { color: mix(c.L.color, metal, c.fond) };
    },
  },
  {
    num: 15,
    tier: 'rare',
    name: 'Double plan',
    idea: 'Le personnage se décolle du décor avec son ombre portée ; il est « en gelée » : il traîne derrière la rotation, déborde et se repose.',
    inspi: 'la parallaxe de TCG Pocket ; à nous : inertie du seul sujet (ressort) et décollement qui augmente avec l’énergie',
    tech: 'parallaxe ×2,4 (+ énergie) ; décalage du SUJET seul par l’inertie ; ombre portée = alpha du sujet en mip flouté, décalée à l’opposé de la lumière',
    cost: '1 T · ~10 ALU',
    reduced: 'décalage ×1,4, pas d’ombre',
    readable: 'le sujet n’est pas altéré, seulement déplacé',
    gainless: true,
    layers: (q, _art, I) => (q === 'low' ? { depth: 1.4 } : { depth: I.energy.mul(0.9).add(2.4), subjectShift: I.lag.mul(vec2(-0.018, 0.018)) }),
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      const off = c.I.light.sub(0.5).mul(-0.035).add(vec2(0.008, -0.012));
      const sh = texture(c.art.subject, c.L.sjUV.add(off)).level(float(3)).a;
      return { color: c.L.color.mul(float(1).sub(sh.mul(0.4).mul(c.fond))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 4★ ÉPIQUE — profondeur, relief, le trait du dessin
const EPIC: FxDef[] = [
  {
    num: 16,
    tier: 'epic',
    name: 'Théâtre de papier',
    idea: 'La carte devient un « tunnel book » : la marge et la plaque du nom sont une feuille découpée posée devant l’illustration, le personnage une autre feuille, et chacune projette son ombre sur la suivante — l’ombre tourne avec la lumière.',
    inspi: 'les cartes « pop-up » et le papier découpé ; à nous : les feuilles sont les vrais calques du design (marge, voile, sujet, premier plan)',
    tech: 'parallaxe ×2,2 (+ énergie) ; ombres = alpha du calque du dessus en mip flouté, décalé à l’opposé de la lumière (+ inertie) ; ombre de la marge = SDF du liseré décalé ; grain papier',
    cost: '3 T · ~24 ALU',
    reduced: 'parallaxe ×1,5, une seule ombre',
    readable: 'aucune couleur ajoutée : seulement des ombres douces',
    gainless: true,
    layers: (q, _art, I) => ({ depth: q === 'low' ? 1.5 : I.energy.mul(0.8).add(2.2), subjectShift: q === 'low' ? undefined : I.lag.mul(vec2(-0.012, 0.012)) }),
    build(c) {
      const ld = c.I.light.sub(0.5).mul(vec2(1, 0.8)).add(isLow(c) ? vec2(0, 0) : c.I.lag.mul(0.5));
      const off = ld.mul(-0.05).add(vec2(0.006, -0.01));
      const shS = texture(c.art.subject, c.L.sjUV.add(off)).level(float(3)).a;
      let shade: N = shS.mul(0.45).mul(c.fond);
      if (!isLow(c)) {
        // la feuille de devant (marge + plaque) projette son ombre vers l'intérieur, côté opposé à la lumière
        const shM = smoothstep(float(-0.04), float(0.004), innerSDF(c.geo, c.uv.add(ld.mul(0.03)))).mul(c.inner);
        const shV = texture(c.art.frame, c.uv.add(ld.mul(0.025))).level(float(4)).a.mul(c.frame.oneMinus());
        const shF = texture(c.art.fg, c.L.uvAt(-0.003).add(off.mul(0.7))).level(float(3)).a;
        shade = shade.add(shM.mul(0.35)).add(shV.mul(0.3)).add(shF.mul(0.3).mul(c.L.fg.a.oneMinus()));
      }
      const paper = noise(c, c.uv.mul(vec2(30 * CARD.w, 30 * CARD.h))).a.sub(0.5).mul(0.05);
      return { color: c.L.color.mul(float(1).sub(clamp(shade, 0, 0.7))).mul(paper.add(1)) };
    },
  },
  {
    num: 17,
    tier: 'epic',
    name: 'Émail guilloché',
    idea: 'Un cadran Fabergé : une rosace guillochée gravée sous un émail translucide, CENTRÉE SUR LE PERSONNAGE. La gravure accroche un reflet et la rosace tourne avec la carte.',
    inspi: 'les fonds « etched » de Magic et les cadrans d’horlogerie ; à nous : la rosace rayonne depuis le sujet et tourne avec la torsion',
    tech: 'guillochis précalculé lu dans un repère centré sur le point focal, tourné (inclinaison + torsion + inertie) ; relief (2 lectures) qui s’allonge en rasant ; émail = teinte multiplicative + gloss',
    cost: '3 T · ~24 ALU',
    reduced: 'lignes plates',
    readable: 'gravure sur le fond, jamais sur le sujet ; luminance conservée',
    build(c) {
      const p0 = aroundFocus(c).div(CARD.w * 1.1);
      const w = isLow(c) ? p0.add(0.5) : rot2(p0, c.I.twist.add(c.I.tilt.x.mul(0.25)).add(c.I.lag.x.mul(0.35))).add(0.5).add(c.I.tilt.mul(0.03));
      const ring = texture(c.tex.lines, w).r;
      if (isLow(c)) return { color: c.L.color.add(vec3(ring.mul(c.fond).mul(0.12))) };
      const tl = strength(c.I.tilt);
      const lit = emboss(c.tex.lines, w, lightDir(c), tl.mul(1.4).add(0.9), 'r', tl.mul(0.004).add(0.0025));
      const enamel = iris(c.L.color, c.tint, c.fond.mul(0.35), 0.02);
      const gloss = softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.14, 0.2]).mul(0.09);
      const g = printGuard(c.L.color);
      return { color: enamel.mul(lit.mul(c.fond).mul(0.45).add(1)).add(vec3(gloss.add(ring.mul(0.06))).mul(c.fond).mul(g)) };
    },
  },
  {
    num: 18,
    tier: 'epic',
    name: 'Profondeur',
    idea: 'Le décor prend une vraie profondeur : il se creuse quand on bouge et ses reliefs sont éclairés par le côté où l’on penche.',
    inspi: 'les cartes « 3D » lenticulaires des années 90 ; à nous : relief déduit de l’illustration elle-même, éclairé par l’orientation',
    tech: 'parallaxe itérative sur une hauteur déduite du fond (mip flouté) : High 4 pas, Mid 2, Low 1 ; ombrage = gradient de hauteur · inclinaison',
    cost: '2–5 T · ~20 ALU',
    reduced: '1 pas',
    readable: 'aucune couleur ajoutée, seulement du relief et de l’ombre',
    gainless: true,
    layers(q, art, I) {
      const steps = q === 'high' ? 4 : q === 'mid' ? 2 : 1;
      const V = viewDirObject();
      const k = V.xy.div(max(V.z, 0.25)).mul(vec2(1 / CARD.w, 1 / CARD.h));
      return {
        depth: q === 'low' ? 1.6 : I.energy.mul(0.7).add(1.6),
        warpBg(u0) {
          let u = u0;
          for (let i = 0; i < steps; i++) {
            const h = luminance(texture(art.bg, u).level(float(3)).rgb);
            u = u0.sub(k.mul(h.mul(0.05)));
          }
          return u;
        },
      };
    },
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      const ld = Ldir(c, 0);
      const hA = luminance(texture(c.art.bg, c.L.bgUV).level(float(3)).rgb);
      const hB = luminance(texture(c.art.bg, c.L.bgUV.add(ld.mul(0.012))).level(float(3)).rgb);
      const shade = hB.sub(hA).mul(strength(c.I.tilt).mul(2.6)).mul(c.fond);
      return { color: c.L.color.mul(clamp(shade.add(1), 0.75, 1.3)) };
    },
  },
  {
    num: 19,
    tier: 'epic',
    name: 'Trait d’or',
    idea: 'Le TRAIT de l’illustration — ses contours encrés, ses lignes sombres — devient une feuille d’or qui s’allume quand la lumière passe dessus. Le dessin reste le dessin, il brille simplement là où il a été tracé.',
    inspi: 'les Enchanted de Lorcana, où le foil épouse le trait ; à nous : le trait est détecté dans l’image (différence au mip flouté), aucun masque à dessiner, et marche aussi sur les photos',
    tech: 'trait = luminance floutée (mip 2 du fond et du sujet) − luminance nette ; or = reflet de lampe en bande + éclat par la normale de la silhouette ; garde : seulement dans l’illustration, pas sur le texte',
    cost: '3 T · ~24 ALU',
    reduced: 'trait doré fixe',
    readable: 'seules les lignes déjà sombres changent de couleur, les aplats sont intacts',
    bloom: 0.25,
    build(c) {
      const bgB = texture(c.art.bg, c.L.bgUV).level(float(2)).rgb;
      const sjB = texture(c.art.subject, c.L.sjUV).level(float(2));
      // (textures en alpha NON prémultiplié : la couleur du sujet se mélange telle quelle, sans division par l'alpha)
      const blur = c.photo ? bgB : mix(bgB, sjB.rgb, sjB.a);
      // net et flou comparés SANS l'ombre portée du gabarit (sinon toute la zone ombrée passerait pour un trait)
      const sharp = c.photo ? c.L.bg.rgb : mix(c.L.bg.rgb, c.L.subject.rgb, c.L.subject.a);
      // (en luminance perceptuelle : les traits sont des valeurs sombres, invisibles en linéaire)
      const line = smoothstep(float(0.03), float(0.12), luminance(blur).sqrt().sub(luminance(sharp).sqrt())).mul(c.ink.oneMinus()).mul(c.inner).mul(c.veil.mul(0.7).oneMinus());
      const gold = mix(vec3(1, 0.8, 0.42), c.tint, 0.2);
      if (isLow(c)) return { color: mix(c.L.color, gold.mul(0.7), line.mul(0.55)) };
      const o = c.I.tilt.add(c.I.lag.mul(0.6));
      const band = strip(c, [0.55, 0.85], float(0.5).add(o.y.mul(0.5)).add(o.x.mul(0.35)), c.I.energy.mul(0.08).add(0.1));
      const glint = band.mul(0.9).add(0.35).mul(alive(c, 0.55));
      const col = mix(c.L.color, gold.mul(glint.mul(0.9).add(0.55)), line.mul(0.9));
      return { color: col, emissive: gold.mul(line.mul(band)).mul(0.35) };
    },
  },
  {
    num: 20,
    tier: 'epic',
    name: 'Givre',
    idea: 'Les coins de l’illustration se couvrent de givre : BOUGER la carte l’efface comme un coup de chiffon, il se reforme quand on la laisse immobile, et ses cristaux scintillent. Le givre contourne le personnage.',
    inspi: 'les éditions « frozen » des cartes d’hiver ; à nous : le givre réagit au mouvement et respecte la silhouette',
    tech: 'coins de la zone intérieure du design ; mip flouté du fond + bruit de givre ; essuyage = intégrale de la vitesse ; cristaux = paillettes à facettes ; masque du sujet',
    cost: '3 T · ~22 ALU',
    reduced: 'givre statique',
    readable: 'coins seulement ; le sujet est épargné',
    build(c) {
      const w = innerUV(c.geo, c.uv);
      const cd = min(min(length(w), length(w.sub(vec2(1, 0)))), min(length(w.sub(vec2(0, 1))), length(w.sub(vec2(1, 1)))));
      const n = noise(c, c.uv.mul(4));
      const clear = isLow(c) ? float(0) : smoothstep(float(0), float(1), c.I.wipe).mul(0.85);
      const side = isLow(c) ? float(0) : dot(w.sub(0.5), Ldir(c, 0)).mul(strength(c.I.tilt)).mul(0.25);
      const frost = smoothstep(float(0.42), float(0.08), cd.add(n.r.sub(0.5).mul(0.22)).add(side).add(clear.mul(0.35))).mul(clear.oneMinus());
      const blur = texture(c.art.bg, c.L.bgUV).level(float(4)).rgb;
      const cold = mix(sat(blur, 0.6), vec3(0.85, 0.92, 1), 0.22);
      const crystal = noise(c, c.uv.mul(14)).b;
      const fr = mix(cold, vec3(1), crystal.pow(3).mul(0.5));
      const zone = frost.mul(c.inner).mul(c.subj.mul(0.9).oneMinus()).mul(c.ink.oneMinus());
      const glint = isLow(c) ? float(0) : sparkle(c, 110, 0.22, 0.3, 7).mul(zone);
      return { color: mix(c.L.color, fr, zone.mul(0.6)).add(vec3(glint.mul(0.7))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 5★ LÉGENDAIRE — matière précieuse et lumière (bloom)
const LEGENDARY: FxDef[] = [
  {
    num: 21,
    tier: 'legendary',
    name: 'Or liquide',
    idea: 'La marge, le liseré et la plaque du nom deviennent de l’or fondu : il coule lentement, et quand on tourne la carte il « clapote », déborde dans l’autre sens puis se repose. L’illustration reste à nu au centre.',
    inspi: 'les Hyper Rare dorées de Pokémon ; à nous : l’or ne recouvre QUE le décor de la carte, et c’est un liquide (inertie)',
    tech: 'matcap or précalculé ; normale = flux (bruit qui dérive) + orientation + inertie ; zone = marge + liseré + plaque (+ texte doré) ; l’éclat chauffe avec l’énergie',
    cost: '2 T · ~16 ALU',
    reduced: 'or statique',
    readable: 'l’illustration intérieure et le sujet ne sont pas dorés',
    bloom: 0.55,
    build(c) {
      const flow = isLow(c) ? vec2(0, 0) : time.mul(vec2(0.012, 0.018));
      const lg = isLow(c) ? vec2(0, 0) : c.I.lag;
      const n = noise(c, c.uv.mul(0.9).add(flow).add(lg.mul(0.12))).rg.sub(0.5).mul(c.I.energy.mul(0.35).add(0.45)).add(c.I.tilt.mul(0.6)).add(lg.mul(0.9));
      const mc = texture(c.tex.gold, n.mul(0.5).add(0.5)).rgb;
      const zone = clamp(c.margin.add(c.liner).add(c.veil.mul(0.7)).add(c.ink.mul(0.5)), 0, 1);
      const base = mix(c.L.color, vec3(0.32, 0.22, 0.1), c.margin.mul(0.5));
      const gold = base.mul(vec3(1, 0.8, 0.42).mul(0.8).add(mc.mul(0.55))).add(mc.mul(0.12));
      const hot = smoothstep(0.75, 1.15, luminance(mc));
      return { color: mix(c.L.color, gold, zone), emissive: mc.mul(hot).mul(zone).mul(c.I.energy.mul(0.5).add(0.5)) };
    },
  },
  {
    num: 22,
    tier: 'legendary',
    name: 'Dalle de verre',
    idea: 'L’illustration est sous une dalle de verre épais posée DANS le liseré : ses bords réfractent le décor, une arête de lumière court sur le biseau du côté de la lampe et un reflet glisse sur la dalle.',
    inspi: 'les « liquid glass » d’Apple et les slabs de cartes gradées ; à nous : le biseau suit exactement le liseré du design',
    tech: 'normale du biseau = gradient analytique du SDF du liseré ; réfraction = décalage de l’UV du fond près du bord ; High : dispersion sur le biseau seul ; arête = (n · lumière)^p',
    cost: 'Mid 1 T · High 3 T · ~30 ALU',
    reduced: 'arête seule, sans réfraction',
    readable: 'bords de la zone intérieure seulement ; centre et sujet intacts',
    bloom: 0.35,
    layers(q, _art, I, _photo, geo) {
      if (q === 'low') return {};
      return {
        warpBg(u0) {
          const e = 0.002;
          const sd = innerSDF(geo, u0);
          const n = vec2(innerSDF(geo, u0.add(vec2(e, 0))).sub(sd), innerSDF(geo, u0.add(vec2(0, e))).sub(sd)).div(e);
          const bevel = smoothstep(float(-0.04), float(-0.002), sd);
          return u0.add(n.mul(bevel.mul(bevel)).mul(-0.022)).add(I.tilt.mul(0.004));
        },
      };
    },
    build(c) {
      const sd = c.innerD;
      const e = 0.002;
      const n = dirOf(vec2(innerSDF(c.geo, c.uv.add(vec2(e, 0))).sub(sd), innerSDF(c.geo, c.uv.add(vec2(0, e))).sub(sd)));
      const bevel = smoothstep(float(-0.04), float(-0.004), sd).mul(smoothstep(float(0.004), float(-0.004), sd));
      const facing = dot(n, Ldir(c).negate());
      const edge = max(facing, 0).pow(3).add(max(facing.negate(), 0).pow(3).mul(0.25)).mul(bevel.pow(3)).mul(strength(c.I.tilt, 0.8).mul(0.75).add(0.25));
      const sheen = isLow(c) ? float(0) : softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.16, 0.22], 0.06, 0.16).mul(0.05).mul(c.inner).mul(printGuard(c.L.color));
      let col: N = c.L.color.add(vec3(edge.mul(0.9))).add(vec3(sheen));
      if (c.q === 'high') {
        const o = n.mul(bevel.mul(0.006));
        const rB = texture(c.art.bg, c.L.bgUV.add(o)).r, bB = texture(c.art.bg, c.L.bgUV.sub(o)).b;
        col = col.add(vec3(rB.sub(c.L.bg.r), 0, bB.sub(c.L.bg.b)).mul(bevel.mul(c.fond).mul(0.7)));
      }
      // la marge, hors de la dalle, est un peu plus sombre (la dalle est en relief)
      col = col.mul(float(1).sub(c.margin.mul(0.12)));
      return { color: col, emissive: vec3(edge.mul(0.35)) };
    },
  },
  {
    num: 23,
    tier: 'legendary',
    name: 'Labradorite',
    idea: 'La pierre qui « flashe » : la plaque du nom, la marge et le décor ont de larges plages qui s’embrasent d’un bleu profond ou d’un or, chacune à son angle, puis s’éteignent.',
    inspi: 'les Galaxy foil de Magic, sans leur arc-en-ciel ; à nous : deux couleurs minérales, une facette par plage',
    tech: 'cellules PRÉCALCULÉES basse fréquence ; facette par plage (hash) → éclat ; couleur par plage (bleu / or) ; parallaxe de sous-surface ; garde d’impression',
    cost: '1 T · ~22 ALU',
    reduced: 'plages figées',
    readable: 'plaque + marge + fond ; le sujet n’est pas recouvert',
    bloom: 0.5,
    build(c) {
      const o = isLow(c) ? c.I.tilt : c.I.tilt.add(c.I.lag.mul(0.8));
      const cell = texture(c.tex.cells, c.uv.mul(vec2(0.8 * CARD.w / 0.63, 0.8 * CARD.h / 0.63)).sub(o.mul(0.02)));
      const id = cell.r;
      const nrm = vec2(hash(id.mul(31.7)), hash(id.mul(53.9).add(7))).mul(2).sub(1);
      const flash = smoothstep(float(0.78), float(1), dot(dirOf(o.add(vec2(0.0001, 0))), dirOf(nrm))).mul(strength(o, 0.6));
      const hue = mix(vec3(0.12, 0.32, 1), vec3(1, 0.72, 0.28), step(0.62, hash(id.mul(17.3).add(2))));
      const edgeF = smoothstep(float(0.02), float(0.4), cell.g);
      const zone = c.veil.mul(0.9).add(c.margin.mul(0.7)).add(c.fond.mul(0.5)).mul(c.ink.oneMinus());
      const k = flash.mul(edgeF).mul(zone).mul(printGuard(c.L.color).mul(0.7).add(0.3));
      return { color: screen(c.L.color, hue.mul(k.mul(0.55))).add(hue.mul(k.mul(0.12))), emissive: hue.mul(k).mul(0.35) };
    },
  },
  {
    num: 24,
    tier: 'legendary',
    name: 'Auréole',
    idea: 'Une lumière se lève DERRIÈRE le personnage : un halo épouse sa silhouette et déborde à l’opposé de l’inclinaison, comme un soleil caché derrière lui ; le bord de la silhouette s’embrase.',
    inspi: 'les fonds en contre-jour des cartes « Full Art » ; à nous : le halo est la silhouette du sujet elle-même (mip flouté), éclairée par l’orientation',
    tech: 'halo = alpha du sujet en mip 4 décalé à l’opposé de la lumière (+ inertie), hors du sujet ; liseré = contour × (n · −lumière) ; émissif → bloom ; photo : halo des zones claires',
    cost: '4 T · ~24 ALU',
    reduced: 'halo fixe centré',
    readable: 'lumière autour du sujet, jamais sur son intérieur',
    bloom: 0.8,
    build(c) {
      const L = isLow(c) ? vec2(0, 1) : Ldir(c);
      const off = L.mul(-0.018);
      const warm = mix(vec3(1, 0.86, 0.6), c.accent, 0.35);
      let halo: N, rim: N;
      if (c.photo) {
        const b = texture(c.art.bg, c.L.bgUV.add(off)).level(float(5)).rgb;
        halo = smoothstep(float(0.5), float(0.9), luminance(b)).mul(c.fond);
        rim = float(0);
      } else {
        const a4 = texture(c.art.subject, c.L.sjUV.add(off)).level(float(4)).a;
        halo = a4.mul(c.L.subject.a.oneMinus()).mul(c.ink.oneMinus());
        const k = contour(c, 2, 0.006);
        rim = k.band.mul(k.inside).mul(max(dot(k.n, L.negate()), 0)).mul(strength(c.I.tilt).mul(0.6).add(0.4));
      }
      const pulse = isLow(c) ? float(1) : sin(time.mul(1.3)).mul(0.12).add(0.88).add(c.I.energy.mul(0.3));
      const add = warm.mul(halo.mul(0.4).add(rim.mul(0.55)).mul(pulse));
      return { color: c.L.color.add(add), emissive: add.mul(0.9) };
    },
  },
  {
    num: 25,
    tier: 'legendary',
    name: 'Eau de lumière',
    idea: 'Une lumière d’eau ondule sur le décor — et le personnage, lui, y fait de l’OMBRE : la lumière s’arrête derrière lui. Pencher la carte, c’est pencher un verre : la lumière glisse et clapote.',
    inspi: 'les cartes de type Eau des Illustration Rare ; à nous : les caustiques sont bloquées par la silhouette du sujet',
    tech: 'texture de caustiques périodique, 2 lectures en sens opposés, min() ; décalage = orientation + inertie ; ombre du sujet (mip flouté décalé) qui masque la lumière',
    cost: '3 T · ~14 ALU',
    reduced: 'une lecture, sans ombre',
    readable: 'décor seulement, multiplicatif',
    bloom: 0.5,
    build(c) {
      const sl = isLow(c) ? vec2(0, 0) : c.I.tilt.mul(0.08).add(c.I.lag.mul(0.2));
      const c1 = texture(c.tex.caustics, c.uv.mul(2.2).add(time.mul(vec2(0.02, 0.013))).add(sl)).r;
      const cv = isLow(c) ? c1.mul(0.6) : min(c1, texture(c.tex.caustics, c.uv.mul(2.7).sub(time.mul(vec2(0.017, 0.011))).sub(sl.mul(0.6))).r).mul(c.I.energy.mul(0.6).add(2));
      const sh = isLow(c) || c.photo ? float(0) : texture(c.art.subject, c.L.sjUV.add(c.I.light.sub(0.5).mul(-0.05))).level(float(3)).a;
      const k = cv.mul(c.fond).mul(float(1).sub(sh.mul(0.85)));
      return { color: c.L.color.mul(k.mul(0.6).add(1)).add(vec3(0.6, 0.85, 1).mul(k.mul(0.08))), emissive: c.L.color.mul(k).mul(0.25) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 6★ MYTHIQUE — toute la carte, sujet bridé
const MYTHIC: FxDef[] = [
  {
    num: 26,
    tier: 'mythic',
    name: 'Dichroïque',
    idea: 'Un verre dichroïque : de face la carte est d’une couleur, en la tournant elle bascule vers sa complémentaire — toute la carte, le personnage ne reçoit qu’un voile.',
    inspi: 'les Starlight Rare de Yu-Gi-Oh, sans leurs stries ; à nous : deux couleurs pures, luminance conservée, sujet bridé',
    tech: 'k = projection de l’orientation (+ inertie) : teinte de la rareté ↔ complémentaire ; teinte multiplicative ; voile ≤ 25 % sur le sujet ; liseré émissif',
    cost: '0 T · ~22 ALU',
    reduced: 'bascule selon l’inclinaison seule',
    readable: 'plafond sur le sujet ; luminance conservée partout',
    bloom: 0.45,
    build(c) {
      const A = c.tint, B = hueRotate(c.tint, float(Math.PI));
      const o = isLow(c) ? c.I.tilt : c.I.tilt.add(c.I.lag.mul(0.6));
      const k = smoothstep(float(-0.8), float(0.8), dot(o, vec2(0.75, 0.65)));
      const col2 = mix(A, B, k);
      const zone = c.frame.mul(0.7).add(c.fond.mul(0.55)).add(c.subj.mul(0.22));
      const out = iris(c.L.color, col2, zone, 0.08);
      const rim = c.liner.add(c.edge).mul(strength(o).mul(0.6).add(0.3));
      return { color: out.add(col2.mul(rim.mul(0.5))), emissive: col2.mul(rim).mul(0.5) };
    },
  },
  {
    num: 27,
    tier: 'mythic',
    name: 'Daguerréotype',
    idea: 'Comme une plaque daguerréotype : penchée, l’illustration devient un miroir d’argent où le décor passe en négatif, en entrant par le bord qui descend ; le personnage et le nom restent en couleurs.',
    inspi: 'les Ghost Rare de Yu-Gi-Oh (l’image pâle, argentée) ; à nous : c’est un événement d’angle avec un front qui avance',
    tech: 'front = projection sur la direction d’inclinaison comparée à sa force (+ inertie) ; négatif argenté = (1 − luminance) ; reflet de fenêtre sur la plaque ; lèvre brillante sur le front',
    cost: '0 T · ~22 ALU',
    reduced: 'bascule à un seuil fixe',
    readable: 'le sujet et le texte ne sont jamais inversés',
    bloom: 0.5,
    gainless: true,
    build(c) {
      const m = length(c.I.tilt);
      const silver = vec3(0.86, 0.88, 0.92);
      const neg0 = silver.mul(float(1).sub(luminance(c.L.color)).mul(0.5).add(0.06)).add(c.L.color.mul(0.12));
      if (isLow(c)) return { color: mix(c.L.color, neg0, step(0.65, m).mul(c.fond)) };
      const neg = neg0.add(silver.mul(softbox(c, c.I.light.add(c.I.lag.mul(0.5)), [0.14, 0.2]).mul(0.35)));
      const o = c.I.tilt.add(c.I.lag.mul(0.5));
      const proj = dot(c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h)), dirOf(o.add(vec2(0.0001, 0)))).div(CARD.h * 0.5).mul(0.5).add(0.5);
      const front = float(1.15).sub(smoothstep(0.45, 1.05, length(o)).mul(1.4));
      const s = smoothstep(front.sub(0.06), front.add(0.06), proj);
      const lip = smoothstep(float(0.07), float(0), abs(proj.sub(front))).mul(step(float(0.45), m)).mul(c.inner);
      const col = mix(c.L.color, neg, s.mul(c.fond)).add(silver.mul(lip.mul(c.ink.oneMinus()).mul(0.4)));
      const se = s.max(lip);
      return { color: col.add(silver.mul(c.liner.mul(se).mul(0.5))), emissive: silver.mul(c.liner.mul(se).add(lip.mul(0.3))).mul(0.5) };
    },
  },
  {
    num: 28,
    tier: 'mythic',
    name: 'Hors cadre',
    idea: 'Le personnage est une vraie feuille posée DEVANT la carte : quand on tourne, il passe par-dessus le liseré et la plaque du nom, traîne en gelée et projette son ombre sur la carte.',
    inspi: 'le « frame break » des variantes Marvel Snap ; à nous : un vrai plan en relief qui se lève avec l’énergie, et son ombre tombe sur le décor du design',
    tech: 'sujet détouré sur un plan séparé au-dessus de la carte, levée ∝ énergie, décalage ∝ inertie ; la carte ne compose plus le sujet mais reçoit son ombre (mip flouté décalé)',
    cost: '1 plan de plus · 1 T',
    reduced: 'plan à 2 mm, sans levée',
    readable: 'le sujet est l’illustration intacte, simplement devant',
    bloom: 0.3,
    gainless: true,
    layers: () => ({ noSubject: true }),
    build(c) {
      const ld = c.I.light.sub(0.5).mul(vec2(1, 0.8)).add(isLow(c) ? vec2(0, 0) : c.I.lag.mul(0.6));
      const off = ld.mul(-0.06).add(vec2(0.008, -0.014));
      const lift = isLow(c) ? float(0.3) : c.I.energy.mul(0.7).add(0.3);
      const sh = texture(c.art.subject, c.uv.add(off.mul(lift.mul(1.4).add(0.4)))).level(lift.mul(2).add(2.5)).a;
      return { color: c.L.color.mul(float(1).sub(sh.mul(0.42))), emissive: c.accent.mul(c.liner).mul(0.2) };
    },
    attach(env, card) {
      const geo = env.bag.add(new PlaneGeometry(CARD.w, CARD.h));
      const m = env.bag.add(new MeshBasicNodeMaterial());
      m.transparent = true;
      m.depthWrite = false;
      const s = texture(env.art.subject, uv().add(env.I.lag.mul(vec2(-0.012, 0.012))));
      m.colorNode = vec4(s.rgb, s.a);
      const mesh = new Mesh(geo, m);
      mesh.position.z = 0.012;
      const I = env.I;
      mesh.userData.update = () => {
        const e = I.energy.value as number;
        mesh.position.z = env.q === 'low' ? 0.012 : 0.012 + e * 0.07;
        const sc = env.q === 'low' ? 1 : 1 + e * 0.05;
        mesh.scale.set(sc, sc, 1);
      };
      card.add(mesh);
    },
  },
  {
    num: 29,
    tier: 'mythic',
    name: 'Cristal',
    idea: 'La carte est une dalle d’acrylique transparente : on voit CE QU’IL Y A DERRIÈRE, réfracté ; seuls le personnage et le texte sont imprimés opaques, la plaque du nom est dépolie, et le personnage projette son ombre sur le monde derrière.',
    inspi: 'les cartes acryliques de collection japonaises ; à nous : la transparence est réelle (copie partielle de l’écran), pas une texture',
    tech: 'copie PARTIELLE du framebuffer (rectangle de la carte + marge) échantillonnée à screenUV + décalage ; biseau du bord de carte ; impression = sujet + encre ; dépoli = voiles et marge',
    cost: '1 copie partielle + 2 T · ~40 ALU',
    reduced: 'dalle sans réfraction',
    readable: 'le sujet et le texte sont opaques et intacts',
    bloom: 0.35,
    transparentFront: true,
    gainless: true,
    build(c) {
      const sdCard = (u: N) => {
        const p = u.sub(0.5).mul(vec2(CARD.w, CARD.h));
        const q = abs(p).sub(vec2(CARD.w / 2 - CARD.r, CARD.h / 2 - CARD.r));
        return length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(CARD.r);
      };
      const e = 0.002;
      const sd = sdCard(c.uv);
      const n = dirOf(vec2(sdCard(c.uv.add(vec2(e, 0))).sub(sd), sdCard(c.uv.add(vec2(0, e))).sub(sd)));
      const bevel = smoothstep(float(-0.03), float(-0.002), sd);
      const o = isLow(c) ? c.I.tilt : c.I.tilt.add(c.I.lag.mul(0.5));
      const shift = o.mul(vec2(0.012, -0.012)).add(n.mul(bevel.mul(bevel)).mul(vec2(-0.02, 0.02)));
      const back = c.extra.backdrop as ((off: N) => N) | undefined;
      const seen: N = back ? back(shift).rgb : vec3(0.08, 0.07, 0.07);
      const printed = clamp(c.subj.add(c.ink), 0, 1);
      const ld = c.I.light.sub(0.5).mul(vec2(1, 0.8));
      const sh = isLow(c) ? float(0) : texture(c.art.subject, c.uv.add(ld.mul(-0.06)).add(vec2(0.01, -0.016))).level(float(3)).a;
      const facing = dot(n, dirOf(o.add(vec2(0.0001, 0.0002))).negate());
      const rim = max(facing, 0).pow(3).add(max(facing.negate(), 0).pow(3).mul(0.3)).mul(bevel.pow(2)).mul(strength(c.I.tilt, 0.8).mul(0.7).add(0.3));
      const fres = float(1).sub(clamp(c.ndv, 0, 1)).pow(3).mul(0.2);
      const sheen = isLow(c) ? float(0) : softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.17, 0.24], 0.06, 0.16).mul(0.07);
      const plastic = seen.mul(mix(vec3(1), c.tint, 0.12)).mul(float(1).sub(sh.mul(0.4))).add(c.L.bg.rgb.mul(c.fond).mul(0.15)).add(vec3(fres.add(sheen).add(rim.mul(0.8))));
      const frosted = max(printed, c.veil.mul(0.55).add(c.margin.mul(0.3)));
      return { color: mix(plastic, c.L.color, frosted), emissive: vec3(rim.mul(0.4)).add(c.accent.mul(c.liner).mul(0.15)) };
    },
  },
  {
    num: 30,
    tier: 'mythic',
    name: 'Étincelles de silhouette',
    idea: 'Des étincelles naissent sur le CONTOUR du personnage et s’en échappent vers le haut ; plus on tourne vite, plus il en jaillit, et elles traînent derrière le mouvement. Le liseré s’allume au même rythme.',
    inspi: 'les « flares » Stardust de Marvel Snap ; à nous : les particules sortent de la silhouette réelle du sujet (lue dans le shader de sommets)',
    tech: 'sprites instanciés SANS ÉTAT ; point de naissance aléatoire, opacité = bande du contour du sujet lue au sommet (mip 3) — seules celles nées sur la silhouette sont visibles ; traînée = inertie ; budget adaptatif',
    cost: '1 passe de sprites (High 260, Mid 110, Low 40) · 1 T au sommet',
    reduced: '40 étincelles',
    readable: 'les étincelles sont clairsemées et quittent l’illustration',
    bloom: 0.9,
    build(c) {
      const warm = mix(vec3(1, 0.85, 0.55), c.accent, 0.4);
      const k = c.I.energy.mul(0.6).add(0.4);
      return { color: c.L.color.add(warm.mul(c.liner).mul(k.mul(0.4))), emissive: warm.mul(c.liner).mul(k).mul(0.4) };
    },
    attach(env, card) {
      const n = env.q === 'high' ? 260 : env.q === 'mid' ? 110 : 40;
      card.add(sparkSprites(env, n, 'silhouette'));
    },
  },
];

// ═══════════════════════════════════════════════════════════ SECRÈTE — la carte devient un lieu (photos des amis)
const SECRET: FxDef[] = [
  {
    num: 31,
    tier: 'secret',
    name: 'Carte vivante',
    idea: 'Au repos la carte respire ; quand on la tourne, le personnage « en gelée » traîne derrière et le décor se creuse ; un appui long la plonge en plein écran (diorama). Le double filet respire avec elle.',
    inspi: 'les cartes « immersives » de TCG Pocket ; à nous : la respiration et l’inertie viennent du langage de rotation',
    tech: 'parallaxe animée (respiration + énergie), sujet décalé par l’inertie ; immersif : profondeur ×4, caméra et poussière (GSAP) ; liseré respirant',
    cost: 'vue unique',
    reduced: 'respiration seule',
    readable: 'au repos, la carte est l’illustration d’origine',
    bloom: 0.6,
    layers: (q, _art, I) =>
      q === 'low'
        ? { depth: float(1).add(sin(time.mul(0.8)).mul(0.25)).add(I.immersive) }
        : { depth: float(1).add(sin(time.mul(0.8)).mul(0.25)).add(I.energy.mul(0.9)).add(I.immersive.mul(3)), subjectShift: I.lag.mul(vec2(-0.022, 0.022)) },
    build(c) {
      const breath = sin(time.mul(0.8)).mul(0.5).add(0.5);
      const k = breath.mul(0.4).add(0.3).add(c.I.energy.mul(0.4));
      const z = c.liner.add(c.edge.mul(0.5));
      return { color: c.L.color.add(c.accent.mul(z).mul(k.mul(0.5))), emissive: c.accent.mul(z).mul(k).mul(0.45) };
    },
    attach(env, card) {
      card.add(sparkSprites(env, env.q === 'high' ? 90 : env.q === 'mid' ? 40 : 14, 'dust'));
    },
  },
  {
    num: 32,
    tier: 'secret',
    name: 'Cosmos infini',
    idea: 'Les OMBRES de la photo s’ouvrent sur un champ d’étoiles sans fin, en vraie profondeur ; le visage et les zones claires restent intacts. Tourner vite passe en « vitesse lumière ».',
    inspi: 'les fonds « galaxy » des cartes secrètes ; à nous : l’espace s’ouvre dans les ombres de la vraie photo',
    tech: '3 couches d’étoiles précalculées à 3 profondeurs ; High : traînées le long de la vitesse angulaire ; nébuleuse qui dérive avec le chemin de rotation ; clé de luminance sur photo',
    cost: 'High 5 T · Mid 4 T · Low 2 T',
    reduced: 'une couche d’étoiles',
    readable: 'les zones claires (visages) restent intactes',
    bloom: 0.85,
    layers(q, _art, I, photo) {
      return {
        bgColor(rgb, uvBg) {
          const streak = I.vel.div(max(length(I.vel), 0.001)).mul(I.energy.pow(1.5)).mul(-0.045);
          const layer = (d: number, s: number) => {
            const u = uvAt(d).mul(s);
            let st: N = texture(TEXREF.stars!, u);
            if (q === 'high') {
              const o = streak.mul(d * s);
              st = max(max(st, texture(TEXREF.stars!, u.add(o.mul(0.5))).mul(0.8)), texture(TEXREF.stars!, u.add(o)).mul(0.55));
            }
            return st.r.mul(sin(time.mul(2.2).add(st.b.mul(30))).mul(0.35).add(0.65));
          };
          const nn = texture(TEXREF.noise!, uvBg.mul(0.8).add(q === 'low' ? vec2(0, 0) : time.mul(vec2(0.004, 0.002)).add(I.phase.mul(vec2(0.012, 0.006)))));
          const filmC = texture(TEXREF.film!, vec2(nn.r.mul(0.6).add(0.2), 0.8)).rgb;
          const neb = mix(vec3(0.16, 0.1, 0.38), filmC.mul(0.5), 0.35).mul(smoothstep(0.4, 0.9, nn.g)).mul(0.6);
          let stars: N = layer(0.6, 1.6);
          if (q !== 'low') stars = stars.add(layer(0.3, 1.1).mul(0.8)).add(layer(0.15, 0.7).mul(0.6));
          const cosmos = vec3(0.02, 0.025, 0.07).add(neb).add(vec3(stars));
          const k = photo ? smoothstep(float(0.12), float(0.015), luminance(rgb)).mul(0.8) : float(0.88);
          return mix(rgb, cosmos, k);
        },
      };
    },
    build(c) {
      const bright = smoothstep(0.7, 1.2, luminance(c.L.color)).mul(c.fond);
      const neb = vec3(0.45, 0.35, 1);
      return { color: c.L.color.add(neb.mul(c.liner).mul(0.35)), emissive: c.L.color.mul(bright).mul(0.8).add(neb.mul(c.liner).mul(0.35)) };
    },
  },
  {
    num: 33,
    tier: 'secret',
    name: 'Lumière propre',
    idea: 'La photo éclaire sa propre carte : ses couleurs débordent dans la marge et les filets (« ambilight »), surtout du côté où l’on penche, et ses zones claires rayonnent doucement.',
    inspi: 'les télévisions Ambilight et les éclairages de vitrine ; à nous : la marge prend la lumière de la photo qu’elle borde',
    tech: 'mip très flou de la photo lu au point le plus proche de la zone intérieure ; débordement sur marge + filets + voiles, pondéré par le côté penché ; High : rayons vers le point focal',
    cost: 'Mid 2 T · High 10 T',
    reduced: 'débordement fixe',
    readable: 'lumière autour de la photo, jamais sur le visage',
    bloom: 0.9,
    build(c) {
      const G = c.geo.inner;
      const near = clamp(c.uv, vec2(G.cx - G.hx + 0.02, G.cy - G.hy + 0.02), vec2(G.cx + G.hx - 0.02, G.cy + G.hy - 0.02));
      const src = c.photo ? c.art.bg : c.art.bg;
      const amb = texture(src, near).level(float(c.q === 'low' ? 5 : 6)).rgb;
      const sideW = isLow(c) ? float(1) : clamp(dot(dirOf(c.uv.sub(0.5)), Ldir(c)).mul(strength(c.I.tilt)).mul(0.7).add(0.65), 0.3, 1.4);
      const zone = clamp(c.margin.add(c.liner).add(c.veil.mul(0.35)), 0, 1).mul(c.ink.mul(0.7).oneMinus());
      const pulse = isLow(c) ? float(1) : sin(time.mul(1.5)).mul(0.15).add(0.85);
      const lit = sat(amb, 1.5).mul(zone.mul(sideW).mul(0.55).mul(pulse));
      let rays: N = float(0);
      if (c.q === 'high' && !c.photo) {
        const C = c.focus.sub(c.I.tilt.mul(0.09)).sub(c.I.lag.mul(0.06));
        for (let i = 1; i <= 8; i++) rays = rays.add(texture(c.art.subject, mix(c.L.sjUV, C, (i / 8) * 0.38)).level(float(2)).a);
        rays = rays.div(8).mul(c.fond).mul(0.3);
      }
      const bloomIn = texture(c.art.bg, c.L.bgUV).level(float(4)).rgb;
      const glowIn = bloomIn.mul(smoothstep(0.55, 0.9, luminance(bloomIn))).mul(c.inner).mul(0.14).mul(pulse);
      const add = lit.add(glowIn).add(sat(amb, 1.3).mul(rays));
      return { color: c.L.color.add(add), emissive: add.mul(0.75) };
    },
  },
  {
    num: 34,
    tier: 'secret',
    name: 'Pièce secrète',
    idea: 'Le liseré est l’embrasure d’une vraie pièce (une alcôve de musée) : la photo y est accrochée au mur du fond sous un projecteur, et en tournant la carte on voit les murs, le parquet, le plafond. La marge et le nom restent devant, comme le chambranle.',
    inspi: 'les cartes « immersives » et les dioramas ; à nous : interior mapping en une seule texture, la pièce s’ouvre exactement dans le liseré du design',
    tech: '« interior mapping » : rayon de vue → intersection analytique avec 5 parois d’une boîte posée derrière la zone intérieure ; une texture atlas 2×2 ; l’illustration est le tableau du fond',
    cost: '2 T · ~45 ALU',
    reduced: 'pièce peu profonde',
    readable: 'l’illustration est le tableau accroché au fond, intacte',
    bloom: 0.45,
    gainless: true,
    layers(q, art, _I, photo, geo) {
      const G = geo.inner;
      const x0 = G.cx - G.hx, x1 = G.cx + G.hx, y0 = G.cy - G.hy, y1 = G.cy + G.hy;
      return {
        bgColor(rgb) {
          const D = q === 'low' ? 0.11 : 0.2;
          const V = viewDirObject();
          const k = V.xy.div(max(V.z, 0.22)).mul(vec2(1 / CARD.w, 1 / CARD.h));
          const u0 = uv();
          const safe = (v: N) => select(v.greaterThanEqual(0), max(v, 0.0001), min(v, -0.0001));
          const kx = safe(k.x), ky = safe(k.y);
          const zx = select(kx.greaterThan(0), u0.x.sub(x0).div(kx), u0.x.sub(x1).div(kx));
          const zy = select(ky.greaterThan(0), u0.y.sub(y0).div(ky), u0.y.sub(y1).div(ky));
          const z = clamp(min(min(zx, zy), float(D)), 0, D);
          const p = u0.sub(k.mul(z));
          const lx = p.x.sub(x0).div(2 * G.hx), ly = p.y.sub(y0).div(2 * G.hy), lz = z.div(D);
          const isBack = z.greaterThanEqual(D - 0.0005);
          const isX = zx.lessThan(zy).and(isBack.not());
          const tileX = select(isBack, float(0), select(isX, float(1), select(ky.greaterThan(0), float(0), float(1))));
          const tileY = select(isBack, float(0), select(isX, float(0), float(1)));
          const local = select(isBack, vec2(lx, ly), select(isX, vec2(lz, ly), vec2(lx, lz)));
          const wall = texture(TEXREF.room!, vec2(tileX, tileY).mul(0.5).add(clamp(local, 0.004, 0.996).mul(0.5))).rgb;
          let col: N = wall.mul(select(isBack, float(1), mix(float(1.15), float(0.5), lz)));
          const inset = photo ? 0.08 : 0.12;
          const px = lx.sub(inset).div(1 - 2 * inset), py = ly.sub(inset).div(1 - 2 * inset);
          const inPic = step(0, px).mul(step(px, 1)).mul(step(0, py)).mul(step(py, 1));
          const pic = texture(art.bg, vec2(x0, y0).add(vec2(px.mul(2 * G.hx), py.mul(2 * G.hy))));
          const spot = smoothstep(float(0.9), float(0.2), length(vec2(px.sub(0.5), py.sub(0.55)).mul(vec2(1, 1.2)))).mul(0.5).add(0.6);
          const bd = min(min(px, float(1).sub(px)), min(py, float(1).sub(py)));
          const rimPic = step(float(-0.035), bd).mul(step(bd, float(0))).mul(step(0, px.add(0.035))).mul(step(px.sub(1.035), 0)).mul(step(0, py.add(0.035))).mul(step(py.sub(1.035), 0));
          const frameGold = vec3(0.85, 0.66, 0.3).mul(smoothstep(float(-0.02), float(0.01), bd.negate()).mul(0.5).add(0.5));
          col = select(isBack, mix(mix(col, frameGold, rimPic), pic.rgb.mul(spot), inPic), col);
          // hors de l'embrasure (marge) : le mur de face, l'illustration d'origine assombrie
          const inside = step(x0, u0.x).mul(step(u0.x, x1)).mul(step(y0, u0.y)).mul(step(u0.y, y1));
          return mix(rgb.mul(0.4), col, inside);
        },
      };
    },
    build(c) {
      const spill = smoothstep(float(0.03), float(0), abs(c.innerD)).mul(0.12);
      return { color: c.L.color.add(vec3(1, 0.85, 0.6).mul(spill)), emissive: vec3(1, 0.85, 0.6).mul(spill).mul(0.6) };
    },
    attach(env, card) {
      if (env.q !== 'low') card.add(sparkSprites(env, env.q === 'high' ? 40 : 18, 'dust'));
    },
  },
  {
    num: 35,
    tier: 'secret',
    name: 'Bioluminescence',
    idea: 'La carte est une eau de nuit pleine de plancton : chaque toucher, chaque coup de poignet, allume une traînée bleu-vert qui s’épanouit puis s’éteint lentement, et de minuscules lueurs scintillent dans les ombres de la photo quand on bouge.',
    inspi: 'les vagues phosphorescentes ; à nous : la lumière ne vit que dans les ombres de la photo et répond au toucher',
    tech: 'ondes ANALYTIQUES (4 derniers touchers) → lueur gaussienne qui s’élargit + réfraction du fond ; plancton = paillettes à facettes dans les zones sombres, densité ∝ énergie',
    cost: '2 T · ~48 ALU',
    reduced: 'une lueur, sans plancton',
    readable: 'lumière temporaire, surtout dans les ombres ; visage à 15 %',
    bloom: 0.8,
    layers(q, _art, I) {
      return { warpBg: (u0) => u0.add(rippleDir(I, q).mul(0.006)) };
    },
    build(c) {
      const glowC = mix(vec3(0.25, 0.95, 0.75), c.accent, 0.25);
      const list = isLow(c) ? [c.I.touches[0]] : c.I.touches;
      let glow: N = float(0);
      const ring = abs(ripple(c.I, c.q)).mul(0.6);
      for (const tp of list) {
        const d = c.uv.sub(tp.xy).mul(vec2(CARD.w, CARD.h));
        const age = time.sub(tp.z);
        const live = step(float(0), age).mul(exp(age.mul(-0.55))).mul(tp.w);
        const blob = exp(d.length().div(age.mul(0.09).add(0.03)).pow(2).negate());
        glow = glow.add(blob.mul(live)).add(ring.mul(live).mul(0.3));
      }
      const dark = smoothstep(float(0.45), float(0.08), luminance(c.L.color));
      const plank = isLow(c) ? float(0) : sparkle(c, 120, c.I.energy.mul(0.3).add(0.12), 0.26, 9).mul(dark).mul(c.inner).mul(0.8);
      const zone = c.fond.add(c.frame.mul(0.6)).add(c.subj.mul(0.15));
      const add = glowC.mul(glow.mul(0.6).mul(zone).mul(dark.mul(0.6).add(0.4))).add(glowC.mul(plank));
      return { color: mix(c.L.color, c.L.color.mul(vec3(0.9, 1, 1.05)), c.fond.mul(0.4)).add(add), emissive: add.mul(0.9) };
    },
  },
];

export const EFFECTS: FxDef[] = [...COMMON, ...UNCOMMON, ...RARE, ...EPIC, ...LEGENDARY, ...MYTHIC, ...SECRET];
export const effectsOf = (tier: RarityId) => EFFECTS.filter((e) => e.tier === tier);

/** Textures partagées accessibles aux options de calques (créées avant la construction des matériaux). */
export const TEXREF: Partial<FxTextures> = {};

/** UV d'un calque à une profondeur donnée (même calcul que composeLayers, pour les couches d'étoiles). */
function uvAt(d: number): N {
  const V = viewDirObject();
  const k = V.xy.div(max(V.z, 0.22)).mul(vec2(1 / CARD.w, 1 / CARD.h));
  return uv().sub(k.mul(d));
}

// ── ondes (4 derniers touchers)
function rippleTerms(I: Inputs, q: Q) {
  const list = q === 'low' ? [I.touches[0]] : I.touches;
  return list.map((tp) => {
    const d = uv().sub(tp.xy).mul(vec2(CARD.w, CARD.h));
    const r = length(d);
    const age = time.sub(tp.z);
    const live = step(float(0), age).mul(exp(age.mul(-1.3))).mul(tp.w);
    const wave = sin(r.mul(95).sub(age.mul(9))).mul(exp(r.mul(-4.5))).mul(smoothstep(age.mul(0.11).add(0.02), age.mul(0.11), r));
    return { v: wave.mul(live), dir: d.div(max(r, 0.001)) };
  });
}
function ripple(I: Inputs, q: Q): N {
  return rippleTerms(I, q).reduce((a: N, t) => a.add(t.v), float(0));
}
function rippleDir(I: Inputs, q: Q): N {
  return rippleTerms(I, q).reduce((a: N, t) => a.add(t.dir.mul(t.v)), vec2(0, 0));
}

/**
 * Étincelles SANS ÉTAT : chaque sprite calcule sa position à partir de son index et du temps (aucune donnée CPU,
 * aucun compute) — même code et même coût en WebGPU et en WebGL2.
 *  - 'silhouette' : naissent sur le CONTOUR du sujet (alpha du sujet lu au sommet : seules celles nées sur la
 *    silhouette sont visibles), montent et traînent derrière la rotation ;
 *  - 'dust' : poussière lente qui flotte devant la carte.
 */
function sparkSprites(env: FxEnv, count: number, mode: 'silhouette' | 'dust'): Sprite {
  const m = env.bag.add(new SpriteNodeMaterial());
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  const i = float(instanceIndex);
  const h1 = hash(i.mul(1.13)), h2 = hash(i.mul(2.71).add(4)), h3 = hash(i.mul(5.37).add(9)), h4 = hash(i.mul(7.91).add(13));
  const period = mode === 'silhouette' ? h1.mul(2).add(1.8) : h1.mul(6).add(6);
  const cyc = time.div(period).add(h2);
  const life = fract(cyc);
  let pos: N;
  let birth: N = float(1);
  if (mode === 'silhouette') {
    // un point de naissance différent à chaque cycle (le cycle entre dans le hash), autour du point focal
    const k = cyc.floor();
    const su = vec2(hash(i.mul(3.1).add(k.mul(17.7))), hash(i.mul(9.7).add(k.mul(5.3)).add(2))).mul(vec2(0.8, 0.75)).add(vec2(0.1, 0.15));
    if (env.photo) {
      const l0 = luminance(texture(env.art.bg, su).level(float(3)).rgb);
      const l1 = luminance(texture(env.art.bg, su.add(vec2(0.012, 0))).level(float(3)).rgb);
      birth = smoothstep(float(0.04), float(0.14), abs(l1.sub(l0)));
    } else {
      const a = texture(env.art.subject, su).level(float(3)).a;
      birth = smoothstep(float(0.25), float(0.9), a.mul(a.oneMinus()).mul(4));
    }
    const p0 = su.sub(0.5).mul(vec2(CARD.w, CARD.h));
    const rise = vec2(h4.sub(0.5).mul(0.04), life.mul(0.16));
    pos = vec3(p0.add(rise).add(env.I.lag.mul(vec2(-0.1, -0.1)).mul(life)), life.mul(0.06).add(0.012));
  } else {
    const x = h3.sub(0.5).mul(CARD.w * 1.3).add(sin(time.mul(0.3).add(h4.mul(20))).mul(0.03));
    const y = h4.sub(0.5).mul(CARD.h * 1.2).add(life.mul(0.12));
    pos = vec3(vec2(x, y).add(env.I.lag.mul(vec2(-0.05, -0.05)).mul(life)), h2.mul(0.2).add(0.02));
  }
  m.positionNode = pos;
  const busy = mode === 'silhouette' ? clamp(env.I.energy.mul(1.3).add(0.4).sub(h4.mul(0.3)), 0, 1) : float(1);
  const fade: N = smoothstep(0, 0.12, life).mul(smoothstep(1, 0.5, life)).mul(busy).mul(birth);
  const disc: N = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
  const col: N = mix(vec3(1, 0.85, 0.55), vec3(0.75, 0.85, 1), h2).mul(mode === 'silhouette' ? 1.6 : 0.9);
  m.colorNode = vec4(col, disc.mul(fade).mul(mode === 'silhouette' ? 1 : 0.5));
  (m as unknown as { emissiveNode: N }).emissiveNode = col.mul(disc.mul(fade)).mul(0.6);
  m.scaleNode = h1.mul(mode === 'silhouette' ? 0.007 : 0.006).add(0.0025);
  const sp = new Sprite(m);
  sp.count = count;
  sp.userData.baseCount = count;
  sp.frustumCulled = false;
  return sp;
}

/** Courts rappels visuels (lab) : utilisés par le panneau. */
export const TIER_LABEL: Record<RarityId, string> = {
  common: '1★ Commune',
  uncommon: '2★ Peu commune',
  rare: '3★ Rare',
  epic: '4★ Épique',
  legendary: '5★ Légendaire',
  mythic: '6★ Mythique',
  secret: 'Secrète',
};
