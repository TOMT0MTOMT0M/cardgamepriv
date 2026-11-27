/// <reference types="vite/client" />
/**
 * (V3, C bis) ALERTE ACHETEUR : une carte mise en vente À LA MAIN au Marché prévient les joueurs qui la veulent (carte,
 * album ou famille, sans l'avoir) — 1 alerte par vendeur et par heure au plus pour un même joueur — et la pastille du
 * Marché (`market:alerts`) ne lit que les lignes du joueur. Mesure du coût de la recherche « qui veut cette carte ».
 *   npx vitest run convex/alerteAcheteur.test.ts
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';
import { countReads } from './reads.testlib';
import * as market from './market';
import type { RarityId } from '../src/core/rarity';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const KANTO = CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto');
const A = KANTO.find((c) => c.baseRarity === 'common')!.id;
const B = KANTO.find((c) => c.baseRarity === 'rare')!.id;
const ALBUM = 's:pkm-kanto';

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert('appConfig', { key: 'wishesReady' }));
  const mk = async (name: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), coins: 0 });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      await ctx.db.insert('pushSubs', { userId, endpoint: `https://push.test/${name}`, keys: { p256dh: 'k', auth: 'a' }, createdAt: Date.now() });
      return { userId, token };
    });
  const u = { alice: await mk('alice'), bob: await mk('bob'), carol: await mk('carol'), dave: await mk('dave') };
  return { t, u };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const give = (t: T, userId: Id<'users'>, cardId: string, rarity: RarityId, count: number) =>
  t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity, count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
const sends = async (t: T) =>
  (await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect()))
    .filter((j) => j.name.includes('pushSend'))
    .map((j) => j.args[0] as { subs: Array<{ endpoint: string }>; payload: { title: string; body: string; url: string } });
const to = (s: Awaited<ReturnType<typeof sends>>, who: string) => s.filter((x) => x.subs[0].endpoint.endsWith(who));

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  vi.useRealTimers();
});

describe('alerte acheteur (C bis)', () => {
  test('vente à la main : les intéressés prévenus au prix affiché ; 1 alerte par vendeur et par heure ; pastille', async () => {
    vi.useFakeTimers();
    process.env.VAPID_PUBLIC_KEY = 'test';
    const { t, u } = await setup();
    await give(t, u.alice.userId, A, 'common', 3);
    await give(t, u.alice.userId, B, 'rare', 1);
    await t.mutation(api.users.toggleWish, { sessionToken: u.bob.token, cardId: A }); // envie directe
    await t.mutation(api.users.toggleWishFam, { sessionToken: u.carol.token, key: ALBUM }); // l'album
    await t.mutation(api.users.toggleWish, { sessionToken: u.dave.token, cardId: A }); // la veut… mais l'a déjà
    await give(t, u.dave.userId, A, 'common', 1);

    expect(await t.mutation(api.market.sell, { sessionToken: u.alice.token, cardId: A, rarity: 'common', price: 12 })).toEqual({ notified: 2 });
    let s = await sends(t);
    expect(to(s, 'bob')).toHaveLength(1);
    expect(to(s, 'carol')).toHaveLength(1);
    expect(to(s, 'dave')).toHaveLength(0);
    expect(to(s, 'bob')[0].payload).toMatchObject({ title: 'alice vend une carte que tu veux', url: '#/echanges/chercher' });
    expect(to(s, 'bob')[0].payload.body).toMatch(/\(12 pièces\)/);

    // pastille : mes lignes seulement
    const al = await t.query(api.market.alerts, { sessionToken: u.carol.token });
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ cardId: A, sellerId: u.alice.userId });
    expect(await t.query(api.market.alerts, { sessionToken: u.dave.token })).toEqual([]);
    expect(await t.query(api.market.alerts, {})).toEqual([]);

    // 2e vente dans l'heure : personne n'est re-prévenu
    expect(await t.mutation(api.market.sell, { sessionToken: u.alice.token, cardId: B, rarity: 'rare', price: 70 })).toEqual({ notified: 0 });
    s = await sends(t);
    expect(to(s, 'carol')).toHaveLength(1);

    // une heure plus tard : de nouveau
    vi.setSystemTime(Date.now() + market.WISH_ALERT_GAP + 1000);
    expect(await t.mutation(api.market.sell, { sessionToken: u.alice.token, cardId: A, rarity: 'common', price: 9 })).toEqual({ notified: 2 });
    expect((await t.query(api.market.alerts, { sessionToken: u.bob.token }))).toHaveLength(1); // une ligne par vendeur, réécrite
  });

  test('coût : « qui veut cette carte » à la mise en vente, et la requête de la pastille', async () => {
    const { t, u } = await setup();
    await give(t, u.alice.userId, A, 'common', 2);
    await t.mutation(api.users.toggleWish, { sessionToken: u.bob.token, cardId: A });
    await t.mutation(api.users.toggleWishFam, { sessionToken: u.carol.token, key: ALBUM });
    // la recherche seule (requête ponctuelle `wanted`, mêmes lectures que l'alerte)
    const w = await countReads(t as never, market.wanted, { sessionToken: u.alice.token, cards: [{ cardId: A, rarity: 'common' }] });
    console.log(`[mesure coût] market:wanted, 1 carte, 2 intéressés : ${w.reads.docs} documents, ${w.reads.bytes} octets (${JSON.stringify(w.reads.scanned)})`);
    expect(w.reads.docs).toBeLessThan(20);
    const p = await countReads(t as never, market.alerts, { sessionToken: u.bob.token });
    console.log(`[mesure coût] market:alerts (pastille) : ${p.reads.docs} documents, ${p.reads.bytes} octets ; document joueur lu : ${p.reads.gets.includes(u.bob.userId)}`);
    expect(p.reads.gets).not.toContain(u.bob.userId);
  });
});
