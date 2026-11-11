/// <reference types="vite/client" />
/**
 * Nouveau tri Monde + Sport (11/11) : une carte qui change d'étoiles est réalignée PARTOUT — inventaire, vitrine,
 * classeurs (resyncRarities) et ce qui est en cours : échanges, annonces, offres (resyncRaritiesOpen).
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

describe('nouveau tri : cartes déjà tombées', () => {
  test('une carte « en 3★ » chez un joueur passe à sa vraie rareté, jusque dans les échanges et annonces en cours', async () => {
    const t = convexTest(schema, modules);
    const card = CATALOG_CARDS.find((c) => c.id.startsWith('spt-') && c.baseRarity === 'mythic')!;
    const other = CATALOG_CARDS.find((c) => c.id.startsWith('geo-') || c.id.startsWith('miam-'))!;
    const old = 'rare' as const;
    const { a, b } = await t.run(async (ctx) => {
      const mk = (n: string) => ctx.db.insert('users', { discordId: n, username: n, displayName: n, packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 });
      const a = await mk('a');
      const b = await mk('b');
      await ctx.db.insert('inventory', { userId: a, cardId: card.id, rarity: old, count: 2, bestMintNumber: 4, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
      await ctx.db.patch(a, { showcase: [{ cardId: card.id, rarity: old }] });
      await ctx.db.insert('trades', { fromUserId: a, toUserId: b, offered: [{ cardId: card.id, rarity: old, count: 1 }], requested: [{ cardId: other.id, rarity: other.baseRarity, count: 1 }], status: 'pending', createdAt: 0 });
      await ctx.db.insert('trades', { fromUserId: a, toUserId: b, offered: [{ cardId: card.id, rarity: old, count: 1 }], requested: [], status: 'declined', createdAt: 0 });
      await ctx.db.insert('listings', { userId: a, items: [{ cardId: card.id, rarity: old, count: 1 }], wanted: [{ cardId: card.id, rarity: old }], status: 'open', createdAt: 0, expiresAt: Date.now() + 86400000 });
      return { a, b };
    });
    await t.mutation(internal.migrations.resyncRarities, {});
    const r = await t.mutation(internal.migrations.resyncRaritiesOpen, {});
    expect(r).toEqual({ trades: 1, listings: 1, offers: 0 });
    // idempotente
    expect(await t.mutation(internal.migrations.resyncRaritiesOpen, {})).toEqual({ trades: 0, listings: 0, offers: 0 });
    await t.run(async (ctx) => {
      const inv = await ctx.db.query('inventory').collect();
      expect(inv.map((x) => x.rarity)).toEqual(['mythic']);
      expect((await ctx.db.get(a))!.showcase).toEqual([{ cardId: card.id, rarity: 'mythic' }]);
      const trades = await ctx.db.query('trades').collect();
      expect(trades.find((x) => x.status === 'pending')!.offered[0].rarity).toBe('mythic');
      expect(trades.find((x) => x.status === 'declined')!.offered[0].rarity).toBe(old); // l'historique ne bouge pas
      const l = (await ctx.db.query('listings').collect())[0];
      expect(l.items[0].rarity).toBe('mythic');
      expect(l.wanted![0].rarity).toBe('mythic');
      void b;
    });
  });
});
