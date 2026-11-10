/// <reference types="vite/client" />
/**
 * Marché (retours Hugo 10/11) : vente à prix fixe en pièces, séquestre de la carte, achat atomique, retrait.
 *   npx vitest run convex/market.test.ts
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, coins: number) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), coins });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice', 0), bob: await mk('bob', 100), carol: await mk('carol', 3) };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const [A] = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').map((c) => c.id);
const give = (t: T, userId: Id<'users'>, cardId: string, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const countOf = async (t: T, token: string) => (await t.query(api.inventory.myCollection, { sessionToken: token })).find((c) => c.cardId === A)?.count ?? 0;
const coinsOf = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))?.coins ?? 0);

describe('marché', () => {
  test('vente : la carte quitte la collection, l’annonce est visible de tous ; prix bornés ; retrait = la carte revient', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await expect(t.mutation(api.market.sell, { sessionToken: alice.token, cardId: A, rarity: 'common', price: 0 })).rejects.toThrow(/Prix invalide/);
    await expect(t.mutation(api.market.sell, { sessionToken: alice.token, cardId: A, rarity: 'common', price: 51 })).rejects.toThrow(/trop élevé/);
    await t.mutation(api.market.sell, { sessionToken: alice.token, cardId: A, rarity: 'common', price: 8 });
    expect(await countOf(t, alice.token)).toBe(0);
    const b = await t.query(api.market.board, { sessionToken: bob.token });
    expect(b.open).toHaveLength(1);
    expect(b.open[0]).toMatchObject({ cardId: A, price: 8, sellerName: 'alice', mintNumber: 3 });
    // plus d'exemplaire : impossible de la vendre deux fois
    await expect(t.mutation(api.market.sell, { sessionToken: alice.token, cardId: A, rarity: 'common', price: 8 })).rejects.toThrow();
    await expect(t.mutation(api.market.cancel, { sessionToken: bob.token, id: b.open[0].id })).rejects.toThrow(/introuvable/);
    await t.mutation(api.market.cancel, { sessionToken: alice.token, id: b.open[0].id });
    expect(await countOf(t, alice.token)).toBe(1);
    expect((await t.query(api.market.board, {})).open).toHaveLength(0);
  });

  test('achat : pièces de l’acheteur au vendeur, carte à l’acheteur, une seule fois ; pas assez de pièces = refus', async () => {
    const { t, alice, bob, carol } = await setup();
    await give(t, alice.userId, A, 2);
    await t.mutation(api.market.sell, { sessionToken: alice.token, cardId: A, rarity: 'common', price: 9 });
    const [m] = (await t.query(api.market.board, {})).open;
    await expect(t.mutation(api.market.buy, { sessionToken: alice.token, id: m.id, price: 9 })).rejects.toThrow(/propre annonce/);
    await expect(t.mutation(api.market.buy, { sessionToken: carol.token, id: m.id, price: 9 })).rejects.toThrow(/Pas assez de pièces/);
    await expect(t.mutation(api.market.buy, { sessionToken: bob.token, id: m.id, price: 5 })).rejects.toThrow(/prix a changé/);
    await t.mutation(api.market.buy, { sessionToken: bob.token, id: m.id, price: 9 });
    expect(await coinsOf(t, bob.userId)).toBe(91);
    expect(await coinsOf(t, alice.userId)).toBe(9);
    expect(await countOf(t, bob.token)).toBe(1);
    expect(await countOf(t, alice.token)).toBe(1);
    await expect(t.mutation(api.market.buy, { sessionToken: bob.token, id: m.id, price: 9 })).rejects.toThrow(/Trop tard/);
    const ab = await t.query(api.market.board, { sessionToken: alice.token });
    expect(ab.open).toHaveLength(0);
    expect(ab.sold).toHaveLength(1);
    expect((await t.query(api.market.board, { sessionToken: bob.token })).bought).toHaveLength(1);
  });

  test('une carte engagée dans un échange en attente ne se vend pas ; pas de Bébou', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: A, rarity: 'common', count: 1 }], requested: [] });
    await expect(t.mutation(api.market.sell, { sessionToken: alice.token, cardId: A, rarity: 'common', price: 5 })).rejects.toThrow(/engagée/);
    const bebou = CATALOG_CARDS.find((c) => c.baseRarity === 'secret');
    if (bebou) await expect(t.mutation(api.market.sell, { sessionToken: alice.token, cardId: bebou.id, rarity: 'secret', price: 5 })).rejects.toThrow(/Bébou/);
  });
});
