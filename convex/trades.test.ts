/// <reference types="vite/client" />
/** Échanges directs (08/11) : proposer, accepter, refuser, contre-proposer, annuler. */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob') };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const commons = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').map((c) => c.id);
const [A, B, C] = commons;
const one = (cardId: string, count = 1) => ({ cardId, rarity: 'common' as const, count });
const give = (t: T, userId: Id<'users'>, cardId: string, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const countOf = async (t: T, token: string, cardId: string) => (await t.query(api.inventory.myCollection, { sessionToken: token })).find((c) => c.cardId === cardId)?.count ?? 0;

describe('échanges directs', () => {
  test('proposer puis accepter : les cartes changent de main', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 2);
    await give(t, bob.userId, B, 1);
    const id = await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [one(A)], requested: [one(B)] });
    const mine = await t.query(api.trades.myTrades, { sessionToken: bob.token });
    expect(mine.incoming.map((x) => x._id)).toEqual([id]);
    expect(await t.mutation(api.trades.respond, { sessionToken: bob.token, tradeId: id, accept: true })).toEqual({ status: 'accepted' });
    expect(await countOf(t, alice.token, A)).toBe(1);
    expect(await countOf(t, alice.token, B)).toBe(1);
    expect(await countOf(t, bob.token, A)).toBe(1);
    expect(await countOf(t, bob.token, B)).toBe(0);
  });
  test('contre-proposition puis acceptation par l’expéditeur', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 2);
    await give(t, bob.userId, B, 1);
    await give(t, bob.userId, C, 1);
    const id = await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [one(A)], requested: [one(B)] });
    const id2 = await t.mutation(api.trades.counter, { sessionToken: bob.token, tradeId: id, offered: [one(C)], requested: [one(A, 2)] });
    expect(await t.mutation(api.trades.respond, { sessionToken: alice.token, tradeId: id2, accept: true })).toEqual({ status: 'accepted' });
    expect(await countOf(t, bob.token, A)).toBe(2);
    expect(await countOf(t, alice.token, C)).toBe(1);
  });
});
