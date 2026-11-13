import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { bumpMissions } from './missions';
import { bumpWeekly } from './econLib';
import { mutation } from './_generated/server';
import { requireUser } from './auth';
import { RARITY_LABEL, RARITY_TIER, rarityValidator, type RarityId } from './cardsCatalog';
import { CONTRACT_COST, contractOdds, contractProblem, contractTarget, rollContract } from '../src/core/contracts';
import { SUBTHEMES } from '../src/core/sets/themes';
import type { Doc } from './_generated/dataModel';
import type { StarRarityId } from '../src/core/dropRates';
import { lockedCards } from './trades';
import { invRev } from './invRev';
import { syncPresence } from './presence';
import { fm, feedMsg } from '../src/core/msgs';

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
    if (!target || items.length > 60) throw new ConvexError(fe('contracts.7'));

    // (audit 12/11, S07 / A7-04) seulement les lignes du contrat (≤ 60, par l'index), plus la collection entière
    const mine = (cardId: string) => ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', cardId));
    const lineOf = (cardId: string, r: RarityId) => ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', user._id).eq('cardId', cardId).eq('rarity', r)).first();
    const rows = new Map<string, Doc<'inventory'> | null>();
    for (const it of items) if (!rows.has(it.cardId)) rows.set(it.cardId, await lineOf(it.cardId, rarity));
    /** ligne d'une carte DU CONTRAT (à la rareté brûlée) */
    const row = (cardId: string) => rows.get(cardId) ?? undefined;
    // une carte engagée dans un échange en attente n'est pas brûlable (verrouillage, retours du 3 nov.)
    const locked = await lockedCards(ctx, user._id);
    const problem = contractProblem(rarity, items, (id) => Math.max(0, (row(id)?.count ?? 0) - 1 - (locked.get(`${id}:${rarity}`) ?? 0)));
    if (problem) throw new ConvexError(problem);

    const now = Date.now();
    // 1. on brûle (jamais le dernier exemplaire : vérifié par contractProblem)
    for (const it of items) {
      const r = row(it.cardId)!;
      await ctx.db.patch(r._id, { count: r.count - it.count, rev: invRev() });
    }

    // 2. la carte reçue (nouvelle si possible dans le sous-thème tiré)
    // « déjà possédée ? » : seulement pour les cartes que le contrat peut donner (sous-thèmes tirables, rareté visée)
    const subs = new Set(contractOdds(rarity, items).map((o) => o.subthemeId));
    const ownedIds = new Set<string>();
    for (const st of SUBTHEMES) if (subs.has(st.id)) for (const c of st.cards) if (c.rarity === target && (await mine(c.id).first())) ownedIds.add(c.id);
    const card = rollContract(rarity, items, (id) => ownedIds.has(id), secureRandomFloat);

    const mintDoc = await ctx.db
      .query('cardMints')
      .withIndex('by_card_rarity', (q) => q.eq('cardId', card.id).eq('rarity', target))
      .unique();
    const mintNumber = (mintDoc?.lastMintNumber ?? 0) + 1;
    if (mintDoc) await ctx.db.patch(mintDoc._id, { lastMintNumber: mintNumber });
    else await ctx.db.insert('cardMints', { cardId: card.id, rarity: target, lastMintNumber: mintNumber });

    const existing = await lineOf(card.id, target); // la carte reçue : sa ligne à la rareté visée, lue à part
    const isNew = !ownedIds.has(card.id);
    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + 1, bestMintNumber: Math.min(existing.bestMintNumber, mintNumber), lastPulledAt: now, rev: invRev() });
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
        rev: invRev(),
      });
    }

    await ctx.db.patch(user._id, { lastSeenAt: now, statusText: 'Vient de signer un contrat', totalContracts: (user.totalContracts ?? 0) + 1 });
    await syncPresence(ctx, user._id);
    await bumpMissions(ctx, user, { type: 'contract' });
    await bumpWeekly(ctx, user._id, { type: 'contract' });
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
        ...feedMsg(fm('f.contract', { name: user.displayName, n: CONTRACT_COST[rarity as StarRarityId] ?? 0, card: card.name, cardId: card.id, rarity: RARITY_LABEL[target], rarityId: target, mint: mintNumber })),
        createdAt: now,
      });
    }

    return { cardId: card.id, cardName: card.name, rarity: target, mintNumber, isNew, subthemeId: card.subthemeId };
  },
});
