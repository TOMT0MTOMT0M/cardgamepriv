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
/** (v2.1.41, validé par Tom le 27/11) prix conseillé = 1,5× la valeur de Forge, arrondi à l'unité */
export const MARKET_ADVISED_MULT = 1.5;
/** « qui veut ces cartes ? » (Forge → vente) : au plus tant de cartes différentes par question (= une fournée de la Forge) */
export const WANTED_CARDS_MAX = 200;

/** valeur de la carte (= Forge à rendement plein) : référence des étiquettes « au prix » / « +N % » et du plafond */
export const marketSuggested = (r: RarityId | string) => CARD_VALUE[r as RarityId] ?? 0;
/** (v2.1.41) prix conseillé à la mise en vente : 1★ 8 · 2★ 23 · 3★ 60 · 4★ 150 · 5★ 450 · 6★ 1 500 */
export const marketAdvised = (r: RarityId | string) => Math.round(marketSuggested(r) * MARKET_ADVISED_MULT);
/** prix maximal */
export const marketMax = (r: RarityId | string) => Math.max(1, marketSuggested(r) * MARKET_PRICE_MULT);

/**
 * (v2.1.41) « Forge → vente » : parmi les cartes choisies pour la Forge, ce qui part au marché. Par carte, autant
 * d'exemplaires que de joueurs qui la veulent (au plus la quantité choisie) ; les plus chères d'abord (décision de Tom),
 * jusqu'aux places libres (10 − ventes ouvertes). `rest` = ce qui est forgé. Partagé par la Forge et la démo.
 */
export function quickSellPlan<T extends { cardId: string; rarity: RarityId; count: number }>(
  items: readonly T[],
  wanted: ReadonlyMap<string, readonly string[]>,
  room: number,
): { sell: T[]; rest: T[]; wantedN: number; players: number; coins: number } {
  const want = items.filter((it) => (wanted.get(it.cardId)?.length ?? 0) > 0 && it.rarity !== 'secret');
  const wantedN = want.reduce((a, it) => a + Math.min(it.count, wanted.get(it.cardId)!.length), 0);
  const order = [...want].sort((a, b) => marketSuggested(b.rarity) - marketSuggested(a.rarity) || a.cardId.localeCompare(b.cardId));
  const sell: T[] = [];
  let left = Math.max(0, room);
  for (const it of order) {
    if (left <= 0) break;
    const k = Math.min(it.count, wanted.get(it.cardId)!.length, left);
    sell.push({ ...it, count: k });
    left -= k;
  }
  const sold = new Map(sell.map((s) => [s.cardId, s.count]));
  const rest = items.map((it) => ({ ...it, count: it.count - (sold.get(it.cardId) ?? 0) })).filter((it) => it.count > 0);
  const players = new Set(sell.flatMap((s) => wanted.get(s.cardId) ?? [])).size;
  return { sell, rest, wantedN, players, coins: sell.reduce((a, s) => a + marketAdvised(s.rarity) * s.count, 0) };
}

/** Message d'erreur si la mise en vente est invalide (null sinon). */
export function marketProblem(r: RarityId | string, price: number): string | null {
  if (r === 'secret') return fe('market.7');
  if (!(r in CARD_VALUE)) return fe('market.8');
  if (!Number.isInteger(price) || price < 1) return fe('market.9');
  if (price > marketMax(r)) return fe('market.10', { p0: marketMax(r) });
  return null;
}
