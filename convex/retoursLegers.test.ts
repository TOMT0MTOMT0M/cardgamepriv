/// <reference types="vite/client" />
/**
 * (audit perf V3 n°17) POIDS DES RETOURS ENVOYÉS AU TÉLÉPHONE.
 *  - `games.history` : la liste n'affiche que noms, étoiles et gagnant (src/game/views/games.ts, historyPage, pareil sur
 *    `master`) ; plus de cartes tirées, de boosters misés ni d'avatars. Même forme de document (un client déjà en ligne
 *    ne casse pas) ; la partie ouverte depuis la liste est relue entière (`games.duel` / `games.royale`).
 *  - `session.get` (renvoyé à chaque écriture sur le joueur) : plus les valeurs « ancien client » de l'économie
 *    (`completions`, `achievements`) que tous ses clients recalculent ; `economy.state` (ancien client) les garde.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const size = (x: unknown) => JSON.stringify(x ?? null).length;
const AVATAR = 'https://cdn.discordapp.com/avatars/123456789012345678/abcdefabcdefabcdefabcdefabcdef12.png';

async function setup() {
  const t = convexTest(schema, modules);
  const cards = CATALOG_CARDS.slice(0, 2000);
  let k = 0;
  const card = () => {
    const c = cards[k++ % cards.length];
    return { cardId: c.id, cardName: c.name, rarity: 'rare' as const, mintNumber: 123, foilSeed: 456789 };
  };
  const pack = () => Array.from({ length: 5 }, card);
  const choice = { kind: 'theme' as const, themeId: 'pop' };
  const ids = await t.run(async (ctx) => {
    const ids: Id<'users'>[] = [];
    for (let i = 0; i < 5; i++) ids.push(await ctx.db.insert('users', { discordId: `d${i}`, username: `u${i}`, displayName: `Joueur ${i}`, packBalance: 3, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now() }));
    await ctx.db.insert('sessions', { token: 'tok', userId: ids[0], createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    for (let i = 0; i < 25; i++) {
      const sides = [0, 1 + (i % 4)].map((j) => ({ userId: ids[j], name: `Joueur ${j}`, avatarUrl: AVATAR, packs: [choice, choice, choice], stake: { coins: 100, cards: [] }, ready: true }));
      await ctx.db.insert('duels', { creatorId: ids[0], status: 'done', sides, result: { packs: [[pack(), pack(), pack()], [pack(), pack(), pack()]], stars: [12, 9], winner: 0 }, createdAt: i, resolvedAt: i + 1 });
      const players = ids.map((userId, j) => ({ userId, name: `Joueur ${j}`, avatarUrl: AVATAR, pack: choice }));
      const packs = ids.map(() => [...pack(), ...pack()]);
      await ctx.db.insert('royales', { creatorId: ids[0], status: 'done', packCount: 2, players, result: { packs, stars: [10, 8, 7, 6, 5], winners: [0], awarded: [packs.flat(), [], [], [], []] }, createdAt: i, resolvedAt: i + 1 });
    }
    return ids;
  });
  return { t, ids };
}

describe('retours allégés (audit perf V3 n°17)', () => {
  test('games.history : ce que la liste lit est là, les cartes tirées n’y sont plus', async () => {
    const { t, ids } = await setup();
    const h = await t.query(api.games.history, { sessionToken: 'tok' });
    expect(h.duels).toHaveLength(25);
    expect(h.royales).toHaveLength(25);
    const d = h.duels[0];
    // lu par historyPage : id, dates, sides[].userId / name, result.winner / stars
    expect(d.sides.map((s) => s.userId)).toContain(ids[0]);
    expect(d.sides.every((s) => typeof s.name === 'string' && s.name.length > 0)).toBe(true);
    expect(d.result?.stars).toEqual([12, 9]);
    expect(d.result?.winner).toBe(0);
    expect(d.resolvedAt).toBeTypeOf('number');
    const r = h.royales[0];
    expect(r.players).toHaveLength(5);
    expect(r.result?.winners).toEqual([0]);
    expect(r.result?.stars).toEqual([10, 8, 7, 6, 5]);
    // plus envoyé : cartes tirées, boosters misés, avatars (forme du document gardée : tableaux vides)
    expect(d.result?.packs).toEqual([]);
    expect(d.sides.every((s) => s.packs.length === 0 && !('avatarUrl' in s))).toBe(true);
    expect(r.result?.packs).toEqual([]);
    expect(r.result?.awarded).toEqual([]);
    expect(r.players.every((p) => !('avatarUrl' in p) && !!p.pack)).toBe(true);
    // poids : 441 Ko avant ce lot pour ces 25 + 25 parties
    expect(size(h)).toBeLessThan(40_000);
    // la partie ouverte depuis la liste est relue entière
    const full = await t.query(api.games.duel, { duelId: d._id });
    expect(full?.result?.packs[0]).toHaveLength(3);
    expect(full?.sides[0].avatarUrl).toBe(AVATAR);
    const fullR = await t.query(api.games.royale, { royaleId: r._id });
    expect(fullR?.result?.awarded[0].length).toBeGreaterThan(0);
  });

  test('session.get : économie sans les valeurs « ancien client », le reste identique à economy.state', async () => {
    const { t } = await setup();
    const s = await t.query(api.session.get, { sessionToken: 'tok' });
    const e = await t.query(api.economy.state, { sessionToken: 'tok' });
    expect(s?.eco).toBeDefined();
    expect(s?.eco && 'completions' in s.eco).toBe(false);
    expect(s?.eco && 'achievements' in s.eco).toBe(false);
    // ancien client (economy.state) : inchangé
    expect(e?.completions).toEqual([]);
    expect(e?.achievements?.claimable).toEqual([]);
    const { completions: _c, achievements: _a, ...rest } = e!;
    // (`weekly.resetAt` : approximation calculée à l'instant de chaque requête, à quelques ms près)
    const noReset = <T extends { weekly: { resetAt: number } }>(x: T) => ({ ...x, weekly: { ...x.weekly, resetAt: 0 } });
    expect(noReset(s!.eco)).toEqual(noReset(rest));
  });
});
