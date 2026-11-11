import type { RarityId } from '../core/rarity';
import type { PackRequest } from '../core/packRoll';
import { applyRegen, type RegenState } from '../core/packRegen';
import type { MissionsState } from '../core/missions';
import type { StreakState } from '../core/streak';
import type { CosmeticChoice, PlayerStats } from '../core/cosmetics';
import type { EcoBackend } from './eco';
import type { ChatApi } from '../core/chat';
import type { PackEvent } from '../core/events';

/** Une ligne de collection : (carte, rareté) → nombre d'exemplaires. */
export interface PlayerCard {
  cardId: string;
  rarity: RarityId;
  count: number;
  bestMintNumber: number;
  /** date d'obtention du premier exemplaire (absent : ancienne sauvegarde) */
  firstPulledAt?: number;
}

/** Classeur perso : cartes dans l'ordre choisi, couverture, épinglé sur le profil. */
export interface Binder {
  id: string;
  name: string;
  cards: Array<{ cardId: string; rarity: RarityId }>;
  coverCardId?: string;
  pinned: boolean;
  createdAt: number;
}

export interface PackCard {
  cardId: string;
  cardName: string;
  rarity: RarityId;
  mintNumber: number;
  isNew: boolean;
  themeId?: string;
}

export interface SealedPack {
  id: string;
  packKind: 'theme' | 'bebou';
  themeId?: string;
  maxRarity: RarityId;
  cards: PackCard[];
  /** (08/11) god pack : 1 sur 1 000, que des 4★+ dont une 5★ et une 6★ — l'ouverture a son animation */
  god?: boolean;
  /** (11/11) booster du moment (src/core/events.ts) : l'événement et son nom au tirage */
  eventId?: string;
  eventName?: string;
}

export interface Friend {
  id: string;
  name: string;
  avatarUrl?: string;
  online: boolean;
  status?: string;
  packsOpened: number;
  /** ami robot du mode démo */
  bot?: boolean;
}

/**
 * AMIS (retours live 02, lot A2) : vrai lien d'amitié, à part de `friends` (= TOUS les joueurs, pour les échanges).
 * `id` = id de la demande / du lien (accepter, refuser, annuler, retirer) ; `userId` = le joueur.
 */
export interface FriendRequest {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  createdAt: number;
}
export interface FriendLink {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  /** amis depuis le… */
  since: number;
  /** dernier battement de cœur : « en ligne » si < ONLINE_MS (voir `isOnline`) */
  lastSeenAt: number;
  status?: string;
  packsOpened: number;
  lastActivity?: { kind: string; message: string; createdAt: number } | null;
  bot?: boolean;
}
export interface Social {
  /** premières données reçues (en ligne : abonnement Convex) */
  ready: boolean;
  friends: FriendLink[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}
/** même fenêtre que le serveur (convex/users.ts) */
// (perf 07/11) le serveur n'écrit « vu à » qu'au plus toutes les 4 min (convex/users.ts, SEEN_EVERY_MS)
export const ONLINE_MS = 6 * 60 * 1000;
export const isOnline = (f: { lastSeenAt: number }, now = Date.now()) => now - f.lastSeenAt < ONLINE_MS;
/** Où j'en suis avec ce joueur : ami, demande envoyée / reçue, rien. */
export function friendState(s: Social, userId: string): { kind: 'friend'; link: FriendLink } | { kind: 'out' | 'in'; req: FriendRequest } | { kind: 'none' } {
  const link = s.friends.find((f) => f.userId === userId);
  if (link) return { kind: 'friend', link };
  const o = s.outgoing.find((r) => r.userId === userId);
  if (o) return { kind: 'out', req: o };
  const i = s.incoming.find((r) => r.userId === userId);
  if (i) return { kind: 'in', req: i };
  return { kind: 'none' };
}

export interface FeedItem {
  id: string;
  kind: string;
  message: string;
  rarity?: RarityId;
  createdAt: number;
}

/** Un « gros tirage » (Légendaire, Mythique, Secrète) affiché en direct sur la page d'accueil. */
export interface BigPull {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  cardId: string;
  cardName: string;
  rarity: RarityId;
  mintNumber?: number;
  createdAt: number;
  /** tiré par moi */
  mine?: boolean;
}

/** Raretés qui comptent comme « gros tirage » (5★ et plus). */
export const BIG_PULL_RARITIES: RarityId[] = ['legendary', 'mythic', 'secret'];

export interface TradeItem {
  cardId: string;
  rarity: RarityId;
  count: number;
}

/** (v1.0.9) « Chercher un propriétaire » : un joueur qui possède la carte */
export interface CardOwner {
  id: string;
  name: string;
  avatarUrl?: string;
  online: boolean;
  rarity: RarityId;
  count: number;
  /** exemplaires pas engagés dans un échange en attente ou une annonce */
  free: number;
}

export interface TradeView {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  offered: TradeItem[];
  requested: TradeItem[];
  note?: string;
  createdAt: number;
  /** contre-proposition d'un échange précédent */
  counterOf?: string;
}

/** Échange terminé (historique). */
export interface TradeHistoryItem extends TradeView {
  status: 'accepted' | 'declined' | 'cancelled' | 'countered';
  resolvedAt: number;
}

/**
 * Cartes engagées dans mes propositions en attente (cardId:rarity → exemplaires) : ni brûlables en contrat, ni
 * reproposables ailleurs tant que l'autre n'a pas répondu.
 */
export function lockedCards(s: GameState): Map<string, number> {
  const out = new Map<string, number>();
  const lock = (it: TradeItem) => out.set(cardKey(it), (out.get(cardKey(it)) ?? 0) + it.count);
  for (const t of s.trades.outgoing) t.offered.forEach(lock);
  // TABLEAU D'OFFRES (retours live 02, lot T) : cartes de mes annonces ouvertes et de mes offres en cours
  const now = Date.now();
  for (const l of s.board.mine) if (listingLive(l, now)) l.items.forEach(lock);
  for (const o of s.board.offers) if ((o.status === 'pending' || o.status === 'countered') && o.listing && listingLive(o.listing, now)) o.offered.forEach(lock);
  return out;
}

// ─────────────────────────────── MARCHÉ (retours Hugo 10/11 — convex/market.ts, src/core/market.ts)
export interface MarketItem {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  cardId: string;
  rarity: RarityId;
  mintNumber: number;
  price: number;
  status: 'open' | 'sold' | 'cancelled';
  createdAt: number;
  resolvedAt?: number;
  buyerId?: string;
}
export interface MarketBoard {
  open: MarketItem[];
  /** mes ventes / achats des 7 derniers jours */
  sold: MarketItem[];
  bought: MarketItem[];
}
export const EMPTY_MARKET: MarketBoard = { open: [], sold: [], bought: [] };

// ─────────────────────────────── TABLEAU D'OFFRES (retours live 02, lot T — convex/listings.ts)

/** Offre faite sur une annonce : les cartes de l'offrant contre celles de l'annonce (ou une contre-offre de l'auteur). */
export interface ListingOfferView {
  id: string;
  listingId: string;
  fromId: string;
  fromName: string;
  offered: TradeItem[];
  note?: string;
  status: 'pending' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'closed';
  /** contre-offre de l'auteur : `give` = ce qu'il donne (de l'annonce), `want` = ce qu'il demande à l'offrant */
  counter?: { give: TradeItem[]; want: TradeItem[]; note?: string; at: number };
  createdAt: number;
  resolvedAt?: number;
}
/** Annonce : cartes proposées (verrouillées tant qu'elle est ouverte), cartes recherchées (indicatives), petit mot. */
export interface ListingView {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  items: TradeItem[];
  wanted: Array<{ cardId: string; rarity: RarityId }>;
  note?: string;
  status: 'open' | 'closed' | 'cancelled' | 'expired';
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  /** offres en cours (tableau) */
  offerCount: number;
  /** mes annonces : les offres reçues (en cours ; l'offre acceptée si close) */
  offers?: ListingOfferView[];
  /** tableau : mon offre en cours sur cette annonce */
  myOffer?: ListingOfferView | null;
}
/** Mes annonces (ouvertes + terminées depuis < 48 h) et mes offres (en cours + terminées depuis < 48 h). */
export interface BoardState {
  mine: ListingView[];
  offers: Array<ListingOfferView & { listing: ListingView | null }>;
}
export const BOARD_HOURS = [24, 48] as const;
/** mêmes plafonds que le serveur (convex/listings.ts) */
export const BOARD_MAX_OPEN = 5;
export const BOARD_MAX_ITEMS = 12;
export const listingLive = (l: Pick<ListingView, 'status' | 'expiresAt'>, now = Date.now()) => l.status === 'open' && l.expiresAt > now;
/** À traiter sur le tableau (pastille) : offres reçues sur mes annonces ouvertes + contre-offres reçues sur mes offres. */
export function boardAttention(s: GameState): number {
  const now = Date.now();
  let n = 0;
  for (const l of s.board.mine) if (listingLive(l, now)) n += (l.offers ?? []).filter((o) => o.status === 'pending').length;
  for (const o of s.board.offers) if (o.status === 'countered' && o.listing && listingLive(o.listing, now)) n++;
  return n;
}

export interface Me {
  id: string;
  name: string;
  avatarUrl?: string;
  /** boosters disponibles (au moment de la dernière mise à jour ; `liveRegen()` pour l'instant présent) */
  packBalance: number;
  /** réserve stockée et départ du minuteur de recharge (1 booster / 5 min, 15 max) */
  packStored: number;
  packRegenAt: number;
  /** (ouverture 07/11) recharge ×2 jusqu'à cet instant */
  boostUntil?: number;
  totalPacksOpened: number;
  /** pity 6★ : boosters d'affilée sans Mythique (src/core/pity.ts) */
  pityCount: number;
  /** série de connexion (src/core/streak.ts) — telle qu'enregistrée côté serveur */
  streak?: StreakState;
  /** (ouverture 07/11) équipe (admin / modérateur) : passe le compte à rebours */
  staff?: boolean;
  /** (ouverture 07/11) visite guidée automatique déjà jouée (une fois par compte) */
  guideSeen?: boolean;
  /** (V2, bulles) dernier événement Jeux (défi reçu, partie jouée, tirage où j'avais misé) — game/navDots.ts */
  gamesNoticeAt?: number;
  /** (V2, bulles) dernier événement de parrainage (filleul inscrit, parrainage payé) */
  referralNoticeAt?: number;
}

/** Réserve de boosters à l'instant présent (le compte à rebours de l'en-tête l'appelle chaque seconde). */
export const liveRegen = (u: Me, now = Date.now()): RegenState => applyRegen(u.packStored, u.packRegenAt, now, u.boostUntil);

export interface GameState {
  /** `online` : serveur Convex + Discord · `demo` : tout dans ce navigateur, amis robots */
  mode: 'online' | 'demo';
  /** premières données reçues */
  ready: boolean;
  user: Me | null;
  /** (ouverture 07/11, convex/launch.ts) heure d'ouverture (compte à rebours) — absent en démo */
  launch?: { launchAt: number | null; resetAt: number | null; clubCode: boolean } | null;
  authError: string | null;
  collection: PlayerCard[];
  friends: Friend[];
  feed: FeedItem[];
  /** gros tirages de tout le monde, du plus récent au plus ancien */
  bigPulls: BigPull[];
  sealed: SealedPack | null;
  trades: { incoming: TradeView[]; outgoing: TradeView[] };
  /** missions du jour (null : pas connecté) ; `resetAt` = prochain tirage */
  missions: (MissionsState & { resetAt: number }) | null;
  /** « envies » : ids de cartes marquées (ordre d'ajout) */
  wishlist: string[];
  /** classeurs perso (épinglé en premier) */
  binders: Binder[];
  /** pochettes de sous-thème épinglées (vue Albums) : sous-thème → carte */
  covers: Record<string, string>;
  /** AMIS (lot A2) : amis acceptés, demandes reçues / envoyées */
  social: Social;
  /** TABLEAU D'OFFRES (lot T) : mes annonces et mes offres */
  board: BoardState;
}

/** Profil public (vitrine, devise, cosmétiques, statistiques enrichies). */
export interface Profile {
  id: string;
  name: string;
  avatarUrl?: string;
  /** photo / bannière importées par le joueur (GIF animé ou image ; URL ou data URL en démo) — prioritaires sur l'avatar Discord et la bannière cosmétique */
  avatarMedia?: string;
  bannerMedia?: string;
  bio?: string;
  /** cartes choisies pour la vitrine (vide = les meilleures, automatiquement) */
  showcase: Array<{ cardId: string; rarity: RarityId }>;
  packsOpened: number;
  joinedAt?: number;
  /** classeur épinglé (visible des potes) — le premier de `pinnedBinders`, gardé pour un serveur pas encore à jour */
  pinnedBinder?: { id: string; name: string; cards: Array<{ cardId: string; rarity: RarityId }>; coverCardId?: string } | null;
  /** classeurs épinglés, 3 au plus (sondage 11/11) */
  pinnedBinders?: Array<{ id: string; name: string; cards: Array<{ cardId: string; rarity: RarityId }>; coverCardId?: string }>;
  /** bannière, cadre, titre, badges (déjà filtrés : seulement du débloqué) */
  cosmetics?: CosmeticChoice;
  stats?: PlayerStats;
  /** jour de la série dans le cycle (1..7) */
  streakDay?: number;
  bestDrop?: { cardId: string; rarity: RarityId; mintNumber: number } | null;
  themes?: Array<{ id: string; have: number; total: number }>;
  /** succès atteints / total */
  achievements?: { done: number; total: number };
}

/** Ligne du classement entre nous. */
export interface LeaderRow {
  id: string;
  name: string;
  avatarUrl?: string;
  cosmetics: CosmeticChoice;
  uniques: number;
  total: number;
  pct: number;
  mythics: number;
  secrets: number;
  packsOpened: number;
  tradesDone: number;
  streak: number;
  /** succès atteints */
  achievements?: number;
}

/** Entrée du fil d'activité d'un joueur. */
export interface ActivityItem {
  id: string;
  kind: string;
  message: string;
  cardId?: string;
  cardName?: string;
  rarity?: RarityId;
  mintNumber?: number;
  createdAt: number;
}

/** Parrainage : mon code, les clics sur mon lien, mes filleuls (boosters ouverts sur 10, parrain payé ?). */
export interface ReferralInfo {
  code: string;
  clicks: number;
  referrals: Array<{ userId: string; name: string; avatarUrl?: string; packsOpened: number; paid: boolean; at: number }>;
  /** mon parrain (nom affiché), si j'en ai un */
  myReferrer?: string;
  /** compte encore assez neuf pour déclarer un parrain (lien ou pseudo collé dans l'onglet Amis) */
  canClaim?: boolean;
}

export interface PushStatus {
  configured: boolean;
  devices: number;
  thisDevice: boolean;
  prefs: string[];
}
export interface PushApi {
  status(endpoint?: string): Promise<PushStatus>;
  publicKey(): Promise<string | null>;
  subscribe(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
  setPrefs(prefs: string[]): Promise<void>;
  test(): Promise<{ devices: number }>;
}

export interface GameBackend {
  readonly state: GameState;
  /** pièces, sources de pièces et espace Jeux (eco.ts) */
  readonly eco: EcoBackend;
  onChange(fn: (s: GameState) => void): () => void;
  login(): void;
  /** (ouverture 07/11) la visite guidée a démarré : ne plus la proposer (absent en démo) */
  markGuideSeen?(): Promise<void>;
  logout(): Promise<void>;
  /** Tire (ou rend, s'il y en a un non ouvert) un booster scellé. */
  preparePack(req: PackRequest): Promise<SealedPack>;
  /**
   * (11/11) BOOSTER DU MOMENT : l'événement en cours (0 ou 1 en pratique ; vide quand il n'y en a pas). En ligne :
   * abonnement léger à `events:current` ; démo : un événement d'exemple (src/core/events.ts, demoEvent).
   */
  watchEvents?(cb: (events: PackEvent[]) => void): () => void;
  /** ouverture en série : `count` boosters scellés d'un coup (les déjà scellés d'abord ; moins si la réserve manque) */
  preparePacks(req: PackRequest, count: number): Promise<SealedPack[]>;
  /** « Tout passer » : crédite plusieurs boosters montrés en un seul appel ; renvoie les ids crédités */
  revealPacks(ids: string[]): Promise<string[]>;
  /** Fin de l'ouverture : crédite la collection, annonce les belles cartes. */
  revealPack(id: string): Promise<void>;
  friendCollection(friendId: string): Promise<PlayerCard[]>;
  /** (v1.0.9) qui possède cette carte (hors moi) — doublons et exemplaires libres d'abord */
  cardOwners(cardId: string): Promise<CardOwner[]>;
  proposeTrade(toId: string, offered: TradeItem[], requested: TradeItem[], note?: string): Promise<void>;
  respondTrade(id: string, accept: boolean): Promise<void>;
  cancelTrade(id: string): Promise<void>;
  /** Contre-proposition : modifie un échange reçu (ce que je donne / ce que je demande) et le renvoie. */
  counterTrade(id: string, offered: TradeItem[], requested: TradeItem[], note?: string): Promise<void>;
  /** Échanges terminés, les plus récents d'abord. */
  tradeHistory(): Promise<TradeHistoryItem[]>;
  /** Envies d'un ami (ids de cartes). */
  friendWishlist(friendId: string): Promise<string[]>;
  claimMission(id: string): Promise<number>;
  claimMissionBonus(): Promise<number>;
  rerollMission(id: string): Promise<void>;
  /** profil d'un joueur (moi : state.user.id) */
  profile(userId: string): Promise<Profile | null>;
  setShowcase(cards: Array<{ cardId: string; rarity: RarityId }>): Promise<void>;
  setBio(bio: string): Promise<void>;
  /** Cosmétiques du profil (seulement du débloqué : le serveur filtre) ; renvoie le choix retenu. */
  setCosmetics(choice: CosmeticChoice): Promise<CosmeticChoice>;
  /** Photo de profil / bannière importées (GIF ≤ 2 Mo ; démo ≤ 700 Ko) ; `null` = retirer. Renvoie l'adresse à afficher. Refus : Error au message clair. */
  setProfileMedia(kind: 'avatar' | 'banner', file: Blob | null): Promise<string | undefined>;
  /** Suggestions (onglet) : envoyer (capture / image facultative), les miennes, la file admin, changer un statut. */
  submitSuggestion(o: SuggestionInput, file: Blob | null): Promise<void>;
  /** notifications push (V2, en ligne seulement) : absent en démo */
  push?: PushApi;
  /** chat (V2, 10/11) : le Club et les privés (src/game/chat.ts) */
  chat?: ChatApi;
  mySuggestions(): Promise<SuggestionView[]>;
  adminSuggestions(status?: SuggestionStatus): Promise<{ items: SuggestionView[]; counts: Record<SuggestionStatus, number> }>;
  setSuggestionStatus(id: string, status: SuggestionStatus, adminNote?: string): Promise<void>;
  /** Sondage « prochaines mises à jour » (v1.0.10) : déjà répondu ?, répondre, résultats (modérateurs). */
  surveyAnswered(surveyId: string): Promise<boolean>;
  submitSurvey(surveyId: string, answer: SurveyAnswer): Promise<void>;
  surveyResults(surveyId: string): Promise<SurveyResults>;
  /** Classement entre nous. */
  leaderboard(): Promise<LeaderRow[]>;
  /** Fil d'activité d'un joueur. */
  activity(userId: string): Promise<ActivityItem[]>;
  /** Contrat : brûle des doublons d'une étoile contre une carte de l'étoile au-dessus. */
  signContract(rarity: RarityId, items: Array<{ cardId: string; count: number }>): Promise<ContractResult>;
  /** Envies : marque / retire une carte (state.wishlist suit). */
  toggleWish(cardId: string): Promise<void>;
  /** Récompense de la série de connexion (jour 7) : boosters gagnés. */
  claimStreak(): Promise<number>;
  /** Pochette d'un sous-thème (vue Albums) : une carte possédée, ou rien = automatique. */
  setSubthemeCover(subthemeId: string, cardId?: string): Promise<void>;
  // classeurs perso
  createBinder(name: string, cards?: Array<{ cardId: string; rarity: RarityId }>): Promise<string>;
  renameBinder(id: string, name: string): Promise<void>;
  deleteBinder(id: string): Promise<void>;
  setBinderCards(id: string, cards: Array<{ cardId: string; rarity: RarityId }>): Promise<void>;
  /** ajoute, ou retire si déjà dedans ; renvoie vrai si ajoutée */
  toggleBinderCard(id: string, card: { cardId: string; rarity: RarityId }): Promise<boolean>;
  setBinderCover(id: string, cardId?: string): Promise<void>;
  pinBinder(id: string, on: boolean): Promise<void>;
  // amis (lot A2) — les échanges restent ouverts à tous
  /** Demande en ami (par id, ou par pseudo exact) ; `accepted` s'il m'avait déjà demandé. */
  requestFriend(to: { userId?: string; name?: string }): Promise<{ status: 'pending' | 'accepted'; name: string }>;
  acceptFriend(id: string): Promise<void>;
  declineFriend(id: string): Promise<void>;
  cancelFriend(id: string): Promise<void>;
  removeFriend(id: string): Promise<void>;
  // parrainage (retours live 02, §10)
  /** mon lien d'invitation (créé à la première demande), clics, filleuls */
  referral(): Promise<ReferralInfo>;
  /** un lien `?ref=` a été ouvert sur cet appareil (compté une fois par appareil) */
  referralClick(code: string): Promise<void>;
  /** je suis arrivé par ce lien (ou je colle le lien / le pseudo de mon parrain) : je deviens filleul, si mon compte est neuf */
  referralClaim(code: string): Promise<{ status: 'ok' | 'already' | 'invalid' | 'self' | 'tooLate'; packs?: number; referrer?: string }>;
  // tableau d'offres (lot T) — ouvert à tous les joueurs
  /** (lot fluidité 5) la page à l'écran affiche la liste du club → suivie en temps réel ; sinon non. Absent en démo. */
  watchMembers?(on: boolean, who?: string): void;
  /** Annonces ouvertes de tout le monde (temps réel) ; renvoie de quoi se désabonner. */
  watchBoard(cb: (listings: ListingView[]) => void): () => void;
  /** MARCHÉ (retours Hugo 10/11) : cartes à prix fixe, en pièces (temps réel) */
  watchMarket(cb: (b: MarketBoard) => void): () => void;
  /** met UNE carte en vente (elle quitte la collection jusqu'à la vente ou au retrait) */
  marketSell(cardId: string, rarity: RarityId, price: number): Promise<void>;
  marketCancel(id: string): Promise<void>;
  /** `price` : le prix affiché (refusé s'il a changé entre-temps) */
  marketBuy(id: string, price: number): Promise<void>;
  createListing(items: TradeItem[], wanted: Array<{ cardId: string; rarity: RarityId }>, note: string | undefined, hours: number): Promise<void>;
  cancelListing(id: string): Promise<void>;
  /** Faire (ou refaire : remplace la précédente) une offre sur l'annonce d'un autre. */
  makeOffer(listingId: string, offered: TradeItem[], note?: string): Promise<void>;
  withdrawOffer(id: string): Promise<void>;
  acceptOffer(id: string): Promise<void>;
  declineOffer(id: string): Promise<void>;
  counterOffer(id: string, give: TradeItem[], want: TradeItem[], note?: string): Promise<void>;
  /** L'offrant répond à la contre-offre de l'auteur. */
  respondCounter(id: string, accept: boolean): Promise<void>;
}

export interface ContractResult {
  cardId: string;
  cardName: string;
  rarity: RarityId;
  mintNumber: number;
  isNew: boolean;
}

import type { SurveyAnswer, SurveyResults } from '../core/survey';

/** Suggestions des joueurs (onglet Suggestions, convex/suggestions.ts) */
export type SuggestionKind = 'bug' | 'design' | 'ajout' | 'autre';
export type SuggestionStatus = 'nouvelle' | 'vue' | 'acceptee' | 'refusee' | 'traitee';
export interface SuggestionInput {
  kind: SuggestionKind;
  text: string;
  cardId?: string;
  imageUrl?: string;
  category?: string;
  page?: string;
}
export interface SuggestionView {
  id: string;
  kind: SuggestionKind;
  text: string;
  cardId?: string;
  imageUrl?: string;
  screenshotUrl?: string;
  category?: string;
  status: SuggestionStatus;
  adminNote?: string;
  page?: string;
  ua?: string;
  author?: string;
  createdAt: number;
  updatedAt: number;
}

export const cardKey = (c: { cardId: string; rarity: string }) => `${c.cardId}:${c.rarity}`;

const SIGS = new WeakMap<readonly PlayerCard[], string>();
/**
 * Empreinte de la collection : les vues ne se redessinent que si elle change (en ligne, le serveur pousse aussi les
 * présences des amis, le fil… : sans ce garde-fou, la grille entière serait refaite à chaque petite mise à jour).
 * Mémorisée par tableau (audit PERF2-08) : les deux backends remplacent `state.collection` quand la collection change,
 * et seulement dans ce cas — elle n'est plus recalculée 4 à 5 fois sur toute la collection à chaque mise à jour.
 */
export function collectionSig(s: GameState): string {
  const hit = SIGS.get(s.collection);
  if (hit !== undefined) return hit;
  let n = 0;
  let h = 0;
  for (const c of s.collection) {
    n += c.count;
    const k = `${c.cardId}:${c.rarity}:${c.count}`;
    for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) | 0;
  }
  const sig = `${s.collection.length}/${n}/${h}`;
  SIGS.set(s.collection, sig);
  return sig;
}
