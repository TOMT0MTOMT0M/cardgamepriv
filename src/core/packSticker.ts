import { CanvasTexture, Mesh, NoColorSpace, type Texture } from 'three/webgpu';
import { float, mix, texture, uv } from 'three/tsl';
import { makeCanvas, roundRect, type Ctx } from './art/canvas';
import { FONT_MONO } from './art/frame';
import { ensureFonts } from './art';
import { FONT_LABEL, FONT_TEXT } from './fonts';
import { PACK, PH, PW, lcg } from './packCrease';
import { createPackGeometry, createPackMaterials, generatePackArt, PLASTIC_TINT, type PackArt } from './pack';
import { drawThemeLogo, type CartoonTheme } from './packCartoon';
import type { N } from './tsl';

/**
 * (27/11, labo 047) SACHETS « AUTOCOLLANT » — la piste retenue par Tom, sur la VRAIE matière du jeu.
 *
 * Le support est le sachet simple du jeu, inchangé (`generatePackArt({ simple: true })`) : alu sous film teinté, plis
 * propres à chaque booster, nom du pack thermoformé en Matcha World. Rien n'est imprimé sur le film. Par-dessus, des
 * AUTOCOLLANTS : chacun est dessiné sur sa petite toile, découpé (liseré blanc qui suit sa forme), puis collé avec une
 * ombre de contact, un léger hasard de pose (graine du booster) et sa matière propre — papier mat ou vinyle satiné,
 * jamais métallique : c'est ce contraste avec l'alu qui fait la piste.
 *
 * Une seule texture en plus par sachet, en demi-définition (`stickers`) : R = autocollant sur la face, G = son brillant
 * (0 papier · 1 vinyle), B = autocollant au dos. À l'intégration, elle peut passer dans le canal libre des masques.
 *
 * Deux variantes par sachet (`a`, `b`), textes en FR et en EN. Le « booster du moment » est un GABARIT (`moment`) :
 * teinte, nom, logo et date de fin sont des paramètres ; `tele` et `noel` en sont deux exemples.
 */
export type SachetId = 'gaming' | 'pop' | 'sport' | 'monde' | 'bebou' | 'tele' | 'noel';
export type StickerVariant = 'a' | 'b';
export type StickerLang = 'fr' | 'en';
type Logo = CartoonTheme | 'noel';
type L2 = Record<StickerLang, string>;

export interface SachetLook {
  /** nom officiel du sachet (planche du labo, étiquette au dos) */
  title: L2;
  /** nom moulé dans le film (celui du jeu, validé par Hugo) */
  label: string;
  /** teinte du film — hors couleurs de rareté (gris, vert, bleu, rouge, doré, arc-en-ciel, rose irisé) */
  tint: string;
  alloyMix?: number;
  logo: Logo;
  /** papier des étiquettes, puis deux couleurs d'encre franches */
  paper: string;
  a: string;
  b: string;
  /** gabarit « booster du moment » : date de fin affichée sur l'étiquette dateuse */
  until?: L2;
  /** fiche d'intention (affichée dans le labo) */
  mots: string;
  variants: Record<StickerVariant, { name: string; by: string }>;
}

export const SACHETS: Record<SachetId, SachetLook> = {
  gaming: {
    title: { fr: 'Gaming', en: 'Gaming' }, label: 'Gaming', tint: '#5a35e8', logo: 'gaming', paper: '#f6f4ff', a: '#e6ff3d', b: '#ff4d6d',
    mots: 'arcade · bidouille · numéroté',
    variants: { a: { name: 'Borne', by: 'Teenage Engineering' }, b: { name: 'Chambre d’ado', by: 'Brain Dead' } },
  },
  pop: {
    title: { fr: 'Pop culture', en: 'Pop culture' }, label: 'Popculture', tint: '#ff6a1f', logo: 'pop', paper: '#fff6e3', a: '#ff4fa3', b: '#2b2bd6',
    mots: 'séance · zapping · fan',
    variants: { a: { name: 'Séance', by: 'Brain Dead' }, b: { name: 'Zapping', by: 'konbini' } },
  },
  sport: {
    title: { fr: 'Sport & esport', en: 'Sport & esport' }, label: 'Sport', tint: '#a8f00a', alloyMix: 0.5, logo: 'sport', paper: '#ffffff', a: '#ff4b1f', b: '#141016',
    mots: 'jour de match · dossard · rebond',
    variants: { a: { name: 'Dossard', by: 'Studio Feixen + Teenage Engineering' }, b: { name: 'Rebond', by: 'Studio Feixen' } },
  },
  monde: {
    title: { fr: 'Le monde', en: 'The world' }, label: 'World', tint: '#0fb5a8', logo: 'monde', paper: '#efe1c2', a: '#ff7a1a', b: '#1c2a5e',
    mots: 'valise · tampon · escale',
    variants: { a: { name: 'Soute', by: 'Virgil Abloh + Teenage Engineering' }, b: { name: 'Passeport', by: 'Brain Dead' } },
  },
  bebou: {
    title: { fr: 'Bébou pack', en: 'Bébou pack' }, label: 'Bebou', tint: '#23232b', alloyMix: 0.14, logo: 'bebou', paper: '#f1e9d8', a: '#f1e9d8', b: '#c9b99a',
    mots: 'silence · sceau · rare',
    variants: { a: { name: 'Sceau', by: 'Kenya Hara' }, b: { name: 'Pastille', by: 'Nothing + Kenya Hara' } },
  },
  tele: {
    title: { fr: 'Booster du moment · Télé', en: 'Limited booster · TV' }, label: 'Télé', tint: '#c026d3', logo: 'tele', paper: '#fffdf5', a: '#ffe500', b: '#141016',
    until: { fr: '02/12', en: 'DEC 2' },
    mots: 'éphémère · daté · bandeau',
    variants: { a: { name: 'Obi', by: 'konbini + Virgil Abloh' }, b: { name: 'Promo', by: 'konbini' } },
  },
  noel: {
    title: { fr: 'Booster du moment · Noël', en: 'Limited booster · Xmas' }, label: 'Noël', tint: '#6b1d5e', alloyMix: 0.34, logo: 'noel', paper: '#fffdf5', a: '#ffe500', b: '#141016',
    until: { fr: '26/12', en: 'DEC 26' },
    mots: 'éphémère · daté · bandeau',
    variants: { a: { name: 'Obi', by: 'konbini + Virgil Abloh' }, b: { name: 'Promo', by: 'konbini' } },
  },
};
export const SACHET_IDS = Object.keys(SACHETS) as SachetId[];

const INK = '#141016';
const TAU = Math.PI * 2;
const CH = (PACK.crimp / PACK.h) * PH;
const DISPLAY = FONT_TEXT; // Bold Frame (800 = Bold Frame Two)

/** textes des étiquettes, FR et EN (maquette du labo : passeront par les clés i18n à l'intégration) */
const TX = {
  cartes: { fr: 'CARTES', en: 'CARDS' }, // i18n-ok
  cartesMin: { fr: '5 cartes', en: '5 cards' }, // i18n-ok
  cinq: { fr: '5 CARTES', en: '5 CARDS' }, // i18n-ok
  cinqBang: { fr: '5 cartes !', en: '5 cards!' }, // i18n-ok
  cartesBang: { fr: 'cartes !', en: 'cards!' }, // i18n-ok
  cinqQuote: { fr: '« 5 CARTES »', en: '“5 CARDS”' }, // i18n-ok
  qty: { fr: 'QTÉ', en: 'QTY' }, // i18n-ok
  club: { fr: 'CLUB PRIVÉ', en: 'PRIVATE CLUB' }, // i18n-ok
  start: { fr: 'APPUIE SUR START', en: 'PRESS START' }, // i18n-ok
  entree: { fr: 'ENTRÉE', en: 'ADMIT ONE' }, // i18n-ok
  scene: { fr: 'SCÈNE 5 · PRISE 1', en: 'SCENE 5 · TAKE 1' }, // i18n-ok
  dest: { fr: 'DEST.', en: 'DEST.' }, // i18n-ok
  monde: { fr: 'Monde', en: 'World' }, // i18n-ok
  fragile: { fr: 'FRAGILE · NE PAS PLIER', en: 'FRAGILE · DO NOT BEND' }, // i18n-ok
  admis: { fr: 'ADMIS', en: 'ADMITTED' }, // i18n-ok
  avion: { fr: 'PAR AVION', en: 'AIR MAIL' }, // i18n-ok
  scelle: { fr: 'SCELLÉ', en: 'SEALED' }, // i18n-ok
  huit: { fr: 'DONT PEUT-ÊTRE 1 DES 8', en: 'MAYBE 1 OF THE 8' }, // i18n-ok
  moment: { fr: 'BOOSTER DU MOMENT', en: 'LIMITED BOOSTER' }, // i18n-ok
  avant: { fr: 'À OUVRIR AVANT LE', en: 'OPEN BEFORE' }, // i18n-ok
  duMoment1: { fr: 'du', en: 'right' }, // i18n-ok
  duMoment2: { fr: 'moment', en: 'now' }, // i18n-ok
  pasVente: { fr: 'CLUB PRIVÉ — NE SE VEND PAS', en: 'PRIVATE CLUB — NOT FOR SALE' }, // i18n-ok
} satisfies Record<string, L2>;
const BRAND = 'Bébou cartes'; // i18n-ok (marque)

// ───────────────────────────────────────────── le moteur : un autocollant = une petite toile découpée

interface Stk {
  c: HTMLCanvasElement;
  /** 0 = papier mat · 1 = vinyle satiné */
  gloss: number;
}

/**
 * Dessine un autocollant dans un repère (0..w, 0..h). `cut` > 0 : liseré de découpe qui suit la forme dessinée (la
 * silhouette est dilatée de `cut` pixels) — c'est ce liseré qui fait lire « autocollant » plutôt que « imprimé ».
 */
function stk(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, o: { cut?: number; cutCol?: string; gloss?: number } = {}): Stk {
  const b = o.cut ?? 0, pad = Math.ceil(b) + 3;
  const A = makeCanvas(Math.ceil(w + pad * 2), Math.ceil(h + pad * 2));
  A.g.translate(pad, pad);
  A.g.lineJoin = 'round';
  A.g.lineCap = 'round';
  draw(A.g, w, h);
  const gloss = o.gloss ?? 0.25;
  if (!b) return { c: A.c, gloss };
  const S = makeCanvas(A.c.width, A.c.height);
  S.g.drawImage(A.c, 0, 0);
  S.g.globalCompositeOperation = 'source-in';
  S.g.fillStyle = o.cutCol ?? '#fff';
  S.g.fillRect(0, 0, S.c.width, S.c.height);
  const O = makeCanvas(A.c.width, A.c.height);
  for (let i = 0; i < 28; i++) O.g.drawImage(S.c, Math.cos((i / 28) * TAU) * b, Math.sin((i / 28) * TAU) * b);
  O.g.drawImage(S.c, 0, 0);
  O.g.drawImage(A.c, 0, 0);
  A.c.width = A.c.height = S.c.width = S.c.height = 0;
  return { c: O.c, gloss };
}

interface Placer {
  /** colle sur la face (x, y = centre, en pixels de la toile 640 × 968) ; `fix` : posé à la règle, sans hasard */
  put(s: Stk, x: number, y: number, rot?: number, o?: { fix?: boolean; scale?: number }): void;
  /** colle au dos */
  back(s: Stk, x: number, y: number, rot?: number): void;
}

function placer(fronts: Ctx[], back: Ctx, mask: Ctx, seed: number): Placer & { flush(): void } {
  const rnd = lcg(seed * 2654435761 + 97);
  const backs: Array<() => void> = [];
  const stamp = (g: Ctx, c: CanvasImageSource & { width: number; height: number }, x: number, y: number, rot: number, sc: number, shadow: boolean) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(sc, sc);
    if (shadow) {
      // ombre de contact : courte, décalée vers le bas (l'épaisseur du papier), jamais un halo
      g.shadowColor = 'rgba(12,9,16,0.55)';
      g.shadowBlur = 7;
      g.shadowOffsetX = 2;
      g.shadowOffsetY = 4;
    }
    g.drawImage(c, -c.width / 2, -c.height / 2);
    g.restore();
  };
  const silhouette = (s: Stk, col: string) => {
    const t = makeCanvas(s.c.width, s.c.height);
    t.g.drawImage(s.c, 0, 0);
    t.g.globalCompositeOperation = 'source-in';
    t.g.fillStyle = col;
    t.g.fillRect(0, 0, t.c.width, t.c.height);
    return t.c;
  };
  return {
    put(s, x, y, rot = 0, o = {}) {
      const j = o.fix ? [0, 0, 0] : [(rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 0.07];
      const sc = o.scale ?? 1;
      for (const g of fronts) stamp(g, s.c, x + j[0], y + j[1], rot + j[2], sc, true);
      const sil = silhouette(s, `rgb(255,${Math.round(s.gloss * 255)},0)`);
      stamp(mask, sil, x + j[0], y + j[1], rot + j[2], sc, false);
      sil.width = sil.height = 0;
    },
    back(s, x, y, rot = 0) {
      backs.push(() => {
        stamp(back, s.c, x, y, rot, 1, true);
        const sil = silhouette(s, 'rgb(0,0,255)');
        mask.save();
        mask.globalCompositeOperation = 'lighter';
        stamp(mask, sil, x, y, rot, 1, false);
        mask.restore();
        sil.width = sil.height = 0;
      });
    },
    flush() {
      backs.forEach((f) => f());
    },
  };
}

// ───────────────────────────────────────────── petits outils de dessin

function txt(g: Ctx, s: string, x: number, y: number, px: number, o: { f?: string; w?: number; col?: string; al?: CanvasTextAlign; max?: number; sp?: number } = {}) {
  const f = o.f ?? FONT_LABEL, w = o.w ?? 700;
  g.save();
  (g as Ctx & { letterSpacing?: string }).letterSpacing = `${o.sp ?? 0}px`;
  g.font = `${w} ${px}px ${f}`;
  if (o.max) while (px > 8 && g.measureText(s).width > o.max) g.font = `${w} ${(px -= 1)}px ${f}`;
  g.textAlign = o.al ?? 'center';
  g.textBaseline = 'middle';
  g.fillStyle = o.col ?? INK;
  g.fillText(s, x, y);
  g.restore();
}

/** remplit puis cerne le tracé courant */
function ink(g: Ctx, fill: string | null, lw: number, stroke = INK) {
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (lw > 0) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function burstPath(g: Ctx, cx: number, cy: number, r0: number, r1: number, n: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 ? r0 : r1 * (0.9 + 0.1 * Math.sin(i * 2.3));
    if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function barcode(g: Ctx, x: number, y: number, w: number, h: number, seed: number, col = INK) {
  const r = lcg(seed * 131 + 7);
  g.fillStyle = col;
  for (let p = 0; p < w; ) {
    const bw = 1.5 + Math.floor(r() * 3) * 1.5;
    if (p + bw <= w) g.fillRect(x + p, y, bw, h);
    p += bw + 1.5 + Math.floor(r() * 2) * 1.5;
  }
}

function pixels(g: Ctx, rows: string[], x: number, y: number, px: number, cols: Record<string, string>) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (!cols[ch]) return;
    g.fillStyle = cols[ch];
    g.fillRect(x + i * px, y + j * px, px + 0.6, px + 0.6);
  }));
}

/** sapin de papier découpé (logo de l'exemple « Noël » du gabarit) : blanc cassé, étoile, trois boules */
function drawNoel(g: Ctx, cx: number, cy: number, r: number) {
  const lw = Math.max(4, r * 0.075);
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  g.rect(cx - r * 0.13, cy + r * 0.62, r * 0.26, r * 0.3);
  ink(g, '#b98a5a', lw * 0.8);
  for (const [top, bot, half] of [[0.18, 0.72, 0.78], [-0.22, 0.34, 0.62], [-0.62, -0.02, 0.44]] as const) {
    g.beginPath();
    g.moveTo(cx, cy + top * r - r * 0.2);
    g.lineTo(cx + half * r, cy + bot * r);
    g.lineTo(cx - half * r, cy + bot * r);
    g.closePath();
    ink(g, '#fbf6e6', lw);
  }
  burstPath(g, cx, cy - r * 0.8, r * 0.09, r * 0.2, 5, -Math.PI / 2);
  ink(g, '#ffe500', lw * 0.6);
  for (const [x, y, c] of [[-0.2, 0.0, '#c026d3'], [0.22, 0.3, '#ffe500'], [-0.3, 0.55, '#ff7a1a'], [0.34, 0.6, '#c026d3']] as const) {
    g.beginPath();
    g.arc(cx + x * r, cy + y * r, r * 0.08, 0, TAU);
    ink(g, c, lw * 0.5);
  }
  g.restore();
}

const drawLogo = (g: Ctx, logo: Logo, cx: number, cy: number, r: number) => (logo === 'noel' ? drawNoel(g, cx, cy, r) : drawThemeLogo(g, logo, cx, cy, r));

// ───────────────────────────────────────────── autocollants communs

/** le logo du thème, découpé à sa forme (vinyle) */
const sLogoCut = (logo: Logo, r: number) => stk(r * 2, r * 2, (g) => drawLogo(g, logo, r, r, r * 0.92), { cut: r * 0.09, gloss: 0.9 });

/** le logo dans une pastille ronde de couleur */
const sLogoRound = (logo: Logo, r: number, bg: string) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 3, 0, TAU);
  ink(g, bg, 6);
  drawLogo(g, logo, r, r, r * 0.66);
}, { gloss: 0.8 });

/** la mention de marque, en pastille */
const sBrandPill = (w: number, bg = INK, fg = '#fff8ea') => stk(w, w * 0.24, (g, W, H) => {
  roundRect(g, 0, 0, W, H, H / 2);
  ink(g, bg, 0);
  txt(g, BRAND, W / 2, H * 0.53, H * 0.5, { f: DISPLAY, w: 700, col: fg, max: W * 0.82 });
}, { gloss: 0.5 });

/** « 5 cartes » dans une explosion de case de BD */
const sCinqBurst = (L: StickerLang, r: number, bg: string) => stk(r * 2, r * 2, (g) => {
  burstPath(g, r, r, r * 0.72, r * 0.98, 13, 0.1);
  ink(g, bg, 7);
  txt(g, '5', r, r * 0.8, r * 0.82, { f: DISPLAY, w: 800 });
  txt(g, L === 'fr' ? 'CARTES !' : 'CARDS!', r, r * 1.34, r * 0.25, { w: 700, sp: 1 }); // i18n-ok
}, { cut: 7, gloss: 0.3 });

/** « 5 cartes » en cartouche de BD (rectangle, bloc d'ombre décalé) */
const sCinqCase = (L: StickerLang, w: number, bg: string) => stk(w + 12, w * 0.46 + 12, (g) => {
  const h = w * 0.46;
  g.fillStyle = INK;
  g.fillRect(12, 12, w, h);
  g.beginPath();
  g.rect(3, 3, w, h);
  ink(g, bg, 6);
  txt(g, TX.cinqBang[L], 3 + w / 2, 3 + h * 0.54, h * 0.52, { f: DISPLAY, w: 800, max: w * 0.86 });
}, { gloss: 0.2 });

/** étiquette réglementaire du dos : le sachet se décrit lui-même */
const sBackLabel = (k: SachetLook, L: StickerLang, seed: number) => stk(380, 190, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 6);
  ink(g, k.paper, 0);
  g.fillStyle = INK;
  g.fillRect(0, 0, W, 8);
  txt(g, L === 'fr' ? '« BOOSTER »' : '“BOOSTER”', 22, 46, 30, { al: 'left', w: 700 }); // i18n-ok
  txt(g, `${TX.cinq[L]} · ${k.title[L].toUpperCase()}`, 22, 84, 15, { al: 'left', f: FONT_MONO, w: 500, max: 230 });
  txt(g, TX.pasVente[L], 22, 108, 13, { al: 'left', f: FONT_MONO, w: 500, max: 230 });
  txt(g, `LOT 2026-11 · N° ${String(seed).padStart(4, '0')}`, 22, 132, 13, { al: 'left', f: FONT_MONO, w: 500 });
  txt(g, BRAND, 22, 164, 20, { al: 'left', f: DISPLAY, w: 700 });
  barcode(g, 272, 34, 86, 104, seed + 3);
  txt(g, '5 005 2026', 315, 152, 11, { f: FONT_MONO, w: 500 });
}, { gloss: 0.1 });

// ───────────────────────────────────────────── Gaming

const HEART = ['.XX.XX.', 'XWXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const sHeart = (px: number, col: string) => stk(7 * px, 6 * px, (g) => pixels(g, HEART, 0, 0, px, { X: col, W: '#fff' }), { cut: px * 0.55, cutCol: INK, gloss: 0.8 });

const sCartridge = (w: number, k: SachetLook) => stk(w, w * 1.1, (g, W, H) => {
  g.beginPath();
  g.moveTo(8, 0);
  g.lineTo(W - 8, 0);
  g.lineTo(W, 8);
  g.lineTo(W, H * 0.86);
  g.lineTo(W * 0.86, H * 0.86);
  g.lineTo(W * 0.86, H);
  g.lineTo(W * 0.14, H);
  g.lineTo(W * 0.14, H * 0.86);
  g.lineTo(0, H * 0.86);
  g.lineTo(0, 8);
  g.closePath();
  ink(g, '#d9d4f2', 6);
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(W * 0.14, H * 0.07 + i * 7);
    g.lineTo(W * 0.86, H * 0.07 + i * 7);
    ink(g, null, 2.5);
  }
  g.beginPath();
  g.rect(W * 0.14, H * 0.3, W * 0.72, H * 0.44);
  ink(g, k.a, 5);
  burstPath(g, W / 2, H * 0.52, W * 0.09, W * 0.19, 4, 0);
  ink(g, INK, 0);
}, { cut: 6, gloss: 0.8 });

const sGG = (w: number) => stk(w, w * 0.8, (g, W, H) => {
  g.beginPath();
  g.moveTo(W * 0.3, H * 0.72);
  g.lineTo(W * 0.2, H * 0.98);
  g.lineTo(W * 0.52, H * 0.74);
  g.closePath();
  ink(g, '#fff', 6);
  g.beginPath();
  g.ellipse(W / 2, H * 0.4, W * 0.48, H * 0.36, 0, 0, TAU);
  ink(g, '#fff', 6);
  g.fillStyle = '#fff';
  g.fillRect(W * 0.29, H * 0.6, W * 0.2, H * 0.14);
  txt(g, 'GG', W / 2, H * 0.42, H * 0.46, { f: DISPLAY, w: 800 });
}, { cut: 6, gloss: 0.7 });

const sStart = (L: StickerLang, w: number, k: SachetLook) => stk(w, 56, (g, W, H) => {
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  g.fillStyle = k.a;
  g.beginPath();
  g.moveTo(22, H / 2 - 11);
  g.lineTo(40, H / 2);
  g.lineTo(22, H / 2 + 11);
  g.closePath();
  g.fill();
  txt(g, TX.start[L], 56, H / 2 + 1, 25, { al: 'left', f: FONT_MONO, w: 500, col: k.a, max: W - 76, sp: 2 });
}, { gloss: 0.15 });

const sDpad = (r: number) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 3, 0, TAU);
  ink(g, '#fff', 5);
  const a = r * 0.24;
  g.beginPath();
  g.rect(r - a * 2.6, r - a, a * 5.2, a * 2);
  g.rect(r - a, r - a * 2.6, a * 2, a * 5.2);
  ink(g, INK, 0);
}, { gloss: 0.8 });

/** « 5 cartes » en étiquette technique : quantité, numérotation, code-barres */
const sCinqTag = (L: StickerLang, k: SachetLook) => stk(310, 150, (g, W, H) => {
  g.beginPath();
  g.rect(0, 0, W, H);
  ink(g, k.a, 0);
  g.beginPath();
  g.rect(8, 8, W - 16, H - 16);
  ink(g, null, 3);
  txt(g, '05', 20, H * 0.54, 118, { al: 'left', f: FONT_MONO, w: 500 });
  g.fillStyle = INK;
  g.fillRect(172, 8, 3, H - 16);
  txt(g, TX.qty[L], 188, 30, 15, { al: 'left', f: FONT_MONO, w: 500 });
  txt(g, TX.cartes[L], 188, 62, 30, { al: 'left', w: 700, max: 106 });
  barcode(g, 188, 86, 104, 34, 5);
  txt(g, 'N° 01 / 06', 188, 132, 12, { al: 'left', f: FONT_MONO, w: 500 });
}, { gloss: 0.1 });

const sBrandTech = (L: StickerLang, k: SachetLook, no: string) => stk(270, 60, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  g.fillStyle = INK;
  g.fillRect(0, 0, H, H);
  txt(g, no, H / 2, H / 2 + 1, 24, { f: FONT_MONO, w: 500, col: k.paper });
  txt(g, BRAND, H + 12, 22, 21, { al: 'left', f: DISPLAY, w: 700, max: W - H - 22 });
  txt(g, `${TX.club[L]} · ${k.title[L].toUpperCase()}`, H + 12, 45, 11.5, { al: 'left', f: FONT_MONO, w: 500, max: W - H - 22 });
}, { gloss: 0.1 });

// ───────────────────────────────────────────── Pop culture

/** « 5 cartes » en ticket de cinéma (talon perforé, encoches) */
const sTicket = (L: StickerLang, k: SachetLook) => stk(370, 150, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 10);
  ink(g, k.paper, 0);
  g.beginPath();
  g.rect(9, 9, W - 18, H - 18);
  ink(g, null, 3, k.a);
  g.setLineDash([7, 6]);
  g.beginPath();
  g.moveTo(96, 12);
  g.lineTo(96, H - 12);
  ink(g, null, 2.5);
  g.setLineDash([]);
  g.save();
  g.translate(52, H / 2);
  g.rotate(-Math.PI / 2);
  txt(g, 'N° 05', 0, -16, 30, { f: FONT_MONO, w: 500 });
  txt(g, 'POP CULTURE', 0, 18, 11.5, { f: FONT_MONO, w: 500, sp: 1 });
  g.restore();
  txt(g, TX.entree[L], 230, 38, 17, { w: 700, sp: 5, col: k.a });
  txt(g, TX.cartesMin[L], 230, 84, 66, { f: DISPLAY, w: 800, max: 240 });
  txt(g, '★  ★  ★', 230, 127, 13, { col: k.a });
  // encoches : le ticket est vraiment découpé
  g.globalCompositeOperation = 'destination-out';
  for (const x of [0, W]) {
    g.beginPath();
    g.arc(x, H / 2, 15, 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}, { gloss: 0.1 });

/** la marque sur un clap */
const sClap = (L: StickerLang, w: number) => stk(w, w * 0.62, (g, W, H) => {
  const bar = H * 0.24;
  roundRect(g, 0, bar, W, H - bar, 8);
  ink(g, INK, 0);
  g.save();
  g.translate(0, bar);
  g.rotate(-0.1);
  g.beginPath();
  g.rect(0, -bar, W * 0.98, bar);
  g.fillStyle = INK;
  g.fill();
  g.clip();
  g.fillStyle = '#fff8ea';
  for (let x = -bar; x < W; x += bar * 1.5) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + bar * 0.75, 0);
    g.lineTo(x + bar * 1.45, -bar);
    g.lineTo(x + bar * 0.7, -bar);
    g.closePath();
    g.fill();
  }
  g.restore();
  txt(g, BRAND, W / 2, bar + (H - bar) * 0.4, H * 0.22, { f: DISPLAY, w: 700, col: '#fff8ea', max: W * 0.86 });
  txt(g, TX.scene[L], W / 2, bar + (H - bar) * 0.76, H * 0.085, { f: FONT_MONO, w: 500, col: '#fff8ea', sp: 1, max: W * 0.86 });
}, { cut: 5, gloss: 0.3 });

const sWow = (r: number, bg: string) => stk(r * 2, r * 2, (g) => {
  burstPath(g, r, r, r * 0.62, r * 0.98, 11, 0.3);
  ink(g, bg, 6);
  txt(g, 'WOW!', r, r * 1.03, r * 0.42, { f: DISPLAY, w: 800, col: '#fff', max: r * 1.1 });
}, { cut: 5, gloss: 0.6 });

const sVinyl = (r: number, col: string) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 2, 0, TAU);
  ink(g, '#18151c', 0);
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 1.5;
  for (let q = 0.5; q < 0.94; q += 0.075) {
    g.beginPath();
    g.arc(r, r, r * q, 0, TAU);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = r * 0.3;
  g.lineCap = 'butt';
  for (const a of [-0.9, 2.25]) {
    g.globalAlpha = 0.22;
    g.beginPath();
    g.arc(r, r, r * 0.7, a, a + 0.38);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(r, r, r * 0.36, 0, TAU);
  ink(g, col, 0);
  g.beginPath();
  g.arc(r, r, r * 0.05, 0, TAU);
  ink(g, '#fff8ea', 0);
}, { cut: 5, gloss: 1 });

const sGlasses = (w: number) => stk(w, w * 0.42, (g, W, H) => {
  g.beginPath();
  g.moveTo(0, H * 0.1);
  g.lineTo(W, H * 0.1);
  g.lineTo(W, H * 0.7);
  g.quadraticCurveTo(W * 0.78, H, W * 0.6, H * 0.72);
  g.quadraticCurveTo(W * 0.5, H * 0.42, W * 0.4, H * 0.72);
  g.quadraticCurveTo(W * 0.22, H, 0, H * 0.7);
  g.closePath();
  ink(g, '#fff', 5);
  for (const [x, c] of [[0.24, '#23c8d2'], [0.76, '#ff3d5a']] as const) {
    roundRect(g, W * (x - 0.16), H * 0.24, W * 0.32, H * 0.42, 6);
    ink(g, c, 4);
  }
}, { cut: 5, gloss: 0.7 });

/** « 5 cartes » dans une bulle de BD */
const sBulle = (L: StickerLang, w: number, k: SachetLook) => stk(w, w * 0.66, (g, W, H) => {
  g.beginPath();
  g.moveTo(W * 0.62, H * 0.7);
  g.lineTo(W * 0.8, H * 0.99);
  g.lineTo(W * 0.4, H * 0.72);
  g.closePath();
  ink(g, k.paper, 7);
  g.beginPath();
  g.ellipse(W / 2, H * 0.42, W * 0.48, H * 0.38, 0, 0, TAU);
  ink(g, k.paper, 7);
  g.fillStyle = k.paper;
  g.fillRect(W * 0.43, H * 0.62, W * 0.2, H * 0.14);
  txt(g, '5', W * 0.24, H * 0.42, H * 0.56, { f: DISPLAY, w: 800, col: k.a });
  txt(g, TX.cartesBang[L], W * 0.62, H * 0.43, H * 0.24, { f: DISPLAY, w: 800, max: W * 0.5 });
}, { cut: 6, gloss: 0.3 });

const sStar = (r: number, col: string) => stk(r * 2, r * 2, (g) => {
  burstPath(g, r, r, r * 0.42, r * 0.94, 5, -Math.PI / 2);
  ink(g, col, 5);
}, { cut: 4, gloss: 0.8 });

const sFilm = (w: number) => stk(w, 62, (g, W, H) => {
  g.fillStyle = '#18151c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff8ea';
  for (let x = 8; x < W - 8; x += 20) {
    g.fillRect(x, 6, 10, 8);
    g.fillRect(x, H - 14, 10, 8);
  }
  g.fillStyle = 'rgba(255,248,234,0.14)';
  for (let x = 6; x < W - 40; x += 56) g.fillRect(x, 20, 48, H - 40);
}, { gloss: 1 });

// ───────────────────────────────────────────── Sport & esport

/** « 5 cartes » en dossard épinglé (le numéro EST le contenu), la marque en ligne de sponsor */
const sDossard = (L: StickerLang, k: SachetLook) => stk(380, 290, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 6);
  ink(g, '#fff', 0);
  g.fillStyle = INK;
  g.fillRect(0, 0, W, 48);
  txt(g, BRAND, W / 2, 26, 25, { f: DISPLAY, w: 700, col: '#fff' });
  txt(g, '5', W / 2, 148, 208, { f: DISPLAY, w: 800 });
  g.fillStyle = k.a;
  g.fillRect(0, H - 62, W, 62);
  txt(g, TX.cartes[L], W / 2, H - 30, 34, { w: 700, sp: 12, col: '#fff' });
  txt(g, 'N°', 46, 92, 24, { f: FONT_MONO, w: 500 });
  txt(g, '2026', W - 56, 92, 18, { f: FONT_MONO, w: 500 });
  // épingles de sûreté aux quatre coins
  for (const [x, y] of [[20, 64], [W - 20, 64], [20, H - 78], [W - 20, H - 78]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, TAU);
    ink(g, '#cfd2d8', 2.5);
    g.beginPath();
    g.moveTo(x - 9, y + 7);
    g.lineTo(x + 9, y - 7);
    ink(g, null, 3, '#8d9098');
  }
}, { gloss: 0.05 });

const sWhistle = (w: number, col: string) => stk(w, w * 0.72, (g, W, H) => {
  g.beginPath();
  g.arc(W * 0.3, H * 0.14, H * 0.13, 0, TAU);
  ink(g, null, 5);
  g.beginPath();
  g.rect(W * 0.42, H * 0.3, W * 0.56, H * 0.26);
  ink(g, col, 6);
  g.beginPath();
  g.arc(W * 0.34, H * 0.62, H * 0.36, 0, TAU);
  ink(g, col, 6);
  g.beginPath();
  g.arc(W * 0.34, H * 0.62, H * 0.13, 0, TAU);
  ink(g, INK, 0);
}, { cut: 6, gloss: 0.9 });

/** pastille pleine numérotée : une position du ballon dans son rebond (forme simple, couleur franche) */
const sRebond = (r: number, n: number, bg: string, fg: string) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 1, 0, TAU);
  ink(g, bg, 0);
  txt(g, String(n), r, r + r * 0.06, r * 1.05, { f: DISPLAY, w: 800, col: fg });
}, { gloss: 0.85 });

const sChrono = (r: number, col: string) => stk(r * 2, r * 2.24, (g) => {
  const cy = r * 1.24;
  g.beginPath();
  g.rect(r - r * 0.16, 2, r * 0.32, r * 0.3);
  ink(g, INK, 0);
  g.beginPath();
  g.arc(r, cy, r - 4, 0, TAU);
  ink(g, '#fff', 7);
  g.beginPath();
  g.moveTo(r, cy);
  g.arc(r, cy, r * 0.7, -Math.PI / 2, -Math.PI / 2 + TAU * (5 / 12));
  g.closePath();
  ink(g, col, 0);
  g.beginPath();
  g.moveTo(r, cy);
  g.lineTo(r + Math.cos(-Math.PI / 2 + TAU * (5 / 12)) * r * 0.72, cy + Math.sin(-Math.PI / 2 + TAU * (5 / 12)) * r * 0.72);
  ink(g, null, 5);
  g.beginPath();
  g.arc(r, cy, r * 0.09, 0, TAU);
  ink(g, INK, 0);
}, { cut: 5, gloss: 0.8 });

/** « 5 cartes » en tableau de score */
const sScore = (L: StickerLang, k: SachetLook) => stk(320, 136, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 10);
  ink(g, INK, 0);
  roundRect(g, 14, 14, 96, H - 28, 6);
  ink(g, '#2b2731', 0);
  g.fillStyle = INK;
  g.fillRect(14, H / 2 - 1.5, 96, 3);
  txt(g, '5', 62, H / 2 + 3, 96, { f: DISPLAY, w: 800, col: '#fff' });
  txt(g, 'SCORE', 128, 34, 14, { al: 'left', f: FONT_MONO, w: 500, col: k.tint, sp: 3 });
  txt(g, TX.cartes[L], 128, 80, 40, { al: 'left', w: 700, col: '#fff', sp: 2, max: 176 });
  g.fillStyle = k.a;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(134 + i * 17, 116, 4.5, 0, TAU);
    g.fill();
  }
}, { gloss: 0.3 });

/** le nom complet du thème sur un strap noir aux bouts déchirés */
const sStrap = (text: string, w: number) => stk(w, 54, (g, W, H) => {
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  for (let i = 0; i <= 6; i++) g.lineTo(W - (i % 2 ? 7 : 0), (i / 6) * H);
  g.lineTo(0, H);
  for (let i = 6; i >= 0; i--) g.lineTo(i % 2 ? 7 : 0, (i / 6) * H);
  g.closePath();
  ink(g, INK, 0);
  txt(g, text, W / 2, H / 2 + 1, 23, { w: 700, col: '#fff', sp: 4, max: W - 40 });
}, { gloss: 0.6 });

// ───────────────────────────────────────────── Le monde

const sBagTag = (L: StickerLang, k: SachetLook) => stk(196, 292, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 8);
  ink(g, '#fff', 0);
  g.fillStyle = INK;
  g.fillRect(0, 0, W, 58);
  txt(g, 'BB 005', W / 2, 31, 30, { f: FONT_MONO, w: 500, col: '#fff', sp: 2 });
  g.fillStyle = k.a;
  g.fillRect(0, 58, W, 10);
  txt(g, TX.dest[L], 16, 90, 14, { al: 'left', f: FONT_MONO, w: 500 });
  txt(g, TX.monde[L], W / 2, 128, 54, { f: DISPLAY, w: 800, max: W - 28 });
  barcode(g, 16, 166, W - 32, 78, 11);
  txt(g, '0 005 2026 11', W / 2, 266, 13, { f: FONT_MONO, w: 500 });
}, { gloss: 0.05 });

/** « 5 cartes » en étiquette de manutention : l'étiquette commente le produit */
const sFragile = (L: StickerLang, k: SachetLook) => stk(410, 142, (g, W, H) => {
  g.beginPath();
  g.rect(3, 3, W - 6, H - 6);
  ink(g, k.a, 6);
  g.beginPath();
  g.rect(16, 16, 92, H - 32);
  ink(g, '#fff', 4);
  for (const x of [44, 80]) {
    g.beginPath();
    g.moveTo(x, H - 30);
    g.lineTo(x, 44);
    g.moveTo(x - 13, 58);
    g.lineTo(x, 40);
    g.lineTo(x + 13, 58);
    ink(g, null, 6);
  }
  txt(g, TX.cinqQuote[L], 258, 58, 46, { w: 700, max: 276 });
  txt(g, TX.fragile[L], 258, 106, 14.5, { f: FONT_MONO, w: 500, sp: 1, max: 276 });
}, { gloss: 0.1 });

/** la marque en tampon d'entrée (pastille de papier, encre marine) */
const sTampon = (L: StickerLang, r: number, k: SachetLook) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 2, 0, TAU);
  ink(g, k.paper, 0);
  for (const q of [0.9, 0.62]) {
    g.beginPath();
    g.arc(r, r, r * q, 0, TAU);
    ink(g, null, q > 0.8 ? 4 : 2.5, k.b);
  }
  const ring = `${BRAND.toUpperCase()} · ${TX.club[L]} · `;
  g.save();
  g.fillStyle = k.b;
  g.font = `700 ${r * 0.17}px ${FONT_LABEL}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...ring].forEach((ch, i, all) => {
    const a = -Math.PI / 2 + (i / all.length) * TAU;
    g.save();
    g.translate(r + Math.cos(a) * r * 0.76, r + Math.sin(a) * r * 0.76);
    g.rotate(a + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.restore();
  txt(g, TX.admis[L], r, r * 0.92, r * 0.25, { w: 700, col: k.b, max: r * 1.05 });
  txt(g, '27 NOV 2026', r, r * 1.2, r * 0.13, { f: FONT_MONO, w: 500, col: k.b });
}, { gloss: 0 });

const sAvion = (L: StickerLang, k: SachetLook) => stk(190, 58, (g, W, H) => {
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  for (let x = -H, i = 0; x < W + H; x += 16, i++) {
    g.fillStyle = i % 2 ? k.b : k.a;
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + 9, H);
    g.lineTo(x + 9 + H, 0);
    g.lineTo(x + H, 0);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#fff';
  g.fillRect(8, 8, W - 16, H - 16);
  g.restore();
  txt(g, TX.avion[L], W / 2, H / 2 + 1, 21, { w: 700, col: k.b, sp: 2, max: W - 30 });
}, { gloss: 0.1 });

/** timbre dentelé : le soleil, deux sommets */
const sTimbre = (w: number, k: SachetLook) => stk(w, w * 1.22, (g, W, H) => {
  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#bfeee8';
  g.fillRect(12, 12, W - 24, H - 24);
  g.beginPath();
  g.arc(W * 0.66, H * 0.36, W * 0.15, 0, TAU);
  ink(g, k.a, 0);
  g.save();
  g.beginPath();
  g.rect(12, 12, W - 24, H - 24);
  g.clip();
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(W * 0.38, H * 0.4);
  g.lineTo(W * 0.62, H * 0.76);
  g.lineTo(W * 0.78, H * 0.56);
  g.lineTo(W * 1.1, H);
  g.closePath();
  ink(g, k.b, 0);
  g.restore();
  txt(g, '5c', 26, 30, 17, { al: 'left', f: FONT_MONO, w: 500, col: k.b });
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x <= W + 1; x += W / 9) for (const y of [0, H]) {
    g.beginPath();
    g.arc(x, y, 4.6, 0, TAU);
    g.fill();
  }
  for (let y = 0; y <= H + 1; y += H / 11) for (const x of [0, W]) {
    g.beginPath();
    g.arc(x, y, 4.6, 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}, { gloss: 0 });

/** « 5 cartes » en losange (vieille étiquette de bagage) */
const sLosange = (L: StickerLang, s: number, k: SachetLook) => stk(s, s, (g, W) => {
  const c = W / 2;
  const dia = (q: number) => {
    g.beginPath();
    g.moveTo(c, c - c * q);
    g.lineTo(c + c * q, c);
    g.lineTo(c, c + c * q);
    g.lineTo(c - c * q, c);
    g.closePath();
  };
  dia(0.97);
  ink(g, k.a, 5);
  dia(0.84);
  ink(g, null, 2.5);
  txt(g, '5', c, c * 0.86, c * 0.74, { f: DISPLAY, w: 800 });
  txt(g, TX.cartes[L], c, c * 1.32, c * 0.2, { w: 700, sp: 2 });
}, { gloss: 0.1 });

const sOvale = (w: number, k: SachetLook) => stk(w, w * 0.56, (g, W, H) => {
  g.beginPath();
  g.ellipse(W / 2, H / 2, W / 2 - 3, H / 2 - 3, 0, 0, TAU);
  ink(g, k.paper, 5, k.b);
  g.beginPath();
  g.ellipse(W / 2, H / 2, W / 2 - 13, H / 2 - 13, 0, 0, TAU);
  ink(g, null, 2, k.b);
  txt(g, BRAND, W / 2, H * 0.44, H * 0.26, { f: DISPLAY, w: 700, col: k.b, max: W * 0.72 });
  txt(g, 'GRAND TOUR · 2026', W / 2, H * 0.7, H * 0.095, { f: FONT_MONO, w: 500, col: k.b, sp: 2 });
}, { gloss: 0 });

const sBoussole = (r: number, k: SachetLook) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 3, 0, TAU);
  ink(g, '#fff', 5, k.b);
  burstPath(g, r, r, r * 0.16, r * 0.5, 4, Math.PI / 4);
  ink(g, k.a, 0);
  burstPath(g, r, r, r * 0.18, r * 0.82, 4, 0);
  ink(g, k.b, 0);
}, { gloss: 0.6 });

// ───────────────────────────────────────────── Bébou pack

/** bande de garantie : elle passe SUR la ligne de déchirure — ouvrir le sachet, c'est rompre le sceau */
const sSceau = (L: StickerLang, k: SachetLook) => stk(84, 310, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  g.beginPath();
  g.rect(7, 7, W - 14, H - 14);
  ink(g, null, 1.4);
  g.save();
  g.translate(W / 2, H * 0.47);
  g.rotate(Math.PI / 2);
  txt(g, TX.scelle[L], 0, 1, 18, { f: FONT_MONO, w: 500, sp: 9 });
  g.restore();
  drawThemeLogo(g, 'bebou', W / 2, H - 52, 27);
}, { gloss: 0 });

const sPetite = (L: StickerLang, k: SachetLook) => stk(172, 62, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  txt(g, TX.cartesMin[L], 14, 23, 25, { al: 'left', f: DISPLAY, w: 600 });
  txt(g, BRAND, 14, 46, 12.5, { al: 'left', f: FONT_MONO, w: 500 });
}, { gloss: 0 });

/** l'ourson en matrice de points, sur film transparent : seuls les points sont collés */
const sPastille = (r: number, k: SachetLook) => stk(r * 2, r * 2, (g) => {
  g.beginPath();
  g.arc(r, r, r - 1, 0, TAU);
  ink(g, k.paper, 0);
  g.beginPath();
  g.arc(r, r, r - 9, 0, TAU);
  ink(g, null, 1.4);
  // l'ourson calculé point par point : petits points = le pelage, gros points = museau et oreilles, trous = yeux et truffe
  const cells = 15, pitch = (r * 1.36) / cells, o = r - (cells * pitch) / 2;
  const in2 = (x: number, y: number, ox: number, oy: number, rx: number, ry = rx) => ((x - ox) / rx) ** 2 + ((y - oy) / ry) ** 2 < 1;
  g.fillStyle = INK;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const x = ((i + 0.5) / cells) * 2 - 1, y = ((j + 0.5) / cells) * 2 - 1, ax = Math.abs(x);
    const ear = in2(ax, y, 0.62, -0.58, 0.31), head = in2(x, y, 0, 0.08, 0.88, 0.8);
    if (!ear && !head) continue;
    if (in2(ax, y, 0.34, -0.1, 0.13) || in2(x, y, 0, 0.2, 0.16, 0.11)) continue;
    const big = in2(x, y, 0, 0.36, 0.38, 0.28) || (in2(ax, y, 0.62, -0.58, 0.15) && !head);
    g.beginPath();
    g.arc(o + (i + 0.5) * pitch, o + (j + 0.5) * pitch + r * 0.02, pitch * (big ? 0.44 : 0.27), 0, TAU);
    g.fill();
  }
}, { gloss: 0 });

const sHuitLabel = (L: StickerLang, k: SachetLook) => stk(270, 84, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  txt(g, TX.cinq[L], 16, 27, 24, { al: 'left', f: FONT_MONO, w: 500, sp: 3 });
  g.fillStyle = INK;
  g.fillRect(16, 46, W - 32, 1.5);
  txt(g, TX.huit[L], 16, 63, 13.5, { al: 'left', f: FONT_MONO, w: 500, sp: 1, max: W - 32 });
}, { gloss: 0 });

/** huit pastilles : les huit secrètes, sans un mot */
const sHuitPoints = (k: SachetLook) => stk(8 * 26, 14, (g) => {
  g.fillStyle = k.paper;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc(7 + i * 26, 7, 5, 0, TAU);
    g.fill();
  }
}, { gloss: 0 });

// ───────────────────────────────────────────── gabarit « booster du moment »

/** bandeau de papier qui ceinture le sachet (obi) : le nom de l'événement, la mention, « 5 cartes » */
const sObi = (L: StickerLang, k: SachetLook) => stk(PW, 150, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  g.fillStyle = k.tint;
  g.fillRect(0, 0, W, 9);
  g.fillRect(0, H - 9, W, 9);
  txt(g, TX.moment[L], 34, 38, 16, { al: 'left', w: 700, sp: 4 });
  txt(g, k.label, 32, 92, 78, { al: 'left', f: DISPLAY, w: 800, max: 370 });
  g.fillStyle = INK;
  g.fillRect(W - 196, 26, 164, H - 52);
  txt(g, '5', W - 160, H / 2 + 2, 76, { f: DISPLAY, w: 800, col: k.paper });
  txt(g, TX.cartes[L], W - 92, H / 2 + 1, 22, { w: 700, col: k.paper, max: 88 });
}, { gloss: 0.05 });

const sObiBack = (L: StickerLang, k: SachetLook) => stk(PW, 150, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  g.fillStyle = k.tint;
  g.fillRect(0, 0, W, 9);
  g.fillRect(0, H - 9, W, 9);
  txt(g, BRAND, 34, 56, 34, { al: 'left', f: DISPLAY, w: 700 });
  txt(g, `${TX.moment[L]} · ${TX.pasVente[L]}`, 34, 100, 13, { al: 'left', f: FONT_MONO, w: 500, max: W - 190 });
  barcode(g, W - 140, 34, 106, 70, 23);
}, { gloss: 0.05 });

/** étiquette dateuse (pistolet à étiqueter) : la date de fin de l'événement */
const sDate = (L: StickerLang, k: SachetLook) => stk(218, 96, (g, W, H) => {
  g.beginPath();
  g.moveTo(8, 0);
  g.lineTo(W - 8, 0);
  for (let i = 0; i <= 8; i++) g.lineTo(W - (i % 2 ? 0 : 8), (i / 8) * H);
  g.lineTo(8, H);
  for (let i = 8; i >= 0; i--) g.lineTo(i % 2 ? 0 : 8, (i / 8) * H);
  g.closePath();
  ink(g, k.a, 0);
  txt(g, TX.avant[L], W / 2, 24, 13.5, { f: FONT_MONO, w: 500, sp: 1, max: W - 30 });
  txt(g, k.until?.[L] ?? '--/--', W / 2, 62, 48, { f: FONT_MONO, w: 500, sp: 2 });
}, { gloss: 0.05 });

const sPromo = (L: StickerLang, r: number, k: SachetLook) => stk(r * 2, r * 2, (g) => {
  burstPath(g, r, r, r * 0.8, r * 0.98, 18, 0.05);
  ink(g, k.a, 6);
  txt(g, TX.duMoment1[L], r, r * 0.7, r * 0.34, { f: DISPLAY, w: 800, max: r * 1.2 });
  txt(g, TX.duMoment2[L], r, r * 1.14, r * 0.38, { f: DISPLAY, w: 800, max: r * 1.3 });
}, { cut: 6, gloss: 0.3 });

/** ruban adhésif au nom de l'événement, répété */
const sRuban = (k: SachetLook, w: number) => stk(w, 56, (g, W, H) => {
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  const word = k.label;
  g.font = `800 28px ${DISPLAY}`;
  const step = g.measureText(word).width + 46;
  for (let x = 20; x < W; x += step) {
    txt(g, word, x, H / 2 + 1, 28, { al: 'left', f: DISPLAY, w: 800, col: k.a });
    g.fillStyle = k.a;
    g.beginPath();
    g.arc(x + step - 23, H / 2, 4, 0, TAU);
    g.fill();
  }
}, { gloss: 0.7 });

// ───────────────────────────────────────────── les maquettes : quoi, où, penché comment

type Layout = (P: Placer, L: StickerLang, k: SachetLook, seed: number) => void;
const cx = PW / 2;

const LAYOUTS: Record<SachetId, Record<StickerVariant, Layout>> = {
  gaming: {
    // Borne (Teenage Engineering) : tout est aligné sur une grille, numéroté, la couleur sert à repérer la quantité
    a: (P, L, k) => {
      P.put(sBrandTech(L, k, '01'), 166, 152, 0, { fix: true });
      P.put(sLogoCut('gaming', 150), 330, 300, -0.05);
      for (let i = 0; i < 3; i++) P.put(sHeart(9, k.b), 448 + i * 62, 150, 0, { fix: true });
      P.put(sCinqTag(L, k), 186, 680, 0, { fix: true });
      P.put(sDpad(52), 478, 655, 0, { fix: true });
      P.put(sStart(L, 420, k), 242, 822, 0, { fix: true });
      P.put(sCartridge(84, k), 536, 800, 0.08);
    },
    // Chambre d'ado (Brain Dead) : collage qui se chevauche, la manette déborde, rien n'est droit
    b: (P, L, k) => {
      P.put(sCartridge(118, k), 150, 250, -0.3);
      P.put(sLogoCut('gaming', 176), 372, 268, 0.2);
      P.put(sGG(150), 150, 172, -0.16);
      P.put(sHeart(15, k.b), 530, 162, 0.2);
      P.put(sCinqBurst(L, 150, k.a), 200, 716, -0.12);
      P.put(sDpad(64), 470, 640, 0.3);
      P.put(sBrandPill(280), 420, 820, -0.07);
      P.put(sHeart(8, k.b), 560, 728, -0.25);
      P.put(sStar(34, '#fff'), 566, 420, 0.2);
    },
  },
  pop: {
    // Séance : le ticket fait l'encadré, le clap fait la marque
    a: (P, L, k) => {
      P.put(sWow(86, k.a), 492, 184, 0.2);
      P.put(sLogoCut('pop', 150), 250, 262, -0.08);
      P.put(sStar(30, k.b), 110, 150, -0.3);
      P.put(sTicket(L, k), 330, 664, -0.09);
      P.put(sClap(L, 236), 440, 820, 0.06);
      P.put(sStar(38, k.a), 122, 820, 0.25);
    },
    // Zapping (konbini) : dense, joyeux, tout se touche
    b: (P, L, k) => {
      P.put(sVinyl(118, k.a), 168, 232, 0);
      P.put(sLogoCut('pop', 140), 420, 280, 0.1);
      P.put(sGlasses(190), 288, 146, -0.12);
      P.put(sFilm(330), 470, 600, -0.32);
      P.put(sBulle(L, 300, k), 210, 684, 0.05);
      P.put(sWow(74, k.b), 520, 740, -0.15);
      P.put(sBrandPill(270, k.a, INK), 380, 848, 0.05);
      P.put(sStar(30, k.a), 86, 846, 0.3);
      P.put(sStar(26, '#fff'), 560, 420, -0.2);
    },
  },
  sport: {
    // Dossard : une seule grande forme simple, le chiffre fait tout le travail
    a: (P, L, k) => {
      P.put(sLogoCut('sport', 138), 210, 276, -0.1);
      P.put(sWhistle(128, k.a), 492, 316, 0.25);
      P.put(sStrap(k.title[L].toUpperCase(), 330), 410, 160, 0.07);
      P.put(sDossard(L, k), cx, 732, 0.025);
    },
    // Rebond (Feixen) : la même forme répétée fait le mouvement — 1, 2, 3, 4… et le ballon est le cinquième
    b: (P, L, k) => {
      P.put(sRebond(22, 1, INK, '#fff'), 70, 372, 0, { fix: true });
      P.put(sRebond(31, 2, k.a, '#fff'), 112, 262, 0, { fix: true });
      P.put(sRebond(42, 3, '#fff', INK), 196, 172, 0, { fix: true });
      P.put(sRebond(54, 4, INK, k.tint), 322, 158, 0, { fix: true });
      P.put(sLogoCut('sport', 122), 484, 250, 0.3);
      P.put(sLogoCut('gaming', 58), 566, 628, -0.25);
      P.put(sScore(L, k), 214, 668, -0.05);
      P.put(sChrono(70, k.a), 470, 730, 0.14);
      P.put(sStrap(k.title[L].toUpperCase(), 310), 200, 824, -0.05);
      P.put(sBrandPill(230), 470, 860, 0.06);
    },
  },
  monde: {
    // Soute : l'étiquette de bagage, l'étiquette de manutention, le tampon d'entrée
    a: (P, L, k) => {
      P.put(sBagTag(L, k), 148, 266, -0.04);
      P.put(sLogoCut('monde', 136), 428, 262, 0.06);
      P.put(sFragile(L, k), 300, 676, -0.04);
      P.put(sAvion(L, k), 150, 838, 0.09);
      P.put(sTampon(L, 86, k), 478, 822, -0.18);
    },
    // Passeport : vieilles étiquettes d'hôtel, timbre, tampons qui se chevauchent
    b: (P, L, k) => {
      P.put(sBoussole(54, k), 108, 166, 0.2);
      P.put(sLogoRound('monde', 132, k.paper), 288, 270, -0.05);
      P.put(sTimbre(128, k), 500, 200, 0.14);
      P.put(sAvion(L, k), 486, 366, -0.1);
      P.put(sLosange(L, 228, k), 176, 708, -0.05);
      P.put(sOvale(280, k), 428, 780, 0.1);
      P.put(sTampon(L, 66, k), 446, 628, 0.3);
    },
  },
  bebou: {
    // Sceau (Kenya Hara) : presque rien. Une bande de garantie sur la ligne de déchirure, une petite étiquette.
    a: (P, L, k) => {
      P.put(sSceau(L, k), cx, 176, 0, { fix: true });
      P.put(sPetite(L, k), 146, 846, 0, { fix: true });
    },
    // Pastille (Nothing + Hara) : une seule pastille de papier, l'ourson en matrice de points dedans ; huit points
    // pour les huit secrètes ; une étiquette technique. Tout est calé sur la même marge gauche, sauf la pastille.
    b: (P, L, k) => {
      P.put(sPastille(104, k), 432, 246, 0, { fix: true });
      P.put(sHuitPoints(k), 52 + 104, 612, 0, { fix: true });
      P.put(sHuitLabel(L, k), 52 + 135, 836, 0, { fix: true });
    },
  },
  tele: { a: momentA, b: momentB },
  noel: { a: momentA, b: momentB },
};

/** gabarit A — Obi : le bandeau de papier ceinture le sachet (il continue au dos), l'étiquette dateuse dit jusqu'à quand */
function momentA(P: Placer, L: StickerLang, k: SachetLook) {
  P.put(sLogoCut(k.logo, 142), cx, 262, -0.05);
  P.put(sObi(L, k), cx, 676, 0, { fix: true });
  P.put(sDate(L, k), 470, 824, -0.08);
  P.put(sBrandPill(220), 168, 838, 0.04);
  P.back(sObiBack(L, k), cx, 676, 0);
}

/** gabarit B — Promo (konbini) : pastille éclatée, ruban au nom de l'événement en travers du coin */
function momentB(P: Placer, L: StickerLang, k: SachetLook) {
  P.put(sRuban(k, 620), 250, 792, -0.42, { fix: true });
  P.put(sLogoCut(k.logo, 132), 410, 276, 0.1);
  P.put(sPromo(L, 112, k), 166, 208, -0.14);
  P.put(sCinqCase(L, 250, k.paper), 420, 640, 0.05);
  P.put(sDate(L, k), 440, 830, 0.07);
  P.put(sBrandPill(210), 150, 610, -0.06);
}

// ───────────────────────────────────────────── le sachet complet

export interface StickerPackArt extends PackArt {
  /** R = autocollant sur la face · G = brillant (0 papier, 1 vinyle) · B = autocollant au dos */
  stickers: Texture;
  /** la face en 2D (vignettes) : relief du nom ombré + autocollants */
  thumb: HTMLCanvasElement;
}

/**
 * Le visuel d'un sachet « Autocollant » : le sachet simple du jeu (même alu, mêmes plis, même nom moulé), les
 * autocollants de la variante collés par-dessus. `seed` = le booster : il tire ses plis ET la pose des autocollants.
 */
export async function stickerPackArt(id: SachetId, variant: StickerVariant, L: StickerLang, seed = 1, film: { tint?: string; alloyMix?: number } = {}): Promise<StickerPackArt> {
  // `film` : essai d'une autre teinte dans le labo (les étiquettes qui reprennent la teinte suivent)
  const k: SachetLook = { ...SACHETS[id], ...(film.tint ? { tint: film.tint } : {}), ...(film.alloyMix !== undefined ? { alloyMix: film.alloyMix } : {}) };
  await ensureFonts();
  await Promise.all(
    [`800 60px ${DISPLAY}`, `700 30px ${DISPLAY}`, `600 30px ${DISPLAY}`, `700 30px ${FONT_LABEL}`, `500 30px ${FONT_MONO}`].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const art = await generatePackArt({ name: `autocollant-${id}-${seed}`, ground: k.tint, ground2: k.tint, ink: INK, foil: '#ffffff', accent: k.tint, simple: true, label: k.label, alloyMix: k.alloyMix });
  const F = art.front.image as HTMLCanvasElement, B = art.back.image as HTMLCanvasElement;
  const thumb = art.thumbFront ?? F;
  const fronts = [F.getContext('2d') as Ctx];
  if (thumb !== F) fronts.push(thumb.getContext('2d') as Ctx);
  const M = makeCanvas(PW / 2, Math.round(PH / 2));
  M.g.fillStyle = '#000';
  M.g.fillRect(0, 0, M.c.width, M.c.height);
  M.g.scale(0.5, 0.5);
  const P = placer(fronts, B.getContext('2d') as Ctx, M.g, seed);
  LAYOUTS[id][variant](P, L, k, seed);
  if (id !== 'tele' && id !== 'noel') P.back(sBackLabel(k, L, seed), cx, PH * 0.6, id === 'bebou' ? 0 : -0.03);
  P.flush();
  art.front.needsUpdate = true;
  art.back.needsUpdate = true;
  const stickers = new CanvasTexture(M.c);
  stickers.colorSpace = NoColorSpace;
  return {
    ...art,
    stickers,
    thumb,
    gpuTextures: [...art.gpuTextures, stickers],
    dispose: () => {
      art.dispose();
      stickers.dispose();
    },
  };
}

/**
 * Le maillage du sachet (celui du jeu) avec la matière des autocollants : là où le masque dit « autocollant », le film
 * teinté et le métal laissent la place à du papier (mat) ou du vinyle (satiné). Les plis du film passent dessous :
 * l'autocollant suit le sachet.
 */
export function createStickerPackMesh(art: StickerPackArt) {
  const mats = createPackMaterials(art);
  const mk = texture(art.stickers, uv());
  mats.forEach((m, side) => {
    const s: N = side === 0 ? mk.r : mk.b;
    const gloss: N = side === 0 ? mk.g : float(0.1);
    const col: N = texture(side === 0 ? art.front : art.back, uv()).rgb;
    m.colorNode = mix(col.mul(PLASTIC_TINT), col, s);
    m.metalnessNode = float(1).sub(s);
    m.roughnessNode = mix(m.roughnessNode as N, mix(float(0.8), float(0.36), gloss), s);
    m.clearcoatNode = mix(m.clearcoatNode as N, mix(float(0), float(0.3), gloss), s);
  });
  const mesh = new Mesh(createPackGeometry(), mats);
  mesh.name = 'pack';
  return mesh;
}

/** hauteur de la soudure sur la toile (pour le labo) */
export const STICKER_CRIMP = CH;
