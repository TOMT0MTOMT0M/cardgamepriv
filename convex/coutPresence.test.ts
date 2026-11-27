/// <reference types="vite/client" />
/**
 * (V3, coût Convex, piste 10 de docs/chantiers/convex-pistes.md) PRÉSENCE MOINS BAVARDE. Chaque écriture de la carte
 * de présence relance la liste du club (`users:friends`, ≈ 10 Ko en prod) chez tous ceux qui l'ont ouverte, et
 * `friends:mine` chez ses amis. Mesure dans la base simulée (convex-test) : écritures de la présence pendant une heure
 * de jeu (un booster toutes les 5 min, battement de cœur toutes les 110 s comme le client), et ce que le club voit.
 */
import { convexTest } from 'convex-test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { ONLINE_MS } from '../src/core/online';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);

afterEach(() => {
  vi.useRealTimers();
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const base = { lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: now, packRegenAt: now } as const;
    const a = await ctx.db.insert('users', { ...base, discordId: 'a', username: 'a', displayName: 'Alice', packBalance: 15 });
    const b = await ctx.db.insert('users', { ...base, discordId: 'b', username: 'b', displayName: 'Bob', packBalance: 5 });
    await ctx.db.insert('sessions', { userId: a, token: 'tok', createdAt: now, expiresAt: now + 86_400_000 });
    for (const [id, n] of [[a, 'Alice'], [b, 'Bob']] as const) await ctx.db.insert('presence', { userId: id, lastSeenAt: now, displayName: n, username: n, totalPacksOpened: 3 });
    return { a, b };
  });
}

describe('présence moins bavarde', () => {
  test('une heure de jeu : écritures de la présence (mesure)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T19:00:00Z'));
    const t = convexTest(schema, modules);
    const { a } = await seed(t);
    const snap = async () => JSON.stringify(await t.run((ctx) => ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', a)).first()));
    let last = await snap();
    let writes = 0;
    let boosters = 0;
    let beats = 0;
    const statuses = new Set<string>();
    const seen = async () => {
      const s = await snap();
      if (s !== last) writes++;
      last = s;
      statuses.add(JSON.parse(s).statusText ?? '');
    };
    await t.mutation(api.users.heartbeat, { sessionToken: 'tok' });
    await seen();
    writes = 0;
    let lastBeat = Date.now();
    let worstGap = 0;
    // une seconde à la fois : booster toutes les 5 min, battement toutes les 110 s ; « en ligne » vu par le club
    for (let s = 1; s <= 3600; s++) {
      vi.advanceTimersByTime(1000);
      if (s % 300 === 0) {
        const p = await t.mutation(api.packs.preparePack, { sessionToken: 'tok', packKind: 'bebou' });
        await seen();
        await t.mutation(api.packs.revealPack, { sessionToken: 'tok', packId: (p as { _id: never })._id });
        await seen();
        boosters++;
      }
      if (Date.now() - lastBeat >= 110_000) {
        await t.mutation(api.users.heartbeat, { sessionToken: 'tok' });
        lastBeat = Date.now();
        beats++;
        await seen();
      }
      if (s % 30 === 0) {
        const club = await t.query(api.users.friends, {});
        const me = club.find((x) => x._id === a)!;
        worstGap = Math.max(worstGap, me.seenAgo);
        expect(me.online).toBe(true); // un joueur présent ne paraît jamais parti
      }
    }
    const final = JSON.parse(last);
    const out = `1 h de jeu (${boosters} boosters, ${beats} battements) : ${writes} écritures de la présence ; « vu à » au pire ${Math.round(worstGap / 60_000)} min (fenêtre ${ONLINE_MS / 60_000} min) ; statuts vus : ${[...statuses].join(' | ')}`;
    mkdirSync('.cache', { recursive: true });
    writeFileSync('.cache/cout-presence.txt', out + '\n');
    console.log(out);
    // le compteur de boosters rattrape au plus tard à la prochaine écriture (ici, dans les 10 min)
    expect(final.totalPacksOpened).toBeGreaterThanOrEqual(3 + boosters - 2);
  }, 120_000);
});
