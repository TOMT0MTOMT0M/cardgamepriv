import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
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

/** ligne renvoyée au jeu : les 5 champs lus par le client + la révision (suivi par différence) */
const slim = (c: Doc<'inventory'>) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber, firstPulledAt: c.firstPulledAt, rev: c.rev ?? 0 });

/** au-delà, `mineSince` dit « trop de changements » : le client relit tout (`collectionFull`) et repart de là */
const SINCE_MAX = 300;

/**
 * (V2 fluidité) Collection complète, LUE UNE FOIS (le client l'appelle en lecture simple, pas en abonnement), avec la
 * révision de chaque ligne : le client suit ensuite seulement ce qui change (`mineSince`).
 */
export const collectionFull = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return null;
    const rows = await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return rows.map(slim);
  },
});

/**
 * (V2 fluidité) COLLECTION PAR DIFFÉRENCE (convex/invRev.ts) : lignes écrites et lignes supprimées depuis `since`
 * (révision incluse : une ligne renvoyée deux fois porte son état complet, c'est sans effet). Abonnement permanent du
 * jeu à la place de `myCollection` : après un booster, ~5 lignes relues et renvoyées au lieu de toute la collection.
 * `more` : plus de SINCE_MAX changements, le client relit tout.
 */
export const mineSince = query({
  args: { sessionToken: v.optional(v.string()), since: v.number() },
  handler: async (ctx, { sessionToken, since }) => {
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return null;
    const rows = await ctx.db
      .query('inventory')
      .withIndex('by_user_rev', (q) => q.eq('userId', userId).gte('rev', since))
      .take(SINCE_MAX + 1);
    const gone = await ctx.db
      .query('invGone')
      .withIndex('by_user_rev', (q) => q.eq('userId', userId).gte('rev', since))
      .take(SINCE_MAX + 1);
    return {
      rows: rows.slice(0, SINCE_MAX).map(slim),
      gone: gone.slice(0, SINCE_MAX).map((g) => ({ cardId: g.cardId, rarity: g.rarity, rev: g.rev })),
      more: rows.length > SINCE_MAX || gone.length > SINCE_MAX,
    };
  },
});

/** (audit 12/11, S07 / A6-08) collection d'un autre joueur en 4 champs (client V2) : réponse ≈ 4 fois plus légère. */
export const userCollectionSlim = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return rows.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber }));
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
