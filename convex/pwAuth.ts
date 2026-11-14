'use node';
import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { action, internalAction } from './_generated/server';
import { internal } from './_generated/api';

/**
 * CONNEXION PAR PSEUDO + MOT DE PASSE (ouverture 07/11) — pour les amis sans Discord.
 * Le mot de passe est haché ici (scrypt, sel aléatoire par compte, comparaison à temps constant) : il n'est jamais
 * stocké ni journalisé en clair. La base (création, essais ratés, session) est dans convex/accounts.ts.
 * Variable optionnelle CLUB_CODE : si elle est posée, l'inscription par pseudo demande ce code (le club reste privé).
 */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]{1,18}[\p{L}\p{N}]$/u;

export function loginKey(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function hashPassword(password: string, salt = randomBytes(16)): string {
  const h = scryptSync(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function checkPassword(password: string, stored: string): boolean {
  const [ver, salt, hash] = stored.split('$');
  if (ver !== 's1' || !salt || !hash) return false;
  const want = fromB64(hash);
  const got = scryptSync(password.normalize('NFKC'), fromB64(salt), want.length, { N: 16384, r: 8, p: 1 });
  return want.length === got.length && timingSafeEqual(want, got);
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const DUMMY = hashPassword('pas-de-compte');

function cleanName(raw: string) {
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!NAME_RE.test(name)) throw new ConvexError(fe('pwAuth.1'));
  return name;
}
function checkLen(password: string) {
  if (password.length < 6) throw new ConvexError(fe('pwAuth.2'));
  if (password.length > 100) throw new ConvexError(fe('pwAuth.3'));
}

export const signup = action({
  args: { name: v.string(), password: v.string(), clubCode: v.optional(v.string()), device: v.optional(v.string()) },
  handler: async (ctx, a): Promise<{ token: string }> => {
    const name = cleanName(a.name);
    checkLen(a.password);
    const code = (process.env.CLUB_CODE ?? '').trim();
    if (code && (a.clubCode ?? '').trim().toLowerCase() !== code.toLowerCase()) throw new ConvexError(fe('pwAuth.4'));
    const device = a.device && /^[a-z0-9-]{8,64}$/i.test(a.device) ? a.device : undefined;
    return await ctx.runMutation(internal.accounts.createPw, { loginKey: loginKey(name), displayName: name, pwHash: hashPassword(a.password), ...(device ? { device } : {}) });
  },
});

export const login = action({
  args: { name: v.string(), password: v.string() },
  handler: async (ctx, a): Promise<{ token: string }> => {
    const key = loginKey(a.name);
    const found = await ctx.runQuery(internal.accounts.findPw, { loginKey: key });
    if (found && found.lockedUntil > Date.now()) throw new ConvexError(fe('pwAuth.5'));
    const ok = checkPassword(a.password, found?.pwHash ?? DUMMY) && !!found;
    if (!found) throw new ConvexError(fe('pwAuth.6'));
    const r = await ctx.runMutation(internal.accounts.pwAttempt, { userId: found.userId, ok });
    if (!r.token) throw new ConvexError(fe('pwAuth.7'));
    return { token: r.token };
  },
});

/**
 * Mot de passe oublié (équipe) : nouveau mot de passe pour un compte pseudo, ses sessions ouvertes sont fermées.
 *   npx convex run pwAuth:setPassword '{"name":"Léa","password":"nouveau123"}'
 */
export const setPassword = internalAction({
  args: { name: v.string(), password: v.string() },
  handler: async (ctx, a): Promise<string> => {
    checkLen(a.password);
    return await ctx.runMutation(internal.accounts.setPwHash, { loginKey: loginKey(a.name), pwHash: hashPassword(a.password) });
  },
});
