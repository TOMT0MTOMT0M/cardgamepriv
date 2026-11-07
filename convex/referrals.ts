import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { applyRegen } from '../src/core/packRegen';
import { REFERRAL } from '../src/core/referral';

/**
 * PARRAINAGE (retours live 02, §10). Chaque joueur a un lien d'invitation au site (`/jeu/?ref=CODE`) :
 *  - le lien compte les personnes qui ont cliqué (une fois par appareil) ;
 *  - le FILLEUL (nouveau joueur arrivé par le lien) reçoit 10 boosters à son inscription ;
 *  - le PARRAIN reçoit 10 boosters quand son filleul a ouvert ses 10 premiers boosters (packs.ts → `payReferrer`) ;
 *  - anti-abus : un filleul inscrit depuis le même appareil que son parrain est SIGNALÉ dans le panneau admin (alerte
 *    discrète, comme les autres), pas bloqué.
 */
const CODE_RE = /^[a-z0-9]{6,12}$/;
const DEVICE_RE = /^[a-z0-9-]{8,64}$/i;

function newCode(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export async function ensureCode(ctx: MutationCtx, u: Doc<'users'>): Promise<string> {
  if (u.refCode) return u.refCode;
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    const taken = await ctx.db.query('users').withIndex('by_refCode', (q) => q.eq('refCode', code)).first();
    if (taken) continue;
    await ctx.db.patch(u._id, { refCode: code });
    return code;
  }
  throw new ConvexError('Impossible de créer ton lien, réessaie.');
}

/**
 * (07/11) Retrouve le parrain à partir de ce que le joueur colle : le CODE, le LIEN entier (`…/jeu/?ref=CODE`) ou le
 * PSEUDO du parrain (majuscules, accents et « @ » ignorés). Avant, seul le code gardé par le navigateur marchait :
 * un lien ouvert dans le navigateur de Discord puis un compte créé ailleurs = parrainage perdu sans un mot.
 */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^@/, '').trim().toLowerCase();
async function findReferrer(ctx: QueryCtx, input: string): Promise<Doc<'users'> | null> {
  const raw = input.trim();
  const m = /[?&]ref=([a-z0-9]{6,12})/i.exec(raw);
  const code = (m ? m[1] : raw).toLowerCase();
  if (CODE_RE.test(code)) {
    const byCode = await ctx.db.query('users').withIndex('by_refCode', (q) => q.eq('refCode', code)).first();
    if (byCode) return byCode;
  }
  const want = fold(raw);
  if (!want || want.length > 64) return null;
  return (await ctx.db.query('users').collect()).find((x) => fold(x.username) === want || fold(x.displayName) === want) ?? null;
}

async function addPacks(ctx: MutationCtx, userId: Id<'users'>, n: number) {
  const u = await ctx.db.get(userId);
  if (!u) return;
  const now = Date.now();
  const regen = applyRegen(u.packBalance, u.packRegenAt ?? u.lastSeenAt, now, u.regenBoostUntil);
  await ctx.db.patch(userId, { packBalance: regen.balance + n, packRegenAt: regen.regenAt });
}

/** Mon lien (créé à la première demande), le nombre de clics et mes filleuls. */
export const mine = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    const code = await ensureCode(ctx, u);
    return await summary(ctx, u._id, code);
  },
});

/** Lecture seule (rafraîchissement) : null tant que le code n'existe pas. */
export const status = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const u = await getUserByToken(ctx, sessionToken);
    if (!u?.refCode) return null;
    return await summary(ctx, u._id, u.refCode);
  },
});

async function summary(ctx: QueryCtx, userId: Id<'users'>, code: string) {
  const me = await ctx.db.get(userId);
  const parrain = me?.referredBy ? await ctx.db.get(me.referredBy) : null;
  const clicks = await ctx.db.query('referralClicks').withIndex('by_referrer', (q) => q.eq('referrerId', userId)).collect();
  const kids = await ctx.db.query('users').withIndex('by_referredBy', (q) => q.eq('referredBy', userId)).collect();
  return {
    code,
    clicks: clicks.length,
    /** mon parrain (si j'en ai un) ; `canClaim` : compte encore assez neuf pour en déclarer un */
    myReferrer: parrain?.displayName,
    canClaim: !!me && !me.referredBy && Date.now() - me._creationTime <= REFERRAL.newAccountMs && me.totalPacksOpened <= REFERRAL.packsToPay,
    referrals: kids.map((k) => ({ userId: k._id as string, name: k.displayName, avatarUrl: k.avatarUrl, packsOpened: k.totalPacksOpened, paid: !!k.referralPaid, at: k.referredAt ?? k._creationTime })),
  };
}

/** Un appareil a ouvert un lien d'invitation (sans compte) : compté une fois par appareil et par code. */
export const click = mutation({
  args: { code: v.string(), device: v.string() },
  handler: async (ctx, { code, device }) => {
    code = code.toLowerCase();
    if (!CODE_RE.test(code) || !DEVICE_RE.test(device)) return { ok: false };
    const owner = await ctx.db.query('users').withIndex('by_refCode', (q) => q.eq('refCode', code)).first();
    if (!owner) return { ok: false };
    // le parrain qui clique sur son propre lien ne compte pas
    if ((owner.devices ?? []).includes(device)) return { ok: true };
    const seen = await ctx.db.query('referralClicks').withIndex('by_code_device', (q) => q.eq('code', code).eq('device', device)).first();
    if (!seen) await ctx.db.insert('referralClicks', { code, referrerId: owner._id, device, at: Date.now() });
    return { ok: true };
  },
});

/**
 * Le joueur connecté est arrivé par un lien : il devient le filleul du propriétaire du code et reçoit ses 10 boosters.
 * Seulement pour un compte NEUF (moins de REFERRAL.newAccountMs, aucun booster ouvert au-delà de quelques-uns), une fois.
 */
export const claim = mutation({
  args: { sessionToken: v.string(), code: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, code, device }) => {
    const u = await requireUser(ctx, sessionToken);
    if (u.referredBy) return { status: 'already' as const };
    const owner = await findReferrer(ctx, code);
    if (!owner) return { status: 'invalid' as const };
    if (owner._id === u._id) return { status: 'self' as const };
    const now = Date.now();
    if (now - u._creationTime > REFERRAL.newAccountMs || u.totalPacksOpened > REFERRAL.packsToPay) return { status: 'tooLate' as const };
    const dev = device && DEVICE_RE.test(device) ? device : undefined;
    await ctx.db.patch(u._id, { referredBy: owner._id, referredAt: now, ...(dev ? { referredDevice: dev } : {}) });
    await addPacks(ctx, u._id, REFERRAL.packs);
    return { status: 'ok' as const, packs: REFERRAL.packs, referrer: owner.displayName };
  },
});

/** Appelé à chaque booster ouvert (packs.ts) : 10 premiers boosters du filleul → 10 boosters pour le parrain, une fois. */
export async function payReferrer(ctx: MutationCtx, userId: Id<'users'>) {
  const u = await ctx.db.get(userId);
  if (!u?.referredBy || u.referralPaid || u.totalPacksOpened < REFERRAL.packsToPay) return;
  await ctx.db.patch(u._id, { referralPaid: true });
  await addPacks(ctx, u.referredBy, REFERRAL.packs);
}

/**
 * (07/11) Rattachement MANUEL d'un filleul (lanceurs/parrainage-manuel.cmd) — pour un parrainage perdu (lien ouvert
 * dans un navigateur, compte créé dans un autre). Pseudos ou noms affichés. Le filleul reçoit ses boosters ; s'il a
 * déjà ouvert ses premiers boosters, le parrain est payé tout de suite. Pas de limite d'âge du compte (décision admin).
 */
export const linkManual = internalMutation({
  args: { referrer: v.string(), child: v.string() },
  handler: async (ctx, { referrer, child }) => {
    const p = await findReferrer(ctx, referrer);
    const f = await findReferrer(ctx, child);
    if (!p) return `parrain introuvable : « ${referrer} »`;
    if (!f) return `filleul introuvable : « ${child} »`;
    if (p._id === f._id) return 'parrain et filleul sont le même compte';
    if (f.referredBy) {
      const cur = await ctx.db.get(f.referredBy);
      return `${f.displayName} a déjà un parrain : ${cur?.displayName ?? '?'} (rien changé)`;
    }
    await ctx.db.patch(f._id, { referredBy: p._id, referredAt: Date.now() });
    await addPacks(ctx, f._id, REFERRAL.packs);
    await payReferrer(ctx, f._id);
    const after = await ctx.db.get(f._id);
    return `OK : ${f.displayName} est le filleul de ${p.displayName} · +${REFERRAL.packs} boosters pour ${f.displayName}${after?.referralPaid ? ` · +${REFERRAL.packs} boosters pour ${p.displayName} (déjà ${f.totalPacksOpened} boosters ouverts)` : ` · ${p.displayName} sera payé au ${REFERRAL.packsToPay}e booster ouvert (${f.totalPacksOpened}/${REFERRAL.packsToPay})`}`;
  },
});
