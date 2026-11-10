/// <reference types="vite/client" />
/** Sondage « prochaines mises à jour » (v1.0.10) : une réponse par joueur, réponses filtrées, résultats aux modérateurs. */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { SURVEY_ID } from '../src/core/survey';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, extra: Record<string, unknown> = {}) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), ...extra });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob'), tom: await mk('tom', { isModerator: true }) };
}

describe('sondage', () => {
  test('une réponse par joueur ; la deuxième ne remplace pas la première', async () => {
    const { t, alice } = await setup();
    expect(await t.query(api.survey.answered, { sessionToken: alice.token, surveyId: SURVEY_ID })).toBe(false);
    const r1 = await t.mutation(api.survey.submit, { sessionToken: alice.token, surveyId: SURVEY_ID, answer: { universes: ['anime'], features: ['jeux'], rating: 4 } });
    expect(r1).toEqual({ ok: true, already: false });
    expect(await t.query(api.survey.answered, { sessionToken: alice.token, surveyId: SURVEY_ID })).toBe(true);
    const r2 = await t.mutation(api.survey.submit, { sessionToken: alice.token, surveyId: SURVEY_ID, answer: { universes: ['sport'], features: [] } });
    expect(r2.already).toBe(true);
    const rows = await t.run((ctx) => ctx.db.query('surveyAnswers').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].universes).toEqual(['anime']);
  });
  test('réponses inconnues retirées, 3 nouveautés au plus, note bornée ; réponse vide refusée', async () => {
    const { t, bob } = await setup();
    await expect(t.mutation(api.survey.submit, { sessionToken: bob.token, surveyId: SURVEY_ID, answer: { universes: ['pirate'], features: [], comment: '   ' } })).rejects.toThrow(/au moins une réponse/);
    await t.mutation(api.survey.submit, { sessionToken: bob.token, surveyId: SURVEY_ID, answer: { universes: ['anime', 'anime', 'pirate'], features: ['jeux', 'events', 'defis', 'profil'], rating: 9, names: '  One Piece  ' } });
    const [row] = await t.run((ctx) => ctx.db.query('surveyAnswers').collect());
    expect(row).toMatchObject({ universes: ['anime'], features: ['jeux', 'events', 'defis'], names: 'One Piece' });
    expect(row.rating).toBeUndefined();
  });
  test('résultats : réservés aux modérateurs, comptes et réponses écrites', async () => {
    const { t, alice, bob, tom } = await setup();
    await t.mutation(api.survey.submit, { sessionToken: alice.token, surveyId: SURVEY_ID, answer: { universes: ['anime', 'jv'], features: ['jeux'], rating: 5, comment: 'Top' } });
    await t.mutation(api.survey.submit, { sessionToken: bob.token, surveyId: SURVEY_ID, answer: { universes: ['anime'], features: ['events'], rating: 3 } });
    await expect(t.query(api.survey.results, { sessionToken: alice.token, surveyId: SURVEY_ID })).rejects.toThrow(/modérateurs/);
    const r = await t.query(api.survey.results, { sessionToken: tom.token, surveyId: SURVEY_ID });
    expect(r.total).toBe(2);
    expect(r.universes.anime).toBe(2);
    expect(r.universes.jv).toBe(1);
    expect(r.features).toMatchObject({ jeux: 1, events: 1 });
    expect(r.ratings).toEqual([0, 0, 1, 0, 1]);
    expect(r.texts).toEqual([expect.objectContaining({ author: 'alice', comment: 'Top', rating: 5 })]);
  });
});
