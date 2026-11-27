import type { RarityId } from '../core/rarity';
import type { AchievementStats, EconState, StakeItem } from '../core/economy';
import type { WeeklyState } from '../core/weekly';
import type { GameCard, PackChoice, RouletteColor, Stake } from '../core/games';
import type { JeuxBackend } from './ecoJeux';
import type { ExtrasBackend } from './ecoExtras';
import type { MsgParams } from '../core/msgRefs';

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
  /** modérateur des suggestions (Hugo, Tom, admins) et nombre de nouvelles suggestions */
  isModerator?: boolean;
  suggestionsNew?: number;
  /** achat de boosters en pièces : prix unitaire et achats encore possibles aujourd'hui */
  packShop: { price: number; left: number };
  /** (20/11) calendrier de l'Avent (src/core/avent.ts) : cases ouvertes cette année, god packs offerts en attente */
  advent?: { opened: number[]; godPacks: number };
  /** (20/11) abonnement (src/core/abo.ts) : fin du mois payé (0 : jamais abonné), demande « j'ai payé » en attente */
  sub?: { until: number; askedAt: number; /** (25/11, V3) jour de la dernière mise gratuite à la roulette */ freeDay?: string };
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
  /** (08/11) boosters par joueur (absent = 1) */
  packCount?: number;
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
  /** (23/11) couleur posée sur ses numéros (mise payée deux fois) : pot de secours */
  color?: RouletteColor;
  /** (25/11, V3) mise gratuite du jour d'un abonné */
  free?: boolean;
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
  past: Array<{ id: string; day: string; result?: { number: number; winnerId?: string; winnerName?: string; potValue: number; byColor?: boolean }; drawnAt?: number; bets: Array<{ userId: string; name: string; numbers: number[]; color?: RouletteColor }> }>;
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
  /** (version anglaise, lot 4) code + paramètres du libellé (src/core/msgs.ts) */
  labelKey?: string;
  labelParams?: MsgParams;
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

export interface EcoBackend extends JeuxBackend, ExtrasBackend {
  readonly snapshot: EcoSnapshot | null;
  onChange(fn: (s: EcoSnapshot | null) => void): () => void;
  claimCalendar(): Promise<{ day: number; coins: number; packs: number }>;
  /** achète `count` boosters (réserve) avec des pièces */
  buyPacks(count: number): Promise<{ packs: number; left: number }>;
  claimWeekly(id: string): Promise<number>;
  /** `coins` = pièces versées ; (v2.1.39) `value` = valeur de la table (plus grande si le rendement du jour a baissé) */
  burn(items: StakeItem[]): Promise<{ coins: number; count: number; value?: number }>;
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
  createRoyale(pack: PackChoice, packCount?: number): Promise<string>;
  joinRoyale(id: string, pack: PackChoice): Promise<void>;
  leaveRoyale(id: string): Promise<void>;
  startRoyale(id: string): Promise<void>;
  /** (23/11) `color` : une couleur sur ses numéros, la mise payée deux fois (pot de secours) */
  /** (25/11, V3) `free` : la mise gratuite du jour d'un abonné (un numéro, sans couleur ni mise) */
  placeBet(numbers: number[], stake: Stake, color?: RouletteColor, free?: boolean): Promise<void>;
  // admin
  alerts(): Promise<AbuseAlertView[]>;
  review(key: string, verdict: 'ok' | 'watch', note?: string): Promise<void>;
  /** démo seulement : lance le tirage de la roulette tout de suite */
  demoDraw?(): Promise<void>;
}
