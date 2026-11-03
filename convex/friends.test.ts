/// <reference types="vite/client" />
/**
 * Tests du système d'amis (convex/friends.ts — retours live 02, lot A2). Base Convex simulée en mémoire.
 *   npm run test:server
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import { DECLINE_COOLDOWN_MS, MAX_PENDING_OUT, foldName } from './friends';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

async function setup(names = ['alice', 'bob', 'chloé']) {
  const t = convexTest(schema, modules);
  const u: Record<string, { userId: Id<'users'>; token: string }> = {};
  for (const name of names)
    u[name] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        discordId: name, username: `${foldName(name)}_d`, displayName: name[0].toUpperCase() + name.slice(1), packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 3, lastSeenAt: Date.now(), packRegenAt: Date.now(),
      });
      const token = `tok-${name}`;
      await ctx.db.insert('sessions', { token, userId, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return { userId, token };
    });
  return { t, u };
}

const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return String((e as { data?: string }).data ?? (e as Error).message);
  }
  return '';
};

describe('amis', () => {
  test('demande par pseudo exact (casse et accents ignorés), acceptation, liste des deux côtés', async () => {
    const { t, u } = await setup();
    const r = await t.mutation(api.friends.request, { sessionToken: u.alice.token, name: '  CHLOE ' });
    expect(r).toEqual({ status: 'pending', name: 'Chloé' });
    // pseudo Discord aussi
    expect((await t.mutation(api.friends.request, { sessionToken: u.alice.token, name: 'bob_d' })).status).toBe('pending');

    const mineA = (await t.query(api.friends.mine, { sessionToken: u.alice.token }))!;
    expect(mineA.outgoing.map((x) => x.name).sort()).toEqual(['Bob', 'Chloé']);
    expect(mineA.incoming).toEqual([]);
    const mineC = (await t.query(api.friends.mine, { sessionToken: u['chloé'].token }))!;
    expect(mineC.incoming.map((x) => x.name)).toEqual(['Alice']);

    await t.mutation(api.friends.accept, { sessionToken: u['chloé'].token, friendshipId: mineC.incoming[0].friendshipId });
    const a2 = (await t.query(api.friends.mine, { sessionToken: u.alice.token }))!;
    expect(a2.friends.map((f) => f.name)).toEqual(['Chloé']);
    expect(a2.friends[0]).toMatchObject({ userId: u['chloé'].userId, packsOpened: 3, lastActivity: null });
    expect(typeof a2.friends[0].lastSeenAt).toBe('number');
    expect(a2.outgoing.map((x) => x.name)).toEqual(['Bob']);
    const c2 = (await t.query(api.friends.mine, { sessionToken: u['chloé'].token }))!;
    expect(c2.friends.map((f) => f.userId)).toEqual([u.alice.userId]);
    expect(c2.incoming).toEqual([]);
    // sans session : rien
    expect(await t.query(api.friends.mine, {})).toBeNull();
  });

  test('dernière activité du fil d’un ami', async () => {
    const { t, u } = await setup(['alice', 'bob']);
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId });
    await t.mutation(api.friends.request, { sessionToken: u.bob.token, userId: u.alice.userId }); // demande croisée = acceptée
    await t.run(async (ctx) => {
      await ctx.db.insert('activityFeed', { userId: u.bob.userId, displayName: 'Bob', kind: 'pull', message: 'vieux', createdAt: 1 });
      await ctx.db.insert('activityFeed', { userId: u.bob.userId, displayName: 'Bob', kind: 'mythic_pull', message: 'Bob a obtenu X !', createdAt: 2 });
    });
    const m = (await t.query(api.friends.mine, { sessionToken: u.alice.token }))!;
    expect(m.friends[0].lastActivity).toEqual({ kind: 'mythic_pull', message: 'Bob a obtenu X !', createdAt: 2 });
  });

  test('demande croisée : acceptée d’office', async () => {
    const { t, u } = await setup(['alice', 'bob']);
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId });
    const r = await t.mutation(api.friends.request, { sessionToken: u.bob.token, name: 'alice' });
    expect(r.status).toBe('accepted');
    const m = (await t.query(api.friends.mine, { sessionToken: u.alice.token }))!;
    expect(m.friends.map((f) => f.name)).toEqual(['Bob']);
    expect(m.outgoing).toEqual([]);
  });

  test('anti-abus : pas soi-même, pas de doublon, inconnu, homonymes, déjà amis', async () => {
    const { t, u } = await setup(['alice', 'bob', 'bobby']);
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.alice.userId }))).toMatch(/C’est toi/);
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, name: 'alice' }))).toMatch(/C’est toi/);
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, name: 'personne' }))).toMatch(/Personne ne s’appelle/);
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, name: '' }))).toMatch(/pseudo exact/);
    // « exact » : pas de recherche partielle
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, name: 'bo' }))).toMatch(/Personne/);
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, name: 'bob' });
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId }))).toMatch(/déjà envoyée/);
    const m = (await t.query(api.friends.mine, { sessionToken: u.bob.token }))!;
    await t.mutation(api.friends.accept, { sessionToken: u.bob.token, friendshipId: m.incoming[0].friendshipId });
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.bob.token, userId: u.alice.userId }))).toMatch(/déjà ton ami/);
    // homonymes (même nom affiché) : il faut passer par le profil
    await t.run(async (ctx) => ctx.db.patch(u.bobby.userId, { displayName: 'Bob' }));
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.bobby.token, name: 'bob' }))).toMatch(/Plusieurs joueurs/);
    // … mais le pseudo Discord (unique) marche
    expect((await t.mutation(api.friends.request, { sessionToken: u.bobby.token, name: 'bob_d' })).name).toBe('Bob');
  });

  test('refuser : la demande disparaît, relance bloquée 24 h (le refuseur peut, lui, demander)', async () => {
    const { t, u } = await setup(['alice', 'bob']);
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId });
    const m = (await t.query(api.friends.mine, { sessionToken: u.bob.token }))!;
    await t.mutation(api.friends.decline, { sessionToken: u.bob.token, friendshipId: m.incoming[0].friendshipId });
    expect((await t.query(api.friends.mine, { sessionToken: u.bob.token }))!.incoming).toEqual([]);
    expect((await t.query(api.friends.mine, { sessionToken: u.alice.token }))!.outgoing).toEqual([]);
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId }))).toMatch(/réessaie demain/);
    // un refus déjà traité ne s'accepte plus
    expect(await err(t.mutation(api.friends.accept, { sessionToken: u.bob.token, friendshipId: m.incoming[0].friendshipId }))).toMatch(/introuvable/);
    // le délai passé : la relance marche
    await t.run(async (ctx) => ctx.db.patch(m.incoming[0].friendshipId, { respondedAt: Date.now() - DECLINE_COOLDOWN_MS - 1000 }));
    expect((await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId })).status).toBe('pending');
    // et celui qui a refusé peut demander à son tour (sans attendre)
    const { t: t3, u: w } = await setup(['alice', 'bob']);
    await t3.mutation(api.friends.request, { sessionToken: w.alice.token, userId: w.bob.userId });
    const m3 = (await t3.query(api.friends.mine, { sessionToken: w.bob.token }))!;
    await t3.mutation(api.friends.decline, { sessionToken: w.bob.token, friendshipId: m3.incoming[0].friendshipId });
    expect((await t3.mutation(api.friends.request, { sessionToken: w.bob.token, userId: w.alice.userId })).status).toBe('pending');
    expect((await t3.query(api.friends.mine, { sessionToken: w.alice.token }))!.incoming.map((x) => x.name)).toEqual(['Bob']);
  });

  test('annuler une demande envoyée, retirer un ami ; droits de chacun', async () => {
    const { t, u } = await setup(['alice', 'bob', 'chloé']);
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId });
    const out = (await t.query(api.friends.mine, { sessionToken: u.alice.token }))!.outgoing[0];
    // le destinataire n'annule pas, un tiers ne touche à rien
    expect(await err(t.mutation(api.friends.cancel, { sessionToken: u.bob.token, friendshipId: out.friendshipId }))).toMatch(/introuvable/);
    expect(await err(t.mutation(api.friends.accept, { sessionToken: u['chloé'].token, friendshipId: out.friendshipId }))).toMatch(/introuvable/);
    // le demandeur n'accepte pas sa propre demande
    expect(await err(t.mutation(api.friends.accept, { sessionToken: u.alice.token, friendshipId: out.friendshipId }))).toMatch(/introuvable/);
    await t.mutation(api.friends.cancel, { sessionToken: u.alice.token, friendshipId: out.friendshipId });
    expect((await t.query(api.friends.mine, { sessionToken: u.bob.token }))!.incoming).toEqual([]);
    // une demande annulée peut être renvoyée tout de suite
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId });
    const inc = (await t.query(api.friends.mine, { sessionToken: u.bob.token }))!.incoming[0];
    expect(await err(t.mutation(api.friends.remove, { sessionToken: u.bob.token, friendshipId: inc.friendshipId }))).toMatch(/pas \(ou plus\) amis/);
    await t.mutation(api.friends.accept, { sessionToken: u.bob.token, friendshipId: inc.friendshipId });
    expect(await err(t.mutation(api.friends.remove, { sessionToken: u['chloé'].token, friendshipId: inc.friendshipId }))).toMatch(/introuvable/);
    await t.mutation(api.friends.remove, { sessionToken: u.bob.token, friendshipId: inc.friendshipId });
    expect((await t.query(api.friends.mine, { sessionToken: u.alice.token }))!.friends).toEqual([]);
    expect((await t.query(api.friends.mine, { sessionToken: u.bob.token }))!.friends).toEqual([]);
  });

  test(`plafond : ${MAX_PENDING_OUT} demandes envoyées en attente`, async () => {
    const names = ['moi', ...Array.from({ length: MAX_PENDING_OUT + 1 }, (_, i) => `p${i}`)];
    const { t, u } = await setup(names);
    for (let i = 0; i < MAX_PENDING_OUT; i++) await t.mutation(api.friends.request, { sessionToken: u.moi.token, userId: u[`p${i}`].userId });
    expect(await err(t.mutation(api.friends.request, { sessionToken: u.moi.token, userId: u[`p${MAX_PENDING_OUT}`].userId }))).toMatch(/au maximum/);
    // une réponse libère une place
    const inc = (await t.query(api.friends.mine, { sessionToken: u.p0.token }))!.incoming[0];
    await t.mutation(api.friends.accept, { sessionToken: u.p0.token, friendshipId: inc.friendshipId });
    expect((await t.mutation(api.friends.request, { sessionToken: u.moi.token, userId: u[`p${MAX_PENDING_OUT}`].userId })).status).toBe('pending');
  });

  test('la liste « tous les joueurs » (users.friends, vue Échanges) ne change pas', async () => {
    const { t, u } = await setup(['alice', 'bob', 'chloé']);
    await t.mutation(api.friends.request, { sessionToken: u.alice.token, userId: u.bob.userId });
    const all = await t.query(api.users.friends, {});
    expect(all.map((x) => x.displayName).sort()).toEqual(['Alice', 'Bob', 'Chloé']);
  });
});
