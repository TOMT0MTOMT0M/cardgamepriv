import { v } from 'convex/values';
import { query, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

/** une ligne de « Gros tirages » : seulement les champs que le jeu lit (src/game/onlineBackend.ts) */
export type BigRow = Pick<Doc<'activityFeed'>, '_id' | 'userId' | 'displayName' | 'avatarUrl' | 'cardName' | 'mintNumber' | 'createdAt'> & { cardId: string; rarity: NonNullable<Doc<'activityFeed'>['rarity']> };
const DIGEST_MAX = 40;
const rowOf = (f: Doc<'activityFeed'>): BigRow => ({ _id: f._id, userId: f.userId, displayName: f.displayName, avatarUrl: f.avatarUrl, cardId: f.cardId!, cardName: f.cardName, rarity: f.rarity!, mintNumber: f.mintNumber, createdAt: f.createdAt });

/**
 * (v2.1.32, coût Convex, piste 7) à appeler juste après l'insertion d'un gros tirage dans le fil (`big: true`) : il
 * entre en tête du document « derniers gros tirages » (40 au plus). Document absent (première fois) : construit depuis
 * l'index `by_big`, qui contient déjà la nouvelle ligne.
 */
export async function pushBigPull(ctx: MutationCtx, id: Id<'activityFeed'>) {
  const digest = await ctx.db.query('bigPullsDigest').withIndex('by_key', (q) => q.eq('key', 'big')).first();
  if (!digest) {
    const rows = await ctx.db.query('activityFeed').withIndex('by_big', (q) => q.eq('big', true)).order('desc').take(DIGEST_MAX);
    await ctx.db.insert('bigPullsDigest', { key: 'big', rows: rows.filter((f) => f.cardId && f.rarity).map(rowOf) });
    return;
  }
  const f = await ctx.db.get(id);
  if (!f?.cardId || !f.rarity) return;
  const rows = [rowOf(f), ...digest.rows.filter((r) => r._id !== id)].sort((a, b) => b.createdAt - a.createdAt).slice(0, DIGEST_MAX);
  await ctx.db.patch(digest._id, { rows });
}

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = Math.min(limit ?? 25, 50);
    return await ctx.db
      .query('activityFeed')
      .withIndex('by_createdAt')
      .order('desc')
      .take(max);
  },
});

/**
 * « Gros tirages » de la page d'accueil : les dernières cartes Légendaires, Mythiques et Secrètes tirées par tout le
 * monde (5★ et plus). Lues par l'index `by_big` ; tant que la base n'est pas marquée, ancien parcours des 400
 * dernières entrées du fil en repli.
 */
export const bigPulls = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<BigRow[]> => {
    const max = Math.min(limit ?? 24, 40);
    // (v2.1.32, piste 7) un seul document (≈ 7 Ko) au lieu de `max` lignes du fil (≈ 18 Ko), relu chez chaque joueur
    const digest = await ctx.db.query('bigPullsDigest').withIndex('by_key', (q) => q.eq('key', 'big')).first();
    if (digest && digest.rows.length >= Math.min(max, DIGEST_MAX)) return digest.rows.slice(0, max);
    // (V2 fluidité, lot 4) lecture par l'index : `max` lignes lues au lieu de 400 à chaque nouvelle entrée du fil
    const big = await ctx.db
      .query('activityFeed')
      .withIndex('by_big', (q) => q.eq('big', true))
      .order('desc')
      .take(max);
    if (big.length >= max) return big.map(rowOf);
    // pas encore assez de lignes marquées (avant `migrations:markBigPulls`, ou tout début d'une base) : ancien parcours
    const recent = await ctx.db.query('activityFeed').withIndex('by_createdAt').order('desc').take(400);
    const seen = new Set(big.map((f) => f._id));
    return [...big, ...recent.filter((f) => isBigPull(f) && !seen.has(f._id))].sort((a, b) => b.createdAt - a.createdAt).slice(0, max).map(rowOf);
  },
});

/** Un « gros tirage » : carte Légendaire, Mythique ou Secrète sortie d'un booster. */
export const isBigPull = (f: { cardId?: string; rarity?: string; kind: string }): boolean =>
  !!f.cardId && (f.rarity === 'legendary' || f.rarity === 'mythic' || f.rarity === 'secret') && (f.kind === 'pull' || f.kind === 'mythic_pull' || f.kind === 'secret_pull');
