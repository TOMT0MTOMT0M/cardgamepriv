import { alpha, ctx2d, releaseCanvas } from './canvas';
import { BASE_H, BASE_W, WIN, type PaintTarget } from './subjects';
import { imageLimits, onImageEvicted, type CardImage } from './images';

const TAU = Math.PI * 2;
const CX = WIN.x + WIN.w / 2;
/** ligne de sol (bas du sujet) */
const GROUND = WIN.y + WIN.h * 0.9;

/**
 * Zone de la carte réellement visible avec le gabarit « Pleine illustration » (designs/fullart.ts : art.k = 1.62,
 * to = [384, 470], autour du centre de WIN), exprimée dans les coordonnées d'avant recadrage. Une illustration posée
 * exactement là remplit toute la carte du jeu, bord à bord.
 */
const FULL_K = 1.62;
const FULL_VIEW = (() => {
  const fx = WIN.x + WIN.w / 2, fy = WIN.y + WIN.h / 2;
  const x0 = fx - 384 / FULL_K, y0 = fy - 470 / FULL_K;
  return { x: x0, y: y0, w: BASE_W / FULL_K, h: BASE_H / FULL_K };
})();

const silCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
// illustration retirée du cache (LRU de images.ts) : ses silhouettes partent avec elle, mémoire rendue tout de suite
onImageEvicted((c) => {
  silCache.get(c)?.forEach((s) => releaseCanvas(s));
  silCache.delete(c);
});
/**
 * Silhouette unie de l'illustration (même taille que sa toile). Gardée en cache dans le labo ; dans le jeu
 * (`imageLimits.keepSilhouettes = false`), créée pour la peinture puis libérée (`done`) : 2 toiles de moins par
 * illustration gardée.
 */
function silhouette(im: CardImage, color: string): HTMLCanvasElement {
  let m = silCache.get(im.canvas);
  let c = m?.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.canvas.width;
    c.height = im.canvas.height;
    const g = ctx2d(c);
    g.drawImage(im.canvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    if (imageLimits.keepSilhouettes) {
      if (!m) silCache.set(im.canvas, (m = new Map()));
      m.set(color, c);
    }
  }
  return c;
}
/** Fin d'usage d'une silhouette : libérée si elle n'est pas en cache. */
function done(im: CardImage, c: HTMLCanvasElement) {
  const m = silCache.get(im.canvas);
  if (!m || ![...m.values()].includes(c)) releaseCanvas(c);
}

/** Emplacement du sujet dans la fenêtre d'illustration (coordonnées carte 768×1072). `fit` : échelle du sujet (1 = défaut). */
export function imagePlacement(im: Pick<CardImage, 'canvas'>, fit = 1) {
  const cw = im.canvas.width, ch = im.canvas.height;
  // la fenêtre historique WIN est plus large que la carte visible du gabarit Pleine illustration (672 contre 474) :
  // sans plafond, les sujets larges (Pokémon allongés, armes, photos) débordaient et étaient coupés sur les côtés
  const k = Math.min((WIN.w * 0.8) / cw, (WIN.h * 0.8) / ch, (FULL_VIEW.w * 0.9) / (cw * fit)) * fit;
  const w = cw * k, h = ch * k;
  // (retours 05/11) sujets LARGES (armes Valorant / CS, véhicules, logos…) : posés au sol ils tombaient trop bas sur la
  // carte (sous le centre visible, contre le nom). Plus le sujet est large, plus il remonte vers le centre optique de la
  // fenêtre ; un personnage (portrait / carré) reste posé au sol comme avant.
  const wide = Math.max(0, Math.min(1, (cw / ch - 1.15) / 0.6));
  const centerY = WIN.y + WIN.h * 0.56;
  const y = (GROUND - h) * (1 - wide) + (centerY - h / 2) * wide;
  return { x: CX - w / 2, y, w, h };
}

/**
 * Sujet « illustration » : fond peint d'après la palette de l'image (ciel teinté, halo, rayons, bokeh,
 * ombre portée), illustration détourée sur le calque sujet (parallaxe), éclats au premier plan,
 * et masques fx (B = relief de la silhouette, G = foil du sujet pour le tier mythique).
 */
export function paintImageSubject(t: PaintTarget, im: CardImage | null, fit = 1) {
  const { bg, subj, fx, pal } = t;
  const hy = WIN.y + WIN.h * 0.5;
  // flou d'ombre et filtres ne suivent pas la matrice du contexte : on les met à l'échelle à la main
  const px = bg.getTransform().a;

  // ── fond : (retours live 6, C6 « zéro effet sur les cartes ») un aplat de la couleur de l'illustration — plus de
  // rayons, de halo, de bokeh ni de vignettage
  bg.fillStyle = pal.sky;
  bg.fillRect(0, 0, BASE_W, BASE_H);

  if (!im) {
    // illustration absente (pas encore chargée / 404) : silhouette d'attente, jamais d'exception
    subj.save();
    subj.fillStyle = alpha(pal.ink, 0.55);
    subj.beginPath();
    subj.ellipse(CX, hy + 20, 120, 150, 0, 0, TAU);
    subj.fill();
    subj.fillStyle = alpha(pal.paper, 0.8);
    subj.font = '600 120px Georgia, serif';
    subj.textAlign = 'center';
    subj.textBaseline = 'middle';
    subj.fillText('?', CX, hy + 24);
    subj.restore();
    return;
  }

  const p = imagePlacement(im, fit);
  // ── sujet : l'illustration seule (C6 : plus de liseré lumineux, d'ombre portée ni d'éclats)
  subj.save();
  subj.imageSmoothingEnabled = true;
  subj.imageSmoothingQuality = 'high';
  subj.drawImage(im.canvas, p.x, p.y, p.w, p.h);
  subj.restore();

  // ── masques : relief (B) flou de la silhouette, foil du sujet (G)
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.filter = `blur(${5 * px}px)`;
  const sb = silhouette(im, 'rgb(0,0,170)');
  fx.drawImage(sb, p.x, p.y, p.w, p.h);
  done(im, sb);
  fx.filter = 'none';
  const sg = silhouette(im, 'rgb(0,110,0)');
  fx.drawImage(sg, p.x, p.y, p.w, p.h);
  done(im, sg);
  fx.restore();
}

/**
 * Sujet « scène » : splash LoL déjà recadré en portrait (`CardData.cover`) ou toute photo sans transparence (thème
 * World…). Format portrait → l'illustration couvre toute la carte du gabarit Pleine illustration ; format paysage →
 * pleine largeur sans rien couper, fondue dans sa copie floutée. Autour, une copie floutée et assombrie évite tout vide
 * avec les autres gabarits du labo. Relief léger uniforme (grain d'impression), pas de détourage ni de parallaxe.
 */
/**
 * Bande d'une photo HORIZONTALE posée par `paintCoverSubject` (coordonnées d'avant recadrage) : toute la largeur de la
 * vue pleine illustration, sans rien couper. Les gabarits paysage s'en servent pour cadrer la photo (07/11 : Suisse).
 */
export function coverBand(aspect: number) {
  const w = FULL_VIEW.w, h = w / Math.max(0.01, aspect);
  const y = Math.max(FULL_VIEW.y + 40, Math.min(FULL_VIEW.y + FULL_VIEW.h * 0.4 - h / 2, FULL_VIEW.y + FULL_VIEW.h * 0.66 - h));
  return { x: FULL_VIEW.x, y, w, h };
}

/**
 * Au-delà de ce format (largeur / hauteur), une photo n'est plus recadrée bord à bord dans la carte : elle est posée
 * ENTIÈRE dans le cadre du gabarit Suisse (art/index.ts, LANDSCAPE.ratio). ≈ 0,82 = un rien plus large qu'une
 * jaquette PS4 ; une jaquette DS (0,88), un album carré, une photo 4:3 vont dans le cadre.
 */
export const PORTRAIT_MAX = 0.82;

/**
 * (retours live 6, B3 + C6 « zéro effet ») plus AUCUN flou ni fondu ni vignettage : une photo proche du portrait
 * remplit la carte (recadrée), toute autre est posée entière et nette (le gabarit Suisse l'encadre ; ailleurs — Merveilles
 * en 2D — le reste de la fenêtre est un aplat de sa couleur). `crisp` n'a plus d'effet (gardé pour les appelants).
 */
export function paintCoverSubject(t: PaintTarget, im: CardImage | null, _o: { crisp?: boolean } = {}) {
  const { bg, fx, pal } = t;
  bg.fillStyle = pal.sky;
  bg.fillRect(0, 0, BASE_W, BASE_H);
  if (!im) {
    paintImageSubject(t, null);
    return;
  }
  const cw = im.canvas.width, ch = im.canvas.height;
  bg.save();
  bg.imageSmoothingEnabled = true;
  bg.imageSmoothingQuality = 'high';
  const a = cw / ch;
  if (a < PORTRAIT_MAX) {
    // format portrait : l'illustration nette remplit la carte du jeu, bord à bord (point focal un peu haut)
    const k = Math.max(FULL_VIEW.w / cw, FULL_VIEW.h / ch);
    const w = cw * k, h = ch * k;
    const x = FULL_VIEW.x + (FULL_VIEW.w - w) / 2;
    const y = Math.min(FULL_VIEW.y, Math.max(FULL_VIEW.y + FULL_VIEW.h - h, FULL_VIEW.y + FULL_VIEW.h * 0.42 - h * 0.42));
    bg.drawImage(im.canvas, x, y, w, h);
  } else {
    // toute autre photo : ENTIÈRE, rien de coupé, rien de flouté (le cadre Suisse se cale sur elle : coverBand)
    const { x, y, w, h } = coverBand(a);
    bg.drawImage(im.canvas, x, y, w, h);
  }
  bg.restore();
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.fillStyle = 'rgb(0,0,40)';
  fx.fillRect(0, 0, BASE_W, BASE_H);
  fx.restore();
}
