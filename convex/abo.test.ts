/// <reference types="vite/client" />
/**
 * Abonnement (convex/abo.ts, règles : src/core/abo.ts).
 */
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { SUB_MONTH_MS, SUB_REMIND_MS, packCapOf, pollProblem, subActive, subDaysLeft, subEndingSoon, subExtend, bebouCardProblem } from '../src/core/abo';
import { PACK_REGEN_MS, applyRegen, fullAt } from '../src/core/packRegen';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
const T0 = Date.UTC(2026, 11, 1, 12);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = (name: string, extra: object = {}) =>
    t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 10, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 0, ...extra });
      await ctx.db.insert('sessions', { token: `tok-${name}`, userId: id, createdAt: Date.now(), expiresAt: Date.now() + 90 * 86400000 });
      return { id, token: `tok-${name}` };
    });
  return { t, tom: await mk('tom', { isAdmin: true }), alice: await mk('alice'), bob: await mk('bob') };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const user = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!);
/** (l'horloge simulée avance de quelques ms pendant les appels) */
const near = (got: number | undefined, want: number) => expect(Math.abs((got ?? 0) - want)).toBeLessThan(200);

describe('règles pures', () => {
  test('réserve : 15, 20 pour un abonné ; la recharge suit le plafond', () => {
    expect(packCapOf({}, T0)).toBe(15);
    expect(packCapOf({ subUntil: T0 + 1 }, T0)).toBe(20);
    expect(packCapOf({ subUntil: T0 }, T0)).toBe(15);
    expect(applyRegen(15, T0, T0 + 10 * PACK_REGEN_MS).balance).toBe(15);
    expect(applyRegen(15, T0, T0 + 3 * PACK_REGEN_MS, 0, 20).balance).toBe(18);
    expect(applyRegen(15, T0, T0 + 99 * PACK_REGEN_MS, 0, 20)).toMatchObject({ balance: 20, nextAt: null });
    expect(fullAt(18, T0, T0, 0, 20)).toBe(T0 + 2 * PACK_REGEN_MS);
    // fin d'abonnement avec 18 en réserve : rien n'est retiré, la recharge attend de repasser sous 15
    expect(applyRegen(18, T0, T0 + 99 * PACK_REGEN_MS)).toMatchObject({ balance: 18, nextAt: null });
  });
  test('durée : un mois à la suite du mois en cours, sinon à partir de maintenant ; rappel à 5 jours', () => {
    expect(subExtend(undefined, T0)).toBe(T0 + SUB_MONTH_MS);
    expect(subExtend(T0 - 5, T0, 2)).toBe(T0 + 2 * SUB_MONTH_MS);
    expect(subExtend(T0 + 1000, T0)).toBe(T0 + 1000 + SUB_MONTH_MS);
    expect(subActive({ subUntil: T0 + 1 }, T0)).toBe(true);
    expect(subDaysLeft(T0 + 36 * 3600_000, T0)).toBe(2);
    expect(subEndingSoon(T0 + SUB_REMIND_MS, T0)).toBe(true);
    expect(subEndingSoon(T0 + SUB_REMIND_MS + 1, T0)).toBe(false);
    expect(subEndingSoon(T0 - 1, T0)).toBe(false);
  });
  test('contrôles : carte Bebou, vote', () => {
    expect(bebouCardProblem('Le Boss', 'moi en costard')).toBeNull();
    expect(bebouCardProblem('x', '')).toMatch(/nom/);
    expect(bebouCardProblem('Le Boss', 'x'.repeat(401))).toMatch(/trop longue/);
    expect(pollProblem('Prochaine collection ?', ['Télé', 'Cinéma'], T0 + 1000, T0)).toBeNull();
    expect(pollProblem('Prochaine collection ?', ['Télé'], T0 + 1000, T0)).toMatch(/2 choix/);
    expect(pollProblem('Prochaine collection ?', ['Télé', 'télé'], T0 + 1000, T0)).toMatch(/identiques/);
    expect(pollProblem('Prochaine collection ?', ['Télé', 'Cinéma'], T0 - 1, T0)).toMatch(/futur/);
  });
});

describe('abonnement', () => {
  beforeEach(() => void vi.useFakeTimers().setSystemTime(T0));
  afterEach(() => void vi.useRealTimers());

  test('« j’ai payé » → l’équipe active un mois : réserve à 20, demande effacée, mois suivants à la suite', async () => {
    const { t, tom, alice } = await setup();
    expect((await t.query(api.economy.state, { sessionToken: alice.token }))!.sub).toEqual({ until: 0, askedAt: 0 });
    near((await t.mutation(api.abo.ask, { sessionToken: alice.token })).askedAt, T0);
    let s = await t.query(api.abo.adminState, { sessionToken: tom.token });
    expect(s.asks.map((a) => a.name)).toEqual(['alice']);
    // un joueur ne peut ni lire le dashboard ni s'activer lui-même
    await expect(t.query(api.abo.adminState, { sessionToken: alice.token })).rejects.toThrow(/Réservé à l’équipe/);
    await expect(t.mutation(api.abo.adminActivate, { sessionToken: alice.token, userId: alice.id })).rejects.toThrow(/Réservé à l’équipe/);
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id });
    let u = await user(t, alice.id);
    near(u.subUntil, T0 + SUB_MONTH_MS);
    near(u.subSince, T0);
    expect(u.subAskAt).toBeUndefined();
    expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packCap).toBe(20);
    expect((await t.query(api.users.me, { sessionToken: tom.token }))!.packCap).toBe(15);
    near((await t.query(api.economy.state, { sessionToken: alice.token }))!.sub.until, T0 + SUB_MONTH_MS);
    // déjà abonnée pour plus de 5 jours : pas de nouvelle demande
    await expect(t.mutation(api.abo.ask, { sessionToken: alice.token })).rejects.toThrow(/déjà abonné/);
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id, months: 2 });
    u = await user(t, alice.id);
    near(u.subUntil, T0 + 3 * SUB_MONTH_MS);
    near(u.subSince, T0);
    s = await t.query(api.abo.adminState, { sessionToken: tom.token });
    expect(s.asks).toEqual([]);
    expect(s.subs.map((x) => [x.name, x.active])).toEqual([['alice', true]]);
  });

  test('activation réserve pleine : pas de boosters gratuits pour le temps passé à l’arrêt ; la recharge reprend vers 20', async () => {
    const { t, tom, alice } = await setup();
    // 10 en stock, minuteur parti il y a 10 h : la réserve vaut 15 (pleine depuis longtemps)
    await t.run(async (ctx) => ctx.db.patch(alice.id, { packBalance: 10, packRegenAt: T0 - 10 * 3600_000 }));
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id });
    expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packBalance).toBe(15);
    vi.setSystemTime(T0 + 2 * PACK_REGEN_MS + 5000);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packBalance).toBe(17);
    vi.setSystemTime(T0 + 3600_000);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packBalance).toBe(20);
  });

  test('fin du mois : plafond de nouveau à 15 ; arrêt par l’équipe', async () => {
    const { t, tom, alice } = await setup();
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id });
    vi.setSystemTime(T0 + SUB_MONTH_MS + 1000);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packCap).toBe(15);
    await expect(t.mutation(api.abo.vote, { sessionToken: alice.token, pollId: '10000;aboPolls' as Id<'aboPolls'>, optionId: 'o1' })).rejects.toThrow();
    vi.setSystemTime(T0);
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id });
    await t.mutation(api.abo.adminStop, { sessionToken: tom.token, userId: alice.id });
    expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packCap).toBe(15);
  });

  test('carte Bebou : réservée aux abonnés, une par joueur, figée une fois intégrée', async () => {
    const { t, tom, alice, bob } = await setup();
    expect((await t.mutation(api.abo.submitCard, { sessionToken: bob.token, title: 'Bob', idea: '' })).error).toMatch(/Réservé aux abonnés/);
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id });
    expect((await t.mutation(api.abo.submitCard, { sessionToken: alice.token, title: 'x', idea: '' })).error).toMatch(/nom/);
    expect((await t.mutation(api.abo.submitCard, { sessionToken: alice.token, title: 'Alice la boss', idea: 'en costard' })).error).toBeUndefined();
    expect((await t.mutation(api.abo.submitCard, { sessionToken: alice.token, title: 'Alice la reine', idea: 'avec une couronne' })).error).toBeUndefined();
    const s = await t.query(api.abo.adminState, { sessionToken: tom.token });
    expect(s.cards.map((c) => [c.name, c.title, c.status])).toEqual([['alice', 'Alice la reine', 'new']]);
    expect((await t.query(api.abo.page, { sessionToken: alice.token })).card).toMatchObject({ title: 'Alice la reine', idea: 'avec une couronne', status: 'new' });
    await t.mutation(api.abo.adminCard, { sessionToken: tom.token, cardId: s.cards[0].id, status: 'done' });
    expect((await t.mutation(api.abo.submitCard, { sessionToken: alice.token, title: 'Autre', idea: '' })).error).toMatch(/déjà intégrée/);
  });

  test('vote du mois : abonnés seulement, un choix modifiable, chiffres après avoir voté', async () => {
    const { t, tom, alice, bob } = await setup();
    await t.mutation(api.abo.adminActivate, { sessionToken: tom.token, userId: alice.id });
    await expect(t.mutation(api.abo.adminPollSave, { sessionToken: alice.token, title: 'Prochaine collection ?', options: ['Télé', 'Cinéma'], closesAt: T0 + 86400000 })).rejects.toThrow(/Réservé à l’équipe/);
    await t.mutation(api.abo.adminPollSave, { sessionToken: tom.token, title: 'Prochaine collection ?', options: ['Télé', 'Cinéma', ' '], closesAt: T0 + 86400000 });
    let p = (await t.query(api.abo.page, { sessionToken: alice.token })).poll!;
    expect(p.options.map((o) => o.label)).toEqual(['Télé', 'Cinéma']);
    expect(p.counts).toBeUndefined();
    await expect(t.mutation(api.abo.vote, { sessionToken: bob.token, pollId: p.id, optionId: 'o1' })).rejects.toThrow(/Réservé aux abonnés/);
    await expect(t.mutation(api.abo.vote, { sessionToken: alice.token, pollId: p.id, optionId: 'o9' })).rejects.toThrow(/Choix inconnu/);
    expect((await t.mutation(api.abo.vote, { sessionToken: alice.token, pollId: p.id, optionId: 'o1' })).counts).toEqual({ o1: 1, o2: 0 });
    expect((await t.mutation(api.abo.vote, { sessionToken: alice.token, pollId: p.id, optionId: 'o2' })).counts).toEqual({ o1: 0, o2: 1 });
    // un non-abonné voit la question, jamais les chiffres
    expect((await t.query(api.abo.page, { sessionToken: bob.token })).poll!.counts).toBeUndefined();
    await t.mutation(api.abo.adminPollClose, { sessionToken: tom.token, pollId: p.id });
    await expect(t.mutation(api.abo.vote, { sessionToken: alice.token, pollId: p.id, optionId: 'o1' })).rejects.toThrow(/terminé/);
    p = (await t.query(api.abo.page, { sessionToken: alice.token })).poll!;
    expect(p.open).toBe(false);
    expect(p.mine).toBe('o2');
  });

  test('destinataire Wero : saisi par l’équipe, montré aux joueurs connectés seulement', async () => {
    const { t, tom, alice } = await setup();
    await expect(t.mutation(api.abo.adminSetWero, { sessionToken: alice.token, weroTo: 'x' })).rejects.toThrow(/Réservé à l’équipe/);
    await t.mutation(api.abo.adminSetWero, { sessionToken: tom.token, weroTo: ' Tom · 06 00 00 00 00 ' });
    expect((await t.query(api.abo.page, { sessionToken: alice.token })).weroTo).toBe('Tom · 06 00 00 00 00');
    expect((await t.query(api.abo.page, {})).weroTo).toBeUndefined();
    expect((await t.query(api.abo.page, {})).priceEur).toBe(5);
  });

  test('secours en ligne de commande', async () => {
    const { t, alice } = await setup();
    await t.mutation(internal.abo.activateCmd, { name: 'ALICE', months: 1 });
    near((await user(t, alice.id)).subUntil, T0 + SUB_MONTH_MS);
  });
});
