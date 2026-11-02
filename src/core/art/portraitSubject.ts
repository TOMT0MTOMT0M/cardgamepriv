import { type Ctx, alpha, linear, radial } from './canvas';
import { BASE_H, BASE_W, type PaintTarget } from './subjects';
import type { CardImage } from './images';

/**
 * Sujet « portrait » des cartes Bébous (photos réelles du groupe, rareté secrète).
 *
 * - Photo pleine (fond opaque) : elle remplit toute la carte (cadrage « cover », visage vers le tiers haut),
 *   étalonnage chaud discret, vignettage. La carte entière est la photo.
 * - Photo détourée (fond transparent) : fond or rose peint (halo, rayons, bokeh) et le portrait sur le calque
 *   sujet → vraie parallaxe, liseré lumineux, relief et foil qui suivent la silhouette.
 * - Photo absente : buste-silhouette d'attente, jamais d'exception.
 */
const TAU = Math.PI * 2;
const CX = BASE_W / 2;
/** couleurs du thème (mêmes que la rareté secrète) */
export const BEBOU_COLORS = { rose: '#e8927c', light: '#ffd9c9', cream: '#fff4ec', deep: '#120607', wine: '#3a1414' };

function paintBackdrop(bg: Ctx, r: () => number) {
  const C = BEBOU_COLORS;
  bg.fillStyle = linear(bg, 0, 0, 0, BASE_H, [[0, '#1d0b0c'], [0.42, '#4a1d1c'], [0.75, '#2a0f10'], [1, C.deep]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  const hy = BASE_H * 0.4;
  // rayons très doux
  bg.save();
  bg.translate(CX, hy);
  bg.fillStyle = alpha(C.light, 0.05);
  const rot = r() * TAU;
  for (let i = 0; i < 28; i += 2) {
    bg.beginPath();
    bg.moveTo(0, 0);
    bg.arc(0, 0, 1100, rot + (i / 28) * TAU, rot + ((i + 1) / 28) * TAU);
    bg.closePath();
    bg.fill();
  }
  bg.restore();
  // halo derrière la tête
  bg.fillStyle = radial(bg, CX, hy, 0, 430, [[0, alpha(C.light, 0.55)], [0.35, alpha(C.rose, 0.3)], [1, alpha(C.rose, 0)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  // bokeh
  bg.save();
  bg.globalCompositeOperation = 'screen';
  for (let i = 0; i < 24; i++) {
    const x = r() * BASE_W, y = r() * BASE_H * 0.85, rr = 6 + r() * r() * 46;
    bg.fillStyle = radial(bg, x, y, 0, rr, [[0, alpha(i % 3 ? C.rose : C.light, 0.06 + r() * 0.14)], [0.8, alpha(C.rose, 0.04)], [1, alpha(C.rose, 0)]]);
    bg.beginPath();
    bg.arc(x, y, rr, 0, TAU);
    bg.fill();
  }
  bg.restore();
}

function vignette(g: Ctx, k = 0.55) {
  g.fillStyle = radial(g, CX, BASE_H * 0.42, BASE_W * 0.35, BASE_H * 0.75, [[0, alpha(BEBOU_COLORS.deep, 0)], [1, alpha(BEBOU_COLORS.deep, k)]]);
  g.fillRect(0, 0, BASE_W, BASE_H);
}

/** Buste générique (tête + épaules) — silhouette d'attente. */
function bust(g: Ctx, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(CX, BASE_H * 0.4, 118, 142, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(CX - 300, BASE_H);
  g.bezierCurveTo(CX - 290, BASE_H * 0.66, CX - 150, BASE_H * 0.6, CX, BASE_H * 0.6);
  g.bezierCurveTo(CX + 150, BASE_H * 0.6, CX + 290, BASE_H * 0.66, CX + 300, BASE_H);
  g.closePath();
  g.fill();
}

export function paintPortraitSubject(t: PaintTarget, im: CardImage | null) {
  const { bg, subj, fg, fx, r } = t;
  const C = BEBOU_COLORS;
  const px = bg.getTransform().a;
  paintBackdrop(bg, r);

  if (!im) {
    subj.save();
    bust(subj, alpha('#0b0405', 0.75));
    subj.fillStyle = alpha(C.light, 0.85);
    subj.font = '600 150px Georgia, serif';
    subj.textAlign = 'center';
    subj.textBaseline = 'middle';
    subj.fillText('?', CX, BASE_H * 0.405);
    subj.restore();
    vignette(bg);
    return;
  }

  const cw = im.canvas.width, ch = im.canvas.height;
  if (im.opaque) {
    // ── photo pleine : cadrage « cover » sur toute la carte, point focal au tiers haut (visage)
    const k = Math.max(BASE_W / cw, BASE_H / ch) * 1.04;
    const w = cw * k, h = ch * k;
    const fy = 0.36;
    const x = CX - w / 2;
    const y = Math.min(0, Math.max(BASE_H - h, BASE_H * fy - h * fy));
    bg.save();
    bg.imageSmoothingEnabled = true;
    bg.imageSmoothingQuality = 'high';
    bg.drawImage(im.canvas, x, y, w, h);
    // étalonnage chaud discret (or rose) + vignettage
    bg.globalCompositeOperation = 'soft-light';
    bg.fillStyle = alpha(C.rose, 0.35);
    bg.fillRect(0, 0, BASE_W, BASE_H);
    bg.restore();
    vignette(bg, 0.5);
    // relief léger sur toute la photo (le grain de l'impression)
    fx.save();
    fx.globalCompositeOperation = 'lighter';
    fx.fillStyle = 'rgb(0,0,40)';
    fx.fillRect(0, 0, BASE_W, BASE_H);
    fx.restore();
  } else {
    // ── photo détourée : buste sur le calque sujet, bas collé au bord de la carte
    const k = Math.min((BASE_W * 0.98) / cw, (BASE_H * 0.86) / ch);
    const w = cw * k, h = ch * k;
    const x = CX - w / 2, y = BASE_H - h;
    vignette(bg, 0.4);
    subj.save();
    subj.imageSmoothingEnabled = true;
    subj.imageSmoothingQuality = 'high';
    subj.shadowColor = alpha(C.light, 0.75);
    subj.shadowBlur = 26 * px;
    subj.drawImage(im.canvas, x, y, w, h);
    subj.restore();
    // masques : relief (B) flou de la silhouette, foil du sujet (G) — même contrat que imageSubject.ts
    const sil = (col: string) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const g = c.getContext('2d')!;
      g.drawImage(im.canvas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = col;
      g.fillRect(0, 0, cw, ch);
      return c;
    };
    fx.save();
    fx.globalCompositeOperation = 'lighter';
    fx.filter = `blur(${6 * px}px)`;
    fx.drawImage(sil('rgb(0,0,170)'), x, y, w, h);
    fx.filter = 'none';
    fx.drawImage(sil('rgb(0,90,0)'), x, y, w, h);
    fx.restore();
  }

  // ── premier plan : poussière d'or rose
  fg.save();
  for (let i = 0; i < 26; i++) {
    const x = r() * BASE_W, y = r() * BASE_H * 0.8;
    fg.fillStyle = alpha(i % 3 ? C.light : C.rose, 0.3 + r() * 0.45);
    const s = 1.5 + r() * r() * 6;
    fg.beginPath();
    fg.moveTo(x, y - s);
    fg.quadraticCurveTo(x + s * 0.15, y - s * 0.15, x + s, y);
    fg.quadraticCurveTo(x + s * 0.15, y + s * 0.15, x, y + s);
    fg.quadraticCurveTo(x - s * 0.15, y + s * 0.15, x - s, y);
    fg.quadraticCurveTo(x - s * 0.15, y - s * 0.15, x, y - s);
    fg.fill();
  }
  fg.restore();
}
