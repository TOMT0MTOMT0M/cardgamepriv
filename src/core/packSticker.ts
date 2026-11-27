import { CanvasTexture, Mesh, MeshStandardNodeMaterial, NoColorSpace, type Texture } from 'three/webgpu';
import { float, fract, mix, normalMap, positionLocal, sin, smoothstep, step, texture, uv, vec2, vec3 } from 'three/tsl';
import { EVENT_THEMES, eventThemeOf, type EventThemeId } from './events';
import { makeCanvas, roundRect, type Ctx } from './art/canvas';
import { FONT_MONO } from './art/frame';
import { ensureFonts } from './art';
import { FONT_LABEL, FONT_PACK, FONT_TEXT } from './fonts';
import { PACK, PH, PW, lcg } from './packCrease';
import { createPackGeometry, createPackMaterials, generatePackArt, PLASTIC_TINT, type PackArt } from './pack';
import { drawThemeLogo, type CartoonTheme } from './packCartoon';
import { encodeNormal, type N } from './tsl';

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
  /** (passe 2) encres de l'habillage imprimé : l'aplat, son ton sombre (bandes, motif) et son ton clair */
  ink: [string, string, string];
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

/** (passe 4) encres d'une teinte : l'aplat, son ton sombre (bandes, motif) et son ton clair — pour tout essai de couleur */
const hx = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export function inkOf(tint: string): [string, string, string] {
  const c = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
  const f = (m: (v: number) => number) => `#${c.map((v) => hx(m(v))).join('')}`;
  return [tint, f((v) => v * 0.74), f((v) => v + (255 - v) * 0.38)];
}

/**
 * (passe 4, retour de Hugo) BÉBOU PACK : plus vif que le noir. Recommandation = la première (turquoise) : c'est la
 * seule teinte libre de l'étagère (Gaming noir, Pop orange, Sport jaune, World vert citron) et elle reste loin des
 * teintes de rareté. Le rose bonbon se lit « rose irisé » (la rareté du haut) et se frotte au fuchsia des événements ;
 * l'orange vif double Pop.
 */
export const BEBOU_COLORS = {
  turquoise: { name: 'Turquoise', tint: '#10d0d8' }, // i18n-ok (labo)
  rose: { name: 'Rose bonbon', tint: '#ff4fa0' }, // i18n-ok (labo)
  orange: { name: 'Orange vif', tint: '#ff7a00' }, // i18n-ok (labo)
} as const;
export type BebouColor = keyof typeof BEBOU_COLORS;

/**
 * (passe 4, retour de Hugo) BOOSTER DU MOMENT : sa couleur suit le thème de l'événement en cours. (27/11, V3) la table
 * vit dans src/core/events.ts (le dashboard en tire sa palette, le serveur peut la lire) ; `logo` : dessin de packCartoon.
 */
export { EVENT_THEMES, type EventThemeId };

// (27/11, V3 — contrôle i18n) `title` : déjà en FR et EN, choisis par la langue du joueur ; `label` : nom moulé (marque,
// le même dans les deux langues, validé par Hugo) ; `mots` et `variants` : fiche du labo, jamais montrée au joueur
export const SACHETS: Record<SachetId, SachetLook> = {
  gaming: {
    title: { fr: 'Gaming', en: 'Gaming' }, label: 'Gaming', tint: '#1b1b21', alloyMix: 0.5, ink: ['#202027', '#0b0b0e', '#5a5a68'], logo: 'gaming', paper: '#f6f4ff', a: '#e6ff3d', b: '#ff4d6d', // i18n-ok
    mots: 'arcade · bidouille · numéroté', // i18n-ok (labo)
    variants: { a: { name: 'Borne', by: 'Teenage Engineering' }, b: { name: 'Chambre d’ado', by: 'Brain Dead' } }, // i18n-ok (labo)
  },
  pop: {
    title: { fr: 'Pop culture', en: 'Pop culture' }, label: 'Popculture', tint: '#ff6a1f', alloyMix: 0.4, ink: ['#ff6a1f', '#df4a06', '#ff9950'], logo: 'pop', paper: '#fff6e3', a: '#ff4fa3', b: '#2b2bd6', // i18n-ok
    mots: 'séance · zapping · fan', // i18n-ok (labo)
    variants: { a: { name: 'Séance', by: 'Brain Dead' }, b: { name: 'Zapping', by: 'konbini' } }, // i18n-ok (labo)
  },
  sport: {
    title: { fr: 'Sport & esport', en: 'Sport & esport' }, label: 'Sport', tint: '#ffd60a', alloyMix: 0.4, ink: ['#ffd60a', '#e3b000', '#ffe96b'], logo: 'sport', paper: '#ffffff', a: '#ff4b1f', b: '#141016', // i18n-ok
    mots: 'jour de match · dossard · rebond', // i18n-ok (labo)
    variants: { a: { name: 'Dossard', by: 'Studio Feixen + Teenage Engineering' }, b: { name: 'Rebond', by: 'Studio Feixen' } }, // i18n-ok (labo)
  },
  monde: {
    title: { fr: 'Le monde', en: 'The world' }, label: 'World', tint: '#a6ee0c', alloyMix: 0.4, ink: ['#a6ee0c', '#86cb00', '#c9ff5e'], logo: 'monde', paper: '#efe1c2', a: '#ff7a1a', b: '#1c2a5e', // i18n-ok
    mots: 'valise · tampon · escale', // i18n-ok (labo)
    variants: { a: { name: 'Soute', by: 'Virgil Abloh + Teenage Engineering' }, b: { name: 'Passeport', by: 'Brain Dead' } }, // i18n-ok (labo)
  },
  bebou: {
    title: { fr: 'Bébou pack', en: 'Bébou pack' }, label: 'Bebou', tint: BEBOU_COLORS.turquoise.tint, alloyMix: 0.4, ink: inkOf(BEBOU_COLORS.turquoise.tint), logo: 'bebou', paper: '#f1e9d8', a: '#f1e9d8', b: '#c9b99a', // i18n-ok
    mots: 'silence · sceau · rare', // i18n-ok (labo)
    variants: { a: { name: 'Sceau', by: 'Kenya Hara' }, b: { name: 'Pastille', by: 'Nothing + Kenya Hara' } }, // i18n-ok (labo)
  },
  tele: {
    title: { fr: `Booster du moment · ${EVENT_THEMES.tele.fr}`, en: `Limited booster · ${EVENT_THEMES.tele.en}` }, label: EVENT_THEMES.tele.label, tint: EVENT_THEMES.tele.tint, alloyMix: 0.4, ink: inkOf(EVENT_THEMES.tele.tint), logo: 'tele', paper: '#fffdf5', a: '#ffe500', b: '#141016', // i18n-ok
    until: { fr: '02/12', en: 'DEC 2' },
    mots: 'éphémère · daté · bandeau', // i18n-ok (labo)
    variants: { a: { name: 'Obi', by: 'konbini + Virgil Abloh' }, b: { name: 'Promo', by: 'konbini' } }, // i18n-ok (labo)
  },
  noel: {
    title: { fr: `Booster du moment · ${EVENT_THEMES.noel.fr}`, en: `Limited booster · ${EVENT_THEMES.noel.en}` }, label: EVENT_THEMES.noel.label, tint: EVENT_THEMES.noel.tint, alloyMix: 0.4, ink: inkOf(EVENT_THEMES.noel.tint), logo: 'noel', paper: '#fffdf5', a: '#ffe500', b: '#141016', // i18n-ok
    until: { fr: '26/12', en: 'DEC 26' },
    mots: 'éphémère · daté · bandeau', // i18n-ok (labo)
    variants: { a: { name: 'Obi', by: 'konbini + Virgil Abloh' }, b: { name: 'Promo', by: 'konbini' } }, // i18n-ok (labo)
  },
};
export const SACHET_IDS = Object.keys(SACHETS) as SachetId[];

const INK = '#141016';
const TAU = Math.PI * 2;
const CH = (PACK.crimp / PACK.h) * PH;
const DISPLAY = FONT_TEXT; // Bold Frame (800 = Bold Frame Two)

/**
 * Textes des étiquettes, FR et EN. (V3, ménage 27/11) GARDÉS ICI, pas dans les dictionnaires i18n, exprès :
 *  - ce ne sont pas des textes d'interface mais du dessin : chaque mot est calé à la main dans son autocollant (corps,
 *    approche, largeur max) — une traduction changée dans un dictionnaire déborderait sans que rien ne le signale ;
 *  - la langue est un PARAMÈTRE (`L`) : le labo 047 montre FR ou EN quelle que soit la langue de l'interface, alors que
 *    `t()` ne sert que la langue active (le dictionnaire anglais n'est même pas chargé sur un jeu en français) ;
 *  - le jeu passe déjà la langue du joueur (`gameSachetArt(…, lang())`, opening.ts) : rien n'est en dur côté joueur.
 * Toile refaite à chaque chargement (aucun cache versionné) : changer un texte ici change le rendu au prochain lancement.
 */
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
  serie: { fr: 'SÉRIE', en: 'SERIES' }, // i18n-ok
  lot: { fr: 'LOT', en: 'LOT' }, // i18n-ok
  secretes: { fr: '8 SECRÈTES', en: '8 SECRETS' }, // i18n-ok
} satisfies Record<string, L2>;
// (27/11, passe 2 — Tom) la marque sur les sachets : « Bebou » seul, dans la police du nom moulé (Matcha World)
const BRAND = 'Bebou'; // i18n-ok (marque)
const BRAND_F = { f: FONT_PACK, w: 400 } as const;

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
  /**
   * (passe 3 — Tom) colle un autocollant qui MORD LÉGÈREMENT sur les lettres en relief du nom. Jamais au même endroit :
   * le booster (graine) tire l'un des emplacements proposés (`slots` : au-dessus ou au-dessous des lettres, plage
   * d'abscisses), la profondeur de la morsure, la taille et l'inclinaison dans les plages données.
   */
  over(s: Stk, slots: Array<{ side: 'haut' | 'bas'; x: [number, number] }>, o?: { depth?: [number, number]; scale?: [number, number]; rot?: [number, number] }): void;
}

/** boîte des lettres moulées sur la toile (mesurée sur le nom du sachet) */
interface NameBox {
  top: number;
  bot: number;
}

function placer(fronts: Ctx[], back: Ctx, mask: Ctx, seed: number, name: NameBox, salt: number, backMask = true): Placer & { flush(): void } {
  const rnd = lcg(seed * 2654435761 + 97);
  // tirage à part pour la morsure (ajouter un autocollant ailleurs ne la déplace pas), salé par le sachet : à graine
  // égale, deux thèmes ne mordent pas au même endroit
  const rndOver = lcg(seed * 40503 + salt * 7919 + 13);
  const lerp = (r: [number, number], t: number) => r[0] + (r[1] - r[0]) * t;
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
    over(s, slots, o = {}) {
      for (let i = 0; i < 3; i++) rndOver();
      const slot = slots[Math.floor(rndOver() * slots.length) % slots.length];
      const sc = lerp(o.scale ?? [0.88, 1.16], rndOver());
      const rot = lerp(o.rot ?? [-0.28, 0.28], rndOver());
      const depth = lerp(o.depth ?? [14, 36], rndOver());
      // demi-encombrement de la toile tournée (l'autocollant reste dans le sachet, et sa morsure est mesurée au bord)
      const hw = ((Math.abs(Math.cos(rot)) * s.c.width + Math.abs(Math.sin(rot)) * s.c.height) / 2) * sc;
      const hh = ((Math.abs(Math.sin(rot)) * s.c.width + Math.abs(Math.cos(rot)) * s.c.height) / 2) * sc * 0.9;
      const x = Math.max(hw + 12, Math.min(PW - hw - 12, lerp(slot.x, rndOver())));
      const y = slot.side === 'haut' ? name.top + depth - hh : name.bot - depth + hh;
      this.put(s, x, y, rot, { fix: true, scale: sc });
    },
    back(s, x, y, rot = 0) {
      backs.push(() => {
        stamp(back, s.c, x, y, rot, 1, true);
        // (jeu) le dos est entièrement imprimé : sa couverture se calcule dans le matériau, le canal B reste à la déchirure
        if (!backMask) return;
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
  txt(g, BRAND, W / 2, H * 0.53, H * 0.6, { ...BRAND_F, col: fg, max: W * 0.8 });
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
  txt(g, BRAND, 22, 164, 24, { al: 'left', ...BRAND_F });
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
  txt(g, BRAND, H + 12, 22, 25, { al: 'left', ...BRAND_F, max: W - H - 22 });
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
  txt(g, BRAND, W / 2, bar + (H - bar) * 0.4, H * 0.3, { ...BRAND_F, col: '#fff8ea', max: W * 0.86 });
  txt(g, TX.scene[L], W / 2, bar + (H - bar) * 0.76, H * 0.085, { f: FONT_MONO, w: 500, col: '#fff8ea', sp: 1, max: W * 0.86 });
}, { cut: 5, gloss: 0.3 });

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
  txt(g, BRAND, W / 2, 26, 30, { ...BRAND_F, col: '#fff' });
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
  txt(g, BRAND, W / 2, H * 0.44, H * 0.32, { ...BRAND_F, col: k.b, max: W * 0.72 });
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

const sPetite = (L: StickerLang, k: SachetLook) => stk(168, 54, (g, W, H) => {
  g.fillStyle = k.paper;
  g.fillRect(0, 0, W, H);
  txt(g, TX.cartesMin[L], 16, H / 2 + 1, 28, { al: 'left', f: DISPLAY, w: 600 });
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
  txt(g, BRAND, 34, 56, 42, { al: 'left', ...BRAND_F });
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

// ───────────────────────────────────────────── (passe 4) petits autocollants en plus : repères, mentions, pictos

/** repère de déchirure : petit triangle de papier découpé, pointé vers le sachet (dir > 0 = bord gauche) */
const sChevron = (k: SachetLook, dir: number) => stk(22, 26, (g, W, H) => {
  g.beginPath();
  if (dir > 0) {
    g.moveTo(1, 1);
    g.lineTo(W - 1, H / 2);
    g.lineTo(1, H - 1);
  } else {
    g.moveTo(W - 1, 1);
    g.lineTo(1, H / 2);
    g.lineTo(W - 1, H - 1);
  }
  g.closePath();
  ink(g, k.paper, 0);
}, { cut: 3, gloss: 0.1 });

/** mention en petite étiquette de papier (mono) : la série, le thème */
const sChip = (text: string, w: number, bg: string, fg = INK) => stk(w, 34, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 7);
  ink(g, bg, 0);
  txt(g, text, W / 2, H / 2 + 1, 17, { f: FONT_MONO, w: 500, col: fg, sp: 1.5, max: W - 20 });
}, { gloss: 0.1 });

/** pastille de code-barres : la mention de lot, au pied du sachet */
const sBarChip = (k: SachetLook, L: StickerLang, seed: number) => stk(190, 58, (g, W, H) => {
  roundRect(g, 0, 0, W, H, 6);
  ink(g, k.paper, 0);
  barcode(g, 12, 8, 98, H - 16, seed + 7);
  txt(g, TX.lot[L], 150, 20, 14, { f: FONT_MONO, w: 500 });
  txt(g, String(seed).padStart(2, '0'), 150, 40, 20, { f: FONT_MONO, w: 500 });
}, { gloss: 0.05 });

/** pièce d'arcade : ovale haut, fente au centre (Gaming) */
const sCoin = (r: number, col: string) => stk(r * 1.5, r * 2, (g, W, H) => {
  g.beginPath();
  g.ellipse(W / 2, H / 2, W / 2 - 3, H / 2 - 3, 0, 0, TAU);
  ink(g, col, 6);
  g.beginPath();
  g.ellipse(W / 2, H / 2, W / 2 - 13, H / 2 - 13, 0, 0, TAU);
  ink(g, null, 3);
  roundRect(g, W / 2 - 4.5, H * 0.3, 9, H * 0.4, 4.5);
  ink(g, INK, 0);
}, { cut: 5, gloss: 0.95 });

/** étoile du générique (Pop culture) */
const sEtoile = (r: number, col: string) => stk(r * 2, r * 2, (g) => {
  burstPath(g, r, r, r * 0.46, r * 0.94, 5, -Math.PI / 2 / 5);
  ink(g, col, 6);
}, { cut: 5, gloss: 0.85 });

/** podium : 2 · 1 · 3 (Sport) */
const sPodium = (w: number, k: SachetLook) => stk(w, w * 0.78, (g, W, H) => {
  const bw = W / 3, hs = [0.62, 1, 0.42];
  [1, 0, 2].forEach((slot, i) => {
    const h = H * hs[slot];
    g.beginPath();
    g.rect(i * bw + 1.5, H - h, bw - 3, h);
    ink(g, slot === 0 ? k.a : '#fff', 5);
    txt(g, String(slot + 1), i * bw + bw / 2, H - h / 2 + 1, bw * 0.7, { f: DISPLAY, w: 800, col: slot === 0 ? '#fff' : INK });
  });
}, { cut: 4, gloss: 0.6 });

/** épingle de carte (Le monde) */
const sPin = (r: number, k: SachetLook) => stk(r * 1.6, r * 2.3, (g, W, H) => {
  g.beginPath();
  g.moveTo(W / 2, H - 3);
  g.bezierCurveTo(-W * 0.2, H * 0.5, W * 0.02, 3, W / 2, 3);
  g.bezierCurveTo(W * 0.98, 3, W * 1.2, H * 0.5, W / 2, H - 3);
  g.closePath();
  ink(g, k.a, 6);
  g.beginPath();
  g.arc(W / 2, H * 0.38, W * 0.2, 0, TAU);
  ink(g, '#fff', 4);
}, { cut: 5, gloss: 0.9 });

/** empreinte de patte d'ourson : un coussinet, quatre doigts (Bébou Pack) */
const sPatte = (r: number, col: string, cut: string) => stk(r * 2, r * 2, (g) => {
  g.fillStyle = col;
  const e = (x: number, y: number, rx: number, ry: number, rot: number) => {
    g.beginPath();
    g.ellipse(r + x * r, r + y * r, rx * r, ry * r, rot, 0, TAU);
    g.fill();
  };
  e(0, 0.34, 0.5, 0.42, 0);
  e(-0.68, -0.08, 0.17, 0.25, -0.5);
  e(-0.24, -0.5, 0.19, 0.28, -0.12);
  e(0.24, -0.5, 0.19, 0.28, 0.12);
  e(0.68, -0.08, 0.17, 0.25, 0.5);
}, { cut: 4, cutCol: cut, gloss: 0.7 });

// ───────────────────────────────────────────── les maquettes : quoi, où, penché comment

type Layout = (P: Placer, L: StickerLang, k: SachetLook, seed: number) => void;
const cx = PW / 2;

const LAYOUTS: Record<SachetId, Record<StickerVariant, Layout>> = {
  gaming: {
    // Borne (Teenage Engineering) : tout est aligné sur une grille, numéroté, la couleur sert à repérer la quantité
    a: (P, L, k) => {
      P.put(sBrandTech(L, k, '01'), 166, 152, 0, { fix: true });
      P.put(sLogoCut('gaming', 150), 330, 300, -0.05);
      for (let i = 0; i < 2; i++) P.put(sHeart(9, k.b), 510 + i * 62, 150, 0, { fix: true });
      // la troisième vie est tombée sur le nom
      P.over(sHeart(11, k.b), [{ side: 'haut', x: [500, 590] }, { side: 'bas', x: [400, 590] }, { side: 'haut', x: [40, 120] }]);
      P.put(sCinqTag(L, k), 186, 694, 0, { fix: true });
      P.put(sStart(L, 420, k), 242, 830, 0, { fix: true });
    },
    // Chambre d'ado (Brain Dead) : collage qui se chevauche, la manette déborde, rien n'est droit
    b: (P, L, k) => {
      P.put(sCartridge(118, k), 150, 250, -0.3);
      P.put(sLogoCut('gaming', 176), 372, 268, 0.2);
      P.put(sGG(150), 150, 172, -0.16);
      P.put(sCinqBurst(L, 156, k.a), 204, 730, -0.12);
      P.put(sBrandPill(230), 452, 800, -0.07);
      P.put(sChip(`${TX.serie[L]} · ${k.title[L].toUpperCase()}`, 230, k.a), 470, 128, 0.03);
      P.put(sCoin(36, k.a), 556, 650, 0.2);
      P.over(sHeart(15, k.b), [{ side: 'bas', x: [410, 590] }, { side: 'haut', x: [40, 110] }, { side: 'bas', x: [330, 470] }], { scale: [0.8, 1.2] });
    },
  },
  pop: {
    // Séance : le ticket fait l'encadré, le clap fait la marque
    a: (P, L, k) => {
      P.put(sLogoCut('pop', 156), 236, 262, -0.08);
      P.put(sTicket(L, k), 322, 676, -0.09);
      P.put(sClap(L, 220), 452, 826, 0.06);
      P.over(sGlasses(176), [{ side: 'haut', x: [440, 560] }, { side: 'haut', x: [400, 500] }, { side: 'bas', x: [470, 570] }], { scale: [0.8, 1.1] });
    },
    // Zapping (konbini) : dense, joyeux, tout se touche
    b: (P, L, k) => {
      P.put(sVinyl(118, k.a), 168, 232, 0);
      P.put(sLogoCut('pop', 140), 420, 280, 0.1);
      P.put(sFilm(330), 480, 640, -0.32);
      P.put(sBulle(L, 310, k), 214, 700, 0.05);
      P.put(sBrandPill(230, k.a, INK), 440, 840, 0.05);
      P.put(sChip(`${TX.serie[L]} · ${k.title[L].toUpperCase()}`, 250, k.paper), 150, 126, -0.03);
      P.put(sEtoile(38, '#ffe500'), 568, 118, 0.3);
      P.over(sGlasses(180), [{ side: 'haut', x: [100, 210] }, { side: 'bas', x: [90, 230] }, { side: 'haut', x: [150, 260] }], { scale: [0.8, 1.1] });
    },
  },
  sport: {
    // Dossard : une seule grande forme simple, le chiffre fait tout le travail
    a: (P, L, k) => {
      P.put(sLogoCut('sport', 138), 210, 270, -0.1);
      P.put(sStrap(k.title[L].toUpperCase(), 330), 410, 160, 0.07);
      P.put(sDossard(L, k), cx, 740, 0.025);
      P.over(sWhistle(128, k.a), [{ side: 'haut', x: [400, 560] }, { side: 'haut', x: [460, 580] }, { side: 'bas', x: [520, 580] }], { scale: [0.8, 1.15], rot: [-0.1, 0.45] });
    },
    // Rebond (Feixen) : la même forme répétée fait le mouvement — 1, 2, 3, 4… et le ballon est le cinquième
    b: (P, L, k) => {
      P.put(sRebond(22, 1, INK, '#fff'), 70, 372, 0, { fix: true });
      P.put(sRebond(31, 2, k.a, '#fff'), 112, 262, 0, { fix: true });
      P.put(sRebond(42, 3, '#fff', INK), 196, 172, 0, { fix: true });
      P.put(sRebond(54, 4, INK, k.tint), 322, 158, 0, { fix: true });
      P.put(sLogoCut('sport', 122), 484, 250, 0.3);
      P.put(sScore(L, k), 214, 676, -0.05);
      P.put(sChrono(70, k.a), 470, 740, 0.14);
      P.over(sLogoCut('gaming', 58), [{ side: 'bas', x: [400, 580] }, { side: 'haut', x: [170, 330] }, { side: 'bas', x: [300, 480] }], { scale: [0.85, 1.3] });
      P.put(sStrap(k.title[L].toUpperCase(), 310), 200, 824, -0.05);
      P.put(sBrandPill(230), 470, 860, 0.06);
      P.put(sChip(`${TX.serie[L]} · SPORT`, 168, k.paper), 118, 106, -0.03);
      P.put(sPodium(116, k), 556, 628, 0.08);
    },
  },
  monde: {
    // Soute : l'étiquette de bagage, l'étiquette de manutention, le tampon d'entrée
    a: (P, L, k) => {
      P.put(sBagTag(L, k), 148, 266, -0.04);
      P.put(sLogoCut('monde', 136), 428, 262, 0.06);
      // le tampon d'entrée est donné sur le nom, comme sur un passeport ; l'étiquette de manutention passe par-dessus
      P.over(sTampon(L, 86, k), [{ side: 'bas', x: [380, 560] }, { side: 'bas', x: [90, 240] }, { side: 'bas', x: [300, 470] }], { scale: [0.78, 1.05], rot: [-0.4, 0.4], depth: [18, 40] });
      P.put(sFragile(L, k), 300, 706, -0.04);
      P.put(sAvion(L, k), 450, 850, 0.09);
    },
    // Passeport : vieilles étiquettes d'hôtel, timbre, tampons qui se chevauchent
    b: (P, L, k) => {
      P.put(sBoussole(54, k), 108, 166, 0.2);
      P.put(sLogoRound('monde', 132, k.paper), 288, 270, -0.05);
      P.put(sTimbre(128, k), 500, 200, 0.14);
      P.put(sLosange(L, 228, k), 176, 720, -0.05);
      P.put(sOvale(280, k), 428, 790, 0.1);
      P.put(sChip(`${TX.serie[L]} · ${k.title[L].toUpperCase()}`, 220, k.paper), 330, 112, -0.04);
      P.put(sPin(34, k), 548, 650, 0.16);
      P.over(sAvion(L, k), [{ side: 'haut', x: [400, 540] }, { side: 'bas', x: [340, 540] }, { side: 'haut', x: [90, 200] }], { scale: [0.85, 1.15], rot: [-0.2, 0.2] });
    },
  },
  bebou: {
    // Sceau (Kenya Hara) : presque rien. Une bande de garantie sur la ligne de déchirure, une petite étiquette.
    // (passe 4, retour de Hugo : « plus fourni ») le sceau garde la ligne de déchirure ; autour, l'ourson, ses empreintes
    // et les mentions du club — de quoi remplir sans casser la grille
    a: (P, L, k) => {
      P.put(sSceau(L, k), cx, 190, 0, { fix: true });
      P.put(sLogoCut('bebou', 84), 120, 270, -0.1);
      P.put(sStrap(TX.secretes[L], 250), 480, 268, 0.07);
      P.put(sChip(TX.club[L], 190, INK, k.paper), 146, 128, -0.03);
      P.over(sPetite(L, k), [{ side: 'bas', x: [110, 250] }, { side: 'bas', x: [390, 530] }, { side: 'bas', x: [240, 400] }], { scale: [0.95, 1.1], rot: [-0.05, 0.05], depth: [8, 18] });
      P.put(sCinqBurst(L, 100, k.paper), 140, 690, -0.1);
      P.put(sPatte(30, INK, k.paper), 300, 640, 0.35);
      P.put(sPatte(30, INK, k.paper), 380, 700, -0.3);
      P.put(sPatte(30, INK, k.paper), 470, 650, 0.4);
      P.put(sHuitLabel(L, k), 300, 790, -0.02);
      P.put(sBrandPill(210, INK, k.paper), 500, 830, 0.05);
      P.put(sBarChip(k, L, 8), 120, 840, 0.03);
    },
    // Pastille (Nothing + Hara) : une seule pastille de papier, l'ourson en matrice de points dedans ; huit points
    // pour les huit secrètes ; une étiquette technique. Tout est calé sur la même marge gauche, sauf la pastille.
    b: (P, L, k) => {
      P.over(sPastille(104, k), [{ side: 'haut', x: [380, 520] }, { side: 'haut', x: [300, 440] }, { side: 'haut', x: [120, 240] }], { scale: [0.82, 1.05], rot: [0, 0], depth: [16, 38] });
      P.put(sHuitPoints(k), 52 + 104, 612, 0, { fix: true });
      P.put(sHuitLabel(L, k), 52 + 135, 760, 0, { fix: true });
      // (passe 4) plus fourni : la série, un « 5 » franc, la trace de l'ourson, la marque, le lot
      P.put(sChip(TX.club[L], 190, INK, k.paper), 140, 128, -0.03);
      P.put(sStrap(TX.secretes[L], 250), 480, 208, 0.06);
      P.put(sCinqBurst(L, 96, k.paper), 500, 680, 0.1);
      P.put(sPatte(26, INK, k.paper), 120, 678, -0.4);
      P.put(sPatte(26, INK, k.paper), 200, 660, 0.3);
      P.put(sBrandPill(200, INK, k.paper), 430, 830, -0.04);
      P.put(sBarChip(k, L, 8), 130, 850, 0.02);
    },
  },
  tele: { a: momentA, b: momentB },
  noel: { a: momentA, b: momentB },
};

/** gabarit A — Obi : le bandeau de papier ceinture le sachet (il continue au dos), l'étiquette dateuse dit jusqu'à quand */
function momentA(P: Placer, L: StickerLang, k: SachetLook) {
  // le logo de l'événement descend sur le nom (le héros qui déborde sur le titre, comme sur un booster)
  P.over(sLogoCut(k.logo, 142), [{ side: 'haut', x: [200, 300] }, { side: 'haut', x: [300, 440] }, { side: 'haut', x: [260, 380] }], { scale: [0.9, 1.08], rot: [-0.14, 0.14], depth: [10, 26] });
  P.put(sObi(L, k), cx, 676, 0, { fix: true });
  P.put(sDate(L, k), 470, 824, -0.08);
  P.put(sBrandPill(220), 168, 838, 0.04);
  P.back(sObiBack(L, k), cx, 676, 0);
}

/** gabarit B — Promo (konbini) : pastille éclatée, ruban au nom de l'événement en travers du coin */
function momentB(P: Placer, L: StickerLang, k: SachetLook) {
  P.put(sRuban(k, 620), 250, 792, -0.42, { fix: true });
  P.over(sLogoCut(k.logo, 132), [{ side: 'haut', x: [370, 480] }, { side: 'haut', x: [330, 430] }, { side: 'haut', x: [400, 500] }], { scale: [0.9, 1.1], rot: [-0.05, 0.22], depth: [10, 26] });
  P.put(sPromo(L, 112, k), 166, 208, -0.14);
  P.put(sCinqCase(L, 250, k.paper), 420, 640, 0.05);
  P.put(sDate(L, k), 440, 830, 0.07);
  P.put(sBrandPill(210), 150, 610, -0.06);
  P.put(sBarChip(k, L, 5), 508, 744, -0.05);
  P.put(sEtoile(34, k.paper), 548, 124, 0.25);
}

// ───────────────────────────────────────────── l'habillage (passe 2) : le film est IMPRIMÉ, l'alu reste en réserve

/**
 * (27/11, passe 2 — retours de Tom : « réduire le côté no brand / alu, mieux habiller, moins de reflets ») Comme un
 * vrai booster, le film est imprimé : un aplat d'encre franche avec un motif ton sur ton propre au thème (jamais de
 * texte), une bande sombre en haut (zone de déchirure, deux repères) et en bas (le socle). L'aluminium ne reste
 * visible qu'en RÉSERVE : les soudures, et une fenêtre derrière le nom moulé — le nom devient la seule grande pièce
 * de métal, comme un logo doré à chaud.
 *  - `bandeau` : la réserve traverse le sachet, son bord est dessiné selon le thème (marches de pixels, dents de
 *    BD, biais, vagues) ;
 *  - `cartouche` : la réserve se réduit à un cartouche arrondi autour du nom (encore moins de métal).
 */
export type Habillage = 'bandeau' | 'cartouche';
const BAND_Y0 = 402, BAND_Y1 = 566, STRIP = 40;
/** brillant de l'encre sous le film (satiné : un reflet large et doux, pas un miroir) */
const INK_GLOSS = 0.45;

/** bord de la réserve en bandeau (s = −1 bord haut, +1 bord bas) : décalage en y à l'abscisse x */
function bandEdge(id: SachetId, x: number, s: number): number {
  switch (id) {
    case 'gaming':
      return [0, 9, 0, -9, 9, 18, 9, 0][(Math.floor(x / 40) + (s > 0 ? 3 : 0)) % 8];
    case 'pop':
      return Math.abs(((x / 20) % 2) - 1) * 14 - 7;
    case 'sport':
      return (cx - x) * 0.055;
    case 'monde':
      return Math.sin(x / 34 + (s > 0 ? 1.6 : 0)) * 8;
    default:
      return 0;
  }
}

/** tracé de la zone imprimée de la face (à remplir en `evenodd`) */
function inkPath(g: Ctx, id: SachetId, h: Habillage) {
  g.beginPath();
  if (h === 'cartouche') {
    g.rect(0, CH, PW, PH - 2 * CH);
    const x = 34, y = BAND_Y0 + 4, w = PW - 68, hh = BAND_Y1 - BAND_Y0 - 8, r = 34;
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + hh, r);
    g.arcTo(x + w, y + hh, x, y + hh, r);
    g.arcTo(x, y + hh, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    return;
  }
  g.moveTo(0, CH);
  g.lineTo(PW, CH);
  for (let x = PW; x >= 0; x -= 2) g.lineTo(x, BAND_Y0 + bandEdge(id, x, -1));
  g.closePath();
  g.moveTo(0, PH - CH);
  g.lineTo(PW, PH - CH);
  for (let x = PW; x >= 0; x -= 2) g.lineTo(x, BAND_Y1 + bandEdge(id, x, 1));
  g.closePath();
}

/** motif ton sur ton du thème, dessiné sur toute la hauteur imprimée (l'appelant a déjà détouré la zone) */
function motif(g: Ctx, id: SachetId, k: SachetLook) {
  const [, dark, light] = k.ink;
  // 1 près des bandes du haut et du bas, 0 vers la réserve : les motifs se densifient vers les bords du sachet
  const out = (y: number) => 1 - Math.min(1, Math.min(Math.abs(y - (CH + STRIP)), Math.abs(y - (PH - CH - STRIP))) / 250);
  switch (id) {
    case 'gaming': {
      // trame de pixels ordonnée (matrice de Bayer) : un dégradé fait de carrés, pas un dégradé lissé
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], s = 16;
      g.fillStyle = dark;
      for (let j = 0; j * s < PH; j++) for (let i = 0; i * s < PW; i++) if ((bayer[(j % 4) * 4 + (i % 4)] + 0.5) / 16 < out(j * s + s / 2) * 0.8) g.fillRect(i * s, j * s, s, s);
      break;
    }
    case 'pop': {
      // points de trame de BD, plus gros vers les bords
      g.fillStyle = light;
      for (let j = 0, y = CH; y < PH - CH; y += 13, j++) for (let x = j % 2 ? 13 : 0; x < PW + 13; x += 26) {
        const r = 1.5 + 8 * out(y);
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'sport': {
      // pelouse tondue en bandes, lignes de terrain blanches
      g.fillStyle = dark;
      for (let x = 0; x < PW; x += 128) g.fillRect(x, 0, 64, PH);
      g.beginPath();
      g.moveTo(0, 258);
      g.lineTo(PW, 258);
      g.moveTo(cx + 132, 258);
      g.arc(cx, 258, 132, 0, TAU);
      g.rect(96, 690, PW - 192, 400);
      g.moveTo(cx + 96, 690);
      g.arc(cx, 690, 96, 0, Math.PI, true);
      // (27/11, V3 — défaut relevé par Tom : blanc sur jaune, les lignes ressortaient peu) un liseré d'herbe sombre
      // sous la ligne, puis la craie plus large et pleine
      g.strokeStyle = 'rgba(92,64,0,0.42)';
      g.lineWidth = 11;
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 6;
      g.stroke();
      break;
    }
    case 'monde': {
      // courbes de niveau d'une carte
      g.strokeStyle = dark;
      g.lineWidth = 2.5;
      for (const [ox, oy, ph] of [[120, 210, 0.4], [540, 330, 2.1], [170, 790, 3.3], [520, 690, 5]] as const)
        for (let r = 26; r < 300; r += 27) {
          g.beginPath();
          for (let i = 0; i <= 72; i++) {
            const a = (i / 72) * TAU;
            const rr = r * (1 + 0.13 * Math.sin(3 * a + ph) + 0.07 * Math.sin(5 * a + ph * 2 + r * 0.02));
            if (i) g.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.86);
            else g.moveTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.86);
          }
          g.stroke();
        }
      break;
    }
    case 'bebou': {
      // grille de points (Nothing), et (passe 4) des empreintes d'ourson ton sur ton en quinconce
      g.fillStyle = light;
      for (let y = CH + 9; y < PH - CH; y += 16) for (let x = 8; x < PW; x += 16) {
        g.beginPath();
        g.arc(x, y, 1.3, 0, TAU);
        g.fill();
      }
      g.fillStyle = dark;
      for (let j = 0, y = CH + 90; y < PH - CH - 40; y += 84, j++) for (let x = j % 2 ? 100 : 42; x < PW; x += 116) {
        const a = ((x * 7 + y * 3) % 5 - 2) * 0.16;
        for (const [ox, oy, r] of [[0, 8, 10], [-12, -6, 4.5], [-4, -14, 5], [6, -14, 5], [14, -6, 4.5]] as const) {
          g.beginPath();
          g.arc(x + ox * Math.cos(a) - oy * Math.sin(a), y + ox * Math.sin(a) + oy * Math.cos(a), r, 0, TAU);
          g.fill();
        }
      }
      break;
    }
    default: {
      // booster du moment : hachures franches en biais (édition limitée)
      g.fillStyle = dark;
      for (let x = -PH; x < PW; x += 60) {
        g.beginPath();
        g.moveTo(x, PH);
        g.lineTo(x + 30, PH);
        g.lineTo(x + 30 + PH, 0);
        g.lineTo(x + PH, 0);
        g.closePath();
        g.fill();
      }
    }
  }
}

/** imprime une face : aplat, motif, bandes haute et basse, repères de déchirure */
function printFace(g: Ctx, id: SachetId, k: SachetLook, path: () => void, marks = true) {
  const dark = k.ink[1];
  g.save();
  path();
  g.clip('evenodd');
  g.fillStyle = k.ink[0];
  g.fillRect(0, CH, PW, PH - 2 * CH);
  motif(g, id, k);
  g.fillStyle = dark;
  g.fillRect(0, CH, PW, STRIP);
  g.fillRect(0, PH - CH - STRIP, PW, STRIP);
  // repères de déchirure : deux petits triangles de papier au bout de la ligne (pas de « déchirer ici »)
  // (passe 4) sur la face, ces repères sont des autocollants (voir `sChevron`) : seul le dos les garde imprimés
  g.fillStyle = k.paper;
  if (marks) for (const s of [1, -1]) {
    const x = s > 0 ? 12 : PW - 12, y = CH + STRIP;
    g.beginPath();
    g.moveTo(x, y - 9);
    g.lineTo(x + s * 15, y);
    g.lineTo(x, y + 9);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** filet de papier le long de la réserve (Bébou Pack seulement : la seule ligne claire du sachet) */
function keyline(g: Ctx, id: SachetId, h: Habillage, k: SachetLook) {
  if (id !== 'bebou') return;
  g.save();
  g.strokeStyle = k.paper;
  g.lineWidth = 1.5;
  g.globalAlpha = 0.7;
  if (h === 'cartouche') {
    roundRect(g, 26, BAND_Y0 - 4, PW - 52, BAND_Y1 - BAND_Y0 + 8, 40);
    g.stroke();
  } else
    for (const y of [BAND_Y0 - 10, BAND_Y1 + 10]) {
      g.beginPath();
      g.moveTo(28, y);
      g.lineTo(PW - 28, y);
      g.stroke();
    }
  g.restore();
}

// ───────────────────────────────────────────── le sachet complet

export interface StickerPackArt extends PackArt {
  /**
   * R = pas de métal sur la face (encre imprimée ou autocollant) · G = brillant (0 papier · ~0,45 encre · 1 vinyle)
   * · B = pas de métal au dos. (jeu, `film.jeu`) absente : ce masque est rangé dans `masks` (voir `inkSurface`).
   */
  stickers?: Texture;
  /** la face en 2D (vignettes) : relief du nom ombré + autocollants */
  thumb: HTMLCanvasElement;
}

/**
 * Le visuel d'un sachet « Autocollant » : le sachet simple du jeu (même alu, mêmes plis, même nom moulé), les
 * autocollants de la variante collés par-dessus. `seed` = le booster : il tire ses plis ET la pose des autocollants.
 */
export async function stickerPackArt(
  id: SachetId,
  variant: StickerVariant,
  L: StickerLang,
  seed = 1,
  film: {
    tint?: string;
    alloyMix?: number;
    habillage?: Habillage | 'nu';
    moment?: EventThemeId;
    /** (jeu, booster du moment) nom moulé de l'événement, sa date de fin, un logo neutre si sa teinte est libre */
    label?: string;
    until?: L2;
    logo?: Logo;
    /**
     * (27/11, V3) sachet du JEU : le masque des autocollants est écrit dans `art.masks` (R = encre / autocollant de la
     * face, G = brillant, B = ligne de déchirure) au lieu d'une texture de plus — la Déchirure et le Retroussé le
     * reçoivent avec les masques — et les toiles sources sont vidées à l'envoi (`releaseSources`).
     */
    jeu?: boolean;
  } = {},
): Promise<StickerPackArt> {
  // `film` : essais du labo — une autre teinte (les étiquettes qui la reprennent suivent), l'habillage imposé ou retiré
  // (`nu` = la passe 1 : autocollants sur l'alu nu). Par défaut : A en bandeau, B en cartouche.
  // (passe 4) `moment` : le thème de l'événement en cours — nom moulé, teinte, encres, logo et titre suivent la table
  const ev = film.moment && (id === 'tele' || id === 'noel') ? EVENT_THEMES[film.moment] : null;
  const k: SachetLook = {
    ...SACHETS[id],
    ...(ev ? { title: { fr: `Booster du moment · ${ev.fr}`, en: `Limited booster · ${ev.en}` }, label: ev.label, tint: ev.tint, ink: inkOf(ev.tint), logo: ev.logo as Logo } : {}), // i18n-ok (FR et EN)
    ...(film.tint ? { tint: film.tint, ink: inkOf(film.tint) } : {}),
    ...(film.alloyMix !== undefined ? { alloyMix: film.alloyMix } : {}),
    ...(film.label ? { label: film.label } : {}),
    ...(film.until ? { until: film.until } : {}),
    ...(film.logo ? { logo: film.logo } : {}),
  };
  const hab = film.habillage ?? (variant === 'a' ? 'bandeau' : 'cartouche');
  const jeu = !!film.jeu;
  // (jeu, perf téléphone) rend la main entre les étapes (mesuré, CPU ×4 : la pire tâche par sachet passe de 51-61 ms à
  // moins de 50) — la roue de la boutique reste fluide pendant que les sachets suivants se dessinent en tâche de fond
  const pause = () => (jeu ? new Promise<void>((r) => setTimeout(r, 0)) : Promise.resolve());
  await ensureFonts();
  await Promise.all(
    [`800 60px ${DISPLAY}`, `700 30px ${DISPLAY}`, `600 30px ${DISPLAY}`, `700 30px ${FONT_LABEL}`, `500 30px ${FONT_MONO}`, `400 40px ${FONT_PACK}`].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const art = await generatePackArt({ name: `autocollant-${id}-${seed}`, ground: k.tint, ground2: k.tint, ink: INK, foil: '#ffffff', accent: k.tint, simple: true, label: k.label, alloyMix: k.alloyMix }, { releaseSources: jeu });
  await pause();
  const F = art.front.image as HTMLCanvasElement, B = art.back.image as HTMLCanvasElement;
  const thumb = art.thumbFront ?? F;
  const fronts = [F.getContext('2d') as Ctx];
  if (thumb !== F) fronts.push(thumb.getContext('2d') as Ctx);
  // (jeu) la toile des masques du sachet, pleine définition (ses soudures R / G sont recalculées par le matériau)
  const M = jeu ? { c: art.masks.image as HTMLCanvasElement, g: (art.masks.image as HTMLCanvasElement).getContext('2d') as Ctx } : makeCanvas(PW / 2, Math.round(PH / 2));
  M.g.fillStyle = '#000';
  M.g.fillRect(0, 0, M.c.width, M.c.height);
  if (!jeu) M.g.scale(0.5, 0.5);
  const bg = B.getContext('2d') as Ctx;
  if (hab !== 'nu') {
    // la face : encre partout sauf la réserve derrière le nom moulé (dont l'ombrage reste intact)
    for (const g of fronts) {
      printFace(g, id, k, () => inkPath(g, id, hab), false);
      keyline(g, id, hab, k);
    }
    inkPath(M.g, id, hab);
    M.g.fillStyle = `rgb(255,${Math.round(INK_GLOSS * 255)},0)`;
    M.g.fill('evenodd');
  }
  await pause();
  // la boîte des lettres moulées : même police et même réduction que le nom du sachet simple (pack.ts)
  const mg = fronts[0];
  mg.save();
  let px = 132;
  mg.font = `400 ${px}px ${FONT_PACK}`;
  while (px > 28 && mg.measureText(k.label).width > PW - 120) mg.font = `400 ${(px -= 2)}px ${FONT_PACK}`;
  mg.textBaseline = 'middle';
  const tm = mg.measureText(k.label);
  mg.restore();
  const name: NameBox = { top: PH * 0.5 - tm.actualBoundingBoxAscent, bot: PH * 0.5 + tm.actualBoundingBoxDescent };
  let salt = variant === 'a' ? 3 : 11;
  for (const ch of id) salt = (salt * 31 + ch.charCodeAt(0)) % 9973;
  const P = placer(fronts, bg, M.g, seed, name, salt, !jeu);
  LAYOUTS[id][variant](P, L, k, seed);
  if (hab !== 'nu') {
    // (passe 4) les repères de déchirure ne sont plus imprimés : deux petits autocollants de papier au bout de la ligne
    P.put(sChevron(k, 1), 30, CH + STRIP, 0, { fix: true });
    P.put(sChevron(k, -1), PW - 30, CH + STRIP, 0, { fix: true });
  }
  if (id !== 'tele' && id !== 'noel') P.back(sBackLabel(k, L, seed), cx, PH * 0.6, id === 'bebou' ? 0 : -0.03);
  await pause();
  if (hab !== 'nu') {
    // le dos : entièrement imprimé (après les autocollants de la face : ils écrasent le canal du dos dans le masque)
    const whole = () => {
      bg.beginPath();
      bg.rect(0, CH, PW, PH - 2 * CH);
    };
    printFace(bg, id, k, whole);
    if (!jeu) {
      M.g.save();
      M.g.globalCompositeOperation = 'lighter';
      M.g.fillStyle = 'rgb(0,0,255)';
      M.g.fillRect(0, CH, PW, PH - 2 * CH);
      M.g.restore();
    }
  }
  await pause();
  P.flush();
  art.front.needsUpdate = true;
  art.back.needsUpdate = true;
  if (jeu) {
    // B : la ligne de déchirure, à la même place que dans le sachet simple (pack.ts : 4 px centrés sur CH + 40)
    M.g.save();
    M.g.globalCompositeOperation = 'lighter';
    M.g.fillStyle = 'rgb(0,0,255)';
    M.g.fillRect(0, CH + STRIP - 2, PW, 4);
    M.g.restore();
    art.masks.needsUpdate = true;
    return { ...art, thumb, inked: true };
  }
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
export function createStickerPackMesh(art: StickerPackArt, o: { matiere?: 'legere' | 'origine' } = {}) {
  const mesh = new Mesh(createPackGeometry(), o.matiere === 'origine' ? originMaterials(art) : lightMaterials(art));
  mesh.name = 'pack';
  return mesh;
}

/** passe 1 : la matière du jeu (physique, vernis, grain du film), le métal retiré sous l'encre et les autocollants */
function originMaterials(art: StickerPackArt) {
  const mats = createPackMaterials(art);
  const mk = texture(art.stickers, uv());
  mats.forEach((m, side) => {
    const s: N = side === 0 ? mk.r : mk.b;
    const gloss: N = side === 0 ? mk.g : float(INK_GLOSS);
    const col: N = texture(side === 0 ? art.front : art.back, uv()).rgb;
    m.colorNode = mix(col.mul(PLASTIC_TINT), col, s);
    m.metalnessNode = float(1).sub(s);
    m.roughnessNode = mix(m.roughnessNode as N, mix(float(0.8), float(0.36), gloss), s);
    m.clearcoatNode = mix(m.clearcoatNode as N, mix(float(0), float(0.3), gloss), s);
  });
  return mats;
}

/**
 * (passe 2, « mobile léger ») MATIÈRE ALLÉGÉE du sachet habillé. Par pixel : 3 lectures de texture (couleur, masque,
 * normales) au lieu de 7 (couleur, masques, plis, normales, grain du film × 2, masque des autocollants), et un seul
 * reflet (matériau standard) au lieu de deux (métal + vernis). Ce qui part : le vernis, le grain du film, le relief
 * recalculé par dérivées, la texture des masques (les crans des soudures sont calculés depuis la hauteur dans le
 * sachet) et la carte de hauteur des plis — donc 2 textures de moins à envoyer au GPU par sachet. Ce qui reste : les
 * plis du film et le nom thermoformé (carte de normales), l'alu en réserve, plus mat qu'avant (0,3 : reflet large).
 */
function lightMaterials(art: StickerPackArt) {
  const seamV = CH / PH;
  return [0, 1].map((side) => {
    const m = new MeshStandardNodeMaterial();
    const u = uv();
    const mk = texture(art.stickers, u);
    const col: N = texture(side === 0 ? art.front : art.back, u).rgb;
    const cover: N = side === 0 ? mk.r : mk.b;
    const gloss: N = side === 0 ? mk.g : float(INK_GLOSS);
    const seam: N = smoothstep(0.5 - seamV - 0.004, 0.5 - seamV, u.y.sub(0.5).abs());
    const rx: N = sin(positionLocal.x.mul(1600)).mul(0.6).mul(seam);
    const nt = side === 0 && art.frontNormal ? texture(art.frontNormal, u) : art.creaseNormal ? texture(art.creaseNormal, side === 0 ? u : u.mul(vec2(-1, 1)).add(vec2(1, 0))) : null;
    const cn: N = nt ? nt.xyz.mul(2).sub(1) : vec3(0, 0, 1);
    m.normalNode = normalMap(encodeNormal(vec3(cn.x.add(rx), cn.y, cn.z).normalize()));
    m.colorNode = mix(col.mul(PLASTIC_TINT), col, cover);
    m.metalnessNode = float(1).sub(cover);
    m.roughnessNode = mix(mix(float(0.3), float(0.44), seam), mix(float(0.82), float(0.38), gloss), cover);
    return m;
  });
}

/** hauteur de la soudure sur la toile (pour le labo) */
export const STICKER_CRIMP = CH;

// ───────────────────────────────────────────── (27/11, V3) dans le jeu

/** les boosters de la boutique qui ont leur sachet (clés de opening.ts / shop.ts) */
const GAME_SACHETS: readonly string[] = ['gaming', 'pop', 'sport', 'monde', 'bebou'] satisfies SachetId[];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']; // i18n-ok (étiquette dateuse, comme « DEC 2 » du labo)
/** date de fin d'un événement sur l'étiquette dateuse : « 02/12 » · « DEC 2 » */
function untilOf(endAt: number): L2 {
  const d = new Date(endAt);
  return { fr: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, en: `${MONTHS[d.getMonth()]} ${d.getDate()}` };
}

/**
 * Le sachet d'un booster du jeu, variante B (cartouche, décision de Tom et Hugo du 27/11), dans la langue du joueur.
 * `ev` : le booster du moment — gabarit `moment`, nom moulé = nom de l'événement, teinte et logo de son thème
 * (`eventThemeOf` : teinte de la palette, sinon le nom), date de fin sur l'étiquette. `null` : clé sans sachet.
 */
export async function gameSachetArt(key: string, L: StickerLang, ev?: { name: string; accent: string; endAt?: number } | null): Promise<StickerPackArt | null> {
  if (ev) {
    const th = eventThemeOf(ev);
    let seed = 7;
    for (const ch of ev.name) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    return stickerPackArt(th === 'noel' ? 'noel' : 'tele', 'b', L, seed + 1, {
      jeu: true,
      ...(th ? { moment: th } : { tint: ev.accent, logo: 'bebou' as const }),
      label: ev.name,
      ...(ev.endAt ? { until: untilOf(ev.endAt) } : {}),
    });
  }
  return GAME_SACHETS.includes(key) ? stickerPackArt(key as SachetId, 'b', L, 1, { jeu: true }) : null;
}

/**
 * (27/11, V3) SURFACE d'un sachet « Autocollant » dans le jeu = la MATIÈRE ALLÉGÉE du labo (passe 2, `lightMaterials`),
 * lue dans les masques du sachet (`inked`) : R = encre / autocollant de la face, G = brillant ; le dos est imprimé partout
 * sauf sur les soudures, calculées depuis la hauteur (plus de masque R / G des soudures, ni carte de hauteur, ni grain
 * du film, ni vernis). `mk` = lecture des masques, `u` = UV, `nrm` = lecture de la carte de normales (plis + nom moulé
 * sur la face). `crans` : les crans des soudures (l'ancien masque G), pour la fuite de lumière des scènes.
 */
export function inkSurface(mk: N, u: N, side: 0 | 1, nrm?: N | null) {
  const seamV = CH / PH;
  const seam: N = smoothstep(0.5 - seamV - 0.004, 0.5 - seamV, (u as N).y.sub(0.5).abs());
  const crans: N = seam.mul(step(fract((u as N).x.mul(PW / 6)), 0.5));
  const cover: N = side === 0 ? (mk as N).r.mul(seam.oneMinus()) : seam.oneMinus();
  const gloss: N = side === 0 ? (mk as N).g : float(INK_GLOSS);
  const rx: N = sin(positionLocal.x.mul(1600)).mul(0.6).mul(seam);
  const cn: N = nrm ? (nrm as N).xyz.mul(2).sub(1) : vec3(0, 0, 1);
  return {
    seam,
    crans,
    cover,
    normal: normalMap(encodeNormal(vec3(cn.x.add(rx), cn.y, cn.z).normalize())) as N,
    metal: float(1).sub(cover) as N,
    rough: mix(mix(float(0.3), float(0.44), seam), mix(float(0.82), float(0.38), gloss), cover) as N,
    /** l'alu se teinte sous le film, l'encre et le papier gardent leur couleur */
    tint: (col: N): N => mix((col as N).mul(PLASTIC_TINT), col, cover),
    /** couverture et brillant seuls (mini-boosters de la roue) */
    gloss,
  };
}
