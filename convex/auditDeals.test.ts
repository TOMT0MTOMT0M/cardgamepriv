/// <reference types="vite/client" />
/**
 * Audit perf 12/11, décision 10 : « Pour toi » et la fiche d'une carte sans relire ma collection ni tous les joueurs.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const COMMONS = THEMES.flatMap((t) => t.cards).filter((c) => c.rarity === 'common').slice(0, 400);
const N = 10;

/**
 * 10 joueurs. Le joueur i possède en double les cartes de sa tranche (40 cartes) et a une grande collection à l'unité ;
 * il a dans ses envies quelques cartes de la tranche du suivant et du précédent.
 */
async function setup() {
  const t = convexTest(schema, modules);
  const ids: Array<{ userId: Id<'users'>; token: string }> = [];
  const slice = (i: number) => COMMONS.slice(((i + N) % N) * 40, ((i + N) % N) * 40 + 40);
  for (let i = 0; i < N; i++)
    ids.push(
      await t.run(async (ctx) => {
        const wishlist = [...slice(i + 1).slice(0, 6), ...slice(i - 1).slice(0, 3)].map((c) => c.id);
        const userId = await ctx.db.insert('users', { discordId: `d${i}`, username: `j${i}`, displayName: `J${i}`, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: i, lastSeenAt: Date.now() - (i % 2 ? 0 : 3600_000), packRegenAt: Date.now(), wishlist });
        await ctx.db.insert('sessions', { token: `tok-${i}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
        const row = (cardId: string, count: number) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
        for (const c of slice(i)) await row(c.id, 3);
        for (const c of slice(i + 3)) await row(c.id, 1);
        for (const c of slice(i + 5)) await row(c.id, 1);
        return { userId, token: `tok-${i}` };
      }),
    );
  await t.run(async (ctx) => {
    await ctx.db.insert('market', { sellerId: ids[2].userId, cardId: slice(1)[0].id, rarity: 'common', mintNumber: 1, price: 40, status: 'open', createdAt: Date.now() });
  });
  return { t, ids, slice };
}
const dups = async (t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>) =>
  (await t.run((ctx) => ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', userId)).collect())).filter((r) => r.count > 1).sort((a, b) => b.count - a.count).map((r) => ({ cardId: r.cardId, rarity: r.rarity, count: r.count }));

describe('décision 10 — « Pour toi » et fiche carte', () => {
  test('mêmes suggestions qu’avant, lectures allégées', async () => {
    const { t, ids, slice } = await setup();
    const me = ids[0];
    const card = slice(1)[0].id;
    const oldFor = await t.query(api.deals.forYou, { sessionToken: me.token });
    const oldPanel = await t.query(api.deals.cardPanel, { sessionToken: me.token, cardId: card });
    expect(oldFor.deals.length).toBeGreaterThan(0);
    expect(oldFor.theyWant.length).toBeGreaterThan(0);
    expect(oldPanel.wanters.length).toBeGreaterThan(0);
    expect(oldPanel.sellers).toHaveLength(1);

    // migration par lots (10 joueurs par lot) : on laisse tourner les lots programmés
    let r = await t.mutation(internal.migrations.backfillWishes, {});
    for (let cursor = 0; !r.done && cursor < 10; cursor++) {
      await t.finishAllScheduledFunctions(() => undefined);
      r = { done: await t.run(async (ctx) => !!(await ctx.db.query('appConfig').withIndex('by_key', (q) => q.eq('key', 'wishesReady')).first())), written: 0 };
    }
    expect(await t.run(async (ctx) => (await ctx.db.query('wishes').collect()).length)).toBe(N * 9);
    expect((await t.mutation(internal.migrations.backfillWishes, {})).written).toBe(0); // idempotente

    const newFor = await t.query(api.deals.forYou, { sessionToken: me.token, give: await dups(t, me.userId) });
    const newPanel = await t.query(api.deals.cardPanel, { sessionToken: me.token, cardId: card });
    expect({ deals: newFor.deals, theyWant: newFor.theyWant }).toEqual({ deals: oldFor.deals, theyWant: oldFor.theyWant });
    expect({ ...newPanel, reads: 0 }).toEqual({ ...oldPanel, reads: 0 });
    console.log(`[mesure décision 10] 10 joueurs, ma collection de 120 lignes — forYou : ${oldFor.reads} → ${newFor.reads} documents lus ; cardPanel : ${oldPanel.reads} → ${newPanel.reads}`);
    expect(newFor.reads).toBeLessThan(oldFor.reads);
    expect(newPanel.reads).toBeLessThan(oldPanel.reads);
    // client V1 (sans `give`) après la migration : mêmes suggestions aussi
    const v1 = await t.query(api.deals.forYou, { sessionToken: me.token });
    expect({ deals: v1.deals, theyWant: v1.theyWant }).toEqual({ deals: oldFor.deals, theyWant: oldFor.theyWant });
  });

  test('l’index des envies suit toggleWish', async () => {
    const { t, ids, slice } = await setup();
    await t.mutation(internal.migrations.backfillWishes, {});
    const card = slice(7)[20].id;
    const wishers = () => t.run(async (ctx) => (await ctx.db.query('wishes').withIndex('by_card', (q) => q.eq('cardId', card)).collect()).map((w) => w.userId));
    expect(await wishers()).toEqual([]);
    await t.mutation(api.users.toggleWish, { sessionToken: ids[0].token, cardId: card });
    expect(await wishers()).toEqual([ids[0].userId]);
    expect((await t.query(api.deals.cardPanel, { sessionToken: ids[1].token, cardId: card })).wanters.map((w) => w.userId)).toEqual([ids[0].userId]);
    await t.mutation(api.users.toggleWish, { sessionToken: ids[0].token, cardId: card });
    expect(await wishers()).toEqual([]);
  });
});
