/**
 * (27/11) APERÇU DES OUVERTURES dans la fiche d'un booster (packSheet.ts) : une vignette au trait (SVG) qui montre le
 * geste et ce qu'il fait au sachet — jouée une fois à l'affichage, en boucle sur l'ouverture choisie, rejouée quand on
 * touche une ouverture verrouillée. Aucune 3D, aucun fichier : le vrai rendu reste celui de la scène.
 * Styles : progression.css (`.pv`), durées par jetons (`--dur-emphatique`, `--ease-standard`).
 */
import type { OpeningId } from '../../core/cosmetics';

/** deux cartes debout dans le sachet (la seconde légèrement décalée) */
const cards = (y: number) => `<g class="pv-cards"><rect x="12.5" y="${y}" width="15" height="23" rx="1.2"/><rect x="11.5" y="${y + 1}" width="15" height="23" rx="1.2"/></g>`;
const dot = (cx: number, cy: number) => `<circle class="pv-dot" cx="${cx}" cy="${cy}" r="2.6"/>`;

/** étoile à 5 branches centrée en (cx, cy) */
function star(cx: number, cy: number, R: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + k * Math.cos(a)).toFixed(2)} ${(cy + k * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}
/** éclat des habillages de Noël au moment où le haut part (givre, étoile dorée) */
const BURST: Partial<Record<OpeningId, string>> = {
  glace: '<path class="pv-burst" d="M20 3.5v11M14.5 9h11M16.1 5.1l7.8 7.8M23.9 5.1l-7.8 7.8"/>',
  etoile: `<path class="pv-burst" d="${star(20, 9, 5.6, 2.3)}"/>`,
};

/** Déchirure (et ses habillages) : le doigt glisse le long du haut, la bande part, les cartes montent. */
function tearArt(id: OpeningId) {
  return `${cards(14)}<rect class="pv-bag" x="9" y="12" width="22" height="30" rx="1.5"/><path class="pv-crimp" d="M11 39.5h18"/><g class="pv-strip"><rect class="pv-bag" x="9" y="7" width="22" height="4.6" rx="1.2"/><path class="pv-crimp" d="M11 9.3h18"/></g>${BURST[id] ?? ''}${dot(7, 11.8)}`;
}
/** Retroussé : le doigt descend, le film se retourne le long d'un pli roulé, les cartes restent debout. */
function rollArt() {
  return `<rect class="pv-back" x="9" y="7" width="22" height="35" rx="1.5"/>${cards(11)}<rect class="pv-bag pv-film" x="9" y="7" width="22" height="35" rx="1.5"/><rect class="pv-lip" x="8.5" y="5.8" width="23" height="3.2" rx="1.6"/>${dot(20, 7.4)}`;
}

/**
 * Fenêtre : le doigt glisse sur le sachet, les 4 coins de la pile marquent le film, le contour se découpe, la pile
 * avance avec le panneau plaqué, le panneau tombe : un trou au format des cartes.
 */
function winArt() {
  const corners = '<path class="pv-corner" d="M12.5 14v-3h3M27.5 14v-3h-3M12.5 32v3h3M27.5 32v3h-3"/>';
  return `<rect class="pv-bag" x="9" y="7" width="22" height="35" rx="1.5"/><path class="pv-crimp" d="M11 9.3h18M11 39.5h18"/>${cards(11)}<rect class="pv-bag pv-panel" x="12.5" y="11" width="15" height="24" rx="0.6"/>${corners}<rect class="pv-cut" x="12.5" y="11" width="15" height="24"/>${dot(20, 13)}`;
}

/** Déchirure glacée : le sachet dans un bloc de glace ; trois coups, les fêlures s'étendent, tout éclate, les cartes restent. */
function iceArt() {
  const crack1 = '<path class="pv-crack pv-crack1" d="M17 15l-4-3M17 15l5-2M17 15l-1 5M17 15l3 4"/>';
  const crack2 = '<path class="pv-crack pv-crack2" d="M13 12l-5-5M22 13l9-4M16 20l-6 12M20 19l7 14M22 13l4 9"/>';
  const shards = '<g class="pv-shards"><path d="M8 9l5 1-2 4z"/><path d="M28 8l4 3-4 2z"/><path d="M10 33l4 2-4 3z"/><path d="M29 30l3 4-5 0z"/></g>';
  return `${cards(11)}<g class="pv-block"><rect class="pv-bag" x="9" y="7" width="22" height="35" rx="1.5"/><rect class="pv-ice" x="6.5" y="4.5" width="27" height="40" rx="2.2"/>${crack1}${crack2}</g>${shards}${dot(17, 15)}`;
}

/** Vignette d'aperçu d'une ouverture (une nouvelle ouverture ajoute ici son dessin et ses images clés dans progression.css). */
export function openingPreview(id: OpeningId): string {
  const kind = id === 'retrousse' ? 'roll' : id === 'fenetre' ? 'win' : id === 'glace' ? 'ice' : 'tear';
  const art = kind === 'roll' ? rollArt() : kind === 'win' ? winArt() : kind === 'ice' ? iceArt() : tearArt(id);
  // (la glace : classe `pv-ice-k`, `pv-ice` est le dessin du bloc)
  return `<svg class="pv pv-${kind === 'ice' ? 'ice-k' : kind}" viewBox="0 0 40 48" aria-hidden="true" focusable="false">${art}</svg>`;
}
