/// <reference types="vite/client" />
/**
 * (26/11, coût Convex) Classement par différence (convex/rankInc.ts) : mêmes statistiques que la relecture complète,
 * quelle que soit la suite d'écritures (ajouts, doublons, suppressions, étoile corrigée, mutation validée après le
 * calcul), et bien moins de lectures.
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { countReads } from './reads.testlib';
import * as profiles from './profiles';
import { profileLite, statsFast, statsOf } from './profiles';
import { bestCard } from '../src/core/cosmetics';
import { incOf, saveInc } from './rankInc';
import { dropInv } from './invRev';
import { SUBTHEMES, THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

afterEach(() => {
  vi.useRealTimers();
});

/** générateur pseudo-aléatoire reproductible */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0;
    return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
  };
}

async function mkUser(t: ReturnType<typeof convexTest>, name: string) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { discordId: name, username: `${name}_d`, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: Date.now(), packRegenAt: Date.now() });
    return id;
  });
}

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'] as const;

async function add(ctx: MutationCtx, userId: Id<'users'>, cardId: string, rarity: string) {
  const row = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', cardId).eq('rarity', rarity as never)).unique();
  if (row) await ctx.db.patch(row._id, { count: row.count + 1, rev: Date.now() });
  else await ctx.db.insert('inventory', { userId, cardId, rarity: rarity as never, count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: Date.now(), lastPulledAt: Date.now(), rev: Date.now() });
}
async function remove(ctx: MutationCtx, row: Doc<'inventory'>) {
  if (row.count > 1) await ctx.db.patch(row._id, { count: row.count - 1, rev: Date.now() });
  else await dropInv(ctx, row);
}

describe('classement par différence', () => {
  // un petit sous-thème entier (pour qu'il puisse être complété), plus des cartes d'autres thèmes
  const small = SUBTHEMES.filter((s) => s.cards.length >= 3 && s.cards.length <= 12)[0];
  const others = THEMES.flatMap((x) => x.cards).filter((c) => c.subthemeId !== small?.id).slice(0, 30);
  const POOL = [...(small?.cards ?? []), ...others].map((c) => c.id);

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`mêmes statistiques que la relecture complète (suite aléatoire ${seed})`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
      const t = convexTest(schema, modules);
      const userId = await mkUser(t, `p${seed}`);
      const r = rng(seed);
      const pick = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)];
      let checks = 0, fulls = 0, deltas = 0, fullSeen = false, liteChecks = 0;
      for (let step = 0; step < 260; step++) {
        const x = r();
        // le temps avance (parfois à peine, parfois au-delà de la marge de 30 s)
        vi.advanceTimersByTime(pick([0, 3, 400, 2_000, 9_000, 16_000, 31_000, 45_000, 120_000, 600_000]));
        if (x < 0.15) {
          // calcul (comme le cron ou refreshMyRank), comparé à la relecture complète
          await t.run(async (ctx) => {
            const u = (await ctx.db.get(userId))!;
            const had = await incOf(ctx, userId);
            const { stats, inc } = await statsFast(ctx, u);
            const { stats: full, collection } = await statsOf(ctx, u);
            expect(stats).toEqual(full);
            // (v2.1.32, piste 3) profil sans relire la collection : mêmes statistiques, thèmes et meilleur drop
            const lite = await profileLite(ctx, u);
            if (lite) {
              liteChecks++;
              const ids = new Set(collection.map((c) => c.cardId));
              expect(lite.stats).toEqual(full);
              expect(lite.themes).toEqual(THEMES.map((th) => ({ id: th.id, have: th.cards.reduce((a, c) => a + (ids.has(c.id) ? 1 : 0), 0), total: th.cards.length })));
              const best = bestCard(collection);
              expect(lite.top ? [lite.top.cardId, lite.top.rarity, lite.top.bestMintNumber] : null).toEqual(best ? [best.cardId, best.rarity, best.bestMintNumber] : null);
            }
            if (had && inc && inc.full === had.inc.full) deltas++;
            else fulls++;
            if (full.fullSubthemes > 0) fullSeen = true;
            await saveInc(ctx, userId, inc);
          });
          checks++;
        } else if (x < 0.2) {
          // mutation partie AVANT le dernier calcul et validée après : son horloge (rev) est dans le passé
          const back = pick([1_000, 8_000, 14_000, 20_000]);
          vi.setSystemTime(Date.now() - back);
          await t.run(async (ctx) => {
            const rows = await ctx.db.query('inventory').withIndex('by_user_card_rarity',(q) => q.eq('userId', userId)).collect();
            if (rows.length && r() < 0.5) await remove(ctx, pick(rows));
            else await add(ctx, userId, pick(POOL), pick(RARITIES));
          });
          vi.setSystemTime(Date.now() + back + 1);
        } else if (x < 0.32) {
          // retrait (doublon ou dernier exemplaire)
          await t.run(async (ctx) => {
            const rows = await ctx.db.query('inventory').withIndex('by_user_card_rarity',(q) => q.eq('userId', userId)).collect();
            if (rows.length) await remove(ctx, pick(rows));
          });
        } else if (x < 0.36) {
          // étoile corrigée par une migration : supprimée puis recréée (convex/migrations.ts, resyncRarities)
          await t.run(async (ctx) => {
            const rows = await ctx.db.query('inventory').withIndex('by_user_card_rarity',(q) => q.eq('userId', userId)).collect();
            if (!rows.length) return;
            const row = pick(rows);
            const want = pick(RARITIES.filter((z) => z !== row.rarity));
            const twin = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', row.cardId).eq('rarity', want)).unique();
            if (twin) {
              await ctx.db.patch(twin._id, { count: twin.count + row.count, rev: Date.now() });
              await dropInv(ctx, row);
            } else {
              const { _id, _creationTime, ...rest } = row;
              await dropInv(ctx, row);
              await ctx.db.insert('inventory', { ...rest, rarity: want, rev: Date.now() });
            }
          });
        } else {
          // un booster : quelques cartes (souvent le petit sous-thème, pour pouvoir le compléter)
          await t.run(async (ctx) => {
            const n = 1 + Math.floor(r() * 5);
            for (let i = 0; i < n; i++) await add(ctx, userId, r() < 0.5 && small ? pick(small.cards).id : pick(POOL), r() < 0.7 ? 'common' : pick(RARITIES));
          });
        }
      }
      console.log(`[mesure rankInc] suite ${seed} : ${checks} calculs comparés (${deltas} par différence, ${fulls} complets)${fullSeen ? ', sous-thème complété vu' : ''}`);
      expect(checks).toBeGreaterThan(20);
      expect(deltas).toBeGreaterThan(checks / 2);
      expect(liteChecks).toBeGreaterThan(checks / 2);
    });
  }

  test('mesure : après un booster, le cron relit quelques lignes au lieu de la collection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
    const t = convexTest(schema, modules);
    const userId = await mkUser(t, 'gros');
    const cards = THEMES.flatMap((x) => x.cards);
    await t.run(async (ctx) => {
      for (let i = 0; i < 3000; i++) await ctx.db.insert('inventory', { userId, cardId: cards[i].id, rarity: 'common', count: 1, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 });
    });
    vi.advanceTimersByTime(3600_000);
    const first = await countReads(t as never, profiles.rankRow, { userId });
    await t.run(async (ctx) => saveInc(ctx, userId, (first.result as { inc: never }).inc));
    vi.advanceTimersByTime(10 * 60_000);
    await t.run(async (ctx) => {
      for (const c of cards.slice(2995, 3005)) await add(ctx, userId, c.id, 'common'); // 5 doublons, 5 nouvelles
    });
    vi.advanceTimersByTime(10 * 60_000);
    const second = await countReads(t as never, profiles.rankRow, { userId });
    const u = await t.run(async (ctx) => (await statsOf(ctx, (await ctx.db.get(userId))!)).stats);
    expect((second.result as { stats: unknown }).stats).toEqual(u);
    console.log(`[mesure rankInc] collection de 3 000 lignes, un booster de 10 cartes : 1er calcul ${first.reads.docs} documents (${Math.round(first.reads.bytes / 1024)} Ko), suivant ${second.reads.docs} documents (${Math.round(second.reads.bytes / 1024)} Ko)`);
    expect(first.reads.scanned.inventory).toBeGreaterThanOrEqual(3000);
    expect(second.reads.docs).toBeLessThan(40);
  });

  test('cron : personne depuis 45 min (V3, cron à 30 min) → rien relu au-delà de la présence, aucune ligne retirée', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
    const t = convexTest(schema, modules);
    const userId = await mkUser(t, 'calme');
    await t.run(async (ctx) => {
      await ctx.db.insert('presence', { userId, lastSeenAt: Date.now(), displayName: 'calme', username: 'calme_d', totalPacksOpened: 3 });
      await add(ctx, userId, THEMES[0].cards[0].id, 'common');
    });
    expect((await t.action(internal.profiles.refreshRanks, {})).saved).toBe(1);
    vi.advanceTimersByTime(50 * 60_000);
    const plan = await countReads(t as never, profiles.rankPlan, {});
    expect((plan.result as { idle: boolean }).idle).toBe(true);
    expect(plan.reads.docs).toBe(1);
    expect(await t.action(internal.profiles.refreshRanks, {})).toEqual({ saved: 0, dropped: 0 });
    expect(await t.run((ctx) => ctx.db.query('rankRows').collect())).toHaveLength(1);
  });
});
