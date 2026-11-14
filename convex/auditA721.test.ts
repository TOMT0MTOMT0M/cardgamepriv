/// <reference types="vite/client" />
/** Audit perf 12/11, A7-21 : la contrepartie d'un échange en un toucher ne lit que les cartes de l'étoile demandée. */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as deals from './deals';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const of = (r: string) => CATALOG_CARDS.filter((c) => c.baseRarity === r && c.themeId !== 'bebous').map((c) => c.id);

describe('A7-21 — échange en un toucher', () => {
  test('300 cartes rares et 3 communes : la demande d\'une commune ne lit pas les rares', async () => {
    const t = convexTest(schema, modules);
    const mk = (name: string) =>
      t.run(async (ctx) => {
        const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
        await ctx.db.insert('sessions', { token: `tok-${name}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
        return userId;
      });
    const [alice, bob] = [await mk('alice'), await mk('bob')];
    const row = (userId: Id<'users'>, cardId: string, rarity: 'common' | 'rare', count: number) =>
      t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity, count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));
    const [A, B, C] = of('common');
    for (const id of of('rare').slice(0, 300)) await row(alice, id, 'rare', 2);
    await row(alice, B, 'common', 3);
    await row(alice, C, 'common', 2);
    await row(bob, A, 'common', 2);
    const r = await countReads(t as never, deals.quick, { sessionToken: 'tok-alice', toUserId: bob, get: { cardId: A, rarity: 'common' } });
    console.log(`[mesure A7-21] deals.quick, 302 lignes chez le demandeur : ${r.reads.scanned.inventory} lignes d'inventaire lues (avant : 302 et plus)`);
    expect((r.result as { give: { cardId: string } }).give.cardId).toMatch(/./);
    expect(r.reads.scanned.inventory).toBeLessThan(20);
  });
});
