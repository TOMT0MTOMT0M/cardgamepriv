import { alpha, linear, mix } from '../canvas';
import { setInfo } from '../../cardData';
import { type CardDesign, FONT_MONO, FONT_TITLE, H, W, fitFont, grainAtop, num3, paper, spacedFit, starColor, starRow } from './common';

/**
 * 11 · Paysage (retours 05/11 → 06/11) — le 2e style de carte, pour les PHOTOS HORIZONTALES (pochettes, concerts,
 * lieux, voitures…). Le gabarit portrait les recadrait ; ici la photo est montrée en ENTIER, comme un tirage posé sur
 * la carte : bande nette pleine largeur, liseré clair et ombre, sur sa propre copie floutée. En bas, un passe-partout
 * mat (la teinte de la photo) porte la famille, le nom centré et la sous-famille / l'artiste.
 * Même cadrage que « Pleine illustration » (art.k 1,62) : la bande de la photo tombe exactement où le peintre la pose
 * (imageSubject.ts, paintCoverSubject) — calculée ici d'après `artAspect`.
 */
const PANEL_Y = 724;

/** bande de la photo, en coordonnées carte (même formule que paintCoverSubject, ramenée au cadrage full-art) */
export function landscapeBand(aspect: number) {
  const h = W / Math.max(0.01, aspect);
  const y = Math.max(65, Math.min(429 - h / 2, 707 - h));
  return { x: 0, y, w: W, h };
}

export const paysage: CardDesign = {
  id: 'paysage',
  title: 'Paysage',
  art: { k: 1.62, to: [384, 470] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const deep = mix(card.palette.sky, '#000', 0.62);
    const band = landscapeBand(d.artAspect ?? 16 / 9);
    // voile du haut (étoiles, numéro)
    f.fillStyle = linear(f, 0, 0, 0, 170, [[0, alpha(deep, 0.7)], [1, alpha(deep, 0)]]);
    f.fillRect(0, 0, W, 170);
    // le tirage : ombre portée autour de la bande (pas dessus), puis liseré clair
    f.save();
    f.beginPath();
    f.rect(0, 0, W, H);
    f.rect(band.x, band.y, band.w, band.h);
    f.clip('evenodd');
    f.shadowColor = 'rgba(0,0,0,0.65)';
    f.shadowBlur = 36;
    f.shadowOffsetY = 12;
    f.fillStyle = '#000';
    f.fillRect(band.x + 6, band.y + 6, band.w - 12, band.h - 12);
    f.restore();
    f.fillStyle = alpha('#fbf6ec', 0.82);
    f.fillRect(0, band.y - 3, W, 3);
    f.fillRect(0, band.y + band.h, W, 3);
    // passe-partout mat du bas
    f.save();
    f.fillStyle = deep;
    f.fillRect(0, PANEL_Y, W, H - PANEL_Y);
    f.beginPath();
    f.rect(0, PANEL_Y, W, H - PANEL_Y);
    f.clip();
    paper(f, deep, card.seed);
    f.fillStyle = linear(f, 0, PANEL_Y, 0, H, [[0, alpha('#fff', 0.05)], [1, alpha('#000', 0.25)]]);
    f.fillRect(0, PANEL_Y, W, H - PANEL_Y);
    f.restore();
    const ink = '#f7f2e8';
    const acc = mix(starColor(tier), '#fff', tier < 2 ? 0.6 : 0.25);
    // filet de rareté en tête du passe-partout
    f.fillStyle = alpha(acc, 0.9);
    f.fillRect(W / 2 - 46, PANEL_Y + 26, 92, 2);
    // étoiles (haut gauche) et numéro (haut droite), comme le gabarit principal
    starRow(f, m, d, 52, 66, 32, 'left', { r: 13, fill: tier < 2 ? '#f3efe6' : starColor(tier), stroke: alpha('#000', 0.35), glow: true });
    const si = setInfo(card);
    f.save();
    f.shadowColor = 'rgba(0,0,0,0.6)';
    f.shadowBlur = 8;
    f.textAlign = 'right';
    // (audit 06/11) ≥ 30 px de base : lisible sur téléphone ; vignette : numéro, nom et étoiles seulement
    f.font = `600 36px ${FONT_MONO}`;
    f.fillStyle = ink;
    const total = ` / ${si.size}`;
    if (d.mini) f.fillText(num3(card.num), W - 52, 76);
    else {
      f.font = `500 26px ${FONT_MONO}`;
      const tw = f.measureText(total).width;
      f.font = `600 36px ${FONT_MONO}`;
      f.fillText(num3(card.num), W - 52 - tw, 76);
      f.font = `500 26px ${FONT_MONO}`;
      f.fillStyle = alpha(ink, 0.72);
      f.fillText(total, W - 52, 76);
    }
    f.restore();
    // famille, nom centré, sous-famille · artiste
    f.fillStyle = acc;
    if (!d.mini) spacedFit(f, uni.short.toUpperCase(), W / 2, PANEL_Y + 74, 4, 'center', `600 {s}px ${FONT_MONO}`, 30, W - 120, 24);
    f.fillStyle = ink;
    f.textAlign = 'center';
    const nameFont = `700 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 60, W - 110);
    f.fillText(card.name, W / 2, PANEL_Y + 158);
    // (07/11) Album / Chanson : l'artiste sur sa propre ligne, juste sous le titre ; la sous-famille descend d'un cran
    const by = d.byline && !d.mini ? d.byline : '';
    if (by) {
      f.fillStyle = alpha(ink, 0.86);
      fitFont(f, by, `500 {s}px ${FONT_TITLE}`, 36, W - 110, 24);
      f.fillText(by, W / 2, PANEL_Y + 208);
    }
    f.textAlign = 'left';
    f.fillStyle = alpha(ink, 0.78);
    if (d.sub && !d.mini) spacedFit(f, d.sub.toUpperCase(), W / 2, PANEL_Y + (by ? 262 : 216), 2, 'center', `500 {s}px ${FONT_MONO}`, 30, W - 120, 22);
    grainAtop(f, card.seed, 0.05, 40);
    // liseré intérieur (dès peu commune), comme le gabarit principal
    if (tier >= 1) {
      f.strokeStyle = alpha(starColor(tier), 0.85);
      f.lineWidth = 3;
      f.beginPath();
      f.roundRect(20, 20, W - 40, H - 40, 26);
      f.stroke();
    }

    // masques — R foil : liseré + filets du tirage ; G relief : le nom
    m.strokeStyle = m.fillStyle = 'rgb(255,0,0)';
    if (tier >= 2) {
      m.lineWidth = 2;
      m.beginPath();
      m.roundRect(20, 20, W - 40, H - 40, 26);
      m.stroke();
      m.fillRect(0, band.y - 3, W, 3);
      m.fillRect(0, band.y + band.h, W, 3);
      m.fillRect(W / 2 - 46, PANEL_Y + 26, 92, 2);
    }
    m.font = nameFont.replace('{s}', String(ns));
    m.textAlign = 'center';
    m.fillStyle = 'rgb(0,255,0)';
    m.save();
    m.filter = 'blur(1px)';
    m.fillText(card.name, W / 2, PANEL_Y + 158);
    m.restore();
    m.textAlign = 'left';
  },
};
