import { Color, Vector2, Vector4, type Texture } from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  dot,
  float,
  floor,
  fract,
  hash,
  length,
  luminance,
  max,
  min,
  mix,
  pow,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  cos,
  sin,
} from 'three/tsl';
import type { CardArt } from '../../core/art';
import { CARD } from '../../core/cardModel';
import { DEFAULT_DEPTHS, viewDirObject, windowSDF } from '../../core/cardMaterial';
import type { N } from '../../core/tsl';
import type { FxTextures } from './textures';

/** Niveau de qualité (rapport §5) : Low = téléphones modestes / WebGL2 iOS / « effets réduits » ; Mid ; High = PC. */
export type Q = 'low' | 'mid' | 'high';

/** Entrées partagées par toutes les cartes (une seule mise à jour par image). */
export function createInputs() {
  return {
    /** inclinaison lissée −1..1 (souris, toucher ou gyroscope) */
    tilt: uniform(new Vector2()),
    /** lumière virtuelle en UV de carte (doigt / souris sur la carte, sinon déduite de l'inclinaison) */
    light: uniform(new Vector2(0.5, 0.6)),
    /** instant du dernier toucher (s, horloge `time`) */
    tap: uniform(-100),
    /** 4 derniers touchers sur la carte : (u, v, instant, force) — foil réactif */
    touches: [0, 1, 2, 3].map(() => uniform(new Vector4(0.5, 0.5, -100, 0))),
    /** 0..1 : mode « carte vivante » (appui long) */
    immersive: uniform(0),
    // ── rotation (cf. RotationRig) : tout ce qui suit vient de l'orientation RÉELLE de la carte —
    //    souris, gyroscope, glisser-tourner et balancement au repos donnent le même langage
    /** vitesse angulaire lissée (unités d'inclinaison / s) */
    vel: uniform(new Vector2()),
    /** énergie du mouvement 0..1 (montée rapide, retombée lente) */
    energy: uniform(0),
    /** inertie : écart d'un ressort sous-amorti qui suit l'orientation (déborde puis se pose) — liquides, rideaux */
    lag: uniform(new Vector2()),
    /** chemin de rotation cumulé (ne fait qu'augmenter) : les motifs avancent quand on tourne, s'arrêtent sinon */
    phase: uniform(0),
    /** torsion (rad) : rotation autour de la normale (gyroscope α, molette à la souris) */
    twist: uniform(0),
    /** instant (horloge `time`) du dernier « coup de poignet » (rotation brusque) */
    flick: uniform(-100),
    /** direction du coup de poignet (unitaire) */
    flickDir: uniform(new Vector2(1, 0)),
    /** 0..1 : la neige « s'efface » quand on bouge, se reforme au repos (givre) */
    wipe: uniform(0),
  };
}
export type Inputs = ReturnType<typeof createInputs>;

/**
 * Tout le « langage de rotation » de l'expérience, côté CPU (quelques opérations par image, aucune lecture GPU).
 * On lui donne l'orientation effective de la carte (en unités d'inclinaison : 1 = inclinaison maximale) et il en déduit
 * vitesse, énergie, inertie, chemin parcouru et coups de poignet.
 */
export class RotationRig {
  private prev = new Vector2();
  private first = true;
  private lagP = new Vector2();
  private lagV = new Vector2();
  private flickArmed = true;
  private twistV = 0;
  /** torsion à la souris (molette) — revient d'elle-même (ressort) */
  private twistKick = 0;
  /** torsion gyroscope (rad), mise à jour par l'expérience */
  gyroTwist = 0;
  constructor(private I: Inputs) {}
  /** coup de molette / geste de torsion (rad/s ajoutés) */
  kick(v: number) {
    this.twistV += v;
  }

  update(dt: number, rot: Vector2, now: number) {
    const I = this.I;
    dt = Math.max(1 / 240, Math.min(dt, 0.1));
    if (this.first) {
      this.prev.copy(rot);
      this.lagP.copy(rot);
      this.first = false;
    }
    I.tilt.value.set(Math.max(-1.6, Math.min(1.6, rot.x)), Math.max(-1.6, Math.min(1.6, rot.y)));
    // vitesse (lissée sur ~50 ms)
    const vx = (rot.x - this.prev.x) / dt, vy = (rot.y - this.prev.y) / dt;
    this.prev.copy(rot);
    const kv = 1 - Math.exp(-dt / 0.05);
    I.vel.value.x += (vx - I.vel.value.x) * kv;
    I.vel.value.y += (vy - I.vel.value.y) * kv;
    const sp = I.vel.value.length();
    // énergie : attaque ~60 ms, retombée ~0,7 s
    const target = Math.min(1, sp / 4.5);
    const ke = 1 - Math.exp(-dt / (target > I.energy.value ? 0.06 : 0.7));
    I.energy.value += (target - I.energy.value) * ke;
    // chemin cumulé
    I.phase.value += Math.min(sp, 12) * dt;
    // inertie : ressort sous-amorti (≈ 2,2 Hz, amortissement 0,35)
    const w = 2 * Math.PI * 2.2, z = 0.35;
    const ax = (rot.x - this.lagP.x) * w * w - this.lagV.x * 2 * z * w;
    const ay = (rot.y - this.lagP.y) * w * w - this.lagV.y * 2 * z * w;
    this.lagV.x += ax * dt;
    this.lagV.y += ay * dt;
    this.lagP.x += this.lagV.x * dt;
    this.lagP.y += this.lagV.y * dt;
    I.lag.value.set(Math.max(-1, Math.min(1, this.lagP.x - rot.x)), Math.max(-1, Math.min(1, this.lagP.y - rot.y)));
    // coup de poignet : la vitesse franchit un seuil (réarmé quand on ralentit)
    if (this.flickArmed && sp > 5.5) {
      this.flickArmed = false;
      I.flick.value = now;
      I.flickDir.value.set(I.vel.value.x / sp, I.vel.value.y / sp);
    } else if (sp < 2) this.flickArmed = true;
    // givre : bouger efface, l'immobilité reforme (≈ 3 s)
    I.wipe.value = Math.max(0, Math.min(1, I.wipe.value + (Math.min(sp, 6) * 0.35 - 0.33) * dt));
    // torsion : gyroscope + impulsion molette qui revient (ressort)
    this.twistV += (-this.twistKick * 40 - this.twistV * 9) * dt;
    this.twistKick += this.twistV * dt;
    I.twist.value = this.gyroTwist + this.twistKick;
  }
}

/** Calques de la carte, avec parallaxe réelle et possibilité de déformer l'échantillonnage du fond. */
export interface Layers {
  color: N;
  bg: N;
  subject: N;
  fg: N;
  frame: N;
  masks: N;
  fx: N;
  uvAt: (d: number | N) => N;
  bgUV: N;
}

export interface LayerOpts {
  /** multiplicateur de profondeur (parallaxe) */
  depth?: number | N;
  /** déformation de l'UV du fond (encre, profondeur…) */
  warpBg?: (uvBg: N) => N;
  /** remplace la couleur du fond (cosmos…) */
  bgColor?: (rgb: N, uvBg: N) => N;
  /** décalage d'UV du SUJET seul (inertie « gelée » : le personnage traîne derrière la rotation) */
  subjectShift?: N;
}

export function composeLayers(art: CardArt, o: LayerOpts = {}): Layers {
  const V = viewDirObject();
  const k = V.xy.div(max(V.z, 0.22)).mul(vec2(1 / CARD.w, 1 / CARD.h));
  const dm = o.depth ?? 1;
  const uvAt = (d: number | N) => uv().sub(k.mul(float(d).mul(dm)));
  let bgUV = uvAt(DEFAULT_DEPTHS.bg);
  if (o.warpBg) bgUV = o.warpBg(bgUV);
  const bg = texture(art.bg, bgUV);
  const sjUV = o.subjectShift ? uvAt(DEFAULT_DEPTHS.subject).add(o.subjectShift) : uvAt(DEFAULT_DEPTHS.subject);
  const sj = texture(art.subject, sjUV);
  const fg = texture(art.fg, uvAt(DEFAULT_DEPTHS.fg));
  const fr = texture(art.frame, uv());
  const masks = texture(art.masks, uv());
  const fx = texture(art.fx, uvAt(DEFAULT_DEPTHS.subject));
  // ombre du bord de la fenêtre sur le fond
  const sd = windowSDF(uvAt(DEFAULT_DEPTHS.bg * 0.6));
  const ao = mix(float(0.45), float(1), smoothstep(float(0.0), float(0.035), sd.negate()));
  let bgRGB: N = bg.rgb;
  if (o.bgColor) bgRGB = o.bgColor(bgRGB, bgUV);
  let col: N = bgRGB.mul(ao);
  col = mix(col, sj.rgb.mul(mix(float(0.7), float(1), ao)), sj.a);
  col = mix(col, fg.rgb, fg.a);
  col = mix(col, fr.rgb, fr.a);
  return { color: col, bg: vec4(bgRGB, 1), subject: sj, fg, frame: fr, masks, fx, uvAt, bgUV };
}

/**
 * Contexte d'un effet : calques, MASQUES (convention du rapport, reconstruite depuis les calques de la carte) et outils.
 *  - `frame`  : cadre et texte (le cadre est la zone « libre » des petits paliers)
 *  - `fond`   : illustration HORS sujet (G du rapport) — c'est là que vivent les effets 3★–5★
 *  - `subj`   : sujet détouré (A du rapport) — PROTÉGÉ : on n'y touche presque pas avant 6★
 *  - `foil`, `relief`, `glow` : masques du gabarit (R foil, G relief, B émissif du cadre)
 *  - `edge`   : bande de bordure extérieure (code couleur des raretés)
 */
export interface FxCtx {
  q: Q;
  tex: FxTextures;
  art: CardArt;
  I: Inputs;
  L: Layers;
  uv: N;
  V: N;
  /** N·V (la face regarde +Z en espace objet) */
  ndv: N;
  win: N;
  frame: N;
  subj: N;
  fond: N;
  foil: N;
  relief: N;
  glow: N;
  edge: N;
  /** teinte de la rareté, accent clair */
  tint: N;
  accent: N;
  /** photo pleine (Bébous, KCDQ) */
  photo: boolean;
  /** extras préparés par l'effet (vues lenticulaires…) */
  extra: Record<string, unknown>;
}

export function createCtx(q: Q, tex: FxTextures, art: CardArt, I: Inputs, hex: string, accentHex: string, L: Layers, extra: Record<string, unknown> = {}): FxCtx {
  const V = viewDirObject();
  const fr = L.frame.a;
  const win = fr.oneMinus();
  let subj: N, fond: N;
  if (extra.photo) {
    // photo pleine : aucun détourage → la photo entière est le sujet ; les effets ne vivent que dans ses ombres
    // (clé de luminance) et restent légers ailleurs
    const key = mix(float(0.15), float(0.55), smoothstep(float(0.32), float(0.04), luminance(L.color)));
    fond = win.mul(key);
    subj = win.sub(fond);
  } else {
    subj = L.subject.a.mul(win);
    fond = win.mul(subj.oneMinus()).mul(L.fg.a.oneMinus());
  }
  const u = uv();
  const dx = min(u.x, u.x.oneMinus()).mul(CARD.w);
  const dy = min(u.y, u.y.oneMinus()).mul(CARD.h);
  const edge = smoothstep(float(0.022), float(0.012), min(dx, dy));
  return {
    q,
    tex,
    art,
    I,
    L,
    uv: u,
    V,
    ndv: V.z,
    win,
    frame: fr,
    subj,
    fond,
    foil: L.masks.r,
    relief: L.masks.g,
    glow: L.masks.b,
    edge,
    tint: color(new Color(hex)),
    accent: color(new Color(accentHex)),
    photo: !!extra.photo,
    extra,
  };
}

// ───────────────────────────────────────────── outils TSL (peu d'instructions, aucun bruit procédural lourd)

/** Film mince physique : épaisseur 0..1 (→ 0–1 000 nm, en miroir), cos θ. */
export const film = (c: FxCtx, th: N, cosT?: N): N => texture(c.tex.film, vec2(th, cosT ?? c.ndv)).rgb;
/** Couleur spectrale d'une longueur d'onde normalisée 0..1 (380–720 nm). */
export const spectrum = (c: FxCtx, l: N): N => texture(c.tex.spectrum, vec2(clamp(l, 0, 1), 0.5)).rgb;
/** Bruit périodique (4 canaux). */
export const noise = (c: FxCtx, p: N): N => texture(c.tex.noise, p);
/** Mélange « écran » (éclaircit sans écraser). */
export const screen = (a: N, b: N): N => vec3(1).sub(vec3(1).sub(a).mul(vec3(1).sub(b)));

/** Reflet doux centré sur la lumière virtuelle (rayon en unités de carte). */
export function glare(c: FxCtx, radius: number, at?: N): N {
  const p = at ?? c.I.light;
  const d = c.uv.sub(p).mul(vec2(CARD.w, CARD.h)).length();
  return smoothstep(float(radius), float(0), d).pow(2);
}

/**
 * Paillettes : une étoile analytique par cellule (|x|^p + |y|^p, p < 1 : 4 branches — astuce rn.log), allumée quand
 * l'inclinaison passe par l'orientation propre de la paillette (comme une vraie facette) plutôt qu'au hasard du temps.
 */
export function sparkle(c: FxCtx, scale: number, density: number | N, size = 0.32, seed = 0, twinkle = true): N {
  const g = c.uv.mul(vec2(scale * CARD.w, scale * CARD.h));
  const cell: N = floor(g);
  const h1 = hash(cell.x.add(cell.y.mul(157.0)).add(seed * 13.7));
  const h2 = hash(cell.x.mul(3.1).add(cell.y.mul(71.0)).add(seed * 5.3 + 1));
  const h3 = hash(cell.x.mul(7.7).add(cell.y.mul(13.0)).add(seed * 2.9 + 2));
  const dn = float(density);
  const on = smoothstep(float(1).sub(dn), float(1).sub(dn.mul(0.6)), h1);
  const p = fract(g).sub(vec2(h2, h3).mul(0.6).add(0.2));
  const q = abs(p).div(size);
  const star = clamp(float(1).sub(pow(q.x, 0.7).add(pow(q.y, 0.7))), 0, 1);
  if (!twinkle) return star.mul(on);
  // facette : direction propre (h2, h3) — brille quand l'orientation s'en approche ; l'inertie (lag) fait encore
  // scintiller quelques instants après l'arrêt, comme une poudre qui se pose
  const facet = vec2(h2, h3).mul(2).sub(1);
  const a = dot(c.I.tilt.mul(1.6).add(c.I.lag.mul(1.3)).add(vec2(sin(time.mul(0.35).add(h1.mul(30))), cos(time.mul(0.3).add(h2.mul(30)))).mul(0.25)), facet.normalize());
  const flash = smoothstep(float(0.55), float(0.95), a);
  return star.mul(on).mul(flash);
}

/** Rotation de teinte en YIQ (moins chère que HSL : 2 produits matriciels). */
export function hueRotate(rgb: N, a: N): N {
  const Y = dot(rgb, vec3(0.299, 0.587, 0.114));
  const I = dot(rgb, vec3(0.596, -0.274, -0.322));
  const Qc = dot(rgb, vec3(0.211, -0.523, 0.312));
  const ca = cos(a), sa = sin(a);
  const I2 = I.mul(ca).sub(Qc.mul(sa));
  const Q2 = I.mul(sa).add(Qc.mul(ca));
  return vec3(Y.add(I2.mul(0.956)).add(Q2.mul(0.621)), Y.sub(I2.mul(0.272)).sub(Q2.mul(0.647)), Y.sub(I2.mul(1.106)).add(Q2.mul(1.703)));
}

/** Relief éclairé à partir d'un masque de hauteur (2 lectures décalées vers la lumière) : gaufrage, gravure. */
export function emboss(tex: Texture, uvN: N, dir: N, amount: number | N, channel: 'r' | 'g' | 'b' | 'a' = 'g', texel: number | N = 0.0022): N {
  const a = texture(tex, uvN)[channel];
  const b = texture(tex, uvN.add(dir.mul(float(texel))))[channel];
  return a.sub(b).mul(float(amount));
}

/** Direction unitaire sûre (vecteur nul → (1, 0)) et force 0..1 d'un vecteur d'inclinaison. */
export const dirOf = (v: N): N => v.div(max(length(v), 0.0001));
export const strength = (v: N, full = 1): N => clamp(length(v).div(full), 0, 1);
/** Âge (s) du dernier coup de poignet. */
export const flickAge = (c: FxCtx): N => time.sub(c.I.flick);
/** Éclair bref après un coup de poignet (1 → 0 en `dur` s). */
export const flickPulse = (c: FxCtx, dur = 0.5): N => {
  const a = flickAge(c);
  return step(float(0), a).mul(smoothstep(float(dur), float(0), a));
};
/** Rotation 2D d'un vecteur. */
export const rot2 = (p: N, a: N | number): N => {
  const ca = cos(a), sa = sin(a);
  return vec2(p.x.mul(ca).sub(p.y.mul(sa)), p.x.mul(sa).add(p.y.mul(ca)));
};

export const sat = (rgb: N, k: number | N): N => mix(vec3(luminance(rgb)), rgb, k);

/**
 * Irisation « qui respecte l'illustration » : la couleur du film TEINTE l'image (multiplicatif, luminance conservée)
 * au lieu de la recouvrir, plus un léger voile additif. Retour testeurs : « on ne reconnaît plus le design ni les
 * couleurs d'origine » → c'est le mélange par défaut des effets de fond.
 */
export function iris(base: N, f: N, k: number | N, sheen = 0.1): N {
  const fs = sat(f, 0.65);
  const gain = fs.div(max(luminance(fs), 0.05)).mul(0.5).add(0.5); // moyenne ≈ 1 : change la teinte, pas la valeur
  const tinted = base.mul(clamp(gain, 0.4, 1.8)).add(fs.mul(sheen));
  return mix(base, tinted, k);
}
export { luminance };
