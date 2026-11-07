/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function user(t: ReturnType<typeof convexTest>, name: string, display = name) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      discordId: name, username: name, displayName: display, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(),
    });
    const token = `tok-${name}`;
    await ctx.db.insert('sessions', { userId, token, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    return { userId, token };
  });
}
const bal = (t: ReturnType<typeof convexTest>, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.packBalance);

describe('parrainage après coup (07/11)', () => {
  test('lien entier collé, pseudo avec accents / majuscules / @, état « canClaim » / « myReferrer »', async () => {
    const t = convexTest(schema, modules);
    const p = await user(t, 'gaetan', 'Gaëtan');
    const a = await user(t, 'ami1');
    const b = await user(t, 'ami2');
    const { code } = await t.mutation(api.referrals.mine, { sessionToken: p.token });
    let s = await t.mutation(api.referrals.mine, { sessionToken: a.token });
    expect(s.canClaim).toBe(true);
    expect(s.myReferrer).toBeUndefined();
    const r1 = await t.mutation(api.referrals.claim, { sessionToken: a.token, code: `https://cardgamepriv.pages.dev/jeu/?ref=${code}` });
    expect(r1.status).toBe('ok');
    expect(await bal(t, a.userId)).toBe(25);
    s = await t.mutation(api.referrals.mine, { sessionToken: a.token });
    expect(s.canClaim).toBe(false);
    expect(s.myReferrer).toBe('Gaëtan');
    const r2 = await t.mutation(api.referrals.claim, { sessionToken: b.token, code: '@GAETAN' });
    expect(r2.status).toBe('ok');
    expect((await t.mutation(api.referrals.claim, { sessionToken: b.token, code: 'personne' })).status).toBe('already');
    const c = await user(t, 'ami3');
    expect((await t.mutation(api.referrals.claim, { sessionToken: c.token, code: 'inconnu-total' })).status).toBe('invalid');
    expect((await t.mutation(api.referrals.mine, { sessionToken: p.token })).referrals).toHaveLength(2);
  });

  test('rattachement manuel : filleul crédité, parrain payé si déjà 10 boosters ouverts, pas de doublon', async () => {
    const t = convexTest(schema, modules);
    const p = await user(t, 'parrain');
    const f = await user(t, 'filleul');
    await t.run((ctx) => ctx.db.patch(f.userId, { totalPacksOpened: 12 }));
    const before = await bal(t, p.userId);
    const msg = await t.mutation(internal.referrals.linkManual, { referrer: 'PARRAIN', child: 'filleul' });
    expect(msg).toMatch(/^OK/);
    expect(await bal(t, f.userId)).toBe(25);
    expect(await bal(t, p.userId)).toBe(before + 10);
    expect(await t.mutation(internal.referrals.linkManual, { referrer: 'parrain', child: 'filleul' })).toMatch(/déjà un parrain/);
    expect(await bal(t, p.userId)).toBe(before + 10);
    expect(await t.mutation(internal.referrals.linkManual, { referrer: 'nope', child: 'filleul' })).toMatch(/introuvable/);
  });
});
