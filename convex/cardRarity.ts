import { v, type Infer } from 'convex/values';

/**
 * RARETÉS ET SORTES DE BOOSTER — validateurs et tables, SANS le catalogue (audit perf V3 n°10).
 *
 * Avant, ici : convex/cardsCatalog.ts, qui importe tout le catalogue (`sets/themes`, 4 Mo de sources, 37 000 cartes
 * construites à l'import). `schema.ts` et les modules qui ne voulaient que `rarityValidator` le chargeaient donc à chaque
 * exécution (≈ 0,15-0,2 s mesurés sur le staging). cardsCatalog.ts les réexporte : les imports existants ne changent pas.
 * Garde-fou : convex/catalogImports.test.ts.
 */
export const rarityValidator = v.union(
  v.literal('common'),
  v.literal('uncommon'),
  v.literal('rare'),
  v.literal('epic'),
  v.literal('legendary'),
  v.literal('mythic'),
  v.literal('secret'),
);

export type RarityId = Infer<typeof rarityValidator>;

/** Sorte de booster : celui d'un thème, ou le bébou pack (tous les thèmes, seul pack à Bébous). */
export const packKindValidator = v.union(v.literal('theme'), v.literal('bebou'));

export const RARITY_TIER: Record<RarityId, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  secret: 6,
};

export const RARITY_LABEL: Record<RarityId, string> = {
  common: 'Commune',
  uncommon: 'Peu commune',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
  mythic: 'Mythique',
  secret: 'Secrète',
};
