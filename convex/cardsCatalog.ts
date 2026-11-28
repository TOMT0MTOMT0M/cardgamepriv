import { ALL_THEMES, catalogEntry, type CatalogEntry } from '../src/core/sets/themes';
import { GUARANTEED_WEIGHTS, SLOT_WEIGHTS } from '../src/core/dropRates';
import type { RarityId } from './cardRarity';

/**
 * (audit perf V3 n°10) Les validateurs et tables de rareté vivent dans cardRarity.ts (sans catalogue) : un module qui
 * n'en veut que ça l'importe de là. Réexportés ici pour les imports existants. CE fichier-ci charge le catalogue.
 */
export { RARITY_LABEL, RARITY_TIER, packKindValidator, rarityValidator, type RarityId } from './cardRarity';

/**
 * Poids de tirage (source unique : src/core/dropRates.ts, partagée avec le client).
 * La secrète n'est JAMAIS tirée carte par carte : elle a son propre tirage par pack (src/core/packRules.ts).
 */
export const DROP_WEIGHTS: Record<RarityId, number> = { ...SLOT_WEIGHTS, secret: 0 };
export const GUARANTEED_SLOT_WEIGHTS: Record<RarityId, number> = { ...GUARANTEED_WEIGHTS, secret: 0 };

export interface CatalogCard {
  id: string;
  num: number;
  name: string;
  /** thème (gaming, pop, sport, monde, bebous) */
  themeId: string;
  /** sous-thème (pokemon, lol, mcu…) */
  subthemeId: string;
  baseRarity: RarityId;
  /** Album / Chanson : artiste principal (src/core/sets/popArtists.ts, généré par scripts/build-music-artists.py) */
  artist?: string;
}

const toCatalog = (e: CatalogEntry): CatalogCard => ({ id: e.id, num: e.num, name: e.name, themeId: e.themeId, subthemeId: e.subthemeId, baseRarity: e.rarity, ...(e.artist ? { artist: e.artist } : {}) });

/** Toutes les cartes de tous les thèmes, Bébous compris (source : src/core/sets/themes.ts). */
export const CATALOG_CARDS: CatalogCard[] = ALL_THEMES.flatMap((t) => t.cards.map(toCatalog));

/** Carte du catalogue par id (null si inconnue : anciennes cartes du lab encore en inventaire, ids changés…). */
export function catalogCard(id: string): CatalogCard | null {
  const e = catalogEntry(id);
  return e ? toCatalog(e) : null;
}
