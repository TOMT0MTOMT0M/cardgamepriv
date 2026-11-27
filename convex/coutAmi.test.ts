/// <reference types="vite/client" />
/**
 * (V3, coût Convex, piste 3 de docs/chantiers/convex-pistes.md) COLLECTION D'UN AMI gardée sur l'appareil.
 * Mesure dans la base simulée (convex-test, `reads.testlib.ts`) : ce que lit `inventory.userCollectionSince` pour un ami
 * à 12 000 lignes — 1re ouverture (en pages), réouverture un autre jour (copie de l'appareil + différence), contre
 * v2.1.32 (copie le temps de la session : toute nouvelle session relisait tout). Et : la copie tenue par pages puis par
 * différence égale toujours la collection complète ; bornes de la copie (10 amis, 60 000 lignes).
 */
import { convexTest } from 'convex-test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import schema from './schema';
import { countReads } from './reads.testlib';
import * as inventory from './inventory';
import { invOf, USER_PAGE } from './inventory';
import { CATALOG_CARDS } from './cardsCatalog';
import { InvMirror, type InvRow } from '../src/core/net/invDiff';
import { friendLru } from '../src/core/net/invStore';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const N = 12_000;

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const u = await ctx.db.insert('users', { discordId: 'f', username: 'f', displayName: 'Ami', packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 } as never);
    // lignes anciennes (écrites une par seconde jusqu'à il y a 10 jours), réparties sur les étoiles pour dépasser la
    // taille du catalogue
    const old = Date.now() - 10 * 86_400_000 - N * 1000;
    for (let i = 0; i < N; i++) {
      const c = CATALOG_CARDS[i % CATALOG_CARDS.length];
      const rarity = RAR[Math.floor(i / CATALOG_CARDS.length) % RAR.length];
      const at = old + i * 1000;
      await ctx.db.insert('inventory', { userId: u, cardId: c.id, rarity, count: 1 + (i % 3), bestMintNumber: 1 + (i % 97), foilSeed: 0, firstPulledAt: at, lastPulledAt: at, rev: at } as never);
    }
    return u;
  });
}

type Since = { rows: InvRow[]; gone: Array<{ cardId: string; rarity: string; rev: number }>; more: boolean; full: InvRow[][] | null; page?: Array<InvRow & { t: number }>; cursor?: string; done?: boolean };
const slimOf = (r: { cardId: string; rarity: string; count: number; bestMintNumber: number; firstPulledAt: number; rev?: number }) => ({ cardId: r.cardId, rarity: r.rarity, count: r.count, bestMintNumber: r.bestMintNumber, firstPulledAt: r.firstPulledAt });

describe('collection d’un ami gardée sur l’appareil', () => {
  test(`ami à ${N} lignes : 1re ouverture par pages, réouverture par différence (mesure)`, async () => {
    const t = convexTest(schema, modules);
    const u = await seed(t);
    const out: string[] = [];
    const ko = (b: number) => `${(b / 1000).toFixed(1)} Ko`;

    // AVANT (v2.1.32) : chaque nouvelle session relit tout d'un coup
    const before = await countReads<never, Since>(t as never, inventory.userCollectionSince, { userId: u });
    out.push(`avant — ouverture dans une nouvelle session : ${before.reads.docs} documents, ${ko(before.reads.bytes)}`);

    // APRÈS : 1re ouverture par pages
    let cursor: string | null = null;
    let docs = 0;
    let bytes = 0;
    let calls = 0;
    const got: Array<InvRow & { t: number }> = [];
    for (;;) {
      const p: { result: Since; reads: { docs: number; bytes: number } } = await countReads<never, Since>(t as never, inventory.userCollectionSince, { userId: u, cursor });
      calls++;
      docs += p.reads.docs;
      bytes += p.reads.bytes;
      expect(p.reads.docs).toBeLessThanOrEqual(USER_PAGE + 1);
      got.push(...(p.result.page ?? []));
      if (p.result.done) break;
      cursor = p.result.cursor ?? null;
    }
    out.push(`après — 1re ouverture : ${calls} pages, ${docs} documents, ${ko(bytes)} (aucune page > ${USER_PAGE} lignes)`);
    got.sort((a, b) => a.t - b.t);
    const full = await t.run(async (ctx) => (await invOf(ctx, u)).map(slimOf));
    expect(got.map(slimOf)).toEqual(full);

    // la copie de l'appareil (lignes avec révision) ; l'ami ouvre 2 boosters entre-temps (10 lignes) et perd une carte
    const m = new InvMirror();
    m.reset(got.map(({ t: _t, ...r }) => r));
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        const c = CATALOG_CARDS[(N + i * 7) % CATALOG_CARDS.length];
        await ctx.db.insert('inventory', { userId: u, cardId: c.id, rarity: 'mythic', count: 1, bestMintNumber: 3, foilSeed: 0, firstPulledAt: now, lastPulledAt: now, rev: now } as never);
      }
      const gone = (await invOf(ctx, u))[5];
      await ctx.db.delete(gone._id);
      await ctx.db.insert('invGone', { userId: u, cardId: gone.cardId, rarity: gone.rarity, rev: now, born: gone._creationTime });
    });
    const again = await countReads<never, Since>(t as never, inventory.userCollectionSince, { userId: u, since: m.since() });
    out.push(`après — réouverture un autre jour (2 boosters ouverts entre-temps) : ${again.reads.docs} documents, ${ko(again.reads.bytes)}`);
    expect(again.result.more).toBe(false);
    m.apply(again.result);
    const fullNow = await t.run(async (ctx) => (await invOf(ctx, u)).map(slimOf));
    const sortKey = (a: { cardId: string; rarity: string }, b: { cardId: string; rarity: string }) => (a.cardId + a.rarity < b.cardId + b.rarity ? -1 : 1);
    expect([...m.cards].sort(sortKey)).toEqual([...fullNow].sort(sortKey));

    const same = await countReads<never, Since>(t as never, inventory.userCollectionSince, { userId: u, since: m.since() });
    out.push(`après — réouverture sans changement : ${same.reads.docs} documents, ${ko(same.reads.bytes)}`);

    expect(again.reads.bytes).toBeLessThan(before.reads.bytes / 100);
    mkdirSync('.cache', { recursive: true });
    writeFileSync('.cache/cout-ami.txt', out.join('\n') + '\n');
    console.log(out.join('\n'));
  }, 120_000);

  test('bornes de la copie : 10 amis, 60 000 lignes, les moins récemment ouverts partent', () => {
    let index: ReturnType<typeof friendLru>['index'] = [];
    const evicted: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = friendLru(index, `u${i}`, 1000, i);
      index = r.index;
      evicted.push(...r.evict);
    }
    expect(index.map((s) => s.id)).toEqual(['u11', 'u10', 'u9', 'u8', 'u7', 'u6', 'u5', 'u4', 'u3', 'u2']);
    expect(evicted).toEqual(['u0', 'u1']);
    // rouvrir u2 (sans nouvelle copie) le remet en tête
    const re = friendLru(index, 'u2', -1, 100);
    expect(re.index[0]).toEqual({ id: 'u2', used: 100, n: 1000 });
    expect(re.evict).toEqual([]);
    // un gros collectionneur fait de la place en lignes
    const big = friendLru(re.index, 'gros', 55_000, 101);
    expect(big.index.reduce((s, x) => s + x.n, 0)).toBeLessThanOrEqual(60_000);
    expect(big.index[0].id).toBe('gros');
    expect(big.evict.length).toBe(5);
    // trop gros pour être gardé : pas de copie (et l'ancienne est effacée)
    const huge = friendLru(big.index, 'gros', 70_000, 102);
    expect(huge.index.some((s) => s.id === 'gros')).toBe(false);
    expect(huge.evict).toEqual(['gros']);
    // ami inconnu marqué ouvert sans copie : rien
    expect(friendLru([], 'x', -1, 0)).toEqual({ index: [], evict: [] });
  });
});
