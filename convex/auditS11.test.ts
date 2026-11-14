/// <reference types="vite/client" />
/**
 * Audit perf 12/11, lot S11 / E1-07 : `push.subscribe` répété (chaque chargement de l'appli) n'écrit plus rien quand
 * le rappel « réserve pleine » attend déjà au bon moment.
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
afterEach(() => vi.unstubAllEnvs());

describe('S11 — push.subscribe sans écriture inutile', () => {
  test('deuxième appel identique : document joueur intact, même job ; réserve qui bouge : reprogrammé', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'test');
    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'A', packBalance: 3, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: now, packRegenAt: now });
      await ctx.db.insert('sessions', { token: 'tok', userId: id, createdAt: now, expiresAt: now + 86400000 });
      return id;
    });
    const sub = { sessionToken: 'tok', endpoint: 'https://push.example/1', keys: { p256dh: 'k', auth: 'a' } };
    const doc = () => t.run((ctx) => ctx.db.get(userId));
    await t.mutation(api.push.subscribe, sub);
    const first = await doc();
    expect(first!.notifFullJob).toBeDefined();
    expect(first!.notifFullKey).toMatch(/^\d+:3:\d+$/);
    await t.mutation(api.push.subscribe, sub);
    await t.mutation(api.push.subscribe, sub);
    expect(await doc()).toEqual(first); // aucune écriture : ni le joueur ni ses amis ne voient leurs requêtes repartir
    // la réserve change : un nouveau rappel remplace l'ancien
    await t.run((ctx) => ctx.db.patch(userId, { packBalance: 5 }));
    await t.mutation(api.push.subscribe, sub);
    const third = await doc();
    expect(third!.notifFullJob).not.toEqual(first!.notifFullJob);
    expect(third!.notifFullKey).toMatch(/:5:/);
    // rappels coupés dans les réglages : job annulé, clé effacée
    await t.run((ctx) => ctx.db.patch(userId, { notifPrefs: ['trade'] }));
    await t.mutation(api.push.subscribe, sub);
    expect((await doc())!.notifFullJob).toBeUndefined();
    expect((await doc())!.notifFullKey).toBeUndefined();
  });
});
