/// <reference types="vite/client" />
/**
 * Audit perf 12/11, A8-08 : resyncRarities et purgeCards ne relisent plus tout l'inventaire quand rien n'a changé,
 * sauf si un booster encore scellé porte une étoile périmée (il la verserait à l'inventaire à son ouverture).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as migrations from './migrations';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const rare = THEMES.flatMap((x) => x.cards).find((c) => c.rarity === 'rare')!;

async function seed(t: ReturnType<typeof convexTest>, rows: number) {
  return await t.run(async (ctx) => {
    const u = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'a', packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 } as never);
    for (let i = 0; i < rows; i++) await ctx.db.insert('inventory', { userId: u, cardId: `inconnue-${i}`, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 0, firstPulledAt: 0, lastPulledAt: 0 } as never);
    return u;
  });
}
const sealed = (cardId: string, rarity: string) => ({ status: 'sealed', maxRarity: rarity, createdAt: Date.now(), cards: [{ cardId, cardName: 'x', rarity, foilSeed: 0, mintNumber: 1, isNew: true }] });

describe('A8-08 — tampon des migrations de mise en ligne', () => {
  test('2e mise en ligne sans changement : aucune ligne d\'inventaire relue', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await seed(t, 450);
    const first = await countReads(t as never, migrations.resyncRarities, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const again = await countReads(t as never, migrations.resyncRarities, {});
    console.log(`[mesure A8-08] resyncRarities, 450 lignes : 1re mise en ligne ${first.reads.scanned.inventory} lignes lues au 1er appel (puis la suite par pages), 2e ${again.reads.scanned.inventory ?? 0}`);
    expect(first.reads.scanned.inventory).toBeGreaterThan(0);
    expect(again.result).toMatchObject({ done: true, skipped: true });
    expect(again.reads.scanned.inventory ?? 0).toBe(0);
    const purge1 = await t.mutation(internal.migrations.purgeCards, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const purge2 = await countReads(t as never, migrations.purgeCards, {});
    expect((purge1 as { skipped?: boolean }).skipped).toBeUndefined();
    expect(purge2.result).toMatchObject({ skipped: true });
    expect(purge2.reads.scanned.inventory ?? 0).toBe(0);
    // passage complet demandé
    const forced = await countReads(t as never, migrations.resyncRarities, { force: true });
    expect(forced.reads.scanned.inventory).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  test('un booster scellé à l\'étoile périmée : pas de tampon, et sa carte est corrigée après son ouverture', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const u = await seed(t, 3);
    // tiré avant le changement d'étoile : la carte (rare au catalogue) y est encore « commune »
    const pack = await t.run((ctx) => ctx.db.insert('packOpens', { userId: u, ...sealed(rare.id, 'common') } as never));
    await t.mutation(internal.migrations.resyncRarities, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // le joueur l'ouvre : la ligne périmée arrive à l'inventaire
    await t.run(async (ctx) => {
      await ctx.db.patch(pack, { status: 'revealed' } as never);
      await ctx.db.insert('inventory', { userId: u, cardId: rare.id, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 0, firstPulledAt: 0, lastPulledAt: 0 } as never);
    });
    const next = await t.mutation(internal.migrations.resyncRarities, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((next as { skipped?: boolean }).skipped).toBeUndefined();
    const row = await t.run((ctx) => ctx.db.query('inventory').filter((q) => q.eq(q.field('cardId'), rare.id)).unique());
    expect(row?.rarity).toBe('rare');
    // plus de booster scellé périmé : la mise en ligne suivante est sautée
    const third = await t.mutation(internal.migrations.resyncRarities, {});
    expect(third).toMatchObject({ skipped: true });
    vi.useRealTimers();
  });

  test('un booster scellé à jour ne bloque pas le tampon', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const u = await seed(t, 3);
    await t.run((ctx) => ctx.db.insert('packOpens', { userId: u, ...sealed(rare.id, 'rare') } as never));
    await t.mutation(internal.migrations.resyncRarities, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.mutation(internal.migrations.resyncRarities, {})).toMatchObject({ skipped: true });
    vi.useRealTimers();
  });
});
