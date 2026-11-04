/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

test('série : preparePacks scelle tout d’un coup, revealPacks crédite en un appel (retours 4 nov.)', async () => {
  const t = convexTest(schema, modules);
  const { userId, token } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'A', packBalance: 4, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now() });
    await ctx.db.insert('sessions', { userId, token: 'tok', createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    return { userId, token: 'tok' };
  });
  // réserve de 4 : une série de 5 en donne 4 (pas d'erreur)
  const packs = await t.mutation(api.packs.preparePacks, { sessionToken: token, packKind: 'bebou', count: 5 });
  expect(packs).toHaveLength(4);
  expect(new Set(packs.map((p) => p._id)).size).toBe(4);
  // anti-reroll : on retrouve les mêmes boosters scellés, dans le même ordre
  const again = await t.mutation(api.packs.preparePacks, { sessionToken: token, packKind: 'bebou', count: 4 });
  expect(again.map((p) => p._id)).toEqual(packs.map((p) => p._id));
  expect((await t.mutation(api.packs.preparePack, { sessionToken: token, packKind: 'bebou' }))._id).toBe(packs[0]._id);
  // le 1er montré puis crédité seul, le reste d'un coup (« Tout passer »)
  await t.mutation(api.packs.revealPack, { sessionToken: token, packId: packs[0]._id });
  const done = await t.mutation(api.packs.revealPacks, { sessionToken: token, packIds: packs.slice(1).map((p) => p._id) });
  expect(done).toHaveLength(3);
  const u = await t.run((ctx) => ctx.db.get(userId));
  expect(u!.totalPacksOpened).toBe(4);
  expect(u!.packBalance).toBe(0);
  const inv = await t.run((ctx) => ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', userId)).collect());
  expect(inv.reduce((a, c) => a + c.count, 0)).toBe(20);
  await expect(t.mutation(api.packs.preparePacks, { sessionToken: token, packKind: 'bebou', count: 3 })).rejects.toThrow(/Plus de boosters/);
});
