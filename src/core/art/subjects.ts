import type { CardPalette, SubjectKind } from '../cardData';
import { type Ctx, alpha, applyGrain, fbm1, halftone, linear, mix, radial } from './canvas';

/** Fenêtre d'illustration, en coordonnées "carte 768×1072". */
export const WIN = { x: 48, y: 118, w: 672, h: 522 };
export const BASE_W = 768;
export const BASE_H = 1072;

export interface PaintTarget {
  bg: Ctx;
  subj: Ctx;
  fg: Ctx;
  /** R = émissif, G = foil du sujet, B = relief du sujet (composite 'lighter'). */
  fx: Ctx;
  pal: CardPalette;
  r: () => number;
  seed: number;
}

const CX = WIN.x + WIN.w / 2;
const CY = WIN.y + WIN.h / 2;
const TAU = Math.PI * 2;

function fillBgSky(g: Ctx, pal: CardPalette, horizon = 0.62) {
  g.fillStyle = linear(g, 0, 0, 0, BASE_H, [
    [0, pal.sky],
    [WIN.y / BASE_H + 0.05, pal.sky],
    [(WIN.y + WIN.h * horizon) / BASE_H, mix(pal.sky, pal.haze, 0.75)],
    [1, mix(pal.haze, pal.sky, 0.4)],
  ]);
  g.fillRect(0, 0, BASE_W, BASE_H);
}

function stars(g: Ctx, r: () => number, n: number, color: string, yMax = WIN.y + WIN.h * 0.6) {
  g.save();
  for (let i = 0; i < n; i++) {
    const x = r() * BASE_W, y = r() * yMax;
    const s = r();
    g.fillStyle = alpha(color, 0.25 + s * 0.6);
    g.beginPath();
    g.arc(x, y, 0.5 + s * s * 1.6, 0, TAU);
    g.fill();
  }
  g.restore();
}

function fxFill(fx: Ctx, path: () => void, rgb: [number, number, number], blur = 0) {
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  if (blur) fx.filter = `blur(${blur}px)`;
  fx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  path();
  fx.fill();
  fx.restore();
}

function fxStroke(fx: Ctx, path: () => void, rgb: [number, number, number], width: number, blur = 0) {
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  if (blur) fx.filter = `blur(${blur}px)`;
  fx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  fx.lineWidth = width;
  fx.lineCap = 'round';
  path();
  fx.stroke();
  fx.restore();
}

function ridge(g: Ctx, seed: number, yBase: number, amp: number, freq: number, color: string) {
  const n = fbm1(seed, 5);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, BASE_H);
  for (let x = 0; x <= BASE_W; x += 4) g.lineTo(x, yBase - Math.pow(n(x * freq), 1.6) * amp);
  g.lineTo(BASE_W, BASE_H);
  g.closePath();
  g.fill();
}

function embers(g: Ctx, r: () => number, n: number, color: string, area = WIN) {
  g.save();
  g.shadowColor = color;
  for (let i = 0; i < n; i++) {
    const x = area.x + r() * area.w, y = area.y + r() * area.h;
    const s = r();
    g.shadowBlur = 4 + s * 8;
    g.fillStyle = alpha(color, 0.5 + s * 0.5);
    g.beginPath();
    g.arc(x, y, 0.8 + s * 2.2, 0, TAU);
    g.fill();
  }
  g.restore();
}

// ───────────────────────────────────────────────── monolith
function monolith(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r, seed } = t;
  fillBgSky(bg, pal, 0.66);
  // soleil rayé
  const sx = CX + 95, sy = WIN.y + WIN.h * 0.44, sr = 118;
  bg.save();
  bg.fillStyle = radial(bg, sx, sy, 0, sr * 2.6, [[0, alpha(pal.glow, 0.35)], [1, alpha(pal.glow, 0)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  bg.beginPath();
  bg.arc(sx, sy, sr, 0, TAU);
  bg.clip();
  bg.fillStyle = linear(bg, 0, sy - sr, 0, sy + sr, [[0, pal.glow], [1, mix(pal.glow, pal.haze, 0.7)]]);
  bg.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  bg.fillStyle = linear(bg, 0, 0, 0, BASE_H, [[0, pal.sky], [(WIN.y + WIN.h * 0.66) / BASE_H, mix(pal.sky, pal.haze, 0.75)]]);
  for (let i = 0; i < 6; i++) {
    const yy = sy + 10 + i * 18;
    bg.fillRect(sx - sr, yy, sr * 2, 3 + i * 1.6);
  }
  bg.restore();
  ridge(bg, seed + 1, WIN.y + WIN.h * 0.66, 90, 0.008, mix(pal.haze, pal.sky, 0.55));
  ridge(bg, seed + 2, WIN.y + WIN.h * 0.74, 70, 0.012, mix(pal.haze, pal.sky, 0.75));
  ridge(bg, seed + 3, WIN.y + WIN.h * 0.82, 45, 0.02, mix(pal.sky, pal.ink, 0.4));
  bg.save();
  bg.beginPath();
  bg.rect(0, 0, BASE_W, WIN.y + WIN.h * 0.4);
  bg.clip();
  halftone(bg, 0, 0, BASE_W, WIN.y + WIN.h * 0.4, alpha(pal.ink, 0.25), 0.5, 7, (_u, v) => 1 - v * 1.4);
  bg.restore();

  // monolithe
  const bx = CX - 70, by = WIN.y + WIN.h * 0.9, wB = 150, wT = 118, top = WIN.y + WIN.h * 0.17;
  const shape = (g: Ctx) => {
    g.beginPath();
    g.moveTo(bx - wB / 2, by);
    g.lineTo(bx - wT / 2 - 4, top + 40);
    g.quadraticCurveTo(bx - 6, top - 26, bx + wT / 2 + 2, top + 30);
    g.lineTo(bx + wB / 2, by);
    g.closePath();
  };
  subj.save();
  shape(subj);
  subj.fillStyle = linear(subj, bx - wB / 2, 0, bx + wB / 2, 0, [[0, mix(pal.body, pal.haze, 0.35)], [0.18, pal.body], [1, mix(pal.body, '#000', 0.35)]]);
  subj.fill();
  subj.clip();
  halftone(subj, bx - wB, top - 30, wB * 2, by - top + 40, alpha('#000', 0.35), 0.8, 6, (u) => u * 1.2 - 0.2);
  // fissures
  subj.strokeStyle = alpha('#000', 0.45);
  subj.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    let x = bx - wB / 2 + r() * wB, y = top + 40 + r() * (by - top - 60);
    subj.beginPath();
    subj.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 18;
      y += 6 + r() * 14;
      subj.lineTo(x, y);
    }
    subj.stroke();
  }
  subj.restore();
  // liseré de contre-jour
  subj.save();
  shape(subj);
  subj.strokeStyle = alpha(pal.glow, 0.55);
  subj.lineWidth = 2.2;
  subj.stroke();
  subj.restore();
  // runes gravées (émissives)
  const runes = (g: Ctx) => {
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const y = top + 70 + i * 46;
      const x0 = bx - 18;
      const kind = (seed + i * 7) % 4;
      g.moveTo(x0, y);
      if (kind === 0) {
        g.lineTo(x0 + 36, y);
        g.moveTo(x0 + 18, y - 14);
        g.lineTo(x0 + 18, y + 16);
      } else if (kind === 1) {
        g.lineTo(x0 + 18, y - 16);
        g.lineTo(x0 + 36, y);
        g.lineTo(x0 + 18, y + 16);
        g.closePath();
      } else if (kind === 2) {
        g.moveTo(x0 + 18, y - 16);
        g.lineTo(x0 + 18, y + 16);
        g.moveTo(x0 + 4, y - 6);
        g.lineTo(x0 + 32, y + 8);
      } else {
        g.moveTo(x0 + 30, y);
        g.arc(x0 + 18, y, 12, 0.3, TAU - 0.3);
      }
    }
  };
  subj.save();
  subj.strokeStyle = pal.glow;
  subj.lineWidth = 3;
  subj.lineCap = 'round';
  subj.shadowColor = pal.glow;
  subj.shadowBlur = 10;
  runes(subj);
  subj.stroke();
  subj.restore();
  fxStroke(fx, () => runes(fx), [255, 0, 0], 5, 2);
  fxFill(fx, () => shape(fx), [0, 0, 150]);

  // premier plan : sol, herbes, braises
  fg.fillStyle = pal.ink;
  const n = fbm1(seed + 9, 4);
  fg.beginPath();
  fg.moveTo(0, BASE_H);
  for (let x = 0; x <= BASE_W; x += 3) fg.lineTo(x, WIN.y + WIN.h * 0.9 - n(x * 0.03) * 30);
  fg.lineTo(BASE_W, BASE_H);
  fg.fill();
  fg.strokeStyle = pal.ink;
  fg.lineWidth = 1.6;
  for (let i = 0; i < 90; i++) {
    const x = r() * BASE_W, y = WIN.y + WIN.h * 0.9 - n(x * 0.03) * 30 + 4;
    const hgt = 14 + r() * 34;
    fg.beginPath();
    fg.moveTo(x, y);
    fg.quadraticCurveTo(x + (r() - 0.5) * 10, y - hgt * 0.6, x + (r() - 0.3) * 18, y - hgt);
    fg.stroke();
  }
  embers(fg, r, 46, pal.glow, { x: WIN.x, y: WIN.y + 40, w: WIN.w, h: WIN.h * 0.8 });
}

// ───────────────────────────────────────────────── moth
function moth(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r } = t;
  bg.fillStyle = radial(bg, CX, CY - 20, 20, 520, [[0, mix(pal.sky, pal.haze, 0.45)], [0.5, pal.sky], [1, mix(pal.sky, '#000', 0.3)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  stars(bg, r, 160, pal.paper, BASE_H);
  bg.save();
  bg.fillStyle = radial(bg, CX, CY - 40, 0, 170, [[0, alpha(pal.paper, 0.9)], [0.7, alpha(pal.haze, 0.5)], [1, alpha(pal.haze, 0)]]);
  bg.beginPath();
  bg.arc(CX, CY - 40, 170, 0, TAU);
  bg.fill();
  bg.strokeStyle = alpha(pal.paper, 0.18);
  for (let i = 0; i < 9; i++) {
    bg.lineWidth = i % 3 === 0 ? 1.6 : 0.7;
    bg.beginPath();
    bg.arc(CX, CY - 40, 190 + i * 26, 0, TAU);
    bg.stroke();
  }
  bg.restore();

  const wing = (g: Ctx, s: number, upper: boolean) => {
    g.beginPath();
    if (upper) {
      g.moveTo(CX + s * 8, CY - 30);
      g.bezierCurveTo(CX + s * 80, CY - 200, CX + s * 250, CY - 230, CX + s * 300, CY - 150);
      g.bezierCurveTo(CX + s * 320, CY - 90, CX + s * 260, CY - 10, CX + s * 12, CY + 6);
    } else {
      g.moveTo(CX + s * 10, CY + 4);
      g.bezierCurveTo(CX + s * 150, CY + 10, CX + s * 230, CY + 70, CX + s * 200, CY + 170);
      g.bezierCurveTo(CX + s * 170, CY + 230, CX + s * 60, CY + 160, CX + s * 8, CY + 60);
    }
    g.closePath();
  };
  for (const s of [-1, 1])
    for (const up of [false, true]) {
      subj.save();
      wing(subj, s, up);
      subj.fillStyle = radial(subj, CX + s * 40, CY, 10, 320, [[0, mix(pal.body, pal.ink, 0.35)], [0.35, pal.body], [1, mix(pal.body, pal.haze, 0.4)]]);
      subj.fill();
      subj.clip();
      // bande de bord
      subj.lineWidth = 26;
      subj.strokeStyle = alpha(pal.ink, 0.55);
      wing(subj, s, up);
      subj.stroke();
      // nervures
      subj.strokeStyle = alpha(pal.ink, 0.5);
      subj.lineWidth = 1.3;
      for (let k = 0; k < 9; k++) {
        const a = (up ? -1.9 : 0.15) + k * (up ? 0.19 : 0.17);
        subj.beginPath();
        subj.moveTo(CX + s * 12, CY + (up ? -14 : 30));
        subj.quadraticCurveTo(CX + s * Math.cos(a) * 140, CY + Math.sin(a) * 120, CX + s * Math.cos(a) * 320, CY + Math.sin(a) * 260);
        subj.stroke();
      }
      halftone(subj, CX - 330, CY - 260, 660, 520, alpha(pal.ink, 0.3), 0.3, 6, (u, v) => Math.hypot(u - 0.5, v - 0.5) * 2 - 0.25);
      subj.restore();
      // ocelle
      const ex = CX + s * (up ? 190 : 140), ey = CY + (up ? -110 : 100), er = up ? 34 : 22;
      subj.save();
      [[er, pal.ink], [er * 0.78, pal.glow], [er * 0.5, mix(pal.haze, pal.ink, 0.4)], [er * 0.22, pal.ink]].forEach(([rr, c]) => {
        subj.fillStyle = c as string;
        subj.beginPath();
        subj.arc(ex, ey, rr as number, 0, TAU);
        subj.fill();
      });
      subj.fillStyle = alpha(pal.paper, 0.9);
      subj.beginPath();
      subj.arc(ex - er * 0.2, ey - er * 0.25, er * 0.12, 0, TAU);
      subj.fill();
      subj.restore();
      fxFill(fx, () => {
        fx.beginPath();
        fx.arc(ex, ey, er * 0.78, 0, TAU);
      }, [255, 0, 0], 3);
      fxFill(fx, () => wing(fx, s, up), [0, 200, 90]);
    }
  // corps velu
  subj.save();
  subj.fillStyle = linear(subj, CX - 20, 0, CX + 20, 0, [[0, mix(pal.ink, pal.body, 0.4)], [0.5, mix(pal.body, pal.ink, 0.2)], [1, pal.ink]]);
  subj.beginPath();
  subj.ellipse(CX, CY + 20, 22, 110, 0, 0, TAU);
  subj.fill();
  subj.strokeStyle = alpha(pal.body, 0.6);
  subj.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const a = r() * TAU, y = CY + 20 + Math.sin(a) * 100;
    const x = CX + Math.cos(a) * 20;
    subj.beginPath();
    subj.moveTo(x, y);
    subj.lineTo(x + Math.cos(a) * 7, y + (r() - 0.5) * 5);
    subj.stroke();
  }
  subj.strokeStyle = alpha(pal.ink, 0.5);
  subj.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    subj.beginPath();
    subj.moveTo(CX - 16, CY + 40 + i * 13);
    subj.quadraticCurveTo(CX, CY + 46 + i * 13, CX + 16, CY + 40 + i * 13);
    subj.stroke();
  }
  // antennes plumeuses
  for (const s of [-1, 1]) {
    subj.strokeStyle = pal.ink;
    subj.lineWidth = 2;
    subj.beginPath();
    subj.moveTo(CX + s * 6, CY - 86);
    subj.quadraticCurveTo(CX + s * 40, CY - 170, CX + s * 92, CY - 196);
    subj.stroke();
    subj.lineWidth = 1;
    for (let k = 0; k < 16; k++) {
      const u = k / 16;
      const x = CX + s * (6 + 86 * u), y = CY - 86 - 110 * u + 30 * u * u;
      subj.beginPath();
      subj.moveTo(x, y);
      subj.lineTo(x + s * 10, y - 8);
      subj.moveTo(x, y);
      subj.lineTo(x - s * 4, y - 12);
      subj.stroke();
    }
  }
  subj.restore();
  fxFill(fx, () => {
    fx.beginPath();
    fx.ellipse(CX, CY + 20, 22, 110, 0, 0, TAU);
  }, [0, 0, 255], 4);
  // poussières d'écailles
  embers(fg, r, 70, pal.paper, WIN);
  fg.save();
  fg.strokeStyle = alpha(pal.paper, 0.4);
  for (let i = 0; i < 12; i++) {
    const x = WIN.x + r() * WIN.w, y = WIN.y + r() * WIN.h, l = 20 + r() * 40;
    fg.lineWidth = 0.8;
    fg.beginPath();
    fg.moveTo(x, y);
    fg.lineTo(x + l * 0.3, y + l);
    fg.stroke();
  }
  fg.restore();
}

// ───────────────────────────────────────────────── sigil
function sigil(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r, seed } = t;
  bg.fillStyle = radial(bg, CX, CY, 30, 560, [[0, mix(pal.sky, pal.haze, 0.35)], [1, mix(pal.sky, '#000', 0.4)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  bg.save();
  bg.strokeStyle = alpha(pal.haze, 0.45);
  const n = fbm1(seed, 3);
  for (let i = 0; i < 46; i++) {
    const y0 = WIN.y - 20 + i * 14 + Math.pow(i / 46, 2) * 60;
    bg.lineWidth = 0.6 + (i / 46) * 1.6;
    bg.beginPath();
    for (let x = 0; x <= BASE_W; x += 6) {
      const y = y0 + Math.sin(x * 0.018 + i * 0.7) * (3 + i * 0.18) + (n(x * 0.01 + i) - 0.5) * 10;
      if (x === 0) bg.moveTo(x, y);
      else bg.lineTo(x, y);
    }
    bg.stroke();
  }
  bg.restore();

  const draw = (g: Ctx, lw = 1) => {
    g.lineWidth = 4 * lw;
    g.beginPath();
    g.arc(CX, CY, 212, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5 * lw;
    g.beginPath();
    g.arc(CX, CY, 198, 0, TAU);
    g.stroke();
    g.lineWidth = 3 * lw;
    g.beginPath();
    g.arc(CX, CY, 122, 0, TAU);
    g.stroke();
    // heptagramme {7/3}
    g.lineWidth = 2.5 * lw;
    g.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = -Math.PI / 2 + ((i * 3) % 7) * (TAU / 7);
      const x = CX + Math.cos(a) * 198, y = CY + Math.sin(a) * 198;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // triangle intérieur
    g.lineWidth = 2 * lw;
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = Math.PI / 2 + i * (TAU / 3);
      const x = CX + Math.cos(a) * 122, y = CY + Math.sin(a) * 122;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  const runeRand = fbm1(seed + 5, 2);
  const runes = (g: Ctx, lw = 1) => {
    g.lineWidth = 2 * lw;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      const rx = CX + Math.cos(a) * 160, ry = CY + Math.sin(a) * 160;
      g.save();
      g.translate(rx, ry);
      g.rotate(a + Math.PI / 2);
      g.beginPath();
      const k = Math.floor(runeRand(i * 3.1) * 997);
      for (let s = 0; s < 3; s++) {
        const p = (k >> (s * 3)) & 7;
        const x0 = ((p & 1) - 0.5) * 12, y0 = (((p >> 1) & 1) - 0.5) * 16;
        g.moveTo(x0, y0);
        g.lineTo(-x0 * ((p >> 2) & 1 ? 1 : -0.2), -y0);
      }
      g.stroke();
      g.restore();
    }
  };
  subj.save();
  subj.strokeStyle = pal.body;
  subj.shadowColor = alpha(pal.glow, 0.6);
  subj.shadowBlur = 8;
  draw(subj);
  runes(subj);
  subj.fillStyle = pal.glow;
  subj.beginPath();
  subj.arc(CX, CY, 30, 0, TAU);
  subj.fill();
  subj.fillStyle = pal.ink;
  subj.beginPath();
  subj.ellipse(CX, CY, 8, 22, 0, 0, TAU);
  subj.fill();
  subj.restore();
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.strokeStyle = 'rgb(170,255,0)';
  fx.filter = 'blur(1.5px)';
  draw(fx, 1.6);
  runes(fx, 1.6);
  fx.restore();
  fxFill(fx, () => {
    fx.beginPath();
    fx.arc(CX, CY, 34, 0, TAU);
  }, [255, 0, 200], 3);
  // éclats
  fg.save();
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU, d = 240 + r() * 120;
    const x = CX + Math.cos(a) * d, y = CY + Math.sin(a) * d * 0.8;
    const s = 8 + r() * 18;
    fg.translate(x, y);
    fg.rotate(r() * TAU);
    fg.beginPath();
    fg.moveTo(0, -s);
    fg.lineTo(s * 0.35, s * 0.6);
    fg.lineTo(-s * 0.3, s * 0.4);
    fg.closePath();
    fg.fillStyle = alpha(pal.body, 0.75);
    fg.fill();
    fg.strokeStyle = alpha(pal.ink, 0.6);
    fg.lineWidth = 1;
    fg.stroke();
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.scale(fg.canvas.width / BASE_W, fg.canvas.height / BASE_H);
  }
  fg.strokeStyle = alpha(pal.paper, 0.35);
  for (let i = 0; i < 26; i++) {
    fg.lineWidth = 1;
    fg.beginPath();
    fg.arc(WIN.x + r() * WIN.w, WIN.y + WIN.h * (0.5 + r() * 0.5), 2 + r() * 6, 0, TAU);
    fg.stroke();
  }
  fg.restore();
}

// ───────────────────────────────────────────────── tower
function tower(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r, seed } = t;
  fillBgSky(bg, pal, 0.8);
  bg.save();
  bg.fillStyle = radial(bg, CX - 150, WIN.y + 120, 0, 90, [[0, alpha(pal.paper, 0.95)], [0.6, alpha(pal.paper, 0.85)], [1, alpha(pal.paper, 0)]]);
  bg.beginPath();
  bg.arc(CX - 150, WIN.y + 120, 90, 0, TAU);
  bg.fill();
  for (let i = 0; i < 9; i++) {
    const y = WIN.y + 80 + i * 52 + r() * 20;
    bg.fillStyle = alpha(mix(pal.haze, pal.paper, 0.3), 0.12 + r() * 0.18);
    bg.beginPath();
    bg.ellipse(r() * BASE_W, y, 160 + r() * 200, 8 + r() * 10, 0, 0, TAU);
    bg.fill();
  }
  halftone(bg, 0, 0, BASE_W, WIN.y + WIN.h * 0.5, alpha(pal.ink, 0.22), 0.6, 7, (_u, v) => 1 - v * 1.6);
  bg.restore();
  ridge(bg, seed + 3, WIN.y + WIN.h * 0.86, 40, 0.015, mix(pal.haze, pal.sky, 0.6));

  const base = WIN.y + WIN.h * 0.96, top = WIN.y + 46;
  const widthAt = (y: number) => {
    const u = (y - top) / (base - top);
    return 46 + u * 92 + (Math.floor(u * 9) % 2) * 8;
  };
  const shape = (g: Ctx) => {
    g.beginPath();
    g.moveTo(CX + 30, top - 40);
    for (let y = top; y <= base; y += 8) g.lineTo(CX + 30 + widthAt(y) / 2, y);
    for (let y = base; y >= top; y -= 8) g.lineTo(CX + 30 - widthAt(y) / 2, y);
    g.closePath();
  };
  subj.save();
  shape(subj);
  subj.fillStyle = linear(subj, CX - 50, 0, CX + 110, 0, [[0, mix(pal.body, '#000', 0.4)], [0.65, pal.body], [1, mix(pal.body, pal.haze, 0.55)]]);
  subj.fill();
  subj.clip();
  subj.strokeStyle = alpha('#000', 0.35);
  subj.lineWidth = 1;
  for (let y = top + 20; y < base; y += 22) {
    subj.beginPath();
    subj.moveTo(CX - 60, y);
    subj.lineTo(CX + 120, y + 3);
    subj.stroke();
  }
  subj.restore();
  const windows: Array<[number, number, number, number]> = [];
  for (let y = top + 30; y < base - 20; y += 22) {
    const w = widthAt(y);
    const cols = Math.max(2, Math.floor(w / 22));
    for (let c = 0; c < cols; c++) {
      if (r() < 0.45) continue;
      const x = CX + 30 - w / 2 + 8 + c * ((w - 16) / cols);
      windows.push([x, y, 6, 10]);
    }
  }
  windows.forEach(([x, y, w, h]) => {
    const lit = r() < 0.38;
    subj.fillStyle = lit ? pal.glow : alpha('#000', 0.55);
    if (lit) {
      subj.shadowColor = pal.glow;
      subj.shadowBlur = 8;
    }
    subj.fillRect(x, y, w, h);
    subj.shadowBlur = 0;
    if (lit) fxFill(fx, () => {
      fx.beginPath();
      fx.rect(x - 1, y - 1, w + 2, h + 2);
    }, [255, 0, 0], 1.5);
  });
  subj.save();
  shape(subj);
  subj.strokeStyle = alpha(pal.haze, 0.6);
  subj.lineWidth = 2;
  subj.stroke();
  subj.restore();
  fxFill(fx, () => shape(fx), [0, 0, 160]);

  // premier plan : falaises, brume, oiseaux
  fg.save();
  fg.fillStyle = pal.ink;
  fg.beginPath();
  fg.moveTo(0, BASE_H);
  fg.lineTo(0, WIN.y + WIN.h * 0.7);
  fg.lineTo(70, WIN.y + WIN.h * 0.74);
  fg.lineTo(130, WIN.y + WIN.h * 0.86);
  fg.lineTo(210, WIN.y + WIN.h * 0.9);
  fg.lineTo(260, WIN.y + WIN.h * 1.02);
  fg.lineTo(BASE_W, WIN.y + WIN.h * 1.02);
  fg.lineTo(BASE_W, WIN.y + WIN.h * 0.88);
  fg.lineTo(BASE_W - 90, WIN.y + WIN.h * 0.92);
  fg.lineTo(BASE_W - 200, BASE_H);
  fg.closePath();
  fg.fill();
  fg.fillStyle = linear(fg, 0, WIN.y + WIN.h * 0.78, 0, WIN.y + WIN.h * 0.98, [[0, alpha(pal.paper, 0)], [0.5, alpha(mix(pal.paper, pal.haze, 0.5), 0.45)], [1, alpha(pal.paper, 0)]]);
  fg.fillRect(0, WIN.y + WIN.h * 0.78, BASE_W, WIN.h * 0.2);
  fg.strokeStyle = pal.ink;
  fg.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = WIN.x + 380 + r() * 260, y = WIN.y + 60 + r() * 180, s = 5 + r() * 8;
    fg.beginPath();
    fg.moveTo(x - s, y - s * 0.4);
    fg.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y);
    fg.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s, y - s * 0.4);
    fg.stroke();
  }
  fg.restore();
}

// ───────────────────────────────────────────────── serpent
function serpent(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r, seed } = t;
  fillBgSky(bg, pal, 0.58);
  bg.save();
  bg.fillStyle = radial(bg, CX + 160, WIN.y + WIN.h * 0.5, 0, 70, [[0, alpha(pal.glow, 0.9)], [1, alpha(pal.glow, 0)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  const hz = WIN.y + WIN.h * 0.58;
  for (let i = 0; i < 30; i++) {
    const y = hz + i * i * 0.55;
    bg.fillStyle = alpha(i % 2 ? pal.haze : mix(pal.sky, '#000', 0.2), 0.55);
    bg.fillRect(0, y, BASE_W, 1 + i * 0.25);
  }
  // banquise
  for (let i = 0; i < 14; i++) {
    const x = r() * BASE_W, w = 30 + r() * 90, h = 8 + r() * 26;
    bg.fillStyle = mix(pal.body, pal.haze, 0.3 + r() * 0.4);
    bg.beginPath();
    bg.moveTo(x - w / 2, hz + 3);
    bg.lineTo(x - w * 0.2, hz - h);
    bg.lineTo(x + w * 0.1, hz - h * 0.6);
    bg.lineTo(x + w / 2, hz + 3);
    bg.fill();
  }
  bg.restore();

  // trajectoire du corps
  const P = (u: number): [number, number, number] => {
    const x = WIN.x + 60 + u * 520 + Math.sin(u * 7 + seed) * 50 * (1 - u * 0.4);
    const y = WIN.y + WIN.h * 0.95 - u * WIN.h * 0.7 + Math.sin(u * 9.5) * 70 * (1 - u * 0.5);
    const rad = 10 + Math.sin(Math.min(1, u * 1.15) * Math.PI) * 34 + (u > 0.9 ? 10 : 0);
    return [x, y, rad];
  };
  const N = 260;
  const passes: Array<[number, string, number]> = [
    [5, pal.ink, 0],
    [0, mix(pal.body, pal.haze, 0.5), 0],
    [-8, pal.body, -5],
    [-18, mix(pal.body, '#fff', 0.6), -9],
  ];
  for (const [dr, col, off] of passes) {
    subj.fillStyle = col;
    for (let i = 0; i <= N; i++) {
      const [x, y, rad] = P(i / N);
      subj.beginPath();
      subj.arc(x + off * 0.3, y + off, Math.max(1, rad + dr), 0, TAU);
      subj.fill();
    }
  }
  // écailles
  subj.strokeStyle = alpha(pal.ink, 0.35);
  subj.lineWidth = 1.2;
  for (let i = 4; i < N - 20; i += 3) {
    const [x, y, rad] = P(i / N);
    const [x2, y2] = P((i + 1) / N);
    const a = Math.atan2(y2 - y, x2 - x);
    for (let k = -1; k <= 1; k++) {
      subj.beginPath();
      subj.arc(x + Math.cos(a + Math.PI / 2) * k * rad * 0.5, y + Math.sin(a + Math.PI / 2) * k * rad * 0.5, rad * 0.22, a - 1.2, a + 1.2);
      subj.stroke();
    }
  }
  // tête
  const [hx, hy] = P(1);
  const [px, py] = P(0.97);
  const ha = Math.atan2(hy - py, hx - px);
  subj.save();
  subj.translate(hx, hy);
  subj.rotate(ha);
  subj.fillStyle = pal.body;
  subj.strokeStyle = pal.ink;
  subj.lineWidth = 4;
  subj.beginPath();
  subj.moveTo(-30, -36);
  subj.quadraticCurveTo(50, -40, 78, -6);
  subj.quadraticCurveTo(60, 20, -20, 34);
  subj.closePath();
  subj.fill();
  subj.stroke();
  // cornes de givre
  subj.fillStyle = mix(pal.body, '#fff', 0.5);
  for (let k = 0; k < 4; k++) {
    subj.beginPath();
    subj.moveTo(-10 - k * 12, -30);
    subj.lineTo(-40 - k * 16, -78 + k * 8);
    subj.lineTo(-24 - k * 12, -28);
    subj.fill();
    subj.stroke();
  }
  subj.fillStyle = pal.glow;
  subj.shadowColor = pal.glow;
  subj.shadowBlur = 14;
  subj.beginPath();
  subj.ellipse(30, -12, 9, 5, 0.2, 0, TAU);
  subj.fill();
  subj.restore();
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.filter = 'blur(3px)';
  fx.fillStyle = 'rgb(255,0,0)';
  fx.translate(hx, hy);
  fx.rotate(ha);
  fx.beginPath();
  fx.ellipse(30, -12, 12, 8, 0.2, 0, TAU);
  fx.fill();
  fx.restore();
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.fillStyle = 'rgb(0,160,0)';
  for (let i = 0; i <= N; i += 2) {
    const [x, y, rad] = P(i / N);
    fx.beginPath();
    fx.arc(x, y, rad * 0.9, 0, TAU);
    fx.fill();
  }
  fx.restore();
  // neige
  fg.save();
  for (let i = 0; i < 140; i++) {
    const x = r() * BASE_W, y = WIN.y + r() * WIN.h, s = r();
    fg.fillStyle = alpha('#ffffff', 0.35 + s * 0.55);
    fg.beginPath();
    fg.arc(x, y, 0.6 + s * s * 3, 0, TAU);
    fg.fill();
  }
  fg.restore();
}

// ───────────────────────────────────────────────── bloom
function bloom(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r } = t;
  bg.fillStyle = radial(bg, CX, CY, 20, 560, [[0, mix(pal.sky, pal.haze, 0.55)], [0.55, pal.sky], [1, mix(pal.sky, '#000', 0.4)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  bg.save();
  bg.strokeStyle = alpha(mix(pal.haze, pal.sky, 0.3), 0.9);
  for (let i = 0; i < 9; i++) {
    let x = WIN.x + r() * WIN.w, y = BASE_H;
    bg.lineWidth = 3 + r() * 5;
    bg.beginPath();
    bg.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += (r() - 0.5) * 40;
      y -= 40 + r() * 20;
      bg.lineTo(x, y);
      if (r() > 0.5) {
        bg.moveTo(x, y);
        bg.lineTo(x + (r() > 0.5 ? 12 : -12), y - 9);
        bg.moveTo(x, y);
      }
    }
    bg.stroke();
  }
  halftone(bg, 0, 0, BASE_W, BASE_H, alpha('#000', 0.25), 0.7, 8, (u, v) => Math.hypot(u - 0.5, v - 0.45) * 2.2 - 0.3);
  bg.restore();

  const petal = (g: Ctx, a: number, len: number, wid: number) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (x: number, y: number): [number, number] => [CX + x * ca - y * sa, CY - 10 + x * sa + y * ca];
    g.beginPath();
    g.moveTo(...P(0, 0));
    g.bezierCurveTo(...P(len * 0.3, -wid), ...P(len * 0.8, -wid * 0.9), ...P(len, 0));
    g.bezierCurveTo(...P(len * 0.8, wid * 0.9), ...P(len * 0.3, wid), ...P(0, 0));
    g.closePath();
  };
  const layers: Array<[number, number, number, number]> = [
    [7, 236, 70, 0],
    [9, 180, 52, 0.25],
    [11, 122, 34, 0.5],
  ];
  layers.forEach(([n, len, wid, light], li) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + li * 0.4;
      subj.save();
      petal(subj, a, len, wid);
      subj.fillStyle = radial(subj, CX, CY - 10, len * 0.1, len, [[0, mix(pal.body, '#000', 0.55 - light * 0.5)], [0.7, mix(pal.body, pal.glow, light * 0.5)], [1, mix(pal.body, '#000', 0.2)]]);
      subj.fill();
      subj.strokeStyle = alpha('#000', 0.4);
      subj.lineWidth = 1.4;
      subj.stroke();
      subj.clip();
      subj.strokeStyle = alpha(pal.glow, 0.25);
      subj.lineWidth = 0.9;
      for (let k = -2; k <= 2; k++) {
        petal(subj, a + k * 0.05, len * 0.94, wid * 0.08);
        subj.stroke();
      }
      subj.restore();
      if (li === 0) fxFill(fx, () => petal(fx, a, len, wid), [0, 140, 120]);
    }
  });
  subj.save();
  subj.fillStyle = mix(pal.body, '#000', 0.6);
  subj.beginPath();
  subj.arc(CX, CY - 10, 36, 0, TAU);
  subj.fill();
  subj.fillStyle = pal.glow;
  subj.shadowColor = pal.glow;
  subj.shadowBlur = 10;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU, d = 18 + (i % 2) * 12;
    subj.beginPath();
    subj.arc(CX + Math.cos(a) * d, CY - 10 + Math.sin(a) * d, 3.2, 0, TAU);
    subj.fill();
  }
  subj.restore();
  fxFill(fx, () => {
    fx.beginPath();
    fx.arc(CX, CY - 10, 40, 0, TAU);
  }, [255, 0, 255], 3);
  fg.save();
  for (let i = 0; i < 18; i++) {
    const x = WIN.x + r() * WIN.w, y = WIN.y + r() * WIN.h;
    fg.translate(x, y);
    fg.rotate(r() * TAU);
    fg.fillStyle = mix(pal.body, pal.glow, r() * 0.4);
    fg.beginPath();
    fg.ellipse(0, 0, 4 + r() * 6, 10 + r() * 10, 0, 0, TAU);
    fg.fill();
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.scale(fg.canvas.width / BASE_W, fg.canvas.height / BASE_H);
  }
  fg.restore();
}

// ───────────────────────────────────────────────── eye
function eye(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r } = t;
  bg.fillStyle = pal.sky;
  bg.fillRect(0, 0, BASE_W, BASE_H);
  bg.save();
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * TAU, a1 = ((i + 0.5) / 36) * TAU;
    bg.fillStyle = alpha(pal.haze, 0.35);
    bg.beginPath();
    bg.moveTo(CX, CY);
    bg.arc(CX, CY, 900, a0, a1);
    bg.closePath();
    bg.fill();
  }
  bg.fillStyle = radial(bg, CX, CY, 0, 520, [[0, alpha(pal.glow, 0.35)], [0.5, alpha(pal.sky, 0.3)], [1, alpha(pal.sky, 0.95)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  bg.strokeStyle = alpha(pal.body, 0.25);
  for (let i = 0; i < 6; i++) {
    bg.lineWidth = 1 + (i % 2) * 2;
    bg.beginPath();
    bg.arc(CX, CY, 250 + i * 34, 0, TAU);
    bg.stroke();
  }
  stars(bg, r, 120, pal.body, BASE_H);
  bg.restore();

  const W2 = 240, H2 = 120;
  const lid = (g: Ctx) => {
    g.beginPath();
    g.moveTo(CX - W2, CY);
    g.quadraticCurveTo(CX, CY - H2 * 1.9, CX + W2, CY);
    g.quadraticCurveTo(CX, CY + H2 * 1.9, CX - W2, CY);
    g.closePath();
  };
  subj.save();
  lid(subj);
  subj.fillStyle = radial(subj, CX, CY, 20, W2, [[0, pal.paper], [1, mix(pal.paper, pal.haze, 0.5)]]);
  subj.fill();
  subj.clip();
  // iris
  const ir = 96;
  subj.fillStyle = radial(subj, CX, CY, 10, ir, [[0, pal.glow], [0.55, pal.body], [1, mix(pal.haze, '#000', 0.4)]]);
  subj.beginPath();
  subj.arc(CX, CY, ir, 0, TAU);
  subj.fill();
  subj.strokeStyle = alpha(pal.ink, 0.45);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU + r() * 0.03;
    subj.lineWidth = 0.6 + r() * 1.2;
    subj.beginPath();
    subj.moveTo(CX + Math.cos(a) * 40, CY + Math.sin(a) * 40);
    subj.lineTo(CX + Math.cos(a) * (ir - r() * 14), CY + Math.sin(a) * (ir - r() * 14));
    subj.stroke();
  }
  subj.fillStyle = pal.ink;
  subj.beginPath();
  subj.ellipse(CX, CY, 20, 42, 0, 0, TAU);
  subj.fill();
  subj.fillStyle = alpha('#fff', 0.92);
  subj.beginPath();
  subj.ellipse(CX - 30, CY - 34, 13, 9, -0.5, 0, TAU);
  subj.fill();
  subj.fillStyle = alpha(pal.ink, 0.4);
  subj.fillRect(CX - W2, CY - H2 * 1.9, W2 * 2, 40);
  subj.restore();
  subj.save();
  lid(subj);
  subj.lineWidth = 10;
  subj.strokeStyle = pal.ink;
  subj.stroke();
  subj.lineWidth = 3;
  for (let i = 0; i < 19; i++) {
    const u = i / 18;
    const x = CX - W2 + u * W2 * 2;
    const y = CY - (1 - Math.pow(2 * u - 1, 2)) * H2 * 0.95;
    const a = -Math.PI / 2 + (u - 0.5) * 1.6;
    subj.beginPath();
    subj.moveTo(x, y);
    subj.lineTo(x + Math.cos(a) * 34, y + Math.sin(a) * 34);
    subj.stroke();
  }
  subj.restore();
  fxFill(fx, () => {
    fx.beginPath();
    fx.arc(CX, CY, ir, 0, TAU);
  }, [230, 0, 0], 2);
  fxFill(fx, () => lid(fx), [0, 120, 200]);
  embers(fg, r, 60, pal.glow, WIN);
  fg.save();
  fg.strokeStyle = pal.ink;
  fg.lineWidth = 5;
  fg.beginPath();
  fg.moveTo(WIN.x - 10, WIN.y + 60);
  fg.bezierCurveTo(WIN.x + 200, WIN.y + 10, WIN.x + 470, WIN.y + 110, WIN.x + WIN.w + 10, WIN.y + 30);
  fg.stroke();
  for (let i = 0; i < 12; i++) {
    const x = WIN.x + 30 + i * 55;
    fg.lineWidth = 1.5;
    fg.beginPath();
    fg.moveTo(x, WIN.y + 48 + Math.sin(i) * 10);
    fg.lineTo(x + 3, WIN.y + 90 + (i % 3) * 24);
    fg.stroke();
    fg.fillStyle = pal.ink;
    fg.beginPath();
    fg.arc(x + 3, WIN.y + 94 + (i % 3) * 24, 4, 0, TAU);
    fg.fill();
  }
  fg.restore();
}

// ───────────────────────────────────────────────── stag
function stag(t: PaintTarget) {
  const { bg, subj, fg, fx, pal, r, seed } = t;
  fillBgSky(bg, pal, 0.9);
  bg.save();
  for (let i = 0; i < 70; i++) {
    const x = r() * BASE_W, y = WIN.y + r() * WIN.h * 0.75, s = 30 + r() * 80;
    bg.fillStyle = alpha(mix(pal.sky, r() > 0.6 ? pal.haze : '#000', 0.3 + r() * 0.3), 0.5);
    bg.beginPath();
    bg.arc(x, y, s, 0, TAU);
    bg.fill();
  }
  // éclair lointain
  let x = CX + 170, y = WIN.y;
  bg.fillStyle = radial(bg, x, WIN.y + 160, 0, 220, [[0, alpha(pal.glow, 0.45)], [1, alpha(pal.glow, 0)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  bg.strokeStyle = pal.glow;
  bg.shadowColor = pal.glow;
  bg.shadowBlur = 16;
  bg.lineWidth = 2.5;
  bg.beginPath();
  bg.moveTo(x, y);
  while (y < WIN.y + WIN.h * 0.7) {
    x += (r() - 0.5) * 50;
    y += 20 + r() * 26;
    bg.lineTo(x, y);
  }
  bg.stroke();
  bg.restore();
  ridge(bg, seed, WIN.y + WIN.h * 0.88, 50, 0.01, mix(pal.sky, '#000', 0.35));

  const hy = CY + 40;
  const head = (g: Ctx) => {
    g.beginPath();
    g.moveTo(CX - 70, hy - 70);
    g.quadraticCurveTo(CX, hy - 100, CX + 70, hy - 70);
    g.lineTo(CX + 52, hy + 30);
    g.quadraticCurveTo(CX + 30, hy + 150, CX, hy + 170);
    g.quadraticCurveTo(CX - 30, hy + 150, CX - 52, hy + 30);
    g.closePath();
  };
  // bois (récursif)
  const branch = (g: Ctx, x0: number, y0: number, a: number, len: number, d: number, s: number) => {
    if (d === 0 || len < 8) return;
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    g.lineWidth = Math.max(1.5, d * 2.6);
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x0 + Math.cos(a + 0.2 * s) * len * 0.5, y0 + Math.sin(a + 0.2 * s) * len * 0.5, x1, y1);
    g.stroke();
    branch(g, x1, y1, a - 0.18 * s, len * 0.78, d - 1, s);
    if (d % 2 === 0) branch(g, x1, y1, a + 0.75 * s, len * 0.5, d - 2, s);
  };
  const antlers = (g: Ctx) => {
    for (const s of [-1, 1]) branch(g, CX + s * 46, hy - 80, -Math.PI / 2 + s * 0.65, 70, 6, s);
  };
  subj.save();
  subj.strokeStyle = mix(pal.body, pal.ink, 0.15);
  subj.lineCap = 'round';
  antlers(subj);
  subj.restore();
  // oreilles
  for (const s of [-1, 1]) {
    subj.fillStyle = mix(pal.body, pal.ink, 0.3);
    subj.beginPath();
    subj.ellipse(CX + s * 100, hy - 40, 52, 18, s * 0.45, 0, TAU);
    subj.fill();
  }
  subj.save();
  head(subj);
  subj.fillStyle = linear(subj, CX - 70, 0, CX + 70, 0, [[0, mix(pal.body, pal.ink, 0.45)], [0.45, pal.body], [1, mix(pal.body, pal.ink, 0.3)]]);
  subj.fill();
  subj.clip();
  halftone(subj, CX - 80, hy - 100, 160, 280, alpha(pal.ink, 0.35), 0.4, 6, (u, v) => Math.abs(u - 0.5) * 2.2 - 0.3 + v * 0.3);
  subj.fillStyle = pal.ink;
  subj.beginPath();
  subj.ellipse(CX, hy + 150, 26, 18, 0, 0, TAU);
  subj.fill();
  subj.restore();
  for (const s of [-1, 1]) {
    subj.save();
    subj.fillStyle = pal.glow;
    subj.shadowColor = pal.glow;
    subj.shadowBlur = 12;
    subj.beginPath();
    subj.ellipse(CX + s * 34, hy - 6, 11, 6, s * 0.3, 0, TAU);
    subj.fill();
    subj.restore();
    fxFill(fx, () => {
      fx.beginPath();
      fx.ellipse(CX + s * 34, hy - 6, 14, 9, s * 0.3, 0, TAU);
    }, [255, 0, 0], 2);
  }
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.strokeStyle = 'rgb(60,200,0)';
  fx.lineCap = 'round';
  antlers(fx);
  fx.restore();
  fxFill(fx, () => head(fx), [0, 0, 200], 6);
  // pluie + herbes
  fg.save();
  fg.strokeStyle = alpha(pal.paper, 0.22);
  fg.lineWidth = 1;
  for (let i = 0; i < 120; i++) {
    const x0 = r() * BASE_W, y0 = WIN.y + r() * WIN.h, l = 14 + r() * 30;
    fg.beginPath();
    fg.moveTo(x0, y0);
    fg.lineTo(x0 - l * 0.25, y0 + l);
    fg.stroke();
  }
  fg.strokeStyle = pal.ink;
  fg.lineWidth = 2;
  for (let i = 0; i < 120; i++) {
    const x0 = r() * BASE_W, y0 = WIN.y + WIN.h + 4, l = 20 + r() * 60;
    fg.beginPath();
    fg.moveTo(x0, y0);
    fg.quadraticCurveTo(x0 + (r() - 0.5) * 20, y0 - l * 0.5, x0 + (r() - 0.5) * 30, y0 - l);
    fg.stroke();
  }
  fg.restore();
}

/** Sujets procéduraux. Le sujet `image` (illustration bitmap) est peint par art/imageSubject.ts. */
export const SUBJECTS: Record<Exclude<SubjectKind, 'image' | 'jvtitle'>, (t: PaintTarget) => void> = {
  monolith,
  moth,
  sigil,
  tower,
  serpent,
  bloom,
  eye,
  stag,
};

export function finishLayer(g: Ctx, seed: number, grain = 0.1) {
  applyGrain(g, BASE_W, BASE_H, grain, seed, 30);
}
