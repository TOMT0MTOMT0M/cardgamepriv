/// <reference types="vite/client" />
/**
 * (V3, lot notifications) rappels push : « ta série s'arrête à minuit » (20 h), « missions / cadeau du jour » (9 h - 21 h),
 * plafond d'un push par type et par jour, réglages (nouveaux types actifs par défaut, coupés), heure de Paris été / hiver,
 * résultat de la roulette aux joueurs qui ont misé (convex/push.ts remindTick, convex/games.ts drawRound).
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';
import { remindSlots, prefsOf, PREFS_V3 } from './push';
import { cleanEcon, emptyEcon } from '../src/core/economy';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
type T = ReturnType<typeof convexTest>;
type Payload = { kind: string; title: string; body: string; url: string; tag: string };

afterEach(() => {
  vi.useRealTimers();
  delete process.env.VAPID_PUBLIC_KEY;
});

const at = (iso: string) => new Date(iso).getTime();

async function player(t: T, name: string, f: Partial<Doc<'users'>> = {}, sub = true): Promise<Id<'users'>> {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { discordId: name, username: name, displayName: name, packBalance: 3, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), ...f });
    await ctx.db.insert('sessions', { token: `tok-${name}`, userId: id, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    if (sub) await ctx.db.insert('pushSubs', { userId: id, endpoint: `https://push.test/${name}`, keys: { p256dh: 'k', auth: 'a' }, createdAt: Date.now() });
    return id;
  });
}
/** push programmés, par appareil (= par joueur ici) */
async function sent(t: T): Promise<Array<Payload & { to: string }>> {
  const jobs = await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect());
  return jobs
    .filter((j) => j.name.includes('pushSend'))
    .map((j) => {
      const a = j.args[0] as { subs: { endpoint: string }[]; payload: Payload };
      return { ...a.payload, to: a.subs[0].endpoint.split('/').pop()! };
    });
}
const tick = (t: T) => t.mutation(internal.push.remindTick, {});
const econ = (calendarDay?: string) => cleanEcon({ ...emptyEcon(), ...(calendarDay ? { calendarDay } : {}) });
const mission = (id: string, done: boolean, claimed = false) => ({ id, kind: 'open', target: 3, progress: done ? 3 : 1, reward: 1, claimed });

describe('heure de Paris', () => {
  test('20 h et 9 h - 21 h, été comme hiver (et les jours de bascule)', () => {
    // hiver (UTC+1)
    expect(remindSlots(at('2026-11-27T19:00:00Z'))).toMatchObject({ h: 20, streak: true, daily: true });
    expect(remindSlots(at('2026-11-27T18:00:00Z'))).toMatchObject({ h: 19, streak: false, daily: true });
    expect(remindSlots(at('2026-11-27T21:00:00Z'))).toMatchObject({ h: 22, streak: false, daily: false });
    expect(remindSlots(at('2026-11-27T07:00:00Z'))).toMatchObject({ h: 8, daily: false });
    expect(remindSlots(at('2026-11-27T08:00:00Z'))).toMatchObject({ h: 9, daily: true, purge: true });
    // été (UTC+2)
    expect(remindSlots(at('2026-07-15T18:00:00Z'))).toMatchObject({ h: 20, streak: true });
    expect(remindSlots(at('2026-07-15T19:00:00Z'))).toMatchObject({ h: 21, streak: false, daily: true });
    expect(remindSlots(at('2026-07-15T20:00:00Z'))).toMatchObject({ h: 22, daily: false });
    // jours de bascule : 29/03 (passage à l'heure d'été), 25/10 (retour à l'heure d'hiver)
    expect(remindSlots(at('2026-03-29T18:00:00Z')).streak).toBe(true);
    expect(remindSlots(at('2026-10-25T19:00:00Z')).streak).toBe(true);
    expect(remindSlots(at('2026-10-25T18:00:00Z')).streak).toBe(false);
  });
});

describe('réglages', () => {
  test('nouveaux types actifs pour qui avait réglé ses notifications en V2 ; la liste V3 fait foi', () => {
    expect(prefsOf({})).toEqual(expect.arrayContaining(['streak', 'daily', 'trade']));
    expect(prefsOf({ notifPrefs: ['trade'] })).toEqual(['trade', 'streak', 'daily']);
    expect(prefsOf({ notifPrefs: ['trade', PREFS_V3] })).toEqual(['trade']);
  });
  test('setPrefs depuis les réglages V3 pose la marque ; status la cache', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    const id = await player(t, 'ana');
    await t.mutation(api.push.setPrefs, { sessionToken: 'tok-ana', prefs: ['trade', 'daily'], full: true });
    expect((await t.run((ctx) => ctx.db.get(id)))!.notifPrefs).toEqual(['trade', 'daily', PREFS_V3]);
    expect((await t.query(api.push.status, { sessionToken: 'tok-ana' })).prefs).toEqual(['trade', 'daily']);
    // ancien client (sans `full`) : pas de marque, les nouveaux types restent actifs
    await t.mutation(api.push.setPrefs, { sessionToken: 'tok-ana', prefs: ['trade'] });
    expect((await t.query(api.push.status, { sessionToken: 'tok-ana' })).prefs).toEqual(['trade', 'streak', 'daily']);
  });
});

describe('série en danger (20 h)', () => {
  test('qui reçoit quoi, langue, plafond d’un par jour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-27T19:00:20Z')); // 20 h à Paris (hiver)
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    const hier = at('2026-11-26T18:00:00Z');
    await player(t, 'serie', { streak: { count: 5, day: '2026-11-26', rewardedAt: 0 }, lastSeenAt: hier });
    await player(t, 'english', { streak: { count: 12, day: '2026-11-26', rewardedAt: 7 }, lastSeenAt: hier, lang: 'en' });
    await player(t, 'v2prefs', { streak: { count: 3, day: '2026-11-26', rewardedAt: 0 }, lastSeenAt: hier, notifPrefs: ['trade'] });
    await player(t, 'coupe', { streak: { count: 9, day: '2026-11-26', rewardedAt: 7 }, lastSeenAt: hier, notifPrefs: ['trade', PREFS_V3] });
    await player(t, 'unjour', { streak: { count: 1, day: '2026-11-26', rewardedAt: 0 }, lastSeenAt: hier });
    await player(t, 'casse', { streak: { count: 8, day: '2026-11-24', rewardedAt: 7 }, lastSeenAt: at('2026-11-24T18:00:00Z') });
    await player(t, 'passe', { streak: { count: 6, day: '2026-11-27', rewardedAt: 0 }, lastSeenAt: at('2026-11-27T09:00:00Z'), econ: econ('2026-11-27') });
    await player(t, 'sansappareil', { streak: { count: 4, day: '2026-11-26', rewardedAt: 0 }, lastSeenAt: hier }, false);
    await player(t, 'banni', { streak: { count: 4, day: '2026-11-26', rewardedAt: 0 }, lastSeenAt: hier, bannedAt: 1 });

    const r = await tick(t);
    expect(r.streak).toBe(3);
    const s = await sent(t);
    expect(s.map((x) => x.to).sort()).toEqual(['english', 'serie', 'v2prefs']);
    expect(s.find((x) => x.to === 'serie')).toMatchObject({ kind: 'streak', title: 'Ta série de 5 jours s’arrête à minuit', url: '#/' });
    expect(s.find((x) => x.to === 'serie')!.body).toContain('cadeau du jour 6');
    expect(s.find((x) => x.to === 'english')!.title).toBe('Your 12-day streak ends at midnight');
    // même heure relancée (ou deuxième passage) : rien de plus
    await tick(t);
    expect(await sent(t)).toHaveLength(3);
    // 21 h : plus de série en danger
    vi.setSystemTime(at('2026-11-27T20:00:20Z'));
    expect((await tick(t)).streak).toBe(0);
  });

  test('été : 20 h = 18 h UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-07-15T18:00:10Z'));
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    await player(t, 'ete', { streak: { count: 2, day: '2026-07-14', rewardedAt: 0 }, lastSeenAt: at('2026-07-14T20:30:00Z') });
    expect((await tick(t)).streak).toBe(1);
  });
});

describe('missions / cadeau du jour (9 h - 21 h)', () => {
  test('parti depuis 1 h avec des missions ou le cadeau : un rappel, un seul par jour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-27T13:00:15Z')); // 14 h à Paris
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    const today = '2026-11-27';
    const left = at('2026-11-27T11:30:00Z'); // parti à 12 h 30
    const streak = { count: 4, day: today, rewardedAt: 0 };
    await player(t, 'missions', { streak, lastSeenAt: left, missions: { day: today, rerolled: false, bonusClaimed: false, list: [mission('a', true), mission('b', true), mission('c', false)] } });
    await player(t, 'cadeau', { streak, lastSeenAt: left, econ: econ('2026-11-26') });
    await player(t, 'rien', { streak, lastSeenAt: left, econ: econ(today), missions: { day: today, rerolled: false, bonusClaimed: false, list: [mission('a', true, true), mission('b', false)] } });
    await player(t, 'hier', { streak, lastSeenAt: left, econ: econ(today), missions: { day: '2026-11-26', rerolled: false, bonusClaimed: false, list: [mission('a', true)] } });
    await player(t, 'encorela', { streak, lastSeenAt: at('2026-11-27T12:40:00Z') }); // parti il y a 20 min
    await player(t, 'coupe', { streak, lastSeenAt: left, notifPrefs: ['trade', PREFS_V3] });

    expect((await tick(t)).daily).toBe(2);
    let s = await sent(t);
    expect(s.map((x) => x.to).sort()).toEqual(['cadeau', 'missions']);
    expect(s.find((x) => x.to === 'missions')).toMatchObject({ kind: 'daily', title: '2 missions terminées à récupérer' });
    expect(s.find((x) => x.to === 'missions')!.body).toContain('cadeau du jour');
    expect(s.find((x) => x.to === 'cadeau')).toMatchObject({ title: 'Ton cadeau du jour t’attend' });
    expect(s.find((x) => x.to === 'cadeau')!.body).toMatch(/^Jour 4 du calendrier : \d+ pièces/);

    // 15 h : « encorela » est parti depuis plus d'une heure → son rappel
    vi.setSystemTime(at('2026-11-27T14:00:15Z'));
    expect((await tick(t)).daily).toBe(1);
    // il revient et repart : pas de deuxième rappel le même jour
    await t.run(async (ctx) => {
      const u = (await ctx.db.query('users').withIndex('by_discordId', (q) => q.eq('discordId', 'encorela')).unique())!;
      await ctx.db.patch(u._id, { lastSeenAt: at('2026-11-27T14:30:00Z') });
    });
    vi.setSystemTime(at('2026-11-27T16:00:15Z'));
    expect((await tick(t)).daily).toBe(0);
    s = await sent(t);
    expect(s.filter((x) => x.to === 'encorela')).toHaveLength(1);
  });

  test('rien entre 22 h et 9 h ; à 9 h, la nuit est rattrapée ; ménage des lignes de plus de 2 jours', async () => {
    vi.useFakeTimers();
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    vi.setSystemTime(at('2026-11-27T21:00:10Z')); // 22 h
    const id = await player(t, 'nuit', { streak: { count: 2, day: '2026-11-27', rewardedAt: 0 }, lastSeenAt: at('2026-11-27T20:10:00Z') });
    expect((await tick(t)).daily).toBe(0);
    await t.run(async (ctx) => {
      await ctx.db.insert('pushDaily', { userId: id, key: 'daily', day: '2026-11-20' });
      await ctx.db.insert('pushDaily', { userId: id, key: 'daily', day: '2026-11-27' });
    });
    // 9 h le lendemain : il est passé à 0 h 30 et reparti, cadeau pas pris
    await t.run((ctx) => ctx.db.patch(id, { streak: { count: 3, day: '2026-11-28', rewardedAt: 0 }, lastSeenAt: at('2026-11-27T23:30:00Z') }));
    vi.setSystemTime(at('2026-11-28T08:00:10Z'));
    const r = await tick(t);
    expect(r).toMatchObject({ daily: 1, purged: 1 });
    expect((await t.run((ctx) => ctx.db.query('pushDaily').collect())).map((d) => d.day).sort()).toEqual(['2026-11-27', '2026-11-28']);
  });
});

describe('roulette', () => {
  test('les joueurs qui ont misé et perdu reçoivent le résultat, le gagnant seulement le sien ; avertissement traduit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-27T13:00:00Z'));
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    await player(t, 'alice', { coins: 5000 });
    await player(t, 'bob', { coins: 5000, lang: 'en' });
    await player(t, 'chloe', { coins: 5000 });
    await t.mutation(internal.games.rouletteTick, {});
    const stake = { coins: 1000, cards: [] };
    await t.mutation(api.games.placeBet, { sessionToken: 'tok-alice', numbers: [5], stake });
    await t.mutation(api.games.placeBet, { sessionToken: 'tok-bob', numbers: [7], stake });
    await t.mutation(internal.games.forceDraw, { number: 5 });
    const s = (await sent(t)).filter((x) => x.kind === 'game');
    expect(s.map((x) => x.to).sort()).toEqual(['alice', 'bob']);
    expect(s.find((x) => x.to === 'alice')!.title).toBe('Roulette : tu as gagné !');
    expect(s.find((x) => x.to === 'bob')).toMatchObject({ title: 'Roulette: number 5 came up', url: '#/jeux/roulette' });
    expect(s.find((x) => x.to === 'bob')!.body).toContain('alice takes the pot');
  });

  test('avertissement 10 min avant : dans la langue de chacun', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-27T13:00:00Z'));
    process.env.VAPID_PUBLIC_KEY = 'test';
    const t = convexTest(schema, modules);
    await player(t, 'fr');
    await player(t, 'en', { lang: 'en' });
    await t.mutation(internal.games.rouletteTick, {});
    const r = (await t.query(api.games.roulette, {}))!;
    vi.setSystemTime(r.round!.drawAt! - 6 * 60_000);
    await t.mutation(internal.games.rouletteTick, {});
    const s = (await sent(t)).filter((x) => x.kind === 'roulette');
    expect(s.find((x) => x.to === 'fr')!.title).toMatch(/^Roulette : tirage de \d+ h dans 10 min$/);
    expect(s.find((x) => x.to === 'en')!.title).toMatch(/^Roulette: the \d+:00 draw is in 10 min$/);
    expect(s.find((x) => x.to === 'en')!.body).toContain('Nobody has bet yet');
  });
});
