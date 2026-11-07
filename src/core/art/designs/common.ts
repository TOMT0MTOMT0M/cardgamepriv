import type { CardData } from '../../cardData';
import type { Rarity } from '../../rarity';
import type { Universe, UniverseId } from '../../universes';
import { rng } from '../../ease';
import { type Ctx, alpha, grainTile, linear, mix } from '../canvas';
import { BASE_H, BASE_W } from '../subjects';
import { FONT_LABEL, FONT_TEXT } from '../../fonts';

export const W = BASE_W;
export const H = BASE_H;
export const TAU = Math.PI * 2;
// (retours 05/11) polices du jeu : src/core/fonts.ts (Bold Frame ; Matcha World pour les gros titres de l'interface)
export const FONT_TITLE = FONT_TEXT;
export const FONT_MONO = FONT_LABEL;
export const FONT_SANS = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';

export interface DesignCtx {
  card: CardData;
  rar: Rarity;
  uni: Universe;
  tier: number;
  /** nombre d'étoiles = tier + 1 (1 ★ commune … 6 ★ mythique) */
  stars: number;
  /** sous-famille (« JOHTO », « MARIO ») imprimée en bas à la place du numéro ; absente : le numéro (retours 05/11) */
  sub?: string;
  /** Album / Chanson : l'artiste (« Andrea Bocelli »), imprimé sur sa propre ligne juste sous le titre (07/11) */
  byline?: string;
  /** largeur / hauteur de l'illustration (gabarit Paysage : position de la bande de la photo) */
  artAspect?: number;
  /**
   * Vignette des grilles (audit 06/11) : à 114 px CSS, rien sous le nom n'est lisible → seuls le nom, les étoiles et le
   * numéro sont peints ; famille, sous-famille, artiste et code de set sont laissés au DOM de la tuile.
   */
  mini?: boolean;
}

/** Texte espacé qui rétrécit (police ≤ size) pour tenir dans maxW. `font` contient « {s} ». */
export function spacedFit(g: Ctx, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' | 'right', font: string, size: number, maxW: number, min = 22) {
  let s = size;
  const width = () => [...text].reduce((a, c) => a + g.measureText(c).width + spacing, -spacing);
  g.font = font.replace('{s}', String(s));
  while (s > min && width() > maxW) {
    s -= 1;
    g.font = font.replace('{s}', String(s));
  }
  return spaced(g, text, x, y, spacing, align);
}

/**
 * Un design de carte : comment l'illustration est cadrée et ce qui est peint par-dessus.
 * Contrat des masques (opaques, composite 'lighter') : R = foil, G = relief,
 * B = index d'étoile ((k+1)·32/255) → les étoiles peuvent s'allumer une par une.
 */
export interface CardDesign {
  id: string;
  title: string;
  /** l'illustration (composée pour la fenêtre historique) est agrandie de `k` et son point `from` posé sur `to` */
  art: { k: number; from?: [number, number]; to: [number, number] };
  paint(f: Ctx, m: Ctx, d: DesignCtx): void;
}

/** Couleur des étoiles par tier (pierre, vert-de-gris, cobalt, grenat, or, nacre). */
export const STAR_COLORS = ['#9a9387', '#7fae84', '#5b8bd6', '#c43b58', '#e2a93b', '#f1ece2'];

/** (retours live 04) arc-en-ciel des 6★ : les mêmes teintes que la bordure des tuiles (style.css) */
export const RAINBOW = ['#ff6b9a', '#ffd36b', '#6bffb8', '#6bc8ff', '#c86bff'];
/** Dégradé arc-en-ciel qui traverse toute la rangée d'étoiles (chaque étoile a sa part du spectre). */
export function rainbowFill(f: Ctx, pts: Array<[number, number]>, r: number) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - r, x1 = Math.max(...xs) + r;
  const y0 = Math.min(...ys) - r, y1 = Math.max(...ys) + r;
  const g = x1 - x0 >= y1 - y0 ? f.createLinearGradient(x0, 0, x1, 0) : f.createLinearGradient(0, y0, 0, y1);
  RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
  return g;
}

export function starColor(tier: number) {
  return STAR_COLORS[Math.max(0, Math.min(5, tier))];
}

// ───────────────────────────────────────────── texte

export function spaced(g: Ctx, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' | 'right' = 'left') {
  const chars = [...text];
  const total = chars.reduce((a, c) => a + g.measureText(c).width + spacing, -spacing);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  const prev = g.textAlign;
  g.textAlign = 'left';
  for (const c of chars) {
    g.fillText(c, cx, y);
    cx += g.measureText(c).width + spacing;
  }
  g.textAlign = prev;
  return total;
}

/** Choisit la taille de police (≤ size) pour que le texte tienne dans maxW. `font` contient « {s} ». */
export function fitFont(g: Ctx, text: string, font: string, size: number, maxW: number, min = 26) {
  let s = size;
  g.font = font.replace('{s}', String(s));
  while (s > min && g.measureText(text).width > maxW) {
    s -= 1;
    g.font = font.replace('{s}', String(s));
  }
  return s;
}

/** Texte le long d'un arc (centre cx,cy). `bottom` : lu de gauche à droite sous le centre. */
export function arcText(g: Ctx, text: string, cx: number, cy: number, r: number, mid: number, spacing: number, bottom = false) {
  const chars = [...text];
  const widths = chars.map((c) => g.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, -spacing);
  let a = mid + (bottom ? 1 : -1) * (total / r) / 2;
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((c, i) => {
    const w = widths[i];
    const aa = a + (bottom ? -1 : 1) * (w - spacing) / 2 / r;
    g.save();
    g.translate(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r);
    g.rotate(aa + (bottom ? -Math.PI / 2 : Math.PI / 2));
    g.fillText(c, 0, 0);
    g.restore();
    a += (bottom ? -1 : 1) * w / r;
  });
  g.restore();
}

// ───────────────────────────────────────────── surfaces

/** Papier : léger dégradé + marbrure floutée. */
export function paper(f: Ctx, base: string, seed: number, k = 1) {
  f.fillStyle = linear(f, 0, 0, W, H, [[0, mix(base, '#fff', 0.1)], [1, mix(base, '#000', 0.07)]]);
  f.fillRect(0, 0, W, H);
  const r = rng(seed * 7 + 3);
  f.save();
  f.filter = 'blur(18px)';
  f.globalAlpha = 0.035 * k;
  for (let i = 0; i < 26; i++) {
    f.fillStyle = i % 2 ? '#000' : '#fff';
    f.beginPath();
    f.ellipse(r() * W, r() * H, 50 + r() * 140, 20 + r() * 50, r() * 3, 0, TAU);
    f.fill();
  }
  f.restore();
}

/** Grain + poussières, seulement sur ce qui est déjà peint (jamais sur l'illustration). */
export function grainAtop(f: Ctx, seed: number, amount = 0.09, dust = 60) {
  f.save();
  f.globalCompositeOperation = 'source-atop';
  f.globalAlpha = amount;
  const p = f.createPattern(grainTile(), 'repeat');
  if (p) {
    f.fillStyle = p;
    f.fillRect(0, 0, W, H);
  }
  f.globalAlpha = 1;
  const r = rng(seed * 31 + 7);
  for (let i = 0; i < dust; i++) {
    f.fillStyle = r() > 0.5 ? 'rgba(255,250,240,0.3)' : 'rgba(20,15,10,0.25)';
    f.beginPath();
    f.arc(r() * W, r() * H, 0.5 + r() * 1.3, 0, TAU);
    f.fill();
  }
  f.restore();
}

/** Découpe la fenêtre d'illustration (alpha 0). */
export function cut(f: Ctx, path: (g: Ctx) => void) {
  f.save();
  f.globalCompositeOperation = 'destination-out';
  f.beginPath();
  path(f);
  f.fill();
  f.restore();
}

export function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  g.roundRect(x, y, w, h, r);
}

// ───────────────────────────────────────────── étoiles de rareté

export type StarShape = 'star' | 'square' | 'sparkle' | 'dot';

function shapePath(g: Ctx, shape: StarShape, x: number, y: number, r: number) {
  g.beginPath();
  if (shape === 'square') {
    g.rect(x - r, y - r, 2 * r, 2 * r);
    return;
  }
  if (shape === 'dot') {
    g.arc(x, y, r, 0, TAU);
    return;
  }
  const pts = shape === 'sparkle' ? 4 : 5;
  const inner = shape === 'sparkle' ? 0.28 : 0.46;
  for (let i = 0; i <= pts * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / pts;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export interface StarStyle {
  r: number;
  shape?: StarShape;
  fill?: string;
  stroke?: string | null;
  lineWidth?: number;
  /** foil sur les étoiles à partir de ce tier (défaut 2) */
  foilFrom?: number;
  glow?: boolean;
}

/** Étoiles à des positions données. Peint la couleur, le foil, le relief et l'index d'allumage. */
export function starsAt(f: Ctx, m: Ctx, d: DesignCtx, pts: Array<[number, number]>, st: StarStyle) {
  const shape = st.shape ?? 'star';
  // (retours live 04) 6★ : étoiles ARC-EN-CIEL, comme le contour de la carte (code rareté), sur tous les gabarits
  const col = d.rar.id === 'mythic' && pts.length ? rainbowFill(f, pts, st.r) : (st.fill ?? starColor(d.tier));
  pts.forEach(([x, y], k) => {
    // (retours live 6, C6) plus de halo lumineux autour des étoiles (`glow` ignoré)
    f.fillStyle = col;
    shapePath(f, shape, x, y, st.r);
    f.fill();
    if (st.stroke) {
      f.strokeStyle = st.stroke;
      f.lineWidth = st.lineWidth ?? 1.4;
      f.stroke();
    }
    // masques (le canvas des masques est en 'lighter')
    if (d.tier >= (st.foilFrom ?? 2)) {
      m.fillStyle = 'rgb(255,0,0)';
      shapePath(m, shape, x, y, st.r + 1);
      m.fill();
    }
    m.fillStyle = 'rgb(0,200,0)';
    shapePath(m, shape, x, y, st.r * 0.9);
    m.fill();
    m.fillStyle = `rgb(0,0,${(k + 1) * 32})`;
    shapePath(m, shape, x, y, st.r + 1.5);
    m.fill();
  });
}

/**
 * (07/11) Étoiles en ALUMINIUM BROSSÉ (6★ du gabarit Suisse, à la place du foil irisé) : la même plaque que le dos de la
 * carte (teinte #c3c6cc, stries verticales, chanfrein clair) découpée à la forme, avec une ombre d'enfoncement (la pièce
 * est sertie dans le papier). Masques : relief (G) seulement — pas de foil (R), le métal se suffit.
 */
export function brushedStars(f: Ctx, m: Ctx, pts: Array<[number, number]>, r: number, shape: StarShape = 'square', seed = 3) {
  const rr = rng(seed);
  pts.forEach(([x, y]) => {
    // sertissage : arête claire en bas-droite, puis contour sombre (la pièce est enfoncée dans le papier)
    f.save();
    f.fillStyle = alpha('#fff', 0.7);
    shapePath(f, shape, x + 1.2, y + 1.2, r + 1);
    f.fill();
    f.fillStyle = alpha('#000', 0.6);
    shapePath(f, shape, x, y, r + 1);
    f.fill();
    f.restore();
    f.save();
    shapePath(f, shape, x, y, r);
    f.clip();
    // alliage plus sombre que le dos (sur un papier clair, l'aluminium doit se lire comme du métal, pas comme du blanc)
    f.fillStyle = linear(f, x - r, y - r, x + r, y + r, [[0, '#c0c4cb'], [0.4, '#989ca3'], [0.55, '#afb3ba'], [1, '#7a7e86']]);
    f.fillRect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4);
    // brossage vertical : stries nettes, contrastées
    for (let i = x - r - 2; i <= x + r + 2; i += 1) {
      const v = rr();
      f.fillStyle = v > 0.5 ? alpha('#fff', (v - 0.5) * 0.45) : alpha('#000', (0.5 - v) * 0.4);
      f.fillRect(i, y - r - 2, 1, 2 * r + 4);
    }
    f.restore();
    // relief (G) seulement : ni foil (R), ni allumage (B — c'est lui qui faisait « la lueur » blanche sur les étoiles)
    m.fillStyle = 'rgb(0,200,0)';
    shapePath(m, shape, x, y, r * 0.9);
    m.fill();
  });
}

/** Rangée d'étoiles (horizontale ou verticale). */
export function starRow(f: Ctx, m: Ctx, d: DesignCtx, x: number, y: number, gap: number, align: 'left' | 'center' | 'right', st: StarStyle, vertical = false) {
  const n = d.stars;
  const span = (n - 1) * gap;
  const start = align === 'left' ? 0 : align === 'center' ? -span / 2 : -span;
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) pts.push(vertical ? [x, y + start + k * gap] : [x + start + k * gap, y]);
  starsAt(f, m, d, pts, st);
}

// ───────────────────────────────────────────── emblèmes d'univers

/** Emblème de l'univers (trait), centré, taille `s` (≈ diamètre). */
export function glyph(g: Ctx, id: UniverseId, x: number, y: number, s: number, color: string, lw = 2) {
  g.save();
  g.translate(x, y);
  g.scale(s / 40, s / 40);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = (lw * 40) / s;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  switch (id) {
    case 'cendre': // flamme
      g.moveTo(0, 18);
      g.bezierCurveTo(-16, 16, -16, 0, -6, -8);
      g.bezierCurveTo(-4, -2, -2, 0, 0, 2);
      g.bezierCurveTo(-2, -8, 2, -14, 4, -19);
      g.bezierCurveTo(16, -6, 18, 14, 0, 18);
      g.stroke();
      g.beginPath();
      g.arc(1, 9, 4, 0, TAU);
      g.fill();
      break;
    case 'marees': // trois vagues
      for (let i = -1; i <= 1; i++) {
        const yy = i * 10;
        g.moveTo(-18, yy);
        g.bezierCurveTo(-12, yy - 7, -6, yy - 7, 0, yy);
        g.bezierCurveTo(6, yy + 7, 12, yy + 7, 18, yy);
      }
      g.stroke();
      break;
    case 'lune': // croissant
      g.arc(0, 0, 17, 0.25 * Math.PI, 1.75 * Math.PI, false);
      g.arc(7, 0, 13, 1.62 * Math.PI, 0.38 * Math.PI, true);
      g.closePath();
      g.fill();
      break;
    case 'monts': // deux sommets
      g.moveTo(-19, 14);
      g.lineTo(-6, -10);
      g.lineTo(1, 2);
      g.lineTo(8, -16);
      g.lineTo(19, 14);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.moveTo(4, -8);
      g.lineTo(8, -16);
      g.lineTo(12, -8);
      g.stroke();
      break;
    case 'ronces': // tige à épines + feuille
      g.moveTo(0, 19);
      g.bezierCurveTo(-4, 6, 4, -6, 0, -19);
      for (const [yy, sd] of [[10, -1], [0, 1], [-10, -1]] as const) {
        g.moveTo(sd * 1.5, yy);
        g.lineTo(sd * 8, yy - 4);
      }
      g.stroke();
      g.beginPath();
      g.ellipse(7, -12, 7, 3.5, -0.6, 0, TAU);
      g.fill();
      break;
    case 'abime': // puits : cercles concentriques
      g.arc(0, 0, 18, 0, TAU);
      g.moveTo(11, 0);
      g.arc(0, 0, 11, 0, TAU);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 4, 0, TAU);
      g.fill();
      break;
    case 'pokemon': // éclat à quatre branches + point (emblème neutre, pas de logo)
      g.moveTo(0, -19);
      g.quadraticCurveTo(2.5, -2.5, 19, 0);
      g.quadraticCurveTo(2.5, 2.5, 0, 19);
      g.quadraticCurveTo(-2.5, 2.5, -19, 0);
      g.quadraticCurveTo(-2.5, -2.5, 0, -19);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(11, -11, 3, 0, TAU);
      g.fill();
      break;
    case 'valorant': // viseur (emblème neutre, pas de logo)
      g.arc(0, 0, 13, 0, TAU);
      g.moveTo(0, -19);
      g.lineTo(0, -7);
      g.moveTo(0, 7);
      g.lineTo(0, 19);
      g.moveTo(-19, 0);
      g.lineTo(-7, 0);
      g.moveTo(7, 0);
      g.lineTo(19, 0);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 2.6, 0, TAU);
      g.fill();
      break;
    case 'bebous': // étoile à huit branches dans un anneau : une branche par membre du groupe
      g.arc(0, 0, 19, 0, TAU);
      g.stroke();
      g.beginPath();
      eightStar(g, 0, 0, 14, 5.2);
      g.fill();
      break;
    case 'lol': // hexagone « hextech » + losange (emblème neutre, pas de logo)
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU;
        if (i) g.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
        else g.moveTo(Math.cos(a) * 19, Math.sin(a) * 19);
      }
      g.closePath();
      g.stroke();
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(7, 0);
      g.lineTo(0, 10);
      g.lineTo(-7, 0);
      g.closePath();
      g.fill();
      break;
    case 'cs': // deux lames croisées (emblème neutre, pas de logo)
      g.moveTo(-15, 15);
      g.lineTo(13, -13);
      g.moveTo(15, 15);
      g.lineTo(-13, -13);
      g.moveTo(-14, 6);
      g.lineTo(-6, 14);
      g.moveTo(14, 6);
      g.lineTo(6, 14);
      g.stroke();
      break;
    case 'monde': // globe terrestre (méridiens + équateur)
      g.arc(0, 0, 18, 0, TAU);
      g.moveTo(-18, 0);
      g.lineTo(18, 0);
      g.moveTo(0, -18);
      g.ellipse(0, 0, 9, 18, 0, 0, TAU);
      g.stroke();
      break;
    case 'jv': // manette (croix directionnelle + deux boutons)
      g.roundRect(-19, -10, 38, 21, 10);
      g.stroke();
      g.beginPath();
      g.moveTo(-11, 0);
      g.lineTo(-3, 0);
      g.moveTo(-7, -4);
      g.lineTo(-7, 4);
      g.stroke();
      g.beginPath();
      g.arc(7, -2, 2.4, 0, TAU);
      g.moveTo(14.4, 3);
      g.arc(12, 3, 2.4, 0, TAU);
      g.fill();
      break;
    default:
      g.arc(0, 0, 16, 0, TAU);
      g.stroke();
      break;
  }
  g.restore();
}

export const num3 = (n: number) => String(n).padStart(3, '0');

/** Tracé (sans beginPath) d'une étoile à 8 branches : rayon extérieur `r`, intérieur `ri`. */
export function eightStar(g: Ctx, x: number, y: number, r: number, ri: number) {
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 8;
    const rr = i % 2 ? ri : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
