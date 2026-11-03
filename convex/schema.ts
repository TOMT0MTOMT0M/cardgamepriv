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

/** Cartes misées (side pot, roulette) : (carte, rareté) × exemplaires, avec le meilleur n° d'impression du joueur. */
export const stakeCardValidator = v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() });
export const stakeValidator = v.object({ coins: v.number(), cards: v.array(stakeCardValidator) });
export const packChoiceValidator = v.object({ kind: v.union(v.literal('theme'), v.literal('bebou')), themeId: v.optional(v.string()) });
/** Carte tirée dans un jeu (Pack Battle, Battle Royale) ou offerte par le site (roulette). */
export const gameCardValidator = v.object({ cardId: v.string(), cardName: v.string(), rarity: rarityValidator, mintNumber: v.number(), foilSeed: v.number() });

export const econValidator = v.object({
  earned: v.number(),
  burned: v.number(),
  gamesPlayed: v.number(),
  gamesWon: v.number(),
  rouletteWins: v.number(),
  calendarDay: v.optional(v.string()),
  completions: v.array(v.string()),
  achievements: v.array(v.string()),
});

export const weeklyValidator = v.object({
  week: v.string(),
  list: v.array(v.object({ id: v.string(), kind: v.string(), target: v.number(), progress: v.number(), reward: v.number(), claimed: v.boolean() })),
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
    /** pochettes de sous-thème choisies à la main (vue Albums) : sous-thème → carte épinglée */
    covers: v.optional(v.record(v.string(), v.string())),
    /** cosmétiques du profil (src/core/cosmetics.ts) : bannière, cadre d'avatar, titre, badges — tout se débloque en jouant */
    cosmetics: v.optional(v.object({ banner: v.optional(v.string()), frame: v.optional(v.string()), title: v.optional(v.string()), badges: v.optional(v.array(v.string())) })),
    /** compteurs (classement, déblocages) */
    totalTrades: v.optional(v.number()),
    totalContracts: v.optional(v.number()),
    /** ÉCONOMIE (src/core/economy.ts) : pièces — 100 % virtuelles, jamais échangeables contre des cartes */
    coins: v.optional(v.number()),
    /** compteurs de l'économie : gains, brûlages, parties, primes de complétion et succès déjà payés, calendrier */
    econ: v.optional(econValidator),
    /** missions de la semaine (src/core/weekly.ts) */
    weekly: v.optional(weeklyValidator),
    /** panneau admin (alertes anti-abus) : `npx convex run admin:setAdmin '{"name":"tom"}'` */
    isAdmin: v.optional(v.boolean()),
    /** appareils vus (id tiré au hasard et gardé dans le navigateur) : signal « deux comptes sur le même appareil » */
    devices: v.optional(v.array(v.string())),
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
    /** pièces gagnées à l'ouverture (tirées avec le booster, créditées au dévoilement) */
    coins: v.optional(v.number()),
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
   * Classeurs perso : nommés librement, une carte peut être dans plusieurs, ordre manuel, couverture choisie,
   * un seul épinglé (affiché sur le profil, visible des potes).
   */
  binders: defineTable({
    userId: v.id('users'),
    name: v.string(),
    cards: v.array(v.object({ cardId: v.string(), rarity: rarityValidator })),
    coverCardId: v.optional(v.string()),
    pinned: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

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
      /** contre-proposé : remplacé par un nouvel échange (`counteredBy`) envoyé par le destinataire */
      v.literal('countered'),
    ),
    /** petit mot joint à la proposition */
    note: v.optional(v.string()),
    /** contre-proposition : l'échange qu'elle remplace */
    counterOf: v.optional(v.id('trades')),
    counteredBy: v.optional(v.id('trades')),
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
      /** résultat d'un jeu (Pack Battle, Battle Royale, roulette) */
      v.literal('game'),
    ),
    cardId: v.optional(v.string()),
    cardName: v.optional(v.string()),
    rarity: v.optional(rarityValidator),
    mintNumber: v.optional(v.number()),
    message: v.string(),
    createdAt: v.number(),
  })
    .index('by_createdAt', ['createdAt'])
    .index('by_userId', ['userId', 'createdAt']),

  /** Journal des pièces (historique du portefeuille, contrôles admin). Montant positif = gain, négatif = dépense / mise. */
  coinTx: defineTable({
    userId: v.id('users'),
    amount: v.number(),
    /** calendar · mission · weekly · pack · burn · completion · achievement · duel · royale · roulette · admin */
    reason: v.string(),
    label: v.string(),
    createdAt: v.number(),
  }).index('by_user', ['userId', 'createdAt']),

  /**
   * 1v1 PACK BATTLE (src/core/games.ts). sides[0] = créateur, sides[1] = adversaire (absent tant que personne n'a rejoint).
   * Les deux valident → verrouillage ferme : boosters, pièces et cartes débités, ouverture et résultat calculés d'un coup
   * côté serveur (une déconnexion n'y change rien), le client rejoue l'ouverture côte à côte.
   */
  duels: defineTable({
    creatorId: v.id('users'),
    /** invitation à un joueur précis (absent : ouvert à tous) */
    invitedId: v.optional(v.id('users')),
    status: v.union(v.literal('open'), v.literal('done'), v.literal('cancelled')),
    sides: v.array(
      v.object({
        userId: v.id('users'),
        name: v.string(),
        avatarUrl: v.optional(v.string()),
        packs: v.array(packChoiceValidator),
        stake: stakeValidator,
        ready: v.boolean(),
      }),
    ),
    result: v.optional(
      v.object({
        packs: v.array(v.array(v.array(gameCardValidator))),
        stars: v.array(v.number()),
        /** 0 / 1, absent = PUSH (égalité parfaite) */
        winner: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_status', ['status', 'createdAt'])
    .index('by_creator', ['creatorId', 'createdAt']),

  /** PACK BATTLE ROYALE : 3 à 8 joueurs, 1 booster chacun ; lancée par le créateur (ou toute seule à 8). */
  royales: defineTable({
    creatorId: v.id('users'),
    status: v.union(v.literal('open'), v.literal('done'), v.literal('cancelled')),
    players: v.array(v.object({ userId: v.id('users'), name: v.string(), avatarUrl: v.optional(v.string()), pack: packChoiceValidator })),
    result: v.optional(
      v.object({
        packs: v.array(v.array(gameCardValidator)),
        stars: v.array(v.number()),
        winners: v.array(v.number()),
        /** cartes reçues par chaque joueur (tout pour le gagnant ; partage au hasard entre ex æquo) */
        awarded: v.array(v.array(gameCardValidator)),
      }),
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index('by_status', ['status', 'createdAt']),

  /**
   * ROULETTE À CARTES : un tirage par jour (21 h, heure de Paris). `day` = jour du tirage. Le pot (pièces + cartes)
   * reste gelé jusqu'à ce qu'un numéro joué sorte ; sinon il passe au tirage suivant.
   */
  rouletteRounds: defineTable({
    day: v.string(),
    status: v.union(v.literal('open'), v.literal('drawn')),
    /** report des tirages précédents sans gagnant */
    carriedCoins: v.number(),
    carriedCards: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number(), mintNumber: v.number() })),
    /** carte(s) offerte(s) par le site */
    houseCards: v.array(gameCardValidator),
    bets: v.array(
      v.object({
        userId: v.id('users'),
        name: v.string(),
        avatarUrl: v.optional(v.string()),
        numbers: v.array(v.number()),
        coins: v.number(),
        cards: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number(), mintNumber: v.number() })),
        createdAt: v.number(),
      }),
    ),
    result: v.optional(v.object({ number: v.number(), winnerId: v.optional(v.id('users')), winnerName: v.optional(v.string()), potValue: v.number() })),
    drawnAt: v.optional(v.number()),
  })
    .index('by_day', ['day'])
    .index('by_status', ['status', 'day']),

  /** Flux de valeur entre joueurs (duels, royales, roulette, échanges) : détection d'abus sur 30 jours glissants. */
  valueFlows: defineTable({
    fromUserId: v.id('users'),
    toUserId: v.id('users'),
    value: v.number(),
    source: v.string(),
    createdAt: v.number(),
  }).index('by_createdAt', ['createdAt']),

  /** Décisions des admins sur une alerte (jamais de blocage automatique : tranchage manuel). */
  abuseReviews: defineTable({
    key: v.string(),
    verdict: v.union(v.literal('ok'), v.literal('watch')),
    note: v.optional(v.string()),
    byUserId: v.id('users'),
    at: v.number(),
  }).index('by_key', ['key']),
});
