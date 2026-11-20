/// <reference types="vite/client" />
/**
 * Calendrier de l'Avent (convex/avent.ts, règles : src/core/avent.ts).
 */
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { ADVENT_DAYS, ADVENT_LAYOUT, ADVENT_REWARDS, ADVENT_STEPS, ADVENT_YEAR, adventDay, adventEndAt, adventPhase, adventStartAt, adventWaiting, doorState } from '../src/core/avent';
import { ACHIEVEMENTS, achievementDone, achievementStats, emptyEcon } from '../src/core/economy';
import { BADGES, FRAMES, TITLES, statsFrom } from '../src/core/cosmetics';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
/** midi à Paris, le `d` décembre de l'édition */
const dec = (d: number, year = ADVENT_YEAR) => Date.UTC(year, 11, d, 11);

async function setup(admin = false) {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { discordId: 'a', username: 'a', displayName: 'alice', packBalance: 3, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 100, ...(admin ? { isAdmin: true } : {}) });
    await ctx.db.insert('sessions', { token: 'tok', userId: id, createdAt: Date.now(), expiresAt: Date.now() + 40 * 86400000 });
    return id;
  });
  return { t, userId, token: 'tok' };
}
type T = Awaited<ReturnType<typeof setup>>['t'];
const user = (t: T, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!);

describe('règles pures', () => {
  test('24 cadeaux, le 24 est un god pack ; la grille montre les 23 autres jours une fois chacun', () => {
    expect(ADVENT_REWARDS).toHaveLength(ADVENT_DAYS);
    expect(ADVENT_REWARDS[23]).toEqual({ god: true });
    expect(ADVENT_REWARDS.slice(0, 23).every((r) => !r.god && ((r.coins ?? 0) > 0) !== ((r.packs ?? 0) > 0))).toBe(true);
    expect([...ADVENT_LAYOUT].sort((a, b) => a - b)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });
  test('dates à l’heure de Paris : avant, pendant (rattrapage jusqu’au 31), après', () => {
    expect(adventDay(Date.UTC(ADVENT_YEAR, 10, 30, 22, 59))).toBe(0); // 30 nov. 23 h 59 à Paris
    expect(adventDay(adventStartAt())).toBe(1);
    expect(adventDay(Date.UTC(ADVENT_YEAR, 11, 23, 23, 30))).toBe(24); // 24 déc. 0 h 30 à Paris
    expect(adventDay(adventEndAt() - 1000)).toBe(31);
    expect(adventDay(adventEndAt())).toBe(32);
    expect([0, 1, 31, 32].map(adventPhase)).toEqual(['before', 'live', 'live', 'over']);
    expect([doorState(5, 5, []), doorState(4, 5, []), doorState(6, 5, []), doorState(4, 5, [4]), doorState(4, 32, []), doorState(1, 0, [])]).toEqual(['today', 'late', 'locked', 'opened', 'closed', 'locked']);
    expect(adventWaiting(26, [1, 2, 3])).toHaveLength(21);
    expect(adventWaiting(3, [1, 2, 3])).toEqual([]);
  });
  test('cosmétiques de Noël : un succès par palier, chacun débloque un seul élément', () => {
    for (const n of ADVENT_STEPS) {
      const a = ACHIEVEMENTS.find((x) => x.id === `noel26-${n}`)!;
      expect(a.cos, a.id).toBe(true);
      expect([...BADGES, ...TITLES, ...FRAMES].filter((c) => c.need === a.id), a.id).toHaveLength(1);
      const s = (k: number) => achievementStats(statsFrom([], { packsOpened: 0, tradesDone: 0, contractsSigned: 0, streak: 0, noel26: k }), emptyEcon());
      expect(achievementDone(a, s(n - 1))).toBe(false);
      expect(achievementDone(a, s(n))).toBe(true);
      // limité dans le temps : ne compte pas dans le niveau Bébou
      expect(s(24).bebouLevel).toBe(s(0).bebouLevel);
    }
  });
});

describe('ouverture des cases', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  test('avant décembre : refusé ; le jour J : pièces créditées une seule fois', async () => {
    vi.setSystemTime(Date.UTC(ADVENT_YEAR, 10, 20, 12));
    const { t, userId, token } = await setup();
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 1 })).rejects.toThrow(/ouvre le 1er décembre/);
    vi.setSystemTime(dec(1));
    expect(await t.mutation(api.avent.open, { sessionToken: token, day: 1 })).toEqual({ day: 1, reward: { coins: 150 }, opened: [1] });
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 1 })).rejects.toThrow(/déjà ouverte/);
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 2 })).rejects.toThrow(/s’ouvre le 2 décembre/);
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 25 })).rejects.toThrow(/Case inconnue/);
    const u = await user(t, userId);
    expect(u.coins).toBe(250);
    expect(u.advent).toEqual({ [String(ADVENT_YEAR)]: [1] });
    const eco = await t.query(api.economy.state, { sessionToken: token });
    expect(eco!.advent).toEqual({ opened: [1], godPacks: 0 });
    expect(eco!.achInput.noel26).toBe(1);
  });

  test('boosters par-dessus la réserve ; une case manquée se rattrape ; après le 31 : fini', async () => {
    vi.setSystemTime(dec(6));
    const { t, userId, token } = await setup();
    expect((await t.mutation(api.avent.open, { sessionToken: token, day: 6 })).reward).toEqual({ packs: 3 });
    expect((await t.mutation(api.avent.open, { sessionToken: token, day: 2 })).opened).toEqual([2, 6]);
    expect((await user(t, userId)).packBalance).toBe(3 + 3 + 1);
    vi.setSystemTime(dec(31));
    expect((await t.mutation(api.avent.open, { sessionToken: token, day: 24 })).reward).toEqual({ god: true });
    vi.setSystemTime(Date.UTC(ADVENT_YEAR + 1, 0, 1, 12));
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 3 })).rejects.toThrow(/terminé/);
  });

  test('case 24 : un god pack — le prochain booster ouvert, une seule fois', async () => {
    vi.setSystemTime(dec(24));
    const { t, userId, token } = await setup();
    await t.mutation(api.avent.open, { sessionToken: token, day: 24 });
    let u = await user(t, userId);
    expect(u.godPacks).toBe(1);
    expect(u.packBalance).toBe(4);
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: token, packKind: 'bebou' });
    expect(pack.god).toBe(true);
    expect(pack.cards.every((c) => ['epic', 'legendary', 'mythic', 'secret'].includes(c.rarity))).toBe(true);
    u = await user(t, userId);
    expect(u.godPacks).toBe(0);
    await t.mutation(api.packs.revealPack, { sessionToken: token, packId: pack._id });
    // le suivant redevient un booster normal (1 chance sur 1 000 d'être un god pack : on ne regarde que le compteur)
    await t.mutation(api.packs.preparePack, { sessionToken: token, packKind: 'bebou' });
    expect((await user(t, userId)).godPacks).toBe(0);
  });

  test('mode test : réservé aux admins ; simule un jour, ouvre les 24, referme tout', async () => {
    vi.setSystemTime(Date.UTC(ADVENT_YEAR, 10, 20, 12));
    const plain = await setup();
    await expect(plain.t.mutation(api.avent.open, { sessionToken: plain.token, day: 1, debugDay: 24 })).rejects.toThrow(/réservé à l’équipe/);
    await expect(plain.t.mutation(api.avent.debugReset, { sessionToken: plain.token })).rejects.toThrow(/réservé à l’équipe/);
    const { t, userId, token } = await setup(true);
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 5, debugDay: 4 })).rejects.toThrow(/s’ouvre le 5 décembre/);
    for (let d = 1; d <= ADVENT_DAYS; d++) await t.mutation(api.avent.open, { sessionToken: token, day: d, debugDay: 24 });
    const u = await user(t, userId);
    expect(u.advent![String(ADVENT_YEAR)]).toHaveLength(24);
    expect(u.coins).toBe(100 + 5250);
    expect(u.packBalance).toBe(3 + 35 + 1);
    expect(u.godPacks).toBe(1);
    await t.mutation(api.avent.debugReset, { sessionToken: token });
    expect((await user(t, userId)).advent).toEqual({});
    expect((await t.query(api.economy.state, { sessionToken: token }))!.advent.opened).toEqual([]);
  });
});
