/// <reference types="vite/client" />
/**
 * Audit perf 12/11, lot S07 : plus de collection relue en entier pour un affichage ou un geste.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { countReads } from './reads.testlib';
import * as economy from './economy';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const CARDS = THEMES.flatMap((t) => t.cards).slice(0, 150);

async function setup(n = 6) {
  const t = convexTest(schema, modules);
  const ids: Array<{ userId: Id<'users'>; token: string }> = [];
  for (let i = 0; i < n; i++)
    ids.push(
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert('users', { discordId: `d${i}`, username: `j${i}`, displayName: `J${i}`, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 10 + i, lastSeenAt: Date.now(), packRegenAt: Date.now(), streak: { count: 3, day: '2020-01-01', rewardedAt: 0 } });
        await ctx.db.insert('sessions', { token: `tok-${i}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
        for (const c of CARDS.slice(0, 100 + i * 10)) await ctx.db.insert('inventory', { userId, cardId: c.id, rarity: c.rarity === 'secret' ? 'common' : c.rarity, count: 3, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
        return { userId, token: `tok-${i}` };
      }),
    );
  await t.run(async (ctx) => {
    for (const o of ids.slice(1)) await ctx.db.insert('friendships', { requesterId: ids[0].userId, addresseeId: o.userId, status: 'accepted', createdAt: 1, respondedAt: 2 });
  });
  return { t, ids };
}

describe('S07 — collections relues en entier', () => {
  test('Succès > Amis : même réponse, sans relire les collections (A6-06)', async () => {
    const { t, ids } = await setup();
    const me = { sessionToken: ids[0].token };
    await t.action(internal.profiles.refreshRanks, {});
    await t.action(internal.profiles.refreshRanks, {});
    const after = await countReads(t as never, economy.friendsAchievements, me);
    // lignes de classement sans signature (état d'avant le lot) : calcul complet, collection de chacun relue
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query('rankRows').collect()) await ctx.db.patch(r._id, { sig: undefined });
    });
    const before = await countReads(t as never, economy.friendsAchievements, me);
    expect(after.result).toEqual(before.result);
    expect((after.result as unknown[]).length).toBe(6);
    console.log(`[mesure S07] Succès > Amis, moi + 5 amis (100 à 150 cartes) : ${before.reads.docs} → ${after.reads.docs} documents lus`);
    expect(after.reads.scanned.inventory).toBeLessThanOrEqual(6); // la dernière révision de chacun, pas sa collection
  });

  test('forge : seulement les lignes brûlées (A6-09)', async () => {
    const { t, ids } = await setup(1);
    const items = CARDS.slice(0, 4).map((c) => ({ cardId: c.id, rarity: (c.rarity === 'secret' ? 'common' : c.rarity) as never, count: 1 }));
    const { reads } = await countReads(t as never, economy.burn, { sessionToken: ids[0].token, items });
    console.log(`[mesure S07] forge, 4 cartes brûlées sur une collection de 100 : ${reads.scanned.inventory} lignes d'inventaire lues`);
    expect(reads.scanned.inventory).toBe(4);
    const rows = await t.run((ctx) => ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', ids[0].userId)).collect());
    expect(rows.filter((r) => r.count === 2)).toHaveLength(4);
    // jamais le dernier exemplaire
    await expect(t.mutation(api.economy.burn, { sessionToken: ids[0].token, items: [{ ...items[0], count: 2 }] })).rejects.toThrow();
  });

  test('profil d’un ami : sa collection dans la même réponse (A4-02), classeurs épinglés seulement (T-10)', async () => {
    const { t, ids } = await setup(2);
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) await ctx.db.insert('binders', { userId: ids[1].userId, name: `c${i}`, cards: [], pinned: i === 2, createdAt: i, updatedAt: i });
    });
    const plain = await t.query(api.profiles.profile, { userId: ids[1].userId });
    const full = await t.query(api.profiles.profile, { userId: ids[1].userId, withCollection: true });
    expect(plain).not.toHaveProperty('collection');
    expect(full!.collection).toHaveLength(110);
    expect(full!.collection![0]).toEqual({ cardId: CARDS[0].id, rarity: expect.any(String), count: 3, bestMintNumber: 1 });
    expect({ ...full, collection: undefined }).toEqual({ ...plain, collection: undefined });
    expect(plain!.pinnedBinders.map((b) => b.name)).toEqual(['c2']);
    expect(await t.query(api.inventory.userCollectionSlim, { userId: ids[1].userId })).toEqual(full!.collection);
  });

  test('contrat : seulement les lignes utiles, et une carte déjà possédée à la rareté visée s’ajoute à sa ligne (A7-04)', async () => {
    const { t, ids } = await setup(1);
    const userId = ids[0].userId;
    const { CONTRACT_COST, contractTarget } = await import('../src/core/contracts');
    const commons = THEMES.flatMap((x) => x.cards).filter((c) => c.rarity === 'common');
    const target = contractTarget('common')!;
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) await ctx.db.delete(r._id);
      // des doublons communs à brûler, et TOUTES les cartes de la rareté visée déjà possédées
      for (const c of commons.slice(0, 12)) await ctx.db.insert('inventory', { userId, cardId: c.id, rarity: 'common', count: 9, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
      for (const c of THEMES.flatMap((x) => x.cards).filter((c) => c.rarity === target)) await ctx.db.insert('inventory', { userId, cardId: c.id, rarity: target as never, count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
    });
    const total = await t.run(async (ctx) => (await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', userId)).collect()).length);
    let need = CONTRACT_COST.common;
    const items = commons.slice(0, 12).map((c) => ({ cardId: c.id, count: 0 }));
    for (const it of items) {
      it.count = Math.min(8, need);
      need -= it.count;
    }
    const used = items.filter((i) => i.count > 0);
    expect(need).toBe(0);
    const contracts = await import('./contracts');
    const { reads } = await countReads(t as never, contracts.sign, { sessionToken: ids[0].token, rarity: 'common', items: used });
    console.log(`[mesure S07] contrat (${used.length} lignes brûlées, collection de ${total} lignes) : ${reads.scanned.inventory} lignes d'inventaire lues`);
    expect(reads.scanned.inventory).toBeLessThan(total / 2);
    const after = await t.run((ctx) => ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', userId)).collect());
    expect(after.length).toBe(total); // aucune ligne en double : la carte reçue a rejoint sa ligne
    expect(after.filter((r) => r.rarity === target && r.count === 2)).toHaveLength(1);
  });
});
