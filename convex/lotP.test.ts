/// <reference types="vite/client" />
/**
 * Retours live 02 — lot P : photo de profil / bannière importées (GIF), stockage Convex.
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { PROFILE_MEDIA_MAX, profileMediaProblem } from '../src/core/cosmetics';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup() {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of ['alice', 'bob'])
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: name, username: name, displayName: name, avatarUrl: `https://cdn.discord/${name}.png`, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(),
      });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, u };
}

const gif = (bytes: number, type = 'image/gif') => new Blob([new Uint8Array(bytes)], { type });
const store = (t: Awaited<ReturnType<typeof setup>>['t'], blob: Blob) => t.run((ctx) => ctx.storage.store(blob));
const exists = (t: Awaited<ReturnType<typeof setup>>['t'], id: Id<'_storage'>) => t.run(async (ctx) => !!(await ctx.db.system.get(id)));

describe('profil : GIF importé (photo / bannière)', () => {
  test('règle partagée : formats et poids', () => {
    expect(profileMediaProblem(1000, 'image/gif')).toBe('');
    expect(profileMediaProblem(1000, 'image/webp')).toBe('');
    expect(profileMediaProblem(1000, 'video/mp4')).toMatch(/Format refusé/);
    expect(profileMediaProblem(PROFILE_MEDIA_MAX + 1, 'image/gif')).toMatch(/trop lourd.*2 Mo au maximum/);
    expect(profileMediaProblem(800 * 1024, 'image/gif', 700 * 1024)).toMatch(/700 Ko au maximum/);
  });

  test('adresse d’envoi : connecté seulement', async () => {
    const { t, u } = await setup();
    await expect(t.mutation(api.profiles.generateMediaUploadUrl, { sessionToken: 'nope' })).rejects.toThrow();
    expect(await t.mutation(api.profiles.generateMediaUploadUrl, { sessionToken: u.alice.token })).toMatch(/^https?:/);
  });

  test('enregistrer, lire dans le profil, remplacer (l’ancien fichier est supprimé), retirer', async () => {
    const { t, u } = await setup();
    const a = await store(t, gif(1500));
    const r = await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'avatar', storageId: a });
    expect(r.url).toMatch(/^https?:/);
    let p = await t.query(api.profiles.profile, { userId: u.alice.userId });
    expect(p?.avatarMedia).toBe(r.url);
    expect(p?.bannerMedia).toBeUndefined();
    expect(p?.avatarUrl).toBe('https://cdn.discord/alice.png'); // l'avatar Discord reste (repli)
    const b = await store(t, gif(2000));
    await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'avatar', storageId: b });
    expect(await exists(t, a)).toBe(false);
    const bn = await store(t, gif(3000, 'image/png'));
    await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'banner', storageId: bn });
    p = await t.query(api.profiles.profile, { userId: u.alice.userId });
    expect(p?.avatarMedia).toBeTruthy();
    expect(p?.bannerMedia).toBeTruthy();
    // retirer : retour à l'avatar Discord, fichier supprimé
    await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'avatar' });
    p = await t.query(api.profiles.profile, { userId: u.alice.userId });
    expect(p?.avatarMedia).toBeUndefined();
    expect(await exists(t, b)).toBe(false);
    expect(await exists(t, bn)).toBe(true);
  });

  test('refus clair au-delà de 2 Mo ou hors format : le fichier est supprimé, rien n’est enregistré', async () => {
    const { t, u } = await setup();
    const big = await store(t, gif(PROFILE_MEDIA_MAX + 10));
    expect((await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'banner', storageId: big })).error).toMatch(/trop lourd/);
    expect(await exists(t, big)).toBe(false);
    const mp4 = await store(t, gif(100, 'video/mp4'));
    expect((await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'avatar', storageId: mp4 })).error).toMatch(/Format refusé/);
    expect(await exists(t, mp4)).toBe(false);
    const p = await t.query(api.profiles.profile, { userId: u.alice.userId });
    expect(p?.avatarMedia).toBeUndefined();
    expect(p?.bannerMedia).toBeUndefined();
  });

  test('le fichier d’un autre joueur ne peut être ni repris ni supprimé', async () => {
    const { t, u } = await setup();
    const a = await store(t, gif(1500));
    await t.mutation(api.profiles.setProfileMedia, { sessionToken: u.alice.token, kind: 'avatar', storageId: a });
    await expect(t.mutation(api.profiles.setProfileMedia, { sessionToken: u.bob.token, kind: 'avatar', storageId: a })).rejects.toThrow(/⟦(profiles\.8)[⟧{]/);
    expect(await exists(t, a)).toBe(true);
    expect((await t.query(api.profiles.profile, { userId: u.alice.userId }))?.avatarMedia).toBeTruthy();
  });
});
