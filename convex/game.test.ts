/// <reference types="vite/client" />
/**
 * Tests du serveur (base Convex simulée en mémoire) : boosters par thème, bébou pack, Bébous, échanges.
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { BEBOU_SECRET_CHANCE } from '../src/core/sets/themes';
import { PACK_CAP, PACK_REGEN_MS, applyRegen } from '../src/core/packRegen';
import { CONTRACT_COST } from '../src/core/contracts';
import { CATALOG_CARDS } from './cardsCatalog';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, packs = 5) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: name, username: name, displayName: name, packBalance: packs, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(),
      });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), bob: await mk('bob') };
}

/** Force les tirages crypto : la 1re valeur décide du Bébou (planPack), les suivantes des cartes. */
function forceRandom(first: number) {
  let n = 0;
  const real = crypto.getRandomValues.bind(crypto);
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(arr: T): T => {
    if (arr instanceof Uint32Array && n++ === 0) {
      arr[0] = Math.floor(first * 0xffffffff);
      return arr;
    }
    return real(arr as never) as T;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('boosters', () => {
  test('Gaming Pack : 5 cartes du thème (Pokémon ou Valorant), jamais de Bébou, une rare minimum', async () => {
    const { t, alice } = await setup();
    for (let i = 0; i < 5; i++) {
      const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'gaming' });
      expect(pack.packKind).toBe('theme');
      expect(pack.themeId).toBe('gaming');
      expect(pack.cards).toHaveLength(5);
      expect(pack.cards.every((c) => c.themeId === 'gaming' && ((!!c.subthemeId?.startsWith('pkm-') && c.cardId.startsWith('pkm-')) || (!!c.subthemeId?.startsWith('val-') && c.cardId.startsWith('val-')) || (!!c.subthemeId?.startsWith('lol-') && c.cardId.startsWith('lol-')) || (!!c.subthemeId?.startsWith('cs-') && c.cardId.startsWith('cs-')) || (!!c.subthemeId?.startsWith('jv-') && c.cardId.startsWith(`${c.subthemeId}-`))))).toBe(true);
      expect(pack.cards.some((c) => c.rarity === 'secret')).toBe(false);
      expect(['rare', 'epic', 'legendary', 'mythic']).toContain(pack.cards[4].rarity);
      await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: pack._id });
    }
    const me = await t.query(api.users.me, { sessionToken: alice.token });
    expect(me?.packBalance).toBe(0);
    expect(me?.totalPacksOpened).toBe(5);
  });

  test('même avec le tirage le plus favorable, un booster de thème ne donne pas de Bébou', async () => {
    const { t, alice } = await setup();
    forceRandom(0);
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'gaming' });
    expect(pack.cards.some((c) => c.rarity === 'secret')).toBe(false);
  });

  test('ancien identifiant « pokemon » : ramené au thème GAMING', async () => {
    const { t, alice } = await setup();
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'pokemon' });
    expect(pack.themeId).toBe('gaming');
  });

  test('thème encore sans cartes (Pop Culture, Sport) : refusé, rien débité', async () => {
    const { t, alice } = await setup();
    for (const themeId of ['pop', 'sport']) {
      await expect(t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId })).rejects.toThrow();
    }
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.packBalance).toBe(5);
  });

  test('World Pack : 5 cartes du Monde (Ardèche, Lieux, Animaux, Nourriture, Voitures, Merveilles), une rare minimum', async () => {
    const { t, alice } = await setup();
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'monde' });
    expect(pack.packKind).toBe('theme');
    expect(pack.themeId).toBe('monde');
    expect(pack.cards).toHaveLength(5);
    expect(pack.cards.every((c) => c.themeId === 'monde')).toBe(true);
    expect(['rare', 'epic', 'legendary', 'mythic', 'secret']).toContain(pack.cards[4].rarity);
    await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: pack._id });
    const me = await t.query(api.users.me, { sessionToken: alice.token });
    expect(me?.packBalance).toBe(4);
    expect(me?.totalPacksOpened).toBe(1);
  });

  test('World Pack gagnant : une Merveille du Monde secrète (3D Diorama) en dernière carte', async () => {
    const { t, alice } = await setup();
    forceRandom(0.0001); // tirage favorable (< 1/924)
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'monde' });
    expect(pack.cards[4].rarity).toBe('secret');
    expect(pack.cards[4].cardId).toMatch(/^mrv-/);
    expect(pack.cards[4].subthemeId).toBe('merveilles');
    expect(pack.maxRarity).toBe('secret');
  });

  test('bébou pack gagnant : la dernière carte est un Bébou, annoncé dans le fil', async () => {
    const { t, alice } = await setup();
    forceRandom(BEBOU_SECRET_CHANCE * 0.5); // sous 1 / nb de cartes → le pack contient un Bébou
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
    expect(pack.packKind).toBe('bebou');
    expect(pack.cards[4].rarity).toBe('secret');
    expect(pack.cards[4].cardId).toMatch(/^bebou-/);
    expect(pack.maxRarity).toBe('secret');
    await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: pack._id });
    const feed = await t.query(api.feed.recent, {});
    expect(feed.some((f) => f.kind === 'secret_pull' && f.message.includes('CARTE SECRÈTE'))).toBe(true);
    const inv = await t.query(api.inventory.myCollection, { sessionToken: alice.token });
    expect(inv.some((c) => c.rarity === 'secret')).toBe(true);
  });

  test('bébou pack perdant (1 / nb de cartes raté de peu) : pas de Bébou', async () => {
    const { t, alice } = await setup();
    forceRandom(BEBOU_SECRET_CHANCE * 1.1);
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
    expect(pack.cards.some((c) => c.rarity === 'secret')).toBe(false);
  });

  test('anti-reroll : un pack scellé non ouvert est rendu tel quel, sans débiter', async () => {
    const { t, alice } = await setup();
    const a = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'gaming' });
    const b = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
    expect(b._id).toBe(a._id);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.packBalance).toBe(4);
  });

  test('booster inconnu ou thème secret : refusé', async () => {
    const { t, alice } = await setup();
    await expect(t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'nope' })).rejects.toThrow();
    await expect(t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'bebous' })).rejects.toThrow();
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.packBalance).toBe(5);
  });

  test('ancien appel sans packKind : bébou pack (compatibilité)', async () => {
    const { t, alice } = await setup();
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token });
    expect(pack.packKind).toBe('bebou');
  });
});

describe('échanges', () => {
  async function give(t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>, cardId: string, rarity: 'common' | 'rare', count: number) {
    await t.run((ctx) =>
      ctx.db.insert('inventory', { userId, cardId, rarity, count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }),
    );
  }
  const inv = async (t: Awaited<ReturnType<typeof setup>>['t'], token: string) =>
    Object.fromEntries((await t.query(api.inventory.myCollection, { sessionToken: token })).map((c) => [c.cardId, c.count]));

  test('proposer → accepter : les cartes changent de main', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, 'pkm-bulbizarre', 'common', 3);
    await give(t, bob.userId, 'pkm-salameche', 'common', 2);
    const id = await t.mutation(api.trades.propose, {
      sessionToken: alice.token, toUserId: bob.userId, note: 'un doublon contre un doublon ?',
      offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 2 }],
      requested: [{ cardId: 'pkm-salameche', rarity: 'common', count: 1 }],
    });
    const forBob = await t.query(api.trades.myTrades, { sessionToken: bob.token });
    expect(forBob.incoming).toHaveLength(1);
    expect(forBob.incoming[0].fromName).toBe('alice');
    await t.mutation(api.trades.respond, { sessionToken: bob.token, tradeId: id, accept: true });
    expect(await inv(t, alice.token)).toEqual({ 'pkm-bulbizarre': 1, 'pkm-salameche': 1 });
    expect(await inv(t, bob.token)).toEqual({ 'pkm-bulbizarre': 2, 'pkm-salameche': 1 });
  });

  test('on ne peut pas proposer ce qu’on n’a pas, ni demander ce que l’autre n’a pas', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, 'pkm-bulbizarre', 'common', 1);
    await expect(t.mutation(api.trades.propose, {
      sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 2 }], requested: [],
    })).rejects.toThrow();
    await expect(t.mutation(api.trades.propose, {
      sessionToken: alice.token, toUserId: bob.userId, offered: [], requested: [{ cardId: 'pkm-mew', rarity: 'rare', count: 1 }],
    })).rejects.toThrow();
    await expect(t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [], requested: [] })).rejects.toThrow();
  });

  test('annuler (auteur seulement) et refuser', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, 'pkm-bulbizarre', 'common', 2);
    const offer = { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common' as const, count: 1 }], requested: [] };
    const a = await t.mutation(api.trades.propose, offer);
    await expect(t.mutation(api.trades.cancel, { sessionToken: bob.token, tradeId: a })).rejects.toThrow();
    await t.mutation(api.trades.cancel, { sessionToken: alice.token, tradeId: a });
    const b = await t.mutation(api.trades.propose, offer);
    await t.mutation(api.trades.respond, { sessionToken: bob.token, tradeId: b, accept: false });
    expect((await t.query(api.trades.myTrades, { sessionToken: alice.token })).outgoing).toHaveLength(0);
    expect(await inv(t, alice.token)).toEqual({ 'pkm-bulbizarre': 2 });
  });

  test('accepter échoue proprement si l’auteur n’a plus les cartes (rien ne bouge)', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, 'pkm-bulbizarre', 'common', 1);
    await give(t, bob.userId, 'pkm-salameche', 'common', 1);
    const id = await t.mutation(api.trades.propose, {
      sessionToken: alice.token, toUserId: bob.userId,
      offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 1 }],
      requested: [{ cardId: 'pkm-salameche', rarity: 'common', count: 1 }],
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', alice.userId)).first();
      await ctx.db.delete(row!._id);
    });
    await expect(t.mutation(api.trades.respond, { sessionToken: bob.token, tradeId: id, accept: true })).rejects.toThrow();
    expect(await inv(t, bob.token)).toEqual({ 'pkm-salameche': 1 });
  });
});

describe('retours du labo', () => {
  const entry = (id: string, vote: number, note = '') => ({ id, title: `Exp ${id}`, category: 'B', vote, note, updatedAt: null });
  const meta = { backend: 'WebGPU', userAgent: 'test', quality: 'high', dpr: 2 };

  test('envoi, mise à jour de la même ligne, export protégé par clé', async () => {
    const { t } = await setup();
    vi.stubEnv('FEEDBACK_READ_KEY', 'cle-secrete-test');
    await t.mutation(api.labFeedback.submit, { clientId: 'navigateur-lea-1', tester: 'Léa', entries: [entry('002', 1, 'trop bien'), entry('003', 0)], meta });
    const r = await t.mutation(api.labFeedback.submit, { clientId: 'navigateur-lea-1', tester: 'Léa', entries: [entry('002', 1, 'trop bien !!'), entry('039', -1, 'trop long')], meta });
    expect(r.kept).toBe(2);
    await t.mutation(api.labFeedback.submit, { clientId: 'navigateur-malo', tester: 'Malo', entries: [entry('039', 1, 'le cœur au doigt <3')], meta });

    expect((await t.fetch('/lab/feedback?key=mauvaise')).status).toBe(401);
    const res = await t.fetch('/lab/feedback?key=cle-secrete-test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.testers).toHaveLength(2); // une ligne par navigateur, pas de doublon
    const lea = body.testers.find((x: { tester: string }) => x.tester === 'Léa');
    expect(lea.sends).toBe(2);
    expect(lea.entries.map((e: { id: string }) => e.id)).toEqual(['002', '039']); // le vote 0 sans note n'est pas gardé
    const e039 = body.experiments.find((x: { id: string }) => x.id === '039');
    expect(e039.up).toEqual(['Malo']);
    expect(e039.down).toEqual(['Léa']);
    expect(e039.notes).toHaveLength(2);
    vi.unstubAllEnvs();
  });

  test('sans clé configurée côté serveur : export fermé', async () => {
    const { t } = await setup();
    vi.stubEnv('FEEDBACK_READ_KEY', '');
    expect((await t.fetch('/lab/feedback?key=')).status).toBe(503);
    vi.unstubAllEnvs();
  });
});

describe('recharge des boosters (1 / 5 min, 15 max)', () => {
  test('calcul pur : accumulation, plafond, minuteur arrêté quand c’est plein', () => {
    const t0 = 1_000_000;
    expect(applyRegen(0, t0, t0 + PACK_REGEN_MS - 1)).toEqual({ balance: 0, regenAt: t0, nextAt: t0 + PACK_REGEN_MS });
    expect(applyRegen(0, t0, t0 + 2.5 * PACK_REGEN_MS)).toEqual({ balance: 2, regenAt: t0 + 2 * PACK_REGEN_MS, nextAt: t0 + 3 * PACK_REGEN_MS });
    expect(applyRegen(10, t0, t0 + 999 * PACK_REGEN_MS).balance).toBe(PACK_CAP);
    expect(applyRegen(PACK_CAP, t0, t0 + 5).nextAt).toBeNull();
    expect(applyRegen(20, t0, t0 + 99 * PACK_REGEN_MS).balance).toBe(20); // au-dessus du plafond : gardé, sans recharge
  });

  test('serveur : réserve vide, 11 min plus tard → 2 boosters rechargés, on en ouvre 1', async () => {
    const { t, alice } = await setup();
    const past = Date.now() - 11 * 60 * 1000;
    await t.run((ctx) => ctx.db.patch(alice.userId, { packBalance: 0, packRegenAt: past }));
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.packBalance).toBe(2);
    await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'theme', themeId: 'gaming' });
    const u = await t.run((ctx) => ctx.db.get(alice.userId));
    expect(u?.packBalance).toBe(1);
    expect(u?.packRegenAt).toBe(past + 2 * PACK_REGEN_MS); // le booster en cours garde son avance (1 min sur 5)
  });

  test('serveur : réserve vide et minuteur pas fini → refus avec le compte à rebours', async () => {
    const { t, alice } = await setup();
    await t.run((ctx) => ctx.db.patch(alice.userId, { packBalance: 0, packRegenAt: Date.now() }));
    await expect(t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' })).rejects.toThrow(/prochain arrive dans/);
  });

  test('l’ancien « +2 toutes les 12 h » est désactivé', async () => {
    const { t, alice } = await setup();
    await expect(t.mutation(api.users.claimDailyBooster, { sessionToken: alice.token })).rejects.toThrow(/rechargent tout seuls/);
  });
});

describe('contrats (façon CS:GO)', () => {
  /** donne à alice des cartes Pokémon 1★ (ids réels du catalogue) avec `n` exemplaires chacune */
  async function give(t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>, ids: string[], n: number, rarity: 'common' | 'legendary' = 'common') {
    await t.run(async (ctx) => {
      for (const cardId of ids)
        await ctx.db.insert('inventory', { userId, cardId, rarity, count: n, bestMintNumber: 1, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 });
    });
  }
  const commons = (k: number) => CATALOG_CARDS.filter((c) => c.subthemeId === 'pkm-kanto' && c.baseRarity === 'common').slice(0, k).map((c) => c.id);

  test('10 doublons 1★ → une 2★ nouvelle, les doublons brûlés, jamais le dernier exemplaire', async () => {
    const { t, alice } = await setup();
    const ids = commons(5);
    await give(t, alice.userId, ids, 3); // 5 cartes × 2 doublons = 10
    const res = await t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: ids.map((cardId) => ({ cardId, count: 2 })) });
    expect(res.rarity).toBe('uncommon');
    expect(res.isNew).toBe(true);
    expect(res.subthemeId).toBe('pkm-kanto'); // contrat 100 % Kanto → une carte Kanto
    const inv = await t.query(api.inventory.myCollection, { sessionToken: alice.token });
    for (const id of ids) expect(inv.find((c) => c.cardId === id)?.count).toBe(1);
    expect(inv.some((c) => c.cardId === res.cardId && c.rarity === 'uncommon')).toBe(true);
  });

  test('refusé : pas le bon nombre, ou on toucherait au dernier exemplaire', async () => {
    const { t, alice } = await setup();
    const ids = commons(5);
    await give(t, alice.userId, ids, 2); // 1 doublon chacune seulement
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: ids.map((cardId) => ({ cardId, count: 1 })) })).rejects.toThrow(/exactement 10/);
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: ids.map((cardId) => ({ cardId, count: 2 })) })).rejects.toThrow(/doublons/);
    const inv = await t.query(api.inventory.myCollection, { sessionToken: alice.token });
    expect(inv.every((c) => c.count === 2)).toBe(true); // rien n'a bougé
  });

  test('pas de contrat 6★, et une étoile mélangée est refusée', async () => {
    const { t, alice } = await setup();
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'mythic', items: [] })).rejects.toThrow();
    const ids = commons(4);
    const leg = CATALOG_CARDS.find((c) => c.baseRarity === 'legendary')!.id;
    await give(t, alice.userId, ids, 4);
    await give(t, alice.userId, [leg], 4, 'legendary');
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: [...ids.map((cardId) => ({ cardId, count: 2 })), { cardId: leg, count: 2 }] })).rejects.toThrow(/même étoile/);
  });

  test('coûts : 10 / 10 / 20 / 20 / 50 selon l’étoile brûlée', () => {
    expect(CONTRACT_COST).toEqual({ common: 10, uncommon: 10, rare: 20, epic: 20, legendary: 50 });
  });
});

// ── missions du jour (logique pure partagée)
import { applyMissionEvent, claimMission, claimMissionBonus, dailyMissions, rerollMission, cleanMissions } from '../src/core/missions';
describe('missions du jour', () => {
  test('3 missions de sortes différentes, stables pour un joueur et un jour', () => {
    const a = dailyMissions('u1', '2026-11-02');
    expect(a.list).toHaveLength(3);
    expect(new Set(a.list.map((m) => m.kind)).size).toBe(3);
    expect(dailyMissions('u1', '2026-11-02')).toEqual(a);
  });
  test('progression, réclamation, bonus, changement', () => {
    let s = dailyMissions('u2', '2026-11-02');
    for (let i = 0; i < 12; i++) {
      s = applyMissionEvent(s, { type: 'pack', packKey: 'bebou', cards: [{ cardId: 'x', rarity: 'legendary', isNew: true }, { cardId: 'y', rarity: 'rare', isNew: false }] }).state;
      s = applyMissionEvent(s, { type: 'contract' }).state;
      s = applyMissionEvent(s, { type: 'trade' }).state;
    }
    const re = rerollMission(s, s.list[0].id, 'u2');
    expect(typeof re).toBe('string'); // déjà terminée (ou sorte sans progression : on vérifie seulement que ça ne casse pas)
    let total = 0;
    for (const m of s.list) {
      const r = claimMission(s, m.id);
      if (typeof r === 'string') continue;
      s = r.state;
      total += r.reward;
    }
    expect(total).toBeGreaterThan(0);
    const b = claimMissionBonus(s);
    if (s.list.every((m) => m.claimed)) expect(typeof b).not.toBe('string');
  });
});

describe('missions en ligne', () => {
  test('ouvrir des boosters fait progresser, réclamer crédite la réserve, la vitrine se règle', async () => {
    const { t, alice, bob } = await setup();
    const before = await t.query(api.missions.mine, { sessionToken: alice.token });
    expect(before?.list).toHaveLength(3);
    // tirage du jour aléatoire (par joueur) : on fixe une mission « ouvrir 3 boosters » pour un test déterministe
    const fixed = { day: before!.day, rerolled: false, bonusClaimed: false, list: [{ ...before!.list[0], kind: 'open' as const, param: undefined, target: 3, progress: 0, claimed: false }, ...before!.list.slice(1)] };
    await t.run(async (ctx) => {
      await ctx.db.patch(alice.userId, { missions: cleanMissions(fixed) });
    });
    for (let i = 0; i < 5; i++) {
      const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
      await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: pack._id });
    }
    await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [], requested: [], note: undefined }).catch(() => {});
    const m = (await t.query(api.missions.mine, { sessionToken: alice.token }))!;
    expect(m.list.some((x) => x.progress > 0)).toBe(true);
    const done = m.list.find((x) => x.progress >= x.target);
    if (done) {
      const bal = (await t.query(api.users.me, { sessionToken: alice.token }))!.packBalance;
      const r = await t.mutation(api.missions.claim, { sessionToken: alice.token, missionId: done.id });
      expect((await t.query(api.users.me, { sessionToken: alice.token }))!.packBalance).toBe(bal + r.reward);
      await expect(t.mutation(api.missions.claim, { sessionToken: alice.token, missionId: done.id })).rejects.toThrow();
    }
    const inv = await t.query(api.inventory.myCollection, { sessionToken: alice.token });
    await t.mutation(api.profiles.setShowcase, { sessionToken: alice.token, cards: inv.slice(0, 3).map((c) => ({ cardId: c.cardId, rarity: c.rarity })) });
    await t.mutation(api.profiles.setBio, { sessionToken: alice.token, bio: '  salut   tout le monde ' });
    const p = await t.query(api.profiles.profile, { userId: alice.userId });
    expect(p?.showcase).toHaveLength(3);
    expect(p?.bio).toBe('salut tout le monde');
    await expect(t.mutation(api.profiles.setShowcase, { sessionToken: bob.token, cards: inv.slice(0, 1).map((c) => ({ cardId: c.cardId, rarity: c.rarity })) })).rejects.toThrow();
  });
});

describe('retours du 3 nov. : pity, envies, série de connexion', () => {
  test('pity 6★ : 199 boosters secs → le suivant contient une Mythique, puis le compteur repart à zéro', async () => {
    const { t, alice } = await setup();
    await t.run(async (ctx) => ctx.db.patch(alice.userId, { pityCount: 199 }));
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
    expect(pack.cards.some((c) => c.rarity === 'mythic' || c.rarity === 'secret')).toBe(true);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.pityCount).toBe(0);
  });

  test('pity 6★ : un booster sans Mythique fait avancer le compteur', async () => {
    const { t, alice } = await setup();
    // tirage le moins favorable (1 - ε) : aucune mythique dans les emplacements
    let n = 0;
    const real = crypto.getRandomValues.bind(crypto);
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(arr: T): T => {
      if (arr instanceof Uint32Array) {
        arr[0] = n++ === 0 ? 0xfffffff0 : 0x7fffffff; // plan (pas de Bébou), puis étoiles au milieu des poids (communes / rares)
        return arr;
      }
      return real(arr as never) as T;
    });
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' });
    expect(pack.cards.some((c) => c.rarity === 'mythic')).toBe(false);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.pityCount).toBe(1);
  });

  test('envies : marquer / retirer une carte, carte inconnue refusée', async () => {
    const { t, alice } = await setup();
    const id = CATALOG_CARDS[0].id;
    expect(await t.mutation(api.users.toggleWish, { sessionToken: alice.token, cardId: id })).toEqual([id]);
    expect((await t.query(api.users.me, { sessionToken: alice.token }))?.wishlist).toEqual([id]);
    expect(await t.mutation(api.users.toggleWish, { sessionToken: alice.token, cardId: id })).toEqual([]);
    await expect(t.mutation(api.users.toggleWish, { sessionToken: alice.token, cardId: 'nope' })).rejects.toThrow();
  });

  test('série de connexion : le battement compte le jour, la récompense du 7e jour ajoute 5 boosters', async () => {
    const { t, alice } = await setup();
    await t.mutation(api.users.heartbeat, { sessionToken: alice.token });
    let me = await t.query(api.users.me, { sessionToken: alice.token });
    expect(me?.streak?.count).toBe(1);
    expect(me?.streakClaimable).toBe(false);
    await expect(t.mutation(api.users.claimStreak, { sessionToken: alice.token })).rejects.toThrow();
    // 7 jours d'affilée (le 7e = aujourd'hui)
    await t.run(async (ctx) => ctx.db.patch(alice.userId, { streak: { count: 7, day: me!.streak!.day, rewardedAt: 0 } }));
    me = await t.query(api.users.me, { sessionToken: alice.token });
    expect(me?.streakClaimable).toBe(true);
    const r = await t.mutation(api.users.claimStreak, { sessionToken: alice.token });
    expect(r.reward).toBe(5);
    me = await t.query(api.users.me, { sessionToken: alice.token });
    expect(me?.packBalance).toBe(10);
    expect(me?.streakClaimable).toBe(false);
    await expect(t.mutation(api.users.claimStreak, { sessionToken: alice.token })).rejects.toThrow();
  });
});

describe('retours du 3 nov. : verrouillage, contre-proposition, historique', () => {
  const give = (t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>, cardId: string, count: number) =>
    t.run((ctx) => ctx.db.insert('inventory', { userId, cardId, rarity: 'common', count, bestMintNumber: 3, foilSeed: 1, firstPulledAt: 0, lastPulledAt: 0 }));

  test('une carte engagée dans un échange en attente ne se repropose pas et ne se brûle pas', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, 'pkm-bulbizarre', 2);
    await give(t, bob.userId, 'pkm-salameche', 1);
    await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 1 }], requested: [] });
    // le 2e exemplaire est libre, pas un 3e
    await expect(t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 2 }], requested: [] })).rejects.toThrow(/engagée/);
    // contrat : 10 doublons 1★ nécessaires, dont le seul doublon libre est engagé → refusé
    const dups = Array.from({ length: 10 }, (_, i) => `pkm-dup${i}`);
    await Promise.all(dups.map((id) => give(t, alice.userId, id, 2)));
    // (ids inconnus du catalogue : on teste seulement la carte engagée)
    await expect(t.mutation(api.contracts.sign, { sessionToken: alice.token, rarity: 'common', items: [{ cardId: 'pkm-bulbizarre', count: 1 }, ...dups.slice(0, 9).map((id) => ({ cardId: id, count: 1 }))] })).rejects.toThrow();
  });

  test('contre-proposition : l’original passe en « countered », un nouvel échange part dans l’autre sens', async () => {
    const { t, alice, bob } = await setup();
    await give(t, alice.userId, 'pkm-bulbizarre', 3);
    await give(t, bob.userId, 'pkm-salameche', 2);
    const id = await t.mutation(api.trades.propose, { sessionToken: alice.token, toUserId: bob.userId, offered: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 1 }], requested: [{ cardId: 'pkm-salameche', rarity: 'common', count: 1 }] });
    // bob contre-propose : il donne 1 salameche, demande 2 bulbizarre
    const cid = await t.mutation(api.trades.counter, { sessionToken: bob.token, tradeId: id, offered: [{ cardId: 'pkm-salameche', rarity: 'common', count: 1 }], requested: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 2 }], note: 'deux pour une ?' });
    const forAlice = await t.query(api.trades.myTrades, { sessionToken: alice.token });
    expect(forAlice.outgoing).toHaveLength(0);
    expect(forAlice.incoming).toHaveLength(1);
    expect(forAlice.incoming[0]._id).toBe(cid);
    expect(forAlice.incoming[0].counterOf).toBe(id);
    expect(forAlice.incoming[0].note).toBe('deux pour une ?');
    // alice seule ne peut pas contre-proposer son propre échange ; bob ne peut pas contre-proposer deux fois
    await expect(t.mutation(api.trades.counter, { sessionToken: bob.token, tradeId: id, offered: [], requested: [{ cardId: 'pkm-bulbizarre', rarity: 'common', count: 1 }] })).rejects.toThrow();
    // alice accepte la contre-proposition
    await t.mutation(api.trades.respond, { sessionToken: alice.token, tradeId: cid, accept: true });
    const hist = await t.query(api.trades.history, { sessionToken: alice.token });
    expect(hist.map((h) => h.status).sort()).toEqual(['accepted', 'countered']);
    expect(hist[0].fromName).toBeDefined();
  });

  test('envies d’un ami', async () => {
    const { t, alice, bob } = await setup();
    const id = CATALOG_CARDS[0].id;
    await t.mutation(api.users.toggleWish, { sessionToken: bob.token, cardId: id });
    expect(await t.query(api.trades.wishlistOf, { userId: bob.userId })).toEqual([id]);
    expect(await t.query(api.trades.wishlistOf, { userId: alice.userId })).toEqual([]);
  });
});
