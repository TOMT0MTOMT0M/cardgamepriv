import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { addCoins, giveCards, recordFlow, takeCards } from './econLib';
import { MARKET_MAX_OPEN } from '../src/core/market';
import { CARD_VALUE } from '../src/core/economy';
import { auctionEndAfterBid, auctionEndsAt, auctionMax, auctionNextMin, auctionProblem } from '../src/core/auctions';
import { fm } from '../src/core/msgs';
import { notify } from './push';
import { alertWishers } from './market';

/**
 * ENCHÈRES AU MARCHÉ (V3, liste QOL validée par Hugo le 26/11 ; règles : src/core/auctions.ts).
 *  - Séquestre de la carte comme une vente à prix fixe (convex/market.ts) : elle quitte l'inventaire à la mise aux
 *    enchères (takeCards : exemplaires libres seulement) ; ni forgée, ni échangée, ni vendue ailleurs pendant l'enchère.
 *  - Pièces bloquées : l'offre en tête est débitée à l'offre (journal « pièces bloquées »), rendue aussitôt quand elle
 *    est dépassée (+ notification). Une offre = une mutation atomique : deux offres concurrentes ne passent jamais toutes
 *    les deux (Convex rejoue la seconde, qui voit alors la première et doit surenchérir).
 *  - Clôture : `closeTick`, toutes les heures (convex/crons.ts) — les enchères échues (21 h Paris le jour d'échéance)
 *    sont closes : carte → gagnant, pièces → vendeur (pas de frais, comme le marché) ; sans offre : carte rendue.
 *    Idempotente (statut relu), par lots de CLOSE_BATCH.
 *  - (28/11, décision de Tom) Prolongation : une offre dans les 5 dernières minutes repousse la fin à « offre + 5 min »
 *    (autant de fois que nécessaire) ; la clôture est alors programmée à la nouvelle fin (`closeAt`, idempotente).
 *  - Coût : le tableau (abonné, seulement quand la pastille « Enchères » est à l'écran) ne lit QUE la table `auctions`
 *    (noms recopiés à l'écriture), au plus BOARD_MAX lignes + mes résultats récents.
 */

const nameOf = (id: string) => catalogCard(id)?.name ?? id;
const BOARD_MAX = 200;
const RECENT_MAX = 10;
const CLOSE_BATCH = 50;
const URL = '#/echanges/chercher';

/** Enchères ouvertes d'un joueur (≤ MARKET_MAX_OPEN + 1 lues) : elles occupent des places de vente du marché. */
export const openAuctionsCount = async (ctx: QueryCtx | MutationCtx, userId: Id<'users'>) =>
  (await ctx.db.query('auctions').withIndex('by_seller_status', (q) => q.eq('sellerId', userId).eq('status', 'open')).take(MARKET_MAX_OPEN + 1)).length;

/** Places de vente occupées : ventes à prix fixe ouvertes + enchères ouvertes. */
export const sellSlotsUsed = async (ctx: QueryCtx | MutationCtx, userId: Id<'users'>) =>
  (await ctx.db.query('market').withIndex('by_seller_status', (q) => q.eq('sellerId', userId).eq('status', 'open')).take(MARKET_MAX_OPEN + 1)).length + (await openAuctionsCount(ctx, userId));

const view = (a: Doc<'auctions'>, meId: Id<'users'> | null) => ({
  id: a._id,
  sellerId: a.sellerId,
  sellerName: a.sellerName,
  sellerAvatar: a.sellerAvatar,
  cardId: a.cardId,
  rarity: a.rarity,
  mintNumber: a.mintNumber,
  startPrice: a.startPrice,
  bid: a.bid,
  bids: a.bids ?? 0,
  bidderName: a.bidderName,
  /** je suis en tête (ou : j'ai gagné) */
  lead: !!meId && a.bidderId === meId,
  status: a.status,
  createdAt: a.createdAt,
  endsAt: a.endsAt,
  extended: a.extended ?? false,
  resolvedAt: a.resolvedAt,
});

/** Les enchères ouvertes (la plus proche de la fin d'abord) + mes résultats des 7 derniers jours. */
export const board = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const meId = await getUserIdByToken(ctx, sessionToken);
    const open = await ctx.db.query('auctions').withIndex('by_status_ends', (q) => q.eq('status', 'open')).take(BOARD_MAX);
    let recent: Doc<'auctions'>[] = [];
    if (meId) {
      const since = Date.now() - 7 * 86400_000;
      const mine = async (status: 'sold' | 'unsold', by: 'seller' | 'bidder') =>
        (by === 'seller'
          ? await ctx.db.query('auctions').withIndex('by_seller_status', (q) => q.eq('sellerId', meId).eq('status', status)).order('desc').take(RECENT_MAX)
          : await ctx.db.query('auctions').withIndex('by_bidder_status', (q) => q.eq('bidderId', meId).eq('status', status)).order('desc').take(RECENT_MAX)
        ).filter((a) => (a.resolvedAt ?? 0) >= since);
      recent = [...(await mine('sold', 'seller')), ...(await mine('unsold', 'seller')), ...(await mine('sold', 'bidder'))].sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
    }
    return { open: open.map((a) => view(a, meId)), recent: recent.map((a) => view(a, meId)) };
  },
});

/** Met UNE carte aux enchères. Occupe une des MARKET_MAX_OPEN places de vente. */
export const create = mutation({
  args: { sessionToken: v.string(), cardId: v.string(), rarity: rarityValidator, startPrice: v.number(), days: v.number() },
  handler: async (ctx, { sessionToken, cardId, rarity, startPrice, days }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!catalogCard(cardId)) throw new ConvexError(fe('market.1'));
    const problem = auctionProblem(rarity, startPrice, days);
    if (problem) throw new ConvexError(problem);
    if ((await sellSlotsUsed(ctx, me._id)) >= MARKET_MAX_OPEN) throw new ConvexError(fe('market.2', { p0: MARKET_MAX_OPEN }));
    const [taken] = await takeCards(ctx, me._id, [{ cardId, rarity, count: 1 }]);
    const now = Date.now();
    const id = await ctx.db.insert('auctions', {
      sellerId: me._id,
      sellerName: me.displayName,
      ...(me.avatarUrl ? { sellerAvatar: me.avatarUrl } : {}),
      cardId,
      rarity,
      mintNumber: taken.mintNumber,
      startPrice,
      status: 'open',
      createdAt: now,
      endsAt: auctionEndsAt(now, days),
    });
    // les joueurs qui veulent la carte sont prévenus (alerte acheteur du marché : 1 par vendeur et par heure)
    const notified = await alertWishers(ctx, me, [{ cardId, rarity, price: startPrice }], { auction: true });
    return { id, notified };
  },
});

/** Retrait : seulement tant que personne n'a fait d'offre. La carte revient. */
export const cancel = mutation({
  args: { sessionToken: v.string(), id: v.id('auctions') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireUser(ctx, sessionToken);
    const a = await ctx.db.get(id);
    if (!a || a.sellerId !== me._id) throw new ConvexError(fe('auctions.3'));
    if (a.status !== 'open') throw new ConvexError(fe('auctions.4'));
    if (a.bidderId) throw new ConvexError(fe('auctions.9'));
    await ctx.db.patch(id, { status: 'cancelled', resolvedAt: Date.now() });
    await giveCards(ctx, me._id, [{ cardId: a.cardId, rarity: a.rarity, mintNumber: a.mintNumber }]);
  },
});

/**
 * Offre : `amount` pièces, au moins l'offre minimale suivante (src/core/auctions.ts), au plus le plafond. Les pièces sont
 * prises tout de suite ; l'enchérisseur dépassé est remboursé et prévenu.
 */
export const bid = mutation({
  args: { sessionToken: v.string(), id: v.id('auctions'), amount: v.number() },
  handler: async (ctx, { sessionToken, id, amount }) => {
    const me = await requireUser(ctx, sessionToken);
    const a = await ctx.db.get(id);
    if (!a) throw new ConvexError(fe('auctions.3'));
    const now = Date.now();
    if (a.status !== 'open' || a.endsAt <= now) throw new ConvexError(fe('auctions.4'));
    if (a.sellerId === me._id) throw new ConvexError(fe('auctions.5'));
    if (a.bidderId === me._id) throw new ConvexError(fe('auctions.8'));
    const min = auctionNextMin(a);
    const max = auctionMax(a.rarity);
    if (!Number.isInteger(amount) || amount < min) throw new ConvexError(fe('auctions.6', { p0: min }));
    if (amount > max) throw new ConvexError(fe('auctions.7', { p0: max }));
    const card = { card: nameOf(a.cardId), cardId: a.cardId };
    // d'abord mes pièces (refus « pas assez de pièces » avant toute autre écriture), puis le remboursement du dépassé
    await addCoins(ctx, me._id, -amount, 'auction-bid', fm('c.auctionBid', card));
    if (a.bidderId && a.bid) {
      await addCoins(ctx, a.bidderId, a.bid, 'auction-refund', fm('c.auctionRefund', card));
      await notify(ctx, a.bidderId, { kind: 'trade', title: fm('n.auctionOutbid', card), body: fm('n.auctionOutbidB', { name: me.displayName, coins: amount }), url: URL, tag: `auction-${a._id}` });
    }
    // (28/11) anti-dernière-minute : une offre dans les 5 dernières minutes repousse la fin à « maintenant + 5 min » ; la
    // tâche horaire ne repasse qu'à l'heure suivante → clôture programmée à la nouvelle fin (une par prolongation)
    const endsAt = auctionEndAfterBid(a.endsAt, now);
    await ctx.db.patch(id, { bid: amount, bidderId: me._id, bidderName: me.displayName, bids: (a.bids ?? 0) + 1, ...(endsAt !== a.endsAt ? { endsAt, extended: true } : {}) });
    if (endsAt !== a.endsAt) await ctx.scheduler.runAt(endsAt, internal.auctions.closeAt, { id });
    return { bid: amount, endsAt };
  },
});

/** Clôt UNE enchère échue. Rien si elle est déjà close ou pas encore échue (rejouable sans effet). */
async function closeOne(ctx: MutationCtx, a: Doc<'auctions'>, now: number): Promise<boolean> {
  const cur = await ctx.db.get(a._id);
  if (!cur || cur.status !== 'open' || cur.endsAt > now) return false;
  const card = { card: nameOf(cur.cardId), cardId: cur.cardId };
  const tag = `auction-${cur._id}`;
  if (cur.bidderId && cur.bid) {
    await ctx.db.patch(cur._id, { status: 'sold', resolvedAt: now });
    await addCoins(ctx, cur.sellerId, cur.bid, 'auction-sell', fm('c.auctionSell', card));
    await giveCards(ctx, cur.bidderId, [{ cardId: cur.cardId, rarity: cur.rarity, mintNumber: cur.mintNumber }]);
    // anti-abus : les deux sens du flux de valeur (comme un achat au marché)
    await recordFlow(ctx, cur.sellerId, cur.bidderId, CARD_VALUE[cur.rarity] ?? 0, 'auction');
    await recordFlow(ctx, cur.bidderId, cur.sellerId, cur.bid, 'auction');
    await notify(ctx, cur.bidderId, { kind: 'trade', title: fm('n.auctionWon', card), body: fm('n.auctionWonB', { coins: cur.bid }), url: URL, tag });
    await notify(ctx, cur.sellerId, { kind: 'trade', title: fm('n.auctionSold', card), body: fm('n.auctionSoldB', { name: cur.bidderName ?? '?', coins: cur.bid }), url: URL, tag });
  } else {
    await ctx.db.patch(cur._id, { status: 'unsold', resolvedAt: now });
    await giveCards(ctx, cur.sellerId, [{ cardId: cur.cardId, rarity: cur.rarity, mintNumber: cur.mintNumber }]);
    await notify(ctx, cur.sellerId, { kind: 'trade', title: fm('n.auctionUnsold', card), body: fm('n.auctionUnsoldB'), url: URL, tag });
  }
  return true;
}

/**
 * (28/11) Clôture programmée d'une enchère prolongée, à sa nouvelle fin. Sans effet si elle a été reprolongée entre-temps
 * (la programmation suivante la clôra) ou déjà close (par la tâche horaire, filet).
 */
export const closeAt = internalMutation({
  args: { id: v.id('auctions') },
  handler: async (ctx, { id }) => {
    const a = await ctx.db.get(id);
    return { closed: !!a && (await closeOne(ctx, a, Date.now())) };
  },
});

/**
 * Tâche programmée (toutes les heures, convex/crons.ts) : clôt les enchères échues. Hors de 21 h (Paris), l'index ne
 * renvoie rien : 0 document lu. Plus de CLOSE_BATCH échues : se relance aussitôt pour la suite.
 */
export const closeTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db.query('auctions').withIndex('by_status_ends', (q) => q.eq('status', 'open').lte('endsAt', now)).take(CLOSE_BATCH);
    let closed = 0;
    for (const a of due) if (await closeOne(ctx, a, now)) closed++;
    if (due.length === CLOSE_BATCH) await ctx.scheduler.runAfter(0, internal.auctions.closeTick, {});
    return { closed };
  },
});
