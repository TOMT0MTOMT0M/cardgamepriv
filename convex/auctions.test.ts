/// <reference types="vite/client" />
/**
 * (V3) Enchères au marché : séquestre de la carte, pièces bloquées à l'offre, remboursement du dépassé, clôture à heure
 * fixe (idempotente), places de vente partagées avec le marché.
 *   npx vitest run convex/auctions.test.ts
 */
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';
import { auctionEndsAt, auctionNextMin } from '../src/core/auctions';
import { countReads } from './reads.testlib';
import * as auctionsMod from './auctions';

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
  return { t, alice: await mk('alice', 0), bob: await mk('bob', 100), carol: await mk('carol', 3), dave: await mk('dave', 100) };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const commons = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').map((c) => c.id);
const [A] = commons;
const give = (t: T, userId: Id<'users'>, cardId: string, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const countOf = async (t: T, token: string, cardId = A) => (await t.query(api.inventory.myCollection, { sessionToken: token })).find((c) => c.cardId === cardId)?.count ?? 0;
const coinsOf = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))?.coins ?? 0);
/** l'enchère arrive à échéance (on recule son heure de fin) */
const expire = (t: T, id: Id<'auctions'>) => t.run((ctx) => ctx.db.patch(id, { endsAt: Date.now() - 1000 }));
const ERR = (code: string) => new RegExp(`⟦(${code.replace(/\./g, '\\.')})[⟧{]`);

describe('enchères : règles pures', () => {
  test('clôture à 21 h (Paris) le jour d’échéance, heure d’hiver comme d’été', () => {
    expect(new Date(auctionEndsAt(Date.UTC(2026, 10, 27, 10), 1)).toISOString()).toBe('2026-11-28T20:00:00.000Z');
    // 23 h 30 à Paris (22 h 30 UTC) : le jour de Paris compte, pas celui d'UTC
    expect(new Date(auctionEndsAt(Date.UTC(2026, 10, 27, 22, 30), 1)).toISOString()).toBe('2026-11-28T20:00:00.000Z');
    expect(new Date(auctionEndsAt(Date.UTC(2026, 10, 27, 23, 30), 1)).toISOString()).toBe('2026-11-29T20:00:00.000Z');
    expect(new Date(auctionEndsAt(Date.UTC(2026, 6, 1, 10), 2)).toISOString()).toBe('2026-07-03T19:00:00.000Z');
    // changement d'heure (25/10/2026, 3 h) : la veille en heure d'été, la clôture en heure d'hiver
    expect(new Date(auctionEndsAt(Date.UTC(2026, 9, 24, 10), 1)).toISOString()).toBe('2026-10-25T20:00:00.000Z');
    expect(new Date(auctionEndsAt(Date.UTC(2026, 11, 30, 10), 3)).toISOString()).toBe('2027-01-02T20:00:00.000Z');
  });
  test('surenchère minimale +5 %, au moins +1', () => {
    expect(auctionNextMin({ startPrice: 7 })).toBe(7);
    expect(auctionNextMin({ startPrice: 5, bid: 5 })).toBe(6);
    expect(auctionNextMin({ startPrice: 5, bid: 100 })).toBe(105);
    expect(auctionNextMin({ startPrice: 5, bid: 101 })).toBe(107);
  });
});

describe('enchères', () => {
  test('mise aux enchères : la carte quitte la collection ; mise à prix ≥ Forge, ≤ plafond ; durée 1-3 jours ; pas de Bébou', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    const s = { sessionToken: alice.token, cardId: A, rarity: 'common' as const };
    await expect(t.mutation(api.auctions.create, { ...s, startPrice: 4, days: 1 })).rejects.toThrow(ERR('auctions.2'));
    await expect(t.mutation(api.auctions.create, { ...s, startPrice: 51, days: 1 })).rejects.toThrow(ERR('market.10'));
    await expect(t.mutation(api.auctions.create, { ...s, startPrice: 5, days: 4 })).rejects.toThrow(ERR('auctions.1'));
    const bebou = CATALOG_CARDS.find((c) => c.baseRarity === 'secret');
    if (bebou) await expect(t.mutation(api.auctions.create, { ...s, cardId: bebou.id, rarity: 'secret', startPrice: 5000, days: 1 })).rejects.toThrow(ERR('market.7'));
    const before = Date.now();
    await t.mutation(api.auctions.create, { ...s, startPrice: 5, days: 2 });
    expect(await countOf(t, alice.token)).toBe(0);
    const b = await t.query(api.auctions.board, { sessionToken: bob.token });
    expect(b.open).toHaveLength(1);
    expect(b.open[0]).toMatchObject({ cardId: A, startPrice: 5, bids: 0, sellerName: 'alice', mintNumber: 3, lead: false });
    expect(b.open[0].endsAt).toBe(auctionEndsAt(before, 2));
    // plus d'exemplaire : ni une 2ᵉ enchère, ni une vente, ni la Forge
    await expect(t.mutation(api.auctions.create, { ...s, startPrice: 5, days: 1 })).rejects.toThrow();
    await expect(t.mutation(api.market.sell, { ...s, price: 5 })).rejects.toThrow();
    await expect(t.mutation(api.economy.burn, { sessionToken: alice.token, items: [{ cardId: A, rarity: 'common', count: 1 }] })).rejects.toThrow();
  });

  test('offre : pièces prises tout de suite ; dépassé = remboursé ; pas sur sa propre enchère ; minimum ; plafond ; déjà en tête', async () => {
    const { t, alice, bob, dave } = await setup();
    await give(t, alice.userId, A, 1);
    const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 10, days: 1 });
    await expect(t.mutation(api.auctions.bid, { sessionToken: alice.token, id, amount: 10 })).rejects.toThrow(ERR('auctions.5'));
    await expect(t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 9 })).rejects.toThrow(ERR('auctions.6'));
    await expect(t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 51 })).rejects.toThrow(ERR('auctions.7'));
    await t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 10 });
    expect(await coinsOf(t, bob.userId)).toBe(90);
    expect((await t.query(api.auctions.board, { sessionToken: bob.token })).open[0]).toMatchObject({ bid: 10, bids: 1, bidderName: 'bob', lead: true });
    await expect(t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 20 })).rejects.toThrow(ERR('auctions.8'));
    // surenchère : au moins 11 (+5 %, au moins +1)
    await expect(t.mutation(api.auctions.bid, { sessionToken: dave.token, id, amount: 10 })).rejects.toThrow(ERR('auctions.6'));
    await t.mutation(api.auctions.bid, { sessionToken: dave.token, id, amount: 11 });
    expect(await coinsOf(t, bob.userId)).toBe(100);
    expect(await coinsOf(t, dave.userId)).toBe(89);
    const v = (await t.query(api.auctions.board, { sessionToken: bob.token })).open[0];
    expect(v).toMatchObject({ bid: 11, bids: 2, bidderName: 'dave', lead: false });
    // journal des pièces : prise puis remboursement
    const tx = await t.run((ctx) => ctx.db.query('coinTx').withIndex('by_user', (q) => q.eq('userId', bob.userId)).collect());
    expect(tx.map((x) => [x.reason, x.amount])).toEqual([['auction-bid', -10], ['auction-refund', 10]]);
  });

  test('pas assez de pièces : refus, rien ne bouge', async () => {
    const { t, alice, bob, carol } = await setup();
    await give(t, alice.userId, A, 1);
    const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 });
    await t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 5 });
    await expect(t.mutation(api.auctions.bid, { sessionToken: carol.token, id, amount: 6 })).rejects.toThrow(ERR('econLib.2'));
    expect(await coinsOf(t, carol.userId)).toBe(3);
    expect(await coinsOf(t, bob.userId)).toBe(95);
    expect((await t.query(api.auctions.board, {})).open[0]).toMatchObject({ bid: 5, bidderName: 'bob' });
  });

  test('deux offres concurrentes du même montant : une seule passe, l’autre doit surenchérir', async () => {
    const { t, alice, bob, dave } = await setup();
    await give(t, alice.userId, A, 1);
    const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 20, days: 1 });
    const r = await Promise.allSettled([
      t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 20 }),
      t.mutation(api.auctions.bid, { sessionToken: dave.token, id, amount: 20 }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(String((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason)).toMatch(ERR('auctions.6'));
    expect((await coinsOf(t, bob.userId)) + (await coinsOf(t, dave.userId))).toBe(180);
  });

  test('retrait : possible sans offre (la carte revient), refusé dès la première offre', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 2);
    const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 });
    await expect(t.mutation(api.auctions.cancel, { sessionToken: bob.token, id })).rejects.toThrow(ERR('auctions.3'));
    await t.mutation(api.auctions.cancel, { sessionToken: alice.token, id });
    expect(await countOf(t, alice.token)).toBe(2);
    expect((await t.query(api.auctions.board, {})).open).toHaveLength(0);
    const { id: id2 } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 });
    await t.mutation(api.auctions.bid, { sessionToken: bob.token, id: id2, amount: 5 });
    await expect(t.mutation(api.auctions.cancel, { sessionToken: alice.token, id: id2 })).rejects.toThrow(ERR('auctions.9'));
  });

  test('clôture avec offre : carte au gagnant, pièces au vendeur ; rejouée = sans effet ; pas avant l’échéance', async () => {
    const { t, alice, bob, dave } = await setup();
    await give(t, alice.userId, A, 1);
    const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 });
    await t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 5 });
    await t.mutation(api.auctions.bid, { sessionToken: dave.token, id, amount: 30 });
    expect(await t.mutation(internal.auctions.closeTick, {})).toEqual({ closed: 0 }); // pas encore échue
    await expire(t, id);
    // échue mais pas encore close : plus d'offre possible
    await expect(t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 40 })).rejects.toThrow(ERR('auctions.4'));
    expect(await t.mutation(internal.auctions.closeTick, {})).toEqual({ closed: 1 });
    expect(await countOf(t, dave.token)).toBe(1);
    expect(await coinsOf(t, dave.userId)).toBe(70);
    expect(await coinsOf(t, alice.userId)).toBe(30);
    expect(await coinsOf(t, bob.userId)).toBe(100);
    expect(await t.mutation(internal.auctions.closeTick, {})).toEqual({ closed: 0 });
    expect(await coinsOf(t, alice.userId)).toBe(30);
    expect(await countOf(t, dave.token)).toBe(1);
    const b = await t.query(api.auctions.board, { sessionToken: alice.token });
    expect(b.open).toHaveLength(0);
    expect(b.recent).toHaveLength(1);
    expect(b.recent[0]).toMatchObject({ status: 'sold', bid: 30, bidderName: 'dave' });
    expect((await t.query(api.auctions.board, { sessionToken: dave.token })).recent[0]).toMatchObject({ status: 'sold', lead: true });
    const flows = await t.run((ctx) => ctx.db.query('valueFlows').collect());
    expect(flows.filter((f) => f.source === 'auction')).toHaveLength(2);
  });

  test('clôture sans offre : la carte revient au vendeur', async () => {
    const { t, alice } = await setup();
    await give(t, alice.userId, A, 1);
    const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 3 });
    await expire(t, id);
    expect(await t.mutation(internal.auctions.closeTick, {})).toEqual({ closed: 1 });
    expect(await countOf(t, alice.token)).toBe(1);
    expect(await coinsOf(t, alice.userId)).toBe(0);
    expect((await t.query(api.auctions.board, { sessionToken: alice.token })).recent[0]).toMatchObject({ status: 'unsold' });
  });

  test('notifications : dépassé, gagnée, vendue, sans offre', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test';
    // en journée (Paris) : la nuit, un push `trade` est reporté à 8 h (convex/push.ts)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T13:00:00Z'));
    try {
      const { t, alice, bob, dave } = await setup();
      for (const u of [alice, bob, dave]) await t.run((ctx) => ctx.db.insert('pushSubs', { userId: u.userId, endpoint: `https://push.test/${u.token}`, keys: { p256dh: 'k', auth: 'a' }, createdAt: Date.now() }));
      const sends = async () =>
        (await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()))
          .filter((j) => j.name.includes('pushSend'))
          .map((j) => j.args[0] as { subs: Array<{ endpoint: string }>; payload: { title: string; body: string; kind: string; url: string } })
          .map((s) => `${s.subs[0].endpoint.split('tok-')[1]}: ${s.payload.title} | ${s.payload.body}`);
      await give(t, alice.userId, A, 1);
      await give(t, alice.userId, commons[1], 1);
      // alerte acheteur (convex/market.ts) : bob veut la carte → prévenu à la mise aux enchères, texte « enchère »
      await t.run((ctx) => ctx.db.insert('appConfig', { key: 'wishesReady' }));
      await t.mutation(api.users.toggleWish, { sessionToken: bob.token, cardId: A });
      const { id, notified } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 });
      expect(notified).toBe(1);
      const s0 = await sends();
      expect(s0).toHaveLength(1);
      expect(s0[0]).toMatch(/^bob: alice vend une carte que tu veux \| .+ aux enchères dès 5 pièces\. Clôture à 21 h\.$/);
      const base = s0.length;
      const { id: id2 } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: commons[1], rarity: 'common', startPrice: 5, days: 1 });
      await t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 5 });
      expect((await sends()).slice(base)).toHaveLength(0);
      await t.mutation(api.auctions.bid, { sessionToken: dave.token, id, amount: 8 });
      const s1 = (await sends()).slice(base);
      expect(s1).toHaveLength(1);
      expect(s1[0]).toMatch(/^bob: Tu as été dépassé sur .+ \| dave offre 8 pièces\./);
      await expire(t, id);
      await expire(t, id2);
      await t.mutation(internal.auctions.closeTick, {});
      const s2 = (await sends()).slice(base + 1).sort();
      expect(s2).toHaveLength(3);
      expect(s2.filter((x) => x.startsWith('alice: Enchère vendue'))[0]).toMatch(/dave l’emporte pour 8 pièces/);
      expect(s2.filter((x) => x.startsWith('alice: Enchère sans offre'))).toHaveLength(1);
      expect(s2.filter((x) => x.startsWith('dave: Enchère gagnée'))[0]).toMatch(/Pour 8 pièces/);
    } finally {
      delete process.env.VAPID_PUBLIC_KEY;
      vi.useRealTimers();
    }
  });

  test('prolongation : offre à 20 h 57 → 21 h 02, puis à 21 h 01 → 21 h 06 ; la tâche de 21 h 01 ne clôt pas ; clôture programmée une seule fois ; hors fenêtre : inchangée', async () => {
    // 27/11/2026 : heure d'hiver, Paris = UTC+1 → 21 h Paris = 20 h UTC
    const at = (h: number, m: number) => Date.UTC(2026, 10, 27, h - 1, m);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(at(10, 0));
      const { t, alice, bob, dave } = await setup();
      await give(t, alice.userId, A, 1);
      await give(t, alice.userId, commons[1], 1);
      const { id } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 });
      const { id: id2 } = await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: commons[1], rarity: 'common', startPrice: 5, days: 1 });
      // clôture prévue ce soir 21 h (on ramène la fin du lendemain à aujourd'hui pour l'essai)
      await t.run(async (ctx) => {
        await ctx.db.patch(id, { endsAt: at(21, 0) });
        await ctx.db.patch(id2, { endsAt: at(21, 0) });
      });
      const endOf = (x: Id<'auctions'>) => t.run(async (ctx) => (await ctx.db.get(x))!);
      // hors fenêtre (20 h 50, 10 min avant) : fin inchangée, rien de programmé
      vi.setSystemTime(at(20, 50));
      await t.mutation(api.auctions.bid, { sessionToken: dave.token, id: id2, amount: 5 });
      expect((await endOf(id2)).endsAt).toBe(at(21, 0));
      expect((await endOf(id2)).extended).toBeUndefined();
      // 20 h 57 → 21 h 02
      vi.setSystemTime(at(20, 57));
      expect(await t.mutation(api.auctions.bid, { sessionToken: bob.token, id, amount: 5 })).toEqual({ bid: 5, endsAt: at(21, 2) });
      // 21 h 01 → 21 h 06
      vi.setSystemTime(at(21, 1));
      await t.mutation(api.auctions.bid, { sessionToken: dave.token, id, amount: 6 });
      expect(await endOf(id)).toMatchObject({ endsAt: at(21, 6), extended: true, status: 'open' });
      expect((await t.query(api.auctions.board, {})).open.find((a) => a.id === id)).toMatchObject({ extended: true, endsAt: at(21, 6) });
      // la tâche horaire de 21 h 01 clôt l'enchère non prolongée, pas la prolongée
      expect(await t.mutation(internal.auctions.closeTick, {})).toEqual({ closed: 1 });
      expect((await endOf(id2)).status).toBe('sold');
      expect((await endOf(id)).status).toBe('open');
      // les deux clôtures programmées (21 h 02 puis 21 h 06) : seule la seconde clôt
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const done = await endOf(id);
      expect(done).toMatchObject({ status: 'sold', bid: 6 });
      expect(done.resolvedAt! - at(21, 6)).toBeGreaterThanOrEqual(0);
      expect(done.resolvedAt! - at(21, 6)).toBeLessThan(1000); // à 21 h 06, pas à 21 h 02
      expect(await coinsOf(t, alice.userId)).toBe(5 + 6);
      expect(await countOf(t, dave.token)).toBe(1);
      expect(await countOf(t, dave.token, commons[1])).toBe(1);
      const sells = await t.run((ctx) => ctx.db.query('coinTx').withIndex('by_user', (q) => q.eq('userId', alice.userId)).collect());
      expect(sells.filter((x) => x.reason === 'auction-sell')).toHaveLength(2); // une par enchère, jamais deux
      // filet rejoué : sans effet
      expect(await t.mutation(internal.auctions.closeTick, {})).toEqual({ closed: 0 });
      expect(await t.mutation(internal.auctions.closeAt, { id })).toEqual({ closed: false });
    } finally {
      vi.useRealTimers();
    }
  });

  test('une carte engagée dans un échange en attente ne part pas aux enchères', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, A, 1);
    await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: A, rarity: 'common', count: 1 }], requested: [] });
    await expect(t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: A, rarity: 'common', startPrice: 5, days: 1 })).rejects.toThrow(/⟦(econLib\.6|econLib\.13)[⟧{]/);
  });

  test('coût : le tableau ne lit que `auctions` (ni `presence` ni `users`) ; la clôture hors échéance ne lit rien', async () => {
    const { t, alice, bob } = await setup();
    for (const c of commons.slice(0, 5)) await give(t, alice.userId, c, 1);
    for (const c of commons.slice(0, 5)) await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: c, rarity: 'common', startPrice: 5, days: 1 });
    const { reads: r } = await countReads(t as never, auctionsMod.board, { sessionToken: bob.token });
    expect(Object.keys(r.scanned).sort()).toEqual(['auctions', 'sessions']);
    expect(r.scanned.auctions).toBe(5);
    expect(r.gets).toHaveLength(0);
    console.info(`[coût] auctions.board, 5 enchères ouvertes : ${r.docs} documents, ${r.bytes} octets`);
    const { reads: c } = await countReads(t as never, auctionsMod.closeTick as never, {});
    expect(c.scanned.auctions ?? 0).toBe(0);
    expect(c.writes).toHaveLength(0);
  });

  test('places de vente partagées : 10 au total entre prix fixe et enchères', async () => {
    const { t, alice } = await setup();
    for (const c of commons.slice(0, 11)) await give(t, alice.userId, c, 1);
    for (const c of commons.slice(0, 6)) await t.mutation(api.market.sell, { sessionToken: alice.token, cardId: c, rarity: 'common', price: 5 });
    for (const c of commons.slice(6, 10)) await t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: c, rarity: 'common', startPrice: 5, days: 1 });
    await expect(t.mutation(api.auctions.create, { sessionToken: alice.token, cardId: commons[10], rarity: 'common', startPrice: 5, days: 1 })).rejects.toThrow(ERR('market.2'));
    await expect(t.mutation(api.market.sell, { sessionToken: alice.token, cardId: commons[10], rarity: 'common', price: 5 })).rejects.toThrow(ERR('market.2'));
    expect((await t.query(api.market.wanted, { sessionToken: alice.token, cards: [] })).open).toBe(10);
  });
});
