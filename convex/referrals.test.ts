/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function user(t: ReturnType<typeof convexTest>, name: string, devices: string[] = []) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      discordId: name, username: name, displayName: name, packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: Date.now(), packRegenAt: Date.now(), devices,
    });
    const token = `tok-${name}`;
    await ctx.db.insert('sessions', { userId, token, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
    return { userId, token };
  });
}
const bal = (t: ReturnType<typeof convexTest>, id: Id<'users'>) => t.run(async (ctx) => (await ctx.db.get(id))!.packBalance);

describe('parrainage (retours live 02, §10)', () => {
  test('lien, clics, 10 boosters au filleul, 10 au parrain après 10 boosters ouverts', async () => {
    const t = convexTest(schema, modules);
    const p = await user(t, 'parrain', ['dev-parrain-1']);
    const f = await user(t, 'filleul');
    const mine = await t.mutation(api.referrals.mine, { sessionToken: p.token });
    expect(mine.code).toMatch(/^[a-z0-9]{8}$/);
    // clics : un par appareil ; le parrain sur son propre lien ne compte pas
    await t.mutation(api.referrals.click, { code: mine.code, device: 'dev-ami-0001' });
    await t.mutation(api.referrals.click, { code: mine.code, device: 'dev-ami-0001' });
    await t.mutation(api.referrals.click, { code: mine.code, device: 'dev-ami-0002' });
    await t.mutation(api.referrals.click, { code: mine.code, device: 'dev-parrain-1' });
    expect((await t.mutation(api.referrals.mine, { sessionToken: p.token })).clicks).toBe(2);
    // le parrain ne peut pas être son propre filleul
    expect((await t.mutation(api.referrals.claim, { sessionToken: p.token, code: mine.code })).status).toBe('self');
    const r = await t.mutation(api.referrals.claim, { sessionToken: f.token, code: mine.code, device: 'dev-ami-0001' });
    expect(r.status).toBe('ok');
    expect(await bal(t, f.userId)).toBe(25);
    expect((await t.mutation(api.referrals.claim, { sessionToken: f.token, code: mine.code })).status).toBe('already');
    // 10e booster du filleul → 10 boosters pour le parrain, une seule fois
    await t.run((ctx) => ctx.db.patch(f.userId, { totalPacksOpened: 9 }));
    const before = await bal(t, p.userId);
    const pk = await t.mutation(api.packs.preparePack, { sessionToken: f.token, packKind: 'bebou' });
    await t.mutation(api.packs.revealPack, { sessionToken: f.token, packId: pk._id });
    expect(await bal(t, p.userId)).toBe(before + 10);
    const pk2 = await t.mutation(api.packs.preparePack, { sessionToken: f.token, packKind: 'bebou' });
    await t.mutation(api.packs.revealPack, { sessionToken: f.token, packId: pk2._id });
    expect(await bal(t, p.userId)).toBe(before + 10);
    const sum = await t.mutation(api.referrals.mine, { sessionToken: p.token });
    expect(sum.referrals).toHaveLength(1);
    expect(sum.referrals[0].paid).toBe(true);
  });

  test('filleul depuis l’appareil du parrain : alerte admin discrète, rien de bloqué', async () => {
    const t = convexTest(schema, modules);
    const p = await user(t, 'parrain', ['dev-partage-1']);
    const f = await user(t, 'filleul');
    await t.run((ctx) => ctx.db.patch(p.userId, { isAdmin: true }));
    const { code } = await t.mutation(api.referrals.mine, { sessionToken: p.token });
    expect((await t.mutation(api.referrals.claim, { sessionToken: f.token, code, device: 'dev-partage-1' })).status).toBe('ok');
    const al = await t.query(api.abuse.alerts, { sessionToken: p.token });
    expect(al.some((a) => a.kind === 'referral')).toBe(true);
  });
});
