import { alpha, linear, mix } from '../canvas';
import type { Ctx } from '../canvas';
import { setInfo } from '../../cardData';
import { rng } from '../../ease';
import { type CardDesign, FONT_MONO, FONT_SANS, FONT_TITLE, H, TAU, W, cut, fitFont, glyph, grainAtop, num3, paper, spaced, spacedFit, starColor, starRow, starsAt } from './common';

/**
 * 8 · Suisse — grille stricte, typographie sans empattement, une seule couleur d'accent.
 * Le nom en très gros, l'illustration en bande centrale, le numéro de collection en maigre géant.
 * Les étoiles deviennent des carrés pleins.
 */
export const suisse: CardDesign = {
  id: 'suisse',
  title: 'Suisse (typographique)',
  art: { k: 1.0, to: [384, 600] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const ink = '#161616';
    const accent = tier >= 2 ? starColor(tier) : uni.hex;
    f.fillStyle = '#f1efe9';
    f.fillRect(0, 0, W, H);
    f.fillStyle = accent;
    f.fillRect(48, 40, 72, 8);
    // nom sur 1 ou 2 lignes
    f.fillStyle = ink;
    const words = card.name.split(' ');
    f.font = `700 64px ${FONT_SANS}`;
    let l1 = card.name, l2 = '';
    if (f.measureText(card.name).width > 540 && words.length > 1) {
      const cut2 = Math.ceil(words.length / 2);
      l1 = words.slice(0, cut2).join(' ');
      l2 = words.slice(cut2).join(' ');
    }
    const fs = Math.min(fitFont(f, l1, `700 {s}px ${FONT_SANS}`, 64, 520), l2 ? fitFont(f, l2, `700 {s}px ${FONT_SANS}`, 64, 520) : 64);
    f.font = `700 ${fs}px ${FONT_SANS}`;
    f.fillText(l1, 44, 128);
    if (l2) f.fillText(l2, 44, 128 + fs * 1.02);
    starRow(f, m, d, 720 - 9, 92, 24, 'right', { r: 8.5, shape: 'square', fill: accent });
    // grille
    f.fillStyle = ink;
    f.fillRect(48, 274, 672, 2);
    f.fillRect(48, 924, 672, 2);
    cut(f, (g) => g.rect(48, 300, 672, 600));
    // pied
    f.font = `500 22px ${FONT_SANS}`;
    f.fillText(uni.name, 48, 968);
    f.font = `400 13px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.55);
    spaced(f, `${setInfo(card).code} ${num3(card.num)}/${setInfo(card).size}`, 48, 1022, 1.5);
    f.fillStyle = tier >= 3 ? accent : ink;
    f.font = `200 118px ${FONT_SANS}`;
    f.textAlign = 'right';
    f.fillText(num3(card.num), 724, 1038);
    f.textAlign = 'left';

    m.fillStyle = 'rgb(255,0,0)';
    if (tier >= 3) {
      m.fillRect(48, 40, 72, 8);
      m.font = `200 118px ${FONT_SANS}`;
      m.textAlign = 'right';
      m.fillText(num3(card.num), 724, 1038);
      m.textAlign = 'left';
    }
    if (tier >= 5) {
      m.font = `700 ${fs}px ${FONT_SANS}`;
      m.fillText(l1, 44, 128);
      if (l2) m.fillText(l2, 44, 128 + fs * 1.02);
    }
    // relief : impression typographique (le texte s'enfonce)
    m.save();
    m.filter = 'blur(0.8px)';
    m.fillStyle = 'rgb(0,120,0)';
    m.font = `700 ${fs}px ${FONT_SANS}`;
    m.fillText(l1, 44, 128);
    if (l2) m.fillText(l2, 44, 128 + fs * 1.02);
    m.restore();
  },
};

/**
 * (07/11) SUISSE · PAYSAGE — le gabarit des PHOTOS HORIZONTALES (pochettes, concerts, lieux, voitures…), d'après le labo
 * 035 « Suisse (typographique) » : même grille stricte (filets à 274 et 924, marges de 48), même papier, même nom en très
 * gros en tête, mêmes étoiles carrées et même numéro de collection géant en maigre ; la bande de l'illustration prend la
 * forme de la PHOTO ENTIÈRE (672 px de large, hauteur selon son format), centrée dans la zone d'image de la grille.
 * Textes du pied à ≥ 26–30 px (audit 06/11) : famille, puis artiste · sous-famille ; vignette : nom, étoiles, numéro.
 * Le cadrage de la photo (art) dépend de son format : posé par `landscapeDesign` (art/index.ts) via `suisseLandscapeArt`.
 */
export const SUISSE_LAND_BOX = { x: 48, w: 672, cy: 600 };
export function suisseLandscapeBand(aspect: number) {
  const h = Math.min(600, SUISSE_LAND_BOX.w / Math.max(0.01, aspect));
  return { x: SUISSE_LAND_BOX.x, y: SUISSE_LAND_BOX.cy - h / 2, w: SUISSE_LAND_BOX.w, h };
}
export const suissePaysage: CardDesign = {
  id: 'suisse-paysage',
  title: 'Suisse · paysage',
  art: { k: 1.0, to: [384, 600] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const ink = '#161616';
    const accent = tier >= 2 ? starColor(tier) : uni.hex;
    const band = suisseLandscapeBand(d.artAspect ?? 16 / 9);
    f.fillStyle = '#f1efe9';
    f.fillRect(0, 0, W, H);
    f.fillStyle = accent;
    f.fillRect(48, 40, 72, 8);
    // nom sur 1 ou 2 lignes (comme 035)
    f.fillStyle = ink;
    const words = card.name.split(' ');
    f.font = `700 64px ${FONT_SANS}`;
    let l1 = card.name, l2 = '';
    if (f.measureText(card.name).width > 540 && words.length > 1) {
      const cut2 = Math.ceil(words.length / 2);
      l1 = words.slice(0, cut2).join(' ');
      l2 = words.slice(cut2).join(' ');
    }
    const fs = Math.min(fitFont(f, l1, `700 {s}px ${FONT_SANS}`, 64, 520, 34), l2 ? fitFont(f, l2, `700 {s}px ${FONT_SANS}`, 64, 520, 34) : 64);
    f.font = `700 ${fs}px ${FONT_SANS}`;
    f.fillText(l1, 44, 128);
    if (l2) f.fillText(l2, 44, 128 + fs * 1.02);
    starRow(f, m, d, 720 - 9, 92, 24, 'right', { r: 8.5, shape: 'square', fill: accent });
    // grille
    f.fillStyle = ink;
    f.fillRect(48, 274, 672, 2);
    f.fillRect(48, 924, 672, 2);
    cut(f, (g) => g.rect(band.x, band.y, band.w, band.h));
    // pied : famille (30 px), puis artiste · sous-famille (26 px), numéro de collection géant à droite
    const numFont = `200 118px ${FONT_SANS}`;
    f.font = numFont;
    const numW = f.measureText(num3(card.num)).width;
    const footW = 672 - numW - 36;
    if (!d.mini) {
      f.fillStyle = ink;
      fitFont(f, uni.name, `500 {s}px ${FONT_SANS}`, 30, footW, 22);
      f.fillText(uni.name, 48, 974);
      const foot = [d.byline, d.sub].filter(Boolean).join('  ·  ').toUpperCase();
      if (foot) {
        f.fillStyle = alpha(ink, 0.6);
        spacedFit(f, foot, 48, 1024, 1.5, 'left', `400 {s}px ${FONT_MONO}`, 26, footW, 20);
      }
    }
    f.fillStyle = tier >= 3 ? accent : ink;
    f.font = numFont;
    f.textAlign = 'right';
    f.fillText(num3(card.num), 724, 1038);
    f.textAlign = 'left';

    m.fillStyle = 'rgb(255,0,0)';
    if (tier >= 3) {
      m.fillRect(48, 40, 72, 8);
      m.font = numFont;
      m.textAlign = 'right';
      m.fillText(num3(card.num), 724, 1038);
      m.textAlign = 'left';
    }
    if (tier >= 5) {
      m.font = `700 ${fs}px ${FONT_SANS}`;
      m.fillText(l1, 44, 128);
      if (l2) m.fillText(l2, 44, 128 + fs * 1.02);
    }
    // relief : impression typographique (le texte s'enfonce)
    m.save();
    m.filter = 'blur(0.8px)';
    m.fillStyle = 'rgb(0,120,0)';
    m.font = `700 ${fs}px ${FONT_SANS}`;
    m.fillText(l1, 44, 128);
    if (l2) m.fillText(l2, 44, 128 + fs * 1.02);
    m.restore();
  },
};

/**
 * 9 · Estampe — papier washi fibreux, illustration en panneau vertical, nom écrit de haut en bas dans une colonne,
 * sceau vermillon portant l'emblème de l'univers. Le sceau devient un marquage à chaud dès légendaire.
 */
export const estampe: CardDesign = {
  id: 'estampe',
  title: 'Estampe (sceau)',
  art: { k: 1.62, to: [318, 470] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const ink = '#2a2420';
    const washi = '#efe6d3';
    paper(f, washi, card.seed, 0.6);
    const r = rng(card.seed + 5);
    f.save();
    f.lineWidth = 0.7;
    for (let i = 0; i < 260; i++) {
      f.strokeStyle = alpha(r() > 0.5 ? '#8a7a60' : '#ffffff', 0.12 + r() * 0.12);
      const x = r() * W, y = r() * H, a = r() * TAU, l = 10 + r() * 50;
      f.beginPath();
      f.moveTo(x, y);
      f.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      f.stroke();
    }
    f.restore();
    const win = { x: 40, y: 40, w: 556, h: 992 };
    cut(f, (g) => g.rect(win.x, win.y, win.w, win.h));
    f.strokeStyle = ink;
    f.lineWidth = 2;
    f.strokeRect(win.x - 1, win.y - 1, win.w + 2, win.h + 2);
    // colonne : univers (petit, vertical) + nom (grand, vertical)
    const chars = [...card.name].filter((c) => c !== '’' && c !== "'");
    const step = Math.min(48, 640 / Math.max(chars.length, 1));
    f.fillStyle = ink;
    f.textAlign = 'center';
    f.font = `500 ${Math.round(step * 0.82)}px ${FONT_TITLE}`;
    let y = 96;
    for (const c of chars) {
      if (c !== ' ') f.fillText(c, 682, y);
      y += c === ' ' ? step * 0.6 : step;
    }
    f.font = `500 13px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.6);
    let yy = 90;
    for (const c of uni.name.toUpperCase()) {
      if (c !== ' ') f.fillText(c, 624, yy);
      yy += c === ' ' ? 8 : 17;
    }
    f.textAlign = 'left';
    // étoiles verticales au-dessus du sceau
    starRow(f, m, d, 682, 840, 26, 'right', { r: 9.5, fill: tier < 2 ? '#b8352a' : starColor(tier), stroke: alpha(ink, 0.4), lineWidth: 1, glow: true }, true);
    // sceau
    const seal = (g: Ctx) => {
      g.beginPath();
      g.roundRect(628, 884, 92, 92, 7);
    };
    f.fillStyle = '#b5352b';
    seal(f);
    f.fill();
    glyph(f, uni.id, 674, 930, 54, '#f5e9d8', 3);
    // encrage irrégulier du tampon
    f.save();
    seal(f);
    f.clip();
    f.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) {
      f.globalAlpha = 0.15 + r() * 0.5;
      f.beginPath();
      f.arc(628 + r() * 92, 884 + r() * 92, 0.6 + r() * 2.2, 0, TAU);
      f.fill();
    }
    f.restore();
    f.font = `400 12px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.5);
    spaced(f, num3(card.num), 674, 1020, 2, 'center');
    grainAtop(f, card.seed, 0.06, 40);

    if (tier >= 4) {
      m.fillStyle = 'rgb(255,0,0)';
      seal(m);
      m.fill();
    }
    if (tier >= 5) {
      m.strokeStyle = 'rgb(255,0,0)';
      m.lineWidth = 4;
      m.strokeRect(win.x - 1, win.y - 1, win.w + 2, win.h + 2);
    }
    m.save();
    m.filter = 'blur(1px)';
    m.fillStyle = 'rgb(0,255,0)';
    seal(m);
    m.fill();
    m.restore();
  },
};

/**
 * 10 · Carte céleste — ciel de nuit, quadrillage d'atlas stellaire, fenêtre en coupole.
 * La rareté est littéralement une constellation : n étoiles reliées par des traits fins, nommée d'après l'univers.
 */
export const celeste: CardDesign = {
  id: 'celeste',
  title: 'Carte céleste',
  art: { k: 1.12, to: [384, 400] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const night = mix(uni.hex, '#04060c', 0.84);
    f.fillStyle = linear(f, 0, 0, 0, H, [[0, mix(night, '#000', 0.2)], [1, mix(night, '#fff', 0.05)]]);
    f.fillRect(0, 0, W, H);
    const pale = '#d8dcea';
    const grid = (g: Ctx, col: string, lw = 1) => {
      g.strokeStyle = col;
      g.lineWidth = lw;
      for (let rr = 120; rr <= 720; rr += 60) {
        g.beginPath();
        g.arc(384, 1180, rr, Math.PI, TAU);
        g.stroke();
      }
      for (let i = 1; i < 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        g.beginPath();
        g.moveTo(384, 1180);
        g.lineTo(384 + Math.cos(a) * 760, 1180 + Math.sin(a) * 760);
        g.stroke();
      }
    };
    grid(f, alpha(pale, 0.1));
    const r = rng(card.seed + 11);
    for (let i = 0; i < 220; i++) {
      f.fillStyle = alpha(pale, 0.2 + r() * 0.6);
      f.beginPath();
      f.arc(r() * W, r() * H, 0.4 + r() * 1.2, 0, TAU);
      f.fill();
    }
    const dome = (g: Ctx, grow = 0) => {
      g.moveTo(52 - grow, 712 + grow);
      g.lineTo(52 - grow, 300);
      g.ellipse(384, 300, 332 + grow, 214 + grow, 0, Math.PI, TAU);
      g.lineTo(716 + grow, 712 + grow);
      g.closePath();
    };
    cut(f, (g) => dome(g));
    f.strokeStyle = alpha(pale, 0.85);
    f.lineWidth = 2;
    f.beginPath();
    dome(f, 3);
    f.stroke();
    // double filet du bord
    f.strokeStyle = alpha('#d9b467', tier >= 1 ? 0.9 : 0.4);
    f.lineWidth = 1.5;
    f.strokeRect(18, 18, W - 36, H - 36);
    f.strokeRect(26, 26, W - 52, H - 52);
    // constellation de rareté
    const n = d.stars;
    const pts: Array<[number, number]> = [];
    const rc = rng(card.seed * 3 + n);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1);
      pts.push([170 + t * 428 + (rc() - 0.5) * 50, 860 + Math.sin(t * Math.PI * 1.4 + rc()) * 48 + (rc() - 0.5) * 30]);
    }
    f.strokeStyle = alpha(pale, 0.45);
    f.lineWidth = 1.2;
    f.beginPath();
    pts.forEach(([x, y], k) => (k ? f.lineTo(x, y) : f.moveTo(x, y)));
    f.stroke();
    starsAt(f, m, d, pts, { r: 15, shape: 'sparkle', fill: tier < 2 ? '#f4f1e6' : starColor(tier), glow: true });
    f.font = `500 14px ${FONT_MONO}`;
    f.fillStyle = alpha(pale, 0.75);
    spaced(f, uni.name.toUpperCase(), 384, 760, 4, 'center');
    f.fillStyle = '#f2eee4';
    f.textAlign = 'center';
    const nameFont = `italic 500 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 40, 600);
    f.fillText(card.name, 384, 1012);
    f.textAlign = 'left';
    f.font = `400 12px ${FONT_MONO}`;
    f.fillStyle = alpha(pale, 0.45);
    spaced(f, `${setInfo(card).code} · ${num3(card.num)}`, 384, 1046, 2, 'center');
    glyph(f, uni.id, 384, 66, 26, alpha(pale, 0.8), 1.6);

    if (tier >= 2) {
      m.strokeStyle = 'rgb(255,0,0)';
      m.lineWidth = 3;
      m.beginPath();
      pts.forEach(([x, y], k) => (k ? m.lineTo(x, y) : m.moveTo(x, y)));
      m.stroke();
    }
    if (tier >= 1) {
      m.strokeStyle = 'rgb(255,0,0)';
      m.lineWidth = 3;
      m.strokeRect(18, 18, W - 36, H - 36);
      m.strokeRect(26, 26, W - 52, H - 52);
    }
    if (tier >= 4) grid(m, 'rgb(200,0,0)', 2);
    m.save();
    m.filter = 'blur(1px)';
    m.fillStyle = 'rgb(0,160,0)';
    m.textAlign = 'center';
    m.font = nameFont.replace('{s}', String(ns));
    m.fillText(card.name, 384, 1012);
    m.restore();
    void grainAtop;
  },
};
