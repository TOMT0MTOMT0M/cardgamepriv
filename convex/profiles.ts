import { fe } from '../src/core/errors';
import { inParts } from './inventory';
import { v, ConvexError } from 'convex/values';
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';
import { pinnedOf } from './binders';
import { DEFAULT_OPENING, OPENINGS, bestCard, cleanCosmetics, profileMediaProblem, statsFrom, type PlayerStats } from '../src/core/cosmetics';
import { adventOpened } from '../src/core/avent';
import { streakDay, touchStreak } from '../src/core/streak';
import { PUBLIC_CARD_COUNT, SUBTHEMES, THEMES } from '../src/core/sets/themes';
import { ACHIEVEMENTS, achievementDone, achievementStats } from '../src/core/economy';
import { econOf } from './econLib';
import { seenAtOf, syncPresence } from './presence';
import { INC_CAP, INC_MARGIN_MS, collStats, incDelta, incFromRows, incOf, incUsable, saveInc, type RankInc } from './rankInc';

/**
 * PROFIL (refonte retours du 3 nov.) : identité + cosmétiques (bannière, cadre, titre, badges — débloqués en jouant),
 * vitrine, classeur épinglé, statistiques enrichies, fil d'activité et classement entre nous.
 */

/** série de connexion encore vivante (comptée aujourd'hui, ou hier) ; cassée (un jour sauté) → 0 */
function liveStreak(u: Doc<'users'>): number {
  const t = touchStreak(u.streak, Date.now());
  return !u.streak ? 0 : t === null ? u.streak.count : t.count === 1 ? 0 : u.streak.count;
}

/**
 * (audit 12/11, S05 / A8-01) SIGNATURE de tout ce dont dépendent `statsOf` et `rankRowOf`, SANS lire la collection :
 * la dernière révision de l'inventaire du joueur (convex/invRev.ts : toute écriture pose `rev`, toute suppression
 * laisse une ligne `invGone`), ses compteurs, ses cosmétiques et la taille du catalogue. Même signature = mêmes
 * statistiques : on ne relit la collection entière (≈ 4 700 documents à taille prod) que si elle a changé.
 * À FAIRE SUIVRE : un champ de `users` ajouté à `statsOf` / `rankRowOf` doit entrer ici (sinon ligne figée ≤ 24 h).
 * Catalogue retrié ou seuil de succès / cosmétique changé sans changer la taille du catalogue : monter le `1` en tête.
 */
export async function rankSigOf(ctx: QueryCtx, u: Doc<'users'>): Promise<string> {
  const [inv, gone] = await lastInvOf(ctx, u._id);
  return rankSigFrom(u, inv, gone);
}

/** dernière ligne d'inventaire écrite et dernière trace de suppression d'un joueur (2 petites lectures d'index) */
async function lastInvOf(ctx: QueryCtx, userId: Doc<'users'>['_id']) {
  return await Promise.all([
    ctx.db.query('inventory').withIndex('by_user_rev', (q) => q.eq('userId', userId)).order('desc').first(),
    ctx.db.query('invGone').withIndex('by_user_rev', (q) => q.eq('userId', userId)).order('desc').first(),
  ]);
}

function rankSigFrom(u: Doc<'users'>, inv: Doc<'inventory'> | null, gone: Doc<'invGone'> | null): string {
  const e = econOf(u);
  return JSON.stringify([
    1, PUBLIC_CARD_COUNT, SUBTHEMES.length,
    inv?._id ?? '', inv?.rev ?? 0, inv?.count ?? 0, inv?.lastPulledAt ?? 0, gone?._id ?? '',
    u.displayName, u.avatarUrl ?? '', u.cosmetics ?? null,
    u.totalPacksOpened, u.totalTrades ?? 0, u.totalContracts ?? 0, liveStreak(u), u.wasTop ? 1 : 0, u.seasonPodiums ?? 0, u.seasonWins ?? 0,
    e.earned, e.burned, e.gamesPlayed, e.gamesWon, e.rouletteWins,
    // (ajouté seulement quand il existe : la signature des autres joueurs ne change pas, rien n'est recalculé pour eux)
    ...(u.season0Top || u.season0Player ? [u.season0Top ?? 0, u.season0Player ?? 0] : []),
    // (v2.1.13) cases de l'Avent (cosmétiques de Noël) : même principe
    ...(adventOpened(u).length ? [adventOpened(u).join('.')] : []),
  ]);
}

/**
 * Statistiques d'un joueur sans relire sa collection quand sa ligne de classement est à jour (même signature) ;
 * sinon calcul complet. Mêmes valeurs que `statsOf(...).stats`.
 */
export async function statsCached(ctx: QueryCtx, u: Doc<'users'>): Promise<PlayerStats> {
  const [sig, row] = await Promise.all([rankSigOf(ctx, u), ctx.db.query('rankRows').withIndex('by_user', (q) => q.eq('userId', u._id)).first()]);
  if (row?.stats && row.sig === sig) return row.stats as PlayerStats;
  // (26/11) collection changée depuis la ligne : par différence (convex/rankInc.ts) plutôt qu'en la relisant entière
  return (await statsFast(ctx, u)).stats;
}

/** ce que les statistiques prennent du document joueur (tout sauf la collection) */
function extraOf(u: Doc<'users'>) {
  // (retours live 6) + doublons brûlés (titres de la forge) et « a été n°1 » (titre Numéro un)
  return { packsOpened: u.totalPacksOpened, tradesDone: u.totalTrades ?? 0, contractsSigned: u.totalContracts ?? 0, streak: liveStreak(u), burned: econOf(u).burned, wasTop: u.wasTop ? 1 : 0, seasonPodiums: u.seasonPodiums ?? 0, seasonWins: u.seasonWins ?? 0, season0Top: u.season0Top ?? 0, season0Player: u.season0Player ?? 0, ...(adventOpened(u).length ? { advent: adventOpened(u) } : {}) };
}

/** Statistiques d'un joueur (déblocages, classement). Relit la collection entière : le profil en a besoin. */
export async function statsOf(ctx: QueryCtx, u: Doc<'users'>): Promise<{ stats: PlayerStats; collection: Doc<'inventory'>[] }> {
  const collection = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', u._id)).collect();
  const stats = statsFrom(collection, extraOf(u));
  return { stats, collection };
}

/**
 * (26/11, coût Convex) Statistiques d'un joueur SANS relire sa collection quand ses compteurs sont gardés
 * (convex/rankInc.ts : seules les lignes changées depuis le dernier calcul sont relues). Sinon relecture complète, et
 * les compteurs repartent de là. Mêmes valeurs que `statsOf(...).stats`. `inc` : à enregistrer (`saveInc`).
 */
export async function statsFast(ctx: QueryCtx, u: Doc<'users'>): Promise<{ stats: PlayerStats; inc: RankInc | null }> {
  const now = Date.now();
  const kept = await incOf(ctx, u._id);
  if (kept && incUsable(kept.inc, now)) {
    const inc = await incDelta(ctx, u._id, kept.inc, now);
    if (inc) return { stats: { ...extraOf(u), total: PUBLIC_CARD_COUNT, ...collStats(inc) }, inc };
  }
  const [{ stats, collection }, gone] = await Promise.all([
    statsOf(ctx, u),
    ctx.db.query('invGone').withIndex('by_user_rev', (q) => q.eq('userId', u._id).gte('rev', now - INC_MARGIN_MS)).take(INC_CAP + 1),
  ]);
  return { stats, inc: incFromRows(collection, gone, now) };
}

export const profile = query({
  // (audit 12/11, S07 / A4-02) `withCollection` (client V2, profil d'un ami) : sa collection en 4 champs dans la même
  // réponse — une seule lecture de la collection au lieu de deux (profil + inventory.userCollection).
  // (v2.0.5) `parts` : la collection en tranches (`collectionParts`), un tableau Convex ne dépassant pas 8 192 éléments
  args: { userId: v.id('users'), withCollection: v.optional(v.boolean()), parts: v.optional(v.boolean()) },
  handler: async (ctx, { userId, withCollection, parts }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;
    const pinned = await pinnedOf(ctx, userId);
    const { stats, collection } = await statsOf(ctx, u);
    const top = bestCard(collection);
    const ids = new Set(collection.map((c) => c.cardId));
    return {
      id: u._id,
      name: u.displayName,
      avatarUrl: u.avatarMedia ? u.avatarDiscord : u.avatarUrl,
      /** photo / bannière importées (GIF ou image) — absentes : avatar Discord, bannière cosmétique */
      avatarMedia: (u.avatarMedia && (await ctx.storage.getUrl(u.avatarMedia))) || undefined,
      bannerMedia: (u.bannerMedia && (await ctx.storage.getUrl(u.bannerMedia))) || undefined,
      bio: u.bio,
      showcase: u.showcase ?? [],
      packsOpened: u.totalPacksOpened,
      joinedAt: u._creationTime,
      lastSeenAt: await seenAtOf(ctx, u),
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
      ...(withCollection && !parts ? { collection: collection.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber })) } : {}),
      ...(withCollection && parts ? { collectionParts: inParts(collection.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber }))).parts } : {}),
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
async function rankRowOf(ctx: QueryCtx, u: Doc<'users'>, known?: PlayerStats) {
  const stats = known ?? (await statsOf(ctx, u)).stats;
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
    if (old && now - old.updatedAt < 20_000) return { ok: true, changed: false };
    // (audit 12/11, S05 / A6-03) rien n'a changé depuis ma ligne : pas de relecture de la collection, pas d'écriture
    const sig = await rankSigOf(ctx, u);
    if (old?.stats && old.sig === sig) return { ok: true, changed: false };
    // (26/11) par différence (convex/rankInc.ts) : seules les lignes changées depuis le dernier calcul sont relues
    const { stats, inc } = await statsFast(ctx, u);
    const row = await rankRowOf(ctx, u, stats);
    if (old) await ctx.db.patch(old._id, { row, sig, stats, updatedAt: now });
    else await ctx.db.insert('rankRows', { userId: u._id, row, sig, stats, updatedAt: now });
    await saveInc(ctx, u._id, inc);
    return { ok: true, changed: true };
  },
});

/** joueur vu depuis le calcul de sa ligne (battement de cœur au plus toutes les 4 min : marge de 5 min) */
const SEEN_MARGIN_MS = 5 * 60_000;
/**
 * … et vu il y a moins de 25 min : un geste fait avant de partir (au plus 4 min après sa dernière présence) est vu par
 * un des passages du cron (toutes les 10 min) dans ce délai ; au-delà, inutile de relire son document à chaque passage.
 */
const LOOK_MS = 25 * 60_000;
/** personne n'est passé depuis : le cron ne relit rien de plus (ni lignes ni joueurs) */
const IDLE_MS = 20 * 60_000;

/**
 * Joueurs, dernière activité, et date de leur ligne du classement (pour savoir qui recalculer).
 * (26/11, coût Convex) AVANT : les 33 documents joueurs (2,7 Ko chacun) à chaque passage, 133 Ko lus toutes les 5 min
 * même la nuit. MAINTENANT : la carte publique (`presence`, 0,3 Ko) dit qui est passé ; seul un joueur passé depuis
 * sa ligne, dont la collection a bougé (dernière écriture / suppression d'inventaire), sans ligne ou à la ligne de plus
 * de 24 h est relu en entier pour sa signature. Personne depuis 20 min : rien d'autre n'est lu (`idle`).
 */
export const rankPlan = internalQuery({
  args: { all: v.optional(v.boolean()) },
  handler: async (ctx, { all }) => {
    const now = Date.now();
    const pres = await ctx.db.query('presence').collect();
    if (!all && pres.length && pres.every((p) => now - p.lastSeenAt > IDLE_MS)) return { idle: true, users: [], rows: [] };
    const rows = await ctx.db.query('rankRows').collect();
    const by = new Map(rows.map((r) => [r.userId as string, r]));
    const seen = new Map(pres.map((p) => [p.userId as string, p]));
    // joueurs : ceux de la présence, et ceux d'une ligne sans présence (relus pour savoir s'ils existent encore) ;
    // table de présence vide (base neuve) : tous les documents joueurs, comme avant
    const all0 = pres.length ? null : await ctx.db.query('users').collect();
    const docs = new Map((all0 ?? []).map((u) => [u._id as string, u]));
    const ids = all0 ? all0.map((u) => u._id) : [...new Set([...pres.map((p) => p.userId), ...rows.map((r) => r.userId)])];
    const users = await Promise.all(
      ids.map(async (id) => {
        const r = by.get(id);
        const p = seen.get(id);
        const at = r?.updatedAt ?? 0;
        const rowSig = r?.stats ? (r.sig ?? '') : '';
        const [inv, gone] = await lastInvOf(ctx, id);
        const changed = Math.max(inv?.rev ?? 0, gone?.rev ?? 0) >= at - INC_MARGIN_MS;
        const look = all || !p || !r || changed || now - at > 24 * 3600_000 || (p.lastSeenAt >= at - SEEN_MARGIN_MS && now - p.lastSeenAt < LOOK_MS);
        if (!look) return { id, banned: !!p.bannedAt, at, sig: rowSig, rowSig };
        const u = docs.get(id) ?? (await ctx.db.get(id));
        if (!u) return null;
        // (audit 12/11, S05) `sig` : signature du moment ; `rowSig` : celle de sa ligne
        return { id, banned: !!u.bannedAt, at, sig: u.bannedAt ? '' : rankSigFrom(u, inv, gone), rowSig };
      }),
    );
    return {
      idle: false,
      users: users.filter((x) => x !== null),
      rows: rows.map((r) => ({ id: r._id, userId: r.userId })),
    };
  },
});

/** la ligne d'un joueur (par différence quand ses compteurs sont gardés, sinon sa collection seulement) */
export const rankRow = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u || u.bannedAt) return null;
    // signature et statistiques prises dans la même lecture que la ligne : elles vont ensemble dans `rankRows`
    const [sig, { stats, inc }] = await Promise.all([rankSigOf(ctx, u), statsFast(ctx, u)]);
    return { row: await rankRowOf(ctx, u, stats), sig, stats, inc };
  },
});

export const saveRanks = internalMutation({
  args: { rows: v.array(v.object({ userId: v.id('users'), row: v.any(), sig: v.optional(v.string()), stats: v.optional(v.any()), inc: v.optional(v.any()) })), drop: v.array(v.id('rankRows')) },
  handler: async (ctx, { rows, drop }) => {
    const now = Date.now();
    for (const id of drop) await ctx.db.delete(id);
    // (audit 12/11, A8-03) le « Numéro un » ne peut changer que si une ligne a bougé en cartes différentes (ou a
    // disparu) : sinon la table n'est pas relue en entier à chaque passage qui écrit
    let moved = drop.length > 0;
    for (const { userId, row, sig, stats, inc } of rows) {
      const old = await ctx.db.query('rankRows').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      if (!old || (old.row as RankRow | undefined)?.uniques !== (row as RankRow).uniques) moved = true;
      if (old) await ctx.db.patch(old._id, { row, sig, stats, updatedAt: now });
      else await ctx.db.insert('rankRows', { userId, row, sig, stats, updatedAt: now });
      await saveInc(ctx, userId, inc as RankInc | null | undefined);
    }
    if (!moved) return { saved: rows.length, dropped: drop.length };
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
 * les joueurs dont la signature a changé (collection, compteurs, cosmétiques : `rankSigOf`) et les lignes de plus de
 * 24 h — un échange accepté pendant qu'on est hors ligne change la signature. Joueurs bannis ou supprimés : ligne retirée.
 */
export const refreshRanks = internalAction({
  args: { all: v.optional(v.boolean()) },
  handler: async (ctx, { all }): Promise<{ saved: number; dropped: number }> => {
    const plan = await ctx.runQuery(internal.profiles.rankPlan, { all });
    // (26/11) personne depuis 20 min : rien à recalculer (surtout pas « retirer » les lignes d'un plan vide)
    if (plan.idle) return { saved: 0, dropped: 0 };
    const now = Date.now();
    const live = new Set(plan.users.filter((u) => !u.banned).map((u) => u.id as string));
    const drop = plan.rows.filter((r) => !live.has(r.userId)).map((r) => r.id);
    const rows: Array<{ userId: Doc<'users'>['_id']; row: RankRow; sig: string; stats: PlayerStats; inc: RankInc | null }> = [];
    for (const u of plan.users) {
      if (u.banned) continue;
      // (audit 12/11, S05 / A8-01) AVANT : tout joueur vu depuis sa ligne était recalculé toutes les 5 min, collection
      // entière. MAINTENANT : seulement si sa signature a changé (rankSigOf) ; filet de sécurité : une fois par 24 h.
      const stale = all || !u.at || u.sig !== u.rowSig || now - u.at > 24 * 3600_000;
      if (!stale) continue;
      const r = await ctx.runQuery(internal.profiles.rankRow, { userId: u.id });
      if (r) rows.push({ userId: u.id, ...r });
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
    if (cards.length > MAX_SHOWCASE) throw new ConvexError(fe('profiles.1', { p0: MAX_SHOWCASE }));
    for (const c of cards) {
      if (!catalogCard(c.cardId)) throw new ConvexError(fe('profiles.2'));
      const inv = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', c.cardId).eq('rarity', c.rarity))
        .unique();
      if (!inv || inv.count < 1) throw new ConvexError(fe('profiles.4', { p0: catalogCard(c.cardId)?.name ?? 'cette carte' }));
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
  args: { sessionToken: v.string(), banner: v.optional(v.string()), frame: v.optional(v.string()), title: v.optional(v.string()), badges: v.optional(v.array(v.string())), accent: v.optional(v.string()), vitrine: v.optional(v.string()), vitrineColor: v.optional(v.string()),
    // (14/11, refonte de la personnalisation) fond du profil, style d'écriture du titre
    background: v.optional(v.string()), titleStyle: v.optional(v.string()),
    // (v2.1.13) animation de profil (cosmétiques de Noël)
    pfx: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, banner, frame, title, badges, accent, vitrine, vitrineColor, background, titleStyle, pfx }) => {
    const user = await requireUser(ctx, sessionToken);
    const stats = await statsCached(ctx, user); // (audit 12/11, A6-11) sans relire l'inventaire si la ligne de classement est à jour
    const clean = cleanCosmetics({ banner, frame, title, badges, accent, vitrine, vitrineColor, background, titleStyle, pfx: pfx ?? user.cosmetics?.pfx }, stats); // pfx absent = onglet d'avant v2.1.13 : on garde l'animation choisie
    // (11/11) l'animation d'ouverture se choisit ailleurs (fiche booster, `setOpening`) : on la garde telle quelle
    const opening = user.cosmetics?.opening;
    await ctx.db.patch(user._id, { cosmetics: opening ? { ...clean, opening } : clean });
    // (14/11) cadre, titre et couleur suivent dans la carte publique (chat, amis) : une écriture, seulement à l'enregistrement
    await syncPresence(ctx, user._id);
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
    if (!o) throw new ConvexError(fe('profiles.5'));
    if (o.need || o.advent) {
      const stats = await statsCached(ctx, user);
      if (!o.unlock(stats)) throw new ConvexError(fe('profiles.6', { p0: o.how }));
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
      if (!meta) throw new ConvexError(fe('profiles.7'));
      const owner = await ctx.db.query('profileMedia').withIndex('by_storage', (q) => q.eq('storageId', storageId)).unique();
      if (owner && owner.userId !== user._id) throw new ConvexError(fe('profiles.8'));
      const bad = profileMediaProblem(meta.size, meta.contentType);
      if (bad) {
        if (!owner) await ctx.storage.delete(storageId);
        return { error: bad };
      }
      if (!owner) await ctx.db.insert('profileMedia', { storageId, userId: user._id, kind, createdAt: Date.now() });
    }
    const url = storageId ? ((await ctx.storage.getUrl(storageId)) ?? undefined) : undefined;
    if (kind === 'avatar') {
      // (v2.1.18) la photo importée doit se voir partout (classement, chat, amis, marché…) : elle prend la place dans `avatarUrl`
      const applied = !!old && user.avatarUrl === (await ctx.storage.getUrl(old));
      const discord = applied ? user.avatarDiscord : user.avatarUrl;
      await ctx.db.patch(user._id, { avatarMedia: storageId, avatarUrl: url ?? discord, avatarDiscord: url ? discord : undefined });
      await syncPresence(ctx, user._id);
    } else await ctx.db.patch(user._id, { [field]: storageId });
    if (old && old !== storageId) {
      const row = await ctx.db.query('profileMedia').withIndex('by_storage', (q) => q.eq('storageId', old)).unique();
      if (row) await ctx.db.delete(row._id);
      if (await ctx.db.system.get(old)) await ctx.storage.delete(old);
    }
    return { url, error: undefined as string | undefined };
  },
});
