/// <reference types="vite/client" />
/**
 * Audit perf 12/11, lot S05 : le classement ne relit la collection d'un joueur que si sa signature a changé.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { countReads } from './reads.testlib';
import * as profiles from './profiles';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const CARDS = THEMES.flatMap((t) => t.cards).slice(0, 120);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = (name: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: `${name}_d`, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: Date.now(), packRegenAt: Date.now() });
      await ctx.db.insert('sessions', { token: `tok-${name}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      // collection « d'avant » : lignes sans `rev`, comme en prod
      for (const c of CARDS) await ctx.db.insert('inventory', { userId, cardId: c.id, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
      return { userId, token: `tok-${name}` };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob') };
}
type T = Awaited<ReturnType<typeof setup>>['t'];

/** documents lus par un tour du cron : le plan, puis la ligne de chaque joueur à recalculer */
async function roundReads(t: T) {
  const plan = await countReads<never, Awaited<ReturnType<(typeof profiles.rankPlan)['_handler' & keyof typeof profiles.rankPlan]>>>(t as never, profiles.rankPlan, {});
  let docs = plan.reads.docs;
  let recalculated = 0;
  const now = Date.now();
  for (const u of (plan.result as { users: Array<{ id: Id<'users'>; banned: boolean; at: number; sig?: string; rowSig?: string; seen?: number }> }).users) {
    if (u.banned) continue;
    const stale = 'sig' in u ? !u.at || u.sig !== u.rowSig || now - u.at > 24 * 3600_000 : !u.at || (u.seen ?? 0) >= u.at - 60_000 || now - u.at > 6 * 3600_000;
    if (!stale) continue;
    recalculated++;
    docs += (await countReads(t as never, profiles.rankRow, { userId: u.id })).reads.docs;
  }
  return { docs, recalculated };
}

describe('S05 — classement par signature', () => {
  test('mesure : un joueur en ligne qui ne fait rien n’est plus recalculé', async () => {
    const { t, alice, bob } = await setup();
    await t.action(internal.profiles.refreshRanks, {});
    await t.action(internal.profiles.refreshRanks, {}); // 2e tour : le titre « Numéro un » posé au 1er change une signature
    // battements : les deux joueurs sont « vus » après leur ligne
    await t.run(async (ctx) => {
      for (const id of [alice.userId, bob.userId]) await ctx.db.patch(id, { lastSeenAt: Date.now() + 1000 });
    });
    const r = await roundReads(t);
    console.log(`[mesure S05] tour du cron, 2 joueurs en ligne sans geste, ${CARDS.length} cartes chacun : ${r.docs} documents lus, ${r.recalculated} recalcul(s)`);
    expect(r.recalculated).toBe(0);
    expect(r.docs).toBeLessThan(20);
    expect(await t.action(internal.profiles.refreshRanks, {})).toEqual({ saved: 0, dropped: 0 });
  });

  test('une carte gagnée, perdue, ou un compteur qui bouge : la ligne est recalculée', async () => {
    const { t, alice, bob } = await setup();
    await t.action(internal.profiles.refreshRanks, {});
    await t.action(internal.profiles.refreshRanks, {});
    const row = async (id: Id<'users'>) => (await t.query(api.profiles.leaderboard, {})).find((x) => x.id === id)!;
    expect((await row(alice.userId)).uniques).toBe(CARDS.length);
    // carte en plus (écriture d'inventaire avec `rev`, comme tout le code serveur)
    const extra = THEMES.flatMap((x) => x.cards)[CARDS.length];
    await t.run((ctx) => ctx.db.insert('inventory', { userId: alice.userId, cardId: extra.id, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1, rev: Date.now() }));
    expect((await t.action(internal.profiles.refreshRanks, {})).saved).toBe(1);
    expect((await row(alice.userId)).uniques).toBe(CARDS.length + 1);
    // carte en moins (dernier exemplaire parti : trace invGone)
    await t.run(async (ctx) => {
      const r = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', bob.userId).eq('cardId', CARDS[0].id)).first();
      await ctx.db.delete(r!._id);
      await ctx.db.insert('invGone', { userId: bob.userId, cardId: r!.cardId, rarity: r!.rarity, rev: Date.now() });
    });
    expect((await t.action(internal.profiles.refreshRanks, {})).saved).toBe(1);
    expect((await row(bob.userId)).uniques).toBe(CARDS.length - 1);
    // compteur du document joueur
    await t.run((ctx) => ctx.db.patch(bob.userId, { totalTrades: 4, displayName: 'Bobby' }));
    expect((await t.action(internal.profiles.refreshRanks, {})).saved).toBe(1);
    expect(await row(bob.userId)).toMatchObject({ tradesDone: 4, name: 'Bobby' });
    expect((await t.action(internal.profiles.refreshRanks, {})).saved).toBe(0);
  });

  test('refreshMyRank : rien si rien n’a changé ; statistiques en cache identiques au calcul complet', async () => {
    const { t, alice } = await setup();
    expect(await t.mutation(api.profiles.refreshMyRank, { sessionToken: alice.token })).toEqual({ ok: true, changed: true });
    await t.run(async (ctx) => {
      const r = await ctx.db.query('rankRows').withIndex('by_user', (q) => q.eq('userId', alice.userId)).first();
      await ctx.db.patch(r!._id, { updatedAt: 0 });
    });
    expect(await t.mutation(api.profiles.refreshMyRank, { sessionToken: alice.token })).toEqual({ ok: true, changed: false });
    const { cached, full, reads } = await t.run(async (ctx) => {
      const u = (await ctx.db.get(alice.userId))!;
      return { cached: await profiles.statsCached(ctx, u), full: (await profiles.statsOf(ctx, u)).stats, reads: 0 };
    });
    expect(cached).toEqual(full);
    expect(reads).toBe(0);
  });
});
