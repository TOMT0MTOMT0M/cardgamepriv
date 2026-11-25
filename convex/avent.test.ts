/// <reference types="vite/client" />
/**
 * Calendrier de l'Avent (convex/avent.ts, règles : src/core/avent.ts) — v2.1.13 : grille de Tom (25/11), cosmétiques
 * de Noël donnés par leur case.
 */
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { ADVENT_DAYS, ADVENT_LAYOUT, ADVENT_REWARDS, ADVENT_YEAR, adventDay, adventEndAt, adventPhase, adventStartAt, adventWaiting, doorState } from '../src/core/avent';
import { BANNERS, FRAMES, OPENINGS, PROFILE_FX, adventCosmetic, cleanCosmetics, statsFrom } from '../src/core/cosmetics';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
/** midi à Paris, le `d` décembre de l'édition */
const dec = (d: number, year = ADVENT_YEAR) => Date.UTC(year, 11, d, 11);
const sum = (k: 'coins' | 'packs') => ADVENT_REWARDS.reduce((n, r) => n + (r[k] ?? 0), 0);

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
  test('grille de Tom : 24 cadeaux, 95 boosters, 13 000 pièces, le 24 est un god pack ; la grille montre les 23 autres jours', () => {
    expect(ADVENT_REWARDS).toHaveLength(ADVENT_DAYS);
    expect(ADVENT_REWARDS[23]).toEqual({ god: true });
    expect(sum('packs')).toBe(95);
    expect(sum('coins')).toBe(13000);
    expect(ADVENT_REWARDS[20]).toEqual({ packs: 15, coins: 2500 });
    expect(ADVENT_REWARDS.slice(0, 23).every((r) => !r.god && ((r.coins ?? 0) > 0 || (r.packs ?? 0) > 0 || (r.cos?.length ?? 0) > 0))).toBe(true);
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
  test('9 cosmétiques de Noël, chacun donné par SA case et débloqué seulement par elle', () => {
    const given = ADVENT_REWARDS.flatMap((r, i) => (r.cos ?? []).map((x) => ({ ...x, day: i + 1 })));
    expect(given.map((x) => `${x.day}:${x.kind}`)).toEqual(['3:frame', '6:banner', '10:pfx', '13:frame', '17:banner', '20:opening', '22:pfx', '23:frame', '23:opening']);
    for (const x of given) {
      const c = adventCosmetic(x.kind, x.id);
      expect(c, x.id).toBeDefined();
      expect(c!.advent, x.id).toBe(x.day);
      const s = (days: number[]) => statsFrom([], { packsOpened: 0, tradesDone: 0, contractsSigned: 0, streak: 0, advent: days });
      expect(c!.unlock(s([])), x.id).toBe(false);
      expect(c!.unlock(s(Array.from({ length: 24 }, (_, i) => i + 1).filter((d) => d !== x.day))), x.id).toBe(false);
      expect(c!.unlock(s([x.day])), x.id).toBe(true);
    }
    // aucun cosmétique « de l'Avent » qui ne serait donné par aucune case
    const all = [...FRAMES, ...BANNERS, ...PROFILE_FX, ...OPENINGS].filter((c) => c.advent);
    expect(all).toHaveLength(9);
    // un choix verrouillé est ignoré, un choix débloqué est gardé
    const st = (days: number[]) => statsFrom([], { packsOpened: 0, tradesDone: 0, contractsSigned: 0, streak: 0, advent: days });
    expect(cleanCosmetics({ frame: 'x-flocon', banner: 'x-village', pfx: 'neige' }, st([]))).toMatchObject({ frame: undefined, banner: undefined });
    expect(cleanCosmetics({ pfx: 'neige' }, st([])).pfx).toBeUndefined();
    expect(cleanCosmetics({ frame: 'x-flocon', banner: 'x-village', pfx: 'neige' }, st([3, 6, 10]))).toMatchObject({ frame: 'x-flocon', banner: 'x-village', pfx: 'neige' });
  });
});

describe('ouverture des cases', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  test('avant décembre : refusé ; le jour J : le cadeau une seule fois', async () => {
    vi.setSystemTime(Date.UTC(ADVENT_YEAR, 10, 20, 12));
    const { t, userId, token } = await setup();
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 1 })).rejects.toThrow(/ouvre le 1er décembre/);
    vi.setSystemTime(dec(2));
    expect(await t.mutation(api.avent.open, { sessionToken: token, day: 2 })).toEqual({ day: 2, reward: { coins: 1250 }, opened: [2] });
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 2 })).rejects.toThrow(/déjà ouverte/);
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 3 })).rejects.toThrow(/s’ouvre le 3 décembre/);
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 25 })).rejects.toThrow(/Case inconnue/);
    const u = await user(t, userId);
    expect(u.coins).toBe(1350);
    expect(u.advent).toEqual({ [String(ADVENT_YEAR)]: [2] });
    const eco = await t.query(api.economy.state, { sessionToken: token });
    expect(eco!.advent).toEqual({ opened: [2], godPacks: 0 });
  });

  test('boosters par-dessus la réserve ; une case manquée se rattrape ; case 21 : boosters ET pièces ; après le 31 : fini', async () => {
    vi.setSystemTime(dec(21));
    const { t, userId, token } = await setup();
    expect((await t.mutation(api.avent.open, { sessionToken: token, day: 21 })).reward).toEqual({ packs: 15, coins: 2500 });
    expect((await t.mutation(api.avent.open, { sessionToken: token, day: 1 })).opened).toEqual([1, 21]);
    const u = await user(t, userId);
    expect(u.packBalance).toBe(3 + 15 + 10);
    expect(u.coins).toBe(100 + 2500);
    vi.setSystemTime(Date.UTC(ADVENT_YEAR + 1, 0, 1, 12));
    await expect(t.mutation(api.avent.open, { sessionToken: token, day: 3 })).rejects.toThrow(/terminé/);
  });

  test('case cosmétique : débloque le cadre / l’animation au serveur (profil), pas avant', async () => {
    vi.setSystemTime(dec(10));
    const { t, userId, token } = await setup();
    // avant d'ouvrir la case 3 : le cadre « Flocon givré » est ignoré
    expect((await t.mutation(api.profiles.setCosmetics, { sessionToken: token, frame: 'x-flocon', pfx: 'neige' })).frame).toBeUndefined();
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: token, style: 'glace' })).rejects.toThrow();
    const r = await t.mutation(api.avent.open, { sessionToken: token, day: 3 });
    expect(r.reward).toEqual({ cos: [{ kind: 'frame', id: 'x-flocon' }] });
    expect((await user(t, userId)).coins).toBe(100);
    await t.mutation(api.avent.open, { sessionToken: token, day: 10 });
    const kept = await t.mutation(api.profiles.setCosmetics, { sessionToken: token, frame: 'x-flocon', pfx: 'neige' });
    expect(kept).toMatchObject({ frame: 'x-flocon', pfx: 'neige' });
    expect((await user(t, userId)).cosmetics).toMatchObject({ frame: 'x-flocon', pfx: 'neige' });
    const prof = await t.query(api.profiles.profile, { userId });
    expect(prof!.cosmetics).toMatchObject({ frame: 'x-flocon', pfx: 'neige' });
  });

  test('ouverture de Noël : choisie seulement une fois sa case ouverte', async () => {
    vi.setSystemTime(dec(23));
    const { t, userId, token } = await setup();
    await expect(t.mutation(api.profiles.setOpening, { sessionToken: token, style: 'etoile' })).rejects.toThrow();
    await t.mutation(api.avent.open, { sessionToken: token, day: 23 });
    expect(await t.mutation(api.profiles.setOpening, { sessionToken: token, style: 'etoile' })).toEqual({ style: 'etoile' });
    expect((await user(t, userId)).cosmetics?.opening).toBe('etoile');
  });

  test('case 24 : un god pack — le prochain booster ouvert, 4★ ou mieux avec au moins une 6★, une seule fois', async () => {
    vi.setSystemTime(dec(24));
    const { t, userId, token } = await setup();
    await t.mutation(api.avent.open, { sessionToken: token, day: 24 });
    let u = await user(t, userId);
    expect(u.godPacks).toBe(1);
    expect(u.packBalance).toBe(4);
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: token, packKind: 'bebou' });
    expect(pack.god).toBe(true);
    expect(pack.cards.every((c) => ['epic', 'legendary', 'mythic', 'secret'].includes(c.rarity))).toBe(true);
    expect(pack.cards.some((c) => c.rarity === 'mythic')).toBe(true);
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
    expect(u.coins).toBe(100 + 13000);
    expect(u.packBalance).toBe(3 + 95 + 1);
    expect(u.godPacks).toBe(1);
    await t.mutation(api.avent.debugReset, { sessionToken: token });
    expect((await user(t, userId)).advent).toEqual({});
    expect((await t.query(api.economy.state, { sessionToken: token }))!.advent.opened).toEqual([]);
  });
});
