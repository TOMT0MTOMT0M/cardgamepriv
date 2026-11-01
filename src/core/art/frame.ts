import type { CardData } from '../cardData';
import { SET_CODE, SET_SIZE } from '../cardData';
import { type Rarity } from '../rarity';
import { rng } from '../ease';
import { type Ctx, alpha, applyGrain, linear, mix, roundRect } from './canvas';
import { BASE_H, BASE_W, WIN } from './subjects';

export const FONT_TITLE = '"Fraunces Variable", "Fraunces", Georgia, serif';
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

const TAU = Math.PI * 2;

/** Zones fixes du gabarit (coordonnées 768×1072). */
export const LAYOUT = {
  margin: 30,
  name: { x: 62, y: 88 },
  cost: { x: 694, y: 70, r: 30 },
  typeY: 676,
  text: { x: 70, y: 718, w: 628, h: 168 },
  stats: { y: 930 },
  footerY: 1040,
};

function wrap(g: Ctx, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(g: Ctx, text: string, x: number, y: number, spacing: number, align: 'left' | 'right' = 'left') {
  const chars = [...text];
  const total = chars.reduce((a, c) => a + g.measureText(c).width + spacing, -spacing);
  let cx = align === 'right' ? x - total : x;
  for (const c of chars) {
    g.fillText(c, cx, y);
    cx += g.measureText(c).width + spacing;
  }
}

/** Ornement de coin (losange + volutes simples). */
function cornerOrnament(g: Ctx, x: number, y: number, sx: number, sy: number, size: number) {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  g.beginPath();
  g.moveTo(0, size * 0.5);
  g.lineTo(size * 0.5, 0);
  g.moveTo(size * 0.2, size * 0.2);
  g.lineTo(size * 1.6, size * 0.2);
  g.moveTo(size * 0.2, size * 0.2);
  g.lineTo(size * 0.2, size * 1.6);
  g.moveTo(size * 0.62, size * 0.2);
  g.arc(size * 0.62, size * 0.42, size * 0.22, -Math.PI / 2, Math.PI);
  g.stroke();
  g.restore();
}

export interface FrameOut {
  frame: HTMLCanvasElement;
  masks: HTMLCanvasElement;
}

/**
 * Cadre papier + texte, avec la fenêtre d'illustration découpée (transparente).
 * Masques (opaques) : R = foil (surface), G = relief (emboss), B = émissif cadre.
 * La fenêtre = 1 − alpha du cadre.
 */
export function paintFrame(card: CardData, rar: Rarity, frame: Ctx, masks: Ctx) {
  const pal = card.palette;
  const tier = rar.tier;
  const M = LAYOUT.margin;

  // ── papier
  frame.fillStyle = linear(frame, 0, 0, BASE_W, BASE_H, [[0, mix(pal.paper, '#fff', 0.12)], [1, mix(pal.paper, '#000', 0.06)]]);
  frame.fillRect(0, 0, BASE_W, BASE_H);
  // fibres / marbrure légère
  const rr = rng(card.seed * 7 + 3);
  frame.save();
  frame.filter = 'blur(18px)';
  frame.globalAlpha = 0.035;
  for (let i = 0; i < 26; i++) {
    frame.fillStyle = i % 2 ? '#000' : '#fff';
    frame.beginPath();
    frame.ellipse(rr() * BASE_W, rr() * BASE_H, 50 + rr() * 140, 20 + rr() * 50, rr() * 3, 0, TAU);
    frame.fill();
  }
  frame.restore();

  // bande de rareté discrète sur le pourtour (teinte du tier)
  frame.save();
  frame.strokeStyle = alpha(rar.hex, 0.35 + tier * 0.08);
  frame.lineWidth = 10;
  roundRect(frame, 9, 9, BASE_W - 18, BASE_H - 18, 30);
  frame.stroke();
  frame.restore();

  const ink = pal.ink;
  const inkSoft = alpha(ink, 0.82);

  // ── filets du cadre
  const borders = (g: Ctx, lw = 1) => {
    g.lineWidth = 2.2 * lw;
    roundRect(g, M, M, BASE_W - 2 * M, BASE_H - 2 * M, 22);
    g.stroke();
    g.lineWidth = 0.9 * lw;
    roundRect(g, M + 8, M + 8, BASE_W - 2 * M - 16, BASE_H - 2 * M - 16, 16);
    g.stroke();
    // séparateurs
    g.lineWidth = 1.2 * lw;
    g.beginPath();
    g.moveTo(M + 30, LAYOUT.typeY + 22);
    g.lineTo(BASE_W - M - 30, LAYOUT.typeY + 22);
    g.moveTo(M + 30, LAYOUT.stats.y - 24);
    g.lineTo(BASE_W - M - 30, LAYOUT.stats.y - 24);
    g.stroke();
    if (tier >= 2) {
      const s = 16;
      cornerOrnament(g, M + 14, M + 14, 1, 1, s);
      cornerOrnament(g, BASE_W - M - 14, M + 14, -1, 1, s);
      cornerOrnament(g, M + 14, BASE_H - M - 14, 1, -1, s);
      cornerOrnament(g, BASE_W - M - 14, BASE_H - M - 14, -1, -1, s);
    }
  };
  frame.strokeStyle = inkSoft;
  borders(frame);

  // ── fenêtre d'illustration : découpe + liseré
  const win = (g: Ctx, grow = 0) => roundRect(g, WIN.x - grow, WIN.y - grow, WIN.w + 2 * grow, WIN.h + 2 * grow, 14 + grow);
  frame.save();
  frame.globalCompositeOperation = 'destination-out';
  win(frame);
  frame.fill();
  frame.restore();
  frame.save();
  frame.strokeStyle = ink;
  frame.lineWidth = 3;
  win(frame, 1.5);
  frame.stroke();
  frame.strokeStyle = alpha(rar.hex, 0.9);
  frame.lineWidth = 1.2;
  win(frame, 6);
  frame.stroke();
  frame.restore();

  // ── nom + coût
  frame.fillStyle = ink;
  frame.textBaseline = 'alphabetic';
  frame.font = `600 44px ${FONT_TITLE}`;
  frame.fillText(card.name, LAYOUT.name.x, LAYOUT.name.y);
  const { x: cx, y: cy, r: cr } = LAYOUT.cost;
  frame.save();
  frame.fillStyle = mix(pal.paper, ink, 0.08);
  frame.strokeStyle = ink;
  frame.lineWidth = 2;
  frame.beginPath();
  frame.arc(cx, cy, cr, 0, TAU);
  frame.fill();
  frame.stroke();
  frame.beginPath();
  frame.arc(cx, cy, cr - 5, 0, TAU);
  frame.lineWidth = 0.8;
  frame.stroke();
  frame.fillStyle = ink;
  frame.font = `700 34px ${FONT_TITLE}`;
  frame.textAlign = 'center';
  frame.fillText(String(card.cost), cx, cy + 12);
  frame.restore();

  // ── ligne de type
  frame.font = `500 19px ${FONT_MONO}`;
  frame.fillStyle = inkSoft;
  spaced(frame, `${card.epithet} — ${card.element}`.toUpperCase(), 66, LAYOUT.typeY + 6, 2.2);
  frame.fillStyle = mix(rar.hex, ink, 0.25);
  spaced(frame, `${rar.glyph} ${rar.label}`.toUpperCase(), BASE_W - 66, LAYOUT.typeY + 6, 2.2, 'right');

  // ── texte d'ambiance (plaque légèrement teintée, filet fin)
  frame.save();
  frame.fillStyle = alpha(mix(pal.paper, '#fff', 0.35), 0.35);
  roundRect(frame, LAYOUT.text.x - 8, LAYOUT.text.y + 2, LAYOUT.text.w + 4, LAYOUT.text.h - 4, 8);
  frame.fill();
  frame.strokeStyle = alpha(ink, 0.25);
  frame.lineWidth = 1;
  frame.stroke();
  frame.restore();
  frame.font = `italic 400 27px ${FONT_TITLE}`;
  frame.fillStyle = alpha(ink, 0.78);
  const lines = wrap(frame, `« ${card.flavor} »`, LAYOUT.text.w - 20);
  lines.forEach((l, i) => frame.fillText(l, LAYOUT.text.x + 4, LAYOUT.text.y + 40 + i * 38));

  // ── stats
  const statsY = LAYOUT.stats.y;
  const statBlock = (g: Ctx, label: string, value: number, x: number, align: 'left' | 'right') => {
    g.textAlign = align;
    g.font = `500 15px ${FONT_MONO}`;
    g.fillStyle = alpha(ink, 0.65);
    spaced(g, label, x, statsY + 8, 3, align);
    g.font = `600 64px ${FONT_TITLE}`;
    g.fillStyle = ink;
    g.fillText(String(value), x, statsY + 72);
    g.textAlign = 'left';
  };
  if (card.power || card.guard) {
    statBlock(frame, 'PUISSANCE', card.power, 70, 'left');
    statBlock(frame, 'GARDE', card.guard, BASE_W - 70, 'right');
  } else {
    frame.font = `500 15px ${FONT_MONO}`;
    frame.fillStyle = alpha(ink, 0.65);
    frame.textAlign = 'center';
    spaced(frame, 'SANS COMBAT', BASE_W / 2 - 60, statsY + 30, 3);
    frame.textAlign = 'left';
  }
  // médaillon de rareté
  const medal = (g: Ctx, fill: boolean) => {
    g.beginPath();
    const mx = BASE_W / 2, my = statsY + 40, mr = 22;
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2;
      const rr = i % 2 ? mr * 0.55 : mr;
      if (i === 0) g.moveTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
      else g.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
    }
    g.closePath();
    if (fill) g.fill();
    else g.stroke();
  };
  frame.fillStyle = rar.hex;
  medal(frame, true);
  frame.strokeStyle = ink;
  frame.lineWidth = 1.5;
  medal(frame, false);

  // ── pied
  frame.font = `400 14px ${FONT_MONO}`;
  frame.fillStyle = alpha(ink, 0.6);
  spaced(frame, `${SET_CODE} · ${String(card.num).padStart(3, '0')}/${SET_SIZE}`, 66, LAYOUT.footerY, 2);
  spaced(frame, 'ILL. PROCÉDURALE', BASE_W - 66, LAYOUT.footerY, 2, 'right');

  applyGrain(frame, BASE_W, BASE_H, 0.09, card.seed, 70);

  // ════════ MASQUES
  masks.fillStyle = '#000';
  masks.fillRect(0, 0, BASE_W, BASE_H);
  masks.globalCompositeOperation = 'lighter';
  // R = foil surface
  masks.fillStyle = 'rgb(255,0,0)';
  masks.strokeStyle = 'rgb(255,0,0)';
  if (tier >= 1) {
    borders(masks, 1.6);
    masks.font = `600 44px ${FONT_TITLE}`;
    masks.fillText(card.name, LAYOUT.name.x, LAYOUT.name.y);
    medal(masks, true);
  }
  if (tier >= 2) {
    masks.lineWidth = 8;
    win(masks, 4);
    masks.stroke();
    masks.beginPath();
    masks.arc(cx, cy, cr, 0, TAU);
    masks.fill();
  }
  if (tier >= 4) {
    // carte entièrement foil hors texte
    masks.save();
    masks.globalAlpha = tier >= 5 ? 1 : 0.85;
    masks.fillRect(0, 0, BASE_W, BASE_H);
    masks.restore();
  }
  // G = relief
  masks.fillStyle = 'rgb(0,255,0)';
  masks.strokeStyle = 'rgb(0,255,0)';
  masks.save();
  masks.filter = 'blur(1.2px)';
  borders(masks, 1.4);
  masks.font = `600 44px ${FONT_TITLE}`;
  masks.fillText(card.name, LAYOUT.name.x, LAYOUT.name.y);
  masks.lineWidth = 5;
  masks.beginPath();
  masks.arc(cx, cy, cr, 0, TAU);
  masks.stroke();
  masks.font = `700 34px ${FONT_TITLE}`;
  masks.textAlign = 'center';
  masks.fillText(String(card.cost), cx, cy + 12);
  masks.textAlign = 'left';
  if (card.power || card.guard) {
    masks.font = `600 64px ${FONT_TITLE}`;
    masks.fillText(String(card.power), 70, statsY + 72);
    masks.textAlign = 'right';
    masks.fillText(String(card.guard), BASE_W - 70, statsY + 72);
    masks.textAlign = 'left';
  }
  medal(masks, true);
  masks.lineWidth = 5;
  win(masks, 2);
  masks.stroke();
  masks.restore();
  // B = émissif (médaillon pour les hauts tiers)
  if (tier >= 3) {
    masks.fillStyle = 'rgb(0,0,255)';
    masks.save();
    masks.filter = 'blur(2px)';
    medal(masks, true);
    masks.restore();
  }
  masks.globalCompositeOperation = 'source-over';
  // le texte n'est jamais foil (lisibilité) : on retire R sous le texte d'ambiance
  masks.save();
  masks.globalCompositeOperation = 'multiply';
  masks.filter = 'blur(3px)';
  masks.fillStyle = 'rgb(0,255,255)';
  roundRect(masks, LAYOUT.text.x - 8, LAYOUT.text.y + 2, LAYOUT.text.w + 4, LAYOUT.text.h - 4, 8);
  masks.fill();
  masks.restore();
}
