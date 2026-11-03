import { v, ConvexError } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { pinnedOf } from './binders';
import { bestCard, cleanCosmetics, profileMediaProblem, statsFrom, type PlayerStats } from '../src/core/cosmetics';
import { streakDay, touchStreak } from '../src/core/streak';
import { THEMES } from '../src/core/sets/themes';
import { ACHIEVEMENTS, achievementDone, achievementStats } from '../src/core/economy';
import { econOf } from './econLib';

/**
 * PROFIL (refonte retours du 3 nov.) : identité + cosmétiques (bannière, cadre, titre, badges — débloqués en jouant),
 * vitrine, classeur épinglé, statistiques enrichies, fil d'activité et classement entre nous.
 */

/** Statistiques d'un joueur (déblocages, classement). */
export async function statsOf(ctx: QueryCtx, u: Doc<'users'>): Promise<{ stats: PlayerStats; collection: Doc<'inventory'>[] }> {
  const collection = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', u._id)).collect();
  // série de connexion encore vivante (comptée aujourd'hui, ou hier) ; cassée (un jour sauté) → 0
  const t = touchStreak(u.streak, Date.now());
  const streak = !u.streak ? 0 : t === null ? u.streak.count : t.count === 1 ? 0 : u.streak.count;
  const stats = statsFrom(collection, { packsOpened: u.totalPacksOpened, tradesDone: u.totalTrades ?? 0, contractsSigned: u.totalContracts ?? 0, streak });
  return { stats, collection };
}

export const profile = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;
    const pinned = await pinnedOf(ctx, userId);
    const { stats, collection } = await statsOf(ctx, u);
    const top = bestCard(collection);
    const ids = new Set(collection.map((c) => c.cardId));
    return {
      id: u._id,
      name: u.displayName,
      avatarUrl: u.avatarUrl,
      /** photo / bannière importées (GIF ou image) — absentes : avatar Discord, bannière cosmétique */
      avatarMedia: (u.avatarMedia && (await ctx.storage.getUrl(u.avatarMedia))) || undefined,
      bannerMedia: (u.bannerMedia && (await ctx.storage.getUrl(u.bannerMedia))) || undefined,
      bio: u.bio,
      showcase: u.showcase ?? [],
      packsOpened: u.totalPacksOpened,
      joinedAt: u._creationTime,
      lastSeenAt: u.lastSeenAt,
      /** classeur épinglé (visible des potes) */
      pinnedBinder: pinned ? { id: pinned._id, name: pinned.name, cards: pinned.cards, coverCardId: pinned.coverCardId } : null,
      cosmetics: cleanCosmetics(u.cosmetics ?? {}, stats),
      stats,
      streakDay: streakDay(u.streak),
      bestDrop: top ? { cardId: top.cardId, rarity: top.rarity, mintNumber: top.bestMintNumber } : null,
      /** complétion par thème */
      themes: THEMES.map((t) => ({ id: t.id, have: t.cards.reduce((a, c) => a + (ids.has(c.id) ? 1 : 0), 0), total: t.cards.length })),
      /** succès atteints (les 36 de l'espace Jeux, stats du profil + compteurs de l'économie) */
      achievements: { done: achievementsDone(stats, u), total: ACHIEVEMENTS.length },
    };
  },
});

/** Nombre de succès atteints (réclamés ou non). */
function achievementsDone(stats: PlayerStats, u: Doc<'users'>): number {
  const st = achievementStats(stats, econOf(u));
  return ACHIEVEMENTS.reduce((a, x) => a + (achievementDone(x, st) ? 1 : 0), 0);
}

/** Fil d'activité d'un joueur (gros drops, échanges conclus, contrats signés), visible des potes. */
export const activity = query({
  args: { userId: v.id('users'), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    return await ctx.db.query('activityFeed').withIndex('by_userId', (q) => q.eq('userId', userId)).order('desc').take(Math.min(limit ?? 40, 100));
  },
});

/** Classement entre nous : complétion, 6★ + secrets, boosters ouverts, échanges conclus, série de connexion. */
export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const rows = [];
    for (const u of users) {
      const { stats } = await statsOf(ctx, u);
      rows.push({
        id: u._id,
        name: u.displayName,
        avatarUrl: u.avatarUrl,
        cosmetics: cleanCosmetics(u.cosmetics ?? {}, stats),
        uniques: stats.uniques,
        total: stats.total,
        pct: stats.total ? (stats.uniques / stats.total) * 100 : 0,
        mythics: stats.mythics,
        secrets: stats.secrets,
        packsOpened: stats.packsOpened,
        tradesDone: stats.tradesDone,
        streak: stats.streak,
        achievements: achievementsDone(stats, u),
      });
    }
    return rows;
  },
});

/** vitrine : 2 rangées de 6 (retours live n°1) */
const MAX_SHOWCASE = 12;

export const setShowcase = mutation({
  args: { sessionToken: v.string(), cards: v.array(v.object({ cardId: v.string(), rarity: rarityValidator })) },
  handler: async (ctx, { sessionToken, cards }) => {
    const user = await requireUser(ctx, sessionToken);
    if (cards.length > MAX_SHOWCASE) throw new ConvexError(`${MAX_SHOWCASE} cartes au maximum dans la vitrine.`);
    for (const c of cards) {
      if (!catalogCard(c.cardId)) throw new ConvexError('Carte inconnue.');
      const inv = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', c.cardId).eq('rarity', c.rarity))
        .unique();
      if (!inv || inv.count < 1) throw new ConvexError(`Tu n’as pas (ou plus) ${catalogCard(c.cardId)?.name ?? 'cette carte'}.`);
    }
    await ctx.db.patch(user._id, { showcase: cards });
    return { ok: true };
  },
});

export const setBio = mutation({
  args: { sessionToken: v.string(), bio: v.string() },
  handler: async (ctx, { sessionToken, bio }) => {
    const user = await requireUser(ctx, sessionToken);
    const b = bio.replace(/\s+/g, ' ').trim().slice(0, 80);
    await ctx.db.patch(user._id, { bio: b || undefined });
    return { ok: true };
  },
});

/** Cosmétiques : seulement ce qui est débloqué (un choix verrouillé est ignoré, sans erreur). */
export const setCosmetics = mutation({
  args: { sessionToken: v.string(), banner: v.optional(v.string()), frame: v.optional(v.string()), title: v.optional(v.string()), badges: v.optional(v.array(v.string())) },
  handler: async (ctx, { sessionToken, banner, frame, title, badges }) => {
    const user = await requireUser(ctx, sessionToken);
    const { stats } = await statsOf(ctx, user);
    const clean = cleanCosmetics({ banner, frame, title, badges }, stats);
    await ctx.db.patch(user._id, { cosmetics: clean });
    return clean;
  },
});

/**
 * PHOTO DE PROFIL / BANNIÈRE IMPORTÉES (retours live 02) : le client demande une adresse d'envoi, y POSTe le fichier
 * (GIF animé ou image ≤ 2 Mo), puis l'enregistre avec `setProfileMedia`. Fichier refusé (trop lourd, mauvais format) :
 * il est supprimé du stockage et la réponse `{ error }` dit pourquoi (pas d'exception : elle annulerait la suppression). L'ancien fichier est supprimé quand on le remplace ou le retire.
 */
export const generateMediaUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireUser(ctx, sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setProfileMedia = mutation({
  args: { sessionToken: v.string(), kind: v.union(v.literal('avatar'), v.literal('banner')), storageId: v.optional(v.id('_storage')) },
  handler: async (ctx, { sessionToken, kind, storageId }) => {
    const user = await requireUser(ctx, sessionToken);
    const field = kind === 'avatar' ? 'avatarMedia' : 'bannerMedia';
    const old = user[field];
    if (storageId && storageId !== old) {
      const meta = await ctx.db.system.get(storageId);
      if (!meta) throw new ConvexError('Fichier introuvable : renvoie-le.');
      const owner = await ctx.db.query('profileMedia').withIndex('by_storage', (q) => q.eq('storageId', storageId)).unique();
      if (owner && owner.userId !== user._id) throw new ConvexError('Ce fichier ne t’appartient pas.');
      const bad = profileMediaProblem(meta.size, meta.contentType);
      if (bad) {
        if (!owner) await ctx.storage.delete(storageId);
        return { error: bad };
      }
      if (!owner) await ctx.db.insert('profileMedia', { storageId, userId: user._id, kind, createdAt: Date.now() });
    }
    await ctx.db.patch(user._id, { [field]: storageId });
    if (old && old !== storageId) {
      const row = await ctx.db.query('profileMedia').withIndex('by_storage', (q) => q.eq('storageId', old)).unique();
      if (row) await ctx.db.delete(row._id);
      if (await ctx.db.system.get(old)) await ctx.storage.delete(old);
    }
    return { url: storageId ? ((await ctx.storage.getUrl(storageId)) ?? undefined) : undefined, error: undefined as string | undefined };
  },
});
