import type { RarityId } from '../core/rarity';
import type { PackRequest } from '../core/packRoll';
import { applyRegen, type RegenState } from '../core/packRegen';
import type { MissionsState } from '../core/missions';
import type { StreakState } from '../core/streak';

/** Une ligne de collection : (carte, rareté) → nombre d'exemplaires. */
export interface PlayerCard {
  cardId: string;
  rarity: RarityId;
  count: number;
  bestMintNumber: number;
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
}

/** Profil public (vitrine, devise, statistiques de base). */
export interface Profile {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  /** cartes choisies pour la vitrine (vide = les meilleures, automatiquement) */
  showcase: Array<{ cardId: string; rarity: RarityId }>;
  packsOpened: number;
  joinedAt?: number;
}

export interface GameBackend {
  readonly state: GameState;
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
  claimMission(id: string): Promise<number>;
  claimMissionBonus(): Promise<number>;
  rerollMission(id: string): Promise<void>;
  /** profil d'un joueur (moi : state.user.id) */
  profile(userId: string): Promise<Profile | null>;
  setShowcase(cards: Array<{ cardId: string; rarity: RarityId }>): Promise<void>;
  setBio(bio: string): Promise<void>;
  /** Contrat : brûle des doublons d'une étoile contre une carte de l'étoile au-dessus. */
  signContract(rarity: RarityId, items: Array<{ cardId: string; count: number }>): Promise<ContractResult>;
  /** Envies : marque / retire une carte (state.wishlist suit). */
  toggleWish(cardId: string): Promise<void>;
  /** Récompense de la série de connexion (jour 7) : boosters gagnés. */
  claimStreak(): Promise<number>;
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
