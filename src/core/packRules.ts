/**
 * Règles des packs — données pures, AUCUN import : partageable tel quel avec convex/ (comme sets/pokemon151.ts).
 *
 * Deux sortes de packs :
 *  - `theme` : le booster d'un thème (« POKEMON », …) — uniquement les cartes de ce thème, jamais de Bébou ;
 *  - `bebou` : le « bébou pack » = le pack de base qui contient TOUTES les cartes de TOUS les thèmes disponibles.
 *    C'est le SEUL endroit où une carte Bébou (rareté secrète) peut tomber.
 *
 * Règle du groupe (2 nov.) : un bébou pack contient une carte Bébou avec une probabilité de **1 / nombre total de
 * cartes du jeu, PAR PACK** (pas par carte) — 10 000 cartes → 1 sur 10 000. Cette chance est calculée dans
 * sets/themes.ts (`BEBOU_SECRET_CHANCE`) et passée ici : elle suit toute seule chaque ajout de cartes.
 * Le tirage est fait une fois par pack, AVANT et INDÉPENDAMMENT du tirage des autres cartes.
 */
export type PackKind = 'theme' | 'bebou';

/** Cartes par pack. */
export const PACK_SIZE = 5;

export interface PackPlan {
  size: number;
  /**
   * Emplacement (0..size-1) qui devient une carte Bébou, ou `null`. Toujours la DERNIÈRE carte : c'est celle
   * qu'on révèle en dernier (la plus forte en dopamine) et l'emplacement « garanti peu commune + » qu'elle remplace.
   */
  bebouSlot: number | null;
}

/** Plan d'un pack : un seul tirage par pack décide s'il contient une carte secrète (Bébou ou Merveille du Monde). */
export function planPack(kind: PackKind, secretChance: number, rand: () => number = Math.random): PackPlan {
  // (un tirage est toujours consommé, même à chance nulle — Bébous verrouillées : la suite du tirage ne bouge pas)
  const roll = rand();
  const isSecret = secretChance > 0 && roll < secretChance;
  return { size: PACK_SIZE, bebouSlot: isSecret ? PACK_SIZE - 1 : null };
}
