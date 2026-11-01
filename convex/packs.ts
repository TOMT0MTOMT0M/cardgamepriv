import { v, ConvexError } from 'convex/values';
import { internalAction, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getUserByToken, requireUser } from './auth';
import {
  DROP_WEIGHTS,
  GUARANTEED_SLOT_WEIGHTS,
  RARITY_LABEL,
  RARITY_TIER,
  pickCardForRarity,
  rarityValidator,
  rollRarityFromWeights,
  type RarityId,
} from './cardsCatalog';

const CARDS_PER_BOOSTER = 5;

function secureRandomFloat(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / (0xffffffff + 1);
}

function secureRandomSeed(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 900000) + 100000;
}

/**
 * Returns the player's currently staged ("sealed") pack if one is already prepared.
 */
export const getSealedPack = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;

    return await ctx.db
      .query('packOpens')
      .withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'sealed'))
      .first();
  },
});

/**
 * Step 1 (0ms GPU Latency Pattern):
 * Called as soon as a booster enters the 3D stage (BEFORE the tear gesture).
 * - If the player already has an unrevealed "sealed" pack, returns it immediately (anti-reroll).
 * - Otherwise deducts 1 pack from packBalance, rolls 5 cards server-side with crypto RNG,
 *   assigns sequential mint numbers (#1, #2...), computes maxRarity for 003-rarity-leak,
 *   and returns the sealed pack to the client so all 3D shaders run with 0 network wait.
 */
export const preparePack = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireUser(ctx, sessionToken);

    const existingSealed = await ctx.db
      .query('packOpens')
      .withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'sealed'))
      .first();

    if (existingSealed) {
      return existingSealed;
    }

    if (user.packBalance <= 0) {
      throw new ConvexError('Plus de boosters disponibles ! Réclame ton booster quotidien.');
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      packBalance: user.packBalance - 1,
      lastSeenAt: now,
      statusText: 'Ouvre un booster…',
    });

    const rolledCards: Array<{
      cardId: string;
      cardName: string;
      rarity: RarityId;
      foilSeed: number;
      mintNumber: number;
      isNew: boolean;
    }> = [];

    let maxRarity: RarityId = 'common';
    const seenInThisPack = new Set<string>();

    for (let slot = 0; slot < CARDS_PER_BOOSTER; slot++) {
      const weights = slot === CARDS_PER_BOOSTER - 1 ? GUARANTEED_SLOT_WEIGHTS : DROP_WEIGHTS;
      const rarity = rollRarityFromWeights(weights, secureRandomFloat);
      const card = pickCardForRarity(rarity, secureRandomFloat);

      if (RARITY_TIER[rarity] > RARITY_TIER[maxRarity]) {
        maxRarity = rarity;
      }

      // Allocate global sequential serial number (#1, #2, #3...)
      const mintDoc = await ctx.db
        .query('cardMints')
        .withIndex('by_card_rarity', (q) => q.eq('cardId', card.id).eq('rarity', rarity))
        .unique();

      const mintNumber = (mintDoc?.lastMintNumber ?? 0) + 1;
      if (mintDoc) {
        await ctx.db.patch(mintDoc._id, { lastMintNumber: mintNumber });
      } else {
        await ctx.db.insert('cardMints', {
          cardId: card.id,
          rarity,
          lastMintNumber: mintNumber,
        });
      }

      // Check if player already owns this (cardId, rarity)
      const existingInv = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', user._id).eq('cardId', card.id).eq('rarity', rarity),
        )
        .unique();

      const key = `${card.id}:${rarity}`;
      const isNew = !existingInv && !seenInThisPack.has(key);
      seenInThisPack.add(key);

      rolledCards.push({
        cardId: card.id,
        cardName: card.name,
        rarity,
        foilSeed: secureRandomSeed(),
        mintNumber,
        isNew,
      });
    }

    const packId = await ctx.db.insert('packOpens', {
      userId: user._id,
      status: 'sealed',
      maxRarity,
      cards: rolledCards,
      createdAt: now,
    });

    return (await ctx.db.get(packId))!;
  },
});

/**
 * Step 2:
 * Called when the 3D reveal sequence finishes on the client.
 * - Marks the pack as "revealed"
 * - Adds all 5 cards to the player's inventory (019-binder)
 * - Broadcasts Rare/Epic/Legendary/Mythic pulls to the live activityFeed (and Discord webhook)
 */
export const revealPack = mutation({
  args: {
    sessionToken: v.string(),
    packId: v.id('packOpens'),
  },
  handler: async (ctx, { sessionToken, packId }) => {
    const user = await requireUser(ctx, sessionToken);
    const pack = await ctx.db.get(packId);

    if (!pack || pack.userId !== user._id) {
      throw new ConvexError('Booster introuvable.');
    }
    if (pack.status === 'revealed') {
      return pack;
    }

    const now = Date.now();
    await ctx.db.patch(pack._id, {
      status: 'revealed',
      revealedAt: now,
    });

    await ctx.db.patch(user._id, {
      totalPacksOpened: user.totalPacksOpened + 1,
      lastSeenAt: now,
      statusText: 'Contemple son tirage',
    });

    for (const c of pack.cards) {
      const existing = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) =>
          q.eq('userId', user._id).eq('cardId', c.cardId).eq('rarity', c.rarity),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          count: existing.count + 1,
          bestMintNumber: Math.min(existing.bestMintNumber, c.mintNumber),
          lastPulledAt: now,
        });
      } else {
        await ctx.db.insert('inventory', {
          userId: user._id,
          cardId: c.cardId,
          rarity: c.rarity,
          count: 1,
          bestMintNumber: c.mintNumber,
          foilSeed: c.foilSeed,
          firstPulledAt: now,
          lastPulledAt: now,
        });
      }

      // Broadcast Epic / Legendary / Mythic (or #1 serial) pulls to the live feed
      const tier = RARITY_TIER[c.rarity];
      if (tier >= RARITY_TIER.epic || c.mintNumber === 1) {
        const isMythic = c.rarity === 'mythic';
        const label = RARITY_LABEL[c.rarity];
        const msg = `${user.displayName} a obtenu ${c.cardName} [${label} #${c.mintNumber}] !`;

        await ctx.db.insert('activityFeed', {
          userId: user._id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          kind: isMythic ? 'mythic_pull' : 'pull',
          cardId: c.cardId,
          cardName: c.cardName,
          rarity: c.rarity,
          mintNumber: c.mintNumber,
          message: msg,
          createdAt: now,
        });

        // Optional Discord channel alert for Legendary / Mythic / #1 Mint
        if (tier >= RARITY_TIER.legendary || c.mintNumber === 1) {
          await ctx.scheduler.runAfter(0, internal.packs.notifyDiscordPull, {
            displayName: user.displayName,
            cardName: c.cardName,
            rarity: c.rarity,
            mintNumber: c.mintNumber,
          });
        }
      }
    }

    return (await ctx.db.get(pack._id))!;
  },
});

export const notifyDiscordPull = internalAction({
  args: {
    displayName: v.string(),
    cardName: v.string(),
    rarity: rarityValidator,
    mintNumber: v.number(),
  },
  handler: async (_ctx, { displayName, cardName, rarity, mintNumber }) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const label = RARITY_LABEL[rarity];
    const emoji = rarity === 'mythic' ? '✺' : rarity === 'legendary' ? '❂' : '✸';
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `${emoji} **${displayName}** vient de tirer **${cardName}** en **${label}** (Série **#${mintNumber}**) !`,
        }),
      });
    } catch (e) {
      console.warn('[discord-webhook] failed:', e);
    }
  },
});
