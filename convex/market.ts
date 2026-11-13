import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { addCoins, giveCards, recordFlow, takeCards } from './econLib';
import { MARKET_MAX_OPEN, marketProblem } from '../src/core/market';
import { CARD_VALUE } from '../src/core/economy';
import { presenceOf } from './presence';
import { fm } from '../src/core/msgs';

/**
 * MARCHÉ (retours Hugo 10/11) : des cartes à prix fixe, en pièces, entre joueurs. Règles : src/core/market.ts.
 * Séquestre : la carte quitte l'inventaire à la mise en vente (takeCards : seulement des exemplaires libres, pas engagés
 * ailleurs), revient au retrait (giveCards), part chez l'acheteur à l'achat. Achat = une seule mutation atomique : le
 * premier qui achète l'a, le second reçoit « déjà vendue ».
 */

const nameOf = (id: string) => catalogCard(id)?.name ?? id;
/**
 * (audit 12/11, S13 / A7-01) le vendeur : une lecture par vendeur et par appel (avant : une par annonce, jusqu'à 300),
 * et sa carte publique (convex/presence.ts) plutôt que son document — le tableau du marché, suivi en continu, ne
 * repart plus aux écritures privées des vendeurs.
 */
type Sellers = Map<string, Promise<{ displayName: string; avatarUrl?: string } | null>>;
const sellerOf = (ctx: QueryCtx, cache: Sellers, id: Id<'users'>) => {
  let p = cache.get(id);
  if (!p) cache.set(id, (p = (async (): Promise<{ displayName: string; avatarUrl?: string } | null> => (await presenceOf(ctx, id)) ?? (await ctx.db.get(id)))()));
  return p;
};
const view = async (ctx: QueryCtx, m: Doc<'market'>, cache: Sellers = new Map()) => {
  const s = await sellerOf(ctx, cache, m.sellerId);
  return { id: m._id, sellerId: m.sellerId, sellerName: s?.displayName ?? '?', sellerAvatar: s?.avatarUrl, cardId: m.cardId, rarity: m.rarity, mintNumber: m.mintNumber, price: m.price, status: m.status, createdAt: m.createdAt, resolvedAt: m.resolvedAt, buyerId: m.buyerId };
};

/** Le marché : annonces ouvertes (les plus récentes d'abord) + mes ventes / achats récents. */
export const board = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const meId = await getUserIdByToken(ctx, sessionToken);
    const me = meId ? { _id: meId } : null;
    const open = await ctx.db.query('market').withIndex('by_status_created', (q) => q.eq('status', 'open')).order('desc').take(300);
    const recent = Date.now() - 7 * 86400_000;
    const sold = me ? (await ctx.db.query('market').withIndex('by_seller_status', (q) => q.eq('sellerId', me._id).eq('status', 'sold')).order('desc').take(10)).filter((m) => (m.resolvedAt ?? 0) >= recent) : [];
    const bought = me ? await ctx.db.query('market').withIndex('by_buyer', (q) => q.eq('buyerId', me._id).gte('resolvedAt', recent)).order('desc').take(10) : [];
    const sellers: Sellers = new Map();
    return {
      open: await Promise.all(open.map((m) => view(ctx, m, sellers))),
      sold: await Promise.all(sold.map((m) => view(ctx, m, sellers))),
      bought: await Promise.all(bought.map((m) => view(ctx, m, sellers))),
    };
  },
});

export const sell = mutation({
  args: { sessionToken: v.string(), cardId: v.string(), rarity: rarityValidator, price: v.number() },
  handler: async (ctx, { sessionToken, cardId, rarity, price }) => {
    const me = await requireUser(ctx, sessionToken);
    const card = catalogCard(cardId);
    if (!card) throw new ConvexError(fe('market.1'));
    const problem = marketProblem(rarity, price);
    if (problem) throw new ConvexError(problem);
    const mine = await ctx.db.query('market').withIndex('by_seller_status', (q) => q.eq('sellerId', me._id).eq('status', 'open')).collect();
    if (mine.length >= MARKET_MAX_OPEN) throw new ConvexError(fe('market.2', { p0: MARKET_MAX_OPEN }));
    const [taken] = await takeCards(ctx, me._id, [{ cardId, rarity, count: 1 }]);
    await ctx.db.insert('market', { sellerId: me._id, cardId, rarity, mintNumber: taken.mintNumber, price, status: 'open', createdAt: Date.now() });
  },
});

export const cancel = mutation({
  args: { sessionToken: v.string(), id: v.id('market') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireUser(ctx, sessionToken);
    const m = await ctx.db.get(id);
    if (!m || m.sellerId !== me._id) throw new ConvexError(fe('market.11'));
    if (m.status !== 'open') throw new ConvexError(fe('market.3'));
    await ctx.db.patch(id, { status: 'cancelled', resolvedAt: Date.now() });
    await giveCards(ctx, me._id, [{ cardId: m.cardId, rarity: m.rarity, mintNumber: m.mintNumber }]);
  },
});

export const buy = mutation({
  args: { sessionToken: v.string(), id: v.id('market'), price: v.number() },
  handler: async (ctx, { sessionToken, id, price }) => {
    const me = await requireUser(ctx, sessionToken);
    const m = await ctx.db.get(id);
    if (!m || m.status !== 'open') throw new ConvexError(fe('market.4'));
    if (m.sellerId === me._id) throw new ConvexError(fe('market.5'));
    // le prix affiché est celui payé : une annonce modifiée entre-temps n'est jamais achetée à l'aveugle
    if (m.price !== price) throw new ConvexError(fe('market.6'));
    const now = Date.now();
    await addCoins(ctx, me._id, -m.price, 'market-buy', fm('c.marketBuy', { card: nameOf(m.cardId), cardId: m.cardId }));
    await addCoins(ctx, m.sellerId, m.price, 'market-sell', fm('c.marketSell', { card: nameOf(m.cardId), cardId: m.cardId }));
    await ctx.db.patch(id, { status: 'sold', buyerId: me._id, resolvedAt: now });
    await giveCards(ctx, me._id, [{ cardId: m.cardId, rarity: m.rarity, mintNumber: m.mintNumber }]);
    // anti-abus : les deux sens du flux de valeur (comme un échange)
    await recordFlow(ctx, m.sellerId, me._id, CARD_VALUE[m.rarity] ?? 0, 'market');
    await recordFlow(ctx, me._id, m.sellerId, m.price, 'market');
    return { cardId: m.cardId, rarity: m.rarity };
  },
});
