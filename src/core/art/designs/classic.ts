import { alpha, mix } from '../canvas';
import { SET_CODE, SET_SIZE } from '../../cardData';
import { type CardDesign, FONT_MONO, FONT_TITLE, H, TAU, W, cut, fitFont, glyph, grainAtop, num3, paper, spaced, starColor, starRow } from './common';
import type { Ctx } from '../canvas';

/** Fenêtre du gabarit par défaut (coordonnées 768×1072) — sert aussi à `WINDOW_UV` / `windowSDF`. */
export const CLASSIC_WIN = { x: 46, y: 116, w: 676, h: 778, r: 14 };

function corner(g: Ctx, x: number, y: number, sx: number, sy: number, s: number) {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  g.beginPath();
  g.moveTo(0, s * 0.5);
  g.lineTo(s * 0.5, 0);
  g.moveTo(s * 0.2, s * 0.2);
  g.lineTo(s * 1.6, s * 0.2);
  g.moveTo(s * 0.2, s * 0.2);
  g.lineTo(s * 0.2, s * 1.6);
  g.moveTo(s * 0.62, s * 0.2);
  g.arc(s * 0.62, s * 0.42, s * 0.22, -Math.PI / 2, Math.PI);
  g.stroke();
  g.restore();
}

/**
 * 1 · Classique — le gabarit de base du lab : papier, double filet, grande fenêtre, nom en haut,
 * étoiles en haut à droite, bandeau d'univers en bas. Sobre, lisible, tout le reste vient du matériau.
 */
export const classic: CardDesign = {
  id: 'classic',
  title: 'Classique',
  art: { k: 1.25, to: [384, 505] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const pal = card.palette;
    const ink = pal.ink;
    const M = 30;
    const Wn = CLASSIC_WIN;
    paper(f, pal.paper, card.seed);
    // liseré de rareté sur le pourtour
    f.save();
    f.strokeStyle = alpha(starColor(tier), 0.35 + tier * 0.1);
    f.lineWidth = 10;
    f.beginPath();
    f.roundRect(9, 9, W - 18, H - 18, 30);
    f.stroke();
    f.restore();
    const borders = (g: Ctx, lw = 1) => {
      g.lineWidth = 2.2 * lw;
      g.beginPath();
      g.roundRect(M, M, W - 2 * M, H - 2 * M, 22);
      g.stroke();
      g.lineWidth = 0.9 * lw;
      g.beginPath();
      g.roundRect(M + 8, M + 8, W - 2 * M - 16, H - 2 * M - 16, 16);
      g.stroke();
      g.lineWidth = 1.1 * lw;
      g.beginPath();
      g.moveTo(M + 36, 924);
      g.lineTo(W - M - 36, 924);
      g.stroke();
      if (tier >= 2) {
        corner(g, M + 14, M + 14, 1, 1, 16);
        corner(g, W - M - 14, M + 14, -1, 1, 16);
        corner(g, M + 14, H - M - 14, 1, -1, 16);
        corner(g, W - M - 14, H - M - 14, -1, -1, 16);
      }
    };
    f.strokeStyle = alpha(ink, 0.82);
    borders(f);
    const win = (g: Ctx, grow = 0) => g.roundRect(Wn.x - grow, Wn.y - grow, Wn.w + 2 * grow, Wn.h + 2 * grow, Wn.r + grow);
    cut(f, (g) => win(g));
    f.save();
    f.strokeStyle = ink;
    f.lineWidth = 3;
    f.beginPath();
    win(f, 1.5);
    f.stroke();
    f.strokeStyle = alpha(starColor(tier), 0.9);
    f.lineWidth = 1.2;
    f.beginPath();
    win(f, 6);
    f.stroke();
    f.restore();
    // nom
    f.fillStyle = ink;
    f.textBaseline = 'alphabetic';
    const nameFont = `600 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 44, 520 - d.stars * 6);
    f.fillText(card.name, 62, 88);
    // étoiles
    starRow(f, m, d, W - 64, 72, 30, 'right', { r: 12.5, stroke: alpha(ink, 0.7), lineWidth: 1.2, glow: true });
    // univers
    glyph(f, uni.id, 86, 968, 30, mix(uni.hex, ink, 0.35), 2.2);
    f.font = `500 21px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.85);
    spaced(f, uni.name.toUpperCase(), 118, 976, 2.6);
    f.font = `400 14px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.55);
    spaced(f, `${SET_CODE} · ${num3(card.num)}/${SET_SIZE}`, W - 66, 1024, 2, 'right');
    grainAtop(f, card.seed);

    // masques — R foil
    m.strokeStyle = m.fillStyle = 'rgb(255,0,0)';
    if (tier >= 1) {
      borders(m, 1.6);
      m.font = nameFont.replace('{s}', String(ns));
      m.fillText(card.name, 62, 88);
    }
    if (tier >= 2) {
      m.lineWidth = 8;
      m.beginPath();
      win(m, 4);
      m.stroke();
      glyph(m, uni.id, 86, 968, 30, 'rgb(255,0,0)', 3);
    }
    if (tier >= 4) {
      m.save();
      m.globalAlpha = tier >= 5 ? 1 : 0.85;
      m.fillRect(0, 0, W, H);
      m.restore();
    }
    // G relief
    m.save();
    m.strokeStyle = m.fillStyle = 'rgb(0,255,0)';
    m.filter = 'blur(1.2px)';
    borders(m, 1.4);
    m.font = nameFont.replace('{s}', String(ns));
    m.fillText(card.name, 62, 88);
    m.lineWidth = 5;
    m.beginPath();
    win(m, 2);
    m.stroke();
    glyph(m, uni.id, 86, 968, 30, 'rgb(0,255,0)', 3);
    m.restore();
    void TAU;
  },
};
