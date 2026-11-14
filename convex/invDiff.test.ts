/// <reference types="vite/client" />
/**
 * (V2 fluidité) Collection PAR DIFFÉRENCE : `inventory.collectionFull` (lue une fois) + `inventory.mineSince` (suivie),
 * copie locale du client (src/core/net/invDiff.ts). La copie tenue par différence doit toujours égaler la collection
 * complète, et un booster ne doit renvoyer que ses lignes.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';
import { InvMirror } from '../src/core/net/invDiff';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 40, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob') };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const commons = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').map((c) => c.id);
/** collection « ancienne » : des lignes sans révision (écrites avant le suivi par différence) */
const legacy = (t: T, userId: Id<'users'>, n: number) =>
  t.run(async (ctx) => {
    const all = CATALOG_CARDS.filter((c) => c.baseRarity === 'common').slice(0, n);
    for (const c of all) await ctx.db.insert('inventory', { userId, cardId: c.id, rarity: 'common', count: 2, bestMintNumber: 9, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
  });
const openPack = async (t: T, token: string) => {
  const pack = await t.mutation(api.packs.preparePack, { sessionToken: token, packKind: 'theme', themeId: 'gaming' });
  await t.mutation(api.packs.revealPack, { sessionToken: token, packId: pack._id });
};
const norm = (rows: Array<{ cardId: string; rarity: string; count: number }>) => rows.map((r) => `${r.cardId}|${r.rarity}|${r.count}`).sort();

describe('collection par différence', () => {
  test('un booster ne renvoie que ses lignes ; la copie locale égale la collection complète', async () => {
    const { t, alice } = await setup();
    await legacy(t, alice.userId, 300);
    const mirror = new InvMirror();
    mirror.reset((await t.query(api.inventory.collectionFull, { sessionToken: alice.token }))!);
    const since = mirror.since();
    let fullBytes = 0, diffBytes = 0;
    for (let i = 0; i < 6; i++) {
      await openPack(t, alice.token);
      const full = await t.query(api.inventory.myCollection, { sessionToken: alice.token });
      const d = (await t.query(api.inventory.mineSince, { sessionToken: alice.token, since }))!;
      fullBytes += JSON.stringify(full).length;
      diffBytes += JSON.stringify(d).length;
      expect(d.more).toBe(false);
      expect(d.rows.length).toBeLessThanOrEqual(5 * (i + 1));
      mirror.apply(d);
      expect(norm(mirror.cards)).toEqual(norm(full));
    }
    // mesure (chantier fluidité) : octets renvoyés au client pour 6 boosters, collection de ~300 cartes
    console.log(`[invDiff] 6 boosters : complet ${fullBytes} o · différence ${diffBytes} o (${((100 * diffBytes) / fullBytes).toFixed(1)} %)`);
    expect(diffBytes).toBeLessThan(fullBytes / 5);
  });

  test('dernier exemplaire donné (échange) : la ligne disparaît aussi de la copie', async () => {
    const { t, alice, bob } = await setup();
    const [A, B] = commons;
    await t.run(async (ctx) => {
      await ctx.db.insert('inventory', { userId: alice.userId, cardId: A, rarity: 'common', count: 1, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
      await ctx.db.insert('inventory', { userId: bob.userId, cardId: B, rarity: 'common', count: 1, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
    });
    const ma = new InvMirror(), mb = new InvMirror();
    ma.reset((await t.query(api.inventory.collectionFull, { sessionToken: alice.token }))!);
    mb.reset((await t.query(api.inventory.collectionFull, { sessionToken: bob.token }))!);
    const id = await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: A, rarity: 'common', count: 1 }], requested: [{ cardId: B, rarity: 'common', count: 1 }] });
    await t.mutation(api.trades.respond, { sessionToken: bob.token, tradeId: id, accept: true });
    for (const [m, tok] of [[ma, alice.token], [mb, bob.token]] as const) {
      const d = (await t.query(api.inventory.mineSince, { sessionToken: tok, since: m.since() }))!;
      expect(d.gone.length).toBe(1);
      expect(m.apply(d)).toBe(true);
      expect(norm(m.cards)).toEqual(norm(await t.query(api.inventory.myCollection, { sessionToken: tok })));
    }
    expect(ma.cards.map((c) => c.cardId)).toEqual([B]);
    expect(mb.cards.map((c) => c.cardId)).toEqual([A]);
  });

  test('réponse reçue deux fois, ou ancienne après une plus récente : sans effet', () => {
    const m = new InvMirror();
    m.reset([{ cardId: 'x', rarity: 'common', count: 1, bestMintNumber: 1, firstPulledAt: 0, rev: 100 }]);
    const before = m.cards;
    expect(m.apply({ rows: [{ cardId: 'x', rarity: 'common', count: 1, bestMintNumber: 1, firstPulledAt: 0, rev: 100 }], gone: [] })).toBe(false);
    expect(m.cards).toBe(before); // même tableau : les vues ne se redessinent pas
    expect(m.apply({ rows: [{ cardId: 'x', rarity: 'common', count: 3, bestMintNumber: 1, firstPulledAt: 0, rev: 300 }], gone: [] })).toBe(true);
    expect(m.apply({ rows: [{ cardId: 'x', rarity: 'common', count: 2, bestMintNumber: 1, firstPulledAt: 0, rev: 200 }], gone: [] })).toBe(false);
    expect(m.cards[0].count).toBe(3);
    // supprimée puis recréée : la recréation (plus récente) gagne, dans n'importe quel ordre d'arrivée
    expect(m.apply({ rows: [{ cardId: 'x', rarity: 'common', count: 1, bestMintNumber: 1, firstPulledAt: 0, rev: 500 }], gone: [{ cardId: 'x', rarity: 'common', rev: 400 }] })).toBe(true);
    expect(m.cards.map((c) => c.count)).toEqual([1]);
    expect(m.apply({ rows: [], gone: [{ cardId: 'x', rarity: 'common', rev: 600 }] })).toBe(true);
    expect(m.cards).toEqual([]);
  });
  // (audit 12/11, S15 / A6-07) copie gardée sur l'appareil : reprise par dump() → reset(), puis suivie depuis since()
  test('une copie reprise de l\'appareil rattrape écritures et suppressions faites entre-temps', () => {
    const row = (cardId: string, count: number, rev: number) => ({ cardId, rarity: 'common', count, bestMintNumber: 1, firstPulledAt: 0, rev });
    const a = new InvMirror();
    a.reset([row('x', 1, 100), row('y', 2, 200), row('z', 1, 300)]);
    // dernière chose vue avant la fermeture : une suppression, plus récente que toutes les lignes
    a.apply({ rows: [], gone: [{ cardId: 'z', rarity: 'common', rev: 400 }] });
    const b = new InvMirror();
    b.reset(JSON.parse(JSON.stringify(a.dump())));
    expect(b.cards).toEqual(a.cards);
    expect(b.since()).toBeLessThanOrEqual(a.since());
    // pendant l'absence : y supprimée, x passée à 3, w gagnée ; le serveur renvoie tout ce qui suit since()
    const d = { rows: [row('x', 3, 500), row('w', 1, 520)], gone: [{ cardId: 'z', rarity: 'common', rev: 400 }, { cardId: 'y', rarity: 'common', rev: 510 }] };
    expect(b.apply(d)).toBe(true);
    expect(Object.fromEntries(b.cards.map((c) => [c.cardId, c.count]))).toEqual({ x: 3, w: 1 });
  });
});
