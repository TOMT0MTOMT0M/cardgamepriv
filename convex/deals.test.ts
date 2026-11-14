/// <reference types="vite/client" />
/** Refonte des échanges (11/11) : fiche « chez les joueurs », recoupement « Pour toi », demande en un toucher. */
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
  return { t, mk, alice: await mk('alice'), bob: await mk('bob'), carol: await mk('carol', { lastSeenAt: 0 }) };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const COMMONS = CATALOG_CARDS.filter((c) => c.baseRarity === 'common' && c.themeId !== 'bebous').map((c) => c.id);
const RARES = CATALOG_CARDS.filter((c) => c.baseRarity === 'rare' && c.themeId !== 'bebous').map((c) => c.id);
const [A, B, C, D, E] = COMMONS;
const R1 = RARES[0];
const give = (t: T, userId: Id<'users'>, cardId: string, count: number, rarity: 'common' | 'rare' = 'common') =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity, count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const wish = (t: T, userId: Id<'users'>, ids: string[]) => t.run((ctx) => ctx.db.patch(userId, { wishlist: ids }));
const countOf = (t: T, userId: Id<'users'>, cardId: string) =>
  t.run(async (ctx) => (await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', cardId).eq('rarity', 'common')).unique())?.count ?? 0);

describe('fiche : chez les joueurs', () => {
  test('qui l’a (doublon, en ligne), qui la vend, qui la veut', async () => {
    const { t, alice, bob, carol } = await setup();
    await give(t, bob.userId, A, 3);
    await give(t, carol.userId, A, 1);
    await give(t, alice.userId, A, 1);
    await wish(t, carol.userId, [A]);
    await t.mutation(api.market.sell, { sessionToken: bob.token, cardId: A, rarity: 'common', price: 4 });
    const p = await t.query(api.deals.cardPanel, { sessionToken: alice.token, cardId: A });
    expect(p.owners.map((o) => [o.name, o.count, o.dup, o.online])).toEqual([
      ['bob', 2, true, true],
      ['carol', 1, false, false],
    ]);
    expect(p.sellers).toMatchObject([{ name: 'bob', price: 4 }]);
    expect(p.wanters.map((w) => w.name)).toEqual(['carol']);
    expect(p.protected).toBe(false);
    expect(p.reads).toBeLessThan(20);
  });
  test('protéger une carte : plus « doublon proposable » chez les autres', async () => {
    const { t, alice, bob } = await setup();
    await give(t, bob.userId, A, 3);
    expect(await t.mutation(api.deals.setProtect, { sessionToken: bob.token, cardId: A, on: true })).toEqual([A]);
    const p = await t.query(api.deals.cardPanel, { sessionToken: alice.token, cardId: A });
    expect(p.owners[0]).toMatchObject({ name: 'bob', dup: false });
    expect((await t.query(api.deals.cardPanel, { sessionToken: bob.token, cardId: A })).protected).toBe(true);
    expect(await t.mutation(api.deals.setProtect, { sessionToken: bob.token, cardId: A, on: false })).toEqual([]);
  });
});

describe('Pour toi : le recoupement', () => {
  test('mon envie chez un doublon ⇄ mon doublon de même étoile qui lui manque, ses envies d’abord', async () => {
    const { t, alice, bob } = await setup();
    await wish(t, alice.userId, [A, R1]);
    await give(t, bob.userId, A, 2);
    await give(t, bob.userId, R1, 2, 'rare'); // pas de doublon rare chez moi : pas d'échange pour R1
    await give(t, alice.userId, B, 2);
    await give(t, alice.userId, C, 3);
    await give(t, alice.userId, D, 1); // seul exemplaire : jamais proposé
    await give(t, bob.userId, C, 1); // il a déjà C
    await wish(t, bob.userId, [B]);
    const r = await t.query(api.deals.forYou, { sessionToken: alice.token });
    expect(r.deals).toHaveLength(1);
    expect(r.deals[0]).toMatchObject({ name: 'bob', get: { cardId: A }, give: { cardId: B }, theyWish: true, alts: [] });
    // bob cherche B, qu'il n'a pas : il est aussi dans « ils cherchent tes doublons »… sauf s'il est déjà dans l'échange prêt
    expect(r.theyWant).toEqual([]);
  });
  test('rien si la carte est protégée, ou si ma contrepartie est dans mes envies', async () => {
    const { t, alice, bob } = await setup();
    await wish(t, alice.userId, [A]);
    await give(t, bob.userId, A, 2);
    await give(t, alice.userId, B, 2);
    await t.mutation(api.deals.setProtect, { sessionToken: bob.token, cardId: A, on: true });
    expect((await t.query(api.deals.forYou, { sessionToken: alice.token })).deals).toEqual([]);
    await t.mutation(api.deals.setProtect, { sessionToken: bob.token, cardId: A, on: false });
    expect((await t.query(api.deals.forYou, { sessionToken: alice.token })).deals).toHaveLength(1);
    await wish(t, alice.userId, [A, B]);
    expect((await t.query(api.deals.forYou, { sessionToken: alice.token })).deals).toEqual([]);
  });
  test('ils cherchent mes doublons', async () => {
    const { t, alice, carol } = await setup();
    await give(t, alice.userId, C, 2);
    await wish(t, carol.userId, [C, E]);
    const r = await t.query(api.deals.forYou, { sessionToken: alice.token });
    expect(r.theyWant).toMatchObject([{ name: 'carol', card: { cardId: C } }]);
  });
  test('coût mesuré : une vingtaine de joueurs, 300 cartes chacun, 40 envies', async () => {
    const { t, mk, alice } = await setup();
    const pool = COMMONS.slice(0, 600);
    const players: Array<{ userId: Id<'users'>; token: string }> = [];
    for (let i = 0; i < 18; i++) players.push(await mk(`p${i}`));
    await t.run(async (ctx) => {
      for (const [i, p] of players.entries()) {
        const ids = new Map<string, number>();
        for (let k = 0; k < 300; k++) ids.set(pool[(i * 37 + k * 7) % pool.length], 1 + (k % 3));
        for (const [id, count] of ids) await ctx.db.insert('inventory', { userId: p.userId, cardId: id, rarity: 'common', count, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
      }
      for (let k = 0; k < 300; k++) await ctx.db.insert('inventory', { userId: alice.userId, cardId: COMMONS[600 + k], rarity: 'common', count: 1 + (k % 2), bestMintNumber: 1, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
      await ctx.db.patch(alice.userId, { wishlist: pool.slice(0, 40) });
    });
    const r = await t.query(api.deals.forYou, { sessionToken: alice.token });
    const p = await t.query(api.deals.cardPanel, { sessionToken: alice.token, cardId: pool[0] });
    console.log(`[mesure] forYou : ${r.reads} documents lus, ${r.deals.length} échanges prêts · cardPanel : ${p.reads} documents lus`);
    expect(r.deals.length).toBeGreaterThan(5);
    expect(r.reads).toBeLessThan(1200);
    expect(p.reads).toBeLessThan(60);
  }, 90_000);
});

describe('Demander en un toucher', () => {
  async function scene() {
    const s = await setup();
    const { t, alice, bob } = s;
    await give(t, bob.userId, A, 2);
    await give(t, alice.userId, B, 2);
    await give(t, alice.userId, C, 3);
    await give(t, alice.userId, D, 1);
    await wish(t, bob.userId, [C]);
    return s;
  }
  test('contrepartie choisie automatiquement (ses envies d’abord), pas deux fois la même demande', async () => {
    const { t, alice, bob } = await scene();
    const r = await t.mutation(api.deals.quick, { sessionToken: alice.token, toUserId: bob.userId, get: { cardId: A, rarity: 'common' } });
    expect(r.give.cardId).toBe(C);
    const mine = await t.query(api.trades.myTrades, { sessionToken: bob.token });
    expect(mine.incoming[0]).toMatchObject({ quick: true, offered: [{ cardId: C, count: 1 }], requested: [{ cardId: A, count: 1 }] });
    await expect(t.mutation(api.deals.quick, { sessionToken: alice.token, toUserId: bob.userId, get: { cardId: A, rarity: 'common' } })).rejects.toThrow(/⟦(deals\.11)[⟧{]/);
  });
  test('le demandeur change sa contrepartie ; le destinataire choisit autre chose et c’est conclu', async () => {
    const { t, alice, bob } = await scene();
    const r = await t.mutation(api.deals.quick, { sessionToken: alice.token, toUserId: bob.userId, get: { cardId: A, rarity: 'common' } });
    const tradeId = r.id as Id<'trades'>;
    await t.mutation(api.deals.swapGive, { sessionToken: alice.token, tradeId, cardId: B });
    const opts = await t.query(api.deals.pickOptions, { sessionToken: bob.token, tradeId });
    expect(opts.options.map((o) => o.cardId).sort()).toEqual([B, C].sort()); // D : son seul exemplaire, pas proposé
    await expect(t.mutation(api.deals.acceptPick, { sessionToken: bob.token, tradeId, cardId: D })).rejects.toThrow(/⟦(contracts\.5|deals\.20|economy\.13|market\.6)[⟧{]/);
    const done = await t.mutation(api.deals.acceptPick, { sessionToken: bob.token, tradeId, cardId: C });
    expect(done).toEqual({ status: 'accepted', changed: true });
    expect(await countOf(t, alice.userId, A)).toBe(1);
    expect(await countOf(t, alice.userId, C)).toBe(2);
    expect(await countOf(t, alice.userId, B)).toBe(2);
    expect(await countOf(t, bob.userId, C)).toBe(1);
    expect(await countOf(t, bob.userId, A)).toBe(1);
  });
  test('accepter tel quel passe par la réponse habituelle', async () => {
    const { t, alice, bob } = await scene();
    const r = await t.mutation(api.deals.quick, { sessionToken: alice.token, toUserId: bob.userId, get: { cardId: A, rarity: 'common' }, give: { cardId: B, rarity: 'common' } });
    await t.mutation(api.trades.respond, { sessionToken: bob.token, tradeId: r.id as Id<'trades'>, accept: true });
    expect(await countOf(t, bob.userId, B)).toBe(1);
    expect(await countOf(t, alice.userId, A)).toBe(1);
  });
  test('proposer mon doublon à qui le cherche : le serveur choisit ce que je reçois', async () => {
    const { t, alice, bob, carol } = await scene();
    const r = await t.mutation(api.deals.quick, { sessionToken: alice.token, toUserId: bob.userId, give: { cardId: C, rarity: 'common' } });
    expect(r.get.cardId).toBe(A);
    // carol n'a aucun doublon : rien à recevoir d'elle
    await expect(t.mutation(api.deals.quick, { sessionToken: bob.token, toUserId: carol.userId, give: { cardId: A, rarity: 'common' } })).rejects.toThrow(/⟦(contracts\.5|deals\.7|deals\.8|economy\.13)[⟧{]/);
  });
  test('étoiles différentes refusées', async () => {
    const { t, alice, bob } = await scene();
    await give(t, alice.userId, R1, 2, 'rare');
    await expect(t.mutation(api.deals.quick, { sessionToken: alice.token, toUserId: bob.userId, get: { cardId: A, rarity: 'common' }, give: { cardId: R1, rarity: 'rare' } })).rejects.toThrow(/⟦(contracts\.4|deals\.6)[⟧{]/);
  });
});
