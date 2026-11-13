/// <reference types="vite/client" />
/** Événements limités (V2, 11/11) : booster du moment — tirage, dates, refus hors période, accès admin. */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { THEMES } from '../src/core/sets/themes';
import { GUARANTEED_WEIGHTS, SLOT_WEIGHTS, STAR_RARITIES } from '../src/core/dropRates';
import { checkEvent, demoEvent, eventCards, fmtLeft, liveEvent } from '../src/core/events';
import { cardPackChance, isValidPackRequest, rollPackEx, type PackRequest } from '../src/core/packRoll';
import { PITY_LIMIT } from '../src/core/pity';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
const H = 3_600_000;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** un sous-thème du Sport bien rempli (toutes les étoiles) et une poignée de cartes Pop à part */
const sportSub = THEMES.find((t) => t.id === 'sport')!.subthemes.filter((s) => s.cards.length > 60).sort((a, b) => b.cards.length - a.cards.length)[0];
const popCards = THEMES.find((t) => t.id === 'pop')!.cards.filter((c) => c.rarity !== 'secret').slice(0, 6).map((c) => c.id);
const content = { subthemes: [sportSub.id], cards: popCards };
const evReq: PackRequest = { kind: 'theme', event: { id: 'x', ...content } };

async function setup() {
  const t = convexTest(schema, modules);
  const mk = async (name: string, extra: Record<string, unknown> = {}) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 10, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), ...extra });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, alice: await mk('alice'), tom: await mk('tom', { isModerator: true, isAdmin: true }), hugo: await mk('hugo', { isModerator: true }) };
}
const base = (startAt: number, endAt: number) => ({ name: 'Coupe du monde', blurb: 'Le foot, et un peu de pop', startAt, endAt, accent: '#be185d', ...content, subthemes: content.subthemes, cards: content.cards });

afterEach(() => vi.useRealTimers());

describe('booster du moment : règles pures', () => {
  test('pool : sous-thème + cartes à part, sans doublon, jamais de secrète ni de Bébou', () => {
    const pool = eventCards(content);
    expect(pool.length).toBe(sportSub.cards.filter((c) => c.rarity !== 'secret').length + popCards.length);
    expect(new Set(pool.map((c) => c.id)).size).toBe(pool.length);
    expect(pool.some((c) => c.rarity === 'secret' || c.themeId === 'bebous')).toBe(false);
    expect(eventCards({ subthemes: ['bebous'], cards: ['nimporte-quoi'] })).toEqual([]);
    expect(eventCards(demoEvent()).length).toBeGreaterThan(20);
    expect(isValidPackRequest({ kind: 'theme', event: { id: 'vide' } })).toBe(false);
  });

  test('mêmes taux par étoile que les autres boosters (emplacements 1-4 et garanti)', () => {
    const rand = seeded(11);
    const N = 30_000;
    const free: Record<string, number> = {};
    const sure: Record<string, number> = {};
    const ids = new Set(eventCards(content).map((c) => c.id));
    for (let i = 0; i < N; i++) {
      const { slots } = rollPackEx(evReq, rand);
      expect(slots).toHaveLength(5);
      slots.forEach((s, j) => {
        expect(ids.has(s.card.id)).toBe(true);
        const m = j === 4 ? sure : free;
        m[s.rarity] = (m[s.rarity] ?? 0) + 1;
      });
    }
    for (const r of STAR_RARITIES) {
      expect(Math.abs((free[r] ?? 0) / (4 * N) - SLOT_WEIGHTS[r] / 100)).toBeLessThan(0.012);
      expect(Math.abs((sure[r] ?? 0) / N - GUARANTEED_WEIGHTS[r] / 100)).toBeLessThan(0.012);
    }
    expect(free.secret ?? 0).toBe(0);
    expect(sure.secret ?? 0).toBe(0);
    // la fiche affiche la vraie chance d'une carte du booster
    expect(cardPackChance(evReq, 'mythic')).toBeGreaterThan(0);
  });

  test('pity et god pack respectés', () => {
    const rand = seeded(5);
    for (let i = 0; i < 200; i++) expect(rollPackEx({ ...evReq, forceMythic: true }, rand).slots[4].rarity).toBe('mythic');
    for (let i = 0; i < 200; i++) {
      const { slots, god } = rollPackEx({ ...evReq, forceGod: true }, rand);
      expect(god).toBe(true);
      expect(slots.some((s) => s.rarity === 'mythic') && slots.some((s) => s.rarity === 'legendary')).toBe(true);
      expect(slots.every((s) => ['epic', 'legendary', 'mythic'].includes(s.rarity))).toBe(true);
    }
  });

  test('dates et contrôles', () => {
    const now = Date.now();
    const ok = base(now, now + 48 * H);
    expect(checkEvent(ok)).toBeNull();
    expect(checkEvent({ ...ok, endAt: now - 1 })).toMatch(/après le début/);
    expect(checkEvent({ ...ok, endAt: now + 90 * 24 * H })).toMatch(/60 jours/);
    expect(checkEvent({ ...ok, name: 'x' })).toMatch(/nom/);
    expect(checkEvent({ ...ok, accent: 'rouge' })).toMatch(/Couleur/);
    expect(checkEvent({ ...ok, subthemes: [], cards: [] })).toMatch(/vide/);
    const list = [{ startAt: now - H, endAt: now + H }, { startAt: now + 2 * H, endAt: now + 3 * H }];
    expect(liveEvent(list, now)).toBe(list[0]);
    expect(liveEvent(list, now + 1.5 * H)).toBeNull();
    expect(liveEvent(list, now + H)).toBeNull(); // fin exclue
    expect(fmtLeft(2 * 24 * H + 4 * H + 5 * 60_000)).toBe('2 j 4 h');
    expect(fmtLeft(3 * H + 7 * 60_000)).toBe('3 h 07 min');
  });
});

describe('booster du moment : serveur', () => {
  test('accès : seulement Tom et Hugo', async () => {
    const { t, alice, hugo } = await setup();
    const now = Date.now();
    await expect(t.query(api.events.adminList, { sessionToken: alice.token })).rejects.toThrow(/⟦(events\.5)[⟧{]/);
    await expect(t.mutation(api.events.adminSave, { sessionToken: alice.token, ...base(now, now + 24 * H) })).rejects.toThrow(/⟦(events\.5)[⟧{]/);
    await expect(t.mutation(api.events.adminSave, { sessionToken: 'faux', ...base(now, now + 24 * H) })).rejects.toThrow(/⟦(auth\.1|events\.4)[⟧{]/);
    const { id } = await t.mutation(api.events.adminSave, { sessionToken: hugo.token, ...base(now + H, now + 24 * H) });
    await expect(t.mutation(api.events.adminStartNow, { sessionToken: alice.token, id })).rejects.toThrow(/⟦(events\.5)[⟧{]/);
    await expect(t.mutation(api.events.adminEndNow, { sessionToken: alice.token, id })).rejects.toThrow(/⟦(events\.5)[⟧{]/);
    await expect(t.mutation(api.events.adminRemove, { sessionToken: alice.token, id })).rejects.toThrow(/⟦(events\.5)[⟧{]/);
    const log = await t.run((ctx) => ctx.db.query('adminLog').collect());
    expect(log.map((l) => [l.byName, l.action])).toEqual([['hugo', 'evenement']]);
  });

  test('à venir : invisible et refusé ; avancé : visible, tiré, crédité ; terminé : refusé', async () => {
    vi.useFakeTimers();
    const { t, alice, tom } = await setup();
    const now = Date.now();
    const { id } = await t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now + 5 * H, now + 48 * H) });
    expect(await t.query(api.events.current, {})).toEqual([]);
    await expect(t.mutation(api.packs.preparePack, { sessionToken: alice.token, eventId: id })).rejects.toThrow(/⟦(events\.2)[⟧{]/);
    expect((await t.run((ctx) => ctx.db.get(alice.userId)))!.packBalance).toBe(10); // rien débité

    await t.mutation(api.events.adminStartNow, { sessionToken: tom.token, id });
    vi.advanceTimersByTime(10);
    await t.finishInProgressScheduledFunctions();
    const cur = await t.query(api.events.current, {});
    expect(cur).toHaveLength(1);
    expect(cur[0]).toMatchObject({ id, name: 'Coupe du monde', accent: '#be185d' });
    expect((await t.run((ctx) => ctx.db.get(id)))!.notifiedAt).toBeDefined(); // notification de début partie (une fois)

    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, eventId: id });
    expect(pack).toMatchObject({ packKind: 'theme', eventId: id, eventName: 'Coupe du monde' });
    expect(pack.themeId).toBeUndefined();
    const ids = new Set(eventCards(content).map((c) => c.id));
    for (const c of pack.cards) expect(ids.has(c.cardId)).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(alice.userId)))!.packBalance).toBe(9); // coût : 1 booster de la réserve
    await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: pack._id });
    const inv = await t.run((ctx) => ctx.db.query('inventory').collect());
    expect(inv.reduce((a, r) => a + r.count, 0)).toBe(5);

    // série ×3 : même événement
    const series = await t.mutation(api.packs.preparePacks, { sessionToken: alice.token, eventId: id, count: 3 });
    expect(series).toHaveLength(3);
    expect(series.every((p) => p.eventId === id)).toBe(true);
    await t.mutation(api.packs.revealPacks, { sessionToken: alice.token, packIds: series.map((p) => p._id) });

    await t.mutation(api.events.adminEndNow, { sessionToken: tom.token, id });
    expect(await t.query(api.events.current, {})).toEqual([]);
    await expect(t.mutation(api.packs.preparePack, { sessionToken: alice.token, eventId: id })).rejects.toThrow(/terminé/);
    // les boosters normaux marchent toujours
    expect((await t.mutation(api.packs.preparePack, { sessionToken: alice.token, packKind: 'bebou' })).eventId).toBeUndefined();
    const acts = (await t.run((ctx) => ctx.db.query('adminLog').collect())).map((l) => l.action);
    expect(acts).toEqual(['evenement', 'evenement-debut', 'evenement-fin']);
  });

  test('un booster tiré pendant l’événement reste ouvrable après la fin (rien de perdu)', async () => {
    const { t, alice, tom } = await setup();
    const now = Date.now();
    const { id } = await t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now - 60_000, now + 24 * H) });
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, eventId: id });
    await t.mutation(api.events.adminEndNow, { sessionToken: tom.token, id });
    // anti-reroll : le booster scellé est rendu tel quel, puis crédité
    expect((await t.mutation(api.packs.preparePack, { sessionToken: alice.token, eventId: id }))._id).toBe(pack._id);
    const done = await t.mutation(api.packs.revealPack, { sessionToken: alice.token, packId: pack._id });
    expect(done.status).toBe('revealed');
  });

  test('pity : 200 boosters secs → la 6★ tombe aussi dans le booster du moment', async () => {
    const { t, alice, tom } = await setup();
    const now = Date.now();
    const { id } = await t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now - 60_000, now + 24 * H) });
    await t.run((ctx) => ctx.db.patch(alice.userId, { pityCount: PITY_LIMIT - 1 }));
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: alice.token, eventId: id });
    expect(pack.cards.some((c) => c.rarity === 'mythic')).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(alice.userId)))!.pityCount).toBe(0);
  });

  test('un seul événement à la fois ; modifier, supprimer avant la sortie', async () => {
    const { t, tom } = await setup();
    const now = Date.now();
    const { id } = await t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now + H, now + 24 * H) });
    await expect(t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now + 10 * H, now + 30 * H), name: 'Autre' })).rejects.toThrow(/⟦(events\.6)[⟧{]/);
    const b = await t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now + 24 * H, now + 40 * H), name: 'Ensuite' });
    await t.mutation(api.events.adminSave, { sessionToken: tom.token, id, ...base(now + 2 * H, now + 20 * H), name: 'Coupe 2' });
    const list = await t.query(api.events.adminList, { sessionToken: tom.token });
    expect(list.map((e) => [e.name, e.status])).toEqual([['Ensuite', 'avenir'], ['Coupe 2', 'avenir']]);
    expect(list[1].count).toBe(eventCards(content).length);
    await t.mutation(api.events.adminRemove, { sessionToken: tom.token, id: b.id });
    expect(await t.query(api.events.adminList, { sessionToken: tom.token })).toHaveLength(1);
    await expect(t.mutation(api.events.adminSave, { sessionToken: tom.token, ...base(now - 3 * 24 * H, now - 24 * H), name: 'Passé' })).rejects.toThrow(/⟦(events\.8)[⟧{]/);
  });
});
