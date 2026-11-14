import { alpha } from '../canvas';
import { setInfo } from '../../cardData';
import { type CardDesign, FONT_MONO, FONT_TITLE, H, TAU, W, cut, fitFont, grainAtop, num3, paper, spaced, starColor, starRow } from './common';
import type { Ctx } from '../canvas';
import { countryName, countryOf, drawFlag, type CountryCode } from '../flags';

/** Fenêtre du gabarit par défaut (coordonnées 768×1072) — sert aussi à `WINDOW_UV` / `windowSDF`. */
export const CLASSIC_WIN = { x: 46, y: 116, w: 676, h: 778, r: 14 };

/**
 * Fond « drapeau » : le drapeau en pleine carte, une trame de toile, un vignettage et deux bandeaux assombris (nom en
 * haut, pays en bas) pour que le texte clair reste lisible sur le blanc des drapeaux.
 */
function flagBackground(f: Ctx, code: CountryCode, seed: number) {
  drawFlag(f, code, 0, 0, W, H, 'rgba(0,0,0,0)', 0);
  f.save();
  // trame de toile
  f.globalAlpha = 0.05;
  f.fillStyle = '#000';
  for (let y = 0; y < H; y += 6) f.fillRect(0, y, W, 2);
  for (let x = 0; x < W; x += 6) f.fillRect(x, 0, 2, H);
  f.globalAlpha = 1;
  // bandeaux de lecture
  const top = f.createLinearGradient(0, 0, 0, 150);
  top.addColorStop(0, 'rgba(10,8,6,0.62)');
  top.addColorStop(1, 'rgba(10,8,6,0.18)');
  f.fillStyle = top;
  f.fillRect(0, 0, W, 150);
  const bot = f.createLinearGradient(0, 880, 0, H);
  bot.addColorStop(0, 'rgba(10,8,6,0.2)');
  bot.addColorStop(1, 'rgba(10,8,6,0.66)');
  f.fillStyle = bot;
  f.fillRect(0, 880, W, H - 880);
  // vignettage
  const v = f.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  f.fillStyle = v;
  f.fillRect(0, 0, W, H);
  f.restore();
  void seed;
}

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
  title: 'Classique', // i18n-ok
  art: { k: 1.25, to: [384, 505] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const pal = card.palette;
    // Merveilles du monde : toute la carte (hors fenêtre du diorama) est le drapeau du pays, plaqué en fond
    const country = countryOf(card.id);
    const ink = country ? '#fbf4e6' : pal.ink;
    const M = 30;
    const Wn = CLASSIC_WIN;
    if (country) flagBackground(f, country, card.seed);
    else paper(f, pal.paper, card.seed);
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
    // nom (sur drapeau : ombre portée pour rester lisible sur toutes les couleurs)
    if (country) {
      f.save();
      f.shadowColor = 'rgba(0,0,0,0.75)';
      f.shadowBlur = 8;
      f.shadowOffsetY = 1.5;
    }
    f.fillStyle = ink;
    f.textBaseline = 'alphabetic';
    const nameFont = `600 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 44, 520 - d.stars * 6);
    f.fillText(card.name, 62, 88);
    if (country) f.restore();
    // étoiles
    starRow(f, m, d, W - 64, 72, 30, 'right', { r: 12.5, stroke: alpha(ink, 0.7), lineWidth: 1.2 });
    // univers — Merveilles du monde : le pays (le drapeau est le fond de la carte)
    if (country) {
      f.save();
      f.shadowColor = 'rgba(0,0,0,0.8)';
      f.shadowBlur = 6;
      // le fond ne montre que les bords du drapeau : l'écusson complet (emblème compris) reste dans le bandeau
      drawFlag(f, country, 62, 949, 58, 38, 'rgba(255,248,236,0.85)');
      // (audit 06/11) ≥ 30 px de base sur la carte : lisible sur téléphone
      f.font = `600 30px ${FONT_MONO}`;
      f.fillStyle = ink;
      spaced(f, countryName(country).toUpperCase(), 136, 962, 2.5);
      if (!d.mini) {
        f.font = `500 30px ${FONT_MONO}`;
        f.fillStyle = alpha(ink, 0.8);
        spaced(f, uni.name.toUpperCase(), 136, 998, 2);
      }
      f.restore();
    } else {
      // (retours live 6, C7) plus d'emblème à côté du thème
      f.font = `500 30px ${FONT_MONO}`;
      f.fillStyle = alpha(ink, 0.85);
      if (!d.mini) spaced(f, uni.name.toUpperCase(), 62, 978, 2.2);
    }
    f.font = `500 30px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.7);
    if (!d.mini) spaced(f, d.sub ? d.sub.toUpperCase() : `${num3(card.num)} / ${setInfo(card).size}`, W - 66, 1028, 2, 'right');
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
    if (country) {
      // trame du drapeau imprimé : relief très léger (toile)
      m.globalAlpha = 0.18;
      for (let y = 0; y < H; y += 6) m.fillRect(0, y, W, 2);
      m.globalAlpha = 1;
    }
    m.restore();
    void TAU;
  },
};
