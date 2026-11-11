/// <reference types="vite/client" />
/** Classeurs épinglés sur le profil (sondage 11/11) : 3 au plus, épingler n'enlève plus les autres, le profil les liste. */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { BINDER_PINS_MAX } from './binders';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
async function setup() {
  const t = convexTest(schema, modules);
  const { userId, token } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { discordId: 'alice', username: 'alice', displayName: 'alice', packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
    await ctx.db.insert('sessions', { token: 'tok-alice', userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    return { userId, token: 'tok-alice' };
  });
  const ids = await t.run(async (ctx) => {
    const out = [];
    for (let i = 0; i < BINDER_PINS_MAX + 1; i++) out.push(await ctx.db.insert('binders', { userId, name: `c${i}`, cards: [], pinned: false, createdAt: 1000 + i, updatedAt: 1000 + i }));
    return out;
  });
  return { t, userId, token, ids };
}

describe('classeurs épinglés', () => {
  test(`${BINDER_PINS_MAX} au plus ; épingler garde les autres ; le profil les liste dans l'ordre de création`, async () => {
    const { t, userId, token, ids } = await setup();
    // épinglés dans le désordre : le profil les rend du plus ancien au plus récent
    for (const i of [2, 0, 1]) await t.mutation(api.binders.pin, { sessionToken: token, binderId: ids[i], on: true });
    const p = await t.query(api.profiles.profile, { userId });
    expect(p!.pinnedBinders.map((b) => b.name)).toEqual(['c0', 'c1', 'c2']);
    expect(p!.pinnedBinder!.name).toBe('c0');
    // le 4e est refusé, rien ne bouge
    await expect(t.mutation(api.binders.pin, { sessionToken: token, binderId: ids[3], on: true })).rejects.toThrow(/au plus sur ton profil/);
    // ré-épingler un classeur déjà épinglé ne compte pas comme un 4e
    await t.mutation(api.binders.pin, { sessionToken: token, binderId: ids[1], on: true });
    // en retirer un libère une place
    await t.mutation(api.binders.pin, { sessionToken: token, binderId: ids[0], on: false });
    await t.mutation(api.binders.pin, { sessionToken: token, binderId: ids[3], on: true });
    const p2 = await t.query(api.profiles.profile, { userId });
    expect(p2!.pinnedBinders.map((b) => b.name)).toEqual(['c1', 'c2', 'c3']);
  });
  test('aucun classeur épinglé : liste vide, pinnedBinder nul', async () => {
    const { t, userId } = await setup();
    const p = await t.query(api.profiles.profile, { userId });
    expect(p!.pinnedBinders).toEqual([]);
    expect(p!.pinnedBinder).toBeNull();
  });
});
