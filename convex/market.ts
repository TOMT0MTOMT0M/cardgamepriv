import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { addCoins, giveCards, recordFlow, takeCards } from './econLib';
import { MARKET_MAX_OPEN, WANTED_CARDS_MAX, marketAdvised, marketProblem } from '../src/core/market';
import { CARD_VALUE } from '../src/core/economy';
import { presenceOf } from './presence';
import { fm } from '../src/core/msgs';
import { FAM_ROW, famKeysOfCard } from '../src/core/wishFams';
import { wishersOf, wishesReady } from './wishes';
import { notify } from './push';
import { sellSlotsUsed } from './auctions';

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

/**
 * (17/11, Hugo) HISTORIQUE de mes ventes et de mes achats (les 50 + 50 derniers, sans limite de date), avec le nom de
 * l'autre joueur. Lu à la demande (onglet « Historique » du Marché), pas d'abonnement : deux lectures par index.
 */
export const history = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const meId = await getUserIdByToken(ctx, sessionToken);
    if (!meId) return [];
    const sold = await ctx.db.query('market').withIndex('by_seller_status', (q) => q.eq('sellerId', meId).eq('status', 'sold')).order('desc').take(50);
    const bought = await ctx.db.query('market').withIndex('by_buyer', (q) => q.eq('buyerId', meId)).order('desc').take(50);
    const users: Sellers = new Map();
    return await Promise.all(
      [...sold, ...bought.filter((m) => m.status === 'sold')].map(async (m) => {
        const b = m.buyerId ? await sellerOf(ctx, users, m.buyerId) : null;
        return { ...(await view(ctx, m, users)), buyerName: b?.displayName ?? '?' };
      }),
    );
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
    // (V3) les enchères ouvertes occupent aussi des places (convex/auctions.ts)
    if ((await openCount(ctx, me._id)) >= MARKET_MAX_OPEN) throw new ConvexError(fe('market.2', { p0: MARKET_MAX_OPEN }));
    const [taken] = await takeCards(ctx, me._id, [{ cardId, rarity, count: 1 }]);
    await ctx.db.insert('market', { sellerId: me._id, cardId, rarity, mintNumber: taken.mintNumber, price, status: 'open', createdAt: Date.now() });
    // (V3, C bis) les joueurs qui veulent cette carte sont prévenus (1 alerte par vendeur et par heure au plus)
    const notified = await alertWishers(ctx, me, [{ cardId, rarity, price }]);
    return { notified };
  },
});

// ─────────────────────────────── (v2.1.41, idée de Hugo) « Forge → vente »
/** contrôles « il ne l'a pas encore » au plus par appel (une lecture d'inventaire chacun) : la requête reste bornée */
const WANT_CHECKS_MAX = 300;
type WantCard = { cardId: string; rarity: Doc<'market'>['rarity'] };

/**
 * Pour chaque carte, les joueurs qui la VEULENT (envie de la carte, de son album ou de sa famille : index `wishes`) et
 * ne l'ont pas encore, moi exclu, bannis exclus (carte publique `presence`, jamais le document joueur). Lectures : 1 à 3
 * par carte dans l'index des envies, puis au plus WANT_CHECKS_MAX lectures d'inventaire (au-delà : non comptés).
 */
async function wantersOf(ctx: QueryCtx | MutationCtx, meId: Id<'users'>, cards: readonly WantCard[]): Promise<Map<string, Id<'users'>[]>> {
  const out = new Map<string, Id<'users'>[]>();
  const banned = new Map<string, boolean>();
  let checks = WANT_CHECKS_MAX;
  for (const c of cards.slice(0, WANTED_CARDS_MAX)) {
    if (out.has(c.cardId) || !catalogCard(c.cardId) || c.rarity === 'secret') continue;
    const cand = new Set<Id<'users'>>(await wishersOf(ctx, c.cardId));
    for (const k of famKeysOfCard(c.cardId)) for (const id of await wishersOf(ctx, FAM_ROW + k)) cand.add(id);
    const ids: Id<'users'>[] = [];
    for (const id of cand) {
      if (id === meId || checks <= 0) continue;
      let b = banned.get(id);
      if (b === undefined) banned.set(id, (b = !!(await presenceOf(ctx, id))?.bannedAt));
      if (b) continue;
      checks--;
      const row = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', id).eq('cardId', c.cardId).eq('rarity', c.rarity)).unique();
      if ((row?.count ?? 0) < 1) ids.push(id);
    }
    if (ids.length) out.set(c.cardId, ids);
  }
  return out;
}

/** places de vente occupées : ventes à prix fixe + (V3) enchères ouvertes */
const openCount = sellSlotsUsed;

/**
 * Au moment de forger : qui veut les cartes choisies ? Lecture PONCTUELLE (client.query), jamais abonnée. `open` = mes
 * ventes ouvertes ; déjà MARKET_MAX_OPEN → rien d'autre n'est lu (aucune place au marché). Avant la migration des envies : rien.
 */
export const wanted = query({
  args: { sessionToken: v.optional(v.string()), cards: v.array(v.object({ cardId: v.string(), rarity: rarityValidator })) },
  handler: async (ctx, { sessionToken, cards }) => {
    const meId = await getUserIdByToken(ctx, sessionToken);
    if (!meId) return { open: 0, cards: [] };
    const open = await openCount(ctx, meId);
    if (open >= MARKET_MAX_OPEN || !(await wishesReady(ctx))) return { open, cards: [] };
    const w = await wantersOf(ctx, meId, cards);
    return { open, cards: [...w].map(([cardId, ids]) => ({ cardId, ids: ids as string[] })) };
  },
});

/**
 * Met plusieurs exemplaires en vente d'un coup, au PRIX CONSEILLÉ (calculé ici, jamais envoyé par le jeu), puis prévient
 * chaque joueur qui en veut une : UNE notification par joueur pour tout le lot (même `tag` par vendeur : un 2ᵉ lot
 * remplace la précédente). Tout ou rien : 10 ventes ouvertes au plus, comme `sell`.
 */
export const quickSell = mutation({
  args: { sessionToken: v.string(), items: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() })) },
  handler: async (ctx, { sessionToken, items }) => {
    const me = await requireUser(ctx, sessionToken);
    const n = items.reduce((a, it) => a + it.count, 0);
    if (!items.length || n < 1) return { listed: 0 };
    for (const it of items) {
      if (!catalogCard(it.cardId)) throw new ConvexError(fe('market.1'));
      const problem = marketProblem(it.rarity, marketAdvised(it.rarity));
      if (problem) throw new ConvexError(problem);
    }
    if ((await openCount(ctx, me._id)) + n > MARKET_MAX_OPEN) throw new ConvexError(fe('market.2', { p0: MARKET_MAX_OPEN }));
    const taken = await takeCards(ctx, me._id, items);
    const now = Date.now();
    for (const t of taken)
      for (let i = 0; i < t.count; i++) await ctx.db.insert('market', { sellerId: me._id, cardId: t.cardId, rarity: t.rarity, mintNumber: t.mintNumber, price: marketAdvised(t.rarity), status: 'open', createdAt: now });
    const notified = await alertWishers(ctx, me, items.map((it) => ({ cardId: it.cardId, rarity: it.rarity, price: marketAdvised(it.rarity) })));
    return { listed: n, notified };
  },
});

// ─────────────────────────────── (V3, C bis) ALERTE ACHETEUR
/** plafond anti-spam : au plus une alerte par vendeur et par heure pour un même joueur */
export const WISH_ALERT_GAP = 3600_000;
type SaleCard = WantCard & { price: number };

/**
 * Prévient les joueurs qui VEULENT une des cartes qu'on vient de mettre en vente (Forge → vente, vente à la main, et
 * demain les enchères) : UNE notification par joueur pour tout le lot (même `tag` par vendeur : la suivante remplace la
 * précédente), et pas plus d'une par vendeur et par heure (`wishAlerts`, une ligne par acheteur et vendeur, réécrite).
 * Lectures : `wantersOf` (1 à 3 lectures d'index d'envies par carte, puis 1 présence + 1 inventaire par intéressé),
 * puis par joueur prévenu 1 ligne `wishAlerts` (+ le joueur et ses abonnements dans `notify`). Rend le nombre de prévenus.
 */
export async function alertWishers(ctx: MutationCtx, me: { _id: Id<'users'>; displayName: string }, cards: readonly SaleCard[]): Promise<number> {
  // les intéressés, regroupés : joueur → ses cartes (dans l'ordre du lot)
  const per = new Map<Id<'users'>, SaleCard[]>();
  for (const [cardId, ids] of await wantersOf(ctx, me._id, cards))
    for (const id of ids) {
      const it = cards.find((x) => x.cardId === cardId)!;
      per.set(id, [...(per.get(id) ?? []), it]);
    }
  const now = Date.now();
  let n = 0;
  for (const [id, l] of per) {
    const row = await ctx.db.query('wishAlerts').withIndex('by_user_seller', (q) => q.eq('userId', id).eq('sellerId', me._id)).first();
    if (row && now - row.at < WISH_ALERT_GAP) continue;
    const c = l[0];
    if (row) await ctx.db.patch(row._id, { at: now, cardId: c.cardId });
    else await ctx.db.insert('wishAlerts', { userId: id, sellerId: me._id, at: now, cardId: c.cardId });
    const body = l.length === 1 ? fm('n.wishSaleOne', { card: nameOf(c.cardId), cardId: c.cardId, coins: c.price }) : fm('n.wishSaleMany', { card: nameOf(c.cardId), cardId: c.cardId, coins: c.price, n: l.length - 1 });
    await notify(ctx, id, { kind: 'trade', title: fm('n.wishSale', { name: me.displayName, n: l.length }), body, url: '#/echanges/chercher', tag: `wish-sale-${me._id}` });
    n++;
  }
  return n;
}

/**
 * Pastille du Marché : mes alertes « une carte que tu veux est en vente » (une ligne par vendeur, la plus récente).
 * Abonnée en continu, mais ne lit que MES lignes (≤ une par vendeur) et ne repart que quand on m'en envoie une : ni le
 * document joueur, ni `Date.now()` (le jeu compare `at` à sa dernière visite du Marché).
 */
export const alerts = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const meId = await getUserIdByToken(ctx, sessionToken);
    if (!meId) return [];
    const rows = await ctx.db.query('wishAlerts').withIndex('by_user_seller', (q) => q.eq('userId', meId)).take(100);
    return rows.map((r) => ({ at: r.at, cardId: r.cardId, sellerId: r.sellerId as string }));
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
