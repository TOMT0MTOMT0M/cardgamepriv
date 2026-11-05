import { AdditiveBlending, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sprite, SpriteNodeMaterial, type Object3D } from 'three/webgpu';
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
  sqrt,
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
import { dirOf, emboss, film, flickAge, flickPulse, glare, hueRotate, iris, luminance, noise, rot2, sat, screen, sparkle, spectrum, strength, type FxCtx, type LayerOpts, type Q } from './kit';
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
    name: 'Satin',
    idea: 'Un reflet doux glisse avec la rotation : il traîne un peu, déborde puis se pose, et s’étire quand on tourne vite.',
    tech: 'reflet analytique elliptique : centre = lumière + inertie (ressort sous-amorti), grand axe = direction de la vitesse angulaire ; Fresnel factice (plus fort en rasant)',
    cost: '0 T · ~10 ALU',
    reduced: 'reflet fixe, sans suivi',
    readable: 'additif très faible, la teinte ne change pas ; moitié moins sur le sujet',
    build(c) {
      if (isLow(c)) return { color: c.L.color.add(vec3(glare(c, 0.34, vec2(0.32, 0.78)).mul(0.075).mul(c.subj.mul(0.5).oneMinus()))) };
      const at = c.I.light.add(c.I.lag.mul(vec2(0.45, 0.4)));
      const d = c.uv.sub(at).mul(vec2(CARD.w, CARD.h));
      const vd = dirOf(c.I.vel.add(vec2(0.0001, 0)));
      const st = c.I.energy.mul(1.8).add(1);
      const e = vec2(dot(d, vd).div(st), dot(d, vec2(vd.y.negate(), vd.x)).mul(st.sqrt()));
      const g = smoothstep(float(0.34), float(0), length(e)).pow(2);
      const fres = strength(c.I.tilt).mul(0.6).add(0.7);
      return { color: c.L.color.add(vec3(g.mul(0.08).mul(fres).div(st.sqrt()).mul(c.subj.mul(0.5).oneMinus()))) };
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
    name: 'Foil de cadre',
    idea: 'Le cadre irise selon l’angle de vue RÉEL (physique), et les couleurs continuent de couler un instant après l’arrêt.',
    tech: 'film mince physique : épaisseur = diagonale + orientation + inertie, cos θ = angle de vue réel de la carte',
    cost: '1 T · ~14 ALU',
    reduced: 'irisation figée',
    readable: 'cadre et bordure uniquement',
    build(c) {
      const t = tiltOr(c);
      const th = dot(c.uv, vec2(0.6, 0.4)).mul(0.55).add(t.x.mul(0.3)).add(t.y.mul(0.22)).add(c.I.lag.x.mul(0.35)).add(c.I.lag.y.mul(0.25)).add(0.18);
      const f = mix(film(c, th, isLow(c) ? undefined : clamp(c.ndv, 0.35, 1)), c.tint, 0.35);
      const k = strength(t).mul(0.2).add(0.5);
      return { color: mix(c.L.color, screen(c.L.color, f.mul(0.8)), c.frame.mul(k).add(c.edge.mul(0.3))) };
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
      const e = emboss(c.art.frame, c.uv, lightDir(c).negate(), tl.mul(3).add(3), 'r', tl.mul(0.003).add(0.0014)).mul(zone);
      return { color: c.L.color.mul(e.add(1)).add(vec3(1, 0.85, 0.55).mul(groove.mul(tl.mul(0.22).add(0.06)))) };
    },
  },
];

// ═══════════════════════════════════════════════════════════ 3★ RARE — le fond s'anime, le sujet reste intact
const RARE: FxDef[] = [
  {
    num: 11,
    tier: 'rare',
    name: 'Reverse holo',
    idea: 'Tout est holographique SAUF le personnage ; l’arc-en-ciel balaie dans la direction où l’on penche, et tourne avec la carte.',
    tech: 'film mince physique × (1 − sujet) ; axe du dégradé = direction de l’inclinaison (azimut), cos θ réel, inertie',
    cost: '2 T · ~16 ALU',
    reduced: 'holo statique à 50 %',
    readable: 'le sujet détouré n’est jamais touché',
    build(c) {
      const t = tiltOr(c);
      const ax = mix(vec2(0.45, 0.65), dirOf(t.add(vec2(0.0001, 0))).mul(0.8), strength(t, 0.8));
      const th = dot(c.uv, ax).add(noise(c, c.uv.mul(2)).r.mul(0.35)).mul(0.75).add(t.x.mul(0.5)).add(t.y.mul(0.35)).add(c.I.lag.x.mul(0.4));
      const f = film(c, th, isLow(c) ? undefined : clamp(c.ndv, 0.35, 1));
      const k = isLow(c) ? 0.5 : 1;
      return { color: iris(c.L.color, f, c.fond.mul(0.5 * k).add(c.frame.mul(0.3 * k)), 0.08) };
    },
  },
  {
    num: 12,
    tier: 'rare',
    name: 'Glace craquelée',
    idea: 'Le fond est un miroir brisé : chaque éclat a sa propre inclinaison et S’ALLUME quand la carte passe par son angle.',
    tech: 'Voronoï PRÉCALCULÉ ; normale par éclat (hash de l’identifiant) → éclat = alignement orientation·normale ; phase du film par éclat',
    cost: '2 T · ~18 ALU',
    reduced: 'éclats sans changement de phase',
    readable: 'fond uniquement',
    build(c) {
      const cell = texture(c.tex.cells, c.uv.mul(vec2(3 * CARD.w / 0.63, 3 * CARD.h / 0.63)));
      const id = cell.r;
      const t = tiltOr(c);
      const nrm = vec2(hash(id.mul(91.3)), hash(id.mul(47.1).add(3))).mul(2).sub(1);
      const th = id.mul(0.9).add(dot(t, nrm).mul(0.9)).add(t.y.mul(0.3));
      const f = film(c, th);
      const shard = smoothstep(0.04, 0.2, cell.g);
      const lines = smoothstep(0.08, 0, cell.g);
      const o = t.add(c.I.lag.mul(0.8));
      const flash = isLow(c) ? float(0) : smoothstep(float(0.82), float(1), dot(dirOf(o.add(vec2(0.0001, 0))), dirOf(nrm))).mul(strength(o, 0.7));
      const col = iris(c.L.color, f, c.fond.mul(shard).mul(flash.mul(0.25).add(0.4)), 0.06);
      // l'éclat qui s'allume prend la couleur de son film (verre irisé), avec un cœur clair, plutôt qu'un aplat gris
      const glow = f.mul(0.3).add(0.06).mul(flash.mul(shard).mul(c.fond));
      return { color: col.add(vec3(lines.mul(0.16)).mul(c.fond)).add(glow), emissive: glow.mul(0.8) };
    },
  },
  {
    num: 13,
    tier: 'rare',
    name: 'Faisceaux',
    idea: 'Deux nappes de faisceaux arc-en-ciel à deux profondeurs : en tournant, elles glissent à des vitesses différentes — on voit du VOLUME derrière le personnage.',
    tech: 'deux fract(u·n + inclinaison × profondeur) → couleur SPECTRALE vraie ; nappe arrière décalée par l’inertie ; douceur ∝ énergie',
    cost: '1 T · ~14 ALU',
    reduced: 'bandes figées',
    readable: 'fond uniquement',
    build(c) {
      const t = tiltOr(c);
      const soft = c.I.energy.mul(0.15);
      const beams = (x: N) => smoothstep(float(0), soft.add(0.35), x).mul(smoothstep(float(1), soft.negate().add(0.65), x));
      const x1 = fract(c.uv.x.mul(5).add(c.uv.y.mul(0.4)).add(t.x.mul(0.9)));
      let col = iris(c.L.color, spectrum(c, x1), c.fond.mul(beams(x1)).mul(0.45), 0.1);
      if (!isLow(c)) {
        const x2 = fract(c.uv.x.mul(3.1).sub(c.uv.y.mul(0.25)).add(t.x.mul(2.1)).add(c.I.lag.x.mul(0.9)).add(0.37));
        col = iris(col, spectrum(c, x2), c.fond.mul(beams(x2)).mul(0.25), 0.05);
      }
      return { color: col };
    },
  },
  {
    num: 14,
    tier: 'rare',
    name: 'Cosmos',
    idea: 'Anneaux et étoiles holographiques (Cosmos Holo) sur deux plans de profondeur ; les étoiles scintillent quand on tourne la carte, pas toutes seules.',
    tech: 'motif précalculé lu à 2 échelles avec parallaxe différente ; scintillement = sin(chemin cumulé + id) ; film par élément',
    cost: '2 T · ~18 ALU',
    reduced: 'motif figé',
    readable: 'fond uniquement',
    build(c) {
      const t = tiltOr(c);
      const p = texture(c.tex.pattern, c.uv.mul(vec2(2.2, 3.1)).add(t.mul(0.05)));
      const f = film(c, p.g.mul(0.8).add(t.x.mul(0.6)).add(t.y.mul(0.4)));
      const tw = isLow(c) ? float(0.6) : sin(c.I.phase.mul(5).add(time.mul(0.6)).add(p.g.mul(40))).mul(0.5).add(0.5);
      let col = iris(c.L.color, f, c.fond.mul(p.r).mul(0.5), 0.1).add(vec3(p.b.mul(tw).mul(c.fond).mul(0.6)));
      if (!isLow(c)) {
        // plan arrière : motif plus petit, parallaxe ×3
        const p2 = texture(c.tex.pattern, c.uv.mul(vec2(3.6, 5.1)).add(t.mul(0.15)).add(0.31));
        const f2 = film(c, p2.g.mul(0.7).add(t.x.mul(0.9)).add(0.2));
        col = iris(col, f2, c.fond.mul(p2.r).mul(0.25), 0.04);
      }
      return { color: col };
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
    name: 'Prisme croisé',
    idea: 'Deux trames diagonales arc-en-ciel défilent en sens opposés (cartes V) ; plus on penche, plus la trame se resserre en moiré, et elle coule encore un peu après l’arrêt.',
    tech: '2 bandes fract → spectre ; fréquence ∝ inclinaison (moiré), phase + inertie',
    cost: '1–2 T · ~30 ALU',
    reduced: 'une seule trame',
    readable: 'sujet à 20 % au plus',
    build(c) {
      const t = c.I.tilt;
      const band = (x: N) => spectrum(c, x).mul(smoothstep(0, 0.3, x)).mul(smoothstep(1, 0.7, x));
      const fq = isLow(c) ? float(4.5) : strength(t).mul(2.5).add(4);
      const lg = c.I.lag;
      const a = fract(dot(c.uv, vec2(1, 1)).mul(fq).add(t.x.mul(1.2)).add(t.y.mul(0.4)).add(lg.x.mul(1.2)));
      const b = fract(dot(c.uv, vec2(1, -1)).mul(fq).sub(t.x.mul(0.4)).add(t.y.mul(1.2)).add(lg.y.mul(1.2)));
      const tr = isLow(c) ? band(a) : max(band(a), band(b));
      const zone = max(max(c.foil.mul(c.fond).mul(0.6), c.fond.mul(0.45)), c.frame.mul(0.35)).mul(c.subj.mul(0.85).oneMinus());
      const on = max(max(tr.r, tr.g), tr.b);
      return { color: iris(c.L.color, tr, zone.mul(on), 0.12) };
    },
  },
  {
    num: 17,
    tier: 'epic',
    name: 'Gravure arc-en-ciel',
    idea: 'Un guillochis gravé (« etched ») flotte sous la surface : la rosace glisse et tourne avec la carte (torsion comprise), et s’allume en couleur selon l’angle de vue réel.',
    tech: 'guillochis précalculé lu dans un repère tourné (inclinaison + torsion + inertie) et décalé (profondeur) ; relief des lignes ; film mince à cos θ réel',
    cost: '3 T · ~22 ALU',
    reduced: 'lignes en niveaux de gris, sans relief',
    readable: 'gravure sur le fond et le cadre, jamais sur le sujet',
    build(c) {
      const w0 = winUV(c.uv);
      const w = isLow(c) ? w0 : rot2(w0.sub(0.5), c.I.twist.add(c.I.tilt.x.mul(0.25)).add(c.I.lag.x.mul(0.35))).add(0.5).add(c.I.tilt.mul(0.035));
      const ring = texture(c.tex.lines, w).r;
      const hatch = texture(c.tex.lines, c.uv.mul(vec2(1.4, 1.4 * CARD.h / CARD.w))).g;
      if (isLow(c)) return { color: c.L.color.add(vec3(ring.mul(c.fond).add(hatch.mul(c.frame).mul(0.5)).mul(0.18))) };
      const t = c.I.tilt;
      const lit = emboss(c.tex.lines, w, lightDir(c), 1.5, 'r', 0.004);
      const f = film(c, w.x.mul(0.5).add(ring.mul(0.25)).add(t.x.mul(0.7)).add(t.y.mul(0.4)), clamp(c.ndv, 0.35, 1));
      const g = iris(c.L.color, f, ring.mul(c.fond).mul(0.45), 0.06);
      return { color: g.add(vec3(max(lit, 0).mul(0.14)).mul(c.fond)).add(f.mul(hatch).mul(c.frame).mul(0.16)) };
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
    name: 'Éclats d’étoile',
    idea: 'Des facettes de diamant s’allument chacune à son angle ; un coup de poignet fait éclater toute la poussière d’un coup, puis elle s’éteint en scintillant.',
    tech: 'paillettes à facettes sur 2 échelles (approximation des « glints » Deliot–Belcour), facettes comparées à orientation + inertie ; densité ∝ énergie ; salve au coup de poignet',
    cost: '0 T · ~60 ALU',
    reduced: 'une seule échelle, sans scintillement',
    readable: 'densité ≤ 10 % sur le sujet',
    bloom: 0.75,
    build(c) {
      const dens = c.fond.mul(0.22).add(c.frame.mul(0.12)).add(c.subj.mul(0.025));
      const burst = isLow(c) ? float(0) : flickPulse(c, 0.7);
      const s1 = sparkle(c, 85, isLow(c) ? 0.35 : c.I.energy.mul(0.2).add(burst.mul(0.4)).add(0.33), 0.3, 1, !isLow(c));
      const s2 = isLow(c) ? float(0) : sparkle(c, 38, 0.25, 0.26, 2);
      // salve : toutes les cellules allumées sans condition de facette, qui s'éteignent par vagues (hash)
      const all = isLow(c) ? float(0) : sparkle(c, 85, 0.45, 0.28, 4, false).mul(burst.pow(2));
      const g = glare(c, 0.28).mul(0.6).add(0.4);
      const sp = max(max(s1, s2), all).mul(dens.mul(c.I.energy.mul(1.5).add(4))).mul(g);
      return { color: c.L.color.add(vec3(sp.mul(0.9))), emissive: vec3(sp.mul(1.2)) };
    },
  },
  {
    num: 23,
    tier: 'legendary',
    name: 'Nacre physique',
    idea: 'Une nacre fidèle (film mince) : son arc-en-ciel roule dans la direction où l’on penche, et dépend de l’angle de vue réel.',
    tech: 'High : réflectance d’Airy calculée par canal (650/532/450 nm, Belcour & Barla). Mid/Low : table précalculée',
    cost: 'High 1 T · ~70 ALU ; Mid/Low 2 T · ~12 ALU',
    reduced: 'table de film mince',
    readable: 'cadre + fond ; le sujet n’est pas recouvert',
    bloom: 0.4,
    build(c) {
      const roll = isLow(c) ? float(0) : dot(c.uv.sub(0.5), dirOf(c.I.tilt.add(vec2(0.0001, 0)))).mul(strength(c.I.tilt)).mul(0.35);
      const th: N = float(0.28).add(noise(c, c.uv.mul(0.7)).r.mul(0.22)).add(c.uv.y.mul(0.18)).add(c.I.tilt.x.mul(0.15)).add(roll).add(c.I.lag.x.mul(0.2));
      const cosT = clamp(c.ndv.sub(length(c.I.tilt).mul(0.35)), 0.35, 1);
      let nacre: N;
      if (c.q === 'high') {
        // Airy, incidence quasi normale (r = (1−n)/(1+n)), n = 1,45 ; épaisseur 0–1 000 nm
        const n = 1.45, r = (1 - n) / (1 + n), r2 = r * r;
        const sin1 = sqrt(float(1).sub(cosT.mul(cosT)));
        const cos2 = sqrt(float(1).sub(sin1.div(n).pow(2)));
        const d = float(th).mul(1000);
        const R = (l: number) => {
          const cd = cos(d.mul(cos2).mul((4 * Math.PI * n) / l));
          return float(1).sub(cd).mul(2 * r2).div(float(1 + r2 * r2).sub(cd.mul(2 * r2)));
        };
        const rgb = vec3(R(650), R(532), R(450));
        nacre = clamp(rgb.div(max(dot(rgb, vec3(0.2126, 0.7152, 0.0722)), 0.03)).mul(0.5), 0, 1);
      } else nacre = film(c, th, cosT);
      const zone = c.frame.mul(0.45).add(c.fond.mul(0.38));
      return { color: iris(c.L.color, sat(nacre, 0.6), zone, 0.14), emissive: nacre.mul(c.frame).mul(0.05) };
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
    name: 'Polychrome borné',
    idea: 'Les teintes tournent sur toute la carte (Balatro) au fil de la ROTATION : on tourne, les couleurs défilent ; on s’arrête, elles restent ; ±25° au plus sur le personnage.',
    tech: 'rotation de teinte YIQ = bruit + chemin de rotation cumulé + inclinaison + torsion ; amplitude bridée sur le sujet',
    cost: '1 T · ~30 ALU',
    reduced: 'rotation lente, ±10° sur le sujet',
    readable: 'plafond de rotation sur le sujet ; la saturation reste naturelle',
    bloom: 0.5,
    build(c) {
      const nb = noise(c, c.uv.mul(1.2).add(time.mul(0.02))).r;
      const a = isLow(c) ? sin(time.mul(0.3)).mul(0.6) : nb.mul(5).add(c.I.tilt.x.mul(1.5)).add(c.I.tilt.y).add(c.I.phase.mul(0.9)).add(c.I.twist.mul(3));
      const aSub = isLow(c) ? sin(time.mul(0.3)).mul(0.17) : sin(a).mul(0.44);
      const out = mix(sat(hueRotate(c.L.color, a), 1.1), hueRotate(c.L.color, aSub), c.subj);
      return { color: out, emissive: out.mul(c.edge).mul(0.15) };
    },
  },
  {
    num: 27,
    tier: 'mythic',
    name: 'Négatif révélé',
    idea: 'Penchée fortement, le négatif du décor ENTRE par le bord qui descend, comme un liquide, avec un front irisé ; le personnage reste en couleurs.',
    tech: '1 − rgb ; front de révélation = projection sur la direction d’inclinaison comparée à sa force ; front irisé (film mince), inertie',
    cost: '1 T · ~12 ALU',
    reduced: 'négatif à un seuil fixe, sans fondu',
    readable: 'le sujet n’est jamais inversé ; c’est un événement, pas un état',
    bloom: 0.6,
    build(c) {
      const m = length(c.I.tilt);
      const neg = vec3(1).sub(c.L.color);
      const f = film(c, c.uv.y.mul(0.6).add(c.I.tilt.x.mul(0.4)));
      if (isLow(c)) {
        const s0 = step(0.65, m);
        return { color: mix(c.L.color, mix(neg, f, 0.15), s0.mul(c.fond)) };
      }
      const o = c.I.tilt.add(c.I.lag.mul(0.5));
      const proj = dot(c.uv.sub(0.5).mul(vec2(CARD.w, CARD.h)), dirOf(o.add(vec2(0.0001, 0)))).div(CARD.h * 0.5).mul(0.5).add(0.5);
      const front = float(1.15).sub(smoothstep(0.35, 0.95, length(o)).mul(1.4));
      const s = smoothstep(front.sub(0.06), front.add(0.06), proj);
      const lip = smoothstep(float(0.07), float(0), abs(proj.sub(front))).mul(step(float(0.4), m));
      const col = mix(c.L.color, mix(neg, f, 0.15), s.mul(c.fond)).add(f.mul(lip.mul(c.win).mul(0.55)));
      const se = s.max(lip);
      return { color: col.add(f.mul(c.edge.mul(se).mul(0.6))), emissive: f.mul(c.edge.mul(se).add(lip.mul(c.win).mul(0.4))).mul(0.6) };
    },
  },
  {
    num: 28,
    tier: 'mythic',
    name: 'Dispersion',
    idea: 'Les hautes lumières se décomposent en spectre comme sur un vrai réseau de diffraction : chaque angle de vue (horizontal ET vertical) donne sa couleur, la torsion tourne les sillons.',
    tech: 'équation du réseau (d·(sin θi + sin θo) = m·λ), ordres 1 et 2 → couleur spectrale',
    cost: '1–2 T · ~30 ALU',
    reduced: 'ordre 1 seul',
    readable: 'seulement sur les hautes lumières, le cadre et le foil du gabarit',
    bloom: 0.7,
    build(c) {
      const sI = c.I.tilt.x.mul(0.45).add(c.I.lag.x.mul(0.3));
      // réseau 2D : la composante verticale du regard compte aussi, et la torsion fait tourner les sillons
      const g = rot2(vec2(c.V.x, c.V.y.mul(0.6)), c.I.twist);
      const sO = g.x.mul(2.5).add(g.y.mul(0.8)).add(c.uv.x.sub(0.5).mul(0.35));
      const lam = abs(sI.sub(sO)).mul(1600);
      const lobe = (l: N) => spectrum(c, l.sub(380).div(340)).mul(step(380, l)).mul(step(l, float(720)));
      const col = isLow(c) ? lobe(lam) : lobe(lam).add(lobe(lam.div(2)).mul(c.I.energy.mul(0.6).add(0.5)));
      const hl = smoothstep(0.55, 0.85, luminance(c.L.color));
      const zone = max(max(hl.mul(c.subj.mul(0.6).oneMinus()).mul(0.7), c.frame.mul(0.3)), c.foil.mul(c.fond).mul(0.12));
      const add = col.mul(zone).mul(0.4);
      return { color: c.L.color.add(add), emissive: add.mul(0.35) };
    },
  },
  {
    num: 29,
    tier: 'mythic',
    name: 'Lenticulaire animé',
    idea: 'Trois « heures » de la même illustration selon l’angle ; les nervures des lentilles brillent et glissent quand on tourne, la bascule s’adoucit en mouvement.',
    tech: '3 illustrations complètes, choisies et fondues par l’angle de vue ; nervures analytiques',
    cost: '3 T · ~20 ALU',
    reduced: 'une seule vue + scintillement',
    readable: 'chaque vue est une illustration complète et lisible',
    bloom: 0.35,
    async prepare(env) {
      return env.q === 'low' ? {} : { views: await env.makeViews(3) };
    },
    build(c) {
      const views = c.extra.views as CardArt[] | undefined;
      if (!views) {
        const sh = sparkle(c, 60, 0.1, 0.3, 3);
        return { color: c.L.color.add(vec3(sh.mul(0.6))) };
      }
      const ang = atan(c.V.x, c.V.z).mul(1.6).add(c.I.tilt.x.mul(0.5));
      const f = clamp(ang.div(0.8).add(0.5), 0, 0.9999).mul(3);
      const fr = fract(f);
      const tex = (i: number) => texture(views[i].flat).rgb;
      const pick = (k: N) => select(k.lessThan(1), tex(0), select(k.lessThan(2), tex(1), tex(2)));
      const a = pick(f.floor());
      const b = pick(clamp(f.floor().add(1), 0, 2));
      // en mouvement, la bascule entre deux vues s'étale (flou de lentille) ; au repos elle est nette
      const col = mix(a, b, smoothstep(c.I.energy.mul(-0.45).add(0.8), float(1), fr).mul(0.6));
      // nervures : leur reflet glisse avec l'inclinaison (vraies lentilles cylindriques)
      const ridge = sin(c.uv.x.mul(90 * Math.PI).add(c.I.tilt.x.mul(14))).mul(0.04).add(smoothstep(0.92, 1, sin(c.uv.x.mul(90 * Math.PI).add(c.I.tilt.x.mul(14)).add(1.2))).mul(0.06));
      return { color: col.mul(ridge.add(1)) };
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
      const f = film(c, c.uv.x.mul(0.4).add(c.uv.y.mul(0.5)).add(c.I.tilt.x.mul(0.4)));
      return { color: mix(c.L.color, screen(c.L.color, f.mul(0.6)), c.frame.mul(0.35)), emissive: f.mul(c.edge).mul(0.25) };
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
      const f = film(c, c.uv.y.mul(0.5).add(time.mul(0.03)).add(c.I.phase.mul(0.18)));
      return { color: mix(c.L.color, screen(c.L.color, f.mul(0.5)), c.edge.mul(0.8)), emissive: f.mul(c.edge).mul(0.3) };
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
      const f = film(c, c.uv.x.mul(0.3).add(c.uv.y.mul(0.6)).add(c.I.tilt.x.mul(0.5)));
      const bright = smoothstep(0.7, 1.2, luminance(c.L.color)).mul(c.fond);
      return { color: mix(c.L.color, screen(c.L.color, f.mul(0.5)), c.edge.mul(0.7)), emissive: c.L.color.mul(bright).mul(0.8).add(f.mul(c.edge).mul(0.25)) };
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
    name: 'Holo-volume',
    idea: 'Le personnage se lève de la carte en hologramme 3D, en tranches : elles s’écartent quand on tourne, traînent derrière le mouvement (cisaillement) et « décrochent » sur un coup de poignet.',
    tech: 'tranches empilées au-dessus de la fenêtre (le sujet détouré, balayage, scintillement, additif)',
    cost: 'High 6 tranches · Mid 4 · Low 3 (une lecture chacune)',
    reduced: '3 tranches, sans scintillement',
    readable: 'hors de la carte : l’illustration reste intacte dessous',
    bloom: 0.8,
    build(c) {
      // photo (gabarit Bébou : la fenêtre n'est pas celle par défaut) → liseré sur la bordure de la carte
      const glowW = c.photo ? c.edge.mul(0.7) : c.win.mul(smoothstep(0.04, 0, windowSDF(c.uv).negate()));
      return { color: c.L.color.add(vec3(0.3, 0.85, 1).mul(glowW.mul(0.25))), emissive: vec3(0.3, 0.85, 1).mul(glowW.mul(0.35)) };
    },
    attach(env, card) {
      const n = env.q === 'high' ? 6 : env.q === 'mid' ? 4 : 3;
      const g = new Group();
      const geo = env.bag.add(new PlaneGeometry(W.hx * 2 * CARD.w, W.hy * 2 * CARD.h));
      for (let i = 0; i < n; i++) {
        const m = env.bag.add(new MeshBasicNodeMaterial());
        m.transparent = true;
        m.depthWrite = false;
        m.blending = AdditiveBlending;
        const cu = vec2(W.cx - W.hx, W.cy - W.hy).add(uv().mul(vec2(W.hx * 2, W.hy * 2)));
        let s: N;
        if (env.photo) {
          // photo : pas de détourage → buste elliptique centré au tiers haut (visage), qui s'efface vers les bords
          const p = texture(env.art.bg, cu);
          const e = uv().sub(vec2(0.5, 0.6)).mul(vec2(1.5, 1.1));
          s = vec4(p.rgb, smoothstep(float(0.3), float(0.1), length(e)).mul(smoothstep(0.25, 0.6, luminance(p.rgb)).mul(0.6).add(0.4)));
        } else s = texture(env.art.subject, cu);
        const k = i / Math.max(1, n - 1);
        const scan = sin(uv().y.mul(260).sub(time.mul(6)).sub(env.I.phase.mul(14))).mul(0.25).add(0.75);
        const flick = env.q === 'low' ? float(1) : sin(time.mul(23).add(i * 1.7)).mul(0.08).add(0.92);
        const holo = mix(s.rgb, vec3(0.35, 0.9, 1), 0.55 + 0.3 * k);
        // couleur PRÉMULTIPLIÉE par l'alpha : en mélange additif, l'alpha seul ne suffit pas à masquer le rectangle
        const al = s.a.mul((0.5 - k * 0.3) * (env.photo ? 0.55 : 1));
        m.colorNode = vec4(holo.mul(scan).mul(flick).mul(1 - k * 0.55).mul(al), al);
        (m as unknown as { emissiveNode: N }).emissiveNode = holo.mul(s.a).mul(0.25 * (1 - k));
        const mesh = new Mesh(geo, m);
        mesh.position.set((W.cx - 0.5) * CARD.w, (W.cy - 0.5) * CARD.h, 0.012 + k * 0.16);
        mesh.userData.k = k;
        mesh.userData.base = mesh.position.clone();
        g.add(mesh);
      }
      const I = env.I;
      g.userData.update = (t: number) => {
        const e = I.energy.value as number;
        const lg = I.lag.value;
        const rise = (0.75 + 0.25 * Math.sin(t * 0.6)) * (1 + e * 0.9);
        // décrochage : 0,25 s après un coup de poignet, chaque tranche saute de côté
        const ft = env.now() - (I.flick.value as number);
        const glitch = ft >= 0 && ft < 0.25 && env.q !== 'low' ? (1 - ft / 0.25) * 0.02 : 0;
        g.children.forEach((m, i) => {
          const k = m.userData.k as number;
          const b = m.userData.base as { x: number; y: number };
          m.position.z = 0.012 + k * 0.16 * rise;
          // cisaillement : les tranches hautes traînent derrière la rotation
          m.position.x = b.x - lg.x * k * 0.06 + (glitch ? Math.sin(i * 12.9 + t * 90) * glitch : 0);
          m.position.y = b.y - lg.y * k * 0.06;
        });
      };
      card.add(g);
    },
  },
  {
    num: 35,
    tier: 'secret',
    name: 'Foil réactif',
    idea: 'Chaque toucher — ou chaque coup de poignet, depuis le bord qui mène — lance des ondes qui changent l’épaisseur du film : la couleur se propage.',
    tech: 'ondes ANALYTIQUES (4 derniers touchers en uniforms) → épaisseur du film mince + réfraction du fond',
    cost: '2 T · ~45 ALU',
    reduced: 'une seule onde à la fois',
    readable: 'ondes temporaires qui s’amortissent ; sujet à 12 %',
    bloom: 0.6,
    layers(q, _art, I) {
      return { warpBg: (u0) => u0.add(rippleDir(I, q).mul(0.006)) };
    },
    build(c) {
      const rp = ripple(c.I, c.q);
      const th = float(0.35).add(noise(c, c.uv.mul(1.4)).r.mul(0.2)).add(c.I.tilt.x.mul(0.25)).add(c.I.lag.x.mul(0.3)).add(rp.mul(0.3));
      const f = film(c, th);
      const zone = c.fond.mul(abs(rp).mul(0.5).add(c.photo ? 0.12 : 0.28)).add(c.frame.mul(0.3)).add(c.subj.mul(abs(rp)).mul(0.12));
      return { color: iris(c.L.color, f, zone, 0.1), emissive: f.mul(abs(rp)).mul(zone).mul(0.5) };
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
