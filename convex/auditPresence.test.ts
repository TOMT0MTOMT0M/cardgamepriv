/// <reference types="vite/client" />
/**
 * Audit perf 12/11, décision 8 : table `presence` (carte publique des joueurs, convex/presence.ts).
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { countReads } from './reads.testlib';
import * as friends from './friends';
import * as users from './users';
import { syncPresence } from './presence';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const OLD = Date.now() - 3600_000;

async function setup(n = 6) {
  const t = convexTest(schema, modules);
  const ids: Array<{ userId: Id<'users'>; token: string }> = [];
  for (let i = 0; i < n; i++)
    ids.push(
      await t.run(async (ctx) => {
        // document joueur « réel » : la partie privée (envies, économie, missions) pèse bien plus que la carte publique
        const userId = await ctx.db.insert('users', {
          discordId: `d${i}`, username: `joueur${i}`, displayName: `Joueur ${i}`, avatarUrl: `https://cdn.example/a${i}.png`, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 10 + i, lastSeenAt: OLD + i, packRegenAt: OLD, statusText: 'Contemple son tirage',
          wishlist: Array.from({ length: 60 }, (_, k) => `carte-${k}`), coins: 500,
        });
        await ctx.db.insert('sessions', { token: `tok-${i}`, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
        return { userId, token: `tok-${i}` };
      }),
    );
  // le joueur 0 est ami avec tous les autres
  await t.run(async (ctx) => {
    for (const o of ids.slice(1)) await ctx.db.insert('friendships', { requesterId: ids[0].userId, addresseeId: o.userId, status: 'accepted', createdAt: 1, respondedAt: 2 });
  });
  return { t, ids };
}
const strip = <T extends { friendshipId?: unknown }>(x: T) => x;

describe('décision 8 — table de présence', () => {
  test('avant la migration : rien ne change ; après : mêmes réponses, lectures allégées', async () => {
    const { t, ids } = await setup();
    const me = { sessionToken: ids[0].token };
    const clubBefore = await t.query(api.users.friends, {});
    const mineBefore = await t.query(api.friends.mine, me);
    const rb = { club: (await countReads(t as never, users.friends, {})).reads, mine: (await countReads(t as never, friends.mine, me)).reads };
    expect(rb.mine.gets.filter((id) => ids.some((x) => x.userId === id))).toHaveLength(5);

    expect(await t.mutation(internal.migrations.backfillPresence, {})).toEqual({ users: 6, created: 6 });
    expect(await t.mutation(internal.migrations.backfillPresence, {})).toEqual({ users: 6, created: 0 });

    const noAge = (l: typeof clubBefore) => l.map(({ seenAgo: _a, ...f }) => f); // l'âge dépend de l'instant de l'appel
    expect(noAge(await t.query(api.users.friends, {}))).toEqual(noAge(clubBefore));
    expect(strip(await t.query(api.friends.mine, me))).toEqual(mineBefore);
    const ra = { club: (await countReads(t as never, users.friends, {})).reads, mine: (await countReads(t as never, friends.mine, me)).reads };
    // plus aucun document `users` lu
    expect(ra.mine.gets.filter((id) => ids.some((x) => x.userId === id))).toHaveLength(0);
    expect(ra.club.scanned.users ?? 0).toBe(0);
    console.log(`[mesure présence] 6 joueurs — users.friends : ${rb.club.bytes} → ${ra.club.bytes} octets lus ; friends.mine (5 amis) : ${rb.mine.bytes} → ${ra.mine.bytes} octets lus, documents joueur lus ${rb.mine.gets.length} → ${ra.mine.gets.filter((id) => ids.some((x) => x.userId === id)).length}`);
    expect(ra.club.bytes).toBeLessThan(rb.club.bytes / 2);
  });

  test('battement : écrit la présence, plus le document joueur', async () => {
    const { t, ids } = await setup(2);
    const doc = () => t.run((ctx) => ctx.db.get(ids[0].userId));
    const card = () => t.run((ctx) => ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', ids[0].userId)).first());
    // 1re visite du jour : la série s'écrit dans le document (une fois), comme avant
    await t.mutation(api.users.heartbeat, { sessionToken: ids[0].token });
    await t.mutation(internal.migrations.backfillPresence, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(ids[0].userId, { lastSeenAt: OLD });
      await ctx.db.patch((await ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', ids[0].userId)).first())!._id, { lastSeenAt: OLD });
    });
    const before = await doc();
    await t.mutation(api.users.heartbeat, { sessionToken: ids[0].token });
    expect(await doc()).toEqual(before); // aucune écriture sur `users` : profil, économie, missions ne repartent pas
    expect((await card())!.lastSeenAt).toBeGreaterThan(Date.now() - 5000);
    // battement suivant, moins de 4 min après : aucune écriture du tout
    const c1 = await card();
    await t.mutation(api.users.heartbeat, { sessionToken: ids[0].token });
    expect(await card()).toEqual(c1);
    // en ligne dans la liste du club
    expect((await t.query(api.users.friends, {})).find((f) => f._id === ids[0].userId)!.online).toBe(true);
    expect((await t.query(api.users.friends, {})).find((f) => f._id === ids[1].userId)!.online).toBe(false);
  });

  test('la carte suit les gestes, le bannissement et les nouveaux joueurs ; une écriture privée ne la touche pas', async () => {
    const { t, ids } = await setup(3);
    await t.mutation(internal.migrations.backfillPresence, {});
    const card = (id: Id<'users'>) => t.run((ctx) => ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', id)).first());
    const c0 = await card(ids[0].userId);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids[0].userId, { coins: 900, wishlist: [] });
      await syncPresence(ctx, ids[0].userId);
    });
    expect(await card(ids[0].userId)).toEqual(c0); // même document, pas réécrit
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: ids[1].token, packKind: 'bebou' });
    expect((await card(ids[1].userId))!.statusText).toMatch(/^Ouvre un/);
    await t.mutation(api.packs.revealPack, { sessionToken: ids[1].token, packId: pack._id });
    expect(await card(ids[1].userId)).toMatchObject({ totalPacksOpened: 12, statusText: 'Contemple son tirage' });
    // banni : sorti de la liste du club
    await t.run(async (ctx) => {
      await ctx.db.patch(ids[2].userId, { bannedAt: Date.now() });
      await syncPresence(ctx, ids[2].userId);
    });
    expect((await t.query(api.users.friends, {})).map((f) => f._id)).not.toContain(ids[2].userId);
    // supprimé : sa carte part
    await t.run(async (ctx) => {
      await ctx.db.delete(ids[2].userId);
      await syncPresence(ctx, ids[2].userId);
    });
    expect(await card(ids[2].userId)).toBeNull();
  });

  test('table vide : un geste ne crée pas de ligne isolée (la liste du club resterait incomplète)', async () => {
    const { t, ids } = await setup(3);
    const pack = await t.mutation(api.packs.preparePack, { sessionToken: ids[1].token, packKind: 'bebou' });
    await t.mutation(api.packs.revealPack, { sessionToken: ids[1].token, packId: pack._id });
    await t.mutation(api.users.heartbeat, { sessionToken: ids[0].token });
    expect(await t.run((ctx) => ctx.db.query('presence').collect())).toEqual([]);
    expect(await t.query(api.users.friends, {})).toHaveLength(3);
  });
});
