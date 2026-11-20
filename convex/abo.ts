import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getUserByToken, requireUser } from './auth';
import { applyRegen } from '../src/core/packRegen';
import {
  BEBOU_CARD,
  SUB_EXTRA_PACKS,
  SUB_MAX_MONTHS,
  SUB_PRICE_EUR,
  SUB_REMIND_MS,
  bebouCardProblem,
  bebouMediaProblem,
  packCapOf,
  pollOpen,
  pollProblem,
  subActive,
  subExtend,
} from '../src/core/abo';
import { notify, scheduleReserveFull } from './push';
import { fm } from '../src/core/msgs';

/**
 * ABONNEMENT (20/11, règles : src/core/abo.ts) — 5 € par mois, payés par Wero à l'équipe, ACTIVÉS À LA MAIN dans le
 * dashboard (/admin/ → Abonnements). Aucun prestataire de paiement, aucune donnée bancaire dans la base.
 *
 *  joueur : `ask` (« j'ai payé ») · `submitCard` (sa carte Bebou) · `vote` (vote du mois) · lecture `page`
 *  équipe : `adminState` · `adminSetWero` · `adminActivate` · `adminStop` · `adminCard` · `adminPollSave` · `adminPollClose`
 *
 * L'état d'abonnement (fin, demande en attente) arrive au client avec l'économie (convex/economy.ts, ecoView) et la
 * réserve maximale avec le joueur (convex/users.ts, meView) : pas d'abonnement temps réel en plus. La page lit `page`
 * À LA DEMANDE (à l'entrée et après une action), comme le dashboard. Pas de cron : le rappel « plus que 5 jours » est
 * une tâche programmée à l'activation.
 */

const CONFIG_KEY = 'abo';
const isStaff = (u: Pick<Doc<'users'>, 'isAdmin' | 'isModerator'>) => !!(u.isAdmin || u.isModerator);
async function requireStaff(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  const me = await getUserByToken(ctx, sessionToken);
  if (!me || !isStaff(me)) throw new ConvexError(fe('abo.7'));
  return me;
}
async function log(ctx: MutationCtx, me: Doc<'users'>, action: string, detail: string, target?: string) {
  await ctx.db.insert('adminLog', { byUserId: me._id, byName: me.displayName, action, detail: detail.slice(0, 600), ...(target ? { target } : {}), at: Date.now() });
}
const config = async (ctx: QueryCtx) => await ctx.db.query('appConfig').withIndex('by_key', (q) => q.eq('key', CONFIG_KEY)).first();

/** Vote en cours (le plus récent encore ouvert), ou le dernier terminé depuis moins de 7 jours (résultat). */
async function currentPoll(ctx: QueryCtx, now: number) {
  const last = await ctx.db.query('aboPolls').withIndex('by_closes').order('desc').take(5);
  return last.find((p) => pollOpen(p, now)) ?? last.find((p) => now - p.closesAt < 7 * 86_400_000) ?? null;
}
async function pollView(ctx: QueryCtx, p: Doc<'aboPolls'>, userId: Id<'users'> | null, showCounts: boolean | 'all', now: number) {
  const votes = await ctx.db.query('aboVotes').withIndex('by_poll', (q) => q.eq('pollId', p._id)).collect();
  const mine = userId ? votes.find((x) => x.userId === userId)?.optionId : undefined;
  const open = pollOpen(p, now);
  // les chiffres : après avoir voté, ou une fois le vote terminé (pas avant : on ne suit pas la foule)
  const counts = showCounts === 'all' || (showCounts && (mine || !open)) ? Object.fromEntries(p.options.map((o) => [o.id, votes.filter((x) => x.optionId === o.id).length])) : undefined;
  return { id: p._id, title: p.title, options: p.options, closesAt: p.closesAt, open, total: votes.length, ...(mine ? { mine } : {}), ...(counts ? { counts } : {}) };
}

/** La page Abonnement d'un joueur (lue à la demande). Sans session : seulement le prix. */
export const page = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const u = await getUserByToken(ctx, sessionToken);
    const now = Date.now();
    const base = { priceEur: SUB_PRICE_EUR, extraPacks: SUB_EXTRA_PACKS };
    if (!u) return { ...base, weroTo: undefined, card: null, poll: null };
    const active = subActive(u, now);
    const row = await ctx.db.query('bebouCards').withIndex('by_user', (q) => q.eq('userId', u._id)).first();
    const p = await currentPoll(ctx, now);
    return {
      ...base,
      // (à qui payer : seulement pour un joueur connecté)
      weroTo: (await config(ctx))?.weroTo,
      card: row ? { title: row.title, idea: row.idea, status: row.status, mediaUrl: (row.media && (await ctx.storage.getUrl(row.media))) || undefined, updatedAt: row.updatedAt } : null,
      poll: p ? await pollView(ctx, p, u._id, active || isStaff(u), now) : null,
    };
  },
});

/** « J'ai payé » : le joueur prévient l'équipe, qui vérifie le Wero et active le mois. */
export const ask = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const u = await requireUser(ctx, sessionToken);
    const now = Date.now();
    // déjà abonné pour plus de 5 jours : rien à renouveler (évite les demandes en double)
    if ((u.subUntil ?? 0) - now > SUB_REMIND_MS) throw new ConvexError(fe('abo.2'));
    if (u.subAskAt) return { askedAt: u.subAskAt };
    await ctx.db.patch(u._id, { subAskAt: now });
    const staff = (await ctx.db.query('users').collect()).filter((x) => x.isAdmin && !x.bannedAt);
    for (const s of staff) await notify(ctx, s._id, { kind: 'news', title: fm('n.aboAsk', { name: u.displayName }), body: fm('n.aboAskBody'), url: '#/abonnement', tag: `abo-ask-${u._id}` });
    return { askedAt: now };
  },
});

/** Ma carte « Bebou » : un nom, une idée, une image facultative (envoyée avant par profiles:generateMediaUploadUrl). */
export const submitCard = mutation({
  args: { sessionToken: v.string(), title: v.string(), idea: v.string(), storageId: v.optional(v.id('_storage')), keepMedia: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, title, idea, storageId, keepMedia }) => {
    const u = await requireUser(ctx, sessionToken);
    const now = Date.now();
    const drop = async () => void (storageId && (await ctx.db.system.get(storageId)) && (await ctx.storage.delete(storageId)));
    if (!subActive(u, now)) {
      await drop();
      return { error: fe('abo.1') };
    }
    const row = await ctx.db.query('bebouCards').withIndex('by_user', (q) => q.eq('userId', u._id)).first();
    const bad = row?.status === 'done' ? fe('abo.3') : bebouCardProblem(title, idea);
    let media = keepMedia ? row?.media : undefined;
    let mediaBad: string | null = null;
    if (!bad && storageId) {
      const meta = await ctx.db.system.get(storageId);
      mediaBad = meta ? bebouMediaProblem(meta.size, meta.contentType) : fe('abo.4');
      if (!mediaBad) media = storageId;
    }
    // refus : le fichier envoyé est supprimé, et la réponse dit pourquoi (une exception annulerait la suppression)
    if (bad || mediaBad) {
      await drop();
      return { error: bad ?? mediaBad! };
    }
    const fields = { name: u.displayName, title: title.trim().slice(0, BEBOU_CARD.title), idea: idea.trim().slice(0, BEBOU_CARD.idea), status: 'new' as const, updatedAt: now };
    if (row) {
      if (row.media && row.media !== media && (await ctx.db.system.get(row.media))) await ctx.storage.delete(row.media);
      await ctx.db.patch(row._id, { ...fields, media });
    } else await ctx.db.insert('bebouCards', { userId: u._id, ...fields, ...(media ? { media } : {}), createdAt: now });
    return { error: undefined as string | undefined };
  },
});

/** Vote du mois : un choix par abonné, modifiable jusqu'à la fin. */
export const vote = mutation({
  args: { sessionToken: v.string(), pollId: v.id('aboPolls'), optionId: v.string() },
  handler: async (ctx, { sessionToken, pollId, optionId }) => {
    const u = await requireUser(ctx, sessionToken);
    const now = Date.now();
    if (!subActive(u, now)) throw new ConvexError(fe('abo.1'));
    const p = await ctx.db.get(pollId);
    if (!p || !pollOpen(p, now)) throw new ConvexError(fe('abo.5'));
    if (!p.options.some((o) => o.id === optionId)) throw new ConvexError(fe('abo.6'));
    const mine = await ctx.db.query('aboVotes').withIndex('by_poll_user', (q) => q.eq('pollId', pollId).eq('userId', u._id)).first();
    if (mine) await ctx.db.patch(mine._id, { optionId, at: now });
    else await ctx.db.insert('aboVotes', { pollId, userId: u._id, optionId, at: now });
    return await pollView(ctx, p, u._id, true, now);
  },
});

// ═════════════════════════════════════════════ équipe (dashboard)

/** (Re)programme le rappel « plus que 5 jours » pour la fin `until` ; annule le précédent. */
async function scheduleRemind(ctx: MutationCtx, u: Doc<'users'>, until: number | undefined) {
  if (u.subRemindJob) await ctx.scheduler.cancel(u.subRemindJob).catch(() => undefined);
  const at = (until ?? 0) - SUB_REMIND_MS;
  return until && at > Date.now() ? await ctx.scheduler.runAt(at, internal.abo.remind, { userId: u._id, until }) : undefined;
}

/** Active (ou prolonge) l'abonnement de `months` mois. Partagé par le dashboard et la ligne de commande. */
export async function activate(ctx: MutationCtx, u: Doc<'users'>, months: number) {
  const now = Date.now();
  // la réserve est d'abord mise à jour avec l'ANCIEN plafond : sinon le temps passé réserve pleine (minuteur à l'arrêt)
  // serait compté d'un coup comme de la recharge vers 20
  const regen = applyRegen(u.packBalance, u.packRegenAt ?? u.lastSeenAt, now, u.regenBoostUntil, packCapOf(u, now));
  const subUntil = subExtend(u.subUntil, now, months);
  const subRemindJob = await scheduleRemind(ctx, u, subUntil);
  await ctx.db.patch(u._id, { subUntil, subSince: u.subSince ?? now, subAskAt: undefined, subRemindJob, packBalance: regen.balance, packRegenAt: regen.regenAt });
  await scheduleReserveFull(ctx, u._id);
  await notify(ctx, u._id, { kind: 'news', title: fm('n.aboOn'), body: fm('n.aboOnBody'), url: '#/abonnement', tag: 'abo-on' });
  return subUntil;
}

export const remind = internalMutation({
  args: { userId: v.id('users'), until: v.number() },
  handler: async (ctx, { userId, until }) => {
    const u = await ctx.db.get(userId);
    // (prolongé ou arrêté depuis : ce rappel ne vaut plus)
    if (!u || u.subUntil !== until || !subActive(u)) return;
    await ctx.db.patch(userId, { subRemindJob: undefined });
    await notify(ctx, userId, { kind: 'news', title: fm('n.aboSoon'), body: fm('n.aboSoonBody'), url: '#/abonnement', tag: 'abo-soon' });
  },
});

export const adminState = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireStaff(ctx, sessionToken);
    const now = Date.now();
    const users = (await ctx.db.query('users').collect()).filter((u) => !u.bannedAt);
    const row = (u: Doc<'users'>) => ({ id: u._id, name: u.displayName, avatarUrl: u.avatarUrl, subUntil: u.subUntil, subSince: u.subSince, subAskAt: u.subAskAt, active: subActive(u, now) });
    const cards = await ctx.db.query('bebouCards').collect();
    const polls = await ctx.db.query('aboPolls').withIndex('by_closes').order('desc').take(12);
    return {
      now,
      priceEur: SUB_PRICE_EUR,
      weroTo: (await config(ctx))?.weroTo ?? '',
      asks: users.filter((u) => u.subAskAt).sort((a, b) => (a.subAskAt ?? 0) - (b.subAskAt ?? 0)).map(row),
      subs: users.filter((u) => u.subUntil).sort((a, b) => (a.subUntil ?? 0) - (b.subUntil ?? 0)).map(row),
      players: users.map((u) => ({ id: u._id, name: u.displayName })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      cards: await Promise.all(cards.sort((a, b) => b.updatedAt - a.updatedAt).map(async (c) => ({ id: c._id, userId: c.userId, name: c.name, title: c.title, idea: c.idea, status: c.status, updatedAt: c.updatedAt, mediaUrl: (c.media && (await ctx.storage.getUrl(c.media))) || undefined }))),
      polls: await Promise.all(polls.map(async (p) => ({ ...(await pollView(ctx, p, null, 'all', now)), byName: p.byName }))),
    };
  },
});

export const adminSetWero = mutation({
  args: { sessionToken: v.string(), weroTo: v.string() },
  handler: async (ctx, { sessionToken, weroTo }) => {
    const me = await requireStaff(ctx, sessionToken);
    const value = weroTo.trim().slice(0, 80);
    const c = await config(ctx);
    if (c) await ctx.db.patch(c._id, { weroTo: value || undefined });
    else await ctx.db.insert('appConfig', { key: CONFIG_KEY, ...(value ? { weroTo: value } : {}) });
    await log(ctx, me, 'abo.wero', value ? 'Destinataire Wero mis à jour' : 'Destinataire Wero retiré');
    return 'Destinataire Wero enregistré.';
  },
});

export const adminActivate = mutation({
  args: { sessionToken: v.string(), userId: v.id('users'), months: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, userId, months }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await ctx.db.get(userId);
    if (!u) throw new ConvexError('Joueur introuvable.');
    const n = Math.max(1, Math.min(SUB_MAX_MONTHS, Math.floor(months ?? 1)));
    const until = await activate(ctx, u, n);
    const day = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(until);
    await log(ctx, me, 'abo.activate', `+${n} mois → jusqu’au ${day}`, u.displayName);
    return `${u.displayName} : abonné jusqu’au ${day}.`;
  },
});

/** Arrête un abonnement tout de suite (erreur, remboursement) ; refuse aussi une demande « j'ai payé » sans paiement. */
export const adminStop = mutation({
  args: { sessionToken: v.string(), userId: v.id('users') },
  handler: async (ctx, { sessionToken, userId }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await ctx.db.get(userId);
    if (!u) throw new ConvexError('Joueur introuvable.');
    if (u.subRemindJob) await ctx.scheduler.cancel(u.subRemindJob).catch(() => undefined);
    const had = subActive(u);
    await ctx.db.patch(userId, { subUntil: had ? Date.now() : u.subUntil, subAskAt: undefined, subRemindJob: undefined });
    await scheduleReserveFull(ctx, userId);
    await log(ctx, me, 'abo.stop', had ? 'Abonnement arrêté' : 'Demande refusée', u.displayName);
    return had ? `${u.displayName} : abonnement arrêté.` : `${u.displayName} : demande retirée.`;
  },
});

export const adminCard = mutation({
  args: { sessionToken: v.string(), cardId: v.id('bebouCards'), status: v.union(v.literal('new'), v.literal('ok'), v.literal('done')) },
  handler: async (ctx, { sessionToken, cardId, status }) => {
    const me = await requireStaff(ctx, sessionToken);
    const c = await ctx.db.get(cardId);
    if (!c) throw new ConvexError('Proposition introuvable.');
    await ctx.db.patch(cardId, { status });
    await log(ctx, me, 'abo.card', `« ${c.title} » → ${status}`, c.name);
    return 'Proposition mise à jour.';
  },
});

export const adminPollSave = mutation({
  args: { sessionToken: v.string(), title: v.string(), options: v.array(v.string()), closesAt: v.number(), notifyPlayers: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, title, options, closesAt, notifyPlayers }) => {
    const me = await requireStaff(ctx, sessionToken);
    const now = Date.now();
    const bad = pollProblem(title, options, closesAt, now);
    if (bad) throw new ConvexError(bad);
    // un seul vote ouvert à la fois : le précédent est fermé
    for (const p of await ctx.db.query('aboPolls').withIndex('by_closes', (q) => q.gt('closesAt', now)).collect()) if (!p.closed) await ctx.db.patch(p._id, { closed: true });
    const opts = options.map((o) => o.trim()).filter(Boolean).map((label, i) => ({ id: `o${i + 1}`, label }));
    await ctx.db.insert('aboPolls', { title: title.trim(), options: opts, closesAt, byName: me.displayName, createdAt: now });
    if (notifyPlayers) {
      const subs = (await ctx.db.query('users').collect()).filter((u) => subActive(u, now) && !u.bannedAt);
      for (const u of subs) await notify(ctx, u._id, { kind: 'news', title: fm('n.aboPoll'), body: fm('n.aboPollBody', { title: title.trim() }), url: '#/abonnement', tag: 'abo-poll' });
    }
    await log(ctx, me, 'abo.poll', `« ${title.trim()} » · ${opts.length} choix`);
    return 'Vote ouvert.';
  },
});

export const adminPollClose = mutation({
  args: { sessionToken: v.string(), pollId: v.id('aboPolls') },
  handler: async (ctx, { sessionToken, pollId }) => {
    const me = await requireStaff(ctx, sessionToken);
    const p = await ctx.db.get(pollId);
    if (!p) throw new ConvexError('Vote introuvable.');
    await ctx.db.patch(pollId, { closed: true, closesAt: Math.min(p.closesAt, Date.now()) });
    await log(ctx, me, 'abo.pollClose', `« ${p.title} »`);
    return 'Vote terminé.';
  },
});

/**
 * Ligne de commande (secours) : npx convex run abo:activateCmd '{"name":"tom","months":1}'
 */
export const activateCmd = internalMutation({
  args: { name: v.string(), months: v.optional(v.number()) },
  handler: async (ctx, { name, months }) => {
    const u = (await ctx.db.query('users').collect()).find((x) => x.displayName.toLowerCase() === name.toLowerCase() || x.username.toLowerCase() === name.toLowerCase());
    if (!u) throw new ConvexError('Joueur introuvable.');
    return { jusquAu: new Date(await activate(ctx, u, Math.max(1, Math.min(SUB_MAX_MONTHS, Math.floor(months ?? 1))))).toISOString() };
  },
});
