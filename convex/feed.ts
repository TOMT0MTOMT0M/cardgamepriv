import { v } from 'convex/values';
import { query } from './_generated/server';

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = Math.min(limit ?? 25, 50);
    return await ctx.db
      .query('activityFeed')
      .withIndex('by_createdAt')
      .order('desc')
      .take(max);
  },
});

/**
 * « Gros tirages » de la page d'accueil : les dernières cartes Légendaires, Mythiques et Secrètes tirées par tout le
 * monde (5★ et plus). Parcourt les 400 dernières entrées du fil (épique+ et n°1) et ne garde que les plus belles.
 */
export const bigPulls = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = Math.min(limit ?? 24, 40);
    const recent = await ctx.db.query('activityFeed').withIndex('by_createdAt').order('desc').take(400);
    return recent
      .filter((f) => f.cardId && (f.rarity === 'legendary' || f.rarity === 'mythic' || f.rarity === 'secret') && (f.kind === 'pull' || f.kind === 'mythic_pull' || f.kind === 'secret_pull'))
      .slice(0, max);
  },
});
