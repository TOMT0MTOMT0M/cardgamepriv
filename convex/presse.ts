import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { packChoiceValidator } from './schema';
import { addCoins, bumpWeekly, coinsOf, patchEcon, secureRandom } from './econLib';
import { fmtCoins } from '../src/core/economy';
import { nextMissionReset } from '../src/core/missions';
import { validPackChoice, packChoiceLabel, type PackChoice } from '../src/core/games';
import { PRESSE_DAILY, PRESSE_STRIKES, presseBetProblem, presseCracks, presseStrip, presseValue } from '../src/core/presse';
import { syncPresence } from './presence';

/**
 * LA PRESSE (V2, 11/11) — mini-jeu contre la maison, règles : src/core/presse.ts.
 * Une partie = 1 document. La bande est gravée au départ (tirage serveur) et ne sort que frappe par frappe : la
 * lecture `current` ne renvoie que les cartes déjà frappées. 2 à 7 mutations par partie, pas de cron.
 */

type Run = Doc<'presseRuns'>;

/** Ce que voit le joueur : jamais les frappes à venir. */
const view = (r: Run) => ({
  _id: r._id,
  bet: r.bet,
  album: r.album,
  cards: r.strip.slice(0, r.shown),
  shown: r.shown,
  status: r.status,
  value: presseValue(r.bet, r.strip.slice(0, r.status === 'cracked' ? r.shown - 1 : r.shown)),
  ...(r.payout !== undefined ? { payout: r.payout } : {}),
  createdAt: r.createdAt,
});
export type PresseRunView = ReturnType<typeof view>;

const dayStart = (now: number) => nextMissionReset(now) - 24 * 3600_000;
async function playedToday(ctx: MutationCtx, userId: Id<'users'>, now: number) {
  return (await ctx.db.query('presseRuns').withIndex('by_user', (q) => q.eq('userId', userId).gte('createdAt', dayStart(now))).take(PRESSE_DAILY)).length;
}

async function liveRun(ctx: MutationCtx, userId: Id<'users'>) {
  return await ctx.db.query('presseRuns').withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'live')).first();
}

/** Fin de partie : pièces, compteurs, fil pour les belles pièces. */
async function close(ctx: MutationCtx, r: Run, status: 'cashed' | 'cracked') {
  const now = Date.now();
  const shown = r.shown;
  const payout = status === 'cashed' ? presseValue(r.bet, r.strip.slice(0, shown)) : 0;
  if (payout) {
    await addCoins(ctx, r.userId, payout, 'presse', `La Presse — pièce encaissée (${shown} frappe${shown > 1 ? 's' : ''})`);
    // « pièces gagnées » (succès Tirelire) : seulement le bénéfice, pas la mise qui revient
    if (payout > r.bet) await patchEcon(ctx, r.userId, (e) => ({ ...e, earned: e.earned + payout - r.bet }));
  }
  const won = payout > r.bet;
  await ctx.db.patch(r._id, { status, payout, endedAt: now });
  await patchEcon(ctx, r.userId, (e) => ({ ...e, gamesPlayed: e.gamesPlayed + 1, gamesWon: e.gamesWon + (won ? 1 : 0) }));
  await bumpWeekly(ctx, r.userId, { type: 'game', won });
  if (payout >= 4 * r.bet) {
    const u = await ctx.db.get(r.userId);
    if (u) await ctx.db.insert('activityFeed', { userId: u._id, displayName: u.displayName, avatarUrl: u.avatarUrl, kind: 'game', message: `${u.displayName} sort de La Presse une pièce à ${fmtCoins(payout)} pièces (${shown} frappes, mise ${r.bet}) !`, createdAt: now });
  }
  return { ...r, status, payout, endedAt: now };
}

/** Mise + album → la bande est gravée, la première frappe est offerte. */
export const start = mutation({
  args: { sessionToken: v.string(), bet: v.number(), album: packChoiceValidator },
  handler: async (ctx, { sessionToken, bet, album }) => {
    const u = await requireUser(ctx, sessionToken);
    if (!validPackChoice(album as PackChoice)) throw new ConvexError('Album inconnu.');
    if (await liveRun(ctx, u._id)) throw new ConvexError('Une pièce est déjà sous la presse : frappe ou encaisse-la.');
    const now = Date.now();
    const problem = presseBetProblem(bet, coinsOf(u), await playedToday(ctx, u._id, now));
    if (problem) throw new ConvexError(problem);
    await addCoins(ctx, u._id, -bet, 'presse', `La Presse — mise (${packChoiceLabel(album as PackChoice)})`);
    const a = album.kind === 'theme' ? { kind: 'theme' as const, themeId: album.themeId } : { kind: 'bebou' as const };
    const id = await ctx.db.insert('presseRuns', { userId: u._id, bet, album: a, strip: presseStrip(a, secureRandom), shown: 1, status: 'live', createdAt: now });
    await ctx.db.patch(u._id, { statusText: 'Fait tourner La Presse' });
    await syncPresence(ctx, u._id);
    return view((await ctx.db.get(id))!);
  },
});

/** Frappe suivante : la carte est dévoilée ; même rareté que la précédente = la pièce se fend. */
export const strike = mutation({
  args: { sessionToken: v.string(), runId: v.id('presseRuns') },
  handler: async (ctx, { sessionToken, runId }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = await ctx.db.get(runId);
    if (!r || r.userId !== u._id) throw new ConvexError('Partie introuvable.');
    if (r.status !== 'live') return view(r);
    const next = { ...r, shown: r.shown + 1 };
    if (presseCracks(r.strip, r.shown)) return view(await close(ctx, next, 'cracked'));
    if (next.shown >= PRESSE_STRIKES) return view(await close(ctx, next, 'cashed'));
    await ctx.db.patch(r._id, { shown: next.shown });
    return view(next);
  },
});

export const cashOut = mutation({
  args: { sessionToken: v.string(), runId: v.id('presseRuns') },
  handler: async (ctx, { sessionToken, runId }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = await ctx.db.get(runId);
    if (!r || r.userId !== u._id) throw new ConvexError('Partie introuvable.');
    if (r.status !== 'live') return view(r);
    return view(await close(ctx, r, 'cashed'));
  },
});

/** Partie en cours (ou la dernière), parties jouées aujourd'hui, 8 dernières pièces. */
export const current = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const uId = await getUserIdByToken(ctx, sessionToken);
    const u = uId ? { _id: uId } : null;
    if (!u) return null;
    const now = Date.now();
    const recent = await ctx.db.query('presseRuns').withIndex('by_user', (q) => q.eq('userId', u._id)).order('desc').take(PRESSE_DAILY);
    const today = recent.filter((r) => r.createdAt >= dayStart(now)).length;
    return { run: recent[0] ? view(recent[0]) : null, today, past: recent.slice(0, 8).filter((r) => r.status !== 'live').map((r) => ({ _id: r._id, bet: r.bet, shown: r.shown, status: r.status, payout: r.payout ?? 0, createdAt: r.createdAt })) };
  },
});
