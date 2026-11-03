/// <reference types="vite/client" />
/**
 * Tableau d'offres (retours live 02, lot T) : annonces, offres, verrouillage, acceptation atomique, contre-offre, expiration.
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob'), carol: await mk('carol') };
}
type T = Awaited<ReturnType<typeof setup>>['t'];

const commons = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').map((c) => c.id);
const [A, B, C, D] = commons;
const one = (cardId: string, count = 1) => ({ cardId, rarity: 'common' as const, count });
const give = (t: T, userId: Id<'users'>, cardId: string, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const countOf = async (t: T, token: string, cardId: string) => (await t.query(api.inventory.myCollection, { sessionToken: token })).find((c) => c.cardId === cardId)?.count ?? 0;

describe('tableau d’offres', () => {
  test('création : visible de TOUS (pas seulement des amis), 24 ou 48 h, cartes possédées et libres', async () => {
    const { t, alice, bob, carol } = await setup();
    await give(t, alice.userId, A, 2);
    await expect(t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A)], hours: 12 })).rejects.toThrow(/24 ou 48/);
    await expect(t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A, 3)], hours: 24 })).rejects.toThrow(/assez/);
    await expect(t.mutation(api.listings.create, { sessionToken: alice.token, items: [], hours: 24 })).rejects.toThrow(/au moins une/);
    const id = await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A)], wanted: [{ cardId: B, rarity: 'common' }], note: 'qui veut ?', hours: 48 });
    for (const who of [bob, carol, alice]) {
      const board = await t.query(api.listings.open, { sessionToken: who.token });
      expect(board.map((l) => l._id)).toEqual([id]);
      expect(board[0].userName).toBe('alice');
      expect(board[0].wanted).toEqual([{ cardId: B, rarity: 'common' }]);
      expect(board[0].expiresAt - board[0].createdAt).toBe(48 * 3600_000);
    }
    // sans session aussi (lecture seule)
    expect(await t.query(api.listings.open, {})).toHaveLength(1);
    const mine = await t.query(api.listings.mine, { sessionToken: alice.token });
    expect(mine.listings).toHaveLength(1);
  });

  test('verrouillage : une carte annoncée ne se brûle pas (contrat, forge), ne se repropose pas (échange, autre annonce)', async () => {
    const { t, alice, bob } = await setup();
    const ids = commons.slice(0, 5);
    for (const id of ids) await give(t, alice.userId, id, 3); // 5 × 2 doublons = 10 : juste assez pour un contrat 1★
    await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(ids[0])], hours: 24 });
    // contrat : il faudrait 2 doublons de ids[0], un seul est libre
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: ids.map((cardId) => ({ cardId, count: 2 })) })).rejects.toThrow();
    // forge : idem (3 exemplaires − 1 gardé − 1 annoncé = 1 brûlable)
    await expect(t.mutation(api.economy.burn, { sessionToken: alice.token, items: [one(ids[0], 2)] })).rejects.toThrow(/doublons libres/);
    await t.mutation(api.economy.burn, { sessionToken: alice.token, items: [one(ids[0], 1)] }); // le libre, oui
    // échange direct : le dernier exemplaire libre est déjà brûlé → plus rien à proposer
    await expect(t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [one(ids[0], 2)], requested: [] })).rejects.toThrow(/engagée/);
    // autre annonce avec la même carte : refusée (1 seul exemplaire libre restant : le dernier)
    await expect(t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(ids[0], 2)], hours: 24 })).rejects.toThrow(/engagée/);
    // un échange reçu qui demande la carte annoncée : refusé à l'acceptation
    await give(t, bob.userId, D, 1);
    const tr = await t.mutation(api.trades.propose, { sessionToken: bob.token, toUserId: alice.userId, offered: [one(D)], requested: [one(ids[0], 2)] });
    await expect(t.mutation(api.trades.respond, { sessionToken: alice.token, tradeId: tr, accept: true })).rejects.toThrow(/annonces ou offres/);
  });

  test('offre puis acceptation : échange atomique, annonce close, autres offres closes, historique et anti-abus', async () => {
    const { t, alice, bob, carol } = await setup();
    await give(t, alice.userId, A, 1);
    await give(t, bob.userId, B, 2);
    await give(t, carol.userId, C, 1);
    const lid = await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A)], hours: 24 });
    await expect(t.mutation(api.listings.offer, { sessionToken: alice.token, listingId: lid, offered: [one(A)] })).rejects.toThrow(/ton annonce/);
    const ob = await t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(B, 2)], note: 'deux pour une' });
    const oc = await t.mutation(api.listings.offer, { sessionToken: carol.token, listingId: lid, offered: [one(C)] });
    // les cartes offertes sont verrouillées chez l'offrant
    await expect(t.mutation(api.economy.burn, { sessionToken: bob.token, items: [one(B, 1)] })).rejects.toThrow(/doublons libres/);
    const mine = await t.query(api.listings.mine, { sessionToken: alice.token });
    expect(mine.listings[0].offers.map((o) => o.fromName).sort()).toEqual(['bob', 'carol']);
    expect((await t.query(api.listings.open, { sessionToken: bob.token }))[0].myOffer?._id).toBe(ob);
    // seul l'auteur accepte
    await expect(t.mutation(api.listings.accept, { sessionToken: carol.token, offerId: ob })).rejects.toThrow(/auteur/);
    await t.mutation(api.listings.accept, { sessionToken: alice.token, offerId: ob });
    expect(await countOf(t, alice.token, A)).toBe(0);
    expect(await countOf(t, alice.token, B)).toBe(2);
    expect(await countOf(t, bob.token, A)).toBe(1);
    expect(await countOf(t, bob.token, B)).toBe(0);
    expect(await countOf(t, carol.token, C)).toBe(1); // carol n'a rien perdu
    expect(await t.query(api.listings.open, { sessionToken: bob.token })).toHaveLength(0);
    const offers = await t.run((ctx) => Promise.all([ctx.db.get(ob), ctx.db.get(oc), ctx.db.get(lid)]));
    expect(offers.map((x) => x?.status)).toEqual(['accepted', 'closed', 'closed']);
    // historique (les deux joueurs) + flux de valeur (alertes anti-abus)
    const hist = await t.query(api.trades.history, { sessionToken: bob.token });
    expect(hist[0].status).toBe('accepted');
    expect(hist[0].listingId).toBe(lid);
    const flows = await t.run((ctx) => ctx.db.query('valueFlows').collect());
    expect(flows.map((f) => f.source)).toEqual(['listing', 'listing']);
    // plus d'action sur une annonce close
    await expect(t.mutation(api.listings.accept, { sessionToken: alice.token, offerId: oc })).rejects.toThrow();
  });

  test('l’acceptation échoue en bloc si l’offrant n’a plus les cartes (rien ne bouge)', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await give(t, bob.userId, B, 1);
    const lid = await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A)], hours: 24 });
    const ob = await t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(B)] });
    await t.run(async (ctx) => {
      const row = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', bob.userId)).first();
      await ctx.db.delete(row!._id);
    });
    await expect(t.mutation(api.listings.accept, { sessionToken: alice.token, offerId: ob })).rejects.toThrow(/bob/);
    expect(await countOf(t, alice.token, A)).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(lid)))?.status).toBe('open');
  });

  test('contre-offre : l’auteur donne une partie de l’annonce et demande autre chose ; l’offrant accepte', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await give(t, alice.userId, B, 1);
    await give(t, bob.userId, C, 1);
    await give(t, bob.userId, D, 1);
    const lid = await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A), one(B)], hours: 24 });
    const ob = await t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(C)] });
    // une contre-offre ne donne que des cartes de l'annonce
    await expect(t.mutation(api.listings.counter, { sessionToken: alice.token, offerId: ob, give: [one(C)], want: [] })).rejects.toThrow(/annonce/);
    await t.mutation(api.listings.counter, { sessionToken: alice.token, offerId: ob, give: [one(A)], want: [one(C), one(D)], note: 'A contre tes deux' });
    let mine = await t.query(api.listings.mine, { sessionToken: bob.token });
    expect(mine.offers[0].status).toBe('countered');
    expect(mine.offers[0].counter?.want).toHaveLength(2);
    // l'auteur ne peut plus accepter l'offre d'origine pendant la contre-offre ; seul l'offrant répond
    await expect(t.mutation(api.listings.accept, { sessionToken: alice.token, offerId: ob })).rejects.toThrow();
    await expect(t.mutation(api.listings.respondCounter, { sessionToken: alice.token, offerId: ob, accept: true })).rejects.toThrow(/auteur de l’offre/);
    await t.mutation(api.listings.respondCounter, { sessionToken: bob.token, offerId: ob, accept: true });
    expect(await countOf(t, bob.token, A)).toBe(1);
    expect(await countOf(t, bob.token, C)).toBe(0);
    expect(await countOf(t, bob.token, D)).toBe(0);
    expect(await countOf(t, alice.token, B)).toBe(1); // B n'était pas dans la contre-offre : alice la garde
    expect(await countOf(t, alice.token, D)).toBe(1);
    mine = await t.query(api.listings.mine, { sessionToken: bob.token });
    expect(mine.offers[0].status).toBe('accepted');
  });

  test('refus, retrait, nouvelle offre qui remplace l’ancienne', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await give(t, bob.userId, B, 1);
    await give(t, bob.userId, C, 1);
    const lid = await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A)], hours: 24 });
    const o1 = await t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(B)] });
    const o2 = await t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(B), one(C)] }); // B : son propre verrou ne compte pas
    expect((await t.run((ctx) => ctx.db.get(o1)))?.status).toBe('withdrawn');
    await t.mutation(api.listings.decline, { sessionToken: alice.token, offerId: o2 });
    expect((await t.run((ctx) => ctx.db.get(o2)))?.status).toBe('declined');
    // refusée : les cartes de bob sont libres
    await t.mutation(api.trades.propose, { sessionToken: bob.token, toUserId: alice.userId, offered: [one(B), one(C)], requested: [] });
    // l'auteur retire son annonce : ses cartes sont libres
    await t.mutation(api.listings.cancel, { sessionToken: alice.token, listingId: lid });
    await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [one(A)], requested: [] });
  });

  test('expiration : hors du tableau, cartes libérées, offres refusées, puis fermée par la tâche planifiée', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await give(t, bob.userId, B, 1);
    const lid = await t.mutation(api.listings.create, { sessionToken: alice.token, items: [one(A)], hours: 24 });
    const ob = await t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(B)] });
    await t.run((ctx) => ctx.db.patch(lid, { expiresAt: Date.now() - 1 }));
    expect(await t.query(api.listings.open, { sessionToken: bob.token })).toHaveLength(0);
    await expect(t.mutation(api.listings.accept, { sessionToken: alice.token, offerId: ob })).rejects.toThrow(/expiré/);
    await expect(t.mutation(api.listings.offer, { sessionToken: bob.token, listingId: lid, offered: [one(B)] })).rejects.toThrow(/expiré/);
    // plus de verrou (même avant la tâche planifiée)
    await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [one(A)], requested: [] });
    await t.mutation(api.trades.propose, { sessionToken: bob.token, toUserId: alice.userId, offered: [one(B)], requested: [] });
    expect(await t.mutation(internal.listings.expireTick, {})).toBe(1);
    const [l, o] = await t.run((ctx) => Promise.all([ctx.db.get(lid), ctx.db.get(ob)]));
    expect(l?.status).toBe('expired');
    expect(o?.status).toBe('closed');
    const mine = await t.query(api.listings.mine, { sessionToken: alice.token });
    expect(mine.listings[0].status).toBe('expired'); // reste visible 48 h dans « Mes annonces »
  });
});
