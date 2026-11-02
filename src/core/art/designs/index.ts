import type { CardDesign } from './common';
import { classic, CLASSIC_WIN } from './classic';
import { fullArt, cartouche } from './fullart';
import { passePartout, artDeco, arche, medaillon } from './ornate';
import { suisse, estampe, celeste } from './graphic';
import { bebou } from './bebou';

export type { CardDesign, DesignCtx } from './common';
export { STAR_COLORS, starColor, glyph } from './common';
export { CLASSIC_WIN, bebou };

/** Les 10 maquettes de carte (nom + univers + étoiles, aucune statistique, aucun texte d'ambiance). */
export const DESIGNS: CardDesign[] = [classic, fullArt, cartouche, passePartout, artDeco, arche, medaillon, suisse, estampe, celeste];

/** + le gabarit secret des Bébous (hors des 10 maquettes génériques : réservé à ce thème). */
export const DESIGN_BY_ID: Record<string, CardDesign> = Object.fromEntries([...DESIGNS, bebou].map((d) => [d.id, d]));

/** Gabarit utilisé par toutes les expériences qui ne choisissent pas de design. */
export const DEFAULT_DESIGN = classic;

export function design(id?: string | CardDesign): CardDesign {
  if (!id) return DEFAULT_DESIGN;
  if (typeof id !== 'string') return id;
  return DESIGN_BY_ID[id] ?? DEFAULT_DESIGN;
}
