import { v, ConvexError } from 'convex/values';
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { pinnedOf } from './binders';
import { DEFAULT_OPENING, OPENINGS, bestCard, cleanCosmetics, profileMediaProblem, statsFrom, type PlayerStats } from '../src/core/cosmetics';
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
  // (retours live 6) + doublons brûlés (titres de la forge) et « a été n°1 » (titre Numéro un)
  const stats = statsFrom(collection, { packsOpened: u.totalPacksOpened, tradesDone: u.totalTrades ?? 0, contractsSigned: u.totalContracts ?? 0, streak, burned: econOf(u).burned, wasTop: u.wasTop ? 1 : 0 });
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
      /** classeurs épinglés (visibles des potes), 3 au plus ; `pinnedBinder` = le premier, gardé pour les jeux pas encore à jour */
      pinnedBinders: pinned.map((b) => ({ id: b._id, name: b.name, cards: b.cards, coverCardId: b.coverCardId })),
      pinnedBinder: pinned[0] ? { id: pinned[0]._id, name: pinned[0].name, cards: pinned[0].cards, coverCardId: pinned[0].coverCardId } : null,
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

/** Une ligne du classement (calculée sur la collection d'UN joueur). */
async function rankRowOf(ctx: QueryCtx, u: Doc<'users'>) {
  const { stats } = await statsOf(ctx, u);
  return {
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
  };
}
type RankRow = Awaited<ReturnType<typeof rankRowOf>>;

/**
 * Classement entre nous : complétion, 6★ + secrets, boosters ouverts, échanges conclus, série de connexion.
 *
 * (v1.0.11, « le classement ne marche plus ») AVANT : cette requête relisait la collection ENTIÈRE de tous les joueurs à
 * chaque affichage — avec la croissance des collections, elle a dépassé la limite de Convex (16 384 documents lus par
 * requête) et échouait. MAINTENANT : elle ne lit que les lignes déjà calculées (`rankRows`, une par joueur), tenues à
 * jour toutes les 5 min par `refreshRanks` (un joueur à la fois, chacun bien sous la limite). Même forme de réponse.
 */
export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('rankRows').collect();
    return rows.map((r) => r.row as RankRow);
  },
});

/** Ma ligne, recalculée tout de suite (le client l'appelle en ouvrant le classement : on s'y voit à jour). */
export const refreshMyRank = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    if (u.bannedAt) return { ok: false };
    const now = Date.now();
    const old = await ctx.db.query('rankRows').withIndex('by_user', (q) => q.eq('userId', u._id)).first();
    if (old && now - old.updatedAt < 20_000) return { ok: true };
    const row = await rankRowOf(ctx, u);
    if (old) await ctx.db.patch(old._id, { row, updatedAt: now });
    else await ctx.db.insert('rankRows', { userId: u._id, row, updatedAt: now });
    return { ok: true };
  },
});

/** joueurs, dernière activité, et date de leur ligne du classement (pour savoir qui recalculer) */
export const rankPlan = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const rows = await ctx.db.query('rankRows').collect();
    const at = new Map(rows.map((r) => [r.userId as string, r.updatedAt]));
    return {
      users: users.map((u) => ({ id: u._id, seen: u.lastSeenAt ?? 0, banned: !!u.bannedAt, at: at.get(u._id) ?? 0 })),
      rows: rows.map((r) => ({ id: r._id, userId: r.userId })),
    };
  },
});

/** la ligne d'un joueur (lit SA collection seulement) */
export const rankRow = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    return u && !u.bannedAt ? await rankRowOf(ctx, u) : null;
  },
});

export const saveRanks = internalMutation({
  args: { rows: v.array(v.object({ userId: v.id('users'), row: v.any() })), drop: v.array(v.id('rankRows')) },
  handler: async (ctx, { rows, drop }) => {
    const now = Date.now();
    for (const id of drop) await ctx.db.delete(id);
    for (const { userId, row } of rows) {
      const old = await ctx.db.query('rankRows').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      if (old) await ctx.db.patch(old._id, { row, updatedAt: now });
      else await ctx.db.insert('rankRows', { userId, row, updatedAt: now });
    }
    // (retours live 6, C15) titre « Numéro un » : le premier en cartes différentes est marqué, définitivement
    let best: { userId: string; n: number } | null = null;
    for (const r of await ctx.db.query('rankRows').collect()) {
      const n = (r.row as RankRow).uniques;
      if (n > 0 && (!best || n > best.n)) best = { userId: r.userId, n };
    }
    if (best) {
      const u = await ctx.db.get(best.userId as Doc<'users'>['_id']);
      if (u && !u.wasTop) await ctx.db.patch(u._id, { wasTop: true });
    }
    return { saved: rows.length, dropped: drop.length };
  },
});

/**
 * Recalcule le classement (cron toutes les 5 min ; `all` : tout le monde, après une mise en ligne). Sans `all`, seuls
 * les joueurs actifs depuis leur dernière ligne (lastSeenAt) et les lignes de plus de 6 h — un échange accepté pendant
 * qu'on est hors ligne est rattrapé par ce tour complet. Joueurs bannis ou supprimés : ligne retirée.
 */
export const refreshRanks = internalAction({
  args: { all: v.optional(v.boolean()) },
  handler: async (ctx, { all }): Promise<{ saved: number; dropped: number }> => {
    const plan = await ctx.runQuery(internal.profiles.rankPlan, {});
    const now = Date.now();
    const live = new Set(plan.users.filter((u) => !u.banned).map((u) => u.id as string));
    const drop = plan.rows.filter((r) => !live.has(r.userId)).map((r) => r.id);
    const rows: Array<{ userId: Doc<'users'>['_id']; row: RankRow }> = [];
    for (const u of plan.users) {
      if (u.banned) continue;
      const stale = all || !u.at || u.seen >= u.at - 60_000 || now - u.at > 6 * 3600_000;
      if (!stale) continue;
      const row = await ctx.runQuery(internal.profiles.rankRow, { userId: u.id });
      if (row) rows.push({ userId: u.id, row });
    }
    if (!rows.length && !drop.length) return { saved: 0, dropped: 0 };
    return await ctx.runMutation(internal.profiles.saveRanks, { rows, drop });
  },
});

/**
 * (retours live 6, C15) titre « Numéro un » — gardé pour les anciens appels manuels : recalcule tout (saveRanks marque
 * le premier). Le cron passe désormais par `refreshRanks`.
 */
export const markLeader = internalAction({
  args: {},
  handler: async (ctx): Promise<{ saved: number; dropped: number }> => await ctx.runAction(internal.profiles.refreshRanks, { all: true }),
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
  args: { sessionToken: v.string(), banner: v.optional(v.string()), frame: v.optional(v.string()), title: v.optional(v.string()), badges: v.optional(v.array(v.string())), accent: v.optional(v.string()), vitrine: v.optional(v.string()), vitrineColor: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, banner, frame, title, badges, accent, vitrine, vitrineColor }) => {
    const user = await requireUser(ctx, sessionToken);
    const { stats } = await statsOf(ctx, user);
    const clean = cleanCosmetics({ banner, frame, title, badges, accent, vitrine, vitrineColor }, stats);
    // (11/11) l'animation d'ouverture se choisit ailleurs (fiche booster, `setOpening`) : on la garde telle quelle
    const opening = user.cosmetics?.opening;
    await ctx.db.patch(user._id, { cosmetics: opening ? { ...clean, opening } : clean });
    return clean;
  },
});

/**
 * (11/11, chantier ouvertures-saisons) Animation d'ouverture des boosters : la déchirure pour tous, les autres se
 * gagnent par un succès (src/core/cosmetics.ts, OPENINGS). Verrouillée → refusée (message clair). Rangée dans
 * `users.cosmetics.opening` (absente = la déchirure) ; `users.me` la renvoie au client.
 */
export const setOpening = mutation({
  args: { sessionToken: v.string(), style: v.string() },
  handler: async (ctx, { sessionToken, style }) => {
    const user = await requireUser(ctx, sessionToken);
    const o = OPENINGS.find((x) => x.id === style);
    if (!o) throw new ConvexError('Animation d’ouverture inconnue.');
    if (o.need) {
      const { stats } = await statsOf(ctx, user);
      if (!o.unlock(stats)) throw new ConvexError(`Pas encore débloquée. ${o.how}`);
    }
    const { opening: _old, ...rest } = user.cosmetics ?? {};
    await ctx.db.patch(user._id, { cosmetics: o.id === DEFAULT_OPENING ? rest : { ...rest, opening: o.id } });
    return { style: o.id };
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
