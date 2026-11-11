/**
 * REFONTE DES ÉCHANGES (11/11, « un véritable système de génie ») — règles pures, partagées par le serveur
 * (convex/deals.ts), le mode démo (game/localBackend.ts) et l'interface.
 *  - Mes DOUBLONS sont proposables par défaut : on garde toujours un exemplaire, le reste peut partir contre une carte
 *    de même étoile qui me manque. Jamais une Bébou (secrète).
 *  - Une carte PROTÉGÉE (users.tradeProtected) ou dans mes ENVIES (je veux plus d'exemplaires) n'est jamais proposée.
 *  - Les exemplaires déjà engagés (échange en attente, annonce, offre) ne comptent pas.
 *  - Un ÉCHANGE PRÊT = une carte de mes envies chez un joueur qui en a un doublon proposable ⇄ un de mes doublons
 *    proposables de même étoile qui lui manque (en priorité une de SES envies).
 */
import type { RarityId } from './rarity';

/** échanges prêts renvoyés au plus (zone « Pour toi ») */
export const DEALS_MAX = 12;
/** envies examinées au plus (chacune = une lecture d'index) */
export const DEALS_WISH_SCAN = 60;
/** propriétaires essayés par envie */
export const DEALS_OWNERS_TRY = 3;
/** contreparties vérifiées (« lui manque-t-elle ? ») par propriétaire */
export const DEAL_LACK_CHECKS = 8;
/** autres contreparties possibles renvoyées avec un échange (« modifier ») */
export const DEAL_ALTS = 5;
/** « Ils cherchent tes doublons » : au plus */
export const THEY_WANT_MAX = 8;
/** choix proposés au destinataire (« Choisir autre chose ») */
export const PICK_MAX = 24;
/** cartes protégées au plus (champ du joueur) */
export const PROTECT_MAX = 500;

export interface DealCard {
  cardId: string;
  rarity: RarityId;
}
export interface TradeGuard {
  /** cartes protégées (ids) */
  protected?: readonly string[];
  /** envies (ids) : je veux plus d'exemplaires, je ne donne pas les miens */
  wishlist?: readonly string[];
}

/** Pourquoi une carte n'est pas proposée (null : elle l'est si j'en ai un doublon libre). */
export function guardReason(cardId: string, rarity: RarityId | string, g: TradeGuard): 'secret' | 'protegee' | 'envie' | null {
  if (rarity === 'secret') return 'secret';
  if (g.protected?.includes(cardId)) return 'protegee';
  if (g.wishlist?.includes(cardId)) return 'envie';
  return null;
}

/** Exemplaires proposables d'une carte : on garde toujours un exemplaire, hors exemplaires engagés et cartes gardées. */
export function proposable(row: { cardId: string; rarity: RarityId | string; count: number }, locked: number, g: TradeGuard): number {
  if (guardReason(row.cardId, row.rarity, g)) return 0;
  return Math.max(0, row.count - 1 - Math.max(0, locked));
}

/** Contreparties classées pour un joueur : d'abord ce qu'il cherche (envies), puis le reste (ordre d'origine). */
export function rankGives<T extends DealCard>(cands: readonly T[], theirWish: ReadonlySet<string>): T[] {
  return [...cands].sort((a, b) => Number(theirWish.has(b.cardId)) - Number(theirWish.has(a.cardId)));
}

/** Échange prêt (zone « Pour toi ») : je reçois `get` de `userId`, je donne `give` (modifiable parmi `alts`). */
export interface Deal {
  userId: string;
  name: string;
  avatarUrl?: string;
  online: boolean;
  get: DealCard;
  give: DealCard;
  /** autres cartes que je peux donner à la place (ids, même étoile, qui lui manquent) */
  alts: string[];
  /** `give` est dans ses envies */
  theyWish: boolean;
}
/** Un joueur cherche un de mes doublons proposables (et ne l'a pas). */
export interface TheyWant {
  userId: string;
  name: string;
  avatarUrl?: string;
  online: boolean;
  card: DealCard;
}
export interface ForYou {
  deals: Deal[];
  theyWant: TheyWant[];
  /** documents lus par le serveur pour ce calcul (mesure de coût) */
  reads: number;
  at: number;
}

/** « Chez les joueurs » sous une carte : qui l'a, qui la vend et à quel prix, qui la veut. */
export interface CardPanel {
  owners: Array<{ userId: string; name: string; avatarUrl?: string; online: boolean; count: number; dup: boolean }>;
  sellers: Array<{ id: string; sellerId: string; name: string; price: number; mintNumber: number }>;
  wanters: Array<{ userId: string; name: string; avatarUrl?: string; online: boolean }>;
  /** je l'ai protégée */
  protected: boolean;
  reads: number;
}
export const EMPTY_PANEL: CardPanel = { owners: [], sellers: [], wanters: [], protected: false, reads: 0 };

/** Contrepartie que le destinataire peut choisir à la place (« Choisir autre chose »). */
export interface PickOption extends DealCard {
  /** il ne l'a pas encore */
  lacking: boolean;
}
