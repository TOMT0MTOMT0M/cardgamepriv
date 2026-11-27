/// <reference types="vite/client" />
/**
 * (26/11, coût Convex, session 2) BOOSTERS : combien de fois le document joueur est lu et écrit par appel, et quelles
 * requêtes abonnées le lisent (chacune se relance à CHAQUE écriture de ce document : invalidation par document).
 * Mesure dans la base simulée de convex-test : nombre de lectures, pas l'octet exact de la prod (`scripts/cout-convex.mjs`).
 */
import { convexTest } from 'convex-test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { countReads, touches, type Reads } from './reads.testlib';
import * as packs from './packs';
import * as session from './session';
import * as trades from './trades';
import * as friends from './friends';
import * as binders from './binders';
import * as listings from './listings';
import * as inventory from './inventory';
import * as feed from './feed';
import * as challenges from './challenges';
import * as chat from './chat';
import * as users from './users';
import * as games from './games';
import { THEMES } from '../src/core/sets/themes';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

/** joueur au document de taille réaliste (≈ 2,7 Ko en prod) */
async function seed(t: ReturnType<typeof convexTest>, balance = 15) {
  const ids = THEMES.flatMap((x) => x.cards).slice(0, 110).map((c) => c.id);
  return await t.run(async (ctx) => {
    const now = Date.now();
    const base = { lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: now, packRegenAt: now } as const;
    const a = await ctx.db.insert('users', { ...base, discordId: 'a', username: 'a', displayName: 'Alice', packBalance: balance, wishlist: ids });
    const b = await ctx.db.insert('users', { ...base, discordId: 'b', username: 'b', displayName: 'Bob', packBalance: 5 });
    await ctx.db.insert('sessions', { userId: a, token: 'tok', createdAt: now, expiresAt: now + 86_400_000 });
    for (const [id, n] of [[a, 'Alice'], [b, 'Bob']] as const) await ctx.db.insert('presence', { userId: id, lastSeenAt: now, displayName: n, username: n, totalPacksOpened: 3 });
    // un échange en attente entre les deux (cas où `myTrades` lit des documents joueurs)
    await ctx.db.insert('trades', { fromUserId: b, toUserId: a, status: 'pending', offered: [], requested: [], createdAt: now } as never);
    return { a, b };
  });
}

const line = (name: string, r: Reads, id: string) => {
  const u = touches(r, id);
  return `${name.padEnd(22)} joueur lu ${String(u.gets).padStart(2)} × · écrit ${String(u.writes).padStart(2)} × · ${String(r.docs).padStart(3)} documents · ${(r.bytes / 1000).toFixed(1).padStart(6)} Ko`;
};

describe('coût des boosters', () => {
  test('lectures et écritures du document joueur par appel', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const out: string[] = [];

    const p1 = await countReads<never, { _id: string }>(t as never, packs.preparePack, { sessionToken: 'tok', packKind: 'bebou' });
    out.push(line('preparePack', p1.reads, a));
    const r1 = await countReads(t as never, packs.revealPack, { sessionToken: 'tok', packId: p1.result._id });
    out.push(line('revealPack', r1.reads, a));

    const p10 = await countReads<never, Array<{ _id: string }>>(t as never, packs.preparePacks, { sessionToken: 'tok', packKind: 'bebou', count: 10 });
    expect(p10.result).toHaveLength(10);
    out.push(line('preparePacks ×10', p10.reads, a));
    const r10 = await countReads(t as never, packs.revealPacks, { sessionToken: 'tok', packIds: p10.result.map((p) => p._id) });
    out.push(line('revealPacks ×10', r10.reads, a));
    console.log(`[mesure coût] boosters\n${out.join('\n')}`);
  });

  test('requêtes abonnées qui lisent le document joueur (relancées à chaque booster)', async () => {
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const tok = { sessionToken: 'tok' };
    const subs: Array<[string, unknown, Record<string, unknown>]> = [
      ['session:get', session.get, tok],
      ['trades:myTrades', trades.myTrades, tok],
      ['friends:mine', friends.mine, tok],
      ['binders:mine', binders.mine, tok],
      ['listings:mine', listings.mine, tok],
      ['listings:open', listings.open, tok],
      ['packs:getSealedPack', packs.getSealedPack, tok],
      ['inventory:mineSince', inventory.mineSince, { ...tok, since: 0 }],
      ['feed:bigPulls', feed.bigPulls, { limit: 30 }],
      ['challenges:mine', challenges.mine, tok],
      ['chat:inbox', chat.inbox, { ...tok, lean: true }],
      ['users:friends', users.friends, {}],
      ['games:lobby', games.lobby, tok],
      ['games:roulette', games.roulette, tok],
    ];
    const out: string[] = [];
    for (const [name, fn, args] of subs) {
      const { reads } = await countReads(t as never, fn, args);
      const u = touches(reads, a);
      out.push(`${name.padEnd(22)} ${u.gets ? `LIT le joueur (${u.gets} ×)` : 'ne lit pas le joueur'} · ${reads.docs} documents · ${(reads.bytes / 1000).toFixed(1)} Ko`);
    }
    console.log(`[mesure coût] requêtes abonnées\n${out.join('\n')}`);
  });
});

/**
 * (V3, piste Convex 9) UN BOOSTER EN RÉGIME ÉTABLI. Avant : `preparePack` puis `revealPack` (deux mutations, chacune
 * écrit le joueur et sa présence, donc relance `session:get`), et l'abonnement `getSealedPack` relancé deux fois.
 * Après : `openPack` seul (le booster suivant est déjà scellé d'avance, servi par le client sans appel), `session:get`
 * relancé une fois, plus d'abonnement `getSealedPack` (lu une fois au démarrage : `sealedMine`).
 * Documents écrits = documents distincts touchés par la mutation (Convex écrit un document une fois par mutation).
 */
test('piste 9 : un booster = une mutation (avant / après)', async () => {
  const written = (r: Reads) => new Set(r.writes.filter((w) => w.op !== 'insert').map((w) => w.id)).size + r.writes.filter((w) => w.op === 'insert').length;
  const tok = { sessionToken: 'tok' };

  // AVANT : preparePack + revealPack, abonnements relancés à chaque écriture du joueur
  const t1 = convexTest(schema, modules);
  await seed(t1);
  await t1.mutation(api.packs.revealPack, { ...tok, packId: (await t1.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' }))._id }); // 1er booster (froid)
  const prep = await countReads<never, { _id: string }>(t1 as never, packs.preparePack, { ...tok, packKind: 'bebou' });
  const sealedAfterPrep = (await countReads(t1 as never, packs.getSealedPack, tok)).reads;
  const rev = await countReads(t1 as never, packs.revealPack, { ...tok, packId: prep.result._id });
  const sealedAfterRev = (await countReads(t1 as never, packs.getSealedPack, tok)).reads;
  const sess1 = (await countReads(t1 as never, session.get, tok)).reads;
  const before = {
    calls: 2,
    bytes: prep.reads.bytes + rev.reads.bytes,
    written: written(prep.reads) + written(rev.reads),
    reruns: 2 * sess1.bytes + sealedAfterPrep.bytes + sealedAfterRev.bytes,
  };

  // APRÈS : openPack seul (crédite + scelle d'avance)
  const t2 = convexTest(schema, modules);
  await seed(t2);
  const first = await t2.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
  const warm = await t2.mutation(api.packs.openPack, { ...tok, packId: first._id }); // 1er booster (froid) : scelle le suivant
  const open = await countReads<never, { next: { _id: string } | null }>(t2 as never, packs.openPack, { ...tok, packId: warm.next!._id });
  expect(open.result.next).not.toBeNull();
  const sess2 = (await countReads(t2 as never, session.get, tok)).reads;
  const after = { calls: 1, bytes: open.reads.bytes, written: written(open.reads), reruns: sess2.bytes };

  const ko = (n: number) => `${(n / 1000).toFixed(1)} Ko`;
  const tot = (x: typeof before) => x.bytes + x.reruns;
  console.log(
    `[mesure coût] piste 9, un booster en régime établi\n` +
      `AVANT  ${before.calls} mutations · lu ${ko(before.bytes)} · ${before.written} documents écrits · relances (session:get ×2, getSealedPack ×2) ${ko(before.reruns)} · total lu ${ko(tot(before))}\n` +
      `APRÈS  ${after.calls} mutation  · lu ${ko(after.bytes)} · ${after.written} documents écrits · relances (session:get ×1) ${ko(after.reruns)} · total lu ${ko(tot(after))}\n` +
      `gain   ${(((tot(before) - tot(after)) / tot(before)) * 100).toFixed(0)} % lu · ${before.written - after.written} écritures en moins`,
  );
  expect(tot(after)).toBeLessThan(tot(before));
  // (fusion V3) les 2 écritures de présence gagnées par la piste 9 seule (« Contemple son tirage ») sont déjà retirées des
  // deux chemins par la piste 10 (lot convex) : ici, plus d'écriture, mais pas davantage
  expect(after.written).toBeLessThanOrEqual(before.written);
});

test('myTrades : documents joueurs lus pour afficher les noms (3 échanges en attente, 2 autres joueurs)', async () => {
  const t = convexTest(schema, modules);
  const { a, b } = await seed(t);
  const c = await t.run(async (ctx) => {
    const now = Date.now();
    const c = await ctx.db.insert('users', { discordId: 'c', username: 'c', displayName: 'Chloé', packBalance: 5, lastDailyClaimAt: 0, totalPacksOpened: 1, lastSeenAt: now, wishlist: THEMES.flatMap((x) => x.cards).slice(0, 110).map((k) => k.id) });
    await ctx.db.insert('presence', { userId: c, lastSeenAt: now, displayName: 'Chloé', username: 'c', totalPacksOpened: 1 });
    await ctx.db.insert('trades', { fromUserId: b, toUserId: a, status: 'pending', offered: [], requested: [], createdAt: now } as never);
    await ctx.db.insert('trades', { fromUserId: a, toUserId: c, status: 'pending', offered: [], requested: [], createdAt: now } as never);
    return c;
  });
  const { result, reads } = await countReads<never, { incoming: Array<{ fromName: string; toName: string }>; outgoing: Array<{ fromName: string; toName: string }> }>(t as never, trades.myTrades, { sessionToken: 'tok' });
  const users = reads.gets.filter((g) => g === a || g === b || g === c).length;
  console.log(`[mesure coût] myTrades, 3 échanges : ${users} document(s) joueur lu(s) · ${reads.scanned.presence ?? 0} présence(s) · ${reads.docs} documents · ${(reads.bytes / 1000).toFixed(1)} Ko`);
  expect(result.incoming.map((x) => [x.fromName, x.toName])).toEqual([['Bob', 'Alice'], ['Bob', 'Alice']]);
  expect(result.outgoing.map((x) => [x.fromName, x.toName])).toEqual([['Alice', 'Chloé']]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.VAPID_PUBLIC_KEY;
});

/**
 * MÊMES VALEURS QU'AVANT (pièces, missions, semaine, pity, God pack, parrainage, réserve, présence, collection, n°
 * d'impression, fil, rappel « réserve pleine ») : tirage forcé (aléa déterministe), heure figée, 14 boosters par les 4
 * chemins (preparePack / revealPack, preparePacks / revealPacks). L'empreinte de toute la base touchée ne doit pas bouger
 * quand on change la façon de lire et d'écrire. Détail lisible : `.claude-tmp/boosters-empreinte.json`.
 */
test('boosters : mêmes valeurs en base, quel que soit le chemin de lecture / écriture', async () => {
  vi.useFakeTimers({ now: new Date('2026-11-20T10:00:00Z'), toFake: ['Date'] });
  let s = 12345;
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(arr: T): T => {
    const a = arr as unknown as Uint32Array;
    for (let i = 0; i < a.length; i++) a[i] = s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return arr;
  });
  process.env.VAPID_PUBLIC_KEY = 'test';
  const t = convexTest(schema, modules);
  const { a, b } = await t.run(async (ctx) => {
    const now = Date.now();
    const base = { lastDailyClaimAt: 0, lastSeenAt: now - 600_000, packRegenAt: now - 600_000 } as const;
    const b = await ctx.db.insert('users', { ...base, discordId: 'b', username: 'b', displayName: 'Bob', packBalance: 5, totalPacksOpened: 40 });
    const a = await ctx.db.insert('users', { ...base, discordId: 'a', username: 'a', displayName: 'Alice', packBalance: 15, totalPacksOpened: 7, referredBy: b, godPacks: 1, pityCount: 197, coins: 50 });
    await ctx.db.insert('sessions', { userId: a, token: 'tok', createdAt: now, expiresAt: now + 86_400_000 });
    for (const [id, n] of [[a, 'Alice'], [b, 'Bob']] as const) await ctx.db.insert('presence', { userId: id, lastSeenAt: now - 600_000, displayName: n, username: n, totalPacksOpened: n === 'Bob' ? 40 : 7 });
    await ctx.db.insert('pushSubs', { userId: a, endpoint: 'https://push.test/a', keys: { p256dh: 'x', auth: 'y' }, createdAt: now });
    return { a, b };
  });
  const tok = { sessionToken: 'tok' };
  const step = async () => vi.setSystemTime(Date.now() + 7_000);
  const one = await t.mutation(api.packs.preparePack, { ...tok, packKind: 'bebou' });
  await step();
  await t.mutation(api.packs.revealPack, { ...tok, packId: one._id });
  await step();
  const ten = await t.mutation(api.packs.preparePacks, { ...tok, packKind: 'theme', themeId: 'gaming', count: 10 });
  expect(ten).toHaveLength(10);
  await step();
  await t.mutation(api.packs.revealPack, { ...tok, packId: ten[0]._id });
  await step();
  expect(await t.mutation(api.packs.revealPacks, { ...tok, packIds: ten.slice(1).map((p) => p._id) })).toHaveLength(9);
  await step();
  const three = await t.mutation(api.packs.preparePacks, { ...tok, packKind: 'bebou', count: 3 });
  await step();
  await t.mutation(api.packs.revealPacks, { ...tok, packIds: three.map((p) => p._id) });

  const dump = await t.run(async (ctx) => {
    const ids = new Map<string, string>([[a, 'A'], [b, 'B']]);
    const strip = (x: unknown): unknown =>
      JSON.parse(JSON.stringify(x, (k, v) => (k === '_id' || k === '_creationTime' || k === 'notifFullJob' || k === 'scheduledFunctionId' ? undefined : typeof v === 'string' && ids.has(v) ? ids.get(v) : typeof v === 'string' && /^\d{12,}[A-Za-z_]+$/.test(v) ? `id:${v.replace(/^\d+/, '')}` : v)));
    const sorted = <X,>(xs: X[]) => xs.map(strip).map((x) => JSON.stringify(x)).sort();
    const jobs = (await ctx.db.system.query('_scheduled_functions').collect()).filter((j) => j.state.kind === 'pending');
    return {
      users: [strip(await ctx.db.get(a)), strip(await ctx.db.get(b))],
      presence: sorted(await ctx.db.query('presence').collect()),
      inventory: sorted(await ctx.db.query('inventory').collect()),
      coinTx: sorted(await ctx.db.query('coinTx').collect()),
      packOpens: sorted(await ctx.db.query('packOpens').collect()),
      cardMints: sorted(await ctx.db.query('cardMints').collect()),
      activityFeed: sorted(await ctx.db.query('activityFeed').collect()),
      dropShots: sorted(await ctx.db.query('dropShots').collect()),
      pendingJobs: sorted(jobs.map((j) => ({ name: j.name, args: j.args, at: j.scheduledTime }))),
    };
  });
  const json = JSON.stringify(dump, null, 1);
  mkdirSync(new URL('../.claude-tmp/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../.claude-tmp/boosters-empreinte.json', import.meta.url), json);
  const ua = dump.users[0] as Record<string, unknown>;
  console.log(`[mesure coût] empreinte : pièces ${ua.coins} · boosters ouverts ${ua.totalPacksOpened} · réserve ${ua.packBalance} · pity ${ua.pityCount} · parrain payé ${ua.referralPaid} · ${dump.inventory.length} lignes · ${dump.pendingJobs.length} rappel(s)`);
  expect(ua.totalPacksOpened).toBe(21);
  expect(ua.referralPaid).toBe(true);
  // (V3, piste 10) empreinte changée : seuls `users.statusText` (plus de « Contemple son tirage ») et la carte de
  // présence (écrite au plus toutes les 10 min : compteur et « vu à » en retard) diffèrent — comparé ligne à ligne
  expect(createHash('sha256').update(json).digest('hex').slice(0, 16)).toMatchInlineSnapshot(`"d555fd72f6b6d7b4"`);
});
