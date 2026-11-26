/// <reference types="vite/client" />
/**
 * (26/11, coût Convex) Mises en ligne : `remapCards` ne relit plus l'inventaire quand rien n'a changé (tampon, comme
 * purgeCards) ; resyncRarities corrige une étoile en supprimant puis recréant la ligne (trace `invGone` avec `born`).
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as migrations from './migrations';
import { invOf } from './inventory';
import { ETOILES_REMAP } from '../src/core/sets/etoiles';
import { catalogEntry, THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const row = (userId: unknown, cardId: string, rarity: string) => ({ userId, cardId, rarity, count: 1, bestMintNumber: 1, foilSeed: 0, firstPulledAt: 1, lastPulledAt: 1 }) as never;

afterEach(() => {
  vi.useRealTimers();
});

async function seed(t: ReturnType<typeof convexTest>, n: number) {
  const cards = THEMES.flatMap((x) => x.cards);
  return await t.run(async (ctx) => {
    const u = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'a', packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 } as never);
    for (let i = 0; i < n; i++) await ctx.db.insert('inventory', row(u, cards[i].id, catalogEntry(cards[i].id)!.rarity));
    return u;
  });
}

describe('coût des mises en ligne', () => {
  test('remapCards : 3e mise en ligne sans changement, aucune ligne d’inventaire relue', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await seed(t, 450);
    for (let i = 0; i < 2; i++) {
      const r = await t.mutation(internal.migrations.remapCards, {});
      expect((r as { skipped?: boolean }).skipped).toBeUndefined();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
    const again = await countReads(t as never, migrations.remapCards, {});
    console.log(`[mesure coût] remapCards, 450 lignes : 3e mise en ligne ${again.reads.scanned.inventory ?? 0} ligne(s) lue(s)`);
    expect(again.result).toMatchObject({ done: true, skipped: true });
    expect(again.reads.scanned.inventory ?? 0).toBe(0);
    expect((await countReads(t as never, migrations.remapCards, { force: true })).reads.scanned.inventory).toBeGreaterThan(0);
  });

  test('remapCards : un booster scellé qui contient un doublon retiré empêche le tampon', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const u = await seed(t, 3);
    const [from] = Object.keys(ETOILES_REMAP);
    await t.run((ctx) => ctx.db.insert('packOpens', { userId: u, status: 'sealed', maxRarity: 'common', createdAt: Date.now(), cards: [{ cardId: from, cardName: 'x', rarity: 'common', foilSeed: 0, mintNumber: 1, isNew: true }] } as never));
    for (let i = 0; i < 3; i++) {
      const r = await t.mutation(internal.migrations.remapCards, {});
      expect((r as { skipped?: boolean }).skipped).toBeUndefined();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
  });

  test('i18nMessages et markBigPulls : sautées après deux passages sans rien à faire', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const u = await seed(t, 1);
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) await ctx.db.insert('activityFeed', { userId: u, displayName: 'a', kind: 'pull', message: 'x', msgKey: 'f.pull', createdAt: Date.now() } as never);
    });
    for (let i = 0; i < 2; i++) {
      expect((await t.mutation(internal.migrations.i18nMessages, {})).skipped).toBeUndefined();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await t.mutation(internal.migrations.markBigPulls, {})).skipped).toBeUndefined();
    }
    const i18n = await countReads(t as never, migrations.i18nMessages, {});
    const big = await countReads(t as never, migrations.markBigPulls, {});
    expect(i18n.result).toMatchObject({ skipped: true });
    expect(big.result).toMatchObject({ skipped: true });
    expect((i18n.reads.scanned.activityFeed ?? 0) + (big.reads.scanned.activityFeed ?? 0)).toBe(0);
  });

  test('purgeOld : boosters ouverts et fil de plus de 30 jours retirés, jamais un booster scellé', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    const t = convexTest(schema, modules);
    const u = await seed(t, 1);
    const pack = (status: string) => ({ userId: u, status, maxRarity: 'common', createdAt: Date.now(), cards: [] }) as never;
    const feed = () => ({ userId: u, displayName: 'a', kind: 'pull', message: 'x', createdAt: Date.now() }) as never;
    await t.run(async (ctx) => {
      for (let i = 0; i < 260; i++) await ctx.db.insert('packOpens', pack('revealed')); // plus d'un lot
      await ctx.db.insert('packOpens', pack('sealed'));
      for (let i = 0; i < 40; i++) await ctx.db.insert('activityFeed', feed());
    });
    // (v2.1.32) 5 jours : boosters ouverts retirés (gardés 2 jours), fil gardé (30 jours)
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    await t.run(async (ctx) => {
      for (let i = 0; i < 4; i++) await ctx.db.insert('packOpens', pack('revealed'));
      for (let i = 0; i < 3; i++) await ctx.db.insert('activityFeed', feed());
    });
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) await ctx.db.insert('packOpens', pack('revealed'));
      for (let i = 0; i < 7; i++) await ctx.db.insert('activityFeed', feed());
    });
    await t.mutation(internal.migrations.purgeOld, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      const packs = await ctx.db.query('packOpens').collect();
      expect(packs.filter((p) => p.status === 'revealed')).toHaveLength(5);
      expect(packs.filter((p) => p.status === 'sealed')).toHaveLength(1);
      expect(await ctx.db.query('activityFeed').collect()).toHaveLength(10);
    });
    // relancée : rien de plus
    expect(await t.mutation(internal.migrations.purgeOld, { part: 'feed' })).toMatchObject({ deleted: 0, done: true });
  });

  test('invOf (v2.1.24) : toute la collection, dans l’ordre de création comme l’ancien index `by_user`', async () => {
    const t = convexTest(schema, modules);
    const ids = ['zz-derniere', 'aa-premiere', 'mm-milieu', 'bb-autre'];
    const [u, other] = await t.run(async (ctx) => {
      const mk = (n: string) => ctx.db.insert('users', { discordId: n, username: n, displayName: n, packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 } as never);
      const a = await mk('a');
      const b = await mk('b');
      for (const id of ids) await ctx.db.insert('inventory', row(a, id, 'common'));
      await ctx.db.insert('inventory', row(b, 'aa-premiere', 'common'));
      return [a, b];
    });
    const got = await t.run(async (ctx) => (await invOf(ctx, u)).map((r) => r.cardId));
    expect(got).toEqual(ids);
    expect(await t.run(async (ctx) => (await invOf(ctx, other)).length)).toBe(1);
  });

  test('resyncRarities : étoile corrigée = ligne supprimée (trace avec `born`) puis recréée', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const card = THEMES.flatMap((x) => x.cards).find((c) => catalogEntry(c.id)!.rarity !== 'common')!;
    const u = await t.run(async (ctx) => {
      const u = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'a', packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 } as never);
      await ctx.db.insert('inventory', row(u, card.id, 'common'));
      return u;
    });
    await t.mutation(internal.migrations.resyncRarities, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      const inv = await ctx.db.query('inventory').withIndex('by_user_card_rarity',(q) => q.eq('userId', u)).collect();
      expect(inv.map((x) => [x.cardId, x.rarity, x.count])).toEqual([[card.id, catalogEntry(card.id)!.rarity, 1]]);
      const gone = await ctx.db.query('invGone').collect();
      expect(gone.map((g) => [g.cardId, g.rarity])).toEqual([[card.id, 'common']]);
      expect(typeof gone[0].born).toBe('number');
    });
  });
});
