/// <reference types="vite/client" />
/** Audit perf 12/11, E1-08 : `session.get` rend, en une lecture du joueur, ce que rendaient trois requêtes. */
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as session from './session';
import * as users from './users';
import * as economy from './economy';
import * as missions from './missions';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

describe('E1-08 — session en une requête', () => {
  test('mêmes réponses que users.me, economy.state et missions.mine ; le document joueur lu une fois au lieu de trois', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'Alice', packBalance: 7, lastDailyClaimAt: 0, totalPacksOpened: 12, lastSeenAt: Date.now() - 3600_000, wishlist: ['x'], isModerator: true });
      await ctx.db.insert('sessions', { token: 'tok', userId: id, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return id;
    });
    const args = { sessionToken: 'tok' };
    const [me, eco, mis, all] = [await t.query(api.users.me, args), await t.query(api.economy.state, args), await t.query(api.missions.mine, args), await t.query(api.session.get, args)];
    expect(all).toEqual({ me, eco, missions: mis });
    expect(all!.me._id).toBe(userId);
    // sans jeton, ou jeton inconnu : null, comme les trois
    expect(await t.query(api.session.get, {})).toBeNull();
    expect(await t.query(api.session.get, { sessionToken: 'inconnu' })).toBeNull();
    const three = [await countReads(t as never, users.me, args), await countReads(t as never, economy.state, args), await countReads(t as never, missions.mine, args)];
    const one = await countReads(t as never, session.get, args);
    const sum = (k: 'docs' | 'bytes') => three.reduce((a, r) => a + r.reads[k], 0);
    console.log(`[mesure E1-08] par écriture sur le joueur : 3 requêtes, ${sum('docs')} documents et ${sum('bytes')} octets lus → 1 requête, ${one.reads.docs} documents et ${one.reads.bytes} octets`);
    expect(one.reads.docs).toBeLessThan(sum('docs'));
    vi.useRealTimers();
  });
});
