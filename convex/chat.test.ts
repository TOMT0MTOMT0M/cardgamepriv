/// <reference types="vite/client" />
/**
 * Tests du chat (convex/chat.ts — V2, 10/11). Base Convex simulée en mémoire.
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { CHAT_BURST_MAX, CHAT_GENERAL, CHAT_PAGE, CHAT_WAKE_EVERY_MS, CHAT_WAKE_SILENCE_MS, dmKey } from '../src/core/chat';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob', 'chloe']) {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of names)
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: name, username: `${name}_d`, displayName: name[0].toUpperCase() + name.slice(1), packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: Date.now(), packRegenAt: Date.now(),
      });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, u };
}
type T = Awaited<ReturnType<typeof setup>>['t'];

const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return String((e as { data?: string }).data ?? (e as Error).message);
  }
  return '';
};
/** envoi, en avançant l'horloge (l'anti-rafale demande 400 ms entre deux messages) */
async function say(t: T, token: string, conv: string, text: string, extra: Record<string, unknown> = {}) {
  vi.advanceTimersByTime(1000);
  return await t.mutation(api.chat.send, { sessionToken: token, conv, text, ...extra });
}
/** tout ce qui a été programmé (envois push, réveil du chat général), quel que soit son état */
const jobs = (t: T) => t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect());

afterEach(() => {
  vi.useRealTimers();
  delete process.env.VAPID_PUBLIC_KEY;
});

describe('chat', () => {
  test('chat général : numéros d’ordre, non-lus sans relire les messages, lecture', async () => {
    vi.useFakeTimers();
    const { t, u } = await setup();
    expect(await t.query(api.chat.inbox, {})).toBeNull();
    const empty = (await t.query(api.chat.inbox, { sessionToken: u.alice.token }))!;
    expect(empty.general).toMatchObject({ n: 0, seenN: 0, mention: false });
    expect(empty.dms).toEqual([]);

    const m1 = await say(t, u.alice.token, CHAT_GENERAL, '  Salut tout le monde  ');
    const m2 = await say(t, u.alice.token, CHAT_GENERAL, 'qui échange ?');
    expect([m1.n, m2.n]).toEqual([1, 2]);
    expect(m2.at).toBeGreaterThan(m1.at);

    // l'auteur a lu ce qu'il envoie ; les autres ont 2 non-lus
    const a = (await t.query(api.chat.inbox, { sessionToken: u.alice.token }))!;
    expect(a.general).toMatchObject({ n: 2, seenN: 2, lastName: 'Alice', lastText: 'qui échange ?' });
    const b = (await t.query(api.chat.inbox, { sessionToken: u.bob.token }))!;
    expect(b.general.n - b.general.seenN).toBe(2);

    await t.mutation(api.chat.markRead, { sessionToken: u.bob.token, conv: CHAT_GENERAL, n: 99 });
    expect((await t.query(api.chat.inbox, { sessionToken: u.bob.token }))!.general.seenN).toBe(2);
    // relire en arrière ne fait pas reculer
    await t.mutation(api.chat.markRead, { sessionToken: u.bob.token, conv: CHAT_GENERAL, n: 1 });
    expect((await t.query(api.chat.inbox, { sessionToken: u.bob.token }))!.general.seenN).toBe(2);

    const p = await t.query(api.chat.page, { sessionToken: u.bob.token, conv: CHAT_GENERAL });
    expect(p.done).toBe(true);
    expect(p.msgs.map((m) => [m.n, m.name, m.text])).toEqual([[1, 'Alice', 'Salut tout le monde'], [2, 'Alice', 'qui échange ?']]);
  });

  test('fil ouvert : seulement ce qui a changé depuis T (messages, réactions, suppressions)', async () => {
    vi.useFakeTimers();
    const { t, u } = await setup();
    const m1 = await say(t, u.alice.token, CHAT_GENERAL, 'un');
    const m2 = await say(t, u.bob.token, CHAT_GENERAL, 'deux');
    const all = (await t.query(api.chat.tail, { sessionToken: u.chloe.token, conv: CHAT_GENERAL, after: 0 }))!;
    expect(all.msgs.map((m) => m.text)).toEqual(['un', 'deux']);
    expect(all.more).toBe(false);
    // depuis le dernier : rien
    expect((await t.query(api.chat.tail, { sessionToken: u.chloe.token, conv: CHAT_GENERAL, after: m2.at }))!.msgs).toEqual([]);

    // une réaction sur le PREMIER message le fait revenir dans le fil (touchedAt avance), à sa place d'origine (at)
    vi.advanceTimersByTime(5000);
    await t.mutation(api.chat.react, { sessionToken: u.chloe.token, id: m1.id as Id<'chatMessages'>, k: 'GG' });
    await t.mutation(api.chat.react, { sessionToken: u.bob.token, id: m1.id as Id<'chatMessages'>, k: 'GG' });
    const after = (await t.query(api.chat.tail, { sessionToken: u.alice.token, conv: CHAT_GENERAL, after: m2.at }))!;
    expect(after.msgs).toHaveLength(1);
    expect(after.msgs[0]).toMatchObject({ id: m1.id, at: m1.at, reacts: [{ k: 'GG', by: [u.chloe.userId, u.bob.userId] }] });
    expect(after.msgs[0].touchedAt).toBeGreaterThan(m2.at);
    // re-clic : la réaction se retire ; tampon inconnu refusé
    await t.mutation(api.chat.react, { sessionToken: u.chloe.token, id: m1.id as Id<'chatMessages'>, k: 'GG' });
    await t.mutation(api.chat.react, { sessionToken: u.bob.token, id: m1.id as Id<'chatMessages'>, k: 'GG' });
    expect((await t.query(api.chat.page, { sessionToken: u.alice.token, conv: CHAT_GENERAL })).msgs[0].reacts).toBeUndefined();
    expect(await err(t.mutation(api.chat.react, { sessionToken: u.bob.token, id: m1.id as Id<'chatMessages'>, k: '<b>' }))).toMatch(/inconnue/);

    // suppression : seulement l'auteur (ou l'équipe) ; le texte disparaît pour de bon, l'aperçu aussi
    expect(await err(t.mutation(api.chat.remove, { sessionToken: u.chloe.token, id: m2.id as Id<'chatMessages'> }))).toMatch(/tes messages/);
    await t.mutation(api.chat.remove, { sessionToken: u.bob.token, id: m2.id as Id<'chatMessages'> });
    const last = (await t.query(api.chat.page, { sessionToken: u.alice.token, conv: CHAT_GENERAL })).msgs[1];
    expect(last).toMatchObject({ deleted: true, text: '' });
    expect((await t.query(api.chat.inbox, { sessionToken: u.alice.token }))!.general.lastText).toBe('');
    expect(await t.run(async (ctx) => (await ctx.db.get(m2.id as Id<'chatMessages'>))!.text)).toBe('');
    // l'équipe supprime ce qu'elle veut
    await t.run(async (ctx) => ctx.db.patch(u.chloe.userId, { isModerator: true }));
    await t.mutation(api.chat.remove, { sessionToken: u.chloe.token, id: m1.id as Id<'chatMessages'> });
    expect((await t.query(api.chat.inbox, { sessionToken: u.chloe.token }))!.staff).toBe(true);
  });

  test('privés : une clé par paire, fermés aux autres, « Vu »', async () => {
    vi.useFakeTimers();
    const { t, u } = await setup();
    const key = dmKey(u.alice.userId, u.bob.userId);
    expect(key).toBe(dmKey(u.bob.userId, u.alice.userId));
    await say(t, u.alice.token, key, 'tu me passes ton Mew ?');
    await say(t, u.alice.token, key, 'contre deux 4★');

    const b = (await t.query(api.chat.inbox, { sessionToken: u.bob.token }))!;
    expect(b.dms).toHaveLength(1);
    expect(b.dms[0]).toMatchObject({ key, peerId: u.alice.userId, n: 2, seenN: 0, peerSeenN: 2, lastText: 'contre deux 4★' });
    const a = (await t.query(api.chat.inbox, { sessionToken: u.alice.token }))!;
    expect(a.dms[0]).toMatchObject({ peerId: u.bob.userId, seenN: 2, peerSeenN: 0 });

    await t.mutation(api.chat.markRead, { sessionToken: u.bob.token, conv: key, n: 2 });
    expect((await t.query(api.chat.inbox, { sessionToken: u.alice.token }))!.dms[0].peerSeenN).toBe(2);

    // Chloé n'y a pas accès : ni lecture, ni écriture, ni réaction ; rien dans sa liste
    expect(await t.query(api.chat.tail, { sessionToken: u.chloe.token, conv: key, after: 0 })).toBeNull();
    expect(await err(t.query(api.chat.page, { sessionToken: u.chloe.token, conv: key }))).toMatch(/introuvable/);
    expect(await err(say(t, u.chloe.token, key, 'coucou'))).toMatch(/introuvable/);
    const first = (await t.query(api.chat.page, { sessionToken: u.bob.token, conv: key })).msgs[0];
    expect(await err(t.mutation(api.chat.react, { sessionToken: u.chloe.token, id: first.id as Id<'chatMessages'>, k: 'GG' }))).toMatch(/introuvable/);
    expect((await t.query(api.chat.inbox, { sessionToken: u.chloe.token }))!.dms).toEqual([]);
    // clés bricolées refusées (ordre inversé, soi-même, joueur inconnu)
    const [x, y] = [u.alice.userId, u.bob.userId].sort();
    expect(await err(say(t, u.alice.token, `dm:${y}:${x}`, 'x'))).toMatch(/introuvable/);
    expect(await err(say(t, u.alice.token, `dm:${u.alice.userId}:${u.alice.userId}`, 'x'))).toMatch(/introuvable/);
    expect(await err(say(t, u.alice.token, 'salon-secret', 'x'))).toMatch(/introuvable/);
  });

  test('garde-fous : message vide, longueur, anti-rafale, carte qu’on possède, réponse, mention', async () => {
    vi.useFakeTimers();
    const { t, u } = await setup();
    expect(await err(say(t, u.alice.token, CHAT_GENERAL, '   \n  '))).toMatch(/vide/);
    const long = await say(t, u.alice.token, CHAT_GENERAL, 'a'.repeat(2000));
    expect((await t.query(api.chat.page, { sessionToken: u.alice.token, conv: CHAT_GENERAL })).msgs.find((m) => m.id === long.id)!.text).toHaveLength(500);
    // deux messages dans la même demi-seconde : refusé
    expect(await err(t.mutation(api.chat.send, { sessionToken: u.alice.token, conv: CHAT_GENERAL, text: 'vite' }))).toMatch(/Doucement/);
    // rafale : 12 messages en 20 s, pas plus
    vi.advanceTimersByTime(60_000);
    let refused = '';
    for (let i = 0; i < CHAT_BURST_MAX + 2 && !refused; i++) {
      vi.advanceTimersByTime(500);
      refused = await err(t.mutation(api.chat.send, { sessionToken: u.alice.token, conv: CHAT_GENERAL, text: `m${i}` }));
    }
    expect(refused).toMatch(/trop vite/);
    vi.advanceTimersByTime(30_000);

    // carte : il faut l'avoir
    expect(await err(say(t, u.alice.token, CHAT_GENERAL, '', { card: { cardId: 'pkm-mew', rarity: 'rare' } }))).toMatch(/Tu n’as pas/);
    expect(await err(say(t, u.alice.token, CHAT_GENERAL, '', { card: { cardId: 'pas-une-carte', rarity: 'rare' } }))).toMatch(/inconnue/);
    await t.run(async (ctx) => ctx.db.insert('inventory', { userId: u.alice.userId, cardId: 'pkm-mew', rarity: 'rare', count: 1, bestMintNumber: 7, foilSeed: 1, firstPulledAt: 1, lastPulledAt: 1 }));
    const shown = await say(t, u.alice.token, CHAT_GENERAL, '', { card: { cardId: 'pkm-mew', rarity: 'rare' }, clientId: 'c-1' });
    const msgs = (await t.query(api.chat.page, { sessionToken: u.bob.token, conv: CHAT_GENERAL })).msgs;
    expect(msgs.at(-1)).toMatchObject({ id: shown.id, card: { cardId: 'pkm-mew', rarity: 'rare', mintNumber: 7 }, clientId: 'c-1' });
    expect((await t.query(api.chat.inbox, { sessionToken: u.bob.token }))!.general.lastText).toMatch(/^Carte : /);

    // réponse + mention : Bob répond à la carte en citant Chloé
    const r = await say(t, u.bob.token, CHAT_GENERAL, '@Chloe regarde ça', { replyTo: shown.id, mentions: [u.chloe.userId, u.bob.userId] });
    const reply = (await t.query(api.chat.page, { sessionToken: u.bob.token, conv: CHAT_GENERAL })).msgs.at(-1)!;
    expect(reply.reply).toMatchObject({ id: shown.id, name: 'Alice' });
    expect((await t.query(api.chat.inbox, { sessionToken: u.chloe.token }))!.general.mention).toBe(true);
    expect((await t.query(api.chat.inbox, { sessionToken: u.alice.token }))!.general.mention).toBe(false);
    await t.mutation(api.chat.markRead, { sessionToken: u.chloe.token, conv: CHAT_GENERAL, n: r.n });
    expect((await t.query(api.chat.inbox, { sessionToken: u.chloe.token }))!.general.mention).toBe(false);
  });

  test('historique paginé, et retard trop grand → « more »', async () => {
    vi.useFakeTimers();
    const { t, u } = await setup();
    const total = CHAT_PAGE + 5;
    const at: number[] = [];
    for (let i = 1; i <= total; i++) {
      vi.advanceTimersByTime(30_000);
      at.push((await t.mutation(api.chat.send, { sessionToken: i % 2 ? u.alice.token : u.bob.token, conv: CHAT_GENERAL, text: `m${i}` })).at);
    }
    const p1 = await t.query(api.chat.page, { sessionToken: u.chloe.token, conv: CHAT_GENERAL });
    expect(p1.done).toBe(false);
    expect(p1.msgs).toHaveLength(CHAT_PAGE);
    expect(p1.msgs[0].text).toBe('m6');
    expect(p1.msgs.at(-1)!.text).toBe(`m${total}`);
    const p2 = await t.query(api.chat.page, { sessionToken: u.chloe.token, conv: CHAT_GENERAL, before: p1.msgs[0].at });
    expect(p2.done).toBe(true);
    expect(p2.msgs.map((m) => m.text)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    // suivre depuis le 3e message : 32 lignes, pas tout l'historique
    const tl = (await t.query(api.chat.tail, { sessionToken: u.chloe.token, conv: CHAT_GENERAL, after: at[2] }))!;
    expect(tl.msgs).toHaveLength(total - 3);
    expect(tl.more).toBe(false);
  });

  test('notifications : privé = une seule tant que ce n’est pas lu ; mention ; sourdine ; réveil du chat général', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T14:00:00+01:00'));
    process.env.VAPID_PUBLIC_KEY = 'test';
    const { t, u } = await setup();
    for (const who of ['alice', 'bob', 'chloe'] as const)
      await t.run(async (ctx) => ctx.db.insert('pushSubs', { userId: u[who].userId, endpoint: `https://push.test/${who}`, keys: { p256dh: 'k', auth: 'a' }, createdAt: Date.now() }));
    const key = dmKey(u.alice.userId, u.bob.userId);
    const sends = async () => (await jobs(t)).filter((j) => j.name.includes('pushSend')).map((j) => (j.args[0] as { payload: { title: string; tag: string; url: string; kind: string } }).payload);

    await say(t, u.alice.token, key, 'un');
    await say(t, u.alice.token, key, 'deux');
    await say(t, u.alice.token, key, 'trois');
    let s = await sends();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'chat', title: 'Alice', url: `#/chat/${key}` });
    // Bob lit, puis s'en va (plus d'une minute) : le message suivant le prévient de nouveau
    await t.mutation(api.chat.markRead, { sessionToken: u.bob.token, conv: key, n: 3 });
    await say(t, u.alice.token, key, 'il lit : pas de notification');
    expect(await sends()).toHaveLength(1);
    vi.advanceTimersByTime(5 * 60_000);
    await say(t, u.alice.token, key, 'tu es là ?');
    expect(await sends()).toHaveLength(2);
    // sourdine : plus rien
    await t.mutation(api.chat.mute, { sessionToken: u.bob.token, conv: key, on: true });
    expect((await t.query(api.chat.inbox, { sessionToken: u.bob.token }))!.muted).toEqual([key]);
    await t.mutation(api.chat.markRead, { sessionToken: u.bob.token, conv: key, n: 99 });
    vi.advanceTimersByTime(5 * 60_000);
    await say(t, u.alice.token, key, 'ohé');
    expect(await sends()).toHaveLength(2);

    // chat général : le premier message ne réveille personne ; une mention prévient la personne citée
    await say(t, u.alice.token, CHAT_GENERAL, 'bonjour');
    expect(await sends()).toHaveLength(2);
    await say(t, u.alice.token, CHAT_GENERAL, '@Chloe viens voir', { mentions: [u.chloe.userId] });
    s = await sends();
    expect(s).toHaveLength(3);
    expect(s[2]).toMatchObject({ title: 'Alice t’a mentionné', url: '#/chat/general' });
    // 20 min de silence mais le chat vient de démarrer (moins de 45 min) : pas de « réveil »
    const wakes = async () => (await jobs(t)).filter((j) => j.name.includes('generalWake')).length;
    vi.advanceTimersByTime(CHAT_WAKE_SILENCE_MS + 60_000);
    await say(t, u.bob.token, CHAT_GENERAL, 'toujours là ?');
    expect(await wakes()).toBe(0);
    // un long silence : le message suivant programme le « réveil » ; pas un deuxième avant 45 min
    vi.advanceTimersByTime(CHAT_WAKE_EVERY_MS + 60_000);
    await say(t, u.bob.token, CHAT_GENERAL, 'quelqu’un pour un Pack Battle ?');
    expect(await wakes()).toBe(1);
    vi.advanceTimersByTime(CHAT_WAKE_SILENCE_MS + 60_000);
    await say(t, u.bob.token, CHAT_GENERAL, 'personne ?');
    expect(await wakes()).toBe(1);
    // le réveil : tout le monde sauf l'auteur et ceux qui ont coupé le chat général
    await t.mutation(api.chat.mute, { sessionToken: u.chloe.token, conv: CHAT_GENERAL, on: true });
    const before = (await sends()).length;
    const r = await t.mutation(internal.chat.generalWake, { fromId: u.bob.userId, name: 'Bob', body: 'x', skip: [] });
    expect(r.players).toBe(1);
    s = await sends();
    expect(s).toHaveLength(before + 1);
    expect(s.at(-1)).toMatchObject({ title: 'Général · Bob', tag: 'chat-general' });
  });
});
