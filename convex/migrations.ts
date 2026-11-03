import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { catalogCard } from './cardsCatalog';
import type { RarityId } from './cardsCatalog';

/**
 * RARETÉS — une seule source de vérité : le catalogue (src/core/sets/*).
 *
 * Retours live 02, bug 2 : quand un patch de données change l'étoile d'une carte (ex. Red Bull 4★ → 6★, patch World V7),
 * les lignes d'inventaire déjà tirées gardaient l'ancienne rareté → la Collection (qui lit le catalogue) et la Vitrine
 * (qui lisait l'inventaire) ne disaient plus la même chose. Cette migration réaligne tout sur le catalogue :
 * inventaire (lignes fusionnées si la bonne rareté existe déjà), vitrines, classeurs, cartes de pochette.
 * Idempotente : la relancer ne change rien. Lancée à chaque mise en ligne (mettre-en-ligne-prod.cmd / deployer.cmd).
 *
 *   npx convex run migrations:resyncRarities
 */
const BATCH = 200;

const truth = (cardId: string, r: RarityId): RarityId => catalogCard(cardId)?.baseRarity ?? r;

export const resyncRarities = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), fixed: v.optional(v.number()) },
  handler: async (ctx, { cursor, fixed = 0 }) => {
    const page = await ctx.db.query('inventory').paginate({ cursor: cursor ?? null, numItems: BATCH });
    const users = new Set<Doc<'users'>['_id']>();
    for (const row of page.page) {
      const want = truth(row.cardId, row.rarity);
      if (want === row.rarity) continue;
      fixed++;
      users.add(row.userId);
      const twin = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) => q.eq('userId', row.userId).eq('cardId', row.cardId).eq('rarity', want))
        .unique();
      if (twin) {
        await ctx.db.patch(twin._id, {
          count: twin.count + row.count,
          bestMintNumber: Math.min(twin.bestMintNumber, row.bestMintNumber),
          firstPulledAt: Math.min(twin.firstPulledAt, row.firstPulledAt),
          lastPulledAt: Math.max(twin.lastPulledAt, row.lastPulledAt),
        });
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { rarity: want });
      }
    }
    // vitrines et classeurs des joueurs touchés
    for (const uid of users) {
      const u = await ctx.db.get(uid);
      if (u?.showcase?.some((c) => truth(c.cardId, c.rarity) !== c.rarity)) {
        await ctx.db.patch(uid, { showcase: dedupe(u.showcase.map((c) => ({ cardId: c.cardId, rarity: truth(c.cardId, c.rarity) }))) });
      }
      const binders = await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
      for (const b of binders) {
        if (!b.cards.some((c) => truth(c.cardId, c.rarity) !== c.rarity)) continue;
        await ctx.db.patch(b._id, { cards: dedupe(b.cards.map((c) => ({ cardId: c.cardId, rarity: truth(c.cardId, c.rarity) }))) });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.resyncRarities, { cursor: page.continueCursor, fixed });
      return { done: false, fixed };
    }
    return { done: true, fixed };
  },
});

function dedupe<T extends { cardId: string; rarity: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.cardId}:${c.rarity}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
