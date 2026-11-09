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
    // (V2 fluidité, lot 4) lecture par l'index : `max` lignes lues au lieu de 400 à chaque nouvelle entrée du fil
    const big = await ctx.db
      .query('activityFeed')
      .withIndex('by_big', (q) => q.eq('big', true))
      .order('desc')
      .take(max);
    if (big.length >= max) return big;
    // pas encore assez de lignes marquées (avant `migrations:markBigPulls`, ou tout début d'une base) : ancien parcours
    const recent = await ctx.db.query('activityFeed').withIndex('by_createdAt').order('desc').take(400);
    return recent.filter(isBigPull).slice(0, max);
  },
});

/** Un « gros tirage » : carte Légendaire, Mythique ou Secrète sortie d'un booster. */
export const isBigPull = (f: { cardId?: string; rarity?: string; kind: string }): boolean =>
  !!f.cardId && (f.rarity === 'legendary' || f.rarity === 'mythic' || f.rarity === 'secret') && (f.kind === 'pull' || f.kind === 'mythic_pull' || f.kind === 'secret_pull');
