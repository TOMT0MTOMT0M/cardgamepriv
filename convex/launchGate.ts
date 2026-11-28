import { fe } from '../src/core/errors';
import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';

/**
 * PORTE D'OUVERTURE — ce que auth.ts lit de l'ouverture officielle (convex/launch.ts), SANS le reste (audit perf V3 n°10).
 *
 * Avant, ici : launch.ts, qui importe la roulette (games.ts) donc tout le catalogue de cartes. Comme presque tous les
 * modules importent auth.ts, ils chargeaient tous le catalogue à chaque exécution (≈ 0,15-0,2 s sur le staging), même
 * `inventory`, `friends` ou `launch:status`, qui n'en lisent aucune carte. launch.ts réexporte tout : imports inchangés.
 * Garde-fou : convex/catalogImports.test.ts.
 */

/** (ouverture 07/11) tout le monde arrive avec la réserve pleine (15) et 24 h de recharge ×2 */
export const STARTER_PACKS = 15;
export const LAUNCH_KEY = 'launch';

export async function launchConfig(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query('appConfig')
    .withIndex('by_key', (q) => q.eq('key', LAUNCH_KEY))
    .unique();
}

/** Instant d'ouverture (null = ouvert / pas de compte à rebours). */
export async function launchAt(ctx: QueryCtx | MutationCtx): Promise<number | null> {
  return (await launchConfig(ctx))?.launchAt ?? null;
}

/** Création de compte refusée tant que ce n'est pas ouvert. */
export async function assertOpen(ctx: MutationCtx) {
  const at = await launchAt(ctx);
  if (at && Date.now() < at) {
    const t = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(at);
    throw new ConvexError(fe('launch.1', { p0: t.replace(':', ' h ') }));
  }
}
