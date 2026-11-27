/**
 * MÉDAILLONS DES BADGES (27/11, labo 048 validé par Hugo et Tom) — UNE source du gabarit : disque noir, double filet,
 * teinte en accent, symbole au centre. Utilisé par `badgeIcon()` (profil, atelier, succès) et par le labo 048 (83 titres
 * uniques). Repère des symboles : centré en (0,0), tient dans ±24 ; trait 3, bouts ronds ; lisible à 20 px.
 * Remplir = F / CF / EF ; trait = S / CS ; creux (noir du médaillon) = K / CK / KS. Aucun logo officiel.
 */
export const NOIR = '#08080a';
export const F = (d: string) => `<path d="${d}" fill="currentColor" stroke="none"/>`;
export const S = (d: string, w = 3) => `<path d="${d}" stroke-width="${w}"/>`;
export const K = (d: string) => `<path d="${d}" fill="${NOIR}" stroke="none"/>`;
export const KS = (d: string, w = 2) => `<path d="${d}" stroke="${NOIR}" stroke-width="${w}"/>`;
export const CF = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
export const CS = (x: number, y: number, r: number, w = 3) => `<circle cx="${x}" cy="${y}" r="${r}" stroke-width="${w}"/>`;
export const CK = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${NOIR}" stroke="none"/>`;
export const EF = (x: number, y: number, rx: number, ry: number) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="currentColor" stroke="none"/>`;
export const rot = (a: number, inner: string, cx = 0, cy = 0) => `<g transform="rotate(${a} ${cx} ${cy})">${inner}</g>`;
export const poly = (n: number, R: number, a0 = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((a0 + (360 / n) * i) * Math.PI) / 180;
    return `${i ? 'L' : 'M'}${(R * Math.cos(a)).toFixed(1)},${(R * Math.sin(a)).toFixed(1)}`;
  }).join(' ') + 'Z';
export const star = (n: number, R: number, r: number, a0 = -90) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = ((a0 + (180 / n) * i) * Math.PI) / 180;
    const rr = i % 2 ? r : R;
    return `${i ? 'L' : 'M'}${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ') + 'Z';

const FLAME = 'M0,-24 C4,-12 18,-8 18,6 C18,16 10,23 0,23 C-10,23 -18,16 -17,6 C-16,-2 -10,-6 -8,-14 C-4,-10 -2,-8 -2,-4 C2,-10 2,-18 0,-24Z';

/** Le médaillon : `symbole` = SVG du symbole (repère ±24), `teinte` = couleur d'accent. `px` : taille en pixels (sinon 100 % du parent). */
export function medaillon(symbole: string, teinte: string, px?: number, cls = 'bd'): string {
  const dim = px ? ` width="${px}" height="${px}"` : '';
  return (
    `<svg class="${cls}" viewBox="-50 -50 100 100"${dim} aria-hidden="true" style="color:${teinte}">` +
    `<circle r="47" fill="${NOIR}" stroke="currentColor" stroke-width="3.4"/>` +
    `<circle r="41" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-opacity=".5" stroke-width="1.1"/>` +
    `<g transform="scale(1.04)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${symbole}</g>` +
    `</svg>`
  );
}

/** Les 10 badges du jeu (src/core/cosmetics.ts BADGES) : symbole + teinte, loin des teintes de rareté (src/core/rarity.ts). */
export const BADGE_ART: Record<string, { sym: string; teinte: string }> = {
  // 10 boosters : un sachet serti, étoile au centre
  first: { teinte: '#6fd1c1', sym: F('M-13,-21 H13 V21 H-13Z') + KS('M-13,-13 H13 M-13,14 H13', 2) + K(star(5, 8, 3.4, -90)) },
  // 100 boosters : deux sachets, un devant l'autre
  p100: { teinte: '#a3b5ff', sym: S('M-8,-21 H16 V14', 3) + F('M-16,-14 H8 V21 H-16Z') + KS('M-16,-7 H8 M-16,15 H8', 2) + CK(-4, 4, 3.2) },
  // 1 000 boosters : la coupe
  p1000: { teinte: '#f2a0c4', sym: F('M-11,-20 H11 V-6 C11,6 -11,6 -11,-6Z') + S('M-11,-16 H-18 C-18,-6 -15,-3 -11,-4 M11,-16 H18 C18,-6 15,-3 11,-4', 2.8) + S('M0,4 V13', 4) + F('M-10,15 H10 V21 H-10Z') },
  // album complet : le livre ouvert
  full: { teinte: '#8fdc95', sym: S('M0,-14 C-6,-19 -14,-19 -21,-16 V15 C-14,12 -6,12 0,17 C6,12 14,12 21,15 V-16 C14,-19 6,-19 0,-14Z M0,-14 V17', 3) + S('M-14,-8 H-7 M-14,-2 H-7 M7,-8 H14 M7,-2 H14', 2) },
  // 5 × 6★ : l'étoile pleine
  mythic: { teinte: '#e3d4ff', sym: F(star(5, 24, 10.5, -90)) + CK(0, 1, 3.6) },
  // Bébou secret : le cadenas
  secret: { teinte: '#c77dff', sym: S('M-9,-3 V-11 A9,9 0 0 1 9,-11 V-3', 3.4) + F('M-14,-3 H14 V21 H-14Z') + CK(0, 8, 3.4) + KS('M0,9 V14', 3) },
  // échangeur : deux flèches croisées
  trade: { teinte: '#5fcfe8', sym: S('M-20,-9 H18 M10,-17 L18,-9 L10,-1', 3.4) + S('M20,9 H-18 M-10,1 L-18,9 L-10,17', 3.4) },
  // contrat signé : la feuille, le sceau
  contract: { teinte: '#e6dd6a', sym: F('M-14,-23 H5 L14,-14 V23 H-14Z') + KS('M5,-23 V-14 H14', 2) + KS('M-7,-8 H5 M-7,-1 H3', 2.6) + CK(3, 13, 5) + CF(3, 13, 2) },
  // 7 jours : la flamme sur le calendrier
  streak: { teinte: '#ff8a5c', sym: S('M-20,-12 H20 V21 H-20Z', 3) + S('M-11,-20 V-8 M11,-20 V-8', 3) + `<g transform="translate(0,6) scale(.45)">${F(FLAME)}</g>` },
  // 5 000 cartes : une étagère de livres
  half: { teinte: '#d6b38a', sym: S('M-18,-17 H-8 V17 H-18Z', 3) + S('M-5,-22 H5 V17 H-5Z', 3) + rot(14, S('M9,-17 H19 V17 H9Z', 3), 14, 17) + S('M-23,22 H23', 3.4) },
};

/** Médaillon d'un badge du jeu (repli : médaillon neutre vide). */
export const badgeMedal = (id: string, px = 20): string => {
  const a = BADGE_ART[id];
  return medaillon(a?.sym ?? CS(0, 0, 14, 3), a?.teinte ?? '#cfcdd6', px);
};
