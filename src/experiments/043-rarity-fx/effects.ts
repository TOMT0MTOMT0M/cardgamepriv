import { AdditiveBlending, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sprite, SpriteNodeMaterial, type Object3D } from 'three/webgpu';
import {
  abs,
  atan,
  clamp,
  cos,
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
  pow,
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
import { DEFAULT_DEPTHS, WINDOW_UV, viewDirObject, windowSDF } from '../../core/cardMaterial';
import type { N } from '../../core/tsl';
import { alive, cellFlash, dirOf, emboss, flickAge, glare, hueRotate, iris, luminance, noise, printGuard, rot2, sat, screen, softbox, sparkle, strength, strip, type FxCtx, type LayerOpts, type Q } from './kit';
import type { Inputs } from './kit';
import type { FxTextures } from './textures';

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
  /** photo pleine (pas de sujet détouré) */
  photo: boolean;
  /** horloge des nœuds (même base que `time` et `I.flick`) */
  now(): number;
  /** illustrations de la même carte, autres palettes (lenticulaire) */
  makeViews(n: number): Promise<CardArt[]>;
  bag: { add<T extends { dispose(): void }>(o: T): T };
}

export interface FxDef {
  num: number;
  tier: RarityId;
  name: string;
  /** principe visuel */
  idea: string;
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
  layers?: (q: Q, art: CardArt, I: Inputs, photo: boolean) => LayerOpts;
  prepare?: (env: FxEnv) => Promise<Record<string, unknown>>;
  build(c: FxCtx): FxOut;
  /** objets ajoutés à la carte (particules, tranches d'hologramme) */
  attach?(env: FxEnv, card: Object3D, extra: Record<string, unknown>): void;
}

const W = WINDOW_UV;
/** UV de la fenêtre d'illustration (0..1 sur la fenêtre). */
const winUV = (u: N) => u.sub(vec2(W.cx - W.hx, W.cy - W.hy)).div(vec2(W.hx * 2, W.hy * 2));
const lightDir = (c: FxCtx) => c.I.light.sub(c.uv).normalize();
const isLow = (c: FxCtx) => c.q === 'low';
const tiltOr = (c: FxCtx, k = 1): N => (isLow(c) ? vec2(0, 0) : c.I.tilt.mul(k));

// ═══════════════════════════════════════════════════════════ 1★ COMMUNE — quasi gratuit, rien sur l'illustration
const COMMON: FxDef[] = [
  {
    num: 1,
    tier: 'common',
    name: 'Reflet de vitrine',
    idea: 'Comme une photo sous verre : le reflet doux d’une fenêtre glisse sur la carte, traîne un peu, s’étire quand on tourne vite. Presque rien de face.',
    tech: 'rectangle arrondi doux (SDF) centré sur la lumière + inertie, étiré le long de la vitesse angulaire ; garde d’impression (les noirs restent noirs) ; quasi nul au repos',
    cost: '0 T · ~18 ALU',
    reduced: 'reflet fixe, sans suivi',
    readable: 'additif ≤ 8 %, la teinte ne change pas ; moitié moins sur le sujet ; absent dans les noirs',
    build(c) {
      if (isLow(c)) return { color: c.L.color.add(vec3(glare(c, 0.34, vec2(0.32, 0.78)).mul(0.07).mul(c.subj.mul(0.5).oneMinus()))) };
      const at = c.I.light.add(c.I.lag.mul(vec2(0.45, 0.4)));
      const box = softbox(c, at, [0.15, 0.21]);
      const k = alive(c, 0.35).mul(printGuard(c.L.color)).mul(c.subj.mul(0.5).oneMinus());
      return { color: c.L.color.add(vec3(box.mul(0.085).mul(k))) };
    },
  },
  {
    num: 2,
    tier: 'common',
    name: 'Liseré argent',
    idea: 'L’éclat d’argent COURT le long de la bordure tant qu’on tourne la carte, et s’arrête quand on s’arrête ; le côté tourné vers la lumière s’allume.',
    tech: 'reflet périodique dont la phase = chemin de rotation cumulé ; largeur ∝ énergie (flou de mouvement) ; liseré directionnel (dot bord·inclinaison)',
    cost: '0 T · ~15 ALU',
    reduced: 'bordure argent statique',
    readable: 'bordure extérieure seulement',
    build(c) {
      const t = tiltOr(c);
      if (isLow(c)) return { color: mix(c.L.color, vec3(0.78, 0.8, 0.84).mul(0.93), c.edge.mul(0.85)) };
      const run = c.I.phase.mul(1.6);
      const wave = sin(dot(c.uv, vec2(1.3, 0.8)).mul(6).sub(t.x.mul(4)).sub(t.y.mul(3)).sub(run)).mul(0.5).add(0.5);
      const sheen = smoothstep(c.I.energy.mul(-0.3).add(0.55), float(1), wave);
      const side = clamp(dot(dirOf(c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h))), dirOf(t.add(vec2(0.0001, 0)))), 0, 1).mul(strength(t));
      const silver = vec3(0.78, 0.8, 0.84).mul(sheen.mul(0.7).add(0.62).add(side.mul(0.35)));
      return { color: mix(c.L.color, silver, c.edge.mul(0.85)) };
    },
  },
  {
    num: 3,
    tier: 'common',
    name: 'Grain papier',
    idea: 'Le carton n’a presque pas de grain de face, mais en lumière rasante (carte bien penchée) ses fibres se révèlent.',
    tech: 'bruit précalculé en relief (2 lectures décalées vers la lumière) ; amplitude et longueur d’ombre ∝ inclinaison (lumière rasante)',
    cost: '2 T · ~12 ALU',
    reduced: 'désactivé',
    readable: 'cadre uniquement, ±8 % de luminance',
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      // grain fin (fibres) plutôt que des marbrures : haute fréquence, faible amplitude
      const p = c.uv.mul(vec2(34 * CARD.w, 34 * CARD.h));
      const graze = strength(c.I.tilt).pow(1.5);
      const sh = emboss(c.tex.noise, p, lightDir(c), graze.mul(0.8).add(0.18), 'r', graze.mul(0.012).add(0.006));
      const fiber = noise(c, p.mul(2.3)).a.sub(0.5).mul(graze.mul(0.05).add(0.015));
      return { color: c.L.color.mul(sh.add(fiber).mul(c.frame).add(1)) };
    },
  },
  {
    num: 4,
    tier: 'common',
    name: 'Coin lumineux',
    idea: 'Au toucher, ou d’un coup de poignet, un trait de lumière part du coin qui « mène » la rotation et fait le tour de la carte.',
    tech: 'angle autour du centre (atan) comparé à une tête qui avance (« 边框流光 » Cocos) ; départ = direction du coup de poignet, deux têtes en sens opposés',
    cost: '0 T · ~14 ALU, à la demande',
    reduced: 'au toucher seulement (pas de passage automatique)',
    readable: 'bordure, ponctuel',
    build(c) {
      const d = c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h));
      const th = atan(d.y, d.x).div(Math.PI * 2).add(0.5);
      const run = (age: N, start: N | number = 0, spd = 0.6, dur = 1.65) => {
        const head = fract(float(start).add(age.mul(spd)));
        let dd: N = fract(th.sub(head).add(0.5)).sub(0.5);
        if (spd < 0) dd = dd.negate();
        const on = step(float(0), age).mul(step(age, float(dur)));
        // tête nette + traînée derrière elle
        return smoothstep(float(0.025), float(0), abs(dd)).add(smoothstep(float(-0.18), float(0), dd).mul(step(dd, float(0))).mul(0.35)).mul(on);
      };
      const tap = run(time.sub(c.I.tap));
      const auto = isLow(c) ? float(0) : run(time.mod(6.5).sub(0.5));
      // coup de poignet : deux têtes partent du point du bord qui mène la rotation et se rejoignent de l'autre côté
      const fd = c.I.flickDir;
      const start = atan(fd.y.mul(CARD.h), fd.x.mul(CARD.w)).div(Math.PI * 2).add(0.5);
      const fa = flickAge(c);
      const fl = isLow(c) ? float(0) : max(run(fa, start, 0.55, 0.92), run(fa, start, -0.55, 0.92));
      const zone = max(c.edge, c.frame.mul(0.25));
      const light = max(max(tap, auto), fl).mul(zone);
      return { color: c.L.color.add(mix(vec3(1), c.accent, 0.4).mul(light.mul(0.9))) };
    },
  },
  {
    num: 5,
    tier: 'common',
    name: 'Sceau gaufré',
    idea: 'Le symbole de rareté est embossé ; à un angle précis (à chercher en tournant la carte) il « attrape » la lumière d’un éclat d’or.',
    tech: 'relief du gabarit éclairé par 2 lectures décalées, relief plus marqué en rasant ; éclat quand l’orientation passe par l’angle propre du sceau',
    cost: '2 T (zone minuscule) · ~10 ALU',
    reduced: 'symbole plat',
    readable: 'hors de l’illustration',
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      // zone du symbole, sans le bord de la fenêtre (sinon le relief du bord y fait un trait blanc)
      const zone = c.frame.mul(step(0.55, c.uv.x)).mul(step(0.86, c.uv.y)).mul(smoothstep(0.008, 0.016, windowSDF(c.uv)));
      const tl = strength(c.I.tilt);
      const e = emboss(c.art.frame, c.uv, lightDir(c), tl.mul(1.6).add(1.6), 'a', 0.0028);
      const gold = vec3(1, 0.86, 0.55);
      // angle propre du sceau : en haut à droite, à mi-inclinaison
      const sweet = smoothstep(float(0.9), float(1), dot(dirOf(c.I.tilt.add(vec2(0.0001, 0))), vec2(0.78, 0.62))).mul(smoothstep(float(0.35), float(0.75), tl));
      const lit = c.L.color.add(gold.mul(max(e, 0).mul(sweet.mul(1.4).add(0.8)))).sub(vec3(max(e.negate(), 0).mul(0.35))).add(gold.mul(sweet.mul(0.22)));
      return { color: mix(c.L.color, lit, zone), emissive: gold.mul(sweet.mul(zone).mul(0.5)) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 2★ PEU COMMUNE — finition du cadre
const UNCOMMON: FxDef[] = [
  {
    num: 6,
    tier: 'uncommon',
    name: 'Vernis sélectif',
    idea: 'Comme un vernis UV sur une belle impression : les ornements du cadre sont brillants, le reste mat. On ne le voit que quand la lumière passe dessus.',
    tech: 'bande de lumière (lampe en bande réfléchie) dont la position suit l’inclinaison + inertie ; zone = masque foil du gabarit ; léger gloss permanent ; quasi nul de face',
    cost: '0 T · ~14 ALU',
    reduced: 'gloss figé',
    readable: 'cadre uniquement, additif plafonné',
    build(c) {
      const zone = max(c.foil.mul(c.frame), c.edge.mul(0.35));
      if (isLow(c)) return { color: c.L.color.add(vec3(0.08).mul(zone)) };
      const o = c.I.tilt.add(c.I.lag.mul(0.6));
      const pos = float(0.55).add(o.y.mul(0.55)).add(o.x.mul(0.25));
      const band = strip(c, [0.3, 0.95], pos, c.I.energy.mul(0.06).add(0.07));
      const gloss = band.mul(0.55).mul(alive(c, 0.3)).add(0.06);
      return { color: c.L.color.add(mix(vec3(1), c.accent, 0.25).mul(gloss.mul(zone).mul(printGuard(c.L.color).mul(0.6).add(0.4)))) };
    },
  },
  {
    num: 7,
    tier: 'uncommon',
    name: 'Balayage',
    idea: 'Une bande lumineuse traverse le cadre (流光) : sa position suit l’inclinaison, elle avance quand on tourne et s’élargit en traînée si on tourne vite.',
    tech: 'bande lissée sur la diagonale ; phase = inclinaison + chemin cumulé ; largeur ∝ énergie, intensité ∝ 1/largeur (conservation) ; écho décalé par l’inertie',
    cost: '0 T · ~16 ALU',
    reduced: 'un passage automatique toutes les 6 s',
    readable: 'cadre + 15 % max sur le bord intérieur de l’illustration',
    build(c) {
      const s = dot(c.uv, vec2(0.75, 0.45));
      const phase = isLow(c) ? time.div(6).fract().mul(1.6) : c.I.tilt.x.mul(0.7).add(c.I.tilt.y.mul(0.4)).add(time.mul(0.03)).add(c.I.phase.mul(0.22));
      const wdt = c.I.energy.mul(0.14).add(0.1);
      const bandAt = (ph: N) => smoothstep(wdt, float(0), abs(fract(s.mul(0.8).sub(ph)).sub(0.5))).mul(float(0.1).div(wdt));
      const band = isLow(c) ? bandAt(phase) : bandAt(phase).add(bandAt(phase.sub(c.I.lag.x.mul(0.5)).sub(0.06)).mul(0.3));
      const rim = c.win.mul(smoothstep(float(0.03), float(0), windowSDF(c.uv).negate())).mul(0.15);
      const zone = max(c.frame, rim);
      return { color: c.L.color.add(mix(vec3(1), c.accent, 0.3).mul(band.mul(zone).mul(0.75))) };
    },
  },
  {
    num: 8,
    tier: 'uncommon',
    name: 'Paillettes de cadre',
    idea: 'Des micro-étoiles s’allument chacune à SON angle quand on tourne ; plus on tourne vite, plus il y en a, et elles finissent de scintiller après l’arrêt.',
    tech: 'une étoile analytique par cellule, facette propre comparée à l’orientation + inertie ; densité et éclat ∝ énergie',
    cost: '0 T · ~28 ALU',
    reduced: 'densité ÷ 3, sans scintillement',
    readable: 'cadre uniquement',
    build(c) {
      const sp = isLow(c) ? sparkle(c, 70, 0.1, 0.36, 0, false) : sparkle(c, 70, c.I.energy.mul(0.25).add(0.3), 0.36, 0, true);
      return { color: c.L.color.add(mix(vec3(1), c.accent, 0.5).mul(sp.mul(c.frame).mul(c.I.energy.mul(0.8).add(1.5)))) };
    },
  },
  {
    num: 9,
    tier: 'uncommon',
    name: 'Métal tourné',
    idea: 'Le cadre devient du métal usiné en cercles (comme un fond de montre) : un rayon de lumière en croix tourne autour du centre en suivant l’inclinaison et la torsion.',
    tech: 'reflet anisotrope sur rainures concentriques : lumineux où la tangente est ⟂ à la lumière (rayon radial) ; grain = bruit lu le long du rayon ; torsion = gyroscope α / molette',
    cost: '1 T · ~22 ALU',
    reduced: 'brossé statique',
    readable: 'cadre ; le texte (sombre) reste sombre (modulation multiplicative)',
    build(c) {
      const p = c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h));
      const r = length(p);
      const n = noise(c, vec2(r.mul(70), 0.37)).r;
      if (isLow(c)) return { color: mix(c.L.color, c.L.color.mul(n.mul(0.4).add(0.8)), c.frame) };
      const tg = dirOf(vec2(p.y.negate(), p.x));
      const Ld = rot2(dirOf(c.I.tilt.add(c.I.lag.mul(0.6)).add(vec2(0.0001, 0.0002))), c.I.twist.negate());
      const an = float(1).sub(abs(dot(tg, Ld))).pow(10);
      const hl = an.mul(strength(c.I.tilt, 0.7).mul(0.8).add(0.2)).mul(smoothstep(float(0.02), float(0.08), r));
      const metal = c.L.color.mul(n.mul(0.35).add(0.8)).add(vec3(hl.mul(n.add(0.35)).mul(0.55)));
      return { color: mix(c.L.color, metal, c.frame) };
    },
  },
  {
    num: 10,
    tier: 'uncommon',
    name: 'Titre gravé',
    idea: 'Le nom est gravé en creux : en rasant, l’ombre des lettres s’allonge et l’or au fond des sillons s’allume.',
    tech: 'gravure déduite de l’alpha du cadre (2 lectures décalées) ; décalage et intensité ∝ inclinaison ; dorure du sillon ∝ lumière rasante',
    cost: '2 T · ~10 ALU',
    reduced: 'plat',
    readable: 'améliore la lecture du titre',
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      // bandeau du titre seulement, sans le bord extérieur de la carte (sinon le relief y trace un trait)
      const zone = c.frame.mul(smoothstep(0.03, 0.045, c.uv.x)).mul(step(c.uv.x, float(0.64))).mul(step(0.86, c.uv.y)).mul(smoothstep(0.975, 0.96, c.uv.y));
      const lum = luminance(c.L.frame.rgb);
      const groove = smoothstep(0.55, 0.25, lum).mul(zone);
      const tl = strength(c.I.tilt);
      // borné : le bord du bandeau lui-même ne doit pas devenir un rectangle sombre
      const e = clamp(emboss(c.art.frame, c.uv, lightDir(c).negate(), tl.mul(3).add(3), 'r', tl.mul(0.003).add(0.0014)), -0.3, 0.7).mul(zone);
      return { color: c.L.color.mul(e.add(1)).add(vec3(1, 0.85, 0.55).mul(groove.mul(tl.mul(0.22).add(0.06)))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 3★ RARE — le fond s'anime, le sujet reste intact
const RARE: FxDef[] = [
  {
    num: 11,
    tier: 'rare',
    name: 'Encre à variation optique',
    idea: 'L’encre des billets de banque : le décor bascule entre DEUX couleurs selon l’angle, et une barre lumineuse roule dessus quand on incline (effet « rolling bar »). Rien d’arc-en-ciel.',
    tech: 'teinte multiplicative (luminance conservée) entre la couleur de la rareté et sa complémentaire, k = projection de l’orientation ; barre = gaussienne dont la position suit l’inclinaison + inertie ; garde d’impression',
    cost: '0 T · ~24 ALU',
    reduced: 'teinte fixe à mi-chemin, sans barre',
    readable: 'sujet intact ; les noirs restent noirs ; luminance du fond conservée',
    build(c) {
      const A = c.tint, B = hueRotate(c.tint, float(2.6));
      if (isLow(c)) return { color: iris(c.L.color, mix(A, B, 0.5), c.fond.mul(0.4), 0.04) };
      const o = c.I.tilt.add(c.I.lag.mul(0.5));
      const k = smoothstep(float(-0.75), float(0.75), dot(o, vec2(0.8, 0.6)));
      const tinted = iris(c.L.color, mix(A, B, k), c.fond.mul(0.5).add(c.frame.mul(0.12)), 0.06);
      // barre roulante : reflet d'une lampe en bande sur le pigment métallique
      const pos = float(0.5).add(o.x.mul(0.6)).add(o.y.mul(0.2));
      const bar = strip(c, [0.9, 0.35], pos, c.I.energy.mul(0.05).add(0.07));
      const g = printGuard(c.L.color);
      return { color: tinted.add(mix(vec3(1), A, 0.2).mul(bar.mul(0.3).mul(c.fond).mul(g).mul(alive(c, 0.4)))) };
    },
  },
  {
    num: 12,
    tier: 'rare',
    name: 'Kintsugi',
    idea: 'Le décor est une céramique recollée à l’or : les fissures sont des veines dorées, et chaque veine s’allume à SON angle quand on tourne la carte.',
    tech: 'Voronoï PRÉCALCULÉ (arêtes = veines) ; facette par cellule (hash de l’identifiant) → éclat quand l’orientation passe par son angle ; laque douce sur les tessons',
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
      // la laque des tessons : un reflet doux qui glisse (boîte à lumière), très léger
      const lacq = softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.12, 0.18]).mul(0.05).mul(printGuard(c.L.color));
      const base = c.L.color.add(vec3(lacq).mul(c.fond));
      const lit = gold.mul(flash.mul(1.1).add(0.75));
      const col = mix(base, lit, vein.mul(c.fond).mul(0.85));
      return { color: col, emissive: gold.mul(vein.mul(flash).mul(c.fond)).mul(0.6) };
    },
  },
  {
    num: 13,
    tier: 'rare',
    name: 'Cadran soleil',
    idea: 'Le décor est un cadran de montre brossé « soleil » autour du personnage : une barre de lumière tourne autour de lui en suivant l’inclinaison et la torsion.',
    tech: 'brossage radial centré sur la fenêtre ; reflet anisotrope = (1 − |rayon · lumière|)^p (brillant où les stries sont ⟂ à la lumière) ; grain lu le long de l’angle (1 lecture) ; torsion = gyroscope / molette',
    cost: '1 T · ~20 ALU',
    reduced: 'brossage statique',
    readable: 'fond uniquement, multiplicatif (le design reste) + reflet plafonné',
    build(c) {
      const p = c.uv.sub(vec2(W.cx, W.cy)).mul(vec2(CARD.w, CARD.h));
      const r = length(p);
      const rad = dirOf(p);
      const ang = atan(p.y, p.x);
      const grain = noise(c, vec2(ang.mul(14).add(0.5), 0.23)).r;
      const brushed = c.L.color.mul(grain.mul(0.22).add(0.89));
      if (isLow(c)) return { color: mix(c.L.color, brushed, c.fond) };
      const Ld = rot2(dirOf(c.I.tilt.add(c.I.lag.mul(0.6)).add(vec2(0.0001, 0.0002))), c.I.twist.negate());
      const an = float(1).sub(abs(dot(rad, Ld))).pow(7);
      const bar = an.mul(strength(c.I.tilt, 0.7).mul(0.75).add(0.25)).mul(smoothstep(float(0.02), float(0.1), r));
      const g = printGuard(c.L.color);
      const metal = brushed.add(mix(vec3(1), c.accent, 0.35).mul(bar.mul(grain.add(0.4)).mul(0.5)).mul(g));
      return { color: mix(c.L.color, metal, c.fond) };
    },
  },
  {
    num: 14,
    tier: 'rare',
    name: 'Pierre de lune',
    idea: 'Une lueur laiteuse flotte SOUS la surface du décor (adularescence) : elle se déplace à contre-sens de l’inclinaison, comme si la carte avait de l’épaisseur.',
    tech: 'lueur bleutée = tache douce centrée à l’opposé de l’inclinaison (parallaxe de sous-surface) + inertie, modulée par un bruit lu plus profond ; voile nacré léger ; garde d’impression',
    cost: '1 T · ~16 ALU',
    reduced: 'lueur fixe au centre',
    readable: 'fond uniquement, additif plafonné ≈ 25 %',
    build(c) {
      const o = isLow(c) ? vec2(0, 0) : c.I.tilt.add(c.I.lag.mul(0.7));
      const center = vec2(W.cx, W.cy).sub(o.mul(vec2(0.16, 0.12)));
      const d = c.uv.sub(center).mul(vec2(CARD.w, CARD.h)).length();
      const n = noise(c, c.uv.mul(1.3).sub(o.mul(0.06))).r;
      const glow = smoothstep(float(0.42), float(0.02), d).mul(n.mul(0.7).add(0.5));
      const milk = vec3(0.72, 0.84, 1);
      const g = printGuard(c.L.color);
      const col = c.L.color.add(milk.mul(glow.mul(0.34).mul(c.fond).mul(g)));
      const veil = mix(col, sat(col, 0.85).add(milk.mul(0.03)), c.fond.mul(0.5));
      return { color: veil, emissive: milk.mul(glow.mul(c.fond).mul(0.12)) };
    },
  },
  {
    num: 15,
    tier: 'rare',
    name: 'Double plan',
    idea: 'Le personnage se décolle du décor (TCG Pocket) ; il est « en gelée » : il traîne derrière la rotation, déborde et se repose, et se décolle davantage quand on bouge.',
    tech: 'parallaxe ×2,4 (+ énergie) ; décalage du SUJET seul par l’inertie (ressort sous-amorti) ; ombre portée qui suit la lumière',
    cost: '1 T · ~10 ALU',
    reduced: 'décalage ×1,4, pas d’ombre',
    readable: 'le sujet n’est pas altéré, seulement déplacé',
    layers: (q, _art, I) => (q === 'low' ? { depth: 1.4 } : { depth: I.energy.mul(0.9).add(2.4), subjectShift: I.lag.mul(vec2(-0.018, 0.018)) }),
    gainless: true,
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      const off = c.I.light.sub(0.5).mul(-0.035).add(vec2(0.008, -0.012)).add(c.I.lag.mul(vec2(-0.018, 0.018)));
      const sh = texture(c.art.subject, c.L.uvAt(DEFAULT_DEPTHS.subject).add(off)).level(float(3)).a;
      return { color: c.L.color.mul(float(1).sub(sh.mul(0.4).mul(c.fond))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 4★ ÉPIQUE — profondeur et relief
const EPIC: FxDef[] = [
  {
    num: 16,
    tier: 'epic',
    name: 'Théâtre de papier',
    idea: 'La carte devient un « tunnel book » de papier découpé : décor, personnage et premier plan sont des feuilles empilées, chacune projette son ombre sur la suivante, et l’ombre tourne avec la lumière.',
    tech: 'parallaxe ×2,2 (+ énergie) ; ombres = alpha du calque du dessus lu dans un mip flouté, décalé vers l’opposé de la lumière (+ inertie) ; ombre de la fenêtre directionnelle ; grain papier',
    cost: '3 T · ~22 ALU',
    reduced: 'parallaxe ×1,5, une seule ombre',
    readable: 'aucune couleur ajoutée : seulement des ombres douces et du relief',
    layers: (q, _art, I) => ({ depth: q === 'low' ? 1.5 : I.energy.mul(0.8).add(2.2), subjectShift: q === 'low' ? undefined : I.lag.mul(vec2(-0.012, 0.012)) }),
    gainless: true,
    build(c) {
      const ld = c.I.light.sub(0.5).mul(vec2(1, 0.8)).add(isLow(c) ? vec2(0, 0) : c.I.lag.mul(0.5));
      const off = ld.mul(-0.05).add(vec2(0.006, -0.01));
      // ombre du personnage sur le décor
      const shS = texture(c.art.subject, c.L.uvAt(DEFAULT_DEPTHS.subject).add(off).add(isLow(c) ? vec2(0, 0) : c.I.lag.mul(vec2(-0.012, 0.012)))).level(float(3)).a;
      let shade: N = shS.mul(0.45).mul(c.fond);
      if (!isLow(c)) {
        // ombre du premier plan sur le personnage et le décor ; ombre de la fenêtre (cadre épais) côté opposé à la lumière
        const shF = texture(c.art.fg, c.L.uvAt(DEFAULT_DEPTHS.fg).add(off.mul(0.7))).level(float(3)).a;
        const sd = windowSDF(c.uv.add(ld.mul(0.03)));
        const shW = smoothstep(float(-0.05), float(0.005), sd).mul(c.win);
        shade = shade.add(shF.mul(0.3).mul(c.win).mul(c.L.fg.a.oneMinus())).add(shW.mul(0.32));
      }
      const paper = noise(c, c.uv.mul(vec2(30 * CARD.w, 30 * CARD.h))).a.sub(0.5).mul(0.05);
      return { color: c.L.color.mul(float(1).sub(clamp(shade, 0, 0.7))).mul(paper.add(1)) };
    },
  },
  {
    num: 17,
    tier: 'epic',
    name: 'Émail guilloché',
    idea: 'Un cadran Fabergé : un guillochis gravé à la machine, sous un émail translucide à la couleur de la rareté. La gravure accroche un reflet qui glisse, et la rosace tourne avec la carte (torsion comprise).',
    tech: 'guillochis précalculé lu dans un repère tourné (inclinaison + torsion + inertie) ; relief (2 lectures) dont l’ombre s’allonge en rasant ; émail = teinte multiplicative + gloss (boîte à lumière) ; hachures sur le cadre',
    cost: '3 T · ~24 ALU',
    reduced: 'lignes plates en niveaux de gris',
    readable: 'gravure sur le fond et le cadre, jamais sur le sujet ; teinte à luminance conservée',
    build(c) {
      const w0 = winUV(c.uv);
      const w = isLow(c) ? w0 : rot2(w0.sub(0.5), c.I.twist.add(c.I.tilt.x.mul(0.25)).add(c.I.lag.x.mul(0.35))).add(0.5).add(c.I.tilt.mul(0.035));
      const ring = texture(c.tex.lines, w).r;
      const hatch = texture(c.tex.lines, c.uv.mul(vec2(1.4, 1.4 * CARD.h / CARD.w))).g;
      if (isLow(c)) return { color: c.L.color.add(vec3(ring.mul(c.fond).add(hatch.mul(c.frame).mul(0.5)).mul(0.14))) };
      const tl = strength(c.I.tilt);
      const lit = emboss(c.tex.lines, w, lightDir(c), tl.mul(1.4).add(0.9), 'r', tl.mul(0.004).add(0.0025));
      const enamel = iris(c.L.color, c.tint, c.fond.mul(0.35), 0.02);
      const gloss = softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.14, 0.2]).mul(0.09);
      const g = printGuard(c.L.color);
      const col = enamel.mul(lit.mul(c.fond).mul(0.45).add(1)).add(vec3(gloss.add(ring.mul(0.06))).mul(c.fond).mul(g));
      return { color: col.add(mix(vec3(1), c.accent, 0.5).mul(hatch).mul(c.frame).mul(lit.mul(0.5).add(0.12))) };
    },
  },
  {
    num: 18,
    tier: 'epic',
    name: 'Profondeur',
    idea: 'Le décor prend une vraie profondeur : il se creuse quand on bouge et ses reliefs sont éclairés par le côté où l’on penche.',
    tech: 'parallaxe itérative sur une hauteur déduite du fond (mip flouté) : High 4 pas, Mid 2, Low 1 ; profondeur + énergie ; ombrage = gradient de hauteur · inclinaison',
    cost: '2–5 T · ~20 ALU',
    reduced: '1 pas',
    readable: 'aucune couleur ajoutée, seulement du relief et de l’ombre',
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
    gainless: true,
    build(c) {
      if (isLow(c)) return { color: c.L.color };
      // relief éclairé de côté : gradient de la hauteur (mip flouté) dans la direction de l'inclinaison
      const ld = dirOf(c.I.tilt.add(vec2(0.0001, 0)));
      const hA = luminance(texture(c.art.bg, c.L.bgUV).level(float(3)).rgb);
      const hB = luminance(texture(c.art.bg, c.L.bgUV.add(ld.mul(0.012))).level(float(3)).rgb);
      const shade = hB.sub(hA).mul(strength(c.I.tilt).mul(2.6)).mul(c.fond);
      return { color: c.L.color.mul(clamp(shade.add(1), 0.75, 1.3)) };
    },
  },
  {
    num: 19,
    tier: 'epic',
    name: 'Encre vivante',
    idea: 'Le décor est une aquarelle encore humide : quand on tourne la carte, l’encre « clapote » dans le sens du mouvement puis se calme ; le personnage reste net.',
    tech: 'distorsion des UV du fond : champ de flux (bruit précalculé) qui avance avec le chemin de rotation + débordement par l’inertie ; amplitude ∝ énergie',
    cost: '2 T · ~10 ALU',
    reduced: 'ondulation lente à demi-amplitude',
    readable: 'le sujet (calque séparé) n’est jamais déformé',
    layers(q, art, I) {
      void art;
      const amp = q === 'low' ? 0.006 : q === 'mid' ? 0.011 : 0.014;
      const sp = q === 'low' ? 0.5 : 1;
      if (q === 'low') return { warpBg: (u0) => u0.add(texture(TEXREF.noise!, u0.mul(1.6).add(time.mul(vec2(0.012 * sp, 0.02 * sp)))).rg.sub(0.5).mul(amp)) };
      return {
        warpBg: (u0) => {
          const n = texture(TEXREF.noise!, u0.mul(1.6).add(time.mul(vec2(0.012, 0.02))).add(I.phase.mul(vec2(0.03, 0.018))));
          const a = I.energy.mul(1.8).add(1).mul(amp);
          // clapotis : l'encre est poussée à l'opposé du mouvement (inertie), modulée par le bruit
          return u0.add(n.rg.sub(0.5).mul(a)).add(I.lag.mul(n.b.mul(0.035)));
        },
      };
    },
    build(c) {
      return { color: c.L.color };
    },
  },
  {
    num: 20,
    tier: 'epic',
    name: 'Givre',
    idea: 'Les coins se couvrent de givre : BOUGER la carte l’efface comme un coup de chiffon, il se reforme doucement quand on la laisse immobile ; ses cristaux scintillent à leur angle.',
    tech: 'mip flouté du fond + bruit de givre ; essuyage = intégrale de la vitesse (monte en bougeant, retombe en ~3 s) ; cristaux = paillettes à facettes',
    cost: '3 T · ~20 ALU',
    reduced: 'givre statique',
    readable: 'coins et cadre ; le sujet est épargné à 70 %',
    build(c) {
      const w = winUV(c.uv);
      const cd = min(min(length(w), length(w.sub(vec2(1, 0)))), min(length(w.sub(vec2(0, 1))), length(w.sub(vec2(1, 1)))));
      const n = noise(c, c.uv.mul(4));
      const clear = isLow(c) ? float(0) : smoothstep(float(0), float(1), c.I.wipe).mul(0.85);
      // le givre se retire d'abord du côté où l'on penche (le chiffon passe par là)
      const side = isLow(c) ? float(0) : dot(w.sub(0.5), dirOf(c.I.tilt.add(vec2(0.0001, 0)))).mul(strength(c.I.tilt)).mul(0.25);
      const frost = smoothstep(float(0.4), float(0.08), cd.add(n.r.sub(0.5).mul(0.22)).add(side).add(clear.mul(0.35))).mul(clear.oneMinus());
      const blur = texture(c.art.bg, c.L.bgUV).level(float(4)).rgb;
      const cold = mix(sat(blur, 0.6), vec3(0.85, 0.92, 1), 0.22);
      const crystal = noise(c, c.uv.mul(14)).b;
      const fr = mix(cold, vec3(1), crystal.pow(3).mul(0.5));
      const zone = frost.mul(c.win).mul(c.subj.mul(0.8).oneMinus());
      const glint = isLow(c) ? float(0) : sparkle(c, 110, 0.22, 0.3, 7).mul(zone);
      return { color: mix(c.L.color, fr, zone.mul(0.58)).add(vec3(glint.mul(0.7))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 5★ LÉGENDAIRE — matière précieuse et lumière (bloom)
const LEGENDARY: FxDef[] = [
  {
    num: 21,
    tier: 'legendary',
    name: 'Or liquide',
    idea: 'Le cadre est de l’or fondu : il coule lentement, et quand on tourne la carte il « clapote », déborde dans l’autre sens puis se repose comme un vrai liquide.',
    tech: 'matcap or précalculé ; normale = flux (bruit qui dérive) + orientation + inertie (ressort sous-amorti) ; l’éclat chauffe avec l’énergie',
    cost: '2 T · ~14 ALU',
    reduced: 'or statique (inclinaison seule)',
    readable: 'cadre ; le texte sombre reste sombre (or multiplicatif) ; pas d’émission sur l’art',
    bloom: 0.55,
    build(c) {
      const flow = isLow(c) ? vec2(0, 0) : time.mul(vec2(0.012, 0.018));
      const lg = isLow(c) ? vec2(0, 0) : c.I.lag;
      const n = noise(c, c.uv.mul(0.9).add(flow).add(lg.mul(0.12))).rg.sub(0.5).mul(c.I.energy.mul(0.35).add(0.45)).add(c.I.tilt.mul(0.6)).add(lg.mul(0.9));
      const mc = texture(c.tex.gold, n.mul(0.5).add(0.5)).rgb;
      const gold = c.L.color.mul(vec3(1, 0.8, 0.42).mul(0.8).add(mc.mul(0.42)));
      const zone = c.frame.mul(0.85).add(c.edge.mul(0.15));
      const hot = smoothstep(0.75, 1.15, luminance(mc));
      return { color: mix(c.L.color, gold, zone), emissive: mc.mul(hot).mul(zone).mul(c.I.energy.mul(0.5).add(0.5)) };
    },
  },
  {
    num: 22,
    tier: 'legendary',
    name: 'Verre épais',
    idea: 'L’illustration est sous une dalle de verre épais (« liquid glass ») : les bords réfractent le décor, une arête de lumière court sur le biseau du côté de la lampe, et un reflet glisse sur la dalle.',
    tech: 'normale du biseau = gradient analytique du SDF de la fenêtre ; réfraction = décalage de l’UV du fond près du bord ; High : dispersion sur le biseau seulement (2 lectures de plus) ; arête = (n · lumière)^p ; reflet boîte à lumière',
    cost: 'Mid 1 T · High 3 T · ~30 ALU',
    reduced: 'arête seule, sans réfraction',
    readable: 'bords de la fenêtre seulement ; le centre de l’illustration et le sujet sont intacts',
    bloom: 0.35,
    layers(q, _art, I) {
      if (q === 'low') return {};
      return {
        warpBg(u0) {
          const e = 0.002;
          const sd = windowSDF(u0);
          const n = vec2(windowSDF(u0.add(vec2(e, 0))).sub(sd), windowSDF(u0.add(vec2(0, e))).sub(sd)).div(e);
          const bevel = smoothstep(float(-0.04), float(-0.002), sd);
          // le verre « penche » avec la carte : la réfraction se décale avec l'inclinaison
          return u0.add(n.mul(bevel.mul(bevel)).mul(-0.022)).add(I.tilt.mul(0.004));
        },
      };
    },
    build(c) {
      const sd = windowSDF(c.uv);
      const e = 0.002;
      const n = dirOf(vec2(windowSDF(c.uv.add(vec2(e, 0))).sub(sd), windowSDF(c.uv.add(vec2(0, e))).sub(sd)));
      const bevel = smoothstep(float(-0.04), float(-0.004), sd).mul(smoothstep(float(0.004), float(-0.004), sd));
      const Ld = dirOf(c.I.tilt.add(c.I.lag.mul(0.5)).add(vec2(0.0001, 0.0002)));
      // arête : fine ligne brillante à l'extérieur du biseau, du côté de la lampe (et un filet à l'opposé, plus faible)
      const facing = dot(n, Ld.negate());
      const edge = max(facing, 0).pow(3).add(max(facing.negate(), 0).pow(3).mul(0.25)).mul(bevel.pow(3)).mul(strength(c.I.tilt, 0.8).mul(0.75).add(0.25));
      const sheen = isLow(c) ? float(0) : softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.16, 0.22], 0.06, 0.16).mul(0.045).mul(c.win).mul(printGuard(c.L.color));
      let col: N = c.L.color.add(vec3(edge.mul(0.9))).add(vec3(sheen));
      if (c.q === 'high') {
        // dispersion sur le biseau : rouge et bleu réfractés un peu différemment
        const o = n.mul(bevel.mul(0.006));
        const rB = texture(c.art.bg, c.L.bgUV.add(o)).r, bB = texture(c.art.bg, c.L.bgUV.sub(o)).b;
        col = col.add(vec3(rB.sub(c.L.bg.r), 0, bB.sub(c.L.bg.b)).mul(bevel.mul(c.fond).mul(0.7)));
      }
      return { color: col, emissive: vec3(edge.mul(0.35)) };
    },
  },
  {
    num: 23,
    tier: 'legendary',
    name: 'Labradorite',
    idea: 'La pierre qui « flashe » : de larges plages du cadre et du décor s’embrasent d’un bleu profond ou d’un or, chacune à son angle, puis s’éteignent. Deux couleurs, jamais l’arc-en-ciel.',
    tech: 'cellules PRÉCALCULÉES à basse fréquence (plages) ; facette par plage (hash) → éclat quand l’orientation + inertie passe par son angle ; couleur par plage (bleu / or) ; parallaxe de sous-surface ; garde d’impression',
    cost: '1 T · ~22 ALU',
    reduced: 'plages figées, éclat selon l’inclinaison seule',
    readable: 'cadre + fond ; le sujet n’est pas recouvert ; les noirs restent noirs',
    bloom: 0.5,
    build(c) {
      const o = isLow(c) ? c.I.tilt : c.I.tilt.add(c.I.lag.mul(0.8));
      const cell = texture(c.tex.cells, c.uv.mul(vec2(0.8 * CARD.w / 0.63, 0.8 * CARD.h / 0.63)).sub(o.mul(0.02)));
      const id = cell.r;
      const nrm = vec2(hash(id.mul(31.7)), hash(id.mul(53.9).add(7))).mul(2).sub(1);
      const flash = smoothstep(float(0.78), float(1), dot(dirOf(o.add(vec2(0.0001, 0))), dirOf(nrm))).mul(strength(o, 0.6));
      const blue = vec3(0.12, 0.32, 1), goldC = vec3(1, 0.72, 0.28);
      const hue = mix(blue, goldC, step(0.62, hash(id.mul(17.3).add(2))));
      // le flash est plein au cœur de la plage et s'éteint vers ses bords (pas de mosaïque à arêtes vives)
      const edgeF = smoothstep(float(0.02), float(0.4), cell.g);
      const zone = c.frame.mul(0.8).add(c.fond.mul(0.6));
      const g = printGuard(c.L.color).mul(0.7).add(0.3);
      const k = flash.mul(edgeF).mul(zone).mul(g);
      const col = screen(c.L.color, hue.mul(k.mul(0.55))).add(hue.mul(k.mul(0.12)));
      return { color: col, emissive: hue.mul(k).mul(0.35) };
    },
  },
  {
    num: 24,
    tier: 'legendary',
    name: 'Aurore',
    idea: 'Des rideaux d’aurore boréale pendent dans le ciel : quand on tourne la carte, ils se balancent comme du tissu (le bas plus que le haut) et s’embrasent un instant.',
    tech: '2 bruits précalculés (rideau + rayons) ; pli = inertie × (1 − hauteur) (balancier), parallaxe du ciel ; éclat ∝ énergie',
    cost: '2 T · ~16 ALU',
    reduced: 'un seul rideau, lent',
    readable: 'ciel seulement, additif plafonné',
    bloom: 0.6,
    build(c) {
      const sp = isLow(c) ? 0.4 : 1;
      const sky = c.fond.mul(smoothstep(0.45, 0.8, c.uv.y));
      const hang = float(1).sub(smoothstep(0.5, 1, c.uv.y)).add(0.25);
      const fold = c.uv.x.add(sin(c.uv.y.mul(5).add(time.mul(0.25 * sp))).mul(0.06)).add(isLow(c) ? float(0) : c.I.lag.x.mul(0.22).mul(hang).add(c.I.tilt.x.mul(0.05)));
      const n1 = noise(c, vec2(fold.mul(0.9).add(time.mul(0.01 * sp)), c.uv.y.mul(0.2).add(time.mul(0.004 * sp))));
      const curtain = smoothstep(0.3, 0.8, n1.r).mul(smoothstep(0.45, 0.9, c.uv.y.add(n1.g.sub(0.5).mul(0.25))));
      const rays = isLow(c) ? float(0.75) : noise(c, vec2(fold.mul(5).add(time.mul(0.02)), 0.1)).g.mul(0.6).add(0.4);
      const col = mix(vec3(0.2, 1, 0.55), vec3(0.6, 0.3, 1), n1.g);
      const add = col.mul(curtain.mul(rays).mul(c.I.energy.mul(0.3).add(0.38))).mul(sky);
      return { color: c.L.color.add(add), emissive: add.mul(0.6) };
    },
  },
  {
    num: 25,
    tier: 'legendary',
    name: 'Caustiques',
    idea: 'Une lumière d’eau ondule sur le décor ; pencher la carte, c’est pencher un verre : la lumière glisse, et l’eau clapote après un mouvement.',
    tech: 'texture de caustiques périodique, 2 lectures en sens opposés, min() ; décalage = orientation (réfraction) + inertie (clapotis)',
    cost: '2 T · ~8 ALU',
    reduced: 'une lecture',
    readable: 'décor seulement, jamais sur le sujet',
    bloom: 0.5,
    build(c) {
      const sl = isLow(c) ? vec2(0, 0) : c.I.tilt.mul(0.08).add(c.I.lag.mul(0.2));
      const c1 = texture(c.tex.caustics, c.uv.mul(2.2).add(time.mul(vec2(0.02, 0.013))).add(sl)).r;
      const cv = isLow(c) ? c1.mul(0.6) : min(c1, texture(c.tex.caustics, c.uv.mul(2.7).sub(time.mul(vec2(0.017, 0.011))).sub(sl.mul(0.6))).r).mul(c.I.energy.mul(0.6).add(2));
      const k = cv.mul(c.fond);
      const add = vec3(0.6, 0.85, 1).mul(k.mul(0.07));
      return { color: c.L.color.mul(k.mul(0.55).add(1)).add(add), emissive: c.L.color.mul(k).mul(0.25) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 6★ MYTHIQUE — toute la carte, avec garde-fous
const MYTHIC: FxDef[] = [
  {
    num: 26,
    tier: 'mythic',
    name: 'Dichroïque',
    idea: 'Un verre dichroïque : de face la carte est d’une couleur, en la tournant elle bascule vers sa complémentaire — toute la carte, mais le personnage ne reçoit qu’un voile.',
    tech: 'k = projection de l’orientation (+ inertie) : couleur transmise ↔ réfléchie (teinte de la rareté ↔ complémentaire) ; teinte multiplicative à luminance conservée ; voile ≤ 25 % sur le sujet ; arête de verre émissive sur la bordure',
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
      const rim = c.edge.mul(strength(o).mul(0.6).add(0.3));
      return { color: out.add(col2.mul(rim.mul(0.5))), emissive: col2.mul(rim).mul(0.5) };
    },
  },
  {
    num: 27,
    tier: 'mythic',
    name: 'Daguerréotype',
    idea: 'Comme une vraie plaque daguerréotype : penchée, l’image devient un miroir d’argent où le décor passe en négatif, en entrant par le bord qui descend ; le personnage reste en couleurs.',
    tech: 'front de révélation = projection sur la direction d’inclinaison comparée à sa force (+ inertie) ; négatif argenté = (1 − luminance) teinté argent ; lèvre brillante (reflet d’argent) sur le front ; bordure émissive',
    cost: '0 T · ~20 ALU',
    reduced: 'bascule à un seuil fixe, sans front',
    readable: 'le sujet n’est jamais inversé ; c’est un événement d’angle, pas un état',
    bloom: 0.5,
    gainless: true,
    build(c) {
      const m = length(c.I.tilt);
      const silver = vec3(0.86, 0.88, 0.92);
      // plaque polie : négatif sombre, un peu de la couleur d'origine, et le reflet d'une fenêtre qui glisse dessus
      const neg0 = silver.mul(float(1).sub(luminance(c.L.color)).mul(0.5).add(0.06)).add(c.L.color.mul(0.12));
      if (isLow(c)) return { color: mix(c.L.color, neg0, step(0.65, m).mul(c.fond)) };
      const mirror = softbox(c, c.I.light.add(c.I.lag.mul(0.5)), [0.14, 0.2]).mul(0.35);
      const neg = neg0.add(silver.mul(mirror));
      const o = c.I.tilt.add(c.I.lag.mul(0.5));
      const proj = dot(c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h)), dirOf(o.add(vec2(0.0001, 0)))).div(CARD.h * 0.5).mul(0.5).add(0.5);
      const front = float(1.15).sub(smoothstep(0.45, 1.05, length(o)).mul(1.4));
      const s = smoothstep(front.sub(0.06), front.add(0.06), proj);
      const lip = smoothstep(float(0.07), float(0), abs(proj.sub(front))).mul(step(float(0.45), m));
      const col = mix(c.L.color, neg, s.mul(c.fond)).add(silver.mul(lip.mul(c.win).mul(0.4)));
      const se = s.max(lip);
      return { color: col.add(silver.mul(c.edge.mul(se).mul(0.5))), emissive: silver.mul(c.edge.mul(se).add(lip.mul(c.win).mul(0.35))).mul(0.5) };
    },
  },
  {
    num: 28,
    tier: 'mythic',
    name: 'Hors cadre',
    idea: 'Le personnage est une vraie feuille posée DEVANT la carte : quand on tourne, il déborde du cadre (« 破框 » / frame break Marvel Snap), traîne en gelée et projette son ombre sur le cadre lui-même.',
    tech: 'sujet détouré dessiné sur un plan séparé au-dessus de la carte (mélange normal), qui se lève avec l’énergie et s’écarte avec l’inertie ; la carte ne compose plus le sujet mais reçoit son ombre (mip flouté décalé vers l’opposé de la lumière)',
    cost: '1 plan de plus · 1 T',
    reduced: 'plan à 2 mm, sans levée',
    readable: 'le sujet est l’illustration intacte, simplement devant',
    bloom: 0.3,
    layers: () => ({ noSubject: true }),
    gainless: true,
    build(c) {
      const ld = c.I.light.sub(0.5).mul(vec2(1, 0.8)).add(isLow(c) ? vec2(0, 0) : c.I.lag.mul(0.6));
      const off = ld.mul(-0.06).add(vec2(0.008, -0.014));
      const lift = isLow(c) ? float(0.3) : c.I.energy.mul(0.7).add(0.3);
      const sh = texture(c.art.subject, c.uv.add(off.mul(lift.mul(1.4).add(0.4)))).level(lift.mul(2).add(2.5)).a;
      return { color: c.L.color.mul(float(1).sub(sh.mul(0.42).mul(c.win.add(c.frame.mul(0.8))))), emissive: c.accent.mul(c.edge).mul(0.15) };
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
        const lift = env.q === 'low' ? 0.012 : 0.012 + e * 0.07;
        mesh.position.z = lift;
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
    idea: 'La carte est une dalle d’acrylique transparent : on voit CE QU’IL Y A DERRIÈRE, réfracté par la dalle et ses biseaux ; seuls le personnage et les ornements imprimés sont opaques, et le personnage projette son ombre sur le monde derrière.',
    tech: 'copie PARTIELLE du framebuffer (rectangle de la carte + marge) échantillonnée à screenUV + décalage : biseau (gradient du SDF de la carte) + inclinaison de la dalle ; Fresnel, arête lumineuse, ombre par mip ; masque d’impression = sujet + encre du cadre + foil',
    cost: '1 copie partielle + 2 T · ~40 ALU',
    reduced: 'dalle sans réfraction (décalage fixe), sans ombre',
    readable: 'le sujet et le texte sont opaques et intacts ; l’illustration reste imprimée à 15 % dans le plastique',
    bloom: 0.35,
    transparentFront: true,
    gainless: true,
    build(c) {
      // SDF de la carte (rectangle arrondi) → normale du biseau
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
      // décalage d'échantillonnage du fond (en UV d'écran) : la dalle déplace la vue avec l'inclinaison, le biseau réfracte
      const shift = o.mul(vec2(0.012, -0.012)).add(n.mul(bevel.mul(bevel)).mul(vec2(-0.02, 0.02)));
      const back = c.extra.backdrop as ((off: N) => N) | undefined;
      const seen: N = back ? back(shift).rgb : vec3(0.08, 0.07, 0.07);
      // ce qui est IMPRIMÉ (opaque) : sujet, encre sombre du cadre, ornements foil
      const ink = c.frame.mul(smoothstep(float(0.72), float(0.4), luminance(c.L.frame.rgb)));
      const printed = clamp(c.subj.add(ink), 0, 1);
      // le papier du cadre est un dépoli (35 %) : la carte garde sa silhouette sans redevenir opaque
      // ombre du sujet sur ce qu'il y a derrière
      const ld = c.I.light.sub(0.5).mul(vec2(1, 0.8));
      const sh = isLow(c) ? float(0) : texture(c.art.subject, c.uv.add(ld.mul(-0.06)).add(vec2(0.01, -0.016))).level(float(3)).a;
      const Ld = dirOf(o.add(vec2(0.0001, 0.0002)));
      const facing = dot(n, Ld.negate());
      const rim = max(facing, 0).pow(3).add(max(facing.negate(), 0).pow(3).mul(0.3)).mul(bevel.pow(2)).mul(strength(c.I.tilt, 0.8).mul(0.7).add(0.3));
      const fres = float(1).sub(clamp(c.ndv, 0, 1)).pow(3).mul(0.2);
      const sheen = isLow(c) ? float(0) : softbox(c, c.I.light.add(c.I.lag.mul(0.4)), [0.17, 0.24], 0.06, 0.16).mul(0.07);
      const tintMul = mix(vec3(1), c.tint, 0.12);
      const plastic = seen.mul(tintMul).mul(float(1).sub(sh.mul(0.4))).add(c.L.bg.rgb.mul(c.fond).mul(0.15)).add(vec3(fres.add(sheen).add(rim.mul(0.8))));
      const frosted = max(printed, c.frame.mul(0.35));
      return { color: mix(plastic, c.L.color, frosted), emissive: vec3(rim.mul(0.4)).add(c.accent.mul(c.edge).mul(0.1)) };
    },
  },
  {
    num: 30,
    tier: 'mythic',
    name: 'Poussière d’étoiles',
    idea: 'Des étincelles s’échappent du cadre ; plus on tourne vite, plus il y en a, et elles traînent derrière le mouvement comme une queue de comète.',
    tech: 'sprites instanciés SANS ÉTAT (position = fonction du temps et de l’index) : identique WebGPU/WebGL2, 0 lecture CPU',
    cost: '1 passe de sprites (High 160, Mid 60, Low 20)',
    reduced: '20 étincelles',
    readable: 'les étincelles naissent sur le cadre et restent clairsemées devant l’art',
    bloom: 0.9,
    build(c) {
      const warm = mix(vec3(1, 0.85, 0.55), c.accent, 0.4);
      const k = c.I.energy.mul(0.6).add(0.4);
      return { color: c.L.color.add(warm.mul(c.edge).mul(k.mul(0.35))), emissive: warm.mul(c.edge).mul(k).mul(0.35) };
    },
    attach(env, card) {
      const n = env.q === 'high' ? 160 : env.q === 'mid' ? 60 : 20;
      card.add(sparkSprites(env, n, 'border'));
    },
  },
];

// ═══════════════════════════════════════════════════════════ SECRÈTE — la carte devient un lieu
const SECRET: FxDef[] = [
  {
    num: 31,
    tier: 'secret',
    name: 'Carte vivante',
    idea: 'Au repos la carte respire ; quand on la tourne, le personnage « en gelée » traîne derrière et le décor se creuse ; un appui long la plonge en plein écran (diorama).',
    tech: 'parallaxe animée des calques (respiration + énergie), sujet décalé par l’inertie ; mode immersif : profondeur ×4, caméra et poussière (GSAP)',
    cost: 'vue unique : 1 carte à l’écran',
    reduced: 'respiration seule, profondeur ×2 en immersif',
    readable: 'au repos, la carte est l’illustration d’origine',
    bloom: 0.6,
    layers: (q, _art, I) =>
      q === 'low'
        ? { depth: float(1).add(sin(time.mul(0.8)).mul(0.25)).add(I.immersive) }
        : { depth: float(1).add(sin(time.mul(0.8)).mul(0.25)).add(I.energy.mul(0.9)).add(I.immersive.mul(3)), subjectShift: I.lag.mul(vec2(-0.022, 0.022)) },
    build(c) {
      // la bordure respire avec la carte (même rythme que la profondeur)
      const breath = sin(time.mul(0.8)).mul(0.5).add(0.5);
      const k = breath.mul(0.4).add(0.3).add(c.I.energy.mul(0.4));
      return { color: c.L.color.add(c.accent.mul(c.edge).mul(k.mul(0.5))), emissive: c.accent.mul(c.edge).mul(k).mul(0.4) };
    },
    attach(env, card) {
      card.add(sparkSprites(env, env.q === 'high' ? 90 : env.q === 'mid' ? 40 : 14, 'dust'));
    },
  },
  {
    num: 32,
    tier: 'secret',
    name: 'Cosmos infini',
    idea: 'Derrière le personnage, un champ d’étoiles sans fin en vraie profondeur ; tourner vite passe en « vitesse lumière » : les étoiles s’étirent en traits dans le sens du mouvement.',
    tech: '3 couches d’étoiles précalculées à 3 profondeurs (parallaxe) ; High : 3 lectures le long de la vitesse angulaire (traînées ∝ énergie × proximité) ; nébuleuse qui dérive avec le chemin de rotation',
    cost: 'High 5 T · Mid 4 T · Low 2 T',
    reduced: 'une couche d’étoiles, nébuleuse figée',
    readable: 'le sujet reste intact au premier plan',
    bloom: 0.85,
    layers(q, _art, I, photo) {
      return {
        bgColor(rgb, uvBg) {
          const streak = I.vel.div(max(length(I.vel), 0.001)).mul(I.energy.pow(1.5)).mul(-0.045);
          const layer = (d: number, s: number) => {
            const u = uvAt(d).mul(s);
            let st: N = texture(TEXREF.stars!, u);
            if (q === 'high') {
              // traînées « vitesse lumière » : les couches proches (d grand) s'étirent plus
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
          // photo : l'espace s'ouvre seulement dans les OMBRES de la photo (le visage reste intact)
          const k = photo ? smoothstep(float(0.12), float(0.015), luminance(rgb)).mul(0.8) : float(0.88);
          return mix(rgb, cosmos, k);
        },
      };
    },
    build(c) {
      const bright = smoothstep(0.7, 1.2, luminance(c.L.color)).mul(c.fond);
      const neb = vec3(0.45, 0.35, 1);
      return { color: c.L.color.add(neb.mul(c.edge).mul(0.3)), emissive: c.L.color.mul(bright).mul(0.8).add(neb.mul(c.edge).mul(0.3)) };
    },
  },
  {
    num: 33,
    tier: 'secret',
    name: 'Lumière propre',
    idea: 'Le personnage éclaire lui-même son décor et le cadre ; ses rayons partent à l’opposé de l’inclinaison, comme si la lumière venait de derrière lui.',
    tech: 'halo = mip flouté du sujet (sa couleur moyenne) ; High : rayons 2D (8 lectures radiales). (Approximation légère des « radiance cascades », pas la vraie GI.)',
    cost: 'High 10 T · Mid 2 T · Low 2 T (halo figé)',
    reduced: 'halo seul, sans pulsation',
    readable: 'lumière douce autour du sujet, jamais SUR lui',
    bloom: 0.9,
    build(c) {
      if (c.photo) {
        // photo : « ambilight » — la lumière de la photo déborde sur le cadre (mip de la photo au point le plus proche
        // de la fenêtre), et les zones claires respirent légèrement dans les ombres
        const near = clamp(c.uv, vec2(W.cx - W.hx, W.cy - W.hy), vec2(W.cx + W.hx, W.cy + W.hy));
        const amb = texture(c.art.bg, near).level(float(c.q === 'low' ? 5 : 6)).rgb;
        const dist = windowSDF(c.uv);
        // le cadre s'allume surtout du côté où l'on penche (la photo « éclaire » vers le regard)
        const sideW = isLow(c) ? float(1) : clamp(dot(dirOf(c.uv.sub(0.5)), dirOf(c.I.tilt.add(vec2(0.0001, 0)))).mul(strength(c.I.tilt)).mul(0.7).add(0.65), 0.3, 1.4);
        const spillF = smoothstep(float(0.09), float(0), dist).mul(c.frame).mul(sideW);
        const pulseP = isLow(c) ? float(1) : sin(time.mul(1.5)).mul(0.15).add(0.85);
        const lit = sat(amb, 1.5).mul(spillF.mul(0.75).mul(pulseP));
        const bloomIn = texture(c.art.bg, c.L.bgUV).level(float(4)).rgb;
        const glowIn = bloomIn.mul(smoothstep(0.55, 0.9, luminance(bloomIn))).mul(c.win).mul(0.18).mul(pulseP);
        return { color: c.L.color.add(lit).add(glowIn), emissive: lit.mul(0.7).add(glowIn.mul(0.8)) };
      }
      const uS = c.L.uvAt(DEFAULT_DEPTHS.subject);
      const halo = texture(c.art.subject, uS.add(isLow(c) ? vec2(0, 0) : c.I.tilt.mul(0.018))).level(float(5));
      const avg = texture(c.art.subject, uS).level(float(7));
      const tint = sat(avg.rgb.div(max(avg.a, 0.02)), 1.4).mul(1.1);
      let rays: N = float(0);
      if (c.q === 'high') {
        // point de fuite des rayons : à l'opposé de l'inclinaison (+ inertie)
        const C = vec2(W.cx, W.cy).sub(c.I.tilt.mul(0.09)).sub(c.I.lag.mul(0.06));
        for (let i = 1; i <= 8; i++) rays = rays.add(texture(c.art.subject, mix(uS, C, (i / 8) * 0.38)).level(float(2)).a);
        rays = rays.div(8);
      }
      const pulse = isLow(c) ? float(1) : sin(time.mul(1.5)).mul(0.2).add(0.8);
      const spill = halo.a.mul(0.7).add(rays.mul(0.55)).mul(pulse).mul(c.fond.add(c.frame.mul(0.5)));
      const add = tint.mul(spill).mul(0.32);
      return { color: c.L.color.add(add), emissive: add.mul(0.6) };
    },
  },
  {
    num: 34,
    tier: 'secret',
    name: 'Pièce secrète',
    idea: 'Derrière la fenêtre, une vraie pièce (alcôve de musée) : l’illustration y est accrochée au fond, sous un projecteur, et en tournant la carte on voit les murs, le parquet, le plafond. Le personnage se tient dans l’embrasure.',
    tech: '« interior mapping » (astuce des façades de jeux vidéo) : rayon de vue en espace carte → intersection analytique avec 5 parois d’une boîte ; une seule texture atlas 2×2 (pas de cubemap) + l’illustration d’origine comme tableau du fond ; ombrage par la profondeur',
    cost: '2 T · ~45 ALU',
    reduced: 'pièce peu profonde, sans poussière',
    readable: 'l’illustration est le tableau accroché au fond, intacte ; le sujet reste devant',
    bloom: 0.45,
    layers(q, art, _I, photo) {
      return {
        bgColor(rgb) {
          void rgb;
          const D = q === 'low' ? 0.11 : 0.2;
          const V = viewDirObject();
          const k = V.xy.div(max(V.z, 0.22)).mul(vec2(1 / CARD.w, 1 / CARD.h));
          const u0 = uv();
          const x0 = W.cx - W.hx, x1 = W.cx + W.hx, y0 = W.cy - W.hy, y1 = W.cy + W.hy;
          const safe = (v: N) => select(v.greaterThanEqual(0), max(v, 0.0001), min(v, -0.0001));
          const kx = safe(k.x), ky = safe(k.y);
          // p(z) = u0 − k·z : parois x (kx > 0 → mur x0), parois y (ky > 0 → sol y0), fond z = D
          const zx = select(kx.greaterThan(0), u0.x.sub(x0).div(kx), u0.x.sub(x1).div(kx));
          const zy = select(ky.greaterThan(0), u0.y.sub(y0).div(ky), u0.y.sub(y1).div(ky));
          const z = min(min(zx, zy), float(D));
          const p = u0.sub(k.mul(z));
          const lx = p.x.sub(x0).div(2 * W.hx), ly = p.y.sub(y0).div(2 * W.hy), lz = z.div(D);
          const isBack = z.greaterThanEqual(D - 0.0005);
          const isX = zx.lessThan(zy).and(isBack.not());
          // tuile (0,0) fond ; (1,0) mur latéral (x = profondeur, le fond à droite) ; (0,1) sol ; (1,1) plafond
          const tileX = select(isBack, float(0), select(isX, float(1), select(ky.greaterThan(0), float(0), float(1))));
          const tileY = select(isBack, float(0), select(isX, float(0), float(1)));
          const local = select(isBack, vec2(lx, ly), select(isX, vec2(lz, ly), vec2(lx, lz)));
          const atlasUV = vec2(tileX, tileY).mul(0.5).add(clamp(local, 0.004, 0.996).mul(0.5));
          const wall = texture(TEXREF.room!, atlasUV).rgb;
          // ombrage par la profondeur (les parois s'assombrissent vers le fond, le fond garde son projecteur)
          const depthShade = select(isBack, float(1), mix(float(1.15), float(0.5), lz));
          let col: N = wall.mul(depthShade);
          // le tableau accroché au fond (l'illustration d'origine) avec sa baguette dorée et son projecteur
          const inset = photo ? 0.06 : 0.1;
          const px = lx.sub(inset).div(1 - 2 * inset), py = ly.sub(inset).div(1 - 2 * inset);
          const inPic = step(0, px).mul(step(px, 1)).mul(step(0, py)).mul(step(py, 1));
          const pic = texture(art.bg, vec2(x0 + 2 * W.hx * 0.0, y0).add(vec2(px.mul(2 * W.hx), py.mul(2 * W.hy))));
          const spot = smoothstep(float(0.9), float(0.2), length(vec2(px.sub(0.5), py.sub(0.55)).mul(vec2(1, 1.2)))).mul(0.5).add(0.6);
          const bd = min(min(px, float(1).sub(px)), min(py, float(1).sub(py)));
          const rimPic = step(float(-0.035), bd).mul(step(bd, float(0))).mul(step(0, px.add(0.035))).mul(step(px.sub(1.035), 0)).mul(step(0, py.add(0.035))).mul(step(py.sub(1.035), 0));
          const frameGold = vec3(0.85, 0.66, 0.3).mul(smoothstep(float(-0.02), float(0.01), bd.negate()).mul(0.5).add(0.5));
          const picCol = pic.rgb.mul(spot);
          col = select(isBack, mix(mix(col, frameGold, rimPic), picCol, inPic), col);
          return col;
        },
      };
    },
    gainless: true,
    build(c) {
      // un peu de la lumière du projecteur déborde sur le cadre, côté fenêtre
      const spill = smoothstep(float(0.06), float(0), windowSDF(c.uv)).mul(c.frame).mul(0.12);
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
    idea: 'La carte est une eau de nuit pleine de plancton : chaque toucher, chaque coup de poignet, allume une traînée bleu-vert qui s’épanouit puis s’éteint lentement, et de minuscules lueurs scintillent dans les ombres quand on bouge.',
    tech: 'ondes ANALYTIQUES (4 derniers touchers) → lueur gaussienne qui s’élargit avec l’âge + réfraction du fond ; plancton = paillettes à facettes dans les zones sombres, densité ∝ énergie ; émissif → bloom',
    cost: '2 T · ~48 ALU',
    reduced: 'une seule lueur à la fois, sans plancton',
    readable: 'lumière additive temporaire, surtout dans les ombres ; sujet à 15 %',
    bloom: 0.8,
    layers(q, _art, I) {
      return { warpBg: (u0) => u0.add(rippleDir(I, q).mul(0.006)) };
    },
    build(c) {
      const glowC = mix(vec3(0.25, 0.95, 0.75), c.accent, 0.25);
      const list = isLow(c) ? [c.I.touches[0]] : c.I.touches;
      let glow: N = float(0);
      for (const tp of list) {
        const d = c.uv.sub(tp.xy).mul(vec2(CARD.w, CARD.h));
        const age = time.sub(tp.z);
        const live = step(float(0), age).mul(exp(age.mul(-0.55))).mul(tp.w);
        const rad = age.mul(0.09).add(0.03);
        const blob = exp(d.length().div(rad).pow(2).negate());
        const ring = abs(ripple(c.I, c.q)).mul(0.6);
        glow = glow.add(blob.mul(live)).add(ring.mul(live).mul(0.3));
      }
      const dark = smoothstep(float(0.45), float(0.08), luminance(c.L.color));
      const plank = isLow(c) ? float(0) : sparkle(c, 120, c.I.energy.mul(0.3).add(0.12), 0.26, 9).mul(dark).mul(c.win).mul(0.8);
      const zone = c.fond.add(c.frame.mul(0.6)).add(c.subj.mul(0.15));
      const add = glowC.mul(glow.mul(0.6).mul(zone).mul(dark.mul(0.6).add(0.4))).add(glowC.mul(plank));
      const tintN = mix(c.L.color, c.L.color.mul(vec3(0.9, 1, 1.05)), c.fond.mul(0.4));
      return { color: tintN.add(add), emissive: add.mul(0.9) };
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

// ── ondes du foil réactif (4 derniers touchers)
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
 * aucun compute) — même code et même coût en WebGPU et en WebGL2. 'border' : naissent sur le pourtour et montent ;
 * 'dust' : poussière lente qui flotte devant la carte.
 */
function sparkSprites(env: FxEnv, count: number, mode: 'border' | 'dust'): Sprite {
  const m = env.bag.add(new SpriteNodeMaterial());
  m.transparent = true;
  m.depthWrite = false;
  m.blending = AdditiveBlending;
  const i = float(instanceIndex);
  const h1 = hash(i.mul(1.13)), h2 = hash(i.mul(2.71).add(4)), h3 = hash(i.mul(5.37).add(9)), h4 = hash(i.mul(7.91).add(13));
  const period = mode === 'border' ? h1.mul(2.5).add(2.2) : h1.mul(6).add(6);
  const life = fract(time.div(period).add(h2));
  let pos: N;
  if (mode === 'border') {
    // point de départ sur le pourtour (périmètre paramétré)
    const s = h3.mul(4);
    const w2 = CARD.w / 2, hh = CARD.h / 2;
    const px = select(s.lessThan(1), s.mul(2).sub(1).mul(w2), select(s.lessThan(2), float(w2), select(s.lessThan(3), float(1).sub(s.sub(2).mul(2)).mul(w2), float(-w2))));
    const py = select(s.lessThan(1), float(-hh), select(s.lessThan(2), s.sub(1).mul(2).sub(1).mul(hh), select(s.lessThan(3), float(hh), float(1).sub(s.sub(3).mul(2)).mul(hh))));
    const out = vec2(px, py).normalize().mul(life.mul(0.12));
    pos = vec3(vec2(px, py).add(out).add(vec2(h4.sub(0.5).mul(0.05), life.mul(0.22).sub(life.mul(life).mul(0.3)))), life.mul(0.1).add(0.01));
  } else {
    const x = h3.sub(0.5).mul(CARD.w * 1.3).add(sin(time.mul(0.3).add(h4.mul(20))).mul(0.03));
    const y = h4.sub(0.5).mul(CARD.h * 1.2).add(life.mul(0.12));
    pos = vec3(x, y, h2.mul(0.2).add(0.02));
  }
  m.positionNode = pos;
  // la rotation : traînée opposée au mouvement (inertie) et plus d'étincelles visibles quand ça bouge
  pos = pos.add(vec3(env.I.lag.mul(vec2(-0.12, -0.12)).mul(life), 0));
  const busy = mode === 'border' ? clamp(env.I.energy.mul(1.4).add(0.35).sub(h4.mul(0.3)), 0, 1) : float(1);
  const fade = smoothstep(0, 0.12, life).mul(smoothstep(1, 0.55, life)).mul(busy);
  const disc = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
  const col = mix(vec3(1, 0.85, 0.55), vec3(0.75, 0.85, 1), h2).mul(mode === 'border' ? 1.6 : 0.9);
  m.colorNode = vec4(col, disc.mul(fade).mul(mode === 'border' ? 1 : 0.5));
  (m as unknown as { emissiveNode: N }).emissiveNode = col.mul(disc.mul(fade)).mul(0.6);
  m.scaleNode = h1.mul(mode === 'border' ? 0.008 : 0.006).add(0.003);
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
void pow;
void cos;
