import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { STARTER_PACKS, assertOpen } from './launch';
import { BOOST_MS } from '../src/core/packRegen';

/** Places du club (variable Convex MAX_PLAYERS pour l'agrandir, comptes de l'équipe compris). */
export const maxPlayers = () => {
  const n = Number((process.env.MAX_PLAYERS ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
};
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

/**
 * (perf 07/11) L'id du joueur SANS lire son document : une requête qui ne lit que la session n'est pas ré-exécutée à
 * chaque écriture sur le joueur (pièces, missions, battement de cœur…) — Convex ré-exécute une requête dès qu'un
 * document qu'elle a lu change. À utiliser dans toute requête qui n'a besoin que de `user._id`.
 */
export async function getUserIdByToken(ctx: QueryCtx | MutationCtx, sessionToken: string | undefined | null): Promise<Id<'users'> | null> {
  if (!sessionToken) return null;
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', sessionToken))
    .unique();
  if (!session || session.expiresAt < Date.now()) return null;
  return session.userId;
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null,
): Promise<Doc<'users'>> {
  const user = await getUserByToken(ctx, sessionToken);
  if (!user) {
    throw new ConvexError('Non connecté : connecte-toi (Discord ou pseudo).');
  }
  return user;
}

export function generateRandomToken(): string {
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
      const userId = await createUser(ctx, { discordId: args.discordId, username: args.username, displayName: args.displayName, avatarUrl: args.avatarUrl });
      // (ouverture 07/11) MP du bot Discord : lien de parrainage + avantages, une seule fois (convex/discordBot.ts)
      await ctx.scheduler.runAfter(4000, internal.discordBot.welcomeDm, { userId });
      user = (await ctx.db.get(userId))!;
    } else {
      if (user.bannedAt) throw new ConvexError('Ce compte a été banni du club.');
      await ctx.db.patch(user._id, {
        username: args.username,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
        lastSeenAt: now,
        ...(user.packRegenAt === undefined ? { packRegenAt: user.lastSeenAt } : {}),
      });
    }

    return { token: await issueSession(ctx, user._id), userId: user._id };
  },
});

/** Nouvelle session (30 jours) pour un joueur : le jeton que le site garde. */
export async function issueSession(ctx: MutationCtx, userId: Id<'users'>): Promise<string> {
  const now = Date.now();
  const token = generateRandomToken();
  await ctx.db.insert('sessions', { token, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  return token;
}

/**
 * Nouveau joueur (Discord ou pseudo) : refusé avant l'ouverture (convex/launch.ts) et quand le club est complet ;
 * 15 boosters de départ + recharge ×2 pendant 24 h, arrivée annoncée dans le fil.
 */
export async function createUser(
  ctx: MutationCtx,
  f: { discordId: string; username: string; displayName: string; avatarUrl?: string; pwHash?: string },
): Promise<Id<'users'>> {
  await assertOpen(ctx);
  const cap = maxPlayers();
  const allUsers = (await ctx.db.query('users').collect()).filter((u) => !u.bannedAt);
  if (allUsers.length >= cap) throw new ConvexError(`Le club est complet (${cap}/${cap} joueurs).`);
  const now = Date.now();
  const userId = await ctx.db.insert('users', {
    ...f,
    packBalance: STARTER_PACKS,
    lastDailyClaimAt: 0,
    packRegenAt: now,
    regenBoostUntil: now + BOOST_MS,
    totalPacksOpened: 0,
    lastSeenAt: now,
    statusText: 'Vient de rejoindre le club',
  });
  await ctx.db.insert('activityFeed', {
    userId,
    displayName: f.displayName,
    avatarUrl: f.avatarUrl,
    kind: 'joined',
    message: `${f.displayName} a rejoint le club avec ${STARTER_PACKS} boosters de départ !`,
    createdAt: now,
  });
  return userId;
}

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
