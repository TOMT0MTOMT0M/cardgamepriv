import { v, ConvexError } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { catalogCard, rarityValidator, type RarityId } from './cardsCatalog';
import { bumpMissions } from './missions';

const tradeItemValidator = v.object({
  cardId: v.string(),
  rarity: rarityValidator,
  count: v.number(),
});

const MAX_ITEMS_PER_SIDE = 12;

type TradeItem = { cardId: string; rarity: RarityId; count: number };

function checkItems(items: TradeItem[], side: string) {
  if (items.length > MAX_ITEMS_PER_SIDE) throw new ConvexError(`${MAX_ITEMS_PER_SIDE} cartes différentes au maximum par côté.`);
  const seen = new Set<string>();
  for (const it of items) {
    if (!Number.isInteger(it.count) || it.count < 1 || it.count > 99) throw new ConvexError('Quantité invalide.');
    if (!catalogCard(it.cardId)) throw new ConvexError(`Carte inconnue (${side}) : ${it.cardId}`);
    const k = `${it.cardId}:${it.rarity}`;
    if (seen.has(k)) throw new ConvexError('Même carte en double dans la liste.');
    seen.add(k);
  }
}

async function ownedCount(ctx: QueryCtx, userId: Id<'users'>, it: TradeItem): Promise<number> {
  const inv = await ctx.db
    .query('inventory')
    .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', it.cardId).eq('rarity', it.rarity))
    .unique();
  return inv?.count ?? 0;
}

const nameOf = async (ctx: QueryCtx, id: Id<'users'>) => (await ctx.db.get(id))?.displayName ?? '?';

/**
 * VERROUILLAGE (retours du 3 nov.) : une carte engagée dans une proposition EN ATTENTE (celles que j'offre) ne peut ni
 * être brûlée en contrat, ni être reproposée ailleurs tant que l'autre n'a pas répondu. cardId:rarity → exemplaires engagés.
 */
export async function lockedCards(ctx: QueryCtx, userId: Id<'users'>, except?: Id<'trades'>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const outgoing = await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', userId).eq('status', 'pending')).collect();
  for (const t of outgoing) {
    if (except && t._id === except) continue;
    for (const it of t.offered) out.set(`${it.cardId}:${it.rarity}`, (out.get(`${it.cardId}:${it.rarity}`) ?? 0) + it.count);
  }
  return out;
}

/** Vérifie que `offered` est possédé ET libre (pas déjà engagé dans un autre échange en attente). */
async function checkOffered(ctx: QueryCtx, userId: Id<'users'>, offered: TradeItem[], except?: Id<'trades'>) {
  const locked = await lockedCards(ctx, userId, except);
  for (const item of offered) {
    const have = await ownedCount(ctx, userId, item);
    const name = catalogCard(item.cardId)?.name ?? item.cardId;
    if (have < item.count) throw new ConvexError(`Tu ne possèdes pas assez d’exemplaires de ${name}.`);
    const busy = locked.get(`${item.cardId}:${item.rarity}`) ?? 0;
    if (have - busy < item.count) throw new ConvexError(`${name} est déjà engagée dans un autre échange en attente.`);
  }
}

const SETTLED = ['accepted', 'declined', 'cancelled', 'countered'] as const;

/** Historique : mes échanges terminés (acceptés, refusés, annulés, contre-proposés), les plus récents d'abord. */
export const history = query({
  args: { sessionToken: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, limit }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return [];
    const max = Math.min(limit ?? 30, 100);
    const all = [];
    for (const st of SETTLED) {
      all.push(...(await ctx.db.query('trades').withIndex('by_toUser_status', (q) => q.eq('toUserId', user._id).eq('status', st)).order('desc').take(max)));
      all.push(...(await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', user._id).eq('status', st)).order('desc').take(max)));
    }
    all.sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt));
    return Promise.all(all.slice(0, max).map(async (t) => ({ ...t, fromName: await nameOf(ctx, t.fromUserId), toName: await nameOf(ctx, t.toUserId) })));
  },
});

/** Envies d'un ami (badges « il la cherche » dans les échanges). */
export const wishlistOf = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => (await ctx.db.get(userId))?.wishlist ?? [],
});

export const myTrades = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return { incoming: [], outgoing: [] };

    const incoming = await ctx.db
      .query('trades')
      .withIndex('by_toUser_status', (q) => q.eq('toUserId', user._id).eq('status', 'pending'))
      .collect();

    const outgoing = await ctx.db
      .query('trades')
      .withIndex('by_fromUser_status', (q) => q.eq('fromUserId', user._id).eq('status', 'pending'))
      .collect();

    // noms affichés (le client n'a pas à recouper avec la liste d'amis)
    const withNames = async (list: typeof incoming) =>
      Promise.all(list.map(async (t) => ({ ...t, fromName: await nameOf(ctx, t.fromUserId), toName: await nameOf(ctx, t.toUserId) })));
    return { incoming: await withNames(incoming), outgoing: await withNames(outgoing) };
  },
});

export const propose = mutation({
  args: {
    sessionToken: v.string(),
    toUserId: v.id('users'),
    offered: v.array(tradeItemValidator),
    requested: v.array(tradeItemValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, toUserId, offered, requested, note }) => {
    const user = await requireUser(ctx, sessionToken);
    if (user._id === toUserId) {
      throw new ConvexError('Impossible d’échanger avec soi-même.');
    }
    const target = await ctx.db.get(toUserId);
    if (!target) throw new ConvexError('Joueur introuvable.');
    if (!offered.length && !requested.length) throw new ConvexError('Échange vide.');
    checkItems(offered, 'proposée');
    checkItems(requested, 'demandée');

    await checkOffered(ctx, user._id, offered);
    for (const item of requested) {
      if ((await ownedCount(ctx, toUserId, item)) < item.count) {
        throw new ConvexError(`${target.displayName} n’a pas (ou plus) ${catalogCard(item.cardId)?.name ?? item.cardId}.`);
      }
    }

    await bumpMissions(ctx, user, { type: 'trade' });
    return await ctx.db.insert('trades', {
      fromUserId: user._id,
      toUserId,
      offered,
      requested,
      status: 'pending',
      createdAt: Date.now(),
      note: note?.slice(0, 140) || undefined,
    });
  },
});

export const respond = mutation({
  args: {
    sessionToken: v.string(),
    tradeId: v.id('trades'),
    accept: v.boolean(),
  },
  handler: async (ctx, { sessionToken, tradeId, accept }) => {
    const user = await requireUser(ctx, sessionToken);
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== 'pending') {
      throw new ConvexError('Échange introuvable ou déjà traité.');
    }
    if (trade.toUserId !== user._id) {
      throw new ConvexError('Seul le destinataire peut répondre à cet échange.');
    }

    const now = Date.now();
    if (!accept) {
      await ctx.db.patch(trade._id, { status: 'declined', resolvedAt: now });
      return { status: 'declined' as const };
    }

    const fromUser = await ctx.db.get(trade.fromUserId);
    if (!fromUser) throw new ConvexError('Joueur expéditeur introuvable.');

    // Verify and transfer offered cards (fromUser -> user)
    for (const item of trade.offered) {
      const src = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', fromUser._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
        )
        .unique();
      if (!src || src.count < item.count) {
        throw new ConvexError(`${fromUser.displayName} n'a plus les cartes proposées.`);
      }
      if (src.count === item.count) {
        await ctx.db.delete(src._id);
      } else {
        await ctx.db.patch(src._id, { count: src.count - item.count });
      }

      const dst = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', user._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
        )
        .unique();
      if (dst) {
        await ctx.db.patch(dst._id, { count: dst.count + item.count, lastPulledAt: now });
      } else {
        await ctx.db.insert('inventory', {
          userId: user._id,
          cardId: item.cardId,
          rarity: item.rarity,
          count: item.count,
          bestMintNumber: src.bestMintNumber,
          foilSeed: src.foilSeed,
          firstPulledAt: now,
          lastPulledAt: now,
        });
      }
    }

    // Verify and transfer requested cards (user -> fromUser)
    for (const item of trade.requested) {
      const src = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', user._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
        )
        .unique();
      if (!src || src.count < item.count) {
        throw new ConvexError('Tu n’as plus les cartes demandées.');
      }
      if (src.count === item.count) {
        await ctx.db.delete(src._id);
      } else {
        await ctx.db.patch(src._id, { count: src.count - item.count });
      }

      const dst = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', fromUser._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
        )
        .unique();
      if (dst) {
        await ctx.db.patch(dst._id, { count: dst.count + item.count, lastPulledAt: now });
      } else {
        await ctx.db.insert('inventory', {
          userId: fromUser._id,
          cardId: item.cardId,
          rarity: item.rarity,
          count: item.count,
          bestMintNumber: src.bestMintNumber,
          foilSeed: src.foilSeed,
          firstPulledAt: now,
          lastPulledAt: now,
        });
      }
    }

    await ctx.db.patch(trade._id, { status: 'accepted', resolvedAt: now });
    await ctx.db.patch(user._id, { totalTrades: (user.totalTrades ?? 0) + 1 });
    await ctx.db.patch(fromUser._id, { totalTrades: (fromUser.totalTrades ?? 0) + 1 });
    await bumpMissions(ctx, user, { type: 'trade' });
    await ctx.db.insert('activityFeed', {
      userId: user._id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      kind: 'trade',
      message: `${user.displayName} et ${fromUser.displayName} ont conclu un échange !`,
      createdAt: now,
    });

    return { status: 'accepted' as const };
  },
});

/**
 * CONTRE-PROPOSITION : le destinataire modifie l'échange reçu (retire / ajoute des cartes) et le renvoie. L'original
 * passe en `countered`, un nouvel échange part dans l'autre sens : `offered` = ce que je donne, `requested` = ce que je demande.
 */
export const counter = mutation({
  args: {
    sessionToken: v.string(),
    tradeId: v.id('trades'),
    offered: v.array(tradeItemValidator),
    requested: v.array(tradeItemValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, tradeId, offered, requested, note }) => {
    const user = await requireUser(ctx, sessionToken);
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== 'pending') throw new ConvexError('Échange introuvable ou déjà traité.');
    if (trade.toUserId !== user._id) throw new ConvexError('Seul le destinataire peut contre-proposer.');
    if (!offered.length && !requested.length) throw new ConvexError('Échange vide.');
    checkItems(offered, 'proposée');
    checkItems(requested, 'demandée');
    const other = await ctx.db.get(trade.fromUserId);
    if (!other) throw new ConvexError('Joueur introuvable.');
    await checkOffered(ctx, user._id, offered);
    for (const item of requested) {
      if ((await ownedCount(ctx, other._id, item)) < item.count) throw new ConvexError(`${other.displayName} n’a pas (ou plus) ${catalogCard(item.cardId)?.name ?? item.cardId}.`);
    }
    const now = Date.now();
    const id = await ctx.db.insert('trades', {
      fromUserId: user._id,
      toUserId: other._id,
      offered,
      requested,
      status: 'pending',
      createdAt: now,
      note: note?.slice(0, 140) || undefined,
      counterOf: trade._id,
    });
    await ctx.db.patch(trade._id, { status: 'countered', resolvedAt: now, counteredBy: id });
    await bumpMissions(ctx, user, { type: 'trade' });
    return id;
  },
});

/** L'auteur d'une proposition peut l'annuler tant qu'elle n'est pas traitée. */
export const cancel = mutation({
  args: { sessionToken: v.string(), tradeId: v.id('trades') },
  handler: async (ctx, { sessionToken, tradeId }) => {
    const user = await requireUser(ctx, sessionToken);
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== 'pending') throw new ConvexError('Échange introuvable ou déjà traité.');
    if (trade.fromUserId !== user._id) throw new ConvexError('Seul l’auteur peut annuler cette proposition.');
    await ctx.db.patch(trade._id, { status: 'cancelled', resolvedAt: Date.now() });
    return { status: 'cancelled' as const };
  },
});
