import { alpha, linear, radial } from './canvas';
import { BASE_H, BASE_W, WIN, type PaintTarget } from './subjects';
import { FONT_MONO, FONT_TITLE } from './designs/common';

/**
 * Carte « Jeux vidéo » SANS illustration (rien de fiable trouvé à la récolte) : un design typographique au lieu de la
 * silhouette d'attente. Monogramme du jeu / du personnage en relief (extrusion façon titre d'arcade), trame de pixels
 * et lignes de balayage CRT, couleur propre à la famille (Mario, Tekken… gardent toujours la même teinte).
 * Le cadre « Pleine illustration » ajoute par-dessus le nom, la famille et les étoiles comme sur les autres cartes.
 */

/** Teinte stable d'une famille (0..360). */
export function jvHue(family: string): number {
  let h = 2166136261;
  for (let i = 0; i < family.length; i++) h = Math.imul(h ^ family.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

const SMALL = new Set(['the', 'of', 'a', 'an', 'and', 'le', 'la', 'les', 'de', 'des', 'du', 'et', 'l', 'd', 'to', 'in', 'on', 'vs']);

/** Monogramme : initiales des mots (3 max), chiffres gardés (« Super Mario 64 » → SM64, « Doom » → DO). */
export function jvMonogram(name: string): string {
  const clean = name.replace(/\(.*?\)/g, ' ').replace(/[’']/g, ' ');
  const words = clean.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const keep = words.filter((w) => !SMALL.has(w.toLowerCase()));
  const ws = keep.length ? keep : words;
  if (!ws.length) return '?';
  if (ws.length === 1) return /^\d+$/.test(ws[0]) ? ws[0].slice(0, 4) : ws[0].slice(0, 2).toUpperCase();
  let out = '';
  for (const w of ws) {
    if (/^\d+$/.test(w)) out += w; // numéro de suite entier
    else if (/^[IVX]+$/.test(w)) out += w; // chiffres romains
    else out += w[0].toUpperCase();
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

const KIND_LABEL: Record<string, string> = { cover: 'JEU', character: 'PERSONNAGE', object: 'OBJET' };

/** Zone visible avec le gabarit « Pleine illustration » (même calcul que imageSubject.ts). */
const K = 1.62;
const CX = WIN.x + WIN.w / 2, CY = WIN.y + WIN.h / 2;
const VIEW = { x: CX - 384 / K, y: CY - 470 / K, w: BASE_W / K, h: BASE_H / K };

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paintTitleSubject(t: PaintTarget, o: { name: string; family: string; kind?: string; label?: string; year?: number }) {
  const { bg, subj, fx } = t;
  const hue = jvHue(o.family);
  const r = rng(t.seed * 7919 + hue);
  const hsl = (s: number, l: number, a = 1, dh = 0) => `hsla(${(hue + dh + 360) % 360}, ${s}%, ${l}%, ${a})`;

  // ── fond : dégradé de la famille, halo derrière le titre
  bg.fillStyle = linear(bg, 0, VIEW.y, 0, VIEW.y + VIEW.h, [[0, hsl(55, 30)], [0.55, hsl(50, 16)], [1, hsl(40, 7)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);
  const ty = VIEW.y + VIEW.h * 0.47;
  bg.fillStyle = radial(bg, CX, ty, 10, VIEW.w * 0.75, [[0, hsl(70, 55, 0.55, -12)], [1, hsl(70, 40, 0)]]);
  bg.fillRect(0, 0, BASE_W, BASE_H);

  // ── trame de pixels : carrés allumés au hasard, plus denses près du titre (on lit « jeu vidéo » sans image)
  const cell = 14;
  for (let y = VIEW.y - cell; y < VIEW.y + VIEW.h + cell; y += cell)
    for (let x = VIEW.x - cell; x < VIEW.x + VIEW.w + cell; x += cell) {
      const d = Math.hypot((x - CX) / VIEW.w, (y - ty) / VIEW.h);
      const p = r();
      if (p > 0.32 + d * 0.9) continue;
      bg.fillStyle = hsl(80, 50 + r() * 25, 0.05 + r() * 0.16 * (1 - Math.min(1, d * 1.4)), r() > 0.8 ? 40 : 0);
      bg.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  // lignes de balayage CRT
  bg.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < BASE_H; y += 4) bg.fillRect(0, y, BASE_W, 1.4);

  // ── monogramme en relief (calque sujet : parallaxe et foil des cartes rares)
  const mono = jvMonogram(o.name);
  const maxW = VIEW.w * 0.78;
  let size = 300;
  subj.font = `700 ${size}px ${FONT_TITLE}`;
  const w0 = subj.measureText(mono).width;
  size = Math.min(size * (maxW / Math.max(1, w0)), VIEW.h * 0.36);
  const font = `700 ${size}px ${FONT_TITLE}`;
  subj.font = font;
  subj.textAlign = 'center';
  subj.textBaseline = 'middle';
  const depth = Math.max(8, size * 0.075);
  // extrusion (copies décalées, de plus en plus sombres)
  for (let i = Math.round(depth); i > 0; i--) {
    subj.fillStyle = hsl(60, 10 + (12 * (depth - i)) / depth);
    subj.fillText(mono, CX + i * 0.55, ty + i);
  }
  // face : dégradé clair, liseré
  subj.fillStyle = linear(subj, 0, ty - size * 0.45, 0, ty + size * 0.45, [[0, '#fffaf0'], [0.45, hsl(85, 82)], [1, hsl(80, 58, 1, -18)]]);
  subj.fillText(mono, CX, ty);
  subj.lineWidth = Math.max(2, size * 0.012);
  subj.strokeStyle = alpha('#ffffff', 0.55);
  subj.strokeText(mono, CX, ty);
  // reflet en haut des lettres
  subj.save();
  subj.globalCompositeOperation = 'source-atop';
  subj.fillStyle = 'rgba(255,255,255,0.22)';
  subj.fillRect(0, ty - size * 0.5, BASE_W, size * 0.32);
  subj.restore();

  // ── étiquette : JEU · 1996 / PERSONNAGE / OBJET, encadrée comme une cartouche de console
  const label = [(o.label ?? KIND_LABEL[o.kind ?? ''] ?? '').toUpperCase(), o.year ? String(o.year) : ''].filter(Boolean).join('  ·  ');
  if (label) {
    const ly = ty + size * 0.5 + depth + 52;
    subj.font = `500 26px ${FONT_MONO}`;
    const lw = subj.measureText(label).width + 56;
    subj.fillStyle = 'rgba(8,6,10,0.55)';
    subj.beginPath();
    subj.roundRect(CX - lw / 2, ly - 24, lw, 48, 24);
    subj.fill();
    subj.strokeStyle = hsl(70, 70, 0.7);
    subj.lineWidth = 2;
    subj.stroke();
    subj.fillStyle = '#f6efe2';
    subj.fillText(label, CX, ly + 1);
  }
  subj.textAlign = 'left';
  subj.textBaseline = 'alphabetic';

  // ── fx : les lettres luisent un peu (R), foil possible sur le titre (G), relief (B)
  fx.save();
  fx.globalCompositeOperation = 'lighter';
  fx.font = font;
  fx.textAlign = 'center';
  fx.textBaseline = 'middle';
  fx.fillStyle = 'rgb(70,200,170)';
  fx.fillText(mono, CX, ty);
  fx.restore();
}

/** Miniature SVG (grilles, cases de contrat) d'une carte sans illustration : même teinte et même monogramme. */
const svgCache = new Map<string, string>();
export function jvThumbSvg(name: string, family: string): string {
  const key = `${family}|${name}`;
  const hit = svgCache.get(key);
  if (hit) return hit;
  const hue = jvHue(family);
  const mono = jvMonogram(name).replace(/[<&>"]/g, '');
  const fs = mono.length <= 2 ? 92 : mono.length === 3 ? 70 : 54;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 252"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,30%)"/><stop offset="1" stop-color="hsl(${hue},40%,8%)"/></linearGradient><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="hsl(${hue},80%,62%)"/></linearGradient></defs><rect width="180" height="252" rx="12" fill="url(#g)"/><text x="93" y="134" font-family="Georgia,serif" font-weight="700" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="hsl(${hue},55%,12%)">${mono}</text><text x="90" y="130" font-family="Georgia,serif" font-weight="700" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="url(#t)">${mono}</text></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  svgCache.set(key, url);
  return url;
}
