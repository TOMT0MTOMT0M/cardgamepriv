/// <reference types="vite/client" />
/**
 * (v2.1.41, idée de Hugo) « Forge → vente » : qui veut les cartes que je forge (requête groupée, bornée), mise en vente
 * au prix conseillé, UNE notification par joueur intéressé pour tout le lot.
 *   npx vitest run convex/forgeVente.test.ts
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';
import { MARKET_MAX_OPEN, marketAdvised, quickSellPlan } from '../src/core/market';
import type { RarityId } from '../src/core/rarity';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
const KANTO = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto');
const A = KANTO.find((c) => c.baseRarity === 'common')!.id;
const B = KANTO.find((c) => c.baseRarity === 'rare')!.id;
const FILL = KANTO.filter((c) => c.baseRarity === 'common').slice(1, 12).map((c) => c.id);
const ALBUM = 's:pkm-kanto';

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert('appConfig', { key: 'wishesReady' }));
  const mk = async (name: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), coins: 0 });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  const u = { alice: await mk('alice'), bob: await mk('bob'), carol: await mk('carol'), dave: await mk('dave'), eve: await mk('eve') };
  return { t, u };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const give = (t: T, userId: Id<'users'>, cardId: string, rarity: RarityId, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity, count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const jobs = (t: T) => t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect());
const sends = async (t: T) => (await jobs(t)).filter((j) => j.name.includes('pushSend')).map((j) => j.args[0] as { subs: Array<{ endpoint: string }>; payload: { title: string; body: string; kind: string; url: string } });

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
});

describe('Forge → vente', () => {
  test('prix conseillé = 1,5× la valeur de Forge, arrondi ; plan : les plus chères d’abord, places libres seulement', () => {
    expect((['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as RarityId[]).map(marketAdvised)).toEqual([8, 23, 60, 150, 450, 1500]);
    const items = [
      { cardId: 'a', rarity: 'common' as RarityId, count: 3 },
      { cardId: 'b', rarity: 'legendary' as RarityId, count: 1 },
      { cardId: 'c', rarity: 'rare' as RarityId, count: 2 },
    ];
    const wanted = new Map([['a', ['x', 'y']], ['b', ['x']], ['c', ['z']]]);
    const p = quickSellPlan(items, wanted, 3);
    expect(p.wantedN).toBe(4); // a ×2 (deux joueurs), b ×1, c ×1 (un seul joueur)
    expect(p.sell).toEqual([{ cardId: 'b', rarity: 'legendary', count: 1 }, { cardId: 'c', rarity: 'rare', count: 1 }, { cardId: 'a', rarity: 'common', count: 1 }]);
    expect(p.rest).toEqual([{ cardId: 'a', rarity: 'common', count: 2 }, { cardId: 'c', rarity: 'rare', count: 1 }]);
    expect(p.players).toBe(3);
    expect(p.coins).toBe(450 + 60 + 8);
    expect(quickSellPlan(items, new Map(), 10).sell).toEqual([]);
  });

  test('requête groupée : envies de carte et d’album, moi exclu, ceux qui l’ont et les bannis écartés ; rien si 10 ventes', async () => {
    const { t, u } = await setup();
    await give(t, u.alice.userId, A, 'common', 3);
    await give(t, u.alice.userId, B, 'rare', 2);
    await t.mutation(api.users.toggleWish, { sessionToken: u.bob.token, cardId: A }); // envie directe de A
    await t.mutation(api.users.toggleWishFam, { sessionToken: u.carol.token, key: ALBUM }); // l'album : A et B lui manquent
    await t.mutation(api.users.toggleWishFam, { sessionToken: u.dave.token, key: ALBUM }); // l'album, mais il a déjà A et B
    await give(t, u.dave.userId, A, 'common', 1);
    await give(t, u.dave.userId, B, 'rare', 1);
    await t.mutation(api.users.toggleWishFam, { sessionToken: u.alice.token, key: ALBUM }); // moi : jamais compté
    await t.mutation(api.users.toggleWish, { sessionToken: u.eve.token, cardId: A });
    await t.run((ctx) => ctx.db.insert('presence', { userId: u.eve.userId, lastSeenAt: 0, displayName: 'eve', username: 'eve', totalPacksOpened: 0, bannedAt: 1 }));
    const w = await t.query(api.market.wanted, { sessionToken: u.alice.token, cards: [{ cardId: B, rarity: 'rare' }, { cardId: A, rarity: 'common' }] });
    expect(w.open).toBe(0);
    const by = new Map(w.cards.map((c) => [c.cardId, [...c.ids].sort()]));
    expect(by.get(A)).toEqual([u.bob.userId, u.carol.userId].sort());
    expect(by.get(B)).toEqual([u.carol.userId]);
    // sans session : rien
    expect(await t.query(api.market.wanted, { cards: [{ cardId: A, rarity: 'common' }] })).toEqual({ open: 0, cards: [] });
  });

  test('vente rapide : au prix conseillé, le reste dans la collection, UNE notification par joueur pour le lot ; 10 ventes au plus', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test';
    const { t, u } = await setup();
    await give(t, u.alice.userId, A, 'common', 3);
    await give(t, u.alice.userId, B, 'rare', 2);
    await t.mutation(api.users.toggleWish, { sessionToken: u.bob.token, cardId: A });
    await t.mutation(api.users.toggleWishFam, { sessionToken: u.carol.token, key: ALBUM });
    for (const who of ['bob', 'carol'] as const)
      await t.run((ctx) => ctx.db.insert('pushSubs', { userId: u[who].userId, endpoint: `https://push.test/${who}`, keys: { p256dh: 'k', auth: 'a' }, createdAt: Date.now() }));

    const r = await t.mutation(api.market.quickSell, { sessionToken: u.alice.token, items: [{ cardId: A, rarity: 'common', count: 2 }, { cardId: B, rarity: 'rare', count: 1 }] });
    expect(r).toEqual({ listed: 3, notified: 2 });
    const open = (await t.query(api.market.board, {})).open;
    expect(open.map((m) => `${m.cardId === A ? 'A' : 'B'}:${m.price}`).sort()).toEqual(['A:8', 'A:8', 'B:60']);
    const mine = await t.query(api.inventory.myCollection, { sessionToken: u.alice.token });
    expect(mine.find((c) => c.cardId === A)?.count).toBe(1);
    expect(mine.find((c) => c.cardId === B)?.count).toBe(1);

    const s = await sends(t);
    expect(s).toHaveLength(2); // une seule par joueur, même pour plusieurs cartes
    const toCarol = s.find((x) => x.subs[0].endpoint.endsWith('carol'))!;
    const toBob = s.find((x) => x.subs[0].endpoint.endsWith('bob'))!;
    expect(toCarol.payload).toMatchObject({ kind: 'trade', title: 'alice vend 2 cartes que tu veux', url: '#/echanges/chercher' });
    expect(toBob.payload.title).toBe('alice vend une carte que tu veux');
    expect(toBob.payload.body).toMatch(/\(8 pièces\)/);

    // 10 ventes ouvertes au plus : tout ou rien
    for (const id of FILL) await give(t, u.alice.userId, id, 'common', 2);
    await expect(t.mutation(api.market.quickSell, { sessionToken: u.alice.token, items: FILL.slice(0, 8).map((cardId) => ({ cardId, rarity: 'common' as const, count: 1 })) })).rejects.toThrow(/⟦(market\.2)[⟧{]/);
    expect((await t.query(api.market.board, {})).open).toHaveLength(3);
    await t.mutation(api.market.quickSell, { sessionToken: u.alice.token, items: FILL.slice(0, MARKET_MAX_OPEN - 3).map((cardId) => ({ cardId, rarity: 'common' as const, count: 1 })) });
    expect(await t.query(api.market.wanted, { sessionToken: u.alice.token, cards: [{ cardId: B, rarity: 'rare' }] })).toEqual({ open: MARKET_MAX_OPEN, cards: [] });
  });
});
