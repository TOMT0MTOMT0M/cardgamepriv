import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { rarityValidator } from './cardsCatalog';

export const rolledCardValidator = v.object({
  cardId: v.string(),
  cardName: v.string(),
  rarity: rarityValidator,
  foilSeed: v.number(),
  mintNumber: v.number(),
  isNew: v.boolean(),
});

export default defineSchema({
  /**
   * 20-friend user accounts (authenticated via Discord OAuth2).
   */
  users: defineTable({
    discordId: v.string(),
    username: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    packBalance: v.number(),
    lastDailyClaimAt: v.number(),
    totalPacksOpened: v.number(),
    lastSeenAt: v.number(),
    statusText: v.optional(v.string()),
  })
    .index('by_discordId', ['discordId'])
    .index('by_lastSeenAt', ['lastSeenAt']),

  /**
   * Lightweight session tokens issued by Convex Discord OAuth callback.
   */
  sessions: defineTable({
    token: v.string(),
    userId: v.id('users'),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_token', ['token'])
    .index('by_userId', ['userId']),

  /**
   * Pre-rolled ("sealed") and opened ("revealed") boosters.
   * Rolling happens as soon as the booster is placed on the 3D stage so
   * tearing (002), light leak (003), and fan flip (013) run at 0ms GPU latency,
   * while friends only see the pull once status flips to "revealed".
   */
  packOpens: defineTable({
    userId: v.id('users'),
    status: v.union(v.literal('sealed'), v.literal('revealed')),
    maxRarity: rarityValidator,
    cards: v.array(rolledCardValidator),
    createdAt: v.number(),
    revealedAt: v.optional(v.number()),
  })
    .index('by_user_status', ['userId', 'status'])
    .index('by_userId', ['userId']),

  /**
   * Player card collection (powers the 019-binder BatchedMesh & trading).
   */
  inventory: defineTable({
    userId: v.id('users'),
    cardId: v.string(),
    rarity: rarityValidator,
    count: v.number(),
    bestMintNumber: v.number(),
    foilSeed: v.number(),
    firstPulledAt: v.number(),
    lastPulledAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_card_rarity', ['userId', 'cardId', 'rarity'])
    .index('by_card_rarity', ['cardId', 'rarity']),

  /**
   * Global sequential serial counter (#1, #2, #3...) per (cardId, rarity).
   */
  cardMints: defineTable({
    cardId: v.string(),
    rarity: rarityValidator,
    lastMintNumber: v.number(),
  }).index('by_card_rarity', ['cardId', 'rarity']),

  /**
   * Peer-to-peer card trades between friends.
   */
  trades: defineTable({
    fromUserId: v.id('users'),
    toUserId: v.id('users'),
    offered: v.array(
      v.object({
        cardId: v.string(),
        rarity: rarityValidator,
        count: v.number(),
      }),
    ),
    requested: v.array(
      v.object({
        cardId: v.string(),
        rarity: rarityValidator,
        count: v.number(),
      }),
    ),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('declined'),
      v.literal('cancelled'),
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_toUser_status', ['toUserId', 'status'])
    .index('by_fromUser_status', ['fromUserId', 'status']),

  /**
   * Real-time global activity feed (Rare+ pulls, Mythics, trades, new friends).
   */
  activityFeed: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    kind: v.union(
      v.literal('pull'),
      v.literal('mythic_pull'),
      v.literal('trade'),
      v.literal('joined'),
    ),
    cardId: v.optional(v.string()),
    cardName: v.optional(v.string()),
    rarity: v.optional(rarityValidator),
    mintNumber: v.optional(v.number()),
    message: v.string(),
    createdAt: v.number(),
  }).index('by_createdAt', ['createdAt']),
});
