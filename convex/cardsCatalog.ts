import { v, type Infer } from 'convex/values';

export const rarityValidator = v.union(
  v.literal('common'),
  v.literal('uncommon'),
  v.literal('rare'),
  v.literal('epic'),
  v.literal('legendary'),
  v.literal('mythic'),
);

export type RarityId = Infer<typeof rarityValidator>;

export const RARITY_TIER: Record<RarityId, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export const RARITY_LABEL: Record<RarityId, string> = {
  common: 'Commune',
  uncommon: 'Peu commune',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
  mythic: 'Mythique',
};

/**
 * Drop weights matching src/core/rarity.ts.
 * Used server-side so players cannot manipulate drop rates on the client.
 */
export const DROP_WEIGHTS: Record<RarityId, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 3.8,
  legendary: 1.0,
  mythic: 0.2,
};

/** Guaranteed minimum uncommon+ slot weights (5th card in every 5-card booster) */
export const GUARANTEED_SLOT_WEIGHTS: Record<RarityId, number> = {
  common: 0,
  uncommon: 62,
  rare: 25,
  epic: 9.5,
  legendary: 2.8,
  mythic: 0.7,
};

export interface CatalogCard {
  id: string;
  num: number;
  name: string;
  epithet: string;
  element: string;
  baseRarity: RarityId;
}

/**
 * Canonical card pool synced with src/core/cardData.ts (zero Three.js dependency for Convex runtime).
 */
export const CATALOG_CARDS: CatalogCard[] = [
  { id: 'pierre-levee', num: 3, name: 'Pierre Levée', epithet: 'Lieu', element: 'Pierre', baseRarity: 'common' },
  { id: 'veilleur-cendre', num: 7, name: 'Veilleur de Cendre', epithet: 'Gardien', element: 'Cendre', baseRarity: 'rare' },
  { id: 'phalene-albatre', num: 12, name: 'Phalène d’Albâtre', epithet: 'Esprit', element: 'Lune', baseRarity: 'uncommon' },
  { id: 'lierre-sourd', num: 15, name: 'Lierre Sourd', epithet: 'Plante', element: 'Ronce', baseRarity: 'common' },
  { id: 'sigille-marees', num: 23, name: 'Sigille des Marées', epithet: 'Rituel', element: 'Marée', baseRarity: 'epic' },
  { id: 'tour-muette', num: 31, name: 'La Tour Muette', epithet: 'Lieu', element: 'Pierre', baseRarity: 'legendary' },
  { id: 'serpent-givre', num: 44, name: 'Serpent de Givre', epithet: 'Bête', element: 'Givre', baseRarity: 'epic' },
  { id: 'floraison-noire', num: 52, name: 'Floraison Noire', epithet: 'Maléfice', element: 'Ronce', baseRarity: 'rare' },
  { id: 'oeil-du-puits', num: 66, name: 'Œil du Puits', epithet: 'Oracle', element: 'Abîme', baseRarity: 'mythic' },
  { id: 'cerf-orage', num: 78, name: 'Cerf d’Orage', epithet: 'Bête', element: 'Orage', baseRarity: 'legendary' },
  { id: 'phare-noye', num: 88, name: 'Phare Noyé', epithet: 'Lieu', element: 'Marée', baseRarity: 'uncommon' },
  { id: 'mue-de-lune', num: 99, name: 'Mue de Lune', epithet: 'Esprit', element: 'Lune', baseRarity: 'mythic' },
];

export function rollRarityFromWeights(weights: Record<RarityId, number>, rand: () => number = Math.random): RarityId {
  const entries = Object.entries(weights) as [RarityId, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let x = rand() * total;
  for (const [rarity, weight] of entries) {
    x -= weight;
    if (x <= 0) return rarity;
  }
  return 'common';
}

export function pickCardForRarity(rarity: RarityId, rand: () => number = Math.random): CatalogCard {
  const matching = CATALOG_CARDS.filter((c) => c.baseRarity === rarity);
  const pool = matching.length > 0 ? matching : CATALOG_CARDS;
  return pool[Math.floor(rand() * pool.length)];
}
