/// <reference types="vite/client" />
/**
 * (25/11, V3) Roulette : la MISE GRATUITE DU JOUR des abonnés (convex/games.ts placeBet `free`, src/core/games.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
const none = { coins: 0, cards: [] };

async function setup() {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const [name, sub] of [['alice', true], ['bob', false]] as const)
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 0, ...(sub ? { subUntil: Date.now() + 86_400_000 } : {}) });
      await ctx.db.insert('sessions', { token: `tok-${name}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token: `tok-${name}` };
    });
  return { t, u };
}

describe('mise gratuite du jour', () => {
  test('abonné : un numéro offert, une fois par jour, sans couleur ; il peut gagner le pot ; les autres paient', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [3], stake: none, free: true })).rejects.toThrow(/⟦(games\.54)[⟧{]/);
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: none, free: true, color: 'red' })).rejects.toThrow(/⟦(games\.56)[⟧{]/);
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [5], stake: none, free: true });
    let r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.bets[0]).toMatchObject({ numbers: [5], coins: 0, free: true });
    await t.mutation(internal.games.forceDraw, { number: 5 });
    r = (await t.query(api.games.roulette, {}))!;
    expect(r.past[0].result).toMatchObject({ number: 5, winnerName: 'alice' });
    // même jour, nouveau tirage : la mise gratuite est déjà prise
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [6], stake: none, free: true })).rejects.toThrow(/⟦(games\.55)[⟧{]/);
  });
});
