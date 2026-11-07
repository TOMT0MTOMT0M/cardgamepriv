/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { BOOST_MS, PACK_CAP, PACK_REGEN_MS, applyRegen } from '../src/core/packRegen';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function player(t: ReturnType<typeof convexTest>, name: string, extra: Record<string, unknown> = {}) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      discordId: `${name.length}${name.charCodeAt(0)}0000000`, username: name, displayName: name, packBalance: 12, lastDailyClaimAt: 0, totalPacksOpened: 40, lastSeenAt: 1, packRegenAt: 1,
      coins: 900, refCode: `${name}code1`, econ: { earned: 1, burned: 1, gamesPlayed: 3, gamesWon: 1, rouletteWins: 0, completions: ['x'], achievements: ['a1', 'a2'] }, ...extra,
    });
    await ctx.db.insert('sessions', { userId, token: `tok-${name}`, createdAt: 1, expiresAt: Date.now() + 86_400_000 });
    await ctx.db.insert('inventory', { userId, cardId: 'c1', rarity: 'common', count: 3, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
    await ctx.db.insert('coinTx', { userId, amount: 5, reason: 'x', label: 'x', createdAt: 1 });
    await ctx.db.insert('activityFeed', { userId, displayName: name, kind: 'joined', message: 'x', createdAt: 1 });
    return userId;
  });
}

afterEach(() => vi.useRealTimers());

describe('ouverture 07/11 : remise à zéro', () => {
  test('simulation : rien ne bouge ; RESET : joueurs supprimés, Tom et Hugo gardés et remis à neuf', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const tom = await player(t, 'tom', { isAdmin: true, isModerator: true });
    const hugo = await player(t, 'hugo', { isModerator: true });
    await player(t, 'leo');
    await player(t, 'ines');
    await t.run(async (ctx) => {
      await ctx.db.insert('cardMints', { cardId: 'c1', rarity: 'common', lastMintNumber: 99 });
      for (let i = 0; i < 950; i++) await ctx.db.insert('coinTx', { userId: tom, amount: 1, reason: 'x', label: 'x', createdAt: i }); // plusieurs lots
    });

    const sim = await t.mutation(internal.launch.resetAll, {});
    expect('simulation' in sim && sim.simulation).toBe(true);
    expect(sim.supprimes).toEqual(['leo (@leo)', 'ines (@ines)']);
    expect(await t.run((ctx) => ctx.db.query('users').collect()).then((u) => u.length)).toBe(4);

    await t.mutation(internal.launch.resetAll, { confirm: 'RESET' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users.map((u) => u.username).sort()).toEqual(['hugo', 'tom']);
    const T = users.find((u) => u._id === tom)!;
    expect(T).toMatchObject({ isAdmin: true, isModerator: true, packBalance: 15, totalPacksOpened: 0, refCode: 'tomcode1' });
    expect(T.regenBoostUntil! - Date.now()).toBeGreaterThan(BOOST_MS - 60_000);
    expect(T.coins).toBeUndefined();
    expect(T.econ).toBeUndefined();
    expect(users.find((u) => u._id === hugo)!.isModerator).toBe(true);
    for (const table of ['inventory', 'coinTx', 'activityFeed', 'cardMints'] as const) expect(await t.run((ctx) => ctx.db.query(table).collect())).toHaveLength(0);
    // Tom et Hugo restent connectés, les autres sessions sont fermées
    const sessions = await t.run((ctx) => ctx.db.query('sessions').collect());
    expect(sessions.map((s) => s.token).sort()).toEqual(['tok-hugo', 'tok-tom']);
    const st = await t.query(api.launch.status, {});
    expect(st.resetAt).toBeGreaterThan(0);
    const rep = await t.query(internal.launch.resetReport, {});
    expect(rep.remiseAZero.done).toBe(true);
    expect(rep.remiseAZero.counts.coinTx).toBe(954);
  });

  test('refuse de garder un compte qui n’est pas de l’équipe, ou un nom ambigu', async () => {
    const t = convexTest(schema, modules);
    await player(t, 'tom', { isAdmin: true });
    await player(t, 'hugo');
    await expect(t.mutation(internal.launch.resetAll, { confirm: 'RESET' })).rejects.toThrow(/ni admin ni modérateur/);
    expect(await t.run((ctx) => ctx.db.query('users').collect()).then((u) => u.length)).toBe(2);
  });
});

describe('ouverture 07/11 : compte à rebours et comptes pseudo', () => {
  test('aucun compte créé avant l’heure, création normale après ; l’équipe est marquée', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.launch.setLaunch, { at: Date.now() + 3_600_000 });
    expect((await t.query(api.launch.status, {})).launchAt).toBeGreaterThan(Date.now());
    await expect(t.mutation(internal.accounts.createPw, { loginKey: 'lea', displayName: 'Léa', pwHash: 's1$a$b' })).rejects.toThrow(/Le club ouvre/);
    await expect(t.mutation(internal.auth.upsertDiscordUser, { discordId: '123456789', username: 'x', displayName: 'X' })).rejects.toThrow(/Le club ouvre/);
    await t.mutation(internal.launch.setLaunch, { at: Date.now() - 1000 });
    const { token } = await t.mutation(internal.accounts.createPw, { loginKey: 'lea', displayName: 'Léa', pwHash: 's1$a$b' });
    const me = await t.query(api.users.me, { sessionToken: token });
    expect(me).toMatchObject({ displayName: 'Léa', packBalance: 15, staff: false, pwAccount: true });
    expect(me!.boostUntil! - Date.now()).toBeGreaterThan(BOOST_MS - 60_000);
    // pseudo déjà pris (accents et casse ignorés)
    await expect(t.mutation(internal.accounts.createPw, { loginKey: 'lea', displayName: 'LEA', pwHash: 's1$a$b' })).rejects.toThrow(/déjà pris/);
  });

  test('connexion pseudo : session si bon, verrou après 8 essais ratés', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.accounts.createPw, { loginKey: 'sam', displayName: 'Sam', pwHash: 's1$a$b' });
    const f = (await t.query(internal.accounts.findPw, { loginKey: 'sam' }))!;
    expect(f.pwHash).toBe('s1$a$b');
    const ok = await t.mutation(internal.accounts.pwAttempt, { userId: f.userId, ok: true });
    expect(ok.token).toMatch(/^[0-9a-f]{64}$/);
    for (let i = 0; i < 8; i++) expect((await t.mutation(internal.accounts.pwAttempt, { userId: f.userId, ok: false })).token).toBeNull();
    expect((await t.query(internal.accounts.findPw, { loginKey: 'sam' }))!.lockedUntil).toBeGreaterThan(Date.now());
  });

  test('MP de bienvenue préparé une seule fois, jamais pour un compte pseudo', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert('users', { discordId: '987654321012', username: 'zoe', displayName: 'Zoé', packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1 }));
    const first = await t.mutation(internal.discordBot.prepareDm, { userId: id });
    expect(first?.code).toMatch(/^[a-z0-9]{8}$/);
    expect(await t.mutation(internal.discordBot.prepareDm, { userId: id })).toBeNull();
    const { token } = await t.mutation(internal.accounts.createPw, { loginKey: 'max', displayName: 'Max', pwHash: 's1$a$b' });
    const me = (await t.query(api.users.me, { sessionToken: token }))!;
    expect(await t.mutation(internal.discordBot.prepareDm, { userId: me._id })).toBeNull();
  });
});

describe('ouverture 07/11 : recharge ×2 pendant 24 h', () => {
  const R = PACK_REGEN_MS;
  test('pendant le boost : un booster toutes les 2 min 30', () => {
    const t0 = 1_000_000;
    const B = t0 + BOOST_MS;
    expect(applyRegen(0, t0, t0 + R / 2 - 1, B)).toEqual({ balance: 0, regenAt: t0, nextAt: t0 + R / 2 });
    expect(applyRegen(0, t0, t0 + 3 * R, B)).toEqual({ balance: 6, regenAt: t0 + 3 * R, nextAt: t0 + 3.5 * R });
  });
  test('à cheval sur la fin du boost, puis vitesse normale ; sans boost : inchangé', () => {
    const t0 = 1_000_000;
    const B = t0 + 0.75 * R; // 1,5 booster « effectif » avant la fin du boost
    // à B + 0,5 R : effectif = 1,5 R + 0,5 R = 2 R → 2 boosters, le 2e arrivé à B + 0,5 R
    expect(applyRegen(0, t0, B + 0.5 * R, B)).toEqual({ balance: 2, regenAt: B + 0.5 * R, nextAt: B + 1.5 * R });
    // 1er booster à t0 + R/2 (en boost) ; le 2e chevauche : 0,25 R réel en boost (= 0,5 R) + 0,5 R après
    expect(applyRegen(0, t0, t0 + R / 2, B).nextAt).toBe(B + 0.5 * R);
    expect(applyRegen(0, t0, t0 + 2.5 * R, 0)).toEqual(applyRegen(0, t0, t0 + 2.5 * R));
    expect(applyRegen(0, t0, t0 + 2.5 * R, t0 - 5)).toEqual({ balance: 2, regenAt: t0 + 2 * R, nextAt: t0 + 3 * R });
    expect(applyRegen(PACK_CAP, t0, t0 + 5, B).nextAt).toBeNull();
  });
});
