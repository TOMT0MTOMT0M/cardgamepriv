import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { mutation } from './_generated/server';
import { requireUser } from './auth';
import { addCoins } from './econLib';
import { applyRegen } from '../src/core/packRegen';
import { ADVENT_YEAR, adventDay, adventOpened, adventProblem, adventReward, validDebugDay } from '../src/core/avent';
import { syncPresence } from './presence';
import { fm } from '../src/core/msgs';

/**
 * CALENDRIER DE L'AVENT (20/11, en ligne en v2.1.13 ; règles : src/core/avent.ts). Les cases ouvertes vivent sur le joueur
 * — elles débloquent aussi les cosmétiques de Noël (src/core/cosmetics.ts, `advent`, lu par convex/profiles.ts statsOf) —
 * (`users.advent`, par année) et arrivent au client avec l'économie (convex/economy.ts, ecoView) : pas de requête en
 * plus, pas de cron. La date est TOUJOURS celle du serveur (heure de Paris) ; seuls les admins peuvent simuler un jour
 * (`debugDay`) et refermer leurs cases (`debugReset`) pour tester les 24.
 */

const KEY = String(ADVENT_YEAR);

export const open = mutation({
  args: { sessionToken: v.string(), day: v.number(), debugDay: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, day, debugDay }) => {
    const u = await requireUser(ctx, sessionToken);
    const now = Date.now();
    if (debugDay !== undefined && (!u.isAdmin || !validDebugDay(debugDay))) throw new ConvexError(fe('avent.6'));
    const today = debugDay ?? adventDay(now);
    const opened = adventOpened(u);
    const problem = adventProblem(day, today, opened);
    if (problem) throw new ConvexError(problem);
    const reward = adventReward(day);
    const next = [...opened, day].sort((a, b) => a - b);
    await ctx.db.patch(u._id, { advent: { ...(u.advent ?? {}), [KEY]: next }, lastSeenAt: now });
    if (reward.coins) await addCoins(ctx, u._id, reward.coins, 'advent', fm('c.advent', { day }), { earned: true });
    // boosters : par-dessus la réserve (comme le calendrier de connexion) ; le god pack arrive avec le booster qui le porte
    const packs = (reward.packs ?? 0) + (reward.god ? 1 : 0);
    if (packs || reward.god) {
      const fresh = (await ctx.db.get(u._id))!;
      const regen = applyRegen(fresh.packBalance, fresh.packRegenAt ?? fresh.lastSeenAt, now, fresh.regenBoostUntil);
      await ctx.db.patch(u._id, { packBalance: regen.balance + packs, packRegenAt: regen.regenAt, ...(reward.god ? { godPacks: (fresh.godPacks ?? 0) + 1 } : {}) });
    }
    await syncPresence(ctx, u._id);
    return { day, reward, opened: next };
  },
});

/** Mode test (admins) : referme mes cases de l'année (les cadeaux déjà reçus restent). */
export const debugReset = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    if (!u.isAdmin) throw new ConvexError(fe('avent.6'));
    const { [KEY]: _gone, ...rest } = u.advent ?? {};
    void _gone;
    await ctx.db.patch(u._id, { advent: rest });
    return { ok: true };
  },
});
