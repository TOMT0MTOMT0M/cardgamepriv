import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, NoColorSpace, SRGBColorSpace, type Texture } from 'three/webgpu';
import { bumpMap, float, mix, normalMap, positionLocal, texture, uv, vec2, vec3, smoothstep, sin } from 'three/tsl';
import { makeCanvas, applyGrain, alpha, roundRect, linear, radial, type Ctx } from './art/canvas';
import { FONT_MONO, FONT_TITLE } from './art/frame';
import { FONT_DISPLAY, displayCase } from './fonts';
import { ensureFonts } from './art';
import { encodeNormal, type N } from './tsl';
import { perfMark } from './perfLog';
import { LABEL_RELIEF, moldFront, reliefFromCoverage, type ReliefMap } from './packLabel';
import { CRH, CRW, PACK, PH, PW, creaseMapData, creaseRidge, creaseSigned, lcg, packRestZ } from './packCrease';

/**
 * Booster : un peu plus grand qu'une carte, coussin bombé, soudures crantées haut/bas.
 * (07/11) +15 % (0,78 × 1,18 → 0,897 × 1,357) : les cartes rangées dedans ne traversent plus le film aux coins ;
 * le film épouse la pile (plateau de l'épaisseur des 5 cartes, voir createPackGeometry) au lieu de gonfler. La caméra des scènes garde l'ancien cadrage (`PACK_FRAME`) : le booster
 * paraît 15 % plus grand, les cartes gardent leur taille.
 */
export { PACK } from './packCrease';
export { PACK_STACK } from './packCrease';
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
export const BIG_CREASES: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number; amp: number; w: number; bend?: number }> = [
  { x0: 0.08, y0: 0.12, x1: 0.62, y1: 0.55, amp: 1, w: 0.2, bend: 0.035 },
  { x0: 0.93, y0: 0.88, x1: 0.64, y1: 0.66, amp: 0.8, w: 0.16, bend: -0.025 },
  { x0: 0.22, y0: 0.74, x1: 0.8, y1: 0.36, amp: 0.35, w: 0.26, bend: 0.05 },
]

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
  /**
   * (retours live 6, C1) nom du pack imprimé en NOIR au centre du sachet simple (« World », « Gaming », « Bebou »,
   * « Popculture », « Sport ») — et RIEN d'autre (plus de logo « Bébou Cartes »).
   */
  label?: string;
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
export function createPackGeometry(segX = 36, segY = 56, opts: { folds?: boolean } = {}): BufferGeometry {
  // (07/11) `folds: false` : pas de grands plis FIXES dans la géométrie — la scène d'ouverture déplace les sommets avec
  // la carte de hauteur du sachet affiché (packCreaseLift), propre à chaque booster
  const folds = opts.folds ?? true;
  const { w, h } = PACK;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  // (07/11) plus de plis aléatoires : les GRANDS PLIS partagés avec la carte de hauteur, en relief large et doux
  const ax = w / h;
  const foldZ = (u: number, v: number) => {
    let z = 0;
    const x = u, y = 1 - v; // coordonnées de la toile
    for (const c of BIG_CREASES) {
      const { d, t } = creaseSigned(c, x, y, ax);
      z += 0.006 * c.amp * creaseRidge(d, c.w * 1.4 * (0.55 + 0.45 * Math.sin(Math.PI * t)), t);
    }
    return z;
  };
  // (07/11, retours de Tom) le film ÉPOUSE LA PILE de 5 cartes au lieu de gonfler en ballon : un plateau plat de
  // l'épaisseur de la pile (PACK.bulge = demi-pile + épaisseur du film + un peu de jeu) sur toute l'empreinte des
  // cartes (+ 12 mm de jeu), puis le film, mi-souple mi-rigide, retombe en S jusqu'aux soudures — net, horizontal,
  // comme un vrai sachet de cartes. Les coins se pincent (produit des deux chutes). (10/11) profil dans packCrease.ts
  // (packRestZ), partagé avec le simulateur de déchirure.
  for (const side of [1, -1] as const) {
    const base = pos.length / 3;
    for (let j = 0; j <= segY; j++) {
      const v = j / segY;
      for (let i = 0; i <= segX; i++) {
        const u = i / segX;
        const x = (u - 0.5) * w;
        const y = (v - 0.5) * h;
        const z = packRestZ(u, v, side, folds ? foldZ(u, v) : 0);
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
  /** (07/11 soir) carte de NORMALES des plis (espace tangent, calculée en flottants) : à préférer au bumpMap de `crinkle` */
  creaseNormal?: Texture;
  /** (07/11) normales de la FACE AVANT : les plis + le nom du pack thermoformé (packLabel.ts) — le dos garde `creaseNormal` */
  frontNormal?: Texture;
  /**
   * (07/11) face avant pour les VIGNETTES 2D (pas de lumière 3D) : la couleur avec le relief du nom ombré une fois pour
   * toutes (lumière en haut à gauche) — sans elle, le nom moulé serait presque invisible en 2D.
   */
  thumbFront?: HTMLCanvasElement;
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
  // (retours de Tom, 07/11) face avant : le NOM DU PACK n'est plus imprimé en noir — il est MOULÉ dans le film
  // (relief thermoformé, même matière) (V2 : police Atsuka Montreal, sans reflets dessinés). Le relief passe par
  // les normales de la face avant (plus bas, une fois la carte des plis prête) ; ici on ne garde que sa mise en page.
  let label: { text: string; px: number } | null = null;
  if (style.label) {
    await Promise.race([document.fonts.load(`400 120px ${FONT_DISPLAY}`).catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
    // (V2) une seule capitale à volutes, en tête (« Bébou pack ») : casse posée ici, la toile ne lit pas la règle de la police
    const text = displayCase(style.label);
    const font = fitFont(F.g, text, 400, 132, PW - 120, FONT_DISPLAY);
    label = { text, px: parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '132') };
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
  // graine du froissé : propre à chaque booster (sa teinte et son nom)
  let seed = 7;
  for (const ch2 of `${style.name}|${style.ground}`) seed = (Math.imul(seed, 31) + ch2.charCodeAt(0)) >>> 0;
  const C = await creaseMap(ch, (seed % 9973) + 1);
  const molded = label ? await moldedLabel(F, C.n, label.text, label.px) : null;
  const FN = molded?.normal ?? null;
  const aniso = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 4 : 8;
  const tex = (c: HTMLCanvasElement, color: boolean) => {
    const t = new CanvasTexture(c);
    t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  const front = tex(F.c, true), back = tex(B.c, true), masks = tex(M.c, false), crinkle = tex(C.c, false), creaseNormal = tex(C.n, false);
  const frontNormal = FN ? tex(FN, false) : undefined;
  crinkle.wrapS = crinkle.wrapT = 1001; // ClampToEdgeWrapping : la carte est celle du sachet entier (pas répétée)
  creaseNormal.wrapS = creaseNormal.wrapT = 1001;
  if (frontNormal) frontNormal.wrapS = frontNormal.wrapT = 1001;
  const all = [front, back, masks, crinkle, creaseNormal, ...(frontNormal ? [frontNormal] : [])];
  return { front, back, masks, crinkle, creaseNormal, frontNormal, thumbFront: molded?.thumb, metalBack: true, fullCrease: true, dispose: () => all.forEach((t) => t.dispose()) };
}

/**
 * NOM DU PACK THERMOFORMÉ (07/11) : rastérise le nom (×2), en tire le relief (lettres bombées, reflets de la police
 * creusés — src/core/packLabel.ts), le mêle aux normales des plis dans une carte de normales PROPRE À LA FACE AVANT
 * (pleine définition de la toile : les reflets font 2 à 3 px) et pose un léger ombrage de cavité sur la couleur.
 * La carte des plis partagée (en cache) n'est pas modifiée : on en dessine une copie.
 */
/**
 * (07/11, perf) Le RELIEF du nom (la partie chère : distances euclidiennes sur la rastérisation ×2) est gardé d'une
 * visite à l'autre dans le Cache Storage, en flottants bruts (exact au bit près) — comme la carte des plis. La clé
 * contient le texte, la taille, les réglages de LABEL_RELIEF et LABEL_VERSION : à CHANGER si packLabel.ts change.
 */
// (V2, 08/11) 'nom-v2' : police Atsuka Montreal — la police n'est pas dans la clé, les reliefs Matcha en cache partent
const LABEL_VERSION = 'nom-v3';
const LABEL_STORE = 'bebou-nom-moule';
const labelKey = (text: string, px: number) => `/__nom/${LABEL_VERSION}-${PW}x${PH}-${px}-${encodeURIComponent(text)}-${encodeURIComponent(JSON.stringify(LABEL_RELIEF))}.bin`;
async function labelFromCache(text: string, px: number): Promise<ReliefMap | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const r = await (await caches.open(LABEL_STORE)).match(labelKey(text, px));
    if (!r) return null;
    const a = new Float32Array(await r.arrayBuffer());
    const [w, hgt, top, highlights, counters] = a;
    if (!(w > 0 && hgt > 0) || a.length !== 5 + w * hgt) return null;
    return { w, hgt, top, highlights, counters, h: a.slice(5) };
  } catch {
    return null;
  }
}
function labelToCache(text: string, px: number, r: ReliefMap) {
  try {
    if (typeof caches === 'undefined') return;
    const a = new Float32Array(5 + r.h.length);
    a.set([r.w, r.hgt, r.top, r.highlights, r.counters]);
    a.set(r.h, 5);
    void caches
      .open(LABEL_STORE)
      .then(async (c) => {
        // une seule version gardée : les anciennes clés (autre version, autres réglages) partent
        for (const k of await c.keys()) if (!k.url.includes(`/__nom/${LABEL_VERSION}-`)) void c.delete(k);
        await c.put(labelKey(text, px), new Response(a.buffer, { headers: { 'content-type': 'application/octet-stream' } }));
      })
      .catch(() => {});
  } catch {
    /* pas de cache : recalculé à la prochaine visite */
  }
}

async function moldedLabel(F: { c: HTMLCanvasElement; g: Ctx }, creaseN: HTMLCanvasElement, text: string, px: number): Promise<{ normal: HTMLCanvasElement; thumb: HTMLCanvasElement }> {
  const t0 = performance.now();
  const ss = LABEL_RELIEF.ss;
  F.g.font = `400 ${px}px ${FONT_DISPLAY}`;
  const tw = F.g.measureText(text).width;
  const pad = Math.round(px * 0.3);
  const w = Math.min(PW, Math.ceil(tw + 2 * pad)), h = Math.ceil(px * 1.5 + 2 * pad);
  const x0 = Math.round(PW / 2 - w / 2), y0 = Math.round(PH * 0.5 - h / 2);
  let relief = await labelFromCache(text, px);
  const cached = !!relief && relief.w === w && relief.hgt === h; // même mise en page que la toile actuelle
  if (!cached) relief = null;
  // couverture du texte (rastérisation ×2 avec la police du jeu : quelques ms, sur le thread principal)
  let cov: Uint8ClampedArray | undefined;
  if (!relief) {
    const L = makeCanvas(w * ss, h * ss);
    L.g.fillStyle = '#fff';
    L.g.font = `400 ${px * ss}px ${FONT_DISPLAY}`;
    L.g.textAlign = 'center';
    L.g.textBaseline = 'middle';
    L.g.fillText(text, (PW / 2 - x0) * ss, (PH * 0.5 - y0) * ss);
    const id = L.g.getImageData(0, 0, w * ss, h * ss).data;
    cov = new Uint8ClampedArray(w * ss * h * ss);
    for (let k = 0; k < cov.length; k++) cov[k] = id[k * 4 + 3];
    L.c.width = L.c.height = 0; // libère la toile tout de suite (iOS)
  }
  const cn = (creaseN.getContext('2d') as Ctx).getImageData(0, 0, CRW, CRH).data;
  // (07/11, perf) relief + mélange aux normales des plis : dans le WORKER (repli : ici, mêmes fonctions)
  let out: { normal: Uint8ClampedArray; ao: Float32Array; shade: Float32Array; relief?: ReliefMap };
  let where = 'worker';
  try {
    // seules les normales sont TRANSFÉRÉES (relues sur la toile au besoin) ; relief et couverture sont copiés (petits)
    // pour rester utilisables par le repli
    out = await inWorker({ kind: 'mold', creaseN: cn, x0, y0, px, relief: relief ?? undefined, cov, covW: w * ss, covH: h * ss }, [cn.buffer]);
  } catch {
    where = 'principal';
    // le worker a emporté les normales : on les relit sur la toile
    const cn2 = (creaseN.getContext('2d') as Ctx).getImageData(0, 0, CRW, CRH).data;
    const rel = relief ?? (cov ? reliefFromCoverage(cov, w * ss, h * ss, px) : null);
    if (!rel) throw new Error('relief du nom indisponible');
    out = { ...moldFront(cn2, CRW, CRH, PW, PH, rel, x0, y0), relief: relief ? undefined : rel };
  }
  if (out.relief) labelToCache(text, px, out.relief);
  const rw = w, rh = h;
  const N = makeCanvas(PW, PH);
  N.g.putImageData(new ImageData(out.normal as Uint8ClampedArray<ArrayBuffer>, PW, PH), 0, 0);
  // ombrage de cavité (au pied des lettres) : la même teinte, juste un peu d'ombre portée
  const fimg = F.g.getImageData(x0, y0, rw, rh);
  for (let k = 0; k < rw * rh; k++) {
    const a = out.ao[k];
    if (a >= 0.999) continue;
    fimg.data[k * 4] *= a;
    fimg.data[k * 4 + 1] *= a;
    fimg.data[k * 4 + 2] *= a;
  }
  F.g.putImageData(fimg, x0, y0);
  // vignette 2D : la même face, le relief éclairé une fois (lumière haut-gauche), seulement sur la zone du nom
  const T = makeCanvas(PW, PH);
  T.g.drawImage(F.c, 0, 0);
  const timg = T.g.getImageData(x0, y0, rw, rh);
  for (let k = 0; k < rw * rh; k++) {
    const sh = out.shade[k];
    if (!sh) continue;
    for (let c = 0; c < 3; c++) timg.data[k * 4 + c] = Math.max(0, Math.min(255, timg.data[k * 4 + c] * sh));
  }
  T.g.putImageData(timg, x0, y0);
  perfMark(`nom moulé ${text}${cached ? ' (cache)' : ''} · ${where}`, performance.now() - t0);
  return { normal: N.c, thumb: T.c };
}

// ── WORKER des sachets (07/11, perf mesurée sur téléphone) : un seul, créé à la 1re demande ; en cas d'échec
// (navigateur sans worker module, erreur, pas de réponse en 20 s), les calculs se font sur le thread principal
type WorkerReply = { id: number; ok: boolean; error?: string } & Record<string, unknown>;
let packW: Worker | null | undefined;
let packJob = 0;
const packPending = new Map<number, { res: (v: WorkerReply) => void; rej: (e: Error) => void }>();
function packWorker(): Worker | null {
  if (packW !== undefined) return packW;
  try {
    packW = new Worker(new URL('./packWorker.ts', import.meta.url), { type: 'module' });
    packW.onmessage = (e: MessageEvent<WorkerReply>) => {
      const p = packPending.get(e.data.id);
      if (!p) return;
      packPending.delete(e.data.id);
      if (e.data.ok) p.res(e.data);
      else p.rej(new Error(e.data.error ?? 'worker'));
    };
    packW.onerror = () => {
      packPending.forEach((p) => p.rej(new Error('worker')));
      packPending.clear();
      packW?.terminate();
      packW = null;
    };
  } catch {
    packW = null;
  }
  return packW;
}
function inWorker<T>(job: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const w = packWorker();
  if (!w) return Promise.reject(new Error('pas de worker'));
  const id = ++packJob;
  return new Promise<T>((res, rej) => {
    const timer = setTimeout(() => {
      packPending.delete(id);
      rej(new Error('worker muet'));
    }, 20000);
    packPending.set(id, {
      res: (v) => (clearTimeout(timer), res(v as unknown as T)),
      rej: (e) => (clearTimeout(timer), rej(e)),
    });
    w.postMessage({ ...job, id }, transfer);
  });
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
const creaseCache = new Map<string, CreaseMaps>();
const creasePending = new Map<string, Promise<CreaseMaps>>();
/**
 * (perf 07/11, audit 06/11 §8 ter piste a) La carte des plis rastérisée est GARDÉE d'une visite à l'autre (Cache
 * Storage, PNG sans perte : la toile est opaque, l'aller-retour est exact au pixel) : aux visites suivantes, plus de
 * peinture (v1 : ~140 plis flous + 40 taches + grain, le plus gros poste du chargement ; v2 : calcul pixel par pixel, moins cher mais toujours évité) — une image décodée.
 * CREASE_VERSION : à CHANGER dès que `paintCreaseMap`, `applyGrain` ou PW/PH changent, sinon l'ancienne carte resterait.
 * Le temps de peinture (1re visite) et de relecture sont notés dans perfLog (rapport de chargement, game/diag.ts).
 */
const CREASE_VERSION = 'plis-v11'; // v10 (07/11) : surface lisse ondulée + arêtes fines (facettes à 30 %) · v8 (07/11, nuit) : froissé en facettes (mosaïque fine, plus de plis nets) · v4 (07/11 soir) : plis courbes, effilés, anticrénelés + carte de NORMALES en flottants · v3 : + plis nets · v2 : aluminium lisse, trois grands plis
const CREASE_STORE = 'bebou-plis';
const creaseKey = (ch: number, seed: number, kind: 'h' | 'n') => `/__plis/${CREASE_VERSION}-${CRW}x${CRH}-${Math.round(ch)}-s${seed}-${kind}.png`;
type CreaseMaps = { c: HTMLCanvasElement; n: HTMLCanvasElement };
async function creaseFromCache(ch: number, seed: number): Promise<CreaseMaps | null> {
  if (typeof caches === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  const t0 = performance.now();
  const cache = await caches.open(CREASE_STORE);
  const [rh, rn] = await Promise.all([cache.match(creaseKey(ch, seed, 'h')), cache.match(creaseKey(ch, seed, 'n'))]);
  if (!rh || !rn) return null;
  const load = async (r: Response) => {
    const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    if (bmp.width !== CRW || bmp.height !== CRH) return null;
    const C = makeCanvas(CRW, CRH);
    C.g.drawImage(bmp, 0, 0);
    bmp.close();
    return C.c;
  };
  const [c, n] = await Promise.all([load(rh), load(rn)]);
  if (!c || !n) return null;
  perfMark('plis:cache', performance.now() - t0);
  return { c, n };
}
function creaseToCache(ch: number, seed: number, m: CreaseMaps): void {
  if (typeof caches === 'undefined' || typeof m.c.toBlob !== 'function') return;
  // encodage et écriture après l'affichage de la boutique (hors du chemin critique)
  const put = (cv: HTMLCanvasElement, kind: 'h' | 'n') =>
    cv.toBlob((blob) => {
      if (!blob) return;
      void caches
        .open(CREASE_STORE)
        .then((cache) => cache.put(creaseKey(ch, seed, kind), new Response(blob, { headers: { 'content-type': 'image/png' } })))
        .catch(() => undefined);
    }, 'image/png');
  const go = () => (put(m.c, 'h'), put(m.n, 'n'));
  if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback(cb: () => void, o?: { timeout: number }): number }).requestIdleCallback(go, { timeout: 8000 });
  else setTimeout(go, 3000);
}
function creaseMap(ch: number, seed: number): Promise<CreaseMaps> {
  const key = `${Math.round(ch)}|${seed}`;
  const hit = creaseCache.get(key);
  if (hit && hit.c.width > 0 && hit.n.width > 0) return Promise.resolve(hit);
  let p = creasePending.get(key);
  if (p) return p;
  p = (async () => {
    let C: CreaseMaps | null = null;
    try {
      C = await creaseFromCache(ch, seed);
    } catch {
      C = null; // (cache indisponible, image illisible… : on calcule)
    }
    if (!C) {
      const t0 = performance.now();
      // (07/11, perf) peinte dans le WORKER (le thread principal reste libre) ; repli : ici, mêmes calculs
      try {
        C = creaseCanvases(await inWorker<{ h: Uint8ClampedArray; n: Uint8ClampedArray }>({ kind: 'crease', ch, seed }));
        perfMark('plis:worker', performance.now() - t0);
      } catch {
        C = paintCreaseMap(ch, seed);
        perfMark('plis:peinture', performance.now() - t0);
      }
      try {
        creaseToCache(ch, seed, C);
      } catch {
        /* pas de cache : recalculée à la prochaine visite */
      }
    }
    creaseCache.set(key, C);
    creasePending.delete(key);
    return C;
  })();
  creasePending.set(key, p);
  return p;
}
/**
 * Hauteur du film en un point (coordonnées de toile 0..1), en FLOTTANTS — la même fonction sert à la carte de hauteur
 * (rugosité, déchirure) et à la carte de NORMALES (le relief vu par la lumière).
 * (07/11 soir, retours de Tom : « les creases sont extrêmement mal faites, surtout sur les modèles basse définition »)
 *  - avant : la normale venait d'un bumpMap sur une hauteur 8 bits → paliers en escalier le long des pentes (bien
 *    visibles à l'échelle forte), et sur les mini-boosters (192 px, petits à l'écran) un bruit de dérivées d'écran ;
 *  - les plis étaient des segments à la règle, de largeur constante, au profil en V pointu (crénelé sur l'arête).
 * Maintenant : chaque pli est légèrement COURBE (le film se tord), s'EFFILE vers ses bouts, son arête est arrondie
 * sur ~1 px (anticrénelage) ; la normale est calculée en flottants (différences centrées) puis encodée : aucune marche.
 */
/** carte des plis peinte sur le thread principal (repli quand le worker n'est pas disponible) — mêmes calculs */
function paintCreaseMap(ch: number, seed: number): CreaseMaps {
  return creaseCanvases(creaseMapData(ch, seed));
}
function creaseCanvases(d: { h: Uint8ClampedArray; n: Uint8ClampedArray }): CreaseMaps {
  const C = makeCanvas(CRW, CRH), N = makeCanvas(CRW, CRH);
  C.g.putImageData(new ImageData(d.h as Uint8ClampedArray<ArrayBuffer>, CRW, CRH), 0, 0);
  N.g.putImageData(new ImageData(d.n as Uint8ClampedArray<ArrayBuffer>, CRW, CRH), 0, 0);
  return { c: C.c, n: N.c };
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
export function aluminiumSurface(m: MeshPhysicalNodeMaterial, height: N, seam: N, ridges: N, bump = 3.4, creaseN?: N) {
  // (retours de Tom, 07/11 : « un motif qui se répète, pas seamless ») : la tuile est lue deux fois, à deux échelles
  // non commensurables dont l'une tournée (la période apparente devient immense), avec moins de poids → grain
  // aléatoire et discret au lieu d'un motif visible
  const u0 = uv();
  const ca = Math.cos(0.61), sa = Math.sin(0.61);
  const u1 = vec2(u0.x.mul(ca).sub(u0.y.mul(sa)), u0.x.mul(sa).add(u0.y.mul(ca)));
  const g = texture(microGrain(), u0.mul(vec2(5.3, 7.9)).add(vec2(0.17, 0.43))).r.mul(0.55).add(texture(microGrain(), u1.mul(vec2(3.7, 4.1))).r.mul(0.45));
  // (07/11 soir) relief des plis : la carte de NORMALES (flottants, aucune marche) quand elle existe, mêlée aux crans des
  // soudures (« whiteout » : pentes additionnées) ; le grain du film reste un bumpMap infime par-dessus
  let base: N = normalMap(encodeNormal(ridges));
  if (creaseN) {
    const cn = (creaseN as N).xyz.mul(2).sub(1);
    const k = float(bump / 3.4);
    base = normalMap(encodeNormal(vec3(cn.x.mul(k).add(ridges.x), cn.y.mul(k).add(ridges.y), cn.z.mul(ridges.z)).normalize()));
  }
  const n = creaseN ? bumpMap(g.mul(0.0035), float(bump), base) : bumpMap((height as N).add(g.mul(0.0035)), float(bump), base);
  const creaseK = smoothstep(0.7, 0.82, height);
  if (m.colorNode) m.colorNode = (m.colorNode as N).mul(PLASTIC_TINT);
  m.metalnessNode = float(1);
  m.roughnessNode = mix(mix(float(0.16).add(g.mul(0.07)), float(0.34), creaseK), float(0.4), seam);
  m.normalNode = n;
  m.clearcoatNode = mix(float(0.3), float(0.04), seam);
  m.clearcoatRoughnessNode = float(0.1).add(g.mul(0.04));
  m.clearcoatNormalNode = n;
}

/**
 * (07/11, retours de Tom : « les creases sont aléatoires sur les mini boosters, pas sur les boosters principaux ») le
 * RELIEF des plis dans la géométrie, lu dans la carte de hauteur du sachet (`crinkle`, propre à chaque booster) au lieu
 * des grands plis fixes de createPackGeometry : à utiliser avec `createPackGeometry(…, { folds: false })`.
 * `h` = nœud de texture de la carte de hauteur lu au niveau 0 (étage des sommets). Renvoie le décalage en z (unités
 * scène, vers l'extérieur de la face) : ≈ 6 mm pour un grand pli, nul sur les soudures.
 */
export function packCreaseLift(h: N, u: N): N {
  const height = (h as N).r.sub(128 / 255).mul(255 / 127); // 0,5 = plat (paintCreaseMap)
  const edge = smoothstep(0.02, 0.09, (u as N).min((u as N).oneMinus()));
  return height.mul(0.006 / 0.28).mul(edge);
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
      const crN = side === 0 && art.frontNormal ? texture(art.frontNormal, uvn) : art.creaseNormal ? texture(art.creaseNormal, side === 0 ? uvn : uvn.mul(vec2(-1, 1)).add(vec2(1, 0))) : undefined;
      aluminiumSurface(m, crTex.r, mk.r, ridges, opts.crinkle ?? 3.4, crN);
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

export { TEAR_V } from './packCrease';
