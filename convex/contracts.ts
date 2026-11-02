import { v, ConvexError } from 'convex/values';
import { bumpMissions } from './missions';
import { mutation } from './_generated/server';
import { requireUser } from './auth';
import { RARITY_LABEL, RARITY_TIER, rarityValidator, type RarityId } from './cardsCatalog';
import { CONTRACT_COST, contractProblem, contractTarget, rollContract } from '../src/core/contracts';
import type { StarRarityId } from '../src/core/dropRates';
import { lockedCards } from './trades';

function secureRandomFloat(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / (0xffffffff + 1);
}

/**
 * Contrat façon CS:GO (règles : src/core/contracts.ts) : brûle des doublons d'une même étoile (10 / 20 / 50 selon
 * l'étoile) contre une carte de l'étoile au-dessus, tirée côté serveur. Tout ou rien : la mutation est atomique.
 */
export const sign = mutation({
  args: {
    sessionToken: v.string(),
    rarity: rarityValidator,
    items: v.array(v.object({ cardId: v.string(), count: v.number() })),
  },
  handler: async (ctx, { sessionToken, rarity, items }) => {
    const user = await requireUser(ctx, sessionToken);
    const target = contractTarget(rarity) as RarityId | null;
    if (!target || items.length > 60) throw new ConvexError('Contrat invalide.');

    const inv = await ctx.db
      .query('inventory')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    const row = (cardId: string, r: RarityId) => inv.find((c) => c.cardId === cardId && c.rarity === r);
    // une carte engagée dans un échange en attente n'est pas brûlable (verrouillage, retours du 3 nov.)
    const locked = await lockedCards(ctx, user._id);
    const problem = contractProblem(rarity, items, (id) => Math.max(0, (row(id, rarity)?.count ?? 0) - 1 - (locked.get(`${id}:${rarity}`) ?? 0)));
    if (problem) throw new ConvexError(problem);

    const now = Date.now();
    // 1. on brûle (jamais le dernier exemplaire : vérifié par contractProblem)
    for (const it of items) {
      const r = row(it.cardId, rarity)!;
      await ctx.db.patch(r._id, { count: r.count - it.count });
    }

    // 2. la carte reçue (nouvelle si possible dans le sous-thème tiré)
    const ownedIds = new Set(inv.map((c) => c.cardId));
    const card = rollContract(rarity, items, (id) => ownedIds.has(id), secureRandomFloat);

    const mintDoc = await ctx.db
      .query('cardMints')
      .withIndex('by_card_rarity', (q) => q.eq('cardId', card.id).eq('rarity', target))
      .unique();
    const mintNumber = (mintDoc?.lastMintNumber ?? 0) + 1;
    if (mintDoc) await ctx.db.patch(mintDoc._id, { lastMintNumber: mintNumber });
    else await ctx.db.insert('cardMints', { cardId: card.id, rarity: target, lastMintNumber: mintNumber });

    const existing = row(card.id, target);
    const isNew = !ownedIds.has(card.id);
    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + 1, bestMintNumber: Math.min(existing.bestMintNumber, mintNumber), lastPulledAt: now });
    } else {
      await ctx.db.insert('inventory', {
        userId: user._id,
        cardId: card.id,
        rarity: target,
        count: 1,
        bestMintNumber: mintNumber,
        foilSeed: Math.floor(secureRandomFloat() * 900000) + 100000,
        firstPulledAt: now,
        lastPulledAt: now,
      });
    }

    await ctx.db.patch(user._id, { lastSeenAt: now, statusText: 'Vient de signer un contrat', totalContracts: (user.totalContracts ?? 0) + 1 });
    await bumpMissions(ctx, user, { type: 'contract' });
    if (RARITY_TIER[target] >= RARITY_TIER.epic) {
      await ctx.db.insert('activityFeed', {
        userId: user._id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        kind: 'contract',
        cardId: card.id,
        cardName: card.name,
        rarity: target,
        mintNumber,
        message: `${user.displayName} a brûlé ${CONTRACT_COST[rarity as StarRarityId]} doublons et signé un contrat : ${card.name} [${RARITY_LABEL[target]} #${mintNumber}] !`,
        createdAt: now,
      });
    }

    return { cardId: card.id, cardName: card.name, rarity: target, mintNumber, isNew, subthemeId: card.subthemeId };
  },
});
