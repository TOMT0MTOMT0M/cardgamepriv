import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, NoColorSpace, SRGBColorSpace, type Texture } from 'three/webgpu';
import { bumpMap, float, mix, normalMap, positionLocal, texture, uv, vec2, vec3, smoothstep, sin } from 'three/tsl';
import { makeCanvas, applyGrain, alpha, roundRect, linear, radial, type Ctx } from './art/canvas';
import { FONT_MONO, FONT_TITLE } from './art/frame';
import { ensureFonts } from './art';
import { encodeNormal, type N } from './tsl';
import { perfMark } from './perfLog';

/**
 * Booster : un peu plus grand qu'une carte, coussin bombé, soudures crantées haut/bas.
 * (07/11) +15 % (0,78 × 1,18 → 0,897 × 1,357) : les cartes rangées dedans ne traversent plus le film aux coins ;
 * le film épouse la pile (plateau de l'épaisseur des 5 cartes, voir createPackGeometry) au lieu de gonfler. La caméra des scènes garde l'ancien cadrage (`PACK_FRAME`) : le booster
 * paraît 15 % plus grand, les cartes gardent leur taille.
 */
export const PACK = { w: 0.897, h: 1.357, bulge: 0.028, crimp: 0.0863 };
/**
 * (07/11) La pile des 5 cartes rangée dans le sachet (style « déchirure », scenes/opening.ts) : demi-largeur et
 * demi-hauteur à l'échelle 0,92, centre vertical. Le plateau du sachet en suit l'empreinte ; `bulge` = sa demi-épaisseur
 * (5 cartes de 1,2 mm espacées de 0,72 mm → ± 20 mm) + le film et un peu de jeu.
 */
export const PACK_STACK = { hw: (0.63 * 0.92) / 2, hh: (0.88 * 0.92) / 2, cy: -0.03, s: 0.92 };
/** cadrage historique des scènes (taille de l'ancien booster) : la caméra et la taille des cartes à l'écran n'ont pas bougé */
export const PACK_FRAME = { w: 0.78, h: 1.18 };

/**
 * (07/11) GRANDS PLIS du sachet aluminium — partagés par la géométrie (relief doux, le reflet se tord) et la carte de
 * hauteur (arête nette du pli). Coordonnées de la toile du visuel (x → droite, y → bas, 0..1). Peu de plis, longs et
 * francs : un film d'aluminium lisse qu'on a tenu en main, pas un paquet de chips froissé.
 *  - un long pli de tension qui part du coin haut-gauche et descend vers le centre ;
 *  - un plus court qui remonte du coin bas-droit (là où le film se pince autour des cartes) ;
 *  - un grand pli oblique très doux qui traverse le plateau (asymétrique : pas d'« enveloppe » en X).
 */
export const BIG_CREASES: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number; amp: number; w: number }> = [
  { x0: 0.08, y0: 0.12, x1: 0.62, y1: 0.55, amp: 1, w: 0.2 },
  { x0: 0.93, y0: 0.88, x1: 0.64, y1: 0.66, amp: 0.8, w: 0.16 },
  { x0: 0.22, y0: 0.74, x1: 0.8, y1: 0.36, amp: 0.35, w: 0.26 },
]
/**
 * (07/11, retours de Tom) PLIS NETS : une seconde famille, par-dessus les grands plis doux (inchangés) — étroits,
 * plus profonds, arête vive de chaque côté (pas de fondu large) : le film a été vraiment cassé à ces endroits. Peu
 * nombreux et placés là où un sachet se marque en vrai : sous la soudure du haut (tension), sur un bord, près d'un coin.
 * Seulement dans la carte de hauteur (trop fins pour la géométrie) : ce sont des lignes de reflet franches.
 */
export const SHARP_CREASES: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number; amp: number; w: number }> = [
  { x0: 0.24, y0: 0.15, x1: 0.71, y1: 0.22, amp: 1, w: 0.032 },
  { x0: 0.96, y0: 0.41, x1: 0.64, y1: 0.53, amp: 0.9, w: 0.028 },
  { x0: 0.1, y0: 0.7, x1: 0.37, y1: 0.86, amp: 0.85, w: 0.03 },
  { x0: 0.47, y0: 0.6, x1: 0.58, y1: 0.79, amp: 0.6, w: 0.024 },
];
/** profil d'un pli net : arête vive, pans presque droits, fin courte aux extrémités */
function sharpRidge(d: number, w: number, t: number): number {
  const e = Math.min(1, t * 9, (1 - t) * 7);
  const k = Math.max(0, 1 - Math.abs(d) / w);
  return Math.pow(k, 1.15) * e * e * (3 - 2 * e);
}
/**
 * Profil d'un grand pli : une ARÊTE (deux pans plans qui se rencontrent en une ligne nette — c'est la cassure du film
 * qui fait le pli, pas un bourrelet) à la distance `d` (même unité que `w`), à la position `t` (0..1) le long du
 * segment ; l'arête s'efface aux extrémités.
 */
function creaseRidge(d: number, w: number, t: number): number {
  const e = Math.min(1, t * 5, (1 - t) * 3.5);
  const k = Math.max(0, 1 - Math.abs(d) / w);
  // k^1,5 : pente franche jusqu'à l'arête (cassure nette, le reflet change d'un coup), raccord doux au bord du pli
  return Math.pow(k, 1.5) * e * (e * (3 - 2 * e));
}
function creaseDistance(c: (typeof BIG_CREASES)[number], x: number, y: number, ax: number) {
  // x, y en coordonnées de toile (0..1) ; ax = rapport largeur/hauteur pour mesurer en distance vraie
  const dx = (c.x1 - c.x0) * ax, dy = c.y1 - c.y0, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - c.x0) * ax * dx + (y - c.y0) * dy) / l2));
  const px = c.x0 * ax + dx * t, py = c.y0 + dy * t;
  return { d: Math.hypot(x * ax - px, y - py), t };
}

export interface PackStyle {
  name: string;
  ground: string;
  ground2: string;
  ink: string;
  foil: string;
  accent: string;
  /** nom imprimé (défaut « Card Lab ») — le jeu y met le nom du booster (« POKEMON », « BÉBOU PACK ») */
  title?: string;
  /** ligne sous le titre (défaut « SÉRIE I · <name> ») */
  series?: string;
  /** mention du bas (défaut « 5 CARTES · DONT 1 RARE OU MIEUX ») */
  tagline?: string;
  /** petites lignes imprimées au dos (défaut : les mentions du labo) */
  backLines?: string[];
  /**
   * (retours 06/11) sachet SIMPLE du jeu : aluminium brossé teinté (« no brand », premium), le logo « BÉBOU cartes »
   * et le nom du pack, rien d'autre ; dos en métal brossé de la même teinte. `ground` = la couleur du sachet.
   */
  simple?: boolean;
}

export const PACK_STYLES: Record<string, PackStyle> = {
  ember: { name: 'Braise', ground: '#1a1513', ground2: '#3a1f17', ink: '#f1e4cf', foil: '#c98a4b', accent: '#e8643a' },
  tide: { name: 'Marée', ground: '#0f1c1c', ground2: '#16342f', ink: '#e8e3d3', foil: '#c7b27a', accent: '#5fa58f' },
  bone: { name: 'Os', ground: '#e7e0d0', ground2: '#cfc5ae', ink: '#1d1a17', foil: '#8a7a5c', accent: '#b4442f' },
};

/**
 * Géométrie du sachet (remodelée 06/11) : face avant (groupe 0) + dos (groupe 1), UV planaires.
 *  - COUSSIN : profil gonflé « plus plat au milieu, qui tombe vite vers les bords » (un sachet rempli de cartes, pas un
 *    ballon) ; les cartes rigides dedans le tiennent plat au centre et le bombent sur ~1,5 cm des bords ;
 *  - SOUDURES latérales : les deux faces se rejoignent à plat sur une fine marge (le film est thermoscellé), avec un
 *    léger retour ondulé ;
 *  - SOUDURES crantées haut / bas : zone PLATE, légèrement rabattue vers l'arrière, avec l'ondulation des crans ;
 *  - FROISSÉ dans la géométrie : quelques grands plis bas-relief (les mêmes familles que la carte de plis) — le reflet
 *    casse déjà sur la silhouette, pas seulement dans la normal map ;
 *  - normales calculées (lissées) : avant, la face était rendue avec des normales planes.
 */
export function createPackGeometry(segX = 36, segY = 56): BufferGeometry {
  const { w, h, bulge, crimp } = PACK;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const cv = crimp / h;
  const sideSeam = 0.028; // marge thermoscellée sur les côtés (unités carte)
  const su = sideSeam / w;
  // (07/11) plus de plis aléatoires : les GRANDS PLIS partagés avec la carte de hauteur, en relief large et doux
  const ax = w / h;
  const foldZ = (u: number, v: number) => {
    let z = 0;
    const x = u, y = 1 - v; // coordonnées de la toile
    for (const c of BIG_CREASES) {
      const { d, t } = creaseDistance(c, x, y, ax);
      z += 0.006 * c.amp * creaseRidge(d, c.w * 1.4, t);
    }
    return z;
  };
  // (07/11, retours de Tom) le film ÉPOUSE LA PILE de 5 cartes au lieu de gonfler en ballon : un plateau plat de
  // l'épaisseur de la pile (PACK.bulge = demi-pile + épaisseur du film + un peu de jeu) sur toute l'empreinte des
  // cartes (+ 12 mm de jeu), puis le film, mi-souple mi-rigide, retombe en S jusqu'aux soudures — net, horizontal,
  // comme un vrai sachet de cartes. Les coins se pincent (produit des deux chutes).
  const box = { x: PACK_STACK.hw + 0.012, yb: PACK_STACK.cy - PACK_STACK.hh - 0.012, yt: PACK_STACK.cy + PACK_STACK.hh + 0.012 };
  const seamX = w / 2 - sideSeam, seamY = h / 2 - crimp;
  const fall = (t: number) => (t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * t * (t * (t * 6 - 15) + 10));
  const prof = (u: number, v: number) => {
    const x = Math.abs((u - 0.5) * w), y = (v - 0.5) * h;
    if (x >= seamX || Math.abs(y) >= seamY) return 0;
    const fx = fall((x - box.x) / (seamX - box.x));
    const fy = y > box.yt ? fall((y - box.yt) / (seamY - box.yt)) : y < box.yb ? fall((box.yb - y) / (seamY + box.yb)) : 1;
    return fx * fy;
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= segY; j++) {
      const v = j / segY;
      for (let i = 0; i <= segX; i++) {
        const u = i / segX;
        const x = (u - 0.5) * w;
        const y = (v - 0.5) * h;
        const inCrimp = v < cv || v > 1 - cv;
        const p = prof(u, v);
        // soudures crantées : ondulation des crans + léger rabat vers l'arrière
        const crimpZ = inCrimp ? 0.0012 * Math.sin(x * 260) - 0.003 * (1 - p) : 0;
        // marge scellée latérale : les faces se touchent (une demi-épaisseur de film), légère ondulation
        const eu = Math.min(u, 1 - u);
        const seamWave = eu < su ? 0.0003 * Math.sin(y * 90) : 0;
        const fold = inCrimp ? 0 : foldZ(u, v) * Math.min(1, p * 1.5);
        const z = side * (bulge * p + 0.0005 + crimpZ + seamWave + fold);
        pos.push(x, y, z);
        uvs.push(side > 0 ? u : 1 - u, v);
      }
    }
    for (let j = 0; j < segY; j++)
      for (let i = 0; i < segX; i++) {
        const a = base + j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
        if (side > 0) idx.push(a, b, d, a, d, c);
        else idx.push(a, d, b, a, c, d);
      }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const half = idx.length / 2;
  g.addGroup(0, half, 0);
  g.addGroup(half, half, 1);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const PW = 640, PH = Math.round((640 * PACK.h) / PACK.w);

/** Police du titre réduite jusqu'à tenir dans `maxW` (« BÉBOU PACK » est plus long que « Card Lab »). */
function fitFont(g: Ctx, text: string, weight: number, size: number, maxW: number, family: string): string {
  let px = size;
  g.font = `${weight} ${px}px ${family}`;
  while (px > 28 && g.measureText(text).width > maxW) {
    px -= 2;
    g.font = `${weight} ${px}px ${family}`;
  }
  return g.font;
}

function crimpBands(g: Ctx, col: string) {
  const ch = (PACK.crimp / PACK.h) * PH;
  for (const y0 of [0, PH - ch]) {
    g.fillStyle = col;
    g.fillRect(0, y0, PW, ch);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 2.5; // (audit 06/11) 1,2 px passait sous le pixel à l'écran du téléphone : gris moiré
    for (let x = 0; x < PW; x += 8) {
      g.beginPath();
      g.moveTo(x, y0 + 3);
      g.lineTo(x, y0 + ch - 3);
      g.stroke();
    }
  }
  return ch;
}

export interface PackArt {
  front: Texture;
  back: Texture;
  /** hauteur du froissé (gris), répétable */
  crinkle: Texture;
  /** R foil, G relief soudures, B zone de déchirure (ligne pointillée) */
  masks: Texture;
  /** dos entièrement métallisé (sachet simple du jeu) */
  metalBack?: boolean;
  /** `crinkle` est la carte du sachet entier (UV 0..1, pas une tuile répétée) */
  fullCrease?: boolean;
  dispose(): void;
}

/** Visuel procédural du booster (marque inventée « Card Lab »). */
export async function generatePackArt(style: PackStyle = PACK_STYLES.ember): Promise<PackArt> {
  await ensureFonts();
  if (style.simple) return simplePackArt(style);
  const F = makeCanvas(PW, PH), B = makeCanvas(PW, PH), M = makeCanvas(PW, PH);
  const g = F.g;
  g.fillStyle = linear(g, 0, 0, PW, PH, [[0, style.ground2], [0.55, style.ground], [1, style.ground]]);
  g.fillRect(0, 0, PW, PH);
  // grand emblème : soleil rayonnant + carte stylisée
  const cx = PW / 2, cy = PH * 0.44;
  g.save();
  g.strokeStyle = alpha(style.foil, 0.55);
  g.lineWidth = 1.2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = 150, r1 = i % 2 ? 260 : 330;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
  }
  g.fillStyle = radial(g, cx, cy, 10, 150, [[0, alpha(style.accent, 0.95)], [1, alpha(style.accent, 0.15)]]);
  g.beginPath();
  g.arc(cx, cy, 140, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = style.foil;
  g.stroke();
  // trois cartes en éventail
  for (let k = -1; k <= 1; k++) {
    g.save();
    g.translate(cx, cy + 40);
    g.rotate(k * 0.28);
    g.fillStyle = k === 0 ? style.ink : alpha(style.ink, 0.75);
    roundRect(g, -52, -150, 104, 146, 8);
    g.fill();
    g.strokeStyle = style.ground;
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = alpha(style.ground, 0.6);
    g.lineWidth = 1.5;
    roundRect(g, -44, -142, 88, 130, 5);
    g.stroke();
    g.restore();
  }
  g.restore();
  // titre
  const title = style.title ?? 'Card Lab';
  const titleFont = fitFont(g, title, 600, 78, PW - 90, FONT_TITLE);
  g.fillStyle = style.ink;
  g.textAlign = 'center';
  g.font = titleFont;
  g.fillText(title, cx, PH * 0.74);
  // (audit 06/11) ≥ 28 px de base : le booster fait ≈ 176 px CSS sur téléphone (1 px CSS = 3,6 px de texture)
  g.font = fitFont(g, style.series ?? `SÉRIE I · ${style.name.toUpperCase()}`, 600, 40, PW - 80, FONT_MONO);
  g.fillStyle = alpha(style.ink, 0.8);
  g.fillText(style.series ?? `SÉRIE I · ${style.name.toUpperCase()}`, cx, PH * 0.785);
  g.font = fitFont(g, style.tagline ?? '5 CARTES · DONT 1 RARE OU MIEUX', 500, 32, PW - 80, FONT_MONO);
  g.fillText(style.tagline ?? '5 CARTES · DONT 1 RARE OU MIEUX', cx, PH * 0.845);
  // ligne de déchirure
  const ch = (PACK.crimp / PACK.h) * PH;
  const tearY = PH - ch - 40;
  g.setLineDash([10, 8]);
  g.strokeStyle = alpha(style.ink, 0.5);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(24, PH - tearY);
  g.lineTo(PW - 24, PH - tearY);
  g.stroke();
  g.setLineDash([]);
  g.font = `500 26px ${FONT_MONO}`;
  g.textAlign = 'left';
  g.fillText('✂ DÉCHIRER ICI', 28, PH - tearY - 12);
  crimpBands(g, style.foil);
  applyGrain(g, PW, PH, 0.08, 9, 40);

  // dos
  const b = B.g;
  b.fillStyle = style.ground;
  b.fillRect(0, 0, PW, PH);
  b.strokeStyle = alpha(style.foil, 0.25);
  for (let i = 0; i < 40; i++) {
    b.beginPath();
    b.arc(PW / 2, PH / 2, 20 + i * 14, 0, Math.PI * 2);
    b.stroke();
  }
  b.fillStyle = alpha(style.ink, 0.8);
  b.textAlign = 'center';
  b.font = `500 24px ${FONT_MONO}`;
  (style.backLines ?? ['Ne convient pas aux dragons de moins de trois ans.', 'Illustrations entièrement procédurales.', 'Fabriqué dans un laboratoire. Avec soin.']).forEach((l, i) =>
    b.fillText(l, PW / 2, PH * 0.68 + i * 36),
  );
  for (let i = 0; i < 46; i++) b.fillRect(PW / 2 - 120 + i * 5.3, PH * 0.82, i % 3 ? 2 : 3.5, 60);
  crimpBands(b, style.foil);
  applyGrain(b, PW, PH, 0.08, 10, 30);

  // masques
  const m = M.g;
  m.fillStyle = '#000';
  m.fillRect(0, 0, PW, PH);
  m.globalCompositeOperation = 'lighter';
  m.fillStyle = 'rgb(255,0,0)';
  m.fillRect(0, 0, PW, ch);
  m.fillRect(0, PH - ch, PW, ch);
  m.strokeStyle = 'rgb(255,0,0)';
  m.lineWidth = 2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    m.beginPath();
    m.moveTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150);
    m.lineTo(cx + Math.cos(a) * (i % 2 ? 260 : 330), cy + Math.sin(a) * (i % 2 ? 260 : 330));
    m.stroke();
  }
  m.lineWidth = 6;
  m.beginPath();
  m.arc(cx, cy, 140, 0, Math.PI * 2);
  m.stroke();
  m.font = titleFont;
  m.textAlign = 'center';
  m.fillText(title, cx, PH * 0.74);
  m.fillStyle = 'rgb(0,255,0)';
  for (const y0 of [0, PH - ch]) for (let x = 0; x < PW; x += 6) m.fillRect(x, y0, 3, ch);
  m.fillStyle = 'rgb(0,0,255)';
  m.fillRect(0, PH - tearY - 2, PW, 4);

  const C = crinkleCanvas();

  // téléphone : anisotropie 4 (le booster est vu presque de face) — moitié moins de lectures par pixel filtré
  const aniso = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 4 : 8;
  const tex = (c: HTMLCanvasElement, color: boolean) => {
    const t = new CanvasTexture(c);
    t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  const front = tex(F.c, true), back = tex(B.c, true), masks = tex(M.c, false), crinkle = tex(C.c, false);
  crinkle.wrapS = crinkle.wrapT = 1000; // RepeatWrapping
  return { front, back, masks, crinkle, dispose: () => [front, back, masks, crinkle].forEach((t) => t.dispose()) };
}

/**
 * Sachet SIMPLE (retours 06/11) : « juste le Bébou Cartes qu'on a en logo + le nom du pack en dessous, un sachet tout
 * simple » — couleur unie avec un reflet doux, logo et nom au centre (le logo et les soudures en foil), aucune autre
 * écriture. Dos : métal brossé de la même teinte, le logo en petit (le matériau le rend entièrement métallique).
 */
async function simplePackArt(style: PackStyle): Promise<PackArt> {
  // (06/11, ultra-réalisme) sachet NU : la couleur de l'aluminium, rien d'écrit. Le froissé est propre au sachet
  // (une carte de hauteur pleine taille, pas une tuile répétée), avec de vrais plis : réseau de plis principaux
  // (arêtes tendues entre points), micro-plis secondaires, bombé du coussin et soudures crantées.
  const F = makeCanvas(PW, PH), B = makeCanvas(PW, PH), M = makeCanvas(PW, PH);
  const base = style.ground;
  const ch = (PACK.crimp / PACK.h) * PH;
  const faces: Array<[Ctx, number]> = [[F.g, 1], [B.g, 2]];
  for (const [g, seed] of faces) {
    const rr = lcg(seed * 7919);
    // alliage teinté : la couleur du pack posée sur l'alu
    g.fillStyle = mixHex(base, '#eceef1', 0.66);
    g.fillRect(0, 0, PW, PH);
    // (07/11) aluminium LISSE : à peine un voile de laminage vertical (le reflet, lui, vient du matériau et de
    // l'environnement — rien de peint : un reflet peint ne bouge pas avec la lumière)
    for (let x = 0; x < PW; x += 1) {
      const v = rr();
      g.fillStyle = v > 0.5 ? alpha('#ffffff', (v - 0.5) * 0.025) : alpha('#000000', (0.5 - v) * 0.03);
      g.fillRect(x, 0, 1, PH);
    }
    crimpBands(g, mixHex(base, '#d9dce1', 0.55));
    applyGrain(g, PW, PH, 0.012, 8, 20);
  }
  // ── masques : R = zones plus lisses (soudures), G = relief des soudures, B = ligne de déchirure (découpe)
  const m = M.g;
  m.fillStyle = '#000';
  m.fillRect(0, 0, PW, PH);
  m.globalCompositeOperation = 'lighter';
  m.fillStyle = 'rgb(255,0,0)';
  m.fillRect(0, 0, PW, ch);
  m.fillRect(0, PH - ch, PW, ch);
  m.fillStyle = 'rgb(0,255,0)';
  for (const y0 of [0, PH - ch]) for (let x = 0; x < PW; x += 6) m.fillRect(x, y0, 3, ch);
  const tearY = PH - ch - 40;
  m.fillStyle = 'rgb(0,0,255)';
  m.fillRect(0, PH - tearY - 2, PW, 4);
  const C = await creaseMap(ch);
  const aniso = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 4 : 8;
  const tex = (c: HTMLCanvasElement, color: boolean) => {
    const t = new CanvasTexture(c);
    t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  const front = tex(F.c, true), back = tex(B.c, true), masks = tex(M.c, false), crinkle = tex(C.c, false);
  crinkle.wrapS = crinkle.wrapT = 1001; // ClampToEdgeWrapping : la carte est celle du sachet entier (pas répétée)
  return { front, back, masks, crinkle, metalBack: true, fullCrease: true, dispose: () => [front, back, masks, crinkle].forEach((t) => t.dispose()) };
}

function lcg(seed: number) {
  let a = seed >>> 0 || 1;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * CARTE DE HAUTEUR du sachet (ultra-réalisme, 06/11) : pleine taille (pas de tuile), 0,5 = plat.
 *  - bombé du coussin (le sachet est gonflé : hauteur maximale au centre, qui retombe vers les soudures) ;
 *  - plis PRINCIPAUX : un réseau de segments tendus entre des points, comme un film métallisé qui a été manipulé —
 *    chaque pli = une arête nette (crête claire d'un côté, creux sombre de l'autre), d'autant plus marquée qu'elle est
 *    longue, avec quelques plis qui rayonnent des coins des soudures (là où un sachet se froisse vraiment) ;
 *  - plis SECONDAIRES : fins, courts, nombreux près des soudures, rares au centre ;
 *  - un très léger grain.
 * Le matériau en fait une normale (bumpMap, échelle forte) : le reflet casse le long de chaque pli.
 */
/**
 * (perf 06/11) La carte des plis ne dépend que de `ch` (tirage à graine fixe, mêmes opérations) : elle est la même pour
 * les cinq sachets → peinte UNE fois et partagée (avant : 5 × des centaines de traits flous, la plus grosse dépense du
 * démarrage et des visuels de boosters générés ensuite pendant la vitrine). Pixels identiques par construction ; chaque
 * booster garde sa propre texture (même toile). Une toile vidée (mémoire) est repeinte.
 */
const creaseCache = new Map<number, { c: HTMLCanvasElement }>();
const creasePending = new Map<number, Promise<{ c: HTMLCanvasElement }>>();
/**
 * (perf 07/11, audit 06/11 §8 ter piste a) La carte des plis rastérisée est GARDÉE d'une visite à l'autre (Cache
 * Storage, PNG sans perte : la toile est opaque, l'aller-retour est exact au pixel) : aux visites suivantes, plus de
 * peinture (v1 : ~140 plis flous + 40 taches + grain, le plus gros poste du chargement ; v2 : calcul pixel par pixel, moins cher mais toujours évité) — une image décodée.
 * CREASE_VERSION : à CHANGER dès que `paintCreaseMap`, `applyGrain` ou PW/PH changent, sinon l'ancienne carte resterait.
 * Le temps de peinture (1re visite) et de relecture sont notés dans perfLog (rapport de chargement, game/diag.ts).
 */
const CREASE_VERSION = 'plis-v3'; // v3 (07/11) : + plis nets · v2 (07/11) : aluminium lisse, trois grands plis (carte calculée pixel par pixel)
const CREASE_STORE = 'bebou-plis';
const creaseKey = (ch: number) => `/__plis/${CREASE_VERSION}-${PW}x${PH}-${Math.round(ch)}.png`;
async function creaseFromCache(ch: number): Promise<{ c: HTMLCanvasElement } | null> {
  if (typeof caches === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  const t0 = performance.now();
  const res = await (await caches.open(CREASE_STORE)).match(creaseKey(ch));
  if (!res) return null;
  const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (bmp.width !== PW || bmp.height !== PH) return null;
  const C = makeCanvas(PW, PH);
  C.g.drawImage(bmp, 0, 0);
  bmp.close();
  perfMark('plis:cache', performance.now() - t0);
  return C;
}
function creaseToCache(ch: number, c: HTMLCanvasElement): void {
  if (typeof caches === 'undefined' || typeof c.toBlob !== 'function') return;
  // encodage et écriture après l'affichage de la boutique (hors du chemin critique)
  const go = () =>
    c.toBlob((blob) => {
      if (!blob) return;
      void caches
        .open(CREASE_STORE)
        .then((cache) => cache.put(creaseKey(ch), new Response(blob, { headers: { 'content-type': 'image/png' } })))
        .catch(() => undefined);
    }, 'image/png');
  if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback(cb: () => void, o?: { timeout: number }): number }).requestIdleCallback(go, { timeout: 8000 });
  else setTimeout(go, 3000);
}
function creaseMap(ch: number): Promise<{ c: HTMLCanvasElement }> {
  const hit = creaseCache.get(ch);
  if (hit && hit.c.width > 0) return Promise.resolve(hit);
  let p = creasePending.get(ch);
  if (p) return p;
  p = (async () => {
    let C: { c: HTMLCanvasElement } | null = null;
    try {
      C = await creaseFromCache(ch);
    } catch {
      C = null; // (cache indisponible, image illisible… : on peint)
    }
    if (!C) {
      const t0 = performance.now();
      C = paintCreaseMap(ch);
      // Canvas2D rastérise à la première lecture : on la force ici (sous l'écran de chargement, où le temps est
      // mesuré) plutôt qu'à la première réduction pour la roue 3D ou au premier envoi au GPU
      makeCanvas(1, 1).g.drawImage(C.c, 0, 0, 1, 1);
      perfMark('plis:peinture', performance.now() - t0);
      try {
        creaseToCache(ch, C.c);
      } catch {
        /* pas de cache : repeinte à la prochaine visite */
      }
    }
    creaseCache.set(ch, C);
    creasePending.delete(ch);
    return C;
  })();
  creasePending.set(ch, p);
  return p;
}
function paintCreaseMap(ch: number): { c: HTMLCanvasElement; g: Ctx } {
  // (07/11) ALUMINIUM LISSE + GRANDS PLIS seulement : plus de réseau de plis, de micro-plis ni de bosses floues (l'effet
  // « paquet de chips »). La hauteur est calculée pixel par pixel (aucun trait flou à rastériser : aussi bien moins
  // cher). Chaque grand pli est une arête nette : pente raide d'un côté (le film cassé), plus douce de l'autre, qui
  // s'efface aux extrémités ; une ondulation très large et très faible évite le miroir parfait (un film n'est jamais
  // plan). Les soudures restent plates (leur cranté vient du masque G).
  const W = PW, H = PH;
  const C = makeCanvas(W, H);
  const g = C.g;
  const img = g.createImageData(W, H);
  const d8 = img.data;
  const ax = PACK.w / PACK.h;
  const y0s = ch / H, y1s = 1 - ch / H;
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / H;
    const inSeam = y < y0s || y > y1s;
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / W;
      let h = 0;
      if (!inSeam) {
        // ondulation de fond : deux grandes vagues obliques, à peine perceptibles dans le reflet
        h += 0.025 * Math.sin(x * 3.1 + y * 1.6 + 0.7) + 0.018 * Math.sin(x * -2.3 + y * 2.9 + 2.1);
        for (const c of BIG_CREASES) {
          const { d, t } = creaseDistance(c, x, y, ax);
          // côté du pli (produit vectoriel) : arête asymétrique — raide d'un côté, douce de l'autre
          const side = (c.x1 - c.x0) * ax * (y - c.y0) - (c.y1 - c.y0) * (x - c.x0) * ax;
          const ww = c.w * (side > 0 ? 0.7 : 1.2);
          h += 0.55 * c.amp * creaseRidge(d, ww, t);
        }
        // plis nets (seconde famille) : même asymétrie, bien plus étroits et plus profonds → arête franche
        for (const c of SHARP_CREASES) {
          const { d, t } = creaseDistance(c, x, y, ax);
          const side = (c.x1 - c.x0) * ax * (y - c.y0) - (c.y1 - c.y0) * (x - c.x0) * ax;
          h += 0.5 * c.amp * sharpRidge(d, c.w * (side > 0 ? 0.75 : 1.25), t);
        }
        // tension près des soudures : léger creux le long de la soudure (le film y est tiré)
        const ds = Math.min(y - y0s, y1s - y);
        h -= 0.08 * Math.exp(-ds / 0.03);
      }
      const v = Math.max(0, Math.min(255, Math.round(128 + h * 127)));
      const o = (j * W + i) * 4;
      d8[o] = d8[o + 1] = d8[o + 2] = v;
      d8[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return C;
}

/** mélange de deux couleurs #rrggbb (k = part de la 2e) */
function mixHex(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), Bc = p(b);
  return `#${A.map((v, i) => Math.round(v + (Bc[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

let crinkleShared: { c: HTMLCanvasElement } | null = null;
/**
 * Froissé : grands plis + froissé fin, cuit une fois (bien moins cher qu'un bruit par pixel). Graine fixe → identique
 * pour tous les boosters : une seule toile partagée (avant : une par booster, 1 Mo et 90 ellipses floutées chacune).
 * Chaque booster garde sa propre texture (libérée avec lui ; une texture jamais affichée n'est jamais envoyée au GPU).
 */
function crinkleCanvas(): { c: HTMLCanvasElement } {
  if (crinkleShared && crinkleShared.c.width > 0) return crinkleShared;
  const C = makeCanvas(512, 512);
  {
    const cg = C.g;
    cg.fillStyle = '#808080';
    cg.fillRect(0, 0, 512, 512);
    const rr = (() => {
      let a = 12345;
      return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    cg.filter = 'blur(14px)';
    for (let i = 0; i < 90; i++) {
      cg.fillStyle = rr() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
      cg.beginPath();
      cg.ellipse(rr() * 512, rr() * 512, 20 + rr() * 90, 8 + rr() * 30, rr() * Math.PI, 0, Math.PI * 2);
      cg.fill();
    }
    cg.filter = 'blur(1.5px)';
    for (let i = 0; i < 70; i++) {
      // arêtes de plis : traits clairs + ombre adjacente
      const x = rr() * 512, y = rr() * 512, a = rr() * Math.PI, l = 40 + rr() * 160;
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      cg.lineWidth = 1 + rr() * 2.5;
      cg.strokeStyle = 'rgba(255,255,255,0.35)';
      cg.beginPath();
      cg.moveTo(x, y);
      cg.quadraticCurveTo(x + dx * 0.5 + (rr() - 0.5) * 30, y + dy * 0.5 + (rr() - 0.5) * 30, x + dx, y + dy);
      cg.stroke();
      cg.strokeStyle = 'rgba(0,0,0,0.3)';
      cg.beginPath();
      cg.moveTo(x + 3, y + 3);
      cg.quadraticCurveTo(x + 3 + dx * 0.5, y + 3 + dy * 0.5, x + 3 + dx, y + 3 + dy);
      cg.stroke();
    }
    cg.filter = 'none';
    applyGrain(cg, 512, 512, 0.25, 4, 0);
  }
  return (crinkleShared = C);
}

/**
 * (07/11) MICRO-TEXTURE du film (retours de Tom : « l'effet miroir brûle les yeux ») : un vrai sachet n'est pas un miroir
 * — le film est laminé (fines stries horizontales) et légèrement « peau d'orange ». Tuile 256 px répétée sur le sachet
 * (≈ 6 × 9) : module la rugosité (le reflet s'adoucit et se casse en grain fin) et donne un relief infime. Partagée.
 */
let microTex: CanvasTexture | null = null;
function microGrain(): CanvasTexture {
  if (microTex) return microTex;
  const N = 256;
  const C = makeCanvas(N, N);
  const img = C.g.createImageData(N, N);
  const r = lcg(31337);
  // bruit de valeur lissé (peau d'orange) + stries de laminage horizontales, tuilable (indices modulo N)
  const grid = 32, cell = N / grid;
  const gv = Array.from({ length: grid * grid }, () => r());
  const val = (x: number, y: number) => {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const at = (i: number, j: number) => gv[((j + grid) % grid) * grid + ((i + grid) % grid)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  const rows = Array.from({ length: N }, () => r());
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // (07/11) stries de laminage plus discrètes (c'est elles qui trahissaient la répétition), deux octaves de bruit
      const v = 0.45 * val(x, y) + 0.25 * val((x * 3) % N, (y * 3) % N) + 0.1 * rows[y] + 0.2 * r();
      const o = (y * N + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255);
      img.data[o + 3] = 255;
    }
  C.g.putImageData(img, 0, 0);
  const t = new CanvasTexture(C.c);
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = 1000; // RepeatWrapping
  t.anisotropy = 4;
  return (microTex = t);
}

/** (07/11) le film plastique au-dessus de l'aluminium est teinté à ~20 % : la teinte du sachet, un peu plus sombre */
export const PLASTIC_TINT = 0.74;

/**
 * (07/11) SURFACE ALUMINIUM du sachet (grand booster, déchirure, labo) — étude du matériau :
 *  - un sachet « aluminium » est un film PET métallisé : une couche d'aluminium SOUS un film transparent TEINTÉ
 *    (≈ 20 % : couleur du sachet × 0,74, le film teinté absorbe aussi un peu de lumière). Deux reflets superposés : le métal (teinte de l'alliage) et le vernis PET
 *    au-dessus (diélectrique, F0 0,04, net mais pas miroir) ;
 *  - le film n'est pas un miroir : laminage + peau d'orange (microGrain) → rugosité 0,15–0,25 sur le plateau (avant
 *    0,09 : reflet aveuglant), vernis 0,1–0,16, et un relief infime qui casse le reflet en grain fin ;
 *  - les GRANDS PLIS cassent la couche métallique : sur l'arête, le métal devient plus mat (micro-fissures) ;
 *  - les soudures thermoscellées (masque R) sont gaufrées : plus mates (0,4), presque sans vernis.
 * `height` = carte de hauteur (0,5 = plat), `seam` = 0..1 soudures, `ridges` = normale des crans. La couleur posée par
 * l'appelant (m.colorNode) est assombrie par le film teinté.
 */
export function aluminiumSurface(m: MeshPhysicalNodeMaterial, height: N, seam: N, ridges: N, bump = 3.4) {
  // (retours de Tom, 07/11 : « un motif qui se répète, pas seamless ») : la tuile est lue deux fois, à deux échelles
  // non commensurables dont l'une tournée (la période apparente devient immense), avec moins de poids → grain
  // aléatoire et discret au lieu d'un motif visible
  const u0 = uv();
  const ca = Math.cos(0.61), sa = Math.sin(0.61);
  const u1 = vec2(u0.x.mul(ca).sub(u0.y.mul(sa)), u0.x.mul(sa).add(u0.y.mul(ca)));
  const g = texture(microGrain(), u0.mul(vec2(5.3, 7.9)).add(vec2(0.17, 0.43))).r.mul(0.55).add(texture(microGrain(), u1.mul(vec2(3.7, 4.1))).r.mul(0.45));
  const n = bumpMap((height as N).add(g.mul(0.0035)), float(bump), normalMap(encodeNormal(ridges)));
  const creaseK = smoothstep(0.7, 0.82, height);
  if (m.colorNode) m.colorNode = (m.colorNode as N).mul(PLASTIC_TINT);
  m.metalnessNode = float(1);
  m.roughnessNode = mix(mix(float(0.16).add(g.mul(0.07)), float(0.34), creaseK), float(0.4), seam);
  m.normalNode = n;
  m.clearcoatNode = mix(float(0.3), float(0.04), seam);
  m.clearcoatRoughnessNode = float(0.1).add(g.mul(0.04));
  m.clearcoatNormalNode = n;
}

/** Matériau de booster : plastique métallisé froissé, soudures crantées. */
export function createPackMaterials(art: PackArt, opts: { crinkle?: number } = {}) {
  const make = (map: Texture, side: 0 | 1) => {
    const m = new MeshPhysicalNodeMaterial();
    const uvn = uv();
    const mk = texture(art.masks, uvn);
    const col = texture(map, uvn);
    // (retours 06/11) sachet simple : le DOS est entièrement métallisé (métal brossé)
    const foil = side === 0 ? mk.r : art.metalBack ? float(1) : smoothstep(0.5, 0.6, mk.g.add(mk.r));
    const ridges = vec3(sin(positionLocal.x.mul(1600)).mul(0.6).mul(mk.g), 0, 1).normalize();
    const crTex = art.fullCrease ? texture(art.crinkle, uvn) : texture(art.crinkle, uvn.mul(vec2(1.6, 2.4)).add(side * 0.37));
    m.colorNode = col.rgb;
    if (art.metalBack) {
      // (07/11) aluminium lisse, grands plis, double reflet métal + vernis (aluminiumSurface)
      aluminiumSurface(m, crTex.r, mk.r, ridges, opts.crinkle ?? 3.4);
    } else {
      m.metalnessNode = mix(float(0.15), float(0.95), foil);
      m.roughnessNode = mix(float(0.36), float(0.2), foil);
      m.normalNode = bumpMap(crTex.r, float(opts.crinkle ?? 1.4), normalMap(encodeNormal(ridges)));
      m.clearcoatNode = float(0.6);
      m.clearcoatRoughnessNode = float(0.12);
    }
    return m;
  };
  return [make(art.front, 0), make(art.back, 1)];
}

export function createPackMesh(art: PackArt, opts?: { crinkle?: number }) {
  const mesh = new Mesh(createPackGeometry(), createPackMaterials(art, opts));
  mesh.name = 'pack';
  return mesh;
}

/** Ligne "déchirer ici" en UV (v), cohérente avec le visuel. */
export const TEAR_V = 1 - ((PACK.crimp / PACK.h) * PH + 40) / PH;
