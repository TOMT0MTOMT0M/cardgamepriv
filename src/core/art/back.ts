import { type Ctx, alpha, applyGrain, radial, roundRect } from './canvas';
import { BASE_H, BASE_W } from './subjects';
import { FONT_MONO, FONT_TITLE } from './frame';

const TAU = Math.PI * 2;

export interface BackStyle {
  ground: string;
  line: string;
  accent: string;
}

export const DEFAULT_BACK: BackStyle = { ground: '#17130f', line: '#c9a86a', accent: '#efe3c4' };

/** Rosace guillochée (hypotrochoïde) — motif de dos façon billet. */
function guilloche(g: Ctx, cx: number, cy: number, R: number, r: number, d: number, turns: number, steps = 2400) {
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    if (i === 0) g.moveTo(cx + x, cy + y);
    else g.lineTo(cx + x, cy + y);
  }
}

/**
 * Dos de carte commun : rosace guillochée, trame, monogramme.
 * Masques : R = foil (lignes), G = relief, B = émissif (cœur).
 */
export function paintBack(back: Ctx, masks: Ctx, style: BackStyle = DEFAULT_BACK) {
  const cx = BASE_W / 2, cy = BASE_H / 2;
  back.fillStyle = style.ground;
  back.fillRect(0, 0, BASE_W, BASE_H);
  back.fillStyle = radial(back, cx, cy, 10, 620, [[0, alpha(style.line, 0.14)], [1, alpha(style.ground, 0)]]);
  back.fillRect(0, 0, BASE_W, BASE_H);
  // trame diagonale fine
  back.save();
  back.strokeStyle = alpha(style.line, 0.07);
  back.lineWidth = 1;
  for (let i = -BASE_H; i < BASE_W + BASE_H; i += 9) {
    back.beginPath();
    back.moveTo(i, 0);
    back.lineTo(i - BASE_H, BASE_H);
    back.stroke();
    back.beginPath();
    back.moveTo(i - BASE_H, 0);
    back.lineTo(i, BASE_H);
    back.stroke();
  }
  back.restore();

  masks.fillStyle = '#000';
  masks.fillRect(0, 0, BASE_W, BASE_H);

  const lines = (g: Ctx, lw: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 2.2 * lw;
    roundRect(g, 34, 34, BASE_W - 68, BASE_H - 68, 22);
    g.stroke();
    g.lineWidth = 0.8 * lw;
    roundRect(g, 46, 46, BASE_W - 92, BASE_H - 92, 16);
    g.stroke();
    g.lineWidth = 0.7 * lw;
    guilloche(g, cx, cy, 250, 37, 96, 37);
    g.stroke();
    g.lineWidth = 0.6 * lw;
    guilloche(g, cx, cy, 170, 21, 52, 21);
    g.stroke();
    g.lineWidth = 1.4 * lw;
    g.beginPath();
    g.arc(cx, cy, 300, 0, TAU);
    g.stroke();
    g.lineWidth = 0.6 * lw;
    g.beginPath();
    g.arc(cx, cy, 312, 0, TAU);
    g.stroke();
    // frises haut / bas
    for (const yy of [92, BASE_H - 92]) {
      g.beginPath();
      for (let x = 70; x <= BASE_W - 70; x += 2) {
        const y = yy + Math.sin(x * 0.12) * 6 * Math.sin(x * 0.012);
        if (x === 70) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  back.save();
  back.shadowColor = alpha(style.line, 0.4);
  back.shadowBlur = 3;
  lines(back, 1, alpha(style.line, 0.85));
  back.restore();

  // cœur : monogramme
  const core = (g: Ctx, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const rr = i % 2 ? 40 : 74;
      if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  core(back, style.line);
  back.fillStyle = style.ground;
  back.font = `700 50px ${FONT_TITLE}`;
  back.textAlign = 'center';
  back.textBaseline = 'middle';
  back.fillText('L', cx, cy + 3);
  back.font = `500 16px ${FONT_MONO}`;
  back.fillStyle = alpha(style.accent, 0.7);
  back.fillText('C A R D   L A B', cx, BASE_H - 60);
  back.fillText('· MMXXVI ·', cx, 62);
  back.textAlign = 'left';
  back.textBaseline = 'alphabetic';
  applyGrain(back, BASE_W, BASE_H, 0.1, 5, 60);

  masks.save();
  masks.globalCompositeOperation = 'lighter';
  lines(masks, 1.6, 'rgb(255,0,0)');
  masks.filter = 'blur(1px)';
  lines(masks, 1.4, 'rgb(0,255,0)');
  core(masks, 'rgb(255,255,0)');
  masks.filter = 'blur(6px)';
  core(masks, 'rgb(0,0,255)');
  masks.restore();
}
