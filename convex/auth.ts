import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';

const MAX_FRIENDS_CAP = 20;
const STARTER_PACKS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function getUserByToken(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null,
): Promise<Doc<'users'> | null> {
  if (!sessionToken) return null;
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', sessionToken))
    .unique();
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return await ctx.db.get(session.userId);
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null,
): Promise<Doc<'users'>> {
  const user = await getUserByToken(ctx, sessionToken);
  if (!user) {
    throw new ConvexError('Non connecté. Connecte-toi avec Discord.');
  }
  return user;
}

function generateRandomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const upsertDiscordUser = internalMutation({
  args: {
    discordId: v.string(),
    username: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Optional whitelist check (comma-separated Discord User IDs)
    const allowedEnv = (process.env.ALLOWED_DISCORD_IDS ?? '').trim();
    if (allowedEnv.length > 0) {
      const allowedSet = new Set(
        allowedEnv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      if (!allowedSet.has(args.discordId)) {
        throw new ConvexError('Ton compte Discord ne fait pas partie de la liste privée des 20 amis.');
      }
    }

    let user = await ctx.db
      .query('users')
      .withIndex('by_discordId', (q) => q.eq('discordId', args.discordId))
      .unique();

    if (!user) {
      // Enforce the 20-player private club cap
      const allUsers = await ctx.db.query('users').collect();
      if (allUsers.length >= MAX_FRIENDS_CAP) {
        throw new ConvexError(`Serveur complet (${MAX_FRIENDS_CAP}/${MAX_FRIENDS_CAP} amis max).`);
      }

      const userId = await ctx.db.insert('users', {
        discordId: args.discordId,
        username: args.username,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
        packBalance: STARTER_PACKS,
        lastDailyClaimAt: 0,
        packRegenAt: now,
        totalPacksOpened: 0,
        lastSeenAt: now,
        statusText: 'Vient de rejoindre le club',
      });

      await ctx.db.insert('activityFeed', {
        userId,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
        kind: 'joined',
        message: `${args.displayName} a rejoint le club avec ${STARTER_PACKS} boosters de départ !`,
        createdAt: now,
      });

      user = (await ctx.db.get(userId))!;
    } else {
      await ctx.db.patch(user._id, {
        username: args.username,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
        lastSeenAt: now,
        ...(user.packRegenAt === undefined ? { packRegenAt: user.lastSeenAt } : {}),
      });
    }

    const token = generateRandomToken();
    await ctx.db.insert('sessions', {
      token,
      userId: user._id,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });

    return { token, userId: user._id };
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', sessionToken))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { ok: true };
  },
});
