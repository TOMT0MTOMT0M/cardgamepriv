import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireUser } from './auth';
import { fullAt } from '../src/core/packRegen';

/**
 * NOTIFICATIONS PUSH (V2, docs/IDEES-V2.md §1) — côté base. L'envoi réel (Web Push, bibliothèque `web-push`,
 * runtime Node) est dans pushSend.ts. Ici : abonnements, préférences, file d'envoi avec garde-fous, et la
 * programmation de « réserve pleine ».
 *
 * Types (`kind`) : reserve · trade · friend · referral · game · streak · news · chat (convex/chat.ts). Le joueur coche ce qu'il veut (users.notifPrefs ;
 * absent = tout). Garde-fous : rien entre 23 h et 8 h (heure de Paris) sauf `trade` / `friend` / `game` reportés à 8 h ;
 * un même type regroupé : au plus une notification par type et par joueur toutes les 2 minutes (la dernière gagne).
 */
export const KINDS = ['reserve', 'trade', 'friend', 'referral', 'game', 'streak', 'news', 'chat'] as const;
export type Kind = (typeof KINDS)[number];
const kindValidator = v.union(...KINDS.map((k) => v.literal(k)));

export interface Payload {
  kind: Kind;
  title: string;
  body: string;
  /** page à ouvrir (hash) : #/echanges, #/amis, #/ … */
  url: string;
  /** même tag = la nouvelle remplace l'ancienne dans le centre de notifications */
  tag?: string;
}

/** heure de Paris (0..23) */
function parisHour(t: number): number {
  const h = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(new Date(t)));
  return h % 24;
}
/** prochain 8 h (Paris) après `t` */
function next8h(t: number): number {
  // on avance par pas d'un quart d'heure jusqu'à 8 h : simple et juste avec l'heure d'été
  let x = t;
  for (let i = 0; i < 24 * 4 && parisHour(x) !== 8; i++) x += 15 * 60 * 1000;
  return x - (x % (15 * 60 * 1000));
}
const NIGHT = (h: number) => h >= 23 || h < 8;
/** entre 23 h et 8 h (heure de Paris) ? */
export const isNightParis = (t: number) => NIGHT(parisHour(t));

/** Clé publique VAPID (posée par lanceurs\activer-notifications.cmd) : le client en a besoin pour s'abonner. */
export const vapidPublicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

export const status = query({
  args: { sessionToken: v.string(), endpoint: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, endpoint }) => {
    const user = await requireUser(ctx, sessionToken);
    const subs = await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', user._id)).collect();
    return {
      configured: !!process.env.VAPID_PUBLIC_KEY,
      devices: subs.length,
      thisDevice: !!endpoint && subs.some((s) => s.endpoint === endpoint),
      prefs: user.notifPrefs ?? [...KINDS],
    };
  },
});

export const subscribe = mutation({
  args: { sessionToken: v.string(), endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }), ua: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, endpoint, keys, ua }) => {
    const user = await requireUser(ctx, sessionToken);
    if (!process.env.VAPID_PUBLIC_KEY) throw new ConvexError('Notifications pas encore activées côté serveur.');
    const old = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (old) await ctx.db.patch(old._id, { userId: user._id, keys, ua: ua?.slice(0, 160), failures: 0 });
    else await ctx.db.insert('pushSubs', { userId: user._id, endpoint, keys, ua: ua?.slice(0, 160), createdAt: Date.now(), failures: 0 });
    await scheduleReserveFull(ctx, user._id);
    return { ok: true };
  },
});

export const unsubscribe = mutation({
  args: { sessionToken: v.string(), endpoint: v.string() },
  handler: async (ctx, { sessionToken, endpoint }) => {
    const user = await requireUser(ctx, sessionToken);
    const old = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (old && old.userId === user._id) await ctx.db.delete(old._id);
    return { ok: true };
  },
});

export const setPrefs = mutation({
  args: { sessionToken: v.string(), prefs: v.array(kindValidator) },
  handler: async (ctx, { sessionToken, prefs }) => {
    const user = await requireUser(ctx, sessionToken);
    await ctx.db.patch(user._id, { notifPrefs: [...new Set(prefs)] });
    return { ok: true };
  },
});

/** Un appareil a renvoyé 404 / 410 (abonnement expiré) ou 3 échecs : on l'oublie. */
export const dropSub = internalMutation({
  args: { endpoint: v.string(), hard: v.boolean() },
  handler: async (ctx, { endpoint, hard }) => {
    const s = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (!s) return;
    const failures = (s.failures ?? 0) + 1;
    if (hard || failures >= 3) await ctx.db.delete(s._id);
    else await ctx.db.patch(s._id, { failures });
  },
});
export const markOk = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const s = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (s) await ctx.db.patch(s._id, { failures: 0, lastOkAt: Date.now() });
  },
});

/**
 * ENVOYER à un joueur (depuis les mutations du jeu). Respecte ses préférences, la nuit et le regroupement, puis
 * programme l'action Node. Ne lève jamais : une notification ne doit pas faire échouer un échange.
 */
export async function notify(ctx: MutationCtx, userId: Id<'users'>, p: Payload, opts: { at?: number } = {}): Promise<void> {
  try {
    if (!process.env.VAPID_PUBLIC_KEY) return;
    const user = await ctx.db.get(userId);
    if (!user) return;
    if (user.notifPrefs && !user.notifPrefs.includes(p.kind)) return;
    const subs = await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
    if (!subs.length) return;
    let at = opts.at ?? Date.now();
    // la nuit : rien d'urgent, on reporte à 8 h (sauf `news` / `reserve`, abandonnés : ce sera dépassé)
    if (NIGHT(parisHour(at))) {
      if (p.kind === 'news' || p.kind === 'reserve' || p.kind === 'streak') return;
      at = next8h(at);
    }
    // regroupement : un même tag remplace la notification précédente ; on retarde de 90 s pour laisser les rafales se calmer
    const delay = Math.max(0, at - Date.now()) + (opts.at ? 0 : 90_000);
    await ctx.scheduler.runAfter(delay, internal.pushSend.send, {
      subs: subs.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
      payload: { ...p, tag: p.tag ?? `${p.kind}` },
    });
  } catch (e) {
    console.warn('[push] notify', e);
  }
}

/**
 * « Réserve pleine » : calcule l'instant exact où la réserve atteindra 15/15 et programme la notification à ce
 * moment-là ; annule la précédente. À rappeler à chaque ouverture / gain de boosters / boost.
 */
export async function scheduleReserveFull(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  try {
    const u = await ctx.db.get(userId);
    if (!u) return;
    // l'instant visé, ou `null` s'il n'y a rien à programmer
    let at: number | null = null;
    if (process.env.VAPID_PUBLIC_KEY && !(u.notifPrefs && !u.notifPrefs.includes('reserve')) && (await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', userId)).first()))
      at = fullAt(u.packBalance, u.packRegenAt ?? u.lastSeenAt, Date.now(), u.regenBoostUntil);
    const regenAt = u.packRegenAt ?? u.lastSeenAt;
    const key = at === null ? undefined : `${at}:${u.packBalance}:${regenAt}`;
    // (audit 12/11, S11 / E1-07) le même job attend déjà (même instant, même réserve) : AUCUNE écriture. Avant : annulé
    // puis reprogrammé à l'identique, soit 2 écritures du document joueur à chaque chargement de l'appli (push.subscribe),
    // qui relançaient ses requêtes et celles de ses amis.
    if (key && u.notifFullJob && u.notifFullKey === key && (await ctx.db.system.get(u.notifFullJob))?.state.kind === 'pending') return;
    if (u.notifFullJob) await ctx.scheduler.cancel(u.notifFullJob).catch(() => undefined);
    if (at === null) {
      if (u.notifFullJob || u.notifFullKey) await ctx.db.patch(userId, { notifFullJob: undefined, notifFullKey: undefined });
      return;
    }
    const job = await ctx.scheduler.runAt(at + 1000, internal.push.reserveFull, { userId, balance: u.packBalance, regenAt });
    await ctx.db.patch(userId, { notifFullJob: job, notifFullKey: key });
  } catch (e) {
    console.warn('[push] réserve', e);
  }
}

/** le moment est venu : si rien n'a bougé entre-temps (sinon un autre job a été programmé), on envoie */
export const reserveFull = internalMutation({
  args: { userId: v.id('users'), balance: v.number(), regenAt: v.number() },
  handler: async (ctx, { userId, balance, regenAt }) => {
    const u = await ctx.db.get(userId);
    if (!u || u.packBalance !== balance || (u.packRegenAt ?? u.lastSeenAt) !== regenAt) return;
    await ctx.db.patch(userId, { notifFullJob: undefined, notifFullKey: undefined });
    await notify(ctx, userId, { kind: 'reserve', title: 'Réserve pleine : 15 boosters', body: 'Ta réserve est au maximum, elle ne se recharge plus. Viens ouvrir !', url: '#/' }, { at: Date.now() });
  },
});

/** Annonce de l'équipe à tout le monde (lanceur : `npx convex run push:announce '{"title":…,"body":…}'`). */
export const announce = internalMutation({
  args: { title: v.string(), body: v.string(), url: v.optional(v.string()) },
  handler: async (ctx, { title, body, url }) => {
    const subs = await ctx.db.query('pushSubs').collect();
    const byUser = new Map<string, Doc<'pushSubs'>[]>();
    for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
    let n = 0;
    for (const [userId] of byUser) {
      await notify(ctx, userId as Id<'users'>, { kind: 'news', title, body, url: url ?? '#/maj', tag: `news-${Date.now()}` }, { at: Date.now() });
      n++;
    }
    return { players: n, devices: subs.length };
  },
});

/** Test depuis le jeu (bouton « M'envoyer un test ») */
export const sendTest = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireUser(ctx, sessionToken);
    const subs = await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', user._id)).collect();
    if (!subs.length) throw new ConvexError('Aucun appareil abonné.');
    await ctx.scheduler.runAfter(0, internal.pushSend.send, {
      subs: subs.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
      payload: { kind: 'news', title: 'Bébou : ça marche !', body: 'Tu recevras ici les échanges, les amis, la réserve pleine…', url: '#/profil', tag: 'test' },
    });
    return { devices: subs.length };
  },
});
