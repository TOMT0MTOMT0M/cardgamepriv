import { v, ConvexError } from 'convex/values';
import { mutation, query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { rarityValidator, type RarityId } from './cardsCatalog';
import { lockedCards } from './trades';
import { canModerate } from './suggestions';
import { addCoins, bumpWeekly, coinsOf, econOf } from './econLib';
import { applyRegen } from '../src/core/packRegen';
import { touchStreak } from '../src/core/streak';
import { missionDay } from '../src/core/missions';
import { statsFrom } from '../src/core/cosmetics';
import {
  CARD_VALUE,
  achievementPacks,
  achievementReward,
  achievementStats,
  burnProblem,
  calendarDay,
  calendarReward,
  claimableAchievements,
  claimableCompletions,
  PACK_PRICE,
  packBuyProblem,
  packBuysLeft,
  type StakeItem,
} from '../src/core/economy';
import { claimWeekly as claimWeeklyState, cleanWeekly, currentWeekly, nextWeekReset, type WeeklyState } from '../src/core/weekly';
import { invRev } from './invRev';
import { syncPresence } from './presence';

/**
 * ÉCONOMIE — portefeuille et sources de pièces (spec du 3 nov., src/core/economy.ts) :
 * calendrier de connexion, missions de la semaine, brûlage de doublons, primes de complétion, succès.
 * (Pièces des missions du jour : convex/missions.ts · pièces des boosters : convex/packs.ts · jeux : convex/games.ts.)
 */

async function collectionOf(ctx: QueryCtx, u: Doc<'users'>) {
  return await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', u._id)).collect();
}

async function achStats(ctx: QueryCtx, u: Doc<'users'>, inv?: Doc<'inventory'>[]) {
  const coll = inv ?? (await collectionOf(ctx, u));
  const p = statsFrom(coll, { packsOpened: u.totalPacksOpened, tradesDone: u.totalTrades ?? 0, contractsSigned: u.totalContracts ?? 0, streak: u.streak?.count ?? 0, burned: econOf(u).burned, wasTop: u.wasTop ? 1 : 0, seasonPodiums: u.seasonPodiums ?? 0, seasonWins: u.seasonWins ?? 0 });
  return achievementStats(p, econOf(u));
}

/** Calendrier du jour : position, cadeau, déjà pris ? (la série d'aujourd'hui est calculée comme au heartbeat) */
function calendarOf(u: Doc<'users'>, now: number) {
  const streak = touchStreak(u.streak, now) ?? u.streak;
  const day = calendarDay(streak?.count ?? 1);
  const today = missionDay(now);
  return { day, today, claimed: econOf(u).calendarDay === today, reward: calendarReward(day) };
}

/** Tout ce que l'interface affiche de l'économie (portefeuille, calendrier, missions de la semaine, primes en attente). */
export const state = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const u = await getUserByToken(ctx, sessionToken);
    if (!u) return null;
    const now = Date.now();
    const econ = econOf(u);
    // (perf 07/11) PLUS de lecture de l'inventaire ici : cette requête était ré-exécutée à chaque écriture sur le joueur
    // (pièces, missions, battement de cœur) et relisait toute sa collection (2e poste de lecture de base du mois).
    // Primes de complétion et succès sont recalculés par le client avec la collection qu'il a déjà (inventory.myCollection)
    // et `achInput` (src/game/ecoOnline.ts) ; les mutations d'encaissement revérifient tout côté serveur.
    const achInput = { packsOpened: u.totalPacksOpened, tradesDone: u.totalTrades ?? 0, contractsSigned: u.totalContracts ?? 0, streak: u.streak?.count ?? 0, burned: econ.burned, wasTop: u.wasTop ? 1 : 0, seasonPodiums: u.seasonPodiums ?? 0, seasonWins: u.seasonWins ?? 0 };
    return {
      achInput,
      coins: coinsOf(u),
      econ,
      calendar: calendarOf(u, now),
      weekly: { ...currentWeekly(u.weekly as WeeklyState | undefined, u._id, now), resetAt: nextWeekReset(now) },
      // onglet resté ouvert sur l'ancien client : des valeurs sûres (le nouveau client recalcule les vraies)
      completions: [] as Array<{ id: string; label: string; kind: string; size: number; reward: number }>,
      achievements: { stats: achievementStats(statsFrom([], achInput), econ), claimable: [] as string[] },
      isAdmin: !!u.isAdmin,
      // (retours 06/11) modération des suggestions : nombre de nouvelles (pastille du menu)
      isModerator: canModerate(u),
      suggestionsNew: canModerate(u) ? (await ctx.db.query('suggestions').withIndex('by_status', (q) => q.eq('status', 'nouvelle')).take(99)).length : 0,
      packShop: { price: PACK_PRICE, left: packBuysLeft(econ, missionDay(now)) },
    };
  },
});

/** Achat de boosters avec des pièces (retours 05/11) : ils rejoignent la réserve, plafond quotidien. */
export const buyPacks = mutation({
  args: { sessionToken: v.string(), count: v.number() },
  handler: async (ctx, { sessionToken, count }) => {
    const u = await requireUser(ctx, sessionToken);
    const now = Date.now();
    const today = missionDay(now);
    const econ = econOf(u);
    const problem = packBuyProblem(count, coinsOf(u), econ, today);
    if (problem) throw new ConvexError(problem);
    const bought = (econ.shopDay === today ? econ.shopBought ?? 0 : 0) + count;
    await addCoins(ctx, u._id, -count * PACK_PRICE, 'shop', `Achat de ${count} booster${count > 1 ? 's' : ''}`, { econ: { shopDay: today, shopBought: bought } });
    const fresh = (await ctx.db.get(u._id))!;
    const regen = applyRegen(fresh.packBalance, fresh.packRegenAt ?? fresh.lastSeenAt, now, fresh.regenBoostUntil);
    await ctx.db.patch(u._id, { packBalance: regen.balance + count, packRegenAt: regen.regenAt });
    return { packs: regen.balance + count, left: packBuysLeft({ ...econ, shopDay: today, shopBought: bought }, today) };
  },
});

/** Journal des pièces (les plus récentes d'abord). */
export const history = query({
  args: { sessionToken: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, limit }) => {
    const u = await getUserByToken(ctx, sessionToken);
    if (!u) return [];
    return await ctx.db
      .query('coinTx')
      .withIndex('by_user', (q) => q.eq('userId', u._id))
      .order('desc')
      .take(Math.min(limit ?? 50, 200));
  },
});

/** Cadeau du calendrier (1 fois par jour). Jour 30 : 1 000 pièces + 1 booster. */
export const claimCalendar = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    const now = Date.now();
    const cal = calendarOf(u, now);
    if (cal.claimed) throw new ConvexError('Cadeau du jour déjà pris : reviens demain.');
    const streak = touchStreak(u.streak, now);
    if (streak) await ctx.db.patch(u._id, { streak });
    await addCoins(ctx, u._id, cal.reward.coins, 'calendar', `Calendrier — jour ${cal.day}`, { earned: true, econ: { calendarDay: cal.today } });
    if (cal.reward.packs) {
      const fresh = (await ctx.db.get(u._id))!;
      const regen = applyRegen(fresh.packBalance, fresh.packRegenAt ?? fresh.lastSeenAt, now, fresh.regenBoostUntil);
      await ctx.db.patch(u._id, { packBalance: regen.balance + cal.reward.packs, packRegenAt: regen.regenAt });
    }
    return { day: cal.day, ...cal.reward };
  },
});

/** Mission de la semaine terminée → pièces. */
export const claimWeekly = mutation({
  args: { sessionToken: v.string(), missionId: v.string() },
  handler: async (ctx, { sessionToken, missionId }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = claimWeeklyState(currentWeekly(u.weekly as WeeklyState | undefined, u._id, Date.now()), missionId);
    if (typeof r === 'string') throw new ConvexError(r);
    await ctx.db.patch(u._id, { weekly: cleanWeekly(r.state) });
    await addCoins(ctx, u._id, r.reward, 'weekly', 'Mission de la semaine', { earned: true });
    return { reward: r.reward };
  },
});

/** Brûlage de doublons contre des pièces (table de valeur). Jamais le dernier exemplaire, jamais une secrète. */
export const burn = mutation({
  args: { sessionToken: v.string(), items: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() })) },
  handler: async (ctx, { sessionToken, items }) => {
    const u = await requireUser(ctx, sessionToken);
    if (items.length > 200) throw new ConvexError('Trop de cartes d’un coup.');
    const inv = await collectionOf(ctx, u);
    const row = (it: StakeItem) => inv.find((c) => c.cardId === it.cardId && c.rarity === it.rarity);
    const locked = await lockedCards(ctx, u._id);
    const problem = burnProblem(items as StakeItem[], (it) => Math.max(0, (row(it)?.count ?? 0) - 1 - (locked.get(`${it.cardId}:${it.rarity}`) ?? 0)));
    if (problem) throw new ConvexError(problem);
    let coins = 0;
    let n = 0;
    for (const it of items) {
      const r = row(it as StakeItem)!;
      await ctx.db.patch(r._id, { count: r.count - it.count, rev: invRev() });
      coins += CARD_VALUE[it.rarity as RarityId] * it.count;
      n += it.count;
    }
    const econ = econOf(u);
    await addCoins(ctx, u._id, coins, 'burn', `Brûlage de ${n} doublon${n > 1 ? 's' : ''}`, { earned: true, econ: { burned: econ.burned + n } });
    await bumpWeekly(ctx, u._id, { type: 'burn', count: n });
    await ctx.db.patch(u._id, { lastSeenAt: Date.now(), statusText: 'Fait chauffer la forge à doublons' });
    await syncPresence(ctx, u._id);
    return { coins, count: n };
  },
});

/** Primes de complétion : 5 pièces × cartes de chaque album / groupe / thème complété (toutes celles en attente). */
export const claimCompletions = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    const inv = await collectionOf(ctx, u);
    const econ = econOf(u);
    const sets = claimableCompletions(new Set(inv.map((c) => c.cardId)), econ.completions);
    if (!sets.length) throw new ConvexError('Aucune prime de complétion en attente.');
    const total = sets.reduce((a, s) => a + s.reward, 0);
    await addCoins(ctx, u._id, total, 'completion', sets.length === 1 ? `Complétion — ${sets[0].label}` : `Complétion — ${sets.length} ensembles`, {
      earned: true,
      econ: { completions: [...econ.completions, ...sets.map((s) => s.id)] },
    });
    return { coins: total, sets: sets.map((s) => ({ id: s.id, label: s.label, reward: s.reward })) };
  },
});

/** Succès atteints → pièces (tous ceux en attente). */
export const claimAchievements = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    const econ = econOf(u);
    const list = claimableAchievements(await achStats(ctx, u), econ.achievements);
    if (!list.length) throw new ConvexError('Aucun succès à réclamer.');
    const total = list.reduce((a, x) => a + achievementReward(x), 0);
    const packs = list.reduce((a, x) => a + achievementPacks(x), 0);
    await addCoins(ctx, u._id, total, 'achievement', list.length === 1 ? `Succès — ${list[0].label}` : `${list.length} succès`, {
      earned: true,
      econ: { achievements: [...econ.achievements, ...list.map((a) => a.id)] },
    });
    // récompense mixte (retours live 02, §8) : les boosters des paliers moyens et durs
    if (packs) {
      const now = Date.now();
      const fresh = (await ctx.db.get(u._id))!;
      const regen = applyRegen(fresh.packBalance, fresh.packRegenAt ?? fresh.lastSeenAt, now, fresh.regenBoostUntil);
      await ctx.db.patch(u._id, { packBalance: regen.balance + packs, packRegenAt: regen.regenAt });
    }
    // les pièces gagnées peuvent débloquer « Tirelire » : il sera réclamable au prochain passage
    return { coins: total, packs, ids: list.map((a) => a.id) };
  },
});

/**
 * SUCCÈS — comparaison entre amis (retours live 02, §9) : moi + mes amis (amitiés acceptées), avec les compteurs des
 * succès à paliers, pour savoir qui est le plus avancé sur chaque mécanique.
 */
export const friendsAchievements = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const me = await getUserByToken(ctx, sessionToken);
    if (!me) return null;
    const [outA, inA] = await Promise.all([
      ctx.db.query('friendships').withIndex('by_requester', (q) => q.eq('requesterId', me._id).eq('status', 'accepted')).collect(),
      ctx.db.query('friendships').withIndex('by_addressee', (q) => q.eq('addresseeId', me._id).eq('status', 'accepted')).collect(),
    ]);
    const ids = [me._id, ...outA.map((f) => f.addresseeId), ...inA.map((f) => f.requesterId)];
    const out = [];
    for (const id of [...new Set(ids)].slice(0, 40)) {
      const u = await ctx.db.get(id);
      if (!u) continue;
      out.push({ userId: u._id as string, name: u.displayName, avatarUrl: u.avatarUrl, me: u._id === me._id, stats: await achStats(ctx, u) });
    }
    return out;
  },
});
