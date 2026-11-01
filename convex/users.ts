import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserByToken, requireUser } from './auth';

const DAILY_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 2 boosters every 12h
const DAILY_PACK_REWARD = 2;
const ONLINE_WINDOW_MS = 90 * 1000; // 90s heartbeat window

export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;

    const now = Date.now();
    const nextDailyClaimAt = user.lastDailyClaimAt + DAILY_COOLDOWN_MS;
    const canClaimDaily = now >= nextDailyClaimAt;

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
      packBalance: user.packBalance,
      totalPacksOpened: user.totalPacksOpened,
      canClaimDaily,
      nextDailyClaimAt,
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
    const user = await requireUser(ctx, sessionToken);
    const now = Date.now();
    const nextClaimAt = user.lastDailyClaimAt + DAILY_COOLDOWN_MS;

    if (now < nextClaimAt) {
      const minsLeft = Math.ceil((nextClaimAt - now) / 60000);
      throw new ConvexError(`Prochain booster gratuit dans ${minsLeft} min.`);
    }

    const newBalance = user.packBalance + DAILY_PACK_REWARD;
    await ctx.db.patch(user._id, {
      packBalance: newBalance,
      lastDailyClaimAt: now,
      lastSeenAt: now,
    });

    return {
      added: DAILY_PACK_REWARD,
      packBalance: newBalance,
      nextDailyClaimAt: now + DAILY_COOLDOWN_MS,
    };
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
      ...(statusText !== undefined ? { statusText } : {}),
    });
    return { ok: true };
  },
});
