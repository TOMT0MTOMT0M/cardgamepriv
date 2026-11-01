import { v } from 'convex/values';
import { query } from './_generated/server';
import { getUserByToken } from './auth';

export const myCollection = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return [];

    return await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
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
