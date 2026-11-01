import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserByToken, requireUser } from './auth';
import { rarityValidator } from './cardsCatalog';

const tradeItemValidator = v.object({
  cardId: v.string(),
  rarity: rarityValidator,
  count: v.number(),
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

    return { incoming, outgoing };
  },
});

export const propose = mutation({
  args: {
    sessionToken: v.string(),
    toUserId: v.id('users'),
    offered: v.array(tradeItemValidator),
    requested: v.array(tradeItemValidator),
  },
  handler: async (ctx, { sessionToken, toUserId, offered, requested }) => {
    const user = await requireUser(ctx, sessionToken);
    if (user._id === toUserId) {
      throw new ConvexError('Impossible d’échanger avec soi-même.');
    }

    for (const item of offered) {
      const inv = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', user._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
        )
        .unique();
      if (!inv || inv.count < item.count) {
        throw new ConvexError(`Tu ne possèdes pas assez d’exemplaires de ${item.cardId} (${item.rarity}).`);
      }
    }

    return await ctx.db.insert('trades', {
      fromUserId: user._id,
      toUserId,
      offered,
      requested,
      status: 'pending',
      createdAt: Date.now(),
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
