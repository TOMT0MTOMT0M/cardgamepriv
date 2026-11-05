import { Color, FramebufferTexture, LinearFilter, Vector2, Vector3, Vector4, ViewportTextureNode, type Camera, type NodeFrame, type Object3D, type RenderTarget, type Renderer, type Texture } from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  dot,
  exp,
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
  screenSize,
  screenUV,
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
  /** ne pas composer le sujet (il est dessiné à part, en vrai relief devant la carte — « hors cadre ») */
  noSubject?: boolean;
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
  if (!o.noSubject) col = mix(col, sj.rgb.mul(mix(float(0.7), float(1), ao)), sj.a);
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

/**
 * Garde d'impression (astuce du portage Balatro) : min(high, max(0,5, 1 − low)) — les noirs de l'illustration restent
 * noirs (aucun effet n'y naît), les blancs ne reçoivent que la moitié. Lecture : 0 ALU de texture.
 */
export const printGuard = (base: N): N => {
  const lo = min(min(base.r, base.g), base.b);
  const hi = max(max(base.r, base.g), base.b);
  return min(hi, max(float(0.5), float(1).sub(lo)));
};
/** « Quasi nul de face » (cyze) : l'effet n'existe presque qu'en inclinaison ou en mouvement ; `floor` = reste au repos. */
export const alive = (c: FxCtx, floor = 0.3): N => mix(float(floor), float(1), smoothstep(float(0.04), float(0.5), length(c.I.tilt).add(c.I.energy.mul(0.4))));
/** Éclat « par cellule » : une facette (normale 2D propre) s'allume quand l'orientation (+ inertie) passe par son angle. */
export const cellFlash = (c: FxCtx, nrm: N, sharp = 0.82, lagK = 0.8): N => {
  const o = c.I.tilt.add(c.I.lag.mul(lagK));
  return smoothstep(float(sharp), float(1), dot(dirOf(o.add(vec2(0.0001, 0))), dirOf(nrm))).mul(strength(o, 0.7));
};
/** Reflet d'une boîte à lumière (rectangle arrondi doux) en unités de carte, étiré le long de la vitesse angulaire. */
export const softbox = (c: FxCtx, at: N, half: [number, number], round = 0.04, feather = 0.1): N => {
  const p = c.uv.sub(at).mul(vec2(CARD.w, CARD.h));
  const vd = dirOf(c.I.vel.add(vec2(0.0001, 0)));
  const st = c.I.energy.mul(1.2).add(1);
  const e = vec2(dot(p, vd).div(st), dot(p, vec2(vd.y.negate(), vd.x)));
  const d = length(max(abs(e).sub(vec2(half[0], half[1])), 0)).sub(round);
  return smoothstep(float(feather), float(-0.02), d).div(st.sqrt());
};
/** Bande de lumière (lampe en bande réfléchie) : position le long de `dir` pilotée par `pos`, largeur `w`. */
export const strip = (c: FxCtx, dir: [number, number], pos: N, w: number | N): N => {
  const s = dot(c.uv, vec2(dir[0], dir[1]));
  return exp(s.sub(pos).div(float(w)).pow(2).negate());
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

// ───────────────────────────────────────────── fond d'écran partiel (carte « Cristal »)

/**
 * Copie PARTIELLE du framebuffer (astuce de coattosintetico/holo-cards) : avant de dessiner la carte transparente, on ne
 * copie que le rectangle d'écran qu'elle peut échantillonner (sa boîte englobante projetée + marge de réfraction), pas
 * l'écran entier — un téléphone ne paie pas une copie plein écran par carte.
 *
 * La copie se fait avec `renderer.copyFramebufferToTexture(tex, rect)` (rect = x, y haut-gauche, largeur, hauteur en
 * pixels du tampon) ; la texture a la taille du rectangle et l'UV d'échantillonnage est reconstruit depuis
 * `screenUV` : v = (screenUV.y·H − (H − h − y)) / h — identique en WebGL2 et en WebGPU (three retourne lui-même
 * l'axe v des textures de framebuffer sous WebGPU).
 */
export class CardBackdropNode extends ViewportTextureNode {
  readonly rect = uniform(new Vector4(0, 0, 1, 1));
  /** carte suivie (boîte englobante projetée) et caméra ; `pad` = marge de réfraction en pixels */
  mesh: Object3D | null = null;
  camera: Camera | null = null;
  pad = 24;
  private _corners = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private _size = new Vector2();

  constructor(offset: N = vec2(0, 0)) {
    const rect = uniform(new Vector4(0, 0, 1, 1));
    const su = screenUV.add(offset);
    const uvN = vec2(su.x.mul(screenSize.x).sub(rect.x).div(rect.z), su.y.mul(screenSize.y).sub(screenSize.y.sub(rect.w).sub(rect.y)).div(rect.w));
    const fb = new FramebufferTexture(1, 1);
    fb.minFilter = LinearFilter;
    fb.magFilter = LinearFilter;
    fb.generateMipmaps = false;
    super(clamp(uvN, 0.002, 0.998), null, fb);
    this.rect = rect;
    this.generateMipmaps = false;
  }

  override updateBefore(frame: NodeFrame): boolean | undefined {
    const renderer = frame.renderer as Renderer;
    const rt = renderer.getRenderTarget();
    const reference = (rt ?? renderer.getCanvasTarget()) as (RenderTarget & { getDrawingBufferSize?: (v: Vector2) => Vector2 }) | null;
    const size = this._size;
    if (reference === null) renderer.getDrawingBufferSize(size);
    else if (reference.getDrawingBufferSize) reference.getDrawingBufferSize(size);
    else size.set(reference.width, reference.height);
    // boîte englobante de la carte à l'écran (origine en haut à gauche)
    let x0 = 0, y0 = 0, x1 = size.x, y1 = size.y;
    if (this.mesh && this.camera) {
      const w = CARD.w / 2, h = CARD.h / 2;
      const cs = this._corners;
      cs[0].set(-w, -h, 0);
      cs[1].set(w, -h, 0);
      cs[2].set(w, h, 0);
      cs[3].set(-w, h, 0);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of cs) {
        c.applyMatrix4(this.mesh.matrixWorld).project(this.camera);
        const px = (c.x * 0.5 + 0.5) * size.x, py = (0.5 - c.y * 0.5) * size.y;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      x0 = Math.max(0, Math.floor(minX - this.pad));
      y0 = Math.max(0, Math.floor(minY - this.pad));
      x1 = Math.min(size.x, Math.ceil(maxX + this.pad));
      y1 = Math.min(size.y, Math.ceil(maxY + this.pad));
    }
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    this.rect.value.set(x0, y0, w, h);
    const tex = this.getTextureForReference(reference) as FramebufferTexture;
    // le format doit être celui de la cible (passe en HalfFloat sous post-traitement)
    const refTex = (reference as unknown as { texture?: Texture; textures?: Texture[] } | null);
    const refType = refTex?.textures?.[0]?.type ?? refTex?.texture?.type;
    if (refType != null && tex.type !== refType) {
      tex.type = refType;
      tex.needsUpdate = true;
    }
    if (tex.image.width !== w || tex.image.height !== h) {
      tex.image.width = w;
      tex.image.height = h;
      tex.needsUpdate = true;
    }
    tex.generateMipmaps = false;
    renderer.copyFramebufferToTexture(tex, this.rect.value);
    return undefined;
  }
}
