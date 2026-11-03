import type { RarityId } from '../core/rarity';
import type { AchievementStats, EconState, StakeItem } from '../core/economy';
import type { WeeklyState } from '../core/weekly';
import type { GameCard, PackChoice, Stake } from '../core/games';

/**
 * ÉCONOMIE + ESPACE JEUX côté client : même interface en ligne (ecoOnline.ts, serveur Convex) et en démo
 * (ecoLocal.ts, tout dans le navigateur, adversaires robots). Règles : src/core/economy.ts et src/core/games.ts.
 */

export interface EcoSnapshot {
  coins: number;
  econ: EconState;
  /** calendrier de connexion (30 jours) : jour, cadeau, déjà pris aujourd'hui ? */
  calendar: { day: number; today: string; claimed: boolean; reward: { coins: number; packs: number } };
  weekly: WeeklyState & { resetAt: number };
  /** primes de complétion en attente */
  completions: Array<{ id: string; label: string; kind: string; size: number; reward: number }>;
  achievements: { stats: AchievementStats; claimable: string[] };
  isAdmin: boolean;
}

export interface DuelSideView {
  userId: string;
  name: string;
  avatarUrl?: string;
  packs: PackChoice[];
  stake: Stake;
  ready: boolean;
  bot?: boolean;
}

export interface DuelView {
  id: string;
  creatorId: string;
  invitedId?: string;
  status: 'open' | 'done' | 'cancelled';
  sides: DuelSideView[];
  result?: { packs: GameCard[][][]; stars: number[]; winner?: number };
  createdAt: number;
  resolvedAt?: number;
}

export interface RoyaleView {
  id: string;
  creatorId: string;
  status: 'open' | 'done' | 'cancelled';
  players: Array<{ userId: string; name: string; avatarUrl?: string; pack: PackChoice; bot?: boolean }>;
  result?: { packs: GameCard[][]; stars: number[]; winners: number[]; awarded: GameCard[][] };
  createdAt: number;
  resolvedAt?: number;
}

export interface PotCard {
  cardId: string;
  rarity: RarityId;
  count: number;
  mintNumber: number;
}

export interface RouletteBet {
  userId: string;
  name: string;
  avatarUrl?: string;
  numbers: number[];
  coins: number;
  cards: PotCard[];
}

export interface RouletteView {
  round: {
    id: string;
    day: string;
    carriedCoins: number;
    carriedCards: PotCard[];
    houseCards: GameCard[];
    bets: RouletteBet[];
    pot: { coins: number; cards: PotCard[]; value: number };
    drawAt: number;
  } | null;
  nextDrawAt: number;
  me: string | null;
  past: Array<{ id: string; day: string; result?: { number: number; winnerId?: string; winnerName?: string; potValue: number }; drawnAt?: number; bets: Array<{ userId: string; name: string; numbers: number[] }> }>;
}

export interface LobbyView {
  duels: DuelView[];
  royales: RoyaleView[];
  me: string;
}

export interface CoinTx {
  id: string;
  amount: number;
  reason: string;
  label: string;
  createdAt: number;
}

export interface AbuseAlertView {
  key: string;
  kind: string;
  title: string;
  detail: string;
  value: number;
  users: string[];
  verdict?: 'ok' | 'watch';
  note?: string;
}

export interface FriendAch {
  userId: string;
  name: string;
  avatarUrl?: string;
  me: boolean;
  stats: AchievementStats;
}

export interface EcoBackend {
  readonly snapshot: EcoSnapshot | null;
  onChange(fn: (s: EcoSnapshot | null) => void): () => void;
  claimCalendar(): Promise<{ day: number; coins: number; packs: number }>;
  claimWeekly(id: string): Promise<number>;
  burn(items: StakeItem[]): Promise<{ coins: number; count: number }>;
  claimCompletions(): Promise<{ coins: number; sets: Array<{ id: string; label: string; reward: number }> }>;
  claimAchievements(): Promise<{ coins: number; packs: number; ids: string[] }>;
  coinHistory(): Promise<CoinTx[]>;
  /** succès : moi + mes amis, compteurs des succès à paliers (retours live 02, §9) */
  friendsAchievements(): Promise<FriendAch[]>;
  // jeux
  watchLobby(cb: (l: LobbyView | null) => void): () => void;
  watchDuel(id: string, cb: (d: DuelView | null) => void): () => void;
  watchRoyale(id: string, cb: (r: RoyaleView | null) => void): () => void;
  watchRoulette(cb: (r: RouletteView | null) => void): () => void;
  gameHistory(): Promise<{ duels: DuelView[]; royales: RoyaleView[] }>;
  createDuel(packs: PackChoice[], stake: Stake, invitedId?: string): Promise<string>;
  setDuelSide(id: string, packs: PackChoice[], stake: Stake): Promise<void>;
  leaveDuel(id: string): Promise<void>;
  readyDuel(id: string): Promise<{ locked: boolean }>;
  createRoyale(pack: PackChoice): Promise<string>;
  joinRoyale(id: string, pack: PackChoice): Promise<void>;
  leaveRoyale(id: string): Promise<void>;
  startRoyale(id: string): Promise<void>;
  placeBet(numbers: number[], stake: Stake): Promise<void>;
  // admin
  alerts(): Promise<AbuseAlertView[]>;
  review(key: string, verdict: 'ok' | 'watch', note?: string): Promise<void>;
  /** démo seulement : lance le tirage de la roulette tout de suite */
  demoDraw?(): Promise<void>;
}
