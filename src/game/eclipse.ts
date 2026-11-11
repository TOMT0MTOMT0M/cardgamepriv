import { catalogEntry } from '../core/sets/themes';

/**
 * AMBIANCE « ÉCLIPSE » (idée de Tom, 10/11 — claude/berserk-eclipse-v2-10-11.md) : un booster qui contient une carte
 * BERSERK 5★ ou 6★ change la scène d'ouverture.
 *  1. sachet fermé : l'aura passe aux couleurs de la lune rouge et la scène s'assombrit (spoil assumé — seule
 *     exception à la lueur neutre) ;
 *  2. une fois descellé : le soleil noir et sa couronne, le lac-miroir, des temps lents (scenes/opening.ts), et
 *     l'extrait « Behelit » en fond (musicPreview.ts, `playAmbience`).
 * Pas de rejeu dans la visionneuse. « Effets réduits » : couleur et assombrissement seulement (la musique reste).
 */
export const ECLIPSE_SUBTHEME = 'berserk';

export const isEclipseCard = (c: { cardId: string; rarity: string }): boolean =>
  (c.rarity === 'legendary' || c.rarity === 'mythic') && catalogEntry(c.cardId)?.subthemeId === ECLIPSE_SUBTHEME;

export const isEclipsePack = (cards: Array<{ cardId: string; rarity: string }>): boolean => cards.some(isEclipseCard);
