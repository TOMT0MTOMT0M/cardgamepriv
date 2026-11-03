import type { RarityId } from '../core/rarity';
import type { PackRequest } from '../core/packRoll';
import { applyRegen, type RegenState } from '../core/packRegen';
import type { MissionsState } from '../core/missions';
import type { StreakState } from '../core/streak';
import type { CosmeticChoice, PlayerStats } from '../core/cosmetics';
import type { EcoBackend } from './eco';

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
  for (const t of s.trades.outgoing) for (const it of t.offered) out.set(cardKey(it), (out.get(cardKey(it)) ?? 0) + it.count);
  return out;
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
  totalPacksOpened: number;
  /** pity 6★ : boosters d'affilée sans Mythique (src/core/pity.ts) */
  pityCount: number;
  /** série de connexion (src/core/streak.ts) — telle qu'enregistrée côté serveur */
  streak?: StreakState;
}

/** Réserve de boosters à l'instant présent (le compte à rebours de l'en-tête l'appelle chaque seconde). */
export const liveRegen = (u: Me, now = Date.now()): RegenState => applyRegen(u.packStored, u.packRegenAt, now);

export interface GameState {
  /** `online` : serveur Convex + Discord · `demo` : tout dans ce navigateur, amis robots */
  mode: 'online' | 'demo';
  /** premières données reçues */
  ready: boolean;
  user: Me | null;
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
}

/** Profil public (vitrine, devise, cosmétiques, statistiques enrichies). */
export interface Profile {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  /** cartes choisies pour la vitrine (vide = les meilleures, automatiquement) */
  showcase: Array<{ cardId: string; rarity: RarityId }>;
  packsOpened: number;
  joinedAt?: number;
  /** classeur épinglé (visible des potes) */
  pinnedBinder?: { id: string; name: string; cards: Array<{ cardId: string; rarity: RarityId }>; coverCardId?: string } | null;
  /** bannière, cadre, titre, badges (déjà filtrés : seulement du débloqué) */
  cosmetics?: CosmeticChoice;
  stats?: PlayerStats;
  /** jour de la série dans le cycle (1..7) */
  streakDay?: number;
  bestDrop?: { cardId: string; rarity: RarityId; mintNumber: number } | null;
  themes?: Array<{ id: string; have: number; total: number }>;
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

export interface GameBackend {
  readonly state: GameState;
  /** pièces, sources de pièces et espace Jeux (eco.ts) */
  readonly eco: EcoBackend;
  onChange(fn: (s: GameState) => void): () => void;
  login(): void;
  logout(): Promise<void>;
  /** Tire (ou rend, s'il y en a un non ouvert) un booster scellé. */
  preparePack(req: PackRequest): Promise<SealedPack>;
  /** Fin de l'ouverture : crédite la collection, annonce les belles cartes. */
  revealPack(id: string): Promise<void>;
  friendCollection(friendId: string): Promise<PlayerCard[]>;
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
}

export interface ContractResult {
  cardId: string;
  cardName: string;
  rarity: RarityId;
  mintNumber: number;
  isNew: boolean;
}

export const cardKey = (c: { cardId: string; rarity: string }) => `${c.cardId}:${c.rarity}`;

/**
 * Empreinte de la collection : les vues ne se redessinent que si elle change (en ligne, le serveur pousse aussi les
 * présences des amis, le fil… : sans ce garde-fou, la grille entière serait refaite à chaque petite mise à jour).
 */
export function collectionSig(s: GameState): string {
  let n = 0;
  let h = 0;
  for (const c of s.collection) {
    n += c.count;
    const k = `${c.cardId}:${c.rarity}:${c.count}`;
    for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) | 0;
  }
  return `${s.collection.length}/${n}/${h}`;
}
