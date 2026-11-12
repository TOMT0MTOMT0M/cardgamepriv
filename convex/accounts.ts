import { v, ConvexError } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { createUser, issueSession } from './auth';
import { syncPresence } from './presence';

/**
 * COMPTES SANS DISCORD (ouverture 07/11) — la partie base de données ; le hachage du mot de passe (scrypt, Node) est
 * dans convex/pwAuth.ts, qui appelle ces fonctions internes. Un compte pseudo est un joueur comme les autres :
 * `discordId` = « pw:<pseudo replié> » (unique grâce à l'index existant), pas d'avatar (initiale, ou photo importée).
 */
export const PW_PREFIX = 'pw:';
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const findPw = internalQuery({
  args: { loginKey: v.string() },
  handler: async (ctx, { loginKey }) => {
    const u = await ctx.db
      .query('users')
      .withIndex('by_discordId', (q) => q.eq('discordId', PW_PREFIX + loginKey))
      .unique();
    if (!u?.pwHash) return null;
    return { userId: u._id, pwHash: u.pwHash, lockedUntil: u.pwLockUntil ?? 0 };
  },
});

export const createPw = internalMutation({
  args: { loginKey: v.string(), displayName: v.string(), pwHash: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { loginKey, displayName, pwHash, device }) => {
    const all = await ctx.db.query('users').collect();
    // appareil d'un compte banni : pas de nouveau compte depuis ce téléphone / navigateur
    if (device && all.some((u) => u.bannedAt && (u.devices ?? []).includes(device))) throw new ConvexError('Impossible de créer un compte depuis cet appareil.');
    // pseudo déjà pris — par un compte pseudo OU par le nom d'un joueur Discord (les commandes admin cherchent par nom)
    const k = fold(displayName);
    if (all.some((u) => u.discordId === PW_PREFIX + loginKey || fold(u.displayName) === k || fold(u.username) === k))
      throw new ConvexError('Ce pseudo est déjà pris : choisis-en un autre.');
    const userId = await createUser(ctx, { discordId: PW_PREFIX + loginKey, username: displayName, displayName, pwHash });
    if (device) await ctx.db.patch(userId, { devices: [device] });
    return { token: await issueSession(ctx, userId) };
  },
});

/** Résultat d'un essai de connexion : session si c'est bon, compteur d'échecs (verrou de 10 min après 8) sinon. */
export const pwAttempt = internalMutation({
  args: { userId: v.id('users'), ok: v.boolean() },
  handler: async (ctx, { userId, ok }) => {
    const u = await ctx.db.get(userId);
    if (!u) throw new ConvexError('Compte introuvable.');
    if (u.bannedAt) throw new ConvexError('Ce compte a été banni du club.');
    const now = Date.now();
    if (!ok) {
      const fails = (u.pwFails ?? 0) + 1;
      await ctx.db.patch(userId, fails >= MAX_FAILS ? { pwFails: 0, pwLockUntil: now + LOCK_MS } : { pwFails: fails });
      return { token: null };
    }
    await ctx.db.patch(userId, { pwFails: 0, pwLockUntil: undefined, lastSeenAt: now });
    await syncPresence(ctx, userId);
    return { token: await issueSession(ctx, userId) };
  },
});

export const setPwHash = internalMutation({
  args: { loginKey: v.string(), pwHash: v.string() },
  handler: async (ctx, { loginKey, pwHash }) => {
    const u = await ctx.db
      .query('users')
      .withIndex('by_discordId', (q) => q.eq('discordId', PW_PREFIX + loginKey))
      .unique();
    if (!u) throw new ConvexError(`Aucun compte pseudo « ${loginKey} ».`);
    await ctx.db.patch(u._id, { pwHash, pwFails: 0, pwLockUntil: undefined });
    for (const s of await ctx.db.query('sessions').withIndex('by_userId', (q) => q.eq('userId', u._id)).collect()) await ctx.db.delete(s._id);
    return `Mot de passe de ${u.displayName} remis à zéro (sessions fermées).`;
  },
});
