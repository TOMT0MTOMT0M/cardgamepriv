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
