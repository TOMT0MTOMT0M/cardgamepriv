import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { PACK_CAP, PACK_REGEN_MS, applyRegen } from '../src/core/packRegen';
import { STREAK_REWARD, claimStreak as claimStreakState, streakClaimable, touchStreak } from '../src/core/streak';
import { catalogEntry } from '../src/core/sets/themes';
import { presenceOf, syncPresence } from './presence';
import { setWish } from './wishes';

/** Taille maximale de la liste d'envies. */
export const WISHLIST_MAX = 300;
/**
 * (perf 07/11) « En ligne » = vu dans les 6 dernières minutes. Le battement de cœur (toutes les 35 s côté client)
 * n'écrit `lastSeenAt` qu'au plus toutes les 4 min : chaque écriture sur le joueur ré-exécutait toutes ses requêtes
 * (profil, économie, missions…) et celles de tout le club (amis, classement) — 75 % de la lecture de base du mois.
 */
export const SEEN_EVERY_MS = 4 * 60 * 1000;
const ONLINE_WINDOW_MS = 6 * 60 * 1000;

/** Ce que `users.me` renvoie d'un joueur (aussi dans `session.get`, audit 12/11 E1-08). */
export function meView(user: Doc<'users'>, now: number) {
  // recharge : 1 booster / 5 min, 15 max (calcul paresseux, rien n'est écrit ici ; le client refait le calcul chaque seconde)
  const packRegenAt = user.packRegenAt ?? user.lastSeenAt;
  const regen = applyRegen(user.packBalance, packRegenAt, now, user.regenBoostUntil);

  // (perf : plus de lecture de tout l'inventaire ici — cette requête est ré-exécutée à chaque battement de cœur et
  // à chaque carte gagnée ; les compteurs « cartes uniques / au total » du HUD du labo viennent de myCollection)

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
    /** (ouverture 07/11) recharge ×2 jusqu'à cet instant (absent : pas de boost) */
    boostUntil: user.regenBoostUntil && user.regenBoostUntil > now ? user.regenBoostUntil : undefined,
    packCap: PACK_CAP,
    packRegenMs: PACK_REGEN_MS,
    nextPackAt: regen.nextAt,
    totalPacksOpened: user.totalPacksOpened,
    /** ancien « +2 toutes les 12 h » : remplacé par la recharge (gardé pour le HUD du labo) */
    canClaimDaily: false,
    // (audit 12/11, E1-10) réserve pleine : valeur stable (avant : `now`, donc un résultat différent à chaque ré-exécution)
    nextDailyClaimAt: regen.nextAt ?? packRegenAt,
    /** pity 6★ (src/core/pity.ts) */
    pityCount: user.pityCount ?? 0,
    wishlist: user.wishlist ?? [],
    /** (refonte des échanges 11/11) cartes protégées : jamais proposées (convex/deals.ts) */
    tradeProtected: user.tradeProtected ?? [],
    /** série de connexion (src/core/streak.ts) — telle qu'enregistrée ; le client affiche aussi « aujourd'hui » via touchStreak */
    streak: user.streak ?? null,
    streakClaimable: streakClaimable(user.streak),
    /** pochettes de sous-thème épinglées (vue Albums) */
    covers: user.covers ?? {},
    /** (ouverture 07/11) équipe (admin / modérateur) : passe le compte à rebours */
    staff: !!(user.isAdmin || user.isModerator),
    /** (V2, bulles) derniers événements Jeux / parrainage (pastilles de la navigation) */
    gamesNoticeAt: user.gamesNoticeAt,
    referralNoticeAt: user.referralNoticeAt,
    /** compte pseudo (sans Discord) */
    pwAccount: user.discordId.startsWith('pw:'),
    /** (ouverture 07/11) visite guidée automatique déjà jouée */
    /** (version anglaise) langue du compte : `langSet` = choix manuel, repris sur un nouvel appareil (src/game/lang.ts) */
    lang: user.lang ?? 'fr',
    langSet: user.langSet === true,
    guideSeen: !!user.guideSeenAt,
    /** (13/11) tour des nouveautés V2 déjà joué */
    v2TourSeen: !!user.v2TourSeenAt,
    /** (13/11) testeur du lien V2 (variable V2_TESTERS du staging : pseudos séparés par des virgules) — pas l'équipe */
    tester: v2Testers().has(user.username.toLowerCase()),
    /** (11/11) animation d'ouverture choisie (src/core/cosmetics.ts, OPENINGS) ; absente : la déchirure */
    openingStyle: user.cosmetics?.opening,
  };
}

export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    return user ? meView(user, Date.now()) : null;
  },
});

/** Pochette d'un sous-thème (vue Albums) : la carte de son choix (même une 1★), ou rien = automatique. */
export const setSubthemeCover = mutation({
  args: { sessionToken: v.string(), subthemeId: v.string(), cardId: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, subthemeId, cardId }) => {
    const user = await requireUser(ctx, sessionToken);
    const covers = { ...(user.covers ?? {}) };
    if (cardId) {
      const e = catalogEntry(cardId);
      if (!e) throw new ConvexError(fe('users.1'));
      const inv = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', cardId).eq('rarity', e.rarity)).unique();
      if (!inv || inv.count < 1) throw new ConvexError(fe('users.2', { p0: e.name }));
      covers[subthemeId] = cardId;
    } else delete covers[subthemeId];
    await ctx.db.patch(user._id, { covers });
    return covers;
  },
});

/** Marque / retire une carte des envies. Renvoie la liste à jour. */
export const toggleWish = mutation({
  args: { sessionToken: v.string(), cardId: v.string() },
  handler: async (ctx, { sessionToken, cardId }) => {
    const user = await requireUser(ctx, sessionToken);
    if (!catalogEntry(cardId)) throw new ConvexError(fe('users.3'));
    const list = user.wishlist ?? [];
    const next = list.includes(cardId) ? list.filter((id) => id !== cardId) : [...list, cardId];
    if (next.length > WISHLIST_MAX) throw new ConvexError(fe('users.4', { p0: WISHLIST_MAX }));
    await ctx.db.patch(user._id, { wishlist: next });
    await setWish(ctx, user._id, cardId, next.includes(cardId)); // index inversé des envies (convex/wishes.ts)
    return next;
  },
});

/** Récompense de la série de connexion (jour 7 de chaque cycle) : boosters ajoutés à la réserve. */
export const claimStreak = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireUser(ctx, sessionToken);
    const now = Date.now();
    const streak = touchStreak(user.streak, now) ?? user.streak;
    const r = claimStreakState(streak);
    if (typeof r === 'string') throw new ConvexError(r);
    const regen = applyRegen(user.packBalance, user.packRegenAt ?? user.lastSeenAt, now, user.regenBoostUntil);
    await ctx.db.patch(user._id, { streak: r, packBalance: regen.balance + STREAK_REWARD, packRegenAt: regen.regenAt });
    return { reward: STREAK_REWARD };
  },
});

export const friends = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // (audit 12/11, décision 8) la liste du club ne lit plus que les cartes publiques : elle ne repart plus aux
    // écritures privées des joueurs (pièces, missions, réserve), et lit ≈ 0,3 Ko par joueur au lieu de ≈ 1,8 Ko
    const cards = await ctx.db.query('presence').collect();
    if (cards.length)
      return cards
        .filter((p) => !p.bannedAt)
        .map((p) => ({
          _id: p.userId,
          displayName: p.displayName,
          username: p.username,
          avatarUrl: p.avatarUrl,
          totalPacksOpened: p.totalPacksOpened,
          online: now - p.lastSeenAt < ONLINE_WINDOW_MS,
          statusText: p.statusText,
          lastSeenAt: p.lastSeenAt,
          /** (E1-13) âge de la dernière visite à l'horloge du SERVEUR : le client fait retomber « en ligne » sans dépendre de la sienne */
          seenAgo: Math.max(0, now - p.lastSeenAt),
        }))
        .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt - a.lastSeenAt);
    // table de présence pas encore remplie (avant migrations:backfillPresence) : comme avant
    const users = (await ctx.db.query('users').collect()).filter((u) => !u.bannedAt);
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
        seenAgo: Math.max(0, now - u.lastSeenAt),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt - a.lastSeenAt);
  },
});

export const claimDailyBooster = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireUser(ctx, sessionToken);
    throw new ConvexError(fe('users.5', { p0: PACK_REGEN_MS / 60000, p1: PACK_CAP }));
  },
});

export const heartbeat = mutation({
  args: {
    sessionToken: v.string(),
    statusText: v.optional(v.string()),
    /** id d'appareil tiré au hasard et gardé dans le navigateur (anti-abus : comptes multiples) */
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, statusText, deviceId }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return { ok: false };
    const now = Date.now();
    // série de connexion : premier battement de la journée → +1 jour (ou retour à 1)
    const streak = touchStreak(user.streak, now);
    const dev = deviceId && /^[a-z0-9-]{8,64}$/i.test(deviceId) && !(user.devices ?? []).includes(deviceId) ? [...(user.devices ?? []), deviceId].slice(-8) : null;
    // (audit 12/11, décision 8) « vu à l'instant » va dans la carte de présence, plus dans le document joueur : le
    // battement ne relance plus profil, économie et missions chez soi. Sans ligne de présence (avant la migration) : comme avant.
    const seen = await presenceOf(ctx, user._id);
    const patch = {
      ...(dev ? { devices: dev } : {}),
      ...(!seen && now - user.lastSeenAt >= SEEN_EVERY_MS ? { lastSeenAt: now } : {}),
      ...(streak ? { streak } : {}),
      // comptes d'avant la recharge : on fige le départ du minuteur (sinon il glisserait avec lastSeenAt)
      ...(user.packRegenAt === undefined ? { packRegenAt: user.lastSeenAt } : {}),
      ...(statusText !== undefined && statusText !== user.statusText ? { statusText } : {}),
    };
    // rien de neuf : AUCUNE écriture (sinon toutes les requêtes qui lisent ce joueur repartent)
    // (une écriture a lieu de toute façon — 1re visite du jour, nouvel appareil : `lastSeenAt` suit, pour le tableau de bord)
    const wrote = Object.keys(patch).length > 0;
    if (wrote) await ctx.db.patch(user._id, seen ? { ...patch, lastSeenAt: now } : patch);
    if (seen ? wrote || now - seen.lastSeenAt >= SEEN_EVERY_MS : wrote) await syncPresence(ctx, user._id, seen ? now : 0);
    return { ok: true };
  },
});

/** (ouverture 07/11) La visite guidée automatique a démarré : elle ne se rejouera plus jamais sur ce compte. */
export const markGuideSeen = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    // (13/11) un compte tout neuf a sa visite guidée : le tour des nouveautés V2 ne le concerne pas
    if (!u.guideSeenAt) await ctx.db.patch(u._id, { guideSeenAt: Date.now(), v2TourSeenAt: u.v2TourSeenAt ?? Date.now() });
  },
});

/**
 * (version anglaise) Langue effective du joueur (envoyée à la connexion et à chaque changement) : push et messages privés
 * Discord partent dans cette langue. Rien n'est écrit si elle ne change pas (une écriture sur le joueur ré-exécute ses requêtes).
 */
export const setLang = mutation({
  args: { sessionToken: v.string(), lang: v.union(v.literal('fr'), v.literal('en')), manual: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, lang, manual }) => {
    const u = await requireUser(ctx, sessionToken);
    const langSet = manual === true || (u.langSet === true && (u.lang ?? 'fr') === lang);
    if ((u.lang ?? 'fr') === lang && (u.langSet === true) === langSet) return;
    await ctx.db.patch(u._id, { lang, langSet });
  },
});

/** (13/11) Le tour des nouveautés V2 a démarré : il ne se rejouera plus sur ce compte. */
export const markV2TourSeen = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    if (!u.v2TourSeenAt) await ctx.db.patch(u._id, { v2TourSeenAt: Date.now() });
  },
});

/** (13/11) testeurs du lien V2 : variable V2_TESTERS du déploiement (pseudos, virgules) ; absente = personne */
function v2Testers(): Set<string> {
  return new Set((process.env.V2_TESTERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}
