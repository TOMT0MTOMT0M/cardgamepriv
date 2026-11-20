import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireUser } from './auth';
import { UNIQUE_TITLES, uniqueTitle, uniqueTitleProgress, uniqueTitleSet, type UniqueTitle } from '../src/core/uniqueTitles';
import { notify } from './push';
import { fm, feedMsg } from '../src/core/msgs';

/**
 * TITRES UNIQUES (20/11, règles : src/core/uniqueTitles.ts) — le premier joueur qui complète une collection à 100 %
 * remporte son titre, seul et pour toujours.
 *
 * CONCURRENCE (deux joueurs qui complètent « en même temps ») : une mutation Convex est une transaction sérialisable.
 * `award` LIT l'index `by_title` pour ce titre puis INSÈRE la ligne dans la même transaction. Si deux mutations lisent
 * « personne » en parallèle, la première validée écrit dans la plage d'index que l'autre a lue : Convex rejoue alors la
 * seconde, qui relit, trouve le détenteur et n'attribue rien. Il ne peut donc exister qu'UNE ligne par titre, sans
 * verrou ni contrainte à ajouter (testé : convex/titres.test.ts).
 *
 * QUAND : le client appelle `claim` dès qu'il voit une de ses collections complète et le titre libre (le serveur
 * revérifie toute la collection) ; l'encaissement des primes de complétion (economy:claimCompletions) passe aussi par
 * `awardUniqueTitles`, avec la collection qu'il vient déjà de lire. Aucune lecture en plus à l'ouverture d'un booster.
 */

/** Attribue le titre s'il est libre et la collection complète. Renvoie la ligne créée, sinon null. */
async function award(ctx: MutationCtx, u: Doc<'users'>, t: UniqueTitle, ownedIds: ReadonlySet<string>) {
  if (!uniqueTitleProgress(t, ownedIds).done) return null;
  // la lecture qui fait l'unicité : si un autre joueur insère ce titre entre-temps, cette mutation est rejouée
  const taken = await ctx.db.query('uniqueTitles').withIndex('by_title', (q) => q.eq('titleId', t.id)).first();
  if (taken) return null;
  const now = Date.now();
  await ctx.db.insert('uniqueTitles', { titleId: t.id, setId: t.setId, userId: u._id, name: u.displayName, at: now });
  const p = { name: u.displayName, titleId: t.id, utitle: t.label, setId: t.setId, set: uniqueTitleSet(t)?.label ?? t.setId };
  await ctx.db.insert('activityFeed', { userId: u._id, displayName: u.displayName, avatarUrl: u.avatarUrl, kind: 'game', ...feedMsg(fm('f.utitle', p)), createdAt: now });
  await notify(ctx, u._id, { kind: 'game', title: fm('n.utitle', p), body: fm('n.utitleBody', p), url: '#/succes' });
  return t;
}

/** Tous les titres que ce joueur peut remporter avec cette collection (déjà lue par l'appelant). */
export async function awardUniqueTitles(ctx: MutationCtx, u: Doc<'users'>, ownedIds: ReadonlySet<string>): Promise<UniqueTitle[]> {
  const won: UniqueTitle[] = [];
  for (const t of UNIQUE_TITLES) {
    const got = await award(ctx, u, t, ownedIds);
    if (got) won.push(got);
  }
  return won;
}

/**
 * Je réclame un titre (ou tous ceux que je peux avoir, sans `titleId`). Idempotent : rappeler ne donne rien de plus.
 * Avec `titleId`, l'échec est expliqué (déjà pris, cartes manquantes) ; sans, la liste revient simplement vide.
 */
export const claim = mutation({
  args: { sessionToken: v.string(), titleId: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, titleId }) => {
    const u = await requireUser(ctx, sessionToken);
    const one = titleId === undefined ? undefined : uniqueTitle(titleId);
    if (titleId !== undefined && !one) throw new ConvexError(fe('titres.1'));
    if (one) {
      // déjà pris : on le sait sans lire la collection
      const taken = await ctx.db.query('uniqueTitles').withIndex('by_title', (q) => q.eq('titleId', one.id)).first();
      if (taken && taken.userId !== u._id) throw new ConvexError(fe('titres.2', { p0: taken.name, p1: one.label }));
      if (taken) return { won: [] as string[] };
    }
    const inv = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', u._id)).collect();
    const owned = new Set(inv.map((c) => c.cardId));
    if (one) {
      const pr = uniqueTitleProgress(one, owned);
      if (!pr.done) throw new ConvexError(fe('titres.3', { p0: pr.total - pr.have, p1: pr.total - pr.have > 1 ? 's' : '', p2: one.label }));
    }
    const won = one ? [await award(ctx, u, one, owned)].filter((t): t is UniqueTitle => !!t) : await awardUniqueTitles(ctx, u, owned);
    return { won: won.map((t) => t.id) };
  },
});

/**
 * Les titres attribués (4 lignes au plus aujourd'hui) : page Succès et pastille à côté du pseudo. Ne lit QUE la table
 * des titres : la requête ne repart chez les joueurs que lorsqu'un titre est remporté (jamais sur un battement de cœur).
 */
export const holders = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query('uniqueTitles').take(200)).map((r) => ({ titleId: r.titleId, userId: r.userId, name: r.name, at: r.at })),
});

/**
 * Admin (triche avérée, compte banni) : libère un titre, qui redevient à prendre.
 *   npx convex run titres:revoke '{"titleId":"radiant"}'
 */
export const revoke = internalMutation({
  args: { titleId: v.string() },
  handler: async (ctx, { titleId }) => {
    const rows = await ctx.db.query('uniqueTitles').withIndex('by_title', (q) => q.eq('titleId', titleId)).collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { liberes: rows.map((r) => r.name) };
  },
});
