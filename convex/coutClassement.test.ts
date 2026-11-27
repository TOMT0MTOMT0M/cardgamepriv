/// <reference types="vite/client" />
/**
 * (V3, coût Convex, piste 8 de docs/chantiers/convex-pistes.md) CRON DU CLASSEMENT toutes les 30 min (avant : 10).
 * Mesure dans la base simulée (convex-test, `reads.testlib.ts`) : une heure de soirée, 30 joueurs (300 lignes chacun),
 * 5 actifs qui ouvrent un booster toutes les 5 min. Chaque passage = `rankPlan` + `rankRow` des lignes à refaire +
 * `saveRanks`, comme `profiles.refreshRanks`. Et : un joueur actif juste avant de partir est bien recalculé au passage
 * suivant (fenêtres IDLE / LOOK de profiles.ts adaptées à 30 min et à la présence écrite toutes les 10 min).
 */
import { convexTest, type TestConvex } from 'convex-test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { countReads } from './reads.testlib';
import * as profiles from './profiles';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const CARDS = THEMES.flatMap((x) => x.cards).map((c) => c.id);

afterEach(() => {
  vi.useRealTimers();
});

// (le schéma dans le type : sans lui, les index des tables sont inconnus du contrôle de types de `convex dev`)
type T = TestConvex<typeof schema>;
type Plan = { idle: boolean; users: Array<{ id: Id<'users'>; banned: boolean; at: number; sig: string; rowSig: string }>; rows: Array<{ id: Id<'rankRows'>; userId: Id<'users'> }>; init?: unknown };

async function seed(t: T, n: number, rows: number) {
  return await t.run(async (ctx) => {
    const ids: Id<'users'>[] = [];
    for (let i = 0; i < n; i++) {
      const now = Date.now();
      const u = await ctx.db.insert('users', { discordId: `u${i}`, username: `u${i}`, displayName: `Joueur ${i}`, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 30, lastSeenAt: now, packRegenAt: now });
      await ctx.db.insert('presence', { userId: u, lastSeenAt: now, displayName: `Joueur ${i}`, username: `u${i}`, totalPacksOpened: 30 });
      for (let k = 0; k < rows; k++) await ctx.db.insert('inventory', { userId: u, cardId: CARDS[(i * 37 + k) % CARDS.length], rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: now - 86_400_000, lastPulledAt: now - 86_400_000, rev: now - 86_400_000 + k });
      ids.push(u);
    }
    return ids;
  });
}

/** un booster : 5 cartes nouvelles, compteur, présence (comme packs.ts) */
async function booster(t: T, u: Id<'users'>, k: number) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let j = 0; j < 5; j++) await ctx.db.insert('inventory', { userId: u, cardId: CARDS[(k * 5 + j + 5000) % CARDS.length], rarity: 'rare', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: now, lastPulledAt: now, rev: now });
    const usr = (await ctx.db.get(u))!;
    await ctx.db.patch(u, { totalPacksOpened: usr.totalPacksOpened + 1, lastSeenAt: now });
    const p = (await ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', u)).first())!;
    await ctx.db.patch(p._id, { lastSeenAt: now, totalPacksOpened: usr.totalPacksOpened + 1 });
  });
}

/** un passage du cron, mesuré (même logique que profiles.refreshRanks) */
const part = { plan: 0, row: 0, save: 0 };
async function pass(t: T) {
  let bytes = 0;
  const plan = await countReads<never, Plan>(t as never, profiles.rankPlan, {});
  bytes += plan.reads.bytes;
  part.plan += plan.reads.bytes;
  const p = plan.result;
  if (p.idle) return { bytes, saved: 0 };
  const live = new Set(p.users.filter((u) => !u.banned).map((u) => u.id as string));
  const drop = p.rows.filter((r) => !live.has(r.userId)).map((r) => r.id);
  const rows: unknown[] = [];
  for (const u of p.users) {
    if (u.banned) continue;
    if (!(!u.at || u.sig !== u.rowSig || Date.now() - u.at > 24 * 3600_000)) continue;
    const r = await countReads<never, Record<string, unknown> | null>(t as never, profiles.rankRow, { userId: u.id });
    bytes += r.reads.bytes;
    part.row += r.reads.bytes;    if (r.result) rows.push({ userId: u.id, ...r.result });
  }
  if (rows.length || drop.length || p.init) {
    const s = await countReads(t as never, profiles.saveRanks, { rows, drop, ...(p.init ? { init: p.init } : {}) });
    bytes += s.reads.bytes;
    part.save += s.reads.bytes;
  }
  return { bytes, saved: rows.length };
}

async function evening(cadenceMin: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T19:00:00Z'));
  const t = convexTest(schema, modules);
  const ids = await seed(t, 30, 300);
  await pass(t); // lignes de départ (hors mesure)
  part.plan = part.row = part.save = 0;
  let bytes = 0;
  let passes = 0;
  let saved = 0;
  for (let min = 1; min <= 60; min++) {
    vi.advanceTimersByTime(60_000);
    if (min % 5 === 0) for (let a = 0; a < 5; a++) await booster(t, ids[a], min + a * 100);
    if (min % cadenceMin === 0) {
      const r = await pass(t);
      bytes += r.bytes;
      saved += r.saved;
      passes++;
    }
  }
  return { bytes, passes, saved, detail: `rankPlan ${(part.plan / 1000).toFixed(0)} Ko, rankRow ${(part.row / 1000).toFixed(0)} Ko, saveRanks ${(part.save / 1000).toFixed(0)} Ko` };
}

describe('cron du classement', () => {
  test('une heure de soirée : passages toutes les 10 min contre 30 min (mesure)', async () => {
    const ten = await evening(10);
    const thirty = await evening(30);
    const ko = (b: number) => `${(b / 1000).toFixed(0)} Ko`;
    const out = [
      `toutes les 10 min : ${ten.passes} passages, ${ten.saved} lignes recalculées, ${ko(ten.bytes)} lus par heure (${ten.detail})`,
      `toutes les 30 min : ${thirty.passes} passages, ${thirty.saved} lignes recalculées, ${ko(thirty.bytes)} lus par heure (${thirty.detail})`,
    ];
    mkdirSync('.cache', { recursive: true });
    writeFileSync('.cache/cout-classement.txt', out.join('\n') + '\n');
    console.log(out.join('\n'));
    expect(thirty.bytes).toBeLessThan(ten.bytes / 2);
  }, 120_000);

  test('un joueur qui joue puis part est recalculé au passage suivant (30 min plus tard)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T19:00:00Z'));
    const t = convexTest(schema, modules);
    const [a] = await seed(t, 3, 20);
    await pass(t);
    vi.advanceTimersByTime(2 * 60_000);
    // il ouvre un booster ; sa présence ne bouge pas (déjà écrite il y a moins de 10 min : présence paresseuse)
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('inventory', { userId: a, cardId: CARDS[999], rarity: 'epic', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: now, lastPulledAt: now, rev: now });
    });
    vi.advanceTimersByTime(28 * 60_000);
    const r = await pass(t);
    expect(r.saved).toBe(1);
    const row = await t.run(async (ctx) => (await ctx.db.query('rankRows').withIndex('by_user', (q) => q.eq('userId', a)).first())!.row as { uniques: number });
    expect(row.uniques).toBe(21);
  }, 60_000);
});
