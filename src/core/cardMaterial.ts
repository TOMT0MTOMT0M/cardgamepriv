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
}

/**
 * Composite des calques avec parallaxe réelle : chaque calque est échantillonné
 * là où le rayon de vue le croise à sa profondeur sous la surface.
 */
export interface LayerOptions {
  /** ombre du bord de fenêtre déduite de l'alpha du cadre (toutes formes de fenêtre) plutôt que du SDF rectangulaire */
  aoFromFrame?: boolean;
}

export function cardLayers(art: CardArt, depths: LayerDepths = DEFAULT_DEPTHS, uvNode: N = uv(), opts: LayerOptions = {}): CardLayers {
  const V = viewDirObject();
  const k = V.xy.div(max(V.z, 0.22)).mul(vec2(1 / CARD.w, 1 / CARD.h));
  const uvAt = (d: number | N) => uvNode.sub(k.mul(d));
  const bg = texture(art.bg, uvAt(depths.bg));
  const sj = texture(art.subject, uvAt(depths.subject));
  const fg = texture(art.fg, uvAt(depths.fg));
  const fr = texture(art.frame, uvNode);
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
  return { color: col, window: win, frame: fr, bg, subject: sj, fg, masks, fx, view: V, uvAt, ao };
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
  const c = texture(back.color);
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
  m.roughnessNode = mix(float(0.34), float(0.68), cut);
  m.anisotropyNode = mix(float(0.9), float(0.1), cut);
  m.sheenNode = float(0.25);
  m.sheenRoughnessNode = float(0.6);
  m.sheenColor = new Color('#ffffff');
  m.anisotropyRotation = Math.PI / 2; // stries VERTICALES (sens du brossage)
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
