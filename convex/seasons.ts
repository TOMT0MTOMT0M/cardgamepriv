import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { applyRegen } from '../src/core/packRegen';
import { seasonBoosters, seasonKey, seasonStandings } from '../src/core/seasons';

/**
 * (11/11, chantier ouvertures-saisons) SAISONS MENSUELLES DU CLASSEMENT — règles : src/core/seasons.ts.
 *
 * Cron horaire (`tick`) : ouvre la première saison, ajoute les joueurs arrivés en cours de route (point de départ =
 * leur collection du moment), et au changement de mois (heure de Paris) : recalcule tout le classement, FIGE la saison
 * (classement final, boosters, compteurs de podium / victoire qui débloquent cadre et titre), puis ouvre la suivante.
 * Idempotent : une saison `closed` ne se referme jamais, rejouer le cron ne redonne rien.
 *
 * Coût : lit les lignes du classement déjà calculées (`rankRows`, une par joueur) et une saison — rien sur les
 * collections. Écrit seulement quand un joueur arrive ou une fois par mois.
 */

type RankRowLite = { name?: string; avatarUrl?: string; uniques?: number; packsOpened?: number };
const lite = (r: Doc<'rankRows'>) => r.row as RankRowLite;
const baseOf = (r: Doc<'rankRows'>) => ({ userId: r.userId, uniques: lite(r).uniques ?? 0, packs: lite(r).packsOpened ?? 0 });

/** Onglet « Saison » du classement : la saison en cours (points de départ) et les 12 dernières, figées. */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db.query('seasons').withIndex('by_status', (q) => q.eq('status', 'open')).first();
    const closed = await ctx.db.query('seasons').withIndex('by_status', (q) => q.eq('status', 'closed')).order('desc').take(12);
    return {
      current: open ? { key: open.key, startAt: open.startAt, bases: open.bases.map((b) => ({ ...b, userId: b.userId as string })) } : null,
      past: closed
        .sort((a, b) => (a.key < b.key ? 1 : -1))
        .map((s) => ({ key: s.key, closedAt: s.closedAt ?? s.startAt, results: (s.results ?? []).map((r) => ({ ...r, userId: r.userId as string })) })),
    };
  },
});

/** Faut-il fermer la saison ouverte ? (le cron recalcule alors tout le classement avant de la figer) */
export const status = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const open = await ctx.db.query('seasons').withIndex('by_status', (q) => q.eq('status', 'open')).first();
    return { rollover: !!open && open.key < seasonKey(now) };
  },
});

/** Ouvre / complète / ferme la saison selon l'instant donné. Idempotent. */
export const advance = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const cur = seasonKey(now);
    const open = await ctx.db.query('seasons').withIndex('by_status', (q) => q.eq('status', 'open')).first();
    const rows = await ctx.db.query('rankRows').collect();
    if (!open) {
      // première saison (ou toutes fermées) : une saison déjà figée pour ce mois ne se rouvre pas
      if (await ctx.db.query('seasons').withIndex('by_key', (q) => q.eq('key', cur)).first()) return { action: 'none' as const, key: cur };
      await ctx.db.insert('seasons', { key: cur, status: 'open', startAt: now, bases: rows.map(baseOf) });
      return { action: 'opened' as const, key: cur };
    }
    if (open.key >= cur) {
      // joueurs arrivés en cours de saison : leur point de départ = maintenant
      const have = new Set(open.bases.map((b) => b.userId as string));
      const add = rows.filter((r) => !have.has(r.userId)).map(baseOf);
      if (add.length) await ctx.db.patch(open._id, { bases: [...open.bases, ...add] });
      return { action: add.length ? ('joined' as const) : ('none' as const), key: open.key, added: add.length };
    }
    // ── fin de saison : classement final, récompenses, historique
    const standings = seasonStandings(
      rows.map((r) => ({ userId: r.userId as string, name: lite(r).name ?? '?', avatarUrl: lite(r).avatarUrl, uniques: lite(r).uniques ?? 0, packsOpened: lite(r).packsOpened ?? 0 })),
      open.bases.map((b) => ({ ...b, userId: b.userId as string })),
    );
    const results: NonNullable<Doc<'seasons'>['results']> = [];
    for (const s of standings) {
      if (!s.rank) continue;
      const u = await ctx.db.get(s.userId as Doc<'users'>['_id']);
      if (!u || u.bannedAt) continue;
      const rank = results.length + 1;
      const boosters = seasonBoosters(rank);
      const regen = applyRegen(u.packBalance, u.packRegenAt ?? u.lastSeenAt, now, u.regenBoostUntil);
      await ctx.db.patch(u._id, {
        packBalance: regen.balance + boosters,
        packRegenAt: regen.regenAt,
        ...(rank <= 3 ? { seasonPodiums: (u.seasonPodiums ?? 0) + 1 } : {}),
        ...(rank === 1 ? { seasonWins: (u.seasonWins ?? 0) + 1 } : {}),
      });
      results.push({ userId: u._id, name: s.name, ...(s.avatarUrl ? { avatarUrl: s.avatarUrl } : {}), rank, gained: s.gained, packs: s.packs, boosters });
    }
    await ctx.db.patch(open._id, { status: 'closed', closedAt: now, results });
    await ctx.db.insert('seasons', { key: cur, status: 'open', startAt: now, bases: rows.map(baseOf) });
    return { action: 'closed' as const, key: open.key, next: cur, rewarded: results.length };
  },
});

/** Cron horaire. `now` : pour les tests (et un rattrapage à la main). */
export const tick = internalAction({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }): Promise<{ action: string; key: string }> => {
    const t = now ?? Date.now();
    const st = await ctx.runQuery(internal.seasons.status, { now: t });
    // fin de mois : tout le monde recalculé d'abord (lignes fraîches pour le classement final)
    if (st.rollover) await ctx.runAction(internal.profiles.refreshRanks, { all: true });
    return await ctx.runMutation(internal.seasons.advance, { now: t });
  },
});
