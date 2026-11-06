import { alpha, linear, mix } from '../canvas';
import { setInfo } from '../../cardData';
import { type CardDesign, FONT_MONO, FONT_TITLE, H, W, fitFont, glyph, grainAtop, num3, paper, spaced, spacedFit, starColor, starRow } from './common';

/**
 * 2 · Pleine illustration — l'image va jusqu'aux bords. Un voile sombre en bas porte le nom en grand ;
 * l'univers au-dessus, les étoiles en haut à gauche. Aucune bordure : la carte entière est l'illustration.
 */
export const fullArt: CardDesign = {
  id: 'full-art',
  title: 'Pleine illustration',
  art: { k: 1.62, to: [384, 470] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const deep = mix(card.palette.sky, '#000', 0.55);
    // voiles de lisibilité (le reste du cadre est transparent)
    f.fillStyle = linear(f, 0, 690, 0, H, [[0, alpha(deep, 0)], [0.45, alpha(deep, 0.55)], [1, alpha(deep, 0.92)]]);
    f.fillRect(0, 690, W, H - 690);
    f.fillStyle = linear(f, 0, 0, 0, 190, [[0, alpha(deep, 0.6)], [1, alpha(deep, 0)]]);
    f.fillRect(0, 0, W, 190);
    // liseré intérieur (dès peu commune)
    const key = (g: CanvasRenderingContext2D) => {
      g.beginPath();
      g.roundRect(20, 20, W - 40, H - 40, 26);
    };
    if (tier >= 1) {
      f.strokeStyle = alpha(starColor(tier), 0.85);
      f.lineWidth = 3; // (audit 06/11) 2 px se dissolvait à l'écran du téléphone
      key(f);
      f.stroke();
    }
    starRow(f, m, d, 52, 66, 32, 'left', { r: 13, fill: tier < 2 ? '#f3efe6' : starColor(tier), stroke: alpha('#000', 0.35), glow: true });
    // (audit 06/11) tailles de texte : ≥ 30 px de base = ≈ 11 px CSS sur un téléphone (carte montrée à 285 px CSS, texture
    // ×0,7) — en dessous, le texte est perçu « flou » quelle que soit la résolution de rendu
    // numéro dans la collection, bien lisible en haut à droite (retour des testeurs : « on voit trop petit le numéro »)
    const si = setInfo(card);
    f.save();
    f.shadowColor = 'rgba(0,0,0,0.6)';
    f.shadowBlur = 8;
    f.textAlign = 'right';
    f.font = `600 36px ${FONT_MONO}`;
    f.fillStyle = '#f7f2e8';
    const total = ` / ${si.size}`;
    if (d.mini) f.fillText(num3(card.num), W - 52, 76);
    else {
      f.font = `500 26px ${FONT_MONO}`;
      const tw = f.measureText(total).width;
      f.font = `600 36px ${FONT_MONO}`;
      f.fillText(num3(card.num), W - 52 - tw, 76);
      f.font = `500 26px ${FONT_MONO}`;
      f.fillStyle = alpha('#f7f2e8', 0.72);
      f.fillText(total, W - 52, 76);
    }
    f.restore();
    f.textAlign = 'left';
    // sous-thème (« POKÉMON ») en grand au-dessus du nom
    const ucol = mix(uni.hex, '#fff', 0.55);
    f.save();
    f.shadowColor = 'rgba(0,0,0,0.55)';
    f.shadowBlur = 8;
    glyph(f, uni.id, 66, 886, 34, ucol, 2.6);
    f.fillStyle = ucol;
    // famille (« POKÉMON », « JEUX VIDÉO ») : rétrécit si elle est longue
    if (!d.mini) spacedFit(f, uni.short.toUpperCase(), 100, 896, 3, 'left', `600 {s}px ${FONT_MONO}`, 30, W - 150, 24);
    f.restore();
    // nom
    f.save();
    f.shadowColor = 'rgba(0,0,0,0.55)';
    f.shadowBlur = 14;
    f.fillStyle = '#f7f2e8';
    // nom : Bold Frame Two (la plus grasse), un rien espacé (retours 05/11)
    const nameFont = `700 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 62, W - 96);
    f.letterSpacing = '0.5px';
    f.fillText(card.name, 46, 978);
    f.letterSpacing = '0px';
    f.restore();
    f.fillStyle = alpha('#f7f2e8', 0.78);
    // sous-famille (« JOHTO ») en bas à droite (retours 05/11) ; le code de set n'est plus imprimé (doublon du numéro)
    let subW = 0;
    if (d.sub && !d.mini) subW = spacedFit(f, d.sub.toUpperCase(), W - 48, 1040, 2, 'right', `500 {s}px ${FONT_MONO}`, 30, d.byline ? (W - 96) * 0.42 : W - 96, 22);

    // Album / Chanson : l'artiste en bas à gauche, sous le titre (retours 05/11)
    if (d.byline && !d.mini) {
      f.fillStyle = alpha('#f7f2e8', 0.9);
      spacedFit(f, d.byline.toUpperCase(), 48, 1040, 2, 'left', `600 {s}px ${FONT_MONO}`, 30, W - 96 - subW - 28, 22);
    }

    m.strokeStyle = m.fillStyle = 'rgb(255,0,0)';
    if (tier >= 2) {
      m.lineWidth = 4;
      key(m);
      m.stroke();
    }
    m.font = nameFont.replace('{s}', String(ns));
    if (tier >= 4) m.fillText(card.name, 46, 978);
    m.fillStyle = 'rgb(0,255,0)';
    m.save();
    m.filter = 'blur(1px)';
    m.fillText(card.name, 46, 978);
    m.restore();
  },
};

/**
 * 3 · Cartouche flottant — illustration bord à bord, un cartouche de papier posé dessus (ombre portée)
 * avec le nom et les étoiles ; un petit onglet en haut porte l'univers.
 */
export const cartouche: CardDesign = {
  id: 'cartouche',
  title: 'Cartouche flottant',
  art: { k: 1.55, to: [384, 440] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const pal = card.palette;
    const ink = pal.ink;
    const plate = (g: CanvasRenderingContext2D, grow = 0) => {
      g.beginPath();
      g.roundRect(84 - grow, 846 - grow, 600 + 2 * grow, 164 + 2 * grow, 30 + grow);
    };
    const tab = (g: CanvasRenderingContext2D) => {
      g.beginPath();
      g.roundRect(250, -30, 268, 98, 22);
    };
    // ombres portées sur l'illustration
    f.save();
    f.shadowColor = 'rgba(0,0,0,0.5)';
    f.shadowBlur = 34;
    f.shadowOffsetY = 10;
    f.fillStyle = pal.paper;
    plate(f);
    f.fill();
    tab(f);
    f.fill();
    f.restore();
    // papier des pièces (découpé, pour ne pas peindre l'ombre)
    for (const shape of [plate, tab]) {
      f.save();
      shape(f);
      f.clip();
      paper(f, pal.paper, card.seed);
      f.restore();
    }
    f.strokeStyle = alpha(starColor(tier), 0.9);
    f.lineWidth = 1.5;
    plate(f, -9);
    f.stroke();
    // nom + étoiles
    f.fillStyle = ink;
    f.textAlign = 'center';
    const nameFont = `600 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 44, 520);
    f.fillText(card.name, 384, 924);
    f.textAlign = 'left';
    starRow(f, m, d, 384, 968, 28, 'center', { r: 11, stroke: alpha(ink, 0.6), lineWidth: 1, glow: true });
    // onglet univers
    glyph(f, uni.id, 284, 34, 22, mix(uni.hex, ink, 0.3), 2);
    f.font = `500 15px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.85);
    spaced(f, uni.short.toUpperCase(), 304, 40, 2.4);
    // liseré physique de la carte
    f.strokeStyle = 'rgba(255,255,255,0.18)';
    f.lineWidth = 2;
    f.beginPath();
    f.roundRect(6, 6, W - 12, H - 12, 30);
    f.stroke();
    grainAtop(f, card.seed, 0.08, 30);

    m.strokeStyle = m.fillStyle = 'rgb(255,0,0)';
    if (tier >= 1) {
      m.lineWidth = 3;
      plate(m, -9);
      m.stroke();
    }
    if (tier >= 4) {
      m.save();
      m.globalAlpha = 0.8;
      plate(m);
      m.fill();
      tab(m);
      m.fill();
      m.restore();
    }
    m.save();
    m.strokeStyle = m.fillStyle = 'rgb(0,255,0)';
    m.filter = 'blur(1.5px)';
    m.lineWidth = 6;
    plate(m);
    m.stroke();
    m.textAlign = 'center';
    m.font = nameFont.replace('{s}', String(ns));
    m.fillText(card.name, 384, 924);
    m.restore();
  },
};
