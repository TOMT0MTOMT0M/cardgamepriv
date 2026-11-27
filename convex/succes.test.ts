/// <reference types="vite/client" />
/**
 * (V3, 27/11) Refonte des succès — docs/chantiers/succes.md
 *   npx vitest run convex/succes.test.ts
 * Récompenses comptées en boosters (étalon `PACK_PRICE`), paliers longs ajoutés au-dessus des échelles, paliers déjà
 * encaissés gardés (rien repris), palier ajouté au-dessus d'un succès fini réclamable ; ouvertures à gagner (aperçu ou
 * « bientôt »).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { ACHIEVEMENTS, ACHIEVEMENT_LADDERS, ACHIEVEMENT_PACKS, ACHIEVEMENT_TIERS, PACK_PRICE, achievementPacks, achievementReward, emptyEcon } from '../src/core/economy';
import { OPENINGS, OPENINGS_SOON, cosmeticsOf, openingOf, openingSoon } from '../src/core/cosmetics';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

describe('succès V3 : récompenses proportionnelles, paliers longs, ouvertures à gagner', () => {
  test('récompenses en boosters : 1 B · 3 B + 2 · 8 B + 5 · 20 B + 10 · 50 B + 20, croissantes', () => {
    expect(PACK_PRICE).toBe(250);
    expect([...ACHIEVEMENT_TIERS]).toEqual([250, 750, 2000, 5000, 12500]);
    expect([...ACHIEVEMENT_PACKS]).toEqual([0, 2, 5, 10, 20]);
    for (let i = 1; i < ACHIEVEMENT_TIERS.length; i++) {
      expect(ACHIEVEMENT_TIERS[i]).toBeGreaterThan(ACHIEVEMENT_TIERS[i - 1]);
      expect(ACHIEVEMENT_PACKS[i]).toBeGreaterThan(ACHIEVEMENT_PACKS[i - 1]);
    }
    // un palier « cosmétique » ne donne que son cosmétique (C10, inchangé)
    for (const a of ACHIEVEMENTS.filter((x) => x.cos)) expect([achievementReward(a), achievementPacks(a)], a.id).toEqual([0, 0]);
  });

  test('dans chaque échelle, la difficulté (et donc la récompense) ne baisse jamais d’un palier au suivant', () => {
    for (const l of ACHIEVEMENT_LADDERS)
      for (let i = 1; i < l.steps.length; i++) expect(l.steps[i].tier, `${l.stat} ${l.steps[i - 1].id} → ${l.steps[i].id}`).toBeGreaterThanOrEqual(l.steps[i - 1].tier);
  });

  test('paliers longs : au sommet de leur échelle, niveau 4 ou 5, pas de cosmétique, ids existants intacts', () => {
    const LONG = ['packs-7500', 'packs-10000', 'uniq-25000', 'uniq-30000', 'world-4500', 'gaming-7500', 'pop-15000', 'sport-6500', 'leg-750', 'myth-250', 'full-150', 'full-250', 'trade-250', 'burn-10000', 'burn-25000', 'streak-150', 'streak-365', 'season-podium-6', 'season-6', 'bebou-125', 'all-3000', 'games-500', 'games-1000', 'wins-250', 'roulette-10', 'coins-250k', 'coins-1m'];
    for (const id of LONG) {
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      expect(a, id).toBeDefined();
      expect(a.tier, id).toBeGreaterThanOrEqual(4);
      expect(a.cos, id).toBeUndefined();
      const l = ACHIEVEMENT_LADDERS.find((x) => x.stat === a.stat)!;
      const older = l.steps.filter((s) => !LONG.includes(s.id));
      expect(a.target, id).toBeGreaterThan(Math.max(...older.map((s) => s.target)));
    }
    // les plafonds restent atteignables (catalogue au 27/11 : 41 037 cartes, World 5 240, Gaming 8 538, Pop 19 587, Sport 7 672)
    expect(ACHIEVEMENTS.find((a) => a.id === 'all-3000')!.target).toBeLessThan(5240);
  });

  test('ouvertures à gagner : chaque ouverture gagnée par succès a son palier ; les « bientôt » n’en ont pas encore', () => {
    for (const o of OPENINGS.filter((x) => x.need)) {
      expect(ACHIEVEMENTS.some((a) => a.id === o.need), o.id).toBe(true);
      expect(openingOf(o.need!)?.id).toBe(o.id);
    }
    expect(openingOf('packs-750')?.id).toBe('retrousse');
    expect(openingOf('burn-250')?.id).toBe('fenetre');
    for (const id of OPENINGS_SOON) {
      expect(ACHIEVEMENTS.some((a) => a.id === id), id).toBe(true);
      // tant que son ouverture n'existe pas : « bientôt » ; dès qu'elle existe, plus « bientôt » (et son aperçu s'affiche)
      expect(openingSoon(id), id).toBe(!openingOf(id));
    }
    expect(openingSoon('packs-750')).toBe(false);
    expect(cosmeticsOf('packs-750').map((c) => c.kind)).toEqual(['Ouverture']); // i18n-ok
  });

  test('serveur : les paliers déjà encaissés restent acquis, les paliers ajoutés au-dessus se réclament, au nouveau barème', async () => {
    const t = convexTest(schema, modules);
    const already = ACHIEVEMENTS.filter((a) => (a.stat === 'packsOpened' && a.target <= 5000) || (a.stat === 'streak' && a.target <= 100)).map((a) => a.id);
    const { userId, token } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: 'alice', username: 'alice', displayName: 'alice', packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 7600, lastSeenAt: Date.now(),
        coins: 1000, streak: { count: 400, day: '2026-11-27', rewardedAt: 0 }, econ: { ...emptyEcon(), achievements: already },
      });
      const token = 'tok-alice';
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 30 * 86400000 });
      return { userId, token };
    });
    const r = await t.mutation(api.economy.claimAchievements, { sessionToken: token });
    expect(r.ids).toEqual(expect.arrayContaining(['packs-7500', 'streak-150', 'streak-365']));
    expect(r.ids).not.toContain('packs-10000');
    for (const id of already) expect(r.ids).not.toContain(id);
    const got = r.ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!);
    expect(r.coins).toBe(got.reduce((n, a) => n + achievementReward(a), 0));
    expect(r.packs).toBe(got.reduce((n, a) => n + achievementPacks(a), 0));
    expect(r.coins).toBeGreaterThanOrEqual(12500 + 5000 + 12500); // packs-7500 (5) + streak-150 (4) + streak-365 (5)
    const u = (await t.run((ctx) => ctx.db.get(userId)))!;
    expect(u.coins).toBe(1000 + r.coins);
    expect(u.packBalance).toBeGreaterThanOrEqual(5 + r.packs);
    expect(new Set(u.econ!.achievements)).toEqual(new Set([...already, ...r.ids]));
    // une seconde fois : seulement « Pièces gagnées » débloqué par ces pièces (comme avant), jamais un palier déjà payé
    const r2 = await t.mutation(api.economy.claimAchievements, { sessionToken: token });
    for (const id of r2.ids) {
      expect(ACHIEVEMENTS.find((a) => a.id === id)!.stat, id).toBe('coinsEarned');
      expect([...already, ...r.ids]).not.toContain(id);
    }
    await expect(t.mutation(api.economy.claimAchievements, { sessionToken: token })).rejects.toThrow();
  });
});
