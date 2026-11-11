/// <reference types="vite/client" />
/**
 * (11/11, chantier ouvertures-saisons) Animation d'ouverture à débloquer (convex/profiles.ts, `setOpening`).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { discordId: 'alice', username: 'alice', displayName: 'alice', packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() }));
  await t.run((ctx) => ctx.db.insert('sessions', { token: 'tok-alice', userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 }));
  return { t, alice: { userId, token: 'tok-alice' } };
}

describe('animation d’ouverture à débloquer', () => {
  test('déchirure par défaut, verrouillée refusée, débloquée gardée (et conservée par setCosmetics)', async () => {
    const { t, alice } = await setup();
    const me = () => t.query(api.users.me, { sessionToken: alice.token });
    expect((await me())?.openingStyle).toBeUndefined();
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'burn' })).rejects.toThrow(/débloquée/);
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'nope' })).rejects.toThrow(/inconnue/);
    // « Braise » : 250 doublons brûlés à la forge
    await t.run((ctx) => ctx.db.patch(alice.userId, { econ: { earned: 0, burned: 250, gamesPlayed: 0, gamesWon: 0, rouletteWins: 0, completions: [], achievements: [] } }));
    expect(await t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'burn' })).toEqual({ style: 'burn' });
    expect((await me())?.openingStyle).toBe('burn');
    // l'éventail (150 cartes World) reste verrouillé
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'fan' })).rejects.toThrow(/débloquée/);
    // enregistrer le profil ne fait pas perdre l'animation choisie
    await t.mutation(api.profiles.setCosmetics, { sessionToken: alice.token, title: 'rookie' });
    expect((await me())?.openingStyle).toBe('burn');
    // retour à la déchirure : le champ disparaît
    await t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'tear' });
    expect((await me())?.openingStyle).toBeUndefined();
    const doc = await t.run(async (ctx) => (await ctx.db.get(alice.userId))!);
    expect(doc.cosmetics?.title).toBe('rookie');
  });
});
