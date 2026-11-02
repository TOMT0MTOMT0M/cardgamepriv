/**
 * Pity 6★ — données pures, AUCUN import : partagé par le serveur Convex (convex/packs.ts), le mode démo et l'interface.
 *
 * Règle du groupe (3 nov.) : **200 boosters consécutifs sans 6★ → le 201e contient un 6★ sûr**. Le compteur repart à
 * zéro dès qu'une Mythique (ou une Secrète, encore au-dessus) tombe, forcée ou non. Calibrage : 200 boosters secs sous
 * « 1 sur 40 » ≈ 0,66 % des joueurs — la pity ne sert qu'aux vrais malchanceux, elle ne change pas les odds affichées.
 * Le compteur est global au joueur (tous boosters confondus) : il avance au TIRAGE (preparePack), pas à la révélation.
 */
export const PITY_LIMIT = 200;

/** Vrai si le prochain booster doit contenir un 6★ (compteur = boosters secs d'affilée AVANT ce booster). */
export const pityForces = (count: number): boolean => count >= PITY_LIMIT - 1;

/** Boosters restants avant le 6★ garanti (0 = le prochain). */
export const pityLeft = (count: number): number => Math.max(0, PITY_LIMIT - 1 - count);

/** Compteur après un booster : remis à zéro si une 6★ (ou mieux) est tombée, sinon +1. */
export const pityAfter = (count: number, rarities: string[]): number =>
  rarities.some((r) => r === 'mythic' || r === 'secret') ? 0 : count + 1;
