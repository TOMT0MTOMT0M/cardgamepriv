import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { applyRegen } from '../src/core/packRegen';
import { dailyMissionCoins } from '../src/core/weekly';
import { addCoins } from './econLib';
import {
  applyMissionEvent,
  claimMission,
  claimMissionBonus,
  cleanMissions,
  currentMissions,
  nextMissionReset,
  rerollMission,
  type MissionEvent,
  type MissionsState,
} from '../src/core/missions';

/** Missions du jour (3 tirées au hasard par joueur et par jour) : cf. src/core/missions.ts. */

const stateOf = (u: Doc<'users'>, now: number) => currentMissions(u.missions as MissionsState | undefined, u._id, now);

export const mine = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;
    const now = Date.now();
    return { ...stateOf(user, now), resetAt: nextMissionReset(now) };
  },
});

/** Appelé par les ouvertures, contrats et échanges : fait avancer les missions du jour. */
export async function bumpMissions(ctx: MutationCtx, user: Doc<'users'>, ev: MissionEvent) {
  const fresh = await ctx.db.get(user._id);
  if (!fresh) return;
  const { state, changed } = applyMissionEvent(stateOf(fresh, Date.now()), ev);
  if (changed) await ctx.db.patch(user._id, { missions: cleanMissions(state) });
}

/** Ajoute des boosters à la réserve (au-dessus du plafond si besoin), recharge appliquée d'abord. */
async function grant(ctx: MutationCtx, user: Doc<'users'>, n: number, missions: MissionsState) {
  const now = Date.now();
  const regen = applyRegen(user.packBalance, user.packRegenAt ?? user.lastSeenAt, now);
  await ctx.db.patch(user._id, { packBalance: regen.balance + n, packRegenAt: regen.regenAt, missions: cleanMissions(missions) });
}

export const claim = mutation({
  args: { sessionToken: v.string(), missionId: v.string() },
  handler: async (ctx, { sessionToken, missionId }) => {
    const user = await requireUser(ctx, sessionToken);
    const r = claimMission(stateOf(user, Date.now()), missionId);
    if (typeof r === 'string') throw new ConvexError(r);
    await grant(ctx, user, r.reward, r.state);
    // spec économie : les missions du jour rapportent aussi des pièces (boosters + pièces, décision du 3 nov.)
    const m = r.state.list.find((x) => x.id === missionId)!;
    const coins = dailyMissionCoins(m);
    await addCoins(ctx, user._id, coins, 'mission', 'Mission du jour', { earned: true });
    return { reward: r.reward, coins };
  },
});

export const claimBonus = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireUser(ctx, sessionToken);
    const r = claimMissionBonus(stateOf(user, Date.now()));
    if (typeof r === 'string') throw new ConvexError(r);
    await grant(ctx, user, r.reward, r.state);
    return { reward: r.reward };
  },
});

export const reroll = mutation({
  args: { sessionToken: v.string(), missionId: v.string() },
  handler: async (ctx, { sessionToken, missionId }) => {
    const user = await requireUser(ctx, sessionToken);
    const r = rerollMission(stateOf(user, Date.now()), missionId, user._id);
    if (typeof r === 'string') throw new ConvexError(r);
    await ctx.db.patch(user._id, { missions: cleanMissions(r) });
    return { ok: true };
  },
});
