import { alpha, linear, mix, radial } from '../canvas';
import type { Ctx } from '../canvas';
import { SET_CODE } from '../../cardData';
import { rng } from '../../ease';
import { type CardDesign, FONT_MONO, FONT_TITLE, H, TAU, W, arcText, cut, fitFont, glyph, grainAtop, num3, paper, spaced, starColor, starRow } from './common';

const R = (v: number) => `rgb(${Math.round(255 * v)},0,0)`;

/**
 * 4 · Passe-partout — la carte comme une estampe encadrée : large marie-louise crème, biseau de coupe,
 * cartel de musée en dessous (nom, univers en italique, étoiles en timbre sec). Le biseau se dore aux hauts tiers.
 */
export const passePartout: CardDesign = {
  id: 'passe-partout',
  title: 'Passe-partout (musée)',
  art: { k: 1.05, to: [384, 452] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const ink = card.palette.ink;
    const mat = mix(card.palette.paper, '#fff', 0.3);
    paper(f, mat, card.seed, 0.6);
    const x0 = 104, y0 = 104, x1 = 664, y1 = 804, b = 11;
    // biseau : 4 trapèzes éclairés en haut/gauche
    const bevel = (g: Ctx, fills: [string, string, string, string]) => {
      const sides: Array<Array<[number, number]>> = [
        [[x0 - b, y0 - b], [x1 + b, y0 - b], [x1, y0], [x0, y0]],
        [[x1 + b, y0 - b], [x1 + b, y1 + b], [x1, y1], [x1, y0]],
        [[x1 + b, y1 + b], [x0 - b, y1 + b], [x0, y1], [x1, y1]],
        [[x0 - b, y1 + b], [x0 - b, y0 - b], [x0, y0], [x0, y1]],
      ];
      sides.forEach((s, i) => {
        g.fillStyle = fills[i];
        g.beginPath();
        s.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fill();
      });
    };
    const gold = tier >= 3;
    bevel(f, gold ? ['#f1d690', '#a37a2c', '#7d5a1c', '#d8b25e'] : [mix(mat, '#fff', 0.6), mix(mat, '#000', 0.12), mix(mat, '#000', 0.2), mix(mat, '#fff', 0.35)]);
    cut(f, (g) => g.rect(x0, y0, x1 - x0, y1 - y0));
    if (tier >= 4) {
      f.strokeStyle = '#b8913f';
      f.lineWidth = 1.5;
      f.strokeRect(x0 - 30, y0 - 30, x1 - x0 + 60, y1 - y0 + 60);
    }
    // cartel
    f.fillStyle = ink;
    f.textAlign = 'center';
    const nameFont = `500 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 36, 520);
    f.fillText(card.name, 384, 884);
    f.font = `italic 400 22px ${FONT_TITLE}`;
    f.fillStyle = alpha(ink, 0.68);
    f.fillText(uni.name, 384, 922);
    f.textAlign = 'left';
    f.strokeStyle = alpha(ink, 0.25);
    f.lineWidth = 1;
    f.beginPath();
    f.moveTo(354, 944);
    f.lineTo(414, 944);
    f.stroke();
    const blind = tier < 2;
    starRow(f, m, d, 384, 978, 25, 'center', {
      r: 9.5,
      fill: blind ? mix(mat, '#000', 0.08) : starColor(tier),
      stroke: blind ? alpha('#fff', 0.7) : alpha(ink, 0.35),
      lineWidth: 1,
    });
    f.font = `400 13px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.45);
    spaced(f, `N° ${num3(card.num)} — ${SET_CODE}`, 384, 1032, 2, 'center');
    grainAtop(f, card.seed, 0.06, 40);

    if (gold) bevel(m, [R(1), R(1), R(1), R(1)]);
    if (tier >= 4) {
      m.strokeStyle = R(1);
      m.lineWidth = 3;
      m.strokeRect(x0 - 30, y0 - 30, x1 - x0 + 60, y1 - y0 + 60);
    }
    m.save();
    m.filter = 'blur(1.5px)';
    bevel(m, ['rgb(0,255,0)', 'rgb(0,140,0)', 'rgb(0,90,0)', 'rgb(0,200,0)']);
    m.fillStyle = 'rgb(0,150,0)';
    m.textAlign = 'center';
    m.font = nameFont.replace('{s}', String(ns));
    m.fillText(card.name, 384, 884);
    m.restore();
  },
};

/** Coins à redents (art déco). */
function stepped(g: Ctx, x0: number, y0: number, x1: number, y1: number, s: number) {
  g.beginPath();
  g.moveTo(x0 + 2 * s, y0);
  g.lineTo(x1 - 2 * s, y0);
  g.lineTo(x1 - 2 * s, y0 + s);
  g.lineTo(x1 - s, y0 + s);
  g.lineTo(x1 - s, y0 + 2 * s);
  g.lineTo(x1, y0 + 2 * s);
  g.lineTo(x1, y1 - 2 * s);
  g.lineTo(x1 - s, y1 - 2 * s);
  g.lineTo(x1 - s, y1 - s);
  g.lineTo(x1 - 2 * s, y1 - s);
  g.lineTo(x1 - 2 * s, y1);
  g.lineTo(x0 + 2 * s, y1);
  g.lineTo(x0 + 2 * s, y1 - s);
  g.lineTo(x0 + s, y1 - s);
  g.lineTo(x0 + s, y1 - 2 * s);
  g.lineTo(x0, y1 - 2 * s);
  g.lineTo(x0, y0 + 2 * s);
  g.lineTo(x0 + s, y0 + 2 * s);
  g.lineTo(x0 + s, y0 + s);
  g.lineTo(x0 + 2 * s, y0 + s);
  g.closePath();
}

/**
 * 5 · Art déco — laque sombre et filets d'or, coins à redents, éventail solaire au-dessus de la fenêtre,
 * nom en capitales espacées dans un bandeau. L'or est terne (laiton) pour une commune, vif dès rare.
 */
export const artDeco: CardDesign = {
  id: 'art-deco',
  title: 'Art déco',
  art: { k: 1.18, to: [384, 525] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const base = mix(uni.hex, '#0e0f13', 0.86);
    f.fillStyle = linear(f, 0, 0, 0, H, [[0, mix(base, '#fff', 0.04)], [1, mix(base, '#000', 0.3)]]);
    f.fillRect(0, 0, W, H);
    const gold = tier === 0 ? '#9a8a6c' : tier === 1 ? '#b59a62' : '#d9b467';
    const foil = tier === 0 ? 0.45 : tier === 1 ? 0.7 : 1;
    const lines = (g: Ctx, col: string, lw = 1) => {
      g.strokeStyle = col;
      g.lineWidth = 2 * lw;
      stepped(g, 22, 22, W - 22, H - 22, 14);
      g.stroke();
      g.lineWidth = 1 * lw;
      stepped(g, 34, 34, W - 34, H - 34, 12);
      g.stroke();
      // éventail solaire
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        g.beginPath();
        g.moveTo(384 + Math.cos(a) * 52, 188 + Math.sin(a) * 52);
        g.lineTo(384 + Math.cos(a) * (i % 2 ? 112 : 136), 188 + Math.sin(a) * (i % 2 ? 112 : 136));
        g.stroke();
      }
      g.beginPath();
      g.arc(384, 188, 46, Math.PI, TAU);
      g.stroke();
      // bandeau du nom
      g.beginPath();
      g.moveTo(70, 896);
      g.lineTo(W - 70, 896);
      g.moveTo(70, 978);
      g.lineTo(W - 70, 978);
      g.stroke();
      for (const sx of [70, W - 70]) {
        g.beginPath();
        g.moveTo(sx, 922);
        g.lineTo(sx + (sx < 384 ? -10 : 10), 937);
        g.lineTo(sx, 952);
        g.stroke();
      }
      // filets verticaux
      for (const x of [52, 58, W - 52, W - 58]) {
        g.beginPath();
        g.moveTo(x, 300);
        g.lineTo(x, 760);
        g.stroke();
      }
    };
    lines(f, gold);
    const win = (g: Ctx) => stepped(g, 78, 196, W - 78, 868, 12);
    cut(f, (g) => {
      win(g);
    });
    f.strokeStyle = gold;
    f.lineWidth = 2.5;
    win(f);
    f.stroke();
    starRow(f, m, d, 384, 112, 28, 'center', { r: 11.5, fill: tier < 2 ? gold : starColor(tier), stroke: alpha('#000', 0.5), glow: true, foilFrom: 0 });
    f.fillStyle = gold;
    f.textAlign = 'center';
    const nameFont = `600 {s}px ${FONT_TITLE}`;
    const label = card.name.toUpperCase();
    const ns = fitFont(f, label, nameFont, 34, 560);
    spaced(f, label, 384, 949, ns * 0.14, 'center');
    f.font = `500 15px ${FONT_MONO}`;
    f.fillStyle = alpha(gold, 0.8);
    spaced(f, `◆ ${uni.name.toUpperCase()} ◆`, 384, 1018, 3, 'center');
    f.textAlign = 'left';
    grainAtop(f, card.seed, 0.06, 30);

    lines(m, R(foil));
    m.strokeStyle = R(foil);
    m.lineWidth = 4;
    win(m);
    m.stroke();
    m.fillStyle = R(foil);
    m.font = nameFont.replace('{s}', String(ns));
    spaced(m, label, 384, 949, ns * 0.14, 'center');
    m.save();
    m.filter = 'blur(1px)';
    lines(m, 'rgb(0,220,0)', 1.3);
    m.fillStyle = 'rgb(0,200,0)';
    spaced(m, label, 384, 949, ns * 0.14, 'center');
    m.restore();
  },
};

/** Arc brisé : côtés droits jusqu'à `spring`, deux arcs de rayon `rad` qui se rejoignent à la pointe. */
function archPath(g: Ctx, x0: number, x1: number, bottom: number, spring: number, rad: number, grow = 0) {
  const a0 = x0 - grow, a1 = x1 + grow;
  const cxL = a0 + rad, cxR = a1 - rad;
  const mid = (a0 + a1) / 2;
  const apexY = spring - Math.sqrt(rad * rad - (mid - cxL) * (mid - cxL));
  const angL = Math.atan2(apexY - spring, mid - cxL) + TAU;
  const angR = Math.atan2(apexY - spring, mid - cxR) + TAU;
  g.beginPath();
  g.moveTo(a0, bottom + grow);
  g.lineTo(a0, spring);
  g.arc(cxL, spring, rad, Math.PI, angL, false);
  g.arc(cxR, spring, rad, angR, TAU, false);
  g.lineTo(a1, bottom + grow);
  g.closePath();
  return apexY;
}

/**
 * 6 · Arche — fenêtre en arc brisé dans un cadre de pierre claire, clé de voûte portant l'emblème de l'univers,
 * nom sur une banderole. Évoque un retable : la carte se « contemple ».
 */
export const arche: CardDesign = {
  id: 'arche',
  title: 'Arche',
  art: { k: 1.3, to: [384, 470] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const ink = card.palette.ink;
    const stone = mix(card.palette.paper, '#8f8a80', 0.25);
    paper(f, stone, card.seed, 1.4);
    const arch = (g: Ctx, grow = 0) => archPath(g, 76, W - 76, 852, 480, 400, grow);
    const apex = arch(f);
    cut(f, (g) => {
      arch(g);
    });
    f.strokeStyle = ink;
    f.lineWidth = 3;
    arch(f, 2);
    f.stroke();
    f.strokeStyle = alpha(starColor(tier), 0.9);
    f.lineWidth = 1.5;
    arch(f, 12);
    f.stroke();
    f.strokeStyle = alpha(ink, 0.5);
    f.lineWidth = 1;
    arch(f, 20);
    f.stroke();
    // clé de voûte
    const ky = apex - 34;
    f.fillStyle = mix(stone, '#fff', 0.25);
    f.strokeStyle = ink;
    f.lineWidth = 2;
    f.beginPath();
    f.arc(384, ky, 27, 0, TAU);
    f.fill();
    f.stroke();
    glyph(f, uni.id, 384, ky, 26, mix(uni.hex, ink, 0.3), 2);
    // univers sous la fenêtre
    f.font = `500 16px ${FONT_MONO}`;
    f.fillStyle = alpha(ink, 0.7);
    spaced(f, uni.name.toUpperCase(), 384, 886, 3, 'center');
    // banderole
    const ribbon = (g: Ctx) => {
      g.beginPath();
      g.moveTo(150, 908);
      g.lineTo(618, 908);
      g.lineTo(618, 966);
      g.lineTo(150, 966);
      g.closePath();
      g.moveTo(150, 922);
      g.lineTo(104, 922);
      g.lineTo(122, 952);
      g.lineTo(104, 982);
      g.lineTo(162, 982);
      g.lineTo(150, 966);
      g.closePath();
      g.moveTo(618, 922);
      g.lineTo(664, 922);
      g.lineTo(646, 952);
      g.lineTo(664, 982);
      g.lineTo(606, 982);
      g.lineTo(618, 966);
      g.closePath();
    };
    f.fillStyle = mix(stone, starColor(tier), 0.18);
    ribbon(f);
    f.fill();
    f.strokeStyle = ink;
    f.lineWidth = 1.6;
    f.stroke();
    f.fillStyle = ink;
    f.textAlign = 'center';
    const nameFont = `600 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 34, 440);
    f.fillText(card.name, 384, 949);
    f.textAlign = 'left';
    starRow(f, m, d, 384, 1022, 27, 'center', { r: 11, stroke: alpha(ink, 0.6), lineWidth: 1, glow: true });
    grainAtop(f, card.seed, 0.1, 80);

    m.strokeStyle = m.fillStyle = R(1);
    if (tier >= 1) {
      ribbon(m);
      m.lineWidth = 3;
      m.stroke();
    }
    if (tier >= 2) {
      m.lineWidth = 5;
      arch(m, 12);
      m.stroke();
      m.beginPath();
      m.arc(384, ky, 27, 0, TAU);
      m.fill();
    }
    if (tier >= 4) {
      m.save();
      m.globalAlpha = 0.75;
      m.fillRect(0, 0, W, H);
      m.restore();
    }
    m.save();
    m.strokeStyle = m.fillStyle = 'rgb(0,255,0)';
    m.filter = 'blur(1.3px)';
    m.lineWidth = 6;
    arch(m, 2);
    m.stroke();
    ribbon(m);
    m.lineWidth = 3;
    m.stroke();
    m.beginPath();
    m.arc(384, ky, 27, 0, TAU);
    m.stroke();
    m.textAlign = 'center';
    m.font = nameFont.replace('{s}', String(ns));
    m.fillText(card.name, 384, 949);
    m.restore();
  },
};

/**
 * 7 · Médaillon — une fenêtre ronde comme un camée sur velours, anneaux et perles d'or,
 * nom et univers gravés le long du cercle, filigranes aux coins.
 */
export const medaillon: CardDesign = {
  id: 'medaillon',
  title: 'Médaillon',
  art: { k: 1.12, to: [384, 462] },
  paint(f, m, d) {
    const { card, uni, tier } = d;
    const cx = 384, cy = 462, rw = 292;
    const velvet = mix(uni.hex, '#07060a', 0.7);
    f.fillStyle = radial(f, cx, cy, 80, 760, [[0, mix(velvet, '#fff', 0.1)], [1, mix(velvet, '#000', 0.4)]]);
    f.fillRect(0, 0, W, H);
    const gold = tier === 0 ? '#a99c86' : '#d5b26a';
    const rings = (g: Ctx, col: string, lw = 1) => {
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 7 * lw;
      g.beginPath();
      g.arc(cx, cy, rw + 5, 0, TAU);
      g.stroke();
      g.lineWidth = 1.2 * lw;
      g.beginPath();
      g.arc(cx, cy, rw + 20, 0, TAU);
      g.stroke();
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU;
        g.beginPath();
        g.arc(cx + Math.cos(a) * (rw + 30), cy + Math.sin(a) * (rw + 30), 2.4, 0, TAU);
        g.fill();
      }
      // filigranes de coin
      const r = rng(card.seed);
      for (const [x, y, sx, sy] of [[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]] as const) {
        g.save();
        g.translate(x, y);
        g.scale(sx, sy);
        g.lineWidth = 1.4 * lw;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.arc(22 + k * 18, 22 + k * 18, 14 + k * 6 + r() * 3, Math.PI * 0.9, Math.PI * 2.1);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(70, 8, 110, 0);
        g.moveTo(0, 0);
        g.quadraticCurveTo(8, 70, 0, 110);
        g.stroke();
        g.restore();
      }
    };
    rings(f, gold);
    cut(f, (g) => g.arc(cx, cy, rw, 0, TAU));
    // textes sur le cercle
    f.fillStyle = gold;
    f.font = `500 18px ${FONT_MONO}`;
    arcText(f, uni.name.toUpperCase(), cx, cy, rw + 54, -Math.PI / 2, 3);
    const nameFont = `600 {s}px ${FONT_TITLE}`;
    const ns = fitFont(f, card.name, nameFont, 34, 640);
    f.fillStyle = '#efe6d2';
    arcText(f, card.name, cx, cy, rw + 62, Math.PI / 2, 1.5, true);
    glyph(f, uni.id, cx, 912, 30, gold, 2);
    starRow(f, m, d, cx, 982, 30, 'center', { r: 12, fill: tier < 2 ? gold : starColor(tier), stroke: alpha('#000', 0.4), glow: true });
    f.font = `400 13px ${FONT_MONO}`;
    f.fillStyle = alpha(gold, 0.6);
    spaced(f, `${SET_CODE} ${num3(card.num)}`, cx, 1036, 2, 'center');
    grainAtop(f, card.seed, 0.07, 40);

    const fo = tier === 0 ? 0.5 : 1;
    rings(m, R(fo));
    m.fillStyle = R(fo);
    m.font = `500 18px ${FONT_MONO}`;
    arcText(m, uni.name.toUpperCase(), cx, cy, rw + 54, -Math.PI / 2, 3);
    if (tier >= 2) {
      m.font = nameFont.replace('{s}', String(ns));
      arcText(m, card.name, cx, cy, rw + 62, Math.PI / 2, 1.5, true);
    }
    m.save();
    m.filter = 'blur(1px)';
    rings(m, 'rgb(0,230,0)', 1.2);
    m.restore();
  },
};
