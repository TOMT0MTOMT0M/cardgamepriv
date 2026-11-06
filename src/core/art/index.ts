import { CanvasTexture, SRGBColorSpace, NoColorSpace, type Texture } from 'three/webgpu';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { CARDS, IMAGE_PALETTE, cardForRarity, isSecretPhotoSet, type CardData } from '../cardData';
import { RARITIES, rarity as getRarity, starCount, type RarityId } from '../rarity';
import { rng } from '../ease';
import { makeCanvas, releaseCanvas, type Ctx } from './canvas';
import { BASE_H, BASE_W, SUBJECTS, WIN, finishLayer } from './subjects';
import { FONT_MONO, FONT_TITLE } from './designs/common';
import { design as resolveDesign, CLASSIC_WIN, bebou, type CardDesign } from './designs';
import { universe } from '../universes';
import { cardFamily } from '../sets/themes';
import { POP_ARTISTS } from '../sets/popArtists';
import { paintBack, ALU_BACK, type BackStyle } from './back';
import { cardImage, ensureCardImages, loadCardImage, setImageLimits } from './images';
import { paintCoverSubject, paintImageSubject } from './imageSubject';
import { paintPortraitSubject } from './portraitSubject';
import { paintTitleSubject } from './jvTitle';

export { ensureCardImages, cardImage, imageStatus, releaseCardImage, type CardImage, type ImageReport } from './images';

export { WIN, BASE_W, BASE_H } from './subjects';
/** Fenêtre d'illustration du gabarit par défaut (« Classique »), coordonnées 768×1072. */
export const FRAME_WIN = CLASSIC_WIN;
export { DESIGNS, DESIGN_BY_ID, DEFAULT_DESIGN, starColor, glyph, bebou, type CardDesign } from './designs';

let fontsReady: Promise<void> | null = null;

/**
 * Réglages mémoire / préchargement, posés une fois par l'hôte. Défauts = labo (tout précharger, tout garder) ;
 * le jeu (game/shell.ts) les resserre : il ne précharge aucune illustration et borne le cache.
 */
const artConfig = { preloadImages: true };
export function configureArt(o: { preloadImages?: boolean; imageBytes?: number; maxImageSide?: number; keepSilhouettes?: boolean }): void {
  if (o.preloadImages != null) artConfig.preloadImages = o.preloadImages;
  setImageLimits({ bytes: o.imageBytes, maxSide: o.maxImageSide, keepSilhouettes: o.keepSilhouettes });
}

/**
 * À attendre avant toute génération de carte (synchrone) : polices du cadre **et** (labo) illustrations du set actif
 * (chargées une fois, détourées, en cache — ≈ 1 s pour les 151 en local, instantané ensuite).
 * Jeu (`configureArt({ preloadImages: false })`) ou `{ images: false }` : polices seulement — chaque scène charge les
 * illustrations de SES cartes (`ensureCardImages`) ; plus de ~40 PNG ni de photo de Bébou au démarrage.
 */
export function ensureFonts(opts: { images?: boolean } = {}): Promise<void> {
  if (!(opts.images ?? artConfig.preloadImages)) return loadFonts();
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

/**
 * Polices du cadre seulement (cartes 2D des grilles : leurs illustrations sont chargées à part, en miniature).
 * Attend TOUTES les polices, italique comprise : les miniatures sont mises en cache pour de bon.
 */
export function ensureCardFonts(): Promise<void> {
  return loadFonts(true);
}

let fontsAll: Promise<void> | null = null;
/**
 * `strict = false` (scènes 3D, cartes jetables) : l'italique (nom en légende, ~45 Ko, découverte tard) n'est attendue
 * que 1,5 s au plus — au-delà, la carte est peinte avec la police de repli plutôt que de bloquer la génération.
 */
function loadFonts(strict = false): Promise<void> {
  if (!fontsAll) {
    const italic = Promise.all([document.fonts.load(`italic 400 27px ${FONT_TITLE}`), document.fonts.load(`italic 500 40px ${FONT_TITLE}`)]);
    const core = Promise.all([document.fonts.load(`700 44px ${FONT_TITLE}`), document.fonts.load(`600 44px ${FONT_TITLE}`), document.fonts.load(`500 19px ${FONT_MONO}`), document.fonts.load(`400 14px ${FONT_MONO}`)]);
    fontsAll = Promise.all([core, italic]).then(() => undefined, () => undefined);
    fontsReady = Promise.all([core, Promise.race([italic, new Promise((r) => setTimeout(r, 1500))])]).then(() => undefined, () => undefined);
  }
  return strict ? fontsAll : fontsReady!;
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
  /**
   * Pas de calque aplati (jeu 3D : jamais envoyé ni lu) → 1 toile et 4 copies pleine carte de moins par carte.
   * `flat` désigne alors la texture du fond (le type reste le même pour les appelants).
   */
  noFlat?: boolean;
  /**
   * Mémoire (iOS) : chaque toile est vidée (`width = height = 0`) dès que sa texture est partie sur le GPU (la copie y
   * est synchrone), et toutes au `dispose()`. À ne pas utiliser si on relit `canvases` après coup (labo : 004, 007, 038…).
   */
  release?: boolean;
}

function tex(c: HTMLCanvasElement, color: boolean, aniso: number, release = false): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  if (release)
    t.onUpdate = () => {
      // appelé juste après l'envoi (et la génération des mipmaps, côté GPU) : le CPU n'a plus besoin de la toile
      t.onUpdate = null;
      releaseCanvas(c);
    };
  return t;
}

function prep(g: Ctx, s: number) {
  g.setTransform(s, 0, 0, s, 0, 0);
}

/**
 * Recadre les calques d'illustration pour un design : la composition (pensée pour la fenêtre historique `WIN`)
 * est agrandie de `k` autour de `from` et posée sur `to`. Les calques couvrent toute la carte, rien n'est perdu.
 * (Sujets procéduraux du labo seulement : les illustrations sont recadrées à la peinture, cf. `zoomLayers`.)
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
  releaseCanvas(tmp.c);
}

/**
 * Recadrage À LA PEINTURE (illustrations, photos, jaquettes, titres JV) : même transformation que `reframe`, composée
 * avec l'échelle des calques avant de peindre, et même découpe (le rectangle de la carte d'origine). Plus de toile
 * temporaire ni de 8 copies pleine carte ; flous et ombres restent identiques (`getTransform().a` vaut s·k, exactement
 * l'agrandissement que `reframe` appliquait après coup) et l'illustration est même un peu plus nette (pas rééchantillonnée).
 * Renvoie faux si le design ne recadre pas. À refermer par `g.restore()` sur chaque calque.
 */
function zoomLayers(layers: Array<{ c: HTMLCanvasElement; g: Ctx }>, art: CardDesign['art'], s: number, W: number, H: number): boolean {
  const from = art.from ?? [WIN.x + WIN.w / 2, WIN.y + WIN.h / 2];
  const [tx, ty] = art.to;
  if (art.k === 1 && from[0] === tx && from[1] === ty) return false;
  layers.forEach(({ g }, i) => {
    g.save();
    if (i === 3) {
      // calque fx : fond noir partout (comme reframe)
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
    }
    g.setTransform(s * art.k, 0, 0, s * art.k, (tx - from[0] * art.k) * s, (ty - from[1] * art.k) * s);
    g.beginPath();
    g.rect(0, 0, BASE_W, BASE_H);
    g.clip();
  });
  return true;
}

/**
 * Étapes de génération d'une carte (chacune ≲ ¼ du coût total) : sujet → finition (grain) → cadre et masques →
 * aplat et textures. La version synchrone les enchaîne ; la version asynchrone rend la main entre chaque.
 */
function* artSteps(card: CardData, rarityId: RarityId, o: ArtOptions): Generator<void, CardArt> {
  // carte illustrée : palette tirée de l'image (sauf palette explicitement surchargée, cf. 021)
  const im0 = card.subject === 'image' ? cardImage(card.image) : null;
  const im = im0 && im0.canvas.width > 0 ? im0 : null; // (toile vidée = illustration sortie du cache)
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
  const release = !!o.release;
  // les cartes Bébous ont leur propre gabarit (sceau des huit), sauf si une expérience impose un design
  const dz0 = o.design ? resolveDesign(o.design) : isSecretPhotoSet(card.set) ? bebou : resolveDesign();
  // (retours 05/11, préparé) photo HORIZONTALE : un autre gabarit pour ces cartes, dès que LANDSCAPE.design est rempli
  const dz = landscapeDesign(card, im, dz0);

  const bg = makeCanvas(W, H), subj = makeCanvas(W, H), fg = makeCanvas(W, H), fx = makeCanvas(W, H);
  const frame = makeCanvas(W, H), masks = makeCanvas(W, H);
  for (const k of [bg, subj, fg, fx, frame, masks]) prep(k.g, s);
  const artLayers = [bg, subj, fg, fx];
  // sujets peints d'après une image (+ titres JV) : recadrés directement à la peinture ; procéduraux : après coup
  const direct = !!card.photo || !!card.cover || card.subject === 'image' || card.subject === 'jvtitle';
  const zoomed = direct && zoomLayers(artLayers, dz.art, s, W, H);
  if (!zoomed) {
    fx.g.fillStyle = '#000';
    fx.g.fillRect(0, 0, BASE_W, BASE_H);
  }

  const target = { bg: bg.g, subj: subj.g, fg: fg.g, fx: fx.g, pal: card.palette, r, seed: card.seed };
  if (card.photo) paintPortraitSubject(target, im);
  else if (card.cover || (card.subject === 'image' && im?.opaque)) paintCoverSubject(target, im);
  else if (card.subject === 'image') paintImageSubject(target, im, card.fit);
  else if (card.subject === 'jvtitle') paintTitleSubject(target, { name: card.name, family: card.uniName ?? '', kind: card.jvKind, label: card.typeLabel, year: card.year });
  else SUBJECTS[card.subject](target);
  if (zoomed) artLayers.forEach(({ g }) => g.restore()); // retour à l'échelle de la carte (grain), découpe levée
  else reframe(artLayers, dz.art, s, W, H);
  yield;

  finishLayer(bg.g, card.seed, 0.05);
  finishLayer(subj.g, card.seed + 1, 0.04);
  yield;

  masks.g.fillStyle = '#000';
  masks.g.fillRect(0, 0, BASE_W, BASE_H);
  masks.g.globalCompositeOperation = 'lighter';
  frame.g.textBaseline = 'alphabetic';
  const uni0 = universe(card.universe);
  // (retours 05/11) famille en grand (« POKÉMON »), sous-famille en bas (« JOHTO ») — cartes du catalogue ; labo : inchangé
  const fam = cardFamily(card.id);
  const uniLabel = fam?.family ?? card.uniName;
  const uni = uniLabel ? { ...uni0, name: uniLabel, short: uniLabel } : uni0;
  dz.paint(frame.g, masks.g, { card, rar, uni, tier: rar.tier, stars: starCount(rarityId), sub: fam?.sub, byline: POP_ARTISTS[card.id], artAspect: im && im.canvas.height ? im.canvas.width / im.canvas.height : undefined });
  masks.g.globalCompositeOperation = 'source-over';
  yield;

  const canvasList: HTMLCanvasElement[] = [];
  const freeAll = () => canvasList.forEach(releaseCanvas);
  let flat: { c: HTMLCanvasElement; g: Ctx } | null = null;
  if (o.flatOnly || !o.noFlat) {
    flat = makeCanvas(W, H);
    flat.g.drawImage(bg.c, 0, 0);
    flat.g.drawImage(subj.c, 0, 0);
    flat.g.drawImage(fg.c, 0, 0);
    flat.g.drawImage(frame.c, 0, 0);
  }

  if (o.flatOnly) {
    const flatTex = tex(flat!.c, true, aniso, release);
    const list = [flatTex];
    // les calques intermédiaires ne servent plus : rendus tout de suite (iOS), même hors `release`
    for (const k of [bg, subj, fg, fx, frame, masks]) releaseCanvas(k.c);
    canvasList.push(flat!.c);
    return {
      bg: flatTex, subject: flatTex, fg: flatTex, frame: flatTex, masks: flatTex, fx: flatTex, flat: flatTex,
      canvases: { flat: flat!.c }, list,
      dispose: () => (list.forEach((t) => t.dispose()), release && freeAll()),
    };
  }
  const out = {
    bg: tex(bg.c, true, aniso, release),
    subject: tex(subj.c, true, aniso, release),
    fg: tex(fg.c, true, aniso, release),
    frame: tex(frame.c, true, aniso, release),
    masks: tex(masks.c, false, aniso, release),
    fx: tex(fx.c, false, aniso, release),
  };
  const flatTex = flat ? tex(flat.c, true, aniso, release) : out.bg;
  const list = flat ? [...Object.values(out), flatTex] : Object.values(out);
  const canvases: Record<string, HTMLCanvasElement> = { bg: bg.c, subject: subj.c, fg: fg.c, frame: frame.c, masks: masks.c, fx: fx.c };
  if (flat) canvases.flat = flat.c;
  canvasList.push(...Object.values(canvases));
  return {
    ...out,
    flat: flatTex,
    canvases,
    list,
    dispose: () => (list.forEach((t) => t.dispose()), release && freeAll()),
  };
}

/**
 * GABARIT DES PHOTOS HORIZONTALES (retours 05/11 — préparé, pas encore branché) : une illustration pleine (photo,
 * jaquette) plus large que haute d'au moins `ratio` est aujourd'hui recadrée dans le gabarit portrait (et perd ses
 * côtés). Le jour où le gabarit « paysage » existe : l'ajouter à designs/ et mettre son id dans `design` — toutes ces
 * cartes le prennent (hors `except` : Bébous, Merveilles, ou un id de carte), sans autre changement. Penser alors à
 * monter la version du cache des cartes peintes (src/game/cardImages.ts).
 */
export const LANDSCAPE: { design: string | null; ratio: number; except: (card: CardData) => boolean } = {
  // (retours 06/11) branché : le gabarit « Paysage » (designs/paysage.ts)
  design: 'paysage',
  ratio: 1.2,
  except: (card) => isSecretPhotoSet(card.set) || card.id.startsWith('mrv-'),
};
/** La carte a-t-elle une photo horizontale ? (illustration pleine, pas un sujet détouré) */
export function isLandscapeArt(card: CardData, im: { canvas: { width: number; height: number }; opaque?: boolean } | null): boolean {
  if (!im || !(card.cover || im.opaque) || !im.canvas.height) return false;
  return im.canvas.width / im.canvas.height >= LANDSCAPE.ratio;
}
function landscapeDesign(card: CardData, im: Parameters<typeof isLandscapeArt>[1], dz: CardDesign): CardDesign {
  if (!LANDSCAPE.design || dz.id !== 'full-art' || LANDSCAPE.except(card) || !isLandscapeArt(card, im)) return dz;
  return resolveDesign(LANDSCAPE.design);
}

/** Génère les calques d'une carte (≈ 30–60 ms à pleine résolution). */
export function generateCardArt(card: CardData, rarityId: RarityId, o: ArtOptions = {}): CardArt {
  const it = artSteps(card, rarityId, o);
  for (;;) {
    const n = it.next();
    if (n.done) return n.value;
  }
}

/** Rend la main au navigateur (une image) : `scheduler.yield()` s'il existe, sinon requestAnimationFrame. */
export const nextFrame = (): Promise<void> => {
  const sch = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sch?.yield) return sch.yield();
  return new Promise((r) => requestAnimationFrame(() => r()));
};

/**
 * Même résultat que `generateCardArt`, découpé en 4 étapes entre lesquelles on rend la main (`yieldFn`, défaut : une
 * image) : plus de pic de 20–80 ms sur téléphone pendant une animation.
 */
export async function generateCardArtAsync(card: CardData, rarityId: RarityId, o: ArtOptions = {}, yieldFn: () => Promise<void> = nextFrame): Promise<CardArt> {
  const it = artSteps(card, rarityId, o);
  for (;;) {
    const n = it.next();
    if (n.done) return n.value;
    await yieldFn();
  }
}

export interface BackArt {
  color: Texture;
  masks: Texture;
  dispose(): void;
}

/** `release` : toiles vidées après l'envoi au GPU et au dispose (cf. `ArtOptions.release`). */
export function generateBackArt(style: BackStyle = ALU_BACK, scale = 1, release = false): BackArt {
  const W = Math.round(BASE_W * scale), H = Math.round(BASE_H * scale);
  const b = makeCanvas(W, H), m = makeCanvas(W, H);
  prep(b.g, scale);
  prep(m.g, scale);
  paintBack(b.g, m.g, style);
  const color = tex(b.c, true, 8, release);
  const masks = tex(m.c, false, 8, release);
  return { color, masks, dispose: () => (color.dispose(), masks.dispose(), release && (releaseCanvas(b.c), releaseCanvas(m.c))) };
}

/** Raccourci : art de la carte + dos, enregistrés dans un Bag. */
export async function cardArtFor(card: CardData, rarityId: RarityId, bag: { add<T extends { dispose(): void }>(o: T): T }, o?: ArtOptions) {
  await Promise.all([ensureFonts(), ensureCardImages([card])]); // la carte peut venir d'un autre set (cardById)
  const art = bag.add(generateCardArt(card, rarityId, o));
  const back = bag.add(generateBackArt(ALU_BACK, o?.scale ?? 1, !!o?.release));
  return { art, back };
}
