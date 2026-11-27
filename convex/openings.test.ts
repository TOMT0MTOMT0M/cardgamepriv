/// <reference types="vite/client" />
/**
 * (11/11, chantier ouvertures-saisons) Animation d'ouverture à débloquer (convex/profiles.ts, `setOpening`).
 * (27/11, V3) Brûlure et Éventail retirés : refusés comme inconnus ; un choix resté rangé n'est pas migré (le client
 * le joue comme la déchirure).
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
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'nope' })).rejects.toThrow(/inconnue/);
    // « Retroussé » : 750 boosters ouverts (verrouillé tant qu'on n'y est pas)
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'retrousse' })).rejects.toThrow(/⟦(profiles\.6)[⟧{]/);
    await t.run((ctx) => ctx.db.patch(alice.userId, { totalPacksOpened: 750 }));
    expect(await t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'retrousse' })).toEqual({ style: 'retrousse' });
    expect((await me())?.openingStyle).toBe('retrousse');
    // enregistrer le profil ne fait pas perdre l'animation choisie
    await t.mutation(api.profiles.setCosmetics, { sessionToken: alice.token, title: 'rookie' });
    expect((await me())?.openingStyle).toBe('retrousse');
    // retour à la déchirure : le champ disparaît
    await t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'tear' });
    expect((await me())?.openingStyle).toBeUndefined();
    const doc = await t.run(async (ctx) => (await ctx.db.get(alice.userId))!);
    expect(doc.cosmetics?.title).toBe('rookie');
  });

  test('Brûlure et Éventail retirés : refusés même avec leur succès, un ancien choix rangé reste lisible', async () => {
    const { t, alice } = await setup();
    const me = () => t.query(api.users.me, { sessionToken: alice.token });
    // leurs succès (« Braise » : 250 doublons brûlés ; « Cartographe » : 150 cartes World) ne débloquent plus ces deux-là
    await t.run((ctx) => ctx.db.patch(alice.userId, { econ: { earned: 0, burned: 250, gamesPlayed: 0, gamesWon: 0, rouletteWins: 0, completions: [], achievements: [] } }));
    for (const style of ['burn', 'fan']) await expect(t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style })).rejects.toThrow(/inconnue/);
    // un joueur qui avait choisi la Brûlure avant le retrait : rien n'est migré, le client retombe sur la déchirure
    await t.run(async (ctx) => ctx.db.patch(alice.userId, { cosmetics: { ...((await ctx.db.get(alice.userId))!.cosmetics ?? {}), opening: 'burn' } }));
    expect((await me())?.openingStyle).toBe('burn');
    // il peut en choisir une autre (la déchirure efface le champ)
    await t.mutation(api.profiles.setOpening, { sessionToken: alice.token, style: 'tear' });
    expect((await me())?.openingStyle).toBeUndefined();
  });
});
