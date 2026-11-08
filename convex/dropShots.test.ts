/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { DROP_SHOT_WAIT_MS, escapeMd } from './dropShots';
import { ALL_THEMES, hasArt } from '../src/core/sets/themesCore';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);
const CARD = ALL_THEMES.flatMap((t) => t.cards).find((e) => hasArt(e))!;

async function player(t: ReturnType<typeof convexTest>, name: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      discordId: `${name}0000000`, username: name, displayName: name, packBalance: 1, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1, packRegenAt: 1, coins: 0, refCode: `${name}code1`,
    });
    await ctx.db.insert('sessions', { userId, token: `tok-${name}`, createdAt: 1, expiresAt: Date.now() + 86_400_000 });
    return userId;
  });
}

/** webhook Discord simulé : garde ce qui est posté */
function fakeDiscord() {
  const posts: Array<{ payload: { content: string; attachments?: Array<{ filename: string }> }; file: Blob | null }> = [];
  const siteHits: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('https://discord.test/')) {
      const form = init!.body as FormData;
      posts.push({ payload: JSON.parse(form.get('payload_json') as string), file: (form.get('files[0]') as Blob | null) ?? null });
      return new Response('{}', { status: 200 });
    }
    siteHits.push(String(url));
    return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), { status: 200 });
  });
  return { posts, siteHits };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('drops Discord (V2, 08/11) : la carte de face, le nom au-dessus', () => {
  test('image envoyée par le jeu : postée tout de suite, une seule fois, puis retirée du stockage', async () => {
    vi.useFakeTimers();
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.test/hook');
    const d = fakeDiscord();
    const t = convexTest(schema, modules);
    await player(t, 'holiut');
    const user = await t.run(async (ctx) => (await ctx.db.query('users').first())!);
    await t.run(async (ctx) => {
      const { queueDropShot } = await import('./dropShots');
      await queueDropShot(ctx as never, user, { cardId: CARD.id, cardName: 'Vincenzo Nibali', rarity: 'mythic', mintNumber: 2, isNew: true });
    });
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(2000)], { type: 'image/png' })));
    const r = await t.mutation(api.dropShots.attach, { sessionToken: 'tok-holiut', cardId: CARD.id, mintNumber: 2, storageId });
    expect(r.ok).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers); // envoi immédiat + secours à 45 s (qui ne fait rien)
    expect(d.posts).toHaveLength(1);
    expect(d.posts[0].payload.content).toBe('**holiut**');
    expect(d.posts[0].payload.attachments?.[0].filename).toBe('carte.png');
    expect(d.posts[0].file?.size).toBe(2000);
    expect(d.siteHits).toHaveLength(0);
    const after = await t.run(async (ctx) => ({ file: await ctx.storage.get(storageId), drop: await ctx.db.query('dropShots').first() }));
    expect(after.file).toBeNull();
    expect(after.drop?.postedAt).toBeTruthy();
    // trop tard : déjà publié → refusé, fichier supprimé
    const late = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(10)], { type: 'image/png' })));
    expect((await t.mutation(api.dropShots.attach, { sessionToken: 'tok-holiut', cardId: CARD.id, mintNumber: 2, storageId: late })).ok).toBe(false);
    expect(await t.run(async (ctx) => await ctx.storage.get(late))).toBeNull();
  });

  test('pas d\'image du jeu : le secours poste l\'illustration après 45 s', async () => {
    vi.useFakeTimers();
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.test/hook');
    const d = fakeDiscord();
    const t = convexTest(schema, modules);
    await player(t, 'peluche');
    const user = await t.run(async (ctx) => (await ctx.db.query('users').first())!);
    await t.run(async (ctx) => {
      const { queueDropShot } = await import('./dropShots');
      await queueDropShot(ctx as never, user, { cardId: CARD.id, cardName: 'Alex Ferguson', rarity: 'mythic', mintNumber: 1 });
    });
    vi.advanceTimersByTime(DROP_SHOT_WAIT_MS - 1000);
    expect(d.posts).toHaveLength(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(d.posts).toHaveLength(1);
    expect(d.posts[0].payload.content).toBe('**peluche**');
    expect(d.posts[0].file).not.toBeNull();
    expect(d.siteHits).toHaveLength(1);
  });

  test('image d\'un autre joueur ou d\'un autre drop : refusée', async () => {
    const t = convexTest(schema, modules);
    await player(t, 'a');
    const user = await t.run(async (ctx) => (await ctx.db.query('users').first())!);
    await player(t, 'b');
    await t.run(async (ctx) => {
      const { queueDropShot } = await import('./dropShots');
      await queueDropShot(ctx as never, user, { cardId: CARD.id, cardName: 'X', rarity: 'mythic', mintNumber: 3 });
    });
    const s1 = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(10)], { type: 'image/png' })));
    expect((await t.mutation(api.dropShots.attach, { sessionToken: 'tok-b', cardId: CARD.id, mintNumber: 3, storageId: s1 })).ok).toBe(false);
    const s2 = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(10)], { type: 'text/html' })));
    expect((await t.mutation(api.dropShots.attach, { sessionToken: 'tok-a', cardId: CARD.id, mintNumber: 3, storageId: s2 })).ok).toBe(false);
    expect(await t.run(async (ctx) => [await ctx.storage.get(s1), await ctx.storage.get(s2)])).toEqual([null, null]);
  });

  test('pseudo échappé (pas de gras cassé, pas de mention)', () => {
    expect(escapeMd('*léa*_@everyone')).toBe('\\*léa\\*\\_@​everyone');
  });
});
