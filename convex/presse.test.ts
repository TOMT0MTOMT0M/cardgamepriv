/// <reference types="vite/client" />
/**
 * La Presse (convex/presse.ts, règles : src/core/presse.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { SLOT_WEIGHTS } from '../src/core/dropRates';
import { CARD_STARS } from '../src/core/economy';
import { PRESSE_DAILY, PRESSE_RATE, PRESSE_STRIKES, presseStar, presseStrip } from '../src/core/presse';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const { userId, token } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'alice', packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 1000 });
    await ctx.db.insert('sessions', { token: 'tok', userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    return { userId, token: 'tok' };
  });
  return { t, userId, token };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const coins = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.coins ?? 0);
/** impose la bande gravée (le tirage est aléatoire) */
const forceStrip = (t: T, id: Id<'presseRuns'>, rarities: string[]) =>
  t.run(async (ctx) => ctx.db.patch(id, { strip: rarities.map((r, i) => ({ cardId: `c${i}`, cardName: `C${i}`, rarity: r as never })) }));

describe('règles pures', () => {
  test('bande : 6 cartes de l’album choisi ; avantage de la maison entre 5 et 10 % en jouant au mieux', () => {
    const strip = presseStrip({ kind: 'bebou' }, Math.random);
    expect(strip).toHaveLength(PRESSE_STRIKES);
    // programmation dynamique : meilleure décision (encaisser / frapper) à chaque état
    const p = Object.entries(SLOT_WEIGHTS).map(([r, w]) => ({ s: CARD_STARS[r as keyof typeof CARD_STARS], w: w / 100 }));
    const memo = new Map<string, number>();
    const V = (last: number, P: number, k: number): number => {
      const key = `${last}|${P}|${k}`;
      if (memo.has(key)) return memo.get(key)!;
      const stop = PRESSE_RATE * P;
      const go = k >= PRESSE_STRIKES ? 0 : p.reduce((a, x) => a + x.w * (x.s === last ? 0 : V(x.s, P + x.s, k + 1)), 0);
      const best = k >= PRESSE_STRIKES ? stop : Math.max(stop, go);
      memo.set(key, best);
      return best;
    };
    const ev = p.reduce((a, x) => a + x.w * V(x.s, x.s, 1), 0);
    expect(ev).toBeGreaterThan(0.9);
    expect(ev).toBeLessThan(0.95);
    expect(presseStar(100)).toBe(38);
  });
});

describe('La Presse', () => {
  test('la bande ne sort que frappe par frappe ; encaisser paie étoiles × valeur d’une étoile', async () => {
    const { t, userId, token } = await setup();
    const run = await t.mutation(api.presse.start, { sessionToken: token, bet: 100, album: { kind: 'bebou' } });
    expect(await coins(t, userId)).toBe(900);
    expect(run.cards).toHaveLength(1);
    expect(JSON.stringify(run)).not.toContain('strip');
    await forceStrip(t, run._id, ['rare', 'epic', 'epic', 'common', 'common', 'common']);
    const cur = await t.query(api.presse.current, { sessionToken: token });
    expect(cur?.run?.cards).toHaveLength(1);
    const s = await t.mutation(api.presse.strike, { sessionToken: token, runId: run._id });
    expect(s.status).toBe('live');
    expect(s.value).toBe(38 * 7);
    await expect(t.mutation(api.presse.start, { sessionToken: token, bet: 50, album: { kind: 'bebou' } })).rejects.toThrow(/⟦(presse\.1)[⟧{]/);
    const end = await t.mutation(api.presse.cashOut, { sessionToken: token, runId: run._id });
    expect(end.status).toBe('cashed');
    expect(end.payout).toBe(266);
    expect(await coins(t, userId)).toBe(900 + 266);
    // partie close : frapper n'y change plus rien
    await t.mutation(api.presse.strike, { sessionToken: token, runId: run._id });
    expect(await coins(t, userId)).toBe(1166);
  });

  test('deux raretés identiques d’affilée : la pièce se fend, la mise est perdue', async () => {
    const { t, userId, token } = await setup();
    const run = await t.mutation(api.presse.start, { sessionToken: token, bet: 250, album: { kind: 'bebou' } });
    await forceStrip(t, run._id, ['uncommon', 'common', 'common', 'rare', 'rare', 'rare']);
    await t.mutation(api.presse.strike, { sessionToken: token, runId: run._id });
    const r = await t.mutation(api.presse.strike, { sessionToken: token, runId: run._id });
    expect(r.status).toBe('cracked');
    expect(r.payout).toBe(0);
    expect(r.cards).toHaveLength(3);
    expect(await coins(t, userId)).toBe(750);
  });

  test('6e frappe : encaissement automatique', async () => {
    const { t, userId, token } = await setup();
    const run = await t.mutation(api.presse.start, { sessionToken: token, bet: 50, album: { kind: 'bebou' } });
    await forceStrip(t, run._id, ['common', 'uncommon', 'common', 'uncommon', 'common', 'uncommon']);
    let r = run;
    for (let i = 1; i < PRESSE_STRIKES; i++) r = await t.mutation(api.presse.strike, { sessionToken: token, runId: run._id });
    expect(r.status).toBe('cashed');
    expect(r.payout).toBe(19 * 9);
    expect(await coins(t, userId)).toBe(950 + 171);
  });

  test('mises permises, solde, 20 parties par jour', async () => {
    const { t, userId, token } = await setup();
    await expect(t.mutation(api.presse.start, { sessionToken: token, bet: 75, album: { kind: 'bebou' } })).rejects.toThrow(/⟦(defis\.3|games\.10|games\.30|presse\.2)[⟧{]/);
    await expect(t.mutation(api.presse.start, { sessionToken: token, bet: 50, album: { kind: 'theme', themeId: 'nope' } })).rejects.toThrow(/⟦(presse\.5)[⟧{]/);
    await t.run(async (ctx) => ctx.db.patch(userId, { coins: 10 }));
    await expect(t.mutation(api.presse.start, { sessionToken: token, bet: 50, album: { kind: 'bebou' } })).rejects.toThrow(/manque/);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { coins: 100000 });
      for (let i = 0; i < PRESSE_DAILY; i++) await ctx.db.insert('presseRuns', { userId, bet: 50, album: { kind: 'bebou' }, strip: [], shown: 1, status: 'cracked', createdAt: Date.now() - i });
    });
    await expect(t.mutation(api.presse.start, { sessionToken: token, bet: 50, album: { kind: 'bebou' } })).rejects.toThrow(/⟦(economy\.7|presse\.4)[⟧{]/);
    const cur = await t.query(api.presse.current, { sessionToken: token });
    expect(cur?.today).toBe(PRESSE_DAILY);
  });
});
