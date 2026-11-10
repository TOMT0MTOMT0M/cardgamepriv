/// <reference types="vite/client" />
/** « Chercher un propriétaire » (v1.0.9) : qui possède une carte, exemplaires libres, sans moi ni les bannis. */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, extra: Record<string, unknown> = {}) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), ...extra });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob'), carol: await mk('carol', { lastSeenAt: 0 }), dan: await mk('dan', { bannedAt: 1 }) };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const [A, B] = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').map((c) => c.id);
const give = (t: T, userId: Id<'users'>, cardId: string, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));

describe('chercher un propriétaire', () => {
  test('liste les autres joueurs qui ont la carte, doublons et exemplaires libres d’abord', async () => {
    const { t, alice, bob, carol, dan } = await setup();
    await give(t, alice.userId, A, 3); // moi : pas dans la liste
    await give(t, bob.userId, A, 1);
    await give(t, carol.userId, A, 2);
    await give(t, dan.userId, A, 5); // banni : pas dans la liste
    await give(t, bob.userId, B, 1);
    const res = await t.query(api.trades.owners, { sessionToken: alice.token, cardId: A });
    expect(res.map((o) => o.name)).toEqual(['carol', 'bob']);
    expect(res[0]).toMatchObject({ count: 2, free: 2, online: false });
    expect(res[1]).toMatchObject({ count: 1, free: 1, online: true });
  });
  test('un exemplaire engagé dans un échange en attente n’est plus libre', async () => {
    const { t, alice, bob } = await setup();
    await give(t, bob.userId, A, 1);
    await give(t, alice.userId, B, 1);
    await t.mutation(api.trades.propose, { sessionToken: bob.token, toUserId: alice.userId, offered: [{ cardId: A, rarity: 'common', count: 1 }], requested: [{ cardId: B, rarity: 'common', count: 1 }] });
    const res = await t.query(api.trades.owners, { sessionToken: alice.token, cardId: A });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: 'bob', count: 1, free: 0 });
  });
  test('carte inconnue : liste vide', async () => {
    const { t, alice } = await setup();
    expect(await t.query(api.trades.owners, { sessionToken: alice.token, cardId: 'nope-000' })).toEqual([]);
  });
});
