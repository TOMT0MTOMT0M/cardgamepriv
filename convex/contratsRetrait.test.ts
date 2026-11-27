/// <reference types="vite/client" />
/**
 * (v2.1.40) Retrait des contrats le 01/12/2026 à 0 h (Paris) — même date que la nouvelle économie (`ECON_V2_AT`).
 *   npx vitest run convex/contratsRetrait.test.ts
 * Avant : rien ne change. Après : `contracts:sign` refuse, plus de mission « contrat » tirée, la mission de la semaine
 * à cheval (lundi 30/11) comptée comme faite, succès / cosmétiques « contrat » pas gagnés invisibles.
 */
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';
import { ACHIEVEMENTS, ECON_V2_AT, achievementStats, contractsRetired, emptyEcon, visibleAchievements, visibleLadders } from '../src/core/economy';
import { BADGES, BACKGROUNDS, FRAMES, TITLES, TITLE_STYLES, cosmeticGone, statsFrom } from '../src/core/cosmetics';
import { currentMissions, dailyMissions, missionDay, rerollMission } from '../src/core/missions';
import { claimWeekly, currentWeekly, missionWeek, weeklyMissions } from '../src/core/weekly';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

const BEFORE = ECON_V2_AT - 60_000; // 30/11 23 h 59 (Paris)
const AFTER = ECON_V2_AT + 3600_000; // 01/12 1 h (Paris)
const KEYS = Array.from({ length: 400 }, (_, i) => `joueur-${i}`);

async function setup() {
  const t = convexTest(schema, modules);
  const alice = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { discordId: 'alice', username: 'alice', displayName: 'alice', packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now() });
    const token = 'tok-alice';
    await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 30 * 86400000 });
    return { userId, token };
  });
  return { t, alice };
}
async function giveCommons(t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>, ids: string[], n: number) {
  await t.run(async (ctx) => {
    for (const cardId of ids) await ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count: n, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
  });
}
const commons = (k: number) => CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').slice(0, k).map((c) => c.id);

describe('retrait des contrats au 01/12 (v2.1.40)', () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => void vi.useRealTimers());

  test('la date : 01/12/2026 0 h, heure de Paris', () => {
    expect(contractsRetired(BEFORE)).toBe(false);
    expect(contractsRetired(ECON_V2_AT)).toBe(true);
    expect(missionDay(ECON_V2_AT)).toBe('2026-12-01');
    expect(missionDay(ECON_V2_AT - 1)).toBe('2026-11-30');
    expect(missionWeek(AFTER)).toBe('2026-11-30'); // le 01/12 est un mardi : semaine à cheval
  });

  test('serveur : `sign` marche la veille, refuse avec un message clair à partir du 01/12 (rien n’est brûlé)', async () => {
    vi.setSystemTime(BEFORE - 3600_000);
    const { t, alice } = await setup();
    const ids = commons(10);
    await giveCommons(t, alice.userId, ids, 3);
    vi.setSystemTime(BEFORE);
    const ok = await t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: ids.slice(0, 5).map((cardId) => ({ cardId, count: 2 })) });
    expect(ok.rarity).toBe('uncommon');
    vi.setSystemTime(AFTER);
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: ids.slice(5).map((cardId) => ({ cardId, count: 2 })) })).rejects.toThrow(/⟦contracts\.8⟧/);
    const inv = await t.query(api.inventory.myCollection, { sessionToken: alice.token });
    for (const id of ids.slice(5)) expect(inv.find((c) => c.cardId === id && c.rarity === 'common')?.count).toBe(3);
    const u = await t.run((ctx) => ctx.db.get(alice.userId));
    expect(u?.totalContracts).toBe(1);
  });

  test('missions du jour : tirages d’avant le 01/12 intacts, plus aucune mission « contrat » ensuite (relance comprise)', () => {
    // avant : la sorte « contrat » sort toujours (le tirage n'a pas bougé)
    const before = KEYS.map((k) => dailyMissions(k, '2026-11-30'));
    expect(before.some((s) => s.list.some((m) => m.kind === 'contract'))).toBe(true);
    // même résultat via l'état du jour, à l'heure d'avant
    expect(currentMissions(undefined, KEYS[0], BEFORE)).toEqual(before[0]);
    for (const day of ['2026-12-01', '2026-12-02', '2026-12-15', '2027-01-04'])
      for (const k of KEYS) {
        const s = dailyMissions(k, day);
        expect(s.list.map((m) => m.kind)).not.toContain('contract');
        expect(new Set(s.list.map((m) => m.kind)).size).toBe(3);
        const r = rerollMission(s, s.list[0].id, k);
        expect(typeof r).not.toBe('string');
        if (typeof r !== 'string') expect(r.list.map((m) => m.kind)).not.toContain('contract');
      }
  });

  test('missions de la semaine du 30/11 : même tirage, la mission « contrat » devient « à récupérer » le 01/12, la progression reste', () => {
    const withC = KEYS.map((k) => ({ k, s: weeklyMissions(k, '2026-11-30') })).filter((x) => x.s.list.some((m) => m.kind === 'contract'));
    expect(withC.length).toBeGreaterThan(50); // ≈ 1 joueur sur 3
    const { k, s } = withC[0];
    const ci = s.list.findIndex((m) => m.kind === 'contract');
    // lundi : rien ne change
    expect(currentWeekly(undefined, k, BEFORE)).toEqual(s);
    // progression d'une autre mission enregistrée lundi
    const oi = ci === 0 ? 1 : 0;
    const saved = { ...s, list: s.list.map((m, i) => (i === oi ? { ...m, progress: 1 } : m)) };
    const after = currentWeekly(saved, k, AFTER);
    expect(after.list.map((m) => m.kind)).toEqual(s.list.map((m) => m.kind)); // pas rebattu
    expect(after.list[oi].progress).toBe(1); // progression gardée
    expect(after.list[ci].progress).toBe(after.list[ci].target); // comptée comme faite
    const r = claimWeekly(after, after.list[ci].id);
    expect(typeof r).not.toBe('string');
    if (typeof r !== 'string') expect(r.reward).toBe(s.list[ci].reward);
    // déjà réclamée : elle le reste
    const claimed = { ...s, list: s.list.map((m, i) => (i === ci ? { ...m, claimed: true } : m)) };
    expect(currentWeekly(claimed, k, AFTER)).toBe(claimed);
    // semaine suivante (lundi 07/12) : plus de mission « contrat »
    for (const key of KEYS) expect(weeklyMissions(key, '2026-12-07').list.map((m) => m.kind)).not.toContain('contract');
  });

  test('serveur : la mission « contrat » de la semaine se récupère le 01/12', async () => {
    vi.setSystemTime(BEFORE);
    const { t, alice } = await setup();
    const s = weeklyMissions(alice.userId, '2026-11-30');
    const c = s.list.find((m) => m.kind === 'contract');
    // l'id du joueur est aléatoire : on pose une semaine qui contient une mission « contrat »
    const forced = c ? s : { ...s, list: [{ id: '2026-11-30-w0', kind: 'contract' as const, target: 3, progress: 1, reward: 200, claimed: false }, ...s.list.slice(1)] };
    await t.run((ctx) => ctx.db.patch(alice.userId, { weekly: forced }));
    const mid = forced.list.find((m) => m.kind === 'contract')!.id;
    await expect(t.mutation(api.economy.claimWeekly, { sessionToken: alice.token, missionId: mid })).rejects.toThrow(/⟦weekly\.3⟧/);
    vi.setSystemTime(AFTER);
    const r = await t.mutation(api.economy.claimWeekly, { sessionToken: alice.token, missionId: mid });
    expect(r.reward).toBe(forced.list.find((m) => m.id === mid)!.reward);
  });

  test('succès : avant, les 139 ; après, ceux des contrats pas gagnés disparaissent, les gagnés restent', () => {
    const st = (n: number) => achievementStats(statsFrom([], { packsOpened: 0, tradesDone: 0, contractsSigned: n, streak: 0 }), emptyEcon());
    const contractIds = ACHIEVEMENTS.filter((a) => a.stat === 'contractsSigned').map((a) => a.id);
    expect(contractIds).toHaveLength(7);
    expect(visibleAchievements(st(0), BEFORE)).toHaveLength(ACHIEVEMENTS.length);
    expect(visibleAchievements(st(0), AFTER)).toHaveLength(ACHIEVEMENTS.length - 7);
    expect(visibleAchievements(st(7), AFTER).filter((a) => a.stat === 'contractsSigned').map((a) => a.id).sort()).toEqual(['contract-1', 'contract-3', 'contract-5']);
    // l'échelle : absente sans palier, réduite aux paliers gagnés sinon (terminée), jamais chez les amis
    const ladder = (n: number, now: number, friends = false) => visibleLadders(st(n), now, friends).find((l) => l.stat === 'contractsSigned');
    expect(ladder(0, BEFORE)?.steps).toHaveLength(7);
    expect(ladder(0, AFTER)).toBeUndefined();
    expect(ladder(7, AFTER)?.steps.map((a) => a.target)).toEqual([1, 3, 5]);
    expect(ladder(7, AFTER, true)).toBeUndefined();
    // le niveau Bébou « 100 » reste atteignable sans aucun contrat
    const profileOnly = ACHIEVEMENTS.filter((a) => !['gamesPlayed', 'gamesWon', 'rouletteWins', 'coinsEarned', 'bebouLevel', 'contractsSigned'].includes(a.stat));
    expect(profileOnly.length).toBeGreaterThanOrEqual(100);
  });

  test('cosmétiques : ceux des succès « contrat » pas gagnés ne sont plus proposés, les gagnés restent', () => {
    const ps = (n: number) => statsFrom([], { packsOpened: 0, tradesDone: 0, contractsSigned: n, streak: 0 });
    const all = [...FRAMES, ...TITLES, ...BADGES, ...BACKGROUNDS, ...TITLE_STYLES];
    const tied = all.filter((c) => c.need?.startsWith('contract-'));
    expect(tied.map((c) => c.id).sort()).toEqual(['a-neon', 'contract', 'neon', 't-contract-1', 't-contract-2', 'trame']);
    expect(tied.filter((c) => cosmeticGone(c, ps(0), BEFORE))).toHaveLength(0);
    expect(tied.filter((c) => cosmeticGone(c, ps(0), AFTER))).toHaveLength(6);
    expect(tied.filter((c) => cosmeticGone(c, ps(25), AFTER)).map((c) => c.id)).toEqual(['t-contract-2']);
    expect(all.filter((c) => !c.need?.startsWith('contract-') && cosmeticGone(c, ps(0), AFTER))).toHaveLength(0);
  });
});
