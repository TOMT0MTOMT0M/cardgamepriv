/// <reference types="vite/client" />
/**
 * (11/11, chantier ouvertures-saisons) Saisons mensuelles du classement (convex/seasons.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { SEASON_PACKS, seasonBoosters, seasonEndAt, seasonKey, seasonStandings } from '../src/core/seasons';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, packs = 5) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: name, username: name, displayName: name, packBalance: packs, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(),
      });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, mk, alice: await mk('alice'), bob: await mk('bob') };
}

/** heure de Paris → instant (UTC+1 en novembre / décembre) */
const paris = (iso: string) => Date.parse(`${iso}+01:00`);

describe('saisons : règles pures', () => {
  test('mois de Paris, fin de saison, récompenses', () => {
    expect(seasonKey(paris('2026-11-30T23:59:00'))).toBe('2026-11');
    expect(seasonKey(paris('2026-12-01T00:01:00'))).toBe('2026-12');
    const end = seasonEndAt(paris('2026-11-15T12:00:00'));
    expect(Math.abs(end - paris('2026-12-01T00:00:00'))).toBeLessThan(60_000);
    expect(seasonBoosters(1)).toBe(SEASON_PACKS[0]);
    expect(seasonBoosters(3)).toBe(SEASON_PACKS[2]);
    expect(seasonBoosters(7)).toBe(2);
    expect(seasonBoosters(15)).toBe(1);
    expect(seasonBoosters(0)).toBe(0);
  });
  test('classement : cartes gagnées, départage aux boosters, sans point de départ = absent', () => {
    const st = seasonStandings(
      [
        { userId: 'a', name: 'A', uniques: 50, packsOpened: 10 },
        { userId: 'b', name: 'B', uniques: 30, packsOpened: 20 },
        { userId: 'c', name: 'C', uniques: 400, packsOpened: 99 },
        { userId: 'd', name: 'D', uniques: 5, packsOpened: 1 },
      ],
      [
        { userId: 'a', uniques: 40, packs: 5 },
        { userId: 'b', uniques: 20, packs: 5 },
        { userId: 'd', uniques: 9, packs: 0 },
      ],
    );
    expect(st.map((s) => [s.userId, s.gained, s.rank])).toEqual([['b', 10, 1], ['a', 10, 2], ['d', 0, 0]]);
  });
});

describe('saisons : cron', () => {
  test('ouverture, arrivée en cours de saison, fin du mois (récompenses, historique), idempotent', async () => {
    const { t, mk, alice, bob } = await setup();
    await t.action(internal.profiles.refreshRanks, { all: true });
    // première saison : ouverte au premier passage du cron, points de départ = maintenant
    expect((await t.action(internal.seasons.tick, { now: paris('2026-11-15T10:00:00') })).action).toBe('opened');
    let b = await t.query(api.seasons.board, {});
    expect(b.current?.key).toBe('2026-11');
    expect(b.current?.bases.length).toBe(2);
    expect(b.past).toEqual([]);
    // alice ouvre deux boosters pendant la saison, bob rien
    for (let i = 0; i < 2; i++) {
      const p = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
      await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: p._id });
    }
    // carol arrive en cours de saison : ajoutée au passage suivant du cron (même mois)
    const carol = await mk('carol');
    await t.action(internal.profiles.refreshRanks, { all: true });
    expect((await t.action(internal.seasons.tick, { now: paris('2026-11-20T10:00:00') })).action).toBe('joined');
    b = await t.query(api.seasons.board, {});
    expect(b.current?.bases.map((x) => x.userId).sort()).toEqual([alice.userId, bob.userId, carol.userId].sort());
    // rien à faire tant que le mois ne change pas
    expect((await t.action(internal.seasons.tick, { now: paris('2026-11-30T23:00:00') })).action).toBe('none');

    // fin du mois : alice 1re (seule à avoir gagné des cartes), récompensée ; bob et carol rien
    const before = await t.run(async (ctx) => (await ctx.db.get(alice.userId))!);
    const r = await t.action(internal.seasons.tick, { now: paris('2026-12-01T00:30:00') });
    expect(r.action).toBe('closed');
    const a1 = await t.run(async (ctx) => (await ctx.db.get(alice.userId))!);
    expect(a1.seasonWins).toBe(1);
    expect(a1.seasonPodiums).toBe(1);
    expect(a1.packBalance).toBeGreaterThanOrEqual(before.packBalance + SEASON_PACKS[0]);
    const bob1 = await t.run(async (ctx) => (await ctx.db.get(bob.userId))!);
    expect(bob1.seasonPodiums).toBeUndefined();
    b = await t.query(api.seasons.board, {});
    expect(b.current?.key).toBe('2026-12');
    expect(b.past.length).toBe(1);
    expect(b.past[0].key).toBe('2026-11');
    expect(b.past[0].results.map((x) => [x.name, x.rank, x.boosters])).toEqual([['alice', 1, SEASON_PACKS[0]]]);
    expect(b.past[0].results[0].gained).toBeGreaterThan(0);

    // le cron repasse (même heure, puis plus tard) : rien n'est redonné, une seule saison figée
    await t.action(internal.seasons.tick, { now: paris('2026-12-01T00:30:00') });
    await t.action(internal.seasons.tick, { now: paris('2026-12-01T01:30:00') });
    const a2 = await t.run(async (ctx) => (await ctx.db.get(alice.userId))!);
    expect(a2.seasonWins).toBe(1);
    expect(a2.packBalance).toBe(a1.packBalance);
    expect((await t.query(api.seasons.board, {})).past.length).toBe(1);

    // les cosmétiques de saison se débloquent : titre « Champion de saison » et cadre « Podium de saison »
    const kept = await t.mutation(api.profiles.setCosmetics, { sessionToken: alice.token, title: 't-season-1', frame: 's-podium' });
    expect(kept.title).toBe('t-season-1');
    expect(kept.frame).toBe('s-podium');
    const keptBob = await t.mutation(api.profiles.setCosmetics, { sessionToken: bob.token, title: 't-season-1', frame: 's-podium' });
    expect(keptBob.title).toBeUndefined();
  });

  test('une saison figée ne se rouvre pas, même sans saison ouverte', async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert('seasons', { key: '2026-11', status: 'closed', startAt: 0, closedAt: 1, bases: [], results: [] });
    });
    expect((await t.action(internal.seasons.tick, { now: paris('2026-11-20T10:00:00') })).action).toBe('none');
    expect((await t.action(internal.seasons.tick, { now: paris('2026-12-02T10:00:00') })).action).toBe('opened');
  });
});
