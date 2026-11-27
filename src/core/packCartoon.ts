import { alpha, applyGrain, makeCanvas, roundRect, type Ctx } from './art/canvas';
import { ensureFonts } from './art';
import { FONT_LABEL, FONT_PACK } from './fonts';
import { PACK, PH, PW } from './packCrease';
import { crimpBands, finishPackArt, fitFont, type PackArt } from './pack';

/**
 * (23/11, retours Tom — LABO) SACHETS PAR THÈME, VERSION CARTOON : un logo par thème (ballon, globe, manette, pop-corn,
 * télé, ourson Bébou) et la mention « Bébou Cartes » sur chaque sachet. Trois pistes à comparer dans le labo
 * (expérience 046) — rien n'est branché sur le jeu tant qu'une piste n'est pas choisie :
 *  - « sticker » : aplat de couleur à trame de points, le logo sur un autocollant blanc cerné de noir, le nom en
 *    lettres rondes cernées, « Bébou Cartes » dans une pastille noire en haut ;
 *  - « bd » : rayons de case de BD, le logo dans une explosion jaune, le nom sur une banderole penchée, « Bébou
 *    Cartes » dans un macaron incliné ;
 *  - « badge » : deux tons séparés par une vague, le logo dans un écusson rond dont l'anneau porte « BÉBOU CARTES »,
 *    des confettis.
 * Toiles 2D (comme generatePackArt) : face, dos, masques (R dorure · G soudures · B déchirure).
 */
export type CartoonDesign = 'sticker' | 'bd' | 'badge';
export type CartoonTheme = 'sport' | 'monde' | 'pop' | 'gaming' | 'tele' | 'bebou';

export const CARTOON_DESIGNS: ReadonlyArray<{ id: CartoonDesign; label: string }> = [
  { id: 'sticker', label: 'Autocollant' }, // i18n-ok (labo 046)
  { id: 'bd', label: 'Case de BD' }, // i18n-ok (labo 046)
  { id: 'badge', label: 'Écusson' }, // i18n-ok (labo 046)
];

interface ThemeLook {
  name: string;
  /** couleur du sachet (celles du jeu, + la Télé) */
  c: string;
  /** teinte sombre (ombres, second ton) */
  d: string;
  /** teinte claire (trame, reflets) */
  l: string;
}
// (27/11, V3) le jeu importe ce fichier pour les logos des sachets « Autocollant » ; ces noms ne servent qu'au labo 046
export const CARTOON_THEMES: Record<CartoonTheme, ThemeLook> = {
  sport: { name: 'Sport', c: '#3a9a66', d: '#1f6140', l: '#7fd3a2' }, // i18n-ok (labo)
  monde: { name: 'World', c: '#3c73c8', d: '#22468a', l: '#8fb7f0' }, // i18n-ok (labo)
  pop: { name: 'Popculture', c: '#e07a2e', d: '#9c4612', l: '#ffc08a' }, // i18n-ok (labo)
  gaming: { name: 'Gaming', c: '#6a4fc4', d: '#3d2b86', l: '#b4a2f5' }, // i18n-ok (labo)
  tele: { name: 'Télé', c: '#d6455a', d: '#8c1f31', l: '#ff9cab' }, // i18n-ok (labo)
  bebou: { name: 'Bebou', c: '#9ea2aa', d: '#5e626b', l: '#dfe2e8' }, // i18n-ok (labo)
};

const INK = '#141016';
const CREAM = '#fff8ea';
const YELLOW = '#ffd23f';

// ───────────────────────────────────────────── les logos (dessinés au trait, cernés de noir)

/** Trace le contour, remplit, cerne : le geste de base du dessin animé. */
function inked(g: Ctx, path: () => void, fill: string, lw: number) {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}

function poly(g: Ctx, cx: number, cy: number, r: number, n: number, rot: number) {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

/** Logo du thème centré en (cx, cy), tenant dans un carré de côté 2r. */
export function drawThemeLogo(g: Ctx, theme: CartoonTheme, cx: number, cy: number, r: number) {
  const lw = Math.max(4, r * 0.075);
  const look = CARTOON_THEMES[theme];
  g.save();
  switch (theme) {
    case 'sport': {
      // ballon : pentagone noir au centre, cinq demi-pentagones au bord, coutures
      inked(g, () => g.arc(cx, cy, r * 0.92, 0, Math.PI * 2), '#fff', lw);
      g.save();
      g.beginPath();
      g.arc(cx, cy, r * 0.92 - lw / 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = INK;
      g.beginPath();
      poly(g, cx, cy, r * 0.3, 5, -Math.PI / 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = lw * 0.55;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const x0 = cx + Math.cos(a) * r * 0.3, y0 = cy + Math.sin(a) * r * 0.3;
        const x1 = cx + Math.cos(a) * r * 0.62, y1 = cy + Math.sin(a) * r * 0.62;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.beginPath();
        poly(g, cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.98, r * 0.3, 5, a + Math.PI / 2);
        g.fill();
      }
      g.restore();
      // reflet
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.16, r * 0.08, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'monde': {
      // globe : océan, trois continents en patatoïdes, méridiens
      inked(g, () => g.arc(cx, cy, r * 0.92, 0, Math.PI * 2), '#4aa3ff', lw);
      g.save();
      g.beginPath();
      g.arc(cx, cy, r * 0.92 - lw / 2, 0, Math.PI * 2);
      g.clip();
      const blob = (x: number, y: number, s: number, k: number) => {
        g.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr = s * (1 + 0.28 * Math.sin(a * 3 + k) + 0.12 * Math.cos(a * 5 + k * 2));
          const px = x + Math.cos(a) * rr * 1.15, py = y + Math.sin(a) * rr * 0.85;
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.closePath();
        g.fillStyle = '#5fd27a';
        g.fill();
        g.lineWidth = lw * 0.6;
        g.strokeStyle = INK;
        g.stroke();
      };
      blob(cx - r * 0.38, cy - r * 0.3, r * 0.3, 1);
      blob(cx + r * 0.35, cy + r * 0.05, r * 0.34, 2.4);
      blob(cx - r * 0.25, cy + r * 0.55, r * 0.18, 4);
      g.strokeStyle = 'rgba(20,16,22,0.35)';
      g.lineWidth = lw * 0.4;
      for (const k of [-0.5, 0, 0.5]) {
        g.beginPath();
        g.ellipse(cx, cy, Math.abs(k) * r * 1.6 + r * 0.05, r * 0.92, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - r, cy);
      g.lineTo(cx + r, cy);
      g.stroke();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.ellipse(cx - r * 0.45, cy - r * 0.52, r * 0.15, r * 0.07, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'gaming': {
      // manette : corps arrondi à poignées, croix, quatre boutons de couleur
      const w = r * 0.95, h = r * 0.52;
      inked(g, () => {
        g.moveTo(cx - w * 0.6, cy - h);
        g.lineTo(cx + w * 0.6, cy - h);
        g.bezierCurveTo(cx + w * 1.05, cy - h, cx + w * 1.12, cy + h * 0.2, cx + w * 1.02, cy + h * 1.05);
        g.bezierCurveTo(cx + w * 0.95, cy + h * 1.7, cx + w * 0.55, cy + h * 1.75, cx + w * 0.42, cy + h * 0.95);
        g.lineTo(cx - w * 0.42, cy + h * 0.95);
        g.bezierCurveTo(cx - w * 0.55, cy + h * 1.75, cx - w * 0.95, cy + h * 1.7, cx - w * 1.02, cy + h * 1.05);
        g.bezierCurveTo(cx - w * 1.12, cy + h * 0.2, cx - w * 1.05, cy - h, cx - w * 0.6, cy - h);
        g.closePath();
      }, '#f4f1ff', lw);
      // croix
      const dx = cx - w * 0.55, dy = cy + h * 0.05, a = r * 0.11;
      inked(g, () => {
        g.rect(dx - a * 2.2, dy - a * 0.75, a * 4.4, a * 1.5);
        g.rect(dx - a * 0.75, dy - a * 2.2, a * 1.5, a * 4.4);
      }, INK, lw * 0.3);
      // boutons
      const bx = cx + w * 0.55, by = cy + h * 0.05, bs = r * 0.1;
      ([[0, -1, '#ffd23f'], [1, 0, '#ff5d73'], [0, 1, '#3ddc84'], [-1, 0, '#4aa3ff']] as const).forEach(([ix, iy, col]) =>
        inked(g, () => g.arc(bx + ix * bs * 1.8, by + iy * bs * 1.8, bs, 0, Math.PI * 2), col, lw * 0.5),
      );
      break;
    }
    case 'pop': {
      // pot de pop-corn : seau rayé rouge et blanc, grains qui débordent
      const top = cy - r * 0.05, bot = cy + r * 0.92, wt = r * 0.72, wb = r * 0.5;
      const puff = (x: number, y: number, s: number) => inked(g, () => {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          g.moveTo(x + Math.cos(a) * s * 0.55 + s * 0.45, y + Math.sin(a) * s * 0.55);
          g.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.45, 0, Math.PI * 2);
        }
      }, '#fff6d0', lw * 0.5);
      [[-0.5, -0.12, 0.26], [0, -0.3, 0.3], [0.5, -0.12, 0.26], [-0.25, -0.5, 0.22], [0.28, -0.52, 0.22], [0, -0.72, 0.2]].forEach(([x, y, s]) => puff(cx + x * r, top + y * r, s * r));
      g.save();
      g.beginPath();
      g.moveTo(cx - wt, top);
      g.lineTo(cx + wt, top);
      g.lineTo(cx + wb, bot);
      g.lineTo(cx - wb, bot);
      g.closePath();
      g.fillStyle = '#fff';
      g.fill();
      g.clip();
      g.fillStyle = '#e8343f';
      for (let i = -3; i <= 3; i += 2) {
        g.beginPath();
        g.moveTo(cx + (i / 7) * wt * 2, top);
        g.lineTo(cx + ((i + 1) / 7) * wt * 2, top);
        g.lineTo(cx + ((i + 1) / 7) * wb * 2, bot);
        g.lineTo(cx + (i / 7) * wb * 2, bot);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.beginPath();
      g.moveTo(cx - wt, top);
      g.lineTo(cx + wt, top);
      g.lineTo(cx + wb, bot);
      g.lineTo(cx - wb, bot);
      g.closePath();
      g.lineWidth = lw;
      g.strokeStyle = INK;
      g.lineJoin = 'round';
      g.stroke();
      // bandeau « POP »
      inked(g, () => roundRect(g, cx - wt * 0.62, top + r * 0.26, wt * 1.24, r * 0.34, r * 0.08), YELLOW, lw * 0.6);
      g.fillStyle = INK;
      g.font = `400 ${Math.round(r * 0.27)}px ${FONT_PACK}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('POP', cx, top + r * 0.44);
      break;
    }
    case 'tele': {
      // télé rétro : antennes, caisse arrondie, écran bombé, deux boutons
      g.lineWidth = lw * 0.7;
      g.strokeStyle = INK;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy - r * 0.45);
      g.lineTo(cx - r * 0.42, cy - r * 0.95);
      g.moveTo(cx, cy - r * 0.45);
      g.lineTo(cx + r * 0.36, cy - r * 0.92);
      g.stroke();
      inked(g, () => g.arc(cx - r * 0.42, cy - r * 0.95, r * 0.07, 0, Math.PI * 2), YELLOW, lw * 0.5);
      inked(g, () => g.arc(cx + r * 0.36, cy - r * 0.92, r * 0.07, 0, Math.PI * 2), YELLOW, lw * 0.5);
      inked(g, () => roundRect(g, cx - r * 0.95, cy - r * 0.5, r * 1.9, r * 1.32, r * 0.22), '#f6c36a', lw);
      inked(g, () => roundRect(g, cx - r * 0.8, cy - r * 0.36, r * 1.15, r * 1.04, r * 0.2), '#6fe3ff', lw * 0.7);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.ellipse(cx - r * 0.5, cy - r * 0.15, r * 0.14, r * 0.06, -0.5, 0, Math.PI * 2);
      g.fill();
      inked(g, () => g.arc(cx + r * 0.66, cy - r * 0.12, r * 0.11, 0, Math.PI * 2), look.c, lw * 0.5);
      inked(g, () => g.arc(cx + r * 0.66, cy + r * 0.24, r * 0.11, 0, Math.PI * 2), look.d, lw * 0.5);
      g.lineWidth = lw * 0.7;
      g.beginPath();
      g.moveTo(cx - r * 0.6, cy + r * 0.82);
      g.lineTo(cx - r * 0.72, cy + r * 0.98);
      g.moveTo(cx + r * 0.6, cy + r * 0.82);
      g.lineTo(cx + r * 0.72, cy + r * 0.98);
      g.stroke();
      break;
    }
    case 'bebou': {
      // l'ourson Bébou : tête ronde, oreilles, museau, joues roses
      inked(g, () => g.arc(cx - r * 0.62, cy - r * 0.55, r * 0.3, 0, Math.PI * 2), '#c99a6b', lw);
      inked(g, () => g.arc(cx + r * 0.62, cy - r * 0.55, r * 0.3, 0, Math.PI * 2), '#c99a6b', lw);
      g.fillStyle = '#f2b8a0';
      g.beginPath();
      g.arc(cx - r * 0.62, cy - r * 0.55, r * 0.14, 0, Math.PI * 2);
      g.arc(cx + r * 0.62, cy - r * 0.55, r * 0.14, 0, Math.PI * 2);
      g.fill();
      inked(g, () => g.ellipse(cx, cy + r * 0.06, r * 0.86, r * 0.78, 0, 0, Math.PI * 2), '#d8aa78', lw);
      inked(g, () => g.ellipse(cx, cy + r * 0.32, r * 0.36, r * 0.27, 0, 0, Math.PI * 2), '#f6e2c6', lw * 0.6);
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(cx, cy + r * 0.22, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
      g.fill();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + s * r * 0.33, cy - r * 0.08, r * 0.075, r * 0.1, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(cx + s * r * 0.33 - r * 0.02, cy - r * 0.12, r * 0.025, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,120,140,0.55)';
        g.beginPath();
        g.ellipse(cx + s * r * 0.55, cy + r * 0.2, r * 0.11, r * 0.07, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = INK;
      }
      g.lineWidth = lw * 0.45;
      g.strokeStyle = INK;
      g.beginPath();
      g.moveTo(cx, cy + r * 0.3);
      g.quadraticCurveTo(cx - r * 0.05, cy + r * 0.42, cx - r * 0.12, cy + r * 0.4);
      g.moveTo(cx, cy + r * 0.3);
      g.quadraticCurveTo(cx + r * 0.05, cy + r * 0.42, cx + r * 0.12, cy + r * 0.4);
      g.stroke();
      break;
    }
  }
  g.restore();
}

// ───────────────────────────────────────────── lettrage cartoon

/** Texte rond, rempli, cerné de noir épais, avec une ombre portée décalée (le titre de dessin animé). */
function cartoonText(g: Ctx, text: string, x: number, y: number, size: number, maxW: number, fill: string, o: { rot?: number; stroke?: number; shadow?: number } = {}) {
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  g.font = fitFont(g, text, 400, size, maxW, FONT_PACK);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const sw = o.stroke ?? size * 0.16;
  const sh = o.shadow ?? size * 0.08;
  g.lineWidth = sw;
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.strokeText(text, sh, sh);
  g.fillText(text, sh, sh);
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

/** « BÉBOU CARTES » dans une pastille noire (la mention de marque, sur tous les sachets). */
function brandPill(g: Ctx, x: number, y: number, w: number, rot = 0, onGold = false) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const h = w * 0.2;
  roundRect(g, -w / 2, -h / 2, w, h, h / 2);
  g.fillStyle = onGold ? YELLOW : INK;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = onGold ? INK : CREAM;
  g.stroke();
  g.fillStyle = onGold ? INK : CREAM;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = fitFont(g, 'BÉBOU CARTES', 400, h * 0.62, w * 0.86, FONT_PACK); // i18n-ok (marque)
  g.fillText('BÉBOU CARTES', 0, h * 0.04); // i18n-ok (marque)
  g.restore();
}

function halftone(g: Ctx, col: string, step: number, from: number, to: number) {
  g.fillStyle = col;
  for (let y = 0; y < PH; y += step)
    for (let x = (y / step) % 2 ? step / 2 : 0; x < PW; x += step) {
      const k = from + (to - from) * (y / PH);
      g.beginPath();
      g.arc(x, y, Math.max(0.5, step * 0.5 * k), 0, Math.PI * 2);
      g.fill();
    }
}

function starburst(g: Ctx, cx: number, cy: number, r0: number, r1: number, n: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1 * (0.92 + 0.08 * Math.sin(i * 2.3));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

// ───────────────────────────────────────────── les trois pistes

const CH = (PACK.crimp / PACK.h) * PH;
const TEAR_Y = PH - CH - 40; // (même ligne que generatePackArt, comptée depuis le bas)

function drawFront(g: Ctx, design: CartoonDesign, theme: CartoonTheme, foil: (fn: (m: Ctx) => void) => void) {
  const t = CARTOON_THEMES[theme];
  const cx = PW / 2;
  const name = t.name.toUpperCase();
  if (design === 'sticker') {
    g.fillStyle = t.c;
    g.fillRect(0, 0, PW, PH);
    halftone(g, alpha(t.l, 0.35), 22, 0.15, 0.7);
    // autocollant : plaque blanche découpée, ombre décalée
    const r = 190, cy = PH * 0.43;
    g.fillStyle = alpha(INK, 0.9);
    g.beginPath();
    g.arc(cx + 14, cy + 16, r, 0, Math.PI * 2);
    g.fill();
    inked(g, () => g.arc(cx, cy, r, 0, Math.PI * 2), CREAM, 9);
    drawThemeLogo(g, theme, cx, cy, r * 0.72);
    brandPill(g, cx, CH + 100, 360);
    foil((m) => {
      m.beginPath();
      roundRect(m, cx - 180, CH + 100 - 36, 360, 72, 36);
      m.fill();
    });
    cartoonText(g, name, cx, PH * 0.75, 104, PW - 90, YELLOW);
    g.fillStyle = alpha(INK, 0.75);
    g.font = `600 26px ${FONT_LABEL}`;
    g.textAlign = 'center';
    g.fillText('5 CARTES', cx, PH * 0.865); // i18n-ok (maquette du labo)
  } else if (design === 'bd') {
    // rayons de case de BD, deux tons
    g.fillStyle = t.d;
    g.fillRect(0, 0, PW, PH);
    const cy = PH * 0.42;
    g.fillStyle = t.c;
    for (let i = 0; i < 24; i += 2) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0) * 1400, cy + Math.sin(a0) * 1400);
      g.lineTo(cx + Math.cos(a1) * 1400, cy + Math.sin(a1) * 1400);
      g.closePath();
      g.fill();
    }
    // explosion jaune
    g.fillStyle = INK;
    starburst(g, cx + 12, cy + 14, 165, 255, 14, 0.1);
    g.fill();
    starburst(g, cx, cy, 165, 255, 14, 0.1);
    g.fillStyle = YELLOW;
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.lineJoin = 'round';
    g.stroke();
    drawThemeLogo(g, theme, cx, cy, 145);
    // banderole penchée
    g.save();
    g.translate(cx, PH * 0.75);
    g.rotate(-0.07);
    const bw = PW * 0.9, bh = 118;
    g.fillStyle = INK;
    g.fillRect(-bw / 2 + 10, -bh / 2 + 12, bw, bh);
    inked(g, () => g.rect(-bw / 2, -bh / 2, bw, bh), CREAM, 8);
    g.restore();
    cartoonText(g, name, cx, PH * 0.75, 92, PW * 0.78, t.c, { rot: -0.07 });
    // macaron « Bébou Cartes » en haut à gauche
    brandPill(g, cx, CH + 100, 330, -0.06, true);
    foil((m) => {
      m.save();
      m.translate(cx, CH + 100);
      m.rotate(-0.06);
      m.beginPath();
      roundRect(m, -165, -33, 330, 66, 33);
      m.fill();
      m.restore();
      m.beginPath();
      starburst(m, cx, cy, 165, 255, 14, 0.1);
      m.lineWidth = 8;
      m.stroke();
    });
  } else {
    // écusson : deux tons, vague au milieu, confettis
    g.fillStyle = t.c;
    g.fillRect(0, 0, PW, PH);
    g.fillStyle = t.d;
    g.beginPath();
    g.moveTo(0, PH * 0.62);
    for (let x = 0; x <= PW; x += 8) g.lineTo(x, PH * 0.62 + Math.sin((x / PW) * Math.PI * 3) * 22);
    g.lineTo(PW, PH);
    g.lineTo(0, PH);
    g.closePath();
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = INK;
    g.beginPath();
    for (let x = 0; x <= PW; x += 8) (x ? g.lineTo : g.moveTo).call(g, x, PH * 0.62 + Math.sin((x / PW) * Math.PI * 3) * 22);
    g.stroke();
    // confettis
    const rnd = (k: number) => {
      const v = Math.sin(k * 127.1 + theme.length * 31.7) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < 34; i++) {
      const x = rnd(i) * PW, y = CH + 20 + rnd(i + 50) * (PH - 2 * CH - 40);
      if (Math.hypot(x - cx, y - PH * 0.4) < 245) continue;
      g.save();
      g.translate(x, y);
      g.rotate(rnd(i + 9) * 6);
      g.fillStyle = [YELLOW, CREAM, t.l, '#ff5d73'][i % 4];
      g.strokeStyle = INK;
      g.lineWidth = 3;
      if (i % 3) {
        g.beginPath();
        g.rect(-9, -4, 18, 8);
      } else {
        g.beginPath();
        g.arc(0, 0, 6, 0, Math.PI * 2);
      }
      g.fill();
      g.stroke();
      g.restore();
    }
    // l'écusson : anneau qui porte la marque, disque du logo
    const cy = PH * 0.4, R = 230;
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx + 12, cy + 14, R, 0, Math.PI * 2);
    g.fill();
    inked(g, () => g.arc(cx, cy, R, 0, Math.PI * 2), YELLOW, 9);
    inked(g, () => g.arc(cx, cy, R * 0.72, 0, Math.PI * 2), CREAM, 7);
    g.save();
    g.fillStyle = INK;
    g.font = `400 40px ${FONT_PACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ring = `BÉBOU CARTES ★ ${name} ★ `; // i18n-ok (marque)
    const chars = [...ring];
    const span = Math.PI * 2;
    chars.forEach((ch, i) => {
      const a = -Math.PI / 2 + (i / chars.length) * span;
      g.save();
      g.translate(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
      g.rotate(a + Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
    });
    g.restore();
    drawThemeLogo(g, theme, cx, cy, R * 0.56);
    cartoonText(g, name, cx, PH * 0.77, 100, PW - 100, CREAM);
    foil((m) => {
      m.lineWidth = R * 0.28;
      m.beginPath();
      m.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
      m.stroke();
    });
  }
  // ligne de déchirure (pointillés) + soudures
  g.setLineDash([12, 9]);
  g.strokeStyle = alpha(INK, 0.55);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(24, PH - TEAR_Y);
  g.lineTo(PW - 24, PH - TEAR_Y);
  g.stroke();
  g.setLineDash([]);
  crimpBands(g, design === 'bd' ? YELLOW : t.d);
  applyGrain(g, PW, PH, 0.05, 9, 30);
}

function drawBack(g: Ctx, theme: CartoonTheme) {
  const t = CARTOON_THEMES[theme];
  g.fillStyle = t.c;
  g.fillRect(0, 0, PW, PH);
  // papier peint de petits logos
  for (let y = CH + 40, row = 0; y < PH - CH; y += 120, row++)
    for (let x = row % 2 ? 60 : 0; x < PW + 60; x += 120) {
      g.globalAlpha = 0.22;
      drawThemeLogo(g, theme, x, y, 34);
      g.globalAlpha = 1;
    }
  brandPill(g, PW / 2, PH * 0.5, 380);
  g.fillStyle = CREAM;
  g.textAlign = 'center';
  g.font = `600 24px ${FONT_LABEL}`;
  ['5 cartes à collectionner', 'Club privé — ne se vend pas'].forEach((l, i) => g.fillText(l, PW / 2, PH * 0.6 + i * 34)); // i18n-ok (maquette du labo)
  crimpBands(g, t.d);
  applyGrain(g, PW, PH, 0.05, 10, 30);
}

/** Le visuel complet d'un sachet cartoon (face, dos, masques) pour le maillage du booster (createPackMesh). */
export async function cartoonPackArt(design: CartoonDesign, theme: CartoonTheme): Promise<PackArt> {
  await ensureFonts();
  try {
    await document.fonts.load(`400 80px ${FONT_PACK}`);
  } catch {
    /* police indisponible : repli */
  }
  const F = makeCanvas(PW, PH), B = makeCanvas(PW, PH), M = makeCanvas(PW, PH);
  const m = M.g;
  m.fillStyle = '#000';
  m.fillRect(0, 0, PW, PH);
  const foilOps: Array<(m: Ctx) => void> = [];
  drawFront(F.g, design, theme, (fn) => foilOps.push(fn));
  drawBack(B.g, theme);
  // masques : R = dorure (soudures + marque), G = relief des soudures, B = ligne de déchirure
  m.globalCompositeOperation = 'lighter';
  m.fillStyle = 'rgb(255,0,0)';
  m.strokeStyle = 'rgb(255,0,0)';
  m.fillRect(0, 0, PW, CH);
  m.fillRect(0, PH - CH, PW, CH);
  for (const op of foilOps) {
    m.save();
    m.fillStyle = 'rgb(255,0,0)';
    m.strokeStyle = 'rgb(255,0,0)';
    op(m);
    m.restore();
  }
  m.fillStyle = 'rgb(0,255,0)';
  for (const y0 of [0, PH - CH]) for (let x = 0; x < PW; x += 6) m.fillRect(x, y0, 3, CH);
  m.fillStyle = 'rgb(0,0,255)';
  m.fillRect(0, PH - TEAR_Y - 2, PW, 4);
  const art = finishPackArt(F.c, B.c, M.c);
  return { ...art, thumbFront: F.c };
}

/** Juste la face (2D), pour la planche de comparaison du labo. */
export async function cartoonPackFront(design: CartoonDesign, theme: CartoonTheme): Promise<HTMLCanvasElement> {
  await ensureFonts();
  try {
    await document.fonts.load(`400 80px ${FONT_PACK}`);
  } catch {
    /* police indisponible : repli */
  }
  const F = makeCanvas(PW, PH);
  drawFront(F.g, design, theme, () => {});
  return F.c;
}
