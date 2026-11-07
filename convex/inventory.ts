import { v } from 'convex/values';
import { query } from './_generated/server';
import { getUserIdByToken } from './auth';

/**
 * Collection du joueur (abonnement permanent du jeu, renvoyée EN ENTIER à chaque booster ouvert). Seulement les champs
 * que le client lit (src/game/onlineBackend.ts) : ~100 o par carte au lieu de ~260 avec le document complet (`_id`,
 * `_creationTime`, `userId`, `foilSeed`, `lastPulledAt` ne servent pas). Compatible avec un client déjà ouvert : il ne
 * lisait déjà que ces 5 champs.
 */
export const myCollection = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (perf 07/11) session seulement : plus ré-exécutée (inventaire entier relu) à chaque écriture sur le joueur
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return [];

    const rows = await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return rows.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber, firstPulledAt: c.firstPulledAt }));
  },
});

export const userCollection = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
  },
});
