import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { packKindValidator, rarityValidator } from './cardsCatalog';

export const rolledCardValidator = v.object({
  cardId: v.string(),
  cardName: v.string(),
  rarity: rarityValidator,
  foilSeed: v.number(),
  mintNumber: v.number(),
  isNew: v.boolean(),
  /** thème de la carte (absent sur les packs ouverts avant les boosters par thème) */
  themeId: v.optional(v.string()),
  /** sous-thème de la carte (pokemon, lol, mcu…) */
  subthemeId: v.optional(v.string()),
});

export const missionsValidator = v.object({
  day: v.string(),
  rerolled: v.boolean(),
  bonusClaimed: v.boolean(),
  list: v.array(
    v.object({
      id: v.string(),
      kind: v.string(),
      param: v.optional(v.string()),
      target: v.number(),
      progress: v.number(),
      reward: v.number(),
      claimed: v.boolean(),
    }),
  ),
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
    /** départ du booster en cours de recharge (1 toutes les 5 min, 15 max — src/core/packRegen.ts). Absent = lastSeenAt. */
    packRegenAt: v.optional(v.number()),
    totalPacksOpened: v.number(),
    lastSeenAt: v.number(),
    statusText: v.optional(v.string()),
    /** missions du jour (src/core/missions.ts) — absent tant que le joueur n'a pas progressé aujourd'hui */
    missions: v.optional(missionsValidator),
    /** vitrine du profil : jusqu'à 6 cartes choisies (vide = ses meilleures cartes, automatiquement) */
    showcase: v.optional(v.array(v.object({ cardId: v.string(), rarity: rarityValidator }))),
    /** petite devise affichée sur le profil */
    bio: v.optional(v.string()),
    /** pity 6★ : boosters d'affilée sans Mythique (src/core/pity.ts) — absent = 0 */
    pityCount: v.optional(v.number()),
    /** « envies » : ids de cartes marquées (fiche booster, échanges) */
    wishlist: v.optional(v.array(v.string())),
    /** série de connexion (src/core/streak.ts) */
    streak: v.optional(v.object({ count: v.number(), day: v.string(), rewardedAt: v.number() })),
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
    /** booster d'un thème ou bébou pack (absent = ancien pack, traité comme un bébou pack) */
    packKind: v.optional(packKindValidator),
    /** thème du booster (packKind 'theme') */
    themeId: v.optional(v.string()),
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
    /** petit mot joint à la proposition */
    note: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_toUser_status', ['toUserId', 'status'])
    .index('by_fromUser_status', ['fromUserId', 'status']),

  /**
   * Retours des testeurs du labo (une ligne par navigateur, mise à jour à chaque envoi). Cf. convex/labFeedback.ts.
   */
  labFeedback: defineTable({
    clientId: v.string(),
    tester: v.string(),
    discordName: v.optional(v.string()),
    entries: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        category: v.string(),
        vote: v.number(),
        note: v.string(),
        updatedAt: v.optional(v.union(v.string(), v.null())),
      }),
    ),
    meta: v.object({
      backend: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      quality: v.optional(v.string()),
      dpr: v.optional(v.number()),
    }),
    sends: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clientId', ['clientId'])
    .index('by_updatedAt', ['updatedAt']),

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
      v.literal('secret_pull'),
      v.literal('trade'),
      v.literal('joined'),
      v.literal('contract'),
    ),
    cardId: v.optional(v.string()),
    cardName: v.optional(v.string()),
    rarity: v.optional(rarityValidator),
    mintNumber: v.optional(v.number()),
    message: v.string(),
    createdAt: v.number(),
  }).index('by_createdAt', ['createdAt']),
});
