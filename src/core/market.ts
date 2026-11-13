/**
 * MARCHÉ (retours Hugo 10/11) — règles pures, partagées par le serveur (convex/market.ts), le mode démo et l'interface.
 *  - une annonce = UNE carte à PRIX FIXE en pièces ; pas d'enchères ; le premier qui achète l'a ;
 *  - la carte quitte la collection du vendeur à la mise en vente (elle revient s'il retire l'annonce) ;
 *  - prix entre 1 pièce et 10× la valeur de la carte (table de valeur du jeu) : assez pour marchander, pas assez pour
 *    faire passer des pièces d'un compte à l'autre ;
 *  - jamais de Bébou (secrètes) ; 10 annonces ouvertes au plus par joueur.
 * (La règle d'or « les pièces n'achètent jamais de cartes » de economy.ts est levée pour le marché, décision de Tom
 * et Hugo du 10/11 : seulement entre joueurs, jamais de boutique de cartes.)
 */
import { fe } from './errors';
import { CARD_VALUE } from './economy';
import type { RarityId } from './rarity';

export const MARKET_MAX_OPEN = 10;
export const MARKET_PRICE_MULT = 10;

/** prix conseillé (valeur de la carte) */
export const marketSuggested = (r: RarityId | string) => CARD_VALUE[r as RarityId] ?? 0;
/** prix maximal */
export const marketMax = (r: RarityId | string) => Math.max(1, marketSuggested(r) * MARKET_PRICE_MULT);

/** Message d'erreur si la mise en vente est invalide (null sinon). */
export function marketProblem(r: RarityId | string, price: number): string | null {
  if (r === 'secret') return fe('market.7');
  if (!(r in CARD_VALUE)) return fe('market.8');
  if (!Number.isInteger(price) || price < 1) return fe('market.9');
  if (price > marketMax(r)) return fe('market.10', { p0: marketMax(r) });
  return null;
}
