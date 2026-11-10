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
  shopDay: v.optional(v.string()),
  shopBought: v.optional(v.number()),
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
    cosmetics: v.optional(v.object({ banner: v.optional(v.string()), frame: v.optional(v.string()), title: v.optional(v.string()), badges: v.optional(v.array(v.string())), accent: v.optional(v.string()), vitrine: v.optional(v.string()), vitrineColor: v.optional(v.string()) })),
    /** photo de profil / bannière importées par le joueur (GIF animé ou image, ≤ 2 Mo, convex/profiles.ts) — sinon l'avatar Discord */
    avatarMedia: v.optional(v.id('_storage')),
    bannerMedia: v.optional(v.id('_storage')),
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
    /** modérateur des suggestions (retours 06/11 : Hugo et Tom) — reçoit et traite la file, sans les autres droits admin */
    isModerator: v.optional(v.boolean()),
    /** (retours live 6, C15) a déjà été n°1 du classement (complétion) : débloque le titre « Numéro un » */
    wasTop: v.optional(v.boolean()),
    /** appareils vus (id tiré au hasard et gardé dans le navigateur) : signal « deux comptes sur le même appareil » */
    devices: v.optional(v.array(v.string())),
    /** PARRAINAGE (retours live 02, §10 — convex/referrals.ts) : mon code d'invitation (lien `?ref=CODE`) */
    refCode: v.optional(v.string()),
    /** mon parrain (le joueur dont j'ai suivi le lien) */
    referredBy: v.optional(v.id('users')),
    referredAt: v.optional(v.number()),
    /** appareil depuis lequel j'ai rejoint via le lien (alerte admin si c'est celui du parrain) */
    referredDevice: v.optional(v.string()),
    /** le parrain a reçu ses 10 boosters (mes 10 premiers boosters ouverts) */
    referralPaid: v.optional(v.boolean()),
    /**
     * COMPTE SANS DISCORD (ouverture 07/11, convex/pwAuth.ts) : `discordId` vaut alors « pw:<pseudo en minuscules> » ;
     * mot de passe haché (scrypt, sel propre au compte), jamais en clair. Essais ratés : verrou de 10 min après 8.
     */
    pwHash: v.optional(v.string()),
    pwFails: v.optional(v.number()),
    pwLockUntil: v.optional(v.number()),
    /** (ouverture 07/11) recharge des boosters ×2 jusqu'à cet instant (24 h après l'arrivée — src/core/packRegen.ts) */
    regenBoostUntil: v.optional(v.number()),
    /** (ouverture 07/11) BANNI (admin:ban) : sessions fermées, reconnexion refusée, caché des listes, place libérée */
    bannedAt: v.optional(v.number()),
    banReason: v.optional(v.string()),
    /** (ouverture 07/11) visite guidée automatique déjà jouée (une seule fois par compte — views/guide.ts) */
    guideSeenAt: v.optional(v.number()),
    /** MP de bienvenue du bot Discord (lien de parrainage) déjà tenté : une seule fois, à la première connexion */
    welcomeDmAt: v.optional(v.number()),
  })
    .index('by_discordId', ['discordId'])
    .index('by_lastSeenAt', ['lastSeenAt'])
    .index('by_refCode', ['refCode'])
    .index('by_referredBy', ['referredBy']),

  /**
   * Réglages du site (ouverture 07/11, convex/launch.ts) — une ligne par clé : `launch` = heure d'ouverture (compte à
   * rebours), dernière remise à zéro (le site nettoie alors son stockage local) et bilan de la remise à zéro.
   */
  appConfig: defineTable({
    key: v.string(),
    launchAt: v.optional(v.number()),
    resetAt: v.optional(v.number()),
    lastReset: v.optional(v.any()),
  }).index('by_key', ['key']),

  /** Clics sur les liens d'invitation : un par appareil et par code (le compteur « X personnes ont cliqué »). */
  referralClicks: defineTable({
    code: v.string(),
    referrerId: v.id('users'),
    device: v.string(),
    at: v.number(),
  })
    .index('by_code_device', ['code', 'device'])
    .index('by_referrer', ['referrerId']),

  /**
   * Fichiers importés pour le profil (photo / bannière, convex/profiles.ts) : à qui appartient chaque fichier stocké —
   * un joueur ne peut ni afficher ni faire supprimer le fichier d'un autre en recopiant son identifiant.
   */
  profileMedia: defineTable({
    storageId: v.id('_storage'),
    userId: v.id('users'),
    kind: v.union(v.literal('avatar'), v.literal('banner')),
    createdAt: v.number(),
  }).index('by_storage', ['storageId']),

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
    /** (08/11) god pack (1 sur 1 000) : toutes les cartes 4★+, au moins une 5★ et une 6★ — animation dédiée */
    god: v.optional(v.boolean()),
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
    /** conclu depuis le TABLEAU D'OFFRES (retours live 02, lot T — convex/listings.ts) : l'annonce d'origine */
    listingId: v.optional(v.id('listings')),
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
    /** (08/11) boosters par joueur, identique pour tous (absent = 1 : parties d'avant) */
    packCount: v.optional(v.number()),
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
   * ROULETTE À CARTES : deux tirages par jour (10 h et 20 h, heure de Paris ; avant : un à 21 h). Le pot (pièces + cartes)
   * reste gelé jusqu'à ce qu'un numéro joué sorte ; sinon il passe au tirage suivant.
   */
  rouletteRounds: defineTable({
    /** étiquette du tirage (« 2026-11-04 · 10 h » ; ancien format : « 2026-11-04 », tirage unique de 21 h) */
    day: v.string(),
    /** instant du tirage (retours live 02 : 10 h et 20 h) — absent sur les anciens tirages de 21 h (100 numéros) */
    drawAt: v.optional(v.number()),
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

  /** AMIS (retours live 02, lot A2 — convex/friends.ts) : demande `pending` → `accepted` ; `declined` = anti-relance 24 h. */
  friendships: defineTable({
    requesterId: v.id('users'),
    addresseeId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('declined')),
    createdAt: v.number(),
    /** acceptée / refusée le… */
    respondedAt: v.optional(v.number()),
  })
    .index('by_requester', ['requesterId', 'status'])
    .index('by_addressee', ['addresseeId', 'status'])
    .index('by_pair', ['requesterId', 'addresseeId']),

  /**
   * TABLEAU D'OFFRES (retours live 02, lot T — convex/listings.ts) : une ANNONCE = des cartes proposées (verrouillées
   * tant qu'elle est ouverte) + des cartes recherchées (indicatives) ; ouverte à TOUS les joueurs ; expire après 24/48 h.
   */
  listings: defineTable({
    userId: v.id('users'),
    items: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() })),
    wanted: v.optional(v.array(v.object({ cardId: v.string(), rarity: rarityValidator }))),
    note: v.optional(v.string()),
    /** `open` (tant que expiresAt n'est pas passé) · `closed` (offre acceptée) · `cancelled` · `expired` */
    status: v.union(v.literal('open'), v.literal('closed'), v.literal('cancelled'), v.literal('expired')),
    createdAt: v.number(),
    expiresAt: v.number(),
    resolvedAt: v.optional(v.number()),
    acceptedOfferId: v.optional(v.id('listingOffers')),
  })
    .index('by_status_expires', ['status', 'expiresAt'])
    .index('by_user_status', ['userId', 'status']),

  /**
   * Offre d'un joueur sur une annonce : les cartes qu'il donne (verrouillées tant que l'offre est en cours) contre les
   * cartes de l'annonce. `countered` : l'auteur a répondu par une contre-offre (`counter`), à l'offrant de trancher.
   */
  listingOffers: defineTable({
    listingId: v.id('listings'),
    /** auteur de l'annonce (pastille « nouvelle offre ») */
    listingUserId: v.id('users'),
    fromUserId: v.id('users'),
    offered: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() })),
    note: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('countered'), v.literal('accepted'), v.literal('declined'), v.literal('withdrawn'), v.literal('closed')),
    counter: v.optional(
      v.object({
        /** ce que l'auteur donne (une partie des cartes de l'annonce) */
        give: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() })),
        /** ce que l'auteur demande à l'offrant */
        want: v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() })),
        note: v.optional(v.string()),
        at: v.number(),
      }),
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_listing', ['listingId', 'status'])
    .index('by_from_status', ['fromUserId', 'status'])
    .index('by_listingUser_status', ['listingUserId', 'status']),

  /**
   * SUGGESTIONS des joueurs (onglet Suggestions, 04/11) : bug (+ capture), design d'une carte (+ lien d'image proposé),
   * ajout de carte / série, autre. File admin : nouvelle → vue → acceptée / refusée → traitée (convex/suggestions.ts).
   */
  suggestions: defineTable({
    userId: v.id('users'),
    kind: v.union(v.literal('bug'), v.literal('design'), v.literal('ajout'), v.literal('autre')),
    text: v.string(),
    /** design : la carte concernée */
    cardId: v.optional(v.string()),
    /** design : lien vers l'image proposée à la place */
    imageUrl: v.optional(v.string()),
    /** bug / design : capture ou image envoyée */
    screenshot: v.optional(v.id('_storage')),
    /** ajout : catégorie (anime, joueur, jeu…) */
    category: v.optional(v.string()),
    status: v.union(v.literal('nouvelle'), v.literal('vue'), v.literal('acceptee'), v.literal('refusee'), v.literal('traitee')),
    adminNote: v.optional(v.string()),
    /** page, appareil (aide au diagnostic des bugs) */
    meta: v.optional(v.object({ page: v.optional(v.string()), ua: v.optional(v.string()) })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status', ['status', 'createdAt'])
    .index('by_user', ['userId', 'createdAt']),

  /**
   * SONDAGE « prochaines mises à jour » (v1.0.10, 10/11) : une réponse par joueur et par sondage (convex/survey.ts,
   * définition dans src/core/survey.ts). Table nouvelle : rien ne change pour le code d'avant le patch.
   */
  surveyAnswers: defineTable({
    userId: v.id('users'),
    surveyId: v.string(),
    universes: v.array(v.string()),
    features: v.array(v.string()),
    names: v.optional(v.string()),
    rating: v.optional(v.number()),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_user', ['userId', 'surveyId'])
    .index('by_survey', ['surveyId', 'createdAt']),

  /**
   * DROPS DISCORD (V2, 08/11) : un 6★ ou une secrète en attente de publication sur Discord (convex/dropShots.ts).
   * `storageId` = la carte peinte de face par le jeu du joueur ; `postedAt` = déjà publié (une seule fois).
   */
  dropShots: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    cardId: v.string(),
    cardName: v.string(),
    rarity: rarityValidator,
    mintNumber: v.number(),
    isNew: v.optional(v.boolean()),
    createdAt: v.number(),
    storageId: v.optional(v.id('_storage')),
    postedAt: v.optional(v.number()),
  }).index('by_user_card', ['userId', 'cardId', 'mintNumber']),
});
