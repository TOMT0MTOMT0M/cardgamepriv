/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { isDiscordSnowflake } from './discordRoles';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

/** API Discord simulée : rôles du serveur + qui est membre */
function fakeDiscord(members: string[]) {
  const puts: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/guilds/875043597022531654/roles')) return Response.json([{ id: '1', name: 'card', managed: true }, { id: '1569049431129726996', name: 'Card' }, { id: '9', name: 'Modo' }]);
    const m = u.match(/\/guilds\/875043597022531654\/members\/(\d+)\/roles\/(\d+)$/);
    if (m && init?.method === 'PUT') {
      puts.push(`${m[1]}>${m[2]}`);
      return members.includes(m[1]) ? new Response(null, { status: 204 }) : Response.json({ code: 10007, message: 'Unknown Member' }, { status: 404 });
    }
    return new Response('{}', { status: 200 });
  });
  return puts;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('rôle Discord « Card » (08/11)', () => {
  test('connexion Discord : rôle « Card » donné (et pas le rôle du bot du même nom)', async () => {
    vi.useFakeTimers();
    vi.stubEnv('DISCORD_BOT_TOKEN', 'x');
    const puts = fakeDiscord(['216667515303100417']);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { discordId: '216667515303100417', username: 'tom', displayName: 'tom', packBalance: 1, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1, packRegenAt: 1, coins: 0, refCode: 'tomcode1' });
    });
    await t.mutation(internal.auth.upsertDiscordUser, { discordId: '216667515303100417', username: 'tom0611', displayName: 'TOM' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(puts).toEqual(['216667515303100417>1569049431129726996']);
  });

  test('rattrapage : tous les joueurs Discord, pas les comptes pseudo ni les bannis ; absents du serveur comptés à part', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', 'x');
    const puts = fakeDiscord(['111111111111111111']);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const base = { packBalance: 1, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1, packRegenAt: 1, coins: 0 };
      await ctx.db.insert('users', { ...base, discordId: '111111111111111111', username: 'a', displayName: 'Léa', refCode: 'a1' });
      await ctx.db.insert('users', { ...base, discordId: '222222222222222222', username: 'b', displayName: 'Absent', refCode: 'b1' });
      await ctx.db.insert('users', { ...base, discordId: 'pw:hugo', username: 'c', displayName: 'Pseudo', refCode: 'c1' });
      await ctx.db.insert('users', { ...base, discordId: '333333333333333333', username: 'd', displayName: 'Banni', refCode: 'd1', bannedAt: 1 });
    });
    const r = await t.action(internal.discordRoles.grantCardRoleAll, {});
    expect(r).toMatchObject({ joueurs: 2, ajoutes: '1 : Léa', absents: '1 : Absent', refuses: '0', erreurs: '0' });
    expect(puts).toHaveLength(2);
  });

  test('sans jeton du bot : rien n\'est appelé', async () => {
    const puts = fakeDiscord([]);
    const t = convexTest(schema, modules);
    expect(await t.action(internal.discordRoles.grantCardRole, { discordId: '111111111111111111' })).toBe('DISCORD_BOT_TOKEN absent');
    expect(puts).toHaveLength(0);
    expect(isDiscordSnowflake('pw:léa')).toBe(false);
  });
});
