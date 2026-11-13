/// <reference types="vite/client" />
/**
 * Défis entre amis (convex/challenges.ts, règles : src/core/defis.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { bumpChallenges } from './challenges';
import { HOUR, defiGain, defiProblem, defiWinner } from '../src/core/defis';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob', 'carl']) {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of names)
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 1000 });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  // alice est amie avec bob et carl (pas bob avec carl)
  await t.run(async (ctx) => {
    for (const o of ['bob', 'carl']) if (u[o]) await ctx.db.insert('friendships', { requesterId: u.alice.userId, addresseeId: u[o].userId, status: 'accepted', createdAt: 0 });
  });
  return { t, u };
}
const coins = (t: Awaited<ReturnType<typeof setup>>['t'], id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.coins ?? 0);
const ch = (t: Awaited<ReturnType<typeof setup>>['t'], id: Id<'challenges'>) => t.run(async (ctx) => (await ctx.db.get(id))!);
const flows = (t: Awaited<ReturnType<typeof setup>>['t']) => t.run(async (ctx) => ctx.db.query('valueFlows').collect());

describe('règles pures', () => {
  test('validation, score, gagnant', () => {
    const ok = { kind: 'stars' as const, durationMs: 24 * HOUR, stake: 100, invited: ['b'] };
    expect(defiProblem(ok, 'a')).toBeNull();
    expect(defiProblem({ ...ok, invited: [] }, 'a')).toMatch(/au moins un ami/);
    expect(defiProblem({ ...ok, invited: ['a'] }, 'a')).toMatch(/toi-même/);
    expect(defiProblem({ ...ok, stake: 5000 }, 'a')).toMatch(/Mise/);
    expect(defiProblem({ ...ok, durationMs: 5 }, 'a')).toMatch(/Durée/);
    expect(defiProblem({ ...ok, kind: 'first' }, 'a')).toMatch(/rareté/);
    expect(defiGain('stars', undefined, [{ rarity: 'common' }, { rarity: 'mythic' }])).toEqual({ add: 7, hit: false });
    expect(defiGain('new', undefined, [{ rarity: 'common', isNew: true }, { rarity: 'rare', isNew: false }])).toEqual({ add: 1, hit: false });
    expect(defiGain('first', 'legendary', [{ rarity: 'epic' }]).hit).toBe(false);
    expect(defiGain('first', 'legendary', [{ rarity: 'mythic' }]).hit).toBe(true);
    expect(defiGain('first', 'mythic', [{ rarity: 'legendary' }]).hit).toBe(false);
    expect(defiWinner([3, 5, 1])).toBe(1);
    expect(defiWinner([5, 5, 1])).toBeNull();
    expect(defiWinner([0, 0])).toBeNull();
  });
});

describe('défis', () => {
  test('mise en séquestre, départ quand tout le monde a répondu, gagnant au score, flux anti-abus', async () => {
    const { t, u } = await setup();
    const id = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: 24 * HOUR, stake: 200, invitedIds: [u.bob.userId, u.carl.userId] });
    expect(await coins(t, u.alice.userId)).toBe(800);
    await t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: id, accept: true });
    expect((await ch(t, id)).status).toBe('pending');
    await t.mutation(api.challenges.respond, { sessionToken: u.carl.token, challengeId: id, accept: true });
    const live = await ch(t, id);
    expect(live.status).toBe('live');
    expect(await coins(t, u.bob.userId)).toBe(800);
    // ouvertures : bob marque le plus ; un booster scellé AVANT le départ ne compte pas
    await t.run(async (ctx) => {
      await bumpChallenges(ctx, u.bob.userId, live.startedAt! + 1, [{ rarity: 'mythic', isNew: true }]);
      await bumpChallenges(ctx, u.alice.userId, live.startedAt! + 1, [{ rarity: 'rare', isNew: true }]);
      await bumpChallenges(ctx, u.carl.userId, live.startedAt!, [{ rarity: 'mythic', isNew: true }, { rarity: 'mythic', isNew: true }]);
    });
    expect((await ch(t, id)).players.map((p) => p.score)).toEqual([3, 6, 0]);
    await t.mutation(internal.challenges.finish, { challengeId: id });
    const done = await ch(t, id);
    expect(done.status).toBe('done');
    expect(done.outcome).toBe('win');
    expect(done.winnerId).toBe(u.bob.userId);
    expect(await coins(t, u.bob.userId)).toBe(1400);
    expect(await coins(t, u.alice.userId)).toBe(800);
    const f = await flows(t);
    expect(f.map((x) => [x.fromUserId, x.toUserId, x.value, x.source])).toEqual(
      expect.arrayContaining([
        [u.alice.userId, u.bob.userId, 200, 'challenge'],
        [u.carl.userId, u.bob.userId, 200, 'challenge'],
      ]),
    );
    // les sièges sont clos : une ouverture après coup ne lit plus rien
    const seats = await t.run(async (ctx) => ctx.db.query('challengeSeats').collect());
    expect(seats.every((s) => s.phase === 'over')).toBe(true);
    // deuxième appel de fin : sans effet
    await t.mutation(internal.challenges.finish, { challengeId: id });
    expect(await coins(t, u.bob.userId)).toBe(1400);
  });

  test('égalité en tête ou personne : chaque mise est rendue', async () => {
    const { t, u } = await setup();
    const id = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'new', durationMs: HOUR, stake: 100, invitedIds: [u.bob.userId] });
    await t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: id, accept: true });
    const live = await ch(t, id);
    await t.run(async (ctx) => {
      await bumpChallenges(ctx, u.bob.userId, live.startedAt! + 1, [{ rarity: 'common', isNew: true }]);
      await bumpChallenges(ctx, u.alice.userId, live.startedAt! + 1, [{ rarity: 'common', isNew: true }]);
    });
    await t.mutation(internal.challenges.finish, { challengeId: id });
    expect((await ch(t, id)).outcome).toBe('tie');
    expect(await coins(t, u.alice.userId)).toBe(1000);
    expect(await coins(t, u.bob.userId)).toBe(1000);
    expect(await flows(t)).toHaveLength(0);
  });

  test('« premier à » : tranché dès la carte tirée', async () => {
    const { t, u } = await setup();
    const id = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'first', target: 'mythic', durationMs: 24 * HOUR, stake: 50, invitedIds: [u.bob.userId] });
    await t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: id, accept: true });
    const live = await ch(t, id);
    await t.run(async (ctx) => bumpChallenges(ctx, u.bob.userId, live.startedAt! + 1, [{ rarity: 'legendary', isNew: false }]));
    expect((await ch(t, id)).status).toBe('live');
    await t.run(async (ctx) => bumpChallenges(ctx, u.alice.userId, live.startedAt! + 1, [{ rarity: 'mythic', isNew: false }]));
    const done = await ch(t, id);
    expect(done.status).toBe('done');
    expect(done.winnerId).toBe(u.alice.userId);
    expect(await coins(t, u.alice.userId)).toBe(1050);
    expect(await coins(t, u.bob.userId)).toBe(950);
  });

  test('personne n’accepte (refus ou délai) : annulé, mise rendue ; annulation par le créateur', async () => {
    const { t, u } = await setup();
    const a = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 300, invitedIds: [u.bob.userId] });
    await t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: a, accept: false });
    expect((await ch(t, a)).status).toBe('cancelled');
    expect(await coins(t, u.alice.userId)).toBe(1000);

    const b = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 300, invitedIds: [u.bob.userId] });
    await t.mutation(internal.challenges.expire, { challengeId: b });
    expect((await ch(t, b)).outcome).toBe('alone');
    expect(await coins(t, u.alice.userId)).toBe(1000);

    const c = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 300, invitedIds: [u.bob.userId, u.carl.userId] });
    await t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: c, accept: true });
    await expect(t.mutation(api.challenges.start, { sessionToken: u.bob.token, challengeId: c })).rejects.toThrow(/⟦(challenges\.10|challenges\.8|games\.26)[⟧{]/);
    await t.mutation(api.challenges.cancel, { sessionToken: u.alice.token, challengeId: c });
    expect(await coins(t, u.alice.userId)).toBe(1000);
    expect(await coins(t, u.bob.userId)).toBe(1000);
    await expect(t.mutation(api.challenges.respond, { sessionToken: u.carl.token, challengeId: c, accept: true })).rejects.toThrow(/⟦(challenges\.5)[⟧{]/);
  });

  test('départ anticipé par le créateur, délai expiré avec un inscrit : le défi démarre sans les retardataires', async () => {
    const { t, u } = await setup();
    const a = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 0, invitedIds: [u.bob.userId, u.carl.userId] });
    await t.mutation(api.challenges.respond, { sessionToken: u.carl.token, challengeId: a, accept: true });
    await t.mutation(api.challenges.start, { sessionToken: u.alice.token, challengeId: a });
    const c = await ch(t, a);
    expect(c.status).toBe('live');
    expect(c.players.map((p) => p.state)).toEqual(['in', 'out', 'in']);
    await expect(t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: a, accept: true })).rejects.toThrow();
  });

  test('garde-fous : amis seulement, solde, 3 défis à la fois', async () => {
    const { t, u } = await setup();
    await expect(t.mutation(api.challenges.create, { sessionToken: u.bob.token, kind: 'stars', durationMs: HOUR, stake: 0, invitedIds: [u.carl.userId] })).rejects.toThrow(/⟦(challenges\.4)[⟧{]/);
    await expect(t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 2000, invitedIds: [u.bob.userId] })).rejects.toThrow(/manque/);
    for (let i = 0; i < 3; i++) await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 0, invitedIds: [u.bob.userId] });
    await expect(t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 0, invitedIds: [u.bob.userId] })).rejects.toThrow(/3 défis/);
    // mise trop haute pour l'invité
    const { t: t2, u: u2 } = await setup();
    await t2.run(async (ctx) => ctx.db.patch(u2.carl.userId, { coins: 10 }));
    const id = await t2.mutation(api.challenges.create, { sessionToken: u2.alice.token, kind: 'stars', durationMs: HOUR, stake: 100, invitedIds: [u2.carl.userId] });
    await expect(t2.mutation(api.challenges.respond, { sessionToken: u2.carl.token, challengeId: id, accept: true })).rejects.toThrow(/manque/);
    const mine = await t2.query(api.challenges.mine, { sessionToken: u2.carl.token });
    expect(mine?.list.map((c) => c._id)).toEqual([id]);
  });

  test('vraie ouverture de booster : le score « étoiles » avance dans revealPack', async () => {
    const { t, u } = await setup(['alice', 'bob']);
    const id = await t.mutation(api.challenges.create, { sessionToken: u.alice.token, kind: 'stars', durationMs: HOUR, stake: 0, invitedIds: [u.bob.userId] });
    // booster scellé avant le départ : ne compte pas
    const early = await t.mutation(api.packs.preparePack, { sessionToken: u.alice.token, packKind: 'bebou' });
    await t.mutation(api.challenges.respond, { sessionToken: u.bob.token, challengeId: id, accept: true });
    await t.mutation(api.packs.revealPack, { sessionToken: u.alice.token, packId: early._id });
    expect((await ch(t, id)).players[0].score).toBe(0);
    await new Promise((r) => setTimeout(r, 2));
    const p = await t.mutation(api.packs.preparePack, { sessionToken: u.alice.token, packKind: 'bebou' });
    await t.mutation(api.packs.revealPack, { sessionToken: u.alice.token, packId: p._id });
    expect((await ch(t, id)).players[0].score).toBeGreaterThanOrEqual(5);
  });
});
