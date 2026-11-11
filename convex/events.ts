import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getUserByToken } from './auth';
import { checkEvent, contentLabel, eventCards, fmtLeft, type PackEvent } from '../src/core/events';

/**
 * ÉVÉNEMENTS LIMITÉS (V2, 11/11) — le « booster du moment » (src/core/events.ts pour les règles).
 *  - `current` : ce que le jeu lit (abonnement léger : quelques lignes, relancé seulement quand une ligne change).
 *    Convex ne relance pas une requête parce que le temps passe : ce sont les tâches programmées au début et à la fin
 *    (`tick`) qui réécrivent la ligne, et donc relancent `current` chez tout le monde au bon moment. Un événement à
 *    venir n'est jamais envoyé aux joueurs (pas de fuite du contenu avant l'heure).
 *  - `admin*` : dashboard (/admin/, onglet Événements), Tom et Hugo seulement, tout est noté dans `adminLog`.
 * Le tirage lui-même est dans convex/packs.ts (`preparePack` avec `eventId`).
 */

const pub = (e: Doc<'packEvents'>): PackEvent => ({
  id: e._id,
  name: e.name,
  ...(e.blurb ? { blurb: e.blurb } : {}),
  startAt: e.startAt,
  endAt: e.endAt,
  accent: e.accent,
  subthemes: e.subthemes,
  cards: e.cards,
});

/** Événement(s) en cours (en pratique 0 ou 1). Sans jeton : la boutique le montre aussi avant la connexion. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query('packEvents').withIndex('by_end', (q) => q.gt('endAt', now)).take(5);
    return rows.filter((e) => e.startAt <= now).map(pub);
  },
});

/** Pour packs.ts : l'événement ouvrable maintenant, ou une erreur claire. */
export async function liveEventOrThrow(ctx: QueryCtx | MutationCtx, id: Id<'packEvents'>, now = Date.now()): Promise<Doc<'packEvents'>> {
  const e = await ctx.db.get(id);
  if (!e) throw new ConvexError('Ce booster du moment n’existe plus.');
  if (now < e.startAt) throw new ConvexError('Ce booster du moment n’est pas encore sorti.');
  if (now >= e.endAt) throw new ConvexError(`Le booster ${e.name} est terminé : il n’était là que pour un temps.`);
  return e;
}

// ───────────────────────────── dashboard (équipe) ─────────────────────────────
async function requireStaff(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  const me = await getUserByToken(ctx, sessionToken);
  if (!me) throw new ConvexError('Non connecté : connecte-toi dans le jeu, puis reviens ici.');
  if (!(me.isAdmin || me.isModerator)) throw new ConvexError('Réservé à l’équipe (Tom et Hugo).');
  return me;
}
async function log(ctx: MutationCtx, me: Doc<'users'>, action: string, detail: string, target?: string) {
  await ctx.db.insert('adminLog', { byUserId: me._id, byName: me.displayName, action, detail: detail.slice(0, 600), ...(target ? { target } : {}), at: Date.now() });
}

const status = (e: Pick<Doc<'packEvents'>, 'startAt' | 'endAt'>, now: number) => (now < e.startAt ? ('avenir' as const) : now < e.endAt ? ('encours' as const) : ('fini' as const));

/** Les 30 derniers événements (à venir, en cours, finis), du plus récent au plus ancien. */
export const adminList = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireStaff(ctx, sessionToken);
    const now = Date.now();
    const rows = await ctx.db.query('packEvents').withIndex('by_end').order('desc').take(30);
    return rows.map((e) => ({ ...pub(e), status: status(e, now), count: eventCards(e).length, label: contentLabel(e), byName: e.byName, updatedAt: e.updatedAt, notified: !!e.notifiedAt }));
  },
});

/** Un seul événement à la fois : refuse un chevauchement avec un autre. */
async function assertNoOverlap(ctx: MutationCtx, startAt: number, endAt: number, self?: Id<'packEvents'>) {
  const others = await ctx.db.query('packEvents').withIndex('by_end', (q) => q.gt('endAt', startAt)).take(50);
  const clash = others.find((o) => o._id !== self && o.startAt < endAt);
  if (clash) throw new ConvexError(`Ces dates tombent sur « ${clash.name} » : un seul booster du moment à la fois.`);
}

/** (re)programme les tâches de début et de fin ; annule les anciennes */
async function schedule(ctx: MutationCtx, id: Id<'packEvents'>) {
  const e = (await ctx.db.get(id))!;
  for (const job of [e.startJob, e.endJob]) if (job) await ctx.scheduler.cancel(job).catch(() => undefined);
  const now = Date.now();
  const startJob = !e.notifiedAt && e.endAt > now ? await ctx.scheduler.runAt(Math.max(now, e.startAt), internal.events.tick, { id, kind: 'start', at: e.startAt }) : undefined;
  const endJob = e.endAt > now ? await ctx.scheduler.runAt(e.endAt, internal.events.tick, { id, kind: 'end', at: e.endAt }) : undefined;
  await ctx.db.patch(id, { startJob, endJob });
}

const DAY = 86_400_000;
const fmtSpan = (startAt: number, endAt: number) => `${fmtLeft(endAt - startAt).replace(/ /g, ' ')}`;

/** Créer (sans id) ou modifier un événement. */
export const adminSave = mutation({
  args: {
    sessionToken: v.string(),
    id: v.optional(v.id('packEvents')),
    name: v.string(),
    blurb: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    accent: v.string(),
    subthemes: v.array(v.string()),
    cards: v.array(v.string()),
  },
  handler: async (ctx, a): Promise<{ id: Id<'packEvents'>; msg: string }> => {
    const me = await requireStaff(ctx, a.sessionToken);
    const now = Date.now();
    const name = a.name.trim().replace(/\s+/g, ' ');
    const blurb = a.blurb?.trim().replace(/\s+/g, ' ') || undefined;
    const subthemes = [...new Set(a.subthemes.map((s) => s.trim()).filter(Boolean))];
    const cards = [...new Set(a.cards.map((s) => s.trim()).filter(Boolean))];
    const accent = a.accent.trim().toLowerCase();
    const err = checkEvent({ name, blurb, startAt: a.startAt, endAt: a.endAt, accent, subthemes, cards });
    if (err) throw new ConvexError(err);
    const prev = a.id ? await ctx.db.get(a.id) : null;
    if (a.id && !prev) throw new ConvexError('Événement introuvable.');
    if (!prev && a.endAt <= now) throw new ConvexError('Cet événement serait déjà fini : choisis une fin dans le futur.');
    if (!prev && a.startAt < now - DAY) throw new ConvexError('Le début est passé depuis plus d’un jour : choisis « maintenant » ou une date à venir.');
    await assertNoOverlap(ctx, a.startAt, a.endAt, a.id);
    const fields = { name, blurb, startAt: a.startAt, endAt: a.endAt, accent, subthemes, cards, updatedAt: now };
    let id: Id<'packEvents'>;
    if (prev) {
      await ctx.db.patch(prev._id, fields);
      id = prev._id;
    } else id = await ctx.db.insert('packEvents', { ...fields, byName: me.displayName, createdAt: now });
    await schedule(ctx, id);
    const n = eventCards({ subthemes, cards }).length;
    await log(ctx, me, prev ? 'evenement-modif' : 'evenement', `« ${name} » · ${n} cartes · ${contentLabel({ subthemes, cards })} · ${fmtSpan(a.startAt, a.endAt)}`, name);
    return { id, msg: prev ? `« ${name} » enregistré.` : `« ${name} » créé (${n} cartes).` };
  },
});

/** Avancer le début à maintenant (l'événement sort tout de suite ; notification à tous). */
export const adminStartNow = mutation({
  args: { sessionToken: v.string(), id: v.id('packEvents') },
  handler: async (ctx, { sessionToken, id }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError('Événement introuvable.');
    const now = Date.now();
    if (e.endAt <= now) throw new ConvexError('Cet événement est déjà terminé.');
    if (e.startAt <= now) return `« ${e.name} » est déjà en cours.`;
    await assertNoOverlap(ctx, now, e.endAt, id);
    await ctx.db.patch(id, { startAt: now, updatedAt: now });
    await schedule(ctx, id);
    await log(ctx, me, 'evenement-debut', `« ${e.name} » sorti maintenant (prévu ${fmtLeft(e.startAt - now).replace(/ /g, ' ')} plus tard)`, e.name);
    return `« ${e.name} » est sorti : les joueurs le voient dans la boutique.`;
  },
});

/** Terminer maintenant un événement en cours. */
export const adminEndNow = mutation({
  args: { sessionToken: v.string(), id: v.id('packEvents') },
  handler: async (ctx, { sessionToken, id }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError('Événement introuvable.');
    const now = Date.now();
    if (e.endAt <= now) return `« ${e.name} » est déjà terminé.`;
    if (e.startAt > now) throw new ConvexError('Pas encore commencé : supprime-le plutôt.');
    await ctx.db.patch(id, { endAt: now, updatedAt: now });
    await schedule(ctx, id);
    await log(ctx, me, 'evenement-fin', `« ${e.name} » terminé à la main`, e.name);
    return `« ${e.name} » est terminé : il disparaît de la boutique.`;
  },
});

/** Supprimer un événement pas encore commencé (les finis restent : historique). */
export const adminRemove = mutation({
  args: { sessionToken: v.string(), id: v.id('packEvents') },
  handler: async (ctx, { sessionToken, id }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const e = await ctx.db.get(id);
    if (!e) return 'Déjà supprimé.';
    if (e.startAt <= Date.now()) throw new ConvexError('Déjà commencé : termine-le plutôt (il reste dans l’historique).');
    for (const job of [e.startJob, e.endJob]) if (job) await ctx.scheduler.cancel(job).catch(() => undefined);
    await ctx.db.delete(id);
    await log(ctx, me, 'evenement-suppr', `« ${e.name} » supprimé avant sa sortie`, e.name);
    return `« ${e.name} » supprimé.`;
  },
});

/**
 * Tâche programmée : début (notification à tous, une fois) ou fin. Réécrit la ligne dans les deux cas, ce qui relance
 * `current` chez tous les joueurs connectés.
 */
export const tick = internalMutation({
  args: { id: v.id('packEvents'), kind: v.union(v.literal('start'), v.literal('end')), at: v.number() },
  handler: async (ctx, { id, kind, at }) => {
    const e = await ctx.db.get(id);
    if (!e) return;
    const now = Date.now();
    if (kind === 'end') {
      if (e.endAt !== at) return; // fin déplacée entre-temps : une autre tâche est programmée
      await ctx.db.patch(id, { tickAt: now, endJob: undefined });
      return;
    }
    if (e.startAt !== at || e.notifiedAt || e.endAt <= now) return;
    await ctx.db.patch(id, { tickAt: now, notifiedAt: now, startJob: undefined });
    try {
      await ctx.runMutation(internal.push.announce, {
        title: `Booster du moment : ${e.name}`,
        body: `${e.blurb ? `${e.blurb.replace(/[.!…\s]+$/, '')}. ` : ''}À la boutique pendant ${fmtLeft(e.endAt - now).replace(/ /g, ' ')} seulement.`,
        url: '#/',
      });
    } catch (err) {
      console.warn('[events] notification', err);
    }
  },
});
