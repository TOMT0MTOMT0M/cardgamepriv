/**
 * ENCHÈRES AU MARCHÉ (V3, liste QOL validée par Hugo le 26/11 ; spécification de Tom) — règles pures, partagées par le
 * serveur (convex/auctions.ts), le mode démo et l'interface (src/game/views/auctions.ts).
 *  - une enchère = UNE carte, mise à prix ≥ sa valeur de Forge (CARD_VALUE), plafond = celui du marché (10×) ;
 *  - durée au choix 1 / 2 / 3 jours : clôture à 21 h (heure de Paris) le jour d'échéance = date de mise en vente
 *    (à Paris) + 1, 2 ou 3 jours. Une tâche programmée (convex/crons.ts) passe toutes les heures et clôt les échues ;
 *  - surenchère minimale : +5 % de l'offre en tête, au moins +1 pièce ;
 *  - les pièces de l'enchérisseur sont prises à l'offre, rendues aussitôt s'il est dépassé ;
 *  - la carte quitte la collection du vendeur à la mise en vente (comme une vente à prix fixe) et occupe une des
 *    MARKET_MAX_OPEN places ; retrait possible tant que personne n'a fait d'offre.
 */
import { fe } from './errors';
import { CARD_VALUE } from './economy';
import { marketMax } from './market';
import type { RarityId } from './rarity';

/** durées proposées, en jours (affichées « 24 h / 48 h / 72 h ») */
export const AUCTION_DAYS = [1, 2, 3] as const;
export type AuctionDays = (typeof AUCTION_DAYS)[number];
/** heure de clôture, à Paris */
export const AUCTION_CLOSE_HOUR = 21;
/** surenchère minimale : +5 % */
export const AUCTION_STEP = 0.05;

/** mise à prix minimale = valeur de Forge de la carte (à rendement plein) */
export const auctionMinStart = (r: RarityId | string) => Math.max(1, CARD_VALUE[r as RarityId] ?? 0);
/** plafond d'une offre = plafond du marché */
export const auctionMax = (r: RarityId | string) => marketMax(r);
/** offre minimale suivante : la mise à prix s'il n'y a pas d'offre, sinon +5 % (au moins +1) */
export const auctionNextMin = (a: { startPrice: number; bid?: number }) =>
  a.bid === undefined ? a.startPrice : Math.max(a.bid + 1, Math.ceil(a.bid * (1 + AUCTION_STEP)));
/** le plafond est atteint : plus aucune surenchère possible */
export const auctionCapped = (a: { startPrice: number; bid?: number; rarity: RarityId | string }) => auctionNextMin(a) > auctionMax(a.rarity);

let ymdFmt: Intl.DateTimeFormat | undefined;
let hourFmt: Intl.DateTimeFormat | undefined;
/** date à Paris : [année, mois 1-12, jour] */
function parisYmd(t: number): [number, number, number] {
  ymdFmt ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = ymdFmt.format(new Date(t)).split('-').map(Number);
  return [y, m, d];
}
const parisHour = (t: number) => {
  hourFmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
  return Number(hourFmt.format(new Date(t))) % 24;
};

/**
 * Instant de clôture : 21 h à Paris, `days` jours (calendrier de Paris) après le jour de `from`. Heure d'été gérée :
 * Paris = UTC+1 ou UTC+2, on prend celui des deux qui tombe à 21 h.
 */
export function auctionEndsAt(from: number, days: number): number {
  const [y, m, d] = parisYmd(from);
  for (const off of [1, 2]) {
    const t = Date.UTC(y, m - 1, d + days, AUCTION_CLOSE_HOUR - off);
    if (parisHour(t) === AUCTION_CLOSE_HOUR) return t;
  }
  return Date.UTC(y, m - 1, d + days, AUCTION_CLOSE_HOUR - 1);
}

/** Message d'erreur si la mise aux enchères est invalide (null sinon). */
export function auctionProblem(r: RarityId | string, startPrice: number, days: number): string | null {
  if (r === 'secret') return fe('market.7');
  if (!(r in CARD_VALUE)) return fe('market.8');
  if (!(AUCTION_DAYS as readonly number[]).includes(days)) return fe('auctions.1');
  if (!Number.isInteger(startPrice) || startPrice < auctionMinStart(r)) return fe('auctions.2', { p0: auctionMinStart(r) });
  if (startPrice > auctionMax(r)) return fe('market.10', { p0: auctionMax(r) });
  return null;
}
