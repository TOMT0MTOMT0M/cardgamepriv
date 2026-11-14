/// <reference types="vite/client" />
/**
 * (v2.1) ENVIES PAR FAMILLE : « Je veux l'album » = une seule ligne (users.wishFams + index `wishes`), qui vaut pour
 * toutes les cartes de l'album que le joueur n'a pas.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { THEMES, subthemeById } from '../src/core/sets/themes';
import { FAM_ROW, WISH_FAMS_MAX, famCards, famKeysOfCard, wantsCard } from '../src/core/wishFams';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
// un album avec au moins 3 communes
const COMMONS = THEMES.flatMap((t) => t.cards).filter((c) => c.rarity === 'common');
const bySub = new Map<string, typeof COMMONS>();
for (const c of COMMONS) bySub.set(c.subthemeId, [...(bySub.get(c.subthemeId) ?? []), c]);
const [SUB, CARDS] = [...bySub.entries()].find(([id, l]) => l.length >= 3 && subthemeById(id)?.themeId !== 'bebous')!;
const KEY = `s:${SUB}`;
const [A, B] = CARDS;

async function setup() {
  const t = convexTest(schema, modules);
  const ids: Array<{ userId: Id<'users'>; token: string }> = [];
  for (let i = 0; i < 3; i++)
    ids.push(
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert('users', { discordId: `d${i}`, username: `j${i}`, displayName: `J${i}`, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
        await ctx.db.insert('sessions', { token: `tok-${i}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
        return { userId, token: `tok-${i}` };
      }),
    );
  const give = (userId: Id<'users'>, cardId: string, count: number) =>
    t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 }));
  await give(ids[1].userId, A.id, 3); // J1 a A en triple
  await give(ids[0].userId, B.id, 1); // J0 a déjà B
  await t.mutation(internal.migrations.backfillWishes, {});
  return { t, ids };
}
const famRows = (t: Awaited<ReturnType<typeof setup>>['t']) =>
  t.run(async (ctx) => (await ctx.db.query('wishes').withIndex('by_card', (q) => q.eq('cardId', FAM_ROW + KEY)).collect()).map((w) => w.userId));

describe('envies par famille', () => {
  test('règles pures : cartes d’une famille, appartenance, envie', () => {
    expect(famCards(KEY).some((c) => c.id === A.id)).toBe(true);
    expect(famKeysOfCard(A.id)).toContain(KEY);
    expect(wantsCard([], [KEY], A.id)).toBe(true);
    expect(wantsCard([], [], A.id)).toBe(false);
    expect(famCards('s:nexistepas')).toEqual([]);
  });

  test('une seule ligne ; « qui la veut » écarte ceux qui ont déjà la carte ; « Pour toi » la propose', async () => {
    const { t, ids } = await setup();
    expect(await t.mutation(api.users.toggleWishFam, { sessionToken: ids[0].token, key: KEY })).toEqual([KEY]);
    expect(await famRows(t)).toEqual([ids[0].userId]);
    // A : J0 la veut (famille) et ne l'a pas
    expect((await t.query(api.deals.cardPanel, { sessionToken: ids[1].token, cardId: A.id })).wanters.map((w) => w.userId)).toEqual([ids[0].userId]);
    // B : J0 l'a déjà → pas dans « qui la veut »
    expect((await t.query(api.deals.cardPanel, { sessionToken: ids[1].token, cardId: B.id })).wanters).toEqual([]);
    // « Pour toi » de J1 : J0 cherche mon doublon A
    const fy = await t.query(api.deals.forYou, { sessionToken: ids[1].token, give: [{ cardId: A.id, rarity: 'common', count: 3 }] });
    expect(fy.theyWant.map((w) => `${w.userId}|${w.card.cardId}`)).toEqual([`${ids[0].userId}|${A.id}`]);
    // la migration des envies (rejouée à chaque mise en ligne) garde la ligne de famille
    await t.mutation(internal.migrations.backfillWishes, {});
    expect(await famRows(t)).toEqual([ids[0].userId]);
    // retirée : plus de ligne
    expect(await t.mutation(api.users.toggleWishFam, { sessionToken: ids[0].token, key: KEY })).toEqual([]);
    expect(await famRows(t)).toEqual([]);
  });

  test('clé inconnue refusée, plafond de familles', async () => {
    const { t, ids } = await setup();
    await expect(t.mutation(api.users.toggleWishFam, { sessionToken: ids[0].token, key: 's:nexistepas' })).rejects.toThrow();
    const keys = [...bySub.keys()].filter((id) => subthemeById(id)?.themeId !== 'bebous').slice(0, WISH_FAMS_MAX + 1).map((id) => `s:${id}`);
    for (const k of keys.slice(0, WISH_FAMS_MAX)) await t.mutation(api.users.toggleWishFam, { sessionToken: ids[0].token, key: k });
    await expect(t.mutation(api.users.toggleWishFam, { sessionToken: ids[0].token, key: keys[WISH_FAMS_MAX] })).rejects.toThrow();
  });
});
