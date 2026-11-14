/// <reference types="vite/client" />
/** Audit perf 12/11, lot S13 : lectures ponctuelles allégées (marché, historique des échanges, classeurs). */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as market from './market';
import * as trades from './trades';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const CARDS = THEMES.flatMap((t) => t.cards).filter((c) => c.rarity === 'common').slice(0, 30);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = (n: string) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: n, username: n, displayName: n.toUpperCase(), packBalance: 1, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1, wishlist: Array.from({ length: 80 }, (_, k) => `c${k}`) });
      await ctx.db.insert('sessions', { token: `tok-${n}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return userId;
    });
  const [a, b] = [await mk('a'), await mk('b')];
  await t.run(async (ctx) => {
    for (let i = 0; i < 30; i++) {
      await ctx.db.insert('market', { sellerId: i % 2 ? a : b, cardId: CARDS[i].id, rarity: 'common', mintNumber: i + 1, price: 10 + i, status: 'open', createdAt: i });
      await ctx.db.insert('trades', { fromUserId: i % 2 ? a : b, toUserId: i % 2 ? b : a, offered: [], requested: [], status: 'accepted', createdAt: i, resolvedAt: i } as never);
    }
  });
  return { t, a, b };
}

describe('S13 — lectures ponctuelles', () => {
  test('marché : une lecture par vendeur, pas par annonce ; même réponse', async () => {
    const { t, a, b } = await setup();
    const before = await t.query(api.market.board, { sessionToken: 'tok-a' });
    await t.mutation(internal.migrations.backfillPresence, {});
    const r = await countReads(t as never, market.board, { sessionToken: 'tok-a' });
    expect(r.result).toEqual(before);
    expect(before.open).toHaveLength(30);
    expect(before.open[0].sellerName).toMatch(/^[AB]$/);
    expect(r.reads.gets.filter((id) => id === a || id === b)).toHaveLength(0); // cartes publiques, plus de document joueur
    expect(r.reads.scanned.presence).toBe(2);
    console.log(`[mesure S13] marché, 30 annonces de 2 vendeurs : ${30} lectures de documents joueur → ${r.reads.scanned.presence} cartes publiques`);
  });

  test('historique des échanges : un nom par joueur', async () => {
    const { t, a, b } = await setup();
    const r = await countReads(t as never, trades.history, { sessionToken: 'tok-a', limit: 30 });
    const rows = r.result as Array<{ fromName: string; toName: string }>;
    expect(rows).toHaveLength(30);
    expect(new Set(rows.flatMap((x) => [x.fromName, x.toName]))).toEqual(new Set(['A', 'B']));
    console.log(`[mesure S13] historique, 30 échanges : ${r.reads.gets.filter((id) => id === a || id === b).length} lectures de documents joueur (avant : 61)`);
    expect(r.reads.gets.filter((id) => id === a || id === b).length).toBeLessThanOrEqual(2);
  });

  test('classeur créé : doublons retirés', async () => {
    const { t, a } = await setup();
    await t.run((ctx) => ctx.db.insert('inventory', { userId: a, cardId: CARDS[0].id, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 }));
    const id = await t.mutation(api.binders.create, { sessionToken: 'tok-a', name: 'Mes cartes', cards: [{ cardId: CARDS[0].id, rarity: 'common' }, { cardId: CARDS[0].id, rarity: 'common' }] });
    expect((await t.run((ctx) => ctx.db.get(id)))!.cards).toHaveLength(1);
  });
});
