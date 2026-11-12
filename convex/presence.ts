import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

/**
 * PRÉSENCE (audit perf 12/11, décision 8 / E1-05) — la « carte publique » d'un joueur, hors de son document.
 *
 * AVANT : le battement de cœur écrivait `users.lastSeenAt` ; la liste du club (`users.friends`) et « mes amis »
 * (`friends.mine`) lisaient les documents `users` entiers. Chaque écriture sur un joueur (pièces, missions, réserve…)
 * relançait donc ces requêtes chez tous les autres, et le battement relançait profil, économie et missions chez soi.
 * Coût en joueurs² : à refaire avant de passer de 20 à 40-50 joueurs.
 *
 * MAINTENANT : une ligne `presence` par joueur = ce que les AUTRES voient de lui (nom, avatar, dernière visite, statut,
 * boosters ouverts, banni). Le battement n'écrit plus qu'elle ; le club et les amis ne lisent plus qu'elle.
 *
 * RÈGLE : tout code qui écrit un de ces champs dans `users` appelle `syncPresence(ctx, userId)` juste après ; toute
 * suppression de joueur aussi. Un oubli se rattrape au battement suivant (≤ 5 min 30 en ligne), qui recopie la carte.
 *
 * Mise en ligne : `migrations:backfillPresence` crée toutes les lignes d'un coup. Tant que la table est vide, tout
 * fonctionne comme avant (lecture et écriture de `users`) : la table est soit vide, soit complète.
 */
type Card = Omit<Doc<'presence'>, '_id' | '_creationTime'>;

const cardOf = (u: Doc<'users'>, lastSeenAt: number): Card => ({
  userId: u._id,
  lastSeenAt,
  displayName: u.displayName,
  username: u.username,
  totalPacksOpened: u.totalPacksOpened,
  ...(u.avatarUrl !== undefined ? { avatarUrl: u.avatarUrl } : {}),
  ...(u.statusText !== undefined ? { statusText: u.statusText } : {}),
  ...(u.bannedAt !== undefined ? { bannedAt: u.bannedAt } : {}),
});

const same = (a: Card, b: Doc<'presence'>) =>
  a.lastSeenAt === b.lastSeenAt && a.displayName === b.displayName && a.username === b.username && a.totalPacksOpened === b.totalPacksOpened && a.avatarUrl === b.avatarUrl && a.statusText === b.statusText && a.bannedAt === b.bannedAt;

export const presenceOf = (ctx: QueryCtx | MutationCtx, userId: Id<'users'>) => ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', userId)).first();

/**
 * Recopie la carte publique du joueur dans `presence` si elle a changé. `seenAt` : vu à cet instant (battement).
 * Joueur supprimé : sa ligne aussi. Table encore vide (avant la migration) : rien.
 */
export async function syncPresence(ctx: MutationCtx, userId: Id<'users'>, seenAt = 0): Promise<void> {
  const [u, row] = await Promise.all([ctx.db.get(userId), presenceOf(ctx, userId)]);
  if (!u) {
    if (row) await ctx.db.delete(row._id);
    return;
  }
  const want = cardOf(u, Math.max(u.lastSeenAt, row?.lastSeenAt ?? 0, seenAt));
  if (row) {
    if (!same(want, row)) await ctx.db.replace(row._id, want);
  } else if (await ctx.db.query('presence').first()) await ctx.db.insert('presence', want);
}

/** Crée la ligne d'un joueur qui n'en a pas (migration, idempotent). Rend `true` si elle a été créée. */
export async function ensurePresence(ctx: MutationCtx, u: Doc<'users'>): Promise<boolean> {
  if (await presenceOf(ctx, u._id)) return false;
  await ctx.db.insert('presence', cardOf(u, u.lastSeenAt));
  return true;
}

/** Dernière visite d'UN joueur (présence si elle existe, sinon son document). */
export async function seenAtOf(ctx: QueryCtx | MutationCtx, u: Doc<'users'>): Promise<number> {
  return Math.max(u.lastSeenAt, (await presenceOf(ctx, u._id))?.lastSeenAt ?? 0);
}

/** Dernière visite de TOUS les joueurs, en une lecture de la table (pour les listes : marché, propriétaires, admin). */
export async function seenAtAll(ctx: QueryCtx | MutationCtx): Promise<(u: Doc<'users'>) => number> {
  const by = new Map((await ctx.db.query('presence').collect()).map((p) => [p.userId as string, p.lastSeenAt]));
  return (u) => Math.max(u.lastSeenAt, by.get(u._id) ?? 0);
}
