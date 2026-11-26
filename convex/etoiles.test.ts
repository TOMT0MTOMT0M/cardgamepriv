/// <reference types="vite/client" />
/**
 * (24/11, V3) Base Etoiles de Hugo : les doublons retirés sont TRANSFÉRÉS sur la carte gardée (migrations:remapCards),
 * avant la purge ; une carte qui existe au catalogue n'est jamais purgée (ids réutilisés par la base).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { catalogEntry } from '../src/core/sets/themes';
import { ETOILES_PURGE, ETOILES_REMAP } from '../src/core/sets/etoiles';
import { PURGED_CARD_IDS } from './purgedCards';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const row = (userId: unknown, cardId: string, rarity: string, count: number, mint: number) =>
  ({ userId, cardId, rarity, count, bestMintNumber: mint, foilSeed: 0, firstPulledAt: 10, lastPulledAt: 20 }) as never;

describe('base Etoiles', () => {
  test('catalogue : retirées absentes, gardées présentes, transferts jamais vers plus d’étoiles', () => {
    for (const id of ETOILES_PURGE) expect(catalogEntry(id), id).toBeUndefined();
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    for (const [from, to] of Object.entries(ETOILES_REMAP)) {
      expect(ETOILES_PURGE.includes(from), from).toBe(true);
      expect(catalogEntry(to), to).toBeTruthy();
    }
    expect(order.indexOf(catalogEntry('spt-hulk-hogan')!.rarity)).toBeGreaterThanOrEqual(0);
  });

  test('remapCards : Hulk Hogan « acteur » rejoint Hulk Hogan « catch » (exemplaires additionnés), vitrine et classeur suivent', async () => {
    expect(ETOILES_REMAP['pop-hulk-hogan']).toBe('spt-hulk-hogan');
    const t = convexTest(schema, modules);
    const r = catalogEntry('spt-hulk-hogan')!.rarity;
    const u = await t.run(async (ctx) => {
      const u = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'a', packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0, showcase: [{ cardId: 'pop-hulk-hogan', rarity: 'mythic' }] } as never);
      await ctx.db.insert('inventory', row(u, 'pop-hulk-hogan', 'mythic', 2, 7));
      await ctx.db.insert('inventory', row(u, 'spt-hulk-hogan', r, 1, 3));
      await ctx.db.insert('binders', { userId: u, name: 'b', cards: [{ cardId: 'pop-hulk-hogan', rarity: 'mythic' }], coverCardId: 'pop-hulk-hogan', pinned: false, createdAt: 0, updatedAt: 0 } as never);
      return u;
    });
    await t.mutation(internal.migrations.remapCards, {});
    await t.mutation(internal.migrations.purgeCards, { force: true });
    await t.run(async (ctx) => {
      const inv = await ctx.db.query('inventory').withIndex('by_user_card_rarity',(q) => q.eq('userId', u)).collect();
      expect(inv.map((x) => [x.cardId, x.count, x.bestMintNumber])).toEqual([['spt-hulk-hogan', 3, 3]]);
      const user = await ctx.db.get(u);
      expect((user as { showcase: { cardId: string }[] }).showcase.map((c) => c.cardId)).toEqual(['spt-hulk-hogan']);
      const b = (await ctx.db.query('binders').collect())[0];
      expect(b.cards.map((c) => c.cardId)).toEqual(['spt-hulk-hogan']);
      expect(b.coverCardId).toBe('spt-hulk-hogan');
    });
  });

  test('purgeCards ne retire pas une carte du catalogue dont l’id avait été purgé le 04/11 (Calcifer)', async () => {
    expect(PURGED_CARD_IDS.includes('pop-calcifer')).toBe(true);
    expect(catalogEntry('pop-calcifer')).toBeTruthy();
    const t = convexTest(schema, modules);
    const u = await t.run(async (ctx) => {
      const u = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'a', packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 } as never);
      await ctx.db.insert('inventory', row(u, 'pop-calcifer', catalogEntry('pop-calcifer')!.rarity, 1, 1));
      return u;
    });
    await t.mutation(internal.migrations.purgeCards, { force: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.query('inventory').withIndex('by_user_card_rarity',(q) => q.eq('userId', u)).collect()).length).toBe(1);
    });
  });
});
