import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserByToken, requireUser } from './auth';
import { PACK_CAP, PACK_REGEN_MS, applyRegen } from '../src/core/packRegen';
const ONLINE_WINDOW_MS = 90 * 1000; // 90s heartbeat window

export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;

    const now = Date.now();
    // recharge : 1 booster / 5 min, 15 max (calcul paresseux, rien n'est écrit ici ; le client refait le calcul chaque seconde)
    const packRegenAt = user.packRegenAt ?? user.lastSeenAt;
    const regen = applyRegen(user.packBalance, packRegenAt, now);

    const myCards = await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    const uniqueCards = new Set(myCards.map((c) => c.cardId)).size;
    const totalCards = myCards.reduce((sum, c) => sum + c.count, 0);

    return {
      _id: user._id,
      discordId: user.discordId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      packBalance: regen.balance,
      /** réserve stockée + départ de la recharge : le client recalcule avec applyRegen() */
      packStored: user.packBalance,
      packRegenAt,
      packCap: PACK_CAP,
      packRegenMs: PACK_REGEN_MS,
      nextPackAt: regen.nextAt,
      totalPacksOpened: user.totalPacksOpened,
      /** ancien « +2 toutes les 12 h » : remplacé par la recharge (gardé pour le HUD du labo) */
      canClaimDaily: false,
      nextDailyClaimAt: regen.nextAt ?? now,
      uniqueCards,
      totalCards,
    };
  },
});

export const friends = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query('users').collect();
    return users
      .map((u) => ({
        _id: u._id,
        displayName: u.displayName,
        username: u.username,
        avatarUrl: u.avatarUrl,
        totalPacksOpened: u.totalPacksOpened,
        online: now - u.lastSeenAt < ONLINE_WINDOW_MS,
        statusText: u.statusText,
        lastSeenAt: u.lastSeenAt,
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt - a.lastSeenAt);
  },
});

export const claimDailyBooster = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireUser(ctx, sessionToken);
    throw new ConvexError(`Les boosters se rechargent tout seuls : 1 toutes les ${PACK_REGEN_MS / 60000} minutes, jusqu'à ${PACK_CAP}.`);
  },
});

export const heartbeat = mutation({
  args: {
    sessionToken: v.string(),
    statusText: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, statusText }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return { ok: false };
    await ctx.db.patch(user._id, {
      lastSeenAt: Date.now(),
      // comptes d'avant la recharge : on fige le départ du minuteur (sinon il glisserait avec lastSeenAt)
      ...(user.packRegenAt === undefined ? { packRegenAt: user.lastSeenAt } : {}),
      ...(statusText !== undefined ? { statusText } : {}),
    });
    return { ok: true };
  },
});
