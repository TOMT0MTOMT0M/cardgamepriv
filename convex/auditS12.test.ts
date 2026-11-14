/// <reference types="vite/client" />
/**
 * Audit perf 12/11, lot S12 / A8-09 : les migrations de mise en ligne lisent `trades` et `listingOffers` par pages.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as migrations from './migrations';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

describe('S12 — migrations par pages', () => {
  test('1 000 échanges : aucune mutation ne lit toute la table, et la dernière page est bien corrigée', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const card = THEMES.flatMap((x) => x.cards).find((c) => c.rarity === 'rare')!;
    const lastId = await t.run(async (ctx) => {
      const mk = (n: string) => ctx.db.insert('users', { discordId: n, username: n, displayName: n, packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1 });
      const [a, b] = [await mk('a'), await mk('b')];
      let id = null;
      for (let i = 0; i < 1000; i++)
        // le dernier échange, en attente, porte une étoile périmée (commune au lieu de rare)
        id = await ctx.db.insert('trades', { fromUserId: a, toUserId: b, offered: [{ cardId: card.id, rarity: i === 999 ? 'common' : 'rare', count: 1 }], requested: [], status: i === 999 ? 'pending' : 'accepted', createdAt: i } as never);
      return id!;
    });
    const first = await countReads(t as never, migrations.resyncRaritiesOpen, {});
    console.log(`[mesure S12] resyncRaritiesOpen, 1 000 échanges : ${first.reads.scanned.trades} lignes lues par mutation (avant : 1 000, toute la table)`);
    expect(first.reads.scanned.trades).toBe(400);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(lastId)))!.offered[0].rarity).toBe('rare');
    // idempotent, et le 2e temps de la purge passe aussi par pages
    expect(await t.mutation(internal.migrations.resyncRaritiesOpen, {})).toEqual({ trades: 0, listings: 0, offers: 0, market: 0 });
    expect((await countReads(t as never, migrations.purgeCardsDeals, {})).reads.scanned.trades).toBe(400);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });
});
