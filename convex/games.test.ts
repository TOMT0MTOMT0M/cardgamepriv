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
import { nextRouletteDraw, parisHour, potsBalanced, royaleResult, rouletteDrawDay } from '../src/core/games';

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
    expect(calendarReward(30)).toEqual({ coins: 1000, packs: 1 });
    expect(CALENDAR_MONTH_TOTAL).toBe(7050);
    expect(potsBalanced({ coins: 100, cards: [] }, { coins: 105, cards: [] })).toBe(true);
    expect(potsBalanced({ coins: 100, cards: [] }, { coins: 106, cards: [] })).toBe(false);
    expect(potsBalanced({ coins: 0, cards: [] }, { coins: 0, cards: [] })).toBe(true);
  });

  test('roulette : tirage à 21 h, heure de Paris (heure d’hiver et d’été)', () => {
    expect(parisHour(Date.UTC(2026, 10, 3, 0, 30))).toBe(1); // hiver : UTC+1
    expect(parisHour(Date.UTC(2026, 6, 3, 0, 30))).toBe(2); // été : UTC+2
    expect(new Date(nextRouletteDraw(Date.UTC(2026, 10, 3, 9, 0))).toISOString()).toBe('2026-11-03T20:00:00.000Z');
    expect(new Date(nextRouletteDraw(Date.UTC(2026, 6, 3, 9, 0))).toISOString()).toBe('2026-07-03T19:00:00.000Z');
    expect(rouletteDrawDay(Date.UTC(2026, 10, 3, 20, 30))).toBe('2026-11-04'); // après 21 h : tirage du lendemain
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
    await expect(t.mutation(api.economy.burn, { sessionToken: u.alice.token, items: [{ cardId: epic.id, rarity: 'epic', count: 3 }] })).rejects.toThrow(/doublons/);
    await expect(t.mutation(api.economy.burn, { sessionToken: u.alice.token, items: [{ cardId: bebou.id, rarity: 'secret', count: 1 }] })).rejects.toThrow(/secrètes/);
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
    await expect(t.mutation(api.economy.claimCompletions, { sessionToken: u.alice.token })).rejects.toThrow(/Aucune/);
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
    await expect(t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id })).rejects.toThrow(/±5 %/);
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

  test('changer sa mise remet les validations à zéro', async () => {
    const { t, u } = await setup();
    const pk = [{ kind: 'bebou' as const }];
    const id = await t.mutation(api.games.createDuel, { sessionToken: u.alice.token, packs: pk, stake: { coins: 0, cards: [] } });
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 0, cards: [] } });
    await t.mutation(api.games.readyDuel, { sessionToken: u.alice.token, duelId: id });
    await t.mutation(api.games.setDuelSide, { sessionToken: u.bob.token, duelId: id, packs: pk, stake: { coins: 0, cards: [] } });
    const d = (await t.query(api.games.duel, { duelId: id }))!;
    expect(d.sides.every((s) => !s.ready)).toBe(true);
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
});

describe('Roulette', () => {
  test('3 numéros minimum ; le pot reste si personne ne gagne ; tout au gagnant sinon', async () => {
    const { t, u } = await setup();
    await t.mutation(internal.games.rouletteTick, {});
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [1, 2], stake: { coins: 200, cards: [] } })).rejects.toThrow(/minimale/);
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [1, 2, 3], stake: { coins: 300, cards: [] } });
    await expect(t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [3, 4, 5], stake: { coins: 300, cards: [] } })).rejects.toThrow(/déjà pris/);
    const leg = CATALOG_CARDS.find((c) => c.baseRarity === 'legendary')!;
    await give(t, u.bob.userId, leg.id, 'legendary', 1);
    // 1 × 5★ = 300 = 3 numéros (le dernier exemplaire peut être misé)
    await t.mutation(api.games.placeBet, { sessionToken: u.bob.token, numbers: [10, 11, 12], stake: { coins: 0, cards: [{ cardId: leg.id, rarity: 'legendary', count: 1 }] } });
    expect(await coins(t, u.alice.userId)).toBe(700);
    // personne n'a le 50 → report du pot
    await t.mutation(internal.games.forceDraw, { number: 50 });
    let r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.carriedCoins).toBe(300);
    expect(r.round!.carriedCards.length).toBe(2); // la 5★ de Bob + la carte offerte du 1er tirage
    expect(r.round!.houseCards).toHaveLength(1); // nouvelle carte offerte
    // Alice joue le 7 et gagne tout
    await t.mutation(api.games.placeBet, { sessionToken: u.alice.token, numbers: [7, 8, 9], stake: { coins: 300, cards: [] } });
    await t.mutation(internal.games.forceDraw, { number: 7 });
    expect(await coins(t, u.alice.userId)).toBe(1000); // 1000 − 300 − 300 + 600
    const a = await inv(t, u.alice.userId);
    expect(a.some((c) => c.cardId === leg.id)).toBe(true);
    expect(a.reduce((s, c) => s + c.count, 0)).toBe(3);
    r = (await t.query(api.games.roulette, {}))!;
    expect(r.round!.carriedCoins).toBe(0);
    expect(r.past[0].result?.winnerName).toBe('alice');
  });
});

describe('anti-abus', () => {
  test('flux net > 5 000 → alerte dans le panneau admin, réservé aux admins', async () => {
    const { t, u } = await setup();
    await expect(t.query(api.abuse.alerts, { sessionToken: u.alice.token })).rejects.toThrow(/admins/);
    await t.run(async (ctx) => {
      await ctx.db.patch(u.alice.userId, { isAdmin: true });
      await ctx.db.insert('valueFlows', { fromUserId: u.bob.userId, toUserId: u.alice.userId, value: 6000, source: 'duel', createdAt: Date.now() });
    });
    const al = await t.query(api.abuse.alerts, { sessionToken: u.alice.token });
    expect(al.some((x) => x.kind === 'flow' && x.value === 6000)).toBe(true);
  });
});
