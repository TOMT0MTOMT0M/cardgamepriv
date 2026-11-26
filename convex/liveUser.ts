import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';

/**
 * (26/11, coût Convex, session 2) LE DOCUMENT JOUEUR LU UNE FOIS PAR MUTATION.
 *
 * Chaque `ctx.db.get` du joueur est facturé (≈ 3 à 6 Ko en prod), même s'il a déjà été lu dans la même mutation ; les
 * écritures, elles, sont regroupées à la fin (journaux de la prod : un `revealPack` écrit le joueur UNE fois, quel que
 * soit le nombre de patchs). Un booster le relisait 6 fois (`revealPack`) ou 3 fois (`preparePack`), une série de 10
 * 31 à 61 fois. Les aides des boosters (pièces, semaine, missions, parrainage, présence, rappel « réserve pleine »)
 * acceptent donc la copie `live` déjà lue au lieu de la relire, et la tiennent à jour avec `patchLive`.
 *
 * RÈGLE : une mutation qui passe `live` à une aide écrit le joueur SEULEMENT par `patchLive` (sinon la copie retarde).
 */
export async function patchLive(ctx: MutationCtx, live: Doc<'users'>, fields: Partial<Doc<'users'>>): Promise<void> {
  await ctx.db.patch(live._id, fields);
  Object.assign(live, fields);
}
