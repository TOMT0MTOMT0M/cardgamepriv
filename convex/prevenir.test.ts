/// <reference types="vite/client" />
/**
 * (26/11) Prévenir l'équipe après une mise en ligne prod (convex/discordBot.ts, prevenirEquipe) : celui qui publie
 * ne reçoit pas le MP, l'autre si ; inconnu → tous les admins ; jamais un joueur non admin.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { staffTargets } from './discordBot';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
const TOM = { discordId: '111111111111', name: 'TOM', username: 'tom0611' };
const HUGO = { discordId: '222222222222', name: 'Hugo', username: 'hugo_____' };

describe('prévenir l’équipe', () => {
  test('celui qui publie est reconnu par son nom de session Windows', () => {
    expect(staffTargets([TOM, HUGO], 'Tom')).toEqual([HUGO]);
    expect(staffTargets([TOM, HUGO], 'hugo')).toEqual([TOM]);
    expect(staffTargets([TOM, HUGO], 'Hugoo')).toEqual([TOM, HUGO]); // pas reconnu : tout le monde
    expect(staffTargets([TOM, HUGO], 'PC')).toEqual([TOM, HUGO]); // trop court pour comparer
    expect(staffTargets([TOM, HUGO], undefined)).toEqual([TOM, HUGO]);
  });

  test('seuls les admins avec un compte Discord ; sans jeton, rien n’est envoyé', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const base = { packBalance: 0, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 0 };
      await ctx.db.insert('users', { ...base, discordId: TOM.discordId, username: TOM.username, displayName: TOM.name, isAdmin: true } as never);
      await ctx.db.insert('users', { ...base, discordId: HUGO.discordId, username: HUGO.username, displayName: HUGO.name, isAdmin: true } as never);
      await ctx.db.insert('users', { ...base, discordId: '333333333333', username: 'joueur', displayName: 'Joueur' } as never);
      await ctx.db.insert('users', { ...base, discordId: 'pw:admin', username: 'sanscompte', displayName: 'Sans Discord', isAdmin: true } as never);
    });
    const staff = await t.query(internal.discordBot.staffIds, {});
    expect(staff.map((s) => s.name).sort()).toEqual(['Hugo', 'TOM']);
    expect(await t.action(internal.discordBot.prevenirEquipe, { texte: 'essai', sauf: 'Tom' })).toEqual(['pas de DISCORD_BOT_TOKEN : personne prévenu']);
  });
});
