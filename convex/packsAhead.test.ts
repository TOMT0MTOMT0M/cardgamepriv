/// <reference types="vite/client" />
/**
 * (V3) PISTE CONVEX 9 — un booster = une mutation (`openPack` crédite et scelle d'avance le suivant de la même sorte) —
 * et PACKS ÉVÉNEMENT (réserve propre : 1 / h, 3 max, 5 abonné, booster de lancement, achat à 10 × le prix).
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { EVENT_PACK_PRICE } from '../src/core/economy';
import { EVENT_CAP, EVENT_REGEN_MS, SUB_EXTRA_EVENT_PACKS, eventRegen } from '../src/core/events';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const H = 3_600_000;

async function setup(extra: Record<string, unknown> = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const mk = async (name: string, more: Record<string, unknown> = {}) => {
      const userId = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 10, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: now, packRegenAt: now, ...more });
      await ctx.db.insert('sessions', { token: `tok-${name}`, userId, createdAt: now, expiresAt: now + 86_400_000 });
      return userId;
    };
    return { alice: await mk('alice', extra), tom: await mk('tom', { isAdmin: true, isModerator: true }) };
  });
  const user = () => t.run(async (ctx) => (await ctx.db.get(ids.alice))!);
  return { t, ...ids, user, tok: { sessionToken: 'tok-alice' } };
}

afterEach(() => vi.useRealTimers());

describe('piste 9 : un booster = une mutation', () => {
  test('openPack crédite et scelle d’avance le suivant (réservé, débité à son ouverture)', async () => {
    const { t, user, tok } = await setup();
    const p1 = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'theme', themeId: 'gaming' });
    expect((await user()).packBalance).toBe(9);
    const r1 = await t.mutation(api.packs.openPack, { ...tok, packId: p1._id });
    expect(r1.pack.status).toBe('revealed');
    expect(r1.next).toMatchObject({ status: 'sealed', ahead: true, packKind: 'theme', themeId: 'gaming' });
    let u = await user();
    expect(u.packBalance).toBe(9); // réservé, pas débité : la réserve affichée ne saute pas de 2
    expect(u.packAhead).toBe(1);
    // le prochain « Ouvrir » de cette sorte rend CE booster (anti-reroll), sans en sceller un autre
    const again = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'theme', themeId: 'gaming' });
    expect(again._id).toBe(r1.next!._id);
    const r2 = await t.mutation(api.packs.openPack, { ...tok, packId: r1.next!._id });
    u = await user();
    expect(u.packBalance).toBe(8);
    expect(u.packAhead).toBe(1); // celui d'avance ouvert (débité), le suivant réservé
    expect(r2.next!._id).not.toBe(r1.next!._id);
    const inv = await t.run((ctx) => ctx.db.query('inventory').collect());
    expect(inv.reduce((a, r) => a + r.count, 0)).toBe(10);
    expect(u.totalPacksOpened).toBe(2);
    // série : pas de scellé d'avance tant que d'autres boosters de la série attendent (next: false)
    const r3 = await t.mutation(api.packs.openPack, { ...tok, packId: r2.next!._id, next: false });
    expect(r3.next).toBeNull();
    expect((await user()).packAhead).toBe(0);
  });

  test('une autre sorte : son propre booster ; le booster d’avance reste pour sa sorte', async () => {
    const { t, user, tok } = await setup();
    const p1 = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
    const { next } = await t.mutation(api.packs.openPack, { ...tok, packId: p1._id });
    const pop = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'theme', themeId: 'pop' });
    expect(pop._id).not.toBe(next!._id);
    expect(pop.themeId).toBe('pop');
    expect((await user()).packBalance).toBe(8);
    await t.mutation(api.packs.openPack, { ...tok, packId: pop._id, next: false });
    const series = await t.mutation(api.packs.preparePacks, { ...tok, packKind: 'bebou', count: 3 });
    expect(series[0]._id).toBe(next!._id); // la série reprend le booster d'avance de sa sorte
    expect(series.map((p) => p.packKind)).toEqual(['bebou', 'bebou', 'bebou']);
  });

  test('réserve entièrement réservée : le booster d’avance d’une autre sorte s’ouvre ; un jeu ne le mise pas', async () => {
    const { t, user, tok } = await setup({ packBalance: 2 });
    const p1 = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
    const { next } = await t.mutation(api.packs.openPack, { ...tok, packId: p1._id });
    expect((await user()).packBalance).toBe(1);
    const other = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'theme', themeId: 'sport' });
    expect(other._id).toBe(next!._id);
    const { next: n2 } = await t.mutation(api.packs.openPack, { ...tok, packId: other._id });
    expect(n2).toBeNull();
    expect((await user())).toMatchObject({ packBalance: 0, packAhead: 0 });
    await expect(t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' })).rejects.toThrow(/⟦(packs\.2)[⟧{]/);
  });

  test('pity affiché : celui d’avant le booster scellé d’avance, jusqu’à son ouverture', async () => {
    const { t, user, tok } = await setup({ pityCount: 40 });
    const p1 = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
    const r1 = await t.mutation(api.packs.openPack, { ...tok, packId: p1._id });
    const after1 = r1.pack.cards.some((c) => c.rarity === 'mythic') ? 0 : 41;
    const me = await t.query(api.users.me, tok);
    expect(me!.pityCount).toBe(after1); // pas celui qui compte déjà le booster d'avance
    expect((await user()).pityCount).not.toBe(undefined);
    await t.mutation(api.packs.openPack, { ...tok, packId: r1.next!._id, next: false });
    expect((await t.query(api.users.me, tok))!.pityCount).toBe((await user()).pityCount);
  });

  test('vieux onglet : revealPack d’un booster d’avance le débite aussi', async () => {
    const { t, user, tok } = await setup();
    const p1 = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
    const { next } = await t.mutation(api.packs.openPack, { ...tok, packId: p1._id });
    await t.mutation(api.packs.revealPack, { ...tok, packId: next!._id });
    expect(await user()).toMatchObject({ packBalance: 8, packAhead: 0 });
    expect((await user()).pityHold).toBeUndefined();
    // idempotent : rejouer le crédit ne débite rien de plus
    const again = await t.mutation(api.packs.openPack, { ...tok, packId: next!._id });
    expect(again.next).toBeNull();
    expect((await user()).packBalance).toBe(8);
  });

  test('sealedMine : les boosters scellés (abandonné + d’avance)', async () => {
    const { t, tok } = await setup();
    const p1 = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
    await t.mutation(api.packs.openPack, { ...tok, packId: p1._id });
    await t.mutation(api.packs.preparePack, { ...tok, packKind: 'theme', themeId: 'monde' });
    const rows = await t.query(api.packs.sealedMine, tok);
    expect(rows.map((p) => [p.packKind, !!p.ahead]).sort()).toEqual([['bebou', true], ['theme', false]]);
  });
});

describe('packs événement : réserve propre', () => {
  const content = { subthemes: [THEMES.find((x) => x.id === 'sport')!.subthemes.filter((s) => s.cards.length > 60)[0].id], cards: [] as string[] };
  async function withEvent(extra: Record<string, unknown> = {}) {
    vi.useFakeTimers({ now: new Date('2026-12-01T10:00:00Z'), toFake: ['Date'] });
    const s = await setup(extra);
    const now = Date.now();
    const evId = (await s.t.run((ctx) => ctx.db.insert('packEvents', { name: 'Télé', startAt: now - 30 * 60_000, endAt: now + 7 * 24 * H, accent: '#8d919b', ...content, createdAt: now, updatedAt: now, byName: 'tom' }))) as Id<'packEvents'>;
    return { ...s, evId };
  }

  test('règle pure : lancement 1, +1 / h, 3 max (5 abonné), arrêt à la fin', () => {
    const e = { id: 'e', startAt: 0, endAt: 10 * H };
    expect(eventRegen(undefined, e, 30 * 60_000, EVENT_CAP).balance).toBe(1);
    expect(eventRegen(undefined, e, 2 * H, EVENT_CAP).balance).toBe(3);
    expect(eventRegen(undefined, e, 9 * H, EVENT_CAP).balance).toBe(3);
    expect(eventRegen(undefined, e, 9 * H, EVENT_CAP + SUB_EXTRA_EVENT_PACKS).balance).toBe(5);
    expect(eventRegen({ id: 'e', n: 0, at: 9.5 * H }, e, 20 * H, EVENT_CAP)).toMatchObject({ balance: 0, nextAt: null }); // fini avant le prochain
    expect(eventRegen({ id: 'autre', n: 0, at: 0 }, e, 0, EVENT_CAP).balance).toBe(1); // autre événement : réserve neuve
    expect(EVENT_REGEN_MS).toBe(H);
  });

  test('ouvrir prend la réserve de l’événement, pas la normale ; vide = refus avec l’heure du suivant', async () => {
    const { t, user, tok, evId } = await withEvent();
    const p = await t.mutation(api.packs.preparePack, { ...tok, eventId: evId });
    expect(p.eventId).toBe(evId);
    let u = await user();
    expect(u.packBalance).toBe(10);
    expect(u.ev).toMatchObject({ id: evId, n: 0 });
    const { next } = await t.mutation(api.packs.openPack, { ...tok, packId: p._id });
    expect(next).toBeNull(); // réserve d'événement vide : rien d'avance
    await expect(t.mutation(api.packs.preparePack, { ...tok, eventId: evId })).rejects.toThrow(/⟦(packs\.4)[⟧{]/);
    vi.setSystemTime(Date.now() + H);
    const p2 = await t.mutation(api.packs.preparePack, { ...tok, eventId: evId });
    vi.setSystemTime(Date.now() + 2 * H);
    const r2 = await t.mutation(api.packs.openPack, { ...tok, packId: p2._id });
    expect(r2.next).toMatchObject({ eventId: evId, ahead: true });
    u = await user();
    expect(u.ev).toMatchObject({ n: 2, ahead: 1 });
    expect(u.packBalance).toBe(10);
    await t.mutation(api.packs.openPack, { ...tok, packId: r2.next!._id, next: false });
    expect((await user()).ev).toMatchObject({ n: 1, ahead: 0 });
  });

  test('achat : 10 × le prix d’un booster, dans la réserve de l’événement (même au-delà du plafond)', async () => {
    const { t, user, tok, evId } = await withEvent({ coins: EVENT_PACK_PRICE + 100 });
    expect(EVENT_PACK_PRICE).toBe(2500);
    const r = await t.mutation(api.packs.buyEventPack, { ...tok, eventId: evId });
    expect(r.packs).toBe(2);
    const u = await user();
    expect(u.coins).toBe(100);
    expect(u.ev).toMatchObject({ id: evId, n: 2 });
    await expect(t.mutation(api.packs.buyEventPack, { ...tok, eventId: evId })).rejects.toThrow();
    expect((await user()).coins).toBe(100);
  });

  test('abonné : 5 au plus', async () => {
    const { t, tok, evId } = await withEvent({ subUntil: Date.now() + 30 * 24 * H + 10 * 24 * H });
    vi.setSystemTime(Date.now() + 10 * H);
    const me = await t.query(api.users.me, tok);
    expect(me!.evCap).toBe(5);
    const series = await t.mutation(api.packs.preparePacks, { ...tok, eventId: evId, count: 10 });
    expect(series).toHaveLength(5);
  });
});
