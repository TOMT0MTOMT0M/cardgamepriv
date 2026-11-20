/// <reference types="vite/client" />
/**
 * Roulette : couleurs et mises couleur (20/11 — convex/games.ts, règles : src/core/games.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { COLOR_BET_MAX, COLOR_BET_MIN, COLOR_PAYOUT, ROULETTE_NUMBERS, colorBetProblem, colorCount, colorPayout, rouletteColor } from '../src/core/games';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob']) {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of names)
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 1000 });
      await ctx.db.insert('sessions', { token: `tok-${name}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token: `tok-${name}` };
    });
  return { t, u };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const coins = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.coins ?? 0);

describe('règles pures', () => {
  test('17 rouges, 17 noirs, 2 verts face à face ; deux voisins sur la roue n’ont jamais la même couleur', () => {
    expect([colorCount('red'), colorCount('black'), colorCount('green')]).toEqual([17, 17, 2]);
    expect([rouletteColor(18), rouletteColor(36), rouletteColor(1), rouletteColor(2), rouletteColor(19), rouletteColor(35)]).toEqual(['green', 'green', 'red', 'black', 'black', 'black']);
    for (let n = 1; n <= ROULETTE_NUMBERS; n++) expect(rouletteColor(n), String(n)).not.toBe(rouletteColor((n % ROULETTE_NUMBERS) + 1));
  });
  test('gains : × 2 rouge / noir, × 10 vert ; la maison garde un petit avantage, jamais l’inverse', () => {
    expect(COLOR_PAYOUT).toEqual({ red: 2, black: 2, green: 10 });
    expect([colorPayout('red', 100, 1), colorPayout('red', 100, 2), colorPayout('green', 100, 36), colorPayout('black', 100, 18)]).toEqual([200, 0, 1000, 0]);
    for (const c of ['red', 'black', 'green'] as const) {
      const back = (colorCount(c) / ROULETTE_NUMBERS) * COLOR_PAYOUT[c];
      expect(back, c).toBeLessThan(1);
      expect(back, c).toBeGreaterThan(0.5);
    }
  });
  test('mise couleur : couleur connue, une par tirage, entre le minimum et le maximum', () => {
    expect(colorBetProblem('red', 100, false)).toBeNull();
    expect(colorBetProblem('bleu', 100, false)).toMatch(/Couleur inconnue/);
    expect(colorBetProblem('red', 100, true)).toMatch(/déjà misé sur une couleur/);
    expect(colorBetProblem('red', COLOR_BET_MIN - 1, false)).toMatch(/entre 50 et 1000/);
    expect(colorBetProblem('red', COLOR_BET_MAX + 1, false)).toMatch(/entre 50 et 1000/);
    expect(colorBetProblem('red', 100.5, false)).toMatch(/entre 50 et 1000/);
  });
});

describe('mises couleur', () => {
  test('numéro + couleur au même tirage ; la couleur est réglée hors du pot', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: { coins: 300, cards: [] } });
    expect(await t.mutation(api.games.placeColorBet, { sessionToken: u.alice.token, color: 'red', coins: 200 })).toEqual({ color: 'red', coins: 200 });
    await expect(t.mutation(api.games.placeColorBet, { sessionToken: u.alice.token, color: 'black', coins: 50 })).rejects.toThrow(/déjà misé sur une couleur/);
    await expect(t.mutation(api.games.placeColorBet, { sessionToken: u.bob.token, color: 'green', coins: 5000 })).rejects.toThrow(/entre 50 et 1000/);
    await t.mutation(api.games.placeColorBet, { sessionToken: u.bob.token, color: 'green', coins: 100 });
    expect(await coins(t, u.alice.userId)).toBe(500);
    let r = (await t.query(api.games.roulette, {}))!;
    // la mise couleur n'entre pas dans le pot
    expect(r.round!.pot.coins).toBe(300);
    expect(r.round!.colorBets!.map((b) => [b.name, b.color, b.coins])).toEqual([['alice', 'red', 200], ['bob', 'green', 100]]);
    // le 3 (rouge) sort : Alice double sa mise couleur, perd sa mise numéro (le pot est reporté) ; Bob perd
    await t.mutation(internal.games.forceDraw, { number: 3 });
    expect(await coins(t, u.alice.userId)).toBe(900);
    expect(await coins(t, u.bob.userId)).toBe(900);
    r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.carriedCoins).toBe(300);
    expect(r.round!.colorBets ?? []).toEqual([]);
    expect(r.past[0].colors).toEqual([
      { userId: u.alice.userId, name: 'alice', color: 'red', coins: 200, paid: 400 },
      { userId: u.bob.userId, name: 'bob', color: 'green', coins: 100, paid: 0 },
    ]);
    // seul le bénéfice compte dans les « pièces gagnées »
    expect((await t.run(async (ctx) => (await ctx.db.get(u.alice.userId))!.econ))?.earned).toBe(200);
  });

  test('le vert rend 10 fois la mise ; numéro et couleur gagnants se cumulent', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [36], stake: { coins: 300, cards: [] } });
    await t.mutation(api.games.placeColorBet, { sessionToken: u.alice.token, color: 'green', coins: 50 });
    await t.mutation(internal.games.forceDraw, { number: 36 });
    // 1000 − 300 − 50 + 300 (pot) + 500 (vert × 10)
    expect(await coins(t, u.alice.userId)).toBe(1450);
    const r = (await t.query(api.games.roulette, {}))!;
    expect(r.past[0].result?.winnerName).toBe('alice');
    expect(r.past[0].colors[0].paid).toBe(500);
  });

  test('pas assez de pièces : refusé, rien n’est misé', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await t.run(async (ctx) => ctx.db.patch(u.alice.userId, { coins: 40 }));
    await expect(t.mutation(api.games.placeColorBet, { sessionToken: u.alice.token, color: 'red', coins: 50 })).rejects.toThrow();
    expect(((await t.query(api.games.roulette, {}))!.round!.colorBets ?? []).length).toBe(0);
    expect(await coins(t, u.alice.userId)).toBe(40);
  });
});
