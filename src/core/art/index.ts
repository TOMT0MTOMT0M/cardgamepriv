import { CanvasTexture, SRGBColorSpace, NoColorSpace, type Texture } from 'three/webgpu';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import type { CardData } from '../cardData';
import { rarity as getRarity, type RarityId } from '../rarity';
import { rng } from '../ease';
import { makeCanvas, type Ctx } from './canvas';
import { BASE_H, BASE_W, SUBJECTS, finishLayer } from './subjects';
import { paintFrame, FONT_MONO, FONT_TITLE } from './frame';
import { paintBack, DEFAULT_BACK, type BackStyle } from './back';

export { WIN, BASE_W, BASE_H } from './subjects';
export { LAYOUT } from './frame';

let fontsReady: Promise<void> | null = null;
export function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all([
      document.fonts.load(`600 44px ${FONT_TITLE}`),
      document.fonts.load(`italic 400 27px ${FONT_TITLE}`),
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

/** Génère les calques d'une carte (≈ 30–60 ms à pleine résolution). */
export function generateCardArt(card: CardData, rarityId: RarityId, o: ArtOptions = {}): CardArt {
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

  SUBJECTS[card.subject]({ bg: bg.g, subj: subj.g, fg: fg.g, fx: fx.g, pal: card.palette, r, seed: card.seed });
  finishLayer(bg.g, card.seed, 0.14);
  finishLayer(subj.g, card.seed + 1, 0.1);
  paintFrame(card, rar, frame.g, masks.g);

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
  await ensureFonts();
  const art = bag.add(generateCardArt(card, rarityId, o));
  const back = bag.add(generateBackArt(DEFAULT_BACK, o?.scale ?? 1));
  return { art, back };
}
