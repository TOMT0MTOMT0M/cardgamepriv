/**
 * (V2 fluidité) COLLECTION PAR DIFFÉRENCE — chaque écriture sur une ligne d'inventaire pose `rev` (l'instant de la
 * mutation) ; une suppression laisse une trace dans `invGone`. Le client lit sa collection EN ENTIER une fois
 * (`inventory.collectionFull`), puis ne suit que ce qui a changé depuis (`inventory.mineSince`) : après un booster, le
 * serveur relit et renvoie ~5 lignes au lieu de toute la collection.
 *
 * RÈGLE : tout code qui écrit dans `inventory` passe `rev: invRev()` dans son patch / insert et supprime par `dropInv`.
 * Une écriture oubliée n'est pas perdue pour toujours : elle réapparaît à la prochaine lecture complète (relance).
 */
import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

/** révision d'une écriture d'inventaire (horloge de la mutation, la même pour toutes ses écritures) */
export const invRev = () => Date.now();

/** supprime une ligne d'inventaire en laissant sa trace (le client l'efface de sa copie) */
export async function dropInv(ctx: MutationCtx, row: Doc<'inventory'>) {
  await ctx.db.delete(row._id);
  await ctx.db.insert('invGone', { userId: row.userId, cardId: row.cardId, rarity: row.rarity, rev: invRev() });
}
