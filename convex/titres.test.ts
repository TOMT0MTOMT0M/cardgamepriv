/// <reference types="vite/client" />
/**
 * Titres uniques (convex/titres.ts, règles : src/core/uniqueTitles.ts) : un seul détenteur par titre, pour toujours.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { completionSets } from '../src/core/economy';
import { UNIQUE_TITLES, claimableUniqueTitles, uniqueTitle, uniqueTitleProgress, uniqueTitleSet } from '../src/core/uniqueTitles';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob']) {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => {
    const out: Array<{ id: Id<'users'>; token: string }> = [];
    for (const n of names) {
      const id = await ctx.db.insert('users', { discordId: n, username: n, displayName: n, packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
      await ctx.db.insert('sessions', { token: `tok-${n}`, userId: id, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      out.push({ id, token: `tok-${n}` });
    }
    return out;
  });
  return { t, users };
}
type T = Awaited<ReturnType<typeof setup>>['t'];

/** donne à un joueur toutes les cartes d'un titre (sauf les `missing` dernières) */
const give = (t: T, userId: Id<'users'>, titleId: string, missing = 0) =>
  t.run(async (ctx) => {
    const cards = uniqueTitleSet(uniqueTitle(titleId)!)!.cards;
    for (const c of cards.slice(0, cards.length - missing))
      await ctx.db.insert('inventory', { userId, cardId: c.id, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
  });
const rows = (t: T) => t.run(async (ctx) => await ctx.db.query('uniqueTitles').collect());

describe('règles pures', () => {
  test('chaque titre vise un ensemble de complétion qui existe et n’est pas vide ; ids uniques', () => {
    const ids = new Set(completionSets().map((s) => s.id));
    for (const ut of UNIQUE_TITLES) {
      expect(ids.has(ut.setId), ut.id).toBe(true);
      expect(uniqueTitleSet(ut)!.cards.length, ut.id).toBeGreaterThan(0);
    }
    expect(new Set(UNIQUE_TITLES.map((u) => u.id)).size).toBe(UNIQUE_TITLES.length);
    expect(UNIQUE_TITLES.map((u) => u.label)).toEqual(['Radiant', 'Hokage', 'Maître Pokémon', 'Challenger']);
  });
  test('complet seulement à 100 % ; un titre pris n’est plus réclamable', () => {
    const hokage = uniqueTitle('hokage')!;
    const cards = uniqueTitleSet(hokage)!.cards.map((c) => c.id);
    expect(uniqueTitleProgress(hokage, new Set(cards.slice(1))).done).toBe(false);
    expect(uniqueTitleProgress(hokage, new Set(cards))).toEqual({ have: cards.length, total: cards.length, done: true });
    expect(claimableUniqueTitles(new Set(cards), new Set()).map((x) => x.id)).toEqual(['hokage']);
    expect(claimableUniqueTitles(new Set(cards), new Set(['hokage']))).toEqual([]);
  });
});

describe('attribution', () => {
  test('le premier qui complète remporte le titre ; le second est refusé, pour toujours', async () => {
    const { t, users } = await setup();
    const [alice, bob] = users;
    await give(t, alice.id, 'hokage');
    await give(t, bob.id, 'hokage');
    expect(await t.mutation(api.titres.claim, { sessionToken: alice.token, titleId: 'hokage' })).toEqual({ won: ['hokage'] });
    await expect(t.mutation(api.titres.claim, { sessionToken: bob.token, titleId: 'hokage' })).rejects.toThrow(/alice a déjà remporté/);
    // rappels : rien de plus, ni pour l'un ni pour l'autre
    expect(await t.mutation(api.titres.claim, { sessionToken: alice.token, titleId: 'hokage' })).toEqual({ won: [] });
    expect(await t.mutation(api.titres.claim, { sessionToken: bob.token })).toEqual({ won: [] });
    const all = await rows(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ titleId: 'hokage', userId: alice.id, name: 'alice', setId: 'sub:naruto' });
    expect(await t.query(api.titres.holders, {})).toEqual([{ titleId: 'hokage', userId: alice.id, name: 'alice', at: all[0].at }]);
    // annonce dans le fil
    const feed = await t.run(async (ctx) => await ctx.db.query('activityFeed').collect());
    expect(feed).toHaveLength(1);
    expect(feed[0].message).toContain('alice est le PREMIER à compléter Naruto');
    expect(feed[0].msgKey).toBe('f.utitle');
  });

  test('deux demandes lancées en même temps : une seule ligne', async () => {
    const { t, users } = await setup();
    const [alice, bob] = users;
    await give(t, alice.id, 'hokage');
    await give(t, bob.id, 'hokage');
    const res = await Promise.allSettled([
      t.mutation(api.titres.claim, { sessionToken: alice.token, titleId: 'hokage' }),
      t.mutation(api.titres.claim, { sessionToken: bob.token, titleId: 'hokage' }),
      t.mutation(api.titres.claim, { sessionToken: alice.token }),
      t.mutation(api.titres.claim, { sessionToken: bob.token }),
    ]);
    const winners = res.flatMap((r) => (r.status === 'fulfilled' ? r.value.won : []));
    expect(winners).toEqual(['hokage']);
    expect(await rows(t)).toHaveLength(1);
  });

  test('collection incomplète : refus avec le nombre de cartes manquantes ; titre inconnu refusé', async () => {
    const { t, users } = await setup();
    await give(t, users[0].id, 'hokage', 2);
    await expect(t.mutation(api.titres.claim, { sessionToken: users[0].token, titleId: 'hokage' })).rejects.toThrow(/Il te manque 2 cartes/);
    await expect(t.mutation(api.titres.claim, { sessionToken: users[0].token, titleId: 'nope' })).rejects.toThrow(/Titre inconnu/);
    expect(await t.mutation(api.titres.claim, { sessionToken: users[0].token })).toEqual({ won: [] });
    expect(await rows(t)).toHaveLength(0);
  });

  test('l’encaissement des primes de complétion attribue aussi le titre', async () => {
    const { t, users } = await setup();
    await give(t, users[0].id, 'hokage');
    const r = await t.mutation(api.economy.claimCompletions, { sessionToken: users[0].token });
    expect(r.titles).toEqual(['hokage']);
    expect(await rows(t)).toHaveLength(1);
  });

  test('admin : un titre libéré redevient à prendre', async () => {
    const { t, users } = await setup();
    const [alice, bob] = users;
    await give(t, alice.id, 'hokage');
    await give(t, bob.id, 'hokage');
    await t.mutation(api.titres.claim, { sessionToken: alice.token });
    expect(await t.mutation(internal.titres.revoke, { titleId: 'hokage' })).toEqual({ liberes: ['alice'] });
    expect(await t.mutation(api.titres.claim, { sessionToken: bob.token })).toEqual({ won: ['hokage'] });
    expect((await rows(t))[0].userId).toBe(bob.id);
  });
});
