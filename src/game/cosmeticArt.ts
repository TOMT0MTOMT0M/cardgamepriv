/**
 * DESSIN DES COSMÉTIQUES DU PROFIL (14/11, refonte de la personnalisation) — un seul endroit pour tout ce qui se voit
 * d'un élément équipé, partout où un profil apparaît (profil, atelier, classement, chat, amis) :
 *  - les CADRES, dessinés au trait et à l'aplat dans un <svg> posé sur la photo (viewBox −60..60, photo de rayon 34) ;
 *    la couleur du profil arrive par `--fc` (posée sur `.cf`), jamais de halo flou ;
 *  - les ICÔNES au trait de l'interface (cadenas, coche, crayon, maillon…) et des badges : plus aucun emoji ;
 *  - le TITRE dans son style d'écriture (`.ts-<id>`, src/game/atelier.css) ;
 *  - le « plus » d'un ACCORD (cadre + fond de la même matière) : quelques éléments animés derrière la photo.
 * Version LÉGÈRE (`light`) pour les listes : l'anneau et son ornement, fixes — aucun mouvement, aucun effet.
 * Données (catalogue, déblocages, accords) : src/core/cosmetics.ts.
 */
import './cosmetiques.css';
import type { Cosmetic, Matter } from '../core/cosmetics';
import { titleStyleOf } from '../core/cosmetics';
import { esc } from './ui';

// ───────────────────────── icônes au trait (grille 24, trait 1,6) ─────────────────────────
const ICONS = {
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6zM12 15v2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pen: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1zM14.5 6.5l3 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5',
  swapImg: 'M4 6h16v12H4zM4 15l4.5-4.5 4 4 3-3L20 16M15.5 9.5h.01',
  left: 'M14 6l-6 6 6 6',
  right: 'M10 6l6 6-6 6',
  // familles de l'atelier
  background: 'M12 4l8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5',
  banner: 'M3 6h18v8H3zM7 18h10',
  frame: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
  title: 'M5 6h14M12 6v12M9 18h6',
  accent: 'M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z',
  vitrine: 'M4 8h5v10H4zM9.5 6h5v12h-5zM15 8h5v10h-5z',
  badge: 'M12 3l7 3v6c0 4.2-2.9 7.4-7 9c-4.1-1.6-7-4.8-7-9V6z',
  // badges (mêmes identifiants qu'avant, src/core/cosmetics.ts BADGES)
  'b-first': 'M7 4h10v16H7zM10 8h4M10 12h4',
  'b-p100': 'M6 5h9v14H6zM9 3h9v14',
  'b-p1000': 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 13v4M8.5 20h7',
  'b-full': 'M5 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H5zM19 5h-4a2 2 0 0 0-2 2M19 5v12h-4a2 2 0 0 0-2 2',
  'b-mythic': 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z',
  'b-secret': 'M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7',
  'b-trade': 'M7 8h11l-3-3M17 16H6l3 3',
  'b-contract': 'M6 4h9l3 3v13H6zM9 12h6M9 16h4M14 4v4h4',
  'b-streak': 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2c.3 1.6 1 2.4 2 2.7C10.5 9 11 5.5 12 3z',
  'b-half': 'M4 6h4v13H4zM9 4h4v15H9zM14.5 7l3.8-1 3 12.5-3.8 1z',
} as const;
export type IconName = keyof typeof ICONS;
/** Icône au trait (prend la couleur du texte). */
export const icon = (name: IconName, size = 16) =>
  `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
/** Icône d'un badge (repli : l'écusson). */
export const badgeIcon = (id: string, size = 13) => icon((`b-${id}` in ICONS ? `b-${id}` : 'badge') as IconName, size);

// ───────────────────────────────── tracés des cadres ─────────────────────────────────
const TAU = Math.PI * 2;
const P = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
const circ = (r: number) => `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
const dot = (x: number, y: number, s: number) => `M${(x + s).toFixed(2)} ${y.toFixed(2)}a${s} ${s} 0 1 0 ${-2 * s} 0a${s} ${s} 0 1 0 ${2 * s} 0Z`;
const dots = (n: number, r: number, s: number) => Array.from({ length: n }, (_, i) => dot(r * Math.cos((i / n) * TAU), r * Math.sin((i / n) * TAU), s)).join('');
const poly = (n: number, rf: (i: number, a: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    return (i ? 'L' : 'M') + P(rf(i, a), a);
  }).join('') + 'Z';
const ticks = (n: number, r1: number, r2: number, k: number, r3: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    return `M${P(r1, a)}L${P(i % k === 0 ? r3 : r2, a)}`;
  }).join('');
const f2 = (v: number) => v.toFixed(2);
const star4 = (x: number, y: number, s: number) => {
  const c = `${f2(x)} ${f2(y)} `;
  return `M${f2(x)} ${f2(y - s)}Q${c}${f2(x + s)} ${f2(y)}Q${c}${f2(x)} ${f2(y + s)}Q${c}${f2(x - s)} ${f2(y)}Q${c}${f2(x)} ${f2(y - s)}Z`;
};
const heart = (x: number, y: number, s: number) =>
  `M${f2(x)} ${f2(y + 3 * s)}C${f2(x - 6 * s)} ${f2(y - s)} ${f2(x - 3 * s)} ${f2(y - 5 * s)} ${f2(x)} ${f2(y - 2 * s)}C${f2(x + 3 * s)} ${f2(y - 5 * s)} ${f2(x + 6 * s)} ${f2(y - s)} ${f2(x)} ${f2(y + 3 * s)}Z`;

/**
 * Un cadre = trois tracés au plus : `d` (trait), `f` (aplat) et `m` (la partie qui bouge, classe `an`). Sans couleur
 * propre (`c`, `fc`, `mf`, `ms`), un tracé prend la couleur du profil (`--fc`).
 */
interface Art {
  d?: string;
  sw?: number;
  c?: string;
  f?: string;
  fc?: string;
  m?: string;
  mf?: string;
  ms?: string;
  msw?: number;
  an?: 'spin' | 'tick' | 'flick' | 'breath' | 'float' | 'tw';
}
const FC = 'var(--fc)';
let ARTS: Record<string, Art> | null = null;
/** Tracés calculés une seule fois, à la première demande (jamais au chargement du module). */
function arts(): Record<string, Art> {
  if (ARTS) return ARTS;
  // pixel : petits carrés posés sur une grille de 4
  let pixel = '';
  const seen = new Set<string>();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    const x = Math.round((44 * Math.cos(a)) / 4) * 4, y = Math.round((44 * Math.sin(a)) / 4) * 4;
    if (seen.has(`${x}_${y}`)) continue;
    seen.add(`${x}_${y}`);
    pixel += `M${x - 2} ${y - 2}h4v4h-4Z`;
  }
  let petales = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    petales += `M${P(39, a - 0.17)}Q${P(50, a - 0.24)} ${P(53, a)}Q${P(50, a + 0.24)} ${P(39, a + 0.17)}Z`;
  }
  let conf1 = '', conf2 = '';
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, r = 41 + ((i * 7) % 15), rot = i * 1.3;
    const cx = r * Math.cos(a), cy = r * Math.sin(a), co = Math.cos(rot), si = Math.sin(rot);
    const q = (ux: number, uy: number) => `${f2(cx + ux * co - uy * si)} ${f2(cy + ux * si + uy * co)}`;
    const seg = `M${q(-2.6, -1.2)}L${q(2.6, -1.2)}L${q(2.6, 1.2)}L${q(-2.6, 1.2)}Z`;
    if (i % 2) conf1 += seg;
    else conf2 += seg;
  }
  let chat1 = '', chat2 = '';
  for (const a of [-2.2, -0.94]) {
    chat1 += `M${P(39.5, a - 0.3)}L${P(58, a)}L${P(39.5, a + 0.3)}Z`;
    chat2 += `M${P(42.5, a - 0.15)}L${P(52, a)}L${P(42.5, a + 0.15)}Z`;
  }
  let epines = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.1, sg = i % 2 ? 1 : -1;
    epines += `M${P(45, a - 0.05)}L${P(53 + ((i * 5) % 4), a + sg * 0.07)}L${P(45, a + 0.06)}Z`;
  }
  let laurier = '';
  for (const sd of [-1, 1])
    for (let j = 0; j < 9; j++) {
      const a = Math.PI / 2 + sd * (0.32 + j * 0.28);
      laurier += `M${P(41.5, a)}Q${P(48, a - sd * 0.02)} ${P(52.5, a + sd * 0.2)}Q${P(44, a + sd * 0.22)} ${P(41.5, a)}Z`;
    }
  const hs = [9, 3, 13, 5, 10, 2, 15, 6, 11, 4, 14, 7];
  const impact = poly(48, (i) => (i % 2 ? 41.5 : 44 + hs[(i / 2) % 12])) + circ(39);
  // orbite : une ellipse inclinée, dont l'arrière passe DERRIÈRE la photo (segments cachés sous le rayon 37)
  let orbite = '', pen = false;
  const cr = Math.cos(-0.38), sr = Math.sin(-0.38);
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU, ex = 56 * Math.cos(t), ey = 17 * Math.sin(t), X = ex * cr - ey * sr, Y = ex * sr + ey * cr;
    if (ey >= 0 || Math.hypot(X, Y) > 37) {
      orbite += `${pen ? 'L' : 'M'}${f2(X)} ${f2(Y)}`;
      pen = true;
    } else pen = false;
  }
  const sat = dot(56 * Math.cos(0.9) * cr - 17 * Math.sin(0.9) * sr, 56 * Math.cos(0.9) * sr + 17 * Math.sin(0.9) * cr, 2.4);
  let eclairs = '';
  const bolt = [[41, -2.5], [50, -1], [47.5, 2.2], [58, 3.2], [46, 6], [48.5, 2.4], [41, 3.5]];
  for (const a of [-0.75, 2.4]) {
    const c = Math.cos(a), s = Math.sin(a);
    eclairs += bolt.map((p, j) => `${j ? 'L' : 'M'}${f2(p[0] * c - p[1] * s)} ${f2(p[0] * s + p[1] * c)}`).join('') + 'Z';
  }
  let feu1 = '', feu2 = '';
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU, up = Math.max(0, -Math.sin(a)), h = 3.5 + 13 * Math.pow(up, 1.4) + ((i * 5) % 4);
    feu1 += `M${P(40, a - 0.13)}Q${P(44 + h * 0.5, a - 0.12)} ${P(41 + h, a + 0.04)}Q${P(43 + h * 0.4, a + 0.15)} ${P(40, a + 0.13)}Z`;
    if (up > 0.2) feu2 += `M${P(40, a - 0.07)}Q${P(42 + h * 0.3, a - 0.06)} ${P(40.5 + h * 0.55, a + 0.02)}Q${P(42 + h * 0.25, a + 0.08)} ${P(40, a + 0.07)}Z`;
  }
  let coeurs = '';
  for (let i = 0; i < 6; i++) coeurs += heart(48 * Math.cos((i / 6) * TAU), 48 * Math.sin((i / 6) * TAU), 0.85);
  ARTS = {
    none: { d: circ(37.5), sw: 0.6, c: 'var(--gm-line-2, rgba(255,255,255,0.24))' },
    ring: { d: circ(40.5), sw: 2.4 },
    filet: { d: circ(39.5) + circ(44.5), sw: 1 },
    points: { m: dots(44, 43.5, 1.1), mf: FC, an: 'spin' },
    crans: { d: ticks(60, 40, 43.5, 5, 47), sw: 1, m: 'M0 -38.5L0 -50', ms: '#ffffff', msw: 1.6, an: 'tick' },
    pixel: { f: pixel },
    petales: { d: circ(38.6), sw: 0.8, c: '#ffffff', f: petales },
    engrenage: { d: circ(39.2), sw: 0.8, m: poly(96, (i) => (i % 8 < 4 ? 47.5 : 43)), ms: FC, msw: 1.5, an: 'spin' },
    vague: { d: poly(180, (_, a) => 44 + 2.4 * Math.sin(9 * a)), sw: 1.6, m: poly(180, (_, a) => 44 + 2.4 * Math.sin(9 * a + Math.PI)), ms: 'color-mix(in srgb, var(--fc) 45%, transparent)', msw: 1, an: 'spin' },
    confettis: { d: circ(38.8), sw: 1, f: conf1, m: conf2, mf: '#ffffff', an: 'tw' },
    chat: { d: circ(40.5), sw: 2.2, f: chat1, m: chat2, mf: 'rgba(0,0,0,0.4)' },
    ronces: { d: poly(180, (_, a) => 43 + 1.8 * Math.sin(7 * a)) + poly(180, (_, a) => 45 + 1.8 * Math.sin(7 * a + 2.4)), sw: 1.1, f: epines },
    laurier: { d: circ(39), sw: 0.8, f: laurier },
    impact: { d: circ(39), sw: 1.5, f: impact, fc: '#ffffff' },
    orbite: { d: circ(39.5) + orbite, sw: 1.1, m: sat, mf: '#ffffff', an: 'tw' },
    // cadres animés d'avant (retours live 6, C14), redessinés au trait : l'anneau prend la couleur du profil
    eclairs: { d: circ(40.5), sw: 1.6, m: eclairs, mf: '#bfe6ff', an: 'flick' },
    feu: { d: circ(40), sw: 1.6, f: feu1, fc: '#ff7a2a', m: feu2, mf: '#ffd36b', an: 'breath' },
    ange: { d: circ(40) + 'M-41 -6Q-58 -22 -60 -2M-41 2Q-56 -8 -58 10M-40 10Q-52 4 -53 19M41 -6Q58 -22 60 -2M41 2Q56 -8 58 10M40 10Q52 4 53 19', sw: 1.3, c: '#ffffff', m: 'M-15 -51a15 4.6 0 1 0 30 0a15 4.6 0 1 0 -30 0Z', ms: '#fff3c4', msw: 1.8, an: 'float' },
    coeurs: { d: circ(40.5), sw: 1.4, m: coeurs, mf: '#ff5d8f', an: 'spin' },
    galaxie: { d: circ(40), sw: 0.8, f: star4(40, -34, 5) + star4(-44, 26, 4) + star4(-30, -44, 3) + star4(46, 28, 3), fc: '#ffffff', m: dots(40, 45, 0.75), mf: '#b59cff', an: 'spin' },
    neon: { d: circ(43), sw: 3.4, c: '#39ffd2', m: circ(43), ms: '#eafffb', msw: 1, an: 'flick' },
    podium: { d: circ(40.5), sw: 2.2, c: '#ffc94a', f: 'M-9 46h6v7h-6ZM-3 42h6v11h-6ZM3 48h6v5h-6Z', fc: '#ffc94a' },
  };
  return ARTS;
}

/** Couleur propre d'un cadre « anneau de couleur » (palette, couleur libre, cadres d'avant le 07/11) ; sinon celle du profil. */
const ownColor = (f: Cosmetic) => (f.art || f.id === 'none' ? undefined : f.css && !/gradient/.test(f.css) ? f.css : f.id === 'mythic' ? '#c86bff' : undefined);

/** Le <svg> d'un cadre. `light` : fixe (listes). */
export function frameSvg(f: Cosmetic, light = false): string {
  const a = arts()[f.art ?? (f.id === 'none' ? 'none' : 'ring')] ?? arts().ring;
  const g = a.m ? `<g${light || !a.an ? '' : ` class="cf-a cf-${a.an}"`}><path d="${a.m}" fill="${a.mf ?? 'none'}" stroke="${a.ms ?? 'none'}" stroke-width="${a.msw ?? 1}"/></g>` : '';
  return `<svg class="cf-svg" viewBox="-60 -60 120 120" aria-hidden="true">${a.d ? `<path d="${a.d}" fill="none" stroke="${a.c ?? FC}" stroke-width="${a.sw ?? 1}"/>` : ''}${a.f ? `<path d="${a.f}" fill="${a.fc ?? FC}" fill-rule="evenodd"/>` : ''}${g}</svg>`;
}

/**
 * Photo + cadre : `<span class="cf">` (taille : celle de la photo, donnée par le CSS de l'appelant sur `.cf`), la photo
 * (`ava` : <img>, initiale…) et le cadre par-dessus. `under` : calque glissé DERRIÈRE la photo (le plus d'un accord).
 */
export function framed(f: Cosmetic, ava: string, o: { light?: boolean; cls?: string; under?: string } = {}): string {
  const c = ownColor(f);
  return `<span class="cf${o.cls ? ` ${o.cls}` : ''}" data-frame="${esc(f.id)}"${c ? ` style="--fc:${c}"` : ''}>${o.under ?? ''}<span class="cf-ph">${ava}</span>${frameSvg(f, o.light)}</span>`;
}

/** Le titre porté, dans son style d'écriture (src/game/atelier.css). */
export const titleHtml = (label: string, styleId?: string, cls = '') => `<span class="pf-title ts ts-${titleStyleOf(styleId).id}${cls ? ` ${cls}` : ''}">${esc(label)}</span>`;

// ───────────────────────────── le « plus » d'un accord ─────────────────────────────
/**
 * Éléments animés d'un accord, dans une boîte de 300 × 300 centrée sur la photo (`.ac-fx`, glissée sous elle par
 * `framed({ under })`). Chaque élément : position, taille, forme et son animation (keyframes `ac-*`, atelier.css ;
 * durées en multiples du jeton `--amb-particule`). Rien d'autre que des <i> en CSS : pas de canevas, pas de script.
 */
export function accordFx(m: Matter): string {
  const out: string[] = [];
  const A = 'var(--fc)';
  const p = (css: string, an: string, k = 1, delay = 0, more = '') => out.push(`<i style="${css};animation:ac-${an} calc(var(--amb-particule) * ${k.toFixed(2)}) linear calc(var(--amb-particule) * ${(-delay).toFixed(2)}) infinite${more}"></i>`);
  const star = 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)';
  const boltShape = 'polygon(55% 0,100% 0,62% 42%,88% 42%,20% 100%,42% 54%,14% 54%)';
  if (m === 'feu') for (let i = 0; i < 16; i++) p(`left:${56 + ((i * 37) % 190)}px;top:${196 + ((i * 13) % 36)}px;width:${2 + (i % 3)}px;height:${2 + (i % 3)}px;border-radius:50%;background:${i % 3 ? '#ff8a2a' : '#ffd36b'}`, i % 2 ? 'rise-a' : 'rise-b', 0.85 + (i % 4) * 0.13, i * 0.12);
  if (m === 'foudre') {
    p(`left:214px;top:4px;width:26px;height:118px;background:#dff3ff;rotate:14deg;clip-path:${boltShape}`, 'flash', 2, 0);
    p(`left:52px;top:176px;width:20px;height:92px;background:#dff3ff;rotate:196deg;clip-path:${boltShape}`, 'flash', 2, 1);
  }
  if (m === 'ombre') for (let i = 0; i < 3; i++) p(`left:${-10 + i * 54}px;top:${196 + i * 8}px;width:220px;height:58px;border-radius:50%;background:rgba(0,0,0,0.8);filter:blur(14px)`, 'drift', 1.9, i * 0.6, ' alternate');
  if (m === 'cosmos') for (let i = 0; i < 6; i++) p(`left:${i * 44}px;top:${16 + ((i * 53) % 200)}px;width:46px;height:1px;background:linear-gradient(90deg,transparent,#ffffff);rotate:26.5deg`, 'streak', 1.45, i * 0.24);
  if (m === 'neon') {
    p(`left:30px;top:30px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,transparent 0 66%,${A} 66.5% 68%,transparent 68.5%)`, 'burst', 0.6, 0);
    p(`left:0;top:248px;width:300px;height:2px;background:${A}`, 'flick', 1.1, 0);
  }
  if (m === 'retro') p('left:-300px;top:-250px;width:900px;height:900px;background:repeating-linear-gradient(0deg,rgba(255,255,255,0.09) 0 1px,transparent 1px 4px)', 'scan', 0.2, 0);
  if (m === 'sport') for (let i = 0; i < 16; i++) p(`left:${18 + ((i * 53) % 264)}px;top:0;width:4px;height:8px;background:${i % 2 ? A : '#ffffff'}`, 'fall', 1.1 + (i % 3) * 0.15, i * 0.085);
  if (m === 'manga') {
    p(`left:0;top:0;width:300px;height:300px;background:repeating-conic-gradient(from 0deg at 50% 50%,#ffffff 0 1deg,transparent 1deg 9deg);mask-image:radial-gradient(circle,transparent 0 74px,#000 76px,transparent 150px);-webkit-mask-image:radial-gradient(circle,transparent 0 74px,#000 76px,transparent 150px)`, 'burst', 0.35, 0);
    p(`left:0;top:0;width:300px;height:300px;background:repeating-conic-gradient(from 4.5deg at 50% 50%,${A} 0 0.6deg,transparent 0.6deg 9deg);mask-image:radial-gradient(circle,transparent 0 82px,#000 84px,transparent 150px);-webkit-mask-image:radial-gradient(circle,transparent 0 82px,#000 84px,transparent 150px)`, 'burst', 0.35, 0.17);
  }
  if (m === 'doux') for (let i = 0; i < 10; i++) p(`left:${40 + ((i * 61) % 220)}px;top:${170 + ((i * 17) % 50)}px;width:${6 + (i % 3) * 2}px;height:${6 + (i % 3) * 2}px;background:${i % 2 ? '#ffffff' : A};clip-path:${star}`, i % 2 ? 'rise-a' : 'rise-b', 1.6, i * 0.16);
  if (m === 'monde') for (let i = 0; i < 3; i++) p(`left:30px;top:30px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,transparent 0 68.5%,${A} 69% 70%,transparent 70.5%)`, 'ripple', 1.4, i * 0.46);
  return `<span class="ac-fx" data-accord="${m}" aria-hidden="true">${out.join('')}</span>`;
}
