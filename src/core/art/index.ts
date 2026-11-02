import { CanvasTexture, SRGBColorSpace, NoColorSpace, type Texture } from 'three/webgpu';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { CARDS, IMAGE_PALETTE, cardForRarity, type CardData } from '../cardData';
import { RARITIES, rarity as getRarity, starCount, type RarityId } from '../rarity';
import { rng } from '../ease';
import { makeCanvas, type Ctx } from './canvas';
import { BASE_H, BASE_W, SUBJECTS, WIN, finishLayer } from './subjects';
import { FONT_MONO, FONT_TITLE } from './designs/common';
import { design as resolveDesign, CLASSIC_WIN, bebou, type CardDesign } from './designs';
import { universe } from '../universes';
import { paintBack, DEFAULT_BACK, type BackStyle } from './back';
import { cardImage, ensureCardImages, loadCardImage } from './images';
import { paintCoverSubject, paintImageSubject } from './imageSubject';
import { paintPortraitSubject } from './portraitSubject';
import { paintTitleSubject } from './jvTitle';

export { ensureCardImages, cardImage, imageStatus, type CardImage, type ImageReport } from './images';

export { WIN, BASE_W, BASE_H } from './subjects';
/** Fenêtre d'illustration du gabarit par défaut (« Classique »), coordonnées 768×1072. */
export const FRAME_WIN = CLASSIC_WIN;
export { DESIGNS, DESIGN_BY_ID, DEFAULT_DESIGN, starColor, glyph, bebou, type CardDesign } from './designs';

let fontsReady: Promise<void> | null = null;
/**
 * À attendre avant toute génération de carte (synchrone) : polices du cadre **et** illustrations du set actif
 * (chargées une fois, détourées, en cache — ≈ 1 s pour les 151 en local, instantané ensuite).
 */
export function ensureFonts(): Promise<void> {
  const preloadPool =
    CARDS.length > 60
      ? [
          ...new Set([
            ...CARDS.slice(0, 20),
            ...RARITIES.flatMap((r) => [0, 1, 2].map((o) => cardForRarity(r.id, o))),
          ]),
        ]
      : CARDS;
  return Promise.all([loadFonts(), ensureCardImages(preloadPool)]).then(() => undefined);
}

/** Polices du cadre seulement (cartes 2D des grilles : leurs illustrations sont chargées à part, en miniature). */
export function ensureCardFonts(): Promise<void> {
  return loadFonts();
}

function loadFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all([
      document.fonts.load(`600 44px ${FONT_TITLE}`),
      document.fonts.load(`italic 400 27px ${FONT_TITLE}`),
      document.fonts.load(`italic 500 40px ${FONT_TITLE}`),
      document.fonts.load(`500 19px ${FONT_MONO}`),
      document.fonts.load(`400 14px ${FONT_MONO}`),
    ]).then(() => undefined, () => undefined);
  }
  return fontsReady;
}

export interface CardArt {
  /** fond (opaque) */
  bg: Texture;
  /** sujet (alpha) */
  subject: Texture;
  /** premier plan (alpha) */
  fg: Texture;
  /** cadre + texte, fenêtre transparente */
  frame: Texture;
  /** R foil, G relief, B émissif cadre */
  masks: Texture;
  /** R émissif sujet, G foil sujet, B relief sujet */
  fx: Texture;
  /** version aplatie (sans parallaxe) — pratique pour les scènes à nombreuses cartes */
  flat: Texture;
  canvases: Record<string, HTMLCanvasElement>;
  list: Texture[];
  dispose(): void;
}

export interface ArtOptions {
  /** facteur de taille (1 = 768×1072) */
  scale?: number;
  /** ne produire que la texture aplatie */
  flatOnly?: boolean;
  /** maquette de carte (défaut : « Classique ») */
  design?: string | CardDesign;
  anisotropy?: number;
}

function tex(c: HTMLCanvasElement, color: boolean, aniso: number): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function prep(g: Ctx, s: number) {
  g.setTransform(s, 0, 0, s, 0, 0);
}

/**
 * Recadre les calques d'illustration pour un design : la composition (pensée pour la fenêtre historique `WIN`)
 * est agrandie de `k` autour de `from` et posée sur `to`. Les calques couvrent toute la carte, rien n'est perdu.
 */
function reframe(layers: Array<{ c: HTMLCanvasElement; g: Ctx }>, art: CardDesign['art'], s: number, W: number, H: number) {
  const from = art.from ?? [WIN.x + WIN.w / 2, WIN.y + WIN.h / 2];
  const [tx, ty] = art.to;
  if (art.k === 1 && from[0] === tx && from[1] === ty) return;
  const tmp = makeCanvas(W, H);
  layers.forEach(({ c, g }, i) => {
    tmp.g.setTransform(1, 0, 0, 1, 0, 0);
    tmp.g.clearRect(0, 0, W, H);
    tmp.g.drawImage(c, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (i === 3) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
    }
    g.setTransform(art.k, 0, 0, art.k, (tx - from[0] * art.k) * s, (ty - from[1] * art.k) * s);
    g.drawImage(tmp.c, 0, 0);
    g.restore();
  });
}

/** Génère les calques d'une carte (≈ 30–60 ms à pleine résolution). */
export function generateCardArt(card: CardData, rarityId: RarityId, o: ArtOptions = {}): CardArt {
  // carte illustrée : palette tirée de l'image (sauf palette explicitement surchargée, cf. 021)
  const im = card.subject === 'image' ? cardImage(card.image) : null;
  if (card.subject === 'image' && !im && card.image) {
    console.warn(`[art] ${card.id} : illustration pas encore chargée (appeler ensureCardImages avant) → silhouette d'attente`);
    void loadCardImage(card.image, { key: !(card.photo || card.cover) }).catch(() => undefined);
  }
  if (im && card.palette === IMAGE_PALETTE) card = { ...card, palette: im.palette };
  const s = o.scale ?? 1;
  const W = Math.round(BASE_W * s), H = Math.round(BASE_H * s);
  const aniso = o.anisotropy ?? 8;
  const rar = getRarity(rarityId);
  const r = rng(card.seed);

  const bg = makeCanvas(W, H), subj = makeCanvas(W, H), fg = makeCanvas(W, H), fx = makeCanvas(W, H);
  const frame = makeCanvas(W, H), masks = makeCanvas(W, H);
  for (const k of [bg, subj, fg, fx, frame, masks]) prep(k.g, s);
  fx.g.fillStyle = '#000';
  fx.g.fillRect(0, 0, BASE_W, BASE_H);

  const target = { bg: bg.g, subj: subj.g, fg: fg.g, fx: fx.g, pal: card.palette, r, seed: card.seed };
  if (card.photo) paintPortraitSubject(target, im);
  else if (card.cover || (card.subject === 'image' && im?.opaque)) paintCoverSubject(target, im);
  else if (card.subject === 'image') paintImageSubject(target, im, card.fit);
  else if (card.subject === 'jvtitle') paintTitleSubject(target, { name: card.name, family: card.uniName ?? '', kind: card.jvKind, label: card.typeLabel, year: card.year });
  else SUBJECTS[card.subject](target);
  // les cartes Bébous ont leur propre gabarit (sceau des huit), sauf si une expérience impose un design
  const dz = o.design ? resolveDesign(o.design) : card.set === 'bebous' ? bebou : resolveDesign();
  reframe([bg, subj, fg, fx], dz.art, s, W, H);
  finishLayer(bg.g, card.seed, 0.05);
  finishLayer(subj.g, card.seed + 1, 0.04);
  masks.g.fillStyle = '#000';
  masks.g.fillRect(0, 0, BASE_W, BASE_H);
  masks.g.globalCompositeOperation = 'lighter';
  frame.g.textBaseline = 'alphabetic';
  const uni0 = universe(card.universe);
  const uni = card.uniName ? { ...uni0, name: card.uniName, short: card.uniName } : uni0;
  dz.paint(frame.g, masks.g, { card, rar, uni, tier: rar.tier, stars: starCount(rarityId) });
  masks.g.globalCompositeOperation = 'source-over';

  const flat = makeCanvas(W, H);
  flat.g.drawImage(bg.c, 0, 0);
  flat.g.drawImage(subj.c, 0, 0);
  flat.g.drawImage(fg.c, 0, 0);
  flat.g.drawImage(frame.c, 0, 0);

  const flatTex = tex(flat.c, true, aniso);
  if (o.flatOnly) {
    const list = [flatTex];
    return {
      bg: flatTex, subject: flatTex, fg: flatTex, frame: flatTex, masks: flatTex, fx: flatTex, flat: flatTex,
      canvases: { flat: flat.c }, list,
      dispose: () => list.forEach((t) => t.dispose()),
    };
  }
  const out = {
    bg: tex(bg.c, true, aniso),
    subject: tex(subj.c, true, aniso),
    fg: tex(fg.c, true, aniso),
    frame: tex(frame.c, true, aniso),
    masks: tex(masks.c, false, aniso),
    fx: tex(fx.c, false, aniso),
    flat: flatTex,
  };
  const list = Object.values(out);
  return {
    ...out,
    canvases: { bg: bg.c, subject: subj.c, fg: fg.c, frame: frame.c, masks: masks.c, fx: fx.c, flat: flat.c },
    list,
    dispose: () => list.forEach((t) => t.dispose()),
  };
}

export interface BackArt {
  color: Texture;
  masks: Texture;
  dispose(): void;
}

export function generateBackArt(style: BackStyle = DEFAULT_BACK, scale = 1): BackArt {
  const W = Math.round(BASE_W * scale), H = Math.round(BASE_H * scale);
  const b = makeCanvas(W, H), m = makeCanvas(W, H);
  prep(b.g, scale);
  prep(m.g, scale);
  paintBack(b.g, m.g, style);
  const color = tex(b.c, true, 8);
  const masks = tex(m.c, false, 8);
  return { color, masks, dispose: () => (color.dispose(), masks.dispose()) };
}

/** Raccourci : art de la carte + dos, enregistrés dans un Bag. */
export async function cardArtFor(card: CardData, rarityId: RarityId, bag: { add<T extends { dispose(): void }>(o: T): T }, o?: ArtOptions) {
  await Promise.all([ensureFonts(), ensureCardImages([card])]); // la carte peut venir d'un autre set (cardById)
  const art = bag.add(generateCardArt(card, rarityId, o));
  const back = bag.add(generateBackArt(DEFAULT_BACK, o?.scale ?? 1));
  return { art, back };
}
