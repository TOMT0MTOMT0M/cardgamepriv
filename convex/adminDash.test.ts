/// <reference types="vite/client" />
/** Dashboard admin (V2, 10/11) : réservé à l'équipe, actions journalisées, cartes à corriger. */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, extra: Record<string, unknown> = {}) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: Date.now(), ...extra });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), tom: await mk('tom', { isModerator: true, isAdmin: true }), hugo: await mk('hugo', { isModerator: true }) };
}
const card = CATALOG_CARDS.find((c) => c.baseRarity === 'rare')!;

describe('dashboard admin', () => {
  test('un joueur normal ne voit rien et ne peut rien faire', async () => {
    const { t, alice } = await setup();
    expect(await t.query(api.adminDash.whoami, { sessionToken: alice.token })).toMatchObject({ ok: false, reason: 'staff' });
    expect(await t.query(api.adminDash.whoami, { sessionToken: 'faux' })).toMatchObject({ ok: false, reason: 'login' });
    await expect(t.query(api.adminDash.overview, { sessionToken: alice.token })).rejects.toThrow(/équipe/);
    await expect(t.query(api.adminDash.players, { sessionToken: alice.token })).rejects.toThrow(/équipe/);
    await expect(t.mutation(api.adminDash.givePacks, { sessionToken: alice.token, id: alice.userId, n: 50 })).rejects.toThrow(/équipe/);
  });

  test('Hugo (modérateur) a les mêmes accès que Tom', async () => {
    const { t, hugo } = await setup();
    expect(await t.query(api.adminDash.whoami, { sessionToken: hugo.token })).toMatchObject({ ok: true, name: 'hugo' });
    const o = await t.query(api.adminDash.overview, { sessionToken: hugo.token });
    expect(o.players).toBe(3);
    expect(o.packsOpened).toBe(9);
  });

  test('boosters, pièces, carte : donnés et journalisés', async () => {
    const { t, tom, alice } = await setup();
    await t.mutation(api.adminDash.givePacks, { sessionToken: tom.token, id: alice.userId, n: 10 });
    await t.mutation(api.adminDash.giveCoins, { sessionToken: tom.token, id: alice.userId, amount: 250 });
    await expect(t.mutation(api.adminDash.giveCoins, { sessionToken: tom.token, id: alice.userId, amount: -9999 })).rejects.toThrow(/n’a que 250/);
    await t.mutation(api.adminDash.giveCard, { sessionToken: tom.token, id: alice.userId, cardId: card.id, count: 2 });
    const u = await t.run((ctx) => ctx.db.get(alice.userId));
    expect(u!.packBalance).toBeGreaterThanOrEqual(15);
    expect(u!.coins).toBe(250);
    const inv = await t.run((ctx) => ctx.db.query('inventory').collect());
    expect(inv).toMatchObject([{ cardId: card.id, rarity: 'rare', count: 2 }]);
    const log = await t.query(api.adminDash.journal, { sessionToken: tom.token });
    expect(log.map((l) => l.action)).toEqual(['carte', 'pieces', 'boosters']);
    expect(log[0]).toMatchObject({ by: 'tom', target: 'alice' });
  });

  test('bannir puis rétablir ; on ne bannit pas l’équipe', async () => {
    const { t, tom, hugo, alice } = await setup();
    await expect(t.mutation(api.adminDash.ban, { sessionToken: tom.token, id: hugo.userId, reason: 'test' })).rejects.toThrow(/équipe/);
    await t.mutation(api.adminDash.ban, { sessionToken: tom.token, id: alice.userId, reason: 'multi-comptes' });
    const banned = (await t.query(api.adminDash.players, { sessionToken: tom.token })).find((p) => p.name === 'alice')!;
    expect(banned.banReason).toBe('multi-comptes');
    expect(await t.run((ctx) => ctx.db.query('sessions').withIndex('by_userId', (q) => q.eq('userId', alice.userId)).collect())).toHaveLength(0);
    await t.mutation(api.adminDash.unban, { sessionToken: tom.token, id: alice.userId });
    expect((await t.run((ctx) => ctx.db.get(alice.userId)))!.bannedAt).toBeUndefined();
  });

  test('cartes à corriger : une ligne par carte, depuis une suggestion (acceptée), puis corrigée', async () => {
    const { t, tom, alice } = await setup();
    await t.mutation(api.suggestions.submit, { sessionToken: alice.token, kind: 'design', text: 'mauvaise photo', cardId: card.id });
    const [s] = (await t.query(api.suggestions.adminList, { sessionToken: tom.token })).items;
    await t.mutation(api.adminDash.addFix, { sessionToken: tom.token, cardId: card.id, note: 'mauvaise photo', suggestionId: s.id as never });
    await t.mutation(api.adminDash.addFix, { sessionToken: tom.token, cardId: card.id, note: 'nom aussi', imageUrl: 'https://exemple.fr/a.png' });
    let list = await t.query(api.adminDash.fixes, { sessionToken: tom.token });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: card.name, note: 'mauvaise photo · nom aussi', imageUrl: 'https://exemple.fr/a.png', status: 'afaire', fromPlayer: true });
    expect((await t.query(api.suggestions.adminList, { sessionToken: tom.token, status: 'acceptee' })).items).toHaveLength(1);
    await t.mutation(api.adminDash.setFix, { sessionToken: tom.token, id: list[0].id as never, status: 'fait' });
    list = await t.query(api.adminDash.fixes, { sessionToken: tom.token });
    expect(list[0].status).toBe('fait');
    expect((await t.query(api.adminDash.overview, { sessionToken: tom.token })).fixesTodo).toBe(0);
  });

  test('verrou du club : heure future seulement, puis retiré', async () => {
    const { t, tom } = await setup();
    await expect(t.mutation(api.adminDash.setLaunch, { sessionToken: tom.token, at: Date.now() - 1000 })).rejects.toThrow(/futur/);
    await t.mutation(api.adminDash.setLaunch, { sessionToken: tom.token, at: Date.now() + 3600_000 });
    expect((await t.query(api.adminDash.overview, { sessionToken: tom.token })).launchAt).toBeGreaterThan(Date.now());
    await t.mutation(api.adminDash.setLaunch, { sessionToken: tom.token, at: null });
    expect((await t.query(api.adminDash.overview, { sessionToken: tom.token })).launchAt).toBeNull();
  });

  test('cadeau à tous : boosters + pièces aux joueurs non bannis, journalisé', async () => {
    const { t, tom, alice, hugo } = await setup();
    await t.run((ctx) => ctx.db.patch(hugo.userId, { bannedAt: Date.now() }));
    const r = await t.mutation(api.adminDash.giftAll, { sessionToken: tom.token, packs: 3, coins: 100, label: 'Désolé pour le bug' });
    expect(r).toMatch(/2 joueur/);
    expect((await t.run((ctx) => ctx.db.get(alice.userId)))!.coins).toBe(100);
    expect((await t.run((ctx) => ctx.db.get(hugo.userId)))!.coins).toBeUndefined();
    await expect(t.mutation(api.adminDash.giftAll, { sessionToken: tom.token, label: 'x' })).rejects.toThrow(/au moins/);
    expect((await t.query(api.adminDash.journal, { sessionToken: tom.token }))[0].action).toBe('cadeau à tous');
  });

  test('retirer une carte, qui la possède, déconnecter, notes', async () => {
    const { t, tom, alice } = await setup();
    await t.mutation(api.adminDash.giveCard, { sessionToken: tom.token, id: alice.userId, cardId: card.id, count: 3 });
    expect(await t.query(api.adminDash.cardOwners, { sessionToken: tom.token, cardId: card.id })).toMatchObject([{ name: 'alice', count: 3, rarity: 'rare' }]);
    await expect(t.mutation(api.adminDash.takeCard, { sessionToken: tom.token, id: alice.userId, cardId: card.id, rarity: 'rare', count: 1, reason: ' ' })).rejects.toThrow(/raison/);
    await t.mutation(api.adminDash.takeCard, { sessionToken: tom.token, id: alice.userId, cardId: card.id, rarity: 'rare', count: 2, reason: 'doublon bug' });
    expect(await t.query(api.adminDash.playerCards, { sessionToken: tom.token, id: alice.userId })).toMatchObject([{ cardId: card.id, count: 1 }]);
    await expect(t.mutation(api.adminDash.takeCard, { sessionToken: tom.token, id: alice.userId, cardId: card.id, rarity: 'rare', count: 5, reason: 'x' })).rejects.toThrow(/alice n’a pas assez/);
    await t.mutation(api.adminDash.logout, { sessionToken: tom.token, id: alice.userId });
    expect(await t.query(api.adminDash.whoami, { sessionToken: alice.token })).toMatchObject({ ok: false, reason: 'login' });
    await t.mutation(api.adminDash.addNote, { sessionToken: tom.token, id: alice.userId, text: 'a payé l’abonnement' });
    const d = await t.query(api.adminDash.playerDetail, { sessionToken: tom.token, id: alice.userId });
    expect(d.notes).toMatchObject([{ text: 'a payé l’abonnement', by: 'tom' }]);
    expect(d.pendingTrades).toBe(0);
  });

  test('annonce : envoyée sur une version avec notifications', async () => {
    const { t, tom } = await setup();
    expect(await t.mutation(api.adminDash.announce, { sessionToken: tom.token, title: 'Patch', body: 'Nouveautés !' })).toMatch(/Annonce envoyée à 0 joueur/);
    expect((await t.query(api.adminDash.overview, { sessionToken: tom.token })).pushPlayers).toBe(0);
  });
});
