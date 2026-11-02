/**
 * Taux de drop par étoile — données pures, AUCUN import : partagé tel quel avec convex/ (le serveur tire avec ces
 * poids, le mode hors-ligne du jeu aussi).
 *
 * À NE PAS confondre avec la COMPOSITION des thèmes (30,93 / 23,71 / 20,62 / 11,34 / 9,28 / 4,12 % des cartes
 * portent 1★ … 6★ : c'est le côté données qui la fixe). Ici, c'est la FRÉQUENCE de tirage, réglée côté code.
 *
 * Un booster = 5 cartes : 4 emplacements normaux (`SLOT_WEIGHTS`) + 1 emplacement garanti rare ou mieux
 * (`GUARANTEED_WEIGHTS`), toujours révélé en dernier. On tire d'abord l'étoile, puis une carte au hasard parmi celles
 * du pool qui portent cette étoile.
 *
 * Objectifs de dopamine (calculés par `packOdds()`, cf. LAB_NOTES) :
 *  - chaque booster a son moment : au moins une rare (3★) garantie ;
 *  - une épique (4★) ou mieux dans ~2 boosters sur 5 ;
 *  - une légendaire (5★) ou mieux dans ~1 booster sur 8 ;
 *  - une mythique (6★) dans ~1 booster sur 40 ;
 *  - la carte SECRÈTE (Bébou) : tirage à part, 1 / nb total de cartes par bébou pack (packRules.ts).
 */
export type StarRarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const STAR_RARITIES: readonly StarRarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** Emplacements 1 à 4 (en %, total 100). */
export const SLOT_WEIGHTS: Record<StarRarityId, number> = {
  common: 58.25,
  uncommon: 27,
  rare: 10,
  epic: 3.5,
  legendary: 1,
  mythic: 0.25,
};

/** Emplacement 5, garanti rare ou mieux (en %, total 100). */
export const GUARANTEED_WEIGHTS: Record<StarRarityId, number> = {
  common: 0,
  uncommon: 0,
  rare: 71.5,
  epic: 21,
  legendary: 6,
  mythic: 1.5,
};

/** Tirage pondéré d'une étoile. */
export function rollStar(weights: Record<StarRarityId, number>, rand: () => number = Math.random): StarRarityId {
  let total = 0;
  for (const r of STAR_RARITIES) total += weights[r];
  let x = rand() * total;
  for (const r of STAR_RARITIES) {
    if (weights[r] <= 0) continue;
    x -= weights[r];
    if (x < 0) return r;
  }
  // arrondi flottant : la dernière étoile de poids non nul
  for (let i = STAR_RARITIES.length - 1; i >= 0; i--) if (weights[STAR_RARITIES[i]] > 0) return STAR_RARITIES[i];
  return 'common';
}

/**
 * Probabilités par booster de 5 cartes (pour la doc et les tests) : chance d'avoir au moins une carte de
 * cette étoile OU MIEUX dans le booster.
 */
export function packOdds(slots = 4): Record<StarRarityId, number> {
  const out = {} as Record<StarRarityId, number>;
  const sum = (w: Record<StarRarityId, number>, from: number) => STAR_RARITIES.slice(from).reduce((a, r) => a + w[r], 0) / 100;
  STAR_RARITIES.forEach((r, i) => {
    const pNormal = sum(SLOT_WEIGHTS, i);
    const pGuar = sum(GUARANTEED_WEIGHTS, i);
    out[r] = 1 - Math.pow(1 - pNormal, slots) * (1 - pGuar);
  });
  return out;
}
