import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, NoColorSpace, SRGBColorSpace, type Texture } from 'three/webgpu';
import { bumpMap, float, mix, normalMap, positionLocal, texture, uv, vec2, vec3, smoothstep, sin } from 'three/tsl';
import { makeCanvas, applyGrain, alpha, roundRect, linear, radial, type Ctx } from './art/canvas';
import { FONT_MONO, FONT_TITLE } from './art/frame';
import { ensureFonts } from './art';
import { encodeNormal } from './tsl';

/** Booster : un peu plus grand qu'une carte, coussin bombé, soudures crantées haut/bas. */
export const PACK = { w: 0.78, h: 1.18, bulge: 0.045, crimp: 0.075 };

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
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const rr = (() => { let a = 99991; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  // grands plis bas-relief : segments (u0,v0)-(u1,v1), amplitude et largeur
  const folds = Array.from({ length: 7 }, () => ({ u0: rr(), v0: cv + rr() * (1 - 2 * cv), u1: rr(), v1: cv + rr() * (1 - 2 * cv), amp: 0.004 + rr() * 0.006, wdt: 0.05 + rr() * 0.08 }));
  const foldZ = (u: number, v: number) => {
    let z = 0;
    for (const f of folds) {
      const dx = f.u1 - f.u0, dy = f.v1 - f.v0, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((u - f.u0) * dx + (v - f.v0) * dy) / l2));
      const px = f.u0 + dx * t, py = f.v0 + dy * t;
      const d = Math.hypot(u - px, v - py);
      const edge = Math.min(1, t * 6, (1 - t) * 6); // fondu aux extrémités
      z += f.amp * Math.exp(-(d * d) / (f.wdt * f.wdt * 0.5)) * edge * Math.cos((d / f.wdt) * 2.2);
    }
    return z;
  };
  const prof = (u: number, v: number) => {
    // horizontal : plat au centre, chute douce sur les bords, nul dans la marge scellée
    const eu = Math.min(u, 1 - u);
    const pu = eu < su ? 0 : smooth(Math.min(1, (eu - su) / 0.22));
    const vv = (v - cv) / (1 - 2 * cv);
    if (vv <= 0 || vv >= 1) return 0;
    const ev = Math.min(vv, 1 - vv);
    const pv = smooth(Math.min(1, ev / 0.2));
    return pu * pv;
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
        const crimpZ = inCrimp ? 0.0014 * Math.sin(x * 260) - 0.003 * (1 - p) : 0;
        // marge scellée latérale : les faces se touchent (une demi-épaisseur de film), légère ondulation
        const eu = Math.min(u, 1 - u);
        const seamWave = eu < su ? 0.0008 * Math.sin(y * 90) : 0;
        const fold = inCrimp ? 0 : foldZ(u, v) * Math.min(1, p * 2);
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
    g.strokeStyle = 'rgba(0,0,0,0.35)';
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
    // brossage FIN du film (vertical, très léger : un sachet est plus lisse qu'une plaque)
    for (let x = 0; x < PW; x += 1) {
      const v = rr();
      g.fillStyle = v > 0.5 ? alpha('#ffffff', (v - 0.5) * 0.08) : alpha('#000000', (0.5 - v) * 0.09);
      g.fillRect(x, 0, 1, PH);
    }
    // reflet large (le vrai reflet vient du matériau ; ceci est la teinte de base)
    g.fillStyle = linear(g, 0, 0, PW, 0, [[0, alpha('#000', 0.12)], [0.3, alpha('#fff', 0.1)], [0.55, alpha('#000', 0.06)], [1, alpha('#fff', 0.08)]]);
    g.fillRect(0, 0, PW, PH);
    crimpBands(g, mixHex(base, '#eef0f3', 0.6));
    applyGrain(g, PW, PH, 0.03, 8, 20);
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
  const C = creaseMap(ch);
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
function creaseMap(ch: number): { c: HTMLCanvasElement } {
  const hit = creaseCache.get(ch);
  if (hit && hit.c.width > 0) return hit;
  const C = paintCreaseMap(ch);
  creaseCache.set(ch, C);
  return C;
}
function paintCreaseMap(ch: number): { c: HTMLCanvasElement; g: Ctx } {
  const W = PW, H = PH;
  const C = makeCanvas(W, H);
  const g = C.g;
  const rr = lcg(424242);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  // bombé
  g.fillStyle = radial(g, W / 2, H / 2, 0, Math.max(W, H) * 0.62, [[0, 'rgba(255,255,255,0.30)'], [0.55, 'rgba(255,255,255,0.10)'], [1, 'rgba(0,0,0,0.22)']]);
  g.fillRect(0, 0, W, H);
  // près des soudures le film est tiré : légère dépression
  for (const [y0, y1] of [[ch, ch + 70], [H - ch - 70, H - ch]] as Array<[number, number]>) {
    g.fillStyle = linear(g, 0, y0, 0, y1, y0 < H / 2 ? [[0, 'rgba(0,0,0,0.18)'], [1, 'rgba(0,0,0,0)']] : [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.18)']]);
    g.fillRect(0, y0, W, y1 - y0);
  }
  const crease = (x0: number, y0: number, x1: number, y1: number, amp: number, width: number) => {
    // une arête de pli : crête lumineuse + creux sombre parallèle, légèrement courbe, fondus aux extrémités
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const bend = (rr() - 0.5) * l * 0.18;
    const mx = (x0 + x1) / 2 + nx * bend, my = (y0 + y1) / 2 + ny * bend;
    const path = (off: number) => {
      g.beginPath();
      g.moveTo(x0 + nx * off, y0 + ny * off);
      g.quadraticCurveTo(mx + nx * off, my + ny * off, x1 + nx * off, y1 + ny * off);
    };
    g.lineCap = 'round';
    g.filter = `blur(${width * 0.6}px)`;
    g.lineWidth = width;
    g.strokeStyle = `rgba(255,255,255,${amp})`;
    path(-width * 0.45);
    g.stroke();
    g.strokeStyle = `rgba(0,0,0,${amp * 0.9})`;
    path(width * 0.45);
    g.stroke();
    // la crête elle-même, un peu plus nette (seulement sur les plis larges)
    if (width >= 4) {
      g.filter = `blur(${width * 0.18}px)`;
      g.lineWidth = Math.max(1, width * 0.3);
      g.strokeStyle = `rgba(255,255,255,${Math.min(1, amp * 1.2)})`;
      path(0);
      g.stroke();
    }
  };
  // plis principaux : points d'ancrage (coins des soudures + points libres), segments entre voisins proches
  const pts: Array<[number, number]> = [[18, ch + 10], [W - 18, ch + 10], [18, H - ch - 10], [W - 18, H - ch - 10]];
  for (let i = 0; i < 14; i++) pts.push([30 + rr() * (W - 60), ch + 40 + rr() * (H - 2 * ch - 80)]);
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const near = pts.map((p, k) => ({ k, d: Math.hypot(p[0] - x0, p[1] - y0) })).filter((o) => o.k !== i && o.d < 520).sort((a, b) => a.d - b.d).slice(0, i < 4 ? 3 : 2);
    for (const o of near) {
      if (o.k < i) continue; // chaque paire une fois
      const [x1, y1] = pts[o.k];
      crease(x0, y0, x1, y1, 0.22 + rr() * 0.3, 4 + rr() * 8);
    }
  }
  // plis secondaires : doux et étirés (le film se tend entre les plis principaux), plus denses près des soudures,
  // orientés en gros comme les plis voisins → une surface froissée continue, pas des traits posés dessus
  const mainDir = (x: number, y: number) => {
    let best = Infinity, ang = 0;
    for (let i = 0; i < pts.length; i++) for (let k = i + 1; k < pts.length; k++) {
      const d = Math.hypot((pts[i][0] + pts[k][0]) / 2 - x, (pts[i][1] + pts[k][1]) / 2 - y);
      if (d < best) { best = d; ang = Math.atan2(pts[k][1] - pts[i][1], pts[k][0] - pts[i][0]); }
    }
    return ang;
  };
  for (let i = 0; i < 110; i++) {
    const nearSeam = rr() < 0.55;
    const y = nearSeam ? (rr() < 0.5 ? ch + rr() * 150 : H - ch - rr() * 150) : ch + rr() * (H - 2 * ch);
    const x = rr() * W;
    const a = mainDir(x, y) + (rr() - 0.5) * 1.1, l = 40 + rr() * 140;
    crease(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.05 + rr() * 0.12, 5 + rr() * 9);
  }
  // froissé diffus : larges bosses molles (le film n'est jamais plat)
  g.filter = 'blur(22px)';
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rr() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.ellipse(rr() * W, ch + rr() * (H - 2 * ch), 30 + rr() * 110, 14 + rr() * 50, rr() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
  // soudures : plates (le relief cranté vient du masque G)
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, ch);
  g.fillRect(0, H - ch, W, ch);
  applyGrain(g, W, H, 0.06, 3, 0);
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
      // (retours 06/11) sachet aluminium : métal partout, sans vernis
      // (ultra-réalisme) aluminium brillant : métal pur, rugosité basse, relief des plis fort
      m.metalnessNode = float(1);
      m.roughnessNode = mix(float(0.22), float(0.14), foil);
      m.normalNode = bumpMap(crTex.r, float(opts.crinkle ?? 3.2), normalMap(encodeNormal(ridges)));
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
