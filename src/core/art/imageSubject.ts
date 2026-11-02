import { type Ctx, alpha, linear, mix, radial } from './canvas';
import { BASE_H, BASE_W, WIN, type PaintTarget } from './subjects';
import type { CardImage } from './images';

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
/** Silhouette unie de l'illustration (même taille que sa toile), mise en cache. */
function silhouette(im: CardImage, color: string): HTMLCanvasElement {
  let m = silCache.get(im.canvas);
  if (!m) silCache.set(im.canvas, (m = new Map()));
  let c = m.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.canvas.width;
    c.height = im.canvas.height;
    const g = c.getContext('2d')!;
    g.drawImage(im.canvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    m.set(color, c);
  }
  return c;
}

/** Emplacement du sujet dans la fenêtre d'illustration (coordonnées carte 768×1072). `fit` : échelle du sujet (1 = défaut). */
export function imagePlacement(im: Pick<CardImage, 'canvas'>, fit = 1) {
  const cw = im.canvas.width, ch = im.canvas.height;
  // la fenêtre historique WIN est plus large que la carte visible du gabarit Pleine illustration (672 contre 474) :
  // sans plafond, les sujets larges (Pokémon allongés, armes, photos) débordaient et étaient coupés sur les côtés
  const k = Math.min((WIN.w * 0.8) / cw, (WIN.h * 0.8) / ch, (FULL_VIEW.w * 0.9) / (cw * fit)) * fit;
  const w = cw * k, h = ch * k;
  return { x: CX - w / 2, y: GROUND - h, w, h };
}

function sparkle(g: Ctx, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x + s * 0.14, y - s * 0.14, x + s, y);
  g.quadraticCurveTo(x + s * 0.14, y + s * 0.14, x, y + s);
  g.quadraticCurveTo(x - s * 0.14, y + s * 0.14, x - s, y);
  g.quadraticCurveTo(x - s * 0.14, y - s * 0.14, x, y - s);
  g.fill();
}

/**
 * Sujet « illustration » : fond peint d'après la palette de l'image (ciel teinté, halo, rayons, bokeh,
 * ombre portée), illustration détourée sur le calque sujet (parallaxe), éclats au premier plan,
 * et masques fx (B = relief de la silhouette, G = foil du sujet pour le tier mythique).
 */
export function paintImageSubject(t: PaintTarget, im: CardImage | null, fit = 1) {
  const { bg, subj, fg, fx, pal, r } = t;
  const hy = WIN.y + WIN.h * 0.5;
  // flou d'ombre et filtres ne suivent pas la matrice du contexte : on les met à l'échelle à la main
  const px = bg.getTransform().a;

  // ── fond
  bg.fillStyle = linear(bg, 0, 0, 0, BASE_H, [
    [0, pal.sky],
    [(WIN.y + WIN.h * 0.55) / BASE_H, mix(pal.sky, pal.haze, 0.45)],
    [(WIN.y + WIN.h) / BASE_H, mix(pal.sky, pal.haze, 0.2)],
    [1, pal.sky],
  ]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  // rayons
  bg.save();
  bg.translate(CX, hy);
  const n = 22;
  const rot = r() * TAU;
  bg.fillStyle = alpha(pal.glow, 0.055);
  for (let i = 0; i < n; i += 2) {
    const a0 = rot + (i / n) * TAU, a1 = rot + ((i + 1) / n) * TAU;
    bg.beginPath();
    bg.moveTo(0, 0);
    bg.arc(0, 0, 900, a0, a1);
    bg.closePath();
    bg.fill();
  }
  bg.restore();
  // halo
  bg.fillStyle = radial(bg, CX, hy, 0, WIN.w * 0.55, [
    [0, alpha(pal.glow, 0.62)],
    [0.45, alpha(pal.haze, 0.22)],
    [1, alpha(pal.haze, 0)],
  ]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  // bokeh
  bg.save();
  bg.globalCompositeOperation = 'screen';
  for (let i = 0; i < 16; i++) {
    const x = WIN.x + r() * WIN.w, y = WIN.y + r() * WIN.h * 0.8, rr = 6 + r() * r() * 38;
    bg.fillStyle = radial(bg, x, y, 0, rr, [[0, alpha(pal.glow, 0.05 + r() * 0.12)], [0.8, alpha(pal.glow, 0.04)], [1, alpha(pal.glow, 0)]]);
    bg.beginPath();
    bg.arc(x, y, rr, 0, TAU);
    bg.fill();
  }
  bg.restore();
  // vignettage de la fenêtre
  bg.fillStyle = radial(bg, CX, hy, WIN.w * 0.35, WIN.w * 0.85, [[0, alpha(pal.ink, 0)], [1, alpha(pal.ink, 0.45)]]);
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
  // ombre portée au sol
  bg.save();
  bg.filter = `blur(${10 * px}px)`;
  bg.fillStyle = alpha(pal.ink, 0.5);
  bg.beginPath();
  bg.ellipse(CX, GROUND - 4, p.w * 0.34, 16, 0, 0, TAU);
  bg.fill();
  bg.restore();

  // ── sujet : liseré lumineux (ombre colorée) puis l'illustration
  subj.save();
  subj.imageSmoothingEnabled = true;
  subj.imageSmoothingQuality = 'high';
  subj.shadowColor = alpha(pal.glow, 0.7);
  subj.shadowBlur = 22 * px;
  subj.drawImage(im.canvas, p.x, p.y, p.w, p.h);
  subj.restore();

  // ── masques : relief (B) flou de la silhouette, foil du sujet (G)
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.filter = `blur(${5 * px}px)`;
  fx.drawImage(silhouette(im, 'rgb(0,0,170)'), p.x, p.y, p.w, p.h);
  fx.filter = 'none';
  fx.drawImage(silhouette(im, 'rgb(0,110,0)'), p.x, p.y, p.w, p.h);
  fx.restore();

  // ── premier plan : quelques éclats autour du sujet
  fg.save();
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU;
    const rr = 0.42 + r() * 0.2;
    const x = CX + Math.cos(a) * p.w * rr, y = p.y + p.h / 2 + Math.sin(a) * p.h * rr;
    if (y < WIN.y + 12 || y > WIN.y + WIN.h - 12) continue;
    fg.fillStyle = alpha(i % 3 ? pal.paper : pal.glow, 0.45 + r() * 0.4);
    sparkle(fg, x, y, 3 + r() * 7);
  }
  fg.restore();
}

/**
 * Sujet « scène » : splash LoL déjà recadré en portrait (`CardData.cover`) ou toute photo sans transparence (thème
 * World…). Format portrait → l'illustration couvre toute la carte du gabarit Pleine illustration ; format paysage →
 * pleine largeur sans rien couper, fondue dans sa copie floutée. Autour, une copie floutée et assombrie évite tout vide
 * avec les autres gabarits du labo. Relief léger uniforme (grain d'impression), pas de détourage ni de parallaxe.
 */
export function paintCoverSubject(t: PaintTarget, im: CardImage | null) {
  const { bg, fx, pal } = t;
  const px = bg.getTransform().a;
  bg.fillStyle = pal.sky;
  bg.fillRect(0, 0, BASE_W, BASE_H);
  if (!im) {
    paintImageSubject(t, null);
    return;
  }
  const cw = im.canvas.width, ch = im.canvas.height;
  const cover = (box: { x: number; y: number; w: number; h: number }) => {
    const k = Math.max(box.w / cw, box.h / ch);
    const w = cw * k, h = ch * k;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  };
  bg.save();
  bg.imageSmoothingEnabled = true;
  bg.imageSmoothingQuality = 'high';
  // fond : la même image, floutée, sur toute la carte
  const all = cover({ x: 0, y: 0, w: BASE_W, h: BASE_H });
  bg.filter = `blur(${18 * px}px) brightness(0.55)`;
  bg.drawImage(im.canvas, all.x, all.y, all.w, all.h);
  bg.filter = 'none';
  const va = FULL_VIEW.w / FULL_VIEW.h, a = cw / ch;
  if (a <= va * 1.3) {
    // format proche du portrait : l'illustration nette remplit la carte du jeu, bord à bord (point focal un peu haut)
    const v = cover(FULL_VIEW);
    const y = Math.min(FULL_VIEW.y, Math.max(FULL_VIEW.y + FULL_VIEW.h - v.h, FULL_VIEW.y + FULL_VIEW.h * 0.42 - v.h * 0.42));
    bg.drawImage(im.canvas, v.x, y, v.w, v.h);
  } else {
    // photo large (paysage, voiture…) : RIEN n'est coupé. Elle prend toute la largeur, au-dessus du nom, fondue en haut
    // et en bas dans sa propre copie floutée.
    const w = FULL_VIEW.w, h = w / a;
    const y = Math.max(FULL_VIEW.y + 40, Math.min(FULL_VIEW.y + FULL_VIEW.h * 0.4 - h / 2, FULL_VIEW.y + FULL_VIEW.h * 0.66 - h));
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(w * px));
    tmp.height = Math.max(1, Math.round(h * px));
    const g = tmp.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(im.canvas, 0, 0, tmp.width, tmp.height);
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, tmp.height);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.12, 'rgba(0,0,0,1)');
    fade.addColorStop(0.88, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, tmp.width, tmp.height);
    bg.drawImage(tmp, FULL_VIEW.x, y, w, h);
  }
  bg.restore();
  // vignettage doux (le nom en bas et les étoiles en haut restent lisibles)
  bg.fillStyle = radial(bg, FULL_VIEW.x + FULL_VIEW.w / 2, FULL_VIEW.y + FULL_VIEW.h * 0.42, FULL_VIEW.w * 0.45, FULL_VIEW.h * 0.75, [
    [0, alpha(pal.ink, 0)],
    [1, alpha(pal.ink, 0.35)],
  ]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.fillStyle = 'rgb(0,0,40)';
  fx.fillRect(0, 0, BASE_W, BASE_H);
  fx.restore();
}
