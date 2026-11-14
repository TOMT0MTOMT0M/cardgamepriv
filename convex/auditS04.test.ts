/// <reference types="vite/client" />
/**
 * Audit perf 12/11, lot S04 : les requêtes abonnées qui n'ont besoin que de l'id du joueur ne lisent plus son
 * document (elles ne repartent donc plus à chacune de ses écritures). Réponses inchangées.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { countReads } from './reads.testlib';
import * as friends from './friends';
import * as chat from './chat';
import * as listings from './listings';
import * as games from './games';
import * as challenges from './challenges';
import * as presse from './presse';
import * as market from './market';
import { CHAT_GENERAL } from '../src/core/chat';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = (name: string, extra: Record<string, unknown> = {}) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: `${name}_d`, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: Date.now(), packRegenAt: Date.now(), ...extra });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice', { isAdmin: true }), bob: await mk('bob') };
}

describe('S04 — requêtes en identifiant seul', () => {
  test('aucune de ces requêtes ne lit le document du joueur qui la suit', async () => {
    const { t, alice } = await setup();
    const a = { sessionToken: alice.token };
    const cases: Array<[string, unknown, Record<string, unknown>]> = [
      ['friends.mine', friends.mine, a],
      ['chat.inbox (lean)', chat.inbox, { ...a, lean: true }],
      ['chat.tail', chat.tail, { ...a, conv: CHAT_GENERAL, after: 0 }],
      ['listings.mine', listings.mine, a],
      ['listings.open', listings.open, a],
      ['games.lobby', games.lobby, a],
      ['games.history', games.history, a],
      ['games.roulette', games.roulette, a],
      ['challenges.mine', challenges.mine, a],
      ['presse.current', presse.current, a],
      ['market.board', market.board, a],
    ];
    const reading: string[] = [];
    for (const [name, fn, args] of cases) {
      const { reads } = await countReads(t, fn, args);
      if (reads.gets.includes(alice.userId)) reading.push(name);
    }
    expect(reading).toEqual([]);
  });

  test('chat.inbox : même réponse avec ou sans `lean`, sauf `staff` (lu dans users.me par le client V2)', async () => {
    const { t, alice } = await setup();
    const full = await t.query(api.chat.inbox, { sessionToken: alice.token });
    const lean = await t.query(api.chat.inbox, { sessionToken: alice.token, lean: true });
    expect(full!.staff).toBe(true);
    expect(lean).toEqual({ ...full, staff: false });
    expect((await countReads(t, chat.inbox, { sessionToken: alice.token })).reads.gets).toContain(alice.userId);
  });

  test('listings.mine : le nom du joueur est toujours rendu quand il a une annonce', async () => {
    const { t, alice } = await setup();
    expect(await t.query(api.listings.mine, { sessionToken: alice.token })).toEqual({ listings: [], offers: [] });
    await t.run(async (ctx) => {
      await ctx.db.insert('listings', { userId: alice.userId as Id<'users'>, items: [], status: 'open', createdAt: Date.now(), expiresAt: Date.now() + 3600000 });
    });
    const mine = await t.query(api.listings.mine, { sessionToken: alice.token });
    expect(mine.listings).toHaveLength(1);
    expect(mine.listings[0].userName).toBe('alice');
  });

  test('users.me : `nextDailyClaimAt` stable quand la réserve est pleine', async () => {
    const { t, alice } = await setup();
    const a = await t.query(api.users.me, { sessionToken: alice.token });
    await new Promise((r) => setTimeout(r, 5));
    const b = await t.query(api.users.me, { sessionToken: alice.token });
    expect(b!.nextDailyClaimAt).toBe(a!.nextDailyClaimAt);
  });
});
