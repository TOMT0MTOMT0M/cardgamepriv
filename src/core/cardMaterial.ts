import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import {
  Fn,
  abs,
  bumpMap,
  cameraPosition,
  color,
  float,
  length,
  max,
  min,
  mix,
  modelWorldMatrixInverse,
  normalize,
  positionLocal,
  smoothstep,
  texture,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import { CARD } from './cardModel';
import type { N } from './tsl';
import type { CardArt, BackArt } from './art';
import { lenticularLens, type LensNodes } from './lenticular';
import { FRAME_WIN as WIN, BASE_W, BASE_H } from './art';



/** Direction de vue en espace objet (surface → caméra). Pour la face avant, c'est l'espace tangent. */
export const viewDirObject = Fn(() => {
  const camObj = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
  return normalize(camObj.sub(positionLocal));
});

/** Fenêtre d'illustration en UV (centre, demi-taille) et en unités objet. */
export const WINDOW_UV = {
  cx: (WIN.x + WIN.w / 2) / BASE_W,
  cy: 1 - (WIN.y + WIN.h / 2) / BASE_H,
  hx: WIN.w / 2 / BASE_W,
  hy: WIN.h / 2 / BASE_H,
  r: (WIN.r / BASE_W) * CARD.w,
};

/** SDF de la fenêtre (unités objet, négatif à l'intérieur). */
export function windowSDF(uvNode: N): N {
  const p = uvNode.sub(vec2(WINDOW_UV.cx, WINDOW_UV.cy)).mul(vec2(CARD.w, CARD.h));
  const b = vec2(WINDOW_UV.hx * CARD.w, WINDOW_UV.hy * CARD.h);
  const r = float(WINDOW_UV.r);
  const q = abs(p).sub(b).add(r);
  return length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(r);
}

export interface LayerDepths {
  bg: number;
  subject: number;
  fg: number;
}

export const DEFAULT_DEPTHS: LayerDepths = { bg: 0.05, subject: 0.022, fg: -0.004 };

export interface CardLayers {
  color: N;
  window: N;
  frame: N;
  bg: N;
  subject: N;
  fg: N;
  masks: N;
  fx: N;
  view: N;
  uvAt: (depth: number | N) => N;
  /** ombre portée du cadre sur l'illustration (0 = ombre, 1 = libre) */
  ao: N;
  /** (11/11) revêtement lenticulaire (carte `art.lenticular`) : nervures, pour le vernis du matériau */
  lens?: LensNodes;
}

/**
 * Composite des calques avec parallaxe réelle : chaque calque est échantillonné
 * là où le rayon de vue le croise à sa profondeur sous la surface.
 */
export interface LayerOptions {
  /** ombre du bord de fenêtre déduite de l'alpha du cadre (toutes formes de fenêtre) plutôt que du SDF rectangulaire */
  aoFromFrame?: boolean;
}

/** biais de niveau de détail des calques couleur (audit 06/11) — voir cardLayers */
export const MIP_BIAS = float(-0.5);

/**
 * Preset « DOUBLE FACE » (07/11, carte KCDQ Teto) : de face, la première illustration ; en penchant la carte vers la
 * DROITE (souris ou gyroscope), la seconde apparaît par un balayage de gauche à droite, comme une image lenticulaire.
 *  - `from` / `to` : composante x de la direction de vue (≈ sinus de l'angle) entre lesquelles on passe d'une face à
 *    l'autre : 0,10 → 0,30 ≈ 6° → 17° d'inclinaison ;
 *  - `wipe` : étalement du balayage le long de la carte (0 = fondu uniforme).
 * Penchée vers la gauche ou vue de face : toujours la première. Même holo, même relief, mêmes étoiles.
 */
export const DOUBLE_FACE = { from: 0.1, to: 0.3, wipe: 0.12 };
export function doubleFaceMix(V: N, uvNode: N): N {
  const lean = V.x.add(uvNode.x.sub(0.5).mul(DOUBLE_FACE.wipe));
  return smoothstep(float(DOUBLE_FACE.from), float(DOUBLE_FACE.to), lean);
}

export function cardLayers(art: CardArt, depths: LayerDepths = DEFAULT_DEPTHS, uvNode: N = uv(), opts: LayerOptions = {}): CardLayers {
  const V = viewDirObject();
  const k = V.xy.div(max(V.z, 0.22)).mul(vec2(1 / CARD.w, 1 / CARD.h));
  const uvAt = (d: number | N) => uvNode.sub(k.mul(d));
  // (audit 06/11) biais de mip −0,5 sur les calques COULEUR : la carte est souvent vue entre 55 et 80 % de la taille de
  // sa texture (LOD 0,65–0,8 → mélange trilinéaire avec le mip moitié = flou doux permanent) ; −0,5 ramène la lecture
  // vers le mip 0 pour 0 ms (`textureSampleBias` WGSL / `texture(s, uv, bias)` GLSL). Pas sur les masques (relief).
  let bg: N = texture(art.bg, uvAt(depths.bg)).bias(MIP_BIAS);
  let sj: N = texture(art.subject, uvAt(depths.subject)).bias(MIP_BIAS);
  let lens: LensNodes | undefined;
  if (art.lenticular && art.bg2 && art.subject2) {
    // (11/11) LENTICULAIRE : chaque nervure montre la bande de l'image 1 ou de l'image 2 selon l'angle (core/lenticular)
    lens = lenticularLens(V, uvNode);
    const L = lens;
    bg = mix(texture(art.bg, L.uvAt(uvAt(depths.bg))).bias(MIP_BIAS), texture(art.bg2, L.uvAt(uvAt(depths.bg))).bias(MIP_BIAS), L.t);
    bg = vec4(bg.rgb.mul(L.shade), bg.a);
    sj = mix(sj, texture(art.subject2, L.uvAt(uvAt(depths.subject))).bias(MIP_BIAS), L.t);
  } else if (art.bg2 && art.subject2) {
    // (double face) seconde illustration mélangée selon l'inclinaison — un graphe à part pour ces cartes seulement
    const t = doubleFaceMix(V, uvNode);
    bg = mix(bg, texture(art.bg2, uvAt(depths.bg)).bias(MIP_BIAS), t);
    sj = mix(sj, texture(art.subject2, uvAt(depths.subject)).bias(MIP_BIAS), t);
  }
  const fg = texture(art.fg, uvAt(depths.fg)).bias(MIP_BIAS);
  const fr = texture(art.frame, uvNode).bias(MIP_BIAS);
  const masks = texture(art.masks, uvNode);
  const fx = texture(art.fx, uvAt(depths.subject));
  // ombre du bord de fenêtre projetée sur le fond (plus profond = plus d'ombre visible)
  let ao: N;
  if (opts.aoFromFrame) {
    // le cadre flouté (mip) vu à la profondeur du fond = ombre portée du bord, quelle que soit sa forme
    const edge = texture(art.frame, uvAt(depths.bg * 0.6)).level(float(4)).a;
    ao = mix(float(1), float(0.5), smoothstep(float(0.05), float(0.6), edge));
  } else {
    const sd = windowSDF(uvAt(depths.bg * 0.6));
    ao = mix(float(0.45), float(1), smoothstep(float(0.0), float(0.035), sd.negate()));
  }
  let col: N = bg.rgb.mul(ao);
  col = mix(col, sj.rgb.mul(mix(float(0.7), float(1), ao)), sj.a);
  col = mix(col, fg.rgb, fg.a);
  const win = fr.a.oneMinus();
  col = mix(col, fr.rgb, fr.a);
  return { color: col, window: win, frame: fr, bg, subject: sj, fg, masks, fx, view: V, uvAt, ao, ...(lens ? { lens } : {}) };
}

/** Matériau de tranche : carton blanc avec âme sombre (comme les vraies cartes). */
export function createEdgeMaterial(paper = '#e8e2d4', core = '#1d1b1a', opts: { paper?: boolean } = {}): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial();
  if (opts.paper) {
    const y = uv().y;
    const band = smoothstep(float(0.38), float(0.46), y).mul(smoothstep(float(0.62), float(0.54), y));
    m.colorNode = mix(color(new Color(paper)), color(new Color(core)), band);
    m.roughnessNode = float(0.8);
    m.metalnessNode = float(0);
    return m;
  }
  // (retours 06/11) tranche d'une plaque d'aluminium : métal usiné, arêtes un peu plus claires
  // (06/11) tranche arrondie (cardModel.ts) : métal uniforme, le reflet suit l'arc tout seul ; un rien plus mate que
  // les faces (bord usiné, pas poli)
  m.colorNode = color(new Color('#d6d9de'));
  m.roughnessNode = float(0.42);
  m.metalnessNode = float(1);
  return m;
}

/**
 * Dos de carte (retours 06/11) : ALUMINIUM BROSSÉ — métal partout, reflet anisotrope (allongé dans le sens du
 * brossage), gravures CNC en creux mates (R du masque) avec leur relief (G). Aucun vernis plastique.
 * `opts.paper` : l'ancien rendu papier + or (labo).
 */
export function createBackMaterial(back: BackArt, opts: { foil?: number; paper?: boolean } = {}): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial();
  const c = texture(back.color).bias(MIP_BIAS);
  const mk = texture(back.masks);
  if (opts.paper) {
    const foil = mk.r.mul(opts.foil ?? 1);
    m.colorNode = c.rgb;
    m.metalnessNode = foil.mul(0.85);
    m.roughnessNode = mix(float(0.62), float(0.28), foil);
    m.normalNode = bumpMap(mk.g, float(0.6));
    m.clearcoatNode = float(0.25);
    m.clearcoatRoughnessNode = float(0.35);
    return m;
  }
  const cut = mk.r; // gravure
  m.colorNode = c.rgb;
  // (ultra-réalisme) acier brossé vertical : métal pur, reflet étiré le long des stries, plus brillant ; gravure mate
  // (métal à 0,88 : l'acier brossé diffuse un peu le long des stries — en vrai aussi — et reste lisible quand il ne
  // reflète qu'un décor sombre)
  m.metalnessNode = mix(float(0.88), float(0.55), cut);
  // (07/11) anisotropie ORIENTÉE (vec2 en espace tangent = sens où le reflet s'étire, perpendiculaire aux stries) : avant,
  // un nombre simple donnait (a, a) → reflet étiré en DIAGONALE, et `anisotropyRotation` était ignorée par le nœud.
  //  - plaque brossée verticalement → reflet étiré à l'horizontale ;
  //  - lamage (masque B) tourné → stries concentriques, reflet étiré le long du RAYON (l'éclat en étoile qui tourne
  //    avec la lumière, signature d'une pièce usinée).
  const spot = mk.b;
  const d = uv().sub(0.5).mul(vec2(CARD.w / CARD.h, 1));
  const radial = d.div(d.length().max(1e-4));
  const dir = mix(vec2(1, 0), radial, spot);
  // (07/11) fond tourné du « B » gravé : effet un peu plus discret que l'ancien lamage (anisotropie 0,6, rugosité 0,3)
  m.anisotropyNode = dir.mul(mix(mix(float(0.85), float(0.1), cut), float(0.6), spot));
  m.roughnessNode = mix(mix(float(0.34), float(0.68), cut), float(0.3), spot);
  m.sheenNode = float(0.25);
  m.sheenRoughnessNode = float(0.6);
  m.sheenColor = new Color('#ffffff');
  m.normalNode = bumpMap(mk.g, float(1.6));
  return m;
}

/** Face avant "standard" (papier mat + vernis léger), base de nombreuses expériences. */
export function createFrontMaterial(art: CardArt, depths?: LayerDepths): { material: MeshPhysicalNodeMaterial; layers: CardLayers } {
  const m = new MeshPhysicalNodeMaterial();
  const L = cardLayers(art, depths);
  m.colorNode = L.color;
  m.roughnessNode = mix(float(0.58), float(0.32), L.window);
  m.metalnessNode = float(0);
  m.normalNode = bumpMap(L.masks.g, float(0.5));
  m.clearcoatNode = mix(float(0.15), float(0.6), L.window);
  m.clearcoatRoughnessNode = float(0.22);
  m.emissiveNode = L.subject.rgb.mul(L.fx.r).mul(L.subject.a).mul(L.window).mul(0.8);
  return { material: m, layers: L };
}
