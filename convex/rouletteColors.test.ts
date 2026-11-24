/// <reference types="vite/client" />
/**
 * Roulette : couleurs (20/11) et couleur sur ses numéros à double prix, pot de secours (23/11 — convex/games.ts,
 * règles : src/core/games.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { ROULETTE_NUMBERS, betProblem, colorCount, rouletteColor, rouletteWinner } from '../src/core/games';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob']) {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of names)
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 4000 }); // (25/11) 1 numéro = 1000 pièces, 2000 avec une couleur
      await ctx.db.insert('sessions', { token: `tok-${name}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token: `tok-${name}` };
    });
  return { t, u };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const coins = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.coins ?? 0);

describe('règles pures', () => {
  test('18 rouges, 17 noirs, un seul vert (36) ; deux voisins sur la roue n’ont jamais la même couleur', () => {
    expect([colorCount('red'), colorCount('black'), colorCount('green')]).toEqual([18, 17, 1]);
    expect([rouletteColor(36), rouletteColor(18), rouletteColor(1), rouletteColor(2), rouletteColor(35)]).toEqual(['green', 'black', 'red', 'black', 'red']);
    for (let n = 1; n <= ROULETTE_NUMBERS; n++) expect(rouletteColor(n), String(n)).not.toBe(rouletteColor((n % ROULETTE_NUMBERS) + 1));
  });
  test('une couleur sur ses numéros = la mise payée deux fois', () => {
    const none = new Set<number>();
    expect(betProblem([5], { coins: 1000, cards: [] }, none, 0)).toBeNull();
    expect(betProblem([5], { coins: 2000, cards: [] }, none, 0, 'red')).toBeNull();
    expect(betProblem([5], { coins: 1000, cards: [] }, none, 0, 'red')).toMatch(/2000 pièces/);
    expect(betProblem([5], { coins: 2000, cards: [] }, none, 0)).not.toBeNull();
    expect(betProblem([5], { coins: 2000, cards: [] }, none, 0, 'bleu')).toMatch(/Couleur inconnue/);
  });
  test('gagnant : numéro exact d’abord, sinon la couleur sortie (la plus grosse mise, puis la première)', () => {
    const v = (b: { coins: number }) => b.coins;
    const bets = [
      { name: 'a', numbers: [2], coins: 600, color: 'red' },
      { name: 'b', numbers: [4], coins: 1200, color: 'red' },
      { name: 'c', numbers: [7], coins: 600, color: 'red' },
      { name: 'd', numbers: [9], coins: 300 },
    ];
    expect(rouletteWinner(bets, 9, v)).toEqual({ bet: bets[3], byColor: false });
    expect(rouletteWinner(bets, 11, v)).toEqual({ bet: bets[1], byColor: true });
    expect(rouletteWinner(bets.filter((b) => b.name !== 'b'), 11, v)?.bet.name).toBe('a');
    expect(rouletteWinner(bets, 12, v)).toBeNull();
    expect(rouletteWinner(bets, 36, v)).toBeNull();
  });
});

describe('couleur sur ses numéros', () => {
  test('pot de secours : personne n’a le numéro, la couleur rafle le pot', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: { coins: 1000, cards: [] }, color: 'black' })).rejects.toThrow(/2000 pièces/);
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: { coins: 2000, cards: [] }, color: 'black' });
    await t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [7], stake: { coins: 1000, cards: [] } });
    expect(await coins(t, u.alice.userId)).toBe(2000);
    let r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.pot.coins).toBe(3000);
    expect(r.round!.bets.map((b) => b.color ?? null)).toEqual(['black', null]);
    // le 12 (noir) sort : personne ne l'a, Alice avait le noir → le pot est à elle
    await t.mutation(internal.games.forceDraw, { number: 12 });
    expect(await coins(t, u.alice.userId)).toBe(5000);
    expect(await coins(t, u.bob.userId)).toBe(3000);
    r = (await t.query(api.games.roulette, {}))!;
    expect(r.past[0].result).toMatchObject({ number: 12, winnerName: 'alice', byColor: true });
    expect(r.round!.carriedCoins).toBe(0);
  });

  test('le numéro exact passe avant la couleur ; mauvaise couleur : le pot est reporté', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: { coins: 2000, cards: [] }, color: 'red' });
    await t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [7], stake: { coins: 1000, cards: [] } });
    await t.mutation(internal.games.forceDraw, { number: 7 });
    let r = (await t.query(api.games.roulette, {}))!;
    expect(r.past[0].result).toMatchObject({ winnerName: 'bob' });
    expect(r.past[0].result?.byColor).toBeUndefined();
    await t.run(async (ctx) => ctx.db.patch(u.alice.userId, { coins: 4000 }));
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: { coins: 2000, cards: [] }, color: 'red' });
    await t.mutation(internal.games.forceDraw, { number: 36 });
    r = (await t.query(api.games.roulette, {}))!;
    expect(r.past[0].result?.winnerName).toBeUndefined();
    expect(r.round!.carriedCoins).toBe(2000);
  });

  test('anciennes mises couleur (staging) : rendues au tirage', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await t.run(async (ctx) => {
      const r = (await ctx.db.query('rouletteRounds').withIndex('by_status', (q) => q.eq('status', 'open')).first())!;
      await ctx.db.patch(r._id, { colorBets: [{ userId: u.alice.userId, name: 'alice', color: 'red', coins: 200, createdAt: Date.now() }] });
      await ctx.db.patch(u.alice.userId, { coins: 800 });
    });
    await t.mutation(internal.games.forceDraw, { number: 3 });
    expect(await coins(t, u.alice.userId)).toBe(1000);
  });
});
