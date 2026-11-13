import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { notify } from './push';
import { rarityValidator, type RarityId } from './cardsCatalog';
import { addCoins, bumpWeekly, coinsOf, patchEcon, recordFlow } from './econLib';
import { fmtCoins } from '../src/core/economy';
import { DEFI_ACCEPT_MS, DEFI_MAX_OPEN, defiGain, defiKind, defiProblem, defiWinner, type DefiKind } from '../src/core/defis';

/**
 * DÉFIS ENTRE AMIS (V2, 11/11) — règles : src/core/defis.ts.
 * Coût : aucun cron. Le départ et la fin sont programmés (`scheduler.runAt`) ; le score avance dans la mutation qui
 * crédite un booster (convex/packs.ts → `bumpChallenges`), qui ne lit que les sièges « en cours » du joueur (index,
 * le plus souvent vide). Mises en pièces en séquestre ; flux gagnant ← perdants dans `valueFlows` (anti-abus).
 */

type Challenge = Doc<'challenges'>;
const URL = '#/jeux/defis';

async function areFriends(ctx: QueryCtx, a: Id<'users'>, b: Id<'users'>) {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const l = await ctx.db.query('friendships').withIndex('by_pair', (q) => q.eq('requesterId', x).eq('addresseeId', y)).first();
    if (l?.status === 'accepted') return true;
  }
  return false;
}

const goalOf = (c: Pick<Challenge, 'kind' | 'target'>) => defiKind(c.kind as DefiKind).goal(c.target as RarityId | undefined);

async function setPhase(ctx: MutationCtx, c: Challenge, phase: (userId: Id<'users'>) => 'pending' | 'live' | 'over') {
  const seats = await ctx.db.query('challengeSeats').withIndex('by_challenge', (q) => q.eq('challengeId', c._id)).collect();
  for (const s of seats) {
    const p = phase(s.userId);
    if (s.phase !== p) await ctx.db.patch(s._id, { phase: p });
  }
}

/** Rend la mise de chaque inscrit. */
async function refundAll(ctx: MutationCtx, c: Challenge, why: string) {
  if (!c.stake) return;
  for (const p of c.players) if (p.state === 'in') await addCoins(ctx, p.userId, c.stake, 'challenge', `Défi — mise rendue (${why})`);
}

async function feed(ctx: MutationCtx, userId: Id<'users'>, message: string) {
  const u = await ctx.db.get(userId);
  if (u) await ctx.db.insert('activityFeed', { userId: u._id, displayName: u.displayName, avatarUrl: u.avatarUrl, kind: 'game', message, createdAt: Date.now() });
}

export const create = mutation({
  args: {
    sessionToken: v.string(),
    kind: v.union(v.literal('first'), v.literal('new'), v.literal('stars')),
    target: v.optional(rarityValidator),
    durationMs: v.number(),
    stake: v.number(),
    invitedIds: v.array(v.id('users')),
  },
  handler: async (ctx, { sessionToken, kind, target, durationMs, stake, invitedIds }) => {
    const u = await requireUser(ctx, sessionToken);
    const problem = defiProblem({ kind, target, durationMs, stake, invited: invitedIds }, u._id);
    if (problem) throw new ConvexError(problem);
    if (stake > coinsOf(u)) throw new ConvexError(fe('challenges.1', { p0: fmtCoins(stake - coinsOf(u)) }));
    const open = [
      ...(await ctx.db.query('challenges').withIndex('by_creator', (q) => q.eq('creatorId', u._id).eq('status', 'pending')).take(DEFI_MAX_OPEN)),
      ...(await ctx.db.query('challenges').withIndex('by_creator', (q) => q.eq('creatorId', u._id).eq('status', 'live')).take(DEFI_MAX_OPEN)),
    ];
    if (open.length >= DEFI_MAX_OPEN) throw new ConvexError(fe('challenges.2', { p0: DEFI_MAX_OPEN }));
    const invited: Doc<'users'>[] = [];
    for (const id of invitedIds) {
      const f = await ctx.db.get(id);
      if (!f) throw new ConvexError(fe('challenges.3'));
      if (!(await areFriends(ctx, u._id, id))) throw new ConvexError(fe('challenges.4', { p0: f.displayName }));
      invited.push(f);
    }
    const now = Date.now();
    const player = (x: Doc<'users'>, state: 'invited' | 'in') => ({ userId: x._id, name: x.displayName, ...(x.avatarUrl ? { avatarUrl: x.avatarUrl } : {}), state, score: 0 });
    const id = await ctx.db.insert('challenges', {
      creatorId: u._id,
      kind,
      ...(kind === 'first' ? { target } : {}),
      durationMs,
      stake,
      status: 'pending',
      players: [player(u, 'in'), ...invited.map((x) => player(x, 'invited'))],
      createdAt: now,
      acceptBy: now + DEFI_ACCEPT_MS,
    });
    if (stake) await addCoins(ctx, u._id, -stake, 'challenge', `Défi — mise en séquestre (${invited.map((x) => x.displayName).join(', ')})`);
    for (const x of [u, ...invited]) await ctx.db.insert('challengeSeats', { userId: x._id, challengeId: id, phase: 'pending', createdAt: now });
    const goal = goalOf({ kind, target });
    for (const x of invited) {
      await notify(ctx, x._id, { kind: 'game', title: `${u.displayName} te lance un défi`, body: `${goal}${stake ? ` · mise ${fmtCoins(stake)} pièces` : ''}. Accepte dans l’espace Jeux.`, url: URL, tag: `defi-${id}` });
      await ctx.db.patch(x._id, { gamesNoticeAt: now });
    }
    await ctx.scheduler.runAt(now + DEFI_ACCEPT_MS, internal.challenges.expire, { challengeId: id });
    return id;
  },
});

async function pendingOf(ctx: QueryCtx, id: Id<'challenges'>) {
  const c = await ctx.db.get(id);
  if (!c || c.status !== 'pending') throw new ConvexError(fe('challenges.5'));
  return c;
}

/** Départ : les inscrits jouent, les autres sont écartés. Personne d'autre que le créateur : annulé, mise rendue. */
async function goLive(ctx: MutationCtx, c: Challenge, by: Id<'users'> | null) {
  const players = c.players.map((p) => (p.state === 'invited' ? { ...p, state: 'out' as const } : p));
  const inn = players.filter((p) => p.state === 'in');
  const now = Date.now();
  if (inn.length < 2) {
    const cc = { ...c, players };
    await refundAll(ctx, cc, 'personne n’a accepté');
    await ctx.db.patch(c._id, { status: 'cancelled', players, resolvedAt: now, outcome: 'alone' });
    await setPhase(ctx, cc, () => 'over');
    if (by !== c.creatorId) await notify(ctx, c.creatorId, { kind: 'game', title: 'Défi annulé', body: `Personne n’a relevé ton défi${c.stake ? ' : ta mise t’est rendue' : ''}.`, url: URL, tag: `defi-${c._id}` });
    return;
  }
  const endsAt = now + c.durationMs;
  await ctx.db.patch(c._id, { status: 'live', players, startedAt: now, endsAt });
  const live = new Set(inn.map((p) => p.userId as string));
  await setPhase(ctx, c, (uid) => (live.has(uid) ? 'live' : 'over'));
  for (const p of inn) if (p.userId !== by) await notify(ctx, p.userId, { kind: 'game', title: 'Le défi commence', body: `${goalOf(c)} — à toi d’ouvrir des boosters !`, url: URL, tag: `defi-${c._id}` });
  await ctx.scheduler.runAt(endsAt, internal.challenges.finish, { challengeId: c._id });
}

export const respond = mutation({
  args: { sessionToken: v.string(), challengeId: v.id('challenges'), accept: v.boolean() },
  handler: async (ctx, { sessionToken, challengeId, accept }) => {
    const u = await requireUser(ctx, sessionToken);
    const c = await pendingOf(ctx, challengeId);
    const i = c.players.findIndex((p) => p.userId === u._id);
    if (i < 0 || c.players[i].state !== 'invited') throw new ConvexError(fe('challenges.6'));
    if (accept && c.stake) {
      if (c.stake > coinsOf(u)) throw new ConvexError(fe('challenges.7', { p0: fmtCoins(c.stake - coinsOf(u)) }));
      await addCoins(ctx, u._id, -c.stake, 'challenge', `Défi — mise en séquestre (défi de ${c.players[0].name})`);
    }
    const players = c.players.map((p, k) => (k === i ? { ...p, state: accept ? ('in' as const) : ('out' as const) } : p));
    await ctx.db.patch(c._id, { players });
    if (!accept) {
      const seat = (await ctx.db.query('challengeSeats').withIndex('by_challenge', (q) => q.eq('challengeId', c._id)).collect()).find((s) => s.userId === u._id);
      if (seat) await ctx.db.patch(seat._id, { phase: 'over' });
    }
    // tout le monde a répondu : départ (ou annulation si tout le monde a refusé)
    if (!players.some((p) => p.state === 'invited')) await goLive(ctx, { ...c, players }, u._id);
    else if (accept) await notify(ctx, c.creatorId, { kind: 'game', title: `${u.displayName} relève ton défi`, body: 'Lance-le quand tu veux, ou attends les autres.', url: URL, tag: `defi-${c._id}` });
  },
});

/** Le créateur lance sans attendre les retardataires (au moins un ami inscrit). */
export const start = mutation({
  args: { sessionToken: v.string(), challengeId: v.id('challenges') },
  handler: async (ctx, { sessionToken, challengeId }) => {
    const u = await requireUser(ctx, sessionToken);
    const c = await pendingOf(ctx, challengeId);
    if (c.creatorId !== u._id) throw new ConvexError(fe('challenges.8'));
    if (c.players.filter((p) => p.state === 'in').length < 2) throw new ConvexError(fe('challenges.9'));
    await goLive(ctx, c, u._id);
  },
});

/** Le créateur annule tant que le défi n'a pas commencé : chaque inscrit récupère sa mise. */
export const cancel = mutation({
  args: { sessionToken: v.string(), challengeId: v.id('challenges') },
  handler: async (ctx, { sessionToken, challengeId }) => {
    const u = await requireUser(ctx, sessionToken);
    const c = await pendingOf(ctx, challengeId);
    if (c.creatorId !== u._id) throw new ConvexError(fe('challenges.10'));
    await refundAll(ctx, c, 'défi annulé');
    await ctx.db.patch(c._id, { status: 'cancelled', resolvedAt: Date.now() });
    await setPhase(ctx, c, () => 'over');
    for (const p of c.players) if (p.userId !== u._id && p.state !== 'out') await notify(ctx, p.userId, { kind: 'game', title: 'Défi annulé', body: `${u.displayName} a annulé son défi${c.stake && p.state === 'in' ? ' : ta mise t’est rendue' : ''}.`, url: URL, tag: `defi-${c._id}` });
  },
});

/** Fin du délai pour accepter (programmé à la création). */
export const expire = internalMutation({
  args: { challengeId: v.id('challenges') },
  handler: async (ctx, { challengeId }) => {
    const c = await ctx.db.get(challengeId);
    if (c?.status === 'pending') await goLive(ctx, c, null);
  },
});

/** Fin du défi (programmée au départ). */
export const finish = internalMutation({
  args: { challengeId: v.id('challenges') },
  handler: async (ctx, { challengeId }) => {
    const c = await ctx.db.get(challengeId);
    if (c?.status === 'live') await resolve(ctx, c, null);
  },
});

/** Tranche le défi : `winnerIdx` imposé (« premier à ») ou meilleur score. */
async function resolve(ctx: MutationCtx, c: Challenge, forced: number | null) {
  const now = Date.now();
  const inn = c.players.map((p, i) => ({ p, i })).filter((x) => x.p.state === 'in');
  const w = forced ?? (() => {
    const k = defiWinner(inn.map((x) => x.p.score));
    return k === null ? null : inn[k].i;
  })();
  const pot = c.stake * inn.length;
  const outcome = w !== null ? 'win' : inn.some((x) => x.p.score > 0) ? 'tie' : 'nobody';
  if (w !== null) {
    const winner = c.players[w];
    if (pot) await addCoins(ctx, winner.userId, pot, 'challenge', `Défi gagné — ${goalOf(c)}`, { earned: true });
    for (const x of inn) if (x.i !== w) await recordFlow(ctx, x.p.userId, winner.userId, c.stake, 'challenge');
  } else await refundAll(ctx, c, outcome === 'tie' ? 'égalité' : 'personne n’a marqué');
  await ctx.db.patch(c._id, { status: 'done', resolvedAt: now, outcome, ...(w !== null ? { winnerId: c.players[w].userId } : {}) });
  await setPhase(ctx, c, () => 'over');
  for (const x of inn) {
    const won = x.i === w;
    await patchEcon(ctx, x.p.userId, (e) => ({ ...e, gamesPlayed: e.gamesPlayed + 1, gamesWon: e.gamesWon + (won ? 1 : 0) }));
    await bumpWeekly(ctx, x.p.userId, { type: 'game', won });
    await ctx.db.patch(x.p.userId, { gamesNoticeAt: now });
    const body =
      w === null
        ? `${outcome === 'tie' ? 'Égalité en tête' : 'Personne n’a marqué'}${c.stake ? ' : chacun récupère sa mise' : ''}.`
        : won
          ? `Tu remportes le défi${pot ? ` et ${fmtCoins(pot)} pièces` : ''} !`
          : `${c.players[w].name} remporte le défi${pot ? ` (${fmtCoins(pot)} pièces)` : ''}.`;
    await notify(ctx, x.p.userId, { kind: 'game', title: 'Défi terminé', body, url: URL, tag: `defi-${c._id}` });
  }
  if (w !== null) await feed(ctx, c.players[w].userId, `${c.players[w].name} remporte un défi contre ${inn.filter((x) => x.i !== w).map((x) => x.p.name).join(', ')} : ${goalOf(c).toLowerCase()}${pot ? ` (${fmtCoins(pot)} pièces)` : ''} !`);
}

/**
 * Crochet d'ouverture (convex/packs.ts, booster crédité) : avance les défis en cours du joueur. Ne compte que les
 * boosters scellés APRÈS le départ du défi (`sealedAt` strictement plus tard).
 */
export async function bumpChallenges(ctx: MutationCtx, userId: Id<'users'>, sealedAt: number, cards: Array<{ rarity: RarityId; isNew: boolean }>) {
  const seats = await ctx.db.query('challengeSeats').withIndex('by_user_phase', (q) => q.eq('userId', userId).eq('phase', 'live')).take(10);
  for (const s of seats) {
    const c = await ctx.db.get(s.challengeId);
    if (!c || c.status !== 'live' || !c.startedAt || sealedAt <= c.startedAt || Date.now() > (c.endsAt ?? 0)) continue;
    const i = c.players.findIndex((p) => p.userId === userId && p.state === 'in');
    if (i < 0) continue;
    const { add, hit } = defiGain(c.kind as DefiKind, c.target as RarityId | undefined, cards);
    if (!add) continue;
    const players = c.players.map((p, k) => (k === i ? { ...p, score: p.score + add, at: Date.now() } : p));
    await ctx.db.patch(c._id, { players });
    if (hit) await resolve(ctx, { ...c, players }, i);
  }
}

// ═════════════════════════════════════════════ lecture

/** Mes 15 derniers défis (en attente, en cours, terminés) — 30 lectures au plus. */
export const mine = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const uId = await getUserIdByToken(ctx, sessionToken);
    const u = uId ? { _id: uId } : null;
    if (!u) return null;
    const seats = await ctx.db.query('challengeSeats').withIndex('by_user', (q) => q.eq('userId', u._id)).order('desc').take(15);
    const list: Challenge[] = [];
    for (const s of seats) {
      const c = await ctx.db.get(s.challengeId);
      if (c) list.push(c);
    }
    return { me: u._id, list };
  },
});
