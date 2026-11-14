import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

/**
 * ENVIES PAR CARTE (audit perf 12/11, décision 10 / A7-02, A7-03).
 *
 * La liste d'envies reste dans `users.wishlist` (source de vérité, lue par le joueur lui-même). Cette table en est
 * l'INDEX INVERSÉ : « qui veut cette carte ? » sans relire tous les joueurs (fiche d'une carte, « Pour toi »).
 *
 * RÈGLE : tout code qui écrit `users.wishlist` appelle `setWish` (une carte) ou `syncWishes` (liste entière) ; un joueur
 * supprimé : `syncWishes(ctx, id, [])`.
 *
 * Mise en ligne : `migrations:backfillWishes` remplit la table par lots puis pose le témoin `appConfig` « wishesReady ».
 * Sans témoin, les lectures font comme avant (tous les joueurs relus).
 */
const READY = 'wishesReady';

export async function wishesReady(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  return !!(await ctx.db.query('appConfig').withIndex('by_key', (q) => q.eq('key', READY)).first());
}
export async function markWishesReady(ctx: MutationCtx): Promise<void> {
  if (!(await wishesReady(ctx))) await ctx.db.insert('appConfig', { key: READY });
}

/** Une carte ajoutée aux envies d'un joueur, ou retirée. */
export async function setWish(ctx: MutationCtx, userId: Id<'users'>, cardId: string, on: boolean): Promise<void> {
  const rows = await ctx.db.query('wishes').withIndex('by_user', (q) => q.eq('userId', userId).eq('cardId', cardId)).collect();
  if (on && !rows.length) await ctx.db.insert('wishes', { userId, cardId });
  if (!on) for (const r of rows) await ctx.db.delete(r._id);
  if (on) for (const r of rows.slice(1)) await ctx.db.delete(r._id);
}

/** Aligne les lignes d'un joueur sur sa liste. Rend le nombre de lignes écrites ou retirées. Idempotent. */
export async function syncWishes(ctx: MutationCtx, userId: Id<'users'>, list: readonly string[]): Promise<number> {
  const want = new Set(list);
  const seen = new Set<string>();
  let n = 0;
  for (const r of await ctx.db.query('wishes').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
    if (!want.has(r.cardId) || seen.has(r.cardId)) (await ctx.db.delete(r._id), n++);
    else seen.add(r.cardId);
  }
  for (const cardId of want) if (!seen.has(cardId)) (await ctx.db.insert('wishes', { userId, cardId }), n++);
  return n;
}

/** Les joueurs qui ont cette carte dans leurs envies. */
export async function wishersOf(ctx: QueryCtx | MutationCtx, cardId: string): Promise<Id<'users'>[]> {
  return (await ctx.db.query('wishes').withIndex('by_card', (q) => q.eq('cardId', cardId)).collect()).map((w) => w.userId);
}
