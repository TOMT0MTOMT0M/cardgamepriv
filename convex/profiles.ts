import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { pinnedOf } from './binders';

/** Profil public d'un joueur : vitrine, devise, statistiques. La collection détaillée reste dans inventory.userCollection. */
export const profile = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;
    const pinned = await pinnedOf(ctx, userId);
    return {
      id: u._id,
      name: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      showcase: u.showcase ?? [],
      packsOpened: u.totalPacksOpened,
      joinedAt: u._creationTime,
      lastSeenAt: u.lastSeenAt,
      /** classeur épinglé (visible des potes) */
      pinnedBinder: pinned ? { id: pinned._id, name: pinned.name, cards: pinned.cards, coverCardId: pinned.coverCardId } : null,
    };
  },
});

const MAX_SHOWCASE = 6;

export const setShowcase = mutation({
  args: { sessionToken: v.string(), cards: v.array(v.object({ cardId: v.string(), rarity: rarityValidator })) },
  handler: async (ctx, { sessionToken, cards }) => {
    const user = await requireUser(ctx, sessionToken);
    if (cards.length > MAX_SHOWCASE) throw new ConvexError(`${MAX_SHOWCASE} cartes au maximum dans la vitrine.`);
    for (const c of cards) {
      if (!catalogCard(c.cardId)) throw new ConvexError('Carte inconnue.');
      const inv = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', c.cardId).eq('rarity', c.rarity))
        .unique();
      if (!inv || inv.count < 1) throw new ConvexError(`Tu n’as pas (ou plus) ${catalogCard(c.cardId)?.name ?? 'cette carte'}.`);
    }
    await ctx.db.patch(user._id, { showcase: cards });
    return { ok: true };
  },
});

export const setBio = mutation({
  args: { sessionToken: v.string(), bio: v.string() },
  handler: async (ctx, { sessionToken, bio }) => {
    const user = await requireUser(ctx, sessionToken);
    const b = bio.replace(/\s+/g, ' ').trim().slice(0, 80);
    await ctx.db.patch(user._id, { bio: b || undefined });
    return { ok: true };
  },
});
