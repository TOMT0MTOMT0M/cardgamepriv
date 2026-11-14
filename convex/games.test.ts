/// <reference types="vite/client" />
/**
 * Tests de l'économie et de l'espace Jeux (base Convex simulée en mémoire).
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS } from './cardsCatalog';
import { CARD_VALUE, calendarReward, CALENDAR_MONTH_TOTAL } from '../src/core/economy';
import { betProblem, nextRouletteDraw, parisHour, potsBalanced, royaleResult, rouletteSlot } from '../src/core/games';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob']) {
  const t = convexTest(schema, modules);
  const out: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of names)
    out[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: name, username: name, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), coins: 1000,
      });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, u: out };
}

const give = (t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>, cardId: string, rarity: string, count: number) =>
  t.run(async (ctx) => {
    await ctx.db.insert('inventory', { userId, cardId, rarity: rarity as never, count, bestMintNumber: 7, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
  });

const coins = (t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(userId))!.coins ?? 0);
const inv = (t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>) => t.run(async (ctx) => ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', userId)).collect());

afterEach(() => vi.restoreAllMocks());

describe('règles pures', () => {
  test('table de valeur, calendrier, side pots à ±5 %', () => {
    expect(CARD_VALUE).toMatchObject({ common: 5, uncommon: 15, rare: 40, epic: 100, legendary: 300, mythic: 1000, secret: 5000 });
    expect(calendarReward(1)).toEqual({ coins: 50, packs: 0 });
    expect(calendarReward(7).coins).toBe(220); // (50 + 60) × 2
    expect(calendarReward(29).coins).toBe(330);
    expect(calendarReward(30)).toEqual({ coins: 1000, packs: 51 });
    expect(CALENDAR_MONTH_TOTAL).toBe(7050);
    expect(potsBalanced({ coins: 100, cards: [] }, { coins: 105, cards: [] })).toBe(true);
    expect(potsBalanced({ coins: 100, cards: [] }, { coins: 106, cards: [] })).toBe(false);
    expect(potsBalanced({ coins: 0, cards: [] }, { coins: 0, cards: [] })).toBe(true);
  });

  test('roulette : tirages à 10 h et 20 h, heure de Paris (heure d’hiver et d’été)', () => {
    expect(parisHour(Date.UTC(2026, 10, 3, 0, 30))).toBe(1); // hiver : UTC+1
    expect(parisHour(Date.UTC(2026, 6, 3, 0, 30))).toBe(2); // été : UTC+2
    // hiver : 10 h Paris = 9 h UTC, 20 h Paris = 19 h UTC
    expect(new Date(nextRouletteDraw(Date.UTC(2026, 10, 3, 7, 0))).toISOString()).toBe('2026-11-03T09:00:00.000Z');
    expect(new Date(nextRouletteDraw(Date.UTC(2026, 10, 3, 9, 30))).toISOString()).toBe('2026-11-03T19:00:00.000Z');
    expect(new Date(nextRouletteDraw(Date.UTC(2026, 10, 3, 19, 30))).toISOString()).toBe('2026-11-04T09:00:00.000Z');
    // été : 10 h Paris = 8 h UTC
    expect(new Date(nextRouletteDraw(Date.UTC(2026, 6, 3, 6, 0))).toISOString()).toBe('2026-07-03T08:00:00.000Z');
    expect(rouletteSlot(Date.UTC(2026, 10, 4, 9, 0))).toBe('2026-11-04 · 10 h');
  });

  test('roulette : grille tarifaire (36 numéros, 1 à 3, pièces ou cartes 4★-6★)', () => {
    const none = new Set<number>();
    const card = (rarity: string, count: number) => ({ coins: 0, cards: [{ cardId: 'x', rarity: rarity as never, count }] });
    expect(betProblem([1], { coins: 300, cards: [] }, none, 0)).toBeNull();
    expect(betProblem([1], card('epic', 10), none, 0)).toBeNull();
    expect(betProblem([1, 2], card('legendary', 1), none, 0)).toBeNull();
    expect(betProblem([1, 2], { coins: 600, cards: [] }, none, 0)).toBeNull();
    expect(betProblem([1, 2, 3], card('legendary', 2), none, 0)).toBeNull();
    expect(betProblem([1, 2, 3], card('mythic', 1), none, 0)).toBeNull();
    expect(betProblem([1, 2, 3], { coins: 900, cards: [] }, none, 0)).toBeNull();
    expect(betProblem([1], { coins: 200, cards: [] }, none, 0)).toMatch(/300 pièces/);
    expect(betProblem([1], card('rare', 10), none, 0)).toMatch(/4★, 5★ et 6★/);
    expect(betProblem([1, 2, 3, 4], { coins: 1200, cards: [] }, none, 0)).toMatch(/3 numéros au plus/);
    expect(betProblem([37], { coins: 300, cards: [] }, none, 0)).toMatch(/1 à 36/);
    expect(betProblem([5], { coins: 300, cards: [] }, new Set([5]), 0)).toMatch(/déjà pris/);
    expect(betProblem([6], { coins: 300, cards: [] }, none, 1)).toMatch(/déjà misé/);
  });

  test('battle royale : ex æquo → cartes partagées au hasard entre eux seulement', () => {
    const c = (r: string) => ({ cardId: 'x', cardName: 'x', rarity: r as never, mintNumber: 1, foilSeed: 1 });
    const packs = [[c('mythic'), c('common')], [c('legendary'), c('uncommon')], [c('common'), c('common')]];
    const res = royaleResult(packs, Math.random);
    expect(res.stars).toEqual([7, 7, 2]);
    expect(res.winners).toEqual([0, 1]);
    expect(res.awarded[2]).toHaveLength(0);
    expect(res.awarded[0].length + res.awarded[1].length).toBe(6);
  });
});

describe('sources de pièces', () => {
  test('ouvrir un booster rapporte 10 à 40 pièces (bébou pack)', async () => {
    const { t, u } = await setup();
    const p = await t.mutation(api.packs.preparePack, { sessionToken: u.alice.token, packKind: 'bebou' });
    await t.mutation(api.packs.revealPack, { sessionToken: u.alice.token, packId: p._id });
    const gain = (await coins(t, u.alice.userId)) - 1000;
    expect(gain).toBeGreaterThanOrEqual(10);
    expect(gain).toBeLessThanOrEqual(40);
  });

  test('calendrier : une fois par jour', async () => {
    const { t, u } = await setup();
    const r = await t.mutation(api.economy.claimCalendar, { sessionToken: u.alice.token });
    expect(r.coins).toBe(50);
    expect(await coins(t, u.alice.userId)).toBe(1050);
    await expect(t.mutation(api.economy.claimCalendar, { sessionToken: u.alice.token })).rejects.toThrow(/déjà/);
  });

  test('brûlage : doublons seulement, jamais de secrète, valeur de la table', async () => {
    const { t, u } = await setup();
    const epic = CATALOG_CARDS.find((c) => c.baseRarity === 'epic')!;
    const bebou = CATALOG_CARDS.find((c) => c.baseRarity === 'secret')!;
    await give(t, u.alice.userId, epic.id, 'epic', 3);
    await give(t, u.alice.userId, bebou.id, 'secret', 2);
    await expect(t.mutation(api.economy.burn, { sessionToken: u.alice.token, items: [{ cardId: epic.id, rarity: 'epic', count: 3 }] })).rejects.toThrow(/⟦(contracts\.5|economy\.13)[⟧{]/);
    await expect(t.mutation(api.economy.burn, { sessionToken: u.alice.token, items: [{ cardId: bebou.id, rarity: 'secret', count: 1 }] })).rejects.toThrow(/⟦(economy\.11)[⟧{]/);
    const r = await t.mutation(api.economy.burn, { sessionToken: u.alice.token, items: [{ cardId: epic.id, rarity: 'epic', count: 2 }] });
    expect(r.coins).toBe(200);
    expect((await inv(t, u.alice.userId)).find((c) => c.cardId === epic.id)?.count).toBe(1);
  });

  test('complétion : 5 pièces × cartes de l’album, payée une seule fois', async () => {
    const { t, u } = await setup();
    // le plus petit album (famille Jeux vidéo)
    const bySub = new Map<string, typeof CATALOG_CARDS>();
    for (const c of CATALOG_CARDS) if (c.themeId !== 'bebous') bySub.set(c.subthemeId, [...(bySub.get(c.subthemeId) ?? []), c]);
    const [, cards] = [...bySub].sort((a, b) => a[1].length - b[1].length)[0];
    for (const c of cards) await give(t, u.alice.userId, c.id, c.baseRarity, 1);
    const r = await t.mutation(api.economy.claimCompletions, { sessionToken: u.alice.token });
    expect(r.coins).toBeGreaterThanOrEqual(cards.length * 5);
    await expect(t.mutation(api.economy.claimCompletions, { sessionToken: u.alice.token })).rejects.toThrow(/⟦(economy\.3)[⟧{]/);
  });

  test('mission du jour : boosters ET pièces', async () => {
    const { t, u } = await setup();
    const m = (await t.query(api.missions.mine, { sessionToken: u.alice.token }))!;
    await t.run(async (ctx) => {
      await ctx.db.patch(u.alice.userId, { missions: { day: m.day, rerolled: false, bonusClaimed: false, list: m.list.map((x) => ({ ...x, progress: x.target })) } });
    });
    const r = await t.mutation(api.missions.claim, { sessionToken: u.alice.token, missionId: m.list[0].id });
    expect(r.reward).toBeGreaterThan(0);
    expect(r.coins).toBeGreaterThanOrEqual(40);
  });
});

describe('1v1 Pack Battle', () => {
  test('pots déséquilibrés refusés ; validés des deux côtés → le gagnant rafle tout', async () => {
    const { t, u } = await setup();
    const pk = [{ kind: 'bebou' as const }, { kind: 'bebou' as const }];
    const id = await t.mutation(api.games.createDuel, { sessionToken: u.alice.token, packs: pk, stake: { coins: 200, cards: [] } });
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 100, cards: [] } });
    await expect(t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id })).rejects.toThrow(/⟦(games\.33)[⟧{]/);
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 195, cards: [] } });
    expect((await t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id })).locked).toBe(false);
    expect((await t.mutation(api.games.readyDuel, { sessionToken: u.bob.token, duelId: id })).locked).toBe(true);
    const d = (await t.query(api.games.duel, { duelId: id }))!;
    expect(d.status).toBe('done');
    expect(d.result!.packs[0]).toHaveLength(2);
    const a = await inv(t, u.alice.userId);
    const b = await inv(t, u.bob.userId);
    const total = (rows: typeof a) => rows.reduce((s, c) => s + c.count, 0);
    if (d.result!.winner === undefined) {
      expect(total(a)).toBe(10);
      expect(total(b)).toBe(10);
    } else {
      const [w, l] = d.result!.winner === 0 ? [a, b] : [b, a];
      expect(total(w)).toBe(20);
      expect(total(l)).toBe(0);
    }
    // boosters débités des deux côtés, pas de recharge en 0 s
    const left = await t.run(async (ctx) => [(await ctx.db.get(u.alice.userId))!.packBalance, (await ctx.db.get(u.bob.userId))!.packBalance]);
    expect(left).toEqual([13, 13]);
  });

  test('(V2, bulles) défi reçu puis partie jouée : pastille Jeux (gamesNoticeAt) chez les bons joueurs', async () => {
    const { t, u } = await setup(['alice', 'bob', 'carol']);
    const notice = (id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.gamesNoticeAt);
    const pk = [{ kind: 'bebou' as const }];
    const id = await t.mutation(api.games.createDuel, { sessionToken: u.alice.token, packs: pk, stake: { coins: 0, cards: [] }, invitedId: u.bob.userId });
    expect(await notice(u.bob.userId)).toBeGreaterThan(0); // défié
    expect(await notice(u.alice.userId)).toBeFalsy();
    expect(await notice(u.carol.userId)).toBeFalsy();
    const me = await t.query(api.users.me, { sessionToken: u.bob.token });
    expect(me!.gamesNoticeAt).toBeGreaterThan(0);
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 0, cards: [] } });
    await t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id });
    await t.mutation(api.games.readyDuel, { sessionToken: u.bob.token, duelId: id });
    expect(await notice(u.alice.userId)).toBeGreaterThan(0); // partie jouée
    expect(await notice(u.carol.userId)).toBeFalsy();
  });

  test('changer sa mise remet les validations à zéro', async () => {
    const { t, u } = await setup();
    const pk = [{ kind: 'bebou' as const }];
    const id = await t.mutation(api.games.createDuel, { sessionToken: u.alice.token, packs: pk, stake: { coins: 0, cards: [] } });
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 0, cards: [] } });
    await t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id });
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: [{ kind: 'theme', themeId: 'gaming' }], stake: { coins: 0, cards: [] } });
    const d = (await t.query(api.games.duel, { duelId: id }))!;
    expect(d.sides.every((s) => !s.ready)).toBe(true);
  });

  test('renvoyer la MÊME mise ne retire pas la validation d’en face (sinon les deux s’annulent à tour de rôle)', async () => {
    const { t, u } = await setup();
    const pk = [{ kind: 'bebou' as const }, { kind: 'bebou' as const }];
    const id = await t.mutation(api.games.createDuel, { sessionToken: u.alice.token, packs: pk, stake: { coins: 0, cards: [] } });
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 0, cards: [] } });
    expect((await t.mutation(api.games.readyDuel, { sessionToken: u.bob.token, duelId: id })).locked).toBe(false);
    // « Enregistrer et valider » côté Alice avec une mise identique (forme différente : themeId absent/undefined)
    await t.mutation(api.games.setDuelSide, { sessionToken: u.alice.token, duelId: id, packs: [{ kind: 'bebou', themeId: undefined }, { kind: 'bebou' }], stake: { coins: 0, cards: [] } });
    const mid = (await t.query(api.games.duel, { duelId: id }))!;
    expect(mid.sides.find((s) => s.userId === u.bob.userId)!.ready).toBe(true);
    expect((await t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id })).locked).toBe(true);
    expect((await t.query(api.games.duel, { duelId: id }))!.status).toBe('done');
  });
});

describe('Battle Royale', () => {
  test('3 joueurs minimum, 1 booster chacun, toutes les cartes au(x) gagnant(s)', async () => {
    const { t, u } = await setup(['a', 'b', 'c']);
    const id = await t.mutation(api.games.createRoyale, { sessionToken: u.a.token, pack: { kind: 'bebou' } });
    await t.mutation(api.games.joinRoyale, { sessionToken: u.b.token, royaleId: id, pack: { kind: 'theme', themeId: 'gaming' } });
    await expect(t.mutation(api.games.startRoyale, { sessionToken: u.a.token, royaleId: id })).rejects.toThrow(/au moins 3/);
    await t.mutation(api.games.joinRoyale, { sessionToken: u.c.token, royaleId: id, pack: { kind: 'bebou' } });
    await t.mutation(api.games.startRoyale, { sessionToken: u.a.token, royaleId: id });
    const r = (await t.query(api.games.royale, { royaleId: id }))!;
    expect(r.status).toBe('done');
    const counts = await Promise.all(['a', 'b', 'c'].map(async (k) => (await inv(t, u[k].userId)).reduce((s, c) => s + c.count, 0)));
    expect(counts.reduce((x, y) => x + y, 0)).toBe(15);
    for (const [i] of counts.entries()) if (!r.result!.winners.includes(i)) expect(counts[i]).toBe(0);
  });

  test('(08/11) multi-boosters : même nombre pour tous, n × 5 cartes chacun, n boosters débités, tout au gagnant', async () => {
    const { t, u } = await setup(['a', 'b', 'c']);
    await expect(t.mutation(api.games.createRoyale, { sessionToken: u.a.token, pack: { kind: 'bebou' }, packCount: 6 })).rejects.toThrow(/1 à 5/);
    const id = await t.mutation(api.games.createRoyale, { sessionToken: u.a.token, pack: { kind: 'bebou' }, packCount: 3 });
    expect((await t.query(api.games.royale, { royaleId: id }))!.packCount).toBe(3);
    // pas assez de boosters en réserve → refusé
    await t.run(async (ctx) => ctx.db.patch(u.c.userId, { packBalance: 2 }));
    await expect(t.mutation(api.games.joinRoyale, { sessionToken: u.c.token, royaleId: id, pack: { kind: 'bebou' } })).rejects.toThrow(/3 boosters/);
    await t.run(async (ctx) => ctx.db.patch(u.c.userId, { packBalance: 15 }));
    await t.mutation(api.games.joinRoyale, { sessionToken: u.b.token, royaleId: id, pack: { kind: 'theme', themeId: 'gaming' } });
    await t.mutation(api.games.joinRoyale, { sessionToken: u.c.token, royaleId: id, pack: { kind: 'bebou' } });
    const before = await t.run(async (ctx) => Promise.all(['a', 'b', 'c'].map(async (k) => (await ctx.db.get(u[k].userId))!)));
    await t.mutation(api.games.startRoyale, { sessionToken: u.a.token, royaleId: id });
    const r = (await t.query(api.games.royale, { royaleId: id }))!;
    expect(r.status).toBe('done');
    expect(r.result!.packs.map((p) => p.length)).toEqual([15, 15, 15]);
    const counts = await Promise.all(['a', 'b', 'c'].map(async (k) => (await inv(t, u[k].userId)).reduce((s, c) => s + c.count, 0)));
    expect(counts.reduce((x, y) => x + y, 0)).toBe(45);
    for (const [i] of counts.entries()) if (!r.result!.winners.includes(i)) expect(counts[i]).toBe(0);
    const after = await t.run(async (ctx) => Promise.all(['a', 'b', 'c'].map(async (k) => (await ctx.db.get(u[k].userId))!)));
    for (const [i, x] of after.entries()) expect(before[i].packBalance - x.packBalance).toBe(3);
  });

  test('(08/11) ancienne partie sans packCount = 1 booster chacun', async () => {
    const { t, u } = await setup(['a', 'b', 'c']);
    const id = await t.mutation(api.games.createRoyale, { sessionToken: u.a.token, pack: { kind: 'bebou' } });
    expect((await t.query(api.games.royale, { royaleId: id }))!.packCount).toBeUndefined();
    await t.mutation(api.games.joinRoyale, { sessionToken: u.b.token, royaleId: id, pack: { kind: 'bebou' } });
    await t.mutation(api.games.joinRoyale, { sessionToken: u.c.token, royaleId: id, pack: { kind: 'bebou' } });
    await t.mutation(api.games.startRoyale, { sessionToken: u.a.token, royaleId: id });
    expect((await t.query(api.games.royale, { royaleId: id }))!.result!.packs.map((p) => p.length)).toEqual([5, 5, 5]);
  });
});

describe('Roulette', () => {
  test('1 mise par tirage ; le pot reste si personne ne gagne ; tout au gagnant sinon', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [1, 2], stake: { coins: 300, cards: [] } })).rejects.toThrow(/600 pièces/);
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [1], stake: { coins: 300, cards: [] } });
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [2], stake: { coins: 300, cards: [] } })).rejects.toThrow(/⟦(games\.34)[⟧{]/);
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [1, 4], stake: { coins: 600, cards: [] } })).rejects.toThrow(/⟦(accounts\.2|economy\.1|games\.39)[⟧{]/);
    const leg = CATALOG_CARDS.find((c) => c.baseRarity === 'legendary')!;
    await give(t, u.bob.userId, leg.id, 'legendary', 1);
    // 2 numéros = 1 carte 5★ (le dernier exemplaire peut être misé)
    await t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [10, 11], stake: { coins: 0, cards: [{ cardId: leg.id, rarity: 'legendary', count: 1 }] } });
    expect(await coins(t, u.alice.userId)).toBe(700);
    // personne n'a le 30 → report du pot, et une nouvelle carte offerte par le site
    await t.mutation(internal.games.forceDraw, { number: 30 });
    let r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.carriedCoins).toBe(300);
    expect(r.round!.carriedCards.length).toBe(2); // la 5★ de Bob + la carte offerte du 1er tirage
    expect(r.round!.houseCards).toHaveLength(1);
    // Alice joue le 7 et gagne tout
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [7, 8], stake: { coins: 600, cards: [] } });
    await t.mutation(internal.games.forceDraw, { number: 7 });
    expect(await coins(t, u.alice.userId)).toBe(1000); // 1000 − 300 − 600 + 900
    const a = await inv(t, u.alice.userId);
    expect(a.some((c) => c.cardId === leg.id)).toBe(true);
    expect(a.reduce((s, c) => s + c.count, 0)).toBe(3);
    r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.carriedCoins).toBe(0);
    expect(r.past[0].result?.winnerName).toBe('alice');
  });

  test('ancienne manche (21 h, 100 numéros) : mises remboursées, pot conservé', async () => {
    const { t, u } = await setup();
    const leg = CATALOG_CARDS.find((c) => c.baseRarity === 'legendary')!;
    await t.run(async (ctx) => {
      await ctx.db.insert('rouletteRounds', {
        day: '2026-11-03', status: 'open', carriedCoins: 500, carriedCards: [],
        houseCards: [{ cardId: leg.id, cardName: leg.name, rarity: 'legendary', mintNumber: 1, foilSeed: 1 }],
        bets: [{ userId: u.alice.userId, name: 'alice', numbers: [50, 60, 70], coins: 300, cards: [], createdAt: 0 }],
      });
      await ctx.db.patch(u.alice.userId, { coins: 700 });
    });
    await t.mutation(internal.games.rouletteTick, {});
    expect(await coins(t, u.alice.userId)).toBe(1000);
    const r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.drawAt).toBeGreaterThan(Date.now());
    expect(r.round!.carriedCoins).toBe(500);
    expect(r.round!.carriedCards.some((c) => c.cardId === leg.id)).toBe(true);
    expect(r.round!.bets).toHaveLength(0);
  });

  test('(13/11) « tirage dans 10 min » : une seule fois par manche, pas avant la fenêtre', async () => {
    const { t } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    const open = async () => t.run(async (ctx) => (await ctx.db.query('rouletteRounds').collect()).find((x) => x.status === 'open')!);
    let r = await open();
    expect(r.warned).toBeUndefined();
    // la manche est avancée à 7 min du tirage : le passage suivant prévient (une fois)
    await t.run(async (ctx) => ctx.db.patch(r._id, { drawAt: Date.now() + 7 * 60_000 }));
    await t.mutation(internal.games.rouletteTick, {});
    r = await open();
    expect(r.warned).toBe(true);
    await t.mutation(internal.games.rouletteTick, {});
    expect((await open()).status).toBe('open');
  });
});

describe('anti-abus', () => {
  test('flux net > 5 000 → alerte dans le panneau admin, réservé aux admins', async () => {
    const { t, u } = await setup();
    await expect(t.query(api.abuse.alerts, { sessionToken: u.alice.token })).rejects.toThrow(/⟦(econLib\.14)[⟧{]/);
    await t.run(async (ctx) => {
      await ctx.db.patch(u.alice.userId, { isAdmin: true });
      await ctx.db.insert('valueFlows', { fromUserId: u.bob.userId, toUserId: u.alice.userId, value: 6000, source: 'duel', createdAt: Date.now() });
    });
    const al = await t.query(api.abuse.alerts, { sessionToken: u.alice.token });
    expect(al.some((x) => x.kind === 'flow' && x.value === 6000)).toBe(true);
  });
});
