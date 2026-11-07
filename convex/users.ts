import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserByToken, requireUser } from './auth';
import { PACK_CAP, PACK_REGEN_MS, applyRegen } from '../src/core/packRegen';
import { STREAK_REWARD, claimStreak as claimStreakState, streakClaimable, touchStreak } from '../src/core/streak';
import { catalogEntry } from '../src/core/sets/themes';

/** Taille maximale de la liste d'envies. */
export const WISHLIST_MAX = 300;
/**
 * (perf 07/11) « En ligne » = vu dans les 6 dernières minutes. Le battement de cœur (toutes les 35 s côté client)
 * n'écrit `lastSeenAt` qu'au plus toutes les 4 min : chaque écriture sur le joueur ré-exécutait toutes ses requêtes
 * (profil, économie, missions…) et celles de tout le club (amis, classement) — 75 % de la lecture de base du mois.
 */
export const SEEN_EVERY_MS = 4 * 60 * 1000;
const ONLINE_WINDOW_MS = 6 * 60 * 1000;

export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;

    const now = Date.now();
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
      nextDailyClaimAt: regen.nextAt ?? now,
      /** pity 6★ (src/core/pity.ts) */
      pityCount: user.pityCount ?? 0,
      wishlist: user.wishlist ?? [],
      /** série de connexion (src/core/streak.ts) — telle qu'enregistrée ; le client affiche aussi « aujourd'hui » via touchStreak */
      streak: user.streak ?? null,
      streakClaimable: streakClaimable(user.streak),
      /** pochettes de sous-thème épinglées (vue Albums) */
      covers: user.covers ?? {},
      /** (ouverture 07/11) équipe (admin / modérateur) : passe le compte à rebours */
      staff: !!(user.isAdmin || user.isModerator),
      /** compte pseudo (sans Discord) */
      pwAccount: user.discordId.startsWith('pw:'),
      /** (ouverture 07/11) visite guidée automatique déjà jouée */
      guideSeen: !!user.guideSeenAt,
    };
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
      if (!e) throw new ConvexError('Carte inconnue.');
      const inv = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', cardId).eq('rarity', e.rarity)).unique();
      if (!inv || inv.count < 1) throw new ConvexError(`Tu n’as pas ${e.name}.`);
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
    if (!catalogEntry(cardId)) throw new ConvexError('Carte inconnue.');
    const list = user.wishlist ?? [];
    const next = list.includes(cardId) ? list.filter((id) => id !== cardId) : [...list, cardId];
    if (next.length > WISHLIST_MAX) throw new ConvexError(`${WISHLIST_MAX} envies au maximum : fais un peu de tri.`);
    await ctx.db.patch(user._id, { wishlist: next });
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
    const patch = {
      ...(dev ? { devices: dev } : {}),
      ...(now - user.lastSeenAt >= SEEN_EVERY_MS ? { lastSeenAt: now } : {}),
      ...(streak ? { streak } : {}),
      // comptes d'avant la recharge : on fige le départ du minuteur (sinon il glisserait avec lastSeenAt)
      ...(user.packRegenAt === undefined ? { packRegenAt: user.lastSeenAt } : {}),
      ...(statusText !== undefined && statusText !== user.statusText ? { statusText } : {}),
    };
    // rien de neuf : AUCUNE écriture (sinon toutes les requêtes qui lisent ce joueur repartent)
    if (Object.keys(patch).length) await ctx.db.patch(user._id, patch);
    return { ok: true };
  },
});

/** (ouverture 07/11) La visite guidée automatique a démarré : elle ne se rejouera plus jamais sur ce compte. */
export const markGuideSeen = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    if (!u.guideSeenAt) await ctx.db.patch(u._id, { guideSeenAt: Date.now() });
  },
});
